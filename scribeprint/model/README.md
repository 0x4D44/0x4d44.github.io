# Scribeprint model laboratory

This package contains the reproducible training and evaluation loops for
Scribeprint. It is research infrastructure, not a production accuracy claim.

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

## Human false-positive benchmark

[`benchmark/`](benchmark/) defines the independent human-only evaluation set.
The open-core profile rebuilds 10,000 pre-2022 or historical human documents
across creative, news, informal, technical, professional and business-regulatory
writing. The full release profile adds locally licensed native-student and
learner-English essays without committing or uploading their text.

The emitted selection lock must be checked against every future training corpus.
Benchmark rows cannot silently become hard negatives for the same benchmark
version.

## Local checks

```bash
python -m pip install -e './scribeprint/model[dev]'
pytest -q scribeprint/model/tests
python -m compileall -q scribeprint/model/src
```

Install the optional streaming dependencies only when constructing the open
benchmark:

```bash
python -m pip install -e './scribeprint/model[benchmark,dev]'
```

## Commands

```bash
scribeprint-import-m4 --help
scribeprint-audit --help
scribeprint-baseline --help
scribeprint-evaluate --help
scribeprint-human-benchmark --help
scribeprint-human-evaluate --help
```

A model is not eligible for the public detector merely because a pilot scores
well. It must pass the frozen human false-positive benchmark plus held-out
generators, paraphrasing, mixed-authorship and time-shifted evaluations at the
same predeclared operating point.
