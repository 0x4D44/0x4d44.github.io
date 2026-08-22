#!/usr/bin/env python3
"""Source for the eight eclipse-run heroes in news/images/.

The rest of the paper's artwork is generated and has no source file; these
eight are drawn vector art, so this is the file to edit if one needs changing.
Writes <id>.svg beside itself, one per story, matching the article ids.

To re-export the WebPs (needs Chromium and Pillow):

    python3 eclipse-heroes.py
    for f in *.svg; do n="${f%.svg}"; printf '<!doctype html><style>html,body\
{margin:0;padding:0;background:#000}img{display:block}</style>\
<img src="%s" width="1600" height="900">' "$f" > "wrap-$n.html";
      chromium --headless --hide-scrollbars --force-device-scale-factor=2 \
        --window-size=1700,1080 --screenshot="raw-$n.png" "file://$PWD/wrap-$n.html"; done
    # then crop each raw-*.png to 3200x1800 from the top-left, resize to
    # 1600x900 (LANCZOS) and save as WebP quality 82 into news/images/.

Render at a window LARGER than the artwork and crop: at exactly 1600x900 the
page clips the bottom of the image, which silently ate a caption bar once.
"""
import math
import os
import random

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1600, 900

# ---- shared palette -------------------------------------------------------
SKY_TOP = "#070b14"
SKY_MID = "#132038"
SKY_LOW = "#31456a"
CORONA = "#ffd98a"
CORONA_SOFT = "#f6b95a"
DISC = "#05070c"
INK = "#0b0f18"
INK_SOFT = "#16203a"
SEA_DEEP = "#0a2733"
SEA = "#12414f"
SEA_LIT = "#2b7e8c"
WATER = "#2e93a8"
WATER_LIT = "#63c3d2"
WATER_PALE = "#a9e0e9"
TILE = "#d9e6ec"
TILE_DARK = "#a9c2ce"
GROUT = "#7f9dab"
DECK = "#c9d6dc"
RED = "#b80000"
WARM = "#f0c66a"
PAPER = "#efe7d6"


def defs(extra=""):
    return f"""
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{SKY_TOP}"/>
      <stop offset="0.55" stop-color="{SKY_MID}"/>
      <stop offset="1" stop-color="{SKY_LOW}"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="{CORONA}" stop-opacity="0.95"/>
      <stop offset="0.18" stop-color="{CORONA_SOFT}" stop-opacity="0.45"/>
      <stop offset="0.55" stop-color="{CORONA_SOFT}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="{CORONA_SOFT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flash">
      <stop offset="0" stop-color="#fffdf3" stop-opacity="1"/>
      <stop offset="0.35" stop-color="{CORONA}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="{CORONA_SOFT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.34"/>
      <stop offset="0.35" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.8" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.38"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>{extra}
  </defs>"""


def grain(opacity=0.055):
    return (f'<rect width="{W}" height="{H}" filter="url(#grain)" '
            f'opacity="{opacity}" style="mix-blend-mode:overlay"/>')


def vignette():
    return f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'


def eclipse(cx, cy, r, glow=5.2, ray_len=2.6, seed=3):
    """Black disc, corona halo and a ragged fan of rays."""
    rnd = random.Random(seed)
    rays = []
    for i in range(72):
        a = i * (2 * math.pi / 72) + rnd.uniform(-0.02, 0.02)
        length = r * rnd.uniform(1.25, ray_len)
        x1, y1 = cx + math.cos(a) * r * 1.02, cy + math.sin(a) * r * 1.02
        x2, y2 = cx + math.cos(a) * length, cy + math.sin(a) * length
        rays.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{CORONA}" stroke-width="{rnd.uniform(0.8, 2.4):.1f}" '
            f'stroke-linecap="round" opacity="{rnd.uniform(0.12, 0.5):.2f}"/>')
    return f"""
  <g>
    <circle cx="{cx}" cy="{cy}" r="{r * glow:.0f}" fill="url(#glow)"/>
    {''.join(rays)}
    <circle cx="{cx}" cy="{cy}" r="{r * 1.14:.1f}" fill="none" stroke="{CORONA}"
            stroke-width="{r * 0.10:.1f}" opacity="0.55"/>
    <circle cx="{cx}" cy="{cy}" r="{r * 1.04:.1f}" fill="none" stroke="#fff8e6"
            stroke-width="{r * 0.05:.1f}" opacity="0.85"/>
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="{DISC}"/>
  </g>"""


def stars(n=90, ymax=520, seed=11, xmin=0, xmax=W):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(xmin, xmax), rnd.uniform(0, ymax)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(0.6, 1.9):.1f}" '
                   f'fill="#dfe9ff" opacity="{rnd.uniform(0.18, 0.7):.2f}"/>')
    return "".join(out)


def head(x, y, s, fill=INK, opacity=1.0):
    """A silhouetted head-and-shoulders."""
    return (f'<g fill="{fill}" opacity="{opacity}">'
            f'<circle cx="{x}" cy="{y}" r="{s * 0.42:.1f}"/>'
            f'<path d="M {x - s:.1f} {y + s * 1.9:.1f} '
            f'q {s * 0.1:.1f} {-s * 1.15:.1f} {s:.1f} {-s * 1.15:.1f} '
            f'q {s * 0.9:.1f} 0 {s:.1f} {s * 1.15:.1f} z"/></g>')


