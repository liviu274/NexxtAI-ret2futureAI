import type { QueryClient } from "@tanstack/react-query";
export const caseQueryKeys = ["case", "cases", "client-status", "portal-case", "my-portal-cases", "audit", "screening"];
export function invalidateCaseQueries(client: QueryClient) {
  return Promise.all(caseQueryKeys.map((key) => client.invalidateQueries({ queryKey: [key] })));
}
export function subscribeCaseChanges(refresh: () => void) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("dosarai-cases") : undefined;
  if (channel) channel.onmessage = refresh;
  window.addEventListener("storage", refresh);
  window.addEventListener("dosarai-demo-change", refresh);
  window.addEventListener("focus", refresh);
  // Also observe changes made outside this browser and recover a failed initial probe.
  const timer = window.setInterval(refresh, 15_000);
  return () => {
    channel?.close(); window.clearInterval(timer);
    window.removeEventListener("storage", refresh);
    window.removeEventListener("dosarai-demo-change", refresh);
    window.removeEventListener("focus", refresh);
  };
}
