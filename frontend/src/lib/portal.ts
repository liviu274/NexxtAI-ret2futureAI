import type { Case, CustomerType, Person } from "@/types";
export const documentLabels: Record<string, string> = { identity_document: "Act de identitate", utility_bill: "Factură de utilități (max 90 de zile)", payslip: "Fluturaș de salariu", proof_of_address: "Dovada adresei (max 90 de zile)", bank_statement: "Extras de cont", certificat_constatator: "Certificat constatator", act_constitutiv: "Act constitutiv", ubo_declaration: "Declarație beneficiar real", id_card: "Act de identitate", signature_specimen: "Specimen de semnătură" };
/** Identity documents may be photographed; every other document is uploaded as a PDF. */
export const IDENTITY_TYPES = ["id_card", "passport", "identity_document"];
export const acceptedFiles = (type: string) => IDENTITY_TYPES.includes(type) ? ".pdf,.png,.jpg,.jpeg" : ".pdf";
/** Why a file cannot be uploaded at this step, before sending it; null when the format and size are fine. */
export function fileProblem(type: string, file: File): string | null {
  if (file.size > 10 * 1024 * 1024) return "Fișierul depășește 10 MB.";
  if (IDENTITY_TYPES.includes(type)) return /\.(pdf|png|jpe?g)$/i.test(file.name) ? null : "Încarcă o fotografie (JPG sau PNG) sau un PDF al actului de identitate.";
  return /\.pdf$/i.test(file.name) ? null : `Încarcă ${(documentLabels[type] ?? "documentul").toLocaleLowerCase("ro")} ca fișier PDF.`;
}
export function portalDocumentPlan(type: CustomerType, required: string[], persons: Person[]): NonNullable<Case["portalDocuments"]> {
 if (type === "PF") return required.map((t,i) => ({ key: `doc-${i+1}`, type: t, label: documentLabels[t] ?? t, ok: false }));
 const company = required.filter((t) => !["id_card", "signature_specimen"].includes(t));
 return [...company.map((t,i) => ({ key: `company-${i}`, type: t, label: documentLabels[t] ?? t, ok: false })), ...persons.flatMap((p) => {
  const docs = p.role === "UBO" ? ["id_card"] : ["id_card", "signature_specimen"];
  return docs.filter((t) => required.includes(t)).map((t) => ({ key: `${p.id}-${t}`, type: t, label: documentLabels[t] ?? t, personId: p.id, personName: p.name, ok: false }));
 })];
}
export function simulatePortalResult(type: string, name: string) {
 const file = name.toLocaleLowerCase("ro");
 if (["identity_document", "id_card"].includes(type) && file.includes("expirat")) return { ok: false, message: "Actul de identitate a expirat pe 15.01.2025. Încarcă un act valabil." };
 // A different address is not the client's to fix: the officer sees it and decides (the client may have moved).
 if (file.includes("nume")) return { ok: false, message: "Numele de pe document nu este același cu cel din actul de identitate." };
 return { ok: true, message: "Documentul este în regulă." };
}