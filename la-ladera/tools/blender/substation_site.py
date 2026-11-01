"""Original UK and Colombian substation site kits, built on one equipment API.

The variants have distinct towers, poles, perimeter treatment and building
surfaces. Towers use short individual lattice members; long span conductors
are deliberately absent. All dimensions are modelling envelopes, not designs
certified for operating electrical equipment.
"""
import math

import furn_lib as L
from substation_common import Assembly, bar, bolt, cabinet, door, plate

CATALOGUE = {}


def register(variant, suffix, size, description, pivots=()):
    key=f'substation_{variant}_{suffix}'
    CATALOGUE[key]={'family':suffix,'shared':False,'variant':variant,'size':size,
                    'footprint':[size[0],size[2]],'pivots':list(pivots),
                    'description':description,'origin':'floor-centre'}


for variant in ('uk','co'):
    uk=variant=='uk'
    register(variant,'tower_suspension',[10 if uk else 9.2,32 if uk else 30,6 if uk else 5.4],
             'Double-circuit lattice suspension tower with three crossarm levels, six pendant strings, earth-wire peak and concrete shoes.')
    register(variant,'tower_tension',[11.6 if uk else 10.8,34 if uk else 32,6.8 if uk else 6.4],
             'Double-circuit lattice tension/terminal tower with broad braced crossarms and six near-horizontal tension strings.')
    register(variant,'pole_mv',[5,13 if uk else 14,1.2],
             'Wooden H-pole with steel crossarm and porcelain pin insulators.' if uk else 'Twin concrete H-pole with steel crossarms, insulators and humid weathering.')
    register(variant,'pole_lv',[2.4,10 if uk else 11.5,.65],
             'Wooden distribution pole with steel crossarm and three pin insulators.' if uk else 'Round tapered concrete distribution pole with crossarm and three porcelain pin insulators.')
    register(variant,'fence_panel',[2.5,2.7,.18 if uk else .30],
             'Green steel palisade panel with pointed anti-climb tips.' if uk else 'Galvanised chain-link diamond mesh over a low algae-marked concrete plinth.')
    register(variant,'fence_post',[.18 if uk else .22,2.9,.18 if uk else .22],
             'Capped green steel perimeter post.' if uk else 'Concrete perimeter post with galvanized fence clips.')
    register(variant,'outrigger',[.16,.65,.55],
             'Outward anti-climb arm and three short wire attachments.' if uk else 'Galvanised outward barbed-wire arm with three barbed wire attachments.')
    register(variant,'gate',[4,2.8,.28],
             'Two-leaf palisade vehicle gate with independently hinged leaves and latch.' if uk else 'Two-leaf chain-link vehicle gate with independent hinges and a rusty centre latch.',
             ('gate_leaf_left','gate_leaf_right'))
    register(variant,'building_shell',[12,4,7],
             'Brick control-building shell with a real front door opening and two front window apertures.' if uk else 'Rendered-block control-building shell with open door/window apertures, patched render and base algae.')
    register(variant,'building_door',[1.5,2.4,.12],
             'Green louvred control-room steel door with hinge pivot, handle and individual ventilation slats.' if uk else 'Weathered grey louvred control-room steel door with hinge pivot and individual ventilation slats.',
             ('door_hinge',))
    register(variant,'louvre',[1.4,.8,.12],
             'Framed ventilation louvre with individual sloping metal slats.')
    register(variant,'window',[1.6,1.4,.12],
             'Control-room window with metal mullions, shallow glass pane and lower opening-light hinge.',('window_hinge',))
    register(variant,'roof',[12.4,.22,7.4],
             'Shallow flat concrete roof slab with edge flashing and separated roofing seams.')


def beam(a,mat,p,q,r=.035,lod=0):
    # Open-ended low-sided lattice members retain their small steel silhouette.
    n=3 if lod else 4
    a._emit(mat,L.tube_geo([p,q],r,n=n,caps=False))


