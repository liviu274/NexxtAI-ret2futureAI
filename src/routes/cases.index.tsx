import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { listCases } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Loading, TypeBadge } from "@/components/dosar/badges";
import { Button } from "@/components/ui/button";
import { riskLabels, severityLabels } from "@/lib/dataset";
import type { Case, Severity } from "@/types";
export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "Dosare · DosarAI" },
      { name: "description", content: "Dosare SPECIMEN KYC și KYB în analiza echipei." },
      { property: "og:title", content: "Dosare · DosarAI" },
      { property: "og:description", content: "Lista dosarelor și propunerilor de risc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CasesPage,
});
function Problems({ c }: { c: Case }) {
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {(["critical", "high", "medium", "low"] as Severity[]).map((s) => {
        const n = c.flags.filter(
          (f) => f.severity === s && f.status !== "dismissed" && f.status !== "resolved",
        ).length;
        return n ? (
          <span
            key={s}
            className={s === "medium" ? "text-ink" : s === "low" ? "text-teal" : "text-sev-high"}
          >
            {n}{" "}
            {n === 1
              ? severityLabels[s].toLowerCase()
              : { critical: "critice", high: "ridicate", medium: "medii", low: "informative" }[s]}
          </span>
        ) : null;
      })}
      {c.flags.every((f) => f.status === "dismissed" || f.status === "resolved") && (
        <span className="text-ink-muted">Fără probleme</span>
      )}
    </div>
  );
}
function CasesPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["cases"], queryFn: listCases });
  const [tab, setTab] = useState("review");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [risk, setRisk] = useState("");
  const reviewing = data.filter((c) => c.status === "În analiză");
  const clean = reviewing.filter((c) => !c.flags.length);
  const waiting = data.filter((c) => c.status === "Documente solicitate");
  const filtered = (
    tab === "review"
      ? reviewing
      : tab === "clean"
        ? clean
        : tab === "waiting"
          ? waiting
          : data.filter((c) => c.status === "Aprobat" || c.status === "Respins")
  ).filter(
    (c) =>
      (!type || c.customerType === type) &&
      (!risk || c.riskDraft.level === risk) &&
      `${c.clientName} ${c.id} ${c.cui ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="min-h-screen bg-workspace">
      <AnalystHeader />
      <main className="mx-auto max-w-[1392px] px-[42px] py-10 max-sm:px-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Dosare</h1>
            <p className="mt-1 text-xs text-ink-muted">
              {reviewing.length} de analizat · {clean.length} gata de aprobare · timp mediu de
              procesare AI:{" "}
              {data.length
                ? Math.round(data.reduce((n, c) => n + c.processingMs, 0) / data.length / 1000)
                : 0}
              s
            </p>
          </div>
          <label className="flex h-8 w-60 items-center gap-2 rounded-md border border-border bg-card px-3">
            <Search className="h-3.5 w-3.5 text-line" />
            <input
              aria-label="Caută dosare"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după nume, CNP sau CUI"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-border">
          <div className="flex flex-wrap gap-5">
            {[
              ["review", `De analizat (${reviewing.length})`],
              ["clean", `Gata de aprobare (${clean.length})`],
              ["waiting", `Solicitate documente (${waiting.length})`],
              ["done", "Finalizate"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant="ghost"
                onClick={() => setTab(key ?? "review")}
                className={`h-10 rounded-none border-b-2 px-0 text-xs font-normal ${tab === key ? "border-brand text-ink" : "border-transparent text-ink-muted"}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-4 text-xs text-ink-muted">
            <label>
              Tip:{" "}
              <select
                aria-label="Tip client"
                className="bg-transparent"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Toate</option>
                <option>PF</option>
                <option>PJ</option>
              </select>
            </label>
            <label>
              Risc:{" "}
              <select
                aria-label="Propunere de risc"
                className="bg-transparent"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              >
                <option value="">Toate</option>
                {Object.entries(riskLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          {isLoading ? (
            <Loading />
          ) : (
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-[10px] text-ink-muted">
                <tr>
                  {["Client", "Tip", "Probleme", "Propunere de risc", "Primit", ""].map((h, i) => (
                    <th key={i} className="px-[18px] py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-t border-border ${i === 0 ? "bg-beige/70" : ""}`}
                  >
                    <td className={`px-[18px] py-3 ${i === 0 ? "border-l-2 border-brand" : ""}`}>
                      <Link
                        to="/cases/$id"
                        params={{ id: c.id }}
                        className="font-semibold text-ink"
                      >
                        {c.clientName}
                        <div className="mt-0.5 max-w-72 break-all text-[10px] font-normal text-ink-muted">
                          {c.id}
                        </div>
                      </Link>
                    </td>
                    <td className="px-[18px] py-3">
                      <TypeBadge type={c.customerType} />
                    </td>
                    <td className="px-[18px] py-3">
                      <Problems c={c} />
                    </td>
                    <td
                      className={`px-[18px] py-3 ${c.riskDraft.level === "critical" ? "text-sev-high" : "text-ink"}`}
                    >
                      {riskLabels[c.riskDraft.level]}
                    </td>
                    <td className="px-[18px] py-3 text-ink-muted">{c.createdAt}</td>
                    <td className="px-[18px] py-3">
                      <Link to="/cases/$id" params={{ id: c.id }} aria-label={`Deschide ${c.id}`}>
                        <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && !filtered.length && (
            <div className="p-12 text-center text-xs text-ink-muted">
              Nu există dosare în această categorie.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
