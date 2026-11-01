"""Generate the complete CC0 animal library. Run only through tools/nice.mjs, Blender --background.

    node la-ladera/tools/nice.mjs --idle blender --background --factory-startup --python \
      la-ladera/tools/blender/animals_build.py -- --out la-ladera/assets/models

No source downloads, add-ons, textures, or random choices. See ANIMALS.md for regeneration and QA.
"""
import argparse
import json
import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import furn_lib as F
from animals_lib import Animal, clip, far_mesh, loft, write_glb

S = math.sin


def eyes(a, y, z, x, size, iris=0x623D20, bird=False):
    for s in (-1, 1):
        if not a.far:
            a.egg((s * x, y, z), (size * 0.45, size, size), iris, 'head', n=8, rings=4)
            a.egg((s * (x + size * 0.32), y, z + size * 0.2), (size * 0.24, size * 0.62, size * 0.63), 0x11151A, 'head', n=6, rings=4)
            a.egg((s * (x + size * 0.50), y + size * 0.27, z + size * 0.37), (size * 0.12,) * 3, 0xF7F5E9, 'head', n=4, rings=3)


def quadruped(key, far=False):
    a = Animal(key, far)
    cat, mule = key == 'cat', key == 'mule'
    if mule:
        coat, dark, light = 0x7F7363, 0x312D2A, 0xC8BD9F
        cy, cz, rx, ry, length = 1.13, -0.06, 0.29, 0.35, 1.28
        head = (0, 1.80, 0.88); hs = (0.15, 0.20, 0.26)
        hip, front, rear, knee = 1.10, 0.43, -0.48, 0.50
        legx, legw, paw = 0.22, 0.082, (0.085, 0.07, 0.12)
    elif cat:
        coat, dark, light = 0xB16F36, 0x683C24, 0xEEE0C5
        cy, cz, rx, ry, length = 0.36, -0.015, 0.105, 0.135, 0.57
        head = (0, 0.52, 0.38); hs = (0.105, 0.10, 0.105)
        hip, front, rear, knee = 0.35, 0.20, -0.20, 0.16
        legx, legw, paw = 0.080, 0.030, (0.034, 0.026, 0.055)
    else:
        coat, dark, light = 0xA66E3E, 0x513725, 0xEDE0C5
        cy, cz, rx, ry, length = 0.59, -0.04, 0.18, 0.21, 0.86
        head = (0, 0.86, 0.50); hs = (0.115, 0.125, 0.16)
        hip, front, rear, knee = 0.57, 0.27, -0.32, 0.27
        legx, legw, paw = 0.14, 0.044, (0.053, 0.035, 0.083)
    a.bone('body', (0, cy, 0))
    a.bone('neck', (0, cy + ry * 0.23, front), 'body')
    a.bone('head', (0, head[1] - hs[1] * 0.55, head[2] - hs[2] * 0.45), 'neck')
    a.bone('tail', (0, cy + ry * 0.45, rear - length * 0.10), 'body')
    profile = [(cz - length * 0.51, cy, rx * 0.26, ry * 0.35),
               (cz - length * 0.36, cy, rx, ry * 0.96),
               (cz - length * 0.08, cy + 0.015, rx * 0.9, ry * 0.85),
               (cz + length * 0.25, cy + 0.015, rx * 1.02, ry),
               (cz + length * 0.43, cy + 0.025, rx * 0.76, ry * 0.82),
               (cz + length * 0.51, cy + 0.02, rx * 0.24, ry * 0.35)]
    def coat_colour(p):
        x, y, z = p
        if y < cy - ry * 0.40 and z > 0:
            return light
        if cat and y > cy and math.sin(z * 60 + x * 8) > 0.55:
            return dark
        return F.mixc(coat, dark, 0.12 if y > cy + ry * 0.7 else 0)
    a.emit(loft(profile, 5 if far else 12), coat, colour_fn=coat_colour)
    a.tube([(0, cy + ry * 0.40, front - 0.025), (0, head[1] - hs[1] * 0.55, head[2] - hs[2] * 0.40)],
           [rx * 0.70, hs[0] * 0.84], coat, 'neck')
    a.egg(head, hs, coat, 'head', colour_fn=lambda p: dark if p[1] > head[1] + hs[1] * 0.7 and not mule else coat)
    # Long, sloping mule muzzle; compact double feline muzzle; tapered dog snout.
    nose_y = head[1] - hs[1] * (0.6 if mule else 0.35)
    nose_z = head[2] + hs[2] * (1.1 if cat else 1.5)
    if cat:
        for s in (-1, 1):
            a.egg((s * 0.027, nose_y, nose_z - 0.018), (0.035, 0.028, 0.029), light, 'head', n=6, rings=4)
        a.egg((0, nose_y + 0.017, nose_z + 0.008), (0.015, 0.009, 0.009), 0xAB6F64, 'head', n=5, rings=3)
    else:
        a.tube([(0, head[1] - hs[1] * 0.22, head[2] + hs[2] * 0.48), (0, nose_y, nose_z)],
               [hs[0] * 0.74, hs[0] * 0.55], light, 'head', n=6 if far else 9)
        a.egg((0, nose_y + hs[1] * 0.03, nose_z + hs[2] * 0.07), (hs[0] * 0.53, hs[1] * 0.25, hs[2] * 0.16),
              dark if mule else 0x24201E, 'head', n=5 if far else 8, rings=3 if far else 4)
    eyes(a, head[1] + hs[1] * 0.21, head[2] + hs[2] * 0.36, hs[0] * 0.87, hs[1] * 0.15,
         0xB9A151 if cat else 0x80633F)
    for s in (-1, 1):
        if mule:
            base = (s * 0.105, head[1] + 0.12, head[2] - 0.08)
            tip = (s * 0.14, head[1] + 0.49, head[2] - 0.11)
            if far:
                a.fin((base, tip), 0.064, dark, 'head')
            else:
                center = tuple((base[k] + tip[k]) / 2 for k in range(3))
                a.egg(center, (0.057, 0.195, 0.027), dark, 'head', n=8, rings=5, rot=(0, 0, -s * 0.095))
                a.egg((center[0], center[1] + 0.007, center[2] + 0.024), (0.036, 0.145, 0.007), 0xB28F7B,
                      'head', n=6, rings=4, rot=(0, 0, -s * 0.095))
        elif cat:
            a.fin(((s * 0.068, head[1] + 0.055, head[2] - 0.025), (s * 0.083, head[1] + 0.18, head[2] - 0.015)), 0.044, coat, 'head')
            if not far:
                a.fin(((s * 0.069, head[1] + 0.09, head[2] + 0.007), (s * 0.083, head[1] + 0.16, head[2] + 0.004)), 0.026, 0xCF9B84, 'head')
                for h in (-1, 1):
                    a.tube([(s * 0.045, nose_y, nose_z), (s * 0.16, nose_y + h * 0.022, nose_z - 0.01)],
                           [0.0015, 0.0005], light, 'head', n=3)
        else:
            # One folded ear, one semi-pricked ear gives the street dog an individual silhouette.
            a.fin(((s * 0.09, head[1] + 0.085, head[2] - 0.045),
                   (s * 0.155, head[1] + (0.18 if s < 0 else -0.05), head[2] + 0.025)), 0.067, dark, 'head')
    for position, z in (('front', front), ('rear', rear)):
        for s, side in ((-1, 'l'), (1, 'r')):
            upper, lower = f'{position}_{side}', f'{position}_{side}_lower'
            a.bone(upper, (s * legx, hip, z), 'body')
            kz = z + (0.025 if position == 'front' else -0.05) * (1.8 if mule else 1)
            a.bone(lower, (s * legx, knee, kz), upper)
            if far:
                a.tube([(s * legx, hip, z), (s * legx, knee, kz)], [legw * (1.7 if position == 'rear' else 1.28), legw * 0.77], coat, upper)
            else:
                # Tuck the upper cap inside the torso and widen the actual thigh below it.
                # This makes a continuous muscle silhouette without a visible ball joint.
                a.tube([(s * legx * 0.65, hip + legw * 0.9, z), (s * legx, hip - legw * 1.8, z), (s * legx, knee, kz)],
                       [legw * 1.1, legw * (1.4 if position == 'rear' else 1.15), legw * 0.77], coat, upper, n=9)
            foot_z = z + (0.035 if position == 'front' else 0.025)
            a.tube([(s * legx, knee + 0.014, kz), (s * legx, paw[1] * 1.2, foot_z)],
                   [legw * 0.8, legw * 0.58], coat if mule else light, lower)
            a.egg((s * legx, paw[1], foot_z + paw[2] * 0.3), paw, dark if mule else light, lower, n=5 if far else 7, rings=3 if far else 4)
    if cat:
        tail = [(0, cy + 0.06, rear - 0.06), (0.01, 0.59, -0.34), (0.025, 0.81, -0.35), (0.07, 0.87, -0.28), (0.10, 0.82, -0.22)]
        a.tube(tail, [0.032, 0.028, 0.023, 0.020, 0.010], coat, 'tail', n=4 if far else 7,
               colour_fn=lambda p: dark if p[0] > 0.045 and p[1] > 0.79 else coat)
    elif mule:
        tail = [(0, 1.30, -0.67), (0, 1.02, -0.78), (0, 0.73, -0.79), (0, 0.55, -0.78)]
        a.tube(tail, [0.048, 0.035, 0.034, 0.011], dark, 'tail')
        a.egg((0, 0.65, -0.79), (0.06, 0.17, 0.06), dark, 'tail', n=5 if far else 8, rings=4)
        a.tube([(0, 1.41, 0.30), (0, 1.62, 0.48), (0, 1.79, 0.66)], [0.045, 0.052, 0.034], dark, 'neck', n=4)
    else:
        a.tube([(0, cy + 0.08, -0.44), (0, 0.77, -0.56), (0, 0.91, -0.65), (0, 0.93, -0.80)],
               [0.045, 0.036, 0.026, 0.012], coat, 'tail')
        if not far:
            a.tube([(0, 0.91, -0.65), (0, 0.93, -0.80)], [0.027, 0.012], light, 'tail')
    idle = {'head': lambda t: (0.025 * S(t), 0.10 * S(t), 0.018 * S(t * 2)),
            'tail': lambda t: (0, (0.10 if cat else 0.22) * S(t * 2), 0.025 * S(t))}
    walk = {'head': lambda t: (0.035 * S(t * 2), 0.02 * S(t), 0), 'tail': lambda t: (0, 0.20 * S(t), 0)}
    for i, (position, side) in enumerate((('front', 'l'), ('front', 'r'), ('rear', 'l'), ('rear', 'r'))):
        phase = 0 if i in (0, 3) else math.pi
        amp = 0.28 if mule else 0.36
        walk[f'{position}_{side}'] = lambda t, p=phase, m=amp: (m * S(t + p), 0, 0)
        walk[f'{position}_{side}_lower'] = lambda t, p=phase: (0.30 * max(0, -S(t + p)), 0, 0)
    # Long neck/head reach is authored in the rest mesh: feeding needs no root motion
    # or sinking feet. Small looping jaw/head dips keep the muzzle near the ground.
    neck_dip = 2.0 if mule else 1.70
    head_dip = -0.20 if mule else 0.03
    eat = {'neck': lambda t: (neck_dip + 0.04 * S(t * 2), 0, 0),
           'head': lambda t: (head_dip + 0.055 * S(t * 2), 0.025 * S(t), 0),
           'tail': lambda t: (0, 0.07 * S(t), 0)}
    clip(a, 'idle', 2.4, idle); clip(a, 'walk', 1.2 if mule else 1.0, walk); clip(a, 'eat', 1.6, eat)
    return a


