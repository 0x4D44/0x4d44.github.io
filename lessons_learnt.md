# Lessons learnt

<!-- lessons-format: index-v1 -->
<!-- Each entry's FIRST line is a self-contained nugget: surprise + fix + file:symbol
pointer, <=~120 chars, plain text (no backticks). Indented continuation lines are detail —
kept here for lookup but NOT injected by the mdminder SessionStart hook (it injects the
nugget lines only). Add new lessons at the TOP (newest-first). NEVER drop a lesson to make
room - always prepend. Aim for ~25 entries; past ~40 say it is due a prune rather than
pruning unasked, since /prune-lessons-learnt is a separate human-invoked pass. The hook
injects only the newest 30 nuggets (or 4 KiB), so entries past that stay here for lookup
and cost a session nothing. Durable project facts belong in CLAUDE.md (repo) or
~/.claude/CLAUDE.md (global), not here. -->

- 2026-08-26 - After countdown evidence, restart the browser; reload can retain stalled GL (tests/shoot.mjs:main)
  OxAlphaRally's isolated gravel capture passed, but the full corpus stalled twice after
  photographing the start-line countdown. Reloading the app still stalled. Closing the
  capture harness and opening a fresh browser made the exact two-shot sequence pass while
  leaving the deliberately stateful jump-to-landing pair in one process.

- 2026-08-25 - Bloom invents clipping the scene never had; test with bloom off before hunting geometry (render.js:BRIGHT_FRAG)
  OpusRally showed white discs that came and went on distant hillsides. With the
  bloom weight set to 0 the scene produced ZERO near-white pixels there over 180
  frames; with it on, a 251x9 px sliver of road 1113 m away smeared into a 56 px
  disc whose every pixel clipped to 255. The scene was never blown - the blur
  manufactured the white. A single-tap bright pass passes an outlier through
  unbounded, so the fix is a Karis average (weight each tap 1/(1+luma)) in the
  prefilter: extent, not magnitude, separates an aliased fragment from a real light
  source. A flat brightness ceiling cannot do it - the sun's bloom source is orders
  of magnitude hotter than the artefact, so every ceiling between 6 and 30 gave
  byte-identical output.

- 2026-08-25 - Bisect a transient render artefact by redrawing the SAME frame with dt=0 and the game's own args (render.js:update)
  An artefact firing on 3 frames in 130 cannot be bisected by hiding a group and
  comparing the next screenshot - every result is inside the noise, and successive
  runs "proved" dust, debris, marks and scenery guilty in turn. Wait until it is on
  screen, then hide one group and re-render that same frame with dt = 0. The control
  is the whole test: the first version passed alpha = 1 instead of the physics
  interpolation factor the game had just used, which moved the camera by centimetres
  and erased the artefact on its own, making every group look guilty. Wrap
  renderer.update to capture its exact argument object and reuse it, then verify the
  control redraw reproduces the artefact before believing any difference.

- Audit a defect list against the code BEFORE fixing it: 10 of opus-rally's 13 OUTSTANDING
  items were already fixed in the OxAlphaRally seed; only live verification (a probe script
  plus test-name greps) told which 3 needed work. Reading a symbol is not verifying it —
  stage.js:1753's `a` looked like the lateral-only bug and was already the fix.
- Sub-agent Task results here return empty ~50% of the time while the work is real (or
  sometimes absent): verify via git status + running the suites, never via the report; and
  demand "never end without a report" in every brief.

- 2026-07-31 — innerWidth hides page overflow; measure scrollWidth-clientWidth and bisect subtrees (tests/responsive.test.mjs)
  Horizontal overflow is invisible to both `innerWidth` and a DOM scan; measure
  `documentElement.scrollWidth - clientWidth` and bisect
  (`tests/responsive.test.mjs`). Under Chrome's mobile emulation `innerWidth` is the
  scaled *visual* viewport, so a page 1020px too wide measures as **0** — that is how
  30 of 129 documents stayed broken on phones while looking fine at 768px. Scanning
  element rects is no better: a `<pre>` with `white-space:pre` and `overflow:visible`
  has a border box that fits while its text hangs outside; an absolutely-positioned
  child escapes an `overflow:hidden` ancestor that isn't its containing block; and a
  decorative `::before{inset:-40px -80px 0}` has no element to measure at all
  (`win2k/w2k.css:.hero`). Find the real culprit by hiding one subtree at a time and
  watching `scrollWidth` — it names the box in seconds and never lies about clipped
  descendants.