def brick_box(a,x,y,z,w,h,d):
    """Tile masonry at a physical scale without out-of-atlas UV wrapping.

    The 120x248 useful texels hold two bricks across and eight courses high.
    Vertical faces repeat every roughly0.5x0.6m. The separate tiles share the
    same material/draw call; shallow wall caps need no dense tessellation.
    """
    lo=[x-w/2,y,z-d/2];hi=[x+w/2,y+h,z+d/2]
    positions=[];normals=[];uv=[];tris=[]
    for axis in range(3):
        others=[i for i in range(3) if i!=axis]
        uaxis=others[0] if axis==1 else (2 if axis==0 else 0)
        vaxis=others[1] if axis==1 else 1
        def breaks(start,end,period):
            return [start]+[i*period for i in range(math.floor(start/period)+1,math.ceil(end/period)) if start+1e-8<i*period<end-1e-8]+[end]
        uu=[lo[uaxis],hi[uaxis]] if axis==1 else breaks(lo[uaxis],hi[uaxis],.5)
        vv=[lo[vaxis],hi[vaxis]] if axis==1 else breaks(lo[vaxis],hi[vaxis],.6)
        for side in (-1,1):
            if axis==1 and side<0 and y<=.002:continue
            normal=tuple(side if i==axis else 0 for i in range(3))
            for iu in range(len(uu)-1):
                for iv in range(len(vv)-1):
                    points=[]
                    for du,dv in ((0,0),(1,0),(1,1),(0,1)):
                        p=[0.,0.,0.];p[axis]=lo[axis] if side<0 else hi[axis]
                        p[uaxis]=uu[iu+du]
                        p[vaxis]=vv[iv+dv]
                        points.append(tuple(p))
                    face=L._cross(L._sub(points[1],points[0]),L._sub(points[2],points[0]))
                    forward=sum(face[i]*normal[i] for i in range(3))>0
                    n=len(positions);positions.extend(points);normals.extend([normal]*4)
                    if axis==1:
                        uv.extend(((0,0),(1,0),(1,1),(0,1)))
                    else:
                        bu=math.floor((uu[iu]+uu[iu+1])/.5/2)*.5
                        bv=math.floor((vv[iv]+vv[iv+1])/.6/2)*.6
                        uv.extend((max(0,min(1,(uu[iu+du]-bu)/.5)),max(0,min(1,(vv[iv+dv]-bv)/.6))) for du,dv in ((0,0),(1,0),(1,1),(0,1)))
                    tris.extend(((n,n+1,n+2),(n,n+2,n+3)) if forward else ((n,n+2,n+1),(n,n+3,n+2)))
    a._emit('substation_brick',(positions,normals,uv,tris))


def pin_insulator(a,lod,h=.8,r=.18):
    mat='substation_porcelain_brown'
    if lod:
        a.cyl(mat,0,0,0,r*.72,h,n=6)
        return
    profile=[(0,0),(r*.45,0)]
    for i in range(5):
        y=h*i/5
        profile.extend([(r*.45,y),(r,y+h*.05),(r*.5,y+h*.11)])
    profile.extend([(r*.42,h),(0,h)])
    a.lathe(mat,0,0,0,profile,n=6,hero=True)


