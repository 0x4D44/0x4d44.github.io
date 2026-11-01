"""Original, metre-scale coastal craft; game coordinates are +Y up / +Z bow.

Near meshes retain open cockpits and hulls. Far meshes are authored separately;
no decimator can accidentally close a cockpit or detach an outboard pivot.
"""
import math
import watersports_common as W


def metadata(family, size, *, floating=False, draft=0, bob=0, rock=0, anchors=None, pivots=None, description=''):
    return dict(family=family, size=list(size), origin='waterline-centre' if floating else 'floor-centre',
                floating=floating, draftDepth=draft, bobAmplitude=bob,
                rockAmplitudeDeg=rock, anchors=anchors or {}, pivots=pivots or [],
                description=description)


CATALOG = {
    'watersports_kayak_single': metadata('boats', (.75, .48, 3.40), floating=True, draft=.17, bob=.025, rock=3,
        anchors={'seat':[0,.05,-.18], 'feet': [[-.13,-.04,.29],[.13,-.04,.29]],
                 'hands':[[-.38,.38,.04],[.38,.38,.04]]},
        description='Single sea kayak with recessed open cockpit, seat, deck cords and pointed ends.'),
    'watersports_kayak_double': metadata('boats', (.86, .51, 4.60), floating=True, draft=.19, bob=.03, rock=3,
        anchors={'seats':[[0,.05,-.85],[0,.05,.65]],
                 'feet':[[-.13,-.04,-.38],[.13,-.04,-.38],[-.13,-.04,1.12],[.13,-.04,1.12]],
                 'hands':[[-.38,.38,-.63],[.38,.38,-.63],[-.38,.38,.87],[.38,.38,.87]]},
        description='Tandem sea kayak with two separated open cockpits, backrests and deck lashing.'),
    'watersports_rowing_boat': metadata('boats', (1.36,.72,3.60), floating=True, draft=.24, bob=.04, rock=4,
        anchors={'seat':[0,.225,-.23], 'feet':[[-.19,-.10,.28],[.19,-.10,.28]],
                 'hands':[[-.62,.43,-.25],[.62,.43,-.25]], 'oarlocks':[[-.67,.43,-.25],[.67,.43,-.25]]},
        description='Open wooden rowing dinghy with three thwarts, keel, ribs and paired oarlocks.'),
    'watersports_lancha': metadata('boats', (2.10,1.60,7.00), floating=True, draft=.38, bob=.035, rock=3,
        anchors={'stand':[0,.10,-.38], 'feet':[[-.19,.10,-.38],[.19,.10,-.38]],
                 'hands':[[-.15,.96,.20],[.15,.96,.20]], 'seats':[[0,.39,-1.65],[0,.39,1.30]],
                 'moorBow':[0,.62,3.18], 'moorStern':[.82,.55,-2.78]},
        pivots=[{'id':'outboard','position':[0,.43,-3.11],'axis':[0,1,0]},
                {'id':'propeller','position':[0,-.63,-.28],'axis':[0,0,1],'parent':'outboard'}],
        description='Seven-metre fibreglass fishing lancha: sheer bow, open working deck, console, screen and articulated outboard.'),
    'watersports_oar': metadata('boats', (.18,.065,2.10),
        anchors={'hands':[[0,.033,-.53],[0,.033,-.18]]},
        description='Full-length wooden oar with a shaped blade, leather collar and round grip.'),
    'watersports_anchor': metadata('boats', (.56,.67,.28),
        anchors={'ropeEye':[0,.64,0]}, description='Small iron fluke anchor with stock, crown and shackle eye.'),
    'watersports_rope_coil': metadata('boats', (.68,.09,.68),
        anchors={'ropeEnd':[.30,.035,.15]}, description='Three turns of weathered mooring rope with a loose tail.'),
    'watersports_lifebuoy': metadata('boats', (.76,.14,.76), floating=True, draft=.055, bob=.04, rock=5,
        anchors={'hands':[[-.31,.03,0],[.31,.03,0]]},
        description='Orange rescue ring with four white reflective bands and an outer grab rope.'),
}
for key, name, tile in [('maria_del_mar','Maria del Mar','maria_del_mar'),
                        ('la_esperanza','La Esperanza','la_esperanza'),
                        ('san_pedro','San Pedro','san_pedro'),
                        ('brisa','Brisa','brisa')]:
    c = metadata('boats', (1.80,.90,5.50),
        anchors={'stand':[0,.26,-.30], 'feet':[[-.18,.26,-.30],[.18,.26,-.30]],
                 'hands':[[-.48,.68,-.3],[.48,.68,-.3]], 'moorBow':[0,.86,2.50]},
        description=f'Beached, open planked fishing boat with painted transom name {name}.')
    c.update(nameText=name, nameTile=tile)
    CATALOG['watersports_wooden_boat_'+key] = c


