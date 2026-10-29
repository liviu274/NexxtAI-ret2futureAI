// Light/dark theme: the "dark" class on <html>; the saved choice wins over the system setting.
export const THEME_KEY = "dosarai-theme";
export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked: the choice lasts for this page only */ }
  window.dispatchEvent(new Event("dosarai-theme-change"));
}
