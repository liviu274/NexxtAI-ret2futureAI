import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildPlaybook, getPlaybook } from "@/api/client";
import { generatedByLabels } from "@/lib/playbook-builder";
import { AnalystHeader } from "@/components/dosar/Header";
import { Loading } from "@/components/dosar/badges";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/playbooks/$id")({ head: ({ params }) => ({ meta: [{ title: `Revizuire playbook ${params.id} · Raif2Future` }, { name: "description", content: "Procedura și regulile verificabile pentru dosare SPECIMEN." }, { property: "og:title", content: `Playbook ${params.id} · Raif2Future` }, { property: "og:description", content: "Revizuire umană a regulilor KYC și KYB." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: PlaybookPage });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// The PDF text starts with the document title, date and author; the page header already shows the title.
function procedureIntro(source: string) {
 const intro = source.split(/\n1\.1\./)[0] ?? "";
 const start = intro.search(/^1\.\s/m);
 return start === -1 ? intro : intro.slice(start);
}
function PlaybookPage() {
 const { id } = Route.useParams(); const { data: p, isLoading } = useQuery({ queryKey: ["playbook", id], queryFn: () => getPlaybook(id) });
 const [selected, setSelected] = useState<string | null>(null); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState("");
 const input = useRef<HTMLInputElement>(null); const [uploading, setUploading] = useState(false); const [seconds, setSeconds] = useState(0);
 useEffect(() => { if (!uploading) return; const timer = setInterval(() => setSeconds((n) => n + 1), 1000); return () => clearInterval(timer); }, [uploading]);
 const navigate = useNavigate(); const qc = useQueryClient();
 async function upload(file?: File) {
  if (!file) return;
  if (input.current) input.current.value = "";
  setSeconds(0); setUploading(true);
  try {
   const built = await buildPlaybook(file);
   await qc.invalidateQueries({ queryKey: ["playbook", built.id] });
   toast.success(`Playbook generat: ${built.rules.length} reguli, acoperire ${built.coverage ?? 0}%.`);
   if (built.id !== id) await navigate({ to: "/playbooks/$id", params: { id: built.id } });
  } catch (e) { toast.error(e instanceof Error ? e.message : "Generarea nu a reușit."); }
  finally { setUploading(false); }
 }
 const source = p?.sourceDocumentText ?? "";
 return <div className="min-h-screen bg-workspace"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4">{isLoading ? <Loading /> : !p ? <div>Playbook-ul nu a fost găsit.</div> : <>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-semibold tracking-tight">{p.processName}</h1><p className="mt-2 text-[10px] text-ink-muted">{p.rules.length} reguli{p.generatedBy && ` · ${generatedByLabels[p.generatedBy]}`}{p.coverage !== undefined && ` · Acoperire ${p.coverage}%`}{p.buildSeconds !== undefined && ` · ${Math.round(p.buildSeconds)}s`}</p>{p.generatedBy === "fallback" && <p className="mt-2 max-w-xl text-[11px] text-sev-medium">Generarea cu LLM nu a reușit{p.fallbackReason ? ` (${p.fallbackReason})` : ""}; se afișează playbook-ul validat anterior.</p>}</div><div className="text-right"><div className="flex flex-wrap gap-2"><input ref={input} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} /><Button variant="outline" disabled={uploading} className="h-8 border-ink bg-card text-xs" onClick={() => input.current?.click()}>{uploading ? <><Loader2 className="h-3 w-3 animate-spin" />Se generează… {clock(seconds)} / max 1:40</> : "Încarcă procedură"}</Button><Button variant="outline" className="h-8 border-ink bg-card text-xs" onClick={() => toast.info("Respingere simulată pentru playbook-ul SPECIMEN.")}>Respinge</Button><Button variant="outline" disabled={!source} className="h-8 border-ink bg-card text-xs" onClick={() => { setEditing(!editing); setDraft(source); }}>{editing ? "Închide" : "Editează"}</Button><Button className="h-8 text-xs" onClick={() => toast.info("Publicare simulată. Playbook-ul SPECIMEN nu activează reguli reale.")}>Publică playbook</Button></div><p className="mt-2 text-[10px] text-ink-muted">Playbook-ul devine activ doar după publicarea de către un om.</p></div></div>
  {!source && <p className="mt-6 text-sm text-ink-muted">Acest playbook nu are o procedură sursă atașată</p>}
  <div className={`mt-6 grid overflow-hidden rounded-[22px] bg-card shadow-card max-md:grid-cols-1 ${source ? "grid-cols-2" : "grid-cols-1"}`}>
   {source && <section className="border-r border-border p-6"><h2 className="mb-5 border-b border-border pb-4 text-xs font-semibold">Procedura originală · {p.sourceName}</h2>{editing ? <textarea aria-label="Procedura originală" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[550px] w-full rounded border border-border bg-card p-3 text-sm" /> : <>
    <p className="mb-6 whitespace-pre-line text-sm leading-7">{procedureIntro(source)}</p>
    {p.clauses?.map((clause) => <div key={clause.number} className="mb-6"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{clause.number}</h3><span className={`text-[10px] ${clause.status === "Neverificată" ? "text-sev-medium" : "text-ink-muted"}`}>{clause.status}</span></div><p className="text-sm leading-7 text-ink">{selected && clause.ruleIds.includes(selected) ? <mark className="bg-brand/30 text-ink">{clause.text}</mark> : clause.text}</p></div>)}
    {source.includes("\nSurse") && <p className="whitespace-pre-line text-xs leading-6 text-ink-muted">{source.slice(source.indexOf("\nSurse"))}</p>}
   </>}</section>}
   <section className="p-6"><h2 className="mb-2 border-b border-border pb-4 text-xs font-semibold">Reguli generate</h2>{p.rules.map((r) => <Button key={r.id} variant="ghost" onClick={() => setSelected(r.id)} className={`flex h-auto w-full flex-col items-start gap-1 whitespace-normal rounded-none border-b border-border px-3 py-4 text-left ${selected === r.id ? "border-l-2 border-l-brand bg-beige" : ""}`}><span className={`text-[10px] font-normal ${r.warning ? "text-sev-medium" : "text-ink-muted"}`}>{r.warning ? "De verificat · " : ""}{r.id} · {r.params["clauza"] ? `Clauza ${r.params["clauza"]}` : r.kind}</span><span className="text-xs font-semibold leading-relaxed">{r.text}</span>{r.warning && <span className="text-[10px] font-normal text-ink-muted">{r.warning}</span>}</Button>)}</section>
  </div><div className="mt-4 flex gap-4 text-xs text-teal"><Link to="/playbooks/$id" params={{ id: "pb_cont_pj_v1" }}>Cont persoană juridică</Link><Link to="/playbooks/$id" params={{ id: "pb_kyc_pf_v1" }}>KYC persoană fizică</Link></div>
 </>}</main></div>;
}
