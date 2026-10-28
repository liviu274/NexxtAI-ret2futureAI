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
- Mock bboxes are normalized 0–1 against the SVG viewBox of files in `public/mocks/docs/`; move SVG text and bbox together.
