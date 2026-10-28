<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All data access goes through `src/api/client.ts` (USE_MOCK flag; mocks loaded lazily from `src/mocks/`). Components never import mocks — keeps the swap to a real REST backend a one-line change.
- Design tokens (brand, ink, line, beige, teal, sev-*) live in `src/styles.css` `@theme inline` (Tailwind v4, no tailwind.config) — the single source for colors.
- Routing is TanStack Router file routes (React Router is not supported on this stack).
- Mock documents use per-case PNG pages with PDF fallback; normalized top-left evidence boxes resolve through the API from per-case truth fixtures, never guessed coordinates.
- Direct PJ ownership comparisons are derived from case.company and case.ownership, with React Flow rendered client-side to keep SSR browser-safe.
- Screenshot-mapped content routes share focused presentation components; /upload remains a client-portal alias to preserve its existing address.
- SPECIMEN dataset is generated into src/mocks/specimen.json (assets in public/mocks/<case>/) from the user's archive; regenerate rather than hand-edit, so data stays faithful to the source.
- Mock-only screening types live in `src/types/extensions.ts`; list fixtures and officer resolutions are accessed only through the API client, so screening evidence never masquerades as document coordinates or alters the existing REST contract.
- Review policies and source clauses are generated from archive rules and the original PJ PDF into a separate fixture, preserving the imported case dataset.
- Demo onboarding and officer actions share a versioned browser store accessed only through the API client; storage events invalidate case queries across tabs without adding a real backend.
- Portal pages are sibling file-route leaves with a shared focused presentation module; no content route acts as a parent without an Outlet.
