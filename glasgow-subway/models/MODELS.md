# models/ - Glasgow Subway 3D assets (A3)

> **SIGNALS (REVISION 6)**: `signal.glb` (post-mounted, 1.8 m), `signal_wall.glb` (tunnel-wall bracket) - root node `signal` (origin = foot of post / wall plate), `signal_housing`, lens meshes **`lamp_red`** and **`lamp_green`** (each with its OWN emissive material `lens_red` / `lens_green`: set `material.emissiveIntensity = 0` for OFF, ~4 for ON), empties `lamp_red_anchor`/`lamp_green_anchor` (point-light spots). Lenses face glTF +Z (towards trains travelling -Z); rotate 180 deg about Y for the other direction. `signal_boards.glb`: `board_trainstop`, `board_station_stop` ("STOP HERE"), `board_speed` (25 km/h ring; replace the map for other numbers), `plate_datum` (wall RFID/chainage plate) - all at the origin, post-mounted except the plate, front face toward +Z. Research says CBTC needs no lineside signals and a small green lamp at tunnel mouths is only a harmless cue.
> **PEOPLE (REVISION 7)** `people.glb` (3.6 MB) + `people_meta.json`: 21 smooth, textured, rigged people (3.4-4.3k tris each), ONE 1024 atlas material `people_atlas` (faces with eyes/brows/nose/mouth, swatches). Variants: man_commuter, man_hoodie, man_longcoat, man_elder, man_puffer, man_beard, staff_hivis, man_student, woman_coat, woman_puffer, woman_dress, woman_elder, woman_student, woman_scarf, woman_bob, teen_boy, teen_girl, boy, boy_small, girl, girl_small. Nodes: armature root `person_<id>` + `person_<id>_mesh`; origin exactly at the soles, faces glTF -Z. REPLACES revision 6: old `person_0..`, `person_man_*` ids with per-person clips `<id>__walk` etc. are GONE.
> True heights (m): adults 1.54-1.78 (tallest man_student 1.779, all <= 1.80), teens 1.56-1.66, boys 1.36/1.19, girls 1.28/1.10. Headroom rule: train interior is 1.88 m at the centreline and 1.68 m above bench fronts, so every standing adult fits; do not scale people up. Per-person heightM, shoulderWidthM, eyeHeightM, seatRootDropM, seatedEyeHeightM, seatedHeadTopM, hipHeightM, walkSpeedMps (walk) / walkFastSpeedMps, tris and clips[] are in `people_meta.json`.
> Rig: 21 bones, identical names AND rest orientations in every person, so ONE set of rotation-only clips (24 fps, glTF animations named plainly, NOT per-person) drives everybody. Loops: idle_a, idle_b, walk, walk_fast, walk_bag, walk_step, phone_stand, phone_call, talk, wave, point, sit_idle, sit_phone, sit_look, sit_cross_legs, stand_hold_pole, stand_hold_rail, kid_bounce, kid_fidget. One-shots: turn_left, turn_right. No root drift: move the root yourself (walk ~1.4 m/s, walk_fast ~2.25 m/s; per-person values in meta). Seated clips do not move the hips: put the root on the floor in front of the seat and lower it by `seatRootDropM` (seat top 0.445 m above the floor, hip 0.53).
> REQUIRED for clones: GLTFLoader renames duplicate nodes (hips, hips_1 ...) and the clips target ONE person's bones (e.g. `hips_5.position`). After `SkeletonUtils.clone` do `c.traverse(o => { if (o.isBone) o.name = o.name.replace(/_\d+$/, ''); })` and retarget a clip copy: `const ac = clip.clone(); ac.tracks.forEach(k => k.name = k.name.replace(/_\d+\./, '.'));`. See `tools/assets_people_preview.html` (params clip, t, per, rot, cam, look, fov).
> **PEOPLE REVISION 9 (MPFB2 / MakeHuman bodies; supersedes revisions 7-8 for people.glb, people_lod.glb, people_meta.json)**: realistic people generated headlessly with MPFB2 2.0.18 (Blender extension, GPL code; MakeHuman targets/assets CC0 + some CC-BY, see `models/CREDITS.md`). `people.glb` (about 12 MB, 30 people, ~9.5k tris each) and `people_lod.glb` (LOD1, ~2.6k tris, 256 px textures, use beyond ~12 m). Same 30 ids, outfits and `people_meta.json` schema as before (+ `source: "mpfb2"`, `rig: "game_engine"`, `restOrientationSpreadDeg` = 0). Nodes: armature root `person_<id>` (origin at the soles, faces glTF -Z) + `person_<id>_mesh` (one skinned mesh, several primitives/materials: skin, eyes, brows/lashes, hair, garments).
> **RIG CHANGED (A5 must update the bone names)**: MPFB `game_engine` skeleton, 53 bones: Root, pelvis, spine_01..03, neck_01, head, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, {thumb,index,middle,ring,pinky}_01..03_l/r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r. Old -> new: hips=pelvis, spine/chest=spine_01..03, neck=neck_01, forearm=lowerarm, shin=calf. Clip NAMES are unchanged (idle_a idle_b walk walk_fast walk_bag walk_step phone_stand phone_call talk wave point sit_idle sit_phone sit_look sit_cross_legs stand_hold_pole stand_hold_rail turn_left turn_right kid_bounce kid_fidget; turn_* one-shot, rest loops), 24 fps, ROTATION-ONLY tracks, authored once; every person has identical bone rest orientations (verified), so any clip plays on any person. Binding recipe: after `SkeletonUtils.clone`, GLTFLoader names bones `pelvis`, `pelvis_1`, ...: strip a trailing `_<n>` ONLY when the stripped name is one of the 53 bone names (note `spine_01` is a real name, `index_01_l` too: do not strip blindly) on bones AND on the clip track names (`<bone>_<n>.quaternion`) - see `tools/assets_people_preview.html` (`unsuf`). Seat rule unchanged (`seatRootDropM`, seat top 0.445 m); no hips translation in clips, no root drift.
> Heights true to scale (max 1.80 m, children 1.12-1.38 m). Materials are standard glTF PBR (JPEG/PNG textures embedded, hair/brows/lashes alphaMode MASK), KHR_mesh_quantization. Own tartan kilts / pleated school skirt / hose / sporran / belt / sash / tartan trews are skinned to pelvis+thighs (swing with the legs). Known gaps: bodies are clothed MakeHuman meshes (not hand-sculpted); LOD1 is decimated (faces get ~1.5k tris); skirts and kilts lift with the thighs when seated; cloth fit uses MPFB's proxy fitting (minor poke-through at extreme poses); eyes use a simplified eyeball; no facial expressions.
> **(OLD, superseded by REVISION 9) PEOPLE REVISION 8 (realism pass; supersedes the sizes/materials of revision 7 below)**: `people.glb` (14.2 MB, 30 people, ~8k tris each, LOD0) and `people_lod.glb` (5.0 MB, 30 people, ~2.2k tris, 512 px pages, use beyond ~12 m). Same node names (`person_<id>`, `person_<id>_mesh`), same 21-bone rig, same shared clips and `people_meta.json` schema as revision 7 (meta now describes the LOD0 file; `lod` block describes the LOD1 file). Built only with Blender/bpy + numpy/PIL (`tools/assets_people.py`, `tools/assets_people_tex.py`; Cycles previews: `tools/assets_people_render.py <glb> <outdir> [--lineup] [ids]`).
> What changed: (1) sculpted head: analytic face displacement (brow ridge, eye sockets, cheekbones, lips, chin), modelled nose with alae, ears, eyeballs (iris/limbal ring texture) with upper/lower lids carrying painted lashes, brows, lips, stubble/beard, freckles; (2) PBR: ONE 2048 px page set (albedo / normal / ORM = roughness+metal) of 256 px cells: 30 face tiles, 12 iris tiles, 20 seamless fabric/skin tiles (denim twill, cotton, suit wool, melton, wool knit stitches, jersey, quilted nylon puffer, leather, rubber, mesh, ripstop, reflective prisms, metal, plastic, hair strands, 4 tartan twills at thread level); fabric cells are grey and tinted by per-vertex COLOR_0 (garment colour x baked ambient occlusion from BVH ray casting) so any colour works; (3) hair = skull cap with per-angle hairline + SOLID smooth-shaded hair volumes (bob / long mantles with clump relief and uneven rounded ends, fringes, tapered ponytail tubes, buns, curls) textured with the strand tile (no alpha cards in use; `people_hair` material kept but unused); (4) garments with thickness (separate shells, collars, lapels, belts, buttons, laces), fold displacement at elbows / knees / waist / ankles, kilts with real pleat geometry.
> Files use KHR_mesh_quantization (NORMAL int8, TEXCOORD_0 u16, COLOR_0 u8, WEIGHTS_0 u8; stock three.js GLTFLoader handles it) and two materials: `people_pbr` (opaque, uses vertex colours: leave `material.vertexColors` as the loader set it) and `people_hair` (alpha mask). Do NOT swap the materials for flat ones. Clip retargeting / seat rule / bone-suffix strip are unchanged from revision 7. Heights: max 1.779 m (cap 1.80). Honest gaps: bodies are still low-poly lofts (no subdivision-level sculpt), faces are stylised mannequin-grade at close range, hair is a shell + cards (no strand sim), folds are static displacement, LOD1 is decimated (small colour artefacts; its ponytail hair and its eyebrows were repaired afterwards - see "LOD hair and eyebrows" below), sit clips lift skirt/kilt hems with the thighs.
> **PEOPLE REVISION 7 ADDENDUM (skirts, kilts, Highland dress; LOD1)**: `people.glb` now has 30 people (6.2 MB) and `people_lod.glb` (3.7 MB, ~2.2k tris each, 512 px atlas, same node names / rig / clip names; use it beyond ~12 m). New ids: `man_highland` (Prince Charlie jacket, waistcoat, kilt, sporran, hose + flashes, ghillie brogues, Glengarry), `man_kilt_casual` (grey/black kilt, jumper, boots), `man_trews` (tartan trews, Argyll jacket, tam o'shanter), `woman_sash` (long dress + tartan sash), `girl_school_kilt`, `boy_kilt` (tam), `woman_mini` (miniskirt, tights, boots), `woman_midi` (pleated midi, tights, boots), `teen_skirt` (pleated school skirt). `people_meta.json` has `outfit` per person (trousers|leggings|shorts|dress|kilt|highland|highland_trews|highland_dress|school_kilt|skirt_short|skirt_midi|skirt_pleated) and a top-level `lod` block. Skirt/kilt = separate part skinned to hips/spine/thighs (swings with the legs, thigh weight up to 0.9 at the hem); procedural tartans (generic setts, no clan names) in the atlas. Suggested crowd mix: ~12% skirts, ~8% kilt/Highland. Known limits: sit clips lift skirt hems with the thighs (they drape over the thighs, not the bench), LOD1 can show small colour/UV artefacts, and the bodies are still low-poly stylised (no hair cards / PBR skin maps yet).


All files are glTF 2.0 binary, built headless in Blender (bpy) by `tools/assets_*.py` (rebuild all: `<venv>/bin/python tools/assets_build.py`).
Units: metres. glTF/three.js axes: +Y up, **nose / direction of travel = -Z** (Blender +Y). +X = right of the direction of travel.
Origin of track models: on the track centre-line **at rail-head level** (y=0 = top of running rails), x=0 between the rails.
Materials use PBR names (`subway_orange`, `glass_window`, `tile_cream`, ...), all double-sided; glass uses alpha BLEND. Procedural 128px greyscale
detail textures (tile/concrete/flags/brick/tactile) are embedded in the GLBs (UV = 1 unit per metre, repeating).
three.js note: multi-material meshes load as a Group named after the node with child meshes (`name`, `name_1`, ...); animate the **top-level named node**.
Dev preview: `tools/assets_preview.html?f=train.glb&cam=x,y,z&look=x,y,z&only=prefix&hide=prefix&rep=N,dz` (serve repo root over http).

Real-world basis (estimates marked ~): track gauge 4 ft (1220 mm); inner tunnel bore 3.35 m (nominal 11 ft); stock is small. The Stadler unit here is modelled
as a **2-car, ~27.8 m, 2.30 m wide, 2.72 m high (rail head to roof; +0.06 roof pods)** train (~ estimates; real cars are driverless, the cab is a notional driving cab).
Floor height 0.695 m above rail head; platform top 0.695 m; platform edge gap ~0.10 m. Fit check: train max roof corner clears the 3.35 m bore (axis at +1.20 m).
Power: two conductor rails at x=+-0.92 m (top height +0.12 m) with bogie collector shoes (~ stylised; exact Subway arrangement not verified).

## train.glb  (~2.2 MB, ~31.8k tris)   train_lod.glb (~105 KB, ~1.5k tris)
**REVISION 5 (livery from the in-service photos; node names, door pivots, walkable JSON and dimensions are unchanged - see `tools/assets_train.py`)**: body white, ONE continuous black window ribbon (the pillars between windows are black, not white; glazing is the dark tint `glass_tint`),
the orange is the door LEAVES only (the old broad orange bands on the roof/shoulders are gone). Doors are tall: the opening and the leaf run from the floor up into the roof arch to 64 deg (inner face 1.78 m above the floor, 0.24 m above the window head at 45 deg) and the leaf face sits 42 mm behind the body skin
(black reveals + a 30 mm black seal outline round each opening). Cross-section is unchanged (research/train-dimensions.md pins it: vertical sides to y=1.487, then one R=1.155 arch).
New nodes **`car_N_bellows`** (smooth shaded, one per car, N=0..3): the outer dark sleeve (`bellows_dark`) over each 0.17 m gap on the body outline (each car builds its half, they meet in the middle of the gap; pleats stand at most 12 mm proud, max width stays 2.334 m) and the grey (`bellows_grey`) concertina lining of each gangway
aperture (6 rounded folds per passage, floor to roof and over the top; ridges 30 mm into the 1.3 m opening). Gangway poles run floor to ceiling; the SOS box moved from inside the aperture onto the bulkhead. Route diagrams (`route_map_panel`) sit above the windows of each long bay (they used to be placed at the wrong world y). The cab doors keep the old 45 deg head.
Root `train` (identity). Unit centred at origin, length ~27.9 m (z in [-13.92, +13.92]). Car 0 = front (z<0, cab at -Z end), car 1 = rear (cab at +Z end).
| node | notes |
|---|---|
| `car_0`, `car_1` | groups at origin (children use world-unit coordinates) |
| `car_N_exterior` | orange livery shell, roof, roundels, headlights/taillights (emissive materials `headlight`, `taillight`) |
| `car_N_glass` | window glass (alpha) |
| `car_N_saloon` | interior: floor, lining, longitudinal seats, grab poles, strip lights (emissive `strip_light`), ads panels |
| `car_N_cab` | driving cab interior: desk, master controller, brake handle, door buttons, e-stop, driver seat |
| `car_N_bogie_a/_b` | bogies+wheels+shoes; origin on rail head at bogie centre (wheel axis = X; wheel radius 0.30 -> rotate about X to spin) |
| `cab_screen`, `cab_speedo` (rear: `cab_screen_rear`, `cab_speedo_rear`) | quads with material `screen_blank`, **UV (0,0)-(1,1) across the quad, bottom-left = (0,0)** (glTF convention: with `CanvasTexture` set `flipY=false`). Replace the material map at runtime. 0.40x0.25 m and 0.18x0.12 m |
| `door_L_0..7`, `door_R_0..7` | **door leaves**, separately animatable. Numbered from the front (nose) to rear; L = left (-X), R = right (+X). Pairs: (0,1),(2,3),(4,5),(6,7) are the two leaves of one opening (1.3 m wide). **Even index = front half of the opening: open by translating along world Z by -0.65 m (towards nose); odd index: +0.65 m (toward rear).** Leaf origin = leaf centre at closed position (x=+-1.14, y=1.45); leaf 0.64 m wide, 1.30 m tall x 0.05 thick. Scale slide with ease. (Leaves slide behind the fixed wall panels.) |
| `cab_door_L`, `cab_door_R` | **empties at hinge** (front edge) of the cab side doors of the front cab, child `*_mesh`. Open by rotating about local Y by ~95 deg (swing outward; hinge at the front edge, door extends 0.9 m rearwards; try sign per side). Rear cab: `cab_door_L_rear` (at +X!) / `cab_door_R_rear` (at -X) |
| `cab_eye` | driver eye position (front cab, seated, centred): (0, 1.98, -12.15). `cab_eye_rear` for the rear cab |
| `couple_front` / `couple_rear` | empties on the centre-line at coupler height (y=0.62) (z=-13.82 / +13.82) |
| `headlight_L/_R` | empties at the front lamps (x=+-0.62, y=0.98, z=-13.72), `taillight_L/_R` at the rear end (z=+13.72; for the rear car L is +X); place point/spot lights there |
| `interior_light_0..9` | empties on the saloon ceiling (y=2.55), 5 per car, for runtime point lights; `cab_light`, `cab_light_rear` |
LOD (`train_lod.glb`): same root/origin, nodes `car_0_body`, `car_0_bogies`, `car_1_body`, `car_1_bogies` + `couple_*`, `headlight_L/R`. Use beyond ~40 m.
Seat count ~ 2 x 3 bays x 2 sides; standing room between. Walk-through gangway between the cars (bellows, 0.2 m gap).

## tunnel_segment.glb  (~330 KB)
Root `tunnel_segment_root`. One **ring = 0.61 m long** (z in [-0.305, +0.305]), tileable end-to-end along Z (step 0.61 m). Bore inner radius 1.675 m (3.35 m dia),
axis at y=+1.20 m; flat concrete track slab top at y=-0.18 m (lining intersects at x=+-0.95). Includes rails (head width 70 mm, running faces at x=+-0.610 -> 1220 mm gauge),
baseplates, conductor rails (x=+-0.92), left-wall cable tray with cables (y~1.05), right-wall pipe (y=0.95) and small cable tray (y~1.85).
All four variants **share the same space - pick one by name and clone/instance it**: `seg_plain` (concrete segmental lining, ribs), `seg_lamp` (same + wall lamp at x=+1.45, y=2.15),
`seg_iron` (cast-iron look, river crossings), `seg_iron_lamp`. Empty `light_anchor` (1.40, 2.1, 0) for a runtime point light. Suggested: instance `seg_plain`, every 8th ring `seg_lamp`.
~330 tris per ring (use InstancedMesh).

## tunnel_station_vault.glb  (~330 KB)
Root `station_vault_root`; every section is **1.2 m long** (z in [-0.6, 0.6]), tileable. Origin on the station centre-line at rail-head level.
Variants (same space, pick one): `vault_island` / `vault_island_rib` (island platform: vault half-width 5.25 m, crown 5.0 m above rail; island platform 4.0 m wide x=[-2,2], top 0.80 m,
white edge strip + yellow tactile strip; track centres x=+-3.25), `vault_side` / `vault_side_rib` (two side platforms: half-width 5.9 m, track centres x=+-1.95, platforms x in [3.25,5.9]),
`vault_island_end`, `vault_side_end` (end caps: wall in the plane z=0 with 3.35 m bore openings and 0.3 m lining stub; the 1.2 m stub/floor extends toward -Z; rotate 180 deg about Y for the other end).
Walls cream tile with orange + brown band, ceiling panel cream; emissive light fittings at x=+-1.6. `_rib` variants have a cast-iron arch rib (use every ~6th section).

## station_kit.glb  (~470 KB)
Root `station_kit`; **all items sit at the origin of the file (identity)** - clone by name and place. **Signs and screens: the front face looks toward glTF -Z** (a viewer at -Z reads text correctly; verified with a canvas texture, flipY=false). Rotate the clone 180 deg about Y to face +Z. Double-sided boards (`sign_name_hanging`, `info_totem`, `sign_direction_hanging`) read correctly from both sides.
Origin = centre of footprint on the floor unless noted.
- Platform: `bench_platform` (2.0 m), `bin_litter`, `pillar_round` (r0.28, h4.6), `pillar_square`, `lamp_platform_strip` (origin=top hang point), `cctv_camera`, `clock_platform`,
  `info_screen` (1.0x0.3, screen quad UV 0..1, material `screen_blank`), `sign_name_hanging` (3.0x0.55 blade, origin = hang point, **two faces with material `sign_blank` and UV 0..1** for runtime station-name canvas),
  `sign_name_wall` (3.0x0.6 + roundel), `roundel_wall`, `platform_end_ramp` (4.0 m wide, slopes to track bed over 3.2 m, origin at top edge centre), `decal_mind_gap_floor`.
- Safety signs (0.45x0.30, flat colour faces, no text; paint over runtime): `safety_exit`, `safety_no_smoking`, `safety_mind_gap`, `safety_danger_electric`, `safety_emergency_stop`, `safety_help_point`, `safety_cctv`, `safety_first_aid`, `safety_way_out`, `safety_stand_back`.
- Trackside: `signal_head` (post, 3 lamps), `buffer_stop`, `sign_speed`, `sign_chainage`, `emergency_phone`.
- Vertical: `stairs_flight` (rise 2.4 m, 14 steps, 2.0 m wide, 3.92 m run, origin bottom centre, ascends toward Blender +Y = glTF -Z), `escalator_4m` group: `escalator_static` + `esc_step_00..esc_step_NN` (30 deg, rise 4.0 m, run 6.93 m, ascends toward -Z;
  **animate each step by translating along the incline vector (0, +0.234, -0.405) x t (t in steps, wrap modulo N steps, ping step positions)**; step pitch 0.405 m horizontal).
- Concourse: `concourse_floor_2m`, `concourse_floor_plain_2m`, `concourse_wall_2m` (3.2 m high, front face toward -Z), `concourse_ceiling_2m`, `light_panel`, `pillar_square`, `arch_portal` (3.0 m opening), `fare_gate` (pair, 0.9 m passage), `ticket_machine` (screen quad UV 0..1), `info_totem` (2 blank faces),
  `ticket_counter`, `sign_direction_hanging`, `sign_map_frame`, `shutter_2m`.

## entrance_kiosk.glb  (~120 KB)
Root `entrance_kiosk`. Origin at centre of an 8x6 m pavement slab (top at y=0). Orange glazed shelter 5x3 m (top 3.3 m), roundel pylon (4.5 m, `pylon_roundel`, blank name plate), fascia sign `sign_fascia` (blank quad UV 0..1),
stairwell `stair_well` descends 2.4 m toward -Z (empties `stair_top` (0,0,0), `stair_bottom` (0,-2.4,-4.52)); shelter sits at +Z (centre z=+1), roundel pylon at (3.3, z=-1.2). Empty `light_anchor` (0,2.8,1).

## portal_depot.glb  (~290 KB)
Root `portal_depot`. Origin `portal_mouth` = tunnel portal centre on rail head, tracks run along -Z out of the tunnel (tunnel stub extends +Z 12 m into the hill). The ramp rises 2.6 m over 40 m
(`portal_cutting`: retaining walls tapering, brick portal face; `portal_track`), then `depot_yard` (asphalt), shed `depot_walls`/`depot_roof` (60x20 m, brick + metal roof, two doors, `depot_tracks` inside), `depot_details`. Empties `depot_entry_L/R`.
(Broomloan depot layout is schematic.)

## people.glb  (3.6 MB)
See the PEOPLE (REVISION 7) note at the top of this file; the older description was removed.

### Skin under garments  (people.glb and people_lod.glb, `tools/people_skinfit.py`)
`tools/assets_people_mpfb.py` decimates every garment hard (a T-shirt ends up ~340 triangles, the body ~4400) and masks the body away under the clothes, but a mask stops at the
garment's border, so strips of body skin (shoulders, armpits, upper back, waist; calves and knees under a kilt's hose) are left lying just beneath a shirt that cannot follow their
curve. They showed through as skin-coloured slits and patches - "holes in the grey T-shirt" (`teen_boy`), a sweater's chest and sleeves (`man_student`), bare calves under a kilt.

