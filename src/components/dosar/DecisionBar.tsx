import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitDecision } from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { blockingFlags, problemLabel } from "@/lib/review";
import type { Flag } from "@/types";

type D = "aprobat" | "respins" | "documente";
const LABELS: Record<D, { title: string; desc: string; cta: string }> = {
  aprobat: { title: "Aprobi dosarul?", desc: "Confirmi că ai analizat toate flag-urile și aprobi onboarding-ul clientului.", cta: "Confirmă aprobarea" },
  respins: { title: "Respingi dosarul?", desc: "Clientul va fi notificat că cererea nu poate fi aprobată.", cta: "Confirmă respingerea" },
  documente: { title: "Soliciți documente suplimentare?", desc: "Clientul va primi mesajele de corectare asociate flag-urilor.", cta: "Trimite solicitarea" },
};

export function DecisionBar({ caseId, flags = [] }: { caseId: string; flags?: Flag[] }) {
  const blocked = blockingFlags(flags).length;
  const qc = useQueryClient();
  const [open, setOpen] = useState<D | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!open) return;
    setBusy(true);
    try {
      await submitDecision(caseId, open, comment);
      await Promise.all([["case", caseId], ["cases"]].map((queryKey) => qc.invalidateQueries({ queryKey })));
      toast.success(`Decizia a fost înregistrată pentru dosarul #${caseId}.`);
      setOpen(null); setComment("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Decizia nu a putut fi înregistrată."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("documente")}>Solicită documente</Button>
          <Button variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("respins")}>Respinge</Button>
          <Button disabled={blocked > 0} className="h-8 px-4 text-xs disabled:bg-beige-dark disabled:text-ink-muted disabled:opacity-100" onClick={() => setOpen("aprobat")}>Aprobă</Button>
        </div><span className="max-w-80 text-right text-[10px] text-ink-muted">{blocked ? `Aprobarea e blocată de ${problemLabel(blocked)}. ${blocked === 1 ? "Rezolv-o sau ignor-o" : "Rezolvă-le sau ignoră-le"} cu motiv.` : "Decizia finală aparține analistului."}</span>
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
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(null)}>Anulează</Button>
                <Button onClick={confirm} disabled={busy || (open === "aprobat" && blocked > 0) || (open === "documente" && !comment.trim())}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{LABELS[open].cta}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
