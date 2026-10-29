from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tex'
SRC = ROOT / 'tex-src'


def seam_mask(h, w):
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)).astype(np.float32) / (h / 2.0)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)).astype(np.float32) / (w / 2.0)
    wy = 0.5 * (1.0 + np.cos(np.pi * np.clip(y, 0.0, 1.0)))
    wx = 0.5 * (1.0 + np.cos(np.pi * np.clip(x, 0.0, 1.0)))
    # The shifted source dominates the tile boundary; the original dominates
    # the central cross where the shift moved the source's old outer seam.
    return 1.0 - (1.0 - wy[:, None]) * (1.0 - wx[None, :])


def blend_seams(arr):
    a = np.asarray(arr, dtype=np.float32)
    h, w = a.shape[:2]
    shifted = np.roll(a, shift=(h // 2, w // 2), axis=(0, 1))
    m = seam_mask(h, w)
    if a.ndim == 3:
        m = m[..., None]
    return np.clip(shifted * m + a * (1.0 - m), 0, 255).astype(np.uint8)


def repair_wrap(arr, radius=8):
    a = np.asarray(arr, dtype=np.float32).copy()
    h, w = a.shape[:2]
    for axis, length in ((1, w), (0, h)):
        first = np.take(a, 0, axis=axis).copy()
        last = np.take(a, -1, axis=axis).copy()
        average = (first + last) * .5
        delta_first, delta_last = average - first, average - last
        for d in range(min(radius + 1, length // 2)):
            weight = .5 * (1.0 + math.cos(math.pi * d / (radius + 1.0)))
            idx_first = [slice(None)] * a.ndim
            idx_last = [slice(None)] * a.ndim
            idx_first[axis] = d
            idx_last[axis] = length - 1 - d
            a[tuple(idx_first)] += delta_first * weight
            a[tuple(idx_last)] += delta_last * weight
    return np.clip(a, 0, 255).astype(np.uint8)


def seam_metrics(arr):
    a = np.asarray(arr, dtype=np.float32)
    if a.ndim == 2:
        pass
    sx = float(np.abs(a[:, -1] - a[:, 0]).mean())
    sy = float(np.abs(a[-1] - a[0]).mean())
    nx = float(np.abs(np.diff(a, axis=1)).mean())
    ny = float(np.abs(np.diff(a, axis=0)).mean())
    rx = sx / max(nx, 1e-9)
    ry = sy / max(ny, 1e-9)
    ok = rx <= 1.5 and ry <= 1.5
    print(f'{sx:.3f}/{nx:.3f} ({rx:.2f}x), {sy:.3f}/{ny:.3f} ({ry:.2f}x) ' + ('PASS' if ok else 'FAIL'))
    return ok, (sx, nx, sy, ny)


def load_rgb(path, size, grayscale=False):
    im = Image.open(path).convert('RGB')
    if im.size != (size, size):
        im = im.resize((size, size), Image.Resampling.LANCZOS)
    a = np.asarray(im, dtype=np.uint8)
    if grayscale:
        lum = np.rint(a[..., 0] * .2126 + a[..., 1] * .7152 + a[..., 2] * .0722).astype(np.uint8)
        a = np.repeat(lum[..., None], 3, axis=2)
    return a


def process_albedo(inp, out, size=1024, grayscale=False):
    src = load_rgb(inp, int(size), grayscale)
    arr = blend_seams(src)
    quality = 88
    Image.fromarray(arr, 'RGB').save(out, 'WEBP', quality=quality, method=6)
    decoded = np.asarray(Image.open(out).convert('RGB'))
    ok, _ = seam_metrics(decoded)
    if not ok:
        # Fade a small edge correction into the tile to match the wrap boundary.
        arr = repair_wrap(arr, radius=8)
        Image.fromarray(arr, 'RGB').save(out, 'WEBP', quality=quality, method=6)
        decoded = np.asarray(Image.open(out).convert('RGB'))
        ok, _ = seam_metrics(decoded)
    print(f'{Path(out).name}: {decoded.shape[1]}x{decoded.shape[0]}, {Path(out).stat().st_size} bytes, ' + ('PASS' if ok else 'FAIL'))


def make_normal(albedo_path, out, strength=6.0):
    from scipy.ndimage import gaussian_filter
    rgb = np.asarray(Image.open(albedo_path).convert('RGB'), dtype=np.float32) / 255.0
    h = rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722
    h = gaussian_filter(h, sigma=1.5, mode='wrap')
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * .5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * .5
    nx, ny = -strength * dx, strength * dy  # image rows run opposite tangent +Y
    nz = np.ones_like(nx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx * inv, ny * inv, nz * inv), axis=-1)
    encoded = np.rint((normal * .5 + .5) * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(encoded, 'RGB').save(out, 'PNG', optimize=True)
    result = np.asarray(Image.open(out).convert('RGB'))
    ok, _ = seam_metrics(result)
    print(f'{Path(out).name}: {result.shape[1]}x{result.shape[0]}, {Path(out).stat().st_size} bytes, flat=[128,128,255], ' + ('PASS' if ok else 'FAIL'))


def make_water(out, size=1024):
    n = int(size)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx /= n; yy /= n
    # Integer lattice wave vectors make the field exactly periodic on the tile.
    waves = [
        (1, 0, .050, .3), (0, 1, .043, 1.2), (1, 1, .027, 2.0),
        (2, -1, .018, .7), (-1, 2, .014, 2.8), (5, 2, .0045, .4),
        (-3, 7, .0032, 1.8), (8, -5, .0020, 2.3),
    ]
    gx = np.zeros((n, n), np.float32); gy = np.zeros_like(gx)
    for kx, ky, amp, phase in waves:
        theta = (2 * np.pi * (kx * xx + ky * yy) + phase).astype(np.float32)
        c = np.cos(theta)
        gx += amp * (2 * np.pi * kx) * c
        gy += amp * (2 * np.pi * ky) * c
    strength = .42
    nx, ny = -gx * strength, gy * strength
    nz = np.ones_like(nx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx * inv, ny * inv, nz * inv), axis=-1)
    encoded = np.rint((normal * .5 + .5) * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(encoded, 'RGB').save(out, 'PNG', optimize=True)
    result = np.asarray(Image.open(out).convert('RGB'))
    ok, _ = seam_metrics(result)
    print(f'{Path(out).name}: {n}x{n}, {Path(out).stat().st_size} bytes, periodic integer waves, ' + ('PASS' if ok else 'FAIL'))


def smooth_value_noise(n, grid, rng):
    lattice = rng.random((grid, grid), dtype=np.float32)
    pos = (np.arange(n, dtype=np.float32) / n) * grid
    lo = np.floor(pos).astype(np.int32)
    f = pos - lo
    f = f * f * (3.0 - 2.0 * f)
    x0 = lo % grid; x1 = (x0 + 1) % grid
    y0 = lo % grid; y1 = (y0 + 1) % grid
    a = lattice[y0[:, None], x0[None, :]]
    b = lattice[y0[:, None], x1[None, :]]
    c = lattice[y1[:, None], x0[None, :]]
    d = lattice[y1[:, None], x1[None, :]]
    fx = f[None, :]; fy = f[:, None]
    top = a * (1.0 - fx) + b * fx
    bot = c * (1.0 - fx) + d * fx
    return top * (1.0 - fy) + bot * fy


def fbm(n, seed):
    rng = np.random.default_rng(seed)
    total = np.zeros((n, n), np.float32)
    amp_sum = 0.0
    for grid, amp in zip((4, 8, 16, 32, 64, 128), (1., .5, .25, .125, .0625, .03125)):
        total += smooth_value_noise(n, grid, rng) * amp
        amp_sum += amp
    return total / amp_sum


def make_noise(out, n=512):
    a = fbm(n, 621991)
    c = fbm(n, 517037)
    # One jittered feature point per cell; a periodic KD-tree gives wrapped F1.
    rng = np.random.default_rng(810221)
    cells = 20
    cy, cx = np.mgrid[0:cells, 0:cells]
    features = np.stack(((cx + rng.random((cells, cells))) / cells,
                         (cy + rng.random((cells, cells))) / cells), axis=-1).reshape(-1, 2)
    tree = cKDTree(features, boxsize=1.0)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    queries = np.stack(((xx.ravel() + .5) / n, (yy.ravel() + .5) / n), axis=-1)
    dist, _ = tree.query(queries, k=1, workers=-1)
    worley = (1.0 - np.clip(dist.reshape(n, n) * cells, 0.0, 1.0)).astype(np.float32)
    billow = np.abs(2.0 * fbm(n, 303187) - 1.0)
    rgba = np.stack((a, worley, c, billow), axis=-1)
    encoded = np.rint(rgba * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(encoded, 'RGBA').save(out, 'PNG', optimize=True)
    result = np.asarray(Image.open(out).convert('RGBA'))
    ok, _ = seam_metrics(result)
    print(f'{Path(out).name}: {n}x{n}, {Path(out).stat().st_size} bytes, RGBA procedural channels, ' + ('PASS' if ok else 'FAIL'))


def make_foam(out, n=512):
    # Periodic Worley ridges form a lacy network of foam-cell boundaries.
    rng = np.random.default_rng(902417)
    cells = 18
    cy, cx = np.mgrid[0:cells, 0:cells]
    features = np.stack(((cx + rng.random((cells, cells))) / cells,
                         (cy + rng.random((cells, cells))) / cells), axis=-1).reshape(-1, 2)
    tree = cKDTree(features, boxsize=1.0)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    queries = np.stack(((xx.ravel() + .5) / n, (yy.ravel() + .5) / n), axis=-1)
    dist, _ = tree.query(queries, k=2, workers=-1)
    f1 = dist[:, 0].reshape(n, n) * cells
    gap = (dist[:, 1] - dist[:, 0]).reshape(n, n) * cells
    # Vary ridge width and strength at several wrapped scales to avoid a uniform grid.
    variation = fbm(n, 410927)
    width = .018 + .025 * variation
    ridge = np.exp(-np.square(gap / width))
    # A few broad patches thicken into bright white foam pools within the lacework.
    pools = np.exp(-np.square((f1 - (.25 + .10 * variation)) / .075))
    value = np.clip(.20 + .68 * ridge * (.55 + .45 * variation) + .24 * pools * variation, 0, 1)
    gray = np.rint(value * 255).astype(np.uint8)
    rgb = np.repeat(gray[..., None], 3, axis=2)
    rgb = blend_seams(rgb)
    Image.fromarray(rgb, 'RGB').save(out, 'WEBP', quality=88, method=6)
    result = np.asarray(Image.open(out).convert('RGB'))
    ok, _ = seam_metrics(result)
    print(f'{Path(out).name}: {result.shape[1]}x{result.shape[0]}, {Path(out).stat().st_size} bytes, periodic Worley foam, ' + ('PASS' if ok else 'FAIL'))


def make_concrete(out, n=1024):
    rng = np.random.default_rng(145209)
    broad = fbm(n, 880231)
    stains = fbm(n, 114857)
    fine = fbm(n, 201619)
    aggregate = smooth_value_noise(n, 512, rng)
    yy, xx = np.mgrid[0:n, 0:n]
    panel_tone = (smooth_value_noise(n, 4, rng) - .5) * 8
    dx = np.minimum(np.abs(xx - 256), np.abs(xx - 768)).astype(np.float32)
    dy = np.minimum(np.abs(yy - 256), np.abs(yy - 768)).astype(np.float32)
    joints = np.maximum(np.exp(-np.square(dx / 1.25)), np.exp(-np.square(dy / 1.25)))
    gray = (148 + (broad - .5) * 24 + (stains - .5) * 13 + (fine - .5) * 6
            + (aggregate - .5) * 16 + panel_tone - joints * 7)
    arr = np.repeat(np.rint(gray).clip(0, 255).astype(np.uint8)[..., None], 3, axis=2)
    arr = blend_seams(arr)
    Image.fromarray(arr, 'RGB').save(out, 'WEBP', quality=88, method=6)
    result = np.asarray(Image.open(out).convert('RGB'))
    ok, _ = seam_metrics(result)
    if not ok:
        arr = repair_wrap(arr, radius=8)
        Image.fromarray(arr, 'RGB').save(out, 'WEBP', quality=88, method=6)
        result = np.asarray(Image.open(out).convert('RGB'))
        ok, _ = seam_metrics(result)
    print(f'{Path(out).name}: {result.shape[1]}x{result.shape[0]}, {Path(out).stat().st_size} bytes, procedural rooftop concrete, ' + ('PASS' if ok else 'FAIL'))


def contact_sheet():
    files = [
        'rock_red.webp', 'rock_red_n.png', 'rock_grey.webp', 'rock_grey_n.png',
        'grass.webp', 'sand.webp', 'snow.webp', 'ice.webp', 'concrete.webp',
        'metal_deck.webp', 'water_n.png', 'foam.webp', 'noise.png'
    ]
    cols, thumb, label, rows = 4, 192, 22, math.ceil(len(files) / 4)
    sheet = Image.new('RGB', (cols * thumb, rows * (thumb + label)), (24, 28, 35))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 14)
    except OSError:
        font = ImageFont.load_default()
    for i, name in enumerate(files):
        p = OUT / name
        im = Image.open(p).convert('RGB').resize((thumb, thumb), Image.Resampling.LANCZOS)
        x = (i % cols) * thumb; y = (i // cols) * (thumb + label)
        sheet.paste(im, (x, y))
        draw.text((x + 6, y + thumb + 3), name, fill=(245, 245, 245), font=font)
    sheet.save(SRC / 'contact-sheet-a.jpg', 'JPEG', quality=90, optimize=True)
    print(f'contact-sheet-a.jpg: {sheet.width}x{sheet.height}, {(SRC / "contact-sheet-a.jpg").stat().st_size} bytes')


def manifest():
    uses = {
        'rock_red.webp': ('srgb', 'Terracotta canyon wall albedo'),
        'rock_red_n.png': ('linear', 'Tangent-space normal for rock_red'),
        'rock_grey.webp': ('srgb', 'Volcanic basalt and granite albedo'),
        'rock_grey_n.png': ('linear', 'Tangent-space normal for rock_grey'),
        'grass.webp': ('srgb', 'Tropical grass and jungle floor albedo'),
        'sand.webp': ('srgb', 'Golden beach and desert sand albedo'),
        'snow.webp': ('srgb', 'Bright snow albedo'),
        'ice.webp': ('srgb', 'Blue teal glacial ice albedo'),
        'concrete.webp': ('srgb', 'City rooftop concrete albedo'),
        'metal_deck.webp': ('srgb', 'Worn painted steel launch-deck albedo'),
        'water_n.png': ('linear', 'Procedural ocean-surface tangent-space normal'),
        'foam.webp': ('linear', 'Greyscale sea-foam mask'),
        'noise.png': ('linear', 'Tileable shader noise: fBm, inverted Worley F1, fBm, billow')
    }
    data = {}
    for name, (color, use) in uses.items():
        with Image.open(OUT / name) as im:
            w, h = im.size
        data[name] = {'w': w, 'h': h, 'tileable': True, 'colorSpace': color, 'use': use}
    (OUT / 'manifest-a.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def check_all():
    files = [
        'rock_red.webp', 'rock_red_n.png', 'rock_grey.webp', 'rock_grey_n.png',
        'grass.webp', 'sand.webp', 'snow.webp', 'ice.webp', 'concrete.webp',
        'metal_deck.webp', 'water_n.png', 'foam.webp', 'noise.png'
    ]
    for name in files:
        path = OUT / name
        with Image.open(path) as im:
            size = im.size
            arr = np.asarray(im)
        ok, (sx, nx, sy, ny) = seam_metrics(arr)
        rx, ry = sx / max(nx, 1e-9), sy / max(ny, 1e-9)
        print(f'{name}: {size[0]}x{size[1]}, {path.stat().st_size} bytes, x={sx:.3f}/{nx:.3f} ({rx:.2f}x), y={sy:.3f}/{ny:.3f} ({ry:.2f}x), ' + ('PASS' if ok else 'FAIL'))
    data = json.loads((OUT / 'manifest-a.json').read_text(encoding='utf-8'))
    print(f'manifest-a.json: {len(data)} entries, {((OUT / "manifest-a.json").stat().st_size)} bytes')


def main():
    cmd = sys.argv[1]
    if cmd == 'albedo':
        process_albedo(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 1024)
    elif cmd == 'foam':
        make_foam(sys.argv[2])
    elif cmd == 'concrete':
        make_concrete(sys.argv[2])
    elif cmd == 'normal':
        make_normal(sys.argv[2], sys.argv[3])
    elif cmd == 'water':
        make_water(sys.argv[2])
    elif cmd == 'noise':
        make_noise(sys.argv[2])
    elif cmd == 'finalize':
        contact_sheet(); manifest()
    elif cmd == 'checkall':
        check_all()
    else:
        raise SystemExit(f'unknown command: {cmd}')

if __name__ == '__main__':
    main()
