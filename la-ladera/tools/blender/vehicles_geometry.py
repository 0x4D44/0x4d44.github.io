"""Original parked vehicle geometry, authored in metres in the game frame.

The unchanged furniture primitives provide normals, winding, materials and
export. Wheels are separate, centred assets: the exporter instances their mesh
data at separate named axle pivots. No manufacturer shape or badge is copied.
"""
import math
import random
import furn_lib as L

PAINT = 'vehicle_paint'
WHITE = 0xffffff
STEEL = 0xb5b6ae
DARK = 0x343638
TAU = math.tau


class Surface(L.Asset):
    """Furniture geometry with a per-primitive paint-atlas tile selection."""
    def __init__(self, key, cat, tile=0):
        super().__init__(key, cat)
        self.tile = tile
        self.uv_domain = None

    def _emit(self, mat, geom, col=None, tint=False, flags=(), rot=(0,0,0), off=(0,0,0), scl=None):
        if mat == PAINT:
            p,n,uv,tris = geom
            lo = [min(v[i] for v in uv) for i in range(2)]
            hi = [max(v[i] for v in uv) for i in range(2)]
            if self.uv_domain:
                lo=list(self.uv_domain[:2]);hi=list(self.uv_domain[2:])
            x,y = self.tile % 4, self.tile // 4
            u0,v0 = (x*256+8)/1024, (y*256+8)/1024
            span = 240/1024
            uv = [(u0+span*(u-lo[0])/max(hi[0]-lo[0],1e-8),
                   1-(v0+span*(v-lo[1])/max(hi[1]-lo[1],1e-8))) for u,v in uv]
            geom = p,n,uv,tris
        super()._emit(mat,geom,col,tint,flags,rot,off,scl)


def polygon(a,mat,pts,col=WHITE,normal=None,uv=None):
    n = normal or L._unit(L._cross(L._sub(pts[1],pts[0]),L._sub(pts[2],pts[0])))
    if uv is None:
        axis=max(range(3),key=lambda i:abs(n[i]))
        uv=[(p[(axis+1)%3],p[(axis+2)%3]) for p in pts]
    a._emit(mat,(pts,[n]*len(pts),uv,[(0,i,i+1) for i in range(1,len(pts)-1)]),col,False,())


def quad(a,mat,pts,col=WHITE,normal=None):
    polygon(a,mat,pts,col,normal)


def bar(a,mat,p,q,r=.015,n=6,col=WHITE):
    a.tube(mat,[p,q],r,n=n,col=col,caps=True)


def paintbox(a,tile,x,y,z,w,h,d,**kw):
    old=a.tile;a.tile=tile
    a.box(PAINT,x,y,z,w,h,d,col=WHITE,**kw)
    a.tile=old


def paintpoly(a,tile,pts,normal=None):
    old=a.tile;a.tile=tile
    polygon(a,PAINT,pts,WHITE,normal)
    a.tile=old


def section_loft(a,mat,sections,col=WHITE,cap=True):
    """Closed bevelled octagonal body sections, z/back to z/front."""
    rings=[]
    for z,y0,y1,w,bevel in sections:
        b=min(bevel,(y1-y0)*.25,w*.25)
        rings.append([(-w+b,y0,z),(w-b,y0,z),(w,y0+b,z),(w,y1-b,z),
                      (w-b,y1,z),(-w+b,y1,z),(-w,y1-b,z),(-w,y0+b,z)])
    for r,s in zip(rings,rings[1:]):
        for i in range(8):
            j=(i+1)%8
            pts=[r[i],s[i],s[j],r[j]]
            mid=[sum(p[k] for p in pts)/4 for k in range(3)]
            center=(0,sum((p[1] for p in r+s))/16,mid[2])
            n=L._unit(L._sub(mid,center))
            polygon(a,mat,pts,col,n)
    if cap:
        polygon(a,mat,rings[0],col,(0,0,-1))
        polygon(a,mat,rings[-1],col,(0,0,1))


def patch(a,x,y,z,w,h,side,tile,seed=1):
    """Irregular small sheet-metal rust/mud patch, not a regular rectangular decal."""
    r=random.Random(seed);n=8
    pts=[]
    for i in range(n):
        t=TAU*i/n;f=r.uniform(.72,1)
        pts.append((x,y+math.sin(t)*h*.5*f,z+math.cos(t)*w*.5*f))
    paintpoly(a,tile,pts,(side,0,0))


