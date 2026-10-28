import type { Flag } from "@/types";
import { SeverityBadge } from "./badges";
import { cn } from "@/lib/utils";

export function FlagCard({
  flag,
  active,
  onSelect,
}: {
  flag: Flag;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left transition-all hover:shadow-card",
        active ? "border-ink ring-2 ring-brand" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <SeverityBadge severity={flag.severity} />
        <span className="text-xs text-ink-muted">Regula {flag.ruleId}</span>
      </div>
      <div className="mt-2 font-medium text-ink">{flag.title}</div>
      <div className="mt-1 text-xs text-ink-muted line-clamp-2">{flag.ruleText}</div>
      <div className="mt-3 text-sm font-medium text-teal">Vezi dovada →</div>
    </button>
  );
}
