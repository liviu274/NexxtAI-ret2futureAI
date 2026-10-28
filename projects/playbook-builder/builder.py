"""Playbook builder: procedure PDF -> LLM -> validated playbook JSON.

Usage:
    python builder.py procedures/PJ-ONB-01.pdf [--out output/]

Environment:
    ANTHROPIC_API_KEY   key for the Claude API
    BUILDER_LLM         "anthropic" (default) or "mock" (offline: replays the target playbook)
    BUILDER_MODEL       model id, default "claude-sonnet-5-5"
    BUILDER_DEADLINE_S  total time budget in seconds before falling back, default 100
    BUILDER_MOCK_BREAK  "1" makes the mock's first answer invalid, to exercise the repair step

Flow:
    1. clauses.py splits the PDF into numbered clauses.
    2. The LLM gets the contract, the check catalog, the field dictionary, one worked example
       and the clauses, and must answer through the emit_playbook tool. It cites clause numbers
       only; the builder copies page and quote from the PDF itself, so quotes cannot be invented.
    3. validate_playbook.py checks the result. On errors, they go back to the LLM once.
    4. If the LLM fails, times out or is still invalid, the builder returns the target playbook
       from fallback/ and says so in meta["source"].
"""
import argparse
import copy
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from clauses import parse
from validate_playbook import CATALOG, DOC_TYPES, FIELDS, ROLES, SEVERITIES, STAGES, load_pages, validate

HERE = Path(__file__).parent
FALLBACK_DIR = HERE / "fallback"
TOOL_NAME = "emit_playbook"
BUCHAREST = timezone(timedelta(hours=2))


class BuildError(Exception):
    pass


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

CATALOG_DOC = """\
| check | stage | params | fails when |
|---|---|---|---|
| required_present | validate | {doc_type, min_count} | fewer than min_count documents of that type (or its alternatives) |
| not_expired | validate | {doc_type, field} | the date in field is before today |
| max_age_days | validate | {doc_type, field, days} | the document date is older than days |
| field_present | validate | {doc_type, field} | the field was not extracted or is empty |
| fields_match | cross_check | {field, doc_types, mode} or {field_map, doc_types, mode}; mode: exact, normalized, fuzzy | values differ across documents; use field_map when the field has a different name per document; a person_list side matches if any person matches |
| income_vs_deposits | cross_check | {tolerance_pct} | net salary differs from statement deposits by more than the tolerance |
| registry_vs_declaration | cross_check | {} | UBOs in the registry extract differ from the UBO declaration |
| pdf_metadata | tamper | {} | editing software or modification date after issue (runs on every document) |
| font_consistency | tamper | {} | mixed fonts inside one field or line (runs on every document) |
| totals_consistency | tamper | {doc_type} | lines do not add up to stated totals |
| id_integrity | tamper | {} | the CNP or the MRZ of the identity document is internally inconsistent: checksum, birth date, county, MRZ check digits (runs on identity documents) |
| sanctions | screening | {list: "mock_sanctions_v1"} | name matches a sanctions list |
| pep | screening | {list: "mock_pep_v1"} | person is a PEP, family member or close associate |
| adverse_media | screening | {} | negative news hit |
| risk_factors | risk | {factors}; factors from: country, occupation, caen_code, pep | never fails; produces the risk draft |"""

