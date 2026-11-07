"""SQLite storage: no lost updates, a change and its audit entry commit together, file-based runs import unchanged."""
import json
from datetime import date

import pytest

from nexxt_orchestrator.audit import AuditLog, _digest
from nexxt_orchestrator.checks import CHECKS, load_stubs, register
from nexxt_orchestrator.identity import IdentityStore
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, ConcurrentUpdate, PlaybookStore

CONVENTIONS = REPO_ROOT / "conventions"


def example() -> CaseFile:
    case = CaseFile.model_validate(json.loads((CONVENTIONS / "case_file.example.json").read_text()))
    case.flags, case.risk_draft, case.decision = [], None, None
    return case


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([CONVENTIONS]), today=lambda: date(2026, 10, 28))


@pytest.fixture(autouse=True)
def restore_checks():
    load_stubs()
    saved = dict(CHECKS)
    yield
    CHECKS.clear()
    CHECKS.update(saved)


def test_a_stale_copy_cannot_overwrite_a_newer_change(orch):
    orch.submit(example())
    first, second = orch.store.load("case_0001"), orch.store.load("case_0001")
    first.status = "review"
    orch.store.save(first)
    second.status = "waiting_client"
    with pytest.raises(ConcurrentUpdate):
        orch.store.save(second)
    assert orch.store.load("case_0001").status == "review"


def test_the_pipeline_reruns_instead_of_erasing_a_change_made_while_it_ran(orch):
    case = orch.submit(example())
    orch.process(case.case_id)
    calls = []

    @register("pdf_metadata")
    def analyst_acts_meanwhile(ctx):
        if not calls:  # first run only: an analyst dismisses a flag while the pipeline is busy
            orch.dismiss_flag(case.case_id, "flag_001", "maria", "checked with the client")
        calls.append(1)
        return []

    done = orch.process(case.case_id)
    assert len(calls) == 2  # ran again on the case as it was after the dismissal
    assert next(f for f in done.flags if f.flag_id == "flag_001").status == "dismissed"
    assert orch.audit.verify(case.case_id)


def test_a_decision_and_its_audit_entry_commit_together(orch, monkeypatch):
    case = orch.submit(example())
    before = len(orch.audit.entries(case.case_id))

    def disk_full(_case):
        raise OSError("disk full")
    monkeypatch.setattr(orch.store, "save", disk_full)
    with pytest.raises(OSError):
        orch.decide(case.case_id, "rejected", "maria")
    monkeypatch.undo()
    assert orch.store.load(case.case_id).decision is None
    assert len(orch.audit.entries(case.case_id)) == before  # no "decision" entry for a decision that was not saved
    assert orch.audit.verify(case.case_id)


def test_runs_stored_as_files_are_imported_with_their_audit_chain(tmp_path):
    folder = tmp_path / "case_0001"
    folder.mkdir()
    (folder / "case.json").write_text(example().model_dump_json(), encoding="utf-8")
    entries, previous = [], None
    for seq, (tool, duration) in enumerate([("submit", 0), ("check:not_expired", 1.25)], start=1):
        entry = {"seq": seq, "ts": "2026-10-28T10:00:00.000+02:00", "case_id": "case_0001", "actor": "orchestrator", "tool": tool,
                 "input": {"rule_id": "R-PF-002", "nested": [1, 2.5]}, "output": None, "duration_ms": duration, "error": None,
                 "prev_hash": previous}
        entry["hash"] = previous = _digest(entry)
        entries.append(entry)
    (folder / "audit.jsonl").write_text("".join(json.dumps(e) + "\n" for e in entries), encoding="utf-8")
    (folder / "identity").mkdir()
    (folder / "identity" / "identity.json").write_text(json.dumps({"consent": {"at": "2026-10-28T10:00:00+02:00", "items": ["kyc"]}}))

    store, audit = CaseStore(tmp_path), AuditLog(tmp_path)
    assert store.load("case_0001").case_id == "case_0001"
    assert [e["tool"] for e in audit.entries("case_0001")] == ["submit", "check:not_expired"]
    assert audit.verify("case_0001")  # same hashes: ints stay ints, floats stay floats
    assert IdentityStore(tmp_path).load("case_0001")["consent"]["items"] == ["kyc"]
    audit.record("case_0001", "orchestrator", "pipeline_done", {"mode": "full"}, None, 0)
    assert audit.verify("case_0001") and len(audit.entries("case_0001")) == 3
    CaseStore(tmp_path)  # importing again changes nothing
    assert len(audit.entries("case_0001")) == 3
