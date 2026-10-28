import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/api/client";
import { ClientHeader } from "@/components/dosar/Header";
import { Card } from "@/components/dosar/badges";
import { ChatMessage } from "@/components/dosar/ChatMessage";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Încarcă documentele · DosarAI" },
      { name: "description", content: "Încarcă documentele și află imediat dacă e nevoie de corecturi." },
      { property: "og:title", content: "Încarcă documentele · DosarAI" },
      { property: "og:description", content: "Feedback instant pentru documentele tale de onboarding." },
    ],
  }),
  component: UploadPage,
});

type Msg = { role: "ai" | "user"; text: string };

function UploadPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "ai", text: "Bună! Încarcă actul de identitate, un fluturaș de salariu recent și o factură de utilități. Îți spun imediat dacă e ceva de corectat." }]);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      setMsgs((m) => [...m, { role: "user", text: `📎 ${f.name}` }]);
      setBusy(true);
      const r = await uploadDocument(f);
      setBusy(false);
      setMsgs((m) => [...m, { role: "ai", text: r.message }]);
    }
  }

  return (
    <div className="min-h-screen bg-beige">
      <ClientHeader />
      <main className="mx-auto max-w-[1100px] px-6 py-10">
        <h1 className="text-2xl font-bold text-ink">Documentele tale</h1>
        <p className="mt-1 text-sm text-ink-muted">Durează doar câteva minute. Un colaborator al băncii va analiza dosarul tău.</p>
        <div className="mt-6 grid grid-cols-2 gap-6">
          <Card className="p-6">
            <label className="flex h-72 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line bg-beige text-center hover:border-teal">
              <Upload className="h-8 w-8 text-teal" />
              <span className="font-medium text-ink">Trage fișierele aici sau apasă pentru a alege</span>
              <span className="text-xs text-ink-muted">PDF, JPG sau PNG, maximum 10 MB</span>
              <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </Card>
          <Card className="flex flex-col gap-3 p-6">
            {msgs.map((m, i) => <ChatMessage key={i} role={m.role}>{m.text}</ChatMessage>)}
            {busy && <ChatMessage role="ai"><span className="text-ink-muted">Se verifică…</span></ChatMessage>}
          </Card>
        </div>
      </main>
    </div>
  );
}
