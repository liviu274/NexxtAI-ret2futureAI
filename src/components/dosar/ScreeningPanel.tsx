import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getScreeningMatch, resolveScreeningMatch } from "@/api/client";
import { matchKind, matchKindLabels, screeningRows } from "@/lib/screening";
import type { Flag } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DismissFlag } from "./DismissFlag";

export function ScreeningPanel({ caseId, flag }: { caseId: string; flag: Flag }) {
  const queryClient = useQueryClient();
  const { data: match, isLoading, error } = useQuery({ queryKey: ["screening", caseId, flag.id], queryFn: () => getScreeningMatch(caseId, flag.id) });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function resolve(resolution: "confirmed" | "dismissed") {
    setBusy(true);
    try {
      await resolveScreeningMatch(caseId, flag.id, resolution, reason);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["case", caseId] }), queryClient.invalidateQueries({ queryKey: ["audit", caseId] })]);
      setOpen(false); setReason("");
      toast.success(resolution === "confirmed" ? "Potrivire confirmată de ofițer." : "Potrivire ignorată cu motiv.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acțiunea nu a putut fi înregistrată."); }
    finally { setBusy(false); }
  }
  if (isLoading) return <div className="flex min-h-64 items-center justify-center text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" aria-label="Se încarcă potrivirea" /></div>;
  if (!match) return <p className="py-8 text-xs text-ink-muted">{error ? "Potrivirea nu a putut fi încărcată." : "Înregistrarea de screening nu este disponibilă."}</p>;
  const { entry } = match;
  return <div className="text-xs text-ink">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div><p className="text-[10px] text-ink-muted">{"id_sursa" in entry ? entry.id_sursa : entry.id_stire} · SPECIMEN</p><h2 className="mt-2 text-lg font-semibold">{"id_sursa" in entry ? matchKindLabels[matchKind(match)] : "Potrivire screening"}</h2><p className="mt-2 font-semibold">{"categorie_risc" in entry ? entry.categorie_risc === "PEP" ? "Persoană expusă public" : "Sancțiuni internaționale" : "Presă negativă"}</p></div>
      <span className="text-sm font-semibold">Potrivire {match.score}%</span>
    </div>
    {"id_sursa" in entry ? <><p className="py-4 leading-relaxed text-ink-muted">{entry.motiv_includere}</p><table className="w-full table-fixed border-collapse text-left"><thead><tr className="border-b border-border"><th className="w-[25%] pb-3 font-normal" /><th className="pb-3 font-semibold">Client</th><th className="pb-3 font-semibold">Listă</th></tr></thead><tbody>{screeningRows(match).map((row) => <tr key={row.label} className={`border-b border-border ${row.matches ? "text-ink" : "text-sev-medium"}`}><th scope="row" className="break-words py-4 pr-2 font-normal">{row.label}</th><td className="break-words py-4 pr-3">{row.client}</td><td className="break-words py-4"><span className="flex items-start gap-2">{row.matches && <Check className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-label="Concordant" />}<span>{row.list}</span></span></td></tr>)}</tbody></table></> : <div className="divide-y divide-border"><h3 className="py-4 text-sm font-semibold leading-relaxed">{entry.titlu_stire}</h3>{[["Subiect", entry.nume_subiect], ["Sursă", entry.sursa_stire], ["An", entry.an_publicare], ["Țară", entry.tara_subiect], ["Cuvinte-cheie de risc", entry.cuvinte_cheie_risc.join(", ")]].map(([label, value]) => <p key={label} className="py-3 leading-relaxed"><span className="mr-3 text-ink-muted">{label}</span>{value}</p>)}</div>}
    <p className="mt-5 text-ink-muted">Potrivirea trebuie confirmată de ofițer.</p>
    {flag.screeningResolution ? <div role="status" className="mt-4 border-t border-border py-3"><p className="font-semibold">{flag.screeningResolution === "confirmed" ? "Potrivire confirmată de ofițer" : "Potrivire ignorată cu motiv"}</p>{flag.screeningReason && <p className="mt-2 break-words text-ink-muted">{flag.screeningReason}</p>}</div> : <div className="mt-4 flex flex-wrap gap-2"><Button className="h-auto min-h-9 whitespace-normal text-xs" disabled={busy} onClick={() => resolve("confirmed")}>{busy && <Loader2 className="h-3 w-3 animate-spin" />}Confirmă potrivirea</Button><DismissFlag caseId={caseId} flagId={flag.id} outline /></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Ignoră cu motiv</DialogTitle><DialogDescription>Motivul este înregistrat în audit; dosarul rămâne în analiză.</DialogDescription></DialogHeader><label className="text-sm font-medium">Motivul ignorării<Textarea className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Precizează diferențele de identitate" /></label><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Anulează</Button><Button disabled={busy || !reason.trim()} onClick={() => resolve("dismissed")}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Ignoră potrivirea</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}