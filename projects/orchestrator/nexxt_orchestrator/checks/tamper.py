"""Tamper detection (Person 4): pdf_metadata, font_consistency, totals_consistency.

The ID is uploaded as a photo, the other documents as PDFs, so pdf_metadata reads both. File type comes from the
file header, not from the declared MIME type or extension. Personal data (CNP, GPS, names) is never copied into
flag text: only tool names and dates are quoted.

These checks never decide anything. They raise flags with evidence; severity comes from the playbook rule.
A file that cannot be opened raises, so the orchestrator turns it into a medium "could not run" flag.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTTextContainer, LTTextLine
from pdfminer.pdfdocument import PDFDocument
from pdfminer.pdfparser import PDFParser
from pdfminer.pdftypes import resolve1

from ..models import Document, Evidence, ExtractedField, Flag
from ..store import DEFAULT_RUNS_DIR, REPO_ROOT
from . import CheckContext, register, whole_doc_evidence


# Software that edits or re-renders an existing document. Office suites and PDF printers are not listed:
# they create legitimate documents, so only the dates and revisions can tell on them.
EDITORS = re.compile(
    r"photoshop|illustrator|gimp|inkscape|canva|ilovepdf|smallpdf|sejda|pdfescape|pdf24|lightpdf|pdffiller"
    r"|foxit\s*phantom|nitro|pdf-?xchange|pdf\s*editor|pdfelement|online2pdf|pixlr"
    r"|snapseed|picsart|facetune|paint\.net|affinity|pixelmator|photopea|fotor|befunky",
    re.I,
)
EDIT_GRACE = timedelta(seconds=60)
MONEY_TOLERANCE = Decimal("0.01")


def document_path(case_id: str, doc: Document, runs_dir: Path | None = None) -> Path:
    """Where the uploaded file lives: absolute, in the case's upload folder (<runs>/<case_id>/<doc.file>, where the
    upload API stores it), under NEXXT_DOCS_DIR, or under NEXXT_DOCS_DIR/<case_id>."""
    docs_dir = Path(os.environ.get("NEXXT_DOCS_DIR", REPO_ROOT / "data"))
    uploads = Path(runs_dir or DEFAULT_RUNS_DIR) / case_id
    for candidate in (Path(doc.file), uploads / doc.file, docs_dir / doc.file, docs_dir / case_id / doc.file):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"{doc.doc_id}: file not found ({doc.file}); set NEXXT_DOCS_DIR")


def owned_documents(ctx: CheckContext, doc_types: list[str] | None = None) -> list[Document]:
    owners = ctx.owner_ids
    return [
        d for d in ctx.case.documents
        if (not doc_types or d.doc_type in doc_types) and (d.owner_person_id in owners if owners else d.owner_person_id is None)
    ]


def file_kind(path: Path) -> str:
    """'pdf', 'image' or 'other', from the file header."""
    with path.open("rb") as handle:
        head = handle.read(1024)
    if b"%PDF-" in head:
        return "pdf"
    try:
        with Image.open(path):
            return "image"
    except (UnidentifiedImageError, OSError):
        return "other"


# --- pdf_metadata -----------------------------------------------------------------------------------------------


@dataclass
class PdfFacts:
    producers: list[str]
    creators: list[str]
    created: datetime | None
    modified: datetime | None
    eof_count: int
    linearized: bool

    @property
    def revisions(self) -> int:
        """Updates appended after the first save (a linearized file legitimately has two %%EOF)."""
        return max(0, self.eof_count - 1 - int(self.linearized))


def _text(value: object) -> str | None:
    value = resolve1(value)
    if isinstance(value, bytes):
        if value[:2] in (b"\xfe\xff", b"\xff\xfe"):
            return value.decode("utf-16", errors="replace").strip()
        return value.decode("latin-1").strip()
    return str(value).strip() if value is not None else None


_PDF_DATE = re.compile(r"D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?(?:([Zz+-])(\d\d)?'?(\d\d)?)?")


def parse_pdf_date(raw: str | None) -> datetime | None:
    match = _PDF_DATE.match(raw or "")
    if not match:
        return None
    year, month, day, hour, minute, second, sign, tz_h, tz_m = match.groups()
    offset = timedelta(hours=int(tz_h or 0), minutes=int(tz_m or 0))
    tz = timezone(-offset if sign == "-" else offset)
    try:
        return datetime(int(year), int(month or 1), int(day or 1), int(hour or 0), int(minute or 0), int(second or 0), tzinfo=tz)
    except ValueError:
        return None


def read_pdf_facts(path: Path) -> PdfFacts:
    raw = path.read_bytes()
    infos = []
    with path.open("rb") as handle:
        for info in PDFDocument(PDFParser(handle)).info:  # one dict per revision, so an old Producer is not lost
            infos.append({key: _text(value) for key, value in info.items()})
    dates = lambda key: [d for d in (parse_pdf_date(i.get(key)) for i in infos) if d]  # noqa: E731
    return PdfFacts(
        producers=sorted({i["Producer"] for i in infos if i.get("Producer")}),
        creators=sorted({i["Creator"] for i in infos if i.get("Creator")}),
        created=min(dates("CreationDate"), default=None),
        modified=max(dates("ModDate"), default=None),
        eof_count=raw.count(b"%%EOF"),
        linearized=b"/Linearized" in raw[:1024],
    )


def metadata_findings(facts: PdfFacts, issue_date: date | None) -> list[str]:
    findings = []
    editors = [name for name in (*facts.producers, *facts.creators) if EDITORS.search(name)]
    if editors:
        findings.append(f"saved by editing software ({', '.join(sorted(set(editors)))})")
    if facts.created and facts.modified and facts.modified - facts.created > EDIT_GRACE:
        findings.append(f"modified {facts.modified:%Y-%m-%d %H:%M} after it was created {facts.created:%Y-%m-%d %H:%M}")
    if issue_date and facts.modified and facts.modified.date() > issue_date:
        findings.append(f"modification date {facts.modified:%Y-%m-%d} is after the issue date {issue_date.isoformat()}")
    if facts.revisions:
        findings.append(f"{facts.eof_count} %%EOF markers: the file was saved incrementally {facts.revisions} time(s) after the first save")
    return findings


def _issue_date(doc: Document) -> date | None:
    field = doc.fields.get("issue_date")
    try:
        return date.fromisoformat(str(field.value)) if field and field.value else None
    except ValueError:
        return None


@dataclass
class ImageFacts:
    software: list[str]
    captured: datetime | None
    modified: datetime | None


_XMP_TOOL = re.compile(rb'(?:CreatorTool|softwareAgent)(?:="([^"]+)"|>([^<]+)<)')


def _exif_date(value: object) -> datetime | None:
    try:
        return datetime.strptime(str(value).strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def read_image_facts(path: Path) -> ImageFacts:
    """EXIF, PNG text chunks and XMP. A stripped file (WhatsApp, screenshots) simply has nothing to report."""
    with Image.open(path) as img:
        exif = img.getexif()
        exif_ifd = exif.get_ifd(0x8769)
        software = [str(v).strip() for v in (exif.get(305), img.info.get("Software")) if v]
        modified, captured = _exif_date(exif.get(306)), _exif_date(exif_ifd.get(0x9003))
    xmp = path.read_bytes()
    software += [(a or b).decode("utf-8", "replace").strip() for a, b in _XMP_TOOL.findall(xmp)]
    return ImageFacts(software=sorted(set(software)), captured=captured, modified=modified)


def image_findings(facts: ImageFacts) -> list[str]:
    findings = []
    editors = [name for name in facts.software if EDITORS.search(name)]
    if editors:
        findings.append(f"image was saved by editing software ({', '.join(editors)})")
    if facts.captured and facts.modified and facts.modified - facts.captured > EDIT_GRACE:
        findings.append(f"image was re-saved {facts.modified:%Y-%m-%d %H:%M} after it was captured {facts.captured:%Y-%m-%d %H:%M}")
    return findings


@register("pdf_metadata")
def pdf_metadata(ctx: CheckContext) -> list[Flag]:
    """File metadata of every uploaded document: PDF revisions and producers, or EXIF/XMP of a photo."""
    flags = []
    for doc in owned_documents(ctx, ctx.rule.params.get("doc_types")):
        path = document_path(ctx.case.case_id, doc, ctx.runs_dir)
        kind = file_kind(path)
        if kind == "pdf":
            facts = read_pdf_facts(path)
            findings, quote = metadata_findings(facts, _issue_date(doc)), f"Producer: {', '.join(facts.producers) or '-'}"
            title, noun = f"PDF edited after issue: {doc.doc_type}", "PDF"
        elif kind == "image":
            image = read_image_facts(path)
            findings, quote = image_findings(image), f"Software: {', '.join(image.software) or '-'}"
            title, noun = f"Photo edited after capture: {doc.doc_type}", "photo"
        else:
            raise ValueError(f"{doc.doc_id}: unsupported file type, manual review required")
        if not findings:
            continue
        flags.append(ctx.flag(
            title=title,
            explanation=f"{doc.doc_type} ({doc.doc_id}) {noun} shows signs of later modification: " + "; ".join(findings) + ".",
            evidence=[whole_doc_evidence(doc, quote)],
        ))
    return flags


# --- font_consistency -------------------------------------------------------------------------------------------


def font_family(name: str) -> str:
    """'AAAAAA+TimesNewRomanPS-BoldMT' -> 'timesnewroman'; bold vs regular of one family is not a signal."""
    name = name.split("+", 1)[-1]
    name = re.split(r"[-,]", name, maxsplit=1)[0]
    name = re.sub(r"(PS|MT)+$", "", name)
    return re.sub(r"[^a-z]", "", name.lower())


@dataclass
class MixedLine:
    page: int
    bbox: list[float]
    text: str
    families: list[str]


def mixed_font_lines(path: Path) -> list[MixedLine]:
    found = []
    for page_no, page in enumerate(extract_pages(path), start=1):
        for container in page:
            if not isinstance(container, LTTextContainer):
                continue
            for line in container:
                if not isinstance(line, LTTextLine):
                    continue
                chars = [c for c in line if isinstance(c, LTChar) and c.get_text().strip()]
                families = sorted({font_family(c.fontname) for c in chars})
                if len(families) > 1:
                    x0, y0, x1, y1 = line.bbox
                    bbox = [x0 / page.width, 1 - y1 / page.height, x1 / page.width, 1 - y0 / page.height]
                    found.append(MixedLine(page_no, [round(v, 6) for v in bbox], line.get_text().strip(), families))
    return found


def overlapping_field(doc: Document, page: int, bbox: list[float]) -> ExtractedField | None:
    def overlap(f: ExtractedField) -> float:
        a, b = bbox, f.source.bbox
        w = min(a[2], b[2]) - max(a[0], b[0])
        h = min(a[3], b[3]) - max(a[1], b[1])
        return w * h if w > 0 and h > 0 else 0.0

    candidates = [f for f in doc.fields.values() if f.source.page == page and overlap(f) > 0]
    return max(candidates, key=overlap, default=None)


@register("font_consistency")
def font_consistency(ctx: CheckContext) -> list[Flag]:
    flags = []
    for doc in owned_documents(ctx, ctx.rule.params.get("doc_types")):
        path = document_path(ctx.case.case_id, doc, ctx.runs_dir)
        if file_kind(path) != "pdf":
            continue  # a photo has no text layer; the ID photo is covered by pdf_metadata
        lines = mixed_font_lines(path)
        if not lines:
            continue
        evidence = []
        for line in lines:
            field = overlapping_field(doc, line.page, line.bbox)
            evidence.append(Evidence(doc_id=doc.doc_id, page=line.page, bbox=line.bbox,
                                     field_id=field.field_id if field else None, quote=line.text))
        shown = "; ".join(f'"{ln.text}" mixes {" + ".join(ln.families)}' for ln in lines[:3])
        flags.append(ctx.flag(
            title=f"Mixed fonts inside one line: {doc.doc_type}",
            explanation=f"{len(lines)} line(s) of {doc.doc_type} ({doc.doc_id}) use different font families, "
                        f"which is typical of a value that was retyped: {shown}.",
            evidence=evidence,
        ))
    return flags


# --- totals_consistency -----------------------------------------------------------------------------------------


def amount(field: ExtractedField | None) -> tuple[Decimal, str | None] | None:
    if field is None or field.value is None:
        return None
    value = field.value
    try:
        if isinstance(value, dict):
            return Decimal(str(value["amount"])), value.get("currency")
        return Decimal(str(value)), None
    except (InvalidOperation, KeyError):
        return None


def payslip_deductions(doc: Document) -> tuple[Decimal, list[ExtractedField]] | None:
    """CAS + CASS + income tax when printed separately, else the single 'deductions' total."""
    names = [n for n in ("cas", "cass", "income_tax", "deductions")]
    for group in (names[:3], names[3:]):
        fields = [doc.fields.get(n) for n in group]
        amounts = [amount(f) for f in fields]
        if all(a is not None for a in amounts):
            return sum((a[0] for a in amounts if a), Decimal(0)), [f for f in fields if f]
    return None


@register("totals_consistency")
def totals_consistency(ctx: CheckContext) -> list[Flag]:
    doc_type = ctx.rule.params.get("doc_type", "payslip")
    if doc_type != "payslip":
        raise ValueError(f"totals_consistency has no formula for doc_type '{doc_type}'")
    flags = []
    for doc in owned_documents(ctx, [doc_type]):
        gross, net = amount(doc.fields.get("gross_salary")), amount(doc.fields.get("net_salary"))
        deductions = payslip_deductions(doc)
        if gross is None or net is None or deductions is None:
            continue  # a missing field is the job of field_present, not of tamper detection
        expected = gross[0] - deductions[0]
        if abs(expected - net[0]) <= MONEY_TOLERANCE:
            continue
        currency = net[1] or gross[1] or ""
        net_field, gross_field = doc.fields["net_salary"], doc.fields["gross_salary"]
        evidence = [
            Evidence(doc_id=doc.doc_id, page=f.source.page, bbox=f.source.bbox, field_id=f.field_id, quote=f.raw_text)
            for f in (net_field, gross_field, *deductions[1])
        ]
        flags.append(ctx.flag(
            title=f"Payslip net does not add up: {net[0]:.2f} vs {expected:.2f}",
            explanation=f"Gross {gross[0]:.2f} - deductions {deductions[0]:.2f} = {expected:.2f} {currency}, "
                        f"but the payslip shows net {net[0]:.2f} {currency} (difference {net[0] - expected:+.2f}).",
            evidence=evidence,
        ))
    return flags
