from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from .models import CaseFile, Playbook

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RUNS_DIR = Path(os.environ.get("NEXXT_RUNS_DIR", Path(__file__).resolve().parents[1] / "runs"))
DEFAULT_PLAYBOOK_DIRS = [
    REPO_ROOT / "conventions",
    REPO_ROOT / "projects" / "playbook-builder" / "fallback",
    REPO_ROOT / "projects" / "playbook-builder" / "output",
    REPO_ROOT / "playbooks",
]


class CaseStore:
    def __init__(self, root: Path = DEFAULT_RUNS_DIR):
        self.root = Path(root)
        self._lock = threading.Lock()

    def _path(self, case_id: str) -> Path:
        return self.root / case_id / "case.json"

    def files_dir(self, case_id: str) -> Path:
        """Uploaded document files of a case; Document.file is relative to the case folder."""
        return self.root / case_id / "docs"

    def save(self, case: CaseFile) -> None:
        with self._lock:
            path = self._path(case.case_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(case.model_dump_json(indent=2), encoding="utf-8")

    def load(self, case_id: str) -> CaseFile:
        path = self._path(case_id)
        if not path.exists():
            raise KeyError(case_id)
        return CaseFile.model_validate_json(path.read_text(encoding="utf-8"))

    def list_ids(self) -> list[str]:
        if not self.root.exists():
            return []
        return sorted(p.parent.name for p in self.root.glob("*/case.json"))


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
