import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IdentityCheck } from "@/lib/onboarding";

// MediaPipe is loaded from the CDN on demand, so the app bundle and package.json stay unchanged.
const TASKS_VERSION = "0.10.14";
const TASKS_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface Point { x: number; y: number }
interface LandmarkerResult { faceLandmarks: Point[][]; faceBlendshapes: { categories: { categoryName: string; score: number }[] }[] }
interface FaceLandmarker { detectForVideo(video: HTMLVideoElement, ts: number): LandmarkerResult; close(): void }
interface VisionModule {
  FilesetResolver: { forVisionTasks(url: string): Promise<unknown> };
  FaceLandmarker: { createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<FaceLandmarker> };
}

type Phase = "intro" | "loading" | "blink" | "turn" | "center" | "manual" | "preview" | "error";
const PROMPTS: Partial<Record<Phase, string>> = { blink: "Clipește de două ori.", turn: "Întoarce încet capul spre stânga sau spre dreapta.", center: "Acum privește drept în cameră.", manual: "Privește drept în cameră și apasă „Fă fotografia”." };
const MODEL_TIMEOUT_MS = 20_000;

/** Why the camera did not start, in words the client can act on. */
export function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Nu ai permis accesul la cameră. Îl poți permite din setările browserului (iconița din bara de adrese) sau poți încărca o fotografie.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nu am găsit nicio cameră pe acest dispozitiv. Poți încărca o fotografie.";
  if (name === "NotReadableError" || name === "AbortError") return "Camera este folosită de altă aplicație. Închide aplicația respectivă și încearcă din nou.";
  return "Camera nu a pornit. Încearcă din nou sau încarcă o fotografie.";
}

