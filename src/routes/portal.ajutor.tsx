import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/dosar/PortalFlow";

export const Route = createFileRoute("/portal/ajutor")({
  component: Ajutor,
  head: () => ({
    meta: [
      { title: "Ajutor · Portal client DosarAI" },
      { name: "description", content: "Întrebări frecvente despre documentele necesare pentru deschiderea contului." },
      { property: "og:title", content: "Ajutor · Portal client DosarAI" },
      { property: "og:description", content: "Răspunsuri la întrebările frecvente despre încărcarea documentelor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const faq = [
  { q: "Ce documente îmi trebuie?", a: "Pentru persoane fizice: act de identitate, o factură de utilități recentă și fluturașul de salariu. Pentru firme: certificat constatator, act constitutiv, declarație de beneficiar real, actele de identitate ale persoanelor și specimenul de semnătură. Lista exactă apare la începerea dosarului." },
  { q: "Ce înseamnă „max 90 de zile”?", a: "Documentele care dovedesc adresa (de exemplu factura de utilități) trebuie emise în ultimele 90 de zile față de data încărcării. Un document mai vechi nu e acceptat și va trebui să încarci unul recent." },
  { q: "De ce mi s-a cerut alt document?", a: "Cel încărcat nu a trecut verificarea: poate fi expirat, adresa sau numele nu se potrivesc cu celelalte acte, ori imaginea nu e lizibilă. Citește mesajul de sub document și încarcă o variantă corectă." },
  { q: "Cât durează verificarea?", a: "Verificarea automată durează câteva secunde pentru fiecare document. După trimiterea dosarului, un ofițer al băncii îl analizează și primești răspunsul în 1–2 zile lucrătoare." },
  { q: "Cine vede documentele mele?", a: "Doar ofițerul care analizează dosarul tău. Documentele sunt folosite exclusiv pentru deschiderea contului și verificările legale de identitate." },
];

function Ajutor() {
  return <PortalLayout><h1 className="text-[22px] font-semibold">Ajutor</h1>
    <div className="mt-6 divide-y divide-border">{faq.map(({ q, a }) => (
      <div key={q} className="py-4"><p className="text-sm font-semibold">{q}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{a}</p></div>
    ))}</div>
  </PortalLayout>;
}
