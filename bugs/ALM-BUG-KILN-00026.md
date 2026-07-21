# ALM-BUG-KILN-00026 — Homepage always shows at least one story twice -- feature bands are not deduped against the top block

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
- **Area:** news
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
On every hourly render of the Daily Flange homepage, at least one story that already appears in the hero / lead row / "More top stories" / "Around The Flange" blocks is repeated inside a category feature band lower down the page.

Repro over http://localhost:8000/news/: load the homepage and scan for a repeated headline; it is present on every load. Verified by simulation over 48 consecutive hourly seeds against the current 355-article corpus: 48/48 renders contain a feature-band story that is also in the top block (e.g. seed 1000000: "International border found to have quietly relocated 200 metres..." appears in both).

## Notes
Confirmed by replicating news.js's exact hashing + seeded shuffle. renderHome builds the top block from seq[0] (hero), seq[1..2] (lead row), seq[3..8] ("More top stories", news.js:338) and seq[9..16] ("Around The Flange", news.js:369). The two feature bands (news.js:343 and 358) then do seq.filter(a => a.category === featCat).slice(0,3) with NO exclusion of the ids already placed above. With 10 categories over 355 articles (~35 per category), the top 17 of the shuffled sequence almost always already contains some featCat/featCat2 stories, so a band re-prints one. It is cosmetic (nothing breaks) but 100% reproducible and on the primary page, which undercuts the "reshuffles like a real news site" illusion the page is going for.

Fix: track a Set of already-emitted ids as renderHome builds the page and filter each subsequent band/list against it (e.g. seq.filter(a => a.category === featCat && !used.has(a.id))), adding ids to the set as they are emitted. The "Most read" sidebar is intentionally seeded differently and can stay as-is. Found in the deliberate news/ review pass; reproduced deterministically.

## Fix (2026-07-21)
`renderHome` now tracks a `used` set of every story id placed in the top block (hero, lead
row, "More top stories") and both feature bands, and filters each subsequent band and the
"Around The Flange" list against it — so a category feature band no longer reprints a story
already shown above. The "Most read" sidebar and the ticker stay intentionally separate.
Regression: news/tests/validate-static.mjs renders the homepage across 24 hour-seeds and
asserts the `<main>` column never repeats a story.
