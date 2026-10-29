import { createFileRoute } from "@tanstack/react-router";
import { PortalSummary } from "@/components/dosar/PortalFlow";
export const Route=createFileRoute("/portal/$caseId/rezumat")({head:()=>({meta:[{title:"Rezumat documente · Raif2Future"},{name:"description",content:"Verifică și trimite documentele pentru contul tău."},{property:"og:title",content:"Rezumat documente · Raif2Future"},{property:"og:description",content:"Documentele dosarului înainte de trimitere."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <PortalSummary caseId={Route.useParams().caseId}/>;}
