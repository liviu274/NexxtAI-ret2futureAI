import { createFileRoute } from "@tanstack/react-router";
import { PortalSent } from "@/components/dosar/PortalFlow";
export const Route=createFileRoute("/portal/$caseId/trimis")({head:()=>({meta:[{title:"Dosar trimis · Raif2Future"},{name:"description",content:"Confirmarea trimiterii dosarului către bancă."},{property:"og:title",content:"Dosar trimis · Raif2Future"},{property:"og:description",content:"Dosarul tău a fost trimis pentru analiză."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <PortalSent caseId={Route.useParams().caseId}/>;}
