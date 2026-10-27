"""Builds models/tunnel_segment.glb and models/tunnel_station_vault.glb.
Blender: Y = along track (glTF -Z / +Z), X = across, Z up; origin at track centre-line, rail-head level, segment centre.
"""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

R = 1.675               # bore inner radius (3.35 m inner diameter)
ZC = 1.225              # bore axis height above rail head (rail head 0.45 m above the invert; research/train-dimensions.md)
RING = 0.61             # one ring length (2 ft)
FLOOR_Z = -0.18         # concrete track slab top
GAUGE_IN = 0.610        # half of 1220 mm
RAIL_C = GAUGE_IN + 0.035
VL = 1.2                # station vault section length

def arc(r, a0, a1, n, cx=0.0, cz=ZC):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

PHI0 = math.asin((FLOOR_Z - ZC) / R)               # about -55.5 deg
PHI1 = math.pi - PHI0

RAIL_PROFILE = [(-0.065, -0.14), (0.065, -0.14), (0.065, -0.115), (0.0175, -0.10), (0.0175, -0.03), (0.035, -0.03), (0.035, 0.0),
                (-0.035, 0.0), (-0.035, -0.03), (-0.0175, -0.03), (-0.0175, -0.10), (-0.065, -0.115)]

def add_track(m, cx, y0, y1, pads=(0.0,), conductor=True):
    """Running rails (4 ft gauge), baseplates and two conductor rails around track centred at x=cx."""
    for sg in (-1, 1):
        prof = [(cx + sg * RAIL_C + x, z) for x, z in RAIL_PROFILE]
        m.prism_y(prof, y0, y1, 'rail_steel')
    for py in pads:
        for sg in (-1, 1):
            m.box((cx + sg * RAIL_C, py, FLOOR_Z + 0.02), (0.24, 0.22, 0.04), 'steel_dark')
        m.box((cx, py, FLOOR_Z + 0.01), (1.9, 0.25, 0.02), 'sleeper')
    if conductor:
        for sg in (-1, 1):
            xx = cx + sg * 0.92
            m.prism_y([(xx - 0.04, 0.0), (xx + 0.04, 0.0), (xx + 0.04, 0.12), (xx - 0.04, 0.12)], y0, y1, 'conductor_rail')
            for py in pads:
                m.box((xx, py, FLOOR_Z + 0.12), (0.10, 0.12, 0.24), 'plastic_black')   # insulator pedestal

def ring_shell(m, y0, y1, lining, ribs=True):
    pts = arc(R, PHI0, PHI1, 56)
    m.strip_y(pts, y0, y1, lining, toward=(0.0, ZC), uv=(1.0, 1.0))
    # floor slab (flat top) and invert
    m.quad((-R * math.cos(PHI0), y0, FLOOR_Z), (R * math.cos(PHI0), y0, FLOOR_Z), (R * math.cos(PHI0), y1, FLOOR_Z), (-R * math.cos(PHI0), y1, FLOOR_Z), 'concrete_dark')
    if ribs:
        # circumferential flange at the y0 end (inward 0.05)
        inner = arc(R - 0.05, PHI0, PHI1, 56); outer = pts
        m.strip_y(inner, y0, y0 + 0.03, 'cast_iron', toward=(0.0, ZC))
        for i in range(len(inner) - 1):
            m.quad((inner[i][0], y0 + 0.03, inner[i][1]), (inner[i + 1][0], y0 + 0.03, inner[i + 1][1]),
                   (outer[i + 1][0], y0 + 0.03, outer[i + 1][1]), (outer[i][0], y0 + 0.03, outer[i][1]), 'cast_iron')
        # longitudinal bolted joints, 9 per ring
        for k in range(9):
            ph = PHI0 + (PHI1 - PHI0) * (k + 0.5) / 9
            cx = (R - 0.025) * math.cos(ph); cz = ZC + (R - 0.025) * math.sin(ph)
            m.box((cx, (y0 + y1) / 2, cz), (0.035, y1 - y0 - 0.04, 0.05), 'cast_iron', rot=(0, math.pi / 2 - ph, 0))
            # bolt heads
            for by in (-0.2, 0.2):
                bx = (R - 0.045) * math.cos(ph); bz = ZC + (R - 0.045) * math.sin(ph)
                m.box((bx, (y0 + y1) / 2 + by, bz), (0.04, 0.03, 0.03), 'steel_dark', rot=(0, math.pi / 2 - ph, 0))

