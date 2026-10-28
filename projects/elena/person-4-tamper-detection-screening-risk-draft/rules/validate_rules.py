"""Validate the declarative extraction/check configuration.

This is a configuration gate, not the PDF extractor. The extractor and
validator agents will consume the same rules.json at runtime.
"""

import json
import sys
from pathlib import Path


ALLOWED_STAGES = {"classify", "extract", "validate", "cross_check", "tamper", "screening", "risk"}
ALLOWED_TYPES = {"string", "date", "date_range", "address", "cnp", "cui", "money"}
REQUIRED_CHECK_KEYS = {"rule_id", "stage", "check", "applies_to", "params", "severity", "description"}


def main() -> int:
    path = Path(__file__).with_name("rules.json")
    rules = json.loads(path.read_text(encoding="utf-8"))
    errors = []

    document_types = rules.get("document_types", {})
    if not document_types:
        errors.append("document_types must not be empty")

    field_names = {}
    for doc_type, definition in document_types.items():
        fields = definition.get("fields", [])
        if not fields:
            errors.append(f"{doc_type}: fields must not be empty")
        field_names[doc_type] = set()
        for field in fields:
            if not {"name", "type", "required"} <= field.keys():
                errors.append(f"{doc_type}: every field needs name, type and required")
            if field.get("type") not in ALLOWED_TYPES:
                errors.append(f"{doc_type}.{field.get('name')}: unsupported type")
            if field.get("name") in field_names[doc_type]:
                errors.append(f"{doc_type}: duplicate field {field.get('name')}")
            field_names[doc_type].add(field.get("name"))

    seen_rule_ids = set()
    for rule in rules.get("checks", []):
        missing = REQUIRED_CHECK_KEYS - rule.keys()
        if missing:
            errors.append(f"{rule.get('rule_id', '<unknown>')}: missing {sorted(missing)}")
        if rule.get("rule_id") in seen_rule_ids:
            errors.append(f"duplicate rule_id: {rule['rule_id']}")
        seen_rule_ids.add(rule.get("rule_id"))
        if rule.get("stage") not in ALLOWED_STAGES:
            errors.append(f"{rule.get('rule_id')}: unsupported stage")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"Validated {len(document_types)} document types and {len(seen_rule_ids)} checks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())