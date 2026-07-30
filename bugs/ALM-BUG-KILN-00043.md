# ALM-BUG-KILN-00043 — Nihon Quest same-origin vendoring left the document's own build and self-check gates red on Windows

- **State:** Open
- **Priority:** Must
- **Severity:** High
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-30
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20260730T225253Z-p30268-n693916000-c1
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-KILN-00043-run-fix-20260730T225253Z-p30268-n693916000-c1
- **Owner base:** 0f8c5a6faf150b5ee07fcc45f0574090f525c2e1
- **Owner fingerprint:** -
- **Owner since:** 2026-07-30T22:52:53Z
- **Owner until:** 2026-07-31T00:52:53Z
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-FLUXHOMEARPA-00001** (2026-07-30). Both defects are consequences of that fix (`b816049`) vendoring React same-origin and repointing the x-import; neither is caught by the root `npm test`, because `japanese-travel-rpg` is not chained into it.

**1. The document's `npm run build` is red.** `japanese-travel-rpg/tools/build.mjs:16` and `:24` still list `ios-frame.jsx` as a required asset and a required `index.html` reference, but `index.html:34` now reads `from="./ios-frame.js"`. Real output at `origin/main` 46c1859:

```
$ cd japanese-travel-rpg && node tools/build.mjs
Error: index.html does not reference ios-frame.jsx
    at .../japanese-travel-rpg/tools/build.mjs:25:34
```

At the fix's parent `de7409b` the same script prints `PASS build: static app validated (16 chapters, 80 phrases, 64 signs).` and exits 0. So this is a regression the fix introduced.

**2. The document's `npm test` is red on any Windows checkout, and the app will not boot in a local preview.** `japanese-travel-rpg/vendor/*.js` were vendored without the `-text` attribute that `.gitattributes` already grants `broadband-speed-checker/vendor/*.js` ("Vendored runtime files are loaded with SRI hashes; keep checkout bytes stable"). With the fleet-default `core.autocrlf=true` the checkout bytes are CRLF while the pinned SRI hashes are of the LF blobs:

```
$ git ls-files --eol japanese-travel-rpg/vendor/
i/lf    w/crlf  attr/    japanese-travel-rpg/vendor/react-dom.production.min.js
i/lf    w/crlf  attr/    japanese-travel-rpg/vendor/react.production.min.js

$ cd japanese-travel-rpg && node tests/self-check.mjs
AssertionError: vendor/react.production.min.js must be byte-identical to the pinned REACT_SRI
+ actual   'sha384-t63xaoqI4/tnZOZs58Xd/POzyY+r0ZlL3MZJsg5uEpKiDX6mJDAaS/KuesDjH55i'
- expected 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z'
```

Beyond the test: a local `python -m http.server` preview on Windows serves the CRLF bytes against the LF-derived `integrity` at `support.js:1582`, so the browser rejects React/ReactDOM and the app does not mount. **GitHub Pages serves the LF blobs, so production is unaffected** — this bites local development and the gate only.

**Expected:** `npm run build` and `npm test` both pass inside `japanese-travel-rpg/` on a stock Windows checkout, and a local HTTP preview boots the app.

## Fix

<unfixed — raised only>

## Notes

Both are one-line changes:
- swap `"ios-frame.jsx"` for `"ios-frame.js"` in both lists at `tools/build.mjs:16` and `:24`;
- add `japanese-travel-rpg/vendor/*.js -text` to the root `.gitattributes`, mirroring the existing `broadband-speed-checker` line, then re-checkout the two files so the working-tree bytes match the blobs.

Related smaller gaps found in the same verification but deliberately not folded in here: `/almanac-back.js` is not in the service-worker `ASSETS` precache list, so the shared back button is absent offline; and nothing pins `ios-frame.js` to `ios-frame.jsx`, so the transpiled copy and its source can drift silently.
