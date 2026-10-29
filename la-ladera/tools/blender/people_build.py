"""Builds models/people.glb + models/people_meta.json  (REVISION 7: smooth organic people, true scale, shared rig + shared clip set).
20 variants (men, women, elders, teens, boys, girls, staff).  One 1024x1024 atlas (face tiles 128 px + colour swatches) -> one material `people_atlas`.
Rig: 21 bones, identical names AND identical rest ORIENTATIONS for every person (arms/legs vertical, clavicles along X, feet along +Y) so a clip authored once
plays on every person.  The glTF animations (`idle_a`, `walk`, ...) are ROTATION ONLY and are exported once (they bind by bone name on any clone).
Blender: +Y forward, soles on z=0.  glTF: person faces -Z, origin under the soles."""
import math, sys, os, random, json, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ARGS = [a for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])]
LOD = '--lod' in ARGS
from people_lib import *
OUTP = os.environ.get('PEOPLE_OUT') or OUT
import people_tex as TX
from mathutils.bvhtree import BVHTree
import numpy as np
from PIL import Image, ImageDraw
from mathutils import Quaternion, Vector

SKIN = ['#f0c8a0', '#e0ad82', '#c88b5e', '#a66c42', '#85512f', '#66391f', '#4a2a17']      # CONFIG.PALETTE.skin (core/config.js)
HAIR = ['#17120e', '#3a281c', '#6d4a2c', '#a87a43', '#d8b86c', '#8c8c8c', '#d0d0d0', '#7a2f1a', '#241812']
SEAT_TOP = 0.445          # train bench cushion top above the floor (m)
SEAT_HIP = 0.53           # seated hip-joint height above the floor (m)

BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r',
         'fingers_l', 'fingers_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r']

# ------------------------------------------------------------------ people definitions (heights = total standing height incl. hair/hat, <= 1.80 m)
PEOPLE = [
    # ---- P1 cast (Colombian Andean barrio). tags drive casting in js/people/personas.js
    dict(id='m_tendero', kind='man', H=1.70, skin=3, build=1.05, hair=(1, 'short'), eye='#3a2a1a', top='#e9e4d6', top_style='shirt', sleeve='short', bot_style='trousers', bot='#3a3f4a', shoe=('shoe', '#2a1c14', '#1a120c'), stubble=True, tags=['man', 'adult', 'shop']),
    dict(id='m_obrero', kind='man', H=1.72, skin=2, build=1.0, hair=(0, 'short'), eye='#2a1a10', top='#c8573c', top_style='tshirt', sleeve='short', bot_style='jeans', bot='#3d5b86', shoe=('boot', '#6b4a2a', '#2a1e14'), hat=('hardhat', '#f0b429'), stubble=True, tags=['man', 'adult', 'work', 'builder']),
    dict(id='w_tendera', kind='woman', H=1.60, skin=3, build=1.05, hair=(0, 'bun'), eye='#2a1a10', top='#6fae8f', top_style='jumper', sleeve='long', bot_style='skirt', bot='#3a3f4a', shoe=('shoe', '#2a1c14', '#1a120c'), lips='#8a3a3a', tags=['woman', 'adult', 'shop']),
    dict(id='w_ama', kind='woman', H=1.58, skin=2, build=1.1, hair=(1, 'pony'), eye='#4a3020', top='#e08aa0', top_style='tshirt', sleeve='short', bot_style='leggings', bot='#2b2b3a', shoe=('trainer', '#f2f2f2', '#e6e6e6'), lips='#a8524a', tags=['woman', 'adult', 'home']),
    dict(id='w_elder', kind='elder', fem=True, H=1.52, skin=3, build=1.05, hair=(6, 'bun'), eye='#4a3020', top='#8f5fa8', top_style='coat', sleeve='long', inner='#e8e0f0', bot_style='skirt', bot='#2a2a2e', shoe=('shoe', '#3a3a3a', '#2a2a2a'), stoop=0.07, wrinkles=True, lips='#8a4a42', tags=['woman', 'elder']),
    dict(id='m_elder', kind='elder', H=1.64, skin=2, build=1.0, hair=(5, 'short'), eye='#3a2a1a', top='#8a5a3a', top_style='jacket', sleeve='long', inner='#d8d2c2', bot_style='trousers', bot='#4a4d52', shoe=('shoe', '#3a2a1e', '#2a1e14'), hat=('cap', '#58564f'), stoop=0.06, wrinkles=True, tags=['man', 'elder']),
    dict(id='b_boy', kind='boy', H=1.30, skin=3, build=1.0, hair=(0, 'short'), eye='#2a1a10', top='#f0d36a', top_style='football', sleeve='short', bot_style='shorts', bot='#2a3d6b', shoe=('trainer', '#f2f2f2', '#dddddd'), tags=['boy', 'kid']),
    dict(id='g_girl', kind='girl', H=1.22, skin=2, build=1.0, hair=(0, 'pony'), eye='#2a1a10', top='#3a7ca5', top_style='dress', sleeve='short', bot_style='skirt', bot='#3a7ca5', shoe=('shoe', '#b03060', '#802040'), lips='#c07078', tags=['girl', 'kid']),
    dict(id='t_boy', kind='teen', H=1.70, skin=4, build=0.92, hair=(0, 'short'), eye='#2a1a10', top='#1b3f9a', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#2f3e57', shoe=('trainer', '#ffffff', '#f0f0f0'), bag=('backpack', '#202225'), tags=['man', 'teen']),
    dict(id='t_girl', kind='teen', fem=True, H=1.60, skin=3, build=0.9, hair=(1, 'long'), eye='#3a2a1a', top='#e07aa0', top_style='hoodie', sleeve='long', bot_style='jeans', bot='#2b2b3a', shoe=('trainer', '#f2f2f2', '#ffffff'), bag=('shoulder', '#7e57c2'), lips='#c07078', tags=['woman', 'teen']),
    dict(id='m_afro', kind='man', H=1.78, skin=6, build=1.05, hair=(0, 'curly'), eye='#2a1a10', top='#d9a441', top_style='jersey' if False else 'football', sleeve='short', bot_style='jeans', bot='#2f3e57', shoe=('trainer', '#e6e6e6', '#f2f2f2'), beard=True, tags=['man', 'adult']),
    dict(id='w_afro', kind='woman', H=1.66, skin=5, build=1.0, hair=(0, 'curly'), eye='#2a1a10', top='#c8573c', top_style='dress', sleeve='short', bot_style='skirt', bot='#c8573c', shoe=('shoe', '#2a1c14', '#1a120c'), lips='#6a2a2a', bag=('handbag', '#8a5a3a'), tags=['woman', 'adult']),
    # ---- P2 cast: the people who keep the barrio running (shopkeepers by trade, school, clinic, street)
    dict(id='m_panadero', kind='man', H=1.72, skin=3, build=1.12, hair=(0, 'short'), eye='#3a2a1a', top='#5a86a8', top_style='tshirt', sleeve='short', bot_style='trousers', bot='#c9c4b6', apron='#efe9d8', shoe=('shoe', '#2a1c14', '#1a120c'), hat=('chef', '#f6f4ee'), stubble=True, tags=['man', 'adult', 'shop', 'shop:panaderia', 'cook', 'uniform']),
    dict(id='w_cocinera', kind='woman', H=1.58, skin=3, build=1.12, hair=(0, 'braid'), eye='#2a1a10', top='#d4725a', top_style='tshirt', sleeve='short', bot_style='skirt', bot='#4a5a7a', apron='#e9e1c8', shoe=('shoe', '#2a1c14', '#1a120c'), lips='#9a4a46', tags=['woman', 'adult', 'shop', 'shop:restaurante', 'shop:cafe', 'cook', 'vendor', 'uniform']),
    dict(id='m_carnicero', kind='man', H=1.74, skin=2, build=1.22, hair=(1, 'short'), eye='#3a2a1a', top='#f2f2ee', top_style='tshirt', sleeve='short', bot_style='trousers', bot='#6a7078', apron='#c9ced6', shoe=('boot', '#e0e0d8', '#2a2a2a'), hat=('cap', '#f2f2ee'), stubble=True, tags=['man', 'adult', 'shop', 'shop:carniceria', 'uniform']),
    dict(id='w_peluquera', kind='woman', H=1.66, skin=2, build=0.96, hair=(7, 'long'), eye='#3a2a1a', top='#c8c0d8', top_style='tshirt', sleeve='short', bot_style='jeans', bot='#5a6c8a', shoe=('trainer', '#f2f2f2', '#e6e6e6'), lips='#b03a50', tags=['woman', 'adult', 'shop', 'shop:peluqueria', 'shop:modista', 'shop:zapateria']),
    dict(id='m_mecanico', kind='man', H=1.76, skin=3, build=1.1, hair=(0, 'short'), eye='#2a1a10', top='#6a8fb8', top_style='shirt', sleeve='long', bot_style='trousers', bot='#6a8fb8', shoe=('boot', '#6b4a2a', '#2a1e14'), hat=('cap', '#d8604a'), stubble=True, tags=['man', 'adult', 'shop', 'shop:taller', 'shop:ferreteria', 'work', 'uniform']),
    dict(id='w_farmaceutica', kind='woman', H=1.62, skin=3, build=0.98, hair=(1, 'bun'), eye='#2a1a10', top='#f4f4f2', top_style='labcoat', sleeve='long', inner='#5aa6a6', bot_style='trousers', bot='#8a96a8', shoe=('shoe', '#f2f2f2', '#d8d8d8'), glasses=True, lips='#a8524a', tags=['woman', 'adult', 'shop', 'shop:drogueria', 'nurse', 'uniform']),
    dict(id='w_maestra', kind='woman', H=1.64, skin=2, build=0.97, hair=(2, 'bob'), eye='#3a2a1a', top='#a77fc0', top_style='jumper', sleeve='long', bot_style='trousers', bot='#6a6a74', shoe=('shoe', '#5a3a2a', '#2a1e14'), glasses=True, bag=('shoulder', '#7a5a3a'), lips='#a8524a', tags=['woman', 'adult', 'teacher', 'shop:papeleria', 'shop:minutos']),
    dict(id='m_mototaxi', kind='man', H=1.70, skin=3, build=1.0, hair=(0, 'short'), eye='#2a1a10', top='#8a8a92', top_style='tshirt', sleeve='short', vest='#f08a1a', bot_style='jeans', bot='#5a7aa8', shoe=('trainer', '#e6e6e6', '#f2f2f2'), hat=('helmet', '#d8dce0'), stubble=True, tags=['man', 'adult', 'moto', 'work', 'uniform']),
    dict(id='m_vendedor', kind='man', H=1.68, skin=2, build=1.0, hair=(1, 'short'), eye='#3a2a1a', top='#f0e8d0', top_style='shirt', sleeve='long', bot_style='trousers', bot='#8a7a5e', shoe=('shoe', '#5a4030', '#2a1e14'), hat=('sombrero', '#d6c08a'), stubble=True, tags=['man', 'adult', 'vendor', 'work']),
    dict(id='m_abuelo', kind='elder', H=1.62, skin=2, build=1.0, hair=(5, 'receding'), eye='#3a2a1a', top='#d8d2c2', top_style='shirt', sleeve='long', ruana='#8a5a34', ruana_trim='#c9a24a', bot_style='trousers', bot='#6a6d72', shoe=('shoe', '#3a2a1e', '#2a1e14'), hat=('sombrero', '#cdb88a'), stoop=0.07, wrinkles=True, tags=['man', 'elder']),
    dict(id='w_beata', kind='elder', fem=True, H=1.50, skin=3, build=1.05, hair=(6, 'bald'), eye='#4a3020', top='#5a5a68', top_style='coat', sleeve='long', inner='#e8e8e8', bot_style='skirt', bot='#2a2a2e', shoe=('shoe', '#2a2a2a', '#1a1a1a'), hat=('scarf', '#3a3a46'), bag=('handbag', '#2a2a30'), stoop=0.06, wrinkles=True, lips='#8a4a42', tags=['woman', 'elder', 'beata', 'uniform']),
    dict(id='b_escolar', kind='boy', H=1.32, skin=3, build=1.0, hair=(0, 'short'), eye='#2a1a10', top='#f2f2f2', top_style='shirt', sleeve='short', bot_style='trousers', bot='#6a82b8', shoe=('shoe', '#2a2a2e', '#101010'), bag=('schoolbag', '#c0392b'), tags=['boy', 'kid', 'student', 'uniform']),
    dict(id='g_escolar', kind='girl', H=1.24, skin=2, build=1.0, hair=(0, 'pigtails'), eye='#2a1a10', top='#f2f2f2', top_style='shirt', sleeve='short', bot_style='skirt', bot='#6a82b8', shoe=('shoe', '#2a2a2e', '#101010'), bag=('schoolbag', '#e0609a'), lips='#c07078', tags=['girl', 'kid', 'student', 'uniform']),
    # ---- P3 cast: more silhouettes (heavier, slimmer, taller) and the hair styles the first 25 did not use (slick, sidepart, topknot, buzz)
    dict(id='m_joven', kind='man', H=1.77, skin=3, build=0.94, hair=(0, 'slick'), eye='#2a1a10', top='#2f7d5a', top_style='football', sleeve='short', bot_style='jeans', bot='#3a4a66', shoe=('trainer', '#f2f2f2', '#e6e6e6'), tags=['man', 'adult', 'young']),
    dict(id='w_vecina', kind='woman', H=1.56, skin=3, build=1.28, hair=(1, 'sidepart'), eye='#3a2a1a', top='#8f9a5b', top_style='jumper', sleeve='long', bot_style='trousers', bot='#4a5a7a', shoe=('shoe', '#3a2a1e', '#2a1e14'), glasses=True, lips='#a8524a', tags=['woman', 'adult', 'home']),
    dict(id='m_don', kind='man', H=1.68, skin=2, build=1.30, hair=(5, 'receding'), eye='#3a2a1a', top='#9bb0c8', top_style='shirt', sleeve='short', bot_style='trousers', bot='#5a5a64', shoe=('shoe', '#2a1c14', '#1a120c'), stubble=True, tags=['man', 'adult']),
    dict(id='w_joven', kind='woman', H=1.65, skin=4, build=0.88, hair=(0, 'topknot'), eye='#2a1a10', top='#f2c14e', top_style='tshirt', sleeve='short', bot_style='jeans', bot='#3d5b86', shoe=('trainer', '#f2f2f2', '#ffffff'), bag=('shoulder', '#7a4a2a'), lips='#8a3a3a', tags=['woman', 'adult', 'young']),
    dict(id='m_rapado', kind='teen', H=1.73, skin=5, build=1.0, hair=(0, 'buzz'), eye='#2a1a10', top='#c0392b', top_style='football', sleeve='short', bot_style='shorts', bot='#1b1b22', shoe=('trainer', '#e6e6e6', '#ffffff'), tags=['man', 'teen']),
]

# ------------------------------------------------------------------ geometry helpers
CUR_FAB = ['cotton']
def fab(n): CUR_FAB[0] = n
SKINSET = set(SKIN); HAIRSET = set(HAIR)
class PB:
    def __init__(self):
        self.bm = bmesh.new(); self.vpart = []; self.fhex = []; self.fsmooth = []; self.fface = []; self.ffab = []; self.fuv = []
    def V(self, co, part):
        v = self.bm.verts.new(co); self.vpart.append(part); return v
    def F(self, vs, hexc_, smooth=True, face=False, uv=None, fab_=None):
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        if face: fb = 'face'
        elif fab_: fb = fab_
        elif hexc_.startswith('T'): fb = 'tartan' + hexc_[1:].split('|')[0]
        elif hexc_ in SKINSET: fb = 'skin'
        elif hexc_ in HAIRSET and CUR_FAB[0] != 'hairfix': fb = 'hair'
        else: fb = CUR_FAB[0]
        self.fhex.append(hexc_); self.fsmooth.append(smooth); self.fface.append(face); self.ffab.append(fb); self.fuv.append(uv); return f

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

def loft(pb, rings, part, hexc_, hex_fn=None, closed=True, cap_top=True, cap_bot=True, smooth=True, face_fn=None, fab_=None, uv=None):
    vr = [[pb.V(p, part) for p in rg] for rg in rings]
    n = len(rings[0])
    nn = n if closed else n - 1
    for r in range(len(rings) - 1):
        for i in range(nn):
            j = (i + 1) % n
            pb.F((vr[r][i], vr[r][j], vr[r + 1][j], vr[r + 1][i]), hex_fn(r) if hex_fn else hexc_, smooth, face_fn(r, i) if face_fn else False, uv=uv, fab_=fab_)
    if closed:
        # caps face OUTWARD, away from the other end of the loft, whatever direction the rings run (arms and sleeves run downward: their first ring is the TOP one, and its
        # cap used to face down into the sleeve, so the AO bake lit it from inside: a dark cup on every shoulder)
        def cap_ring(ring_, other):
            c = [sum(p_[j] for p_ in ring_) / len(ring_) for j in range(3)]; o = [sum(p_[j] for p_ in other) / len(other) for j in range(3)]
            nx = ny = nz = 0.0
            for i_ in range(len(ring_)):
                a_ = ring_[i_]; b_ = ring_[(i_ + 1) % len(ring_)]
                nx += (a_[1] - b_[1]) * (a_[2] + b_[2]); ny += (a_[2] - b_[2]) * (a_[0] + b_[0]); nz += (a_[0] - b_[0]) * (a_[1] + b_[1])
            return ring_ if nx * (c[0] - o[0]) + ny * (c[1] - o[1]) + nz * (c[2] - o[2]) >= 0 else ring_[::-1]
        if cap_bot:
            cv = [pb.V(tuple(p_), part) for p_ in cap_ring(rings[0], rings[-1])]
            pb.F(cv, hex_fn(0) if hex_fn else hexc_, False, fab_=fab_, uv=uv)
        if cap_top:
            cv = [pb.V(tuple(p_), part) for p_ in cap_ring(rings[-1], rings[0])]
            pb.F(cv, hex_fn(len(rings) - 2) if hex_fn else hexc_, False, fab_=fab_, uv=uv)
    return vr


def zone(pb, c, r, part, th0, th1, nu=14, nv=3, fab_=None):
    """open spherical zone between polar angles th0..th1 (pole = +Z), radius r"""
    rings = [ring(c[0], c[1], c[2] + r * math.cos(th0 + (th1 - th0) * j / nv), r * math.sin(th0 + (th1 - th0) * j / nv), r * math.sin(th0 + (th1 - th0) * j / nv), nu) for j in range(nv + 1)]
    loft(pb, rings, part, '#ffffff', closed=True, cap_top=False, cap_bot=False, fab_=fab_)

def sphere(pb, c, rx, ry, rz, part, hexc_, nu=8, nv=5, smooth=True, uv=None, fab_=None):
    rings = []
    for j in range(1, nv):
        th = math.pi * j / nv
        rings.append(ring(c[0], c[1], c[2] + rz * math.cos(th), rx * math.sin(th), ry * math.sin(th), nu))
    top = pb.V((c[0], c[1], c[2] + rz), part); bot = pb.V((c[0], c[1], c[2] - rz), part)
    vr = [[pb.V(p, part) for p in rg] for rg in rings]
    for i in range(nu):
        pb.F((top, vr[0][(i + 1) % nu], vr[0][i]), hexc_, smooth, uv=uv, fab_=fab_); pb.F((bot, vr[-1][i], vr[-1][(i + 1) % nu]), hexc_, smooth, uv=uv, fab_=fab_)
    for r in range(len(vr) - 1):
        for i in range(nu):
            pb.F((vr[r][i], vr[r][(i + 1) % nu], vr[r + 1][(i + 1) % nu], vr[r + 1][i]), hexc_, smooth, uv=uv, fab_=fab_)

def qbox(pb, c, s, part, hexc_, fab_=None):
    cx, cy, cz = c; hx_, hy_, hz_ = s[0] / 2, s[1] / 2, s[2] / 2
    v = [pb.V((cx + sx_ * hx_, cy + sy_ * hy_, cz + sz_ * hz_), part) for sz_ in (-1, 1) for sy_ in (-1, 1) for sx_ in (-1, 1)]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)): pb.F([v[i] for i in q], hexc_, False, fab_=fab_)

