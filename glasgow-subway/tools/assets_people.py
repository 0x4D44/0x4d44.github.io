"""Builds models/people.glb + models/people_meta.json  (REVISION 7: smooth organic people, true scale, shared rig + shared clip set).
20 variants (men, women, elders, teens, boys, girls, staff).  One 1024x1024 atlas (face tiles 128 px + colour swatches) -> one material `people_atlas`.
Rig: 21 bones, identical names AND identical rest ORIENTATIONS for every person (arms/legs vertical, clavicles along X, feet along +Y) so a clip authored once
plays on every person.  The glTF animations (`idle_a`, `walk`, ...) are ROTATION ONLY and are exported once (they bind by bone name on any clone).
Blender: +Y forward, soles on z=0.  glTF: person faces -Z, origin under the soles."""
import math, sys, os, random, json
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *
import numpy as np
from PIL import Image, ImageDraw
from mathutils import Quaternion, Vector

SKIN = ['#f4d7c1', '#eebf9f', '#d9a37f', '#b9805c', '#8d5a3c', '#5e3b27']
HAIR = ['#17120e', '#3a281c', '#6d4a2c', '#a87a43', '#d8b86c', '#8c8c8c', '#d0d0d0', '#7a2f1a', '#241812']
SEAT_TOP = 0.445          # train bench cushion top above the floor (m)
SEAT_HIP = 0.53           # seated hip-joint height above the floor (m)

BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r',
         'fingers_l', 'fingers_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r']

# ------------------------------------------------------------------ people definitions (heights = total standing height incl. hair/hat, <= 1.80 m)
PEOPLE = [
    dict(id='man_commuter', kind='man', H=1.78, skin=1, build=1.0, hair=(0, 'short'), eye='#4a6b8a', top='#2b3445', top_style='jacket', sleeve='long', inner='#cfd6df', bot_style='trousers', bot='#202226', shoe=('shoe', '#171717', '#101010'), bag=('backpack', '#23262b'), stubble=True),
    dict(id='man_hoodie', kind='man', H=1.74, skin=2, build=0.95, hair=(1, 'short'), eye='#5a4630', top='#6e7178', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#3d5b86', shoe=('trainer', '#f0f0f0', '#e6e6e6'), hat=('beanie', '#26323f'), phones=True),
    dict(id='man_longcoat', kind='man', H=1.79, skin=0, build=1.0, hair=(5, 'short'), eye='#6a8a9a', top='#3b3e43', top_style='coat', sleeve='long', inner='#d7d9dc', bot_style='trousers', bot='#1c1c1f', shoe=('shoe', '#222222', '#181818'), scarf='#a52a2a'),
    dict(id='man_elder', kind='elder', H=1.68, skin=0, build=1.05, hair=(6, 'short'), eye='#7a8a95', top='#8f7f5e', top_style='jacket', sleeve='long', inner='#d8d2c2', bot_style='trousers', bot='#4a4d52', shoe=('shoe', '#3a2a1e', '#2a1e14'), hat=('cap', '#58564f'), stoop=0.07, wrinkles=True),
    dict(id='man_puffer', kind='man', H=1.76, skin=5, build=1.05, hair=(0, 'short'), eye='#2a1a10', top='#4f5c3d', top_style='puffer', sleeve='long', bot_style='jeans', bot='#17181b', shoe=('trainer', '#d9d9d9', '#f2f2f2')),
    dict(id='man_beard', kind='man', H=1.75, skin=3, build=1.1, hair=(8, 'short'), eye='#2a1a10', top='#a23d2b', top_style='jumper', sleeve='long', bot_style='jeans', bot='#2f3e57', shoe=('boot', '#4a3322', '#2a1e14'), beard=True),
    dict(id='staff_hivis', kind='staff', H=1.78, skin=0, build=1.0, hair=(1, 'short'), eye='#5a7a6a', top='#1e2430', top_style='jacket', sleeve='long', vest='#d6ee1a', bot_style='trousers', bot='#1e2430', shoe=('boot', '#111111', '#0c0c0c'), hat=('cap', '#1e2430')),
    dict(id='man_student', kind='man', H=1.80, skin=1, build=0.9, hair=(2, 'short'), eye='#5a4630', top='#d1a02e', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#2f3e57', shoe=('trainer', '#ececec', '#f0f0f0'), bag=('backpack', '#a02c2c'), glasses=True),
    dict(id='woman_coat', kind='woman', H=1.67, skin=0, build=1.0, hair=(2, 'long'), eye='#6a4a2a', top='#b89066', top_style='coat', sleeve='long', inner='#2a2a30', bot_style='trousers', bot='#1d1d20', shoe=('boot', '#2b1d14', '#1a120c'), bag=('handbag', '#5b3a22'), lips='#b06a62'),
    dict(id='woman_puffer', kind='woman', H=1.62, skin=1, build=0.95, hair=(4, 'pony'), eye='#5a7a9a', top='#b5322e', top_style='puffer', sleeve='long', bot_style='jeans', bot='#3e5c8a', shoe=('trainer', '#f0f0f0', '#ffffff'), bag=('backpack', '#2a2d33'), lips='#c07870'),
    dict(id='woman_dress', kind='woman', H=1.69, skin=3, build=1.0, hair=(0, 'bun'), eye='#2a1a10', top='#2d3f6b', top_style='dress', sleeve='short', cardigan='#3f7d4e', bot_style='skirt', bot='#2d3f6b', shoe=('shoe', '#1e1e1e', '#141414'), lips='#8a3a3a'),
    dict(id='woman_elder', kind='elder', H=1.56, skin=0, build=1.05, hair=(6, 'bob'), eye='#7a8a95', top='#7b4a8e', top_style='coat', sleeve='long', inner='#e8e0f0', bot_style='trousers', bot='#2a2a2e', shoe=('shoe', '#3a3a3a', '#2a2a2a'), bag=('handbag', '#202020'), stoop=0.06, wrinkles=True, lips='#b07870'),
    dict(id='woman_student', kind='woman', H=1.65, skin=2, build=0.9, hair=(1, 'long'), eye='#4a3020', top='#e0b030', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#4c6a99', shoe=('trainer', '#ececec', '#f4f4f4'), bag=('backpack', '#a02c2c'), lips='#b06a62'),
    dict(id='woman_scarf', kind='woman', H=1.63, skin=4, build=1.0, hair=(0, 'curly'), eye='#2a1a10', top='#e8e0d0', top_style='coat', sleeve='long', inner='#c05a3a', bot_style='trousers', bot='#2a2a2e', shoe=('boot', '#222222', '#151515'), scarf='#c05a3a', bag=('handbag', '#8a5a3a'), lips='#7a3a32'),
    dict(id='woman_bob', kind='woman', H=1.60, skin=0, build=1.1, hair=(7, 'bob'), eye='#4a6b8a', top='#3d7d8a', top_style='jumper', sleeve='long', bot_style='leggings', bot='#202226', shoe=('boot', '#3a2a1e', '#22160e'), lips='#b86a62'),
    dict(id='teen_boy', kind='teen', H=1.68, skin=1, build=0.9, hair=(3, 'short'), eye='#4a6b8a', top='#1b3f9a', top_style='football', sleeve='short', bot_style='shorts', bot='#f2f2f2', shoe=('trainer', '#ffffff', '#f0f0f0'), scarf='#f2f2f2', bag=('backpack', '#202225')),
    dict(id='teen_girl', kind='teen', H=1.58, skin=2, build=0.9, hair=(2, 'pony'), eye='#3a2a1a', top='#e07aa0', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#2b2b3a', shoe=('trainer', '#f2f2f2', '#ffffff'), bag=('shoulder', '#7e57c2'), lips='#c07078'),
    dict(id='boy', kind='boy', H=1.38, skin=1, build=1.0, hair=(2, 'short'), eye='#4a3020', top='#2d6cb5', top_style='jacket', sleeve='long', bot_style='trousers', bot='#4a4d52', shoe=('trainer', '#222222', '#dddddd'), bag=('schoolbag', '#c23a2d')),
    dict(id='boy_small', kind='boy', H=1.20, skin=3, build=1.05, hair=(0, 'curly'), eye='#2a1a10', top='#e0a020', top_style='jumper', sleeve='long', bot_style='jeans', bot='#3d5b86', shoe=('trainer', '#e03030', '#f2f2f2')),
    dict(id='girl', kind='girl', H=1.30, skin=2, build=1.0, hair=(7, 'pony'), eye='#4a3020', top='#e07aa0', top_style='puffer', sleeve='long', bot_style='leggings', bot='#2b2b3a', shoe=('trainer', '#f2f2f2', '#ffffff'), bag=('schoolbag', '#7e57c2'), lips='#c07078'),
    dict(id='girl_small', kind='girl', H=1.12, skin=0, build=1.0, hair=(4, 'bob'), eye='#6a8a9a', top='#6fbf8a', top_style='dress', sleeve='long', bot_style='skirt', bot='#6fbf8a', shoe=('shoe', '#b03060', '#802040'), lips='#c07078'),
]

# ------------------------------------------------------------------ geometry helpers
class PB:
    def __init__(self):
        self.bm = bmesh.new(); self.vpart = []; self.fhex = []; self.fsmooth = []; self.fface = []
    def V(self, co, part):
        v = self.bm.verts.new(co); self.vpart.append(part); return v
    def F(self, vs, hexc_, smooth=True, face=False):
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        self.fhex.append(hexc_); self.fsmooth.append(smooth); self.fface.append(face); return f

def crv(ctrl, m):
    out = []; n = len(ctrl)
    for i in range(m):
        u = i * (n - 1) / (m - 1); k = min(int(u), n - 2); t = u - k
        p0 = ctrl[max(k - 1, 0)]; p1 = ctrl[k]; p2 = ctrl[k + 1]; p3 = ctrl[min(k + 2, n - 1)]
        out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(len(p1))))
    return out

def ring(cx, cy, z, rx, ry, n=12, a0=0.0, a1=2 * math.pi, closed=True):
    m = n if closed else n + 1
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / (n if not closed else n)), cy + ry * math.sin(a0 + (a1 - a0) * i / (n if not closed else n)), z) for i in range(m)]

