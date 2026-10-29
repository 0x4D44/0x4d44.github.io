# La Ladera - shared contract (v1)

Slug `la-ladera`, a static page in `H:\worktrees\0x4d44.github.io\20261029-DEV-CLA-la-ladera-explorable-3d-hillside-barrio\la-ladera\`
(repo root = the parent). Final URL https://0x4d44.github.io/la-ladera/ . Plain static files only: native ES modules + an importmap, NO bundler,
NO build step. Three.js r180 is vendored in `vendor/three/`.

## 0. The product

A first-person, WASD + mouse walkable **hillside barrio** (a 200 x 200 m plot) inspired by dense South American cities - Medellin's comunas,
Bogota's La Candelaria, Valparaiso's colour, Rio's morros, La Paz's verticality, Quito's stairs. **Layered housing** stepping up a steep slope,
apartment blocks, shops, balconies, rooftop terraces, steep streets, stairways, alleys and courtyards. The player can **enter every building**
(every door opens; no locked doors) and every interior is furnished, finished and decorated like a real home or shop. **People live there**:
they sweep, cook, sell, chat, sit, hang laundry, walk the stairs. The player presses **E** on a person and they answer **in Spanish**
(browser text-to-speech + subtitles). The whole thing must feel **lived-in, human-scale, beautiful and rich with discovery**.

It is judged by adversarial reviewers against `dev/RUBRIC.md`; we iterate until the overall score is above 9.0. Read the rubric - it tells you
exactly what "good" means, including the measurable parts.

## 1. World bible (art direction - everyone follows it)

* **Where**: La Ladera, a fictional barrio on the slope of an unnamed Andean city. Colombian flavour (Medellin/Bogota), with Valparaiso colour and Rio
  verticality. Hot-cool highland light, thin air, afternoon haze. Default time **17:12**, low warm sun from the west, long soft shadows. Day/night cycle exists.
* **The hill rises toward -z** (north). Ridge + mirador (viewpoint) at the north, the city falls away to the south. The road switchbacks down the hill.
* **Building language** (A2): colour-washed plaster (ochre, terracotta, rose, cobalt, mint, butter, whitewash, raw grey cement) mixed with exposed
  orange hollow-clay brick, bare concrete frames with rebar sprouting from unfinished top floors, corrugated zinc (rust, blue, red) and clay-tile roofs,
  flat roof terraces with parapets, water tanks (tanques), washing lines, satellite dishes, pigeon lofts, wrought-iron window grilles (rejas), roll-up
  steel shop shutters, hand-painted shop signs, balconies with iron railings and plants in paint buckets, tangled power/phone cables, murals, posters, tarps.
  **Nothing is pristine**: damp stains, peeling paint, patched render, chalk drawings, stickers, repairs.
* **Interiors** (A3): modest to comfortable homes. Ceramic tile floors (checker, terracotta), cement-screed floors, pine and laminate, painted walls in saturated
  mid-tones (mint, sky, peach, lilac, ochre) with a darker dado, whitewashed ceilings with a bare bulb or fan, plastic and wooden chairs, formica tables with oilcloth,
  vinyl sofas with crochet covers, wall units with knick-knacks, religious pictures and a small altar, framed family photos, calendars, football posters (generic - no real
  crests/brands), a TV on a stand, an electric-shower bathroom, a gas cylinder (pipeta) in the kitchen, hanging laundry in the patio, a caged canary, a radio.
* **People** (A4): mestizo, indigenous-Andean, Afro-Colombian and white-Latino residents of all ages (children, teens, adults, elders, both sexes), realistic skin
  tones (see `PALETTE.skin`), black/dark-brown straight and wavy hair, tight curls, grey/white elders; everyday clothes (jeans, jerseys, polos, dresses, aprons, school
  uniform, ruana/poncho on elders, caps, sombreros, flip-flops, sneakers). Natural Colombian-flavoured Latin American Spanish (see 8 for rules).
* **Mood**: warm, human, a bit melancholic, full of small stories you can stumble on. Cluttered, not messy; characterful, not caricature. No real brands, no real club crests.
* **Names**: Calle del Sol (main road), Escalinata de la Virgen (grand stair), Plazoleta de los Almendros (plaza), Cancha El Cerro (court), Mirador del Cielo (viewpoint),
  Pasaje del Gato (alley), Callejon de los Faroles... A5 chooses more; all place names are Spanish.

## 2. Team, ownership, rules of engagement

| Agent | Role | OWNS (only you edit these) |
|---|---|---|
| **A1** | ENGINE + LOOK | `js/engine/**`, `js/core/**` (kernel: physics, mesh batcher, matlib, interact, assets, registries), `js/main.js`, `index.html`, `css/**`, `tools/textures/**`, `assets/textures/**`, `js/ui/**`, `js/audio/**` |
| **A2** | ARCHITECTURE | `js/arch/**`, `tools/blender/arch_*`, `assets/models/arch/**`, `assets/models/manifest.arch.json` |
| **A3** | INTERIORS | `js/interiors/**`, `tools/blender/furn_*`, `assets/models/furniture/**`, `assets/models/manifest.furniture.json` |
| **A4** | PEOPLE | `js/people/**`, `tools/blender/people_*`, `assets/models/people/**`, `assets/models/manifest.people.json`, `css/people.css` |
| **A5** | ENVIRONMENT | `js/world/**`, `tools/blender/world_*`, `assets/models/world/**`, `assets/models/manifest.world.json` |
| lead | integration | `dev/**`, `tests/chrome.mjs`, `tests/shot.mjs`, `tests/hooks.mjs`, `tests/register.mjs`, `tests/headless.mjs`, git, Almanac files |

Rules (violations waste everyone's time):
1. **Edit only files you own.** You may READ everything. `matdefs.js` of each module is owned by that module's agent; the texture factory (A1) reads all of them.
2. A change you need in a file you do not own: append to `dev/REQUESTS.md` (`## A<n> -> A<m>|lead: <what and why>`), then continue with a local workaround.
   Before starting each major step, re-read `dev/REQUESTS.md` for requests addressed to you. A1 owns the kernel: kernel changes must stay backward compatible.
3. **Never run git write commands** (add/commit/stash/checkout/reset/merge...). The lead owns git. `git status/diff/log` are fine.
4. **Scratch**: `<repo>/.scratch/<agent>/` (git-excluded) for screenshots, intermediates, downloads. Never write big temp files in the repo tree. Never commit-bait: no screenshots or logs under `la-ladera/`.
5. **Progress log**: keep `dev/progress/<agent>.md` updated at each milestone (what works, how to run it, known gaps, next steps). A successor must be able to resume from it.
6. **Verify with your own eyes**: screenshot your work (see 9) and LOOK at the images (Read tool). Fix what you see. "It should work" is not evidence.
7. **Time matters**: do not spend time that can be avoided; the earlier a correct result is obtained, the better. Get a minimal working version of your module into the integrated page FIRST,
   then deepen quality. Never leave the integrated page broken: if you must do a risky rewrite, develop it beside the live file and swap when it works.
8. Run long commands in the background with output to a file; use `deltic timeout <secs> <cmd>` to bound them; close stdin (`</dev/null`). Never `sleep` to poll.
9. Never end your turn without the final report (see 11). Report only what you observed; label inference as inference.
10. No new npm packages in the repo. Dev-only tools may be installed to `.scratch/`. No network calls from the shipped page (everything is vendored/local). No secrets.
11. **Shared-box memory etiquette** (the machine is short of commit memory; at ~0 GB free every process fails, agent sessions included). Before launching Blender or Codex run
    `node la-ladera/tests/memgate.mjs 6 300 && <command>` (waits until >= 6 GB commit-free; exit 1 = still short, retry later). `tests/chrome.mjs` `launch()` gates itself (5 GB).
    At most ONE headless Chrome, ONE Blender and ONE Codex job per agent at a time; close Chrome (`await b.close()`) the moment you are done with it (never leave pages open between steps);
    prefer `?manual` + small viewports (1280x720) and `--dpr=1`; do not run big loops of fresh Chrome launches - batch many shots into one boot with `--steps`.

## 3. Units, axes, frames

* Metres. +Y up. World origin = plot centre. **x = east, z = south**; plot is x,z in [-100, 100]. The hill rises toward **-z**; elevation roughly 0 m (south edge) to 30 m (north edge).
* Facing: an object with local front +z, rotated `ry` about Y, faces world direction `(sin ry, cos ry)` in (x,z). Walking toward (dx,dz) means `ry = atan2(dx, dz)` (`faceY` in `core/frame.js`).
* **Camera yaw 0 looks toward -z** (north, uphill); forward = `(-sin yaw, -cos yaw)`. Pitch + looks up.
* **Building-local frame** (`makeFrame` in `core/frame.js`): origin = footprint centre at ground-floor finished-floor level; +x = building width axis (left-to-right as seen from the street),
  +z = FRONT (street side), +y up. `lot.rotY` maps local +z to the world direction of the street. `toWorld/toLocal/dir` helpers. Author geometry in local coordinates and let
  `MeshBuilder.setBasePose(lot.x, lot.y, lot.z, lot.rotY)` place it.
* Heights: `lot.y` = finished floor level of the ground floor (world). Floor `i` has local floor top `y_i = i * lot.fh` (+ small per-building variation allowed, but stay consistent with the stairs).

## 4. Boot pipeline and entry points (js/main.js runs these in order; every stage is isolated, timed, error-captured)

| # | stage | call (owner) | notes |
|---|---|---|---|
| 1 | engine | `initEngine(ctx)` (A1) | renderer, camera, scene lights, `ctx.render/step/setHour`, debug API |
| 2 | materials | `ctx.matlib.init()` (A1) | reads `assets/textures/manifest.json` |
| 3 | assets | `ctx.assets.init()` | reads `assets/models/manifest*.json` |
| 4 | plan | `generatePlan(ctx)` (A5, `js/world/plan.js`) | PURE DATA. Then `ctx.physics.setTerrain(plan.heightAt)` |
| 5 | world | `buildWorld(ctx)` (A5, `js/world/terrain.js`) | terrain, streets, stairs, retaining walls, plazas, courts + their colliders (`ctx.physics.add`) |
| 6 | arch | `planBuilding(ctx, lot)` per lot (A2, `js/arch/index.js`) | PURE DATA -> BuildingPlan; stored in `ctx.buildings` |
| 7 | furnish | `loadInteriorAssets(ctx)`, `furnishBuilding(ctx, bp)` per building (A3, `js/interiors/index.js`) | PURE DATA: finishes, furniture list, blocker walls, anchors, lights, discoveries |
| 8 | colliders | main.js: `ctx.physics.add(bp.colliders)` for every building | A2 + A3 both append to `bp.colliders` BEFORE this stage |
| 9 | build | `buildBuilding(ctx, bp)` (A2) then `buildInterior(ctx, bp)` (A3) per building | meshes. Yields between buildings |
| 10 | props | `buildProps(ctx)` (A5, `js/world/props.js`) | street furniture, flora, poles + cables, vehicles, signage, periphery/vista; may read `ctx.buildings` |
| 11 | flush | `ctx.batch.flushAll()` | turns every MeshBuilder into merged meshes |
| 12 | people | `loadPeople(ctx)`, `spawnPeople(ctx)` (A4, `js/people/index.js`) | after physics is complete; registers `ctx.people` and `ctx.addSystem('people', update, 20)` |
| 13 | start | `startEngine(ctx)` (A1) | player, UI, audio, loop |

URL flags: `?autostart` (skip title + pointer lock) `?manual` (no rAF; drive via `__ladera.step/render`) `?debug` `?hour=17.2` `?seed=N` `?lots=L00,L02` `?skip=props,people,furnish,interiors,world` `?preserve` `?dpr=1` `?shadows=0` `?aa=0`.
Add more flags in `main.js` (A1) if you need them for your lab.

**Data first, meshes second.** `generatePlan`, `planBuilding`, `furnishBuilding` must be pure data (no DOM, no WebGL, no fetch; THREE math types are fine) so they run under Node:
`node --import ./la-ladera/tests/register.mjs your.test.mjs` with `import { buildData } from './headless.mjs'` gives you `{ ctx, plan, buildings }` with a real physics world. Reachability, overlap and clearance
tests live there. In Node, `ctx.assets.init(readAssetJson)` reads manifests from disk - so furnishing may only depend on **manifest metadata** (`size`, `footprint`, `tags`), never on GLB bytes.

## 5. Data contracts

### 5.1 Plan (A5 -> everyone)
```
plan = {
  seed, bounds:{min:-100,max:100},
  heightAt(x,z) -> y,          // THE outdoor ground: terrain + street profiles + lot platforms + plazas + stair ramps, continuous, deterministic; grid-sampled (<=0.5 m) so it is fast.
  lots:    Lot[],              // every enterable building
  streets: Street[],           // roads, streets, alleys, stairways, paths (centre-lines + widths)
  plazas:  [{ id, name, poly:[[x,z]...], y, kind:'plaza'|'court'|'yard'|'mirador' }],
  nav:     { nodes:[{id,x,y,z,kind}], edges:[[idA,idB]] },   // outdoor pedestrian graph (A4 walks NPCs on it); every edge must be free of walls and slope-walkable
  pois:    [{ id, kind, x,y,z, ry, name?, tags?:[] }],       // benches, shop fronts, door steps, vendor spots, viewpoints, stair tops, bus stop...
  landmarks:[{ id, name, en, x,z, kind }],                   // for the map + discoveries
  areas:   [{ id, name, poly }],                             // named zones (ambience, map labels)
  spawn:   { x, z, yaw },                                    // player start: low on the hill looking up at the barrio
}
Lot = { id:'L07', name, kind:(vocab LOT_KINDS), x, y, z, rotY, w, d, floors:1..6, fh:2.8,
        front:'S3' (street id), entrance:{ side:'front'|'left'|'right'|'back', u:0 (metres along that wall from its centre) }, extraEntrances?:[...],
        party:{ left, right, back } (true = shares a wall: no windows/doors on that side), shop?:(vocab SHOP_TYPES), roofAccess:bool,
        style:{ palette?:hex, roof?:'terrace'|'corrugated'|'tile'|'unfinished', balconies?:0..3, notes?:string }, seed:int }
Street = { id, name, kind:(vocab STREET_KINDS), width, pts:[[x,z]...] (centre-line), surface:'asphalt'|'concrete'|'cobble'|'dirt'|'stairs', sidewalk?:bool, lamps?:bool }
```
Hard requirements on the plan (tested in Node by A5): lots never overlap (>=0.3 m between footprints unless `party`), every lot's entrance has a walkable outside point connected to the street graph, road gradient <= 12 %, alleys <= 22 %, stairs ~55-65 %, nothing steeper than 0.9 anywhere walkable, ~42-50 lots, kind mix covering all of LOT_KINDS, >=12 shops across >=10 SHOP_TYPES, the spawn is walkable.

### 5.2 BuildingPlan (A2 -> A3, A4, A1, A5)
```
bp = { id (= lot.id), lot, frame:makeFrame(...), footprint:[[x,z]...] (world, CCW), bounds:{x0,x1,z0,z1,y0,y1} (world AABB),
  floors:[{ index, y (local floor top), h (clear ceiling height), rooms:[roomId...] }],
  rooms:[Room], doors:[Door], windows:[Window], stairs:[Stair], entrances:[Entrance],
  colliders:{ walls:[...], floors:[...] },   // world space, see 5.3. A3 APPENDS furniture blockers to colliders.walls
  anchors:[], furniture:[], lights:[],        // filled by A3 (also pushed to ctx.anchors / ctx.lights)
  roof:{ walkable:bool, poly:[[x,z]], y },    // terrace you can stand on
}
Room = { id:'L07.f1.r3', floor:int (0=ground), type:(vocab ROOM_TYPES), name?:'Sala',
  rect:{x0,z0,x1,z1},      // CLEAR INTERIOR rectangle in the building-local frame (inside faces of the walls) - place things directly, no wall maths
  y:local floor top, h:clear ceiling height, outdoor:bool (patio/terrace/balcony: no ceiling),
  doors:[doorId], windows:[windowId], openings:[{ side:'+x'|'-x'|'+z'|'-z', from, to }]  // wide arches without a leaf
  zone:'public'|'private'|'service', occupant?:'family'|'elder'|'young'|'shopkeeper',
  finish:{ floor, wall, wainscot?:{mat,h}, ceiling, baseboard, trim, floorTint?, wallTint? }  // matKeys; A3 fills in furnishBuilding, A2 reads it in buildBuilding (defaults if absent)
}
Door   = { id, kind:'exterior'|'interior'|'gate'|'shutter'|'arch', x,z,y (local, centre on the floor line), nx,nz (unit normal in local frame pointing from rooms[0] into rooms[1]),
           w:0.9, h:2.1, rooms:[roomIdOrNull, roomIdOrNull], hinge:'left'|'right', swing:0|1 (which side it opens into), mat }
Window = { id, room, x,z (local, on the wall line), y (sill height, local), w, h, nx,nz (unit normal pointing OUT of the room), kind:'casement'|'sliding'|'fixed'|'louvre', grille:bool }
Stair  = { id, floors:[i,j], from:[x,z] to:[x,z] (local, bottom -> top of the flight), width, steps, rise, run, hole:[[x,z]..] }
Entrance = { id, doorId, kind:'main'|'shop'|'alley'|'service'|'roof', outside:[x,y,z] (WORLD, ~1.2 m outside the door at walking height), inside:[x,y,z] (WORLD, ~1.0 m inside),
             yawIn (camera yaw that looks into the building), ry (facing of the door normal outward) }
```
* **Every building has >= 1 `Entrance`** whose door opens (E, or bump) - no locked doors. `rooms` tile each floor (no gaps) and every room is reachable from an Entrance by walking through
  doors/openings/stairs (A2 tests this with the physics kernel). `roof.walkable` buildings have a stair to the roof.
* Group names: **`${id}.ext`** = the whole architectural shell, outside AND inside surfaces (always drawn); **`${id}.int`** = furnishings, decor, clutter (A1 hides it beyond ~28 m).
  Put nothing else in other groups. A2 owns `.ext`; A3 owns `.int`. Dynamic things (door leaves, fans, TVs) are separate Object3Ds you add to `ctx.batch.object(id + '.ext'|'.int')`.

### 5.3 Colliders (everyone -> `ctx.physics`; plain data, WORLD space)
```
wall:  { x1,z1,x2,z2, t (half thickness), y0, y1, door?:doorId, id? }   // vertical slab on a segment. A character is blocked if [y0,y1] overlaps [feet+0.4, feet+1.7]
floor: { pts:[[x,z]...] (any simple polygon), y, a?, b?, px?, pz?, id? }  // walkable surface; height = y + a*(x-px) + b*(z-pz). Flat slab, or a ramp/stair flight (use floorRamp)
```
Helpers in `core/physics.js`: `wallsRect`, `floorRect`, `floorRamp`. The outdoor ground is `plan.heightAt`. Semantics worth knowing: a surface up to 0.5 m above the feet is stepped onto; a surface between 0.5 m and head height
blocks (retaining walls, low stair soffits = head bump); surfaces above the head are ceilings; terrain steeper than 0.9 cannot be climbed. A closed door is a wall with `door:id` (y0..2.1); opening removes it (`ctx.physics.setDoor(id, true)`).
**Furniture, railings, counters, tables, beds and every solid prop need a blocker wall** (use `wallsRect` for boxes); doorways and the paths between them must stay clear (>= 0.7 m).
**Stairs**: floor ramps for the flights, a slab with a matching hole, >= 2.0 m headroom along the whole flight (A2 tests by walking it).

### 5.4 Anchors (A3, A5, A2 -> A4)
`ctx.addAnchor({ kind, x,y,z (feet), ry, building?, room?, tags?:[], capacity?:1, seatH? })`. kinds (core/registries.js `ANCHOR_KINDS`): stand sit sleep cook counter customer tv sweep laundry chat lean bench read phone work pray play wash carry vend greet.
`sit` anchors give feet position where an NPC's hips sit on the seat (`seatH` = seat height). `counter` = shopkeeper stand behind a counter facing out. Every furnished room gets anchors that match its furniture.

### 5.5 Interactables, lights, discoveries, events
* `ctx.interact.register({ kind, x,y,z, radius:2.4, prompt:'Abrir puerta' | fn, use(ctx,it){}, enabled?(), aim?, ignoreDoor?:doorId, building? })` (see `core/interact.js`). Doors register one on each side or one at the door centre with `ignoreDoor`.
  Prompts are **Spanish** verbs: 'Abrir puerta', 'Cerrar puerta', 'Hablar con Doña Rosa', 'Sentarse'... Pressing E on a door toggles it with a 0.35 s swing; walking into a closed door never needs a click (bump-open is optional).
* `ctx.lights.add({ x,y,z, color, intensity, distance, kind:'ceiling'|'lamp'|'window'|'street'|'candle'|'tv', building?, room?, flicker? })` - the engine keeps a small pool of real lights on the nearest ones.
* `ctx.discover.register({ id, name:'Spanish name', en:'one English line', x,y,z, radius:3, kind })` - 3 to 6 per module (target >= 24 in the world): murals, shrines, views, hidden courtyards, odd rooms, a rooftop pigeon loft, a barber with a cat.
* Events (`ctx.events`): `player:enter/exit/floor`, `door:toggle`, `npc:talk`, `npc:line`, `discover`, `time:change`, `stage`.
* Time: `ctx.hour`, `ctx.setHour(h)`, `ctx.night` (0 day .. 1 night, engine-maintained). Window glow: use the emissive material `window_lit` (A2 declares it); the engine drives its intensity from `ctx.night`.
* UI helpers (engine): `ctx.ui.prompt(text)`, `ctx.ui.subtitle({who,es,en})`, `ctx.ui.toast(text)`. `ctx.player.lock('dialogue')/unlock('dialogue')` freezes movement + look (keyboard-driven dialogues; do not exit pointer lock).

### 5.6 ctx fields
`ctx.THREE ctx.opts ctx.config ctx.seed ctx.rng ctx.events ctx.physics ctx.mat(key) ctx.matlib ctx.batch ctx.assets ctx.interact ctx.lights ctx.discover ctx.anchors ctx.addAnchor ctx.addSystem(name, fn(dt,ctx), order) ctx.scene ctx.camera ctx.renderer ctx.player ctx.plan ctx.buildings ctx.people ctx.ui ctx.hour ctx.night ctx.quality ctx.errors ctx.yield()`.
Use `ctx.rng.fork('your:label')` for deterministic randomness; never `Math.random()` in generation.

## 6. Rendering conventions

* Static geometry goes through **`MeshBuilder`** (`core/mesh.js`): `ctx.batch.builder('<id>.ext')` -> `b.setBasePose(x,y,z,ry)`; `b.box(mats,cx,cy,cz,sx,sy,sz,{ry,skip,col})`, `b.quad`, `b.tri`, `b.cyl`, `b.slab(mats, outline, holes, y0, y1)`, `b.geometry(matKey, geo, matrix)`; `ctx.assets.place(b, 'assetName', matrix, {tints})`.
  `ctx.batch.flush(id)` turns each (group, material) into ONE mesh. Do not create one THREE.Mesh per object. Dynamic objects (doors, fans, screens, NPCs) are the exception - keep them few.
* **UVs are metres** (box-projected in the local frame, see `quad`) for tiling materials; a material's `tile` says how many metres one texture repeat covers. **Decal materials** (`uv:'unit'`: posters, signs, paintings, labels, murals) use explicit 0..1 UVs (`o.uv`).
* **Materials** are looked up by name: `ctx.mat('plaster_a')`, tinted `ctx.mat('plaster_a#d9a441')` (one neutral texture -> any paint colour). Declare every material you use in your module's `matdefs.js`
  (`{ color, rough, metal, tile, uv, tex, emissive, alpha, side, prio:1|2|3, desc }`; see `core/matlib.js`). `desc` is the plain-language brief for the texture generator: describe the REAL surface. A1 turns `desc`s into photographic textures.
  Unknown names render magenta and warn once - run the page and read the console.
* Vertex colours multiply the texture: use them for dirt/AO gradients (`cols` per corner on quads) and subtle per-building variation. All batched geometry has them.
* Winding/normals: `quad(a,b,c,d)` corners are counter-clockwise seen from the FRONT face. Outside faces visible, inside faces of walls visible from inside rooms.
* Shadows: static meshes cast + receive by default; the engine decides per group. Keep tiny decor off the shadow pass by putting it in a group with `{cast:false}` (`ctx.batch.group(id,{cast:false})`).
* GLB assets from Blender (see 7): `ctx.assets.place(builder, name, matrix, o)` bakes them into the batch so a hundred sofas still cost one draw call per material.

## 7. Tools and recipes

* **Blender 5.2.1**: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python tools/blender/<script>.py -- <args>` (run from the repo root; scripts live under `la-ladera/tools/blender/`).
  Python in Blender has numpy; no PIL (system Python 3.13 with PIL 12 + numpy 2 is available for image work: run it with `python -I script.py`).
  Export GLB with `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', export_apply=True, export_yup=True, export_image_format='NONE', export_materials='EXPORT', use_selection=...)`.
  **No textures inside GLBs.** Name each material after a library material (`wood_pine`, `fabric_sofa_a`...); the page maps by name. Unit = metre, origin at the object's floor/back-centre as documented in the manifest.
  UVs: box-projected, 1 uv unit = 1 m, for tiling materials; 0..1 for decal materials. Keep every asset <= 3k triangles unless it is a hero piece; whole GLB sets <= the budget in 8. Quantize/Draco (`export_draco_mesh_compression_enable`) is allowed (decoder is vendored).
* **Manifests** (`assets/models/manifest.json` lists the set manifests): `{"files":[{"glb":"furniture/set_a.glb","assets":{"bed_double":{"node":"bed_double","size":[1.6,0.55,2.05],"origin":"floor-centre","tags":["bed"],"footprint":[1.6,2.05],"clear":[0.6,0.0,0.6,0.6]}}}]}`.
  Every asset needs `size` (metres, bounding box) so planning works in Node without the GLB. Each agent edits only its own `manifest.<set>.json`; the lead registers the set in `manifest.json` (it already lists `manifest.arch.json manifest.furniture.json manifest.people.json manifest.world.json`).
* **Textures via Codex** (A1 only runs it): `deltic timeout 900 --stdin <prompt.txt> codex exec -C <worktree> -m gpt-6-luna -c model_reasoning_effort=max -c approval_policy=never -s workspace-write --ephemeral --skip-git-repo-check --json -o <final.txt> > <events.jsonl> 2> <stderr.txt>`.
  Prompt = "Use your built-in image generation tool to create ... then copy the resulting file to <relative path>". Measured: ~1 minute per image, 1254x1254 PNG ~3.5 MB, photographic quality (see `.scratch/pilot/plaster_ochre.png`); the
  original lands in `C:\Users\ano\.codex\generated_images\<thread>\*.png`. Run <= 3 in parallel. Ask for several swatches per run when sensible. Post-process in Python: crop, make seamless (offset-blend), downscale (1024 or 512), JPEG q86, optional normal/roughness maps, write `assets/textures/manifest.json`
  (`{"textures":{"plaster_a":{"map":"plaster_a.jpg","normal":"plaster_a_n.jpg"}}}`). Budget in 8.
* **Headless Chrome harness** (zero deps; uses the real GPU on this machine):
  `node la-ladera/tests/shot.mjs --q "autostart&manual" --eval "__ladera.teleport(0,30,{yaw:0}); __ladera.step(3)" --out .scratch/a2/a.jpg` then LOOK at the jpg with the Read tool.
  Several shots in one boot: `--steps steps.json` (`[{"eval":"...","out":"x.jpg"}]`). For scripted sessions `import { launch } from './chrome.mjs'` (see header comment; `p.eval`, `p.canvasShot`, `p.pageShot`, `p.summary()`).
  Always close the browser (`b.close()`); never kill chrome.exe by name (the user's own Chrome is running).
* **Debug API** `window.__ladera` (engine agent keeps it stable; extend freely): `state() teleport(x,z,{floor|y,yaw,pitch}) look(yaw,pitch) lookAt(x,y,z) step(n,dt) walk(f,s,secs,{sprint,jump,crouch}) use() render() shot({w,h}) setHour(h) buildings() enter(id) npcs() anchors() discoveries() errors()`.
  With `?manual` nothing moves unless you call step/walk, so screenshots are deterministic.
* Node tests: `node --test la-ladera/tests/physics.test.mjs`; data layers: `node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/<x>.test.mjs`. Make every new test fail once (break the input) before trusting it.
* Lint for materials: every `ctx.mat('x')` name must be declared in some `matdefs.js` (A1 provides `tools/textures/lint-mats.mjs`).

## 8. Budgets (the rubric measures these)

* Draw calls <= 1,800 per frame (shadow pass included) and <= 2.5 M triangles at every benchmark viewpoint (`__ladera.state()`); boot to playable <= 25 s on this machine, no main-thread stall > 200 ms after start.
* Payload of `la-ladera/`: textures <= 24 MB, models <= 32 MB (people <= 14, furniture <= 10, world <= 6, arch <= 2), no file > 8 MB, total (excluding `vendor/` and `dev/`) <= 60 MB. Be thrifty: tint instead of duplicating textures; share materials.
* Memory: GPU textures <= ~220 MB (1024 px for hero materials only, 512 for the rest, 256 for small props).
* No console errors or warnings in a 5-minute scripted walk; no 404s; no NaNs; no player stuck spots (reachability + stuck-probe tests).
* Spanish: native-sounding, regionally consistent (Colombian-flavoured: "a la orden", "con gusto", "mijo/mija", "pues", "vecino", "regalame", "tinto", "ahorita"), correct accents and punctuation, never machine-translated feel.

## 9. How to test your own work

1. Unit/data tests in Node (fast, run them constantly).
2. Screenshots through the harness, from several viewpoints and at human eye height (1.64 m). Compare against the world bible. Look at corners, stairs, thresholds, ceilings, the underside of balconies, back alleys. Hunt z-fighting, gaps, light leaks, floating objects, clipping, flipped normals, texture stretching.
3. Walk it: `__ladera.walk(1,0,4)` etc. and assert no `blocked` where you expect free movement and no passing through walls.
4. When your piece works alone, load the full page and check it did not break anyone else (`state().errors`, console).

## 10. Almanac / HUD constraints

* The shared "<- Almanac" pill is pinned at the top-left (109 x 41 px at 0,0). **Nothing interactive may sit under it**: keep every button/link at x >= 112 px or y >= 48 px, at every width. HUD goes bottom/centre/right.
* No horizontal page scroll at 390 x 844 and 768 x 1024 (`tests/responsive.test.mjs` loads this page): the title overlay and loading screen must lay out on phones; the canvas is fixed full-viewport.
* The page must survive WebGL being unavailable (friendly message, no uncaught exception).

## 11. Final report format (<= 300 words, to the lead)

`DONE/PARTIAL`, what exists (files + 1 line each), how to run/test it (exact commands), measured results (numbers, screenshot paths), known gaps/risks, requests for other agents. Report only what you observed.

## Amendments (lead-maintained; re-read before each major step)

* **Labs**: each agent may create `labs/<id>/**` (e.g. `labs/a3/furniture.html`, `labs/a4/people.html`) for standalone test pages and scripts. A lab page loads the real modules through the same importmap
  (copy the `<script type="importmap">` block from `index.html`; paths are relative to `la-ladera/`). Labs are dev-only: the lead deletes `labs/` before release, so nothing shipped may depend on them.
* **Ground under and around buildings (A5 <-> A2)**: `plan.heightAt(x,z)` inside any lot footprint (plus 0.3 m margin) returns `lot.y - 0.30` (a plinth), so the ground-floor slab (A2, top surface at `lot.y`) is always above terrain.
  A5 shapes the street/pad profile so `heightAt` at each `entrance.outside` is within +-0.35 m of `lot.y` (curb, ramp or a stair in the street profile); A2 adds a threshold step/ramp of up to 0.3 m if needed.
  A2 extends exterior walls down to `min(heightAt sampled around the footprint) - 0.2` so a building on a slope never floats (foundation wall, plain concrete/stone), and A5 builds retaining walls where a pad is cut into the slope.
* **Reference implementation**: `glasgow-subway/` (same repo) is a prior multi-agent Three.js build. Worth reading: `SPEC.md`, `NOTES-A*.md`, `js/sim/walker.js`, `js/sim/people.js`, `js/explorer/rig.js`, `tools/assets_people*.py`,
  `models/people.glb` + `people_meta.json` (rigged people from Blender, shared clips). Copy ideas and code freely (not files that are not yours: copy into your own area).

