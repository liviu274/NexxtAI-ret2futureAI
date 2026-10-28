# Orchestrator (Person 1)

The conductor of stage 3, the reception agent's backend (stage 2), the audit log and the guardrails.

```bash
cd projects/orchestrator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q                      # 16 tests
.venv/bin/python -m nexxt_orchestrator.cli         # run conventions/case_file.example.json
.venv/bin/uvicorn nexxt_orchestrator.api:app --port 8000
```

## Flow

| Call | Who | What runs |
|---|---|---|
| `POST /cases` | intake | validates the case file against the contract, checks PF/PJ matches the playbook |
| `POST /cases/{id}/documents?replaces=doc_001` | client, per upload | multipart `file` (PDF, PNG or JPEG, max 10 MB; type checked from the bytes). Stored as `runs/<case>/docs/<doc_id>.<ext>`, then **intake mode**: classify, extract, validate, cross-check. Completeness is not judged yet. Returns the case; `GET /client-messages` has what to tell the client |
| `POST /cases/{id}/documents/extracted` | tests, fixtures | same, but the body is an already extracted `Document` JSON (e.g. from `case_file.extracted.json`) |
| `POST /cases/{id}/process` | client is done | **full mode**: adds tamper, screening and the risk draft. Status becomes `review` or `waiting_client` |
| `POST /cases/{id}/decision` + `X-Analyst` | Maria only | approve / reject / documents_requested |
| `GET /cases/{id}/audit` | Person 6 | every call with input, output, time, hash chain |

For PJ, a playbook with `person_flows` runs the natural-person playbook once per matching person (UBO, administrator, signatory).

## Plugging a module in (Persons 3 and 4)

A check is a function that gets a `CheckContext` and returns flags. Register it under its catalog name:

```python
from nexxt_orchestrator.checks import CheckContext, register
from nexxt_orchestrator.models import Evidence

@register("pdf_metadata")
def pdf_metadata(ctx: CheckContext):
    flags = []
    for doc in ctx.documents("payslip"):          # already filtered to the right person
        if edited_after_issue(doc):
            flags.append(ctx.flag(
                title="PDF edited after issue",
                explanation="Producer is Photoshop, ModDate is after the issue date.",
                evidence=[Evidence(doc_id=doc.doc_id, page=1, bbox=[0.1, 0.8, 0.9, 0.85], quote="...")],
            ))
    return flags
```

`ctx.flag()` copies severity, rule id and client message from the playbook rule. Do not set them yourself; the orchestrator overwrites them anyway.
`risk_factors` returns a `RiskDraft` instead of flags. Classify and extract plug in with `orchestrator.set_ingest(classify=..., extract=...)`. Each gets `(case, doc)` and fills `doc` in place (`doc_type`, `classification_confidence`, `owner_person_id`, `fields`); the uploaded file is at `store.files_dir(case.case_id).parent / doc.file`, and `doc.mime_type` says whether it is a PDF or an image.
Implemented today: `required_present` and `not_expired` (reference versions, `checks/stubs.py`), `sanctions` and `pep` (`checks/screening.py`), and `registry_vs_declaration` (`checks/registry.py`: looks up the company's CUI in `data/mock_registries/onrc_registry.json` and compares its UBOs and percentages with the UBO declaration; an unknown company or an unreadable declaration is flagged, never passed), `max_age_days` and `field_present` (`checks/validate.py`; an unreadable date is flagged, never passed), and `fields_match` (`checks/cross_check.py`: modes `exact`, `normalized` (diacritics, case and punctuation ignored) and `fuzzy` (word order and small spelling slips ignored); a person list matches if any of its people matches; person-level rules run once per person and compare with the company's documents). Everything else in the catalog is a no-op stub in `checks/stubs.py`.

## Guardrails (enforced in code, covered by tests)

- Checks are looked up by catalog name only; an unknown check or a crash becomes a medium flag for the analyst (fails closed, never a silent pass).
- Every flag cites a playbook rule; severity and `client_fixable` always come from the rule, not the module.
- Only validate and cross-check flags can reach the client. Tamper, screening and risk never do.
- Nothing in the pipeline can set a decision. `decide()` needs a named human, and cannot approve while high or critical flags are open.
- Document text sent to the LLM goes through `llm.wrap_untrusted()`, with JSON-only output and one retry.
- The audit log is append-only and hash-chained (`verify()` detects edits).

## LLM

`llm.complete_json()` talks to any OpenAI-compatible endpoint. Default is local Ollama (`qwen2.5:14b-instruct`); set `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` to switch.