def loft(pb, rings, part, hexc_, hex_fn=None, closed=True, cap_top=True, cap_bot=True, smooth=True, face_fn=None):
    vr = [[pb.V(p, part) for p in rg] for rg in rings]
    n = len(rings[0])
    nn = n if closed else n - 1
    for r in range(len(rings) - 1):
        for i in range(nn):
            j = (i + 1) % n
            pb.F((vr[r][i], vr[r][j], vr[r + 1][j], vr[r + 1][i]), hex_fn(r) if hex_fn else hexc_, smooth, face_fn(r, i) if face_fn else False)
    if closed:
        if cap_bot: pb.F(vr[0][::-1], hex_fn(0) if hex_fn else hexc_, smooth)
        if cap_top: pb.F(vr[-1], hex_fn(len(rings) - 2) if hex_fn else hexc_, smooth)
    return vr

def sphere(pb, c, rx, ry, rz, part, hexc_, nu=8, nv=5, smooth=True):
    rings = []
    for j in range(1, nv):
        th = math.pi * j / nv
        rings.append(ring(c[0], c[1], c[2] + rz * math.cos(th), rx * math.sin(th), ry * math.sin(th), nu))
    top = pb.V((c[0], c[1], c[2] + rz), part); bot = pb.V((c[0], c[1], c[2] - rz), part)
    vr = [[pb.V(p, part) for p in rg] for rg in rings]
    for i in range(nu):
        pb.F((top, vr[0][(i + 1) % nu], vr[0][i]), hexc_, smooth); pb.F((bot, vr[-1][i], vr[-1][(i + 1) % nu]), hexc_, smooth)
    for r in range(len(vr) - 1):
        for i in range(nu):
            pb.F((vr[r][i], vr[r][(i + 1) % nu], vr[r + 1][(i + 1) % nu], vr[r + 1][i]), hexc_, smooth)

def rbox(pb, c, s, part, hexc_, rad=0.02, n=3):
    """Rounded box: superellipse rings along y."""
    cx, cy, cz = c; sx, sy, sz = s[0] / 2, s[1] / 2, s[2] / 2
    def sq(a, b, e=0.35):
        ca, sa = math.cos(a), math.sin(a)
        return (math.copysign(abs(ca) ** e, ca), math.copysign(abs(sa) ** e, sa))
    rings = []
    for k in range(5):
        t = k / 4.0
        y = cy - sy + 2 * sy * t
        sc = 1.0 if 0 < k < 4 else 0.96
        rings.append([(cx + sx * sc * sq(2 * math.pi * i / 14, 0)[0], y, cz + sz * sc * sq(2 * math.pi * i / 14, 0)[1]) for i in range(14)])
    loft(pb, rings, part, hexc_, smooth=False)

def tube_pts(pb, pts, radii, part, hexc_, n=10, hex_fn=None, cap_top=True, cap_bot=True):
    rings = [ring(p[0], p[1], p[2], r, r, n) for p, r in zip(pts, radii)]
    return loft(pb, rings, part, hexc_, hex_fn=hex_fn, cap_top=cap_top, cap_bot=cap_bot)

# ------------------------------------------------------------------ body proportions
def proportions(pd):
    H = pd['H']; kind = pd['kind']
    child = kind in ('boy', 'girl')
    teen = kind == 'teen'
    fem = kind in ('woman', 'girl') or (kind == 'teen' and pd['id'] == 'teen_girl') or (kind == 'elder' and 'woman' in pd['id'])
    # skull top is a little below the total height (hair / hats add ~1-3 cm); hats add more
    extra = 0.02
    if pd.get('hat'): extra = 0.045
    Hs = H - extra
    P = {}
    P['H'] = Hs; P['fem'] = fem; P['child'] = child
    hh_ratio = 1 / 7.4 if not child else (1 / 6.3 if H > 1.25 else 1 / 5.6)
    if teen: hh_ratio = 1 / 7.0
    P['hh'] = Hs * hh_ratio                                  # head height chin-crown
    P['chin'] = Hs - P['hh']
    leg = 0.51 if not child else 0.46
    if fem and not child: leg = 0.50
    P['hip'] = Hs * leg                                       # hip joint height
    P['knee'] = P['hip'] * 0.555
    P['ankle'] = Hs * 0.045 + 0.012
    neck_len = P['hh'] * 0.28
    P['neck_top'] = P['chin'] + P['hh'] * 0.05
    P['sh'] = P['chin'] - 0.052 * Hs                              # shoulder (acromion) height
    P['trap'] = P['sh'] + 0.022 * Hs / 1.7
    P['nbase'] = P['trap'] + 0.020
    wf = 0.108 if not fem else 0.093                            # half shoulder width as fraction of H
    if child: wf = 0.105
    P['shw'] = Hs * wf * pd['build'] ** 0.4                     # shoulder joint half width
    P['hipw'] = Hs * (0.095 if not fem else 0.103) * pd['build']
    P['k'] = Hs / 1.76
    return P

def torso_ctrl(pd, P):
    H = P['H']; k = P['k']; b = pd['build']; fem = P['fem']; child = P['child']
    z = lambda f: H * f
    shw = P['shw']
    if not fem:
        c = [(z(0.455), 0.166 * k * b, 0.100 * k * b, 0.0), (z(0.51), 0.178 * k * b, 0.108 * k * b, 0.0), (z(0.568), 0.158 * k * b, 0.098 * k * b, 0.0), (z(0.614), 0.150 * k * b, 0.094 * k * b, 0.004),
             (z(0.682), 0.163 * k * b, 0.102 * k * b, 0.008), (z(0.739), 0.178 * k * b, 0.108 * k * b, 0.010), (z(0.784), shw * 0.97, 0.098 * k, 0.004), (P['sh'] + 0.015, shw * 0.92, 0.080 * k, -0.004),
             (P['trap'], shw * 0.60, 0.066 * k, -0.012), (P['nbase'], 0.066 * k, 0.058 * k, -0.01)]
    else:
        c = [(z(0.455), 0.162 * k * b, 0.100 * k * b, 0.0), (z(0.505), 0.182 * k * b, 0.108 * k * b, -0.004), (z(0.565), 0.140 * k * b, 0.090 * k, 0.0), (z(0.612), 0.118 * k * b, 0.082 * k, 0.003),
             (z(0.682), 0.140 * k * b, 0.100 * k * b, 0.014), (z(0.738), 0.152 * k * b, 0.112 * k * b, 0.022), (z(0.784), shw * 0.97, 0.095 * k, 0.006), (P['sh'] + 0.015, shw * 0.92, 0.076 * k, -0.004),
             (P['trap'], shw * 0.60, 0.062 * k, -0.012), (P['nbase'], 0.060 * k, 0.054 * k, -0.01)]
    if child:
        c = [(zz, rx * 0.95, ry * 1.02, cy) for zz, rx, ry, cy in c]
    return c

