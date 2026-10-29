import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { consentDone, identityDone } from "@/lib/onboarding";
import type { Case } from "@/types";

const c = { id: "live_pf_9", documents: [] } as unknown as Case;
const identity = { selfie: "/api/orch/cases/live_pf_9/identity/selfie", capturedAt: "2026-10-29T10:01:00+02:00", liveness: { blink: true, turn: true, method: "mediapipe" as const } };
afterEach(() => { vi.resetModules(); vi.doUnmock("@/api/client"); });

async function panel(face: unknown) {
  vi.doMock("@/api/client", () => ({ getIdentityReview: async () => ({ stored: true, identity, face }) }));
  const { IdentityPanel } = await import("@/components/dosar/IdentityPanel");
  render(<QueryClientProvider client={new QueryClient()}><IdentityPanel c={c} /></QueryClientProvider>);
}

describe("Officer identity panel", () => {
  it.each([
    [{ status: "match", score: 0.82, threshold: 0.363 }, /aceeași persoană \(similaritate 0,82/],
    [{ status: "no_match", score: 0.12, threshold: 0.363 }, /nu se potrivește.*Aprobarea este blocată/],
    [{ status: "not_compared", score: null, threshold: 0.363, reason: "no_face_id" }, /nu am găsit o poză pe actul de identitate/],
    [null, /după ce clientul încarcă actul/],
  ])("shows the face comparison %#", async (face, text) => {
    await panel(face);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText(/stocate în dosar/)).toBeInTheDocument();
  });
  it("counts steps the orchestrator stored as done, even from another browser", () => {
    expect(identityDone({ stored: { consent: true, identity: true } })).toBe(true);
    expect(consentDone({ stored: { consent: true, identity: false } })).toBe(true);
    expect(identityDone({})).toBe(false); expect(consentDone({})).toBe(false);
  });
});
