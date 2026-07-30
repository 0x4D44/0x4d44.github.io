# Adversarial review log

Six deliberately separated critic passes were run with different failure goals. The available runtime did not expose an independent-agent launcher, so these are role-isolated, fresh-brief reviews rather than claims of separately hosted model instances. Each pass left a written record in `reviews/`; accepted findings were implemented and re-tested.

## Iteration summary

1. **Authenticity critic:** challenged every claim of originality and period fidelity. Result: evidence ledger, in-game Archive, `RESTORATION_RULES`, original SVG only, and the photographed eighteen-sector cyclic order.
2. **Rules lawyer / game theorist:** attacked phase transitions, exact movement, curse transfer, tie-breaks, opening order, and termination. Result: finite exact paths, Green HOME deadlock fix, victim-choice phase, deterministic opening/round accounting, and large multi-seed simulation.
3. **Mobile / accessibility critic:** reviewed 390 px portrait play, keyboard flow, colour dependence, reduced motion, and pass-and-play secrecy. Result: non-overlapping mobile layout, numbered destination controls, complete rule-tab keyboard semantics, high contrast, and modal hand-off gating.
4. **State / security critic:** treated every save and optional browser API as hostile. Result: comprehensive same-version state validation, exact RNG restore, guarded storage/audio/crypto/dialog use, escaped names, and path-scoped service-worker cleanup.
5. **QA / performance critic:** looked for stale references, browser-only failures, oversized assets, bad caches, and misleading balance claims. Result: fixed the command-panel reference, added static/syntax gates, exercised complete browser games, and separated termination evidence from strategic-balance claims.
6. **Maintainer re-verification:** re-read primary visual evidence, replayed the UI, inspected every restoration boundary, and reviewed the final source as a hostile repository maintainer. Result: corrected six-wedge/two-ended spinner geometry; blocked first-turn information leakage; prevented advice changing future spins; strengthened save validation; preserved Green's pre-bite perch; and fixed the former holder hiding under the new Green Vampire.

## Final retained evidence

- 18/18 Node tests.
- 5,000/5,000 four-automata simulations, with repeated save/restore in the first 400.
- Three complete four-automata Chromium playthroughs.
- One complete two-human pass-and-play Chromium game with 24 modal hand-offs.
- Save/resume and 390 px responsive checks with no console or page errors.
- Static ID, dependency, and service-worker-scope audit.

See `QA.md` for exact results and the individual review files for attack questions, findings, and dispositions. Earlier numerical results inside reviews 01–05 record the state at those intermediate passes rather than the final totals.
