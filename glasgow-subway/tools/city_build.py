"""Glasgow city builder (headless Blender). Builds chunked glTF for data/city.
usage: <venv>/bin/python city_build.py WORKDIR RAWDIR [--chunks i,j;i,j ...] [--no-landmarks]
WORKDIR holds osm.pkl, terrain_final.npy, water_level.npy, dem_meta.json (see city_osm/terrain tools)."""
import sys, os, math, pickle, json, time, random
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union
from shapely import affinity
import shapely
from shapely.strtree import STRtree
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from city_lib import *

WORK, RAW = sys.argv[1], sys.argv[2]
ARGS = sys.argv[3:]
ONLY = None
if "--chunks" in ARGS:
    ONLY = set(tuple(int(v) for v in t.split(",")) for t in ARGS[ARGS.index("--chunks") + 1].split(";"))
NO_LM = "--no-landmarks" in ARGS
os.makedirs(RAW, exist_ok=True)
T0 = time.time()
def log(*a): print("[%6.1fs]" % (time.time() - T0), *a, flush=True)

D = pickle.load(open(os.path.join(WORK, "osm.pkl"), "rb"))
TR = Terr(WORK)
CH = 500.0
CX0, CZ0 = TR.minX, TR.minZ                      # chunk grid origin (world x, world z)
NCX = int(math.ceil((TR.maxX - TR.minX) / CH)); NCZ = int(math.ceil((TR.maxZ - TR.minZ) / CH))
NPC = int(CH / TR.C)                              # nodes per chunk edge
def chunk_bounds(ci, cj):
    """(x0, y0, x1, y1) in x-east / y-north"""
    x0 = CX0 + ci * CH; z0 = CZ0 + cj * CH
    return (x0, -min(z0 + CH, TR.maxZ), min(x0 + CH, TR.maxX), -z0)
def is_fine(ci, cj):
    if not (0 <= ci < NCX and 0 <= cj < NCZ): return False
    b = chunk_bounds(ci, cj); cx = (b[0] + b[2]) / 2; cy = (b[1] + b[3]) / 2
    return -2950 < cx < 1550 and -1450 < cy < 1650   # core: fine 10 m terrain
