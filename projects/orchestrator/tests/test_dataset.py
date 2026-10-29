"""Every labelled synthetic case, full pipeline, against its expected_flags.json (the detector oracle)."""
import json
from datetime import date

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

DATA = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ"
CASES = sorted(p.parent for p in DATA.rglob("case_file.extracted.json"))


@pytest.mark.parametrize("case_dir", CASES, ids=lambda p: p.name)
def test_case_raises_exactly_the_expected_flags(tmp_path, monkeypatch, case_dir):
    monkeypatch.setenv("NEXXT_DOCS_DIR", str(case_dir))
    case = CaseFile.model_validate(json.loads((case_dir / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore(), today=lambda: date(2026, 10, 28))
    orch.submit(case)
    done = orch.process(case.case_id)
    expected = {f["rule_id"] for f in json.loads((case_dir / "expected_flags.json").read_text(encoding="utf-8"))}
    assert {f.rule_id for f in done.flags} == expected


def test_all_labelled_cases_are_covered():
    assert len(CASES) == 26
