# ALM-BUG-KILN-00025 — validate-static resolves root-absolute refs against the document dir, so the whole npm gate is red

- **State:** Fixed
- **Priority:** Must
- **Severity:** Medium
- **Area:** tests
- **Raised:** 2026-07-13
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude — found while adding the northern-line-1987 document)
- **State history:** Fixed (2026-07-13, fixed by Claude in 41d401b; awaiting independent verification)
- **Note:** minted as KILN-00006 from a stale view; renumbered to KILN-00025 at integration after an overnight pass claimed 00006-00024 on the same host shard (see bugs/README.md).

## Observation
`npm run build` and `npm test` fail on a clean, unmodified checkout of `origin/main`
(reproduced at `974ba64`). No user-facing symptom — the live site is fine; this is a
blinded gate.

Repro from the repo root on a pristine clone:

```
npm run build
```

Expected: the chained per-document validators pass. Actual: exit 1 at the second link
in the chain —

```
validate-static: 29 checks passed                     <- brilliancy
AssertionError [ERR_ASSERTION]: index reference exists: /almanac-back.js
    at humanity-retention/tests/validate-static.mjs:32:10
```

Because the `test`/`build` scripts are a single `&&` chain, the run dies at the first
failure, which hid the fact that **four** validators are broken, not one.

## Notes
Root cause: each of these validators walks every `href`/`src` in its document's
`index.html` and asserts the target exists, but resolves the ref against **its own
document directory** and skips only external / protocol-relative / `data:` / anchor /
`../` forms — never **root-absolute** paths.

Every document carries the shared back-button include `<script defer
src="/almanac-back.js">` (a repo-wide requirement introduced *after* these tests were
written — see `CLAUDE.md`, "Site navigation"). So each validator computed
`join(appDir, "/almanac-back.js")` → `<doc>/almanac-back.js`, which does not exist
(the real file is at the repo root), and asserted false. Latent since the back button
was rolled out; nothing about it is document-specific.

All four affected, each with the same defect in slightly different clothing:

| validator | skipped forms | missing |
| --- | --- | --- |
| `humanity-retention/tests/validate-static.mjs:29` | `//`, `http(s):`, `data:` | root-absolute |
| `shipshape/tests/validate-static.mjs:18` | `#`, `../` | root-absolute |
| `span-of-control/tests/validate-static.mjs:22` | `#` | root-absolute |
| `tidecall/validate-static.test.js:42` | `http(s):`, `data:`, `#`, `mailto:`, `../` | root-absolute |

Fixed in `41d401b` by **resolving** a root-absolute ref against the repo root rather
than skipping it:

```js
const target = ref.startsWith("/") ? join(root, ref.slice(1)) : join(appDir, ref);
assert.ok(existsSync(target), `index reference exists: ${ref}`);
```

Skipping would have been the smaller diff but would have *neutered* the check — a
typo'd `/almanac-bak.js` would then pass silently. Resolving keeps the assertion's
teeth and, as a bonus, means the suite now positively validates that the shared back
button exists. `span-of-control` gained the `root` binding it lacked; `tidecall` gained
`REPO_ROOT`.

Regression coverage: the validators **are** the tests, so the defect is encoded
directly by the suite. Evidence:
- **Fail-before / pass-after**, run per-validator against pristine `origin/main` vs the
  fix: all four go FAIL → PASS.
- **Test-the-test** (proving the fix is not a vacuous skip): temporarily pointing each
  document's include at a bogus `/almanac-bak.js` still fails all four with
  `index reference exists: /almanac-bak.js`; probe reverted.
- Full gate green: `npm run build` exit 0; `npm test` exit 0 (31 tests, 0 fail,
  including the `onu` headless-browser test).

Also corrected `BUGFIX-GUIDE.md`, which told fixers the repo has "no build system, no
package manager, and no test suite" — stale (a root `package.json` gate exists), and
the reason a permanently-red gate went unnoticed. That claim is the process-level root
cause behind the code-level one.

Independent closure still required (two-eyes): I raised and fixed this, so I cannot
close it.
