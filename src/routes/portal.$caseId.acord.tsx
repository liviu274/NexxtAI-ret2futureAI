import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getOnboarding, saveConsent } from "@/api/client";
import { PortalLayout } from "@/components/dosar/PortalFlow";
import { Button } from "@/components/ui/button";
import { CONSENT_ITEMS, type ConsentId } from "@/lib/onboarding";

export const Route = createFileRoute("/portal/$caseId/acord")({
  head: () => ({ meta: [{ title: "Acordul tău · Raif2Future" }, { name: "description", content: "Acordurile necesare pentru verificarea identității și a documentelor." }, { property: "og:title", content: "Acordul tău · Raif2Future" }, { property: "og:description", content: "Consimțământ pentru deschiderea contului." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ConsentPage,
});

function ConsentPage() {
  const { caseId } = Route.useParams(); const navigate = useNavigate(); const qc = useQueryClient();
  const { data: onboarding } = useQuery({ queryKey: ["onboarding", caseId], queryFn: () => getOnboarding(caseId) });
  const [checked, setChecked] = useState<ConsentId[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (onboarding?.consent) setChecked(onboarding.consent.items); }, [onboarding?.consent]);
  const ready = CONSENT_ITEMS.filter((i) => i.required).every((i) => checked.includes(i.id));

  async function next() {
    setBusy(true);
    try { await saveConsent(caseId, checked); await qc.invalidateQueries({ queryKey: ["onboarding", caseId] }); await navigate({ to: "/portal/$caseId/pas/$n", params: { caseId, n: "1" } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Acordul nu a putut fi salvat."); }
    finally { setBusy(false); }
  }

  return <PortalLayout step="acord">
    <h1 className="text-[22px] font-semibold">Înainte să începem</h1>
    <p className="mt-2 text-xs leading-[18px] text-ink-muted">Ca să-ți deschidem contul online, avem nevoie de acordul tău pentru verificările de mai jos.</p>
    <div className="mt-6 space-y-3">{CONSENT_ITEMS.map((item) => <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-[18px] border bg-card p-4 text-xs leading-[18px] ${checked.includes(item.id) ? "border-ink" : "border-border"}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]" checked={checked.includes(item.id)} onChange={(e) => setChecked((v) => e.target.checked ? [...v, item.id] : v.filter((x) => x !== item.id))} />
      <span>{item.label}{item.required && <span className="ml-1 text-ink-muted">(obligatoriu)</span>}</span>
    </label>)}</div>
    <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">Fotografia de verificare este o dată biometrică. O folosim doar ca să confirmăm că actul îți aparține și o păstrăm cât cer obligațiile legale ale băncii. Poți retrage acordul oricând, dar fără el contul nu poate fi deschis online.</p>
    <Button className="mt-6 w-full" disabled={!ready || busy} onClick={next}>Continuă</Button>
    <Link to="/portal" className="mt-5 inline-block text-xs text-teal">Înapoi</Link>
  </PortalLayout>;
}
