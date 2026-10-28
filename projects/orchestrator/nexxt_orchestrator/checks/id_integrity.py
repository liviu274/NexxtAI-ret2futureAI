"""id_integrity (Person 4): is the data printed on the ID internally consistent?

A retyped date of birth or a changed digit breaks the CNP checksum, the CNP's own birth date, or the check
digits of the machine-readable zone (ICAO 9303; the Romanian CEI uses TD2, 2 lines of 36 characters).
Nothing here needs the photo itself: it works on the extracted fields. An OCR misread breaks the same checks,
so the flag asks the analyst to compare with the photo. The CNP itself is never written into flag text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from ..models import Document, Evidence, ExtractedField, Flag
from . import CheckContext, register
from .tamper import owned_documents

CNP_KEY = "279146358279"
CNP_CENTURY = {"1": 1900, "2": 1900, "3": 1800, "4": 1800, "5": 2000, "6": 2000}
CNP_COUNTY = set(range(1, 53)) | {70}  # counties, Bucharest sectors, 51/52 Calarasi/Giurgiu, 70 = reissued CNP
MRZ_WEIGHTS = (7, 3, 1)
ID_DOC_TYPES = ["id_card", "passport"]


# --- CNP --------------------------------------------------------------------------------------------------------


def cnp_check_digit(first12: str) -> int:
    remainder = sum(int(d) * int(k) for d, k in zip(first12, CNP_KEY)) % 11
    return 1 if remainder == 10 else remainder


def cnp_birth_date(cnp: str, hint: date | None = None) -> date | None:
    """Date encoded in a CNP. Sex digits 7-9 (foreigners) do not fix the century, so the printed date breaks the tie."""
    yy, mm, dd = int(cnp[1:3]), int(cnp[3:5]), int(cnp[5:7])
    centuries = [CNP_CENTURY[cnp[0]]] if cnp[0] in CNP_CENTURY else [1900, 2000]
    dates = []
    for century in centuries:
        try:
            dates.append(date(century + yy, mm, dd))
        except ValueError:
            continue
    if hint in dates:
        return hint
    return dates[0] if dates else None


def cnp_problems(cnp: str, printed_birth: date | None, today: date) -> list[str]:
    if not re.fullmatch(r"\d{13}", cnp):
        return ["the CNP does not have 13 digits"]
    problems = []
    if cnp[0] == "0":
        problems.append("the first CNP digit (sex and century) is 0")
    birth = cnp_birth_date(cnp, printed_birth)
    if birth is None:
        problems.append("the birth date inside the CNP is not a real date")
    elif birth > today:
        problems.append(f"the birth date inside the CNP ({birth.isoformat()}) is in the future")
    elif printed_birth and birth != printed_birth:
        problems.append(f"the birth date inside the CNP ({birth.isoformat()}) differs from the printed date of birth ({printed_birth.isoformat()})")
    if int(cnp[7:9]) not in CNP_COUNTY:
        problems.append(f"the county code {cnp[7:9]} inside the CNP does not exist")
    if cnp[9:12] == "000":
        problems.append("the serial number inside the CNP is 000")
    if cnp_check_digit(cnp[:12]) != int(cnp[12]):
        problems.append("the CNP check digit is wrong")
    return problems


# --- MRZ (ICAO 9303) --------------------------------------------------------------------------------------------
# The Romanian CEI uses TD2 (2 lines of 36); TD1 (3 lines of 30) is also read. On a TD2 card the optional data
# holds the CNP minus its date: sex digit + county + serial + check digit, so the whole CNP can be rebuilt.


@dataclass
class Mrz:
    fmt: str
    nationality: str
    doc_number: str
    doc_check: str
    dob: str
    dob_check: str
    sex: str
    expiry: str
    expiry_check: str
    optional: list[str]
    composite_data: str
    composite_check: str


def mrz_value(char: str) -> int:
    if char.isdigit():
        return int(char)
    if "A" <= char <= "Z":
        return ord(char) - 55
    if char == "<":
        return 0
    raise ValueError(f"character {char!r} is not allowed in an MRZ")


def mrz_check_digit(data: str) -> int:
    return sum(mrz_value(c) * MRZ_WEIGHTS[i % 3] for i, c in enumerate(data)) % 10


def parse_mrz(text: str) -> Mrz:
    lines = [re.sub(r"\s+", "", line.upper().replace("«", "<")) for line in text.strip().splitlines() if line.strip()]
    sizes = tuple(len(line) for line in lines)
    if len(lines) == 2 and sizes[1] == 36:  # line 1 only holds the names, whose length OCR often gets wrong
        l2 = lines[1]
        return Mrz("TD2", l2[10:13], l2[0:9], l2[9], l2[13:19], l2[19], l2[20], l2[21:27], l2[27], [l2[28:35]],
                   l2[0:10] + l2[13:20] + l2[21:28] + l2[28:35], l2[35])
    if sizes == (30, 30, 30):
        l1, l2 = lines[0], lines[1]
        return Mrz("TD1", l2[15:18], l1[5:14], l1[14], l2[0:6], l2[6], l2[7], l2[8:14], l2[14], [l1[15:30], l2[18:29]],
                   l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29], l2[29])
    raise ValueError(f"the MRZ is neither TD2 (2 lines, the second 36 long) nor TD1 (3x30) but has line lengths {sizes}, so it cannot be verified")


def mrz_problems(mrz: Mrz, printed: dict[str, str | date | None]) -> list[str]:
    problems = []
    for name, data, digit in (("document number", mrz.doc_number, mrz.doc_check), ("date of birth", mrz.dob, mrz.dob_check),
                              ("expiry date", mrz.expiry, mrz.expiry_check), ("whole line", mrz.composite_data, mrz.composite_check)):
        if not digit.isdigit() or mrz_check_digit(data) != int(digit):
            problems.append(f"the MRZ check digit for the {name} is wrong")
    birth = printed.get("date_of_birth")
    if isinstance(birth, date) and birth.strftime("%y%m%d") != mrz.dob:
        problems.append("the MRZ date of birth differs from the printed date of birth")
    expiry = printed.get("expiry_date")
    if isinstance(expiry, date) and expiry.strftime("%y%m%d") != mrz.expiry:
        problems.append("the MRZ expiry date differs from the printed expiry date")
    number = printed.get("series_number")
    if isinstance(number, str) and number and re.sub(r"[^A-Z0-9]", "", number.upper()) != mrz.doc_number.replace("<", ""):
        problems.append("the MRZ document number differs from the printed series and number")
    cnp = printed.get("cnp")
    cnp = cnp if isinstance(cnp, str) and re.fullmatch(r"\d{13}", cnp) else None
    if cnp:
        if mrz.dob != cnp[1:7]:
            problems.append("the MRZ date of birth differs from the date inside the printed CNP")
        if mrz.sex in "MF" and cnp[0] in "12345678" and (mrz.sex == "M") != (int(cnp[0]) % 2 == 1):
            problems.append("the MRZ sex differs from the sex digit of the printed CNP")
    tail = next((o for o in mrz.optional if re.fullmatch(r"\d{7}", o)), None) if mrz.fmt == "TD2" else None
    if tail:  # Romanian TD2: optional data = sex digit + county + serial + check digit of the CNP
        rebuilt = tail[0] + mrz.dob + tail[1:]
        if cnp and rebuilt != cnp:
            problems.append("the CNP rebuilt from the MRZ differs from the printed CNP")
        elif not cnp:
            problems += [f"the CNP rebuilt from the MRZ is not valid: {p}" for p in cnp_problems(rebuilt, None, date.today())]
    else:
        found = {run for text in mrz.optional for run in re.findall(r"\d{13}", text)}
        if cnp and found and cnp not in found:
            problems.append("the CNP inside the MRZ differs from the printed CNP")
    return problems


# --- the check --------------------------------------------------------------------------------------------------


def _date(field: ExtractedField | None) -> date | None:
    try:
        return date.fromisoformat(str(field.value)) if field and field.value else None
    except ValueError:
        return None


def _evidence(doc: Document, field: ExtractedField, quote: str | None = None) -> Evidence:
    return Evidence(doc_id=doc.doc_id, page=field.source.page, bbox=field.source.bbox, field_id=field.field_id, quote=quote)


@register("id_integrity")
def id_integrity(ctx: CheckContext) -> list[Flag]:
    flags = []
    for doc in owned_documents(ctx, ctx.rule.params.get("doc_types") or ID_DOC_TYPES):
        cnp_field, mrz_field = doc.fields.get("cnp"), doc.fields.get("mrz")
        problems, evidence = [], []
        if cnp_field and cnp_field.value:
            found = cnp_problems(re.sub(r"\D", "", str(cnp_field.value)), _date(doc.fields.get("date_of_birth")), ctx.today)
            if found:
                problems += found
                evidence.append(_evidence(doc, cnp_field))  # no quote: the CNP must not be copied into the flag
        if mrz_field and mrz_field.raw_text and doc.doc_type == "id_card":
            printed = {"date_of_birth": _date(doc.fields.get("date_of_birth")), "expiry_date": _date(doc.fields.get("expiry_date")),
                       "series_number": str(doc.fields["series_number"].value) if "series_number" in doc.fields else None,
                       "cnp": re.sub(r"\D", "", str(cnp_field.value)) if cnp_field and cnp_field.value else None}
            try:
                found = mrz_problems(parse_mrz(mrz_field.raw_text), printed)
            except ValueError as exc:  # unreadable MRZ must not hide what the CNP check found
                found = [str(exc)]
            if found:
                problems += found
                evidence.append(_evidence(doc, mrz_field))
        if not problems:
            continue
        flags.append(ctx.flag(
            title=f"ID data is inconsistent: {len(problems)} problem(s)",
            explanation=f"{doc.doc_type} ({doc.doc_id}): " + "; ".join(problems)
                        + ". A retyped value causes this; so does a misread, so compare with the photo.",
            evidence=evidence,
        ))
    return flags
