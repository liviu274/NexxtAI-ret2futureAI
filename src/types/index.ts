export type CustomerType = "PF" | "PJ";
export type Severity = "critical" | "high" | "medium" | "low";
export type CaseStatus = "Nou" | "Se verifică" | "În analiză" | "Documente solicitate" | "Aprobat" | "Respins";
export type DocumentStatus = "valid" | "cu-probleme" | "se-verifica" | "lipsa";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Evidence {
  documentId: string;
  page: number;
  bbox?: BBox;
  field?: string;
}

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  source: Evidence;
}

export interface Document {
  id: string;
  type: string;
  ownerPersonId: string;
  fileName: string;
  pageImages: string[];
  pdfUrl?: string;
  status: DocumentStatus;
  extractedFields: ExtractedField[];
}

export interface Flag {
  id: string;
  severity: Severity;
  title: string;
  ruleId: string;
  ruleText: string;
  evidence: Evidence[];
  explanation: string;
  clientFixMessage: string;
}

export interface RiskReason {
  factor: string;
  value: string;
  impact: "crește" | "scade" | "neutru";
}

export interface RiskDraft {
  level: RiskLevel;
  reasons: RiskReason[];
}

export interface Person {
  id: string;
  name: string;
  role: "titular" | "UBO" | "semnatar" | "administrator";
  cnp?: string;
  ownershipPct?: number;
}

export interface Case {
  id: string;
  customerType: CustomerType;
  clientName: string;
  cui?: string;
  status: CaseStatus;
  createdAt: string;
  processingMs: number;
  persons: Person[];
  documents: Document[];
  flags: Flag[];
  riskDraft: RiskDraft;
  playbookId?: string;
  company?: { name: string; cui: string; registration: string; caen: string; address: string };
  ownership?: { registry: OwnershipPerson[]; declared: OwnershipPerson[] };
}

export interface OwnershipPerson { id: string; name: string; pct: number }

export interface PlaybookRule {
  id: string;
  kind: "document-obligatoriu" | "valabilitate" | "vechime" | "potrivire" | "prag" | "screening";
  text: string;
  params: Record<string, string | number | boolean>;
  sourceSentence: string;
  warning?: string;
}

export interface Playbook {
  id: string;
  processName: string;
  customerType: CustomerType;
  rules: PlaybookRule[];
  sourceDocumentText: string;
}

export interface AuditEntry {
  id: string;
  caseId: string;
  timestamp: string;
  actor: "ai" | "human";
  stage: string;
  action: string;
  status: "ok" | "avertisment" | "eroare";
  durationMs: number;
  input: string;
  output: string;
}

export interface OwnershipNode {
  id: string;
  label: string;
  kind: "companie" | "persoană";
  declared: boolean;
}

export interface OwnershipEdge {
  from: string;
  to: string;
  pct: number;
}
