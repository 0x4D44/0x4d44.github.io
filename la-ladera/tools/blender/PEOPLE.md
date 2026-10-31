# La Ladera residents

The generator produces **30 residents**, one skinned mesh each, with the existing
21 bone names, metre scale, garment recolour slots and **32 original clips**.
Near meshes target 6,200 triangles; far meshes target 1,450. The hard validation
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
