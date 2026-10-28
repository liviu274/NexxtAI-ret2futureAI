import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPlaybooks, createPortalCase } from "@/api/client";
import { documentLabels } from "@/lib/portal";
import { PortalLayout } from "@/components/dosar/PortalFlow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { CustomerType, Person } from "@/types";
export const Route = createFileRoute("/portal/")({
  head: () => ({
    meta: [
      { title: "Deschide un cont · DosarAI" },
      { name: "description", content: "Începe deschiderea unui cont pentru tine sau firma ta." },
      { property: "og:title", content: "Deschide un cont · DosarAI" },
      { property: "og:description", content: "Documentele necesare pentru deschiderea contului." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalStart,
});
function PortalStart() {
  const { data = [] } = useQuery({ queryKey: ["playbooks"], queryFn: listPlaybooks });
  const [type, setType] = useState<CustomerType>("PF");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [pfName, setPfName] = useState("Mara Exemplu");
  const [persons, setPersons] = useState<Person[]>([
    { id: "p_admin", name: "Daria Model", role: "administrator" },
    { id: "p_ubo_1", name: "Tudor Exemplu", role: "UBO" },
    { id: "p_ubo_2", name: "Irina Model", role: "UBO" },
    { id: "p_sign", name: "Victor Test", role: "semnatar" },
  ]);
  async function start() {
    setBusy(true);
    try {
      const c = await createPortalCase(
        type,
        type === "PF" ? [{ id: "p_pf", name: pfName.trim(), role: "titular" }] : persons,
      );
      await navigate({ to: "/portal/$caseId/pas/$n", params: { caseId: c.id, n: "1" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dosarul nu a putut fi început.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PortalLayout>
      <h1 className="text-[22px] font-semibold">Deschide un cont curent</h1>
      <div className="mt-7 space-y-4">
        {(["PF", "PJ"] as CustomerType[]).map((t) => (
          <div
            key={t}
            className={`rounded-md border bg-card p-[18px] ${type === t ? "border-ink" : "border-border"}`}
          >
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="radio"
                name="tip-client"
                checked={type === t}
                onChange={() => setType(t)}
              />
              {t === "PF" ? "Persoană fizică" : "Firmă (persoană juridică)"}
            </label>
            <ul className="mt-3 space-y-2 text-xs text-ink-muted">
              {[...new Set(data.find((p) => p.customerType === t)?.requiredDocuments ?? [])].map(
                (d) => (
                  <li key={d}>• {documentLabels[d] ?? d}</li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
      {type === "PF" && (
        <label className="mt-6 block text-xs text-ink-muted">
          Numele tău, ca în actul de identitate
          <Input
            aria-label="Numele titularului"
            className="mt-2 bg-card"
            value={pfName}
            onChange={(e) => setPfName(e.target.value)}
          />
        </label>
      )}
      {type === "PJ" && (
        <div className="mt-6 divide-y divide-border">
          {persons.map((p, i) => (
            <label key={p.id} className="block py-3 text-xs text-ink-muted">
              {p.role === "UBO"
                ? "Beneficiar real"
                : p.role === "semnatar"
                  ? "Delegat"
                  : "Administrator"}
              <Input
                aria-label={`Nume ${p.role} ${i + 1}`}
                className="mt-2 bg-card"
                value={p.name}
                onChange={(e) =>
                  setPersons((rows) =>
                    rows.map((row) => (row.id === p.id ? { ...row, name: e.target.value } : row)),
                  )
                }
              />
            </label>
          ))}
        </div>
      )}
      <Button
        className="mt-6 w-full"
        disabled={
          busy ||
          !data.length ||
          (type === "PF" ? !pfName.trim() : persons.some((p) => !p.name.trim()))
        }
        onClick={start}
      >
        Începe
      </Button>
    </PortalLayout>
  );
}
