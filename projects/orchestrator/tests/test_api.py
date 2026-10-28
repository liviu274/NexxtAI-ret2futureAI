import json
import os
import tempfile

os.environ["NEXXT_RUNS_DIR"] = tempfile.mkdtemp(prefix="nexxt_api_")

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

    assert client.post("/cases/case_api/decision", json={"outcome": "rejected"}).status_code == 422
    assert client.post("/cases/case_api/decision", json={"outcome": "approved"}, headers={"X-Analyst": "maria"}).status_code == 403
    done = client.post("/cases/case_api/decision", json={"outcome": "rejected", "note": "expired ID"}, headers={"X-Analyst": "maria"})
    assert done.status_code == 200 and done.json()["decision"]["decided_by"] == "maria"

    audit = client.get("/cases/case_api/audit").json()
    assert audit["chain_valid"] and audit["entries"][-1]["tool"] == "decision"
    assert client.get("/cases/nope").status_code == 404
