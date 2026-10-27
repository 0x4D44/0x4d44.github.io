"""Builds models/people.glb : 15 rigged low-poly people (men, women, boys, girls, elders, staff), one shared 256x256 colour-swatch atlas,
15 bones each (identical names) and 4 animation clips per person: idle, walk, phone, sit.
Blender: +Y forward, feet on z=0.  glTF: person faces -Z.  Each person = armature node `person_<id>` (origin on the floor under the hips)
with the bone hierarchy and a skinned child mesh `person_<id>_mesh` (single material `people_atlas`).
Clip tracks are named `<id>__idle`, `<id>__walk`, `<id>__phone`, `<id>__sit` (NLA tracks -> glTF animations)."""
import math, sys, os, random
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *
import numpy as np
from PIL import Image
from mathutils import Quaternion

SKIN = ['#f3d2b8', '#e8b998', '#d39a76', '#b57a56', '#8b5a3c', '#5e3b26']
HAIR = ['#1b1410', '#3a2a1e', '#6b4a2e', '#a97e45', '#d6b66a', '#8f8f8f', '#cfcfcf', '#7a2f1a']

# ---------------------------------------------------------------- person definitions
# kind: m/f adult, b/g child, t teen.  coat: 'none','jacket','long'.  bottom: 'trousers','skirt','leggings'.
PEOPLE = [
    dict(id='man_commuter', H=1.80, sex='m', skin=1, hair=(0, 'short'), top='#27303f', coat='jacket', bottom='trousers', bot='#1f2024', shoes='#151515', bag='backpack', bagc='#202225'),
    dict(id='man_hoodie', H=1.75, sex='m', skin=2, hair=(1, 'beanie'), top='#6c6f75', coat='none', bottom='trousers', bot='#3b5b8c', shoes='#e9e9e9', hat='#2d3a4a', sleeve='long'),
    dict(id='man_longcoat', H=1.84, sex='m', skin=0, hair=(5, 'short'), top='#3a3d42', coat='long', bottom='trousers', bot='#1b1b1d', shoes='#222', scarf='#a52a2a'),
    dict(id='man_elder', H=1.70, sex='m', skin=0, hair=(6, 'short'), top='#9a8460', coat='jacket', bottom='trousers', bot='#4a4d52', shoes='#3a2a1e', hat='#5b5a56', stoop=0.08),
    dict(id='man_puffer', H=1.78, sex='m', skin=5, hair=(0, 'short'), top='#53613f', coat='jacket', bottom='trousers', bot='#16171a', shoes='#d8d8d8'),
    dict(id='woman_coat', H=1.66, sex='f', skin=0, hair=(2, 'long'), top='#b89066', coat='long', bottom='trousers', bot='#1d1d20', shoes='#2b1d14', bag='shoulder', bagc='#5b3a22'),
    dict(id='woman_puffer', H=1.60, sex='f', skin=1, hair=(4, 'pony'), top='#b5322e', coat='jacket', bottom='trousers', bot='#3e5c8a', shoes='#f0f0f0', bag='backpack', bagc='#2a2d33'),
    dict(id='woman_dress', H=1.70, sex='f', skin=3, hair=(0, 'bun'), top='#2d3f6b', coat='none', bottom='skirt', bot='#2d3f6b', shoes='#1e1e1e', cardigan='#3f7d4e'),
    dict(id='woman_elder', H=1.58, sex='f', skin=0, hair=(6, 'shorthair'), top='#7b4a8e', coat='long', bottom='trousers', bot='#2a2a2e', shoes='#3a3a3a', bag='shoulder', bagc='#202020', stoop=0.06),
    dict(id='woman_student', H=1.68, sex='f', skin=2, hair=(1, 'long'), top='#d1a02e', coat='none', bottom='trousers', bot='#4c6a99', shoes='#ececec', bag='backpack', bagc='#a02c2c', sleeve='long'),
    dict(id='boy', H=1.35, sex='b', skin=1, hair=(2, 'short'), top='#2d6cb5', coat='jacket', bottom='trousers', bot='#4a4d52', shoes='#222', bag='backpack', bagc='#c23a2d'),
    dict(id='girl', H=1.28, sex='g', skin=2, hair=(7, 'pony'), top='#e07aa0', coat='jacket', bottom='leggings', bot='#2b2b3a', shoes='#f2f2f2', bag='backpack', bagc='#7e57c2'),
    dict(id='teen_football', H=1.64, sex='m', skin=1, hair=(3, 'short'), top='#1b3f9a', coat='none', bottom='trousers', bot='#16171a', shoes='#ffffff', scarf='#f2f2f2', sleeve='short'),
    dict(id='staff_hivis', H=1.78, sex='m', skin=0, hair=(1, 'short'), top='#d6ee1a', coat='jacket', bottom='trousers', bot='#1e2430', shoes='#111', hat='#1e2430', hivis=True),
    dict(id='woman_scarf', H=1.63, sex='f', skin=4, hair=(0, 'long'), top='#e8e0d0', coat='long', bottom='trousers', bot='#2a2a2e', shoes='#222', scarf='#c05a3a', bag='shoulder', bagc='#8a5a3a'),
]

BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperarm_l', 'forearm_l', 'upperarm_r', 'forearm_r', 'thigh_l', 'shin_l', 'thigh_r', 'shin_r', 'foot_l', 'foot_r']

# ---------------------------------------------------------------- mesh helpers
class PB:
    """Person mesh builder: verts tagged by body part; faces tagged by colour (hex)."""
    def __init__(self):
        self.bm = bmesh.new(); self.vpart = []; self.fhex = []
    def V(self, co, part):
        v = self.bm.verts.new(co); self.vpart.append(part); return v
    def F(self, vs, hexc_):
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        self.fhex.append(hexc_); return f
    def loft(self, rings, part, hexc_, cap_top=True, cap_bot=True, hex_fn=None):
        """rings: list of list of (x,y,z) with the same count; closed loops."""
        vr = [[self.V(p, part) for p in ring] for ring in rings]
        n = len(rings[0])
        for r in range(len(rings) - 1):
            for i in range(n):
                self.F((vr[r][i], vr[r][(i + 1) % n], vr[r + 1][(i + 1) % n], vr[r + 1][i]), hex_fn(r) if hex_fn else hexc_)
        if cap_bot: self.F(vr[0][::-1], hex_fn(0) if hex_fn else hexc_)
        if cap_top: self.F(vr[-1], hex_fn(len(rings) - 2) if hex_fn else hexc_)
        return vr

def ellipse_ring(cx, cy, z, rx, ry, n=8, rot=0.0):
    return [(cx + rx * math.cos(2 * math.pi * i / n + rot), cy + ry * math.sin(2 * math.pi * i / n + rot), z) for i in range(n)]

def tube(pb, p0, p1, r0, r1, part, hexc_, n=8, mid=None, hex_fn=None, cap=True):
    """Tapered tube from p0 to p1 (vertical-ish limbs), optional mid ring (p, r)."""
    pts = [(p0, r0)] + ([mid] if mid else []) + [(p1, r1)]
    rings = [ellipse_ring(p[0], p[1], p[2], r, r, n) for p, r in pts]
    return pb.loft(rings, part, hexc_, cap_top=cap, cap_bot=cap, hex_fn=hex_fn)

def sphere(pb, c, rx, ry, rz, part, hexc_, nu=10, nv=6):
    rings = []
    for j in range(1, nv):
        th = math.pi * j / nv; z = c[2] + rz * math.cos(th); rr = math.sin(th)
        rings.append(ellipse_ring(c[0], c[1], z, rx * rr, ry * rr, nu))
    top = pb.V((c[0], c[1], c[2] + rz), part); bot = pb.V((c[0], c[1], c[2] - rz), part)
    vr = [[pb.V(p, part) for p in ring] for ring in rings]
    for i in range(nu):
        pb.F((top, vr[0][(i + 1) % nu], vr[0][i]), hexc_)
        pb.F((bot, vr[-1][i], vr[-1][(i + 1) % nu]), hexc_)
    for r in range(len(vr) - 1):
        for i in range(nu):
            pb.F((vr[r][i], vr[r][(i + 1) % nu], vr[r + 1][(i + 1) % nu], vr[r + 1][i]), hexc_)

