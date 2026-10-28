import { createFileRoute } from "@tanstack/react-router";
import { PortalStep } from "@/components/dosar/PortalFlow";
export const Route=createFileRoute("/portal/$caseId/pas/$n")({head:({params})=>({meta:[{title:`Document ${params.n} · Raif2Future`},{name:"description",content:"Încarcă documentul pentru deschiderea contului."},{property:"og:title",content:"Documentele tale · Raif2Future"},{property:"og:description",content:"Verificarea documentelor pentru contul tău."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){const {caseId,n}=Route.useParams();return <PortalStep key={`${caseId}-${n}`} caseId={caseId} step={Number(n)}/>;}
