import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardCheck, Folder, UserRound, ChartNoAxesColumn, House, CircleHelp, FileText, LayoutGrid } from "lucide-react";
import { listCases } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";


const railLink = "flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-sm font-medium text-rail-muted transition-colors hover:bg-white/5 hover:text-rail-foreground";
const railActive = { className: "bg-brand !text-on-brand hover:bg-brand" };

/** Officer area: fixed black side rail on desktop, a wrapping top bar on small screens. */
export function AnalystHeader() {
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: listCases });
  const inReview = cases?.filter((c) => c.status === "În analiză").length;
  return (
    <aside className="staff-rail z-30 flex flex-col gap-6 bg-rail px-4 py-5 text-rail-foreground min-[901px]:fixed min-[901px]:inset-y-0 min-[901px]:left-0 min-[901px]:w-[236px] max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:items-center max-[900px]:gap-3">
      <div className="pl-1.5"><Logo inverted /></div>
      <nav aria-label="Navigare ofițer" className="flex flex-col gap-1 max-[900px]:flex-row max-[900px]:flex-wrap">
        <Link to="/panou" className={railLink} activeProps={railActive}><LayoutGrid className="h-[18px] w-[18px]" />Panou</Link>
        <Link to="/cases" className={railLink} activeProps={railActive}><Folder className="h-[18px] w-[18px]" />Dosare{inReview !== undefined && <span className="ml-auto rounded-full bg-white/10 px-2 font-mono text-[11px] text-rail-foreground">{inReview}</span>}</Link>
        <Link to="/playbooks" className={railLink} activeProps={railActive}><BookOpen className="h-[18px] w-[18px]" />Playbook-uri</Link>
        <Link to="/audit" className={railLink} activeProps={railActive}><ClipboardCheck className="h-[18px] w-[18px]" />Audit</Link>
        <Link to="/statistici" className={railLink} activeProps={railActive}><ChartNoAxesColumn className="h-[18px] w-[18px]" />Statistici</Link>
        <Link to="/portal" className={railLink}><UserRound className="h-[18px] w-[18px]" />Portal client</Link>
      </nav>
      <div className="mt-auto flex flex-col gap-3 max-[900px]:ml-auto max-[900px]:mt-0 max-[900px]:flex-row max-[900px]:items-center">
        <div className="rounded-[18px] bg-white/5 p-4 max-[900px]:hidden">
          <p className="text-sm font-semibold">Procedură nouă?</p>
          <p className="mt-1.5 text-xs leading-relaxed text-rail-muted">Încarcă PDF-ul și primești regulile verificabile în sub două minute.</p>
          <Link to="/playbooks/$id" params={{ id: "pb_cont_pj_v1" }} className="mt-3 inline-block text-[13px] font-semibold text-brand">Încarcă procedură →</Link>
        </div>
        <ThemeToggle withLabel className="px-3.5 py-2 text-sm text-rail-muted hover:text-rail-foreground max-[900px]:px-2" />
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-semibold">ER</span>
          <span className="text-sm leading-tight max-[900px]:hidden">Elena Radu<span className="block text-xs text-rail-muted">Ofițer KYC</span></span>
        </div>
      </div>
    </aside>
  );
}

const pill = "flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-colors hover:text-ink";
const active = { className: "bg-brand !text-on-brand" };
const bar = "staff-header flex min-h-16 items-center justify-between gap-4 px-[max(18px,env(safe-area-inset-left,0px))]";

export function ClientHeader() {
  return <header className="border-b border-border bg-card"><div className={bar}>
    <Logo /><nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-[13px] font-medium text-ink-muted">
      <Link to="/portal" className={pill} activeProps={active} activeOptions={{ exact: true }}><Folder className="h-3.5 w-3.5" />Dosar nou</Link>
      <Link to="/portal/dosare" className={pill} activeProps={active}><FileText className="h-3.5 w-3.5" />Dosarul meu</Link>
      <Link to="/portal/ajutor" className={pill} activeProps={active}><CircleHelp className="h-3.5 w-3.5" />Ajutor</Link>
    </nav><div className="flex items-center gap-3"><ThemeToggle className="h-9 w-9 justify-center bg-beige-dark text-ink" /><Link to="/" className="text-sm font-medium text-ink-muted hover:text-ink">Ieși</Link></div>
  </div></header>;
}

export function PublicHeader() {
  return <header className="border-b border-border bg-card"><div className={bar}>
    <Logo /><nav className="staff-nav flex items-center gap-1 rounded-full bg-beige-dark p-1 text-[13px] font-medium text-ink-muted">
      <Link to="/" className={pill} activeProps={active} activeOptions={{ exact: true }}><House className="h-3.5 w-3.5" />Acasă</Link>
      <Link to="/cum-functioneaza" className={pill} activeProps={active}><ClipboardCheck className="h-3.5 w-3.5" />Cum funcționează</Link>
      <Link to="/securitate" className={pill} activeProps={active}><BookOpen className="h-3.5 w-3.5" />Securitate</Link>
    </nav><div className="flex items-center gap-2">
      <ThemeToggle className="h-9 w-9 justify-center bg-beige-dark text-ink" />
      <Button asChild variant="outline" size="sm" className="rounded-full bg-card text-[13px]"><Link to="/panou">Zona ofițerului</Link></Button>
      <Button asChild size="sm" className="rounded-full text-[13px]"><Link to="/portal">Deschide un cont</Link></Button>
    </div>
  </div></header>;
}
