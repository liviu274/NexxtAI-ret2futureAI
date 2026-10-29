# Inventarul cazurilor

| Flux | Dosar | Caz | Flag-uri așteptate | Verificare |
|---|---|---|---|---|
| PF | `case_pf_00_corect_control` | Dosar corect de control | Niciun flag | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_01_factura_lipsa` | Lipsește factura de utilități | R-PF-004 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_02_numar_act_lipsa` | Numărul actului nu este înscris | Niciun flag (în afara procedurii) | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_03_act_expirat` | Act de identitate expirat | R-PF-002 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_04_nume_factura_diferit` | Numele din factură diferă de identitate | R-PF-008 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_05_adresa_factura_diferita` | Adresa din factură diferă de identitate | R-PF-009 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_06_nume_fluturas_diferit` | Numele angajatului diferă de identitate | R-PF-008 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_07_cnp_fluturas_diferit` | CNP-ul angajatului diferă de identitate | R-PF-018 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_08_metadate_suspecte` | Fluturaș cu producător PDF suspect | R-PF-010 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_09_fonturi_amestecate` | Fonturi amestecate pe linia salariului net | R-PF-011 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_10_total_incorect` | Netul afișat nu corespunde calculului | R-PF-012 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_11_salvare_incrementala` | PDF salvat incremental, cu două EOF | R-PF-010 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PF | `case_pf_12_modificari_combinate` | Metadate, fonturi, total și salvare incrementală suspecte | R-PF-010, R-PF-011, R-PF-012 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_00_corect_control` | Dosar PJ corect de control | Niciun flag | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_01_certificat_lipsa` | Lipsește certificatul constatator | R-PJ-001 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_02_certificat_vechi` | Certificatul constatator este mai vechi de 30 de zile | R-PJ-002 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_03_act_constitutiv_lipsa` | Lipsește actul constitutiv | R-PJ-003 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_04_declaratie_ubo_lipsa` | Lipsește declarația UBO | R-PJ-004 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_05_cui_diferit` | CUI diferit în declarația UBO | R-PJ-016 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_06_ubo_diferit` | Un beneficiar real declarat diferă de registrul mock | R-PJ-006 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_07_procente_diferite` | Declarație 50% / 50%, registru mock 60% / 40% | R-PJ-006 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_08_identitate_ubo_lipsa` | Lipsește actul de identitate al unui UBO | R-PJ-007 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_09_act_administrator_expirat` | Actul administratorului este expirat | R-PJ-010 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_10_administrator_diferit` | Administratorul din certificat diferă de actul prezentat | R-PJ-011 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_11_specimen_delegat_lipsa` | Lipsește specimenul de semnătură al delegatului | R-PJ-013 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
| PJ | `case_pj_12_probleme_combinate` | Certificat vechi, UBO diferit, CUI diferit, act expirat și semnatar omis | R-PJ-002, R-PJ-005, R-PJ-006, R-PJ-010, R-PJ-016 | Orchestrator: rezultat = așteptat (`tests/test_dataset.py`) |
