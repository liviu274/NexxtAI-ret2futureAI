import json
from datetime import date

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks.registry import differences
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

PJ_CASES = REPO_ROOT / "data" / "client data" / "KYC_PF_PJ" / "PJ" / "cases"
PLAYBOOKS = REPO_ROOT / "projects" / "playbook-builder" / "fallback"
RULE = "R-PJ-006"


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([PLAYBOOKS]), today=lambda: date(2026, 10, 28))


def load(name: str) -> CaseFile:
    case = CaseFile.model_validate(json.loads((PJ_CASES / name / "case_file.extracted.json").read_text(encoding="utf-8")))
    case.flags, case.risk_draft, case.decision = [], None, None
    return case


def registry_flags(orch, case: CaseFile):
    orch.submit(case)
    return [f for f in orch.process(case.case_id).flags if f.rule_id == RULE]


@pytest.mark.parametrize("name", ["case_pj_00_corect_control", "case_pj_05_cui_diferit"])
def test_declaration_matching_the_registry_has_no_flag(orch, name):
    assert registry_flags(orch, load(name)) == []


def test_declared_ubo_not_in_registry_is_flagged_with_evidence(orch):
    [flag] = registry_flags(orch, load("case_pj_06_ubo_diferit"))
    assert flag.severity == "high" and not flag.client_fixable
    assert "Mara Exemplu is declared as UBO but is not a UBO in the registry" in flag.explanation
    assert "Irina Model is a UBO in the registry but is missing from the declaration" in flag.explanation
    assert flag.evidence[0].doc_id == "doc_003" and flag.evidence[0].field_id == "doc_003_ubos"


def test_different_ownership_percentages_are_flagged(orch):
    [flag] = registry_flags(orch, load("case_pj_07_procente_diferite"))
    assert "Tudor Exemplu: 50% declared, 60% in the registry" in flag.explanation


def test_lookup_uses_the_company_cui_not_the_declaration_cui(orch):
    [flag] = registry_flags(orch, load("case_pj_12_probleme_combinate"))
    assert "Mara Exemplu is declared as UBO" in flag.explanation


def test_unknown_company_fails_closed(orch):
    case = load("case_pj_00_corect_control")
    case.company["cui"] = "11111111"
    [flag] = registry_flags(orch, case)
    assert flag.title == "Company not found in the ONRC registry"


def test_declaration_without_ubos_fails_closed(orch):
    case = load("case_pj_00_corect_control")
    declaration = next(d for d in case.documents if d.doc_type == "ubo_declaration")
    del declaration.fields["ubos"]
    [flag] = registry_flags(orch, case)
    assert flag.title == "UBO declaration cannot be compared with the registry"


def test_missing_declaration_is_left_to_required_present(orch):
    assert registry_flags(orch, load("case_pj_04_declaratie_ubo_lipsa")) == []


def test_people_match_by_cnp_then_by_name_in_any_order():
    registry = [{"full_name": "Tudor Exemplu", "cnp": "1850520408137", "ownership_pct": 60},
                {"full_name": "Irina Model", "ownership_pct": 40}]
    declared = [{"full_name": "TUDOR EXEMPLU", "cnp": "1850520408137", "ownership_pct": 60},
                {"full_name": "Model Irina", "ownership_pct": 40}]
    assert differences(registry, declared) == []
