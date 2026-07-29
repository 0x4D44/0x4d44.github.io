# Research and restoration notes

## Scope and method

The goal was to recover the *play experience* and physical character of **Game of Dracula**, not to copy a surviving board. Research used three evidence classes:

1. **Primary physical evidence:** photographs of a surviving board, spinner, pieces, box, and the legible first page of the instruction sheet.
2. **Catalogue evidence:** dates, designers, player count, age range, publishers, duration, and component lists.
3. **Player recollections:** descriptions of the first bite, the wearable Green Vampire mask, the passing curse, the hollow “engulfing” pieces, hidey-holes, candle barriers, and Dracula's separate trail.

Claims are graded below as **verified**, **corroborated**, or **restored**. No original scans or photographs are included in the application.

## Identifying the game

The game was published in the UK by Waddingtons House of Games in 1977 and is credited to Martin Earl and Steve Curtis II. Canadian copies are commonly dated 1978. Catalogue records describe 2–4 players, age 7+, and about an hour. The physical set contains a board, spinner, four coloured pawns, red Dracula, Green and Blue Vampire pieces, instructions, and a wearable Green Vampire mask.

Those details match the remembered game unusually closely: coloured pawns, a larger Dracula piece that fits over a pawn, and a mask/cape-like accessory. The “cape” memory is plausibly the hollow red Dracula cloak and/or the wearable green mask rather than a separate fabric cape.

## Primary instruction-sheet transcription (paraphrased)

The legible first page establishes:

- **Object:** be first to escape through either HOME doorway by moving on the yellow stones while avoiding Dracula and the vampires.
- **Setup:** Dracula begins at the coffin/vault red pool; Green Vampire at perch 1; Blue Vampire at perch 6; each pawn at its matching coloured START.
- **Opening order:** every player spins and the highest begins; turns then proceed clockwise.
- **Ordinary turn:** when the pointer lands on a red sector, the outer red number moves Dracula on the blood pools and the opposite inner yellow number moves the active pawn on yellow stones.
- **Vampire turn:** a coloured VAMPIRE result moves that vampire directly to its matching numbered perch; the active pawn does not move.

The digital table resolves the opening contest automatically from the Night number, then follows clockwise order.

## Spinner reconstruction

The photographed spinner is not simply an 18-way wheel with a decorative centre. It has a long and short pointer reading opposite sides of two concentric systems:

- Eighteen equal 20° outer sectors.
- Twelve red sectors; outer values 1–6 appear twice each.
- Four green sectors numbered 1–4 and two blue sectors numbered 5–6.
- Six equal 60° inner wedges in the repeating cycle `VAMPIRE, 3, 4, VAMPIRE, 3, 4`.
- The pointer's long end reads the outer ring; its short opposite end reads the corresponding inner wedge.

Starting at an arbitrary sector boundary, the observed clockwise outer cycle is:

```text
G3, B6, G4, R6/Y3, R5/Y3, R4/Y3,
R3/Y4, R2/Y4, R1/Y4, G1, B5, G2,
R1/Y3, R2/Y3, R3/Y3, R4/Y4, R5/Y4, R6/Y4
```

`engine.js` preserves that cyclic order rather than only matching the probability distribution. `index.html` redraws the six inner wedges and two-ended pointer with original SVG; no scanned pixels are shipped.

## Board and component vocabulary

The restoration preserves the physical game's immediately recognisable grammar while redrawing its topology:

- Broad blocks of cream, green, pink, brown, and yellow rooms.
- A branching route of chunky yellow stepping stones.
- Four coloured START stones and two HOME doorways.
- A separate red “blood pool” trail for Dracula.
- Numbered perches 1–4 for Green and 5–6 for Blue.
- Safe hidey-holes and candle-marked barriers.
- Brightly coloured ordinary pawns.
- Oversized hollow Dracula/vampire pieces represented as enclosing pieces in the SVG and transformation animation.
- A vivid late-1970s horror-comic box treatment rather than photorealistic gothic art.

The digital board contains 60 route nodes and 30 blood pools. Those counts are implementation geometry, not claims about the exact number on every physical edition.

