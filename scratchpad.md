# scratchpad

Out-of-scope observations spotted while working on something else. A separate,
human-invoked review triages these — don't fix them inline.

- [x] 2026-07-30 — `wifi-cartographer/index.html` is the one document in the repo with no
  `<script defer src="/almanac-back.js"></script>` (126 of 127 carry it, checked by grep over
  `*/index.html`). Catalog links open in the same tab, so a reader who opens it has no way
  back to `/` short of the browser's back button. Spotted while wiring `arran-deep-time`;
  it is a one-line add before `</body>`, but check first whether anything of its own sits
  under the pill's top-left box (roughly x 10..112, y 10..39) — that was
  ALM-BUG-KILN-00039's whole failure mode.
  **Done 2026-07-31** — include added, its duplicate breadcrumb back link removed.

- [ ] 2026-07-31 — `wifi-cartographer` scrolls sideways by **655px** in any window at or
  below 840px wide (measured at 768x1024: `scrollWidth` 1423 vs `innerWidth` 768). Root
  cause is one dropped guard: the base rule is
  `.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}` but the `@media (max-width:840px)`
  override is `.hero,.grid.two,.cards{grid-template-columns:1fr}` (`wifi-cartographer/styles.css`),
  and bare `1fr` means `minmax(auto,1fr)` — so the track takes its *min-content* floor from
  the long unbreakable CSV sample in the `<pre><code>` (measured `CODE` at 1320px inside a
  481px `PRE`) and blows the column out to 1392px. The desktop layout hides it because
  `pre{overflow:auto}` scrolls internally there. Fix is `minmax(0,1fr)` in the media query
  too. Confirmed pre-existing: identical 655px on unmodified `origin/main`, so it is not
  from the back-button change. Worth a browser check of the other `@media` grid overrides
  in this repo for the same dropped-`minmax(0,…)` pattern.
  **Done 2026-07-31** — fixed, and guarded by `wifi-cartographer/browser.test.mjs` at six
  widths. Two corrections to the note above: phones were the *worst* case, not the mildest
  (1020px at 390px wide, vs 670px at 768px) — the "measure" must be
  `documentElement.scrollWidth - documentElement.clientWidth`, because under Chrome's mobile
  emulation `innerWidth` reports the scaled visual viewport and hides the overflow entirely.
  And the grep for the dropped-`minmax(0,…)` pattern is worthless as a signal: 165 sites
  across the repo match it and almost all are harmless, because a bare `1fr` only bites when
  some descendant has a large min-content floor. Measure, don't pattern-match.

- [ ] 2026-07-31 — **30 of 129 documents scroll sideways at 390px** (measured headless at
  390x844 with `documentElement.scrollWidth - clientWidth`; at 768x1024 it is 10 of 129, so
  this is mostly a phone-only class of defect). Worst offenders: `mddosem` 517px,
  `mddskimg` 427px, `mdtoken` 348px, `rust-field-guide` 336px, `stop-the-bus` 335px,
  `mdkloc` 268px, `mdmdview` 188px, `spectrum-analyzer` 186px, `rci-fleet` 181px,
  `mdrll` 162px; then a tail of 20 more between 15px and 133px (`readex`, `benchmarks`,
  `estimation-whist`, `picoem`, `lighthouse`, `netmeeting`, `win2k`, `ecml-timeline`,
  `hydro`, `godel`, `ropus`, `mdminecraft`, `mdtpw`, `vamos-spanish`, `instruments`,
  `great-dying`, `chicxulub`, `br1955`, `ic-engine`, `news`). These are *not* one root
  cause — the culprits measured include nav bars (`NAV.mast-nav`, `DIV.nav-links`),
  a non-collapsing 2-column grid (`mdkloc`), inline spans and SVG groups — so each needs
  its own diagnosis, not a blanket edit. Found while fixing `wifi-cartographer`; the
  headless sweep that produced these numbers is reusable and worth landing as a repo
  script if this gets picked up.

- [ ] 2026-07-30 — `lessons_learnt.md` is over its 20-entry cap and the SessionStart hook
  now truncates it, so the oldest entries no longer reach any agent. Worth a
  `prune-lessons-learnt` pass.

