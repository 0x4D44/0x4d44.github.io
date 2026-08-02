# Stratego — Field Edition

A full-size, offline browser adaptation of the classic 40-piece hidden-rank board game, built as a standalone entry for the 0x4D44 Almanac.

The page deliberately uses no framework, package manager, build step, remote font, image, analytics service, or network API. Open it through a local HTTP server and it runs entirely in the browser.

## What is included

- The complete 10 × 10 classic game with two 2 × 2 lakes and all 40 pieces per army.
- Secret setup, three hand-authored formations, and a validated random formation.
- Solo play against three information-limited computer commanders.
- Two-player hot-seat play with a privacy shutter between commanders.
- Scouts with unobstructed long-range movement; immobile Bombs and Flags.
- Miner–Bomb and attacking Spy–Marshal exceptions.
- Classic equal-rank mutual removal, with an optional published aggressor-advantage tournament variation.
- The classic two-square repetition restriction, plus an optional threefold-position draw for coordinated loops.
- Autosave, captured-piece records, combat reports, a public intelligence ledger, keyboard play, reduced-motion support, Web Audio cues, and a classic/modern rank-number display toggle.
- An illustrated field manual and original mid-century-inspired CSS/SVG table art.

## Rules interpretation

The engine follows the modern full-army rules: Red moves first; one orthogonal move per turn except for Scouts; pieces may not enter or cross lakes; Bombs and Flags do not move; the stronger rank wins; equal ranks are both removed; Miners defuse Bombs; an attacking Spy defeats a Marshal; capturing the Flag or leaving the opposing army without a legal move wins.

A piece may move back and forth over the same two squares three times in succession for that side, but the fourth crossing is rejected. Moving another piece breaks the sequence. The optional threefold draw is deliberately labelled as a digital anti-loop rule rather than part of the base tabletop game.

The display defaults to the classic marking, in which 1 is the strongest rank: Marshal 1, General 2, Colonel 3, Major 4, Captain 5, Lieutenant 6, Sergeant 7, Miner 8, Scout 9, with S, B and F for the Spy, Bombs and Flag. “Modern” display prints the internal strength instead, in which the Marshal is 10, without changing gameplay.

Each army draws a different opening formation, and every deployment is laid out in a randomly chosen left-right orientation. Two armies sharing a formation would otherwise be reflections of each other, which would let a commander read the enemy flag's column off their own.

## Fair-play AI boundary

The computer is not passed the private game state. Its only input is `StrategoCore.publicSnapshot(state, colour)`, which contains:

- its own full army;
- public board occupancy and piece identity;
- enemy ranks that have already been revealed;
- whether an unknown enemy piece has moved;
- public move and combat history; and
- only its own two-square repetition state, which is required to generate legal moves.

Unknown ranks are evaluated as a probability bag constrained by public observations. The committed regression suite swaps two concealed enemy ranks in otherwise identical public positions and requires the AI to choose the same move.

Piece IDs are opaque and rank-to-ID assignment is shuffled for every new game. Concealed ranks are not written to board labels or hidden DOM attributes. On a deployed host, `window.StrategoApp` exposes only a public snapshot and the current viewing side; full-state hooks are enabled solely on loopback hosts for the browser regression test.

As with any fully client-side game, a determined player can inspect their own local save data or source code. The fairness boundary prevents accidental or ordinary UI/AI leakage; it is not a hostile-client security boundary.

## Architecture

- `stratego-core.js` — deterministic state model, setup, legal moves, combat, repetition, victory, snapshots, save/load, and invariants.
- `stratego-ai.js` — deterministic public-information move selection at three difficulty levels.
- `app.js` — DOM rendering, interaction, hot-seat privacy, dialogs, autosave, audio, and accessibility behaviour.
- `index.html` / `styles.css` — self-contained application shell and original artwork.
- `game-core.test.js` — rule examples, invariants, save/load, and randomized playouts.
- `ai.test.js` — legal-move equivalence, determinism, non-cheating oracle, and AI-v-AI stress games.
- `browser.test.mjs` — real-Chromium smoke, privacy, DOM leakage, autosave, interaction, and responsive bounds checks.
- `catalog.test.js` — Almanac registration and static-asset integration checks.
- `REVIEW.md` — isolated adversarial review tracks and the defects they found.

## Run locally

From the repository root:

```sh
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/stratego/`.

A deterministic showcase game is available at `http://127.0.0.1:8000/stratego/?demo=1` for visual review.

## Validate

Run from this directory:

```sh
node --test game-core.test.js
node --test ai.test.js
node --test catalog.test.js
node --test browser.test.mjs
```

`browser.test.mjs` requires Chromium or Google Chrome. To retain desktop and mobile screenshots:

```sh
STRATEGO_SCREENSHOT_DIR=./browser-artifacts node --test browser.test.mjs
```

## Research basis

Rules and component counts were cross-checked against:

- Hasbro’s official Stratego instructions catalogue: https://instructions.hasbro.com/en-us/instruction/stratego-game
- Jumbo’s current Stratego Original product and rules download: https://jumboplay.com/en/products/stratego-original
- The multilingual Jumbo Stratego Original manual (English rules begin on page 17): https://www.manualslib.com/manual/1959913/Jumbo-Stratego-Original.html

Historical dating was cross-checked against:

- The Henry Ford, *Stratego Game, 1962–1965*: https://www.thehenryford.org/collections/explore/artifact/303629
- *Estate of Gunter Sigmund Elkan v. Hasbro, Inc.* (D. Or. 2005), which records the 1942 mark, post-war Dutch publication, and the 1961 Milton Bradley sublicence: https://www.casemine.com/judgement/us/5914b5caadd7b04934774f2f

## Rights

This is an unofficial, non-commercial fan adaptation. All code and illustration in this directory are original. No official scans, logos, piece illustrations, board textures, box art, fonts, or audio assets are included. “Stratego” is a trademark of its respective owners; no affiliation or endorsement is implied.
