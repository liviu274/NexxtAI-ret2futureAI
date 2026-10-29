"""risk_factors: the draft risk grade (low / medium / high) from the playbook's factors, never a decision.

Factors (rule params `factors`): `country` (residence / registration), `occupation`, `caen_code`, `pep`. The demo
values live in data/mock_registries/risk_factors.json. Open flags add to the grade only when they say something about
the client (possible fraud, a sanctions or PEP hit); a document still to be uploaded is not a risk.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

from ..models import RiskDraft, RiskReason
from . import CheckContext, register
from .registry import company_cui, load_registry
from .screening import REGISTRIES_DIR

RANK = {"low": 0, "medium": 1, "high": 2}
ACTIVE = ("open", "sent_to_client")


@lru_cache(maxsize=None)
def load_factors() -> dict:
    return json.loads((REGISTRIES_DIR / "risk_factors.json").read_text(encoding="utf-8"))


def country_level(code: str | None) -> tuple[str, str]:
    countries = load_factors()["countries"]
    code = (code or "").upper()
    if code in countries["high"]:
        return "high", f"{code}: {countries['high'][code]}"
    if code in countries["medium"]:
        return "medium", f"{code}: {countries['medium'][code]}"
    if code in countries["low"]:
        return "low", code
    return "medium", f"{code or 'necunoscută'}: țară nelistată, verificare manuală"


def field_value(ctx: CheckContext, doc_types: tuple[str, ...], name: str) -> str | None:
    owners = ctx.owner_ids
    for doc in ctx.case.documents:
        if doc.doc_type in doc_types and (not owners or doc.owner_person_id in owners or doc.owner_person_id is None):
            field = doc.fields.get(name)
            if field is not None and field.value not in (None, ""):
                return str(field.value)
    return None


def country_reasons(ctx: CheckContext) -> list[tuple[str, str]]:
    if ctx.rule.applies_to == "company":
        company = load_registry().get(company_cui(ctx) or "") or {}
        found = [("Țara de înregistrare a firmei", company.get("country"))]
        for person in company.get("administrators", []) + company.get("ubos", []):
            found.append((f"Rezidența {person.get('full_name')}", person.get("country_of_residence") or person.get("country")))
        known = [(label, code) for label, code in found if code]
        return [(label, code) for label, code in known] or [("Țara de înregistrare a firmei", None)]
    # A Romanian identity card means residence in Romania (PF-ONB-01, 1.2); a passport alone does not say where.
    if any(d.doc_type == "id_card" and (not ctx.owner_ids or d.owner_person_id in ctx.owner_ids) for d in ctx.case.documents):
        return [("Țara de rezidență (carte de identitate românească)", "RO")]
    return [("Țara de rezidență", None)]


def keyword_level(text: str, table: dict[str, list[str]]) -> tuple[str, str] | None:
    lowered = text.lower()
    for level in ("high", "medium"):
        hit = next((k for k in table[level] if k in lowered), None)
        if hit:
            return level, hit
    return None


@register("risk_factors")
def risk_factors(ctx: CheckContext) -> RiskDraft:
    factors = ctx.rule.params.get("factors") or ["country", "occupation", "pep"]
    level, reasons = "low", []

    def add(text: str, grade: str, flag_ids: list[str] | None = None) -> None:
        nonlocal level
        level = max(level, grade, key=RANK.__getitem__)
        reasons.append(RiskReason(text=f"{text} (risc {'scăzut' if grade == 'low' else 'mediu' if grade == 'medium' else 'ridicat'})",
                                  flag_ids=flag_ids or []))

    if "country" in factors:
        for label, code in country_reasons(ctx):
            grade, why = country_level(code)
            add(f"{label}: {why}", grade)
    if "occupation" in factors:
        occupation = field_value(ctx, ("payslip", "income_certificate"), "occupation")
        employer = field_value(ctx, ("payslip", "income_certificate"), "employer")
        text = " ".join(v for v in (occupation, employer) if v)
        hit = keyword_level(text, load_factors()["occupation"]) if text else None
        if hit:
            add(f"Ocupație / angajator ({text}): domeniu cu risc ({hit[1]})", hit[0])
        elif text:
            add(f"Ocupație / angajator: {text}", "low")
        else:
            add("Ocupația nu reiese din documente; de confirmat cu clientul", "medium")
    if "caen_code" in factors:
        caen = field_value(ctx, ("certificat_constatator",), "caen_code") or \
            (load_registry().get(company_cui(ctx) or "") or {}).get("caen_code")
        code = re.sub(r"\D", "", str(caen or ""))[:4]
        table = load_factors()["caen"]
        if code in table["high"]:
            add(f"Cod CAEN {code}: {table['high'][code]}", "high")
        elif code in table["medium"]:
            add(f"Cod CAEN {code}: {table['medium'][code]}", "medium")
        elif code:
            add(f"Cod CAEN {code}: activitate fără risc specific", "low")
        else:
            add("Codul CAEN nu este disponibil", "medium")

    flags = [f for f in ctx.case.flags if f.status in ACTIVE]
    if "pep" in factors:
        pep = [f for f in flags if f.stage == "screening" and "PEP" in f.title]
        if pep:
            add("Persoană expusă public: măsuri suplimentare și aprobarea conformității", "high", [f.flag_id for f in pep])
        else:
            add("Nicio potrivire PEP deschisă", "low")
    sanctions = [f for f in flags if f.stage == "screening" and "sanctions" in f.title.lower()]
    if sanctions:
        add("Potrivire pe lista de sancțiuni, de confirmat", "high", [f.flag_id for f in sanctions])
    media = [f for f in flags if f.stage == "screening" and "adverse media" in f.title.lower()]
    if media:
        add("Informații negative în presă", "medium", [f.flag_id for f in media])
    integrity = [f for f in flags if f.stage in ("tamper", "cross_check") and not f.client_fixable and f.severity in ("high", "critical")]
    if integrity:
        add("Semne de documente modificate sau neconcordante", "high", [f.flag_id for f in integrity])
    pending = [f for f in flags if f.client_fixable]
    if pending:
        reasons.append(RiskReason(text=f"{len(pending)} documente/date în așteptare de la client (nu schimbă gradul de risc)",
                                  flag_ids=[f.flag_id for f in pending]))
    return RiskDraft(level=level, reasons=reasons)
