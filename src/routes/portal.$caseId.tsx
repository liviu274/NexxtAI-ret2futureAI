import { createFileRoute } from "@tanstack/react-router";
import { ClientPortal } from "@/components/dosar/ClientPortal";
export const Route = createFileRoute("/portal/$caseId")({
  head: ({ params }) => ({ meta: [
    { title: `Documente ${params.caseId} · DosarAI` },
    { name: "description", content: "Documentele solicitate pentru dosarul tău SPECIMEN." },
    { property: "og:title", content: "Portal client · DosarAI" },
    { property: "og:description", content: "Încarcă documentele solicitate pentru verificare." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PortalPage,
});
function PortalPage() { const { caseId } = Route.useParams(); return <ClientPortal caseId={caseId} />; }