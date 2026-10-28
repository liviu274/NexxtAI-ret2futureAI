# Person 4 — Povestea și use case-urile

## 1. Povestea pe scurt

Un client trimite documente pentru deschiderea unui serviciu bancar. În mod
normal, un angajat trebuie să citească fiecare document, să compare informații
și să caute semne de modificare sau de risc.

Acest proces consumă timp și pot apărea greșeli. Uneori, o valoare dintr-un
document poate fi modificată. Alteori, numele clientului poate semăna cu un
nume dintr-o listă de sancțiuni sau PEP. Pentru o companie, proprietarii
declarați pot fi diferiți de cei găsiți în registru.

Soluția noastră ajută angajatul să găsească aceste semnale mai repede.
Sistemul citește documentele, verifică regulile și pregătește un raport pentru
verificarea umană.

Sistemul nu spune singur că un client este fraudulos și nu aprobă sau respinge
clientul. El doar arată ce a găsit, de ce este important și ce dovezi există.

## 2. Personajele din poveste

### Clientul

Încarcă documentele necesare.

### Sistemul

Extrage informații, verifică documentele, caută semnale suspecte și creează un
draft de risc.

### Analistul bancar

Verifică rezultatele sistemului și ia decizia finală.

### Serviciile externe simulate

În demo folosim surse fictive:

- registru ONRC simulat;
- listă de sancțiuni simulată;
- listă PEP simulată;
- sursă de adverse media simulată.

Nu folosim date reale de clienți.

## 3. Use case principal: verificarea unui dosar PF

### Scop

Sistemul verifică documentele unei persoane fizice și găsește rapid problemele
care trebuie văzute de un analist.

### Exemplu

Gigel Popescu încarcă:

- un document de identitate;
- o factură de utilități;
- un fluturaș de salariu.

### Pașii

1. Clientul încarcă documentele.
2. Sistemul identifică tipul fiecărui document.
3. Sistemul extrage câmpurile definite în `rules.json`.
4. Sistemul verifică dacă toate câmpurile obligatorii există.
5. Sistemul compară numele, adresa și CNP-ul între documente.
6. Sistemul verifică dacă actul de identitate este valabil.
7. Sistemul verifică metadatele PDF-ului.
8. Sistemul verifică dacă fonturile sunt coerente.
9. Sistemul verifică dacă salariul net este calculat corect.
10. Sistemul pregătește un raport cu rezultatele.
11. Analistul vede raportul și documentele originale.
12. Analistul ia decizia finală.

### Rezultat pentru cazul curat

Toate verificările trec. Sistemul nu găsește probleme și trimite dosarul la
verificarea normală a analistului.

### Rezultat pentru cazul cu fluturaș modificat

Sistemul observă:

- metadate PDF suspecte;
- font diferit pe suma netă;
- salariu net care nu corespunde calculului;
- mai multe marcaje `%%EOF`, ca semnal suplimentar.

Sistemul creează flaguri și trimite dosarul la verificare umană.

## 4. Use case: detectarea unui fluturaș modificat

### Scop

Sistemul verifică dacă un fluturaș pare modificat după ce a fost creat.

### Ce verifică

- aplicația care a creat sau modificat PDF-ul;
- data creării și data modificării;
- fonturile folosite în aceleași rânduri;
- calculele dintre brut, CAS, CASS, impozit și net;
- numărul de marcaje `%%EOF`.

### Exemplu

Pe fluturaș apar:

```text
Brut: 8.000 lei
CAS: 2.000 lei
CASS: 800 lei
Impozit: 520 lei
Net afișat: 7.480 lei
```

Calculul corect este:

```text
8.000 - 2.000 - 800 - 520 = 4.680 lei
```

Sistemul nu spune direct „acesta este un document fals”. El spune:

```text
Au fost găsite semnale care necesită verificare umană.
```

### Flaguri

- `R-PF-012`: metadate PDF suspecte;
- `R-PF-013`: font inconsistent;
- `R-PF-014`: totaluri salariale incorecte;
- `R-PF-015`: salvare incrementală, dacă regula este activată.

## 5. Use case: screening pentru persoană fizică

### Scop

Sistemul verifică dacă numele clientului seamănă cu un nume din listele
simulate.

### Pașii

1. Sistemul ia numele extras din documentul de identitate.
2. Screening Service caută în lista de sancțiuni.
3. Screening Service caută în lista PEP.
4. Sistemul verifică sursa simulată de adverse media.
5. Pentru fiecare posibilă potrivire, sistemul calculează un scor de
   asemănare.
6. Sistemul arată numele găsit, scorul și sursa.
7. Analistul decide dacă este aceeași persoană.

### Regula importantă

O potrivire aproximativă nu este o confirmare. Sistemul folosește formularea:

```text
Posibilă potrivire — necesită verificare umană.
```

Nu folosește automat formularea „client sancționat” sau „client fraudulos”.

## 6. Use case: verificarea unei companii PJ

### Scop

Sistemul compară datele declarate de companie cu datele dintr-un registru
ONRC simulat.

### Pașii

