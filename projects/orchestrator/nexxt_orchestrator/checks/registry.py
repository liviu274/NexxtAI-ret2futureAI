from __future__ import annotations

import json
import re
from functools import lru_cache

from ..models import Document, Evidence, ExtractedField, Flag
from . import CheckContext, register, whole_doc_evidence
from .screening import REGISTRIES_DIR, normalize

ONRC_FILE = "onrc_registry.json"


@lru_cache(maxsize=None)
def load_registry() -> dict:
    return json.loads((REGISTRIES_DIR / ONRC_FILE).read_text(encoding="utf-8"))["companies"]


def compact_cui(value: object) -> str:
    return re.sub(r"\D", "", str(value or ""))


def person_list(field: ExtractedField | None) -> list[dict] | None:
    """A list of people, stored natively or as JSON text (case_file.extracted.json)."""
    if field is None or field.value is None:
        return None
    value = field.value
    if isinstance(value, str):
        value = json.loads(value)
    return value if isinstance(value, list) else None


def company_cui(ctx: CheckContext) -> str | None:
    """The CUI to look up: the case's company, else the certificat constatator. Never the declaration being checked."""
    if ctx.case.company and ctx.case.company.get("cui"):
        return compact_cui(ctx.case.company["cui"])
    for doc in ctx.documents("certificat_constatator"):
        field = doc.fields.get("cui")
        if field and field.value:
            return compact_cui(field.value)
    return None


def same_person(a: dict, b: dict) -> bool:
    """By CNP when both sides have one, else by name (word order, case and diacritics ignored)."""
    cnp_a, cnp_b = (re.sub(r"\D", "", str(p.get("cnp") or "")) for p in (a, b))
    if cnp_a and cnp_b:
        return cnp_a == cnp_b
    return sorted(normalize(a.get("full_name", ""))) == sorted(normalize(b.get("full_name", "")))


def describe(people: list[dict]) -> str:
    return ", ".join(f"{p.get('full_name')} {p.get('ownership_pct', '?')}%" for p in people) or "none"


def differences(registry: list[dict], declared: list[dict]) -> list[str]:
    found = []
    for p in declared:
        if not any(same_person(p, r) for r in registry):
            found.append(f"{p.get('full_name')} is declared as UBO but is not a UBO in the registry")
    for r in registry:
        match = next((p for p in declared if same_person(p, r)), None)
        if match is None:
            found.append(f"{r.get('full_name')} is a UBO in the registry but is missing from the declaration")
        elif r.get("ownership_pct") != match.get("ownership_pct"):
            found.append(f"{r.get('full_name')}: {match.get('ownership_pct')}% declared, "
                         f"{r.get('ownership_pct')}% in the registry")
    return found


def field_evidence(doc: Document, field: ExtractedField | None) -> Evidence:
    if field is None:
        return whole_doc_evidence(doc)
    return Evidence(doc_id=doc.doc_id, page=field.source.page, bbox=field.source.bbox,
                    field_id=field.field_id, quote=field.raw_text)


@register("registry_vs_declaration")
def registry_vs_declaration(ctx: CheckContext) -> list[Flag]:
    flags = []
    for doc in ctx.documents("ubo_declaration"):  # a missing declaration is required_present's flag
        field = doc.fields.get("ubos")
        evidence = [field_evidence(doc, field)]
        declared = person_list(field)
        cui = company_cui(ctx)
        company = load_registry().get(cui) if cui else None
        if declared is None:
            flags.append(ctx.flag(
                title="UBO declaration cannot be compared with the registry",
                explanation="The beneficial owners were not extracted from the UBO declaration, "
                            "so they could not be checked against the ONRC registry.",
                evidence=evidence))
        elif company is None:
            flags.append(ctx.flag(
                title="Company not found in the ONRC registry",
                explanation=f"No registry entry for CUI {cui or 'unknown'}; the declared beneficial owners "
                            f"({describe(declared)}) could not be verified.",
                evidence=evidence))
        else:
            found = differences(company.get("ubos", []), declared)
            if found:
                flags.append(ctx.flag(
                    title="UBO declaration does not match the ONRC registry",
                    explanation=f"ONRC registry ({company.get('name')}, CUI {cui}): {describe(company.get('ubos', []))}. "
                                f"Declaration: {describe(declared)}. " + "; ".join(found) + ".",
                    evidence=evidence))
    return flags
