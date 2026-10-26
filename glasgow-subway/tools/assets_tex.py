"""Procedural texture generation (numpy + PIL) for the Glasgow Subway models.  Writes JPG (opaque) / PNG (alpha) + normal maps
into SCRATCH/tex and returns file paths.  All sizes are powers of two <= 1024.  Textures are tileable unless noted.
Albedo maps are near-neutral/greyscale-ish so the material base colour can tint them (A5 can colour-vary stations by editing material.color)."""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRATCH = '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/work'
TEX = os.path.join(SCRATCH, 'tex'); os.makedirs(TEX, exist_ok=True)

def font(size, bold=True):
    for p in ('/usr/share/fonts/opentype/inter/Inter-Bold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'):
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except Exception: pass
    return ImageFont.load_default(size=size)

def pnoise(h, w, cells=8, seed=0, octs=4, gain=0.5):
    """Periodic fractal noise in [-1,1] (tileable) via FFT-shaped random fields."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w)); amp = 1.0; tot = 0
    fy = np.fft.fftfreq(h)[:, None] * h; fx = np.fft.fftfreq(w)[None, :] * w
    r = np.sqrt(fx ** 2 + fy ** 2)
    for o in range(octs):
        c = cells * (2 ** o)
        filt = np.exp(-(r / c) ** 2) * (r > 0)
        n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((h, w))) * filt))
        n /= (np.abs(n).max() + 1e-9)
        out += n * amp; tot += amp; amp *= gain
    return out / tot

def blur(a, s):
    fy = np.fft.fftfreq(a.shape[0])[:, None]; fx = np.fft.fftfreq(a.shape[1])[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))))

def normalmap(height, strength=2.0, soft=1.0):
    height = blur(height, soft)
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(height)   # +Y up in tangent space (image y grows down -> gy sign flipped)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)

def save(name, arr, alpha=False, q=90):
    img = Image.fromarray(arr if arr.dtype == np.uint8 else (arr.clip(0, 1) * 255).astype(np.uint8))
    if alpha:
        p = os.path.join(TEX, name + '.png'); img.save(p, optimize=True)
    else:
        if name.startswith('n_') and img.size[0] >= 512 and not name.startswith('n_ring'):
            img = img.resize((img.size[0] // 2, img.size[1] // 2), Image.LANCZOS)
        p = os.path.join(TEX, name + '.jpg'); img.convert('RGB').save(p, quality=(78 if name.startswith('n_') else q), subsampling=0 if name.startswith('n_') else 2)
    return p

def grey3(a):
    return np.repeat(a[..., None], 3, -1)

# ------------------------------------------------------------------ individual textures
def tex_tile(n=512, tw=64, th=64, bond=False, seed=1, name='tile'):
    ys, xs = np.mgrid[0:n, 0:n]
    row = ys // th
    off = np.where(bond & (row % 2 == 1), tw // 2, 0) if bond else 0
    xo = (xs + off) % n
    cx, cy = xo % tw, ys % th
    gro = 3
    inside = (cx >= gro) & (cy >= gro)
    # bevel: distance from edge inside tile
    d = np.minimum(np.minimum(cx - gro, tw - 1 - cx), np.minimum(cy - gro, th - 1 - cy)).clip(0, None)
    bev = np.clip(d / 4.0, 0, 1)
    rng = np.random.default_rng(seed)
    tid = (row * 97 + (xo // tw) * 31) % 251
    tone = (rng.random(256)[tid] - 0.5) * 0.05
    pn = pnoise(n, n, 6, seed, 3) * 0.03
    glaze = 0.93 + tone + pn - (1 - bev) * 0.04
    # soft diagonal highlight per tile (gloss feel)
    hl = np.clip(1 - (np.abs((cx / tw) - (cy / th)) * 3), 0, 1) * 0.015
    alb = np.where(inside, glaze + hl, 0.62 + pn * 0.5)
    h = np.where(inside, 0.6 + 0.4 * bev, 0.0)
    return save(name, grey3(alb)), save('n_' + name, normalmap(h, 3.0))

def tex_flags(n=512, seed=2):
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:n, 0:n]
    fs = n // 2
    fid = (ys // fs) * 2 + (xs // fs)
    tone = (rng.random(8)[fid] - 0.5) * 0.10
    pn = pnoise(n, n, 10, seed, 5) * 0.10
    speck = (rng.random((n, n)) - 0.5) * 0.06
    j = ((xs % fs) < 3) | ((ys % fs) < 3)
    alb = 0.74 + tone + pn + speck
    # chewing-gum spots
    for _ in range(40):
        x, y, r = rng.integers(0, n), rng.integers(0, n), rng.integers(2, 4)
        m = (np.hypot(((xs - x + n // 2) % n) - n // 2, ((ys - y + n // 2) % n) - n // 2) < r)
        alb[m] -= 0.18
    alb = np.where(j, 0.38 + pn * 0.3, alb)
    h = np.where(j, 0.0, 0.7 + pn * 0.6 + speck)
    return save('flags', grey3(alb)), save('n_flags', normalmap(h, 2.0))

def tex_tactile(n=256):
    ys, xs = np.mgrid[0:n, 0:n]
    c = 16
    cx, cy = (xs % c) - c / 2 + 0.5, (ys % c) - c / 2 + 0.5
    r = np.hypot(cx, cy)
    dome = np.clip(1 - (r / 6.2) ** 2, 0, None)
    alb = 0.62 + 0.38 * np.clip(dome * 1.3, 0, 1) + pnoise(n, n, 8, 3, 3) * 0.05
    return save('tactile', grey3(alb)), save('n_tactile', normalmap(np.sqrt(dome), 5.0))

def tex_concrete(n=512, seed=4, name='concrete', base=0.72, tie=True):
    pn = pnoise(n, n, 6, seed, 6) * 0.12
    rng = np.random.default_rng(seed)
    pits = (rng.random((n, n)) > 0.9985)
    pits = np.array(Image.fromarray((pits * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    alb = base + pn - pits * 0.25
    ys, xs = np.mgrid[0:n, 0:n]
    seam = ((ys % (n // 2)) < 2) * 0.12      # shuttering joint
    alb -= seam
    h = pn * 0.5 - pits * 0.6 - seam * 2
    if tie:
        for gx in (n // 4, 3 * n // 4):
            for gy in (n // 4, 3 * n // 4):
                m = np.hypot(xs - gx, ys - gy) < 5
                alb[m] -= 0.18; h[m] -= 0.5
    return save(name, grey3(alb)), save('n_' + name, normalmap(h, 1.5))

def tex_brick(n=512, seed=5):
    bw, bh = 110, 34
    ys, xs = np.mgrid[0:n, 0:n]
    row = ys // bh
    xo = (xs + (row % 2) * (bw // 2)) % (n // 1)
    cx, cy = xo % bw, ys % bh
    mort = (cx < 4) | (cy < 4)
    rng = np.random.default_rng(seed)
    tid = (row * 13 + xo // bw) % 255
    tone = (rng.random(256)[tid] - 0.5) * 0.28
    pn = pnoise(n, n, 12, seed, 4) * 0.10
    alb = np.where(mort, 0.55 + pn * 0.3, 0.72 + tone + pn)
    h = np.where(mort, 0.0, 0.7 + pn)
    return save('brick', grey3(alb)), save('n_brick', normalmap(h, 2.5))

def tex_iron(n=512, seed=6):
    pn = pnoise(n, n, 8, seed, 5) * 0.14
    alb = 0.50 + pn
    rust = np.clip(pnoise(n, n, 5, seed + 1, 4) - 0.2, 0, 1) * 0.35
    img = np.stack([alb + rust * 0.5, alb + rust * 0.15, alb - rust * 0.2], -1)
    return save('iron', img)

def tex_plaster(n=512, seed=7):
    pn = pnoise(n, n, 4, seed, 4) * 0.05
    alb = 0.88 + pn
    return save('plaster', grey3(alb))

def tex_wood(n=256, seed=8):
    ys, xs = np.mgrid[0:n, 0:n]
    g = np.sin((ys * 0.35 + pnoise(n, n, 3, seed, 2) * 10)) * 0.5 + 0.5
    alb = 0.62 + g * 0.18 + pnoise(n, n, 20, seed, 3) * 0.05
    img = np.stack([alb, alb * 0.93, alb * 0.82], -1)
    return save('wood', img)

def tex_paint(n=256, seed=9):
    pn = pnoise(n, n, 6, seed, 4) * 0.04
    return save('paint', grey3(0.92 + pn))

def tex_floor_rubber(n=256, seed=10):
    """Speckled vinyl floor (research: dark grey speckled), fine stud texture."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:n, 0:n]
    c = 8
    cx, cy = (xs % c) - c / 2 + 0.5, (ys % c) - c / 2 + 0.5
    dome = np.clip(1 - (np.hypot(cx, cy) / 3.2) ** 2, 0, None)
    speck = (rng.random((n, n)) > 0.93) * 0.18 - (rng.random((n, n)) > 0.95) * 0.12
    alb = 0.62 + dome * 0.06 + speck + pnoise(n, n, 12, seed, 3) * 0.04
    return save('rubber', grey3(alb)), save('n_rubber', normalmap(np.sqrt(dome), 1.5))

