from datetime import date

import pytest

from nexxt_orchestrator.checks.id_integrity import cnp_check_digit, cnp_problems, mrz_check_digit, mrz_problems, parse_mrz
from nexxt_orchestrator.models import ExtractedField

from .conftest import make_pdf, make_photo
from .test_tamper import HELV, build_case, field, tamper_flags

TODAY = date(2026, 10, 28)
BIRTH = date(1992, 3, 12)
CNP = "2920312408117"


def with_check(first12: str) -> str:
    return first12 + str(cnp_check_digit(first12))


def build_mrz(number="DX9008112", dob="920312", expiry="340115", cnp=CNP, mutate=None) -> str:
    """A valid TD1 MRZ with the CNP in the optional data, built with the same ICAO algorithm."""
    doc = f"{number[:8]}<".ljust(9, "<")
    l1 = f"IDROU{doc}{mrz_check_digit(doc)}{cnp}".ljust(30, "<")
    l2 = f"{dob}{mrz_check_digit(dob)}F{expiry}{mrz_check_digit(expiry)}ROU".ljust(29, "<")
    composite = mrz_check_digit(l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29])
    l2 += str(composite)
    lines = [l1, l2, "EXEMPLU<<MARA".ljust(30, "<")]
    assert all(len(line) == 30 for line in lines)
    return "\n".join(mutate(lines) if mutate else lines)


def build_td2(number="MZ300493<", dob="790513", expiry="240513", cnp="1790513400158", sex="M") -> str:
    """A valid Romanian-style TD2 MRZ: the optional data is the CNP without its date (sex digit + county + serial + check)."""
    optional = cnp[0] + cnp[7:]
    line2 = f"{number}{mrz_check_digit(number)}ROU{dob}{mrz_check_digit(dob)}{sex}{expiry}{mrz_check_digit(expiry)}{optional}"
    line2 += str(mrz_check_digit(line2[0:10] + line2[13:20] + line2[21:28] + line2[28:35]))
    assert len(line2) == 36
    return "IDROUEXEMPLU<<MARA<<<<<\n" + line2  # line 1 is deliberately not 36 long: only line 2 is used


PRINTED = {"date_of_birth": BIRTH, "expiry_date": date(2034, 1, 15), "series_number": "DX 900811", "cnp": CNP}


def test_cnp_checksum_and_structure():
    assert cnp_problems(CNP, BIRTH, TODAY) == []
    assert cnp_problems(with_check("500010112345"), date(2000, 1, 1), TODAY) == []  # century from the sex digit
    assert cnp_problems("2920312408118", BIRTH, TODAY) == ["the CNP check digit is wrong"]
    assert "differs from the printed date of birth" in cnp_problems(CNP, date(1992, 3, 21), TODAY)[0]
    assert "county code 99" in cnp_problems(with_check("292031299811"), BIRTH, TODAY)[0]
    assert "serial number" in cnp_problems(with_check("292031240000"), BIRTH, TODAY)[0]
    assert "not a real date" in cnp_problems(with_check("292023040811"), None, TODAY)[0]
    assert "future" in cnp_problems(with_check("699010140811"), None, TODAY)[0]
    assert cnp_problems("29203124081", BIRTH, TODAY) == ["the CNP does not have 13 digits"]


def test_foreigner_cnp_takes_the_century_from_the_printed_date():
    assert cnp_problems(with_check("700010112345"), date(2000, 1, 1), TODAY) == []
    assert cnp_problems(with_check("700010112345"), date(1900, 1, 1), TODAY) == []


def test_mrz_check_digits_match_the_icao_reference():
    assert mrz_check_digit("L898902C3") == 6 and mrz_check_digit("740812") == 2 and mrz_check_digit("120415") == 9


def test_valid_mrz_passes_and_each_edit_is_caught():
    assert mrz_problems(parse_mrz(build_mrz()), PRINTED) == []
    assert parse_mrz(build_mrz()).fmt == "TD1"
    edit = lambda i, a, b: (lambda lines: [l.replace(a, b, 1) if n == i else l for n, l in enumerate(lines)])  # noqa: E731
    assert "date of birth is wrong" in mrz_problems(parse_mrz(build_mrz(mutate=edit(1, "920312", "920321"))), PRINTED)[0]
    assert any("expiry date differs" in p for p in mrz_problems(parse_mrz(build_mrz(expiry="360115")), PRINTED))
    assert any("document number differs" in p for p in mrz_problems(parse_mrz(build_mrz(number="DX9008222")), PRINTED))
    assert any("CNP inside the MRZ differs" in p for p in mrz_problems(parse_mrz(build_mrz(cnp="1900514123456")), PRINTED))


