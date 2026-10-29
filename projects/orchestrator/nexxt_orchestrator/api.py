from __future__ import annotations

import hashlib
import hmac
import io
import logging
import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader

from .audit import AuditLog
from .checks.registry import compact_cui, load_registry, person_list
from .checks.tamper import document_path
from .gate import UploadRejected, check_format, make_gate
from .ingest import make_ingest
from .models import CaseFile, Document, Outcome
from .orchestrator import CaseExists, NeedsSecondAnalyst, Orchestrator
from .store import DEFAULT_RUNS_DIR, CaseStore, PlaybookStore

log = logging.getLogger("nexxt_orchestrator")

store = CaseStore(DEFAULT_RUNS_DIR)
audit = AuditLog(DEFAULT_RUNS_DIR)
playbooks = PlaybookStore()
orchestrator = Orchestrator(store, audit, playbooks)
OCR_ENABLED = bool(os.environ.get("FEATHERLESS_API_KEY"))
if OCR_ENABLED:
    classify, extract = make_ingest(playbooks, store.root)
    orchestrator.set_ingest(classify=classify, extract=extract, gate=make_gate(playbooks, store.root))
else:
    log.warning("FEATHERLESS_API_KEY is not set: uploads are refused (503) because nothing could read them")


def _analyst_tokens() -> dict[str, str]:
    """NEXXT_ANALYSTS="maria=token1,elena=token2" -> {token: name}. Empty means dev mode (X-Analyst header)."""
    pairs = (item.split("=", 1) for item in os.environ.get("NEXXT_ANALYSTS", "").split(",") if "=" in item)
    return {token.strip(): name.strip() for name, token in pairs if name.strip() and token.strip()}


if not _analyst_tokens():
    log.warning("NEXXT_ANALYSTS is not set: dev mode, any X-Analyst header is trusted as the analyst's name")

DEFAULT_ORIGINS = "http://localhost:8080,http://localhost:5173,http://localhost:3000"
app = FastAPI(title="NexxtAI orchestrator")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("NEXXT_CORS_ORIGINS", DEFAULT_ORIGINS).split(","),
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Analyst"])


