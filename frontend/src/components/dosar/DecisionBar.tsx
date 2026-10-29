import { useCaseLocked } from "./CaseAvailability";
import { invalidateCaseQueries } from "@/lib/case-cache";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitDecision, getClientPortalCase, isRealCase } from "@/api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { blockingFlags, problemLabel } from "@/lib/review";
import type { Flag } from "@/types";

type D = "aprobat" | "respins" | "documente";
const LABELS: Record<D, { title: string; desc: string; cta: string }> = {
  aprobat: { title: "Aprobi dosarul?", desc: "Confirmi că ai analizat toate flag-urile și aprobi onboarding-ul clientului.", cta: "Confirmă aprobarea" },
  respins: { title: "Respingi dosarul?", desc: "Clientul va fi notificat că cererea nu poate fi aprobată.", cta: "Confirmă respingerea" },
  documente: { title: "Soliciți documente suplimentare?", desc: "Clientul va primi mesajele de corectare asociate flag-urilor.", cta: "Trimite solicitarea" },
};

/** `pending`: the client has not sent the case yet, so no check has run and approval is not possible. */
export function DecisionBar({ caseId, flags = [], pending = false }: { caseId: string; flags?: Flag[]; pending?: boolean }) {
  const locked = useCaseLocked(caseId);
  const blocked = blockingFlags(flags).length;
  const qc = useQueryClient();
  const [open, setOpen] = useState<D | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
  const { data: portal } = useQuery({ queryKey: ["portal-case", caseId], queryFn: () => getClientPortalCase(caseId), enabled: open === "documente" && !isRealCase(caseId) });

  async function confirm() {
    if (!open) return;
    setBusy(true);
    try {
      await submitDecision(caseId, open, comment, documentKeys);
      await invalidateCaseQueries(qc);
      toast.success(`Decizia a fost înregistrată pentru dosarul #${caseId}.`);
      setOpen(null); setComment(""); setDocumentKeys([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Decizia nu a putut fi înregistrată."); await invalidateCaseQueries(qc); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={locked} variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("documente")}>Solicită documente</Button>
          <Button disabled={locked} variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("respins")}>Respinge</Button>
          <Button disabled={locked || pending || blocked > 0} className="h-8 px-4 text-xs disabled:bg-beige-dark disabled:text-ink-muted disabled:opacity-100" onClick={() => setOpen("aprobat")}>Aprobă</Button>
        </div><span className="max-w-80 text-right text-[10px] text-ink-muted">{pending ? "Clientul nu a trimis încă dosarul. Verificările rulează după trimitere." : blocked ? `Aprobarea e blocată de ${problemLabel(blocked)}. ${blocked === 1 ? "Rezolv-o sau ignor-o" : "Rezolvă-le sau ignoră-le"} cu motiv.` : "Decizia finală aparține analistului."}</span>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{LABELS[open].title}</DialogTitle>
                <DialogDescription>{LABELS[open].desc}</DialogDescription>
              </DialogHeader>
              <label className="text-sm font-medium text-ink">
                {open === "documente" ? "Mesaj pentru client" : "Comentariu (opțional)"}
                <Textarea className="mt-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex.: verificat telefonic cu clientul" />
              </label>
              {open === "documente" && portal && <fieldset className="space-y-2 text-xs"><legend className="mb-2 font-medium">Documentele solicitate suplimentar</legend>{portal.documents.map((d) => <label key={d.key} className="flex items-center gap-2"><input type="checkbox" checked={documentKeys.includes(d.key)} onChange={(e) => setDocumentKeys((keys) => e.target.checked ? [...keys, d.key] : keys.filter((key) => key !== d.key))}/>{d.label}{d.personName ? ` · ${d.personName}` : ""}</label>)}</fieldset>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(null)}>Anulează</Button>
                <Button onClick={confirm} disabled={locked || busy || (open === "aprobat" && blocked > 0) || (open === "documente" && !comment.trim())}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{LABELS[open].cta}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
