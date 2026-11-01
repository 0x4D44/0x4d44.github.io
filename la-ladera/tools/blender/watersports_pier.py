"""Pier kit, swim boundary and shallow-water discoveries for the watersports set.

This is an asset library only. Coordinates and navigation polygons are local;
the future coast integrator chooses elevation and instances the kit in world.
"""
import math
import furn_lib as L
import watersports_common as W
from watersports_boats import metadata, box, poly, bar, anchor_geometry, ring


CATALOG = {
    'watersports_buoy': metadata('bay',(.50,.53,.50),floating=True,draft=.15,bob=.045,rock=6,
        anchors={'ropeEye':[0,.33,0]}, description='Simple high-visibility swim buoy, 60 triangles including its attachment peg.'),
    'watersports_bell_buoy': metadata('bay',(1.0,1.60,1.0),floating=True,draft=.28,bob=.05,rock=5,
        pivots=[{'id':'bell_clapper','position':[0,1.03,0],'axis':[0,0,1]}],
        anchors={'ropeEye':[0,-.22,0]}, description='Moored bell buoy with triangular open tower, suspended bell and moving clapper.'),
    'watersports_swimline_segment': metadata('bay',(3.024,.14,.18),floating=True,draft=.07,bob=.025,rock=2,
        anchors={'joinStart':[-1.5,0,0],'joinEnd':[1.5,0,0]},
        description='Three-metre swim-rope module with three mesh-instanced floats; repeat endpoints at 3 m spacing.'),
    'watersports_diving_raft': metadata('bay',(3.0,1.65,3.0),floating=True,draft=.90,bob=.035,rock=2,
        anchors={'stand':[0,.35,0], 'feet':[[-.18,.35,0],[.18,.35,0]],
                 'ladder':{'start':[0,-.85,1.45],'end':[0,.35,1.14]},
                 'navKeepOut':[[-1.5,-1.5],[1.5,-1.5],[1.5,1.5],[-1.5,1.5]]},
        description='Three-metre square timber diving raft on flotation drums, with shared deck planks and swim ladder.'),
    'watersports_sunken_moped': metadata('bay',(.62,1.10,1.72),
        pivots=[{'id':'wheel_front','position':[0,.26,.58],'axis':[1,0,0]},
                {'id':'wheel_rear','position':[0,.26,-.58],'axis':[1,0,0]}],
        anchors={'inspect':[.65,.55,0]}, description='Low-detail encrusted commuter moped dive target, with corroded frame, saddle and open wheels.'),
    'watersports_sunken_anchor_tyre': metadata('bay',(1.30,.67,.80),
        anchors={'inspect':[0,.45,.9]}, description='Encrusted anchor and discarded tyre together as a shallow-bay discovery.'),
    'watersports_pier_deck': metadata('pier',(3.0,.22,2.0),
        anchors={'stand':[0,.22,0], 'joinStart':[0,.22,-1],'joinEnd':[0,.22,1],
                 'navKeepOut':[[-1.5,-1],[1.5,-1],[1.5,1],[-1.5,1]]},
        description='Two-metre-long, three-metre-wide pier deck module: ten repeated planks over bearers.'),
    'watersports_pier_pile': metadata('pier',(.32,3.6,.32),
        anchors={'deckSeat':[0,3.6,0],'barnacleBand':[0,.72,0]},
        description='Low-cost timber pile with vertical grain and a barnacle band: 16 near triangles, six far.'),
    'watersports_pier_crossbrace': metadata('pier',(2.4,1.5,.16),
        anchors={'joinStart':[-1.16,.055,0],'joinEnd':[1.16,1.445,0]},
        description='Diagonal timber brace with iron end plates; pins between adjacent pile rows.'),
    'watersports_pier_handrail': metadata('pier',(2.0,.98,.14),
        anchors={'joinStart':[-1,0,0],'joinEnd':[1,0,0],
                 'navKeepOut':[[-1,-.06],[1,-.06],[1,.06],[-1,.06]]},
        description='Two-metre handrail bay with top rail, intermediate rail and two shared posts.'),
    'watersports_pier_post': metadata('pier',(.14,.98,.14),
        anchors={'railTop':[0,.91,0]}, description='Separate square pier railing post with a weathered cap and foot plate.'),
    'watersports_mooring_cleat': metadata('pier',(.36,.16,.14),
        anchors={'ropeEye':[0,.12,0]}, description='Galvanised two-horn mooring cleat with a bolted base.'),
    'watersports_pier_ladder': metadata('pier',(.66,3.0,.38),
        anchors={'ladder':{'start':[0,.15,.18],'end':[0,2.45,-.16]},
                 'hands':[[-.30,2.85,-.14],[.30,2.85,-.14]]},
        description='Galvanised water-access ladder with curved grab handles and eight non-slip rungs.'),
    'watersports_rod_holder': metadata('pier',(.13,.43,.16),
        anchors={'rodSocket':[0,.405,.045]}, description='Open tubular fishing-rod holder with a clamp and drain opening.'),
    'watersports_pier_lamp': metadata('pier',(.66,2.85,.66),
        anchors={'light':[0,2.60,.02]}, description='Weathered pier lamp with hood, protective cage, pale lens and timber mounting post.'),
    'watersports_bait_crate': metadata('pier',(.58,.34,.42),
        anchors={'carryHands':[[-.30,.25,0],[.30,.25,0]]},
        description='Open slatted bait crate with corner stiles, rope handles and a removable-looking lid rim.'),
    'watersports_pier_end_platform': metadata('pier',(4.0,1.20,3.0),
        anchors={'stand':[0,.22,0], 'joinStart':[0,.22,-1.5],
                 'ladder':{'start':[0,-1.0,1.62],'end':[0,.22,1.26]},
                 'navKeepOut':[[-2,-1.5],[2,-1.5],[2,1.5],[-2,1.5]]},
        description='Pier-head platform with repeated deck planks, outer rails and a central swim-ladder gap.'),
}
# Later water navigation can reserve the assembled pier from these local
# envelopes, including narrow supports rather than only the deck modules.
for cat in CATALOG.values():
    if cat['family']=='pier':
        w,_,d=cat['size']
        cat['anchors'].setdefault('navKeepOut',[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]])
