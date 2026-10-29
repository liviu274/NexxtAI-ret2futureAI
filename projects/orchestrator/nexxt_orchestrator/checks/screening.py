from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

from ..models import Document, Evidence, Flag
from ..store import REPO_ROOT
from . import CheckContext, register, whole_doc_evidence

REGISTRIES_DIR = Path(os.environ.get("NEXXT_REGISTRIES_DIR", REPO_ROOT / "data" / "mock_registries"))
LISTS = {"mock_sanctions_v1": "sanctions_list.json", "mock_pep_v1": "pep_list.json", "mock_media_v1": "adverse_media.json"}
LEGAL_FORMS = {"srl", "sa", "sca", "snc", "scs", "pfa", "ii", "if", "ltd", "llc", "gmbh", "inc"}
ID_DOCS = ("id_card", "passport")
CONFIRM = 0.93
VARIANT = 0.80
CENTURY = {"1": 1900, "2": 1900, "3": 1800, "4": 1800, "5": 2000, "6": 2000}


@dataclass
class Match:
    entry: dict
    score: float
    kind: str
    reason: str


@dataclass
class Subject:
    name: str
    year: int | None
    id_number: str | None
    doc: Document | None
    person_id: str | None = None
    entity: bool = False  # the company itself: matched against company entries, no birth year or ID


def normalize(text: str) -> list[str]:
    stripped = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.findall(r"[a-z]+", stripped.lower())


def company_words(text: str) -> list[str]:
    """A company name without its legal form: "Fictiv Trade Holding S.R.L." -> fictiv, trade, holding."""
    return [w for w in normalize(text.replace(".", "")) if w not in LEGAL_FORMS]


