# Orchestrator (Person 1)

The conductor of stage 3, the reception agent's backend (stage 2), the audit log and the guardrails.

```bash
cd projects/orchestrator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q                      # includes all 26 labelled cases (tests/test_dataset.py)
.venv/bin/python -m nexxt_orchestrator.cli         # run conventions/case_file.example.json
.venv/bin/python -m nexxt_orchestrator.seed        # load the 26 labelled cases (with files) into runs/ for the UI
cp .env.example .env                               # then set FEATHERLESS_API_KEY (needed for OCR)
.venv/bin/uvicorn nexxt_orchestrator.api:app --port 8000 --env-file .env
```

### Configuration (environment or `.env`)

| Variable | Default | Meaning |
|---|---|---|
| `FEATHERLESS_API_KEY` | unset | OCR for uploads. Without it uploads are refused with 503 instead of being stored unread |
| `NEXXT_ANALYSTS` | unset | `maria=token1,elena=token2`. Analysts send `Authorization: Bearer <token>`; the name comes from the token. Unset = **dev mode**: the `X-Analyst` header is trusted (a warning is logged) |
| `NEXXT_CORS_ORIGINS` | `http://localhost:8080,http://localhost:5173,http://localhost:3000` | Browser origins allowed to call the API |
| `NEXXT_RUNS_DIR` | `projects/orchestrator/runs` | Where cases, uploads, OCR cache and audit logs live |
| `NEXXT_FIXTURE_API` | unset | `1` enables `POST /cases/{id}/documents/extracted` (tests and fixtures only) |
| `NEXXT_ALLOW_UPLOAD_WITHOUT_OCR` | unset | `1` stores uploads without a key (tests) |
| `NEXXT_MODELS_DIR` | `projects/orchestrator/models` | Where the two OpenCV face models (about 39 MB) are downloaded on first use, checked against their SHA-256 |
| `NEXXT_ACCEPT_SPECIMEN` | unset | `1` (demo only) lets documents marked SPECIMEN, like the synthetic dataset's identity sheet, pass the "official Romanian ID" checks of the upload gate. They must still be fully legible |

## Flow

| Call | Who | What runs |
|---|---|---|
| `POST /cases` | intake | validates the case file against the contract, checks PF/PJ matches the playbook. An existing `case_id` is a 409, never overwritten; ids are `[A-Za-z0-9_-]` only |
| `POST /cases/{id}/documents?replaces=doc_001` | client, per upload | multipart `file` (PDF, PNG or JPEG, max 10 MB; type checked from the bytes). Stored as `runs/<case>/docs/<doc_id>.<ext>`, then **intake mode**: classify, extract, validate, cross-check. Completeness is not judged yet. The client gets its client view back (an analyst gets the case file) |
| `POST /cases/{id}/documents/extracted` | tests, fixtures | same, but the body is an already extracted `Document` JSON. **Off unless `NEXXT_FIXTURE_API=1`** |
| `POST /cases/{id}/process` | client is done | **full mode**: adds tamper, screening and the risk draft. Status becomes `review` or `waiting_client` |
| `GET /cases/{id}/client-status` | client portal | progress, the bank's requests (and which document each is about), the outcome. No flags, tamper, screening or risk |
| `GET /cases`, `GET /cases/{id}`, `GET /cases/{id}/ownership` | analyst | case list, case file, registry UBOs next to declared UBOs (PJ) |
| `GET /cases/{id}/documents/{doc}/file`, `.../pages/{n}.png` | analyst | the stored file, one page as PNG for the evidence viewer |
| `POST /cases/{id}/flags/{flag}/dismiss` | analyst | closes a flag with a note; a **critical** flag answers 202 until a second, different analyst confirms |
| `POST /cases/{id}/decision` | analyst | approve / reject / documents_requested |
| `GET /cases/{id}/audit` | analyst | every call with input, output, time, hash chain, and `chain_valid` |
| `GET /playbooks`, `GET /playbooks/{id}`, `GET /me`, `GET /health` | anyone / analyst | playbooks; who the token belongs to; whether OCR and auth are on |

