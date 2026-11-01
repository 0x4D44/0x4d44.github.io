"""Original handheld meshes. Uses furn_lib's analytic geometry and material batching.

Game coordinates throughout: metres, +Y up, +Z front. inspect_build.py centres
each finished asset at its rotation pivot. High/low meshes are authored separately
so silhouettes survive simplification without carrying tiny close-up details.
"""
import math
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
import furn_lib as L

PI = math.pi
TAU = PI * 2
TILES = {}


def continuous_tube(pts, rad, n=6, caps=True):
    """Rotation-minimizing frames: no reference-axis jumps on jewellery loops."""
    closed=L._len(L._sub(pts[0],pts[-1])) < 1e-8
    tangents=[]
    for i in range(len(pts)):
        if closed and i in (0,len(pts)-1): a,b=pts[-2],pts[1]
        else: a,b=pts[max(0,i-1)],pts[min(len(pts)-1,i+1)]
        tangents.append(L._unit(L._sub(b,a)))
    t=tangents[0]
    # A fixed perpendicular seed, then parallel transport instead of selecting a
    # different world axis separately at every ring (which twists the tube).
    axis=min(((1,0,0),(0,1,0),(0,0,1)),key=lambda a:abs(L._dot(a,t)))
    u=L._unit(L._cross(t,axis));frames=[]
    for t in tangents:
        u=L._unit(tuple(u[k]-t[k]*L._dot(u,t) for k in range(3)))
        v=L._unit(L._cross(t,u));frames.append((u,v))
    if closed:
        last,first=frames[-1][0],frames[0][0]
        angle=math.atan2(L._dot(L._cross(last,first),tangents[0]),L._dot(last,first))
        for i,(u,v) in enumerate(frames):
            a=angle*i/(len(frames)-1)
            uu=tuple(math.cos(a)*u[k]+math.sin(a)*v[k] for k in range(3))
            frames[i]=(uu,L._cross(tangents[i],uu))
    p,normal,uv,f=[],[],[],[]
    for i,(centre,(u,v)) in enumerate(zip(pts,frames)):
        r=rad[i] if isinstance(rad,(list,tuple)) else rad
        for j in range(n):
            a=TAU*j/n
            nn=tuple(math.cos(a)*u[k]+math.sin(a)*v[k] for k in range(3))
            p.append(tuple(centre[k]+r*nn[k] for k in range(3)));normal.append(nn);uv.append((j/n,i/(len(pts)-1)))
    for i in range(len(pts)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;c=b+n;d=a+n
            f.extend([(a,b,c),(a,c,d)])
    if caps and not closed:
        for i,sign in ((0,-1),(len(pts)-1,1)):
            start=len(p);p.append(pts[i]);normal.append(tuple(sign*q for q in tangents[i]));uv.append((.5,.5))
            for j in range(n):
                p.append(p[i*n+j]);normal.append(tuple(sign*q for q in tangents[i]));uv.append((.5,.5))
            f.extend((start,start+1+j,start+1+(j+1)%n) for j in range(n))
    return p,normal,uv,f


class InspectAsset(L.Asset):
    """The furniture asset contract with a smooth-frame handheld wire helper."""
    def tube(self, mat, pts, rad, n=6, col=None, tint=False, flags=(), caps=True):
        self._emit(mat,continuous_tube(pts,rad,n,caps),col,tint,flags)


def tile(name):
    return TILES[name]['uv']


def mapped(name, u, v):
    a, b, c, d = tile(name)
    return (a + (c-a)*u, b + (d-b)*v)


def emit(A, mat, p, n, uv, f, col=None, rot=(0, 0, 0), at=(0, 0, 0)):
    A._emit(mat, (p, n, uv, f), col, False, (), rot, at)


def box(A, mat, x, y, z, w, h, d, col=None, r=0, **kw):
    A.box(mat, x, y-h/2, z, w, h, d, col=col, r=r, **kw)


def ring(A, mat, x, y, z, rx, ry=None, wire=.0008, segments=32,
         sides=5, col=None, phase=0, wave=0):
    ry = rx if ry is None else ry
    p,n,uv,f=[],[],[],[]
    for i in range(segments+1):
        t=phase+TAU*i/segments;c,s=math.cos(t),math.sin(t)
        radial=L._unit((c/rx,s/ry,0))
        tangent=L._unit((-rx*s,ry*c,6*wave*math.cos(6*t)))
        vertical=L._unit(L._cross(radial,tangent))
        for j in range(sides):
            a=TAU*j/sides
            nn=tuple(math.cos(a)*radial[k]+math.sin(a)*vertical[k] for k in range(3))
            centre=(x+rx*c,y+ry*s,z+wave*math.sin(6*t))
            p.append(tuple(centre[k]+wire*nn[k] for k in range(3)));n.append(nn);uv.append((i/segments,j/sides))
    for i in range(segments):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;d=a+sides;c=b+sides
            f.extend([(a,b,c),(a,c,d)])
    emit(A,mat,p,n,uv,f,col)


def disk(A, mat, x, y, z, rx, ry=None, name=None, n=40, back=False, col=None):
    ry = rx if ry is None else ry
    p = [(x, y, z)] + [(x+rx*math.cos(TAU*i/n), y+ry*math.sin(TAU*i/n), z) for i in range(n)]
    norm = (0, 0, -1 if back else 1)
    uv = [(0.5, 0.5)] + [((1 if back else -1)*-.5*math.cos(TAU*i/n)+.5, .5+.5*math.sin(TAU*i/n)) for i in range(n)]
    if name: uv = [mapped(name, u, v) for u, v in uv]
    emit(A, mat, p, [norm]*len(p), uv, [(0, 1+i, 1+(i+1)%n) for i in range(n)], col)


def solid(A, mat, pts, z, depth, col=None, rot=(0, 0, 0), at=(0, 0, 0)):
    """Extruded polygon, including concave key teeth / notched ticket silhouettes."""
    if sum(pts[i][0]*pts[(i+1)%len(pts)][1]-pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts))) < 0:
        pts=list(reversed(pts))
    vertices = [Vector((x, y, 0)) for x, y in pts]
    tris = tessellate_polygon([vertices])
    idx = {(round(v.x, 8), round(v.y, 8)): i for i, v in enumerate(vertices)}
    fs = [tuple(v if isinstance(v,int) else idx[(round(v.x, 8), round(v.y, 8))] for v in t) for t in tris]
    for s in (-1, 1):
        p = [(x, y, z+s*depth/2) for x, y in pts]
        emit(A, mat, p, [(0, 0, s)]*len(p), [(x, y) for x, y in pts], fs, col, rot, at)
    for i, (x, y) in enumerate(pts):
        a, b = pts[(i+1)%len(pts)]
        dx, dy = a-x, b-y
        ln = math.hypot(dx, dy)
        if not ln: continue
        p = [(x,y,z-depth/2),(a,b,z-depth/2),(a,b,z+depth/2),(x,y,z+depth/2)]
        emit(A, mat, p, [(dy/ln,-dx/ln,0)]*4, [(0,0),(1,0),(1,1),(0,1)], [(0,1,2),(0,2,3)], col, rot, at)


