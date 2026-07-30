# ALM-BUG-KILN-00046 — Tidecall board-constant and morning-run regression guards are still source regexes, not behavioural oracles

- **State:** Fixed
- **Priority:** Should
- **Severity:** Medium
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T231417Z-p83989-n290267000-c1 branch=task/bug-ALM-BUG-KILN-00046-run-fix-20260730T231417Z-p83989-n290267000-c1 code=6bcda3e5294506c5ee219c60598c14d78fac7d65 gate=manual)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00029** (2026-07-30). That bug recorded three manifestations of "regression guards that pin a spelling rather than an invariant". Its fix (`c0a9c7b`) addressed manifestation (1) properly — the vacuous confetti guard became a real behavioural oracle, `tidecall/celebrate.test.js`, which was mutation-proven during verification. Manifestations (2) and (3) were explicitly deferred in the fix note as "better tracked as their own follow-up items", **and no such item was ever created**. This is that item.

**(2) The Tidecall board-overflow guard asserts magic constants it cannot validate.** `tidecall/validate-static.test.js:80-89` asserts the literal strings `100dvh - 106px`, `100dvh - 101px`, `100dvh - 73px`. The bug those constants guard (ALM-BUG-KILN-00004) was *caused* by exactly these constants going stale against the real chrome. Change `.topbar { min-height }`, the app-shell padding or `.game-screen { padding-top }` and the constants silently rot while the test stays green. The 2026-07-21 pass then **added a near-duplicate of the same assertion** at `:141-148`, so the repo now carries two copies of a guard that cannot detect the failure mode it exists for.

**(3) The `morning-run` guards are source regexes against `app.jsx`.** Two of its three assertions match source text; only the `meanMs`/`fmtDuration` assertion is a real behavioural check, and that one is library-level rather than component-level.

**Expected:** each guard fails for the *reason* the bug existed, not merely on a literal revert of the fix commit.

## Fix

<unfixed — raised only>

## Notes

Direction suggested by ALM-BUG-KILN-00029, still applicable:
- For the board geometry, *compute* the chrome from the CSS, or measure it in headless Chrome and assert `pageScrollsBy === 0`, rather than asserting magic numbers. `onu/tests/browser.test.mjs` already drives real Chrome over the DevTools Protocol from plain Node with no extra dependency, and `game-of-dracula/browser.test.mjs` now does real hit-testing — both are good prior art.
- Fold the duplicate constant assertion at `tidecall/validate-static.test.js:141-148` into whatever replaces `:80-89`; do not keep two.
- For `morning-run`, extract the DOM-free logic and unit-test the behaviour.
- Keep source-pattern guards only for things that genuinely are source facts (e.g. "no external runtime dependency").

Note this work would also naturally subsume ALM-BUG-KILN-00045 (an LF-only source regex in the same file), and ALM-BUG-KILN-00004 is currently Open pending a real browser measurement of the residual scroll — the three are best sequenced together.

Consider adding the standard to `BUGFIX-GUIDE.md`: a guard must fail for the reason the bug existed, not merely on a literal revert.
