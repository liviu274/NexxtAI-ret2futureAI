"""Convert the PF cases to the shared contract and to playbook pb_cont_pf_v1.

Usage (from this folder):
    python convert_to_contract.py

The PF cases were built for an earlier pipeline (rules/rules.json, playbook pb_kyc_pf_v1) with its own
doc types, field names and rule ids. This script writes, for every case:
    case_file.extracted.json   CaseFile in the conventions/CONTRACTS.md shape (passes the orchestrator models)
    truth.json                 same ground truth, with contract doc types and field names
    expected_flags.json        rule ids from projects/playbook-builder/fallback/pb_cont_pf_v1.json
    expected_result.json, scenario.json   updated to the same rule ids
The originals go to <case>/legacy/ and PF/legacy/. PDFs and PNGs are not touched. Rerunning is safe:
the script always reads from legacy/.
"""
import json
import shutil
from pathlib import Path

HERE = Path(__file__).parent
CASES = HERE / "data" / "gigel" / "cases"
REPO = HERE.parents[3]
PLAYBOOK = REPO / "projects" / "playbook-builder" / "fallback" / "pb_cont_pf_v1.json"
TS = "2026-10-28T12:00:00+02:00"
EXTRACTED_BY = "mock_ground_truth_v1"

DOC_TYPES = {"identity_document": "id_card", "utility_bill": "proof_of_address", "payslip": "payslip"}

# Old expectation -> rule of pb_cont_pf_v1, decided against procedure PF-ONB-01.
EXPECTED = {
    "case_pf_00_corect_control": [],
    "case_pf_01_factura_lipsa": ["R-PF-004"],   # 3.1 proof of address required
    "case_pf_02_numar_act_lipsa": [],           # 2.4 only records series/number; only a missing CNP blocks (2.5)
    "case_pf_03_act_expirat": ["R-PF-002"],     # 2.3
    "case_pf_04_nume_factura_diferit": ["R-PF-008"],  # 5.1 name on all documents
    "case_pf_05_adresa_factura_diferita": ["R-PF-009"],  # 5.2
    "case_pf_06_nume_fluturas_diferit": ["R-PF-008"],    # 5.1
    "case_pf_07_cnp_fluturas_diferit": [],      # the procedure does not record the CNP from the payslip (4.3)
    "case_pf_08_metadate_suspecte": ["R-PF-010"],  # 6.1
    "case_pf_09_fonturi_amestecate": ["R-PF-011"],  # 6.2
    "case_pf_10_total_incorect": ["R-PF-012"],  # 6.3
    "case_pf_11_salvare_incrementala": ["R-PF-010"],  # 6.1: an incremental save is a modification after issue
    "case_pf_12_modificari_combinate": ["R-PF-010", "R-PF-011", "R-PF-012"],
}
OUT_OF_PROCEDURE = {
    "case_pf_02_numar_act_lipsa": "Procedura PF-ONB-01 cere doar înregistrarea seriei și numărului (2.4); "
                                  "numai CNP-ul ilizibil oprește cererea (2.5). Playbook-ul nu are regulă pentru acest caz.",
    "case_pf_07_cnp_fluturas_diferit": "Procedura PF-ONB-01 nu înregistrează CNP-ul de pe fluturaș (4.3) și compară "
                                       "doar numele (5.1). Playbook-ul nu are regulă pentru acest caz.",
}


def union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def field(doc_id, name, value, value_type, parts):
    """parts: the original truth fields this contract field is read from."""
    return {
        "field_id": f"{doc_id}_{name}", "name": name, "value": value, "value_type": value_type,
        "raw_text": "\n".join(p["raw_text"] for p in parts), "confidence": 1.0,
        "source": {"doc_id": doc_id, "page": parts[0]["page"], "bbox": union([p["bbox"] for p in parts])},
        "extracted_by": EXTRACTED_BY,
    }


def contract_fields(doc_id, old_type, f):
    """Contract fields, limited to the pb_cont_pf_v1 field list of the doc type."""
    out = {}

    def put(name, vtype, *keys, value=None):
        parts = [f[k] for k in keys if k in f]
        if len(parts) == len(keys):
            out[name] = field(doc_id, name, parts[0]["value"] if value is None else value, vtype, parts)

    if old_type == "identity_document":
        if "first_name" in f and "last_name" in f:
            put("full_name", "string", "last_name", "first_name",
                value=f"{f['first_name']['value']} {f['last_name']['value']}")
        put("cnp", "cnp", "cnp")
        put("date_of_birth", "date", "birth_date")
        put("address", "address", "address")
        put("series_number", "string", "doc_number")
        put("expiry_date", "date", "expiry_date")
    elif old_type == "utility_bill":
        put("full_name", "string", "customer_name")
        put("address", "address", "address")
        put("issue_date", "date", "issue_date")
    elif old_type == "payslip":
        put("full_name", "string", "employee_name")
        put("employer", "string", "employer")
        put("gross_salary", "money", "gross_salary")
        if all(k in f for k in ("cas", "cass", "income_tax")):
            parts = [f["cas"], f["cass"], f["income_tax"]]
            total = {"amount": round(sum(p["value"]["amount"] for p in parts), 2), "currency": parts[0]["value"]["currency"]}
            put("deductions", "money", "cas", "cass", "income_tax", value=total)
        put("net_salary", "money", "net_salary")
        if "period" in f:
            put("period_end", "date", "period", value=f["period"]["value"]["end"])
    return out


