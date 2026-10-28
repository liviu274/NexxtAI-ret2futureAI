# Setul de reguli UBO

UBO înseamnă beneficiarul real: persoana fizică ce controlează în final o
companie.

Regulile executabile sunt în
[`rules/ubo-rules.json`](../rules/ubo-rules.json). Ele nu sunt hardcodate în
algoritm.

## Ordinea verificărilor

### 1. Verificarea companiei

- compania trebuie să fie `Activ`;
- CUI-ul trebuie să fie prezent;
- codul CAEN trebuie să fie prezent;
- administratorii trebuie să fie listați.

### 2. Verificarea acționarilor

- procentele trebuie să însumeze exact `100.0%`;
- fiecare procent trebuie să fie între `0` și `100`;
- un acționar PJ trebuie să aibă `cui_actionar`;
- CUI-ul acționarului PJ trebuie să existe în registru;
- un acționar PF trebuie să aibă `nume` și `cnp`.

### 3. Construirea lanțului de proprietate

Pornim de la companie și urmărim acționarii PJ până la PF.

Exemplu:

```text
Parent Demo 01 SRL
  └── Holding Demo 01 SRL: 70%
        └── PF 01 A: 60%
```

Controlul indirect este:

```text
70% x 60% = 42%
```

Algoritmul trebuie să oprească și să creeze un flag dacă găsește un ciclu.

### 4. Identificarea UBO

Pragul configurat este `25.0%`.

- PF care deține direct cel puțin 25% este candidat UBO;
- PF care controlează indirect cel puțin 25% este candidat UBO;
- dacă nu se găsește o PF, cazul este incomplet și merge la analiză umană.

### 5. Compararea cu declarația

Comparam:

```text
UBO calculat
vs
UBO declarat
```

Generăm flag dacă:

- UBO-ul calculat lipsește din declarație;
- declarația conține o persoană care nu rezultă din structură;
- procentul declarat nu corespunde;
- numele sau CNP-ul nu corespunde.

### 6. Screening

Pentru UBO și administratori verificăm:

- lista de sancțiuni;
- lista PEP;
- adverse media.

Fuzzy match-ul este doar o posibilă potrivire. Nu înseamnă confirmare.

Formularea corectă este:

```text
Posibilă potrivire — necesită verificare umană.
```

### 7. Risk draft

Risk draft-ul poate folosi:

- ownership mismatch;
- UBO lipsă;
- sancțiuni;
- PEP;
- adverse media;
- țară;
- ocupație;
- cod CAEN.

Rezultatul trebuie să aibă:

```json
{
  "level": "high",
  "reasons": [],
  "is_draft": true
}
```

`is_draft` trebuie să fie mereu `true`. Sistemul nu aprobă, nu respinge și nu
confirmă singur o fraudă. Decizia finală aparține analistului.

## Relația cu fixture-ul nostru

Fișierul
[`ubo-companies.json`](../data/mock-registries/ubo-companies.json) conține
25 de lanțuri de câte două companii. Toate procentele sunt exact `100.0%`, iar
holding-ul din fiecare lanț are doar acționari PF.
