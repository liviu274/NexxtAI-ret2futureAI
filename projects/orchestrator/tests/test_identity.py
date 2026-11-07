"""Consent and the verification selfie stored with the case, and the selfie compared with the ID photo (R-PF-019).

The face tests use the fake ID photos in data/id_photos (gitignored, so they skip on a fresh clone) and download the
two OpenCV models on first use. A "selfie" here is another shot of the card's face: cropped, rescaled, darker, blurred.
"""
import base64
import json
import os
import tempfile
from datetime import date

os.environ.setdefault("NEXXT_RUNS_DIR", tempfile.mkdtemp(prefix="nexxt_api_"))

import pytest
from fastapi.testclient import TestClient

from nexxt_orchestrator.api import app
from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.identity import IdentityStore, decode_image
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

PF0 = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ" / "PF" / "data" / "gigel" / "cases" / "case_pf_00_corect_control"
PHOTOS = REPO_ROOT / "data" / "id_photos"
needs_photos = pytest.mark.skipif(not (PHOTOS / "putin.png").exists(), reason="data/id_photos is not present")
client = TestClient(app)


def data_url(raw: bytes, kind="jpeg") -> str:
    return f"data:image/{kind};base64," + base64.b64encode(raw).decode()


def selfie_of(card: str) -> bytes:
    """Another shot of the face on a card: cropped to the face area, rescaled, darker and blurred, as a JPEG."""
    import cv2

    img = cv2.imread(str(PHOTOS / card))
    h, w = img.shape[:2]
    shot = cv2.GaussianBlur(cv2.convertScaleAbs(cv2.resize(img[int(h * .05):int(h * .95), int(w * .03):int(w * .9)], None, fx=1.6, fy=1.6), alpha=.8, beta=-15), (5, 5), 0)
    return cv2.imencode(".jpg", shot)[1].tobytes()


def new_case(case_id: str) -> None:
    case = json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8"))
    case.update(case_id=case_id, flags=[], risk_draft=None, decision=None)
    assert client.post("/cases", json=case).status_code == 200


# --- consent and storage --------------------------------------------------------------------------------------------

def test_consent_needs_the_required_items(tmp_path):
    store = IdentityStore(tmp_path)
    with pytest.raises(ValueError, match="biometric"):
        store.save_consent("case_x", ["kyc", "screening"])
    with pytest.raises(ValueError, match="unknown"):
        store.save_consent("case_x", ["kyc", "biometric", "screening", "sell_my_data"])
    assert store.save_consent("case_x", ["screening", "kyc", "biometric", "marketing"])["items"] == ["biometric", "kyc", "marketing", "screening"]


@pytest.mark.parametrize("bad", ["", "data:image/gif;base64,R0lGOD", "data:image/jpeg;base64," + base64.b64encode(b"not an image").decode()])
def test_only_jpeg_or_png_selfies(bad):
    with pytest.raises(ValueError):
        decode_image(bad)


def test_consent_over_http_is_audited_and_visible_to_the_portal():
    new_case("case_consent")
    assert client.post("/cases/case_consent/consent", json={"items": ["kyc"]}).status_code == 422
    assert client.post("/cases/case_consent/consent", json={"items": ["kyc", "biometric", "screening"]}).status_code == 200
    assert client.get("/cases/case_consent/client-status").json()["onboarding"] == {"consent": True, "identity": False}
    tools = [e["tool"] for e in client.get("/cases/case_consent/audit", headers={"X-Analyst": "maria"}).json()["entries"]]
    assert "consent" in tools


# --- the face ---------------------------------------------------------------------------------------------------------

