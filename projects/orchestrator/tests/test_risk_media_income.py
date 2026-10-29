"""Risk draft from real factors, adverse media, company screening, declared income against deposits, and the
screening detail/confirm flow. Each test starts from a labelled clean case and changes one fact."""
import json
import os
import tempfile
from datetime import date

os.environ.setdefault("NEXXT_RUNS_DIR", tempfile.mkdtemp(prefix="nexxt_api_"))

import pytest
from fastapi.testclient import TestClient

from nexxt_orchestrator.api import app
from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks.cross_check import income_vs_deposits
from nexxt_orchestrator.checks import CheckContext
from nexxt_orchestrator.models import CaseFile, Document, ExtractedField, Rule, Source, SourceRef
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

DATA = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"
PF0 = DATA / "PF" / "data" / "gigel" / "cases" / "case_pf_00_corect_control"
PJ0 = DATA / "PJ" / "cases" / "case_pj_00_corect_control"


def load(case_dir) -> CaseFile:
    case = CaseFile.model_validate(json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    return case


@pytest.fixture
def run(tmp_path, monkeypatch):
    def go(case_dir, change=lambda case: None):
        monkeypatch.setenv("NEXXT_DOCS_DIR", str(case_dir))
        case = load(case_dir)
        change(case)
        orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore(), today=lambda: date(2026, 10, 28))
        orch.submit(case)
        return orch, orch.process(case.case_id)
    return go


def field(case, doc_type, name):
    return next(d for d in case.documents if d.doc_type == doc_type).fields[name]


def rename(case, person_id, name, doc_type="id_card"):
    next(p for p in case.persons if p.person_id == person_id).full_name = name
    for d in case.documents:
        if d.owner_person_id == person_id and "full_name" in d.fields:
            d.fields["full_name"].value = d.fields["full_name"].raw_text = name


# --- risk -------------------------------------------------------------------------------------------------------

def test_clean_case_is_low_risk_and_says_why(run):
    _, done = run(PF0)
    assert done.risk_draft.level == "low" and done.risk_draft.is_draft
    assert any("RO" in r.text for r in done.risk_draft.reasons)


def test_a_missing_document_is_not_client_risk(run):
    _, done = run(DATA / "PF" / "data" / "gigel" / "cases" / "case_pf_01_factura_lipsa")
    assert done.risk_draft.level == "low"
    assert any("așteptare" in r.text and r.flag_ids for r in done.risk_draft.reasons)


def test_occupation_in_a_risky_field_raises_the_grade(run):
    def casino(case):
        field(case, "payslip", "employer").value = "Royal Cazino Demo SRL"
    _, done = run(PF0, casino)
    assert done.risk_draft.level == "high" and any("cazino" in r.text for r in done.risk_draft.reasons)


def test_high_risk_caen_code_raises_a_company(run):
    def gambling(case):
        field(case, "certificat_constatator", "caen_code").value = "9200"
    _, done = run(PJ0, gambling)
    assert done.risk_draft.level == "high" and any("9200" in r.text for r in done.risk_draft.reasons)


def test_pep_match_makes_the_draft_high(run):
    pep = json.loads((REPO_ROOT / "data" / "mock_registries" / "pep_list.json").read_text(encoding="utf-8"))[0]

    def politician(case):
        rename(case, "p_pf", pep["nume_complet"])
        field(case, "id_card", "date_of_birth").value = f"{pep['anul_nasterii']}-01-01"
        field(case, "id_card", "cnp").value = None
    _, done = run(PF0, politician)
    pep_flags = [f.flag_id for f in done.flags if "PEP" in f.title]
    assert pep_flags and done.risk_draft.level == "high"
    assert any(set(pep_flags) <= set(r.flag_ids) for r in done.risk_draft.reasons)


# --- adverse media and company screening ---------------------------------------------------------------------------

def test_adverse_media_on_a_person(run):
    _, done = run(PF0, lambda case: rename(case, "p_pf", "Sorin Cobalt Fictiv"))
    media = [f for f in done.flags if f.rule_id == "R-PF-015"]
    assert media and "NEWS-DEMO-001" in media[0].explanation and media[0].person_id == "p_pf"
    assert not media[0].client_fixable


