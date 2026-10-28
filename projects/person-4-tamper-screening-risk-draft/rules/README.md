# Reguli declarative pentru extracție și verificare

Fișierul principal este [`rules.json`](./rules.json). El este sursa
configurabilă pentru două etape:

```text
PDF / imagine
    │
    ▼
rules.json → ce câmpuri caută extractorul
    │
    ▼
fields extrase + bbox + confidence
    │
    ▼
rules.json → ce comparații și verificări rulează validatorul
    │
    ▼
flaguri cu rule_id, severitate și dovezi
```

## Ce se extrage

`document_types` definește câmpurile obligatorii pentru fiecare tip:

- `identity_document`: nume, CNP, data nașterii, adresă, număr și expirare
- `utility_bill`: nume, adresă, data emiterii, perioadă și total
- `payslip`: angajat, CNP, angajator, CUI, data emiterii, brut, CAS, CASS,
  impozit și net

Extractorul nu trebuie să inventeze câmpuri. Pentru fiecare câmp trebuie să
scrie valoarea, textul original, pagina, bbox-ul și confidence-ul, conform
contractului din [`conventions/CONTRACTS.md`](../../../conventions/CONTRACTS.md).

## Ce se verifică

`checks` definește verificările în ordinea logică a pipeline-ului:

1. `required_present` — există cele trei documente?
2. `required_fields` — există câmpurile obligatorii?
3. `not_expired` — este identitatea valabilă la data de referință?
4. `fields_match` — numele, adresa și CNP-ul corespund între documente?
5. `pdf_metadata` — PDF-ul are metadate de editor suspect?
6. `font_consistency` — suma are alt font?
7. `totals_consistency` — brut minus rețineri este egal cu netul?
8. `incremental_save` — PDF-ul are mai mult de un marker `%%EOF`?

Regulile sunt separate de cod. Pentru a adăuga sau modifica o verificare,
schimbăm `rules.json`, păstrăm `rule_id` stabil și actualizăm testele
`expected_flags.json`. Nu este nevoie să rescriem extractorul.

## Validare

```sh
python3 rules/validate_rules.py
```

Acest script verifică schema configurației. El nu modifică documente și nu ia
decizii de aprobare sau respingere. Decizia finală rămâne umană.

## Legătura cu Gigel Popescu

Setul de date este în [`data/gigel/`](../data/gigel/). Pentru fiecare caz:

- `truth.json` este răspunsul corect al generatorului;
- `expected_flags.json` este oracle-ul detectorului;
- `document-manifest.json` listează documentele și căile lor.

Cazul curat trebuie să producă zero flaguri. Cazul alterat trebuie să producă
`R-PF-012`, `R-PF-013` și `R-PF-014`; `R-PF-015` este pregătit în catalog ca
regulă nouă, dar trebuie adăugat în oracle doar când echipa decide că devine
regulă oficială.