**The repair** is run on the two GLBs *after* the pipeline: `python3 tools/people_skinfit.py --write`. It moves the offending skin vertices inwards along the garment's normal
(rest pose, numpy only) until every sampled point of the triangle is 4 mm under it; vertices that cannot move (head, neck, hands, anything near a hem, anything with other bone weights
than the garment - a forearm swinging past a shirt is bare skin) stay put, and footwear is not treated as a garment. Only POSITION data of the skin primitives changes: bones,
weights, UVs, normals, the other primitives and the file layout are byte-identical, and each repaired person carries `extras.skinfit` on its mesh node (a second run leaves it alone;
`--check` lists the ones not done yet and exits 1). It is listed person by person in `RECIPE` in that file, with how hard to push (3 cm for kilts and the sweater, 1.5 cm for tees,
trousers and the midi dress), because a repair applied everywhere made some people worse (a hoodie's cuffs grew slivers, a jacket's armpit opened up) - those stay as exported.
Re-run it, and re-measure, whenever the pipeline regenerates the people. **A fresh export that skips this step fails `js/sim/sim.test.mjs`.**

**Measuring** is done two independent ways, because a repair must not be marked by its own ruler:
- `js/sim/skincheck.mjs` (used by the unit test): plain Node, rest pose, ten samples per body triangle, counts those outside a garment (not near a hem, bone weights overlapping, not
  covered by anything else along the normal). `sim.test.mjs` holds a budget per person and file, and requires the eight repaired people to have shed at least 40% (main) / 30% (LOD).
