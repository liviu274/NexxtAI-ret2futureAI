import type { AuditEntry, Case, Document, Flag, Playbook, PlaybookRule, Severity } from "@/types";

const pfRules: [string, PlaybookRule["kind"], string, Severity][] = [
  ["001", "document-obligatoriu", "Toate cele trei documente necesare trebuie să fie încărcate.", "high"],
  ["002", "document-obligatoriu", "Fiecare document trebuie să conțină toate câmpurile declarate pentru tipul său.", "high"],
  ["003", "valabilitate", "Documentul de identitate trebuie să fie valabil la data de referință.", "high"],
  ["004", "potrivire", "Numele și adresa din dovada de adresă trebuie să corespundă cu identitatea.", "medium"],
  ["005", "potrivire", "Fluturașul trebuie să aparțină aceleiași persoane ca documentul de identitate.", "medium"],
  ["012", "prag", "Metadatele fluturașului indică un editor sau o resalvare suspectă.", "critical"],
  ["013", "potrivire", "Valorile salariale din același rând trebuie să folosească stiluri de font coerente.", "high"],
  ["014", "prag", "Netul trebuie să fie brutul minus CAS, CASS și impozitul.", "high"],
  ["015", "prag", "Un PDF final nu ar trebui să conțină mai multe marcaje EOF.", "medium"],
];
const pjKnown: Record<string, string> = {
  "002": "Certificatul constatator trebuie să fie emis în ultimele 30 de zile.",
  "006": "Beneficiarii reali din declarație trebuie să corespundă registrului ONRC.",
  "010": "Actul de identitate al administratorului trebuie să fie valabil.",
  "011": "Administratorul trebuie să corespundă datelor din registru.",
  "013": "Delegatul trebuie să prezinte un specimen de semnătură.",
  "016": "CUI-ul trebuie să corespundă între documente.",
};
export const playbooks: Playbook[] = [
  { id: "pb_kyc_pf_v1", processName: "Verificare KYC · Persoană fizică", customerType: "PF",
    sourceDocumentText: pfRules.map((r) => r[2]).join("\n\n"),
    rules: pfRules.map(([id, kind, text, severity]) => ({ id: `R-PF-${id}`, kind, text, params: { severitate: severity, referinta: "28.10.2026" }, sourceSentence: text })) },
  { id: "pb_cont_pj_v1", processName: "Deschidere cont · Persoană juridică", customerType: "PJ",
    sourceDocumentText: Object.values(pjKnown).join("\n\n"),
    rules: Array.from({ length: 27 }, (_, i) => { const n = String(i + 1).padStart(3, "0"); const text = pjKnown[n]; return { id: `R-PJ-${n}`, kind: n === "002" ? "vechime" : "potrivire", text: text ?? "Descriere în așteptarea fișierului sursă.", params: {}, sourceSentence: text ?? "", ...(text ? {} : { warning: "Sursa regulii nu a fost încă furnizată." }) }; }) },
];
const labels: Record<string, string> = { identity_document: "Act de identitate", utility_bill: "Factură utilități", payslip: "Fluturaș salariu", certificat_constatator: "Certificat constatator", act_constitutiv: "Act constitutiv", ubo_declaration: "Declarație beneficiar real", id_card: "Act de identitate", signature_specimen: "Specimen de semnătură" };
function doc(caseId: string, id: string, kind: string, owner: string): Document {
  const file = `${id}_${kind}`;
  return { id, type: labels[kind] ?? kind, ownerPersonId: owner, fileName: `${file}.pdf`, pageImages: [`/mocks/${caseId}/images/${file}.png`], pdfUrl: `/mocks/${caseId}/${file}.pdf`, status: "valid", extractedFields: [] };
}
function flag(caseId: string, ruleId: string, severity: Severity, explanation: string, documentId?: string, field?: string): Flag {
  const rule = playbooks.flatMap((p) => p.rules).find((r) => r.id === ruleId);
  return { id: `${caseId}-${ruleId}`, severity, title: rule?.text ?? ruleId, ruleId, ruleText: rule?.text ?? "Regulă în așteptarea sursei.", explanation, evidence: documentId ? [{ documentId, page: 0, ...(field ? { field } : {}) }] : [], clientFixMessage: "Te rugăm să încarci documentul original și să clarifici neconcordanța semnalată." };
}
function pf(suffix: string, specs: [string, Severity, string, string?, string?][], waiting = false): Case {
  const id = `case_pf_${suffix}`;
  const flags = specs.map(([r, s, e, d, f]) => flag(id, `R-PF-${r}`, s, e, d, f));
  if (suffix.startsWith("05") && flags[0]) flags[0].evidence.push({ documentId: "doc_001", page: 0, field: "address" });
  const documents = [doc(id, "doc_001", "identity_document", "p_person"), ...(suffix.startsWith("01") ? [] : [doc(id, "doc_002", "utility_bill", "p_person")]), doc(id, "doc_003", "payslip", "p_person")];
  documents.forEach((d) => { if (flags.some((f) => f.evidence.some((e) => e.documentId === d.id))) d.status = "cu-probleme"; });
  return { id, customerType: "PF", clientName: "Mara Exemplu", status: waiting ? "Documente solicitate" : "În analiză", createdAt: "28.10.2026", processingMs: 48200, persons: [{ id: "p_person", name: "Mara Exemplu", role: "titular" }], documents, flags, playbookId: "pb_kyc_pf_v1", riskDraft: { level: flags.some((f) => f.severity === "critical") ? "critical" : flags.some((f) => f.severity === "high") ? "high" : flags.length ? "medium" : "low", reasons: flags.map((f) => ({ factor: f.ruleId, value: f.explanation, impact: "crește" })) } };
}
const registry = [{ id: "p_ubo_1", name: "Tudor Exemplu", pct: 60 }, { id: "p_ubo_2", name: "Irina Model", pct: 40 }];
function pj(suffix: string, ruleIds: string[]): Case {
  const id = `case_pj_${suffix}`;
  const changed = suffix.startsWith("07") || suffix.startsWith("12");
  const declared = changed ? registry.map((p) => ({ ...p, pct: 50 })) : suffix.startsWith("06") ? [registry[0], { id: "p_sign", name: "Victor Test", pct: 40 }].filter((p) => p !== undefined) : registry.map((p) => ({ ...p }));
  const flags = ruleIds.map((r) => flag(id, `R-PJ-${r}`, r === "002" ? "medium" : "high", r === "006" ? changed ? "Declarația indică 50% / 50%; registrul ONRC indică Tudor Exemplu 60% și Irina Model 40%." : "Un beneficiar real declarat diferă de registrul ONRC." : r === "002" ? "Certificatul constatator este mai vechi de 30 de zile." : r === "010" ? "Actul de identitate al administratorului a expirat." : r === "016" ? "CUI-ul diferă între documente." : "Neconcordanță semnalată; detaliile sunt în așteptarea fișierului sursă.", r === "006" ? "doc_003" : r === "010" ? "doc_004" : "doc_001"));
  const documents = [doc(id, "doc_001", "certificat_constatator", "company"), doc(id, "doc_002", "act_constitutiv", "company"), doc(id, "doc_003", "ubo_declaration", "company"), ...["p_admin", "p_ubo_1", "p_ubo_2", "p_sign"].map((p, i) => doc(id, `doc_00${i + 4}`, "id_card", p)), doc(id, "doc_008", "signature_specimen", "p_admin"), doc(id, "doc_009", "signature_specimen", "p_sign")];
  documents.forEach((d) => { if (flags.some((f) => f.evidence.some((e) => e.documentId === d.id))) d.status = "cu-probleme"; });
  return { id, customerType: "PJ", clientName: "Atelier Exemplu Demo SRL", cui: "987654310", status: "În analiză", createdAt: "28.10.2026", processingMs: 91400, persons: [{ id: "p_admin", name: "Daria Model", role: "administrator" }, { id: "p_ubo_1", name: "Tudor Exemplu", role: "UBO", ownershipPct: 60 }, { id: "p_ubo_2", name: "Irina Model", role: "UBO", ownershipPct: 40 }, { id: "p_sign", name: "Victor Test", role: "semnatar" }], documents, flags, playbookId: "pb_cont_pj_v1", company: { name: "Atelier Exemplu Demo SRL", cui: "987654310", registration: "J40/99999/2026", caen: "6201", address: "Str. Modelului nr. 24, București" }, ownership: { registry: registry.map((p) => ({ ...p })), declared }, riskDraft: { level: flags.length ? "high" : "low", reasons: flags.map((f) => ({ factor: f.ruleId, value: f.explanation, impact: "crește" })) } };
}
export const cases: Case[] = [
  pf("12_modificari_combinate", [["012", "critical", "Metadate suspecte: adobe photoshop.", "doc_003"], ["013", "high", "Linia salarială folosește fonturi diferite.", "doc_003", "net_salary"], ["014", "high", "Net calculat: 4680.00 RON; net afișat: 7480.00 RON.", "doc_003", "net_salary"], ["015", "medium", "PDF-ul conține 2 marcaje %%EOF.", "doc_003"]]),
  pj("07_procente_diferite", ["006"]),
  pf("05_adresa_factura_diferita", [["004", "medium", "Datele nu corespund cu documentul de identitate.", "doc_002", "address"]]),
  pf("03_act_expirat", [["003", "high", "Documentul a expirat la 2025-01-15.", "doc_001", "expiry_date"]], true),
  pf("01_factura_lipsa", [["001", "high", "Factura de utilități lipsește."]], true),
  pf("00_corect_control", []),
  pj("06_ubo_diferit", ["006"]),
  pj("12_probleme_combinate", ["002", "005", "006", "010", "016"]),
  pj("00_corect_control", []),
];
export const auditLog: AuditEntry[] = cases.flatMap((c) => [
  { id: `${c.id}-intake`, caseId: c.id, timestamp: "28.10.2026 10:14:03.218", actor: "ai", stage: "Primire documente", action: `${c.documents.length} documente primite`, status: "ok", durationMs: 400, input: `${c.documents.length} fișiere SPECIMEN`, output: c.documents.map((d) => d.type).join(", ") },
  ...c.flags.map((f, i) => ({ id: `${f.id}-audit`, caseId: c.id, timestamp: `28.10.2026 10:14:${String(10 + i * 3).padStart(2, "0")}.015`, actor: "ai" as const, stage: f.ruleId.includes("012") || f.ruleId.includes("013") || f.ruleId.includes("014") || f.ruleId.includes("015") ? "Detectare falsificare" : "Verificare încrucișată", action: f.explanation, status: "avertisment" as const, durationMs: 1200, input: JSON.stringify({ rule: f.ruleId, documents: f.evidence.map((e) => e.documentId) }, null, 2), output: JSON.stringify({ severity: f.severity, evidence: f.evidence }, null, 2) })),
  { id: `${c.id}-risk`, caseId: c.id, timestamp: "28.10.2026 10:14:39.220", actor: "ai", stage: "Propunere de risc", action: `${c.flags.length} probleme semnalate`, status: "ok", durationMs: 2100, input: `${c.flags.length} flag-uri`, output: c.riskDraft.level },
  { id: `${c.id}-ready`, caseId: c.id, timestamp: "28.10.2026 10:14:41.330", actor: "ai", stage: "Dosar pregătit", action: "Trimis spre analiză umană", status: "ok", durationMs: 100, input: "Dosar SPECIMEN", output: "Decizia finală aparține analistului." },
]);
