import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCases } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { AuditTable } from "@/components/dosar/AuditTable";
export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Jurnal de audit · DosarAI" },
      { name: "description", content: "Evenimentele de verificare din dosarele SPECIMEN." },
      { property: "og:title", content: "Jurnal de audit · DosarAI" },
      { property: "og:description", content: "Trasabilitatea verificărilor DosarAI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});
function AuditPage() {
  const { data = [] } = useQuery({ queryKey: ["cases"], queryFn: listCases });
  const [selected, setSelected] = useState("");
  const id = selected || data[0]?.id;
  return (
    <div className="min-h-screen bg-beige">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-8 py-6">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <select
            aria-label="Dosar audit"
            className="max-w-full rounded border border-border bg-card p-2 text-xs"
            value={id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.map((c) => (
              <option value={c.id} key={c.id}>
                {c.clientName} · {c.id}
              </option>
            ))}
          </select>
        </div>
        {id && <AuditTable caseId={id} />}
      </main>
    </div>
  );
}