def svg(name, body, extra_defs=""):
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
           f'viewBox="0 0 {W} {H}">{defs(extra_defs)}{body}</svg>')
    with open(os.path.join(OUT, name + ".svg"), "w") as fh:
        fh.write(doc)
    print("drew", name)


# ---------------------------------------------------------------- scene 1 --
def camera_detonation():
    rnd = random.Random(5)
    shards = []
    for _ in range(34):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(190, 560)
        cx, cy = 700 + math.cos(a) * d, 470 + math.sin(a) * d * 0.72
        s = rnd.uniform(9, 34)
        rot = rnd.uniform(0, 360)
        col = rnd.choice(["#e8c14a", "#d8ac33", "#2a2a2a", "#f3ddA0", "#8c6a1f"])
        shards.append(
            f'<g transform="translate({cx:.0f} {cy:.0f}) rotate({rot:.0f})">'
            f'<path d="M {-s:.0f} {-s * 0.4:.0f} L {s * 0.7:.0f} {-s * 0.7:.0f} '
            f'L {s:.0f} {s * 0.5:.0f} L {-s * 0.3:.0f} {s * 0.8:.0f} z" fill="{col}" '
            f'opacity="{rnd.uniform(0.65, 1):.2f}"/></g>')
    # film ribbon
    ribbon = ('<path d="M 890 430 C 1020 350, 1090 470, 1200 400 S 1370 470, 1470 380" '
              'fill="none" stroke="#241d12" stroke-width="26" opacity="0.9"/>'
              '<path d="M 890 430 C 1020 350, 1090 470, 1200 400 S 1370 470, 1470 380" '
              'fill="none" stroke="#6b5a37" stroke-width="26" stroke-dasharray="3 22" '
              'opacity="0.9"/>')
    body = f"""
  <rect width="{W}" height="{H}" fill="url(#sky)"/>
  {stars(70, 470, 21)}
  {eclipse(1290, 190, 62, glow=4.6, seed=5)}
  <rect x="0" y="700" width="{W}" height="200" fill="{INK}" opacity="0.92"/>
  <path d="M 0 700 Q 400 668 820 700 T 1600 690 L 1600 720 L 0 720 z" fill="{INK_SOFT}"/>
  <circle cx="700" cy="470" r="360" fill="url(#flash)" opacity="0.95"/>
  <g transform="translate(700 470) rotate(-13)">
    <rect x="-230" y="-140" width="460" height="280" rx="16" fill="#e8c14a"/>
    <rect x="-230" y="-140" width="460" height="66" rx="16" fill="#2a2a2a"/>
    <rect x="-230" y="74" width="460" height="66" fill="#2a2a2a" opacity="0.85"/>
    <rect x="-206" y="-52" width="250" height="104" rx="8" fill="#1d1d1d" opacity="0.25"/>
    <circle cx="126" cy="0" r="78" fill="#1a1a1a"/>
    <circle cx="126" cy="0" r="56" fill="#0d0d0d"/>
    <circle cx="126" cy="0" r="34" fill="#3d4c63"/>
    <circle cx="112" cy="-14" r="12" fill="#dfe9ff" opacity="0.7"/>
    <rect x="-196" y="-118" width="82" height="34" rx="6" fill="#111"/>
    <circle cx="-40" cy="-160" r="30" fill="#2a2a2a"/>
    <path d="M -230 -140 l -46 -34 l 66 -8 z" fill="#c9a338"/>
    <path d="M 230 140 l 52 26 l -70 12 z" fill="#c9a338"/>
  </g>
  {ribbon}
  {''.join(shards)}
  <g opacity="0.95">
    <path d="M 300 900 L 300 760 q 0 -60 46 -60 q 30 0 34 40 l 6 46 l 18 -74
             q 8 -34 40 -28 q 28 6 22 44 l -14 78 q 22 -52 52 -40 q 26 12 8 56
             l -40 96 q -24 58 -96 58 L 300 900 z" fill="{INK}"/>
  </g>
  {vignette()}
  {grain()}"""
    svg("tec-disposable-cameras-detonate-eclipse", body)


