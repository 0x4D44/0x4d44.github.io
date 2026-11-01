"""La Ladera's 48-piece, two-LOD hillside kit. Uses the furniture geometry/export pipeline.

Run from the repository root, with no visible Blender window:
  node la-ladera/tests/memgate.mjs 6 300
  node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
    --python la-ladera/tools/blender/vista_build.py -- --out la-ladera/assets/models

The placement table and both GLBs are regenerated together. Near meshes have <600
triangles; manually authored far silhouettes have <=60, including their windows.
No images, external resources, random state or compression decoder are required.
"""
import argparse
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import furn_lib as L

# The existing neutral, white, opaque, rough vertex-colour material. Sharing it
# with world batches avoids a near/far material explosion. Its name is historical;
# it has no bark texture (world/matdefs.js: tex:false, rough:0.95, color:0xffffff).
MAT = 'bark_trunk'
PALETTE = [0xD2C1A0, 0xA66A4C, 0xA69F8C, 0x6C9994, 0x7D96AA, 0xC9AC65, 0xB88478, 0x84503E]
CONCRETE, DARK, TIN, RUST = 0xA69F8C, 0x303C3C, 0x9CA3A2, 0x986C50


def box(a, x, y, z, w, h, d, col, **kw):
    a.box(MAT, x, y, z, w, h, d, col=col, **kw)


def face(a, pts, col):
    """Opaque polygon, with an analytic normal and deterministic triangle fan."""
    n = L._unit(L._cross(L._sub(pts[1], pts[0]), L._sub(pts[2], pts[0])))
    uv = [(p[0], p[1] if abs(n[1]) < .7 else p[2]) for p in pts]
    a._emit(MAT, (pts, [n] * len(pts), uv, [(0, i, i + 1) for i in range(1, len(pts) - 1)]), col, False, ())


def panel(a, x, y, z, w, h, col, side=1):
    p = [(x-w/2, y, z), (x+w/2, y, z), (x+w/2, y+h, z), (x-w/2, y+h, z)]
    face(a, p if side > 0 else p[::-1], col)


def sidepanel(a, x, y, z, w, h, col, sign=1):
    p = [(x,y,z+w/2),(x,y,z-w/2),(x,y+h,z-w/2),(x,y+h,z+w/2)]
    face(a,p if sign > 0 else p[::-1],col)


def beam(a, p, q, width, col):
    a.tube(MAT, [p,q], width/2, n=4, col=col, caps=False)


def window(a, x, y, z, w, h, far, col=DARK):
    panel(a,x,y,z,w,h,col)
    if not far:
        # Sills and pale surrounds catch the grazing sun; the dark plane remains
        # behind the projecting frame, rather than sitting as a bright decal.
        for dx in [-w/2-.035,w/2+.035]:
            box(a,x+dx,y-.04,z+.035,.07,h+.12,.07,0xC5BCA6,skip=('ny','nz'))
        box(a,x,y-.055,z+.065,w+.22,.075,.17,0xB2AC9D,skip=('ny','nz'))
        box(a,x,y+h+.015,z+.025,w+.16,.065,.06,0xC5BCA6,skip=('ny','nz'))
        panel(a,x,y,z+.012,.035,h,0x8C998F)


