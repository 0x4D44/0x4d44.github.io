import sys, os, json, time, math
import multiprocessing as mp
import numpy as np
from PIL import Image, ImageFilter
from gouache import compose, W, H
from board import FPS, ease_out
import scenes as S

SCN, TOTAL = S.build()
OUT = 'frames'
TR = 6  # transition frames: the next painted sheet is slid over the last one


def scene_at(g):
    for i, sc in enumerate(SCN):
        if sc.start <= g < sc.start + sc.frames:
            return i, g - sc.start
    return len(SCN) - 1, SCN[-1].frames - 1


def draw(i, f, g):
    sc = SCN[i]
    return compose(sc.bg, sc.elements(f), g, flicker_seed=i)


def frame(g):
    i, f = scene_at(g)
    img = draw(i, f, g)
    if i > 0 and f < TR:
        prev = SCN[i - 1]
        base = draw(i - 1, prev.frames - 1, g)
        t = ease_out((f + 1) / (TR + 1))
        x = int(W * (1 - t))
        sh = Image.new('L', (80, H), 0)
        for k in range(80):
            sh.paste(int(110 * (1 - k / 80) ** 2), (79 - k, 0, 80 - k, H))
        dark = Image.new('RGB', (80, H), (30, 22, 24))
        base.paste(dark, (x - 70, 0), sh)
        base.paste(img.crop((0, 0, W - x, H)), (x, 0))
        img = base
    # gentle vignette of the stage lamp
    return img


def work(g):
    p = f'{OUT}/{g:05d}.jpg'
    if os.path.exists(p) and '--force' not in sys.argv:
        return g
    frame(g).save(p, quality=93)
    return g


def events():
    ev = []
    for i, sc in enumerate(SCN):
        for f, kind, kw in sc.events:
            ev.append(dict(t=(sc.start + f) / FPS, kind=kind, scene=sc.name, **kw))
        if i > 0:
            ev.append(dict(t=sc.start / FPS, kind='sheet', scene=sc.name))
    ev.sort(key=lambda e: e['t'])
    scenes = [dict(name=sc.name, start=sc.start / FPS, bars=sc.bars, frames=sc.frames) for sc in SCN]
    json.dump(dict(total=TOTAL / FPS, fps=FPS, scenes=scenes, events=ev), open('events.json', 'w'), indent=1)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    events()
    if len(sys.argv) > 1 and sys.argv[1] == 'stills':
        os.makedirs('stills', exist_ok=True)
        for g in map(int, sys.argv[2].split(',')):
            frame(g).save(f'stills/{g:05d}.jpg', quality=90)
        sys.exit()
    t = time.time()
    with mp.get_context('fork').Pool(4) as pool:
        for n, g in enumerate(pool.imap_unordered(work, range(TOTAL), chunksize=4)):
            if n % 100 == 0:
                print(n, round(time.time() - t), flush=True)
    print('done', TOTAL, round(time.time() - t))
