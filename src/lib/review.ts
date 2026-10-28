import type { Case, Flag, Playbook } from "@/types";
export const flagStatusLabels = {
  open: "Deschis",
  sent_to_client: "Trimis clientului",
  resolved: "Rezolvat",
  dismissed: "Ignorat",
};
export const tamperRules = [
  "R-PF-012",
  "R-PF-013",
  "R-PF-014",
  "R-PF-015",
  "R-PJ-018",
  "R-PJ-019",
  "R-PJ-020",
];
export const isTamper = (f: Flag) =>
  tamperRules.includes(f.ruleId) || /falsific|tamper|metadate|font|EOF/i.test(f.title);
// Medium flags block too until acknowledged (dismissed with a reason); the orchestrator enforces the same rule.
export const blockingFlags = (flags: Flag[]) =>
  flags.filter(
    (f) =>
      ["medium", "high", "critical"].includes(f.severity) &&
      ["open", "sent_to_client"].includes(f.status ?? "open"),
  );
export const problemLabel = (n: number) => `${n} ${n === 1 ? "problemă" : "probleme"}`;
export const passedChecks = (c: Case, p?: Playbook | null) =>
  Math.max(0, (c.executedRuleIds?.length ?? p?.rules.length ?? 0) - c.flags.length);
export const ADDRESS_FEEDBACK =
  "Adresa de pe factură nu este aceeași cu cea din actul de identitate. Încarcă o factură pe adresa din act sau un document care dovedește adresa nouă.";
export function portalSteps(p?: Playbook | null) {
  return p?.requiredDocuments ?? [];
}
