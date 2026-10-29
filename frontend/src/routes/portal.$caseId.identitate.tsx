import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { getOnboarding, saveIdentityCheck } from "@/api/client";
import { PortalLayout, usePortalCase } from "@/components/dosar/PortalFlow";
import { LivenessCapture, type CapturedIdentity } from "@/components/dosar/LivenessCapture";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/$caseId/identitate")({
  head: () => ({ meta: [{ title: "Verificarea identității · Raif2Future" }, { name: "description", content: "O fotografie scurtă pentru a confirma că actul îți aparține." }, { property: "og:title", content: "Verificarea identității · Raif2Future" }, { property: "og:description", content: "Selfie cu verificare de prezență." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: IdentityPage,
});

function IdentityPage() {
  const { caseId } = Route.useParams(); const navigate = useNavigate(); const qc = useQueryClient();
  const { c, docs } = usePortalCase(caseId);
  const { data: onboarding } = useQuery({ queryKey: ["onboarding", caseId], queryFn: () => getOnboarding(caseId) });
  const [busy, setBusy] = useState(false); const [retake, setRetake] = useState(false);
  const closed = c?.stage === "finalizat" || c?.stage === "in_analiza";

  async function save(captured: CapturedIdentity) {
    setBusy(true);
    try { await saveIdentityCheck(caseId, captured); await qc.invalidateQueries({ queryKey: ["onboarding", caseId] }); await navigate({ to: "/portal/$caseId/rezumat", params: { caseId } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Fotografia nu a putut fi salvată."); }
    finally { setBusy(false); }
  }

  return <PortalLayout step="identitate">
    <h1 className="text-[22px] font-semibold">Confirmă că ești tu</h1>
    <p className="mt-2 text-xs leading-[18px] text-ink-muted">Facem o fotografie scurtă și o comparăm cu poza din actul de identitate. Îți cerem să clipești și să întorci capul, ca să știm că ești o persoană reală, nu o fotografie.</p>
    <div className="mt-6">
      {onboarding?.identity && !retake ? <div className="rounded-[22px] bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-4"><img src={onboarding.identity.selfie} alt="Fotografia ta de verificare" className="h-20 w-20 rounded-2xl object-cover" /><p className="flex items-center gap-2 text-xs"><CheckCircle2 className="h-4 w-4 text-sev-ok" />Fotografia a fost primită.</p></div>
        <div className="mt-4 flex flex-wrap gap-3"><Button className="h-8 text-xs" onClick={() => void navigate({ to: "/portal/$caseId/rezumat", params: { caseId } })}>Continuă</Button>{!closed && <Button variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={() => setRetake(true)}>Refă fotografia</Button>}</div>
      </div> : <LivenessCapture disabled={busy || closed} onCaptured={(r) => void save(r)} />}
    </div>
    <div className="mt-5 flex items-center justify-between gap-3">
      <Button asChild variant="outline" className="h-8 px-4 text-xs"><Link to="/portal/$caseId/pas/$n" params={{ caseId, n: String(Math.max(1, docs.length)) }}><ChevronLeft />Înapoi</Link></Button>
      {onboarding?.identity && <Button asChild variant="outline" className="h-8 px-4 text-xs"><Link to="/portal/$caseId/rezumat" params={{ caseId }}>Înainte<ChevronRight /></Link></Button>}
    </div>
  </PortalLayout>;
}
