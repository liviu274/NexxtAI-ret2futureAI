# Variante PF greșite, compatibile cu pipeline-ul trimis

Pachetul conține 12 dosare cu probleme intenționate și un dosar corect de control. Toate datele sunt fictive, iar documentele sunt marcate SPECIMEN. Data de referință: 28.10.2026.

## Cazuri și rezultate

| Dosar | Problemă | Flag-uri așteptate și obținute | Risc calculat de cod |
|---|---|---|---|
| `case_pf_00_corect_control` | Dosar corect de control | Niciun flag | low |
| `case_pf_01_factura_lipsa` | Lipsește factura de utilități | R-PF-001 | high |
| `case_pf_02_numar_act_lipsa` | Numărul actului nu este înscris | R-PF-002 | high |
| `case_pf_03_act_expirat` | Act de identitate expirat | R-PF-003 | high |
| `case_pf_04_nume_factura_diferit` | Numele din factură diferă de identitate | R-PF-004 | high |
| `case_pf_05_adresa_factura_diferita` | Adresa din factură diferă de identitate | R-PF-004 | high |
| `case_pf_06_nume_fluturas_diferit` | Numele angajatului diferă de identitate | R-PF-005 | high |
| `case_pf_07_cnp_fluturas_diferit` | CNP-ul angajatului diferă de identitate | R-PF-005 | high |
| `case_pf_08_metadate_suspecte` | Fluturaș cu producător PDF suspect | R-PF-012 | critical |
| `case_pf_09_fonturi_amestecate` | Fonturi amestecate pe linia salariului net | R-PF-013 | high |
| `case_pf_10_total_incorect` | Netul afișat nu corespunde calculului | R-PF-014 | high |
| `case_pf_11_salvare_incrementala` | PDF salvat incremental, cu două EOF | R-PF-015 | high |
| `case_pf_12_modificari_combinate` | Metadate, fonturi, total și salvare incrementală suspecte | R-PF-012, R-PF-013, R-PF-014, R-PF-015 | critical |

Risc `high` pentru orice flag necritic și `critical` pentru metadate suspecte reprezintă comportamentul exact al funcției build_risk_draft din codul trimis. Nu este un model de risc bancar validat.

## Ce găsești în fiecare dosar

- `docs/`: documentele PDF. Cazul factură lipsă are intenționat numai două documente; celelalte au trei.
- `images/`: aceleași documente în PNG, randate la 150 dpi. Încarcă PDF-ul sau imaginea, nu ambele ca documente distincte.
- `truth.json`: câmpurile și bounding box-urile pentru documentele prezente în acel dosar.
- `scenario.json`: modificarea intenționată.
- `expected_flags.json` și `expected_result.json`: rezultatul de referință, stabilit înaintea rulării.
- `pipeline_result.json`: rezultatul efectiv obținut prin rularea pipeline-ului.

## Cum le folosești

Dosarele sunt în `data/gigel/cases/`. Copiază unul sau toate în poziția echivalentă din proiect. Rulează scriptul pipeline-ului cu calea dosarului ales. `rules/rules.json` este copia nemodificată a regulilor reale găsite în arhiva proiectului. `data/mock-screening/lists.json` are structura cerută de cod și alte persoane fictive, astfel încât screening-ul nu introduce probleme suplimentare în aceste cazuri.

Cele 11 cazuri simple izolează câte o problemă; ultimul combină cele patru semnale de modificare a fluturașului. Nu am schimbat codul de validare pentru ca testele să treacă. Au fost configurate doar căile fișierelor de intrare pentru rularea locală.

## Ce se schimbă efectiv în documente

Numele, adresa, CNP-ul, data expirării, câmpul omis și suma netă sunt schimbate și în PDF/PNG, și în truth.json. În cazul câmpului lipsă, numărul actului nu este imprimat pe document. CNP-ul diferit este tot un identificator sintetic, cu cifră de control validă; problema este că diferă între documente.

Cazul metadatelor are efectiv `Producer=Adobe Photoshop 25.1`. Aceasta este o metadată simulată, nu o afirmație că s-a folosit acel program. Cazul fonturilor are efectiv două fonturi pe linia netului. Cazul salvării incrementale este un PDF valid cu două revizii și două marcaje EOF, nu doar un text „EOF” adăugat. Cazul combinat le conține pe toate, plus netul greșit.

## Limitele pipeline-ului

Extractorul citește truth.json; testele nu demonstrează funcționarea OCR-ului. Detecția fonturilor din acest cod citește eticheta `font_mix_net_line` din `mutations`; fonturile reale din PDF sunt verificate separat la generare. Bounding box-urile sunt validate separat pe PDF-uri; pipeline-ul nu le verifică. Acest set testează numai PF. Nu am inclus cazuri PJ sau potriviri de screening, pentru că nu sunt implementate ca validări complete în scriptul primit.

`verification/results.json` și `verification/validation.json` conțin sumarul verificărilor. Sunt 38 PDF-uri și 38 PNG-uri. Dosarul corect anterior este păstrat în arhiva lui separată.
