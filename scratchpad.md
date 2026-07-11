# scratchpad

Out-of-scope observations spotted while working on something else. A separate,
human-invoked review triages these — don't fix them inline.

- [ ] 2026-06-20 — `app.js:146` (also `:135-136` grid, `:169` focus) builds the
  listing meta line as `` `${essay.readingMin}m · ${(essay.words/1000).toFixed(1)}k` ``
  with no guard for entries that omit `readingMin`/`words`. Every stat-less card —
  the playable apps/games `night-cab`, `the-second-world-war`, `world-population`,
  `worldviewer`, `emu-cab`, `quarto`, and now `pylos` — therefore renders literal
  `undefinedm · NaNk` in the listing (visible on the live site). Fix: only emit the
  size span when both fields are present (or fall back to `—`). Pre-existing;
  unrelated to the Quarto import.
- [ ] 2026-07-02 — Sibling PWA service workers do **origin-wide** cache cleanup:
  `salient/sw.js:21` deletes every cache key `!== 'salient-v2'` on `activate`, and
  focus/pylos/quarto do the same with their own names. Since all slugs share the
  `0x4d44.github.io` origin (Cache Storage is per-origin), each app's SW **wipes the
  others' offline caches** whenever it updates/activates — so updating one app
  silently breaks the others' offline mode until each is revisited. Self-healing but
  real. Fix: scope each `activate` cleanup to its own prefix (delete only
  `keys.filter(k => k.startsWith('<app>-') && k !== VERSION)`), as `med-cruise/sw.js`
  now does. A one-line sweep across the sibling SWs. Found via the med-cruise
  offline review (Codex external pass).
- [ ] 2026-07-10 — `cruise-line/engine.mjs:1161` validates the main numeric
  save fields but not ship feature IDs, order/rival structure, liveries, or the
  campaign status. A corrupted same-version localStorage payload can therefore
  pass restoration and later crash rendering (for example at
  `cruise-line/app.mjs:418`, which dereferences each feature ID). Normal saves
  are valid and version-gated; harden the boundary with malformed-save tests in
  a separate persistence pass.
- [ ] 2026-07-10 — Decet: decide whether to formalize a multi-rotation "long-day"
  super-unit for sleep (a 2.78-h Standard day decouples sleep from one rotation) or
  leave it to culture. Design-study question, non-blocking. (`emdtime/source/`)
- [ ] 2026-07-10 — Decet: epoch is currently 2000-01-01T00:00:00 UTC (clean & simple).
  A "true" standard would anchor to an equinox for sky-recoverability (HLD §7), which
  would add leap-second/TAI handling. Out of scope for the design study.
  (`emdtime/source/wrk_docs/2026.07.10 - HLD - Decet base-10 time system.md`)
- [ ] 2026-07-10 — Decet: leap seconds are ignored in `convert.ts` (continuous atomic
  model). Fine for a decimal reckoning; a production civil converter would apply the
  leap table at the UTC display boundary only.
  (`emdtime/source/src/core/convert.ts`)
- [ ] 2026-07-10 — Decet: `npm audit` reports dev-only advisories in the vite/esbuild
  toolchain. Dev dependencies only (not shipped); revisit if the app is ever deployed
  as a service. (`emdtime/source/package.json`)
- [ ] 2026-07-11 — Tidecall: closing the round-recap or match-end modal via the ✕ or
  the scrim tears it down and immediately reopens it. `closeModal(true)` nulls
  `ui.modal`, then calls `render()`→`drive()`; `drive()` sees `phase==='roundEnd'`/
  `'matchEnd'` and re-opens the modal because the `ui.modal==='round'` guard no longer
  holds (`tidecall/app.js:773` closeModal, `:689-690` drive). The modal blinks and
  slams back, replays `modal-in`, and on match-end re-fires `sound.play('exact')` +
  `celebrate(150)` — fresh fanfare/confetti on every dismissal. The keyboard path
  already treats these two modals as non-dismissable (`app.js` Escape handler excludes
  'round'/'match'); the click path contradicts it. Fix: guard `handleModalClick`'s
  `[data-close-modal]` branch with `!['round','match'].includes(ui.modal)`, and hide the
  static `.modal-close` for those two types. HIGH, pre-existing (in origin/main).
- [ ] 2026-07-11 — Tidecall: `celebrate()` takes no lock — each call resizes
  `#celebration-canvas` and starts its own rAF loop whose first act is a full
  `clearRect` (`tidecall/app.js` celebrate). Two overlapping bursts (an exact final
  trick → `celebrate(90)`, then match-end → `celebrate(150)` ~1s later) erase each
  other every frame, so the confetti strobes at half density. Give it a module-scope
  rAF handle: cancel the in-flight loop before starting a new one. LOW, pre-existing.
- [ ] 2026-07-11 — Tidecall: on ≤560px the `.table-column` min-height subtracts a
  hard-coded 64px of chrome but the real chrome above/below it is 73px (app-shell 8 +
  topbar 48 + game-screen padding-top 9 + app-shell 8), so the game screen is ~9px
  taller than the viewport and the page scrolls ~9px on what should be a fixed board
  (`tidecall/styles.css`, the `@media (max-width:560px)` `.table-column` rule).
  Pre-existing (identical +9px before and after the card-size work). Fix: correct the
  constant to 73px, or derive it from a shared `--chrome` custom property so the three
  numbers can't drift. MEDIUM.
- [ ] 2026-07-11 — Tidecall: the face-card watermark never renders. `app.js`
  `createCardElement` sets `node.dataset.face` on the `.playing-card` button, but the
  CSS `.playing-card.face-card .card-art::before { content: attr(data-face) }`
  (`tidecall/styles.css`) resolves `attr()` against its originating element `.card-art`,
  which has no `data-face` — so `content` is the empty string. Latent (never seen); the
  em-based card typography now in place would "turn it on" the moment the attribute is
  moved onto `.card-art`. Decide if the J/Q/K/A ghost letter is wanted before wiring it.
- [ ] 2026-07-11 — Tidecall: dead declarations flagged during the flicker pass —
  `@keyframes active-dot` is defined but never referenced; the four `.slot-*` rules
  declare `--rot` values that are always shadowed by the inline `--rot` `renderTrick`
  sets on the card node (two sources of truth, CSS one silently loses). Both cosmetic;
  tidy in a housekeeping pass. (`tidecall/styles.css`, `tidecall/app.js` renderTrick)
- [ ] 2026-07-11 — Tidecall: overlapped hand cards expose a ~40–42px tap strip at 7–8
  cards (`width + margin-left`), just under the 44px guideline, and there is no touch
  affordance — `:hover`/`:focus-visible` lift never fires on a phone, so the player
  taps a sliver with no disambiguation. Not a regression (the strip is unchanged), but a
  real touch-UX gap. Options: tap-to-raise-then-play, or wrap to two rows at n≥7.
