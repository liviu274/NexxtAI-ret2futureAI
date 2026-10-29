import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/orchestrator-pj.json";
const id = "case_pj_07_procente_diferite";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Hybrid orchestrator client", () => {
  it("falls back to mocks and caches an unsuccessful probe", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline")); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    const c = await api.getCase(id); const list = await api.listCases();
    expect(c).toMatchObject({ id, source: "backend", serviceUnavailable: true }); expect(list.some((c) => c.id === id)).toBe(true);
    expect(fetch.mock.calls.filter(([url]) => url === "/api/orch/health")).toHaveLength(1);
  });
  it("never probes the backend during SSR", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); vi.stubGlobal("window", undefined);
    expect(await (await import("@/api/client")).orchestratorAvailable()).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it("shares one bounded probe across concurrent callers", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    vi.stubGlobal("fetch", fetch); const api = await import("@/api/client");
    const first = api.orchestratorAvailable(); const second = api.orchestratorAvailable();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await first).toBe(false); expect(await second).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([["aprobat", "approved"], ["respins", "rejected"], ["documente", "documents_requested"]] as const)("maps %s payload and named analyst", async (decision, outcome) => {
    const fetch = vi.fn().mockResolvedValue(response(fixture)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client"); await api.submitDecision(id, decision, "Verificat");
    expect(fetch).toHaveBeenLastCalledWith(`/api/orch/cases/${id}/decision`, expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", "X-Analyst": "Elena Radu" }, body: JSON.stringify({ outcome, note: "Verificat" }) }));
    expect(localStorage.length).toBe(0);
  });
  it("surfaces the backend approval refusal in Romanian without changing demo data", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(fixture)).mockResolvedValueOnce(response({ detail: "cannot approve with unresolved high/critical flags: flag_001" }, 403)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    await expect(api.submitDecision(id, "aprobat", "")).rejects.toThrow("Aprobarea este blocată de probleme nerezolvate."); expect(localStorage.length).toBe(0);
  });
  it("reads real cases, audit integrity and ownership, while leaving PF cases mocked", async () => {
    const fetch = vi.fn((url: string) => Promise.resolve(response(url.endsWith("/audit") ? { entries: [], chain_valid: true } : url === "/api/orch/cases" ? [] : fixture)));
    vi.stubGlobal("fetch", fetch); const api = await import("@/api/client");
    expect(await api.getCase(id)).toMatchObject({ source: "backend", ownership: { declared: [{ pct: 50 }, { pct: 50 }] } });
    expect((await api.getOwnership(id)).edges.map((e) => e.pct)).toEqual([60, 40]);
    expect(await api.getAuditLogResult(id)).toEqual({ entries: [], chain_valid: true });
    const cases = await api.listCases(); expect(cases.filter((c) => c.source === "backend")).toHaveLength(2);
    expect(fetch.mock.calls.every(([url]) => !url.includes("case_pf_"))).toBe(true);
  });
  it("posts dismissals with a reason and falls back on later read failures", async () => {
    const fetch = vi.fn().mockResolvedValue(response(fixture)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    await api.dismissFlag(id, "flag_001", " Verificat ");
    expect(fetch).toHaveBeenLastCalledWith(`/api/orch/cases/${id}/flags/flag_001/dismiss`, expect.objectContaining({ headers: { "Content-Type": "application/json", "X-Analyst": "Elena Radu" }, body: JSON.stringify({ note: "Verificat" }) }));
    fetch.mockRejectedValue(new TypeError("stopped"));
    expect(await api.getCase(id)).toMatchObject({ source: "backend", serviceUnavailable: true });
    expect(await api.getAuditLogResult(id)).toMatchObject({ serviceUnavailable: true });
    expect((await api.getAuditLogResult(id)).chain_valid).toBeUndefined();
  });
  it("gives the backend's real reasons for a refused approval and a missing OCR key", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(fixture)).mockResolvedValueOnce(response({ detail: "cannot approve until medium flags are acknowledged (dismissed with a note): flag_002" }, 403)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    await expect(api.submitDecision(id, "respins", "")).rejects.toThrow("severitate medie");
    fetch.mockResolvedValueOnce(response(fixture)).mockResolvedValueOnce(response({ detail: "cannot approve before the full check (tamper, screening, risk) has run on every document" }, 403));
    await expect(api.submitDecision(id, "respins", "")).rejects.toThrow("verificarea completă");
    fetch.mockResolvedValue(response({ detail: "Document reading is not configured on the server (FEATHERLESS_API_KEY)" }, 503));
    await expect(api.dismissFlag(id, "flag_001", "Motiv")).rejects.toThrow("nu este configurată");
    expect(await api.orchestratorAvailable()).toBe(true); // the service is up, it only cannot read documents
  });
  it("tells the analyst when a critical dismissal waits for a second analyst", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(fixture)).mockResolvedValueOnce(response({ detail: "second analyst", pending: true }, 202)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    expect(await api.dismissFlag(id, "flag_001", "Motiv")).toMatchObject({ ok: false, pending: true, message: expect.stringContaining("al doilea analist") });
  });
  it("uses the analyst's token once the server asks for one", async () => {
    sessionStorage.setItem("dosarai-analyst-token", "secret-1");
    const fetch = vi.fn().mockResolvedValue(response(fixture)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client"); await api.submitDecision(id, "respins", "Motiv");
    expect(fetch).toHaveBeenLastCalledWith(`/api/orch/cases/${id}/decision`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret-1" }) }));
    expect((fetch.mock.lastCall?.[1] as RequestInit).headers).not.toHaveProperty("X-Analyst");
    sessionStorage.clear();
  });
  it("lets the client portal read only its own view, never the analyst's case file", async () => {
    const view = { case_id: id, playbook_id: "pb_cont_pj_v1", customer_type: "PJ", status: "waiting_client", created_at: "2026-10-28T10:00:00+02:00", decision: null, request_note: null,
      requests: [{ message: "Încărcați declarația semnată.", doc_ids: ["doc_003"] }], persons: fixture.persons, documents: [{ doc_id: "doc_003", doc_type: "ubo_declaration", owner_person_id: null }] };
    const fetch = vi.fn((url: string) => Promise.resolve(response(url.endsWith("/client-status") ? view : url.endsWith("/health") ? { ok: true } : fixture))); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    expect(await api.getClientCaseStatus(id)).toMatchObject({ state: "action_needed", client_messages: ["Încărcați declarația semnată."] });
    expect(fetch.mock.calls.some(([url]) => url === `/api/orch/cases/${id}`)).toBe(false);
  });
  it("confirms a screening match on the server and keeps the flag", async () => {
    const fetch = vi.fn().mockResolvedValue(response(fixture)); vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    expect(await api.resolveScreeningMatch(id, "flag_004", "confirmed", "Aceeași persoană")).toEqual({ ok: true });
    expect(fetch).toHaveBeenLastCalledWith(`/api/orch/cases/${id}/flags/flag_004/confirm`, expect.objectContaining({ method: "POST", body: JSON.stringify({ note: "Aceeași persoană" }) }));
  });
  it("asks the server to check the upload is this step's document, and shows why it was refused", async () => {
    const live = { ...fixture, case_id: "live_pf_1", customer_type: "PF", playbook_id: "pb_cont_pf_v1", status: "intake", company: null, documents: [], flags: [],
      persons: [{ person_id: "p_pf", role: "applicant", full_name: "Mara Exemplu" }] };
    const refused = { detail: { code: "not_clear", message: "Fotografia nu este clară: o parte din text nu poate fi citită." } };
    const fetch = vi.fn((url: string, init?: RequestInit) => Promise.resolve(init?.method === "POST" ? response(refused, 422) : response(url.includes("/playbooks") ? [{ playbook_id: "pb_cont_pf_v1", process_name: "Cont PF", customer_type: "PF", required_documents: [{ doc_type: "id_card", applies_to: "applicant", alternatives: [] }, { doc_type: "payslip", applies_to: "applicant", alternatives: [] }], rules: [] }] : live)));
    vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    await expect(api.checkPortalDocument("live_pf_1", 1, new File(["x"], "ci.jpg", { type: "image/jpeg" }))).rejects.toThrow("Fotografia nu este clară");
    const post = fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toMatch(/\/cases\/live_pf_1\/documents\?expected=/);
    expect(await api.orchestratorAvailable()).toBe(true); // a refused document is not a service outage
  });
  it("refuses an upload it cannot verify instead of simulating a check", async () => {
    vi.stubEnv("VITE_DEMO_UPLOADS", "false");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const api = await import("@/api/client");
    const c = await api.createPortalCase("PF", [{ id: "p_pf", name: "Mara Exemplu", role: "titular" }]);
    await expect(api.checkPortalDocument(c.id, 1, new File(["x"], "orice.png"))).rejects.toThrow("nu pot fi verificate");
    vi.unstubAllEnvs();
  });
  it("stores consent and the selfie with the case, and shows the client why a selfie was refused", async () => {
    const live = { ...fixture, case_id: "live_pf_2", customer_type: "PF", playbook_id: "pb_cont_pf_v1", status: "intake", company: null, documents: [], flags: [],
      persons: [{ person_id: "p_pf", role: "applicant", full_name: "Mara Exemplu" }] };
    const refused = { detail: { code: "no_face", message: "Nu îți vedem fața în fotografie." } };
    const fetch = vi.fn((url: string, init?: RequestInit) => Promise.resolve(
      init?.method === "POST" && url.endsWith("/identity") ? response(refused, 422)
        : init?.method === "POST" && url.endsWith("/consent") ? response({ at: "2026-10-29T10:00:00+02:00", items: ["biometric", "kyc", "screening"] })
          : url.endsWith("/client-status") ? response({ ...live, onboarding: { consent: true, identity: true } }) : response(live)));
    vi.stubGlobal("fetch", fetch);
    const api = await import("@/api/client");
    expect((await api.saveConsent("live_pf_2", ["kyc", "biometric", "screening"])).at).toBe("2026-10-29T10:00:00+02:00");
    await expect(api.saveIdentityCheck("live_pf_2", { selfie: "data:image/jpeg;base64,/9j/", liveness: { blink: true, turn: true, method: "mediapipe" } })).rejects.toThrow("Nu îți vedem fața");
    const body = JSON.parse(fetch.mock.calls.find(([url]) => String(url).endsWith("/identity"))?.[1]?.body as string);
    expect(body).toMatchObject({ selfie: "data:image/jpeg;base64,/9j/", liveness: { method: "mediapipe" }, fallback_reason: null });
    // Done in another browser: the orchestrator says so.
    expect((await api.getOnboarding("live_pf_2")).stored).toEqual({ consent: true, identity: true });
  });
  it("gives the officer the stored selfie and the face comparison", async () => {
    const review = { consent: { at: "2026-10-29T10:00:00+02:00", items: ["kyc"] }, face: { status: "no_match", score: 0.12, threshold: 0.363 },
      identity: { captured_at: "2026-10-29T10:01:00+02:00", liveness: { blink: false, turn: false, method: "none" }, fallback_reason: "camera", selfie_url: "/cases/live_pf_3/identity/selfie" } };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response(url.endsWith("/identity") ? review : { ok: true }))));
    const api = await import("@/api/client");
    expect(await api.getIdentityReview("live_pf_3")).toMatchObject({ stored: true, face: { status: "no_match", score: 0.12 },
      identity: { selfie: "/api/orch/cases/live_pf_3/identity/selfie", fallbackReason: "camera", liveness: { method: "none" } } });
  });
});

