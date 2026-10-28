# Elena — Person 4: Tamper Detection, Screening & Risk Draft

This folder contains Elena's contribution to the NexxtAI challenge.

## Ownership

Person 4 owns the second row of diagram stage 3:

- tamper detection;
- mock registries used as tools;
- sanctions and PEP screening with fuzzy name matching;
- adverse-media stub;
- PJ ownership graph: shareholders to UBOs, compared with the declared
  beneficial owner;
- risk draft with reasons based on country, occupation, CAEN code, and PEP;
- no final approval or rejection decision.

## Contents

```text
elena/person-4-tamper-detection-screening-risk-draft/
├── data/
│   ├── gigel/
│   │   ├── cases/
│   │   ├── document-manifest.json
│   │   └── generator/
│   └── mock-registries/
│       └── ubo-companies.json
│   └── README.md
├── rules/
│   ├── rules.json
│   ├── field-catalog.md
│   ├── validate_rules.py
│   └── README.md
├── docs/
│   ├── diagram-prompts.md
│   └── use-cases-and-story.md
├── featherless-ai-client/
│   ├── src/
│   └── package.json
└── README.md
```

The rules are declarative: the extractor reads the document fields from
`rules/rules.json`, then the validator reads the checks from the same file.
The Gigel fixtures provide synthetic PDFs, ground truth, and expected flags.

All data is synthetic. The final risk output is always a draft for human
review; this work must never make an autonomous banking decision.

The 50-company synthetic ONRC/UBO fixture is in
[`data/mock-registries/ubo-companies.json`](./data/mock-registries/ubo-companies.json).
It contains 25 parent-to-holding-company pairs. Every ownership total is
exactly 100.0%, and every holding company has only PF shareholders.

The reusable prompts for architecture, tamper, API, microservices, screening,
and human-review diagrams are in
[`docs/diagram-prompts.md`](./docs/diagram-prompts.md).

The simple-language story and use cases are in
[`docs/use-cases-and-story.md`](./docs/use-cases-and-story.md).

The runnable PF flow is in [`pipeline/`](./pipeline/). It executes intake,
classification, rule-driven extraction, cross-document checks, tamper
detection, synthetic screening, risk drafting, and human-review handoff.

The image anomaly baseline is in [`classifier/`](./classifier/). It uses
MIDV-500 as a reference bank, not as a forged/not-forged truth set. Its output
is a triage signal and always requires human review for suspicious images.

## Validate the rules

From the repository root:

```sh
python3 projects/elena/person-4-tamper-detection-screening-risk-draft/rules/validate_rules.py
```

## Run the Featherless client

```sh
cd projects/elena/person-4-tamper-detection-screening-risk-draft/featherless-ai-client
npm start -- "Describe the tamper signals in a payslip"
```

The local `.env` contains the API key and is ignored by Git.
