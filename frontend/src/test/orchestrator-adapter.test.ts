import { describe, expect, it } from "vitest";
import fixture from "./fixtures/orchestrator-pj.json";
import { fromClientView, fromOrchestratorCase, fromOrchestratorEvidence, fromOrchestratorFlag, fromOrchestratorAudit, fromOrchestratorScreening, type OrchestratorCase, type OrchestratorFlag } from "@/lib/orchestrator-adapter";
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
  it("opens OCR evidence on its page without inventing a highlight for an unknown position", () => {
    const input = structuredClone(raw);
    for (const doc of input.documents) for (const field of Object.values(doc.fields)) field.source.bbox = [0, 0, 1, 1];
    input.flags = [{ ...flag, evidence: [{ doc_id: "doc_003", page: 2, bbox: [0, 0, 1, 1], field_id: "doc_003_ubos" }] }];
    const c = fromOrchestratorCase(input);
    expect(c.flags[0]?.evidence[0]).toMatchObject({ documentId: "doc_003", page: 1 });
    expect(c.flags[0]?.evidence[0]).not.toHaveProperty("bbox");
    expect(c.documents.flatMap((d) => d.extractedFields).every((f) => !f.source.bbox)).toBe(true);
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

describe("Orchestrator adapter: screening and the client view", () => {
  it("opens screening flags in the side-by-side panel and keeps the analyst's confirmation", () => {
    const screening = { ...flag, stage: "screening", resolution_note: "confirmed by Maria: aceeași persoană" };
    expect(fromOrchestratorFlag(screening)).toMatchObject({ stage: "screening", screeningPersonId: "p_ubo_1", screeningResolution: "confirmed", screeningReason: "aceeași persoană" });
    expect(fromOrchestratorFlag({ ...screening, status: "dismissed", resolution_note: "Elena: an diferit" })).toMatchObject({ screeningResolution: "dismissed", screeningReason: "an diferit" });
    expect(fromOrchestratorFlag(flag).stage).toBeUndefined();
  });
  it("maps a list entry and the client's data for the comparison table", () => {
    const pep = fromOrchestratorScreening({ entry: { pk_match_key: "PEP-RO-101#X", id_sursa: "PEP-RO-101", nume_complet: "Nikola Dimitrov", anul_nasterii: "1958", cetatenie: "RO", categorie_risc: "PEP", motiv_includere: "m", act_identitate_cunoscut: null }, score: 97, client: { name: "Nikola Dimitrov", birth_year: 1958, citizenship: "RO", identity_document: null } });
    expect(pep).toMatchObject({ score: 97, entry: { anul_nasterii: 1958, categorie_risc: "PEP", act_identitate_cunoscut: "—" }, client: { birthYear: 1958, citizenship: "RO" } });
    const media = fromOrchestratorScreening({ entry: { key: "m", id_stire: "NEWS-DEMO-001", nume_subiect: "S", titlu_stire: "t", sursa_stire: "s", an_publicare: 2026, tara_subiect: "ZZ", cuvinte_cheie_risc: ["fraudă"], nivel_risc: "high" }, score: 100, client: { name: "S", birth_year: null, citizenship: null, identity_document: null } });
    expect(media.entry).toMatchObject({ id_stire: "NEWS-DEMO-001", nivel_risc: "high" }); expect(media.client).toEqual({ name: "S" });
  });
  it("turns the client view into requests on the right documents, and leaves a full case file alone", () => {
    const view = { case_id: "live_pf_1", playbook_id: "pb_cont_pf_v1", customer_type: "PF" as const, status: "waiting_client" as const, created_at: "2026-10-28T10:00:00+02:00", decision: null, request_note: null,
      requests: [{ message: "Încărcați o factură recentă.", doc_ids: ["doc_002"] }], persons: [{ person_id: "p_pf", role: "applicant" as const, full_name: "Mara Exemplu" }],
      documents: [{ doc_id: "doc_001", doc_type: "id_card", owner_person_id: "p_pf" }, { doc_id: "doc_002", doc_type: "proof_of_address", owner_person_id: "p_pf" }, { doc_id: "doc_003", doc_type: "unknown", owner_person_id: null }] };
    const c = fromClientView(view);
    expect(c.flags).toMatchObject([{ client_fixable: true, status: "sent_to_client", fix_message: "Încărcați o factură recentă.", evidence: [{ doc_id: "doc_002" }] }]);
    expect(c.documents.map((d) => Object.keys(d.fields).length > 0)).toEqual([true, true, false]); // unread until classified
    expect(c.risk_draft).toBeNull();
    expect(fromClientView(raw)).toBe(raw);
  });
});

