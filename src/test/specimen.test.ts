import { describe, expect, it } from "vitest";
import { cases, playbooks } from "@/mocks/data";
import {
  findTruthBBox,
  normalizedBBox,
  ownershipRows,
  REFERENCE_DATE,
  resolveEvidence,
} from "@/lib/dataset";

describe("SPECIMEN dataset requirements", () => {
  it("uses 28.10.2026 as its reference date", () => {
    expect(REFERENCE_DATE).toBe("2026-10-28");
    expect(cases.every((c) => c.createdAt === "28.10.2026")).toBe(true);
  });
  it("lists all 26 archive cases plus the screening case with nine featured ones first", () => {
    expect(cases).toHaveLength(27);
    expect(cases.slice(0, 9).map((c) => c.id)).toEqual([
      "case_pf_12_modificari_combinate",
      "case_pj_07_procente_diferite",
      "case_pf_05_adresa_factura_diferita",
      "case_pf_03_act_expirat",
      "case_pf_01_factura_lipsa",
      "case_pf_00_corect_control",
      "case_pj_06_ubo_diferit",
      "case_pj_12_probleme_combinate",
      "case_pj_00_corect_control",
    ]);
  });
  it("has four tamper flags and a critical risk on the main PF case", () => {
    const c = cases[0];
    expect(c?.riskDraft.level).toBe("critical");
    expect(c?.flags.map((f) => f.ruleId)).toEqual(["R-PF-012", "R-PF-013", "R-PF-014", "R-PF-015"]);
    expect(c?.riskDraft.reasons).toHaveLength(4);
    expect(c?.flags.every((f) => f.evidence[0]?.documentId === "doc_003")).toBe(true);
  });
  it("leaves the utility bill absent from the missing-bill case", () => {
    expect(
      cases.find((c) => c.id === "case_pf_01_factura_lipsa")?.documents.map((d) => d.id),
    ).toEqual(["doc_001", "doc_003"]);
  });
  it("has no flags and low risk on both clean controls", () => {
    const clean = cases.filter((c) => c.id.endsWith("00_corect_control"));
    expect(clean).toHaveLength(2);
    for (const c of clean) {
      expect(c.flags).toEqual([]);
      expect(c.riskDraft.level).toBe("low");
    }
  });
  it("compares direct ONRC 60/40 ownership with declared 50/50", () => {
    const c = cases.find((c) => c.id === "case_pj_07_procente_diferite");
    if (!c) throw new Error("Missing main PJ case");
    expect(ownershipRows(c).map((r) => [r.person.name, r.registry, r.declared, r.matches])).toEqual(
      [
        ["Tudor Exemplu", 60, 50, false],
        ["Irina Model", 40, 50, false],
      ],
    );
  });
  it("keeps the expiry date supplied by the user", () => {
    expect(cases.find((c) => c.id === "case_pf_03_act_expirat")?.flags[0]?.explanation).toBe(
      "Documentul a expirat la 2025-01-15.",
    );
  });
  it("preserves supplied net amounts", () => {
    expect(cases[0]?.flags.find((f) => f.ruleId === "R-PF-014")?.explanation).toBe(
      "Net calculat: 4680.00 RON; net afișat: 7480.00 RON.",
    );
  });
  it("retains every PF rule and 27 PJ rule IDs", () => {
    expect(playbooks[0]?.rules.map((r) => r.id)).toEqual([
      "R-PF-001",
      "R-PF-002",
      "R-PF-003",
      "R-PF-004",
      "R-PF-005",
      "R-PF-012",
      "R-PF-013",
      "R-PF-014",
      "R-PF-015",
    ]);
    expect(playbooks[1]?.rules).toHaveLength(27);
  });
  it("converts normalized top-left x0 y0 x1 y1 boxes", () => {
    expect(normalizedBBox([0.1, 0.2, 0.4, 0.6])).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.4 - 0.1,
      height: 0.6 - 0.2,
    });
    expect(normalizedBBox([0.5, 0.4, 0.1, 1])).toBeUndefined();
  });
  it("uses exact field truth and never invents a missing box", () => {
    const truth = { doc_003: { net_salary: { bbox: [0.2, 0.3, 0.5, 0.4] } } };
    expect(findTruthBBox(truth, "doc_003", "net_salary")?.x).toBe(0.2);
    const f = cases[0]?.flags[0];
    if (!f) throw new Error("Missing flag");
    expect(resolveEvidence({ documentId: "doc_003", page: 0 }, f, truth).bbox).toBeUndefined();
    expect(
      resolveEvidence({ documentId: "doc_003", page: 0, field: "net_salary" }, f, truth).bbox?.x,
    ).toBe(0.2);
  });
});