def surface(A, mat, fn, nu, nv, name=None, back=False, col=None):
    p, normals, uv, f = [], [], [], []
    for j in range(nv+1):
        v=j/nv
        for i in range(nu+1):
            u=i/nu
            a,b=fn(max(0,u-.0001),v),fn(min(1,u+.0001),v)
            c,d=fn(u,max(0,v-.0001)),fn(u,min(1,v+.0001))
            n=L._unit(L._cross(L._sub(b,a),L._sub(d,c)))
            p.append(fn(u,v)); normals.append(tuple(-q for q in n) if back else n)
            uv.append(mapped(name,1-u if back else u,v) if name else (u,v))
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i; b=a+1; c=a+nu+2; d=a+nu+1
            f.extend([(a,b,c),(a,c,d)])
    emit(A,mat,p,normals,uv,f,col)


def paper(A, name, w, h, z=0, x=0, y=0, bend=.002, low=False, rz=0, back_name='paper_back'):
    """Thin, double-sided, bowed sheet with visible edges, no alpha surfaces."""
    nu,nv=(2,2) if low else (6,5)
    def coord(u,v,back=False):
        px=(u-.5)*w; py=(v-.5)*h
        zz=z+bend*((u-.5)**2*3+.35*math.sin(v*PI)) + (-.00035 if back else 0)
        return (x+px*math.cos(rz)-py*math.sin(rz),y+px*math.sin(rz)+py*math.cos(rz),zz)
    surface(A,'inspect_paper_atlas',lambda u,v:coord(u,v),nu,nv,name=name)
    surface(A,'inspect_paper_atlas',lambda u,v:coord(u,v,True),nu,nv,name=back_name,back=True)
    for side in range(4):
        def edge(t,side=side):
            return ((t,0),(1,t),(1-t,1),(0,1-t))[side]
        n=nu if side%2==0 else nv
        for i in range(n):
            u,v=edge(i/n); s,t=edge((i+1)/n)
            p=[coord(u,v),coord(s,t),coord(s,t,True),coord(u,v,True)]
            normal=L._unit(L._cross(L._sub(p[1],p[0]),L._sub(p[3],p[0])))
            emit(A,'paper',p,[normal]*4,[(0,0)]*4,[(0,1,2),(0,2,3)])


