from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

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


class AuditLog:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._lock = threading.Lock()

    def path(self, case_id: str) -> Path:
        return self.root / case_id / "audit.jsonl"

    def entries(self, case_id: str) -> list[dict[str, Any]]:
        path = self.path(case_id)
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

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
        with self._lock:
            previous = self.entries(case_id)
            entry = {
                "seq": len(previous) + 1,
                "ts": datetime.now().astimezone().isoformat(timespec="milliseconds"),
                "case_id": case_id,
                "actor": actor,
                "tool": tool,
                "input": jsonable(input),
                "output": jsonable(output),
                "duration_ms": round(duration_ms, 2),
                "error": error,
                "prev_hash": previous[-1]["hash"] if previous else None,
            }
            entry["hash"] = _digest(entry)
            path = self.path(case_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
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
        previous_hash = None
        for entry in self.entries(case_id):
            if entry["prev_hash"] != previous_hash or entry["hash"] != _digest(entry):
                return False
            previous_hash = entry["hash"]
        return True
