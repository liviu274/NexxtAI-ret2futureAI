# Diagram prompts — Person 4

These prompts are designed for Mermaid, Lucidchart AI, Eraser, Miro AI, or
another diagram generator. They describe the same architecture from different
angles so the diagrams remain consistent.

## Shared architecture vocabulary

Use these names consistently:

- **Document Intake Service** — receives synthetic PDFs and images.
- **Document Classification Service** — identifies identity document, utility
  bill, or payslip.
- **Extraction Service** — reads the fields declared in
  `rules/rules.json`; returns value, raw text, page, bounding box, and
  confidence.
- **Tamper Detection Service** — checks PDF metadata, mixed fonts, arithmetic
  totals, and incremental-save markers.
- **Cross-Document Verification Service** — compares name, address, and CNP.
- **Screening Service** — calls mock sanctions, PEP, adverse-media, and
  company-registry tools.
- **Ownership Graph Service** — compares shareholders and UBOs with the
  declared beneficial owner for PJ cases.
- **Risk Draft Service** — creates a risk level and reasons; it never decides.
- **Case Orchestrator** — coordinates services and persists the case state.
- **Rules Configuration** — versioned `rules.json`, the source of truth for
  fields and checks.
- **Evidence Store** — stores extracted values, bounding boxes, confidence,
  rule IDs, and document references.
- **Human Review UI** — the only place where a final decision can be made.

All diagrams must show synthetic data, least-privilege service access, audit
logging, and a human review gate.

## 1. End-to-end architecture diagram

```text
Create a clean C4-style container diagram for a banking operational-efficiency
prototype called "Person 4 — Tamper Detection, Screening & Risk Draft".

Show these actors and containers:
1. Operations analyst using Human Review UI.
2. Document Intake Service.
3. Case Orchestrator.
4. Document Classification Service.
5. Extraction Service.
6. Tamper Detection Service.
7. Cross-Document Verification Service.
8. Screening Service.
9. Ownership Graph Service for PJ cases.
10. Risk Draft Service.
11. Rules Configuration repository containing versioned rules.json.
12. Evidence Store and Audit Log.
13. Mock external tools: ONRC registry, sanctions/PEP list, adverse-media
    stub.

Draw the flow:
client uploads synthetic documents -> intake -> orchestrator -> classification
-> extraction -> tamper detection and cross-document verification -> screening
and ownership graph when applicable -> risk draft -> evidence store -> human
review UI.

Label every arrow with the data exchanged. Use solid arrows for synchronous
HTTP/JSON calls and dashed arrows for asynchronous events. Mark the final
decision as HUMAN ONLY. Show that no service can approve or reject a customer.
Use a red boundary around external tools and a blue boundary around internal
microservices.
```

## 2. Document-by-document tamper diagram

```text
Create a document-focused flowchart for the synthetic Gigel Popescu dataset.
Show three parallel document lanes:

Lane A: doc_001 identity_document
- Extract last_name, first_name, CNP, birth_date, address, doc_number,
  expiry_date.
- Check required fields.
- Check expiry_date against the fixed reference_date 2026-10-28.
- Emit evidence with page and normalized bounding box.

Lane B: doc_002 utility_bill
- Extract customer_name, address, issue_date, period, total_amount.
- Check required fields.
- Check that the document is recent according to the configured rule.
- Compare customer_name and address with the identity document.

Lane C: doc_003 payslip
- Extract employee_name, CNP, employer, employer_cui, issue_date, gross_salary,
  CAS, CASS, income_tax, net_salary.
- Check required fields.
- Calculate gross_salary - CAS - CASS - income_tax.
- Compare the calculated net with net_salary.
- Inspect PDF Producer, Creator, creation date, and modification date.
- Inspect fonts used around salary values.
- Count %%EOF markers and flag more than one.

For each lane, show the result as either PASS or a review flag. Use the clean
case as all PASS. Use the altered payslip case to show R-PF-012 metadata,
R-PF-013 font inconsistency, and R-PF-014 totals inconsistency. Mention the
incremental-save signal as an optional R-PF-015 candidate.
```

## 3. Tamper detection microservice diagram

```text
Create a sequence diagram for Tamper Detection Service only.

Participants:
Case Orchestrator, Tamper Detection API, Metadata Analyzer, Font Analyzer,
Totals Analyzer, PDF Structure Analyzer, Rules Configuration, Evidence Store,
Human Review UI.

Sequence:
1. Orchestrator sends POST /v1/tamper/check with case_id, doc_id, document URI,
   document type, and rules_version.
2. Tamper API validates the request and authorizes read-only document access.
3. Service loads the applicable tamper checks from rules.json.
4. Metadata Analyzer reads Producer, Creator, creation date, and modification
   date.
5. Font Analyzer identifies mixed fonts in the salary line.
6. Totals Analyzer extracts or consumes salary fields and verifies the
   configured arithmetic expression.
7. PDF Structure Analyzer counts %%EOF markers.
8. Service returns a TamperReport containing status, findings, rule_id,
   severity, evidence locations, and confidence.
9. Service writes the report to Evidence Store and emits TamperCheckCompleted.
10. Orchestrator routes critical/high findings to Human Review UI.

Show explicit error paths for invalid PDF, unreadable content, missing fields,
and analyzer timeout. Never convert an analyzer error into PASS.
```

