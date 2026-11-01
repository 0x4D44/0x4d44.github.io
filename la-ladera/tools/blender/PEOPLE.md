# La Ladera residents

The generator produces **30 residents**, one skinned mesh each, with the existing
21 bone names, metre scale, garment recolour slots and **32 original clips**.
Near meshes target at most 7,800 triangles; far meshes target 1,450. The hard validation
limits are 8,000 / 1,500. The scene keeps its existing 32/38 metre LOD hysteresis.

## Regenerate

Use Blender 4.5 LTS with Pillow available to its bundled Python. If Pillow is in a
separate directory, set `PEOPLE_PYSITE` to that directory; the wheel must match
Blender's Python ABI. No MPFB add-on, downloaded assets, npm packages or game build
step are needed. Run from the repository root, replacing `blender` with its path:

```sh
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/people_build.py
node la-ladera/tools/nice.mjs blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/people_build.py -- --lod
node la-ladera/tools/blender/people_validate.mjs --write-manifest
```

The last command writes the exact `files` inventory (bytes and SHA-256) into
`assets/models/manifest.people.json`, preserving its existing `people` block. The build
updates the material's texture manifest entry. A complete build comprises both
GLBs, `people_meta.json`, and the three shared PBR atlas maps. `PEOPLE_OUT` can
redirect experiments into a scratch directory; it does not change the production
texture manifest. Optional positional IDs build a subset for inspection only.

```sh
node la-ladera/tools/blender/people_validate.mjs --complete
for people_test in la-ladera/tests/people-*.test.mjs; do
  node --import ./la-ladera/tests/register.mjs --test-reporter=tap --test-reporter-destination=stdout "$people_test" || exit 1
done
node la-ladera/tools/nice.mjs node la-ladera/tests/people-shots.mjs --out .scratch/people-review
node la-ladera/tools/nice.mjs node la-ladera/tests/metrics.mjs --json .scratch/people-review/metrics.json
node la-ladera/tests/payload.mjs
```

Set `CHROME_PATH` if Chrome is not at a standard location. The shared Chrome
wrapper always runs headless and muted, with quiet input hooks and reduced
priority. Contact sheets cover every ID at both LODs, plus walking, seated and
portrait views. The same check exercises all clips, recolouring and missing-file
boot paths. `people-counts.mjs` can collect the metrics gate's forty viewpoints in
manual mode on a software GPU; it **does not replace the 12 ms frame-time gate**.
The direct TAP loop above exposes individual test cases even in environments
where Node's nested test-runner subprocess output is unavailable.

## Sources and design

`people_cast.py` records each resident's authored skin/hair, age, facial variation
and wardrobe. The cast includes Andean, mestizo, Afro-Colombian and
European-descent characters. Heritage is design context rather than an inference
from a skin colour or facial measurement. Existing IDs and casting tags survive.

`people_head.py` fits a compact, vendored **CC0 MakeHuman** head/morph dataset to
the original body rig. Nose, lips, ears, eye sockets and eyeballs are geometry.
Children, adults and elders use distinct age shapes. The clothing, hair, hands,
feet, armatures and procedural fallback remain based on the existing builder.
See `vendor/MAKEHUMAN_SOURCE.md` and `vendor/MAKEHUMAN_CC0.txt` for pinned source
commit, hashes, licensing and the offline source preparation recipe. No MPFB
program code is incorporated.

`people_clips.json.gz` preserves the original 32 clips' quaternion tracks exactly.
`people_clips.py` copies them onto the exported bone names and verifies their raw
timestamps/quaternions. This avoids resampling every rig during a normal build.
`--rebake-clips` retains the existing Blender animation recipes for deliberate
animation development; a changed bank requires explicit review against the ABI
fixture, never automatic re-blessing by the validator.

The **one shared atlas layout** has albedo, normal and roughness/metallic maps.
Images are external URLs, never embedded GLB buffer views. Solid hair shares the
same material and primitive. `people_pbr` is registered in the material library;
the existing `CharacterLibrary` continues to use its glTF material.
No behaviour in `rig.js`, `look.js`, `cast.js` or the game boot code is changed.