def facade(a, p, far):
    v = p['variant']; w,h,d = p['size']; c=PALETTE[v % len(PALETTE)]
    brick = v >= 8
    if brick: c=[0xA66A4C,0x985D42,0xB27650,0x84503E][v-8]
    bw,bd=w-.18,d-.46
    if far:
        bw,bd=w-.06,d-.06
        box(a,0,0,0,bw,h,bd,c,skip=('ny',))
    else:
        box(a,0,0,0,bw,h-.12,bd,c,skip=('ny',))
        box(a,0,h-.12,0,w,.12,d,CONCRETE,skip=('ny',))
    z=bd/2+.012
    # Dado on the two most visible faces unifies later paint / repair layers.
    if not far:
        panel(a,0,.08,z+.002,bw,.37,L.mulc(c,.73))
        sidepanel(a,-bw/2-.003,.08,0,bd,.37,L.mulc(c,.68),sign=-1)
    n = 2 if w < 5.5 else 3
    if v in (2,3): n=2
    door=v < 4
    wx=[(-bw/2+(i+1)*bw/(n+1)) for i in range(n)]
    for i,x in enumerate(wx):
        if door and i==0:
            dw=1.12 if v != 2 else 1.7
            panel(a,x,.04,z+.01,dw,2.08,0x394B49 if v%2 else 0x655745)
            if not far:
                box(a,x,.015,z+.09,dw+.16,.07,.2,CONCRETE,skip=('ny','nz'))
                panel(a,x,.7,z+.018,dw-.08,.025,0x9B977E)
                if v==2:
                    for row in range(8): panel(a,x,.25+row*.22,z+.02,dw-.05,.025,0x787E76)
        else:
            window(a,x,1.15+(v%3)*.08,z+.01,.82 if w < 5.5 else 1.04,.95,far)
    # Side openings are retained at far distance; a 3-D house must read from the
    # ridge and valley, not only from its preferred front.
    for sign in (-1,1):
        sidepanel(a,sign*(bw/2+.012),1.28,-bd*.15,.84,.88,DARK,sign)
    if far: return
    if brick:
        # Coarse brick courses and staggered joints are geometry/vertex colour,
        # not a texture packed into the GLB. Keep detail away from openings.
        for row in range(10):
            yy=.26+row*.235
            panel(a,-bw/2+.24,yy,z+.016,.40,.018,0xBFA78D)
            panel(a,bw/2-.24,yy,z+.016,.40,.018,0xBFA78D)
            if row%2==0:
                panel(a,bw/2-.22,yy,z+.017,.02,.22,0xBFA78D)
            for sign in (-1,1):
                sidepanel(a,sign*(bw/2+.015),yy,bd*.3,bd*.3,.018,0xBFA78D,sign)
        # Exposed RC corner posts and a horizontal lintel.
        for x in (-bw/2+.10,bw/2-.10):
            box(a,x,0,0,.18,h-.12,bd+.025,CONCRETE,skip=('ny','py','nx','px'))
    elif v in (3,5,7):
        # Distinct patch geometry, deliberately irregular but seeded by variant.
        panel(a,bw*.28,.53,z+.019,.53,.43,L.mixc(c,CONCRETE,.48))
        panel(a,-bw*.32,2.24,z+.017,.42,.24,L.mixc(c,0xE3D8BC,.25))
    if v in (4,6,10):
        box(a,0,2.28,z+.04,bw*.77,.07,.30,TIN,skip=('ny','nz'),rx=.08)


def shed(a,w,d,h,col,far,axis='z',gable=False):
    """A closed wedge / gable, with ribs that follow its actual sloping roof."""
    lo=.10
    if gable:
        z0,z1=-d/2,d/2
        face(a,[(w/2,lo,z1),(0,h,z1),(-w/2,lo,z1)],L.mulc(col,.73))
        face(a,[(0,h,z0),(w/2,lo,z0),(-w/2,lo,z0)],L.mulc(col,.68))
        face(a,[(-w/2,lo,z1),(0,h,z1),(0,h,z0),(-w/2,lo,z0)],col)
        face(a,[(0,h,z1),(w/2,lo,z1),(w/2,lo,z0),(0,h,z0)],L.mulc(col,.88))
        face(a,[(-w/2,0,z0),(-w/2,0,z1),(w/2,0,z1),(w/2,0,z0)],L.mulc(col,.6))
        if not far:
            for k in range(1,12):
                z=z0+d*k/12
                beam(a,(-w/2+.03,lo+.025,z),(0,h+.025,z),.035,L.mulc(col,1.15))
                beam(a,(0,h+.025,z),(w/2-.03,lo+.025,z),.035,L.mulc(col,1.15))
        return
    # A shed rises toward the back. Panels overhang the closed end wedges.
    q=[(-w/2,lo,d/2),(w/2,lo,d/2),(w/2,h,-d/2),(-w/2,h,-d/2)]
    face(a,q,col)
    face(a,[(-w/2,0,d/2),(w/2,0,d/2),(w/2,lo,d/2),(-w/2,lo,d/2)],L.mulc(col,.65))
    face(a,[(w/2,0,-d/2),(-w/2,0,-d/2),(-w/2,h,-d/2),(w/2,h,-d/2)],L.mulc(col,.8))
    face(a,[(-w/2,0,-d/2),(-w/2,0,d/2),(-w/2,lo,d/2),(-w/2,h,-d/2)],L.mulc(col,.7))
    face(a,[(w/2,0,d/2),(w/2,0,-d/2),(w/2,h,-d/2),(w/2,lo,d/2)],L.mulc(col,.75))
    if not far:
        for i in range(1,16):
            x=-w/2+w*i/16
            beam(a,(x,lo+.024,d/2-.025),(x,h+.024,-d/2+.025),.035,L.mulc(col,1.11 if i%3 else .76))
        # Two repaired sheets at deliberately mismatched spans.
        for x0,x1,z0,z1 in [(-w*.38,-w*.12,-d*.31,-d*.05),(w*.13,w*.34,d*.12,d*.34)]:
            yy=lambda z: lo+(h-lo)*(.5-z/d)+.01
            face(a,[(x0,yy(z1),z1),(x1,yy(z1),z1),(x1,yy(z0),z0),(x0,yy(z0),z0)],L.mixc(col,RUST,.48))


