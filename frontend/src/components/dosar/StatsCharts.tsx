import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { riskLabels } from "@/lib/dataset";
import type { RiskLevel } from "@/types";

// Colors come from the theme tokens, so both charts switch with light/dark mode.
const INK = "var(--ink)";
const TRACK = "var(--muted)";
const MUTED_TEXT = "var(--ink-muted)";

function TipBox({ title, lines }: { title: string; lines: string[] }) {
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-card">
    <p className="font-semibold">{title}</p>
    {lines.map((l) => <p key={l} className="mt-0.5 text-ink-muted">{l}</p>)}
  </div>;
}

export interface FamilyRow { family: string; caught: number; planted: number; rules: string[] }

/** Share of planted errors the agent caught, one bar per error family (single series, so no legend). */
export function DetectionChart({ rows }: { rows: FamilyRow[] }) {
  const data = rows.map((r) => ({ ...r, pct: r.planted ? Math.round((r.caught / r.planted) * 100) : 0 }));
  return <div className="h-[190px] w-full" role="img" aria-label={`Erori detectate pe familii: ${data.map((d) => `${d.family} ${d.caught} din ${d.planted}`).join(", ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="family" width={240} tickLine={false} axisLine={false}
          tick={({ y, payload }: { y: number; payload: { value: string } }) => <text x={0} y={y} dominantBaseline="central" textAnchor="start" fontSize={13} fill={INK}>{payload.value}</text>} />
        <Tooltip cursor={{ fill: "transparent" }} content={({ active, payload }) => {
          const d = active ? payload?.[0]?.payload as (typeof data)[number] | undefined : undefined;
          return d ? <TipBox title={d.family} lines={[`${d.caught} din ${d.planted} erori plantate detectate (${d.pct}%)`, ...d.rules]} /> : null;
        }} />
        <Bar dataKey="pct" fill={INK} barSize={8} radius={[4, 4, 4, 4]} background={{ fill: TRACK, radius: 4 }} isAnimationActive={false}>
          <LabelList dataKey="pct" position="right" content={({ x, y, width, height, index }) => {
            const d = data[index ?? 0];
            if (!d) return null;
            return <text x={Number(x) + Number(width) + 10} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={13} fontWeight={600} fill={INK}>{d.caught}/{d.planted}</text>;
          }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

// Risk levels are an ordered scale: status red only for "critic", then ink fading toward "scăzut".
const riskColor: Record<RiskLevel, string> = { critical: "var(--sev-high)", high: "var(--ink)", medium: "var(--ink-muted)", low: "var(--line)" };

/** Part-to-whole of proposed risk levels, with the total in the middle and a labeled legend beside it. */
export function RiskDonut({ counts }: { counts: { level: RiskLevel; n: number }[] }) {
  const total = counts.reduce((s, c) => s + c.n, 0);
  const data = counts.filter((c) => c.n > 0);
  return <div className="flex min-w-0 flex-col items-center gap-4">
    <div className="relative h-[150px] w-[150px] shrink-0" role="img" aria-label={`Propuneri de risc: ${counts.map((c) => `${riskLabels[c.level]} ${c.n}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={({ active, payload }) => {
            const d = active ? payload?.[0]?.payload as { level: RiskLevel; n: number } | undefined : undefined;
            return d ? <TipBox title={riskLabels[d.level]} lines={[`${d.n} ${d.n === 1 ? "dosar" : "dosare"} (${Math.round((d.n / total) * 100)}%)`]} /> : null;
          }} />
          <Pie data={data} dataKey="n" nameKey="level" innerRadius={50} outerRadius={72} paddingAngle={2} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.level} fill={riskColor[d.level]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-none tabular-nums">{total}</span>
        <span className="mt-1 text-[11px]" style={{ color: MUTED_TEXT }}>dosare</span>
      </div>
    </div>
    <ul className="grid w-full gap-2 text-[13px]">
      {counts.map((c) => <li key={c.level} className="flex items-center gap-2.5">
        <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: riskColor[c.level] }} aria-hidden />
        <span className="flex-1">{riskLabels[c.level]}</span>
        <b className="tabular-nums">{c.n}</b>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted">{total ? Math.round((c.n / total) * 100) : 0}%</span>
      </li>)}
    </ul>
  </div>;
}
