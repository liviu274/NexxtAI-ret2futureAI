"""Compare a generated playbook with the hand-written target.

Usage:
    python compare.py output/pb_pj_onb_01_v1.json fallback/pb_cont_pj_v1.json

Rules match on (check, applies_to, params); documents on (doc_type, applies_to).
Severity and clause differences on matched rules are listed but do not count as misses.
"""
import json
import sys


def rule_key(r):
    return (r["check"], r["applies_to"], json.dumps(r["params"], sort_keys=True, ensure_ascii=False))


def doc_key(d):
    return (d["doc_type"], d["applies_to"])


def compare(generated, target):
    g_rules = {rule_key(r): r for r in generated["rules"]}
    t_rules = {rule_key(r): r for r in target["rules"]}
    matched = g_rules.keys() & t_rules.keys()
    diffs = []
    for k in sorted(matched):
        g, t = g_rules[k], t_rules[k]
        if g["severity"] != t["severity"]:
            diffs.append(f"{t['rule_id']} severity {g['severity']} (target {t['severity']})")
        if g["source_ref"].get("clause") != t["source_ref"].get("clause"):
            diffs.append(f"{t['rule_id']} clause {g['source_ref'].get('clause')} (target {t['source_ref'].get('clause')})")
    g_docs = {doc_key(d) for d in generated["required_documents"]}
    t_docs = {doc_key(d) for d in target["required_documents"]}
    return {
        "rules_matched": len(matched),
        "rules_target": len(t_rules),
        "rules_missing": [f"{t_rules[k]['rule_id']} {k[0]} ({k[1]})" for k in sorted(t_rules.keys() - matched)],
        "rules_extra": [f"{g_rules[k]['rule_id']} {k[0]} ({k[1]}) {k[2]}" for k in sorted(g_rules.keys() - matched)],
        "docs_matched": len(g_docs & t_docs),
        "docs_target": len(t_docs),
        "docs_missing": sorted(f"{a} ({b})" for a, b in t_docs - g_docs),
        "docs_extra": sorted(f"{a} ({b})" for a, b in g_docs - t_docs),
        "differences": diffs,
    }


def print_comparison(c):
    print(f"rules: {c['rules_matched']}/{c['rules_target']} match the target, "
          f"{len(c['rules_extra'])} extra; documents: {c['docs_matched']}/{c['docs_target']}")
    for label in ("rules_missing", "rules_extra", "docs_missing", "docs_extra", "differences"):
        for item in c[label]:
            print(f"  {label.replace('_', ' ')}: {item}")


if __name__ == "__main__":
    load = lambda p: json.load(open(p, encoding="utf-8"))
    print_comparison(compare(load(sys.argv[1]), load(sys.argv[2])))
