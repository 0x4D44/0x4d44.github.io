"""Builds models/entrance_kiosk.glb, portal_depot.glb, people.glb."""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *
from assets_station import signboard, roundel

# ---------------------------------------------------------------- entrance kiosk
def build_kiosk():
    reset()
    root = group('entrance_kiosk')
    m = M()    # pavement slab 8 x 6, top at z=0, centred
    m.box((0, 0, -0.1), (8.0, 6.0, 0.2), 'platform_stone')
    m.box((0, -2.4, 0.0), (8.0, 0.02, 0.02), 'platform_floor') if False else None
    m.to_obj('pavement', parent=root)
    # ---- shelter: frame, glass, roof (open at the +Y stair side)
    m = M(); W_, D_, H_ = 5.0, 3.0, 3.0; cy = -1.0
    for sx in (-1, 1):
        for yy in (cy - D_ / 2 + 0.1, cy + D_ / 2 - 0.1):
            m.box((sx * (W_ / 2 - 0.1), yy, H_ / 2), (0.14, 0.14, H_), 'subway_orange')       # posts
    m.box((0, cy, H_ + 0.12), (W_ + 0.7, D_ + 0.7, 0.24), 'subway_orange')                     # flat roof / fascia
    m.box((0, cy, H_ + 0.26), (W_ + 0.5, D_ + 0.5, 0.04), 'roof_metal')
    m.box((0, cy - D_ / 2 + 0.1, 0.12), (W_, 0.14, 0.24), 'subway_orange')                     # kick rail back
    m.to_obj('shelter_frame', parent=root)
    m = M()
    m.box((0, cy - D_ / 2 + 0.1, 1.55), (W_ - 0.2, 0.03, 2.5), 'glass_clear')                  # back glass
    for sx in (-1, 1): m.box((sx * (W_ / 2 - 0.1), cy, 1.55), (0.03, D_ - 0.2, 2.5), 'glass_clear')   # side glass
    m.to_obj('shelter_glass', parent=root)
    m = M()    # lit fascia sign: blank faces front (+Y) with roundel
    yb = cy + D_ / 2 + 0.2
    m.box((0, yb - 0.03, H_ + 0.62), (3.3, 0.06, 0.64), 'steel_dark')
    m.quad_uv((-1.62, yb + 0.002, H_ + 0.32), (1.62, yb + 0.002, H_ + 0.32), (1.62, yb + 0.002, H_ + 0.92), (-1.62, yb + 0.002, H_ + 0.92), 'sign_name_board')
    m.to_obj('sign_fascia', parent=root)
    # ---- free standing roundel pylon (SPT roundel) 4.5 m
    m = M(); px, py = 3.3, 1.2
    m.box((px, py, 2.0), (0.22, 0.22, 4.0), 'steel_dark')
    m.cyl((px, py, 4.35), 0.5, 0.14, 'sign_orange', axis='y', seg=32)
    roundel(m, (px, py + 0.07, 4.35), 0.5)
    roundel(m, (px, py - 0.07, 4.35), 0.5)
    m.box((px, py, 3.6), (0.8, 0.12, 0.3), 'sign_orange')
    m.quad_uv((px - 0.38, py + 0.065, 3.46), (px + 0.38, py + 0.065, 3.46), (px + 0.38, py + 0.065, 3.74), (px - 0.38, py + 0.065, 3.74), 'sign_name_board')
    m.to_obj('pylon_roundel', parent=root)
    # ---- stair opening : well with steps descending in +Y direction -> toward -Z.  stairs run along y from 0.6 to 3.2, down to -2.4
    m = M(); n = 14; rise = 2.4 / n; tread = 0.28; x0 = 0.0
    y_start = 0.2
    # kerb/hole edge
    m.box((-1.15, y_start + 1.9, 0.04), (0.3, 4.0, 0.08), 'tile_cream'); m.box((1.15, y_start + 1.9, 0.04), (0.3, 4.0, 0.08), 'tile_cream')
    for i in range(n):
        m.box((0, y_start + tread * i + tread / 2, -rise * (i + 1) - 0.02), (2.0, tread, 0.04), 'platform_floor')
        m.box((0, y_start + tread * i, -rise * i - rise / 2), (2.0, 0.02, rise), 'platform_stone')
    for sx in (-1, 1):
        m.prism_x([(y_start, 0.0), (y_start + tread * n, -2.4), (y_start + tread * n, -2.4 - 0.1), (y_start, -0.1)], sx * 1.05 - 0.05, sx * 1.05 + 0.05, 'tile_cream') if False else None
        m.box((sx * 1.05, y_start + 1.9, -1.2), (0.1, 4.0, 2.4), 'tile_cream')
        m.prism_x([(y_start, 0.9), (y_start + tread * n, -1.5), (y_start + tread * n, -1.48), (y_start, 0.92)], sx * 0.98 - 0.03, sx * 0.98 + 0.03, 'steel_bright')
        for yy in (y_start, y_start + 1.9, y_start + tread * n - 0.05):
            m.cyl((sx * 0.98, yy, 0.45 - (yy - y_start) * (2.4 / (tread * n)) * 1.0), 0.015, 0.9, 'steel_bright', seg=6) if False else None
    m.box((0, y_start + tread * n + 0.25, -2.45), (2.0, 0.5, 0.1), 'platform_floor')
    m.box((0, y_start + tread * n + 0.5, -1.25), (2.2, 0.1, 2.5), 'tile_cream')    # back wall of well
    m.to_obj('stair_well', parent=root)
    m = M()   # handrail posts + barriers at stair opening
    for sx in (-1, 1): m.box((sx * 1.12, 2.1, 0.5), (0.03, 3.8, 0.03), 'steel_bright')
    m.to_obj('stair_barrier', parent=root)
    empty('stair_bottom', loc=(0, y_start + tread * n + 0.4, -2.4), parent=root)
    empty('stair_top', loc=(0, y_start - 0.2, 0.0), parent=root)
    empty('light_anchor', loc=(0, cy, H_ - 0.2), parent=root)
    return root

