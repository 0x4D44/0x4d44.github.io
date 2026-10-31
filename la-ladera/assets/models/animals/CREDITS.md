# La Ladera animal assets

## Licence: CC0-1.0

The original geometry, vertex colours, skeletal rigs and animation keyframes in this
directory are dedicated to the public domain under **Creative Commons CC0 1.0 Universal**.

- Licence deed: <https://creativecommons.org/publicdomain/zero/1.0/>
- Legal text: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>
- Source: `la-ladera/tools/blender/animals_build.py` and `animals_lib.py` in this repository.
- Authoring date: 31 October 2026.

| Asset keys | Files | Provenance |
| --- | --- | --- |
| `dog` | `dog.glb`, `dog_lod.glb` | Original lean street dog, asymmetric ears, white muzzle and socks, tail, rig and clips. |
| `cat` | `cat.glb`, `cat_lod.glb` | Original ginger tabby with pointed ears, whiskers and curved upright tail, rig and clips. |
| `pigeon` | `pigeon.glb`, `pigeon_lod.glb` | Original grey pigeon with green neck, barred wings, toes, rig and clips. |
| `hen` | `hen.glb`, `hen_lod.glb` | Original brown hen with red comb and wattles, separate tail feathers, rig and clips. |
| `mule` | `mule.glb`, `mule_lod.glb` | Original long-eared mule with hooves, dark mane and tail tuft, rig and clips. |
| `parrot_caged` | `parrot_caged.glb`, `parrot_caged_lod.glb` | Original green parrot, hooked beak, perch, bowls, cage and stand; bird rig and clips. |
| `canary_caged` | `canary_caged.glb`, `canary_caged_lod.glb` | Original yellow canary, perch, bowls, cage and stand; bird rig and clips. |

All seven near assets contain original `idle`, `walk` and `eat` clips. The caged
birds' walk is an in-place perch step; neither the cage nor its stand moves.

No third-party model, rig, animation, image or texture data is embedded. No Poly Haven,
Blender Studio, Quaternius or OpenGameArt asset was imported. Existing repository
geometry/colour helpers from `furn_lib.py` are reused by the generator; Blender's
native decimator evaluates the far meshes. The software's existing licence is
unchanged; this dedication applies to the generated animal assets, not to Blender
or other third-party software.