def box(a,tile,x,y,z,w,h,d,**kw):
    W.box(a,tile,x,y,z,w,h,d,**kw)


def poly(a,points,tile='wood',normal=None,uv=None,mat=None):
    W.poly(a,points,tile=tile,normal=normal,uv=uv,mat=mat)


def bar(a,tile,p,q,r=.015,n=6):
    W.bar(a,p,q,r=r,n=n,tile=tile)


def hull(a,w,d,keel,rim,lod,outer='boat_hull',inner='white',stern=None):
    """Open, double-walled five-chine hull; a transom, not a closed ellipsoid."""
    zz = [-.5,-.38,-.22,0,.20,.36,.46,.5] if not lod else [-.5,-.2,.25,.5]
    widths = [.72,.92,1,1,.92,.68,.35,.035] if not lod else [.72,1,.86,.035]
    sections=[]
    for section_index,(t,k) in enumerate(zip(zz,widths)):
        z=d*t
        if stern is not None: z=stern+(t+.5)*d
        ww=w*.5*k
        sheer = .08*(abs(t)*2)**3
        bottom = keel + .16*(abs(t)*2)**4
        yy=rim+sheer
        outside=[(-ww,yy,z),(-ww*.76,bottom+.10,z),(0,bottom,z),(ww*.76,bottom+.10,z),(ww,yy,z)]
        # A transom has physical thickness. Opposing caps at the same Z would
        # self-intersect in ray tracing and z-fight in the game renderer.
        inner_z=z+(.05 if section_index==0 else -.05 if section_index==len(zz)-1 else 0)
        inside=[(-max(.008,ww-.045),yy-.025,inner_z),(-max(.005,ww*.76-.045),bottom+.16,inner_z),
                (0,bottom+.065,inner_z),(max(.005,ww*.76-.045),bottom+.16,inner_z),(max(.008,ww-.045),yy-.025,inner_z)]
        sections.append((outside,inside))
    for j in range(len(sections)-1):
        outer0,inner0=sections[j];outer1,inner1=sections[j+1]
        for i in range(4):
            pts=[outer0[i+1],outer1[i+1],outer1[i],outer0[i]]
            # The painted waterline follows height, independent of each chine's
            # dominant normal; box projection would put it along the boat.
            uv=[((p[2]-(stern if stern is not None else -d/2))/d,
                 (p[1]-keel)/(rim+.08-keel)) for p in pts] if outer=='boat_hull' else None
            poly(a,pts,outer,uv=uv)
            if not lod: poly(a,[inner0[i],inner1[i],inner1[i+1],inner0[i+1]],inner)
        for i in (0,4):
            poly(a,[outer0[i],inner0[i],inner1[i],outer1[i]],'wood_dark' if outer=='wood' else 'white',normal=(0,1,0))
    # Stern and bow close the shell, but leave its interior exposed from above.
    for idx in (0,len(sections)-1):
        oo,ii=sections[idx]
        poly(a,oo,outer,normal=(0,0,-1 if idx==0 else 1))
        if not lod:
            poly(a,list(reversed(ii)),inner,normal=(0,0,1 if idx==0 else -1))
            poly(a,[oo[0],oo[4],ii[4],ii[0]],'wood_dark' if outer=='wood' else 'white',normal=(0,1,0))
    # Gunwales are prominent at a standing person's eye height.
    if not lod:
        for side in (0,4):
            a.tile='wood_dark' if outer=='wood' else 'white'
            a.tube(W.MAT,[s[0][side] for s in sections],.022,n=5)
    return sections


