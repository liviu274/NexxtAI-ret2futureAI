import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCase } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { AuditTable } from "@/components/dosar/AuditTable";
import { TypeBadge } from "@/components/dosar/badges";
import { riskLabels } from "@/lib/dataset";
export const Route = createFileRoute("/cases/$id/audit")({ head: ({ params }) => ({ meta: [{ title: `Jurnal ${params.id} · Raif2Future` }, { name: "description", content: "Jurnalul verificărilor pentru dosarul SPECIMEN." }, { property: "og:title", content: `Jurnal ${params.id} · Raif2Future` }, { property: "og:description", content: "Trasabilitate documente și verificări." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: AuditPage });
function AuditPage() { const { id } = Route.useParams(); const { data: c } = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) }); return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4"><h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-tight text-ink">{c?.clientName ?? "Jurnal dosar"}{c && <TypeBadge type={c.customerType} />}</h1><p className="mt-2 break-all text-[10px] text-ink-muted">Dosar {id} · {c?.createdAt} · Propunere de risc: {c ? riskLabels[c.riskDraft.level] : "—"}</p><div className="mb-6 mt-4 inline-flex gap-1 rounded-full bg-beige-dark p-1 text-[13px] font-medium"><Link to="/cases/$id" params={{ id }} className="rounded-full px-4 py-1.5 text-ink-muted hover:text-ink">Probleme</Link><span className="rounded-full bg-brand px-4 py-1.5">Audit log</span></div><AuditTable caseId={id} /></main></div>; }
