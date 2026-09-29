"""Gouache cut-out stop-motion toolkit.

Everything is painted procedurally: a shape mask is roughened, filled with
opaque, chalky colour carrying directional brush streaks and dry-brush edges,
optionally mounted on a cut paper margin, and given a soft contact shadow.
"""
import math, hashlib, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter

W, H = 1920, 1080
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") + os.sep
F_BRUSH = FONTS + "caveat-brush-latin-400-normal.ttf"
F_HAND = FONTS + "kalam-latin-700-normal.ttf"
F_HANDL = FONTS + "kalam-latin-400-normal.ttf"
F_SERIF = FONTS + "fraunces-latin-600-normal.ttf"

PAPER = (238, 229, 208)
INK = (40, 44, 58)


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def noise(h, w, cell, seed, aspect=1.0):
    """Smooth value noise in [0,1]. aspect>1 stretches cells horizontally."""
    rng = np.random.default_rng(seed)
    cx = max(2, int(w / (cell * aspect)) + 3)
    cy = max(2, int(h / cell) + 3)
    small = rng.random((cy, cx)).astype(np.float32)
    im = Image.fromarray(small, 'F').resize((w, h), Image.BICUBIC)
    return np.clip(np.asarray(im), 0, 1)


def streaks(h, w, angle, seed, length=90, width=5):
    """Directional brush-stroke texture rotated to `angle` degrees."""
    d = int(math.hypot(h, w)) + 4
    n = noise(d, d, width, seed, aspect=length / width)
    n = 0.65 * n + 0.35 * noise(d, d, width * 3, seed + 7, aspect=length / width / 2)
    im = Image.fromarray(n.astype(np.float32), 'F').rotate(angle, Image.BILINEAR)
    a = np.asarray(im)
    oy, ox = (d - h) // 2, (d - w) // 2
    return a[oy:oy + h, ox:ox + w]


def _grain(h, w, seed):
    return 0.6 * noise(h, w, 1.5, seed) + 0.4 * noise(h, w, 4, seed + 1)


def brush_strokes(h, w, angle, seed, wmin, wmax, lmin, lmax, density=1.0, spread=14):
    """Distinct overlapping strokes of slightly different value, like loaded gouache brushes."""
    rng = np.random.default_rng(seed)
    im = Image.new('L', (w, h), 128)
    d = ImageDraw.Draw(im)
    avg = (wmin + wmax) / 2 * (lmin + lmax) / 2
    n = int(min(5000, w * h / avg * 1.6 * density)) + 3
    for i in range(n):
        cx, cy = rng.uniform(-wmax, w + wmax), rng.uniform(-wmax, h + wmax)
        a = math.radians(angle + rng.normal(0, spread))
        L = rng.uniform(lmin, lmax)
        wd = int(rng.uniform(wmin, wmax))
        val = int(np.clip(128 + rng.normal(0, 30), 40, 216))
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        d.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill=val, width=wd)
        r = wd / 2
        d.ellipse([cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r], fill=val)
    arr = gaussian_filter(np.asarray(im, np.float32), max(0.9, wmin * 0.18))
    return (arr - 128) / 128


def tooth(h, w, seed, k=1.0):
    """Embossed cold-press paper tooth (isotropic), as a multiplicative light factor."""
    t = 0.55 * noise(h, w, 3.5, seed) + 0.45 * noise(h, w, 9, seed + 1)
    e = (t - np.roll(np.roll(t, 2, 0), 2, 1))
    return 1 + 0.16 * k * e