## 4. API and microservices diagram

```text
Create a service contract diagram for a small microservices architecture.
Show REST/JSON APIs and asynchronous events.

API endpoints:
- POST /v1/cases
- POST /v1/cases/{case_id}/documents
- POST /v1/documents/{doc_id}/classify
- POST /v1/documents/{doc_id}/extract
- POST /v1/documents/{doc_id}/tamper/check
- POST /v1/cases/{case_id}/cross-check
- POST /v1/cases/{case_id}/screen
- GET  /v1/cases/{case_id}/risk-draft
- GET  /v1/cases/{case_id}/evidence
- POST /v1/cases/{case_id}/human-decision

For every endpoint show:
- caller;
- request correlation_id and case_id;
- minimal request body;
- response status;
- idempotency key for mutating operations;
- audit event emitted.

Show events:
DocumentUploaded, DocumentClassified, FieldsExtracted,
TamperCheckCompleted, CrossCheckCompleted, ScreeningCompleted,
RiskDraftCreated, HumanReviewRequired, HumanDecisionRecorded.

Use an API Gateway or Orchestrator as the only public entry point. Internal
services communicate over private network access. The human-decision endpoint
must require an authenticated analyst and must not be callable by an AI agent.
```

## 5. Rules-driven processing diagram

```text
Create a pipeline diagram showing that rules.json is configuration, not
hardcoded business logic.

Start with:
rules/rules.json
  -> document_types
  -> fields
  -> checks
  -> severity and evidence requirements

Show the same rules version being loaded by:
1. Document Classification/Extraction Service to know what fields to extract.
2. Tamper Detection Service to know which PDF checks to run.
3. Cross-Document Verification Service to know which fields to compare.
4. Test Harness to compare produced rule IDs with expected_flags.json.

Show output:
ExtractedField {value, raw_text, page, bbox, confidence}
and
Flag {rule_id, severity, document, field, evidence, status}.

Add a configuration validation gate before deployment. A changed rule must
create a new version and must not silently change old test expectations.
```

## 6. Screening and ownership graph diagram

```text
Create a diagram for Person 4's screening and PJ ownership responsibilities.

For PF:
applicant -> Screening Service -> mock sanctions list, mock PEP list,
adverse-media stub -> ScreeningResult -> Risk Draft Service.

For PJ:
company CUI -> Mock ONRC Registry Tool -> legal entity, shareholders,
administrator, ownership percentages.
Declared UBO documents -> Extraction Service -> declared beneficial owners.
Registry shareholders + declared UBOs -> Ownership Graph Service ->
comparison result and missing/contradictory ownership flags.

Show fuzzy name matching with a visible threshold configured in rules.json.
Show match candidates, score, matched list, and analyst review status.
Do not label a fuzzy match as confirmed fraud. Use "potential match".

Show Risk Draft Service combining country, occupation, CAEN code, PEP result,
sanctions result, adverse media, tamper findings, and ownership findings into:
risk_level, reasons[], supporting_flag_ids[], is_draft=true.

The diagram must clearly show that the result goes to Human Review and is not
an automatic approval or rejection.
```

## 7. Human review and audit diagram

```text
Create a state-machine diagram:
intake -> processing -> waiting_client -> review -> decided.

Only an authenticated human analyst may transition review -> decided.
AI agents may append extraction results, findings, evidence, and a draft risk
assessment, but may not write an approval or rejection decision.

For every transition show an immutable audit event containing:
case_id, actor_type, actor_id, service, rules_version, timestamp, input
document hashes, output summary, and evidence references.

Show the analyst viewing:
- original document;
- extracted field;
- bounding box;
- rule that failed;
- plain-language explanation;
- confidence;
- suggested client fix message.

Include an explicit "insufficient confidence / manual review" path.
```

## 8. Diagram consistency instructions

```text
Use the same service names, endpoint names, event names, rule IDs, and case
IDs across every diagram. Use case_0001_pf_gigel_curat for the clean example
and case_0006_pf_gigel_fluturas_talcioc for the altered payslip example.
Use R-PF-012 for PDF metadata, R-PF-013 for font inconsistency, R-PF-014 for
totals inconsistency, and R-PF-015 for the optional incremental-save rule.
Show only synthetic data. Do not copy real bank branding, real identity-card
layouts, or real personal data.
```
