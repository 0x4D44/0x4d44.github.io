# Lessons learnt

Distilled, non-obvious gotchas for this repo. Newest first. Keep it short
(hard cap 20) — promote anything durable into `CLAUDE.md` instead.

- 2026-07-03 — `japanese-travel-rpg` (Nihon Quest, a DC export) wraps its whole
  UI in a **fixed 402x874 `IOSDevice` frame** (`ios-frame.jsx`) centred in a
  `min-height:100vh;padding:20px` body — so on any phone (viewport < ~914px) the
  frame overflowed and its pinned bottom tab bar dropped below the fold. Fix:
  cap the frame with `maxWidth:calc(100vw-40px)`/`maxHeight:calc(100dvh-40px)`
  (mockup size is a *max*, not a fixed size; `dvh` tracks the mobile URL bar,
  degrades to the fixed height on old browsers) + body `min-height:100dvh`. Also:
  its `sw.js` is **cache-first**, so a fix reaches installed PWAs only if you
  bump the `nihon-quest-vN` cache name — and `tests/self-check.mjs` asserts that
  exact string, so bump the SW cache and the test assertion together.
- 2026-07-03 — Verifying an animated / WebGL document (Three.js entries like
  `flight`, `emu-cab`, `night-cab`) with headless Chrome: `--dump-dom` NEVER
  returns — the page's perpetual `requestAnimationFrame` loop keeps virtual time
  alive, so the DOM dump (and `--virtual-time-budget`) waits forever and the
  harness kills it with an **empty** file. Use `--screenshot=out.png` instead: it
  fires on the `load` event regardless of the rAF loop and gives a visual
  boot/menu confirmation. Enable WebGL headless with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, and bound
  the run with a background watchdog `kill` (macOS has no `timeout`). The `flight`
  DC export also needs its `support.js` sidecar copied alongside `index.html` —
  the export's own integration note lists only the `.dc.html` + engine, but the
  `<head>` loads `./support.js`.
- 2026-07-03 — A DC design-tool export (`*.dc.html` + `support.js`) can be shipped
  **fully offline / zero-network** without a bundler: (1) vendor the *exact* unpkg
  React UMD bytes it names — the `sha384` SRI hashes baked into `support.js` still
  validate same-origin, so keep `integrity`/`crossorigin` and just repoint the URL;
  (2) self-host the Google Fonts (grab the `latin`+`latin-ext` woff2, rewrite
  `src:` to `./fonts/…`). No Babel is needed at runtime — the DC component is plain
  ES6 bound by `support.js`'s own `{{ }}` engine (not JSX), confirmed by net-log
  showing only react/react-dom fetched. Ship the readable `.dc.html` as `index.html`
  (+ `support.js` sidecar), not the 219 KB pre-bundled single file — far easier to
  edit (add PWA `<head>` tags + SW registration; swap the font `<link>`). Verify with
  `chrome --headless=new --log-net-log` and assert no unpkg/googleapis hosts appear.
- 2026-07-02 — Verifying this site's responsive layout with headless Chrome:
  `chrome --headless=new --window-size=390,H` does **not** give a 390px CSS
  viewport — headless-new clamps `innerWidth` to a **500px minimum**, and the
  `--screenshot` PNG is still only 390px wide, so content past 500px is rendered
  but cropped out of frame. That looks exactly like horizontal overflow but is a
  screenshot artifact. To shoot a true narrow layout use `--window-size ≥ 500`
  (e.g. 500 triggers the `max-width:560` mobile query with no cropping); measure
  real widths by screenshotting a page that prints `innerWidth`/`scrollWidth`.
- 2026-07-02 — `vamos-spanish` "design.zip" DC re-exports change **only**
  `index.html` (shipped in the zip as `vamos-spanish.dc.html`). The five sidecars
  (`support.js`, `lessons.js`, `lessons-extra-a/b.js`, `ios-frame.jsx`) come out
  byte-identical to what's committed, and the zip's `.thumbnail` is a design-tool
  WebP preview — not a site asset, so skip it. `diff` every file before copying,
  then cherry-pick just the HTML into `index.html`.
- 2026-07-02 — A CSS `@keyframes` that animates `transform` fully **replaces**
  an element's base `transform`, including the centring offset. A modal centred
  with `transform:translate(-50%,-50%)` + `animation` whose keyframes only set
  `translateY(…)` ends up anchored by its top-left corner at the viewport centre
  and gets chopped on narrow/mobile screens (with `fill:both` it stays wrong
  after the anim). Fix: bake the centring offset into every keyframe
  (`transform:translate(-50%,-50%) translateY(…)`), or centre via fl/positioning
  instead of transform. Hit both dialogs in `salient/` (win card + rules sheet).
- 2026-06-22 — The Quarto export emits some glyphs as `\uXXXX` in JSX **text**
  position (e.g. `<div>→</div>`), which React renders as the literal string
  `→`, not the arrow. On every re-import, grep each changed `.jsx` for an
  escape between tags (`>…\uXXXX…<`) and wrap it in braces (`{'→'}`) or use the
  literal glyph. Escapes inside JS string literals (`'✕'`) are fine. Verify
  with headless Chrome `--dump-dom | grep` for the real glyph vs the literal token.
- 2026-06-22 — Quarto re-imports come as a bundler export whose `sw.js` targets
  `./play.html` and **resets** the SW cache `VERSION`, and whose `manifest.json`
  sets `start_url: ./play.html`. Our Pages slug serves the shell as `index.html`,
  so **cherry-pick the `.jsx` only, keep our `sw.js`/`manifest.json`, and bump the
  `sw.js` VERSION forward** (never adopt the export's). The export is LF; the repo
  is CRLF — convert on install so `git diff` shows only real changes.
