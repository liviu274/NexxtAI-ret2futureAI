// Mock-only screening annotations; not part of the current REST backend contract.
export interface ScreeningEvidence {
  list_entry_key: string;
  score: number;
  documentId?: never;
  page?: never;
  bbox?: never;
  field?: never;
}

export interface ScreeningFlagExtension {
  stage?: "screening";
  screeningPersonId?: string;
  screeningResolution?: "confirmed" | "dismissed";
  screeningReason?: string;
}

export interface ScreeningSummary {
  sanctions: number;
  pep: number;
  news: number;
  matches: number;
}

export interface ScreeningIdentity {
  name: string;
  birthYear?: number;
  citizenship?: string;
  identityDocument?: string;
}

export interface PersonListEntry {
  key: string;
  id_sursa: string;
  nume_complet: string;
  anul_nasterii: number;
  cetatenie: string;
  categorie_risc: "SANCTIONS" | "PEP";
  motiv_includere: string;
  act_identitate_cunoscut: string;
}

export interface MediaListEntry {
  key: string;
  id_stire: string;
  nume_subiect: string;
  titlu_stire: string;
  sursa_stire: string;
  an_publicare: number;
  tara_subiect: string;
  cuvinte_cheie_risc: string[];
  nivel_risc: "high" | "medium" | "low";
}

export type ScreeningListEntry = PersonListEntry | MediaListEntry;
export interface ScreeningMatch {
  entry: ScreeningListEntry;
  client: ScreeningIdentity;
  score: number;
}