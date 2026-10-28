import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clock, FileText, Flag as FlagIcon, Gauge, Minus, ShieldAlert } from "lucide-react";
import { getCase } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Card, DocumentStatusBadge, Loading, SeverityBadge, TypeBadge } from "@/components/dosar/badges";
import { DocumentViewer } from "@/components/dosar/DocumentViewer";
import { FlagCard } from "@/components/dosar/FlagCard";
import { DecisionBar } from "@/components/dosar/DecisionBar";
import { StageStepper } from "@/components/dosar/StageStepper";
import { AuditTable } from "@/components/dosar/AuditTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Severity } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cases/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: `Dosar #${params.id} · DosarAI` },
      { name: "description", content: `Analiza dosarului ${params.id}: flag-uri, dovezi și propunere de risc.` },
      { property: "og:title", content: `Dosar #${params.id} · DosarAI` },
      { property: "og:description", content: "Revizuire analist cu dovezi evidențiate în documente." },
    ],
  }),
  component: CasePage,
});

const SEV_ORDER: Severity[] = ["high", "medium", "low"];
const SEV_TITLE = { high: "Critice", medium: "Medii", low: "Informative" };
const riskCls = { scăzut: "text-sev-ok", mediu: "text-sev-medium", ridicat: "text-sev-high" };