def rbox(pb, c, s, part, hexc_, rad=0.02, n=3, fab_=None):
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
    loft(pb, rings, part, hexc_, smooth=False, fab_=fab_)

def tube_pts(pb, pts, radii, part, hexc_, n=10, hex_fn=None, cap_top=True, cap_bot=True, fab_=None):
    rings = [ring(p[0], p[1], p[2], r, r, n) for p, r in zip(pts, radii)]
    return loft(pb, rings, part, hexc_, hex_fn=hex_fn, cap_top=cap_top, cap_bot=cap_bot, fab_=fab_)

# ------------------------------------------------------------------ body proportions
def proportions(pd):
    H = pd['H']; kind = pd['kind']
    child = kind in ('boy', 'girl')
    teen = kind == 'teen'
    fem = pd.get('fem', False) or kind in ('woman', 'girl')
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
    P['trap'] = P['sh'] + 0.046 * Hs / 1.7
    P['nbase'] = P['trap'] + 0.018
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
        # pelvis rows are as wide as the two thigh tubes (outer edge = hx + r0 + layer ~ 0.185 k b) so the trousers read as one garment, not a box between two legs
        # (the lowest row used to be as wide as the hips: its flat edge floated between the thighs like the hem of a short skirt; it now tucks inside the thigh tubes)
        c = [(z(0.455), 0.150 * k * b, 0.098 * k * b, 0.0), (z(0.51), 0.188 * k * b, 0.110 * k * b, 0.0), (z(0.568), 0.162 * k * b, 0.098 * k * b, 0.0), (z(0.614), 0.150 * k * b, 0.094 * k * b, 0.004),
             (z(0.682), 0.156 * k * b, 0.102 * k * b, 0.008), (z(0.739), 0.168 * k * b, 0.108 * k * b, 0.010), (z(0.784), shw * 0.95, 0.098 * k, 0.004), (P['sh'] - 0.012, shw * 0.99, 0.088 * k, -0.002), (P['sh'] + 0.010, shw * 0.80, 0.078 * k, -0.006), (P['sh'] + 0.030, shw * 0.54, 0.070 * k, -0.010),
             (P['trap'], shw * 0.35, 0.064 * k, -0.012), (P['nbase'], 0.062 * k, 0.056 * k, -0.004)]
    else:
        c = [(z(0.455), 0.158 * k * b, 0.100 * k * b, 0.0), (z(0.505), 0.196 * k * b, 0.114 * k * b, -0.004), (z(0.565), 0.146 * k * b, 0.090 * k, 0.0), (z(0.612), 0.118 * k * b, 0.082 * k, 0.003),
             (z(0.682), 0.140 * k * b, 0.100 * k * b, 0.014), (z(0.738), 0.152 * k * b, 0.112 * k * b, 0.022), (z(0.784), shw * 0.98, 0.095 * k, 0.006), (P['sh'] - 0.012, shw * 0.99, 0.082 * k, -0.002), (P['sh'] + 0.010, shw * 0.78, 0.074 * k, -0.006), (P['sh'] + 0.030, shw * 0.52, 0.066 * k, -0.010),
             (P['trap'], shw * 0.33, 0.060 * k, -0.012), (P['nbase'], 0.058 * k, 0.052 * k, -0.004)]
    if child:
        c = [(zz, rx * 0.95, ry * 1.02, cy) for zz, rx, ry, cy in c]
    return c


def rows_at(rows, z):
    if z <= rows[0][0]: return rows[0]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0] + 1e-9)
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
    return rows[-1]

def tex_hex(tid, cx, cy): return f'T{tid}|{cx:.4f}|{cy:.4f}'

