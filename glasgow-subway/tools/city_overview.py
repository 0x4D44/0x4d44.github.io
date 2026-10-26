"""Low-poly whole-area overview GLB (raw, pre-quantise). usage: city_overview.py WORKDIR OUT.glb"""
import sys, os, pickle, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from shapely.ops import unary_union
from shapely.geometry import box
from city_lib import *
work, out = sys.argv[1], sys.argv[2]
TR = Terr(work); D = pickle.load(open(os.path.join(work, "osm.pkl"), "rb"))
bpy.ops.wm.read_factory_settings(use_empty=True)
def mk(name, B, mats):
    P, C, U, T, M = B.arrays(); me = bpy.data.meshes.new(name)
    me.vertices.add(len(P)); me.vertices.foreach_set("co", P.ravel()); me.loops.add(len(T) * 3); me.polygons.add(len(T))
    me.loops.foreach_set("vertex_index", T.ravel().astype(np.int32)); me.polygons.foreach_set("loop_start", (np.arange(len(T)) * 3).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(T), 3, np.int32)); me.polygons.foreach_set("use_smooth", np.ones(len(T), bool)); me.update()
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT"); ca.data.foreach_set("color", C.ravel()); me.color_attributes.active_color = ca
    m = bpy.data.materials.new(mats); m.use_nodes = True; m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95; me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
st = 12
ii = np.arange(0, TR.nx, st); jj = np.arange(0, TR.nz, st)
Hs = TR.H[np.ix_(jj, ii)]; XX, YY = np.meshgrid(TR.minX + ii * TR.C, -(TR.minZ + jj * TR.C))
P = np.stack([XX.ravel(), YY.ravel(), Hs.ravel() - 0.5], 1); ny, nx = Hs.shape; idx = np.arange(ny * nx).reshape(ny, nx)
a = idx[:-1, :-1].ravel(); b = idx[:-1, 1:].ravel(); c = idx[1:, 1:].ravel(); d = idx[1:, :-1].ravel()
T = flip_up(P, np.concatenate([np.stack([a, d, c], 1), np.stack([a, c, b], 1)]).astype(np.int64))
h = Hs.ravel(); t = np.clip((h - 5) / 60, 0, 1)[:, None]
col = np.concatenate([lin((0.45, 0.52, 0.34))[None, :3] * (1 - t) + lin((0.52, 0.50, 0.44))[None, :3] * t, np.ones((len(h), 1))], 1).astype(np.float32)
B = Buf(); B.add(P, T, col); mk("terrain_overview", B, "mat_terrain")
Bw = Buf(); wu = unary_union([g for g, tt, i in D["water"]])
for p in polys_of(wu):
    r = tri_polygon(p, 20000, 120.0)
    if r is None: continue
    V, Tt = r; Pw = np.c_[V, np.full(len(V), 2.9)]; Bw.add(Pw, flip_up(Pw, np.asarray(Tt, np.int64)), lin((0.2, 0.38, 0.46)))
mk("water_overview", Bw, "mat_water")
bl = unary_union([g for g, tt, i in D["building"] if g.area > 30]).buffer(16).buffer(-12).simplify(14)
Bb = Buf()
for p in polys_of(bl):
    if p.area < 2500: continue
    r = tri_polygon(p, 1e9, 1e9); 
    z = float(TR.h(p.centroid.x, p.centroid.y, 2))
    ring = list(p.exterior.coords)
    for k in range(len(ring) - 1):
        a_, b_ = ring[k], ring[k + 1]
        Bb.add([(a_[0], a_[1], z - 1), (b_[0], b_[1], z - 1), (b_[0], b_[1], z + 14), (a_[0], a_[1], z + 14)], [[0, 1, 2], [0, 2, 3]], lin((0.62, 0.52, 0.42)))
    V, Tt = earcut_poly(p); Pq = np.c_[V, np.full(len(V), z + 14)]; Bb.add(Pq, flip_up(Pq, Tt.astype(np.int64)), lin((0.36, 0.36, 0.38)))
mk("buildings_overview", Bb, "mat_bld")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_vertex_color="ACTIVE", export_yup=True, export_texcoords=False)
