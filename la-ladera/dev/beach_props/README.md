# Beach props: verification and visual review

This is a dormant asset library for the beach described in `dev/FEATURE-BEACH.md`
sections 1.4, 4.4 and 7. The starting `origin/main` was exactly
`38542092094aaf0101cc9920fd8628fcdaf0ac35`. The final pre-PR fetch returned
`237a7ddbbc4a04ebcbe6fbc6c1bd87ef7651cca2`, a descendant containing that base.
Its `la-ladera/` tree is identical to the requested base. All changes are new
files under `la-ladera/`. The active model manifest,
texture registry, game JavaScript, existing tests and budget limits are unchanged.

## Delivered inventory

There are **97 near items and 97 corresponding far LODs**. Six parasol colour/pole
variants each have open and furled geometry; all twelve towel prints have both
flat and chair-draped geometry. The library also contains five seats/loungers,
four bags, the small beach accessories, volleyball court and ball, ten Spanish
signs, vendor and lifeguard equipment, promenade fittings, three stair widths,
shore objects and two coconut palms. The complete inventory and attachment
contract are in [BEACH_PROPS.md](../../tools/blender/BEACH_PROPS.md) and the
[catalogue JSON](../../tools/blender/beach_props.catalog.json).

| Exported resource | Measured result | Limit |
| --- | ---: | ---: |
| Near roots / far roots | 97 / 97 | One far root per item |
| GLB bytes | 1,429,460 | 3,000,000 |
| PBR texture bytes | 2,473,749 | 6,000,000 |
| Near triangles, all distinct items drawn once | 24,766 | Per-item limits below |
| Far triangles, all distinct items drawn once | 3,983 | At most 40% of each near item |
| Largest near item | 1,236, vendor cart | 2,000; kiosk/tower allowance 3,000 |
| Highest far/near ratio | 39.3939%, sign easel | 40% |
| Bollard lamp | 104 near / 34 far | 150 near |
| Volleyball alpha net | 12 near triangles | Exactly 12 |
| Shared mesh resources | 7 | Repeated parts share real glTF mesh data |
| Shared atlas dimensions | 2,048 × 2,048 per map | 2,048 maximum |

All measurements above come from independent decoding of the exported GLBs or
the actual texture files. Atlas maps are albedo, tangent-space normal and ORM;
the same 64-cell layout serves every item. GLBs contain no embedded textures.
The library remains absent from `assets/models/manifest.json`.

## Automated acceptance

Environment: **Blender 5.0.1**, **Node 22.16.0**, Linux x64. Blender ran in
background mode, with four CPU threads and low priority through
`tools/nice.mjs`, which imports `tests/nice.mjs`. Child-process test launches use
hidden windows. No mouse, desktop, speakers or board-posting APIs were used.

```text
PASS beach props: 97 designs + 97 far LODs
GLB 1,429,460 / 3,000,000 bytes; textures 2,473,749 / 6,000,000 bytes; 7 shared mesh resources
  beach_props/beach_leisure.glb: 108 roots, 624,440 bytes
  beach_props/beach_civic.glb: 60 roots, 589,088 bytes
  beach_props/beach_shore.glb: 26 roots, 215,932 bytes

# tests 33
# pass 33
# fail 0

MUTATION PASS: 33/33; every new test passed valid input and failed its selected corrupted input.
```

The mutation harness first runs the unchanged inputs green. It then selects one
test at a time, copies the inputs into disposable fixtures, introduces the
listed fault and requires exactly that named test to fail. It never edits the
installed assets. [acceptance.txt](acceptance.txt) records the complete command
output and all 33 mutation descriptions.

The mutations remove files and LOD roots; alter LF catalogue or GLB hashes;
inject binary NaNs, invalid accessors, indices, bounds, normals and UVs; exceed
triangle or LOD limits; add forbidden textures; change alpha mode; remove a net
triangle or physical pivot; corrupt seat, light and keep-out anchors; damage
PNG data; duplicate towel artwork; remove the Spanish ñ; clone instanced mesh
resources; shrink the required roster; add excess payload; activate the dormant
manifest; and append an orphan node.

