"""Scenes 5-7: the state machine + cheat sheet, the situation map, the ending."""
import math
import numpy as np
from gouache import *
from board import *
from scenes import (CX, CY, CZ, OCH, INKB, CREAM, strip, hero)

STATES = [("1", "Observe", "What state am I in?"), ("2", "Classify", "Which known case?"),
          ("3", "Respond", "Use the prepared move."), ("4", "Return", "Back to the task.")]
STATE_POS = [(620, 455), (1300, 455), (1300, 805), (620, 805)]
STATE_COL = [CY, OCH, CX, CZ]


def arrow(length, color, seed):
    def fn(d, p):
        d.rounded_rectangle([p, p + 14, p + length - 34, p + 30], 8, fill=255)
        d.polygon([(p + length - 44, p), (p + length, p + 22), (p + length - 44, p + 44)], fill=255)
    return free_shape(length, 44, fn, color, seed, margin=3)


def progressive(pts, w, h, color, seed, width=9, head=False, n=6):
    """A painted line that draws itself over n frames (optionally with an arrowhead)."""
    frames = []
    for k in range(1, n + 1):
        m = max(2, int(len(pts) * k / n))
        def fn(d, p, m=m, k=k):
            d.line([(x + p, y + p) for x, y in pts[:m]], fill=255, width=width, joint='curve')
            if head and k == n:
                (x1, y1), (x2, y2) = pts[-2], pts[-1]
                a = math.atan2(y2 - y1, x2 - x1)
                L = width * 3
                d.polygon([(x2 + p + math.cos(a) * L * 0.6, y2 + p + math.sin(a) * L * 0.6),
                           (x2 + p + math.cos(a + 2.4) * L, y2 + p + math.sin(a + 2.4) * L),
                           (x2 + p + math.cos(a - 2.4) * L, y2 + p + math.sin(a - 2.4) * L)], fill=255)
        frames.append(free_shape(w, h, fn, color, seed, margin=0, shadow=False, angle=20))
    return frames


def anim_extra(frames, f0, x, y, z, key):
    def fn(f):
        if f < f0:
            return []
        i = min(len(frames) - 1, f - f0)
        return [(z, dict(spr=frames[i], key=key, x=x, y=y, jitter=0.4))]
    return fn


# ------------------------------------------------------------------ 5. State machine + cheat sheet
PHRASES = [("Starting", "Shall we start with step one?", CY), ("Clarifying", "Can you show me what you mean?", OCH),
           ("Not knowing", "I’m not sure. Let’s check.", CX), ("Pausing", "Give me a second to think.", CZ)]


def scene_loop():
    s = Scene('loop', 6, background(hexc('#b7c4a3'), 51, angle=1))
    t = strip("Convert ambiguity into a state machine.", 64, seed=52)
    Actor(s, t, 960, 78, 'title', z=20, rot=-0.8).slide_in(4, 5, 0, -400)
    for i, ((num, name, sub), (x, y), col) in enumerate(zip(STATES, STATE_POS, STATE_COL)):
        b = Board(420, 190, CREAM, seed=53 + i)
        b.shape(lambda d, ox, oy: d.ellipse([ox + 20, oy + 22, ox + 100, oy + 102], fill=255), col)
        b.text(num, F_BRUSH, 60, CREAM, 60, 62)
        b.text(name, F_BRUSH, 72, INKB, 250, 62)
        b.text(sub, F_HAND, 34, hexc('#4a4538'), 210, 146)
        Actor(s, b.sprite(), x, y, f'st{i}', z=3, rot=[-1.5, 1, -0.7, 1.3][i]).drop(10 + i * 7)
    arrows = [(960, 455, 0), (1300, 630, -90), (960, 805, 180), (620, 630, 90)]
    for i, (x, y, rot) in enumerate(arrows):
        Actor(s, arrow(170, INKB, 60 + i), x, y, f'ar{i}', z=2, rot=rot).pop(14 + i * 7, sfx=None)
    # the little hero stands on the top edge of each card in turn: one card per beat, two turns
    off = (150, -178)
    tk = hero(s, STATE_POS[0][0] + off[0], STATE_POS[0][1] + off[1], mood='calm', z=25, small=True)
    tk.pop(46, sfx=None)
    for k in range(8):
        f0 = 48 + k * 8
        i = (k + 1) % 4
        x, y = STATE_POS[i]
        tk.move(f0, 6, x + off[0], y + off[1], hop=38, steps=1, sfx=False)
        tk.ev(f0 + 6, 'hop', i=i)
    tk.gesture(112, 10, 'raise').hide(138)
    t2 = strip("A few known states.  A prepared move for each.", 50, seed=58, card=hexc('#efe3c4'))
    Actor(s, t2, 960, 1010, 'sub', z=20, rot=0.5).slide_in(116, 5, 0, 300)
    # the cheat sheet is laid over the loop, and phrases are dealt onto it one per beat
    sh = Board(1180, 760, hexc('#f4ecd8'), seed=59)
    sh.shape(lambda d, ox, oy: d.rectangle([ox, oy, ox + 1180, oy + 96], fill=255), INKB)
    sh.text("The cheat sheet", F_BRUSH, 72, CREAM, 590, 50)
    Actor(s, sh.sprite(), 960, 565, 'sheet', z=30, rot=-0.8).slide_in(132, 6, 1500, 0, rot0=-6)
    for i, (lab, ph, col) in enumerate(PHRASES):
        y = 330 + 55 + i * 128
        chip = Board(310, 76, hexc('#fbf6ea'), seed=110 + i, shape='round')
        chip.shape(lambda d, ox, oy: d.ellipse([ox + 12, oy + 14, ox + 60, oy + 62], fill=255), col)
        chip.text(lab, F_HAND, 38, INKB, 74, 38, align='l')
        Actor(s, chip.sprite(), 560, y, f'lab{i}', z=31, rot=(-1) ** i).drop(138 + i * 7, sfx=False)
        ps = label("“" + ph + "”", F_HAND, 46, ink=INKB, card=None, seed=120 + i)
        ps.cx = 14 + 40
        Actor(s, ps, 745, y, f'ph{i}', z=31).drop(138 + i * 7, sfx=False)
        s.ev(138 + i * 7, 'deal')
    return s


