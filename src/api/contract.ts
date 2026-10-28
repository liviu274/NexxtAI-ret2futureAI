// Shapes returned by the orchestrator REST API (conventions/CONTRACTS.md in the NexxtAI repo), and the pure
// mappings to the screen types in @/types. Only src/api/client.ts calls the API; components never see these.
import type {
  AuditEntry,
  Case,
  CaseStatus,
  Document,
  Evidence,
  Flag,
  Person,
  Playbook,
  PlaybookRule,
  RiskLevel,
  Severity,
} from "@/types";
import type { ClientCaseStatus } from "@/lib/client-status";
import type { ScreeningListEntry, ScreeningMatch } from "@/types/extensions";
import { documentLabels, portalDocumentPlan } from "@/lib/portal";

export type ApiRole =
  "applicant" | "company" | "administrator" | "shareholder" | "ubo" | "signatory";
export type ApiCaseStatus = "intake" | "processing" | "waiting_client" | "review" | "decided";
export type ApiOutcome = "approved" | "rejected" | "documents_requested";

export interface ApiPerson {
  person_id: string;
  role: ApiRole;
  full_name: string;
}
export interface ApiField {
  field_id: string;
  name: string;
  value: unknown;
  value_type: string;
  raw_text: string;
  confidence: number;
  source: { doc_id: string; page: number; bbox: number[] };
  extracted_by: string;
}
export interface ApiDocument {
  doc_id: string;
  file: string;
  mime_type: string;
  pages: number;
  uploaded_at: string;
  doc_type: string;
  classification_confidence: number;
  owner_person_id: string | null;
  fields: Record<string, ApiField>;
}
export interface ApiEvidence {
  doc_id: string;
  page: number;
  bbox: number[];
  field_id?: string | null;
  quote?: string | null;
}
export interface ApiFlag {
  flag_id: string;
  case_id: string;
  rule_id: string;
  person_id?: string | null;
  stage: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  evidence: ApiEvidence[];
  client_fixable: boolean;
  fix_message: string | null;
  status: "open" | "sent_to_client" | "resolved" | "dismissed";
  created_by: string;
  created_at: string;
  resolution_note: string | null;
}
export interface ApiCaseFile {
  case_id: string;
  playbook_id: string;
  customer_type: "PF" | "PJ";
  status: ApiCaseStatus;
  created_at: string;
  updated_at: string;
  company: {
    name?: string;
    cui?: string;
    registration_number?: string;
    caen_code?: string;
    registered_office?: string;
  } | null;
  persons: ApiPerson[];
  documents: ApiDocument[];
  flags: ApiFlag[];
  risk_draft: {
    level: "low" | "medium" | "high";
    reasons: { text: string; flag_ids: string[] }[];
  } | null;
  decision: {
    outcome: ApiOutcome;
    decided_by: string;
    decided_at: string;
    note: string | null;
  } | null;
}
export interface ApiCaseSummary {
  case_id: string;
  processing_ms: number;
}
export interface ApiRule {
  rule_id: string;
  stage: string;
  check: string;
  params: Record<string, unknown>;
  applies_to: ApiRole;
  severity: string;
  description: string;
  client_fixable: boolean;
  fix_message: string | null;
  source_ref: { page: number; quote: string; clause?: string | null };
}
export interface ApiPlaybook {
  playbook_id: string;
  version: number;
  process_name: string;
  customer_type: "PF" | "PJ";
  source_procedure: { file: string; generated_at: string };
  required_documents: { doc_type: string; applies_to: ApiRole; alternatives: string[] }[];
  rules: ApiRule[];
}
export interface ApiAuditEntry {
  seq: number;
  ts: string;
  case_id: string;
  actor: string;
  tool: string;
  input: unknown;
  output: unknown;
  duration_ms: number;
  error: string | null;
}
export interface ApiOwnership {
  registry: { id: string; name: string; pct: number | null }[];
  declared: { id: string; name: string; pct: number | null }[];
}
export interface ApiClientView {
  case_id: string;
  customer_type: "PF" | "PJ";
  playbook_id: string;
  status: ApiCaseStatus;
  created_at: string;
  updated_at: string;
  decision: ApiOutcome | null;
  decided_at: string | null;
  request_note: string | null;
  client_messages: string[];
  requests: { message: string; doc_ids: string[] }[];
  persons: ApiPerson[];
  documents: {
    doc_id: string;
    doc_type: string;
    owner_person_id: string | null;
    uploaded_at: string;
  }[];
}
export interface ApiReport {
  clauses: {
    clause: string;
    text: string;
    status: "automated" | "covered" | "manual" | "context" | "unreviewed";
    rules: { rule_id: string }[];
  }[];
}