CATALOG['watersports_diving_raft']['hullDraftDepth']=.30


def buoy(m):
    a=m.body;a.tile='orange'
    # 48 triangles in the closed twelve-segment float + 12 in its peg.
    a.lathe(W.MAT,0,0,0,[(0,-.15),(.25,-.03),(.23,.15),(0,.28)],n=12 if not m.lod else 4,hero=True)
    if not m.lod:
        a.tile='steel';a.cyl(W.MAT,0,.28,0,.012,.10,n=3)


def bell_buoy(m):
    a=m.body;a.tile='yellow'
    a.lathe(W.MAT,0,0,0,[(0,-.28),(.34,-.20),(.50,-.03),(.48,.13),(0,.20)],n=8 if not m.lod else 4,hero=True)
    if m.lod:
        for x in (-.23,.23):
            a.tile='steel';a.tube(W.MAT,[(x,.20,0),(0,1.27,0)],.025,n=3,caps=False)
        poly(a,[(-.25,1.27,0),(0,1.32,0),(.25,1.27,0)],'yellow')
        a.tile='rust';a.lathe(W.MAT,0,.82,0,[(.14,0),(.08,.18),(0,.21)],n=3,hero=True)
    else:
        for i in range(3):
            t=i*math.tau/3
            bar(a,'steel',(.32*math.cos(t),.18,.32*math.sin(t)),(.12*math.cos(t),1.22,.12*math.sin(t)),.023,n=3)
        a.tile='yellow';a.lathe(W.MAT,0,1.22,0,[(0,0),(.28,0),(0,.10)],n=6,hero=True)
        a.tile='rust';a.lathe(W.MAT,0,.79,0,[(.17,0),(.13,.03),(.075,.17),(0,.24)],n=6,hero=True)
        bar(a,'steel',(0,1.03,0),(0,1.22,0),.018,n=3)
    clapper=m.part('bell_clapper',position=(0,1.03,0),axis=(0,0,1))
    bar(clapper,'steel',(0,0,0),(0,-.24,0),.017,n=3)