def roof(a,p,far):
    v=p['variant']; w,h,d=p['size']
    if v in (1,2,3,7):
        c=[TIN,RUST,0x6A8E91,TIN][[1,2,3,7].index(v)]
        shed(a,w-.08,d-.08,h-.04,c,far,gable=v==7)
    elif v in (0,4):
        if far:
            face(a,[(-w/2,.12,-d/2),(-w/2,.12,d/2),(w/2,.12,d/2),(w/2,.12,-d/2)],CONCRETE)
            for sign in (-1,1):
                q=[(sign*w/2,0,-d/2),(sign*w/2,0,d/2),(sign*w/2,h,d/2),(sign*w/2,h,-d/2)]
                face(a,q,0xB3AA96);face(a,q[::-1],0xB3AA96)
            for z in ([-d/2,d/2] if v==0 else [-d/2]):
                q=[(-w/2,0,z),(w/2,0,z),(w/2,h,z),(-w/2,h,z)]
                face(a,q,0xB3AA96);face(a,q[::-1],0xB3AA96)
            return
        box(a,0,0,0,w,.12,d,CONCRETE,skip=('ny',))
        t=.14
        for x in (-w/2+t/2,w/2-t/2): box(a,x,.12,0,t,h-.12,d,0xB3AA96,skip=('ny',))
        # Leave the front central gap in one version for an access staircase.
        box(a,0,.12,-d/2+t/2,w-2*t,h-.12,t,0xB3AA96,skip=('ny',))
        if v==0: box(a,0,.12,d/2-t/2,w-2*t,h-.12,t,0xB3AA96,skip=('ny',))
        elif not far:
            for sign in (-1,1): box(a,sign*w*.33,.12,d/2-t/2,w*.31,h-.12,t,0xB3AA96,skip=('ny',))
        if not far:
            panel(a,-w*.29,.16,d/2+.001,w*.17,h*.55,0x908B79)
    elif v==5:
        # A compact roof-room/setback gives a strong asymmetrical roofline.
        box(a,0,0,0,w,.13,d,CONCRETE,skip=('ny',))
        rw,rd=w*.55,d*.59; x=-w*.18; z=-d*.14
        box(a,x,.13,z,rw,h-.28,rd,0xB88478,skip=('ny','py'))
        box(a,x,h-.15,z,rw+.16,.15,rd+.18,TIN,skip=('ny',))
        panel(a,x,.48,z+rd/2+.006,.75,.8,DARK)
        if not far:
            for k in range(7): box(a,x-rw*.42+k*rw*.14,h-.015,z,.025,.015,rd+.18,0xBDC0B6,skip=('ny',))
    elif v==6:
        box(a,0,0,0,w,.14,d,CONCRETE,skip=('ny',))
        box(a,-w*.25,.14,-d*.18,w*.47,.5,d*.63,0xAA8A6D,skip=('ny',))
        box(a,w*.22,.14,-d*.19,w*.48,h-.29,d*.56,0xA39D8C,skip=('ny',))
        box(a,w*.22,h-.15,-d*.19,w*.51,.15,d*.61,0x7A8989,skip=('ny',))
        if not far:
            panel(a,w*.22,.46,d*.09+.003,w*.19,.60,DARK)


