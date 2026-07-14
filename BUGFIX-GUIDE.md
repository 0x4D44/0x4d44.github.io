# BUGFIX-GUIDE — 0x4d44.github.io

Repo-specific fix-session notes for this static GitHub Pages catalog. The
**generic lifecycle** (root-cause, regression-before-Fixed, two-eyes closure,
honest state transitions) lives in the fleet **`bug-tracking`** skill — read that
first. The ledger lives in **`bugs/`** (`bugs/README.md` documents the ID grammar
and states). This file records *only* what is specific to this repo; it can
strengthen the skill's process but never weakens its invariants.

## What "a bug" covers here
- **Root catalog** — `index.html`, `style.css`, `app.js`, `data.js` (the
  filter/sort/listing logic and the `window.ESSAYS`/`window.TAGS` data).
- **A document** under `<slug>/index.html` — static prose, in-browser React
  (JSX transpiled at load, no bundler), or a pre-built Vite bundle.

## Gates (build / lint / test)
There is **no bundler** — files are served verbatim (`.nojekyll`). But the repo
root **does** carry a `package.json` whose `test` / `build` scripts chain the
per-document test suites (brilliancy, humanity-retention, shipshape,
span-of-control, tidecall, onu, cruise-line, morning-run, darmok). **Run it** —
it is the only automated gate there is:

```
npm run build     # the static validators only (fast)
npm test          # the above plus engine suites + the onu headless-browser test
```

- Run with **stdin closed** (`npm test </dev/null`) so a stdin-reading test can't hang.
- The scripts are a single `&&` chain that hard-codes each doc's test path, so
  **retiring or renaming a doc that ships tests means pruning its segment from
  both scripts** — otherwise the dangling `node` call fails the whole gate.
- A doc that ships **no** tests (most of them) is not referenced there; adding one
  needs no `package.json` change.

Documents with no automated coverage still gate on **manual verification in a
real browser served over HTTP**:

```
python -m http.server 8000      # then open http://localhost:8000/
```

- Serve over **HTTP, never `file://`** — the React documents fetch `.jsx` and
  need a real origin for in-browser Babel.
- Use `mdscreensnap` to capture before/after visual evidence for UI/render bugs.
- For catalog-logic fixes (`app.js`/`data.js`), confirm the listing renders, the
  filter chips work, and sort/`localStorage` state behaves.

## Regression-before-Fixed (how it works without a harness)
The skill mandates regression coverage before a bug goes **Fixed**. There is no
test runner here, so coverage is a **documented, repeatable manual repro**, not an
optional hand-check:
- Record the exact **URL + steps** that reproduce the bug and the **expected vs
  actual**, and attach **before/after** evidence (screenshot via `mdscreensnap`,
  or the rendered output) proving it failed before the fix and passes after.
- State plainly in the bug's `## Notes` *why* automation is impractical (static
  site, no harness) and how you verified instead.

This **strengthens**, never weakens, the invariant: a bug is not **Fixed** until
its repro is captured and shown to pass, and closure still requires a second pair
of eyes.

## Editing caveats (do NOT patch the wrong artifact)
- **Pre-built Vite bundles** (`uk-isochrone/`, `edinburgh-isochrone/`,
  `mdisochrone/`, `night-cab/`, `worldviewer/`) are committed *built output* only.
  **Never hand-edit the minified `assets/index-*.js`/`.css`.** Fix the upstream
  source project, `npm run build`, then copy `dist/*` back over the `<slug>/`.
  Source locations are listed in `CLAUDE.md`.
- **Imported standalone repos** (`emu-cab/` ← `0x4D44/mdtrain`, `worldviewer/` ←
  `0x4D44/mdgpt54`) have no auto-sync — **mirror the fix back upstream** so a
  future re-import doesn't undo it.

## Version policy
Per the global convention, code changes need a version bump *in versioned repos*.
The **root catalog is not versioned** — a catalog/data/style fix needs no app
version bump (`data.js` content, prose edits, and CSS are content changes). A fix
inside a **versioned sub-project** (the Vite-bundle sources above) bumps that
project's version *in its upstream repo* as part of the rebuild. Pure
docs/journal/ledger edits never bump anything.

## Deploy & git
- **Worktree-first** (global CLAUDE.md): no direct commits to `main`; one worktree
  per task. Commit atomically on the specific paths you changed; **never push
  unless explicitly asked**.
- GitHub Pages serves `main` directly; pushing to `main` deploys. CDN objects can
  stick — a trivial content change to the affected file is the usual unstick.

## Do not publish
Never add/commit any **Praedex** files (see `CLAUDE.md`) — they may sit in
Downloads next to publishable documents; skip them.
