# ALM-BUG-KILN-00014 — Two vocab entries have mis-split furigana -- wrong ruby on the card and a self-contradicting typeback hint

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
- **Area:** darmok
- **Raised:** 2026-07-13
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
Two words render furigana that does not match their kana, and one of them makes the typeback hint tell the learner to type an answer the grader then rejects.

Repro over http://localhost:8000/darmok/: view お茶 (week 1) -- the furigana over 茶 reads おちゃ instead of ちゃ. View 問題ありません (week 12) -- the ruby reads 問->と, 題->だい (should be もんだい); its ASK DATA hint says to type とだいありません, which the accept list [問題ありません, もんだいありません] rejects, so the app contradicts itself.

## Notes
Confirmed by running the engine over the corpus: the furigana regex KANJI_RUN (engine.js:129) captures only a kanji run + its [reading], so a leading hiragana is excluded. お茶[おちゃ] (weeks01-03.js:45) attaches the whole reading おちゃ to 茶 alone. 問[と]題[だい]ありません (weeks10-12.js:587) mis-splits 問題 (which reads もんだい).

Fix (data): change to お茶[ちゃ] and 問題[もんだい]ありません. Prevent recurrence with a corpus oracle asserting `DK.kataToHira(DK.readingForm(v[0]))` folds to `v[1]` for every entry (captured as a requirement). Reported by the test-coverage lens; the two entries were reproduced against the live rendering functions.

## Fix (2026-07-21)
Corrected the two mis-split furigana entries so the ruby run matches the reading:
`お茶[おちゃ]` → `お茶[ちゃ]` (weeks01-03.js) and `問[と]題[だい]ありません` →
`問題[もんだい]ありません` (weeks10-12.js). Recurrence guard: darmok/grading.test.mjs now
asserts `kataToHira(readingForm(v[0]))` folds to `v[1]` for every vocab entry (allowing only
a leading 〜 counter placeholder); it fails on either pre-fix entry.