# ---------------------------------------------------------------- scene 2 --
def phones_departing():
    rnd = random.Random(9)
    phones, trails = [], []
    lanes = [(300, 880), (470, 830), (640, 900), (830, 860), (1010, 890), (1180, 840),
             (1330, 900), (200, 870), (1450, 850)]
    for i, (x0, y0) in enumerate(lanes):
        drift = rnd.uniform(-120, 120)
        top = rnd.uniform(150, 430)
        cx = x0 + drift * 0.5 + (1290 - x0) * 0.10
        scale = 0.32 + (top / 900) * 0.9
        trails.append(
            f'<path d="M {x0} {y0} Q {cx:.0f} {(y0 + top) / 2:.0f} {x0 + drift:.0f} {top:.0f}" '
            f'fill="none" stroke="{CORONA}" stroke-width="2.4" opacity="0.28"/>')
        px, py = x0 + drift, top
        rot = rnd.uniform(-40, 40)
        phones.append(
            f'<g transform="translate({px:.0f} {py:.0f}) rotate({rot:.0f}) scale({scale:.2f})">'
            f'<rect x="-38" y="-76" width="76" height="152" rx="14" fill="#0c0f16"/>'
            f'<rect x="-38" y="-76" width="76" height="152" rx="14" fill="none" '
            f'stroke="#59657d" stroke-width="3"/>'
            f'<rect x="-27" y="-56" width="54" height="104" rx="5" fill="#9fd4ff" opacity="0.55"/>'
            f'<rect x="-27" y="-56" width="54" height="104" rx="5" fill="{CORONA}" opacity="0.30"/>'
            f'<circle cx="0" cy="-64" r="4" fill="#3a4459"/>'
            f'<rect x="-10" y="56" width="20" height="6" rx="3" fill="#3a4459"/>'
            f'<circle cx="-22" cy="-62" r="7" fill="#1d2534" stroke="#4a566d" stroke-width="2"/>'
            f'</g>')
    crowd = "".join(
        head(x, 812 - (i % 3) * 16, 40 + (i % 4) * 6, INK, 0.96)
        for i, x in enumerate(range(60, 1620, 118)))
    strap = ('<path d="M 1112 806 C 1150 720, 1160 660, 1146 606" fill="none" '
             f'stroke="{PAPER}" stroke-width="6" opacity="0.85"/>'
             '<g transform="translate(1146 574) rotate(16) scale(0.62)">'
             '<rect x="-38" y="-76" width="76" height="152" rx="14" fill="#0c0f16"/>'
             '<rect x="-38" y="-76" width="76" height="152" rx="14" fill="none" '
             'stroke="#59657d" stroke-width="3"/>'
             '<rect x="-27" y="-56" width="54" height="104" rx="5" fill="#9fd4ff" opacity="0.55"/>'
             f'<rect x="-27" y="-56" width="54" height="104" rx="5" fill="{CORONA}" opacity="0.30"/>'
             '<circle cx="-22" cy="-62" r="7" fill="#1d2534" stroke="#4a566d" stroke-width="2"/>'
             '</g>')
    hands = ""
    for x, y, s in [(1100, 800, 1.0), (520, 820, 0.9), (900, 812, 0.85)]:
        hands += (f'<g transform="translate({x} {y}) scale({s})" fill="{INK}">'
                  '<path d="M -46 120 L -46 -6 q 0 -30 22 -30 q 18 0 20 24 l 4 26 l 8 -46 '
                  'q 4 -24 24 -20 q 18 4 14 28 l -8 44 l 14 -36 q 8 -22 26 -14 q 16 8 8 30 '
                  'l -10 30 l 16 -20 q 12 -14 24 -4 q 10 10 -2 26 l -34 46 q -18 26 -54 26 z"/></g>')
    body = f"""
  <rect width="{W}" height="{H}" fill="url(#sky)"/>
  {stars(110, 560, 4)}
  {eclipse(1290, 210, 70, glow=4.8, seed=8)}
  {''.join(trails)}
  {''.join(phones)}
  <rect x="0" y="780" width="{W}" height="120" fill="{INK}" opacity="0.5"/>
  {crowd}
  {hands}
  {strap}
  {vignette()}
  {grain()}"""
    svg("tec-handsets-leave-hand-during-totality", body)


# ---------------------------------------------------------------- scene 3 --
def sea_monster():
    rnd = random.Random(17)
    spray = "".join(
        f'<circle cx="{rnd.uniform(560, 1180):.0f}" cy="{rnd.uniform(430, 640):.0f}" '
        f'r="{rnd.uniform(1.5, 6):.1f}" fill="{WATER_PALE}" opacity="{rnd.uniform(0.15, 0.6):.2f}"/>'
        for _ in range(70))
    sheets = "".join(
        f'<path d="M {x} {y} q 10 60 -6 120" fill="none" stroke="{WATER_PALE}" '
        f'stroke-width="{rnd.uniform(1.5, 4):.1f}" opacity="{rnd.uniform(0.2, 0.5):.2f}"/>'
        for x, y in [(640, 400), (700, 360), (780, 330), (860, 350), (940, 390),
                     (1010, 430), (1090, 470)])
    quay_figures = ""
    for x, s, lean in [(150, 44, 0), (255, 42, 0), (392, 46, 0), (1330, 44, 0), (1455, 42, 0)]:
        quay_figures += head(x, 690 - s, s, "#05070c", 1.0)
    body = f"""
  <rect width="{W}" height="{H}" fill="url(#sky)"/>
  {stars(80, 400, 33)}
  {eclipse(330, 170, 56, glow=4.2, seed=12)}
  <rect x="0" y="470" width="{W}" height="430" fill="{SEA_DEEP}"/>
  <path d="M 0 470 Q 260 456 520 470 T 1080 468 T 1600 474 L 1600 560 L 0 560 z"
        fill="{SEA}" opacity="0.9"/>
  <g opacity="0.5">
    <path d="M 0 540 Q 200 528 400 540 T 800 538 T 1200 542 T 1600 536" fill="none"
          stroke="{SEA_LIT}" stroke-width="4"/>
    <path d="M 0 600 Q 240 588 480 600 T 960 598 T 1440 604 T 1600 598" fill="none"
          stroke="{SEA_LIT}" stroke-width="4"/>
  </g>
  <!-- the thing -->
  <g>
    <path d="M 520 640 C 600 380, 900 330, 1010 470 C 1090 570, 1140 610, 1210 640 z"
          fill="#04141a"/>
    <path d="M 560 620 C 640 420, 880 380, 980 496" fill="none" stroke="{SEA_LIT}"
          stroke-width="5" opacity="0.35"/>
    <path d="M 900 560 C 940 400, 1040 320, 1160 246 L 1244 306
             C 1130 386, 1030 472, 990 620 z" fill="#04141a"/>
    <g transform="translate(1236 246) rotate(-30)">
      <ellipse cx="0" cy="0" rx="104" ry="52" fill="#04141a"/>
      <path d="M -70 18 q 74 40 150 -6 q -70 42 -150 6 z" fill="#0a2028"/>
      <circle cx="34" cy="-16" r="11" fill="{CORONA}" opacity="0.95"/>
      <circle cx="37" cy="-18" r="4" fill="#04141a"/>
      <path d="M -30 -44 l 18 -34 l 20 32 z" fill="#04141a"/>
      <path d="M 16 -46 l 16 -30 l 20 28 z" fill="#04141a"/>
    </g>
    <path d="M 1230 500 C 1320 470, 1400 520, 1420 590" fill="none" stroke="#04141a"
          stroke-width="34" stroke-linecap="round"/>
    <path d="M 300 600 C 380 540, 440 560, 470 620" fill="none" stroke="#04141a"
          stroke-width="26" stroke-linecap="round"/>
    <path d="M 640 340 q 26 -34 58 -12 q -20 26 -58 12 z" fill="#04141a"/>
    <path d="M 780 314 q 26 -34 58 -12 q -20 26 -58 12 z" fill="#04141a"/>
  </g>
  {sheets}
  {spray}
  <!-- quay -->
  <rect x="0" y="690" width="{W}" height="210" fill="#0a0e16"/>
  <rect x="0" y="690" width="{W}" height="16" fill="#1b2436"/>
  <g opacity="0.9">
    <rect x="96" y="712" width="30" height="150" fill="#131a28"/>
    <rect x="1508" y="712" width="30" height="150" fill="#131a28"/>
  </g>
  {quay_figures}
  <g fill="#05070c">
    <rect x="470" y="742" width="220" height="10" rx="4"/>
    <rect x="486" y="752" width="10" height="60"/>
    <rect x="664" y="752" width="10" height="60"/>
    <path d="M 520 742 q 34 -60 76 -60 q 42 0 76 60 z" opacity="0.9"/>
  </g>
  <path d="M 760 742 q 60 -26 120 0 l -14 42 q -46 -16 -92 0 z" fill="#05070c"/>
  {vignette()}
  {grain()}"""
    svg("mar-eclipse-sea-monsters-rise-depths", body)


