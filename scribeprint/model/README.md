# Scribeprint model laboratory

This package contains the first reproducible training and evaluation loop for
Scribeprint. It is a research scaffold, not a production accuracy claim.

## Phase 0

The initial model combines character and word TF-IDF features with a small,
inspectable stylometric feature block and logistic regression. Calibration and
operating thresholds are fitted only on the reserved calibration partition.
Predictions between the frozen human and AI thresholds are reported as
`inconclusive`.

The first real-data experiment is documented in [`M4_PILOT.md`](M4_PILOT.md).
It uses source-disjoint M4 arXiv mirrors, holds GPT-3.5 out of training, audits
cross-split duplicates, and deletes canonical corpus text before CI artifacts
are uploaded.

## Local checks

```bash
python -m pip install -e './scribeprint/model[dev]'
pytest -q scribeprint/model/tests
python -m compileall -q scribeprint/model/src
```

## Commands

```bash
scribeprint-import-m4 --help
scribeprint-audit --help
scribeprint-baseline --help
scribeprint-evaluate --help
```

A model is not eligible for the public detector merely because this pilot
scores well. It must also pass held-out domains, writer populations,
paraphrasing, mixed-authorship and time-shifted evaluations at a frozen low
human false-positive rate.
