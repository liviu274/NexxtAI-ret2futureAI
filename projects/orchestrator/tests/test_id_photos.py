"""Runs id_integrity on the fake ID photos in data/id_photos (gitignored, so these tests skip on a fresh clone).

There is no OCR in the repo yet, so transcripts.json holds the CNP, series, expiry and MRZ of each photo, typed in by
hand: it stands in for what Person 3's extractor will return.
"""
import json

import pytest

from nexxt_orchestrator.models import ExtractedField
from nexxt_orchestrator.store import REPO_ROOT

from .conftest import make_pdf
from .test_tamper import HELV, build_case, field, tamper_flags

PHOTOS = REPO_ROOT / "data" / "id_photos"
pytestmark = pytest.mark.skipif(not (PHOTOS / "transcripts.json").exists(), reason="data/id_photos is not present")


@pytest.fixture
def run_photo(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(tmp_path))
    make_pdf(tmp_path / "bill.pdf", [[(HELV, "Factura")]])
    make_pdf(tmp_path / "payslip.pdf", [[(HELV, "Fluturas")]])
    transcripts = json.loads((PHOTOS / "transcripts.json").read_text(encoding="utf-8"))

    def run(name):
        t = transcripts[name]
        case = build_case()
        doc = case.documents[0]
        doc.file, doc.mime_type = str(PHOTOS / name), "image/png"
        values = {"cnp": (t["cnp"], "cnp", [0.20, 0.22, 0.60, 0.27]), "series_number": (t["series_number"], "string", [0.5, 0.2, 0.8, 0.27]),
                  "expiry_date": (t["expiry_date"], "date", [0.6, 0.84, 0.95, 0.9]), "mrz": (t["mrz"], "string", [0.05, 0.78, 0.95, 0.95])}
        doc.fields = {k: ExtractedField.model_validate(field("doc_001", k, v, v, box, kind)) for k, (v, kind, box) in values.items()}
        return [f for f in tamper_flags(tmp_path, case)[2] if f.evidence[0].doc_id == "doc_001"]

    return run


def test_consistent_card_is_clean(run_photo):
    assert run_photo("random.png") == []  # also proves the PNG without EXIF is not suspicious


def test_card_whose_mrz_contradicts_its_cnp_is_flagged(run_photo):
    (flag,) = run_photo("brad_pitt.png")
    assert flag.rule_id == "R-PF-017" and flag.severity == "high"
    for expected in ("the CNP check digit is wrong", "the MRZ date of birth differs from the date inside the printed CNP",
                     "the CNP rebuilt from the MRZ differs from the printed CNP"):
        assert expected in flag.explanation
    assert "1820311410618" not in flag.explanation and all(e.quote is None for e in flag.evidence)


def test_card_with_a_truncated_cnp_and_garbled_mrz_is_flagged(run_photo):
    (flag,) = run_photo("putin.png")
    assert "does not have 13 digits" in flag.explanation and "neither TD2" in flag.explanation
