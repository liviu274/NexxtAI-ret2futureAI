from datetime import date, datetime, timedelta, timezone

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks.tamper import (
    ImageFacts, PdfFacts, file_kind, font_family, image_findings, metadata_findings, parse_pdf_date, read_image_facts,
)
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import CaseStore, PlaybookStore

from .conftest import make_pdf, make_photo

NOW = "2026-10-28T12:00:00+02:00"
HELV, TIMES = "F1", "F2"
PAYSLIP = [
    [(HELV, "Fluturas de salariu")],
    [(HELV, "SALARIU BRUT 8.000,00 RON")],
    [(HELV, "SALARIU NET 4.680,00 RON")],
]


def field(doc_id, name, value, raw, bbox, value_type="money"):
    return {"field_id": f"{doc_id}_{name}", "name": name, "value": value, "value_type": value_type, "raw_text": raw,
            "confidence": 1.0, "source": {"doc_id": doc_id, "page": 1, "bbox": bbox}, "extracted_by": "test"}


def money(amount):
    return {"amount": amount, "currency": "RON"}


def build_case(net=4680):
    doc = lambda i, file, mime, kind, fields=None: {  # noqa: E731
        "doc_id": f"doc_00{i}", "file": file, "mime_type": mime, "pages": 1, "uploaded_at": NOW, "doc_type": kind,
        "classification_confidence": 1.0, "owner_person_id": "p_1", "fields": fields or {}}
    return CaseFile.model_validate({
        "case_id": "case_t", "playbook_id": "pb_cont_pf_v1", "customer_type": "PF", "status": "intake",
        "created_at": NOW, "updated_at": NOW,
        "persons": [{"person_id": "p_1", "role": "applicant", "full_name": "Test Persoana"}],
        "documents": [
            doc(1, "id_photo.jpg", "image/jpeg", "id_card"),
            doc(2, "bill.pdf", "application/pdf", "proof_of_address"),
            doc(3, "payslip.pdf", "application/pdf", "payslip", {
                "gross_salary": field("doc_003", "gross_salary", money(8000), "8.000,00 RON", [0.07, 0.30, 0.30, 0.33]),
                "deductions": field("doc_003", "deductions", money(3320), "3.320,00 RON", [0.07, 0.34, 0.30, 0.37]),
                "net_salary": field("doc_003", "net_salary", money(net), f"{net} RON", [0.06, 0.38, 0.32, 0.41]),
            }),
        ],
    })


@pytest.fixture
def files(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(tmp_path))
    make_photo(tmp_path / "id_photo.jpg", software="SM-G991B", captured="2026:10:27 10:00:00", modified="2026:10:27 10:00:00")
    make_pdf(tmp_path / "bill.pdf", [[(HELV, "Factura utilitati")]])
    make_pdf(tmp_path / "payslip.pdf", PAYSLIP)
    return tmp_path


def tamper_flags(tmp_path, case=None):
    runs = tmp_path / "runs"
    orch = Orchestrator(CaseStore(runs), AuditLog(runs), PlaybookStore(), today=lambda: date(2026, 10, 28))
    case = case or build_case()
    orch.submit(case)
    done = orch.process(case.case_id)
    return orch, done, [f for f in done.flags if f.stage == "tamper"]


def by_rule(flags):
    return {f.rule_id: f for f in flags}


def test_clean_photo_and_pdfs_raise_nothing(files):
    assert tamper_flags(files)[2] == []


def test_stripped_photo_is_not_suspicious(files):
    make_photo(files / "id_photo.jpg")  # WhatsApp and screenshots carry no EXIF
    assert tamper_flags(files)[2] == []


def test_edited_id_photo_is_flagged_without_leaking_personal_data(files):
    make_photo(files / "id_photo.jpg", software="Adobe Photoshop 25.1", captured="2026:10:27 10:00:00", modified="2026:10:28 09:30:00")
    flag = by_rule(tamper_flags(files)[2])["R-PF-010"]
    assert [e.doc_id for e in flag.evidence] == ["doc_001"] and flag.evidence[0].quote == "Software: Adobe Photoshop 25.1"
    assert "editing software" in flag.explanation and "re-saved 2026-10-28 09:30" in flag.explanation
    assert flag.severity == "critical" and not flag.client_fixable and flag.fix_message is None


def test_png_text_chunk_is_read(tmp_path):
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    meta = PngInfo()
    meta.add_text("Software", "GIMP 2.10")
    Image.new("RGB", (10, 10)).save(tmp_path / "id.png", pnginfo=meta)
    assert read_image_facts(tmp_path / "id.png").software == ["GIMP 2.10"]