### Fresh-export and failure-path checks

A fresh Git archive of the implementation was extracted independently. All
twelve new text files were converted to CRLF, including the 3,021-line catalogue.
The complete validator, all 33 tests and the unchanged repository payload gate
passed in that copy. This verifies the LF-normalized pin and committed-file
dependencies on Linux with Windows-style text endings.

Disposable installation fault injection also passed:

```text
PASS partial-copy: all original model, texture and manifest paths/bytes restored; no partial targets or backup debris
PASS install-rename: all original model, texture and manifest paths/bytes restored; no partial targets or backup debris
PASS partial custom output guard: assets/preview_models rejected before writes
PASS full custom output guard: assets/preview_models rejected before writes
```

The installer prepares destination-local copies before touching live paths,
then uses same-filesystem renames for publication and rollback. A preview cannot
alias the production texture destination.

### Repository payload

The existing `node la-ladera/tests/payload.mjs` gate passes without changes to
its code or limits:

```text
ok   textures                                                14.8 / 24 MB
ok   models                                                  27.7 / 32 MB
ok   models/people                                            9.4 / 14 MB
ok   models/furniture                                         5.2 / 10 MB
ok   models/world                                             0.0 / 6 MB
ok   models/arch                                              0.0 / 2 MB
ok   shipped total (excl. vendor,dev,labs,tests,tools)       45.5 / 150 MB
ok   estimated GPU texture memory                           316.0 / 800 MB
PAYLOAD OK
```

These are the limits present in the requested base. The tool estimates texture
memory for assets on disk; it does not establish the cost of a future beach view.

## Visual evidence

The [catalogue image](catalogue.jpg) and numbered contact sheets show the actual
exported GLB geometry with the shared PBR maps. Every item has a detail view and
a separate view beside an original **1.8 m reference figure**. Both perspective
cameras are exactly **1.6 m above the ground**. Focal length is fitted per item
for legibility; object geometry is never rescaled. The
[review index](review-index.json) records every item, sheet position, camera,
raw-render hash and source GLB/texture pin.

| Sheet | Items |
| --- | --- |
| [01](contact-01.png) | Parasols: six open/furled variants |
| [02](contact-02.png) | Seating and first towel variants |
| [03](contact-03.png) | Towel variants |
| [04](contact-04.png) | Remaining towels, bags and small beach props |
| [05](contact-05.png) | Small beach props, volleyball and signs |
| [06](contact-06.png) | Remaining signs, vendor props and first lifeguard items |
| [07](contact-07.png) | Remaining lifeguard items and promenade equipment |
| [08](contact-08.png) | Shore pieces and the small palm |
| [09](contact-09.png) | Large palm |

Visual review corrected lounger supports crossing the canvas, the spade grip
connection, flag panel discontinuities, stair surface overlaps, the conch
opening, palm-frond UV orientation and blocky stone mottling. All final sheets
use the corrected export and atlas. The assets use restrained procedural detail;
the kiosk thatch and palm crown intentionally retain economical geometry/cards.

## Not verified

- World placement, collision/nav integration, waterline behaviour, or NPC poses
  using the supplied anchors.
- Runtime Three.js material registration, loading, batching and animation of
  the declared pivots; the library is intentionally dormant.
- In-game LOD transition appearance, draw calls, frame times, device GPU costs,
  boot timing or coastal scene performance after placement.
- Blender execution on Windows or macOS. The fresh CRLF export check was run
  on Linux; it is not a substitute for those platform runs.
- Every possible rear/underside viewing angle or an external human art review.

No existing test was deleted or weakened, no limit was raised, and no world
placement or main-branch push is part of this change.
