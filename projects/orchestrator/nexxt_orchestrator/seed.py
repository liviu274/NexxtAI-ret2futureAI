"""Load the labelled synthetic cases into the runs folder, with their files, and run the full pipeline on each.

    python -m nexxt_orchestrator.seed            # every case under data/client data/KYC_PF_PJ
    python -m nexxt_orchestrator.seed pf_08 pj_12  # only cases whose id contains one of these

Cases already in the runs folder are skipped, so it is safe to run again. The documents arrive already extracted
(case_file.extracted.json), so no OCR key is needed; tamper checks read the copied files.
"""
from __future__ import annotations

import json
import shutil
import sys

from .audit import AuditLog
from .models import CaseFile
from .orchestrator import Orchestrator
from .store import DEFAULT_RUNS_DIR, REPO_ROOT, CaseStore, PlaybookStore

DATASET = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"


def main(filters: list[str]) -> None:
    store = CaseStore(DEFAULT_RUNS_DIR)
    orch = Orchestrator(store, AuditLog(DEFAULT_RUNS_DIR), PlaybookStore())
    for source in sorted(p.parent for p in DATASET.rglob("case_file.extracted.json")):
        if filters and not any(f in source.name for f in filters):
            continue
        case = CaseFile.model_validate(json.loads((source / "case_file.extracted.json").read_text(encoding="utf-8")))
        if store.exists(case.case_id):
            print(f"skip  {case.case_id} (already loaded)")
            continue
        case.flags, case.risk_draft, case.decision = [], None, None
        files = store.files_dir(case.case_id)
        files.mkdir(parents=True, exist_ok=True)
        for doc in case.documents:
            name = f"{doc.doc_id}{(source / doc.file).suffix}"
            shutil.copyfile(source / doc.file, files / name)
            doc.file = f"docs/{name}"
        orch.submit(case)
        done = orch.process(case.case_id)
        print(f"load  {case.case_id}: {done.status}, {sum(f.status != 'resolved' for f in done.flags)} flags")


if __name__ == "__main__":
    main(sys.argv[1:])