const ROLE: Record<ApiRole, Person["role"] | null> = {
  applicant: "titular",
  ubo: "UBO",
  shareholder: "UBO",
  signatory: "semnatar",
  administrator: "administrator",
  company: null,
};
const ROLE_BACK: Record<Person["role"], ApiRole> = {
  titular: "applicant",
  UBO: "ubo",
  semnatar: "signatory",
  administrator: "administrator",
};
const WHOLE_PAGE = [0, 0, 1, 1];

export const dayOf = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};
const stamp = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : iso;
};

export function toCaseStatus(
  status: ApiCaseStatus,
  outcome: ApiOutcome | null | undefined,
  documents: number,
): CaseStatus {
  if (status === "decided") return outcome === "approved" ? "Aprobat" : "Respins";
  if (status === "waiting_client") return "Documente solicitate";
  if (status === "review") return "În analiză";
  if (status === "processing") return "Se verifică";
  return documents ? "Se verifică" : "Nou";
}

export const toPerson = (p: ApiPerson): Person | null => {
  const role = ROLE[p.role];
  return role ? { id: p.person_id, name: p.full_name, role } : null;
};
export const fromPerson = (p: Person): ApiPerson => ({
  person_id: p.id,
  role: ROLE_BACK[p.role],
  full_name: p.name,
});

export function toEvidence(e: ApiEvidence): Evidence {
  const known = e.bbox.length === 4 && e.bbox.some((n, i) => n !== WHOLE_PAGE[i]); // [0,0,1,1] means "location unknown"
  const [x0 = 0, y0 = 0, x1 = 1, y1 = 1] = e.bbox;
  return {
    documentId: e.doc_id,
    page: Math.max(0, e.page - 1),
    ...(known ? { bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } } : {}),
    ...(e.field_id ? { field: e.field_id } : {}),
  };
}

export function toFlag(f: ApiFlag, ruleText: (ruleId: string) => string | undefined): Flag {
  const [by, ...note] = (f.resolution_note ?? "").split(": ");
  const severity: Severity = f.severity === "info" ? "low" : f.severity;
  return {
    id: f.flag_id,
    severity,
    title: f.title,
    ruleId: f.rule_id,
    ruleText: ruleText(f.rule_id) ?? f.title,
    explanation: f.explanation,
    evidence: f.evidence.map(toEvidence),
    clientFixMessage: f.fix_message ?? "",
    status: f.status,
    client_fixable: f.client_fixable,
    fix_message: f.fix_message,
    ...(f.status === "dismissed" && f.resolution_note
      ? {
          dismissedBy: note.length ? by : "",
          dismissalNote: note.length ? note.join(": ") : f.resolution_note,
        }
      : {}),
    ...(f.stage === "screening" ? toScreening(f) : {}),
  };
}

/** Screening flags open the side-by-side panel; an analyst's confirmation is kept in resolution_note. */
function toScreening(f: ApiFlag): Partial<Flag> {
  const confirmed = f.resolution_note?.match(/^confirmed by [^:]+(?:: (.*))?$/s);
  return {
    stage: "screening",
    ...(f.person_id ? { screeningPersonId: f.person_id } : {}),
    ...(confirmed
      ? { screeningResolution: "confirmed" as const, screeningReason: confirmed[1] ?? "" }
      : {}),
    ...(f.status === "dismissed"
      ? {
          screeningResolution: "dismissed" as const,
          screeningReason: f.resolution_note?.split(": ").slice(1).join(": ") ?? "",
        }
      : {}),
  };
}

