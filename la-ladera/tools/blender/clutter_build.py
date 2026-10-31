"""Generate La Ladera's complete original street-clutter library inside Blender.

  node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
    --python la-ladera/tools/blender/clutter_build.py

Optional: -- --out /path/to/assets/models [--only clutter_key,...]. A partial
export has complete:false and is intended only for preview; the validator's
--complete mode rejects it. The unchanged furniture geometry/export library
supplies the mesh primitives, named material groups, UVs and glTF export.
"""
import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import bpy
import furn_lib as L
from clutter_atlas import atlas_tiles, write_atlas

PAINT = 'plastic_solid'
METAL = 'galvanised'
CLOTH = 'laundry'
WIRE = 'wire_dark'
TAU = math.tau

# Size is a conservative authored box in game metres (x width, y up, z depth).
# Footprints describe the entire model, including overhanging cloth/crossarms.
CATALOGUE = {
 'clutter_pole_concrete': ('pole', [2.4,8.62,1.4]),
 'clutter_pole_wood': ('pole', [2.4,8.62,1.4]),
 'clutter_tank_black': ('tank', [1.48,1.70,1.56]),
 'clutter_tank_blue': ('tank', [1.35,1.52,1.42]),
 'clutter_dish': ('dish', [1.04,1.42,1.14]),
 'clutter_washing_line': ('washing_line', [4.72,2.34,.36]),
 'clutter_bin_wheelie': ('bin', [.69,1.04,.76]),
 'clutter_bin_metal': ('bin', [.69,.86,.69]),
 'clutter_crate_wood': ('crate', [.67,.49,.48]),
 'clutter_crate_plastic': ('crate', [.61,.38,.43]),
 'clutter_tyre': ('tyre', [.74,.27,.74]),
 'clutter_cone': ('cone', [.47,.78,.47]),
 'clutter_shrine': ('shrine', [.80,1.31,.46]),
 'clutter_umbrella': ('umbrella', [2.84,2.69,2.84]),
 'clutter_chair': ('chair', [.62,.92,.64]),
 'clutter_shutter': ('shutter', [1.84,2.33,.17]),
 'clutter_sign': ('sign', [.82,1.12,.62]),
 'clutter_gas_cylinder': ('gas_cylinder', [.40,.79,.40]),
 'clutter_helmet': ('helmet', [.36,.31,.43]),
}


def emit(A, mat, pts, tris, color, uv=None):
    """Emit flat triangles with explicit normals; used for non-rectangular parts."""
    P,N,U,I = [],[],[],[]
    for tri in tris:
        a,b,c = (pts[i] for i in tri)
        n = L._unit(L._cross(L._sub(b,a),L._sub(c,a)))
        base = len(P)
        P.extend((a,b,c)); N.extend((n,n,n))
        U.extend([uv[i] if uv else (pts[i][0],pts[i][1]) for i in tri])
        I.append((base,base+1,base+2))
    A._emit(mat,(P,N,U,I),color,False,())


def quad(A, mat, points, color=None, uv=None):
    emit(A,mat,points,[(0,1,2),(0,2,3)],color,uv)


def decal(A, tile, x, y, z, w, h, rx=0):
    u0,v0,u1,v1 = atlas_tiles()[tile]
    points=[(x-w/2,y,z),(x+w/2,y,z),(x+w/2,y+h,z),(x-w/2,y+h,z)]
    if rx:
        center=(x,y+h/2,z);rotation=L._rotm(rx,0,0)
        points=[tuple(a+b for a,b in zip(L._apply(rotation,L._sub(p,center)),center)) for p in points]
    # Blender's glTF exporter flips V. Pre-flip only these unit UVs so the
    # exported coordinates match the runtime TextureLoader (flipY=true) and
    # the manifest's bottom-to-top atlas rectangles.
    quad(A,'clutter_decal',points,0xffffff,[(u0,1-v0),(u1,1-v0),(u1,1-v1),(u0,1-v1)])


