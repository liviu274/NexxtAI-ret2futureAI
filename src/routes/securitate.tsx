import { createFileRoute } from "@tanstack/react-router";
import { UserCheck, ScrollText, ShieldAlert, EyeOff } from "lucide-react";
import { PublicHeader } from "@/components/dosar/Header";

export const Route = createFileRoute("/securitate")({
  component: Securitate,
  head: () => ({
    meta: [
      { title: "Securitate · Raif2Future" },
      { name: "description", content: "Decizia finală e întotdeauna umană, fiecare pas e înregistrat în audit, documentele sunt tratate ca date nesigure." },
      { property: "og:title", content: "Securitate · Raif2Future" },
      { property: "og:description", content: "Principiile de siguranță ale verificării asistate de AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const points = [
  { Icon: UserCheck, title: "Decizia finală e întotdeauna umană", text: "Agentul AI doar propune un nivel de risc și semnalează probleme. Niciodată nu aprobă sau respinge un dosar — decizia aparține exclusiv ofițerului." },
  { Icon: ScrollText, title: "Fiecare pas e înregistrat", text: "Jurnalul de audit păstrează fiecare acțiune: cine a încărcat, ce a verificat agentul, ce a decis ofițerul și de ce. Lanțul de înregistrări nu poate fi modificat fără să se vadă." },
  { Icon: ShieldAlert, title: "Documentele sunt date nesigure", text: "Orice document încărcat e tratat ca potențial modificat. Agentul caută semne de editare și inconsecvențe înainte ca datele să fie luate în calcul." },
  { Icon: EyeOff, title: "Clientul nu vede suspiciunile", text: "Clientul nu vede niciodată suspiciuni de fraudă sau rezultate de screening. El primește doar cereri clare de documente, fără detalii interne ale analizei." },
];

function Securitate() {
  return <div className="min-h-screen bg-beige"><PublicHeader /><main className="mx-auto w-full max-w-[760px] px-6 pb-12 pt-10">
    <h1 className="text-[22px] font-semibold">Securitate</h1>
    <div className="mt-6 divide-y divide-border">{points.map(({ Icon, title, text }) => (
      <div key={title} className="flex items-start gap-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-beige-dark"><Icon className="h-4 w-4 text-teal" /></span>
        <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{text}</p></div>
      </div>
    ))}</div>
  </main></div>;
}