def box(pb, c, s, part, hexc_):
    x, y, z = c; sx, sy, sz = s[0] / 2, s[1] / 2, s[2] / 2
    v = [pb.V((x + a * sx, y + b * sy, z + d * sz), part) for a in (-1, 1) for b in (-1, 1) for d in (-1, 1)]
    idx = lambda a, b, d: (a * 4 + b * 2 + d)
    for fs in (((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
               ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))):
        pb.F([v[idx(*q)] for q in fs], hexc_)

# ---------------------------------------------------------------- build one person
def build_person(pd):
    H = pd['H']; sex = pd['sex']
    adult = sex in ('m', 'f', 't')
    child = sex in ('b', 'g')
    k = H / 1.78
    fem = sex in ('f', 'g')
    hip_z = H * (0.50 if adult else 0.46)
    knee_z = hip_z * 0.53; ankle_z = 0.055 * k + 0.02
    sh_z = H * (0.815 if adult else 0.79)
    shw = (0.20 if not fem else 0.175) * k * (1.0 if adult else 0.86)           # shoulder half width
    hipw = (0.15 if not fem else 0.165) * k * (1.0 if adult else 0.9)
    stoop = pd.get('stoop', 0.0)
    head_r = H / (7.4 if adult else 6.0) / 2 * 1.02
    pb = PB()
    skin = SKIN[pd['skin']]
    top = pd['top']; bot = pd['bot']; shoes = pd['shoes']
    coat = pd.get('coat', 'none'); sleeve = pd.get('sleeve', 'long')
    top_col = top if coat != 'none' else top
    # --- torso loft (hips -> shoulders), coat / dress extend further down
    waist = 0.62 * H; chest_z = 0.735 * H
    rings_z = [(hip_z - 0.02, hipw * 1.05, 0.095 * k * 1.0), (hip_z + 0.12 * k, hipw * 0.98, 0.092 * k), (waist, (0.135 if not fem else 0.115) * k, 0.085 * k),
               (chest_z, (0.175 if not fem else 0.155) * k, (0.105 if not fem else 0.11) * k), (sh_z, shw * 0.95, 0.085 * k), (sh_z + 0.035 * k, shw * 0.55, 0.065 * k)]
    lean = stoop
    rings = [ellipse_ring(0, -lean * (z - hip_z) * 0.8 if z > hip_z else 0, z, rx, ry, 8) for z, rx, ry in rings_z]
    def torso_hex(r):
        if r == 0: return bot if coat == 'none' else top
        return top
    pb.loft(rings, 'torso', top, hex_fn=torso_hex)
    # coat / skirt / dress skirts: wider tube down to the knee (weights: hips + thighs)
    if coat == 'long':
        zr = [(hip_z + 0.05 * k, hipw * 1.12), (hip_z - 0.10 * k, hipw * 1.35), (knee_z + 0.05 * k, hipw * 1.45)]
        rings2 = [ellipse_ring(0, 0, z, r * 1.0, r * 0.75, 8) for z, r in zr]
        pb.loft(rings2, 'skirt', top, cap_top=False, cap_bot=True)
    elif coat == 'jacket':
        zr = [(hip_z + 0.06 * k, hipw * 1.10), (hip_z - 0.07 * k, hipw * 1.18)]
        pb.loft([ellipse_ring(0, 0, z, r, r * 0.78, 8) for z, r in zr], 'skirt', top, cap_top=False, cap_bot=True)
    if pd['bottom'] == 'skirt':
        zr = [(hip_z + 0.02, hipw * 1.0), (hip_z - 0.10 * k, hipw * 1.25), (knee_z + 0.12 * k, hipw * 1.55)]
        pb.loft([ellipse_ring(0, 0, z, r, r * 0.85, 8) for z, r in zr], 'skirt', bot, cap_top=False, cap_bot=True)
    if pd.get('cardigan'):
        pb.loft([ellipse_ring(0, 0.002, z, rx * 1.06, ry * 1.04, 8) for z, rx, ry in rings_z[2:5]], 'torso', pd['cardigan'], cap_top=False, cap_bot=False)
    if pd.get('hivis'):
        pb.loft([ellipse_ring(0, 0.002, z, rx * 1.07, ry * 1.06, 8) for z, rx, ry in rings_z[1:5]], 'torso', '#d6ee1a', cap_top=False, cap_bot=False)
        pb.loft([ellipse_ring(0, 0.004, z, rx * 1.075, ry * 1.065, 8) for z, rx, ry in ((rings_z[2][0] - 0.02, rings_z[2][1], rings_z[2][2]), (rings_z[2][0] + 0.03, rings_z[2][1], rings_z[2][2]))], 'torso', '#c9c9c9', cap_top=False, cap_bot=False)
    # --- neck + head
    neck_z = sh_z + 0.03 * k
    tube(pb, (0, lean * 0.1, neck_z), (0, lean * 0.15, neck_z + 0.07 * k), 0.045 * k, 0.04 * k, 'neck', skin, n=8)
    hz = neck_z + 0.07 * k + head_r * 1.0
    hy = lean * 0.35
    sphere(pb, (0, hy, hz), head_r * 0.82, head_r * 0.95, head_r * 1.1, 'head', skin, 10, 6)
    # ears, nose, eyes, mouth
    for sg in (-1, 1):
        sphere(pb, (sg * head_r * 0.82, hy, hz - head_r * 0.05), head_r * 0.12, head_r * 0.08, head_r * 0.2, 'head', skin, 6, 4)
        sphere(pb, (sg * head_r * 0.32, hy + head_r * 0.82, hz + head_r * 0.12), head_r * 0.11, head_r * 0.05, head_r * 0.07, 'head', '#1a1a1a', 6, 4)    # eyes
        sphere(pb, (sg * head_r * 0.32, hy + head_r * 0.80, hz + head_r * 0.30), head_r * 0.15, head_r * 0.04, head_r * 0.035, 'head', HAIR[min(pd['hair'][0], 7)] if pd['hair'][1] != 'bald' else '#3a2a1e', 6, 4) if sex != 'x' else None   # brows
    sphere(pb, (0, hy + head_r * 0.92, hz - head_r * 0.08), head_r * 0.12, head_r * 0.14, head_r * 0.16, 'head', skin, 6, 4)                  # nose
    box(pb, (0, hy + head_r * 0.82, hz - head_r * 0.45), (head_r * 0.34, head_r * 0.06, head_r * 0.07), 'head', '#8c4a40' if SKIN.index(skin) < 4 else '#5a2a24')   # mouth
    # --- hair / hats
    hcol = HAIR[pd['hair'][0]]; style = pd['hair'][1]
    if style != 'bald':
        cap_r = 1.0
        # hair cap: upper part of a slightly larger ellipsoid
        rings_h = []
        for j in range(1, 4):
            th = (math.pi / 2) * j / 3.2
            z = hz + head_r * 1.12 * math.cos(th) * 1.0; rr = math.sin(th)
            rings_h.append(ellipse_ring(0, hy - head_r * 0.06, z, head_r * 0.90 * rr * 1.04 + 0.001, head_r * 1.03 * rr, 10))
        rings_h.append(ellipse_ring(0, hy - head_r * 0.05, hz + head_r * 0.12, head_r * 0.90, head_r * 1.02, 10))
        if style in ('short', 'shorthair', 'bun', 'pony', 'long', 'beanie'):
            pb.loft(rings_h[::-1] if False else rings_h, 'head', hcol if style != 'beanie' else (pd.get('hat', '#2d3a4a')), cap_top=True, cap_bot=False)
        if style == 'long':
            pb.loft([ellipse_ring(0, hy - head_r * 0.55, z, head_r * 0.85, head_r * 0.42, 8) for z in (hz + head_r * 0.2, hz - head_r * 0.7, hz - head_r * 1.7)], 'head', hcol, cap_top=True, cap_bot=True)
        if style == 'pony':
            tube(pb, (0, hy - head_r * 1.05, hz + head_r * 0.35), (0, hy - head_r * 1.15, hz - head_r * 0.9), head_r * 0.22, head_r * 0.12, 'head', hcol, n=6)
        if style == 'bun':
            sphere(pb, (0, hy - head_r * 0.7, hz + head_r * 0.95), head_r * 0.35, head_r * 0.35, head_r * 0.3, 'head', hcol, 8, 4)
    if pd.get('hat') and style != 'beanie':
        hatc = pd['hat']
        pb.loft([ellipse_ring(0, hy - head_r * 0.02, z, head_r * 0.98 * r, head_r * 1.08 * r, 10) for z, r in ((hz + head_r * 0.35, 1.0), (hz + head_r * 0.75, 0.98), (hz + head_r * 1.12, 0.6))], 'head', hatc, cap_top=True, cap_bot=False)
        box(pb, (0, hy + head_r * 1.05, hz + head_r * 0.42), (head_r * 1.1, head_r * 0.55, head_r * 0.06), 'head', hatc)            # peak
    # --- arms
    arm_len_u = (sh_z - H * 0.61); arm_len_f = (H * 0.61 - H * 0.47)
    r_u = 0.048 * k * (1 if adult else 0.85); r_f = 0.040 * k * (1 if adult else 0.85)
    sl_hex_up = top if coat != 'none' or sleeve == 'long' else (top if sleeve == 'short' else skin)
    for sg in (-1, 1):
        sx = sg * (shw + 0.005)
        el = (sg * (shw + 0.025), -0.0 + lean * 0.0, H * 0.61)
        wr = (sg * (shw + 0.04), 0.01, H * 0.47)
        tube(pb, (sx, 0, sh_z - 0.01), el, r_u * 1.05, r_u * 0.85, 'arm' + ('_l' if sg < 0 else '_r'), top, n=8, cap=False)
        fh = top if (sleeve == 'long' or coat != 'none') else skin
        tube(pb, el, wr, r_f * 1.1, r_f * 0.8, 'farm' + ('_l' if sg < 0 else '_r'), fh, n=8, cap=True)
        sphere(pb, (wr[0], wr[1], wr[2] - 0.045 * k), 0.034 * k, 0.026 * k, 0.05 * k, 'farm' + ('_l' if sg < 0 else '_r'), skin, 6, 4)      # hand
        if pd.get('hivis'):
            pass
    # --- legs
    for sg in (-1, 1):
        hx = sg * hipw * 0.58; sd = '_l' if sg < 0 else '_r'
        r0 = 0.078 * k * (1 if adult else 0.85); r1 = 0.056 * k * (1 if adult else 0.85); r2 = 0.042 * k * (1 if adult else 0.85)
        leg_col = bot if pd['bottom'] != 'skirt' else '#2a2a2a'
        if pd['bottom'] == 'skirt': leg_col = skin if pd.get('skirt_bare') else '#26262a'
        tube(pb, (hx, 0, hip_z), (hx, 0, knee_z), r0, r1, 'thigh' + sd, leg_col, n=8, cap=False)
        tube(pb, (hx, 0, knee_z), (hx, 0, ankle_z + 0.03), r1 * 1.0, r2, 'shin' + sd, leg_col, n=8, cap=False)
        # shoe
        sl = 0.27 * k * (1 if adult else 0.8)
        box(pb, (hx, sl * 0.28, 0.04 * k + 0.012), (0.095 * k, sl, 0.075 * k), 'foot' + sd, shoes)
        sphere(pb, (hx, sl * 0.62, 0.04 * k + 0.02), 0.048 * k, 0.07 * k, 0.04 * k, 'foot' + sd, shoes, 6, 3)
    # --- accessories
    bag = pd.get('bag')
    if bag == 'backpack':
        bw, bh, bd = (0.30, 0.38, 0.14) if adult else (0.24, 0.30, 0.12)
        box(pb, (0, -(0.085 * k + bd / 2 + lean * 0.3), chest_z + 0.02 * k), (bw * k, bd, bh * k), 'chest', pd['bagc'])
        for sg in (-1, 1): box(pb, (sg * 0.085 * k, 0.0, sh_z - 0.04), (0.035 * k, 0.12 * k, 0.015), 'chest', pd['bagc'])
    elif bag == 'shoulder':
        box(pb, (shw * 0.9 + 0.11 * k, 0.02, hip_z - 0.02), (0.07, 0.26 * k, 0.22 * k), 'thigh_r', pd['bagc'])
        box(pb, (shw * 0.55, 0.04, sh_z - 0.12 * k), (0.015, 0.02, 0.34 * k), 'chest', pd['bagc'])
    if pd.get('scarf'):
        tube(pb, (0, 0, neck_z - 0.01), (0, 0, neck_z + 0.075 * k), 0.065 * k, 0.062 * k, 'neck', pd['scarf'], n=8)
        box(pb, (0.03, 0.075 * k, neck_z - 0.1 * k), (0.07 * k, 0.025, 0.2 * k), 'chest', pd['scarf'])
    return pb, dict(H=H, k=k, hip_z=hip_z, knee_z=knee_z, ankle_z=ankle_z, sh_z=sh_z, shw=shw, hipw=hipw, hz=hz, neck_z=neck_z, chest_z=chest_z, head_r=head_r, lean=lean)