def swimline(m):
    a=m.body
    if m.lod:
        a.tile='rope';a.tube(W.MAT,[(-1.5,0,0),(1.5,0,0)],.012,n=3,caps=False)
    else:bar(a,'rope',(-1.5,0,0),(1.5,0,0),.012,n=4)
    f=W.Surface(m.key+'-float',m.cat,tile='white')
    f.lathe(W.MAT,0,0,0,[(0,-.07),(.09,-.025),(.09,.025),(0,.07)],n=8 if not m.lod else 3,
            hero=True,scl=(1,1,1))
    for i,x in enumerate((-1.0,0,1.0)):m.instance('float_'+str(i),(x,0,0),f)


def plank_surface(m,width,depth,lod=None):
    a=W.Surface(m.key+'-plank',m.cat,tile='wood')
    box(a,'wood',0,0,0,width,.065,depth)
    if not (m.lod if lod is None else lod):
        for x in (-width*.38,width*.38):
            poly(a,[(x-.009,.0655,-.009),(x+.009,.0655,-.009),(x+.009,.0655,.009),(x-.009,.0655,.009)],'steel',normal=(0,1,0))
    return a


def ladder(a,width=.60,height=3.0,lod=0,zspan=.32,ybase=0):
    # Rungs are open all the way to the water; the return above deck is a grab handle.
    rr=.025 if not lod else .023
    for x in (-width/2,width/2):
        pts=[(x,ybase,zspan/2),(x,ybase+height-.35,zspan/2),
             (x,ybase+height-.07,zspan/2),(x,ybase+height-.025,0),(x,ybase+height-.14,-zspan/2)]
        a.tile='steel';a.tube(W.MAT,pts if not lod else [pts[0],pts[1],pts[-1]],rr,n=5 if not lod else 3)
    count=8 if not lod else 3
    for i in range(count):
        y=ybase+.18+(height-.78)*i/max(1,count-1)
        bar(a,'steel',(-width/2,y,zspan/2),(width/2,y,zspan/2),.022,n=5 if not lod else 3)


def raft(m):
    a=m.body
    # The floating cylinders are genuine mesh instances and have visible end caps.
    f=W.Surface(m.key+'-drum',m.cat,tile='navy')
    f.lathe(W.MAT,0,0,0,[(0,-1.30),(.29,-1.30),(.29,1.30),(0,1.30)],
            n=10 if not m.lod else 4,hero=True,rot=(math.pi/2,0,0))
    for i,x in enumerate((-.99,.99)):m.instance('drum_'+str(i),(x,-.01,0),f)
    if not m.lod:
        p=plank_surface(m,3,.285)
        for i in range(10):m.instance('plank_'+str(i),(0,.285,-1.35+i*.30),p)
        for x in (-1.0,1.0):box(a,'wood_dark',x,.18,0,.14,.105,2.9)
    else:box(a,'wood',0,.285,0,3,.065,3)
    # Ladder belongs to the raft's floating root and therefore contributes to draft.
    ls=W.Surface(m.key+'-ladder',m.cat,tile='steel')
    ladder(ls,.52,1.65,m.lod,zspan=.105,ybase=-.9)
    m.instance('ladder',(0,0,1.40),ls)