def skirt_geom(pb, P, pd, rows, layer):
    sk = pd['skirt']; kind = sk['kind']; k = P['k']; H = P['H']
    prm = {'kilt': dict(zt=0.605, flare=0.050, apron=0.80, npl=7, amp=0.022, thick=0.008, hem=0.010),
           'pleated': dict(zt=0.585, flare=0.070, apron=sk.get('apron', 0.0), npl=9, amp=0.016, thick=0.006, hem=sk.get('hem', 0.12)),
           'a_line': dict(zt=0.585, flare=0.100, apron=3.2, npl=1, amp=0.0, thick=0.006, hem=sk.get('hem', 0.12)),
           'maxi': dict(zt=0.590, flare=0.200, apron=3.2, npl=1, amp=0.0, thick=0.006, hem=None)}[kind]
    zt = H * prm['zt']
    zh = (P['knee'] + prm['hem'] * (1.0 if kind in ('kilt',) else k)) if prm['hem'] is not None else P['ankle'] + 0.12
    if kind == 'kilt': zh = P['knee'] + 0.01
    if 'hem' in sk and kind != 'kilt': zh = P['knee'] + sk['hem'] * k
    n = 72; NR = 7
    hexc_ = tex_hex(sk['tart'], 0.0, 0.0) if 'tart' in sk else sk['col']
    def pt(z, t, inner=0.0):
        rx, ry, cy = rows_at(rows, z)[1:]
        rx = rx * layer + 0.014 + prm['flare'] * t ** 1.3 * k; ry = ry * layer + 0.012 + prm['flare'] * t ** 1.3 * k
        ring_ = []
        fade = min(1.0, max(0.0, (t - 0.04) / 0.35)); fade = fade * fade * (3 - 2 * fade)
        for i in range(n):
            th = 2 * math.pi * i / n
            phi = ((th - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi
            off = 0.0
            if abs(phi) > prm['apron'] and prm['amp'] > 0:
                pp = (abs(phi) - prm['apron']) / (math.pi - prm['apron'] + 1e-9) * prm['npl']
                fr = pp - math.floor(pp)
                off = prm['amp'] * k * (fr / 0.78 if fr < 0.78 else (1 - fr) / 0.22) * fade
            ring_.append(((rx + off - inner) * math.cos(th), cy + (ry + off - inner) * math.sin(th), z))
        return ring_
    rs = [pt(zt + (zh - zt) * i / (NR - 1), i / (NR - 1)) for i in range(NR)]
    rs.append(pt(zh, 1.0, prm['thick'])); rs.append(pt(zt, 0.0, prm['thick']))
    cy0 = rows_at(rows, zt)[3]
    if 'tart' in sk:
        hexc_ = tex_hex(sk['tart'], 0.0, cy0)
    loft(pb, rs, 'kilt', hexc_, closed=True, cap_top=False, cap_bot=False, smooth=kind in ('a_line', 'maxi'))
    def fy(z):
        t = min(1, max(0, (zt - z) / (zt - zh)))
        r_ = rows_at(rows, z); return r_[3] + r_[2] * layer + 0.012 + prm['flare'] * t ** 1.3 * k
    return dict(zt=zt, zh=zh, fy=fy, rows_top=rows_at(rows, zt))

TOP_FAB = {'tshirt': 'jersey', 'football': 'jersey', 'hoodie': 'jersey', 'jumper': 'knit', 'shirt': 'cotton', 'dress': 'cotton', 'jacket': 'suit', 'puffer': 'puffer', 'coat': 'wool_coat', 'labcoat': 'cotton'}
BOT_FAB = {'trousers': 'suit', 'jeans': 'denim', 'leggings': 'jersey', 'shorts': 'cotton', 'skirt': 'cotton', 'skirtx': 'suit', 'trews': 'suit'}

import zlib
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
    TOPF = TOP_FAB.get(tst, 'cotton'); BOTF = BOT_FAB.get(bst, 'suit'); fab(TOPF)
    # ---------------- torso (skin underneath is only visible at the neck) + clothing layer
    tc = torso_ctrl(pd, P)
    rows = crv(tc, 19)
    def torso_rings(scale, y_off=0.0, z0=None, extra_rx=0.0):
        rs = []
        for z, rx, ry, cy in rows:
            rs.append(ring(0, cy + lean(z) + y_off, z, rx * scale + extra_rx, ry * scale + extra_rx * 0.8, 20))
        return rs
    outer = pd.get('top_style') in ('jacket', 'puffer', 'coat', 'labcoat')
    layer = {'tshirt': 1.012, 'football': 1.012, 'hoodie': 1.03, 'jumper': 1.022, 'shirt': 1.012, 'dress': 1.012, 'jacket': 1.035, 'puffer': 1.065, 'coat': 1.04, 'labcoat': 1.035}.get(tst, 1.02)
    waist_z = H * 0.614
    def thex(r):
        z = rows[r][0]
        if tst in ('jacket', 'puffer', 'coat', 'labcoat'): return top
        if tst == 'dress': return top
        cut = H * 0.47 if tst in ('jumper', 'hoodie', 'tshirt', 'football') else waist_z - 0.01
        return top if z > cut else (bot if bst not in ('skirt',) else top)
    vr_t = loft(pb, torso_rings(layer), 'torso', top, hex_fn=thex, cap_top=True, cap_bot=True)
    fab('cotton')
    if pd.get('inner') and outer:    # shirt/collar visible at the neck opening
        loft(pb, [ring(0, lean(P['nbase']) - 0.01 + 0.012, z, rx, ry, 20) for z, rx, ry in ((P['trap'] + 0.0, 0.07 * k, 0.062 * k), (P['nbase'] + 0.025, 0.056 * k, 0.05 * k))], 'neck', pd['inner'], cap_top=False, cap_bot=False)
    if pd.get('vest'):
        fab('mesh')
        loft(pb, [r_ for r_ in [ring(0, rows[i][3] + lean(rows[i][0]) + 0.003, rows[i][0], rows[i][1] * 1.075, rows[i][2] * 1.07, 14) for i in range(3, 13)]], 'torso', pd['vest'], cap_top=False, cap_bot=False)
        fab('reflective')
        for zi in (6, 9):       # reflective bands stand 4 mm clear of the vest (at 0.7 mm they z-fought with it: white slashes on a dark vest)
            loft(pb, [ring(0, rows[i][3] + lean(rows[i][0]) + 0.006, rows[i][0], rows[i][1] * 1.105, rows[i][2] * 1.10, 14) for i in (zi, zi + 1)], 'torso', '#c9cdd1', cap_top=False, cap_bot=False)
    # ---- shirt details: collar flaps, a button placket and a belt on the tucked-in waist (they are what makes a shirt read as a shirt, not a tube)
    def chest_pt(z_, xs_, off=0.0):
        r_ = rows_at(rows, z_); e_ = max(0.0, 1.0 - (xs_ / (r_[1] * layer)) ** 2)
        return (xs_, r_[3] + lean(z_) + r_[2] * layer * math.sqrt(e_) + off, z_)
    if tst == 'shirt':
        fab('cotton'); nb_ = P['nbase']; zv_ = nb_ - 0.062 * k
        for sg_ in (-1, 1):
            vv_ = [pb.V(p_, 'torso') for p_ in (chest_pt(nb_ + 0.002, sg_ * 0.022 * k, 0.011), chest_pt(nb_ + 0.004, sg_ * 0.058 * k, 0.012), chest_pt(nb_ - 0.040 * k, sg_ * 0.070 * k, 0.009), chest_pt(zv_, sg_ * 0.008 * k, 0.007))]
            pb.F(vv_, top, False); pb.F(vv_[::-1], top, False)
        zl_ = [zv_ - (zv_ - (waist_z + 0.012)) * j_ / 7.0 for j_ in range(8)]
        loft(pb, [ring(0, rows_at(rows, z_)[3] + lean(z_), z_, rows_at(rows, z_)[1] * layer + 0.0035, rows_at(rows, z_)[2] * layer + 0.0035, 3, a0=math.radians(86), a1=math.radians(94), closed=False) for z_ in zl_], 'torso', top, closed=False, cap_top=False, cap_bot=False)
        fab('plastic')
        for j_ in range(5):
            z_ = zv_ - 0.012 * k - (zv_ - waist_z - 0.03) * j_ / 4.0; p_ = chest_pt(z_, 0.0, 0.0050)
            sphere(pb, p_, 0.0058 * k, 0.0045 * k, 0.0058 * k, 'torso', '#efe9da', 6, 3)
        if bst in ('trousers', 'jeans'):
            fab('leather'); zb_ = waist_z - 0.012; r_b = rows_at(rows, zb_ + 0.012)
            loft(pb, [ring(0, r_b[3] + lean(zb_), zb_ + 0.030, r_b[1] * layer + 0.0045, r_b[2] * layer + 0.0045, 20), ring(0, r_b[3] + lean(zb_), zb_, r_b[1] * layer + 0.0045, r_b[2] * layer + 0.0045, 20)], 'torso', '#2a1a12', cap_top=False, cap_bot=False)
            rbox(pb, (0, r_b[3] + lean(zb_) + r_b[2] * layer + 0.0075, zb_ + 0.015), (0.040 * k, 0.008, 0.026 * k), 'torso', '#c8a44a', fab_='metal')
    fab('knit')
    if pd.get('cardigan'):
        loft(pb, [ring(0, rows[i][3] + lean(rows[i][0]) + 0.002, rows[i][0], rows[i][1] * 1.05, rows[i][2] * 1.05, 14) for i in range(4, 13)], 'torso', pd['cardigan'], cap_top=False, cap_bot=False)
    # hem / skirt-like extensions for long garments (weights: hips + thighs)
    hipw = P['hipw']
    fab(TOPF if tst in ('coat', 'puffer', 'jacket', 'dress', 'labcoat') else BOTF)
    if (tst in ('coat', 'puffer', 'jacket', 'dress', 'labcoat') and bst != 'skirtx') or bst == 'skirt':
        hem = {'coat': 0.30, 'puffer': 0.42, 'jacket': 0.40, 'dress': 0.30, 'labcoat': 0.34}.get(tst, 0.30)
        hem_z = H * (0.265 if tst == 'coat' else (0.30 if tst == 'dress' else (0.44 if tst == 'puffer' else (0.36 if tst == 'labcoat' else 0.47)))) if bst != 'skirt' or tst in ('coat',) else H * 0.28
        if bst == 'skirt' and tst not in ('coat', 'dress'): hem_z = H * 0.27
        z_top = rows[1][0]; z_bot = hem_z
        rs = []
        for i in range(7):
            t = i / 6.0
            z = z_top + (z_bot - z_top) * t
            sc = 1.0 + (0.14 if tst == 'coat' else (0.30 if tst == 'dress' or bst == 'skirt' else 0.07)) * t ** 1.4
            rs.append(ring(0, rows[1][3], z, (rows[1][1] * layer) * sc, (rows[1][2] * layer) * (1.0 + 0.2 * t) * sc, 20))
        colr = top if tst in ('coat', 'puffer', 'jacket', 'dress', 'labcoat') else bot
        loft(pb, rs, 'skirt', colr, cap_top=False, cap_bot=True)
        # hem trim
        loft(pb, [rs[-1], [(x, y, z + 0.0) for x, y, z in rs[-1]]], 'skirt', colr, cap_top=False, cap_bot=False)
    kz = None
    fab('suit')
    if bst == 'skirtx':
        kz = skirt_geom(pb, P, pd, rows, layer)
        zt_ = kz['zt']
        fyk = kz['fy']
        if pd.get('belt'):
            fab('leather')
            r_ = rows_at(rows, zt_ + 0.012)
            loft(pb, [ring(0, r_[3], zt_ + 0.032, r_[1] * layer + 0.010, r_[2] * layer + 0.010, 16), ring(0, r_[3], zt_ - 0.004, r_[1] * layer + 0.012, r_[2] * layer + 0.012, 16)], 'torso', '#2a1a12', cap_top=False, cap_bot=False)
            rbox(pb, (0, r_[3] + r_[2] * layer + 0.016, zt_ + 0.014), (0.045 * k, 0.012, 0.034 * k), 'torso', '#c8a44a', fab_='metal')
        if pd.get('sporran'):
            fab('wool_coat')
            zc = zt_ - 0.20 * k
            yy = fyk(zc) + 0.030
            sphere(pb, (0, yy, zc), 0.058 * k, 0.026 * k, 0.082 * k, 'kilt', '#5b4a3a', 8, 5)
            sphere(pb, (0, yy + 0.010, zc + 0.045 * k), 0.046 * k, 0.020 * k, 0.034 * k, 'kilt', '#b8bcc4', 8, 4, fab_='metal')
            for tx in (-0.03, -0.015, 0.0, 0.015, 0.03):
                tube_pts(pb, [(tx * k, yy + 0.02, zc - 0.06 * k), (tx * k, yy + 0.026, zc - 0.115 * k)], [0.0055 * k, 0.004 * k], 'kilt', '#e8e0d0', n=5)
            tube_pts(pb, [(0, fyk(zt_ - 0.02) + 0.006, zt_ - 0.015), (0, yy, zc + 0.06 * k)], [0.007 * k, 0.007 * k], 'kilt', '#2a1a12', n=5)
    fab('suit')
    if pd.get('waistcoat'):
        for i_ in range(4, 12): pass
        wr_ = [ring(0, rows[i][3] + lean(rows[i][0]), rows[i][0], rows[i][1] * layer * 1.012 + 0.004, rows[i][2] * layer * 1.012 + 0.004, 14, a0=math.radians(48), a1=math.radians(132), closed=False) for i in range(3, 11)]
        loft(pb, wr_, 'torso', pd['waistcoat'], closed=False, cap_top=False, cap_bot=False)
        if pd.get('inner'):
            loft(pb, [ring(0, rows[i][3] + lean(rows[i][0]), rows[i][0], rows[i][1] * layer * 1.014 + 0.005, rows[i][2] * layer * 1.014 + 0.005, 14, a0=math.radians(74), a1=math.radians(106), closed=False) for i in range(8, 12)], 'torso', pd['inner'], closed=False, cap_top=False, cap_bot=False)
    fab('metal')
    if pd.get('buttons'):
        for i_ in (4, 5, 6, 7):
            r_ = rows[i_]
            sphere(pb, (0.0, r_[3] + lean(r_[0]) + r_[2] * layer * 1.03 + 0.008, r_[0]), 0.0085 * k, 0.0075 * k, 0.0085 * k, 'torso', '#c9ced6', 6, 3)
        for sg_ in (-1, 1):
            r_ = rows[10]
            sphere(pb, (sg_ * r_[1] * 0.45, r_[3] + lean(r_[0]) + r_[2] * layer * 0.92 + 0.010, r_[0] - 0.02), 0.007 * k, 0.006 * k, 0.007 * k, 'torso', '#c9ced6', 6, 3)
    fab('cotton')
    if pd.get('bowtie'):
        zb_ = P['nbase'] - 0.018; yb_ = rows[-1][3] + rows[-1][2] + 0.012
        for sg_ in (-1, 1): sphere(pb, (sg_ * 0.017 * k, yb_, zb_), 0.016 * k, 0.008 * k, 0.010 * k, 'neck', pd['bowtie'], 6, 3)
        sphere(pb, (0, yb_ + 0.002, zb_), 0.007 * k, 0.007 * k, 0.007 * k, 'neck', pd['bowtie'], 6, 3)
    if pd.get('sash') is not None:
        ptsS = []
        for z_, x_, ydir in ((P['trap'] + 0.004, P['shw'] * 0.62, 0.0), (rows[9][0], P['shw'] * 0.50, 0.9), (rows[7][0], P['shw'] * 0.15, 1.0), (rows[5][0], -rows[5][1] * 0.45, 1.0), (rows[3][0], -rows[3][1] * 0.80, 0.55), (rows[2][0], -rows[2][1] * 1.02, 0.0)):
            r_ = rows_at(rows, z_)
            ptsS.append((x_, r_[3] + lean(z_) + r_[2] * layer * ydir * 1.0 + (0.012 if ydir > 0 else 0.004), z_ + 0.0))
        tid = tex_hex(pd['sash'], 0.0, 0.0)
        tube_pts(pb, ptsS, [0.022 * k] * len(ptsS), 'torso', tid, n=4, cap_top=True, cap_bot=True)
        sphere(pb, (ptsS[0][0], ptsS[0][1], ptsS[0][2] + 0.012), 0.016 * k, 0.016 * k, 0.012 * k, 'torso', '#d4b44a', 6, 3)
    # ---- apron (delantal): bib + skirt panel over the front of the body, neck loop and waist tie
    if pd.get('apron'):
        ac = pd['apron']; fab('cotton')
        a0_, a1_ = math.radians(34), math.radians(146)
        zb_ = rows[8][0]; zw_ = rows[0][0]; zk_ = H * 0.29
        up_ = []
        for i_ in range(6):
            z_ = zb_ + (zw_ - zb_) * i_ / 5.0; r_ = rows_at(rows, z_)
            up_.append(ring(0, r_[3] + lean(z_), z_, r_[1] * layer * 1.05 + 0.010, r_[2] * layer * 1.05 + 0.012, 14, a0=a0_, a1=a1_, closed=False))
        loft(pb, up_, 'torso', ac, closed=False, cap_top=False, cap_bot=False)
        lo_ = [up_[-1]]
        for i_ in range(1, 6):
            t_ = i_ / 5.0; z_ = zw_ + (zk_ - zw_) * t_; r_ = rows[0]
            lo_.append(ring(0, r_[3], z_, r_[1] * layer * 1.05 + 0.010 + 0.012 * t_, r_[2] * layer * 1.05 + 0.014 + 0.016 * t_, 14, a0=a0_, a1=a1_, closed=False))
        loft(pb, lo_, 'skirt', ac, closed=False, cap_top=False, cap_bot=False)
        r_ = rows_at(rows, rows[5][0]); zt_ = rows[5][0]
        loft(pb, [ring(0, r_[3] + lean(zt_), zt_ - 0.014, r_[1] * layer * 1.07 + 0.008, r_[2] * layer * 1.07 + 0.010, 20), ring(0, r_[3] + lean(zt_), zt_ + 0.010, r_[1] * layer * 1.07 + 0.008, r_[2] * layer * 1.07 + 0.010, 20)], 'torso', ac, cap_top=False, cap_bot=False)   # waist tie
        def surf_(z_, xs_):          # a point just outside the chest surface at height z_ and lateral offset xs_ (the straps hug the body instead of cutting through it)
            r_ = rows_at(rows, z_); e_ = max(0.0, 1.0 - (xs_ / (r_[1] * layer * 1.03)) ** 2)
            return (xs_, r_[3] + lean(z_) + r_[2] * layer * 1.03 * math.sqrt(e_) + 0.010, z_)
        for sg_ in (-1, 1):
            zz_ = (zb_, (zb_ + P['trap']) / 2, P['trap'] + 0.004)
            pts_a = [surf_(z_, sg_ * x_ * k) for z_, x_ in zip(zz_, (0.060, 0.058, 0.054))]
            pts_a.append((sg_ * 0.046 * k, rows_at(rows, P['nbase'])[3] - 0.022, P['nbase'] + 0.010))
            tube_pts(pb, pts_a, [0.0075 * k] * 4, 'torso', ac, n=5, cap_top=True, cap_bot=True)
    # ---- ruana (Andean wool poncho): hangs from the shoulders, open slit at the front, wide enough for the arms to swing inside
    if pd.get('ruana'):
        rc_ = pd['ruana']; fab('wool_coat')
        spec_ = ((P['trap'] + 0.006, 0.078), (P['sh'] - 0.006, 0.255), (P['sh'] - 0.10 * k, 0.295), (H * 0.60, 0.322), (H * 0.52, 0.340), (H * 0.465, 0.348))
        rr_ = []
        for i_, (z_, rx_) in enumerate(spec_):
            r_ = rows_at(rows, z_)
            rr_.append(ring(0, r_[3] + lean(z_), z_, rx_ * k * max(0.95, pd['build'] ** 0.5), r_[2] * layer + 0.018 + 0.030 * i_ / 5.0, 24, a0=math.radians(122), a1=math.radians(418), closed=False))
        loft(pb, rr_, 'torso', rc_, closed=False, cap_top=False, cap_bot=False)
        fab('cotton')
        loft(pb, [rr_[-1], [(x, y, z - 0.018) for x, y, z in rr_[-1]]], 'torso', pd.get('ruana_trim', '#c9a24a'), closed=False, cap_top=False, cap_bot=False)
    fab(TOPF)
    # hood for hoodies (bunched at the neck, behind)
    if tst == 'hoodie':
        loft(pb, [ring(0, -0.05 * k, P['trap'] + 0.04, 0.095 * k, 0.07 * k, 10), ring(0, -0.075 * k, P['trap'] - 0.02, 0.105 * k, 0.07 * k, 10), ring(0, -0.07 * k, P['trap'] - 0.09, 0.09 * k, 0.05 * k, 10)], 'torso', top, cap_top=True, cap_bot=True)
    # collars for coats
    if tst in ('coat', 'jacket', 'puffer', 'labcoat'):
        loft(pb, [ring(0, lean(P['nbase']) - 0.01, P['trap'] - 0.01, 0.085 * k, 0.07 * k, 20), ring(0, lean(P['nbase']) - 0.012, P['nbase'] + 0.035, 0.07 * k, 0.062 * k, 20)], 'torso', top, cap_top=False, cap_bot=False)
    elif tst in ('tshirt', 'football', 'jumper', 'shirt', 'dress'):
        # neckband: a short rolled ring that hides where the neck column meets the flat top of the torso (it used to show as a ragged edge)
        ncy_ = lean(P['nbase']) * 0.7; nb_ = P['nbase']
        coll = pd.get('collar') or top
        # (about 40 % lower than before: at 2.4 cm it read as a turtleneck on every T-shirt)
        loft(pb, [ring(0, ncy_ - 0.004, nb_ - 0.012, 0.0668 * k, 0.0600 * k, 20), ring(0, ncy_ - 0.002, nb_ - 0.003, 0.0636 * k, 0.0578 * k, 20), ring(0, ncy_ - 0.001, nb_ + 0.004, 0.0600 * k, 0.0556 * k, 20), ring(0, ncy_ + 0.000, nb_ + 0.006, 0.0584 * k, 0.0545 * k, 20)], 'neck', coll, cap_top=False, cap_bot=False)
    # ---------------- neck + head
    ncy = lean(P['nbase']) * 0.7
    nrings = [ring(0, ncy, P['nbase'] - 0.03, 0.062 * k, 0.058 * k, 20), ring(0, ncy + 0.004, P['nbase'] + 0.03 * k, 0.054 * k, 0.051 * k, 20), ring(0, ncy + 0.010, P['chin'] + hh * 0.10, 0.054 * k, 0.054 * k, 20), ring(0, ncy + 0.026 * k, P['chin'] + hh * 0.30, 0.066 * k, 0.074 * k, 20)]
    loft(pb, nrings, 'neck', skin, cap_top=False, cap_bot=False)
    # head: skull profile (rx, ry, cy) over height fractions + sculpted face (analytic displacement of the front vertices)
    male = not fem
    hf = [0.0, 0.04, 0.12, 0.26, 0.46, 0.66, 0.82, 0.93, 1.0]
    wscale = 1.0 if male else 0.94
    if child: wscale = 1.03
    hrx = [0.075, 0.150, 0.235, 0.305, 0.332, 0.338, 0.300, 0.210, 0.06]
    hry = [0.080, 0.170, 0.285, 0.375, 0.420, 0.430, 0.390, 0.300, 0.10]
    hcy = [0.33, 0.27, 0.17, 0.07, 0.01, 0.0, -0.01, -0.02, -0.02]
    if not male or child:     # softer, rounder jaw
        hrx[1] += 0.008; hrx[2] += 0.010; hry[2] -= 0.008
    ctrl = [(P['chin'] + f * hh, hrx[i] * hh * wscale, hry[i] * hh, hcy[i] * hh + lean(P['chin']) * 0.9) for i, f in enumerate(hf)]
    hrows = crv(ctrl, 22)
    hrows_fine = crv(ctrl, 80)
    hy0 = lean(P['chin']) * 0.9
    NH = 16
    def hring(row, sc=1.0, dy=0.0, drx=0.0, dry=0.0):        # plain elliptical ring (hair / hats)
        z, rx, ry, cy = row
        return ring(0, cy + dy, z, rx * sc + drx, ry * sc + dry, NH)
    G_ = lambda x, c, w: math.exp(-((x - c) / w) ** 2)
    mfac = 1.0 if male else 0.0
    def face_disp(X, Zv):
        """outward (+y) displacement in head-heights at lateral X (in hh) and height fraction Zv (0 chin .. 1 crown)"""
        d = 0.0
        d += (0.016 + 0.014 * mfac) * G_(Zv, 0.600, 0.05) * G_(X, 0.0, 0.30)                       # brow ridge
        d -= 0.014 * G_(Zv, 0.50, 0.055) * (G_(X, 0.14, 0.07) + G_(X, -0.14, 0.07))             # eye sockets
        d += 0.022 * G_(Zv, 0.39, 0.09) * (G_(X, 0.25, 0.10) + G_(X, -0.25, 0.10))               # cheekbones
        d -= (0.014 + 0.012 * mfac) * G_(Zv, 0.27, 0.07) * (G_(X, 0.27, 0.09) + G_(X, -0.27, 0.09))  # cheek hollows
        d += 0.034 * G_(Zv, 0.19, 0.036) * G_(X, 0.0, 0.17)                                         # lips / muzzle
        d -= 0.014 * G_(Zv, 0.165, 0.010) * G_(X, 0.0, 0.11)                                         # mouth groove
        d += 0.030 * G_(Zv, 0.065, 0.050) * G_(X, 0.0, 0.12)                                         # chin
        d += 0.014 * G_(Zv, 0.84, 0.12) * G_(X, 0.0, 0.25)                                           # forehead
        d -= 0.012 * G_(Zv, 0.255, 0.030) * G_(X, 0.0, 0.10)                                          # philtrum / under nose
        return d
    def row_at(z):
        return min(hrows_fine, key=lambda r_: abs(r_[0] - z))
    def skull_y(x, z):
        r_ = row_at(z)
        return r_[3] + r_[2] * math.sqrt(max(0.0, 1 - (x / r_[1]) ** 2)) + face_disp(x / hh, (z - P['chin']) / hh) * hh
    A0, A1 = math.radians(22), math.radians(158)
    ANG = [A0 + (A1 - A0) * i / 19 for i in range(20)] + [A1 + (A0 + 2 * math.pi - A1) * j / 14 for j in range(1, 14)]
    def skull_ring(row):
        z, rx, ry, cy = row
        out = []
        Zv = (z - P['chin']) / hh
        for th in ANG:
            x = rx * math.cos(th); y = cy + ry * math.sin(th)
            fw = max(0.0, min(1.0, (math.sin(th) - 0.15) / 0.55))
            out.append((x, y + fw * face_disp(x / hh, Zv) * hh, z))
        return out
    NA = len(ANG)
    def face_fn(r, i):
        z = hrows[r][0]; f = (z - P['chin']) / hh
        return (0.09 < f < 0.92) and (i < 19)
    loft(pb, [skull_ring(r) for r in hrows], 'head', skin, cap_top=True, cap_bot=True, face_fn=face_fn)
    # nose: bridge -> tip -> alae, rings embedded in the face (units of head height)
    NOSE_C = [(0.55, 0.020, 0.000), (0.51, 0.027, 0.022), (0.46, 0.036, 0.058), (0.41, 0.047, 0.095), (0.36, 0.058, 0.122), (0.328, 0.066, 0.130), (0.305, 0.060, 0.110), (0.288, 0.050, 0.066), (0.280, 0.042, 0.020)]
    NOSE = crv(NOSE_C, 14)
    nrg = []
    for v_, w_, d_ in NOSE:
        zz = P['chin'] + v_ * hh; ys = skull_y(0.0, zz)
        nrg.append(ring(0, ys - 0.016 * hh + d_ * hh * 0.5, zz, max(0.004, w_) * hh, max(0.002, d_) * hh * 0.5 + 0.006 * hh, 16))
    loft(pb, nrg, 'head', skin, cap_top=True, cap_bot=True)
    for sg in (-1, 1):
        zz = P['chin'] + 0.318 * hh
        sphere(pb, (sg * 0.056 * hh, skull_y(sg * 0.056 * hh, zz) + 0.036 * hh, zz), 0.028 * hh, 0.030 * hh, 0.026 * hh, 'head', skin, 8, 4)
    # ears: flattened ellipsoid + lobe
    for sg in (-1, 1):
        rE = row_at(P['chin'] + 0.46 * hh)
        sphere(pb, (sg * (rE[1] + 0.006 * hh), rE[3] - 0.03 * hh, P['chin'] + 0.47 * hh), 0.020 * hh, 0.075 * hh, 0.125 * hh, 'head', skin, 10, 6)
        sphere(pb, (sg * (rE[1] + 0.008 * hh), rE[3] - 0.01 * hh, P['chin'] + 0.35 * hh), 0.016 * hh, 0.030 * hh, 0.038 * hh, 'head', skin, 6, 4)
    # ---- eyes: modelled eyeballs (iris texture) + upper / lower lids that carry the lash line from the face tile
    eye_z = P['chin'] + hh * 0.50
    er = 0.058 * hh
    for sg in (-1, 1):
        ex = sg * 0.194 * 0.72 * hh
        ysurf = skull_y(ex, eye_z)
        ec = (ex, ysurf - 0.62 * er, eye_z)
        uvf = (lambda co, ec=ec, er=er: ((co.x - ec[0]) / (2 * er * 1.12) + 0.5, (co.z - ec[2]) / (2 * er) + 0.5))
        sphere(pb, ec, er * 1.12, er, er, 'head', '#ffffff', 12, 7, smooth=True, uv=uvf, fab_='eye')
        zone(pb, ec, er * 1.09, 'head', 0.06, math.acos(0.16), 14, 3, fab_='face')          # upper lid
        zone(pb, ec, er * 1.09, 'head', math.acos(-0.46), math.pi - 0.06, 14, 3, fab_='face')   # lower lid
    # ---------------- hair: skull-hugging cap (hairline shaped per angle, strand texture) + alpha-tested hair cards (strand clumps) for length / fringe / silhouette
    hcol = HAIR[pd['hair'][0]]; style = pd['hair'][1]
    zc_f = lambda f: P['chin'] + f * hh
    th = (0.007 if style == 'buzz' else 0.016) * k
    hat_off = th + 0.010 * k                    # every hat shell stands clear of the hair cap (it used to be thinner than the hair, which then poked through)
    hat_ = pd.get('hat')
    rng_h = random.Random(zlib.crc32(pd['id'].encode()))
    def hairline(phi, st):
        """hairline height fraction vs angle from the front (phi = 0 front .. pi back)"""
        pts_ = [(0.0, 0.80), (0.5, 0.75), (0.9, 0.66), (1.57, 0.62), (2.2, 0.54), (3.14159, 0.36)]
        if st in ('long', 'bob', 'braid', 'pigtails'): pts_ = [(0.0, 0.79), (0.5, 0.75), (0.9, 0.62), (1.57, 0.56), (2.2, 0.40), (3.14159, 0.32)]
        if pd['kind'] == 'elder': pts_ = [(0.0, 0.74), (0.5, 0.70), (0.9, 0.64), (1.57, 0.62), (2.2, 0.54), (3.14159, 0.40)]
        if st == 'receding': pts_ = [(0.0, 0.92), (0.5, 0.88), (0.9, 0.72), (1.57, 0.60), (2.2, 0.50), (3.14159, 0.38)]       # bare forehead and crown, hair at the sides and nape
        if st == 'slick': pts_ = [(0.0, 0.86), (0.5, 0.80), (0.9, 0.66), (1.57, 0.58), (2.2, 0.44), (3.14159, 0.34)]
        if st == 'scarf': pts_ = [(0.0, 0.76), (0.5, 0.72), (0.9, 0.62), (1.57, 0.52), (2.2, 0.40), (3.14159, 0.28)]
        phi = abs(phi)
        for (p0, f0), (p1, f1) in zip(pts_, pts_[1:]):
            if phi <= p1: return f0 + (f1 - f0) * (phi - p0) / (p1 - p0)
        return pts_[-1][1]
    def hair_point(ang, f, off):
        r_ = row_at(P['chin'] + f * hh)
        return ((r_[1] + off) * math.cos(ang), r_[3] + (r_[2] + off) * math.sin(ang), P['chin'] + f * hh)
    def torso_clamp(pt, ang, lay=0.0):
        """keep hair that hangs below the neck outside the garment"""
        x, y, z = pt
        if z < P['nbase'] + 0.01:
            rt = rows_at(rows, z)
            xt = rt[1] * layer * 1.04 + 0.014 + lay; yt = rt[3] + rt[2] * layer * 1.04 + 0.014 + lay
            sx_, sy_ = math.cos(ang), math.sin(ang)
            x = math.copysign(max(abs(x), xt * abs(sx_)), sx_) if abs(sx_) > 0.05 else x
            y = (rt[3] - (rt[2] * layer * 1.04 + 0.014 + lay) * abs(sy_) if sy_ < 0 else max(y, yt * sy_ + rt[3] * 0)) if False else (min(y, rt[3] - (rt[2] * layer * 1.04 + 0.014 + lay) * abs(sy_)) if sy_ < -0.05 else y)
        return (x, y, z)
    def card(pts, width, tile, hexc=None, taper=1.0):
        """alpha-tested ribbon (root -> tip along pts); width in metres; tile = (tx, ty) in the 4x4 hair sheet"""
        hexc = hexc or hcol
        n_ = len(pts); L = []; R = []
        for i in range(n_):
            t_ = Vector(pts[min(i + 1, n_ - 1)]) - Vector(pts[max(i - 1, 0)])
            outn = Vector((pts[i][0], pts[i][1] - hy0, 0.0)); outn = outn.normalized() if outn.length > 1e-6 else Vector((0, 1, 0))
            sd = t_.cross(outn)
            sd = sd.normalized() if sd.length > 1e-6 else Vector((1, 0, 0))
            w_ = width * (1.0 + 0.25 * i / max(1, n_ - 1))
            L.append(pb.V((Vector(pts[i]) - sd * w_ / 2)[:], 'head')); R.append(pb.V((Vector(pts[i]) + sd * w_ / 2)[:], 'head'))
        tx, ty = tile
        for i in range(n_ - 1):
            va = 1.0 - (ty + i / (n_ - 1)) * 0.25; vb = 1.0 - (ty + (i + 1) / (n_ - 1)) * 0.25
            ua, ub = tx * 0.25 + 0.004, (tx + 1) * 0.25 - 0.004
            pb.F((L[i], R[i], R[i + 1], L[i + 1]), hexc, True, uv=[(ua, va), (ub, va), (ub, vb), (ua, vb)], fab_='hair_card')
    def cards_ring(angs, f0, f1, off0, flare, nseg, wid, layers=1, jitter=0.0, lenvar=0.15):
        """solid hair volume: smooth-shaded shell over an arc of the head, per-column clump relief + uneven lengths, tapering to rounded ends"""
        # arcs may wrap past 360: unwrap relative to the first angle
        al = list(angs)
        if max(al) - min(al) > math.pi: al = [x + 2 * math.pi if x < math.radians(90) else x for x in al]
        al = sorted(al); a0, a1 = al[0] - math.radians(6), al[-1] + math.radians(6)
        ncol = max(8, int((a1 - a0) / math.radians(10)))
        for L_ in range(layers):
            phase = rng_h.uniform(0, 6.28); lens = []
            for i in range(ncol + 1):
                v_ = 1 + lenvar * (math.sin(i * 1.7 + phase) * 0.6 + rng_h.uniform(-0.4, 0.4))
                lens.append(f1 * v_ if f1 > 0 else f1 * v_)
            rings_ = []
            for j in range(nseg + 1):
                t = j / nseg; pts = []
                for i in range(ncol + 1):
                    ang = a0 + (a1 - a0) * i / ncol
                    f = f0 + (lens[i] - f0) * t
                    edge = min(i, ncol - i) / 3.0
                    clump = 0.005 * math.sin(i * 2.1 + phase) * min(1.0, t * 3)
                    off = th + off0 + L_ * 0.008 + flare * (t ** 1.4) * hh + clump
                    off *= (1.0 - 0.55 * (1 - min(1.0, edge)) * t)          # edges roll in toward the head
                    fh = max(f, 0.30)
                    pt = hair_point(ang, fh, off)
                    if f < 0.30: pt = (pt[0], pt[1], P['chin'] + f * hh)
                    pts.append(torso_clamp(pt, ang, L_ * 0.008))
                rings_.append(pts)
            # rounded tip: one extra ring pulled in
            tip = [(0.5 * (p_[0] + hair_point(a0 + (a1 - a0) * i / ncol, 0.30, 0)[0] * 0 ) + 0.0, 0, 0) for i, p_ in enumerate(rings_[-1])]
            lr = rings_[-1]; ex = []
            for i, p_ in enumerate(lr):
                ang = a0 + (a1 - a0) * i / ncol
                ex.append((p_[0] * 0.92, p_[1] - (0.012 if math.sin(ang) < 0 else -0.004), p_[2] - 0.035 * hh))
            rings_.append(ex)
            loft(pb, rings_, 'head', hcol, closed=False, cap_top=False, cap_bot=False, smooth=True)
    if style != 'bald':
        HN = 28
        rowsc = [r_ for r_ in crv(ctrl, 22) if (r_[0] - P['chin']) / hh >= 0.30]
        if style == 'receding': rowsc = [r_ for r_ in rowsc if (r_[0] - P['chin']) / hh <= 0.80]       # open crown: the scalp shows
        rgs = []
        for row in rowsc:
            f = (row[0] - P['chin']) / hh; pts_ = []
            for i in range(HN):
                ang = 2 * math.pi * i / HN; phi = ((ang - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi
                ff = max(f, hairline(phi, style))
                pts_.append(hair_point(ang, ff, th * (1.0 + 0.5 * max(0.0, (ff - 0.8) * 5))))
            rgs.append(pts_)
        loft(pb, rgs, 'head', hcol, cap_top=(style != 'receding'), cap_bot=False, closed=True)
        fr = math.radians(90)
        back = [math.radians(a_) for a_ in range(200, 341, 10)]
        side_l = [math.radians(a_) for a_ in (150, 165, 180)]; side_r = [math.radians(a_) for a_ in (0, 15, 30)]
        if style == 'short' and not hat_:
            # fringe tufts along the front hairline + short layers at the nape / sides
            cards_ring([fr + math.radians(d) for d in range(-40, 41, 16)], 0.86, 0.66, 0.002, 0.03, 3, 0.055, 1, 0.05, 0.1)
        if style == 'curly':
            for a_ in range(0, 360, 36):
                ca, sa = math.cos(math.radians(a_)), math.sin(math.radians(a_))
                if sa > 0.65: continue
                for zf, sc_ in ((0.74, 1.12), (0.90, 1.05)):
                    r_ = row_at(zc_f(zf)); sphere(pb, (ca * (r_[1] + 0.012), r_[3] + sa * (r_[2] + 0.012), zc_f(zf)), 0.034 * k, 0.034 * k, 0.030 * k, 'head', hcol, 7, 4)
            for a_ in (60, 120, 180, 240, 300, 0):
                ca, sa = math.cos(math.radians(a_)), math.sin(math.radians(a_)); r_ = row_at(zc_f(1.0))
                sphere(pb, (ca * r_[1] * 1.5, r_[3] + sa * r_[2] * 1.5, zc_f(0.98)), 0.036 * k, 0.036 * k, 0.030 * k, 'head', hcol, 7, 4)
            sphere(pb, (0, hy0, zc_f(1.02)), 0.05 * k, 0.05 * k, 0.04 * k, 'head', hcol, 8, 4)
        if style == 'bob':
            cards_ring(back + side_l + side_r, 0.76, 0.10, 0.004, 0.14, 5, 0.085, 1, 0.04, 0.06)
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.64, 0.004, 0.04, 3, 0.06, 1, 0.04, 0.1)
        if style == 'long':
            cards_ring(back + side_l + side_r, 0.76, -1.05, 0.004, 0.12, 8, 0.095, 1, 0.04, 0.12)
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.58, 0.004, 0.05, 3, 0.065, 1, 0.04, 0.1)
        if style == 'pony':
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.64, 0.004, 0.04, 3, 0.06, 1, 0.04, 0.1)
            base = hair_point(math.radians(270), 0.78, th + 0.012)
            for j, wob in ((0, 0.0), (-1, -0.012), (1, 0.012)):
                pts = [(base[0] + j * 0.010, base[1] + 0.004, base[2] + 0.004), (base[0] + j * 0.016 + wob * 0.3, base[1] - 0.05 * hh, base[2] - 0.12 * hh), (base[0] + j * 0.022 + wob, base[1] - 0.085 * hh, base[2] - 0.46 * hh), (base[0] + j * 0.020 + wob * 1.4, base[1] - 0.07 * hh, base[2] - 0.80 * hh), (base[0] + j * 0.020 + wob, base[1] - 0.05 * hh, base[2] - 1.0 * hh)]
                tube_pts(pb, pts, [0.034 * k, 0.046 * k, 0.042 * k, 0.028 * k, 0.008 * k] if j == 0 else [0.024 * k, 0.034 * k, 0.030 * k, 0.020 * k, 0.006 * k], 'head', hcol, n=12)
            sphere(pb, base, 0.022 * k, 0.022 * k, 0.018 * k, 'head', '#d03a5a', 6, 3, fab_='rubber')
        if style == 'bun':
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.66, 0.004, 0.03, 3, 0.06, 1, 0.04, 0.1)
            sphere(pb, (0, hy0 - ctrl[7][2] * 0.9, zc_f(1.02)), 0.055 * k, 0.055 * k, 0.048 * k, 'head', hcol, 10, 6)
        if style == 'sidepart':        # short, swept across the brow from a side parting
            cards_ring([fr + math.radians(d) for d in range(-56, 25, 16)], 0.88, 0.60, 0.004, 0.05, 3, 0.062, 1, 0.05, 0.12)
            cards_ring([fr + math.radians(d) for d in range(30, 71, 20)], 0.84, 0.72, 0.003, 0.03, 3, 0.055, 1, 0.03, 0.08)
        if style == 'slick':           # combed straight back, a little length over the collar
            cards_ring(back, 0.74, 0.36, 0.004, 0.06, 4, 0.09, 1, 0.03, 0.08)
        if style == 'receding':        # elder man: thin crown, tufts above the ears and at the nape (two separate arcs: one call over both sides ran a band across the face)
            cards_ring(side_l, 0.62, 0.40, 0.004, 0.04, 3, 0.07, 1, 0.04, 0.1)
            cards_ring(side_r, 0.62, 0.40, 0.004, 0.04, 3, 0.07, 1, 0.04, 0.1)
            cards_ring(back, 0.52, 0.30, 0.004, 0.05, 3, 0.09, 1, 0.03, 0.08)
        if style == 'topknot':         # hair gathered high at the front of the crown
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.70, 0.004, 0.03, 3, 0.06, 1, 0.04, 0.1)
            sphere(pb, (0, hy0 + ctrl[7][2] * 0.25, zc_f(1.07)), 0.046 * k, 0.046 * k, 0.050 * k, 'head', hcol, 10, 6)
            sphere(pb, (0, hy0 + ctrl[7][2] * 0.25, zc_f(0.97)), 0.030 * k, 0.030 * k, 0.020 * k, 'head', '#d03a5a', 6, 3, fab_='rubber')
        if style == 'braid':           # one plait down the back, over a smooth skull cap and fringe
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.66, 0.004, 0.03, 3, 0.06, 1, 0.04, 0.1)
            b0 = hair_point(math.radians(270), 0.55, th + 0.010)
            for i_ in range(11):
                zz_ = b0[2] - i_ * 0.050 * k; rt_ = rows_at(rows, zz_)
                yy_ = min(b0[1] - 0.006, rt_[3] - rt_[2] * layer * 1.06 - 0.022 * k) if zz_ < P['nbase'] else b0[1]
                sphere(pb, ((0.007 if i_ % 2 else -0.007) * k, yy_, zz_), 0.021 * k * (1.0 - 0.025 * i_), 0.019 * k, 0.030 * k, 'chest' if zz_ < P['nbase'] else 'head', hcol, 7, 4)
            sphere(pb, (0, yy_, zz_ - 0.032 * k), 0.016 * k, 0.016 * k, 0.014 * k, 'chest', '#d03a5a', 6, 3, fab_='rubber')
        if style == 'pigtails':        # two bunches at the sides, tied with bobbles
            cards_ring([fr + math.radians(d) for d in range(-36, 37, 18)], 0.84, 0.66, 0.004, 0.03, 3, 0.06, 1, 0.04, 0.1)
            for sg_ in (-1, 1):
                b0 = hair_point(math.radians(90 + sg_ * 78), 0.62, th + 0.012)
                pts = [(b0[0], b0[1] - 0.004, b0[2]), (b0[0] + sg_ * 0.030 * k, b0[1] - 0.010, b0[2] - 0.10 * hh), (b0[0] + sg_ * 0.040 * k, b0[1] - 0.016, b0[2] - 0.34 * hh), (b0[0] + sg_ * 0.036 * k, b0[1] - 0.020, b0[2] - 0.56 * hh), (b0[0] + sg_ * 0.032 * k, b0[1] - 0.024, b0[2] - 0.70 * hh)]
                tube_pts(pb, pts, [0.020 * k, 0.034 * k, 0.034 * k, 0.026 * k, 0.008 * k], 'head', hcol, n=10)
                sphere(pb, b0, 0.020 * k, 0.020 * k, 0.016 * k, 'head', '#e0a020', 6, 3, fab_='rubber')
    if pd.get('beard'):
        def beard_rows(fl, a0, a1, off):
            rs = []
            for f in fl:
                row = row_at(zc_f(max(f, 0.0)))
                rs.append(ring(0, row[3] + 0.002, zc_f(f), row[1] + off, row[2] + off, 12, a0=math.radians(a0), a1=math.radians(a1), closed=False))
            return rs
        loft(pb, beard_rows((0.20, 0.13, 0.07, 0.02, -0.02), 40, 140, 0.009), 'head', hcol, closed=False, cap_top=False, cap_bot=False)       # chin beard
        loft(pb, beard_rows((0.42, 0.34, 0.26, 0.18, 0.12), 8, 42, 0.007), 'head', hcol, closed=False, cap_top=False, cap_bot=False)         # side whiskers
        loft(pb, beard_rows((0.42, 0.34, 0.26, 0.18, 0.12), 138, 172, 0.007), 'head', hcol, closed=False, cap_top=False, cap_bot=False)
        mz = zc_f(0.215); my_ = skull_y(0, mz)
        qbox(pb, (0, my_ + 0.004, mz), (0.13 * hh, 0.030 * hh, 0.030 * hh), 'head', hcol)      # moustache
    # hats
    hat = pd.get('hat')
    if hat:
        hs, hc = hat
        fab('knit' if hs == 'beanie' else 'wool_coat')
        if hs == 'beanie':
            rs = [hring(r_, 1.0, -0.004, hat_off, hat_off) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.62]
            loft(pb, rs, 'head', hc, cap_top=True, cap_bot=False)
            loft(pb, [rs[0], [(x, y, z - 0.012) for x, y, z in rs[0]]], 'head', '#d9d9d9', cap_top=False, cap_bot=False)
        if hs == 'tam':
            zb_ = P['chin'] + hh * 0.70
            rb_ = [hring(r_, 1.0, -0.002, hat_off, hat_off) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.70]
            r0_ = rb_[0]; cyc = sum(p_[1] for p_ in r0_) / len(r0_); zc0 = r0_[0][2]
            cap_r = max(abs(p_[0]) for p_ in r0_)
            crown = [ring(0, cyc + 0.006, zc0 + dz, cap_r * sc_, cap_r * sc_ * 1.02, 14) for dz, sc_ in ((0.0, 1.0), (0.016, 1.22), (0.034, 1.30), (0.052, 1.18), (0.062, 0.86))]
            loft(pb, crown, 'head', hc, cap_top=True, cap_bot=False)
            loft(pb, [ring(0, cyc, zc0 - 0.014, cap_r * 1.02, cap_r * 1.05, 14), ring(0, cyc, zc0 + 0.008, cap_r * 1.04, cap_r * 1.07, 14)], 'head', '#14141a', cap_top=False, cap_bot=False)
            sphere(pb, (0, cyc + 0.006, zc0 + 0.070), 0.016 * k, 0.016 * k, 0.014 * k, 'head', '#b5161e', 6, 3)
        if hs == 'glengarry':
            rs = [hring(r_, 1.0, -0.002, hat_off, hat_off) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.70]
            loft(pb, rs, 'head', hc, cap_top=True, cap_bot=False)
            zb_ = rs[0][0][2]; cyc = sum(p_[1] for p_ in rs[0]) / len(rs[0])
            rbox(pb, (0, cyc, zb_ + 0.075 * k), (0.016 * k, 0.17 * k, 0.034 * k), 'head', hc)
            loft(pb, [ring(0, cyc, zb_ - 0.004, max(abs(p_[0]) for p_ in rs[0]) + 0.003, max(p_[1] - cyc for p_ in rs[0]) + 0.003, 14), ring(0, cyc, zb_ + 0.030, max(abs(p_[0]) for p_ in rs[0]) + 0.002, max(p_[1] - cyc for p_ in rs[0]) + 0.002, 14)], 'head', '#b5161e', cap_top=False, cap_bot=False)
            for sg_ in (-1, 1): rbox(pb, (sg_ * 0.012, cyc - max(p_[1] - cyc for p_ in rs[0]) - 0.012, zb_ - 0.020), (0.012, 0.010, 0.060 * k), 'head', '#101010')
            sphere(pb, (0, cyc + max(p_[1] - cyc for p_ in rs[0]) + 0.006, zb_ + 0.016), 0.010 * k, 0.005, 0.010 * k, 'head', '#c9ced6', 6, 3)
        if hs == 'cap':
            rs = [hring(r_, 1.0, -0.002, hat_off, hat_off) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.70]
            loft(pb, rs, 'head', hc, cap_top=True, cap_bot=False)
            zb = rs[0][0][2]
            pk = [(-0.07 * k, hy0 + ctrl[6][2] + 0.0, zb + 0.004), (0.07 * k, hy0 + ctrl[6][2] + 0.0, zb + 0.004), (0.06 * k, hy0 + ctrl[6][2] + 0.075 * k, zb - 0.004), (-0.06 * k, hy0 + ctrl[6][2] + 0.075 * k, zb - 0.004)]
            vv = [pb.V(p, 'head') for p in pk]; pb.F(vv, hc, False); pb.F(vv[::-1], hc, False)
        if hs in ('sombrero', 'hardhat', 'helmet', 'chef', 'scarf'):
            rs = [hring(r_, 1.0, -0.002, hat_off, hat_off) for r_ in hrows if (r_[0] - P['chin']) / hh >= (0.62 if hs in ('hardhat', 'helmet') else 0.72)]
            zb = rs[0][0][2]; cyc = sum(p_[1] for p_ in rs[0]) / len(rs[0]); cap_r = max(abs(p_[0]) for p_ in rs[0]); cap_ry = max(p_[1] - cyc for p_ in rs[0])
            if hs == 'sombrero':
                # Colombian straw hat (aguadeño): tall flat-topped crown, dark band, wide drooping brim
                fab('cotton')
                crown = [ring(0, cyc + 0.004, zb - 0.010 + dz, cap_r * sc_ + 0.004, cap_ry * sc_ + 0.004, 16) for dz, sc_ in ((0.0, 1.0), (0.030, 1.04), (0.062, 1.02), (0.086, 0.96), (0.092, 0.82))]
                loft(pb, crown, 'head', hc, cap_top=True, cap_bot=False)
                loft(pb, [ring(0, cyc + 0.004, zb - 0.002, cap_r + 0.0085, cap_ry + 0.0085, 16), ring(0, cyc + 0.004, zb + 0.026, cap_r + 0.0095, cap_ry + 0.0095, 16)], 'head', '#18140f', cap_top=False, cap_bot=False)
                brim = [ring(0, cyc + 0.004, zb - 0.008, cap_r + 0.004, cap_ry + 0.004, 24), ring(0, cyc + 0.004, zb - 0.014, cap_r + 0.060 * k, cap_ry + 0.060 * k, 24), ring(0, cyc + 0.004, zb - 0.030, cap_r + 0.120 * k, cap_ry + 0.120 * k, 24), ring(0, cyc + 0.004, zb - 0.036, cap_r + 0.122 * k, cap_ry + 0.122 * k, 24), ring(0, cyc + 0.004, zb - 0.026, cap_r + 0.060 * k, cap_ry + 0.060 * k, 24), ring(0, cyc + 0.004, zb - 0.014, cap_r - 0.002, cap_ry - 0.002, 24)]
                loft(pb, brim, 'head', hc, cap_top=False, cap_bot=False, smooth=False)
            elif hs in ('hardhat', 'helmet'):
                fab('plastic')
                over = (hat_off / k + 0.004) if hs == 'hardhat' else (hat_off / k + 0.010)
                loft(pb, [hring(r_, 1.0, -0.002, over * k, over * k) for r_ in hrows if (r_[0] - P['chin']) / hh >= 0.60], 'head', hc, cap_top=True, cap_bot=False)
                zf_ = zb + 0.006
                vis = [(-0.075 * k, cyc + cap_ry + over * k + 0.002, zf_), (0.075 * k, cyc + cap_ry + over * k + 0.002, zf_), (0.066 * k, cyc + cap_ry + over * k + (0.085 if hs == 'hardhat' else 0.050) * k, zf_ - 0.010), (-0.066 * k, cyc + cap_ry + over * k + (0.085 if hs == 'hardhat' else 0.050) * k, zf_ - 0.010)]
                vv = [pb.V(p, 'head') for p in vis]; pb.F(vv, hc, False); pb.F(vv[::-1], hc, False)
                if hs == 'hardhat': rbox(pb, (0, cyc, zb + 0.092 * k), (0.020 * k, 0.17 * k, 0.020 * k), 'head', hc)          # centre ridge
                else:
                    # chin strap: it used to be one straight tube through the cheek, so only its ends showed (black needles at the temples); it now follows the
                    # face from the shell rim, in front of the ear, down to under the chin, 7 mm off the skin
                    for sg_ in (-1, 1):
                        sp_ = []
                        for zf_, an_ in ((0.60, 14), (0.46, 24), (0.32, 38), (0.19, 56), (0.08, 80)):
                            r_ = row_at(P['chin'] + zf_ * hh); a_ = math.radians(an_)
                            sp_.append((sg_ * (r_[1] + 0.007 * k) * math.cos(a_), r_[3] + (r_[2] + 0.007 * k) * math.sin(a_), P['chin'] + zf_ * hh))
                        tube_pts(pb, sp_, [0.0045 * k] * 5, 'head', '#101010', n=5, cap_top=True, cap_bot=True)
            elif hs == 'chef':
                fab('cotton')
                loft(pb, [ring(0, cyc, zb - 0.004, cap_r + 0.010, cap_ry + 0.010, 16), ring(0, cyc, zb + 0.040, cap_r + 0.016, cap_ry + 0.016, 16), ring(0, cyc, zb + 0.090, cap_r + 0.040, cap_ry + 0.040, 16), ring(0, cyc, zb + 0.130, cap_r + 0.050, cap_ry + 0.050, 16), ring(0, cyc, zb + 0.150, cap_r + 0.030, cap_ry + 0.030, 16)], 'head', hc, cap_top=True, cap_bot=False)
            elif hs == 'scarf':
                # head scarf (pañuelo / mantilla): covers the hair down to the nape, knotted behind
                fab('cotton')
                HN2 = 28; rgs = []
                for row in [r_ for r_ in crv(ctrl, 22) if (r_[0] - P['chin']) / hh >= 0.26]:
                    f = (row[0] - P['chin']) / hh; pts_ = []
                    for i in range(HN2):
                        ang = 2 * math.pi * i / HN2; phi = ((ang - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi
                        ff = max(f, hairline(phi, 'scarf'))
                        pts_.append(hair_point(ang, ff, th + 0.012 * k))
                    rgs.append(pts_)
                loft(pb, rgs, 'head', hc, cap_top=True, cap_bot=False, closed=True)
                kb = hair_point(math.radians(270), 0.40, th + 0.014)
                for sg_ in (-1, 1): sphere(pb, (kb[0] + sg_ * 0.020 * k, kb[1] - 0.010, kb[2] - 0.012), 0.022 * k, 0.014 * k, 0.026 * k, 'head', hc, 6, 4)
                sphere(pb, (kb[0], kb[1] - 0.004, kb[2]), 0.016 * k, 0.014 * k, 0.016 * k, 'head', hc, 6, 4)
    fab('plastic')
    if pd.get('glasses'):
        for sg in (-1, 1):
            loft(pb, [ring(sg * 0.036 * k, hy0 + ctrl[4][2] + 0.012, zc_f(0.54), 0.021 * k, 0.003, 10), ring(sg * 0.036 * k, hy0 + ctrl[4][2] + 0.016, zc_f(0.54), 0.021 * k, 0.003, 10)], 'head', '#1a1a1a', cap_top=False, cap_bot=False)
        pb.F([pb.V((-0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.55)), 'head'), pb.V((0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.55)), 'head'), pb.V((0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.54)), 'head'), pb.V((-0.015 * k, hy0 + ctrl[4][2] + 0.014, zc_f(0.54)), 'head')], '#1a1a1a', False)
    fab(TOPF)
    # ---------------- arms (clothing sleeve layer over the arm, skin beyond the sleeve)
    sh = P['sh']; shw = P['shw']
    ua = 0.186 * H; fa = 0.146 * H
    elbow = sh - ua; wrist = elbow - fa
    child_f = 0.88 if child else 1.0
    ru = (0.052 if not fem else 0.046) * k * child_f * pd['build'] ** 0.5; rf = (0.040 if not fem else 0.036) * k * child_f
    sl_up = layer + 0.0
    sleeve_hex = top if (sleeve == 'long' or tst in ('jacket', 'puffer', 'coat', 'labcoat', 'hoodie', 'jumper')) else None
    sleeve_thick = {'jacket': 0.018, 'puffer': 0.028, 'coat': 0.020, 'labcoat': 0.014, 'hoodie': 0.012, 'jumper': 0.010}.get(tst, 0.006)
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'
        sx = sg * (shw - 0.004)
        # upper arm profile starts with a closed deltoid dome above the shoulder line so no open sleeve ring shows
        # (dome top flush with the torso's shoulder line: it used to stand 2-3 cm proud and read as a puffed sleeve)
        up_c = [(sh - 0.004, ru * 0.46, 0, 0), (sh - 0.016, ru * 0.86, 0, 0), (sh - 0.038, ru * 1.0, 0, 0), (sh - ua * 0.30, ru * 1.0, 0, 0), (elbow + 0.02, ru * 0.82, 0, 0)]
        up_rows = crv(up_c, 13)
        fa_c = [(elbow + 0.02, rf * 1.12, 0, 0), (elbow - fa * 0.25, rf * 1.12, 0, 0), (elbow - fa * 0.65, rf * 0.92, 0, 0), (wrist + 0.015, rf * 0.72, 0, 0)]
        fa_rows = crv(fa_c, 6)
        if sleeve_hex is None:
            z_end = sh - ua * (0.42 if tst != 'football' else 0.36)
            sl_rows = [r_ for r_ in up_rows if r_[0] >= z_end]
            lip = 0.007 if tst == 'tshirt' else 0.005
            rr_ = [ring(sx, 0, z, r + lip, r + lip * 0.9, 16) for z, r, _, _ in sl_rows]
            rr_.append(ring(sx, 0, sl_rows[-1][0] - 0.012, sl_rows[-1][1] + lip * 0.55, sl_rows[-1][1] + lip * 0.5, 16))       # hem turn-up
            loft(pb, rr_, 'arm' + sd, top, cap_top=True, cap_bot=True)   # short sleeve (closed dome at the shoulder)
            loft(pb, [ring(sx, 0, z, r, r, 14) for z, r, _, _ in up_rows if z <= sh - ua * 0.28], 'arm' + sd, skin, cap_top=False, cap_bot=False)
            loft(pb, [ring(sx, 0.0, z, r, r * (1.0 - 0.26 * clamp01((elbow - fa * 0.40 - z) / (fa * 0.60))), 14) for z, r, _, _ in fa_rows], 'farm' + sd, skin, cap_top=False, cap_bot=False)      # wrists are oval
        else:
            loft(pb, [ring(sx, 0, z, r + sleeve_thick, r + sleeve_thick, 14) for z, r, _, _ in up_rows], 'arm' + sd, sleeve_hex, cap_top=True, cap_bot=True)
            loft(pb, [ring(sx, 0.0, z, r + sleeve_thick, r + sleeve_thick, 14) for z, r, _, _ in fa_rows], 'farm' + sd, sleeve_hex, cap_top=False, cap_bot=False)
            cuff = '#d9d9d9' if tst in ('hoodie', 'jumper') and False else sleeve_hex
            loft(pb, [ring(sx, 0, wrist + 0.03, rf * 0.8 + sleeve_thick + 0.004, rf * 0.8 + sleeve_thick + 0.004, 14), ring(sx, 0, wrist + 0.005, rf * 0.76 + sleeve_thick + 0.004, rf * 0.76 + sleeve_thick + 0.004, 14)], 'farm' + sd, cuff if sleeve_hex else skin, cap_top=False, cap_bot=False)
        pass   # (deltoid sphere removed: it z-fought with the sleeve)
        # hand: palm + 4 fingers + thumb (fingers hang straight; the `fingers` bone curls them)
        hl = 0.108 * H; hw_ = 0.043 * k * child_f
        loft(pb, [ring(sx, 0.0, wrist + 0.030, rf * 0.70, rf * 0.52, 8), ring(sx, 0.0, wrist - 0.02 * k, hw_, 0.020 * k, 8), ring(sx, 0.0, wrist - hl * 0.42, hw_ * 0.98, 0.018 * k, 8), ring(sx, 0.0, wrist - hl * 0.50, hw_ * 0.90, 0.014 * k, 8)], 'hand' + sd, skin, cap_top=True, cap_bot=False)       # (starts inside the forearm: no gap at the wrist)
        fl = [0.46, 0.52, 0.48, 0.38]
        for fi in range(4):
            fx = sx + (fi - 1.5) * hw_ * 0.46
            z0 = wrist - hl * 0.5
            cu = 1.0 + 0.22 * fi                                           # relaxed curl: pinky side curls a little more
            # four fingers lying together and curling toward the palm (they used to hang straight and apart, like a rake)
            pts = [(fx, 0.002, z0), (fx, 0.012 * cu, z0 - hl * fl[fi] * 0.50), (fx, 0.032 * cu, z0 - hl * fl[fi] * 0.84)]
            tube_pts(pb, pts, [0.0114 * k * child_f, 0.0104 * k * child_f, 0.0078 * k * child_f], 'fingers' + sd, skin, n=6)
        th_pts = [(sx - sg * hw_ * 0.95, 0.012 * k, wrist - hl * 0.10), (sx - sg * hw_ * 1.04, 0.022 * k, wrist - hl * 0.28), (sx - sg * hw_ * 0.92, 0.034 * k, wrist - hl * 0.42)]
        tube_pts(pb, th_pts, [0.0125 * k * child_f, 0.0115 * k * child_f, 0.0085 * k * child_f], 'fingers' + sd, skin, n=6)
    fab(BOTF)
    # ---------------- legs (trousers layer) + shoes
    hx = hipw * 0.52
    thigh_len = P['hip'] - P['knee']
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'
        fab(BOTF)
        r0 = 0.092 * k * child_f * pd['build'] ** 0.5; r1 = 0.062 * k * child_f; r2 = 0.050 * k * child_f; r3 = 0.035 * k * child_f
        lay = {'jeans': 0.009, 'trousers': 0.007, 'leggings': 0.003, 'skirt': 0.0, 'shorts': 0.006}.get(bst, 0.007)
        leg_hex = bot
        if bst == 'trews': leg_hex = tex_hex(pd['trews'], sg * hx, 0.0)
        if bst == 'skirt': leg_hex = '#2a2a2e'
        zt = P['hip'] + 0.01
        th_c = [(zt, r0 * 0.80, 0, 0), (P['hip'] - thigh_len * 0.35, r0 * 0.93, 0, 0), (P['knee'] + 0.02, r1 * 1.02, 0, 0)]       # (the top tapers so it stays inside the pelvis block: no poke-through patches)
        th_rows = crv(th_c, 8)
        sh_c = [(P['knee'] + 0.02, r1 * 1.02, 0, 0), (P['knee'] - 0.06 * k, r1 * 1.0, 0, 0), (P['knee'] - 0.15 * k, r1 * 1.05, 0, 0), (P['knee'] - 0.28 * k, r2 * 1.05, 0, 0), (P['ankle'] + 0.018, r3 * 1.08, 0, 0)]
        sh_rows = crv(sh_c, 9)
        if bst == 'shorts':
            loft(pb, [ring(sg * hx, 0, z, r + lay, r + lay, 14) for z, r, _, _ in th_rows[:5]], 'thigh' + sd, leg_hex, cap_top=False, cap_bot=True)
            loft(pb, [ring(sg * hx, 0, z, r, r, 14) for z, r, _, _ in th_rows[4:]], 'thigh' + sd, skin, cap_top=False, cap_bot=False)
            loft(pb, [ring(sg * hx, 0, z, r, r, 14) for z, r, _, _ in sh_rows], 'shin' + sd, skin, cap_top=False, cap_bot=False)
            # socks
            loft(pb, [ring(sg * hx, 0, P['knee'] - 0.12 * k, r1 * 0.98 + 0.004, r1 * 0.98 + 0.004, 14), ring(sg * hx, 0, P['ankle'] + 0.06, r3 * 1.1 + 0.004, r3 * 1.1 + 0.004, 14)], 'shin' + sd, '#f2f2f2', cap_top=False, cap_bot=False)
        elif bst == 'skirtx':
            lg = pd.get('legs', 'skin'); lgx = skin if lg == 'skin' else lg
            loft(pb, [ring(sg * hx, 0, z, r + (0.0 if lg == 'skin' else 0.002), r + (0.0 if lg == 'skin' else 0.002), 14) for z, r, _, _ in th_rows], 'thigh' + sd, lgx, cap_top=False, cap_bot=False, fab_=None if lg == 'skin' else 'jersey')
            loft(pb, [ring(sg * hx, 0, z, r + (0.0 if lg == 'skin' else 0.002), r + (0.0 if lg == 'skin' else 0.002), 14) for z, r, _, _ in sh_rows], 'shin' + sd, lgx, cap_top=False, cap_bot=False, fab_=None if lg == 'skin' else 'jersey')
            if pd.get('hose'):
                fab('knit')
                hc_, cuc, fl_ = pd['hose']
                zh_top = P['knee'] - 0.045 * k
                def r_sh(z):
                    for (z0, r0_, _, _), (z1, r1_, _, _) in zip(sh_rows, sh_rows[1:]):
                        if z1 <= z <= z0: return r1_ + (r0_ - r1_) * (z - z1) / (z0 - z1 + 1e-9)
                    return sh_rows[-1][1]
                zz_ = [zh_top + (P['ankle'] + 0.018 - zh_top) * i_ / 5 for i_ in range(6)]
                loft(pb, [ring(sg * hx, 0, z_, r_sh(z_) + 0.005, r_sh(z_) + 0.005, 14) for z_ in zz_], 'shin' + sd, hc_, cap_top=False, cap_bot=False)
                loft(pb, [ring(sg * hx, 0, zh_top + 0.012, r_sh(zh_top) + 0.010, r_sh(zh_top) + 0.010, 14), ring(sg * hx, 0, zh_top - 0.065 * k, r_sh(zh_top - 0.065 * k) + 0.010, r_sh(zh_top - 0.065 * k) + 0.010, 14)], 'shin' + sd, cuc, cap_top=False, cap_bot=False)
                if fl_:
                    rbox(pb, (sg * hx + sg * (r_sh(zh_top - 0.03) + 0.012), 0.0, zh_top - 0.060 * k), (0.012, 0.035 * k, 0.085 * k), 'shin' + sd, fl_)
        elif bst == 'skirt':
            loft(pb, [ring(sg * hx, 0, z, r, r, 14) for z, r, _, _ in th_rows], 'thigh' + sd, '#26262a', cap_top=False, cap_bot=False)
            loft(pb, [ring(sg * hx, 0, z, r, r, 14) for z, r, _, _ in sh_rows], 'shin' + sd, '#26262a', cap_top=False, cap_bot=False)
        else:
            flare = 0.006 if bst == 'jeans' else 0.0
            loft(pb, [ring(sg * hx, 0, z, r + lay, r + lay, 14) for z, r, _, _ in th_rows], 'thigh' + sd, leg_hex, cap_top=False, cap_bot=(True))
            loft(pb, [ring(sg * hx, 0, z, r + lay + (flare if i == len(sh_rows) - 1 else 0), r + lay + (flare if i == len(sh_rows) - 1 else 0), 14) for i, (z, r, _, _) in enumerate(sh_rows)], 'shin' + sd, leg_hex, cap_top=False, cap_bot=False)
        fab('leather' if pd['shoe'][0] != 'trainer' else 'nylon')
        # shoes: shaped loft along y + sole
        sst, sc_, sole_c = pd['shoe']
        sl_ = 0.265 * k * (0.82 if child else 1.0); sw_ = 0.052 * k * (0.9 if child else 1.0)
        shoe_h = {'trainer': 0.082, 'shoe': 0.080, 'boot': 0.20}[sst] * k
        ysh = [-0.045 * k, -0.02 * k, 0.03 * k, 0.11 * k, 0.185 * k, sl_ * 0.92, sl_]
        rows_s = []; top_line = []
        for j, yy in enumerate(ysh):
            t = j / (len(ysh) - 1)
            wid = sw_ * (0.78 if j == 0 else (0.95 if j in (1, 2) else (1.05 if j == 3 else (0.95 if j == 4 else (0.62 if j == 5 else 0.30)))))
            hgt = shoe_h if j < 3 else shoe_h * (0.78 if j == 3 else (0.55 if j == 4 else (0.38 if j == 5 else 0.18)))
            zz = 0.028 * k + hgt * 0.5
            if sst == 'boot' and j < 3: hgt = shoe_h * 0.6; zz = 0.028 * k + hgt * 0.5
            rows_s.append(ring(sg * hx, yy, zz, wid, 0.0 + 0.0, 14) if False else [(sg * hx + wid * math.cos(2 * math.pi * i / 10), yy, zz + hgt * 0.5 * math.sin(2 * math.pi * i / 10)) for i in range(10)])
            top_line.append((yy, zz + hgt * 0.5, wid))
        loft(pb, rows_s, 'foot' + sd, sc_, cap_top=True, cap_bot=True)
        if sst in ('trainer', 'shoe', 'boot'):                       # laces across the instep
            lace = '#f2f2f2' if sst == 'trainer' else sc_
            for ly in (0.075, 0.100, 0.125, 0.150):
                yk = ly * k
                for (y0, z0, w0), (y1, z1, w1) in zip(top_line, top_line[1:]):
                    if y0 <= yk <= y1:
                        tt = (yk - y0) / (y1 - y0 + 1e-9); zt_ = z0 + (z1 - z0) * tt; wt_ = w0 + (w1 - w0) * tt
                        qbox(pb, (sg * hx, yk, zt_ + 0.0015), (wt_ * 1.25, 0.008 * k, 0.007 * k), 'foot' + sd, lace, fab_='nylon')
        fab('rubber')
        # sole
        rows_so = []
        for j, yy in enumerate(ysh):
            wid = sw_ * (0.80 if j == 0 else (0.98 if j in (1, 2) else (1.08 if j == 3 else (0.98 if j == 4 else (0.66 if j == 5 else 0.34)))))
            rows_so.append([(sg * hx + wid * math.cos(2 * math.pi * i / 10), yy, 0.0125 * k + 0.0125 * k * math.sin(2 * math.pi * i / 10)) for i in range(10)])
        loft(pb, rows_so, 'foot' + sd, sole_c, cap_top=True, cap_bot=True)
        fab('leather')
        if pd.get('ghillie'):
            loft(pb, [ring(sg * hx, 0.0, P['ankle'] + 0.012, r3 * 1.28, r3 * 1.28, 14), ring(sg * hx, 0.0, P['ankle'] + 0.030, r3 * 1.28, r3 * 1.28, 14)], 'shin' + sd, '#101010', cap_top=False, cap_bot=False)
            rbox(pb, (sg * hx, 0.045 * k, P['ankle'] + 0.040 * k), (0.030 * k, 0.07 * k, 0.012), 'foot' + sd, '#101010')
        if sst == 'boot':
            loft(pb, [ring(sg * hx, -0.004, P['ankle'] + 0.02, r3 * 1.5, r3 * 1.5, 14), ring(sg * hx, -0.004, P['ankle'] + 0.14 * k, r3 * 1.45 + lay, r3 * 1.45 + lay, 14), ring(sg * hx, -0.004, P['ankle'] + 0.16 * k, r3 * 1.5 + lay, r3 * 1.5 + lay, 14)], 'shin' + sd, sc_, cap_top=False, cap_bot=False)
    # ---------------- scarf, bags
    if pd.get('scarf'):
        sc = pd['scarf']; fab('knit')
        loft(pb, [ring(0, ncy, P['nbase'] - 0.015, 0.078 * k, 0.074 * k, 12), ring(0, ncy, P['nbase'] + 0.025 * k, 0.074 * k, 0.07 * k, 12), ring(0, ncy + 0.004, P['nbase'] + 0.05 * k, 0.066 * k, 0.064 * k, 12)], 'neck', sc, cap_top=False, cap_bot=False)
        rbox(pb, (0.03 * k, rows[12][2] + 0.06 * k, P['nbase'] - 0.12 * k), (0.07 * k, 0.025, 0.24 * k), 'chest', sc)
    bag = pd.get('bag')
    if bag:
        bs_, bc = bag; fab('leather' if bs_ in ('handbag', 'shoulder') else 'nylon')
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
    return pb, P, dict(rows=rows, ctrl=ctrl, hy0=hy0, kilt=(kz['zt'], kz['zh'], {'kilt': 0.90, 'pleated': 0.80, 'a_line': 0.72, 'maxi': 0.48}[pd['skirt']['kind']]) if kz else None)

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

