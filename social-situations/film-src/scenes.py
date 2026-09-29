"""The seven scenes. Each bar is 32 drawn frames (12 fps, 90 bpm, 4/4)."""
import math
import numpy as np
from gouache import *
from board import *
from figures import peg, Rig

# gouache palette derived from the page's X / Y / Z / accent colours
CX = hexc('#d9674a')    # vermilion-coral  (X, liking)
CY = hexc('#4f82c2')    # cobalt           (Y, depth)
CZ = hexc('#6d9f5f')    # sap green        (Z, predictability)
OCH = hexc('#d9a23f')   # yellow ochre     (accent)
INKB = hexc('#2b2f3d')
CREAM = hexc('#f1e8d2')

SKIN = [(233, 190, 160), (200, 150, 115), (150, 105, 80), (240, 205, 180), (175, 125, 95)]
COATS = ['#7d8c9b', '#b0564a', '#6f7d4f', '#8a6a8f', '#4f8a8b', '#a88155', '#5d6b8c', '#c07a5a',
         '#8c9a6a', '#9a5a6a', '#6a8aa8', '#b89a5a']
HAIRS = ['#2a2222', '#5a3a2a', '#8a5a3a', '#c8a060', '#3a3030', '#6a6060']

HERO_C = dict(coat=OCH, hair=hexc('#33261f'), scarf=CY)
HERO = Rig(HERO_C['coat'], HERO_C['hair'], 11, scarf=HERO_C['scarf'])
HERO_S = Rig(HERO_C['coat'], HERO_C['hair'], 11, h=150, scarf=HERO_C['scarf'])


def hero(s, x, y, mood='worried', z=5, small=False):
    a = Actor(s, None, x, y, 'hero', z=z)
    return a.rigged(HERO_S if small else HERO, mood)


def crowd_peg(i, h=230, mood=None):
    rng = np.random.default_rng(100 + i)
    return peg(hexc(COATS[i % len(COATS)]), hexc(HAIRS[rng.integers(len(HAIRS))]), 200 + i,
               h=int(h * rng.uniform(0.9, 1.08)), mood=mood, skin=SKIN[rng.integers(len(SKIN))])


def strip(text, size=64, seed=1, font=F_HAND, card=CREAM, ink=INKB, **kw):
    return label(text, font, size, ink=ink, card=card, seed=seed, **kw)


SCENES = []


# ------------------------------------------------------------------ 1. Title
def scene_title():
    s = Scene('title', 3, background(hexc('#e8dcc0'), 3))
    t1 = label("Social situations", F_BRUSH, 170, ink=INKB, card=None, seed=4)
    Actor(s, t1, 960, 300, 't1', z=2).slide_in(2, 5, 0, -500, rot0=-4).ev(2, 'tear')
    t2 = strip("as learnable systems", 78, seed=5)
    Actor(s, t2, 960, 470, 't2', z=3, rot=-1.5).slide_in(16, 5, -1300, 0)
    # three coloured chips: X Y Z, placed on beats (8 frames each)
    for i, (ch, col) in enumerate([('X', CX), ('Y', CY), ('Z', CZ)]):
        b = Board(96, 96, col, seed=40 + i, shape='ellipse')
        b.text(ch, F_BRUSH, 72, CREAM, 48, 50)
        Actor(s, b.sprite(), 800 + i * 160, 610, f'chip{i}', z=4).pop(40 + i * 8, sfx='glock', pitch=i)
    h = hero(s, -150, 860)
    h.show(52).move(52, 24, 960, 860, hop=26, steps=6)
    h.mood(78, 'calm').gesture(82, 12, 'wave')
    return s