def paint(mask, color, seed, angle=None, rough=1.0, dry=1.0, var=1.0, rim=0.10, stroke=None):
    """Paint an opaque gouache layer inside `mask` (float HxW 0..1). Returns RGBA float."""
    h, w = mask.shape
    rng = np.random.default_rng(seed)
    if angle is None:
        angle = rng.uniform(-35, 35)
    mb = gaussian_filter(mask, 1.4)
    r1 = noise(h, w, 7, seed + 1) - 0.5
    r2 = noise(h, w, 2.2, seed + 2) - 0.5
    a = np.clip((mb - 0.5 + rough * (0.26 * r1 + 0.14 * r2)) * 5 + 0.5, 0, 1)
    st = streaks(h, w, angle, seed + 3, length=40, width=2.5)
    # dry-brush: broken, streaky coverage near the edge of the shape
    interior = gaussian_filter(mask, 6)
    edgez = np.clip((0.85 - interior) * 2.4, 0, 1)
    brk = np.clip((st - 0.40) * 5, 0, 1)
    a = a * (1 - dry * 0.9 * edgez * (1 - brk))
    if stroke is None:
        m = max(8, min(h, w))
        stroke = (max(5, m / 16), max(9, m / 7), max(14, m / 5), max(30, m / 1.6))
    bs = brush_strokes(h, w, angle, seed + 11, *stroke)
    bs2 = brush_strokes(h, w, angle + 70, seed + 12, *stroke, density=0.35)
    pool = noise(h, w, 60, seed + 4) - 0.5
    v = 1 + var * (0.24 * bs + 0.10 * bs2 + 0.12 * pool + 0.05 * (st - 0.5))
    ridge = np.clip((mb - gaussian_filter(mask, 4)) * 3.5, 0, 1)  # pigment ridge at edge
    v = v * (1 - rim * ridge)
    c = np.array(color, np.float32)[None, None, :] * v[..., None]
    chalk = noise(h, w, 22, seed + 6)[..., None]
    c = c * (1 - 0.07 * chalk) + 255 * 0.07 * chalk  # matte, chalky lift
    speck = (noise(h, w, 1.3, seed + 7) > 0.9).astype(np.float32)[..., None]
    c = c * (1 - 0.06 * speck) + 250 * 0.06 * speck
    c = c * tooth(h, w, seed + 8)[..., None]
    out = np.zeros((h, w, 4), np.float32)
    out[..., :3] = np.clip(c, 0, 255)
    out[..., 3] = np.clip(a, 0, 1) * 255
    return out


