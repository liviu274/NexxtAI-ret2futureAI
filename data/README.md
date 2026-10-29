# Test data

Everything here is synthetic (fictional people and companies, SPECIMEN watermark) and is for testing and
demonstration only. Reference date: 2026-10-28.

```text
data/
├── client data/KYC_PF_PJ/   the 26 labelled cases: 13 PF (PF/data/gigel/cases/) and 13 PJ (PJ/cases/)
├── mock_registries/         ONRC registry, sanctions, PEP and adverse-media lists, risk-factor tables (demo values)
├── id_photos/               local only (gitignored): fake ID photos for tests/test_id_photos.py
└── obsolete_data/           the first Gigel fixtures, kept for history; nothing reads them
```

Each case folder has the documents (`docs/` PDFs, `images/` PNGs), `case_file.extracted.json` in the contract format,
`truth.json` (values and bounding boxes) and `expected_flags.json` (the detector oracle). The case list and what each
one tests are in [`KYC_PF_PJ/CAZURI.md`](client%20data/KYC_PF_PJ/CAZURI.md) and
[`KYC_PF_PJ/CITESTE_MA.md`](client%20data/KYC_PF_PJ/CITESTE_MA.md).

`projects/orchestrator/tests/test_dataset.py` runs every case through the full pipeline and compares the flags with
`expected_flags.json`; `python -m nexxt_orchestrator.seed` loads them, files included, for the UI.
