# ALM-BUG-KILN-00029 — Tidecall regression guards are source-text regexes: they pin yesterday's spelling, not the invariant

- **State:** Open
- **Priority:** Should
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude — split from the independent two-eyes verification of ALM-BUG-KILN-00003 and ALM-BUG-KILN-00004)

## Observation
Every Tidecall regression guard added by the recent bug-fix batch is a **regex over source text**
in `tidecall/validate-static.test.js`. Each one satisfies the letter of the
regression-before-Fixed rule — it does fail on a straight `git checkout <fix>~1 -- app.js` — while
failing its spirit: it asserts that a particular *string* is present, not that the *behaviour* is
correct. Two of them were demonstrated to be materially weaker than the ledger claimed.

**1. The confetti guard is effectively vacuous (ALM-BUG-KILN-00003).** The guard is
`validate-static.test.js:95`: `assert.match(app, /if \(celebrateRaf\) cancelAnimationFrame\(celebrateRaf\)/)`.
That cancel line is only meaningful because `celebrateRaf` is *assigned* the live rAF id at
`app.js:977` and `:980`. Proven by mutation on `origin/main`: keep the asserted cancel line, revert
only those two assignments to a bare `requestAnimationFrame(frame)`, and —

```
guard:     ✓ the confetti animation cancels a live burst before starting a new one   (PASSES, exit 0)
behaviour: ERASED: [A]  ZOMBIE: true  cancelAnimationFrame calls: 0   -> SYMPTOM PRESENT
```

The **entire original bug** returns with the regression test green.

**2. The board-overflow guard cannot detect the mechanism that caused the bug
(ALM-BUG-KILN-00004).** `validate-static.test.js:72-80` asserts the literal strings
`100dvh - 106px`, `100dvh - 101px`, `100dvh - 73px`. But the bug was *caused* by those constants
going stale relative to the real chrome. Change `.topbar { min-height }`, the app-shell padding, or
`.game-screen { padding-top }`, and the three constants silently rot again — while the test stays
green. The guard encodes yesterday's answer, not the invariant that produced it.

**3. Same shape in `morning-run` (ALM-BUG-KILN-00001).** Two of its three assertions are source
regexes against `app.jsx`; only the `meanMs`/`fmtDuration` assertion is a real behavioural check,
and it is library-level rather than component-level.

## Notes
This is test-quality debt, not a shipped-code defect — but it is the reason a fix can be recorded
as "covered" while the defect remains one refactor away from returning. It also produces false
alarms: a harmless rename of `celebrateRaf`, or a semantically-identical JSX reformat, fails the
suite for no reason.

Root cause (process): `BUGFIX-GUIDE.md` correctly says there is no DOM harness for the static docs,
and a source-pattern guard became the path of least resistance. But a behavioural oracle is
usually cheap and needs no browser — the verifier who found (1) wrote one in ~60 lines: extract
`celebrate()`, drive it with a fake rAF scheduler and a canvas op-log, then assert *one* live loop
and *zero* erased bursts after an overlapping call. That pins the invariant; the regex pins a
spelling.

Suggested direction (not prescriptive):
- Where the logic is extractable and DOM-free, unit-test the behaviour (the confetti oracle above).
- Where geometry is the point (board overflow), *compute* the chrome from the CSS or measure it in
  headless Chrome and assert `pageScrollsBy === 0`, rather than asserting magic constants. Note
  ALM-BUG-KILN-00004 is currently reopened precisely because the page still scrolls.
- Keep source-pattern guards only for things that genuinely are source facts (e.g. "no external
  runtime dependency").
- Consider adding this to `BUGFIX-GUIDE.md` as a standard: a guard must fail for the *reason* the
  bug existed, not merely on a literal revert.

Prior art worth copying: `onu/tests/browser.test.mjs` already drives real Chrome over the
DevTools Protocol from plain Node with no extra dependency.
