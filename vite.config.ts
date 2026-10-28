// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Local dev only: /api/playbook/* goes to the playbook builder (uvicorn server:app --port 8002).
      // Deployed builds set VITE_PLAYBOOK_URL instead.
      proxy: {
        "/api/orch": {
          target: "http://localhost:8000",
          changeOrigin: true,
          timeout: 600_000,
          proxyTimeout: 600_000,
          rewrite: (path) => path.replace(/^\/api\/orch/, ""),
        },
        "/api/playbook": {
          target: "http://localhost:8002",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/playbook/, ""),
        },
      },
    },
  },
});
