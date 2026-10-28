import { useEffect, useState } from "react";
import { FileSearch } from "lucide-react";
import type { BBox, Document } from "@/types";
export function DocumentViewer({ document, page = 0, highlights = [] }: { document: Document | null; page?: number; highlights?: BBox[]; onPageChange?: (p: number) => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [document?.id, document?.pageImages[page]]);
  return <div className="flex min-h-[345px] items-center justify-center rounded border border-border bg-beige p-7 max-sm:p-3">
    {!document ? <div className="flex flex-col items-center gap-2 text-xs text-ink-muted"><FileSearch className="h-6 w-6" />{document === null ? "Niciun document disponibil." : "Selectează un document."}</div> : failed ? <div className="w-full text-center text-xs text-ink-muted"><FileSearch className="mx-auto mb-3 h-7 w-7" /><p>Documentul SPECIMEN este în așteptarea arhivei.</p>{document.pdfUrl && <a className="mt-3 inline-block text-teal" href={document.pdfUrl} target="_blank" rel="noreferrer">Deschide PDF →</a>}</div> : <div className="relative w-full max-w-[570px]"><img src={document.pageImages[page]} alt={`${document.type}, pagina ${page + 1}`} onError={() => setFailed(true)} className="block w-full" />{highlights.map((b, i) => <div key={i} data-evidence-highlight className="pointer-events-none absolute border border-sev-high bg-sev-high/10" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }} />)}</div>}
  </div>;
}
