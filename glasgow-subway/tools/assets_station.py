"""Builds models/station_kit.glb: modular station parts.  Every item is a direct child of the `station_kit` group,
at the origin (identity transform) - clone by name and place.  Item origin = centre of footprint at the floor it stands on
(unless noted in MODELS.md).  Blender: +Y = item 'front'/ascending direction; glTF: that is -Z."""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

PLAT_H = 0.695

def item(root, name, m, **kw):
    return m.to_obj(name, parent=root, **kw)

def signboard(m, c, w, h, face_mat, frame_mat='sign_orange', thick=0.04, double=True, yaw_front=True, rect=(0.0, 0.0, 1.0, 1.0)):
    """Flat board centred c (x,y,z) facing +/-Y with blank-UV faces on both sides."""
    x, y, z = c
    m.box(c, (w, thick, h), frame_mat)
    f = thick / 2 + 0.002
    m.quad_uv((x - w / 2 + 0.03, y + f, z - h / 2 + 0.03), (x + w / 2 - 0.03, y + f, z - h / 2 + 0.03),
             (x + w / 2 - 0.03, y + f, z + h / 2 - 0.03), (x - w / 2 + 0.03, y + f, z + h / 2 - 0.03), face_mat, rect)
    if double:
        m.quad_uv((x + w / 2 - 0.03, y - f, z - h / 2 + 0.03), (x - w / 2 + 0.03, y - f, z - h / 2 + 0.03),
                 (x - w / 2 + 0.03, y - f, z + h / 2 - 0.03), (x + w / 2 - 0.03, y - f, z + h / 2 - 0.03), face_mat, rect)

def roundel(m, c, r, axis_y_dir=1):
    """Textured SPT roundel (alpha PNG) as a flat quad facing +Y (back side too)."""
    x, y, z = c
    m.quad_uv((x - r, y + 0.012, z - r), (x + r, y + 0.012, z - r), (x + r, y + 0.012, z + r), (x - r, y + 0.012, z + r), 'sign_roundel')
    m.quad_uv((x + r, y - 0.012, z - r), (x - r, y - 0.012, z - r), (x - r, y - 0.012, z + r), (x + r, y - 0.012, z + r), 'sign_roundel')

def atlas_rect(i, cols=4, rows=2):
    c, r = i % cols, i // cols
    return (c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows)

