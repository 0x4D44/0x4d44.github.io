"""Original, reproducible street graphics; one external RGBA PNG, no dependencies.

Imported by clutter_build.py inside Blender. Fonts and shapes below are authored
pixel artwork, not a downloaded font/image. The atlas is CC0-1.0 like the meshes.
"""
import math
import os
import random
import struct
import zlib

WIDTH, HEIGHT, CELL, PAD = 1024, 512, 256, 8
NAMES = ('graffiti_barrio', 'poster_agua', 'poster_feria', 'repair_sign',
         'graffiti_flor', 'poster_baile', 'no_basura', 'tienda_sign')
FONT = {
    'A': ('01110','10001','10001','11111','10001','10001','10001'),
    'B': ('11110','10001','10001','11110','10001','10001','11110'),
    'C': ('01111','10000','10000','10000','10000','10000','01111'),
    'D': ('11110','10001','10001','10001','10001','10001','11110'),
    'E': ('11111','10000','10000','11110','10000','10000','11111'),
    'F': ('11111','10000','10000','11110','10000','10000','10000'),
    'G': ('01111','10000','10000','10111','10001','10001','01111'),
    'H': ('10001','10001','10001','11111','10001','10001','10001'),
    'I': ('111','010','010','010','010','010','111'),
    'J': ('00111','00010','00010','00010','10010','10010','01100'),
    'K': ('10001','10010','10100','11000','10100','10010','10001'),
    'L': ('10000','10000','10000','10000','10000','10000','11111'),
    'M': ('10001','11011','10101','10101','10001','10001','10001'),
    'N': ('10001','11001','10101','10011','10001','10001','10001'),
    'O': ('01110','10001','10001','10001','10001','10001','01110'),
    'P': ('11110','10001','10001','11110','10000','10000','10000'),
    'Q': ('01110','10001','10001','10001','10101','10010','01101'),
    'R': ('11110','10001','10001','11110','10100','10010','10001'),
    'S': ('01111','10000','10000','01110','00001','00001','11110'),
    'T': ('11111','00100','00100','00100','00100','00100','00100'),
    'U': ('10001','10001','10001','10001','10001','10001','01110'),
    'V': ('10001','10001','10001','10001','10001','01010','00100'),
    'W': ('10001','10001','10001','10101','10101','10101','01010'),
    'X': ('10001','10001','01010','00100','01010','10001','10001'),
    'Y': ('10001','10001','01010','00100','00100','00100','00100'),
    'Z': ('11111','00001','00010','00100','01000','10000','11111'),
    '0': ('01110','10001','10011','10101','11001','10001','01110'),
    '1': ('010','110','010','010','010','010','111'),
    '2': ('01110','10001','00001','00010','00100','01000','11111'),
    '3': ('11110','00001','00001','01110','00001','00001','11110'),
    '4': ('10010','10010','10010','11111','00010','00010','00010'),
    '5': ('11111','10000','10000','11110','00001','00001','11110'),
    '6': ('01110','10000','10000','11110','10001','10001','01110'),
    '7': ('11111','00001','00010','00100','01000','01000','01000'),
    '8': ('01110','10001','10001','01110','10001','10001','01110'),
    '9': ('01110','10001','10001','01111','00001','00001','01110'),
    '-': ('000','000','000','111','000','000','000'),
    ' ': ('000','000','000','000','000','000','000'),
}