def wheel_surface(m):
    a=W.Surface(m.key+'-wheel',m.cat,tile='rubber')
    if m.lod:
        a.lathe(W.MAT,0,0,0,[(0,-.045),(.26,-.045),(.26,.045),(0,.045)],n=4,hero=True,rot=(0,0,math.pi/2))
    else:
        # Wheel axis +X, tyre radius .26; the inner ring leaves a real opening.
        nn=10;outer=.26;inner=.18;xx=.048
        for i in range(nn):
            t0=i*math.tau/nn;t1=(i+1)*math.tau/nn
            for rr,ss in ((outer,inner),):
                for sign in (-1,1):
                    poly(a,[(sign*xx,rr*math.cos(t0),rr*math.sin(t0)),(sign*xx,rr*math.cos(t1),rr*math.sin(t1)),
                            (sign*xx,ss*math.cos(t1),ss*math.sin(t1)),(sign*xx,ss*math.cos(t0),ss*math.sin(t0))],'rubber',normal=(sign,0,0))
            for radius in (outer,inner):
                ns=1 if radius==outer else -1;tm=(t0+t1)/2
                poly(a,[(-xx,radius*math.cos(t0),radius*math.sin(t0)),(xx,radius*math.cos(t0),radius*math.sin(t0)),
                        (xx,radius*math.cos(t1),radius*math.sin(t1)),(-xx,radius*math.cos(t1),radius*math.sin(t1))],
                     'encrusted',normal=(0,ns*math.cos(tm),ns*math.sin(tm)))
        for i in range(5):
            t=i*math.tau/5;bar(a,'encrusted',(-.01,0,0),(-.01,.18*math.cos(t),.18*math.sin(t)),.009,n=3)
    return a


def sunken_moped(m):
    a=m.body;wheel=wheel_surface(m)
    for id,z in [('wheel_front',.58),('wheel_rear',-.58)]:
        s=m.part(id,position=(0,.26,z),axis=(1,0,0))
        s.groups=wheel.groups
    for x in (-.065,.065):
        bar(a,'encrusted',(x,.28,.58),(x,.89,.35),.026,n=4 if not m.lod else 3)
        bar(a,'encrusted',(x,.28,-.58),(x,.60,-.12),.028,n=4 if not m.lod else 3)
    bar(a,'encrusted',(0,.61,-.31),(0,.51,.17),.07,n=5 if not m.lod else 3)
    bar(a,'encrusted',(0,.51,.17),(0,.91,.32),.035,n=4 if not m.lod else 3)
    box(a,'encrusted',0,.33,-.14,.30,.24,.31)
    box(a,'rubber',0,.68,-.35,.34,.09,.54)
    bar(a,'encrusted',(-.29,1.025,.31),(.29,1.025,.31),.02,n=4 if not m.lod else 3)
    bar(a,'encrusted',(0,.91,.32),(0,1.03,.31),.025,n=4 if not m.lod else 3)
    if not m.lod:
        box(a,'encrusted',0,.53,.26,.23,.22,.28,r=.03)
        for i in range(4):box(a,'rust',0,.36+i*.043,-.14,.32,.012,.31)
        bar(a,'encrusted',(.17,.23,-.51),(.17,.23,.08),.038,n=5)
        bar(a,'encrusted',(-.29,1.025,.31),(-.29,1.09,.24),.014,n=4)
        box(a,'encrusted',0,.82,.49,.14,.11,.08)


def sunken_set(m):
    a=m.body
    aa=W.Surface(m.key+'-anchor',m.cat,tile='encrusted');anchor_geometry(aa,m.lod,tile='encrusted')
    m.instance('anchor',(-.37,0,0),aa)
    tyre=W.Surface(m.key+'-tyre',m.cat,tile='encrusted')
    ring(tyre,.30,.10,.10,m.lod,tile='encrusted')
    m.instance('tyre',(.25,0,0),tyre)
    if not m.lod:
        for x,z in ((-.53,-.12),(.45,.27),(.10,-.20)):
            box(a,'barnacles',x,.005,z,.09,.05,.08)


def pier_deck(m):
    a=m.body
    for x in (-1.12,1.12):box(a,'wood_dark',x,0,0,.16,.155,2.0)
    if m.lod:box(a,'wood',0,.155,0,3,.065,2)
    else:
        p=plank_surface(m,3,.185)
        for i in range(10):m.instance('plank_'+str(i),(0,.155,-.90+i*.20),p)


