import { describe, expect, it } from "vitest";
import fixture from "./fixtures/orchestrator-pj.json";
import { fromOrchestratorCase, fromOrchestratorEvidence, fromOrchestratorFlag, fromOrchestratorAudit, type OrchestratorCase, type OrchestratorFlag } from "@/lib/orchestrator-adapter";
import type { Case } from "@/types";
const raw = fixture as OrchestratorCase;
const flag: OrchestratorFlag = { flag_id: "flag_001", rule_id: "R-PJ-006", person_id: "p_ubo_1", severity: "high", title: "English backend title", explanation: "ONRC registry: Tudor Exemplu 60%. Declaration: Tudor Exemplu 50%.", evidence: [{ doc_id: "doc_003", page: 2, bbox: [0.1, 0.2, 0.8, 0.6], field_id: "doc_003_ubos" }], status: "open", client_fixable: false, fix_message: null };
const rules = [{ id: "R-PJ-006", text: "Beneficiarii reali trebuie să corespundă registrului", kind: "potrivire" as const, params: {}, sourceSentence: "Procedură" }];
describe("Orchestrator adapter", () => {
  it("converts top-left boxes and 1-based pages without guessing evidence", () => {
    const result = fromOrchestratorEvidence(flag.evidence[0]!);
    expect(result).toMatchObject({ documentId: "doc_003", page: 1, field: "doc_003_ubos", bbox: { x: 0.1, y: 0.2 } });
    expect(result.bbox?.width).toBeCloseTo(0.7); expect(result.bbox?.height).toBeCloseTo(0.4);
    expect(fromOrchestratorEvidence({ doc_id: "doc", page: 1, bbox: [] }).bbox).toBeUndefined();
  });
  it.each([["intake", "Nou"], ["processing", "Se verifică"], ["waiting_client", "Documente solicitate"], ["review", "În analiză"]] as const)("maps %s status", (status, expected) => {
    expect(fromOrchestratorCase({ ...raw, status }).status).toBe(expected);
  });
  it.each([["approved", "Aprobat"], ["rejected", "Respins"], ["documents_requested", "Documente solicitate"]] as const)("maps decided %s", (outcome, expected) => {
    expect(fromOrchestratorCase({ ...raw, status: "decided", decision: { outcome } }).status).toBe(expected);
  });
  it("maps company, document assets, extracted fields and supported person roles", () => {
    const c = fromOrchestratorCase({ ...raw, persons: [...raw.persons, { person_id: "a", full_name: "Ana", role: "applicant" }] });
    expect(c).toMatchObject({ source: "backend", clientName: "Atelier Exemplu Demo SRL", createdAt: "28.10.2026", company: { cui: "987654310", registration: "J40/99999/2026", caen: "6201", address: "Str. Modelului nr. 24, București" } });
    expect(c.persons.map((p) => p.role)).toEqual(["administrator", "UBO", "UBO", "semnatar", "titular"]);
    expect(c.documents[0]?.pageImages).toEqual([`/mocks/${raw.case_id}/images/doc_001_certificat_constatator.png`]);
    expect(c.documents[0]?.extractedFields[0]?.source).toMatchObject({ documentId: "doc_001", page: 0 });
    expect(fromOrchestratorCase({ ...raw, company: null }).company?.caen).toBe("6201");
  });
  it("maps info severity, policy, dismissal and the Romanian rule title", () => {
    expect(fromOrchestratorFlag({ ...flag, severity: "info", status: "dismissed", resolution_note: "Elena Radu: Verificat" }, rules)).toMatchObject({ id: "flag_001", ruleId: "R-PJ-006", personId: "p_ubo_1", severity: "low", status: "dismissed", title: rules[0]!.text, dismissalNote: "Elena Radu: Verificat", client_fixable: false, fix_message: null });
  });
  it("derives null risk from active flags and parses declared owners independently of the mock declaration", () => {
    const mock = { ownership: { registry: [{ id: "p_ubo_1", name: "Tudor Exemplu", pct: 60 }], declared: [{ id: "wrong", name: "Wrong", pct: 100 }] } } as Case;
    const c = fromOrchestratorCase({ ...raw, flags: [flag], risk_draft: null }, mock, rules);
    expect(c.riskDraft.level).toBe("high");
    expect(c.ownership?.declared.map((p) => p.pct)).toEqual([50, 50]);
    expect(c.ownership?.registry).toEqual(mock.ownership?.registry);
    expect(c.ownership?.registry).not.toBe(mock.ownership?.registry);
    expect(fromOrchestratorCase({ ...raw, flags: [{ ...flag, status: "dismissed" }], risk_draft: null }).riskDraft.level).toBe("low");
  });
  it("maps audit stages, human attribution, milliseconds, error and integrity without inventing verification", () => {
    const entry = { seq: 1, ts: "2026-10-28T12:34:56.123456+02:00", case_id: raw.case_id, actor: "orchestrator", tool: "check:registry_vs_declaration", input: { rule_id: "R-PJ-006" }, output: { ok: true }, duration_ms: 12, error: null };
    const result = fromOrchestratorAudit({ chain_valid: true, entries: [entry, { ...entry, seq: 2, actor: "human:Elena Radu", tool: "dismiss_flag", error: "failure" }] }, rules);
    expect(result.chain_valid).toBe(true);
    expect(result.entries[0]).toMatchObject({ stage: "Verificare încrucișată", timestamp: "28.10.2026 12:34:56.123", actor: "ai", action: rules[0]!.text, status: "ok", input: JSON.stringify(entry.input, null, 2), output: JSON.stringify(entry.output, null, 2) });
    expect(result.entries[1]).toMatchObject({ stage: "Revizuire", actor: "human", status: "eroare" });
    expect(fromOrchestratorAudit({ chain_valid: false, entries: [] }).chain_valid).toBe(false);
  });
});
