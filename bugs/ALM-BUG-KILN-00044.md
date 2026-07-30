# ALM-BUG-KILN-00044 — wifi-cartographer static validator mis-resolves its own directory on Windows, reddening the root npm gate

- **State:** Fixed
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T230154Z-p56499-n092135000-c1 branch=task/bug-ALM-BUG-KILN-00044-run-fix-20260730T230154Z-p56499-n092135000-c1 code=eb9d5895cdee4752ec0a34cf528977250d8938e1 gate=manual)

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
