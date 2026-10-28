import { CaseAvailability } from "@/components/dosar/CaseAvailability";
import { SERVICE_UNAVAILABLE } from "@/api/client";
import { isFinalCase } from "@/lib/review";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getCase, getPlaybook } from "@/api/client";
import { DismissFlag } from "@/components/dosar/DismissFlag";
import { flagPerson, flagStatusLabels, passedChecks, problemLabel, roleLabels } from "@/lib/review";
import { AnalystHeader } from "@/components/dosar/Header";
import { Loading, TypeBadge } from "@/components/dosar/badges";
import { DocumentViewer } from "@/components/dosar/DocumentViewer";
import { OwnershipPanel } from "@/components/dosar/OwnershipPanel";
import { ScreeningPanel } from "@/components/dosar/ScreeningPanel";
import { canCopyClientMessage, isScreeningFlag } from "@/lib/screening";
import { DecisionBar } from "@/components/dosar/DecisionBar";
import { Button } from "@/components/ui/button";
import { riskLabels, severityLabels } from "@/lib/dataset";
import type { BBox } from "@/types";
export const Route = createFileRoute("/cases/$id/")({ head: ({ params }) => ({ meta: [{ title: `Dosar ${params.id} · Raif2Future` }, { name: "description", content: "Revizuire dosar SPECIMEN, dovezi și propunere de risc." }, { property: "og:title", content: `Dosar ${params.id} · Raif2Future` }, { property: "og:description", content: "Revizuire documente și beneficiari reali." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: CasePage });
function CasePage() {
 const { id } = Route.useParams(); const { data: c, isLoading } = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) });
 const { data: playbook } = useQuery({ queryKey: ["playbook", c?.playbookId], queryFn: () => getPlaybook(c?.playbookId ?? ""), enabled: !!c?.playbookId });
 const [selected, setSelected] = useState<string | null>(null); const [docId, setDocId] = useState<string | null>(null); const [page, setPage] = useState(0); const [panel, setPanel] = useState("ownership");
 if (isLoading) return <><AnalystHeader /><Loading /></>; if (!c) return <><AnalystHeader /><div className="p-12 text-center text-sm">Dosarul nu a fost găsit.</div></>;
 const flag = c.flags.find((f) => f.id === selected) ?? c.flags[0]; const doc = c.documents.find((d) => d.id === (docId ?? flag?.evidence[0]?.documentId)) ?? c.documents[0] ?? null;
 const highlights = flag?.evidence.filter((e) => e.documentId === doc?.id && e.page === page).map((e) => e.bbox).filter((b): b is BBox => b !== undefined) ?? [];
 const screening = flag && isScreeningFlag(flag);
 const passed = passedChecks(c, playbook);
 return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-tight text-ink">{c.clientName}<TypeBadge type={c.customerType} /></h1><p className="mt-2 break-all text-[11px] text-ink-muted">Dosar {c.id}{c.source === "backend" && !c.serviceUnavailable && <span className="ml-2 text-[10px] text-ink-muted">Date din backend</span>} · {c.cui ? `CUI ${c.cui} · CAEN ${c.company?.caen} · ` : ""}Creat {c.createdAt} · Propunere de risc: <span className={c.riskDraft.level === "critical" ? "text-sev-high" : ""}>{riskLabels[c.riskDraft.level]}</span></p></div><DecisionBar caseId={c.id} flags={c.flags} /></div>
  {c.source === "backend" && <Link to="/portal/$caseId" params={{caseId:c.id}} className="mt-4 inline-block text-xs text-teal">Portal client · Vezi documentele și starea</Link>}
  <CaseAvailability reason={c.serviceUnavailable ? SERVICE_UNAVAILABLE : isFinalCase(c.status) ? `Dosarul este închis · ${c.status}. Modificările nu mai sunt permise.` : undefined} />
  <div className="mt-4 inline-flex gap-1 rounded-full bg-beige-dark p-1 text-[13px] font-medium"><span className="rounded-full bg-brand px-4 py-1.5">Probleme</span><Link to="/cases/$id/audit" params={{ id }} className="rounded-full px-4 py-1.5 text-ink-muted hover:text-ink">Audit log</Link></div>
  <div className="review-shell mt-6 grid min-h-[540px] grid-cols-[minmax(0,31%)_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
   <aside className="flex flex-col overflow-hidden rounded-[22px] bg-card shadow-card"><h2 className="px-5 pb-3 pt-5 text-[15px] font-semibold">{problemLabel(c.flags.length)}</h2><div>{c.flags.map((f) => <div key={f.id} className={`mx-2 mb-1.5 rounded-2xl px-4 py-3.5 transition-colors ${flag?.id === f.id ? "bg-brand/15 ring-1 ring-brand/70" : "hover:bg-muted"}`}><Button variant="ghost" onClick={() => { setSelected(f.id); setDocId(f.evidence[0]?.documentId ?? null); setPage(f.evidence[0]?.page ?? 0); }} className="flex h-auto w-full flex-col items-start gap-2 whitespace-normal rounded-none p-0 text-left text-xs font-normal"><span className="flex items-start gap-2"><span className={`flex shrink-0 items-center gap-1 ${f.severity === "medium" ? "text-sev-medium" : "text-sev-high"}`}><AlertTriangle className="h-3 w-3" />{severityLabels[f.severity]}</span><span className="font-semibold">{f.title}</span></span>{(() => { const p = flagPerson(c, f); return p && <span className="text-[10px] text-ink">pentru {p.name} ({roleLabels[p.role]})</span>; })()}<span className="text-[10px] leading-relaxed text-ink-muted">{f.explanation} · {flagStatusLabels[f.status ?? "open"]}</span></Button>{f.status === "dismissed" ? <p className="mt-2 break-words text-[10px] text-ink-muted">Ignorat de {f.dismissedBy}: {f.dismissalNote}</p> : <div className="mt-2"><DismissFlag caseId={c.id} flagId={f.id} /></div>}</div>)}</div><div className="mt-auto border-t border-border px-[18px] py-4 text-[10px] text-ink-muted"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" />{passed} verificări trecute</span>{c.screeningSummary?.matches === 0 && <p className="mt-2 leading-relaxed">Screening: 0 potriviri în {c.screeningSummary.sanctions} sancțiuni și {c.screeningSummary.pep} PEP</p>}</div></aside>
   <section className="min-w-0 rounded-[22px] bg-card p-6 shadow-card">{!screening && <div className="mb-[18px] inline-flex flex-wrap gap-1 rounded-full bg-muted p-1">{c.customerType === "PJ" ? ["ownership", "docs", "persons"].map((key, i) => <Button variant="ghost" key={key} onClick={() => setPanel(key)} className={`h-8 rounded-full px-4 text-xs ${panel === key ? "bg-brand font-semibold hover:bg-brand" : "font-normal text-ink-muted"}`}>{["Structură acționariat", "Documente", "Persoane"][i]}</Button>) : c.documents.map((d) => <Button variant="ghost" key={d.id} onClick={() => { setDocId(d.id); setPage(0); }} className={`h-8 rounded-full px-4 text-xs ${doc?.id === d.id ? "bg-brand font-semibold hover:bg-brand" : "font-normal text-ink-muted"}`}>{d.type}</Button>)}</div>}
    {screening ? <ScreeningPanel key={flag.id} caseId={c.id} flag={flag} /> : c.customerType === "PJ" && panel === "ownership" ? <OwnershipPanel c={c} /> : c.customerType === "PJ" && panel === "persons" ? <div className="divide-y divide-border">{c.persons.map((p) => <div key={p.id} className="py-4 text-xs"><strong>{p.name}</strong><span className="ml-3 text-ink-muted">{p.role}</span></div>)}</div> : <>{c.customerType === "PJ" && <div className="mb-3 flex flex-wrap gap-2">{c.documents.map((d) => <Button key={d.id} variant="ghost" size="sm" onClick={() => setDocId(d.id)} className="text-xs">{d.type}</Button>)}</div>}<DocumentViewer document={doc} page={page} highlights={highlights} /></>}
    {flag && <div className="mt-[18px] border-t border-border pt-3 text-xs leading-relaxed text-ink"><p>{flag.ruleId} : {flag.ruleText}</p>{canCopyClientMessage(flag) && <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={async () => { await navigator.clipboard.writeText(flag.fix_message ?? ""); toast.success("Mesaj copiat."); }}>Copiază mesajul pentru client</Button>}</div>}
   </section>
  </div>
 </main></div>;
}
