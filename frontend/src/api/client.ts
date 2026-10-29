import type { AuditEntry, Case, OwnershipEdge, OwnershipNode, Playbook, PlaybookRule } from "@/types";
import { resolveEvidence } from "@/lib/dataset";
import { validateScreeningResolution } from "@/lib/screening";
import type { ScreeningMatch } from "@/types/extensions";
import { blockingFlags, isFinalCase, isTamper, riskFromFlags } from "@/lib/review";
import { clearDemoCases, readDemoCases, writeDemoCases } from "./demo-store";
import { ensureDocumentRequests, updateRequestedStep } from "@/lib/document-requests";
import { portalDocumentPlan, simulatePortalResult } from "@/lib/portal";
import type { CustomerType, Person } from "@/types";
import { toClientCaseStatus, toClientPortalCase, type ClientCaseStatus, type ClientPortalCase } from "@/lib/client-status";
import { fromBuilder, type BuilderResult } from "@/lib/playbook-builder";
import { hasRequiredConsent, isValidEmail, isValidPhone, type ClientSession, type Consent, type ConsentId, type IdentityCheck, type Onboarding } from "@/lib/onboarding";

import { fromOrchestratorCase, fromOrchestratorAudit, clientMessagesFor, type OrchestratorCase, type OrchestratorAudit, type AuditLogResult } from "@/lib/orchestrator-adapter";

export const REAL_CASE_IDS = ["case_pj_07_procente_diferite", "case_pj_00_corect_control"] as const;
/** Cases opened from the portal while the orchestrator is up live only in the backend. */
export const LIVE_PREFIX = "live_";
// Every id `GET /cases` returned this session; the backend is the source for these.
const backendIds = new Set<string>(REAL_CASE_IDS);
export const isRealCase = (id: string) => backendIds.has(id) || id.startsWith(LIVE_PREFIX);
const ORCHESTRATOR_BASE = (import.meta.env["VITE_ORCHESTRATOR_URL"] ?? "/api/orch").replace(/\/$/, "");
let availability: Promise<boolean> | undefined;
let backendList: Promise<string[]> | undefined;

/** Ids of every case stored in the orchestrator, or [] when it is down. */
function listBackendIds(): Promise<string[]> {
  return backendList ??= (async () => {
    if (!await orchestratorAvailable()) { backendList = undefined; return []; }
    try {
      const ids = (await orchestratorHttp<{ case_id: string }[]>("/cases")).map((c) => c.case_id);
      for (const id of ids) backendIds.add(id);
      return ids;
    } catch { backendList = undefined; return []; }
  })();
}

