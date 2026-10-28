import type { Case } from "@/types";

export type ClientStep = 1 | 2 | 3 | 4;
export type ClientStepState = "current" | "action_needed" | "done";
export interface ClientCaseStatus {
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
  const base = { client_messages: [] as string[], decision: null, upload_step: null };
  switch (c.status) {
    case "Nou": return { ...base, step: 1, state: "current", dates: {}, upload_step: 1 };
    case "Se verifică": return { ...base, step: 2, state: "current", dates: { 1: d } };
    case "Documente solicitate": {
      const msgs = [c.officerNote?.trim(), ...c.flags.filter((f) => f.client_fixable === true && f.fix_message && f.status !== "resolved" && f.status !== "dismissed").map((f) => f.fix_message as string)]
        .filter((m): m is string => !!m);
      const docs = c.portalDocuments ?? [];
      const step = c.requestedStep ?? (Math.max(0, docs.findIndex((x) => x.type === "utility_bill")) + 1);
      return { step: 2, state: "action_needed", dates: { 1: d }, client_messages: [...new Set(msgs)].slice(0, 3), decision: null, upload_step: step };
    }
    case "În analiză": return { ...base, step: 3, state: "current", dates: { 1: d, 2: d } };
    case "Aprobat":
    case "Respins":
      return { ...base, step: 4, state: "done", dates: { 1: d, 2: d, 3: d, 4: d }, decision: c.status === "Aprobat" ? "approved" : "rejected" };
  }
}
