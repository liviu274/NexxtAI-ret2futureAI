import { beforeEach, describe, expect, it } from "vitest";
import { getOnboarding, getSession, requestSignInCode, resetDemo, saveConsent, saveIdentityCheck, signOut, verifySignInCode } from "@/api/client";
import { hasRequiredConsent, identityDone, isValidEmail, isValidPhone } from "@/lib/onboarding";

const selfie = "data:image/jpeg;base64,/9j/AAAA";
beforeEach(() => localStorage.clear());

describe("Onboarding: account, consent and identity", () => {
  it("validates e-mail and Romanian mobile numbers", () => {
    expect(isValidEmail("ana@exemplu.ro")).toBe(true);
    expect(isValidEmail("ana@exemplu")).toBe(false);
    expect(["0722123456", "0722 123 456", "+40722123456"].every(isValidPhone)).toBe(true);
    expect(["0212345678", "072212345", "123"].some(isValidPhone)).toBe(false);
  });

  it("masks the phone, accepts any 6-digit demo code and signs out", async () => {
    await expect(requestSignInCode("ana@exemplu.ro", "021 123 4567")).rejects.toThrow("mobil");
    expect((await requestSignInCode("ana@exemplu.ro", "0722 123 456")).sentTo).toBe("•••••••456");
    await expect(verifySignInCode("ana@exemplu.ro", "0722123456", "12345")).rejects.toThrow("6 cifre");
    await verifySignInCode(" Ana@Exemplu.ro ", "0722 123 456", "123456");
    expect(getSession()).toMatchObject({ email: "ana@exemplu.ro", phone: "0722123456" });
    signOut(); expect(getSession()).toBeNull();
  });

  it("refuses consent without the required items and keeps it per case", async () => {
    await expect(saveConsent("demo_a", ["kyc", "marketing"])).rejects.toThrow("obligatorii");
    await saveConsent("demo_a", ["kyc", "biometric", "screening"]);
    expect(hasRequiredConsent((await getOnboarding("demo_a")).consent)).toBe(true);
    expect(await getOnboarding("demo_b")).toEqual({});
  });

  it("stores the selfie with liveness, never a face-match verdict, and resets with the demo", async () => {
    await expect(saveIdentityCheck("demo_a", { selfie: "javascript:alert(1)", liveness: { blink: true, turn: true, method: "mediapipe" } })).rejects.toThrow();
    await saveIdentityCheck("demo_a", { selfie, liveness: { blink: true, turn: true, method: "mediapipe" } });
    const o = await getOnboarding("demo_a");
    expect(identityDone(o)).toBe(true);
    expect(o.identity?.faceMatch).toBe("pending");
    await resetDemo();
    expect(await getOnboarding("demo_a")).toEqual({});
  });
});