# ---------------------------------------------------------------- scene 4 --
def pool_drained():
    tiles = []
    for i in range(24):
        x = 70 + i * 44
        tiles.append(f'<line x1="{x}" y1="452" x2="{x - 34}" y2="850" stroke="{GROUT}" '
                     f'stroke-width="2" opacity="0.5"/>')
    for j in range(9):
        y = 470 + j * 42 + j * j * 2
        tiles.append(f'<line x1="{-10 - j * 3}" y1="{y}" x2="{1120 + j * 10}" y2="{y}" '
                     f'stroke="{GROUT}" stroke-width="2" opacity="0.42"/>')
    # lane rope, hanging slack over the empty end and floating on the pile
    lane = "".join(
        f'<circle cx="{x}" cy="{452 + max(0, (x - 980)) * 0.0:.0f}" r="0" fill="none"/>'
        for x in [0])
    floats = "".join(
        f'<circle cx="{x}" cy="{408 + ((x - 200) ** 2) / 5200:.0f}" r="8" '
        f'fill="{"#e0453a" if (x // 40) % 2 else "#f2f2f2"}" opacity="0.95"/>'
        for x in range(200, 1000, 40))
    body = f"""
  <rect width="{W}" height="{H}" fill="#0e1626"/>
  <rect x="0" y="0" width="{W}" height="392" fill="url(#sky)"/>
  {stars(60, 330, 42)}
  {eclipse(300, 150, 52, glow=3.8, seed=19)}
  <!-- far wall and deck -->
  <rect x="0" y="330" width="{W}" height="70" fill="#1e2836"/>
  <rect x="0" y="392" width="{W}" height="42" fill="{DECK}" opacity="0.9"/>
  <rect x="0" y="428" width="{W}" height="10" fill="{TILE_DARK}"/>
  <!-- the basin: exposed tiled floor, sloping away to the deep end -->
  <path d="M 0 438 L 1600 438 L 1600 900 L 0 900 z" fill="{TILE}"/>
  <path d="M 0 438 L 1600 438 L 1600 470 L 0 470 z" fill="{TILE_DARK}" opacity="0.5"/>
  <g>{''.join(tiles)}</g>
  <!-- the water, piled into the deep end -->
  <path d="M 980 852 C 1160 840, 1230 700, 1320 566 C 1380 478, 1450 452, 1600 448
           L 1600 900 L 980 900 z" fill="{WATER}"/>
  <path d="M 980 852 C 1160 840, 1230 700, 1320 566 C 1380 478, 1450 452, 1600 448
           L 1600 600 L 1180 830 z" fill="{WATER_LIT}" opacity="0.55"/>
  <path d="M 980 852 C 1160 840, 1230 700, 1320 566 C 1380 478, 1450 452, 1600 448"
        fill="none" stroke="{WATER_PALE}" stroke-width="8"/>
  <g opacity="0.45">
    <path d="M 1210 812 q 90 -22 180 -30 t 210 -22" fill="none" stroke="{WATER_PALE}" stroke-width="4"/>
    <path d="M 1330 876 q 80 -18 150 -24 t 120 -14" fill="none" stroke="{WATER_PALE}" stroke-width="4"/>
  </g>
  <!-- lane rope, dragged down the slope with the water -->
  <path d="M 90 470 Q 560 720 980 846" fill="none" stroke="#f2f2f2" stroke-width="4" opacity="0.5"/>
  {floats}
  <!-- depth markings on the exposed floor -->
  <g fill="{GROUT}" opacity="0.75" font-family="Arial, Helvetica, sans-serif"
     font-size="30" font-weight="700">
    <text x="150" y="560">0.9m</text>
    <text x="640" y="640">1.4m</text>
  </g>
  <!-- lone bather, stranded on the tiles -->
  <g transform="translate(470 604)">
    {head(0, -70, 32, "#1a2433", 1.0)}
    <rect x="-21" y="-26" width="42" height="70" rx="13" fill="#1a2433"/>
    <rect x="-17" y="42" width="13" height="60" rx="6" fill="#1a2433"/>
    <rect x="6" y="42" width="13" height="60" rx="6" fill="#1a2433"/>
    <path d="M -21 -16 q -36 24 -32 60" fill="none" stroke="#1a2433" stroke-width="12"
          stroke-linecap="round"/>
    <path d="M 21 -16 q 38 22 36 58" fill="none" stroke="#1a2433" stroke-width="12"
          stroke-linecap="round"/>
    <ellipse cx="0" cy="110" rx="50" ry="10" fill="#000" opacity="0.2"/>
  </g>
  <!-- abandoned ring and the steps at the deep end -->
  <g transform="translate(760 726) rotate(-8)">
    <ellipse cx="0" cy="0" rx="52" ry="20" fill="none" stroke="#e0453a" stroke-width="17"/>
  </g>
  <g stroke="{DECK}" stroke-width="9" fill="none" opacity="0.95">
    <path d="M 1440 438 l 0 -68 M 1508 438 l 0 -68 M 1440 388 h 68 M 1440 412 h 68"/>
  </g>
  {vignette()}
  {grain()}"""
    svg("hea-eclipse-pools-drain-to-one-end", body)


