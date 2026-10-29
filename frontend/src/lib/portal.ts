import type { Case, CustomerType, Person } from "@/types";
export const documentLabels: Record<string, string> = { identity_document: "Act de identitate", utility_bill: "Factură de utilități (max 90 de zile)", payslip: "Fluturaș de salariu", proof_of_address: "Dovada adresei (max 90 de zile)", bank_statement: "Extras de cont", certificat_constatator: "Certificat constatator", act_constitutiv: "Act constitutiv", ubo_declaration: "Declarație beneficiar real", id_card: "Act de identitate", signature_specimen: "Specimen de semnătură" };
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
 if (type === "utility_bill" && file.includes("adresa")) return { ok: false, message: "Adresa de pe factură nu este aceeași cu cea din actul de identitate. Încarcă o factură pe adresa din act." };
 if (file.includes("nume")) return { ok: false, message: "Numele de pe document nu este același cu cel din actul de identitate." };
 return { ok: true, message: "Documentul este în regulă." };
}