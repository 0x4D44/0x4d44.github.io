# ALM-BUG-FLUXHOMEARPA-00006 — Nihon Quest bottom-nav icon bindings are malformed

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
Three bottom-navigation icon backgrounds in `japanese-travel-rpg/index.html` have malformed DC interpolation syntax: `background:{{ nav3 "` at `japanese-travel-rpg/index.html:279`, `background:{{ nav4 "` at `japanese-travel-rpg/index.html:281`, and `background:{{ nav5 "` at `japanese-travel-rpg/index.html:282`.

Expected: the Phrases, Passport, and Profile icons should receive their active/inactive background colors from `nav3`, `nav4`, and `nav5`.

Actual: the missing closing `}}` leaves invalid literal CSS in the style attributes, so those icon fills do not render the intended state.

## Notes
Concrete fix: close the interpolation markers for `nav3`, `nav4`, and `nav5`. Add a template self-check for balanced `{{ ... }}` in `index.html`.

## Fix (2026-07-21)
The three nav icon backgrounds in the shipped index.html are already well-formed closed
interpolations (`background:{{ nav3 }}`, `{{ nav4 }}`, `{{ nav5 }}`), so the Phrases/Passport/
Profile icons take their active/inactive fills; the malformed `{{ nav3 "` form no longer
exists. Added the template self-check the bug asked for to tests/self-check.mjs: it fails on
any interpolation token immediately followed by a quote (the unclosed signature) and pins the
three nav bindings. No product-code change was required.