- `node tools/people_holes.mjs [--glb F] [--lod-glb F] [--lod] [--only a,b] [--json out]` (needs Playwright): what the player sees. It builds the people with the game's own `AnimCrowd`
  (`tools/people_view.html`, so the runtime fits in `js/sim/bodyfit.js` and the pose are in), renders skin-only and garment-only depth from eight azimuths in stand and two walk phases
  (the clip variant is seeded per person and state, so two models are compared pose for pose), and sums the area where skin is nearer than the garment by under 3 cm.

Result, mean hole area in cm² per view over those poses (committed tool, original export -> repaired; the sum over all 30 people): full models 887 -> 350 (-61%), LOD models
693 -> 293 (-58%). The eight repaired people: `man_student` 382 -> 158, `man_kilt_casual` 220 -> 78, `boy_kilt` 119 -> 36, `girl_school_kilt` 96 -> 20, `woman_midi` 14.4 -> 11.2, `man_commuter` 6.1 -> 0.9,
`man_trews` 3.1 -> 1.3, `teen_boy` 3.8 -> 1.9 (LOD 8.3 -> 1.2). Nobody got worse in any measured pose. (The repair tool's own before/after counts are not comparable - it samples
more densely after the repair - so judge by the two rulers above.)

**What is not fixed** (do not mistake these for regressions): `man_student`'s left upper arm still shows through the sweater sleeve (tucking is capped at 4.5 cm); small knee specks remain
under the kilts; people outside the recipe keep the few cm² they were exported with (a tee-sized speck at a distance); in the LOD models `woman_mini` has a gap between the crop top and the
skirt at the lower back (35 cm² per view, constant across poses - the LOD top is shorter than the full one), and `girl_small`, `teen_skirt`, `man_puffer`, `woman_coat` show 10-16 cm² - a
rest-pose tuck does not move these (tried at 1.5 cm). They need the garment itself re-meshed (Blender, which is not part of this toolchain). Only stand and walk are measured: the sit
pose is excluded (a hand resting on a lap is legitimately skin in front of cloth) and so are the phone and talk poses.

