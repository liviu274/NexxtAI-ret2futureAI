import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { caseQueryKeys, invalidateCaseQueries, subscribeCaseChanges } from "@/lib/case-cache";

describe("Actualizarea cache-ului între taburi", () => {
  it("invalidează toate proiecțiile și jurnalul", async () => {
    const qc = new QueryClient(); const invalidate = vi.spyOn(qc, "invalidateQueries");
    await invalidateCaseQueries(qc);
    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[0])).toEqual(caseQueryKeys);
  });
  it("urmărește storage, BroadcastChannel, focus și modificările externe, apoi curăță ascultătorii", () => {
    vi.useFakeTimers();
    class Channel { static instance: Channel; onmessage?: () => void; close = vi.fn(); constructor() { Channel.instance = this; } }
    vi.stubGlobal("BroadcastChannel", Channel);
    const refresh = vi.fn(); const unsubscribe = subscribeCaseChanges(refresh);
    window.dispatchEvent(new Event("storage")); window.dispatchEvent(new Event("dosarai-demo-change")); window.dispatchEvent(new Event("focus")); Channel.instance.onmessage?.();
    vi.advanceTimersByTime(15_000); expect(refresh).toHaveBeenCalledTimes(5);
    unsubscribe(); expect(Channel.instance.close).toHaveBeenCalled();
    window.dispatchEvent(new Event("storage")); vi.advanceTimersByTime(15_000); expect(refresh).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
