#!/usr/bin/env python
"""Derived textures (owner: A1): maps made from a swatch that already exists, no image generation involved. Idempotent: it rewrites the file and
the manifest entry every run, from the same source, to the same bytes.

    python la-ladera/tools/textures/derive.py [--only paint_peeling_soft] [--sheet out.png]

paint_peeling_soft
    A2 asked for a calmer peeling-paint map: the lead read paint_peeling (white paint islands on mid-grey bare plaster) as camouflage on the pink
    facade. Same material shape (tintable grey albedo) and the same mean brightness as its source, but the spread is about a third of it
    (about 0.71 .. 0.89 against 0.62 .. 1.0), flakes about half the size, paint still the majority and no large dark islands, so a tint reads
    as sun-faded painted plaster with the odd chip.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'textures'))


def load_gray(name):
    return np.asarray(Image.open(os.path.join(TEX, name)).convert('L'), dtype=np.float64) / 255.0


def smooth(img, sigma):
    """Wrap-around gaussian blur (the swatches tile, so the blur must not darken the borders). FFT based, no scipy needed."""
    n, m = img.shape
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(m)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(img) * g))


def paint_peeling_soft(src):
    n = src.shape[0]
    lo, hi = np.percentile(src, [3, 97])
    u = np.clip((src - lo) / max(hi - lo, 1e-6), 0.0, 1.0)             # 0 = bare plaster, 1 = fresh paint
    half = np.asarray(Image.fromarray((u * 255).astype(np.uint8)).resize((n // 2, n // 2), Image.LANCZOS), dtype=np.float64) / 255.0
    a = np.tile(half, (2, 2))                                          # flakes at half the size; the source is periodic, so this is too
    b = np.roll(np.tile(np.rot90(half), (2, 2)), (n // 3, n // 5), axis=(0, 1))     # a turned, shifted copy so the repeat is not exact
    m = smooth(0.6 * a + 0.4 * b, 0.6)                                 # a touch of softness: sun-faded, not crisp
    m = np.clip((m - 0.25) / 0.55, 0.0, 1.0) ** 0.55                   # paint stays the majority: most of the frame sits near 1
    out = 0.80 + 0.20 * m                                              # floor 0.80: a flake is a shade darker, never a dark island
    # Same overall brightness as the swatch it replaces. The strip at the foot of a wall sits under plaster_rough (mean 0.86); a lighter map
    # would read as a pale band, and sRGB 0.96 vs 0.86 is about 30% more light.
    return out * (src.mean() / out.mean())


DERIVED = {
    'paint_peeling_soft': {
        'from': 'paint_peeling.jpg', 'fn': paint_peeling_soft, 'file': 'paint_peeling_soft.jpg', 'tint': True,
        'tileScale': None,     # same swatch geometry as its source (copied from the manifest)
    },
}


def main():
    argv = sys.argv[1:]
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else list(DERIVED)
    sheet = argv[argv.index('--sheet') + 1] if '--sheet' in argv else None
    mpath = os.path.join(TEX, 'manifest.json')
    manifest = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {'textures': {}}
    tex = manifest.setdefault('textures', {})
    tiles = []
    for name in only:
        d = DERIVED[name]
        src = load_gray(d['from'])
        out = np.clip(d['fn'](src), 0.0, 1.0)
        img = Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'L').convert('RGB')
        img.save(os.path.join(TEX, d['file']), quality=88, optimize=True, subsampling=0)
        base = tex.get(d['from'].rsplit('.', 1)[0], {})
        mean = float(out.mean())
        g = int(round(mean * 255))
        tex[name] = {'map': d['file'], 'tint': d['tint'], 'tileScale': base.get('tileScale', 1.0), 'avg': '#%02x%02x%02x' % (g, g, g), 'size': out.shape[0]}
        print('%s: mean %.3f  p1 %.3f  p50 %.3f  p99 %.3f  min %.3f  -> %s (%d bytes)' % (name, mean, *np.percentile(out, [1, 50, 99]), out.min(), d['file'], os.path.getsize(os.path.join(TEX, d['file']))))
        tiles.append(np.concatenate([src, out], axis=1))
    json.dump(manifest, open(mpath, 'w', encoding='utf-8'), indent=1)
    open(mpath, 'a', encoding='utf-8').write('\n')
    if sheet and tiles:
        Image.fromarray((np.concatenate(tiles, axis=0) * 255).astype(np.uint8), 'L').save(sheet)


if __name__ == '__main__':
    main()