- [ ] 2026-07-25 — `npm test` is RED on `origin/main`, and has nothing to do with the
  branch that found it. `tidecall/validate-static.test.js:136` fails its
  "a modal moves focus to its first VISIBLE control" assertion with
  `openModal function should be found`. That test is the regression guard for
  `bugs/ALM-BUG-KILN-00028.md`, which the ledger records as **Fixed** (2026-07-21,
  branch `claude/bugs-queue-2q-drain-0sv3oa`) and **awaiting independent
  verification** — so either the fix regressed, or it restructured `openModal` in a
  way the guard no longer recognises. Either way the ledger's state is currently
  wrong, and because the `test` script is a single `&&` chain this failure aborts the
  run, so every suite after `tidecall` is going unexercised. Confirmed pre-existing:
  `tidecall/validate-static.test.js` and `tidecall/index.html` are byte-identical
  between `origin/main` and the branch. Needs the bug-tracking two-eyes route, not an
  inline fix.

- [x] 2026-06-20 — `app.js:146` (also `:135-136` grid, `:169` focus) builds the
  listing meta line as `` `${essay.readingMin}m · ${(essay.words/1000).toFixed(1)}k` ``
  with no guard for entries that omit `readingMin`/`words`. Every stat-less card —
  the playable apps/games `night-cab`, `the-second-world-war`, `world-population`,
  `worldviewer`, `emu-cab`, `quarto`, and now `pylos` — therefore renders literal
  `undefinedm · NaNk` in the listing (visible on the live site). Fix: only emit the
  size span when both fields are present (or fall back to `—`). Pre-existing;
  unrelated to the Quarto import. (Already fixed: `app.js:26-30` now defines
  `hasNumber` and guards each field — `readingText`/`wordsText` return `""` when the
  value isn't finite and the parts are `.filter(Boolean)`-ed, so a stat-less card
  emits no meta text instead of `undefinedm · NaNk`. Verified on origin/main.)
- [x] 2026-07-02 — Sibling PWA service workers do **origin-wide** cache cleanup:
  `salient/sw.js:21` deletes every cache key `!== 'salient-v2'` on `activate`, and
  focus/pylos/quarto do the same with their own names. Since all slugs share the
  `0x4d44.github.io` origin (Cache Storage is per-origin), each app's SW **wipes the
  others' offline caches** whenever it updates/activates — so updating one app
  silently breaks the others' offline mode until each is revisited. Self-healing but
  real. Fix: scope each `activate` cleanup to its own prefix (delete only
  `keys.filter(k => k.startsWith('<app>-') && k !== VERSION)`), as `med-cruise/sw.js`
  now does. A one-line sweep across the sibling SWs. Found via the med-cruise
  offline review (Codex external pass). (Done 2026-07-11: added a per-app `PREFIX`
  const and scoped the `activate` filter to `startsWith(PREFIX)` in all nine still-buggy
  siblings — salient, focus, pylos, quarto, quixo, morning-run, midi-observatory,
  japanese-wordle, japanese-travel-rpg; the note's original four had grown to nine as
  more apps shipped the same pattern. med-cruise/humanity-retention/shipshape were
  already scoped. SW-logic change needs no cache-version bump; suite green.)
- [x] 2026-07-10 — `cruise-line/engine.mjs:1161` validates the main numeric
  save fields but not ship feature IDs, order/rival structure, liveries, or the
  campaign status. A corrupted same-version localStorage payload can therefore
  pass restoration and later crash rendering (for example at
  `cruise-line/app.mjs:418`, which dereferences each feature ID). Normal saves
  are valid and version-gated; harden the boundary with malformed-save tests in
  a separate persistence pass. (Promoted 2026-07-11: ALM-REQ-KILN-00001, Draft —
  gap re-confirmed on origin/main; validateState still stops at prices + forecast.)
- [x] 2026-07-10 — Decet: decide whether to formalize a multi-rotation "long-day"
  super-unit for sleep (a 2.78-h Standard day decouples sleep from one rotation) or
  leave it to culture. Design-study question, non-blocking. (`emdtime/source/`)
  (Resolved 2026-07-11: already a standing HLD §10 open question — "formalize a long-day
  super-unit for sleep, or leave it to culture?" — the durable home for a parked, non-
  blocking design fork. Nothing to build.)
