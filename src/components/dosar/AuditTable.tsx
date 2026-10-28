import { useQuery } from "@tanstack/react-query";
import { Bot, User } from "lucide-react";
import { getAuditLog } from "@/api/client";
import { Loading } from "./badges";
import { cn } from "@/lib/utils";

const st = { ok: "text-sev-ok", avertisment: "text-sev-medium", eroare: "text-sev-high" };

export function AuditTable({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["audit", caseId], queryFn: () => getAuditLog(caseId) });
  if (isLoading) return <Loading label="Se încarcă jurnalul…" />;
  if (!data?.length) return <div className="py-12 text-center text-sm text-ink-muted">Nu există încă intrări în jurnal pentru acest dosar.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-beige-dark text-left text-xs text-ink-muted">
        <tr>{["Ora", "Actor", "Etapă", "Acțiune", "Intrare", "Rezultat", "Durată", "Stare"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((a) => (
          <tr key={a.id} className="border-t border-border">
            <td className="px-3 py-2 text-ink-muted">{a.timestamp.split(" ")[1]}</td>
            <td className="px-3 py-2">{a.actor === "ai" ? <span className="inline-flex items-center gap-1"><Bot className="h-4 w-4 text-teal" />AI</span> : <span className="inline-flex items-center gap-1"><User className="h-4 w-4" />Analist</span>}</td>
            <td className="px-3 py-2 font-medium text-ink">{a.stage}</td>
            <td className="px-3 py-2">{a.action}</td>
            <td className="px-3 py-2 text-ink-muted">{a.input}</td>
            <td className="px-3 py-2 text-ink-muted">{a.output}</td>
            <td className="px-3 py-2 tabular-nums text-ink-muted">{(a.durationMs / 1000).toFixed(1)} s</td>
            <td className={cn("px-3 py-2 font-medium capitalize", st[a.status])}>{a.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