# ---------------------------------------------------------------- portal + depot
def build_portal():
    reset()
    root = group('portal_depot')
    RISE = 2.6; RAMP = 40.0; YARD = RISE
    # ground-level ramp: track climbs from portal (y=0, z=0) to yard (y=RAMP, z=RISE); +Y leads out of the tunnel
    m = M()
    # ramp bed
    m.prism_x([(0, -0.3), (RAMP, RISE - 0.3), (RAMP, RISE), (0, 0.0)], -3.2, 3.2, 'concrete_dark')
    # retaining walls tapering
    for sx in (-1, 1):
        m.prism_x([(0, 0.0), (RAMP, RISE), (RAMP, RISE + 0.9), (0, 5.0)], sx * 3.2 - 0.18 + (0 if sx > 0 else 0), sx * 3.2 + 0.18, 'concrete_lining')
        m.prism_x([(0, 5.0), (RAMP, RISE + 0.9), (RAMP, RISE + 1.05), (0, 5.15)], sx * 3.2 - 0.28, sx * 3.2 + 0.28, 'concrete_dark')   # coping
    # portal face wall at y=0 : brick with horseshoe opening
    import bmesh as bm_
    bm = m.bm
    hw = 4.5; top = 7.0
    outline = [bm.verts.new((x, 0.0, z)) for x, z in [(-hw, -0.3), (hw, -0.3), (hw, top), (-hw, top)]]
    edges = [bm.edges.new((outline[i], outline[(i + 1) % 4])) for i in range(4)]
    hv = [bm.verts.new((1.9 * math.cos(math.pi * i / 24 - 0.0) if i <= 24 else 0, 0.0, 0.0)) for i in range(0)]
    pts = [(1.9, -0.3)] + [(1.9 * math.cos(math.pi * i / 24), 1.9 * math.sin(math.pi * i / 24) + 1.5) for i in range(25)] + [(-1.9, -0.3)]
    hv = [bm.verts.new((x, 0.0, z)) for x, z in pts]
    edges += [bm.edges.new((hv[i], hv[(i + 1) % len(hv)])) for i in range(len(hv))]
    res = bm_.ops.triangle_fill(bm, use_beauty=True, edges=edges)
    for f in res['geom']:
        if isinstance(f, bm_.types.BMFace): f.material_index = m._mi('brick_red')
    # tunnel lining stub going into the hill (-Y)
    arcp = [(1.675 * math.cos(math.pi * i / 36 * 2 - math.pi / 2 + math.pi * 0.0), 1.2 + 1.675 * math.sin(math.pi * i / 36 * 2 - math.pi / 2)) for i in range(37)]
    m.strip_y([(1.675 * math.cos(math.radians(a)), 1.2 + 1.675 * math.sin(math.radians(a))) for a in range(-55, 236, 6)], -12.0, 0.0, 'concrete_lining')
    m.quad((-0.95, -12, -0.18), (0.95, -12, -0.18), (0.95, 0, -0.18), (-0.95, 0, -0.18), 'concrete_dark')
    m.to_obj('portal_cutting', parent=root)
    # track on ramp : two rails + sleepers
    m = M(); from assets_tunnel import RAIL_PROFILE
    ang = math.atan2(RISE, RAMP)
    # build per-sleeper boxes to follow ramp, rails as sloped prisms in (y,z) along the incline
    L = math.hypot(RAMP, RISE)
    for sg in (-1, 1):
        xc = sg * 0.645
        m.prism_x([(0, 0.0), (RAMP, RISE), (RAMP, RISE + 0.0 - 0.15), (0, -0.15)] if False else [(0, -0.0), (RAMP, RISE), (RAMP, RISE - 0.14), (0, -0.14)], xc - 0.035, xc + 0.035, 'rail_steel')
    for i in range(0, int(RAMP / 0.7)):
        y = i * 0.7; z = y * RISE / RAMP
        m.box((0, y, z - 0.19), (2.3, 0.22, 0.12), 'sleeper', rot=(-ang, 0, 0))
    m.to_obj('portal_track', parent=root)
    # ---- depot: yard slab + shed  (shed at y = RAMP+8 .. RAMP+8+60)
    m = M()
    m.box((0, RAMP + 40, RISE - 0.15), (40.0, 100.0, 0.3), 'asphalt')
    m.to_obj('depot_yard', parent=root)
    SY0 = RAMP + 10; SL = 60.0; SW = 20.0; EH = 7.0; RH = 9.5
    m = M()
    m.box((-SW / 2, SY0 + SL / 2, RISE + EH / 2), (0.3, SL, EH), 'brick_red'); m.box((SW / 2, SY0 + SL / 2, RISE + EH / 2), (0.3, SL, EH), 'brick_red')
    m.box((0, SY0 + SL, RISE + EH / 2), (SW, 0.3, EH), 'brick_red')
    # front (south) wall with 2 large door openings (track entries) - built from pieces
    for (xa, xb) in ((-SW / 2, -6.5), (-1.5, 1.5), (6.5, SW / 2)):
        m.bbox((xa, SY0 - 0.15, RISE), (xb, SY0 + 0.15, RISE + EH), 'brick_red')
    for xc in (-4.0, 4.0):
        m.bbox((xc - 2.5, SY0 - 0.15, RISE + 5.0), (xc + 2.5, SY0 + 0.15, RISE + EH), 'brick_red')
        m.box((xc, SY0 - 0.2, RISE + 5.05), (5.2, 0.1, 0.12), 'steel_dark')
    m.to_obj('depot_walls', parent=root)
    m = M()
    # pitched roof (prism along Y)
    m.prism_x([(SY0 - 0.6, RISE + EH), (SY0 + SL + 0.6, RISE + EH), (SY0 + SL + 0.6, RISE + EH + 0.0), (SY0 - 0.6, RISE + EH)], 0, 0, 'roof_metal') if False else None
    prof = [(-SW / 2 - 0.6, RISE + EH - 0.2), (0, RISE + RH), (SW / 2 + 0.6, RISE + EH - 0.2), (SW / 2 + 0.6, RISE + EH - 0.35), (0, RISE + RH - 0.15), (-SW / 2 - 0.6, RISE + EH - 0.35)]
    m.prism_y(prof, SY0 - 0.6, SY0 + SL + 0.6, 'roof_metal')
    for k in range(1, 6):    # rooflights
        m.box((-SW / 4, SY0 + k * 10, RISE + EH + 0.9), (6.0, 1.2, 0.05), 'glass_clear', rot=(0, math.atan2(RH - EH, SW / 2), 0))
    m.to_obj('depot_roof', parent=root)
    # internal tracks and pits
    m = M()
    for xc in (-4.0, 4.0):
        for sg in (-1, 1):
            m.bbox((xc + sg * 0.645 - 0.035, SY0 - 12, RISE - 0.14), (xc + sg * 0.645 + 0.035, SY0 + SL - 2, RISE), 'rail_steel')
        for i in range(0, 90):
            m.box((xc, SY0 - 12 + i * 0.8, RISE - 0.17), (2.3, 0.2, 0.1), 'sleeper')
        m.box((xc, SY0 + SL / 2 + 5, RISE - 0.3), (1.0, 40.0, 0.2), 'concrete_dark') if False else None
    m.to_obj('depot_tracks', parent=root)
    # branch tracks in yard from the ramp to the two doors (simple straight lead): hint only
    m = M()
    m.box((0, SY0 - 0.5, RISE + 3.0), (0.0, 0.0, 0.0), 'steel_dark') if False else None
    for i in range(6):
        m.box((-SW / 2 + 2 + i * 7.2, SY0 + 5, RISE + 0.6), (0.8, 0.8, 1.2), 'steel_dark')
    m.box((0, SY0 + SL + 0.2, RISE + 6.0), (1.6, 0.2, 1.0), 'sign_orange')
    m.quad_uv((-3.5, SY0 - 0.32, RISE + 6.0), (3.5, SY0 - 0.32, RISE + 6.0), (3.5, SY0 - 0.32, RISE + 6.9), (-3.5, SY0 - 0.32, RISE + 6.9), 'sign_name_board')
    m.to_obj('depot_details', parent=root)
    empty('portal_mouth', loc=(0, 0, 0), parent=root, kind='ARROWS', size=1.0)
    empty('depot_entry_L', loc=(-4.0, SY0, RISE), parent=root)
    empty('depot_entry_R', loc=(4.0, SY0, RISE), parent=root)
    return root

