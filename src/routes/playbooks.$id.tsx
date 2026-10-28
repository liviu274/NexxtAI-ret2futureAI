import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { getPlaybook } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Card, Loading, TypeBadge } from "@/components/dosar/badges";

export const Route = createFileRoute("/playbooks/$id")({
  head: () => ({
    meta: [
      { title: "Playbook · DosarAI" },
      { name: "description", content: "Regulile extrase din procedura băncii, cu propoziția sursă pentru fiecare regulă." },
      { property: "og:title", content: "Playbook · DosarAI" },
      { property: "og:description", content: "Procedura băncii transformată în reguli verificabile." },
    ],
  }),
  component: PlaybookPage,
});

function PlaybookPage() {
  const { id } = Route.useParams();
  const { data: p, isLoading } = useQuery({ queryKey: ["playbook", id], queryFn: () => getPlaybook(id) });
  return (
    <div className="min-h-screen bg-beige">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-6 py-8">
        {isLoading ? <Loading label="Se încarcă playbook-ul…" /> : !p ? (
          <div className="py-16 text-center text-ink-muted">Playbook-ul nu a fost găsit.</div>
        ) : (
          <>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-ink">{p.processName} <TypeBadge type={p.customerType} /></h1>
            <div className="mt-6 grid grid-cols-[3fr_2fr] gap-4">
              <Card className="divide-y divide-border">
                {p.rules.map((r) => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-center gap-2 text-xs text-ink-muted"><span className="font-semibold text-ink">{r.id}</span> · {r.kind}</div>
                    <div className="mt-1 font-medium text-ink">{r.text}</div>
                    <div className="mt-1 text-xs text-ink-muted">{Object.entries(r.params).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
                    <div className="mt-2 border-l-2 border-teal pl-3 text-sm italic text-ink-muted">„{r.sourceSentence}”</div>
                    {r.warning && <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-sev-medium/10 px-2 py-0.5 text-xs text-sev-medium"><AlertTriangle className="h-3.5 w-3.5" /> {r.warning}</div>}
                  </div>
                ))}
              </Card>
              <Card className="self-start bg-beige-dark p-5">
                <h2 className="text-sm font-semibold text-ink">Documentul sursă</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{p.sourceDocumentText}</p>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