def cage(a, small=False):
    r, bottom, shoulder, top = (0.27, 0.86, 1.40, 1.61) if small else (0.35, 0.83, 1.58, 1.82)
    m, col = 'galvanised', 0xB7A995
    # Stand, weighted base and tray. Solid strips, never transparency cards.
    a.tube([(0, 0.06, 0), (0, bottom, 0)], 0.018, col, 'root', n=4 if a.far else 7, material=m)
    for angle in (0, math.tau / 3, math.tau * 2 / 3):
        a.tube([(0, 0.15, 0), (r * math.cos(angle), 0.025, r * math.sin(angle))], 0.014, col, 'root', n=3 if a.far else 5, material=m)
    a.emit(F.lathe_geo([(0, bottom - 0.035), (r, bottom - 0.035), (r, bottom + 0.018), (0, bottom + 0.018)], n=8 if a.far else 16),
           col, 'root', m)
    bars = 4 if a.far else 12
    for i in range(bars):
        angle = math.tau * (i + 0.5) / bars
        pts = [(r * math.cos(angle), bottom + 0.016, r * math.sin(angle)),
               (r * math.cos(angle), shoulder, r * math.sin(angle)),
               (r * 0.62 * math.cos(angle), top - 0.055, r * 0.62 * math.sin(angle)),
               (0, top, 0)]
        if a.far:
            pts = [pts[0], pts[1], pts[-1]]
        a.tube(pts, 0.004 if small else 0.0045, col, 'root', n=3 if a.far else 4, caps=False, material=m)
    for y in ([shoulder] if a.far else [bottom + 0.05, bottom + 0.30, shoulder]):
        pts = [(r * math.cos(math.tau * (i + 0.5) / bars), y, r * math.sin(math.tau * (i + 0.5) / bars)) for i in range(bars + 1)]
        a.tube(pts, 0.005, col, 'root', n=3 if a.far else 4, caps=False, material=m)
    perch = bottom + (0.18 if small else 0.26)
    a.tube([(-r + 0.02, perch, 0), (r - 0.02, perch, 0)], 0.010 if small else 0.014, 0x9E744B, 'root', n=4 if a.far else 6)
    if not a.far:
        for x, c in ((-r * 0.70, 0xB0C1C3), (r * 0.70, 0xE4C379)):
            a.egg((x, perch - 0.02, 0.07), (0.045, 0.025, 0.040), c, 'root', n=8, rings=4)
        a.tube([(r * 0.32, bottom + 0.10, r), (r * 0.32, bottom + 0.35, r), (-r * 0.32, bottom + 0.35, r), (-r * 0.32, bottom + 0.10, r)],
               0.005, col, 'root', n=4, material=m)
        a.tube([(0, top, 0), (0, top + 0.065, 0), (0.035, top + 0.08, 0), (0.06, top + 0.055, 0)], 0.006, col, 'root', n=5, material=m)
    return perch


