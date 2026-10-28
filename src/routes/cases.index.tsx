import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCases } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Card, Loading, SeverityBadge, TypeBadge } from "@/components/dosar/badges";
import type { Case } from "@/types";

export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "Dosare · DosarAI" },
      { name: "description", content: "Lista dosarelor KYC/KYB cu flag-uri pe severitate și propunerea de risc." },
      { property: "og:title", content: "Dosare · DosarAI" },
      { property: "og:description", content: "Dosarele de onboarding care așteaptă analiza." },
    ],
  }),
  component: CasesPage,
});

const riskCls = { scăzut: "text-sev-ok", mediu: "text-sev-medium", ridicat: "text-sev-high" };

function counts(c: Case) {
  return (["high", "medium", "low"] as const).map((s) => [s, c.flags.filter((f) => f.severity === s).length] as const).filter(([, n]) => n > 0);
}

function CasesPage() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["cases"], queryFn: listCases });
  return (
    <div className="min-h-screen bg-beige">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-6 py-8">
        <h1 className="text-2xl font-bold text-ink">Dosare</h1>
        <p className="mt-1 text-sm text-ink-muted">Dosarele verificate de AI, în așteptarea deciziei tale.</p>
        <Card className="mt-6 overflow-hidden">
          {isLoading ? (
            <Loading label="Se încarcă dosarele…" />
          ) : !data?.length ? (
            <div className="py-16 text-center text-sm text-ink-muted">Nu există dosare de analizat. Dosarele noi vor apărea aici automat.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-beige-dark text-left text-xs text-ink-muted">
                <tr>{["Dosar", "Client", "Tip", "Status", "Flag-uri", "Propunere de risc", "Data"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} onClick={() => nav({ to: "/cases/$id", params: { id: c.id } })} className="cursor-pointer border-t border-border hover:bg-beige">
                    <td className="px-4 py-3 font-medium text-teal">#{c.id}</td>
                    <td className="px-4 py-3 text-ink">{c.clientName}{c.cui && <div className="text-xs text-ink-muted">CUI {c.cui}</div>}</td>
                    <td className="px-4 py-3"><TypeBadge type={c.customerType} /></td>
                    <td className="px-4 py-3">{c.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {counts(c).length ? counts(c).map(([s, n]) => <SeverityBadge key={s} severity={s} count={n} />) : <span className="text-xs text-sev-ok">Fără flag-uri</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-medium capitalize ${riskCls[c.riskDraft.level]}`}>{c.riskDraft.level}</td>
                    <td className="px-4 py-3 text-ink-muted">{c.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}
