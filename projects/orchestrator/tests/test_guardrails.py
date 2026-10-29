"""Each test is an attack or slip that used to get through: approving without the deep checks, a self-declared
analyst, a path in an id, overwriting a decided case, client-supplied field values, a truncated audit log."""
import json
import os
import tempfile

os.environ.setdefault("NEXXT_RUNS_DIR", tempfile.mkdtemp(prefix="nexxt_api_"))

import pytest
from fastapi.testclient import TestClient

from nexxt_orchestrator.api import app
from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import CaseExists, NeedsSecondAnalyst, Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

DATA = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"
PF = DATA / "PF" / "data" / "gigel" / "cases"
PJ = DATA / "PJ" / "cases"
client = TestClient(app)


def fixture(case_dir, case_id=None) -> CaseFile:
    case = CaseFile.model_validate(json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    if case_id:
        case.case_id = case_id
    return case


@pytest.fixture
def orch(tmp_path, monkeypatch):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore())


def test_cannot_approve_after_intake_only(orch, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF / "case_pf_00_corect_control"))
    case = fixture(PF / "case_pf_00_corect_control")
    docs, case.documents = case.documents, []
    orch.submit(case)
    for doc in docs:
        orch.add_document(case.case_id, doc)
    with pytest.raises(PermissionError, match="full check"):
        orch.decide(case.case_id, "approved", "maria")
    orch.process(case.case_id)
    assert orch.decide(case.case_id, "approved", "maria").status == "decided"


def test_a_new_upload_after_the_full_run_needs_a_new_run(orch, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF / "case_pf_00_corect_control"))
    case = fixture(PF / "case_pf_00_corect_control")
    last = case.documents.pop()
    orch.submit(case)
    orch.process(case.case_id)
    orch.add_document(case.case_id, last)
    with pytest.raises(PermissionError, match="full check"):
        orch.decide(case.case_id, "approved", "maria")


def test_check_that_could_not_run_must_be_acknowledged(orch, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", "/nonexistent")  # tamper cannot open the files: medium "could not run"
    case = orch.submit(fixture(PF / "case_pf_08_metadate_suspecte"))
    done = orch.process(case.case_id)
    medium = [f.flag_id for f in done.flags if f.severity == "medium" and f.status == "open"]
    assert medium
    with pytest.raises(PermissionError, match="acknowledged"):
        orch.decide(case.case_id, "approved", "maria")
    for flag_id in medium:
        orch.dismiss_flag(case.case_id, flag_id, "maria", "checked the original PDF by hand")
    assert orch.decide(case.case_id, "approved", "maria").decision.decided_by == "maria"


def test_critical_flag_needs_two_different_analysts(orch, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF / "case_pf_12_modificari_combinate"))
    case = orch.submit(fixture(PF / "case_pf_12_modificari_combinate"))
    done = orch.process(case.case_id)
    critical = next(f for f in done.flags if f.severity == "critical")
    with pytest.raises(NeedsSecondAnalyst):
        orch.dismiss_flag(case.case_id, critical.flag_id, "maria", "false positive")
    with pytest.raises(NeedsSecondAnalyst):  # the same analyst again is still one analyst
        orch.dismiss_flag(case.case_id, critical.flag_id, " maria ", "really")
    after = orch.dismiss_flag(case.case_id, critical.flag_id, "elena", "agree, original seen")
    assert next(f for f in after.flags if f.flag_id == critical.flag_id).status == "dismissed"


@pytest.mark.parametrize("who", ["", "  ", " agent", "System", "orchestrator-bot"])
def test_machines_and_blank_names_cannot_decide(orch, who):
    case = orch.submit(fixture(PF / "case_pf_00_corect_control"))
    with pytest.raises(PermissionError, match="human"):
        orch.decide(case.case_id, "rejected", who)


def test_a_case_id_is_never_overwritten(orch):
    case = orch.submit(fixture(PF / "case_pf_00_corect_control"))
    orch.decide(case.case_id, "rejected", "maria")
    with pytest.raises(CaseExists):
        orch.submit(fixture(PF / "case_pf_00_corect_control"))
    assert orch.store.load(case.case_id).status == "decided"


def test_truncating_the_audit_log_is_detected(orch):
    case = orch.submit(fixture(PF / "case_pf_00_corect_control"))
    orch.decide(case.case_id, "rejected", "maria")
    path = orch.audit.path(case.case_id)
    assert orch.audit.verify(case.case_id)
    path.write_text("".join(path.read_text().splitlines(keepends=True)[:-1]))
    assert not orch.audit.verify(case.case_id)


# --- over HTTP ---------------------------------------------------------------------------------------------------

def post_case(case_id, case_dir=PF / "case_pf_00_corect_control", documents=True):
    case = json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8"))
    case.update(case_id=case_id, flags=[], risk_draft=None, decision=None)
    if not documents:
        case["documents"] = []
    return client.post("/cases", json=case)


def test_path_in_a_case_id_is_rejected():
    assert post_case("../escaped").status_code == 422
    assert client.get("/cases/..", headers={"X-Analyst": "maria"}).status_code == 404
    assert client.get("/cases/%2E%2E/audit", headers={"X-Analyst": "maria"}).status_code == 404


def test_duplicate_case_is_a_conflict():
    assert post_case("case_dup").status_code == 200
    assert post_case("case_dup").status_code == 409


def test_client_cannot_hand_in_extracted_fields(monkeypatch):
    post_case("case_fixture_api", documents=False)
    doc = json.loads((PF / "case_pf_03_act_expirat" / "case_file.extracted.json").read_text())["documents"][0]
    assert client.post("/cases/case_fixture_api/documents/extracted", json=doc).status_code == 404
    monkeypatch.setenv("NEXXT_FIXTURE_API", "1")
    assert client.post("/cases/case_fixture_api/documents/extracted", json=doc).status_code == 200