def tire(a,r,w,lod,spokes=False):
    """Open-centre tyre and rim, local axle +X through origin."""
    n=6 if lod else (28 if spokes else 18)
    inner=(.85 if w<=.075 else .67) if spokes else .53
    if lod:
        prof=[(r*inner,-w*.5),(r,-w*.38),(r,w*.38),(r*inner,w*.5)]
    elif spokes:
        prof=[(r*inner,-w*.50),(r*(inner+.045),-w*.52),(r*.97,-w*.37),
              (r,-w*.10),(r,w*.10),(r*.97,w*.37),(r*(inner+.045),w*.52),(r*inner,w*.50)]
    else:
        prof=[(r*.53,-w*.50),(r*.87,-w*.46),(r,-w*.12),
              (r,w*.12),(r*.87,w*.46),(r*.53,w*.50)]
    a.lathe('tyre',0,0,0,prof,n=n,hero=True,col=0xb9b6ae,rot=(0,0,-math.pi/2),crease=65)
    if lod:
        if spokes:
            for side in [-1,1]:
                xx=side*w*.48
                a.lathe('chrome',xx,0,0,[(r*(inner-.025),0),(r*(inner+.035),0)],n=6,hero=True,col=STEEL,rot=(0,0,-math.pi/2))
            for t in (0,TAU/3,2*TAU/3):
                bar(a,'chrome',(0,0,0),(0,math.cos(t)*r*inner,math.sin(t)*r*inner),.008,3,STEEL)
        else:
            a.hcyl('chrome',0,0,0,r*.55,w*1.03,n=6,col=0xa7a6a0)
        return
    # Raised bead ring and dished steel rim; the inner axle hub remains separate.
    for side in [-1,1]:
        xx=side*w*.52
        rim=([(r*(inner-.025),0),(r*(inner+.025),0),(r*(inner+.05),-.013*side),
              (r*(inner+.025),-.025*side),(r*(inner-.025),-.025*side)]
             if spokes else [(r*.50,0),(r*.64,0),(r*.61,-.025*side)])
        a.lathe('chrome',xx,0,0,rim,n=n,hero=True,col=0xbbb9ae,rot=(0,0,-math.pi/2),crease=55)
        if spokes:
            for i in range(16):
                t=TAU*i/16;tw=t+(.16 if i%2 else -.16)
                bar(a,'chrome',(side*w*.30,.035*math.cos(t),.035*math.sin(t)),
                    (xx,math.cos(tw)*r*(inner+.015),math.sin(tw)*r*(inner+.015)),.0038,3,0xc5c3b6)
        else:
            # Six recessed cooling apertures surrounding a pressed hub cap.
            for i in range(6):
                t=TAU*i/6
                cy,cz=math.cos(t)*r*.39,math.sin(t)*r*.39
                pts=[(xx+side*.003,cy+math.cos(TAU*j/6)*r*.105,cz+math.sin(TAU*j/6)*r*.105) for j in range(6)]
                polygon(a,'bumper',pts,0x55514c,(side,0,0))
            a.hcyl('chrome',xx,0,0,r*.22,.023,n=10,col=0xbdb8aa)
            for i in range(4):
                t=TAU*i/4
                a.hcyl('chrome',xx+side*.016,math.cos(t)*r*.14,math.sin(t)*r*.14,.012,.014,n=3,col=0x93846d)
    a.hcyl('chrome',0,0,0,r*(.12 if spokes else .35),w*1.03,n=10,col=0x8b8c86)
    # Low sidewall scuffing stays on the tyre material: it never creates a floating ring.
    for side in (-1,1):
        for i in range(0,28,4):
            t=TAU*i/28
            x=side*w*.50
            lo=inner+.025 if spokes else .74;hi=.95 if spokes else .86
            pts=[(x,r*lo*math.cos(t),r*lo*math.sin(t)),
                 (x,r*hi*math.cos(t+.04),r*hi*math.sin(t+.04)),
                 (x,r*(hi-.02)*math.cos(t+.18),r*(hi-.02)*math.sin(t+.18))]
            polygon(a,'tyre',pts,0xd0bf9d,(side,0,0))


class Vehicle:
    def __init__(self,key,cat,lod):
        self.key,self.cat,self.lod=key,cat,lod
        self.body=Surface(key,cat,cat['paintTile'])
        self.wheels=[]

    def wheel(self,code,x,y,z,r,w,spokes=False):
        # The export links repeated wheel meshes. Tyre geometry is in local axle coordinates.
        self.wheels.append(dict(code=code,position=[x,y,z],radius=r,width=w,spokes=spokes))


def car_shell(a,lod,w,d,axles,r,tile,boxback=False,pickup=False):
    """Shaped lower body with actual wheel-arch openings and shallow door dents."""
    a.tile=tile;half=d/2
    ys=.90 if not pickup else 1.02
    base=.32 if not pickup else .40
    if lod and d>5:
        section_loft(a,PAINT,[(-half+.05,base,ys-.05,w/2-.10,.04),
                              (0,base,ys,w/2-.035,.035),
                              (half-.05,base,ys-.16,w/2-.10,.04)])
        return
    arch=r+.055
    zs={-half+.05,half-.05,-half+.20,half-.23,-.5,.5,0.0}
    for wz in axles:
        for i in range(5 if lod else 13):
            theta=math.pi*i/(4 if lod else 12)
            zs.add(wz+math.cos(theta)*arch)
    zs=sorted(z for z in zs if -half+.05<=z<=half-.05)
    def width(z):
        end=max(0,(abs(z)-(half-.3))/.3)
        return w/2-.035-.09*min(1,end)
    def shoulder(z):
        return ys-.16*max(0,(z-(half-.55))/.55)-.05*max(0,(-z-(half-.3))/.3)
    def bottom(z):
        out=base
        for wz in axles:
            dz=z-wz
            if abs(dz)<arch:
                out=max(out,r+math.sqrt(max(0,arch*arch-dz*dz)))
        return min(out,shoulder(z)-.025)
    for side in (-1,1):
        for z0,z1 in zip(zs,zs[1:]):
            y00,y10=bottom(z0),bottom(z1); y01,y11=shoulder(z0),shoulder(z1)
            rows=1 if lod else 3
            for row in range(rows):
                pts=[]
                for z,y0,y1,t in [(z0,y00,y01,row/rows),(z1,y10,y11,row/rows),
                                  (z1,y10,y11,(row+1)/rows),(z0,y00,y01,(row+1)/rows)]:
                    y=y0+(y1-y0)*t
                    dent=0 if lod else .036*math.exp(-((z+.30)/.45)**2-((y-.63)/.20)**2)
                    xx=width(z)-.045*(1-t)-dent
                    pts.append((side*xx,y,z))
                # Continuous panel UVs, so one weather pattern spans the door
                # instead of repeating once per dent/arch tessellation strip.
                a.uv_domain=(-half,base,half,ys)
                normal=L._unit(L._cross(L._sub(pts[1],pts[0]),L._sub(pts[2],pts[0])))
                if normal[0]*side<0:normal=tuple(-n for n in normal)
                polygon(a,PAINT,pts,WHITE,normal,[(p[2],p[1]) for p in pts])
                a.uv_domain=None
        # The inner lip exposes a dark cavity instead of the old rectangular arch patch.
        for wz in axles:
            n=4 if lod else 12
            for i in range(n):
                t0=math.pi*i/n;t1=math.pi*(i+1)/n
                coords=[(wz+math.cos(t)*arch,r+math.sin(t)*arch) for t in (t0,t1)]
                pts=[(side*(width(z)+off),yy,z) for off in (0,-.085) for z,yy in coords]
                polygon(a,'bumper',[pts[0],pts[1],pts[3],pts[2]],0x61594e,(side,0,0))
        if not lod:
            for z in (-.25,.42):
                yy=.68
                patch(a,side*(width(z)-.011),yy,z,.23,.12,side,8,seed=int((z+2)*100)+side)
            patch(a,side*(w/2-.065),base+.085,0,.80,.14,side,9,17+side)
    for z0,z1 in zip(zs,zs[1:]):
        if pickup and z1<-.3:continue
        polygon(a,PAINT,[(-width(z0),shoulder(z0),z0),(width(z0),shoulder(z0),z0),
                         (width(z1),shoulder(z1),z1),(-width(z1),shoulder(z1),z1)],WHITE,(0,1,0))
    for z,side in ((zs[0],-1),(zs[-1],1)):
        polygon(a,PAINT,[(-width(z),base,z),(width(z),base,z),(width(z),shoulder(z),z),(-width(z),shoulder(z),z)],WHITE,(0,0,side))
    a.box('bumper',0,.27 if not pickup else .34,0,w*.77,.055,d*.86,col=0x4e4d49)


