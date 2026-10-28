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
    expect(c?.id).toBe(id); expect(c?.source).not.toBe("backend"); expect(list.some((c) => c.id === id)).toBe(true);
    expect(fetch.mock.calls.filter(([url]) => url === "/api/orch/cases")).toHaveLength(1);
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
    const fetch = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ detail: "cannot approve with unresolved high/critical flags: flag_001" }, 403)); vi.stubGlobal("fetch", fetch);
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
    expect((await api.getCase(id))?.source).not.toBe("backend");
    expect((await api.getAuditLogResult(id)).chain_valid).toBeUndefined();
  });
});
