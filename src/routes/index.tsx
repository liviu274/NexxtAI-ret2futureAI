import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound, ClipboardCheck, ArrowRight, CloudUpload, ScanSearch, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/dosar/Header";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "DosarAI · Onboarding KYC asistat de AI" },
      { name: "description", content: "DosarAI verifică documentele clienților față de playbook-ul băncii și semnalează problemele cu dovezi." },
      { property: "og:title", content: "DosarAI · Onboarding KYC asistat de AI" },
      { property: "og:description", content: "Verificare KYC/KYB asistată de AI, cu decizia finală la analist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const steps = [
  { Icon: CloudUpload, title: "Încarci documentele", text: "Clientul încarcă actele online, pas cu pas." },
  { Icon: ScanSearch, title: "Agentul verifică instant", text: "Documente expirate, date care nu se potrivesc, documente modificate, liste de sancțiuni." },
  { Icon: UserCheck, title: "Ofițerul decide", text: "Vede dovada exactă pe document și ia decizia finală." },
];

const numbers = [
  { value: "~70s", label: "verificare automată" },
  { value: "26", label: "de scenarii testate" },
  { value: "0", label: "decizii luate fără un om" },
];

function Landing() {
  return <div className="flex min-h-screen flex-col bg-beige"><PublicHeader />
    <main className="mx-auto w-full max-w-[1000px] flex-1 px-6 py-16">
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight max-sm:text-3xl">Deschiderea contului, verificată în minute, nu în zile</h1>
      <div className="mt-12 grid grid-cols-2 gap-6 max-md:grid-cols-1">
        {[{ to: "/portal" as const, title: "Sunt client – Deschide un cont", Icon: UserRound }, { to: "/cases" as const, title: "Sunt ofițer KYC – Analizează dosare", Icon: ClipboardCheck }].map(({ to, title, Icon }) => (
          <div key={to} className="rounded-md border border-border bg-card p-8"><Icon className="mb-8 h-10 w-10 text-teal" /><Button asChild variant="link" className="h-auto w-full justify-between whitespace-normal p-0 text-left text-lg text-ink"><Link to={to}>{title}<ArrowRight className="h-5 w-5 shrink-0" /></Link></Button></div>
        ))}
      </div>
      <div className="mt-16 grid grid-cols-3 gap-6 max-md:grid-cols-1">
        {steps.map(({ Icon, title, text }, i) => (
          <div key={title} className="rounded-md border border-border bg-card p-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-beige-dark"><Icon className="h-4 w-4 text-teal" /></span>
            <p className="mt-4 text-sm font-semibold">{i + 1}. {title}</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 grid grid-cols-3 gap-6 rounded-md border border-border bg-card p-8 text-center max-sm:grid-cols-1">
        {numbers.map(({ value, label }) => (
          <div key={label}><p className="text-3xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{label}</p></div>
        ))}
      </div>
    </main>
    <footer className="border-t border-border py-4 text-center text-xs text-ink-muted">DosarAI · Demo hackathon · Date fictive</footer>
  </div>;
}