## Rules evidence ledger

### Verified or strongly corroborated

- First ordinary pawn through HOME wins.
- Dracula travels independently, counter-clockwise, on the red blood trail.
- Red spinner results move Dracula and then the active guest.
- Coloured sectors move a vampire directly to a numbered perch and end the active player's movement opportunity.
- The first person bitten by Dracula becomes the Green Vampire and wears the mask.
- The Green Vampire is controlled by that cursed player.
- When Green catches another exposed player, the curse/mask passes to the new victim and the former holder becomes human again.
- Later Dracula victims return to the vault/crypt rather than creating another Green Vampire.
- Hidey-holes protect a pawn from room-based capture.
- The Green Vampire cannot cross candle barriers.
- The large plastic pieces are hollow and physically engulf ordinary pawns.

### Deliberate restorations

The complete continuation of the instruction sheet was not found. The following decisions are therefore exposed in `RESTORATION_RULES`, the in-game Archive page, and code comments rather than being presented as official wording.

**No repeat stone during one move.** The surviving page requires an exact move but the missing continuation does not resolve loops. Forbidding a same-turn revisit makes every highlighted destination finite and is consistent with ordinary exact-count path games.

**Blue Vampire consequence.** The Blue piece and perches 5–6 are verified, but a surviving blue-capture paragraph was not found. Sending one exposed guest to the vault mirrors later Dracula bites, keeps Blue threatening, and introduces no new state.

**One victim per encounter and tie-breaks.** A single hollow plastic piece could physically cover one pawn. Dracula takes the active exposed guest when possible. Otherwise Dracula and Blue take the guest closest to HOME, with seat order as a deterministic final tie-break. A human Green Vampire chooses directly when several victims are available; an automated Green Vampire uses the same progress ordering.

**First Green holder uses the current perch.** The first page establishes Green's initial position at perch 1, but the first-bite placement paragraph is missing. If earlier Green results have moved the unclaimed piece, the first victim joins it at its current perch. This preserves the meaning of every pre-bite Green spin rather than silently resetting the piece.

**Former Green holder finds cover.** A period recollection describes the released player diving into a hidey-hole or behind a candlestick. The engine chooses the nearest safe hidey-hole in the room other than the Green piece's occupied stone. If there is no other hidey-hole, it uses an adjacent stone. A regression test specifically prevents the former holder remaining underneath the new Green Vampire at a numbered perch.

### Digital conveniences, not claimed as original

- Automated opponents and “resolve for me”.
- Deterministic Night numbers and automatic opening-spin resolution.
- Local save/resume.
- Legal-destination highlighting, hints, board zoom, procedural sound, and hand-off screens.
- Named rooms and decorative board labels.

## Sources consulted

Accessed 28–29 July 2026.

- Nastol.io, *Game of Dracula*: catalogue details and synopsis of the first bite, mask, and later captures.
  https://nastol.io/game_of_dracula
- Horror Land, “10 Horror Board Games from Your Childhood”: separate counter-clockwise trail, passing mask, crypt return, and engulfing pieces.
  https://horror.land/10-horror-board-games-from-your-childhood/
- Fen Orc, “Games of Christmas Past”: hidey-holes, candle barriers, curse transfer, and the released vampire seeking cover.
  https://fenorcs.weebly.com/fen-orc-blog/games-of-christmas-past
- Társasjátékok / BoardGameGeek catalogue mirror: designers, year, publishers, player count, age, and duration.
  https://tarsasjatekok.com/tarsasjatek/game-of-dracula-1977
- The Games Are Here, vintage set listing: component inventory including the mask, spinner, and seven playing pieces.
  https://thegamesarehere.com/products/game-of-dracula-waddingtons-house-of-games-1978
- Breaking Dads, episode notes: corroborating synopsis of the transformation mechanic.
  https://www.breakingdads.com/epic-gumdrop/eg-pod/ep-38-boardgame-vampires/

The physical photographs and instruction image were used as visual/primary evidence but are intentionally absent from this repository.
