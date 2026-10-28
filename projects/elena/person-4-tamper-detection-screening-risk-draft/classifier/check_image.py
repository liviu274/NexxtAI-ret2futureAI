from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from image_features import extract_features


def main() -> None:
    parser = argparse.ArgumentParser(description="Check an image against a reference profile.")
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--document-type", default="default")
    parser.add_argument("--threshold", type=float, default=0.35)
    args = parser.parse_args()

    profile = json.loads(args.reference.read_text(encoding="utf-8"))
    groups = profile["groups"]
    group = groups.get(args.document_type) or groups.get("default")
    if group is None:
        raise SystemExit(f"No reference group for '{args.document_type}'. Available: {', '.join(groups)}")

    vector = extract_features(args.image)
    centroid = np.asarray(group["centroid"], dtype=np.float32)
    score = float(np.linalg.norm(vector - centroid))
    result = {
        "image": str(args.image),
        "document_type": args.document_type,
        "method": profile["method"],
        "anomaly_score": round(score, 6),
        "threshold": args.threshold,
        "classification": "possible_tamper" if score > args.threshold else "consistent_with_reference",
        "human_review_required": score > args.threshold,
        "reference_example": group["example"],
        "warning": "Anomaly score is a triage signal, not proof of forgery.",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
