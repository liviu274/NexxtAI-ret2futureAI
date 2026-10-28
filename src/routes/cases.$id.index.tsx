import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getCase } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Loading, TypeBadge } from "@/components/dosar/badges";
import { DocumentViewer } from "@/components/dosar/DocumentViewer";
import { OwnershipPanel } from "@/components/dosar/OwnershipPanel";
import { DecisionBar } from "@/components/dosar/DecisionBar";
import { Button } from "@/components/ui/button";
import { riskLabels, severityLabels } from "@/lib/dataset";
import type { BBox } from "@/types";
export const Route = createFileRoute("/cases/$id/")({ head: ({ params }) => ({ meta: [{ title: `Dosar ${params.id} · DosarAI` }, { name: "description", content: "Revizuire dosar SPECIMEN, dovezi și propunere de risc." }, { property: "og:title", content: `Dosar ${params.id} · DosarAI` }, { property: "og:description", content: "Revizuire documente și beneficiari reali." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: CasePage });
function CasePage() {
 const { id } = Route.useParams(); const { data: c, isLoading } = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) });
 const [selected, setSelected] = useState<string | null>(null); const [docId, setDocId] = useState<string | null>(null); const [page, setPage] = useState(0); const [panel, setPanel] = useState("ownership");
 if (isLoading) return <><AnalystHeader /><Loading /></>; if (!c) return <><AnalystHeader /><div className="p-12 text-center text-sm">Dosarul nu a fost găsit.</div></>;
 const flag = c.flags.find((f) => f.id === selected) ?? c.flags[0]; const doc = c.documents.find((d) => d.id === (docId ?? flag?.evidence[0]?.documentId)) ?? c.documents[0] ?? null;
 const highlights = flag?.evidence.filter((e) => e.documentId === doc?.id && e.page === page).map((e) => e.bbox).filter((b): b is BBox => b !== undefined) ?? [];
 return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="mx-auto max-w-[1392px] px-[18px] pb-6 pt-6">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">{c.clientName}<TypeBadge type={c.customerType} /></h1><p className="mt-2 break-all text-[11px] text-ink-muted">Dosar {c.id} · {c.cui ? `CUI ${c.cui} · CAEN ${c.company?.caen} · ` : ""}Creat {c.createdAt} · Propunere de risc: <span className={c.riskDraft.level === "critical" ? "text-sev-high" : ""}>{riskLabels[c.riskDraft.level]}</span></p></div><DecisionBar caseId={c.id} /></div>
  {c.customerType === "PJ" && <div className="mt-4 flex gap-6 border-b border-border text-xs"><span className="border-b-2 border-brand pb-3 font-semibold">Probleme</span><Link to="/cases/$id/audit" params={{ id }} className="text-ink-muted">Audit log</Link></div>}
  <div className="review-shell mt-7 grid min-h-[540px] grid-cols-[31%_69%] overflow-hidden rounded-md border border-border bg-card max-md:grid-cols-1">
   <aside className="flex flex-col border-r border-border"><h2 className="border-b border-border px-[18px] py-5 text-sm font-semibold">{c.flags.length} probleme</h2><div>{c.flags.map((f) => <Button key={f.id} variant="ghost" onClick={() => { setSelected(f.id); setDocId(f.evidence[0]?.documentId ?? null); setPage(f.evidence[0]?.page ?? 0); }} className={`flex h-auto w-full flex-col items-start gap-2 whitespace-normal rounded-none border-b border-border px-[18px] py-4 text-left text-xs font-normal ${flag?.id === f.id ? "border-l-2 border-l-brand bg-beige/70" : ""}`}><span className="flex items-start gap-2"><span className={`flex shrink-0 items-center gap-1 ${f.severity === "medium" ? "text-sev-medium" : "text-sev-high"}`}><AlertTriangle className="h-3 w-3" />{severityLabels[f.severity]}</span><span className="font-semibold">{f.title}</span></span><span className="text-[10px] leading-relaxed text-ink-muted">{f.explanation}</span></Button>)}</div><div className="mt-auto flex items-center gap-1.5 border-t border-border px-[18px] py-4 text-[10px] text-ink-muted"><CheckCircle2 className="h-3 w-3" />{c.flags.length ? "Verificări finalizate" : "Toate verificările sunt concordante"}</div></aside>
   <section className="min-w-0 p-6"><div className="mb-[18px] flex flex-wrap gap-6 border-b border-border">{c.customerType === "PJ" ? ["ownership", "docs", "persons"].map((key, i) => <Button variant="ghost" key={key} onClick={() => setPanel(key)} className={`h-8 rounded-none border-b-2 px-0 text-xs ${panel === key ? "border-brand font-semibold" : "border-transparent font-normal text-ink-muted"}`}>{["Structură acționariat", "Documente", "Persoane"][i]}</Button>) : c.documents.map((d) => <Button variant="ghost" key={d.id} onClick={() => { setDocId(d.id); setPage(0); }} className={`h-8 rounded-none border-b-2 px-0 text-xs ${doc?.id === d.id ? "border-brand font-semibold" : "border-transparent font-normal text-ink-muted"}`}>{d.type}</Button>)}</div>
    {c.customerType === "PJ" && panel === "ownership" ? <OwnershipPanel c={c} /> : c.customerType === "PJ" && panel === "persons" ? <div className="divide-y divide-border">{c.persons.map((p) => <div key={p.id} className="py-4 text-xs"><strong>{p.name}</strong><span className="ml-3 text-ink-muted">{p.role}</span></div>)}</div> : <>{c.customerType === "PJ" && <div className="mb-3 flex flex-wrap gap-2">{c.documents.map((d) => <Button key={d.id} variant="ghost" size="sm" onClick={() => setDocId(d.id)} className="text-xs">{d.type}</Button>)}</div>}<DocumentViewer document={doc} page={page} highlights={highlights} /></>}
    {flag && <div className="mt-[18px] border-t border-border pt-3 text-xs leading-relaxed text-ink"><p>{flag.ruleId} : {flag.ruleText}</p><Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={async () => { await navigator.clipboard.writeText(flag.clientFixMessage); toast.success("Mesaj copiat."); }}>Copiază mesajul pentru client</Button></div>}
    <Link to="/cases/$id/audit" params={{ id }} className="mt-4 inline-block text-[10px] text-ink-muted">Audit log →</Link>
   </section>
  </div>
 </main></div>;
}