# ------------------------------------------------------------------ 2. Too large
def scene_crowd():
    s = Scene('crowd', 3, background(hexc('#b8adbd'), 21, angle=-3))
    t = strip("“People” is too large a problem.", 70, seed=22)
    Actor(s, t, 960, 130, 'title', z=20, rot=-1).slide_in(4, 5, 0, -400)
    h = hero(s, 960, 700, z=10)
    h.shake(34, 44, amp=2.4).gesture(60, 20, 'shrug')
    h.mood(82, 'calm').move(82, 12, 1520, 1000, hop=26, steps=4)
    rng = np.random.default_rng(5)
    spots = []
    # ring of positions around the hero, filling inwards over time
    for ring, (rx, ry, n) in enumerate([(700, 250, 9), (470, 170, 8), (820, 330, 7)]):
        for k in range(n):
            a = 2 * math.pi * (k + 0.5 * ring) / n + rng.uniform(-0.12, 0.12)
            spots.append((960 + rx * math.cos(a), 760 + ry * math.sin(a)))
    order = sorted(range(len(spots)), key=lambda i: rng.random())
    f = 12.0
    for n, i in enumerate(order):
        x, y = spots[i]
        if abs(x - 960) < 230 and abs(y - 720) < 220:
            continue
        spr = crowd_peg(n, h=int(190 + (y - 450) * 0.18))
        Actor(s, spr, x, y + 10, f'c{n}', z=5 + y / 1000).pop(int(f), sfx='pop' if n % 3 == 0 else None, pitch=0.8 + 0.4 * rng.random())
        f += max(1.2, 4.6 - n * 0.18)
    for k in range(6):
        q = label("?", F_BRUSH, 120 + k * 8, ink=OCH, card=None, seed=60 + k)
        x = 960 + (-1) ** k * (160 + 40 * k) + rng.uniform(-40, 40)
        y = 420 + rng.uniform(-60, 80)
        Actor(s, q, x, y, f'q{k}', z=15, rot=rng.uniform(-18, 18)).pop(40 + k * 4, sfx='pop' if k % 2 == 0 else None, pitch=1.3)
    s.ev(10, 'murmur', dur=78 / FPS)
    t2 = strip("Headcount alone is a poor predictor.", 52, seed=23, card=hexc('#efe3c4'))
    Actor(s, t2, 960, 990, 'sub', z=21, rot=0.8).slide_in(68, 5, 0, 300)
    return s


# ------------------------------------------------------------------ 3. Three axes
def axis_card_x(seed):
    b = Board(520, 560, CREAM, seed=seed)
    b.shape(lambda d, ox, oy: d.rectangle([ox, oy, ox + 520, oy + 110], fill=255), CX)
    b.text("X · Liking", F_BRUSH, 70, CREAM, 260, 58)
    b.text("How do I feel about\nthis person?", F_HAND, 36, INKB, 260, 200)
    def bar(d, ox, oy):
        d.rounded_rectangle([ox + 50, oy + 350, ox + 470, oy + 380], 14, fill=255)
    b.shape(bar, hexc('#b7a98a'))
    def half(d, ox, oy):
        d.rounded_rectangle([ox + 260, oy + 350, ox + 470, oy + 380], 14, fill=255)
    b.shape(half, CX)
    def half2(d, ox, oy):
        d.rounded_rectangle([ox + 50, oy + 350, ox + 260, oy + 380], 14, fill=255)
    b.shape(half2, hexc('#6f86a8'))
    b.shape(lambda d, ox, oy: d.rectangle([ox + 256, oy + 330, ox + 264, oy + 400], fill=255), INKB)
    b.text("dislike", F_HAND, 32, INKB, 110, 440)
    b.text("0", F_HAND, 36, INKB, 260, 440)
    b.text("liking", F_HAND, 32, INKB, 420, 440)
    b.text("a state, not an identity", F_HAND, 38, hexc('#6b6250'), 260, 510)
    return b.sprite()


def axis_card_y(seed):
    b = Board(520, 560, CREAM, seed=seed)
    b.shape(lambda d, ox, oy: d.rectangle([ox, oy, ox + 520, oy + 110], fill=255), CY)
    b.text("Y · Interaction", F_BRUSH, 70, CREAM, 260, 58)
    b.text("How much does this\nsituation ask of me?", F_HAND, 36, INKB, 260, 200)
    steps = []
    for i in range(6):
        x0 = 60 + i * 66
        y0 = 500 - (i + 1) * 36
        steps.append((x0, y0))
        b.shape(lambda d, ox, oy, x0=x0, y0=y0: d.rectangle([ox + x0, oy + y0, ox + x0 + 66, oy + 500], fill=255),
                tuple(int(c * (0.78 + 0.05 * i)) for c in CY))
        b.text(str(i), F_BRUSH, 34, CREAM, x0 + 33, y0 + 22)
    b.text("co-presence", F_HAND, 36, INKB, 140, 532)
    b.text("intimate", F_HAND, 36, INKB, 250, 288)
    return b.sprite(), steps


