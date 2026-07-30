# ALM-BUG-KILN-00028 — Tidecall round/match recap modals open with focus on `<body>`, never inside the dialog

- **State:** Fixed
- **Priority:** Should
- **Severity:** Low
- **Area:** tidecall
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
- **State history:** Open (2026-07-13, raised by Claude — split from ALM-BUG-KILN-00002 during its independent two-eyes verification; this is a regression *introduced* by that bug's fix, `b2c47f0`)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
Repro over `http://localhost:8000/tidecall/`: start a voyage and play a round out to its recap
modal (or finish the match to reach the match-end modal). Expected: keyboard focus moves into the
`aria-modal="true"` dialog when it opens. Actual: focus is never moved into the dialog —
`document.activeElement === document.body`.

Verified in headless Chrome on `origin/main`: opening the round recap or the match-end modal gives
`activeIsBody: true`. On the pre-fix source (`b2c47f0~1`) the same probe showed
`document.activeElement` = the `×` button, i.e. inside the dialog.

Impact is a11y/keyboard only, not a functional block: pressing Tab does recover, because the Tab
trap filters by visibility and reaches CHART NEXT ROUND / HOME. Escape correctly does nothing on
these two modal types.

## Notes
Root cause: `openModal` (`tidecall/app.js:785`) chooses the initial focus target with an
**unfiltered** query:

```js
$('button:not([disabled]), [href], input:not([disabled])', dom.modalLayer)
```

`.modal-close` is the **first** button in the modal markup (`tidecall/index.html:203`). The
ALM-BUG-KILN-00002 fix made the round/match recaps non-dismissable by setting that button
`hidden` — so the query still selects it, and `.focus()` on a `display:none` element is a no-op.
Focus therefore stays on `<body>`.

The codebase already knows how to do this correctly: the Tab trap at `tidecall/app.js:1080`
filters candidates by `offsetParent !== null`. `openModal` simply does not.

Suggested fix (one line) — take the first *visible* focusable, mirroring the Tab trap:

```js
$$('button:not([disabled]), [href], input:not([disabled])', dom.modalLayer)
  .find((el) => el.offsetParent !== null)
```

Regression coverage: prefer a behavioural check (open each modal type in headless Chrome, assert
`document.activeElement` is inside `#modal-content`) over another source-text regex — see
ALM-BUG-KILN-00029 for why the source-regex guards in this document are weak.

Secondary nit, same area: the "round/match are non-dismissable" rule is now duplicated at
`app.js:1058` and `app.js:1076` with different spellings. The next modal type added is easy to get
wrong; consider hoisting one `NON_DISMISSABLE` set.

## Fix (2026-07-21)
`openModal`'s initial-focus query now filters to the first VISIBLE control
(`$$(...).filter(el => el.offsetParent !== null)[0]`), mirroring the Tab trap. On the
round/match recaps the ✕ is hidden, and the old unfiltered `$(...)` picked that hidden button
so focus fell back to `<body>`; the fix moves focus inside the dialog. Regression:
tidecall/validate-static.test.js pins that openModal's focus selection uses the offsetParent
visibility filter.
