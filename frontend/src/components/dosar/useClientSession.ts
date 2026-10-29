import { useEffect, useState } from "react";
import { getSession } from "@/api/client";
import type { ClientSession } from "@/lib/onboarding";

/** Demo client session; `ready` stays false during SSR and the first paint so redirects never run on the server. */
export function useClientSession() {
  const [state, setState] = useState<{ ready: boolean; session: ClientSession | null }>({ ready: false, session: null });
  useEffect(() => {
    const read = () => setState({ ready: true, session: getSession() });
    read();
    window.addEventListener("raif2future-session-change", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("raif2future-session-change", read); window.removeEventListener("storage", read); };
  }, []);
  return state;
}