# ------------------------------------------------------------------ 6. Situation map
QS = ["Setting?", "What is required?", "Likely states?", "Default move for each?", "What changed?"]
PINS = [("Lecture", 0.2, 4.0, CY), ("Bus", 1.9, 4.8, CZ), ("Lab", 2.1, 1.5, CX),
        ("Group work", 3.1, 2.6, OCH), ("Open social", 3.9, 0.7, hexc('#8a6a8f'))]
GX, GY = 1300, 575          # grid board centre on stage
GW, GH = 1000, 690


def grid_to_stage(yv, zv):
    x0 = GX - GW / 2 + 130
    x1 = GX + GW / 2 - 60
    ybot = GY + GH / 2 - 110
    ytop = GY - GH / 2 + 60
    return x0 + (x1 - x0) * yv / 5, ybot - (ybot - ytop) * zv / 5


def pin(name, col, seed):
    tm = text_mask(name, F_HAND, 40)
    w = tm.size[0] + 90
    b = Board(w, 64, CREAM, seed=seed, shape='round')
    b.shape(lambda d, ox, oy: d.ellipse([ox + 10, oy + 10, ox + 54, oy + 54], fill=255), col)
    b.text(name, F_HAND, 40, INKB, 64, 34, align='l')
    spr = b.sprite()
    spr.cx = 16 + 32      # anchor on the coloured dot
    return spr