def pile(m):
    a=m.body;r=.16;h=3.6
    coords=[(-r,-r),(r,-r),(0,r)] if m.lod else [(r,0),(.5*r,r),(-.5*r,r),(-r,0),(-.5*r,-r),(.5*r,-r)]
    # Six-sided shaft: 12 side triangles + a four-triangle cap = exactly 16.
    # Its far equivalent is an open triangular prism: six triangles.
    for i in range(len(coords)):
        x,z=coords[i];xx,zz=coords[(i+1)%len(coords)]
        poly(a,[(x,0,z),(x,h,z),(xx,h,zz),(xx,0,zz)],'pile_wood',
             uv=[(0,0),(0,1),(1,1),(1,0)])
    if not m.lod:poly(a,[(x,h,z) for x,z in coords],'wood_dark',normal=(0,1,0))


def crossbrace(m):
    a=m.body
    # Rectangular beam between the nominal endpoints; its normal faces are planar.
    x0,y0=-1.16,.055;x1,y1=1.16,1.445
    dx,dy=x1-x0,y1-y0;length=math.hypot(dx,dy);angle=-math.atan2(dx,dy)
    box(a,'wood_dark',0,.75-length/2,0,.11,length,.16,rz=angle)
    if not m.lod:
        for sign in (-1,1):
            x=sign*1.09;y=.75+sign*.65
            box(a,'rust',x,y-.065,.084,.10,.13,.009)
            for yy in (-.035,.035):
                poly(a,[(x-.013,y+yy-.013,.094),(x+.013,y+yy-.013,.094),(x+.013,y+yy+.013,.094),(x-.013,y+yy+.013,.094)],'steel',normal=(0,0,1))


def post_surface(m,full=True):
    a=W.Surface(m.key+'-post',m.cat,tile='wood_dark')
    box(a,'wood_dark',0,0,0,.105,.95,.105)
    box(a,'wood',0,.95,0,.14,.03,.14)
    if full and not m.lod:box(a,'steel',0,0,0,.14,.07,.14)
    return a


def post(m):
    if not m.lod:
        p=post_surface(m);m.instance('post',(0,0,0),p)
    else:box(m.body,'wood_dark',0,0,0,.14,.98,.14)


def handrail(m):
    a=m.body
    # Short section fits between neighbour modules without doubled end posts.
    if not m.lod:
        p=post_surface(m,False)
        for i,x in enumerate((-.93,.93)):m.instance('post_'+str(i),(x,0,0),p)
        box(a,'wood',0,.87,0,2,.11,.12)
        box(a,'wood',0,.42,0,1.90,.075,.08)
    else:
        box(a,'wood',0,.87,0,2,.11,.12,skip=('px','nx'))
        for x in (-.94,.94):box(a,'wood_dark',x,0,0,.12,.87,.12,skip=('py','ny'))


def cleat(m):
    a=m.body
    box(a,'steel',0,0,0,.26,.035,.14)
    if m.lod:
        poly(a,[(-.18,.16,0),(-.06,.035,0),(.06,.035,0),(.18,.16,0)],'steel')
    else:
        for x in (-.055,.055):bar(a,'steel',(x,.035,0),(x,.12,0),.025,n=5)
        bar(a,'steel',(-.16,.135,0),(.16,.135,0),.025,n=6)
        for x in (-.09,.09):
            a.tile='steel';a.cyl(W.MAT,x,.035,0,.014,.012,n=5)


def pier_ladder(m):ladder(m.body,.61,3.0,m.lod,zspan=.33)


def rod_holder(m):
    a=m.body
    a.tile='steel'
    a.lathe(W.MAT,0,0,0,[(.053,.13),(.053,.43),(.039,.43),(.039,.16)],n=10 if not m.lod else 4,hero=True)
    box(a,'steel',0,0,-.042,.13,.16,.075)
    if not m.lod:
        bar(a,'steel',(-.06,.085,-.075),(.06,.085,-.075),.012,n=4)
        box(a,'rubber',0,.02,-.080,.105,.09,.018)


