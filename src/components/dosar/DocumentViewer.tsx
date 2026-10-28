import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, FileSearch } from "lucide-react";
import type { BBox, Document } from "@/types";
import { Button } from "@/components/ui/button";

export function DocumentViewer({ document, page = 0, highlights = [], onPageChange }: {
  document: Document | null;
  page?: number;
  highlights?: BBox[];
  onPageChange?: (p: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  if (!document)
    return (
      <div className="flex h-[480px] flex-col items-center justify-center gap-2 rounded-lg bg-beige-dark text-center text-sm text-ink-muted">
        <FileSearch className="h-8 w-8 text-line" />
        Selectează un flag pentru a vedea dovada în document.
      </div>
    );
  const pages = document.pageImages.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{document.type}</div>
          <div className="text-xs text-ink-muted">{document.fileName}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Micșorează" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><Minus className="h-4 w-4" /></Button>
          <span className="w-12 text-center text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" aria-label="Mărește" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><Plus className="h-4 w-4" /></Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button size="icon" variant="ghost" aria-label="Pagina anterioară" disabled={page <= 0} onClick={() => onPageChange?.(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-ink-muted">Pagina {page + 1} / {pages}</span>
          <Button size="icon" variant="ghost" aria-label="Pagina următoare" disabled={page >= pages - 1} onClick={() => onPageChange?.(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-lg bg-beige-dark p-4">
        <div className="relative mx-auto shadow-card" style={{ width: `${zoom * 100}%` }}>
          <img src={document.pageImages[page]} alt={`${document.type}, pagina ${page + 1}`} className="block w-full" />
          {highlights.map((b, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-sm border-2 border-sev-high bg-sev-high/20 animate-in fade-in zoom-in-95"
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