"Analyst" endpoints need a token once `NEXXT_ANALYSTS` is set. The client portal has no login: a case is reached by its unguessable id.

For PJ, a playbook with `person_flows` runs the natural-person playbook once per matching person (UBO, administrator, signatory).

## Upload gate (`gate.py`)

The portal sends `?expected=<doc_type>` with each upload. The file is read first and joins the case only if it passes;
otherwise the answer is 415 or 422 with `{"code", "message"}` (the message is for the client, in Romanian) and the file
is not kept. The first rule that fails is the answer:

| Code | When |
|---|---|
| `wrong_format`, `pdf_required` | an identity document that is not a photo (JPG, PNG) or PDF; any other document that is not a PDF |
| `not_clear` | a photo under 400 px on its short side; any text the OCR marks `[illegible]`; a key field of the document not read off the page (missing, or a value not found in the OCR text); an ID card CNP whose check digit fails (misread) |
| `wrong_document` | the classifier did not recognize the requested document; for an identity document, the page has no identity-card / passport heading or machine-readable zone (a club or membership card is refused even if the classifier guessed "id_card") |
| `not_romanian` | an identity document that does not say it is Romanian (ROMANIA / ROU / IDROU) |

Tested live with real OCR: a gym membership card, a payslip, a blurred ID photo, an ID cut to its top third and a fake
ID with an impossible CNP are all refused; well-formed IDs, bills and payslips pass. The gate does not judge whether a
well-formed Romanian ID is genuine: that is `id_integrity`, `pdf_metadata` and the analyst. Every refusal is in the
audit log (`reject_upload`). Without `expected` (fixtures, older clients) uploads are not gated.

## Identity: consent, selfie, face match (`identity.py`, `face.py`, `checks/face_match.py`)

| Call | Who | What |
|---|---|---|
| `POST /cases/{id}/consent` `{items}` | client portal | stores the consent; `kyc`, `biometric` and `screening` are required |
| `POST /cases/{id}/identity` `{selfie, liveness, fallback_reason}` | client portal | the verification selfie (JPEG/PNG data URL, max 2 MB). Refused with 422 `{code, message}` when no face or more than one face is visible, so the client retakes it |
| `GET /cases/{id}/identity`, `.../identity/selfie` | analyst | consent, liveness, the selfie, and the face comparison |

Stored in `runs/<case>/identity/`, outside the case file (the contract has no field for it). The client view only says
whether consent and the selfie are stored; it never carries the comparison. Every step is in the audit log.