def case(A, mat, r, depth, n, at=(0,0,0), sy=1):
    e=min(depth*.20,r*.08)
    profile=[(0,-depth/2),(r-e,-depth/2),(r,-depth/2+e),(r,depth/2-e),(r-e,depth/2),(0,depth/2)]
    A.lathe(mat,*at,profile,n=n,rot=(PI/2,0,0),scl=(1,1,sy))


def gold_coin(A, low):
    n=16 if low else 48
    case(A,'inspect_gold',.017,.0024,n)
    disk(A,'inspect_metal_atlas',0,0,.00123,.0149,name='coin_front',n=n)
    disk(A,'inspect_metal_atlas',0,0,-.00123,.0149,name='coin_back',n=n,back=True)
    if not low:
        ring(A,'inspect_gold',0,0,.00135,.0157,wire=.00035,segments=48,sides=4)
        for i in range(40):
            t=TAU*i/40
            box(A,'inspect_gold',.0169*math.cos(t),.0169*math.sin(t),0,.00035,.0006,.0018,rz=t)
        # Raised sun rays survive a close, grazing-light rotation.
        for i in range(12):
            t=TAU*i/12
            A.tube('inspect_gold',[(.006*math.cos(t),.006*math.sin(t),.00134),(.009*math.cos(t),.009*math.sin(t),.00134)],.00018,n=3)


def hands(A, r, z, low=False, y=0):
    for angle,length,width in ((-.78,r*.64,r*.055),(1.35,r*.78,r*.035)):
        solid(A,'inspect_ink',[(-width,-r*.13),(width,-r*.13),(width*.4,length),(0,length+width),(-width*.4,length)],z,.00035,rot=(0,0,angle),at=(0,y,0))
    if not low:
        A.tube('inspect_brass',[(0,y,z+.0003),(-r*.57,y-r*.54,z+.0003)],r*.012,n=3)
    disk(A,'inspect_gold',0,y,z+.0006,r*.075,n=8)


def pocket_watch(A, low):
    n=20 if low else 48
    case(A,'inspect_gold',.026,.009,n)
    disk(A,'inspect_paper_atlas',0,0,.0046,.0229,name='watch_face',n=n)
    hands(A,.022,.005,low)
    ring(A,'inspect_gold',0,0,.0045,.0241,wire=.001,segments=n,sides=4 if low else 6)
    A.cyl('inspect_gold',0,.024,0,.0032,.007,n=8 if low else 14)
    ring(A,'inspect_gold',0,.035,0,.006,wire=.0012,segments=12 if low else 20,sides=4)
    if not low:
        for i in range(10):
            t=TAU*i/10
            A.tube('inspect_brass',[(.0033*math.cos(t),.027,.0033*math.sin(t)),(.0033*math.cos(t),.030,.0033*math.sin(t))],.00022,n=3)
        ring(A,'inspect_brass',0,0,-.0046,.020,wire=.0003,segments=40,sides=3)
        disk(A,'inspect_metal_atlas',0,0,-.00465,.015,name='coin_back',n=28,back=True)


def wristwatch(A, low):
    # Supple, slightly curled leather straps; the front is a legible watch face.
    for sign in (-1,1):
        def strap(u,v,sign=sign,back=False):
            yy=sign*(.017+v*.067)
            ww=.0115*(1-.12*v)
            return ((u-.5)*2*ww,yy,-.002-.017*v*v+(-.0024 if back else 0))
        surface(A,'inspect_leather',lambda u,v:strap(u,v),2,3 if low else 8,back=sign<0)
        surface(A,'inspect_leather',lambda u,v:strap(u,v,back=True),2,3 if low else 8,back=sign>0)
        for edge in (-1,1):
            pts=[strap((edge+1)/2,i/8) for i in range(9)]
            A.tube('inspect_leather',pts,.0012,n=3 if low else 5)
        if not low:
            for edge in (-1,1):
                for j in range(11):
                    v=.12+j*.068
                    p1=strap(.08 if edge<0 else .92,v); p2=strap(.08 if edge<0 else .92,v+.025)
                    A.tube('inspect_cloth',[(a,b,c+.0003) for a,b,c in (p1,p2)],.00017,n=3)
            if sign<0:
                for j in range(5):
                    v=.40+j*.10; x,y,z=strap(.5,v)
                    disk(A,'inspect_dark',x,y,z+.00015,.0011,n=8)
    case(A,'inspect_silver',.0205,.009,16 if low else 36)
    disk(A,'inspect_paper_atlas',0,0,.0046,.0178,name='watch_face',n=16 if low else 36)
    hands(A,.017,.005,low)
    A.hcyl('inspect_silver',.023,0,0,.0025,.004,axis='x',n=8)
    A.tube('inspect_silver',[(-.012,.076,-.017),(-.012,.088,-.017),(.012,.088,-.017),(.012,.076,-.017)],.0016,n=4)
    A.tube('inspect_silver',[(0,.076,-.016),(0,.087,-.016)],.0008,n=4)


