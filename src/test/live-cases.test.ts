import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/orchestrator-pj.json";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const pfPlaybook = { playbook_id: "pb_cont_pf_v1", process_name: "Cont PF", customer_type: "PF", required_documents: [{ doc_type: "id_card" }, { doc_type: "proof_of_address" }, { doc_type: "payslip" }], rules: [{ rule_id: "R-PF-001", stage: "validate", check: "required_present", params: {}, description: "Act de identitate valabil.", source_ref: { quote: "q" } }] };
beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Portal steps for backend uploads", () => {
  const base = { case_id: "live_pf_1", playbook_id: "pb_cont_pf_v1", customer_type: "PF" as const, status: "intake" as const, created_at: "2026-10-28T12:00:00Z", company: null, persons: [{ person_id: "p_pf", role: "applicant" as const, full_name: "Mara Exemplu" }], flags: [], risk_draft: null, decision: null };
  const doc = (doc_id: string, doc_type: string, classification_confidence: number, fields = 0) => ({ doc_id, file: `docs/${doc_id}.pdf`, doc_type, pages: 1, owner_person_id: doc_type === "unknown" ? null : "p_pf", classification_confidence, fields: Object.fromEntries(Array.from({ length: fields }, (_, i) => [`f${i}`, { field_id: `f${i}`, name: `f${i}`, value: "x", confidence: 1, source: { doc_id, page: 1, bbox: [0, 0, 1, 1] } }])) });
  const required = ["id_card", "proof_of_address", "payslip"];

  it("puts the applicant's recognized ID on step 1 of a PF case", async () => {
    const { fromOrchestratorCase } = await import("@/lib/orchestrator-adapter");
    const c = fromOrchestratorCase({ ...base, documents: [doc("doc_001", "id_card", 0.97, 5)] }, undefined, [], required);
    expect(c.portalDocuments?.map((d) => [d.type, d.fileName ?? null, d.ok])).toEqual([["id_card", "doc_001.pdf", true], ["proof_of_address", null, false], ["payslip", null, false]]);
  });

  it("keeps an unrecognized file on the step it was uploaded at instead of adding a step", async () => {
    const { fromOrchestratorCase } = await import("@/lib/orchestrator-adapter");
    const c = fromOrchestratorCase({ ...base, documents: [doc("doc_001", "unknown", 1)] }, undefined, [], required, { doc_001: "company-id_card" });
    expect(c.portalDocuments).toHaveLength(3);
    expect(c.portalDocuments?.[0]).toMatchObject({ key: "company-id_card", fileName: "doc_001.pdf", ok: false, issue: "unrecognized", processingPending: false });
  });

  it("blames a name mismatch on the payslip, not on the ID it was compared with", async () => {
    const { fromOrchestratorCase } = await import("@/lib/orchestrator-adapter");
    const flag = { flag_id: "flag_001", rule_id: "R-PF-008", severity: "medium" as const, title: "Nume", explanation: "id_card says A; payslip says B", evidence: [{ doc_id: "doc_001", page: 1, bbox: [0, 0, 1, 1] }, { doc_id: "doc_003", page: 1, bbox: [0, 0, 1, 1] }], status: "sent_to_client" as const, client_fixable: true, fix_message: "Numele de pe documente nu coincide." };
    const c = fromOrchestratorCase({ ...base, status: "waiting_client", flags: [flag], documents: [doc("doc_001", "id_card", 0.98, 5), doc("doc_002", "proof_of_address", 0.95, 3), doc("doc_003", "payslip", 0.99, 6)] }, undefined, [], required);
    expect(c.portalDocuments?.map((d) => [d.type, d.ok, d.clientMessage ?? null])).toEqual([["id_card", true, null], ["proof_of_address", true, null], ["payslip", false, "Numele de pe documente nu coincide."]]);
  });

  it("never gives the client a message from a flag it cannot fix", async () => {
    const { clientMessagesFor } = await import("@/lib/orchestrator-adapter");
    const tamper = { flag_id: "flag_002", rule_id: "R-PF-010", severity: "high" as const, title: "PDF", explanation: "edited", evidence: [{ doc_id: "doc_003", page: 1, bbox: [0, 0, 1, 1] }], status: "open" as const, client_fixable: false, fix_message: "secret" };
    expect(clientMessagesFor({ documents: [doc("doc_003", "payslip", 0.99, 6)], flags: [tamper] }, "doc_003")).toEqual([]);
  });

  it("puts unclassified files with no remembered step on the first empty steps, in upload order", async () => {
    const { fromOrchestratorCase } = await import("@/lib/orchestrator-adapter");
    const c = fromOrchestratorCase({ ...base, documents: [doc("doc_001", "unknown", 1), doc("doc_003", "unknown", 0)] }, undefined, [], required);
    expect(c.portalDocuments).toHaveLength(3);
    expect(c.portalDocuments?.map((d) => [d.fileName ?? null, d.issue ?? null, d.processingPending ?? null])).toEqual([["doc_001.pdf", "unrecognized", false], ["doc_003.pdf", null, true], [null, null, null]]);
  });

  it("adds a step only when every step already has a file, so nothing is hidden", async () => {
    const { fromOrchestratorCase } = await import("@/lib/orchestrator-adapter");
    const c = fromOrchestratorCase({ ...base, documents: ["doc_001", "doc_002", "doc_003", "doc_004"].map((id) => doc(id, "unknown", 1)) }, undefined, [], required);
    expect(c.portalDocuments).toHaveLength(4);
    expect(c.portalDocuments?.[3]).toMatchObject({ fileName: "doc_004.pdf", issue: "unrecognized" });
  });
});