def greenhouse(a,lod,w,y0,roof,zbase,zroof,tile,posts=()):
    a.tile=tile
    wb=w*.46;wt=w*.405
    b0,b1=zbase;t0,t1=zroof
    # Individual glass panels leave meaningful painted pillars; dark glass is opaque on purpose.
    for side in (-1,1):
        polygon(a,'glass_dark',[(side*wb,y0,b0),(side*wb,y0,b1),(side*wt,roof,t1),(side*wt,roof,t0)],WHITE,(side,.1,0))
    for zb,zt,side in ((b0,t0,-1),(b1,t1,1)):
        polygon(a,'glass_dark',[(-wb,y0,zb),(wb,y0,zb),(wt,roof,zt),(-wt,roof,zt)],WHITE,(0,.5,side))
    a.box(PAINT,0,roof-.012,(t0+t1)/2,wt*2+.025,.047,t1-t0+.06,col=WHITE,r=0 if lod else .018)
    # A/C pillars and window rubbers. Far LOD keeps simple strips.
    for side in (-1,1):
        for zb,zt in ((b0,t0),(b1,t1)):
            if lod:
                polygon(a,PAINT,[(side*wb,y0,zb-.022),(side*wb,y0,zb+.022),
                                 (side*wt,roof,zt+.022),(side*wt,roof,zt-.022)],WHITE,(side,0,0))
            else:bar(a,PAINT,(side*wb,y0,zb),(side*wt,roof,zt),.030,5)
        for z in posts:
            a.box('bumper',side*(wb+wt)*.5,y0,z,.035,roof-y0,.060,col=0x62605b)
        if not lod:
            bar(a,'bumper',(side*wb,y0+.005,b0),(side*wb,y0+.005,b1),.012,4,0x5b5854)
            bar(a,'bumper',(side*wt,roof+.015,t0),(side*wt,roof+.015,t1),.010,4,0x5b5854)
    if not lod:
        for side in (-1,1):
            x=side*.32
            bar(a,'bumper',(x,y0+.035,b1+.013),(x-.14,y0+.23,b1-(b1-t1)*.4),.006,4,0x474849)
        # Restrained windshield reflections and rear demister strips avoid flat black slabs.
        polygon(a,'glass_dark',[(-wb*.85,y0+.10,b1-.10),(wt*.7,roof-.08,t1+.08),
                               (wt*.52,roof-.08,t1+.08),(-wb*.85,y0+.15,b1-.15)],0xc1d0cc,(0,.5,1))
        for yy in (.20,.29,.38):
            t=yy/max(.01,roof-y0)
            zz=b0+(t0-b0)*t-.008;ww=wb+(wt-wb)*t
            bar(a,'chrome',(-ww*.85,y0+yy,zz),(ww*.85,y0+yy,zz),.002,3,0x615e55)


def car_detail(a,lod,w,d,axles,r,tile,taxi=False):
    half=d/2;a.tile=tile
    for z in (-half+.040,half-.040):
        a.box('bumper',0,.34,z,w-.11,.15,.065,col=0x8d8b80,r=.018 if not lod else 0)
    for side in (-1,1):
        # Large rectangular lamps of the period, no manufacturer signature.
        a.box('light_head',side*(w*.31),.72,half-.048,w*.19,.14,.035,col=0xe7d7a4)
        a.box('light_tail',side*(w*.35),.76,-half+.048,w*.13,.19,.035,col=0xd47d69)
        if not lod:
            a.box('light_head',side*(w*.425),.72,half-.05,w*.055,.10,.04,col=0xe3ad50)
            a.box('bumper',side*(w*.46),.55,0,.025,.035,1.6,col=0x6b6860)
            for z in (-.62,.26):
                a.box('bumper',side*(w*.46),.80,z,.028,.030,.145,col=0x5e5a50)
            for z in (-.81,.06,.62):
                a.box('bumper',side*(w*.46),.39,z,.008,.48,.009,col=0x636460)
            a.box(PAINT,side*(w*.47),.98,.59,.10,.082,.13,col=WHITE,r=.015)
            a.box('glass_dark',side*(w*.47),.996,.528,.078,.052,.007,col=0xddd7c5)
            for wz in axles:
                # Tyre-contact mudflap, shortened to stay clear of the ground.
                a.box('tyre',side*(w*.42),.12,wz-r-.075,.20,.21,.018,col=0x777165)
            bar(a,'chrome',(side*.67,.93,-1.34),(side*.63,1.12,-1.31),.008,4,0x969489)
    if not lod:
        for y in (.67,.72,.77):
            a.box('bumper',0,y,half-.035,.66,.020,.028,col=0x5c5953)
        for z in (-half+.006,half-.006):
            paintbox(a,11,0,.44,z,.33,.12,.007)
        # Real bonnet seam and windscreen washer nozzles.
        for side in (-1,1):
            bar(a,'bumper',(side*.61,.905,.83),(side*.60,.77,half-.19),.004,3,0x565950)
            a.box('bumper',side*.30,.905,.82,.021,.012,.03,col=0x535551)