def tank(a,p,far):
    v=p['variant']; w,h,d=p['size']; rad=min(w,d)*.42
    base=.18 if v<2 else .48
    c=[0x354145,0x43676C,0xD0BE95,0x5B6863][v]
    box(a,0,0,0,w*.84,base,d*.84,CONCRETE,skip=('ny',))
    # Five-sided far tanks retain their round silhouette, cone shoulder and lid.
    n=5 if far else 12
    profile=[(0,0),(rad,0),(rad,h-base-.18),(rad*.78,h-base-.07),(0,h-base-.07)]
    a.lathe(MAT,0,base,0,profile,n=n,col=c)
    if far: return
    for yy in (.25,.58,.83):
        y=base+(h-base-.23)*yy
        a.lathe(MAT,0,y,0,[(rad,.0),(rad*1.035,.015),(rad*1.035,.065),(rad,.08)],n=12,col=L.mulc(c,1.25))
    a.cyl(MAT,0,h-.07,0,rad*.35,.07,n=8,col=L.mulc(c,.7))
    beam(a,(rad*.84,base+.27,0),(rad*.84,base+.27,d*.47),.055,0xC6BDA3)


def rebar(a,p,far):
    v=p['variant']; w,h,d=p['size']; ncols=[1,2,4,4][v]
    loc=[(0,0)] if ncols==1 else [(-w*.37,0),(w*.37,0)] if ncols==2 else [(x*w*.36,z*d*.36) for x in (-1,1) for z in (-1,1)]
    concrete=h*.68
    for x,z in loc:
        tw=.28 if ncols<4 else .24
        # Keep the concrete top cap in both LODs: without it an oblique view
        # looks through the post and separates the rod silhouette from its base.
        box(a,x,0,z,tw,concrete,tw,CONCRETE,skip=('ny',))
        if far:
            # One square-profile shaft per column = four silhouette rods at the
            # intended screen size, eight side triangles with no hidden caps.
            panel(a,x,concrete,z,.045,h-concrete,0x685B4D)
        else:
            for dx,dz in [(-.07,-.07),(.07,-.07),(.07,.07),(-.07,.07)]:
                beam(a,(x+dx,concrete-.05,z+dz),(x+dx,h-(.06 if dx>0 else 0),z+dz),.026,RUST)
            for yy in (concrete+.14,concrete+.39):
                if yy>h-.1: continue
                for j in range(4):
                    p0=[(-.08,-.08),(.08,-.08),(.08,.08),(-.08,.08)][j]
                    q0=[(-.08,-.08),(.08,-.08),(.08,.08),(-.08,.08)][(j+1)%4]
                    beam(a,(x+p0[0],yy,z+p0[1]),(x+q0[0],yy,z+q0[1]),.022,RUST)
    if v==3:
        # At far LOD the beam ends are buried in the posts: spend those faces
        # on the visible upward surfaces instead, keeping the open frame at 60.
        box(a,0,concrete-.18,-d*.36,w*.77,.18,.24,CONCRETE,skip=('ny','nx','px') if far else ('ny',))
        box(a,-w*.36,concrete-.18,0,.24,.18,d*.77,CONCRETE,skip=('ny','nz','pz') if far else ('ny',))


