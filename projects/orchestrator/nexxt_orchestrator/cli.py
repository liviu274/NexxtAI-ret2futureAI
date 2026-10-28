from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from .audit import AuditLog
from .models import CaseFile
from .orchestrator import Orchestrator
from .store import CaseStore, PlaybookStore


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "../../conventions/case_file.example.json")
    case = CaseFile.model_validate(json.loads(path.read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None

    runs = Path(tempfile.mkdtemp(prefix="nexxt_run_"))
    orch = Orchestrator(CaseStore(runs), AuditLog(runs), PlaybookStore())
    orch.submit(case)
    result = orch.process(case.case_id)

    print(f"case {result.case_id}: status={result.status}")
    for flag in result.flags:
        print(f"  [{flag.severity:8}] {flag.flag_id} {flag.rule_id}: {flag.title}")
    for msg in orch.client_messages(result.case_id):
        print(f"  -> client: {msg['message']}")
    if result.risk_draft:
        print(f"  risk draft: {result.risk_draft.level} (draft, not a decision)")
    entries = orch.audit.entries(result.case_id)
    print(f"  audit: {len(entries)} entries, chain valid={orch.audit.verify(result.case_id)} ({runs})")


if __name__ == "__main__":
    main()