def test_td2_mrz_of_the_romanian_card():
    printed = {"cnp": "1790513400158", "series_number": "MZ 300493", "expiry_date": date(2024, 5, 13)}
    assert mrz_problems(parse_mrz(build_td2()), printed) == []
    assert parse_mrz(build_td2()).fmt == "TD2"
    other_birth = mrz_problems(parse_mrz(build_td2(dob="631218")), printed)
    assert "the MRZ date of birth differs from the date inside the printed CNP" in other_birth
    assert "the CNP rebuilt from the MRZ differs from the printed CNP" in other_birth
    assert "the MRZ sex differs from the sex digit of the printed CNP" in mrz_problems(parse_mrz(build_td2(sex="F")), printed)
    assert "the MRZ expiry date differs from the printed expiry date" in mrz_problems(parse_mrz(build_td2(expiry="290514")), printed)


def test_td2_without_a_printed_cnp_validates_the_rebuilt_one():
    assert mrz_problems(parse_mrz(build_td2()), {}) == []
    assert any("rebuilt from the MRZ is not valid" in p for p in mrz_problems(parse_mrz(build_td2(cnp="1790513400159")), {}))


def test_unparseable_mrz_is_an_error_not_a_pass():
    with pytest.raises(ValueError, match="neither TD2"):
        parse_mrz("IDROU<<<\nshort")


def id_case(cnp=CNP, dob="1992-03-12", mrz=None):
    case = build_case()
    fields = {"cnp": field("doc_001", "cnp", cnp, cnp, [0.07, 0.34, 0.20, 0.36], "cnp"),
              "date_of_birth": field("doc_001", "date_of_birth", dob, dob, [0.07, 0.38, 0.16, 0.40], "date")}
    if mrz:
        fields["mrz"] = field("doc_001", "mrz", mrz, mrz, [0.05, 0.80, 0.95, 0.95], "string")
    case.documents[0].fields = {k: ExtractedField.model_validate(v) for k, v in fields.items()}
    return case


@pytest.fixture
def files(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(tmp_path))
    make_photo(tmp_path / "id_photo.jpg")
    make_pdf(tmp_path / "bill.pdf", [[(HELV, "Factura")]])
    make_pdf(tmp_path / "payslip.pdf", [[(HELV, "Fluturas")]])
    return tmp_path


def rule_017(files, case):
    return [f for f in tamper_flags(files, case)[2] if f.rule_id == "R-PF-017"]


def test_consistent_id_raises_nothing(files):
    assert rule_017(files, id_case(mrz=build_mrz())) == []


def test_retyped_birth_date_is_flagged_without_leaking_the_cnp(files):
    (flag,) = rule_017(files, id_case(dob="1992-03-21"))
    assert flag.severity == "high" and not flag.client_fixable and flag.fix_message is None
    assert "differs from the printed date of birth" in flag.explanation and CNP not in flag.explanation
    assert [(e.doc_id, e.field_id, e.quote) for e in flag.evidence] == [("doc_001", "doc_001_cnp", None)]
    assert flag.evidence[0].bbox == [0.07, 0.34, 0.20, 0.36]


def test_wrong_cnp_digit_and_mrz_problems_are_reported_together(files):
    bad_mrz = build_mrz(expiry="360115")
    (flag,) = rule_017(files, id_case(cnp="2920312408118", mrz=bad_mrz))
    assert "CNP check digit is wrong" in flag.explanation and "MRZ expiry date differs" not in flag.explanation
    assert {e.field_id for e in flag.evidence} == {"doc_001_cnp", "doc_001_mrz"}


def test_unreadable_mrz_is_flagged_and_keeps_the_cnp_findings(files):
    (flag,) = rule_017(files, id_case(cnp="2920312408118", mrz="garbage"))
    assert "neither TD2" in flag.explanation and "CNP check digit is wrong" in flag.explanation


def test_documents_without_a_cnp_are_skipped(files):
    assert rule_017(files, build_case()) == []
