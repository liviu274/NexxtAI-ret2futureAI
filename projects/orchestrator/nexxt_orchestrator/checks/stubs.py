from __future__ import annotations

from dataclasses import replace
from datetime import date

from ..models import Document, Evidence, Flag, RiskDraft, RiskReason
from . import CHECKS, CheckContext, register, whole_doc_evidence

CATALOG = [
    "required_present", "not_expired", "max_age_days", "field_present",
    "fields_match", "income_vs_deposits", "registry_vs_declaration",
    "pdf_metadata", "font_consistency", "totals_consistency", "id_integrity",
    "sanctions", "pep", "adverse_media", "risk_factors",
]


def _first_field_evidence(doc: Document) -> Evidence:
    for field in doc.fields.values():
        return Evidence(
            doc_id=doc.doc_id, page=field.source.page, bbox=field.source.bbox,
            field_id=field.field_id, quote=field.raw_text,
        )
    return whole_doc_evidence(doc)


@register("required_present")
def required_present(ctx: CheckContext) -> list[Flag]:
    # A role-level rule (e.g. id_card for ubo) applies once per person with that role:
    # one UBO's ID must not satisfy the requirement for another UBO.
    if ctx.person_id is None and ctx.owner_ids:
        return [f for pid in sorted(ctx.owner_ids) for f in required_present(replace(ctx, person_id=pid))]
    doc_type = ctx.rule.params["doc_type"]
    min_count = int(ctx.rule.params.get("min_count", 1))
    required = next((r for r in ctx.playbook.required_documents if r.doc_type == doc_type), None)
    accepted = (doc_type, *(required.alternatives if required else ()))
    found = ctx.documents(*accepted)
    if len(found) >= min_count:
        return []
    own = [d for d in ctx.case.documents if ctx.person_id and d.owner_person_id == ctx.person_id]
    anchor = (found or own or ctx.case.documents or [None])[0]
    if anchor is None:
        return []
    person = next((p for p in ctx.case.persons if p.person_id == ctx.person_id), None)
    whose = f" for {person.full_name} ({person.role})" if person else ""
    return [
        ctx.flag(
            title=f"Only {len(found)} of {min_count} {doc_type} documents uploaded{whose}",
            explanation=f"The procedure requires {min_count} x {doc_type}{whose}; {len(found)} received.",
            evidence=[_first_field_evidence(anchor)],
            fix_vars={"min_count": min_count, "found_count": len(found),
                      **({"person_name": person.full_name} if person else {})},
        )
    ]


@register("not_expired")
def not_expired(ctx: CheckContext) -> list[Flag]:
    doc_type, field_name = ctx.rule.params["doc_type"], ctx.rule.params["field"]
    flags = []
    for doc in ctx.documents(doc_type):
        field = doc.fields.get(field_name)
        if field is None or not field.value:
            continue
        if date.fromisoformat(str(field.value)) < ctx.today:
            flags.append(
                ctx.flag(
                    title=f"{doc_type} expired",
                    explanation=f"{doc_type} expired on {field.value}, before {ctx.today.isoformat()}.",
                    evidence=[Evidence(doc_id=doc.doc_id, page=field.source.page, bbox=field.source.bbox,
                                       field_id=field.field_id, quote=field.raw_text)],
                    fix_vars={field_name: field.raw_text},
                )
            )
    return flags


def _noop(ctx: CheckContext) -> list[Flag]:
    return []


def _risk_stub(ctx: CheckContext) -> RiskDraft:
    open_flags = [f for f in ctx.case.flags if f.status in ("open", "sent_to_client")]
    level = "high" if any(f.severity in ("high", "critical") for f in open_flags) else (
        "medium" if open_flags else "low")
    reasons = [RiskReason(text=f"{f.title} ({f.rule_id})", flag_ids=[f.flag_id]) for f in open_flags]
    return RiskDraft(level=level, reasons=reasons or [RiskReason(text="No flags raised.")])


for _name in CATALOG:
    # Import order must not matter: a real implementation registered before this module loads is kept.
    if _name not in ("required_present", "not_expired") and _name not in CHECKS:
        register(_name)(_risk_stub if _name == "risk_factors" else _noop)
