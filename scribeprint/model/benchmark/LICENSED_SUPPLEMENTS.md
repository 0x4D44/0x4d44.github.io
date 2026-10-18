# Licensed benchmark supplements

Student writing is unusually important for an AI-writing detector and unusually
sensitive to licence, consent and provenance mistakes. Scribeprint therefore
supports authorised local corpora without redistributing them.

## Native-student JSONL

Set `SCRIBEPRINT_STUDENT_JSONL` to an authorised UTF-8 JSONL file. Each row must
represent one independently authored essay:

```json
{
  "id": "stable-corpus-id",
  "text": "The student's original essay...",
  "author_id": "pseudonymous-writer-id",
  "prompt_id": "prompt-07",
  "source_url": "optional provenance URL"
}
```

Requirements:

- The corpus owner must attest that every selected essay predates 2022 and was
  written without generative-AI assistance.
- `author_id` must be stable inside the corpus so the builder can cap repeated
  writers; it need not reveal a person's name.
- Corrections, model rewrites and teacher feedback must not replace the original
  student submission.
- The local licence must allow this research evaluation. The output remains
  local even when the source licence permits broader redistribution.

The profile currently expects 1,000 essays, at most two per writer and at most
250 per prompt.

## Cambridge FCE learner English

The Universal Dependencies English-ESL project publishes annotations but not
FCE text because the Cambridge Learner Corpus release requires a separate
licence agreement. Obtain the authorised `fce-released-dataset` locally, then
set:

```bash
export SCRIBEPRINT_FCE_DIR=/absolute/path/to/fce-released-dataset/dataset
```

The adapter recursively reads the source XML, extracts `answer1` and `answer2`,
keeps the learner's original `<i>` text and omits the editor's `<c>` correction.
It records a hashed candidate identity and native-language stratum, while the
raw essay remains local.

The full profile expects 1,000 answers, at most two per candidate and at most
150 per native-language stratum. The source predates contemporary generative
language models, but the local licence agreement remains binding.

## What CI uploads

For both supplements, CI and local release tooling may retain only:

- corpus and source-document identifiers;
- immutable file or directory hashes;
- transformed-text SHA-256 hashes;
- word counts, strata and pseudonymous author hashes;
- licences and audit summaries.

It must not upload the essay text, unredacted candidate metadata or the licensed
source archive.
