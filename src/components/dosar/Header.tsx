import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  Folder,
  UserRound,
  ChartNoAxesColumn,
  House,
  CircleHelp,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink">
      <span className="flex h-6 w-6 items-center justify-center rounded bg-brand text-xs text-ink">
        D
      </span>
      DosarAI
    </Link>
  );
}

const pill = "flex items-center gap-1.5 rounded-full px-3 py-1.5";
const active = { className: "bg-brand text-ink" };

export function AnalystHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="staff-header flex min-h-12 items-center justify-between gap-4 px-[18px]">
        <Logo />
        <nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-xs text-ink-muted">
          <Link to="/cases" className={pill} activeProps={active}>
            <Folder className="h-3 w-3" />
            Dosare
          </Link>
          <Link to="/playbooks" className={pill} activeProps={active}>
            <BookOpen className="h-3 w-3" />
            Playbook-uri
          </Link>
          <Link to="/audit" className={pill} activeProps={active}>
            <ClipboardCheck className="h-3 w-3" />
            Audit
          </Link>
          <Link to="/statistici" className={pill} activeProps={active}>
            <ChartNoAxesColumn className="h-3 w-3" />
            Statistici
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link to="/portal" className="hidden text-xs text-teal sm:block">
            Portal client
          </Link>
          <span
            title="Analist KYC"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-avatar text-card"
          >
            <UserRound className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </header>
  );
}

export function ClientHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="staff-header flex min-h-12 items-center justify-between gap-4 px-[18px]">
        <Logo />
        <nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-xs text-ink-muted">
          <Link to="/portal" className={pill} activeProps={active} activeOptions={{ exact: true }}>
            <Folder className="h-3 w-3" />
            Dosar nou
          </Link>
          <Link to="/portal/dosare" className={pill} activeProps={active}>
            <FileText className="h-3 w-3" />
            Dosarul meu
          </Link>
          <Link to="/portal/ajutor" className={pill} activeProps={active}>
            <CircleHelp className="h-3 w-3" />
            Ajutor
          </Link>
        </nav>
        <Link to="/" className="text-xs text-teal">
          Ieși
        </Link>
      </div>
    </header>
  );
}

export function PublicHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="staff-header flex min-h-12 items-center justify-between gap-4 px-[18px]">
        <Logo />
        <nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-xs text-ink-muted">
          <Link to="/" className={pill} activeProps={active} activeOptions={{ exact: true }}>
            <House className="h-3 w-3" />
            Acasă
          </Link>
          <Link to="/cum-functioneaza" className={pill} activeProps={active}>
            <ClipboardCheck className="h-3 w-3" />
            Cum funcționează
          </Link>
          <Link to="/securitate" className={pill} activeProps={active}>
            <BookOpen className="h-3 w-3" />
            Securitate
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="bg-card text-xs">
            <Link to="/cases">Zona ofițerului</Link>
          </Button>
          <Button asChild size="sm" className="text-xs">
            <Link to="/portal">Deschide un cont</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