def tex_moquette(n=256, seed=11):
    """Woven seat fabric with a small geometric pattern; greyscale (tinted by material colour).  Pattern: staggered 'flecks' + diamonds."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:n, 0:n]
    weave = (np.sin(xs * 1.6) * np.sin(ys * 1.6)) * 0.05
    cell = 32
    cx, cy = (xs % cell) - cell / 2, (ys % cell) - cell / 2
    dia = (np.abs(cx) + np.abs(cy) < 7).astype(float)
    cx2, cy2 = ((xs + cell // 2) % cell) - cell / 2, ((ys + cell // 2) % cell) - cell / 2
    dot = (np.hypot(cx2, cy2) < 3.5).astype(float)
    alb = 0.78 + weave + dia * -0.28 + dot * 0.12 + pnoise(n, n, 20, seed, 3) * 0.04
    return save('moquette', grey3(alb)), save('n_moquette', normalmap(weave * 3 + dia * 0.5, 2.0))

def tex_moquette_ring(n=256, seed=13):
    """Colour seat moquette per research: charcoal ground, overlapping lavender/grey ring motifs, small orange rings. Tileable."""
    rng = np.random.default_rng(seed)
    S = n * 2
    im = Image.new('RGB', (S, S), (75, 79, 87)); d = ImageDraw.Draw(im)
    def ring(cx, cy, r, w, col):
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                d.ellipse((cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r), outline=col, width=w)
    for i in range(40):
        ring(rng.integers(0, S), rng.integers(0, S), int(rng.integers(12, 24)), 3, (169, 167, 194) if i % 3 else (199, 199, 214))
    for i in range(28):
        ring(rng.integers(0, S), rng.integers(0, S), int(rng.integers(14, 26)), 3, (52, 55, 62))
    for i in range(44):
        ring(rng.integers(0, S), rng.integers(0, S), int(rng.integers(4, 7)), 3, (242, 140, 27))
    a = np.array(im.resize((n, n), Image.LANCZOS)).astype(float) / 255
    ys, xs = np.mgrid[0:n, 0:n]
    weave = (np.sin(xs * 1.6) * np.sin(ys * 1.6)) * 0.035
    a = a + weave[..., None] + pnoise(n, n, 20, seed, 3)[..., None] * 0.03
    return save('moquette_ring', a)

def tex_ceiling_panel(n=256, seed=12):
    ys, xs = np.mgrid[0:n, 0:n]
    alb = np.full((n, n), 0.92)
    alb[(xs % 128) < 2] = 0.65; alb[(ys % 128) < 2] = 0.65
    perf = ((xs % 8) < 2) & ((ys % 8) < 2)
    alb[perf] -= 0.12
    alb += pnoise(n, n, 6, seed, 3) * 0.03
    return save('ceiling_panel', grey3(alb))

def fitfont(draw, s, maxw, size, bold=True):
    while size > 10:
        f = font(size, bold)
        if draw.textlength(s, font=f) <= maxw: return f
        size -= 4
    return font(10, bold)

def _txt(draw, xy, s, f, fill, anchor='mm'):
    draw.text(xy, s, font=f, fill=fill, anchor=anchor)

def roundel_img(size=256):
    """SPT Subway roundel per the photo research: orange ring, white ring, charcoal disc with a white 'S'; word 'Subway' in orange beneath. RGBA."""
    S = size * 2
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    D = S * 0.80; cx = S / 2; cy = D / 2 + 2
    def disc(r, col): d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    disc(D / 2, (240, 98, 24, 255)); disc(D / 2 * 0.80, (246, 246, 242, 255)); disc(D / 2 * 0.66, (52, 56, 64, 255))
    _txt(d, (cx, cy + 4), 'S', font(int(D * 0.55)), (255, 255, 255, 255))
    _txt(d, (cx, S * 0.91), 'Subway', font(int(S * 0.13)), (240, 98, 24, 255))
    return im.resize((size, size), Image.LANCZOS)

def tex_roundel():
    p = os.path.join(TEX, 'roundel.png'); roundel_img(256).save(p, optimize=True); return p

def name_board_img(text='STATION', w=1024, h=192, roundel=True):
    im = Image.new('RGB', (w, h), (22, 38, 92)); d = ImageDraw.Draw(im)
    d.rectangle((0, h - 22, w, h), fill=(232, 102, 26))
    d.rectangle((0, 0, w, 8), fill=(232, 102, 26))
    x0 = 20
    if roundel:
        r = roundel_img(150); im.paste(r, (18, 14), r); x0 = 190
    _txt(d, (x0 + (w - x0) / 2, (h - 22) / 2 + 4), text, fitfont(d, text, (w - x0) * 0.92, 110), (255, 255, 255))
    return im

def tex_name_board():
    p = os.path.join(TEX, 'name_board.jpg'); name_board_img().save(p, quality=90); return p

def tex_safety_atlas():
    """4x2 atlas of 256 px cells: exit, no smoking, mind the gap, danger electricity, help point, cctv, first aid, stand back."""
    n = 1024; im = Image.new('RGB', (n, 512), (255, 255, 255)); d = ImageDraw.Draw(im)
    cells = [('EXIT', (15, 138, 60), (255, 255, 255)), ('NO\nSMOKING', (255, 255, 255), (190, 20, 28)), ('MIND THE\nGAP', (245, 196, 0), (20, 20, 20)),
             ('DANGER\n600V DC', (245, 196, 0), (20, 20, 20)), ('HELP\nPOINT', (26, 79, 160), (255, 255, 255)), ('CCTV IN\nOPERATION', (26, 79, 160), (255, 255, 255)),
             ('FIRST\nAID', (15, 138, 60), (255, 255, 255)), ('STAND\nBACK', (245, 196, 0), (20, 20, 20))]
    for i, (t, bg, fg) in enumerate(cells):
        x, y = (i % 4) * 256, (i // 4) * 256
        d.rectangle((x, y, x + 255, y + 255), fill=bg)
        d.rectangle((x + 6, y + 6, x + 249, y + 249), outline=fg, width=4)
        lines = t.split('\n'); f = font(52 if len(max(lines, key=len)) < 8 else 40)
        for k, ln in enumerate(lines):
            _txt(d, (x + 128, y + 128 + (k - (len(lines) - 1) / 2) * 56), ln, f, fg)
        if t.startswith('NO'):
            d.ellipse((x + 40, y + 40, x + 216, y + 216), outline=(190, 20, 28), width=10); d.line((x + 62, y + 62, x + 194, y + 194), fill=(190, 20, 28), width=10)
        if t.startswith('DANGER'):
            d.polygon([(x + 128, y + 30), (x + 36, y + 130), (x + 220, y + 130)], outline=(20, 20, 20))
    p = os.path.join(TEX, 'safety_atlas.jpg'); im.save(p, quality=90); return p

def tex_adverts():
    """4x4 atlas (1024^2) of fake poster designs, 256 px cells."""
    rng = np.random.default_rng(21)
    n = 1024; im = Image.new('RGB', (n, n)); d = ImageDraw.Draw(im)
    heads = ['SUBWAY', 'SMARTCARD', 'GLASGOW', 'EVENTS', 'WELCOME', 'MIND THE GAP', 'STUDENT', 'MUSEUMS', 'RIVER CLYDE', 'MUSIC', 'FOOTBALL', 'FOOD', 'RAIL LINKS', 'TICKETS', 'SPT', 'TOURS']
    pal = [(232, 102, 26), (24, 44, 110), (240, 240, 232), (30, 120, 90), (190, 40, 50), (240, 190, 40), (60, 60, 70)]
    for i in range(16):
        x, y = (i % 4) * 256, (i // 4) * 256
        bg = pal[int(rng.integers(0, len(pal)))]; fg = (255, 255, 255) if sum(bg) < 500 else (20, 24, 40)
        d.rectangle((x, y, x + 255, y + 255), fill=bg)
        for k in range(int(rng.integers(2, 5))):
            c = pal[int(rng.integers(0, len(pal)))]
            if rng.random() < 0.5: d.ellipse((x + int(rng.integers(0, 150)), y + int(rng.integers(60, 200)), x + int(rng.integers(150, 256)), y + int(rng.integers(200, 256))), fill=c)
            else: d.rectangle((x + int(rng.integers(0, 120)), y + int(rng.integers(80, 160)), x + int(rng.integers(130, 256)), y + int(rng.integers(170, 256))), fill=c)
        d.rectangle((x, y, x + 255, y + 70), fill=bg)
        _txt(d, (x + 128, y + 36), heads[i], font(34 if len(heads[i]) < 9 else 26), fg)
        d.rectangle((x + 4, y + 4, x + 251, y + 251), outline=(255, 255, 255), width=3)
    im = im.resize((512, 512), Image.LANCZOS)
    p = os.path.join(TEX, 'adverts.jpg'); im.save(p, quality=86); return p

STATIONS = ['Buchanan Street', 'St Enoch', 'Bridge Street', 'West Street', 'Shields Road', 'Kinning Park', 'Cessnock', 'Ibrox', 'Govan', 'Partick', 'Kelvinhall', 'Hillhead', 'Kelvinbridge', "St George's Cross", 'Cowcaddens']

def tex_route_map():
    """Wide strip: the circular line as a horizontal diagram with all 15 stops, 1024x128."""
    w, h = 1024, 128
    im = Image.new('RGB', (w, h), (245, 243, 236)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, 3), fill=(232, 102, 26)); d.rectangle((0, h - 3, w, h), fill=(232, 102, 26))
    names = ['Govan', 'Ibrox', 'Cessnock', 'Kinning Park', "Shields Rd", 'West St', 'Bridge St', 'St Enoch', 'Buchanan St', 'Cowcaddens', "St George's X", 'Kelvinbridge', 'Hillhead', 'Kelvinhall', 'Partick']
    n = len(names); x0, x1 = 50, w - 50
    d.line((x0, 64, x1, 64), fill=(232, 102, 26), width=8)
    f = font(14)
    for i, nm in enumerate(names):
        x = x0 + (x1 - x0) * i / (n - 1)
        d.ellipse((x - 7, 57, x + 7, 71), fill=(255, 255, 255), outline=(24, 44, 110), width=3)
        _txt(d, (x, 36 if i % 2 == 0 else 96), nm, f, (24, 44, 110))
        d.line((x, 44 if i % 2 == 0 else 74, x, 57 if i % 2 == 0 else 86), fill=(24, 44, 110), width=1)
    _txt(d, (w // 2, 14), 'SUBWAY  -  OUTER CIRCLE (clockwise) / INNER CIRCLE (anti-clockwise)', font(13), (24, 44, 110))
    p = os.path.join(TEX, 'route_map.jpg'); im.save(p, quality=90); return p

def tex_ring(kind='concrete', w=1024, h=128, seed=30):
    """Tunnel ring lining: u = along the arc (9 segments), v = along the ring (0..1 over 0.61 m).  Flange band at v<0.08, joints at (k+.5)/9.
    Includes bolts, grout holes, soot, water staining, rust drips.  Not tileable in u (wraps the bore arc); tileable in v."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:h, 0:w]
    u = xs / w; v = ys / h
    if kind == 'concrete':
        base = 0.62 + pnoise(h, w, 24, seed, 5) * 0.10
        col = np.stack([base, base, base * 0.97], -1)
    else:
        base = 0.34 + pnoise(h, w, 30, seed, 5) * 0.07
        col = np.stack([base * 1.05, base, base * 0.95], -1)
    hgt = np.zeros((h, w))
    # segment joints
    seg = 9
    for k in range(seg):
        uj = (k + 0.5) / seg
        j = np.abs(u - uj) < 0.0035
        col[j] *= 0.55; hgt[j] -= 0.6
        fl = np.abs(u - uj) < 0.012
        hgt[fl] += 0.3
        # bolts: 3 along joint
        for vb in (0.18, 0.5, 0.82):
            m = np.hypot((u - uj) * w, (v - vb) * h * 1.6) < 3.0
            col[m] = col[m] * 0.6 + 0.12; hgt[m] += 0.8
        # vertical staining streak per joint
        sw = 0.008 + rng.random() * 0.01
        st = np.exp(-((u - uj) / sw) ** 2) * (0.5 + 0.5 * pnoise(h, w, 4, seed + k, 2))
        col *= (1 - 0.25 * st[..., None])
        if kind == 'iron' or rng.random() < 0.4:
            rust = np.exp(-((u - uj - 0.004) / 0.004) ** 2) * (0.3 + 0.7 * pnoise(h, w, 3, seed + 40 + k, 2).clip(0, 1))
            col[..., 0] += rust * 0.25; col[..., 1] += rust * 0.08; col[..., 2] -= rust * 0.1
    # flange end band (v at bottom)
    fb = v < 0.09
    col[fb] *= 0.8; hgt[fb] += 0.5
    # grout/lifting holes mid-segment
    for k in range(seg):
        uc = k / seg
        m = np.hypot((u - uc) * w, (v - 0.5) * h * 1.6) < 4.5
        col[m] *= 0.35; hgt[m] -= 0.7
    # soot gradient: darker toward crown (u ~ 0.5) ; tide-line near floor ends
    soot = np.exp(-((u - 0.5) / 0.28) ** 2) * 0.28
    col *= (1 - soot[..., None])
    col *= (1 - 0.15 * np.clip(pnoise(h, w, 3, seed + 90, 3), 0, 1)[..., None])
    return save(f'ring_{kind}', col, q=88), save(f'n_ring_{kind}', normalmap(hgt, 2.5))