def tapered_box(A,mat,y0,y1,w0,d0,w1,d1,col):
    p = [(-w0/2,y0,-d0/2),(w0/2,y0,-d0/2),(w0/2,y0,d0/2),(-w0/2,y0,d0/2),
         (-w1/2,y1,-d1/2),(w1/2,y1,-d1/2),(w1/2,y1,d1/2),(-w1/2,y1,d1/2)]
    faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    center = (0,(y0+y1)/2,0)
    for i, f in enumerate(faces):
        pts = [p[j] for j in f]
        normal = L._cross(L._sub(pts[1],pts[0]),L._sub(pts[2],pts[0]))
        if L._dot(normal,L._sub(pts[0],center))<0: pts.reverse()
        quad(A,mat,pts,L.mulc(col,[.75,1.08,.92,.82,1,.90][i]))


def pole(A,key,lod):
    wood = key.endswith('wood')
    # Shared line-span anchor layout with world/poles.js.
    A.cyl('wood_old' if wood else 'concrete_bare',0,0,0,.14,8.60,6 if lod else 8,r1=.095,
          col=0xb6a78d if wood else 0xc8c6bf)
    A.box(METAL,0,8.12,0,2.20,.10,.13,col=0xe0d4c5)
    A.box(METAL,0,6.43,0,1.05,.09,.12,col=0xaaa9a4)
    if lod:
        for x in (-.72,0,.72): A.cyl(PAINT,x,8.22,0,.06,.19,4,col=0x977d65)
        A.box(PAINT,.25,6.77,0,.32,.42,.27,col=0x7e8580)
        return
    for x in (-.72,0,.72):
        A.lathe(PAINT,x,8.22,0,[(.038,0),(.07,.045),(.045,.07),(.066,.12),(.037,.15),(.037,.19)],n=6,col=0x977d65)
    for x in (-.42,.42): A.cyl(PAINT,x,6.52,0,.055,.13,5,col=0x836950)
    A.lathe(METAL,.34,6.80,0,[(0,0),(.18,0),(.20,.04),(.20,.48),(.18,.53),(0,.53)],n=8,col=0xd1c9bd)
    for y in (6.76,7.38): A.box(METAL,0,y,.015,.36,.045,.26,col=0x9e9c96)
    A.box(PAINT,0,5.9,.16,.27,.34,.10,col=0x555b58)
    # Two deliberately uneven telecom service loops + a loose drape (cheap triangular tubes).
    for cx,cy,cz,rx,ry,phase in [(-.30,6.35,.16,.32,.28,.0),(.30,6.12,.21,.33,.38,.4),(-.12,6.27,.24,.39,.20,.8)]:
        pts=[(cx+rx*math.cos(TAU*i/11+phase),cy+ry*math.sin(TAU*i/11+phase),cz+.035*math.sin(TAU*i/11*2)) for i in range(12)]
        A.tube(WIRE,pts,.013,n=3,caps=False)
    A.tube(WIRE,[(-.70,8.30,.05),(-.60,7.86,.13),(-.28,7.52,.13),(.20,7.46,.14),(.32,7.31,.14)],.015,n=3,caps=False)
    A.tube(WIRE,[(.02,6.1,.19),(.11,4.8,.17),(.09,2.9,.16),(.14,.22,.13)],.016,n=3,caps=False)