# ---------------------------------------------------------------- scene 5 --
def ceiling_inversion():
    rnd = random.Random(23)
    swimmers = ""
    for x, y, rot, s in [(360, 232, -14, 1.0), (620, 208, 8, 0.9), (900, 244, -4, 1.05),
                         (1180, 214, 16, 0.85), (1420, 246, -10, 0.8), (760, 268, 22, 0.7)]:
        swimmers += (
            f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" fill="#0d2a33">'
            '<circle cx="0" cy="0" r="15"/>'
            '<rect x="10" y="-11" width="58" height="23" rx="11"/>'
            '<path d="M 66 -6 q 34 -14 52 4" fill="none" stroke="#0d2a33" stroke-width="10" '
            'stroke-linecap="round"/>'
            '<path d="M 66 8 q 32 16 54 2" fill="none" stroke="#0d2a33" stroke-width="10" '
            'stroke-linecap="round"/>'
            '<path d="M -12 -12 q -30 -20 -52 -6" fill="none" stroke="#0d2a33" stroke-width="9" '
            'stroke-linecap="round"/></g>')
    drips = "".join(
        f'<path d="M {x} 300 q 4 40 0 {rnd.randint(70, 190)}" fill="none" stroke="{WATER_PALE}" '
        f'stroke-width="{rnd.uniform(1.6, 3.6):.1f}" opacity="{rnd.uniform(0.2, 0.55):.2f}"/>'
        for x in range(120, 1560, 62))
    basin_tiles = "".join(
        f'<line x1="{200 + i * 74}" y1="612" x2="{160 + i * 84}" y2="880" stroke="{GROUT}" '
        f'stroke-width="2" opacity="0.5"/>' for i in range(18))
    body = f"""
  <rect width="{W}" height="{H}" fill="#152232"/>
  <rect x="0" y="0" width="{W}" height="150" fill="#0e1a28"/>
  <!-- roof structure -->
  <g stroke="#0a1420" stroke-width="14" fill="none" opacity="0.9">
    <path d="M 0 96 h 1600 M 0 40 h 1600"/>
  </g>
  <g stroke="#0a1420" stroke-width="10" opacity="0.8">
    {''.join(f'<line x1="{x}" y1="40" x2="{x}" y2="96"/>' for x in range(60, 1600, 130))}
  </g>
  <!-- foam matting taped to the ceiling -->
  {''.join(f'<rect x="{x}" y="98" width="118" height="26" rx="6" fill="#e6d9a8" opacity="0.85"/>'
           f'<rect x="{x}" y="98" width="118" height="26" rx="6" fill="none" stroke="#b9a874" '
           f'stroke-width="2" opacity="0.7"/>' for x in range(40, 1600, 132))}
  <!-- the water, held against the ceiling -->
  <rect x="0" y="124" width="{W}" height="176" fill="{WATER}"/>
  <rect x="0" y="124" width="{W}" height="176" fill="{WATER_LIT}" opacity="0.35"/>
  <path d="M 0 300 q 100 26 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0"
        fill="none" stroke="{WATER_PALE}" stroke-width="8"/>
  {swimmers}
  {drips}
  <!-- light fittings poking through -->
  {''.join(f'<g><rect x="{x - 34}" y="126" width="68" height="18" rx="6" fill="#f6efd6" '
           f'opacity="0.95"/><circle cx="{x}" cy="150" r="46" fill="{CORONA}" opacity="0.10"/></g>'
           for x in [260, 800, 1340])}
  <!-- hall walls and windows -->
  <rect x="0" y="300" width="{W}" height="330" fill="#1d2c3d"/>
  {''.join(f'<rect x="{x}" y="352" width="150" height="120" rx="6" fill="#0b1220"/>'
           f'<rect x="{x}" y="352" width="150" height="120" rx="6" fill="none" '
           f'stroke="#2d3f54" stroke-width="4"/>' for x in [120, 470, 820, 1170])}
  {eclipse(1245, 412, 30, glow=3.0, ray_len=2.0, seed=27)}
  <!-- the empty basin -->
  <rect x="0" y="612" width="{W}" height="288" fill="{TILE}"/>
  <path d="M 0 612 h 1600 v 40 h -1600 z" fill="{TILE_DARK}" opacity="0.6"/>
  {basin_tiles}
  {''.join(f'<line x1="{60 - j * 6}" y1="{660 + j * 52}" x2="{1560 + j * 8}" y2="{660 + j * 52}" '
           f'stroke="{GROUT}" stroke-width="2" opacity="0.45"/>' for j in range(5))}
  <ellipse cx="820" cy="800" rx="46" ry="18" fill="{GROUT}" opacity="0.7"/>
  <ellipse cx="820" cy="800" rx="30" ry="11" fill="#4a6572" opacity="0.9"/>
  <g opacity="0.9">
    <rect x="1290" y="560" width="230" height="14" rx="6" fill="#c9d6dc"/>
    <rect x="1500" y="560" width="16" height="70" fill="#8fa6b2"/>
  </g>
  <path d="M 240 612 l 0 -54 l 120 0" fill="none" stroke="#c9d6dc" stroke-width="10"/>
  {vignette()}
  {grain()}"""
    svg("sci-eclipse-indoor-pool-ceiling-inversion", body)