def test_edited_payslip_raises_all_three_rules_on_that_document_only(files):
    make_pdf(files / "payslip.pdf", [PAYSLIP[0], [(HELV, "SALARIU BRUT 8.000,00 RON")], [(HELV, "SALARIU NET "), (HELV, "7"), (TIMES, ".480,00 RON")]],
             producer="Adobe Photoshop 25.1", modified="D:20261028110000Z")
    orch, case, flags = tamper_flags(files, build_case(net=7480))
    found = by_rule(flags)
    assert set(found) == {"R-PF-010", "R-PF-011", "R-PF-012"}
    assert {e.doc_id for f in flags for e in f.evidence} == {"doc_003"}
    font = found["R-PF-011"].evidence[0]
    assert font.quote.endswith(".480,00 RON") and 0 <= font.bbox[1] < font.bbox[3] <= 1
    assert "4680.00" in found["R-PF-012"].explanation and "7480.00" in found["R-PF-012"].explanation
    assert {m["flag_id"] for m in orch.client_messages(case.case_id)}.isdisjoint(f.flag_id for f in flags)


def test_incremental_save_is_detected(files):
    make_pdf(files / "bill.pdf", [[(HELV, "Factura utilitati")]], resave="D:20261028110000Z")
    flag = by_rule(tamper_flags(files)[2])["R-PF-010"]
    assert flag.evidence[0].doc_id == "doc_002" and "%%EOF" in flag.explanation


def test_missing_and_unsupported_files_fail_closed(files):
    (files / "payslip.pdf").write_bytes(b"not a pdf and not an image")
    case = tamper_flags(files)[1]
    errors = [f for f in case.flags if f.title.startswith("Check pdf_metadata could not run")]
    assert errors and errors[0].severity == "medium" and "unsupported file type" in errors[0].explanation
    (files / "id_photo.jpg").unlink()
    case = tamper_flags(files, build_case())[1]
    assert any("file not found" in f.explanation for f in case.flags)


def test_file_kind_ignores_extension_and_declared_mime(tmp_path):
    make_photo(tmp_path / "scan.pdf")
    make_pdf(tmp_path / "doc.jpg", [[(HELV, "x")]])
    assert (file_kind(tmp_path / "scan.pdf"), file_kind(tmp_path / "doc.jpg")) == ("image", "pdf")


def facts(**kw):
    base = dict(producers=["Microsoft Word"], creators=[], created=None, modified=None, eof_count=1, linearized=False)
    return PdfFacts(**{**base, **kw})


def test_metadata_signals():
    t0 = datetime(2026, 10, 27, 10, tzinfo=timezone.utc)
    assert metadata_findings(facts(created=t0, modified=t0 + timedelta(seconds=5)), None) == []
    assert "editing software" in metadata_findings(facts(producers=["iLovePDF"]), None)[0]
    assert "after it was created" in metadata_findings(facts(created=t0, modified=t0 + timedelta(hours=25)), None)[0]
    assert "issue date" in metadata_findings(facts(modified=t0 + timedelta(days=3)), date(2026, 10, 27))[0]
    assert metadata_findings(facts(modified=t0), date(2026, 10, 27)) == []


def test_two_eof_is_an_edit_unless_the_file_is_linearized():
    assert "incrementally" in metadata_findings(facts(eof_count=2), None)[0]
    assert metadata_findings(facts(eof_count=2, linearized=True), None) == []


def test_image_signals():
    t0 = datetime(2026, 10, 27, 10)
    assert image_findings(ImageFacts(["Apple iPhone 15"], t0, t0 + timedelta(seconds=3))) == []
    assert image_findings(ImageFacts(["Snapseed 2.0"], None, None))
    assert image_findings(ImageFacts([], t0, t0 + timedelta(hours=1)))


def test_font_family_ignores_subset_prefix_and_weight():
    assert font_family("AAAAAA+Arial-BoldMT") == font_family("ABCDEF+ArialMT") == "arial"
    assert font_family("AAAAAA+TimesNewRomanPS-BoldMT") == "timesnewroman"


def test_pdf_date_parsing():
    assert parse_pdf_date("D:20261028110000+02'00'") == datetime(2026, 10, 28, 11, tzinfo=timezone(timedelta(hours=2)))
    assert parse_pdf_date("D:20261028") == datetime(2026, 10, 28, tzinfo=timezone.utc)
    assert parse_pdf_date("garbage") is None
