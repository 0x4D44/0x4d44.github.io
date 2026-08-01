# ALM-BUG-KILN-00015 — 金曜日 is taught with romaji "kinyoubi", which the engine converts to きにょうび (should be "kin-youbi")

- **State:** Closed
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — card romaji is now kin'youbi and round-trips through both the converter and the IME path)

## Observation
The Friday vocab card prints romaji "kinyoubi"; a learner who reads or types it gets きにょうび (ki-nyo-u-bi), not the correct きんようび.

Repro over http://localhost:8000/darmok/: view 金曜日 (week 7) -- card romaji is "kinyoubi". Type it in that word's typeback drill -> rejected.

## Notes
Confirmed by running DK.romajiToHiragana("kinyoubi", true) -> きにょうび. The engine supports the n' syllabic-n disambiguator (engine.js:68), but the authored romaji omits it, so "ny" is read as にゃ/にゅ... rather than ん+や. This is an authored-data typo distinct from the engine normalization bug.

Fix (data): change weeks07-09.js:211 romaji to "kin'youbi". A per-corpus round-trip oracle (romaji -> kana == v[1], whitelisting only the known engine long-vowel/n' cases) would have caught it at authoring time (captured as a requirement). Reported by the test-coverage lens; reproduced directly.

## Fix (2026-07-21)
Changed the Friday card's rōmaji from `kinyoubi` to `kin'youbi` (weeks07-09.js) so
`DK.romajiToHiragana` reads the ん correctly (n' syllabic-n) and yields きんようび. The
corpus round-trip oracle in darmok/grading.test.mjs no longer whitelists kinyoubi, so it
now enforces the fix (only the slash-alternated `-fun/-pun` counter card remains excluded).

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `62ec7e8`.

**Original observation re-checked — resolved.** Driving the real converter and grader:

```
entry: ["金曜日[きんようび]","きんようび","kin'youbi","Friday","time"]
romajiToHiragana(card romaji): きんようび  | card kana: きんようび
romajiToHiragana("kinyoubi") [the OLD value]: きにょうび
typeback accepts card romaji? true
```

Confirmed independently: `darmok/weeks07-09.js:211` reads `["金曜日[きんようび]", "きんようび", "kin'youbi", "Friday", "time"]`. Also accepted along the IME-on path (typed character-by-character through `imeConvert`). Regression coverage `darmok/grading.test.mjs` corpus round-trip passes, and `kinyoubi` is no longer in its `known` whitelist, so the entry is genuinely enforced.