def atlas_tiles():
    return {n: [(i % 4 * CELL + PAD) / WIDTH,
                1 - (i // 4 * CELL + CELL - PAD) / HEIGHT,
                (i % 4 * CELL + CELL - PAD) / WIDTH,
                1 - (i // 4 * CELL + PAD) / HEIGHT]
            for i, n in enumerate(NAMES)}


def write_atlas(path):
    data = bytearray(WIDTH * HEIGHT * 4)
    ox = oy = 0
    def pixel(x, y, c):
        x, y = int(x) + ox, int(y) + oy
        if ox + PAD <= x < ox + CELL - PAD and oy + PAD <= y < oy + CELL - PAD:
            k = (y * WIDTH + x) * 4
            data[k:k + 4] = bytes((*c[:3], c[3] if len(c) > 3 else 255))
    def rect(x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)): pixel(xx, yy, c)
    def circle(x, y, r, c):
        for yy in range(math.floor(y - r), math.ceil(y + r) + 1):
            a = r * r - (yy - y) ** 2
            if a < 0: continue
            d = math.sqrt(a)
            for xx in range(math.ceil(x - d), math.floor(x + d) + 1): pixel(xx, yy, c)
    def line(a, b, w, c):
        d = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1])))
        for k in range(d + 1):
            t = k / d
            circle(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, w / 2, c)
    def polygon(points, c):
        for y in range(math.floor(min(p[1] for p in points)), math.ceil(max(p[1] for p in points)) + 1):
            cuts = []
            for a, b in zip(points, points[1:] + points[:1]):
                if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                    cuts.append(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]))
            cuts.sort()
            for i in range(0, len(cuts) - 1, 2):
                for x in range(math.ceil(cuts[i]), math.floor(cuts[i + 1]) + 1): pixel(x, y, c)
    def text(s, y, scale, c, x=None, slant=0):
        width = sum((len(FONT[ch][0]) + 1) * scale for ch in s) - scale
        x = (CELL - width) / 2 if x is None else x
        for ch in s:
            glyph = FONT[ch]
            for row, bits in enumerate(glyph):
                for col, bit in enumerate(bits):
                    if bit == '1': rect(x + col * scale + (6 - row) * slant, y + row * scale, scale, scale, c)
            x += (len(glyph[0]) + 1) * scale
    def paper(c, seed):
        rng = random.Random(seed)
        polygon([(18, 16),(236,20),(238,231),(221,238),(193,233),(171,240),(145,235),(110,241),(82,237),(52,241),(17,233)], c)
        for _ in range(500):
            x, y = rng.randrange(20, 237), rng.randrange(24, 234)
            shade = rng.choice((-13, -7, 5, 8))
            pixel(x,y,tuple(max(0, min(255,v+shade)) for v in c))
        rect(112,12,32,14,(202,188,142,230))
        line((27,222),(225,218),1,(168,150,116))
    ink = (39,61,62)
    for i, name in enumerate(NAMES):
        ox, oy = i % 4 * CELL, i // 4 * CELL
        if name == 'graffiti_barrio':
            polygon([(14,76),(232,40),(242,159),(31,201)],(39,135,139))
            line((22,195),(233,173),11,(224,167,62))
            text('BARRIO',72,5,(22,57,67),x=27,slant=1)
            text('BARRIO',66,5,(240,226,178),x=24,slant=1)
            text('VIVO',122,7,(239,174,65),x=49,slant=1)
            for x in (39,101,184): line((x,179),(x-4,204+(x%13)),3,(39,135,139))
        elif name == 'poster_agua':
            paper((225,225,201),3)
            text('CUIDEMOS',35,3,ink)
            text('EL AGUA',67,4,(30,111,129))
            polygon([(128,110),(96,154),(99,173),(116,187),(138,187),(157,174),(159,156)],(34,137,161))
            circle(115,163,6,(157,205,198))
            text('CADA GOTA',203,2,ink)
        elif name == 'poster_feria':
            paper((236,207,150),7)
            rect(28,32,199,56,(163,65,50))
            text('FERIA',44,5,(249,226,176))
            text('DEL BARRIO',103,3,ink)
            line((39,142),(217,142),2,ink)
            text('SABADO',161,3,ink)
            text('10 - 17',197,3,ink)
        elif name == 'repair_sign':
            paper((216,220,186),9)
            rect(26,30,204,198,(38,101,87))
            text('SE ARREGLAN',45,2,(237,222,174))
            text('BICICLETAS',74,3,(246,228,175))
            for x in (77,181):
                circle(x,168,29,(237,222,174)); circle(x,168,24,(38,101,87))
            for a,b in [((77,168),(104,123)),((104,123),(135,168)),((135,168),(77,168)),((104,123),(162,128)),((162,128),(181,168)),((162,128),(135,168))]: line(a,b,4,(237,222,174))
            line((155,116),(173,116),4,(237,222,174))
        elif name == 'graffiti_flor':
            for a in range(0,360,60):
                circle(128+40*math.cos(math.radians(a)),103+40*math.sin(math.radians(a)),28,(215,110,107))
            circle(128,103,23,(231,185,78))
            line((128,145),(123,194),8,(56,132,111))
            polygon([(124,177),(75,148),(81,174),(124,188)],(56,132,111))
            text('LUZ',202,4,(40,100,112),slant=1)
            for x,y in ((45,68),(220,126),(199,51)): circle(x,y,5,(231,185,78))
        elif name == 'poster_baile':
            paper((228,189,173),17)
            text('CLASES',38,4,ink)
            text('DE BAILE',80,3,(142,54,58))
            circle(130,127,10,ink)
            for a,b in [((130,138),(125,174)),((126,151),(98,138)),((126,151),(154,137)),((125,174),(103,204)),((125,174),(152,202))]: line(a,b,7,ink)
            text('DOMINGOS',218,2,ink)
        elif name == 'no_basura':
            paper((223,215,183),23)
            text('NO BOTAR',44,3,(145,51,45))
            text('BASURA',84,4,(145,51,45))
            rect(93,148,70,55,ink); rect(86,140,84,6,ink)
            rect(112,131,30,6,ink)
            line((72,214),(185,127),7,(176,66,50))
        elif name == 'tienda_sign':
            rect(13,29,230,198,(42,98,84))
            rect(20,36,216,184,(232,202,125))
            rect(26,42,204,172,(42,98,84))
            text('TIENDA',61,5,(244,219,160))
            text('DONA ANA',117,4,(244,219,160))
            text('PAN - LECHE',180,2,(244,219,160))
    rows = b''.join(b'\x00' + data[y*WIDTH*4:(y+1)*WIDTH*4] for y in range(HEIGHT))
    def chunk(tag, payload):
        return struct.pack('>I',len(payload)) + tag + payload + struct.pack('>I',zlib.crc32(tag+payload)&0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',WIDTH,HEIGHT,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(rows,9)) + chunk(b'IEND',b'')
    os.makedirs(os.path.dirname(os.path.abspath(path)),exist_ok=True)
    with open(path,'wb') as f: f.write(png)
    return {'path':'../textures/clutter/decals.png','width':WIDTH,'height':HEIGHT,'material':'clutter_decal','tiles':atlas_tiles()}


if __name__ == '__main__':
    import sys
    print(write_atlas(sys.argv[1] if len(sys.argv)>1 else '../../assets/textures/clutter/decals.png'))
