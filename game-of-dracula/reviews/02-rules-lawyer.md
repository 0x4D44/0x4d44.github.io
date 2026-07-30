# Review 02 — hostile rules lawyer and game theorist

## Attack brief

Try to make the state machine stall, permit an impossible escape, create two Green Vampires, lose the active player, revisit stones forever, bias the opening seat, or diverge after save/restore.

## Findings and changes

- **Critical:** a Green Vampire could enter HOME on an exact route but cannot legally escape, leaving a player marooned on a terminal node. Green move generation now filters HOME; regression test added.
- **Critical:** multiple humans in Green's room needed an explicit choice phase. Added `await-victim`, human selection, deterministic automata selection and saveable pending state.
- **High:** always starting at seat zero created avoidable bias and contradicted the opening-spin rule. The Night number now deterministically chooses the opening seat. Round increments when play returns to that seat, not mechanically at player zero.
- **High:** exact movement over cycles could generate infinite or duplicative routes. Same-turn node revisits are forbidden and paths terminate at HOME.
- **High:** curse transfer must atomically release the old holder, transform the victim and move the single Green piece. Encapsulated in `_transferCurse` and tested.
- **Medium:** later Dracula bites while a Green Vampire already exists return one exposed human to the vault; hidey-holes are excluded from all room-based victim lists.
- **Medium:** save/restore must preserve the *next* random result. RNG state is serialised and compared after continuation.

## Stress result

1,500 four-player automata nights completed with no stalls. All four seats won hundreds of samples. Median 27 actions, p99 59, maximum 121.

## Verdict

Pass. Remaining uncertainty concerns historical tie-break rules, not engine consistency or termination.
