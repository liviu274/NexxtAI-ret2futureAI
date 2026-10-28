import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitDecision } from "@/api/client";

type D = "aprobat" | "respins" | "documente";
const LABELS: Record<D, { title: string; desc: string; cta: string }> = {
  aprobat: { title: "Aprobi dosarul?", desc: "Confirmi că ai analizat toate flag-urile și aprobi onboarding-ul clientului.", cta: "Confirmă aprobarea" },
  respins: { title: "Respingi dosarul?", desc: "Clientul va fi notificat că cererea nu poate fi aprobată.", cta: "Confirmă respingerea" },
  documente: { title: "Soliciți documente suplimentare?", desc: "Clientul va primi mesajele de corectare asociate flag-urilor.", cta: "Trimite solicitarea" },
};

export function DecisionBar({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState<D | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!open) return;
    setBusy(true);
    await submitDecision(caseId, open, comment);
    setBusy(false);
    toast.success(`Decizia a fost înregistrată pentru dosarul #${caseId}.`);
    setOpen(null);
    setComment("");
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("documente")}>Solicită documente</Button>
          <Button variant="outline" className="h-8 border-ink bg-card px-3 text-xs" onClick={() => setOpen("respins")}>Respinge</Button>
          <Button className="h-8 px-4 text-xs" onClick={() => setOpen("aprobat")}>Aprobă</Button>
        </div><span className="text-[10px] text-ink-muted">Decizia finală aparține analistului.</span>
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
                Comentariu (opțional)
                <Textarea className="mt-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex.: verificat telefonic cu clientul" />
              </label>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(null)}>Anulează</Button>
                <Button onClick={confirm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{LABELS[open].cta}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
