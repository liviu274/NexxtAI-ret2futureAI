import type { AuditEntry, BBox, Case, OwnershipEdge, OwnershipNode, Playbook } from "@/types";

const A4 = { w: 1000, h: 1414 };
const ID = { w: 1000, h: 630 };
const bb = (x: number, y: number, w: number, h: number, page = A4): BBox => ({
  x: x / page.w,
  y: y / page.h,
  width: w / page.w,
  height: h / page.h,
});

const DOCS = "/mocks/docs";

export const casePF: Case = {
  id: "PF-2026-0142",
  customerType: "PF",
  clientName: "Andrei Popescu",
  status: "În analiză",
  createdAt: "27.10.2026",
  processingMs: 48200,
  persons: [{ id: "p1", name: "Andrei Popescu", role: "titular", cnp: "1850312400125" }],
  documents: [
    {
      id: "d-ci",
      type: "Carte de identitate",
      ownerPersonId: "p1",
      fileName: "CI_Popescu_Andrei.jpg",
      pageImages: [`${DOCS}/carte-identitate.svg`],
      status: "cu-probleme",
      extractedFields: [
        { name: "Nume", value: "POPESCU", confidence: 0.99, source: { documentId: "d-ci", page: 0, bbox: bb(340, 145, 200, 40, ID) } },
        { name: "Prenume", value: "ANDREI", confidence: 0.99, source: { documentId: "d-ci", page: 0, bbox: bb(340, 215, 200, 40, ID) } },
        { name: "CNP", value: "1850312400125", confidence: 0.97, source: { documentId: "d-ci", page: 0, bbox: bb(340, 285, 260, 40, ID) } },
        { name: "Domiciliu", value: "Str. Lalelelor nr. 14, Sector 3, București", confidence: 0.93, source: { documentId: "d-ci", page: 0, bbox: bb(340, 355, 560, 40, ID) } },
        { name: "Valabil până la", value: "12.03.2026", confidence: 0.98, source: { documentId: "d-ci", page: 0, bbox: bb(340, 500, 380, 45, ID) } },
      ],
    },
    {
      id: "d-flu",
      type: "Fluturaș de salariu",
      ownerPersonId: "p1",
      fileName: "fluturas_iunie_2026.pdf",
      pageImages: [`${DOCS}/fluturas-salariu.svg`],
      status: "cu-probleme",
      extractedFields: [
        { name: "Angajator", value: "TEHNOSOFT SOLUTIONS SRL", confidence: 0.96, source: { documentId: "d-flu", page: 0, bbox: bb(90, 165, 760, 34) } },
        { name: "Luna", value: "Iunie 2026", confidence: 0.95, source: { documentId: "d-flu", page: 0, bbox: bb(90, 300, 520, 42) } },
        { name: "Total net", value: "9.371 lei", confidence: 0.71, source: { documentId: "d-flu", page: 0, bbox: bb(680, 905, 225, 50) } },
      ],
    },
    {
      id: "d-fact",
      type: "Factură utilități",
      ownerPersonId: "p1",
      fileName: "factura_electrica_oct.pdf",
      pageImages: [`${DOCS}/factura-utilitati.svg`],
      status: "cu-probleme",
      extractedFields: [
        { name: "Data emiterii", value: "05.10.2026", confidence: 0.97, source: { documentId: "d-fact", page: 0, bbox: bb(90, 225, 600, 34) } },
        { name: "Adresă loc de consum", value: "Str. Zambilelor nr. 7, Cluj-Napoca", confidence: 0.94, source: { documentId: "d-fact", page: 0, bbox: bb(90, 325, 780, 40) } },
      ],
    },
  ],
  flags: [
    {
      id: "f1",
      severity: "high",
      title: "Cartea de identitate este expirată",
      ruleId: "R-02",
      ruleText: "Actul de identitate trebuie să fie valabil la data deschiderii dosarului.",
      evidence: [{ documentId: "d-ci", page: 0, bbox: bb(340, 500, 380, 45, ID) }],
      explanation: "Data de valabilitate extrasă este 12.03.2026, anterioară datei dosarului (27.10.2026). Actul a expirat de 229 de zile.",
      clientFixMessage: "Cartea ta de identitate a expirat. Te rugăm să încarci o carte de identitate valabilă.",
    },
    {
      id: "f2",
      severity: "high",
      title: "Posibilă modificare a totalului net pe fluturaș",
      ruleId: "R-07",
      ruleText: "Documentele de venit nu trebuie să prezinte semne de alterare.",
      evidence: [{ documentId: "d-flu", page: 0, bbox: bb(680, 905, 225, 50) }],
      explanation: "Suma recalculată din componente este 7.371 lei, dar documentul afișează 9.371 lei. Fontul și fundalul zonei diferă de restul documentului (font serif peste un dreptunghi alb suprapus).",
      clientFixMessage: "Nu am putut confirma suma de pe fluturaș. Te rugăm să încarci documentul original primit de la angajator.",
    },
    {
      id: "f3",
      severity: "medium",
      title: "Fluturașul de salariu este mai vechi de 30 de zile",
      ruleId: "R-04",
      ruleText: "Dovada de venit trebuie emisă cu cel mult 30 de zile înainte de deschiderea dosarului.",
      evidence: [{ documentId: "d-flu", page: 0, bbox: bb(90, 300, 520, 42) }],
      explanation: "Fluturașul este emis la 30.06.2026, cu 119 zile înainte de data dosarului.",
      clientFixMessage: "Avem nevoie de un fluturaș de salariu din ultima lună. Te rugăm să încarci unul mai recent.",
    },
    {
      id: "f4",
      severity: "medium",
      title: "Adresa diferă între CI și factura de utilități",
      ruleId: "R-05",
      ruleText: "Adresa de domiciliu trebuie confirmată de un document de utilități sau o declarație de reședință.",
      evidence: [
        { documentId: "d-ci", page: 0, bbox: bb(340, 355, 560, 40, ID) },
        { documentId: "d-fact", page: 0, bbox: bb(90, 325, 780, 40) },
      ],
      explanation: "CI: „Str. Lalelelor nr. 14, Sector 3, București”. Factură: „Str. Zambilelor nr. 7, Cluj-Napoca”. Poate fi o reședință diferită — necesită confirmare.",
      clientFixMessage: "Adresa de pe factură nu coincide cu cea din buletin. Dacă locuiești la altă adresă, încarcă o declarație de reședință.",
    },
  ],
  riskDraft: {
    level: "mediu",
    reasons: [
      { factor: "Suspiciune de alterare document", value: "Fluturaș salariu (R-07)", impact: "crește" },
      { factor: "Act de identitate expirat", value: "12.03.2026", impact: "crește" },
      { factor: "Ocupație", value: "Inginer software, angajat", impact: "scade" },
      { factor: "Screening PEP / sancțiuni", value: "Fără potriviri", impact: "scade" },
      { factor: "Venit declarat", value: "7.000 – 10.000 lei / lună", impact: "neutru" },
    ],
  },
};

