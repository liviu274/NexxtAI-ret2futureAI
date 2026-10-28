from __future__ import annotations

from datetime import date, datetime
from typing import Callable, Literal

from .audit import AuditLog
from .checks import CHECKS, CheckContext, load_stubs, whole_doc_evidence
from .models import (
    BLOCKING, CLIENT_VISIBLE_STAGES, CaseFile, Decision, Document, Flag, Outcome, Playbook, RiskDraft, Rule,
)
from .store import CaseStore, PlaybookStore

STAGE_ORDER = ["validate", "cross_check", "tamper", "screening"]
ACTIVE = ("open", "sent_to_client")

IngestFn = Callable[[CaseFile, Document], None]


def _noop_ingest(case: CaseFile, doc: Document) -> None:
    pass


class Orchestrator:
    def __init__(self, store: CaseStore, audit: AuditLog, playbooks: PlaybookStore, today: Callable[[], date] = date.today):
        load_stubs()
        self.store, self.audit, self.playbooks, self.today = store, audit, playbooks, today
        self.classify: IngestFn = _noop_ingest
        self.extract: IngestFn = _noop_ingest

    def set_ingest(self, classify: IngestFn | None = None, extract: IngestFn | None = None) -> None:
        if classify:
            self.classify = classify
        if extract:
            self.extract = extract

    def submit(self, case: CaseFile) -> CaseFile:
        playbook = self.playbooks.get(case.playbook_id)
        if playbook.customer_type != case.customer_type:
            raise ValueError(f"case is {case.customer_type} but playbook {playbook.playbook_id} is {playbook.customer_type}")
        case.status = "intake"
        self._touch(case)
        self.audit.record(case.case_id, "system", "submit", {"playbook_id": case.playbook_id}, {"documents": len(case.documents)}, 0)
        self.store.save(case)
        return case

    def add_document(self, case_id: str, doc: Document, replaces: str | None = None) -> CaseFile:
        case = self.store.load(case_id)
        if case.status == "decided":
            raise PermissionError("case is already decided")
        if replaces:
            old = next((d for d in case.documents if d.doc_id == replaces), None)
            if old is None:
                raise KeyError(replaces)
            case.documents.remove(old)
            doc.owner_person_id = doc.owner_person_id or old.owner_person_id
            self.audit.record(case_id, "client", "replace_document", {"old_doc_id": replaces, "old_file": old.file}, {"new_doc_id": doc.doc_id}, 0)
        case.documents.append(doc)
        self.audit.record(case_id, "client", "upload_document", {"doc_id": doc.doc_id, "file": doc.file}, None, 0)
        self.store.save(case)
        return self.process(case_id, mode="intake")

    def process(self, case_id: str, mode: Literal["intake", "full"] = "full") -> CaseFile:
        intake = mode == "intake"
        case = self.store.load(case_id)
        if case.status == "decided":
            raise PermissionError("case is already decided")
        if not case.documents:
            raise ValueError("case has no documents")
        case.status, case.decision = "processing", None
        playbook = self.playbooks.get(case.playbook_id)

        for doc in case.documents:
            if doc.doc_type == "unknown" or not doc.fields:
                self.audit.call(case_id, "orchestrator", "classify", {"doc_id": doc.doc_id}, lambda d=doc: self.classify(case, d))
                self.audit.call(case_id, "orchestrator", "extract", {"doc_id": doc.doc_id}, lambda d=doc: self.extract(case, d))

        runs = [(playbook, None)]
        if playbook.person_flows:
            person_playbook = self.playbooks.get(playbook.person_flows.playbook_id)
            runs += [(person_playbook, p.person_id) for p in case.persons if p.role in playbook.person_flows.roles]

        stages = [s for s in STAGE_ORDER if not intake or s in CLIENT_VISIBLE_STAGES]
        skipped = {r.rule_id for pb, _ in runs for r in pb.rules if intake and r.check == "required_present"}
        found: list[Flag] = []
        for pb, person_id in runs:
            for stage in stages:
                for rule in (r for r in pb.rules if r.stage == stage and r.rule_id not in skipped):
                    found += self._run_rule(case, pb, rule, person_id)
        self._reconcile(case, found, ran_stages=set(stages), skipped_rules=skipped)

        if not intake:
            drafts = []
            for pb, person_id in runs:
                for rule in (r for r in pb.rules if r.stage == "risk"):
                    result = self._run_rule(case, pb, rule, person_id, risk=True)
                    drafts += [r for r in result if isinstance(r, RiskDraft)]
            case.risk_draft = self._merge_drafts(drafts)

        waiting = any(f.client_fixable and f.status in ACTIVE for f in case.flags)
        case.status = "waiting_client" if waiting else ("intake" if intake else "review")
        self._touch(case)
        self.audit.record(case_id, "orchestrator", "pipeline_done", None, {"status": case.status, "open_flags": sum(f.status in ACTIVE for f in case.flags)}, 0)
        self.store.save(case)
        return case

    def _run_rule(self, case: CaseFile, pb: Playbook, rule: Rule, person_id: str | None, risk: bool = False) -> list:
        ctx = CheckContext(case=case, playbook=pb, rule=rule, today=self.today(), person_id=person_id)
        tool = f"check:{rule.check}"
        record_input = {"rule_id": rule.rule_id, "params": rule.params, "person_id": person_id}
        try:
            fn = CHECKS[rule.check]
            result = self.audit.call(case.case_id, "orchestrator", tool, record_input, lambda: fn(ctx))
        except Exception as exc:
            return [] if risk else [self._error_flag(ctx, exc)]
        if risk:
            return [result] if isinstance(result, RiskDraft) else []
        return [self._normalize(ctx, f) for f in result if isinstance(f, Flag)]

    def _normalize(self, ctx: CheckContext, flag: Flag) -> Flag:
        rule = ctx.rule
        to_client = rule.client_fixable and rule.stage in CLIENT_VISIBLE_STAGES
        return flag.model_copy(update={
            "rule_id": rule.rule_id, "stage": rule.stage, "severity": rule.severity,
            "client_fixable": to_client, "fix_message": flag.fix_message if to_client else None,
            "case_id": ctx.case.case_id,
        })

    def _error_flag(self, ctx: CheckContext, exc: Exception) -> Flag:
        flag = ctx.flag(
            title=f"Check {ctx.rule.check} could not run",
            explanation=f"{type(exc).__name__}: {exc}. Manual review required for rule {ctx.rule.rule_id}.",
            evidence=[whole_doc_evidence(ctx.case.documents[0])],
        )
        return flag.model_copy(update={"client_fixable": False, "fix_message": None, "severity": "medium",
                                       "created_by": "orchestrator"})


    @staticmethod
    def _key(flag: Flag) -> tuple:
        return (flag.rule_id, tuple(sorted({e.doc_id for e in flag.evidence})))

    def _reconcile(self, case: CaseFile, found: list[Flag], ran_stages: set[str], skipped_rules: set[str]) -> None:
        existing = {self._key(f): f for f in case.flags}
        seen: set[tuple] = set()
        next_id = len(case.flags) + 1
        merged: list[Flag] = []
        for flag in found:
            key = self._key(flag)
            if key in seen:
                continue
            seen.add(key)
            old = existing.get(key)
            if old is not None:
                if old.status == "resolved":
                    old = old.model_copy(update={"status": "sent_to_client" if old.client_fixable else "open", "resolution_note": None})
                merged.append(old)
                continue
            status = "sent_to_client" if flag.client_fixable else "open"
            merged.append(flag.model_copy(update={"flag_id": f"flag_{next_id:03d}", "status": status}))
            next_id += 1
        for key, old in existing.items():
            if key in seen:
                continue
            if old.status in ACTIVE and old.stage in ran_stages and old.rule_id not in skipped_rules:
                old = old.model_copy(update={"status": "resolved", "resolution_note": "No longer detected after re-check."})
            merged.append(old)
        case.flags = sorted(merged, key=lambda f: f.flag_id)

    @staticmethod
    def _merge_drafts(drafts: list[RiskDraft]) -> RiskDraft | None:
        if not drafts:
            return None
        rank = {"low": 0, "medium": 1, "high": 2}
        level = max((d.level for d in drafts), key=rank.__getitem__)
        reasons = [r for d in drafts for r in d.reasons]
        return RiskDraft(level=level, reasons=reasons)

    def client_messages(self, case_id: str) -> list[dict]:
        case = self.store.load(case_id)
        return [{"flag_id": f.flag_id, "message": f.fix_message} for f in case.flags
                if f.client_fixable and f.fix_message and f.status == "sent_to_client"]

    def dismiss_flag(self, case_id: str, flag_id: str, analyst: str, note: str) -> CaseFile:
        if not analyst or not note.strip():
            raise ValueError("dismissing a flag needs an analyst name and a note")
        case = self.store.load(case_id)
        flag = next((f for f in case.flags if f.flag_id == flag_id), None)
        if flag is None:
            raise KeyError(flag_id)
        flag.status, flag.resolution_note = "dismissed", f"{analyst}: {note}"
        self.audit.record(case_id, f"human:{analyst}", "dismiss_flag", {"flag_id": flag_id, "note": note}, None, 0)
        self._touch(case)
        self.store.save(case)
        return case

    def decide(self, case_id: str, outcome: Outcome, analyst: str, note: str | None = None) -> CaseFile:
        if not analyst or analyst.lower().startswith(("agent", "system", "orchestrator")):
            raise PermissionError("decisions can only be made by a named human analyst")
        case = self.store.load(case_id)
        if case.status == "decided":
            raise PermissionError("case is already decided")
        if outcome == "approved":
            blocking = [f.flag_id for f in case.flags if f.status in ACTIVE and f.severity in BLOCKING]
            if blocking:
                raise PermissionError(f"cannot approve with unresolved high/critical flags: {', '.join(blocking)}")
        case.decision = Decision(outcome=outcome, decided_by=analyst, decided_at=datetime.now().astimezone(), note=note)
        case.status = "waiting_client" if outcome == "documents_requested" else "decided"
        self.audit.record(case_id, f"human:{analyst}", "decision", {"outcome": outcome, "note": note}, {"status": case.status}, 0)
        self._touch(case)
        self.store.save(case)
        return case

    @staticmethod
    def _touch(case: CaseFile) -> None:
        case.updated_at = datetime.now().astimezone()
