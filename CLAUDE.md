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
  `date` (ISO 8601, the sort key — use a full timestamp like
  `2026-05-28T18:54:00` so multiple same-day entries sort correctly; a bare
  `YYYY-MM-DD` also works), `year` (the *subject's* year,
  not publish date), `readingMin`, `words`, `tag` (or `tags: ["x", "y"]` for
  several — the page then shows under each filter), `real` (`true` → `[PUB]`,
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

**Site navigation — same tab, one back button.** The catalog links open each
document in the **same tab** (no `target="_blank"` in `app.js`), and every
document page carries a shared "← Almanac" button that returns to `/`. The
button is defined **once** in **`/almanac-back.js`** (repo root): it injects a
fixed, shadow-DOM-isolated pill (top-left), so its styles can neither clash with
nor leak into the page's own CSS, and it re-mounts itself via a `MutationObserver`
if a self-bootstrapping page rebuilds the document (several "bundler" pages
`replaceWith` the whole `<body>` on load). Each document's `index.html` opts in
with a single line before `</body>`:

```
<script defer src="/almanac-back.js"></script>
```

The script skips the almanac index itself (it detects `window.ESSAYS` + the
`#listing` element), so never add it to the root `index.html`. **For the
pre-built Vite bundles and the imported-from-upstream docs, this include lives in
the committed `index.html` but is regenerated on rebuild/re-import** — re-add it
after copying `dist/*` in (better: add it to the source project's `index.html`)
so those pages keep the button.

Many document directories also contain a `*.zip` source archive and sometimes a
print `*.pdf`. These are downloadable artifacts; the site does not reference them.

Not every top-level directory is a catalog entry: `wrk_journals/` (and any
`wrk_docs/`, plus `scratchpad.md` / `lessons_learnt.md` at the root) are
repo-meta from the working conventions, not documents. They are still served by
Pages but have no `window.ESSAYS` entry and should not get one.

**Pre-built Vite bundles** — some documents are committed here as *built output*
only (hashed `assets/index-*.js` + `.css`, no readable source). To change them,
edit the source project, rebuild, and copy the `dist/` output back in. Known
source locations (outside this repo):
- `coil/` ← `C:\language\mdsnake` (also `github.com/0x4D44/mdsnake`) — "Coil", a
  discrete 2.5D snake puzzle (Vite + TypeScript + Three.js on a tested sim core;
  `vite.config.ts` sets `base: "./"`). **Build output only — never hand-edit `coil/`
  here;** `coil/SOURCE.txt` records the source commit. Mirror-both-ways: fix in
  `mdsnake`, `npm run build`, copy `dist/*` here.
- `uk-isochrone/` ← `C:\language\mdisochrone\UK` (TypeScript: `src/main.ts`,
  `src/render.ts`)
- `edinburgh-isochrone/` ← `C:\language\mdisochrone\Edinburgh`
- `mdisochrone/` ← `C:\language\mdisochrone` (the root project)
- `night-cab/` ← `C:\language\mdtrain2` (also `github.com/0x4D44/mdtrain2`) —
  "The Night Cab", the wet-night GTO successor to `emu-cab`. Vite + TypeScript +
  Three.js on a tested sim core; `vite.config.ts` already sets `base: "./"` so the
  bundle works under the subpath. `npm run build`, copy `dist/*` here.
Build with `npm run build` in the source dir, then copy its `dist/*` over the
matching `<slug>/` directory here. Do **not** hand-edit the minified bundles.

**Imported from standalone repos** — a few `<slug>/` directories are copies of a
document's own GitHub project. There is no automatic sync: if you fix one here,
mirror the change back upstream (and vice versa) so a future re-import doesn't
undo it.
- `emu-cab/` ← `github.com/0x4D44/mdtrain` (branch `master`) — "UK EMU Cab
  Simulator", a single self-contained `index.html` (Three.js loaded from a CDN
  importmap; no build step). Edit `index.html` directly.
- `worldviewer/` ← `github.com/0x4D44/mdgpt54`, `worldviewer/` subdir — MapLibre
  GL "Earth twin", Vite + TypeScript. A pre-built bundle (see above): clone,
  `npm run build`, copy `dist/*` here. The live-ships relay is server-side, so
  that toggle stays inert on Pages; live aircraft and everything else work.

**Self-bootstrapping "bundler" pages** — 20 documents (find them with
`grep -l '__bundler/template' */index.html`) carry their whole page
JSON-escaped inside
`<script type="__bundler/template">`, plus a base64 asset manifest. A loader in
the same file unpacks the assets to blob URLs and then does
`document.documentElement.replaceWith(...)` — it replaces the **whole `<html>`**,
so nothing you add to the outer `<head>` survives. Their CSS is not
hand-editable.
- **To restyle one, add `<slug>/mobile.css`** — a normal, readable file — and
  link it from inside the template `<head>`. Ten already carry that link
  (`mdtoken`, `rust-field-guide`, `stop-the-bus`, `mdmdview`, `readex`,
  `netmeeting`, `ecml-timeline`, `hydro`, `br1955`, `edinburgh-biosci`).
  Because the link lands first in `<head>`, those files prefix every selector
  with `html` and mark every declaration `!important`: several of the rules
  being corrected are themselves `!important`, and specificity is settled
  before source order.
- **Never round-trip the blob through `JSON.parse`/`JSON.stringify`.**
  `stringify` does not reproduce the `<\/script>` escape the bundler emits, so
  the trip silently corrupts the inline script that follows. Edit the raw JSON
  text in place. Bundler versions differ in how they escape `/`, so anchor on
  the opening `<head>` (plain in every file), not on a closing tag.

## Adding a document (the common task)

1. Create `<slug>/` containing a self-contained `index.html` (plus any assets).
2. Add an entry to the `window.ESSAYS` array in `data.js`. Keep `tagline`
   short — one to three sentences, ~55 words max: lead with what it is, one
   line of flavour, then the tech. It's a hook, not a feature list.
3. If it needs a new icon, add a `<symbol id="ill-…">` to the SVG sprite in
   `index.html` and set the entry's `illustration` to that id.
4. Tags live in `window.TAG_GROUPS` in `data.js`, split across two axes that
   the filter row renders as separate labelled rows (each chip shows a live
   document count; `window.TAGS` is derived from the groups, `"all"` first):
   - **form** — what the piece *is*: `software`, `games`, `simulation`,
     `fiction`, `comic`. Rule of thumb: `games` = you play it to win/progress;
     `simulation` = you drive or inhabit a real-time model; `software` = tools
     and technical write-ups (including code walkthroughs *about* a game/sim).
   - **subject** — what it is *about*: `rail`, `history`, `engineering`,
     `transport`, `science`, `maritime`, `math`, `finance`.
   Reuse an existing tag where it fits (a piece may carry one from each axis).
   Only extend the vocabulary for a genuinely new category — add it to the
   right group in `TAG_GROUPS`; a `tag` not listed there gets no filter chip.
5. Add the shared back button: include `<script defer src="/almanac-back.js"></script>`
   just before `</body>` in the document's `index.html` (see "Site navigation"
   above). Catalog links open in the same tab, so this is a reader's way back.
