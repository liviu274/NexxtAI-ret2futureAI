# Synthetic Gigel Popescu dataset

This folder contains the first parser/detector fixture for the Raiffeisen
operational-efficiency challenge. It is synthetic and may be used only for
testing and demonstration.

## Dataset tree

```text
data/gigel/
├── cases/
│   ├── case_0001_pf_gigel_curat/
│   │   ├── docs/
│   │   │   ├── doc_001_identitate.pdf
│   │   │   ├── doc_002_factura.pdf
│   │   │   └── doc_003_fluturas.pdf
│   │   ├── truth.json
│   │   └── expected_flags.json
│   └── case_0006_pf_gigel_fluturas_talcioc/
│       ├── docs/
│       │   ├── doc_001_identitate.pdf
│       │   ├── doc_002_factura.pdf
│       │   └── doc_003_fluturas.pdf
│       ├── truth.json
│       └── expected_flags.json
├── generator/
│   ├── build_gigel.py
│   └── verify.py
└── document-manifest.json
```

`truth.json` is the generator's ground truth, including extracted values and
normalized bounding boxes. `expected_flags.json` is the detector oracle.
The clean case must produce no flags. The altered payslip case must produce
`R-PF-012`, `R-PF-013`, and `R-PF-014`.

The altered file also contains an incremental-save signal (`%%EOF` appears
twice). It is intentionally documented in the manifest but is not yet part of
`expected_flags.json`, so it can be added as a separate rule later.

All documents contain a synthetic-data watermark. Do not present the
identifiers as real customer data.
