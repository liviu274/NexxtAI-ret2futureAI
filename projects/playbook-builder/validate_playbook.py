"""Playbook validator (Person 2).

Usage:
    python validate_playbook.py <playbook.json> <procedure.pdf>

Exit code 0 = valid, 1 = errors. Errors are printed one per line, so they can be
fed back to the LLM for the single repair attempt.
"""
import json
import re
import sys
import unicodedata

from pypdf import PdfReader

# ---- Enums and catalog, kept in sync with CONTRACTS.md -------------------

DOC_TYPES = {
    "id_card", "passport", "selfie", "proof_of_address", "payslip", "income_certificate",
    "bank_statement", "certificat_constatator", "act_constitutiv", "ubo_declaration",
    "signature_specimen", "financial_statement", "garnishment_order", "release_order",
}
ROLES = {"applicant", "company", "administrator", "shareholder", "ubo", "signatory"}
STAGES = {"classify", "extract", "validate", "cross_check", "tamper", "screening", "risk"}
SEVERITIES = {"info", "low", "medium", "high", "critical"}
RISK_FACTORS = {"country", "occupation", "caen_code", "pep"}
MATCH_MODES = {"exact", "normalized", "fuzzy"}

# check -> (stage, required params)
CATALOG = {
    "required_present": ("validate", {"doc_type", "min_count"}),
    "not_expired": ("validate", {"doc_type", "field"}),
    "max_age_days": ("validate", {"doc_type", "field", "days"}),
    "field_present": ("validate", {"doc_type", "field"}),
    "fields_match": ("cross_check", {"doc_types", "mode"}),  # plus field OR field_map
    "income_vs_deposits": ("cross_check", {"tolerance_pct"}),
    "registry_vs_declaration": ("cross_check", set()),
    "pdf_metadata": ("tamper", set()),
    "font_consistency": ("tamper", set()),
    "totals_consistency": ("tamper", {"doc_type"}),
    "id_integrity": ("tamper", set()),
    "sanctions": ("screening", {"list"}),
    "pep": ("screening", {"list"}),
    "adverse_media": ("screening", set()),
    "risk_factors": ("risk", {"factors"}),
}

# Field dictionary: the only field names the extractor produces per document type.
FIELDS = {
    "id_card": {"full_name", "cnp", "date_of_birth", "address", "series_number", "expiry_date", "mrz"},
    "passport": {"full_name", "cnp", "date_of_birth", "series_number", "expiry_date"},
    "proof_of_address": {"full_name", "address", "issue_date"},
    "payslip": {"full_name", "employer", "gross_salary", "deductions", "net_salary", "period_end"},
    "income_certificate": {"full_name", "employer", "net_salary", "issue_date"},
    "bank_statement": {"full_name", "iban", "salary_deposits", "period_end"},
    "certificat_constatator": {"company_name", "cui", "registration_number", "registered_office",
                               "caen_code", "administrators", "shareholders", "issue_date"},
    "act_constitutiv": {"company_name", "cui", "legal_representatives"},
    "ubo_declaration": {"company_name", "cui", "ubos", "signed_by"},
    "signature_specimen": {"full_name"},
}

TOP_LEVEL = {"playbook_id", "version", "process_name", "customer_type", "source_procedure",
             "required_documents", "rules", "person_flows"}
REQ_DOC_KEYS = {"doc_type", "applies_to", "min_count", "alternatives", "fields", "source_ref"}
RULE_KEYS = {"rule_id", "stage", "check", "params", "applies_to", "severity", "description",
             "client_fixable", "fix_message", "source_ref"}


