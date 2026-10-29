"""face_match: the selfie the client took in the portal against the portrait on their identity document."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from ..identity import IdentityStore
from ..models import CaseFile, Flag
from ..store import DEFAULT_RUNS_DIR
from . import CheckContext, register, whole_doc_evidence
from .tamper import document_path

IDENTITY = ("id_card", "passport")
REASONS = {
    "no_face_id": "no portrait was found on the identity document",
    "no_face_selfie": "no face was found in the selfie",
    "several_faces_selfie": "the selfie shows more than one face",
    "unreadable": "an image could not be read",
    "model": "the face model is not available",
}


def identity_document(case: CaseFile, owners: set[str]):
    docs = [d for d in case.documents if d.doc_type in IDENTITY and (not owners or d.owner_person_id in owners)]
    return docs[-1] if docs else None  # the latest upload replaces earlier ones


def face_result(case: CaseFile, runs_dir: Path | None = None, owners: set[str] | None = None) -> dict[str, Any] | None:
    """The comparison for this case, from cache when neither the selfie nor the ID document changed. None without a
    selfie or an identity document; otherwise {status: match | no_match | not_compared, score, threshold, doc_id, ...}."""
    from .. import face

    store = IdentityStore(runs_dir or DEFAULT_RUNS_DIR)
    record = store.load(case.case_id)
    selfie = record.get("identity")
    doc = identity_document(case, owners or set())
    if not selfie or doc is None:
        return None
    cached = record.get("face")
    if cached and cached.get("selfie_sha256") == selfie["selfie_sha256"] and cached.get("doc_id") == doc.doc_id:
        return cached
    base = {"selfie_sha256": selfie["selfie_sha256"], "doc_id": doc.doc_id, "threshold": face.MATCH_THRESHOLD,
            "at": datetime.now().astimezone().isoformat(timespec="seconds")}
    try:
        selfie_image = face.load_image(store.selfie_path(case.case_id), "image/jpeg")
        document_image = face.load_image(document_path(case.case_id, doc, runs_dir), doc.mime_type)
        result = face.compare(selfie_image, document_image)
        out = {**base, "status": "match" if result.match else "no_match", "score": result.score}
    except face.FaceError as exc:
        out = {**base, "status": "not_compared", "reason": exc.code, "score": None}
    if out.get("reason") != "model":  # a missing model is retried next time, not remembered
        store.save_face(case.case_id, out)
    return out


@register("face_match")
def face_match(ctx: CheckContext) -> list[Flag]:
    result = face_result(ctx.case, ctx.runs_dir, ctx.owner_ids)
    if result is None or result["status"] == "match":
        return []  # no selfie yet (the portal asks for it before submitting) or the same person
    if result["status"] == "not_compared":
        # Fails closed: the orchestrator turns this into a "could not run" flag the analyst must acknowledge.
        raise ValueError(f"face comparison not possible: {REASONS.get(result['reason'], result['reason'])}; compare the photos manually")
    doc = next(d for d in ctx.case.documents if d.doc_id == result["doc_id"])
    return [ctx.flag(
        title="Selfie does not match the identity document photo",
        explanation=(f"Face similarity {result['score']:.2f}, below the {result['threshold']:.3f} threshold for the same person "
                     f"(selfie vs {doc.doc_type} {doc.doc_id}). Compare the two photos before deciding."),
        evidence=[whole_doc_evidence(doc)],
    )]
