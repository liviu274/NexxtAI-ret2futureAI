import { CaseAvailability } from "./CaseAvailability";
import { SERVICE_UNAVAILABLE } from "@/api/client";
import { invalidateCaseQueries } from "@/lib/case-cache";
import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { getClientCaseStatus, getClientPortalCase, checkPortalDocument, submitPortalCase } from "@/api/client";
import { ClientHeader } from "./Header";
import { Button } from "@/components/ui/button";
export function PortalLayout({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-beige"><ClientHeader /><main className="mx-auto w-full max-w-[560px] px-6 pb-12 pt-10">{children}<p id="ajutor" className="mt-8 text-center text-[10px] text-ink-muted">Documentele tale sunt folosite doar pentru deschiderea contului.</p></main></div>; }
export function usePortalCase(caseId: string) {
 // Client-safe view only: the full case (flags, risk, evidence) never reaches the portal.
 const query = useQuery({ queryKey: ["portal-case", caseId], queryFn: () => getClientPortalCase(caseId) });
 const c = query.data;
 return { ...query, c, docs: c?.documents ?? [] };
}
export function PortalStep({ caseId, step }: { caseId: string; step: number }) {
 const { c, docs, isLoading } = usePortalCase(caseId); const doc = docs[step - 1]; const input = useRef<HTMLInputElement>(null);
 const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null); const [busy, setBusy] = useState(false); const [help, setHelp] = useState(false);
 const navigate = useNavigate(); const qc = useQueryClient();
 useEffect(() => { setResult(null); }, [caseId, step]);
 async function upload(file?: File) {
  if (!file || c?.stage === "finalizat" || c?.mutationBlockedReason) return; setHelp(false);
  if (file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) { setResult({ok:false,message:"Alege un fișier PDF, JPG sau PNG de cel mult 10 MB."}); return; }
  setBusy(true); setResult(null);
  try { const r = await checkPortalDocument(caseId, step, file, doc?.key); setResult(r); }
  catch (e) { setResult({ok:false,message:e instanceof Error ? e.message : "Documentul nu a putut fi primit. Încearcă din nou."}); }
  finally { await invalidateCaseQueries(qc); setBusy(false); }
 }
 const visible = result ?? (doc?.processingPending ? {ok:false,message:"Documentul a fost primit, dar citirea nu este finalizată. Continuă cu verificarea dosarului."} : doc?.ok && c?.stage !== "documente_solicitate" ? { ok:true,message:"Documentul este în regulă." } : null);
 return <PortalLayout>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !c || !doc ? <p>Documentul nu a fost găsit.</p> : <>
  <CaseAvailability reason={c.stage === "finalizat" ? "Dosarul este închis. Modificările nu mai sunt permise." : c.mutationBlockedReason} />
  <div className="mb-4 flex gap-2" aria-label="Documente">{docs.map((d,i) => <Link key={d.key} to="/portal/$caseId/pas/$n" params={{caseId,n:String(i+1)}} aria-label={`Documentul ${i+1}${d.ok ? ", încărcat" : ""}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${d.ok ? "border-sev-ok text-sev-ok" : i+1===step ? "border-brand bg-brand text-ink" : "border-border text-ink-muted"}`}>{d.ok ? <Check className="h-3 w-3" /> : i+1}</Link>)}</div>
  <p className="text-[11px] text-ink-muted">Pasul {step} din {docs.length}</p><progress aria-label="Progres documente" value={step} max={docs.length} className="portal-progress mt-2 h-1 w-full overflow-hidden rounded-full" />
  {doc.personName && <p className="mt-5 text-xs text-ink-muted">Documente pentru {doc.personName} ({c.persons.find((p)=>p.id===doc.personId)?.role === "UBO" ? "beneficiar real" : c.persons.find((p)=>p.id===doc.personId)?.role === "semnatar" ? "delegat" : "administrator"})</p>}
  <h1 className="mt-6 text-[22px] font-semibold">{doc.type === "utility_bill" ? "Dovada adresei" : doc.label}</h1><p className="mt-2 text-xs leading-[18px] text-ink-muted">{doc.type === "utility_bill" ? "O factură de utilități pe numele și adresa din actul de identitate." : "Încarcă un document complet și lizibil."}</p>
  <input ref={input} type="file" disabled={c.stage === "finalizat" || !!c.mutationBlockedReason} accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e)=>void upload(e.target.files?.[0])}/>
  {busy ? <div className="mt-7 flex min-h-44 items-center justify-center gap-3 text-sm text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />Verificăm documentul…</div> : !visible ? <div className="mt-7 flex min-h-[175px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-border bg-card px-4 py-6" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();void upload(e.dataTransfer.files[0]);}}><Upload className="h-6 w-6 text-ink-muted"/><p className="mt-3 text-xs text-ink-muted">Trage fișierul aici sau</p><Button className="mt-3 h-8 px-5 text-xs" disabled={c.stage === "finalizat" || !!c.mutationBlockedReason} onClick={()=>input.current?.click()}>Alege fișier</Button><p className="mt-3 text-[10px] text-ink-muted">PDF, JPG sau PNG, maxim 10 MB</p></div> : <div className={`mt-7 rounded-[22px] border-l-4 bg-card shadow-card p-[18px] ${visible.ok ? "border-l-sev-ok" : "border-l-sev-medium"}`}>
   {doc.fileName && <p className="text-[10px] text-ink-muted">{doc.fileName}</p>}<p role="status" className="mt-2 text-xs leading-[18px]">{visible.message}</p>
   <div className="mt-4 flex flex-wrap items-center gap-3">{visible.ok ? <Button className="h-8 text-xs" onClick={()=>void navigate(c.stage === "in_analiza" || c.stage === "finalizat" ? {to:"/portal/$caseId",params:{caseId}} : c.stage === "documente_solicitate" && c.requestedStep ? {to:"/portal/$caseId/pas/$n",params:{caseId,n:String(c.requestedStep)}} : step < docs.length ? {to:"/portal/$caseId/pas/$n",params:{caseId,n:String(step+1)}} : {to:"/portal/$caseId/rezumat",params:{caseId}})}>Continuă</Button> : <Button className="h-8 text-xs" disabled={c.stage === "finalizat" || !!c.mutationBlockedReason} onClick={()=>input.current?.click()}>Încarcă alt document</Button>}{visible.ok ? <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" disabled={c.stage === "finalizat" || !!c.mutationBlockedReason} onClick={()=>input.current?.click()}>Schimbă documentul</Button> : <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={()=>setHelp(!help)}>De ce am nevoie de asta?</Button>}</div>{help && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Banca are nevoie de documente valabile, cu aceleași date de identificare.</p>}
  </div>}
  {c.canProcess && <Button asChild variant="outline" className="mt-5 w-full text-xs" disabled={busy}><Link to="/portal/$caseId/rezumat" params={{caseId}}>Verifică dosarul</Link></Button>}
  <Link to={step>1 ? "/portal/$caseId/pas/$n" : "/portal"} params={step>1 ? {caseId,n:String(step-1)} : {}} className="mt-5 inline-block text-xs text-teal">Înapoi</Link>
 </>}</PortalLayout>;
}
export function PortalSummary({ caseId }: { caseId: string }) {
 const { c,docs }=usePortalCase(caseId); const qc=useQueryClient(); const [busy,setBusy]=useState(false); const navigate=useNavigate();
 async function submit(){setBusy(true);try{const r=await submitPortalCase(caseId);await invalidateCaseQueries(qc);await navigate({to:"waitingForDocuments" in r && r.waitingForDocuments ? "/portal/$caseId" : "/portal/$caseId/trimis",params:{caseId}});}catch(e){toast.error(e instanceof Error?e.message:"Dosarul nu a putut fi trimis.");}finally{await invalidateCaseQueries(qc);setBusy(false);}}
 return <PortalLayout><h1 className="text-[22px] font-semibold">Verifică documentele</h1><CaseAvailability reason={c?.stage === "finalizat" ? "Dosarul este închis. Modificările nu mai sunt permise." : c?.mutationBlockedReason}/><div className="mt-6 divide-y divide-border">{docs.map((d,i)=><div key={d.key} className="flex items-start gap-3 py-4 text-xs"><CheckCircle2 className={`h-4 w-4 shrink-0 ${d.ok?"text-sev-ok":"text-ink-muted"}`}/><div className="min-w-0 flex-1"><p className="font-semibold">{d.label}{d.personName && ` · ${d.personName}`}</p><p className="mt-1 break-all text-ink-muted">{d.fileName??"Document neîncărcat"}</p>{d.processingPending && <p className="mt-1 text-sev-medium">Citirea documentului nu este finalizată.</p>}</div>{c?.stage !== "finalizat" && !c?.mutationBlockedReason && <Link to="/portal/$caseId/pas/$n" params={{caseId,n:String(i+1)}} className="text-teal">Schimbă</Link>}</div>)}</div><Button className="mt-6 w-full" disabled={busy||!c||c.stage === "finalizat"||!!c.mutationBlockedReason||!docs.length||(!c.canProcess&&!docs.every((d)=>d.ok))} onClick={submit}>{c?.canProcess ? docs.some((d)=>d.processingPending) ? "Reîncearcă verificarea" : "Verifică dosarul" : "Trimite dosarul"}</Button></PortalLayout>;
}
export function PortalSent({ caseId }: { caseId: string }) {return <PortalLayout><CheckCircle2 className="mb-6 h-14 w-14 text-sev-ok"/><h1 className="text-[22px] font-semibold">Dosarul tău a fost trimis</h1><p className="mt-4 text-sm leading-6 text-ink-muted">Îl verifică un ofițer al băncii. Te anunțăm în 1–2 zile lucrătoare.</p><Link to="/portal/$caseId" params={{caseId}} className="mt-6 inline-block text-xs text-teal">Vezi starea dosarului</Link></PortalLayout>;}
const CLIENT_STEPS = ["Documente primite", "Verificare documente", "Analiză la bancă", "Decizie"];
export function PortalStatus({ caseId }: { caseId: string }) {
 const { data: s, isLoading } = useQuery({ queryKey: ["client-status", caseId], queryFn: () => getClientCaseStatus(caseId) });
 if (isLoading) return <PortalLayout><Loader2 className="h-5 w-5 animate-spin"/></PortalLayout>;
 if (!s) return <PortalLayout>Dosarul nu a fost găsit.</PortalLayout>;
 return <PortalLayout><h1 className="text-[22px] font-semibold">Dosarul meu</h1><CaseAvailability reason={s.serviceUnavailable ? SERVICE_UNAVAILABLE : s.decision ? "Dosarul este închis. Modificările nu mai sunt permise." : undefined}/>
  <ol aria-label="Progresul dosarului" className="mt-8 grid grid-cols-4">{CLIENT_STEPS.map((label, i) => {
   const n = (i + 1) as 1|2|3|4; const done = n < s.step || (n === s.step && s.state === "done"); const action = n === s.step && s.state === "action_needed"; const current = n === s.step && s.state === "current";
   return <li key={label} aria-current={current||action ? "step" : undefined} className="relative flex flex-col items-center px-1 text-center">
    {i > 0 && <span aria-hidden className={`absolute right-1/2 top-3 h-0.5 w-full -translate-x-3 ${n <= s.step ? "bg-sev-ok" : "bg-border"}`} style={{width:"calc(100% - 24px)"}}/>}
    <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${done ? "border-sev-ok bg-sev-ok text-card" : action ? "border-sev-medium bg-sev-medium text-card" : current ? "border-brand bg-brand text-ink" : "border-border bg-card text-ink-muted"}`}>{done ? <Check className="h-3.5 w-3.5"/> : action ? "!" : current ? "" : n}</span>
    <span className={`mt-2 text-[11px] leading-4 ${current||action ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-muted"}`}>{label}</span>
    {done && s.dates[n] && <span className="mt-1 text-[10px] text-ink-muted">{s.dates[n]}</span>}
    {action && <span className="mt-1 text-[10px] leading-4 text-sev-medium">Avem nevoie de ceva de la tine</span>}
   </li>; })}</ol>
  <div className="mt-8">
   {s.state === "action_needed" && <div className="rounded-[22px] border-l-4 border-l-sev-medium bg-card shadow-card p-[18px]"><p className="text-xs font-semibold">Banca îți cere:</p><ul className="mt-2 space-y-1 text-xs leading-6">{(s.client_messages.length ? s.client_messages : ["Încarcă documentul solicitat."]).map((m) => <li key={m}>{m}</li>)}</ul>{s.upload_step && <Button asChild className="mt-4 h-8 text-xs"><Link to="/portal/$caseId/pas/$n" params={{caseId,n:String(s.upload_step)}}>Încarcă documentul</Link></Button>}</div>}
   {s.step === 1 && <div className="rounded-[22px] bg-card shadow-card p-[18px]"><p className="text-xs leading-6">Încarcă toate documentele ca să putem începe verificarea.</p>{s.upload_step && <Button asChild className="mt-4 h-8 text-xs"><Link to="/portal/$caseId/pas/$n" params={{caseId,n:String(s.upload_step)}}>Continuă încărcarea</Link></Button>}</div>}
   {s.step === 2 && s.state === "current" && <p className="text-sm leading-6 text-ink-muted">Verificăm documentele primite.</p>}
   {s.step === 3 && <p className="text-sm leading-6 text-ink-muted">Un ofițer al băncii analizează dosarul. De obicei durează 1–2 zile lucrătoare.</p>}
   {s.decision === "approved" && <p className="text-sm font-semibold leading-6">Contul tău a fost aprobat</p>}
   {s.decision === "rejected" && <p className="text-sm leading-6">Nu am putut aproba cererea. Te contactăm telefonic.</p>}
  </div><Link to="/portal/$caseId/rezumat" params={{caseId}} className="mt-6 inline-block text-xs text-teal">Vezi documentele</Link></PortalLayout>;
}
