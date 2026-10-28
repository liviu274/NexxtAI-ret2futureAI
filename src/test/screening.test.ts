import { describe, expect, it } from "vitest";
import { getCase, getScreeningMatch, getAuditLog, resolveScreeningMatch } from "@/api/client";
import { cases } from "@/mocks/data";
import { screeningLists } from "@/mocks/screening_lists";
import { canCopyClientMessage, matchKind, screeningRows, validateScreeningResolution } from "@/lib/screening";
import { resolveEvidence } from "@/lib/dataset";

const id = "case_pj_13_pep_administrator";
describe("Mock screening requirements", () => {
  it("adds the same PJ company with Carmen Radu born in 1981", () => {
    const c = cases.find((c) => c.id === id);
    expect(c?.company?.name).toBe("Atelier Exemplu Demo SRL");
    expect(c?.persons.find((p) => p.role === "administrator")).toMatchObject({ name: "Carmen Radu", birthYear: 1981 });
    expect(c?.flags.find((f) => f.ruleId === "R-PJ-024")).toMatchObject({ severity: "high", stage: "screening", evidence: [{ list_entry_key: "PEP-RO-121#CARMENRADU#1981#CY", score: 92 }] });
  });
  it("compares Nicolae Toma 1990 against OFAC-106 1994 at 74%", async () => {
    const match = await getScreeningMatch(id, "pj13-sanctions");
    expect(match).toMatchObject({ score: 74, client: { name: "Nicolae Toma", birthYear: 1990 }, entry: { id_sursa: "OFAC-106", anul_nasterii: 1994, cetatenie: "GR" } });
    if (!match) throw new Error("Missing match");
    expect(screeningRows(match).find((r) => r.label === "An naștere")).toMatchObject({ client: 1990, list: 1994, matches: false });
    expect(screeningRows(match).find((r) => r.label === "Nume")?.matches).toBe(true);
    expect(matchKind(match)).toBe("possible");
  });
  it("confirms Carmen Radu on name and birth year, like the backend", async () => {
    const match = await getScreeningMatch(id, "pj13-pep");
    if (!match) throw new Error("Missing match");
    expect(match.entry).toMatchObject({ id_sursa: "PEP-RO-121", cetatenie: "CY" });
    expect(matchKind(match)).toBe("confirmed");
  });
  it("keeps screening evidence free of document coordinates and client messages", () => {
    const flag = cases.find((c) => c.id === id)?.flags[0];
    if (!flag || !flag.evidence[0]) throw new Error("Missing flag");
    expect(canCopyClientMessage(flag)).toBe(false);
    expect(flag.evidence[0]).not.toHaveProperty("documentId");
    expect(resolveEvidence(flag.evidence[0], flag, { bbox: [0, 0, 1, 1] })).toEqual(flag.evidence[0]);
  });
  it("screens 25 sanctions and 25 PEP entries for a clean case, without adverse media", () => {
    expect(cases.find((c) => c.id === "case_pj_00_corect_control")?.screeningSummary).toEqual({ sanctions: 25, pep: 25, news: 0, matches: 0 });
    expect(screeningLists.every((e) => "id_sursa" in e)).toBe(true);
  });
  it("requires a nonblank reason to ignore a match", () => {
    expect(() => validateScreeningResolution("dismissed", " ")).toThrow();
    expect(() => validateScreeningResolution("dismissed", "Anii nașterii diferă")).not.toThrow();
  });
  it("records officer confirmation without approving the case", async () => {
    await resolveScreeningMatch(id, "pj13-pep", "confirmed");
    const c = await getCase(id);
    expect(c?.flags[0]?.screeningResolution).toBe("confirmed");
    expect(c?.status).toBe("În analiză");
    expect((await getAuditLog(id)).at(-1)).toMatchObject({ actor: "human", stage: "Screening", action: "Potrivire confirmată de ofițer" });
  });
  it("reads back the officer's ignored match and reason", async () => {
    await resolveScreeningMatch(id, "pj13-sanctions", "dismissed", "Anii nașterii diferă");
    expect((await getCase(id))?.flags[1]).toMatchObject({ screeningResolution: "dismissed", screeningReason: "Anii nașterii diferă" });
    expect((await getAuditLog(id)).at(-1)?.output).toContain("Anii nașterii diferă");
  });
});