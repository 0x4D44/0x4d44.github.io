# Shared UK and Colombian substation library

This is an **offline asset library**, with 40 shared equipment designs and 13
site designs for each country. Every design has a named near root and a far root.
The two variants reference the **same shared GLB path and SHA-256**. They do not
carry duplicate copies of the common machinery.

The game does not load this library. `manifest.substation.json` is deliberately
absent from `assets/models/manifest.json`; no `js/` file or boot registry changes.
The Colombian yard can be integrated into La Ladera later. The UK variant is
available to other projects through the same catalogue, material and plan schema.

These are original, fictional, slightly worn, vintage oil-filled installations.
**Clearances and equipment layouts are visually plausible, not engineering-certified.**
The data is scenery, not a construction plan, operational procedure, electrical
safety specification or permission to enter a real substation.

## Files and units

| File | Purpose |
| --- | --- |
| `substation.catalog.json` | Physical metre envelopes, required features, pivots and all 66 design keys |
| `substation.site.catalog.json` | Source catalogue for the 26 country-specific structures |
| `substation_common.py` | Geometry adapter, atlas UVs, shared mesh cache and named pivots |
| `substation_equipment.py` | Shared transformers, switchgear, indoor board and site equipment |
| `substation_site.py` | Country-specific towers, poles, fences, gates and building kit |
| `substation_atlas.py` | Deterministic PBR surfaces and real per-cell OCR sign audit |
| `substation_build.py` | Headless Blender export, staging, independent validation and transactional install |
| `substation_manifest.mjs` | Manifest measurements from the actual exported GLB accessors |
| `substation_validate.mjs` | Independent GLB/PNG decoder and complete acceptance gate |
| `substation-plan.uk.json`, `substation-plan.co.json` | Parallel 55 × 40 m compound data, metre origin at compound centre |
| `../substation_plan.mjs` | Pure plan generation, walking-clearance checks and strict variant parity |
| `../substation_catenary.mjs` | Pure catenary math and optional injected-Three.js instanced-span adapter |
| `../substation_materials.mjs` | Optional future-consumer PBR and sign-material binding; never imported by game boot |

Geometry uses metres, **+Y up, +Z front**, with each root at its footprint centre
on the ground. Nodes are `substation_<type>` and `substation_<type>_lod1`.
The catalogue gives width, height and depth; the manifest additionally gives
the exact bounds measured from transformed binary vertices. Validation allows
3 cm of envelope variation and checks a ground origin within 0.1 mm.

Repeated insulator units, cooling fins and other repeated components reference
the same glTF mesh data. Triangle counts include **every drawn instance**, not
just the unique mesh buffers. Fence panels repeat through yard instance data.
No long overhead conductor mesh is shipped.

## Contents and variant differences

| Shared machinery | Included details |
| --- | --- |
| 40 MVA grid transformer | Tank, radiator banks, conservator, Buchholz relay and piping, tap-changer housing, three HV and three MV bushings plus neutral, fans, marshalling kiosk, rating plate |
| 15 MVA distribution transformer | Smaller family, radiator/cooling/porcelain detail and LV cable box |
| Oil breakers | HV bulk-oil dead tank, MV outdoor oil breaker and withdrawable indoor truck |
| Outdoor switchgear | Portal gantry, tension strings, centre-break and pantograph disconnectors, CT, capacitor VT, arrester, post insulator, earthing switch, tubular busbar and short wire segment |
| Indoor control equipment | Repeated switchboard panel with door, meter, relay and mimic strip; control panel; battery bank; charger; desk; chair; wall schematic; trench covers |
| Site kit | Bund and sump, fire wall, oil store, station-service transformer, floodlight mast, lightning mast, earth marker, hazard board, tag holder, gravel/concrete tiles and weeds |
| Reusable fittings | Bushings, insulator discs and strings, spacers and radiator fins |

The yard places two grid and two distribution transformers, twelve indoor board
panels and the same semantic equipment roster for both variants.

