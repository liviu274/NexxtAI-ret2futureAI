from __future__ import annotations

import json
import os
import re
from pathlib import Path

from .models import SAFE_ID_PATTERN, CaseFile, Playbook

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RUNS_DIR = Path(os.environ.get("NEXXT_RUNS_DIR", Path(__file__).resolve().parents[1] / "runs"))
DEFAULT_PLAYBOOK_DIRS = [
    REPO_ROOT / "conventions",
    REPO_ROOT / "projects" / "playbook-builder" / "fallback",
    REPO_ROOT / "projects" / "playbook-builder" / "output",
    REPO_ROOT / "playbooks",
]


def safe_id(value: str) -> str:
    """An id that is used as a folder or file name; anything that could escape the runs folder is unknown."""
    if not re.fullmatch(SAFE_ID_PATTERN, value or ""):
        raise KeyError(value)
    return value


class ConcurrentUpdate(Exception):
    """The case changed since it was loaded; the change was not saved. Load it again and redo the change."""


class CaseStore:
    """Case files in SQLite (db.py), uploaded files under <root>/<case_id>/docs. A case carries the version it was
    loaded at; saving a case that changed since raises ConcurrentUpdate instead of overwriting the other change."""

    def __init__(self, root: Path = DEFAULT_RUNS_DIR):
        from .db import database_for

        self.root = Path(root)
        self.db = database_for(self.root)
        import_legacy_files(self.root, self.db)

    def files_dir(self, case_id: str) -> Path:
        """Uploaded document files of a case; Document.file is relative to the case folder."""
        return self.root / safe_id(case_id) / "docs"

    def exists(self, case_id: str) -> bool:
        try:
            safe_id(case_id)
        except KeyError:
            return False
        with self.db.read() as conn:
            return conn.execute("SELECT 1 FROM cases WHERE case_id = ?", (case_id,)).fetchone() is not None

    def save(self, case: CaseFile) -> None:
        safe_id(case.case_id)
        with self.db.transaction() as conn:
            row = conn.execute("SELECT version FROM cases WHERE case_id = ?", (case.case_id,)).fetchone()
            if row is not None and case._version is not None and row["version"] != case._version:
                raise ConcurrentUpdate(f"case {case.case_id} changed while it was being processed")
            version = 1 if row is None else row["version"] + 1
            columns = (case.status, case.customer_type, case.playbook_id, case.created_at.isoformat(),
                       case.updated_at.isoformat(), version, case.model_dump_json(), case.case_id)
            if row is None:
                conn.execute("INSERT INTO cases (status, customer_type, playbook_id, created_at, updated_at, version, data,"
                             " case_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", columns)
            else:
                conn.execute("UPDATE cases SET status = ?, customer_type = ?, playbook_id = ?, created_at = ?, updated_at = ?,"
                             " version = ?, data = ? WHERE case_id = ?", columns)
        case._version = version

    def load(self, case_id: str) -> CaseFile:
        safe_id(case_id)
        with self.db.read() as conn:
            row = conn.execute("SELECT data, version FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        if row is None:
            raise KeyError(case_id)
        case = CaseFile.model_validate_json(row["data"])
        case._version = row["version"]
        return case

    def list_ids(self) -> list[str]:
        with self.db.read() as conn:
            return [r["case_id"] for r in conn.execute("SELECT case_id FROM cases ORDER BY case_id")]


def import_legacy_files(root: Path, db) -> None:
    """Cases stored as files by earlier versions (<root>/<case_id>/case.json, audit.jsonl, identity/identity.json) are
    copied into the database once, audit hashes unchanged. The files are left in place."""
    from .db import dumps

    folders = sorted(p.parent for p in Path(root).glob("*/case.json")) if Path(root).exists() else []
    if not folders:
        return
    with db.transaction() as conn:
        for folder in folders:
            case_id = folder.name
            if not re.fullmatch(SAFE_ID_PATTERN, case_id) or conn.execute(
                    "SELECT 1 FROM cases WHERE case_id = ?", (case_id,)).fetchone():
                continue
            case = CaseFile.model_validate_json((folder / "case.json").read_text(encoding="utf-8"))
            conn.execute("INSERT INTO cases (case_id, status, customer_type, playbook_id, created_at, updated_at, version, data)"
                         " VALUES (?, ?, ?, ?, ?, ?, 1, ?)", (case.case_id, case.status, case.customer_type, case.playbook_id,
                                                              case.created_at.isoformat(), case.updated_at.isoformat(), case.model_dump_json()))
            audit = folder / "audit.jsonl"
            entries = [json.loads(line) for line in audit.read_text(encoding="utf-8").splitlines() if line] if audit.exists() else []
            for e in entries:
                conn.execute("INSERT INTO audit (case_id, seq, ts, actor, tool, input, output, duration_ms, error, prev_hash, hash)"
                             " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (case_id, e["seq"], e["ts"], e["actor"], e["tool"],
                             dumps(e["input"]), dumps(e["output"]), dumps(e["duration_ms"]), e["error"], e["prev_hash"], e["hash"]))
            if entries:
                conn.execute("INSERT INTO audit_head (case_id, seq, hash) VALUES (?, ?, ?)", (case_id, entries[-1]["seq"], entries[-1]["hash"]))
            identity = folder / "identity" / "identity.json"
            if identity.exists():
                conn.execute("INSERT INTO identity (case_id, data) VALUES (?, ?)", (case_id, identity.read_text(encoding="utf-8")))


class PlaybookStore:

    def __init__(self, dirs: list[Path] | None = None):
        self.dirs = [Path(d) for d in (dirs if dirs is not None else DEFAULT_PLAYBOOK_DIRS)]

    def all(self) -> dict[str, Playbook]:
        found: dict[str, Playbook] = {}
        for directory in self.dirs:
            for file in sorted(directory.glob("*.json")):
                try:
                    playbook = Playbook.model_validate(json.loads(file.read_text(encoding="utf-8")))
                except Exception:
                    continue
                found[playbook.playbook_id] = playbook
        return found

    def get(self, playbook_id: str) -> Playbook:
        playbooks = self.all()
        if playbook_id not in playbooks:
            raise KeyError(f"unknown playbook: {playbook_id}")
        return playbooks[playbook_id]