`face_match` (rule R-PF-019, high) compares the selfie with the portrait on the applicant's latest identity document,
with OpenCV's YuNet detector and SFace embeddings (cosine similarity, threshold 0.363, OpenCV's published value). On the
ID photos in `data/id_photos`, the same face re-shot scores 0.92-0.97 and different people -0.02 to 0.18. A mismatch is a
flag that blocks approval and never reaches the client; a comparison that cannot be made (no portrait on the document,
as on the dataset's specimen sheets) becomes the usual "could not run" flag the analyst must acknowledge. Without a
selfie there is no flag: the portal asks for it before submitting. The result is cached until the selfie or the identity
document changes. It is an aid for the analyst, not a decision, and it is not a liveness check (the portal's camera step is).

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
Implemented today: `required_present` and `not_expired` (reference versions, `checks/stubs.py`), `sanctions` and `pep` (`checks/screening.py`), `pdf_metadata`, `font_consistency`, `totals_consistency` and `id_integrity` (`checks/tamper.py`, `checks/id_integrity.py`, see below), and `registry_vs_declaration` (`checks/registry.py`: looks up the company's CUI in `data/mock_registries/onrc_registry.json` and compares its UBOs and percentages with the UBO declaration; an unknown company or an unreadable declaration is flagged, never passed), `max_age_days` and `field_present` (`checks/validate.py`; an unreadable date is flagged, never passed), and `fields_match` (`checks/cross_check.py`: modes `exact`, `normalized` (diacritics, case and punctuation ignored) and `fuzzy` (word order and small spelling slips ignored); a person list matches if any of its people matches; person-level rules run once per person and compare with the company's documents). Also `income_vs_deposits` (`checks/cross_check.py`: payslip net salary against the average salary deposit on the bank statement, within `tolerance_pct`; different currencies are flagged for a manual comparison), `adverse_media` (`checks/screening.py`, list `data/mock_registries/adverse_media.json`) and `risk_factors` (`checks/risk.py`, see below). Every check in the catalog is implemented.

## Screening (`checks/screening.py`)

`sanctions`, `pep` and `adverse_media` match names (diacritics, word order and small spelling slips ignored) against the lists in `data/mock_registries/`, using the birth year from the ID (or the CNP) and the ID number to tell "confirmed" from "possible". People are only compared with person entries; a rule that `applies_to: company` screens the company's own name (legal form ignored) against company entries. Each flag records the person it is about (`person_id`).
A person without an identity document is not flagged here: `required_present` already blocks the case, and screening runs again when the ID arrives. An ID without a readable birth year is flagged as "screening incomplete".
`GET /cases/{id}/flags/{flag}/screening` shows the list entry next to the client's data; `POST .../confirm` records that the analyst confirmed the match (the flag stays open and keeps blocking approval); dismissing goes through `.../dismiss` (four eyes when critical).

## Risk draft (`checks/risk.py`)

`risk_factors` grades the client low / medium / high from the playbook's `factors`: `country` (a Romanian ID card means residence in Romania; for a company, its registry country and its people's residence), `occupation` (occupation or employer against risky fields), `caen_code` (from the certificat or the registry) and `pep` (an open PEP match is high). Open flags count only when they say something about the client: a sanctions match or tampered / inconsistent documents make it high, adverse media medium. A document the client still has to upload never changes the grade; it is listed as a reason. The demo tables are in `data/mock_registries/risk_factors.json`. Every reason says which flags it rests on, and the draft is always `is_draft: true`.

## Tamper checks (`checks/tamper.py`)

They open the uploaded PDF, so set `NEXXT_DOCS_DIR` (the CLI defaults it to the folder of the case file). A file path is tried as absolute, then in the case's upload folder (`<runs>/<case_id>/<file>`, where the upload API stores it), then under `NEXXT_DOCS_DIR`, then under `NEXXT_DOCS_DIR/<case_id>`. A missing or unreadable file becomes a medium "could not run" flag, never a silent pass.

| Check | Flags a document when | Evidence |
|---|---|---|
| `pdf_metadata` | **PDF:** Producer/Creator of any revision is an editor (Photoshop, iLovePDF, Sejda, ...); ModDate is more than 60 s after CreationDate; ModDate is after `issue_date`; more than one `%%EOF` (a linearized PDF is allowed two). **Photo (the ID):** EXIF/PNG/XMP software is an editor (Photoshop, GIMP, Snapseed, ...); EXIF DateTime is more than 60 s after DateTimeOriginal. A photo with no EXIF is not suspicious | whole page, quote with the software name |
| `font_consistency` | one text line mixes font families (weights of one family are ignored) | the line's box, linked to the overlapping extracted field |
| `id_integrity` | on identity documents: the CNP checksum is wrong, its county code or serial is impossible, or the birth date inside it differs from the printed `date_of_birth`; if an `mrz` field is extracted (TD2, the Romanian card, or TD1): any MRZ check digit is wrong, or its dates, sex, document number or CNP differ from the printed fields. On TD2 the CNP is rebuilt from the MRZ (its optional data holds the CNP without the date) and compared with the printed one. Local runs over `data/id_photos` (gitignored) are in `tests/test_id_photos.py`. An unparseable MRZ becomes a "could not run" flag | the CNP and MRZ field boxes, with no quote (the CNP is never copied into a flag) |
| `totals_consistency` | payslip `gross - (cas + cass + income_tax)` (or `deductions`) differs from `net_salary` by more than 0.01 | net, gross and deduction fields |

File type is read from the file header, not from the MIME type or extension; anything that is neither PDF nor image becomes a "could not run" flag. Flag text never contains the CNP, names or GPS data.

`id_integrity` works on extracted fields, so it needs Person 3's extractor to read the CNP (and, optionally, the `mrz` field) from the photo; an OCR misread trips it too, which the flag text says.

Not covered yet: pixel-level forensics on the ID photo (I tried error-level analysis: it flags clean cards with detailed portraits and missed synthetic edits, so it was left out until there are real photos to tune it on), bank-statement totals (raises, so it shows up as "could not run"), and a whole line re-rendered in a different family.
Tamper flags are never client-visible (see Guardrails).

## OCR (classify and extract)

`nexxt_orchestrator/ingest.py` connects uploads to the Featherless OCR in `projects/data-collection`. It is switched on
when `FEATHERLESS_API_KEY` is set where the API runs (models: `FEATHERLESS_OCR_MODEL`, `FEATHERLESS_EXTRACTION_MODEL`):

1. Each page is transcribed once by the vision model; the text is cached in `runs/<case>/ocr/<doc_id>.json`.
2. Classify: the model picks the `doc_type` from the case playbook's documents (anything else becomes `unknown`).
3. Extract: the model returns exactly the playbook's fields for that type; dates, money, CNP/CUI and lists of people
   are normalized in code. A value that cannot be normalized is kept as printed, so the checks flag it.
4. Owner: same CNP as an already owned document, then same name, then the only person with the right role.
   Company documents have no owner.

Each value is then located on its page, so the analyst screen can highlight it: from the PDF's text layer when there
is one (when the value is printed twice, the copy under the matching caption wins), else by asking the vision model
for its box (photos, scans). A person list gets the box around all its names. What cannot be found keeps
`bbox: [0, 0, 1, 1]` ("location unknown": the page opens without a highlight). On the 26 labelled cases 701 of 714
fields are located, all within the generator's boxes; the misses are payslip deductions printed as several lines.
A period printed as a range ("2026-09-28 - 2026-10-27") gives `period_end` its last date. A value whose words are not in the OCR text (misread, invented, or injected by the document) gets
confidence 0.5 instead of 0.8. A series given without its number ("DX") is completed from the page.
If the OCR service fails, the upload answers 502; the document is kept and retried on the next process.

## Guardrails (enforced in code, covered by tests)

- Checks are looked up by catalog name only; an unknown check or a crash becomes a medium flag for the analyst (fails closed, never a silent pass).
- Every flag cites a playbook rule; severity and `client_fixable` always come from the rule, not the module.
- Only validate and cross-check flags can reach the client. Tamper, screening and risk never do.
- Nothing in the pipeline can set a decision. `decide()` needs a named human (from the token, or `X-Analyst` in dev mode), and cannot approve:
  - before the full run (tamper, screening, risk) has seen every document, including one uploaded after it;
  - while high or critical flags are open;
  - while medium flags are open: they must be acknowledged, i.e. dismissed with a note. This covers checks that "could not run".
- Dismissing a **critical** flag takes two different analysts (four eyes); the first request is recorded in the audit.
- Document text sent to the model is JSON-encoded inside `<untrusted_document>` tags (`llm.wrap_untrusted()`) with the rule never to follow it; types come from a closed list; values not found in the OCR text get a low confidence.
- The audit log is append-only and hash-chained, and `audit.head` keeps the count and last hash: `verify()` detects an edited entry and also entries cut off the end. It is tamper-evident against edits through the app, not against someone who can rewrite both files; anchor the head hash externally for that.

## LLM

The only model calls are the Featherless OCR, classify and extract in `ingest.py` (see above). `llm.py` holds the
untrusted-text wrapper they use.