def stair(a,p,far):
    v=p['variant']; w,h,d=p['size']; n=3 if far else [8,10,12,14][v]
    # Joined zig-zag profile extruded as one solid. Far retains three large
    # risers, whereas near keeps human-scale risers without hidden box faces.
    pts=[(-w/2,0,d/2),(-w/2,0,-d/2)]
    for i in reversed(range(n)):
        z=-d/2+(n-1-i)*d/n; y=(i+1)*h/n
        pts.extend([(-w/2,y,z),(-w/2,y,z+d/n)])
    # This polygon is concave: triangulate the staircase side by rectangular
    # strips to prevent fan triangles crossing outside the contour.
    for i in range(n):
        z=d/2-i*d/n; y=(i+1)*h/n; yn=i*h/n
        face(a,[(-w/2,y,z),(w/2,y,z),(w/2,y,z-d/n),(-w/2,y,z-d/n)],0xB2AA97)
        face(a,[(-w/2,yn,z),(w/2,yn,z),(w/2,y,z),(-w/2,y,z)],0x8E8B7E)
        for sign in (-1,1):
            q=[(sign*w/2,0,z),(sign*w/2,0,z-d/n),(sign*w/2,y,z-d/n),(sign*w/2,y,z)]
            face(a,q if sign>0 else q[::-1],0x948F7E)
    face(a,[(-w/2,0,-d/2),(-w/2,h,-d/2),(w/2,h,-d/2),(w/2,0,-d/2)],CONCRETE)
    if not far and v in (1,3):
        # Lower rail deliberately falls inside the declared staircase height.
        beam(a,(-w/2+.06,.15,d/2-.05),(-w/2+.06,h-.1,-d/2+.05),.07,0x5B6259)


def retaining(a,p,far):
    v=p['variant']; w,h,d=p['size']; c=[0x887B68,0x9B927F,0x9E6B4D,0xA99F8C,0x8A8577,0x957C60][v]
    box(a,0,0,0,w,h-.09,d-.1,c,skip=('ny',))
    box(a,0,h-.09,0,w,.09,d,0xB4AB96,skip=('ny',))
    if far:return
    front=(d-.1)/2+.007
    if v in (0,1,4):
        for row in range(max(2,int(h/.38))):
            y=.2+row*.37
            panel(a,0,y,front,w-.04,.017,L.mulc(c,.65))
            for i in range(int(w/.64)):
                x=-w/2+.22+i*.64+(.3 if row%2 else 0)
                if x>w/2-.1: continue
                panel(a,x,y+.02,front+.001,.017,min(.34,h-y-.04),L.mulc(c,.7))
    elif v==2:
        for row in range(int(h/.22)):
            panel(a,0,.13+row*.22,front,w-.04,.018,0xC1A187)
    else:
        for i in range(1,4):
            x=-w/2+w*i/4
            panel(a,x,.05,front,.018,h-.2,L.mulc(c,.78))
        for i in range(2):
            panel(a,-w*.3+i*w*.51,.22,front+.006,.11,.11,DARK)


def balcony(a,p,far):
    v=p['variant']; w,h,d=p['size']; col=[0x6C9994,0x7D96AA,0xB88478,0xB8AE91][v]
    box(a,0,0,0,w,.14,d,CONCRETE,skip=('ny',))
    z=d/2-.06
    if far:
        # The continuous lower panel + top rail reads as an open balcony gap.
        box(a,0,.19,z,w,.27,.08,col,skip=('ny','nz'))
        box(a,0,h-.055,z,w,.055,.08,DARK,skip=('ny','nz'))
        for x in (-w/2+.055,w/2-.055):box(a,x,.14,z,.055,h-.14,.055,DARK,skip=('ny','py'))
        return
    for yy in (.32,h-.055): box(a,0,yy,z,w,.055,.055,DARK,skip=('ny',))
    n=9+v*2
    for i in range(n): box(a,-w/2+.06+(w-.12)*i/(n-1),.14,z,.045,h-.14,.045,DARK,skip=('ny','py'))
    for x in (-w/2+.04,w/2-.04):
        box(a,x,h-.055,0,.055,.055,d,DARK,skip=('ny',))
        box(a,x,.14,-d/2+.04,.055,h-.14,.055,DARK,skip=('ny','py'))
    if v in (1,3):
        box(a,-w*.23,.18,z-.17,.9,.27,.27,0x856C4C,skip=('ny',))
        box(a,-w*.23,.45,z-.17,.82,.16,.24,0x4C6650,skip=('ny',))
    if v==2:
        panel(a,w*.22,.38,z+.045,w*.22,.54,0xC5BDA5)


