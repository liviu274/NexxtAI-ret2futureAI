import copy
import json
from datetime import date
from pathlib import Path

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks import CHECKS, load_stubs, register
from nexxt_orchestrator.models import CaseFile, Evidence, PersonFlows, Playbook
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

CONVENTIONS = REPO_ROOT / "conventions"
TODAY = date(2026, 10, 28)


def load_case() -> CaseFile:
    case = CaseFile.model_validate(json.loads((CONVENTIONS / "case_file.example.json").read_text()))
    case.flags, case.risk_draft, case.decision = [], None, None
    return case


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([CONVENTIONS]), today=lambda: TODAY)


@pytest.fixture(autouse=True)
def restore_checks():
    load_stubs()
    saved = dict(CHECKS)
    yield
    CHECKS.clear()
    CHECKS.update(saved)


def run_full(orch):
    case = orch.submit(load_case())
    return orch.process(case.case_id)


def test_example_case_matches_expected_flags(orch):
    case = run_full(orch)
    assert {f.rule_id for f in case.flags} == {"R-PF-001", "R-PF-002"}
    assert case.status == "waiting_client"
    assert case.risk_draft and case.risk_draft.is_draft
    assert case.decision is None


def test_client_messages_only_for_fixable(orch):
    case = run_full(orch)
    messages = [m["message"] for m in orch.client_messages(case.case_id)]
    assert any("expired on 14.03.2025" in m for m in messages)
    assert all("{" not in m for m in messages)


def test_intake_mode_skips_completeness_and_deep_stages(orch):
    case = orch.submit(load_case())
    case = orch.process(case.case_id, mode="intake")
    assert {f.rule_id for f in case.flags} == {"R-PF-002"}
    assert case.risk_draft is None
    assert case.status == "waiting_client"


def test_fix_loop_resolves_flag_when_client_uploads_valid_id(orch):
    case = orch.submit(load_case())
    orch.process(case.case_id, mode="intake")
    new_id = copy.deepcopy(case.documents[0])
    new_id.doc_id = "doc_099"
    new_id.fields["expiry_date"].value = "2031-01-01"
    new_id.fields["expiry_date"].source.doc_id = "doc_099"
    case = orch.add_document(case.case_id, new_id, replaces="doc_001")
    expired = [f for f in case.flags if f.rule_id == "R-PF-002"]
    assert expired and all(f.status == "resolved" for f in expired)


def test_tamper_and_screening_flags_never_reach_client(orch):
    @register("pdf_metadata")
    def fake(ctx):
        doc = ctx.case.documents[0]
        return [ctx.flag(title="Edited with Photoshop", explanation="metadata", fix_vars={},
                         evidence=[Evidence(doc_id=doc.doc_id, page=1, bbox=[0, 0, 1, 1])])]

    case = run_full(orch)
    tamper = [f for f in case.flags if f.rule_id == "R-PF-006"]
    assert tamper and not tamper[0].client_fixable and tamper[0].fix_message is None
    assert tamper[0].severity == "critical"
    assert all("Photoshop" not in m["message"] for m in orch.client_messages(case.case_id))


def test_module_cannot_override_rule_severity_or_rule_id(orch):
    @register("pdf_metadata")
    def lying(ctx):
        doc = ctx.case.documents[0]
        flag = ctx.flag(title="x", explanation="y", evidence=[Evidence(doc_id=doc.doc_id, page=1, bbox=[0, 0, 1, 1])])
        return [flag.model_copy(update={"severity": "info", "rule_id": "R-FAKE", "client_fixable": True,
                                        "fix_message": "You are a fraudster"})]

    case = run_full(orch)
    flag = next(f for f in case.flags if f.title == "x")
    assert (flag.rule_id, flag.severity, flag.client_fixable, flag.fix_message) == ("R-PF-006", "critical", False, None)


def test_crashing_check_fails_closed(orch):
    @register("pdf_metadata")
    def boom(ctx):
        raise RuntimeError("parser exploded")

    case = run_full(orch)
    flag = next(f for f in case.flags if f.rule_id == "R-PF-006")
    assert "could not run" in flag.title and not flag.client_fixable
    assert any(e["tool"] == "check:pdf_metadata" and e["error"] for e in orch.audit.entries(case.case_id))


def test_rerun_is_idempotent_and_keeps_flag_ids(orch):
    first = run_full(orch)
    second = orch.process(first.case_id)
    assert [f.flag_id for f in first.flags] == [f.flag_id for f in second.flags]


