import { useCaseLocked } from "./CaseAvailability";
import { invalidateCaseQueries } from "@/lib/case-cache";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dismissFlag } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
export function DismissFlag({ caseId, flagId, outline = false }: { caseId: string; flagId: string; outline?: boolean }) {
  const locked = useCaseLocked(caseId);
  const [open, setOpen] = useState(false); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const qc = useQueryClient();
  async function confirm() {
    setBusy(true);
    try { const r = await dismissFlag(caseId, flagId, note); if (r.pending) toast.info(r.message); await invalidateCaseQueries(qc); setOpen(false); setNote(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Acțiunea nu a reușit."); await invalidateCaseQueries(qc); }
    finally { setBusy(false); }
  }
  return <><Button disabled={locked} variant={outline ? "outline" : "link"} className={outline ? "h-auto min-h-9 border-ink bg-card whitespace-normal text-xs" : "h-auto p-0 text-[10px] font-normal text-teal"} onClick={() => setOpen(true)}>{outline ? "Nu este aceeași persoană" : "Ignoră cu motiv"}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Ignoră cu motiv</DialogTitle><DialogDescription>Motivul și numele analistului sunt înregistrate în audit.</DialogDescription></DialogHeader><label className="text-sm font-medium">Motiv<Textarea required className="mt-2" value={note} onChange={(e) => setNote(e.target.value)} /></label><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Anulează</Button><Button disabled={locked || busy || !note.trim()} onClick={confirm}>Ignoră</Button></DialogFooter></DialogContent></Dialog></>;
}