def washing(a,p,far):
    v=p['variant']; w,h,d=p['size']; x0=-w/2+.05; x1=w/2-.05
    for x in (x0,x1): box(a,x,0,0,.06,h,.06,0x786D59,skip=('ny','py'))
    if far:
        # One straight bar and three block silhouettes stay below sixty tris.
        box(a,0,h-.1,0,w-.1,.025,.025,0x716658,skip=('ny','py'))
    else:
        a.tube(MAT,[(x0,h-.06,0),(0,h-.2,.025),(x1,h-.06,0)],.012,n=4,col=0x716658,caps=False)
        if v in (2,4):
            a.tube(MAT,[(x0,h-.12,d*.35),(0,h-.27,d*.35),(x1,h-.12,d*.35)],.012,n=4,col=0x716658,caps=False)
    cols=[0xD9D1B3,0x819CA4,0xB88169,0x8F9E78,0xC0A15B,0x8C7495]
    n=3 if far else 4+v%3
    for i in range(n):
        x=x0+(i+1)*(x1-x0)/(n+1); cw=min(.62,(w-.3)/(n+1)*.84); ch=.50+(i+v)%3*.13
        y=h-.17-ch-.06*math.sin(math.pi*(i+1)/(n+1)); z=.025
        # Closed thin clothes, with both faces. Shirt shoulder cuts / trousers
        # are explicit near silhouettes, not painted rectangles.
        c=cols[(i+v)%len(cols)]
        if far: box(a,x,y,z,cw,ch,.02,c,skip=('ny','py','nx','px'))
        elif (i+v)%3==0:
            for side in (-1,1): box(a,x+side*cw*.24,y,z,cw*.43,ch,.025,c,skip=('ny','py','nx','px'))
        elif (i+v)%3==1:
            outline=[(-.32,0),(.32,0),(.32,.68),(.50,.58),(.60,.87),(.28,1),(-.28,1),(-.60,.87),(-.50,.58),(-.32,.68)]
            # A shirt is concave: use torso and sleeve quads, no invalid fan.
            box(a,x,y,z,cw*.64,ch,.02,c,skip=('ny','py','nx','px'))
            for sign in (-1,1):
                q=[(x+sign*cw*.32,y+ch*.65,z),(x+sign*cw*.57,y+ch*.59,z),(x+sign*cw*.62,y+ch*.85,z),(x+sign*cw*.30,y+ch,z)]
                face(a,q,c);face(a,q[::-1],c)
        else:
            box(a,x,y,z,cw,ch,.025,c,skip=('ny','py','nx','px'))


BUILDERS={'facade':facade,'roof':roof,'tank':tank,'rebar':rebar,'stair':stair,'retaining':retaining,'balcony':balcony,'washing':washing}


