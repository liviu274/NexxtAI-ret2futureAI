# NexxtAI — Raiffeisen Operational Efficiency

This is the single workspace for the challenge and is checked out on
`Elena-branch`.

Repository: https://github.com/liviu274/NexxtAI-ret2futureAI

## Workspace tree

```text
NexxtAI-ret2futureAI/
├── docs/
│   ├── brief-raiffeisen-bank.pdf
│   └── source-code-security-day4.pdf
├── data/
│   ├── README.md
│   ├── document-manifest.json
│   └── gigel/
└── projects/
    └── featherless-ai-client/
        ├── src/
        ├── .env.example
        ├── package.json
        └── README.md
```

`docs/` contains challenge and reference material. Each implementation lives
under `projects/` so additional agents or prototypes can be added without
mixing their files.

## Run the current project

```sh
cd projects/featherless-ai-client
npm start -- "Explain how an operations agent could verify a document"
```

Copy `.env.example` to `.env` and add your Featherless AI key if `.env` is not
already present. Secrets and dependencies are ignored at the repository level.

The current client is only the foundation. The selected solution will add
specialized agents, orchestration, LLM guidelines, auditability, human review,
and authorized LLM security tests.

The first synthetic parser fixture is documented in
[`data/README.md`](./data/README.md), with every Gigel Popescu document listed
in [`data/gigel/document-manifest.json`](./data/gigel/document-manifest.json).
