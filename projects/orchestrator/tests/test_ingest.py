"""The OCR path end to end, with the model replaced by a reader that answers from the fixtures.

Each case goes in with every document "unknown", no fields and no owner, as after an upload. If classify, extract,
normalization and owner matching are wired correctly, the checks must raise exactly the expected flags.
"""
import json
import re
from datetime import date

import pytest

from nexxt_orchestrator import ingest
from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

DATA = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"
CASES = sorted((DATA / "PF" / "data" / "gigel" / "cases").glob("case_pf_*")) + sorted((DATA / "PJ" / "cases").glob("case_pj_*"))
PLAYBOOKS = REPO_ROOT / "projects" / "playbook-builder" / "fallback"


def printed(field) -> object:
    """What the model would read off the page: the printed text, or the list of people."""
    if field.name in ingest.PERSON_LISTS:
        return json.loads(field.value) if isinstance(field.value, str) else field.value
    if isinstance(field.value, dict):  # money, e.g. deductions printed as one total
        number = f"{field.value['amount']:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
        return f"{number} {field.value['currency']}"  # Romanian style: 3.320,00 RON
    return field.raw_text.replace("\n", " ")


@pytest.fixture
def fake_model(monkeypatch):
    truth = {}

    def ocr_pages(case, doc):
        return [f"[{doc.doc_id}]"]

    def ask_json(system, user):
        doc_id = re.search(r"\[(doc_\d+)\]", user).group(1)
        doc = truth[doc_id]
        if system == ingest.CLASSIFY_PROMPT:
            return {"doc_type": doc.doc_type, "confidence": 0.97}
        asked = json.loads(user.split("Requested fields: ", 1)[1].split("\n", 1)[0])
        return {n: ({"value": printed(doc.fields[n]), "raw_text": doc.fields[n].raw_text} if n in doc.fields else None)
                for n in asked}

    monkeypatch.setenv("FEATHERLESS_API_KEY", "test")
    monkeypatch.setattr(ingest, "ocr_pages", ocr_pages)
    monkeypatch.setattr(ingest, "ask_json", ask_json)
    return truth


@pytest.mark.parametrize("case_dir", CASES, ids=lambda p: p.name)
def test_uploaded_case_read_by_ocr_gives_the_expected_flags(tmp_path, monkeypatch, fake_model, case_dir):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(case_dir.parent))
    case = CaseFile.model_validate(json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    fake_model.update({d.doc_id: d.model_copy(deep=True) for d in case.documents})
    owners = {d.doc_id: d.owner_person_id for d in case.documents}
    for doc in case.documents:
        doc.doc_type, doc.classification_confidence, doc.owner_person_id, doc.fields = "unknown", 0.0, None, {}

    playbooks = PlaybookStore([PLAYBOOKS])
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), playbooks, today=lambda: date(2026, 10, 28))
    orch.set_ingest(*ingest.make_ingest(playbooks))
    orch.submit(case)
    done = orch.process(case.case_id)

    assert {d.doc_id: d.owner_person_id for d in done.documents} == owners
    assert all(f.source.bbox == ingest.WHOLE_PAGE for d in done.documents for f in d.fields.values())
    expected = {f["rule_id"] for f in json.loads((case_dir / "expected_flags.json").read_text(encoding="utf-8"))}
    extra_screening = {"R-PJ-022", "R-PJ-025"} if case_dir.name == "case_pj_08_identitate_ubo_lipsa" else set()
    assert {f.rule_id for f in done.flags} == expected | extra_screening


def test_unknown_answer_from_the_model_stays_unknown(tmp_path, monkeypatch, fake_model):
    monkeypatch.setattr(ingest, "ask_json", lambda system, user: {"doc_type": "selfie_with_cat", "confidence": 2})
    case = CaseFile.model_validate(json.loads((CASES[0] / "case_file.extracted.json").read_text(encoding="utf-8")))
    doc = case.documents[0]
    classify, _ = ingest.make_ingest(PlaybookStore([PLAYBOOKS]))
    classify(case, doc)
    assert doc.doc_type == "unknown" and doc.classification_confidence == 1.0


@pytest.mark.parametrize("text, iso", [
    ("2034-01-15", "2034-01-15"), ("15.01.2034", "2034-01-15"), ("15/01/2034", "2034-01-15"),
    ("Valabil până la 19.07.2031", "2031-07-19"), ("14.12.01", "2001-12-14"), ("14.12.88", "1988-12-14"),
    ("31.02.2030", None), ("ieri", None),
])
def test_dates_are_normalized_to_iso(text, iso):
    assert ingest.norm_date(text, today=date(2026, 10, 28)) == iso