def test_upload_without_ocr_is_refused_instead_of_misleading_the_client(monkeypatch):
    post_case("case_no_ocr", documents=False)
    monkeypatch.delenv("NEXXT_ALLOW_UPLOAD_WITHOUT_OCR", raising=False)
    with open(PF / "case_pf_00_corect_control" / "docs" / "doc_001_identity_document.pdf", "rb") as f:
        res = client.post("/cases/case_no_ocr/documents", files={"file": ("id.pdf", f)})
    assert res.status_code == 503 and "FEATHERLESS_API_KEY" in res.json()["detail"]


def test_audit_of_unknown_case_is_404():
    assert client.get("/cases/does_not_exist/audit", headers={"X-Analyst": "maria"}).status_code == 404


def test_tokens_replace_the_self_declared_analyst(monkeypatch):
    post_case("case_tokens")
    client.post("/cases/case_tokens/process")
    monkeypatch.setenv("NEXXT_ANALYSTS", "Maria Ionescu=secret-1,Elena Radu=secret-2")
    assert client.get("/cases/case_tokens").status_code == 401  # staff data needs a token now
    assert client.post("/cases/case_tokens/decision", json={"outcome": "rejected"},
                       headers={"X-Analyst": "notreallyahuman"}).status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer secret-2"}).json()["analyst"] == "Elena Radu"
    done = client.post("/cases/case_tokens/decision", json={"outcome": "rejected"},
                       headers={"Authorization": "Bearer secret-1", "X-Analyst": "someone else"})
    assert done.json()["decision"]["decided_by"] == "Maria Ionescu"
    assert client.get("/cases/case_tokens/client-status").status_code == 200  # the client's view stays open


def test_critical_dismissal_over_http_waits_for_a_second_analyst():
    post_case("case_four_eyes", PF / "case_pf_12_modificari_combinate")
    case = client.post("/cases/case_four_eyes/process").json()
    flag_id = next(f["flag_id"] for f in case["flags"] if f["severity"] == "critical")
    url = f"/cases/case_four_eyes/flags/{flag_id}/dismiss"
    first = client.post(url, json={"note": "ok"}, headers={"X-Analyst": "maria"})
    assert first.status_code == 202 and first.json()["pending"]
    second = client.post(url, json={"note": "agree"}, headers={"X-Analyst": "elena"})
    assert next(f for f in second.json()["flags"] if f["flag_id"] == flag_id)["status"] == "dismissed"


def test_client_status_never_shows_flags_risk_or_screening():
    post_case("case_client_view", PF / "case_pf_12_modificari_combinate")
    client.post("/cases/case_client_view/process")
    view = client.get("/cases/case_client_view/client-status").json()
    text = json.dumps(view).lower()
    assert "flag" not in text and "risk" not in text and "screening" not in text and "photoshop" not in text
    assert view["status"] in ("review", "waiting_client")


def test_document_pages_render_for_the_review_screen(monkeypatch):
    monkeypatch.setenv("NEXXT_ALLOW_UPLOAD_WITHOUT_OCR", "1")
    post_case("case_pages", documents=False)
    with open(PF / "case_pf_00_corect_control" / "docs" / "doc_001_identity_document.pdf", "rb") as f:
        client.post("/cases/case_pages/documents", files={"file": ("id.pdf", f)})
    page = client.get("/cases/case_pages/documents/doc_001/pages/1.png", headers={"X-Analyst": "maria"})
    assert page.status_code == 200 and page.content.startswith(b"\x89PNG")
    assert client.get("/cases/case_pages/documents/doc_001/pages/9.png", headers={"X-Analyst": "maria"}).status_code == 404
    pdf = client.get("/cases/case_pages/documents/doc_001/file", headers={"X-Analyst": "maria"})
    assert pdf.content.startswith(b"%PDF-")


def test_ownership_compares_registry_and_declaration():
    post_case("case_owners", PJ / "case_pj_07_procente_diferite")
    view = client.get("/cases/case_owners/ownership", headers={"X-Analyst": "maria"}).json()
    assert view["registry_found"] and view["registry"] and view["declared"]
    pct = {p["name"]: p["pct"] for p in view["registry"]}
    assert any(pct.get(p["name"]) != p["pct"] for p in view["declared"])


def test_client_upload_and_process_return_the_client_view_once_tokens_exist(monkeypatch):
    post_case("case_client_calls", PF / "case_pf_12_modificari_combinate")
    monkeypatch.setenv("NEXXT_ANALYSTS", "Maria Ionescu=secret-1")
    as_client = client.post("/cases/case_client_calls/process").json()
    assert "flags" not in as_client and "risk_draft" not in as_client and as_client["status"] == "review"
    as_staff = client.post("/cases/case_client_calls/process", headers={"Authorization": "Bearer secret-1"}).json()
    assert "flags" in as_staff


def test_a_different_address_is_flagged_for_the_analyst_but_does_not_stop_the_case(orch, monkeypatch):
    # The client may simply have moved: the analyst sees it and decides, the client is not asked automatically.
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF / "case_pf_05_adresa_factura_diferita"))
    case = orch.submit(fixture(PF / "case_pf_05_adresa_factura_diferita"))
    done = orch.process(case.case_id)
    address = next(f for f in done.flags if f.rule_id == "R-PF-009")
    assert (address.severity, address.client_fixable, address.fix_message, address.status) == ("low", False, None, "open")
    assert done.status == "review" and orch.client_messages(case.case_id) == []
    assert done.risk_draft.level == "low"
    assert orch.decide(case.case_id, "approved", "maria").decision.outcome == "approved"