def axis_card_z(seed):
    b = Board(520, 560, CREAM, seed=seed)
    b.shape(lambda d, ox, oy: d.rectangle([ox, oy, ox + 520, oy + 110], fill=255), CZ)
    b.text("Z · Predictability", F_BRUSH, 64, CREAM, 260, 58)
    b.text("How much do I know\nin advance?", F_HAND, 36, INKB, 260, 200)
    cx, cy, r = 260, 470, 170
    b.shape(lambda d, ox, oy: d.pieslice([ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r], 180, 360, fill=255),
            hexc('#c9d6b0'))
    for i in range(6):
        a = math.pi + math.pi * i / 5
        x1, y1 = cx + (r - 34) * math.cos(a), cy + (r - 34) * math.sin(a)
        x2, y2 = cx + r * math.cos(a), cy + r * math.sin(a)
        b.shape(lambda d, ox, oy, x1=x1, y1=y1, x2=x2, y2=y2: d.line([ox + x1, oy + y1, ox + x2, oy + y2], fill=255, width=8), INKB)
        tx, ty = cx + (r + 26) * math.cos(a), cy + (r + 26) * math.sin(a)
        b.text(str(i), F_BRUSH, 30, INKB, tx, ty)
    b.text("ambiguous", F_HAND, 36, INKB, 100, 512)
    b.text("scripted", F_HAND, 36, INKB, 432, 512)
    return b.sprite(), (cx, cy, r)


def needle():
    return free_shape(150, 22, lambda d, p: d.polygon([(p, p + 3), (p, p + 19), (p + 150, p + 11)], fill=255),
                      INKB, 77, margin=3)


def scene_axes():
    s = Scene('axes', 5, background(hexc('#e6dac0'), 31, angle=2))
    t = strip("Three separate questions.", 72, seed=32)
    Actor(s, t, 960, 110, 'title', z=20, rot=-1).slide_in(4, 5, 0, -400)
    xs = [380, 960, 1540]
    cy = 610
    cx_ = Actor(s, axis_card_x(33), xs[0], cy, 'cx', z=2, rot=-1.2).slide_in(10, 6, 0, 800, rot0=8)
    ycard, steps = axis_card_y(34)
    Actor(s, ycard, xs[1], cy, 'cy', z=2, rot=0.8).slide_in(52, 6, 0, 800, rot0=-8)
    zcard, (dcx, dcy, r) = axis_card_z(35)
    Actor(s, zcard, xs[2], cy, 'cz', z=2, rot=-0.6).slide_in(96, 6, 0, 800, rot0=6)
    # X token: slides from 'dislike' side to neutral then to liking
    tok = disc(22, OCH, 90)
    x0 = xs[0] - 260
    tx = Actor(s, tok, x0 + 70, cy - 280 + 365, 'tokx', z=5)
    tx.pop(20).move(26, 8, x0 + 260, cy - 280 + 365, sfx=False).move(38, 8, x0 + 400, cy - 280 + 365, sfx=False)
    tx.ev(26, 'slide', dur=0.6, soft=True).ev(38, 'slide', dur=0.6, soft=True)
    # Y token climbs the staircase 0 -> 1 -> 2
    ty = Actor(s, disc(22, OCH, 91), 0, 0, 'toky', z=5)
    bx, by = xs[1] - 260 - 16, cy - 280 - 16
    ty.home.update(x=bx + 16 + steps[0][0] + 33, y=by + 16 + steps[0][1] - 20)
    ty.pop(62)
    for k in (1, 2):
        f0 = 64 + k * 8
        ty.move(f0, 5, bx + 16 + steps[k][0] + 33, by + 16 + steps[k][1] - 20, hop=0, steps=1, sfx=False)
        ty.ev(f0 + 5, 'tick', pitch=k)
    # Z needle rotates from 0 to 4
    nd = needle()
    pivot = (xs[2] - 260 + dcx, cy - 280 + dcy)
    def z_needle(f, nd=nd, pivot=pivot):
        if f < 104:
            return []
        t = clamp((f - 110) / 16)
        stepped = math.floor(t * 4 + 1e-6) / 4 if t < 1 else 1   # clicks from notch to notch
        val = 4 * stepped
        ang = 180 - 180 * val / 5   # degrees (0 -> left)
        a = math.radians(ang)
        L = 75
        return [(6, dict(spr=nd, key='needle', x=pivot[0] + L * math.cos(a), y=pivot[1] - L * math.sin(a), rot=ang,
                         jitter=0.6))]
    s.extra.append(z_needle)
    for k in range(4):
        s.ev(110 + (k + 1) * 4, 'tick', pitch=3 + k)
    pv = disc(16, INKB, 92, margin=3)
    Actor(s, pv, pivot[0], pivot[1], 'pivot', z=7).show(104)
    t2 = strip("feel  ·  depth  ·  predictability", 50, seed=36, card=hexc('#efe3c4'))
    Actor(s, t2, 960, 1000, 'sub', z=20, rot=0.6).slide_in(130, 5, 0, 300)
    return s


