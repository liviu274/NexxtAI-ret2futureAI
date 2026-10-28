import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getGroundTruth, listCases, resetDemo, type GroundTruth } from "@/api/client";
import type { Case, RiskLevel } from "@/types";
import { AnalystHeader } from "@/components/dosar/Header";
import { riskLabels } from "@/lib/dataset";
import { Button } from "@/components/ui/button";
import { DetectionChart, RiskDonut, type FamilyRow } from "@/components/dosar/StatsCharts";
const options = queryOptions({ queryKey: ["cases"], queryFn: listCases });
export const Route = createFileRoute("/statistici")({ head: () => ({ meta: [{ title: "Statistici · Raif2Future" }, { name: "description", content: "Situația dosarelor SPECIMEN și timpii de procesare." }, { property: "og:title", content: "Statistici · Raif2Future" }, { property: "og:description", content: "Indicatori calculați din dosarele KYC și KYB." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), loader: ({ context }) => context.queryClient.ensureQueryData(options), component: Statistics });
const truthOptions = queryOptions({ queryKey: ["ground-truth"], queryFn: getGroundTruth });

// Planted errors come from the archive's expected_flags; a planted rule counts as caught when a case flag cites it.
function pitchNumbers(cases: Case[], truth: GroundTruth) {
 const scored = cases.filter((c) => truth[c.id]);
 const planted = scored.reduce((n, c) => n + (truth[c.id]?.expected_rule_ids.length ?? 0), 0);
 const caught = scored.reduce((n, c) => n + (truth[c.id]?.expected_rule_ids.filter((r) => c.flags.some((f) => f.ruleId === r)).length ?? 0), 0);
 const controls = scored.filter((c) => c.id.endsWith("00_corect_control"));
 const avg = cases.length ? Math.round(cases.reduce((n, c) => n + c.processingMs, 0) / cases.length / 1000) : 0;
 return { planted, caught, controls: controls.length, clean: controls.filter((c) => c.flags.length === 0).length, avg };
}

// Detection per planted rule, so the reader sees which kinds of errors the agent catches.
function byRule(cases: Case[], truth: GroundTruth) {
 const rows = new Map<string, { planted: number; caught: number }>();
 for (const c of cases) for (const rule of truth[c.id]?.expected_rule_ids ?? []) {
  const row = rows.get(rule) ?? { planted: 0, caught: 0 };
  row.planted += 1; if (c.flags.some((f) => f.ruleId === rule)) row.caught += 1;
  rows.set(rule, row);
 }
 return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b, "ro", { numeric: true }));
}

// Error families shown in the chart; each planted rule belongs to one.
const families: [string, string[]][] = [
 ["Documente lipsă sau incomplete", ["R-PF-001", "R-PF-002", "R-PJ-001", "R-PJ-003", "R-PJ-004", "R-PJ-005", "R-PJ-007", "R-PJ-013"]],
 ["Documente expirate sau vechi", ["R-PF-003", "R-PJ-002", "R-PJ-010"]],
 ["Date diferite între documente", ["R-PF-004", "R-PF-005", "R-PJ-011", "R-PJ-016"]],
 ["Documente falsificate", ["R-PF-012", "R-PF-013", "R-PF-014", "R-PF-015"]],
 ["Beneficiari reali diferiți de ONRC", ["R-PJ-006"]],
];
function byFamily(rules: [string, { planted: number; caught: number }][]): FamilyRow[] {
 const known = new Set(families.flatMap(([, ids]) => ids));
 const groups: [string, string[]][] = [...families, ["Alte verificări", rules.map(([id]) => id).filter((id) => !known.has(id))]];
 return groups.map(([family, ids]) => {
  const hit = rules.filter(([id]) => ids.includes(id));
  return { family, rules: hit.map(([id]) => ruleLabels[id] ?? id), planted: hit.reduce((n, [, r]) => n + r.planted, 0), caught: hit.reduce((n, [, r]) => n + r.caught, 0) };
 }).filter((g) => g.planted > 0);
}

// Short names for the planted error types; the full rule text stays on the playbook page.
const ruleLabels: Record<string, string> = {
 "R-PF-001": "Document lipsă", "R-PF-002": "Câmp obligatoriu lipsă", "R-PF-003": "Act de identitate expirat",
 "R-PF-004": "Nume sau adresă diferite pe factură", "R-PF-005": "Fluturașul altei persoane", "R-PF-012": "Metadate PDF suspecte",
 "R-PF-013": "Fonturi amestecate pe salariu", "R-PF-014": "Total salarial greșit", "R-PF-015": "PDF salvat de două ori",
 "R-PJ-001": "Certificat constatator lipsă", "R-PJ-002": "Certificat mai vechi de 30 de zile", "R-PJ-003": "Act constitutiv lipsă",
 "R-PJ-004": "Declarație UBO lipsă", "R-PJ-005": "Declarație UBO nesemnată", "R-PJ-006": "Beneficiari reali diferiți de ONRC",
 "R-PJ-007": "Act de identitate UBO lipsă", "R-PJ-010": "Act administrator expirat", "R-PJ-011": "Administrator diferit de registru",
 "R-PJ-013": "Specimen de semnătură lipsă", "R-PJ-016": "CUI diferit între documente",
};

function Tile({ label, value, unit, foot, hot = false }: { label: string; value: string | number; unit?: string; foot: string; hot?: boolean }) {
 return <section className={`flex min-h-[132px] flex-col justify-between rounded-[22px] p-5 shadow-card ${hot ? "bg-brand" : "bg-card"}`}>
  <span className={`text-[13px] ${hot ? "opacity-70" : "text-ink-muted"}`}>{label}</span>
  <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{value}{unit && <small className={`ml-1 text-[15px] font-medium tracking-normal ${hot ? "opacity-70" : "text-ink-muted"}`}>{unit}</small>}</span>
  <span className={`text-[12.5px] ${hot ? "opacity-70" : "text-ink-muted"}`}>{foot}</span>
 </section>;
}

function Statistics() {
 const { data } = useSuspenseQuery(options); const [type, setType] = useState(""); const rows = data.filter((c) => !type || c.customerType === type);
 const { data: truth } = useSuspenseQuery(truthOptions); const qc = useQueryClient(); const pitch = pitchNumbers(rows, truth);
 const rules = byRule(rows, truth);
 const inReview = rows.filter((c) => c.status === "În analiză").length;
 const waiting = rows.filter((c) => c.status === "Documente solicitate").length;
 const risk = (["critical", "high", "medium", "low"] as RiskLevel[]).map((level) => ({ level, n: rows.filter((c) => c.riskDraft.level === level).length }));
 const types = (["PF", "PJ"] as const).map((t) => { const cs = data.filter((c) => c.customerType === t); return { t, n: cs.length, avg: cs.length ? Math.round(cs.reduce((s, c) => s + c.processingMs, 0) / cs.length / 1000) : 0, flagged: cs.filter((c) => c.flags.length > 0).length }; });
 const [confirming, setConfirming] = useState(false);
 async function reset() { await resetDemo(); await qc.invalidateQueries(); setConfirming(false); toast.success("Demo resetat"); }

 return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4">
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
   <div><h1 className="text-[28px] font-semibold tracking-tight">Statistici</h1><p className="mt-1 text-[13px] text-ink-muted">Rezultatele agentului pe setul de test al echipei: {data.length} dosare SPECIMEN.</p></div>
   <div className="inline-flex gap-1 rounded-full bg-beige-dark p-1">{["", "PF", "PJ"].map((v) => <Button key={v} variant="ghost" className={`h-8 rounded-full px-4 text-xs ${type === v ? "bg-brand hover:bg-brand" : "text-ink-muted"}`} onClick={() => setType(v)}>{v || "Toate"}</Button>)}</div>
  </div>

  <div className="grid grid-cols-12 gap-4">
   <div className="col-span-3 max-xl:col-span-6 max-sm:col-span-12"><Tile hot label="Erori detectate" value={pitch.caught} unit={`din ${pitch.planted}`} foot="erori plantate în setul de test" /></div>
   <div className="col-span-3 max-xl:col-span-6 max-sm:col-span-12"><Tile label="Alarme false" value={pitch.controls - pitch.clean} unit={pitch.controls - pitch.clean === 1 ? "dosar" : "dosare"} foot={`${pitch.clean} din ${pitch.controls} dosare corecte au trecut curat`} /></div>
   <div className="col-span-3 max-xl:col-span-6 max-sm:col-span-12"><Tile label="Timp mediu AI" value={pitch.avg} unit="s" foot="față de ~45 min manual (estimare)" /></div>
   <div className="col-span-3 max-xl:col-span-6 max-sm:col-span-12"><Tile label="Dosare" value={rows.length} foot={`${inReview} în analiză · ${waiting} așteaptă clientul`} /></div>

   <section className="col-span-8 min-w-0 self-start rounded-[22px] bg-card p-5 shadow-card max-xl:col-span-12">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">Detectare pe tip de eroare</h2><span className="text-[12.5px] text-ink-muted">detectate / plantate · treci cu mouse-ul pentru reguli</span></div>
    <DetectionChart rows={byFamily(rules)} />
    <p className="mt-5 text-xs leading-relaxed text-ink-muted">Erorile plantate provin din fișierele expected_flags ale setului de test. PF: rezultat al pipeline-ului; PJ: verificare pe date (pipeline-ul PJ nu a rulat încă). Timpul manual este o estimare a echipei.</p>
   </section>

   <div className="col-span-4 grid content-start gap-4 max-xl:col-span-12 max-xl:grid-cols-2 max-md:grid-cols-1">
    <section className="min-w-0 rounded-[22px] bg-card p-5 shadow-card">
     <h2 className="mb-4 text-[15px] font-semibold">Propuneri de risc</h2>
     <RiskDonut counts={risk} />
     <p className="mt-4 text-xs text-ink-muted">Doar propuneri. Decizia finală aparține ofițerului.</p>
    </section>
    <section className="min-w-0 rounded-[22px] bg-card p-5 shadow-card">
     <h2 className="mb-3 text-[15px] font-semibold">Pe tip de client</h2>
     <div className="grid gap-4">{types.map((x) => <div key={x.t}>
      <div className="flex items-baseline justify-between gap-3">
       <span className="flex min-w-0 items-center gap-2 text-[13px]"><span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{x.t}</span><span className="truncate">{x.t === "PF" ? "Persoane fizice" : "Firme"}</span></span>
       <span className="shrink-0 tabular-nums"><b className="text-[22px] tracking-tight">{x.n}</b><span className="ml-1 text-xs text-ink-muted">dosare</span></span>
      </div>
      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-ink" style={{ width: `${x.n ? (x.flagged / x.n) * 100 : 0}%` }} /></span>
      <span className="mt-1.5 flex justify-between gap-3 text-xs text-ink-muted"><span>{x.flagged} cu probleme</span><span className="tabular-nums">~{x.avg}s procesare</span></span>
     </div>)}</div>
    </section>
   </div>
  </div>

  <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
   {confirming ? <>
    <span>Resetezi demo-ul? Dosarele create în portal și deciziile ofițerului se șterg.</span>
    <Button size="sm" className="h-8 rounded-full px-4 text-xs" onClick={() => void reset()}>Resetează</Button>
    <Button size="sm" variant="ghost" className="h-8 rounded-full px-4 text-xs" onClick={() => setConfirming(false)}>Anulează</Button>
   </> : <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={() => setConfirming(true)}>Resetează demo-ul</Button>}
  </div>
 </main></div>;
}
