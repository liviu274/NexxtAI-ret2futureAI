# Pixel Perfect Replay

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd741e6d-22a2-4157-85e1-edb0f67b624f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Run against the NexxtAI orchestrator

By default the screens use the SPECIMEN mock data. To use the real backend:

```sh
# NexxtAI-ret2futureAI/projects/orchestrator
.venv/bin/python -m nexxt_orchestrator.seed          # loads the 26 labelled cases
.venv/bin/uvicorn nexxt_orchestrator.api:app --port 8000 --env-file .env

# here
cp .env.example .env.local                             # VITE_USE_MOCK=false, VITE_API_BASE_URL=http://localhost:8000
bun run dev
```

The server must allow this origin (`NEXXT_CORS_ORIGINS`, default `http://localhost:8080,http://localhost:5173`).
When the server sets `NEXXT_ANALYSTS`, the staff screens ask once for the analyst's token.
