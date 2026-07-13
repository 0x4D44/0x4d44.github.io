# ALM-REQ-KILN-00002 — Add an engine-level corpus-oracle test for the darmok learning app

- **State:** Draft
- **Priority:** Should
- **Area:** darmok
- **Raised:** 2026-07-13
- **Implemented-by:** —
- **Satisfied-by:** —
- **Violated-by:** —
- **Flow:** light
- **Claimed-by:** —
- **Owner:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner since:** -
- **Owner until:** -
- **Auto attempts:** 0
- **State history:** Draft (2026-07-13, captured by Claude from the overnight CR review of darmok/)

## Statement
The `darmok/` app must ship an engine-level oracle test (alongside the existing
`darmok/kanji.test.mjs`, wired into the repo-root `package.json` `test`/`build`
scripts) that exercises the pure functions in `darmok/engine.js` against the whole
513-entry curriculum corpus, so that an authored-data typo or an answer-grading
regression is caught by `npm test` rather than by a learner.

## Rationale
`darmok/engine.js` (~500 lines: the romaji→kana IME, answer normalization/matching,
furigana split, SRS scheduler, exercise generation) and `darmok/app.js` (~1200
lines) have **zero** test coverage. The only test, `kanji.test.mjs`, checks the
kanji *data* well-formedness and one `rubyK` assertion. The engine is pure and
DOM-free, so corpus properties are cheap to assert — and the overnight review found
four distinct real defects a handful of such assertions would each have pinned at
authoring time (ledger bugs ALM-BUG-KILN-00006, -00014, -00015, -00013). This is a
durable testability gap, not a one-off: the curriculum is edited continuously, and
every edit is currently unguarded.

## Oracle
Add `darmok/engine.test.mjs` (node:test, DOM-free, load engine.js + weeks*.js +
kanji.js the way kanji.test.mjs does) asserting, over `DK.allVocab()`:
1. **Romaji round-trip** — `DK.romajiToHiragana(v[2].toLowerCase(), true) === v[1]`
   for every entry, whitelisting only the known engine long-vowel/`n'` cases until
   those are fixed (catches typos like `kinyoubi`).
2. **Furigana ↔ kana** — `DK.kataToHira(DK.readingForm(v[0]))` folds to `v[1]` for
   every furigana-bearing entry (catches mis-split ruby like `お茶[おちゃ]`).
3. **normalizeAnswer injectivity** — no two entries with different kana readings map
   to the same `DK.normalizeAnswer` output (catches false-accept collisions such as
   かれー vs かれ).
4. **DK.load totality** — for a set of partial/hostile stored payloads (`srs:null`,
   `done:null`, `medals:null`, string `xp`), `DK.load()` returns well-typed
   containers and `DK.srsDue(P)` does not throw.
Each property is a few lines and fails loudly on the exact class of defect it guards.
