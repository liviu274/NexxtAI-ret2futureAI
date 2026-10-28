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
LISTS = {"mock_sanctions_v1": "sanctions_list.json", "mock_pep_v1": "pep_list.json"}
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


def normalize(text: str) -> list[str]:
    stripped = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.findall(r"[a-z]+", stripped.lower())


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


def assess(subject: Subject, entry: dict) -> Match | None:
    score = name_score(normalize(subject.name), normalize(entry["nume_complet"]))
    known = entry.get("act_identitate_cunoscut")
    if subject.id_number and known and compact(subject.id_number) == compact(known) and score >= 0.6:
        return Match(entry, score, "confirmed", "ID number matches")
    same_year = subject.year is not None and str(subject.year) == entry["anul_nasterii"]
    if score >= CONFIRM:
        if same_year:
            return Match(entry, score, "confirmed", "name and birth year match")
        year = subject.year if subject.year is not None else "unknown"
        return Match(entry, score, "possible", f"name matches, birth year differs (client {year}, list {entry['anul_nasterii']})")
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


def subjects(ctx: CheckContext) -> list[Subject]:
    found = []
    for person in ctx.case.persons:
        if person.person_id not in ctx.owner_ids:
            continue
        docs = [d for d in ctx.documents(*ID_DOCS) if d.owner_person_id == person.person_id]
        year = next((y for y in (birth_year(d) for d in docs) if y is not None), None)
        number = next((n for n in (id_number(d) for d in docs) if n), None)
        found.append(Subject(person.full_name, year, number, docs[0] if docs else None))
    return found


def evidence_for(ctx: CheckContext, subject: Subject) -> Evidence:
    if subject.doc is not None:
        field = subject.doc.fields.get("full_name")
        if field is not None:
            return Evidence(doc_id=subject.doc.doc_id, page=field.source.page, bbox=field.source.bbox,
                            field_id=field.field_id, quote=field.raw_text)
        return whole_doc_evidence(subject.doc, subject.name)
    return whole_doc_evidence(ctx.case.documents[0], subject.name)


def describe(match: Match) -> str:
    e = match.entry
    return (f"{e['id_sursa']}: {e['nume_complet']} ({e['anul_nasterii']}, {e['cetatenie']}, {e['motiv_includere']})"
            f" - {match.reason}, name similarity {match.score:.2f}")


def make_check(label: str):
    def check(ctx: CheckContext) -> list[Flag]:
        entries = load_list(ctx.rule.params["list"])
        flags = []
        for subject in subjects(ctx):
            matches = [m for m in (assess(subject, e) for e in entries) if m]
            matches.sort(key=lambda m: (m.kind != "confirmed", -m.score))
            gaps = []
            if subject.doc is None:
                gaps.append("no identity document")
            elif subject.year is None:
                gaps.append("birth year not available")
            note = f" Screening incomplete: {', '.join(gaps)}." if gaps else ""
            if matches:
                best = matches[0]
                confirmed = best.kind == "confirmed"
                title = f"{label} hit: {best.entry['nume_complet']}" if confirmed else f"Possible {label} match: {best.entry['nume_complet']}"
                lead = "Confirmed" if confirmed else "Possible match, analyst must confirm"
                explanation = f"{lead}. " + " | ".join(describe(m) for m in matches[:3]) + note
            elif gaps:
                title = f"{label} screening incomplete: {subject.name}"
                explanation = f"No match found, but the check cannot be trusted:{note[len(' Screening incomplete:'):]}"
            else:
                continue
            flags.append(ctx.flag(title=title, explanation=explanation, evidence=[evidence_for(ctx, subject)]))
        return flags

    return check


register("sanctions")(make_check("sanctions"))
register("pep")(make_check("PEP"))
