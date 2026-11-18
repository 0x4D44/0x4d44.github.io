# ALM-BUG-KILN-00048 — Darmok minute vocab card prints romaji -fun/-pun, which the grader rejects

- **State:** Closed
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T233511Z-p21807-n446239000-c1 branch=task/bug-ALM-BUG-KILN-00048-run-fix-20260730T233511Z-p21807-n446239000-c1 code=c73309d gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit c73309d verified; the corpus now rejects 0 of 514 card rōmaji and the grading oracle's whitelist exemption was removed as the bug required)

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

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `c73309d`). **The recorded symptom no longer reproduces.**

**The card was split into its two taught readings** (`darmok/weeks07-09.js:157`):

```
["〜分[ふん]","ふん","-fun","minute (-fun reading)","counter"]
["〜分[ぷん]","ぷん","-pun","minute (-pun reading)","counter"]
```

**Every probe from the observation now grades correctly:**

```
answersMatch("fun")  = true (-fun)      answersMatch("ふん") = true (-fun)
answersMatch("pun")  = true (-pun)      answersMatch("ぷん") = true (-pun)
```

The bug recorded `pun` and `ぷん` as *rejected*; both are now accepted, and each is taught on its
own card.

**Whole-corpus oracle:** `CURRENT corpus 514  rejects: 0` — down from the 1 survivor this bug was
raised for. Every entry now accepts the rōmaji its own card prints, which is this bug's Expected.

*Noted for the record:* `answersMatch("-fun/-pun")` is still false. That is correct and not a
residual — the slash-alternated string is no longer printed on any card, so no learner can type
it from what they see.

**The whitelist was removed, as this bug explicitly required.** `darmok/grading.test.mjs` dropped
its `known = new Set(['-fun/-pun'])` exemption and the test is renamed to "corpus round-trip:
typing every card rōmaji is accepted" — so the oracle now covers all 514 entries with no
exclusions.

**Proven to bite (fails-before / passes-after).** Restoring the single `-fun/-pun` card on a
scratch copy fails that oracle with the recorded string:

```
1 word(s) reject their own card rōmaji: -fun/-pun vs ふん (minute)
```

**Gates:** root `npm test` and `npm run build` both exit 0 on this tree.
