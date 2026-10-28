import type { AuditEntry, Case, CaseStatus, DocumentEvidence, Flag, OwnershipPerson, Person, Playbook, Severity } from "@/types";
import { normalizedBBox } from "@/lib/dataset";
import { riskFromFlags } from "@/lib/review";
import { documentLabels, portalDocumentPlan } from "@/lib/portal";

export interface OrchestratorEvidence { doc_id: string; page: number; bbox: number[]; field_id?: string | null }
export interface OrchestratorField { field_id: string; name: string; value: unknown; confidence: number; source: OrchestratorEvidence }
export interface OrchestratorDocument {
  doc_id: string; file: string; doc_type: string; pages: number; owner_person_id: string | null;
  /** 0 until a classifier ran; "unknown" with a confidence above 0 means it ran and did not recognize the file. */
  classification_confidence?: number;
  fields: Record<string, OrchestratorField>;
}
export interface OrchestratorFlag {
  flag_id: string; rule_id: string; person_id?: string | null; severity: Severity | "info";
  title: string; explanation: string; evidence: OrchestratorEvidence[];
  status: NonNullable<Flag["status"]>; client_fixable: boolean; fix_message: string | null; resolution_note?: string | null;
}
export interface OrchestratorCase {
  case_id: string; playbook_id: string; customer_type: "PF" | "PJ";
  status: "intake" | "processing" | "waiting_client" | "review" | "decided";
  created_at: string; company: Record<string, unknown> | null;
  persons: { person_id: string; role: "applicant" | "ubo" | "signatory" | "administrator" | "shareholder" | "company"; full_name: string }[];
  documents: OrchestratorDocument[]; flags: OrchestratorFlag[];
  risk_draft: { level: "low" | "medium" | "high"; reasons: { text: string; flag_ids: string[] }[] } | null;
  decision: { outcome: "approved" | "rejected" | "documents_requested" } | null;
}
export interface OrchestratorAudit {
  entries: { seq: number; ts: string; case_id: string; actor: string; tool: string; input: unknown; output: unknown; duration_ms: number; error: unknown }[];
  chain_valid: boolean;
}
export interface AuditLogResult { entries: AuditEntry[]; chain_valid?: boolean; serviceUnavailable?: boolean }

const text = (value: unknown): string => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const roles: Partial<Record<OrchestratorCase["persons"][number]["role"], Person["role"]>> = { applicant: "titular", ubo: "UBO", signatory: "semnatar", administrator: "administrator" };
const documentNames: Record<string, string> = { certificat_constatator: "Certificat constatator", act_constitutiv: "Act constitutiv", ubo_declaration: "Declarație beneficiar real", id_card: "Carte de identitate", passport: "Pașaport", signature_specimen: "Specimen de semnătură", financial_statement: "Situații financiare" };
function dateLabel(iso: string): string { const [date = ""] = iso.split("T"); return date.split("-").reverse().join("."); }

export function fromOrchestratorEvidence(source: OrchestratorEvidence, field?: string): DocumentEvidence {
  // OCR uses the whole page as a sentinel for an unknown field location.
  const wholePage = source.bbox.length === 4 && source.bbox[0] === 0 && source.bbox[1] === 0 && source.bbox[2] === 1 && source.bbox[3] === 1;
  const bbox = wholePage ? undefined : normalizedBBox(source.bbox);
  return { documentId: source.doc_id, page: Math.max(0, source.page - 1), ...(bbox ? { bbox } : {}), ...(field ?? source.field_id ? { field: field ?? source.field_id! } : {}) };
}

