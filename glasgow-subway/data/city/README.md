# data/city - central Glasgow, Blender-built, chunked glTF 2.0 (GLB)

World frame as SPEC (+X east, +Y up m OD, -Z north, origin 55.86N 4.27W). 132 chunks `city_<i>_<j>.glb` of 500 m
(minX = -3600 + 500 i, minZ = -2500 + 500 j; extent x -3600..2400, z -2500..2700), listed in `manifest.json`
(`file,minX,maxX,minZ,maxZ,tris,trees`). `overview.glb` = whole area, ~100 m terrain + water + merged building masses (0.6 MB).
Geometry is in world coordinates (no node offsets except KHR_mesh_quantization scale/translation on mesh nodes).

## Meshes per chunk (name prefix = layer; hide/fade by prefix)
- `terrain_i_j` - ground, vertex colours (landuse/slope/water-bed baked), smooth normals; 10 m grid in the core, 20 m outside (seams stitched). Material `mat_terrain`.
- `buildings_i_j` - materials `mat_wall_stone` (tenement/house facade texture x vertex tint), `mat_wall_glass` (curtain wall), `mat_wall_plain` (industrial/sheds), `mat_roof`.
  OSM footprints/holes, height / building:levels / min_height / building:part, roof shapes flat/gabled/hipped. UVs use KHR_texture_transform (scale 128).
- `roads_i_j` - `mat_road` (carriageway, +0.30 m above terrain), `mat_pavement` (+0.42 m), `mat_bridge` (decks, fascia, parapets, piers); also car parks.
- `rail_i_j` - surface railway ballast + rails + rail bridges (`mat_rail`).
- `water_i_j` - Clyde (flat at 3.0 m = `WATER_Y`), Kelvin, canal, basins, ponds (own sloped level); terrain is carved below them. `mat_water` (opaque).
- `green_i_j` - parks/grass/woods/pitches draped +0.14..0.25 m (`mat_green`); `green_tree_{a,b,c,conifer}` - low-poly trees as EXT_mesh_gpu_instancing (GLTFLoader handles it).
- `landmarks_<name>` - hand-modelled: Finnieston Crane, SEC Armadillo, OVO Hydro, Kelvingrove Art Gallery, City Chambers, University of Glasgow main building (tower+spire),
  Central Station (vaulted shed), Queen Street shed, Glasgow Tower, Science Centre, Riverside Museum, Glasgow Cathedral, Tolbooth Steeple, Mitchell Library dome,
  Royal Concert Hall, Ibrox Stadium bowl, Clyde Arc (arch + hangers over a deck). Materials `mat_landmark_*`. Their OSM footprints are removed from `buildings_*`.
Flat layers (roads/rail/green/water) carry no normals (three.js flat-shades them); all have `COLOR_0`.

## Data/height notes
Elevation: real - AWS Terrarium tiles (z14) resampled to 10 m, median+gaussian filtered, water carved (`data/terrain.json`, `js/shared/terrain.js`).
Station `surfaceY` in subway.json matches terrain within ~0.2 m. Heights of buildings without tags are estimates (levels x 3.4 m, central tenements 3-5 floors).
Sources: OpenStreetMap contributors (ODbL), terrain: AWS Terrain Tiles (SRTM/lidar blend). Rebuild: tools/city_*.py (see NOTES-A2.md).
