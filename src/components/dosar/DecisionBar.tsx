import { useState } from "react";
import { Check, FileQuestion, Loader2, ShieldCheck, X } from "lucide-react";
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
      <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1392px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <ShieldCheck className="h-4 w-4 text-teal" />
            <span><strong className="text-ink">Decizia finală aparține analistului.</strong> AI-ul doar propune, nu aprobă și nu respinge.</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen("documente")}><FileQuestion className="h-4 w-4" /> Solicită documente</Button>
            <Button variant="outline" className="border-sev-high/40 text-sev-high hover:bg-sev-high/10 hover:text-sev-high" onClick={() => setOpen("respins")}><X className="h-4 w-4" /> Respinge</Button>
            <Button onClick={() => setOpen("aprobat")}><Check className="h-4 w-4" /> Aprobă</Button>
          </div>
        </div>
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
