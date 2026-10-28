import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCase } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { AuditTable } from "@/components/dosar/AuditTable";
import { TypeBadge } from "@/components/dosar/badges";
import { riskLabels } from "@/lib/dataset";
export const Route = createFileRoute("/cases/$id/audit")({ head: ({ params }) => ({ meta: [{ title: `Jurnal ${params.id} · DosarAI` }, { name: "description", content: "Jurnalul verificărilor pentru dosarul SPECIMEN." }, { property: "og:title", content: `Jurnal ${params.id} · DosarAI` }, { property: "og:description", content: "Trasabilitate documente și verificări." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: AuditPage });
function AuditPage() { const { id } = Route.useParams(); const { data: c } = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) }); return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="mx-auto max-w-[1392px] px-8 py-6 max-sm:px-[18px]"><h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">{c?.clientName ?? "Jurnal dosar"}{c && <TypeBadge type={c.customerType} />}</h1><p className="mt-2 break-all text-[10px] text-ink-muted">Dosar {id} · {c?.createdAt} · Propunere de risc: {c ? riskLabels[c.riskDraft.level] : "—"}</p><div className="mb-6 mt-5 flex gap-6 border-b border-border text-xs"><Link to="/cases/$id" params={{ id }} className="pb-3 text-ink-muted">Probleme</Link><span className="border-b-2 border-brand pb-3 font-semibold">Audit log</span></div><AuditTable caseId={id} /></main></div>; }
