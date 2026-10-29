# Playbook builder (Persoana 2, etapa 1 din diagramă)

Transformă o procedură bancară (PDF) într-un playbook JSON conform `CONTRACTS.md`, validat, plus datele pentru ecranul de review.

```
procedură PDF ──► clauses.py ──► builder.py (LLM + validator + o reparare) ──► playbook.json
                                       │                                    └► report.json (ecranul de review)
                                       └── dacă LLM-ul pică: fallback/ (playbook-ul țintă)
```

## Fișiere
| Fișier | Ce face |
|---|---|
| `clauses.py` | PDF → clauze numerotate, cu pagina și secțiunea (fără antete, subsoluri, surse) |
| `builder.py` | Construiește playbook-ul: prompt + apel LLM + validare + o reparare + fallback |
| `validate_playbook.py` | Validatorul: schemă, catalog, enum-uri, dicționar de câmpuri, citate literal din PDF |
| `report.py` | `report.json` pentru ecranul de review: fiecare clauză → reguli/documente sau motivul pentru care nu e automatizată |
| `compare.py` | Compară un playbook generat cu ținta (câte reguli se potrivesc) |
| `server.py` | API-ul HTTP pentru Person 6 |
| `rehearse.py` | Repetiția momentului live: cronometrare + comparare cu ținta |
| `procedures/` | Cele două proceduri (PF-ONB-01, PJ-ONB-01) |
| `fallback/` | Playbook-urile țintă scrise de mână + motivele pentru clauzele neautomatizate |

## Instalare și rulare

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...          # cheia echipei
python builder.py procedures/PJ-ONB-01.pdf   # scrie output/<playbook_id>.json și .report.json
uvicorn server:app --port 8002               # API-ul pentru ecranul de review
```

Variabile de mediu:
- `BUILDER_MODEL`: modelul folosit, implicit `claude-sonnet-5-5`. `claude-haiku-5-5` e mai rapid, dacă timpul e problema.
- `BUILDER_DEADLINE_S`: bugetul total de timp înainte de fallback, implicit 100 de secunde.
- `BUILDER_LLM=mock`: rulează fără rețea, cu playbook-ul țintă ca răspuns. E pentru dezvoltare, nu pentru demo.
- `BUILDER_MOCK_BREAK=1`: în mod mock, primul răspuns e greșit intenționat, ca să se vadă repararea.

## Cum funcționează builder-ul

1. `clauses.py` împarte PDF-ul pe clauze (`2.1`, `2.2`…).
2. LLM-ul primește regulile contractului, catalogul de check-uri, dicționarul de câmpuri, un **exemplu lucrat pe cealaltă procedură** (pentru PJ vede PF și invers, deci nu vede niciodată răspunsul) și clauzele. Răspunde forțat prin tool-ul `emit_playbook`, cu enum-uri pentru check, doc_type, rol, severitate.
3. **LLM-ul citează doar numărul clauzei.** Pagina și citatul sunt copiate de builder din PDF, deci nu pot fi inventate.
4. `validate_playbook.py` verifică totul. Dacă are erori, acestea se trimit înapoi la LLM **o singură dată**.
5. Dacă LLM-ul pică, depășește timpul sau tot greșește, se întoarce playbook-ul țintă din `fallback/`. Raportul spune asta deschis: `generated_by.source = "fallback"`.

`generated_by.source` poate fi: `llm`, `llm_repaired`, `fallback` (și `mock`, `mock_repaired` în dezvoltare).

## API pentru Person 6 (ecranul de review)

| Metodă | Cale | Răspuns |
|---|---|---|
| `POST` | `/playbooks/build` (multipart: `file`, opțional `playbook_id`) | `{"playbook": {...}, "report": {...}}` |
| `GET` | `/playbooks` | lista playbook-urilor construite |
| `GET` | `/playbooks/{id}` | playbook-ul |
| `GET` | `/playbooks/{id}/report` | raportul pentru ecranul de review |

Erori: 415 dacă fișierul nu e PDF, 413 peste 10 MB, 422 dacă nu se poate construi și nu există fallback.

Raportul are câte o intrare pe clauză, gata de afișat cu procedura în stânga și regulile în dreapta:

```json
{
  "clause": "4.4", "page": 2, "section": "4. Reprezentanții legali și delegații",
  "text": "Fiecare reprezentant legal și fiecare delegat depune un specimen de semnătură.",
  "status": "automated",
  "rules": [{"rule_id": "R-PJ-012", "check": "required_present", "applies_to": "administrator", "severity": "high", "description": "..."}],
  "documents": [{"doc_type": "signature_specimen", "applies_to": "administrator"}],
  "reason": null
}
```

`status` poate fi:
- `automated`: are reguli sau documente
- `covered`: acoperită de altă regulă (motivul spune care)
- `manual`: cerință reală fără check în catalog, sau pas uman
- `context`: definiție sau domeniu de aplicare
- `unreviewed`: builder-ul n-a explicat-o; trebuie verificată

`coverage.pct` = (automated + covered) / (total − context), adică ce parte din cerințele reale aplică agentul. Pe procedurile noastre: PF 92%, PJ 92%.

## Repetiția momentului live

```bash
uvicorn server:app --port 8002                          # într-un terminal
python rehearse.py --url http://localhost:8002 --runs 5 # în altul: PJ, de 5 ori, prin HTTP ca în demo
```

Fiecare rulare arată:
- durata
- dacă a fost nevoie de reparare
- acoperirea
- câte reguli se potrivesc cu ținta

La final scrie „READY for the live moment” doar dacă toate rulările au venit de la LLM, sub 120 de secunde.

Înainte de demo:
- Rulați cu exact PDF-ul care va fi încărcat pe scenă.
- Dacă durata e aproape de limită, încercați `BUILDER_MODEL=claude-haiku-5-5`.
- Dacă pe scenă se activează fallback-ul, spuneți-o. Raportul o arată oricum, iar juriul apreciază onestitatea.

## Gărzi de siguranță

- PDF-ul încărcat e tratat ca input nesigur: modelul poate emite doar check-uri din catalog, iar citatele sunt luate din PDF de cod, nu de model. O procedură cu instrucțiuni ascunse nu poate introduce check-uri noi sau citate false.
- Builder-ul nu ia decizii despre clienți; doar descrie regulile.

## Limitări cunoscute

- **Calea cu LLM real n-a fost rulată încă:** mediul în care a fost scris codul nu avea o cheie API. Totul e testat cap-coadă în mod mock (inclusiv repararea și fallback-ul), iar apelul real ajunge la API (cu o cheie invalidă întoarce 401 și cade curat pe fallback). Prima rulare cu cheia echipei: `python rehearse.py --runs 3`.
- SDK-ul Anthropic actual nu mai are parametrul `temperature`, deci răspunsurile pot varia ușor între rulări. Stabilitatea vine din exemplul lucrat, enum-uri și validator; `rehearse.py --runs 5` o măsoară.
- O clauză care trece de pe o pagină pe alta ar pica verificarea citatului. În procedurile actuale nu există niciuna.