def hatch(v,boxback=False):
    a=v.body;l=v.lod;w,d=1.75,3.9;ax=[-1.16,1.18];r=.29
    tile=v.cat['paintTile'];car_shell(a,l,w,d,ax,r,tile,boxback)
    if boxback:
        greenhouse(a,l,w,.90,1.52,(-1.59,.73),(-1.28,.26),tile,(-.49,))
    else:
        greenhouse(a,l,w,.90,1.47,(-1.45,.73),(-.82,.23),tile,(-.29,))
    car_detail(a,l,w,d,ax,r,tile)
    for code,x,z in [('fl',-.73,ax[1]),('fr',.73,ax[1]),('rl',-.73,ax[0]),('rr',.73,ax[0])]:
        v.wheel(code,x,r,z,r,.19)
    if not l:
        # A visibly replaced bonnet and a crease along the panel give the second car its own history.
        if boxback:
            paintpoly(a,1,[(-.68,.897,.82),(.68,.897,.82),(.66,.804,1.52),(-.66,.804,1.52)],(0,1,0))
        for side in (-1,1):
            a.box('seat',side*.38,.71,-.10,.48,.08,.54,col=0x77746a,r=.025)
            a.box('seat',side*.38,.79,-.32,.46,.36,.10,col=0x79786d,r=.022,rx=-.1)
            a.box('seat',side*.38,1.15,-.34,.25,.12,.10,col=0x77746a,r=.02)
        a.box('bumper',0,.83,.47,1.20,.12,.22,col=0x66645a,r=.025)


def pickup(v):
    a=v.body;l=v.lod;w,d=1.86,4.7;ax=[-1.43,1.43];r=.35;tile=v.cat['paintTile']
    car_shell(a,l,w,d,ax,r,tile,pickup=True)
    greenhouse(a,l,w,1.01,1.74,(-.27,1.09),(-.19,.69),tile,())
    # Hollow load bed overrides the centre deck with a dark recessed floor and separate sideboards.
    a.box('wood_dark',0,.78,-1.19,1.45,.05,1.68,col=0xd7b98c)
    for side in (-1,1):
        a.box(PAINT,side*.84,1.015,-1.21,.065,.24,1.77,col=WHITE)
    a.box(PAINT,0,.94,-2.20,1.72,.32,.065,col=WHITE)
    a.box(PAINT,0,.98,-.33,1.70,.29,.065,col=WHITE)
    for code,x,z in [('fl',-.79,ax[1]),('fr',.79,ax[1]),('rl',-.79,ax[0]),('rr',.79,ax[0])]:
        v.wheel(code,x,r,z,r,.23)
    for z in (-2.29,2.29): a.box('bumper',0,.40,z,1.73,.14,.10,col=0xa5a296)
    for side in (-1,1):
        a.box('light_head',side*.57,.80,2.30,.35,.18,.04,col=0xeee0b5)
        a.box('light_tail',side*.72,.91,-2.28,.14,.28,.035,col=0xc68172)
    if l:return
    for x in (-.58,-.29,0,.29,.58):
        a.box('metal_dark',x,.825,-1.18,.030,.022,1.62,col=0x978d76)
    for side in (-1,1):
        for z in (-2.04,-1.29,-.52):
            a.box('wood_dark',side*.78,1.18,z,.045,.58,.045,col=0xc4a173)
        for y in (1.35,1.61):
            a.box('wood_dark',side*.78,y,-1.28,.043,.09,1.61,col=0xbb9869)
        a.box('bumper',side*.877,1.17,.76,.075,.10,.17,col=0x575958)
        a.box('glass_dark',side*.879,1.19,.68,.055,.064,.007,col=0xccc9b8)
        a.box('bumper',side*.858,.88,.12,.026,.035,.17,col=0x686454)
        bar(a,'bumper',(side*.849,.46,-.20),(side*.849,1.00,-.20),.0045,3,0x565650)
        a.box('tyre',side*.79,.14,-1.86,.24,.30,.020,col=0x817866)
    paintbox(a,11,0,.46,-2.348,.34,.13,.004)
    a.box('bumper',0,.77,2.31,.65,.19,.05,col=0x6f6d65)
    for x in (-.26,-.13,0,.13,.26):a.box('chrome',x,.79,2.34,.022,.15,.009,col=0xaeb0a8)
    bar(a,'chrome',(0,.75,-2.25),(0,.75,-2.33),.023,6,0x88867a)
    # A loose diagonal plank rests in the bed, below the rails.
    a.box('wood_dark',0,1.02,-1.20,.16,.045,1.55,col=0xc3a77f,ry=.27,rx=.08)


def bus_wheels(v,zf,zr,r,wheelx):
    for code,x,z in [('fl',-wheelx,zf),('fr',wheelx,zf),('rl',-wheelx,zr),('rr',wheelx,zr)]:
        v.wheel(code,x,r,z,r,.24)