# ---------------------------------------------------------------- rig
def bone_defs(g):
    H, k = g['H'], g['k']; hz = g['hip_z']; sh = g['sh_z']; shw = g['shw']; hipw = g['hipw']
    hx = hipw * 0.58
    d = {}
    d['hips'] = ((0, 0, hz - 0.03), (0, 0, hz + 0.10 * k), None)
    d['spine'] = ((0, 0, hz + 0.10 * k), (0, 0, g['chest_z'] - 0.02), 'hips')
    d['chest'] = ((0, 0, g['chest_z'] - 0.02), (0, 0, sh + 0.02), 'spine')
    d['neck'] = ((0, 0, g['neck_z']), (0, 0, g['neck_z'] + 0.07 * k), 'chest')
    d['head'] = ((0, 0, g['neck_z'] + 0.07 * k), (0, 0, g['hz'] + g['head_r'] * 1.1), 'neck')
    for sg, s in ((-1, 'l'), (1, 'r')):
        d['upperarm_' + s] = ((sg * (shw + 0.005), 0, sh - 0.01), (sg * (shw + 0.025), 0, H * 0.61), 'chest')
        d['forearm_' + s] = ((sg * (shw + 0.025), 0, H * 0.61), (sg * (shw + 0.04), 0.01, H * 0.47), 'upperarm_' + s)
        d['thigh_' + s] = ((sg * hx, 0, hz), (sg * hx, 0, g['knee_z']), 'hips')
        d['shin_' + s] = ((sg * hx, 0, g['knee_z']), (sg * hx, 0, g['ankle_z'] + 0.03), 'thigh_' + s)
        d['foot_' + s] = ((sg * hx, 0, g['ankle_z'] + 0.03), (sg * hx, 0.13 * k, 0.03), 'shin_' + s)
    return d

