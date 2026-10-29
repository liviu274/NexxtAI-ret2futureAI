import json
import os
import tempfile
from pathlib import Path

os.environ["NEXXT_RUNS_DIR"] = tempfile.mkdtemp(prefix="nexxt_api_")
os.environ["NEXXT_ALLOW_UPLOAD_WITHOUT_OCR"] = "1"  # these tests store files; no model reads them

from fastapi.testclient import TestClient

from nexxt_orchestrator.api import app
from nexxt_orchestrator.store import REPO_ROOT

client = TestClient(app)


def test_full_flow_over_http():
    case = json.loads((REPO_ROOT / "conventions" / "case_file.example.json").read_text())
    case.update(case_id="case_api", flags=[], risk_draft=None, decision=None)
    assert client.post("/cases", json=case).status_code == 200
    processed = client.post("/cases/case_api/process").json()
    assert processed["status"] == "waiting_client"
    assert len(client.get("/cases/case_api/client-messages").json()) == 2

    assert client.post("/cases/case_api/decision", json={"outcome": "rejected"}).status_code == 401
    assert client.post("/cases/case_api/decision", json={"outcome": "approved"}, headers={"X-Analyst": "maria"}).status_code == 403
    done = client.post("/cases/case_api/decision", json={"outcome": "rejected", "note": "expired ID"}, headers={"X-Analyst": "maria"})
    assert done.status_code == 200 and done.json()["decision"]["decided_by"] == "maria"

    audit = client.get("/cases/case_api/audit").json()
    assert audit["chain_valid"] and audit["entries"][-1]["tool"] == "decision"
    assert client.get("/cases/nope").status_code == 404


PF_CASE = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ" / "PF" / "data" / "gigel" / "cases" / "case_pf_00_corect_control"


def new_case(case_id):
    case = json.loads((REPO_ROOT / "conventions" / "case_file.example.json").read_text())
    case.update(case_id=case_id, documents=[], flags=[], risk_draft=None, decision=None)
    assert client.post("/cases", json=case).status_code == 200


def upload(case_id, path, name=None, replaces=None):
    params = {"replaces": replaces} if replaces else {}
    with open(path, "rb") as f:
        return client.post(f"/cases/{case_id}/documents", params=params, files={"file": (name or path.name, f)})


def test_upload_stores_the_file_and_registers_an_unknown_document():
    new_case("case_upload")
    res = upload("case_upload", PF_CASE / "docs" / "doc_001_identity_document.pdf")
    assert res.status_code == 200
    [doc] = res.json()["documents"]
    assert doc["doc_id"] == "doc_001" and doc["file"] == "docs/doc_001.pdf"
    assert doc["mime_type"] == "application/pdf" and doc["pages"] == 1 and doc["doc_type"] == "unknown"
    stored = Path(os.environ["NEXXT_RUNS_DIR"]) / "case_upload" / "docs" / "doc_001.pdf"
    assert stored.read_bytes() == (PF_CASE / "docs" / "doc_001_identity_document.pdf").read_bytes()

    png = upload("case_upload", PF_CASE / "images" / "doc_003_payslip.png", name="../../evil.pdf").json()["documents"][-1]
    assert png["doc_id"] == "doc_002" and png["file"] == "docs/doc_002.png" and png["mime_type"] == "image/png"

    tools = [e["tool"] for e in client.get("/cases/case_upload/audit").json()["entries"]]
    assert tools.count("receive_file") == 2 and tools.count("upload_document") == 2


def test_replacing_a_document_never_reuses_its_id():
    new_case("case_replace")
    upload("case_replace", PF_CASE / "docs" / "doc_001_identity_document.pdf")
    res = upload("case_replace", PF_CASE / "docs" / "doc_001_identity_document.pdf", replaces="doc_001")
    assert [d["doc_id"] for d in res.json()["documents"]] == ["doc_002"]
    assert upload("case_replace", PF_CASE / "docs" / "doc_001_identity_document.pdf", replaces="doc_999").status_code == 404


def test_upload_rejects_wrong_type_size_and_unknown_case(tmp_path):
    new_case("case_reject")
    fake = tmp_path / "id.pdf"
    fake.write_bytes(b"MZ not really a pdf")
    assert upload("case_reject", fake).status_code == 415
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.7 truncated")
    assert upload("case_reject", broken).status_code == 422
    big = tmp_path / "big.pdf"
    big.write_bytes(b"%PDF-" + b"0" * (10 * 1024 * 1024))
    assert upload("case_reject", big).status_code == 413
    assert upload("nope", PF_CASE / "docs" / "doc_001_identity_document.pdf").status_code == 404
    assert client.get("/cases/case_reject").json()["documents"] == []
