# ALM-BUG-KILN-00015 — 金曜日 is taught with romaji "kinyoubi", which the engine converts to きにょうび (should be "kin-youbi")

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

## Observation
The Friday vocab card prints romaji "kinyoubi"; a learner who reads or types it gets きにょうび (ki-nyo-u-bi), not the correct きんようび.

Repro over http://localhost:8000/darmok/: view 金曜日 (week 7) -- card romaji is "kinyoubi". Type it in that word's typeback drill -> rejected.

## Notes
Confirmed by running DK.romajiToHiragana("kinyoubi", true) -> きにょうび. The engine supports the n' syllabic-n disambiguator (engine.js:68), but the authored romaji omits it, so "ny" is read as にゃ/にゅ... rather than ん+や. This is an authored-data typo distinct from the engine normalization bug.

Fix (data): change weeks07-09.js:211 romaji to "kin'youbi". A per-corpus round-trip oracle (romaji -> kana == v[1], whitelisting only the known engine long-vowel/n' cases) would have caught it at authoring time (captured as a requirement). Reported by the test-coverage lens; reproduced directly.
