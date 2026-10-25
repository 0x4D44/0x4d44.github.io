# models/ - Glasgow Subway 3D assets (A3)

All files are glTF 2.0 binary, built headless in Blender (bpy) by `tools/assets_*.py` (rebuild all: `<venv>/bin/python tools/assets_build.py`).
Units: metres. glTF/three.js axes: +Y up, **nose / direction of travel = -Z** (Blender +Y). +X = right of the direction of travel.
Origin of track models: on the track centre-line **at rail-head level** (y=0 = top of running rails), x=0 between the rails.
Materials use PBR names (`subway_orange`, `glass_window`, `tile_cream`, ...), all double-sided; glass uses alpha BLEND. Procedural 128px greyscale
detail textures (tile/concrete/flags/brick/tactile) are embedded in the GLBs (UV = 1 unit per metre, repeating).
three.js note: multi-material meshes load as a Group named after the node with child meshes (`name`, `name_1`, ...); animate the **top-level named node**.
Dev preview: `tools/assets_preview.html?f=train.glb&cam=x,y,z&look=x,y,z&only=prefix&hide=prefix&rep=N,dz` (serve repo root over http).

Real-world basis (estimates marked ~): track gauge 4 ft (1220 mm); inner tunnel bore 3.35 m (nominal 11 ft); stock is small. The Stadler unit here is modelled
as a **2-car, ~27.8 m, 2.30 m wide, 2.72 m high (rail head to roof; +0.06 roof pods)** train (~ estimates; real cars are driverless, the cab is a notional driving cab).
Floor height 0.80 m above rail head; platform top 0.80 m; platform edge gap ~0.10 m. Fit check: train max roof corner clears the 3.35 m bore (axis at +1.20 m).
Power: two conductor rails at x=+-0.92 m (top height +0.12 m) with bogie collector shoes (~ stylised; exact Subway arrangement not verified).

## train.glb  (~830 KB, ~12k tris)   train_lod.glb (~22 KB, 248 tris)
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

## people.glb  (~210 KB)
Root `people`; standing `person_0..4` (1.45-1.84 m; `person_3` hi-vis staff, `person_4` child), seated `person_sit_0..1` (origin on floor under the hips, seat height 0.45, facing -Z, legs forward). All face glTF -Z. Low poly, flat colours, all share the same space - clone by name.

## Known gaps / TODO
Nose shape is faceted; no door hinge animations on saloon end doors; vertex AO not baked; station tile texture density 0.125 m; escalator/stairs simplified.
