# Person 4 — Tamper Detection, Screening & Risk Draft

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
person-4-tamper-screening-risk-draft/
├── data/
│   ├── gigel/
│   │   ├── cases/
│   │   ├── document-manifest.json
│   │   └── generator/
│   └── README.md
├── rules/
│   ├── rules.json
│   ├── field-catalog.md
│   ├── validate_rules.py
│   └── README.md
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

## Validate the rules

From the repository root:

```sh
python3 projects/person-4-tamper-screening-risk-draft/rules/validate_rules.py
```

## Run the Featherless client

```sh
cd projects/person-4-tamper-screening-risk-draft/featherless-ai-client
npm start -- "Describe the tamper signals in a payslip"
```

The local `.env` contains the API key and is ignored by Git.
