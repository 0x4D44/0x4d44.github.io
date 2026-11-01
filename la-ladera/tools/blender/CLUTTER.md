# Street clutter library

`clutter_build.py` makes the street and rooftop assets with the existing
`furn_lib.py` geometry helpers and Blender GLB exporter. The deliverable is the
actual `assets/models/clutter/clutter.glb`, `manifest.clutter.json` and one
external `assets/textures/clutter/decals.png` atlas. No Blender installation or
build step is needed to view the committed assets in the game.

## Regenerate quietly

From the repository root, use the existing quiet-box wrapper for every Blender
job. `--background` is required; never start a visible Blender window.

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/clutter_build.py
node la-ladera/tools/nice.mjs node la-ladera/tools/blender/clutter_validate.mjs --complete
node la-ladera/tools/nice.mjs node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/clutter-assets.test.mjs la-ladera/tests/world-clutter.test.mjs
```

If Blender is not on `PATH`, replace `blender` with its executable path. The
builder was exercised with Blender 4.5.4. `--python-exit-code 1` makes a Python
generation failure fail the command, instead of Blender's default successful
exit. Two threads keep batch work bounded on a shared machine. It uses the furniture pipeline's
coordinate conversion and texture-free exporter. It also paints the original
atlas with Python's standard library, so there is no Pillow or image-download
dependency. The wrapper passes piped output, hides Windows console windows and
lowers process priority. Browser verification uses `tests/chrome.mjs`, whose
headless mode is mandatory and whose quiet init disables real pointer lock and
speech.

## Catalogue and budgets

All names have the `clutter_` prefix. Each base asset has a corresponding
`<key>_lod1` node. The 19 base keys cover:

| Suffix after `clutter_` | Form |
| --- | --- |
| `pole_concrete`, `pole_wood` | Utility poles, crossarms, insulators and coiled cables |
| `tank_black`, `tank_blue` | Ribbed rooftop water tanks with lids and fittings |
| `dish` | Satellite reflector, arm and mounting foot |
| `washing_line` | Washing line with shaped garments |
| `bin_wheelie`, `bin_metal` | Household and street bins |
| `crate_wood`, `crate_plastic` | Slatted timber and open plastic crates |
| `tyre`, `cone` | Discarded tyre and traffic cone |
| `shrine` | Small neighbourhood shrine |
| `umbrella`, `chair` | Market umbrella and plastic chair |
| `shutter`, `sign` | Shutter and local sign with atlas artwork |
| `gas_cylinder`, `helmet` | Gas bottle and parked motorbike helmet |

The game coordinate frame is metres, +Y up and +Z front, with a centred X/Z
footprint and base at Y=0. The manifest records `node`, `tags`, `size` (W/H/D),
`footprint` (W/D), measured `bounds`, `triangles`, `parts` and the `lod1` key.
Footprints conservatively contain the full silhouette, including pole
crossarms; they are not automatically ground-level collision boxes.

LOD0 has **strictly fewer than 500 triangles**, except poles and tanks, which
have **strictly fewer than 900**. LOD1 uses at most 65% of its LOD0 triangles.
Rigid mesh parts share library material names and vertex colours, and contain
no skin, animation, embedded image or GLB texture reference. The whole library
must be **strictly below 2,000,000 bytes**, including both LODs, the manifest,
the atlas and any stale files left in either asset directory.

`clutter_decal` is a normal unit-UV material in `js/world/matdefs.js`.
`assets/textures/manifest.json` binds it to `clutter/decals.png`. The atlas tile
rectangles are recorded in `manifest.clutter.json`; the same image supplies
graffiti, posters and sign lettering.

## Validation and fallback

`clutter_validate.mjs --complete` requires every catalogue family and LOD,
actual generated files, root manifest registration and the atlas's runtime
material binding. It reads the binary index and vertex buffers, checks actual
counts and bounds against the manifest, and rejects unknown material names,
non-finite geometry, bad indices, incorrect normals, invalid UVs, unregistered
nodes, embedded textures, path escapes and budget overruns. Without
`--complete`, an intentionally partial catalogue can be checked while modelling;
it still has to contain valid real assets with valid LOD pairs and an atlas.

The wheelie-bin, shutter and A-frame sign also have a specific exported atlas
cell and upright-orientation check. Blender flips texture V during export;
the generator compensates before handing decal UVs to Blender. The validator
reads the resulting binary UVs and checks them against the intended atlas
tiles, so selecting a plausible but wrong poster cannot pass.

`tests/clutter-assets.test.mjs` deliberately removes or corrupts assets to prove
the checks fail. Its complete-library check is unconditional: an empty
manifest cannot make the suite pass.

The runtime only replaces an original procedural prop when both its near and
far GLB nodes are loaded. Missing manifests, files or nodes leave the original
procedural generators available. New clutter is batched with shared geometry
and materials; runtime distance selection chooses the appropriate LOD and
culls small distant props. There is no per-frame GLB loading.

## Sources and authorship

These meshes and the atlas are original generated work, supplied under
**CC0-1.0**. No downloaded model, photograph, brand badge or commercial poster
is embedded in the payload. Shape references include the
[Poly Haven model library](https://polyhaven.com/models) and
[ambientCG](https://ambientcg.com), both of which publish their downloadable
assets under CC0 ([Poly Haven licence](https://polyhaven.com/license),
[ambientCG licence](https://docs.ambientcg.com/license/)).

Photographs of Medellín, La Paz and Valparaíso inform placement, overhead
cable density, roof utility equipment and small-scale street use. They are
visual references only, retain their own licences and are not texture sources:

- [Medellín: Barrio La Avanzada, Farley Jhair Macias Betancur](https://commons.wikimedia.org/wiki/File:Vista_a%C3%A9rea_del_Barrio_La_Avanzada,_Comuna_1_-_Popular,_Medell%C3%ADn.jpg) (2016, CC BY-SA 4.0).
- [La Paz: Leo's travel photograph collection](https://leo-trips.com/bolivia/la-paz) (copyrighted visual reference only).
- [Valparaíso: power lines, Draceane](https://commons.wikimedia.org/wiki/File:Valpara%C3%ADso_9401.jpg) (2019, CC BY-SA 4.0).

Before/after world-test, metric and screenshot evidence is recorded with the
[branch's verification report](../../dev/clutter-review/README.md). Timing results must identify the renderer: a
software-rendered headless run cannot establish a hardware 12 ms frame claim.
