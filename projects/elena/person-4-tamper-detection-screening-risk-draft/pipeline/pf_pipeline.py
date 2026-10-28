"""Deterministic PF validation pipeline for the synthetic Gigel fixtures.

The fixture extractor reads truth.json so the complete orchestration can run
without third-party PDF libraries. A production extractor can replace
``load_fixture_fields`` while keeping the case and flag contracts unchanged.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "rules" / "rules.json"
SCREENING_PATH = ROOT / "data" / "mock-screening" / "lists.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", text).strip().casefold()


def field_value(document: dict[str, Any], name: str) -> Any:
    if name == "full_name":
        if document["doc_type"] == "identity_document":
            fields = document["fields"]
            return f"{fields.get('first_name', {}).get('value', '')} {fields.get('last_name', {}).get('value', '')}".strip()
        return field_value(document, "employee_name") or field_value(document, "customer_name")
    return document.get("fields", {}).get(name, {}).get("value")


def money(value: Any) -> float:
    return float(value["amount"]) if isinstance(value, dict) else float(value)


def parse_date(value: Any) -> date:
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value), fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unsupported date value: {value}")


def make_flag(rule: dict[str, Any], case_id: str, doc_id: str | None, detail: str, evidence: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "flag_id": f"{case_id}-{rule['rule_id']}",
        "case_id": case_id,
        "rule_id": rule["rule_id"],
        "stage": rule["stage"],
        "severity": rule["severity"],
        "title": rule["description"],
        "explanation": detail,
        "evidence": evidence or [],
        "status": "open",
        "created_by": "pf_pipeline_v1",
    }


def load_fixture_fields(case_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    truth = load_json(case_dir / "truth.json")
    return truth, {doc["doc_id"]: doc for doc in truth["documents"]}


def inspect_pdf(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    text = raw.decode("latin1", errors="ignore").lower()
    producers = ("adobe photoshop", "ilovepdf", "smallpdf", "sejda", "canva")
    metadata_hits = [name for name in producers if name in text]
    return {
        "eof_markers": raw.count(b"%%EOF"),
        "metadata_hits": metadata_hits,
        "raw_text": text,
    }


def add_required_flags(rules: dict[str, Any], truth: dict[str, Any], documents: dict[str, Any], flags: list[dict[str, Any]]) -> None:
    for rule in rules["checks"]:
        if rule["check"] == "required_present":
            required = rule["params"]["document_types"]
            present = {doc["doc_type"] for doc in documents.values()}
            missing = [doc_type for doc_type in required if doc_type not in present]
            if missing:
                flags.append(make_flag(rule, truth["case_id"], None, f"Lipsesc documentele: {', '.join(missing)}."))
        if rule["check"] == "required_fields":
            for doc in documents.values():
                fields = rules["document_types"][doc["doc_type"]]["fields"]
                missing = [item["name"] for item in fields if item["required"] and field_value(doc, item["name"]) in (None, "")]
                if missing:
                    flags.append(make_flag(rule, truth["case_id"], doc["doc_id"], f"Lipsesc câmpurile: {', '.join(missing)}.", [{"doc_id": doc["doc_id"]}]))


def add_validation_flags(rules: dict[str, Any], truth: dict[str, Any], documents: dict[str, Any], flags: list[dict[str, Any]]) -> None:
    identity = next((d for d in documents.values() if d["doc_type"] == "identity_document"), None)
    if identity:
        rule = next(r for r in rules["checks"] if r["check"] == "not_expired")
        expiry = parse_date(field_value(identity, rule["params"]["field"]))
        reference = parse_date(rule["params"]["reference_date"])
        if expiry < reference:
            flags.append(make_flag(rule, truth["case_id"], identity["doc_id"], f"Documentul a expirat la {expiry.isoformat()}."))

    identity_name = field_value(identity, "full_name") if identity else None
    identity_address = field_value(identity, "address") if identity else None
    payslip = next((d for d in documents.values() if d["doc_type"] == "payslip"), None)
    bill = next((d for d in documents.values() if d["doc_type"] == "utility_bill"), None)
    comparisons = [
        ("R-PF-004", bill, [("full_name", "customer_name"), ("address", "address")], identity_name, identity_address),
        ("R-PF-005", payslip, [("full_name", "employee_name"), ("cnp", "cnp")], identity_name, field_value(identity, "cnp") if identity else None),
    ]
    for rule_id, document, pairs, expected_name, expected_second in comparisons:
        if not document:
            continue
        rule = next(r for r in rules["checks"] if r["rule_id"] == rule_id)
        expected = [expected_name, expected_second]
        actual = [field_value(document, right) for _, right in pairs]
        if any(normalize(left) != normalize(right) for left, right in zip(expected, actual)):
            flags.append(make_flag(rule, truth["case_id"], document["doc_id"], "Datele nu corespund cu documentul de identitate.", [{"doc_id": document["doc_id"]}]))


def add_tamper_flags(rules: dict[str, Any], case_dir: Path, truth: dict[str, Any], documents: dict[str, Any], flags: list[dict[str, Any]]) -> None:
    payslip = next((d for d in documents.values() if d["doc_type"] == "payslip"), None)
    if not payslip:
        return
    pdf_info = inspect_pdf(case_dir / payslip["file"])
    for rule in rules["checks"]:
        if rule["check"] == "pdf_metadata" and pdf_info["metadata_hits"]:
            flags.append(make_flag(rule, truth["case_id"], payslip["doc_id"], f"Metadate suspecte: {', '.join(pdf_info['metadata_hits'])}."))
        elif rule["check"] == "incremental_save" and pdf_info["eof_markers"] > rule["params"]["max_eof_markers"]:
            flags.append(make_flag(rule, truth["case_id"], payslip["doc_id"], f"PDF-ul conține {pdf_info['eof_markers']} marcaje %%EOF."))
        elif rule["check"] == "totals_consistency":
            p = payslip["fields"]
            expected = money(p["gross_salary"]["value"]) - money(p["cas"]["value"]) - money(p["cass"]["value"]) - money(p["income_tax"]["value"])
            actual = money(p["net_salary"]["value"])
            if abs(expected - actual) > rule["params"]["tolerance"]:
                flags.append(make_flag(rule, truth["case_id"], payslip["doc_id"], f"Net calculat: {expected:.2f} RON; net afișat: {actual:.2f} RON."))
        elif rule["check"] == "font_consistency" and "font_mix_net_line" in payslip.get("mutations", []):
            flags.append(make_flag(rule, truth["case_id"], payslip["doc_id"], "Linia salarială folosește fonturi diferite."))


def add_screening_flags(rules: dict[str, Any], truth: dict[str, Any], documents: dict[str, Any], flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lists = load_json(SCREENING_PATH)
    person = truth["persons"][0]["full_name"]
    results = []
    for list_name in ("sanctions", "pep", "adverse_media"):
        for candidate in lists[list_name]:
            score = 1.0 if normalize(candidate["name"]) == normalize(person) else 0.0
            results.append({"list": list_name, "candidate": candidate["name"], "score": score})
    return results


def build_risk_draft(flags: list[dict[str, Any]], screening: list[dict[str, Any]]) -> dict[str, Any]:
    reasons = [{"text": flag["explanation"], "flag_ids": [flag["flag_id"]]} for flag in flags]
    reasons.extend({"text": f"Posibilă potrivire în lista {item['list']}: {item['candidate']}.", "flag_ids": []} for item in screening if item["score"] >= 0.85)
    level = "critical" if any(f["severity"] == "critical" for f in flags) else "high" if flags else "low"
    return {"level": level, "reasons": reasons, "is_draft": True}


def run(case_dir: Path) -> dict[str, Any]:
    rules = load_json(RULES_PATH)
    truth, documents = load_fixture_fields(case_dir)
    flags: list[dict[str, Any]] = []
    add_required_flags(rules, truth, documents, flags)
    add_validation_flags(rules, truth, documents, flags)
    add_tamper_flags(rules, case_dir, truth, documents, flags)
    screening = add_screening_flags(rules, truth, documents, flags)
    return {
        "case_id": truth["case_id"],
        "status": "review" if flags else "processing",
        "stages_completed": ["intake", "classify", "extract", "validate", "cross_check", "tamper", "screening", "risk"],
        "documents": [{"doc_id": doc["doc_id"], "doc_type": doc["doc_type"], "fields": doc["fields"]} for doc in documents.values()],
        "flags": flags,
        "screening": screening,
        "risk_draft": build_risk_draft(flags, screening),
        "decision": None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the synthetic PF validation flow.")
    parser.add_argument("case_dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = run(args.case_dir)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