def tex_grooves(n=256):
    ys, xs = np.mgrid[0:n, 0:n]
    g = (xs % 8) < 4
    alb = np.where(g, 0.75, 0.35) + pnoise(n, n, 10, 5, 3) * 0.05
    h = np.where(g, 1.0, 0.0)
    return save('grooves', grey3(alb)), save('n_grooves', normalmap(h, 2.0, 0.8))

def tex_enamel(n=512, seed=40):
    """Ribbed enamel vault panel: u across one 0.65 m panel, v along the vault (tileable).  Greyscale, tint by material colour."""
    ys, xs = np.mgrid[0:n, 0:n]
    u = xs / n
    seam = (np.minimum(u, 1 - u) * n < 3)
    curve = 0.93 + 0.07 * np.cos((u - 0.5) * np.pi * 0.9)
    alb = curve + pnoise(n, n, 5, seed, 3) * 0.015
    alb = np.where(seam, 0.55, alb)
    h = np.where(seam, 0.0, 0.5 + 0.5 * curve)
    return save('enamel', grey3(alb)), save('n_enamel', normalmap(h, 2.0, 1.2))

def tex_lozenge(n=256):
    ys, xs = np.mgrid[0:n, 0:n]
    c = 32
    cx, cy = (xs % c) - c / 2, (ys % c) - c / 2
    lz = np.clip(1 - (np.abs(cx) / 11 + np.abs(cy) / 7), 0, None)
    alb = 0.65 + 0.35 * np.clip(lz * 2, 0, 1)
    return save('lozenge', grey3(alb)), save('n_lozenge', normalmap(np.sqrt(lz), 4.0))

