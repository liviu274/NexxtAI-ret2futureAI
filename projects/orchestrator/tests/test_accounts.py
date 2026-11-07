"""One account per e-mail and per phone; a case opened from an account belongs to it and only it (and analysts) reach it."""
import json
import os
import tempfile

os.environ.setdefault("NEXXT_RUNS_DIR", tempfile.mkdtemp(prefix="nexxt_api_"))

import pytest
from fastapi.testclient import TestClient

from nexxt_orchestrator.accounts import AccountError, AccountStore, normalize_phone
from nexxt_orchestrator.api import app
from nexxt_orchestrator.db import Database
from nexxt_orchestrator.store import REPO_ROOT

PF0 = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ" / "PF" / "data" / "gigel" / "cases" / "case_pf_00_corect_control"
client = TestClient(app)


@pytest.fixture
def store(tmp_path):
    return AccountStore(Database(tmp_path / "accounts.db"))


def sign_in(store, email, phone):
    code = store.start(email, phone)["demo_code"]
    return store.verify(email, phone, code)


def test_the_same_phone_written_differently_is_the_same_phone():
    assert normalize_phone("0722 123 456") == normalize_phone("+40722123456") == normalize_phone("40-722-123-456") == "+40722123456"
    with pytest.raises(AccountError):
        normalize_phone("0212 123 456")  # a landline


def test_one_account_per_email_and_per_phone(store):
    account, _ = sign_in(store, "Ana@Exemplu.ro", "0722 123 456")
    with pytest.raises(AccountError) as exc:
        store.start("ana@exemplu.ro", "0733 000 111")  # same e-mail, another phone
    assert exc.value.code == "email_taken"
    with pytest.raises(AccountError) as exc:
        store.start("alt@exemplu.ro", "+40722123456")  # same phone, another e-mail
    assert exc.value.code == "phone_taken"
    again, _ = sign_in(store, "ANA@exemplu.ro ", "+40 722 123 456")  # both of the same account: signs in
    assert again.account_id == account.account_id


def test_the_database_itself_refuses_a_duplicate(store):
    sign_in(store, "ana@exemplu.ro", "0722123456")
    import sqlite3
    with store.db.transaction() as conn, pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO accounts (account_id, email, phone, created_at) VALUES ('x', 'ana@exemplu.ro', '+40799999999', 'now')")


def test_the_code_is_checked_and_attempts_are_limited(store):
    store.start("ana@exemplu.ro", "0722123456")
    for left in (4, 3, 2, 1):
        with pytest.raises(AccountError, match=f"Mai ai {left}"):
            store.verify("ana@exemplu.ro", "0722123456", "000000" if left % 2 else "999999")
    with pytest.raises(AccountError, match="Cere un cod nou"):
        store.verify("ana@exemplu.ro", "0722123456", "123123")
    with pytest.raises(AccountError) as exc:  # five wrong codes: even the right one no longer works
        store.verify("ana@exemplu.ro", "0722123456", "111111")
    assert exc.value.code == "code_expired"


def test_codes_are_only_returned_in_demo_mode(store, monkeypatch):
    monkeypatch.setenv("NEXXT_DEMO_CODES", "0")
    assert "demo_code" not in store.start("ana@exemplu.ro", "0722123456")


# --- over HTTP ------------------------------------------------------------------------------------------------------

def http_sign_in(email, phone) -> str:
    started = client.post("/auth/start", json={"email": email, "phone": phone}).json()
    return client.post("/auth/verify", json={"email": email, "phone": phone, "code": started["demo_code"]}).json()["token"]


def open_case(token, case_id):
    case = json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8"))
    case.update(case_id=case_id, documents=[], flags=[], risk_draft=None, decision=None)
    return client.post("/cases", json=case, headers={"X-Client-Token": token})


def test_a_second_account_with_a_used_email_or_phone_is_refused_over_http():
    http_sign_in("dan@exemplu.ro", "0744 555 666")
    res = client.post("/auth/start", json={"email": "dan@exemplu.ro", "phone": "0744 555 667"})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "email_taken"
    res = client.post("/auth/start", json={"email": "altcineva@exemplu.ro", "phone": "+40744555666"})
    assert res.status_code == 409 and "telefon" in res.json()["detail"]["message"]


def test_my_cases_are_only_mine():
    mine, theirs = http_sign_in("ioana@exemplu.ro", "0755 111 222"), http_sign_in("radu@exemplu.ro", "0755 333 444")
    assert open_case(mine, "case_owned_ioana").status_code == 200
    assert open_case(theirs, "case_owned_radu").status_code == 200
    assert [c["case_id"] for c in client.get("/client/cases", headers={"X-Client-Token": mine}).json()] == ["case_owned_ioana"]
    # Another account, or nobody, cannot see or touch the case: it does not exist for them.
    for headers in ({"X-Client-Token": theirs}, {}):
        assert client.get("/cases/case_owned_ioana/client-status", headers=headers).status_code == 404
        assert client.post("/cases/case_owned_ioana/consent", json={"items": ["kyc", "biometric", "screening"]}, headers=headers).status_code == 404
        assert client.post("/cases/case_owned_ioana/process", headers=headers).status_code == 404
    assert client.get("/cases/case_owned_ioana/client-status", headers={"X-Client-Token": mine}).status_code == 200
    assert client.get("/cases/case_owned_ioana/client-status", headers={"X-Analyst": "maria"}).status_code == 200  # analysts still can


def test_signing_out_ends_the_session():
    token = http_sign_in("mihai@exemplu.ro", "0766 777 888")
    assert client.get("/client/cases", headers={"X-Client-Token": token}).status_code == 200
    client.post("/auth/sign-out", headers={"X-Client-Token": token})
    res = client.get("/client/cases", headers={"X-Client-Token": token})
    assert res.status_code == 401 and res.json()["detail"]["code"] == "session_expired"
