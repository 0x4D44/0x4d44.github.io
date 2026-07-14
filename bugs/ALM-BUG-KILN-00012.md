# ALM-BUG-KILN-00012 — Daily spaced-review drills never count as a Training day (Long Tour medal unreachable via drilling)

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

## Observation
A user who has finished the available lessons and now only does the daily drill never increments their "Training days" count, and can never earn the 30-day "Long Tour" medal -- despite the app telling them to drill daily.

Repro over http://localhost:8000/darmok/: finish a drill on a day with no lesson completion. Expected: Training days +1. Actual: unchanged.

## Notes
Confirmed by direct code read: the only P.days write is in the lesson-finish path (`if (!P.days.includes(today)) P.days.push(today)`, app.js:658). The drill-finish branch of finishSession (app.js:633-640) never touches P.days. The Long Tour medal needs P.days.length >= 30 (app.js:66). The app markets drilling as the everyday habit ("Ten minutes a day here beats an hour of cramming", app.js:730; "no streaks. days simply count up.", app.js:940) -- so the promoted activity does not advance the stat it implies.

Fix: in the drill branch of finishSession, before checkMedals, add `const today = new Date().toISOString().slice(0,10); if (!P.days.includes(today)) P.days.push(today);`. Reported by the devil's-advocate lens; verified directly (P.days grep shows the single write site at 658).
