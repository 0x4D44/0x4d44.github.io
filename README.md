# 0x4d44.github.io

A personal GitHub Pages **almanac** — a single static catalog page that links out
to a growing library of standalone documents: railway history, software write-ups
and code tours, interactive explainers, fiction, and comics.

**Live:** <https://0x4d44.github.io/>

There is **no build system, no `package.json`, no framework at the root, and no
test suite.** Everything is plain static files served verbatim; `.nojekyll`
disables GitHub's Jekyll processing so files are published exactly as committed.

---

## Table of contents

- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [The catalog (`data.js`)](#the-catalog-datajs)
  - [Entry schema](#entry-schema)
  - [Tags](#tags)
  - [Tagline style](#tagline-style)
- [Document flavors](#document-flavors)
- [Adding a document](#adding-a-document)
- [Local preview](#local-preview)
- [Deployment](#deployment)
- [Conventions & gotchas](#conventions--gotchas)
- [Do not publish](#do-not-publish)

---

## How it works

The root of the site is a four-file vanilla-JS app:

| File | Role |
|------|------|
| `index.html` | Page shell + the inline SVG sprite of illustrations |
| `style.css`  | All styling for the catalog page |
| `data.js`    | **Single source of truth** — the document list and tag set |
| `app.js`     | Reads `data.js` and renders the filterable/sortable listing |

`data.js` defines two globals:

- `window.ESSAYS` — an array of document entries (the catalog).
- `window.TAGS` — the filter chips shown above the listing (`"all"` first).

`app.js` is framework-free. It reads those globals and renders a listing into
`#listing` with:

- **Filter** by tag (the chip row).
- **Sort** by *recent* (default), *oldest*, *length* (word count), or *year*
  (the subject's year).
- **Layout** toggle between a dense **table** and a **grid** of cards.

UI state (filter, sort, layout) persists to `localStorage` under the key
`0x4d44.listing.v1`. `about.html` reuses `data.js` to compute site statistics, so
the catalog data drives both pages.

There are currently **55 documents** in the catalog.

---

## Repository layout

```
.
├── index.html          # catalog shell + <symbol id="ill-…"> SVG sprite
├── style.css           # catalog styling
├── app.js              # listing renderer (filter / sort / layout)
├── data.js             # window.ESSAYS + window.TAGS  ← edit this to add a doc
├── about.html          # site stats, computed from data.js
├── CLAUDE.md           # guidance for AI coding agents working in this repo
├── .nojekyll           # disables Jekyll; files served verbatim
├── wrk_journals/       # dated engineering journal entries
└── <slug>/             # one directory per document, each self-contained
    └── index.html      #   (+ its own CSS/fonts/assets, sometimes a .zip/.pdf)
```

Each document lives in its own `<slug>/` directory and is **fully
self-contained** — its own CSS and fonts, no shared root stylesheet. Many
document directories also carry a `*.zip` source archive and sometimes a print
`*.pdf`; these are downloadable artifacts the site itself does not link to.

---

## The catalog (`data.js`)

### Entry schema

Each element of `window.ESSAYS` is an object. Minimum fields are `title`,
`tagline`, `url`, `date`, `year`, and a tag.

| Field | Required | Notes |
|-------|----------|-------|
| `slug` | recommended | Short id; usually matches the directory name |
| `title` | ✓ | Display title |
| `tagline` | ✓ | One- to three-sentence hook (see [style](#tagline-style)) |
| `url` | ✓ | Absolute, e.g. `https://0x4d44.github.io/<slug>/` |
| `illustration` | — | An `<symbol id="ill-…">` id; falls back to `ill-diesel` |
| `date` | ✓ | ISO 8601 — **the sort key** |
| `year` | ✓ | The *subject's* year, not the publish date |
| `readingMin` | — | Estimated reading minutes; shown when present |
| `words` | — | Word count; shown when present, used by the *length* sort |
| `tag` *or* `tags` | ✓ | `tag: "x"` for one, or `tags: ["x","y"]` for several |
| `real` | ✓ | `true` → `[PUB]` badge, `false` → `[DRAFT]` |

Notes:

- **`date` is the sort key.** Use a full timestamp (e.g.
  `"2026-05-28T18:54:00"`) so several documents published on the same day sort
  correctly; a bare `"YYYY-MM-DD"` also works.
- **`year` is the subject's year**, not the publish date — e.g. the Class 47
  essay uses `1962`. It drives the *year* sort.
- Use `tags: ["x", "y"]` to make a document appear under several filters.

### Tags

The filter row is `window.TAGS`, with `"all"` always first. Current set:

```
all · rail · maritime · transport · fiction · software · comic ·
history · math · science · finance · engineering
```

Adding a tag to an entry that isn't in `window.TAGS` won't get a filter chip —
add the new category to `window.TAGS` too.

### Tagline style

Keep `tagline` short: **one to three sentences, ~55 words max** (roughly two
lines in the listing). Lead with *what the thing is*, add at most one sentence of
flavour, then close with the tech stack. It's a hook, not a feature list — resist
itemising every feature. (This guidance also lives in the `data.js` header
comment and in `CLAUDE.md`.)

---

## Document flavors

Documents come in four shapes:

1. **Static HTML prose** — a self-contained `index.html` with inline CSS
   (e.g. `the-ai-who-watched/`, `vernier/`, `netmeeting/`). Edit directly.

2. **In-browser React apps** — load React 18 UMD + `@babel/standalone` from
   unpkg and include `<script type="text/babel" src="*.jsx">`. **The `.jsx` is
   transpiled in the browser at load time — there is no bundler and no build
   step** (e.g. `picoem/`, `mddskimg/`, `ecml/`, `mdminecraft/`, `ropus/`). This
   is why local preview must be over HTTP, not `file://` — Babel fetches the
   `.jsx` and needs a real origin.

3. **Pre-built Vite bundles** — committed here as *built output only* (hashed
   `assets/index-*.js` + `.css`, no readable source). **Do not hand-edit the
   minified bundles.** To change one, edit the source project, `npm run build`,
   and copy its `dist/*` back over the matching `<slug>/` directory. Known source
   locations (outside this repo):

   | Slug | Source project |
   |------|----------------|
   | `uk-isochrone/` | `C:\language\mdisochrone\UK` |
   | `edinburgh-isochrone/` | `C:\language\mdisochrone\Edinburgh` |
   | `mdisochrone/` | `C:\language\mdisochrone` (root) |
   | `night-cab/` | `C:\language\mdtrain2` (`github.com/0x4D44/mdtrain2`) |
   | `worldviewer/` | `github.com/0x4D44/mdgpt54`, `worldviewer/` subdir |

4. **Imports from standalone repos** — a few `<slug>/` directories are copies of
   a document's own GitHub project. **There is no automatic sync:** if you fix
   one here, mirror the change upstream (and vice versa) so a future re-import
   doesn't undo it.

   - `emu-cab/` ← `github.com/0x4D44/mdtrain` (branch `master`) — a single
     self-contained `index.html` (Three.js via CDN importmap; no build step).
   - `worldviewer/` ← see the Vite-bundle table above; the live-ships relay is
     server-side, so that toggle is inert on Pages, but live aircraft and
     everything else work.

---

## Adding a document

The common task:

1. Create `<slug>/` containing a self-contained `index.html` (plus any assets).
2. Add an entry to the `window.ESSAYS` array in `data.js`. Keep the `tagline`
   short (see [Tagline style](#tagline-style)).
3. If it needs a new icon, add a `<symbol id="ill-…">` to the SVG sprite at the
   bottom of `index.html` and set the entry's `illustration` to that id.
4. If it introduces a new category, add the tag to `window.TAGS` in `data.js`.

That's it — there's nothing to build. Commit and push to deploy.

---

## Local preview

Serve over **HTTP**, not `file://` — the React documents fetch their `.jsx` and
need a real origin for Babel:

```bash
python -m http.server 8000      # then open http://localhost:8000/
```

---

## Deployment

GitHub Pages serves the `main` branch directly. **Push to `main` to deploy** —
there is no build or release pipeline.

CDN objects can occasionally get stuck on an old version; a trivial content
change to the affected file (or re-adding `.nojekyll`) is the usual way to
unstick it.

---

## Conventions & gotchas

- **No build step anywhere at the root.** Don't introduce a bundler, framework,
  or `package.json` for the catalog itself.
- **`data.js` is the registry.** Every published `<slug>/` directory should have
  a matching `ESSAYS` entry; a directory with no entry is invisible on the site.
- **Don't hand-edit pre-built Vite bundles** — rebuild from source and copy
  `dist/*` over (see [Document flavors](#document-flavors)).
- **Mirror imported documents upstream** — there's no automatic sync.
- `CLAUDE.md` carries the detailed working notes for AI coding agents; this
  README is the human-facing overview. Keep the two consistent when conventions
  change.

---

## Do not publish

**Praedex is internal.** Never add, deploy, or commit any Praedex files (e.g.
`Praedex*.zip`, `Praedex*Deep Dive*.html`, `Praedex UI.zip`) to this repo. They
may appear in `Downloads` alongside publishable documents — skip them.