| Variant field | UK | Colombia |
| --- | --- | --- |
| Voltage family | 132 / 33 / 11 kV | 115 / 34.5 / 13.2 kV |
| Signs | English | Spanish, including accented capitals and Ñ |
| Paint and porcelain | Grey-green/light-grey, brown and grey porcelain | Light-grey/chalked ochre, brown porcelain |
| Wear | Damp steel and concrete, moss, no graffiti | Rust streaks, algae, oil marks and a few dry gravel weeds |
| Towers | Original double-circuit lattice suspension and tension designs | Distinct original double-circuit lattice suspension and tension designs |
| MV / LV poles | Wooden H-pole / wooden single pole | Concrete H-pole / round concrete single pole |
| Perimeter | Green steel palisade with anti-climb top | Chain link, concrete plinth and barbed-wire outriggers |
| Control building | Brick shell with metal louvres and flat roof | Rendered-block shell, concrete roof and metal louvres |

The brief calls the 11/13.2 kV board and poles the “low-voltage” tier. The file
IDs retain `lv` for that relative tier; these are not domestic low-voltage assets.
All names, tags and artwork are fictional; no utility badge, real station name,
manufacturer logo or copied equipment mesh is included.

## Quiet regeneration

Run from the repository root with **Node 22.16.0**, **Blender 5.x**, Python 3,
Pillow, NumPy, DejaVu Sans Bold and Tesseract with `eng` and `spa` data installed.
Only the asset-authoring tools need these dependencies. There is no shipped
runtime build step and no added npm package.

```sh
node la-ladera/tests/memgate.mjs 6 300
node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/substation_atlas.py
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/substation_build.py
node la-ladera/tools/substation_plan.mjs --write
node la-ladera/tools/blender/substation_manifest.mjs
```

Use the atlas generator's `--font` or `--tessdata` option where the platform needs
an explicit font or Tesseract data directory. Pass `-- --node /absolute/path/node`
after the Blender invocation when its PATH does not contain the required Node.
The builder stages owned outputs, validates them, installs only those outputs
and publishes the manifest last. A caught installation failure restores the
previous files. It does not regenerate OCR images implicitly.

Filtered previews must use a separate output directory:

```sh
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python-exit-code 1 --python la-ladera/tools/blender/substation_build.py -- --only substation_grid_transformer --out /tmp/substation-preview/models
```

Preview manifests say `complete:false`. Complete mode rejects them. Raw
`--geometry-only` exports are also restricted to a separate output directory.

Text SHA pins use **UTF-8 with CRLF normalized to LF**, and text byte pins use
the same normalized bytes. GLBs and PNGs are pinned exactly as stored. This
keeps a Windows `core.autocrlf=true` checkout and a clean Git export equivalent.

## Materials, signs and GPU cost

One 1024 × 1024 shared PBR atlas set supplies base colour, tangent normal and
packed **occlusion / roughness / metallic** maps. Its 32 guttered cells cover
galvanised and rusted steel, brown/grey porcelain, paints, peeling paint,
clean/damp/algae concrete, gravel, rubber, brick, render, oil, wood and vegetation.
Each country has one 2048 × 1024 sign atlas with 32 signs, ratings and numbers.

The five PNGs require **39,146,836 bytes** for RGBA8 storage including every mip
level, below the decimal 40,000,000-byte limit. Normal and ORM maps are linear;
base colour and signs are sRGB. No image is embedded in a GLB.

`atlas.json` records each cell's intended text, raw OCR output, normalized detected
text, language, pixel rectangle and SHA-256 of the actual RGB pixels. It also
records the Tesseract version and recognition-data hashes. OCR treats the
typographic dash as equivalent to an ASCII hyphen; it does **not** discard
accents or replace Ñ with N. The independent validator checks all 32 canonical
labels in each language, plus the pixel hashes and texture byte pins. Changing
a Colombian cell to English fails, even if the text metadata is changed with it.

