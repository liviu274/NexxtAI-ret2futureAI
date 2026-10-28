import type { AuditEntry, Case, OwnershipEdge, OwnershipNode, Playbook } from "@/types";
import { resolveEvidence } from "@/lib/dataset";
import { validateScreeningResolution } from "@/lib/screening";
import type { ScreeningMatch } from "@/types/extensions";
import { blockingFlags } from "@/lib/review";
import { readDemoCases, writeDemoCases } from "./demo-store";
import { portalDocumentPlan, simulatePortalResult } from "@/lib/portal";
import type { CustomerType, Person } from "@/types";

export const USE_MOCK = true;
const BASE = import.meta.env["VITE_API_BASE_URL"] ?? "";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Eroare server ${res.status}`);
  return res.json() as Promise<T>;
}

const mocks = () => import("@/mocks/data");

export async function listCases(): Promise<Case[]> {
  if (!USE_MOCK) return http("/cases");
  const m = await mocks();
  await delay(400);
  return readDemoCases(m.cases);
}

export async function getCase(id: string): Promise<Case | null> {
  if (!USE_MOCK) return http(`/cases/${id}`);
  const m = await mocks();
  await delay(600);
  const source = readDemoCases(m.cases).find((c) => c.id === id);
  if (!source) return null;
  const c = structuredClone(source);
  if (id === "case_pj_13_pep_administrator" || id.startsWith("demo_")) return c;
  try {
    const res = await fetch(`/mocks/${id}/truth.json`);
    if (res.ok && res.headers.get("content-type")?.includes("json")) {
      const truth: unknown = await res.json();
      c.flags = c.flags.map((f) => ({ ...f, evidence: f.evidence.map((e) => resolveEvidence(e, f, truth)) }));
    }
  } catch { /* Original fixtures are optional until imported. */ }
  return c;
}

export async function getAuditLog(caseId: string): Promise<AuditEntry[]> {
  if (!USE_MOCK) return http(`/cases/${caseId}/audit`);
  const m = await mocks();
  await delay(400);
  return m.auditLog.filter((a) => a.caseId === caseId);
}

export async function getScreeningMatch(caseId: string, flagId: string): Promise<ScreeningMatch | null> {
  // Mock-only extension: do not invent a future REST endpoint.
  if (!USE_MOCK) throw new Error("Screeningul nu este încă conectat la serviciul real.");
  const [m, lists] = await Promise.all([mocks(), import("@/mocks/screening_lists")]);
  const c = readDemoCases(m.cases).find((item) => item.id === caseId);
  const flag = c?.flags.find((item) => item.id === flagId && item.stage === "screening");
  const evidence = flag?.evidence.find((item) => "list_entry_key" in item);
  if (!evidence || !("list_entry_key" in evidence)) return null;
  const entry = lists.screeningLists.find((item) => item.key === evidence.list_entry_key);
  const person = c?.persons.find((item) => item.id === flag?.screeningPersonId);
  if (!entry || !person) return null;
  return { entry: structuredClone(entry), score: evidence.score, client: { name: person.name, ...(person.birthYear !== undefined ? { birthYear: person.birthYear } : {}), ...(person.citizenship ? { citizenship: person.citizenship } : {}), ...(person.identityDocument ? { identityDocument: person.identityDocument } : {}) } };
}

export async function resolveScreeningMatch(caseId: string, flagId: string, resolution: "confirmed" | "dismissed", reason = "") {
  validateScreeningResolution(resolution, reason);
  if (!USE_MOCK) throw new Error("Screeningul nu este încă conectat la serviciul real.");
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const flag = store.find((item) => item.id === caseId)?.flags.find((item) => item.id === flagId && item.stage === "screening");
  if (!flag) throw new Error("Potrivirea nu a fost găsită.");
  await delay(300);
  flag.screeningResolution = resolution;
  flag.screeningReason = reason.trim();
  if (resolution === "dismissed") { flag.status = "dismissed"; flag.dismissedBy = "Elena Radu"; flag.dismissalNote = reason.trim(); }
  writeDemoCases(store);
  m.auditLog.push({ id: `${flagId}-${Date.now()}`, caseId, timestamp: "28.10.2026 13:50:00.000", actor: "human", stage: "Screening", action: resolution === "confirmed" ? "Potrivire confirmată de ofițer" : "Potrivire ignorată cu motiv", status: "ok", durationMs: 0, input: JSON.stringify({ flagId, evidence: flag.evidence }), output: JSON.stringify({ resolution, reason: reason.trim() }) });
  return { ok: true };
}

export async function getOwnership(caseId: string): Promise<{ nodes: OwnershipNode[]; edges: OwnershipEdge[] }> {
  if (!USE_MOCK) return http(`/cases/${caseId}/ownership`);
  const m = await mocks();
  await delay(300);
  const c = m.cases.find((item) => item.id === caseId);
  if (!c?.company || !c.ownership) return { nodes: [], edges: [] };
  return {
    nodes: [{ id: "company", label: c.company.name, kind: "companie", declared: true }, ...c.ownership.registry.map((p): OwnershipNode => ({ id: p.id, label: p.name, kind: "persoană", declared: c.ownership?.declared.some((d) => d.id === p.id) ?? false }))],
    edges: c.ownership.registry.map((p) => ({ from: "company", to: p.id, pct: p.pct })),
  };
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  if (!USE_MOCK) return http(`/playbooks/${id}`);
  const m = await mocks();
  await delay(400);
  return m.playbooks.find((p) => p.id === (id === "popriri" ? "pb_kyc_pf_v1" : id)) ?? null;
}

export async function listPlaybooks(): Promise<Playbook[]> {
  if (!USE_MOCK) return http("/playbooks");
  const m = await mocks();
  await delay(300);
  return m.playbooks;
}

export async function submitDecision(caseId: string, decision: "aprobat" | "respins" | "documente", comment: string) {
  const c = await getCase(caseId);
  if (!c) throw new Error("Dosarul nu a fost găsit.");
  if (decision === "aprobat" && blockingFlags(c.flags).length) throw new Error("Aprobarea este blocată de probleme nerezolvate.");
  if (!USE_MOCK) return http(`/cases/${caseId}/decision`, { method: "POST", body: JSON.stringify({ decision, comment }) });
  await delay(700);
  const m = await mocks(); const store = readDemoCases(m.cases); const source = store.find((item) => item.id === caseId);
  if (source) {
    source.status = decision === "aprobat" ? "Aprobat" : decision === "respins" ? "Respins" : "Documente solicitate";
    if (decision === "documente") for (const f of source.flags) if (f.status === "open" && f.client_fixable) f.status = "sent_to_client";
    if (decision === "documente") { source.officerNote = comment; source.requestedStep = Math.max(1, (source.portalDocuments ?? []).findIndex((d) => d.type === "utility_bill") + 1); }
  }
  writeDemoCases(store);
  return { ok: true };
}

export async function dismissFlag(caseId: string, flagId: string, note: string) {
  if (!note.trim()) throw new Error("Motivul este obligatoriu.");
  if (!USE_MOCK) throw new Error("Ignorarea cu motiv nu este conectată la serviciul real.");
  const m = await mocks(); const store = readDemoCases(m.cases); const f = store.find((c) => c.id === caseId)?.flags.find((f) => f.id === flagId);
  if (!f) throw new Error("Problema nu a fost găsită.");
  f.status = "dismissed"; f.dismissedBy = "Elena Radu"; f.dismissalNote = note.trim();
  if (f.stage === "screening") { f.screeningResolution = "dismissed"; f.screeningReason = note.trim(); }
  writeDemoCases(store);
  m.auditLog.push({ id: `${flagId}-dismiss-${Date.now()}`, caseId, timestamp: "28.10.2026 13:59:00.000", actor: "human", stage: "Revizuire", action: "Problemă ignorată de Elena Radu", status: "ok", durationMs: 0, input: JSON.stringify({ flagId }), output: JSON.stringify({ status: "dismissed", note: note.trim() }) });
  return { ok: true };
}

export async function createPortalCase(type: CustomerType, persons: Person[]): Promise<Case> {
 const m = await mocks(); const p = m.playbooks.find((p) => p.customerType === type);
 if (!p) throw new Error("Documentele necesare nu sunt disponibile.");
 const base = m.cases.find((c) => c.customerType === type && c.id.endsWith("00_corect_control"));
 if (!base) throw new Error("Dosarul nu poate fi început.");
 const c: Case = { ...structuredClone(base), id: `demo_${type.toLowerCase()}_${Date.now()}`, clientName: type === "PF" ? "Mara Exemplu" : base.clientName, status: "Nou", persons, documents: [], flags: [], portalDocuments: portalDocumentPlan(type, p.requiredDocuments ?? [], persons) };
 const store = readDemoCases(m.cases); store.push(c); writeDemoCases(store); return c;
}

export async function checkPortalDocument(caseId: string, step: number, file: File) {
 const m = await mocks(); const store = readDemoCases(m.cases); const c = store.find((c) => c.id === caseId);
 if (!c) throw new Error("Dosarul nu a fost găsit.");
 const p = m.playbooks.find((p) => p.id === c.playbookId);
 c.portalDocuments ??= portalDocumentPlan(c.customerType, p?.requiredDocuments ?? [], c.persons);
 const doc = c.portalDocuments[step - 1]; if (!doc) throw new Error("Documentul nu a fost găsit.");
 const result = simulatePortalResult(doc.type, file.name);
 await delay(2300);
 doc.fileName = file.name; doc.ok = result.ok;
 doc.officerIssue = doc.type === "payslip" && /editat|modificat|metadata|metadate|font/i.test(file.name);
 if (doc.officerIssue && !c.flags.some((f) => f.id === `${c.id}-edited`)) {
  const f = m.cases[0]?.flags.find((f) => f.ruleId === "R-PF-012");
  if (f) c.flags.push({ ...structuredClone(f), id: `${c.id}-edited`, evidence: [], status: "open", client_fixable: false, fix_message: null });
 }
 if (result.ok && c.status === "Documente solicitate") { c.status = "În analiză"; c.officerNote = ""; for (const f of c.flags) if (f.status === "sent_to_client") f.status = "resolved"; }
 writeDemoCases(store); return result;
}

export async function submitPortalCase(id: string) {
 const m = await mocks(); const store = readDemoCases(m.cases); const c = store.find((c) => c.id === id);
 if (!c?.portalDocuments?.length || !c.portalDocuments.every((d) => d.ok)) throw new Error("Încarcă toate documentele înainte de trimitere.");
 c.status = "În analiză"; writeDemoCases(store); return { ok: true };
}

export async function uploadDocument(file: File): Promise<{ ok: boolean; message: string; severity: "ok" | "medium" | "high" }> {
  if (!USE_MOCK) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    return res.json();
  }
  await delay(1600);
  return { ok: true, severity: "ok", message: "Fișier primit în demonstrația SPECIMEN. Verificarea conținutului nu este conectată." };
}
