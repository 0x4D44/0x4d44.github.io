# ALM-BUG-KILN-00033 — Motorsport article pages fail before rendering their body

- **State:** Open
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