export function orchestratorAvailable(retry = false): Promise<boolean> {
  if (retry) { availability = undefined; backendList = undefined; }
  if (typeof window === "undefined") return Promise.resolve(false);
  return availability ??= (async () => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 1500);
    try { return (await fetch(`${ORCHESTRATOR_BASE}/cases`, { signal: abort.signal })).ok; }
    catch { return false; }
    finally { clearTimeout(timer); }
  })();
}
// OCR may perform a vision call for every page, followed by classification/extraction.
const OCR_TIMEOUT_MS = 600_000;
const OCR_UNCONFIRMED = "Serviciul de verificare nu răspunde. Confirmarea procesării nu a fost primită; fișierul poate fi deja salvat. Reîncearcă conexiunea, apoi verificarea dosarului înainte să încarci din nou.";
async function orchestratorHttp<T>(path: string, init?: RequestInit, processing = false): Promise<T> {
  let res: Response;
  const multipart = init?.body instanceof FormData;
  try { res = await fetch(`${ORCHESTRATOR_BASE}${path}`, { ...init, headers: { ...(!multipart ? { "Content-Type": "application/json" } : {}), ...init?.headers }, signal: AbortSignal.timeout(processing ? OCR_TIMEOUT_MS : 10_000) }); }
  catch { availability = Promise.resolve(false); throw new Error(processing ? OCR_UNCONFIRMED : SERVICE_UNAVAILABLE); }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string" ? body.detail : "";
    if (processing && res.status === 502 && detail.startsWith("document processing failed:")) {
      availability = Promise.resolve(true);
      throw new Error("Documentul a fost primit, dar verificarea OCR nu a reușit. Reîncearcă verificarea dosarului fără să încarci fișierul din nou.");
    }
    if (res.status >= 500) { availability = Promise.resolve(false); throw new Error(processing ? OCR_UNCONFIRMED : SERVICE_UNAVAILABLE); }
    if (res.status === 403 && detail.includes("already decided")) throw new Error("Dosarul este închis. Modificările nu mai sunt permise.");
    if (processing) {
      const errors: Record<number, string> = { 413: "Fișierul depășește 10 MB.", 415: "Încarcă un fișier PDF, PNG sau JPEG valid.", 422: "Documentul nu a putut fi citit sau dosarul nu poate fi procesat." };
      if (errors[res.status]) throw new Error(errors[res.status]);
    }
    if (res.status === 403 && path.endsWith("/decision")) {
      throw new Error(detail.includes("unresolved high/critical") ? "Aprobarea este blocată de probleme nerezolvate." : "Decizia nu poate fi înregistrată. Verifică starea dosarului.");
    }
    throw new Error(res.status === 404 ? "Dosarul sau problema nu a fost găsită în backend." : `Acțiunea nu a reușit (eroare ${res.status}).`);
  }
  try {
    const body = await res.json() as T;
    availability = Promise.resolve(true);
    return body;
  } catch { availability = Promise.resolve(false); throw new Error(processing ? OCR_UNCONFIRMED : SERVICE_UNAVAILABLE); }
}
// Which portal step each backend upload came from (doc_id -> step key), so a file the classifier
// did not recognize stays on the step where the client uploaded it.
const UPLOAD_SLOTS_KEY = "raif2future-upload-slots-v1";
function uploadSlots(caseId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return (JSON.parse(window.localStorage.getItem(UPLOAD_SLOTS_KEY) ?? "{}") as Record<string, Record<string, string>>)[caseId] ?? {}; } catch { return {}; }
}
function rememberUploadSlot(caseId: string, docId: string, slotKey: string, replaced?: string) {
  try {
    const all = JSON.parse(window.localStorage.getItem(UPLOAD_SLOTS_KEY) ?? "{}") as Record<string, Record<string, string>>;
    const slots = { ...all[caseId] }; if (replaced) delete slots[replaced];
    for (const [doc, key] of Object.entries(slots)) if (key === slotKey) delete slots[doc];
    slots[docId] = slotKey; all[caseId] = slots;
    window.localStorage.setItem(UPLOAD_SLOTS_KEY, JSON.stringify(all));
  } catch { /* the file then shows as an extra document, as before */ }
}
async function readOrchestratorCase(id: string): Promise<Case | null> {
  if (!await orchestratorAvailable()) return null;
  if (!isRealCase(id) && !(await listBackendIds()).includes(id)) return null;
  try {
    const raw = await orchestratorHttp<OrchestratorCase>(`/cases/${encodeURIComponent(id)}`);
    const m = await mocks();
    const playbook = await getPlaybook(raw.playbook_id);
    return fromOrchestratorCase(raw, m.cases.find((c) => c.id === id), playbook?.rules, playbook?.requiredDocuments, uploadSlots(id));
  } catch { return null; } // Read failures retain the existing demo experience; mutations never silently write to mocks after a failed POST.
}

export const SERVICE_UNAVAILABLE = "Serviciul de verificare nu răspunde, iar modificările nu au fost salvate.";
export function notifyCaseChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("dosarai-demo-change"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("dosarai-cases"); channel.postMessage("changed"); channel.close();
  }
}
function assertEditable(c: Case | null | undefined): asserts c is Case {
  if (!c) throw new Error("Dosarul nu a fost găsit.");
  if (isFinalCase(c.status)) throw new Error("Dosarul este închis. Modificările nu mai sunt permise.");
}
async function mutationCase(id: string, withPortalPlan = false) {
  if (!isRealCase(id) && await orchestratorAvailable()) await listBackendIds();
  if (isRealCase(id)) {
    // Identity selects the source. Always retry a fresh authoritative read before a write.
    const raw = await orchestratorHttp<OrchestratorCase>(`/cases/${encodeURIComponent(id)}`);
    const c = fromOrchestratorCase(raw); assertEditable(c);
    if (withPortalPlan) {
      const playbook = await getPlaybook(raw.playbook_id);
      // Loading the plan is asynchronous: recheck the authoritative status afterwards.
      const latest = await orchestratorHttp<OrchestratorCase>(`/cases/${encodeURIComponent(id)}`);
      const current = fromOrchestratorCase(latest, undefined, playbook?.rules, playbook?.requiredDocuments, uploadSlots(id));
      assertEditable(current); return current;
    }
    return c;
  }
  const m = await mocks(); const c = readDemoCases(m.cases).find((c) => c.id === id);
  assertEditable(c); return c;
}
function mockCase(store: Case[], id: string) {
  const c = store.find((c) => c.id === id); assertEditable(c); return c;
}
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
  const stored = readDemoCases(m.cases);
  if (!await orchestratorAvailable()) return stored.map((c) => isRealCase(c.id) ? { ...c, source: "backend", serviceUnavailable: true } : c);
  const ids = await listBackendIds();
  // Backend cases with a matching fixture keep their place; the rest (portal, other tools) come first.
  const extra = (await Promise.all(ids.filter((id) => !stored.some((c) => c.id === id)).map(readOrchestratorCase))).filter((c): c is Case => !!c);
  return [...extra.reverse(), ...await Promise.all(stored.map(async (c) => isRealCase(c.id) ? await readOrchestratorCase(c.id) ?? { ...c, source: "backend" as const, serviceUnavailable: true } : c))];
}