1. Compania trimite CUI-ul și documentele sale.
2. Sistemul extrage numele companiei, acționarii, procentele și administratorul.
3. ONRC Mock API este apelat folosind CUI-ul.
4. API-ul returnează datele fictive ale companiei.
5. Sistemul compară datele din documente cu datele din registru.
6. Sistemul construiește un grafic simplu al proprietății.
7. Sistemul identifică beneficiarul real rezultat din procente.
8. Sistemul compară beneficiarul real găsit cu cel declarat.
9. Orice diferență este trimisă la verificare umană.

### Exemplu

Registrul simulat spune:

```text
Ana Popescu — 60%
Ion Ionescu — 40%
```

Declarația companiei listează doar:

```text
Ana Popescu — 60%
```

Sistemul creează un flag:

```text
Beneficiar real lipsă din declarație.
```

Sistemul nu modifică declarația și nu decide singur dacă este fraudă.

## 7. Use case: screening pentru companie

### Scop

Sistemul verifică persoanele importante dintr-o companie.

### Persoane verificate

- beneficiari reali;
- acționari;
- administratori;
- semnatari.

### Verificări

- sancțiuni;
- PEP;
- adverse media;
- țară;
- ocupație;
- cod CAEN;
- coerența cu registrul ONRC simulat.

Rezultatele sunt legate de persoana și documentul relevante, astfel încât
analistul să poată vedea dovada.

## 8. Use case: crearea unui risk draft

### Scop

Sistemul adună toate semnalele într-un rezumat ușor de înțeles.

### Date folosite

- probleme de tamper detection;
- potriviri în liste de sancțiuni;
- potriviri PEP;
- adverse media;
- diferențe între registru și declarație;
- țară;
- ocupație;
- cod CAEN.

### Exemplu de rezultat

```text
Nivel de risc propus: ridicat

Motive:
- există o posibilă potrivire PEP;
- beneficiarul real declarat nu corespunde complet cu registrul;
- codul CAEN este clasificat ca risc ridicat.

Acest rezultat este un draft și trebuie verificat de un analist.
```

### Regula principală

Risk draft nu este decizie.

Sistemul poate produce:

- nivel de risc;
- motive;
- flaguri;
- dovezi;
- recomandare de verificare.

Sistemul nu poate produce singur:

- aprobare;
- respingere;
- confirmare de fraudă;
- confirmare de sancțiune.

## 9. Use case: verificarea umană

### Ce vede analistul

- documentul original;
- câmpul extras;
- zona din document de unde a fost extras câmpul;
- regula încălcată;
- explicația simplă;
- confidence-ul;
- rezultatul verificării;
- sursa informației;
- risk draft-ul.

### Ce poate face analistul

- confirma că semnalul este corect;
- marca semnalul ca fals pozitiv;
- cere documente suplimentare;
- trimite cazul înapoi clientului;
- lua decizia finală conform procedurii.

## 10. Cum folosim microserviciile

Fiecare serviciu are o responsabilitate clară:

```text
Document Intake Service
  primește documentele

Classification Service
  identifică tipul documentului

Extraction Service
  extrage câmpurile din rules.json

Tamper Detection Service
  verifică integritatea PDF-ului

Cross-Document Verification Service
  compară câmpurile între documente

Screening Service
  verifică sancțiuni, PEP și adverse media

ONRC Registry Adapter
  apelează registrul simulat după CUI

Ownership Graph Service
  compară acționarii cu UBO declarat

Risk Draft Service
  creează nivelul de risc și motivele

Case Orchestrator
  coordonează pașii și starea cazului

Human Review UI
  permite decizia analistului
```

Serviciile comunică prin API-uri interne și evenimente. Fiecare operație
primește un `case_id` și un `correlation_id`, astfel încât toate rezultatele
să poată fi urmărite.

## 11. Povestea pentru prezentare

Putem prezenta proiectul astfel:

> Gigel Popescu încarcă documentele pentru verificare. Sistemul nu încearcă
> să înlocuiască analistul. El îl ajută să găsească mai repede problemele.
>
> Mai întâi, sistemul citește documentele și extrage câmpurile importante.
> Apoi verifică dacă datele se potrivesc între documente. Pentru fluturaș,
> verifică metadatele, fonturile și calculele salariale.
>
> Dacă este un caz de companie, sistemul verifică CUI-ul în registrul simulat,
> compară acționarii cu beneficiarul real declarat și verifică persoanele
> importante în listele de sancțiuni și PEP.
>
> La final, sistemul creează un risk draft cu motive clare. Analistul vede
> documentele, dovezile și regulile încălcate. Numai analistul ia decizia
> finală.

## 12. Ce înseamnă succesul

Proiectul este reușit dacă:

- găsește toate cele trei semnale din fluturașul alterat;
- nu generează flaguri false pentru cazul curat;
- arată exact documentul și câmpul problematic;
- explică simplu de ce a apărut flagul;
- detectează diferențe între registru și UBO declarat;
- marchează potrivirile de screening ca posibile potriviri;
- produce un risk draft cu motive;
- păstrează decizia finală la analist;
- folosește doar date sintetice în demo.
