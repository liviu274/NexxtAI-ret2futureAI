# Shared Contracts

Every module reads and writes these four shapes. If you need a new field, add it here first and tell the team. Do not invent fields in your own module.

Examples live next to this file:
- `playbook.example.json`
- `case_file.example.json`
- `extracted_field.example.json`
- `flag.example.json`

---

## 0. Conventions (apply everywhere)

| Thing | Rule | Example |
|---|---|---|
| Keys | `snake_case` | `doc_type` |
| IDs | string, type prefix + number or slug | `case_0001`, `doc_003`, `fld_017`, `flag_002`, `p_1`, `R-PF-001`, `pb_kyc_pf_v1` |
| Dates | ISO `YYYY-MM-DD` | `2025-03-14` |
| Timestamps | ISO 8601 with timezone | `2026-10-28T11:30:00+02:00` |
| Money | object, never a bare number | `{"amount": 6500, "currency": "RON"}` |
| Customer type | `"PF"` (persoană fizică) or `"PJ"` (persoană juridică) | `"PF"` |
| Missing value | `null`, never `""` or `"N/A"` | `"company": null` |
| Bounding box | `[x0, y0, x1, y1]`, normalized 0–1, origin top-left | `[0.62, 0.71, 0.88, 0.75]` |
| Pages | 1-based | `"page": 1` |
| Data | synthetic only, fictional people and companies | |

### Shared enums

**`doc_type`**
- PF: `id_card`, `passport`, `selfie`, `proof_of_address`, `payslip`, `income_certificate`, `bank_statement`
- PJ: `certificat_constatator`, `act_constitutiv`, `ubo_declaration`, `signature_specimen`, `financial_statement`
- Popriri: `garnishment_order`, `release_order`
- `unknown` is used when classification fails.

**`role`** (who a person or document belongs to): `applicant`, `company`, `administrator`, `shareholder`, `ubo`, `signatory`

**`stage`** (pipeline step): `classify`, `extract`, `validate`, `cross_check`, `tamper`, `screening`, `risk`

**`severity`**

| Value | Meaning | Blocks approval? |
|---|---|---|
| `info` | worth knowing, no action | no |
| `low` | minor issue, analyst may ignore | no |
| `medium` | needs analyst attention | no, but must be acknowledged |
| `high` | must be fixed or explained | yes |
| `critical` | possible fraud or sanctions hit | yes, escalate |

---

## 1. Playbook (owner: Person 2)

A machine-readable version of one bank procedure. The Playbook builder generates it from a procedure document. The orchestrator executes it. **It contains no code, only references to checks from the check catalog below.**

| Field | Type | Required | Description |
|---|---|---|---|
| `playbook_id` | string | yes | Unique id, e.g. `pb_kyc_pf_v1` |
| `version` | integer | yes | Increments when regenerated |
| `process_name` | string | yes | Human name of the process |
| `customer_type` | `"PF"` \| `"PJ"` | yes | Which track it runs |
| `source_procedure` | object | yes | `{file, generated_at}`: the document it came from |
| `required_documents` | array | yes | What the file must contain (see below) |
| `rules` | array | yes | Every check to run (see below) |
| `person_flows` | object \| null | PJ only | Which roles also run a natural-person flow, e.g. `{"roles": ["ubo", "administrator"], "playbook_id": "pb_kyc_pf_v1"}` |

**`required_documents[]`**

| Field | Type | Description |
|---|---|---|
| `doc_type` | doc_type | Required document |
| `applies_to` | role | Whose document it is |
| `min_count` | integer | Usually 1; e.g. 3 for payslips |
| `alternatives` | doc_type[] | Accepted substitutes, e.g. passport for id_card |
| `fields` | string[] | Fields the extractor must pull from this document |
| `source_ref` | SourceRef | Where in the procedure this requirement comes from |

**`rules[]`**

| Field | Type | Description |
|---|---|---|
| `rule_id` | string | `R-<PF/PJ/process>-<nnn>`, stable across versions |
| `stage` | stage | When it runs |
| `check` | string | Name from the check catalog, nothing else allowed |
| `params` | object | Inputs for that check (see catalog) |
| `applies_to` | role | Whose documents it checks |
| `severity` | severity | Severity of the flag if it fails |
| `description` | string | Plain-language rule, shown to the analyst |
| `client_fixable` | boolean | Whether the client can fix it by uploading something |
| `fix_message` | string \| null | Template for the client message; `{placeholders}` allowed |
| `source_ref` | SourceRef | Procedure sentence this rule came from (shown on the playbook review screen) |

**SourceRef**: `{"page": 2, "quote": "short sentence from the procedure"}`

### Check catalog

The pipeline implements exactly these checks. The playbook validator rejects anything else.

