# Featherless AI client

This is the current runnable prototype inside the NexxtAI challenge workspace.
It is the foundation for the future document, data, and verification agents.

## Setup and run

From this directory:

```sh
cp .env.example .env
# Add your key to .env
npm start -- "Explain how an operations agent could verify a document"
```

Node.js 18 or newer is required. The API key is read locally from `.env`,
which is ignored by Git and must not be committed.

Configuration:

- `FEATHERLESS_API_KEY` — your API key
- `FEATHERLESS_BASE_URL` — defaults to `https://api.featherless.ai/v1`
- `FEATHERLESS_MODEL` — defaults to `Qwen/Qwen2.5-7B-Instruct`

Use synthetic data only. Future banking workflows must include human review,
audit logging, prompt-injection defenses, and explicit LLM guidelines.