ALLOWED = {
    'torso': ['hips', 'spine', 'chest'], 'skirt': ['hips', 'thigh_l', 'thigh_r', 'spine'], 'neck': ['neck', 'chest', 'head'], 'head': ['head', 'neck'],
    'arm_l': ['chest', 'upperarm_l', 'forearm_l'], 'farm_l': ['upperarm_l', 'forearm_l'], 'arm_r': ['chest', 'upperarm_r', 'forearm_r'], 'farm_r': ['upperarm_r', 'forearm_r'],
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
        ws.append((1.0 / (d + 0.03) ** 3, bn))
    ws.sort(reverse=True)
    ws = ws[:3]
    tot = sum(w for w, _ in ws)
    return [(bn, w / tot) for w, bn in ws]

def make_armature(name, bd):
    arm = bpy.data.armatures.new(name + '_arm'); ao = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn in BONES:
        h, t, par = bd[bn]
        b = arm.edit_bones.new(bn); b.head = h; b.tail = t
        eb[bn] = b
    for bn in BONES:
        par = bd[bn][2]
        if par: eb[bn].parent = eb[par]; eb[bn].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao

# ---------------------------------------------------------------- animation helpers
def rot_local(ao, bname, axis, ang):
    """Quaternion (pose space) rotating the bone by `ang` about a WORLD axis ('x' lateral, 'y' forward, 'z' up), given rest orientation."""
    bone = ao.data.bones[bname]
    R = bone.matrix_local.to_3x3()
    ax = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]
    Rw = Quaternion(ax, ang).to_matrix()
    M_ = R.inverted() @ Rw @ R
    return M_.to_quaternion()