def scene_map():
    s = Scene('map', 5, background(hexc('#e2cfa6'), 61, angle=-2))
    t = strip("Build a map.", 72, seed=62)
    Actor(s, t, 400, 110, 'title', z=20, rot=-1.5).slide_in(4, 5, 0, -400)
    for i, q in enumerate(QS):
        b = Board(560, 84, CREAM, seed=80 + i, shape='round')
        b.shape(lambda d, ox, oy, i=i: d.ellipse([ox + 12, oy + 10, ox + 76, oy + 74], fill=255),
                [CY, CZ, CX, OCH, INKB][i])
        b.text(str(i + 1), F_BRUSH, 52, CREAM, 44, 44)
        b.text(q, F_HAND, 40, INKB, 100, 44, align='l')
        Actor(s, b.sprite(), 400, 260 + i * 118, f'q{i}', z=5, rot=[-1.5, 1, -0.8, 1.4, -1][i]).drop(14 + i * 8, sfx=(i % 2 == 0))
    # the grid: Y (interaction depth) across, Z (predictability) up
    g = Board(GW, GH, hexc('#f3ead4'), seed=65)
    ox0, oy0 = 130, GH - 110
    g.shape(lambda d, ox, oy: d.line([(ox + ox0, oy + oy0), (ox + GW - 40, oy + oy0)], fill=255, width=8), INKB)
    g.shape(lambda d, ox, oy: d.line([(ox + ox0, oy + oy0), (ox + ox0, oy + 40)], fill=255, width=8), INKB)
    # soft painted zones: calm (top-left) and demanding (bottom-right)
    g.shape(lambda d, ox, oy: d.ellipse([ox + 150, oy + 50, ox + 520, oy + 290], fill=255), hexc('#cddcb4'))
    g.shape(lambda d, ox, oy: d.ellipse([ox + 600, oy + 380, ox + 960, oy + 580], fill=255), hexc('#ecc2a8'))
    for k in range(6):
        x = ox0 + (GW - 60 - ox0) * k / 5
        g.text(str(k), F_BRUSH, 40, INKB, x, oy0 + 38)
    g.shape(lambda d, ox, oy: d.polygon([(ox + GW - 30, oy + oy0), (ox + GW - 58, oy + oy0 - 16),
                                         (ox + GW - 58, oy + oy0 + 16)], fill=255), INKB)
    g.shape(lambda d, ox, oy: d.polygon([(ox + ox0, oy + 28), (ox + ox0 - 16, oy + 56),
                                         (ox + ox0 + 16, oy + 56)], fill=255), INKB)
    g.text("interaction depth", F_HAND, 38, INKB, 560, oy0 + 82)
    g.text("predictable", F_HAND, 36, hexc('#4c6a3c'), ox0 + 30, 44, align='l')
    g.text("ambiguous", F_HAND, 36, hexc('#9a4a32'), ox0 + 30, oy0 - 34, align='l')
    Actor(s, g.sprite(), GX, GY, 'grid', z=1, rot=0.6).slide_in(6, 6, 1400, 0, rot0=4)
    lab = None
    for i, (name, yv, zv, col) in enumerate(PINS):
        x, y = grid_to_stage(yv, zv)
        a = Actor(s, pin(name, col, 90 + i), x, y, f'pin{i}', z=6, rot=[-2, 1.5, -1, 2, -1.5][i])
        a.pop(58 + i * 6, sfx='glock', pitch=i)
        if name == 'Lab':
            lab = a
    # evidence: after trying it, the lab turns out more predictable than feared
    t2 = strip("Update it from evidence.", 60, seed=63, card=hexc('#f7e4b0'))
    Actor(s, t2, 1300, 1015, 'sub', z=20, rot=0.8).slide_in(94, 5, 0, 300)
    x0, y0 = grid_to_stage(2.1, 1.5)
    x1, y1 = grid_to_stage(2.1, 3.3)
    pts = [(30 + 6 * math.sin(k), (y0 - y1) + 20 - k * (y0 - y1 - 10) / 10) for k in range(11)]
    arr = progressive(pts, 60, int(y0 - y1) + 40, INKB, 97, width=10, head=True, n=5)
    s.extra.append(anim_extra(arr, 104, x0 - 30, (y0 + y1) / 2 - 20, 5, 'pencil'))
    s.ev(104, 'scribble', dur=5 / FPS)
    s.ev(112, 'tear')
    lab.move(112, 8, x1, y1, lift=24)
    hm = hero(s, 700, y0 + 75, mood='calm', z=8, small=True)
    hm.home['s'] = 1.3
    hm.show(50).move(50, 12, x0 - 85, y0 + 75, hop=30, steps=4)
    hm.gesture(62, 26, 'point').gesture(106, 16, 'raise')
    hm.move(112, 8, x1 - 85, y1 + 75, hop=40, steps=2, sfx=False)
    hm.gesture(136, 18, 'wave')
    note = strip("after two sessions", 36, seed=98, card=hexc('#fbf5e6'), padx=20, pady=10)
    Actor(s, note, x1 + 300, y1 - 45, 'note', z=7, rot=-3).drop(124)
    return s


# ------------------------------------------------------------------ 7. Ending
def scene_end():
    s = Scene('end', 3, background(hexc('#eed6bc'), 71, angle=1))
    s.frames += 50
    mp = Board(96, 74, hexc('#f0e6cc'), seed=72, torn=False)
    mp.shape(lambda d, ox, oy: d.line([(ox, oy + 52), (ox + 48, oy + 30), (ox + 96, oy + 46)], fill=255, width=9), hexc('#8fb0c8'))
    mp.shape(lambda d, ox, oy: d.ellipse([ox + 14, oy + 8, ox + 44, oy + 30], fill=255), CX)
    mp.shape(lambda d, ox, oy: d.rectangle([ox + 46, oy, ox + 50, oy + 74], fill=255), hexc('#b8a888'))
    h = hero(s, 220, 690, mood='calm')
    h.home['s'] = 1.3
    h.move(0, 14, 420, 690, hop=24, steps=4)
    h.hold(mp.sprite(), 40, 84).gesture(40, 44, 'show').gesture(88, 24, 'wave')
    q = label("Know what this situation\nasks of me.", F_BRUSH, 118, ink=INKB, card=None, seed=73, spacing=-18)
    Actor(s, q, 1180, 320, 'q', z=3, rot=-1).slide_in(6, 6, 0, -600)
    url = strip("0x4d44.github.io/social-situations", 60, seed=74, card=CREAM)
    Actor(s, url, 1180, 600, 'url', z=4, rot=0.8).slide_in(28, 5, 1300, 0).ev(28, 'tear')
    nd = strip("Not a diagnostic \u2014 a map you own.", 48, seed=75, card=hexc('#f7e4b0'))
    Actor(s, nd, 1180, 750, 'nd', z=4, rot=-1.2).drop(56)
    return s
