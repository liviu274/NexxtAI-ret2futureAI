from __future__ import annotations

import hashlib
import json
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

from .store import safe_id

T = TypeVar("T")


def jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    return value


def _digest(entry: dict[str, Any]) -> str:
    body = {k: v for k, v in entry.items() if k != "hash"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


COLUMNS = ("seq", "ts", "case_id", "actor", "tool", "input", "output", "duration_ms", "error", "prev_hash", "hash")
JSON_COLUMNS = ("input", "output", "duration_ms")  # stored as JSON text, read back exactly as hashed


class AuditLog:
    """Append-only, hash-chained log per case, in SQLite (db.py): triggers refuse UPDATE and DELETE on the table, the
    chain detects an edited entry, and audit_head (count and last hash) detects entries cut off the end."""

    def __init__(self, root: Path):
        from .db import database_for

        self.root = Path(root)
        self.db = database_for(self.root)

    def entries(self, case_id: str) -> list[dict[str, Any]]:
        safe_id(case_id)
        with self.db.read() as conn:
            rows = conn.execute(f"SELECT {', '.join(COLUMNS)} FROM audit WHERE case_id = ? ORDER BY seq", (case_id,)).fetchall()
        return [{**dict(r), **{c: json.loads(r[c]) for c in JSON_COLUMNS}} for r in rows]

    def record(
        self,
        case_id: str,
        actor: str,
        tool: str,
        input: Any,
        output: Any,
        duration_ms: float,
        error: str | None = None,
    ) -> dict[str, Any]:
        from .db import dumps

        safe_id(case_id)
        with self.db.transaction() as conn:  # joins the caller's transaction: the entry commits with the change it records
            head = conn.execute("SELECT seq, hash FROM audit_head WHERE case_id = ?", (case_id,)).fetchone()
            entry = {
                "seq": head["seq"] + 1 if head else 1,
                "ts": datetime.now().astimezone().isoformat(timespec="milliseconds"),
                "case_id": case_id,
                "actor": actor,
                "tool": tool,
                "input": jsonable(input),
                "output": jsonable(output),
                "duration_ms": round(duration_ms, 2),
                "error": error,
                "prev_hash": head["hash"] if head else None,
            }
            entry = {**entry, **{c: json.loads(dumps(entry[c])) for c in JSON_COLUMNS}}
            entry["hash"] = _digest(entry)
            conn.execute(f"INSERT INTO audit ({', '.join(COLUMNS)}) VALUES ({', '.join('?' * len(COLUMNS))})",
                         tuple(dumps(entry[c]) if c in JSON_COLUMNS else entry[c] for c in COLUMNS))
            conn.execute("INSERT INTO audit_head (case_id, seq, hash) VALUES (?, ?, ?) ON CONFLICT (case_id) DO UPDATE"
                         " SET seq = excluded.seq, hash = excluded.hash", (case_id, entry["seq"], entry["hash"]))
        return entry

    def call(self, case_id: str, actor: str, tool: str, input: Any, fn: Callable[[], T]) -> T:
        started = time.perf_counter()
        try:
            result = fn()
        except Exception as exc:
            self.record(case_id, actor, tool, input, None, (time.perf_counter() - started) * 1000, f"{type(exc).__name__}: {exc}")
            raise
        self.record(case_id, actor, tool, input, result, (time.perf_counter() - started) * 1000)
        return result

    def verify(self, case_id: str) -> bool:
        entries = self.entries(case_id)
        previous_hash = None
        for seq, entry in enumerate(entries, start=1):
            if entry["seq"] != seq or entry["prev_hash"] != previous_hash or entry["hash"] != _digest(entry):
                return False
            previous_hash = entry["hash"]
        with self.db.read() as conn:
            head = conn.execute("SELECT seq, hash FROM audit_head WHERE case_id = ?", (case_id,)).fetchone()
        if head is None:
            return not entries
        return (head["seq"], head["hash"]) == (len(entries), previous_hash)
