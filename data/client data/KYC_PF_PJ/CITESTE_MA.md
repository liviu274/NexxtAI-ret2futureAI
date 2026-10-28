# KYC - cazuri PF și PJ într-un singur pachet

## Ce conține

- `PF/`: 12 cazuri greșite și un caz corect de control, cu PDF-uri, PNG-uri, truth.json, flag-uri așteptate și rezultate efective.
- `PJ/`: 12 cazuri greșite și un caz corect de control, cu PDF-uri, PNG-uri, date structurate, registru ONRC mock și flag-uri așteptate.
- `CAZURI.md`: inventarul celor 26 de dosare.

Data de referință este 28.10.2026. Toate documentele și datele sunt sintetice, cu marcaj SPECIMEN.

## PF - aliniat la contract și la playbook-ul pb_cont_pf_v1

Dosarele sunt în `PF/data/gigel/cases/`. Fiecare are `case_file.extracted.json` în formatul din `conventions/CONTRACTS.md` (tipuri `id_card`, `proof_of_address`, `payslip`; câmpuri din dicționarul playbook-ului), iar `expected_flags.json` folosește ID-urile din `projects/playbook-builder/fallback/pb_cont_pf_v1.json`. Conversia se face cu `PF/convert_to_contract.py`. Cele 13 dosare au fost rulate prin orchestrator; pentru verificările implementate azi (`required_present`, `not_expired`) rezultatul coincide cu așteptările. Dosarele `case_pf_02` și `case_pf_07` nu au flag așteptat, pentru că procedura PF-ONB-01 nu cere acele verificări. Fișierele pentru pipeline-ul anterior (`rules.json`, `pipeline_result.json`, vechile așteptări) sunt păstrate în `PF/legacy/` și în `legacy/` din fiecare dosar. Detalii în `PF/CITESTE_MA.md`.

## PJ - ce probleme sunt reprezentate

Dosarele sunt în `PJ/cases/` și acoperă certificat lipsă sau prea vechi, act constitutiv lipsă, declarație UBO lipsă, CUI diferit, beneficiar real diferit, procente diferite față de ONRC, act UBO lipsă, act administrator expirat, administrator diferit, specimen delegat lipsă și un caz cu probleme combinate.

Documentele sunt complete în fiecare dosar, în afara celor marcate intenționat drept lipsă. Modificările sunt prezente în PDF, imagine și JSON. Cazul procentelor păstrează suma 100%, dar declarația este 50% / 50%, iar registrul mock este 60% / 40%. Cazul identității UBO verifică explicit documentele fiecărei persoane, nu doar dacă există orice act pentru rolul UBO.

`data/mock_registries/onrc_registry.json` (în rădăcina repo-ului, lângă listele de sancțiuni și PEP) este sursa oficială simulată pentru toate dosarele PJ; verificarea `registry_vs_declaration` din orchestrator o citește după CUI. `PJ/reference/playbook_pj_original.json` este copia playbook-ului PJ din arhiva proiectului; ID-urile flag-urilor provin din acesta, nu sunt inventate.

**PJ nu a fost rulat într-un pipeline al proiectului:** codul trimis implementează doar PF. Pentru PJ am verificat separat coerența datelor, prezența diferențelor intenționate, textul și bounding box-urile din PDF-uri. `fixture_audit.json` reprezintă această verificare de date; nu este un rezultat al aplicației. `expected_flags.json` descrie ce ar trebui să detecteze implementarea PJ.

`case_file.structured.json` păstrează listele de persoane ca liste native. `case_file.extracted.json` este copia compatibilă cu modelul vechi, care serializează listele ca text JSON. `truth.json` păstrează câmpurile și coordonatele. Pipeline-ul PF nu trebuie rulat peste dosarele PJ.

## Folosire

Deschide `docs/` din dosarul ales pentru PDF-uri sau `images/` pentru PNG-uri. Nu încărca aceeași pagină în ambele formate ca două documente distincte. La testare, păstrează împreună documentele și truth.json din același dosar. Pentru PJ folosește registrul mock inclus; modificările intenționate din declarații nu trebuie copiate și în registrul de referință.

OCR-ul nu a fost rulat. Dosarele negative nu sunt declarații despre persoane reale. Nu există decizii automate de aprobare sau respingere.