def tower(a,key,cat,lod):
    v=cat['variant'];uk=v=='uk';tension=cat['family']=='tower_tension'
    W,H,D=cat['size'];s=a.body
    # Four foundation shoes and a tapered square mast. Both tower designs have
    # proper cross-braced faces, changes in taper and an independent earth peak.
    levels=[0,H*.12,H*.26,H*.40,H*.55,H*.68,H*.81,H*.91]
    widths=[D*.44,D*.38,D*.30,D*.23,D*.17,D*.13,D*.10,D*.075]
    if not uk:
        levels=[0,H*.14,H*.29,H*.43,H*.56,H*.70,H*.83,H*.93]
        widths=[D*.44,D*.36,D*.29,D*.215,D*.16,D*.11,D*.075,D*.055]
    # Lattice legs start on the foundation shoes, not at their underside. This
    # preserves an exact ground plane for either polygonal cross-section LOD.
    levels[0]=.45
    if tension:widths=[w*1.04 for w in widths]
    for x in (-1,1):
        for z in (-1,1):
            s.box('substation_concrete_damp' if uk else 'substation_concrete_algae',x*widths[0],0,z*widths[0],.55,.45,.55)
    for j in range(len(levels)-1):
        y0,y1=levels[j],levels[j+1];r0,r1=widths[j],widths[j+1]
        for x in (-1,1):
            for z in (-1,1):
                beam(s,'substation_galvanised',(x*r0,y0,z*r0),(x*r1,y1,z*r1),.075 if j<3 else .055,lod)
        if not lod or j%2==0:
            for axis in (0,2):
                for side in (-1,1):
                    def point(sign,y,r):
                        return (side*r,y,sign*r) if axis==0 else (sign*r,y,side*r)
                    brace='substation_rusted_steel' if not uk and j<2 else 'substation_galvanised'
                    beam(s,brace,point(-1,y0,r0),point(1,y1,r1),.038,lod)
                    if not lod:
                        beam(s,'substation_galvanised',point(1,y0,r0),point(-1,y1,r1),.038,lod)
                        beam(s,'substation_galvanised',point(-1,y1,r1),point(1,y1,r1),.035,lod)
    # Stepped arms: terminal tower uses thicker triangular bracing and two webs.
    for tier,fraction in enumerate((.57,.73,.88)):
        y=H*fraction;reach=W*.49*(1-tier*.065)
        for side in (-1,1):
            for zz in (-.32,.32) if not lod and tension else (0,):
                beam(s,'substation_galvanised',(0,y,zz),(side*reach,y,zz),.075,lod)
                beam(s,'substation_galvanised',(0,y-2.0,zz),(side*reach,y,zz),.06,lod)
                if not lod:
                    beam(s,'substation_galvanised',(side*reach*.45,y-.9,zz),(side*reach*.62,y,zz),.035,lod)
            string=a.part(f'insulator_string_{tier}_{side}',(side*reach,y-.12,0),
                          rotation=(math.pi/2,0,0) if tension else (0,0,math.pi),
                          cache=f'tower-string-{lod}')
            if lod:
                string.cyl('substation_porcelain',0,0,0,.22,2.25,n=5)
            else:
                profile=[(.07,0)]
                for j in range(7):
                    profile.extend([(.075,j*.30),(.22,j*.30+.07),(.085,j*.30+.15)])
                profile.append((.075,2.25))
                string.lathe('substation_porcelain',0,0,0,profile,n=5,hero=True)
                beam(string,'substation_galvanised',(0,-.10,0),(0,.06,0),.06,1)
                beam(string,'substation_galvanised',(0,2.2,0),(0,2.35,0),.06,1)
    for side in (-1,1):
        beam(s,'substation_galvanised',(side*widths[-1],levels[-1],0),(0,H,0),.045,lod)
    if not lod:
        # Ladder pegs remain on the steel mast, never continuous tower cables.
        for j in range(20):
            y=.7+j*.64
            beam(s,'substation_steel_dark',(-.15,y,-D*.17),(.15,y,-D*.17),.018,1)


def pole(a,key,cat,lod):
    uk=cat['variant']=='uk';mv=cat['family']=='pole_mv';W,H,D=cat['size'];s=a.body
    wood='substation_wood' if uk else 'substation_concrete_algae'
    positions=(-1.65,1.65) if mv else (0,)
    pole_top=H-1.05
    for x in positions:
        p=a.part(f'pole_shaft_{x}',(x,0,0),cache=f'{cat["variant"]}-{cat["family"]}-shaft-{lod}')
        p.cyl(wood,0,0,0,.19 if mv else .18,pole_top,n=7 if lod else 12,r1=.13 if uk else .11)
        if not lod:
            for y in (.7,1.5,pole_top-1.3,pole_top-.6):
                p.cyl('substation_galvanised',0,y,0,.195 if mv else .185,.05,n=8)
            if not uk:
                for y in (2,3,4,5,6):
                    p.hcyl('substation_dark',0,y,.18,.035,.02,axis='z',n=6)
    s.box('substation_galvanised',0,pole_top-.3,0,W,.16,.20)
    if mv:
        beam(s,'substation_galvanised',(-1.65,pole_top-2,0),(1.65,pole_top-.25,0),.045,lod)
        if not lod:beam(s,'substation_galvanised',(1.65,pole_top-2,0),(-1.65,pole_top-.25,0),.045,lod)
    for i,x in enumerate((-W*.4,0,W*.4)):
        ins=a.part(f'pin_insulator_{i}',(x,pole_top-.12,0),cache=f'pole-pin-{lod}')
        pin_insulator(ins,lod,1.05,.17)
        if not lod:
            ins.cyl('substation_galvanised',0,1.02,0,.07,.03,n=6)
    if not lod:
        for x in positions:
            beam(s,'substation_copper',(x+.13,.10,.1),(x+.13,pole_top,.1),.009,1)
            for y in (1.5,1.9,2.3):
                beam(s,'substation_galvanised',(x-.25,y,0),(x+.25,y,0),.016,1)
        # Solid steel mounting brackets make each asset's depth deliberate.
        for x in positions:
            s.box('substation_galvanised',x,pole_top-.38,0,.11,.30,D)
    else:s.box('substation_galvanised',0,pole_top-.38,0,.11,.3,D)