def kayak(m):
    a=m.body;double=m.key.startswith('watersports_kayak_double');w=.86 if double else .75;d=4.6 if double else 3.4
    keel=-.19 if double else -.17;top=.26 if double else .25
    n=16 if not m.lod else 6
    zs=[-d/2+d*i/n for i in range(n+1)]
    def width(z): return .018+(w*.5-.018)*math.sin(math.pi*(z/d+.5))**.62
    # The chine surface is continuous beneath both cockpits.
    rings=[]
    for z in zs:
        ww=width(z);rise=.08*(abs(z)/(d*.5))**4
        rings.append([(-ww,top-.025,z),(-ww*.66,keel+.08+rise,z),(0,keel+rise,z),(ww*.66,keel+.08+rise,z),(ww,top-.025,z)])
    for j in range(n):
        for k in range(4):poly(a,[rings[j][k+1],rings[j+1][k+1],rings[j+1][k],rings[j][k]],'teal' if double else 'yellow')
    for j in (0,n):poly(a,rings[j],'teal' if double else 'yellow',normal=(0,0,-1 if j==0 else 1))
    centers=[-.85,.65] if double else [-.18]
    def opening(z):
        return max([.25*math.sqrt(max(0,1-((z-c)/.60)**2)) for c in centers])
    for j in range(n):
        za,zb=zs[j:j+2];ha,hb=opening(za),opening(zb)
        for sign in (-1,1):
            poly(a,[(sign*ha,top,za),(sign*width(za),top-.025,za),
                    (sign*width(zb),top-.025,zb),(sign*hb,top,zb)],'teal' if double else 'yellow',normal=(0,1,0))
        if ha==0 and hb==0:
            poly(a,[(-width(za),top-.025,za),(width(za),top-.025,za),(width(zb),top-.025,zb),(-width(zb),top-.025,zb)],'teal' if double else 'yellow',normal=(0,1,0))
    for c in centers:
        box(a,'rubber',0,-.015,c,.40,.065,.43)
        box(a,'rubber',0,.03,c-.23,.39,.28,.055)
        if not m.lod:
            a.tile='rubber'
            pts=[(.25*math.cos(t*math.tau/16),top+.014,c+.6*math.sin(t*math.tau/16)) for t in range(17)]
            a.tube(W.MAT,pts,.018,n=4,caps=False)
            box(a,'rubber',0,-.08,c+.47,.32,.04,.06)
    if not m.lod:
        for end in (-1,1):
            for i in range(3):
                z=end*(d*.5-.38-i*.18);wid=width(z)*.70
                bar(a,'rubber',(-wid,top+.008,z),(.8*wid,top+.008,z+end*.12),.007,n=4)
        bar(a,'rubber',(-.11,top-.015,d/2-.12),(.11,top-.015,d/2-.12),.012,n=4)
        bar(a,'rubber',(-.11,top-.015,-d/2+.12),(.11,top-.015,-d/2+.12),.012,n=4)


def rowing(m):
    a=m.body;hull(a,1.36,3.6,-.24,.40,m.lod,'wood','wood')
    for z in (-1.10,-.23,.75):box(a,'wood',0,.17,z,1.02,.055,.23)
    box(a,'wood_dark',0,-.14,.28,.52,.04,.085)
    if not m.lod:
        for z in (-1.20,-.65,.05,.65,1.08):
            a.tile='wood_dark';a.tube(W.MAT,[(-.56,.35,z),(-.38,-.05,z),(0,-.14,z),(.38,-.05,z),(.56,.35,z)],.017,n=4)
        for x in (-.65,.65):
            bar(a,'steel',(x,.37,-.25),(x,.46,-.25),.016,n=4)
            a.tile='steel';a.tube(W.MAT,[(x-.045,.47,-.25),(x-.045,.42,-.25),(x+.045,.42,-.25),(x+.045,.47,-.25)],.010,n=4)


