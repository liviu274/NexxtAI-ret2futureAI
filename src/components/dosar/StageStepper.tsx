import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const STAGES = [
  "Clasificare",
  "Extragere",
  "Validare",
  "Verificare încrucișată",
  "Detecție alterare",
  "Screening",
  "Propunere de risc",
];

export function StageStepper({
  current = STAGES.length,
  stages = STAGES,
}: {
  current?: number;
  stages?: string[];
}) {
  return (
    <ol className="flex items-center gap-2">
      {stages.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-sev-ok bg-sev-ok text-card",
                active && "border-ink bg-brand text-ink",
                !done && !active && "border-line text-line",
              )}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                i + 1
              )}
            </span>
            <span className={cn("text-xs", done || active ? "text-ink" : "text-ink-muted")}>
              {s}
            </span>
            {i < stages.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
