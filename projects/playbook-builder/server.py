"""HTTP API for the playbook builder (used by Person 6's review screen).

Run:
    uvicorn server:app --port 8002

Endpoints:
    POST /playbooks/build          multipart form: file=<procedure.pdf>, playbook_id=<optional>
                                   -> {"playbook": {...}, "report": {...}}
    GET  /playbooks                -> [{"playbook_id", "process_name", "customer_type", "rules", "source"}]
    GET  /playbooks/{playbook_id}          -> playbook
    GET  /playbooks/{playbook_id}/report   -> review-screen report
    GET  /health
"""
import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from builder import BuildError, build
from report import build_report

HERE = Path(__file__).parent
OUT = HERE / "output"
UPLOADS = OUT / "uploads"
MAX_BYTES = 10 * 1024 * 1024

app = FastAPI(title="Playbook builder")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/playbooks/build")
def build_playbook(file: UploadFile = File(...), playbook_id: str | None = Form(None)):
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Procedure PDF is larger than 10 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "Upload a PDF procedure")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    pdf = UPLOADS / Path(file.filename or "procedure.pdf").name
    pdf.write_bytes(data)
    try:
        playbook, meta = build(pdf, playbook_id=playbook_id or None)
    except BuildError as e:
        raise HTTPException(422, str(e))
    report = build_report(playbook, meta)
    pid = playbook["playbook_id"]
    (OUT / f"{pid}.json").write_text(json.dumps(playbook, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / f"{pid}.report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"playbook": playbook, "report": report}


def _read(path):
    if not path.exists():
        raise HTTPException(404, "Playbook not found")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/playbooks")
def list_playbooks():
    items = []
    for p in sorted(OUT.glob("*.json")):
        if p.name.endswith(".report.json") or p.name.startswith("clauses_"):
            continue
        pb = json.loads(p.read_text(encoding="utf-8"))
        rep = OUT / f"{pb['playbook_id']}.report.json"
        source = json.loads(rep.read_text(encoding="utf-8"))["generated_by"]["source"] if rep.exists() else None
        items.append({"playbook_id": pb["playbook_id"], "process_name": pb["process_name"],
                      "customer_type": pb["customer_type"], "rules": len(pb["rules"]), "source": source})
    return items


@app.get("/playbooks/{playbook_id}")
def get_playbook(playbook_id: str):
    return _read(OUT / f"{Path(playbook_id).name}.json")


@app.get("/playbooks/{playbook_id}/report")
def get_report(playbook_id: str):
    return _read(OUT / f"{Path(playbook_id).name}.report.json")
