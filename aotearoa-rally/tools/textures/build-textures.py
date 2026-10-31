#!/usr/bin/env python3
"""Turn raw generated PNGs (NAME.png per entry in specs.py) into the shipped texture set.

Usage: build-textures.py RAW_DIR [OUT_DIR] [name ...]
  RAW_DIR  directory holding NAME.png files (default OUT_DIR = ../../assets/tex)
Writes NAME.jpg (+ NAME_n.jpg normal map) for road/ground/bark, NAME.webp (alpha) for foliage,
and manifest.json listing only the entries that were produced. Requires Pillow + numpy.
"""
import json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from specs import SPECS

NORMAL_ALSO = {"gnd_grass2", "gnd_schist", "gnd_limestone"}  # plus every road_* and rock_*
MAX_JPG = 600 * 1024
MAX_ROCK_JPG = 300 * 1024  # rock tiles: 1024 px, aim well under the 600 KB repo cap
MAX_WEBP = 300 * 1024


def to_square(im):
    w, h = im.size
    s = min(w, h)
    l, t = (w - s) // 2, (h - s) // 2
    return im.crop((l, t, l + s, t + s))


def gauss_wrap(a, sigma):
    """Wrapped gaussian blur over axes 0,1 via FFT."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    out = np.empty_like(a)
    if a.ndim == 2:
        return np.fft.ifft2(np.fft.fft2(a) * k).real
    for c in range(a.shape[2]):
        out[..., c] = np.fft.ifft2(np.fft.fft2(a[..., c]) * k).real
    return out


def flatten_light(a, strength=0.85):
    """Divide out large-scale lighting, keep mean colour."""
    sigma = a.shape[0] / 6.0
    blur = np.maximum(gauss_wrap(a, sigma), 1.0)
    mean = a.reshape(-1, a.shape[2]).mean(0)
    flat = a / blur * mean
    return a * (1 - strength) + flat * strength


def make_seamless(a):
    """Blend with half-offset copy using sin^2 weight (0 at edges, 1 at centre)."""
    h, w = a.shape[:2]
    wy = np.sin(np.pi * (np.arange(h) + 0.5) / h) ** 2
    wx = np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 2
    m = (wy[:, None] * wx[None, :])[..., None]
    sh = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    return a * m + sh * (1 - m)


def restore_contrast(out, ref):
    """Blending lowers variance; match per-channel std of reference (about mean)."""
    for c in range(out.shape[2]):
        so, sr = out[..., c].std(), ref[..., c].std()
        if so > 1e-3:
            mu = out[..., c].mean()
            out[..., c] = (out[..., c] - mu) * min(sr / so, 1.6) + mu
    return out


def save_jpg(im, path, q=85, limit=MAX_JPG):
    while True:
        im.save(path, "JPEG", quality=q, optimize=True, progressive=True)
        if os.path.getsize(path) <= limit or q <= 50:
            return q
        q -= 4


def normal_map(rgb, size=512, strength=2.0):
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32) / 255.0
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    lum = gauss_wrap(lum, 0.8)
    r = lambda dy, dx: np.roll(lum, (dy, dx), axis=(0, 1))
    # np.roll(+1) gives the previous row/col; r(-1,..) is the next one.
    dx = (r(-1, -1) + 2 * r(0, -1) + r(1, -1)) - (r(-1, 1) + 2 * r(0, 1) + r(1, 1))
    dy = (r(-1, -1) + 2 * r(-1, 0) + r(-1, 1)) - (r(1, -1) + 2 * r(1, 0) + r(1, 1))
    dx /= 8.0  # d lum / d x (to the right)
    dy /= 8.0  # d lum / d row (downwards)
    nx = -dx * strength * 4
    ny = dy * strength * 4  # +Y up (OpenGL): image rows go down, so sign flips
    nz = np.ones_like(nx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx * inv, ny * inv, nz * inv], -1)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8))


def build_tile(name, raw, out, kind, size):
    im = to_square(Image.open(raw).convert("RGB")).resize((size, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32)
    a = flatten_light(a, 0.85)
    ref = a
    a = make_seamless(a)
    a = restore_contrast(a, ref)
    a = a.clip(0, 255)
    img = Image.fromarray(a.round().astype(np.uint8))
    save_jpg(img, os.path.join(out, name + ".jpg"), 85, MAX_ROCK_JPG if kind == "rock" else MAX_JPG)
    nfile = None
    if kind in ("road", "rock") or name in NORMAL_ALSO:
        nfile = name + "_n.jpg"
        save_jpg(normal_map(a), os.path.join(out, nfile), 85)
    return name + ".jpg", nfile, False


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def bleed(rgb, valid, iters=40):
    rgb = rgb.copy()
    valid = valid.copy()
    for _ in range(iters):
        if valid.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(valid.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                v = np.roll(valid, (dy, dx), (0, 1))
                acc += np.roll(rgb, (dy, dx), (0, 1)) * v[..., None]
                cnt += v
        fill = (~valid) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][:, None]
        valid = valid | fill
    if not valid.all():
        rgb[~valid] = rgb[valid].mean(0)
    return rgb


def build_foliage(name, raw, out, size):
    a = np.asarray(Image.open(raw).convert("RGB"), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g  # magenta-ness
    alpha = 1.0 - smoothstep(55, 150, m)
    # de-spill: pull R and B down to G where magenta leaks
    spill = np.clip(np.minimum(r, b) - g, 0, None) * (alpha > 0)
    a[..., 0] -= spill
    a[..., 2] -= spill
    a = a.clip(0, 255)
    ys, xs = np.nonzero(alpha > 0.08)
    if len(ys) < 500:
        raise ValueError("no subject found (background not magenta?)")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    edge = (y0 <= 2) or (x0 <= 2) or (y1 >= a.shape[0] - 2) or (x1 >= a.shape[1] - 2)
    s = max(y1 - y0, x1 - x0)
    pad = int(s * 0.04)
    s += 2 * pad
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    top, left = cy - s // 2, cx - s // 2
    canvas_rgb = np.zeros((s, s, 3), np.float32)
    canvas_a = np.zeros((s, s), np.float32)
    sy0, sx0 = max(top, 0), max(left, 0)
    sy1, sx1 = min(top + s, a.shape[0]), min(left + s, a.shape[1])
    canvas_rgb[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = a[sy0:sy1, sx0:sx1]
    canvas_a[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = alpha[sy0:sy1, sx0:sx1]
    pm = canvas_rgb * canvas_a[..., None]
    pm_im = Image.fromarray(pm.clip(0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    a_im = Image.fromarray((canvas_a * 255).round().astype(np.uint8)).resize((size, size), Image.LANCZOS)
    pmr = np.asarray(pm_im, dtype=np.float32)
    al = np.asarray(a_im, dtype=np.float32) / 255.0
    rgb = pmr / np.maximum(al, 1e-3)[..., None]
    rgb = rgb.clip(0, 255)
    valid = al > 0.25
    rgb = bleed(rgb, valid)
    # keep real colour where partially covered
    out_rgba = np.dstack([rgb, al * 255]).round().astype(np.uint8)
    img = Image.fromarray(out_rgba, "RGBA")
    path = os.path.join(out, name + ".webp")
    q = 85
    while True:
        img.save(path, "WEBP", quality=q, method=6, exact=True)
        if os.path.getsize(path) <= MAX_WEBP or q <= 50:
            break
        q -= 5
    if edge:
        print(f"  warning: {name} subject touches raw image border (cropped?)")
    return name + ".webp", None, True


def write_manifest(mpath, textures):
    ordered = {k: textures[k] for k in SPECS if k in textures}
    with open(mpath, "w") as fh:
        json.dump({"version": 1, "textures": ordered}, fh, indent=1)


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    raw_dir = args[0]
    rest = args[1:]
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "tex"))
    names = []
    for x in rest:
        if x in SPECS:
            names.append(x)
        else:
            out = x
    os.makedirs(out, exist_ok=True)
    mpath = os.path.join(out, "manifest.json")
    textures = {}
    if names and os.path.exists(mpath):  # partial rebuild keeps prior entries
        textures = json.load(open(mpath))["textures"]
    for name in (names or SPECS):
        kind, size, meters, _ = SPECS[name]
        raw = os.path.join(raw_dir, name + ".png")
        if not os.path.exists(raw):
            print(f"skip {name}: no raw")
            continue
        try:
            if kind == "foliage":
                f, n, al = build_foliage(name, raw, out, size)
            else:
                f, n, al = build_tile(name, raw, out, kind, size)
        except Exception as e:  # keep going; manifest only lists successes
            print(f"FAIL {name}: {e}")
            textures.pop(name, None)
            continue
        textures[name] = {"file": f, "normal": n, "alpha": al, "size": size, "meters": meters}
        print("ok", name, os.path.getsize(os.path.join(out, f)) // 1024, "KB")
        write_manifest(mpath, textures)
    write_manifest(mpath, textures)
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f"total {total / 1048576:.1f} MB in {out}")


if __name__ == "__main__":
    main()