def jewel_ring(A, low):
    ring(A,'inspect_gold',0,0,0,.010,wire=.0015,segments=16 if low else 40,sides=4 if low else 8)
    # Faceted emerald: two crowns, intentionally flat normals at facets.
    pts=[(.0038*math.cos(TAU*i/8),.013+.0045*math.sin(TAU*i/8)) for i in range(8)]
    for i in range(8):
        a,b=pts[i],pts[(i+1)%8]
        p=[(a[0],a[1],.001),(b[0],b[1],.001),(0,.013,.0048)]
        n=L._unit(L._cross(L._sub(p[1],p[0]),L._sub(p[2],p[0])))
        emit(A,'inspect_gem',p,[n]*3,[(0,0),(1,0),(.5,1)],[(0,1,2)],col=0xffffff if i%2 else 0xb7d9cf)
        p=[(b[0],b[1],.001),(a[0],a[1],.001),(0,.013,-.0015)]
        n=L._unit(L._cross(L._sub(p[1],p[0]),L._sub(p[2],p[0])))
        emit(A,'inspect_gem',p,[n]*3,[(0,0),(1,0),(.5,1)],[(0,1,2)],col=0xffffff if i%2 else 0xb7d9cf)
    if not low:
        for x,y in ((-.003,.010),(.003,.010),(-.003,.016),(.003,.016)):
            A.tube('inspect_gold',[(x,y,0),(x,y,.0033)],.00045,n=5)


def locket(A, low):
    n=16 if low else 32
    for sign in (-1,1):
        case(A,'inspect_gold',.014,.004,n,at=(sign*.015,0,0),sy=1.25)
        disk(A,'inspect_paper_atlas' if sign>0 else 'inspect_metal_atlas',sign*.015,0,.0021,.0118,.0149,name='photo_portrait' if sign>0 else 'coin_back',n=n)
        if not low: ring(A,'inspect_gold',sign*.015,0,.0022,.0127,.016,wire=.0006,segments=n,sides=4)
    A.cyl('inspect_brass',0,-.012,0,.0015,.024,n=6)
    ring(A,'inspect_gold',.015,.020,0,.0035,wire=.0007,segments=10,sides=4)
    # A closed loop whose bottom meets the bail; no floating cut chain ends.
    steps=24 if low else 36
    pts=[(.015+.018*math.sin(TAU*i/steps),.041-.017*math.cos(TAU*i/steps),-.001) for i in range(steps+1)]
    A.tube('inspect_gold',pts,.00065,n=3 if low else 5,caps=False)
    if not low:
        for i in range(18):
            t=TAU*i/18
            link=InspectAsset('link',{'size':[1,1,1]})
            ring(link,'inspect_gold',0,0,0,.0015,.0022,wire=.00035,segments=8,sides=3)
            angle=math.atan2(.017*math.sin(t),.018*math.cos(t))-PI/2
            merge(A,link,(0,0,angle),(.015+.018*math.sin(t),.041-.017*math.cos(t),-.001))


def medal(A, low, star=False):
    n=16 if low else 36
    if star:
        pts=[((.020 if i%2==0 else .011)*math.cos(TAU*i/10+PI/2),-.029+(.020 if i%2==0 else .011)*math.sin(TAU*i/10+PI/2)) for i in range(10)]
        solid(A,'inspect_brass',pts,0,.003)
    else: case(A,'inspect_gold',.019,.003,n,at=(0,-.029,0))
    disk(A,'inspect_metal_atlas',0,-.029,.0016,.010 if star else .015,name='medal_emblem',n=n)
    # Pleated ribbon in national-flavoured but unbranded colours.
    for i,c in enumerate((0xbda143,0x43606c,0x934e43)):
        surface(A,'inspect_ribbon',lambda u,v,i=i:((i-1.5+u)*.009,.002+v*.047,-.002+math.sin(u*PI)*.0018),2,2,col=c)
        surface(A,'inspect_ribbon',lambda u,v,i=i:((i-1.5+u)*.009,.002+v*.047,-.003+math.sin(u*PI)*.0018),2,2,col=c,back=True)
    A.tube('inspect_brass',[(-.013,.049,-.001),(.013,.049,-.001)],.0011,n=4)
    ring(A,'inspect_brass',0,-.004,0,.006,wire=.0008,segments=8 if low else 14,sides=4)
    if not low:
        ring(A,'inspect_brass',0,-.029,-.0017,.011,wire=.0004,segments=24,sides=4)
        box(A,'inspect_brass',0,.049,-.004,.022,.0015,.001)


