"""The upload gate: a file the client uploads for a portal step joins the case only if it really is that document,
in the accepted format, and fully readable. Otherwise the client is told why and uploads it again.

Rules, in order (the first one that fails is the answer):
- format: identity documents as a photo (JPEG, PNG) or PDF, every other document as PDF;
- photo resolution: a photo smaller than MIN_SIDE pixels on its short side cannot be read reliably;
- type: the classifier must recognize the document the step asks for (or a playbook alternative);
- legibility: the OCR marks nothing as [illegible], and the step's key fields were all read off the page
  (present, with the confidence of a value found in the OCR text);
- identity documents: the page carries an identity-document heading or machine-readable zone (a club or
  membership card does not), says it is Romanian, and the CNP has a valid check digit (a CNP that fails it was
  misread, so the photo is not clear enough).
NEXXT_ACCEPT_SPECIMEN=1 (demo only) lets documents marked SPECIMEN pass the heading and country checks; they must
still be fully legible with a valid CNP.
Messages are for the client (Romanian) and never mention fraud or internal checks.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Callable

from .checks.cross_check import plain
from .checks.id_integrity import cnp_check_digit
from .models import CaseFile, Document, Playbook

IDENTITY = ("id_card", "passport")
MIN_SIDE = 400
LEGIBLE = 0.7  # the contract's review line: below it a value was not read off the page
# The fields that must be legible for each document; others (an address not printed on the new electronic ID card,
# a CNP most payslips do not print) are left to the playbook's own checks.
KEY_FIELDS = {
    "id_card": ["full_name", "cnp", "date_of_birth", "series_number", "expiry_date"],
    "passport": ["full_name", "date_of_birth", "doc_number", "expiry_date"],
    "proof_of_address": ["full_name", "address", "issue_date"],
    "payslip": ["full_name", "employer", "net_salary", "period_end"],
    "income_certificate": ["full_name", "employer", "net_salary"],
    "bank_statement": ["full_name", "iban"],
    "certificat_constatator": ["company_name", "cui", "registration_number"],
    "act_constitutiv": ["company_name"],
    "ubo_declaration": ["company_name", "ubos"],
    "signature_specimen": ["full_name"],
}
LABELS = {
    "full_name": "numele", "cnp": "CNP-ul", "date_of_birth": "data nașterii", "series_number": "seria și numărul",
    "doc_number": "numărul documentului", "expiry_date": "data expirării", "address": "adresa", "issue_date": "data emiterii",
    "employer": "angajatorul", "net_salary": "salariul net", "period_end": "perioada", "iban": "IBAN-ul",
    "company_name": "denumirea firmei", "cui": "CUI-ul", "registration_number": "numărul de înregistrare", "ubos": "beneficiarii reali",
}
DOCUMENT_NAMES = {
    "id_card": "cartea de identitate", "passport": "pașaportul", "proof_of_address": "dovada adresei", "payslip": "fluturașul de salariu",
    "income_certificate": "adeverința de venit", "bank_statement": "extrasul de cont", "certificat_constatator": "certificatul constatator",
    "act_constitutiv": "actul constitutiv", "ubo_declaration": "declarația de beneficiar real", "signature_specimen": "specimenul de semnătură",
}
NOT_CLEAR = "Fotografia nu este clară"
RETAKE = "Fă o fotografie nouă, cu lumină bună, fără reflexii, cu tot documentul în cadru, și încarcă-o din nou."


class UploadRejected(Exception):
    """The upload is not the document asked for, or cannot be read. `code` is for the screens, `message` for the client."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def check_format(expected: str, mime: str) -> None:
    if expected in IDENTITY:
        if mime not in ("image/jpeg", "image/png", "application/pdf"):
            raise UploadRejected("wrong_format", "Încarcă o fotografie (JPG sau PNG) sau un PDF al actului de identitate.")
    elif mime != "application/pdf":
        raise UploadRejected("pdf_required", f"Încarcă {DOCUMENT_NAMES.get(expected, 'documentul')} ca fișier PDF.")


def check_resolution(path: Path, mime: str) -> None:
    if not mime.startswith("image/"):
        return
    from PIL import Image

    with Image.open(path) as image:
        if min(image.size) < MIN_SIDE:
            raise UploadRejected("not_clear", f"{NOT_CLEAR}: rezoluția este prea mică. {RETAKE}")


