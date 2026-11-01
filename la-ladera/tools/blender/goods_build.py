"""Build the complete shelf-goods library using the furniture Blender pipeline.

Headless only; see GOODS.md for the quiet-box commands. The authoring source is
goods_catalog.py. Exports a near/far node pair per key, one external atlas, and
planner metadata. No image is loaded into Blender or embedded in a GLB.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import bpy
import furn_lib as L
from goods_catalog import CATALOG, LABELS, ATLAS_SIZE, TILE_SIZE, ATLAS_FILE, SURFACE, LABEL, atlas_metadata

ROOT = HERE.parent.parent
PI = math.pi
WHITE = 0xf2ead8
GOLD = 0xd6a849
GREEN = 0x4c783b
STEM = 0x5b6132
METAL = 0xb9beb9
LABEL_INDEX = {rec[0]: i for i, rec in enumerate(LABELS)}


def polygon(A, points, color, normal=None, material=SURFACE, uv=None):
    """A convex authored face; furn_lib.Geo.add enforces winding and rejects degeneracy."""
    if normal is None:
        normal = L._unit(L._cross(L._sub(points[1], points[0]), L._sub(points[2], points[0])))
    tex = uv or [(p[0], p[2]) for p in points]
    A._emit(material, (points, [normal] * len(points), tex,
                      [(0, i, i + 1) for i in range(1, len(points) - 1)]), color, False, ())


def prism(A, outline, y0, y1, color, side=None):
    """Convex x/z outline, upright extrusion with a closed floor."""
    polygon(A, [(x, y0, z) for x, z in outline], color, (0, -1, 0))
    polygon(A, [(x, y1, z) for x, z in outline], color, (0, 1, 0))
    cx = sum(p[0] for p in outline) / len(outline)
    cz = sum(p[1] for p in outline) / len(outline)
    for i, (x, z) in enumerate(outline):
        xx, zz = outline[(i + 1) % len(outline)]
        nn = L._unit((z - zz, 0, xx - x))
        if nn[0] * ((x + xx) / 2 - cx) + nn[2] * ((z + zz) / 2 - cz) < 0:
            nn = tuple(-n for n in nn)
        polygon(A, [(x, y0, z), (xx, y0, zz), (xx, y1, zz), (x, y1, z)], side or color, nn)


def profile(A, rings, color, far=False, n=None, offset=(0, 0, 0), scale=None):
    A.lathe(SURFACE, *offset, rings, n=n or (6 if far else 10), col=color,
            crease=55, scl=scale)


def leaf(A, p, length, width, angle=0, color=GREEN, tilt=.12):
    c, s = math.cos(angle), math.sin(angle)
    x, y, z = p
    pts = [(x, y, z), (x + c * length * .42 - s * width, y + tilt * length, z + s * length * .42 + c * width),
           (x + c * length, y + tilt * length * .5, z + s * length),
           (x + c * length * .42 + s * width, y + tilt * length * .7, z + s * length * .42 - c * width)]
    nn = L._unit(L._cross(L._sub(pts[1], pts[0]), L._sub(pts[2], pts[0])))
    polygon(A, pts, color, nn)
    polygon(A, pts, L.mulc(color, .82), tuple(-n for n in nn))


def label_uv(ident):
    # Blender's glTF exporter converts V to 1-V; the library's TextureLoader
    # uses normal Three.js flipY. Author in image-row coordinates here so the
    # exported UVs and the library texture display upright without special cases.
    i = LABEL_INDEX[ident]
    x, y = (i % 4) * TILE_SIZE, (i // 4) * TILE_SIZE
    return ((x + 8) / ATLAS_SIZE, (y + 8) / ATLAS_SIZE,
            (x + TILE_SIZE - 8) / ATLAS_SIZE, (y + TILE_SIZE - 8) / ATLAS_SIZE)


def label_front(A, ident, x, y, z, w, h, ztop=None):
    u0, v0, u1, v1 = label_uv(ident)
    ztop = z if ztop is None else ztop
    polygon(A, [(x - w / 2, y, z), (x + w / 2, y, z), (x + w / 2, y + h, ztop), (x - w / 2, y + h, ztop)],
            0xffffff, L._unit((0, (z - ztop) / h, 1)), LABEL, [(u0, v1), (u1, v1), (u1, v0), (u0, v0)])


def label_top(A, ident, x, y, z, w, d):
    u0, v0, u1, v1 = label_uv(ident)
    polygon(A, [(x - w / 2, y, z + d / 2), (x + w / 2, y, z + d / 2),
                (x + w / 2, y, z - d / 2), (x - w / 2, y, z - d / 2)],
            0xffffff, (0, 1, 0), LABEL, [(u0, v1), (u1, v1), (u1, v0), (u0, v0)])


def label_wrap(A, ident, r0, r1, y0, y1, zscale=1, n=5):
    u0, v0, u1, v1 = label_uv(ident)
    # Front 180 degrees. n is HALF the body's radial segment count so every
    # label edge matches a body edge: a separate smooth circle would cut into
    # polygonal bottles even when its nominal radius was slightly larger.
    for j in range(n):
        a, b = -PI / 2 + PI * j / n, -PI / 2 + PI * (j + 1) / n
        p = [(r0 * math.sin(a), y0, r0 * math.cos(a) * zscale),
             (r0 * math.sin(b), y0, r0 * math.cos(b) * zscale),
             (r1 * math.sin(b), y1, r1 * math.cos(b) * zscale),
             (r1 * math.sin(a), y1, r1 * math.cos(a) * zscale)]
        nn = L._unit((math.sin((a + b) / 2), (r0 - r1) / (y1 - y0), math.cos((a + b) / 2) / zscale))
        ua, ub = u0 + (u1 - u0) * j / n, u0 + (u1 - u0) * (j + 1) / n
        polygon(A, p, 0xffffff, nn, LABEL, [(ua, v1), (ub, v1), (ub, v0), (ua, v0)])


def oval(A, x, y, z, rx, rz, color, n=8):
    polygon(A, [(x + math.cos(i * 2 * PI / n) * rx, y, z + math.sin(i * 2 * PI / n) * rz) for i in range(n)], color, (0, 1, 0))


def body(A, color, far=False, sx=1, sy=1, sz=1, x=0, y=None, z=0, n=None):
    W, H, D = A.W, A.H, A.D
    A.sph(SURFACE, x, H * sy / 2 if y is None else y, z,
          W * sx / 2, H * sy / 2, D * sz / 2, n=n or (6 if far else 10), col=color)


def fruit(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name in ('apple', 'pear'):
        points = ([(0, 0), (.6, .04), (.96, .24), (1, .53), (.86, .77), (.42, .89), (.1, .84), (0, .84)] if name == 'apple' else
                  [(0, 0), (.65, .02), (1, .23), (.94, .43), (.6, .64), (.37, .83), (.23, .91), (0, .91)])
        if far:
            points = points[::2] + [points[-1]]
        profile(A, [(r, y * H) for r, y in points], 0xb74332 if name == 'apple' else 0xa7af43,
                far, scale=(W * .5, 1, D * .5))
        A.cyl(SURFACE, 0, H * .82, 0, W * .035, H * .17, n=4 if far else 6, col=0x6d5035)
        if not far:
            leaf(A, (0, H * .89, 0), W * .35, W * .08, .6)
    elif name in ('orange', 'tomato', 'potato'):
        color = {'orange': 0xe69225, 'tomato': 0xc74f38, 'potato': 0xb59a63}[name]
        body(A, color, far, sy=.93 if name == 'tomato' else 1)
        if name == 'tomato':
            if not far:
                for i in range(5):
                    leaf(A, (0, H * .91, 0), W * .31, W * .055, i * 2 * PI / 5, STEM, -.45)
            A.cyl(SURFACE, 0, H * .91, 0, W * .025, H * .09, n=4, col=STEM)
        elif not far and name == 'orange':
            A.cyl(SURFACE, 0, H * .94, 0, W * .045, H * .04, n=6, col=STEM)
        elif not far:
            for x, z in [(-.2, -.16), (.18, -.08), (.11, .22), (-.28, .15)]:
                y = H / 2 + H / 2 * math.sqrt(max(0, 1 - (x * 2) ** 2 - (z * 2) ** 2))
                oval(A, x * W, y + .0002, z * D, .0025, .0035, 0x7e6b48, 5)
    elif name == 'banana_bunch':
        for j in range(3):
            pts = [(W * (-.25 + j * .22) + W * .14 * math.sin(PI * t), H * (.2 + .5 * math.sin(PI * t)),
                    D * (-.39 + .78 * t)) for t in ([0, .33, .67, 1] if far else [0, .2, .4, .6, .8, 1])]
            radii = [W * (.025 + .055 * math.sin(PI * i / (len(pts) - 1))) for i in range(len(pts))]
            A.tube(SURFACE, pts, radii, n=4 if far else 6, col=0xd6bb42)
            if not far:
                A.tube(SURFACE, [pts[-1], (pts[-1][0] + .003, pts[-1][1] + .004, pts[-1][2] + .008)], .004, n=4, col=0x716137)
        A.tube(SURFACE, [(0, H * .23, -D * .4), (.015, H * .38, -D * .43)], .009, n=4, col=STEM)
    elif name == 'grapes':
        ps = [(-.22, .72, -.12), (.2, .75, -.08), (0, .66, .2), (-.2, .48, .14), (.2, .47, .12), (0, .34, -.13), (0, .18, .13)]
        if far:
            ps = [(-.18, .65, 0), (.18, .65, 0), (0, .39, .04), (0, .18, .08)]
        for i, (x, y, z) in enumerate(ps):
            A.sph(SURFACE, x * W, y * H, z * D, W * .22, H * .17, D * .22, n=4 if far else 6,
                  col=[0x72537a, 0x805884, 0x68476e][i % 3])
        A.tube(SURFACE, [(0, H * .78, 0), (W * .08, H * .97, -D * .06)], W * .025, n=4, col=STEM)
    elif name == 'watermelon_slice':
        z0, z1 = -D / 2, D / 2
        points = [(-W / 2, 0), (W / 2, 0), (0, H)]
        for zz, nn in [(z0, (0, 0, -1)), (z1, (0, 0, 1))]:
            polygon(A, [(x, y, zz) for x, y in points], 0xd85d50, nn)
        for i, (x, y) in enumerate(points):
            xx, yy = points[(i + 1) % 3]
            normal = L._unit((yy - y, x - xx, 0))
            polygon(A, [(x, y, z0), (x, y, z1), (xx, yy, z1), (xx, yy, z0)], 0xc74d47, normal)
        A.box(SURFACE, 0, 0, 0, W, H * .09, D, col=0x3e7546)
        A.box(SURFACE, 0, H * .09, 0, W * .9, H * .05, D, col=0xd8d5a0)
        if not far:
            for x, y in [(-.23, .3), (.18, .32), (-.08, .54), (.09, .61)]:
                polygon(A, [(x * W - .0025, y * H, D * .501), (x * W + .0025, y * H, D * .501),
                            (x * W, y * H + .01, D * .501)], 0x5d443b, (0, 0, 1))
    elif name == 'carrots':
        for j in range(3 if not far else 2):
            x = (j - (1 if not far else .5)) * W * .24
            A.tube(SURFACE, [(x, H * .47, -D * .25), (x + .008, H * .35, D * .05), (x + .015, H * .22, D * .47)],
                   [.018, .014, .0015], n=4 if far else 6, col=0xd98631)
            A.tube(SURFACE, [(x, H * .5, -D * .25), (x - .01, H * .72, -D * .48)], [.004, .002], n=3, col=GREEN)
            if not far:
                leaf(A, (x, H * .6, -D * .32), .045, .012, -1.9, GREEN, .2)
    elif name == 'pepper':
        if far:
            body(A, 0xb8a039, True, sy=.85)
        else:
            for x, z in [(-.18, -.1), (.18, -.1), (0, .16)]:
                A.sph(SURFACE, x * W, H * .43, z * D, W * .31, H * .43, D * .31, n=8, col=0xc6a83f)
        A.tube(SURFACE, [(0, H * .78, 0), (.008, H * .97, -.006)], W * .07, n=4 if far else 6, col=STEM)
    elif name == 'aubergine':
        body(A, 0x57415d, far, sx=.94, sy=.94, sz=.85, z=D * .065)
        A.tube(SURFACE, [(0, H * .55, -D * .32), (.008, H * .6, -D * .49)], [.016, .007], n=4 if far else 6, col=STEM)
        if not far:
            for x in [-.2, .2]:
                leaf(A, (0, H * .6, -D * .27), D * .25, W * .14, 1.1 + x, GREEN, -.1)
    elif name == 'cabbage':
        body(A, 0x94ac68, far)
        if not far:
            for j in range(4):
                ang = j * 2 * PI / 4
                pts = [(math.cos(ang) * W * r, H * y, math.sin(ang) * D * r) for r, y in [(.44, .48), (.36, .8), (.12, .98)]]
                A.tube(SURFACE, pts, .0018, n=3, col=0xc0ce91)


def bread(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'croissant':
        steps = 4 if far else 7
        pts = []
        radii = []
        for i in range(steps):
            a = -.15 * PI + 1.3 * PI * i / (steps - 1)
            pts.append((math.cos(a) * W * .34, H * .45, math.sin(a) * D * .32 - D * .07))
            radii.append(H * (.06 + .38 * math.sin(PI * i / (steps - 1))))
        A.tube(SURFACE, pts, radii, n=4 if far else 8, col=0xc98d45)
        if not far:
            for i in (2, 3, 4):
                p = pts[i]
                A.tube(SURFACE, [(p[0] - .012, p[1] + radii[i] * .65, p[2] - .008),
                                (p[0], p[1] + radii[i], p[2]),
                                (p[0] + .009, p[1] + radii[i] * .65, p[2] + .009)], .0018, n=3, col=0xe9bf75)
        return
    body(A, 0xc99750 if name == 'round_loaf' else 0xd9ac65, far, sy=.96)
    if far:
        return
    zs = [-.3, -.1, .1, .3] if name == 'baguette' else [-.16, .16] if name == 'round_loaf' else [0]
    for zz in zs:
        pts = []
        for i in range(5):
            x = W * (-.34 + .68 * i / 4)
            z = zz * D + x * .24
            y = H * .48 + H * .48 * math.sqrt(max(0, 1 - (x / (W * .5)) ** 2 - (z / (D * .5)) ** 2))
            pts.append((x, y + .0003, z))
        A.tube(SURFACE, pts, H * .026, n=3, col=0xead1a0)


def cheese(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'cheese_wedge':
        outline = [(-W / 2, -D / 2), (W / 2, -D / 2), (0, D / 2)]
        prism(A, outline, 0, H, 0xe6ca6a, 0xd5b853)
        polygon(A, [(-W / 2, 0, -D * .501), (W / 2, 0, -D * .501),
                    (W / 2, H, -D * .501), (-W / 2, H, -D * .501)], 0xb68b34, (0, 0, -1))
        if not far:
            for x, z, r in [(-.2, -.23, .014), (.17, -.25, .012), (.04, .05, .011)]:
                oval(A, x * W, H + .0003, z * D, r, r * .85, 0xbc9a43, 7)
    else:
        n = 6 if far else 12
        profile(A, [(0, 0), (W * .45, 0), (W * .5, H * .14), (W * .5, H * .85), (W * .45, H), (0, H)], 0xd6b64d, far, n=n)
        if not far:
            oval(A, 0, H + .0003, 0, W * .43, D * .43, 0xe7cd74, 12)
            for x, z, r in [(-.2, -.1, .012), (.16, -.2, .013), (.11, .21, .009)]:
                oval(A, x * W, H + .0005, z * D, r, r, 0xbc9a43, 7)


def bottle(A, name, far):
    W, H, D = A.W, A.H, A.D
    cols = {'milk_bottle': (0xe7e3d4, 0x5c9fb5), 'juice_bottle': (0xcc942f, 0x6b8e4e),
            'oil_bottle': (0x687a3e, 0x8f813a), 'soda_bottle': (0x7c994e, 0xca6942), 'tonic_bottle': (0x896238, 0xe1ded0)}
    col, cap = cols[name]
    r = W * .48
    if far:
        rings = [(0, 0), (r, 0), (r, H * .68), (r * .47, H * .81), (r * .47, H), (0, H)]
    else:
        rings = [(0, 0), (r * .83, 0), (r, H * .045), (r, H * .67), (r * .87, H * .72),
                 (r * .44, H * .81), (r * .42, H * .93), (0, H * .93)]
    profile(A, rings, col, far, scale=(1, 1, D / W))
    if not far:
        A.cyl(SURFACE, 0, H * .91, 0, r * .51, H * .09, n=8, col=cap)
        label_wrap(A, A.cat['labelId'], r * 1.008, r * 1.008, H * .25, H * .61, D / W)
        # An opaque cream glint reads as a glass highlight without transparent
        # materials/sorting or any extra draw call.
        polygon(A, [(-r * .6, H * .67, r * .79 * D / W), (-r * .49, H * .67, r * .87 * D / W),
                    (-r * .27, H * .78, r * .37 * D / W), (-r * .34, H * .78, r * .33 * D / W)],
                L.mixc(col, WHITE, .32), (-.5, .5, .70710678))


def jar(A, name, far):
    W, H, D = A.W, A.H, A.D
    r = W * .49
    color = {'preserves_jar': 0xa95737, 'pickles_jar': 0x8a9849, 'sugar_jar': 0xd7d0ab}[name]
    profile(A, [(0, 0), (r * .84, 0), (r, H * .08), (r, H * .76), (r * .84, H * .86),
                (r * .84, H * .91), (0, H * .91)], color, far)
    A.cyl(SURFACE, 0, H * .89, 0, r * .94, H * .11, n=6 if far else 12, col=0xb6ad72 if name != 'sugar_jar' else 0x648e91)
    if not far:
        label_wrap(A, A.cat['labelId'], r * 1.006, r * 1.006, H * .22, H * .66)


def tin(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'fish_tin':
        A.box(SURFACE, 0, 0, 0, W, H * .94, D, col=0xb9bdaf, r=0 if far else H * .16)
        if not far:
            label_top(A, A.cat['labelId'], 0, H * .945, 0, W * .91, D * .84)
            A.box(SURFACE, 0, H * .95, -D * .28, W * .2, H * .04, D * .21, col=0x8a9088)
        return
    n = 6 if far else 12
    r = W * .485
    A.cyl(SURFACE, 0, 0, 0, r, H, n=n, col=METAL)
    if not far:
        A.cyl(SURFACE, 0, H * .94, 0, W * .5, H * .045, n=n, col=0xd1d0c2)
        A.cyl(SURFACE, 0, 0, 0, W * .5, H * .045, n=n, col=0xc2bfa8)
        label_wrap(A, A.cat['labelId'], r * 1.01, r * 1.01, H * .13, H * .87, n=6)
    if name == 'paint_tin' and not far:
        pts = [(math.cos(a) * W * .43, H * .45, math.sin(a) * D * .43) for a in [PI * j / 7 for j in range(8)]]
        A.tube(SURFACE, pts, W * .013, n=3, col=0x777e78)


def sack(A, name, far):
    W, H, D = A.W, A.H, A.D
    color = {'rice_sack': 0xc9b487, 'beans_sack': 0xb5a06f, 'coffee_sack': 0xae966e}[name]
    rings = [(0, 0), (.75, .015), (1, .22), (.94, .66), (.65, .85), (.56, .94), (.51, 1), (.41, .98), (.4, .89), (0, .89)]
    if far:
        rings = [(0, 0), (.8, 0), (1, .24), (.91, .69), (.52, 1), (0, 1)]
    profile(A, [(r, y * H) for r, y in rings], color, far, scale=(W / 2, 1, D / 2))
    if not far:
        label_wrap(A, A.cat['labelId'], W * .4982, W * .47282, H * .29, H * .66, D / W)
        oval(A, 0, H * .925, 0, W * .2, D * .19, 0xd7c18a if name == 'rice_sack' else 0x6b5138, 10)
        for x, z in [(-.09, -.03), (.08, -.03), (0, .1)]:
            A.sph(SURFACE, x * W, H * .94, z * D, W * .045, H * .018, D * .04, n=4,
                  col=0xe7d3a5 if name == 'rice_sack' else 0x7b5d3e)


def packet(A, name, far):
    W, H, D = A.W, A.H, A.D
    col = {'coffee_bag': 0xa98e6c, 'flour_bag': 0xd8c49d, 'chips_bag': 0xd9ac42}[name]
    # A gusseted paper/foil bag: wider through the middle, flattened crimp seams.
    rings = [(W * .8, 0, D * .45), (W, H * .14, D), (W * .96, H * .78, D * .92), (W * .8, H * .95, D * .18)]
    for i in range(len(rings) - 1):
        w, y, d = rings[i]
        ww, yy, dd = rings[i + 1]
        a = [(-w / 2, y, -d / 2), (w / 2, y, -d / 2), (w / 2, y, d / 2), (-w / 2, y, d / 2)]
        b = [(-ww / 2, yy, -dd / 2), (ww / 2, yy, -dd / 2), (ww / 2, yy, dd / 2), (-ww / 2, yy, dd / 2)]
        for j in range(4):
            pts = [a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]]
            nn = L._unit((sum(p[0] for p in pts), 0, sum(p[2] for p in pts)))
            polygon(A, pts, L.mulc(col, [1, .88, 1, .92][j]), nn)
    w, y, d = rings[0]
    polygon(A, [(-w / 2, y, -d / 2), (w / 2, y, -d / 2), (w / 2, y, d / 2), (-w / 2, y, d / 2)], col, (0, -1, 0))
    A.box(SURFACE, 0, H * .95, 0, W * .8, H * .05, D * .18, col=L.mulc(col, .85))
    if not far:
        label_front(A, A.cat['labelId'], 0, H * .23, D * .499, W * .71, H * .46, ztop=D * .471)
        for x in [-.3, -.15, 0, .15, .3]:
            A.box(SURFACE, x * W, H * .96, D * .095, W * .025, H * .035, .0007, col=L.mulc(col, .68))


def meat(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'steak':
        outline = [(math.cos(i * 2 * PI / 9) * W * (.45 if i in (2, 6) else .5),
                    math.sin(i * 2 * PI / 9) * D * (.41 if i == 4 else .5)) for i in range(9)]
        prism(A, outline, 0, H * .97, 0xd6c3a7, 0xc6ab8d)
        inner = [(x * .89, z * .89) for x, z in outline]
        prism(A, inner, H * .1, H, 0xb7594f, 0x96453f)
        if not far:
            for zz in [-.15, .14]:
                A.tube(SURFACE, [(-W * .3, H * 1.002, zz * D), (-W * .07, H * 1.005, (zz + .08) * D),
                                (W * .3, H * 1.002, (zz - .04) * D)], H * .025, n=3, col=0xe3cdb4)
    elif name == 'sausages':
        for j in range(3):
            z = (j - 1) * D * .3
            pts = [(-W * .39, H * .45, z - .005), (0, H * .5, z + .012), (W * .39, H * .45, z - .005)]
            A.tube(SURFACE, pts, H * .43, n=4 if far else 7, col=[0xa95a3e, 0xb36a45, 0xa0583e][j])
            if not far:
                A.tube(SURFACE, [(W * .39, H * .45, z - .005), (W * .46, H * .46, z)], H * .11, n=3, col=0xc8a283)
    else:
        body(A, 0xd2ad83, far, sx=.68, sy=.9, sz=.8, z=-D * .04)
        for sign in (-1, 1):
            A.tube(SURFACE, [(sign * W * .18, H * .43, D * .18), (sign * W * .38, H * .31, D * .34),
                            (sign * W * .38, H * .27, D * .46)], [W * .13, W * .1, W * .04], n=4 if far else 6, col=0xc49b73)
            if not far:
                A.sph(SURFACE, sign * W * .34, H * .49, -D * .06, W * .11, H * .23, D * .2, n=6, col=0xc8a077)


def bloom(A, x, y, z, r, color, far):
    steps = 8 if far else 12
    edge = []
    for j in range(steps):
        ang = j * 2 * PI / steps
        rr = r if j % 2 == 0 else r * .53
        edge.append((x + math.cos(ang) * rr, y + math.sin(ang) * rr * .72, z - math.sin(ang) * rr * .7))
    for j in range(steps):
        polygon(A, [(x, y, z + .002), edge[j], edge[(j + 1) % steps]], color, (0, .697, .717))
    if not far:
        A.sph(SURFACE, x, y + .002, z + .003, r * .22, r * .22, r * .18, n=4, col=0xe4be58)


def flowers(A, name, far):
    W, H, D = A.W, A.H, A.D
    pot = name == 'potted_flower'
    if pot:
        profile(A, [(0, 0), (W * .23, 0), (W * .32, H * .33), (W * .35, H * .34),
                    (W * .35, H * .4), (W * .3, H * .4), (0, H * .35)], 0xb57c55, far, n=6 if far else 10)
        oval(A, 0, H * .37, 0, W * .29, D * .29, 0x65503b, 6 if far else 10)
    else:
        profile(A, [(0, 0), (W * .06, 0), (W * .24, H * .41), (W * .19, H * .43), (0, H * .12)], 0xc6ae82, far, n=6 if far else 8)
    ps = [(-.2, .72, .12), (.18, .78, .04), (0, .9, -.1)]
    if not far:
        ps += [(.23, .63, .2)]
    for j, (x, y, z) in enumerate(ps):
        A.tube(SURFACE, [(0, H * .27, 0), (x * W, y * H, z * D)], W * .013, n=3 if far else 4, col=0x4e7244)
        bloom(A, x * W, y * H, z * D, W * (.17 if pot else .18), [0xcd735c, 0xdba74f, 0xe4c5a5, 0xa96b90][j], far)
        if not far and j < 2:
            leaf(A, (x * W * .6, y * H * .7, z * D * .6), W * .24, W * .07, j * 2.7, GREEN, .5)


def paper(A, name, far):
    W, H, D = A.W, A.H, A.D
    n = 1 if far else (4 if name == 'newspaper' else 2)
    for j in range(n):
        A.box(SURFACE, (j % 2 - .5) * W * .035, j * H / n, 0, W * .96, H / n * .94, D * .97,
              col=0xc9c2a9 if name == 'newspaper' else (0x73918d if j == 1 else 0xd7d2bd))
    if not far:
        label_top(A, A.cat['labelId'], 0, H * .988, 0, W * .92, D * .91)


def shoe_outline(W, D, x):
    return [(x + xx * W, zz * D) for xx, zz in [(-.4, -.48), (.33, -.48), (.5, -.3), (.48, .29), (.27, .49), (-.25, .49), (-.49, .27), (-.47, -.28)]]


def shoes(A, name, far):
    W, H, D = A.W, A.H, A.D
    for x in (-W * .26, W * .26):
        w = W * .42
        if far and name == 'sandal_pair':
            A.box(SURFACE, x, 0, 0, w, H * .3, D * .96, col=0xc6baa0)
            for zz in (-.08, .27):
                polygon(A, [(x - w * .44, H * .65, (zz - .05) * D),
                            (x + w * .44, H * .65, (zz - .05) * D),
                            (x + w * .44, H * .65, (zz + .05) * D),
                            (x - w * .44, H * .65, (zz + .05) * D)], 0x98734d, (0, 1, 0))
            continue
        outline = shoe_outline(w, D, x)
        prism(A, outline, 0, H * (.3 if name == 'sandal_pair' else .16), 0xc6baa0, 0xa89b80)
        if name == 'sandal_pair':
            for zz in (-.08, .27):
                A.box(SURFACE, x, H * .31, zz * D, w * .88, H * .4, D * .1, col=0x98734d)
        else:
            top = []
            for xx, zz in outline:
                top.append((x + (xx - x) * .8, H * (.96 if zz < -D * .1 else .66 if zz < D * .2 else .45), zz * .84))
            base = [(xx, H * .16, zz) for xx, zz in outline]
            for j in range(len(base)):
                k = (j + 1) % len(base)
                nn = L._unit(((base[j][0] + base[k][0]) / 2 - x, .15 * H, (base[j][2] + base[k][2]) / 2))
                polygon(A, [base[j], base[k], top[k], top[j]], 0x546c76, nn)
            # Convex fan with explicitly upward normals; shape slopes from heel
            # to toe and is recognizable even in the small far mesh.
            center = (x, H * .72, -D * .07)
            for j in range(len(top)):
                polygon(A, [center, top[j], top[(j + 1) % len(top)]], 0x607c86, (0, 1, 0))
            if not far:
                oval(A, x, H * .95, -D * .27, w * .26, D * .1, 0x34434a, 8)
                for zz in [-.06, .035, .12]:
                    yy = H * (.76 - (zz + .06) * 1.25)
                    polygon(A, [(x - w * .24, yy, zz * D), (x + w * .24, yy, (zz + .02) * D),
                                (x + w * .24, yy, (zz + .04) * D), (x - w * .24, yy, (zz + .02) * D)], WHITE, (0, 1, 0))


def toys(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'toy_car':
        A.box(SURFACE, 0, H * .23, 0, W, H * .35, D * .84, col=0xc45e42, r=0 if far else H * .035)
        A.box(SURFACE, 0, H * .55, -D * .02, W * .53, H * .44, D * .66, col=0x76a0a9)
        for x in (-W * .32, W * .32):
            for z in (-D * .4, D * .4):
                A.hcyl(SURFACE, x, H * .24, z, H * .23, D * .18, axis='z', n=4 if far else 8, col=0x3b4241)
        if not far:
            for x in (-W * .47, W * .47):
                A.box(SURFACE, x, H * .31, D * .25, W * .04, H * .1, D * .13, col=0xe4d9a4)
    elif name == 'toy_bear':
        A.sph(SURFACE, 0, H * .39, 0, W * .33, H * .32, D * .4, n=4 if far else 8, col=0xb39265)
        A.sph(SURFACE, 0, H * .77, 0, W * .35, H * .22, D * .43, n=4 if far else 8, col=0xbfa073)
        for sign in (-1, 1):
            A.sph(SURFACE, sign * W * .21, H * .12, D * .12, W * .18, H * .12, D * .3, n=4, col=0xa4865e)
            if not far:
                A.sph(SURFACE, sign * W * .36, H * .42, 0, W * .14, H * .2, D * .2, n=4, col=0xb39265)
                A.sph(SURFACE, sign * W * .29, H * .92, -D * .02, W * .13, H * .08, D * .12, n=4, col=0xa1835d)
        if not far:
            A.sph(SURFACE, 0, H * .72, D * .38, W * .15, H * .08, D * .12, n=4, col=0xe1c49a)
            for x in (-W * .13, W * .13):
                polygon(A, [(x - .0025, H * .8, D * .408), (x + .0025, H * .8, D * .408),
                            (x + .0025, H * .835, D * .408), (x - .0025, H * .835, D * .408)], 0x3e3a30, (0, 0, 1))
    elif name == 'wooden_blocks':
        for x, y, z, c in [(-.24, 0, .17, 0xcb7053), (.24, 0, .17, 0x5a9a9b), (0, .5, -.1, 0xd2ae54)]:
            A.box(SURFACE, x * W, y * H, z * D, W * .45, H * .5, D * .55, col=c, r=0 if far else .003)
        if not far:
            label_front(A, A.cat['labelId'], -W * .24, H * .06, D * .45, W * .35, H * .36)
    else:
        n = 6 if far else 10
        k = max(4, n // 2)
        prof = [(math.cos(-PI / 2 + PI * i / k), math.sin(-PI / 2 + PI * i / k)) for i in range(k + 1)]
        p, normals, uv, tris = L.lathe_geo(prof, n, 90)
        for tri in tris:
            pts = [(p[i][0] * W / 2, (p[i][1] + 1) * H / 2, p[i][2] * D / 2) for i in tri]
            nn = [normals[i] for i in tri]
            xx, zz = sum(v[0] for v in pts), sum(v[2] for v in pts)
            color = [0xca6647, 0xdbba56, 0x629ba8, 0xcbd2b7][int((math.atan2(zz, xx) + PI) * 2 / PI) % 4]
            A._emit(SURFACE, (pts, nn, [uv[i] for i in tri], [(0, 1, 2)]), color, False, ())


def hardware(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'hammer':
        A.hcyl(SURFACE, 0, H * .5, D * .08, W * .07, D * .78, axis='z', n=4 if far else 7, r1=W * .09, col=0x9e7a4c)
        A.hcyl(SURFACE, -W * .05, H * .5, -D * .35, H * .49, W * .76, axis='x', n=4 if far else 8, col=METAL)
        if not far:
            for z in (-D * .395, -D * .315):
                A.box(SURFACE, W * .39, H * .2, z, W * .2, H * .56, D * .035, col=0x92998f)
    elif name == 'pliers':
        for sign in (-1, 1):
            A.tube(SURFACE, [(sign * W * .31, H * .5, D * .45), (sign * W * .26, H * .5, D * .13), (0, H * .5, -D * .03)],
                   H * .31, n=4 if far else 6, col=0xac5b43)
            A.tube(SURFACE, [(0, H * .5, -D * .03), (sign * W * .22, H * .5, -D * .24), (sign * W * .09, H * .5, -D * .47)],
                   [H * .24, H * .25, H * .1], n=4 if far else 6, col=METAL)
        A.cyl(SURFACE, 0, H * .3, -D * .04, W * .12, H * .7, n=4 if far else 8, col=0x838d84)
    elif name == 'rope_coil':
        for r in ([W * .4] if far else [W * .3, W * .43]):
            n = 8 if far else 12
            pts = [(r * math.cos(2 * PI * j / n), H * .46, r * math.sin(2 * PI * j / n)) for j in range(n + 1)]
            A.tube(SURFACE, pts, H * .29, n=4 if far else 5, col=0xb9a078, caps=False)
        if not far:
            A.tube(SURFACE, [(W * .3, H * .45, 0), (W * .39, H * .6, -D * .25), (W * .45, H * .4, -D * .3)], H * .22, n=4, col=0xcbb38c)
    else:
        tin(A, name, far)


def pharmacy(A, name, far):
    if name == 'tonic_bottle':
        bottle(A, name, far)
        return
    W, H, D = A.W, A.H, A.D
    A.box(SURFACE, 0, 0, 0, W, H, D, col=0xe6e8d9 if name == 'remedy_box' else 0xcfdfe1, r=0 if far else .001)
    if not far:
        label_front(A, A.cat['labelId'], 0, H * .025, D * .501, W * .95, H * .95)
        A.box(SURFACE, 0, H * .994, 0, W * .9, .0005, D * .04, col=0x9cbaab)


def cup(A, name, far):
    W, H, D = A.W, A.H, A.D
    n = 6 if far else 12
    if name == 'takeaway_cup':
        profile(A, [(0, 0), (W * .34, 0), (W * .47, H * .86), (W * .49, H * .88), (W * .49, H * .95),
                    (W * .43, H), (0, H)], 0xdcc8a7, far, n=n)
        if not far:
            label_wrap(A, A.cat['labelId'], W * .385, W * .442, H * .27, H * .63, n=6)
            oval(A, W * .18, H * 1.001, D * .17, W * .08, D * .04, 0x837563, 6)
        return
    profile(A, [(0, 0), (W * .22, 0), (W * .5, H * .1), (W * .49, H * .14), (W * .25, H * .09), (0, H * .09)],
            0xcbd5c7, far, n=n)
    profile(A, [(0, H * .09), (W * .22, H * .09), (W * .29, H * .91), (W * .28, H),
                (W * .25, H * .98), (W * .2, H * .25), (0, H * .25)], 0xe2e1ce, far, n=n)
    oval(A, 0, H * .82, 0, W * .244, D * .244, 0x65422b, n)
    pts = [(W * .25, H * .85, 0), (W * .4, H * .87, 0), (W * .43, H * .63, 0), (W * .35, H * .4, 0), (W * .25, H * .43, 0)]
    A.tube(SURFACE, pts, W * .027, n=3 if far else 4, col=0xd7dcc9)


def fabric(A, name, far):
    W, H, D = A.W, A.H, A.D
    if name == 'fabric_stack':
        for j, color in enumerate([0x607d8b, 0xd4c7a9, 0x9b6657]):
            A.box(SURFACE, 0, j * H / 3, 0, W * (1 - j * .025), H * .31, D * (1 - j * .02),
                  col=color, r=0 if far else .003)
    else:
        A.cyl(SURFACE, 0, 0, 0, W * .5, H * .1, n=6 if far else 10, col=0xcbb996)
        A.cyl(SURFACE, 0, H * .9, 0, W * .5, H * .1, n=6 if far else 10, col=0xcbb996)
        if far:
            A.cyl(SURFACE, 0, H * .1, 0, W * .38, H * .8, n=6, col=0xa75c4f)
        else:
            rings = [(0, H * .1), (W * .38, H * .1)]
            for i in range(7):
                rings.append((W * (.39 if i % 2 else .37), H * (.13 + i * .12)))
            rings.append((0, H * .9))
            profile(A, rings, 0xa75c4f, False, n=8)


def pencils(A, far):
    W, H, D = A.W, A.H, A.D
    count = 3 if far else 5
    for j in range(count):
        x = (j - (count - 1) / 2) * W * .17
        A.hcyl(SURFACE, x, H * .42, -D * .07, H * .4, D * .82, axis='z', n=4 if far else 6, col=0xd1ab43)
        A.tube(SURFACE, [(x, H * .42, D * .34), (x, H * .42, D * .48)], [H * .4, .0007], n=4 if far else 6, col=0xbba17c)
    if not far:
        A.box(SURFACE, 0, 0, -D * .1, W * .85, H * .92, D * .06, col=0x7b866d)


def build_good(A, key, far):
    name = key.removeprefix('goods_')
    category = A.cat['category']
    if category in ('fruit', 'vegetable'):
        fruit(A, name, far)
    elif category == 'bread':
        bread(A, name, far)
    elif category == 'cheese':
        cheese(A, name, far)
    elif category == 'bottle':
        bottle(A, name, far)
    elif category == 'jar' or name == 'sugar_jar':
        jar(A, name, far)
    elif category == 'tin':
        tin(A, name, far)
    elif name in ('coffee_bag', 'flour_bag', 'chips_bag'):
        packet(A, name, far)
    elif category == 'sack':
        sack(A, name, far)
    elif category == 'meat':
        meat(A, name, far)
    elif category == 'flower':
        flowers(A, name, far)
    elif name in ('newspaper', 'exercise_book'):
        paper(A, name, far)
    elif category == 'shoes':
        shoes(A, name, far)
    elif category == 'toy':
        toys(A, name, far)
    elif category == 'hardware':
        hardware(A, name, far)
    elif category == 'pharmacy':
        pharmacy(A, name, far)
    elif category == 'cafe':
        cup(A, name, far)
    elif category == 'fabric':
        fabric(A, name, far)
    elif name == 'pencil_bundle':
        pencils(A, far)
    else:
        raise ValueError('Missing goods builder: ' + key)


def fit(A):
    """Centre authored geometry on its supporting surface and contain the box.

    Tiny label offsets, petals, and handles are included in the footprint. The
    uniform correction cannot change silhouette proportions, UVs, or normals.
    Large mistakes are rejected rather than quietly shrinking a broken model.
    """
    lo, hi = A.bounds()
    size = [hi[i] - lo[i] for i in range(3)]
    scale = min(1, *(A.cat['size'][i] / size[i] for i in range(3)))
    if scale < .78:
        raise ValueError(f'{A.key}: authored geometry exceeds footprint: {size} versus {A.cat["size"]}')
    center = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
    A.lo, A.hi = [float('inf')] * 3, [-float('inf')] * 3
    for group in A.groups.values():
        group.P = [tuple((p[i] - center[i]) * scale for i in range(3)) for p in group.P]
        for p in group.P:
            for i in range(3):
                A.lo[i] = min(A.lo[i], p[i])
                A.hi[i] = max(A.hi[i], p[i])
        # All analytic normals must be unit length after exported float rounding.
        group.N = [L._unit(n) for n in group.N]


def main():
    if not bpy.app.background:
        raise SystemExit('goods_build.py is headless-only; run Blender with --background')
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=ROOT / 'assets' / 'models')
    ap.add_argument('--atlas', type=Path, default=ROOT / 'assets' / 'textures' / ATLAS_FILE)
    ap.add_argument('--catalog-out', type=Path, default=ROOT / 'js' / 'interiors' / 'goods-catalog.js')
    args = ap.parse_args(L.argv_after_dashes())
    if not args.atlas.is_file():
        raise SystemExit('Run goods_atlas.py first: missing ' + str(args.atlas))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'goods').mkdir(exist_ok=True)
    L.reset()
    exported = {}
    near_total = far_total = 0
    for key, cat in CATALOG.items():
        counts = []
        for far in (False, True):
            name = key + ('__lod1' if far else '')
            asset = L.Asset(name, cat)
            build_good(asset, key, far)
            fit(asset)
            tris = sum(len(g.I) for g in asset.groups.values())
            if tris < 1 or tris >= 400:
                raise ValueError(f'{name}: {tris} triangles must be in [1,399]')
            L.build_objects(asset, bpy.context.scene.collection)
            counts.append(tris)
        if counts[1] > counts[0]:
            raise ValueError(f'{key}: far LOD has more triangles than near: {counts}')
        exported[key] = {'node': key, **cat, 'triangles': counts[0], 'lodNode': key + '__lod1', 'lodTriangles': counts[1]}
        near_total += counts[0]
        far_total += counts[1]
        print(f'{key:26s} near={counts[0]:3d} far={counts[1]:3d} footprint={cat["footprint"]}')
    target = args.out / 'goods' / 'goods.glb'
    L.export_glb(str(target))
    manifest = {'version': 1, 'atlas': atlas_metadata(),
                'files': [{'glb': 'goods/goods.glb', 'assets': exported}]}
    manifest_path = args.out / 'manifest.goods.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
    args.catalog_out.parent.mkdir(parents=True, exist_ok=True)
    args.catalog_out.write_text('// Generated by tools/blender/goods_build.py; edit goods_catalog.py instead.\n'
                                '// Metres; origin at bottom-centre, +Y up, +Z front.\n'
                                'export const GOODS_CATALOG = ' + json.dumps(CATALOG, ensure_ascii=False, indent=2) + ';\n', encoding='utf8')
    total = target.stat().st_size + args.atlas.stat().st_size + manifest_path.stat().st_size + args.catalog_out.stat().st_size
    print(f'{len(CATALOG)} goods; near {near_total:,} tris; far {far_total:,} tris; generated payload {total:,} bytes')
    if total >= 2_000_000:
        raise ValueError(f'Goods payload {total:,} bytes exceeds strict 2 MB budget')


if __name__ == '__main__':
    main()
