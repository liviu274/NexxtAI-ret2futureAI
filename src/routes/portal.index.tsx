import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPlaybooks, createPortalCase } from "@/api/client";
import { documentLabels } from "@/lib/portal";
import { PortalLayout } from "@/components/dosar/PortalFlow";
import { useClientSession } from "@/components/dosar/useClientSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { CustomerType, Person } from "@/types";
export const Route = createFileRoute("/portal/")({head:()=>({meta:[{title:"Deschide un cont · Raif2Future"},{name:"description",content:"Începe deschiderea unui cont pentru tine sau firma ta."},{property:"og:title",content:"Deschide un cont · Raif2Future"},{property:"og:description",content:"Documentele necesare pentru deschiderea contului."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:PortalStart});
function PortalStart(){
 const {data=[]}=useQuery({queryKey:["playbooks"],queryFn:listPlaybooks}); const [type,setType]=useState<CustomerType>("PF"); const [busy,setBusy]=useState(false); const navigate=useNavigate();
 const [clientName,setClientName]=useState("Mara Exemplu"); const [companyName,setCompanyName]=useState("Atelier Exemplu Demo SRL");
 const {ready,session}=useClientSession();
 useEffect(()=>{if(ready&&!session)void navigate({to:"/cont/nou"});},[ready,session,navigate]);
 const [persons,setPersons]=useState<Person[]>([{id:"p_admin",name:"Daria Model",role:"administrator"},{id:"p_ubo_1",name:"Tudor Exemplu",role:"UBO"},{id:"p_ubo_2",name:"Irina Model",role:"UBO"},{id:"p_sign",name:"Victor Test",role:"semnatar"}]);
 async function start(){setBusy(true);try{const c=await createPortalCase(type,type==="PF"?[{id:"p_pf",name:clientName.trim(),role:"titular"}]:persons,companyName);await navigate({to:"/portal/$caseId/acord",params:{caseId:c.id}});}catch(e){toast.error(e instanceof Error?e.message:"Dosarul nu a putut fi început.");}finally{setBusy(false);}}
 return <PortalLayout step="date"><h1 className="text-[22px] font-semibold">Deschide un cont curent</h1><div className="mt-7 space-y-4">{(["PF","PJ"] as CustomerType[]).map((t)=><div key={t} className={`rounded-md border bg-card p-[18px] ${type===t?"border-ink":"border-border"}`}><label className="flex items-center gap-3 text-sm font-semibold"><input type="radio" name="tip-client" checked={type===t} onChange={()=>setType(t)}/>{t==="PF"?"Persoană fizică":"Firmă (persoană juridică)"}</label><ul className="mt-3 space-y-2 text-xs text-ink-muted">{[...new Set(data.find((p)=>p.customerType===t)?.requiredDocuments??[])].map((d)=><li key={d}>• {documentLabels[d]??d}</li>)}</ul></div>)}</div>{type==="PF"&&<label className="mt-6 block text-xs text-ink-muted">Numele tău<Input aria-label="Numele tău" className="mt-2 bg-card" value={clientName} onChange={(e)=>setClientName(e.target.value)}/></label>}{type==="PJ"&&<div className="mt-6 divide-y divide-border"><label className="block py-3 text-xs text-ink-muted">Denumirea firmei<Input aria-label="Denumirea firmei" className="mt-2 bg-card" value={companyName} onChange={(e)=>setCompanyName(e.target.value)}/></label>{persons.map((p,i)=><label key={p.id} className="block py-3 text-xs text-ink-muted">{p.role==="UBO"?"Beneficiar real":p.role==="semnatar"?"Delegat":"Administrator"}<Input aria-label={`Nume ${p.role} ${i+1}`} className="mt-2 bg-card" value={p.name} onChange={(e)=>setPersons((rows)=>rows.map((row)=>row.id===p.id?{...row,name:e.target.value}:row))}/></label>)}</div>}<Button className="mt-6 w-full" disabled={busy||!data.length||(type==="PF"?!clientName.trim():!companyName.trim()||persons.some((p)=>!p.name.trim()))} onClick={start}>Începe</Button></PortalLayout>;
}
