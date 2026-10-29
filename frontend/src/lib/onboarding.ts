/** Client onboarding: demo session, consent and the identity check. For cases in the orchestrator, consent and the
 * selfie are sent to it (POST /consent, /identity) and the selfie is compared there with the ID photo. */

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
  /** JPEG data URL, downscaled. For orchestrator cases a copy is stored with the case; this one shows it to the client. */
  selfie: string;
  capturedAt: string;
  liveness: { blink: boolean; turn: boolean; method: "mediapipe" | "none" };
  /** The comparison with the ID photo runs in the orchestrator, for the officer; the client never sees its result. */
  faceMatch: "pending";
  /** Set when the client could not use the camera and uploaded a photo instead. */
  fallbackReason?: string;
}
/** What the orchestrator has stored for the case, so a step done in another browser counts as done. */
export interface StoredOnboarding { consent: boolean; identity: boolean }
export interface Onboarding { consent?: Consent; identity?: IdentityCheck; stored?: StoredOnboarding }

/** The officer's view of the face comparison (orchestrator cases). */
export interface FaceComparison { status: "match" | "no_match" | "not_compared"; score: number | null; threshold: number; reason?: string }
export interface IdentityReview { consent?: Consent; identity?: Omit<IdentityCheck, "faceMatch">; face?: FaceComparison | null; stored: boolean }

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
export const identityDone = (o?: Onboarding) => !!o?.identity?.selfie || !!o?.stored?.identity;
export const consentDone = (o?: Onboarding) => hasRequiredConsent(o?.consent) || !!o?.stored?.consent;