function CasePage() {
  const { id } = Route.useParams();
  const { data: c, isLoading } = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) });
  const [flagId, setFlagId] = useState<string | null>(null);
  const [evIdx, setEvIdx] = useState(0);
  const [docId, setDocId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const flag = c?.flags.find((f) => f.id === flagId) ?? null;
  const ev = flag?.evidence[evIdx];
  const doc = c?.documents.find((d) => d.id === (ev?.documentId ?? docId)) ?? null;
  const highlights = useMemo(
    () => (flag ? flag.evidence.filter((e) => e.documentId === doc?.id && e.page === page).map((e) => e.bbox) : []),
    [flag, doc, page],
  );

  function selectFlag(fid: string) {
    const f = c!.flags.find((x) => x.id === fid)!;
    setFlagId(fid);
    setEvIdx(0);
    setPage(f.evidence[0]?.page ?? 0);
  }

  if (isLoading)
    return (
      <div className="min-h-screen bg-beige"><AnalystHeader /><Loading label="Se încarcă dosarul…" /></div>
    );
  if (!c)
    return (
      <div className="min-h-screen bg-beige"><AnalystHeader />
        <div className="py-20 text-center text-ink-muted">Dosarul nu a fost găsit. <Link to="/cases" className="text-teal">Înapoi la dosare</Link></div>
      </div>
    );

  const bySev = SEV_ORDER.map((s) => [s, c.flags.filter((f) => f.severity === s)] as const);

  return (
    <div className="min-h-screen bg-beige">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-6 py-6">
        <Link to="/cases" className="text-sm text-teal">← Dosare</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-ink">
            Dosar #{c.id} · {c.clientName} · <TypeBadge type={c.customerType} />
          </h1>
          <span className="rounded-full bg-brand px-3 py-1 text-sm font-medium text-ink">{c.status}</span>
        </div>
        <Card className="mt-4 p-4"><StageStepper /></Card>

        <div className="mt-4 grid grid-cols-4 gap-4">
          <Summary icon={FileText} label="Documente" value={`${c.documents.length}`} sub={`${c.documents.filter((d) => d.status === "valid").length} valide`} />
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-ink-muted"><FlagIcon className="h-4 w-4" /> Flag-uri</div>
            <div className="mt-2 text-2xl font-bold text-ink">{c.flags.length}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {bySev.filter(([, l]) => l.length).map(([s, l]) => <SeverityBadge key={s} severity={s} count={l.length} />)}
            </div>
          </Card>
          <Summary icon={Gauge} label="Propunere de risc" value={<span className={cn("capitalize", riskCls[c.riskDraft.level])}>{c.riskDraft.level}</span>} sub="Propunere AI, nu decizie" />
          <Summary icon={Clock} label="Timp procesare AI" value={`${(c.processingMs / 1000).toFixed(1)} s`} sub="7 etape finalizate" />
        </div>

        <Card className="mt-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-ink"><ShieldAlert className="h-4 w-4 text-teal" /> Propunere de risc: <span className={cn("capitalize", riskCls[c.riskDraft.level])}>{c.riskDraft.level}</span></h2>
            <span className="text-xs text-ink-muted">Generată de AI · se confirmă de analist</span>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2">
            {c.riskDraft.reasons.map((r) => (
              <li key={r.factor} className="flex items-center justify-between border-b border-border py-1.5 text-sm">
                <span className="flex items-center gap-2 text-ink">
                  {r.impact === "crește" ? <ArrowUp className="h-4 w-4 text-sev-high" /> : r.impact === "scade" ? <ArrowDown className="h-4 w-4 text-sev-ok" /> : <Minus className="h-4 w-4 text-line" />}
                  {r.factor}
                </span>
                <span className="text-ink-muted">{r.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Tabs defaultValue="flags" className="mt-6">
          <TabsList className="bg-beige-dark">
            <TabsTrigger value="flags">Flag-uri ({c.flags.length})</TabsTrigger>
            <TabsTrigger value="docs">Documente ({c.documents.length})</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="flags">
            <div className="mt-2 grid grid-cols-[2fr_3fr] gap-4">
              <div className="flex flex-col gap-5">
                {c.flags.length === 0 && <Card className="p-8 text-center text-sm text-ink-muted">AI-ul nu a găsit probleme în acest dosar. Verifică totuși documentele înainte de decizie.</Card>}
                {bySev.filter(([, l]) => l.length).map(([s, list]) => (
                  <section key={s}>
                    <h3 className="mb-2 text-sm font-semibold text-ink">{SEV_TITLE[s]} · {list.length}</h3>
                    <div className="flex flex-col gap-2">
                      {list.map((f) => <FlagCard key={f.id} flag={f} active={f.id === flagId} onSelect={() => selectFlag(f.id)} />)}
                    </div>
                  </section>
                ))}
              </div>
              <Card className="sticky top-4 self-start p-4">
                <DocumentViewer document={doc} page={page} highlights={highlights} onPageChange={setPage} />
                {flag && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {flag.evidence.length > 1 && (
                      <div className="flex gap-2">
                        {flag.evidence.map((e, i) => {
                          const d = c.documents.find((x) => x.id === e.documentId);
                          return (
                            <button key={i} onClick={() => { setEvIdx(i); setPage(e.page); }} className={cn("rounded-md border px-3 py-1 text-xs", i === evIdx ? "border-ink bg-brand text-ink" : "border-border text-ink-muted")}>
                              Dovada {i + 1}: {d?.type}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="rounded-md bg-beige-dark p-3">
                      <div className="text-xs font-semibold text-ink-muted">Regula {flag.ruleId} din playbook</div>
                      <div className="mt-1 text-sm text-ink">{flag.ruleText}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-muted">Explicația AI</div>
                      <p className="mt-1 text-sm text-ink">{flag.explanation}</p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-muted">Mesaj pentru client</div>
                      <p className="mt-1 text-sm italic text-ink-muted">„{flag.clientFixMessage}”</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="docs">
            <Card className="mt-2 divide-y divide-border">
              {c.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium text-ink">{d.type}</div>
                    <div className="text-xs text-ink-muted">{d.fileName} · {d.extractedFields.length} câmpuri extrase</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <DocumentStatusBadge status={d.status} />
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card className="mt-2 overflow-hidden">
              <AuditTable caseId={c.id} />
              <div className="border-t border-border p-3 text-right">
                <Link to="/cases/$id/audit" params={{ id: c.id }} className="text-sm text-teal">Deschide jurnalul complet →</Link>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
        <div className="h-8" />
      </main>
      <DecisionBar caseId={c.id} />
    </div>
  );
}

function Summary({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-ink-muted"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{sub}</div>
    </Card>
  );
}
