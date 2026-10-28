import type { Case } from "@/types";
import { updateRequestedStep } from "./document-requests";
import { isFinalCase } from "./review";

export type ClientStep = 1 | 2 | 3 | 4;
export type ClientStepState = "current" | "action_needed" | "done";
export interface ClientCaseStatus {
  serviceUnavailable?: boolean;
  step: ClientStep;
  state: ClientStepState;
  /** Dates (dd.mm.yyyy) for completed steps, keyed by step number. */
  dates: Partial<Record<ClientStep, string>>;
  client_messages: string[];
  decision: "approved" | "rejected" | null;
  /** Portal upload step to reopen when the bank asks for a document. */
  upload_step: number | null;
}

function day(s: string | undefined): string {
  const m = s?.match(/(\d{2})\.(\d{2})\.(\d{4})/) ?? s?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "28.10.2026";
  return m[1]?.length === 4 ? `${m[3]}.${m[2]}.${m[1]}` : `${m[1]}.${m[2]}.${m[3]}`;
}

/** Builds the client-safe view. Never copies flags, screening, risk, officer or rule data. */
export function toClientCaseStatus(c: Case): ClientCaseStatus {
  const d = day(c.createdAt);
  const base = { client_messages: [] as string[], decision: null, upload_step: null, ...(c.serviceUnavailable ? { serviceUnavailable: true } : {}) };
  switch (c.status) {
    case "Nou": return { ...base, step: 1, state: "current", dates: {}, upload_step: 1 };
    case "Se verifică": return { ...base, step: 2, state: "current", dates: { 1: d } };
    case "Documente solicitate": {
      const pending = updateRequestedStep(c);
      const msgs = pending.map((r) => r.message)
        .filter((m): m is string => !!m);
      return { ...base, step: 2, state: "action_needed", dates: { 1: d }, client_messages: [...new Set(msgs)], upload_step: c.requestedStep ?? null };
    }
    case "În analiză": return { ...base, step: 3, state: "current", dates: { 1: d, 2: d } };
    case "Aprobat":
    case "Respins":
      return { ...base, step: 4, state: "done", dates: { 1: d, 2: d, 3: d, 4: d }, decision: c.status === "Aprobat" ? "approved" : "rejected" };
  }
}

export type ClientPortalStage = "nou" | "verificare" | "documente_solicitate" | "in_analiza" | "finalizat";
/** What the client portal may load: no flags, risk, extracted fields, evidence or officer data. */
export interface ClientPortalCase {
  mutationBlockedReason?: string;
  canProcess?: boolean;
  id: string;
  customerType: Case["customerType"];
  clientName: string;
  stage: ClientPortalStage;
  stageLabel: string;
  persons: { id: string; name: string; role: Case["persons"][number]["role"] }[];
  documents: { key: string; type: string; label: string; personId?: string; personName?: string; fileName?: string; ok: boolean; processingPending?: boolean; issue?: "unrecognized" | "wrong_type";
    /** Fix message of a client-fixable flag on this document (never tamper, screening or risk). */
    clientMessage?: string }[];
  /** Upload step the bank asked the client to redo, if any (kept after the re-upload, to return to the status page). */
  requestedStep: number | null;
}

const stages: Record<Case["status"], [ClientPortalStage, string]> = {
  "Nou": ["nou", "Încărcare documente"],
  "Se verifică": ["verificare", "Verificăm documentele"],
  "Documente solicitate": ["documente_solicitate", "Avem nevoie de ceva de la tine"],
  "În analiză": ["in_analiza", "În analiză la bancă"],
  "Aprobat": ["finalizat", "Finalizat"],
  "Respins": ["finalizat", "Finalizat"],
};

/** Builds the client-safe portal view. `documents` is the portal upload plan (from the case or the playbook). */
export function toClientPortalCase(c: Case, documents: NonNullable<Case["portalDocuments"]>): ClientPortalCase {
  const [stage, stageLabel] = stages[c.status];
  return {
    ...(c.serviceUnavailable ? { mutationBlockedReason: "Serviciul de verificare nu răspunde, iar modificările nu au fost salvate." } : {}),
    ...(c.source === "backend" ? { canProcess: !c.serviceUnavailable && !isFinalCase(c.status) && documents.some((d) => !!d.fileName) } : {}),
    id: c.id,
    customerType: c.customerType,
    clientName: c.clientName,
    stage,
    stageLabel,
    persons: c.persons.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    // officerIssue (a hidden tamper finding) is deliberately left out.
    documents: documents.map((d) => ({ key: d.key, type: d.type, label: d.label, ok: d.ok,
      ...(d.processingPending ? { processingPending: true } : {}), ...(d.issue ? { issue: d.issue } : {}), ...(d.clientMessage ? { clientMessage: d.clientMessage } : {}),
      ...(d.personId ? { personId: d.personId } : {}), ...(d.personName ? { personName: d.personName } : {}), ...(d.fileName ? { fileName: d.fileName } : {}) })),
    requestedStep: c.requestedStep ?? null,
  };
}
