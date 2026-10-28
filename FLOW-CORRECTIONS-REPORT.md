# Raport — corecțiile de flow DosarAI / Raif2Future

Data: 28.10.2026.

Modificările sunt exclusiv în frontend. Backendul a fost citit pentru verificarea contractului. Nu au fost executate comenzi git, nu au fost instalate pachete și nu au fost modificate package.json sau package-lock.json.

## Reverificarea backendului actualizat

Backendul include acum ingest.py, conectat din api.py când FEATHERLESS_API_KEY este configurată: OCR cu cache pe pagină, clasificare, extracție și normalizare de câmpuri, plus identificarea proprietarului documentului. Fără această configurare, documentele încărcate rămân unknown până la clasificarea externă. Erorile OCR sunt returnate cu HTTP 502, iar documentul primit este păstrat pentru reprocesare.

Noul flux folosește bbox [0, 0, 1, 1] pentru poziție necunoscută. Adaptorul frontend a fost ajustat: păstrează documentul și pagina dovezii, dar omite evidențierea când primește acest sentinel. Coordonatele precise existente rămân respectate. Un test nou verifică atât dovezile flagurilor, cât și sursele câmpurilor extrase.

Am citit și comparația ONRC și testele curente: potrivirea persoanelor folosește CNP dacă există pe ambele părți, altfel numele normalizat. Aceste modificări nu adaugă operații pentru îndeplinirea individuală a solicitărilor sau rezoluția screening și nu adaugă verificarea decided în dismiss_flag; limitele de mai jos sunt încă prezente. Nu am executat backendul sau apeluri OCR reale.

## Comportamentul rezultat

### #1 — aceeași sursă pentru ofițer și client

- getClientCaseStatus și getClientPortalCase proiectează rezultatul getCase, inclusiv pentru cele două dosare PJ configurate ca reale. Nu se folosește un endpoint /client-status.
- Proiecțiile sunt construite explicit din câmpurile permise. Portalul nu primește flags, risc, dovezi, date extrase, rezoluții de screening sau note interne. Mesajele pentru solicitări provin din mesajele destinate clientului.
- Adaptorul construiește documentele portalului pentru dosarele reale din documentele și persoanele primite din orchestrator.
- Deciziile și solicitările sunt reflectate în starea clientului. Lista „dosarele mele” își păstrează selecția existentă a dosarelor demo create din portal.
- Cache-urile case, cases, client-status, portal-case, my-portal-cases, audit și screening sunt invalidate împreună. Modificările locale sunt observate prin evenimentele existente de storage; cele reale sunt anunțate prin BroadcastChannel, fără scrieri locale ale dosarului real. Revenirea în tab și verificarea periodică la 15 secunde actualizează și modificările externe și reîncearcă serviciul.

### #2 — dosare închise

- Aprobat și Respins sunt finale; Documente solicitate rămâne editabil.
- Deciziile, cererile noi, ignorarea problemelor, rezoluțiile screening, uploadul/înlocuirea și retrimiterea sunt blocate în UI și în funcțiile API.
- Funcțiile pentru dosarele reale fac un GET actual înainte de mutație. Pentru mock se recitește store-ul după întârzierile simulate și înainte de scriere. Astfel, un dialog sau upload început anterior nu poate suprascrie o finalizare deja salvată.
- Rutele directe ale portalului păstrează vizualizarea, cu inputul de fișier și retrimiterea dezactivate. Dosarul închis este semnalizat. Dosarul și jurnalul rămân accesibile.

### #3 — solicitări separate

- Solicitările persistate folosesc cheia documentului din planul portalului și, unde există, ID-ul flagului. Planul distinge documentele fiecărei persoane.
- Asocierea datelor vechi folosește mesajul documentului, persoana și documentele din dovezi; nu depinde de ID-uri fixe sau de primul flag. O asociere ambiguă rămâne neîndeplinită, fără rezolvare automată.
- Dialogul ofițerului permite alegerea explicită a documentelor suplimentare pentru dosarele mock. O solicitare nouă păstrează solicitările anterioare încă neîndeplinite.
- Un upload acceptat rezolvă numai solicitările legate de cheia respectivă. Un upload respins nu rezolvă nimic. Screeningul și constatările de falsificare fără legătură sunt păstrate.
- Cât timp există solicitări neîndeplinite, starea rămâne Documente solicitate. Mesajele, pasul cerut și navigarea după upload urmăresc solicitările rămase. Revenirea în analiză se face după îndeplinirea tuturor cererilor.
- Datele vechi din localStorage rămân compatibile: câmpul nou este opțional, iar solicitările vechi fără flag folosesc requestedStep. Proiecțiile nu scriu în storage.
- Pentru dosarele reale, uploadul și retrimiterea sunt blocate cu explicație; nu se simulează local îndeplinirea solicitărilor.

