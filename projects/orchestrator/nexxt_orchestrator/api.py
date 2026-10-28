from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader

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


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SIGNATURES = [(b"%PDF-", "application/pdf", ".pdf"), (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
              (b"\xff\xd8\xff", "image/jpeg", ".jpg")]


def sniff(data: bytes) -> tuple[str, str]:
    """MIME type and extension from the file's own bytes; the client's filename and Content-Type are not trusted."""
    for magic, mime, ext in SIGNATURES:
        if data.startswith(magic):
            return mime, ext
    raise HTTPException(415, "Upload a PDF, PNG or JPEG file")


def count_pages(data: bytes, mime: str) -> int:
    if mime != "application/pdf":
        return 1
    try:
        return len(PdfReader(io.BytesIO(data)).pages)
    except Exception as exc:
        raise HTTPException(422, "The PDF could not be read") from exc


def next_doc_id(case: CaseFile, files: Path) -> str:
    """doc_NNN never reused, also after a replaced document left the case."""
    taken = [d.doc_id for d in case.documents] + [p.stem for p in files.glob("doc_*")]
    numbers = [int(m.group(1)) for m in (re.fullmatch(r"doc_(\d+)", t) for t in taken) if m]
    return f"doc_{max(numbers, default=0) + 1:03d}"


@app.post("/cases/{case_id}/documents", response_model=CaseFile)
def upload_document(case_id: str, file: UploadFile = File(...), replaces: str | None = None):
    """Client upload: the file is stored, then classify, extract and the intake checks run on it."""
    case = _guard(lambda: store.load(case_id))
    if case.status == "decided":
        raise HTTPException(403, "case is already decided")
    if replaces and not any(d.doc_id == replaces for d in case.documents):
        raise HTTPException(404, f"not found: {replaces}")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 10 MB")
    mime, ext = sniff(data)
    pages = count_pages(data, mime)

    files = store.files_dir(case_id)
    files.mkdir(parents=True, exist_ok=True)
    doc_id = next_doc_id(case, files)
    (files / f"{doc_id}{ext}").write_bytes(data)
    audit.record(case_id, "client", "receive_file",
                 {"doc_id": doc_id, "filename": file.filename, "bytes": len(data)},
                 {"mime_type": mime, "pages": pages, "sha256": hashlib.sha256(data).hexdigest()}, 0)
    doc = Document(doc_id=doc_id, file=f"docs/{doc_id}{ext}", mime_type=mime, pages=pages,
                   uploaded_at=datetime.now().astimezone())
    return _guard(lambda: orchestrator.add_document(case_id, doc, replaces))


@app.post("/cases/{case_id}/documents/extracted", response_model=CaseFile)
def add_extracted_document(case_id: str, doc: Document, replaces: str | None = None):
    """An already classified and extracted document (test fixtures, or an external extractor)."""
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
