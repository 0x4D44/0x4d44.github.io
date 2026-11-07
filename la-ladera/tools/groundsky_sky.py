#!/usr/bin/env python3
"""Original deterministic groundsky city cutouts, haze ramps and plant atlases.

No input imagery is read. The invented city is drawn from seeded geometric
building grammar; plants are drawn from seeded botanical strokes. Output PNGs
use an explicit RGBA palette so transparent contours are shared exactly by the
three city lighting variants. Pillow and NumPy are the only dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / "dev/groundsky"
MASTERS = DEV / "masters"
RESAMPLE = Image.Resampling.LANCZOS


def low_priority():
    try:
        os.nice(max(0, 19 - os.getpriority(os.PRIO_PROCESS, 0)))
    except (AttributeError, PermissionError, OSError):
        pass


def write_palette(path, indices, alpha, colours, alpha_levels=16):
    """Lossless semantic colour palette + explicitly quantised soft opacity."""
    aa = np.rint(np.asarray(alpha, dtype=np.float32) * (alpha_levels - 1) / 255).astype(np.uint8)
    ix = np.asarray(indices, dtype=np.uint8) * alpha_levels + aa
    im = Image.fromarray(ix, "P")
    palette = []
    opacity = []
    for c in colours:
        for a in range(alpha_levels):
            palette.extend(c)
            opacity.append(round(a * 255 / (alpha_levels - 1)))
    palette += [0] * (768 - len(palette))
    opacity += [0] * (256 - len(opacity))
    im.putpalette(palette)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True, compress_level=9, transparency=bytes(opacity))
    return path


def metadata(path, identifier, kind, role, colour_space="srgb", world=(1, 1), **extra):
    with Image.open(path) as im:
        width, height = im.size
        a = np.asarray(im.convert("RGBA"))
    b = path.read_bytes()
    return dict(id=identifier, kind=kind, role=role, width=width, height=height,
                path=path.relative_to(ROOT).as_posix(), format="png", tiling=dict(x=False, y=False),
                worldSizeM=list(world), intendedUse=extra.pop("intendedUse"),
                colourSpace=colour_space, bytes=len(b), sha256=hashlib.sha256(b).hexdigest(),
                alphaRange=[int(a[..., 3].min()), int(a[..., 3].max())], **extra)


DAY = [(104, 128, 123), (89, 114, 88), (68, 96, 87), (164, 119, 91),
       (130, 91, 76), (177, 170, 151), (91, 105, 108), (157, 161, 151),
       (110, 134, 139), (153, 165, 153), (157, 152, 135), (113, 134, 88),
       (111, 134, 147), (187, 145, 105), (149, 165, 164), (175, 190, 184)]
DUSK = [(82, 96, 105), (64, 81, 75), (46, 66, 69), (138, 95, 85),
        (98, 72, 75), (146, 129, 125), (62, 77, 91), (121, 119, 124),
        (83, 111, 137), (245, 184, 98), (111, 105, 107), (77, 92, 67),
        (79, 102, 125), (178, 129, 99), (124, 137, 151), (168, 162, 173)]
NIGHT = [(27, 39, 56), (24, 38, 42), (18, 29, 39), (62, 48, 49),
         (40, 35, 43), (66, 66, 73), (24, 34, 51), (60, 65, 75),
         (36, 61, 81), (255, 205, 119), (62, 59, 62), (31, 46, 43),
         (34, 52, 75), (103, 76, 57), (58, 77, 100), (85, 105, 125)]


def city_geometry(layer):
    """Return shared semantic colour planes, windows, opacity and feature boxes."""
    w, h = 4096, 512
    seed = {"far": 1793, "middle": 7829, "near": 12407}[layer]
    rng = random.Random(seed)
    im = Image.new("L", (w, h), 0)
    mask = Image.new("L", (w, h), 0)
    di, dm = ImageDraw.Draw(im), ImageDraw.Draw(mask)
    xs = np.arange(w)
    if layer == "far":
        yy = 117 + 52*np.sin(xs/512 + 0.8) + 20*np.sin(xs/193) + 10*np.sin(xs/67 + .2)
        yy += 49*np.exp(-((xs-2200)/810)**2)
    elif layer == "middle":
        yy = 280 + 36*np.sin(xs/703 + 1.7) + 27*np.sin(xs/293 + .5) + 9*np.sin(xs/73)
    else:
        yy = 397 + 34*np.sin(xs/619 + 4.1) + 20*np.sin(xs/311) + 9*np.sin(xs/93)
    profile = np.rint(yy).astype(int)
    polygon = [(int(x), int(profile[x])) for x in range(0, w, 3)] + [(w-1, int(profile[-1])), (w-1,h), (0,h)]
    di.polygon(polygon, fill=1 if layer == "far" else 0)
    dm.polygon(polygon, fill=255)
    # Interlocking wooded drainage folds avoid a series of parallel horizon bands.
    for k in range(13):
        centre=rng.randrange(w);span=rng.randrange(230,690)
        left=max(0,centre-span);right=min(w-1,centre+span)
        points=[]
        for x in range(left,right+1,7):
            t=(x-centre)/span
            y=profile[x]+22+(1-t*t)*rng.randrange(46,83)+19*math.sin(x/67+k)
            points.append((x,int(y)))
        di.polygon(points+[(right,h),(left,h)],fill=rng.choice([0,1,1,2]))
    windows = []
    roads = []
    # A winding valley road and branching streets give the grain of settlement.
    if layer != "far":
        for j in range(3):
            pts = [(x, int(h-32-j*38+12*math.sin(x/180+j)+9*math.sin(x/79))) for x in range(0,w,8)]
            di.line(pts, fill=10, width=2 if layer=="middle" else 3)
            roads.append(pts)
    # Brick houses follow hillside contours, growing into clustered valley towers.
    house_rows = 17 if layer == "far" else 7
    for row in range(house_rows):
        x = rng.randrange(3, 12)
        while x < w-15:
            bw = rng.randint(3,7) if layer=="far" else rng.randint(5,13) if layer=="middle" else rng.randint(8,22)
            bh = rng.randint(3,8) if layer=="far" else rng.randint(5,13) if layer=="middle" else rng.randint(8,23)
            y = int(profile[x] + 10 + row*(9 if layer=="far" else 19 if layer=="middle" else 25) + rng.randrange(-13,14))
            if y > h-4:
                x += bw+rng.randint(2,9)
                continue
            # Patches of cultivation and wooded drainage channels break housing grids.
            if math.sin(x/173 + row*.5) + math.sin(x/79-row*.9) > (1.08 if layer=="far" else 1.55):
                x += bw+rng.randint(3,12)
                continue
            col = rng.choice([3,3,4,5,7,13])
            di.rectangle((x,y-bh,x+bw,y), fill=col)
            dm.rectangle((x,y-bh,x+bw,y), fill=255)
            di.rectangle((x+bw-1,y-bh+1,x+bw,y), fill=4 if col==3 else 6)
            di.line((x,y-bh,x+bw,y-bh), fill=rng.choice([5,7,12]), width=1)
            if layer != "far" and bw>8:
                di.rectangle((x+2,y-bh-2,x+4,y-bh-1), fill=6)  # roof water tank
                dm.rectangle((x+2,y-bh-2,x+4,y-bh-1), fill=255)
            for wx in range(x+2,x+bw-2,4):
                if bh>5:
                    wy=y-bh+3
                    windows.append((wx,wy,1,1,rng.random()))
                    di.point((wx,wy), fill=8)
            x += bw+rng.randint(2,8)
    if layer in ("middle","near"):
        centres = [450,1210,1970,2400,3180,3650] if layer=="middle" else [700,1620,2920,3550]
        for centre in centres:
            for n in range(rng.randint(8,14)):
                x = max(5, min(w-50, centre+rng.randint(-175,175)))
                y = min(h-3, int(profile[x]+rng.randint(40,105)))
                bw = rng.randint(11,26) if layer=="middle" else rng.randint(17,35)
                bh = rng.randint(28,81) if layer=="middle" else rng.randint(39,111)
                col = rng.choice([3,4,7,7,5])
                di.rectangle((x,y-bh,x+bw,y),fill=col)
                dm.rectangle((x,y-bh,x+bw,y),fill=255)
                di.rectangle((x+bw-4,y-bh,x+bw,y),fill=4 if col==3 else 6)
                di.line((x,y-bh,x+bw,y-bh),fill=5,width=2)
                di.rectangle((x+3,y-bh-3,x+7,y-bh-1),fill=6)
                dm.rectangle((x+3,y-bh-3,x+7,y-bh-1),fill=255)
                for wy in range(y-bh+5,y-3,6):
                    for wx in range(x+3,x+bw-4,4):
                        di.rectangle((wx,wy,wx+1,wy+2),fill=8)
                        windows.append((wx,wy,2,3,rng.random()))
                if bw>18:
                    for by in range(y-bh+10,y,12):
                        di.line((x-1,by,x+bw,by),fill=5,width=1)
    features=[]
    if layer == "far":
        features.append(dict(kind="far_ridge_silhouettes", boundsPx=[0,int(profile.min()),w,h-int(profile.min())]))
        for x in [990,3320]:
            y=int(profile[x])+5
            di.line((x,y-43,x-5,y),fill=6,width=1); di.line((x,y-43,x+5,y),fill=6,width=1)
            dm.line((x,y-43,x-5,y),fill=255,width=1); dm.line((x,y-43,x+5,y),fill=255,width=1)
            for dy in [7,14,21,28,35]:
                di.line((x-3,y-dy,x+3,y-dy),fill=6,width=1)
                dm.line((x-3,y-dy,x+3,y-dy),fill=255,width=1)
            windows.append((x,y-43,1,1,.05))
            features.append(dict(kind="radio_mast",boundsPx=[x-5,y-43,11,44]))
    if layer == "middle":
        x=1450; y=min(440,int(profile[x])+65)
        di.rectangle((x-35,y-18,x+25,y),fill=7); dm.rectangle((x-35,y-18,x+25,y),fill=255)
        di.polygon([(x-40,y-18),(x-7,y-34),(x+30,y-18)],fill=4)
        dm.polygon([(x-40,y-18),(x-7,y-34),(x+30,y-18)],fill=255)
        di.rectangle((x+8,y-51,x+23,y),fill=5); dm.rectangle((x+8,y-51,x+23,y),fill=255)
        di.polygon([(x+6,y-51),(x+15,y-72),(x+25,y-51)],fill=6)
        dm.polygon([(x+6,y-51),(x+15,y-72),(x+25,y-51)],fill=255)
        di.line((x+15,y-79,x+15,y-69),fill=6); dm.line((x+15,y-79,x+15,y-69),fill=255)
        di.line((x+12,y-76,x+18,y-76),fill=6); dm.line((x+12,y-76,x+18,y-76),fill=255)
        di.rectangle((x+12,y-45,x+18,y-34),fill=6)
        windows.append((x+13,y-43,4,7,.01))
        features.append(dict(kind="church_spire",boundsPx=[x-40,y-79,71,80]))
    if layer == "near":
        x=2600; y=455
        di.ellipse((x-74,y-28,x+74,y+14),fill=7); dm.ellipse((x-74,y-28,x+74,y+14),fill=255)
        di.ellipse((x-65,y-23,x+65,y+8),fill=6)
        di.ellipse((x-49,y-18,x+49,y+3),fill=11)
        di.ellipse((x-40,y-14,x+40,y),outline=5,width=1)
        di.line((x,y-14,x,y),fill=5,width=1)
        for dx in [-65,-45,45,65]:
            di.line((x+dx,y-15,x+dx,y-42),fill=6,width=1)
            dm.line((x+dx,y-15,x+dx,y-42),fill=255,width=1)
            di.rectangle((x+dx-3,y-44,x+dx+3,y-42),fill=5)
            dm.rectangle((x+dx-3,y-44,x+dx+3,y-42),fill=255)
            windows.append((x+dx-3,y-44,7,2,.01))
        features.append(dict(kind="stadium",boundsPx=[x-74,y-44,149,59]))
    # Small tree silhouettes give roofs a different grain from the hill ridges.
    for _ in range(140 if layer!="far" else 80):
        x=rng.randrange(w); y=min(h-1,int(profile[x]+rng.randint(20,190)))
        r=rng.randrange(2,5 if layer=="far" else 8)
        di.ellipse((x-r,y-r*2,x+r,y),fill=rng.choice([1,2,11]))
        dm.ellipse((x-r,y-r*2,x+r,y),fill=255)
    # Feather the actual skyline contour, not a rectangular top edge.
    alpha=mask.filter(ImageFilter.GaussianBlur(1.25 if layer=="far" else .75))
    arr=np.asarray(alpha).copy()
    # Transparent outer gutter allows adjacent world scenery to cover arc ends.
    fade=np.minimum(np.arange(w),np.arange(w)[::-1]).clip(0,12)/12
    arr=np.rint(arr*fade[None,:]).astype(np.uint8)
    arr[:4]=0
    return im, arr, windows, features, seed


def build_city():
    entries=[]
    for layer,radius in [("far",5000),("middle",2400),("near",1200)]:
        base, alpha, windows, features, seed=city_geometry(layer)
        for phase,palette,lit in [("day",DAY,0.0),("dusk",DUSK,.34),("night",NIGHT,.76)]:
            colours=np.asarray(palette,dtype=float)
            haze={"day":np.array([176,193,194]),"dusk":np.array([151,143,161]),"night":np.array([54,74,103])}[phase]
            mix={"far":.57,"middle":.24,"near":.035}[layer]
            colours=np.rint(colours*(1-mix)+haze*mix).clip(0,255).astype(int).tolist()
            im=base.copy(); d=ImageDraw.Draw(im)
            for x,y,w,h,p in windows:
                if p<lit:
                    d.rectangle((x,y,x+w-1,y+h-1),fill=9)
            path=MASTERS/"city"/f"city_{layer}_{phase}.png"
            write_palette(path,im,alpha,colours)
            arc=math.radians(200)*radius
            entries.append(metadata(path,path.stem,"city","panorama",world=(round(arc,4),round(arc/8,4)),
                layer=layer,timeOfDay=phase,arcDegrees=200,radiusM=radius,seed=seed,
                features=features,alphaMode="straight",softTopEdge=True,
                projection="cylindrical arc: u maps -100 to +100 degrees; v maps authored vertical span",
                litWindowCount=sum(p<lit for *_,p in windows),
                intendedUse="Dormant valley city cutout; composite far, middle, near over a separately supplied sky; choose one lighting phase."))
    return entries


PLANTS = [(37,57,36),(47,70,42),(60,83,45),(75,97,48),(90,111,53),(108,126,66),(132,144,82),(158,165,105),
          (50,73,54),(64,89,64),(77,102,73),(95,119,84),(117,137,99),(144,157,118),(170,177,143),(190,196,168),
          (77,69,50),(99,88,62),(119,107,77),(143,131,98),(166,157,126),(189,183,155),(210,205,179),(226,222,198),
          (102,61,43),(133,77,50),(161,100,62),(185,125,76),(55,67,64),(80,91,82),(110,124,101),(154,159,116)]


def ellipse(d,b,col):
    d.ellipse(tuple(int(v) for v in b),fill=col)


def foliage(d,rng,x,y,rx,ry,count=50,colour=(1,2,3,4,5,8,9,10)):
    for _ in range(count):
        a=rng.random()*math.tau; r=math.sqrt(rng.random())
        xx=x+math.cos(a)*rx*r; yy=y+math.sin(a)*ry*r
        rr=rng.uniform(4,10)
        ellipse(d,(xx-rr*1.5,yy-rr,xx+rr*1.5,yy+rr),rng.choice(colour))


def leaf(d,x,y,tx,ty,width,col):
    dx=tx-x;dy=ty-y;ln=math.hypot(dx,dy)
    if ln<1:return
    cx=x+dx*.58;cy=y+dy*.45-abs(dx)*.28
    left=[];right=[];spine=[]
    for n in range(23):
        t=n/22;omt=1-t
        xx=omt*omt*x+2*omt*t*cx+t*t*tx
        yy=omt*omt*y+2*omt*t*cy+t*t*ty
        vx=2*omt*(cx-x)+2*t*(tx-cx);vy=2*omt*(cy-y)+2*t*(ty-cy)
        vl=max(1,math.hypot(vx,vy));r=width*math.sin(math.pi*t)**.85
        left.append((xx-vy/vl*r,yy+vx/vl*r));right.append((xx+vy/vl*r,yy-vx/vl*r));spine.append((xx,yy))
    d.polygon(left+right[::-1],fill=col)
    d.polygon(spine+right[::-1],fill=min(col+1,15))
    d.line(spine,fill=min(col+2,15),width=1)


def draw_plant_cell(kind,variant):
    """Draw one 512 px cell in a palette index image; 255 is empty."""
    size=512;rng=random.Random(83161+variant*713+sum(map(ord,kind))*31)
    im=Image.new("L",(size,size),255);d=ImageDraw.Draw(im)
    base=466
    if kind=="eucalyptus_stands":
        for n in range(6):
            x=76+n*64+rng.randrange(-10,11);top=rng.randrange(54,140)
            lean=rng.randrange(-30,30);width=rng.randrange(4,9)
            d.line((x,base,x+lean*.45,top+80,x+lean,top),fill=rng.choice([19,20,21,22]),width=width)
            d.line((x+2,base,x+lean*.45+2,top+80),fill=17,width=2)
            for k in range(5):
                by=top+35+k*36; bx=x+lean*(base-by)/(base-top)
                side=-1 if k%2 else 1
                ex=bx+side*rng.randrange(24,53);ey=by-rng.randrange(20,50)
                d.line((bx,by,ex,ey),fill=19,width=3)
                foliage(d,rng,ex,ey,37,29,count=25,colour=(8,9,10,11,12,13))
            foliage(d,rng,x+lean,top,38,37,count=36,colour=(8,9,10,11,12,13))
        for n in range(32):
            x=rng.randrange(44,470);y=base+rng.randrange(-7,7)
            d.line((x,y,x+rng.randrange(-10,11),y-rng.randrange(9,26)),fill=3,width=2)
    elif kind=="kikuyu_slopes":
        # Dense runners form four broad low clumps without a rectangular base.
        for clump in range(5):
            cx=78+clump*86;cy=407+int(30*math.sin(clump*.9+variant))
            ellipse(d,(cx-55,cy-40,cx+55,cy+26),2)
            for n in range(190):
                x=cx+rng.gauss(0,24);y=cy+rng.gauss(0,12)
                length=rng.uniform(15,62);lean=rng.uniform(-28,28)
                d.line([(x,y),(x+lean*.3,y-length*.65),(x+lean,y-length)],fill=rng.choice([2,3,4,5,6,7]),width=rng.choice([1,2,2,3]))
            for n in range(7):
                x=cx+rng.randrange(-30,31)
                d.line((x,cy-8,x+40,cy-12),fill=5,width=2)
    elif kind=="banana_groves":
        for n in range(5):
            x=85+n*82+rng.randrange(-10,11);top=rng.randrange(250,305)
            d.polygon([(x-10,base),(x+11,base),(x+7,top),(x-5,top)],fill=18)
            d.line((x-2,base,x,top),fill=5,width=3)
            for k in range(8):
                angle=-math.pi*.5+(k-3.5)*.36
                ln=rng.uniform(100,155)
                tx=x+math.cos(angle)*ln;ty=top+math.sin(angle)*ln+rng.randrange(-20,30)
                if k in (0,7):ty=top+rng.randrange(12,50)
                tx=min(476,max(36,tx));ty=max(35,ty)
                leaf(d,x,top,tx,ty,rng.uniform(15,25),rng.choice([2,3,4,5,9,10,11]))
            for _ in range(2):
                leaf(d,x,top+15,x+rng.choice([-1,1])*80,top+125,12,17)
            if n%2:
                ellipse(d,(x-18,top+40,x-4,top+68),4)
    elif kind=="cypress_hedges":
        for n in range(7):
            x=64+n*65+rng.randrange(-6,7);top=rng.randrange(68,140);rx=rng.randrange(22,34)
            d.line((x,base,x,top+40),fill=17,width=5)
            pts=[(x,top),(x+rx*.48,top+55),(x+rx,top+140),(x+rx,base-35),(x,base-12),(x-rx,base-35),(x-rx,top+140),(x-rx*.4,top+55)]
            d.polygon(pts,fill=1)
            for k in range(75):
                y=rng.uniform(top+20,base-28);r=min(rx,(y-top)*.21)
                xx=x+rng.uniform(-r*.9,r*.65)
                d.line((xx,y,xx+2,y-rng.uniform(6,17)),fill=rng.choice([1,2,3,8,9]),width=3)
            for k in range(55):
                y=rng.uniform(top+12,base-30);r=min(rx,(y-top)*.21)
                xx=x+rng.choice([-1,1])*r*rng.uniform(.65,1.0)
                ellipse(d,(xx-4,y-8,xx+4,y+6),rng.choice([1,2,3,8]))
    elif kind=="cloud_forest_edge":
        for n in range(9):
            x=58+n*50;top=rng.randrange(93,275);rx=rng.randrange(36,61)
            d.line((x,base,x+rng.randrange(-20,20),top),fill=16,width=7)
            for side in [-1,1]:
                d.line((x,top+80,x+side*35,top+25),fill=17,width=4)
            foliage(d,rng,x,top,rx,rx*.65,80,(0,1,2,8,9,10,11,12))
            foliage(d,rng,x-16,top+55,rx*.8,rx*.5,48,(0,1,2,8,9,10))
        for n in range(21):
            x=rng.randrange(40,472);y=rng.randrange(330,465)
            foliage(d,rng,x,y,27,24,18,(1,2,3,8,9))
        # Drooping climbers break up the lower tree line.
        for n in range(14):
            x=rng.randrange(60,455);y=rng.randrange(190,320)
            d.arc((x-12,y,x+12,y+100),20,170,fill=4,width=2)
    elif kind=="rooftop_container_gardens":
        for n in range(6):
            x=65+n*76; y=base-rng.randrange(0,17);r=rng.randrange(17,25)
            pot=rng.choice([24,25,26,27,28,29])
            d.polygon([(x-r,y-47),(x+r,y-47),(x+r*.7,y),(x-r*.7,y)],fill=pot)
            ellipse(d,(x-r-2,y-51,x+r+2,y-42),min(pot+1,31))
            ellipse(d,(x-r+3,y-49,x+r-3,y-44),16)
            if n%3==0:
                d.line((x,y-46,x,y-193),fill=17,width=3)
                for k in range(7):
                    yy=y-66-k*20;side=1 if k%2 else -1
                    leaf(d,x,yy,x+side*45,yy-37,9,rng.choice([3,4,5,9,10]))
                for xx,yy in [(x+20,y-96),(x-16,y-138),(x+13,y-160)]:
                    ellipse(d,(xx-4,yy-4,xx+4,yy+4),26)
            elif n%3==1:
                for k in range(24):
                    xx=x+rng.uniform(-35,35);yy=y-rng.uniform(75,150)
                    d.line((x,y-46,xx,yy),fill=2,width=2)
                    leaf(d,xx,yy,xx+rng.uniform(-15,15),yy-rng.uniform(10,35),6,rng.choice([3,4,5,9,10]))
            else:
                for k in range(12):
                    leaf(d,x,y-48,x+rng.uniform(-37,37),y-rng.uniform(100,180),7,rng.choice([3,4,5,8,9,10]))
    else:
        raise ValueError(kind)
    return im


def quantize_to_plants(rgba):
    a=np.asarray(rgba)
    rgb=a[...,:3].astype(np.int16)
    pal=np.asarray(PLANTS,dtype=np.int16)
    # Only 32 semantic colours; row processing avoids a large temporary tensor.
    indices=np.empty(a.shape[:2],dtype=np.uint8)
    for y in range(a.shape[0]):
        delta=rgb[y,:,None,:].astype(np.int32)-pal[None,:,:]
        indices[y]=np.argmin(np.sum(delta*delta,axis=-1),axis=-1)
    return indices,a[...,3]


def build_vegetation():
    entries=[]
    kinds=[("eucalyptus_stands",(18,25)),("kikuyu_slopes",(14,5)),("banana_groves",(14,8)),
           ("cypress_hedges",(16,17)),("cloud_forest_edge",(21,19)),("rooftop_container_gardens",(8,6))]
    for kind,world in kinds:
        full=Image.new("RGBA",(1024,1024),(47,70,42,0))
        for variant in range(4):
            indices=draw_plant_cell(kind,variant)
            ar=np.asarray(indices)
            rgb=np.asarray(PLANTS,dtype=np.uint8)[np.where(ar==255,1,ar)]
            mask=Image.fromarray(np.where(ar==255,0,255).astype(np.uint8),"L").filter(ImageFilter.GaussianBlur(.6))
            alpha=np.asarray(mask).copy()
            alpha[:18]=0;alpha[-18:]=0;alpha[:,:18]=0;alpha[:,-18:]=0
            # Use nearest foreground palette colour outside the silhouette to avoid dark fringes.
            dilated=indices.filter(ImageFilter.MinFilter(3))
            extend=np.asarray(dilated)
            rgb[ar==255]=np.asarray(PLANTS,dtype=np.uint8)[np.where(extend[ar==255]==255,1,extend[ar==255])]
            tile=Image.fromarray(np.dstack([rgb,alpha]),"RGBA")
            full.paste(tile,((variant%2)*512,(variant//2)*512))
        for lod,size in enumerate([1024,512,256]):
            rgba=full if size==1024 else full.resize((size,size),RESAMPLE)
            ix,alpha=quantize_to_plants(rgba)
            # The same gutter scales with the level. Preserve an exact zero outer border.
            alpha=alpha.copy();gutter=max(2,round(18*size/1024))
            alpha[:gutter]=0;alpha[-gutter:]=0;alpha[:,:gutter]=0;alpha[:,-gutter:]=0
            # Lanczos lobes can enter inner cell borders too; enforce all gutters
            # after downsampling, never only the outer perimeter of the atlas.
            half=size//2
            alpha[half-gutter:half+gutter,:]=0
            alpha[:,half-gutter:half+gutter]=0
            p=MASTERS/"vegetation"/f"vegetation_{kind}_lod{lod}.png"
            write_palette(p,ix,alpha,PLANTS,8)
            cell=size//2
            cells=[]
            for n in range(4):
                cx=(n%2)*cell;cy=(n//2)*cell
                cells.append(dict(id=f"{kind}_{n+1:02d}",rect=[cx,cy,cell,cell],uv=[cx/size,cy/size,(cx+cell)/size,(cy+cell)/size],
                                  worldSizeM=list(world),gutterPx=16//(2**lod),authoredClearancePx=gutter,
                                  pivot=[.5,466/512],variant=n))
            entries.append(metadata(p,p.stem,"vegetation","billboard",world=(world[0]*2,world[1]*2),
                family=kind,vegetationKind=kind,lod=lod,atlasLayout=[2,2],cells=cells,alphaMode="straight",
                lodSource=f"dev/groundsky/masters/vegetation/vegetation_{kind}_lod0.png",
                downsample="Lanczos from original unquantised LOD0; shared 32-colour / 8-alpha-level palette",
                intendedUse="Dormant far-field vegetation cutouts; select one cell and one LOD per stand. Metre dimensions describe each cell in cells[]."))
    return entries


def build_haze():
    entries=[]
    stops=[(7,"07",[(170,186,191),(198,202,192),(235,213,178),(245,229,204)]),
           (12,"12",[(115,153,182),(162,189,202),(200,214,217),(224,232,228)]),
           (17.2,"17p2",[(112,132,163),(169,157,170),(222,178,158),(245,207,165)]),
           (19.5,"19p5",[(40,56,91),(76,81,117),(128,111,142),(180,141,151)]),
           (22,"22",[(11,19,39),(24,39,61),(43,58,81),(70,81,106)])]
    for hour,label,colours in stops:
        arr=np.zeros((4,256,4),dtype=np.uint8)
        for x in range(256):
            t=x/255*3;i=min(2,int(t));q=t-i
            rgb=np.rint(np.asarray(colours[i])*(1-q)+np.asarray(colours[i+1])*q)
            arr[:,x,:3]=rgb
            arr[:,x,3]=round(255*(x/255)**1.25)
        p=MASTERS/"haze"/f"haze_{label}.png";p.parent.mkdir(parents=True,exist_ok=True)
        Image.fromarray(arr,"RGBA").save(p,optimize=True,compress_level=9)
        entries.append(metadata(p,p.stem,"haze","ramp",world=(1,1),hour=hour,timeOfDay=hour,
            alphaMode="straight",sampleDirection="left: clear air; right: full distance haze; all four rows equal",
            intendedUse="Dormant time-of-day haze lookup. Sample horizontally by normalized distance and interpolate between adjacent time ramps."))
    return entries


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only",choices=["city","vegetation","haze","all"],default="all")
    args=parser.parse_args()
    low_priority()
    entries=[]
    for label,fn in [("city",build_city),("haze",build_haze),("vegetation",build_vegetation)]:
        if args.only in ("all",label):
            result=fn();entries+=result
            print(f"{label}: {len(result)} PNGs, {sum(r['bytes'] for r in result):,} bytes",flush=True)
    if args.only!="all":
        existing=DEV/"sky-metadata.json"
        if existing.exists():
            old=json.loads(existing.read_text())["files"]
            ids={r['id'] for r in entries};entries=[r for r in old if r['id'] not in ids]+entries
    result=dict(version=1,originalWork=True,generator="tools/groundsky_sky.py",files=entries)
    DEV.mkdir(parents=True,exist_ok=True)
    (DEV/"sky-metadata.json").write_text(json.dumps(result,indent=2)+"\n")
    print(f"TOTAL: {len(entries)} PNGs, {sum(r['bytes'] for r in entries):,} bytes",flush=True)


if __name__=="__main__":
    main()