def palisade(s,w,h,lod):
    mat='substation_fence_green'
    for y in (.24,h*.58):s.box(mat,w/2,y,0,w,.09,.06)
    count=7 if lod else max(8,int(w/.105))
    for i in range(count):
        x=.04+(w-.08)*i/(count-1)
        s.box(mat,x,0,0,.045,h if lod else h-.13,.055)
        if not lod:
            pts=[(x-.022,h-.13,-.027),(x+.022,h-.13,-.027),(x,h,-.027),
                 (x-.022,h-.13,.027),(x+.022,h-.13,.027),(x,h,.027)]
            faces=[(0,2,1),(3,4,5),(0,1,4),(0,4,3),(0,3,5),(0,5,2),(1,2,5),(1,5,4)]
            # The triangular cap has five different face normals. Keep each
            # face's vertices separate: a single front normal would make the
            # two sloping edges shade incorrectly and violate winding checks.
            pp=[];nn=[];uv=[];tris=[]
            for face in faces:
                p0,p1,p2=[pts[i] for i in face]
                normal=L._unit(L._cross(L._sub(p1,p0),L._sub(p2,p0)))
                n=len(pp);pp.extend((p0,p1,p2));nn.extend((normal,normal,normal))
                uv.extend(((0,0),(1,0),(.5,1)));tris.append((n,n+1,n+2))
            s._emit(mat,(pp,nn,uv,tris))


def mesh_fence(s,w,h,lod):
    steel='substation_galvanised'
    for x in (0,w):s.box(steel,x,0,0,.045,h,.045)
    for y in (.04,h-.06):s.box(steel,w/2,y,0,w,.04,.045)
    spacing=.9 if lod else .14
    # Clip ±45-degree wire runs to the rectangular infill, leaving open diamonds.
    for direction in (-1,1):
        count=int((w+h)/spacing)+1
        for j in range(count):
            c=(-w if direction>0 else 0)+j*spacing
            points=[]
            for x in (0,w):
                y=direction*x+c
                if 0<=y<=h:points.append((x,y,0))
            for y in (0,h):
                x=(y-c)/direction
                if 0<=x<=w:points.append((x,y,0))
            if len(points)>=2 and points[0]!=points[1]:
                points=[(max(.012,min(w-.012,p[0])),max(.012,min(h-.012,p[1])),p[2]) for p in points]
                beam(s,steel,points[0],points[1],.009 if not lod else .013,1)


def fence(a,key,cat,lod):
    uk=cat['variant']=='uk';w,h,d=cat['size'];s=a.body
    if cat['family']=='fence_panel':
        if uk:
            p=a.part('panel',(-w/2,0,0),cache=f'uk-palisade-{lod}')
            palisade(p,w,h,lod)
            # End brackets give the stated depth without oversized rods.
            for x in (-w/2+.03,w/2-.03):s.box('substation_galvanised',x,.25,0,.08,.12,d)
        else:
            s.box('substation_concrete_algae',0,0,0,w,.30,d)
            p=a.part('panel',(-w/2,.3,0),cache=f'co-chainlink-{lod}')
            mesh_fence(p,w,h-.3,lod)
    elif cat['family']=='fence_post':
        material='substation_fence_green' if uk else 'substation_concrete_damp'
        s.box(material,0,0,0,w*.85,h-.06,d*.85,r=.018 if not lod else 0)
        s.box('substation_galvanised',0,h-.06,0,w,.06,d)
        s.box('substation_galvanised' if uk else 'substation_concrete_clean',0,0,0,w,.04,d)
        if not lod:
            for y in (.3,1.5,2.5):
                s.box('substation_galvanised',0,y,d*.35,w,.04,.06)
    elif cat['family']=='outrigger':
        s.box('substation_galvanised',0,0,-.18,w,.08,.12)
        beam(s,'substation_galvanised',(0,.03,-.20),(0,h,.25),.035,lod)
        for i in range(1 if lod else 3):
            y=.25+i*.16;z=-.20+y/h*.45
            beam(s,'substation_galvanised',(-w*.5,y,z),(w*.5,y,z),.009,1)
            if not lod and not uk:
                beam(s,'substation_rusted_steel',(-.05,y-.04,z-.02),(.05,y+.04,z+.02),.006,1)
        if not lod:
            for x in (-.045,.045):
                s.hcyl('substation_galvanised',x,.04,-.245,.018,.018,axis='z',n=6)
    else:
        # Each half has a local hinge frame at the corresponding side post.
        for code,side in (('left',-1),('right',1)):
            p=a.part('gate_leaf_'+code,(side*w/2,.08,0))
            if side>0:
                # Mesh local x is negative on the right leaf. A rotation about
                # local Y remains a true hinge about the same outside edge.
                p=a.parts[-1]['surface']
            leafw=w/2-.04
            if uk:palisade(p,leafw,h-.08,lod)
            else:mesh_fence(p,leafw,h-.08,lod)
            if side>0:
                for g in p.groups.values():
                    g.P=[(-x,y,z) for x,y,z in g.P]
                    g.N=[(-x,y,z) for x,y,z in g.N]
                    g.I=[(i,k,j) for i,j,k in g.I]
            for y in (.18,h-.30):
                p.cyl('substation_galvanised',0,y,0,.055,.12,n=4 if lod else 8)
        # Flush latch is fixed to the left gate leaf (opening moves it too).
        left=a.parts[0]['surface']
        left.box('substation_rusted_steel' if not uk else 'substation_galvanised',w/2-.06,1.30,.08,.12,.05,.16)
        if not lod:
            left.hcyl('substation_dark',w/2-.05,1.20,.11,.035,.08,axis='z',n=6)