export const casePJ: Case = {
  id: "PJ-2026-0087",
  customerType: "PJ",
  clientName: "Delta Agro Logistic SRL",
  cui: "40118273",
  status: "În analiză",
  createdAt: "26.10.2026",
  processingMs: 91400,
  persons: [
    { id: "u1", name: "Ioana Marinescu", role: "UBO", ownershipPct: 45 },
    { id: "u2", name: "Radu Constantinescu", role: "UBO", ownershipPct: 30 },
    { id: "a1", name: "Mihai Dumitrescu", role: "administrator", cnp: "1780921410034" },
  ],
  documents: [
    {
      id: "d-onrc",
      type: "Certificat constatator ONRC",
      ownerPersonId: "company",
      fileName: "certificat_constatator_ONRC.pdf",
      pageImages: [`${DOCS}/certificat-onrc.svg`],
      status: "cu-probleme",
      extractedFields: [
        { name: "UBO", value: "Vlad Stan – 25%", confidence: 0.95, source: { documentId: "d-onrc", page: 0, bbox: bb(90, 575, 300, 35) } },
      ],
    },
    {
      id: "d-ext",
      type: "Extras de cont",
      ownerPersonId: "company",
      fileName: "extras_sept_2026.pdf",
      pageImages: [`${DOCS}/extras-cont.svg`],
      status: "valid",
      extractedFields: [],
    },
  ],
  flags: [
    {
      id: "pf1",
      severity: "high",
      title: "Beneficiar real nedeclarat: Vlad Stan (25%)",
      ruleId: "R-11",
      ruleText: "Toți beneficiarii reali (≥25%) trebuie declarați și identificați.",
      evidence: [
        { documentId: "d-onrc", page: 0, bbox: bb(90, 575, 300, 35) },
        { documentId: "d-ext", page: 0, bbox: bb(90, 437, 820, 32) },
      ],
      explanation: "Registrul ONRC indică 3 asociați, dar declarația clientului menționează doar 2. Vlad Stan deține 25% și a primit un transfer de 95.000 lei.",
      clientFixMessage: "Te rugăm să completezi declarația de beneficiari reali cu toți asociații care dețin cel puțin 25%.",
    },
    {
      id: "pf2",
      severity: "medium",
      title: "Potrivire parțială PEP: Mihai Dumitrescu",
      ruleId: "R-14",
      ruleText: "Administratorii și UBO se verifică în listele PEP și de sancțiuni.",
      evidence: [{ documentId: "d-onrc", page: 0, bbox: bb(90, 715, 560, 35) }],
      explanation: "Nume identic cu un fost consilier județean (scor 0,78). Data nașterii nu a putut fi confirmată — necesită verificare manuală.",
      clientFixMessage: "Este posibil să te contactăm pentru câteva informații suplimentare despre administrator.",
    },
  ],
  riskDraft: {
    level: "ridicat",
    reasons: [
      { factor: "UBO nedeclarat", value: "Vlad Stan, 25%", impact: "crește" },
      { factor: "Potrivire PEP parțială", value: "Scor 0,78", impact: "crește" },
      { factor: "Domeniu de activitate", value: "CAEN 4941 – transport marfă", impact: "neutru" },
    ],
  },
};

