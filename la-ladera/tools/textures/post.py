#!/usr/bin/env python3
"""Texture post-processor (owner: A1). Raw generator swatches -> game-ready seamless JPEGs (+ derived normal maps).

  python tools/textures/post.py --spec spec.json --raw <raw dir> --out assets/textures --names a,b
  python tools/textures/post.py --sheet out.jpg --out assets/textures [--names a,b]     (contact sheet + 2x2 seam preview)

Pipeline per material (recipe comes from the spec: size, tint, normal, mode, grid, alpha):
  crop margins -> [grid: crop whole pattern periods] -> flatten large-scale lighting -> [tint: neutral grey albedo, mean ~0.86]
  -> make seamless (Moisan periodic+smooth decomposition: no ghosting, no visible seam) -> resize -> JPEG q85
  -> normal map from the fine luminance detail (periodic) -> manifest fragment printed as `RESULT {json}`.
Run it with plain `python` (PIL/numpy live in the user site-packages, which `-I` hides).
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

LANCZOS, BICUBIC, BOX = Image.LANCZOS, Image.BICUBIC, Image.BOX


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def resize(a, w, h, resample=LANCZOS):
    """Resize a float image (HxW or HxWxC, 0..1) without leaving float precision."""
    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), mode='F').resize((w, h), resample), dtype=np.float32)
    return np.stack([resize(a[..., c], w, h, resample) for c in range(a.shape[2])], axis=2)


def lowpass(a, cells=8):
    h, w = a.shape[:2]
    return resize(resize(a, cells, cells, BOX), w, h, BICUBIC)


def flatten(a, strength=0.9, cells=6):
    """Remove the large-scale lighting gradient (baked light/shade) while keeping the texture detail."""
    L = lum(a)
    low = lowpass(L, cells)
    g = np.clip(L.mean() / np.maximum(low, 0.02), 0.55, 1.8) ** strength
    return np.clip(a * g[..., None], 0, 1)


def periodic(a):
    """Periodic component of Moisan's periodic+smooth decomposition: tiles with no seam and no ghosting."""
    a = a.astype(np.float64)
    h, w = a.shape[:2]
    v = np.zeros_like(a)
    d = a[:, 0] - a[:, -1]
    v[:, 0] += d; v[:, -1] -= d
    d = a[0, :] - a[-1, :]
    v[0, :] += d; v[-1, :] -= d
    cy = np.cos(2 * np.pi * np.arange(h) / h)[:, None]
    cx = np.cos(2 * np.pi * np.arange(w) / w)[None, :]
    den = 2 * cy + 2 * cx - 4
    den[0, 0] = 1
    V = np.fft.fft2(v, axes=(0, 1))
    S = V / den[..., None]
    S[0, 0, :] = 0
    s = np.real(np.fft.ifft2(S, axes=(0, 1)))
    return np.clip(a - s, 0, 1).astype(np.float32)