def shell(a,key,cat,lod):
    uk=cat['variant']=='uk';s=a.body
    mat='substation_brick' if uk else 'substation_rendered_block'
    w,h,d=cat['size'];thick=.22
    def wall(x,y,z,ww,hh,dd):
        if uk and not lod:brick_box(s,x,y,z,ww,hh,dd)
        else:s.box(mat,x,y,z,ww,hh,dd)
    wall(0,0,-d/2+thick/2,w,h,thick)
    for x in (-w/2+thick/2,w/2-thick/2):wall(x,0,0,thick,h,d)
    # Two 1.6m windows at x±3.5 and one 1.5m central door.
    for side in (-1,1):
        x=side*3.375
        wall(x,0,d/2-thick/2,5.25,1.2,thick)
        wall(x,2.6,d/2-thick/2,5.25,h-2.6,thick)
        spans=[(-6,-4.3),(-2.7,-.75)] if side<0 else [(.75,2.7),(4.3,6)]
        for lo,hi in spans:wall((lo+hi)/2,1.2,d/2-thick/2,hi-lo,1.4,thick)
    wall(0,2.4,d/2-thick/2,1.5,h-2.4,thick)
    if not lod:
        # Plinth, lintels and corner pilasters; no fictitious manufacturer mark.
        for x in (-5.85,5.85):
            s.box('substation_concrete_damp' if uk else 'substation_concrete_algae',x,0,d/2-.10,.26,h,.20)
        for x in (-3.5,3.5):
            s.box('substation_concrete_clean',x,1.13,d/2-.11,1.8,.10,.22)
            s.box('substation_concrete_damp',x,2.6,d/2-.06,1.85,.12,.18)
            for side in (-1,1):
                s.box('substation_concrete_clean',x+side*.84,1.15,d/2-.08,.08,1.5,.16)
        for x in (-.79,.79):s.box('substation_concrete_clean',x,0,d/2-.08,.08,2.48,.16)
        s.box('substation_concrete_clean',0,2.4,d/2-.08,1.66,.08,.16)
        # Exterior service conduit turns into the wall above the door lintel.
        for p,q in [((2,0,3.38),(2,3.05,3.38)),((2,3.05,3.38),(.4,3.05,3.38)),((.4,3.05,3.38),(.4,2.8,3.38))]:
            beam(s,'substation_galvanised',p,q,.018,1)
        s.box('substation_galvanised',0,h-.15,-d/2+.06,w,.09,.12)
        s.cyl('substation_galvanised',-w/2+.12,.05,-d/2+.08,.045,h-.16,n=8)
        if not uk:
            for x in (-4.7,-2.1,2.2,4.8):
                s.box('substation_concrete_algae',x,.015,d/2-.001,.4,.32,.016)
        else:
            s.box('substation_moss',0,.01,-d/2+.12,w,.11,.015)


