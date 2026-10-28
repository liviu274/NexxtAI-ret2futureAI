import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound, ClipboardCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
function Landing(){return <div className="min-h-screen bg-beige"><header className="border-b border-border bg-card px-6 py-4"><Link to="/" className="flex items-center gap-2 text-lg font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-ink">D</span>DosarAI</Link></header><main className="mx-auto max-w-[1000px] px-6 py-16"><h1 className="max-w-3xl text-4xl font-semibold leading-tight max-sm:text-3xl">Deschiderea contului, verificată în minute, nu în zile</h1><div className="mt-12 grid grid-cols-2 gap-6 max-md:grid-cols-1">{[{to:"/portal" as const,title:"Sunt client – Deschide un cont",Icon:UserRound},{to:"/cases" as const,title:"Sunt ofițer KYC – Analizează dosare",Icon:ClipboardCheck}].map(({to,title,Icon})=><div key={to} className="rounded-md border border-border bg-card p-8"><Icon className="mb-8 h-10 w-10 text-teal"/><Button asChild variant="link" className="h-auto w-full justify-between whitespace-normal p-0 text-left text-lg text-ink"><Link to={to}>{title}<ArrowRight className="h-5 w-5 shrink-0"/></Link></Button></div>)}</div><p className="mt-10 text-xs text-ink-muted">Demo hackathon · date fictive</p></main></div>;}
