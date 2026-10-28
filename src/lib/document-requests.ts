import type { Case, Flag } from "@/types";
import { flagPerson, isTamper } from "./review";
import { documentLabels } from "./portal";

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function matches(type: string, value: string) {
  const aliases: Record<string, string[]> = { identity_document: ["identity_document", "act de identitate", "buletin"], id_card: ["id_card", "carte de identitate", "act de identitate"], utility_bill: ["utility_bill", "factura", "dovada adresei"], payslip: ["payslip", "fluturas"] };
  const text = normalize(value);
  return [...(aliases[type] ?? []), type, documentLabels[type] ?? type].some((word) => text.includes(normalize(word)));
}

/** Only an unambiguous document/person association can be fulfilled by an upload. */
function requestKey(c: Case, f: Flag): string | undefined {
  const docs = c.portalDocuments ?? [];
  const person = flagPerson(c, f)?.id;
  const byMessage = docs.filter((d) => (!person || d.personId === person || c.customerType === "PF") && matches(d.type, f.fix_message ?? ""));
  if (byMessage.length === 1) return byMessage[0]?.key;
  const evidence = c.documents.filter((d) => f.evidence.some((e) => e.documentId === d.id));
  const candidates = docs.filter((d) => {
    if (person && c.customerType === "PJ" && d.personId !== person) return false;
    return evidence.some((e) => (!d.personId || e.ownerPersonId === d.personId) && matches(d.type, `${e.fileName} ${e.type}`));
  });
  if (candidates.length === 1) return candidates[0]?.key;
  return undefined;
}

export function ensureDocumentRequests(c: Case) {
  c.documentRequests ??= [];
  for (const f of c.flags.filter((f) => (f.status === "sent_to_client" || (c.source === "backend" && f.status === "open")) && f.client_fixable && f.stage !== "screening" && !isTamper(f))) {
    if (!c.documentRequests.some((r) => r.flagId === f.id)) c.documentRequests.push({ flagId: f.id, key: requestKey(c, f), message: f.fix_message ?? "Încarcă documentul solicitat." });
  }
  // Migrate old officer-only requests using their saved step, never the first flag.
  if (!c.documentRequests.length && c.status === "Documente solicitate") {
    const docs = c.portalDocuments ?? [];
    const named = docs.filter((d) => matches(d.type, c.officerNote ?? ""));
    const doc = c.requestedStep ? docs[c.requestedStep - 1] : named.length === 1 ? named[0] : undefined;
    c.documentRequests.push({ key: doc?.key, message: c.officerNote || "Contactează banca pentru documentul solicitat." });
  }
  for (const r of c.documentRequests) {
    const f = c.flags.find((f) => f.id === r.flagId);
    if (f && (f.status === "dismissed" || f.status === "resolved")) r.resolved = true;
  }
  return c.documentRequests.filter((r) => !r.resolved);
}

export function updateRequestedStep(c: Case) {
  const pending = ensureDocumentRequests(c);
  const first = pending.find((r) => r.key && c.portalDocuments?.some((d) => d.key === r.key));
  if (first) c.requestedStep = (c.portalDocuments?.findIndex((d) => d.key === first.key) ?? -1) + 1;
  else delete c.requestedStep;
  return pending;
}
