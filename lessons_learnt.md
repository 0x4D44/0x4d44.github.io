# Lessons learnt

Distilled, non-obvious gotchas for this repo. Newest first. Keep it short
(hard cap 20) — promote anything durable into `CLAUDE.md` instead.

- 2026-07-11 — Headless drives that "play" a document with synthetic `el.click()` /
  `dispatchEvent` bypass browser hit-testing entirely, so they cannot catch the whole
  class of "invisible thing eats real taps" bugs. `brilliancy` shipped its full 8-round
  auto-play green while `#overlay { display: grid }` was silently defeating the
  `hidden` attribute (an author `display` beats the UA `[hidden]` rule) — a transparent
  `position:fixed; inset:0; z-index:50` layer that would have softlocked every real
  user at the first tap. Two rules: any element you hide via the `hidden` attribute but
  style with `display:` needs an explicit `#el[hidden]{display:none}`; and every drive
  script should assert `getComputedStyle(overlay).display === "none"` plus
  `document.elementFromPoint(...)` actually returning the control it aims at — that
  probe is cheap and catches what synthetic clicks never will. (Related: CSS selectors
  can't reach inside `<use>` shadow clones either — style symbol innards with inline
  `style="fill:var(--cut)"`, custom properties do inherit through the boundary.)
- 2026-07-11 — In the hand-built vanilla-JS games (`tidecall`, and the same shape
  elsewhere), a monolithic `render()` that `replaceChildren()`s each subtree on every
  state tick is the flicker engine: every rebuilt node with an `animation:` (e.g.
  `.playing-card { animation: card-in }`) *restarts* that animation, so the player's
  hand re-deals itself every time an opponent bids or plays — and, conversely, any
  `transition:` written to animate a state change (the tide marker advancing, a card's
  hover lift) is *dead*, because a freshly-inserted node has no prior computed style to
  transition from. Fix by reconciling: keep a `Map` of id→node, reuse nodes and only
  toggle their classes/attributes, and `replaceChildren()` only when a stable key
  changes. Gotcha: card ids repeat across rounds (`S14` is the ace every deal), so key
  the hand cache by round index too, or round N+1 silently reuses round N's nodes.
  Switch per-node click handlers to one delegated listener on the container once nodes
  outlive a render, or they stack up. Card *size* is best driven the same structural
  way — `.hand{container-type:inline-size}` + a JS-set `--hand-count`, so a 3-card round
  deals big cards and an 8-card round packs down, and put the card's internal glyphs in
  `em` against `font-size:var(--card-w)` so a bigger card is genuinely more legible, not
  the same small print enlarged. None of this is caught by `validate-static.test.js`
  (CSS and renderHand are unguarded) — verify in a real browser at 360×640 and 390×844,
  and bump the cache-first `sw.js` `CACHE` version or returning visitors never see it.
- 2026-07-11 — Design-Canvas (DC) export documents (inline `style=""` on every
  element, `support.js` runtime) frequently ship with **no responsive media
  queries at all** — desktop-only. On a real phone the asymmetric grids collapse
  their flexible column to near-0px (cruise-propulsion's hero prose set one word
  per line; its simulator form column was 13px wide). Fix with an added `<style>`
  block of `@media (max-width: …)` rules: inline styles outrank any selector, so
  the reflow rules **must** use `!important`, and add class hooks to the grid
  divs rather than editing their inline styles (keeps desktop bit-for-bit
  identical, since the hooks only bite inside the query). Also watch content-box
  overflow — an element sized `width:min(100%,Npx)` with padding+border measures
  `100% + padding + border`, invisible on desktop (gap absorbs it) but a sideways
  scroll on a phone; `box-sizing:border-box` fixes it.
- 2026-07-11 — Auditing these DC docs headless is booby-trapped twice over.
  (1) `chrome.kill()` on Windows leaves the renderer children alive holding the
  debug port; a *derived* debug port then attaches to a stale browser and results
  go non-deterministic — use an OS-assigned free port and `taskkill /T /F` on
  your own pid tree ONLY (dev boxes routinely have dozens of the user's real
  Chrome processes; never blanket-kill chrome.exe). (2) The page pulls React from
  unpkg (blocked in-sandbox) and compiles a large template, so a boot check at a
  fixed delay races the compiler and cries "blank page" under load — inject the
  vendored React UMD (`broadband-speed-checker/vendor/*.js`; `loadReactUmd()`
  short-circuits on `window.React`) and *poll* for the ready condition, don't
  sample once. A flaky oracle invents phantom root causes — twice I wrongly
  blamed CSS for what was harness flake.
- 2026-07-10 — Service-worker `CacheStorage` is shared across the whole
  `0x4d44.github.io` origin, not isolated by the worker's `/slug/` scope. Each
  document PWA must namespace its cache and delete only stale keys with its own
  prefix during activation; filtering every key except the current cache wipes
  the offline assets of sibling almanac apps. Its fetch handler should likewise
  reject URLs outside `self.registration.scope`, query only its named cache,
  and reserve the app-shell fallback for in-scope navigations. Add per-document
  regression assertions whenever a new service worker ships.
- 2026-07-09 — A Workflow lens agent that dies mid-run (account session
  limit, auth drop) surfaces in the tool result's `<failures>` list, but the
  script's own aggregation happily returns its stage as an EMPTY findings
  array — indistinguishable from a clean pass. Never treat an empty lens
  result as "no findings" without checking `<failures>`/journal.jsonl first;
  re-run the dead lenses (by hand if limits persist).
- 2026-07-08 — `Line Rate UI Overhaul.zip` is a Design Canvas export
  (`Line Rate.dc.html` + `support.js` + `.thumbnail`), not a vanilla app
  patch. Ship the `.dc.html` as `broadband-speed-checker/index.html`, skip the
  thumbnail, self-host the DC runtime's React/Babel and Google-font assets, and
  keep production-specific behavior that the export resets for preview:
  `settings.live` should default true and the storage key remains
  `0x4d44.broadband.v1` so existing browser-local history survives.
- 2026-07-07 — Replacing or removing a document that shipped a
  `tests/validate-static.mjs` (or any per-doc test) silently breaks
  `npm test` / `npm run build`: the **root `package.json`** hard-codes each
  doc's test path into a single `&&`-chained `test`/`build` script
  (`… && node <slug>/tests/validate-static.mjs && …`), so deleting the file
  leaves a dangling `node` call that exits non-zero and fails the whole gate.
  When you retire/replace a doc, prune its segment from **both** scripts. (Hit
  swapping `cruise-propulsion`'s hand-built vanilla-JS essay for its DC-export
  rebuild — same slug, new `index.html` + `support.js`.)
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