def clamp01(x): return max(0.0, min(1.0, x))

def weights_for(co, part, bd):
    if part == 'kilt':
        zt, zh, wmax = bd['_kilt']; t = clamp01((zt - co[2]) / (zt - zh + 1e-9))
        wt = wmax * t ** 1.15 * (0.7 if co[1] < -0.02 else 1.0); wr = clamp01(0.5 + co[0] / 0.09)
        ws = [('hips', (1 - wt) * 0.75), ('spine', (1 - wt) * 0.25), ('thigh_r', wt * wr), ('thigh_l', wt * (1 - wr))]
        return [(b, w) for b, w in ws if w > 1e-4]
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


# ------------------------------------------------------------------ tartan twill tiles (generic setts; 32 threads per sett = 0.15 m, 256 px tile = 8 setts)
TARTAN_COL = {'G': '#1f5236', 'N': '#17254b', 'K': '#0e0e11', 'R': '#b3161f', 'Y': '#d8ac22', 'W': '#e6e6e0', 'B': '#1c3f92', 'A': '#8c9199', 'D': '#d8d8d4'}
TARTANS = [   # 0 green/navy/black (Black Watch-like), 1 red (Royal Stewart-like), 2 blue/green, 3 grey/black
    [('G', 8), ('K', 2), ('N', 6), ('K', 2), ('G', 8), ('K', 2), ('N', 2), ('K', 2)],
    [('R', 10), ('K', 2), ('R', 2), ('Y', 1), ('R', 1), ('G', 6), ('R', 1), ('W', 1), ('R', 2), ('N', 2), ('R', 2), ('K', 2)],
    [('B', 10), ('K', 2), ('G', 8), ('K', 2), ('B', 4), ('G', 2), ('K', 2), ('B', 2)],
    [('A', 10), ('K', 6), ('A', 4), ('D', 2), ('A', 2), ('K', 4), ('A', 4)],
]
def tartan_tile(tid, size=256):
    seq = []
    for c, n in TARTANS[tid]: seq += [c] * n
    assert len(seq) == 32, (tid, len(seq))
    col = lambda c: np.array([int(TARTAN_COL[c][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    pal = np.stack([col(c) for c in seq])           # 32 x 3
    ix = np.arange(size) % 32
    warp = pal[ix][None, :, :]; weft = pal[ix][:, None, :]
    xx, yy = np.meshgrid(np.arange(size), np.arange(size))
    twill = (((xx + yy) % 4) < 2)[:, :, None]
    img = np.where(twill, warp, weft)
    rng = np.random.default_rng(11 + tid)
    img = img * (0.90 + 0.14 * twill) * (0.94 + 0.12 * rng.random((size, size, 1)))   # twill ridges + yarn noise
    img = np.clip(img, 0, 255).astype(np.uint8)
    return img

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
    # subtle realism pass: low-frequency skin mottling, per-pixel grain, forehead/cheek/chin tonal gradient, freckles for fair/red-haired
    a = np.asarray(im, np.float32); rng = np.random.default_rng(zlib.crc32(pd['id'].encode()) % 1000)
    lf = np.kron(rng.normal(0, 1, (8, 8)), np.ones((sc // 8, sc // 8)))
    lf = np.asarray(Image.fromarray(((lf - lf.min()) / (np.ptp(lf) + 1e-6) * 255).astype(np.uint8)).resize((sc, sc), Image.BICUBIC), np.float32) / 255.0 - 0.5
    yy = np.linspace(0, 1, sc)[:, None]
    tone = 1.0 + 0.10 * lf + 0.025 * rng.normal(0, 1, (sc, sc)) + 0.05 * (0.5 - np.abs(yy - 0.5)) * 2 - 0.03
    a = a * tone[:, :, None]
    flush = np.exp(-(((np.arange(sc)[None, :] / sc - 0.5) ** 2) * 18 + ((yy - 0.62) ** 2) * 30))
    a[:, :, 0] *= 1 + 0.05 * flush; a[:, :, 2] *= 1 - 0.03 * flush
    if pd['skin'] <= 1 and pd['hair'][0] in (3, 4, 7, 2):
        for _ in range(70):
            fx_, fy_ = rng.uniform(0.2, 0.8) * sc, rng.uniform(0.42, 0.66) * sc
            if abs(fx_ - sc * 0.5) < 6: continue
            a[int(fy_):int(fy_) + 2, int(fx_):int(fx_) + 2] *= 0.82
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# ------------------------------------------------------------------ animation
def rot_local(ao, bname, axis, ang):
    bone = ao.data.bones[bname]
    R = bone.matrix_local.to_3x3()
    ax = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]
    Rw = Quaternion(ax, ang).to_matrix()
    return (R.inverted() @ Rw @ R).to_quaternion()

ABD = 0.20       # every clip is an A-pose: the upper arms hang ~11 degrees away from the body so the hands clear the thighs (no clipping)
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
            if bn in ('upperarm_l', 'upperarm_r'):       # +Y rotation moves the left arm outward, the right arm inward
                q = q @ rot_local(ao, bn, 'y', ABD if bn.endswith('_l') else -ABD)
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
    # ---- P2 clips: daily-life and work loops (props such as the broom or the bundle are attached by js/people/props.js)
    def talk_b(ph):
        p = ph * TAU; d = idle_a(ph)
        d['upperarm_r'] = [('x', 0.45 + 0.16 * s_(p)), ('y', 0.16)]; d['forearm_r'] = [('x', 1.05 + 0.35 * s_(2 * p + 1.0))]; d['hand_r'] = [('x', 0.25 * s_(2 * p)), ('z', 0.2 * s_(p))]
        d['upperarm_l'] = [('x', 0.10), ('y', -0.04)]; d['forearm_l'] = [('x', 0.55 + 0.10 * s_(p + 2.0))]
        d['head'] = [('x', 0.05 * s_(3 * p)), ('z', 0.12 * s_(p + 0.5))]; d['spine'] = [('y', -0.05 * s_(p)), ('x', 0.01)]
        d['hips'] = [('y', 0.03 * s_(p)), ('z', 0.02 * s_(p + 1.0))]; d['fingers_r'] = [('x', 0.15 + 0.2 * (0.5 + 0.5 * s_(2 * p)))]
        return d
    C['talk_b'] = (120, talk_b)
    def sweep(ph):
        p = ph * TAU; d = idle_a(ph); st = s_(p)
        d['spine'] = [('x', -0.20 + 0.03 * s_(2 * p)), ('z', 0.13 * st), ('y', -0.03)]; d['chest'] = [('z', 0.06 * st)]; d['hips'] = [('z', -0.05 * st)]
        d['head'] = [('x', -0.22), ('z', -0.05 * st)]
        # both hands on the broom handle (solved on the rig, tools: .scratch arm_solve.py): right hand low (0.12, 0.90, -0.38), left hand 0.28 m up the stick, which leans
        # up and forward along u = (0.03, 0.90, 0.43) in the glTF frame; the sweep itself is the spine / hip swing above (both hands ride on the upper body)
        d['upperarm_r'] = [('x', 0.189 + 0.03 * s_(2 * p)), ('y', 0.245), ('z', 0.0)]; d['forearm_r'] = [('x', 1.343)]; d['fingers_r'] = [('x', 0.9)]
        d['upperarm_l'] = [('x', -0.233 + 0.03 * s_(2 * p)), ('y', -0.622), ('z', -0.912)]; d['forearm_l'] = [('x', 1.910)]; d['fingers_l'] = [('x', 0.9)]
        d['thigh_l'] = [('x', 0.08)]; d['thigh_r'] = [('x', 0.08)]; d['shin_l'] = [('x', -0.10)]; d['shin_r'] = [('x', -0.10)]
        return d
    C['sweep'] = (72, sweep)
    def cook(ph):
        p = ph * TAU; d = idle_a(ph)
        d['spine'] = [('x', -0.12), ('y', 0.03 * s_(p))]; d['head'] = [('x', -0.30 + 0.03 * s_(2 * p)), ('z', 0.04 * s_(p))]
        d['upperarm_r'] = [('x', 0.55 + 0.05 * s_(p)), ('y', 0.10)]; d['forearm_r'] = [('x', 1.05 + 0.18 * s_(p + 1.0))]; d['hand_r'] = [('z', 0.30 * s_(p)), ('x', 0.18 * c_(p))]; d['fingers_r'] = [('x', 0.8)]
        d['upperarm_l'] = [('x', 0.40), ('y', -0.12)]; d['forearm_l'] = [('x', 0.85)]; d['fingers_l'] = [('x', 0.5)]
        return d
    C['cook'] = (72, cook)
    def sell(ph):
        p = ph * TAU; d = idle_a(ph)
        k = max(0.0, s_(p)) ** 2                                   # hands out toward the customer, then back
        d['upperarm_r'] = [('x', 0.40 + 0.30 * k), ('y', 0.14)]; d['forearm_r'] = [('x', 0.95 + 0.45 * k)]; d['hand_r'] = [('x', -0.2 * k)]; d['fingers_r'] = [('x', 0.1)]
        d['upperarm_l'] = [('x', 0.34 + 0.10 * k), ('y', -0.12)]; d['forearm_l'] = [('x', 0.90)]
        d['head'] = [('x', -0.05 + 0.08 * s_(2 * p)), ('z', 0.06 * s_(p))]; d['spine'] = [('x', -0.04 - 0.03 * k)]
        return d
    C['sell'] = (96, sell)
    def carry_arms(d):
        d.update({'upperarm_l': [('x', 0.42), ('y', -0.10)], 'upperarm_r': [('x', 0.42), ('y', 0.10)], 'forearm_l': [('x', 1.35)], 'forearm_r': [('x', 1.35)], 'fingers_l': [('x', 0.6)], 'fingers_r': [('x', 0.6)]})
        return d
    def walk_carry(ph):
        d = carry_arms(walk_gen(0.38, 0.52, 0.0, ph)); p = ph * TAU
        d['spine'] = [('z', -0.10 * s_(p)), ('x', 0.02), ('y', -0.03 * s_(p))]
        return d
    C['walk_carry'] = (24, walk_carry)
    C['carry_stand'] = (96, lambda ph: carry_arms(idle_a(ph)))
    def lean_wall(ph):
        p = ph * TAU; d = idle_a(ph)
        d['spine'] = [('x', 0.10), ('z', 0.04)]; d['chest'] = [('x', 0.04)]; d['head'] = [('z', 0.05 * s_(p))]; d['hips'] = [('z', 0.05), ('y', 0.02 * s_(p))]
        d['thigh_l'] = [('x', 0.04)]; d['thigh_r'] = [('x', 0.30), ('y', -0.05)]; d['shin_r'] = [('x', -0.30)]; d['foot_r'] = [('x', 0.22)]
        d['upperarm_r'] = [('x', 0.30)]; d['forearm_r'] = [('x', 1.6)]; d['fingers_r'] = [('x', 0.5)]
        d['upperarm_l'] = [('x', -0.05)]; d['forearm_l'] = [('x', 0.35)]
        return d
    C['lean_wall'] = (120, lean_wall)
    def laundry(ph):
        p = ph * TAU; d = idle_a(ph)
        a = 0.5 + 0.5 * s_(p); b = 0.5 + 0.5 * s_(p + math.pi)
        d['upperarm_r'] = [('x', 1.6 + 0.9 * a), ('y', 0.12)]; d['forearm_r'] = [('x', 0.5 - 0.3 * a)]; d['fingers_r'] = [('x', 0.5)]
        d['upperarm_l'] = [('x', 0.9 + 1.0 * b), ('y', -0.12)]; d['forearm_l'] = [('x', 0.9 - 0.5 * b)]; d['fingers_l'] = [('x', 0.4)]
        d['spine'] = [('x', 0.05 + 0.05 * a), ('z', 0.04 * s_(p))]; d['head'] = [('x', 0.30)]
        return d
    C['laundry'] = (96, laundry)
    def pray(ph):
        p = ph * TAU; d = idle_a(ph)
        # palms together in front of the chest (solved on the rig: the finger heads meet at (+-0.028, 1.06, -0.24) in the glTF frame)
        d['upperarm_r'] = [('x', -0.338), ('y', 0.969)]; d['forearm_r'] = [('x', 2.030)]; d['hand_r'] = []; d['fingers_r'] = [('x', 0.1)]
        d['upperarm_l'] = [('x', -0.349), ('y', -1.032)]; d['forearm_l'] = [('x', 2.013)]; d['hand_l'] = []; d['fingers_l'] = [('x', 0.1)]
        d['head'] = [('x', -0.40 + 0.02 * s_(p))]; d['spine'] = [('x', -0.06 + 0.01 * s_(p))]
        return d
    C['pray'] = (120, pray)
    def sit_talk(ph):
        p = ph * TAU; d = sit_base(p)
        d['upperarm_r'] = [('x', 0.65 + 0.2 * s_(2 * p)), ('y', 0.2 + 0.1 * s_(p))]; d['forearm_r'] = [('x', 1.25 + 0.4 * s_(2 * p + 0.5))]; d['hand_r'] = [('z', 0.25 * s_(3 * p))]
        d['head'] = [('z', 0.2 * s_(p)), ('x', -0.05 + 0.05 * s_(2 * p))]; d['spine'] = [('y', 0.05 * s_(p))]
        return d
    C['sit_talk'] = (96, sit_talk)
    def run_gen(ph):
        d = walk_gen(0.78, 1.25, 0.95, ph, lift=0.35); p = ph * TAU
        d['spine'] = [('z', -0.14 * s_(p)), ('x', -0.16), ('y', -0.05 * s_(p))]
        d['forearm_l'] = [('x', 1.1 + 0.3 * max(0.0, s_(p + 1.2)))]; d['forearm_r'] = [('x', 1.1 + 0.3 * max(0.0, -s_(p + 1.2)))]
        return d
    C['run'] = (16, run_gen)
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

QUANT = {'knit': (8, 12), 'jersey': (4, 5), 'denim': (4, 4), 'cotton': (4, 4), 'suit': (6, 6), 'puffer': (8, 128), 'mesh': (6, 6), 'nylon': (10, 10), 'reflective': (8, 8),
         'tartan0': (32, 32), 'tartan1': (32, 32), 'tartan2': (32, 32), 'tartan3': (32, 32)}
FAB_GAIN = {'skin': 1.0, 'hair': 1.45, 'knit': 1.5, 'puffer': 1.3, 'jersey': 1.25, 'denim': 1.35, 'leather': 1.45, 'rubber': 1.6, 'metal': 1.0, 'reflective': 1.0, 'plastic': 1.1, 'mesh': 1.15, 'nylon': 1.25}
def _lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hex_tint(h, gain=1.25):
    h = h.lower()
    if len(h) == 4: h = '#' + ''.join(c * 2 for c in h[1:])
    r, g_, b = (int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
    return tuple(min(1.0, _lin(c) * gain) for c in (r, g_, b))
def cell_uv(cell, u, v):
    r, c = TX.cell_rc(cell)
    return ((c * 256 + u * 256) / 2048.0, 1.0 - (r * 256 + (1.0 - v) * 256) / 2048.0)
def cell_px_uv(cell, px, py_up):
    r, c = TX.cell_rc(cell)
    return ((c * 256 + px) / 2048.0, 1.0 - (r * 256 + (256 - py_up)) / 2048.0)

def _dirs(n=28):
    out = []
    for i in range(n):
        z = (i + 0.5) / n; r = math.sqrt(1 - z * z) ** 1.0; ph = i * 2.399963
        out.append((math.sqrt(z) * math.cos(ph), math.sqrt(z) * math.sin(ph), math.sqrt(1 - z)))   # cosine-weighted hemisphere about +Z
    return out
AO_DIRS = _dirs()
def bake_ao(mo, maxd=0.35):
    """Per-vertex ambient occlusion by ray casting the rest-pose mesh (BVH).  Returns shade factor 0.25..1 per vertex."""
    bm = bmesh.new(); bm.from_mesh(mo.data); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table(); bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    out = []
    for bv_ in bm.verts:
        v = bv_
        ns = [f.normal for f in bv_.link_faces if len(f.verts) <= 4] or [f.normal for f in bv_.link_faces]
        n = Vector((0, 0, 0))
        for f_ in ns: n += f_
        if n.length < 1e-6: out.append(1.0); continue
        n = n.normalized()
        t = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0)); t = (t - n * t.dot(n)).normalized(); b = n.cross(t)
        loc0, nrm0, _, d0 = tree.ray_cast(v.co + n * 0.002, n, 0.4)
        if loc0 is not None and nrm0.dot(n) > 0.15:          # vertex buried inside another closed surface (hidden): leave it neutral
            out.append(1.0); continue
        o = v.co + n * 0.013; hit = 0.0
        for dx, dy, dz in AO_DIRS:
            d = t * dx + b * dy + n * dz
            loc, _, _, dist = tree.ray_cast(o, d, maxd)
            if loc is not None: hit += 1.0 - dist / maxd * 0.5
        ao = 1.0 - hit / len(AO_DIRS)
        out.append(0.40 + 0.60 * max(0.0, ao) ** 1.2)
    bm.free()
    return out

from mathutils import noise as mnoise
CLOTH_FABS = {'suit', 'denim', 'cotton', 'wool_coat', 'jersey', 'knit'}
MOTTLE = {'suit': 0.065, 'cotton': 0.055, 'jersey': 0.055, 'denim': 0.075, 'wool_coat': 0.07, 'knit': 0.045, 'puffer': 0.03, 'leather': 0.05, 'nylon': 0.03}
def vertex_shade(co, fb, fold_v, P):
    """Per-vertex tonal variation baked next to the AO (the 256 px fabric cells are sub-millimetre weave, invisible beyond a metre; this is the part of cloth that
    reads at 1.5-10 m): fade / mottling at 3-6 cm, fold bands where the wrinkle pass bends the cloth, worn knees on denim; a little life in skin and hair."""
    m = 1.0; amp = MOTTLE.get(fb)
    if amp:
        m *= 1.0 + amp * mnoise.noise(Vector((co.x * 16, co.y * 16, co.z * 14))) + 0.5 * amp * mnoise.noise(Vector((co.x * 52 + 7, co.y * 52, co.z * 40)))
        if fb in CLOTH_FABS: m *= 1.0 + 0.11 * fold_v
        if fb == 'denim': m *= 1.0 + 0.14 * math.exp(-((co.z - P['knee']) / 0.11) ** 2) * (0.55 + 0.45 * mnoise.noise(Vector((co.x * 30, co.y * 30, co.z * 30))))
    elif fb == 'skin':
        m *= 1.0 + 0.03 * mnoise.noise(Vector((co.x * 40, co.y * 40, co.z * 30)))
    elif fb in ('hair', 'hair_card'):
        m *= 0.86 + 0.28 * (0.5 + 0.5 * mnoise.noise(Vector((co.x * 90, co.y * 90, co.z * 70))))
    return max(0.55, min(1.35, m))

def wrinkle_pass(me_, pb, bd, P, k):
    """sculpt-like fold displacement of cloth vertices (elbow / knee / waist / ankle creases + low-frequency drape), along the vertex normal.
    Returns {vertex index: fold value in -1..1} for the shading bake."""
    fold = {}
    vfab = {}
    for f in pb.bm.faces:
        pass
    vf = {}
    for pi, poly in enumerate(me_.polygons):
        fb = pb.ffab[pi]
        for vi in poly.vertices: vf.setdefault(vi, fb)
    elbow = bd['forearm_l'][0][2]; knee = P['knee']; ankle = P['ankle']; waist = P['H'] * 0.614; hip = P['hip']
    out = []
    for vi, v in enumerate(me_.vertices):
        fb = vf.get(vi)
        if fb not in CLOTH_FABS: continue
        part = pb.vpart[vi]
        if part in ('kilt', 'head', 'neck', 'chest') and part != 'chest': continue
        co = v.co; z = co.z
        a = 0.0016 * mnoise.noise(Vector((co.x * 11, co.y * 11, co.z * 7)))
        ph = 3.0 * mnoise.noise(Vector((co.x * 23, co.y * 23, co.z * 9)))
        fa = 0.0
        if part.startswith(('arm', 'farm')):
            fa += 0.0034 * math.exp(-((z - elbow) / 0.075) ** 2) * math.sin(z * 120 + ph)
            fa += 0.0018 * math.exp(-((z - (bd['upperarm_l'][0][2] - 0.03)) / 0.06) ** 2) * math.sin(z * 90 + ph)
        elif part.startswith(('thigh', 'shin')):
            fa += 0.0040 * math.exp(-((z - knee) / 0.09) ** 2) * math.sin(z * 110 + ph)
            fa += 0.0030 * math.exp(-((z - (hip - 0.04)) / 0.07) ** 2) * math.sin(z * 100 + ph)
            fa += 0.0035 * math.exp(-((z - (ankle + 0.07)) / 0.05) ** 2) * math.sin(z * 130 + ph)     # trouser break above the shoe
        elif part == 'torso':
            fa += 0.0032 * math.exp(-((z - waist) / 0.07) ** 2) * math.sin(z * 90 + ph + co.x * 25)
            fa += 0.0022 * math.exp(-((z - hip) / 0.07) ** 2) * math.sin(z * 85 + ph - co.x * 30)
        out.append((vi, v.normal * (a + 1.4 * fa)))
        fold[vi] = max(-1.0, min(1.0, fa / 0.0042))
    for vi, d in out: me_.vertices[vi].co += d
    return fold

def make_pbr_material(imgs):
    m = bpy.data.materials.new('people_pbr'); m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = imgs['albedo']; ta.interpolation = 'Linear'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = imgs['normal']; tn.interpolation = 'Linear'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
    to = nt.nodes.new('ShaderNodeTexImage'); to.image = imgs['orm']; to.interpolation = 'Linear'
    sp = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(ta.outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    nt.links.new(to.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs['Green'], bs.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], bs.inputs['Metallic'])
    return m

HAIR_SHEET = None
def make_hair_material():
    global HAIR_SHEET
    path = os.path.join(SCRATCH, 'people_hair.png')
    Image.fromarray(TX.hair_sheet()).save(path)
    img = bpy.data.images.load(path); img.pack(); img.name = 'people_hair'
    m = bpy.data.materials.new('people_hair'); m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.62; bs.inputs['Metallic'].default_value = 0.0
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], bs.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], bs.inputs['Alpha'])
    return m

def fix_outward(bm):
    """bmesh's recalc_face_normals orients an OPEN tube (all the lofted garments) by a global heuristic and gets some of them inside-out (every coat, jacket and
    lab-coat torso came out dark: inward normals light and occlude the wrong way).  Per connected component, take a vote of side faces against the component's own
    axis and flip the whole component when the majority points inward."""
    bm.faces.ensure_lookup_table(); bm.faces.index_update()
    seen = set(); flipped = 0
    for f0 in bm.faces:
        if f0.index in seen: continue
        comp = []; stack = [f0]; seen.add(f0.index)
        while stack:
            f = stack.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        if len(comp) < 12: continue
        xs = [v.co.x for f in comp for v in f.verts]; ys = [v.co.y for f in comp for v in f.verts]
        cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
        vote = n = 0
        for f in comp:
            if abs(f.normal.z) > 0.6: continue
            c = f.calc_center_median(); o = f.normal.x * (c.x - cx) + f.normal.y * (c.y - cy)
            vote += 1 if o > 0 else -1; n += 1
        if n >= 10 and vote < -0.35 * n:
            bmesh.ops.reverse_faces(bm, faces=comp); flipped += 1
    return flipped

def build_people(only=None):
    reset()
    root = group('people')
    objs = []
    plist = [p for p in PEOPLE if not only or p['id'] in only]
    for pd in plist:
        pb, P, g = build_person(pd)
        bd = bone_defs(P, pd, g); bd['_kilt'] = g.get('kilt')
        pb.bm.verts.ensure_lookup_table(); pb.bm.faces.ensure_lookup_table()
        bmesh.ops.recalc_face_normals(pb.bm, faces=pb.bm.faces[:])
        pb.bm.normal_update()
        nflip = fix_outward(pb.bm)
        if nflip: print(pd['id'], 'inside-out components flipped:', nflip)
        pb.bm.normal_update()
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
    # ---- PBR pages (albedo / normal / ORM, 2048 px = 256 px cells; LOD pages 1024 px)
    A, Nn, O = TX.build_pages([o[0] for o in objs], SKIN, HAIR)
    imgs = {}
    if LOD:       # the LOD geometry is drawn with the full-detail material at run time (same UV layout): ship no textures
        m = bpy.data.materials.new('people_pbr'); mh = bpy.data.materials.new('people_hair')
    else:
        for nm, arr in (('albedo', A), ('normal', Nn), ('orm', O)):
            path = os.path.join(SCRATCH, f'people_{nm}.png')
            Image.fromarray(arr).save(path)
            img = bpy.data.images.load(path); img.pack(); img.name = f'people_{nm}'
            if nm != 'albedo': img.colorspace_settings.name = 'Non-Color'
            imgs[nm] = img
        m = make_pbr_material(imgs)
        mh = make_hair_material()
    meta = {}
    global CLIPS
    CLIPS = clip_defs()
    for idx, (pd, pb, mo, ao, P, g, bd) in enumerate(objs):
        mo.data.materials.append(m); mo.data.materials.append(mh)
        uvl = mo.data.uv_layers.new(name='UVMap')
        hh = P['hh']; chin = P['chin']
        me_ = mo.data
        # per-part cylinder axis + radius (for fabric UV projection)
        acc = {}
        for vi, v in enumerate(me_.vertices):
            a_ = acc.setdefault(pb.vpart[vi], [0.0, 0.0, 0, 0.0]); a_[0] += v.co.x; a_[1] += v.co.y; a_[2] += 1
        pst = {}
        for pn, (sx_, sy_, n_, _) in acc.items(): pst[pn] = [sx_ / n_, sy_ / n_, 0.05]
        rr = {}
        for vi, v in enumerate(me_.vertices):
            c_ = pst[pb.vpart[vi]]; rr.setdefault(pb.vpart[vi], []).append(math.hypot(v.co.x - c_[0], v.co.y - c_[1]))
        for pn in pst: pst[pn][2] = max(0.03, sum(rr[pn]) / len(rr[pn]))
        fabidx = {n_: i for i, n_ in enumerate(TX.FABRIC_ORDER)}
        eyecell = TX.eye_cell_for(pd['eye'])
        face_cell = TX.cell_index('face', idx)
        fold_v = wrinkle_pass(me_, pb, bd, P, P['k'])
        me_.update()
        # vertex AO (rays against the rest-pose body) + per-corner tint colour.  The alpha channel carries a RECOLOUR SLOT id (id * 16 / 255) for the
        # garment layers the game may re-tint per NPC (js/people/rig.js): 2 top, 3 bottom, 4 shoes, 5 hat, 6 accessory (apron / ruana / scarf), 7 inner layer.
        ao_v = bake_ao(mo)
        hexmap = {}
        if pd.get('inner'): hexmap[pd['inner']] = 7
        acc_ = pd.get('apron') or pd.get('ruana') or pd.get('scarf') or pd.get('vest') or (pd['bag'][1] if pd.get('bag') else None)
        if acc_: hexmap[acc_] = 6
        if pd.get('hat'): hexmap[pd['hat'][1]] = 5
        hexmap[pd['shoe'][1]] = 4; hexmap[pd['bot']] = 3; hexmap[pd['top']] = 2
        FIXED_FAB = {'hair', 'hair_card', 'metal', 'rubber', 'reflective'}
        slot_meta = {}
        SLOT_NAME = {2: 'top', 3: 'bottom', 4: 'shoes', 5: 'hat', 6: 'accessory', 7: 'inner', 8: 'skin'}      # 8: every bare-skin polygon, the face tile included (the game shifts the tone per person)
        ca = me_.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); me_.color_attributes.active_color = ca
        for pi, poly in enumerate(me_.polygons):
            fb = pb.ffab[pi]; hexc = pb.fhex[pi]; uvspec = pb.fuv[pi]
            lis = list(poly.loop_indices)
            cos_ = [me_.vertices[me_.loops[li].vertex_index].co for li in lis]
            if fb == 'face':
                cell = face_cell; tint = (1.0, 1.0, 1.0); poly.material_index = 0
                for li, co in zip(lis, cos_):
                    u = min(0.995, max(0.005, 0.5 + co.x / (0.72 * hh))); v = min(0.995, max(0.005, (co.z - chin) / hh))
                    uvl.data[li].uv = cell_uv(cell, u, v)
            elif fb == 'hair_card':
                poly.material_index = 1; tint = hex_tint(hexc, 1.45)
                for li, uv_ in zip(lis, uvspec): uvl.data[li].uv = (uv_[0], uv_[1])
            elif fb.startswith('eye'):
                poly.material_index = 0; tint = (1.0, 1.0, 1.0); cell = TX.cell_index('eye', eyecell)
                for li, co in zip(lis, cos_):
                    u, v = uvspec(co); uvl.data[li].uv = cell_uv(cell, u, v)
            else:
                poly.material_index = 0
                spec = TX.FABRICS[fb]; cell = TX.cell_index('fab', fabidx[fb]); tm = spec[1]
                if fb.startswith('tartan'): tint = (1.0, 1.0, 1.0); ax = tuple(float(x) for x in hexc.split('|')[1:3])
                else:
                    tint = hex_tint(hexc, FAB_GAIN.get(fb, 1.25)); ax = None
                part = pb.vpart[me_.loops[lis[0]].vertex_index]
                cx_, cy_, R_ = pst[part]
                if ax is not None: cx_, cy_ = ax
                th0 = None; pts_ = []
                if abs(poly.normal.z) > 0.55:                  # near-horizontal faces (shoulder caps, hems, cap discs): planar XY projection
                    for co in cos_: pts_.append((co.x / tm * 256.0, co.y / tm * 256.0))
                else:
                    for co in cos_:
                        th = math.atan2(co.y - cy_, co.x - cx_)
                        if th0 is None: th0 = th
                        while th - th0 > math.pi: th -= 2 * math.pi
                        while th - th0 < -math.pi: th += 2 * math.pi
                        pts_.append((th * R_ / tm * 256.0, co.z / tm * 256.0))
                us_ = [a_ for a_, _ in pts_]; vs_ = [b_ for _, b_ in pts_]
                qu, qv = QUANT.get(fb, (1, 1))
                su = max(us_) - min(us_); sv = max(vs_) - min(vs_)
                if su > 240 - qu or sv > 240 - qv:                     # very large face: shrink the pattern so it fits inside its cell
                    sc_ = min((240 - qu) / max(su, 1e-6), (240 - qv) / max(sv, 1e-6)); uc = sum(us_) / len(us_); vc = sum(vs_) / len(vs_)
                    for li, (uu, vv) in zip(lis, pts_):
                        uvl.data[li].uv = cell_px_uv(cell, 128 + (uu - uc) * sc_, 256 - (128 + (vv - vc) * sc_))
                else:
                    Wu = max(qu, math.floor((240 - su) / qu) * qu); Wv = max(qv, math.floor((240 - sv) / qv) * qv)
                    ku = math.floor(min(us_) / Wu); kv = math.floor(min(vs_) / Wv)
                    for li, (uu, vv) in zip(lis, pts_):
                        uvl.data[li].uv = cell_px_uv(cell, 8 + uu - ku * Wu, 256 - (8 + vv - kv * Wv))
            if fb in ('skin', 'face'): slot = 8
            else: slot = 0 if (fb in FIXED_FAB or fb.startswith(('eye', 'tartan'))) else hexmap.get(hexc, 0)
            if slot and SLOT_NAME[slot] not in slot_meta: slot_meta[SLOT_NAME[slot]] = dict(id=slot, hex=SKIN[pd['skin']] if slot == 8 else hexc, gain=FAB_GAIN.get('skin' if slot == 8 else fb, 1.25))
            alpha = 1.0 if slot == 0 else slot * 16.0 / 255.0
            for li in lis:
                vi_ = me_.loops[li].vertex_index
                sh = ao_v[vi_] * vertex_shade(me_.vertices[vi_].co, fb, fold_v.get(vi_, 0.0), P)
                ca.data[li].color = (tint[0] * sh, tint[1] * sh, tint[2] * sh, alpha)
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
        meta[pd['id']] = dict(id=pd['id'], kind=pd['kind'], tags=pd.get('tags', []), skin=pd['skin'], outfit=pd.get('outfit', {'trousers': 'trousers', 'jeans': 'trousers', 'leggings': 'leggings', 'shorts': 'shorts', 'skirt': 'dress'}.get(pd['bot_style'], pd['bot_style'])), heightM=round(top - bottom, 3), shoulderWidthM=round(2 * P['shw'] + 0.06, 3), eyeHeightM=round(eye, 3),
                              seatRootDropM=round(drop, 3), seatedEyeHeightM=round(eye - drop, 3), seatedHeadTopM=round(top - bottom - drop, 3), hipHeightM=round(hip, 3),
                              legLengthM=round(hip, 3), walkSpeedMps=round(4 * hip * math.sin(0.40) / 1.0, 2), walkFastSpeedMps=round(4 * hip * math.sin(0.52) / (19 / 24), 2), runSpeedMps=round(4 * hip * math.sin(0.78) / (16 / 24), 2),
                              tris=sum(max(1, len(p_.vertices) - 2) for p_ in mo.data.polygons), slots=slot_meta, _bottom=bottom, _bd=None)
        # bones shift handled by rebuilding below
        g['bottom'] = bottom
    return root, objs, meta, None

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

import struct
def _read_glb(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n]); off = 20 + n
    ln = struct.unpack('<I', b[off:off + 4])[0]; bin_ = b[off + 8:off + 8 + ln]
    return j, bin_
