"""The upload gate: only the document a portal step asks for, in the accepted format, fully readable, joins the case."""
import copy
import json
from datetime import date

import pytest
from PIL import Image

from nexxt_orchestrator import gate, ingest
from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.gate import UploadRejected, check_content, check_format, check_resolution, cnp_is_valid, is_romanian
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

PF0 = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ" / "PF" / "data" / "gigel" / "cases" / "case_pf_00_corect_control"
ID_TEXT = "ROMANIA CARTE DE IDENTITATE\nNUME Exemplu\nPRENUME Mara\nCNP ...\nIDROUEXEMPLU<<MARA<<<<"


def case() -> CaseFile:
    return CaseFile.model_validate(json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8")))


def doc_of(c: CaseFile, doc_type: str):
    return copy.deepcopy(next(d for d in c.documents if d.doc_type == doc_type))


PLAYBOOK = PlaybookStore().get("pb_cont_pf_v1")


def rejected(fn) -> str:
    with pytest.raises(UploadRejected) as exc:
        fn()
    return exc.value.code


def test_identity_documents_may_be_photos_everything_else_must_be_pdf():
    check_format("id_card", "image/jpeg"); check_format("id_card", "image/png"); check_format("id_card", "application/pdf")
    check_format("payslip", "application/pdf")
    assert rejected(lambda: check_format("payslip", "image/png")) == "pdf_required"
    assert rejected(lambda: check_format("proof_of_address", "image/jpeg")) == "pdf_required"


def test_a_tiny_photo_is_not_clear(tmp_path):
    Image.new("RGB", (320, 240), "white").save(tmp_path / "small.png")
    Image.new("RGB", (900, 600), "white").save(tmp_path / "ok.png")
    assert rejected(lambda: check_resolution(tmp_path / "small.png", "image/png")) == "not_clear"
    check_resolution(tmp_path / "ok.png", "image/png")
    check_resolution(tmp_path / "small.png", "application/pdf")  # a PDF page has no pixel size to judge


def test_a_valid_romanian_id_passes():
    check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [ID_TEXT])


def test_another_document_or_any_photo_is_not_an_id():
    d = doc_of(case(), "id_card")
    d.doc_type = "unknown"
    assert rejected(lambda: check_content(d, "id_card", PLAYBOOK, ["a cat on a sofa"])) == "wrong_document"
    bill = doc_of(case(), "proof_of_address")
    assert rejected(lambda: check_content(bill, "id_card", PLAYBOOK, [ID_TEXT])) == "wrong_document"


def test_any_unreadable_text_means_the_photo_is_not_clear():
    msg = pytest.raises(UploadRejected, check_content, doc_of(case(), "id_card"), "id_card", PLAYBOOK, [ID_TEXT + "\nDomiciliu [illegible]"])
    assert msg.value.code == "not_clear" and msg.value.message.startswith("Fotografia nu este clară")


def test_a_key_field_not_read_off_the_page_means_not_clear():
    d = doc_of(case(), "id_card")
    del d.fields["expiry_date"]
    with pytest.raises(UploadRejected) as exc:
        check_content(d, "id_card", PLAYBOOK, [ID_TEXT])
    assert exc.value.code == "not_clear" and "data expirării" in exc.value.message
    guessed = doc_of(case(), "id_card")
    guessed.fields["cnp"].confidence = ingest.UNGROUNDED_CONFIDENCE  # the model gave a value that is not in the OCR text
    assert rejected(lambda: check_content(guessed, "id_card", PLAYBOOK, [ID_TEXT])) == "not_clear"


def test_a_foreign_id_is_refused():
    foreign = "REPUBLIQUE FRANCAISE CARTE NATIONALE D'IDENTITE\nIDFRAMARTIN<<<<"
    assert rejected(lambda: check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [foreign])) == "not_romanian"
    assert is_romanian("ROMÂNIA") and is_romanian("IDROUPOPESCU<<ION") and not is_romanian("ROMANIAN STYLE CAFE".replace("ROMANIA", "X"))


def test_a_misread_cnp_means_not_clear():
    d = doc_of(case(), "id_card")
    good = str(d.fields["cnp"].value)
    assert cnp_is_valid(good)
    d.fields["cnp"].value = good[:12] + str((int(good[12]) + 1) % 10)
    assert rejected(lambda: check_content(d, "id_card", PLAYBOOK, [ID_TEXT])) == "not_clear"


def test_other_documents_need_their_key_fields_only():
    payslip = doc_of(case(), "payslip")
    payslip.fields.pop("cnp", None)  # most payslips do not print it
    check_content(payslip, "payslip", PLAYBOOK, ["FLUTURAS DE SALARIU ..."])
    del payslip.fields["net_salary"]
    assert rejected(lambda: check_content(payslip, "payslip", PLAYBOOK, ["FLUTURAS"])) == "not_clear"


def test_a_refused_upload_leaves_the_case_and_the_replaced_document_unchanged(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF0))
    full = case()
    full.flags, full.risk_draft, full.decision = [], None, None
    truth = {d.doc_id: copy.deepcopy(d) for d in full.documents}
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore(), today=lambda: date(2026, 10, 28))

    def classify(c, d):
        d.doc_type = "unknown"  # the new file is a holiday photo

    orch.set_ingest(classify=classify, extract=lambda c, d: None, gate=lambda c, d, e: check_content(d, e, PLAYBOOK, ["beach"]))
    orch.submit(full)
    photo = copy.deepcopy(truth["doc_001"]).model_copy(update={"doc_id": "doc_009", "doc_type": "unknown", "fields": {}})
    with pytest.raises(UploadRejected):
        orch.add_document(full.case_id, photo, replaces="doc_001", expected="id_card")
    stored = orch.store.load(full.case_id)
    assert [d.doc_id for d in stored.documents] == ["doc_001", "doc_002", "doc_003"]
    assert any(e["tool"] == "reject_upload" and e["output"]["code"] == "wrong_document" for e in orch.audit.entries(full.case_id))


def test_a_membership_card_is_not_an_id_even_if_the_classifier_says_so():
    gym = "APEX FITNESS CLUB\nOFFICIAL MEMBER IDENTIFICATION\nFull Name: Taylor Hayes\nClient ID: 8290797204684"
    assert rejected(lambda: check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [gym])) == "wrong_document"
    from nexxt_orchestrator.gate import is_identity_document
    assert is_identity_document("IDROUPOPESCU<<ION<<<<<") and is_identity_document("ROMANIA CARTE DE IDENTITATE")
    assert not is_identity_document("Fișă de identitate - specimen") and not is_identity_document("MEMBER IDENTIFICATION")


def test_specimen_documents_pass_only_in_demo_mode(monkeypatch):
    specimen = "KYC / DOCUMENT SINTETIC\nFișă de identitate - specimen\nSPECIMEN - DATE FICTIVE\nCNP SINTETIC 2920312408117"
    assert rejected(lambda: check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [specimen])) == "wrong_document"
    monkeypatch.setenv("NEXXT_ACCEPT_SPECIMEN", "1")
    check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [specimen])
    assert rejected(lambda: check_content(doc_of(case(), "id_card"), "id_card", PLAYBOOK, [specimen + "\n[illegible]"])) == "not_clear"