def steering_wheel(a,center,r=.16,lod=0):
    x,y,z=center
    if lod:
        bar(a,'rubber',(x-r,y,z),(x+r,y,z),.022,n=4);return
    a.tile='rubber';a.tube(W.MAT,[(x+r*math.cos(t*math.tau/12),y+r*math.sin(t*math.tau/12),z) for t in range(13)],.014,n=4,caps=False)
    for t in range(3):
        ang=t*math.tau/3;bar(a,'steel',(x,y,z),(x+r*math.cos(ang),y+r*math.sin(ang),z),.009,n=4)


def lancha(m):
    a=m.body;hull(a,2.1,6.5,-.38,.48,m.lod,'boat_hull','white',stern=-3.0)
    # Real working deck and lockers, without sealing the gunwales into a solid block.
    box(a,'deckpad',0,.065,-.30,1.48,.035,4.55)
    for z in (-1.65,1.30):
        box(a,'white',0,.11,z,1.62,.25,.40)
        box(a,'navy',0,.36,z,1.66,.055,.43)
    box(a,'white',0,.1,.39,.69,.66,.57)
    poly(a,[(-.36,.76,.09),(.36,.76,.09),(.36,.92,.65),(-.36,.92,.65)],'navy',normal=(0,1,0))
    # Windshield remains a separate clear material surface.
    poly(a,[(-.36,.92,.65),(.36,.92,.65),(.32,1.22,.72),(-.32,1.22,.72)],'glass',mat=W.GLASS)
    if not m.lod:
        for x in (-.35,.35):bar(a,'steel',(x,.9,.65),(x*.91,1.22,.72),.014,n=4)
        bar(a,'steel',(-.32,1.22,.72),(.32,1.22,.72),.014,n=4)
        steering_wheel(a,(0,.96,.20),.155)
        box(a,'rubber',.18,.79,.24,.12,.04,.09)
        for x in (-.88,.88):
            bar(a,'steel',(x,.53,1.50),(x*.55,.73,2.66),.016,n=5)
            bar(a,'steel',(x,.53,-2.25),(x,.80,-2.25),.016,n=5)
            bar(a,'steel',(x,.80,-2.25),(x,.80,-1.80),.016,n=5)
        # Four ribbed catch-boxes and small gunwale cleats.
        for x in (-.57,.57):
            box(a,'teal',x,.11,-.85,.40,.25,.55)
            box(a,'white',x,.36,-.85,.43,.025,.58)
        for x in (-.82,.82):
            bar(a,'steel',(x-.08,.55,-2.78),(x+.08,.55,-2.78),.018,n=4)
    else: steering_wheel(a,(0,.96,.20),.155,1)
    motor=m.part('outboard',position=(0,.43,-3.11),axis=(0,1,0))
    box(motor,'navy',0,-.02,-.15,.42,.39,.48,r=.035 if not m.lod else 0)
    box(motor,'steel',0,-.57,-.16,.12,.57,.13)
    box(motor,'steel',0,-.67,-.20,.12,.15,.36)
    box(motor,'rubber',0,-.05,.18,.28,.07,.20)
    if not m.lod:
        for yy in (.05,.12,.19):box(motor,'rubber',0,yy,-.395,.28,.015,.005)
    prop=m.part('propeller',position=(0,-.63,-.28),axis=(0,0,1),parent='outboard')
    for i in range(3):
        t=i*math.tau/3
        p=[(.035*math.cos(t),.035*math.sin(t),0),
           (.145*math.cos(t+.32),.145*math.sin(t+.32),.025),
           (.155*math.cos(t+.77),.155*math.sin(t+.77),.005),
           (.045*math.cos(t+.6),.045*math.sin(t+.6),-.012)]
        poly(prop,p,'steel')
    # A small skeg remains below the propeller to show the motor is a marine unit.
    if not m.lod:poly(motor,[(-.04,-.61,-.11),(.04,-.61,-.11),(0,-.80,-.13)],'steel')