export interface ApiScreeningMatch {
  entry: Record<string, unknown>;
  score: number;
  client: {
    name: string;
    birth_year: number | null;
    citizenship: string | null;
    identity_document: string | null;
  };
}

export function toScreeningMatch(m: ApiScreeningMatch): ScreeningMatch {
  const e = m.entry;
  const text = (k: string) => (e[k] == null ? "" : String(e[k]));
  const entry: ScreeningListEntry =
    "id_stire" in e
      ? {
          key: text("key") || text("id_stire"),
          id_stire: text("id_stire"),
          nume_subiect: text("nume_subiect"),
          titlu_stire: text("titlu_stire"),
          sursa_stire: text("sursa_stire"),
          an_publicare: Number(e["an_publicare"]) || 0,
          tara_subiect: text("tara_subiect"),
          cuvinte_cheie_risc: Array.isArray(e["cuvinte_cheie_risc"])
            ? (e["cuvinte_cheie_risc"] as string[])
            : [],
          nivel_risc: (["high", "medium", "low"].includes(text("nivel_risc"))
            ? text("nivel_risc")
            : "medium") as "high" | "medium" | "low",
        }
      : {
          key: text("pk_match_key") || text("id_sursa"),
          id_sursa: text("id_sursa"),
          nume_complet: text("nume_complet"),
          anul_nasterii: Number(e["anul_nasterii"]) || 0,
          cetatenie: text("cetatenie"),
          categorie_risc: text("categorie_risc") === "PEP" ? "PEP" : "SANCTIONS",
          motiv_includere: text("motiv_includere"),
          act_identitate_cunoscut: text("act_identitate_cunoscut") || "—",
        };
  return {
    entry,
    score: m.score,
    client: {
      name: m.client.name,
      ...(m.client.birth_year ? { birthYear: m.client.birth_year } : {}),
      ...(m.client.citizenship ? { citizenship: m.client.citizenship } : {}),
      ...(m.client.identity_document ? { identityDocument: m.client.identity_document } : {}),
    },
  };
}

export function toDocument(
  d: ApiDocument,
  flags: ApiFlag[],
  base: string,
  caseId: string,
): Document {
  const active = flags.some(
    (f) =>
      (f.status === "open" || f.status === "sent_to_client") &&
      f.evidence.some((e) => e.doc_id === d.doc_id),
  );
  const url = `${base}/cases/${encodeURIComponent(caseId)}`;
  return {
    id: d.doc_id,
    type: documentLabels[d.doc_type] ?? d.doc_type,
    ownerPersonId: d.owner_person_id ?? "",
    fileName: d.file.split("/").pop() ?? d.file,
    pageImages: Array.from(
      { length: Math.max(1, d.pages) },
      (_, i) => `${url}/documents/${d.doc_id}/pages/${i + 1}.png`,
    ),
    pdfUrl: `${url}/documents/${d.doc_id}/file`,
    status: d.doc_type === "unknown" ? "se-verifica" : active ? "cu-probleme" : "valid",
    extractedFields: Object.values(d.fields).map((x) => ({
      name: x.name,
      value: typeof x.value === "string" ? x.value : JSON.stringify(x.value),
      confidence: x.confidence,
      source: toEvidence({ ...x.source, field_id: x.field_id }),
    })),
  };
}

