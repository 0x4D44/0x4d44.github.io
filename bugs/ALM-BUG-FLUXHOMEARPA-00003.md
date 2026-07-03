# ALM-BUG-FLUXHOMEARPA-00003 — Nihon Quest roleplay safe answers disappear after content overlay

- **State:** Open
- **Priority:** Must
- **Severity:** High
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
The shipped DC app applies `content-extra.js` in `japanese-travel-rpg/index.html:516` and replaces each overlaid phrase with a new ID at `japanese-travel-rpg/index.html:517`. Roleplay steps were already built in `japanese-travel-rpg/content.js:29` from the original generated phrase IDs. Later, roleplay feedback and safe-answer rendering look up `expectedPhraseIds` in the overlaid phrase map at `japanese-travel-rpg/engines.js:27` and `japanese-travel-rpg/index.html:910`, filtering out every missing result.

Expected: roleplay feedback should show the safe phrase suggestions for each step after authored content is overlaid.

Actual: the expected phrase IDs no longer exist after overlay, so safe-answer lists and feedback suggestions are empty.

## Notes
Static verification applied the same overlay as `index.html` and found every roleplay `expectedPhraseIds` entry missing. Concrete fix: preserve explicit stable phrase IDs through the overlay, or rebuild each chapter's roleplay steps after applying authored phrases. Add a self-check that imports the shipped content graph and asserts all roleplay expected phrase IDs resolve.
