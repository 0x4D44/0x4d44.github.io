# ALM-BUG-KILN-00033 — Motorsport article pages fail before rendering their body

- **State:** Closed
- **Priority:** Must
- **Severity:** High
- **Area:** news
- **Raised:** 2026-07-19
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
- **State history:** Open (2026-07-19, raised by Codex after Arthur's report)
- **State history:** Fixed (2026-07-19, Codex, commit 836b742; awaiting independent verification)
- **State history:** Closed (2026-07-19, independent Codex verifier, verified on origin/main 58682b8: all 50 pre-fix pages reproduced the recorded TypeError, all 50 post-fix pages rendered, the focused validator passed, and the original HTTP/browser repro passed)

## Observation

Open `news/article.html?id=mot-1903-paris-madrid-horse-tow` over HTTP. The Motorsport
story does not render. The browser console reports that `(a.body || []).some` is not a
function. A Motorsport article should display its headline, hero image and three body
paragraphs like every other Daily Flange story.

All 50 `mot-` articles reproduce the same failure. Their cards still appear on the
Motorsport category page because card rendering does not inspect the body structure.

## Notes

The Motorsport objects in `news/articles.js` store `body` as a single string with blank
lines between paragraphs. `news/news.js:renderArticle` requires `body` to be an array and
calls `.some()` and `.map()` directly. The existing static validator checked paragraph
counts by splitting strings but never invoked `NEWS.renderArticle`, so the incompatible
shape passed the integration gate.

Fix `836b742` normalises the 50 Motorsport bodies into paragraph arrays at their data
boundary. The validator now requires that canonical shape and renders every Motorsport
article page. The new renderer regression failed before the fix with the exact
`(a.body || []).some is not a function` exception and passes afterward. A representative
page was also served over HTTP and visually confirmed in headless Chrome with its hero,
caption and body paragraphs present.

Independent verification on `origin/main` commit `58682b8` confirmed the fix. A
fails-before oracle loaded the pre-fix `news/articles.js` from `836b742^` into the real
renderer: all 50 Motorsport pages threw the recorded `.some is not a function` error.
Against the fixed tree, all 50 rendered their headline, hero image, caption and every one
of their 150 body paragraphs. `node news/tests/validate-static.mjs` passed, and the exact
reported URL was served over HTTP and rendered successfully in headless Chrome.
