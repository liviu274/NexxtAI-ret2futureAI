import { Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";

function Logo() {
  return (
    <Link to="/cases" className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
      <span className="rounded bg-brand px-1.5 py-0.5">Dosar</span>AI
    </Link>
  );
}

export function AnalystHeader() {
  const nav = "rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink";
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-[1392px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="flex gap-1">
            <Link to="/cases" className={nav} activeProps={{ className: "bg-brand text-ink" }}>Dosare</Link>
            <Link to="/playbooks/$id" params={{ id: "popriri" }} className={nav} activeProps={{ className: "bg-brand text-ink" }}>Playbook-uri</Link>
            <Link to="/upload" className={nav}>Portal client</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-ink">Maria Ionescu</div>
            <div className="text-xs text-ink-muted">Analist KYC</div>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-beige-dark text-sm font-semibold text-ink">MI</span>
        </div>
      </div>
    </header>
  );
}

export function ClientHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
        <Logo />
        <a href="#ajutor" className="flex items-center gap-1 text-sm font-medium text-teal"><HelpCircle className="h-4 w-4" /> Ajutor</a>
      </div>
    </header>
  );
}