def tank(A,key,lod):
    blue=key.endswith('blue'); r=.60 if blue else .67; h=1.45 if blue else 1.63
    color=0x337b98 if blue else 0x3e4749
    if lod:
        A.lathe(PAINT,0,0,0,[(0,0),(r*.94,0),(r,.10),(r,h*.80),(r*.64,h*.93),(0,h*.93)],n=8,col=color)
        A.cyl(PAINT,0,h*.93,0,r*.40,h*.06,8,col=L.mulc(color,.78))
        return
    prof=[(0,0),(r*.94,0),(r,.06),(r,.16)]
    # Four integrated rounded ribs, not overlapping toruses.
    for y in (.25,.53,.81,1.09):
        y*=h/1.63
        prof.extend([(r,y),(r*1.015,y+.028),(r,y+.058)])
    prof.extend([(r,h*.82),(r*.93,h*.89),(r*.67,h*.94),(0,h*.94)])
    A.lathe(PAINT,0,0,0,prof,n=14,col=color,crease=45)
    A.lathe(PAINT,0,h*.94,0,[(0,0),(r*.43,0),(r*.43,.055),(r*.37,.072),(0,.072)],n=12,col=L.mulc(color,.78))
    A.hcyl(PAINT,0,.16,r+.032,.045,.11,axis='z',n=8,col=0xbdb5a0)
    A.box(METAL,0,.16,r+.05,.13,.024,.035,col=0xe5dbb9)


def dish(A,key,lod):
    n=8 if lod else 14
    A.box(METAL,0,0,0,.33,.045,.33,col=0xd4d0c5)
    A.cyl(METAL,0,.04,-.07,.032,.68,n=5 if lod else 7,col=0xc8c7be)
    prof=[(0,0),(.48,.12),(.48,.135),(0,.025)] if lod else [(0,0),(.18,.015),(.34,.058),(.48,.12),(.49,.135),(.47,.143),(.34,.079),(.18,.035),(0,.022)]
    A.lathe(METAL,0,.78,-.01,prof,n=n,col=0xe5e5d9,crease=50,rot=(math.radians(52),0,0))
    A.tube(METAL,[(0,.55,.14),(0,.41,.43),(0,.74,.48)],.018,n=3 if lod else 5,col=0xc0b8a8)
    if not lod:
        A.cyl(PAINT,0,.72,.46,.046,.08,n=8,col=0xd5d0bc,rx=math.radians(-35))
        A.tube(WIRE,[(.03,.72,.45),(.03,.39,.42),(.04,.38,.06),(.04,.08,-.07)],.007,n=3,caps=False)


def cloth_piece(A,x,y,w,h,kind,color,lod):
    if lod:
        quad(A,CLOTH,[(x-w/2,y-h,.03),(x+w/2,y-h,-.025),(x+w/2,y,.025),(x-w/2,y,0)],color)
        return
    if kind=='shirt':
        outline=[(-.15,0),(-.32,-.04),(-.52,-.26),(-.33,-.35),(-.25,-.24),(-.25,-.98),(.25,-.96),(.25,-.24),(.34,-.36),(.53,-.24),(.31,-.04),(.15,0),(.09,-.12),(-.09,-.12)]
    elif kind=='trousers':
        outline=[(-.36,0),(-.42,-.99),(-.08,-1),(.01,-.47),(.10,-1),(.41,-.98),(.35,0)]
    else:
        outline=[(-.48,0),(-.51,-.98),(-.20,-1.02),(.10,-.97),(.50,-1),(.48,0)]
    pts=[(x+a*w,y+b*h,.04*math.sin(a*math.pi*3)+.025*b*b) for a,b in outline]
    # Fan to a point inside each cloth polygon; trousers use explicit split-leg triangles.
    if kind=='trousers': tris=[(0,1,2),(0,2,3),(0,3,6),(6,3,4),(6,4,5)]
    elif kind=='shirt':
        tris=[(0,1,13),(1,2,3),(1,3,4),(1,4,13),(13,4,5),(13,5,12),(12,5,6),(12,6,7),(12,7,10),(12,10,11),(10,7,8),(10,8,9)]
    else: tris=[(0,1,2),(0,2,3),(0,3,5),(5,3,4)]
    emit(A,CLOTH,pts,tris,color)
    for dx in (-.14,.14): A.box('wood_old',x+dx*w,y-.035,.008,.022,.075,.028,col=0xd2b37b)