def _guard(fn):
    try:
        return fn()
    except KeyError as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except CaseExists as exc:
        raise HTTPException(409, str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:  # the OCR service failed; the document is kept and retried on the next process
        raise HTTPException(502, f"document processing failed: {exc}") from exc


def analyst(authorization: str | None = Header(None), x_analyst: str | None = Header(None)) -> str:
    """The analyst behind a staff call: from a bearer token when NEXXT_ANALYSTS is set, else (dev) from X-Analyst."""
    tokens = _analyst_tokens()
    if not tokens:
        if not x_analyst or not x_analyst.strip():
            raise HTTPException(401, "X-Analyst header required (dev mode)")
        return x_analyst.strip()
    given = (authorization or "").removeprefix("Bearer ").strip()
    for token, name in tokens.items():
        if given and hmac.compare_digest(given, token):
            return name
    raise HTTPException(401, "analyst token required", headers={"WWW-Authenticate": "Bearer"})


def staff(authorization: str | None = Header(None), x_analyst: str | None = Header(None)) -> None:
    """Read access to full case files (flags, screening, risk, audit): analysts only once tokens are configured."""
    if _analyst_tokens():
        analyst(authorization, x_analyst)


def is_staff(authorization: str | None = Header(None), x_analyst: str | None = Header(None)) -> bool:
    """For calls both sides make (upload, process): analysts get the case file back, the client its own view."""
    try:
        staff(authorization, x_analyst)
        return True
    except HTTPException:
        return False


class DecisionBody(BaseModel):
    outcome: Outcome
    note: str | None = None


class DismissBody(BaseModel):
    note: str


@app.get("/me")
def me(name: str = Depends(analyst)):
    return {"analyst": name, "auth": "token" if _analyst_tokens() else "dev-header"}


@app.get("/health")
def health():
    return {"ok": True, "ocr": OCR_ENABLED, "auth": "token" if _analyst_tokens() else "dev-header"}


@app.get("/playbooks")
def list_playbooks():
    return list(playbooks.all().values())


@app.get("/playbooks/{playbook_id}")
def get_playbook(playbook_id: str):
    return _guard(lambda: playbooks.get(playbook_id))


@app.post("/cases", response_model=CaseFile)
def submit_case(case: CaseFile):
    return _guard(lambda: orchestrator.submit(case))


def client_name(case: CaseFile) -> str:
    if case.company and case.company.get("name"):
        return str(case.company["name"])
    applicant = next((p for p in case.persons if p.role == "applicant"), case.persons[0] if case.persons else None)
    return applicant.full_name if applicant else case.case_id


@app.get("/cases", dependencies=[Depends(staff)])
def list_cases():
    return [{"case_id": c.case_id, "status": c.status, "customer_type": c.customer_type, "playbook_id": c.playbook_id,
             "client_name": client_name(c), "created_at": c.created_at, "updated_at": c.updated_at,
             "open_flags": sum(f.status in ("open", "sent_to_client") for f in c.flags),
             "risk": c.risk_draft.level if c.risk_draft else None,
             "processing_ms": round(sum(e["duration_ms"] for e in audit.entries(c.case_id) if e["actor"] == "orchestrator"))}
            for c in (store.load(i) for i in store.list_ids())]


@app.get("/cases/{case_id}", response_model=CaseFile, dependencies=[Depends(staff)])
def get_case(case_id: str):
    return _guard(lambda: store.load(case_id))


@app.post("/cases/{case_id}/process")
def process_case(case_id: str, full: bool = Depends(is_staff)):
    case = _guard(lambda: orchestrator.process(case_id, mode="full"))
    return case if full else client_view(case)


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


def uploads_allowed() -> bool:
    return OCR_ENABLED or os.environ.get("NEXXT_ALLOW_UPLOAD_WITHOUT_OCR") == "1"


@app.post("/cases/{case_id}/documents")
def upload_document(case_id: str, file: UploadFile = File(...), replaces: str | None = None, expected: str | None = None,
                    full: bool = Depends(is_staff)):
    """Client upload: the file is stored, then classify, extract and the intake checks run on it. With `expected` (the
    doc_type of the portal step) it must pass the upload gate first, or it is refused with 422 and not kept."""
    if not uploads_allowed():
        # Without OCR the document would stay "unknown" and the client would be told to upload it again.
        raise HTTPException(503, "Document reading is not configured on the server (FEATHERLESS_API_KEY)")
    case = _guard(lambda: store.load(case_id))
    if case.status == "decided":
        raise HTTPException(403, "case is already decided")
    if replaces and not any(d.doc_id == replaces for d in case.documents):
        raise HTTPException(404, f"not found: {replaces}")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 10 MB")
    mime, ext = sniff(data)
    if expected:
        try:
            check_format(expected, mime)
        except UploadRejected as exc:
            raise HTTPException(415, {"code": exc.code, "message": exc.message}) from exc
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
    def discard() -> None:
        # The doc_id is free again, so its file and cached transcription must not outlive the refusal.
        (files / doc.file.split("/")[-1]).unlink(missing_ok=True)
        (store.root / case_id / "ocr" / f"{doc_id}.json").unlink(missing_ok=True)

    try:
        case = _guard(lambda: orchestrator.add_document(case_id, doc, replaces, expected))
    except UploadRejected as exc:
        discard()
        raise HTTPException(422, {"code": exc.code, "message": exc.message}) from exc
    except HTTPException:
        if expected:  # the gate reads the file first: a failed reading leaves nothing behind, the client uploads again
            discard()
        raise
    return case if full else client_view(case)


@app.post("/cases/{case_id}/documents/extracted", response_model=CaseFile)
def add_extracted_document(case_id: str, doc: Document, replaces: str | None = None):
    """An already classified and extracted document (test fixtures, or an external extractor). Off unless
    NEXXT_FIXTURE_API=1: otherwise a client could hand in its own field values and skip the reading."""
    if os.environ.get("NEXXT_FIXTURE_API") != "1":
        raise HTTPException(404, "Not Found")
    return _guard(lambda: orchestrator.add_document(case_id, doc, replaces))


def _document(case_id: str, doc_id: str) -> tuple[Document, Path]:
    case = _guard(lambda: store.load(case_id))
    doc = next((d for d in case.documents if d.doc_id == doc_id), None)
    if doc is None:
        raise HTTPException(404, f"not found: {doc_id}")
    folder = (store.root / case_id).resolve()
    try:
        path = document_path(case_id, doc, store.root).resolve()
    except FileNotFoundError as exc:
        raise HTTPException(404, "file not stored") from exc
    if folder not in path.parents:  # only ever serve files stored inside this case's folder
        raise HTTPException(404, "file not stored")
    return doc, path


@app.get("/cases/{case_id}/documents/{doc_id}/file", dependencies=[Depends(staff)])
def document_file(case_id: str, doc_id: str):
    doc, path = _document(case_id, doc_id)
    return FileResponse(path, media_type=doc.mime_type)


@app.get("/cases/{case_id}/documents/{doc_id}/pages/{page}.png", dependencies=[Depends(staff)])
def document_page(case_id: str, doc_id: str, page: int):
    """One page as PNG (1-based), so the review screen can draw evidence boxes over it."""
    doc, path = _document(case_id, doc_id)
    if not 1 <= page <= doc.pages:
        raise HTTPException(404, f"page {page} not found")
    import pymupdf  # renders PDFs and also opens PNG and JPEG photos

    with pymupdf.open(path) as pdf:
        pix = pdf[page - 1].get_pixmap(dpi=110)
        return Response(pix.tobytes("png"), media_type="image/png")


def client_view(case: CaseFile) -> dict:
    """What the client may see: progress, the bank's requests and the outcome. Never flags' internals, tamper,
    screening or risk; only the messages written for the client, and which of their documents each one is about."""
    requests = [{"message": f.fix_message, "doc_ids": sorted({e.doc_id for e in f.evidence})}
                for f in case.flags if f.client_fixable and f.fix_message and f.status == "sent_to_client"]
    return {"case_id": case.case_id, "customer_type": case.customer_type, "playbook_id": case.playbook_id,
            "status": case.status, "created_at": case.created_at, "updated_at": case.updated_at,
            "decision": case.decision.outcome if case.decision else None,
            "decided_at": case.decision.decided_at if case.decision else None,
            "request_note": case.decision.note if case.decision and case.decision.outcome == "documents_requested" else None,
            "client_messages": [r["message"] for r in requests], "requests": requests,
            "persons": [p.model_dump() for p in case.persons],
            "documents": [{"doc_id": d.doc_id, "doc_type": d.doc_type, "owner_person_id": d.owner_person_id,
                           "mime_type": d.mime_type, "pages": d.pages, "file": d.file, "uploaded_at": d.uploaded_at}
                          for d in case.documents]}


@app.get("/cases/{case_id}/client-status")
def client_status(case_id: str):
    return client_view(_guard(lambda: store.load(case_id)))


@app.get("/cases/{case_id}/client-messages")
def client_messages(case_id: str):
    return _guard(lambda: orchestrator.client_messages(case_id))


@app.get("/cases/{case_id}/ownership", dependencies=[Depends(staff)])
def ownership(case_id: str):
    """UBOs in the ONRC registry next to the UBOs in the client's declaration (PJ)."""
    case = _guard(lambda: store.load(case_id))

    def rows(people: list[dict] | None) -> list[dict]:
        out = []
        for p in people or []:
            name = str(p.get("full_name") or "")
            known = next((x for x in case.persons if x.full_name.lower() == name.lower()), None)
            out.append({"id": known.person_id if known else re.sub(r"\W+", "_", name.lower()).strip("_"),
                        "name": name, "pct": p.get("ownership_pct")})
        return out

    declaration = next((d for d in case.documents if d.doc_type == "ubo_declaration"), None)
    declared = person_list(declaration.fields.get("ubos")) if declaration else None
    cui = compact_cui((case.company or {}).get("cui"))
    if not cui:
        certificate = next((d for d in case.documents if d.doc_type == "certificat_constatator"), None)
        field = certificate.fields.get("cui") if certificate else None
        cui = compact_cui(field.value) if field else ""
    company = load_registry().get(cui) if cui else None
    return {"cui": cui or None, "registry_found": company is not None,
            "registry": rows(company.get("ubos") if company else None), "declared": rows(declared)}


@app.get("/cases/{case_id}/audit", dependencies=[Depends(staff)])
def get_audit(case_id: str):
    if not store.exists(case_id):
        raise HTTPException(404, f"not found: {case_id}")
    return {"entries": audit.entries(case_id), "chain_valid": audit.verify(case_id)}


@app.get("/cases/{case_id}/flags/{flag_id}/screening", dependencies=[Depends(staff)])
def screening_match(case_id: str, flag_id: str):
    match = _guard(lambda: orchestrator.screening_match(case_id, flag_id))
    if match is None:
        raise HTTPException(404, "no list entry behind this flag (the screening could not run)")
    return match


class ConfirmBody(BaseModel):
    note: str = ""


@app.post("/cases/{case_id}/flags/{flag_id}/confirm", response_model=CaseFile)
def confirm_match(case_id: str, flag_id: str, body: ConfirmBody, name: str = Depends(analyst)):
    return _guard(lambda: orchestrator.confirm_flag(case_id, flag_id, name, body.note))


@app.post("/cases/{case_id}/flags/{flag_id}/dismiss", response_model=CaseFile)
def dismiss_flag(case_id: str, flag_id: str, body: DismissBody, name: str = Depends(analyst)):
    try:
        return _guard(lambda: orchestrator.dismiss_flag(case_id, flag_id, name, body.note))
    except NeedsSecondAnalyst as exc:
        return JSONResponse(status_code=202, content={"detail": str(exc), "pending": True})


@app.post("/cases/{case_id}/decision", response_model=CaseFile)
def decide(case_id: str, body: DecisionBody, name: str = Depends(analyst)):
    return _guard(lambda: orchestrator.decide(case_id, body.outcome, name, body.note))