6. Put it on a shelf: add the slug to the appropriate `window.COLLECTIONS`
   entry in `data.js` (a piece may sit on more than one). The shelf view is the
   landing; anything left off every shelf falls into a trailing "Unshelved"
   group (and `app.js` warns in the console), so it won't silently vanish.

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

Native ES-module documents (`*.mjs`, currently `cruise-line`) also require a
JavaScript MIME type. Python 3.14 on Windows serves `.mjs` as `text/plain`, which
Chrome refuses for a module script. Register the type before starting that
preview:

```
python -c "import http.server,mimetypes; mimetypes.add_type('text/javascript','.mjs'); http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler,port=8000,bind='127.0.0.1')"
```

## No document may scroll sideways, or bury a control under the back pill

`tests/responsive.test.mjs` (in `npm test`, or alone as
`npm run test:responsive`) loads every `<slug>/index.html` in headless Chrome at
390x844 and 768x1024 and asserts two things. It takes ~2m40s for all 129.

**1. `documentElement.scrollWidth - clientWidth <= 1`.**

When it fails, fix the named document's CSS. In rough order of frequency:
- **A collapsed grid track written as a bare `1fr`.** `1fr` means
  `minmax(auto, 1fr)`, and that `auto` floor is the item's *min-content* width —
  so a "collapsed" single column inflates straight back out around a shell
  command or any long unbreakable token. Inside a `@media` block always write
  `minmax(0, 1fr)`. (Outside one, the min-content floor is often load-bearing —
  don't sweep it.)
- **Wide content that should scroll in its own box, not squeeze**: code blocks,
  data tables, fixed-geometry diagrams. `overflow-x: auto` on the element, or on
  the nearest parent it shares with anything that must stay aligned with it.
- A nav or flex row that should wrap; a fixed-size illustration needing a
  `max-width`; a full-bleed `100vw` decoration (`100vw` counts the scrollbar
  gutter, so it always overflows by that much where scrollbars are classic).

**2. Nothing interactive sits under the "← Almanac" pill**, which
`/almanac-back.js` pins to the viewport's top-left, `[0,0 109x41]`, with a
z-index no document can beat. A control underneath is not merely obscured — it
is untappable, because the tap lands on the pill and navigates to the catalog
(ALM-BUG-KILN-00039). A masthead wordmark lands there naturally; 49 documents
did. Two remedies, by what the covered element is:
- **If it is the document's own back link to the almanac, delete it.** The
  shared pill is the one back button (see "Site navigation" above), so a second
  one is a duplicate that also happens to be unclickable. Where the wordmark
  *is* the link, unwrap it and keep the text. If that leaves a lone sibling in a
  `justify-content: space-between` bar, switch the bar to `flex-end` or the
  sibling slides left into the pill.
- **Otherwise inset the header** so its first content starts at `x >= 112px`
  (`instruments/piano.css` and ~35 others). Unconditional, not phone-scoped —
  the pill is in the same place at every width. Check the result: 112px of
  padding is enough to push a narrow header over the viewport, and some
  documents have their own browser tests at widths below 390px.

Don't grep for the pattern — a repo-wide search for a dropped `minmax(0, …)`
matches ~165 sites, nearly all harmless. Measure, then bisect: hide one subtree
at a time and watch `scrollWidth`. That finds causes a rect scan cannot see, such
as a `<pre>` whose border box fits while its text hangs out, or a decorative
pseudo-element with a negative inset.

## Deployment

GitHub Pages serves `main` directly. Push to `main` to deploy. CDN objects can
get stuck (see recent commits force-refreshing files / re-adding `.nojekyll`); a
trivial content change to the affected file is the usual unstick.