export const caseClean: Case = {
  id: "PF-2026-0139",
  customerType: "PF",
  clientName: "Elena Vasilescu",
  status: "În analiză",
  createdAt: "25.10.2026",
  processingMs: 31800,
  persons: [{ id: "e1", name: "Elena Vasilescu", role: "titular", cnp: "2900714125847" }],
  documents: [
    { id: "e-ci", type: "Carte de identitate", ownerPersonId: "e1", fileName: "CI_Vasilescu.jpg", pageImages: [`${DOCS}/carte-identitate.svg`], status: "valid", extractedFields: [] },
    { id: "e-fact", type: "Factură utilități", ownerPersonId: "e1", fileName: "factura_enel.pdf", pageImages: [`${DOCS}/factura-utilitati.svg`], status: "valid", extractedFields: [] },
  ],
  flags: [],
  riskDraft: {
    level: "scăzut",
    reasons: [
      { factor: "Documente complete și valide", value: "2 / 2", impact: "scade" },
      { factor: "Screening PEP / sancțiuni", value: "Fără potriviri", impact: "scade" },
    ],
  },
};

export const cases: Case[] = [casePF, casePJ, caseClean];

export const ownershipPJ: { nodes: OwnershipNode[]; edges: OwnershipEdge[] } = {
  nodes: [
    { id: "c", label: "Delta Agro Logistic SRL", kind: "companie", declared: true },
    { id: "u1", label: "Ioana Marinescu", kind: "persoană", declared: true },
    { id: "u2", label: "Radu Constantinescu", kind: "persoană", declared: true },
    { id: "u3", label: "Vlad Stan", kind: "persoană", declared: false },
  ],
  edges: [
    { from: "u1", to: "c", pct: 45 },
    { from: "u2", to: "c", pct: 30 },
    { from: "u3", to: "c", pct: 25 },
  ],
};