def accepted_types(playbook: Playbook, expected: str) -> set[str]:
    found = {expected}
    for req in playbook.required_documents:
        if req.doc_type == expected:
            found.update(req.alternatives)
    return found


def is_identity_document(text: str) -> bool:
    """An identity card or passport names itself, or has the machine-readable zone of one."""
    flat = plain(text).upper()
    return bool(re.search(r"CARTE DE IDENTITATE|CARTE D.IDENTITE|IDENTITY CARD|BULETIN DE IDENTITATE|PASAPORT|PASSEPORT|PASSPORT"
                          r"|\b(?:ID|I<)[A-Z]{3}[A-Z0-9<]*<<|\bP<[A-Z]{3}[A-Z<]*<<", flat))  # MRZ lines carry << separators


def specimen_accepted(text: str) -> bool:
    return os.environ.get("NEXXT_ACCEPT_SPECIMEN") == "1" and "SPECIMEN" in plain(text).upper()


def is_romanian(text: str) -> bool:
    """The card or passport says so: ROMANIA / ROUMANIE / ROMÂNIA on the face, or ROU in the machine-readable zone."""
    flat = plain(text).upper()
    return bool(re.search(r"\bROMANIA\b|\bROUMANIE\b|\bROU\b|IDROU|P<ROU", flat))


def cnp_is_valid(value: object) -> bool:
    digits = re.sub(r"\D", "", str(value or ""))
    return len(digits) == 13 and cnp_check_digit(digits[:12]) == int(digits[12])


def check_content(doc: Document, expected: str, playbook: Playbook, pages: list[str]) -> None:
    name = DOCUMENT_NAMES.get(expected, "documentul cerut")
    if doc.doc_type not in accepted_types(playbook, expected):
        if expected in IDENTITY:
            raise UploadRejected("wrong_document", "Fișierul nu este o carte de identitate. Încarcă o fotografie clară a cărții tale de identitate românești.")
        raise UploadRejected("wrong_document", f"Fișierul nu pare să fie {name}. Încarcă documentul cerut la acest pas.")
    text = "\n".join(pages)
    if expected in IDENTITY and not specimen_accepted(text):
        if not is_identity_document(text):
            raise UploadRejected("wrong_document", "Fișierul nu este o carte de identitate. Încarcă o fotografie clară a cărții tale de identitate românești.")
        if not is_romanian(text):
            raise UploadRejected("not_romanian", "Actul de identitate nu este emis de România. Încarcă actul tău de identitate românesc.")
    if "[illegible]" in text.lower():
        raise UploadRejected("not_clear", f"{NOT_CLEAR}: o parte din text nu poate fi citită. {RETAKE}")
    unread = [f for f in KEY_FIELDS.get(doc.doc_type, [])
              if f not in doc.fields or doc.fields[f].value in (None, "", []) or doc.fields[f].confidence < LEGIBLE]
    if unread:
        raise UploadRejected("not_clear", f"{NOT_CLEAR}: nu am putut citi {', '.join(LABELS.get(f, f) for f in unread)}. {RETAKE}")
    if doc.doc_type == "id_card" and not cnp_is_valid(doc.fields["cnp"].value):
        raise UploadRejected("not_clear", f"{NOT_CLEAR}: CNP-ul nu a putut fi citit corect. {RETAKE}")


Gate = Callable[[CaseFile, Document, str], None]


def make_gate(playbooks, runs_dir: Path | None = None) -> Gate:
    """The full gate, for a server that reads documents (OCR on)."""
    from . import ingest
    from .checks.tamper import document_path

    def gate(case: CaseFile, doc: Document, expected: str) -> None:
        check_format(expected, doc.mime_type)
        check_resolution(document_path(case.case_id, doc, runs_dir), doc.mime_type)
        check_content(doc, expected, playbooks.get(case.playbook_id), ingest.ocr_pages(case, doc, runs_dir))

    return gate


def format_only(case: CaseFile, doc: Document, expected: str) -> None:
    """Without OCR (tests, a server that stores only), only the format can be checked."""
    check_format(expected, doc.mime_type)