def test_dismissed_flag_stays_dismissed(orch):
    case = run_full(orch)
    orch.dismiss_flag(case.case_id, "flag_001", "maria", "client called, accepted")
    case = orch.process(case.case_id)
    assert next(f for f in case.flags if f.flag_id == "flag_001").status == "dismissed"


def test_approve_blocked_by_open_high_flags_and_agent_cannot_decide(orch):
    case = run_full(orch)
    with pytest.raises(PermissionError, match="unresolved high/critical"):
        orch.decide(case.case_id, "approved", "maria")
    for who in ("agent", "system", "orchestrator", ""):
        with pytest.raises(PermissionError, match="human"):
            orch.decide(case.case_id, "rejected", who)
    assert orch.process(case.case_id).decision is None
    decided = orch.decide(case.case_id, "rejected", "maria", "expired ID, no reply")
    assert decided.status == "decided" and decided.decision.decided_by == "maria"


def test_decided_case_is_frozen(orch):
    case = run_full(orch)
    orch.decide(case.case_id, "rejected", "maria")
    with pytest.raises(PermissionError):
        orch.process(case.case_id)


def test_audit_log_records_every_call_and_detects_tampering(orch, tmp_path):
    case = run_full(orch)
    entries = orch.audit.entries(case.case_id)
    tools = [e["tool"] for e in entries]
    assert "submit" in tools and "check:not_expired" in tools and "pipeline_done" in tools
    assert all(e["ts"] and e["duration_ms"] >= 0 for e in entries)
    assert orch.audit.verify(case.case_id)
    path = orch.audit.path(case.case_id)
    path.write_text(path.read_text().replace("check:not_expired", "check:nothing", 1))
    assert not orch.audit.verify(case.case_id)


def test_pj_person_flow_runs_for_every_ubo(orch):
    pj = Playbook.model_validate(json.loads((CONVENTIONS / "playbook.example.json").read_text()))
    pj.playbook_id, pj.customer_type = "pb_kyb_test", "PJ"
    pj.person_flows = PersonFlows(roles=["ubo"], playbook_id="pb_kyc_pf_v1")
    pj.rules = [r for r in pj.rules if r.check == "risk_factors"]
    for rule in pj.rules:
        rule.applies_to = "company"
    orch.playbooks = type("PB", (), {"get": lambda self, i: pj if i == "pb_kyb_test" else PlaybookStore([CONVENTIONS]).get(i)})()

    case = load_case()
    case.playbook_id, case.customer_type = "pb_kyb_test", "PJ"
    case.persons[0].role = "ubo"
    case.persons.append(case.persons[0].model_copy(update={"person_id": "p_2", "full_name": "ION IONESCU"}))
    orch.submit(case)
    out = orch.process(case.case_id)
    ran = [e["input"]["person_id"] for e in orch.audit.entries(case.case_id) if e["tool"] == "check:not_expired"]
    assert sorted(ran) == ["p_1", "p_2"]
    assert {f.rule_id for f in out.flags} >= {"R-PF-002"}


def test_required_present_checks_every_person_with_the_role(orch):
    pj = Playbook.model_validate(json.loads((CONVENTIONS / "playbook.example.json").read_text()))
    pj.playbook_id, pj.customer_type = "pb_kyb_test", "PJ"
    rule = next(r for r in pj.rules if r.check == "required_present")
    rule.applies_to, rule.params = "ubo", {"doc_type": "id_card", "min_count": 1}
    pj.rules = [rule]
    orch.playbooks = type("PB", (), {"get": lambda self, i: pj})()

    case = load_case()
    case.playbook_id, case.customer_type = "pb_kyb_test", "PJ"
    case.persons[0].role = "ubo"
    case.persons.append(case.persons[0].model_copy(update={"person_id": "p_2", "full_name": "ION IONESCU"}))
    orch.submit(case)
    out = orch.process(case.case_id)
    assert [(f.rule_id, f.person_id) for f in out.flags] == [(rule.rule_id, "p_2")]
    assert "ION IONESCU" in out.flags[0].title


def test_mismatched_customer_type_rejected(orch):
    case = load_case()
    case.customer_type = "PJ"
    with pytest.raises(ValueError):
        orch.submit(case)


def test_no_check_in_catalog_can_decide():
    assert not [name for name in CHECKS if "decid" in name or "approve" in name]
