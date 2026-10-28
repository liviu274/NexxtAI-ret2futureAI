import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, FileX } from "lucide-react";
import type { DocumentStatus, Severity } from "@/types";
import { cn } from "@/lib/utils";

const sev = {
  critical: { label: "Critic", cls: "bg-sev-high/10 text-sev-high border-sev-high/30", Icon: AlertOctagon },
  high: { label: "Ridicat", cls: "bg-sev-high/10 text-sev-high border-sev-high/30", Icon: AlertTriangle },
  medium: { label: "Mediu", cls: "bg-sev-medium/10 text-sev-medium border-sev-medium/30", Icon: AlertTriangle },
  low: { label: "Info", cls: "bg-teal/10 text-teal border-teal/30", Icon: Info },
} as const;

export function SeverityBadge({ severity, count, className }: { severity: Severity; count?: number; className?: string }) {
  const s = sev[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", s.cls, className)}>
      <s.Icon className="h-3.5 w-3.5" aria-hidden />
      {count !== undefined ? `${count} ${s.label.toLowerCase()}` : s.label}
    </span>
  );
}

const docs: Record<DocumentStatus, { label: string; cls: string; Icon: typeof Info; spin?: boolean }> = {
  valid: { label: "Valid", cls: "bg-sev-ok/10 text-sev-ok border-sev-ok/30", Icon: CheckCircle2 },
  "cu-probleme": { label: "Cu probleme", cls: "bg-sev-high/10 text-sev-high border-sev-high/30", Icon: AlertOctagon },
  "se-verifica": { label: "Se verifică…", cls: "bg-teal/10 text-teal border-teal/30", Icon: Loader2, spin: true },
  lipsa: { label: "Lipsă", cls: "bg-beige-dark text-ink-muted border-line", Icon: FileX },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const d = docs[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", d.cls)}>
      <d.Icon className={cn("h-3.5 w-3.5", d.spin && "animate-spin")} aria-hidden />
      {d.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: "PF" | "PJ" }) {
  return (
    <span className="inline-flex rounded border border-line bg-beige-dark px-1.5 py-0.5 text-xs font-semibold text-ink">{type}</span>
  );
}

export function Loading({ label = "Se verifică…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin text-teal" /> {label}
    </div>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card shadow-card", className)} {...p} />;
}
