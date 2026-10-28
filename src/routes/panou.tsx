import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, Cog, UserRound } from "lucide-react";
import { getAuditLog, getGroundTruth, getScreeningMatch, listCases, listPlaybooks } from "@/api/client";
import { AnalystHeader } from "@/components/dosar/Header";
import { Loading, TypeBadge } from "@/components/dosar/badges";
import { riskLabels } from "@/lib/dataset";
import { blockingFlags, flagPerson } from "@/lib/review";
import { isScreeningFlag, matchKind } from "@/lib/screening";
import type { Case, Flag, RiskLevel, Severity } from "@/types";

export const Route = createFileRoute("/panou")({
  head: () => ({ meta: [{ title: "Panou · Raif2Future" }, { name: "description", content: "Panoul ofițerului KYC: dosare, riscuri, screening și jurnal." }, { property: "og:title", content: "Panou · Raif2Future" }, { property: "og:description", content: "Situația dosarelor KYC și KYB dintr-o privire." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

const MAIN_AUDIT_CASE = "case_pf_12_modificari_combinate";
const open = (f: Flag) => f.status !== "dismissed" && f.status !== "resolved";
const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const riskRank: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const tone: Record<Severity, string> = { critical: "text-sev-high", high: "text-sev-medium", medium: "text-ink-muted", low: "text-teal" };
const label: Record<Severity, string> = { critical: "Critic", high: "Ridicat", medium: "Mediu", low: "Info" };
const plural: Record<Severity, [string, string]> = { critical: ["critică", "critice"], high: ["ridicată", "ridicate"], medium: ["medie", "medii"], low: ["informativă", "informative"] };

function Widget({ className = "", title, link, children }: { className?: string; title?: string; link?: React.ReactNode; children: React.ReactNode }) {
  return <section className={`min-w-0 rounded-[22px] bg-card p-5 shadow-card ${className}`}>
    {title && <div className="mb-3.5 flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">{title}</h2>{link}</div>}
    {children}
  </section>;
}

function Problems({ c }: { c: Case }) {
  const flags = c.flags.filter(open);
  if (!flags.length) return <span className="text-[13px] text-ink-muted">Nicio problemă</span>;
  return <span className="flex flex-wrap gap-x-1.5 gap-y-1 text-[13px]">{(["critical", "high", "medium", "low"] as Severity[]).map((s) => {
    const n = flags.filter((f) => f.severity === s).length;
    return n ? <span key={s} className={`whitespace-nowrap font-medium ${tone[s]}`}>{n} {plural[s][n === 1 ? 0 : 1]}</span> : null;
  })}</span>;
}

function Dashboard() {
  const { data: cases = [], isLoading } = useQuery({ queryKey: ["cases"], queryFn: listCases });
  const { data: truth } = useQuery({ queryKey: ["ground-truth"], queryFn: getGroundTruth });
  const { data: playbooks = [] } = useQuery({ queryKey: ["playbooks"], queryFn: listPlaybooks });
  const { data: audit = [] } = useQuery({ queryKey: ["audit", MAIN_AUDIT_CASE], queryFn: () => getAuditLog(MAIN_AUDIT_CASE) });

  const screeningFlags = cases.flatMap((c) => c.flags.filter((f) => isScreeningFlag(f) && open(f)).map((f) => ({ c, f })));
  const matches = useQueries({ queries: screeningFlags.map(({ c, f }) => ({ queryKey: ["screening", c.id, f.id], queryFn: () => getScreeningMatch(c.id, f.id) })) });

  if (isLoading) return <div className="min-h-screen bg-beige"><AnalystHeader /><Loading /></div>;

  const inReview = cases.filter((c) => c.status === "În analiză");
  const waiting = cases.filter((c) => c.status === "Documente solicitate");
  const blocked = inReview.filter((c) => blockingFlags(c.flags).length > 0);
  const avg = cases.length ? Math.round(cases.reduce((n, c) => n + c.processingMs, 0) / cases.length / 1000) : 0;
  const scored = truth ? cases.filter((c) => truth[c.id]) : [];
  const planted = scored.reduce((n, c) => n + (truth?.[c.id]?.expected_rule_ids.length ?? 0), 0);
  const caught = scored.reduce((n, c) => n + (truth?.[c.id]?.expected_rule_ids.filter((r) => c.flags.some((f) => f.ruleId === r)).length ?? 0), 0);
  const controls = scored.filter((c) => c.id.endsWith("00_corect_control"));

  const queue = [...inReview, ...waiting].sort((a, b) => riskRank[a.riskDraft.level] - riskRank[b.riskDraft.level] || b.flags.filter(open).length - a.flags.filter(open).length).slice(0, 6);
  const focus = queue.find((c) => c.flags.some(open));
  const focusFlags = focus ? focus.flags.filter(open).sort((a, b) => severityRank[a.severity] - severityRank[b.severity]) : [];
  const evidenceFlag = focusFlags.find((f) => f.evidence.some((e) => "bbox" in e && e.bbox));

  const riskCounts = (["critical", "high", "medium", "low"] as RiskLevel[]).map((level) => ({ level, n: cases.filter((c) => c.riskDraft.level === level).length }));
  const maxRisk = Math.max(1, ...riskCounts.map((r) => r.n));
  const pj = playbooks.find((p) => p.id === "pb_cont_pj_v1") ?? playbooks[0];
  const manual = pj?.clauses?.filter((c) => c.status === "Manuală").length ?? 0;
  const coverage = pj?.coverage ?? 0;
  const feed = [...audit].reverse().slice(0, 5);

  const kpis = [
    { label: "În analiză", value: inReview.length, unit: "dosare", foot: `${blocked.length} ${blocked.length === 1 ? "dosar" : "dosare"} cu aprobarea blocată` },
    { label: "Așteaptă clientul", value: waiting.length, unit: "dosare", foot: "documente solicitate prin portal" },
    { label: "Timp mediu AI", value: avg, unit: "s", foot: "față de ~45 min manual (estimare)" },
  ];

  return <div className="min-h-screen bg-beige"><AnalystHeader /><main className="px-7 pb-10 pt-6 max-sm:px-4">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-[28px] font-semibold tracking-tight">Bună, Elena</h1><p className="mt-1 text-[13px] text-ink-muted">{blocked.length ? `${blocked.length} ${blocked.length === 1 ? "dosar cere" : "dosare cer"} atenție` : "Niciun dosar blocat"} · Decizia finală aparține ofițerului.</p></div>
      <Link to="/cases" className="inline-flex items-center gap-2 rounded-full bg-rail px-5 py-2.5 text-sm font-semibold text-rail-foreground">Toate dosarele<ArrowRight className="h-4 w-4" /></Link>
    </div>

    <div className="grid grid-cols-12 gap-4">
      {kpis.map((k) => <Widget key={k.label} className="col-span-3 flex min-h-[132px] flex-col justify-between max-xl:col-span-6 max-sm:col-span-12">
        <span className="text-[13px] text-ink-muted">{k.label}</span>
        <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{k.value}<small className="ml-1 text-[15px] font-medium tracking-normal text-ink-muted">{k.unit}</small></span>
        <span className="text-[12.5px] text-ink-muted">{k.foot}</span>
      </Widget>)}
      <section className="col-span-3 flex min-h-[132px] flex-col justify-between rounded-[22px] bg-brand p-5 shadow-card max-xl:col-span-6 max-sm:col-span-12">
        <span className="text-[13px] opacity-70">Erori detectate în setul de test</span>
        <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{caught}<small className="ml-1 text-[15px] font-medium tracking-normal opacity-70">din {planted}</small></span>
        <span className="text-[12.5px] opacity-70">{controls.filter((c) => c.flags.length === 0).length} din {controls.length} dosare corecte fără alarme false</span>
      </section>

      <Widget className="col-span-8 max-xl:col-span-12" title="Coada de dosare" link={<Link to="/cases" className="text-[12.5px] text-ink-muted hover:text-ink">Toate dosarele →</Link>}>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead><tr className="text-xs text-ink-muted">{["Client", "Tip", "Probleme", "Propunere de risc", ""].map((h) => <th key={h} className="px-2 pb-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>{queue.map((c) => <tr key={c.id} className="group border-t border-border">
              <td className="px-2 py-3"><Link to="/cases/$id" params={{ id: c.id }} className="font-semibold group-hover:underline">{c.clientName}</Link><span className="block font-mono text-[11px] text-ink-muted">{c.id}</span></td>
              <td className="px-2 py-3"><TypeBadge type={c.customerType} /></td>
              <td className="px-2 py-3"><Problems c={c} /></td>
              <td className={`px-2 py-3 text-[13px] font-semibold ${c.riskDraft.level === "critical" ? "text-sev-high" : ""}`}>{riskLabels[c.riskDraft.level]}{c.status === "Documente solicitate" && <span className="block text-xs font-normal text-ink-muted">așteaptă clientul</span>}</td>
              <td className="px-2 py-3 text-right"><Link to="/cases/$id" params={{ id: c.id }} aria-label={`Deschide dosarul ${c.clientName}`} className="text-ink-muted hover:text-ink">→</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      </Widget>

      <Widget className="col-span-4 flex flex-col gap-3.5 max-xl:col-span-12">
        {focus ? <>
          <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">Dosar în atenție</h2><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${focus.riskDraft.level === "critical" ? "bg-sev-high text-white" : "bg-beige-dark"}`}>{riskLabels[focus.riskDraft.level]}</span></div>
          <div className="flex items-baseline justify-between gap-3"><b className="text-xl tracking-tight">{focus.clientName}</b><span className="font-mono text-[11px] text-ink-muted">{focus.id}</span></div>
          {evidenceFlag && <div className="rounded-2xl bg-muted p-4 font-mono text-[11.5px] text-ink-muted">
            <span className="mb-2 block font-sans text-[13px] font-semibold text-ink">{focus.documents.find((d) => d.id === evidenceFlag.evidence[0]?.documentId)?.type ?? "Document"} · dovadă</span>
            <span className="-mx-1.5 block rounded px-1.5 py-1 text-ink" style={{ background: "linear-gradient(transparent 10%, color-mix(in srgb, var(--brand) 85%, transparent) 10% 90%, transparent 90%)", color: "#111" }}>{evidenceFlag.explanation}</span>
          </div>}
          <ul className="grid gap-2">{focusFlags.slice(0, 4).map((f) => { const p = flagPerson(focus, f); return <li key={f.id} className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-baseline gap-2 text-[13px]"><span className={`text-xs font-semibold ${tone[f.severity]}`}>{label[f.severity]}</span><span className="min-w-0">{f.title}{p && <span className="text-ink-muted"> · {p.name}</span>}</span><span className="shrink-0 font-mono text-[11px] text-ink-muted">{f.ruleId}</span></li>; })}</ul>
          <Link to="/cases/$id" params={{ id: focus.id }} className="mt-auto inline-flex items-center justify-center rounded-[14px] bg-brand px-4 py-3 text-sm font-semibold">Deschide dosarul</Link>
        </> : <p className="text-sm text-ink-muted">Niciun dosar cu probleme deschise.</p>}
      </Widget>

      <Widget className="col-span-4 max-xl:col-span-6 max-md:col-span-12" title="Propuneri de risc" link={<Link to="/statistici" className="text-[12.5px] text-ink-muted hover:text-ink">Statistici →</Link>}>
        <div className="grid gap-3">{riskCounts.map(({ level, n }) => <div key={level} className="grid grid-cols-[70px_minmax(0,1fr)_28px] items-center gap-2.5 text-[13px]">
          <span>{riskLabels[level]}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${level === "critical" ? "bg-sev-high" : "bg-ink"}`} style={{ width: `${(n / maxRisk) * 100}%` }} /></span>
          <b className="text-right tabular-nums">{n}</b>
        </div>)}</div>
        <p className="mt-4 text-xs text-ink-muted">Doar propuneri. Decizia finală aparține ofițerului.</p>
      </Widget>

      <Widget className="col-span-4 max-xl:col-span-6 max-md:col-span-12" title="Screening">
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-muted p-3"><b className="block text-[22px] tracking-tight">25</b><span className="text-xs text-ink-muted">listă sancțiuni</span></div>
          <div className="rounded-[14px] bg-muted p-3"><b className="block text-[22px] tracking-tight">25</b><span className="text-xs text-ink-muted">listă PEP</span></div>
        </div>
        {screeningFlags.length ? screeningFlags.map(({ c, f }, i) => {
          const m = matches[i]?.data; const kind = m ? matchKind(m) : null; const p = flagPerson(c, f);
          return <Link key={f.id} to="/cases/$id" params={{ id: c.id }} className="flex items-center gap-2.5 border-t border-border py-2.5 text-[13px]">
            <span className="min-w-0">{p?.name ?? f.title}{m && "id_sursa" in m.entry && <span className="block font-mono text-[11px] text-ink-muted">{m.entry.id_sursa} · {m.entry.anul_nasterii}{m.client.birthYear !== undefined && m.client.birthYear !== m.entry.anul_nasterii ? ` ≠ ${m.client.birthYear}` : ""}</span>}</span>
            {kind && <span className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${kind === "confirmed" ? "bg-sev-high text-white" : "border border-sev-medium text-sev-medium"}`}>{kind === "confirmed" ? "Confirmată" : "Posibilă"}</span>}
          </Link>;
        }) : <p className="border-t border-border pt-3 text-[13px] text-ink-muted">Nicio potrivire deschisă.</p>}
      </Widget>

      <Widget className="col-span-4 max-xl:col-span-12" title="Playbook activ" link={pj && <Link to="/playbooks/$id" params={{ id: pj.id }} className="text-[12.5px] text-ink-muted hover:text-ink">Revizuire →</Link>}>
        {pj && <>
          <div className="mb-4 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4">
            <svg viewBox="0 0 100 100" className="h-24 w-24" role="img" aria-label={`Acoperire ${coverage}%`}>
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-muted" />
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-brand" strokeDasharray="263.9" strokeDashoffset={263.9 * (1 - coverage / 100)} transform="rotate(-90 50 50)" />
              <text x="50" y="57" textAnchor="middle" className="fill-ink text-[20px] font-semibold">{coverage}%</text>
            </svg>
            <div className="min-w-0"><b className="mb-1 block text-[15px]">{pj.processName}</b><p className="text-[13px] text-ink-muted">{pj.sourceName ?? pj.id} · {pj.rules.length} reguli{pj.clauses ? ` · ${pj.clauses.length} clauze, ${manual} ${manual === 1 ? "verificare manuală" : "verificări manuale"}` : ""}</p></div>
          </div>
          <Link to="/playbooks/$id" params={{ id: pj.id }} className="inline-flex w-full items-center justify-center rounded-[14px] bg-brand px-4 py-3 text-sm font-semibold">Încarcă procedură nouă</Link>
        </>}
      </Widget>

      <Widget className="col-span-8 max-xl:col-span-12" title="Jurnal de audit" link={<Link to="/cases/$id/audit" params={{ id: MAIN_AUDIT_CASE }} className="text-[12.5px] text-ink-muted hover:text-ink">Jurnalul complet →</Link>}>
        <ul>{feed.map((e) => <li key={e.id} className="grid grid-cols-[minmax(0,150px)_22px_minmax(0,1fr)] items-center gap-2.5 border-t border-border py-2.5 text-[13px] max-sm:grid-cols-[22px_minmax(0,1fr)]">
          <time className="font-mono text-[11.5px] text-ink-muted max-sm:hidden">{e.timestamp}</time>
          <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-md ${e.actor === "human" ? "bg-brand" : "bg-muted text-ink-muted"}`}>{e.actor === "human" ? <UserRound className="h-3 w-3" /> : <Cog className="h-3 w-3" />}</span>
          <span className="min-w-0"><b className="font-semibold">{e.stage}</b> · {e.action}</span>
        </li>)}</ul>
      </Widget>

      {/* Rail colors stay black in both themes, so the yellow figure keeps its contrast. */}
      <section className="col-span-4 flex items-center gap-5 self-start rounded-[22px] bg-rail p-5 text-rail-foreground shadow-card max-xl:col-span-12">
        <span className="text-[56px] font-bold leading-none tracking-tighter text-brand">0</span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Decizii luate fără un ofițer</h2>
          <p className="mt-1 text-[13px] opacity-75">Agentul propune, omul decide.</p>
        </div>
      </section>
    </div>
  </main></div>;
}