| `check` | `stage` | `params` | Fails when |
|---|---|---|---|
| `required_present` | validate | `{doc_type, min_count}` | Fewer than `min_count` documents of that type (or alternatives) |
| `not_expired` | validate | `{doc_type, field}` | Date in `field` is before today |
| `max_age_days` | validate | `{doc_type, field, days}` | Document date is older than `days` |
| `field_present` | validate | `{doc_type, field}` | Field was not extracted or is null |
| `fields_match` | cross_check | `{field, doc_types[], mode}`; mode: `exact` \| `normalized` \| `fuzzy` | Values differ across documents |
| `income_vs_deposits` | cross_check | `{tolerance_pct}` | Declared net salary differs from statement deposits by more than the tolerance |
| `registry_vs_declaration` | cross_check | `{}` | UBOs in the registry extract differ from the UBO declaration |
| `pdf_metadata` | tamper | `{}` | Editing software or modification date after issue date |
| `font_consistency` | tamper | `{}` | Mixed fonts inside a single field or line |
| `totals_consistency` | tamper | `{doc_type}` | Lines don't add up to stated totals |
| `sanctions` | screening | `{list}` | Fuzzy name match above threshold |
| `pep` | screening | `{list}` | Person is a PEP or a close associate |
| `adverse_media` | screening | `{}` | Negative news hit (stub in demo) |
| `risk_factors` | risk | `{factors[]}`; factors: `country`, `occupation`, `caen_code`, `pep` | Never fails; produces the risk draft |

---

## 2. Case file (owner: Person 3)

One client's file, from first upload to final decision. It is the single object passed between all stages. Each stage only appends to its own section.

| Field | Type | Written by | Description |
|---|---|---|---|
| `case_id` | string | intake | `case_0001` |
| `playbook_id` | string | intake | Which playbook runs this case |
| `customer_type` | `"PF"` \| `"PJ"` | intake | Must match the playbook |
| `status` | enum | orchestrator | `intake` → `processing` → `waiting_client` → `review` → `decided` |
| `created_at`, `updated_at` | timestamp | orchestrator | |
| `company` | object \| null | extract | PJ only: `{name, cui, registration_number}` |
| `persons[]` | array | classify/extract | `{person_id, role, full_name}`; PJ cases list every UBO, administrator, signatory |
| `documents[]` | array | intake + classify + extract | See below |
| `flags[]` | Flag[] | every stage | Full Flag objects (section 4) |
| `risk_draft` | object \| null | risk | `{level, reasons[]}`, see below |
| `decision` | object \| null | **human only** | `{outcome, decided_by, decided_at, note}`; outcome: `approved` \| `rejected` \| `documents_requested` |

**`documents[]`**

| Field | Type | Description |
|---|---|---|
| `doc_id` | string | `doc_001` |
| `file` | string | Path in storage |
| `mime_type` | string | `application/pdf`, `image/jpeg` |
| `pages` | integer | |
| `uploaded_at` | timestamp | |
| `doc_type` | doc_type | Set by classify |
| `classification_confidence` | number 0–1 | |
| `owner_person_id` | string \| null | Which person it belongs to |
| `fields` | object | Map of field name → ExtractedField (section 3) |

**`risk_draft`**: `{"level": "low" | "medium" | "high", "reasons": [{"text": "...", "flag_ids": ["flag_002"]}], "is_draft": true}`. `is_draft` is always `true`, because the agent never decides.

---

## 3. Extracted field (owner: Person 3)

One value read from one document, with the exact location it came from. The location is what powers evidence-linked flags.

| Field | Type | Description |
|---|---|---|
| `field_id` | string | `fld_001`, unique within the case |
| `name` | string | Field name from the playbook, e.g. `expiry_date` |
| `value` | string \| number \| Money \| null | **Normalized** value: dates ISO, CNP digits only, names in the case as printed, trimmed |
| `value_type` | enum | `string`, `date`, `number`, `money`, `cnp`, `cui`, `address` |
| `raw_text` | string | Exactly as printed on the document |
| `confidence` | number 0–1 | Extractor confidence. Below 0.7 → the extractor also emits an `info` flag for analyst review |
| `source` | object | `{doc_id, page, bbox}`. **Required**: a field without a location cannot be used as evidence |
| `extracted_by` | string | Module + version, e.g. `extractor_v1` |

---

## 4. Flag (owner: Person 1)

One problem found by any stage. It is shown to the analyst, and if `client_fixable`, it is turned into a message for the client.

| Field | Type | Description |
|---|---|---|
| `flag_id` | string | `flag_001` |
| `case_id` | string | |
| `rule_id` | string | The playbook rule that failed. **Every flag must cite a rule** |
| `stage` | stage | Which stage raised it |
| `severity` | severity | Copied from the rule |
| `title` | string | Short, for the list view (max ~60 chars) |
| `explanation` | string | What's wrong, in plain language, for the analyst |
| `evidence[]` | array | `{doc_id, page, bbox, field_id, quote}`; at least one item. The UI highlights these spots |
| `client_fixable` | boolean | Copied from the rule |
| `fix_message` | string \| null | Filled-in client message, no internal details (never mention fraud or sanctions to the client) |
| `status` | enum | `open` → `sent_to_client` → `resolved`, or `dismissed` (analyst only, with note) |
| `created_by` | string | Module name |
| `created_at` | timestamp | |
| `resolution_note` | string \| null | Who resolved or dismissed it and why |

---

## Ownership and change rules

1. The owner of a contract approves any change to it.
2. Breaking changes (rename or remove a field) are announced in the team chat before merging.
3. Adding an optional field only requires updating this file and the example.
4. Everyone tests against the example JSON files until the real module is ready.