def chunk_of(x, y):
    return int((x - CX0) // CH), int((-y - CZ0) // CH)

# ---------------------------------------------------------------- materials
def mk_tex(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    a = np.zeros((h, w, 4), np.float32); a[..., :3] = arr[::-1] / 255.0; a[..., 3] = 1
    img.pixels.foreach_set(a.ravel()); img.pack(); img.colorspace_settings.name = "sRGB"
    return img

def facade_tenement():
    W = H = 128; im = np.zeros((H, W, 3), np.float32); im[:] = (232, 230, 226)
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    pil = Image.new("RGB", (W, H), (232, 230, 226)); d = ImageDraw.Draw(pil)
    d.rectangle([0, H - 4, W, H], fill=(205, 203, 199))          # string course at floor line (bottom)
    d.rectangle([0, 0, W, 2], fill=(214, 212, 208))
    # window: 1.25 m wide, 2.1 m tall in a 3.4 x 3.5 cell
    x0, x1 = int(W * 0.30), int(W * 0.70); y0, y1 = int(H * 0.17), int(H * 0.78)
    d.rectangle([x0 - 4, y0 - 5, x1 + 4, y1 + 4], fill=(246, 244, 240))   # architrave
    d.rectangle([x0, y0, x1, y1], fill=(46, 54, 66))                      # glass
    d.line([(W // 2, y0), (W // 2, y1)], fill=(200, 200, 198), width=2)
    d.line([(x0, (y0 + y1) // 2 - 6), (x1, (y0 + y1) // 2 - 6)], fill=(200, 200, 198), width=2)
    d.rectangle([x0 - 6, y1 + 4, x1 + 6, y1 + 8], fill=(190, 188, 184))   # sill
    d.rectangle([x0 - 5, y0 - 10, x1 + 5, y0 - 5], fill=(214, 212, 208))  # lintel
    return np.asarray(pil)

def facade_glass():
    W = H = 128
    pil = Image.new("RGB", (W, H), (176, 196, 214)); d = ImageDraw.Draw(pil)
    d.rectangle([0, H - 26, W, H], fill=(112, 124, 136))                  # spandrel
    d.rectangle([0, H - 28, W, H - 25], fill=(70, 76, 84))
    for x in (0, W // 2):
        d.rectangle([x, 0, x + 2, H], fill=(70, 76, 84))
    d.rectangle([0, 0, W, 2], fill=(90, 96, 104))
    for k in range(6): d.line([(0, 8 + k * 14), (W, 8 + k * 14 - 5)], fill=(190, 208, 224), width=1)  # faint sky streaks
    return np.asarray(pil)

MATS = {}
def mat(name, rgb=(1, 1, 1), rough=0.9, metal=0.0, tex=None, cull=True, emit=None, alpha=None):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*[float(v) for v in srgb2lin(rgb)], 1.0)
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if tex is not None:
        t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = tex; t.interpolation = "Linear"; t.extension = "REPEAT"
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*[float(v) for v in srgb2lin(emit)], 1.0); b.inputs["Emission Strength"].default_value = 1.0
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
    m.use_backface_culling = cull
    MATS[name] = m; return m

def init_materials():
    ft = mk_tex("facade_tenement", facade_tenement()); fg = mk_tex("facade_glass", facade_glass())
    mat("mat_terrain", rough=1.0)
    mat("mat_road", rough=0.95); mat("mat_pavement", rough=0.9); mat("mat_bridge", rough=0.8, metal=0.1)
    mat("mat_rail", rough=0.8, metal=0.3)
    mat("mat_water", (0.9, 0.95, 1.0), rough=0.35, metal=0.0)
    mat("mat_green", rough=1.0)
    mat("mat_wall_stone", tex=ft, rough=0.9); mat("mat_wall_glass", tex=fg, rough=0.25, metal=0.35)
    mat("mat_wall_plain", rough=0.85); mat("mat_roof", rough=0.85)
    mat("mat_tree", rough=1.0)
    mat("mat_landmark_stone", rough=0.9); mat("mat_landmark_metal", rough=0.35, metal=0.8); mat("mat_landmark_glass", (0.6, 0.75, 0.85), rough=0.1, metal=0.5)
    mat("mat_landmark_roof", rough=0.8); mat("mat_landmark_steel", rough=0.5, metal=0.6)
init_materials()
MAT_SLOT = {"terrain": "mat_terrain", "road": "mat_road", "pave": "mat_pavement", "bridge": "mat_bridge", "rail": "mat_rail", "water": "mat_water",
            "green": "mat_green", "stone": "mat_wall_stone", "glass": "mat_wall_glass", "plain": "mat_wall_plain", "roof": "mat_roof", "tree": "mat_tree",
            "lm_stone": "mat_landmark_stone", "lm_metal": "mat_landmark_metal", "lm_glass": "mat_landmark_glass", "lm_roof": "mat_landmark_roof", "lm_steel": "mat_landmark_steel"}

# ---------------------------------------------------------------- blender mesh construction
def make_object(name, B, slots, coll, normals=None):
    """B: Buf with face material indices referring to `slots` (list of MAT_SLOT keys). Returns object (or None)."""
    if B.empty(): return None
    P, C, U, T, M = B.arrays()
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(P)); me.vertices.foreach_set("co", P.ravel())
    me.loops.add(len(T) * 3); me.polygons.add(len(T))
    me.loops.foreach_set("vertex_index", T.ravel().astype(np.int32))
    me.polygons.foreach_set("loop_start", (np.arange(len(T)) * 3).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(T), 3, np.int32))
    me.polygons.foreach_set("use_smooth", np.ones(len(T), bool))
    me.polygons.foreach_set("material_index", M.astype(np.int32))
    me.update()
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT"); ca.data.foreach_set("color", C.ravel())
    me.color_attributes.active_color = ca
    uv = me.uv_layers.new(name="UVMap"); uv.data.foreach_set("uv", U[T.ravel()].ravel())
    if normals is not None:
        me.normals_split_custom_set_from_vertices(normals.astype(np.float32).tolist())
    for s in slots: me.materials.append(MATS[MAT_SLOT[s]])
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

# ---------------------------------------------------------------- terrain classes / colours
def build_ground_colours():
    nx, nz, C = TR.nx, TR.nz, TR.C
    img = Image.new("L", (nx, nz), 0); dr = ImageDraw.Draw(img)
    f = lambda c: [((x - TR.minX) / C, (-y - TR.minZ) / C) for x, y in c]
    def paint(items, code):
        for g, t, i in items:
            for p in polys_of(g):
                dr.polygon(f(p.exterior.coords), fill=code)
                for h in p.interiors: dr.polygon(f(h.coords), fill=0 if code != 0 else 0)
    LU = D["landuse"]
    paint([x for x in LU if x[1].get("landuse") == "residential"], 7)
    paint([x for x in LU if x[1].get("landuse") in ("industrial", "retail", "commercial", "construction", "brownfield")], 3)
    paint([x for x in LU if x[1].get("landuse") == "railway"], 4)
    G = D["green"]
    paint([x for x in G if green_kind(x[1]) in ("grass", "park", "garden", "allot")], 1)
    paint([x for x in G if green_kind(x[1]) == "cemetery"], 5)
    paint([x for x in G if green_kind(x[1]) in ("wood", "scrub")], 2)
    paint([x for x in G if green_kind(x[1]) == "pitch"], 6)
    cls = np.array(img)
    pal = {0: (0.50, 0.48, 0.44), 1: (0.40, 0.56, 0.28), 2: (0.24, 0.40, 0.21), 3: (0.46, 0.44, 0.41), 4: (0.40, 0.39, 0.37), 5: (0.44, 0.54, 0.34), 6: (0.34, 0.60, 0.29), 7: (0.46, 0.50, 0.37)}
    col = np.zeros((nz, nx, 3), np.float64)
    for k, v in pal.items(): col[cls == k] = srgb2lin(v)
    water = ~np.isnan(TR.WL)
    wd = ndi.binary_dilation(water, iterations=1)
    col[wd] = srgb2lin((0.33, 0.31, 0.27)); col[water] = srgb2lin((0.24, 0.23, 0.21))
    rng = np.random.default_rng(7)
    n1 = ndi.gaussian_filter(rng.standard_normal((nz, nx)), 2.5); n1 /= n1.std() * 6
    n2 = ndi.gaussian_filter(rng.standard_normal((nz, nx)), 0.8); n2 /= n2.std() * 14
    col *= (1 + n1 + n2)[..., None]
    # slope darkening
    gy, gx = np.gradient(TR.H, TR.C); sl = np.hypot(gx, gy)
    col *= (1 - np.clip(sl - 0.15, 0, 0.6))[..., None] * 0.35 + 0.65
    return np.clip(col, 0, 1).astype(np.float32)

def green_kind(t):
    l = t.get("leisure"); u = t.get("landuse"); n = t.get("natural")
    if l == "pitch" or l == "track" or l == "playground" or l == "golf_course": return "pitch" if l != "golf_course" else "grass"
    if n == "wood" or u == "forest": return "wood"
    if n in ("scrub", "wetland", "tree_row"): return "scrub"
    if u == "cemetery": return "cemetery"
    if u == "allotments": return "allot"
    if l == "garden" or u in ("orchard", "flowerbed"): return "garden"
    if l in ("park", "recreation_ground", "common", "nature_reserve") or u in ("village_green", "recreation_ground"): return "park"
    if u in ("grass", "meadow") or n in ("grassland", "heath"): return "grass"
    return "grass"
GREEN_Z = {"grass": 0.14, "park": 0.16, "garden": 0.18, "allot": 0.19, "cemetery": 0.20, "scrub": 0.21, "wood": 0.22, "pitch": 0.25}
GREEN_COL = {"grass": (0.43, 0.60, 0.30), "park": (0.40, 0.58, 0.28), "garden": (0.42, 0.55, 0.30), "allot": (0.45, 0.52, 0.28), "cemetery": (0.44, 0.54, 0.34),
             "scrub": (0.33, 0.48, 0.25), "wood": (0.26, 0.42, 0.22), "pitch": (0.34, 0.63, 0.29)}

GROUND_COL = build_ground_colours()
log("ground colours ready", GROUND_COL.shape)

# ---------------------------------------------------------------- terrain mesh
def terrain_chunk(ci, cj):
    fine = is_fine(ci, cj); step = 1 if fine else 2
    i0 = NPC * ci; i1 = min(NPC * ci + NPC, TR.nx - 1); j0 = NPC * cj; j1 = min(NPC * cj + NPC, TR.nz - 1)
    ii = np.arange(i0, i1 + 1, step); jj = np.arange(j0, j1 + 1, step)
    if ii[-1] != i1: ii = np.append(ii, i1)
    if jj[-1] != j1: jj = np.append(jj, j1)
    Hs = TR.H[np.ix_(jj, ii)].copy()
    if fine:  # snap border vertices shared with coarser neighbours
        def coarse(a, b): return not is_fine(a, b) and 0 <= a < NCX and 0 <= b < NCZ
        if coarse(ci - 1, cj): Hs[1:-1:2, 0] = (Hs[0:-2:2, 0] + Hs[2::2, 0]) / 2
        if coarse(ci + 1, cj): Hs[1:-1:2, -1] = (Hs[0:-2:2, -1] + Hs[2::2, -1]) / 2
        if coarse(ci, cj - 1): Hs[0, 1:-1:2] = (Hs[0, 0:-2:2] + Hs[0, 2::2]) / 2
        if coarse(ci, cj + 1): Hs[-1, 1:-1:2] = (Hs[-1, 0:-2:2] + Hs[-1, 2::2]) / 2
    X = TR.minX + ii * TR.C; Y = -(TR.minZ + jj * TR.C)
    XX, YY = np.meshgrid(X, Y)
    P = np.stack([XX.ravel(), YY.ravel(), Hs.ravel()], 1).astype(np.float32)
    col = GROUND_COL[np.ix_(jj, ii)].reshape(-1, 3)
    col = np.concatenate([col, np.ones((len(col), 1), np.float32)], 1)
    ny, nxx = Hs.shape
    idx = np.arange(ny * nxx).reshape(ny, nxx)
    a = idx[:-1, :-1].ravel(); b = idx[:-1, 1:].ravel(); c = idx[1:, 1:].ravel(); d = idx[1:, :-1].ravel()
    # choose diagonal by smaller height difference
    z = Hs.ravel(); use_ac = np.abs(z[a] - z[c]) <= np.abs(z[b] - z[d])
    T1 = np.where(use_ac[:, None], np.stack([a, d, c], 1), np.stack([a, d, b], 1))
    T2 = np.where(use_ac[:, None], np.stack([a, c, b], 1), np.stack([d, c, b], 1))
    T = np.concatenate([T1, T2]).astype(np.int64)
    T = flip_up(P, T)
    # smooth normals from global gradient
    gy, gx = np.gradient(TR.H, TR.C)
    gxs = gx[np.ix_(jj, ii)].ravel(); gys = gy[np.ix_(jj, ii)].ravel()   # gy is d/d(row) = d/d(south)
    N = np.stack([-gxs, gys, np.ones_like(gxs)], 1); N /= np.linalg.norm(N, axis=1, keepdims=True)
    B = Buf(); B.add(P, T, col, None, 0)
    return B, N, step

# ---------------------------------------------------------------- ground-layer polygon helper
def ground_poly_mesh(polys, bounds, maxarea, zoff, step, colfn, mat_i=0, seglen=14.0, zfn=None):
    """Triangulate polygons, drape on terrain. colfn(x,y)->(n,4) or a constant colour."""
    B = Buf()
    for pg in polys:
        for p in polys_of(pg):
            r = tri_polygon(p, maxarea, seglen, bounds)
            if r is None: continue
            V, T = r
            z = (TR.h(V[:, 0], V[:, 1], step) if zfn is None else zfn(V[:, 0], V[:, 1])) + zoff
            P = np.stack([V[:, 0], V[:, 1], z], 1)
            T = flip_up(P, np.asarray(T, np.int64))
            col = colfn(V[:, 0], V[:, 1]) if callable(colfn) else colfn
            B.add(P, T, col, None, mat_i)
    return B

# ---------------------------------------------------------------- roads / rails / bridges data prep
HW_W = {"motorway": 10.5, "trunk": 9.0, "primary": 8.0, "secondary": 7.2, "tertiary": 6.4, "unclassified": 5.8, "residential": 5.6, "living_street": 4.6,
        "service": 3.6, "track": 3.0, "busway": 6.0, "road": 5.5, "pedestrian": 4.0, "footway": 2.0, "path": 1.8, "cycleway": 2.4, "steps": 1.8, "bridleway": 1.8,
        "motorway_link": 6.0, "trunk_link": 5.5, "primary_link": 5.2, "secondary_link": 5.0, "tertiary_link": 4.8, "corridor": 2.0}
def hw_group(h):
    if h in ("motorway", "trunk", "motorway_link", "trunk_link"): return "A"
    if h in ("primary", "secondary", "primary_link", "secondary_link"): return "A2"
    if h in ("tertiary", "unclassified", "residential", "living_street", "tertiary_link", "road", "busway"): return "B"
    if h in ("service", "track"): return "C"
    if h in ("pedestrian", "footway", "path", "cycleway", "steps", "bridleway", "corridor"): return "P"
    return None
def road_width(t):
    h = t["highway"]; w = HW_W.get(h, 4.0)
    try:
        if "width" in t: w = float(str(t["width"]).replace("m", "").strip().split()[0])
        elif "lanes" in t and h not in ("footway", "path"): w = max(w, 3.0 * int(t["lanes"].split(";")[0]) * (0.55 if t.get("oneway") == "yes" and h in ("motorway", "trunk", "primary") else 1))
    except Exception: pass
    if t.get("oneway") == "yes" and h in ("motorway", "trunk") and "width" not in t and "lanes" not in t: w = 10.5
    if h == "service" and t.get("service") in ("parking_aisle", "driveway"): w = 3.0
    return min(max(w, 1.2), 26.0)

def is_tunnel(t):
    return t.get("tunnel") not in (None, "no") or t.get("covered") == "yes" or (t.get("layer", "0").lstrip("-").isdigit() and int(t.get("layer", "0")) < 0 and t.get("bridge") in (None, "no"))
def is_bridge(t):
    return t.get("bridge") not in (None, "no")

def prep_world():
    W = {}
    water = [g for g, t, i in D["water"]]
    W["water_union"] = unary_union([p for g in water for p in polys_of(g) if p.is_valid])
    wpolys = []
    # roads
    groups = {"A": [], "A2": [], "B": [], "C": [], "P": []}; bridges = []
    for g, t, i in D["road"]:
        h = t.get("highway"); grp = hw_group(h)
        if grp is None: continue
        if t.get("footway") == "crossing" or t.get("highway") == "corridor" or t.get("indoor") == "yes": continue
        if is_tunnel(t): continue
        if is_bridge(t):
            if grp != "P" or g.length > 25: bridges.append((g, t, i))
            continue
        # simplify skinny line
        groups[grp].append(g.buffer(road_width(t) / 2, quad_segs=2))
    for g, t, i in D["roadarea"]:
        if t.get("highway") in ("pedestrian", "footway", "service", "living_street", "residential", "unclassified", "tertiary"):
            groups["P" if t.get("highway") in ("pedestrian", "footway") else "B"].append(g)
    W["bridges"] = bridges
    A = unary_union(groups["A"] + groups["A2"]) if groups["A"] + groups["A2"] else Polygon()
    A1 = unary_union(groups["A"]) if groups["A"] else Polygon()
    A2 = (unary_union(groups["A2"]) if groups["A2"] else Polygon()).difference(A1)
    Bg = (unary_union(groups["B"]) if groups["B"] else Polygon()).difference(A)
    Cg = (unary_union(groups["C"]) if groups["C"] else Polygon()).difference(A).difference(Bg)
    allroad = unary_union([A, Bg, Cg])
    wu = W["water_union"]
    for k, v in (("A1", A1), ("A2", A2), ("B", Bg), ("C", Cg)):
        W["road_" + k] = v.difference(wu).buffer(0).simplify(0.4)
    allroad = unary_union([W["road_A1"], W["road_A2"], W["road_B"], W["road_C"]])
    W["road_all"] = allroad
    # buildings union (for pavement cutouts)
    W["bld_union"] = unary_union([p for g, t, i in D["building"] for p in polys_of(g) if p.is_valid and p.area > 8]).buffer(0.2)
    ped = unary_union(groups["P"]) if groups["P"] else Polygon()
    ring = unary_union([A2.buffer(2.8), Bg.buffer(2.4), unary_union(groups["A"] and [A1.buffer(0.5)] or [Polygon()])]) if True else None
    pave = unary_union([ring, ped]).difference(allroad).difference(wu)
    pave = pave.buffer(0).simplify(0.5)
    W["pave"] = pave
    # rails
    rails = []; rbridges = []
    for g, t, i in D["rail"]:
        if t.get("railway") not in ("rail", "light_rail", "narrow_gauge", "preserved"): continue
        if is_tunnel(t): continue
        if is_bridge(t):
            rbridges.append((g, t, i)); continue
        rails.append((g, t, i))
    W["rails"] = rails; W["rbridges"] = rbridges
    W["ballast"] = unary_union([g.buffer(1.6 if t.get("service") in ("yard", "siding", "spur") else 2.2, quad_segs=2) for g, t, i in rails]).difference(wu).buffer(0).simplify(0.4)
    # green
    gk = {}
    for g, t, i in D["green"]:
        k = green_kind(t)
        gk.setdefault(k, []).append(g)
    W["green"] = {k: unary_union([p for g in v for p in polys_of(g) if p.is_valid]).difference(wu).buffer(0) for k, v in gk.items()}
    # parking lots (flat paved)
    W["parking"] = unary_union([g for g, t, i in D["parking"] if g.is_valid]).difference(allroad).difference(wu).buffer(0)
    return W
W = prep_world()
log("world prepared")

# ---------------------------------------------------------------- bridges
def bridge_mesh(g, t, step, kind, B_deck, B_struct, width=None, name=None):
    pts = np.asarray(g.coords)
    if width is None:
        width = road_width(t) + 1.0 if kind == "road" else 5.5
    rb = ribbon(pts, width, 9.0)
    if rb is None: return
    L, R, Cc, s = rb
    n = len(s)
    zc0 = TR.h(Cc[0, 0], Cc[0, 1], step); zc1 = TR.h(Cc[-1, 0], Cc[-1, 1], step)
    # cover ground clearance: deck above max ground under it + clearance if short ends
    z0 = zc0 + 0.35; z1 = zc1 + 0.35
    f = s / s[-1]
    z = z0 + (z1 - z0) * f
    over_water = False
    if not W["water_union"].is_empty and g.intersects(W["water_union"]):
        over_water = True
        gm = TR.h(Cc[:, 0], Cc[:, 1], step)
        z = np.maximum(z, 6.0 + 0 * z)      # keep deck clear of the river (>= 6 m OD, ~3 m above water)
        zz = z0 + (z1 - z0) * f
        z = np.maximum(zz, 6.2) + 3.0 * np.sin(np.pi * f) * min(1.0, s[-1] / 150.0)
        z[0] = z0; z[-1] = z1
        z = np.maximum(z, np.interp(f, [0, 1], [z0, z1]))
    ok = lambda q: np.stack([q[:, 0], q[:, 1]], 1)
    thick = 0.9 if kind == "road" else 0.8
    top_col = lin((0.19, 0.19, 0.20)) if kind == "road" else lin((0.30, 0.29, 0.28))
    con = lin((0.60, 0.59, 0.57)) if not over_water else lin((0.45, 0.50, 0.55))
    # deck top
    Pt = np.concatenate([np.c_[L, z], np.c_[R, z]]); tri = []
    for k in range(n - 1): tri += [[k, n + k, n + k + 1], [k, n + k + 1, k + 1]]
    Tt = flip_up(Pt, np.array(tri))
    B_deck.add(Pt, Tt, top_col, None, 0)
    # side fascia + underside
    for side, E, flipn in ((0, L, 1), (1, R, -1)):
        Pt = np.concatenate([np.c_[E, z], np.c_[E, z - thick]]); tri = []
        for k in range(n - 1): tri += [[k, n + k, n + k + 1], [k, n + k + 1, k + 1]]
        tri = np.array(tri)
        if side == 0: tri = tri[:, [0, 2, 1]]
        B_struct.add(Pt, tri, con, None, 0)
    Pt = np.concatenate([np.c_[L, z - thick], np.c_[R, z - thick]]); tri = []
    for k in range(n - 1): tri += [[k, n + k + 1, n + k], [k, k + 1, n + k + 1]]
    B_struct.add(Pt, np.array(tri), con * 0.8, None, 0)
    # parapets
    for E, sgn in ((L, 1), (R, -1)):
        off = np.stack([(Cc[:, 0] - E[:, 0]), (Cc[:, 1] - E[:, 1])], 1); off /= (np.linalg.norm(off, axis=1, keepdims=True) + 1e-9)
        E2 = E + off * 0.25
        for pa, pb in ((E, E2),):
            Pt = np.concatenate([np.c_[E, z], np.c_[E, z + 1.0], np.c_[E2, z + 1.0]])
            tri = []
            for k in range(n - 1):
                tri += [[k, n + k, n + k + 1], [k, n + k + 1, k + 1]]                      # outer face
                tri += [[n + k, 2 * n + k, 2 * n + k + 1], [n + k, 2 * n + k + 1, n + k + 1]]  # top
            tri = np.array(tri)
            if sgn == 1: tri = tri[:, [0, 2, 1]]
            B_struct.add(Pt, tri, con, None, 0)
    # piers
    if s[-1] > 45 and kind == "road":
        npier = int(s[-1] // 35)
        for q in range(1, npier + 1):
            ss = s[-1] * q / (npier + 1); k = int(np.searchsorted(s, ss)); k = min(k, n - 1)
            cx, cy = Cc[k]; gz = TR.h(cx, cy, step)
            tx, ty = (Cc[min(k + 1, n - 1)] - Cc[max(k - 1, 0)]); dd = math.hypot(tx, ty) or 1; tx /= dd; ty /= dd
            hw = width / 2 - 0.8
            zt = z[k] - thick; zb = min(gz, TR.WLf[0, 0] if False else gz) - 0.5
            box_corners = [(cx - ty * hw - tx * 0.9, cy + tx * hw - ty * 0.9), (cx + ty * hw - tx * 0.9, cy - tx * hw - ty * 0.9),
                           (cx + ty * hw + tx * 0.9, cy - tx * hw + ty * 0.9), (cx - ty * hw + tx * 0.9, cy + tx * hw + ty * 0.9)]
            add_prism(B_struct, box_corners, min(zb, zt - 2), zt, con * 0.9, mat=0)

def add_prism(B, ring, zb, zt, col, mat=0):
    """Vertical-walled prism (walls only + top), ring is CCW 2D list."""
    ring = list(ring); n = len(ring)
    for k in range(n):
        a = ring[k]; b = ring[(k + 1) % n]
        P = [(a[0], a[1], zb), (b[0], b[1], zb), (b[0], b[1], zt), (a[0], a[1], zt)]
        B.add(P, [[0, 1, 2], [0, 2, 3]], col, None, mat)
    V, T = earcut_poly(Polygon(ring))
    P = np.c_[V, np.full(len(V), zt)]; B.add(P, flip_up(P, T.astype(np.int64)), col * 1.05, None, mat)

# ---------------------------------------------------------------- buildings
LANDMARK_IDS = {"r900378": "city_chambers", "r7279150": "finnieston_crane", "r21153720": "science_centre", "w222709055": "glasgow_tower", "r13348001": "riverside_museum",
                "r11951": "gilbert_scott", "w26605473": "kelvingrove", "w22925660": "central_station", "w10759864": "armadillo", "w188050166": "hydro",
                "w102152591": "cathedral", "w115356991": "tolbooth", "w4326895": "mitchell", "w225910565": "queen_street", "w58705089": "concert_hall"}
CENTRE = (1000.0, 100.0)
SAND = [((0.80, 0.66, 0.45), 3), ((0.78, 0.70, 0.55), 2), ((0.66, 0.34, 0.24), 3), ((0.72, 0.42, 0.33), 2), ((0.72, 0.69, 0.64), 2), ((0.42, 0.38, 0.34), 1), ((0.62, 0.50, 0.38), 2)]
HOUSE = [((0.60, 0.32, 0.25), 3), ((0.80, 0.75, 0.65), 3), ((0.72, 0.70, 0.66), 2), ((0.86, 0.84, 0.80), 2), ((0.68, 0.45, 0.34), 2), ((0.75, 0.62, 0.45), 1)]
INDUS = [((0.55, 0.58, 0.60), 3), ((0.42, 0.50, 0.55), 2), ((0.62, 0.62, 0.58), 2), ((0.45, 0.48, 0.42), 1), ((0.52, 0.30, 0.25), 1)]
GLASS = [((0.62, 0.74, 0.84), 3), ((0.50, 0.62, 0.72), 2), ((0.70, 0.78, 0.80), 1), ((0.40, 0.50, 0.58), 1)]
CONC = [((0.72, 0.71, 0.68), 3), ((0.64, 0.64, 0.62), 2), ((0.78, 0.74, 0.66), 1)]
SLATE = [((0.30, 0.33, 0.38), 3), ((0.26, 0.28, 0.32), 2), ((0.36, 0.34, 0.34), 1)]
TILE = [((0.50, 0.28, 0.22), 2), ((0.42, 0.25, 0.20), 2), ((0.32, 0.32, 0.34), 2)]
FLAT = [((0.28, 0.28, 0.29), 3), ((0.40, 0.40, 0.40), 2), ((0.34, 0.30, 0.27), 1)]
def pick(pal, r):
    tot = sum(w for c, w in pal); x = r * tot
    for c, w in pal:
        x -= w
        if x <= 0: return c
    return pal[-1][0]

HOUSEY = ("house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "cottage", "farm", "semi", "duplex")
INDY = ("industrial", "warehouse", "factory", "garage", "garages", "shed", "service", "storage_tank", "hangar", "carport", "parking", "greenhouse", "container", "kiosk", "barn", "stable", "transformer_tower", "static_caravan", "utility", "silo", "construction", "depot", "boathouse", "cabin", "hut")

def num(s):
    try: return float(str(s).replace("m", "").replace(",", ".").split(";")[0].strip())
    except Exception: return None

def prep_buildings(skip_ids):
    B = D["building"]; P = D["part"]
    items = []
    part_polys = []
    for g, t, i in P:
        for p in polys_of(g): part_polys.append((p, t, i))
    pg = [p for p, t, i in part_polys]
    tree = STRtree(pg) if pg else None
    for g, t, i in B:
        if i in skip_ids: continue
        for p in polys_of(g):
            if not p.is_valid or p.area < 10: continue
            cc = p.centroid
            if p.area < 130 and math.hypot(cc.x - CENTRE[0], cc.y - CENTRE[1]) > 2700 and "height" not in t: continue
            if p.area < 64 and (math.hypot(cc.x - CENTRE[0], cc.y - CENTRE[1]) > 1500 or p.area < 22) and i not in ("x",) and "height" not in t and "building:levels" not in t: continue
            if t.get("building") == "no": continue
            cov = 0
            if tree is not None:
                for k in tree.query(p):
                    q = pg[k]
                    if q.intersects(p): cov += q.intersection(p).area
            if cov > 0.55 * p.area: continue      # replaced by its parts
            items.append((p, t, i, None))
    for p, t, i in part_polys:
        if p.area >= 6 and p.is_valid: items.append((p, t, i, "part"))
    return items

def building_style(p, t, i, is_part):
    r = hash01(i, 1); r2 = hash01(i, 2); r3 = hash01(i, 3)
    b = t.get("building", "yes")
    if is_part: b = t.get("building:part") if t.get("building:part") not in (None, "yes") else "yes"
    c = p.centroid; area = p.area
    dist = math.hypot(c.x - CENTRE[0], c.y - CENTRE[1])
    central = dist < 2300
    lv = num(t.get("building:levels")); h = num(t.get("height")); mh = num(t.get("min_height"))
    if h is None: h = num(t.get("building:height"))
    kind = "tenement"
    if b in HOUSEY and not (b == "residential" and (area > 400 or (lv or 0) >= 4)): kind = "house"
    elif b in INDY: kind = "industrial"
    elif b == "roof": kind = "canopy"
    elif b in ("church", "cathedral", "chapel", "mosque", "temple", "synagogue"): kind = "church"
    elif b in ("office", "commercial", "hotel", "hospital", "university", "civic", "public", "government", "retail", "college", "train_station") and (area > 700 or (lv or 0) >= 6 or (h or 0) >= 20): kind = "modern"
    elif b in ("retail",) and area > 1500: kind = "industrial"
    elif b == "apartments" and ((lv or 0) >= 9 or (h or 0) >= 28): kind = "tower"
    if b == "yes" and area < 35 and h is None and lv is None: kind = "industrial"
    if kind in ("modern",) and (h is None and lv is None) and b in ("retail",): kind = "industrial"
    # height
    if h is None:
        if lv is not None:
            h = lv * (3.4 if kind in ("tenement", "tower", "modern") else 3.1) + (0.8 if kind in ("tenement", "modern", "tower") else 1.0)
            if kind == "house": h = lv * 2.9 + 0.8
        else:
            if kind == "house": h = 5.0 + 2.8 * (1 if r < 0.7 else 0)
            elif kind == "industrial": h = 3.0 if (b in ("garage", "garages", "shed", "carport", "kiosk", "hut", "cabin", "container") or area < 40) else (6.5 + 4 * r2)
            elif kind == "canopy": h = 4.0
            elif kind == "church": h = 11 + 3 * r
            elif kind == "modern": h = (20 + 16 * r) if central and b in ("office", "hotel", "commercial") else (11 + 6 * r)
            elif kind == "tower": h = 40 + 15 * r
            else: h = (13.5 + 5.5 * r2) if central and (area > 90) else (8.5 + 5 * r2)
            if b == "school": h = 8.5
            if b in ("hospital",): h = 20
            if b == "train_station": h = 9
    h = max(h, 2.4)
    return kind, h, (mh or 0.0), central, b

def rect_info(p):
    try:
        m = p.minimum_rotated_rectangle
        if m.geom_type != "Polygon": return None
        c = list(m.exterior.coords)[:4]
        e0 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e1 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
        l0 = math.hypot(*e0); l1 = math.hypot(*e1)
        ratio = p.area / max(m.area, 1e-6)
        if l0 >= l1: ang = math.atan2(e0[1], e0[0]); L, Wd = l0, l1
        else: ang = math.atan2(e1[1], e1[0]); L, Wd = l1, l0
        return ratio, ang, L, Wd, m.centroid.x, m.centroid.y
    except Exception: return None

def building_geom(p, t, i, is_part, step_fn):
    """-> list of (slot, P, T, col, uv)"""
    kind, h, mh, central, b = building_style(p, t, i, is_part)
    r = hash01(i, 11)
    # footprint prepare
    p = shapely.simplify(p, 0.7) if p.area > 60 else p
    p = shapely.geometry.polygon.orient(p, 1.0)
    pts = np.asarray(p.exterior.coords)
    sx = np.asarray(p.exterior.coords)[:, 0]; sy = np.asarray(p.exterior.coords)[:, 1]
    # ground levels (fine terrain) for base
    samp = [(c.x, c.y) for c in [p.centroid]] + [(x, y) for x, y in pts[:-1]]
    for k in range(len(pts) - 1):
        samp.append(((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2))
    sa = np.array(samp); gz = TR.h(sa[:, 0], sa[:, 1], 1)
    cstep = step_fn(p.centroid.x, p.centroid.y)
    gmin = float(gz.min()) - (0.35 if cstep == 1 else 0.9)
    # tall buildings on slopes: top relative to min ground
    zb = gmin if mh == 0 else float(gz.mean()) + mh
    ztop = float(gz.min()) + h if mh == 0 else float(gz.mean()) + h
    if ztop - zb < 1.5: ztop = zb + 2.0
    # roof selection
    rs = t.get("roof:shape"); rinfo = rect_info(p)
    roof = "flat"
    nverts = len(pts) - 1
    rect_ok = rinfo is not None and rinfo[0] > 0.86 and len(p.interiors) == 0 and p.area < 1400 and nverts <= 14
    rh = num(t.get("roof:height"))
    if kind == "canopy": roof = "slab"
    elif rect_ok and rs in ("gabled", "double_saltbox", "gambrel", "saltbox"): roof = "gable"
    elif rect_ok and rs in ("hipped", "pyramidal", "half-hipped", "dome"): roof = "hip"
    elif rect_ok and rs in ("flat", "skillion", "round") and rs == "flat": roof = "flat"
    elif rect_ok and rs is None:
        if kind == "house" or kind == "church": roof = "gable" if (r < 0.8) else "hip"
        elif kind == "tenement" and central and (ztop - zb) < 24: roof = "gable"
        elif kind == "tenement" and (ztop - zb) < 16: roof = "gable" if r < 0.6 else "hip"
        elif kind == "industrial" and p.area > 150: roof = "gable" if r < 0.5 else "flat"
    out = []
    # --- wall colours
    if kind == "house": wc = pick(HOUSE, r); slot = "stone"
    elif kind == "tenement": wc = pick(SAND, r) if (central or r < 0.5) else pick(HOUSE, r); slot = "stone"
    elif kind == "modern": wc = pick(GLASS, r); slot = "glass"
    elif kind == "tower": wc = pick(CONC, r); slot = "stone"
    elif kind == "church": wc = pick(SAND, r); slot = "stone"
    elif kind == "canopy": wc = (0.5, 0.5, 0.5); slot = "plain"
    else: wc = pick(INDUS, r); slot = "plain"
    jitter = 0.94 + 0.12 * hash01(i, 5)
    wc = np.clip(np.array(wc) * jitter, 0, 1)
    top_c = lin(wc); bot_c = lin(wc * 0.74)
    wall_h = ztop - zb
    ridge_extra = 0.0
    # --- roof geometry (planar pieces)
    rp = []   # list of (P (n,3), T)
    if roof in ("flat", "slab"):
        V, T = earcut_poly(p)
        P = np.c_[V, np.full(len(V), ztop)]; rp.append((P, flip_up(P, T.astype(np.int64))))
        if roof == "slab":
            P2 = np.c_[V, np.full(len(V), ztop - 0.35)]; rp.append((P2, flip_up(P2, T.astype(np.int64))[:, [0, 2, 1]]))
        if kind != "canopy" and p.area > 60:       # low parapet rim: tiny inward lip (adds a hint of depth) - skipped for budget
            pass
    elif roof == "gable" or roof == "hip":
        ratio, ang, L, Wd, rcx, rcy = rinfo
        ca, sa_ = math.cos(ang), math.sin(ang)
        ph = min(0.38 * Wd, 5.5) if kind != "tenement" else min(0.22 * Wd, 3.2)
        if kind == "industrial": ph = min(0.18 * Wd, 3.0)
        if kind == "church": ph = min(0.55 * Wd, 7.0)
        if rh: ph = rh
        # local coords: u along ridge, v across
        def to_uv(x, y): dx, dy = x - rcx, y - rcy; return dx * ca + dy * sa_, -dx * sa_ + dy * ca
        def from_uv(u, v): return rcx + u * ca - v * sa_, rcy + u * sa_ + v * ca
        halfL, halfW = L / 2, Wd / 2
        if roof == "gable":
            # split polygon along ridge line (v=0) into two halves and tilt each
            big = 2000.0
            for sgn in (1, -1):
                hb = Polygon([from_uv(-big, 0), from_uv(big, 0), from_uv(big, sgn * big), from_uv(-big, sgn * big)])
                part = p.intersection(hb)
                for q in polys_of(part):
                    if q.area < 0.2: continue
                    V, T = earcut_poly(q)
                    uu = np.array([to_uv(x, y) for x, y in V]); vv = np.abs(uu[:, 1])
                    z = ztop + ph * (1 - np.minimum(vv / halfW, 1.0))
                    P = np.c_[V, z]; rp.append((P, flip_up(P, T.astype(np.int64))))
            # gable end triangles are covered by walls; raise walls handled by wall_top fn below
            gable = True
        else:
            # hip: use planes: z = ztop + ph*min(1, (halfW - |v|)/halfW .. ) combined with end hips using min of distances
            # build via fan triangulation from 4 roof planes over polygon pieces split along diagonals
            ridge_half = max(halfL - halfW, 0.0)
            def zfun(u, v):
                dv = (halfW - np.abs(v)) / halfW
                du = (halfL - np.abs(u)) / halfW
                return ztop + ph * np.clip(np.minimum(dv, du if halfL > halfW else dv), 0, 1)
            # subdivide footprint with a grid of Steiner points via triangle for exactness
            r_ = tri_polygon(p, max(4.0, p.area / 9.0), 4.0)
            if r_ is None:
                V, T = earcut_poly(p); z = np.full(len(V), ztop)
            else:
                V, T = r_; T = np.asarray(T, np.int64)
                uu = np.array([to_uv(x, y) for x, y in V]); z = zfun(uu[:, 0], uu[:, 1])
            P = np.c_[V, z]; rp.append((P, flip_up(P, np.asarray(T, np.int64))))
            gable = False
        ridge_extra = ph
    # --- roof colours
    rc_pal = TILE if (kind == "house" and r > 0.45) else (SLATE if kind in ("tenement", "church", "house") else FLAT)
    if kind == "industrial": rc_pal = INDUS if r > 0.3 else FLAT
    if kind == "modern" or kind == "tower": rc_pal = FLAT
    rc = lin(np.clip(np.array(pick(rc_pal, hash01(i, 7))) * (0.9 + 0.2 * hash01(i, 8)), 0, 1))
    for P, T in rp:
        out.append(("roof", P, T, np.tile(rc, (len(P), 1)), None))
    # --- walls
    rings = [np.asarray(p.exterior.coords)] + [np.asarray(q.coords) for q in p.interiors if len(q.coords) > 3]
    WP = []; WT = []; WC = []; WU = []; off = 0
    bay = 3.4; fl = 3.5 if kind in ("tenement", "church", "tower") else 3.4
    nfloor = max(1, int(round(wall_h / fl)))
    for ring in rings:
        for k in range(len(ring) - 1):
            a = ring[k]; bq = ring[k + 1]
            el = math.hypot(bq[0] - a[0], bq[1] - a[1])
            if el < 0.25: continue
            top_a = ztop; top_b = ztop
            # gable: lift the wall tops at gable ends to ridge height; approximated by gable wall tris below
            P4 = [(a[0], a[1], zb), (bq[0], bq[1], zb), (bq[0], bq[1], top_b), (a[0], a[1], top_a)]
            nb = max(1, int(round(el / bay)))
            if slot == "plain":
                uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
            elif slot == "glass":
                nbg = max(1, int(round(el / 3.0))); nfg = max(1, int(round(wall_h / 3.6)))
                uv = [(0, 0), (nbg, 0), (nbg, nfg), (0, nfg)]
            else:
                uv = [(0, 0), (nb, 0), (nb, nfloor), (0, nfloor)]
            WP += P4; WU += uv
            WC += [bot_c, bot_c, top_c, top_c]
            WT += [(off, off + 1, off + 2), (off, off + 2, off + 3)]; off += 4
    if WP:
        out.append((slot, np.array(WP, np.float32), np.array(WT, np.int64), np.array(WC, np.float32), np.array(WU, np.float32)))
    # gable end triangles (so the roof closes) - for gable roofs add wall triangles at short ends
    if roof == "gable":
        ratio, ang, L, Wd, rcx, rcy = rinfo; ca, sa_ = math.cos(ang), math.sin(ang)
        halfL = L / 2
        for sgn in (1, -1):
            # end wall centre line at u = sgn*halfL; triangle from (u,-halfW) to (u,+halfW) up to ridge
            ex = rcx + sgn * halfL * ca; ey = rcy + sgn * halfL * sa_
            for_v = Wd / 2
            p1 = (ex - (-sa_) * for_v * -1 * 1, ey)  # placeholder (replaced below)
            ux, uy = ca, sa_; vx, vy = -sa_, ca
            A = (ex - vx * for_v, ey - vy * for_v); Bp = (ex + vx * for_v, ey + vy * for_v); Cc = (ex, ey)
            # clip to polygon roughly: only emit when the end is close to footprint boundary
            if p.buffer(0.8).contains(Point(A)) or True:
                tri = [(A[0], A[1], ztop), (Bp[0], Bp[1], ztop), (Cc[0], Cc[1], ztop + ridge_extra)]
                # orient outward: normal should point along sgn*u
                P = np.array(tri, np.float32)
                n = np.cross(P[1] - P[0], P[2] - P[0]); dirn = np.array([ux * sgn, uy * sgn, 0])
                T = np.array([[0, 1, 2]]) if np.dot(n, dirn) > 0 else np.array([[0, 2, 1]])
                out.append(("roof", P, T, np.tile(top_c, (3, 1)) * 1.0, None))
    return out, kind

# ---------------------------------------------------------------- trees
TREE_MESHES = {}
def tree_mesh(kind):
    if kind in TREE_MESHES: return TREE_MESHES[kind]
    bm = bmesh.new()
    me = bpy.data.meshes.new("green_tree_" + kind)
    B = Buf()
    def lcol(c): return lin(c)
    trunk = lcol((0.30, 0.22, 0.15))
    # trunk: 5-sided prism
    n = 5; r0 = 0.22; hT = 2.4 if kind != "conifer" else 1.2
    ring = [(r0 * math.cos(2 * math.pi * k / n), r0 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    for k in range(n):
        a = ring[k]; b = ring[(k + 1) % n]
        B.add([(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], hT), (a[0], a[1], hT)], [[0, 1, 2], [0, 2, 3]], trunk)
    if kind == "conifer":
        cols = [(0.13, 0.30, 0.16), (0.16, 0.36, 0.20)]
        for lvl, (z0, rad, ht) in enumerate([(1.0, 1.9, 3.6), (3.2, 1.45, 3.2), (5.2, 0.95, 3.0)]):
            m = 7; ring = [(rad * math.cos(2 * math.pi * k / m), rad * math.sin(2 * math.pi * k / m)) for k in range(m)]
            for k in range(m):
                a = ring[k]; b = ring[(k + 1) % m]
                B.add([(a[0], a[1], z0), (b[0], b[1], z0), (0, 0, z0 + ht)], [[0, 1, 2]], [lcol(cols[lvl % 2])] * 3 if False else np.array([lcol(cols[lvl % 2]) * 0.8, lcol(cols[lvl % 2]) * 0.8, lcol(cols[lvl % 2]) * 1.15]))
    else:
        base = {"a": (0.28, 0.50, 0.22), "b": (0.45, 0.55, 0.24), "c": (0.20, 0.42, 0.20)}.get(kind, (0.28, 0.50, 0.22))
        # icosahedron canopy centred at z=4.6 radius ~2.8 (squashed)
        t_ = (1 + 5 ** 0.5) / 2
        V = np.array([(-1, t_, 0), (1, t_, 0), (-1, -t_, 0), (1, -t_, 0), (0, -1, t_), (0, 1, t_), (0, -1, -t_), (0, 1, -t_), (t_, 0, -1), (t_, 0, 1), (-t_, 0, -1), (-t_, 0, 1)], np.float64)
        V /= np.linalg.norm(V, axis=1, keepdims=True)
        F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
             (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
        rad = np.array([2.7, 2.7, 2.5]) if kind == "a" else (np.array([2.2, 2.2, 3.0]) if kind == "c" else np.array([3.1, 3.1, 2.4]))
        cz = 4.4 if kind != "c" else 5.0
        for f in F:
            P = np.array([V[q] * rad + np.array([0, 0, cz]) for q in f], np.float32)
            shade = np.array([0.82 + 0.28 * ((P[q][2] - (cz - rad[2])) / (2 * rad[2])) for q in range(3)])
            c = np.array([lcol(np.clip(np.array(base) * s, 0, 1)) for s in shade])
            B.add(P, [[0, 1, 2]], c)
    P, C, U, T, M = B.arrays()
    # make faces outward-facing: for canopy compute by centroid test
    TREE_MESHES[kind] = (P, C, T)
    return TREE_MESHES[kind]

def make_tree_blender_mesh(kind):
    P, C, T = tree_mesh(kind)
    # fix winding so that normals face away from the tree axis for canopy / trunk (quick heuristic)
    Tn = T.copy()
    cen = P.mean(axis=0)
    for k, tri in enumerate(Tn):
        a, b, c = P[tri]; n = np.cross(b - a, c - a); mid = (a + b + c) / 3
        ref = mid - np.array([0, 0, mid[2] if mid[2] < 2.4 else 4.4]) if True else mid
        if kind == "conifer": ref = mid - np.array([0, 0, max(0.0, mid[2] - 2.0)])
        if np.dot(n, ref) < 0: Tn[k] = tri[[0, 2, 1]]
    Bf = Buf(); Bf.add(P, Tn, C)
    return Bf

# ---------------------------------------------------------------- landmarks hook
LM = None
if not NO_LM:
    import city_landmarks
    LM = city_landmarks


# ================================================================= MAIN
LMS = LM.build(TR, D, log) if LM else []
skip_ids = set(LANDMARK_IDS.keys())
for l in LMS: skip_ids |= l["skip"]
ITEMS = prep_buildings(skip_ids)
log("building items", len(ITEMS))
by_chunk = {}
for it in ITEMS:
    c = it[0].centroid; by_chunk.setdefault(chunk_of(c.x, c.y), []).append(it)
lm_chunk = {}
for l in LMS: lm_chunk.setdefault(chunk_of(l["cx"], l["cy"]), []).append(l)
tree_by_chunk = {}
for g, t, i in D["tree"]:
    tree_by_chunk.setdefault(chunk_of(g.x, g.y), []).append((g.x, g.y, "a" if hash01(i, 1) < 0.5 else ("b" if hash01(i, 1) < 0.8 else "c"), 0.8 + 0.6 * hash01(i, 2), hash01(i, 3) * 6.28))
import city_bridges
CLUSTERS = city_bridges.make_clusters(D, W, road_width)
log("bridge clusters", len(CLUSTERS), [(c["name"], c["kind"], round(c["poly"].area)) for c in CLUSTERS if c["name"]])
bridge_by_chunk = {}
for c in CLUSTERS:
    m = c["poly"].centroid; bridge_by_chunk.setdefault(chunk_of(m.x, m.y), []).append(c)
rail_by_chunk = {}
for g, t, i in W["rails"]:
    m = g.interpolate(0.5, normalized=True); rail_by_chunk.setdefault(chunk_of(m.x, m.y), []).append((g, t, i))
TMESH = {}
def tree_obj_mesh(kind):
    if kind not in TMESH:
        Bf = make_tree_blender_mesh(kind); P, C, U, T, M = Bf.arrays()
        me = bpy.data.meshes.new("green_tree_" + kind)
        me.vertices.add(len(P)); me.vertices.foreach_set("co", P.ravel()); me.loops.add(len(T) * 3); me.polygons.add(len(T))
        me.loops.foreach_set("vertex_index", T.ravel().astype(np.int32)); me.polygons.foreach_set("loop_start", (np.arange(len(T)) * 3).astype(np.int32))
        me.polygons.foreach_set("loop_total", np.full(len(T), 3, np.int32)); me.polygons.foreach_set("use_smooth", np.zeros(len(T), bool)); me.update()
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT"); ca.data.foreach_set("color", C.ravel()); me.color_attributes.active_color = ca
        me.materials.append(MATS["mat_tree"]); TMESH[kind] = me
    return TMESH[kind]

def procedural_trees(ci, cj, bounds):
    rng = random.Random(ci * 1000 + cj); res = []
    x0, y0, x1, y1 = bounds
    for kind, dens in (("wood", 1 / 170.0), ("scrub", 1 / 600.0), ("park", 1 / 1500.0), ("cemetery", 1 / 1000.0), ("garden", 1 / 3000.0), ("grass", 1 / 6000.0)):
        g = W["green"].get(kind)
        if g is None or g.is_empty: continue
        cg = shapely.clip_by_rect(g, x0, y0, x1, y1)
        if cg.is_empty: continue
        n = int(cg.area * dens)
        if n <= 0: continue
        n = min(n, 1800)
        xs = np.array([rng.uniform(x0, x1) for _ in range(n * 3)]); ys = np.array([rng.uniform(y0, y1) for _ in range(n * 3)])
        ok = shapely.contains_xy(cg, xs, ys)
        xs, ys = xs[ok][:n], ys[ok][:n]
        if len(xs):
            ok2 = ~shapely.contains_xy(W["bld_union"], xs, ys) & ~shapely.contains_xy(W["road_all"], xs, ys)
            xs, ys = xs[ok2], ys[ok2]
        for x, y in zip(xs, ys):
            k = "conifer" if (kind == "wood" and rng.random() < 0.3) else rng.choice(["a", "b", "c"])
            res.append((float(x), float(y), k, 0.7 + 0.8 * rng.random(), rng.random() * 6.28))
    return res

BCOL = {"A1": lin((0.15, 0.15, 0.16)), "A2": lin((0.19, 0.19, 0.20)), "B": lin((0.23, 0.23, 0.24)), "C": lin((0.29, 0.28, 0.27))}
RAILC = lin((0.55, 0.55, 0.58)); BALC = lin((0.30, 0.29, 0.28)); PAVC = lin((0.55, 0.53, 0.50)); PARKC = lin((0.36, 0.36, 0.37))
WATC = lin((0.20, 0.38, 0.46))
manifest = []
exp_args = dict(export_format="GLB", export_vertex_color="ACTIVE", export_apply=False, export_yup=True, export_texcoords=True, export_normals=True, export_extras=False, export_cameras=False, export_lights=False)
stats = {"tri": 0}

def build_chunk(ci, cj):
    b = chunk_bounds(ci, cj); x0, y0, x1, y1 = b
    fine = is_fine(ci, cj); step = 1 if fine else 2
    coll = bpy.data.collections.new("chunk_%d_%d" % (ci, cj)); bpy.context.scene.collection.children.link(coll)
    objs = []; tris = {}; made = []
    def finish(name, ob, B, layer):
        if ob is not None: tris[layer] = tris.get(layer, 0) + B.tris(); made.append(ob)
    # terrain
    TB, N, st = terrain_chunk(ci, cj)
    finish("terrain", make_object("terrain_%d_%d" % (ci, cj), TB, ["terrain"], coll, N), TB, "terrain")
    # buildings
    BB = Buf(); slotmap = {"stone": 0, "glass": 1, "plain": 2, "roof": 3}
    sfn = lambda x, y: 1 if is_fine(*chunk_of(x, y)) else 2
    for p, t, i, isp in by_chunk.get((ci, cj), []):
        try: parts, kind = building_geom(p, t, i, isp, sfn)
        except Exception as ex:
            log("bld fail", i, ex); continue
        for slot, P, T, C, U in parts:
            BB.add(P, T, C, U, slotmap[slot])
    finish("buildings", make_object("buildings_%d_%d" % (ci, cj), BB, ["stone", "glass", "plain", "roof"], coll), BB, "buildings")
    # roads
    RB = Buf(); clip = lambda g: shapely.clip_by_rect(g, x0, y0, x1, y1)
    for k, zo in (("A1", 0.30), ("A2", 0.30), ("B", 0.30), ("C", 0.30)):
        g = clip(W["road_" + k])
        if not g.is_empty:
            B2 = ground_poly_mesh([g], b, 500, zo, step, BCOL[k], 0, 28.0); 
            if not B2.empty(): RB.add(*B2.arrays()[0:1], B2.arrays()[3], B2.arrays()[1], None, 0)
    g = clip(W["pave"])
    if not g.is_empty:
        B2 = ground_poly_mesh([g], b, 900, 0.42, step, PAVC, 1, 30.0)
        if not B2.empty(): P, C, U, T, M = B2.arrays(); RB.add(P, T, C, None, 1)
    g = clip(W["parking"])
    if not g.is_empty:
        B2 = ground_poly_mesh([g], b, 900, 0.28, step, PARKC, 0, 30.0)
        if not B2.empty(): P, C, U, T, M = B2.arrays(); RB.add(P, T, C, None, 0)
    RLd = Buf(); RLr = Buf()
    for c in bridge_by_chunk.get((ci, cj), []):
        Bd = Buf(); Bs = Buf()
        try: city_bridges.build_cluster(c, TR, W, step, Bd, RLd, Bs, RLr)
        except Exception as ex:
            import traceback; log("bridge fail", c.get("name"), ex); traceback.print_exc(); continue
        for BBx, mi in ((Bd, 0), (Bs, 2)):
            if not BBx.empty(): P, C, U, T, M = BBx.arrays(); RB.add(P, T, C, None, mi)
    # rail bridges go to the rail buffer below
    finish("roads", make_object("roads_%d_%d" % (ci, cj), RB, ["road", "pave", "bridge"], coll), RB, "roads")
    # rail
    RL = Buf()
    g = clip(W["ballast"])
    if not g.is_empty:
        B2 = ground_poly_mesh([g], b, 500, 0.26, step, BALC, 0, 20.0)
        if not B2.empty(): P, C, U, T, M = B2.arrays(); RL.add(P, T, C, None, 0)
    for g, t, i in rail_by_chunk.get((ci, cj), []):
        rb = ribbon(np.asarray(g.coords), 1.5, 9.0)
        if rb is None: continue
        Lf, Rf, Cc, s = rb; n = len(s)
        z = TR.h(Cc[:, 0], Cc[:, 1], step) + 0.38
        for E in (Lf, Rf):
            d = Cc - E; d /= (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9); E2 = E + d * 0.16
            Pq = np.concatenate([np.c_[E, z], np.c_[E2, z]]); tri = []
            for k in range(n - 1): tri += [[k, n + k, n + k + 1], [k, n + k + 1, k + 1]]
            RL.add(Pq, flip_up(Pq, np.array(tri)), RAILC, None, 0)
    for BBx in (RLd, RLr):
        if not BBx.empty(): P, C, U, T, M = BBx.arrays(); RL.add(P, T, C, None, 0)
    finish("rail", make_object("rail_%d_%d" % (ci, cj), RL, ["rail"], coll), RL, "rail")
    # water
    WB = Buf(); g = clip(W["water_union"])
    if not g.is_empty:
        for p in polys_of(g):
            r = tri_polygon(p, 500, 25.0, b)
            if r is None: continue
            V, T = r; z = TR.wl(V[:, 0], V[:, 1]) - 0.05
            P = np.stack([V[:, 0], V[:, 1], z], 1); WB.add(P, flip_up(P, np.asarray(T, np.int64)), WATC, None, 0)
    finish("water", make_object("water_%d_%d" % (ci, cj), WB, ["water"], coll), WB, "water")
    # green
    GB = Buf()
    for k, G in W["green"].items():
        g = clip(G)
        if g.is_empty: continue
        B2 = ground_poly_mesh([g], b, 500, GREEN_Z[k], step, lin(GREEN_COL[k]), 0, 16.0)
        if not B2.empty(): P, C, U, T, M = B2.arrays(); GB.add(P, T, C, None, 0)
    finish("green", make_object("green_%d_%d" % (ci, cj), GB, ["green"], coll), GB, "green")
    # trees
    trs = [t for t in tree_by_chunk.get((ci, cj), []) if x0 <= t[0] < x1 and y0 <= t[1] < y1] + procedural_trees(ci, cj, b)
    ntree = 0
    for k, (x, y, kind, sc, rot) in enumerate(trs):
        ob = bpy.data.objects.new("green_tree_%s.%d" % (kind, k), tree_obj_mesh(kind)); ob.location = (x, y, float(TR.h(x, y, step)) - 0.1)
        ob.rotation_euler = (0, 0, rot); ob.scale = (sc, sc, sc * (0.9 + 0.3 * ((k * 37) % 10) / 10)); coll.objects.link(ob); made.append(ob); ntree += 1
    tris["trees"] = ntree
    # landmarks
    for l in lm_chunk.get((ci, cj), []):
        ob = make_object("landmarks_" + l["name"], l["B"], l["slots"], coll)
        if ob is not None: made.append(ob); tris["landmarks"] = tris.get("landmarks", 0) + l["B"].tris()
    fn = "city_%d_%d.glb" % (ci, cj)
    bpy.ops.export_scene.gltf(filepath=os.path.join(RAW, fn), collection=coll.name, **exp_args)
    # cleanup
    for ob in made:
        me = ob.data; bpy.data.objects.remove(ob)
        if me.users == 0 and not me.name.startswith("green_tree_"): bpy.data.meshes.remove(me)
    bpy.data.collections.remove(coll)
    x_min, x_max = x0, x1
    manifest.append({"file": "city/" + fn if False else fn, "ci": ci, "cj": cj, "minX": x0, "maxX": x1, "minZ": -y1, "maxZ": -y0, "tris": int(sum(v for k, v in tris.items() if k != "trees")), "trees": tris["trees"], "layers": tris})

todo = [(i, j) for j in range(NCZ) for i in range(NCX) if ONLY is None or (i, j) in ONLY]
for n, (ci, cj) in enumerate(todo):
    build_chunk(ci, cj)
    if n % 6 == 0: log("chunk", ci, cj, "%d/%d" % (n + 1, len(todo)), manifest[-1]["tris"])
json.dump({"chunks": manifest, "chunk": CH, "origin": {"minX": CX0, "minZ": CZ0}}, open(os.path.join(RAW, "manifest_raw.json"), "w"))
log("done")
