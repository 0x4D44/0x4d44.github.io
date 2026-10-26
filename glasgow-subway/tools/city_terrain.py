"""Build data/terrain.json from AWS terrarium tiles (z14). usage: city_terrain.py WORKDIR OUT_DIR
Writes WORKDIR/dem.npy (10 m raw DEM, before water carving) and meta."""
import sys, os, math, urllib.request, json, io
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from geo import unproject
work, out = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
MINX, MAXX, MINZ, MAXZ, CELL = -3600.0, 2400.0, -2500.0, 2700.0, 10.0
Z = 14
def tilexy(lat, lon):
    n = 2 ** Z; x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y
la0, lo0 = unproject(MINX, MINZ); la1, lo1 = unproject(MAXX, MAXZ)  # nw, se
x0, y0 = tilexy(la0, lo0); x1, y1 = tilexy(la1, lo1)
tx0, tx1, ty0, ty1 = int(x0) - 1, int(x1) + 1, int(y0) - 1, int(y1) + 1
img = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        f = os.path.join(work, "tm_%d_%d_%d.png" % (Z, tx, ty))
        if not os.path.exists(f):
            u = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (Z, tx, ty)
            for a in range(5):
                try: open(f, "wb").write(urllib.request.urlopen(u, timeout=60).read()); break
                except Exception as e: print("retry", e)
        a = np.asarray(Image.open(f).convert("RGB")).astype(np.float32)
        e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        img[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = e
nx = int((MAXX - MINX) / CELL) + 1; nz = int((MAXZ - MINZ) / CELL) + 1
xs = MINX + np.arange(nx) * CELL; zs = MINZ + np.arange(nz) * CELL
H = np.zeros((nz, nx), np.float32)
# bilinear sample
for j, z in enumerate(zs):
    la = np.array([unproject(x, z) for x in xs])
    px = ((la[:, 1] + 180) / 360 * 2 ** Z - tx0) * 256 - 0.5
    py = ((1 - np.arcsinh(np.tan(np.radians(la[:, 0]))) / math.pi) / 2 * 2 ** Z - ty0) * 256 - 0.5
    ix = np.floor(px).astype(int); iy = np.floor(py).astype(int); fx = px - ix; fy = py - iy
    H[j] = (img[iy, ix] * (1 - fx) * (1 - fy) + img[iy, ix + 1] * fx * (1 - fy) + img[iy + 1, ix] * (1 - fx) * fy + img[iy + 1, ix + 1] * fx * fy)
np.save(os.path.join(work, "dem_raw.npy"), H)
json.dump(dict(minX=MINX, maxX=MAXX, minZ=MINZ, maxZ=MAXZ, cell=CELL, nx=nx, nz=nz), open(os.path.join(work, "dem_meta.json"), "w"))
print(H.shape, H.min(), H.max(), np.percentile(H, [5, 50, 95]))
