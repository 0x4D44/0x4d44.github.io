# Scribeprint human false-positive benchmark

This directory defines the held-out **human-only** benchmark used to measure how
often Scribeprint wrongly calls human writing AI-generated. It is deliberately
separate from every training corpus. The repository contains the builder,
profiles and selection rules, but **never the source text**.

## Why this benchmark exists

Balanced human/AI accuracy can conceal the error that matters most in practice:
a confident accusation against a human writer. The benchmark therefore freezes
independent human source documents, retains an inconclusive decision region and
reports false-positive confidence bounds overall and by writing population.

The benchmark is not a source of hard negatives for the same model version. A
future training run must pass its corpus through the frozen selection lock's
overlap check before fitting:

```bash
scribeprint-human-benchmark overlap \
  --lock runs/open-core.lock.jsonl \
  --training training.jsonl
```

A benchmark document may enter a later training generation only after that
benchmark version has been permanently retired and replaced by an independent,
time-shifted holdout.

## Profiles

### `open-core-v0.1.json`

A 10,000-document, rebuildable core with a pre-LLM cutoff of 31 December 2021:

| Slice | Documents | Sources |
|---|---:|---|
| Creative books | 3,250 | Public-domain Project Gutenberg works |
| Journalism | 800 | Openly licensed Common Pile news sources |
| Informal online writing | 2,000 | Public-domain Ubuntu IRC channel-days |
| Technical prose | 1,950 | 450 Python PEPs + 1,500 technical Stack Exchange threads |
| Professional government writing | 1,000 | Non-SEC Regulations.gov documents |
| Business-regulatory writing | 1,000 | SEC Regulations.gov documents |

The core establishes source, genre and register diversity, but it is **not yet a
complete release benchmark** because native-student and learner-English writing
require separately licensed corpora.

### `full-v0.1.json`

The 12,000-document release profile adds:

- 1,000 native-student essays supplied as an authorised local JSONL corpus.
- 1,000 learner-English essays extracted from a locally licensed Cambridge FCE
  release.

See [`LICENSED_SUPPLEMENTS.md`](LICENSED_SUPPLEMENTS.md). These texts are not
committed, cached in release artifacts or silently downloaded.

## Construction rules

For every source the builder:

1. Resolves the requested dataset revision to an immutable commit and records it.
2. Rejects documents after the profile cutoff unless the source is demonstrably
   historical, such as public-domain books or the pre-2011 FCE corpus.
3. Requires a declared licence and source provenance.
4. Rejects explicit AI self-identification, missing dates where a date is
   mandatory, URL-heavy material, highly duplicated lines and malformed text.
5. Selects at most one passage per source document.
6. Uses a deterministic mid-document window rather than always taking headers.
7. Enforces author and source-stratum caps where metadata permits.
8. Removes exact and high-overlap five-word-shingle duplicates during selection.
9. Re-runs a full duplicate, date, licence, hash and quota audit before writing.
10. Emits an ID/hash selection lock and deletes source text before CI artifact
    upload.

The lock records enough information to reproduce and exclude the benchmark, but
contains no prose. Common Pile metadata can still contain licensing mistakes;
manual source review remains a release gate rather than being replaced by an
automated licence string check.

## Build

```bash
python -m pip install -e './scribeprint/model[benchmark,dev]'

scribeprint-human-benchmark build \
  --profile scribeprint/model/benchmark/profiles/open-core-v0.1.json \
  --output runs/open-core.jsonl \
  --manifest runs/open-core.manifest.json \
  --lock runs/open-core.lock.jsonl \
  --audit runs/open-core.audit.json
```

`open-core.jsonl` is ephemeral and must not be committed or uploaded. The
manifest, lock and audit are safe to retain because they do not contain text.

## Evaluate a frozen model

```bash
scribeprint-human-evaluate \
  --model runs/scribeprint-model.joblib \
  --input runs/open-core.jsonl \
  --output runs/open-core-evaluation.json
```

The report includes false positives, inconclusive calls, score quantiles,
one-sided 95% Clopper-Pearson upper bounds and slices by domain, writer
population and benchmark source. At 10,000 independent human documents, zero
observed false positives corresponds to an upper one-sided 95% rate of about
0.03%; a non-zero count is evaluated exactly rather than rounded away.

## Release gates

A benchmark build is **construction-ready** only when:

- every open-core quota is met;
- source IDs and text hashes are unique;
- no near duplicate exceeds the frozen threshold;
- all dated material is on or before the cutoff;
- every row has a licence and valid provenance;
- text hashes and word counts reproduce exactly.

It is **production-coverage-ready** only when the native-student and
learner-English supplements also meet their quotas. Passing either build gate
does not imply that a detector passes the benchmark.
