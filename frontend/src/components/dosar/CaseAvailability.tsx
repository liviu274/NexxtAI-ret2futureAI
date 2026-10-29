import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCase, orchestratorAvailable, SERVICE_UNAVAILABLE } from "@/api/client";
import { isFinalCase } from "@/lib/review";
import { invalidateCaseQueries } from "@/lib/case-cache";
import { Button } from "@/components/ui/button";

export function useCaseLocked(caseId: string) {
  const { data: c } = useQuery({ queryKey: ["case", caseId], queryFn: () => getCase(caseId) });
  return !c || isFinalCase(c.status) || !!c.serviceUnavailable;
}
export function CaseAvailability({ reason }: { reason?: string | undefined }) {
  const qc = useQueryClient();
  if (!reason) return null;
  return <div role="status" className="my-4 rounded-2xl border border-border bg-card p-4 text-xs text-ink-muted"><p>{reason}</p>{reason === SERVICE_UNAVAILABLE && <Button variant="outline" className="mt-3 h-8 text-xs" onClick={async () => { await orchestratorAvailable(true); await invalidateCaseQueries(qc); }}>Reîncearcă conexiunea</Button>}</div>;
}
