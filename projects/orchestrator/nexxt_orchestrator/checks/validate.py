from __future__ import annotations

from datetime import date

from ..models import Document, Evidence, ExtractedField, Flag
from . import CheckContext, register, whole_doc_evidence


def field_evidence(doc: Document, field: ExtractedField) -> Evidence:
    return Evidence(doc_id=doc.doc_id, page=field.source.page, bbox=field.source.bbox,
                    field_id=field.field_id, quote=field.raw_text)


def owner_suffix(ctx: CheckContext, doc: Document) -> str:
    person = next((p for p in ctx.case.persons if p.person_id == doc.owner_person_id), None)
    return f" for {person.full_name} ({person.role})" if person else ""


@register("max_age_days")
def max_age_days(ctx: CheckContext) -> list[Flag]:
    doc_type, field_name, days = ctx.rule.params["doc_type"], ctx.rule.params["field"], int(ctx.rule.params["days"])
    flags = []
    for doc in ctx.documents(doc_type):
        field = doc.fields.get(field_name)
        if field is None or not field.value:
            continue  # a missing date is field_present's flag, or unreadable for the analyst
        try:
            issued = date.fromisoformat(str(field.value))
        except ValueError:
            flags.append(ctx.flag(
                title=f"{doc_type} date cannot be read{owner_suffix(ctx, doc)}",
                explanation=f"{field_name} is {field.raw_text!r}, not a date; the {days}-day limit could not be checked.",
                evidence=[field_evidence(doc, field)], fix_vars={field_name: field.raw_text}))
            continue
        age = (ctx.today - issued).days
        if age > days:
            flags.append(ctx.flag(
                title=f"{doc_type} older than {days} days{owner_suffix(ctx, doc)}",
                explanation=f"{field_name} is {issued.isoformat()}, {age} days before {ctx.today.isoformat()}; "
                            f"the procedure accepts at most {days} days.",
                evidence=[field_evidence(doc, field)], fix_vars={field_name: field.raw_text}))
    return flags


@register("field_present")
def field_present(ctx: CheckContext) -> list[Flag]:
    doc_type, field_name = ctx.rule.params["doc_type"], ctx.rule.params["field"]
    flags = []
    for doc in ctx.documents(doc_type):
        field = doc.fields.get(field_name)
        if field is not None and field.value not in (None, "", []):
            continue
        flags.append(ctx.flag(
            title=f"{field_name} missing on {doc_type}{owner_suffix(ctx, doc)}",
            explanation=f"No {field_name} could be read from {doc_type} {doc.doc_id}.",
            evidence=[field_evidence(doc, field) if field is not None else whole_doc_evidence(doc)]))
    return flags
