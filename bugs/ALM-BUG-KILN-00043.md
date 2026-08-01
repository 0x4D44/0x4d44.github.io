# ALM-BUG-KILN-00043 — Nihon Quest same-origin vendoring left the document's own build and self-check gates red on Windows

- **State:** Closed
- **Priority:** Must
- **Severity:** High
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-30
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T225253Z-p30268-n693916000-c1 branch=task/bug-ALM-BUG-KILN-00043-run-fix-20260730T225253Z-p30268-n693916000-c1 code=06784158c0ec02b469fe7d60dc6641e241e87201 gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit 0678415 verified; both gates now pass and `.gitattributes` grants the vendor files `-text`, which is the platform-independent fix for the Windows CRLF/SRI failure)

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

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `0678415`). **Both recorded failures are resolved.**

**1. The document's build is green.**

```
$ cd japanese-travel-rpg && node tools/build.mjs
PASS build: static app validated (16 chapters, 80 phrases, 64 signs).   exit 0
```

`tools/build.mjs:16` and `:24` now list `ios-frame.js`, which matches what `index.html:34`
actually references (`from="./ios-frame.js"`) — the fix aligns the manifest with reality rather
than reverting the x-import.

**2. The vendored-bytes failure is fixed at its root.** `.gitattributes` now carries
`japanese-travel-rpg/vendor/*.js -text`, mirroring the existing `broadband-speed-checker` line.
Git confirms the attribute is live:

```
$ git ls-files --eol japanese-travel-rpg/vendor/
i/lf    w/lf    attr/-text    japanese-travel-rpg/vendor/react-dom.production.min.js
i/lf    w/lf    attr/-text    japanese-travel-rpg/vendor/react.production.min.js

$ cd japanese-travel-rpg && node tests/self-check.mjs
PASS self-checks: content, route unlocking, SRS, persistence, phrasebook search, romaji settings, AI gating, PWA assets.
```

`-text` suppresses `core.autocrlf` conversion, so a stock Windows checkout now gets the LF blobs
the pinned SRI hashes were computed over. **Verification limit, stated plainly:** this was
verified on macOS, so the CRLF checkout itself was not exercised; the evidence is the live
`attr/-text` marking, which is what governs the conversion on every platform.

**Proven to bite (fails-before / passes-after), both halves:**

```
restore "ios-frame.jsx" in tools/build.mjs
  -> Error: index.html does not reference ios-frame.jsx        (the recorded error, verbatim)
delete the japanese-travel-rpg line from .gitattributes
  -> AssertionError: vendored runtime bytes must not be rewritten by core.autocrlf on Windows
```

The second is the new guard the fix added at `japanese-travel-rpg/tests/self-check.mjs:102` —
it pins the `.gitattributes` line itself, so the fix cannot silently rot.

**Carried forward, not residuals of this fix.** The two smaller gaps this bug's Notes recorded as
deliberately out of scope remain untracked and unfixed: `/almanac-back.js` is absent from the
service-worker `ASSETS` precache list, and nothing pins `ios-frame.js` to its `ios-frame.jsx`
source. Neither is part of this bug's Expected, so they do not block closure.
