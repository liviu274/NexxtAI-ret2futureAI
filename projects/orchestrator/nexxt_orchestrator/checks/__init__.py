from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Callable

from ..models import CLIENT_VISIBLE_STAGES, CaseFile, Document, Evidence, Flag, Playbook, RiskDraft, Rule

CheckResult = list[Flag] | RiskDraft
CheckFn = Callable[["CheckContext"], CheckResult]

CHECKS: dict[str, CheckFn] = {}


def register(name: str) -> Callable[[CheckFn], CheckFn]:
    def decorator(fn: CheckFn) -> CheckFn:
        CHECKS[name] = fn
        return fn

    return decorator


class _KeepUnknown(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def whole_doc_evidence(doc: Document, quote: str | None = None) -> Evidence:
    return Evidence(doc_id=doc.doc_id, page=1, bbox=[0.0, 0.0, 1.0, 1.0], quote=quote)


@dataclass
class CheckContext:
    case: CaseFile
    playbook: Playbook
    rule: Rule
    today: date
    person_id: str | None = None
    created_by: str = "orchestrator"

    @property
    def owner_ids(self) -> set[str]:
        if self.person_id:
            return {self.person_id}
        return {p.person_id for p in self.case.persons if p.role == self.rule.applies_to}

    def documents(self, *doc_types: str) -> list[Document]:
        owners = self.owner_ids
        return [
            d
            for d in self.case.documents
            if d.doc_type in doc_types and (d.owner_person_id in owners if owners else d.owner_person_id is None)
        ]

    def flag(
        self,
        *,
        title: str,
        explanation: str,
        evidence: list[Evidence],
        fix_vars: dict[str, object] | None = None,
    ) -> Flag:
        rule = self.rule
        to_client = rule.client_fixable and rule.stage in CLIENT_VISIBLE_STAGES
        message = None
        if to_client and rule.fix_message:
            message = rule.fix_message.format_map(_KeepUnknown(fix_vars or {}))
        return Flag(
            flag_id="flag_pending",
            case_id=self.case.case_id,
            rule_id=rule.rule_id,
            person_id=self.person_id,
            stage=rule.stage,
            severity=rule.severity,
            title=title[:80],
            explanation=explanation,
            evidence=evidence,
            client_fixable=to_client,
            fix_message=message,
            status="open",
            created_by=self.created_by,
            created_at=datetime.now().astimezone(),
        )


def load_stubs() -> None:
    from . import stubs, screening, registry, cross_check, validate
