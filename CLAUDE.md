# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`0x4d44.github.io` — a personal GitHub Pages "almanac": a static catalog page that
links out to a growing set of standalone documents (railway history, software
write-ups, fiction, comics). There is **no build system, no package.json, no
framework at the root, and no test suite**. Everything is plain static files
served verbatim (`.nojekyll` disables Jekyll processing).

## Architecture

**Root catalog** — `index.html` + `style.css` + `app.js` + `data.js`:
- `data.js` is the **single source of truth** for the catalog. It defines
  `window.ESSAYS` (array of document entries) and `window.TAGS` (filter chips,
  `"all"` first). `about.html` reuses it for site stats.
- `app.js` is vanilla JS (no framework). It reads `window.ESSAYS`/`window.TAGS`
  and renders a filter/sort/table-or-grid listing into `#listing`; UI state
  persists to `localStorage` under key `0x4d44.listing.v1`.
- Each `ESSAYS` entry: `slug`, `title`, `tagline`, `url` (absolute,
  `https://0x4d44.github.io/<slug>/`), `illustration` (an SVG symbol id),
  `date` (ISO `YYYY-MM-DD`, used as the sort key), `year` (the *subject's* year,
  not publish date), `readingMin`, `words`, `tag`, `real` (`true` → `[PUB]`,
  `false` → `[DRAFT]`).
- Illustrations are inline `<symbol id="ill-…">` elements in the SVG sprite at
  the bottom of `index.html`. `app.js` falls back to `ill-diesel` if the id is
  missing.

**Documents** — each lives in its own `<slug>/index.html`, fully self-contained
(its own CSS and fonts). Two flavors:
- **Static HTML prose** (e.g. `the-ai-who-watched`, `vernier`, `netmeeting`).
- **In-browser React apps** (e.g. `picoem`, `mddskimg`, `ecml`, `mdminecraft`,
  `ropus`): they load React 18 UMD + `@babel/standalone` from unpkg and include
  `<script type="text/babel" src="*.jsx">`. **The `.jsx` is transpiled in the
  browser at load time — there is no bundler and no build step.**

Many document directories also contain a `*.zip` source archive and sometimes a
print `*.pdf`. These are downloadable artifacts; the site does not reference them.

## Adding a document (the common task)

1. Create `<slug>/` containing a self-contained `index.html` (plus any assets).
2. Add an entry to the `window.ESSAYS` array in `data.js`.
3. If it needs a new icon, add a `<symbol id="ill-…">` to the SVG sprite in
   `index.html` and set the entry's `illustration` to that id.
4. If it introduces a new category, add the tag to `window.TAGS` in `data.js`.

## Do not publish

**Praedex is internal — never add, deploy, or commit any Praedex files** (e.g.
`Praedex*.zip`, `Praedex*Deep Dive*.html`, `Praedex UI.zip`) to this repo. They
may appear in Downloads alongside publishable documents; skip them.

## Local preview

Serve over HTTP (not `file://`) — the React documents fetch `.jsx` and need a
real origin for Babel:

```
python -m http.server 8000      # then open http://localhost:8000/
```

## Deployment

GitHub Pages serves `main` directly. Push to `main` to deploy. CDN objects can
get stuck (see recent commits force-refreshing files / re-adding `.nojekyll`); a
trivial content change to the affected file is the usual unstick.
