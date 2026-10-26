# NOTES-A2 (3D city)
Pipeline (all in tools/): `city_fetch_osm.py` (tiled OSM API download) -> `city_parse_osm.py` (features pickle) -> `city_terrain.py` + `city_terrain_finish.py` (Terrarium DEM, water carve, data/terrain.json)
-> `city_build.py` (headless Blender via venv python; uses `city_lib.py`, `city_landmarks.py`, `city_trisrv.py` = isolated `triangle` server since it segfaults on odd input)
-> `city_post.mjs` (gltf-transform: dedup, tree instancing, KHR_mesh_quantization, UV scale, drop unused UV/normals) -> `city_overview.py`. Viewer/test: `city_view.html` + `city_shot.cjs`.
Real elevation was reachable (not a synthetic height field). Total data/city ~30.7 MB (limit 30: small buildings in the outskirts were dropped to fit; plain GLB, no Draco/meshopt).
Known gaps: no road markings/street furniture; building roofs simple; Kingston Bridge/other bridges are generic decks (Clyde Arc has an arch); tunnels/underpasses omitted;
water is opaque (fade via material); outer-area small buildings (<130 m2 beyond 2.7 km, <64 m2 beyond 1.5 km) omitted.