def rosary(A, low):
    count=18 if low else 28
    # The uninterrupted cord and pendant keep the low-poly version recognisable.
    ring(A,'inspect_dark',0,.022,0,.037,.052,wire=.0007,segments=24 if low else 42,sides=3)
    for i in range(count):
        t=TAU*i/count
        A.sph('inspect_wood',.037*math.cos(t),.022+.052*math.sin(t),0,.003,.0035,.003,n=4 if low else 8,col=0xc2aa93 if i%5 else 0xffffff)
    A.tube('inspect_dark',[(0,-.030,0),(0,-.072,0)],.0007,n=3)
    for j in range(3 if low else 5):
        A.sph('inspect_wood',0,-.036-j*.007,0,.0028,n=4 if low else 8)
    box(A,'inspect_brass',0,-.086,0,.004,.028,.002)
    box(A,'inspect_brass',0,-.080,0,.018,.004,.0022)
    if not low:
        A.tube('inspect_gold',[(-.006,-.080,.0015),(0,-.082,.002),(.006,-.080,.0015)],.0006,n=4)
        A.tube('inspect_gold',[(0,-.078,.002),(0,-.092,.0016)],.0008,n=4)


def keys(A, low):
    ring(A,'inspect_silver',0,.024,0,.013,wire=.0012,segments=16 if low else 28,sides=4 if low else 6)
    for j,angle in enumerate((-.48,.05,.48)):
        temp=L.Asset('key',{'size':[1,1,1]})
        mat='inspect_brass' if j==1 else 'inspect_silver'
        ring(temp,mat,0,0,0,.006,.007,wire=.0018,segments=10 if low else 18,sides=4)
        pts=[(-.002,-.006),(.002,-.006),(.002,-.026),(.006,-.026),(.006,-.030),(.003,-.030),(.003,-.034),(.006,-.034),(.006,-.038),(-.002,-.038)]
        solid(temp,mat,pts,0,.002)
        if not low: box(temp,'inspect_dark',.0006,-.019,.00103,.0004,.020,.00008)
        merge(A,temp,(0,0,angle),(0,.015,j*.002))


def merge(A,B,rot=(0,0,0),at=(0,0,0)):
    R=L._rotm(*rot)
    for k,g in B.groups.items():
        mat,tint,flags=k
        p=[tuple(L._apply(R,v)[i]+at[i] for i in range(3)) for v in g.P]
        n=[L._apply(R,v) for v in g.N]
        key=(mat,tint,flags)
        target=A.groups.setdefault(key,L.Geo())
        base=len(target.P)
        target.P.extend(p); target.N.extend(n); target.UV.extend(g.UV); target.C.extend(g.C)
        target.I.extend([tuple(base+i for i in f) for f in g.I]); target.has_col |= g.has_col
        for v in p:
            for i in range(3): A.lo[i]=min(A.lo[i],v[i]); A.hi[i]=max(A.hi[i],v[i])


def photograph(A,low,portrait=False):
    paper(A,'photo_portrait' if portrait else 'photo_family',.080 if portrait else .130,.110 if portrait else .090,bend=.004,low=low)


def letter(A,low):
    # Raised central fold, gently curled corners. The reverse has its own print.
    def fold(u,v,back=False):
        return ((u-.5)*.190,(v-.5)*.255,.006*abs(u-.5)+.003*abs(v-.5)+.001*math.sin(2*PI*v)+(-.0004 if back else 0))
    surface(A,'inspect_paper_atlas',lambda u,v:fold(u,v),2 if low else 8,2 if low else 8,name='letter')
    surface(A,'inspect_paper_atlas',lambda u,v:fold(u,v,True),2 if low else 8,2 if low else 8,name='paper_back',back=True)


def envelope(A,low):
    paper(A,'envelope',.155,.105,bend=.0007,low=low)
    # Closed triangular rear flap: geometry rather than a texture pretending to be depth.
    solid(A,'paper',[(-.076,.050),(.076,.050),(0,-.012)],-.001,.0004,col=0xe8d8bf)
    if not low:
        A.tube('inspect_ink',[(-.076,-.050,-.0007),(0,.006,-.0007),(.076,-.050,-.0007)],.00018,n=3)
        disk(A,'inspect_ribbon',0,-.008,-.0014,.006,n=20,back=True,col=0xb05743)