### #7 — niciun fallback de scriere pentru dosarele reale

- Lista REAL_CASE_IDS determină sursa independent de disponibilitate, inclusiv după refresh sau un probe inițial eșuat.
- Mutațiile reale folosesc exclusiv orchestratorul. Eșecurile de rețea, timeout și răspunsurile 5xx produc mesajul: „Serviciul de verificare nu răspunde, iar modificările nu au fost salvate.” Nu există toast de succes sau scriere în localStorage după eșec.
- Fallback-ul de citire este păstrat, marcat ca indisponibil și blocat pentru modificări. Lista dosarelor, dosarul, portalul și jurnalul afișează avertizarea relevantă. Jurnalul de fallback este identificat explicit ca demonstrativ.
- Butonul „Reîncearcă conexiunea”, focusul tabului și verificarea periodică permit revenirea fără restart. Dosarele intenționat mock continuă să funcționeze când serviciul real este oprit.

## Verificări finale

Executate după ultimele modificări ale codului:

```text
npx tsc --noEmit -p .
Exit code: 0
Fără diagnostice TypeScript.

npx vitest run
Exit code: 0
Test Files  12 passed (12)
Tests       92 passed (92)
Duration    28.25s
```

Prima rulare Vitest în sandbox a fost blocată înainte de executarea testelor de EPERM la redenumirea cache-ului temporar. Verificarea finală a rulat în afara sandboxului.

Testele folosesc fetch simulat. Setup-ul respinge implicit orice fetch neconfigurat, astfel încât testele să nu contacteze servicii reale. Testele noi acoperă proiecțiile și confidențialitatea, ambele stări finale, recitirea înainte de salvare, solicitările multiple și pentru persoane diferite, uploadul respins, problemele fără legătură, compatibilitatea datelor vechi, indisponibilitatea inițială și ulterioară, revenirea serviciului și absența scrierilor locale la mutațiile reale eșuate. Testele DOM verifică dezactivarea controalelor, dialogul deja deschis, screeningul, rutele directe de upload/rezumat și reîncercarea conexiunii. Testele cache verifică invalidarea tuturor proiecțiilor și mecanismele de sincronizare.

Verificare manuală a codului: contractele și implementarea backendului, ramurile de selecție a sursei și salvare, proiecțiile permise și lipsa importurilor mocks în componente/rute. Nu am efectuat clickuri într-un browser și nu am verificat serviciul real sau două taburi reale; acestea sunt acoperite prin simulări automate, nu printr-un test end-to-end în browser. Nu s-a efectuat verificare vizuală prin capturi de ecran.

## Limite backend păstrate și raportate

1. Există POST /cases/{case_id}/documents, cu parametrul replaces, și POST /cases/{case_id}/process. Nu există însă o operație contractuală de îndeplinire a unei solicitări individuale cu asocierea explicită solicitare–document–persoană. Uploadul declanșează reconcilierea regulilor, nu confirmarea izolată a solicitării. Frontendul blochează acest flow pentru cele două dosare reale, fără simulare în localStorage.
2. dismiss_flag din orchestrator nu verifică starea decided. Frontendul verifică starea prin GET înainte de POST, dar nu poate oferi o tranzacție atomică între aceste două cereri. O finalizare concurentă între GET și POST sau un apel extern direct rămâne o limită de protecție a backendului.
3. Nu există endpoint pentru rezoluția de screening de tip confirmed/dismissed folosită de extensia mock. Funcția API refuză operația pe dosarele reale și nu scrie în mock.

## Fișiere modificate sau adăugate

Toate căile de mai jos sunt relative la frontendul pixel-perfect-replay-22065:

- src/api/client.ts
- src/types/index.ts
- src/lib/review.ts
- src/lib/client-status.ts
- src/lib/orchestrator-adapter.ts
- src/lib/document-requests.ts — nou
- src/lib/case-cache.ts — nou
- src/components/dosar/CaseAvailability.tsx — nou
- src/components/dosar/DecisionBar.tsx
- src/components/dosar/DismissFlag.tsx
- src/components/dosar/ScreeningPanel.tsx
- src/components/dosar/PortalFlow.tsx
- src/components/dosar/AuditTable.tsx
- src/routes/cases.$id.index.tsx
- src/routes/cases.index.tsx
- src/routes/__root.tsx
- src/test/setup.ts
- src/test/orchestrator-client.test.ts
- src/test/orchestrator-adapter.test.ts — test pentru coordonatele OCR fără poziție precisă
- src/test/review-portal.test.ts
- src/test/flow-corrections.test.ts — nou
- src/test/flow-ui.test.tsx — nou
- src/test/case-cache.test.ts — nou
- FLOW-CORRECTIONS-REPORT.md — acest raport, nou