describe("Backend cases beyond the fixtures", () => {
  it("opens a portal case in the orchestrator with backend roles and the backend PF playbook", async () => {
    const posted: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/orch/cases" && init?.method === "POST") { const body = JSON.parse(String(init.body)) as Record<string, unknown>; posted.push(body); return response({ ...body, status: "intake", documents: [], flags: [], risk_draft: null, decision: null }); }
      if (url === "/api/orch/playbooks") return response([pfPlaybook]);
      return response([]);
    });
    vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    const c = await api.createPortalCase("PF", [{ id: "p_pf", name: " Ana Pop ", role: "titular" }]);
    expect(c.id.startsWith(api.LIVE_PREFIX)).toBe(true);
    expect(api.isRealCase(c.id)).toBe(true);
    expect(posted[0]).toMatchObject({ playbook_id: "pb_cont_pf_v1", customer_type: "PF", company: null, persons: [{ person_id: "p_pf", role: "applicant", full_name: "Ana Pop" }] });
    expect(c.portalDocuments?.map((d) => d.type)).toEqual(["id_card", "proof_of_address", "payslip"]);
    expect(localStorage.getItem("dosarai-demo-cases-v1")).toBeNull();
  });

  it("falls back to a local demo case when the orchestrator is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const api = await import("@/api/client");
    const c = await api.createPortalCase("PF", [{ id: "p_pf", name: "Mara Exemplu", role: "titular" }]);
    expect(c.id.startsWith("demo_")).toBe(true);
  });

  it("lists every case the orchestrator holds, not only the two fixtures", async () => {
    const other = { ...fixture, case_id: "live_pj_1" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/orch/cases") return response([{ case_id: "live_pj_1" }, { case_id: fixture.case_id }]);
      if (url === "/api/orch/cases/live_pj_1") return response(other);
      // Any other backend case keeps its own id.
      const id = url.match(/^\/api\/orch\/cases\/([^/]+)$/)?.[1];
      return response(id ? { ...fixture, case_id: id } : fixture);
    }));
    const api = await import("@/api/client");
    const cases = await api.listCases();
    expect(cases[0]).toMatchObject({ id: "live_pj_1", source: "backend" });
    expect(cases.filter((c) => c.id === fixture.case_id)).toHaveLength(1);
  });
});
