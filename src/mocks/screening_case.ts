import type { Case, Flag, Playbook } from "@/types";

export function createScreeningCase(base: Case, playbook: Playbook): Case {
  const makeFlag = (id: string, ruleId: string, personId: string, key: string, score: number, title: string, explanation: string): Flag => ({
    id, ruleId, severity: "high", stage: "screening", screeningPersonId: personId, title, explanation,
    ruleText: playbook.rules.find((r) => r.id === ruleId)?.text ?? "",
    evidence: [{ list_entry_key: key, score }], clientFixMessage: "",
  });
  return {
    ...structuredClone(base), id: "case_pj_13_pep_administrator", documents: [], status: "În analiză",
    persons: [
      { id: "p_admin", name: "Carmen Radu", role: "administrator", birthYear: 1981, citizenship: "RO", identityDocument: "RX 481213" },
      { id: "p_ubo_1", name: "Nicolae Toma", role: "UBO", birthYear: 1990, citizenship: "RO", identityDocument: "RX 552019", ownershipPct: 60 },
      ...base.persons.filter((p) => p.id !== "p_admin" && p.id !== "p_ubo_1"),
    ],
    ...(base.ownership ? { ownership: {
      registry: base.ownership.registry.map((p) => p.id === "p_ubo_1" ? { ...p, name: "Nicolae Toma" } : p),
      declared: base.ownership.declared.map((p) => p.id === "p_ubo_1" ? { ...p, name: "Nicolae Toma" } : p),
    } } : {}),
    flags: [
      makeFlag("pj13-pep", "R-PJ-024", "p_admin", "PEP-RO-121#CARMENRADU#1981#CY", 92, "Administrator cu potrivire PEP", "Carmen Radu, născută în 1981, corespunde PEP-RO-121 (nume și an de naștere). Potrivire 92%; confirmarea aparține ofițerului."),
      makeFlag("pj13-sanctions", "R-PJ-022", "p_ubo_1", "OFAC-106#NICOLAETOMA#1994#GR", 74, "UBO cu potrivire posibilă în sancțiuni", "Nicolae Toma: numele corespunde OFAC-106, dar anul nașterii diferă (client 1990, listă 1994). Potrivire 74%; confirmarea aparține ofițerului."),
    ],
    screeningSummary: { sanctions: 25, pep: 25, news: 0, matches: 2 },
    riskDraft: { level: "high", reasons: [{ factor: "Screening PEP", value: "Administrator: potrivire neconfirmată 92%", impact: "crește" }, { factor: "Screening sancțiuni", value: "UBO: potrivire parțială neconfirmată 74%", impact: "crește" }] },
  };
}