def chiva(v):
    a=v.body;l=v.lod;tile=v.cat['paintTile'];w=2.2;d=6.6;r=.42
    car_shell(a,l,w,d,[-1.86,2.12],r,tile,pickup=True)
    # Projecting bonnet, upright cab and open passenger body are recognisably a rural chiva.
    greenhouse(a,l,2.05,1.04,2.36,(1.09,2.26),(1.16,1.92),tile,())
    a.box(PAINT,0,1.00,-.83,2.05,.15,3.78,col=WHITE)
    a.box('wood_dark',0,1.15,-.85,1.91,.055,3.71,col=0xd7b989)
    a.box(PAINT,0,2.55,-.46,2.11,.12,5.10,col=WHITE,r=0 if l else .045)
    for side in (-1,1):
        # Four square side bays. Coarse LOD retains the open spaces.
        for z in ((-2.68,1.24) if l else (-2.68,-1.63,-.58,.47,1.24)):
            a.box(PAINT,side*.995,1.12,z,.065,1.44,.065,col=WHITE)
        a.box(PAINT,side*.995,1.26,-.76,.055,.13,4.10,col=WHITE)
        paintbox(a,10,side*1.005,1.43,-.76,.028,.21,4.10)
        a.box(PAINT,side*.995,2.44,-.76,.07,.095,4.10,col=WHITE)
    a.box(PAINT,0,1.14,-2.91,2.02,.67,.06,col=WHITE)
    bus_wheels(v,2.12,-1.86,r,.91)
    for z in (-3.22,3.22): a.box('bumper',0,.47,z,2.08,.19,.12,col=0xa8a395)
    for side in (-1,1):
        a.hcyl('light_head',side*.69,.89,3.20,.16,.075,axis='z',n=6 if l else 18,col=0xf1dfb2)
        a.box('light_tail',side*.83,.91,-3.22,.13,.22,.03,col=0xc77d67)
    if l:
        a.box('laundry',-.36,2.72,-1.90,.62,.35,.88,col=0xbda77e)
        a.box('wood_dark',.34,2.72,-1.34,.61,.29,.78,col=0xbc9c70)
        return
    for z in (-2.31,-1.27,-.23,.75):
        a.box('wood_dark',0,1.36,z,1.74,.085,.34,col=0xd1a96c,r=.018)
        a.box('wood_dark',0,1.47,z-.15,1.72,.32,.045,col=0xd4af78)
        for side in (-1,1):
            a.box('iron_black',side*.65,1.18,z,.045,.22,.045,col=0x898779)
    for side in (-1,1):
        for z in (-2.68,-1.63,-.58,.47):
            for yy in (1.62,1.71):
                paintbox(a,5 if int((z+3)*10)%2 else 0,side*1.007,yy,z+.49,.03,.038,.91)
        # Entry step and handrail only on the kerb side; no implausible symmetrical doorway.
        if side==1:
            a.box('metal_dark',.93,.67,1.20,.22,.09,.66,col=0xb3aa91)
            a.box('metal_dark',.94,.88,1.20,.20,.08,.59,col=0xb3aa91)
            bar(a,'chrome',(.99,1.07,1.51),(.99,2.22,1.51),.022,6,STEEL)
        a.box('bumper',side*1.03,1.91,2.02,.09,.20,.15,col=0x77796e,r=.02)
        bar(a,'chrome',(side*.96,2.15,1.93),(side*1.045,2.02,2.02),.015,5,STEEL)
        for z in (-2.55,-1.25,0,1.45):
            a.box('chrome',side*.95,2.66,z,.028,.35,.028,col=0xc1c2b3)
        bar(a,'chrome',(side*.95,3.01,-2.62),(side*.95,3.01,1.55),.019,6,STEEL)
        bar(a,'chrome',(side*.95,2.77,-2.62),(side*.95,2.77,1.55),.015,5,STEEL)
    for z in (-2.55,-1.45,-.25,1.42):
        bar(a,'chrome',(-.95,2.73,z),(.95,2.73,z),.020,6,STEEL)
    # Roof luggage, cloth-covered packages and a rear ladder are part of the parked variant.
    a.box('laundry',-.36,2.72,-1.90,.62,.35,.88,col=0xbda77e,r=.065)
    a.box('wood_dark',.34,2.72,-1.34,.61,.29,.78,col=0xbc9c70,r=.02)
    for x in (-.34,.34):
        bar(a,'iron_black',(x,2.74,-2.34),(x,3.08,-1.45),.009,4,0x7e7565)
    for x in (-.37,.37):bar(a,'chrome',(x,1.12,-2.96),(x,3.03,-2.96),.023,6,STEEL)
    for y in (1.29,1.58,1.87,2.16,2.45,2.74):bar(a,'chrome',(-.37,y,-2.96),(.37,y,-2.96),.018,5,STEEL)
    for y in (.80,.88,.96,1.04):a.box('chrome',0,y,3.19,.73,.023,.025,col=0xc4bda6)
    paintbox(a,11,0,2.38,1.99,1.24,.15,.024)
    paintbox(a,10,0,1.01,3.20,1.94,.18,.018)