def truth_fields(old_type, f):
    """Ground truth keeps every original field; the ones the contract names are renamed."""
    rename = {"identity_document": {"birth_date": "date_of_birth", "doc_number": "series_number"},
              "utility_bill": {"customer_name": "full_name"},
              "payslip": {"employee_name": "full_name"}}[old_type]
    return {rename.get(k, k): v for k, v in f.items()}


def pages(pdf):
    try:
        from pypdf import PdfReader
        return len(PdfReader(str(pdf)).pages)
    except Exception:
        return 1


def to_legacy(case_dir, name):
    src, dst = case_dir / name, case_dir / "legacy" / name
    if src.exists() and not dst.exists():
        dst.parent.mkdir(exist_ok=True)
        shutil.move(str(src), str(dst))
    return dst


def convert_case(case_dir, rules):
    cid = case_dir.name
    truth = json.loads(to_legacy(case_dir, "truth.json").read_text(encoding="utf-8"))
    scenario = json.loads(to_legacy(case_dir, "scenario.json").read_text(encoding="utf-8"))
    for name in ("expected_flags.json", "expected_result.json", "pipeline_result.json"):
        to_legacy(case_dir, name)

    documents, truth_docs = [], []
    for d in truth["documents"]:
        new_type = DOC_TYPES[d["doc_type"]]
        documents.append({
            "doc_id": d["doc_id"], "file": d["file"], "mime_type": "application/pdf",
            "pages": pages(case_dir / d["file"]), "uploaded_at": TS, "doc_type": new_type,
            "classification_confidence": 1.0, "owner_person_id": d["owner_person_id"],
            "fields": contract_fields(d["doc_id"], d["doc_type"], d["fields"]),
        })
        truth_docs.append({**d, "doc_type": new_type, "fields": truth_fields(d["doc_type"], d["fields"])})

    case_file = {
        "case_id": cid, "playbook_id": "pb_cont_pf_v1", "customer_type": "PF", "status": "intake",
        "created_at": TS, "updated_at": TS, "company": None,
        "persons": [{"person_id": p["person_id"], "role": p["role"], "full_name": p["full_name"]} for p in truth["persons"]],
        "documents": documents, "flags": [], "risk_draft": None, "decision": None,
    }
    expected = EXPECTED[cid]
    flags = [{"rule_id": r, "check": rules[r]["check"], "severity": rules[r]["severity"],
              "description": rules[r]["description"]} for r in expected]
    result = {"case_id": cid, "playbook_id": "pb_cont_pf_v1", "rule_ids": expected, "flag_count": len(expected),
              "decision": None, "project_pipeline_run": False,
              "expected_result_kind": "Scenario expectation for pb_cont_pf_v1, derived from procedure PF-ONB-01."}
    if cid in OUT_OF_PROCEDURE:
        result["out_of_procedure"] = OUT_OF_PROCEDURE[cid]
    scenario.update(expected_rule_ids=expected, playbook_id="pb_cont_pf_v1",
                    legacy_expected_rule_ids=scenario.get("legacy_expected_rule_ids", scenario.get("expected_rule_ids")))
    if cid in OUT_OF_PROCEDURE:
        scenario["out_of_procedure"] = OUT_OF_PROCEDURE[cid]

    write = lambda name, obj: (case_dir / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write("case_file.extracted.json", case_file)
    write("truth.json", {**truth, "documents": truth_docs, "playbook_id": "pb_cont_pf_v1"})
    write("expected_flags.json", flags)
    write("expected_result.json", result)
    write("scenario.json", scenario)
    return cid, expected


def main():
    rules = {r["rule_id"]: r for r in json.loads(PLAYBOOK.read_text(encoding="utf-8"))["rules"]}
    legacy = HERE / "legacy"
    legacy.mkdir(exist_ok=True)
    for rel in ("rules/rules.json", "verification/results.json", "verification/validation.json"):
        src, dst = HERE / rel, legacy / rel
        if src.exists() and not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
    for d in (HERE / "rules", HERE / "verification"):
        if d.exists() and not any(d.iterdir()):
            d.rmdir()

    manifest_path = HERE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for doc in manifest["documents"]:
        doc["doc_type"] = DOC_TYPES.get(doc["doc_type"], doc["doc_type"])
    manifest["playbook_id"] = "pb_cont_pf_v1"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for case_dir in sorted(CASES.glob("case_pf_*")):
        cid, expected = convert_case(case_dir, rules)
        print(f"{cid}: {expected or 'no flags'}")


if __name__ == "__main__":
    main()
