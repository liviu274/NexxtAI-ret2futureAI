import type { AuditEntry, Case, OwnershipEdge, OwnershipNode, Playbook } from "@/types";
import { resolveEvidence } from "@/lib/dataset";

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
  const n = file.name.toLowerCase();
  if (n.includes("ci") || n.includes("buletin"))
    return { ok: false, severity: "high", message: "Cartea ta de identitate a expirat. Te rugăm să încarci una valabilă." };
  if (n.includes("flutur"))
    return { ok: false, severity: "medium", message: "Fluturașul este mai vechi de 30 de zile. Încarcă unul din ultima lună." };
  return { ok: true, severity: "ok", message: "Document verificat. Totul arată bine!" };
}
