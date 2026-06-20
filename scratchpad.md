# scratchpad

Out-of-scope observations spotted while working on something else. A separate,
human-invoked review triages these — don't fix them inline.

- [ ] 2026-06-20 — `app.js:146` (also `:135-136` grid, `:169` focus) builds the
  listing meta line as `` `${essay.readingMin}m · ${(essay.words/1000).toFixed(1)}k` ``
  with no guard for entries that omit `readingMin`/`words`. Every stat-less card —
  the playable apps/games `night-cab`, `the-second-world-war`, `world-population`,
  `worldviewer`, `emu-cab`, and now `quarto` — therefore renders literal
  `undefinedm · NaNk` in the listing (visible on the live site). Fix: only emit the
  size span when both fields are present (or fall back to `—`). Pre-existing;
  unrelated to the Quarto import.
