/** Client onboarding state that has no backend endpoint yet: demo session, consent and the identity check. */

export interface ClientSession { email: string; phone: string; createdAt: string }

export const CONSENT_ITEMS = [
  { id: "kyc", label: "Sunt de acord ca banca să-mi verifice documentele și datele pentru deschiderea contului (obligație legală KYC).", required: true },
  { id: "biometric", label: "Sunt de acord cu o fotografie de verificare a identității, comparată cu poza din actul meu. Fotografia se folosește doar pentru această verificare.", required: true },
  { id: "screening", label: "Am luat la cunoștință că numele meu este verificat în listele de sancțiuni și de persoane expuse public.", required: true },
  { id: "marketing", label: "Vreau să primesc oferte de la bancă (opțional).", required: false },
] as const;
export type ConsentId = (typeof CONSENT_ITEMS)[number]["id"];
export interface Consent { at: string; items: ConsentId[] }

export interface IdentityCheck {
  /** JPEG data URL, downscaled; stays in this browser until the backend endpoint exists. */
  selfie: string;
  capturedAt: string;
  liveness: { blink: boolean; turn: boolean; method: "mediapipe" | "none" };
  /** Face comparison with the ID photo runs in the backend; until then it is always pending. */
  faceMatch: "pending";
  /** Set when the client could not use the camera and uploaded a photo instead. */
  fallbackReason?: string;
}
export interface Onboarding { consent?: Consent; identity?: IdentityCheck }

export const ONBOARDING_STEPS = [
  { key: "cont", label: "Cont" },
  { key: "date", label: "Date" },
  { key: "acord", label: "Acord" },
  { key: "documente", label: "Documente" },
  { key: "identitate", label: "Identitate" },
  { key: "trimitere", label: "Trimitere" },
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
/** Romanian mobile number: 07xxxxxxxx or +407xxxxxxxx (spaces allowed). */
export const isValidPhone = (v: string) => /^(\+?40|0)7\d{8}$/.test(v.replace(/[\s.-]/g, ""));
export const hasRequiredConsent = (c?: Consent) => !!c && CONSENT_ITEMS.filter((i) => i.required).every((i) => c.items.includes(i.id));
/** The identity step is done once a selfie exists; a missing liveness result is shown to the officer, not blocked here. */
export const identityDone = (o?: Onboarding) => !!o?.identity?.selfie;