### LOD hair and eyebrows  (people_lod.glb, `tools/people_lodhair.py`, measured by `tools/people_hair.mjs`)
**What was wrong.** The LOD export decimates every part of every person, and two things did not survive it. They were found on a contact sheet of the people as the game draws them
(`tools/people_view.html`); none of the skin or motion measures can see them. (1) The `ponytail01` hair (`girl`, `girl_school_kilt`, `teen_girl`, `woman_puffer`) is a thin *open* shell;
the decimator collapsed it to a few big wedge-shaped triangles (815-1032 -> 367-418), so the cap over the scalp was gone and the LOD person was a bald head with a ponytail hanging off
the back of it. The LOD models are what the crowd shows beyond ~11 m and for everyone but the nearest few. (2) Everybody's eyebrows (124 vertices, 192 triangles in the full file) were
cut to 56-70 triangles and became heavy dark wedges on the eyes.

**The repair**, run on the LOD file *after* the pipeline (and independent of `people_skinfit.py`, which touches other primitives): `python3 tools/people_lodhair.py --write`. For the four
ponytail people's hair and for everybody's brows it copies the primitive from `people.glb` into the same person in `people_lod.glb` (the two share the 53-joint skeleton, the vertex formats
and the materials, so the bytes can be copied as they are), appended to the binary chunk with the LOD part's own accessors left unreferenced (5.82 -> 6.13 MB). The copied vertices are
moved a little way out along their own normals, because the decimated head stands a little proud of the full one and would swallow them: **hair 6 mm, brows 1 mm**. Each repaired
person carries `extras.lodparts`; a second run leaves them alone; `--check` lists the ones not done and exits 1; the output is byte-deterministic; `bodyfit.js` finds the new hair by its
material name as before. **A LOD file regenerated without this step fails `js/sim/sim.test.mjs`** (same triangle count as the full file, every vertex within the lift of it, indices in range).

