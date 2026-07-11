# ALM-BUG-KILN-00005 — Tidecall face-card J/Q/K/A watermark never renders

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
- **Area:** tidecall
- **Raised:** 2026-07-11
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
- **State history:** Open (2026-07-11, raised by Claude — found during the mobile-cards/flicker work)
- **State history:** Fixed (2026-07-11, fixed by Claude in 9721728; awaiting independent verification)

## Observation
The faint J/Q/K/A ghost letter designed to sit behind a face card's pip has never rendered.
Repro over `http://localhost:8000/tidecall/`: deal a hand containing a face card (J/Q/K/A);
expected a large faint rank letter watermark behind the central pip; actual, nothing.

Verified in headless Chrome: on a rendered face card,
`getComputedStyle('.card-art','::before').content` resolved to the empty string `""`, and
`.card-art` carried no `data-face` attribute.

## Notes
Root cause: the attribute was written to the wrong element. `createCardElement` set
`node.dataset.face` on the `.playing-card` button, but the watermark is drawn by
`.playing-card.face-card .card-art::before { content: attr(data-face) }`, and `attr()`
resolves against the pseudo-element's originating element — `.card-art`, which had no
`data-face` — so content resolved to `""`. Latent since the feature was written.

Fixed in `9721728` by writing the attribute onto `.card-art`
(`$('.card-art', node).dataset.face = …`); no CSS change. Kept after a visual check — the
faint ghost letter looks right on the larger cards (the em-based card typography scales it).

Regression (no DOM harness): behavioral before/after in headless Chrome (the `::before`
content went `""` → `"K"`/`"A"`), plus a source-pattern guard in
`tidecall/validate-static.test.js` asserting `data-face` targets `.card-art` and not the
button. Independent closure still required.
