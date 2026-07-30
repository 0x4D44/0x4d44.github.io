# ALM-BUG-KILN-00006 — Answer grading rejects the romaji the app itself teaches (long-vowel / apostrophe / du-zu)

- **State:** Fixed
- **Priority:** Must
- **Severity:** Medium
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
On a typeback ("Type the Japanese for ...") exercise, typing the exact romaji printed on the vocab card is marked WRONG for ~20 of the 513 curriculum words, and the wrong grade then demotes that word's spaced-repetition stage.

Repro over http://localhost:8000/darmok/: reach any typeback drill for a katakana loanword -- e.g. コーヒー (card romaji "koohii"), ゲーム ("geemu"), タクシー ("takushii") -- and type the card's own romaji. Expected: accepted. Actual: "REVISION REQUIRED".

Verified by running the shipped engine (engine.js) directly -- three independent root causes in DK.normalizeAnswer:
1. LONG VOWEL (16 words): normalizeAnswer strips the ー mark (engine.js:108) but DK.romajiToHiragana renders "oo"/"ii"/"uu" as doubled vowel kana, so "koohii"->こおひい while the accepted こーひー->こひ. The two sides never meet.
2. APOSTROPHE (店員 "ten'in"): normalizeAnswer strips the apostrophe (engine.js:105) BEFORE romaji conversion, destroying the syllabic-n disambiguator that romajiToHiragana explicitly supports (engine.js:68): "ten'in"->てにん, not てんいん.
3. YOTSUGANA du/zu (続けます "tsuzukemasu"): Hepburn romanizes づ as "zu", but the R2H table maps "zu"->ず only, so "tsuzukemasu"->つずけます != つづけます.

## Notes
Root cause is DK.normalizeAnswer (engine.js:103-110) being asymmetric with the romaji IME it grades against. Same defect has a second face: because ー is deleted on BOTH sides, distinct taught words COLLIDE and are falsely ACCEPTED -- かれー ("curry") and かれ ("he") both fold to かれ; すきー ("skiing") and すき ("liked") both fold to すき -- so the grader accepts "curry" as the answer for "he".

Blast radius beyond the wrong mark: a rejected-but-correct answer calls gradeSRS->DK.srsAnswer(item,false) (engine.js:239-240), which does s = max(s-2,0) and increments lapses -- so being right silently sets the word's review schedule BACKWARDS.

Fix: normalize long vowels to a canonical long-vowel form on BOTH sides instead of deleting ー; run the apostrophe through (do not strip it before conversion); fold づ->ず (and ぢ->じ) in normalizeAnswer, or accept both. Also fix the two authored data typos this surfaces (see the furigana and kinyoubi bugs). Add a corpus round-trip oracle (see reqs). Found in the overnight multi-lens review; the long-vowel/apostrophe/du repros were reproduced directly against engine.js, and the false-accept collision was independently confirmed by an adversarial skeptic.

## Fix (2026-07-21)
`DK.normalizeAnswer` (darmok/engine.js) reworked so it is symmetric with the romaji
IME it grades against: the long-vowel ー is now **folded to a canonical doubled-vowel
form** (`foldLongVowels` + a `KANA_VOWEL` map) instead of deleted — so こーひー and card
romaji "koohii" both normalise to こおひい, and distinct taught words no longer collapse
(かれー→かれえ ≠ かれ, すきー→すきい ≠ すき). The apostrophe is kept through romaji
conversion (ten'in → てんいん) instead of being stripped first, and づ/ぢ are folded to
ず/じ so Hepburn "tsuzukemasu" matches つづけます. Corpus round-trip failures went 20→2;
the remaining two are authored-data typos tracked as KILN-00015 (kinyoubi) and a
counter-form card. Regression coverage: darmok/grading.test.mjs (fails on the pre-fix
engine, passes after), wired into `npm run build`/`npm test`. The two authored typos
(furigana KILN-00014, kinyoubi KILN-00015) are left to their own passes.
