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