def bird(key, far=False):
    a = Animal(key, far)
    hen, parrot, canary = key == 'hen', key == 'parrot_caged', key == 'canary_caged'
    base = cage(a, canary) if parrot or canary else 0
    if hen:
        coat, wing, tail, neck, headcol = 0xB4773A, 0x704321, 0x363C34, 0xC29653, 0xBC8846
        body = (0, base + 0.27, -0.03); radii = (0.155, 0.18, 0.225)
        head = (0, base + 0.49, 0.18); hr = (0.069, 0.077, 0.071); legx = 0.065
    elif parrot:
        coat, wing, tail, neck, headcol = 0x4C973B, 0x247C52, 0x196975, 0x74A83F, 0x72AF46
        body = (0, base + 0.16, -0.035); radii = (0.085, 0.14, 0.12)
        head = (0, base + 0.32, 0.035); hr = (0.070, 0.075, 0.070); legx = 0.031
    elif canary:
        coat, wing, tail, neck, headcol = 0xE5BC36, 0xAC913A, 0xBDA348, 0xF0CC42, 0xF2D448
        body = (0, base + 0.10, -0.015); radii = (0.044, 0.065, 0.075)
        head = (0, base + 0.18, 0.045); hr = (0.035, 0.038, 0.038); legx = 0.021
    else:
        coat, wing, tail, neck, headcol = 0x939BA7, 0x747E8D, 0x3D485A, 0x477970, 0x687786
        body = (0, 0.16, -0.025); radii = (0.090, 0.12, 0.17)
        head = (0, 0.29, 0.11); hr = (0.045, 0.055, 0.052); legx = 0.034
    # Pitch around the hip axis, not the belly centre. The opposite leg rotations
    # then hold feet on the floor/perch and keep a feeding parrot inside its cage.
    a.bone('body', (0, body[1] - radii[1] * 0.65, 0))
    a.bone('neck', (0, body[1] + radii[1] * 0.3, body[2] + radii[2] * 0.55), 'body')
    a.bone('head', (0, head[1] - hr[1] * 0.5, head[2] - hr[2] * 0.3), 'neck')
    a.bone('tail', (0, body[1], body[2] - radii[2] * 0.65), 'body')
    a.egg(body, radii, coat, n=5 if far else 12, rings=3 if far else 7,
          colour_fn=lambda p: F.mixc(coat, 0xF5E4B8, 0.16) if p[1] < body[1] and p[2] > body[2] else coat)
    a.tube([(0, body[1] + radii[1] * 0.3, body[2] + radii[2] * 0.5), (0, head[1] - hr[1] * 0.45, head[2])],
           [hr[0] * 1.25, hr[0] * 0.87], neck, 'neck', n=3 if far else 7)
    a.egg(head, hr, headcol, 'head', n=5 if far else 10, rings=3 if far else 6)
    beak = 0xA59A79 if parrot else 0xDCA445 if hen else 0xD7B27F if canary else 0x62656B
    a.tube([(0, head[1] - hr[1] * 0.05, head[2] + hr[2] * 0.8),
            (0, head[1] - hr[1] * (0.8 if parrot else 0.2), head[2] + hr[2] * (1.45 if parrot else 1.7))],
           [hr[0] * (0.44 if parrot else 0.24), hr[0] * 0.035], beak, 'head', n=3 if far else 6)
    eyes(a, head[1] + hr[1] * 0.12, head[2] + hr[2] * 0.28, hr[0] * 0.88, hr[1] * 0.17,
         0xE4AC4E if not canary else 0x51472D, True)
    if parrot and not far:
        # Bare eye cheek and yellow forehead identify a small Amazon-type parrot, not a recoloured pigeon.
        for s in (-1, 1):
            a.egg((s * hr[0] * 0.78, head[1] - 0.025, head[2] + 0.025), (0.010, 0.020, 0.025), 0xC7C5A2, 'head', n=6, rings=4)
        a.egg((0, head[1] + 0.052, head[2] + 0.027), (0.044, 0.026, 0.038), 0xDCC749, 'head', n=8, rings=4)
    for s, side in ((-1, 'l'), (1, 'r')):
        a.bone('wing_' + side, (s * radii[0] * 0.60, body[1] + radii[1] * 0.40, body[2] + radii[2] * 0.20), 'body')
        if not (far and (parrot or canary)):
            a.egg((s * radii[0] * 0.80, body[1], body[2] - radii[2] * 0.10),
                  (radii[0] * 0.33, radii[1] * 0.75, radii[2] * 0.87), wing, 'wing_' + side, n=5 if far else 8, rings=3 if far else 5, rot=(-0.20, 0, 0))
        if not far:
            for i in range(3 if hen or parrot else 2):
                a.tube([(s * radii[0] * 1.08, body[1] + radii[1] * 0.37 - i * radii[1] * 0.32, body[2] - radii[2] * 0.55),
                        (s * radii[0] * 1.07, body[1] + radii[1] * 0.18 - i * radii[1] * 0.30, body[2] + radii[2] * 0.35)],
                       radii[0] * 0.055, tail, 'wing_' + side, n=4)
        a.bone('leg_' + side, (s * legx, body[1] - radii[1] * 0.65, 0), 'body')
        foot = 0xC07962 if not hen else 0xD0A159
        a.tube([(s * legx, body[1] - radii[1] * 0.6, -0.01), (s * legx, base + 0.014, 0.01)],
               [0.008 if hen else 0.005, 0.005 if hen else 0.0035], foot, 'leg_' + side, n=3 if far else 5)
        if not far:
            for i in (-1, 0, 1):
                a.tube([(s * legx, base + 0.014, 0.01), (s * legx + i * hr[0] * 0.37, base + 0.008, hr[0] * 0.87)],
                       [0.004 if hen else 0.0025, 0.0015], foot, 'leg_' + side, n=3)
            a.tube([(s * legx, base + 0.014, 0.01), (s * legx, base + 0.007, -hr[0] * 0.60)], [0.003, 0.0015], foot, 'leg_' + side, n=3)
    # Individual tail feathers keep species silhouettes recognisable in the far mesh too.
    feathers = (1 if parrot or canary else 3) if far else 5
    for i in range(feathers):
        x = (i - (feathers - 1) / 2) * radii[0] * 0.26
        tipy = body[1] + radii[1] * 0.90 if hen else base - 0.07 if parrot else body[1] - radii[1] * 0.30
        start = (x, body[1], body[2] - radii[2] * 0.55)
        end = (x * 1.4, tipy, body[2] - radii[2] * (2.0 if parrot else 1.55))
        tip_length = 1 - 0.12 * abs(i - (feathers - 1) / 2) / max(1, (feathers - 1) / 2)
        end = tuple(start[k] + (end[k] - start[k]) * tip_length for k in range(3))
        colour = F.mulc(tail, 0.95 + (i % 2) * 0.10)
        if far:
            a.fin((start, end), radii[0] * 0.35, colour, 'tail')
        else:
            length = math.dist(start, end)
            center = tuple((start[k] + end[k]) / 2 for k in range(3))
            a.egg(center, (radii[0] * 0.30, radii[0] * 0.07, length * 0.57), colour, 'tail', n=8, rings=4,
                  rot=(math.atan2(start[1] - end[1], end[2] - start[2]), 0, 0))
    if hen:
        for i in range(3 if far else 4):
            a.egg((0, head[1] + hr[1] * 0.93, head[2] - 0.045 + i * 0.025), (0.016, 0.028 + i * 0.004, 0.021),
                  0xAE3833, 'head', n=4 if far else 6, rings=3 if far else 4)
        if not far:
            for s in (-1, 1):
                a.egg((s * 0.017, head[1] - 0.065, head[2] + 0.057), (0.013, 0.036, 0.018), 0xA73832, 'head', n=6, rings=4)
    idle = {'head': lambda t: (0.04 * S(t), 0.18 * S(t), 0.045 * S(t * 2)),
            'tail': lambda t: (0.045 * S(t), 0, 0)}
    walk = {'leg_l': lambda t: (0.37 * S(t), 0, 0), 'leg_r': lambda t: (-0.37 * S(t), 0, 0),
            'neck': lambda t: (0.09 * S(t * 2), 0, 0), 'head': lambda t: (-0.07 * S(t * 2), 0, 0),
            'tail': lambda t: (0.05 * S(t), 0, 0)}
    body_dip = 0.45 if parrot or canary else 0.65
    eat = {'body': lambda t: (body_dip + 0.03 * S(t * 2), 0, 0),
           'leg_l': lambda t: (-body_dip - 0.03 * S(t * 2), 0, 0),
           'leg_r': lambda t: (-body_dip - 0.03 * S(t * 2), 0, 0),
           'neck': lambda t: (0.65 + 0.22 * S(t * 2), 0, 0), 'head': lambda t: (0.30 + 0.18 * S(t * 2), 0, 0),
           'tail': lambda t: (-0.07 * S(t * 2), 0, 0)}
    clip(a, 'idle', 2.4, idle); clip(a, 'walk', 0.8, walk); clip(a, 'eat', 1.6, eat)
    return a


