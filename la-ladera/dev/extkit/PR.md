## Why

Back and side walls currently read as repeated flat colour fields. This adds a dormant exterior kit of 65 original designs and 12 wall finishes, ready for a separate building-placement task.

## Branch and base

- Started `codex/la-ladera-exterior-kit` from the latest `origin/main` at **`6740a624e597bbed9c9f400d6c33b37924777a17`**.
- **Rebased once onto freshly fetched `origin/main` at `958d0ec69716d0588a7bb8d4534c336edd550f7e` immediately before preparing this PR**, then reran the complete validator, tests, mutations and payload gate.
- Ready for review. No existing files, tests, budgets, game modules, boot manifests or production registries change. Every diff path is an addition in the requested `extkit` namespace. Nothing under `la-ladera/js/` imports this library.

## Contents

| Family | Designs |
| --- | ---: |
| Ribbed blue/black 500/1,000/2,000 L tanks on steel/block/raised stands, lids and plumbing |14|
| Balcony, roof, rotary and pole laundry arrangements with shaped cloth, folds and pegs |4|
| Satellite dishes / TV aerials |3 /2|
| Rebar: three lengths × two rust levels |6|
| Single/double pipa cages |2|
| Straight, elbow, tee and bracket pieces for pipes and drains |8|
| Meter boxes / pole-mounted transformer |2 /1|
| Short 0.5 m cable modules for instanced swags |2|
| Blank writable chalkboard |1|
| Reja patterns / shutter-box widths |8 /3|
| Potted plants on ledges / celosía patterns |6 /3|

The wall sets are six Colombian plaster colours, bare tolete brick, damp tolete brick, cement block with mortar, a baldosín band, streaked rough render and whitewash. The brief lists eleven finishes but asks for twelve; damp tolete is the explicit twelfth.

Two packed texture-free GLBs contain all 65 near roots and 65 LOD roots. All pieces use metres, +Y up, +Z front and floor-centred origins. The catalogue contains the requested attachment side, height range, clearance and facade-zone metadata. Rear references are checked against decoded near geometry; LOD selection does not alter the placement reference.

## Measured acceptance

| Gate | Actual | Limit |
| --- | ---: | ---: |
| Combined GLBs |3,283,028 bytes|4,500,000|
| Texture disk bytes |6,083,057|8,000,000|
| Simultaneously resident texture memory, all maps and mips |37,749,372 bytes|40,000,000|
| Largest near / small prop |4,694 /1,884 triangles|6,000 /2,000|
| Highest LOD1/near ratio |36.5854%|40%|
| Designs |65|120|

- **53/53 Node 22.16 tests pass.**
- **53/53 per-test mutations are killed** by the exact named assertion failure; crashes/timeouts do not count.
- Independent complete validation decodes the GLBs and all 396 wall mip images, verifies exact opposite-edge matching, and checks all 43 artifact hashes.
- Unchanged payload gates pass after rebase: models **37.87 /40 MiB**, textures **33.62 /40 MiB**, shipped total **74.83 /150 MiB**.
- The old payload script does not recognise KTX2 GPU blocks. Adding the independently measured compressed walls to its PNG/JPEG/WebP estimate gives approximately **541.00 /800 MiB** for the project.
- Blender 5.2.3 was run headlessly at low priority with two threads. Existing furniture, export, priority, GLB/PNG inspection and preview helpers are reused without modification.

[Fresh command transcripts and verification](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/VERIFICATION.md) · [Catalogue/binding guide](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/README.md) · [Texture format details](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/materials-format.md) · [Original-work and CC0 note](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/LICENSE.md)

## Texture-format decision

Props share a 512 px colour atlas with matching normal and ORM planes. Each of the 12 wall sets has 1024 px albedo, normal and ORM maps with 11 mip levels. Keeping all 36 wall planes as RGBA8 would exceed 40 MB, so the wall files use standard KTX2/ZLIB containers over BC1 colour/ORM and BC5 normal-X/Y blocks. Positive normal-Z must be reconstructed. The memory measurement assumes all wall sets and atlas planes are resident together; it does not assume selective loading.

## Review renders

These are renders of the actual exported GLBs and actual shipped compressed textures. Both perspective cameras are 1.60 m above their walking planes. The illustrative architecture is offline review scenery; it is not a game integration.

![Facade at 1.60 m](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/facade-eye-1_6m.jpg?raw=true)

![Roof at 1.60 m](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/roof-eye-1_6m.jpg?raw=true)

<details><summary>All near-detail contact sheets</summary>

![contact-near-01](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-01.jpg?raw=true)

![contact-near-02](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-02.jpg?raw=true)

![contact-near-03](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-03.jpg?raw=true)

![contact-near-04](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-04.jpg?raw=true)

![contact-near-05](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-05.jpg?raw=true)

![contact-near-06](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-near-06.jpg?raw=true)

</details>

<details><summary>All LOD1 contact sheets</summary>

![contact-lod1-01](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-01.jpg?raw=true)

![contact-lod1-02](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-02.jpg?raw=true)

![contact-lod1-03](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-03.jpg?raw=true)

![contact-lod1-04](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-04.jpg?raw=true)

![contact-lod1-05](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-05.jpg?raw=true)

![contact-lod1-06](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/contact-lod1-06.jpg?raw=true)

</details>

<details><summary>Twelve seamless wall materials</summary>

![Wall-material samples](https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/materials-walls.png?raw=true)

</details>

## Assumptions and what is NOT verified

**Runtime integration in the game is untested.** Native KTX2 GPU upload, target-device BC1/BC5 support, production material/normal binding, actual building placement, collisions/occlusion, wind/cloth animation, chalk interaction, game draw calls/frame time and boot/load timing are untested. No game performance or loader-compatibility claim is made. The current game does not automatically load these maps. An uncompressed fallback would have a different memory cost and is not implemented.

Tank capacities are visual family labels, not manufacturer/volume certifications. Plant anchors use the rear foliage-inclusive clearance plane rather than a shelf bolt position. The small modelled rebar ribs are intentionally coarse and read as ticks at extreme close range. The chalkboard is blank, and no piece/texture contains lettering or logos; Spanish catalogue and review captions were checked for accents and ñ.

All new geometry and surface images are original procedural work. No scraped or downloaded art was used. The new work is CC0; existing imported helpers retain their existing licences.
