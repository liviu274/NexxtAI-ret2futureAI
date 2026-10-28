import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  // Starts as "light" to match the server render, then reads the class set before hydration.
  const [theme, setState] = useState<Theme>("light");
  useEffect(() => {
    const sync = () => setState(currentTheme());
    sync();
    window.addEventListener("dosarai-theme-change", sync);
    return () => window.removeEventListener("dosarai-theme-change", sync);
  }, []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={dark ? "Treci la tema luminoasă" : "Treci la tema întunecată"}
      title={dark ? "Temă luminoasă" : "Temă întunecată"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("inline-flex items-center gap-2 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", className)}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {withLabel && <span>{dark ? "Temă luminoasă" : "Temă întunecată"}</span>}
    </button>
  );
}