@needs_photos
def test_a_selfie_without_a_face_or_with_two_is_refused_on_the_spot():
    import cv2
    import numpy as np

    new_case("case_selfie_refused")
    blank = cv2.imencode(".jpg", np.full((480, 640, 3), 200, np.uint8))[1].tobytes()
    res = client.post("/cases/case_selfie_refused/identity", json={"selfie": data_url(blank)})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "no_face"
    two = cv2.imencode(".jpg", np.hstack([cv2.imread(str(PHOTOS / "putin.png"))[:640, :900], cv2.imread(str(PHOTOS / "brad_pitt.png"))[:640, :900]]))[1].tobytes()
    res = client.post("/cases/case_selfie_refused/identity", json={"selfie": data_url(two)})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "several_faces"


def run_with_card(tmp_path, monkeypatch, card: str, selfie: bytes):
    """The clean PF case whose identity document is the photo of `card`, with a selfie saved; full pipeline."""
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF0))
    case = CaseFile.model_validate(json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    id_doc = next(d for d in case.documents if d.doc_type == "id_card")
    id_doc.file, id_doc.mime_type = str(PHOTOS / card), "image/png"
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore(), today=lambda: date(2026, 10, 28))
    orch.submit(case)
    IdentityStore(tmp_path).save_selfie(case.case_id, selfie, {"blink": True, "turn": True, "method": "mediapipe"}, None)
    return orch, orch.process(case.case_id)


@needs_photos
def test_the_same_person_passes(tmp_path, monkeypatch):
    orch, done = run_with_card(tmp_path, monkeypatch, "putin.png", selfie_of("putin.png"))
    assert not [f for f in done.flags if f.rule_id == "R-PF-019"]
    face = IdentityStore(tmp_path).load(done.case_id)["face"]
    assert face["status"] == "match" and face["score"] > 0.8


@needs_photos
def test_someone_else_s_face_blocks_the_approval(tmp_path, monkeypatch):
    orch, done = run_with_card(tmp_path, monkeypatch, "putin.png", selfie_of("brad_pitt.png"))
    flag = next(f for f in done.flags if f.rule_id == "R-PF-019")
    assert (flag.severity, flag.client_fixable, flag.fix_message) == ("high", False, None)
    assert "below the 0.363 threshold" in flag.explanation
    with pytest.raises(PermissionError):
        orch.decide(done.case_id, "approved", "maria")


@needs_photos
def test_an_id_without_a_portrait_cannot_be_compared_and_the_analyst_must_look(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF0))
    case = CaseFile.model_validate(json.loads((PF0 / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore(), today=lambda: date(2026, 10, 28))
    orch.submit(case)  # the dataset's specimen identity sheet has no photo
    IdentityStore(tmp_path).save_selfie(case.case_id, selfie_of("putin.png"), {"method": "none"}, "camera unavailable")
    done = orch.process(case.case_id)
    flag = next(f for f in done.flags if f.rule_id == "R-PF-019")
    assert flag.severity == "medium" and "could not run" in flag.title and "no portrait" in flag.explanation


@needs_photos
def test_the_analyst_sees_the_selfie_and_the_comparison_never_the_client(monkeypatch):
    new_case("case_identity_http")
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(PF0))
    assert client.post("/cases/case_identity_http/identity", json={"selfie": data_url(selfie_of("putin.png")),
                       "liveness": {"blink": True, "turn": True, "method": "mediapipe"}}).json()["ok"]
    view = client.get("/cases/case_identity_http/identity", headers={"X-Analyst": "maria"}).json()
    assert view["identity"]["liveness"] == {"blink": True, "turn": True, "method": "mediapipe"}
    assert view["identity"]["selfie_url"] == "/cases/case_identity_http/identity/selfie"
    assert view["face"]["status"] == "not_compared"  # the specimen ID sheet has no portrait
    image = client.get("/cases/case_identity_http/identity/selfie", headers={"X-Analyst": "maria"})
    assert image.headers["content-type"] == "image/jpeg" and image.content.startswith(b"\xff\xd8")
    portal = json.dumps(client.get("/cases/case_identity_http/client-status").json())
    assert "face" not in portal and "score" not in portal and "selfie" not in portal
