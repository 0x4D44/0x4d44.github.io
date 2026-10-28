"""Builds models/signal.glb (post-mounted) , models/signal_wall.glb (tunnel-wall mounted) and models/signal_boards.glb.
Each signal: root node `signal` (origin = foot of post / wall plate), mesh `signal_housing`, lens meshes `lamp_red` and `lamp_green` (each has its OWN material
`lens_red` / `lens_green`, emissive: set material.emissiveIntensity = 0 for OFF, ~4 for ON), empties `lamp_red_anchor`, `lamp_green_anchor` (point-light positions).
Lenses face glTF +Z (towards trains travelling -Z); rotate the clone 180 deg about Y for the opposite direction."""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

def head(m, z0):
    """Two-aspect colour-light head centred at height z0 on x=0; lenses face Blender -Y (= glTF +Z)."""
    m.box((0, 0.06, z0), (0.24, 0.14, 0.52), 'plastic_black')
    m.box((0, 0.0, z0), (0.26, 0.02, 0.54), 'steel_dark')
    for dz in (0.14, -0.14):
        for k in range(-1, 2):   # hood visor (three slats approximating a half-cylinder)
            m.box((k * 0.07, -0.07, z0 + dz + 0.085), (0.07, 0.10, 0.012), 'plastic_black', rot=(0.3, 0, 0))
    m.box((0, 0.13, z0), (0.30, 0.02, 0.60), 'steel_dark')    # back plate
    return

def lens(name, parent, loc, mat):
    lm = M(); lm.cyl((0, 0, 0), 0.068, 0.02, mat, axis='y', seg=20)
    return lm.to_obj(name, parent=parent, loc=loc)

def build_signal(wall):
    reset()
    root = group('signal')
    m = M()
    if wall:
        m.box((0, 0.10, 0.0), (0.20, 0.06, 0.70), 'steel_dark')                    # wall bracket plate
        m.box((0, 0.04, 0.0), (0.06, 0.12, 0.06), 'steel_dark')
        zc = 0.0
    else:
        m.cyl((0, 0.10, 0.9), 0.035, 1.8, 'steel_dark', seg=10)                    # post
        m.box((0, 0.10, 0.02), (0.30, 0.30, 0.04), 'steel_dark')                    # foot plate
        m.box((0, 0.06, 1.62), (0.06, 0.08, 0.30), 'steel_dark')
        zc = 1.62
    head(m, zc)
    m.to_obj('signal_housing', parent=root)
    lens('lamp_red', root, (0, -0.075, zc + 0.14), 'lens_red')
    lens('lamp_green', root, (0, -0.075, zc - 0.14), 'lens_green')
    empty('lamp_red_anchor', loc=(0, -0.2, zc + 0.14), parent=root); empty('lamp_green_anchor', loc=(0, -0.2, zc - 0.14), parent=root)
    return root

def build_boards():
    reset()
    root = group('signal_boards')
    def board(name, mat, w, h, post=True, loc=(0, 0, 0)):
        m = M()
        if post:
            m.cyl((0, 0.05, 0.6), 0.03, 1.2, 'steel_dark', seg=8)
        m.box((0, 0.03, 1.2 + h / 2 if post else h / 2), (w, 0.03, h), 'steel_dark')
        zc = 1.2 + h / 2 if post else h / 2
        q = m.quad_uv((-w / 2 + 0.02, -0.0, zc - h / 2 + 0.02), (w / 2 - 0.02, -0.0, zc - h / 2 + 0.02), (w / 2 - 0.02, -0.0, zc + h / 2 - 0.02), (-w / 2 + 0.02, -0.0, zc + h / 2 - 0.02), mat, (1, 0, 0, 1)); q[m.fx] = 1
        if q.normal.y > 0: q.normal_flip()
        return m.to_obj(name, parent=root, loc=loc)
    board('board_trainstop', 'board_trainstop_mat', 0.6, 0.3)              # train-stop marker board (post mounted)
    board('board_station_stop', 'board_station_mat', 0.6, 0.3)             # station stop-here board
    board('board_speed', 'board_speed_mat', 0.45, 0.45)                    # speed restriction (blank slot: replace the map for other numbers)
    board('plate_datum', 'plate_datum_mat', 0.30, 0.15, post=False)         # RFID datum / chainage plate (wall mounted)
    return root

if __name__ == '__main__':
    build_signal(False); export('signal.glb')
    build_signal(True); export('signal_wall.glb')
    build_boards(); export('signal_boards.glb')