// Translate the registry check's diagnostics without replacing its names or percentages with fixture findings.
function registryExplanation(value: string): string {
  return value.replace(/ONRC registry/g, "Registrul ONRC").replace(/Declaration:/g, "Declarație:")
    .replace(/% declared/g, "% declarat").replace(/% in the registry/g, "% în registru")
    .replace(/ is declared as UBO but is not a UBO in the registry/g, " este declarat beneficiar real, dar nu figurează ca beneficiar real în registru")
    .replace(/ is a UBO in the registry but is missing from the declaration/g, " este beneficiar real în registru, dar lipsește din declarație");
}
export function fromOrchestratorFlag(flag: OrchestratorFlag, rules: Playbook["rules"] = [], fields: OrchestratorField[] = []): Flag {
  const rule = rules.find((r) => r.id === flag.rule_id);
  return {
    id: flag.flag_id, ruleId: flag.rule_id, title: rule?.text ?? "Problemă semnalată la verificarea dosarului", ruleText: rule?.text ?? flag.rule_id,
    severity: flag.severity === "info" ? "low" : flag.severity,
    explanation: flag.explanation.startsWith("ONRC registry") ? registryExplanation(flag.explanation) : rule?.text ?? "Dosarul necesită verificarea analistului.",
    evidence: flag.evidence.map((e) => fromOrchestratorEvidence(e, fields.find((f) => f.field_id === e.field_id)?.name)),
    status: flag.status, client_fixable: flag.client_fixable, fix_message: flag.fix_message, clientFixMessage: flag.fix_message ?? "",
    ...(flag.person_id ? { personId: flag.person_id } : {}),
    ...(flag.resolution_note ? { dismissalNote: flag.resolution_note, dismissedBy: flag.resolution_note.split(":")[0] ?? "Elena Radu" } : {}),
  };
}
function declaredOwners(value: unknown): OwnershipPerson[] {
  let parsed = value;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return []; } }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((p): p is Record<string, unknown> => !!p && typeof p === "object").flatMap((p) => {
    const name = text(p["full_name"]); const pct = Number(p["ownership_pct"]);
    return name && p["ownership_pct"] != null && Number.isFinite(pct) ? [{ id: text(p["person_id"]) || name, name, pct }] : [];
  });
}
const IDENTITY_TYPES = ["id_card", "passport"];
/**
 * Documents the client has to replace for a flag. A cross-check cites both sides; the identity document is the
 * reference, so the other side is the one to replace (a payslip with another name, not the ID it was compared with).
 */
export function blamedDocuments(raw: Pick<OrchestratorCase, "documents">, flag: Pick<OrchestratorFlag, "evidence">): string[] {
  const typeOf = (id: string) => raw.documents.find((d) => d.doc_id === id)?.doc_type;
  const ids = [...new Set(flag.evidence.map((e) => e.doc_id))].filter((id) => typeOf(id) !== undefined);
  const others = ids.filter((id) => !IDENTITY_TYPES.includes(typeOf(id) ?? ""));
  return ids.length > 1 && others.length && others.length < ids.length ? others : ids;
}
/** Client-safe messages for one document: only open, client-fixable flags (validate / cross-check) carry them. */
export function clientMessagesFor(raw: Pick<OrchestratorCase, "documents" | "flags">, docId: string): string[] {
  return [...new Set(raw.flags.filter((f) => f.client_fixable && f.fix_message && ["open", "sent_to_client"].includes(f.status) && blamedDocuments(raw, f).includes(docId)).map((f) => f.fix_message as string))];
}