def diary(A,low):
    # Rounded cloth covers, inset page block, spine ribs and a ribbon bookmark.
    box(A,'paper',0,0,0,.102,.146,.017,r=.001 if not low else 0)
    for z in (-.010,.010): box(A,'inspect_leather',0,0,z,.111,.157,.003,r=.002 if not low else 0)
    box(A,'inspect_leather',-.054,0,0,.007,.157,.022,r=.002 if not low else 0)
    surface(A,'inspect_paper_atlas',lambda u,v:((u-.5)*.094,(v-.5)*.139,.0116),1,1,name='book_cover')
    box(A,'inspect_ribbon',.025,-.080,-.002,.011,.030,.0008,col=0xd3a65b)
    if not low:
        for i in range(12):
            z=-.0075+i*.00135
            A.tube('inspect_ink',[(.0515,-.070,z),(.0515,.070,z)],.000075,n=3,col=0xc8c2b7)
        for y in (-.050,-.029,.029,.050): box(A,'inspect_leather',-.054,y,.001,.008,.0025,.023,col=0xe0d3c0)
    box(A,'inspect_brass',.041,0,.0135,.016,.010,.0015,r=.001 if not low else 0)


def notebook(A,low):
    # Open stitched notebook, two bowed pages and a red margin.
    for side in (-1,1):
        x=side*.048
        box(A,'inspect_cloth',x,0,-.006,.092,.132,.003,col=0x839281)
        box(A,'paper',x,0,-.003,.088,.126,.004)
        def page(u,v,side=side):
            return (side*(.004+u*.088),(v-.5)*.126,.004*math.sin(u*PI)-.001*u)
        surface(A,'inspect_paper_atlas',page,2 if low else 8,2 if low else 5,name='diary' if side<0 else 'notebook',back=side<0)
        # Back of the entire book remains a complete cloth cover when rotated.
    if not low:
        for j in range(8):
            y=-.052+j*.015
            p=[(.0045*math.cos(TAU*i/12),y,.001+.005*math.sin(TAU*i/12)) for i in range(13)]
            A.tube('inspect_silver',p,.00045,n=4,caps=False)
    else:
        box(A,'inspect_dark',0,0,-.001,.004,.122,.003)


def recipe_cards(A,low):
    for i in range(2 if low else 3):
        paper(A,'recipe' if i==(1 if low else 2) else 'paper_back',.130,.085,z=i*.0010,bend=.001,rz=(i-1)*.045,low=low)
    # A simple real wire paperclip, clipped over the corner.
    pts=[(-.048,.029,.004),(-.048,.049,.004),(-.036,.049,.004),(-.036,.025,.004),(-.043,.025,.004),(-.043,.043,.004)]
    A.tube('inspect_silver',pts,.00065,n=3 if low else 5)


def banknotes(A,low):
    for i in range(2 if low else 3):
        paper(A,'banknote',.145,.065,z=i*.0007,bend=.006,rz=(i-1)*.06,low=low,back_name='banknote')


def lottery(A,low):
    paper(A,'lottery',.065,.135,bend=.004,low=low)
    if not low:
        # Slightly ragged perforation edge with tangible teeth.
        for j in range(18):
            box(A,'paper',-.030+j*.0035,-.0678,.0029,.0022,.0014,.00035)


def lace(A,low):
    petals=8 if low else 18
    for r in (.018,.039): ring(A,'inspect_lace',0,0,0,r,wire=.0007,segments=20 if low else 40,sides=3,wave=.002)
    for i in range(petals):
        t=TAU*i/petals
        p=[]
        for j in range(7 if low else 13):
            a=TAU*j/(6 if low else 12)
            rr=.043+.010*math.cos(a)
            tt=t+.11*math.sin(a)
            p.append((rr*math.cos(tt),rr*math.sin(tt),.002*math.sin(6*tt)))
        A.tube('inspect_lace',p,.0008,n=3,caps=False)
        A.tube('inspect_lace',[(.018*math.cos(t),.018*math.sin(t),0),(.040*math.cos(t),.040*math.sin(t),.002*math.sin(6*t))],.0007,n=3)
    if not low:
        for i in range(10):
            t=TAU*i/10
            A.tube('inspect_lace',[(0,0,0),(.018*math.cos(t),.018*math.sin(t),0)],.00065,n=3)