- [x] 2026-07-10 — Decet: epoch is currently 2000-01-01T00:00:00 UTC (clean & simple).
  A "true" standard would anchor to an equinox for sky-recoverability (HLD §7), which
  would add leap-second/TAI handling. Out of scope for the design study.
  (`emdtime/source/wrk_docs/2026.07.10 - HLD - Decet base-10 time system.md`)
  (Resolved 2026-07-11: folded into HLD §10 open-questions as the "Epoch anchoring" bullet.)
- [x] 2026-07-10 — Decet: leap seconds are ignored in `convert.ts` (continuous atomic
  model). Fine for a decimal reckoning; a production civil converter would apply the
  leap table at the UTC display boundary only.
  (`emdtime/source/src/core/convert.ts`)
  (Resolved 2026-07-11: folded into HLD §10 open-questions as the "Leap seconds" bullet.)
- [x] 2026-07-10 — Decet: `npm audit` reports dev-only advisories in the vite/esbuild
  toolchain. Dev dependencies only (not shipped); revisit if the app is ever deployed
  as a service. (`emdtime/source/package.json`)
  (Resolved 2026-07-11: folded into HLD §10 open-questions as the "Tooling / ops" bullet.)
- [x] 2026-07-11 — Tidecall: overlapped hand cards expose a ~40–42px tap strip at 7–8
  cards (`width + margin-left`), just under the 44px guideline, and there is no touch
  affordance — `:hover`/`:focus-visible` lift never fires on a phone, so the player
  taps a sliver with no disambiguation. Not a regression (the strip is unchanged), but a
  real touch-UX gap. Options: tap-to-raise-then-play, or wrap to two rows at n≥7.
  (Done 2026-07-11: implemented tap-to-raise-then-play. On coarse/no-hover pointers
  (`matchMedia('(hover: none)')`) the first tap on a playable card raises + rings it and a
  second tap plays it; tapping another card moves the raise; it clears when the turn leaves
  seat 0. Mouse/keyboard keep instant play — their hover/focus lift is the preview and an
  Enter/Space native click still plays at once. `ui.raisedCard` + a `.raised` class toggled
  in renderHand's reconcile loop (no flicker); `.raised` lift scoped to `@media (hover:none)`;
  `sw.js` bumped `tidecall-v2`→`v3`; static test guards the affordance.)
- [ ] 2026-07-11 — DARMOK: the whole SPA renders inside one `aria-live="polite"`
  container (`darmok/index.html:16`), and `render()` replaces `#app` wholesale on nav /
  answers, so a screen reader re-announces the entire rebuilt view each time; the
  `#cascade` boot ticker (rewritten every 900ms, inside the live region) would also
  chatter. Verbose but not broken. Fix: scope a live region to the status/feedback
  node only and drop it from `#app`.
- [ ] 2026-07-11 — DARMOK: on mobile several controls sit under the 44px touch
  guideline — nav-rail buttons ~38px tall (`.rail-btn` in the `max-width:760px` block,
  `darmok/lcars.css:966`) and the vocab audio ▶ buttons 30×30 (`.say.small`). Tappable
  but tight; review deemed non-blocking. Bump min-height / hit-area if polishing.
- [x] 2026-07-13 — The repo's `npm run build` / `npm test` gate is RED on
  origin/main (independent of any new doc). `humanity-retention/tests/validate-static.mjs:29-32`
  walks every `href`/`src` in the doc's `index.html` and asserts each resolves
  under the doc dir, but its skip-regex only excludes `//`, `http(s)://` and
  `data:` — not ROOT-absolute paths. The shared back-button include
  `/almanac-back.js` (added repo-wide after this test was written) therefore
  resolves to `humanity-retention/almanac-back.js`, which doesn't exist, and the
  build chain dies there — before shipshape / span-of-control run, which copied
  the same loop and likely share the bug. Fix: in that ref loop, also skip refs
  starting with a single `/` (root-absolute), across every validate-static that
  uses the pattern. Found while adding `northern-line-1987`; pre-existing and
  unrelated to it. (Promoted + fixed 2026-07-13: **ALM-BUG-KILN-00025**, state
  Fixed. It was worse than this note assumed — **four** validators carried the
  defect, not one: `tidecall/validate-static.test.js:42` has the same bug in a
  different shape, and the `&&` chain was hiding it behind humanity-retention.
  All four now *resolve* root-absolute refs against the repo root rather than
  skipping them, so the check keeps its teeth; `npm test` is green. Awaiting
  independent two-eyes closure.)