# ------------------------------------------------------------------ the person
def build_person(pd):
    P = proportions(pd); H = P['H']; k = P['k']; fem = P['fem']; child = P['child']
    pb = PB(); skin = SKIN[pd['skin']]
    stoop = pd.get('stoop', 0.0)
    kind = pd['kind']
    top = pd['top']; tst = pd['top_style']; bot = pd['bot']; bst = pd['bot_style']
    sleeve = pd.get('sleeve', 'long')
    lean = lambda z: stoop * max(0.0, z - P['hip']) * 0.55          # forward lean of the upper body
    hh = P['hh']
    # ---------------- torso (skin underneath is only visible at the neck) + clothing layer
    tc = torso_ctrl(pd, P)
    rows = crv(tc, 16)
    def torso_rings(scale, y_off=0.0, z0=None, extra_rx=0.0):
        rs = []
        for z, rx, ry, cy in rows:
            rs.append(ring(0, cy + lean(z) + y_off, z, rx * scale + extra_rx, ry * scale + extra_rx * 0.8, 14))
        return rs
    outer = pd.get('top_style') in ('jacket', 'puffer', 'coat')
    layer = {'tshirt': 1.012, 'football': 1.012, 'hoodie': 1.03, 'jumper': 1.022, 'shirt': 1.012, 'dress': 1.012, 'jacket': 1.035, 'puffer': 1.065, 'coat': 1.04}.get(tst, 1.02)
    waist_z = H * 0.614
    def thex(r):
        z = rows[r][0]
        if tst in ('jacket', 'puffer', 'coat'): return top
        if tst == 'dress': return top
        return top if z > waist_z - 0.01 else (bot if bst not in ('skirt',) else top)
    vr_t = loft(pb, torso_rings(layer), 'torso', top, hex_fn=thex, cap_top=True, cap_bot=True)
    if pd.get('inner') and outer:    # shirt/collar visible at the neck opening
        loft(pb, [ring(0, lean(P['nbase']) - 0.01 + 0.012, z, rx, ry, 10) for z, rx, ry in ((P['trap'] + 0.0, 0.07 * k, 0.062 * k), (P['nbase'] + 0.025, 0.056 * k, 0.05 * k))], 'neck', pd['inner'], cap_top=False, cap_bot=False)
    if pd.get('vest'):
        loft(pb, [r_ for r_ in [ring(0, rows[i][3] + lean(rows[i][0]) + 0.003, rows[i][0], rows[i][1] * 1.075, rows[i][2] * 1.07, 14) for i in range(3, 13)]], 'torso', pd['vest'], cap_top=False, cap_bot=False)
        for zi in (6, 9):
            loft(pb, [ring(0, rows[i][3] + lean(rows[i][0]) + 0.004, rows[i][0], rows[i][1] * 1.08, rows[i][2] * 1.075, 14) for i in (zi, zi + 1)], 'torso', '#c9cdd1', cap_top=False, cap_bot=False)
    if pd.get('cardigan'):
        loft(pb, [ring(0, rows[i][3] + lean(rows[i][0]) + 0.002, rows[i][0], rows[i][1] * 1.05, rows[i][2] * 1.05, 14) for i in range(4, 13)], 'torso', pd['cardigan'], cap_top=False, cap_bot=False)
    # hem / skirt-like extensions for long garments (weights: hips + thighs)
    hipw = P['hipw']
    if tst in ('coat', 'puffer', 'jacket', 'dress') or bst == 'skirt':
        hem = {'coat': 0.30, 'puffer': 0.42, 'jacket': 0.40, 'dress': 0.30}.get(tst, 0.30)
        hem_z = H * (0.265 if tst == 'coat' else (0.30 if tst == 'dress' else 0.36)) if bst != 'skirt' or tst in ('coat',) else H * 0.28
        if bst == 'skirt' and tst not in ('coat', 'dress'): hem_z = H * 0.27
        z_top = rows[0][0] + 0.02; z_bot = hem_z
        rs = []
        for i in range(7):
            t = i / 6.0
            z = z_top + (z_bot - z_top) * t
            sc = 1.0 + (0.30 if tst in ('coat', 'dress') or bst == 'skirt' else 0.14) * t ** 1.4
            rs.append(ring(0, 0, z, (rows[1][1] * layer) * sc, (rows[1][2] * layer) * (0.9 + 0.35 * t) * sc, 14))
        colr = top if tst in ('coat', 'puffer', 'jacket', 'dress') else bot
        loft(pb, rs, 'skirt', colr, cap_top=False, cap_bot=True)
        # hem trim
        loft(pb, [rs[-1], [(x, y, z + 0.0) for x, y, z in rs[-1]]], 'skirt', colr, cap_top=False, cap_bot=False)
    # hood for hoodies (bunched at the neck, behind)
    if tst == 'hoodie':
        loft(pb, [ring(0, -0.05 * k, P['trap'] + 0.04, 0.095 * k, 0.07 * k, 10), ring(0, -0.075 * k, P['trap'] - 0.02, 0.105 * k, 0.07 * k, 10), ring(0, -0.07 * k, P['trap'] - 0.09, 0.09 * k, 0.05 * k, 10)], 'torso', top, cap_top=True, cap_bot=True)
    # collars for coats
    if tst in ('coat', 'jacket', 'puffer'):
        loft(pb, [ring(0, lean(P['nbase']) - 0.01, P['trap'] - 0.01, 0.085 * k, 0.07 * k, 12), ring(0, lean(P['nbase']) - 0.012, P['nbase'] + 0.035, 0.07 * k, 0.062 * k, 12)], 'torso', top, cap_top=False, cap_bot=False)
    # ---------------- neck + head
    ncy = lean(P['nbase']) * 0.7
    nrings = [ring(0, ncy, P['nbase'] - 0.03, 0.062 * k, 0.058 * k, 10), ring(0, ncy + 0.004, P['nbase'] + 0.03 * k, 0.052 * k, 0.050 * k, 10), ring(0, ncy + 0.012, P['chin'] + hh * 0.18, 0.050 * k, 0.050 * k, 10)]
    loft(pb, nrings, 'neck', skin, cap_top=False, cap_bot=False)
    # head: skull profile (rx, ry, cy) over height fractions
    male = not fem
    hf = [0.0, 0.05, 0.14, 0.28, 0.46, 0.66, 0.82, 0.93, 1.0]
    wscale = 1.0 if male else 0.94
    if child: wscale = 1.03
    hrx = [0.095, 0.19, 0.285, 0.325, 0.335, 0.33, 0.29, 0.20, 0.06]
    hry = [0.13, 0.25, 0.345, 0.405, 0.43, 0.43, 0.39, 0.30, 0.10]
    hcy = [0.30, 0.22, 0.10, 0.03, 0.0, 0.0, -0.01, -0.02, -0.02]
    if not male or child:     # softer, rounder jaw
        hrx[1] += 0.01; hrx[2] += 0.012; hry[2] -= 0.01
    ctrl = [(P['chin'] + f * hh, hrx[i] * hh * wscale, hry[i] * hh, hcy[i] * hh + lean(P['chin']) * 0.9) for i, f in enumerate(hf)]
    hrows = crv(ctrl, 13)
    hy0 = lean(P['chin']) * 0.9
    NH = 16
    def hring(row, sc=1.0, dy=0.0, drx=0.0, dry=0.0):
        z, rx, ry, cy = row
        return ring(0, cy + dy, z, rx * sc + drx, ry * sc + dry, NH)
    # face-region tagging: faces on the front (angle ~ +y) between 0.10 and 0.88 of the head height
    def face_fn(r, i):
        z = hrows[r][0]; f = (z - P['chin']) / hh
        ang = (i + 0.5) / NH * 2 * math.pi
        return (0.09 < f < 0.90) and (math.sin(ang) > 0.35)
    loft(pb, [hring(r) for r in hrows], 'head', skin, cap_top=True, cap_bot=True, face_fn=face_fn)
    # nose, ears, lips
    nz = P['chin'] + hh * 0.40
    nf = ctrl[4][2] + ctrl[4][3]
    loft(pb, [ring(0, nf - 0.004, nz + hh * 0.12, 0.009 * k, 0.007 * k, 8), ring(0, nf + 0.008 * k, nz - hh * 0.04, 0.014 * k, 0.017 * k, 8), ring(0, nf + 0.008 * k, nz - hh * 0.11, 0.017 * k, 0.014 * k, 8)], 'head', skin, cap_top=True, cap_bot=True)
    for sg in (-1, 1):
        sphere(pb, (sg * (hrx[4] * hh * wscale + 0.002), hy0 - 0.012, P['chin'] + hh * 0.48), 0.010 * k, 0.026 * k, 0.034 * k * (hh / 0.235), 'head', skin, 6, 4)
    # ---------------- hair
    hcol = HAIR[pd['hair'][0]]; style = pd['hair'][1]
    zc_f = lambda f: P['chin'] + f * hh
    def hair_cap(f_front, f_back, thick=0.011, flare=0.0):
        """Cap rows from the crown down: front stops at f_front (hairline), back/sides continue to f_back."""
        rings_h = []
        fl = [1.0, 0.94, 0.86, 0.78]
        for j, fj in enumerate(fl):
            row = crv(ctrl, 40)[min(39, int(fj * 39))] if False else None
        # use the skull rows directly
        cap_rows = [r_ for r_ in hrows if (r_[0] - P['chin']) / hh >= f_front - 0.02]
        rg = []
        for r_ in cap_rows:
            rg.append(hring(r_, 1.0, 0.0, thick, thick))
        return rg
    if style != 'bald':
        top_rows = [r_ for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.66]
        th = 0.012 * k
        rg = [hring(r_, 1.0, -0.002, th, th) for r_ in top_rows]
        # forehead hairline: pull the front verts of the lowest cap ring up so the forehead stays free
        low = rg[0]
        low = [(x, y, z + (0.045 * hh * max(0.0, math.sin(math.atan2(y - hy0, x))) if y > hy0 else 0.0)) for x, y, z in low]
        rg[0] = low
        if style in ('short', 'curly', 'pony', 'bun', 'bob', 'long'):
            loft(pb, rg, 'head', hcol, cap_top=True, cap_bot=False, closed=True)
        # back / sides skirt: arc covering the back half only (angles 105..255 deg => -y side)
        def back_skirt(f_top, f_bot, spread, nrows=6, rx_extra=0.0):
            rs = []
            for i in range(nrows):
                t = i / (nrows - 1); f = f_top + (f_bot - f_top) * t
                zz = zc_f(f)
                if f >= 0.0:
                    row = crv(ctrl, 30)[min(29, max(0, int(f * 29)))]
                    rxh, ryh, cyh = row[1], row[2], row[3]
                else:
                    rxh, ryh, cyh = ctrl[0][1] * 1.2, ctrl[0][2] * 1.2, ctrl[0][3]
                grow = 1.0 + spread * t
                rs.append(ring(0, cyh - 0.004, zz, (rxh + th + rx_extra * t) * grow, (ryh + th) * grow * (1.0 if f > 0 else 0.7), 10, a0=math.radians(195), a1=math.radians(345), closed=False))
            return rs
        if style == 'short': loft(pb, back_skirt(0.70, 0.42, 0.0, 4), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
        if style == 'curly':
            loft(pb, back_skirt(0.70, 0.38, 0.12, 4), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
            for a_ in range(0, 360, 40):
                ca, sa = math.cos(math.radians(a_)), math.sin(math.radians(a_))
                if sa > 0.55: continue
                sphere(pb, (ca * ctrl[6][1] * 1.05, hy0 + sa * ctrl[6][2] * 1.05, zc_f(0.80)), 0.030 * k, 0.030 * k, 0.026 * k, 'head', hcol, 6, 4)
            for a_ in (60, 120, 180, 240, 300):
                ca, sa = math.cos(math.radians(a_)), math.sin(math.radians(a_))
                sphere(pb, (ca * ctrl[7][1] * 0.9, hy0 + sa * ctrl[7][2] * 0.9, zc_f(0.98)), 0.032 * k, 0.032 * k, 0.028 * k, 'head', hcol, 6, 4)
        if style == 'bob': loft(pb, back_skirt(0.70, 0.14, 0.18, 6), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
        if style == 'long':
            loft(pb, back_skirt(0.70, -0.55, 0.30, 9), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
        if style == 'pony':
            loft(pb, back_skirt(0.70, 0.50, 0.0, 3), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
            pts = [(0, hy0 - ctrl[7][2] * 1.0, zc_f(0.90)), (0, hy0 - ctrl[7][2] * 1.5, zc_f(0.70)), (0, hy0 - ctrl[7][2] * 1.6, zc_f(0.30)), (0, hy0 - ctrl[7][2] * 1.4, zc_f(-0.10))]
            tube_pts(pb, pts, [0.030 * k, 0.034 * k, 0.030 * k, 0.012 * k], 'head', hcol, n=8)
            sphere(pb, pts[0], 0.022 * k, 0.022 * k, 0.018 * k, 'head', '#d03a5a', 6, 3)
        if style == 'bun':
            loft(pb, back_skirt(0.70, 0.48, 0.0, 3), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
            sphere(pb, (0, hy0 - ctrl[7][2] * 0.9, zc_f(1.02)), 0.050 * k, 0.050 * k, 0.045 * k, 'head', hcol, 8, 5)
    if pd.get('beard'):
        rs = []
        for f in (0.38, 0.28, 0.16, 0.05, -0.02):
            row = crv(ctrl, 30)[min(29, max(0, int(max(f, 0) * 29)))]
            rs.append(ring(0, row[3] + 0.006, zc_f(f), row[1] + 0.010, row[2] + 0.012, 10, a0=math.radians(10), a1=math.radians(170), closed=False))
        loft(pb, rs, 'head', hcol, closed=False, cap_top=False, cap_bot=False)
        box_pts = None
    # hats
    hat = pd.get('hat')
    if hat:
        hs, hc = hat
        if hs == 'beanie':
            rs = [hring(r_, 1.0, -0.004, 0.016 * k, 0.016 * k) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.62]
            loft(pb, rs, 'head', hc, cap_top=True, cap_bot=False)
            loft(pb, [rs[0], [(x, y, z - 0.012) for x, y, z in rs[0]]], 'head', '#d9d9d9', cap_top=False, cap_bot=False)
        if hs == 'cap':
            rs = [hring(r_, 1.0, -0.002, 0.012 * k, 0.012 * k) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.70]
            loft(pb, rs, 'head', hc, cap_top=True, cap_bot=False)
            zb = rs[0][0][2]
            pk = [(-0.07 * k, hy0 + ctrl[6][2] + 0.0, zb + 0.004), (0.07 * k, hy0 + ctrl[6][2] + 0.0, zb + 0.004), (0.06 * k, hy0 + ctrl[6][2] + 0.075 * k, zb - 0.004), (-0.06 * k, hy0 + ctrl[6][2] + 0.075 * k, zb - 0.004)]
            vv = [pb.V(p, 'head') for p in pk]; pb.F(vv, hc, False); pb.F(vv[::-1], hc, False)
    if pd.get('glasses'):
        for sg in (-1, 1):
            loft(pb, [ring(sg * 0.036 * k, hy0 + ctrl[4][2] + 0.012, zc_f(0.54), 0.021 * k, 0.003, 10), ring(sg * 0.036 * k, hy0 + ctrl[4][2] + 0.016, zc_f(0.54), 0.021 * k, 0.003, 10)], 'head', '#1a1a1a', cap_top=False, cap_bot=False)
        pb.F([pb.V((-0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.55)), 'head'), pb.V((0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.55)), 'head'), pb.V((0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.54)), 'head'), pb.V((-0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.54)), 'head')], '#1a1a1a', False)
    # ---------------- arms (clothing sleeve layer over the arm, skin beyond the sleeve)
    sh = P['sh']; shw = P['shw']
    ua = 0.186 * H; fa = 0.146 * H
    elbow = sh - ua; wrist = elbow - fa
    child_f = 0.88 if child else 1.0
    ru = 0.048 * k * child_f * pd['build'] ** 0.5; rf = 0.037 * k * child_f
    sl_up = layer + 0.0
    sleeve_hex = top if (sleeve == 'long' or tst in ('jacket', 'puffer', 'coat', 'hoodie', 'jumper')) else None
    sleeve_thick = {'jacket': 0.018, 'puffer': 0.028, 'coat': 0.020, 'hoodie': 0.012, 'jumper': 0.010}.get(tst, 0.006)
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'
        sx = sg * (shw - 0.012)
        up_c = [(sh + 0.03, ru * 0.55, 0, 0), (sh + 0.005, ru * 1.05, 0, 0), (sh - ua * 0.30, ru * 1.0, 0, 0), (elbow + 0.02, ru * 0.82, 0, 0)]
        up_rows = crv(up_c, 6)
        fa_c = [(elbow + 0.02, rf * 1.12, 0, 0), (elbow - fa * 0.25, rf * 1.12, 0, 0), (elbow - fa * 0.65, rf * 0.92, 0, 0), (wrist + 0.015, rf * 0.72, 0, 0)]
        fa_rows = crv(fa_c, 6)
        if sleeve_hex is None:
            loft(pb, [ring(sx, 0, z, r + (0.006 if tst == 'tshirt' else 0.004), r + 0.004, 10) for z, r, _, _ in up_rows[:4]], 'arm' + sd, top, cap_top=False, cap_bot=True)   # short sleeve
            loft(pb, [ring(sx, 0, z, r, r, 10) for z, r, _, _ in up_rows[3:]], 'arm' + sd, skin, cap_top=False, cap_bot=False)
            loft(pb, [ring(sx, 0.0, z, r, r, 10) for z, r, _, _ in fa_rows], 'farm' + sd, skin, cap_top=False, cap_bot=False)
        else:
            loft(pb, [ring(sx, 0, z, r + sleeve_thick, r + sleeve_thick, 10) for z, r, _, _ in up_rows], 'arm' + sd, sleeve_hex, cap_top=False, cap_bot=True)
            loft(pb, [ring(sx, 0.0, z, r + sleeve_thick, r + sleeve_thick, 10) for z, r, _, _ in fa_rows], 'farm' + sd, sleeve_hex, cap_top=False, cap_bot=False)
            cuff = '#d9d9d9' if tst in ('hoodie', 'jumper') and False else sleeve_hex
            loft(pb, [ring(sx, 0, wrist + 0.03, rf * 0.8 + sleeve_thick + 0.004, rf * 0.8 + sleeve_thick + 0.004, 10), ring(sx, 0, wrist + 0.005, rf * 0.76 + sleeve_thick + 0.004, rf * 0.76 + sleeve_thick + 0.004, 10)], 'farm' + sd, cuff if sleeve_hex else skin, cap_top=False, cap_bot=False)
        sphere(pb, (sx + sg * 0.004, 0.0, sh - 0.008), ru * 1.2 + (sleeve_thick if sleeve_hex else 0.0), ru * 1.15, ru * 1.25, 'arm' + sd, sleeve_hex if sleeve_hex else (top if tst in ('tshirt', 'football', 'dress') else skin), 10, 6)
        # hand: palm + 4 fingers + thumb (fingers hang straight; the `fingers` bone curls them)
        hl = 0.108 * H; hw_ = 0.040 * k * child_f
        loft(pb, [ring(sx, 0.0, wrist + 0.01, hw_ * 0.55, 0.014 * k, 8), ring(sx, 0.0, wrist - 0.02 * k, hw_, 0.018 * k, 8), ring(sx, 0.0, wrist - hl * 0.42, hw_ * 0.98, 0.016 * k, 8), ring(sx, 0.0, wrist - hl * 0.50, hw_ * 0.90, 0.013 * k, 8)], 'hand' + sd, skin, cap_top=True, cap_bot=False)
        fl = [0.46, 0.52, 0.48, 0.38]
        for fi in range(4):
            fx = sx + (fi - 1.5) * hw_ * 0.46
            z0 = wrist - hl * 0.5
            pts = [(fx, 0.002, z0), (fx, 0.003, z0 - hl * fl[fi] * 0.55), (fx, 0.0, z0 - hl * fl[fi])]
            tube_pts(pb, pts, [0.0095 * k * child_f, 0.0085 * k * child_f, 0.0060 * k * child_f], 'fingers' + sd, skin, n=6)
        th_pts = [(sx - sg * hw_ * 0.95, 0.012 * k, wrist - hl * 0.10), (sx - sg * hw_ * 1.02, 0.020 * k, wrist - hl * 0.30), (sx - sg * hw_ * 0.90, 0.030 * k, wrist - hl * 0.46)]
        tube_pts(pb, th_pts, [0.0115 * k * child_f, 0.0105 * k * child_f, 0.0075 * k * child_f], 'fingers' + sd, skin, n=6)
    # ---------------- legs (trousers layer) + shoes
    hx = hipw * 0.52
    thigh_len = P['hip'] - P['knee']
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'
        r0 = 0.076 * k * child_f * pd['build'] ** 0.5; r1 = 0.058 * k * child_f; r2 = 0.045 * k * child_f; r3 = 0.034 * k * child_f
        lay = {'jeans': 0.009, 'trousers': 0.007, 'leggings': 0.003, 'skirt': 0.0, 'shorts': 0.006}.get(bst, 0.007)
        leg_hex = bot
        if bst == 'skirt': leg_hex = '#2a2a2e'
        zt = P['hip'] + 0.01
        th_c = [(zt, r0 * 1.0, 0, 0), (P['hip'] - thigh_len * 0.35, r0 * 0.92, 0, 0), (P['knee'] + 0.02, r1 * 1.02, 0, 0)]
        th_rows = crv(th_c, 6)
        sh_c = [(P['knee'] + 0.02, r1 * 1.02, 0, 0), (P['knee'] - 0.12 * k, r1 * 0.96, 0, 0), (P['knee'] - 0.24 * k, r2 * 1.04, 0, 0), (P['ankle'] + 0.05, r3 * 1.08, 0, 0)]
        sh_rows = crv(sh_c, 6)
        if bst == 'shorts':
            loft(pb, [ring(sg * hx, 0, z, r + lay, r + lay, 10) for z, r, _, _ in th_rows[:5]], 'thigh' + sd, leg_hex, cap_top=False, cap_bot=True)
            loft(pb, [ring(sg * hx, 0, z, r, r, 10) for z, r, _, _ in th_rows[4:]], 'thigh' + sd, skin, cap_top=False, cap_bot=False)
            loft(pb, [ring(sg * hx, 0, z, r, r, 10) for z, r, _, _ in sh_rows], 'shin' + sd, skin, cap_top=False, cap_bot=False)
            # socks
            loft(pb, [ring(sg * hx, 0, P['knee'] - 0.12 * k, r1 * 0.98 + 0.004, r1 * 0.98 + 0.004, 10), ring(sg * hx, 0, P['ankle'] + 0.06, r3 * 1.1 + 0.004, r3 * 1.1 + 0.004, 10)], 'shin' + sd, '#f2f2f2', cap_top=False, cap_bot=False)
        elif bst == 'skirt':
            loft(pb, [ring(sg * hx, 0, z, r, r, 10) for z, r, _, _ in th_rows], 'thigh' + sd, '#26262a', cap_top=False, cap_bot=False)
            loft(pb, [ring(sg * hx, 0, z, r, r, 10) for z, r, _, _ in sh_rows], 'shin' + sd, '#26262a', cap_top=False, cap_bot=False)
        else:
            flare = 0.006 if bst == 'jeans' else 0.0
            loft(pb, [ring(sg * hx, 0, z, r + lay, r + lay, 10) for z, r, _, _ in th_rows], 'thigh' + sd, leg_hex, cap_top=False, cap_bot=(True))
            loft(pb, [ring(sg * hx, 0, z, r + lay + (flare if i == len(sh_rows) - 1 else 0), r + lay + (flare if i == len(sh_rows) - 1 else 0), 10) for i, (z, r, _, _) in enumerate(sh_rows)], 'shin' + sd, leg_hex, cap_top=False, cap_bot=False)
        # shoes: shaped loft along y + sole
        sst, sc_, sole_c = pd['shoe']
        sl_ = 0.265 * k * (0.82 if child else 1.0); sw_ = 0.052 * k * (0.9 if child else 1.0)
        shoe_h = {'trainer': 0.082, 'shoe': 0.080, 'boot': 0.20}[sst] * k
        ysh = [-0.045 * k, -0.02 * k, 0.03 * k, 0.11 * k, 0.185 * k, sl_ * 0.92, sl_]
        rows_s = []
        for j, yy in enumerate(ysh):
            t = j / (len(ysh) - 1)
            wid = sw_ * (0.78 if j == 0 else (0.95 if j in (1, 2) else (1.05 if j == 3 else (0.95 if j == 4 else (0.62 if j == 5 else 0.30)))))
            hgt = shoe_h if j < 3 else shoe_h * (0.78 if j == 3 else (0.55 if j == 4 else (0.38 if j == 5 else 0.18)))
            zz = 0.028 * k + hgt * 0.5
            if sst == 'boot' and j < 3: hgt = shoe_h * 0.6; zz = 0.028 * k + hgt * 0.5
            rows_s.append(ring(sg * hx, yy, zz, wid, 0.0 + 0.0, 10) if False else [(sg * hx + wid * math.cos(2 * math.pi * i / 10), yy, zz + hgt * 0.5 * math.sin(2 * math.pi * i / 10)) for i in range(10)])
        loft(pb, rows_s, 'foot' + sd, sc_, cap_top=True, cap_bot=True)
        # sole
        rows_so = []
        for j, yy in enumerate(ysh):
            wid = sw_ * (0.80 if j == 0 else (0.98 if j in (1, 2) else (1.08 if j == 3 else (0.98 if j == 4 else (0.66 if j == 5 else 0.34)))))
            rows_so.append([(sg * hx + wid * math.cos(2 * math.pi * i / 10), yy, 0.0125 * k + 0.0125 * k * math.sin(2 * math.pi * i / 10)) for i in range(10)])
        loft(pb, rows_so, 'foot' + sd, sole_c, cap_top=True, cap_bot=True)
        if sst == 'boot':
            loft(pb, [ring(sg * hx, -0.004, P['ankle'] + 0.02, r3 * 1.5, r3 * 1.5, 10), ring(sg * hx, -0.004, P['ankle'] + 0.14 * k, r3 * 1.45 + lay, r3 * 1.45 + lay, 10), ring(sg * hx, -0.004, P['ankle'] + 0.16 * k, r3 * 1.5 + lay, r3 * 1.5 + lay, 10)], 'shin' + sd, sc_, cap_top=False, cap_bot=False)
    # ---------------- scarf, bags
    if pd.get('scarf'):
        sc = pd['scarf']
        loft(pb, [ring(0, ncy, P['nbase'] - 0.015, 0.078 * k, 0.074 * k, 12), ring(0, ncy, P['nbase'] + 0.025 * k, 0.074 * k, 0.07 * k, 12), ring(0, ncy + 0.004, P['nbase'] + 0.05 * k, 0.066 * k, 0.064 * k, 12)], 'neck', sc, cap_top=False, cap_bot=False)
        rbox(pb, (0.03 * k, rows[12][2] + 0.06 * k, P['nbase'] - 0.12 * k), (0.07 * k, 0.025, 0.24 * k), 'chest', sc)
    bag = pd.get('bag')
    if bag:
        bs_, bc = bag
        zc = P['sh'] - 0.17 * k
        bdy = rows[8][2] + lean(P['sh'] - 0.2)
        if bs_ == 'backpack':
            rbox(pb, (0, -(rows[8][2] + 0.075 * k + 0.0 + lean(P['sh']) * 0.5), zc), (0.30 * k, 0.15 * k, 0.40 * k), 'chest', bc)
            rbox(pb, (0, -(rows[8][2] + 0.17 * k + lean(P['sh']) * 0.5), zc - 0.07 * k), (0.22 * k, 0.05 * k, 0.20 * k), 'chest', bc)
            for sg in (-1, 1):
                rbox(pb, (sg * 0.085 * k, 0.0, P['sh'] - 0.03), (0.035 * k, 0.17 * k, 0.012), 'chest', bc)
        elif bs_ == 'schoolbag':
            rbox(pb, (0, -(rows[8][2] + 0.065 * k), zc), (0.27 * k, 0.12 * k, 0.34 * k), 'chest', bc)
            rbox(pb, (0, -(rows[8][2] + 0.14 * k), zc + 0.05 * k), (0.2 * k, 0.04 * k, 0.12 * k), 'chest', '#f0d040')
            for sg in (-1, 1): rbox(pb, (sg * 0.08 * k, 0.0, P['sh'] - 0.03), (0.03 * k, 0.15 * k, 0.012), 'chest', bc)
        elif bs_ == 'handbag':
            sd_x = shw * 1.0 + 0.09 * k
            rbox(pb, (sd_x, 0.04 * k, P['hip'] - 0.05 * k), (0.07 * k, 0.28 * k, 0.22 * k), 'thigh_r', bc)
            loft(pb, [ring(sd_x - 0.02, 0.04 * k, P['hip'] + 0.12 * k, 0.012, 0.012, 6), ring(sd_x - 0.04, 0.04 * k, P['hip'] + 0.03 * k, 0.012, 0.012, 6)], 'thigh_r', bc, cap_top=True, cap_bot=True)
        elif bs_ == 'shoulder':
            rbox(pb, (shw * 0.95 + 0.09 * k, 0.01, P['hip'] + 0.0), (0.06 * k, 0.24 * k, 0.20 * k), 'thigh_r', bc)
            for sg in (1,):
                pass
            tube_pts(pb, [(shw * 0.55, 0.0, P['sh'] + 0.0), (0.0, rows[8][2] + 0.012 * k, rows[6][0] + 0.06), (-shw * 0.7, 0.0, P['hip'] + 0.12 * k)], [0.008, 0.008, 0.008], 'chest', bc, n=5) if False else None
            rbox(pb, (shw * 0.55, 0.0, (P['sh'] + P['hip'] + 0.0) / 2 + 0.2 * k), (0.02 * k, 0.05 * k, 0.40 * k), 'chest', bc)
    # normalise: soles on z=0
    # (soles are built from z=0 already)
    return pb, P, dict(rows=rows, ctrl=ctrl, hy0=hy0)

# ------------------------------------------------------------------ rig
def bone_defs(P, pd, g):
    H = P['H']; k = P['k']; sh = P['sh']; shw = P['shw']; hipw = P['hipw']
    ua = 0.186 * H; fa = 0.146 * H; hl = 0.108 * H
    elbow = sh - ua; wrist = elbow - fa
    hx = hipw * 0.52
    d = {}
    hipz = P['hip']
    waist = H * 0.614
    chest = H * 0.72
    d['hips'] = ((0, 0, hipz - 0.04), (0, 0, hipz + 0.10 * k), None)
    d['spine'] = ((0, 0, hipz + 0.10 * k), (0, 0, waist + 0.10 * k), 'hips')
    d['chest'] = ((0, 0, waist + 0.10 * k), (0, 0, sh + 0.02), 'spine')
    d['neck'] = ((0, 0, P['nbase'] - 0.01), (0, 0, P['chin'] + 0.02), 'chest')
    d['head'] = ((0, 0, P['chin'] + 0.02), (0, 0, P['chin'] + P['hh']), 'neck')
    for sg, s in ((-1, 'l'), (1, 'r')):
        d['clavicle_' + s] = ((sg * 0.02, 0, sh), (sg * shw * 0.98, 0, sh), 'chest')
        d['upperarm_' + s] = ((sg * (shw - 0.012), 0, sh), (sg * (shw - 0.012), 0, elbow), 'clavicle_' + s)
        d['forearm_' + s] = ((sg * (shw - 0.012), 0, elbow), (sg * (shw - 0.012), 0, wrist), 'upperarm_' + s)
        d['hand_' + s] = ((sg * (shw - 0.012), 0, wrist), (sg * (shw - 0.012), 0, wrist - hl * 0.5), 'forearm_' + s)
        d['fingers_' + s] = ((sg * (shw - 0.012), 0, wrist - hl * 0.5), (sg * (shw - 0.012), 0, wrist - hl), 'hand_' + s)
        d['thigh_' + s] = ((sg * hx, 0, hipz), (sg * hx, 0, P['knee']), 'hips')
        d['shin_' + s] = ((sg * hx, 0, P['knee']), (sg * hx, 0, P['ankle']), 'thigh_' + s)
        d['foot_' + s] = ((sg * hx, 0, P['ankle']), (sg * hx, 0.12 * k, P['ankle']), 'shin_' + s)
    return d

ALLOWED = {
    'torso': ['hips', 'spine', 'chest', 'neck', 'clavicle_l', 'clavicle_r'], 'skirt': ['hips', 'thigh_l', 'thigh_r', 'spine'], 'neck': ['neck', 'chest', 'head'], 'head': ['head', 'neck'],
    'arm_l': ['clavicle_l', 'upperarm_l', 'forearm_l', 'chest'], 'farm_l': ['upperarm_l', 'forearm_l', 'hand_l'], 'hand_l': ['forearm_l', 'hand_l', 'fingers_l'], 'fingers_l': ['hand_l', 'fingers_l'],
    'arm_r': ['clavicle_r', 'upperarm_r', 'forearm_r', 'chest'], 'farm_r': ['upperarm_r', 'forearm_r', 'hand_r'], 'hand_r': ['forearm_r', 'hand_r', 'fingers_r'], 'fingers_r': ['hand_r', 'fingers_r'],
    'chest': ['chest', 'spine'],
    'thigh_l': ['hips', 'thigh_l', 'shin_l'], 'shin_l': ['thigh_l', 'shin_l', 'foot_l'], 'thigh_r': ['hips', 'thigh_r', 'shin_r'], 'shin_r': ['thigh_r', 'shin_r', 'foot_r'],
    'foot_l': ['shin_l', 'foot_l'], 'foot_r': ['shin_r', 'foot_r'],
}

def seg_dist(p, a, b):
    ab = [b[i] - a[i] for i in range(3)]; ap = [p[i] - a[i] for i in range(3)]
    L2 = sum(x * x for x in ab) or 1e-9
    t = max(0.0, min(1.0, sum(ap[i] * ab[i] for i in range(3)) / L2))
    return math.sqrt(sum((p[i] - (a[i] + ab[i] * t)) ** 2 for i in range(3)))

def weights_for(co, part, bd):
    cand = ALLOWED.get(part, BONES)
    ws = []
    for bn in cand:
        h, t, _ = bd[bn]
        d = seg_dist(co, h, t)
        ws.append((1.0 / (d + 0.025) ** 3, bn))
    ws.sort(reverse=True); ws = ws[:3]
    tot = sum(w for w, _ in ws)
    return [(bn, w / tot) for w, bn in ws]

def make_armature(name, bd):
    arm = bpy.data.armatures.new(name + '_arm'); ao = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn in BONES:
        h, t, par = bd[bn]
        b = eb[bn] = arm.edit_bones.new(bn); b.head = h; b.tail = t; b.roll = 0.0
    for bn in BONES:
        par = bd[bn][2]
        if par: eb[bn].parent = eb[par]; eb[bn].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao

# ------------------------------------------------------------------ face textures + atlas
def paint_face(pd, size=128):
    sc = size
    skin = SKIN[pd['skin']]
    def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    base = rgb(skin)
    im = Image.new('RGB', (sc, sc), base); d = ImageDraw.Draw(im)
    S = lambda u, v: (u * sc, (1 - v) * sc)
    dark = tuple(max(0, c - 38) for c in base); light = tuple(min(255, c + 14) for c in base)
    # cheek / temple soft shading
    # blush for kids / women
    if pd['kind'] in ('girl', 'boy', 'woman', 'teen'):
        bl = tuple(min(255, c + (26 if i == 0 else -6)) for i, c in enumerate(base))
        for sg in (-1, 1):
            cx, cy = S(0.5 + sg * 0.27, 0.38)
            d.ellipse((cx - 10, cy - 7, cx + 10, cy + 7), fill=bl)
    # eyes
    iris = rgb(pd['eye']); brow = rgb(HAIR[pd['hair'][0]] if pd['hair'][1] != 'bald' else '#3a2a1e')
    eye_v = 0.60
    ew, eh = (0.115, 0.065) if pd['kind'] not in ('girl', 'boy') else (0.125, 0.08)
    for sg in (-1, 1):
        cx, cy = S(0.5 + sg * 0.215, eye_v)
        w2, h2 = ew * sc, eh * sc
        d.ellipse((cx - w2 / 2 - 2, cy - h2 / 2 - 2, cx + w2 / 2 + 2, cy + h2 / 2 + 2), fill=tuple(max(0, c - 24) for c in base))     # socket shade
        d.ellipse((cx - w2 / 2, cy - h2 / 2, cx + w2 / 2, cy + h2 / 2), fill=(244, 244, 240))
        ir = h2 * 0.5
        d.ellipse((cx - ir, cy - ir, cx + ir, cy + ir), fill=iris)
        d.ellipse((cx - ir * 0.5, cy - ir * 0.5, cx + ir * 0.5, cy + ir * 0.5), fill=(12, 12, 14))
        d.ellipse((cx - ir * 0.2 - 1, cy - ir * 0.6, cx + ir * 0.25, cy - ir * 0.1), fill=(250, 250, 250))
        d.arc((cx - w2 / 2 - 1, cy - h2 / 2 - 2, cx + w2 / 2 + 1, cy + h2 / 2 + 2), 190, 350, fill=tuple(max(0, c - 70) for c in base), width=2)     # upper lid
        if pd['kind'] in ('woman', 'teen', 'girl'):
            d.arc((cx - w2 / 2 - 1, cy - h2 / 2 - 3, cx + w2 / 2 + 1, cy + h2 / 2 + 1), 200, 340, fill=(30, 24, 22), width=2)
        # brows
        by = S(0, eye_v + 0.115)[1]
        bw = 0.15 * sc
        d.line((cx - bw / 2, by + (3 if sg > 0 else 3) * (-1) + 2, cx + bw / 2, by - 2), fill=brow, width=3 if pd['kind'] != 'woman' else 2)
    # nose shading
    nx, ny = S(0.5, 0.40)
    d.line((nx - 7, ny + 9, nx - 1, ny + 12), fill=dark, width=2); d.line((nx + 7, ny + 9, nx + 1, ny + 12), fill=dark, width=2)
    d.ellipse((nx - 4, ny + 8, nx - 1, ny + 12), fill=tuple(max(0, c - 60) for c in base)); d.ellipse((nx + 1, ny + 8, nx + 4, ny + 12), fill=tuple(max(0, c - 60) for c in base))
    # mouth
    mx, my = S(0.5, 0.20)
    lip = rgb(pd.get('lips', '#a05a52' if pd['skin'] < 4 else '#6a3028'))
    d.ellipse((mx - 13, my - 4, mx + 13, my + 6), fill=lip)
    d.line((mx - 13, my, mx + 13, my), fill=tuple(max(0, c - 70) for c in lip), width=2)
    if pd.get('stubble') or pd.get('beard'):
        rng = random.Random(7)
        hc = rgb(HAIR[pd['hair'][0]])
        for _ in range(600 if pd.get('beard') else 260):
            u = rng.uniform(0.12, 0.88); v = rng.uniform(0.02, 0.34 if not pd.get('beard') else 0.42)
            x, y = S(u, v)
            if abs(u - 0.5) < 0.1 and 0.14 < v < 0.28: continue
            d.point((x, y), fill=tuple(int(0.55 * c + 0.45 * b) for c, b in zip(hc, base)))
        if pd.get('beard'):
            d.rectangle((S(0.30, 0.30)[0], S(0, 0.30)[1], S(0.70, 0.30)[0], S(0, 0.25)[1]), fill=tuple(int(0.8 * c + 0.2 * b) for c, b in zip(hc, base)))     # moustache
    if pd.get('wrinkles'):
        for sg in (-1, 1):
            cx, cy = S(0.5 + sg * 0.3, eye_v)
            for k_ in range(3): d.line((cx + sg * 6, cy - 3 + k_ * 4, cx + sg * 14, cy - 5 + k_ * 5), fill=dark, width=1)
        d.arc((mx - 22, my - 14, mx + 22, my + 12), 20, 160, fill=dark, width=1)
        d.line((S(0.2, 0.7)[0], S(0, 0.78)[1], S(0.8, 0.7)[0], S(0, 0.78)[1]), fill=dark, width=1)
    return im

# ------------------------------------------------------------------ animation
def rot_local(ao, bname, axis, ang):
    bone = ao.data.bones[bname]
    R = bone.matrix_local.to_3x3()
    ax = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]
    Rw = Quaternion(ax, ang).to_matrix()
    return (R.inverted() @ Rw @ R).to_quaternion()

def pose_clip(ao, name, frames, fn, fps=24):
    ad = ao.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    for bn in BONES: ao.pose.bones[bn].rotation_mode = 'QUATERNION'
    for f in range(frames + 1):
        ph = f / frames
        angs = fn(ph)
        for bn in BONES:
            pbn = ao.pose.bones[bn]
            q = Quaternion((1, 0, 0, 0))
            for (axis, a) in angs.get(bn, []):
                q = q @ rot_local(ao, bn, axis, a)
            pbn.rotation_quaternion = q
            pbn.keyframe_insert('rotation_quaternion', frame=1 + f)
    tr = ad.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 1, act)
    ad.action = None
    for bn in BONES:
        pbn = ao.pose.bones[bn]; pbn.rotation_quaternion = (1, 0, 0, 0)