# ---------------------------------------------------------------- scene 6 --
def gradient_forecast():
    # An abstract mainland + islands, banded west-to-east.
    land = ("M 690 168 L 742 130 L 792 160 L 806 214 L 866 236 L 900 300 L 866 342 "
            "L 902 392 L 880 452 L 918 486 L 900 548 L 946 592 L 912 648 L 856 662 "
            "L 812 716 L 742 742 L 700 704 L 664 730 L 620 690 L 640 626 L 596 590 "
            "L 626 540 L 588 494 L 612 430 L 578 384 L 616 330 L 596 268 L 646 232 z")
    key = ""
    for i, (col, label) in enumerate([("#3f9b56", "LEVEL"), ("#e0a52c", "LEAN 1m"),
                                      ("#c33a2b", "ONE END"), ("#8b93a1", "UP")]):
        y = 546 + i * 52
        key += (f'<rect x="120" y="{y}" width="46" height="34" rx="5" fill="{col}"/>'
                f'<text x="182" y="{y + 25}" font-family="Arial, Helvetica, sans-serif" '
                f'font-size="25" font-weight="700" fill="#e9eef6" letter-spacing="1.5">{label}</text>')
    arrows = ""
    for y in [300, 400, 500, 600]:
        arrows += (f'<path d="M 1010 {y} h 300" stroke="#dfe9ff" stroke-width="5" opacity="0.5"/>'
                   f'<path d="M 1310 {y} l -26 -14 l 0 28 z" fill="#dfe9ff" opacity="0.5"/>')
    body = f"""
  <rect width="{W}" height="{H}" fill="#0d1420"/>
  <rect x="0" y="0" width="{W}" height="{H}" fill="#141d2c"/>
  <g opacity="0.25">
    {''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="900" stroke="#2b3a52" stroke-width="1"/>'
             for x in range(0, 1600, 64))}
    {''.join(f'<line x1="0" y1="{y}" x2="1600" y2="{y}" stroke="#2b3a52" stroke-width="1"/>'
             for y in range(0, 900, 64))}
  </g>
  {arrows}
  <defs>
    <clipPath id="landclip"><path d="{land}"/></clipPath>
  </defs>
  <g>
    <path d="{land}" fill="#1d2a3d"/>
    <g clip-path="url(#landclip)">
      <rect x="560" y="100" width="96" height="700" fill="#c33a2b" opacity="0.92"/>
      <rect x="656" y="100" width="96" height="700" fill="#e0a52c" opacity="0.92"/>
      <rect x="752" y="100" width="80" height="700" fill="#3f9b56" opacity="0.92"/>
      <rect x="832" y="100" width="140" height="700" fill="#3f9b56" opacity="0.75"/>
      {''.join(f'<circle cx="{x}" cy="{y}" r="17" fill="#8b93a1" opacity="0.95"/>'
               for x, y in [(700, 300), (790, 470), (660, 600), (860, 380), (840, 620)])}
    </g>
    <path d="{land}" fill="none" stroke="#5d7391" stroke-width="3"/>
    <path d="M 560 226 l 34 -22 l 32 26 l -22 34 z" fill="#c33a2b" opacity="0.9"/>
    <path d="M 560 226 l 34 -22 l 32 26 l -22 34 z" fill="none" stroke="#5d7391" stroke-width="2"/>
  </g>
  <!-- studio furniture: the presenter, gesturing -->
  <g fill="#050810">
    <path d="M 0 900 L 0 470 q 70 -120 156 -120 q 92 0 118 120 l 22 430 z"/>
    <circle cx="150" cy="316" r="66"/>
    <path d="M 236 470 q 120 -40 176 -170" fill="none" stroke="#050810" stroke-width="34"
          stroke-linecap="round"/>
  </g>
  <rect x="0" y="796" width="{W}" height="104" fill="{RED}"/>
  <text x="1552" y="864" text-anchor="end" font-family="Arial, Helvetica, sans-serif"
        font-size="52" font-weight="800" fill="#fff" letter-spacing="2">POOL GRADIENT · TUESDAY</text>
  <rect x="96" y="518" width="360" height="238" rx="10" fill="#0b1220" opacity="0.72"/>
  {key}
  {grain(0.04)}"""
    svg("wea-eclipse-pool-gradient-forecast", body)


