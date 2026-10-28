import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlaybook, getPlaybook, listPlaybooks, resetDemo } from "@/api/client";
import { fromBuilder, type BuilderResult } from "@/lib/playbook-builder";
// Real POST /playbooks/build body for PJ-ONB-01, produced by the builder's own report code (no LLM).
import response from "./fixtures/builder-pj.json";

const result = response as unknown as BuilderResult;
const pdf = () => new File(["%PDF-1.7"], "PJ-ONB-01.pdf", { type: "application/pdf" });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Playbook builder connection", () => {
  it("maps the builder report to the review page format", () => {
    const p = fromBuilder(result, "PJ-ONB-01.pdf");
    expect(p).toMatchObject({ id: "pb_cont_pj_v1", customerType: "PJ", coverage: 92, generatedBy: "llm", buildSeconds: 74.2, sourceName: "PJ-ONB-01.pdf" });
    expect(p.rules).toHaveLength(27);
    expect(p.clauses).toHaveLength(33);
    expect(p.clauses?.find((c) => c.ruleIds.includes("R-PJ-006"))?.status).toBe("Automatizată");
    expect(p.clauses?.find((c) => c.number === "5.3")).toMatchObject({ status: "Manuală" });
    expect(p.rules.find((r) => r.id === "R-PJ-006")?.params["clauza"]).toBeTruthy();
  });

  it("posts the PDF to the builder and serves the result to the review page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const built = await buildPlaybook(pdf());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/playbook/playbooks/build");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(await getPlaybook(built.id)).toMatchObject({ coverage: 92, generatedBy: "llm" });
    expect((await listPlaybooks()).filter((p) => p.id === built.id)).toHaveLength(1);
    await resetDemo();
    expect((await getPlaybook(built.id))?.generatedBy).toBe("llm"); // fixture again, not the built copy
  });

  it("explains when the builder is not running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(buildPlaybook(pdf())).rejects.toThrow("portul 8002");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));
    await expect(buildPlaybook(pdf())).rejects.toThrow("portul 8002");
  });

  it("explains a non-PDF upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Upload a PDF procedure" }), { status: 415 })));
    await expect(buildPlaybook(pdf())).rejects.toThrow("format PDF");
  });
});