# ---------------------------------------------------------------- people
def person(root, idx, height, shirt, trousers, skin, hair, seated=False, wide=1.0):
    m = M(); s = height / 1.75
    if not seated:
        for sx in (-1, 1):
            m.cyl((sx * 0.09 * wide, 0, 0.45 * s), 0.065 * wide, 0.90 * s, trousers, seg=8)
            m.box((sx * 0.09 * wide, 0.05, 0.04), (0.10, 0.26, 0.08), 'plastic_black')
        m.box((0, 0, 1.18 * s), (0.36 * wide, 0.20, 0.58 * s), shirt)
        for sx in (-1, 1):
            m.cyl((sx * 0.235 * wide, 0, 1.2 * s), 0.05 * wide, 0.55 * s, shirt, seg=8)
            m.sphere((sx * 0.235 * wide, 0, 0.9 * s), 0.05, skin, seg=6)
        m.cyl((0, 0, 1.52 * s), 0.05, 0.1, skin, seg=8)
        m.sphere((0, 0, 1.64 * s), 0.11, skin, sz=1.2, seg=10); m.sphere((0, -0.015, 1.68 * s), 0.115, hair, sz=1.05, seg=10)
    else:
        for sx in (-1, 1):
            m.box((sx * 0.09 * wide, 0.22, 0.50), (0.12, 0.45, 0.12), trousers)           # thighs forward
            m.cyl((sx * 0.09 * wide, 0.43, 0.24), 0.055, 0.48, trousers, seg=8)            # shins
            m.box((sx * 0.09 * wide, 0.48, 0.04), (0.10, 0.26, 0.08), 'plastic_black')
        m.box((0, 0, 0.82), (0.36 * wide, 0.20, 0.55 * s), shirt)
        for sx in (-1, 1):
            m.cyl((sx * 0.235 * wide, 0.0, 0.83), 0.05, 0.5, shirt, seg=8)
            m.box((sx * 0.235 * wide, 0.12, 0.60), (0.09, 0.25, 0.09), shirt)
        m.cyl((0, 0, 1.14), 0.05, 0.1, skin, seg=8)
        m.sphere((0, 0, 1.27), 0.11, skin, sz=1.2, seg=10); m.sphere((0, -0.015, 1.31), 0.115, hair, sz=1.05, seg=10)
    return m.to_obj(f'person_sit_{idx}' if seated else f'person_{idx}', parent=root)

def build_people():
    reset()
    root = group('people')
    person(root, 0, 1.78, 'cloth_navy', 'cloth_grey', 'skin_a', 'hair_dark')
    person(root, 1, 1.62, 'cloth_red', 'cloth_black', 'skin_b', 'hair_dark', wide=0.92)
    person(root, 2, 1.70, 'cloth_green', 'cloth_tan', 'skin_c', 'hair_blond')
    person(root, 3, 1.84, 'hivis', 'cloth_navy', 'skin_a', 'hair_grey', wide=1.1)     # staff in hi-vis
    person(root, 4, 1.45, 'cloth_white', 'cloth_navy', 'skin_c', 'hair_dark', wide=0.85)  # child-sized
    person(root, 0, 1.75, 'cloth_tan', 'cloth_navy', 'skin_b', 'hair_dark', seated=True)
    person(root, 1, 1.68, 'cloth_green', 'cloth_black', 'skin_a', 'hair_grey', seated=True)
    return root

if __name__ == '__main__':
    build_kiosk(); export('entrance_kiosk.glb')
    build_portal(); export('portal_depot.glb')
    build_people(); export('people.glb')
