import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Case } from "@/types";
import { ownershipRows } from "@/lib/dataset";
const Graph = lazy(() => import("./OwnershipGraph"));
export function OwnershipPanel({ c }: { c: Case }) {
  const rows = ownershipRows(c);
  return (
    <>
      <ClientOnly fallback={<div className="h-[250px]" />}>
        <Suspense fallback={<div className="h-[250px]" />}>
          <Graph c={c} />
        </Suspense>
      </ClientOnly>
      <section className="mt-3 border-t border-border pt-6">
        <h2 className="mb-3 text-xs font-semibold text-ink">
          Registru ONRC vs. declarație beneficiar real
        </h2>
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] text-ink-muted">
            <tr>
              {["Persoană", "ONRC", "Declarat", "Status"].map((label) => (
                <th key={label} className="py-2 font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.person.id}-${r.person.name}`} className="border-t border-border">
                <td className="py-3 text-ink">{r.person.name}</td>
                <td>{r.registry === undefined ? "—" : `${r.registry}%`}</td>
                <td>{r.declared === undefined ? "—" : `${r.declared}%`}</td>
                <td className={r.matches ? "text-ink-muted" : "text-sev-high"}>
                  <span className="inline-flex items-center gap-1">
                    {r.matches ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {r.matches ? "Concordant" : "Diferă"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
