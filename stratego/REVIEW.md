# Adversarial review record

The implementation was reviewed in five deliberately isolated passes. Each pass began from a different threat model and treated the rest of the design as untrusted. This record separates the findings so a future maintainer can rerun or extend each review without relying on the author’s original assumptions.

## 1. Rules fidelity review

**Challenge:** prove that this is the complete classic game rather than a visually convincing approximation.

Checks performed:

- Compared the army manifest against the full 40-piece rules.
- Exercised every movement exception, combat exception, win condition, repetition condition, setup boundary, lake boundary, and equal-rank outcome as an executable example.
- Validated every embedded formation at module load against the canonical piece manifest.
- Ran randomized legal playouts while asserting board/piece invariants after every move.
- Round-tripped live positions through save serialization.

Defects found and fixed:

- The first Feint preset contained the wrong Scout/Sergeant balance. Presets now fail immediately at load if any count is wrong.
- Early explanatory copy could be read as the Spy being generally strong against a Marshal. It now states explicitly that the exception applies only when the Spy attacks first.
- Repetition wording was initially too loose. The engine now tracks crossings for each side and bars the fourth consecutive crossing of the same edge by the same piece; moving another piece clears that side’s sequence.
- Coordinated loops were possible even with the two-square rule. An optional, clearly labelled threefold full-position draw was added rather than silently presented as a tabletop base rule. Its hash now includes revealed/moved knowledge and both sides’ repetition rights, so positions with different legal futures cannot collapse into one draw state.
- State validation originally checked board occupancy but not the complete canonical manifest. It now rejects missing, duplicated, retyped, recoloured, malformed, or out-of-sync pieces and corrupt ledger/history/oscillation structures.

Residual decision:

- Tournament “more-squares” pursuit rules vary by ruleset and are not implemented. The game uses the published classic two-square restriction and offers the separate threefold draw option.

## 2. Hidden-information and AI fairness review

**Challenge:** assume every identifier, render path, accessibility label, API, heuristic, and test hook can accidentally disclose a concealed rank.

Checks performed:

- Compared AI legal moves generated from a public snapshot with legal moves from the authoritative engine.
- Constructed two private states with identical public information but swapped concealed ranks; required the AI’s selected move to remain identical.
- Inspected all enemy board nodes and accessibility labels for rank names and numbers.
- Ran AI-v-AI stress games and rejected every illegal choice; deterministic complete playthroughs exercised Flag capture and immobilisation endings across all difficulty levels.
- Reviewed save, restore, hot-seat handoff, hint, and deployed debug APIs separately.

Defects found and fixed:

- Initial piece IDs encoded rank names. IDs are now opaque.
- A fixed opaque ID order would still have allowed source-aware players to infer ranks. Rank-to-ID assignment is now shuffled from a private per-game seed.
- Early AI code generated candidates from full state before scoring a public view. Candidate generation now also uses only the public snapshot, including only the AI side’s own repetition state.
- Full-state browser test hooks were initially globally visible. Deployed hosts now expose only public state; full hooks exist only on loopback hosts.
- Restoring a hot-seat save could reveal the next player’s board before handoff. Restore now locks before its first render, and a mutation-record regression proves that no rank-face node is constructed even transiently during the handoff.
- Concealed Bombs and Flags inherited an `is-immobile` presentation class, leaking their identity without a visible rank. Type-derived classes are now emitted only when that type is legitimately visible, and a browser regression scans enemy labels, classes, attributes, and child markup.
- The AI’s back-rank depth helper measured from its own edge instead of the opponent’s. That distorted objective pressure without cheating; the geometry is corrected and covered for both colours.

Residual decision:

- Local storage necessarily contains the complete client-side game. This is documented as a client trust limitation, not disguised as cryptographic secrecy.

## 3. Interaction, accessibility, and hot-seat privacy review