def _write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ = bytes(bin_) + b'\0' * ((4 - len(bin_) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(out)
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def _decode(j, bin_, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]; cnt = a['count']
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or dt.itemsize * nc
    raw = np.frombuffer(bin_, np.uint8, count=stride * (cnt - 1) + dt.itemsize * nc, offset=base)
    arr = np.lib.stride_tricks.as_strided(raw, shape=(cnt, dt.itemsize * nc), strides=(stride, 1)).copy().view(dt).reshape(cnt, nc)
    return arr
def quantize_glb(path, hair_mask=True, color16=True):
    """KHR_mesh_quantization: NORMAL int8, TEXCOORD u16, COLOR u16 (u8 for the LOD), WEIGHTS u8 (positions / joints unchanged); hair material -> alpha MASK; drop unused buffer data"""
    j, bin_ = _read_glb(path)
    conv = {}
    for m in j['meshes']:
        for pr in m['primitives']:
            for name, ai in pr['attributes'].items():
                if name in ('NORMAL', 'TEXCOORD_0', 'COLOR_0', 'WEIGHTS_0') and ai not in conv:
                    arr = _decode(j, bin_, ai)
                    if arr.dtype == np.uint16 and name == 'COLOR_0': arr = (arr.astype(np.float32) / 65535.0)
                    if name == 'NORMAL':
                        q = np.zeros((arr.shape[0], 4), np.int8); q[:, :3] = np.clip(np.round(arr * 127.0), -127, 127).astype(np.int8); data = q; ct = 5120; ty = 'VEC3'; nz = True; stride = 4
                    elif name == 'TEXCOORD_0':
                        data = np.clip(np.round(arr * 65535.0), 0, 65535).astype(np.uint16); ct = 5123; ty = 'VEC2'; nz = True; stride = 4
                    elif name == 'COLOR_0':
                        # normalized uint16: dark cloth keeps its gradient, and the game can re-tint a slot (alpha = slot * 16 / 255) by multiplying the colours
                        a4 = arr.astype(np.float32)
                        if a4.shape[1] == 3: a4 = np.concatenate([a4, np.ones((a4.shape[0], 1), np.float32)], 1)
                        if color16: data = np.clip(np.round(a4 * 65535.0), 0, 65535).astype(np.uint16); ct = 5123; ty = 'VEC4'; nz = True; stride = 8
                        else: data = np.clip(np.round(a4 * 255.0), 0, 255).astype(np.uint8); ct = 5121; ty = 'VEC4'; nz = True; stride = 4
                    else:
                        w = arr.astype(np.float32); w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
                        q8 = np.clip(np.round(w * 255.0), 0, 255).astype(np.int32)
                        diff = 255 - q8.sum(1); am = np.argmax(q8, 1); q8[np.arange(len(q8)), am] += diff          # make each weight set sum to exactly 255
                        data = np.clip(q8, 0, 255).astype(np.uint8); ct = 5121; ty = 'VEC4'; nz = True; stride = 4
                    conv[ai] = (data, ct, ty, nz, stride)
    # rebuild buffer: keep views still referenced by non-converted accessors / images
    used = set()
    for i, a in enumerate(j['accessors']):
        if i not in conv and 'bufferView' in a: used.add(a['bufferView'])
    for im in j.get('images', []):
        if 'bufferView' in im: used.add(im['bufferView'])
    newbin = bytearray(); newviews = []; vmap = {}
    for i, bv in enumerate(j['bufferViews']):
        if i not in used: continue
        while len(newbin) % 4: newbin.append(0)
        o = len(newbin); newbin += bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        nb = dict(bv); nb['byteOffset'] = o; vmap[i] = len(newviews); newviews.append(nb)
    for ai, (data, ct, ty, nz, stride) in conv.items():
        while len(newbin) % 4: newbin.append(0)
        o = len(newbin); raw = data.tobytes(); newbin += raw
        newviews.append(dict(buffer=0, byteOffset=o, byteLength=len(raw), byteStride=stride, target=34962))
        a = j['accessors'][ai]; a['bufferView'] = len(newviews) - 1; a['byteOffset'] = 0; a['componentType'] = ct; a['normalized'] = nz
        a.pop('min', None); a.pop('max', None)
    for i, a in enumerate(j['accessors']):
        if i not in conv and 'bufferView' in a: a['bufferView'] = vmap[a['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im: im['bufferView'] = vmap[im['bufferView']]
    j['bufferViews'] = newviews; j['buffers'] = [dict(byteLength=len(newbin))]
    ext = set(j.get('extensionsUsed', [])); ext.add('KHR_mesh_quantization'); j['extensionsUsed'] = sorted(ext)
    req = set(j.get('extensionsRequired', [])); req.add('KHR_mesh_quantization'); j['extensionsRequired'] = sorted(req)
    for m in j['materials']:
        m['doubleSided'] = True
        if m.get('name') == 'people_hair' and hair_mask: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5
    _write_glb(path, j, newbin)
    print('quantized', path, round(os.path.getsize(path) / 1e6, 2), 'MB')

DRACO = os.environ.get('PEOPLE_DRACO', '1') != '0'
def finish_glb(path, hair_mask=True):
    """Draco build: geometry is already compressed by the exporter; only the material flags are patched (double sided cloth, alpha-tested hair cards)."""
    j, bin_ = _read_glb(path)
    for m in j['materials']:
        m['doubleSided'] = True
        if m.get('name') == 'people_hair' and hair_mask: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5
    _write_glb(path, j, bin_)
    print('finished', path, round(os.path.getsize(path) / 1e6, 2), 'MB')

def export_people(meta):
    path = os.path.join(OUTP, 'people_lod.glb' if LOD else 'people.glb')
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=86, export_vertex_color='ACTIVE', export_cameras=False, export_lights=False,
              export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_frame_range=False, export_optimize_animation_size=True,
              export_force_sampling=True)
    if DRACO:      # Draco keeps 25 characters + LOD far under the 14 MB budget (js/people/rig.js decodes it with the vendored three.js Draco decoder)
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14, export_draco_normal_quantization=10,
                  export_draco_texcoord_quantization=12, export_draco_color_quantization=12, export_draco_generic_quantization=12)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('TypeError', e)
        for k_ in ('export_optimize_animation_size', 'export_force_sampling', 'export_frame_range'): kw.pop(k_, None)
        bpy.ops.export_scene.gltf(**kw)
    print(f'EXPORTED people.glb: {os.path.getsize(path)/1024:.0f} KB (draco={DRACO})')
    if DRACO: finish_glb(path)
    else: quantize_glb(path, color16=not LOD)

def fk_grips(P, bd):
    """Hand grip positions (relative to the root) for stand_hold_pole (right hand) and stand_hold_rail (left hand): forward kinematics of the clip poses."""
    return None

if __name__ == '__main__':
    only = [a for a in ARGS if not a.startswith('--')]
    root, objs, meta, sw = build_people(only or None)
    if LOD:      # LOD1: decimate every body (same rig / weights / names), 1024 px atlas, no clips (it binds to the full-detail skeleton at run time)
        for pd, pb, mo, ao, P, g, bd in objs:
            tris0 = sum(max(1, len(p_.vertices) - 2) for p_ in mo.data.polygons)
            mo.modifiers.remove(mo.modifiers['Armature'])
            dm = mo.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = min(1.0, 1600.0 / tris0); dm.use_collapse_triangulate = True; dm.delimit = {'UV', 'MATERIAL'}
            bpy.context.view_layer.objects.active = mo
            bpy.ops.object.modifier_apply(modifier='dec')
            am = mo.modifiers.new('Armature', 'ARMATURE'); am.object = ao
            meta[pd['id']]['tris'] = sum(max(1, len(p_.vertices) - 2) for p_ in mo.data.polygons)
    finalize_rigs(objs, meta)
    # author the shared clips ONCE (on the first armature); every person has identical bone names / rest orientations
    first = objs[0][3]
    names = list(CLIPS.keys()) if not LOD else []
    for nme in names:
        frames, fn = CLIPS[nme]
        pose_clip(first, nme, frames, fn)
    for pid, md in meta.items():
        md['clips'] = names
        md.pop('_bd', None); md.pop('_bottom', None)
    for pd, pb, mo, ao, P, g, bd in objs:
        print(pd['id'], meta[pd['id']]['heightM'], 'tris', meta[pd['id']]['tris'])
    export_people(meta)
    if LOD:
        sys.exit(0)
    out = dict(note='Heights are total standing heights (soles = 0). Headroom rule: train centre-line headroom is 1.88 m, 1.68 m above the bench fronts (|x|=0.62), ~1.3 m at the seat backs; every person is <= 1.80 m so standing in the aisle never clips; seated heads top out at seatedHeadTopM above the floor. Seated: set the root so that root.y = seatFloorY - seatRootDropM (clips sit_* are rotation-only).',
               lod=dict(file='people_lod.glb', trisPerPerson=1600, note='geometry only (no textures, no clips): same node names, skin and UV layout as people.glb, so js/people/rig.js swaps it into the full-detail skinned mesh beyond ~35 m. Same recolour slots (COLOR_0 alpha).'), seatTopM=SEAT_TOP, seatHipM=SEAT_HIP, loopClips=[c for c in names if c not in ONE_SHOT], oneShotClips=sorted(ONE_SHOT), fps=24,
               clipFrames={n: CLIPS[n][0] for n in names}, people=list(meta.values()))
    json.dump(out, open(os.path.join(OUTP, 'people_meta.json'), 'w'), indent=1)
