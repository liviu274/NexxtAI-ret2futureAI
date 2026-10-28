import { Link } from "@tanstack/react-router";
import { BookOpen, ClipboardCheck, Folder, UserRound, ChartNoAxesColumn } from "lucide-react";

function Logo() { return <Link to="/cases" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink"><span className="flex h-6 w-6 items-center justify-center rounded bg-brand text-xs text-ink">D</span>DosarAI</Link>; }
export function AnalystHeader() {
  return <header className="border-b border-border bg-card"><div className="staff-header flex min-h-12 items-center justify-between gap-4 px-[18px]">
    <Logo /><nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-xs text-ink-muted">
      <Link to="/cases" className="flex items-center gap-1.5 rounded-full px-3 py-1.5" activeProps={{ className: "bg-brand text-ink" }}><Folder className="h-3 w-3" />Dosare</Link>
      <Link to="/playbooks" className="flex items-center gap-1.5 rounded-full px-3 py-1.5" activeProps={{ className: "bg-brand text-ink" }}><BookOpen className="h-3 w-3" />Playbook-uri</Link>
      <Link to="/audit" className="flex items-center gap-1.5 rounded-full px-3 py-1.5" activeProps={{ className: "bg-brand text-ink" }}><ClipboardCheck className="h-3 w-3" />Audit</Link>
      <Link to="/statistici" className="flex items-center gap-1.5 rounded-full px-3 py-1.5" activeProps={{ className: "bg-brand text-ink" }}><ChartNoAxesColumn className="h-3 w-3" />Statistici</Link>
    </nav><div className="flex items-center gap-4"><Link to="/portal/$caseId" params={{ caseId: "case_pf_05_adresa_factura_diferita" }} className="hidden text-xs text-teal sm:block">Portal client ↗</Link><span title="Analist KYC" className="flex h-6 w-6 items-center justify-center rounded-full bg-avatar text-card"><UserRound className="h-3.5 w-3.5" /></span></div>
  </div></header>;
}
export function ClientHeader() { return <header className="border-b border-border bg-card"><div className="flex h-12 items-center justify-between px-[18px]"><Logo /><a href="#ajutor" className="text-xs text-teal">Ajutor</a></div></header>; }
