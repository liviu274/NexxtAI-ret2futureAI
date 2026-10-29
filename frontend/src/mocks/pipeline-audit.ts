import type { AuditEntry, Case } from "@/types";
export function fullPipelineAudit(c: Case): AuditEntry[] {
  const rows: AuditEntry[] = [];
  const add = (stage: string, action: string, input: unknown, output: unknown, warning = false, human = false) => rows.push({ id: `${c.id}-pipeline-${rows.length}`, caseId: c.id, timestamp: `28.10.2026 10:14:${String(rows.length + 3).padStart(2, "0")}.218`, actor: human ? "human" : "ai", stage, action, status: warning ? "avertisment" : "ok", durationMs: 400, input: JSON.stringify(input, null, 2), output: JSON.stringify(output, null, 2) });
  for (const d of c.documents) add("Încărcări client", d.fileName, { documentId: d.id }, { received: true }, false, true);
  for (const d of c.documents) add("Clasificare", d.type, { documentId: d.id }, { type: d.type });
  for (const d of c.documents) add("Extracție", `${d.type}: câmpuri extrase`, { documentId: d.id }, d.extractedFields);
  for (const [i, label] of ["Documente obligatorii prezente", "Câmpuri obligatorii prezente", "Act de identitate valabil"].entries()) add("Validare", label, { ruleId: `R-PF-00${i + 1}` }, { passed: true });
  for (const [i, label] of ["Identitate și dovadă de adresă concordante", "Identitate și fluturaș concordante"].entries()) add("Verificare încrucișată", label, { ruleId: `R-PF-00${i + 4}` }, { passed: true });
  for (const f of c.flags) add("Detectare falsificare", f.explanation, { ruleId: f.ruleId }, { severity: f.severity, evidence: f.evidence }, true);
  for (const label of ["Sancțiuni", "PEP", "Presă negativă"]) add("Screening", `${label}: nicio potrivire`, { list: label }, { matches: 0 });
  add("Propunere de risc", "Propunere de risc: Critic", c.flags.map((f) => f.ruleId), c.riskDraft);
  add("Dosar pregătit", "Trimis spre analiză umană", { caseId: c.id }, { automaticDecision: false });
  return rows;
}