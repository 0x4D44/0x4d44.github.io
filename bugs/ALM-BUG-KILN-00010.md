# ALM-BUG-KILN-00010 — ASK DATA and the A-to-kana IME toggle silently wipe the answer the user is typing

- **State:** Fixed
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

## Observation
On a typeback exercise, pressing ASK DATA (hint) or the A->kana converter toggle erases whatever the user has already typed.

Repro over http://localhost:8000/darmok/: on a "Type the Japanese for ..." card, type a partial answer (e.g. たべま), then tap ASK DATA (the affordance the tour tells you to use). Expected: hint appears, your text stays. Actual: the input is emptied; on mobile the soft keyboard re-opens and the viewport re-scrolls on top of the loss.

## Notes
Confirmed by direct code read: the type input is rendered with NO value attribute (app.js:510) and the live text is never mirrored to ex/S. Both the `hint` act (app.js:1186-1192) and the `toggle-ime` act (app.js:1154-1156) call rerenderEx() (app.js:1204), which does `holder.innerHTML = exerciseHtml(...)` -- discarding the input node and building a fresh empty one; wireTypeInput then re-focuses it (app.js:1018). These are exactly the two buttons a struggling learner is most likely to press mid-answer.

Fix: in rerenderEx(), stash the live value first -- `const cur = document.getElementById("type-in"); if (cur) L.queue[L.idx]._typed = cur.value;` -- and render it back in exerciseHtml's type branch with `value="${DK.esc(ex._typed || "")}"`. Reset _typed to "" in the retry copy alongside _hints/_hidden. Reported by the performance lens; verified directly.

## Fix (2026-07-21)
`rerenderEx()` now stashes the live input value into `L.queue[L.idx]._typed` before it
rebuilds `#excard`, and the type input renders `value="${DK.esc(ex._typed || "")}"`, so
pressing ASK DATA (hint) or the A→かな toggle mid-answer no longer discards what the learner
has typed. `_typed` is reset on the next exercise / on a requeue (the retry copy already
strips all `_`-prefixed keys, per KILN-00008). Regression: darmok/handlers.test.mjs.
