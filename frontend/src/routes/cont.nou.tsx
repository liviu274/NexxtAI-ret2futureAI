import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { requestSignInCode, verifySignInCode } from "@/api/client";
import { PortalLayout } from "@/components/dosar/PortalFlow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/cont/nou")({
  head: () => ({ meta: [{ title: "Creează cont · Raif2Future" }, { name: "description", content: "Creează-ți contul ca să deschizi un cont curent online." }, { property: "og:title", content: "Creează cont · Raif2Future" }, { property: "og:description", content: "Primul pas pentru deschiderea contului." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: NewAccount,
});

function NewAccount() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null); const [existing, setExisting] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const r = await requestSignInCode(email, phone); setSentTo(r.sentTo); setDemoCode(r.demoCode ?? null); setExisting(!!r.existing); } catch (err) { setError(err instanceof Error ? err.message : "Codul nu a putut fi trimis."); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await verifySignInCode(email, phone, code); await navigate({ to: "/portal" }); } catch (err) { setError(err instanceof Error ? err.message : "Codul nu a putut fi verificat."); } finally { setBusy(false); }
  }

  return <PortalLayout step="cont">
    <h1 className="text-[22px] font-semibold">{sentTo ? "Introdu codul primit" : "Creează-ți contul sau intră în cont"}</h1>
    <p className="mt-2 text-xs leading-[18px] text-ink-muted">{sentTo ? `${existing ? "Ai deja un cont cu aceste date. " : ""}Ți-am trimis un cod de 6 cifre prin SMS la ${sentTo}.` : "Ai nevoie de un e-mail și de telefonul mobil. Dacă ai deja cont, folosește același e-mail și același telefon: un e-mail sau un telefon poate avea un singur cont."}</p>
    {!sentTo ? <form onSubmit={send} className="mt-6 space-y-4">
      <label className="block text-xs text-ink-muted">E-mail<Input type="email" autoComplete="email" className="mt-2 bg-card" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nume@exemplu.ro" /></label>
      <label className="block text-xs text-ink-muted">Telefon mobil<Input type="tel" autoComplete="tel" className="mt-2 bg-card" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0722 123 456" /></label>
      {error && <p role="alert" className="text-xs text-sev-high">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || !email || !phone}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Trimite codul</Button>
    </form> : <form onSubmit={verify} className="mt-6 space-y-4">
      <label className="block text-xs text-ink-muted">Cod de verificare<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mt-2 bg-card text-center font-mono text-lg tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      <p className="rounded-xl bg-beige-dark px-3 py-2 text-[11px] leading-relaxed text-ink-muted">{demoCode ? <>Demo, fără SMS: codul tău este <strong className="font-mono text-ink">{demoCode}</strong>. În producție îl primești prin SMS.</> : "Demo offline: orice cod din 6 cifre este acceptat."}</p>
      {error && <p role="alert" className="text-xs text-sev-high">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirmă</Button>
      <Button type="button" variant="link" className="h-auto p-0 text-xs font-normal text-teal" onClick={() => { setSentTo(null); setCode(""); setError(""); }}>Schimbă e-mailul sau telefonul</Button>
    </form>}
  </PortalLayout>;
}
