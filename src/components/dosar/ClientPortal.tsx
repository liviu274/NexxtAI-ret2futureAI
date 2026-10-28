import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { getPortalCase, getPlaybook, uploadDocument } from "@/api/client";
import { ADDRESS_FEEDBACK, portalSteps } from "@/lib/review";
import { ClientHeader } from "./Header";
import { Button } from "@/components/ui/button";

export function ClientPortal({ caseId }: { caseId: string }) {
  const { data: c } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => getPortalCase(caseId),
  });
  const { data: playbook } = useQuery({
    queryKey: ["playbook", c?.playbookId],
    queryFn: () => getPlaybook(c?.playbookId ?? ""),
    enabled: !!c?.playbookId,
  });
  const input = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const flag = c?.flags.find(
    (f) => f.client_fixable && f.fix_message != null && f.status !== "dismissed",
  );
  const address = caseId.includes("factura") || caseId.includes("adresa");
  const steps = portalSteps(playbook);
  const step = address ? Math.max(1, steps.indexOf("utility_bill") + 1) : 1;
  const message = feedback ?? (flag ? (address ? ADDRESS_FEEDBACK : flag.fix_message) : null);
  async function onFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    if (file.size > 10 * 1024 * 1024) {
      setFeedback("Fișierul depășește limita de 10 MB.");
      return;
    }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setFeedback("Alege un fișier PDF, JPG sau PNG.");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadDocument(caseId, file);
      setFeedback(result.message);
    } catch (e) {
      setFeedback(
        e instanceof Error && e.message
          ? e.message
          : "Fișierul nu a putut fi verificat. Încearcă din nou.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-beige">
      <ClientHeader />
      <main className="mx-auto w-full max-w-[468px] px-6 pb-12 pt-10">
        <div className="text-[11px] text-ink-muted">
          {steps.length ? `Pasul ${step} din ${steps.length}` : "Se încarcă documentele…"}
        </div>
        <progress
          aria-label="Progres documente"
          value={step}
          max={steps.length || 1}
          className="portal-progress mt-2 h-1 w-full overflow-hidden rounded-full"
        />
        <h1 className="mt-6 text-[22px] font-semibold text-ink">
          {address ? "Dovada adresei" : "Documentele tale"}
        </h1>
        <p className="mt-2 text-xs leading-[18px] text-ink-muted">
          {address
            ? "O factură de utilități pe numele și adresa din actul de identitate."
            : "Încarcă documentul original pentru clarificarea neconcordanțelor semnalate."}
        </p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {!message && !busy && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className="mt-7 flex min-h-[175px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-4 py-6"
          >
            <Upload className="h-6 w-6 text-ink-muted" />
            <p className="mt-3 text-xs text-ink-muted">Trage fișierul aici sau</p>
            <Button
              className="mt-3 h-8 px-5 text-xs"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Alege fișier
            </Button>
            <p className="mt-3 text-[10px] text-ink-muted">PDF, JPG sau PNG, maxim 10 MB</p>
          </div>
        )}
        {(message || busy) && (
          <div className="mt-[18px] rounded-lg border border-border border-l-2 border-l-sev-medium bg-card p-[18px]">
            <p className="text-[10px] text-ink-muted">
              {fileName ||
                c?.documents.find((d) => d.id === flag?.evidence[0]?.documentId)?.fileName ||
                "Document solicitat"}
            </p>
            <p className="mt-2 text-xs leading-[18px] text-ink">
              {busy ? "Se verifică…" : message}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                className="h-8 text-xs"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                Încarcă alt document
              </Button>
              <Button
                variant="link"
                className="h-auto p-0 text-xs font-normal text-teal"
                onClick={() => setHelp(!help)}
              >
                De ce am nevoie de asta?
              </Button>
            </div>
            {help && (
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                {flag?.ruleText ?? "Documentele sunt verificate pentru deschiderea contului."}
              </p>
            )}
          </div>
        )}
        <p id="ajutor" className="mt-6 text-center text-[10px] text-ink-muted">
          Documentele tale sunt folosite doar pentru deschiderea contului.
        </p>
      </main>
    </div>
  );
}