def norm(text):
    """Normalize for quote matching: Unicode NFC, unify quotes/dashes, collapse whitespace."""
    text = unicodedata.normalize("NFC", text)
    text = text.replace(" ", " ").replace("​", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def load_pages(pdf_path):
    return [norm(p.extract_text() or "") for p in PdfReader(pdf_path).pages]


def check_source_ref(ref, where, pages, errors):
    if not isinstance(ref, dict) or "page" not in ref or "quote" not in ref:
        errors.append(f"{where}: source_ref needs page and quote")
        return
    page, quote = ref["page"], norm(ref["quote"])
    if not isinstance(page, int) or not 1 <= page <= len(pages):
        errors.append(f"{where}: source_ref.page {page} outside 1..{len(pages)}")
        return
    if quote not in pages[page - 1]:
        found = [i + 1 for i, p in enumerate(pages) if quote in p]
        hint = f" (found on page {found[0]})" if found else " (not found anywhere in the procedure)"
        errors.append(f"{where}: quote not in procedure page {page}{hint}: \"{ref['quote'][:70]}\"")


def check_field(doc_type, field, where, errors):
    if field not in FIELDS.get(doc_type, set()):
        errors.append(f"{where}: unknown field '{field}' for doc_type '{doc_type}'")


def validate(pb, pages):
    errors = []
    missing = TOP_LEVEL - pb.keys()
    if missing:
        errors.append(f"playbook: missing keys {sorted(missing)}")
    extra = pb.keys() - TOP_LEVEL
    if extra:
        errors.append(f"playbook: unknown keys {sorted(extra)}")
    if pb.get("customer_type") not in {"PF", "PJ"}:
        errors.append("playbook: customer_type must be PF or PJ")

    for i, d in enumerate(pb.get("required_documents", [])):
        where = f"required_documents[{i}]"
        if REQ_DOC_KEYS - d.keys():
            errors.append(f"{where}: missing keys {sorted(REQ_DOC_KEYS - d.keys())}")
            continue
        if d["doc_type"] not in DOC_TYPES:
            errors.append(f"{where}: unknown doc_type '{d['doc_type']}'")
        if d["applies_to"] not in ROLES:
            errors.append(f"{where}: unknown role '{d['applies_to']}'")
        for alt in d["alternatives"]:
            if alt not in DOC_TYPES:
                errors.append(f"{where}: unknown alternative doc_type '{alt}'")
        for f in d["fields"]:
            check_field(d["doc_type"], f, where, errors)
        check_source_ref(d["source_ref"], where, pages, errors)

    seen = set()
    for i, r in enumerate(pb.get("rules", [])):
        where = f"rules[{i}] {r.get('rule_id', '?')}"
        if RULE_KEYS - r.keys():
            errors.append(f"{where}: missing keys {sorted(RULE_KEYS - r.keys())}")
            continue
        if r["rule_id"] in seen:
            errors.append(f"{where}: duplicate rule_id")
        seen.add(r["rule_id"])
        if r["check"] not in CATALOG:
            errors.append(f"{where}: check '{r['check']}' is not in the catalog")
            continue
        stage, required = CATALOG[r["check"]]
        if r["stage"] != stage:
            errors.append(f"{where}: check '{r['check']}' belongs to stage '{stage}', not '{r['stage']}'")
        if r["applies_to"] not in ROLES:
            errors.append(f"{where}: unknown role '{r['applies_to']}'")
        if r["severity"] not in SEVERITIES:
            errors.append(f"{where}: unknown severity '{r['severity']}'")
        p = r["params"]
        if required - p.keys():
            errors.append(f"{where}: missing params {sorted(required - p.keys())}")
        if "doc_type" in p and p["doc_type"] not in DOC_TYPES:
            errors.append(f"{where}: unknown doc_type '{p['doc_type']}'")
        if "field" in p and "doc_type" in p:
            check_field(p["doc_type"], p["field"], where, errors)
        if r["check"] == "fields_match":
            if ("field" in p) == ("field_map" in p):
                errors.append(f"{where}: fields_match needs exactly one of field / field_map")
            if p.get("mode") not in MATCH_MODES:
                errors.append(f"{where}: unknown mode '{p.get('mode')}'")
            for dt in p.get("doc_types", []):
                if dt not in DOC_TYPES:
                    errors.append(f"{where}: unknown doc_type '{dt}'")
                elif "field" in p:
                    check_field(dt, p["field"], where, errors)
                elif dt not in p["field_map"]:
                    errors.append(f"{where}: field_map has no entry for '{dt}'")
                else:
                    check_field(dt, p["field_map"][dt], where, errors)
        if r["check"] == "risk_factors":
            bad = set(p.get("factors", [])) - RISK_FACTORS
            if bad:
                errors.append(f"{where}: unknown risk factors {sorted(bad)}")
        if r["client_fixable"] and not r["fix_message"]:
            errors.append(f"{where}: client_fixable rule needs a fix_message")
        check_source_ref(r["source_ref"], where, pages, errors)
    return errors


def main():
    pb_path, pdf_path = sys.argv[1], sys.argv[2]
    with open(pb_path, encoding="utf-8") as f:
        pb = json.load(f)
    errors = validate(pb, load_pages(pdf_path))
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"OK {pb['playbook_id']}: {len(pb['required_documents'])} documents, {len(pb['rules'])} rules")


if __name__ == "__main__":
    main()
