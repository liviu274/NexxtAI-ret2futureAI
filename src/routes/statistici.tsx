import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listCases } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { riskLabels } from "@/lib/dataset";
import { Button } from "@/components/ui/button";
const options = queryOptions({ queryKey: ["cases"], queryFn: listCases });
export const Route = createFileRoute("/statistici")({
  head: () => ({
    meta: [
      { title: "Statistici · DosarAI" },
      { name: "description", content: "Situația dosarelor SPECIMEN și timpii de procesare." },
      { property: "og:title", content: "Statistici · DosarAI" },
      { property: "og:description", content: "Indicatori calculați din dosarele KYC și KYB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(options),
  component: Statistics,
});
function Statistics() {
  const { data } = useSuspenseQuery(options);
  const [type, setType] = useState("");
  const rows = data.filter((c) => !type || c.customerType === type);
  return (
    <div className="min-h-screen bg-workspace">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-[42px] py-10 max-sm:px-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Statistici</h1>
          <div className="flex gap-4">
            {["", "PF", "PJ"].map((v) => (
              <Button
                key={v}
                variant="ghost"
                className={`h-8 rounded-none border-b-2 px-0 text-xs ${type === v ? "border-brand" : "border-transparent text-ink-muted"}`}
                onClick={() => setType(v)}
              >
                {v || "Toate"}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-7 grid grid-cols-4 gap-6 border-y border-border py-6 max-md:grid-cols-2">
          {[
            ["Dosare", rows.length],
            ["În analiză", rows.filter((c) => c.status === "În analiză").length],
            [
              "Documente solicitate",
              rows.filter((c) => c.status === "Documente solicitate").length,
            ],
            [
              "Procesare AI medie",
              `${rows.length ? Math.round(rows.reduce((n, c) => n + c.processingMs, 0) / rows.length / 1000) : 0}s`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-ink-muted">{label}</p>
              <p className="mt-3 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Propunere de risc</h2>
          <div className="mt-4 divide-y divide-border">
            {Object.entries(riskLabels).map(([key, label]) => (
              <div key={key} className="flex justify-between py-4 text-xs">
                <span>{label}</span>
                <span className="font-semibold">
                  {rows.filter((c) => c.riskDraft.level === key).length}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