**Measured** (`node tools/people_hair.mjs`, needs Playwright): for each person, with the game's own `AnimCrowd` and everything but the part hidden, the area the part covers and the area it
changes in the picture (hair: eight sides and from above; brows: three close views), LOD / full. Original LOD export -> repaired. Hair covered, the four people: 0.79-0.84 -> 1.10-1.12 (a
decimated hair that is still a shell covers more than the original; the other 26 people sit at 1.06-1.27 and are untouched). Brows over the roster: the geometry covers 2.4-45 times
(median 6.1) -> 1.14-1.77 times (median 1.36) the full file's, and what is *seen* of them in all 30 people together 4.93 times -> 1.15 times. (The tool hides the phone in the hand: it is a
plain mesh and, near the face, was being counted as brow.)

**How the lifts were chosen, and how well.** The hair's 6 mm is a judgement from close-ups of the heads: at 0 the scalp shows through the cap in patches, at 3 mm a few specks remain, at 6 mm
it is clean. The measures cannot resolve specks (they say only that the new hair covers 1.04-1.06 times the full file's at 3 mm, 1.10-1.12 at 6 and 1.16-1.18 at 9), so that number is by eye.
The brows' lift was picked with the measure, but only within a flat region of it, because no single lift suits every head (the decimated skin sits differently on each). Seen over all 30
people the LOD brows are 0.85 times the full file's at 0 mm, 1.01 at 0.5, 1.15 at 1, 1.30 at 1.5, 1.46 at 2 and 1.77 at 3 mm. Per person (the 28 with a visible brow in the full file) the
mean |ln ratio| is 0.59 / 0.53 / 0.56 / 0.62 / 0.68 / 0.80 for 0 / 0.5 / 1 / 1.5 / 2 / 3 mm; people left under half their full-file brow: 8 / 5 / 4 / 3 / 3 / 2; people with over twice:
0 / 0 / 0 / 0 / 5 / 11. That rules out 2 mm and 3 mm (swollen) and 0 (buried in eight people) but cannot choose among 0.5, 1 and 1.5 mm; 1 mm has the lowest error of the three.

**What is not fixed.** `woman_dress` and `woman_midi` show no brow at all in the LOD (130-170 px of brow seen in the same views of the full file): the decimated hair's bulkier fringe covers
it, and a lift cannot mend that; `woman_sash` keeps 0.17 and `girl_small` 0.47 of theirs. `woman_bob` and `man_longcoat` have almost invisible brows in the full file too (their brow texture is
nearly transparent), so a ratio for them means little. The other 26 LOD hairs are the decimated shells, 6-27% bulkier than the originals. The tool measures the stand pose only (the
contact sheets also showed walking, where nothing looked wrong with the new hair); a swinging ponytail meeting a shoulder is not checked, and nobody has watched any of this in motion.

## Kilt refit (2026-11-07)

The kilts stood off the children (Arthur: "too big, a gap between it and their legs") and let skin through at the hips. `build_skirt` in `tools/assets_people_mpfb.py` now:
- measures the waist as the body there plus the cut top's hem loop (cut first, then measured), never the loose sweater above the cut, and never the hands hanging beside the hips;
- holds each ring off the body's own outline, not an oval through its extents, then pushes it to its convex hull (cloth spans the gap between the thighs instead of dipping in);
- keeps each ring at least as wide as the one above (cloth hangs from the seat; it does not tuck back in) and clear of the body up to the ring above;
- gives the front 1.5 cm more room below the waistband, for a thigh flexing forward at the hip;
- keeps the adult flare on children (a scaled-down flare showed 2-3x the skin) and adds 8 mm below the waistband in the LOD.

The hose now sit on the measured leg and the skin under them is deleted (it came through as knee and shin shards). The sporran hangs 6 mm in front of the kilt's own front and
carries the kilt's weights at its centre, so it moves with the cloth.

Measured with `tools/people_holes.mjs` (stand + walk + gait, cm² per view, the four kilted people), committed -> now: full 119.5 -> 60.8, LOD 62.0 -> 42.8. `boy_kilt` 29.5 -> 7.7,
`girl_school_kilt` 23.5 -> 3.5, `man_kilt_casual` 62.7 -> 43.9; `man_highland` 3.8 -> 5.7 (its standing view: hands now within 3 cm in front of the fuller kilt, which the
measure counts). Still seen: a hairline notch at the top front of `boy_kilt` in the `kid_fidget` side view. The arm turn-out table (`js/sim/armfit.js`) was re-solved: the
kilted men now turn their arms out 12-15 degrees (was 9).

## Roster growth, batch 1 (2026-11-07): 30 -> 44 people
Fourteen teens and young adults (`teen_*`, `ya_*` in `tools/assets_people_mpfb.py`), the first of three batches towards 72 (design note
`wrk_docs/2026.11.07 - HUM - glasgow-subway wider range of people.md`). Each new person sets `face=True`: seeded MakeHuman face targets (nose, mouth,
chin, cheeks, brows, forehead, ears, eyes; a third of each region's controls, symmetric), loaded before the rig and every asset so hair and eyes fit
the face. The thirty earlier people do not set it and come out of the build unchanged (their rest-pose skin counts are identical).

New garments and hair, all CC0 / CC-BY (`CREDITS.md`, now generated with the CC-BY author list and the audio rows kept): straight and bootcut jeans,
denim shorts, a tube top, the crude male T-shirt, a winter coat, a fedora, running and tennis shoes, flats, ballet flats, stiletto booties; hair
`afro01`, `culturalibre_hair_05`, `elvs_*` (daisy, short daisy, lady hippy, maxwell, katherine, wavy bob), `toigo_*` bobs. Tried and dropped after
renders: the female crude T-shirt and the polo (the jeans' waistband comes through), the long open cardigan, a fisherman sweater over the high
skinny trousers, a tube top over denim shorts, and both O4saken hairs (they draw as black shards).

Player-visible skin, `tools/people_holes.mjs` (stand + walk + gait, cm² per view): every new person is at most 14.2 (batch total full 75.0, LOD 88.6).
`teen_hood` and `ya_tube_heels` are repaired by `tools/people_skinfit.py`; the tube top's waistband needed a 5 mm hem margin (a RECIPE (push, hem)
pair). Sizes: `people.glb` 16.4 MB, `people_lod.glb` 8.4 MB (from 11.7 and 6.1) - about 0.35 MB per new person.

## Roster growth, batch 2 (2026-11-07): 44 -> 58 people
Fourteen adults (`adult_*`), with `face=True`, and the garments no CC0 / CC-BY asset offered, made in `tools/assets_people_mpfb.py` `add_garments`:
- **Lycra leggings and bike shorts** (`lycra=`, `paint_lycra`): the body's own skin from the waist to the ankle or mid-thigh gets a cloth material,
  so nothing can come through. The skin is cut along both hems first, and the hem vertices are kept out of the decimation (vertex group `keepW`):
  whole faces, then the decimator, each left the hem a zigzag.
- **Baggy jeans** (`baggy=`, `widen_jeans`): `elvs_jeans_straight_leg` pushed out from each leg's axis, nothing at the crotch, the fraction at the hem.
- **Waist tuck** (`tuck=`, `tuck_waist`): the jeans' waistband (belt loops, a white label) stood out through a sweater or loose tee worn over it; the
  bottom is pulled in, up to 1.5 cm, above the top's hem.
- **Baseball caps and the top hat** (`hat=`, `build_cap` / `build_tophat`): fitted to the head + hair outline above the brows, weighted to `head`.
  `fit_height` scales a person to the top of the head or hair, not the hat (`person['crown']`).
- **One top hat, seen rarely**: `adult_tophat` has `rare: 0.12` in `people_meta.json`; `people.js` `pickChar` takes a rare person only that fraction
  of the times they are drawn, except in its last step, so a crowd that needs everyone still gets him. He is 1.70 m, 1.80 m in the hat.

Tried and dropped after renders: `toigo_halter_dress_knee_length` (skin through the skirt), `fedora_cocked` (grey shards),
`elvs_male_trouser_short_1` (most of the seat missing).

Player-visible skin, `tools/people_holes.mjs` (cm² per view): every new person is at most 13.1 full / 15.8 LOD (batch total full 54.1, LOD 59.7).
The top is `adult_runner`, almost all of it in the standing pose (43 / 48; 5-9 walking): a tinted render shows only her bare arms and the crop top's
bare midriff; the measure counts a hand within 3 cm of cloth. No skinfit repair was needed. Sizes: `people.glb` 21.0 MB, `people_lod.glb` 10.5 MB.

## Known gaps / TODO
Nose shape is faceted; no door hinge animations on saloon end doors; vertex AO not baked; station tile texture density 0.125 m; escalator/stairs simplified.
