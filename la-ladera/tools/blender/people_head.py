"""CC0 MakeHuman-derived heads fitted to the existing La Ladera people contract.

No MPFB add-on or network access is needed. append_head adds geometry through the
existing PB.V/PB.F interface; every vertex retains the existing 'head' part.
The returned skull-envelope helpers fit the existing hair, hats and facial props.
Source assets and the offline preparation recipe live beside this module.
"""
from functools import lru_cache
from collections import Counter, deque
from pathlib import Path
import gzip
import json
import math
import random
import zlib

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

DATA = Path(__file__).resolve().parent / "vendor/makehuman_head.json.gz"
HF = (0.0, 0.04, 0.12, 0.26, 0.46, 0.66, 0.82, 0.93, 1.0)


@lru_cache(maxsize=1)
def source_data():
    with gzip.open(DATA, "rt", encoding="utf8") as stream:
        data = json.load(stream)
    if data.get("schema") != 1 or data.get("license") != "CC0-1.0":
        raise ValueError("Unsupported or unlicensed MakeHuman head data")
    count = len(data["vertices"]) // 3
    if any(len(t) != count * 3 for t in data["targets"].values()):
        raise ValueError("Head morph target size differs from the source mesh")
    return data


def _shape_value(pd, name, rng, spread=0.06):
    return max(0.80, min(1.20, float(pd.get(name, 1.0 + rng.uniform(-spread, spread)))))


@lru_cache(maxsize=1)
def _neck_rings():
    """The open neck cut and two adjacent rings, identified from source topology.

    The pinned head shell has one open boundary: the cut below the jaw. Its
    morphed vertices do not share a horizontal plane, so a height-only mask
    would leave small flared corners. Eyeballs are separate from this shell.
    """
    edges = Counter()
    adjacent = {}
    for face in source_data()["faces"]:
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))] += 1
            adjacent.setdefault(a, set()).add(b)
            adjacent.setdefault(b, set()).add(a)
    boundary = {i for edge, count in edges.items() if count == 1 for i in edge}
    if not boundary:
        raise ValueError("MakeHuman head has no open neck boundary")
    distance = {i: 0 for i in boundary}
    queue = deque(sorted(boundary))
    while queue:
        i = queue.popleft()
        if distance[i] == 2:
            continue
        for neighbor in sorted(adjacent[i]):
            if neighbor not in distance:
                distance[neighbor] = distance[i] + 1
                queue.append(neighbor)
    return tuple(sorted(distance.items()))


def _taper_neck(vertices, P, hy0):
    """Hide the source neck stump inside the existing procedural neck column.

    The old-age morphs lift the back of the open cut above the chin. Pulling
    that rim inward without lowering it leaves diagonal jaw-edge wedges. Keep
    the complete cut below the chin and inside the neck, then ease the two
    adjacent rows into it. Those rows also contain the back of the neck; they
    must not form a second, flared collar outside the procedural column. A
    front-facing mask preserves the chin and visible lower-jaw silhouette.
    """
    k = P["k"]
    rx, ry, cy = 0.042 * k * 0.97, 0.040 * k * 0.97, hy0 - 0.015 * k
    for i, ring in _neck_rings():
        if ring == 0:
            vertices[i, 2] = min(vertices[i, 2], P["chin"] - 0.045 * P["hh"])
        x, y = vertices[i, 0], vertices[i, 1] - cy
        radius = math.hypot(x / rx, y / ry)
        if radius <= 1.0:
            continue
        blend = 1.0
        if ring:
            # Old morphs retain a broad neck stump behind the jaw even when
            # their cut rim is hidden. Contract that tissue continuously into
            # the existing neck, but never pull the prominent chin backwards.
            height = (vertices[i, 2] - P["chin"]) / P["hh"]
            front = (vertices[i, 1] - hy0) / P["hh"]
            t = min(1.0, max(0.0, (0.10 - height) / 0.10))
            back = min(1.0, max(0.0, (0.27 - front) / 0.19))
            blend = (0.90, 0.65)[ring - 1] * t * t * (3.0 - 2.0 * t) * back * back * (3.0 - 2.0 * back)
        scale = 1.0 - blend * (1.0 - 1.0 / radius)
        vertices[i, 0] = x * scale
        vertices[i, 1] = cy + y * scale


