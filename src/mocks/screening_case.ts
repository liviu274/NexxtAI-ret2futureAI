import type { Case, Flag, Playbook } from "@/types";

export function createScreeningCase(base: Case, playbook: Playbook): Case {
  const makeFlag = (
    id: string,
    ruleId: string,
    personId: string,
    key: string,
    score: number,
    title: string,
    explanation: string,
  ): Flag => ({
    id,
    ruleId,
    severity: "high",
    stage: "screening",
    screeningPersonId: personId,
    title,
    explanation,
    ruleText: playbook.rules.find((r) => r.id === ruleId)?.text ?? "",
    evidence: [{ list_entry_key: key, score }],
    clientFixMessage: "",
  });
  return {
    ...structuredClone(base),
    id: "case_pj_13_pep_administrator",
    documents: [],
    status: "În analiză",
    persons: [
      {
        id: "p_admin",
        name: "Carmen Radu",
        role: "administrator",
        birthYear: 1981,
        citizenship: "Română",
        identityDocument: "SPECIMEN CR 000121",
      },
      {
        id: "p_ubo_1",
        name: "Nicolae Toma",
        role: "UBO",
        birthYear: 1990,
        citizenship: "Română",
        identityDocument: "SPECIMEN NT 000106",
        ownershipPct: 60,
      },
      ...base.persons.filter((p) => p.id !== "p_admin" && p.id !== "p_ubo_1"),
    ],
    ...(base.ownership
      ? {
          ownership: {
            registry: base.ownership.registry.map((p) =>
              p.id === "p_ubo_1" ? { ...p, name: "Nicolae Toma" } : p,
            ),
            declared: base.ownership.declared.map((p) =>
              p.id === "p_ubo_1" ? { ...p, name: "Nicolae Toma" } : p,
            ),
          },
        }
      : {}),
    flags: [
      makeFlag(
        "pj13-pep",
        "R-PJ-024",
        "p_admin",
        "pep_carmen_radu",
        92,
        "Administrator cu potrivire PEP",
        "Carmen Radu corespunde înregistrării fictive PEP-RO-121. Potrivire 92%; confirmarea aparține ofițerului.",
      ),
      makeFlag(
        "pj13-sanctions",
        "R-PJ-022",
        "p_ubo_1",
        "sanctions_nicolae_toma",
        74,
        "UBO cu potrivire parțială în sancțiuni",
        "Nicolae Toma: anul nașterii clientului 1990 diferă de 1994 în OFAC-106. Potrivire 74%; confirmarea aparține ofițerului.",
      ),
    ],
    screeningSummary: { sanctions: 25, pep: 25, news: 50, matches: 2 },
    riskDraft: {
      level: "high",
      reasons: [
        {
          factor: "Screening PEP",
          value: "Administrator: potrivire neconfirmată 92%",
          impact: "crește",
        },
        {
          factor: "Screening sancțiuni",
          value: "UBO: potrivire parțială neconfirmată 74%",
          impact: "crește",
        },
      ],
    },
  };
}
