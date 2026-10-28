import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatMessage({ role, children }: { role: "ai" | "user"; children: React.ReactNode }) {
  const ai = role === "ai";
  return (
    <div className={cn("flex gap-2", !ai && "justify-end")}>
      {ai && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", ai ? "bg-beige-dark text-ink" : "bg-ink text-card")}>{children}</div>
    </div>
  );
}