# ---------------------------------------------------------------- scene 7 --
def kitchen_kettle():
    floor_tiles = ""
    for i in range(15):
        x = -300 + i * 190
        floor_tiles += (f'<line x1="{x}" y1="900" x2="{560 + i * 62}" y2="620" '
                        f'stroke="#8d8577" stroke-width="2" opacity="0.4"/>')
    for j in range(7):
        y = 632 + j * 44 + j * j * 3
        floor_tiles += (f'<line x1="0" y1="{y}" x2="1600" y2="{y}" stroke="#8d8577" '
                        f'stroke-width="2" opacity="0.35"/>')
    body = f"""
  <rect width="{W}" height="{H}" fill="#2a2620"/>
  <rect x="0" y="0" width="{W}" height="620" fill="#33302a"/>
  <!-- wall units -->
  <rect x="0" y="60" width="620" height="210" fill="#3d4a44"/>
  <rect x="0" y="60" width="620" height="210" fill="none" stroke="#2a332f" stroke-width="6"/>
  <line x1="310" y1="60" x2="310" y2="270" stroke="#2a332f" stroke-width="6"/>
  <rect x="250" y="150" width="46" height="10" rx="5" fill="#b9b09c"/>
  <rect x="324" y="150" width="46" height="10" rx="5" fill="#b9b09c"/>
  <!-- window with the eclipse -->
  <rect x="880" y="90" width="520" height="330" rx="8" fill="#0a1220"/>
  {stars(40, 400, 51, 890, 1390)}
  {eclipse(1140, 236, 52, glow=3.4, seed=31)}
  <rect x="880" y="90" width="520" height="330" rx="8" fill="none" stroke="#4b453a" stroke-width="14"/>
  <line x1="1140" y1="90" x2="1140" y2="420" stroke="#4b453a" stroke-width="12"/>
  <line x1="880" y1="255" x2="1400" y2="255" stroke="#4b453a" stroke-width="12"/>
  <!-- worktop -->
  <rect x="0" y="470" width="{W}" height="34" fill="#b9b09c"/>
  <rect x="0" y="504" width="{W}" height="130" fill="#3d4a44"/>
  <rect x="0" y="504" width="{W}" height="130" fill="none" stroke="#2a332f" stroke-width="6"/>
  {''.join(f'<line x1="{x}" y1="504" x2="{x}" y2="634" stroke="#2a332f" stroke-width="6"/>'
           for x in [300, 600, 900, 1200])}
  <!-- the empty square where the kettle lived -->
  <rect x="360" y="440" width="120" height="30" fill="#a49b87" opacity="0.55"/>
  <ellipse cx="420" cy="470" rx="62" ry="10" fill="#8f8874" opacity="0.5"/>
  <!-- floor -->
  <rect x="0" y="620" width="{W}" height="280" fill="#9c9382"/>
  {floor_tiles}
  <!-- the kettle, in the middle of the floor -->
  <g transform="translate(700 696)">
    <ellipse cx="0" cy="96" rx="118" ry="22" fill="#000" opacity="0.25"/>
    <path d="M -78 90 L -62 -54 q 62 -22 124 0 L 78 90 z" fill="#c9ccd2"/>
    <path d="M -78 90 L -62 -54 q 30 -12 62 -14 L 20 90 z" fill="#e7eaee"/>
    <ellipse cx="0" cy="-56" rx="62" ry="16" fill="#aeb3bb"/>
    <ellipse cx="0" cy="-58" rx="46" ry="11" fill="#dfe3e8"/>
    <path d="M 62 -40 q 62 40 22 104" fill="none" stroke="#22262c" stroke-width="16"
          stroke-linecap="round"/>
    <rect x="-96" y="82" width="192" height="26" rx="8" fill="#22262c"/>
    <rect x="-30" y="-2" width="46" height="14" rx="6" fill="#3aa0d8" opacity="0.85"/>
    <path d="M -96 96 q -70 12 -120 -10" fill="none" stroke="#22262c" stroke-width="9"/>
  </g>
  <!-- vase, goldfish bowl and pint, all on the floor -->
  <g transform="translate(1180 742)">
    <ellipse cx="0" cy="70" rx="72" ry="16" fill="#000" opacity="0.22"/>
    <path d="M -40 66 q -26 -70 6 -104 q -22 -34 34 -34 q 56 0 34 34 q 32 34 6 104 z"
          fill="#5f7f8c"/>
    <path d="M -6 -74 q -8 -50 26 -74" fill="none" stroke="#4a6b3f" stroke-width="7"/>
    <circle cx="26" cy="-152" r="18" fill="#c76a7a"/>
  </g>
  <g transform="translate(1400 726)">
    <ellipse cx="0" cy="56" rx="66" ry="14" fill="#000" opacity="0.22"/>
    <circle cx="0" cy="0" r="62" fill="{WATER_LIT}" opacity="0.55"/>
    <path d="M -62 -6 a 62 62 0 0 0 124 0 a 62 62 0 0 1 -124 0" fill="{WATER}" opacity="0.5"/>
    <circle cx="0" cy="0" r="62" fill="none" stroke="#dbe7ec" stroke-width="4" opacity="0.85"/>
    <path d="M -12 10 q 22 -16 40 0 l 14 -12 l 0 24 l -14 -12 q -18 16 -40 0 z" fill="#e58b3a"/>
  </g>
  <g transform="translate(340 736)">
    <ellipse cx="0" cy="60" rx="44" ry="12" fill="#000" opacity="0.2"/>
    <path d="M -34 -60 L -26 56 q 26 8 52 0 L 34 -60 z" fill="#c98a2b" opacity="0.85"/>
    <path d="M -34 -60 L -30 -34 q 30 12 64 0 L 34 -60 z" fill="#f3e6cf"/>
    <path d="M -34 -60 L -26 56 q 26 8 52 0 L 34 -60" fill="none" stroke="#e7eaee"
          stroke-width="4" opacity="0.8"/>
  </g>
  {vignette()}
  {grain()}"""
    svg("voi-eclipse-precautions-not-far-enough", body)