def colectivo(v):
    a=v.body;l=v.lod;w,d=2.08,5.8;r=.36;tile=v.cat['paintTile']
    car_shell(a,l,w,d,[-1.75,1.85],r,tile,pickup=True)
    a.box(PAINT,0,1.0,-.12,1.97,.35,5.31,col=WHITE)
    greenhouse(a,l,2.03,1.32,2.49,(-2.62,2.58),(-2.48,2.17),tile,(-1.7,-.68,.34,1.28))
    for side in (-1,1):
        paintbox(a,2,side*.995,1.08,-.08,.022,.15,5.14)
        a.box('bumper',side*.998,.61,-.12,.018,.058,4.83,col=0x7e7d70)
    bus_wheels(v,1.85,-1.75,r,.88)
    for z in (-2.83,2.83):a.box('bumper',0,.43,z,1.94,.15,.12,col=0x98988e)
    for side in (-1,1):
        a.box('light_head',side*.69,.91,2.84,.33,.20,.05,col=0xf3e3b0)
        a.box('light_tail',side*.79,.93,-2.81,.16,.30,.04,col=0xc47b6f)
    if l:return
    # Folding entry door, step and projecting mirrors.
    for z in (.93,1.25):
        a.box('bumper',1.004,.49,z,.018,1.77,.020,col=0x63665e)
    a.box('bumper',1.004,.49,1.09,.019,.035,.66,col=0x63665e)
    a.box('metal_dark',1.01,.35,1.09,.06,.065,.61,col=0xbab4a2)
    a.box('bumper',1.006,1.12,1.28,.035,.12,.02,col=0x5f625b)
    for side in (-1,1):
        a.box('bumper',side*1.013,1.90,2.22,.054,.24,.15,col=0x696d62,r=.02)
        for zz in (-1.6,-.65,.3):
            a.box('seat',side*.51,1.18,zz,.55,.10,.46,col=0x4b6a6c,r=.025)
            a.box('seat',side*.51,1.29,zz-.18,.54,.47,.095,col=0x4d6b6a,r=.02)
        for zz in (-2.0,-.4,.8):
            a.box('bumper',side*.977,1.40,zz,.018,.022,.74,col=0x747e75)
        patch(a,side*1.001,.90,-1.12,.33,.19,side,8,21+side)
    a.box('bumper',0,.86,2.84,.79,.21,.025,col=0x565e5a)
    for yy in (.88,.94,1.00):a.box('chrome',0,yy,2.86,.76,.016,.013,col=0xa6aca0)
    paintbox(a,11,0,2.28,2.28,1.25,.16,.027)
    paintbox(a,11,0,.48,-2.896,.35,.13,.004)
    for x in (-.60,.60):a.box('chrome',x,2.54,-.15,.045,.065,3.69,col=0xc6c2af)


def fender(a,r,y,z,w,tile,lod,cx=0):
    old=a.tile;a.tile=tile;n=4 if lod else 12
    for i in range(n):
        t0=-1.3+2.6*i/n;t1=-1.3+2.6*(i+1)/n
        pts=[(cx+x,y+math.cos(t)*r,z+math.sin(t)*r) for x,t in [(-w/2,t0),(w/2,t0),(w/2,t1),(-w/2,t1)]]
        polygon(a,PAINT,pts,WHITE,(0,1,0))
    a.tile=old


def motorbike(v):
    a=v.body;l=v.lod;r=.285;tile=v.cat['paintTile'];zf=.655;zr=-.655
    v.wheel('front',0,r,zf,r,.085,True);v.wheel('rear',0,r,zr,r,.115,True)
    bar(a,'bumper',(0,.91,.35),(0,.42,.02),.028,3 if l else 7,0x97998e)
    bar(a,'bumper',(0,.42,.02),(0,.79,-.51),.029,3 if l else 7,0x97998e)
    for side in (-1,1):
        bar(a,'chrome',(side*.064,.99,.39),(side*.064,r,zf),.025,3 if l else 8,STEEL)
        bar(a,'bumper',(side*.07,.44,-.10),(side*.07,r,zr),.022,3 if l else 7,0x989a8c)
    section_loft(a,PAINT,[(-.15,.78,.87,.09,.03),(.02,.77,.98,.12,.05),(.25,.84,1.02,.105,.03),(.38,.90,.99,.06,.02)])
    # Preserve the established helmet contact at y=.9125, z=-.385.
    section_loft(a,'seat',[(-.90,.835,.935,.055,.02),(-.78,.82,.935,.085,.02),(-.55,.80,.920,.112,.025),(-.22,.79,.905,.112,.02),(-.06,.80,.89,.075,.02)],0x9e9b90)
    a.hcyl('light_head',0,.97,.57,.085,.055,axis='z',n=6 if l else 20,col=0xeaddb4)
    bar(a,'chrome',(-.33,1.065,.39),(.33,1.065,.39),.014,3 if l else 7,STEEL)
    a.box('bumper',0,.40,.04,.22,.25,.26,col=0x9b9e93,r=0 if l else .045)
    fender(a,.324,r,zf,.12,tile,l);fender(a,.33,r,zr,.15,tile,l)
    if l:return
    for yy in (.55,.58,.61,.64):
        a.box('chrome',0,yy,.10,.17,.014,.17,col=0xa7aa9e,r=.017)
    a.hcyl('chrome',0,.47,.01,.091,.255,n=18,col=0xb8b8a9)
    for side in (-1,1):
        bar(a,'seat',(side*.24,1.065,.39),(side*.35,1.065,.39),.021,8,0x8d8d81)
        bar(a,'chrome',(side*.28,1.08,.41),(side*.30,1.23,.36),.008,5,STEEL)
        a.box('glass_dark',side*.30,1.23,.36,.10,.065,.025,col=0xd4d2c1,ry=side*.16,r=.016)
        bar(a,'chrome',(side*.10,.78,-.42),(side*.10,.38,-.59),.025,7,STEEL)
        for k in range(6):
            yy=.43+k*.047;zz=-.57+k*.020
            a.hcyl('chrome',side*.10,yy,zz,.035,.012,axis='z',n=8,col=0x9b8b7b)
        a.box('light_head',side*.13,.92,.56,.048,.048,.055,col=0xf4ab45,r=.015)
        a.box('light_tail',side*.12,.80,-.88,.045,.042,.05,col=0xdca04e,r=.015)
        a.box('chrome',side*.17,.36,-.07,.11,.025,.055,col=0xb4b6a7)
    a.box('light_tail',0,.78,-.925,.11,.07,.035,col=0xd78278)
    paintbox(a,11,0,.64,-.947,.16,.11,.012)
    bar(a,'chrome',(.11,.42,.15),(.14,.29,-.22),.023,7,STEEL)
    bar(a,'chrome',(.14,.29,-.22),(.15,.43,-.88),.045,10,0xa7aa9d)
    bar(a,'bumper',(-.09,.43,-.1),(-.27,.04,-.02),.013,5,0x99978a)
    a.hcyl('chrome',.056,r,zf,.125,.009,n=18,col=0xb8b6a5)
    a.hcyl('chrome',-.068,r,zr,.090,.008,n=16,col=0xa7a897)
    for i in range(8):
        t=TAU*i/8
        a.hcyl('bumper',.062,r+.081*math.cos(t),zf+.081*math.sin(t),.012,.004,n=5,col=0x636960)
    bar(a,'bumper',(-.075,.30,zr),(-.075,.42,-.08),.007,4,0xa8a18c)
    a.cyl('chrome',0,1.019,.20,.039,.011,n=14,col=0xbec1b1)


