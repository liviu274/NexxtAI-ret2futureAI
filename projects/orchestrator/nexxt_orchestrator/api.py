from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .audit import AuditLog
from .models import CaseFile, Document, Outcome
from .orchestrator import Orchestrator
from .store import DEFAULT_RUNS_DIR, CaseStore, PlaybookStore

store = CaseStore(DEFAULT_RUNS_DIR)
audit = AuditLog(DEFAULT_RUNS_DIR)
playbooks = PlaybookStore()
orchestrator = Orchestrator(store, audit, playbooks)

app = FastAPI(title="NexxtAI orchestrator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _guard(fn):
    try:
        return fn()
    except KeyError as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class DecisionBody(BaseModel):
    outcome: Outcome
    note: str | None = None


class DismissBody(BaseModel):
    note: str


@app.get("/playbooks")
def list_playbooks():
    return list(playbooks.all().values())


@app.post("/cases", response_model=CaseFile)
def submit_case(case: CaseFile):
    return _guard(lambda: orchestrator.submit(case))


@app.get("/cases")
def list_cases():
    return [{"case_id": c.case_id, "status": c.status, "customer_type": c.customer_type,
             "open_flags": sum(f.status in ("open", "sent_to_client") for f in c.flags),
             "risk": c.risk_draft.level if c.risk_draft else None}
            for c in (store.load(i) for i in store.list_ids())]


@app.get("/cases/{case_id}", response_model=CaseFile)
def get_case(case_id: str):
    return _guard(lambda: store.load(case_id))


@app.post("/cases/{case_id}/process", response_model=CaseFile)
def process_case(case_id: str):
    return _guard(lambda: orchestrator.process(case_id, mode="full"))


@app.post("/cases/{case_id}/documents", response_model=CaseFile)
def upload_document(case_id: str, doc: Document, replaces: str | None = None):
    return _guard(lambda: orchestrator.add_document(case_id, doc, replaces))


@app.get("/cases/{case_id}/client-messages")
def client_messages(case_id: str):
    return _guard(lambda: orchestrator.client_messages(case_id))


@app.get("/cases/{case_id}/audit")
def get_audit(case_id: str):
    return {"entries": audit.entries(case_id), "chain_valid": audit.verify(case_id)}


@app.post("/cases/{case_id}/flags/{flag_id}/dismiss", response_model=CaseFile)
def dismiss_flag(case_id: str, flag_id: str, body: DismissBody, x_analyst: str = Header(...)):
    return _guard(lambda: orchestrator.dismiss_flag(case_id, flag_id, x_analyst, body.note))


@app.post("/cases/{case_id}/decision", response_model=CaseFile)
def decide(case_id: str, body: DecisionBody, x_analyst: str = Header(...)):
    return _guard(lambda: orchestrator.decide(case_id, body.outcome, x_analyst, body.note))