def catalogue():
    out=[]
    def add(category,names,sizes):
        for i,(name,size) in enumerate(zip(names,sizes)):
            supports={'facade':['facade','roof','tank','rebar','washing','balcony'], 'roof':['tank','rebar','washing'] if i in (0,4) else [], 'retaining':['facade','retaining'], 'stair':[], 'tank':[], 'rebar':[], 'balcony':[], 'washing':[]}[category]
            on={'facade':['ground','facade','retaining'], 'roof':['facade'], 'retaining':['ground','retaining'], 'stair':['ground'], 'tank':['facade','roof'], 'rebar':['facade','roof'], 'balcony':['facade'], 'washing':['ground','facade','roof']}[category]
            mount=.12 if category=='roof' and i in (0,4) else size[1]
            tags=[category]+(['ground'] if i<4 else ['upper'])+(['brick'] if i>=8 else []) if category=='facade' else [category]
            out.append({'id':name,'near':'vista_'+name,'far':'vista_'+name+'_far','category':category,'variant':i,'tags':tags,'size':size,'stack':{'on':on,'supports':supports,'height':mount,'maxLevels':4 if category=='facade' else 2 if category=='retaining' else 1},'anchor':'front' if category=='balcony' else 'floor-centre'})
            if category=='facade':
                # The placement envelope includes the projecting floor slab and
                # sills. Attach balconies to the actual near wall face instead.
                out[-1]['mounts']={'front':{'z':round((size[2]-.46)/2,5),'y':0}}
    add('facade',['ground_narrow','ground_wide','ground_shutter','ground_pair','upper_narrow','upper_wide','upper_pair','upper_corner','brick_narrow','brick_wide','brick_awning','brick_corner'],[[4.2,2.65,4.8],[6.2,2.85,5.5],[5.6,2.9,5.0],[7.0,3.0,6.0],[4.2,2.65,4.8],[6.2,2.85,5.5],[6.8,2.8,5.8],[5.0,3.05,6.5],[4.6,2.75,5.0],[6.4,2.85,5.8],[5.5,2.7,5.3],[5.0,3.0,6.1]])
    add('roof',['roof_parapet','roof_tin_shed','roof_tin_rust','roof_tin_blue','roof_open_terrace','roof_setback_room','roof_split_level','roof_tin_gable'],[[6.2,.55,5.5],[6.5,.65,5.8],[4.6,.48,5.1],[7.2,.78,6.1],[5.4,.65,6.0],[6.4,2.0,5.8],[6.8,1.18,5.8],[5.6,1.15,6.2]])
    add('tank',['tank_black','tank_blue','tank_cement_plinth','tank_tall'],[[1.65,1.72,1.65],[1.7,1.48,1.7],[1.85,1.9,1.85],[1.5,2.0,1.5]])
    add('rebar',['rebar_column','rebar_pair','rebar_four_posts','rebar_open_frame'],[[.5,1.4,.5],[3.6,1.5,.5],[3.8,1.6,3.8],[4.2,2.0,4.0]])
    add('stair',['stairs_short','stairs_rail','stairs_long','stairs_wide'],[[1.5,1.36,2.3],[1.6,1.7,2.9],[1.7,2.04,3.5],[2.3,2.38,4.1]])
    add('retaining',['wall_stone_low','wall_stone_tall','wall_brick','wall_concrete','wall_block','wall_drained'],[[6.0,1.2,.65],[6.2,2.6,.75],[5.0,1.8,.55],[7.0,3.5,.8],[4.8,2.1,.65],[6.4,2.8,.7]])
    add('balcony',['balcony_iron','balcony_planter','balcony_cloth','balcony_wide'],[[3.8,1.05,1.1],[4.8,1.1,1.15],[5.0,1.05,1.2],[6.0,1.15,1.2]])
    add('washing',['washing_short','washing_sheets','washing_double','washing_family','washing_long','washing_rooftop'],[[3.2,2.1,.8],[4.0,2.15,.85],[4.8,2.1,1.1],[4.2,2.3,.9],[5.8,2.25,1.1],[3.6,1.8,.8]])
    assert len(out)==48
    return out