SYSTEM_PROMPT = """\
You turn a bank's internal procedure into a machine-readable playbook that an onboarding agent executes.
You answer only by calling the emit_playbook tool.

## What a playbook is
- required_documents: what the client file must contain, one entry per (doc_type, applies_to).
- rules: every testable requirement of the procedure, each mapped to exactly one check from the catalog.
- not_automated: every clause that produced no rule and no required document, with a status and reason.

## Check catalog (the only checks that exist)
{catalog}

## Field dictionary (the only field names that exist, per doc_type)
{fields}
administrators, shareholders, legal_representatives and ubos are lists of people.

## Roles and applies_to
Roles: applicant (the PF client), company (the PJ client), administrator (legal representative),
shareholder, ubo (beneficiar real), signatory (delegat: operates the account, not a legal representative).
A rule or document applies once per person with that role. A requirement that names several roles
becomes one rule per role (e.g. sanctions for administrator, ubo and signatory = three rules).
PF procedures use applicant. PJ procedures use company for company-level checks.

## How to map
1. Cite in "clause" the number of the clause the requirement comes from (e.g. "4.2"). Never invent clauses.
2. Only encode what the procedure says. Do not add requirements it does not state.
3. Each check has a fixed stage (see catalog); copy it.
4. required_documents.fields: the fields the procedure says are recorded, plus any date field a rule needs
   (expiry_date, issue_date, period_end). Use only names from the field dictionary.
5. alternatives: other doc_types the procedure accepts instead (e.g. passport for id_card).
6. A document the procedure requires gets both a required_documents entry and a required_present rule.
7. Tamper checks: one rule each, applies_to applicant (PF) or company (PJ).
8. risk_factors: exactly one rule, with only the factors the procedure names.
9. Severity: critical for tamper and sanctions; high for missing, expired or unreadable required documents,
   PEP, CUI mismatches and a person not matching the registry; medium for document age, name or address
   mismatches across the client's own documents and adverse media; info for risk_factors.
   Exception: the age of the certificat constatator is high, because it proves the company's current status.
10. description: one plain sentence in the procedure's language (Romanian), for the bank analyst.
11. client_fixable: true only if the client can fix it by uploading a document. Then fix_message is a polite
    Romanian message to the client; it may use {{expiry_date}}, {{issue_date}}, {{period_end}}, {{person_name}},
    {{min_count}}, {{found_count}}. Never mention fraud, sanctions, PEP or alteration to the client.
    If client_fixable is false, fix_message is null.
12. not_automated statuses: "context" (scope, definitions, obligations outside onboarding), "covered"
    (already enforced by another rule, an alternatives list or a fields list; name it in the reason),
    "manual" (a real requirement with no check in the catalog, or a human step). Reasons are one Romanian sentence.
13. Every clause must appear in at least one rule, one required document or not_automated.
14. Rules get the ids R-PF-001, R-PF-002... (or R-PJ-...) in the order you list them; reasons may cite them.
"""


def fields_doc():
    return "\n".join(f"- {dt}: {', '.join(sorted(fs))}" for dt, fs in FIELDS.items())


def system_prompt():
    return SYSTEM_PROMPT.format(catalog=CATALOG_DOC, fields=fields_doc())


def tool_schema():
    clause = {"type": "string", "description": "Clause number, e.g. 4.2"}
    return {
        "name": TOOL_NAME,
        "description": "Emit the playbook for the procedure.",
        "input_schema": {
            "type": "object",
            "required": ["customer_type", "process_name", "required_documents", "rules", "not_automated"],
            "properties": {
                "customer_type": {"type": "string", "enum": ["PF", "PJ"]},
                "process_name": {"type": "string"},
                "required_documents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["doc_type", "applies_to", "min_count", "alternatives", "fields", "clause"],
                        "properties": {
                            "doc_type": {"type": "string", "enum": sorted(DOC_TYPES)},
                            "applies_to": {"type": "string", "enum": sorted(ROLES)},
                            "min_count": {"type": "integer", "minimum": 1},
                            "alternatives": {"type": "array", "items": {"type": "string", "enum": sorted(DOC_TYPES)}},
                            "fields": {"type": "array", "items": {"type": "string"}},
                            "clause": clause,
                        },
                    },
                },
                "rules": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["stage", "check", "params", "applies_to", "severity", "description",
                                     "client_fixable", "fix_message", "clause"],
                        "properties": {
                            "stage": {"type": "string", "enum": sorted(STAGES)},
                            "check": {"type": "string", "enum": sorted(CATALOG)},
                            "params": {"type": "object"},
                            "applies_to": {"type": "string", "enum": sorted(ROLES)},
                            "severity": {"type": "string", "enum": sorted(SEVERITIES)},
                            "description": {"type": "string"},
                            "client_fixable": {"type": "boolean"},
                            "fix_message": {"type": ["string", "null"]},
                            "clause": clause,
                        },
                    },
                },
                "not_automated": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["clause", "status", "reason"],
                        "properties": {
                            "clause": clause,
                            "status": {"type": "string", "enum": ["context", "covered", "manual"]},
                            "reason": {"type": "string"},
                        },
                    },
                },
            },
        },
    }


def clauses_block(doc):
    return "\n".join(f"[{c['clause']}] (page {c['page']}) {c['text']}" for c in doc["clauses"])


def to_llm_format(playbook, not_automated):
    """A stored playbook in the shape the LLM must emit (used for the worked example and the mock)."""
    strip = lambda item: {**{k: v for k, v in item.items() if k not in ("source_ref", "rule_id")},
                          "clause": item["source_ref"]["clause"]}
    return {
        "customer_type": playbook["customer_type"],
        "process_name": playbook["process_name"],
        "required_documents": [strip(d) for d in playbook["required_documents"]],
        "rules": [strip(r) for r in playbook["rules"]],
        "not_automated": not_automated,
    }


