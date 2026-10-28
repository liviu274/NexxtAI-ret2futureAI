# Cazuri PF, aliniate la contract și la pb_cont_pf_v1

Pachetul conține 12 dosare cu probleme intenționate și un dosar corect de control. Toate datele sunt fictive, iar documentele sunt marcate SPECIMEN. Data de referință: 28.10.2026.

## Cazuri și flag-uri așteptate

ID-urile de reguli sunt cele din `projects/playbook-builder/fallback/pb_cont_pf_v1.json`, generat din procedura PF-ONB-01.

| Dosar | Problemă | Flag-uri așteptate | Clauza din procedură |
|---|---|---|---|
| `case_pf_00_corect_control` | Dosar corect de control | Niciun flag | |
| `case_pf_01_factura_lipsa` | Lipsește factura de utilități | R-PF-004 (required_present proof_of_address) | 3.1 |
| `case_pf_02_numar_act_lipsa` | Numărul actului nu este înscris | Niciun flag, în afara procedurii | 2.4, 2.5 |
| `case_pf_03_act_expirat` | Act de identitate expirat | R-PF-002 (not_expired) | 2.3 |
| `case_pf_04_nume_factura_diferit` | Numele din factură diferă de identitate | R-PF-008 (fields_match full_name) | 5.1 |
| `case_pf_05_adresa_factura_diferita` | Adresa din factură diferă de identitate | R-PF-009 (fields_match address) | 5.2 |
| `case_pf_06_nume_fluturas_diferit` | Numele angajatului diferă de identitate | R-PF-008 (fields_match full_name) | 5.1 |
| `case_pf_07_cnp_fluturas_diferit` | CNP-ul angajatului diferă de identitate | Niciun flag, în afara procedurii | 4.3, 5.1 |
| `case_pf_08_metadate_suspecte` | Fluturaș cu producător PDF suspect | R-PF-010 (pdf_metadata) | 6.1 |
| `case_pf_09_fonturi_amestecate` | Fonturi amestecate pe linia salariului net | R-PF-011 (font_consistency) | 6.2 |
| `case_pf_10_total_incorect` | Netul afișat nu corespunde calculului | R-PF-012 (totals_consistency) | 6.3 |
| `case_pf_11_salvare_incrementala` | PDF salvat incremental, cu două EOF | R-PF-010 (pdf_metadata) | 6.1 |
| `case_pf_12_modificari_combinate` | Metadate, fonturi, total și salvare incrementală suspecte | R-PF-010, R-PF-011, R-PF-012 | 6.1–6.3 |

**În afara procedurii.** Procedura cere doar înregistrarea seriei și numărului actului (2.4); numai un CNP ilizibil oprește cererea (2.5). Procedura nu înregistrează CNP-ul de pe fluturaș (4.3) și compară doar numele (5.1). Playbook-ul nu are voie să adauge cerințe pe care procedura nu le conține, deci aceste două dosare nu au flag așteptat. Ele rămân utile ca limite cunoscute, de arătat analistului.

**Salvarea incrementală** nu are o verificare separată în catalog. Ea este un semn de modificare după emitere (6.1), deci intră în `pdf_metadata`: implementarea acestei verificări trebuie să numere și marcajele `%%EOF`, nu doar să citească producătorul.

## Ce găsești în fiecare dosar

- `docs/`: documentele PDF. Cazul factură lipsă are intenționat numai două documente; celelalte au trei. Numele fișierelor păstrează vechile tipuri (`identity_document`, `utility_bill`); tipul valabil este cel din `case_file.extracted.json`.
- `images/`: aceleași documente în PNG, randate la 150 dpi. Încarcă PDF-ul sau imaginea, nu ambele ca documente distincte.
- `case_file.extracted.json`: dosarul în formatul contractului, cu câmpurile cerute de playbook, valori normalizate și bounding box. Se încarcă direct în orchestrator.
- `truth.json`: toate câmpurile adevărate, cu tipurile și numele din contract; câmpurile pe care playbook-ul nu le cere (de exemplu `cas`, `cass`, `income_tax`, CNP-ul de pe fluturaș) sunt păstrate cu numele originale.
- `scenario.json`: modificarea intenționată; `legacy_expected_rule_ids` păstrează vechile ID-uri.
- `expected_flags.json` și `expected_result.json`: rezultatul așteptat pentru pb_cont_pf_v1.
- `legacy/`: fișierele pentru pipeline-ul anterior, inclusiv `pipeline_result.json`.

## Corespondența cu formatul vechi

| Vechi | Contract |
|---|---|
| `identity_document` | `id_card` |
| `utility_bill` | `proof_of_address` |
| `last_name` + `first_name` | `full_name` (bbox-ul cuprinde ambele rânduri) |
| `birth_date` | `date_of_birth` |
| `doc_number` | `series_number` |
| `customer_name`, `employee_name` | `full_name` |
| `cas` + `cass` + `income_tax` | `deductions` (suma) |
| `period.end` (fluturaș) | `period_end` |

Pentru a regenera fișierele: `python convert_to_contract.py` din acest dosar. Scriptul citește mereu din `legacy/`, deci poate fi rulat de mai multe ori.

## Limite

Câmpurile sunt luate din truth.json (`extracted_by: mock_ground_truth_v1`); OCR-ul nu a fost rulat. Orchestratorul implementează azi doar `required_present` și `not_expired`; restul flag-urilor așteptate vor apărea când sunt implementate celelalte verificări. Cazul fonturilor are efectiv două fonturi pe linia netului, iar cazul metadatelor are `Producer=Adobe Photoshop 25.1`, o metadată simulată. `data/mock-screening/lists.json` nu conține persoanele din dosare, deci screening-ul nu adaugă flag-uri.
