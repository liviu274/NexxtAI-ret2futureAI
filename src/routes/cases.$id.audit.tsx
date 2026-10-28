import { createFileRoute, Link } from "@tanstack/react-router";
import { AnalystHeader } from "@/components/dosar/Header";
import { AuditTable } from "@/components/dosar/AuditTable";
import { Card } from "@/components/dosar/badges";
import { DecisionBar } from "@/components/dosar/DecisionBar";

export const Route = createFileRoute("/cases/$id/audit")({
  head: ({ params }) => ({
    meta: [
      { title: `Audit log #${params.id} · DosarAI` },
      { name: "description", content: "Jurnalul complet al etapelor AI și al acțiunilor analistului." },
      { property: "og:title", content: `Audit log #${params.id} · DosarAI` },
      { property: "og:description", content: "Trasabilitate completă pentru fiecare dosar." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { id } = Route.useParams();
  return (
    <div className="min-h-screen bg-beige">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-6 py-6">
        <Link to="/cases/$id" params={{ id }} className="text-sm text-teal">← Dosar #{id}</Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">Audit log</h1>
        <Card className="mt-4 overflow-hidden"><AuditTable caseId={id} /></Card>
      </main>
      <DecisionBar caseId={id} />
    </div>
  );
}