UVs are deliberately bottom-origin; external Three.js textures use `flipY=true`.
Variant paint/porcelain/weathering bindings offset the UV cell using cloned
texture handles which share the same underlying image Source. The material
helper caches the three common image Sources across both variants and releases
them only after both consumers dispose their bindings. Do not load a second
set of the common maps for the second variant.

Fresh runtime primitives, such as the unit catenary cylinder, initially have
0..1 UVs. Call `mapSubstationUvs(geometry, atlas, materialName)` before applying
an atlas material. The exported GLBs already have their cell UVs and must not
be remapped a second time.

## Hinges, anchors and yard schema

Movable objects have named child pivots at both LODs: doors, breaker mechanism
doors, disconnector blades, pantograph links, earth-switch blades, cooling fans,
gate leaves and the truck handle. Catalogue `pivotDefinitions` provide actual
decoded local positions, axes, movement type and ranges. The validator checks
that every required pivot owns geometry and has the same transform in both LODs.
Apply rotations in the pivot's local frame. A translating desk drawer uses its
declared translation axis instead of a rotation.

Each plan has `equipmentTypes`, `equipment`, `bays`, `trenches`, `compound`,
`visitorRoute`, `spans` and a `variantProfile`. An equipment instance refers to
a semantic type; `equipmentTypes[type].variantBinding.asset` selects the actual
GLB root. Position is `[x,y,z]`, rotation is `rotationY` in radians. Fence
infills and cut trench covers may scale their module width; transformers and
other equipment retain real dimensions.

Each type has a conservative navigation keep-out polygon, a standing or seating
anchor, explicit hum/light/hinge anchor fields and
`inspectionNote: { "es": "", "en": "" }`. Absent functions use explicit empty
or null entries. Geometry-specific hinge positions live in `variantBinding` and
refer to the exact named GLB pivots. Sign IDs in `tagCells` refer to the chosen
variant's atlas; gate `pivotRotations` describes its initial open pose.

The visitor route uses a 1.6 m eye height, 0.35 m body radius and 0.25 m comfort
margin. The validator measures whole route segments against polygon edges,
including the enlarged live-equipment exclusions; it does not merely sample
points on the path. The entrance gate must be open. These are navigation and
visual reach checks, not electrical safety certification.

Both variants intentionally request a **100 Hz hum cue**, with audio disabled
by default. The UK profile is 50 Hz. The Colombian grid profile remains 60 Hz;
its requested 100 Hz cue is an artistic override, not a claim that the local
grid is 50 Hz. A physical twice-frequency transformer hum there would normally
be 120 Hz. No sound was generated or played while building or testing.

## Instanced catenary recipe

`solveCatenary(start, end, {sag})` solves
`y(s) = a cosh((s-b)/a) + c` in the vertical plane of the horizontal span.
Sag is the midspan vertical deficit below the straight endpoint chord. Unequal
endpoint heights are supported. `catenarySegments` samples equal arc distance,
with a default maximum segment length of 0.6 m and an explicit segment-count cap.

| Preset | UK span / sag / phase spacing | CO span / sag / phase spacing |
| --- | --- | --- |
| HV double circuit | 90 / 3.6 / 4.8 m | 80 / 3.2 / 4.4 m |
| MV three phase | 48 / 1.4 / 2.0 m | 44 / 1.35 / 2.0 m |
| LV tier three phase | 36 / 0.75 / 0.96 m | 34 / 0.7 / 0.96 m |

The plan's `variantProfile.resolvedSpans` contains actual endpoint positions,
scaled sags and conductor radii for its individual phases. The adapter accepts
the caller's Three.js r180 namespace and material:

```js
import { createSpanInstances } from './tools/substation_catenary.mjs';
import { mapSubstationUvs } from './tools/substation_materials.mjs';
const wire = createSpanInstances(THREE, start, end, {
  sag: 1.4, radius: 0.012, maxSegmentLength: 0.6,
  material: materialSet.get('substation_galvanised'),
});
mapSubstationUvs(wire.geometry, atlas, 'substation_galvanised');
scene.add(wire);
// On removal: wire.geometry.dispose(); the caller owns the material.
```