def head_vertices(P, pd, hy0=0.0):
    """Apply authored source-morph weights and individual variation, then fit metres.

    head_mix lists the source's three morph families in the order African, Asian,
    Caucasian. Those historic source labels are not a taxonomy of the residents:
    no weights are inferred from skin colour or a person's heritage. Individual
    width/depth/spacing parameters remain independent of those weights.
    """
    data = source_data()
    v = np.asarray(data["vertices"], dtype=np.float64).reshape(-1, 3) / data["coordinateScale"]
    rng = random.Random(zlib.crc32((pd["id"] + ":head").encode()))
    weights = np.asarray(pd.get("head_mix", [rng.uniform(0.18, 0.65) for _ in range(3)]), dtype=float)
    if weights.shape != (3,) or not np.isfinite(weights).all() or (weights < 0).any() or weights.sum() <= 0:
        raise ValueError(f"{pd['id']}: head_mix must be three finite nonnegative weights")
    weights /= weights.sum()
    sex = "female" if P["fem"] else "male"
    if P["child"]:
        ages = {"child": 1.0}
    elif pd["kind"] == "elder":
        ages = {"old": 0.87, "young": 0.13}
    elif pd["kind"] == "teen":
        ages = {"child": 0.16, "young": 0.84}
    else:
        old = max(0.0, min(0.75, float(pd.get("face_age", max(0, pd.get("age", 25) - 25) / 65))))
        ages = {"young": 1.0 - old, "old": old}
    for region, weight in zip(("african", "asian", "caucasian"), weights):
        for age, age_weight in ages.items():
            if weight * age_weight:
                delta = np.asarray(data["targets"][f"{region}-{sex}-{age}"], dtype=float).reshape(-1, 3)
                v += delta * (weight * age_weight / data["deltaScale"])
    landmarks = data["landmarks"]
    chin = v[landmarks["chin"][0], 1]
    crown = v[landmarks["crown"][0], 1]
    height = crown - chin
    if not 1.0 < height < 4.0:
        raise ValueError(f"{pd['id']}: impossible source head height {height}")
    f = (v[:, 1] - chin) / height
    shell_ids = sorted({i for face in data["faces"] for i in face})
    forehead = np.asarray([i for i in shell_ids if 0.67 < f[i] < 0.84])
    center = (float(v[forehead, 2].min()) + float(np.percentile(v[forehead, 2], 95))) / 2
    # Swap Y/Z into the builder's +Y-facing, +Z-up frame. Faces are reversed below.
    out = np.column_stack((v[:, 0] / height, (v[:, 2] - center) / height, f))
    width = _shape_value(pd, "face_width", rng, 0.055)
    depth = _shape_value(pd, "head_depth", rng, 0.035)
    jaw = _shape_value(pd, "jaw_width", rng, 0.09)
    nose_w = _shape_value(pd, "nose_width", rng, 0.10)
    nose_d = _shape_value(pd, "nose_depth", rng, 0.08)
    spacing = _shape_value(pd, "eye_spacing", rng, 0.035)
    out[:, 0] *= width * (1 + (jaw - 1) * np.exp(-((f - 0.19) / 0.22) ** 2))
    out[:, 1] *= depth
    # The narrow nose region excludes eye rims; modify its shape, not the whole face.
    nose = np.exp(-((out[:, 0] / 0.12) ** 4)) * np.exp(-((f - 0.39) / 0.14) ** 4)
    nose *= np.clip((out[:, 1] - 0.24) / 0.12, 0, 1)
    out[:, 0] *= 1 + (nose_w - 1) * nose
    out[:, 1] += (nose_d - 1) * 0.13 * nose
    eye_zone = np.exp(-((f - 0.55) / 0.10) ** 4) * np.exp(-((np.abs(out[:, 0]) - 0.13) / 0.09) ** 4)
    out[:, 0] += np.sign(out[:, 0]) * (spacing - 1) * 0.13 * eye_zone
    # Fit the existing chin/crown, so scale, rig positions and headroom survive.
    out *= P["hh"]
    out[:, 1] += hy0
    out[:, 2] += P["chin"]
    _taper_neck(out, P, hy0)
    if not np.isfinite(out).all():
        raise ValueError(f"{pd['id']}: nonfinite fitted head")
    return out


def _rows_at(rows, z):
    if z <= rows[0][0]:
        return rows[0]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / max(1e-12, b[0] - a[0])
            return tuple(x + (y - x) * t for x, y in zip(a, b))
    return rows[-1]