export function toCase(
  c: ApiCaseFile,
  playbooks: ApiPlaybook[],
  base: string,
  extra: { processingMs?: number; ownership?: ApiOwnership } = {},
): Case {
  const playbook = playbooks.find((p) => p.playbook_id === c.playbook_id);
  const rules = new Map(
    playbooks.flatMap((p) => p.rules.map((r) => [r.rule_id, r.description] as const)),
  );
  const documents = c.documents.map((d) => toDocument(d, c.flags, base, c.case_id));
  return {
    id: c.case_id,
    customerType: c.customer_type,
    clientName:
      c.company?.name ??
      c.persons.find((p) => p.role === "applicant")?.full_name ??
      c.persons[0]?.full_name ??
      c.case_id,
    ...(c.company?.cui ? { cui: c.company.cui } : {}),
    status: toCaseStatus(c.status, c.decision?.outcome, c.documents.length),
    createdAt: dayOf(c.created_at),
    processingMs: extra.processingMs ?? 0,
    persons: c.persons.map(toPerson).filter((p): p is Person => p !== null),
    documents,
    flags: c.flags
      .filter((f) => f.status !== "resolved")
      .map((f) => toFlag(f, (id) => rules.get(id))),
    riskDraft: {
      level: (c.risk_draft?.level ?? "low") as RiskLevel,
      reasons: (c.risk_draft?.reasons ?? []).map((r) => ({
        factor: r.text,
        value: r.flag_ids.join(", "),
        impact: r.flag_ids.length ? "crește" : "neutru",
      })),
    },
    playbookId: c.playbook_id,
    ...(c.company
      ? {
          company: {
            name: c.company.name ?? "",
            cui: c.company.cui ?? "",
            registration: c.company.registration_number ?? "",
            caen: c.company.caen_code ?? "",
            address: c.company.registered_office ?? "",
          },
        }
      : {}),
    ...(extra.ownership
      ? {
          ownership: {
            registry: extra.ownership.registry.map((p) => ({ ...p, pct: p.pct ?? 0 })),
            declared: extra.ownership.declared.map((p) => ({ ...p, pct: p.pct ?? 0 })),
          },
        }
      : {}),
    executedRuleIds: playbook?.rules.map((r) => r.rule_id) ?? [],
    ...(c.decision?.outcome === "documents_requested" && c.decision.note
      ? { officerNote: c.decision.note }
      : {}),
  };
}

const KIND: Record<string, PlaybookRule["kind"]> = {
  required_present: "document-obligatoriu",
  not_expired: "valabilitate",
  max_age_days: "vechime",
  field_present: "document-obligatoriu",
  fields_match: "potrivire",
  income_vs_deposits: "prag",
  registry_vs_declaration: "potrivire",
  sanctions: "screening",
  pep: "screening",
  adverse_media: "screening",
};
const CLAUSE: Record<
  ApiReport["clauses"][number]["status"],
  NonNullable<Playbook["clauses"]>[number]["status"]
> = {
  automated: "Automatizată",
  covered: "Acoperită",
  manual: "Manuală",
  context: "Context",
  unreviewed: "Neverificată",
};

export function toPlaybook(p: ApiPlaybook, report?: ApiReport | null): Playbook {
  return {
    id: p.playbook_id,
    processName: p.process_name,
    customerType: p.customer_type,
    rules: p.rules.map((r) => ({
      id: r.rule_id,
      kind: KIND[r.check] ?? "prag",
      text: r.description,
      params: {
        severitate: r.severity,
        ...Object.fromEntries(
          Object.entries(r.params).map(([k, v]) => [
            k,
            typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean),
          ]),
        ),
      },
      sourceSentence: r.source_ref.quote,
    })),
    requiredDocuments: [...new Set(p.required_documents.map((d) => d.doc_type))],
    sourceName: p.source_procedure.file.split("/").pop() ?? p.source_procedure.file,
    sourceDate: dayOf(p.source_procedure.generated_at),
    sourceDocumentText: report?.clauses.map((c) => `${c.clause} ${c.text}`).join("\n") ?? "",
    ...(report
      ? {
          clauses: report.clauses.map((c) => ({
            number: c.clause,
            text: c.text,
            status: CLAUSE[c.status],
            ruleIds: c.rules.map((r) => r.rule_id),
          })),
        }
      : {}),
  };
}