def cycle_frame(a,l,zf,zr,r,seat_y,seat_z,tile,cargo=False):
    a.tile=tile;n=3 if l else 7
    crank=(0,.31,-.07);head=(0,.90,zf-.15);seat=(0,seat_y-.12,seat_z)
    for p,q,rad in [(crank,head,.022),(head,seat,.021),(seat,crank,.021),
                     (seat,(0,r,zr),.017),(crank,(0,r,zr),.016)]:
        bar(a,PAINT,p,q,rad,n)
    for side in (-1,1):
        bar(a,'chrome',(side*.032,head[1],head[2]),(side*.032,r,zf),.013,n,STEEL)
    bar(a,'chrome',seat,(0,seat_y,seat_z-.03),.012,n,STEEL)
    a.box('seat',0,seat_y,seat_z-.035,.15,.042,.23,col=0xb2ab98,r=0 if l else .018)
    bar(a,'chrome',head,(0,1.035,zf-.18),.012,n,STEEL)
    bar(a,'chrome',(-.25,1.045,zf-.19),(.25,1.045,zf-.19),.013,n,STEEL)
    if l:return
    for side in (-1,1):
        bar(a,'seat',(side*.18,1.045,zf-.19),(side*.25,1.045,zf-.19),.018,8,0x969185)
        bar(a,'bumper',(side*.17,1.032,zf-.17),(side*.12,.88,zf-.11),.0035,3,0x74796c)
        yy=.31+side*.07
        bar(a,'chrome',(side*.045,.31,-.07),(side*.11,yy,-.07),.009,6,STEEL)
        a.box('bumper',side*.14,yy,-.07,.085,.020,.07,col=0xaaa28e)
    a.hcyl('chrome',-.045,.31,-.07,.073,.012,n=18,col=0xa6aa9b)
    for yy in (.275,.355):bar(a,'bumper',(-.05,yy,-.07),(-.05,r,zr),.005,3,0x959280)
    a.tube('bumper',[(.10,1.035,zf-.18),(.11,.92,zf-.01),(.08,.75,zf+.02)],.004,n=4,caps=False,col=0x696e60)
    a.tube('bumper',[(-.10,1.035,zf-.18),(-.09,.88,zf-.22),(-.06,.76,seat_z+.07),(-.04,r+.10,zr)],.004,n=4,caps=False,col=0x696e60)
    a.cyl('chrome',.095,1.07,zf-.18,.027,.020,n=12,col=0xc0bfaa)


def bicycle(v):
    a=v.body;l=v.lod;r=.31;zf=.54;zr=-.54
    v.wheel('front',0,r,zf,r,.038,True);v.wheel('rear',0,r,zr,r,.038,True)
    cycle_frame(a,l,zf,zr,r,.94,-.18,v.cat['paintTile'])
    fender(a,.337,r,zr,.060,6,l)
    if l:return
    fender(a,.337,r,zf,.058,6,l)
    for side in (-1,1):
        bar(a,'chrome',(side*.07,.71,-.72),(side*.07,.71,-.28),.010,5,STEEL)
        bar(a,'chrome',(side*.03,r,-.54),(side*.08,.70,-.70),.008,4,STEEL)
    for z in (-.69,-.53,-.37):bar(a,'chrome',(-.07,.71,z),(.07,.71,z),.008,4,STEEL)
    a.box('light_tail',0,.66,-.815,.047,.045,.021,col=0xc78b76)
    a.hcyl('light_head',0,.88,.46,.036,.045,axis='z',n=10,col=0xe2d9b8)
    bar(a,'bumper',(-.04,.33,-.02),(-.15,.018,.02),.009,4,0x8a8c7c)


def tricycle(v):
    a=v.body;l=v.lod;r=.29;zf=.93;zr=-.59
    v.wheel('front',0,r,zf,r,.045,True)
    v.wheel('rl',-.53,r,zr,r,.07,True);v.wheel('rr',.53,r,zr,r,.07,True)
    cycle_frame(a,l,zf,-.59,r,.97,.18,v.cat['paintTile'],True)
    a.hcyl('iron_black',0,r,-.59,.025,1.12,n=4 if l else 8,col=0x999789)
    a.box('wood_dark',0,.57,-.63,1.02,.05,.93,col=0xc8ac79)
    levels=(.64,) if l else (.64,.83,1.02)
    for side in (-1,1):
        for yy in levels:
            a.box('wood_dark',side*.49,yy,-.63,.036,.48 if l else .13,.95,col=0xb99967)
        for z in (-1.07,-.19):
            a.box(PAINT,side*.47,.58,z,.040,.60,.04,col=WHITE)
    for z in (-1.08,-.18):
        for yy in levels:a.box('wood_dark',0,yy,z,.98,.48 if l else .13,.032,col=0xc7a973)
    if l:return
    for side in (-1,1):
        fender(a,.33,r,zr,.11,4,False,cx=side*.53)
        for z in (-1.07,-.19):
            for y in (.71,.90,1.09):
                a.hcyl('chrome',side*.514,y,z,.011,.009,n=5,col=0xb1ac94)
        bar(a,'chrome',(side*.49,.57,-.98),(side*.07,.37,.02),.020,6,STEEL)
    a.box('wood_dark',.20,.62,-.65,.30,.33,.40,col=0xb49c77)
    a.box('laundry',-.25,.62,-.70,.34,.42,.42,col=0xbbb5a3,r=.050)
    bar(a,'iron_black',(-.5,1.17,-.93),(.50,1.17,-.94),.012,4,0x8c8e7d)