def build_kit():
    reset()
    root = group('station_kit')
    # ------------------------------------------------ platform furniture
    m = M()   # bench 2.0 m
    for sx in (-0.85, 0.85):
        m.box((sx, 0, 0.22), (0.05, 0.42, 0.44), 'sign_orange')
    for i in range(5):
        m.box((0, -0.17 + i * 0.085, 0.45), (2.0, 0.07, 0.03), 'wood_bench')
    m.box((0, -0.2, 0.72), (2.0, 0.03, 0.30), 'wood_bench'); m.box((0, -0.19, 0.58), (2.0, 0.03, 0.04), 'sign_orange')
    item(root, 'bench_platform', m)
    m = M()   # litter bin
    m.cyl((0, 0, 0.45), 0.24, 0.9, 'steel_dark', seg=12); m.cyl((0, 0, 0.9), 0.25, 0.04, 'sign_orange', seg=12)
    item(root, 'bin_litter', m)
    m = M()   # hanging station-name blade (3.0 x 0.55) : faces +/-Y.  origin = top centre (hang point)
    m.box((0, 0, -0.1), (3.0, 0.05, 0.05), 'steel_dark') if False else None
    for sx in (-1.2, 1.2):
        m.cyl((sx, 0, 0.3), 0.012, 0.6, 'steel_dark', seg=6)
    signboard(m, (0, 0, -0.275), 3.0, 0.55, 'sign_name_board', 'sign_orange')
    item(root, 'sign_name_hanging', m)
    m = M()   # wall-mounted name board 3.0 x 0.6 with roundel to left; origin = centre, flat against wall (face toward -Y... faces +Y)
    signboard(m, (0, 0, 0), 3.0, 0.6, 'sign_name_board', 'sign_orange', double=False)
    item(root, 'sign_name_wall', m)
    m = M()
    roundel(m, (0, 0, 0), 0.5)
    item(root, 'roundel_wall', m)
    m = M()   # round tiled column  (platform)
    m.cyl((0, 0, 2.3), 0.28, 4.6, 'tile_cream', seg=20); m.cyl((0, 0, 1.3), 0.285, 0.30, 'tile_orange', seg=20)
    m.cyl((0, 0, 0.1), 0.34, 0.2, 'platform_stone', seg=20); m.cyl((0, 0, 4.55), 0.36, 0.1, 'sign_orange', seg=20)
    item(root, 'pillar_round', m)
    m = M()   # square concourse column 0.5 x 0.5 x 3.2
    m.box((0, 0, 1.6), (0.5, 0.5, 3.2), 'tile_cream'); m.box((0, 0, 1.2), (0.52, 0.52, 0.25), 'tile_orange'); m.box((0, 0, 0.06), (0.58, 0.58, 0.12), 'platform_stone')
    item(root, 'pillar_square', m)
    m = M()   # platform lamp (hanging strip) origin top
    m.cyl((0, 0, 0.25), 0.01, 0.5, 'steel_dark', seg=6); m.box((0, 0, -0.03), (0.22, 1.1, 0.07), 'steel_bright'); m.box((0, 0, -0.07), (0.18, 1.0, 0.02), 'strip_light')
    item(root, 'lamp_platform_strip', m)
    m = M()   # CCTV camera: wall bracket, origin at wall plate, looks +Y
    m.box((0, -0.01, 0), (0.1, 0.02, 0.1), 'steel_dark'); m.box((0, 0.1, 0), (0.1, 0.25, 0.1), 'plastic_grey'); m.cyl((0, 0.24, 0), 0.04, 0.03, 'plastic_black', axis='y', seg=10)
    item(root, 'cctv_camera', m)
    m = M()   # platform clock 0.6 diam, faces +Y
    m.cyl((0, 0, 0), 0.30, 0.08, 'steel_dark', axis='y', seg=24); m.cyl((0, 0.045, 0), 0.27, 0.01, 'sign_white', axis='y', seg=24)
    m.box((0, 0.06, 0.1), (0.015, 0.01, 0.2), 'plastic_black'); m.box((0.07, 0.06, 0.0), (0.14, 0.01, 0.012), 'plastic_black')
    item(root, 'clock_platform', m)
    m = M()   # passenger information screen 1.0 x 0.3, faces +Y, origin centre
    m.box((0, 0, 0), (1.05, 0.06, 0.34), 'plastic_black')
    m.quad_uv((-0.5, 0.032, -0.15), (0.5, 0.032, -0.15), (0.5, 0.032, 0.15), (-0.5, 0.032, 0.15), 'screen_blank')
    item(root, 'info_screen', m)
    # ------------------------------------------------ safety signs  (0.45 x 0.30, faces +Y)
    for nm, cell in (('exit', 0), ('no_smoking', 1), ('mind_gap', 2), ('danger_electric', 3), ('emergency_stop', 7), ('help_point', 4),
                     ('cctv', 5), ('first_aid', 6), ('way_out', 0), ('stand_back', 7)):
        m = M(); signboard(m, (0, 0, 0), 0.45, 0.45, 'sign_safety', 'steel_dark', thick=0.025, double=False, rect=atlas_rect(cell))
        item(root, f'safety_{nm}', m)
    # advert panels (0.9 x 1.3 poster frames, portrait; atlas cell 4x4)
    for nm, cell in (('a', 0), ('b', 5), ('c', 10), ('d', 15), ('e', 3), ('f', 12)):
        m = M(); signboard(m, (0, 0, 0), 0.9, 1.3, 'advert_atlas', 'steel_dark', thick=0.04, double=False, rect=atlas_rect(cell, 4, 4))
        item(root, f'advert_panel_{nm}', m)
    m = M(); signboard(m, (0, 0, 0), 1.6, 0.2, 'route_map_panel', 'steel_dark', thick=0.02, double=False)
    item(root, 'sign_route_map', m)
    m = M()   # floor 'MIND THE GAP' strip decal 4 x 0.3
    m.quad_uv((-2, -0.15, 0.001), (2, -0.15, 0.001), (2, 0.15, 0.001), (-2, 0.15, 0.001), 'sign_yellow')
    item(root, 'decal_mind_gap_floor', m, uv=True)
    # ------------------------------------------------ trackside
    m = M()   # signal head on post: origin at base; lights on +Y face
    m.cyl((0, 0, 1.0), 0.04, 2.0, 'steel_dark', seg=8); m.box((0, 0.05, 2.1), (0.30, 0.12, 0.85), 'plastic_black')
    for z, mm in ((2.38, 'button_red'), (2.1, 'button_amber'), (1.82, 'button_green')):
        m.cyl((0, 0.12, z), 0.08, 0.02, mm, axis='y', seg=14)
    item(root, 'signal_head', m)
    m = M()   # buffer stop (at end of track, track centre-line at x=0, faces +Y; origin at buffer face)
    m.box((0, -0.6, -0.1), (1.9, 1.2, 0.2), 'concrete_dark'); m.box((0, -0.15, 0.55), (1.6, 0.3, 0.3), 'sign_red') if False else None
    for sx in (-0.5, 0.5):
        m.cyl((sx, -0.35, 0.45), 0.08, 0.7, 'steel_dark', axis='y', seg=10); m.cyl((sx, 0.0, 0.45), 0.2, 0.04, 'steel_bright', axis='y', seg=14)
    m.box((0, -0.65, 0.45), (1.6, 0.12, 0.28), 'sign_red')
    item(root, 'buffer_stop', m)
    m = M()   # speed restriction sign 0.5 x 0.5 on post
    m.cyl((0, 0, 0.6), 0.02, 1.2, 'steel_dark', seg=6); signboard(m, (0, 0, 1.35), 0.5, 0.5, 'sign_blank', 'sign_red', thick=0.03, double=False)
    item(root, 'sign_speed', m)
    m = M()   # tunnel chainage marker plate 0.3 x 0.2 (wall)
    signboard(m, (0, 0, 0), 0.30, 0.20, 'sign_blank', 'steel_dark', thick=0.02, double=False)
    item(root, 'sign_chainage', m)
    m = M()   # emergency telephone box (wall mounted)
    m.box((0, 0.07, 0.2), (0.28, 0.14, 0.40), 'sign_yellow'); m.box((0, 0.145, 0.25), (0.14, 0.01, 0.2), 'plastic_black'); m.cyl((0, 0.15, 0.1), 0.02, 0.02, 'button_green', axis='y', seg=8)
    item(root, 'emergency_phone', m)
    # ------------------------------------------------ platform end ramp (island or side): platform end slopes down to track-bed level
    m = M()   # origin: centre of top edge of ramp at platform end, slopes toward +Y over 3.2 m, width 4.0 (island width)
    pts = [(-0.0, 0.0), (3.2, -(PLAT_H + 0.18))]
    L = 3.2; H = PLAT_H + 0.18
    m.prism_x([(0, 0.8 - 0.8), (0, -0.18 - 0.8), (L, -0.18 - 0.8), (L, -0.18 - 0.8 + 0.0)] , -2.0, 2.0, 'platform_stone', cap=True) if False else None
    m.prism_x([(0, PLAT_H), (0, -0.18), (L, -0.18)], -2.0, 2.0, 'platform_floor')
    for sx in (-1.9, 1.9):
        m.box((sx, L / 2 + 0.0, 0.0), (0.1, 0.05, 0.05), 'steel_dark') if False else None
        m.prism_x([(0, PLAT_H + 0.9), (0, PLAT_H + 0.86), (L, -0.18 + 0.86), (L, -0.18 + 0.9)], sx - 0.02, sx + 0.02, 'steel_bright')
    m.box((0, 0.0, PLAT_H + 0.02), (4.0, 0.06, 0.04), 'tactile_yellow')
    item(root, 'platform_end_ramp', m)
    # ------------------------------------------------ stairs : flight, rise 2.4, 14 risers, width 2.0.  origin bottom centre, ascends +Y
    m = M(); n = 14; rise = 2.4 / n; tread = 0.28; Wd = 2.0
    for i in range(n):
        m.box((0, tread * i + tread / 2, rise * (i + 1) - 0.02), (Wd, tread, 0.04), 'platform_floor')
        m.box((0, tread * i, rise * i + rise / 2), (Wd, 0.02, rise), 'platform_stone')
        m.box((0, tread * (i + 1) - 0.0 - 0.03, rise * (i + 1) + 0.0 - 0.004), (Wd, 0.04, 0.012), 'tactile_yellow') if i in (0, n - 1) else None
    for sx in (-1, 1):   # side walls (tiled) as sloped prisms + handrails
        m.prism_x([(0, 0), (tread * n, 2.4), (tread * n, 2.4 + 0.12), (0, 0.12)], sx * (Wd / 2 + 0.05) - 0.05, sx * (Wd / 2 + 0.05) + 0.05, 'tile_cream') if False else None
        m.prism_x([(0, 0), (tread * n, 2.4), (tread * n, 2.4 + 1.0), (0, 1.0)], sx * (Wd / 2 + 0.05) - 0.05, sx * (Wd / 2 + 0.05) + 0.05, 'tile_cream')
        m.prism_x([(0, 1.02), (tread * n, 3.42), (tread * n, 3.46), (0, 1.06)], sx * (Wd / 2 + 0.05) - 0.06, sx * (Wd / 2 + 0.05) + 0.06, 'steel_bright')
    m.prism_x([(0, 0.9), (tread * n, 3.3), (tread * n, 3.32), (0, 0.92)], -0.03, 0.03, 'steel_bright')   # centre rail
    for i in range(0, n, 2):
        m.cyl((0, tread * i + 0.1, rise * i + 0.45), 0.014, 0.9, 'steel_bright', seg=6)
    item(root, 'stairs_flight', m)
    # ------------------------------------------------ escalator (30 deg, rise 4.0 m).  origin bottom landing, ascends +Y
    rise_e = 4.0; ang = math.radians(30); run_e = rise_e / math.tan(ang)
    pitch_h = 0.405; pitch_v = pitch_h * math.tan(ang); nst = int(run_e / pitch_h) + 1
    eg = group('escalator_4m', parent=root)
    m = M()   # truss + balustrades + handrails (static)
    L_inc = math.hypot(run_e, rise_e)
    m.prism_x([(0, -0.35), (run_e, rise_e - 0.35), (run_e, rise_e - 0.75), (0, -0.75)], -0.62, 0.62, 'steel_dark')   # truss (approx)
    for sx in (-1, 1):
        m.prism_x([(0, 0.0), (run_e, rise_e), (run_e, rise_e + 0.95), (0, 0.95)], sx * 0.62 - 0.03, sx * 0.62 + 0.03, 'glass_clear', cap=False)
        m.prism_x([(0, 0.0), (run_e, rise_e), (run_e, rise_e + 0.12), (0, 0.12)], sx * 0.62 - 0.05, sx * 0.62 + 0.05, 'steel_bright')
        m.prism_x([(0, 0.95), (run_e, rise_e + 0.95), (run_e, rise_e + 1.0), (0, 1.0)], sx * 0.64 - 0.04, sx * 0.64 + 0.04, 'rubber_black')
    # landings / comb plates
    m.box((0, -0.5, 0.01), (1.3, 1.0, 0.02), 'steel_bright'); m.box((0, run_e + 0.5, rise_e + 0.01), (1.3, 1.0, 0.02), 'steel_bright')
    item(root, 'escalator_static', m, uv=True).parent = eg
    for i in range(nst):
        sm = M()
        sm.box((0, 0, -0.02), (1.0, pitch_h, 0.035), 'escalator_tread')
        sm.box((0, pitch_h / 2 - 0.02, -0.02 - pitch_v / 2), (1.0, 0.02, pitch_v), 'steel_bright')
        for k in range(5):
            sm.box((-0.4 + k * 0.2, 0, 0.0), (0.012, pitch_h * 0.9, 0.012), 'plastic_black')
        sm.to_obj(f'esc_step_{i:02d}', parent=eg, loc=(0, i * pitch_h + pitch_h / 2, (i + 1) * pitch_v))
    # ------------------------------------------------ concourse / ticket hall
    m = M(); m.box((0, 0, -0.025), (2.0, 2.0, 0.05), 'platform_floor'); item(root, 'concourse_floor_2m', m)
    m = M(); m.box((0, 0, -0.025), (2.0, 2.0, 0.05), 'concrete_dark'); item(root, 'concourse_floor_plain_2m', m)
    m = M()   # wall 2 m long x 3.2 m high, 0.15 thick, face to +Y.  origin base centre of the wall's front face
    m.box((0, -0.075, 1.6), (2.0, 0.15, 3.2), 'tile_cream'); m.box((0, 0.002, 1.0), (2.0, 0.01, 0.30), 'tile_orange'); m.box((0, 0.002, 0.08), (2.0, 0.01, 0.16), 'tile_brown')
    item(root, 'concourse_wall_2m', m)
    m = M()   # ceiling panel 2x2 at z=0 (hang at 3.2): origin centre, underside z=0
    m.box((0, 0, 0.02), (2.0, 2.0, 0.04), 'panel_ceiling'); m.box((0, 0, -0.005), (1.2, 0.3, 0.02), 'strip_light')
    item(root, 'concourse_ceiling_2m', m)
    m = M()   # fare gate pair: passage 0.9 wide centred on x=0, runs along Y 1.4 long. origin floor centre
    for sx in (-1, 1):
        m.box((sx * 0.60, 0, 0.5), (0.3, 1.4, 1.0), 'steel_bright'); m.box((sx * 0.60, 0, 1.01), (0.30, 1.4, 0.02), 'plastic_black')
        m.box((sx * 0.60, -0.45, 1.06), (0.2, 0.2, 0.08), 'plastic_black')       # card reader
        m.box((sx * 0.449, 0.0, 0.85), (0.01, 0.35, 0.3), 'glass_clear')        # barrier flap
        m.cyl((sx * 0.60, 0.4, 1.06), 0.03, 0.02, 'button_green', seg=10)
    item(root, 'fare_gate', m)
    m = M()   # ticket machine: cabinet + screen (faces +Y)
    m.box((0, 0, 0.9), (0.75, 0.5, 1.8), 'sign_orange'); m.box((0, 0.26, 1.35), (0.5, 0.02, 0.42), 'plastic_black')
    m.quad_uv((-0.23, 0.272, 1.16), (0.23, 0.272, 1.16), (0.23, 0.272, 1.54), (-0.23, 0.272, 1.54), 'screen_blank')
    m.box((0, 0.27, 1.05), (0.25, 0.03, 0.08), 'plastic_grey'); m.box((0, 0.27, 0.9), (0.30, 0.03, 0.04), 'plastic_black'); m.box((0.0, 0.27, 0.35), (0.35, 0.03, 0.1), 'steel_dark')
    item(root, 'ticket_machine', m)
    m = M()   # information totem 0.8 x 0.12 x 2.0 with 2 blank faces
    m.box((0, 0, 1.0), (0.8, 0.12, 2.0), 'steel_dark')
    m.quad_uv((-0.36, 0.065, 0.3), (0.36, 0.065, 0.3), (0.36, 0.065, 1.9), (-0.36, 0.065, 1.9), 'sign_blank')
    m.quad_uv((0.36, -0.065, 0.3), (-0.36, -0.065, 0.3), (-0.36, -0.065, 1.9), (0.36, -0.065, 1.9), 'sign_blank')
    item(root, 'info_totem', m)
    m = M()   # ticket office counter 2.4 x 0.8 with glass screen
    m.box((0, 0, 0.5), (2.4, 0.8, 1.0), 'sign_orange'); m.box((0, 0, 1.02), (2.5, 0.9, 0.04), 'plastic_black')
    m.box((0, -0.3, 1.45), (2.2, 0.02, 0.8), 'glass_clear')
    item(root, 'ticket_counter', m)
    m = M()   # direction sign overhead 1.6 x 0.4 blank both sides, origin top
    m.cyl((-0.6, 0, 0.2), 0.01, 0.4, 'steel_dark', seg=6); m.cyl((0.6, 0, 0.2), 0.01, 0.4, 'steel_dark', seg=6)
    signboard(m, (0, 0, -0.2), 1.6, 0.4, 'sign_green', 'steel_dark', thick=0.05)
    item(root, 'sign_direction_hanging', m)
    m = M()   # arch frame 3.0 wide x 3.0 high opening (concourse portal) 0.4 deep
    m.box((-1.7, 0, 1.5), (0.4, 0.4, 3.0), 'tile_cream'); m.box((1.7, 0, 1.5), (0.4, 0.4, 3.0), 'tile_cream')
    prof = [(1.5 * math.cos(t), 3.0 + 0.7 * math.sin(t)) for t in [math.pi * i / 16 for i in range(17)]]
    outer = [(1.9 * math.cos(t), 3.0 + 1.1 * math.sin(t)) for t in [math.pi * i / 16 for i in range(17)]]
    for i in range(16):
        m.quad((prof[i][0], -0.2, prof[i][1]), (prof[i + 1][0], -0.2, prof[i + 1][1]), (outer[i + 1][0], -0.2, outer[i + 1][1]), (outer[i][0], -0.2, outer[i][1]), 'tile_cream')
        m.quad((prof[i][0], 0.2, prof[i][1]), (prof[i + 1][0], 0.2, prof[i + 1][1]), (outer[i + 1][0], 0.2, outer[i + 1][1]), (outer[i][0], 0.2, outer[i][1]), 'tile_cream')
        m.quad((prof[i][0], -0.2, prof[i][1]), (prof[i + 1][0], -0.2, prof[i + 1][1]), (prof[i + 1][0], 0.2, prof[i + 1][1]), (prof[i][0], 0.2, prof[i][1]), 'tile_orange')
    item(root, 'arch_portal', m)
    m = M()   # light panel (concourse), 0.6 x 1.2, underside z=0
    m.box((0, 0, 0.02), (0.64, 1.24, 0.04), 'steel_bright'); m.box((0, 0, 0.0), (0.56, 1.16, 0.01), 'strip_light')
    item(root, 'light_panel', m)
    m = M()   # wall-mounted route map frame 1.2 x 0.9 blank, faces +Y
    signboard(m, (0, 0, 0), 1.2, 0.9, 'sign_blank', 'steel_dark', thick=0.04, double=False)
    item(root, 'sign_map_frame', m)
    m = M()   # roller shutter / station door (closed state) 2.0 x 2.4
    m.box((0, 0, 1.2), (2.0, 0.06, 2.4), 'steel_bright')
    for i in range(24): m.box((0, 0.035, 0.05 + i * 0.1), (1.98, 0.01, 0.015), 'steel_dark')
    item(root, 'shutter_2m', m)
    return root

if __name__ == '__main__':
    build_kit(); export('station_kit.glb')
