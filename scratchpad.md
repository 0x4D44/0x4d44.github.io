# scratchpad

Out-of-scope observations spotted while working on something else. A separate,
human-invoked review triages these — don't fix them inline.

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