**Challenge:** play without a mouse, play on a shared screen, restore at awkward phases, and use the interface at narrow and intermediate widths.

Checks performed:

- Keyboard navigation across all 100 grid cells with a single roving tab stop.
- Legal-destination announcements and board-cell labels.
- Red and Blue setup, board rotation, privacy handoff, combat interruption, and resumed games.
- Real-Chromium desktop, tablet, and mobile viewport bounds.
- Reduced-motion behaviour, disabled controls, dialog labels, button names, and live regions.

Defects found and fixed:

- The mobile masthead title escaped a 390-pixel viewport. Its responsive sizing and spacing were tightened.
- The shared fixed Almanac navigation pill could cover the masthead at phone widths. The page now reserves its footprint on small screens.
- A narrow-tablet layout retained side panels for too long and could create horizontal overflow. The stacked-layout breakpoint was moved to 1080 pixels.
- Privacy handoff originally concealed ranks visually but left face nodes in the DOM. The board now re-renders without any rank-face nodes while the shutter is active.
- Lake cells were disabled buttons, so arrow navigation could move focus onto a control the browser then refused to focus. Lakes are now focusable, semantically `aria-disabled` grid cells that announce terrain and safely ignore activation.
- Closing the campaign dialog used a form button with an implicit submit action and could replace a live game. It is now an explicit non-submit button with a regression preserving the campaign seed.
- Setup drag-start re-rendered the board and detached the native drag source mid-gesture. Drag state is now styled without replacing the node; cleanup happens on drag-end, and a synthetic drag/drop regression proves the source survives and both pieces swap.
- Audio initialisation occurred during programmatic test and restore flows, producing autoplay-policy warnings. Audio is now unlocked only from a trusted user gesture.

## 4. Visual authenticity and intellectual-property review

**Challenge:** evoke the physical game’s red/blue armies, green battlefield, freestanding pieces, military hierarchy, mid-century box presence, and Napoleonic atmosphere without copying protected production artwork.

Checks performed:

- Compared the colour hierarchy and table silhouette with historic and current editions.
- Searched the directory for remote image/font/audio dependencies and copied raster assets.
- Reviewed all marks and explanatory copy for an implication of endorsement.
- Inspected desktop and mobile screenshots for contrast, information density, piece differentiation, and decorative interference.

Defects found and fixed:

- The early layout read as a generic web dashboard. It was rebuilt around a physical box-lid masthead, framed map board, command standards, field-report typography, captured-piece trays, and castle-like dimensional pieces.
- The first mobile arrangement over-prioritised decoration. Non-essential map ornament is now restrained at narrow sizes while gameplay remains full width.
- A rights notice was added in-page and here. All art remains CSS/SVG drawn for this project; no official assets are shipped.

## 5. Integration and maintainability review

**Challenge:** assume the game works alone but fails as an Almanac entry or becomes unsafe to modify.

Checks performed:

- Catalog entry uniqueness, URL, tags, publication state, and Games Room shelf placement.
- Presence of the shared Almanac back script.
- Relative local assets only; no build-generated or hashed dependencies.
- JavaScript syntax, deterministic seeded games, state-version checks, formation validation, and browser-process teardown.
- Static file paths under the final `/stratego/` subdirectory.

Defects found and fixed:

- The catalog item was initially unshelved during local assembly. It is now explicitly first in The Games Room.
- Integration assertions were originally ad hoc commands. They are now committed as `catalog.test.js`.
- The Chromium smoke harness originally terminated only the `xvfb-run` wrapper, leaving browser and X-server descendants behind after failures. It now launches an isolated process group and escalates TERM to KILL before removing its profile.

## Review outcome

The review passes found material defects in rules data, information isolation, restore privacy, test-hook exposure, catalog integration, and responsive layout. Each is covered by a regression check where practical. The remaining limitations—client-readable save data and omission of tournament-specific pursuit extensions—are explicit design choices rather than hidden gaps.
