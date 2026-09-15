# WINRISK.EXE — binary bug audit and repairs

**Audit date:** 14 September 2026  
**Input:** the uploaded WINRISK.EXE, 220,672 bytes  
**Output:** an unofficial patched executable, still 220,672 bytes

## Result and confidence

The supplied game contains several reproducible logic defects, including a combat error that changes casualties. The enclosed executable repairs the findings documented below. The original uploaded file was not modified.

The central result is an exhaustive check of the combat routine's legal dice configurations: **10,836 cases per executable, 2,317 disagreements in the original, zero in the repaired build**. The test runs actual instructions decoded from each executable, supplies deterministic random-number results, and compares casualties and result codes with an independent reference implementation.

Other regressions cover card awards, player elimination, invalid map indices, click dispatch, Setup behaviour and both polygon-construction paths. The executable's imports, entry points, resources and relocation records were checked after patching.

**This is not certification that the entire game is bug-free.** The game was not launched in a full Windows environment, and no complete graphical game was played here. Windows APIs and selected Borland runtime services were replaced by explicit test doubles. The results establish behaviour of the exercised binary routines, not native GDI rendering, operating-system integration or every possible sequence of turns.

## Identification and method

The input is a 16-bit Windows New Executable (NE). Its About dialog identifies **Freeware Version 2.11**, Steve Stancliff, December 1992. The NE description still says **Windows Risk 2.01**. These conflicting original labels were retained rather than inventing a new official version number.

The file has ten segments: nine code segments and a data segment. The audit separated the window procedure, game-state logic, combat, card handling, map resources, AI code, dialogs, drawing and compiler runtime. Disassembly was annotated with imported API and internal call targets. The data model includes 42 territories and three player records.

The analysis used the uploaded binary as the primary evidence. Win16 ordinal and calling-convention identification was cross-checked against Wine's primary-source `user.exe16`, `gdi.exe16` and `krnl386.exe16` specification files. GNU objdump supplied instruction decoding. The included Python instruction harness is purpose-built for these regression tests; unsupported instructions fail rather than silently succeeding.

The annotated original disassemblies are included for inspection. They are not reconstructed C source. Linear disassembly can interpret embedded jump-table data as instructions; the test harness restarts decoding at function boundaries to avoid carrying that misalignment into subsequent routines.

## 1. Defender dice are sorted using an attacker die

**Location:** segment 5, instruction `0x0D5F`; changed file byte `0x6360`.

When a newly rolled defender die is greater than the current highest defender die, the old routine should move the previous defender maximum into the second slot. Instead, it reads the highest attacker die from data offset `0x0BF0`.

The repair changes that source to the previous defender maximum at `0x0BF6`.

Example, preserving roll order:

| Input or outcome | Original | Repaired |
|---|---|---|
| Attacker rolls | 6, 5, 1 | 6, 5, 1 |
| Defender rolls | 2, then 3 | 2, then 3 |
| Stored defender dice | 3, **6** | 3, **2** |
| Casualties | One army each | Defender loses two |

This is a game-rule defect, not a cosmetic dice-display issue. It penalises the attacker in affected comparisons.

The exhaustive regression covers one, two or three attacker dice against one or two defender dice, and every face combination for each configuration. It verifies both remaining army counts and the returned combat-result state. The 2,317/10,836 figure describes this enumerated test set; it is **not** an estimate of the percentage of battles affected in a typical played game.

## 2. An invalid map index can access player memory as a territory

**Location:** segment 5 input dispatcher, original entry `0x02D3`, hook at `0x02E1`.

The mouse hit-test path represents “no territory” as `-1`. The input dispatcher previously multiplied this by the 22-byte territory record size and used the result without first checking the index.

The preceding storage is part of the player array. Thus an off-map click can read unrelated fields as territory ownership or army counts. In a deliberately arranged regression state, the original changes the two preceding words from `(3, 5)` to `(0, 6)`, demonstrating an actual out-of-range write. This crafted state proves reachability of the bad memory access; it does not imply every ordinary off-map click corrupts a game.

