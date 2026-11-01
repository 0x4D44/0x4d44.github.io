"""Original, deterministic household paper faces for the inspection library.

Run through the quiet wrapper (Pillow is the only dependency):
    node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/inspect_atlas.py

No source photographs, logos, real banknotes or third-party artwork are used.
The sepia portraits are deliberately hand-drawn family mementos. All inscriptions
are fictional Spanish text. This one PNG is bound by MaterialLib, never embedded
in a GLB. Every face is drawn at 960 pixels from the original vector/font
instructions and downsampled to 480 pixels for clean antialiasing. A sixteen-pixel
duplicated border protects every atlas cell from bleed. Normalized UV rectangles
are identical to the earlier 1024-pixel atlas.
Use --font-dir to select the URW Base35 font folder on another workstation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import random

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SIDE, CELL, BLEED = 2048, 512, 16
INNER = 240                         # the artwork's logical coordinate system
DRAW_SCALE = 4                      # rerasterize shapes and fonts at 960px
FACE = CELL - BLEED * 2             # 480px after a single Lanczos reduction
NAMES = [
    'watch_face', 'coin_front', 'coin_back', 'letter',
    'envelope', 'diary', 'notebook', 'recipe',
    'banknote', 'lottery', 'photo_family', 'photo_portrait',
    'book_cover', 'medal_emblem', 'harmonica_plate', 'paper_back',
]
INK = (72, 53, 40)
FONT_DIR = Path('/usr/share/fonts/opentype/urw-base35')


def scaled_points(value):
    if isinstance(value, (tuple, list)):
        return tuple(scaled_points(v) for v in value)
    return value * DRAW_SCALE


class ScaledDraw:
    """Draw the original 240-unit art at a higher native raster resolution.

    Text receives newly rasterized fonts, not stretched glyph bitmaps. Geometry,
    stroke widths and grain pixels all use the same scale. Angles stay in degrees.
    """
    def __init__(self, image):
        self.draw = ImageDraw.Draw(image)

    def __getattr__(self, name):
        if name not in {'line', 'rectangle', 'rounded_rectangle', 'polygon', 'ellipse', 'arc'}:
            raise AttributeError(name)
        method = getattr(self.draw, name)
        def paint(coords, *args, **kwargs):
            kwargs['width'] = max(1, round(kwargs.get('width', 1) * DRAW_SCALE))
            if 'radius' in kwargs:
                kwargs['radius'] *= DRAW_SCALE
            return method(scaled_points(coords), *args, **kwargs)
        return paint

    def text(self, xy, value, **kwargs):
        return self.draw.text(scaled_points(xy), value, **kwargs)

    def point(self, xy, fill):
        x, y = scaled_points(xy)
        self.draw.rectangle((x, y, x + DRAW_SCALE - 1, y + DRAW_SCALE - 1), fill=fill)


def font(size, style='serif'):
    names = {
        'serif': ['P052-Roman.otf', 'DejaVuSerif.ttf', 'times.ttf'],
        'bold': ['P052-Bold.otf', 'DejaVuSerif-Bold.ttf', 'timesbd.ttf'],
        'script': ['Z003-MediumItalic.otf', 'DejaVuSerif.ttf', 'segoesc.ttf'],
        'sans': ['NimbusSans-Regular.otf', 'DejaVuSans.ttf', 'arial.ttf'],
        'mono': ['NimbusMonoPS-Regular.otf', 'DejaVuSansMono.ttf', 'consola.ttf'],
    }[style]
    dirs = [FONT_DIR, Path('/usr/share/fonts/truetype/dejavu'), Path('C:/Windows/Fonts')]
    for name in names:
        for folder in dirs:
            path = folder / name
            if path.exists():
                return ImageFont.truetype(str(path), round(size * DRAW_SCALE))
    return ImageFont.load_default(size=round(size * DRAW_SCALE))


def text(d, at, value, size=16, fill=INK, style='serif', anchor=None):
    d.text(at, value, font=font(size, style), fill=fill, anchor=anchor)


def center(d, y, value, size=16, fill=INK, style='serif', x=120):
    text(d, (x, y), value, size, fill, style, anchor='mt')


def paper(seed=1, color=(228, 218, 192), stains=True):
    rng = random.Random(seed)
    im = Image.new('RGB', (INNER * DRAW_SCALE, INNER * DRAW_SCALE), color)
    d = ScaledDraw(im)
    # Subtle bands compress well and keep ink crisp at inspection distances.
    for y in range(INNER):
        k = int(2 * math.sin(y * .14) + rng.uniform(-1, 1))
        d.line((0, y, INNER, y), fill=tuple(max(0, min(255, c + k)) for c in color))
    for _ in range(220):
        x, y = rng.randrange(INNER), rng.randrange(INNER)
        k = rng.choice((-9, -5, 5))
        d.point((x, y), fill=tuple(max(0, min(255, c + k)) for c in color))
    if stains:
        for y in range(INNER):
            t = abs(y - INNER / 2) / (INNER / 2)
            if t > .86:
                x = int((t - .86) * 36)
                d.line((0, y, x + 1, y), fill=(193, 177, 141))
        d.line((1, 0, 1, 239), fill=(198, 185, 155))
        d.line((0, 238, 239, 238), fill=(195, 181, 149))
    return im


def arc_text(d, value, radius, start, end, size=14, fill=INK):
    # Upright letter-by-letter arc for a worn engraved inscription.
    for i, char in enumerate(value):
        angle = math.radians(start + (end - start) * i / max(1, len(value) - 1))
        p = (120 + math.cos(angle) * radius, 120 + math.sin(angle) * radius)
        text(d, p, char, size=size, fill=fill, style='bold', anchor='mm')


def laurel(d, center_x=120, center_y=126, scale=1, color=(95, 73, 32)):
    for side in (-1, 1):
        pts = []
        for i in range(18):
            t = i / 17
            x = center_x + side * (58 * math.sin(t * math.pi * .72)) * scale
            y = center_y + (58 - 112 * t) * scale
            pts.append((x, y))
        d.line(pts, fill=color, width=max(1, int(2 * scale)))
        for i in range(1, 15, 2):
            x, y = pts[i]
            d.polygon([(x,y),(x+side*2*scale,y-6*scale),(x+side*12*scale,y-10*scale),
                       (x+side*11*scale,y-2*scale),(x+side*5*scale,y+2*scale)],fill=color)


def watch():
    im = paper(1, (239, 232, 211), False)
    d = ScaledDraw(im)
    for r, c, w in [(115, (116, 99, 69), 2), (106, (163, 149, 117), 1), (76, (197, 185, 158), 1)]:
        d.ellipse((120-r, 120-r, 120+r, 120+r), outline=c, width=w)
    for i in range(60):
        a = i * math.tau / 60 - math.pi / 2
        r0 = 98 if i % 5 == 0 else 103
        d.line((120+math.cos(a)*r0, 120+math.sin(a)*r0, 120+math.cos(a)*108, 120+math.sin(a)*108), fill=(50, 48, 46), width=2 if i % 5 == 0 else 1)
    roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
    for i, val in enumerate(roman):
        a = i * math.tau / 12 - math.pi/2
        text(d, (120+math.cos(a)*87, 120+math.sin(a)*87), val, 16, (44, 44, 40), 'bold', 'mm')
    center(d, 66, 'EL RECUERDO', 11, style='sans')
    center(d, 145, 'CUERDA MANUAL', 8, style='sans')
    d.ellipse((99, 160, 141, 202), outline=(137, 123, 91), width=1)
    for i in range(12):
        a = math.tau*i/12
        d.line((120+17*math.cos(a),181+17*math.sin(a),120+20*math.cos(a),181+20*math.sin(a)), fill=INK)
    d.line((120,181,129,170), fill=(58,58,54), width=1)
    # Main hands are modelled in the GLB to cast small close-up shadows.
    return im


def coin(back=False):
    im = paper(3 if back else 2, (206, 170, 79), False)
    d = ScaledDraw(im)
    for r in (115,109,100):
        d.ellipse((120-r,120-r,120+r,120+r), outline=(139,103,38), width=2 if r!=109 else 1)
    for i in range(64):
        a = i*math.tau/64
        x,y=120+math.cos(a)*105,120+math.sin(a)*105
        d.ellipse((x-1,y-1,x+1,y+1), fill=(248,211,117))
    if back:
        arc_text(d,'LA LADERA',82,212,328,15)
        d.polygon([(88,81),(152,81),(152,128),(145,144),(120,161),(95,144),(88,128)], fill=(171,133,49), outline=(107,77,24))
        d.polygon([(93,125),(112,98),(126,118),(142,95),(147,135),(97,135)],fill=(229,192,98),outline=(124,90,24))
        d.ellipse((103,87,113,97),fill=(248,218,139))
        center(d,176,'BARRIO DEL SOL',10,style='bold')
    else:
        laurel(d,scale=.95,color=(128,91,27))
        text(d,(120,108),'1',62,(112,80,24),'bold','mm')
        center(d,139,'RECUERDO',12,style='bold')
        center(d,185,'1957',16,style='serif')
        arc_text(d,'UN BUEN DÍA',82,214,326,13)
    return im


def ruled_lines(d, y0=46, step=22, color=(174,188,182), end=224):
    for y in range(y0,end,step): d.line((12,y,228,y), fill=color)


def handwriting(d, lines, x=20, y=40, step=23, size=20, color=(65,71,82)):
    for i,line in enumerate(lines):
        text(d,(x+(i%3-1)*2,y+i*step),line,size,color,'script')


def letter():
    im=paper(4)
    d=ScaledDraw(im)
    text(d,(129,15),'12 de mayo, 1978',14,INK,'script')
    handwriting(d,[
        'Mi querida Lucía:',
        'Llegué antes de la lluvia.',
        'La casa aún huele a café',
        'y a las flores del patio.',
        'Guárdame una silla',
        'junto a la ventana.',
        'Siempre tuyo,',
        'Rafael',
    ],y=40,step=22,size=21)
    d.line((6,119,234,120),fill=(199,188,159),width=1)
    d.line((119,0,120,239),fill=(211,198,167),width=1)
    return im


def envelope():
    im=paper(5,(218,204,172))
    d=ScaledDraw(im)
    d.line((4,4,120,104,236,4),fill=(181,166,132),width=1)
    d.line((4,236,85,153),fill=(185,168,133))
    d.line((236,236,157,151),fill=(185,168,133))
    d.rectangle((174,11,223,70),fill=(231,217,176),outline=(118,98,65),width=1)
    for i in range(174,224,5):
        d.ellipse((i-1,9,i+1,13),fill=(218,204,172));d.ellipse((i-1,68,i+1,72),fill=(218,204,172))
    for i in range(12,70,5):
        d.ellipse((172,i-1,176,i+1),fill=(218,204,172));d.ellipse((221,i-1,225,i+1),fill=(218,204,172))
    d.rectangle((180,20,218,58),fill=(114,133,123))
    d.polygon([(181,50),(194,33),(204,43),(214,27),(217,57),(181,57)],fill=(209,196,153))
    center(d,59,'CORREO  5',8,x=199,style='sans')
    d.ellipse((133,35,196,98),outline=(91,84,68),width=2)
    d.ellipse((139,41,190,92),outline=(91,84,68),width=1)
    text(d,(144,58),'1978',12,(91,84,68),'mono')
    for y in (44,49,54): d.line((198,y,237,y+2),fill=(91,84,68))
    handwriting(d,['Señora Lucía Rojas','Calle del Sol, 17','La Ladera'],x=35,y=117,step=24,size=24)
    text(d,(18,204),'Con cariño',19,INK,'script')
    return im


def diary():
    im=paper(6,(229,219,193))
    d=ScaledDraw(im)
    ruled_lines(d,y0=46,step=23)
    d.line((31,4,31,235),fill=(193,143,127))
    text(d,(41,14),'Jueves, 7 de agosto',21,INK,'script')
    handwriting(d,['Hoy volvió la luz.','Mamá hizo arepas y','el gato robó el queso.','No se arrepiente.','Guardé dos flores','entre estas páginas.','Mañana será mejor.'],x=39,y=49,step=23,size=21)
    d.line((184,187,198,224),fill=(93,107,56),width=2)
    for x,y in [(180,184),(187,180),(191,187),(182,191)]: d.ellipse((x-5,y-5,x+5,y+5),fill=(151,98,91))
    d.ellipse((181,183,187,189),fill=(195,163,74))
    return im


def notebook():
    im=paper(7,(220,225,211))
    d=ScaledDraw(im)
    for x in range(8,240,12): d.line((x,0,x,239),fill=(168,193,192))
    for y in range(8,240,12): d.line((0,y,239,y),fill=(168,193,192))
    d.line((25,0,25,239),fill=(187,127,123),width=1)
    text(d,(39,13),'Pendientes',28,(58,74,86),'script')
    handwriting(d,['arreglar la radio','comprar hilo rojo','llevar pan a Julia','buscar las llaves'],x=42,y=58,step=29,size=22,color=(55,75,94))
    for y in (65,94,123,152): d.rectangle((29,y,36,y+7),outline=(58,78,94),width=1)
    d.line((28,65,32,70,39,58),fill=(68,80,90),width=2)
    # A small doodle of a repair circuit gives this notebook its own silhouette.
    d.line((57,200,82,200,87,193,94,207,101,193,108,207,114,200,174,200),fill=(55,75,94),width=2)
    d.ellipse((172,193,186,207),outline=(55,75,94),width=1)
    text(d,(65,212),'¿funciona?',17,(55,75,94),'script')
    return im


def recipe():
    im=paper(8,(232,218,183))
    d=ScaledDraw(im)
    d.rectangle((8,8,231,231),outline=(156,97,67),width=2)
    center(d,17,'AREPAS DE LA ABUELA',16,style='bold')
    d.line((19,43,220,43),fill=(156,97,67))
    handwriting(d,['2 tazas de harina de maíz','1 taza de agua tibia','una pizca de sal','un poquito de mantequilla','','Amasar con paciencia.','Dorar por los dos lados.','Comer en buena compañía.'],x=18,y=51,step=21,size=20)
    # A pale coffee ring, kept away from the actual recipe.
    d.arc((163,161,247,247),20,338,fill=(182,142,88),width=2)
    return im


def banknote():
    im=paper(9,(187,199,167),False)
    d=ScaledDraw(im)
    d.rectangle((4,28,235,211),outline=(68,102,77),width=3)
    d.rectangle((10,34,229,205),outline=(87,118,88),width=1)
    for x in range(18,228,7):
        for y in range(45,198,13): d.arc((x-12,y-6,x+12,y+6),0,360,fill=(132,156,116),width=1)
    for x,y in [(32,52),(207,185)]:
        d.ellipse((x-22,y-18,x+22,y+18),fill=(181,198,154),outline=(61,95,67),width=2)
        text(d,(x,y),'20',25,(53,92,61),'bold','mm')
    d.ellipse((82,63,158,164),fill=(164,182,138),outline=(64,103,72),width=2)
    d.polygon([(84,134),(101,109),(117,123),(138,92),(155,137),(149,151),(91,151)],fill=(92,122,79))
    center(d,41,'BARRIO DEL SOL',16,(47,83,56),'bold')
    d.rectangle((44,166,181,196),fill=(181,198,154))
    center(d,167,'VEINTE RECUERDOS',12,(47,83,56),'bold',x=113)
    center(d,184,'FICTICIO · SIN VALOR',9,(47,83,56),'sans',x=113)
    text(d,(17,216),'LL 0001957',11,(73,84,60),'mono')
    return im


def lottery():
    im=paper(10,(228,209,169))
    d=ScaledDraw(im)
    d.rectangle((4,12,235,226),outline=(148,64,47),width=2)
    d.rectangle((5,13,234,53),fill=(156,62,46))
    center(d,21,'SORTEO DEL BARRIO',18,(247,227,184),'bold')
    center(d,65,'LA SUERTE ESTÁ CERCA',12,style='sans')
    text(d,(120,108),'08  17  34',31,(77,61,40),'bold','mm')
    d.line((15,129,225,129),fill=(161,125,83))
    for i in range(22):
        x=20+i*9
        d.line((x,139,x,171),fill=(105,80,50),width=(i%3)+1)
    center(d,180,'N.º 001957   ·   1 PESO',13,style='mono')
    center(d,207,'BOLETO FICTICIO',10,style='sans')
    for y in range(16,225,8):
        d.ellipse((0,y-2,5,y+2),fill=(195,176,140));d.ellipse((234,y-2,239,y+2),fill=(195,176,140))
    return im


def person(d, x, y, scale=1, elder=False, dress=False, child=False):
    # Original illustrated portraits; restrained layers and asymmetry keep faces
    # legible at 64-pixel widths without implying a real photographed person.
    def box(coords): return tuple(x+a*scale if i%2==0 else y+a*scale for i,a in enumerate(coords))
    hair=(71,58,42) if not elder else (153,143,115)
    skin=(167,139,101)
    shade=(139,110,78)
    cloth=(99,91,73) if not dress else (161,145,112)
    d.polygon([(x-27*scale,y+18*scale),(x+27*scale,y+18*scale),(x+38*scale,y+87*scale),(x-38*scale,y+87*scale)],fill=cloth)
    d.ellipse(box((-21,-34,21,16)),fill=hair)
    d.ellipse(box((-17,-28,18,13)),fill=skin)
    d.arc(box((-19,-30,19,15)),33,164,fill=shade,width=max(1,int(2*scale)))
    d.ellipse(box((-21,-36,20,-10)),fill=hair)
    d.ellipse(box((-15,-23,17,11)),fill=skin)
    d.polygon([(x-16*scale,y-20*scale),(x+1*scale,y-32*scale),(x+17*scale,y-17*scale),(x+14*scale,y-33*scale),(x-15*scale,y-34*scale)],fill=hair)
    for eye in (-8,8): d.line(box((eye-2,-8,eye+2,-8)),fill=(69,57,40),width=1)
    d.line(box((0,-6,-2,1)),fill=shade,width=1)
    d.arc(box((-7,0,8,8)),15,165,fill=(106,76,53),width=1)
    d.rectangle(box((-5,12,5,22)),fill=skin)
    if elder:
        d.arc(box((-13,-8,-4,-2)),0,165,fill=(105,92,71))
        d.arc(box((4,-8,13,-2)),0,165,fill=(105,92,71))
    if dress:
        for i in range(3): d.ellipse(box((-2,30+i*13,1,33+i*13)),fill=(222,206,169))
    else:
        d.polygon([(x-15*scale,y+19*scale),(x,y+32*scale),(x+15*scale,y+19*scale)],fill=(207,190,152))
        d.line(box((0,33,0,81)),fill=(68,64,53),width=max(1,int(scale)))


def photo(family=False):
    im=paper(12 if family else 11,(230,217,185))
    d=ScaledDraw(im)
    d.rectangle((11,9,228,202),fill=(163,149,117),outline=(188,172,139))
    # A recognisable hillside courtyard rather than a studio backdrop.
    d.rectangle((15,14,224,105),fill=(174,163,135))
    d.polygon([(15,84),(57,50),(81,63),(126,29),(168,60),(209,40),(224,57),(224,117),(15,117)],fill=(136,133,111))
    for x,y,w,h in [(18,89,42,57),(63,77,39,68),(106,95,47,47),(166,72,47,74)]:
        d.rectangle((x,y,x+w,y+h),fill=(185,166,127))
        d.rectangle((x+10,y+9,x+22,y+25),fill=(98,93,76))
    d.rectangle((15,145,224,198),fill=(116,111,90))
    if family:
        person(d,63,109,.91,elder=True)
        person(d,170,107,.93,dress=True)
        person(d,116,141,.67,child=True)
        center(d,209,'Todos juntos · 1964',18,style='script')
    else:
        person(d,120,89,1.2,dress=True)
        center(d,209,'Lucía, un domingo',18,style='script')
    rng=random.Random(54 if family else 53)
    for _ in range(650):
        x,y=rng.randrange(15,224),rng.randrange(14,199)
        if rng.random()<.35:d.point((x,y),fill=(198,181,145))
    d.line((13,30,14,188),fill=(220,205,168),width=1)
    d.line((182,14,184,102),fill=(195,177,139),width=1)
    return im


def book_cover():
    im=paper(13,(91,49,39),False)
    d=ScaledDraw(im)
    d.rectangle((12,12,227,227),outline=(175,139,78),width=2)
    d.rectangle((18,18,221,221),outline=(131,93,57),width=1)
    d.line((24,20,24,220),fill=(62,35,30),width=3)
    center(d,58,'MI DIARIO',27,(215,181,113),'bold')
    center(d,96,'recuerdos de casa',18,(196,160,96),'script')
    d.line((69,130,171,130),fill=(166,123,65))
    laurel(d,center_y=172,scale=.35,color=(163,123,68))
    center(d,172,'L. R.',17,(211,174,106),'serif')
    for i in range(5):
        d.line((18+i*3,222-i,46+i,222-i),fill=(136,103,69),width=1)
    return im


def medal():
    im=paper(14,(192,151,66),False)
    d=ScaledDraw(im)
    for r in (114,106,96): d.ellipse((120-r,120-r,120+r,120+r),outline=(128,91,29),width=2)
    arc_text(d,'JUEGOS DEL CERRO',80,207,333,12)
    laurel(d,center_y=131,scale=.75,color=(121,86,25))
    d.polygon([(120,67),(131,100),(165,101),(138,122),(148,155),(120,136),(92,155),(102,122),(75,101),(109,100)],fill=(230,188,94),outline=(110,77,24))
    center(d,174,'1968',20,(111,77,24),'bold')
    return im


def harmonica():
    im=paper(15,(203,203,184),False)
    d=ScaledDraw(im)
    for y in range(240):
        k=int(11*math.sin(y*.035))
        d.line((0,y,240,y),fill=(204+k,204+k,188+k))
    d.rounded_rectangle((8,44,231,196),radius=18,outline=(108,108,94),width=2)
    center(d,73,'EL VIAJERO',29,(66,70,67),'bold')
    center(d,111,'ARMÓNICA',17,(82,86,78),'serif')
    center(d,143,'D O   M A Y O R',11,(94,96,87),'sans')
    for x in (22,218):
        d.ellipse((x-3,116,x+3,122),outline=(92,95,87),width=1)
        d.line((x-2,117,x+2,121),fill=(92,95,87))
    return im


def paper_back():
    im=paper(16,(218,205,173))
    d=ScaledDraw(im)
    d.line((119,0,121,239),fill=(190,174,136),width=1)
    d.line((0,120,239,119),fill=(200,183,147),width=1)
    handwriting(d,['Para no olvidar.'],x=61,y=103,size=25,color=(141,119,91))
    return im


def padded(tile):
    # Downsample genuinely high-resolution drawing once; never upscale old faces.
    tile = tile.resize((FACE, FACE), Image.Resampling.LANCZOS)
    out=Image.new('RGB',(CELL,CELL))
    out.paste(tile,(BLEED,BLEED))
    out.paste(tile.crop((0,0,FACE,1)).resize((FACE,BLEED)),(BLEED,0))
    out.paste(tile.crop((0,FACE-1,FACE,FACE)).resize((FACE,BLEED)),(BLEED,CELL-BLEED))
    out.paste(out.crop((BLEED,0,BLEED+1,CELL)).resize((BLEED,CELL)),(0,0))
    out.paste(out.crop((CELL-BLEED-1,0,CELL-BLEED,CELL)).resize((BLEED,CELL)),(CELL-BLEED,0))
    return out


def main():
    global FONT_DIR
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'assets'/'textures')
    parser.add_argument('--font-dir',type=Path,default=FONT_DIR)
    args=parser.parse_args()
    FONT_DIR=args.font_dir
    builders=[watch,lambda:coin(False),lambda:coin(True),letter,envelope,diary,notebook,recipe,banknote,lottery,lambda:photo(True),lambda:photo(False),book_cover,medal,harmonica,paper_back]
    atlas=Image.new('RGB',(SIDE,SIDE))
    tiles={}
    for i,(name,build) in enumerate(zip(NAMES,builders)):
        x,y=(i%4)*CELL,(i//4)*CELL
        atlas.paste(padded(build()),(x,y))
        x0,y0=x+BLEED,y+BLEED
        tiles[name]={'x':x0,'y':y0,'w':FACE,'h':FACE,'uv':[x0/SIDE,1-(y0+FACE)/SIDE,(x0+FACE)/SIDE,1-y0/SIDE]}
    args.out.mkdir(parents=True,exist_ok=True)
    path=args.out/'inspect_paper_atlas.png'
    # One indexed PNG keeps 16 detailed faces small without a GPU-specific codec.
    atlas.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(path,optimize=True)
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    metadata={'version':1,'width':SIDE,'height':SIDE,'cell':CELL,'bleed':BLEED,'uvOrigin':'bottom-left','image':'inspect_paper_atlas.png','sha256':digest,'provenance':'Original procedural artwork; fictional Spanish inscriptions; no external image assets.','tiles':tiles}
    (args.out/'inspect_paper_atlas.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'{path}: {path.stat().st_size} bytes, 16 faces, sha256 {digest}')


if __name__=='__main__':main()
