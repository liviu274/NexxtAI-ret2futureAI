from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def image_paths(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def extract_features(path: Path, size: int = 64) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    image.thumbnail((size, size))
    canvas = Image.new("RGB", (size, size), "white")
    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))
    rgb = np.asarray(canvas, dtype=np.float32) / 255.0
    gray = np.asarray(canvas.convert("L"), dtype=np.float32) / 255.0
    edges = np.asarray(canvas.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    histogram = np.concatenate([
        np.histogram(rgb[:, :, channel], bins=16, range=(0, 1), density=True)[0]
        for channel in range(3)
    ])
    vector = np.concatenate([gray.ravel(), edges.ravel(), histogram])
    norm = np.linalg.norm(vector)
    return vector / norm if norm else vector
