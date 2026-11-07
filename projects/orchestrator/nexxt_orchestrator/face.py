"""Face comparison: the client's selfie against the portrait on their identity document.

OpenCV's YuNet finds the faces and SFace turns each into a 128-number embedding; the cosine similarity of the two
embeddings decides. MATCH_THRESHOLD is the value OpenCV publishes for SFace. On the ID photos in data/id_photos the same
card re-shot (cropped, rescaled, darker, blurred) scores 0.92-0.97 and different people -0.02 to 0.18; a selfie against
a portrait taken years earlier scores lower than a re-shot card, which is why the threshold is not set higher.

The models (about 39 MB) are downloaded on first use into NEXXT_MODELS_DIR (default projects/orchestrator/models,
gitignored) and checked against their SHA-256. This is a biometric aid for the analyst, never a decision: a mismatch
becomes a flag, a comparison that cannot be made becomes a "could not run" flag the analyst must look at.
"""
from __future__ import annotations

import hashlib
import os
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

MATCH_THRESHOLD = 0.363
MODELS_DIR = Path(os.environ.get("NEXXT_MODELS_DIR", Path(__file__).resolve().parents[1] / "models"))
ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
MODELS = {
    "detector": ("face_detection_yunet_2023mar.onnx", f"{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
                 "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    "recognizer": ("face_recognition_sface_2021dec.onnx", f"{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
                   "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
}


class FaceError(Exception):
    """The faces could not be compared: `code` says why (no_face_selfie, no_face_id, several_faces_selfie, model)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class Comparison:
    score: float
    match: bool
    threshold: float = MATCH_THRESHOLD


def model_path(name: str) -> Path:
    filename, url, sha256 = MODELS[name]
    path = MODELS_DIR / filename
    if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256:
        return path
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
    except OSError as exc:
        raise FaceError("model", f"the face model could not be downloaded ({exc}); set NEXXT_MODELS_DIR to a copy") from exc
    if hashlib.sha256(data).hexdigest() != sha256:
        raise FaceError("model", f"{filename} does not match its published checksum")
    path.write_bytes(data)
    return path


def _quiet(cv2) -> None:
    logging = getattr(getattr(cv2, "utils", None), "logging", None)
    if logging is not None:  # errors only: OpenCV 5 warns about DNN targets on every model load
        logging.setLogLevel(logging.LOG_LEVEL_ERROR)


@lru_cache(maxsize=1)
def _recognizer():
    import cv2

    _quiet(cv2)
    return cv2.FaceRecognizerSF.create(str(model_path("recognizer")), "")


def _faces(image):
    import cv2

    _quiet(cv2)

    height, width = image.shape[:2]
    detector = cv2.FaceDetectorYN.create(str(model_path("detector")), "", (width, height), 0.7)
    _, found = detector.detect(image)
    return [] if found is None else list(found)


def load_image(path: Path, mime: str):
    """A BGR image of the file: a photo as is, a PDF's first page rendered at 200 dpi."""
    import cv2
    import numpy as np

    if mime == "application/pdf":
        import pymupdf

        with pymupdf.open(path) as pdf:
            pix = pdf[0].get_pixmap(dpi=200)
            data = pix.tobytes("png")
    else:
        data = path.read_bytes()
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise FaceError("unreadable", "the image could not be decoded")
    return image


def load_image_bytes(data: bytes):
    import cv2
    import numpy as np

    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise FaceError("unreadable", "the image could not be decoded")
    return image


def count_faces(image) -> int:
    return len(_faces(image))


def embedding(image, *, largest: bool):
    """The embedding of the one face in a selfie, or of the largest face on a document (its portrait)."""
    faces = _faces(image)
    if not faces:
        return None
    if not largest and len(faces) > 1:
        raise FaceError("several_faces_selfie", "more than one face in the selfie")
    face = max(faces, key=lambda f: f[2] * f[3])
    recognizer = _recognizer()
    return recognizer.feature(recognizer.alignCrop(image, face))


def compare(selfie, document) -> Comparison:
    import cv2

    own = embedding(selfie, largest=False)
    if own is None:
        raise FaceError("no_face_selfie", "no face found in the selfie")
    portrait = embedding(document, largest=True)
    if portrait is None:
        raise FaceError("no_face_id", "no portrait found on the identity document")
    score = float(_recognizer().match(own, portrait, cv2.FaceRecognizerSF_FR_COSINE))
    return Comparison(score=round(score, 3), match=score >= MATCH_THRESHOLD)
