# M4 phase-0 pilot

This is Scribeprint's first real-data experiment. Its purpose is to validate
provenance, source-disjoint splitting, calibration and held-out-generator
evaluation—not to create a production detector.

## Frozen source

- Dataset: **M4**, EACL 2024.
- Repository: `mbzuai-nlp/M4`.
- Revision: `628bf0fcb2e8c6b7ffa71fd1af6be413aced8f7d`.
- Domain: arXiv abstracts.
- Generator files: BloomZ, ChatGPT, Cohere, Davinci, Dolly and FLAN-T5.
- Held-out generator: the exact `gpt-3.5-turbo` rows.

The importer records SHA-256 hashes for every source file and the pinned Git
revision. M4's historical files use several field variants: BloomZ uses
`abstract`/`machine_abstract`, some files use lowercase `source_id`, and some
FLAN rows leave `source` blank. These are normalised explicitly. When both
`machine_abstract` and `machine_text` exist, the abstract is used so prompt text
cannot leak into the classifier.

M4 does not provide one simple repository-wide redistribution licence. The CI
workflow deletes canonical source text before uploading artifacts. Any model or
data redistribution still requires a separate licence review covering M4 and
the underlying human sources.

## Leakage-safe protocol

1. `source_ID` is the source identity shared by the human document and mirrors.
2. Repeated human copies must normalise to exactly the same text; conflicts fail.
3. Exact duplicate human or machine texts connect source identities into the
   same split component.
4. Components are deterministically assigned 70% train, 10% validation, 10%
   calibration and 10% test.
5. Test components retain human documents plus GPT-3.5 mirrors only.
6. Other components retain human documents plus every non-GPT-3.5 mirror.
7. A character-shingle near-duplicate audit runs after canonicalisation.

This avoids a misleading setup where training sees the human abstract for a
paper and testing sees an AI rewrite of that same paper.

## What the run measures

The workflow trains the character/word/stylometric logistic baseline, fits its
calibrator on the reserved calibration partition, freezes an abstention band,
and reports false-positive rate, held-out-generator recall, ROC AUC, PR AUC,
Brier score, calibration error, selective accuracy, coverage, source-group
bootstrap intervals and key slices.

The comparison metric is held-out-generator recall at a frozen human false-
positive rate. Aggregate AUC is diagnostic, not a release criterion.

## Promotion rule

The artifact remains research-only. Promotion requires independent human-domain,
writer-population, paraphrase, mixed-authorship and time-shifted evaluations.
