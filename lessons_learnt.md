# Lessons learnt

Distilled, non-obvious gotchas for this repo. Newest first. Keep it short
(hard cap 20) — promote anything durable into `CLAUDE.md` instead.

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