- 2026-07-30 — SVG transform scales about the viewBox until transform-box:fill-box (arran-deep-time/arran.css .route-pin circle)
  CSS `transform` on an SVG shape scales about the whole viewBox, not the shape, until
  you set `transform-box:fill-box` (`arran-deep-time/arran.css:.route-pin circle`). An
  SVG element's default `transform-box` is `view-box`, so the familiar
  `transform-origin:center;transform:scale(1.15)` resolves "center" against the map, not
  the circle: Arran's selected route pin flung its disc 49.5px (desktop) / 53.0px
  (tablet) / 40.9px (mobile) away from its own number — further than the pin's 31px
  radius, so the digit landed outside the disc, and every pin did the same on hover and
  focus. Nothing catches this but a real browser measuring the two rects, and the sibling
  trap is that the *unselected* pins measure perfectly, so eyeballing "do the pins look
  right" passes. Grep any SVG-heavy document here for `transform:` in CSS and check each
  one sets `transform-box`. Two more from the same pass: **a new document is not
  integrated just because `data.js` has an entry** — this one arrived green, shelved
  twice and tagged correctly, yet shipped no `/almanac-back.js` include (126 of 127
  documents carry it), put its own duplicate back link *and* its skip link under where
  that pill lands (ALM-BUG-KILN-00039 again), and claimed 18 minutes against 3000 words
  when the catalog runs at ~220 wpm; `arran-deep-time/tests/validate-static.mjs` asserts
  all of it and is the cheap thing to copy for the next document. And when a `words`
  figure is in doubt, don't estimate it from source — render the page, walk every
  interactive state and take the union of distinct `innerText` lines; naive
  string-literal extraction from the same app.js gave 2222 or 3838 depending purely on
  how strict the filter was, against a rendered 2931.
- 2026-07-30 — Tests pass an unfair game; assert graph distances and conditional win rates (game-of-dracula/engine.js EDGE_LIST)
  A penalty square 3 stones from HOME made being bitten a 72% win — measure outcome
  rates (`game-of-dracula/engine.js:EDGE_LIST`). The rule text said "victims are
  carried to the vault" and the code did exactly that; the defect was purely the board
  graph, which wired the vault into the left HOME run three stones from escape while the
  START stones sat 11–13 away. Since every red sector moves a guest exactly 3 or 4, both
  counts landed on the doorway. No unit test could see it — all 18 passed, and the
  shipped 5000-game simulation reported zero stalls — because "did the game finish" is
  not "is the game fair". What found it was a *differential* measurement: win rate
  conditioned on having been penalised (72.3% vs 14.3%; now 23.3% vs 25.2%). For any
  game doc, assert on graph distances between the special squares and the win condition,
  and on conditional win rates, not just on completion. Two related traps in the same
  pass: a residual "seat 3 wins more" signal is worth decomposing into wins-by-seat vs
  wins-by-offset-from-opener before calling it bias — here the real effect was a 32.6%
  vs 19.0% first-mover advantage inherent to a race, plus a *documented* seat-order
  tie-break; and seeding xorshift32 with a raw small "night number" makes the very first
  draw degenerate (every seed <1000 opened seat 1, seat 4 never opened under 10000), so
  avalanche the seed — but note that mixing breaks `new RNG(rng.state)` as a way to
  round-trip a generator, which is exactly what the test helpers used to predict the next
  spin (`RNG.fromState` now exists for that, and `Game.restore` was already hand-rolling
  the overwrite).
- 2026-07-26 — Editing y after arc-length resampling inflates g ~3x; re-resample after (iron-vertex/track.js relaxProfile)
  Edit y after arc-length resampling → uneven spacing → curvature ÷ nominal ds
  overstates g ~3x (`iron-vertex/track.js:relaxProfile`); re-resample after. This one
  defect masqueraded as three unrelated ones — a spacing-uniformity failure, wrong g
  readings, and "generation is too timid" (loops kept being rejected as too violent by a
  budget fed with inflated numbers). General rule for these procedural-geometry docs: any
  pass that MOVES sample positions invalidates every quantity derived from the sample
  spacing, so re-establish the invariant before measuring anything. More broadly, the
  split that made all of this findable was keeping the generator and physics in a pure
  ESM module (no Three.js, no DOM) with the renderer as a thin consumer: eight
  substantive defects — a role/parameterisation mismatch across a geometry splice, a lift
  released while still climbing, a 30g pull-out, a loop pinched by pouring the base
  gradient into its forward axis, a 140°-in-3m snap roll — were all caught by
  `node --test` in milliseconds. Verify by simulation, not by heuristic: `buildTrack`
  rides its own finished track and retries until the train demonstrably completes the
  circuit.
