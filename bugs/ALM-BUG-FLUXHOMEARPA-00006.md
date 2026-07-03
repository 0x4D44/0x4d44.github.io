# ALM-BUG-FLUXHOMEARPA-00006 — Nihon Quest bottom-nav icon bindings are malformed

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)

## Observation
Three bottom-navigation icon backgrounds in `japanese-travel-rpg/index.html` have malformed DC interpolation syntax: `background:{{ nav3 "` at `japanese-travel-rpg/index.html:279`, `background:{{ nav4 "` at `japanese-travel-rpg/index.html:281`, and `background:{{ nav5 "` at `japanese-travel-rpg/index.html:282`.

Expected: the Phrases, Passport, and Profile icons should receive their active/inactive background colors from `nav3`, `nav4`, and `nav5`.

Actual: the missing closing `}}` leaves invalid literal CSS in the style attributes, so those icon fills do not render the intended state.

## Notes
Concrete fix: close the interpolation markers for `nav3`, `nav4`, and `nav5`. Add a template self-check for balanced `{{ ... }}` in `index.html`.
