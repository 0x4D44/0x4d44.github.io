# ALM-BUG-KILN-00048 — Darmok minute vocab card prints romaji -fun/-pun, which the grader rejects

- **State:** Open
- **Priority:** Could
- **Severity:** Low
- **Area:** darmok
- **Raised:** 2026-07-30
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00006** (2026-07-30). That fix took the corpus from 20 rejected entries to 1. This is the survivor.

The `minute` vocab entry at `darmok/weeks07-09.js:157` — `〜分[ふん]` — prints its romaji as the literal string `-fun/-pun`. A learner who types what the card shows is marked WRONG, and so is the taught alternate reading:

```
CURRENT corpus 513  rejects: 1
(A) IME OFF rejected:  -fun/-pun |kana=ふん |jp=〜分[ふん] |en=minute
(B) IME ON  rejected:  -fun/-pun -> IME "ーふん/ーぷn"

answersMatch("fun")       = true
answersMatch("ふん")       = true
answersMatch("-fun/-pun") = false
answersMatch("pun")       = false
answersMatch("ぷん")       = false
```

**Expected:** typing the romaji printed on the card is accepted, as it is for the other 512 entries.

## Fix

<unfixed — raised only>

## Notes

This is a **data-authoring** residual, not an engine defect — the KILN-00006 normalisation fix is correct and was verified root-cause. The card is trying to teach a counter with two sandhi readings (`ふん` / `ぷん`) in a single romaji field that the grader treats as one typeable answer.

Two plausible directions: split it into two entries (`〜分[ふん]` / `〜分[ぷん]`), or give the entry an `accept` list carrying both readings so the printed string stays pedagogically useful while both readings grade correctly.

Note `darmok/grading.test.mjs` currently excludes this entry from its `known` whitelist, so the corpus round-trip oracle cannot regress on it — remove it from the whitelist as part of the fix so the oracle covers all 513.
