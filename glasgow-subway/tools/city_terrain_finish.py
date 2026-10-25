"""Carve water into the raw DEM and write data/terrain.json. usage: city_terrain_finish.py WORKDIR OUT_TERRAIN_JSON
Also writes WORKDIR/terrain_final.npy and WORKDIR/water_level.npy (per-cell water surface, nan = none)."""
import sys, os, json, pickle
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
work, outjson = sys.argv[1], sys.argv[2]
WATER_Y = 3.0
d = pickle.load(open(os.path.join(work, "osm.pkl"), "rb"))
H = np.load(os.path.join(work, "dem_raw.npy")).astype(np.float64); m = json.load(open(os.path.join(work, "dem_meta.json")))
nx, nz, C = m["nx"], m["nz"], m["cell"]
def mask(items):
    im = Image.new("L", (nx, nz), 0); dr = ImageDraw.Draw(im)
    f = lambda c: [((x - m["minX"]) / C, (-y - m["minZ"]) / C) for x, y in c]
    for g, t, i in items:
        for p in ([g] if g.geom_type == "Polygon" else g.geoms):
            dr.polygon(f(p.exterior.coords), fill=1)
            for h in p.interiors: dr.polygon(f(h.coords), fill=0)
    return np.array(im) > 0
# denoise (bridge decks / buildings in DSM): median then light gaussian
H = ndi.median_filter(H, size=3); H = ndi.gaussian_filter(H, 0.8)
clyde = mask([w for w in d["water"] if w[1].get("name") == "River Clyde"])
# gap-fill the Clyde polygon slightly (rasterisation holes)
clyde = ndi.binary_closing(clyde, iterations=2)
other = mask([w for w in d["water"] if w[1].get("name") != "River Clyde"])
other &= ~clyde
L = np.full(H.shape, np.nan)
# non-Clyde water: local minimum surface within mask, smoothed
big = np.where(other, H, 1e9)
Lm = ndi.minimum_filter(big, size=7)
Lm = np.where(other, Lm, np.nan)
# smooth along the body
Lf = np.where(other, Lm, 0.0); w = ndi.uniform_filter(other.astype(float), 7)
Ls = ndi.uniform_filter(Lf, 7) / np.maximum(w, 1e-6)
L[other] = Ls[other] - 0.15
L[clyde] = WATER_Y
# quays: ring around the Clyde never below 3.5
ring = ndi.binary_dilation(clyde, iterations=2) & ~clyde
H[ring] = np.maximum(H[ring], 3.6)
H[clyde] = 0.4
oth_ring = ndi.binary_dilation(other, iterations=1) & ~other & ~clyde
Hn = ndi.maximum_filter(np.where(other, -1e9, H), size=3)
H[other] = L[other] - 1.2
# banks of small water: not lower than level+0.3
lvl_near = ndi.maximum_filter(np.where(other, L, -1e9), size=3)
H[oth_ring] = np.maximum(H[oth_ring], lvl_near[oth_ring] + 0.35)
H = np.round(H, 1)
np.save(os.path.join(work, "terrain_final.npy"), H); np.save(os.path.join(work, "water_level.npy"), L)
json.dump({"minX": m["minX"], "maxX": m["maxX"], "minZ": m["minZ"], "maxZ": m["maxZ"], "cell": C, "nx": nx, "nz": nz, "waterY": WATER_Y,
           "heights": [[float(v) for v in row] for row in H]}, open(outjson, "w"), separators=(",", ":"))
print(os.path.getsize(outjson))
# hillshade preview
gy, gx = np.gradient(H, C); sh = np.clip(0.5 + 0.9 * (-gx + gy) / 2 * 3, 0, 1)
img = (np.dstack([sh * 0.8 + (H - H.min()) / np.ptp(H) * 0.2] * 3) * 255).astype(np.uint8)
img[clyde] = [40, 90, 200]; img[other] = [90, 140, 230]
Image.fromarray(img).resize((nx, nz)).save(os.path.join(work, "terrain_preview.png"))
