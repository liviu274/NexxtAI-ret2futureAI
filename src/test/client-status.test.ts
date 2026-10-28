import { describe, it, expect } from "vitest";
import { toClientCaseStatus } from "@/lib/client-status";
import { cases } from "@/mocks/data";
import type { Case } from "@/types";
const base = cases.find((c) => c.flags.length > 2)!;
const make = (p: Partial<Case>) => ({ ...structuredClone(base), ...p }) as Case;
describe("client case status", () => {
  it("maps statuses to the 4 steps", () => {
    expect(toClientCaseStatus(make({ status: "Nou" }))).toMatchObject({
      step: 1,
      state: "current",
    });
    expect(toClientCaseStatus(make({ status: "Se verifică" }))).toMatchObject({
      step: 2,
      state: "current",
    });
    expect(toClientCaseStatus(make({ status: "Documente solicitate" }))).toMatchObject({
      step: 2,
      state: "action_needed",
    });
    expect(toClientCaseStatus(make({ status: "În analiză" }))).toMatchObject({
      step: 3,
      state: "current",
    });
    expect(toClientCaseStatus(make({ status: "Aprobat" }))).toMatchObject({
      step: 4,
      state: "done",
      decision: "approved",
    });
    expect(toClientCaseStatus(make({ status: "Respins" }))).toMatchObject({
      step: 4,
      state: "done",
      decision: "rejected",
    });
  });
  it("never leaks internal data", () => {
    const json = JSON.stringify(toClientCaseStatus(make({ status: "Documente solicitate" })));
    for (const f of base.flags) {
      expect(json).not.toContain(f.id);
      if (!f.client_fixable) expect(json).not.toContain(f.title);
    }
    expect(json).not.toMatch(/risk|Elena|rule|screening|PEP/i);
    expect(Object.keys(toClientCaseStatus(base)).sort()).toEqual([
      "client_messages",
      "dates",
      "decision",
      "state",
      "step",
      "upload_step",
    ]);
  });
  it("looks identical in review for clean and flagged cases", () => {
    const clean = make({ status: "În analiză", flags: [] });
    const dirty = make({ status: "În analiză" });
    expect(toClientCaseStatus(clean)).toEqual(toClientCaseStatus(dirty));
  });
});
