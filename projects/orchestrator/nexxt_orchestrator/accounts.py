"""Client accounts: one account per e-mail and per phone number, signed in with a one-time code, owning its cases.

- An e-mail or a phone number belongs to at most one account (UNIQUE in the database). Signing up and signing in are
  the same step: a new e-mail and phone create the account, the e-mail and phone of one account sign into it, and an
  e-mail or a phone already used by another account is refused.
- The code is generated here (6 digits, valid CODE_MINUTES, MAX_ATTEMPTS tries) and stored hashed. There is no SMS
  provider yet: with NEXXT_DEMO_CODES=1 (default) the code is returned to the portal, which shows it; set it to 0 once
  send_code() delivers it.
- A session token (random, 30 days) is returned once; only its SHA-256 is stored.
- A case created by a signed-in client belongs to that account; only that account (or an analyst) reaches it.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

CODE_MINUTES = 10
MAX_ATTEMPTS = 5
SESSION_DAYS = 30


class AccountError(Exception):
    """`code` for the screens, `message` for the client (Romanian)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


@dataclass
class Account:
    account_id: str
    email: str
    phone: str
    created_at: str


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", email):
        raise AccountError("invalid_email", "Adresa de e-mail nu este validă.")
    return email


def normalize_phone(value: str) -> str:
    """A Romanian mobile number in one form, so 0722 123 456 and +40722123456 are the same phone."""
    digits = re.sub(r"[\s.()-]", "", value or "")
    match = re.fullmatch(r"(?:\+?40|0)(7\d{8})", digits)
    if not match:
        raise AccountError("invalid_phone", "Introdu un număr de mobil românesc, de exemplu 0722 123 456.")
    return "+40" + match.group(1)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now().astimezone()


def demo_codes() -> bool:
    return os.environ.get("NEXXT_DEMO_CODES", "1") == "1"


def send_code(phone: str, code: str) -> None:
    """Where an SMS provider plugs in. Until then the code reaches the client only in demo mode."""


class AccountStore:
    def __init__(self, db):
        self.db = db

    def _by(self, conn, column: str, value: str) -> Account | None:
        row = conn.execute(f"SELECT account_id, email, phone, created_at FROM accounts WHERE {column} = ?", (value,)).fetchone()
        return Account(**dict(row)) if row else None

    def _resolve(self, conn, email: str, phone: str) -> Account | None:
        """The account these two belong to, None for a new pair; refused when either belongs to another account."""
        by_email, by_phone = self._by(conn, "email", email), self._by(conn, "phone", phone)
        if by_email and (not by_phone or by_phone.account_id != by_email.account_id):
            raise AccountError("email_taken", "Acest e-mail este folosit de alt cont. Intră cu telefonul acelui cont sau folosește alt e-mail.")
        if by_phone and not by_email:
            raise AccountError("phone_taken", "Acest număr de telefon este folosit de alt cont. Intră cu e-mailul acelui cont sau folosește alt număr.")
        return by_email

    def start(self, email: str, phone: str) -> dict:
        """Check the pair, then issue a code. Returns whether the account is new, and the code in demo mode."""
        email, phone = normalize_email(email), normalize_phone(phone)
        code = f"{secrets.randbelow(10**6):06d}"
        with self.db.transaction() as conn:
            existing = self._resolve(conn, email, phone)
            conn.execute("INSERT INTO sign_in_codes (email, phone, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)"
                         " ON CONFLICT (email, phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,"
                         " attempts = 0", (email, phone, _hash(code), (_now() + timedelta(minutes=CODE_MINUTES)).isoformat()))
        send_code(phone, code)
        return {"account": "existing" if existing else "new", "sent_to": phone[:3] + "•" * (len(phone) - 6) + phone[-3:],
                **({"demo_code": code} if demo_codes() else {})}

    def verify(self, email: str, phone: str, code: str) -> tuple[Account, str]:
        """The code for this pair: creates the account on first sign-in, returns it and a new session token."""
        email, phone = normalize_email(email), normalize_phone(phone)
        with self.db.transaction() as conn:
            result = self._verify(conn, email, phone, code)
        if isinstance(result, AccountError):
            raise result  # after the commit: the failed attempt must count
        return result

    def _verify(self, conn, email: str, phone: str, code: str) -> tuple[Account, str] | AccountError:
        row = conn.execute("SELECT code_hash, expires_at, attempts FROM sign_in_codes WHERE email = ? AND phone = ?",
                           (email, phone)).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) < _now() or row["attempts"] >= MAX_ATTEMPTS:
            raise AccountError("code_expired", "Codul a expirat. Cere un cod nou.")
        if not hmac.compare_digest(row["code_hash"], _hash((code or "").strip())):
            conn.execute("UPDATE sign_in_codes SET attempts = attempts + 1 WHERE email = ? AND phone = ?", (email, phone))
            left = MAX_ATTEMPTS - row["attempts"] - 1
            return AccountError("wrong_code", f"Codul nu este corect. Mai ai {left} încercări." if left else "Codul nu este corect. Cere un cod nou.")
        account = self._resolve(conn, email, phone)  # again: another account may have taken one of them meanwhile
        if account is None:
            account = Account(f"acc_{uuid.uuid4().hex[:12]}", email, phone, _now().isoformat(timespec="seconds"))
            try:
                conn.execute("INSERT INTO accounts (account_id, email, phone, created_at) VALUES (?, ?, ?, ?)",
                             (account.account_id, email, phone, account.created_at))
            except sqlite3.IntegrityError as exc:  # the UNIQUE constraints are the last word
                raise AccountError("email_taken", "Acest e-mail sau telefon este folosit de alt cont.") from exc
        conn.execute("DELETE FROM sign_in_codes WHERE email = ? AND phone = ?", (email, phone))
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO client_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)",
                     (_hash(token), account.account_id, (_now() + timedelta(days=SESSION_DAYS)).isoformat()))
        return account, token

    def account_for(self, token: str | None) -> Account | None:
        if not token:
            return None
        with self.db.read() as conn:
            row = conn.execute("SELECT a.account_id, a.email, a.phone, a.created_at, s.expires_at FROM client_sessions s"
                               " JOIN accounts a ON a.account_id = s.account_id WHERE s.token_hash = ?", (_hash(token),)).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) < _now():
            return None
        return Account(row["account_id"], row["email"], row["phone"], row["created_at"])

    def sign_out(self, token: str) -> None:
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM client_sessions WHERE token_hash = ?", (_hash(token),))

    def own(self, case_id: str, account_id: str) -> None:
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO case_owner (case_id, account_id) VALUES (?, ?)", (case_id, account_id))

    def owner_of(self, case_id: str) -> str | None:
        with self.db.read() as conn:
            row = conn.execute("SELECT account_id FROM case_owner WHERE case_id = ?", (case_id,)).fetchone()
        return row["account_id"] if row else None

    def cases_of(self, account_id: str) -> list[str]:
        with self.db.read() as conn:
            return [r["case_id"] for r in conn.execute("SELECT case_id FROM case_owner WHERE account_id = ? ORDER BY case_id", (account_id,))]