def _surface(vertices, faces, P, hy0):
    hh, chin = P["hh"], P["chin"]
    tree = BVHTree.FromPolygons([Vector(x) for x in vertices], faces, all_triangles=False)
    shell_ids = sorted({i for face in faces for i in face})
    shell = vertices[shell_ids]

    def front(x, z):
        pos, _, _, _ = tree.ray_cast(Vector((x, hy0 + 3 * hh, z)), Vector((0, -1, 0)), 6 * hh)
        return float(pos.y) if pos is not None else hy0 + 0.34 * hh

    def rear(x, z):
        """y of the rearmost skull surface at lateral offset x and height z (a ray from behind), or None."""
        pos, _, _, _ = tree.ray_cast(Vector((x, hy0 - 3 * hh, z)), Vector((0, 1, 0)), 6 * hh)
        return float(pos.y) if pos is not None else None

    rows = []
    for f in np.linspace(0, 1, 65):
        z = chin + float(f) * hh
        near = shell[np.abs(shell[:, 2] - z) < 0.035 * hh]
        if len(near) < 4:
            near = shell[np.argsort(np.abs(shell[:, 2] - z))[:16]]
        # Use the silhouette, not a vertex percentile: the mouth's dense topology
        # otherwise collapses this radius inward even though the jaw is broad.
        rx = float(np.max(np.abs(near[:, 0])))
        back = float(np.percentile(near[:, 1], 3))
        if f >= 0.25:
            # R3-024 / R3-025: the back of the MakeHuman head has far fewer vertices than the face, so a vertex percentile sat up to 6.8 cm in front of the occiput at ear height
            # (rows 0.45 to 0.60 of the head height). Every hair cap, bob and hat built on these rows sank into the skull there: a bare skin oval showed through the back of
            # every long, bob and receding hairstyle, and all the short caps ended at ear height with the whole nape bare. The rearmost surface is found by a few rays from behind.
            hits = [h for h in (rear(s * rx, z) for s in (-0.30, -0.15, 0.0, 0.15, 0.30)) if h is not None]
            if hits: back = min(back, min(hits))
        fore = float(np.percentile(near[:, 1], 92))
        if f < 0.67:
            fore = min(fore, front(0.20 * hh, z))
        cy = (fore + back) / 2
        ry = (fore - back) / 2
        if f > 0.95:
            # The sampling band below the crown must not flatten its cap.
            cap = max(0.035, 2.8 * (1.0 - f)) * hh
            rx = min(rx, cap)
            ry = min(ry, cap * 1.25)
        rows.append((z, max(0.035 * hh, rx), max(0.045 * hh, ry), cy))
    row_at = lambda z: _rows_at(rows, z)
    ctrl = [row_at(chin + f * hh) for f in HF]
    return {"ctrl": ctrl, "hrows": [row_at(chin + i * hh / 21) for i in range(22)],
            "row_at": row_at, "skull_y": front}