# ------------------------------------------------------------------ 4. The origin is crowded
def scene_origin():
    s = Scene('origin', 4, background(hexc('#8fa2b3'), 41, angle=-1))
    bb = Board(820, 200, hexc('#3f5a4c'), seed=42, torn=False)
    bb.text("Lecture", F_BRUSH, 76, hexc('#e8e4d6'), 410, 64)
    bb.text("arrive · sit · listen · leave", F_HAND, 40, hexc('#dcd8c8'), 410, 148)
    Actor(s, bb.sprite(), 960, 140, 'board', z=1).show(0)
    rows = [(430, 0.72, 7), (610, 0.86, 6), (800, 1.0, 5)]
    n = 0
    seat = None
    for r, (y, sc, cnt) in enumerate(rows):
        span = 1500 * sc
        for k in range(cnt):
            x = 960 - span / 2 + span * (k + 0.5) / cnt
            if r == 2 and k == 3:
                seat = (x, y)
                continue
            spr = crowd_peg(40 + n, h=int(210 * sc))
            Actor(s, spr, x, y - 40 * sc, f'p{n}', z=2 + r * 2).drop(6 + r * 10 + k, sfx=(k == 0))
            n += 1
        desk = Board(int(1650 * sc), int(70 * sc), hexc('#8a5a3a'), seed=44 + r, torn=False)
        Actor(s, desk.sprite(), 960, y + 40 * sc, f'desk{r}', z=3 + r * 2).slide_in(2 + r * 10, 5, -1800, 0)
    h = hero(s, -150, seat[1] - 40, z=6)
    h.show(40).move(40, 22, seat[0], seat[1] - 40, hop=22, steps=6)
    h.mood(78, 'calm')
    t = strip("The origin is crowded.", 70, seed=45)
    Actor(s, t, 470, 1010, 't', z=20, rot=-1).slide_in(64, 5, -900, 0)
    t2 = strip("Neutral + no interaction.  That is normal.", 46, seed=46, card=hexc('#efe3c4'))
    Actor(s, t2, 1400, 1015, 't2', z=20, rot=0.8).slide_in(84, 5, 900, 0)
    chip = Board(400, 64, OCH, seed=47, shape='round')
    chip.text("X 0 · Y 0 · Z 4", F_HAND, 38, INKB, 200, 34)
    Actor(s, chip.sprite(), 1540, 190, 'chip', z=21, rot=-2).pop(96, sfx='glock', pitch=4)
    return s




def build():
    import scenes2
    scenes = [scene_title(), scene_crowd(), scene_axes(), scene_origin(), scenes2.scene_loop(), scenes2.scene_map(), scenes2.scene_end()]
    start = 0
    for sc in scenes:
        sc.start = start
        start += sc.frames
    return scenes, start
