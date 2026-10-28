"""Builders for the files tamper tests need: a real ID is a photo, the other documents are PDFs."""
from __future__ import annotations

from pathlib import Path

from PIL import Image


def make_pdf(path: Path, lines: list[list[tuple[str, str]]], producer: str = "Test Fixture",
             created: str = "D:20261027100000Z", modified: str = "D:20261027100000Z", resave: str | None = None) -> Path:
    """One-page PDF. Each line is a list of (font, text) runs, so a line can mix fonts. `resave` appends an
    incremental update (second %%EOF) that rewrites ModDate, the way an editor saving over the file would."""
    content = "".join(
        f"BT 1 0 0 1 40 {800 - 24 * i} Tm " + " ".join(f"/{font} 12 Tf ({text}) Tj" for font, text in runs) + " ET\n"
        for i, runs in enumerate(lines)
    ).encode()
    info = f"<< /Producer ({producer}) /CreationDate ({created}) /ModDate ({modified}) >>".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
        info,
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    if resave:
        update = len(out)
        out += f"7 0 obj\n<< /Producer ({producer}) /CreationDate ({created}) /ModDate ({resave}) >>\nendobj\n".encode()
        new_xref = len(out)
        out += f"xref\n7 1\n{update:010d} 00000 n \n".encode()
        out += f"trailer\n<< /Size 8 /Root 1 0 R /Info 7 0 R /Prev {xref} >>\nstartxref\n{new_xref}\n%%EOF\n".encode()
    path.write_bytes(bytes(out))
    return path


def make_photo(path: Path, software: str | None = None, captured: str | None = None, modified: str | None = None,
               fmt: str = "JPEG") -> Path:
    """A stand-in for a phone photo of an ID. EXIF dates look like '2026:10:27 10:00:00'."""
    image = Image.new("RGB", (400, 250), "white")
    exif = Image.Exif()
    if software:
        exif[305] = software
    if modified:
        exif[306] = modified
    if captured:
        exif.get_ifd(0x8769)[0x9003] = captured
    image.save(path, fmt, exif=exif)
    return path


import json  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def example_case_documents(tmp_path_factory, monkeypatch):
    """conventions/case_file.example.json points at files that do not exist; give the tamper checks something to open."""
    from nexxt_orchestrator.store import REPO_ROOT  # imported late: test_api sets NEXXT_RUNS_DIR before the store is first imported

    example = REPO_ROOT / "conventions" / "case_file.example.json"
    if not example.exists():
        return
    docs = tmp_path_factory.mktemp("docs")
    for doc in json.loads(example.read_text(encoding="utf-8"))["documents"]:
        (docs / doc["file"]).parent.mkdir(parents=True, exist_ok=True)
        make_pdf(docs / doc["file"], [[("F1", "example")]])
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(docs))