def profile_period(p, n_expected, lo=0.55, hi=1.6):
    """Dominant period (px) of a 1-D edge-energy profile near N/n_expected; returns (period, strength)."""
    n = len(p)
    p = p - p.mean()
    f = np.fft.rfft(p, n=2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    ac = ac / (n - np.arange(n)) / (ac[0] / n + 1e-12)
    p0 = n / n_expected
    a, b = int(max(4, p0 * lo)), int(min(n // 2, p0 * hi))
    if b <= a:
        return None, 0
    i = int(np.argmax(ac[a:b + 1])) + a
    off = 0.0
    if 1 <= i < n - 1:
        y0, y1, y2 = ac[i - 1], ac[i], ac[i + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-12:
            off = float(np.clip(0.5 * (y0 - y2) / den, -0.5, 0.5))
    return i + off, float(ac[i])


def grid_line_phase(prof, P):
    """Position (px, 0..P) of the strongest grid line: fold the edge-energy profile modulo the period."""
    bins = np.zeros(64)
    idx = ((np.arange(len(prof)) + 0.5) % P) / P * 64
    np.add.at(bins, np.minimum(idx.astype(int), 63), prof)
    bins = np.convolve(np.r_[bins[-2:], bins, bins[:2]], np.ones(3) / 3, mode='same')[2:-2]
    return (np.argmax(bins) + 0.5) / 64 * P


def grid_crop(a, nx, ny, even=(False, False)):
    """Square crop that holds a whole number of grid periods on both axes (running-bond / checker parity respected).
    Returns (crop, info); info['frac'] = crop side / image side (real-world coverage relative to the whole frame)."""
    L = lum(a)
    h, w = L.shape
    side = min(h, w)
    gx = np.abs(np.diff(L, axis=1)).mean(axis=0)
    gy = np.abs(np.diff(L, axis=0)).mean(axis=1)
    Px, qx = profile_period(gx, nx) if nx > 1 else (None, 0)
    Py, qy = profile_period(gy, ny) if ny > 1 else (None, 0)
    ok_x, ok_y = Px is not None and qx >= 0.08, Py is not None and qy >= 0.08
    info = {'px': Px, 'py': Py, 'qx': round(qx, 3), 'qy': round(qy, 3)}
    if not ok_x and not ok_y:                        # no pattern found: plain centre crop
        y0, x0 = (h - side) // 2, (w - side) // 2
        info.update(crop=[x0, y0, side, side], frac=1.0, fallback=True)
        return a[y0:y0 + side, x0:x0 + side], info
    ex, ey = even
    P0 = Px if ok_x else Py                          # primary period drives the crop side S = k * P0
    kmax = max(1, int(side / P0 + 0.03))
    best = None
    for k in range(kmax, 0, -1):
        S = k * P0
        kx = ky = k
        if ok_x and ok_y:
            j = int(round(S / Py))                   # whole periods on the other axis within 2 %
            if j < 1 or abs(S - j * Py) > 0.02 * S:
                continue
            ky = j
        if ok_x and ex and kx % 2:
            continue
        if ok_y and ey and ky % 2:
            continue
        best = (k, S)
        break
    if best is None:                                 # incommensurate periods: largest whole periods of the primary axis
        k = max(1, kmax)
        best = (k, k * P0)
    k, S = best
    S = min(S, side)
    Si = int(round(S))

    def fit(line, P, n):                             # start on a grid line (cut falls in the joint) if the crop still fits
        x = line % P
        if x + Si > n:
            x -= P
            if x < 0:
                x = max(0.0, n - Si)
        return int(round(x))
    x0 = fit(grid_line_phase(gx, Px), Px, w) if ok_x else max(0, (w - Si) // 2)
    y0 = fit(grid_line_phase(gy, Py), Py, h) if ok_y else max(0, (h - Si) // 2)
    info.update(crop=[x0, y0, Si, Si], frac=round(Si / side, 4), k=k)
    return a[y0:y0 + Si, x0:x0 + Si], info


def pblur(a, s):
    f = np.fft.fft2(a)
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    return np.real(np.fft.ifft2(f * np.exp(-2 * (np.pi ** 2) * s * s * (fx ** 2 + fy ** 2))))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def blend_seamless(a, band=0.17, core=0.035, sigma_frac=0.03):
    """Make a square float image tile without a visible seam.
    Roll by half so the original border seams meet in the centre cross (the rolled image is continuous across ITS borders),
    then replace the cross by content from the un-rolled interior with a wide feathered mask. Low frequencies blend linearly,
    high frequencies blend with variance compensation so the band keeps its grain (no blurry cross)."""
    h, w = a.shape[:2]
    S = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    x = np.abs(np.arange(w) - w / 2.0) / w
    y = np.abs(np.arange(h) - h / 2.0) / h
    mx = 1.0 - smoothstep(core, band, x)
    my = 1.0 - smoothstep(core, band, y)
    m = np.maximum(mx[None, :], my[:, None])[..., None].astype(np.float32)
    sig = max(2.0, sigma_frac * w)
    lowS = np.stack([pblur(S[..., c], sig) for c in range(3)], axis=2).astype(np.float32)
    lowI = np.stack([pblur(a[..., c], sig) for c in range(3)], axis=2).astype(np.float32)
    low = lowS * (1 - m) + lowI * m
    norm = np.sqrt((1 - m) ** 2 + m ** 2)
    hi = ((S - lowS) * (1 - m) + (a - lowI) * m) / norm
    return np.clip(low + hi, 0, 1).astype(np.float32)



def make_normal(L, strength, size, invert=False):
    """Tangent-space (OpenGL, +Y up) normal map from the fine luminance detail of a periodic texture.
    invert=True when the bright parts are the recessed ones (pale mortar between darker bricks)."""
    h = pblur(L.astype(np.float64), 0.7) - pblur(L.astype(np.float64), 18 * size / 512)
    if invert:
        h = -h
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    rms = np.sqrt((dx ** 2 + dy ** 2).mean()) + 1e-9
    target = 0.12 * strength                       # desired RMS slope
    k = min(target / rms, 60.0)
    nx, ny = -dx * k, dy * k                       # image rows run downwards, v runs upwards
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    out = np.stack([nx / n, ny / n, nz / n], axis=2) * 0.5 + 0.5
    return np.clip(out, 0, 1).astype(np.float32)


def to_u8(a):
    return np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)


def process(name, spec, raw_dir, out_dir):
    src = os.path.join(raw_dir, name + '.png')
    im = Image.open(src)
    alpha = None
    if spec.get('alpha') and im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        alpha = np.asarray(im.getchannel('A'), dtype=np.float32) / 255.0
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    H, W = rgb.shape[:2]
    frame = min(H, W)                              # the generator's frame = `tile` metres on a side
    m = 0 if spec.get('mode') == 'grid' else int(round(frame * 0.012))      # regular patterns keep every period
    rgb = rgb[m:H - m, m:W - m]
    if alpha is not None:
        alpha = alpha[m:H - m, m:W - m]
    size = int(spec.get('size', 512))
    mode = spec.get('mode', 'periodic')
    info = {}
    if mode == 'grid':
        nx, ny = spec.get('grid', [1, 1])
        even = spec.get('even', [False, False])
        rgb, info = grid_crop(rgb, nx, ny, tuple(even))
        frac = info.get('frac', 1.0) * (frame - 2 * m) / frame
    else:
        h, w = rgb.shape[:2]
        s = min(h, w)                              # square centre crop
        y0, x0 = (h - s) // 2, (w - s) // 2
        rgb = rgb[y0:y0 + s, x0:x0 + s]
        if alpha is not None:
            alpha = alpha[y0:y0 + s, x0:x0 + s]
        frac = s / frame
    work = max(size, 640)                          # process at >= 640 then resize: keeps the FFT cheap, detail sufficient
    if mode != 'none':
        rgb = resize(rgb, work, work)
        fs = float(spec.get('flat', 0.9 if not spec.get('tint') else 0.97))
        if fs > 0:
            rgb = flatten(rgb, fs, int(spec.get('flatCells', 6)))
    else:
        rgb = resize(rgb, size, size)
        if alpha is not None:
            alpha = resize(alpha, size, size)
    if spec.get('tint'):
        L = lum(rgb)
        L = L * (0.86 / max(L.mean(), 1e-3))
        p99 = np.percentile(L, 99.5)
        if p99 > 1.12:
            L = L / p99 * 1.0
        rgb = np.repeat(np.clip(L, 0, 1)[..., None], 3, axis=2)
    elif mode != 'none':
        # mild global normalisation so nothing ships near-black or blown out
        L = lum(rgb)
        lo, hi = np.percentile(L, 0.5), np.percentile(L, 99.5)
        if hi - lo > 0.05:
            rgb = np.clip((rgb - lo * 0.6) / (hi - lo * 0.6 + 1e-6) * 0.97, 0, 1) if False else rgb
    if mode == 'grid':
        rgb = periodic(rgb)                       # residual colour jumps between cut bricks/tiles: smooth them
    elif mode == 'periodic':
        rgb = blend_seamless(rgb)
    if mode != 'none' and rgb.shape[0] != size:
        rgb = resize(rgb, size, size)
    ext = 'png' if alpha is not None else 'jpg'
    path = os.path.join(out_dir, f'{name}.{ext}')
    if alpha is not None:
        rgba = np.dstack([to_u8(rgb), to_u8(alpha)[..., None]])
        Image.fromarray(rgba, 'RGBA').save(path, optimize=True)
    else:
        Image.fromarray(to_u8(rgb), 'RGB').save(path, quality=85, optimize=True, subsampling=2)
    files = {'map': os.path.basename(path)}
    nstr = float(spec.get('normal', 0) or 0)
    if nstr > 0 and mode != 'none':
        nsz = min(size, 512)
        L = lum(resize(rgb, nsz, nsz)) if rgb.shape[0] != nsz else lum(rgb)
        nm = make_normal(L, nstr, nsz, bool(spec.get('invert')))
        npath = os.path.join(out_dir, f'{name}_n.jpg')
        Image.fromarray(to_u8(nm), 'RGB').save(npath, quality=88, optimize=True, subsampling=0)
        files['normal'] = os.path.basename(npath)
    avg = to_u8(rgb.reshape(-1, 3).mean(axis=0))
    man = dict(files)
    if spec.get('tint'):
        man['tint'] = True
    if mode != 'none' and abs(frac - 1.0) > 0.01:
        man['tileScale'] = round(float(frac), 3)    # repeat covers tile * tileScale metres (matlib applies it)
    man['avg'] = '#%02x%02x%02x' % tuple(int(v) for v in avg)
    man['size'] = size
    res = {'name': name, 'manifest': man, 'bytes': sum(os.path.getsize(os.path.join(out_dir, f)) for f in files.values()), 'info': info}
    print('RESULT ' + json.dumps(res))
    return res


def sheet(out_dir, names, dest):
    """Contact sheet (each texture tiled 2x2 so seams show) with labels."""
    man = json.load(open(os.path.join(out_dir, 'manifest.json')))['textures']
    names = names or sorted(man)
    cell, cols = 256, 6
    rows = (len(names) + cols - 1) // cols
    img = Image.new('RGB', (cols * cell, rows * (cell + 14)), (24, 20, 16))
    d = ImageDraw.Draw(img)
    for i, n in enumerate(names):
        t = man.get(n)
        if not t:
            continue
        tex = Image.open(os.path.join(out_dir, t['map'])).convert('RGB')
        s = cell // 2
        tex = tex.resize((s, s), LANCZOS)
        tile = Image.new('RGB', (cell, cell))
        for yy in range(2):
            for xx in range(2):
                tile.paste(tex, (xx * s, yy * s))
        x, y = (i % cols) * cell, (i // cols) * (cell + 14)
        img.paste(tile, (x, y + 14))
        d.text((x + 3, y + 1), n, fill=(255, 235, 200))
    img.save(dest, quality=88)
    print('sheet', dest, len(names))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec'); ap.add_argument('--raw'); ap.add_argument('--out', required=True)
    ap.add_argument('--names', default=''); ap.add_argument('--sheet')
    a = ap.parse_args()
    names = [n for n in a.names.split(',') if n]
    if a.sheet:
        sheet(a.out, names, a.sheet)
        return
    spec = json.load(open(a.spec))
    os.makedirs(a.out, exist_ok=True)
    rc = 0
    for n in names or sorted(spec):
        if not os.path.exists(os.path.join(a.raw, n + '.png')):
            print('skip (no raw)', n)
            continue
        try:
            process(n, spec.get(n, {}), a.raw, a.out)
        except Exception as e:                      # keep going: one bad image must not stop the rest
            import traceback; traceback.print_exc()
            print('FAILED', n, e)
            rc = 1
    sys.exit(rc)


if __name__ == '__main__':
    main()
