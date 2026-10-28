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
└── projects/
    └── person-4-tamper-screening-risk-draft/
        ├── data/
        ├── rules/
        ├── featherless-ai-client/
        └── README.md
```

`docs/` contains challenge and reference material. Each implementation lives
under `projects/` so additional agents or prototypes can be added without
mixing their files.

## Person 4 project

```sh
cd projects/person-4-tamper-screening-risk-draft/featherless-ai-client
npm start -- "Describe the tamper signals in a payslip"
```

Copy `.env.example` to `.env` and add your Featherless AI key if `.env` is not
already present. Secrets and dependencies are ignored at the repository level.

The Person 4 scope, synthetic Gigel fixture, declarative rules, tamper checks,
screening placeholders, and risk-draft boundary are documented in
[`projects/person-4-tamper-screening-risk-draft/README.md`](./projects/person-4-tamper-screening-risk-draft/README.md).

Additional colleagues can add sibling folders under `projects/` without
mixing ownership or implementation files.
