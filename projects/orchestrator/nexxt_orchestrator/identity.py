"""The client's onboarding record: consent, the verification selfie and its liveness result, and the face comparison.

Stored next to the case (runs/<case_id>/identity/), not in the case file: the contract has no field for it, and the
selfie is biometric data that only the analyst's endpoints serve. The face comparison is cached with the selfie hash and
the document it was made against, so it is recomputed only when one of them changes.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .store import safe_id

REQUIRED_CONSENTS = {"kyc", "biometric", "screening"}
KNOWN_CONSENTS = REQUIRED_CONSENTS | {"marketing"}
MAX_SELFIE_BYTES = 2 * 1024 * 1024


class IdentityStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def folder(self, case_id: str) -> Path:
        return self.root / safe_id(case_id) / "identity"

    def selfie_path(self, case_id: str) -> Path:
        return self.folder(case_id) / "selfie.jpg"

    def load(self, case_id: str) -> dict[str, Any]:
        path = self.folder(case_id) / "identity.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}

    def _save(self, case_id: str, record: dict[str, Any]) -> None:
        folder = self.folder(case_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "identity.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    def save_consent(self, case_id: str, items: list[str]) -> dict[str, Any]:
        chosen = sorted(set(items))
        if unknown := set(chosen) - KNOWN_CONSENTS:
            raise ValueError(f"unknown consent: {', '.join(sorted(unknown))}")
        if missing := REQUIRED_CONSENTS - set(chosen):
            raise ValueError(f"required consent missing: {', '.join(sorted(missing))}")
        record = self.load(case_id)
        record["consent"] = {"at": datetime.now().astimezone().isoformat(timespec="seconds"), "items": chosen}
        self._save(case_id, record)
        return record["consent"]

    def save_selfie(self, case_id: str, image: bytes, liveness: dict[str, Any], fallback_reason: str | None) -> dict[str, Any]:
        folder = self.folder(case_id)
        folder.mkdir(parents=True, exist_ok=True)
        self.selfie_path(case_id).write_bytes(image)
        record = self.load(case_id)
        record["identity"] = {
            "captured_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "selfie_sha256": hashlib.sha256(image).hexdigest(),
            "liveness": {"blink": bool(liveness.get("blink")), "turn": bool(liveness.get("turn")),
                         "method": liveness.get("method") if liveness.get("method") in ("mediapipe", "none") else "none"},
            "fallback_reason": fallback_reason,
        }
        record.pop("face", None)  # a new selfie needs a new comparison
        self._save(case_id, record)
        return record["identity"]

    def save_face(self, case_id: str, face: dict[str, Any]) -> None:
        record = self.load(case_id)
        record["face"] = face
        self._save(case_id, record)


def decode_image(data_url: str) -> bytes:
    """A selfie sent as a JPEG or PNG data URL; anything else is refused."""
    match = re.fullmatch(r"data:image/(jpeg|png);base64,([A-Za-z0-9+/=\s]+)", data_url or "")
    if not match:
        raise ValueError("the selfie must be a JPEG or PNG data URL")
    try:
        image = base64.b64decode(match.group(2), validate=False)
    except ValueError as exc:
        raise ValueError("the selfie is not valid base64") from exc
    if len(image) > MAX_SELFIE_BYTES:
        raise ValueError("the selfie is larger than 2 MB")
    if not (image.startswith(b"\xff\xd8\xff") or image.startswith(b"\x89PNG\r\n\x1a\n")):
        raise ValueError("the selfie is not a JPEG or PNG image")
    return image
