import type { Case } from "@/types";
const KEY = "dosarai-demo-cases-v1";
export function readDemoCases(fallback: Case[]): Case[] {
  if (typeof window === "undefined") return structuredClone(fallback);
  try { const raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) as Case[] : structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
export function writeDemoCases(cases: Case[]) {
  if (typeof window !== "undefined") { window.localStorage.setItem(KEY, JSON.stringify(cases)); window.dispatchEvent(new Event("dosarai-demo-change")); }
}