One unit cylinder is drawn through per-instance matrices. This is a visual
catenary; it does not solve conductor tension, temperature, wind or loading.

## Verification and visual review

```sh
node la-ladera/tools/blender/substation_validate.mjs --complete --variant uk
node la-ladera/tools/blender/substation_validate.mjs --complete --variant co
node la-ladera/tests/substation-assets.test.mjs
node la-ladera/tests/substation-catenary.test.mjs
node la-ladera/tests/substation-yard.test.mjs
node la-ladera/tests/substation-asset-mutations.mjs
node la-ladera/tests/substation-yard-mutations.mjs
node la-ladera/tests/payload.mjs
node la-ladera/tools/nice.mjs --idle node la-ladera/tests/substation-shots.mjs
```

The new tests are mutation-checked by changing isolated copies of inputs or
implementation and rerunning the **unchanged targeted test**, requiring both
nonzero exit and the intended assertion failure. The shipped files are never
mutated. The asset checks cover malformed/non-finite vertices, metre scale,
real far-LOD triangle counts, pivot loss, duplicate shared geometry, lost mesh
instancing, PNG corruption, foreign-language cells, English pixels in the
Colombian image, lost Ñ, stale pins, boot registration and unknown plan assets.

The [visual gallery](../../dev/substation/gallery.html) loads actual GLBs and
PBR maps without starting the game. Contact sheets show every item from a
1.6 m camera, near detail beside a 1.8 m figure, and its far LOD beside the same
figure. The variant comparison and yard overviews use the same assets and
the actual plan data. See [verification evidence](../../dev/substation/README.md)
for captured output, images and material limitations.

## Reference basis and original-work licence

All meshes, surface textures, layouts and sign designs are original procedural
work released as **CC0-1.0**. DejaVu Sans is rasterized into the sign artwork;
no font binary is shipped. No external photograph or manufacturer model was
used as texture artwork. Primary references informed generic scale and function:

- [SSEN, Shin–Loch Buidhe 132 kV replacement information](https://www.ssen-transmission.co.uk/globalassets/projects/shin-to-loch-buidhe-132kv-overhead-line-rebuild/shin--loch-buidhe-132kv-replacement--feb-25-info-event.pdf): double-circuit steel lattice towers, average height around 33 m.
- [Enel Colombia distribution network generalities](https://likinormas.enelcol.com.co/normas/lineas-aereas-urbanas-de-distribucion/generalidades-lineas-aereas-urbanas-la/generalidades-11-normas-de-construccion-redes-aereas-urbanas-de-distribucion): 115/34.5 kV and 34.5/13.2 kV transformation families and 13.2 kV distribution.
- [Schneider Electric, Buchholz relay function](https://www.se.com/ae/en/faqs/FA335909/): the relay's position in the pipe connecting tank and conservator, and gas/oil-flow protection function.
- [Enel Colombia, ET-008](https://www.enel.com.co/content/dam/enel-co/espa%C3%B1ol/2-1-6-normas-tecnicas/especificaciones-tecnicas-para-materiales-y-equipos-de-media-tension/ET-008.pdf): the 60 Hz equipment profile used for the Colombian variant.
- [SSEN, Netherton noise and vibration assessment, section 13.1.4](https://www.ssen-transmission.co.uk/globalassets/projects/netherton-hub-environmental-impact-assessment-documents/volume-2-eia-report/volume-2-chapter-13-noise-and-vibration.pdf): twice-frequency transformer hum; the Colombian 120 Hz consequence is an inference from this relationship and its 60 Hz profile.
- [DejaVu font licence](https://dejavu-fonts.github.io/License.html): authoring font provenance.

These references are scale and functional context; the models do not reproduce
a named manufacturer's product or certify a real utility's layout.