def tex_timber(n=256, seed=41):
    ys, xs = np.mgrid[0:n, 0:n]
    slat = ((xs % 32) < 5)
    g = np.sin(ys * 0.05 + pnoise(n, n, 3, seed, 2) * 6) * 0.5 + 0.5
    alb = 0.55 + g * 0.2 + pnoise(n, n, 18, seed, 3) * 0.04
    img = np.stack([alb, alb * 0.82, alb * 0.6], -1)
    img[slat] *= 0.3
    return save('timber', img)

def tex_danger(w=1024, h=64):
    im = Image.new('RGB', (w, h), (36, 36, 38)); d = ImageDraw.Draw(im)
    for k in range(2):
        _txt(d, (w * (0.25 + 0.5 * k), h / 2), 'DANGER  4  LIVE RAIL  4', font(34), (232, 190, 20))
    p = os.path.join(TEX, 'danger.jpg'); im.save(p, quality=90); return p

def tex_mesh(n=128):
    a = np.zeros((n, n, 4), np.uint8)
    a[..., :3] = 20
    ys, xs = np.mgrid[0:n, 0:n]
    line = ((xs % 16) < 2) | ((ys % 16) < 2)
    a[..., 3] = np.where(line, 255, 0)
    p = os.path.join(TEX, 'mesh.png'); Image.fromarray(a).save(p, optimize=True); return p