/** The face model, on the GPU when the browser allows it, otherwise on the CPU; never waits forever. */
async function loadLandmarker(): Promise<FaceLandmarker> {
  const load = async () => {
    const vision = await import(/* @vite-ignore */ `${TASKS_URL}/vision_bundle.mjs`) as VisionModule;
    const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_URL}/wasm`);
    const options = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 2 });
    try { return await vision.FaceLandmarker.createFromOptions(fileset, options("GPU")); }
    catch { return await vision.FaceLandmarker.createFromOptions(fileset, options("CPU")); } // no WebGL2 / GPU on this machine
  };
  return Promise.race([load(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("model timeout")), MODEL_TIMEOUT_MS))]);
}
export type CapturedIdentity = Omit<IdentityCheck, "capturedAt" | "faceMatch">;

/** Nose position between the cheeks: about 0.5 when facing the camera, near 0 or 1 when the head is turned. */
function yawRatio(face: Point[]) {
  const nose = face[1], left = face[234], right = face[454];
  if (!nose || !left || !right || right.x === left.x) return 0.5;
  return (nose.x - left.x) / (right.x - left.x);
}
function blinkScore(result: LandmarkerResult) {
  const c = result.faceBlendshapes[0]?.categories ?? [];
  const s = (n: string) => c.find((x) => x.categoryName === n)?.score ?? 0;
  return Math.min(s("eyeBlinkLeft"), s("eyeBlinkRight"));
}
function snapshot(source: CanvasImageSource, w: number, h: number) {
  const width = Math.min(480, w); const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = Math.round(h * width / w);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function LivenessCapture({ onCaptured, disabled }: { onCaptured: (c: CapturedIdentity) => void; disabled?: boolean }) {
  const video = useRef<HTMLVideoElement>(null); const fileInput = useRef<HTMLInputElement>(null);
  const stop = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("intro"); const [hint, setHint] = useState(""); const [error, setError] = useState("");
  const [result, setResult] = useState<CapturedIdentity | null>(null);
  useEffect(() => () => stop.current(), []);

  async function start() {
    setError(""); setHint(""); setResult(null); setPhase("loading");
    let stream: MediaStream | undefined; let landmarker: FaceLandmarker | undefined; let raf = 0; let stopped = false;
    stop.current = () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); landmarker?.close(); };
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // Browsers only expose the camera on https or localhost (e.g. not on http://192.168.x.x).
      setError("Camera funcționează doar pe o conexiune securizată (https) sau pe localhost. Poți încărca o fotografie."); setPhase("error"); return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) { stop.current(); setError(cameraError(e)); setPhase("error"); return; }
    // Show the camera at once; the face model loads while the client sees themself.
    if (stopped || !video.current) return;
    video.current.srcObject = stream;
    try { await video.current.play(); } catch { /* autoplay of a muted inline video is allowed; ignore a stray rejection */ }
    try { landmarker = await loadLandmarker(); }
    catch {
      // The camera works but automatic liveness does not: the client takes the photo, an officer checks it.
      if (!stopped) setPhase("manual");
      return;
    }
    try {
      if (stopped || !video.current) return;
      let step: Phase = "blink"; let blinks = 0; let eyesClosed = false; let turned = false; setPhase(step);
      const loop = () => {
        if (stopped || !video.current || !landmarker) return;
        const v = video.current;
        if (v.readyState >= 2) {
          const r = landmarker.detectForVideo(v, performance.now()); const face = r.faceLandmarks[0];
          if (!face) setHint("Nu îți vedem fața. Apropie-te și asigură-te că ai lumină.");
          else if (r.faceLandmarks.length > 1) setHint("În cadru trebuie să fii doar tu.");
          else {
            setHint("");
            const blink = blinkScore(r); const yaw = yawRatio(face);
            if (step === "blink") {
              if (blink > 0.5) eyesClosed = true;
              else if (eyesClosed && blink < 0.2) { eyesClosed = false; blinks += 1; if (blinks >= 2) { step = "turn"; setPhase(step); } }
            } else if (step === "turn") {
              if (yaw < 0.32 || yaw > 0.68) { turned = true; step = "center"; setPhase(step); }
            } else if (step === "center" && yaw > 0.42 && yaw < 0.58 && blink < 0.3) {
              const selfie = snapshot(v, v.videoWidth, v.videoHeight);
              stop.current(); setResult({ selfie, liveness: { blink: blinks >= 2, turn: turned, method: "mediapipe" } }); setPhase("preview"); return;
            }
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } catch {
      if (!stopped) setPhase("manual");
    }
  }

  function takeManual() {
    const v = video.current;
    if (!v || !v.videoWidth) { setHint("Camera încă pornește. Mai încearcă o dată."); return; }
    const selfie = snapshot(v, v.videoWidth, v.videoHeight); stop.current();
    setResult({ selfie, liveness: { blink: false, turn: false, method: "none" }, fallbackReason: "Verificarea automată a mișcării nu a pornit; fotografia a fost făcută cu camera și va fi verificată de un ofițer." });
    setPhase("preview");
  }

  function fromFile(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 10 * 1024 * 1024) { setError("Alege o fotografie JPG sau PNG de cel mult 10 MB."); return; }
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setResult({ selfie: snapshot(img, img.naturalWidth, img.naturalHeight), liveness: { blink: false, turn: false, method: "none" }, fallbackReason: "Camera nu a putut fi folosită; clientul a încărcat o fotografie." });
      setError(""); setPhase("preview");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("Fotografia nu a putut fi citită."); };
    img.src = url;
  }

  const live = phase === "loading" || phase === "blink" || phase === "turn" || phase === "center" || phase === "manual";
  return <div>
    <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-[#111111]">
      <video ref={video} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${live ? "" : "hidden"}`} />
      {live && <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-[78%] w-[52%] rounded-[50%] border-[3px] border-brand/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" /></div>}
      {phase === "preview" && result && <img src={result.selfie} alt="Fotografia ta de verificare" className="h-full w-full object-cover" />}
      {(phase === "intro" || phase === "error") && <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-white/80"><Camera className="h-8 w-8" />Fața ta trebuie să fie bine luminată, fără ochelari de soare sau șapcă.</div>}
      {phase === "loading" && <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-xs text-white"><Loader2 className="h-4 w-4 animate-spin" />Pregătim verificarea…</div>}
    </div>
    <div aria-live="polite" className="mt-4 min-h-10 text-center">
      {PROMPTS[phase] && <p className="text-sm font-semibold">{PROMPTS[phase]}</p>}
      {hint && <p className="mt-1 text-xs text-sev-medium">{hint}</p>}
      {phase === "preview" && <p className="text-xs text-ink-muted">{result?.liveness.method === "mediapipe" ? "Gata. Verifică dacă fotografia e clară." : "Fotografia a fost încărcată. Un ofițer va verifica identitatea manual."}</p>}
      {error && <p role="alert" className="text-xs text-sev-high">{error}</p>}
    </div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png" capture="user" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
    <div className="mt-4 flex flex-col gap-2">
      {phase === "intro" && <Button className="w-full" disabled={disabled} onClick={() => void start()}><Camera className="h-4 w-4" />Pornește camera</Button>}
      {phase === "error" && <><Button className="w-full" disabled={disabled} onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />Încarcă o fotografie</Button><Button variant="outline" className="w-full" onClick={() => void start()}>Încearcă din nou camera</Button></>}
      {phase === "manual" && <Button className="w-full" disabled={disabled} onClick={takeManual}><Camera className="h-4 w-4" />Fă fotografia</Button>}
      {live && <Button variant="outline" className="w-full" onClick={() => { stop.current(); setPhase("intro"); }}>Renunță</Button>}
      {phase === "preview" && result && <><Button className="w-full" disabled={disabled} onClick={() => onCaptured(result)}>Folosește fotografia</Button><Button variant="outline" className="w-full" onClick={() => { setResult(null); setPhase("intro"); }}><RotateCcw className="h-4 w-4" />Refă</Button></>}
    </div>
  </div>;
}