The new guard accepts only indices 0–41 before territory-dependent actions. It preserves intentional background-click behaviour: dismissing combat, cancelling target selection, ending movement and middle-button passing.

**Validation:** 399 combinations of invalid index, game state and mouse button preserve player/territory records. Differential tests for all 42 legal initial-claim targets retain the original result.

## 3. One combat-result click queues two game actions

**Location:** segment 4, `0x03BC`–`0x03D1`.

In the “click to continue” state, the original mouse handler posts a message to dismiss the combat result. It then falls through into ordinary hit testing and posts a second message from the same physical click.

The second message can be interpreted in the next game state, causing an unintended follow-on action. The repair returns immediately after posting the dismissal. Ordinary clicks proceed to their existing hit-test path. This also bypasses an obsolete instruction-count delay loop on the ordinary path.

**Validation:** the original posts two messages for the tested result-dismissal click; the repaired handler posts one. Normal left, right and middle clicks still post once, while clicks during computer-controlled turns do not post a human action.

## 4. An eliminated player's cards can be left behind

**Location:** segment 5, combat-result continuation at `0x0993`/`0x0996`.

The attack code marks a pending elimination when the conquered territory is the opponent's last. One continuation path processes that flag after optional post-conquest troop movement.

But when compulsory movement leaves only one army in the attacker's source territory, the game goes through the ordinary combat-result dismissal instead. That handler previously returned directly to attack selection, bypassing the pending card transfer. A later attack can clear the pending flag.

The repair routes result dismissal through the elimination-processing state when the flag is set, then clears the flag.

**Validation:** complete routine-level conquest/continuation sequences were exercised with starting attacker stacks of 2 through 9 armies, a one-army last defending territory, and a third player still alive. The original loses the transfer on the 2-, 3- and 4-army starting cases. The repaired build transfers the cards in every tested case and does not duplicate the transfer on subsequent state processing.

## 5. The last card in the deck is skipped

**Location:** segment 5, comparison at `0x0E4A`; changed file byte `0x644E`.

The shuffle routine creates 44 entries, indexed 0–43. The draw routine previously reshuffled when its cursor was greater than 42, before drawing slot 43.

The threshold is now 43: the game can draw all 44 entries and reshuffles before draw 45.

A controlled deck containing the 42 ordinary cards followed by the two wildcards reproduces the error clearly. In the first 44 awards, the old routine yields card-type totals `[15, 14, 14, 1]`; the repair yields `[14, 14, 14, 2]`. With a shuffled deck, the omitted card need not be a wildcard.

**Validation:** the 44th/45th-draw boundary, no-conquest/no-card behaviour, and a deterministic complete shuffle in each build.

## 6. Setup cancellation is not transactional; creation failure is treated as success

**Location:** segment 9, Setup wrapper `0x02C2`, with hooks at `0x02D1` and `0x0331`.

The original Setup dialog points directly to live player records. Name edits and human/computer radio-button changes write to those records immediately. Cancel closes the dialog without undoing them.

The wrapper now stages the three records in a 72-byte stack buffer. Only an explicit OK result commits the player names and controller flags. Army and card fields are deliberately not copied back, so unrelated live gameplay changes cannot be overwritten by the staged copy.

The old wrapper also treated any nonzero dialog return as acceptance, including `-1` for creation failure. Acceptance now requires a return value of exactly 1.

**Validation:** Cancel, OK and failure results were simulated at the DialogBoxParam boundary. Cancel and failure leave configuration unchanged; OK commits it. Test changes to unrelated live army/card fields survive. These tests exercise the wrapper and its actual temporary pointers, not a full interactive dialog session.

## 7. Eight malformed coordinates in seven territory polygons

**Resources:** custom type 28685, with one polygon per territory. Vertex indices below are zero-based.