def art_img(kind, w=1024, h=256, seed=50):
    rng = np.random.default_rng(seed)
    im = Image.new('RGB', (w, h), (30, 40, 70)); d = ImageDraw.Draw(im)
    if kind == 'hillhead':        # Alasdair Gray style: colourful West End scene - sky bands, towers, trees, figures (procedural homage)
        for i in range(h):
            t = i / h; d.line((0, i, w, i), fill=(int(40 + 140 * t), int(90 + 90 * t), int(150 + 40 * (1 - t))))
        for i in range(14):
            x = int(rng.integers(0, w)); bw = int(rng.integers(40, 110)); bh = int(rng.integers(70, 190))
            col = [(196, 120, 70), (214, 160, 90), (170, 90, 60), (225, 190, 120)][i % 4]
            d.rectangle((x, h - bh, x + bw, h), fill=col)
            for wy in range(h - bh + 10, h - 10, 22):
                for wx in range(x + 8, x + bw - 8, 18): d.rectangle((wx, wy, wx + 8, wy + 12), fill=(250, 235, 160))
        d.polygon([(560, h), (600, 30), (640, h)], fill=(120, 100, 110)); d.rectangle((585, 20, 615, 70), fill=(150, 120, 110))   # university tower
        for i in range(20):
            x = int(rng.integers(0, w)); d.ellipse((x - 25, h - 80, x + 25, h - 20), fill=(40, int(120 + rng.integers(0, 80)), 60))
        for i in range(9):
            x = int(rng.integers(20, w - 20)); d.ellipse((x - 8, h - 70, x + 8, h - 54), fill=(240, 200, 170)); d.rectangle((x - 9, h - 54, x + 9, h - 20), fill=[(200, 40, 40), (40, 80, 180), (240, 190, 40)][i % 3])
    elif kind == 'govan':         # shipyard cranes and hulls
        for i in range(h):
            t = i / h; d.line((0, i, w, i), fill=(int(230 - 60 * t), int(150 - 40 * t), int(90 + 30 * t)))
        d.rectangle((0, h - 60, w, h), fill=(30, 50, 90))
        for x0 in (120, 420, 760):
            d.rectangle((x0, 60, x0 + 10, h - 60), fill=(25, 25, 30)); d.rectangle((x0 - 90, 60, x0 + 140, 72), fill=(25, 25, 30)); d.line((x0 + 5, 60, x0 + 135, 72), fill=(25, 25, 30), width=3)
        d.polygon([(200, h - 60), (360, h - 60), (390, h - 110), (180, h - 110)], fill=(170, 40, 40))
        d.polygon([(540, h - 60), (760, h - 60), (800, h - 120), (520, h - 120)], fill=(40, 70, 150))
        d.rectangle((600, h - 160, 700, h - 120), fill=(230, 230, 230))
    elif kind == 'partick':       # trains, river and bridge arches
        for i in range(h):
            d.line((0, i, w, i), fill=(int(180 - 90 * i / h), int(205 - 70 * i / h), int(230 - 40 * i / h)))
        for k in range(6):
            x = 40 + k * 170; d.arc((x, 90, x + 160, 250), 180, 360, fill=(70, 50, 40), width=14)
        d.rectangle((0, 90, w, 100), fill=(70, 50, 40))
        d.rectangle((120, 62, 360, 88), fill=(232, 102, 26)); d.rectangle((370, 62, 610, 88), fill=(232, 102, 26))
        d.rectangle((0, 226, w, h), fill=(40, 90, 120))
    else:                         # kelvinhall: museum towers + organ pipes
        for i in range(h):
            d.line((0, i, w, i), fill=(int(120 + 60 * i / h), int(60 + 30 * i / h), int(50 + 20 * i / h)))
        for k in range(18):
            x = 40 + k * 52; d.rectangle((x, 60 + (k % 5) * 12, x + 20, 220), fill=(214, 190, 150))
        d.polygon([(780, 220), (800, 40), (830, 40), (850, 220)], fill=(160, 70, 50)); d.polygon([(900, 220), (920, 70), (950, 70), (970, 220)], fill=(160, 70, 50))
    return im