def wooden(m):
    a=m.body;hull(a,1.8,5.5,0,.82,m.lod,'wood','wood')
    box(a,'wood_dark',0,.03,0,.055,.045,4.9)
    for z in (-1.45,-.20,1.25):box(a,'wood',0,.43,z,1.33,.065,.30)
    if not m.lod:
        # Interior ribs and floorboards make the construction readable at 0.8 m.
        for z in (-1.8,-1.2,-.6,0,.6,1.2,1.8):
            a.tile='wood_dark';a.tube(W.MAT,[(-.68,.73,z),(-.48,.20,z),(0,.11,z),(.48,.20,z),(.68,.73,z)],.025,n=4)
        for x in (-.4,-.2,0,.2,.4):box(a,'wood',x,.235,-.15,.175,.025,3.9)
        for side in (-1,1):
            for y in (.30,.51,.71):
                bar(a,'navy',(side*.80,y,-1.90),(side*.85,y,1.20),.009,n=3)
        bar(a,'rope',(-.35,.52,-1.48),(.35,.52,-1.48),.022,n=4)
    # Local front of the boat is +Z; a transom name is read from behind, at -Z.
    label=W.Surface(m.key+'-transom-name',m.cat,tile=m.cat['nameTile'])
    # Crop the tile's lettering band rather than stretching its empty margins:
    # a 21 px glyph across a 33.6 px crop is approximately 9.4 cm high here.
    poly(label,[(-.53,.53,-2.751),(.53,.53,-2.751),(.53,.68,-2.751),(-.53,.68,-2.751)],
         m.cat['nameTile'],normal=(0,0,-1),uv=[(1,.44),(0,.44),(0,.58),(1,.58)],mat=W.ALPHA)
    m.instance('transom_name',(0,0,0),label)


def oar(m):
    a=m.body
    bar(a,'wood',(0,.0325,-1.05),(0,.0325,.49),.024,n=6 if not m.lod else 4)
    # Blade is tapered in outline and in cross section; not a rectangular paddle.
    outline=[(-.040,.40),(-.090,.62),(-.075,1.05),(.075,1.05),(.090,.62),(.040,.40)]
    upper=[(x,.052,z) for x,z in outline];lower=[(x,.012,z) for x,z in outline]
    poly(a,upper,'wood',normal=(0,1,0));poly(a,list(reversed(lower)),'wood',normal=(0,-1,0))
    if not m.lod:
        for i in range(len(outline)):
            j=(i+1)%len(outline);poly(a,[upper[i],lower[i],lower[j],upper[j]],'wood_dark')
        bar(a,'rubber',(0,.0325,-.14),(0,.0325,.02),.0325,n=6)
        bar(a,'wood_dark',(0,.0325,-1.05),(0,.0325,-.82),.026,n=6)


