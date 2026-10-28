import { createFileRoute } from "@tanstack/react-router";
import { CloudUpload, ScanSearch, UserCheck } from "lucide-react";
import { PublicHeader } from "@/components/dosar/Header";

export const Route = createFileRoute("/cum-functioneaza")({
  component: CumFunctioneaza,
  head: () => ({
    meta: [
      { title: "Cum funcționează · DosarAI" },
      {
        name: "description",
        content:
          "Clientul încarcă actele, agentul AI le verifică instant față de procedura băncii, ofițerul ia decizia finală.",
      },
      { property: "og:title", content: "Cum funcționează · DosarAI" },
      {
        property: "og:description",
        content: "Verificare automată a documentelor în trei pași, cu decizia finală la ofițer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const steps = [
  {
    Icon: CloudUpload,
    title: "Încarci documentele",
    text: "Clientul încarcă actele online, pas cu pas: act de identitate, dovadă de adresă, documente ale firmei. Primește imediat mesaj dacă un document nu e bun și poate încărca altul pe loc.",
  },
  {
    Icon: ScanSearch,
    title: "Agentul verifică instant",
    text: "Agentul AI citește fiecare document și îl compară cu regulile băncii: documente expirate, date care nu se potrivesc între acte, documente modificate, liste de sancțiuni și persoane expuse politic.",
  },
  {
    Icon: UserCheck,
    title: "Ofițerul decide",
    text: "Ofițerul vede fiecare problemă cu dovada exactă pe document — chenarul roșu arată precis câmpul verificat. El ia decizia finală: aprobă, respinge sau cere alte documente.",
  },
];

function CumFunctioneaza() {
  return (
    <div className="min-h-screen bg-beige">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[760px] px-6 pb-12 pt-10">
        <h1 className="text-[22px] font-semibold">Cum funcționează</h1>
        <div className="mt-6 divide-y divide-border">
          {steps.map(({ Icon, title, text }, i) => (
            <div key={title} className="flex items-start gap-4 py-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-beige-dark">
                <Icon className="h-4 w-4 text-teal" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {i + 1}. {title}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-md border border-border bg-card p-[18px]">
          <p className="text-sm font-semibold">Playbook-ul băncii</p>
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            Procedura băncii devine reguli verificabile în sub 2 minute: agentul citește procedura
            originală și o transformă într-un set de reguli clare, fiecare cu trimitere la clauza
            din documentul sursă. Ofițerul poate verifica oricând de unde vine fiecare regulă.
          </p>
        </div>
      </main>
    </div>
  );
}