SPECIES = {
    'dog': {'name': 'Perro callejero', 'speed': 0.70, 'radius': 0.20, 'height': 0.85},
    'cat': {'name': 'Gato de la escalera', 'speed': 0.48, 'radius': 0.13, 'height': 0.65},
    'pigeon': {'name': 'Paloma', 'speed': 0.26, 'radius': 0.10, 'height': 0.34},
    'hen': {'name': 'Gallina', 'speed': 0.28, 'radius': 0.18, 'height': 0.58},
    'mule': {'name': 'Mula', 'speed': 0.62, 'radius': 0.34, 'height': 1.95},
    'parrot_caged': {'name': 'Loro en su jaula', 'speed': 0, 'radius': 0.38, 'height': 1.90, 'caged': True},
    'canary_caged': {'name': 'Canario en su jaula', 'speed': 0, 'radius': 0.30, 'height': 1.70, 'caged': True},
}


def build(out):
    os.makedirs(os.path.join(out, 'animals'), exist_ok=True)
    credits_source = os.path.join(F.ROOT, 'assets', 'models', 'animals', 'CREDITS.md')
    credits_target = os.path.join(out, 'animals', 'CREDITS.md')
    if os.path.abspath(credits_source) != os.path.abspath(credits_target):
        shutil.copyfile(credits_source, credits_target)
    manifest = {'version': 1, 'license': 'CC0-1.0', 'generator': 'tools/blender/animals_build.py',
                'credits': 'animals/CREDITS.md',
                'units': 'metres', 'forward': '+Z', 'up': '+Y', 'budgetBytes': 2000000,
                'animals': {}, 'files': []}
    for key, metadata in SPECIES.items():
        factory = quadruped if key in ('dog', 'cat', 'mule') else bird
        near, far = factory(key), factory(key, True)
        far.key = key + '_lod'
        near.floor(); far.floor()
        far_mesh(far)
        far.floor()  # Decimation may remove the lowest sole/stand vertices.
        if near.triangles > 3000:
            raise ValueError(f'{key}: {near.triangles} near triangles exceeds 3000')
        paths = [f'animals/{key}.glb', f'animals/{key}_lod.glb']
        sizes = [write_glb(near, os.path.join(out, paths[0])), write_glb(far, os.path.join(out, paths[1]))]
        lo, hi = near.bounds()
        entry = {**metadata, 'caged': metadata.get('caged', False), 'glb': paths[0], 'lod': paths[1], 'node': key, 'lodNode': key + '_lod',
                 'clips': {name: name for name in ('idle', 'walk', 'eat')}, 'clipDurations': {name: c['duration'] for name, c in near.clips.items()},
                 'triangles': near.triangles, 'lodTriangles': far.triangles, 'bytes': sizes[0], 'lodBytes': sizes[1],
                 'size': [round(hi[k] - lo[k], 5) for k in range(3)], 'bounds': [[round(v, 6) for v in row] for row in (lo, hi)],
                 'license': 'CC0-1.0'}
        manifest['animals'][key] = entry
        for rel, node in zip(paths, (key, far.key)):
            manifest['files'].append({'glb': rel, 'assets': {node: {'node': node, 'tags': ['animal', key] + (['lod'] if node.endswith('_lod') else []),
                                                                 'footprint': [entry['size'][0], entry['size'][2]]}}})
        print(f'{key:15} near={near.triangles:4} far={far.triangles:3} bytes={sum(sizes):7}')
    path = os.path.join(out, 'manifest.animals.json')
    with open(path, 'w', encoding='utf8', newline='\n') as stream:
        json.dump(manifest, stream, indent=2, ensure_ascii=False); stream.write('\n')
    total = sum(os.path.getsize(os.path.join(out, 'animals', f)) for f in os.listdir(os.path.join(out, 'animals'))) + os.path.getsize(path)
    if total > 2000000:
        raise ValueError(f'Animal library {total} > 2,000,000 bytes')
    print(f'{len(SPECIES)} species, {total:,} library bytes; manifest -> {path}')


if __name__ == '__main__':
    if not bpy.app.background:
        raise RuntimeError('Animal generation requires Blender --background (quiet-box rule)')
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=os.path.join(F.ROOT, 'assets', 'models'))
    args = parser.parse_args(F.argv_after_dashes() if '--' in sys.argv else [])
    build(os.path.abspath(args.out))
