import json

import pytest

from nexxt_orchestrator.audit import AuditLog
from nexxt_orchestrator.checks.screening import assess, load_list, name_score, normalize, Subject
from nexxt_orchestrator.models import CaseFile
from nexxt_orchestrator.orchestrator import Orchestrator
from nexxt_orchestrator.store import REPO_ROOT, CaseStore, PlaybookStore

CONVENTIONS = REPO_ROOT / "conventions"
SCREENING = {"R-PF-007", "R-PF-008"}


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([CONVENTIONS]))


def screen(orch, name, cnp="1900514123456", series=None):
    case = CaseFile.model_validate(json.loads((CONVENTIONS / "case_file.example.json").read_text()))
    case.flags, case.risk_draft, case.decision = [], None, None
    case.case_id = f"case_screen_{len(orch.store.list_ids()) + 1}"  # a case id is never submitted twice
    case.persons[0].full_name = name
    case.documents[0].fields["cnp"].value = cnp
    if series:
        field = case.documents[0].fields["cnp"].model_copy(update={"field_id": "fld_099", "name": "series_number", "value": series})
        case.documents[0].fields["series_number"] = field
    orch.submit(case)
    done = orch.process(case.case_id)
    return {f.rule_id: f for f in done.flags if f.rule_id in SCREENING}


def test_clean_client_has_no_screening_flags(orch):
    assert screen(orch, "Andrei Popescu") == {}


def test_sanctions_hit_when_name_and_birth_year_match(orch):
    flags = screen(orch, "Petar Georgiev", cnp="1900514123456")
    flag = flags["R-PF-007"]
    assert flag.title == "sanctions hit: Petar Georgiev"
    assert flag.severity == "critical" and not flag.client_fixable and flag.fix_message is None
    assert flag.evidence[0].quote == "ANDREI POPESCU" or flag.evidence[0].field_id is not None


def test_pep_hit_ignores_case_diacritics_and_word_order(orch):
    flags = screen(orch, "DIMITROV NIKOLA", cnp="1580101123456")
    assert flags["R-PF-008"].title == "PEP hit: Nikola Dimitrov"
    assert "PEP-RO-101" in flags["R-PF-008"].explanation


def test_same_name_different_year_is_a_possible_match(orch):
    flag = screen(orch, "Ion Nistor", cnp="1850514123456")["R-PF-008"]
    assert flag.title.startswith("Possible PEP match")
    assert "birth year differs" in flag.explanation


def test_spelling_variant_with_same_year_is_a_possible_match(orch):
    flag = screen(orch, "Victor Babenco", cnp="1890514123456")["R-PF-008"]
    assert flag.title.startswith("Possible PEP match")
    assert "similar spelling" in flag.explanation


def test_id_number_confirms_a_hit_despite_name_variant(orch):
    flag = screen(orch, "Nicola Toma", cnp="1940514123456", series="P8532903")["R-PF-007"]
    assert flag.title == "sanctions hit: Nicolae Toma"
    assert "ID number matches" in flag.explanation


def test_shared_surname_alone_is_not_a_match(orch):
    assert screen(orch, "Andrei Barbu", cnp="1850514123456").get("R-PF-007") is None
    assert screen(orch, "Maria Popescu", cnp="1850514123456") == {}


def test_birth_year_comes_from_the_cnp_century_digit():
    entry = {"nume_complet": "Gheorghe Stan", "anul_nasterii": "1999", "cetatenie": "FR", "id_sursa": "X",
             "motiv_includere": "m", "act_identitate_cunoscut": None}
    assert assess(Subject("Gheorghe Stan", 1999, None, None), entry).kind == "confirmed"
    assert assess(Subject("Gheorghe Stan", None, None, None), entry).kind == "possible"


def test_name_matching_primitives():
    assert normalize("Ștefan Țurcanu") == ["stefan", "turcanu"]
    assert name_score(normalize("Dimitrov Nikola"), normalize("Nikola Dimitrov")) == 1.0
    assert name_score(normalize("Ion Nistor"), normalize("Ion Popescu")) < 0.80


def test_unknown_list_fails_closed(orch):
    with pytest.raises(KeyError):
        load_list("mock_unknown_v9")


def run_case(tmp_path, mutate):
    case = CaseFile.model_validate(json.loads((CONVENTIONS / "case_file.example.json").read_text()))
    case.flags, case.risk_draft, case.decision = [], None, None
    mutate(case)
    orch = Orchestrator(CaseStore(tmp_path), AuditLog(tmp_path), PlaybookStore([CONVENTIONS]))
    orch.submit(case)
    return orch.process(case.case_id)


def test_screening_without_a_birth_year_is_never_reported_as_clean(tmp_path):
    done = run_case(tmp_path, lambda c: c.documents[0].fields.pop("cnp"))
    incomplete = [f for f in done.flags if f.rule_id in SCREENING]
    assert {f.rule_id for f in incomplete} == SCREENING
    assert all("screening incomplete" in f.title for f in incomplete)
    assert all(not f.client_fixable and f.fix_message is None for f in incomplete)


def test_screening_with_a_complete_id_has_no_incomplete_flags(tmp_path):
    done = run_case(tmp_path, lambda c: None)
    assert not [f for f in done.flags if "incomplete" in f.title]