def services(m, y0, y1, lamp):
    ym = (y0 + y1) / 2; L = y1 - y0
    # left wall: cable tray with cables
    m.box((-1.50, ym, 1.02), (0.30, L, 0.025), 'steel_dark')
    m.box((-1.64, ym, 1.07), (0.02, L, 0.08), 'steel_dark'); m.box((-1.36, ym, 1.07), (0.02, L, 0.08), 'steel_dark')
    for i, xx in enumerate((-1.58, -1.52, -1.46, -1.40)):
        m.cyl((xx, ym, 1.07), 0.022, L, ('plastic_black', 'rubber_black', 'plastic_black', 'plastic_grey')[i], axis='y', seg=6)
    for by in (-0.2, 0.2):
        m.box((-1.62, ym + by, 0.98), (0.1, 0.03, 0.12), 'steel_dark')
    # right wall: pipe + small tray
    m.cyl((1.55, ym, 0.95), 0.05, L, 'steel_dark', axis='y', seg=8)
    m.box((1.43, ym, 1.85), (0.22, L, 0.02), 'steel_dark')
    m.cyl((1.40, ym, 1.88), 0.018, L, 'plastic_black', axis='y', seg=6)
    m.cyl((1.46, ym, 1.88), 0.018, L, 'rubber_black', axis='y', seg=6)
    if lamp:
        m.box((1.50, ym, 2.15), (0.07, 0.34, 0.07), 'steel_dark')
        m.box((1.45, ym, 2.15), (0.05, 0.28, 0.05), 'lamp_warm')

def build_ring(lining, lamp):
    m = M(); y0, y1 = -RING / 2, RING / 2
    ring_shell(m, y0, y1, lining)
    add_track(m, 0.0, y0, y1)
    services(m, y0, y1, lamp)
    return m

def build_segment():
    reset()
    root = group('tunnel_segment_root')
    specs = [('seg_plain', 'ring_concrete', False, 0.0), ('seg_lamp', 'ring_concrete', True, 0.0),
             ('seg_iron', 'ring_iron', False, 0.0), ('seg_iron_lamp', 'ring_iron', True, 0.0)]
    for name, lining, lamp, _ in specs:
        o = build_ring(lining, lamp).to_obj(name, parent=root)
    # tunnel MOUTH: concrete ring + dark brick header collar (3 courses) around the bore at the +Z... (Blender -Y) end; rotate 180 deg about Y for the other end
    mm = build_ring('ring_concrete', False); y0 = -RING / 2
    o1 = arc(R, PHI0, PHI1, 56); o2 = arc(R + 0.45, PHI0, PHI1, 56)
    for i in range(56):
        f = mm.quad((o1[i][0], y0, o1[i][1]), (o1[i + 1][0], y0, o1[i + 1][1]), (o2[i + 1][0], y0, o2[i + 1][1]), (o2[i][0], y0, o2[i][1]), 'brick_dark')
    mm.box((0, y0 + 0.0, -0.20), (2 * (R + 0.45) * math.cos(PHI0) + 0.4, 0.0001, 0.0001), 'brick_dark')
    mm.to_obj('seg_mouth', parent=root)
    # anchor empties for runtime point lights (relative to ring centre)
    empty('light_anchor', loc=(1.40, 0.0, 2.1), parent=root)
    return root

# ------------------------------------------------------------------ station vault
def vault_profile(half, spring, crown, n=40):
    """Elliptical arch: returns [(x,z)] from left wall base over the crown to right wall base."""
    pts = [(-half, FLOOR_Z), (-half, spring)]
    b = crown - spring
    for i in range(1, n):
        t = math.pi - math.pi * i / n
        pts.append((half * math.cos(t), spring + b * math.sin(t)))
    pts += [(half, spring), (half, FLOOR_Z)]
    return pts

