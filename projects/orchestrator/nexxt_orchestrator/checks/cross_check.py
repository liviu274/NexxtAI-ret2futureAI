from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, replace

from ..models import Document, Evidence, ExtractedField, Flag
from . import CheckContext, register
from .screening import name_score

FUZZY = 0.85


@dataclass
class Side:
    doc: Document
    field: ExtractedField
    values: list[str]


def plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).lower()


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", plain(text))


def same(a: str, b: str, mode: str) -> bool:
    if mode == "exact":
        return a.strip() == b.strip()
    if mode == "normalized":  # diacritics, case, punctuation and spacing do not count: "S.R.L." == "SRL"
        return "".join(tokens(a)) == "".join(tokens(b))
    return name_score(tokens(a), tokens(b)) >= FUZZY  # fuzzy: word order and small spelling slips do not count


def values_of(field: ExtractedField) -> list[str]:
    """One value, or every name of a person list (stored natively or as JSON text)."""
    value = field.value
    if isinstance(value, str) and value.lstrip().startswith("["):
        value = json.loads(value)
    if isinstance(value, list):
        return [str(p.get("full_name")) for p in value if isinstance(p, dict) and p.get("full_name")]
    if isinstance(value, dict):  # money
        return [f"{value.get('amount')} {value.get('currency')}"]
    return [str(value)] if value not in (None, "") else []


def documents(ctx: CheckContext, doc_type: str) -> list[Document]:
    """The person's own documents; company documents (no owner) when the person has none of that type."""
    own = ctx.documents(doc_type)
    if own or ctx.person_id is None:
        return own
    return [d for d in ctx.case.documents if d.doc_type == doc_type and d.owner_person_id is None]


def evidence(side: Side) -> Evidence:
    f = side.field
    return Evidence(doc_id=side.doc.doc_id, page=f.source.page, bbox=f.source.bbox, field_id=f.field_id, quote=f.raw_text)


@register("fields_match")
def fields_match(ctx: CheckContext) -> list[Flag]:
    # A person-level rule (e.g. each administrator vs the certificat) is checked once per person.
    if ctx.person_id is None and ctx.owner_ids:
        return [f for pid in sorted(ctx.owner_ids) for f in fields_match(replace(ctx, person_id=pid))]
    params = ctx.rule.params
    field_for = params.get("field_map") or {dt: params["field"] for dt in params["doc_types"]}
    mode = params.get("mode", "normalized")

    sides = []
    for doc_type in params["doc_types"]:
        for doc in documents(ctx, doc_type):
            field = doc.fields.get(field_for[doc_type])
            if field is not None and values_of(field):
                sides.append(Side(doc, field, values_of(field)))
    if len(sides) < 2:
        return []  # nothing to compare: missing documents and fields are other rules' flags

    ref, flags = sides[0], []
    for other in sides[1:]:
        # A person list matches when any of its people matches.
        if any(same(a, b, mode) for a in ref.values for b in other.values):
            continue
        person = next((p for p in ctx.case.persons if p.person_id == ctx.person_id), None)
        whose = f" for {person.full_name} ({person.role})" if person else ""
        flags.append(ctx.flag(
            title=f"{other.field.name} differs: {ref.doc.doc_type} vs {other.doc.doc_type}{whose}",
            explanation=(f"{ref.doc.doc_type} {ref.doc.doc_id} says {', '.join(ref.values)!s}; "
                         f"{other.doc.doc_type} {other.doc.doc_id} says {', '.join(other.values)!s} "
                         f"(compared {mode})."),
            evidence=[evidence(ref), evidence(other)],
            fix_vars={"person_name": person.full_name} if person else None,
        ))
    return flags


def money(field: ExtractedField | None) -> list[dict]:
    """Money amounts of a field: one {amount, currency}, or a list of them (one deposit per month)."""
    if field is None or field.value in (None, ""):
        return []
    values = field.value if isinstance(field.value, list) else [field.value]
    return [v for v in values if isinstance(v, dict) and isinstance(v.get("amount"), (int, float))]


@register("income_vs_deposits")
def income_vs_deposits(ctx: CheckContext) -> list[Flag]:
    """Declared net salary against the salary actually paid into the account (average of the deposits)."""
    if ctx.person_id is None and ctx.owner_ids:
        return [f for pid in sorted(ctx.owner_ids) for f in income_vs_deposits(replace(ctx, person_id=pid))]
    tolerance = float(ctx.rule.params.get("tolerance_pct", 10))
    payslip = next(((d, d.fields.get("net_salary")) for d in ctx.documents("payslip", "income_certificate")
                    if money(d.fields.get("net_salary"))), None)
    statement = next(((d, d.fields.get("salary_deposits")) for d in ctx.documents("bank_statement")
                      if money(d.fields.get("salary_deposits"))), None)
    if payslip is None or statement is None:
        return []  # a missing document or field is another rule's flag
    (pay_doc, net_field), (bank_doc, dep_field) = payslip, statement
    net, deposits = money(net_field)[0], money(dep_field)
    currencies = {net["currency"], *(d["currency"] for d in deposits)}
    sides = [evidence(Side(pay_doc, net_field, [])), evidence(Side(bank_doc, dep_field, []))]
    if len(currencies) > 1:
        return [ctx.flag(title="Salary and deposits are in different currencies",
                         explanation=f"Net salary {net['amount']} {net['currency']}; deposits in {', '.join(sorted(currencies))}. "
                                     "Compare manually.", evidence=sides)]
    average = sum(d["amount"] for d in deposits) / len(deposits)
    gap = abs(average - net["amount"]) / net["amount"] * 100 if net["amount"] else 100.0
    if gap <= tolerance:
        return []
    return [ctx.flag(title=f"Declared income differs from deposits by {gap:.0f}%",
                     explanation=f"Payslip net salary {net['amount']:.2f} {net['currency']}; average salary deposit "
                                 f"{average:.2f} {net['currency']} over {len(deposits)} deposit(s) on the bank statement "
                                 f"(tolerance {tolerance:g}%).",
                     evidence=sides, fix_vars={"tolerance_pct": tolerance})]
