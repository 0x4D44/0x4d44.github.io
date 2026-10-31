#!/usr/bin/env python
"""Builds the roadside-advert atlas for Aotearoa Rally.

  python tools/textures/build-adverts.py <dir with ad_*.png posters> [--out assets/tex]

Each text-free poster (16:9-ish PNG, made once with Codex, see PROMPTS.md "Round 5") is cropped to a 2:1 panel,
captioned in a bold face (title + one short line, big enough to read at 15 m) and packed into ONE 2048x1024 atlas
(4 columns x 4 rows of 512x256 cells). Writes adverts.webp and adverts.json ({ cell, cols, rows, size, ads: [...] }).
The slug of every ad (except the house ad) is a real:true entry in the repo-root data.js; tests/world-adverts.test.mjs checks it.
Fonts: Windows system fonts (arialbd, consolab); falls back to PIL's default if absent.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

CELL_W, CELL_H, COLS, ROWS = 512, 256, 4, 4
MAX_BYTES = 560 * 1024  # validate-static refuses any texture over 600 KB

# slot order is the atlas order; slug = folder in the almanac (data.js), poster = file stem in the posters dir
ADS = [
    dict(id="house", slug=None, poster="ad_0x4d44", title="0x4d44 software", line="", mono=True),
    dict(id="skyblitz", slug="skyblitz", poster="ad_skyblitz", title="SKYBLITZ", line="Arcade air racing"),
    dict(id="kart", slug="kart-racing", poster="ad_kart", title="KART RACING", line="Eight karts, three tracks"),
    dict(id="nightcab", slug="night-cab", poster="ad_nightcab", title="THE NIGHT CAB", line="Wet-night train driving"),
    dict(id="ironvertex", slug="iron-vertex", poster="ad_ironvertex", title="IRON VERTEX", line="Design a roller coaster"),
    dict(id="subway", slug="glasgow-subway", poster="ad_subway", title="GLASGOW SUBWAY", line="Under Glasgow, in 3D"),
    dict(id="instruments", slug="instruments", poster="ad_instruments", title="INSTRUMENTS", line="How instruments work"),
    dict(id="blackhole", slug="black-holes", poster="ad_blackhole", title="BLACK HOLES", line="Event Horizon"),
    dict(id="chip", slug="mos-6502", poster="ad_chip", title="MOS 6502", line="Cycle by cycle"),
    dict(id="class55", slug="class-55", poster="ad_class55", title="CLASS 55", line="The Deltic express"),
    dict(id="tidecall", slug="tidecall", poster="ad_tidecall", title="TIDECALL", line="Tidal estimation whist"),
    dict(id="kitchen", slug="recipes", poster="ad_kitchen", title="RECIPES", line="The Kitchen Almanac"),
    dict(id="blueprint", slug="plan-to-build", poster="ad_blueprint", title="PLAN TO BUILD", line="Draft an apartment"),
    dict(id="attractor", slug="strange-attractors", poster="ad_attractor", title="STRANGE ATTRACTORS", line="Chaos in phase space"),
]

WIN = "C:/Windows/Fonts/"


def font(names, size):
    for n in names:
        for base in (WIN, ""):
            try:
                return ImageFont.truetype(base + n, size)
            except OSError:
                pass
    return ImageFont.load_default()


def fit(draw, text, names, max_w, start, floor=14):
    size = start
    while size > floor:
        f = font(names, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(names, floor)


def panel(ad, src_dir):
    im = Image.open(os.path.join(src_dir, ad["poster"] + ".png")).convert("RGB")
    w, h = im.size
    ch = int(round(w / 2))  # crop to 2:1 around the vertical centre (a little low: skies are empty)
    top = max(0, min(h - ch, (h - ch) // 2))
    im = im.crop((0, top, w, top + ch)).resize((CELL_W, CELL_H), Image.LANCZOS).convert("RGBA")
    d = ImageDraw.Draw(im)
    if ad.get("mono"):
        # house ad: centred lowercase monospace on a dark plate
        f = fit(d, ad["title"], ["consolab.ttf", "courbd.ttf"], CELL_W - 40, 66)
        tw = d.textlength(ad["title"], font=f)
        bx0, by0, bx1, by1 = (CELL_W - tw) / 2 - 18, CELL_H * 0.60, (CELL_W + tw) / 2 + 18, CELL_H * 0.60 + f.size * 1.35
        plate = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(plate).rounded_rectangle((bx0, by0, bx1, by1), 10, fill=(4, 12, 6, 215), outline=(240, 190, 60, 255), width=3)
        im = Image.alpha_composite(im, plate)
        d = ImageDraw.Draw(im)
        d.text(((CELL_W - tw) / 2, by0 + f.size * 0.12), ad["title"], font=f, fill=(255, 214, 90, 255))
        return im.convert("RGB")
    band = int(CELL_H * 0.40)
    shade = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for y in range(band):  # bottom gradient so the caption stays readable on any picture
        a = int(235 * min(1.0, (y / band) * 1.6))
        sd.line([(0, CELL_H - band + y), (CELL_W, CELL_H - band + y)], fill=(6, 8, 14, a))
    im = Image.alpha_composite(im, shade)
    d = ImageDraw.Draw(im)
    ft = fit(d, ad["title"], ["impact.ttf", "arialbd.ttf"], CELL_W - 30, 54)
    fl = fit(d, ad["line"], ["arialbd.ttf"], CELL_W - 30, 24)
    ty = CELL_H - 12 - fl.size - 6 - ft.size
    d.text((16, ty), ad["title"], font=ft, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    d.text((17, CELL_H - 14 - fl.size), ad["line"], font=fl, fill=(255, 214, 90, 255), stroke_width=1, stroke_fill=(0, 0, 0, 255))
    return im.convert("RGB")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src = args[0]
    out = "assets/tex"
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    atlas = Image.new("RGB", (CELL_W * COLS, CELL_H * ROWS), (20, 20, 24))
    ads = []
    for i, ad in enumerate(ADS):
        c, r = i % COLS, i // COLS
        atlas.paste(panel(ad, src), (c * CELL_W, r * CELL_H))
        ads.append({"id": ad["id"], "slug": ad["slug"], "title": ad["title"], "cell": i,
                    "rect": [c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H]})
    path = os.path.join(out, "adverts.webp")
    for q in range(88, 40, -4):
        atlas.save(path, "WEBP", quality=q, method=6)
        if os.path.getsize(path) <= MAX_BYTES:
            break
    meta = {"file": "adverts.webp", "size": [CELL_W * COLS, CELL_H * ROWS], "cell": [CELL_W, CELL_H], "cols": COLS, "rows": ROWS, "ads": ads}
    with open(os.path.join(out, "adverts.json"), "w", encoding="utf8") as f:
        json.dump(meta, f, indent=1)
    print(path, os.path.getsize(path) // 1024, "KB quality", q)


main()
