"""Procedure PDF -> numbered clauses.

Usage:
    python clauses.py procedures/PJ-ONB-01.pdf          # prints clauses.json to stdout

Output: {"code": "PJ-ONB-01", "title": "...", "pages": 3,
         "clauses": [{"clause": "2.1", "page": 1, "section": "2. Documentele societății",
                      "text": "Clientul prezintă un certificat constatator emis de ONRC."}]}
"""
import json
import re
import sys
from collections import Counter

from pypdf import PdfReader

from validate_playbook import norm

CLAUSE_RE = re.compile(r"^(\d+\.\d+)\.\s+(.*)$")
SECTION_RE = re.compile(r"^(\d+)\.\s+(\S.*)$")
FOOTER_RE = re.compile(r"^(Page|Pagina)\s+\d+\s+(of|din)\s+\d+$", re.I)
CODE_RE = re.compile(r"\b([A-Z]{2}-[A-Z]{3}-\d{2})\b")


def page_lines(reader):
    pages = []
    for p in reader.pages:
        lines = [norm(l) for l in (p.extract_text() or "").splitlines()]
        pages.append([l for l in lines if l])
    return pages


def running_lines(pages):
    """Lines repeated on two or more pages are running headers or footers."""
    if len(pages) < 2:
        return set()
    counts = Counter(l for lines in pages for l in set(lines))
    return {l for l, c in counts.items() if c >= 2}


def parse(pdf_path):
    reader = PdfReader(pdf_path)
    pages = page_lines(reader)
    skip = running_lines(pages)
    first_text = " ".join(pages[0]) if pages else ""
    code_match = CODE_RE.search(first_text)

    clauses, current, section = [], None, None

    def close():
        nonlocal current
        if current:
            current["text"] = norm(current["text"])
            clauses.append(current)
            current = None

    for page_no, lines in enumerate(pages, start=1):
        for line in lines:
            if line in skip or FOOTER_RE.match(line):
                continue
            m = CLAUSE_RE.match(line)
            if m:
                close()
                current = {"clause": m.group(1), "page": page_no, "section": section, "text": m.group(2)}
                continue
            s = SECTION_RE.match(line)
            if s and not s.group(2)[0].isdigit():
                close()
                section = line
                continue
            if current is None:
                continue
            # A line after a finished sentence that does not start in lowercase is a heading
            # (e.g. "Surse"), not a continuation of the clause.
            if current["text"].rstrip().endswith(".") and not line[0].islower():
                close()
                continue
            current["text"] += " " + line
    close()

    title = norm(" ".join(pages[0][:2])) if pages else ""
    return {
        "code": code_match.group(1) if code_match else None,
        "title": title,
        "pages": len(pages),
        "clauses": clauses,
    }


if __name__ == "__main__":
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False, indent=2))
