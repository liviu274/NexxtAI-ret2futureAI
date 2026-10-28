import { createFileRoute } from "@tanstack/react-router";
import { ClientPortal } from "@/components/dosar/ClientPortal";
export const Route = createFileRoute("/upload")({ head: () => ({ meta: [{ title: "Încarcă documente · DosarAI" }, { name: "description", content: "Portalul pentru documentele dosarului SPECIMEN." }, { property: "og:title", content: "Încarcă documente · DosarAI" }, { property: "og:description", content: "Documente solicitate pentru verificare." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: UploadPage });
function UploadPage() { return <ClientPortal caseId="case_pf_05_adresa_factura_diferita" />; }
