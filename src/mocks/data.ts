import type { AuditEntry, Case, Playbook } from "@/types";
// Generated from the SPECIMEN archive (truth.json, pipeline/expected flags, ONRC mock, playbooks).
import specimen from "./specimen.json";
import { createScreeningCase } from "./screening_case";

const order = ["case_pf_12_modificari_combinate", "case_pj_07_procente_diferite", "case_pf_05_adresa_factura_diferita", "case_pf_03_act_expirat", "case_pf_01_factura_lipsa", "case_pf_00_corect_control", "case_pj_06_ubo_diferit", "case_pj_12_probleme_combinate", "case_pj_00_corect_control"];
const rank = (id: string) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };

export const playbooks = specimen.playbooks as unknown as Playbook[];
export const cases: Case[] = (specimen.cases as unknown as Case[]).slice().sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
const cleanCompany = cases.find((c) => c.id === "case_pj_00_corect_control");
const companyPlaybook = playbooks.find((p) => p.id === "pb_cont_pj_v1");
if (cleanCompany && companyPlaybook) cases.push(createScreeningCase(cleanCompany, companyPlaybook));
for (const c of cases) c.screeningSummary ??= { sanctions: 25, pep: 25, news: 50, matches: 0 };

const tamper = ["R-PF-012", "R-PF-013", "R-PF-014", "R-PF-015"];
export const auditLog: AuditEntry[] = cases.flatMap((c) => [
  { id: `${c.id}-intake`, caseId: c.id, timestamp: "28.10.2026 10:14:03.218", actor: "ai", stage: "Primire documente", action: `${c.documents.length} documente primite`, status: "ok", durationMs: 400, input: `${c.documents.length} fișiere SPECIMEN`, output: c.documents.map((d) => d.type).join(", ") },
  ...c.flags.map((f, i) => ({ id: `${f.id}-audit`, caseId: c.id, timestamp: `28.10.2026 10:14:${String(10 + i * 3).padStart(2, "0")}.015`, actor: "ai" as const, stage: f.stage === "screening" ? "Screening" : tamper.includes(f.ruleId) ? "Detectare falsificare" : "Verificare încrucișată", action: f.explanation, status: "avertisment" as const, durationMs: 1200, input: JSON.stringify({ rule: f.ruleId, evidence: f.evidence }, null, 2), output: JSON.stringify({ severity: f.severity, evidence: f.evidence }, null, 2) })),
  { id: `${c.id}-risk`, caseId: c.id, timestamp: "28.10.2026 10:14:39.220", actor: "ai", stage: "Propunere de risc", action: `${c.flags.length} probleme semnalate`, status: "ok", durationMs: 2100, input: `${c.flags.length} flag-uri`, output: c.riskDraft.level },
  { id: `${c.id}-ready`, caseId: c.id, timestamp: "28.10.2026 10:14:41.330", actor: "ai", stage: "Dosar pregătit", action: "Trimis spre analiză umană", status: "ok", durationMs: 100, input: "Dosar SPECIMEN", output: "Decizia finală aparține analistului." },
]);
