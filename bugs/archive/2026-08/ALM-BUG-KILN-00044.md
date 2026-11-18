# ALM-BUG-KILN-00044 — wifi-cartographer static validator mis-resolves its own directory on Windows, reddening the root npm gate

- **State:** Closed
- **Priority:** Must
- **Severity:** High
- **Area:** tests
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T230154Z-p56499-n092135000-c1 branch=task/bug-ALM-BUG-KILN-00044-run-fix-20260730T230154Z-p56499-n092135000-c1 code=eb9d5895cdee4752ec0a34cf528977250d8938e1 gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit eb9d589 verified; the recorded Windows path mangling is reproduced under the pre-fix idiom and eliminated by the fix, with a cross-platform regression test in both gates)

## Observation

Found while running the mandated repo gate during the 2026-07-30 verification pass. **The root `npm test` and `npm run build` are red on `origin/main` 46c1859 on any Windows checkout**, independently of any ledger bug.

```
$ node wifi-cartographer/tests/validate-static.mjs
  if (!existsSync(join(root, file))) throw new Error(`missing ${file}`);
Error: missing index.html
```

The files are present — `wifi-cartographer/index.html`, `styles.css` and `app.js` are all tracked and on disk. The validator computes its own directory as:

```js
const root = new URL('..', import.meta.url).pathname;   // wifi-cartographer/tests/validate-static.mjs:4
```

On Windows `URL.pathname` yields a leading-slash form, and `path.join` then produces a path that cannot exist:

```
pathname       = "/D:/worktrees/.../wifi-cartographer/"
join(...)      = "\\D:\\worktrees\\...\\wifi-cartographer\\index.html"
fileURLToPath  = "D:\\worktrees\\...\\wifi-cartographer\\"      <- the correct form
```

On Linux/WSL `pathname` is already a valid POSIX path, so the validator passes there — which is why it was not noticed. It was introduced by `ecd2f7c` ("Add Wi-Fi Cartographer discovery page (#23)").

**Expected:** `node wifi-cartographer/tests/validate-static.mjs` passes on a stock Windows checkout, so the root gate is green.

## Fix

<unfixed — raised only>

## Notes

One-line fix: `import { fileURLToPath } from 'node:url'` and use `const root = fileURLToPath(new URL('..', import.meta.url));`.

This is the last segment of the root `test` script, so it does not mask any other failure — but it does mean `npm test` cannot exit 0 on a fleet machine until it is fixed. Worth a sweep for the same `URL(...).pathname` idiom in the other per-document validators while fixing.

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `eb9d589`). **The recorded defect is resolved.**

**The recorded mechanism, reproduced and eliminated.** Running both idioms against the exact
Windows URL from the observation:

```
pre-fix  new URL("..", u).pathname   = "/D:/worktrees/site/wifi-cartographer/"
pre-fix  join(root, "index.html")    = "\\D:\\worktrees\\site\\wifi-cartographer\\index.html"   <- cannot exist
fixed    fileURLToPath(...)          = "D:\\worktrees\\site\\wifi-cartographer\\"
fixed    join(root, "index.html")    = "D:\\worktrees\\site\\wifi-cartographer\\index.html"       <- correct
```

`wifi-cartographer/tests/validate-static.mjs:5` now resolves its root through the new
`validatorRoot()` helper, and the validator passes here (`wifi-cartographer discovery page static
validation passed`, exit 0). **Verification limit:** run on macOS, so the Windows checkout itself
was not exercised — but the fix is verified against the Windows URL form directly, which is the
whole of the defect.

**Proven to bite (fails-before / passes-after).** Reverting `tests/path.mjs` to the `.pathname`
idiom on a scratch copy fails the new regression test with the recorded values:

```
not ok 1 - validatorRoot converts Windows file URLs to native filesystem paths
  expected: 'D:\\worktrees\\site\\wifi-cartographer\\'
  actual:   '/D:/worktrees/site/wifi-cartographer/'
```

The test uses `fileURLToPath(..., { windows: true })`, so it guards the Windows behaviour from
**any** platform — a Linux/WSL-only run can no longer miss it, which is exactly why this bug went
unnoticed. It is wired into both the root `test` and `build` scripts.

**The bug's own suggested sweep is satisfied.** A repo-wide search for the same
`new URL(..., import.meta.url).pathname` idiom now returns **no executable hits** — the only match
left is the quotation inside this bug file. No same-class residual remains.

**Gates:** root `npm test` and `npm run build` both exit 0 on this tree.