def compact_glb(path):
    """Strip exporter provenance timestamps and unused material PBR defaults.

    Blender exports float colours even though this kit needs only 8-bit linear
    colours. Repack COLOR_0 as normalized UNSIGNED_BYTE to lower payload without
    changing topology, positions, normals, UVs, or the standard glTF loader.
    """
    with open(path,'rb') as f:b=f.read()
    jl=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+jl]);offset=20+jl
    bl=struct.unpack_from('<I',b,offset)[0];bin0=b[offset+8:offset+8+bl]
    colours=set()
    for m in doc.get('meshes',[]):
        for p in m.get('primitives',[]):
            if 'COLOR_0' in p['attributes']:colours.add(p['attributes']['COLOR_0'])
    # Each accessor in Blender's uncompressed export owns its own view. Copy
    # views while honoring alignments; remove float colour bytes rather than
    # appending a second representation.
    colview={doc['accessors'][i]['bufferView']:i for i in colours}
    payload=bytearray()
    for vi,v in enumerate(doc.get('bufferViews',[])):
        old=bin0[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        while len(payload)%4:payload.append(0)
        v['byteOffset']=len(payload)
        if vi in colview:
            a=doc['accessors'][colview[vi]]
            if a['componentType']==5126 and not v.get('byteStride') and a.get('byteOffset',0)==0:
                vals=struct.unpack('<'+'f'*(len(old)//4),old)
                old=bytes(max(0,min(255,round(x*255))) for x in vals)
                a['componentType']=5121;a['normalized']=True
        payload.extend(old);v['byteLength']=len(old)
    while len(payload)%4:payload.append(0)
    doc['buffers'][0]['byteLength']=len(payload)
    doc['asset']={'version':'2.0','generator':'La Ladera vista_build.py / furniture Blender pipeline v1'}
    for m in doc.get('materials',[]):
        # Runtime uses the library name, but neutral baseColor also makes offline
        # contact-sheet previews agree with the game's vertex-colour rendering.
        m['pbrMetallicRoughness']={'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.95}
    j=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
    while len(j)%4:j+=b' '
    data=struct.pack('<III',0x46546C67,2,12+8+len(j)+8+len(payload))+struct.pack('<II',len(j),0x4E4F534A)+j+struct.pack('<II',len(payload),0x004E4942)+payload
    with open(path,'wb') as f:f.write(data)


def write_json(path,data):
    with open(path,'w',encoding='utf8',newline='\n') as f:
        json.dump(data,f,ensure_ascii=True,separators=(',',':'));f.write('\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',default=os.path.join(L.ROOT,'assets','models'))
    args=parser.parse_args(L.argv_after_dashes())
    out=os.path.abspath(args.out);target=os.path.join(out,'vista');os.makedirs(target,exist_ok=True)
    pieces=catalogue();files=[]
    for lod in ('near','far'):
        L.reset();entries={}
        for p in pieces:
            a=L.Asset(p[lod],p);BUILDERS[p['category']](a,p,lod=='far')
            lo,hi=a.bounds();tris=sum(len(g.I) for g in a.groups.values())
            limit=599 if lod=='near' else 60
            if not 0<tris<=limit:raise RuntimeError(f"{p[lod]} has {tris} triangles; limit {limit}")
            w,h,d=p['size'];bounds=[[-w/2,0,-d/2],[w/2,h,d/2]]
            for k in range(3):
                if lo[k]<bounds[0][k]-.005 or hi[k]>bounds[1][k]+.005:
                    raise RuntimeError(f"{p[lod]} exceeds declared bounds: {lo}, {hi}, size {p['size']}")
            L.build_objects(a,bpy.context.scene.collection)
            p[lod+'Triangles']=tris
            entries[p[lod]]={'node':p[lod],'size':p['size'],'origin':'floor-centre','footprint':[w,d],'tags':['vista',p['category'],lod],'triangles':tris,'lod':lod,'piece':p['id'],'category':p['category'],'bounds':[lo,hi]}
            if 'mounts' in p:
                entries[p[lod]]['mounts']=p['mounts']
            print(f"{p[lod]:36s} {tris:3d} triangles")
        rel='vista/vista_'+lod+'.glb';path=os.path.join(out,rel)
        L.export_glb(path);compact_glb(path)
        files.append({'glb':rel,'assets':entries})
    placement={'version':1,'units':'metres','origin':'floor-centre','front':'+Z','palette':['%06x'%c for c in PALETTE],'pieces':pieces}
    manifest={'version':1,'placement':'vista/placement.json','files':files}
    write_json(os.path.join(target,'placement.json'),placement)
    write_json(os.path.join(out,'manifest.vista.json'),manifest)
    paths=[os.path.join(out,f['glb']) for f in files]+[os.path.join(target,'placement.json'),os.path.join(out,'manifest.vista.json')]
    total=sum(os.path.getsize(p) for p in paths)
    if total>=2000000:raise RuntimeError(f'Kit payload {total} bytes exceeds strict 2 MB limit')
    print(json.dumps({'pieces':len(pieces),'bytes':total,'nearTriangles':sum(p['nearTriangles'] for p in pieces),'farTriangles':sum(p['farTriangles'] for p in pieces),'maxNear':max(p['nearTriangles'] for p in pieces),'maxFar':max(p['farTriangles'] for p in pieces)},sort_keys=True))


if __name__=='__main__':
    main()
