import { useState, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { getCase, getPlaybook, checkPortalDocument, submitPortalCase } from "@/api/client";
import { portalDocumentPlan } from "@/lib/portal";
import { ClientHeader } from "./Header";
import { Button } from "@/components/ui/button";
export function PortalLayout({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-beige"><ClientHeader /><main className="mx-auto w-full max-w-[560px] px-6 pb-12 pt-10">{children}<p id="ajutor" className="mt-8 text-center text-[10px] text-ink-muted">Documentele tale sunt folosite doar pentru deschiderea contului.</p></main></div>; }
export function usePortalCase(caseId: string) {
 const query = useQuery({ queryKey: ["case", caseId], queryFn: () => getCase(caseId) });
 const { data: p } = useQuery({ queryKey: ["playbook", query.data?.playbookId], queryFn: () => getPlaybook(query.data?.playbookId ?? ""), enabled: !!query.data?.playbookId });
 const c = query.data;
 return { ...query, c, docs: c?.portalDocuments ?? (c && p ? portalDocumentPlan(c.customerType, p.requiredDocuments ?? [], c.persons) : []) };
}
export function PortalStep({ caseId, step }: { caseId: string; step: number }) {
 const { c, docs, isLoading } = usePortalCase(caseId); const doc = docs[step - 1]; const input = useRef<HTMLInputElement>(null);
 const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null); const [busy, setBusy] = useState(false); const [help, setHelp] = useState(false);
 const navigate = useNavigate(); const qc = useQueryClient();
 async function upload(file?: File) {
  if (!file) return; setHelp(false);
  if (file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) { setResult({ok:false,message:"Alege un fișier PDF, JPG sau PNG de cel mult 10 MB."}); return; }
  setBusy(true); setResult(null);
  try { const r = await checkPortalDocument(caseId, step, file); setResult(r); await qc.invalidateQueries({queryKey:["case",caseId]}); }
  catch { setResult({ok:false,message:"Documentul nu a putut fi primit. Încearcă din nou."}); }
  finally { setBusy(false); }
 }
 const visible = result ?? (doc?.ok ? { ok:true,message:"Documentul este în regulă." } : null);
 return <PortalLayout>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !c || !doc ? <p>Documentul nu a fost găsit.</p> : <>
  <div className="mb-4 flex gap-2" aria-label="Documente">{docs.map((d,i) => <Link key={d.key} to="/portal/$caseId/pas/$n" params={{caseId,n:String(i+1)}} aria-label={`Documentul ${i+1}${d.ok ? ", încărcat" : ""}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${d.ok ? "border-sev-ok text-sev-ok" : i+1===step ? "border-brand bg-brand text-ink" : "border-border text-ink-muted"}`}>{d.ok ? <Check className="h-3 w-3" /> : i+1}</Link>)}</div>
  <p className="text-[11px] text-ink-muted">Pasul {step} din {docs.length}</p><progress aria-label="Progres documente" value={step} max={docs.length} className="portal-progress mt-2 h-1 w-full overflow-hidden rounded-full" />
  {doc.personName && <p className="mt-5 text-xs text-ink-muted">Documente pentru {doc.personName} ({c.persons.find((p)=>p.id===doc.personId)?.role === "UBO" ? "beneficiar real" : c.persons.find((p)=>p.id===doc.personId)?.role === "semnatar" ? "delegat" : "administrator"})</p>}
  <h1 className="mt-6 text-[22px] font-semibold">{doc.type === "utility_bill" ? "Dovada adresei" : doc.label}</h1><p className="mt-2 text-xs leading-[18px] text-ink-muted">{doc.type === "utility_bill" ? "O factură de utilități pe numele și adresa din actul de identitate." : "Încarcă un document complet și lizibil."}</p>
  <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e)=>void upload(e.target.files?.[0])}/>
  {busy ? <div className="mt-7 flex min-h-44 items-center justify-center gap-3 text-sm text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />Verificăm documentul…</div> : !visible ? <div className="mt-7 flex min-h-[175px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-4 py-6" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();void upload(e.dataTransfer.files[0]);}}><Upload className="h-6 w-6 text-ink-muted"/><p className="mt-3 text-xs text-ink-muted">Trage fișierul aici sau</p><Button className="mt-3 h-8 px-5 text-xs" onClick={()=>input.current?.click()}>Alege fișier</Button><p className="mt-3 text-[10px] text-ink-muted">PDF, JPG sau PNG, maxim 10 MB</p></div> : <div className={`mt-7 rounded-md border border-border border-l-2 bg-card p-[18px] ${visible.ok ? "border-l-sev-ok" : "border-l-sev-medium"}`}>
   {doc.fileName && <p className="text-[10px] text-ink-muted">{doc.fileName}</p>}<p role="status" className="mt-2 text-xs leading-[18px]">{visible.message}</p>
   <div className="mt-4 flex flex-wrap items-center gap-3">{visible.ok ? <Button className="h-8 text-xs" onClick={()=>void navigate(c.status === "În analiză" && c.requestedStep ? {to:"/portal/$caseId",params:{caseId}} : step < docs.length ? {to:"/portal/$caseId/pas/$n",params:{caseId,n:String(step+1)}} : {to:"/portal/$caseId/rezumat",params:{caseId}})}>Continuă</Button> : <Button className="h-8 text-xs" onClick={()=>input.current?.click()}>Încarcă alt document</Button>}{!visible.ok && <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={()=>setHelp(!help)}>De ce am nevoie de asta?</Button>}</div>{help && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Banca are nevoie de documente valabile, cu aceleași date de identificare.</p>}
  </div>}
  <Link to={step>1 ? "/portal/$caseId/pas/$n" : "/portal"} params={step>1 ? {caseId,n:String(step-1)} : {}} className="mt-5 inline-block text-xs text-teal">Înapoi</Link>
 </>}</PortalLayout>;
}
export function PortalSummary({ caseId }: { caseId: string }) {
 const { c,docs }=usePortalCase(caseId); const [busy,setBusy]=useState(false); const navigate=useNavigate();
 async function submit(){setBusy(true);try{await submitPortalCase(caseId);await navigate({to:"/portal/$caseId/trimis",params:{caseId}});}catch(e){toast.error(e instanceof Error?e.message:"Dosarul nu a putut fi trimis.");}finally{setBusy(false);}}
 return <PortalLayout><h1 className="text-[22px] font-semibold">Verifică documentele</h1><div className="mt-6 divide-y divide-border">{docs.map((d,i)=><div key={d.key} className="flex items-start gap-3 py-4 text-xs"><CheckCircle2 className={`h-4 w-4 shrink-0 ${d.ok?"text-sev-ok":"text-ink-muted"}`}/><div className="min-w-0 flex-1"><p className="font-semibold">{d.label}{d.personName && ` · ${d.personName}`}</p><p className="mt-1 break-all text-ink-muted">{d.fileName??"Document neîncărcat"}</p></div><Link to="/portal/$caseId/pas/$n" params={{caseId,n:String(i+1)}} className="text-teal">Schimbă</Link></div>)}</div><Button className="mt-6 w-full" disabled={busy||!c||!docs.length||!docs.every((d)=>d.ok)} onClick={submit}>Trimite dosarul</Button></PortalLayout>;
}
export function PortalSent({ caseId }: { caseId: string }) {return <PortalLayout><CheckCircle2 className="mb-6 h-14 w-14 text-sev-ok"/><h1 className="text-[22px] font-semibold">Dosarul tău a fost trimis</h1><p className="mt-4 text-sm leading-6 text-ink-muted">Îl verifică un ofițer al băncii. Te anunțăm în 1–2 zile lucrătoare.</p><Link to="/portal/$caseId" params={{caseId}} className="mt-6 inline-block text-xs text-teal">Vezi starea dosarului</Link></PortalLayout>;}
export function PortalStatus({ caseId }: { caseId: string }) {
 const {c,docs,isLoading}=usePortalCase(caseId); if(isLoading)return <PortalLayout><Loader2 className="h-5 w-5 animate-spin"/></PortalLayout>; if(!c)return <PortalLayout>Dosarul nu a fost găsit.</PortalLayout>;
 const waiting=c.status==="Documente solicitate"; const decided=["Aprobat","Respins"].includes(c.status); const current=decided?3:c.status==="În analiză"||waiting?2:c.status==="Se verifică"?1:0;
 return <PortalLayout><h1 className="text-[22px] font-semibold">Dosarul meu</h1><p className="mt-2 text-xs text-ink-muted">{c.clientName}</p><ol className="mt-7">{["Documente încărcate","Verificare automată",waiting?"Avem nevoie de ceva de la tine":"În analiză la bancă","Finalizat"].map((label,i)=><li key={i} className="flex items-start gap-4 pb-6 text-sm"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${i<=current?"border-sev-ok text-sev-ok":"border-border text-ink-muted"}`}>{i<current?<Check className="h-3 w-3"/>:<span className="text-xs">{i+1}</span>}</span><span className={i===current?"font-semibold":"text-ink-muted"}>{label}</span></li>)}</ol>{waiting&&<div className="rounded-md border border-border border-l-2 border-l-sev-medium bg-card p-[18px]"><p className="text-xs leading-6">Banca îți cere: {c.officerNote || c.flags.find((f)=>f.client_fixable)?.fix_message || "Încarcă documentul solicitat."}</p><Button asChild className="mt-4 h-8 text-xs"><Link to="/portal/$caseId/pas/$n" params={{caseId,n:String(c.requestedStep??Math.max(1,docs.findIndex((d)=>d.type==="utility_bill")+1))}}>Încarcă documentul</Link></Button></div>}{decided&&<p className="text-sm leading-6">{c.status==="Aprobat"?"Contul tău a fost aprobat":"Cererea ta nu a putut fi aprobată. Te contactăm telefonic."}</p>}{c.status==="Nou"&&<Button asChild><Link to="/portal/$caseId/pas/$n" params={{caseId,n:"1"}}>Continuă încărcarea</Link></Button>}</PortalLayout>;
}