def building_piece(a,key,cat,lod):
    uk=cat['variant']=='uk';w,h,d=cat['size'];s=a.body;kind=cat['family']
    paint='substation_fence_green' if uk else 'substation_paint_peeling'
    if kind=='building_door':
        p=a.part('door_hinge',(-w/2,0,0))
        p.box(paint,w/2,0,0,w,h,.06)
        for i in range(3 if lod else 17):
            y=.20+i*((h-.4)/(3 if lod else 17))
            p.box('substation_steel_dark',w/2,y,.033,w*.78,.045,.035,rx=.18)
        if not lod:
            p.box('substation_galvanised',w-.10,1.05,.05,.045,.22,.07)
            for y in (.15,h-.25):p.cyl('substation_galvanised',0,y,0,.035,.12,n=8)
        else:
            p.box('substation_galvanised',w-.10,1.05,.05,.045,.22,.07)
            for y in (.15,h-.25):p.cyl('substation_galvanised',0,y,0,.035,.12,n=4)
    elif kind=='louvre':
        if not lod:
            for x in (-w/2+.03,w/2-.03):s.box(paint,x,0,0,.06,h,d)
            for y in (0,h-.06):s.box(paint,0,y,0,w,.06,d)
        else:s.box(paint,0,0,-d/3,w,h,.035)
        for i in range(2 if lod else 9):
            y=.08+i*((h-.16)/(2 if lod else 9))
            s.box(paint,0,y,.01,w-.10,.045,.10,rx=.23)
    elif kind=='window':
        # Window is opening glazing under a top hinge, not a floating plane.
        p=a.part('window_hinge',(0,h,0))
        p.box('substation_glass',0,-h,0,w,h,.028 if not lod else d)
        if not lod:
            for x in (-w/2+.025,w/2-.025):p.box('substation_galvanised',x,-h,0,.05,h,d)
            for y in (-h,-.05):p.box('substation_galvanised',0,y,0,w,.05,d)
            p.box('substation_galvanised',0,-h*.55,0,w,.035,d)
            p.box('substation_galvanised',0,-h*.94,.055,.12,.025,.01)
    elif kind=='roof':
        s.box('substation_roof',0,0,0,w,h,d)
        if not lod:
            for x in (-w/2+.04,w/2-.04):s.box('substation_galvanised',x,h-.02,0,.08,.02,d)
            for z in (-d/2+.04,d/2-.04):s.box('substation_galvanised',0,h-.02,z,w,.02,.08)
            for i in range(1,10):s.box('substation_steel_dark',-w/2+i*w/10,h-.01,0,.02,.01,d-.15)
            if not uk:
                for x in (-w*.35,w*.35):s.box('substation_concrete_algae',x,h-.01,-d*.35,1.1,.01,.8)


def build(key,cat,lod):
    a=Assembly(key,cat,lod)
    family=cat['family']
    if family.startswith('tower'):tower(a,key,cat,lod)
    elif family.startswith('pole'):pole(a,key,cat,lod)
    elif family in ('fence_panel','fence_post','outrigger','gate'):fence(a,key,cat,lod)
    elif family=='building_shell':shell(a,key,cat,lod)
    else:building_piece(a,key,cat,lod)
    return a


def line_anchors(key,cat):
    """Conductor endpoints from the same near geometry's exact normalization.

    These are local game-frame positions, including real pendant/tension
    string lengths. No runtime consumer needs to infer them from nominal arms.
    """
    a=build(key,cat,0);lo,hi=a.bounds()
    scale=[cat['size'][i]/(hi[i]-lo[i]) for i in range(3)]
    offset=[-.5*(lo[0]+hi[0])*scale[0],-lo[1]*scale[1],-.5*(lo[2]+hi[2])*scale[2]]
    result=[]
    for part in a.parts:
        name=part['name']
        if name.startswith('insulator_string_'):
            _,_,phase,side=name.split('_')
            circuit=0 if int(side)<0 else 1;phase=int(phase);local=(0,2.35,0)
        elif name.startswith('pin_insulator_'):
            circuit=0;phase=int(name.rsplit('_',1)[1]);local=(0,1.05,0)
        else:continue
        rotation=L._rotm(*part['rotation']);rotated=L._apply(rotation,local)
        pos=[(rotated[i]+part['position'][i])*scale[i]+offset[i] for i in range(3)]
        result.append({'name':f'line_c{circuit+1}_p{phase+1}','circuit':circuit,'phase':phase,
                       'position':[round(v,8) for v in pos],'sourcePivot':name})
    return sorted(result,key=lambda p:(p['circuit'],p['phase']))


for _key,_cat in CATALOGUE.items():
    if _cat['family'].startswith(('tower','pole')):
        _cat['lineAnchors']=line_anchors(_key,_cat)
