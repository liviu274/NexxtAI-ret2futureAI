# PF pipeline

Run the complete deterministic flow against a synthetic case:

```sh
python3 pipeline/pf_pipeline.py \
  data/gigel/cases/case_0001_pf_gigel_curat

python3 pipeline/pf_pipeline.py \
  data/gigel/cases/case_0006_pf_gigel_fluturas_talcioc \
  --output /tmp/gigel-review.json
```

The flow is:

```text
intake -> classify -> extract -> required checks -> cross-checks
-> tamper detection -> screening -> risk draft -> human review
```

The fixture extractor reads `truth.json` so the demo runs with Python's
standard library only. Replacing it with an OCR/PDF adapter does not change
the validator output contract.

The output always contains `decision: null`. A human analyst must make the
final decision outside the pipeline.

Run the automated fixture checks with:

```sh
python3 -m unittest discover -s pipeline -p 'test_*.py'
```

The altered fixture is expected to contain the three oracle flags
`R-PF-012`, `R-PF-013`, and `R-PF-014`. The pipeline also reports `R-PF-015`
for the incremental-save signal because that check is enabled in
`rules/rules.json`; it is intentionally not yet in the fixture oracle.