@pytest.mark.parametrize("text, money", [
    ("4.680,00 RON", {"amount": 4680, "currency": "RON"}), ("1,234.50 EUR", {"amount": 1234.5, "currency": "EUR"}),
    ("8.000 lei", {"amount": 8000, "currency": "RON"}), ("520,5", {"amount": 520.5, "currency": "RON"}),
    ("Total: 3.320,00.", {"amount": 3320, "currency": "RON"}),
    ("fără", None),
])
def test_money_is_normalized(text, money):
    assert ingest.norm_money(text) == money


def test_captions_copied_by_the_model_are_dropped():
    # Seen with Qwen3-VL on case_pf_03: the label came along with the value.
    assert ingest.clean_raw("VALABIL PÂNĂ LA\n2025-01-15") == "2025-01-15"
    assert ingest.clean_raw("NUME DE FAMILIE\nExemplu\n\nPRENUME\nMara") == "Exemplu Mara"
    assert ingest.clean_raw("NUMĂR DOCUMENT SPECIMEN\nDX 900811") == "DX 900811"
    assert ingest.clean_raw("ATELIER EXEMPLU DEMO SRL") == "ATELIER EXEMPLU DEMO SRL"  # an all-caps value alone stays


@pytest.mark.parametrize("answer, doc_type", [
    ("id_card", "id_card"), ("identity_card", "id_card"), ("Identity Card", "id_card"), ("carte de identitate", "id_card"),
    ("utility_bill", "proof_of_address"), ("Factură utilități", "proof_of_address"), ("pay-slip", "payslip"),
    ("certificat_constatator", "unknown"),  # a real type, but not one this PF playbook expects
    ("selfie_with_cat", "unknown"), (None, "unknown"),
])
def test_model_type_names_are_mapped_to_the_contract(answer, doc_type):
    assert ingest.to_doc_type(answer, ["id_card", "passport", "proof_of_address", "payslip", "income_certificate"]) == doc_type


@pytest.mark.parametrize("answer", [
    '{"doc_type": "id_card"}', '```json\n{"doc_type": "id_card"}\n```', 'Here is the data:\n{"doc_type": "id_card"}\nDone.',
])
def test_the_json_object_is_found_around_extra_text(answer):
    assert ingest.parse_object(answer) == {"doc_type": "id_card"}


def test_an_answer_without_json_is_a_service_error_not_a_crash():
    with pytest.raises(RuntimeError):
        ingest.parse_object("I cannot read this document.")


@pytest.mark.parametrize("text, iso", [
    ("15 ian. 2034", "2034-01-15"), ("15 ianuarie 2034", "2034-01-15"), ("3 Noiembrie 2026", "2026-11-03"),
    ("15.I.2034", "2034-01-15"), ("1 mai 2030", "2030-05-01"), ("15 xyz 2034", None),
])
def test_dates_with_month_names(text, iso):
    assert ingest.norm_date(text) == iso


def test_a_printed_validity_range_is_quoted_as_the_one_date_used():
    # Seen with Qwen3-VL on an old Romanian ID: "Validitate 14.12.01-19.07.2011".
    assert ingest.date_text("14.12.01-19.07.2011", "2011-07-19") == "19.07.2011"
    assert ingest.date_text("2034-01-15", "2034-01-15") == "2034-01-15"
    assert ingest.date_text("ieri", "ieri") == "ieri"


def test_people_given_as_a_sentence_with_percent_signs():
    people, _ = ingest.normalize("ubos", "Tudor Exemplu 60%, Irina Model 40%")
    assert people == [{"full_name": "Tudor Exemplu", "ownership_pct": 60}, {"full_name": "Irina Model", "ownership_pct": 40}]
    listed, _ = ingest.normalize("ubos", [{"full_name": "Tudor Exemplu (asociat)", "ownership_pct": "60 %"}])
    assert listed == [{"full_name": "Tudor Exemplu", "ownership_pct": 60}]


def test_owner_is_found_despite_diacritics_and_notes_in_brackets():
    case = CaseFile.model_validate(json.loads((DATA / "PJ" / "cases" / "case_pj_00_corect_control" / "case_file.extracted.json").read_text(encoding="utf-8")))
    playbook = PlaybookStore([PLAYBOOKS]).get(case.playbook_id)
    doc = next(d for d in case.documents if d.owner_person_id == "p_sign" and d.doc_type == "id_card")
    doc.owner_person_id = None
    doc.fields["full_name"].value = "TÉST VICTOR (delegat)"
    assert ingest.owner_of(case, playbook, doc) == "p_sign"


def test_unreadable_values_are_kept_as_printed_so_the_checks_report_them():
    assert ingest.normalize("expiry_date", "ieri") == ("ieri", "date")
    assert ingest.normalize("cnp", "CNP 2920312408117") == ("2920312408117", "cnp")
    people, _ = ingest.normalize("ubos", [{"full_name": " Tudor Exemplu ", "cnp": "185 0520 408137", "ownership_pct": 60}, {"cnp": "1"}])
    assert people == [{"full_name": "Tudor Exemplu", "cnp": "1850520408137", "ownership_pct": 60}]