TAU = 2 * math.pi
s_ = math.sin; c_ = math.cos

def clip_defs():
    """name -> (frames, fn(phase)->{bone: [(axis, angle)]}, loop?)"""
    C = {}
    def stand_base(p, lean=0.0):
        return {'spine': [('x', lean)], 'hips': [], 'upperarm_l': [('y', -0.05)], 'upperarm_r': [('y', 0.05)], 'forearm_l': [('x', 0.10)], 'forearm_r': [('x', 0.10)],
                'fingers_l': [('x', 0.25)], 'fingers_r': [('x', 0.25)]}
    def idle_a(ph):
        p = ph * TAU
        d = stand_base(p)
        d.update({
            'hips': [('y', 0.045 * s_(p)), ('z', 0.025 * s_(p + 1.0))],
            'spine': [('y', -0.035 * s_(p)), ('x', 0.010 * s_(2 * p))],
            'chest': [('x', 0.016 * s_(2 * p + 0.5)), ('y', -0.012 * s_(p))],
            'head': [('z', 0.28 * s_(p + 0.4) * (0.5 + 0.5 * s_(2 * p))), ('x', 0.04 * s_(2 * p))],
            'thigh_l': [('x', 0.03 * s_(p)), ('y', 0.02 + 0.03 * max(0, s_(p)))], 'thigh_r': [('x', -0.03 * s_(p)), ('y', -0.02 - 0.03 * max(0, -s_(p)))],
            'shin_l': [('x', -0.03 - 0.03 * max(0, -s_(p)))], 'shin_r': [('x', -0.03 - 0.03 * max(0, s_(p)))],
            'upperarm_l': [('x', 0.04 * s_(p + 0.4)), ('y', -0.05)], 'upperarm_r': [('x', -0.04 * s_(p + 0.4)), ('y', 0.05)],
            'forearm_l': [('x', 0.12 + 0.02 * s_(p))], 'forearm_r': [('x', 0.12 - 0.02 * s_(p))], 'clavicle_l': [('z', 0.02 * s_(2 * p))], 'clavicle_r': [('z', -0.02 * s_(2 * p))],
        })
        return d
    C['idle_a'] = (96, idle_a)
    def idle_b(ph):
        p = ph * TAU
        d = idle_a(ph)
        # weight forward/back + right hand adjusts hair / strap in the middle of the loop
        k = max(0.0, s_(p - 0.6)) ** 2
        d['hips'] = [('x', 0.02 * s_(p))]
        d['upperarm_r'] = [('x', 0.55 * k), ('y', 0.05 - 0.55 * k)]
        d['forearm_r'] = [('x', 0.12 + 1.9 * k)]
        d['head'] = [('z', -0.20 * k), ('x', -0.05 * k)]
        d['fingers_r'] = [('x', 0.25 + 0.5 * k)]
        return d
    C['idle_b'] = (120, idle_b)
    def walk_gen(A, K, arm, ph, bag=False, lift=0.0):
        p = ph * TAU
        knee = lambda pp: 0.10 + K * max(0.0, c_(pp)) ** 1.2
        d = {
            'hips': [('y', 0.05 * s_(p)), ('z', 0.09 * s_(p)), ('x', 0.02 * s_(2 * p))],
            'spine': [('z', -0.12 * s_(p)), ('x', -0.04 + 0.01 * s_(2 * p)), ('y', -0.03 * s_(p))],
            'chest': [('z', -0.05 * s_(p))], 'neck': [('z', 0.04 * s_(p))], 'head': [('z', 0.06 * s_(p)), ('x', 0.02)],
            'thigh_l': [('x', A * s_(p))], 'thigh_r': [('x', A * s_(p + math.pi))],
            'shin_l': [('x', -knee(p))], 'shin_r': [('x', -knee(p + math.pi))],
            'foot_l': [('x', -0.45 * max(0.0, -s_(p + 0.6)) * 0.0 + (0.28 * c_(p + 0.4) if c_(p + 0.4) > 0 else 0.25 * c_(p + 0.4)))],
            'foot_r': [('x', (0.28 * c_(p + math.pi + 0.4) if c_(p + math.pi + 0.4) > 0 else 0.25 * c_(p + math.pi + 0.4)))],
            'upperarm_l': [('x', -arm * s_(p)), ('y', -0.05)], 'upperarm_r': [('x', arm * s_(p)), ('y', 0.05)],
            'forearm_l': [('x', 0.22 + 0.18 * max(0.0, s_(p + 1.2)))], 'forearm_r': [('x', 0.22 + 0.18 * max(0.0, -s_(p + 1.2)))],
            'clavicle_l': [('z', 0.04 * s_(p))], 'clavicle_r': [('z', -0.04 * s_(p))], 'fingers_l': [('x', 0.3)], 'fingers_r': [('x', 0.3)],
        }
        if lift:
            d['thigh_l'] = [('x', A * s_(p) + lift * max(0.0, c_(p)))]; d['thigh_r'] = [('x', A * s_(p + math.pi) + lift * max(0.0, c_(p + math.pi)))]
        if bag:
            d['upperarm_r'] = [('x', 0.05 + 0.04 * s_(p)), ('y', 0.18)]; d['forearm_r'] = [('x', 0.30)]; d['spine'] = [('z', -0.10 * s_(p)), ('x', -0.04), ('y', -0.04)]
        return d
    C['walk'] = (24, lambda ph: walk_gen(0.40, 0.55, 0.38, ph))
    C['walk_fast'] = (19, lambda ph: walk_gen(0.52, 0.75, 0.55, ph))
    C['walk_bag'] = (24, lambda ph: walk_gen(0.38, 0.52, 0.30, ph, bag=True))
    C['walk_step'] = (28, lambda ph: walk_gen(0.30, 0.9, 0.25, ph, lift=0.55))        # high-knee steps for boarding / alighting (root moved by the game)
    def phone_stand(ph):
        p = ph * TAU; d = idle_a(ph)
        d['spine'] = [('x', -0.07), ('y', -0.02 * s_(p))]
        d['head'] = [('x', -0.45 + 0.03 * s_(2 * p)), ('z', 0.03 * s_(p))]
        d['upperarm_r'] = [('x', 0.80), ('y', 0.10)]; d['forearm_r'] = [('x', 1.85 + 0.03 * s_(2 * p))]
        d['upperarm_l'] = [('x', 0.80), ('y', -0.12)]; d['forearm_l'] = [('x', 1.70 + 0.03 * s_(2 * p + 1))]
        d['hand_r'] = [('x', 0.25)]; d['hand_l'] = [('x', 0.25)]
        d['fingers_r'] = [('x', 0.55 + 0.35 * max(0, s_(6 * p)))]; d['fingers_l'] = [('x', 0.45)]
        return d
    C['phone_stand'] = (96, phone_stand)
    def phone_call(ph):
        p = ph * TAU; d = idle_a(ph)
        d['head'] = [('z', 0.05 * s_(p)), ('y', 0.14)]
        d['upperarm_r'] = [('x', 0.55), ('y', 0.30)]; d['forearm_r'] = [('x', 2.25 + 0.02 * s_(2 * p))]; d['hand_r'] = [('y', 0.25)]
        d['fingers_r'] = [('x', 0.6)]
        d['spine'] = [('y', 0.03 * s_(p)), ('x', 0.01)]
        return d
    C['phone_call'] = (96, phone_call)
    def talk(ph):
        p = ph * TAU; d = idle_a(ph)
        g = 0.5 + 0.5 * s_(2 * p)
        d['upperarm_r'] = [('x', 0.55 + 0.25 * s_(2 * p + 1)), ('y', 0.30 + 0.12 * s_(p))]; d['forearm_r'] = [('x', 1.2 + 0.4 * s_(2 * p))]; d['hand_r'] = [('z', 0.3 * s_(4 * p))]
        d['upperarm_l'] = [('x', 0.25 + 0.15 * s_(2 * p + 2.0)), ('y', -0.2)]; d['forearm_l'] = [('x', 0.7 + 0.3 * s_(2 * p + 2.0))]
        d['head'] = [('x', 0.07 * s_(4 * p)), ('z', 0.18 * s_(p))]
        d['fingers_r'] = [('x', 0.2 + 0.2 * g)]
        return d
    C['talk'] = (96, talk)
    def wave(ph):
        p = ph * TAU; d = idle_a(ph)
        d['upperarm_r'] = [('y', -1.95), ('x', 0.1)]; d['forearm_r'] = [('x', 0.3 + 0.0), ('z', 0.5 * s_(3 * p))]; d['hand_r'] = [('z', 0.45 * s_(3 * p))]
        d['fingers_r'] = [('x', 0.05)]
        d['head'] = [('z', -0.1), ('x', 0.0)]
        return d
    C['wave'] = (48, wave)
    def point(ph):
        p = ph * TAU; d = idle_a(ph)
        d['upperarm_r'] = [('x', 1.50 + 0.03 * s_(2 * p)), ('y', 0.08)]; d['forearm_r'] = [('x', 0.05)]; d['fingers_r'] = [('x', 0.0)]
        d['spine'] = [('z', -0.12)]; d['head'] = [('z', 0.2)]
        return d
    C['point'] = (48, point)
    # seated clips (rotation only; the game lowers the root by seatRootDropM from people_meta.json)
    def sit_base(p):
        return {
            'hips': [('x', 0.02)], 'spine': [('x', 0.03 * s_(p))], 'chest': [('x', 0.015 * s_(p))], 'head': [('x', -0.05)],
            'thigh_l': [('x', 1.50), ('y', -0.06)], 'thigh_r': [('x', 1.50), ('y', 0.06)], 'shin_l': [('x', -1.52)], 'shin_r': [('x', -1.52)],
            'foot_l': [('x', 0.05)], 'foot_r': [('x', 0.05)],
            'upperarm_l': [('x', 0.28), ('y', -0.06)], 'upperarm_r': [('x', 0.28), ('y', 0.06)], 'forearm_l': [('x', 1.0)], 'forearm_r': [('x', 1.0)],
            'fingers_l': [('x', 0.3)], 'fingers_r': [('x', 0.3)],
        }
    C['sit_idle'] = (96, lambda ph: sit_base(ph * TAU))
    def sit_phone(ph):
        p = ph * TAU; d = sit_base(p)
        d['head'] = [('x', -0.5 + 0.03 * s_(2 * p))]; d['spine'] = [('x', -0.10)]
        d['upperarm_r'] = [('x', 0.60), ('y', 0.08)]; d['forearm_r'] = [('x', 1.65)]; d['upperarm_l'] = [('x', 0.60), ('y', -0.10)]; d['forearm_l'] = [('x', 1.55)]
        d['fingers_r'] = [('x', 0.55 + 0.35 * max(0, s_(6 * p)))]
        return d
    C['sit_phone'] = (96, sit_phone)
    def sit_look(ph):
        p = ph * TAU; d = sit_base(p)
        d['head'] = [('z', 0.9 * s_(p)), ('x', -0.05 + 0.04 * s_(2 * p))]; d['neck'] = [('z', 0.25 * s_(p))]; d['chest'] = [('z', 0.12 * s_(p))]
        return d
    C['sit_look'] = (120, sit_look)
    def sit_cross(ph):
        p = ph * TAU; d = sit_base(p)
        d['thigh_r'] = [('x', 1.58), ('z', 0.55)]; d['shin_r'] = [('x', -1.3)]; d['foot_r'] = [('x', 0.35)]
        d['hips'] = [('z', 0.03)]; d['upperarm_r'] = [('x', 0.35), ('y', 0.1)]; d['forearm_r'] = [('x', 1.2)]
        d['head'] = [('z', 0.2 * s_(p)), ('x', -0.05)]
        return d
    C['sit_cross_legs'] = (96, sit_cross)
    def stand_pole(ph):
        p = ph * TAU; d = idle_a(ph)
        sway = 0.04 * s_(p) + 0.02 * s_(2.3 * p)
        d['hips'] = [('y', sway), ('x', 0.015 * s_(1.7 * p))]; d['spine'] = [('y', -sway * 0.6)]
        d['thigh_l'] = [('x', 0.10 + 0.03 * s_(p)), ('y', 0.07)]; d['thigh_r'] = [('x', 0.06 - 0.03 * s_(p)), ('y', -0.07)]; d['shin_l'] = [('x', -0.12)]; d['shin_r'] = [('x', -0.10)]
        d['upperarm_r'] = [('x', 1.20), ('y', 0.0)]; d['forearm_r'] = [('x', 1.16)]; d['hand_r'] = [('x', 0.1)]; d['fingers_r'] = [('x', 1.3)]
        d['head'] = [('z', 0.15 * s_(0.7 * p)), ('x', -0.02)]
        return d
    C['stand_hold_pole'] = (96, stand_pole)
    def stand_rail(ph):
        p = ph * TAU; d = idle_a(ph)
        sway = 0.04 * s_(p) + 0.02 * s_(2.3 * p)
        d['hips'] = [('y', sway)]; d['spine'] = [('y', -sway * 0.6)]
        d['thigh_l'] = [('x', 0.08), ('y', 0.06)]; d['thigh_r'] = [('x', 0.05), ('y', -0.06)]
        d['upperarm_l'] = [('x', 0.55), ('y', 0.55)]; d['forearm_l'] = [('x', 0.65)]; d['fingers_l'] = [('x', 1.3)]
        return d
    C['stand_hold_rail'] = (96, stand_rail)
    C['turn_left'] = (36, lambda ph: turn_gen(ph, +1)); C['turn_right'] = (36, lambda ph: turn_gen(ph, -1))
    def bounce(ph):
        p = ph * TAU; d = idle_a(ph)
        b = max(0.0, s_(p)) ** 1.5
        d['thigh_l'] = [('x', 0.55 * b)]; d['thigh_r'] = [('x', 0.55 * b)]; d['shin_l'] = [('x', -1.0 * b)]; d['shin_r'] = [('x', -1.0 * b)]
        d['upperarm_l'] = [('x', -0.5 * b + 0.2), ('y', -0.5 * b)]; d['upperarm_r'] = [('x', -0.5 * b + 0.2), ('y', 0.5 * b)]; d['spine'] = [('x', 0.10 * b)]
        d['head'] = [('x', -0.08 * b), ('z', 0.2 * s_(p))]
        return d
    C['kid_bounce'] = (24, bounce)
    def fidget(ph):
        p = ph * TAU; d = idle_a(ph)
        d['hips'] = [('y', 0.07 * s_(p)), ('z', 0.04 * s_(2 * p))]; d['thigh_l'] = [('x', 0.12 * max(0, s_(2 * p))), ('y', 0.03)]; d['shin_l'] = [('x', -0.25 * max(0, s_(2 * p)))]
        d['upperarm_l'] = [('x', 0.35 * s_(p) + 0.2), ('y', -0.1)]; d['upperarm_r'] = [('x', 0.35 * s_(p + 2) + 0.2), ('y', 0.1)]
        d['forearm_l'] = [('x', 0.5 + 0.3 * s_(2 * p))]; d['forearm_r'] = [('x', 0.5 + 0.3 * s_(2 * p + 1))]; d['head'] = [('z', 0.4 * s_(p + 0.2)), ('x', 0.05 * s_(3 * p))]
        return d
    C['kid_fidget'] = (96, fidget)
    return C