def compact(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def name_score(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    free, total = list(b), 0.0
    for token in a:
        if not free:
            break
        best = max(free, key=lambda c: SequenceMatcher(None, token, c).ratio())
        total += SequenceMatcher(None, token, best).ratio()
        free.remove(best)
    return total / max(len(a), len(b))


def entry_name(entry: dict) -> str:
    return entry.get("nume_complet") or entry.get("nume_subiect") or ""


def entry_is_company(entry: dict) -> bool:
    return (entry.get("tip_entitate") or entry.get("tip_subiect")) == "companie"


def assess(subject: Subject, entry: dict) -> Match | None:
    if subject.entity != entry_is_company(entry):
        return None  # people are screened against people, the company against companies
    if subject.entity:
        score = name_score(company_words(subject.name), company_words(entry_name(entry)))
        return Match(entry, score, "confirmed", "company name matches") if score >= CONFIRM else None
    score = name_score(normalize(subject.name), normalize(entry_name(entry)))
    known = entry.get("act_identitate_cunoscut")
    if subject.id_number and known and compact(subject.id_number) == compact(known) and score >= 0.6:
        return Match(entry, score, "confirmed", "ID number matches")
    listed_year = entry.get("anul_nasterii")
    same_year = subject.year is not None and str(subject.year) == str(listed_year)
    if score >= CONFIRM:
        if same_year:
            return Match(entry, score, "confirmed", "name and birth year match")
        year = subject.year if subject.year is not None else "unknown"
        return Match(entry, score, "possible", f"name matches, birth year differs (client {year}, list {listed_year or 'unknown'})")
    if score >= VARIANT and same_year:
        return Match(entry, score, "possible", "similar spelling, same birth year")
    return None


@lru_cache(maxsize=None)
def load_list(list_name: str) -> list[dict]:
    return json.loads((REGISTRIES_DIR / LISTS[list_name]).read_text(encoding="utf-8"))


def birth_year(doc: Document) -> int | None:
    dob = doc.fields.get("date_of_birth")
    if dob and re.match(r"\d{4}-", str(dob.value or "")):
        return int(str(dob.value)[:4])
    cnp = doc.fields.get("cnp")
    digits = re.sub(r"\D", "", str(cnp.value)) if cnp and cnp.value else ""
    if len(digits) == 13 and digits[0] in CENTURY:
        return CENTURY[digits[0]] + int(digits[1:3])
    return None


def id_number(doc: Document) -> str | None:
    for name in ("series_number", "doc_number"):
        field = doc.fields.get(name)
        if field and field.value:
            return str(field.value)
    return None


def company_subject(ctx: CheckContext) -> Subject | None:
    certificate = next((d for d in ctx.case.documents if d.doc_type == "certificat_constatator"), None)
    name = (ctx.case.company or {}).get("name")
    if not name and certificate and certificate.fields.get("company_name"):
        name = certificate.fields["company_name"].value
    return Subject(str(name), None, None, certificate, entity=True) if name else None


def subjects(ctx: CheckContext) -> list[Subject]:
    if ctx.rule.applies_to == "company":
        company = company_subject(ctx)
        return [company] if company else []
    found = []
    for person in ctx.case.persons:
        if person.person_id not in ctx.owner_ids:
            continue
        docs = [d for d in ctx.documents(*ID_DOCS) if d.owner_person_id == person.person_id]
        year = next((y for y in (birth_year(d) for d in docs) if y is not None), None)
        number = next((n for n in (id_number(d) for d in docs) if n), None)
        found.append(Subject(person.full_name, year, number, docs[0] if docs else None, person.person_id))
    return found


def evidence_for(ctx: CheckContext, subject: Subject) -> Evidence:
    if subject.doc is not None:
        field = subject.doc.fields.get("company_name" if subject.entity else "full_name")
        if field is not None:
            return Evidence(doc_id=subject.doc.doc_id, page=field.source.page, bbox=field.source.bbox,
                            field_id=field.field_id, quote=field.raw_text)
        return whole_doc_evidence(subject.doc, subject.name)
    return whole_doc_evidence(ctx.case.documents[0], subject.name)


def describe(match: Match) -> str:
    e = match.entry
    if "id_stire" in e:
        return (f"{e['id_stire']}: \"{e['titlu_stire']}\" ({e['sursa_stire']}, {e['an_publicare']}; "
                f"{', '.join(e.get('cuvinte_cheie_risc') or [])}; risk {e.get('nivel_risc')}) - {match.reason}, name similarity {match.score:.2f}")
    return (f"{e['id_sursa']}: {e['nume_complet']} ({e.get('anul_nasterii') or 'n/a'}, {e['cetatenie']}, {e['motiv_includere']})"
            f" - {match.reason}, name similarity {match.score:.2f}")


def matches_for(subject: Subject, list_name: str) -> list[Match]:
    found = [m for m in (assess(subject, e) for e in load_list(list_name)) if m]
    return sorted(found, key=lambda m: (m.kind != "confirmed", -m.score))


def make_check(label: str, default_list: str | None = None, incomplete: bool = True):
    def check(ctx: CheckContext) -> list[Flag]:
        list_name = ctx.rule.params.get("list") or default_list
        flags = []
        for subject in subjects(ctx):
            matches = matches_for(subject, list_name)
            gaps = []
            # A missing ID is required_present's flag (it blocks the case, and screening runs again once the ID
            # arrives). An ID whose birth year cannot be read is a real gap in this screening.
            if incomplete and not subject.entity and subject.doc is not None and subject.year is None:
                gaps.append("birth year not available")
            note = f" Screening incomplete: {', '.join(gaps)}." if gaps else ""
            if matches:
                best = matches[0]
                confirmed = best.kind == "confirmed"
                title = f"{label} hit: {entry_name(best.entry)}" if confirmed else f"Possible {label} match: {entry_name(best.entry)}"
                lead = "Confirmed" if confirmed else "Possible match, analyst must confirm"
                explanation = f"{lead}. " + " | ".join(describe(m) for m in matches[:3]) + note
            elif gaps:
                title = f"{label} screening incomplete: {subject.name}"
                explanation = f"No match found, but the check cannot be trusted:{note[len(' Screening incomplete:'):]}"
            else:
                continue
            flag = ctx.flag(title=title, explanation=explanation, evidence=[evidence_for(ctx, subject)])
            flags.append(flag.model_copy(update={"person_id": subject.person_id}))
        return flags

    return check


register("sanctions")(make_check("sanctions"))
register("pep")(make_check("PEP"))
register("adverse_media")(make_check("adverse media", default_list="mock_media_v1", incomplete=False))


def screening_detail(ctx: CheckContext, person_id: str | None) -> dict | None:
    """The best list entry behind a screening flag, next to what the case knows about the client, for the analyst's
    side-by-side view. Recomputed from the lists, so it always shows what the check saw."""
    subject = next((s for s in subjects(ctx) if s.person_id == person_id), None)
    if subject is None:
        return None
    found = matches_for(subject, ctx.rule.params.get("list") or "mock_media_v1")
    if not found:
        return None
    best = found[0]
    citizenship = "RO" if subject.doc is not None and subject.doc.doc_type == "id_card" else None
    return {"entry": best.entry, "score": round(best.score * 100), "kind": best.kind, "reason": best.reason,
            "client": {"name": subject.name, "birth_year": subject.year, "citizenship": citizenship,
                       "identity_document": subject.id_number, "is_company": subject.entity}}