def anchor_geometry(a,lod=0,scale=1,tile=None):
    # Crown sits on the ground; stock and shank rise to a small line eye.
    s=scale
    bar(a,tile or 'rust',(0,.05*s,0),(0,.57*s,0),.028*s,n=5 if not lod else 3)
    bar(a,tile or 'steel',(-.28*s,.46*s,0),(.28*s,.46*s,0),.022*s,n=4 if not lod else 3)
    for sign in (-1,1):
        pts=[(0,.06*s,0),(sign*.16*s,.04*s,0),(sign*.25*s,.15*s,0)]
        a.tile=tile or 'rust';a.tube(W.MAT,pts,.024*s,n=4 if not lod else 3)
        poly(a,[(sign*.25*s,.13*s,-.14*s),(sign*.25*s,.13*s,.14*s),(sign*.11*s,.30*s,0)],
             tile or 'rust',normal=W.L._unit((sign*.17,.14,0)))
    if not lod:
        a.tile=tile or 'steel';a.tube(W.MAT,[(.049*s*math.cos(t*math.tau/10),(.61+.049*math.sin(t*math.tau/10))*s,0) for t in range(11)],.011*s,n=4,caps=False)
    else:
        poly(a,[(-.04*s,.57*s,0),(0,.67*s,0),(.04*s,.57*s,0)],tile or 'steel',normal=(0,0,1))
    # Put the crown on the sand in both discrete approximations; the radial
    # polygon changes its lowest point slightly when the far ring loses sides.
    low=min(p[1] for g in a.groups.values() for p in g.P)
    for g in a.groups.values():g.P=[(p[0],p[1]-low,p[2]) for p in g.P]
    a.lo[1]-=low;a.hi[1]-=low


def anchor(m):anchor_geometry(m.body,m.lod)


def rope_coil(m):
    a=m.body;a.tile='rope'
    n=48 if not m.lod else 14
    turns=2.7 if not m.lod else 1.6
    pts=[]
    for i in range(n+1):
        t=i/n;angle=t*math.tau*turns;r=.15+.16*t
        pts.append((math.cos(angle)*r,.045+.014*math.sin(angle),math.sin(angle)*r))
    a.tube(W.MAT,pts,.025,n=5 if not m.lod else 3,caps=True)
    if not m.lod:a.tube(W.MAT,[(.23,.045,.18),(.30,.035,.22),(.33,.028,.10)],.025,n=5)


def ring(a,major=.29,minor=.09,y=.035,lod=0,tile='orange',plane='xz'):
    # Four-sided minor ring far, six-sided near; two colours identify a lifebuoy.
    nn=20 if not lod else 8;mm=6 if not lod else 3
    for i in range(nn):
        th0=i*math.tau/nn;th1=(i+1)*math.tau/nn
        tt='white' if not lod and i%5==0 else tile
        for j in range(mm):
            pts=[]
            for th,ph in ((th0,j*math.tau/mm),(th1,j*math.tau/mm),(th1,(j+1)*math.tau/mm),(th0,(j+1)*math.tau/mm)):
                rr=major+minor*math.cos(ph)
                p=(rr*math.cos(th),y+minor*.72*math.sin(ph),rr*math.sin(th))
                if plane=='xy':p=(p[0],p[2]+major+minor,p[1])
                pts.append(p)
            # The torus is elliptical in its minor cross section. Explicit
            # outward normals keep the exterior visible with backface culling.
            tm=(th0+th1)/2;pm=(j+.5)*math.tau/mm
            normal=W.L._unit((math.cos(pm)*math.cos(tm),math.sin(pm)/.72,math.cos(pm)*math.sin(tm)))
            if plane=='xy':normal=(normal[0],normal[2],normal[1])
            poly(a,pts,tt,normal=normal)


def lifebuoy(m):
    a=m.body;ring(a,major=.29,minor=.09,y=.008,lod=m.lod,tile='orange')
    if not m.lod:
        a.tile='rope';a.tube(W.MAT,[(.367*math.cos(i*math.tau/24),.018,.367*math.sin(i*math.tau/24)) for i in range(25)],.008,n=4,caps=False)


BUILDERS = {
    'watersports_kayak_single':kayak, 'watersports_kayak_double':kayak,
    'watersports_rowing_boat':rowing, 'watersports_lancha':lancha,
    'watersports_oar':oar, 'watersports_anchor':anchor,
    'watersports_rope_coil':rope_coil, 'watersports_lifebuoy':lifebuoy,
}
for key in CATALOG:
    if key.startswith('watersports_wooden_boat_'):BUILDERS[key]=wooden
