# Review 06 — hostile maintainer re-verification

## Attack brief

Review the finished work as though rejecting an unsolicited large PR. Re-read the best primary evidence, compare every visible component with the implementation, play complete games, inspect the state machine and save boundary line by line, test mobile and pass-and-play behaviour, and refuse vague “looks good” claims.

## Findings and dispositions

- **Critical — spinner geometry:** the first implementation had the right broad probabilities but the wrong inner construction. The photographed card has six 60° inner wedges and a two-ended pointer, not eight inner wedges. Rebuilt the SVG, documentation, and exact cyclic test.
- **Critical — hand-off privacy:** `presentedHuman` was initialized to the opening player, suppressing the first privacy gate. Initialize it empty; make the game inert while the modal gate is visible; trap focus and block click/keyboard actions beneath it.
- **Critical — advice changed fate:** random tie-breaking inside `chooseBestMove` advanced the same generator used by the spinner. Replaced it with a deterministic hash derived from seed/action/player/destination; added an RNG-isolation regression.
- **High — hostile saves:** same-version JSON could contain plausible-looking but contradictory phases and pieces. Added comprehensive structural and relational validation before restoring.
- **High — first-bite continuity:** resetting Green to perch 1 on first bite erased earlier Green spinner results. The new holder now joins the unclaimed piece at its current perch; explicitly labelled as a restoration because the relevant continuation page is missing.
- **High — former-holder collision:** at a numbered hidey-hole, nearest-cover logic could place the released player underneath the new Green Vampire. Exclude the occupied Green node, prefer the next safe hidey-hole, and test the perch case directly.
- **Medium — motion/platform robustness:** respect reduced motion in piece, pulse, spin, and curse effects; guard dialog APIs; retain gameplay when storage, sound, or cryptographic randomness is unavailable.
- **Medium — cache ownership:** increment the app cache and remove only this project's old cache keys.

## Re-verification evidence

- 18/18 deterministic and invariant tests pass.
- The first 400 of 5,000 seeded simulations survive repeated serialize/restore cycles.
- 5,000/5,000 four-automata simulations complete without stalls.
- Three fresh complete four-automata Chromium nights include multiple Dracula bites and mask transfer.
- One complete two-human Chromium night passes through 24 modal hand-offs; shortcuts and focus cannot bypass the gate.
- Save/resume returns to the expected phase and privacy gate without browser errors.
- A 390 px viewport has no horizontal overflow.
- Static PWA audit confirms seven path-relative core assets and project-scoped cache cleanup. The sandbox blocked a fresh local-navigation/offline runtime pass, so none is claimed here.

## Verdict

Accept as a draft PR. The game is visually distinctive, mechanically coherent, deterministic, testable, and honest about the five places where the missing rule continuation required a restoration decision. The remaining review risk is historical discovery of a complete continuation page, not a known gameplay or state-machine defect.