def washing_line(A,key,lod):
    for x in (-2.25,2.25):
        A.cyl(METAL,x,0,0,.031,2.30,n=4 if lod else 6,col=0xb9b9ad)
        if not lod: A.box(METAL,x,2.23,0,.20,.035,.045,col=0x9eaaa7)
    pts=[(-2.25+4.5*i/(4 if lod else 8),2.22-.22*math.sin(math.pi*i/(4 if lod else 8)),0) for i in range((4 if lod else 8)+1)]
    A.tube(WIRE,pts,.007,n=3,caps=False)
    clothes=[(-1.70,.65,.78,'shirt',0xb64f46),(-.85,.57,.83,'trousers',0x2d536b),(-.03,.67,.85,'towel',0xe6d8b8),(.86,.61,.71,'shirt',0x669383),(1.64,.59,.63,'towel',0xd4b447)]
    for x,w,h,kind,color in clothes:
        y=2.22-.22*math.sin(math.pi*(x+2.25)/4.5)
        cloth_piece(A,x,y,w,h,kind,color,lod)


def bin_wheelie(A,key,lod):
    tapered_box(A,PAINT,.13,.90,.43,.46,.58,.61,0x2e6e5d)
    A.box(PAINT,0,.90,-.015,.64,.07,.68,col=0x28604f)
    for x in (-.27,.27): A.hcyl('rubber_black',x,.13,-.24,.12,.065,n=5 if lod else 9,col=0xd2d0c5)
    if lod: return
    A.hcyl(METAL,0,.91,-.29,.027,.45,n=6,col=0xbbb9aa)
    for x in (-.21,.21): A.box(PAINT,x,.84,-.34,.055,.16,.05,col=0x367965)
    for x in (-.21,.21): A.box(PAINT,x,.24,.289,.025,.55,.025,col=0x347764)
    A.box(PAINT,0,.89,.33,.17,.035,.065,col=0x3b7a65)
    decal(A,'no_basura',0,.48,.310,.27,.29)


def bin_metal(A,key,lod):
    if lod:
        A.cyl(METAL,0,0,0,.27,.70,6,r1=.31,col=0xc7bfb0)
        A.cyl(METAL,0,.70,0,.32,.08,6,r1=.24,col=0xe0d7c5)
        return
    A.lathe(METAL,0,0,0,[(0,0),(.25,0),(.27,.035),(.30,.64),(.315,.66),(.315,.70),(.285,.70),(.28,.65)],n=12,col=0xc7bfb0)
    A.lathe(METAL,0,.70,0,[(0,.045),(.27,.045),(.325,0),(.325,.025),(.27,.065),(0,.065)],n=12,col=0xe2d9c6)
    for a in range(0,360,45):
        r=.29; t=math.radians(a)
        A.box(METAL,r*math.sin(t),.10,r*math.cos(t),.018,.48,.018,col=0xafa99b)
    A.tube(METAL,[(-.07,.775,0),(-.055,.83,0),(.055,.83,0),(.07,.775,0)],.012,n=4,col=0xd5cbb7)


def crate_wood(A,key,lod):
    A.box('wood_old',0,0,0,.63,.035,.45,col=0xc6a776)
    levels=(.25,) if lod else (.085,.22,.355)
    for y in levels:
        h=.39 if lod else .095
        yy=.035 if lod else y
        for z in (-.213,.213): A.box('wood_old',0,yy,z,.63,h,.026,col=0xc0a376 if z>0 else 0xac9168)
        for x in (-.302,.302): A.box('wood_old',x,yy,0,.026,h,.41,col=0xb59b71)
    if not lod:
        for x in (-.27,.27):
            for z in (-.18,.18): A.box('wood_old',x,.025,z,.045,.445,.045,col=0x9e825b)
        for x in (-.28,.28):
            for y in (.13,.4): A.box('metal_dark',x,y,.229,.012,.012,.002,col=0xe2d5c2)


