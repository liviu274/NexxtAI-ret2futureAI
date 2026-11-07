"""SQLite storage for case files, the audit log and onboarding records (one file, by default <runs>/nexxt.db).

Uploaded documents, selfies and OCR transcriptions stay as files under <runs>/<case_id>/; the database holds the rest.

- transaction(): one write transaction (BEGIN IMMEDIATE). Nested calls in the same thread join it, so a case change and
  the audit entries it writes commit together or not at all.
- The audit table is append-only in the database itself: triggers refuse UPDATE and DELETE. The hash chain still
  detects an edit made by someone who drops the triggers, and audit_head detects entries cut off the end.
- WAL mode and a busy timeout let several workers on one machine share the file. One machine only: keep the file on a
  local disk, never on a network share; several servers need PostgreSQL.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS cases (
    case_id       TEXT PRIMARY KEY,
    status        TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    playbook_id   TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    version       INTEGER NOT NULL,
    data          TEXT NOT NULL            -- the case file JSON (conventions/CONTRACTS.md)
);
CREATE INDEX IF NOT EXISTS cases_by_status ON cases (status, updated_at);

CREATE TABLE IF NOT EXISTS audit (
    case_id     TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    ts          TEXT NOT NULL,
    actor       TEXT NOT NULL,
    tool        TEXT NOT NULL,
    input       TEXT,
    output      TEXT,
    duration_ms TEXT NOT NULL,             -- JSON text, like input and output: the hash covers the exact value
    error       TEXT,
    prev_hash   TEXT,
    hash        TEXT NOT NULL,
    PRIMARY KEY (case_id, seq)
);
CREATE TABLE IF NOT EXISTS audit_head (
    case_id TEXT PRIMARY KEY,
    seq     INTEGER NOT NULL,
    hash    TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;

CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,      -- lower case
    phone      TEXT NOT NULL UNIQUE,      -- +40 7xx xxx xxx, digits only after +
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sign_in_codes (
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, phone)
);
CREATE TABLE IF NOT EXISTS client_sessions (
    token_hash TEXT PRIMARY KEY,          -- sha256 of the token; the token itself is only in the client's browser
    account_id TEXT NOT NULL REFERENCES accounts (account_id),
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_owner (
    case_id    TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (account_id)
);
CREATE INDEX IF NOT EXISTS case_owner_by_account ON case_owner (account_id);

CREATE TABLE IF NOT EXISTS identity (
    case_id TEXT PRIMARY KEY,
    data    TEXT NOT NULL                  -- consent, selfie metadata, liveness, cached face comparison
);
"""


class Database:
    """One SQLite file, shared by every store that uses the same path (see get())."""

    _open: dict[Path, "Database"] = {}
    _open_lock = threading.Lock()

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    @classmethod
    def get(cls, path: Path) -> "Database":
        key = Path(path).resolve()
        with cls._open_lock:
            if key not in cls._open:
                cls._open[key] = cls(key)
            return cls._open[key]

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """A write transaction; inside one already open in this thread, the same one."""
        current = getattr(self._local, "conn", None)
        if current is not None:
            yield current
            return
        conn = self._connect()
        conn.execute("BEGIN IMMEDIATE")
        self._local.conn = conn
        try:
            yield conn
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        finally:
            self._local.conn = None
            conn.close()

    @contextmanager
    def read(self) -> Iterator[sqlite3.Connection]:
        current = getattr(self._local, "conn", None)
        if current is not None:  # reads inside a transaction see its own writes
            yield current
            return
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()


def database_for(root: Path) -> Database:
    """The database of a runs folder: <root>/nexxt.db, or NEXXT_DB when it is set for the default folder."""
    import os

    from .store import DEFAULT_RUNS_DIR

    configured = os.environ.get("NEXXT_DB")
    if configured and Path(root).resolve() == Path(DEFAULT_RUNS_DIR).resolve():
        return Database.get(Path(configured))
    return Database.get(Path(root) / "nexxt.db")


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)