def knickers(A,low):
    # A freestanding, empty, comic pair of old-fashioned pink bloomers. There is
    # no body; waistband and leg openings stay genuinely open on front/back views.
    nu,nv=(8,3) if low else (24,7)
    def garment(u,v,back=False):
        q=(u-.5)*2
        # A broad gusset at the centre, with rounded leg openings on either side.
        bottom=-.100+.092*(max(0,(abs(q)-.18)/.82)**.7)
        y=bottom+(.108-bottom)*v
        width=.143+.018*math.sin(v*PI)
        z=(.026+.012*math.sin(u*PI))*(1 if not back else -1)+.003*math.sin(u*TAU*7)*math.sin(v*PI)
        return (q*width,y,z)
    surface(A,'inspect_cloth',lambda u,v:garment(u,v),nu,nv,col=0xf3bac7)
    surface(A,'inspect_cloth',lambda u,v:garment(u,v,True),nu,nv,back=True,col=0xf3bac7)
    # Join outer side seams, leaving the two leg holes open.
    for u in (0,1):
        surface(A,'inspect_cloth',lambda a,b,u=u:tuple((1-a)*garment(u,b)[k]+a*garment(u,b,True)[k] for k in range(3)),1,3,back=u==0,col=0xe5a8b8)
    surface(A,'inspect_cloth',lambda a,b:tuple((1-b)*garment(.43+.14*a,0)[k]+b*garment(.43+.14*a,0,True)[k] for k in range(3)),2,2,back=True,col=0xedb1c1)
    for back in (False,True):
        for upper in (True,False):
            n=12 if low else 48
            points=[]
            for i in range(n+1):
                u=i/n
                p=garment(u,1 if upper else 0,back)
                points.append(p)
            A.tube('inspect_lace',points,.0022 if upper else .0015,n=3,caps=True)
            if not low:
                def frill(u,v,back=back,upper=upper):
                    x,y,z=garment(u,1 if upper else 0,back)
                    wave=math.sin(u*TAU*20)
                    return (x,y+(v*.012*(1+.22*wave) if upper else -v*.009),z+(1 if not back else -1)*v*(.003+.004*wave))
                surface(A,'inspect_lace',frill,48,1,back=back)
    # Comically emphatic little ribbon bow.
    for sign in (-1,1):
        ring(A,'inspect_ribbon',sign*.012,.079,.042,.012,.007,wire=.002,segments=8 if low else 16,sides=3,col=0xb56078)
        solid(A,'inspect_ribbon',[(sign*.002,.078),(sign*.009,.075),(sign*.014,.050),(sign*.006,.053)],.041,.001,col=0xb56078)
    box(A,'inspect_ribbon',0,.079,.044,.006,.008,.004,col=0xb56078)


def toy_car(A,low):
    box(A,'inspect_enamel',0,-.003,0,.100,.020,.043,r=0 if low else .005,col=0xb83f36)
    box(A,'inspect_dark',0,-.013,0,.088,.006,.037)
    # Cabin silhouette in profile, extruded across the car.
    solid(A,'inspect_enamel',[(-.029,.006),(-.020,.026),(.014,.026),(.028,.006)],0,.035,col=0xb83f36)
    for z in (-.0177,.0177):
        solid(A,'inspect_silver',[(-.022,.010),(-.017,.023),(-.002,.023),(-.002,.010)],z,.0006,col=0x627c8e)
        solid(A,'inspect_silver',[(.001,.010),(.001,.023),(.012,.023),(.021,.010)],z,.0006,col=0x627c8e)
    for x in (-.032,.031):
        for z in (-.023,.023):
            A.hcyl('inspect_dark',x,-.014,z,.010,.007,axis='z',n=8 if low else 16)
            A.hcyl('inspect_silver',x,-.014,z*1.17,.0043,.001,axis='z',n=8)
    if not low:
        for x in (-.048,.048):
            box(A,'inspect_silver',x,-.005,0,.004,.004,.039,r=.001)
        for z in (-.013,.013):
            A.hcyl('inspect_enamel',.050,.001,z,.003,.001,axis='x',n=8,col=0xffedbc)
        for x,z in ((-.041,.020),(.023,.020),(.037,-.020)):
            box(A,'inspect_silver',x,.003,z,.004,.001,.001)


def toy_top(A,low):
    n=14 if low else 32
    profile=[(0,-.036),(.003,-.028),(.026,-.010),(.031,.003),(.026,.012),(.010,.020),(.006,.022),(.006,.041),(0,.041)]
    A.lathe('inspect_wood',0,0,0,profile,n=n)
    for y,r,c in ((-.006,.028,0xb95645),(.002,.0312,0xe6bc58),(.009,.028,0x4f8979)):
        A.lathe('inspect_enamel',0,0,0,[(r-.0005,y-.0015),(r+.0003,y),(r-.0005,y+.0015)],n=n,col=c)
    A.lathe('inspect_silver',0,0,0,[(0,-.038),(.003,-.029),(0,-.029)],n=8)
    steps=8 if low else 24
    pts=[(.040*math.cos(PI*i/steps),-.026+.005*math.sin(2*PI*i/steps),.027*math.sin(PI*i/steps)) for i in range(steps+1)]
    A.tube('inspect_cloth',pts,.0009,n=3 if low else 4)