def load_index():
    return json.loads((FALLBACK_DIR / "index.json").read_text(encoding="utf-8"))


def load_target(code):
    entry = load_index().get(code)
    if not entry:
        return None, None
    pb = json.loads((FALLBACK_DIR / entry["playbook"]).read_text(encoding="utf-8"))
    return pb, entry["not_automated"]


def example_for(code):
    """Worked example: the target playbook of a *different* procedure, so the model never sees the answer."""
    for other, entry in load_index().items():
        if other != code:
            pb, na = load_target(other)
            procedure_pdf = HERE / "procedures" / f"{other}.pdf"
            if procedure_pdf.exists():
                return other, parse(str(procedure_pdf)), to_llm_format(pb, na)
    return None


def user_prompt(doc):
    parts = []
    ex = example_for(doc["code"])
    if ex:
        code, ex_doc, ex_out = ex
        parts.append(f"## Worked example: procedure {code}\n\n{clauses_block(ex_doc)}\n\n"
                     f"Correct emit_playbook input for {code}:\n"
                     f"{json.dumps(ex_out, ensure_ascii=False, indent=1)}")
    parts.append(f"## Your task: procedure {doc['code'] or ''}\nTitle: {doc['title']}\n\n{clauses_block(doc)}\n\n"
                 "Call emit_playbook for this procedure.")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM backends
# ---------------------------------------------------------------------------

class AnthropicLLM:
    def __init__(self, model):
        import anthropic
        self.client = anthropic.Anthropic()
        self.model = model

    def start(self, system, user, timeout):
        self.system = system
        self.messages = [{"role": "user", "content": user}]
        return self._call(timeout)

    def repair(self, errors, timeout):
        self.messages.append({"role": "assistant", "content": self.last.content})
        self.messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": self.tool_use_id, "is_error": True,
             "content": "The playbook was rejected by the validator:\n" + "\n".join(errors)},
            {"type": "text", "text": "Fix every error and call emit_playbook again with the complete playbook."},
        ]})
        return self._call(timeout)

    def _call(self, timeout):
        self.last = self.client.messages.create(
            model=self.model, max_tokens=16000, system=self.system,
            tools=[tool_schema()], tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=self.messages, timeout=timeout,
        )
        block = next((b for b in self.last.content if b.type == "tool_use"), None)
        if block is None:
            raise BuildError("the model did not call emit_playbook")
        self.tool_use_id = block.id
        return block.input


class MockLLM:
    """Offline backend: replays the target playbook. BUILDER_MOCK_BREAK=1 breaks the first answer."""

    def __init__(self, code):
        pb, na = load_target(code)
        if pb is None:
            raise BuildError(f"mock has no target playbook for {code}")
        self.answer = to_llm_format(pb, na)
        self.break_first = os.environ.get("BUILDER_MOCK_BREAK") == "1"

    def start(self, system, user, timeout):
        out = copy.deepcopy(self.answer)
        if self.break_first:
            out["rules"][0]["check"] = "verify_selfie"
            out["rules"][1]["clause"] = "12.7"
        return out

    def repair(self, errors, timeout):
        return copy.deepcopy(self.answer)


def make_llm(code):
    kind = os.environ.get("BUILDER_LLM", "anthropic")
    if kind == "mock":
        return MockLLM(code)
    return AnthropicLLM(os.environ.get("BUILDER_MODEL", "claude-sonnet-5-5"))


# ---------------------------------------------------------------------------
# Assembly and validation
# ---------------------------------------------------------------------------

def default_playbook_id(code):
    return "pb_" + (code or "procedure").lower().replace("-", "_") + "_v1"


