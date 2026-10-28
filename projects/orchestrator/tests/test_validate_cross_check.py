import json
from datetime import date

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks.cross_check import same, values_of
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

DATA = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"
CASES = sorted((DATA / "PF" / "data" / "gigel" / "cases").glob("case_pf_*")) + sorted((DATA / "PJ" / "cases").glob("case_pj_*"))
PLAYBOOKS = REPO_ROOT / "projects" / "playbook-builder" / "fallback"
CHECKS = {"fields_match", "max_age_days", "field_present"}


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([PLAYBOOKS]), today=lambda: date(2026, 10, 28))


def run(orch, case_dir, mutate=None):
    case = CaseFile.model_validate(json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    if mutate:
        mutate(case)
    orch.submit(case)
    done = orch.process(case.case_id)
    rules = {r.rule_id: r.check for r in orch.playbooks.get(case.playbook_id).rules}
    return done, [f for f in done.flags if rules[f.rule_id] in CHECKS]


@pytest.mark.parametrize("case_dir", CASES, ids=lambda p: p.name)
def test_every_planted_error_is_caught_and_nothing_else(orch, case_dir):
    rules = {r["rule_id"]: r["check"] for pb in PLAYBOOKS.glob("pb_cont_*.json")
             for r in json.loads(pb.read_text(encoding="utf-8"))["rules"]}
    expected = {f["rule_id"] for f in json.loads((case_dir / "expected_flags.json").read_text(encoding="utf-8"))
                if rules[f["rule_id"]] in CHECKS}
    _, flags = run(orch, case_dir)
    assert {f.rule_id for f in flags} == expected


def test_mismatch_points_at_both_values_and_asks_the_client(orch):
    done, [flag] = run(orch, DATA / "PF" / "data" / "gigel" / "cases" / "case_pf_04_nume_factura_diferit")
    assert flag.rule_id == "R-PF-008" and flag.client_fixable
    assert {e.doc_id for e in flag.evidence} == {"doc_001", "doc_002"}
    assert "Mara Exemplu" in flag.explanation and "Eliza Probă" in flag.explanation
    assert "Numele de pe documente nu coincide" in flag.fix_message


def test_administrator_is_compared_with_the_company_certificat(orch):
    _, [flag] = run(orch, DATA / "PJ" / "cases" / "case_pj_10_administrator_diferit")
    assert flag.rule_id == "R-PJ-011" and flag.person_id == "p_admin"
    assert "Daria Model" in flag.explanation and "Elena Probă" in flag.explanation


def test_old_certificat_reports_its_age(orch):
    _, [flag] = run(orch, DATA / "PJ" / "cases" / "case_pj_02_certificat_vechi")
    assert flag.rule_id == "R-PJ-002" and "the procedure accepts at most 30 days" in flag.explanation


def test_unreadable_date_is_flagged_not_passed(orch):
    def garble(case):
        cert = next(d for d in case.documents if d.doc_type == "certificat_constatator")
        cert.fields["issue_date"].value = "ieri"
    _, [flag] = run(orch, DATA / "PJ" / "cases" / "case_pj_00_corect_control", garble)
    assert flag.rule_id == "R-PJ-002" and flag.title.startswith("certificat_constatator date cannot be read")


def test_missing_field_is_flagged_even_when_never_extracted(orch):
    def drop(case):
        declaration = next(d for d in case.documents if d.doc_type == "ubo_declaration")
        del declaration.fields["signed_by"]
    _, [flag] = run(orch, DATA / "PJ" / "cases" / "case_pj_00_corect_control", drop)
    assert flag.rule_id == "R-PJ-005" and flag.evidence[0].doc_id == "doc_003"


def test_comparison_modes():
    assert same("987654310", "987654310", "exact") and not same("987654310", "987654328", "exact")
    assert same("Atelier Exemplu Demo S.R.L.", "ATELIER EXEMPLU DEMO SRL", "normalized")
    assert not same("Str. Exemplului nr. 12", "Str. Exemplului nr. 14", "normalized")
    assert same("Mara Exemplu", "EXEMPLU MARA", "fuzzy") and same("Probă Eliza", "Eliza Proba", "fuzzy")
    assert not same("Mara Exemplu", "Eliza Probă", "fuzzy")


def test_person_lists_are_read_natively_or_from_json_text():
    class F:
        def __init__(self, value):
            self.value = value
    people = [{"full_name": "Daria Model"}, {"full_name": "Victor Test"}]
    assert values_of(F(people)) == values_of(F(json.dumps(people))) == ["Daria Model", "Victor Test"]