def over(dst, src):
    """Alpha-composite float RGBA src over dst (same size)."""
    sa = src[..., 3:4] / 255
    da = dst[..., 3:4] / 255
    oa = sa + da * (1 - sa)
    rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa * 255], -1)


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def cut_margin(mask, px, seed):
    """Paper margin around a painted shape: dilated, with slightly faceted scissor cuts."""
    m = gaussian_filter(mask, px * 0.75)
    thr = 0.03 + 0.3 * noise(*mask.shape, 30, seed + 3)
    m = (m > thr).astype(np.float32)
    im = Image.fromarray((m * 255).astype(np.uint8), 'L')
    # faceting: shrink then grow with NEAREST for straight scissor segments
    h, w = mask.shape
    f = 5
    im = im.resize((max(1, w // f), max(1, h // f)), Image.BILINEAR).resize((w, h), Image.BILINEAR)
    m = (np.asarray(im) > 110).astype(np.float32)
    return gaussian_filter(m, 0.7)


class Sprite:
    def __init__(self, rgba, shadow=True, shadow_blur=5, cx=None, cy=None):
        self.img = to_img(rgba) if isinstance(rgba, np.ndarray) else rgba
        w, h = self.img.size
        self.cx = w / 2 if cx is None else cx
        self.cy = h / 2 if cy is None else cy
        self.shadow = None
        if shadow:
            a = self.img.split()[3]
            pad = shadow_blur * 3
            big = Image.new('L', (w + 2 * pad, h + 2 * pad), 0)
            big.paste(a, (pad, pad))
            big = big.filter(ImageFilter.GaussianBlur(shadow_blur))
            sh = Image.new('RGBA', big.size, (38, 28, 30, 0))
            sh.putalpha(big.point(lambda v: int(v * 0.42)))
            self.shadow = (sh, pad)


def mask_canvas(w, h):
    im = Image.new('L', (w, h), 0)
    return im, ImageDraw.Draw(im)


def m2f(im):
    return np.asarray(im, np.float32) / 255


def painted_shape(w, h, draw_fn, color, seed, margin=5, angle=None, shadow=True, rim=0.10, extra=None):
    """draw_fn(draw) draws the silhouette in white. extra: list of (draw_fn, color) painted on top."""
    pad = margin + 10
    im, d = mask_canvas(w + 2 * pad, h + 2 * pad)
    draw_fn(d, pad)
    base = m2f(im)
    layer = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
    if margin:
        cm = cut_margin(base, margin, seed)
        paper = paint(cm, PAPER, seed + 50, rough=0.0, dry=0.0, var=0.4, rim=0.0)
        paper[..., 3] = cm * 255
        layer = over(layer, paper)
    layer = over(layer, paint(base, color, seed, angle=angle, rim=rim, dry=0.6 if margin else 1.0))
    for i, ex in enumerate(extra or []):
        fn, col = ex[0], ex[1]
        opt = ex[2] if len(ex) > 2 else {}
        im2, d2 = mask_canvas(w + 2 * pad, h + 2 * pad)
        fn(d2, pad)
        m2 = m2f(im2) * (base > 0.2 if margin else 1)
        lay = paint(m2, col, seed + 100 + i * 13, rough=0.6, dry=0.5, rim=0.05)
        if opt.get('bloom'):     # watery, soft-edged wash
            lay[..., 3] = gaussian_filter(lay[..., 3], opt['bloom']) * opt.get('alpha', 0.7)
        layer = over(layer, lay)
    return Sprite(layer, shadow=shadow)


def text_mask(text, font, size, pad=10, spacing=0):
    f = ImageFont.truetype(font, size)
    lines = text.split('\n')
    boxes = [f.getbbox(l) for l in lines]
    asc, desc = f.getmetrics()
    lh = asc + desc + spacing
    w = max(b[2] - b[0] for b in boxes) + 2 * pad
    h = lh * len(lines) + 2 * pad
    im, d = mask_canvas(w, h)
    for i, l in enumerate(lines):
        b = f.getbbox(l)
        lw = b[2] - b[0]
        d.text(((w - lw) / 2 - b[0], pad + i * lh), l, font=f, fill=255)
    return im


def label(text, font=F_HAND, size=64, ink=INK, card=PAPER, seed=1, padx=40, pady=22,
          card_angle=None, shadow=True, torn=True, spacing=0):
    """Painted lettering on a cut paper strip."""
    tm = text_mask(text, font, size, pad=0, spacing=spacing)
    tw, th = tm.size
    w, h = tw + 2 * padx, th + 2 * pady
    pad = 14
    W2, H2 = w + 2 * pad, h + 2 * pad
    layer = np.zeros((H2, W2, 4), np.float32)
    if card is not None:
        rng = np.random.default_rng(seed)
        im, d = mask_canvas(W2, H2)
        pts = []
        n = 9
        j = 4 if torn else 1.5
        for i in range(n + 1):
            pts.append((pad + w * i / n + rng.uniform(-2, 2), pad + rng.uniform(-j, j)))
        for i in range(n + 1):
            pts.append((pad + w - w * i / n + rng.uniform(-2, 2), pad + h + rng.uniform(-j, j)))
        d.polygon(pts, fill=255)
        cm = m2f(im)
        layer = over(layer, paint(cm, card, seed, rough=0.25, dry=0.15, var=0.6, rim=0.04))
        layer[..., 3] = np.minimum(layer[..., 3], gaussian_filter(cm, 0.6) * 255)
    tmf = np.zeros((H2, W2), np.float32)
    tmf[pad + pady:pad + pady + th, pad + padx:pad + padx + tw] = m2f(tm)
    k = 1.0 if size >= 48 else 0.45
    ink_layer = paint(tmf, ink, seed + 9, angle=-10, rough=0.75 * k, dry=0.55 * k, var=1.3, rim=0.14)
    layer = over(layer, ink_layer)
    return Sprite(layer, shadow=shadow and card is not None)


def background(color, seed, angle=0, light=True):
    """A painted board: broad, overlapping opaque strokes on cold-press paper, lit by a lamp."""
    h, w = H, W
    base = np.ones((h, w), np.float32)
    bg = paint(base, color, seed, angle=angle, rough=0, dry=0, var=0.45, rim=0,
               stroke=(50, 130, 180, 620))
    bg[..., :3] *= tooth(h, w, seed + 40, k=0.8)[..., None]
    if light:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot((xx - w * 0.35) / w, (yy - h * 0.2) / h)
        bg[..., :3] *= (1.06 - 0.28 * d[..., None] ** 1.6)
    bg[..., 3] = 255
    return to_img(bg)


def jit(key, frame, amp):
    hsh = hashlib.md5(f"{key}:{frame}".encode()).digest()
    a = [(b / 255 - 0.5) * 2 for b in hsh[:3]]
    return a[0] * amp, a[1] * amp, a[2]


def compose(bg, elements, frame, flicker_seed=0):
    """elements: dicts with spr, x, y, [rot, s, lift, alpha, key, jitter]."""
    canvas = bg.copy()
    for e in elements:
        spr = e['spr']
        s = e.get('s', 1.0)
        if s <= 0.01 or e.get('alpha', 1) <= 0.01:
            continue
        key = e.get('key', id(spr))
        ja = e.get('jitter', 0.9)
        jx, jy, jr = jit(key, frame // 1, ja)
        rot = e.get('rot', 0) + jr * 0.5 * (ja > 0)
        lift = e.get('lift', 0)
        img = spr.img
        cx, cy = spr.cx, spr.cy
        if s != 1.0 or rot:
            sx = e.get('sx', 1.0)
            if s != 1.0 or sx != 1.0:
                nw, nh = max(1, int(img.width * s * sx)), max(1, int(img.height * s))
                img = img.resize((nw, nh), Image.BICUBIC)
                cx, cy = cx * s * sx, cy * s
            if rot:
                w0, h0 = img.size
                img = img.rotate(rot, Image.BICUBIC, expand=True)
                cx += (img.width - w0) / 2
                cy += (img.height - h0) / 2
        if e.get('alpha', 1) < 1:
            a = img.split()[3].point(lambda v, k=e['alpha']: int(v * k))
            img = img.copy(); img.putalpha(a)
        x = e['x'] + jx
        y = e['y'] + jy
        if spr.shadow is not None and e.get('shadow', True):
            sh, pad = spr.shadow
            if s != 1.0 or rot:
                shimg = img.split()[3].filter(ImageFilter.GaussianBlur(5 + lift * 0.3))
                sh = Image.new('RGBA', img.size, (38, 28, 30, 0))
                sh.putalpha(shimg.point(lambda v: int(v * 0.42 * min(1, e.get('alpha', 1)))))
                pad = 0
            off = 5 + lift
            canvas.alpha_composite(sh, (int(x - cx - pad + off * 0.8), int(y - cy - pad + off)))
        canvas.alpha_composite(img, (int(round(x - cx)), int(round(y - cy - lift * 0.3))))
    # exposure flicker + lamp warmth, like a real stop-motion stage
    rng = np.random.default_rng(frame * 7919 + flicker_seed)
    k = 1 + rng.normal(0, 0.018)
    warm = np.array([1 + rng.normal(0, 0.006), 1.0, 1 - rng.normal(0, 0.006)], np.float32)
    arr = np.asarray(canvas.convert('RGB'), np.float32)
    arr = boil(arr, frame) * k * warm
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


_BOIL = {}


def boil(arr, frame, amp=1.1, cell=48):
    """Tiny per-frame displacement so every painted edge 'lives', as in re-shot stop motion."""
    import cv2
    key = frame
    if key not in _BOIL:
        h, w = arr.shape[:2]
        dx = (noise(h // 4, w // 4, cell / 4, frame * 3 + 1) - 0.5) * 2 * amp
        dy = (noise(h // 4, w // 4, cell / 4, frame * 3 + 2) - 0.5) * 2 * amp
        dx = cv2.resize(dx, (w, h)); dy = cv2.resize(dy, (w, h))
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        _BOIL.clear()
        _BOIL[key] = (xx + dx, yy + dy)
    mx, my = _BOIL[key]
    return cv2.remap(arr, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
