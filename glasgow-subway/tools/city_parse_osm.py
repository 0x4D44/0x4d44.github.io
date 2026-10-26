"""Parse cached OSM XML tiles -> pickle of categorised features in local metres (x east, y north; world z = -y).
usage: city_parse_osm.py OSM_DIR OUT.pkl"""
import sys, os, glob, pickle, collections
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(__file__))
from geo import project
from shapely.geometry import Polygon, LineString, MultiPolygon, Point
from shapely.ops import linemerge, polygonize, unary_union
from shapely.validation import make_valid

nodes = {}; ways = {}; rels = {}; ntags = {}
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.osm"))):
    for ev, el in ET.iterparse(f):
        t = el.tag
        if t == "node":
            i = int(el.get("id")); nodes[i] = (float(el.get("lat")), float(el.get("lon")))
            tags = {c.get("k"): c.get("v") for c in el.findall("tag")}
            if tags: ntags[i] = tags
            el.clear()
        elif t == "way":
            i = int(el.get("id"))
            ways[i] = ([int(c.get("ref")) for c in el.findall("nd")], {c.get("k"): c.get("v") for c in el.findall("tag")})
            el.clear()
        elif t == "relation":
            i = int(el.get("id"))
            rels[i] = ([(c.get("type"), int(c.get("ref")), c.get("role")) for c in el.findall("member")], {c.get("k"): c.get("v") for c in el.findall("tag")})
            el.clear()
print(len(nodes), len(ways), len(rels))
def pt(n):
    la, lo = nodes[n]; x, z = project(la, lo); return (x, -z)
def coords(w):
    try: return [pt(n) for n in ways[w][0]]
    except KeyError: return None
def mp_polys(members):
    outers = []; inners = []
    for typ, ref, role in members:
        if typ != "way" or ref not in ways: continue
        c = coords(ref)
        if not c or len(c) < 2: continue
        (inners if role == "inner" else outers).append(LineString(c))
    def poly(lines):
        if not lines: return []
        m = linemerge(lines) if len(lines) > 1 else lines[0]
        ps = list(polygonize(unary_union(m)))
        return ps
    o = poly(outers); i = poly(inners)
    res = []
    for p in o:
        holes = [h for h in i if p.contains(h.representative_point())]
        q = p
        for h in holes: q = q.difference(h)
        res.append(q)
    return res
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type == "Polygon": return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"): return [p for x in g.geoms for p in polys_of(x)]
    return []
def mkpoly(c):
    if len(c) < 4 or c[0] != c[-1]: return []
    p = Polygon(c)
    if not p.is_valid: p = make_valid(p)
    return [q for q in polys_of(p) if q.area > 1]

out = collections.defaultdict(list)
used_in_rel = set()
def cat_area(tags):
    if "building" in tags and tags["building"] != "no": return "building"
    if "building:part" in tags: return "part"
    if tags.get("natural") == "water" or tags.get("waterway") == "riverbank" or tags.get("landuse") in ("reservoir","basin") or tags.get("water") in ("river","canal","lake","pond","basin","reservoir","dock"): return "water"
    if tags.get("natural") == "bay": return "water"
    if tags.get("leisure") in ("park","garden","pitch","golf_course","recreation_ground","playground","common","nature_reserve","track") or tags.get("landuse") in ("grass","forest","meadow","cemetery","village_green","recreation_ground","allotments","orchard","flowerbed") or tags.get("natural") in ("wood","scrub","grassland","heath","wetland","tree_row"): return "green"
    if tags.get("landuse") in ("industrial","retail","commercial","railway","residential","construction","brownfield"): return "landuse"
    if tags.get("amenity") in ("parking",) : return "parking"
    return None
def add_area(c, tags, kind, ident):
    for p in (c if isinstance(c, list) and c and hasattr(c[0], "exterior") else mkpoly(c)):
        out[kind].append((p, tags, ident))
for rid, (mem, tags) in rels.items():
    if tags.get("type") not in ("multipolygon", "building", "boundary"): continue
    k = cat_area(tags)
    if tags.get("type") == "multipolygon" and k:
        ps = mp_polys(mem)
        for p in ps:
            for q in polys_of(make_valid(p) if not p.is_valid else p):
                if q.area > 1: out[k].append((q, tags, "r%d" % rid))
        for typ, ref, role in mem:
            if typ == "way" and role in ("outer", "") and not ways.get(ref, ([], {}))[1].get(("building")) is None: pass
            if typ == "way" and (role == "outer" or role == ""): 
                if not tags.get("building") is None or True: used_in_rel.add(ref)
    elif tags.get("type") == "multipolygon" and tags.get("waterway") == "riverbank": pass
for wid, (nd, tags) in ways.items():
    c = coords(wid)
    if not c: continue
    k = cat_area(tags)
    closed = len(c) > 3 and nd[0] == nd[-1]
    if k and closed and tags.get("area") != "no":
        # skip outer ways of multipolygons that already carry the same tag category (tags on relation) only if way itself untagged - tagged ways handled here
        if wid in used_in_rel and not any(t in tags for t in ("building","building:part")) and k not in ("water","green"): pass
        for p in mkpoly(c): out[k].append((p, tags, "w%d" % wid))
        continue
    hw = tags.get("highway")
    if hw and tags.get("area") != "yes":
        out["road"].append((LineString(c), tags, "w%d" % wid)); continue
    if hw and closed and tags.get("area") == "yes":
        for p in mkpoly(c): out["roadarea"].append((p, tags, "w%d" % wid)); continue
    if tags.get("railway") in ("rail", "light_rail", "tram", "narrow_gauge", "subway", "preserved"):
        out["rail"].append((LineString(c), tags, "w%d" % wid)); continue
    if tags.get("waterway") in ("river", "stream", "canal", "drain", "ditch"):
        out["waterway"].append((LineString(c), tags, "w%d" % wid)); continue
    if tags.get("natural") == "tree_row":
        out["treerow"].append((LineString(c), tags, "w%d" % wid)); continue
    if tags.get("man_made") == "bridge" and closed:
        for p in mkpoly(c): out["bridgearea"].append((p, tags, "w%d" % wid))
    if tags.get("barrier") in ("wall","fence") : continue
# polygons of roads flagged highway area w/o area=yes but closed pedestrian
for nid, tags in ntags.items():
    if tags.get("natural") == "tree":
        out["tree"].append((Point(pt(nid)), tags, "n%d" % nid))
    elif any(k in tags for k in ("ele","name","tourism","man_made","railway","amenity")) and tags.get("natural")!="tree":
        out["poi"].append((Point(pt(nid)), tags, "n%d" % nid))
# dedupe polygons by ident
for k in list(out):
    seen = set(); l = []
    for g, t, i in out[k]:
        if i in seen: continue
        seen.add(i); l.append((g, t, i))
    out[k] = l
    print(k, len(l))
# Clyde polygon is clipped at the bbox edges: extend ends using the river centre-line buffered
from shapely.geometry import box
clydeline = [g for g, t, i in out["waterway"] if t.get("waterway") == "river" and t.get("name") == "River Clyde"]
if clydeline:
    cl = unary_union(clydeline)
    ends = unary_union([box(1700, -4000, 4000, 4000), box(-9000, -4000, -3300, 4000)])
    ext = cl.buffer(48).intersection(ends)
    for q in polys_of(ext): out["water"].append((q, {"name": "River Clyde", "natural": "water", "water": "river", "synthetic": "yes"}, "synthclyde"))
pickle.dump(dict(out), open(sys.argv[2], "wb"))