def tex_art():
    out = {}
    for i, k in enumerate(('hillhead', 'govan', 'partick', 'kelvinhall')):
        p = os.path.join(TEX, f'art_{k}.jpg'); art_img(k, seed=50 + i).save(p, quality=88); out[f'art_{k}'] = p
    return out

def band_img(text, bg, fg=(255, 255, 255), w=1024, h=128, reps=2):
    im = Image.new('RGB', (w, h), bg); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, 5), fill=(255, 255, 255)); d.rectangle((0, h - 5, w, h), fill=(255, 255, 255))
    for k in range(reps):
        _txt(d, (w * (k + 0.5) / reps, h / 2), text.upper(), fitfont(d, text.upper(), w / reps * 0.86, int(h * 0.62)), fg)
    return im

def station_name_textures(sid, name, outer_bg=(240, 90, 26), inner_bg=(59, 64, 72), board=(22, 38, 92)):
    out = {}
    p = os.path.join(TEX, f'band_outer_{sid}.jpg'); band_img(name, outer_bg).save(p, quality=90); out['band_outer'] = p
    p = os.path.join(TEX, f'band_inner_{sid}.jpg'); band_img(name, inner_bg).save(p, quality=90); out['band_inner'] = p
    p = os.path.join(TEX, f'board_{sid}.jpg'); name_board_img(name.upper(), 1024, 192, True).save(p, quality=90); out['board'] = p
    for k, bg in (('inner', inner_bg), ('outer', outer_bg)):
        im = Image.new('RGB', (512, 128), bg); d = ImageDraw.Draw(im); _txt(d, (256, 64), k.upper(), font(80), (255, 255, 255))
        p = os.path.join(TEX, f'dir_{k}.jpg'); im.save(p, quality=90); out['dir_' + k] = p
    return out

