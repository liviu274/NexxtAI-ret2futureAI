"""Review-screen data: every procedure clause next to what the builder made of it.

The report is computed from the playbook and the clauses, without an LLM, so it can be
regenerated for any playbook (generated or hand-written).

Shape (builder_report.json):
{
  "playbook_id": "pb_cont_pj_v1",
  "procedure": {"code": "PJ-ONB-01", "title": "...", "file": "procedures/PJ-ONB-01.pdf"},
  "generated_by": {"source": "llm" | "llm_repaired" | "fallback" | "mock" | "mock_repaired",
                   "model": "...", "attempts": 1,
                   "duration_s": 42.3, "fallback_reason": null},
  "coverage": {"total": 33, "automated": 18, "covered": 6, "manual": 2, "context": 7,
               "unreviewed": 0, "pct": 92},
  "clauses": [
    {"clause": "2.2", "page": 1, "section": "2. Documentele societății", "text": "...",
     "status": "automated" | "covered" | "manual" | "context" | "unreviewed",
     "rules": [{"rule_id": "R-PJ-002", "check": "max_age_days", "stage": "validate",
                "applies_to": "company", "severity": "high", "description": "..."}],
     "documents": [{"doc_type": "certificat_constatator", "applies_to": "company"}],
     "reason": null}
  ]
}

coverage.pct = (automated + covered) / (total - context): the share of real requirements the agent enforces.
"""


def build_report(playbook, meta):
    doc = meta["clauses"]
    rules_by_clause, docs_by_clause = {}, {}
    for r in playbook["rules"]:
        rules_by_clause.setdefault(r["source_ref"].get("clause"), []).append({
            "rule_id": r["rule_id"], "check": r["check"], "stage": r["stage"],
            "applies_to": r["applies_to"], "severity": r["severity"], "description": r["description"],
        })
    for d in playbook["required_documents"]:
        docs_by_clause.setdefault(d["source_ref"].get("clause"), []).append(
            {"doc_type": d["doc_type"], "applies_to": d["applies_to"]})
    notes = {n["clause"]: n for n in meta.get("not_automated", [])}

    clauses, counts = [], {"automated": 0, "covered": 0, "manual": 0, "context": 0, "unreviewed": 0}
    for c in doc["clauses"]:
        rules = rules_by_clause.get(c["clause"], [])
        docs = docs_by_clause.get(c["clause"], [])
        if rules or docs:
            status, reason = "automated", None
        elif c["clause"] in notes:
            status, reason = notes[c["clause"]]["status"], notes[c["clause"]]["reason"]
        else:
            status, reason = "unreviewed", "Builder-ul nu a mapat această clauză și nici nu a explicat de ce."
        counts[status] += 1
        clauses.append({"clause": c["clause"], "page": c["page"], "section": c.get("section"),
                        "text": c["text"], "status": status, "rules": rules, "documents": docs,
                        "reason": reason})

    total = len(clauses)
    real = total - counts["context"]
    pct = round(100 * (counts["automated"] + counts["covered"]) / real) if real else 100
    return {
        "playbook_id": playbook["playbook_id"],
        "procedure": {"code": doc.get("code"), "title": doc.get("title"),
                      "file": playbook["source_procedure"]["file"]},
        "generated_by": {"source": meta.get("source"), "model": meta.get("model"),
                         "attempts": meta.get("attempts"), "duration_s": meta.get("duration_s"),
                         "fallback_reason": meta.get("fallback_reason")},
        "coverage": {"total": total, **counts, "pct": pct},
        "clauses": clauses,
    }
