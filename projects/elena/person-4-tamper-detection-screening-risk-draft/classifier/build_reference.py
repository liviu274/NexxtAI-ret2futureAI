from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from image_features import extract_features, image_paths


def group_for(path: Path, root: Path) -> str:
    relative = path.relative_to(root)
    return relative.parts[0] if len(relative.parts) > 1 else "default"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a MIDV-500 image reference profile.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--group", help="Use one document-type group instead of all groups.")
    args = parser.parse_args()

    paths = image_paths(args.dataset)
    if args.group:
        paths = [path for path in paths if group_for(path, args.dataset) == args.group]
    if not paths:
        raise SystemExit("No supported images found in the dataset path.")

    groups: dict[str, list[np.ndarray]] = defaultdict(list)
    examples: dict[str, str] = {}
    for path in paths:
        group = group_for(path, args.dataset)
        groups[group].append(extract_features(path))
        examples.setdefault(group, str(path))

    profile = {
        "schema_version": 1,
        "method": "pixel-edge-histogram-reference",
        "dataset": "MIDV-500",
        "groups": {
            group: {
                "count": len(vectors),
                "centroid": np.mean(vectors, axis=0).tolist(),
                "dispersion": float(np.mean(np.linalg.norm(vectors - np.mean(vectors, axis=0), axis=1))),
                "example": examples[group],
            }
            for group, vectors in groups.items()
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(profile), encoding="utf-8")
    print(f"Built {len(profile['groups'])} reference groups from {len(paths)} images.")


if __name__ == "__main__":
    main()
