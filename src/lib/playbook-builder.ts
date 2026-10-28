import type { CustomerType, Playbook, PlaybookRule } from "@/types";

// Shapes returned by the playbook builder (NexxtAI-ret2futureAI/projects/playbook-builder, POST /playbooks/build).
interface BuilderRule {
  rule_id: string;
  stage: string;
  check: string;
  params: Record<string, string | number | boolean | string[]>;
  severity: string;
  description: string;
  source_ref: { page: number; quote: string; clause?: string | null };
}
interface BuilderPlaybook {
  playbook_id: string;
  process_name: string;
  customer_type: CustomerType;
  required_documents: { doc_type: string }[];
  rules: BuilderRule[];
}
interface BuilderClause {
  clause: string;
  text: string;
  status: "automated" | "covered" | "manual" | "context" | "unreviewed";
  rules: { rule_id: string }[];
  reason: string | null;
}
export interface BuilderResult {
  playbook: BuilderPlaybook;
  report: {
    procedure: { code: string | null; title: string | null; file: string };
    generated_by: { source: NonNullable<Playbook["generatedBy"]>; duration_s: number | null; fallback_reason: string | null };
    coverage: { pct: number };
    clauses: BuilderClause[];
  };
}

const clauseStatus = { automated: "Automatizată", covered: "Acoperită", manual: "Manuală", context: "Context", unreviewed: "Neverificată" } as const;

function ruleKind(r: BuilderRule): PlaybookRule["kind"] {
  if (r.stage === "screening") return "screening";
  if (r.check === "required_present" || r.check === "field_present") return "document-obligatoriu";
  if (r.check === "not_expired") return "valabilitate";
  if (r.check === "max_age_days") return "vechime";
  if (r.stage === "cross_check") return "potrivire";
  return "prag";
}

export function fromBuilder({ playbook, report }: BuilderResult, fileName: string): Playbook {
  return {
    id: playbook.playbook_id,
    processName: playbook.process_name,
    customerType: playbook.customer_type,
    rules: playbook.rules.map((r) => ({
      id: r.rule_id,
      kind: ruleKind(r),
      text: r.description,
      // Arrays (e.g. doc_types) are shown as text; the page only reads scalar params.
      params: { ...Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])), severitate: r.severity, ...(r.source_ref.clause ? { clauza: r.source_ref.clause } : {}) },
      sourceSentence: r.source_ref.quote,
    })),
    // Leading newline: the page splits the intro off before clause 1.1, and a built procedure has no intro.
    sourceDocumentText: `\n${report.clauses.map((c) => `${c.clause}. ${c.text}`).join("\n")}`,
    requiredDocuments: playbook.required_documents.map((d) => d.doc_type),
    sourceName: fileName,
    sourceDate: new Date().toLocaleDateString("ro-RO"),
    clauses: report.clauses.map((c) => ({ number: c.clause, text: c.text, status: clauseStatus[c.status], ruleIds: c.rules.map((r) => r.rule_id), reason: c.reason })),
    coverage: report.coverage.pct,
    generatedBy: report.generated_by.source,
    ...(report.generated_by.duration_s != null ? { buildSeconds: report.generated_by.duration_s } : {}),
    fallbackReason: report.generated_by.fallback_reason,
  };
}

export const generatedByLabels: Record<NonNullable<Playbook["generatedBy"]>, string> = {
  llm: "Generat de LLM",
  llm_repaired: "Generat de LLM (reparat după validare)",
  fallback: "Playbook validat anterior (generarea LLM nu a reușit)",
  mock: "Generat în mod de test (fără LLM)",
  mock_repaired: "Generat în mod de test (reparat)",
};
