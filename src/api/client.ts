import type { AuditEntry, Case, OwnershipEdge, OwnershipNode, Playbook } from "@/types";
import { resolveEvidence } from "@/lib/dataset";
import { validateScreeningResolution } from "@/lib/screening";
import type { ScreeningMatch } from "@/types/extensions";
import { blockingFlags } from "@/lib/review";
import { readDemoCases, writeDemoCases } from "./demo-store";
import { documentLabels, portalDocumentPlan, simulatePortalResult } from "@/lib/portal";
import type { CustomerType, Person } from "@/types";
import { toClientCaseStatus, type ClientCaseStatus } from "@/lib/client-status";
import {
  ACCEPTED,
  dayOf,
  fromPerson,
  portalPlanFor,
  toAuditEntry,
  toCase,
  toCaseStatus,
  toClientStatus,
  toPerson,
  toPlaybook,
  toScreeningMatch,
  type ApiAuditEntry,
  type ApiScreeningMatch,
  type ApiCaseFile,
  type ApiCaseSummary,
  type ApiClientView,
  type ApiOwnership,
  type ApiPlaybook,
  type ApiReport,
} from "./contract";

/** Mock data by default; set VITE_USE_MOCK=false and VITE_API_BASE_URL to use the orchestrator API. */
export const USE_MOCK = import.meta.env["VITE_USE_MOCK"] !== "false";
const BASE = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");
const PLAYBOOK_API = (import.meta.env["VITE_PLAYBOOK_API_BASE_URL"] ?? "").replace(/\/$/, "");
const MOCK_ANALYST = "Elena Radu";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const nowStamp = () => {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

// --- HTTP ------------------------------------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "dosarai-analyst-token";
function readToken(): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Analyst identity: a bearer token when the server has NEXXT_ANALYSTS; otherwise (server in dev mode) a name. */
function staffHeaders(): Record<string, string> {
  const token = readToken();
  return token
    ? { Authorization: `Bearer ${token}` }
    : { "X-Analyst": import.meta.env["VITE_ANALYST_NAME"] ?? MOCK_ANALYST };
}

async function http<T>(
  path: string,
  init: RequestInit = {},
  opts: { staff?: boolean; retry?: boolean } = {},
): Promise<T> {
  const json = typeof init.body === "string" ? { "Content-Type": "application/json" } : {};
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...json,
      ...(opts.staff ? staffHeaders() : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && opts.staff && opts.retry !== false && typeof window !== "undefined") {
    const token = window.prompt("Tokenul tău de analist:")?.trim();
    if (token) {
      try {
        window.sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* token kept only for this call */
      }
      return http(path, init, { ...opts, retry: false });
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string" ? body.detail : `Eroare server ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const orNull = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
};

/** Page images and PDFs need the analyst token too, which <img src> cannot send: fetch them and hand back a blob URL. */
export async function loadAsset(url: string): Promise<string> {
  if (USE_MOCK || !url.startsWith(BASE) || !readToken()) return url;
  const res = await fetch(url, { headers: staffHeaders() });
  if (!res.ok) throw new ApiError(res.status, `Eroare server ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

let playbookCache: Promise<ApiPlaybook[]> | null = null;
const apiPlaybooks = () =>
  (playbookCache ??= http<ApiPlaybook[]>("/playbooks").catch((e) => {
    playbookCache = null;
    throw e;
  }));

async function apiCase(id: string, processingMs?: number): Promise<Case | null> {
  const [c, playbooks] = await Promise.all([
    orNull(http<ApiCaseFile>(`/cases/${encodeURIComponent(id)}`, {}, { staff: true })),
    apiPlaybooks(),
  ]);
  if (!c) return null;
  const ownership =
    c.customer_type === "PJ"
      ? await orNull(
          http<ApiOwnership>(`/cases/${encodeURIComponent(id)}/ownership`, {}, { staff: true }),
        )
      : null;
  return toCase(c, playbooks, BASE, {
    ...(processingMs !== undefined ? { processingMs } : {}),
    ...(ownership ? { ownership } : {}),
  });
}

// --- Client portal state kept in this browser (live mode) ------------------------------------------------------

interface PortalEntry {
  name: string;
  customerType: CustomerType;
  uploaded: Record<string, { docId: string; fileName: string }>;
}
const PORTAL_KEY = "dosarai-live-portal";
function readPortal(): Record<string, PortalEntry> {
  try {
    return JSON.parse(window.localStorage.getItem(PORTAL_KEY) ?? "{}") as Record<
      string,
      PortalEntry
    >;
  } catch {
    return {};
  }
}
function writePortal(state: Record<string, PortalEntry>) {
  try {
    window.localStorage.setItem(PORTAL_KEY, JSON.stringify(state));
  } catch {
    /* the portal still works, without the list of my cases */
  }
}

async function clientView(caseId: string) {
  return http<ApiClientView>(`/cases/${encodeURIComponent(caseId)}/client-status`);
}

async function portalState(caseId: string) {
  const view = await clientView(caseId);
  const playbook = await getPlaybook(view.playbook_id);
  const entry = readPortal()[caseId];
  return { view, playbook, entry, plan: portalPlanFor(view, playbook, entry?.uploaded ?? {}) };
}

// --- Cases -----------------------------------------------------------------------------------------------------

const mocks = () => import("@/mocks/data");

export async function listCases(): Promise<Case[]> {
  if (!USE_MOCK) {
    const summaries = await http<ApiCaseSummary[]>("/cases", {}, { staff: true });
    const cases = await Promise.all(summaries.map((s) => apiCase(s.case_id, s.processing_ms)));
    return cases.filter((c): c is Case => c !== null);
  }
  const m = await mocks();
  await delay(400);
  return readDemoCases(m.cases);
}

export async function getCase(id: string): Promise<Case | null> {
  if (!USE_MOCK) return apiCase(id);
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
      c.flags = c.flags.map((f) => ({
        ...f,
        evidence: f.evidence.map((e) => resolveEvidence(e, f, truth)),
      }));
    }
  } catch {
    /* Original fixtures are optional until imported. */
  }
  return c;
}

/** The client portal's view of its own case: no flags, screening, risk or officer data. */
export async function getPortalCase(caseId: string): Promise<Case | null> {
  if (USE_MOCK) return getCase(caseId);
  const state = await orNull(portalState(caseId));
  if (!state) return null;
  const { view, entry, plan } = state;
  const persons = view.persons.map(toPerson).filter((p): p is Person => p !== null);
  const firstOpen = plan.findIndex((d) => !d.ok) + 1;
  return {
    id: view.case_id,
    customerType: view.customer_type,
    clientName: entry?.name ?? persons[0]?.name ?? view.case_id,
    status: toCaseStatus(view.status, view.decision, view.documents.length),
    createdAt: dayOf(view.created_at),
    processingMs: 0,
    persons,
    documents: [],
    flags: [],
    riskDraft: { level: "low", reasons: [] },
    playbookId: view.playbook_id,
    portalDocuments: plan,
    ...(view.status === "waiting_client" && firstOpen ? { requestedStep: firstOpen } : {}),
    ...(view.request_note ? { officerNote: view.request_note } : {}),
  };
}

export async function getAuditLog(caseId: string): Promise<AuditEntry[]> {
  if (!USE_MOCK)
    return (
      await http<{ entries: ApiAuditEntry[] }>(
        `/cases/${encodeURIComponent(caseId)}/audit`,
        {},
        { staff: true },
      )
    ).entries.map(toAuditEntry);
  const m = await mocks();
  await delay(400);
  return m.auditLog.filter((a) => a.caseId === caseId);
}

/** Whether the audit hash chain verifies (append-only, nothing edited or cut off). */
export async function getAuditChainValid(caseId: string): Promise<boolean> {
  if (USE_MOCK) return true;
  return (
    await http<{ chain_valid: boolean }>(
      `/cases/${encodeURIComponent(caseId)}/audit`,
      {},
      { staff: true },
    )
  ).chain_valid;
}

export async function getScreeningMatch(
  caseId: string,
  flagId: string,
): Promise<ScreeningMatch | null> {
  if (!USE_MOCK) {
    const m = await orNull(
      http<ApiScreeningMatch>(
        `/cases/${encodeURIComponent(caseId)}/flags/${encodeURIComponent(flagId)}/screening`,
        {},
        { staff: true },
      ),
    );
    return m ? toScreeningMatch(m) : null;
  }
  const [m, lists] = await Promise.all([mocks(), import("@/mocks/screening_lists")]);
  const c = readDemoCases(m.cases).find((item) => item.id === caseId);
  const flag = c?.flags.find((item) => item.id === flagId && item.stage === "screening");
  const evidence = flag?.evidence.find((item) => "list_entry_key" in item);
  if (!evidence || !("list_entry_key" in evidence)) return null;
  const entry = lists.screeningLists.find((item) => item.key === evidence.list_entry_key);
  const person = c?.persons.find((item) => item.id === flag?.screeningPersonId);
  if (!entry || !person) return null;
  return {
    entry: structuredClone(entry),
    score: evidence.score,
    client: {
      name: person.name,
      ...(person.birthYear !== undefined ? { birthYear: person.birthYear } : {}),
      ...(person.citizenship ? { citizenship: person.citizenship } : {}),
      ...(person.identityDocument ? { identityDocument: person.identityDocument } : {}),
    },
  };
}

export async function resolveScreeningMatch(
  caseId: string,
  flagId: string,
  resolution: "confirmed" | "dismissed",
  reason = "",
): Promise<{ ok: boolean; pending?: boolean; message?: string }> {
  validateScreeningResolution(resolution, reason);
  if (!USE_MOCK) {
    if (resolution === "dismissed") return dismissFlag(caseId, flagId, reason);
    await http(
      `/cases/${encodeURIComponent(caseId)}/flags/${encodeURIComponent(flagId)}/confirm`,
      { method: "POST", body: JSON.stringify({ note: reason.trim() }) },
      { staff: true },
    );
    return { ok: true };
  }
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const flag = store
    .find((item) => item.id === caseId)
    ?.flags.find((item) => item.id === flagId && item.stage === "screening");
  if (!flag) throw new Error("Potrivirea nu a fost găsită.");
  await delay(300);
  flag.screeningResolution = resolution;
  flag.screeningReason = reason.trim();
  if (resolution === "dismissed") {
    flag.status = "dismissed";
    flag.dismissedBy = MOCK_ANALYST;
    flag.dismissalNote = reason.trim();
  }
  writeDemoCases(store);
  m.auditLog.push({
    id: `${flagId}-${Date.now()}`,
    caseId,
    timestamp: nowStamp(),
    actor: "human",
    stage: "Screening",
    action:
      resolution === "confirmed" ? "Potrivire confirmată de ofițer" : "Potrivire ignorată cu motiv",
    status: "ok",
    durationMs: 0,
    input: JSON.stringify({ flagId, evidence: flag.evidence }),
    output: JSON.stringify({ resolution, reason: reason.trim() }),
  });
  return { ok: true };
}

export async function getOwnership(
  caseId: string,
): Promise<{ nodes: OwnershipNode[]; edges: OwnershipEdge[] }> {
  const c = USE_MOCK
    ? (await mocks()).cases.find((item) => item.id === caseId)
    : await getCase(caseId);
  if (USE_MOCK) await delay(300);
  if (!c?.company || !c.ownership) return { nodes: [], edges: [] };
  return {
    nodes: [
      { id: "company", label: c.company.name, kind: "companie", declared: true },
      ...c.ownership.registry.map((p): OwnershipNode => ({
        id: p.id,
        label: p.name,
        kind: "persoană",
        declared: c.ownership?.declared.some((d) => d.id === p.id) ?? false,
      })),
    ],
    edges: c.ownership.registry.map((p) => ({ from: "company", to: p.id, pct: p.pct })),
  };
}

// --- Playbooks -------------------------------------------------------------------------------------------------

export async function getPlaybook(id: string): Promise<Playbook | null> {
  if (!USE_MOCK) {
    const p = await orNull(http<ApiPlaybook>(`/playbooks/${encodeURIComponent(id)}`));
    if (!p) return null;
    // The clause-by-clause review comes from the playbook builder service, when it runs and built this playbook.
    const report = PLAYBOOK_API
      ? await fetch(`${PLAYBOOK_API}/playbooks/${encodeURIComponent(id)}/report`)
          .then((r) => (r.ok ? (r.json() as Promise<ApiReport>) : null))
          .catch(() => null)
      : null;
    return toPlaybook(p, report);
  }
  const m = await mocks();
  await delay(400);
  return m.playbooks.find((p) => p.id === (id === "popriri" ? "pb_kyc_pf_v1" : id)) ?? null;
}

export async function listPlaybooks(): Promise<Playbook[]> {
  if (!USE_MOCK) return (await apiPlaybooks()).map((p) => toPlaybook(p));
  const m = await mocks();
  await delay(300);
  return m.playbooks;
}

// --- Analyst actions -------------------------------------------------------------------------------------------

const OUTCOME = {
  aprobat: "approved",
  respins: "rejected",
  documente: "documents_requested",
} as const;

export async function submitDecision(
  caseId: string,
  decision: "aprobat" | "respins" | "documente",
  comment: string,
) {
  const c = await getCase(caseId);
  if (!c) throw new Error("Dosarul nu a fost găsit.");
  if (decision === "aprobat" && blockingFlags(c.flags).length)
    throw new Error("Aprobarea este blocată de probleme nerezolvate.");
  if (!USE_MOCK) {
    await http(
      `/cases/${encodeURIComponent(caseId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify({ outcome: OUTCOME[decision], note: comment.trim() || null }),
      },
      { staff: true },
    );
    return { ok: true };
  }
  await delay(700);
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const source = store.find((item) => item.id === caseId);
  if (source) {
    source.status =
      decision === "aprobat"
        ? "Aprobat"
        : decision === "respins"
          ? "Respins"
          : "Documente solicitate";
    if (decision === "documente")
      for (const f of source.flags)
        if (f.status === "open" && f.client_fixable) f.status = "sent_to_client";
    if (decision === "documente") {
      const p = m.playbooks.find((p) => p.id === source.playbookId);
      source.portalDocuments ??= portalDocumentPlan(
        source.customerType,
        p?.requiredDocuments ?? [],
        source.persons,
      );
      source.officerNote = comment;
      const requestedFlag = source.flags.find(
        (f) => f.client_fixable && f.status === "sent_to_client",
      );
      const requestedDocument = source.documents.find(
        (d) => d.id === requestedFlag?.evidence[0]?.documentId,
      );
      const requestedType =
        requestedDocument?.id === "doc_001" && source.customerType === "PF"
          ? "identity_document"
          : requestedDocument?.id === "doc_003" && source.customerType === "PF"
            ? "payslip"
            : "utility_bill";
      source.requestedStep = Math.max(
        1,
        source.portalDocuments.findIndex((d) => d.type === requestedType) + 1,
      );
      const requested = source.portalDocuments[source.requestedStep - 1];
      if (requested) requested.ok = false;
    }
  }
  writeDemoCases(store);
  return { ok: true };
}

/** `pending` means the flag is critical and waits for a second analyst to confirm. */
export async function dismissFlag(
  caseId: string,
  flagId: string,
  note: string,
): Promise<{ ok: boolean; pending?: boolean; message?: string }> {
  if (!note.trim()) throw new Error("Motivul este obligatoriu.");
  if (!USE_MOCK) {
    const res = await http<{ pending?: boolean; detail?: string }>(
      `/cases/${encodeURIComponent(caseId)}/flags/${encodeURIComponent(flagId)}/dismiss`,
      { method: "POST", body: JSON.stringify({ note: note.trim() }) },
      { staff: true },
    );
    return res.pending
      ? {
          ok: false,
          pending: true,
          message: "Problemă critică: ignorarea trebuie confirmată de un al doilea analist.",
        }
      : { ok: true };
  }
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const f = store.find((c) => c.id === caseId)?.flags.find((f) => f.id === flagId);
  if (!f) throw new Error("Problema nu a fost găsită.");
  f.status = "dismissed";
  f.dismissedBy = MOCK_ANALYST;
  f.dismissalNote = note.trim();
  if (f.stage === "screening") {
    f.screeningResolution = "dismissed";
    f.screeningReason = note.trim();
  }
  writeDemoCases(store);
  m.auditLog.push({
    id: `${flagId}-dismiss-${Date.now()}`,
    caseId,
    timestamp: nowStamp(),
    actor: "human",
    stage: "Revizuire",
    action: `Problemă ignorată de ${MOCK_ANALYST}`,
    status: "ok",
    durationMs: 0,
    input: JSON.stringify({ flagId }),
    output: JSON.stringify({ status: "dismissed", note: note.trim() }),
  });
  return { ok: true };
}

// --- Client portal ---------------------------------------------------------------------------------------------

const PLAYBOOK_FOR: Record<CustomerType, string> = {
  PF: import.meta.env["VITE_PLAYBOOK_PF"] ?? "pb_cont_pf_v1",
  PJ: import.meta.env["VITE_PLAYBOOK_PJ"] ?? "pb_cont_pj_v1",
};

export async function createPortalCase(type: CustomerType, persons: Person[]): Promise<Case> {
  if (!USE_MOCK) {
    const playbooks = await apiPlaybooks();
    const playbook =
      playbooks.find((p) => p.playbook_id === PLAYBOOK_FOR[type]) ??
      playbooks.find((p) => p.customer_type === type);
    if (!playbook) throw new Error("Documentele necesare nu sunt disponibile.");
    const now = new Date().toISOString();
    const caseId = `case_web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await http("/cases", {
      method: "POST",
      body: JSON.stringify({
        case_id: caseId,
        playbook_id: playbook.playbook_id,
        customer_type: type,
        status: "intake",
        created_at: now,
        updated_at: now,
        company: null,
        persons: persons.map(fromPerson),
        documents: [],
        flags: [],
        risk_draft: null,
        decision: null,
      }),
    });
    writePortal({
      ...readPortal(),
      [caseId]: {
        name: type === "PF" ? (persons[0]?.name ?? "") : "Firma mea",
        customerType: type,
        uploaded: {},
      },
    });
    const c = await getPortalCase(caseId);
    if (!c) throw new Error("Dosarul nu poate fi început.");
    return c;
  }
  const m = await mocks();
  const p = m.playbooks.find((p) => p.customerType === type);
  if (!p) throw new Error("Documentele necesare nu sunt disponibile.");
  const base = m.cases.find((c) => c.customerType === type && c.id.endsWith("00_corect_control"));
  if (!base) throw new Error("Dosarul nu poate fi început.");
  const c: Case = {
    ...structuredClone(base),
    id: `demo_${type.toLowerCase()}_${Date.now()}`,
    clientName: type === "PF" ? (persons[0]?.name ?? base.clientName) : base.clientName,
    status: "Nou",
    persons,
    documents: [],
    flags: [],
    portalDocuments: portalDocumentPlan(type, p.requiredDocuments ?? [], persons),
  };
  const store = readDemoCases(m.cases);
  store.push(c);
  writeDemoCases(store);
  return c;
}

/** Client portal only: returns a safe status object, never the full case. */
export async function getClientCaseStatus(caseId: string): Promise<ClientCaseStatus | null> {
  if (!USE_MOCK) {
    const state = await orNull(portalState(caseId));
    return state ? toClientStatus(state.view, state.plan) : null;
  }
  const m = await mocks();
  await delay(300);
  const c = readDemoCases(m.cases).find((x) => x.id === caseId);
  return c ? toClientCaseStatus(c) : null;
}

export async function listMyPortalCases(): Promise<Case[]> {
  if (!USE_MOCK) {
    const cases = await Promise.all(
      Object.keys(readPortal()).map((id) => getPortalCase(id).catch(() => null)),
    );
    return cases.filter((c): c is Case => c !== null);
  }
  const m = await mocks();
  return readDemoCases(m.cases).filter((c) => c.id.startsWith("demo_"));
}

/** Upload one portal step's file; the server reads it and runs the intake checks, and the answer is for the client. */
async function uploadToCase(caseId: string, file: File, replaces?: string) {
  const before = await clientView(caseId);
  const fd = new FormData();
  fd.append("file", file);
  const query =
    replaces && before.documents.some((d) => d.doc_id === replaces)
      ? `?replaces=${encodeURIComponent(replaces)}`
      : "";
  await http(`/cases/${encodeURIComponent(caseId)}/documents${query}`, {
    method: "POST",
    body: fd,
  });
  const after = await clientView(caseId);
  const added = after.documents.find((d) => !before.documents.some((b) => b.doc_id === d.doc_id));
  return { after, added };
}

function clientResult(
  after: ApiClientView,
  added: ApiClientView["documents"][number] | undefined,
  wanted?: string,
) {
  if (!added || added.doc_type === "unknown")
    return {
      ok: false,
      message:
        "Nu am putut recunoaște documentul. Încarcă o copie completă și clară a documentului cerut.",
    };
  if (wanted && !(ACCEPTED[wanted] ?? [wanted]).includes(added.doc_type))
    return {
      ok: false,
      message: `Documentul pare să fie ${(documentLabels[added.doc_type] ?? added.doc_type).toLowerCase()}, nu ${(documentLabels[wanted] ?? wanted).toLowerCase()}.`,
    };
  const asks = after.requests.filter((r) => r.doc_ids.includes(added.doc_id)).map((r) => r.message);
  return asks.length
    ? { ok: false, message: asks.join(" ") }
    : { ok: true, message: "Documentul este în regulă." };
}

export async function checkPortalDocument(caseId: string, step: number, file: File) {
  if (!USE_MOCK) {
    const { plan } = await portalState(caseId);
    const target = plan[step - 1];
    if (!target) throw new Error("Documentul nu a fost găsit.");
    const portal = readPortal();
    const entry = portal[caseId] ?? { name: "", customerType: "PF", uploaded: {} };
    const { after, added } = await uploadToCase(caseId, file, entry.uploaded[target.key]?.docId);
    if (added)
      writePortal({
        ...portal,
        [caseId]: {
          ...entry,
          uploaded: {
            ...entry.uploaded,
            [target.key]: { docId: added.doc_id, fileName: file.name },
          },
        },
      });
    return clientResult(after, added, target.type);
  }
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const c = store.find((c) => c.id === caseId);
  if (!c) throw new Error("Dosarul nu a fost găsit.");
  const p = m.playbooks.find((p) => p.id === c.playbookId);
  c.portalDocuments ??= portalDocumentPlan(c.customerType, p?.requiredDocuments ?? [], c.persons);
  const doc = c.portalDocuments[step - 1];
  if (!doc) throw new Error("Documentul nu a fost găsit.");
  const result = simulatePortalResult(doc.type, file.name);
  await delay(2300);
  doc.fileName = file.name;
  doc.ok = result.ok;
  doc.officerIssue =
    doc.type === "payslip" && /editat|modificat|metadata|metadate|font/i.test(file.name);
  if (doc.officerIssue && !c.flags.some((f) => f.id === `${c.id}-edited`)) {
    const f = m.cases[0]?.flags.find((f) => f.ruleId === "R-PF-012");
    if (f)
      c.flags.push({
        ...structuredClone(f),
        id: `${c.id}-edited`,
        evidence: [],
        status: "open",
        client_fixable: false,
        fix_message: null,
      });
  }
  if (result.ok && c.status === "Documente solicitate") {
    c.status = "În analiză";
    c.officerNote = "";
    for (const f of c.flags) if (f.status === "sent_to_client") f.status = "resolved";
  }
  writeDemoCases(store);
  return result;
}

export async function submitPortalCase(id: string) {
  if (!USE_MOCK) {
    await http(`/cases/${encodeURIComponent(id)}/process`, { method: "POST" });
    return { ok: true };
  }
  const m = await mocks();
  const store = readDemoCases(m.cases);
  const c = store.find((c) => c.id === id);
  if (!c?.portalDocuments?.length || !c.portalDocuments.every((d) => d.ok))
    throw new Error("Încarcă toate documentele înainte de trimitere.");
  c.status = "În analiză";
  writeDemoCases(store);
  return { ok: true };
}

export async function uploadDocument(
  caseId: string,
  file: File,
): Promise<{ ok: boolean; message: string; severity: "ok" | "medium" | "high" }> {
  if (!USE_MOCK) {
    const { after, added } = await uploadToCase(caseId, file);
    const result = clientResult(after, added);
    return { ...result, severity: result.ok ? "ok" : "medium" };
  }
  await delay(1600);
  return {
    ok: true,
    severity: "ok",
    message: "Fișier primit în demonstrația SPECIMEN. Verificarea conținutului nu este conectată.",
  };
}
