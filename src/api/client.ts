import type { AuditEntry, Case, OwnershipEdge, OwnershipNode, Playbook } from "@/types";
import { resolveEvidence } from "@/lib/dataset";
import { validateScreeningResolution } from "@/lib/screening";
import type { ScreeningMatch } from "@/types/extensions";

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
  return m.cases;
}

export async function getCase(id: string): Promise<Case | null> {
  if (!USE_MOCK) return http(`/cases/${id}`);
  const m = await mocks();
  await delay(600);
  const source = m.cases.find((c) => c.id === id);
  if (!source) return null;
  const c = structuredClone(source);
  if (id === "case_pj_13_pep_administrator") return c;
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
  const c = m.cases.find((item) => item.id === caseId);
  const flag = c?.flags.find((item) => item.id === flagId && item.stage === "screening");
  const evidence = flag?.evidence.find((item) => "list_entry_key" in item);
  if (!evidence || !("list_entry_key" in evidence)) return null;
  const entry = lists.screeningLists.find((item) => item.key === evidence.list_entry_key);
  const person = c?.persons.find((item) => item.id === flag?.screeningPersonId);
  if (!entry || !person) return null;
  return { entry: structuredClone(entry), score: evidence.score, client: { name: person.name, birthYear: person.birthYear, citizenship: person.citizenship, identityDocument: person.identityDocument } };
}

export async function resolveScreeningMatch(caseId: string, flagId: string, resolution: "confirmed" | "dismissed", reason = "") {
  validateScreeningResolution(resolution, reason);
  if (!USE_MOCK) throw new Error("Screeningul nu este încă conectat la serviciul real.");
  const m = await mocks();
  const flag = m.cases.find((item) => item.id === caseId)?.flags.find((item) => item.id === flagId && item.stage === "screening");
  if (!flag) throw new Error("Potrivirea nu a fost găsită.");
  await delay(300);
  flag.screeningResolution = resolution;
  flag.screeningReason = reason.trim();
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
  if (!USE_MOCK) return http(`/cases/${caseId}/decision`, { method: "POST", body: JSON.stringify({ decision, comment }) });
  await delay(700);
  return { ok: true };
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