def crate_plastic(A,key,lod):
    A.box(PAINT,0,0,0,.58,.035,.40,col=0x326b6b)
    if lod:
        for z in (-.19,.19): A.box(PAINT,0,.035,z,.58,.30,.025,col=0x3c7776)
        for x in (-.275,.275): A.box(PAINT,x,.035,0,.025,.30,.35,col=0x356b6b)
        return
    for y in (.04,.17,.32):
        for z in (-.19,.19): A.box(PAINT,0,y,z,.58,.035,.03,col=0x3d7975)
        for x in (-.275,.275): A.box(PAINT,x,y,0,.03,.035,.35,col=0x376c69)
    for x in (-.265,-.09,.09,.265):
        for z in (-.19,.19): A.box(PAINT,x,.065,z,.027,.26,.025,col=0x43817d)
    for z in (-.08,.08):
        for x in (-.275,.275): A.box(PAINT,x,.065,z,.025,.26,.025,col=0x3a716e)


def tyre(A,key,lod):
    prof=[(.18,0),(.31,.015),(.335,.08),(.335,.18),(.30,.25),(.18,.25),(.16,.21),(.16,.05),(.18,0)]
    if lod: prof=[(.18,0),(.32,0),(.335,.12),(.31,.25),(.18,.25),(.18,0)]
    A.lathe('rubber_black',0,0,0,prof,n=8 if lod else 16,col=0xc1bdb2,crease=50)
    if not lod:
        for i in range(12):
            a=TAU*i/12
            A.box('rubber_black',.335*math.sin(a),.085,.335*math.cos(a),.075,.084,.023,col=0xe0dbcd,ry=a+.16)


def cone(A,key,lod):
    A.box('rubber_black',0,0,0,.44,.055,.44,col=0xb7b4a9)
    if lod:
        A.cyl(PAINT,0,.055,0,.168,.66,n=5,r1=.026,col=0xd97932)
        return
    for y0,y1,r0,r1,col in [(.055,.29,.17,.115,0xe68135),(.29,.40,.115,.090,0xeee4ce),(.40,.56,.090,.055,0xdc762d),(.56,.66,.055,.032,0xf3e8d0),(.66,.73,.032,.016,0xdc762d)]:
        A.cyl(PAINT,0,y0,0,r0,y1-y0,n=10,r1=r1,col=col,caps=False)
    A.cyl(PAINT,0,.727,0,.016,.009,n=8,col=0x393b37)


def shrine(A,key,lod):
    stone=0xc6b6a0
    A.box(PAINT,0,0,0,.73,.10,.43,col=stone)
    A.box(PAINT,0,.10,-.16,.66,.98,.08,col=0x5f8d8b)
    for x in (-.31,.31): A.box(PAINT,x,.10,0,.075,.91,.38,col=0xd1bca2)
    A.box(PAINT,0,.12,0,.63,.065,.35,col=0xe0cab0)
    pts=[(-.39,1.02,-.22),(.39,1.02,-.22),(0,1.28,-.22),(-.39,1.02,.22),(.39,1.02,.22),(0,1.28,.22)]
    emit(A,PAINT,pts,[(0,2,1),(3,4,5),(0,3,5),(0,5,2),(2,5,4),(2,4,1),(0,1,4),(0,4,3)],0x985d48)
    A.cyl('plaster_statue',0,.19,-.01,.12,.44,n=4 if lod else 8,r1=.043,col=0xd7e2d4)
    if lod: return
    A.sph('plaster_statue',0,.70,-.01,.065,.08,.065,n=6,col=0xefdec3)
    A.box('plaster_statue',0,.58,-.01,.22,.045,.045,col=0xdce5d5)
    for x in (-.21,.20):
        A.cyl('candle_wax',x,.185,.10,.032,.13 if x<0 else .10,n=6,col=0xf2dfbd)
        A.cyl(PAINT,x,.315 if x<0 else .285,.10,.012,.035,n=4,r1=0,col=0xe3a94c)
    A.box('wood_old',0,.88,-.103,.04,.23,.02,col=0x704b33)
    A.box('wood_old',0,1.02,-.101,.16,.035,.02,col=0x704b33)


