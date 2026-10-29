import type { BBox, Case, Evidence, Flag, OwnershipPerson, RiskLevel, Severity } from "@/types";

export const REFERENCE_DATE = "2026-10-28";
export const riskLabels: Record<RiskLevel, string> = { low: "Scăzut", medium: "Mediu", high: "Ridicat", critical: "Critic" };
export const riskClasses: Record<RiskLevel, string> = { low: "text-ink", medium: "text-ink", high: "text-ink", critical: "text-sev-high" };
export const severityLabels: Record<Severity, string> = { critical: "Critic", high: "Ridicat", medium: "Mediu", low: "Informativ" };

export function normalizedBBox(value: unknown): BBox | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((n) => typeof n === "number" && n >= 0 && n <= 1)) return;
  const [x0, y0, x1, y1] = value as number[];
  if (x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined || x1 <= x0 || y1 <= y0) return;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// Fixtures can nest documents and fields; only use an exact document/field match.
export function findTruthBBox(truth: unknown, documentId: string, field: string): BBox | undefined {
  function walk(value: unknown, docMatch = false, fieldMatch = false): BBox | undefined {
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    const inDoc = docMatch || obj["id"] === documentId || obj["document_id"] === documentId || obj["documentId"] === documentId;
    const inField = fieldMatch || obj["name"] === field || obj["field"] === field || obj["field_name"] === field;
    if (inDoc && inField) {
      const bbox = normalizedBBox(obj["bbox"]);
      if (bbox) return bbox;
    }
    for (const [key, child] of Object.entries(obj)) {
      const bbox = walk(child, inDoc || key === documentId, inField || key === field);
      if (bbox) return bbox;
    }
    return undefined;
  }
  return walk(truth);
}

export function resolveEvidence(e: Evidence, flag: Flag, truth: unknown): Evidence {
  if ("list_entry_key" in e) return e;
  if (e.bbox) return e;
  const field = e.field ?? ["net_salary", "expiry_date", "address", "gross_salary", "cui"].find((key) => flag.explanation.includes(key));
  const bbox = field ? findTruthBBox(truth, e.documentId, field) : undefined;
  return bbox ? { ...e, bbox } : e;
}

export function ownershipRows(c: Case): { person: OwnershipPerson; registry: number | undefined; declared: number | undefined; matches: boolean }[] {
  const registry = c.ownership?.registry ?? [];
  const declared = c.ownership?.declared ?? [];
  const people = [...registry, ...declared.filter((p) => !registry.some((r) => r.id === p.id && r.name === p.name))];
  return people.map((person) => {
    const r = registry.find((p) => p.id === person.id && p.name === person.name)?.pct;
    const d = declared.find((p) => p.id === person.id && p.name === person.name)?.pct;
    return { person, registry: r, declared: d, matches: r !== undefined && d !== undefined && r === d };
  });
}