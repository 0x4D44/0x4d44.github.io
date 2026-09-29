"""Painted boards (cards) you can paint shapes and lettering onto, and animated actors."""
import math
import numpy as np
from gouache import *

FPS = 12
EVENTS = []   # (time_s, kind, params)


class Board:
    def __init__(self, w, h, color=PAPER, seed=1, torn=True, pad=16, shadow=True, shape=None):
        self.w, self.h, self.pad, self.seed = w, h, pad, seed
        self.W2, self.H2 = w + 2 * pad, h + 2 * pad
        self.shadow = shadow
        self.n = 0
        rng = np.random.default_rng(seed)
        im, d = mask_canvas(self.W2, self.H2)
        if shape == 'round':
            d.rounded_rectangle([pad, pad, pad + w, pad + h], min(w, h) // 6, fill=255)
        elif shape == 'ellipse':
            d.ellipse([pad, pad, pad + w, pad + h], fill=255)
        else:
            j = 3.5 if torn else 1.2
            pts = []
            nx, ny = max(4, w // 60), max(3, h // 60)
            for i in range(nx + 1):
                pts.append((pad + w * i / nx + rng.uniform(-2, 2), pad + rng.uniform(-j, j)))
            for i in range(1, ny + 1):
                pts.append((pad + w + rng.uniform(-j, j), pad + h * i / ny))
            for i in range(1, nx + 1):
                pts.append((pad + w - w * i / nx + rng.uniform(-2, 2), pad + h + rng.uniform(-j, j)))
            for i in range(1, ny):
                pts.append((pad + rng.uniform(-j, j), pad + h - h * i / ny))
            d.polygon(pts, fill=255)
        self.mask = gaussian_filter(m2f(im), 0.6)
        self.arr = np.zeros((self.H2, self.W2, 4), np.float32)
        if color is not None:
            lay = paint(self.mask, color, seed, rough=0.15, dry=0.1, var=0.7, rim=0.03)
            lay[..., 3] = self.mask * 255
            self.arr = over(self.arr, lay)

    def shape(self, fn, color, rough=0.7, dry=0.6, angle=None, clip=True):
        """fn(d, ox, oy) draws in board coords, where (ox, oy) is the board's top-left."""
        self.n += 1
        im, d = mask_canvas(self.W2, self.H2)
        fn(d, self.pad, self.pad)
        m = m2f(im)
        if clip:
            m = m * (self.mask > 0.5)
        self.arr = over(self.arr, paint(m, color, self.seed * 31 + self.n, angle=angle,
                                        rough=rough, dry=dry, rim=0.16))
        if m.sum() > 4000:   # a second, darker layer laid on in broken strokes
            h, w = m.shape
            sz = max(10, min(h, w) / 12)
            st = brush_strokes(h, w, (angle or 0) + 25, self.seed * 7 + self.n, sz * 0.6, sz * 1.4, sz * 2, sz * 6,
                               density=0.5)
            m2 = m * np.clip((st - 0.12) * 6, 0, 1)
            dark = tuple(int(c * 0.86) for c in color)
            lay = paint(m2, dark, self.seed * 53 + self.n, angle=angle, rough=0.8, dry=1.0, rim=0.05)
            lay[..., 3] *= 0.55
            self.arr = over(self.arr, lay)

    def text(self, s, font, size, color, cx, cy, spacing=0, align='c'):
        self.n += 1
        tm = m2f(text_mask(s, font, size, pad=0, spacing=spacing))
        th, tw = tm.shape
        m = np.zeros((self.H2, self.W2), np.float32)
        x0 = int(self.pad + (cx - tw / 2 if align == 'c' else cx))
        y0 = int(self.pad + cy - th / 2)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(self.W2, x0 + tw), min(self.H2, y0 + th)
        m[ys:ye, xs:xe] = tm[ys - y0:ye - y0, xs - x0:xe - x0]
        k = 1.0 if size >= 48 else 0.45
        self.arr = over(self.arr, paint(m, color, self.seed * 31 + self.n, angle=-12,
                                        rough=0.75 * k, dry=0.55 * k, var=1.3, rim=0.12 * k))

    def sprite(self):
        return Sprite(self.arr, shadow=self.shadow)


def free_shape(w, h, fn, color, seed, margin=4, shadow=True, angle=None, extra=None):
    """Silhouette cut-out: fn(d, p) draws in white with padding p."""
    return painted_shape(w, h, fn, color, seed, margin=margin, shadow=shadow, angle=angle, extra=extra)


def disc(r, color, seed, margin=4):
    return free_shape(2 * r, 2 * r, lambda d, p: d.ellipse([p, p, p + 2 * r, p + 2 * r], fill=255),
                      color, seed, margin=margin)


# ---------------------------------------------------------------- easing / actors
def clamp(t):
    return max(0.0, min(1.0, t))


def ease_out(t):
    return 1 - (1 - t) ** 3


def ease_io(t):
    return t * t * (3 - 2 * t)


def back(t, k=1.6):
    t -= 1
    return 1 + t * t * ((k + 1) * t + k)


STEPS_SLIDE = [0.0, 0.46, 0.79, 0.94, 1.015, 1.0]


class Actor:
    """A cut-out piece with a stack of timed moves. Positions are in stage px."""

    def __init__(self, scene, spr, x, y, key, z=0, rot=0.0, s=1.0, jitter=0.9):
        self.scene, self.spr, self.key, self.z = scene, spr, key, z
        self.home = dict(x=x, y=y, rot=rot, s=s, lift=0, alpha=1.0, sx=1.0)
        self.moves = []          # (f0, f1, fn(t, state) -> state)
        self.appear = None
        self.gone = None
        self.jitter = jitter
        self.spr_swaps = []      # (f, sprite)
        scene.actors.append(self)

    def ev(self, f, kind, **kw):
        self.scene.ev(f, kind, **kw)
        return self

    def show(self, f, sfx=None):
        self.appear = f
        if sfx:
            self.ev(f, sfx)
        return self

    def swap(self, f, spr):
        self.spr_swaps.append((f, spr))
        return self

    def slide_in(self, f, dur, dx, dy, sfx=True, rot0=0):
        self.appear = f
        steps = STEPS_SLIDE
        def fn(t, st, dx=dx, dy=dy):
            i = min(len(steps) - 1, int(t * len(steps)))
            e = steps[i]   # hand-placed increments: big move, then smaller nudges
            st['x'] -= dx * (1 - e); st['y'] -= dy * (1 - e)
            st['rot'] += rot0 * (1 - e)
            st['lift'] = 18 * (1 - min(1, e))
            if i == len(steps) - 2:          # the frame it lands: a slight squash
                st['s'] *= 0.975; st['sx'] = 1.03
            return st
        self.moves.append((f, f + dur + 1, fn, 'pre'))
        if sfx:
            self.ev(f, 'slide', dur=dur / FPS)
            self.ev(f + dur, 'tap')
        return self

    def pop(self, f, sfx='pop', pitch=1.0):
        self.appear = f
        # placed by hand, full size: comes down from above with a lifted shadow, lands, settles
        seq = [(46, -26, 4), (16, -8, 2), (0, 0, -1), (0, 0, 0)]
        def fn(t, st, seq=seq):
            i = min(len(seq) - 1, int(t * len(seq)))
            lift, dy, r = seq[i]
            st['lift'] = lift; st['y'] += dy; st['rot'] += r
            if i == 2:
                st['s'] *= 0.97; st['sx'] = 1.04
            return st
        self.moves.append((f, f + len(seq), fn, 'pre'))
        if sfx:
            self.ev(f, sfx, pitch=pitch)
        return self

    def drop(self, f, h=60, sfx=True):
        """Lowered onto the board from above: starts lifted and bigger, settles."""
        self.appear = f
        seq = [1.0, 0.45, 0.12, 0.0, 0.0]
        def fn(t, st, h=h, seq=seq):
            i = min(len(seq) - 1, int(t * len(seq)))
            st['lift'] = h * seq[i]
            st['s'] *= 1 + 0.08 * seq[i]
            if i == 3:
                st['s'] *= 0.975; st['sx'] = 1.03
            return st
        self.moves.append((f, f + 5, fn, 'pre'))
        if sfx:
            self.ev(f + 4, 'tap')
        return self

    def move(self, f, dur, x, y, hop=0, steps=0, sfx=True, lift=6, rot=None):
        def fn(t, st, x=x, y=y, x0=None):
            e = ease_io(t) if not steps else t
            st['x'] = st['x'] + (x - st['x']) * e
            st['y'] = st['y'] + (y - st['y']) * e
            if rot is not None:
                st['rot'] = st['rot'] + (rot - st['rot']) * e
            if steps:
                ph = t * steps
                st['y'] -= hop * abs(math.sin(math.pi * ph))
                st['rot'] += 3.0 * math.sin(math.pi * ph * 2) * (t < 1)
                land = 1 - min(1, abs(ph - round(ph)) * 4)       # squash as each step lands
                st['s'] *= 1 - 0.035 * land
                st['sx'] = 1 + 0.07 * land
                st['lift'] = lift * abs(math.sin(math.pi * ph))
            else:
                st['lift'] = lift * math.sin(math.pi * t)
            return st
        self.moves.append((f, f + dur, fn, 'set', x, y, rot))
        if sfx and steps:
            for i in range(1, steps + 1):
                self.ev(f + dur * i / steps, 'step', i=i)
        elif sfx:
            self.ev(f, 'slide', dur=dur / FPS, soft=True)
        return self

    def shake(self, f, dur, amp=3.0):
        def fn(t, st, amp=amp):
            st['rot'] += amp * (1 if int(t * dur) % 2 else -1)
            return st
        self.moves.append((f, f + dur, fn, 'add'))
        return self

    def hide(self, f):
        self.gone = f
        return self

    def exit(self, f, dur, dx, dy, sfx=True):
        def fn(t, st):
            e = t * t
            st['x'] += dx * e; st['y'] += dy * e; st['lift'] = 12 * t
            return st
        self.moves.append((f, f + dur, fn, 'add'))
        self.gone = f + dur
        if sfx:
            self.ev(f, 'slide', dur=dur / FPS, soft=True)
        return self

    def state(self, f):
        if self.appear is not None and f < self.appear:
            return None
        if self.gone is not None and f >= self.gone:
            return None
        st = dict(self.home)
        # permanent 'set' moves update the home position once finished
        for m in sorted(self.moves, key=lambda m: m[0]):
            f0, f1, fn, kind = m[:4]
            if f < f0:
                continue
            t = clamp((f - f0) / max(1, f1 - f0))
            if 0 < t < 1:   # hand-placed increments are never perfectly even
                t = clamp(t + jit(self.key + 'sp', f, 0.07)[0])
            if kind == 'set':
                if f >= f1:
                    st['x'], st['y'] = m[4], m[5]
                    if m[6] is not None:
                        st['rot'] = m[6]
                    st['lift'] = 0
                else:
                    st = fn(t, st)
            elif f < f1:
                st = fn(t, st)
            elif kind == 'add' and self.gone is not None and f >= f0:
                st = fn(1.0, st)
        spr = self.spr
        for fs, sp in self.spr_swaps:
            if f >= fs:
                spr = sp
        moving = any(m[0] <= f < m[1] for m in self.moves)
        if self.rig is not None:
            spr = self.rig_body(f)
            if not moving:   # a hand re-poses the figure every few frames during holds
                st['rot'] += 1.3 * jit(self.key + 'pose', f // 7, 1)[0]
            for g0, g1, kind in self.gestures:
                if g0 <= f < g1:
                    k = f - g0
                    lean = {'point': -4, 'raise': -3.5, 'show': -3, 'shrug': 0,
                            'wave': (-3 if k % 4 < 2 else 1.5)}.get(kind, 0)
                    ramp = min(1, k / 2, (g1 - f) / 2)
                    st['rot'] += lean * ramp
        return dict(spr=spr, key=self.key, jitter=self.jitter * (2.2 if moving else 1.0), **st)

    # ---- jointed cut-out figure
    rig = None

    def rigged(self, rig, mood='worried', scale=1.0):
        self.rig, self.mood_track, self.gestures, self.rscale = rig, [(0, mood)], [], scale
        self.spr = rig.moods[mood]
        return self

    def mood(self, f, m):
        self.mood_track.append((f, m))
        return self

    def gesture(self, f0, dur, kind):
        self.gestures.append((f0, f0 + dur, kind))
        return self

    def cur_mood(self, f):
        m = 'calm'
        for fs, mm in self.mood_track:
            if f >= fs:
                m = mm
        return m

    def rig_body(self, f):
        m = self.cur_mood(f)
        # blink for one drawn frame roughly every 3 s
        if (f + sum(map(ord, self.key)) % 17) % 37 == 0:
            m = 'blinkw' if m == 'worried' else 'blink'
        return self.rig.moods[m]

    def arm_angles(self, f, st):
        m = self.cur_mood(f)
        l, r = (-8, 8) if m != 'worried' else (18, -18)   # worried: arms clutched in
        walking = [mv for mv in self.moves if mv[0] <= f < mv[1] and len(mv) > 4 and mv[3] == 'set']
        if walking:
            ph = (f - walking[0][0]) / 2.0
            sw = 24 * math.sin(math.pi * ph)
            l, r = -10 + sw, 10 + sw
        for g0, g1, kind in self.gestures:
            if g0 <= f < g1:
                k = f - g0
                if kind == 'wave':
                    r = 150 + (22 if k % 4 < 2 else -8)
                elif kind == 'point':
                    r = 95
                elif kind == 'shrug':
                    l, r = -60, 60
                elif kind == 'raise':
                    r = 165
                elif kind == 'show':
                    r = 112 + (4 if k % 6 < 3 else 0)
        return l, r

    def arm_elements(self, f, st):
        rg = self.rig
        s = st['s'] * self.rscale
        l, r = self.arm_angles(f, st)
        out = []
        for side, ang, spr in ((-1, l, rg.arm_l), (1, r, rg.arm_r)):
            sx, sy = rg.shoulder
            px = st['x'] + side * sx * s
            py = st['y'] + sy * s
            a = ang + st['rot']
            d = spr.pivot_d * s
            cx = px + d * math.sin(math.radians(a))
            cy = py + d * math.cos(math.radians(a))
            out.append(dict(spr=spr, key=self.key + ('L' if side < 0 else 'R'), x=cx, y=cy, rot=a, s=s,
                            lift=st['lift'], jitter=0.5))
            prop = getattr(self, 'prop', None)
            if side > 0 and prop is not None and prop[1] <= f < prop[2]:
                hx = px + 2 * d * math.sin(math.radians(a))
                hy = py + 2 * d * math.cos(math.radians(a))
                out.append(dict(spr=prop[0], key=self.key + 'P', x=hx, y=hy - 20 * s, rot=st['rot'], s=s,
                                lift=st['lift'], jitter=0.5))
        return out

    def hold(self, spr, f0, f1):
        self.prop = (spr, f0, f1)
        return self


class Scene:
    def __init__(self, name, bars, bg):
        self.name, self.bars, self.bg = name, bars, bg
        self.frames = bars * 32
        self.actors = []
        self.start = 0
        self.extra = []        # functions f -> list of element dicts (for procedural pieces)
        self.events = []

    def ev(self, f, kind, **kw):
        self.events.append((f, kind, kw))

    def elements(self, f):
        els = []
        for a in self.actors:
            st = a.state(f)
            if st is not None:
                els.append((a.z, st))
                if a.rig is not None:
                    for e in a.arm_elements(f, st):
                        els.append((a.z + 0.01, e))
        for fn in self.extra:
            for z, e in fn(f):
                els.append((z, e))
        els.sort(key=lambda t: t[0])
        return [e for _, e in els]
