import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPlaybooks } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { TypeBadge } from "@/components/dosar/badges";
const options = queryOptions({ queryKey: ["playbooks"], queryFn: listPlaybooks });
export const Route = createFileRoute("/playbooks/")({
  head: () => ({ meta: [{ title: "Playbook-uri · Raif2Future" }, { name: "description", content: "Proceduri și reguli KYC și KYB pentru analiza dosarelor." }, { property: "og:title", content: "Playbook-uri · Raif2Future" }, { property: "og:description", content: "Lista procedurilor și regulilor de verificare." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(options), component: Playbooks,
});
function Playbooks() {
  const { data } = useSuspenseQuery(options);
  return <div className="min-h-screen bg-workspace"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4"><h1 className="text-[28px] font-semibold tracking-tight">Playbook-uri</h1><div className="mt-6 overflow-x-auto rounded-[22px] bg-card shadow-card"><table className="w-full min-w-[600px] text-left text-xs"><thead className="text-ink-muted"><tr>{["Playbook", "Tip", "Reguli", "Sursă", "Data"].map((v) => <th key={v} className="px-[18px] py-3 font-normal">{v}</th>)}</tr></thead><tbody>{[...data].sort((a,b) => a.customerType === "PJ" ? -1 : b.customerType === "PJ" ? 1 : 0).map((p) => <tr key={p.id} className="border-t border-border"><td className="px-[18px] py-4"><Link to="/playbooks/$id" params={{ id: p.id }} className="font-semibold text-ink">{p.processName}</Link></td><td className="px-[18px] py-4"><TypeBadge type={p.customerType} /></td><td className="px-[18px] py-4">{p.rules.length}</td><td className="px-[18px] py-4 text-ink-muted">{p.sourceName}</td><td className="px-[18px] py-4 text-ink-muted">{p.sourceDate}</td></tr>)}</tbody></table></div></main></div>;
}