def lamp(m):
    a=m.body
    box(a,'wood_dark',0,0,-.12,.115,2.74,.115)
    if not m.lod:
        box(a,'steel',0,.08,-.12,.16,.18,.16)
        bar(a,'steel',(0,2.35,-.12),(0,2.68,.10),.025,n=5)
    else:bar(a,'steel',(0,2.35,-.12),(0,2.68,.10),.025,n=3)
    # A hood and a lens, no emitted real-time point light in this asset-only PR.
    a.tile='steel';a.lathe(W.MAT,0,2.72,0,[(0,0),(.33,0),(.20,.10),(0,.13)],n=10 if not m.lod else 4,hero=True)
    a.tile='lamp';a.lathe(W.MAT,0,2.39,0,[(.13,0),(.18,.30),(.18,.33)],n=10 if not m.lod else 4,hero=True)
    if not m.lod:
        for i in range(5):
            t=i*math.tau/5
            bar(a,'steel',(.145*math.cos(t),2.39,.145*math.sin(t)),(.19*math.cos(t),2.72,.19*math.sin(t)),.009,n=4)


def crate(m):
    a=m.body
    box(a,'wood_dark',0,0,0,.58,.045,.42)
    if m.lod:
        for x in (-.27,.27):box(a,'wood',x,.045,0,.04,.295,.42)
        for z in (-.19,.19):box(a,'wood',0,.045,z,.50,.295,.04)
    else:
        for x in (-.266,.266):
            for z in (-.186,.186):box(a,'wood_dark',x,.045,z,.045,.295,.045)
        for y in (.075,.17,.265):
            for x in (-.27,.27):box(a,'wood',x,y,0,.04,.055,.37)
            for z in (-.19,.19):box(a,'wood',0,y,z,.50,.055,.04)
        for x in (-.27,.27):
            a.tile='rope';a.tube(W.MAT,[(x,.27,-.065),(x*1.07,.23,0),(x,.27,.065)],.011,n=4)


def platform(m):
    a=m.body
    for x in (-1.5,1.5):box(a,'wood_dark',x,0,0,.18,.155,3)
    if m.lod:box(a,'wood',0,.155,0,4,.065,3)
    else:
        p=plank_surface(m,4,.285)
        for i in range(10):m.instance('plank_'+str(i),(0,.155,-1.35+i*.30),p)
    for side in (-1,1):
        for z in ((-1.40,1.40) if m.lod else (-1.40,0,1.40)):box(a,'wood_dark',side*1.94,.22,z,.12,.98,.12)
        box(a,'wood',side*1.94,1.10,0,.12,.10,2.90)
        if not m.lod:box(a,'wood',side*1.94,.65,0,.075,.075,2.90)
        # Separate end rails leave a .84 m ladder gap in the middle.
        x=side*1.17
        box(a,'wood',x,1.10,1.44,1.50,.10,.12)
        if not m.lod:box(a,'wood',x,.65,1.44,1.50,.075,.075)


BUILDERS = {
    'watersports_buoy':buoy, 'watersports_bell_buoy':bell_buoy,
    'watersports_swimline_segment':swimline, 'watersports_diving_raft':raft,
    'watersports_sunken_moped':sunken_moped, 'watersports_sunken_anchor_tyre':sunken_set,
    'watersports_pier_deck':pier_deck, 'watersports_pier_pile':pile,
    'watersports_pier_crossbrace':crossbrace,'watersports_pier_handrail':handrail,
    'watersports_pier_post':post,'watersports_mooring_cleat':cleat,
    'watersports_pier_ladder':pier_ladder,'watersports_rod_holder':rod_holder,
    'watersports_pier_lamp':lamp,'watersports_bait_crate':crate,
    'watersports_pier_end_platform':platform,
}