const STAGE: [RegExp, string][] = [
  [/^(submit|receive_file|upload_document|replace_document)$/, "Primire documente"],
  [/^(classify|extract)$/, "Citire documente"],
  [/^check:(sanctions|pep|adverse_media)$/, "Screening"],
  [
    /^check:(pdf_metadata|font_consistency|totals_consistency|id_integrity)$/,
    "Detectare falsificare",
  ],
  [/^check:risk_factors$/, "Propunere de risc"],
  [/^check:/, "Verificare reguli"],
  [/^pipeline_done$/, "Dosar pregătit"],
  [/^(decision|dismiss_flag|dismiss_request)$/, "Revizuire"],
];

export function toAuditEntry(e: ApiAuditEntry): AuditEntry {
  const human = e.actor.startsWith("human:");
  const flagged = Array.isArray(e.output) && e.output.length > 0;
  return {
    id: `${e.case_id}-${e.seq}`,
    caseId: e.case_id,
    timestamp: stamp(e.ts),
    actor: human ? "human" : "ai",
    stage: STAGE.find(([re]) => re.test(e.tool))?.[1] ?? e.tool,
    action: human ? `${e.tool.replace("_", " ")} de ${e.actor.slice(6)}` : e.tool,
    status: e.error ? "eroare" : flagged ? "avertisment" : "ok",
    durationMs: e.duration_ms,
    input: JSON.stringify(e.input, null, 2),
    output: e.error ?? JSON.stringify(e.output, null, 2),
  };
}

export const ACCEPTED: Record<string, string[]> = {
  id_card: ["id_card", "passport"],
  payslip: ["payslip", "income_certificate"],
};

/** The portal's upload steps, from the playbook, and which uploaded document (if any) fills each one. */
export function portalPlanFor(
  view: ApiClientView,
  playbook: Playbook | null,
  uploaded: Record<string, { docId: string; fileName: string }>,
): NonNullable<Case["portalDocuments"]> {
  const persons = view.persons.map(toPerson).filter((p): p is Person => p !== null);
  return portalDocumentPlan(view.customer_type, playbook?.requiredDocuments ?? [], persons).map(
    (step) => {
      const mine = uploaded[step.key];
      const doc = mine && view.documents.find((d) => d.doc_id === mine.docId);
      const accepted = ACCEPTED[step.type] ?? [step.type];
      const asked = view.requests.some((r) => doc && r.doc_ids.includes(doc.doc_id));
      return {
        ...step,
        ...(mine ? { fileName: mine.fileName } : {}),
        ok: !!doc && accepted.includes(doc.doc_type) && !asked,
      };
    },
  );
}

export function toClientStatus(
  view: ApiClientView,
  plan: NonNullable<Case["portalDocuments"]>,
): ClientCaseStatus {
  const created = dayOf(view.created_at);
  const base = { client_messages: [] as string[], decision: null, upload_step: null };
  const firstOpen = plan.findIndex((d) => !d.ok) + 1 || null;
  switch (view.status) {
    case "intake":
      return { ...base, step: 1, state: "current", dates: {}, upload_step: firstOpen ?? 1 };
    case "processing":
      return { ...base, step: 2, state: "current", dates: { 1: created } };
    case "waiting_client": {
      const messages = [view.request_note?.trim(), ...view.client_messages].filter(
        (m): m is string => !!m,
      );
      return {
        step: 2,
        state: "action_needed",
        dates: { 1: created },
        client_messages: [...new Set(messages)].slice(0, 3),
        decision: null,
        upload_step: firstOpen ?? 1,
      };
    }
    case "review":
      return {
        ...base,
        step: 3,
        state: "current",
        dates: { 1: created, 2: dayOf(view.updated_at) },
      };
    case "decided": {
      const d = dayOf(view.decided_at ?? view.updated_at);
      return {
        ...base,
        step: 4,
        state: "done",
        dates: { 1: created, 2: d, 3: d, 4: d },
        decision: view.decision === "approved" ? "approved" : "rejected",
      };
    }
  }
}
