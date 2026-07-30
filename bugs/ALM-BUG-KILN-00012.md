# ALM-BUG-KILN-00012 — Daily spaced-review drills never count as a Training day (Long Tour medal unreachable via drilling)

- **State:** Closed
- **Priority:** Should
- **Severity:** Medium
- **Area:** darmok
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — drill branch now records the training day before checkMedals)

## Observation
A user who has finished the available lessons and now only does the daily drill never increments their "Training days" count, and can never earn the 30-day "Long Tour" medal -- despite the app telling them to drill daily.

Repro over http://localhost:8000/darmok/: finish a drill on a day with no lesson completion. Expected: Training days +1. Actual: unchanged.

## Notes
Confirmed by direct code read: the only P.days write is in the lesson-finish path (`if (!P.days.includes(today)) P.days.push(today)`, app.js:658). The drill-finish branch of finishSession (app.js:633-640) never touches P.days. The Long Tour medal needs P.days.length >= 30 (app.js:66). The app markets drilling as the everyday habit ("Ten minutes a day here beats an hour of cramming", app.js:730; "no streaks. days simply count up.", app.js:940) -- so the promoted activity does not advance the stat it implies.

Fix: in the drill branch of finishSession, before checkMedals, add `const today = new Date().toISOString().slice(0,10); if (!P.days.includes(today)) P.days.push(today);`. Reported by the devil's-advocate lens; verified directly (P.days grep shows the single write site at 658).

## Fix (2026-07-21)
The drill branch of `finishSession` now records the day —
`const today = new Date().toISOString().slice(0,10); if (!P.days.includes(today)) P.days.push(today);`
before `checkMedals` — so drilling (the everyday habit the app promotes) advances the
"Training days" stat and makes the 30-day Long Tour medal reachable by drilling alone.
Regression: darmok/handlers.test.mjs asserts the drill branch pushes today into P.days.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `8924ceb`.

**Original observation re-checked — resolved.** `darmok/app.js:671-672` pushes today's ISO date into `P.days` inside the `if (S.drill)` branch of `finishSession`, ahead of the `checkMedals` call at `:676` and the branch's own `return` at `:682`. `checkMedals` awards `long-tour` on `P.days.length >= 30` (`app.js:66`), so the medal is now reachable by drilling alone. `P.days` is guaranteed to be an array by `app.js:9` (`P.days = P.days || []`), so the push cannot throw on a legacy payload.

**Limits of this verification:** no end-to-end drill run was performed, and the regression guard in `darmok/handlers.test.mjs` is a source-shape oracle (confirmed to fail against pre-fix `app.js`) — it proves the statement is on the right branch, not that a drill increments the counter.

**Noted, not a regression:** `toISOString()` is UTC, so a late-evening drill in a positive-offset timezone books the next day. The lesson path (`app.js:701`) uses the identical expression, so the two remain consistent with each other.