export const playbooks: Playbook[] = [
  {
    id: "popriri",
    processName: "Popriri – deschidere cont curent",
    customerType: "PF",
    sourceDocumentText:
      "Procedura P-KYC-12. La deschiderea contului, clientul prezintă un act de identitate valabil. Dovada venitului se acceptă dacă este emisă în ultimele 30 de zile. Adresa de domiciliu se confirmă prin factură de utilități sau declarație de reședință. Documentele care prezintă semne de alterare se resping.",
    rules: [
      { id: "R-02", kind: "valabilitate", text: "Act de identitate valabil la data dosarului", params: { document: "CI", campData: "valabilPana" }, sourceSentence: "clientul prezintă un act de identitate valabil." },
      { id: "R-04", kind: "vechime", text: "Dovada de venit emisă în ultimele 30 de zile", params: { document: "fluturaș", maxZile: 30 }, sourceSentence: "Dovada venitului se acceptă dacă este emisă în ultimele 30 de zile." },
      { id: "R-05", kind: "potrivire", text: "Adresa CI confirmată prin factură sau declarație", params: { campuri: "domiciliu ↔ adresă factură" }, sourceSentence: "Adresa de domiciliu se confirmă prin factură de utilități sau declarație de reședință.", warning: "Formularea nu precizează vechimea maximă a facturii." },
      { id: "R-07", kind: "prag", text: "Fără semne de alterare a documentelor", params: { pragTamper: 0.6 }, sourceSentence: "Documentele care prezintă semne de alterare se resping." },
    ],
  },
];

const t = (s: number) => `27.10.2026 10:14:${String(s).padStart(2, "0")}`;
export const auditLog: AuditEntry[] = [
  { id: "a1", caseId: "PF-2026-0142", timestamp: t(2), actor: "ai", stage: "Clasificare", action: "3 documente clasificate", status: "ok", durationMs: 2100, input: "3 fișiere", output: "CI, fluturaș, factură" },
  { id: "a2", caseId: "PF-2026-0142", timestamp: t(9), actor: "ai", stage: "Extragere", action: "10 câmpuri extrase", status: "ok", durationMs: 7400, input: "3 documente", output: "10 câmpuri, încredere medie 0,93" },
  { id: "a3", caseId: "PF-2026-0142", timestamp: t(15), actor: "ai", stage: "Validare", action: "CI expirată, fluturaș vechi", status: "avertisment", durationMs: 5300, input: "Playbook Popriri", output: "2 flag-uri" },
  { id: "a4", caseId: "PF-2026-0142", timestamp: t(22), actor: "ai", stage: "Verificare încrucișată", action: "Adresă neconcordantă", status: "avertisment", durationMs: 6800, input: "CI ↔ factură", output: "1 flag" },
  { id: "a5", caseId: "PF-2026-0142", timestamp: t(38), actor: "ai", stage: "Detecție alterare", action: "Zonă alterată pe fluturaș", status: "eroare", durationMs: 15200, input: "fluturas_iunie_2026.pdf", output: "Scor alterare 0,87" },
  { id: "a6", caseId: "PF-2026-0142", timestamp: t(44), actor: "ai", stage: "Screening", action: "Fără potriviri PEP/sancțiuni", status: "ok", durationMs: 4600, input: "Andrei Popescu", output: "0 potriviri" },
  { id: "a7", caseId: "PF-2026-0142", timestamp: t(50), actor: "ai", stage: "Propunere de risc", action: "Propunere: mediu", status: "ok", durationMs: 6800, input: "4 flag-uri", output: "Risc mediu" },
];
