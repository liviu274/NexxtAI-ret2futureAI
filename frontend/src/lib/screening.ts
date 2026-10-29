import type { Flag } from "@/types";
import type { ScreeningMatch } from "@/types/extensions";
import { isTamper } from "./review";

export const isScreeningFlag = (flag: Flag) => flag.stage === "screening";
export const canCopyClientMessage = (flag: Flag) => !isScreeningFlag(flag) && !isTamper(flag) && flag.client_fixable === true && flag.fix_message != null;

export function screeningRows(match: ScreeningMatch) {
  if (!("id_sursa" in match.entry)) return [];
  const entry = match.entry;
  const values = [
    ["Nume", match.client.name, entry.nume_complet],
    ["An naștere", match.client.birthYear, entry.anul_nasterii],
    ["Cetățenie", match.client.citizenship, entry.cetatenie],
    ["Act identitate", match.client.identityDocument, entry.act_identitate_cunoscut],
  ] as const;
  return values.map(([label, client, list]) => ({ label, client: client ?? "Nedisponibil", list, matches: client !== undefined && String(client).trim().toLocaleLowerCase("ro") === String(list).trim().toLocaleLowerCase("ro") }));
}

// Mirrors the backend rule (checks/screening.py): a known ID number, or name plus birth year,
// confirms the match; a name match with a different birth year is only possible.
export function matchKind(match: ScreeningMatch): "confirmed" | "possible" {
  const rows = screeningRows(match);
  const ok = (label: string) => rows.find((r) => r.label === label)?.matches === true;
  return ok("Act identitate") || (ok("Nume") && ok("An naștere")) ? "confirmed" : "possible";
}
export const matchKindLabels = { confirmed: "Potrivire confirmată", possible: "Potrivire posibilă – trebuie confirmată de ofițer" } as const;

export function validateScreeningResolution(resolution: "confirmed" | "dismissed", reason: string) {
  if (resolution === "dismissed" && !reason.trim()) throw new Error("Motivul ignorării este obligatoriu.");
}