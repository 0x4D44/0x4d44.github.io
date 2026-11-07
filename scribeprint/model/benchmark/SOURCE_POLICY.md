# Human benchmark source policy

## Inclusion

A source is eligible only when all of the following are true:

1. Authorship is human by provenance, not inferred from a detector score.
2. The document predates 2022, or its historical provenance independently rules
   out contemporary generative-AI assistance.
3. A stable source-document identity exists.
4. The licence and permitted evaluation use are recorded.
5. Text can be rebuilt from a pinned source revision or an authorised local
   archive.
6. The source contributes a register or writer population not already
   overrepresented.

## Exclusion

Reject:

- post-cutoff material, even when it appears human;
- documents labelled through AI-detector consensus;
- synthetic, translated-by-model or paraphrased benchmark text;
- corrections or edited reference versions substituted for learner originals;
- repeated passages from the same source document;
- unknown-licence web scrapes;
- text that will also be used to train or calibrate the evaluated model;
- source collections whose provenance cannot survive a manual review.

## Independence

One row is selected per source document. Author and stratum caps reduce repeated
writers, channels, agencies and sites. Statistical reports still slice by source
because documents from the same collection are not perfectly independent.
Confidence bounds are never presented as stronger than the underlying source
independence supports.

## Freeze procedure

1. Review the source profile and licence table.
2. Resolve every remote revision to its immutable commit.
3. Build the text locally and run all automated audits.
4. Manually inspect a deterministic source-stratified sample, including the
   highest-scoring human rows once a model is evaluated.
5. Commit only the profile and text-free selection lock.
6. Add the lock to every later training-corpus overlap check.
7. Never change selected IDs under the same benchmark version; issue a new
   version instead.

A source metadata correction, takedown or licence concern invalidates the
implicated records and requires a versioned replacement rather than an in-place
silent edit.