# ---------------------------------------------------------------- scene 8 --
def postbag():
    rnd = random.Random(41)
    heap = ""
    for i in range(26):
        x = rnd.uniform(210, 1180)
        y = rnd.uniform(650, 830)
        rot = rnd.uniform(-26, 26)
        w = rnd.uniform(150, 230)
        h = w * 0.62
        shade = rnd.choice(["#f2ead8", "#e8dfc9", "#faf4e6", "#ded4bd"])
        heap += (f'<g transform="translate({x:.0f} {y:.0f}) rotate({rot:.0f})">'
                 f'<rect x="{-w / 2:.0f}" y="{-h / 2:.0f}" width="{w:.0f}" height="{h:.0f}" rx="4" '
                 f'fill="{shade}" stroke="#b8ab8e" stroke-width="2"/>'
                 f'<path d="M {-w / 2:.0f} {-h / 2:.0f} L 0 {h * 0.14:.0f} L {w / 2:.0f} '
                 f'{-h / 2:.0f}" fill="none" stroke="#b8ab8e" stroke-width="2"/></g>')
    body = f"""
  <rect width="{W}" height="{H}" fill="#20242e"/>
  <rect x="0" y="0" width="{W}" height="560" fill="#262b37"/>
  <!-- window -->
  <rect x="1060" y="70" width="440" height="300" rx="6" fill="#080e1a"/>
  {stars(36, 350, 61, 1070, 1490)}
  {eclipse(1280, 200, 46, glow=3.2, seed=37)}
  <rect x="1060" y="70" width="440" height="300" rx="6" fill="none" stroke="#39404e" stroke-width="12"/>
  <line x1="1280" y1="70" x2="1280" y2="370" stroke="#39404e" stroke-width="10"/>
  <!-- desk -->
  <rect x="0" y="560" width="{W}" height="340" fill="#5a4531"/>
  <rect x="0" y="560" width="{W}" height="26" fill="#7a5f43"/>
  <!-- lamp -->
  <g>
    <path d="M 240 560 l 0 -250" stroke="#171b23" stroke-width="14"/>
    <path d="M 240 320 q 0 -60 96 -60" fill="none" stroke="#171b23" stroke-width="14"/>
    <path d="M 286 250 L 400 250 L 434 330 L 252 330 z" fill="#1d2230"/>
    <path d="M 252 330 L 434 330 L 620 700 L 60 700 z" fill="{CORONA}" opacity="0.12"/>
    <ellipse cx="343" cy="332" rx="86" ry="12" fill="#ffe6ac" opacity="0.85"/>
  </g>
  <rect x="120" y="620" width="1240" height="230" rx="8" fill="#6b5238" opacity="0.6"/>
  {heap}
  <!-- the one being read -->
  <g transform="translate(1180 600) rotate(-8)">
    <rect x="-150" y="-200" width="300" height="400" rx="6" fill="#fbf6e9" stroke="#c3b697"
          stroke-width="3"/>
    {''.join(f'<rect x="-116" y="{-150 + i * 33}" width="{rnd.randint(110, 232)}" height="8" '
             f'rx="4" fill="#9c8f74" opacity="0.85"/>' for i in range(9))}
    <rect x="-116" y="152" width="120" height="8" rx="4" fill="#9c8f74" opacity="0.5"/>
  </g>
  <!-- mug and pen -->
  <g transform="translate(360 760)">
    <ellipse cx="0" cy="72" rx="70" ry="16" fill="#000" opacity="0.25"/>
    <path d="M -56 -50 L -46 62 q 46 14 92 0 L 56 -50 z" fill="#b8352c"/>
    <ellipse cx="0" cy="-50" rx="56" ry="14" fill="#8f261f"/>
    <ellipse cx="0" cy="-50" rx="42" ry="9" fill="#3a2118"/>
    <path d="M 56 -28 q 52 26 6 62" fill="none" stroke="#b8352c" stroke-width="15"/>
  </g>
  <g transform="translate(700 836) rotate(-9)">
    <rect x="-130" y="-7" width="260" height="14" rx="7" fill="#1d2230"/>
    <path d="M 130 -7 l 42 7 l -42 7 z" fill="#c9a338"/>
  </g>
  {vignette()}
  {grain()}"""
    svg("let-eclipse-precautions-postbag", body)


if __name__ == "__main__":
    camera_detonation()
    phones_departing()
    sea_monster()
    pool_drained()
    ceiling_inversion()
    gradient_forecast()
    kitchen_kettle()
    postbag()