def pose_clip(ao, clip, frames, fn, trans_fn=None, fps=24):
    ad = ao.animation_data_create()
    act = bpy.data.actions.new(f'{ao.name[len("person_"):]}__{clip}')
    ad.action = act
    for bn in BONES: ao.pose.bones[bn].rotation_mode = 'QUATERNION'
    for f in range(frames + 1):
        ph = f / frames
        angs = fn(ph)
        for bn in BONES:
            pb = ao.pose.bones[bn]
            q = Quaternion((1, 0, 0, 0))
            for (axis, a) in angs.get(bn, []):
                q = q @ rot_local(ao, bn, axis, a)
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=1 + f)
        if trans_fn:
            pb = ao.pose.bones['hips']
            pb.location = trans_fn(ph)
            pb.keyframe_insert('location', frame=1 + f)
    # push to NLA
    tr = ad.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, 1, act)
    ad.action = None
    # reset pose
    for bn in BONES:
        pb = ao.pose.bones[bn]; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

def add_clips(ao, g):
    TAU = 2 * math.pi
    s = math.sin; c = math.cos
    def walk(ph):
        p = ph * TAU
        A = 0.50
        def knee(pp): return 0.12 + 0.62 * max(0.0, c(pp))
        return {
            'hips': [('y', 0.05 * s(p)), ('z', 0.07 * s(p))],
            'spine': [('z', -0.10 * s(p)), ('x', -0.03)],
            'chest': [('z', -0.04 * s(p))],
            'head': [('z', 0.07 * s(p)), ('x', 0.0)],
            'thigh_l': [('x', A * s(p))], 'thigh_r': [('x', A * s(p + math.pi))],
            'shin_l': [('x', -knee(p))], 'shin_r': [('x', -knee(p + math.pi))],
            'foot_l': [('x', 0.18 * s(p + 1.2))], 'foot_r': [('x', 0.18 * s(p + 1.2 + math.pi))],
            'upperarm_l': [('x', -0.42 * s(p)), ('y', -0.05)], 'upperarm_r': [('x', 0.42 * s(p)), ('y', 0.05)],
            'forearm_l': [('x', 0.28 + 0.18 * max(0.0, -s(p)))], 'forearm_r': [('x', 0.28 + 0.18 * max(0.0, s(p)))],
        }
    def walk_t(ph):
        return (0, 0, 0.018 * g['k'] * abs(s(ph * TAU)) * -1 + 0.01)
    def idle(ph):
        p = ph * TAU
        return {
            'hips': [('y', 0.035 * s(p)), ('z', 0.02 * s(p + 1))],
            'spine': [('y', -0.03 * s(p)), ('x', 0.012 * s(2 * p))],
            'chest': [('x', 0.018 * s(2 * p + 0.5)), ('y', -0.01 * s(p))],
            'head': [('z', 0.06 * s(p + 0.6)), ('x', 0.03 * s(2 * p))],
            'thigh_l': [('x', 0.03 * s(p)), ('y', 0.02)], 'thigh_r': [('x', -0.03 * s(p)), ('y', -0.02)],
            'upperarm_l': [('x', 0.04 * s(p + 0.4)), ('y', -0.04)], 'upperarm_r': [('x', -0.04 * s(p + 0.4)), ('y', 0.04)],
            'forearm_l': [('x', 0.12 + 0.02 * s(p))], 'forearm_r': [('x', 0.12 - 0.02 * s(p))],
        }
    def phone(ph):
        p = ph * TAU
        return {
            'hips': [('y', 0.02 * s(p))],
            'spine': [('x', -0.08 + 0.01 * s(2 * p))],
            'head': [('x', -0.42 + 0.02 * s(2 * p)), ('z', 0.03 * s(p))],
            'upperarm_r': [('x', 0.85 + 0.02 * s(2 * p)), ('y', 0.10)], 'forearm_r': [('x', 1.85 + 0.04 * s(2 * p))],
            'upperarm_l': [('x', 0.08), ('y', -0.04)], 'forearm_l': [('x', 0.15)],
            'thigh_l': [('x', 0.03)], 'thigh_r': [('x', -0.02)],
        }
    seat_drop = -(g['hip_z'] - (g['knee_z'] - g['ankle_z'] + 0.08 + 0.05))
    def sit(ph):
        p = ph * TAU
        return {
            'hips': [('x', 0.0)],
            'spine': [('x', 0.03 * s(p))], 'chest': [('x', 0.015 * s(p))],
            'head': [('z', 0.04 * s(p)), ('x', -0.05)],
            'thigh_l': [('x', 1.50), ('y', -0.05)], 'thigh_r': [('x', 1.50), ('y', 0.05)],
            'shin_l': [('x', -1.52)], 'shin_r': [('x', -1.52)],
            'foot_l': [('x', 0.05)], 'foot_r': [('x', 0.05)],
            'upperarm_l': [('x', 0.30), ('y', -0.06)], 'upperarm_r': [('x', 0.30), ('y', 0.06)],
            'forearm_l': [('x', 1.05)], 'forearm_r': [('x', 1.05)],
        }
    pose_clip(ao, 'idle', 72, idle)
    pose_clip(ao, 'walk', 24, walk, walk_t)
    pose_clip(ao, 'phone', 48, phone)
    pose_clip(ao, 'sit', 48, sit, lambda ph: (0, 0.05, seat_drop))