def assemble(out, doc, pdf_name, playbook_id):
    """LLM output -> contract playbook. Page and quote are copied from the PDF by clause number."""
    by_id = {c["clause"]: c for c in doc["clauses"]}
    errors = []

    def ref(item, where):
        c = by_id.get(str(item.get("clause")))
        if c is None:
            errors.append(f"{where}: clause '{item.get('clause')}' does not exist in the procedure")
            return {"page": 1, "clause": str(item.get("clause")), "quote": ""}
        return {"page": c["page"], "clause": c["clause"], "quote": c["text"]}

    ctype = out.get("customer_type")
    docs = []
    for i, d in enumerate(out.get("required_documents", [])):
        docs.append({
            "doc_type": d.get("doc_type"), "applies_to": d.get("applies_to"),
            "min_count": d.get("min_count", 1), "alternatives": d.get("alternatives", []),
            "fields": d.get("fields", []), "source_ref": ref(d, f"required_documents[{i}]"),
        })
    rules = []
    for i, r in enumerate(out.get("rules", [])):
        rules.append({
            "rule_id": f"R-{ctype}-{i + 1:03d}", "stage": r.get("stage"), "check": r.get("check"),
            "params": r.get("params", {}), "applies_to": r.get("applies_to"), "severity": r.get("severity"),
            "description": r.get("description"), "client_fixable": r.get("client_fixable"),
            "fix_message": r.get("fix_message"), "source_ref": ref(r, f"rules[{i}]"),
        })
    for i, n in enumerate(out.get("not_automated", [])):
        if str(n.get("clause")) not in by_id:
            errors.append(f"not_automated[{i}]: clause '{n.get('clause')}' does not exist in the procedure")

    playbook = {
        "playbook_id": playbook_id,
        "version": 1,
        "process_name": out.get("process_name"),
        "customer_type": ctype,
        "source_procedure": {"file": f"procedures/{pdf_name}",
                             "generated_at": datetime.now(BUCHAREST).isoformat(timespec="seconds")},
        "required_documents": docs,
        "rules": rules,
        "person_flows": None,
    }
    return playbook, errors


def check(out, doc, pages, pdf_name, playbook_id):
    playbook, errors = assemble(out, doc, pdf_name, playbook_id)
    errors += validate(playbook, pages)
    return playbook, errors


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(pdf_path, playbook_id=None, deadline_s=None):
    """Returns (playbook, meta). meta: source, attempts, errors, not_automated, duration_s, clauses doc."""
    started = time.monotonic()
    deadline_s = deadline_s or float(os.environ.get("BUILDER_DEADLINE_S", "100"))
    pdf_path = Path(pdf_path)
    doc = parse(str(pdf_path))
    pages = load_pages(str(pdf_path))
    playbook_id = playbook_id or default_playbook_id(doc["code"])
    meta = {"code": doc["code"], "clauses": doc, "attempts": 0, "errors": [], "source": None,
            "not_automated": [], "model": None}

    def remaining():
        return deadline_s - (time.monotonic() - started)

    try:
        llm = make_llm(doc["code"])
        meta["model"] = getattr(llm, "model", "mock")
        out = llm.start(system_prompt(), user_prompt(doc), timeout=max(5.0, remaining()))
        meta["attempts"] = 1
        playbook, errors = check(out, doc, pages, pdf_path.name, playbook_id)
        if errors and remaining() > 20:
            meta["errors"].append(errors)
            out = llm.repair(errors, timeout=max(5.0, remaining()))
            meta["attempts"] = 2
            playbook, errors = check(out, doc, pages, pdf_path.name, playbook_id)
        if not errors:
            kind = "mock" if isinstance(llm, MockLLM) else "llm"
            meta["source"] = kind if meta["attempts"] == 1 else f"{kind}_repaired"
            meta["not_automated"] = out.get("not_automated", [])
            meta["duration_s"] = round(time.monotonic() - started, 1)
            return playbook, meta
        meta["errors"].append(errors)
        reason = "still invalid after one repair" if meta["attempts"] == 2 else "invalid and no time left to repair"
    except Exception as e:  # network, timeout, auth, malformed answer
        reason = f"{type(e).__name__}: {e}"

    target, na = load_target(doc["code"])
    if target is None:
        raise BuildError(f"build failed ({reason}) and there is no fallback playbook for {doc['code']}")
    meta.update(source="fallback", fallback_reason=reason, not_automated=na,
                duration_s=round(time.monotonic() - started, 1))
    return target, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default=str(HERE / "output"))
    ap.add_argument("--playbook-id")
    args = ap.parse_args()

    from report import build_report
    playbook, meta = build(args.pdf, playbook_id=args.playbook_id)
    report = build_report(playbook, meta)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pid = playbook["playbook_id"]
    (out / f"{pid}.json").write_text(json.dumps(playbook, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / f"{pid}.report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    cov = report["coverage"]
    print(f"{pid}: source={meta['source']} attempts={meta['attempts']} {meta['duration_s']}s "
          f"rules={len(playbook['rules'])} coverage={cov['pct']}%")
    if meta["source"] == "fallback":
        print(f"  fallback reason: {meta['fallback_reason']}")


if __name__ == "__main__":
    main()