def umbrella(A,key,lod):
    A.box(PAINT,0,0,0,.46,.10,.46,col=0xa2a193)
    A.cyl(METAL,0,.10,0,.026,2.54,n=4 if lod else 8,col=0xe0d7c3)
    n=8 if lod else 16
    rings=[(0,2.64),(1.37,2.18)] if lod else [(0,2.64),(.69,2.49),(1.37,2.18)]
    for j in range(n):
        a,b=TAU*j/n,TAU*(j+1)/n
        col=[0xb75f49,0xe5cea0,0xc99744,0xe5cea0][(j//(2 if n==16 else 1))%4]
        for k in range(len(rings)-1):
            r0,y0=rings[k];r1,y1=rings[k+1]
            p=[(r0*math.cos(a),y0,r0*math.sin(a)),(r1*math.cos(a),y1,r1*math.sin(a)),(r1*math.cos(b),y1,r1*math.sin(b)),(r0*math.cos(b),y0,r0*math.sin(b))]
            emit(A,CLOTH,p,[(0,1,2)] if r0==0 else [(0,1,2),(0,2,3)],col)
        if not lod:
            ra=1.37
            quad(A,CLOTH,[(ra*math.cos(a),2.18,ra*math.sin(a)),(ra*math.cos(a),2.09,ra*math.sin(a)),(ra*math.cos(b),2.09+.035*(j%2),ra*math.sin(b)),(ra*math.cos(b),2.18,ra*math.sin(b))],col)
    if not lod:
        for i in range(8):
            a=TAU*i/8
            A.tube(METAL,[(0,2.19,0),(.62*math.cos(a),2.46,.62*math.sin(a)),(1.34*math.cos(a),2.17,1.34*math.sin(a))],.009,n=3,col=0xb5afa0,caps=False)


def chair(A,key,lod):
    col=0xd8d6be
    # Splayed legs and curved, slotted monobloc back are silhouette features.
    for x in (-1,1):
        for z in (-1,1):
            A.tube(PAINT,[(x*.265,.008,z*.26),(x*.205,.43,z*.205)],.024 if lod else [.024,.035],n=4,col=col)
    A.box(PAINT,0,.415,0,.49,.045,.47,col=0xe1ddc4)
    if lod:
        A.box(PAINT,0,.46,-.225,.47,.42,.035,col=col,rx=-.12)
        return
    for x in (-.22,.22):
        A.tube(PAINT,[(x,.43,-.19),(x*.97,.84,-.26)],.028,n=4,col=col)
    # Slats leave honest holes rather than an alpha texture.
    for x in (-.145,-.049,.049,.145):
        A.box(PAINT,x,.54,-.248,.064,.285,.027,col=0xd2d2bc,rx=-.12)
    A.box(PAINT,0,.82,-.265,.46,.052,.039,col=0xe6dfc7)
    for x in (-.245,.245):
        A.tube(PAINT,[(x,.46,.14),(x,.64,.12),(x,.65,-.19)],.023,n=4,col=0xcacbb4)


def shutter(A,key,lod):
    A.box(METAL,0,0,-.025,1.80,2.30,.065,col=0xc9c8b5)
    for x in (-.865,.865): A.box(METAL,x,0,.01,.055,2.30,.07,col=0xadb5ab)
    if lod: return
    # The folds are one folded sheet, not lots of boxes: 4 tris per corrugation.
    n=27
    for i in range(n):
        y=.055+i*2.20/n; h=2.20/n
        p=[(-.825,y,.025),(.825,y,.025),(.825,y+h*.5,.060),(-.825,y+h*.5,.060),(-.825,y+h,.025),(.825,y+h,.025)]
        emit(A,METAL,p,[(0,1,2),(0,2,3),(3,2,5),(3,5,4)],0xa6b8b1 if i%3 else 0xb6bfb1)
    A.box('metal_dark',.54,.24,.066,.16,.035,.02,col=0xd0c7b1)
    decal(A,'graffiti_barrio',-.14,.52,.073,1.36,1.03)


def sign(A,key,lod):
    # A-frame shop sign (footprint avoids walkways when placed against walls).
    for z in (-1,1):
        A.box('wood_old',0,.01 if lod else .20,z*.12,.72,1.04 if lod else .82,.045,col=0xb79f76,rx=z*.20)
        if not lod:
            for x in (-.34,.34): A.tube('wood_old',[(x,.008,z*.28),(x,1.08,0)],.025,n=4,col=0xb79a70)
    if lod: return
    A.hcyl(METAL,0,1.065,0,.017,.76,n=6,col=0xc4b8a1)
    # Follow the front board's 0.20-radian lean; 2.5mm clear of its surface.
    decal(A,'tienda_sign',0,.28,.1445,.61,.65,rx=.20)


def gas_cylinder(A,key,lod):
    col=0xa96d48
    prof=[(0,0),(.15,0),(.185,.10),(.185,.52),(.13,.62),(.05,.65),(0,.65)]
    if lod:
        A.lathe(PAINT,0,0,0,prof,n=6,col=col)
        A.box(PAINT,0,.65,0,.19,.11,.10,col=L.mulc(col,.8))
        return
    A.lathe(PAINT,0,0,0,[(0,.035),(.13,.035),(.17,.07),(.185,.13),(.185,.50),(.17,.57),(.11,.63),(.04,.65),(0,.65)],n=12,col=col)
    A.lathe(PAINT,0,0,0,[(.13,0),(.16,0),(.16,.055),(.13,.055),(.13,0)],n=12,col=0x865638)
    A.cyl(METAL,0,.64,0,.028,.07,6,col=0xd4af6a)
    A.box(METAL,0,.704,0,.10,.018,.022,col=0xc8a668)
    for x in (-.115,.115): A.box(PAINT,x,.62,0,.026,.15,.11,col=0xa36a48)
    A.box(PAINT,0,.745,0,.23,.026,.11,col=0xb17a53)
    A.box(PAINT,0,.34,.187,.10,.06,.002,col=0xd6bf90)


def helmet(A,key,lod):
    # Open underside, domed shell and separate dark visor; not a solid sphere.
    n=8 if lod else 14
    prof=[(.145,0),(.171,.07),(.174,.16),(.132,.25),(0,.29)]
    A.lathe(PAINT,0,.01,0,prof,n=n,col=0xb54f3d,crease=60,scl=(1,1,1.12))
    if lod: return
    # Follow every shell slope change within the visor's vertical span.
    # A two-ring visor cuts through the widest shell ring at y=.17; matching
    # that ring and adding 6mm radial clearance keeps every visor triangle
    # outside the shell, including between the different angular samples.
    pts=[]
    samples=13
    for y in (.09,.17,.195):
        ly=y-.01
        radius=next(r0+(r1-r0)*(ly-y0)/(y1-y0) for (r0,y0),(r1,y1) in zip(prof,prof[1:]) if y0<=ly<=y1)+.006
        for i in range(samples):
            a=-1.07+2.14*i/(samples-1)
            pts.append((radius*math.sin(a),y,radius*1.12*math.cos(a)))
    tris=[]
    for row in range(2):
        for i in range(samples-1):
            a=row*samples+i
            tris.extend([(a,a+1,a+samples+1),(a,a+samples+1,a+samples)])
    emit(A,'glass_dark',pts,tris,None)
    A.lathe('rubber_black',0,.003,0,[(.137,0),(.149,0),(.152,.016),(.138,.016)],n=14,col=0xc7c1b4,scl=(1,1,1.12))
    for x in (-.165,.165): A.hcyl(METAL,x,.15,.043,.017,.012,n=5,col=0xf1e3cf)
    A.box(PAINT,0,.238,.115,.022,.012,.09,col=0xeee1c4,rx=.55)


BUILDERS={
 'pole':pole,'tank':tank,'dish':dish,'washing_line':washing_line,
 'tyre':tyre,'cone':cone,'shrine':shrine,'umbrella':umbrella,'chair':chair,
 'shutter':shutter,'sign':sign,'gas_cylinder':gas_cylinder,'helmet':helmet,
}
BUILDERS_BY_KEY={'clutter_bin_wheelie':bin_wheelie,'clutter_bin_metal':bin_metal,
                 'clutter_crate_wood':crate_wood,'clutter_crate_plastic':crate_plastic}


def build(key,lod):
    category,size=CATALOGUE[key]
    name=key+('_lod1' if lod else '')
    A=L.Asset(name,{'size':size})
    (BUILDERS_BY_KEY.get(key) or BUILDERS[category])(A,key,lod)
    lo,hi=A.bounds()
    tris=sum(len(g.I) for g in A.groups.values())
    limit=900 if category in ('pole','tank') else 500
    if tris>=limit: raise ValueError(f'{name}: {tris} triangles >= strict {limit} limit')
    for i,(low,high,limit_low,limit_high) in enumerate(zip(lo,hi,[-size[0]/2,0,-size[2]/2],[size[0]/2,size[1],size[2]/2])):
        if low<limit_low-.002 or high>limit_high+.002: raise ValueError(f'{name}: axis {i} bounds {low}..{high} outside {limit_low}..{limit_high}')
    L.build_objects(A,bpy.context.scene.collection)
    meta={'node':name,'tags':['clutter_lod' if lod else 'clutter',category],
          'size':size,'footprint':[size[0],size[2]],'bounds':{'min':[round(x,6) for x in lo],'max':[round(x,6) for x in hi]},
          'triangles':tris,'parts':len(A.groups)}
    if not lod: meta['lod1']=key+'_lod1'
    print(f'{name:34} {tris:4} tris {len(A.groups)} materials',flush=True)
    return meta


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',default=os.path.join(L.ROOT,'assets','models'))
    p.add_argument('--only',help='comma-separated base keys for partial preview exports')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    keys=list(CATALOGUE) if not args.only else args.only.split(',')
    bad=set(keys)-set(CATALOGUE)
    if bad: p.error('unknown keys: '+','.join(sorted(bad)))
    if len(keys)!=len(set(keys)): p.error('duplicate keys in --only')
    out=os.path.abspath(args.out)
    dest=os.path.join(out,'clutter');os.makedirs(dest,exist_ok=True)
    L.reset()
    entries={}
    for key in keys:
        near=build(key,False);far=build(key,True)
        if far['triangles']>near['triangles']*.65: raise ValueError(f'{key}: LOD1 must use <=65% of LOD0 triangles')
        entries[key]=near;entries[key+'_lod1']=far
    glb=os.path.join(dest,'clutter.glb')
    L.export_glb(glb)
    atlas=write_atlas(os.path.join(out,'..','textures','clutter','decals.png'))
    manifest={'version':1,'complete':set(keys)==set(CATALOGUE),'generator':'tools/blender/clutter_build.py','license':'CC0-1.0',
              'atlas':atlas,'files':[{'glb':'clutter/clutter.glb','assets':entries}]}
    manpath=os.path.join(out,'manifest.clutter.json')
    with open(manpath,'w',encoding='utf8',newline='\n') as f: json.dump(manifest,f,indent=2);f.write('\n')
    total=sum(os.path.getsize(path) for path in (glb,manpath,os.path.join(out,atlas['path'])))
    if total>=2_000_000: raise ValueError(f'library {total} bytes >= 2 MB budget')
    print(f'Exported {len(keys)} designs / {len(entries)} LOD nodes: {total:,} bytes including manifest + atlas')


if __name__=='__main__': main()