def test_the_company_itself_is_screened(run):
    def renamed(case):
        case.company["name"] = "FICTIV TRADE HOLDING S.R.L."
    _, done = run(PJ0, renamed)
    rules = {f.rule_id for f in done.flags}
    assert "R-PJ-020" in rules  # sanctions on the company
    assert "R-PJ-026" in rules  # adverse media on the company


def test_a_person_never_matches_a_company_entry(run):
    _, done = run(PF0, lambda case: rename(case, "p_pf", "Fictiv Trade Holding"))
    assert not [f for f in done.flags if f.stage == "screening"]


# --- income against deposits ---------------------------------------------------------------------------------------

def money_field(doc_id, name, value):
    return ExtractedField(field_id=f"{doc_id}_{name}", name=name, value=value, value_type="money", raw_text=str(value),
                          confidence=1.0, source=Source(doc_id=doc_id, page=1, bbox=[0.1, 0.1, 0.3, 0.12]), extracted_by="test")


@pytest.mark.parametrize("deposits, flagged", [
    ([{"amount": 4600, "currency": "RON"}, {"amount": 4700, "currency": "RON"}], False),
    ([{"amount": 2000, "currency": "RON"}], True),
    ([{"amount": 4680, "currency": "EUR"}], True),
])
def test_income_vs_deposits(deposits, flagged):
    case = load(PF0)
    statement = Document(doc_id="doc_009", file="x.pdf", mime_type="application/pdf", pages=1, uploaded_at=case.created_at,
                         doc_type="bank_statement", owner_person_id="p_pf",
                         fields={"salary_deposits": money_field("doc_009", "salary_deposits", deposits)})
    case.documents.append(statement)
    rule = Rule(rule_id="R-T-001", stage="cross_check", check="income_vs_deposits", params={"tolerance_pct": 10},
                applies_to="applicant", severity="high", description="d", client_fixable=False,
                source_ref=SourceRef(page=1, quote="q"))
    ctx = CheckContext(case=case, playbook=PlaybookStore().get(case.playbook_id), rule=rule, today=date(2026, 10, 28))
    flags = income_vs_deposits(ctx)
    assert bool(flags) == flagged
    if flags:
        assert {e.doc_id for e in flags[0].evidence} == {"doc_003", "doc_009"}


# --- the analyst's screening view over HTTP ----------------------------------------------------------------------------

client = TestClient(app)


def test_screening_detail_and_confirmation_over_http(monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF0))
    case = json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8"))
    case.update(case_id="case_media_http", flags=[], risk_draft=None, decision=None)
    case["persons"][0]["full_name"] = "Sorin Cobalt Fictiv"
    for doc in case["documents"]:
        if "full_name" in doc["fields"]:
            doc["fields"]["full_name"]["value"] = doc["fields"]["full_name"]["raw_text"] = "Sorin Cobalt Fictiv"
    assert client.post("/cases", json=case).status_code == 200
    flags = client.post("/cases/case_media_http/process").json()["flags"]
    media = next(f for f in flags if f["rule_id"] == "R-PF-015")
    detail = client.get(f"/cases/case_media_http/flags/{media['flag_id']}/screening", headers={"X-Analyst": "maria"}).json()
    assert detail["entry"]["id_stire"] == "NEWS-DEMO-001" and detail["client"]["name"] == "Sorin Cobalt Fictiv"
    assert 90 <= detail["score"] <= 100

    assert client.get("/cases/case_media_http/flags/flag_999/screening", headers={"X-Analyst": "maria"}).status_code == 404
    done = client.post(f"/cases/case_media_http/flags/{media['flag_id']}/confirm", json={"note": "same person, press article checked"},
                       headers={"X-Analyst": "maria"}).json()
    confirmed = next(f for f in done["flags"] if f["flag_id"] == media["flag_id"])
    assert confirmed["status"] == "open" and confirmed["resolution_note"].startswith("confirmed by maria")
    assert client.post("/cases/case_media_http/decision", json={"outcome": "approved"}, headers={"X-Analyst": "maria"}).status_code == 403
