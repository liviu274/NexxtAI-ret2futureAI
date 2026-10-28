import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// Every test must opt into its own fetch responses; never contact a live service.
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline test"))));
afterEach(() => vi.unstubAllGlobals());

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