def _decimated_shell(vertices, faces, lip_faces, target, P, hy0):
    """Reduce the shell without collapsing the sculpted vermilion or neck cut.

    Material labels alone do not preserve a lip outline during a collapse: a
    labelled polygon can stretch across the mouth and become a flat pink
    wedge. Keep that small source patch exact, and favour jaw silhouette
    samples over the broad, almost planar scalp. This still budgets the
    evaluated result, before any UV, recolour or skinning data is attached.
    """
    ids = sorted({i for f in faces for i in f})
    remap = {old: new for new, old in enumerate(ids)}
    mesh = bpy.data.meshes.new("head_source_temp")
    mesh.from_pydata([vertices[i] for i in ids], [], [[remap[i] for i in f] for f in faces])
    mesh.update()
    for i, poly in enumerate(mesh.polygons):
        poly.material_index = 1 if i in lip_faces else 0
    obj = bpy.data.objects.new("head_source_temp", mesh)
    bpy.context.scene.collection.objects.link(obj)
    modifier = obj.modifiers.new("head_budget", "DECIMATE")
    modifier.use_collapse_triangulate = True
    preserve = {i for fi in lip_faces for i in faces[fi]}
    preserve.update(i for i, ring in _neck_rings() if ring == 0)
    priority = obj.vertex_groups.new(name="head_detail")
    priority.add(list(range(len(ids))), 1.0, 'REPLACE')
    jaw = [remap[i] for i in ids if i not in preserve
           and P["chin"] - 0.02 * P["hh"] < vertices[i, 2] < P["chin"] + 0.32 * P["hh"]
           and abs(vertices[i, 0]) > 0.16 * P["hh"]
           and vertices[i, 1] > hy0 - 0.22 * P["hh"]]
    if jaw:
        priority.add(jaw, 0.15, 'REPLACE')
    priority.remove([remap[i] for i in preserve if i in remap])
    modifier.vertex_group = priority.name
    modifier.vertex_group_factor = 1.0
    original = sum(len(f) - 2 for f in faces)
    modifier.ratio = min(1.0, target / original)
    try:
        # Budget is measured on evaluated triangles, never inferred from ratio.
        for _ in range(5):
            bpy.context.view_layer.update()
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            result = evaluated.to_mesh()
            result.calc_loop_triangles()
            count = len(result.loop_triangles)
            if count <= target:
                points = [tuple(v.co) for v in result.vertices]
                polys = [(tuple(t.vertices), result.polygons[t.polygon_index].material_index)
                         for t in result.loop_triangles]
                evaluated.to_mesh_clear()
                return points, polys
            evaluated.to_mesh_clear()
            modifier.ratio *= (target - 2) / count
        raise RuntimeError(f"Head decimator could not meet {target} triangles")
    finally:
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def _beard_tints(points, polys, P, pd, skin, hy0, far_lod):
    """Continuous facial-hair pigment on the anatomical skin vertices.

    Classifying whole triangles produces a sawtooth beard even on a correct
    jaw. The shared corner-colour bake interpolates these vertex tints instead.
    No overlaid shell, material border or disconnected geometry is introduced;
    the skin's existing atlas cell, recolour slot and protected topology stay
    intact. The retained lip patch and a narrow surrounding margin stay bare.
    """
    if not pd.get("beard"):
        return {}
    lips = {i for indices, material in polys if material for i in indices}
    lip_points = np.asarray([points[i] for i in sorted(lips)])
    skin_rgb = tuple(int(skin[i:i+2], 16) for i in (1, 3, 5))
    hair = pd.get("hair_hex", "#292019")
    hair_rgb = tuple(int(hair[i:i+2], 16) for i in (1, 3, 5))
    hh = P["hh"]

    def smooth(lo, hi, x):
        t = max(0.0, min(1.0, (x - lo) / (hi - lo)))
        return t * t * (3.0 - 2.0 * t)

    tints = {}
    for i, point in enumerate(points):
        if i in lips:
            continue
        x, y, z = point
        height = (z - P["chin"]) / hh
        front = (y - hy0) / hh
        width = min(1.0, abs(x) / (0.25 * hh))
        cheek_line = 0.20 + 0.24 * width ** 1.4
        feather = 0.085 if far_lod else 0.065
        jaw = (smooth(-0.035, 0.055, height)
               * (1.0 - smooth(cheek_line - feather, cheek_line + feather, height))
               * smooth(0.015, 0.18, front))
        moustache = (smooth(0.285, 0.325, height)
                    * (1.0 - smooth(0.350, 0.390, height))
                    * (1.0 - smooth(0.095, 0.160, abs(x) / hh))
                    * smooth(0.25, 0.38, front))
        coverage = 1.0 - (1.0 - jaw) * (1.0 - moustache)
        distance = float(np.linalg.norm(lip_points - np.asarray(point), axis=1).min()) / hh
        coverage *= 0.93 * smooth(0.005, 0.055, distance)
        if coverage <= 0.001:
            continue
        tints[i] = "#%02x%02x%02x" % tuple(round(a + (b - a) * coverage) for a, b in zip(skin_rgb, hair_rgb))
    return tints