| Territory | Resource ID | Vertex | Original | Repaired |
|---|---:|---:|---|---|
| Middle East | 27 | 23 | (274, 243) | (374, 243) |
| Taymyr | 30 | 28 | (42, 61) | (452, 61) |
| Buryat | 33 | 33 | (172, 137) | (472, 137) |
| China | 36 | 48 | (409, 181) | (509, 181) |
| India | 37 | 8 | (441, 284) | (441, 204) |
| India | 37 | 9 | (444, 284) | (444, 204) |
| Indonesia | 39 | 26 | (479, 476) | (479, 276) |
| Eastern Australia | 42 | 4 | (346, 315) | (546, 315) |

These are outliers in otherwise local boundary sequences, in some cases hundreds of pixels away. Corrections were inferred from surrounding vertices, shared borders and the embedded map bitmap, which was inspected. Each corrected coordinate is on, or immediately adjacent to, a black boundary pixel in that bitmap. No map artwork was changed.

The defects distort the clickable regions independently of the visible map. Geometry regressions establish changed point classifications in every affected region. Those geometric witnesses use winding-fill calculations; they are not screenshots from native Windows GDI.

## 8. Both polygon consumers include the termination sentinel

**Locations:** segment 3, `0x04A4`/`0x04AB` for region bounds; segment 4, `0x0243`/`0x024A` for point hit testing.

Each point array terminates with `(-100, -100)`. Both callers counted and passed this marker to CreatePolygonRgn as if it were another vertex.

Both loops now count only real points. For an explicitly closed polygon, the extra excursion can have zero area, so this does not independently imply a visible failure in all 42 territories. It is particularly problematic with the malformed Buryat closing vertex, where the combined defects create a spurious filled area.

**Validation:** all 42 resources were passed through each actual polygon-construction routine: 84 repaired API-boundary counts, none including the sentinel.

## Other reviewed areas and deliberately unchanged behaviour

The static territory-adjacency graph has 42 valid nodes, no self-neighbours and reciprocal edges. No adjacency repair was indicated. The continent grouping, reinforcement calculation, card-set progression, troop movement and army-cap handling were inspected; no additional patch was justified by the reviewed paths.

AI scoring and target-selection code was examined but not rewritten. A weak strategic heuristic is not automatically a correctness bug, and there is no claim of improved AI strength or exhaustive AI validation.

The original contains pre-existing NOP runs in some drawing/update paths. Their provenance was not established. They were preserved rather than assumed to be accidental damage. General low-resource GDI failure handling and all possible re-entrant Windows message sequences remain outside the validated repair set.

## Executable integrity and reproducibility

The repair uses small in-place changes plus **94 bytes of segment-5 helper code and 58 bytes of segment-9 helper code**. These helpers occupy existing file padding. Their segments' unchanged relocation tables were moved forward within that padding, and the code lengths/minimum allocations were updated. Existing code and resource offsets elsewhere do not move.

Post-patch checks establish:

- The same 220,672-byte file size, ten segments, 59 resources and 530 relocation records.
- Identical exported entry points, import modules and relocation targets/sites.
- Byte-identical non-polygon resources, including bitmap, dialogs, menus, icons, strings and credits.
- A hash-locked patcher that reconstructs the supplied output from the exact original.

Original SHA-256:
`b829f76340d6848a697b7a4b499c60c27bb109921a00b96fd771eb5bff894ae3`

Repaired SHA-256:
`9fcdf5e021d089c135eb6b39f609f495b955e71a4d7798fbe41844c1284fcc76`

The full machine-readable results are in `evidence/test_results.json`. Exact offsets, old/new bytes and helper code are in `evidence/patch_manifest.json`. The scripts used to reproduce the patch and regressions are not distributed with this exhibit.

## Remaining integration check

Back up the original and try the repaired executable in the intended Win16 environment. The most valuable remaining check is a complete graphical game: exercise Setup Cancel/OK, click the corrected territories and empty sea, dismiss several battles, and eliminate an opponent. That validates the Windows/emulator boundary which the instruction-level test doubles cannot establish.
