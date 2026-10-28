import type { ScreeningListEntry } from "@/types/extensions";

// Fictional fixtures copied from the backend's data/mock_registries (pep_list.json, sanctions_list.json).
// Keys are the lists' pk_match_key. Adverse media is not screened by the backend, so no news entries.
export const screeningLists: ScreeningListEntry[] = [
  { key: "PEP-RO-121#CARMENRADU#1981#CY", id_sursa: "PEP-RO-121", nume_complet: "Carmen Radu", anul_nasterii: 1981, cetatenie: "CY", categorie_risc: "PEP", motiv_includere: "Senator", act_identitate_cunoscut: "P7557882" },
  { key: "OFAC-106#NICOLAETOMA#1994#GR", id_sursa: "OFAC-106", nume_complet: "Nicolae Toma", anul_nasterii: 1994, cetatenie: "GR", categorie_risc: "SANCTIONS", motiv_includere: "Money laundering", act_identitate_cunoscut: "P8532903" },
];