# ---------------------------------------------------------------- build everything
def build_people():
    reset()
    root = group('people')
    cache = []
    swatches = {}
    def sw(h):
        h = h.lower()
        if len(h) == 4: h = '#' + ''.join(c * 2 for c in h[1:])
        if h not in swatches: swatches[h] = len(swatches)
        return swatches[h]
    objs = []
    for pd in PEOPLE:
        pb, g = build_person(pd)
        bd = bone_defs(g)
        for i, h in enumerate(pb.fhex): sw(h)
        # mesh
        pb.bm.verts.ensure_lookup_table(); pb.bm.faces.ensure_lookup_table()
        bmesh.ops.recalc_face_normals(pb.bm, faces=pb.bm.faces[:])
        me = bpy.data.meshes.new(f"person_{pd['id']}_mesh"); pb.bm.to_mesh(me)
        for p in me.polygons: p.use_smooth = True
        mo = bpy.data.objects.new(f"person_{pd['id']}_mesh", me)
        bpy.context.scene.collection.objects.link(mo)
        # weights
        for bn in BONES: mo.vertex_groups.new(name=bn)
        for vi, v in enumerate(me.vertices):
            part = pb.vpart[vi]
            for bn, w in weights_for(tuple(v.co), part, bd):
                mo.vertex_groups[bn].add([vi], w, 'REPLACE')
        ao = make_armature(f"person_{pd['id']}", bd)
        mo.parent = ao
        mod = mo.modifiers.new('Armature', 'ARMATURE'); mod.object = ao
        objs.append((pd, pb, mo, ao, g))
    # atlas
    n = len(swatches); assert n <= 256, n
    img = np.zeros((256, 256, 4), np.uint8); img[..., 3] = 255
    for h, i in swatches.items():
        r, gg, b = (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)); cx, cy = (i % 16) * 16, (i // 16) * 16
        img[cy:cy + 16, cx:cx + 16, :3] = (r, gg, b)
    path = os.path.join(SCRATCH, 'people_atlas.png')
    Image.fromarray(img).save(path)
    im = bpy.data.images.load(path); im.pack(); im.name = 'people_atlas'
    m = bpy.data.materials.new('people_atlas'); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.85; bs.inputs['Metallic'].default_value = 0.0
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Closest'
    m.node_tree.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    for pd, pb, mo, ao, g in objs:
        mo.data.materials.append(m)
        uvl = mo.data.uv_layers.new(name='UVMap')
        for pi, poly in enumerate(mo.data.polygons):
            hh = pb.fhex[pi].lower()
            if len(hh) == 4: hh = '#' + ''.join(c * 2 for c in hh[1:])
            i = swatches[hh]
            u = ((i % 16) + 0.5) / 16; v = 1 - ((i // 16) + 0.5) / 16
            for li in poly.loop_indices: uvl.data[li].uv = (u, v)
        add_clips(ao, g)
        ao.parent = root
    return root, objs

def export_people():
    path = os.path.join(OUT, 'people.glb')
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_materials='EXPORT', export_cameras=False, export_lights=False,
              export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_frame_range=False, export_optimize_animation_size=True,
              export_force_sampling=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('TypeError', e)
        for k_ in ('export_optimize_animation_size', 'export_force_sampling', 'export_frame_range'): kw.pop(k_, None)
        bpy.ops.export_scene.gltf(**kw)
    print(f'EXPORTED people.glb: {os.path.getsize(path)/1024:.0f} KB')

if __name__ == '__main__':
    root, objs = build_people()
    for pd, pb, mo, ao, g in objs:
        print(pd['id'], 'tris', sum(max(1, len(p.vertices) - 2) for p in mo.data.polygons), 'verts', len(mo.data.vertices))
    export_people()