def turn_gen(ph, sgn):
    """one-shot 90-degree turn in place: hips yaw ramps 0 -> sgn*pi/2 over 60% of the clip then holds; feet shuffle."""
    t = min(1.0, ph / 0.6)
    e = t * t * (3 - 2 * t)
    yaw = sgn * 1.5708 * e
    p = ph * TAU * 2.0
    sh = math.sin(math.pi * t) if t < 1 else 0.0
    return {'hips': [('z', yaw)], 'spine': [('z', -0.15 * yaw), ('x', -0.02)], 'head': [('z', -0.30 * yaw)],
            'thigh_l': [('x', 0.35 * sh * s_(p))], 'thigh_r': [('x', -0.35 * sh * s_(p))], 'shin_l': [('x', -0.35 * sh * max(0, s_(p)))], 'shin_r': [('x', -0.35 * sh * max(0, -s_(p)))],
            'upperarm_l': [('x', 0.1 * sh), ('y', -0.05)], 'upperarm_r': [('x', -0.1 * sh), ('y', 0.05)], 'forearm_l': [('x', 0.15)], 'forearm_r': [('x', 0.15)]}

CLIPS = None
ONE_SHOT = {'turn_left', 'turn_right'}

# ------------------------------------------------------------------ main build
def build_people(only=None):
    reset()
    root = group('people')
    swatches = {}
    def norm(h):
        h = h.lower()
        return '#' + ''.join(c * 2 for c in h[1:]) if len(h) == 4 else h
    def sw(h):
        h = norm(h)
        if h not in swatches: swatches[h] = len(swatches)
        return swatches[h]
    objs = []
    plist = [p for p in PEOPLE if not only or p['id'] in only]
    for pd in plist:
        pb, P, g = build_person(pd)
        bd = bone_defs(P, pd, g)
        for h in pb.fhex: sw(h)
        pb.bm.verts.ensure_lookup_table(); pb.bm.faces.ensure_lookup_table()
        bmesh.ops.recalc_face_normals(pb.bm, faces=pb.bm.faces[:])
        me = bpy.data.meshes.new(f"person_{pd['id']}_mesh"); pb.bm.to_mesh(me)
        for pi, p_ in enumerate(me.polygons): p_.use_smooth = pb.fsmooth[pi]
        mo = bpy.data.objects.new(f"person_{pd['id']}_mesh", me)
        bpy.context.scene.collection.objects.link(mo)
        for bn in BONES: mo.vertex_groups.new(name=bn)
        for vi, v in enumerate(me.vertices):
            for bn, w in weights_for(tuple(v.co), pb.vpart[vi], bd):
                mo.vertex_groups[bn].add([vi], w, 'REPLACE')
        ao = make_armature(f"person_{pd['id']}", bd)
        mo.parent = ao
        mod = mo.modifiers.new('Armature', 'ARMATURE'); mod.object = ao
        objs.append((pd, pb, mo, ao, P, g, bd))
    # ---- atlas 1024x1024: face tiles (128) rows 0..2, swatches 16x16 @16 px at (0..255, 768..1023)
    atlas = np.zeros((1024, 1024, 3), np.uint8); atlas[:] = (40, 40, 46)
    face_pos = {}
    for i, (pd, pb, mo, ao, P, g, bd) in enumerate(objs):
        fx, fy = (i % 8) * 128, (i // 8) * 128
        atlas[fy:fy + 128, fx:fx + 128] = np.array(paint_face(pd))
        face_pos[pd['id']] = (fx, fy)
    assert len(swatches) <= 256, len(swatches)
    for h, i in swatches.items():
        r, gg, b = int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16); cx, cy = (i % 16) * 16, 768 + (i // 16) * 16
        atlas[cy:cy + 16, cx:cx + 16] = (r, gg, b)
    path = os.path.join(SCRATCH, 'people_atlas.png')
    Image.fromarray(atlas).save(path, optimize=True)
    im = bpy.data.images.load(path); im.pack(); im.name = 'people_atlas'
    m = bpy.data.materials.new('people_atlas'); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.82; bs.inputs['Metallic'].default_value = 0.0
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Linear'
    m.node_tree.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    meta = {}
    global CLIPS
    CLIPS = clip_defs()
    for idx, (pd, pb, mo, ao, P, g, bd) in enumerate(objs):
        mo.data.materials.append(m)
        uvl = mo.data.uv_layers.new(name='UVMap')
        fx, fy = face_pos[pd['id']]
        hh = P['hh']; chin = P['chin']
        for pi, poly in enumerate(mo.data.polygons):
            if pb.fface[pi]:
                for li in poly.loop_indices:
                    co = mo.data.vertices[mo.data.loops[li].vertex_index].co
                    u = 0.5 + co.x / (0.72 * hh); v = (co.z - chin) / (1.0 * hh)
                    u = min(0.995, max(0.005, u)); v = min(0.995, max(0.005, v))
                    uvl.data[li].uv = ((fx + u * 128) / 1024, 1 - (fy + (1 - v) * 128) / 1024)
            else:
                hh_ = norm(pb.fhex[pi]); i = swatches[hh_]
                u = ((i % 16) + 0.5) * 16 / 1024; v = 1 - (768 + ((i // 16) + 0.5) * 16) / 1024
                for li in poly.loop_indices: uvl.data[li].uv = (u, v)
        ao.parent = root
        # ---------- meta (z extents)
        zs_ = [v.co.z for v in mo.data.vertices]
        top = max(zs_); bottom = min(zs_)
        # shift so the lowest point (soles) is exactly z=0 (rig and mesh together)
        if abs(bottom) > 1e-6:
            for v in mo.data.vertices: v.co.z -= bottom
        eye = (P['chin'] + P['hh'] * 0.54) - bottom
        hip = P['hip'] - bottom
        drop = hip - SEAT_HIP
        meta[pd['id']] = dict(id=pd['id'], kind=pd['kind'], heightM=round(top - bottom, 3), shoulderWidthM=round(2 * P['shw'] + 0.06, 3), eyeHeightM=round(eye, 3),
                              seatRootDropM=round(drop, 3), seatedEyeHeightM=round(eye - drop, 3), seatedHeadTopM=round(top - bottom - drop, 3), hipHeightM=round(hip, 3),
                              legLengthM=round(hip, 3), walkSpeedMps=round(4 * hip * math.sin(0.40) / 1.0, 2), walkFastSpeedMps=round(4 * hip * math.sin(0.52) / (19 / 24), 2),
                              tris=sum(max(1, len(p_.vertices) - 2) for p_ in mo.data.polygons), _bottom=bottom, _bd=None)
        # bones shift handled by rebuilding below
        g['bottom'] = bottom
    return root, objs, meta, swatches

def finalize_rigs(objs, meta):
    """Shift armatures (bone rest positions) by the same z offset that was applied to the meshes, then author the shared clips on the first person."""
    for (pd, pb, mo, ao, P, g, bd) in objs:
        b = g.get('bottom', 0.0)
        if abs(b) > 1e-6:
            bpy.context.view_layer.objects.active = ao; ao.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            for eb in ao.data.edit_bones:
                eb.head.z -= b; eb.tail.z -= b
            bpy.ops.object.mode_set(mode='OBJECT')

def export_people(meta):
    path = os.path.join(OUT, 'people.glb')
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_materials='EXPORT', export_cameras=False, export_lights=False,
              export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_frame_range=False, export_optimize_animation_size=True,
              export_force_sampling=True)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('TypeError', e)
        for k_ in ('export_optimize_animation_size', 'export_force_sampling', 'export_frame_range'): kw.pop(k_, None)
        bpy.ops.export_scene.gltf(**kw)
    print(f'EXPORTED people.glb: {os.path.getsize(path)/1024:.0f} KB')

def fk_grips(P, bd):
    """Hand grip positions (relative to the root) for stand_hold_pole (right hand) and stand_hold_rail (left hand): forward kinematics of the clip poses."""
    return None

if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    root, objs, meta, sw = build_people(only or None)
    finalize_rigs(objs, meta)
    # author the shared clips ONCE (on the first armature); every person has identical bone names / rest orientations
    first = objs[0][3]
    names = list(CLIPS.keys())
    for nme in names:
        frames, fn = CLIPS[nme]
        pose_clip(first, nme, frames, fn)
    for pid, md in meta.items():
        md['clips'] = names
        md.pop('_bd', None); md.pop('_bottom', None)
    for pd, pb, mo, ao, P, g, bd in objs:
        print(pd['id'], meta[pd['id']]['heightM'], 'tris', meta[pd['id']]['tris'])
    export_people(meta)
    out = dict(note='Heights are total standing heights (soles = 0). Headroom rule: train centre-line headroom is 1.88 m, 1.68 m above the bench fronts (|x|=0.62), ~1.3 m at the seat backs; every person is <= 1.80 m so standing in the aisle never clips; seated heads top out at seatedHeadTopM above the floor. Seated: set the root so that root.y = seatFloorY - seatRootDropM (clips sit_* are rotation-only).',
               seatTopM=SEAT_TOP, seatHipM=SEAT_HIP, loopClips=[c for c in names if c not in ONE_SHOT], oneShotClips=sorted(ONE_SHOT), fps=24,
               clipFrames={n: CLIPS[n][0] for n in names}, people=list(meta.values()))
    json.dump(out, open(os.path.join(OUT, 'people_meta.json'), 'w'), indent=1)