Authoring references: Blender's [glTF exporter](https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html)
and [armature skinning](https://docs.blender.org/manual/en/4.5/animation/armatures/skinning/parenting.html)
manuals. We retain the original weighted vertex groups, limit influences to four,
and validate exported triangles, UVs, weights and clips from the actual binary.

## Merged with the round 2-4 people work (892f94c)

The generator is Codex's, with the round 2-4 recipes re-applied on top of it:

- **Six clips are newer than the bank's first capture**: `phone_stand`, `phone_call`,
  `sit_phone`, `sell`, `sweep` and `pray` (their recipes in `people_build.py` changed in
  rounds 2-4; the other 26 are unchanged). From the repository root:
  `python la-ladera/tools/blender/people_clips.py overlay <rebaked.glb> --clips phone_stand,phone_call,sit_phone,sell,sweep,pray`
  copies exactly those clips from a `--rebake-clips` build into `people_clips.json.gz`;
  every other clip stays byte-identical and `provenance.revisions` records the source
  file, its SHA-256 and the clip names. A normal build then appends the bank as before.
- **Re-applied on the MakeHuman build**: the neck band and its collar V skin patch,
  the vest (20-gon, slightly proud of the shirt), the fringe and hair-lock relief, the
  12-sided palms and 8-sided fingers, the thigh-circle hem ring and the hair
  `vertex_shade`. The lid and glasses recipes remain in the `--procedural` branch only
  (the MakeHuman head carries real lids and Codex's fitted rims).
- **Beard at that merge**: the old ring lofts sank into the MakeHuman chin and flared
  into two wings, so the merged version sampled a shell from the jaw surface. The
  body v2 pass below replaces that shell with a continuous skin-surface tint.
- **ORM page at 1024 px**: three 2048 px pages cost 64 MB of GPU texture memory and
  broke the 220 MB gate of `tests/payload.mjs`; roughness and metal are low-frequency,
  so only that page is halved (UVs are normalised, nothing else changes).
- Blender 5.2.1 builds the whole library (near and far, about 75 s); Pillow comes from
  `PEOPLE_PYSITE` or the user site-packages of the Python Blender is paired with.

## Fallback and base-commit limitations

The original analytic head/wardrobe recipes are retained with `--procedural`.
They can regenerate a complete compatible library without the MakeHuman data.
The existing runtime retains near geometry when the optional far GLB is missing.

At the starting commit `8fa06a5498555afc5dc2b636c06754a4a6b5882c`, the main people
GLB had **25** residents; the source recipes already declared 30. The furniture
manifest was empty and its referenced complete pipeline documentation/validator
were absent. This work preserves that actual runtime contract.

That runtime has **no automatic procedural-person fallback when the main GLB is
missing**. Its isolated people stage records the failure and the explorable world
still boots, with zero NPCs. The headless missing-file check reports this honestly.
Restoring visible residents automatically requires a loader change, which is
outside this branch's no-game-code-change constraint.

## Body rebuild v2

The body work starts at `8f93ade042cdb4bfc1a796b889bbe39786241ebf` and preserves
the same resident IDs, bone recipes, bind pose, animation bank, recolour slots,
file names and material. The existing 8,000/1,500 triangle gates are unchanged.

`people_body.py` builds a fitted torso and a continuous branching trouser
surface. The trouser rise shares its crotch seam with both legs; it has no pelvis
cap or overlapping thigh caps. Fully covered upper trouser surfaces are omitted
under untucked garments. The existing rig's two thigh influences blend across
the shared rise and separate below the crotch. Pockets, seams, printed motifs
and shirt hems share the torso's surface calculation.

`people_body_limbs.py` builds the shoulder/arm profiles, turned sleeve edges,
formed palms, separated curved fingers, opposed thumbs and shaped footwear.
Its far recipes deliberately omit nails, laces and small trim. They retain the
same exact sole minimum as the original recipe, so normalization does not move
the skeleton. Final budgeting also preserves the anatomical head's already
reduced lip and jaw geometry in the near asset, and the cloth/skin cuff boundary
in the far asset. Beard coverage blends continuously across skin vertices instead
of adding a separate shell or hard triangle-shaped colour regions.

The textile atlas keeps the original 8×8 layout. Existing cells 0–61 retain
their indices; previously unused cells 62–63 hold recolourable stripes and
checks. Cotton, denim, suit cloth, wool, jersey and knit have generated yarn
relief and roughness. The external pages remain 2048² albedo, 2048² normal and
1024² ORM: **48 MiB RGBA8 including mipmaps**, with no texture allocation growth.
`people_cast.py` records each resident's fabric, tint, contrasting trim and wear.

The new body surfaces, garment details, botanical motifs and fabric generators
are original procedural work released as **CC0-1.0**. No downloaded body,
garment, texture or branded design was added. The existing vendored MakeHuman
head source retains its documented CC0 provenance in `vendor/MAKEHUMAN_SOURCE.md`.

The additional review runner captures eight residents at exactly 1.600 m
horizontal camera distance, with identical before/after lighting, pose and
lenses. It records asset hashes, texture headers, triangle counts, pixel masks
and projected bounds; full-body frames must contain every posed vertex.

```sh
LADERA_PRIO=idle node la-ladera/tests/people-bodies-shots.mjs \
  --label after --out la-ladera/dev/people-bodies-v2/after
```

It uses the existing headless, muted, low-priority Chrome wrapper. Set
`CHROME_PATH` when required. The full-body sheets use a 74° vertical lens; the
clearly labelled torso/hand and head/neck crops use 36° and 21° lenses at the
same distance. The comparison assets and acceptance outputs are under
`dev/people-bodies-v2/`.

## Round 5 hair and hat fixes on the v2 bodies (R3-024, R3-025)

Three head problems survived the body rebuild, because hair caps and hats are built from the
rows of `people_head.py` `_surface`, which v2 did not touch. Nothing below touches the v2 head,
jaw, lip, neck or body code.

- **Skull rear** (`_surface`, `rear()`): the back of the MakeHuman head has far fewer vertices
  than the face, so a vertex percentile put the rear of the skull up to 6.8 cm in front of the
  occiput at ear height. Every hair cap, bob and hat sank into the skull there: a bare skin oval
  at the back of long, bob and receding styles, and short caps that ended at ear height. From
  row 0.25 of the head height up, the rearmost surface is found by five rays from behind.
- **Hair styles** (`people_build.py`): the side curtains of a bob or long style start 15 degrees
  in front of the ear (at 30 degrees they stood over the cheek and the corner of the eye); the
  receding style is one clean horseshoe of short hair with a faded upper edge (`hair_top`) and
  no tuft shells (they were a grey band across the eyes in profile and ragged patches on the
  temples); the beret's peak is a thin closed visor that follows the rim of the cap (it was a
  single-sided quad whose baked ambient occlusion came out black: the "black tail").
- **`w_peluquera`** has her long hair again (`people_cast.py`, style `long`).

The triangle gates are unchanged (near 6,732 to 7,782 of 8,000, far 1,417 to 1,424 of 1,500).
This library was rebuilt with Blender 5.2.1 (near and far, about 100 s). The v2 evidence in
`dev/people-bodies-v2/` was built with 4.5.11 and records the hashes of the v2 assets before
this rebuild.