def build_vault(kind, rib=False, endcap=False):
    m = M(); y0, y1 = -VL / 2, VL / 2
    if kind == 'island':
        half, tracks, pw = 5.25, (-3.25, 3.25), 2.0     # platform half-width 2.0 (4.0 m island)
    else:
        half, tracks, pw = 5.9, (-1.95, 1.95), None
    spring, crown = 2.3, 5.0
    prof = vault_profile(half, spring, crown)
    # wall tile (to z=2.3 cream with orange band), arch painted
    if not endcap:
        wall = [(-half, FLOOR_Z), (-half, 2.3)]
        m.strip_y(wall, y0, y1, 'tile_cream', toward=(0.0, 1.5)); m.strip_y([(half, 2.3), (half, FLOOR_Z)], y0, y1, 'tile_cream', toward=(0.0, 1.5))
        m.strip_y(prof[1:-1], y0, y1, 'panel_ceiling', toward=(0.0, 1.5))
        # orange tile band along walls
        for sg in (-1, 1):
            m.box((sg * (half - 0.01), 0, 1.45), (0.03, VL, 0.30), 'tile_orange')
            m.box((sg * (half - 0.01), 0, 2.2), (0.03, VL, 0.10), 'tile_brown')
        # floor
        m.quad((-half, y0, FLOOR_Z), (half, y0, FLOOR_Z), (half, y1, FLOOR_Z), (-half, y1, FLOOR_Z), 'concrete_dark')
        # tracks
        for tx in tracks:
            add_track(m, tx, y0, y1, pads=(-0.4, 0.4))
        # platform(s)
        if kind == 'island':
            m.bbox((-pw, y0, FLOOR_Z), (pw, y1, 0.695 - 0.02), 'platform_stone')
            m.bbox((-pw + 0.02, y0, 0.675), (pw - 0.02, y1, 0.695), 'platform_floor')
            for sg in (-1, 1):
                m.bbox((sg * (pw - 0.12) - 0.06, y0, 0.695), (sg * (pw - 0.12) + 0.06, y1, 0.705), 'edge_white')
                m.bbox((min(sg * 1.45, sg * 1.83), y0, 0.695), (max(sg * 1.45, sg * 1.83), y1, 0.710), 'tactile_yellow')
                # tiled platform face
                m.quad((sg * pw, y0, FLOOR_Z), (sg * pw, y1, FLOOR_Z), (sg * pw, y1, 0.675), (sg * pw, y0, 0.675), 'tile_white')
        else:
            for sg in (-1, 1):
                x0 = sg * 3.25; x1 = sg * half
                m.bbox((min(x0, x1), y0, FLOOR_Z), (max(x0, x1), y1, 0.675), 'platform_stone')
                m.bbox((min(x0, x1), y0, 0.675), (max(x0, x1), y1, 0.695), 'platform_floor')
                m.bbox((min(sg * 3.2, sg * 3.32), y0, 0.695), (max(sg * 3.2, sg * 3.32), y1, 0.705), 'edge_white')
                m.bbox((min(sg * 3.4, sg * 3.8), y0, 0.695), (max(sg * 3.4, sg * 3.8), y1, 0.710), 'tactile_yellow')
        # ceiling light fittings
        lx = (-1.6, 1.6, -3.9, 3.9) if kind == 'island' else (-3.9, 3.9, -2.0, 2.0)
        for xx in lx[:2] if kind == 'island' else lx[:2]:
            m.box((xx, 0, 3.75 if kind == 'island' else 3.8), (0.22, 0.95, 0.07), 'strip_light')
            m.box((xx, 0, 3.84), (0.30, 1.0, 0.05), 'steel_dark') if False else None
        if rib:
            # structural arch rib band (cast-iron look) proud of the ceiling
            rb = [(x * 0.995, z - 0.06) for x, z in prof[1:-1]]
            m.strip_y(rb, -0.12, 0.12, 'cast_iron', toward=(0.0, 1.5))
            outer = prof[1:-1]
            for i in range(len(rb) - 1):
                for yy in (-0.12, 0.12):
                    m.quad((rb[i][0], yy, rb[i][1]), (rb[i + 1][0], yy, rb[i + 1][1]), (outer[i + 1][0], yy, outer[i + 1][1]), (outer[i][0], yy, outer[i][1]), 'cast_iron')
    elif endcap == 'open':
        # OPEN tunnel mouth: only a 0.3 m structural frame around the vault profile + a central pier between the two tracks.
        inner = vault_profile(half - 0.3, spring - 0.0, crown - 0.3)
        for yy, n in ((-0.2, 1), (0.2, -1)):
            for i in range(len(prof) - 1):
                if i == 0 or i == len(prof) - 2: pass
                f = m.quad((prof[i][0], yy, prof[i][1]), (prof[i + 1][0], yy, prof[i + 1][1]), (inner[i + 1][0], yy, inner[i + 1][1]), (inner[i][0], yy, inner[i][1]), 'concrete_lining')
                if f.normal.y * n < 0: f.normal_flip()
                f[m.fx] = 1
        m.strip_y(inner[1:-1], -0.2, 0.2, 'concrete_dark', toward=(0.0, 1.5))
        pier = 1.35 if kind == 'island' else 0.6
        # island: the escalator/stair ramp leaves through the centre of the pier, so only a lintel above the 2.7 m opening remains
        m.bbox((-pier, -0.2, 0.695 + 2.72 if kind == 'island' else FLOOR_Z), (pier, 0.2, 4.9), 'tile_cream')
        m.quad((-half, -0.2, FLOOR_Z), (half, -0.2, FLOOR_Z), (half, 0.2, FLOOR_Z), (-half, 0.2, FLOOR_Z), 'concrete_dark')
        if kind == 'island':
            m.bbox((-pw, -0.2, FLOOR_Z), (pw, 0.2, 0.695 - 0.02), 'platform_stone')
            m.bbox((-pw + 0.02, -0.2, 0.675), (pw - 0.02, 0.2, 0.695), 'platform_floor')
    elif endcap == 'bore':
        # BORE WALL (optional): wall across the vault at y=0 with circular bore openings; only valid if the tracks are exactly at the documented x offsets
        import bmesh as bm_
        bm = m.bm
        outline = [bm.verts.new((x, 0.0, z)) for x, z in prof]
        edges = [bm.edges.new((outline[i], outline[(i + 1) % len(outline)])) for i in range(len(outline))]
        holes = []
        for tx in tracks:
            hv = [bm.verts.new((tx + R * math.cos(2 * math.pi * i / 36), 0.0, ZC + R * math.sin(2 * math.pi * i / 36))) for i in range(36)]
            holes.append(hv)
            edges += [bm.edges.new((hv[i], hv[(i + 1) % 36])) for i in range(36)]
        res = bm_.ops.triangle_fill(bm, use_beauty=True, edges=edges)
        for f in res['geom']:
            if isinstance(f, bm_.types.BMFace): f.material_index = m._mi('tile_cream')
        # bore lining reveal (short tunnel stub 0.3 m) and track
        for tx in tracks:
            pts = arc(R, 0, 2 * math.pi, 36, cx=tx)
            m.strip_y(pts, 0.0, 0.3, 'concrete_lining', toward=(tx, ZC))
        # platform end ramp is placed by station kit; add end floor
        m.quad((-half, 0, FLOOR_Z), (half, 0, FLOOR_Z), (half, VL, FLOOR_Z), (-half, VL, FLOOR_Z), 'concrete_dark')
    return m

def build_station_vault():
    reset()
    root = group('station_vault_root')
    build_vault('island').to_obj('vault_island', parent=root)
    build_vault('island', rib=True).to_obj('vault_island_rib', parent=root)
    build_vault('side').to_obj('vault_side', parent=root)
    build_vault('side', rib=True).to_obj('vault_side_rib', parent=root)
    build_vault('island', endcap='open').to_obj('vault_island_end', parent=root)
    build_vault('side', endcap='open').to_obj('vault_side_end', parent=root)
    build_vault('island', endcap='bore').to_obj('vault_island_borewall', parent=root)
    build_vault('side', endcap='bore').to_obj('vault_side_borewall', parent=root)
    # anchor empties for platform lights
    return root

if __name__ == '__main__':
    build_segment(); export('tunnel_segment.glb')
    build_station_vault(); export('tunnel_station_vault.glb')
