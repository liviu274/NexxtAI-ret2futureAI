from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CustomerType = Literal["PF", "PJ"]
Role = Literal["applicant", "company", "administrator", "shareholder", "ubo", "signatory"]
Stage = Literal["classify", "extract", "validate", "cross_check", "tamper", "screening", "risk"]
Severity = Literal["info", "low", "medium", "high", "critical"]
FlagStatus = Literal["open", "sent_to_client", "resolved", "dismissed"]
CaseStatus = Literal["intake", "processing", "waiting_client", "review", "decided"]
Outcome = Literal["approved", "rejected", "documents_requested"]

SEVERITY_RANK: dict[str, int] = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
BLOCKING = {"high", "critical"}
CLIENT_VISIBLE_STAGES = {"validate", "cross_check"}

# Case and document ids become folder and file names, so they can never hold a path.
SAFE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"
SafeId = Annotated[str, Field(pattern=SAFE_ID_PATTERN)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceRef(Model):
    page: int
    quote: str
    clause: str | None = None



class SourceProcedure(Model):
    file: str
    generated_at: datetime


class RequiredDocument(Model):
    doc_type: str
    applies_to: Role
    min_count: int = 1
    alternatives: list[str] = Field(default_factory=list)
    fields: list[str] = Field(default_factory=list)
    source_ref: SourceRef


class Rule(Model):
    rule_id: str
    stage: Stage
    check: str
    params: dict[str, Any] = Field(default_factory=dict)
    applies_to: Role
    severity: Severity
    description: str
    client_fixable: bool
    fix_message: str | None = None
    source_ref: SourceRef


class PersonFlows(Model):
    roles: list[Role]
    playbook_id: str


class Playbook(Model):
    playbook_id: str
    version: int
    process_name: str
    customer_type: CustomerType
    source_procedure: SourceProcedure
    required_documents: list[RequiredDocument]
    rules: list[Rule]
    person_flows: PersonFlows | None = None



class Source(Model):
    doc_id: str
    page: int
    bbox: list[float]


class ExtractedField(Model):
    field_id: str
    name: str
    value: Any
    value_type: Literal["string", "date", "number", "money", "cnp", "cui", "address"]
    raw_text: str
    confidence: float
    source: Source
    extracted_by: str


class Person(Model):
    person_id: str
    role: Role
    full_name: str


class Document(Model):
    doc_id: SafeId
    file: str
    mime_type: str
    pages: int
    uploaded_at: datetime
    doc_type: str = "unknown"
    classification_confidence: float = 0.0
    owner_person_id: str | None = None
    fields: dict[str, ExtractedField] = Field(default_factory=dict)



class Evidence(Model):
    doc_id: str
    page: int
    bbox: list[float]
    field_id: str | None = None
    quote: str | None = None


class Flag(Model):
    flag_id: str
    case_id: str
    rule_id: str
    person_id: str | None = None
    stage: Stage
    severity: Severity
    title: str
    explanation: str
    evidence: list[Evidence] = Field(min_length=1)
    client_fixable: bool
    fix_message: str | None = None
    status: FlagStatus = "open"
    created_by: str
    created_at: datetime
    resolution_note: str | None = None


class RiskReason(Model):
    text: str
    flag_ids: list[str] = Field(default_factory=list)


class RiskDraft(Model):
    level: Literal["low", "medium", "high"]
    reasons: list[RiskReason]
    is_draft: Literal[True] = True


class Decision(Model):
    outcome: Outcome
    decided_by: str
    decided_at: datetime
    note: str | None = None


class CaseFile(Model):
    case_id: SafeId
    playbook_id: str
    customer_type: CustomerType
    status: CaseStatus = "intake"
    created_at: datetime
    updated_at: datetime
    company: dict[str, Any] | None = None
    persons: list[Person] = Field(default_factory=list)
    documents: list[Document] = Field(default_factory=list)
    flags: list[Flag] = Field(default_factory=list)
    risk_draft: RiskDraft | None = None
    decision: Decision | None = None
