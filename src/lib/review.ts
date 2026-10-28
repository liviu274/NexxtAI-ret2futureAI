import type { Case, Flag, Person, Playbook, RiskDraft } from "@/types";
export const flagStatusLabels = { open: "Deschis", sent_to_client: "Trimis clientului", resolved: "Rezolvat", dismissed: "Ignorat" };
export const tamperRules = ["R-PF-012", "R-PF-013", "R-PF-014", "R-PF-015", "R-PJ-018", "R-PJ-019", "R-PJ-020"];
export const isTamper = (f: Flag) => tamperRules.includes(f.ruleId) || /falsific|tamper|metadate|font|EOF/i.test(f.title);
export const blockingFlags = (flags: Flag[]) => flags.filter((f) => ["high", "critical"].includes(f.severity) && ["open", "sent_to_client"].includes(f.status ?? "open"));
export const problemLabel = (n: number) => `${n} ${n === 1 ? "problemă" : "probleme"}`;
export const passedChecks = (c: Case, p?: Playbook | null) => Math.max(0, (c.executedRuleIds?.length ?? p?.rules.length ?? 0) - c.flags.length);
export const ADDRESS_FEEDBACK = "Adresa de pe factură nu este aceeași cu cea din actul de identitate. Încarcă o factură pe adresa din act sau un document care dovedește adresa nouă.";
export function portalSteps(p?: Playbook | null) { return p?.requiredDocuments ?? []; }
// Same ordering as the pipeline's draft: the worst open flag sets the proposed level.
export function riskFromFlags(flags: Flag[]): RiskDraft {
  const open = flags.filter((f) => f.status !== "dismissed" && f.status !== "resolved");
  const level = open.some((f) => f.severity === "critical") ? "critical" : open.some((f) => f.severity === "high") ? "high" : open.some((f) => f.severity === "medium") ? "medium" : "low";
  return { level, reasons: open.map((f) => ({ factor: f.ruleId, value: f.explanation, impact: "crește" as const })) };
}
export const roleLabels: Record<Person["role"], string> = { titular: "titular", UBO: "beneficiar real", semnatar: "delegat", administrator: "administrator" };
// Role-level PJ rules name a single person; UBO rules need the name from the explanation.
const ruleRoles: Record<string, Person["role"]> = { "R-PJ-009": "administrator", "R-PJ-010": "administrator", "R-PJ-011": "administrator", "R-PJ-012": "administrator", "R-PJ-021": "administrator", "R-PJ-024": "administrator", "R-PJ-013": "semnatar", "R-PJ-014": "semnatar", "R-PJ-015": "semnatar", "R-PJ-023": "semnatar" };
export function flagPerson(c: Case, f: Flag): Person | undefined {
  const id = f.personId ?? f.screeningPersonId;
  if (id) return c.persons.find((p) => p.id === id);
  if (c.customerType !== "PJ") return undefined;
  const role = ruleRoles[f.ruleId];
  const byRole = role ? c.persons.filter((p) => p.role === role) : [];
  if (byRole.length === 1) return byRole[0];
  return c.persons.find((p) => p.role !== "titular" && f.explanation.includes(p.name));
}