def handcart(v):
    a=v.body;l=v.lod;r=.34
    v.wheel('left',-.52,r,-.22,r,.085,True);v.wheel('right',.52,r,-.22,r,.085,True)
    a.hcyl('iron_black',0,r,-.22,.025,1.12,n=4 if l else 8,col=0x8f9083)
    a.box('wood_dark',0,.56,-.36,.97,.055,1.13,col=0xcbac78)
    for side in (-1,1):
        # Long handles taper into the palms and remain within the 2.1m slot.
        bar(a,'wood_dark',(side*.40,.59,-.83),(side*.43,1.02,1.01),.028,3 if l else 7,0xc9a879)
        for yy in ((.64,) if l else (.64,.83,1.02)):
            a.box('wood_dark',side*.465,yy,-.37,.035,.47 if l else .13,1.06,col=0xc1a272)
        for zz in (-.88,.15):a.box(PAINT,side*.44,.56,zz,.043,.62,.038,col=WHITE)
    for zz in (-.885,.15):
        for yy in ((.64,) if l else (.64,.83,1.02)):
            a.box('wood_dark',0,yy,zz,.93,.47 if l else .13,.035,col=0xc7a776)
    if l:return
    for x in (-.35,-.12,.12,.35):a.box('wood_dark',x,.615,-.36,.018,.006,1.05,col=0x6f5c3e)
    for side in (-1,1):
        for yy in (.70,.89,1.08):
            for zz in (-.83,.10):a.hcyl('chrome',side*.49,yy,zz,.012,.009,n=6,col=0x9d967f)
        bar(a,'wood_dark',(side*.40,.57,-.80),(side*.47,1.10,.07),.021,5,0xb99965)
    a.box('wood_dark',0,.68,-.45,.50,.055,.86,col=0xc7ad80,ry=.11,rx=.06)
    a.box('laundry',0,.73,-.45,.44,.24,.54,col=0xb1ab8b,r=.035)
    bar(a,'iron_black',(-.43,.61,-.87),(.43,.61,-.87),.018,6,0x98907b)


def rubbish_cart(v):
    a=v.body;l=v.lod;r=.28;tile=v.cat['paintTile']
    v.wheel('left',-.49,r,-.18,r,.12);v.wheel('right',.49,r,-.18,r,.12)
    a.hcyl('iron_black',0,r,-.18,.026,1.06,n=4 if l else 8,col=0x959382)
    # A hollow tapered hopper, with individually warped/dented steel panels.
    rings=[(.37,.37,.48),(.47,.48,1.25)]
    (w0,d0,y0),(w1,d1,y1)=rings
    a.box('metal_dark',0,y0,0,w0*2,.04,d0*2,col=0x98937e)
    for side in (-1,1):
        pts=[(side*w0,y0,-d0),(side*w0,y0,d0),(side*w1,y1,d1),(side*w1,y1,-d1)]
        if l:polygon(a,PAINT,pts,WHITE,(side,0,0))
        else:
            mid=(side*(w0+w1)/2-side*.035,(y0+y1)/2,-.02)
            for i in range(4):polygon(a,PAINT,[pts[i],pts[(i+1)%4],mid],WHITE,(side,0,0))
        a.box('iron_black',side*w1,y1,-.01,.028,.040,.99,col=0x9c9986)
    for side in (-1,1):
        polygon(a,PAINT,[(-w0,y0,side*d0),(w0,y0,side*d0),(w1,y1,side*d1),(-w1,y1,side*d1)],WHITE,(0,0,side))
        a.box('iron_black',0,y1,side*d1,.95,.040,.028,col=0xa19d88)
    for side in (-1,1):bar(a,'iron_black',(side*.40,.75,.42),(side*.40,1.33,.81),.022,3 if l else 7,0xaaa28a)
    bar(a,'seat',(-.40,1.33,.81),(.40,1.33,.81),.026,3 if l else 8,0x9c9784)
    # Tied rubbish sacks; a far silhouette retains one load rather than emptying the cart.
    if l:
        a.sph('bag',0,1.15,0,.32,.36,.32,n=6,col=0x55594d)
        return
    for x,z,ry,col in [(-.21,-.18,.31,0x6f7361),(.19,.14,.29,0x9e9c80),(.14,-.23,.26,0x64695b)]:
        a.sph('bag',x,1.18,z,.21,ry,.21,n=14,col=col)
        a.tube('bag',[(x,1.18+ry*.85,z),(x+.015,1.18+ry+.045,z-.01)],.025,n=6,col=col)
    for side in (-1,1):
        patch(a,side*.435,.91,-.13,.36,.24,side,8,42+side)
        for y in (.55,1.17):
            for z in (-.32,.32):a.hcyl('chrome',side*(.37+(.47-.37)*(y-.48)/.77+.006),y,z,.012,.009,n=5,col=0x9d9b84)
    # Scraper tucked inside; no ground penetration or projection into the walking lane.
    bar(a,'wood_dark',(-.29,.79,.12),(-.26,1.53,-.24),.016,6,0xc3a578)
    a.box('metal_dark',-.28,.66,.16,.14,.17,.025,col=0x918e77,rx=-.25)
    paintbox(a,11,0,.91,-.439,.34,.15,.006)


BUILDERS={
    'vehicle_hatchback_a':lambda v:hatch(v,False),
    'vehicle_hatchback_b':lambda v:hatch(v,True),
    'vehicle_pickup':pickup,'vehicle_chiva':chiva,'vehicle_colectivo':colectivo,
    'vehicle_motorbike':motorbike,'vehicle_tricycle':tricycle,'vehicle_handcart':handcart,
    'vehicle_bicycle':bicycle,'vehicle_rubbish_cart':rubbish_cart,
}


def build(key,cat,lod):
    v=Vehicle(key+('_lod1' if lod else ''),cat,lod)
    BUILDERS[key](v)
    return v
