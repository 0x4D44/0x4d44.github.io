#!/usr/bin/env python3
"""Stage 1 (needs network-cached raw data, optional): extract Glasgow Subway ways/stops/entrances from
OSM map tiles (api.openstreetmap.org/api/0.6/map?bbox=) + Terrarium DEM tiles into research/osm_extract.json.
Usage: build_subway_extract.py <dir with t*.xml OSM tiles> <dir with z14 terrarium pngs> [out.json]
The committed research/osm_extract.json is what tools/build_subway.py consumes (so the build is offline/reproducible).
OSM data (c) OpenStreetMap contributors, ODbL. Terrarium tiles: Mapzen/AWS terrain (SRTM/EU-DEM/OS-derived mix)."""
import sys, glob, json, math, os
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import project
import numpy as np
from PIL import Image

osm_dir, dem_dir = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'research', 'osm_extract.json')
nodes, ways = {}, {}
for f in sorted(glob.glob(os.path.join(osm_dir, 't*.xml'))):
    for e in ET.parse(f).getroot():
        if e.tag == 'node':
            nodes[e.get('id')] = (float(e.get('lat')), float(e.get('lon')), {t.get('k'): t.get('v') for t in e.findall('tag')})
        elif e.tag == 'way':
            ways[e.get('id')] = ([n.get('ref') for n in e.findall('nd')], {t.get('k'): t.get('v') for t in e.findall('tag')})

# --- DEM
Z = 14
tiles = {}
for f in glob.glob(os.path.join(dem_dir, f'{Z}_*_*.png')):
    _, x, y = os.path.basename(f)[:-4].split('_')
    a = np.asarray(Image.open(f).convert('RGB')).astype(float)
    tiles[(int(x), int(y))] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
def ground(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    tx, ty = int(fx), int(fy)
    t = tiles.get((tx, ty))
    if t is None: return None
    px, py = (fx - tx) * 256 - 0.5, (fy - ty) * 256 - 0.5
    i, j = int(math.floor(py)), int(math.floor(px))
    di, dj = py - i, px - j
    def g(ii, jj): return float(t[min(255, max(0, ii)), min(255, max(0, jj))])
    return (g(i, j) * (1 - dj) * (1 - di) + g(i, j + 1) * dj * (1 - di) + g(i + 1, j) * (1 - dj) * di + g(i + 1, j + 1) * dj * di)

def pt(nid):
    la, lo, _ = nodes[nid]
    gy = ground(la, lo)
    return {"lat": la, "lon": lo, "g": None if gy is None else round(gy, 1)}

res = {"ways": {}, "stations": {}, "stops": [], "entrances": [], "platforms": [], "other": []}
for wid, (nd, t) in ways.items():
    if t.get('railway') == 'subway':
        res["ways"][wid] = {"tags": t, "nodes": [dict(pt(n), id=n) for n in nd]}
for nid, (la, lo, t) in nodes.items():
    if not t: continue
    d = dict(pt(nid), id=nid, tags=t)
    if t.get('railway') == 'station' and t.get('station') == 'subway': res["stations"][nid] = d
    elif t.get('railway') == 'subway_entrance': res["entrances"].append(d)
    elif t.get('public_transport') == 'stop_position' and ('subway' in t.get('network', '').lower() or t.get('subway') == 'yes' or t.get('railway') == 'stop' or True):
        # keep only those within 12 m of a subway way node (see build)
        res["other"].append(d)
# stop positions: keep those on subway ways
way_nodes = {n for w in res["ways"].values() for n in (x['id'] for x in w['nodes'])}
res["stops"] = [d for d in res["other"] if d['id'] in way_nodes]
del res["other"]
# station buildings / areas, platforms tagged railway=platform near subway & public_transport=station w/ subway
for wid, (nd, t) in ways.items():
    if t.get('station') == 'subway' or (t.get('building') and 'subway' in (t.get('name', '') + t.get('operator', '')).lower()):
        res["platforms"].append({"id": wid, "tags": t, "nodes": [pt(n) for n in nd]})
json.dump(res, open(out, 'w'), separators=(',', ':'))
print('wrote', out, {k: len(v) for k, v in res.items()})