def append_head(pb, P, pd, skin, *, hy0=0.0, target_tris=1600, brow_color=None, far_lod=False):
    """Append an anatomical head, two eyes and brows; return hair-fitting helpers.

    PB provides V(co, 'head') and F(vertices, hex, smooth, fab_=..., uv=...).
    Bearded heads also use its insertion-order vpart list and vertex_tints map
    to pass smooth pigmentation to the shared corner-colour bake.
    All skin including sculpted lips uses the existing skin fabric, so a painted
    face tile cannot add a second set of eyes. Eyeballs use the existing eye tile.
    The requested triangle cap includes eyes and brows, not hair or hats.
    """
    if target_tris < 500:
        raise ValueError("Head triangle target must be at least 500")
    data = source_data()
    fitted = head_vertices(P, pd, hy0)
    # Axis swap changes handedness; preserve the original outward winding.
    faces = [list(reversed(f)) for f in data["faces"]]
    surface = _surface(fitted, faces, P, hy0)
    eye_tris = sum(len(f) - 2 for eye in data["eyes"] for f in eye)
    brow_tris = 24
    points, polys = _decimated_shell(fitted, faces, set(data["lipFaces"]), target_tris - eye_tris - brow_tris, P, hy0)
    vertex_base = len(pb.vpart) if pd.get("beard") else 0
    verts = [pb.V(p, "head") for p in points]
    if pd.get("beard"):
        pb.vertex_tints.update({vertex_base + i: colour for i, colour in
                               _beard_tints(points, polys, P, pd, skin, hy0, far_lod).items()})
    lip = pd.get("lip_hex") or (pd.get("lips") if not P["child"] else None) or "#%02x%02x%02x" % tuple(
        max(0, min(255, round(int(skin[i:i+2], 16) * q)))
        for i, q in ((1, 0.87), (3, 0.72), (5, 0.76)))
    # lipFaces comes from a volume-morph influence mask, which also includes
    # skin below the lower lip. It is suitable for protecting the sculpt, not
    # for painting every affected face pink. HM08 vertex 496 is the central
    # lower-vermilion ridge; follow that morphed landmark and soften the colour
    # into the surrounding skin, with a narrower outline at the corners.
    lower_lip = fitted[data["sourceIndices"].index(496), 2]
    lip_rgb = tuple(int(lip[i:i+2], 16) for i in (1, 3, 5))
    skin_rgb = tuple(int(skin[i:i+2], 16) for i in (1, 3, 5))
    for indices, material in polys:
        center = np.mean([points[i] for i in indices], axis=0)
        colour = skin
        if material:
            corner = min(1.0, abs(center[0]) / (0.085 * P["hh"]))
            edge = lower_lip - (0.010 - 0.008 * corner * corner) * P["hh"]
            tint = min(1.0, max(0.0, (center[2] - edge) / (0.016 * P["hh"])))
            tint = tint * tint * (3.0 - 2.0 * tint)
            colour = "#%02x%02x%02x" % tuple(round(a + (b - a) * tint) for a, b in zip(skin_rgb, lip_rgb))
        pb.F([verts[i] for i in indices], colour, True, fab_="skin")
    eye_centers = []
    for eye in data["eyes"]:
        ids = sorted({i for f in eye for i in f})
        coords = fitted[ids]
        center = coords.mean(axis=0)
        uv_center = (coords.min(axis=0) + coords.max(axis=0)) / 2
        rx = (coords[:, 0].max() - coords[:, 0].min()) / 2
        rz = (coords[:, 2].max() - coords[:, 2].min()) / 2
        # A morphed eye is not vertex-symmetric. Its mean is useful for props,
        # but projecting around that mean lets an extreme spill into another
        # atlas tile. Bounds centring plus an equal 1% inset keeps the existing
        # iris proportions and maps the full eye inside local .005..995.
        uv = lambda co, c=uv_center.copy(), rx=rx, rz=rz: (
            0.5 + 0.99 * (co.x - c[0]) / (2 * rx * 1.05),
            0.5 + 0.99 * (co.z - c[2]) / (2 * rz))
        ev = {i: pb.V(tuple(fitted[i]), "head") for i in ids}
        for face in eye:
            pb.F([ev[i] for i in reversed(face)], "#ffffff", True, fab_="eye", uv=uv)
        eye_centers.append(tuple(float(v) for v in center))
    # Thin curved brow ribbons follow the actual forehead, including elder/child shapes.
    hair = brow_color or pd.get("brow_color") or pd.get("hair_hex") or ("#817b72" if pd["kind"] == "elder" else "#292019")
    hh = P["hh"]
    for cx, _, cz in eye_centers:
        upper, lower = [], []
        for i in range(7):
            t = i / 6
            x = cx + (t - 0.5) * 0.19 * hh
            z = cz + (0.089 + 0.020 * math.sin(math.pi * t)) * hh
            y = surface["skull_y"](x, z) + 0.004 * hh
            thick = (0.008 if P["child"] or P["fem"] else 0.012) * hh * math.sin(math.pi * (0.08 + 0.84 * t))
            upper.append(pb.V((x, y, z + thick), "head"))
            lower.append(pb.V((x, y + 0.001 * hh, z - thick), "head"))
        for i in range(6):
            pb.F((upper[i], upper[i+1], lower[i+1], lower[i]), hair, True, fab_="hair")
    count = len(polys) + eye_tris + brow_tris
    if count > target_tris:
        raise RuntimeError(f"{pd['id']}: head has {count} triangles, cap is {target_tris}")
    surface.update(eye_centers=eye_centers, eye_z=sum(c[2] for c in eye_centers) / 2, triangles=count)
    return surface