export async function getCase(id: string): Promise<Case | null> {
  const real = await readOrchestratorCase(id);
  if (real) return real;
  if (!USE_MOCK) return http(`/cases/${id}`);
  const m = await mocks();
  await delay(600);
  const source = readDemoCases(m.cases).find((c) => c.id === id);
  if (!source) return null;
  const c = structuredClone(source);
  if (isRealCase(id)) { c.source = "backend"; c.serviceUnavailable = true; }
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

export async function getAuditLogResult(caseId: string): Promise<AuditLogResult> {
  if (isRealCase(caseId) && await orchestratorAvailable()) {
    try {
      const raw = await orchestratorHttp<OrchestratorAudit>(`/cases/${encodeURIComponent(caseId)}/audit`);
      const c = await getCase(caseId);
      const playbook = c?.playbookId ? await getPlaybook(c.playbookId) : null;
      return fromOrchestratorAudit(raw, playbook?.rules);
    } catch { /* A stopped service falls back to the original mock journal. */ }
  }
  if (!USE_MOCK) return { entries: await http<AuditEntry[]>(`/cases/${caseId}/audit`) };
  const m = await mocks();
  await delay(400);
  return { entries: m.auditLog.filter((a) => a.caseId === caseId), ...(isRealCase(caseId) ? { serviceUnavailable: true } : {}) };
}
// Preserve the array API used by existing consumers; the audit UI also requests integrity metadata.
export async function getAuditLog(caseId: string): Promise<AuditEntry[]> {
  return (await getAuditLogResult(caseId)).entries;
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
  await mutationCase(caseId);
  if (isRealCase(caseId)) throw new Error("Rezoluția screening nu este conectată la serviciul real.");
  validateScreeningResolution(resolution, reason);
  await delay(300);
  if (!USE_MOCK) throw new Error("Screeningul nu este încă conectat la serviciul real.");
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const flag = mockCase(store, caseId).flags.find((item) => item.id === flagId && item.stage === "screening");
  if (!flag) throw new Error("Potrivirea nu a fost găsită.");
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
  const c = await readOrchestratorCase(caseId) ?? m.cases.find((item) => item.id === caseId);
  if (!c?.company || !c.ownership) return { nodes: [], edges: [] };
  return {
    nodes: [{ id: "company", label: c.company.name, kind: "companie", declared: true }, ...c.ownership.registry.map((p): OwnershipNode => ({ id: p.id, label: p.name, kind: "persoană", declared: c.ownership?.declared.some((d) => d.id === p.id) ?? false }))],
    edges: c.ownership.registry.map((p) => ({ from: "company", to: p.id, pct: p.pct })),
  };
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  const built = readBuiltPlaybooks().find((p) => p.id === id);
  if (built) return built;
  if (!USE_MOCK) return http(`/playbooks/${id}`);
  const m = await mocks();
  await delay(400);
  return m.playbooks.find((p) => p.id === (id === "popriri" ? "pb_kyc_pf_v1" : id)) ?? (await orchestratorPlaybooks()).find((p) => p.id === id) ?? null;
}

interface OrchestratorPlaybook {
  playbook_id: string; process_name: string; customer_type: CustomerType;
  required_documents: { doc_type: string }[];
  rules: { rule_id: string; stage: string; check: string; params: Record<string, string | number | boolean>; description: string; source_ref: { quote: string } }[];
}
let backendPlaybooks: Promise<Playbook[]> | undefined;
/** Playbooks the orchestrator runs, for backend cases whose playbook has no fixture. */
function orchestratorPlaybooks(): Promise<Playbook[]> {
  return backendPlaybooks ??= (async () => {
    if (!await orchestratorAvailable()) { backendPlaybooks = undefined; return []; }
    try {
      const kinds: Record<string, PlaybookRule["kind"]> = { required_present: "document-obligatoriu", not_expired: "valabilitate", max_age_days: "vechime", fields_match: "potrivire", sanctions: "screening", pep: "screening", adverse_media: "screening" };
      return (await orchestratorHttp<OrchestratorPlaybook[]>("/playbooks")).map((p) => ({
        id: p.playbook_id, processName: p.process_name, customerType: p.customer_type, sourceDocumentText: "",
        requiredDocuments: [...new Set(p.required_documents.map((d) => d.doc_type))],
        rules: p.rules.map((r) => ({ id: r.rule_id, kind: kinds[r.check] ?? "prag", text: r.description, params: r.params, sourceSentence: r.source_ref.quote })),
      }));
    } catch { backendPlaybooks = undefined; return []; }
  })();
}
/** Backend playbook a new portal case runs on (the same ones the dataset cases use). */
const PORTAL_PLAYBOOKS: Record<CustomerType, string> = { PF: "pb_cont_pf_v1", PJ: "pb_cont_pj_v1" };

export async function listPlaybooks(): Promise<Playbook[]> {
  if (!USE_MOCK) return http("/playbooks");
  const m = await mocks();
  await delay(300);
  // A freshly built playbook replaces the fixture with the same id.
  const built = readBuiltPlaybooks();
  return [...built, ...m.playbooks.filter((p) => !built.some((b) => b.id === p.id))];
}

// The playbook builder is a separate service; it is called for real even while the rest runs on mocks.
const PLAYBOOK_BASE = import.meta.env["VITE_PLAYBOOK_URL"] ?? "/api/playbook";
const BUILD_TIMEOUT_MS = 150_000; // builder deadline is 100 s, then it falls back

export async function buildPlaybook(file: File): Promise<Playbook> {
  const fd = new FormData();
  fd.append("file", file);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), BUILD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PLAYBOOK_BASE}/playbooks/build`, { method: "POST", body: fd, signal: abort.signal });
  } catch {
    throw new Error(abort.signal.aborted ? "Generarea a depășit timpul maxim." : "Serviciul de generare a playbook-urilor nu răspunde. Pornește playbook-builder pe portul 8002.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.json().then((b: { detail?: string }) => b.detail).catch(() => undefined);
    const known: Record<number, string> = { 413: "Procedura depășește 10 MB.", 415: "Încarcă procedura în format PDF.", 422: "Procedura nu a putut fi transformată în playbook." };
    // The proxy answers 500/502 when nothing listens on 8002.
    throw new Error(known[res.status] ?? (res.status >= 500 ? "Serviciul de generare a playbook-urilor nu răspunde. Pornește playbook-builder pe portul 8002." : detail ?? `Eroare server ${res.status}`));
  }
  const playbook = fromBuilder(await res.json() as BuilderResult, file.name);
  writeBuiltPlaybooks([playbook, ...readBuiltPlaybooks().filter((p) => p.id !== playbook.id)]);
  return playbook;
}

const BUILT_KEY = "dosarai-built-playbooks-v1";
function readBuiltPlaybooks(): Playbook[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(BUILT_KEY) ?? "[]") as Playbook[]; } catch { return []; }
}
function writeBuiltPlaybooks(list: Playbook[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(BUILT_KEY, JSON.stringify(list)); } catch { /* storage full or blocked: the build still returns */ }
}

export async function submitDecision(caseId: string, decision: "aprobat" | "respins" | "documente", comment: string, documentKeys: string[] = []) {
  await mutationCase(caseId);
  if (isRealCase(caseId)) {
    const outcomes = { aprobat: "approved", respins: "rejected", documente: "documents_requested" };
    await orchestratorHttp(`/cases/${encodeURIComponent(caseId)}/decision`, { method: "POST", headers: { "X-Analyst": "Elena Radu" }, body: JSON.stringify({ outcome: outcomes[decision], note: comment }) });
    notifyCaseChange(); return { ok: true };
  }
  const c = await getCase(caseId);
  if (!c) throw new Error("Dosarul nu a fost găsit.");
  if (decision === "aprobat" && blockingFlags(c.flags).length) throw new Error("Aprobarea este blocată de probleme nerezolvate.");
  if (!USE_MOCK) return http(`/cases/${caseId}/decision`, { method: "POST", body: JSON.stringify({ decision, comment }) });
  await delay(700);
  const m = await mocks(); const store = readDemoCases(m.cases); const source = mockCase(store, caseId);
  if (decision === "aprobat" && blockingFlags(source.flags).length) throw new Error("Aprobarea este blocată de probleme nerezolvate.");
  if (source) {
    const previousRequests = source.status === "Documente solicitate" ? ensureDocumentRequests(source) : [];
    source.status = decision === "aprobat" ? "Aprobat" : decision === "respins" ? "Respins" : "Documente solicitate";
    if (decision === "documente") for (const f of source.flags) if (f.status === "open" && f.client_fixable) f.status = "sent_to_client";
    if (decision === "documente") {
      const p = m.playbooks.find((p) => p.id === source.playbookId);
      source.portalDocuments ??= portalDocumentPlan(source.customerType, p?.requiredDocuments ?? [], source.persons);
      source.officerNote = comment;
      source.documentRequests = previousRequests;
      delete source.requestedStep;
      if (documentKeys.length) {
        if (documentKeys.some((key) => !source.portalDocuments?.some((d) => d.key === key))) throw new Error("Documentul solicitat nu a fost găsit.");
        source.documentRequests.push(...[...new Set(documentKeys)].map((key) => ({ key, message: comment })));
      }
      const pending = updateRequestedStep(source);
      for (const request of pending) {
        const doc = source.portalDocuments.find((d) => d.key === request.key); if (doc) doc.ok = false;
      }
    }
  }
  writeDemoCases(store);
  return { ok: true };
}

export async function dismissFlag(caseId: string, flagId: string, note: string) {
  if (!note.trim()) throw new Error("Motivul este obligatoriu.");
  await mutationCase(caseId);
  if (isRealCase(caseId)) {
    await orchestratorHttp(`/cases/${encodeURIComponent(caseId)}/flags/${encodeURIComponent(flagId)}/dismiss`, { method: "POST", headers: { "X-Analyst": "Elena Radu" }, body: JSON.stringify({ note: note.trim() }) });
    notifyCaseChange(); return { ok: true };
  }
  if (!USE_MOCK) throw new Error("Ignorarea cu motiv nu este conectată la serviciul real.");
  const m = await mocks(); const store = readDemoCases(m.cases); const f = mockCase(store, caseId).flags.find((f) => f.id === flagId);
  if (!f) throw new Error("Problema nu a fost găsită.");
  f.status = "dismissed"; f.dismissedBy = "Elena Radu"; f.dismissalNote = note.trim();
  if (f.stage === "screening") { f.screeningResolution = "dismissed"; f.screeningReason = note.trim(); }
  writeDemoCases(store);
  m.auditLog.push({ id: `${flagId}-dismiss-${Date.now()}`, caseId, timestamp: "28.10.2026 13:59:00.000", actor: "human", stage: "Revizuire", action: "Problemă ignorată de Elena Radu", status: "ok", durationMs: 0, input: JSON.stringify({ flagId }), output: JSON.stringify({ status: "dismissed", note: note.trim() }) });
  return { ok: true };
}

const MY_LIVE_KEY = "raif2future-my-live-cases-v1";
function readMyLiveCases(): string[] {
 if (typeof window === "undefined") return [];
 try { return JSON.parse(window.localStorage.getItem(MY_LIVE_KEY) ?? "[]") as string[]; } catch { return []; }
}
function rememberLiveCase(id: string) {
 try { window.localStorage.setItem(MY_LIVE_KEY, JSON.stringify([...readMyLiveCases().filter((x) => x !== id), id])); } catch { /* the case still exists in the backend */ }
}
const backendRoles: Record<Person["role"], string> = { titular: "applicant", UBO: "ubo", semnatar: "signatory", administrator: "administrator" };

/** Opens the case in the orchestrator when it is up, so uploads go through OCR and every check; otherwise a local demo case. */
export async function createPortalCase(type: CustomerType, persons: Person[], companyName = ""): Promise<Case> {
 if (await orchestratorAvailable()) {
  const now = new Date().toISOString();
  const raw = await orchestratorHttp<OrchestratorCase>("/cases", { method: "POST", body: JSON.stringify({
   case_id: `${LIVE_PREFIX}${type.toLowerCase()}_${Date.now()}`, playbook_id: PORTAL_PLAYBOOKS[type], customer_type: type,
   created_at: now, updated_at: now, company: type === "PJ" && companyName.trim() ? { name: companyName.trim() } : null,
   persons: persons.map((p) => ({ person_id: p.id, role: backendRoles[p.role], full_name: p.name.trim() })),
  }) });
  backendIds.add(raw.case_id); rememberLiveCase(raw.case_id); notifyCaseChange();
  const playbook = await getPlaybook(raw.playbook_id);
  return fromOrchestratorCase(raw, undefined, playbook?.rules, playbook?.requiredDocuments);
 }
 const m = await mocks(); const p = m.playbooks.find((p) => p.customerType === type);
 if (!p) throw new Error("Documentele necesare nu sunt disponibile.");
 const base = m.cases.find((c) => c.customerType === type && c.id.endsWith("00_corect_control"));
 if (!base) throw new Error("Dosarul nu poate fi început.");
 const c: Case = { ...structuredClone(base), id: `demo_${type.toLowerCase()}_${Date.now()}`, clientName: type === "PF" ? "Mara Exemplu" : base.clientName, status: "Nou", persons, documents: [], flags: [], portalDocuments: portalDocumentPlan(type, p.requiredDocuments ?? [], persons) };
 const store = readDemoCases(m.cases); store.push(c); writeDemoCases(store); return c;
}

/** Client portal only: returns a safe status object, never the full case. */
export async function getClientCaseStatus(caseId: string): Promise<ClientCaseStatus | null> {
  const c = await getCase(caseId);
  if (c && c.status === "Documente solicitate") {
    const p = c.playbookId ? await getPlaybook(c.playbookId) : null;
    c.portalDocuments ??= portalDocumentPlan(c.customerType, p?.requiredDocuments ?? [], c.persons);
  }
  return c ? toClientCaseStatus(c) : null;
}

/** Builds an allowlisted portal view from the same source used by the officer. */
export async function getClientPortalCase(caseId: string): Promise<ClientPortalCase | null> {
 const c = await getCase(caseId);
 if (!c) return null;
 const p = c.playbookId ? await getPlaybook(c.playbookId) : null;
 c.portalDocuments ??= portalDocumentPlan(c.customerType, p?.requiredDocuments ?? [], c.persons);
 if (c.status === "Documente solicitate") updateRequestedStep(c);
 return toClientPortalCase(c, c.portalDocuments);
}

export async function listMyPortalCases(): Promise<ClientPortalCase[]> {
 const m = await mocks();
 const demo = readDemoCases(m.cases).filter((c) => c.id.startsWith("demo_")).map((c) => toClientPortalCase(c, c.portalDocuments ?? []));
 // Cases opened in the backend from this browser; skipped while the service is down.
 const live = await Promise.all(readMyLiveCases().map((id) => getClientPortalCase(id).catch(() => null)));
 return [...live.filter((c): c is ClientPortalCase => !!c), ...demo];
}

export async function checkPortalDocument(caseId: string, step: number, file: File, expectedKey?: string) {
 const current = await mutationCase(caseId, isRealCase(caseId));
 if (file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error("Alege un fișier PDF, JPG sau PNG de cel mult 10 MB.");
 if (isRealCase(caseId)) {
   const slot = current.portalDocuments?.[step - 1];
   if (!slot || (expectedKey && slot.key !== expectedKey)) throw new Error("Lista documentelor s-a schimbat. Reîncarcă pagina înainte să încarci fișierul.");
   const form = new FormData(); form.append("file", file);
   const query = slot.documentId ? `?replaces=${encodeURIComponent(slot.documentId)}` : "";
   try {
     const raw = await orchestratorHttp<OrchestratorCase>(`/cases/${encodeURIComponent(caseId)}/documents${query}`, { method: "POST", body: form }, true);
     const added = raw.documents.filter((d) => !current.documents.some((old) => old.id === d.doc_id));
     const doc = added.length === 1 ? added[0] : undefined;
     if (doc) rememberUploadSlot(caseId, doc.doc_id, slot.key, slot.documentId);
     if (doc?.doc_type === "unknown" && (doc.classification_confidence ?? 0) > 0) return { ok: false, message: `Nu am recunoscut fișierul ca ${slot.label.toLocaleLowerCase("ro")}. Încarcă documentul cerut la acest pas.` };
     if (!doc || doc.doc_type === "unknown" || !Object.keys(doc.fields).length) return { ok: false, message: "Fișierul a fost primit, dar citirea documentului nu este finalizată. Continuă cu verificarea dosarului; dacă problema persistă, contactează banca." };
     if (slot.type !== "unknown" && doc.doc_type !== slot.type) return { ok: false, message: "Fișierul primit nu este tipul de document cerut la acest pas. Încarcă documentul solicitat." };
     if (slot.personId !== undefined && slot.personId !== doc.owner_person_id) return { ok: false, message: "Documentul primit nu a putut fi asociat persoanei cerute la acest pas. Verifică documentul și persoana." };
     const messages = clientMessagesFor(raw, doc.doc_id);
     return messages.length ? { ok: false, message: messages.join(" ") } : { ok: true, message: "Documentul a fost primit și verificat." };
   } finally { notifyCaseChange(); }
 }
 await delay(2300);
 const m = await mocks(); const store = readDemoCases(m.cases); const c = mockCase(store, caseId);
 const p = m.playbooks.find((p) => p.id === c.playbookId);
 c.portalDocuments ??= portalDocumentPlan(c.customerType, p?.requiredDocuments ?? [], c.persons);
 const doc = c.portalDocuments[step - 1]; if (!doc) throw new Error("Documentul nu a fost găsit.");
 if (expectedKey && doc.key !== expectedKey) throw new Error("Lista documentelor s-a schimbat. Reîncarcă pagina înainte să încarci fișierul.");
 const pending = c.status === "Documente solicitate" ? ensureDocumentRequests(c) : [];
 const result = simulatePortalResult(doc.type, file.name);
 doc.fileName = file.name; doc.ok = result.ok;
 doc.officerIssue = doc.type === "payslip" && TAMPERED.test(file.name);
 if (result.ok) for (const request of pending.filter((r) => r.key === doc.key)) {
   request.resolved = true;
   const flag = c.flags.find((f) => f.id === request.flagId);
   if (flag && flag.stage !== "screening" && !isTamper(flag)) flag.status = "resolved";
 }
 if (result.ok) attachDatasetDocument(c, m.cases, doc, file.name);
 c.riskDraft = riskFromFlags(c.flags);
 if (result.ok && c.status === "Documente solicitate") {
   if (!updateRequestedStep(c).length) { c.status = "În analiză"; c.officerNote = ""; }
 }
 writeDemoCases(store); return result;
}

const TAMPERED = /editat|modificat|metadata|metadate|font/i;

// Demo uploads carry no real content, so each accepted file is replaced by the matching SPECIMEN
// document. Name keywords pick the scenario, keeping the officer view repeatable on stage.
function datasetSource(type: string, fileName: string, customerType: CustomerType) {
 const name = fileName.toLocaleLowerCase("ro");
 if (customerType === "PJ") return "case_pj_00_corect_control";
 if (type === "identity_document" && name.includes("expirat")) return "case_pf_03_act_expirat";
 if (type === "utility_bill" && name.includes("adresa")) return "case_pf_05_adresa_factura_diferita";
 if (type === "payslip" && TAMPERED.test(name)) return "case_pf_12_modificari_combinate";
 return "case_pf_00_corect_control";
}

function attachDatasetDocument(c: Case, dataset: Case[], doc: NonNullable<Case["portalDocuments"]>[number], fileName: string) {
 const source = dataset.find((x) => x.id === datasetSource(doc.type, fileName, c.customerType));
 const original = source?.documents.find((d) => d.fileName.includes(doc.type) && (c.customerType === "PF" || !doc.personId || d.ownerPersonId === doc.personId));
 if (!source || !original) return;
 c.documents = [...c.documents.filter((d) => d.id !== original.id), { ...structuredClone(original), fileName }];
 // Findings on the replaced document are re-derived from the new source document.
 c.flags = c.flags.filter((f) => !isTamper(f) || !f.evidence.some((e) => e.documentId === original.id) || (f.personId && doc.personId && f.personId !== doc.personId) || f.status === "dismissed" || f.status === "sent_to_client" || f.status === "resolved");
 const findings = source.flags.filter((f) => isTamper(f) && f.evidence.some((e) => "documentId" in e && e.documentId === original.id));
 for (const f of findings) c.flags.push({ ...structuredClone(f), id: `${c.id}-${f.ruleId}`, status: "open", client_fixable: false, fix_message: null });
}

export async function submitPortalCase(id: string) {
 await mutationCase(id);
 if (isRealCase(id)) {
   try {
     const raw = await orchestratorHttp<OrchestratorCase>(`/cases/${encodeURIComponent(id)}/process`, { method: "POST" }, true);
     if (raw.documents.some((d) => d.doc_type === "unknown" || !Object.keys(d.fields).length)) throw new Error("Citirea unor documente nu este finalizată. Reîncearcă verificarea dosarului; dacă problema persistă, contactează banca.");
     return { ok: true, waitingForDocuments: raw.status === "waiting_client" };
   } finally { notifyCaseChange(); }
 }
 const m = await mocks(); const store = readDemoCases(m.cases); const c = mockCase(store, id);
 if (c.status === "Documente solicitate" && ensureDocumentRequests(c).length) throw new Error("Mai există solicitări de documente neîndeplinite.");
 if (!c.portalDocuments?.length || !c.portalDocuments.every((d) => d.ok)) throw new Error("Încarcă toate documentele înainte de trimitere.");
 c.status = "În analiză"; c.riskDraft = riskFromFlags(c.flags); writeDemoCases(store); return { ok: true };
}

export type GroundTruth = Record<string, { expected_rule_ids: string[]; source: "pipeline" | "date" }>;
/** Planted errors per test case, from the archive's expected_flags.json files. */
export async function getGroundTruth(): Promise<GroundTruth> {
 return (await import("@/mocks/ground-truth.json")).default as GroundTruth;
}

/** Drops every demo change (portal cases, decisions, dismissals) and returns to the SPECIMEN dataset. */
export async function resetDemo() {
 clearDemoCases();
 writeBuiltPlaybooks([]);
 try { for (const k of [ONBOARDING_KEY, SESSION_KEY, MY_LIVE_KEY]) window.localStorage.removeItem(k); } catch { /* nothing stored */ }
 return { ok: true };
}

// Onboarding: no backend endpoint yet (consent, selfie, account), so this browser keeps it.
// The officer reads it through the same functions, so it shows up when both run in one browser (the demo).
const ONBOARDING_KEY = "raif2future-onboarding-v1";
const SESSION_KEY = "raif2future-session-v1";
function readOnboardingStore(): Record<string, Onboarding> {
 if (typeof window === "undefined") return {};
 try { return JSON.parse(window.localStorage.getItem(ONBOARDING_KEY) ?? "{}") as Record<string, Onboarding>; } catch { return {}; }
}
function writeOnboarding(caseId: string, patch: Onboarding) {
 const store = readOnboardingStore(); store[caseId] = { ...store[caseId], ...patch };
 try { window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(store)); }
 catch { throw new Error("Browserul nu a putut salva pasul. Eliberează spațiu sau folosește alt browser."); }
 notifyCaseChange();
}
export async function getOnboarding(caseId: string): Promise<Onboarding> {
 return readOnboardingStore()[caseId] ?? {};
}
function auditOnboarding(caseId: string, action: string, output: unknown) {
 if (isRealCase(caseId)) return; // backend cases keep their own audit chain
 void mocks().then((m) => m.auditLog.push({ id: `${caseId}-onboarding-${Date.now()}`, caseId, timestamp: new Date().toLocaleString("ro-RO").replace(",", "") + ".000", actor: "human", stage: "Încărcări client", action, status: "ok", durationMs: 0, input: "{}", output: JSON.stringify(output) }));
}
export async function saveConsent(caseId: string, items: ConsentId[]) {
 const consent: Consent = { at: new Date().toISOString(), items: [...new Set(items)] };
 if (!hasRequiredConsent(consent)) throw new Error("Bifează acordurile obligatorii ca să continui.");
 writeOnboarding(caseId, { consent });
 auditOnboarding(caseId, "Consimțământ acordat de client", consent);
 return consent;
}
export async function saveIdentityCheck(caseId: string, check: Omit<IdentityCheck, "capturedAt" | "faceMatch">) {
 if (!/^data:image\/(jpeg|png);base64,/.test(check.selfie)) throw new Error("Fotografia nu a putut fi citită. Încearcă din nou.");
 const identity: IdentityCheck = { ...check, capturedAt: new Date().toISOString(), faceMatch: "pending" };
 writeOnboarding(caseId, { identity });
 auditOnboarding(caseId, "Fotografie de verificare a identității primită", { liveness: identity.liveness, fallbackReason: identity.fallbackReason ?? null });
 return identity;
}

/** Demo sign-in: any 6-digit code is accepted. Production uses the bank's own login (SSO or mobile banking). */
export function getSession(): ClientSession | null {
 if (typeof window === "undefined") return null;
 try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as ClientSession | null; } catch { return null; }
}
export async function requestSignInCode(email: string, phone: string) {
 if (!isValidEmail(email)) throw new Error("Adresa de e-mail nu este validă.");
 if (!isValidPhone(phone)) throw new Error("Introdu un număr de mobil românesc, de exemplu 0722 123 456.");
 await delay(600);
 return { sentTo: phone.replace(/[\s.-]/g, "").replace(/\d(?=\d{3})/g, "•") };
}
export async function verifySignInCode(email: string, phone: string, code: string): Promise<ClientSession> {
 if (!/^\d{6}$/.test(code)) throw new Error("Codul are 6 cifre.");
 await delay(500);
 const session: ClientSession = { email: email.trim().toLowerCase(), phone: phone.replace(/[\s.-]/g, ""), createdAt: new Date().toISOString() };
 try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* the session lasts for this page only */ }
 window.dispatchEvent(new Event("raif2future-session-change"));
 return session;
}
export function signOut() {
 try { window.localStorage.removeItem(SESSION_KEY); } catch { /* already gone */ }
 window.dispatchEvent(new Event("raif2future-session-change"));
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