/** `uploadSlots` maps a doc_id to the portal step it was uploaded at, so an unrecognized file stays on that step. */
export function fromOrchestratorCase(raw: OrchestratorCase, mock?: Case, rules: Playbook["rules"] = [], requiredDocuments?: string[], uploadSlots: Record<string, string> = {}): Case {
  const allFields = raw.documents.flatMap((d) => Object.values(d.fields));
  const flags = raw.flags.map((f) => fromOrchestratorFlag(f, rules, allFields));
  const certificate = raw.documents.find((d) => d.doc_type === "certificat_constatator");
  const companyValue = (key: string) => text(raw.company?.[key] ?? certificate?.fields[key]?.value);
  const company = raw.customer_type === "PJ" ? { name: companyValue("name") || companyValue("company_name"), cui: companyValue("cui"), registration: companyValue("registration_number"), caen: companyValue("caen_code"), address: companyValue("registered_office") } : undefined;
  const statuses: Record<OrchestratorCase["status"], CaseStatus> = { intake: "Nou", processing: "Se verifică", waiting_client: "Documente solicitate", review: "În analiză", decided: raw.decision?.outcome === "approved" ? "Aprobat" : raw.decision?.outcome === "rejected" ? "Respins" : "Documente solicitate" };
  const persons = raw.persons.flatMap((p) => { const role = roles[p.role]; return role ? [{ id: p.person_id, name: p.full_name, role }] : []; });
  const plan = portalDocumentPlan(raw.customer_type, requiredDocuments ?? [...new Set(raw.documents.map((d) => d.doc_type).filter((t) => t !== "unknown"))], persons);
  const used = new Set<string>();
  const unrecognized = (d: OrchestratorDocument) => d.doc_type === "unknown" && (d.classification_confidence ?? 0) > 0;
  const uploaded = (d: OrchestratorDocument) => {
    const messages = clientMessagesFor(raw, d.doc_id);
    return {
      documentId: d.doc_id, fileName: d.file.split(/[\\/]/).at(-1) ?? d.file,
      processingPending: !unrecognized(d) && (d.doc_type === "unknown" || !Object.keys(d.fields).length),
      ok: d.doc_type !== "unknown" && Object.keys(d.fields).length > 0 && !messages.length,
      ...(messages.length ? { clientMessage: messages.join(" ") } : {}),
    };
  };
  const portalDocuments: NonNullable<Case["portalDocuments"]> = plan.map((slot) => {
    const key = slot.personId ? `${slot.personId}-${slot.type}` : `company-${slot.type}`;
    // PF steps name no person (the applicant is implied), so any owner fits; PJ steps belong to one person.
    const ownerFits = (d: OrchestratorDocument) => slot.personId === undefined || d.owner_person_id === slot.personId;
    const matches = raw.documents.filter((d) => d.doc_type === slot.type && ownerFits(d) && !used.has(d.doc_id));
    // Otherwise the file the client uploaded at this step, even if it was not recognized or is another document type.
    const d = matches.length === 1 ? matches[0] : raw.documents.find((x) => uploadSlots[x.doc_id] === key && !used.has(x.doc_id));
    if (d) used.add(d.doc_id);
    if (!d) return { ...slot, key };
    const issue = unrecognized(d) ? "unrecognized" as const : d.doc_type !== "unknown" && (d.doc_type !== slot.type || !ownerFits(d)) ? "wrong_type" as const : undefined;
    return { ...slot, key, ...uploaded(d), ...(issue ? { issue, ok: false } : {}) };
  });
  // Unclassified files and ambiguous/extra documents stay visible and can be reprocessed.
  // An unclassified file with no remembered step (uploaded before steps were remembered, or in another browser)
  // goes to the first empty step: the portal walks the client through the steps in order.
  for (const d of raw.documents.filter((d) => !used.has(d.doc_id) && d.doc_type === "unknown")) {
    const i = portalDocuments.findIndex((slot) => !slot.fileName);
    const slot = portalDocuments[i];
    if (!slot) break;
    used.add(d.doc_id);
    portalDocuments[i] = { ...slot, ...uploaded(d), ...(unrecognized(d) ? { issue: "unrecognized" as const, ok: false } : {}) };
  }
  for (const d of raw.documents.filter((d) => !used.has(d.doc_id))) portalDocuments.push({
    key: d.doc_id, type: d.doc_type, label: documentLabels[d.doc_type] ?? documentNames[d.doc_type] ?? "Document neidentificat",
    ...(d.owner_person_id ? { personId: d.owner_person_id, personName: raw.persons.find((p) => p.person_id === d.owner_person_id)?.full_name ?? "" } : {}),
    ...uploaded(d), ...(unrecognized(d) ? { issue: "unrecognized" as const, ok: false } : {}),
  });
  return {
    id: raw.case_id, source: "backend", playbookId: raw.playbook_id, customerType: raw.customer_type,
    clientName: company?.name || raw.persons[0]?.full_name || "Dosar fără nume", ...(company ? { company, cui: company.cui } : {}),
    status: statuses[raw.status], createdAt: dateLabel(raw.created_at), processingMs: 0,
    persons, portalDocuments,
    documents: raw.documents.map((d) => {
      const basename = d.file.split(/[\\/]/).at(-1) ?? d.file;
      const imageName = basename.replace(/\.[^.]+$/, "") + ".png";
      return { id: d.doc_id, type: documentNames[d.doc_type] ?? "Document", ownerPersonId: d.owner_person_id ?? "", fileName: basename,
        // Only dataset cases have rendered pages; portal uploads stay in the backend.
        pageImages: raw.case_id.startsWith("live_") ? [] : [`/mocks/${raw.case_id}/images/${imageName}`],
        status: flags.some((f) => !["resolved", "dismissed"].includes(f.status ?? "open") && f.evidence.some((e) => e.documentId === d.doc_id)) ? "cu-probleme" as const : "valid" as const,
        extractedFields: Object.values(d.fields).map((f) => ({ name: f.name, value: text(f.value), confidence: f.confidence, source: fromOrchestratorEvidence(f.source, f.name) })) };
    }), flags,
    riskDraft: raw.risk_draft ? { level: raw.risk_draft.level, reasons: raw.risk_draft.reasons.map((r) => ({ factor: r.flag_ids.map((id) => flags.find((f) => f.id === id)?.ruleId ?? id).join(", ") || "Evaluare dosar", value: r.flag_ids.map((id) => flags.find((f) => f.id === id)?.explanation).filter(Boolean).join("; ") || (flags.length ? "Propunere de risc pentru revizuirea analistului." : "Nu au fost semnalate probleme."), impact: r.flag_ids.length ? "crește" as const : "neutru" as const })) } : riskFromFlags(flags),
    ownership: {
      // Mock-only: the orchestrator has no registry endpoint. Only this reference side comes from the matching fixture.
      registry: structuredClone(mock?.ownership?.registry ?? []),
      declared: declaredOwners(raw.documents.find((d) => d.doc_type === "ubo_declaration")?.fields["ubos"]?.value),
    },
  };
}
const stages: Record<string, string> = { classify: "Clasificare", extract: "Extracție", required_present: "Validare", not_expired: "Validare", max_age_days: "Validare", field_present: "Validare", fields_match: "Verificare încrucișată", income_vs_deposits: "Verificare încrucișată", registry_vs_declaration: "Verificare încrucișată", pdf_metadata: "Detectare falsificare", font_consistency: "Detectare falsificare", totals_consistency: "Detectare falsificare", sanctions: "Screening", pep: "Screening", adverse_media: "Screening", risk_factors: "Propunere de risc", pipeline_done: "Dosar pregătit", decision: "Revizuire", dismiss_flag: "Revizuire", submit: "Încărcări client" };
export function fromOrchestratorAudit(raw: OrchestratorAudit, rules: Playbook["rules"] = []): AuditLogResult {
  return { chain_valid: raw.chain_valid, entries: raw.entries.map((e) => {
    const tool = e.tool.replace(/^check:/, "");
    const stage = stages[tool] ?? (/upload|receive|replace_document/.test(tool) ? "Încărcări client" : "Verificare dosar");
    const input = e.input && typeof e.input === "object" ? e.input as Record<string, unknown> : {};
    const rule = rules.find((r) => r.id === input["rule_id"]);
    const time = e.ts.split("T")[1]?.match(/^(\d{2}:\d{2}:\d{2})(?:\.(\d+))?/);
    const timestamp = `${dateLabel(e.ts)} ${time?.[1] ?? "00:00:00"}.${(time?.[2] ?? "").padEnd(3, "0").slice(0, 3)}`;
    return { id: `${e.case_id}-${e.seq}`, caseId: e.case_id, timestamp, actor: e.actor.startsWith("human:") ? "human" as const : "ai" as const, stage,
      action: rule?.text ?? (tool === "dismiss_flag" ? "Problemă ignorată cu motiv" : tool === "decision" ? "Decizie înregistrată de analist" : stage),
      status: e.error ? "eroare" as const : "ok" as const, durationMs: e.duration_ms,
      input: JSON.stringify(e.input ?? null, null, 2), output: JSON.stringify(e.error ? { rezultat: e.output, eroare: e.error } : e.output ?? null, null, 2) };
  }) };
}
