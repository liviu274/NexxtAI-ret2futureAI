import { Check } from "lucide-react";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/onboarding";

/**
 * Progress across the whole onboarding: account, details, consent, documents, identity, submission.
 * `incomplete`: earlier steps the client skipped; they show as open, not ticked.
 */
export function OnboardingSteps({ current, incomplete = [] }: { current: OnboardingStepKey; incomplete?: OnboardingStepKey[] }) {
  const at = ONBOARDING_STEPS.findIndex((s) => s.key === current);
  return <ol aria-label="Pașii deschiderii contului" className="mb-8 flex items-start">
    {ONBOARDING_STEPS.map((s, i) => {
      const missing = i < at && incomplete.includes(s.key); const done = i < at && !missing; const active = i === at;
      return <li key={s.key} aria-current={active ? "step" : undefined} className="relative flex flex-1 flex-col items-center text-center">
        {i > 0 && <span aria-hidden className={`absolute right-1/2 top-3 h-0.5 w-[calc(100%-24px)] -translate-x-3 ${i <= at ? "bg-ink" : "bg-border"}`} />}
        <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${missing ? "border-sev-medium bg-card text-sev-medium" : done ? "border-ink bg-ink text-card" : active ? "border-ink bg-brand text-ink" : "border-border bg-card text-ink-muted"}`}>{missing ? "!" : done ? <Check className="h-3 w-3" /> : i + 1}</span>
        <span className={`mt-1.5 text-[10px] leading-3 max-[420px]:sr-only ${active ? "font-semibold text-ink" : missing ? "text-sev-medium" : "text-ink-muted"}`}>{s.label}</span>
      </li>;
    })}
  </ol>;
}
