# Animal library

Seven original CC0 animal assets: street dog, ginger cat, pigeon, hen, mule,
parrot in a standing cage and canary in a standing cage. Each has a near GLB,
a static far GLB and `idle`, `walk`, `eat` clips. Origins are on the floor;
units are metres; +Y is up and +Z is forward. Cages include their stands.

## Regenerate

From the repository root, with **Blender 4.5.3 LTS** on PATH (or substitute its
absolute executable path):

```sh
node la-ladera/tests/memgate.mjs 3 60
node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --threads 2 --python-exit-code 1 --python la-ladera/tools/blender/animals_build.py
node la-ladera/tools/blender/animals_validate.mjs --complete
```

The generator reuses `furn_lib.py` for geometry, winding, linear vertex colour,
normal and coordinate conventions. Blender evaluates and decimates the manually
simplified far silhouettes. The small standard glTF packer preserves exactly nine
authored poses per channel instead of baking every frame. It writes skin joints,
inverse bind matrices and standard rotation channels directly, following the
people pipeline's binary packing approach. No Draco, mesh compression extension,
add-on, external model, image, texture or source download is needed. Generated
geometry and animations have their own CC0 dedication in
`assets/models/animals/CREDITS.md`; generator code retains the repository licence.

Use `-- --out /absolute/path/to/models` after the script argument for a separate
output directory. This also copies the asset credits. The generator always builds
the whole set, then writes `manifest.animals.json` with actual triangle counts,
byte sizes, bounds, clip durations and asset-registry entries. Commit all fourteen
GLBs and the manifest together. The normal validator permits a missing/empty
manifest for fallback deployments; **`--complete` requires all seven species**
and rejects incomplete, malformed, inconsistent or over-budget assets.

## Runtime hook

`js/animals/index.js` loads the bank after the existing people have spawned. The
seven near and seven far GLBs must all load and pass runtime checks before any
animal is attached. A missing manifest or GLB leaves the pre-existing world alone:
there are no substitute meshes, scene nodes, colliders, occupancy reservations,
changed random streams or registered animal update callbacks. Existing procedural
life in `js/world/life.js` is preserved.

Ten animals are placed deterministically, using a separate seeded random stream.
Moving animals reuse **`NavGraph.path`, `PeopleWorld.waypoints`, `Npc.walk` and
`Npc.step`**. A small passive callback in the existing people update drives them;
there is no additional simulation or scheduler. Caged birds remain stationary;
their `walk` clip is an in-place perch step. Animals neither block the player nor
register as talking residents. `?skip=animals` skips loading entirely;
`?skip=people` also omits animals because their existing clock and navigator are
absent.

At most six near models are shown, within 18 metres of the camera. Other visible
animals use a static far mesh and disappear beyond 72 metres. Near animations run
at 30 Hz; far skeletons are not evaluated. Added meshes receive existing shadows
but do not create another shadow draw pass. `ctx.animals.list()`, `.stats()` and
`.dispose()` are available through the existing debug context.

## Budgets and verification

- Every near model: at most 3,000 triangles, including cages and stands.
- Every far model: at most 300 triangles, including cages and stands.
- Whole `animals/` directory plus manifest: at most **2,000,000 bytes**.
- All mesh material names resolve through `core/matlib.js`: `fur` and `galvanised`.
- All colours are vertex data. There are no GLB images, textures or external buffers.

Run the asset corruption tests, existing people/world regression tests, quiet
headless pose captures and unmodified world metrics:

```sh
node la-ladera/tests/animals-assets.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/animals-runtime.test.mjs
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/people-*.test.mjs la-ladera/tests/world-*.test.mjs
node la-ladera/tests/animals-shots.mjs
node la-ladera/tests/animals-world.mjs
node la-ladera/tests/metrics.mjs --json la-ladera/dev/evidence/animals/metrics.json
node la-ladera/tests/payload.mjs --json
```

Set `CHROME_PATH` when Chrome is not in a standard location. All browser work uses
`tests/chrome.mjs`, which is headless only, suppresses audio and pointer lock and
closes only its own process tree. Blender is always background-only and runs under
`tools/nice.mjs`. Never open a visible window for regeneration or screenshots.

The screenshot script captures two actual skinned poses per clip for every animal,
seven far views and a labelled contact sheet. It selects distinct phases by
measuring posed vertex movement, records hashes of the source GLBs and fails on
static clips, unknown materials, geometry over budget or browser errors. Evidence
is kept under `dev/evidence/animals/`, excluded from the shipped payload.

For a comparison against the existing world, run the same metrics command with
`--query skip=animals`. Keep any failures visible in the report; timing on a
software renderer is not evidence that the 12 ms GPU target has passed.
