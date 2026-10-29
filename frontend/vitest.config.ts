import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The mock portal's simulated document checks are an explicit demo mode; the app never enables them by default.
    env: { VITE_DEMO_UPLOADS: "true" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
