import type { ScreeningListEntry } from "@/types/extensions";

// Fictional SPECIMEN fixtures. Keys are plain fixture IDs, never API keys.
export const screeningLists: ScreeningListEntry[] = [
  { key: "pep_carmen_radu", id_sursa: "PEP-RO-121", nume_complet: "Carmen Radu", anul_nasterii: 1981, cetatenie: "Română", categorie_risc: "PEP", motiv_includere: "Funcție publică de conducere — scenariu fictiv SPECIMEN.", act_identitate_cunoscut: "SPECIMEN CR 000121" },
  { key: "sanctions_nicolae_toma", id_sursa: "OFAC-106", nume_complet: "Nicolae Toma", anul_nasterii: 1994, cetatenie: "Română", categorie_risc: "SANCTIONS", motiv_includere: "Înregistrare de sancțiuni fictivă SPECIMEN; identitatea necesită verificare.", act_identitate_cunoscut: "SPECIMEN NT 000106" },
  { key: "media_carmen_radu", id_stire: "NEWS-RO-051", nume_subiect: "Carmen Radu", titlu_stire: "Investigație privind un posibil conflict de interese — SPECIMEN", sursa_stire: "Gazeta SPECIMEN (sursă fictivă)", an_publicare: 2025, tara_subiect: "România", cuvinte_cheie_risc: ["conflict de interese", "investigație"], nivel_risc: "medium" },
];