- 2026-07-13 — /deep-review on an empty diff silently reviews the last commit; pass an explicit file slice for an area review
  The `/deep-review` workflow is **diff-oriented**: run from a fresh worktree off
  `origin/main` (empty diff), it silently retargets to the most recent *commit* instead
  of erroring. A darmok area-review launched this way reviewed the latest `news`
  article-drop commit instead — all 37 agents, wrong slice. For an AREA review (a
  first-ever pass over existing code, not a change review), don't use the diff path:
  hand-roll the fan-out and pass the **explicit file slice** (absolute paths + "ignore
  git history") as args, or the lenses review whatever the last commit touched. The
  misfire's findings can still be real — verify and file them, but don't log that area as
  reviewed. Separately: for the pure engines in these vanilla-JS docs
  (`darmok/engine.js`), stop *guessing* at bugs (my unanswerable-typeback / timer-leak
  guesses were all refuted) and instead run **differential oracles** over the whole
  corpus with `node` — that is what surfaced that 20/513 words reject the exact rōmaji
  the card teaches (asymmetric `ー`/apostrophe/`づ` folding in `normalizeAnswer`).
- 2026-07-11 — Synthetic el.click() bypasses hit-testing; assert elementFromPoint hits the control in drive scripts (brilliancy)
  Headless drives that "play" a document with synthetic `el.click()` / `dispatchEvent`
  bypass browser hit-testing entirely, so they cannot catch the whole class of "invisible
  thing eats real taps" bugs. `brilliancy` shipped its full 8-round auto-play green while
  `#overlay { display: grid }` was silently defeating the `hidden` attribute (an author
  `display` beats the UA `[hidden]` rule) — a transparent
  `position:fixed; inset:0; z-index:50` layer that would have softlocked every real user
  at the first tap. Two rules: any element you hide via the `hidden` attribute but style
  with `display:` needs an explicit `#el[hidden]{display:none}`; and every drive script
  should assert `getComputedStyle(overlay).display === "none"` plus
  `document.elementFromPoint(...)` actually returning the control it aims at — that probe
  is cheap and catches what synthetic clicks never will. (Related: CSS selectors can't
  reach inside `<use>` shadow clones either — style symbol innards with inline
  `style="fill:var(--cut)"`, custom properties do inherit through the boundary.)
- 2026-07-11 — replaceChildren() per tick restarts animations and kills transitions; reconcile via an id->node Map (tidecall)
  In the hand-built vanilla-JS games (`tidecall`, and the same shape elsewhere), a
  monolithic `render()` that `replaceChildren()`s each subtree on every state tick is the
  flicker engine: every rebuilt node with an `animation:` (e.g.
  `.playing-card { animation: card-in }`) *restarts* that animation, so the player's hand
  re-deals itself every time an opponent bids or plays — and, conversely, any
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
- 2026-07-11 — Design-Canvas exports ship no media queries; add @media rules with !important, as inline styles outrank them
  Design-Canvas (DC) export documents (inline `style=""` on every element, `support.js`
  runtime) frequently ship with **no responsive media queries at all** — desktop-only. On
  a real phone the asymmetric grids collapse their flexible column to near-0px
  (cruise-propulsion's hero prose set one word per line; its simulator form column was
  13px wide). Fix with an added `<style>` block of `@media (max-width: …)` rules: inline
  styles outrank any selector, so the reflow rules **must** use `!important`, and add
  class hooks to the grid divs rather than editing their inline styles (keeps desktop
  bit-for-bit identical, since the hooks only bite inside the query). Also watch
  content-box overflow — an element sized `width:min(100%,Npx)` with padding+border
  measures `100% + padding + border`, invisible on desktop (gap absorbs it) but a
  sideways scroll on a phone; `box-sizing:border-box` fixes it.
- 2026-07-11 — chrome.kill() on Windows leaves renderers holding the debug port; use a free OS-assigned port and taskkill /T /F
  Auditing these DC docs headless is booby-trapped twice over. (1) `chrome.kill()` on
  Windows leaves the renderer children alive holding the debug port; a *derived* debug
  port then attaches to a stale browser and results go non-deterministic — use an
  OS-assigned free port and `taskkill /T /F` on your own pid tree ONLY (dev boxes
  routinely have dozens of the user's real Chrome processes; never blanket-kill
  chrome.exe). (2) The page pulls React from unpkg (blocked in-sandbox) and compiles a
  large template, so a boot check at a fixed delay races the compiler and cries "blank
  page" under load — inject the vendored React UMD
  (`broadband-speed-checker/vendor/*.js`; `loadReactUmd()` short-circuits on
  `window.React`) and *poll* for the ready condition, don't sample once. A flaky oracle
  invents phantom root causes — twice I wrongly blamed CSS for what was harness flake.
- 2026-07-10 — Service-worker CacheStorage is origin-wide, not /slug/-scoped; namespace the cache, delete only your prefix
  Service-worker `CacheStorage` is shared across the whole `0x4d44.github.io` origin,
  not isolated by the worker's `/slug/` scope. Each document PWA must namespace its cache
  and delete only stale keys with its own prefix during activation; filtering every key
  except the current cache wipes the offline assets of sibling almanac apps. Its fetch
  handler should likewise reject URLs outside `self.registration.scope`, query only its
  named cache, and reserve the app-shell fallback for in-scope navigations. Add
  per-document regression assertions whenever a new service worker ships.
- 2026-07-09 — A dead Workflow lens returns an EMPTY findings array, not an error; check <failures>/journal.jsonl first
  A Workflow lens agent that dies mid-run (account session limit, auth drop) surfaces in
  the tool result's `<failures>` list, but the script's own aggregation happily returns
  its stage as an EMPTY findings array — indistinguishable from a clean pass. Never treat
  an empty lens result as "no findings" without checking `<failures>`/journal.jsonl
  first; re-run the dead lenses (by hand if limits persist).
- 2026-07-08 — Line Rate UI Overhaul.zip is a DC export, not a patch; ship the .dc.html as broadband-speed-checker/index.html
  `Line Rate UI Overhaul.zip` is a Design Canvas export (`Line Rate.dc.html` +
  `support.js` + `.thumbnail`), not a vanilla app patch. Ship the `.dc.html` as
  `broadband-speed-checker/index.html`, skip the thumbnail, self-host the DC runtime's
  React/Babel and Google-font assets, and keep production-specific behavior that the
  export resets for preview: `settings.live` should default true and the storage key
  remains `0x4d44.broadband.v1` so existing browser-local history survives.
- 2026-07-07 — Deleting a doc's tests/validate-static.mjs breaks npm test; prune its segment from both root package.json scripts
  Replacing or removing a document that shipped a `tests/validate-static.mjs` (or any
  per-doc test) silently breaks `npm test` / `npm run build`: the **root `package.json`**
  hard-codes each doc's test path into a single `&&`-chained `test`/`build` script
  (`… && node <slug>/tests/validate-static.mjs && …`), so deleting the file leaves a
  dangling `node` call that exits non-zero and fails the whole gate. When you
  retire/replace a doc, prune its segment from **both** scripts. (Hit swapping
  `cruise-propulsion`'s hand-built vanilla-JS essay for its DC-export rebuild — same
  slug, new `index.html` + `support.js`.)
- 2026-07-03 — A fixed 402x874 IOSDevice frame overflows phones; cap it with maxWidth/maxHeight dvh calc (ios-frame.jsx)
  `japanese-travel-rpg` (Nihon Quest, a DC export) wraps its whole UI in a **fixed
  402x874 `IOSDevice` frame** (`ios-frame.jsx`) centred in a
  `min-height:100vh;padding:20px` body — so on any phone (viewport < ~914px) the frame
  overflowed and its pinned bottom tab bar dropped below the fold. Fix: cap the frame
  with `maxWidth:calc(100vw-40px)`/`maxHeight:calc(100dvh-40px)` (mockup size is a *max*,
  not a fixed size; `dvh` tracks the mobile URL bar, degrades to the fixed height on old
  browsers) + body `min-height:100dvh`. Also: its `sw.js` is **cache-first**, so a fix
  reaches installed PWAs only if you bump the `nihon-quest-vN` cache name — and
  `tests/self-check.mjs` asserts that exact string, so bump the SW cache and the test
  assertion together.
- 2026-07-03 — Headless --dump-dom never returns on a rAF loop; use --screenshot, which fires on load (flight, emu-cab)
  Verifying an animated / WebGL document (Three.js entries like `flight`, `emu-cab`,
  `night-cab`) with headless Chrome: `--dump-dom` NEVER returns — the page's perpetual
  `requestAnimationFrame` loop keeps virtual time alive, so the DOM dump (and
  `--virtual-time-budget`) waits forever and the harness kills it with an **empty** file.
  Use `--screenshot=out.png` instead: it fires on the `load` event regardless of the rAF
  loop and gives a visual boot/menu confirmation. Enable WebGL headless with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, and bound the run
  with a background watchdog `kill` (macOS has no `timeout`). The `flight` DC export also
  needs its `support.js` sidecar copied alongside `index.html` — the export's own
  integration note lists only the `.dc.html` + engine, but the `<head>` loads
  `./support.js`.
- 2026-07-03 — A DC export ships offline with no bundler: vendor the exact unpkg React UMD bytes; SRI validates same-origin
  A DC design-tool export (`*.dc.html` + `support.js`) can be shipped **fully offline /
  zero-network** without a bundler: (1) vendor the *exact* unpkg React UMD bytes it
  names — the `sha384` SRI hashes baked into `support.js` still validate same-origin, so
  keep `integrity`/`crossorigin` and just repoint the URL; (2) self-host the Google Fonts
  (grab the `latin`+`latin-ext` woff2, rewrite `src:` to `./fonts/…`). No Babel is needed
  at runtime — the DC component is plain ES6 bound by `support.js`'s own `{{ }}` engine
  (not JSX), confirmed by net-log showing only react/react-dom fetched. Ship the readable
  `.dc.html` as `index.html` (+ `support.js` sidecar), not the 219 KB pre-bundled single
  file — far easier to edit (add PWA `<head>` tags + SW registration; swap the font
  `<link>`). Verify with `chrome --headless=new --log-net-log` and assert no
  unpkg/googleapis hosts appear.
- 2026-07-02 — headless=new clamps innerWidth to 500px, so a 390px shot crops rather than reflows; use --window-size >= 500
  Verifying this site's responsive layout with headless Chrome:
  `chrome --headless=new --window-size=390,H` does **not** give a 390px CSS viewport —
  headless-new clamps `innerWidth` to a **500px minimum**, and the `--screenshot` PNG is
  still only 390px wide, so content past 500px is rendered but cropped out of frame. That
  looks exactly like horizontal overflow but is a screenshot artifact. To shoot a true
  narrow layout use `--window-size ≥ 500` (e.g. 500 triggers the `max-width:560` mobile
  query with no cropping); measure real widths by screenshotting a page that prints
  `innerWidth`/`scrollWidth`.
- 2026-07-02 — vamos-spanish design.zip re-exports change only index.html; diff every file and cherry-pick just the HTML
  `vamos-spanish` "design.zip" DC re-exports change **only** `index.html` (shipped in the
  zip as `vamos-spanish.dc.html`). The five sidecars (`support.js`, `lessons.js`,
  `lessons-extra-a/b.js`, `ios-frame.jsx`) come out byte-identical to what's committed,
  and the zip's `.thumbnail` is a design-tool WebP preview — not a site asset, so skip
  it. `diff` every file before copying, then cherry-pick just the HTML into `index.html`.
- 2026-07-02 — @keyframes animating transform replaces the centring translate(-50%,-50%); bake it into every keyframe (salient/)
  A CSS `@keyframes` that animates `transform` fully **replaces** an element's base
  `transform`, including the centring offset. A modal centred with
  `transform:translate(-50%,-50%)` + `animation` whose keyframes only set `translateY(…)`
  ends up anchored by its top-left corner at the viewport centre and gets chopped on
  narrow/mobile screens (with `fill:both` it stays wrong after the anim). Fix: bake the
  centring offset into every keyframe (`transform:translate(-50%,-50%) translateY(…)`),
  or centre via fl/positioning instead of transform. Hit both dialogs in `salient/` (win
  card + rules sheet).
- 2026-06-22 — Quarto emits \uXXXX in JSX text position, which React renders literally; wrap it in braces or use the glyph
  The Quarto export emits some glyphs as `\uXXXX` in JSX **text** position (e.g.
  `<div>→</div>`), which React renders as the literal string `→`, not the
  arrow. On every re-import, grep each changed `.jsx` for an escape between tags
  (`>…\uXXXX…<`) and wrap it in braces (`{'→'}`) or use the literal glyph. Escapes inside
  JS string literals (`'✕'`) are fine. Verify with headless Chrome `--dump-dom | grep`
  for the real glyph vs the literal token.
- 2026-06-22 — Quarto re-imports reset the sw.js VERSION; cherry-pick the .jsx only and bump our own VERSION forward (sw.js)
  Quarto re-imports come as a bundler export whose `sw.js` targets `./play.html` and
  **resets** the SW cache `VERSION`, and whose `manifest.json` sets
  `start_url: ./play.html`. Our Pages slug serves the shell as `index.html`, so
  **cherry-pick the `.jsx` only, keep our `sw.js`/`manifest.json`, and bump the `sw.js`
  VERSION forward** (never adopt the export's). The export is LF; the repo is CRLF —
  convert on install so `git diff` shows only real changes.
