# NexxtAI — Raiffeisen Operational Efficiency

KYC onboarding agent for current-account opening (PF and PJ): a procedure becomes a machine-readable playbook, the
client uploads documents, the agent reads and checks them, and an analyst decides with every flag linked to its
evidence and to the procedure rule behind it. The agent never decides.

Repository: https://github.com/liviu274/NexxtAI-ret2futureAI

## Workspace

```text
NexxtAI-ret2futureAI/
├── conventions/          CONTRACTS.md + example JSON: the shapes every module reads and writes
├── docs/                 challenge brief, build plan, bank procedures (PF-ONB-01, PJ-ONB-01)
├── data/                 synthetic test data (see data/README.md)
└── projects/
    ├── playbook-builder/ procedure PDF → playbook JSON, validated, with the clause review report (Person 2)
    ├── orchestrator/     API, pipeline, checks, guardrails, audit log (Person 1); runs the OCR below
    ├── data-collection/  Featherless vision OCR and field extraction (Person 3)
    └── featherless-ai-client/  first Node prototype of the Featherless client
```

The analyst screens and the client portal are a separate repository (`pixel-perfect-replay-22065`, Lovable). Its dev
server proxies `/api/orch` to the orchestrator on port 8000 (`VITE_ORCHESTRATOR_URL` for deployed builds): backend cases
appear next to the mock ones, and portal cases are created in the backend. `node scripts/seed-orchestrator.mjs` there
loads its two reference PJ cases.

## Run it

```sh
cd projects/orchestrator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q                         # 220+ tests, including all 26 labelled cases
cp .env.example .env                                  # set FEATHERLESS_API_KEY for OCR
.venv/bin/python -m nexxt_orchestrator.seed           # load the labelled cases for the UI
.venv/bin/uvicorn nexxt_orchestrator.api:app --port 8000 --env-file .env
```

Details, endpoints, configuration and guardrails: [`projects/orchestrator/README.md`](projects/orchestrator/README.md).
Building a playbook from a procedure: [`projects/playbook-builder/README.md`](projects/playbook-builder/README.md).

Secrets live in `.env` files, which are gitignored; each project has a `.env.example`. Use synthetic data only.
