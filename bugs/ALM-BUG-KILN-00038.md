# ALM-BUG-KILN-00038 — Installed on a notched iPhone, the topbar sits under the status bar (no safe-area insets)

- **State:** Closed
- **Priority:** Should
- **Severity:** Low
- **Area:** game-of-dracula
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T170001Z-p74152-n932726000-c1 branch=task/bug-ALM-BUG-KILN-00038-run-fix-20260730T170001Z-p74152-n932726000-c1 code=e31cec6018f7d6febe0de6b8c212bb3e920d6214 gate=manual)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit e31cec6 verified; every selector named in the observation now carries the insets at both breakpoints. Modal residual split to ALM-BUG-KILN-00050)

## Observation

The page opts into `viewport-fit=cover` (`game-of-dracula/index.html:5`), a black-translucent
status bar (`index.html:9`) and manifest `display: standalone` with `orientation: any`, but
only the *bottom* inset is honoured — `env(safe-area-inset-*)` is used exactly once, for
`--safe-bottom` (`styles.css:21`).

`.topbar` uses `padding: 10px clamp(12px,2.4vw,34px)` (`styles.css:97`) and `padding: 8px 10px`
below 720px (`styles.css:293`), with no safe-area top or left padding.

Installed to the home screen on a notched iPhone in portrait, the web view starts at y=0, so
the ~47px status bar overlays the whole `.brand-kicker` / `.brand-title` and the top half of
the 42px `.icon-button` row — the Rules / Settings / Sound buttons become partly untappable.
In landscape (`orientation: any`) `safe-area-inset-left` is ignored too, putting the brand
button and the board's left edge under the notch.

Expected: installed standalone, no control sits beneath the status bar or notch in either
orientation.

## Notes

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports every referenced fact as accurate and found no
handling elsewhere (a repo-wide grep for `safe-area` returns exactly the one CSS use). That
verifier downgraded severity to Low, since it affects the installed-PWA path on notched
devices rather than the browser path.

Not reproducible on this fleet (no notched iOS device to hand) — verify on real hardware or in
a simulator, or at minimum assert the computed padding responds to an injected
`safe-area-inset-top`.

Likely correct fix: add `padding-top: max(10px, env(safe-area-inset-top))` and matching
left/right insets to `.topbar`, mirroring the existing `--safe-bottom` treatment.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `e31cec6018f7d6febe0de6b8c212bb3e920d6214` exists, is an ancestor of HEAD, and touches `styles.css` (+15/-10), `browser.test.mjs` (+43), `sw.js` — matching the notes.

**Original observation re-checked — resolved for every element the observation names.** `styles.css:21-24` adds `--safe-top`/`--safe-right`/`--safe-left` on `:root` alongside the existing `--safe-bottom`. Consumers verified present at *both* breakpoints: `.topbar` (`:101` base and `:299` ≤720px), `.setup-screen` (`:53`, `:293`, `:298`), `.game-layout` (`:120`, `:300`), `.command-panel` sticky `top`/`max-height` (`:198`), `.handoff-overlay`/`.curse-overlay` (`:280`), `.toast-region` (`:287`), `.skip-link` (`:42`). No later rule re-declares those paddings without the insets.

**Limit of this verification:** the rendered result on a notched device was not observed — no hardware, and the emulated check was not re-run by the verifier.

**Regression coverage:** `game-of-dracula/browser.test.mjs:303-344` injects `Emulation.setSafeAreaInsetsOverride {top:47,left:18,bottom:34,right:18}` and asserts computed padding on `.topbar` (top ≥55, left/right ≥28), `.setup-screen` and `.game-layout` — exactly the "assert computed padding responds to an injected inset" fallback this bug asked for. Run green by the lead.

**Residual split to ALM-BUG-KILN-00050.** `.modal { width: min(920px, calc(100vw - 24px)) }` at `styles.css:249` is inset-blind, and native `<dialog>`s centre in the viewport — so in landscape on a notched device (`orientation: any` in the manifest) the Rules/Settings/Victory dialog's leading edge sits ~12px from the display edge, inside a 44-59px notch inset. That is outside the recorded observation, which named the topbar, the brand button and the board's left edge, but it does bear on this bug's literal "Expected", so it is tracked rather than dropped.