_done = {}
def build_all():
    if _done: return _done
    t = {}
    t['tile'], t['n_tile'] = tex_tile(512, 64, 64, False, 1, 'tile')
    t['tile_brick'], t['n_tile_brick'] = tex_tile(512, 128, 64, True, 2, 'tile_brick')
    t['flags'], t['n_flags'] = tex_flags()
    t['tactile'], t['n_tactile'] = tex_tactile()
    t['concrete'], t['n_concrete'] = tex_concrete()
    t['brick'], t['n_brick'] = tex_brick()
    t['iron'] = tex_iron(); t['plaster'] = tex_plaster(); t['wood'] = tex_wood(); t['paint'] = tex_paint()
    t['rubber'], t['n_rubber'] = tex_floor_rubber()
    t['moquette'], t['n_moquette'] = tex_moquette(); t['moquette_ring'] = tex_moquette_ring()
    t['ceiling_panel'] = tex_ceiling_panel(); t['grooves'], t['n_grooves'] = tex_grooves()
    t['roundel'] = tex_roundel(); t['name_board'] = tex_name_board(); t['safety_atlas'] = tex_safety_atlas()
    t['adverts'] = tex_adverts(); t['route_map'] = tex_route_map()
    t['ring_concrete'], t['n_ring_concrete'] = tex_ring('concrete')
    t['ring_iron'], t['n_ring_iron'] = tex_ring('iron', seed=31)
    t['enamel'], t['n_enamel'] = tex_enamel(); t['lozenge'], t['n_lozenge'] = tex_lozenge(); t['timber'] = tex_timber()
    t['danger'] = tex_danger(); t['mesh'] = tex_mesh(); t.update(tex_art())
    _done.update(t)
    return t

if __name__ == '__main__':
    t = build_all()
    for k, p in t.items(): print(k, os.path.getsize(p) // 1024, 'KB')
