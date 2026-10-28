// @vitest-environment node
// (Node's own fetch/FormData/File: jsdom's File cannot be sent by Node's fetch.)
// Opt-in: runs the real API client against a running orchestrator with the seeded cases.
//   cd NexxtAI-ret2futureAI/projects/orchestrator && .venv/bin/python -m nexxt_orchestrator.seed
//   .venv/bin/uvicorn nexxt_orchestrator.api:app --port 8000 --env-file .env
//   LIVE_API_URL=http://localhost:8000 VITE_USE_MOCK=false VITE_API_BASE_URL=http://localhost:8000 npx vitest run src/test/live-api.test.ts
// Set LIVE_PF_DOCS to the folder of a PF case's docs/ to also upload through the portal (needs the OCR key).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as api from "@/api/client";

const live = !!process.env["LIVE_API_URL"] && !api.USE_MOCK;

// The portal keeps "my cases" in the browser's storage; give Node a stand-in.
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
Object.assign(globalThis, { window: { localStorage: memory(), sessionStorage: memory() } });

describe.skipIf(!live)("live orchestrator API", () => {
  it("lists the seeded cases in the screen's shape", async () => {
    const cases = await api.listCases();
    expect(cases.length).toBeGreaterThanOrEqual(26);
    const pf12 = cases.find((c) => c.id === "case_pf_12_modificari_combinate");
    expect(pf12).toMatchObject({
      customerType: "PF",
      status: "În analiză",
      clientName: "Mara Exemplu",
    });
    expect(pf12?.flags.map((f) => f.ruleId).sort()).toEqual(["R-PF-010", "R-PF-011", "R-PF-012"]);
  });

  it("serves the review screen: case, page image, audit chain, playbook, ownership", async () => {
    const c = await api.getCase("case_pj_07_procente_diferite");
    expect(c?.ownership?.registry.length).toBeGreaterThan(0);
    const page = await fetch(c?.documents[0]?.pageImages[0] ?? "");
    expect(page.headers.get("content-type")).toBe("image/png");
    expect(await api.getAuditChainValid(c?.id ?? "")).toBe(true);
    expect((await api.getAuditLog(c?.id ?? "")).some((e) => e.stage === "Verificare reguli")).toBe(
      true,
    );
    expect((await api.getPlaybook("pb_cont_pj_v1"))?.rules.length).toBeGreaterThan(20);
    expect((await api.getOwnership(c?.id ?? "")).edges.length).toBeGreaterThan(0);
  });

  it("enforces the guardrails end to end", async () => {
    await expect(
      api.submitDecision("case_pf_12_modificari_combinate", "aprobat", ""),
    ).rejects.toThrow(/blocată/);
    const c = await api.getCase("case_pf_12_modificari_combinate");
    const critical = c?.flags.find((f) => f.severity === "critical");
    if (critical)
      expect(await api.dismissFlag(c?.id ?? "", critical.id, "verificat")).toMatchObject({
        pending: true,
      });
    if ((await api.getCase("case_pf_00_corect_control"))?.status !== "Aprobat")
      await api.submitDecision("case_pf_00_corect_control", "aprobat", "totul în regulă");
    await expect(api.submitDecision("case_pf_00_corect_control", "respins", "")).rejects.toThrow(
      /already decided/,
    );
    expect((await api.getCase("case_pf_00_corect_control"))?.status).toBe("Aprobat");
    expect(await api.getClientCaseStatus("case_pf_00_corect_control")).toMatchObject({
      step: 4,
      decision: "approved",
    });
  });

  it.skipIf(!process.env["LIVE_PF_DOCS"])(
    "runs a PF client through the portal with real document reading",
    { timeout: 180_000 },
    async () => {
      const dir = process.env["LIVE_PF_DOCS"] ?? "";
      const c = await api.createPortalCase("PF", [
        { id: "p_pf", name: "Mara Exemplu", role: "titular" },
      ]);
      expect(c.portalDocuments?.map((d) => d.type)).toEqual([
        "id_card",
        "proof_of_address",
        "payslip",
      ]);
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".pdf"))
        .sort();
      for (const [i, name] of files.entries()) {
        const result = await api.checkPortalDocument(
          c.id,
          i + 1,
          new File([readFileSync(join(dir, name))], name, { type: "application/pdf" }),
        );
        expect(result, name).toMatchObject({ ok: true });
      }
      await api.submitPortalCase(c.id);
      const status = await api.getClientCaseStatus(c.id);
      expect(status?.step).toBe(3);
      expect((await api.listMyPortalCases()).map((x) => x.id)).toContain(c.id);
    },
  );
});
