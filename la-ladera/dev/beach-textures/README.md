# Beach textures — review and acceptance

The pack contains 25 requested entries, 51 final PNGs and 70 occupied atlas
cells. It remains outside both active game manifests.

| Final measurement | Result |
| --- | --- |
| PNGs + independent manifest | **7,454,787 / 8,000,000 bytes** |
| All supplied textures resident, RGBA8 + complete mipmaps | **58,370,684 bytes (55.67 MiB)** |
| Independent decoder / manifest gate | **PASS**, 51 PNGs and 70 atlas cells |
| Declared-axis opposite-edge comparisons | **75 / 75**, maximum and mean delta both zero |
| Node 22.16.0 suite | **18 / 18 pass** |
| Deliberately broken inputs | **18 / 18 named tests observed failing** |
| Human-scale review | **25 entries / 50 views**, 1.60 m camera and 1.80 m figure |
| Unchanged repository payload gate | **PAYLOAD OK** |
| Clean Git export | Decoder, tests, mutations and payload all pass |

- [Catalogue](catalogue.png)
- [All albedo/effect maps tiled 3 × 3](tiles-albedo.png)
- [All normal maps tiled 3 × 3](tiles-normal.png)
- [All roughness maps tiled 3 × 3](tiles-roughness.png)
- [Spanish sign proof](signs-proof.png)
- [Source, scale, UV and rebuild contract](../../tools/textures/BEACH.md)
- [Independent manifest](../../assets/textures/manifest.beach.json)

## Human-scale renders

Every entry is shown from the front and at an oblique angle, at **1.60 m eye
height**, beside an unscaled, measured **1.80 m figure**:

- [Materials 01](eye-height-materials-1.png)
- [Materials 02](eye-height-materials-2.png)
- [Atlases 01](eye-height-atlases-1.png)
- [Atlases 02](eye-height-atlases-2.png)
- [Water effects](eye-height-effects.png)

The [interactive review page](gallery.html) directly loads the offline
manifest. It imports only the vendored Three renderer, not the game.
Atlas panel dimensions in these renders are proof-display dimensions.

## Every atlas cell

| Sheet | What was checked visually |
| --- | --- |
| [Sails and kites](sails-kites-proof.png) | Six sails with windows and numbers 01–06; six striped wings |
| [Board decks](board-decks-proof.png) | Eight original designs; no badges or brands |
| [Towels and bags](towels-bags-proof.png) | Twelve towels and four bag tops |
| [Signs](signs-proof.png) | All ten requested Spanish phrases; clear ñ in “baño” |
| [Boat names](boat-names-proof.png) | All four exact names, including the requested unaccented “Maria” |
| [Gulls](gull-sprites-proof.png) | Four distinct wing poses, standing, two walking poses and cleaning |
| [Fish](fish-sprites-proof.png) | Three species, two registered tail frames per species; unclipped noses |
| [Crab and shells](crab-shells-proof.png) | Complete crab/conch/scallop silhouettes; empty fourth cell |
| [Seagrass and coral](seagrass-coral-proof.png) | Living green grass, branching coral and complete brain-coral outline |

Animation sprites were packed using measured eye anchors and a common scale
within each moving group. The JSON records these anchors and frame sequences.
The original generated silhouettes vary slightly between frames; this
registration prevents packing-induced size/position drift.

## Verification evidence

- `verification/base-check.txt`: exact origin/main base and ancestry result.
- `verification/build-final.log`: final selected-source export.
- `verification/validator.log`: independent complete PNG/manifest gate.
- `verification/tests.tap`: complete named Node 22.16.0 test output.
- `verification/mutations.log`: every named test proven red with its deliberate input mutation.
- `verification/mutations-red.tap`: individual attributable assertion failures.
- `verification/payload.log`: unchanged repository payload limits.
- `verification/gallery.log` and `verification/gallery.json`: 25 entries,
  50 views, renderer identity, measured heights, diagnostics and screenshot hashes.
- `verification/archive-check.log`: validation from a clean Git export.

Binary pins cover the actual PNG bytes. Text pins normalize CRLF/CR to LF;
the suite verifies both CRLF checkout compatibility and rejection of real
content changes. The sign check verifies exact metadata and a hashed rendered
proof with a recorded visual review. It does not claim OCR or automatic
semantic reading of image lettering.

## Boundaries of this review

The supplied normals/roughness are derived material approximations, not
measured PBR scans. The review renderer uses SwiftShader, so these images do
not measure the user's GPU performance.

No beach geometry or world placement is included. Game loading, boot time,
swimming, water shaders in the game, collision, physical LODs, live animation
playback and target-hardware frame time were not exercised. The texture-only
pack is deliberately inactive until the consuming beach work registers it.
No existing test or limit was deleted, disabled or relaxed.
