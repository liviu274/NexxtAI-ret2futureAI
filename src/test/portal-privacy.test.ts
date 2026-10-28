import { beforeEach, describe, expect, it } from "vitest";
import { checkPortalDocument, createPortalCase, getClientPortalCase, listMyPortalCases, submitPortalCase } from "@/api/client";

beforeEach(() => localStorage.clear());

describe("Client portal privacy", () => {
  it("never sends flags, risk, evidence or officer findings to the portal", async () => {
    const c = await createPortalCase("PF", [{ id: "p_pf", name: "Mara Exemplu", role: "titular" }]);
    await checkPortalDocument(c.id, 1, new File(["x"], "buletin.png"));
    await checkPortalDocument(c.id, 2, new File(["x"], "factura.png"));
    await checkPortalDocument(c.id, 3, new File(["x"], "fluturas_modificat.png")); // 4 tamper flags for the officer
    await submitPortalCase(c.id);

    const view = await getClientPortalCase(c.id);
    const json = JSON.stringify(view);
    expect(view).toMatchObject({ stage: "in_analiza", documents: [{ ok: true }, { ok: true }, { ok: true }] });
    for (const leak of ["flags", "riskDraft", "officerIssue", "evidence", "R-PF-012", "critical", "photoshop"]) expect(json).not.toContain(leak);

    const listed = JSON.stringify(await listMyPortalCases());
    for (const leak of ["flags", "riskDraft", "officerIssue"]) expect(listed).not.toContain(leak);
  }, 30000);
});
