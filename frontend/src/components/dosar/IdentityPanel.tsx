import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { getIdentityReview } from "@/api/client";
import { CONSENT_ITEMS, type FaceComparison } from "@/lib/onboarding";
import type { Case } from "@/types";

const when = (iso: string) => new Date(iso).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
const score = (n: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NOT_COMPARED: Record<string, string> = {
  no_face_id: "nu am găsit o poză pe actul de identitate",
  no_face_selfie: "nu am găsit o față în fotografie",
  several_faces_selfie: "în fotografie apar mai multe fețe",
  unreadable: "o imagine nu a putut fi citită",
};

function FaceRow({ face, stored }: { face: FaceComparison | null | undefined; stored: boolean }) {
  const icon = (ok: boolean | null) => ok === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sev-ok" /> : ok === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-sev-high" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sev-medium" />;
  if (!stored) return <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" /><span><strong>Potrivirea feței cu actul:</strong> dosar demonstrativ, fără serviciul de verificare. Compară vizual cele două imagini.</span></li>;
  if (!face) return <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" /><span><strong>Potrivirea feței cu actul:</strong> se calculează după ce clientul încarcă actul de identitate.</span></li>;
  if (face.status === "match") return <li className="flex gap-2">{icon(true)}<span><strong>Potrivirea feței cu actul:</strong> aceeași persoană (similaritate {score(face.score ?? 0)}, prag {score(face.threshold)}).</span></li>;
  if (face.status === "no_match") return <li className="flex gap-2">{icon(false)}<span><strong>Potrivirea feței cu actul:</strong> fața din fotografie nu se potrivește cu poza din act (similaritate {score(face.score ?? 0)}, sub pragul {score(face.threshold)}). Aprobarea este blocată; compară imaginile.</span></li>;
  return <li className="flex gap-2">{icon(null)}<span><strong>Potrivirea feței cu actul:</strong> nu a putut fi calculată ({NOT_COMPARED[face.reason ?? ""] ?? "verificarea nu a rulat"}). Compară vizual cele două imagini.</span></li>;
}

/** Officer view of the onboarding: consent, the selfie next to the ID photo and the face comparison. The officer decides. */
export function IdentityPanel({ c }: { c: Case }) {
  const { data: o } = useQuery({ queryKey: ["onboarding", c.id, "review"], queryFn: () => getIdentityReview(c.id) });
  if (!o?.consent && !o?.identity) return null;
  const id = o.identity;
  const idDoc = c.documents.find((d) => /identity|id_card|identitate|buletin/i.test(`${d.type} ${d.fileName}`));
  const liveOk = id?.liveness.method === "mediapipe" && id.liveness.blink && id.liveness.turn;
  return <section className="mt-4 rounded-[22px] bg-card p-6 shadow-card">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold">Verificarea identității</h2><span className="text-[10px] text-ink-muted">Date din onboarding · {o.stored ? "stocate în dosar" : "dosar demonstrativ, salvate în acest browser"}</span></div>
    <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-5 max-md:grid-cols-1">
      <figure><figcaption className="mb-2 text-[11px] text-ink-muted">Fotografia clientului</figcaption>{id ? <img src={id.selfie} alt="Fotografia de verificare a clientului" className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-muted text-xs text-ink-muted">Lipsește</div>}</figure>
      <figure><figcaption className="mb-2 text-[11px] text-ink-muted">Actul de identitate</figcaption>{idDoc?.pageImages[0] ? <img src={idDoc.pageImages[0]} alt="Actul de identitate al clientului" className="aspect-[4/3] w-full rounded-2xl bg-muted object-contain" /> : <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-muted px-4 text-center text-xs text-ink-muted">Imaginea actului nu este disponibilă</div>}</figure>
      <ul className="space-y-3 text-xs leading-[18px]">
        <li className="flex gap-2">{liveOk ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sev-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sev-medium" />}<span><strong>Persoană prezentă:</strong> {!id ? "fotografia lipsește." : liveOk ? "a clipit și a întors capul la cerere." : id.fallbackReason ?? "verificarea nu a fost completă."}</span></li>
        <FaceRow face={o.face} stored={o.stored} />
        <li className="flex gap-2">{o.consent ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sev-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sev-medium" />}<span><strong>Consimțământ:</strong> {o.consent ? `acordat la ${when(o.consent.at)} (${CONSENT_ITEMS.filter((i) => o.consent?.items.includes(i.id)).map((i) => i.id === "kyc" ? "verificare KYC" : i.id === "biometric" ? "fotografie biometrică" : i.id === "screening" ? "screening" : "marketing").join(", ")}).` : "lipsește."}</span></li>
        {id && <li className="text-[11px] text-ink-muted">Fotografie primită la {when(id.capturedAt)}.</li>}
      </ul>
    </div>
  </section>;
}