def toy_teddy(A,low):
    n=6 if low else 12
    A.sph('inspect_cloth',0,-.008,0,.037,.045,.027,n=n,col=0xb28b63)
    A.sph('inspect_cloth',0,.048,.002,.033,.032,.026,n=n,col=0xc6a072)
    for side in (-1,1):
        A.sph('inspect_cloth',side*.026,.074,0,.012,.013,.008,n=n,col=0xb28b63)
        A.sph('inspect_cloth',side*.043,.006,0,.015,.030,.015,n=n,rot=(0,0,side*.4),col=0xb28b63)
        A.sph('inspect_cloth',side*.023,-.048,.008,.018,.023,.022,n=n,col=0xb28b63)
        if not low: A.sph('inspect_cloth',side*.023,-.057,.024,.012,.012,.003,n=8,col=0xdec39b)
    A.sph('inspect_cloth',0,.038,.025,.020,.015,.009,n=n,col=0xe0c39a)
    for side in (-1,1): A.sph('inspect_dark',side*.012,.055,.026,.0028,n=4 if low else 8)
    A.sph('inspect_dark',0,.043,.034,.004,.003,.002,n=4 if low else 8)
    if not low:
        A.tube('inspect_dark',[(-.007,.031,.033),(0,.029,.034),(.007,.031,.033)],.00065,n=3)
        for j in range(4):
            A.tube('inspect_cloth',[(-.012+j*.004,-.010,.028),(-.010+j*.004,-.014,.028)],.0005,n=3,col=0x715b47)
    box(A,'inspect_ribbon',0,.016,.026,.030,.006,.003,col=0x884f48)


def harmonica(A,low):
    box(A,'inspect_dark',0,0,0,.104,.014,.025,r=0 if low else .002)
    for y in (-.009,.009): box(A,'inspect_silver',0,y,-.001,.108,.005,.027,r=0 if low else .002)
    for j in range(11):
        box(A,'inspect_brass',-.048+j*.0096,0,.013,.0012,.012,.004)
    for j in range(10):
        box(A,'inspect_dark',-.0432+j*.0096,0,.0138,.0075,.009,.0008)
    # Engraved cover panel is in the same atlas as all printed faces.
    surface(A,'inspect_metal_atlas',lambda u,v:((u-.5)*.080,.0116,(.5-v)*.018-.001),1,1,name='harmonica_plate')
    if not low:
        for x in (-.046,.046):
            A.cyl('inspect_silver',x,.0115,0,.002,.0006,n=12)
            A.tube('inspect_dark',[(x-.001,.0122,0),(x+.001,.0122,0)],.00017,n=3)


BUILDERS = {
    'gold_coin': ('Moneda del recuerdo', 'jewelry', gold_coin),
    'pocket_watch': ('Reloj de bolsillo', 'timepieces', pocket_watch),
    'wristwatch': ('Reloj de pulsera', 'timepieces', wristwatch),
    'ring': ('Anillo de esmeralda', 'jewelry', jewel_ring),
    'locket': ('Relicario con retrato', 'jewelry', locket),
    'medal_sport': ('Medalla del barrio', 'jewelry', lambda A,l: medal(A,l)),
    'medal_service': ('Medalla de una vida', 'jewelry', lambda A,l: medal(A,l,True)),
    'rosary': ('Rosario de madera', 'devotion', rosary),
    'keys': ('Llaves de casa', 'household', keys),
    'photo_family': ('Foto de la familia', 'papers', lambda A,l: photograph(A,l)),
    'photo_portrait': ('Retrato guardado', 'papers', lambda A,l: photograph(A,l,True)),
    'letter': ('Una carta doblada', 'papers', letter),
    'envelope': ('Sobre con sello', 'papers', envelope),
    'diary': ('Diario con broche', 'papers', diary),
    'notebook': ('Cuaderno de cuentas', 'papers', notebook),
    'recipe_cards': ('Recetas de la abuela', 'papers', recipe_cards),
    'banknotes': ('Billetes de recuerdo', 'papers', banknotes),
    'lottery_ticket': ('Lotería de La Ladera', 'papers', lottery),
    'lace': ('Encaje de domingo', 'textiles', lace),
    'knickers': ('Los calzones de fiesta', 'textiles', knickers),
    'toy_car': ('Carrito de hojalata', 'toys', toy_car),
    'toy_top': ('Trompo de colores', 'toys', toy_top),
    'toy_teddy': ('Osito remendado', 'toys', toy_teddy),
    'harmonica': ('Armónica del abuelo', 'music', harmonica),
}
