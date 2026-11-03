"""Original vintage oil-filled substation equipment, in metres and game axes.

Geometry-only companion of substation2_build.py. The furniture exporter supplies
the Y-up conversion and glTF writing. Detailed and distant forms are authored
separately; they never shrink a high-detail model to satisfy a dimension gate.

Repeated parts are placed from identical local geometry and carry instance_*
flags. The exporter can share their mesh buffers while retaining placements.
"""
import math
import furn_lib as F

STEEL = 'substation_steel'
RUST = 'substation_rust'
PAINT = 'substation_paint'
BROWN = 'substation_brown'
GREY = 'substation_grey'
CONCRETE = 'substation_concrete'
PEEL = 'substation_peeling'
RUBBER = 'substation_rubber'
PLATE = 'substation_plate'
WHITE = 0xFFFFFF
DARK = 0x454A45


def box(a, m, x, y, z, w, h, d, col=WHITE, **kw):
    a.box(m, x, y, z, w, h, d, col=col, **kw)


def cylinder(a, m, x, y, z, r, h, n=8, col=WHITE, **kw):
    a.cyl(m, x, y, z, r, h, n=n, col=col, **kw)


def beam(a, m, p, q, r=.035, n=4, col=WHITE):
    a.tube(m, [p, q], r, n=n, col=col, caps=True)


def face(a, m, points, col=WHITE, unit=False):
    normal = F._unit(F._cross(F._sub(points[1], points[0]), F._sub(points[2], points[0])))
    uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if unit else [(p[0], p[1]) for p in points]
    a._emit(m, (points, [normal] * len(points), uv,
               [(0, i, i + 1) for i in range(1, len(points) - 1)]), col, False, ())


def plate(a, m, x, y, z, w, h):
    """Upright front-facing plate; atlas remapping occurs once in the driver."""
    face(a, m, [(x-w/2,y,z),(x+w/2,y,z),(x+w/2,y+h,z),(x-w/2,y+h,z)], unit=True)


def local_asset(name='part'):
    return F.Asset(name, {'size': [1, 1, 1]})


def place(a, part, x=0, y=0, z=0, name=None, rot=(0, 0, 0)):
    """Keep translated repeated parts separate for actual exporter mesh sharing."""
    for (mat, tint, flags), g in part.groups.items():
        suffix = ('instance_' + name,) if name else ()
        # Preserve source colours when emitting a copied part. _emit accepts a
        # uniform colour; all local industrial subparts use white multipliers.
        a._emit(mat, (g.P, g.N, g.UV, g.I), WHITE, tint, suffix + tuple(flags), rot=rot, off=(x,y,z))


def ring(a, m, x, y, z, r, thickness, plane='xy', n=12):
    pts=[]
    for i in range(n+1):
        t=2*math.pi*i/n
        pts.append((x+r*math.cos(t), y+r*math.sin(t), z) if plane=='xy'
                   else (x+r*math.cos(t), y, z+r*math.sin(t)))
    a.tube(m, pts, thickness, n=3, col=WHITE, caps=False)


def bushing(height=2.45, radius=.19, sheds=9, far=False, brown=True, segments=8):
    a=local_asset('bushing'); m=BROWN if brown else GREY
    n=4 if far else segments
    cylinder(a,STEEL,0,0,0,radius*1.25,.12,n=n)
    low=.12; porcelain=height-.28
    if far:
        a.lathe(m,0,low,0,[(radius*.72,0),(radius*.87,porcelain*.12),
                          (radius*.48,porcelain*.93),(radius*.38,porcelain)],n=4,hero=True,col=WHITE)
    else:
        profile=[(radius*.72,0)]
        for i in range(sheds):
            h=porcelain*i/sheds
            rr=radius*(1-.26*i/sheds)
            profile.extend([(rr*.63,h+.012),(rr,h+porcelain/sheds*.22),
                            (rr*.62,h+porcelain/sheds*.43)])
        profile.extend([(radius*.44,porcelain),(0,porcelain)])
        a.lathe(m,0,low,0,profile,n=n,hero=True,col=WHITE,crease=40)
    cylinder(a,STEEL,0,height-.16,0,radius*.42,.16,n=n)
    if not far:
        box(a,STEEL,0,height-.08,0,.18,.08,.13)
    return a


def radiator(far=False):
    a=local_asset('radiator')
    if far:
        box(a,PAINT,0,0,0,1.9,2.1,.48)
    else:
        for i in range(10):
            box(a,PAINT,-.855+i*.19,0,0,.055,2.1,.48)
        for yy in (.08,1.96):
            a.hcyl(PAINT,0,yy,0,.07,2.03,axis='x',n=8,col=WHITE)
        for x in (-.78,.78):
            beam(a,PAINT,(x,.15,-.25),(x,.15,-.85),.065,n=6)
            beam(a,PAINT,(x,1.94,-.25),(x,1.94,-.85),.065,n=6)
    return a


def fan(far=False):
    a=local_asset('fan')
    if far:
        a.hcyl(RUBBER,0,.40,0,.34,.12,axis='z',n=6,col=WHITE)
        for x in (-.23,.23): box(a,STEEL,x,0,0,.05,.16,.12)
    else:
        a.hcyl(RUBBER,0,.40,0,.34,.10,axis='z',n=10,col=WHITE)
        ring(a,STEEL,0,.4,.065,.345,.023,n=12)
        a.hcyl(STEEL,0,.4,.08,.065,.15,axis='z',n=8,col=WHITE)
        for angle in (0,2.0943951,4.1887902):
            pts=[]
            for xx,yy in ((.04,.02),(.28,-.06),(.31,.045),(.10,.12)):
                pts.append((xx*math.cos(angle)-yy*math.sin(angle),
                            .4+xx*math.sin(angle)+yy*math.cos(angle),.13))
            face(a,STEEL,pts)
        for i in (-1,0,1):
            beam(a,STEEL,(-.3,.4+i*.12,.145),(.3,.4+i*.12,.145),.008,n=3)
        for x in (-.23,.23): box(a,STEEL,x,0,0,.05,.16,.12)
    return a


def cabinet(a,x,y,z,w,h,d,far=False,control=False):
    box(a,PEEL,x,y,z,w,h,d,r=0 if far else .025)
    if far: return
    front=z+d/2+.007
    for dy,hh in ((.07,h*.28),(h*.38,h*.55)):
        box(a,PAINT,x,y+dy,front,w-.08,hh,.018)
    for yy in (.25,h-.30): cylinder(a,STEEL,x-w/2+.035,y+yy,front,.015,.09,n=6)
    box(a,STEEL,x+w*.32,y+h*.46,front+.035,.025,.12,.045)
    if control:
        for xx in (-.2,.2):
            a.hcyl(RUBBER,x+xx*w,y+h*.78,front+.02,h*.055,.025,axis='z',n=12,col=WHITE)
            face(a,GREY,[(x+xx*w-.03,y+h*.78-.03,front+.038),
                         (x+xx*w+.03,y+h*.78-.03,front+.038),
                         (x+xx*w+.03,y+h*.78+.03,front+.038),
                         (x+xx*w-.03,y+h*.78+.03,front+.038)])


def transformer(a,large,far):
    if large:
        tw,th,td,base=4.7,2.95,2.5,.48
        rad_y,rad_z=1.02,2.08
    else:
        tw,th,td,base=3.15,2.25,1.9,.38
        rad_y,rad_z=.65,1.64
    for z in (-td*.32,td*.32):
        box(a,STEEL,0,0,z,tw+.45,.20,.25)
    if not far:
        for x in (-tw*.36,tw*.36):
            for z in (-td*.32,td*.32):
                a.hcyl(STEEL,x,.29,z,.19,.15,axis='z',n=8,col=WHITE)
    box(a,PAINT,0,base,0,tw,th,td,r=0 if far else .06)
    box(a,PAINT,0,base+th,0,tw+.18,.14,td+.18)
    top=base+th+.14
    if not far:
        for x in (-tw*.48,tw*.48):
            box(a,STEEL,x,base+.11,0,.07,th-.05,td+.02)
        for x in (-tw*.39,0,tw*.39):
            box(a,PAINT,x,base+th-.14,0,.12,.20,td+.14)
            for z in (-td*.51,td*.51):
                cylinder(a,STEEL,x,top-.025,z,.024,.035,n=6)
    if large:
        r=radiator(far)
        for iz,z in enumerate((-rad_z,rad_z)):
            for ix,x in enumerate((-1.1,1.1)):
                place(a,r,x,rad_y,z,name=f'radiator_{iz}_{ix}',rot=(0,math.pi if iz==0 else 0,0))
        ff=fan(far)
        for i,x in enumerate((-1.15,1.15)):
            place(a,ff,x,.68,2.42,name=f'fan_{i}')
        # A cylindrical conservator, saddle brackets and the sloped pipe
        # containing the rectangular Buchholz relay are separate silhouettes.
        a.hcyl(PAINT,0,4.52,-.83,.43,3.65,axis='x',n=6 if far else 14,col=WHITE)
        for x in (-1.16,1.16):
            box(a,STEEL,x,top,-.83,.13,4.21-top,.18)
        beam(a,PAINT,(-1.75,top,-.92),(-1.75,4.23,-.92),.075,n=4 if far else 6)
        if not far:
            box(a,PEEL,-1.75,3.87,-.92,.23,.24,.20)
            cylinder(a,GREY,-1.75,4.08,-.92,.045,.1,n=6)
            cylinder(a,BROWN,-2.03,2.65,-1.02,.075,.34,n=8)
            beam(a,STEEL,(-2.03,3.0,-1.02),(-1.75,3.55,-.92),.025,n=4)
        # Dedicated OLTC compartment and marshalling cabinet.
        cabinet(a,2.71,.48,0,.60,2.32,1.45,far)
        cabinet(a,-3.15,.12,1.62,.72,1.55,.55,far,control=True)
        hv=bushing(2.76,.24,9,far)
        mv=bushing(1.49,.16,6,far,brown=False)
        for i,x in enumerate((-1.62,0,1.62)):
            place(a,hv,x,top,-.10,name=f'hv_bushing_{i}')
            place(a,mv,x,top,1.0,name=f'mv_bushing_{i}')
        place(a,bushing(.95,.12,4,far),2.0,top,1.0,name='neutral')
        if not far:
            # Visible on the exposed OLTC front, not hidden behind radiators.
            plate(a,'substation_plate_132',2.71,1.45,.750,.46,.30)
            plate(a,'substation_plate_t1',2.71,2.10,.750,.48,.28)
            for x in (-2.1,2.1):
                box(a,RUST,x,.54,1.29,.10,.18,.12)
            cylinder(a,STEEL,-1.96,.44,1.43,.06,.22,n=6)
    else:
        # Small transformers use scaled radiator count, never a rescaled large
        # model; the 11kV termination is a sheet-steel cable box.
        for iz,z in enumerate((-rad_z,rad_z)):
            if far:
                box(a,PAINT,0,rad_y,z,2.8,1.55,.43)
            else:
                r=local_asset('small_radiator')
                for i in range(12): box(r,PAINT,-1.265+i*.23,0,0,.05,1.55,.43)
                for yy in (.06,1.47): r.hcyl(PAINT,0,yy,0,.06,2.9,axis='x',n=6,col=WHITE)
                place(a,r,0,rad_y,z,name=f'radiator_small_{iz}')
                for yy in (.06,1.47):
                    # Open ends are concealed inside header and oil tank.
                    a.tube(PAINT,[(0,rad_y+yy,z),(0,rad_y+yy,math.copysign(.94,z))],.055,n=4,col=WHITE,caps=False)
        if not far: place(a,fan(False),0,.46,1.90,name='fan_small')
        a.hcyl(PAINT,0,3.48,-.70,.32,2.5,axis='x',n=5 if far else 12,col=WHITE)
        for x in (-.85,.85): box(a,STEEL,x,top,-.70,.10,3.20-top,.15)
        beam(a,PAINT,(-1.13,top,-.7),(-1.13,3.25,-.7),.055,n=4 if far else 6)
        if not far: box(a,PEEL,-1.13,3.03,-.7,.18,.17,.17)
        cabinet(a,1.98,.40,.04,.68,1.82,1.04,far)
        cabinet(a,-2.16,.1,1.13,.56,1.2,.48,far,control=True)
        box(a,PAINT,-1.73,.38,-.34,.30,1.65,.90)
        if not far:
            box(a,STEEL,-1.73,2.03,-.34,.34,.055,.94)
        hv=bushing(1.70,.18,7,far,segments=6)
        for i,x in enumerate((-1.03,0,1.03)):
            place(a,hv,x,top,.12,name=f'hv33_bushing_{i}')
        place(a,bushing(.83,.11,4,far,brown=False),1.37,top,.52,name='neutral_small')
        if not far:
            plate(a,'substation_plate_33',1.98,1.25,.584,.38,.26)
            # Bottom entries show that the low-voltage side is cable-connected.
            for x in (1.78,1.98,2.18): cylinder(a,RUBBER,x,.20,.13,.048,.22,n=6)


def oil_breaker(a,hv,far):
    spacing=2.25 if hv else 1.10
    for x in (-spacing,0,spacing):
        for z in (-.70,.70): box(a,STEEL,x,0,z,.16,.95 if hv else .58,.18)
    if hv:
        for z in (-.70,.70): box(a,STEEL,0,.67,z,5.55,.17,.18)
        bush=bushing(2.32,.205,8,far,segments=6)
        for i,x in enumerate((-spacing,0,spacing)):
            a.hcyl(PAINT,x,1.52,0,.61,2.42,axis='z',n=6 if far else 12,col=WHITE)
            if not far:
                for z in (-1.17,1.17): a.hcyl(STEEL,x,1.52,z,.63,.07,axis='z',n=10,col=WHITE)
                cylinder(a,STEEL,x,.53,.93,.045,.30,n=6)
            for side in (-1,1):
                place(a,bush,x,1.96,side*.84,name=f'breaker_bushing_{i}_{side}',rot=(side*.23,0,0))
        cabinet(a,0,0,1.78,.90,1.25,.54,far,control=True)
        if not far:
            beam(a,STEEL,(-2.25,.98,1.1),(2.25,.98,1.1),.045,n=6)
            plate(a,PLATE,0,.52,2.074,.58,.26)
    else:
        for z in (-.5,.5): box(a,STEEL,0,.42,z,2.95,.13,.15)
        bush=bushing(1.28,.135,5,far)
        for i,x in enumerate((-spacing,0,spacing)):
            cylinder(a,PAINT,x,.58,0,.34,1.02,n=5 if far else 10)
            cylinder(a,STEEL,x,1.60,0,.37,.08,n=5 if far else 10)
            for side in (-1,1):
                place(a,bush,x,1.68,side*.23,name=f'ocb33_bushing_{i}_{side}',rot=(side*.13,0,0))
        cabinet(a,0,0,.96,.60,1.05,.42,far,control=True)
        if not far: plate(a,'substation_plate_ocb',0,.42,1.194,.48,.26)


def truck(a,far):
    box(a,STEEL,0,.08,0,.74,.12,1.02)
    for x in (-.32,.32):
        for z in (-.42,.42): a.hcyl(RUBBER,x,.10,z,.10,.075,axis='x',n=4 if far else 8,col=WHITE)
    for x in (-.24,0,.24):
        cylinder(a,PAINT,x,.20,-.07,.103,.54,n=4 if far else 8)
        place(a,bushing(.51,.054,3,far),x,.72,-.07,name='truck_bushing_'+str(x))
        beam(a,STEEL,(x,.92,-.08),(x,.92,-.50),.022,n=4)
    box(a,PAINT,0,.21,.43,.74,.54,.11)
    if not far:
        plate(a,PLATE,0,.43,.492,.32,.16)
        for x in (-.28,.28): beam(a,STEEL,(x,.40,.51),(x,.58,.51),.018,n=6)
        box(a,STEEL,0,.30,.53,.32,.03,.035)


def base_stand(a,h=1.1,w=.72,d=.7,far=False):
    box(a,CONCRETE,0,0,0,w+.18,.17,d+.18)
    if far:
        box(a,STEEL,0,.17,0,w*.36,h-.17,d*.36)
    else:
        for x in (-w*.38,w*.38):
            for z in (-d*.38,d*.38): box(a,STEEL,x,.17,z,.075,h-.17,.075)
        box(a,STEEL,0,h-.10,0,w,.10,d)
        for z in (-d*.38,d*.38):
            beam(a,STEEL,(-w*.38,.25,z),(w*.38,h-.12,z),.024,n=4)


def disconnector(a,hv,far):
    spacing=1.42 if hv else .94
    stand=1.25 if hv else .72
    ph=1.95 if hv else 1.12
    for i,x in enumerate((-spacing,spacing)):
        p=local_asset('isolator_leg'); base_stand(p,stand,.70 if hv else .5,.7 if hv else .5,far)
        place(a,p,x,0,0,name=f'isolator_leg_{i}')
        place(a,bushing(ph,.20 if hv else .145,8 if hv else 5,far),x,stand,0,name=f'isolator_post_{i}')
    yy=stand+ph
    # Centre break, with two visible jaws and a short daylight gap.
    beam(a,STEEL,(-spacing,yy,0),(-.06,yy,.15),.055 if hv else .038,n=4 if far else 8)
    beam(a,STEEL,(spacing,yy,0),(.06,yy,-.15),.055 if hv else .038,n=4 if far else 8)
    if not far:
        box(a,STEEL,-.08,yy-.05,.15,.13,.11,.19)
        box(a,STEEL,.08,yy-.05,-.15,.13,.11,.19)
        beam(a,STEEL,(-spacing,.48,0),(spacing,.48,0),.035,n=6)
        cabinet(a,-spacing-.35,0,.45,.28,.80,.23,False)


def pantograph(a,far):
    base_stand(a,1.20,1.15,1.15,far)
    place(a,bushing(2.0,.25,8,far),0,1.2,0,name='pantograph_post')
    width=1.05
    for z in (-.24,.24):
        for side in (-1,1):
            beam(a,STEEL,(0,3.2,z),(side*width,4.65,z),.06,n=4 if far else 6)
            beam(a,STEEL,(side*width,4.65,z),(0,6.10,z),.06,n=4 if far else 6)
    a.hcyl(STEEL,0,6.14,0,.075,1.40,axis='x',n=4 if far else 8,col=WHITE)
    if not far:
        for y,x in ((3.2,0),(4.65,-width),(4.65,width),(6.10,0)):
            a.hcyl(STEEL,x,y,0,.09,.64,axis='z',n=8,col=WHITE)
        beam(a,STEEL,(.40,.30,0),(.40,1.16,0),.035,n=6)
        cabinet(a,.83,0,.55,.38,.9,.32,False)


def instrument(a,kind,hv,far):
    h=(4.55 if hv else 2.55)
    if kind=='cvt':
        cabinet(a,0,.18,0,.74 if hv else .56,.70 if hv else .48,.70 if hv else .55,far)
        box(a,CONCRETE,0,0,0,.94 if hv else .72,.18,.90 if hv else .72)
        ph=h-(.88 if hv else .66)
        place(a,bushing(ph,.25 if hv else .17,11 if hv else 7,far,brown=False),0,.88 if hv else .66,0,name='cvt_stack')
        if not far: plate(a,PLATE,0,.37,.374 if hv else .299,.29,.20)
    elif kind=='ct':
        sh=1.35 if hv else .92
        base_stand(a,sh,.78 if hv else .58,.74 if hv else .58,far)
        ph=h-sh-.45
        place(a,bushing(ph,.24 if hv else .165,10 if hv else 6,far),0,sh,0,name='ct_post')
        a.hcyl(PAINT,0,h-.28,0,.28 if hv else .22,.88 if hv else .64,axis='x',n=6 if far else 12,col=WHITE)
        beam(a,STEEL,(-.53 if hv else -.39,h-.22,0),(.53 if hv else .39,h-.22,0),.035,n=4 if far else 8)
        if not far:
            cabinet(a,0,.45,.50,.30,.35,.23,False)
            beam(a,RUBBER,(0,.8,.46),(0,sh+.1,.16),.021,n=4)
    else:
        base_stand(a,.65 if hv else .4,.52,.52,far)
        ph=h-(.65 if hv else .4)
        place(a,bushing(ph,.18 if hv else .13,12 if hv else 7,far,brown=False),0,.65 if hv else .4,0,name='arrester_stack')
        if not far:
            beam(a,STEEL,(.20,.12,0),(.20,.68,0),.019,n=4)
            box(a,PAINT,.28,.35,.08,.16,.18,.12)
            if hv: ring(a,STEEL,0,h-.28,0,.30,.018,plane='xz',n=10)


def earth_switch(a,hv,far):
    sh=.90 if hv else .60
    ph=2.05 if hv else 1.08
    base_stand(a,sh,.72,.72,far)
    place(a,bushing(ph,.19 if hv else .13,8 if hv else 5,far),0,sh,0,name='earth_post')
    # Open earthed blade, pivot at a visibly bonded metal bracket near ground.
    endpoint=(1.05 if hv else .65,2.08 if hv else 1.35,.10)
    # Keep the pivot attached to the stand even when LOD removes fine bonds.
    box(a,STEEL,.25 if hv else .18,.40,0,.67 if hv else .52,.08,.62)
    beam(a,STEEL,(.55 if hv else .4,.48,0),endpoint,.045 if hv else .03,n=4 if far else 8)
    beam(a,STEEL,(0,sh+ph,0),(.28,sh+ph,0),.045,n=4 if far else 8)
    if not far:
        beam(a,STEEL,(.58,.17,0),(.58,.52,0),.025,n=4)
        cabinet(a,-.53,0,.39,.28,.75,.23,False)


def switchboard(a,far,control=False):
    w,h,d=(.85,2.25,.65) if control else (.80,2.40,1.45)
    box(a,PEEL,0,0,0,w,h,d)
    z=d/2+.008
    if far:
        box(a,PAINT,0,.08,z,w-.06,h-.16,.015)
        return
    for yy,hh in ((.08,.68),(.81,.68),(1.54,h-1.59)):
        box(a,PAINT,0,yy,z,w-.06,hh,.02)
        for x in (-w*.44,w*.44): cylinder(a,STEEL,x,yy+.10,z+.025,.012,.065,n=5)
    for x in (-.22,0,.22):
        a.hcyl(RUBBER,x,1.98,z+.035,.070,.025,axis='z',n=12,col=WHITE)
        # Pale dial face, needle and central fastener are readable close up.
        a.hcyl(GREY,x,1.98,z+.051,.056,.004,axis='z',n=10,col=WHITE)
        beam(a,RUBBER,(x,1.98,z+.055),(x+.025,2.015,z+.055),.004,n=3)
    for x in (-.20,.20):
        box(a,RUBBER,x,1.63,z+.018,.15,.20,.025)
        box(a,GREY,x,1.72,z+.045,.105,.055,.005)
    # Original mimic line (no logos) with bus, feeder and breaker symbol.
    box(a,RUST,0,1.44,z+.037,w-.14,.018,.01)
    box(a,RUST,0,1.15,z+.037,.018,.30,.01)
    box(a,RUBBER,0,1.21,z+.048,.11,.08,.01)
    for x in (-.29,.29): box(a,STEEL,x,.87,z+.045,.026,.17,.045)
    plate(a,PLATE,0,.39,z+.035,.32,.16)
    if not control:
        for x in (-.28,.28):
            box(a,STEEL,x,.02,0,.035,.028,1.6)


def battery(a,far):
    for y in (.16,.88):
        box(a,STEEL,0,y,0,2.90,.08,.66)
    for x in (-1.36,0,1.36):
        for z in (-.28,.28): box(a,STEEL,x,0,z,.045,1.55,.045)
    for row,y in enumerate((.25,.97)):
        if far:
            box(a,GREY,0,y,0,2.61,.48,.48)
        else:
            cell=local_asset('cell')
            box(cell,GREY,0,0,0,.24,.46,.46)
            box(cell,RUBBER,0,.46,0,.245,.035,.465)
            for x in (-.07,.07): cylinder(cell,STEEL,x,.495,0,.018,.035,n=5)
            for i in range(10):
                place(a,cell,-1.215+i*.27,y,0,name=f'battery_{row}_{i}')
                if i<9: beam(a,RUBBER,(-1.145+i*.27,y+.51,0),(-1.015+i*.27,y+.51,0),.016,n=4)
    if not far:
        plate(a,PLATE,0,.68,.342,.34,.13)
        beam(a,RUBBER,(-1.37,.75,0),(-1.37,1.50,0),.021,n=5)


def station_transformer(a,far):
    for x in (-.40,.40): box(a,STEEL,x,0,0,.16,.12,1.0)
    box(a,PAINT,0,.12,0,1.06,1.22,.86,r=0 if far else .04)
    box(a,PAINT,0,1.34,0,1.16,.08,.96)
    if far:
        for z in (-.62,.62): box(a,PAINT,0,.35,z,.90,.75,.25)
    else:
        for z in (-.62,.62):
            for i in range(9): box(a,PAINT,-.44+i*.11,.35,z,.028,.78,.28)
        plate(a,PLATE,.70,.49,.308,.25,.17)
    for i,x in enumerate((-.32,0,.32)):
        place(a,bushing(.48,.065,3,far),x,1.42,.08,name=f'station_bushing_{i}')
    box(a,PAINT,.70,.30,0,.32,.50,.60)


def insulator_disc(a,far):
    if far:
        a.lathe(BROWN,0,0,0,[(.075,0),(.14,.04),(.075,.09)],n=4,hero=True,col=WHITE)
    else:
        a.lathe(BROWN,0,0,0,[(.055,0),(.145,.025),(.15,.045),(.07,.075),(.055,.10)],n=10,hero=True,col=WHITE)
        cylinder(a,STEEL,0,.10,0,.035,.045,n=6)


def insulator_string(a,hv,far):
    length=1.72 if hv else .70
    if far:
        cylinder(a,BROWN,0,.06,0,.09,length-.12,n=4)
    else:
        p=local_asset('disc'); insulator_disc(p,False)
        count=11 if hv else 4
        for i in range(count): place(a,p,0,.06+i*.145,0,name='disc_'+str(i))
    for yy in (0,length-.06): cylinder(a,STEEL,0,yy,0,.035,.06,n=4 if far else 6)


def conductor_segment(a,far):
    # Unit one-metre vertical segment: runtime instancing scales Y only, rotates
    # the local +Y axis to the sampled chord, and translates to the chord start.
    cylinder(a,STEEL,0,0,0,.015,1,n=3 if far else 10,caps=False)


def conductor_spacer(a,far):
    for yy in (0,.40): box(a,STEEL,0,yy,0,.55,.035,.04)
    # A single rigid spacer frame, rather than two disconnected clamp bars.
    for x in (-.20,.20): box(a,STEEL,x,.03,0,.035,.375,.04)
    if not far:
        for x in (-.25,.25):
            for yy in (.046,.446): ring(a,RUBBER,x,yy,0,.035,.012,n=8)


def build(a,item,far=False):
    key=item['id'].removeprefix('substation_')
    if key=='transformer_132_33': transformer(a,True,far)
    elif key=='transformer_33_11': transformer(a,False,far)
    elif key=='breaker_oil_132': oil_breaker(a,True,far)
    elif key=='breaker_oil_33': oil_breaker(a,False,far)
    elif key=='breaker_truck_11': truck(a,far)
    elif key.startswith('disconnector_centre_'): disconnector(a,key.endswith('132'),far)
    elif key=='disconnector_pantograph_132': pantograph(a,far)
    elif key.split('_')[0] in ('ct','cvt','arrester'): instrument(a,key.split('_')[0],key.endswith('132'),far)
    elif key.startswith('post_insulator_'):
        hv=key.endswith('132'); place(a,bushing(2.1 if hv else 1.05,.22 if hv else .15,9 if hv else 5,far),name='post')
    elif key.startswith('earth_switch_'): earth_switch(a,key.endswith('132'),far)
    elif key=='switchboard_panel_11': switchboard(a,far)
    elif key=='control_panel': switchboard(a,far,True)
    elif key=='battery_bank': battery(a,far)
    elif key=='battery_charger': cabinet(a,0,0,0,.75,1.55,.60,far,True)
    elif key=='station_transformer': station_transformer(a,far)
    elif key=='radiator_bank': place(a,radiator(far),name='radiator')
    elif key=='cooling_fan': place(a,fan(far),name='fan')
    elif key=='insulator_disc': insulator_disc(a,far)
    elif key.startswith('insulator_string_'): insulator_string(a,key.endswith('132'),far)
    elif key=='conductor_segment': conductor_segment(a,far)
    elif key=='conductor_spacer': conductor_spacer(a,far)
    else: raise ValueError('Unknown substation equipment: '+key)


def entry(key,size,family,features,hum=None,hinges=None):
    w,h,d=size
    anchors={'lamps':[],'hinges':hinges or []}
    if hum is not None: anchors['hum']={'position':hum,'frequencyHz':100}
    return {'id':key,'size':size,'family':family,'features':features,
            'anchors':anchors,'keepOut':[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]]}


EQUIPMENT_CATALOG=[
    entry('transformer_132_33',[7.04,6.33,5.20],'transformer',
          ['40 MVA 132/33 kV','oil tank','four radiator banks','conservator','Buchholz relay','OLTC','three HV bushings','three MV bushings','neutral bushing','cooling fans','marshalling kiosk','rating plate'],[0,1.9,0],
          [{'name':'marshalling_door','position':[-3.51,.12,1.902],'axis':[0,1,0]}]),
    entry('transformer_33_11',[5.0,4.47,4.12],'transformer',
          ['15 MVA 33/11 kV','oil tank','radiator banks','conservator','Buchholz relay','OLTC housing','33 kV bushings','neutral bushing','11 kV cable box','cooling fan','marshalling kiosk','rating plate'],[0,1.4,0],
          [{'name':'marshalling_door','position':[-2.44,.1,1.377],'axis':[0,1,0]}]),
    entry('breaker_oil_132',[5.8,4.4,4.24],'breaker',['132 kV dead-tank bulk-oil','three horizontal tanks','six porcelain bushings','operating cubicle','linkage'],hinges=[{'name':'mechanism_door','position':[-.45,0,2.057],'axis':[0,1,0]}]),
    entry('breaker_oil_33',[3.1,3.0,2.5],'breaker',['33 kV three oil pots','six porcelain bushings','operating cubicle'],hinges=[{'name':'mechanism_door','position':[-.3,0,1.177],'axis':[0,1,0]}]),
    entry('breaker_truck_11',[.86,1.23,1.10],'breaker',['11 kV withdrawable truck','wheels','three oil poles','rear isolating contacts']),
    entry('disconnector_centre_132',[4.0,3.35,1.3],'disconnector',['132 kV single-phase centre-break','two porcelain columns','contact jaws','drive shaft']),
    entry('disconnector_centre_33',[2.9,1.93,1.28],'disconnector',['33 kV single-phase centre-break','two porcelain columns','contact jaws','drive shaft']),
    entry('disconnector_pantograph_132',[2.3,6.23,1.56],'disconnector',['132 kV single-phase pantograph','diamond linkage','contact shoe','motor cabinet']),
    *[entry(kind+'_'+voltage,([1.12,4.56,1.4] if voltage=='132' else [.92,2.56,1.4]),'instrument',
            [voltage+' kV',{'ct':'current transformer','cvt':'capacitor voltage transformer','arrester':'surge arrester'}[kind]])
      for kind in ('ct','cvt','arrester') for voltage in ('132','33')],
    entry('post_insulator_132',[.55,2.1,.55],'insulator',['132 kV brown porcelain post','metal flanges']),
    entry('post_insulator_33',[.375,1.05,.375],'insulator',['33 kV brown porcelain post','metal flanges']),
    entry('earth_switch_132',[2.4,3.0,1.15],'earth-switch',['132 kV earth switch','open blade','earthing bond','drive cubicle']),
    entry('earth_switch_33',[1.5,1.73,1.15],'earth-switch',['33 kV earth switch','open blade','earthing bond','drive cubicle']),
    entry('switchboard_panel_11',[.80,2.4,1.6],'indoor',['11 kV metal-clad panel','three doors','meters','relays','mimic strip','truck rails'],hinges=[{'name':'panel_door','position':[-.37,.08,.748],'axis':[0,1,0]}]),
    entry('control_panel',[.85,2.25,.82],'indoor',['control panel','meters','relays','mimic strip','door handles'],hinges=[{'name':'panel_door','position':[-.39,.08,.348],'axis':[0,1,0]}]),
    entry('battery_bank',[2.9,1.55,.69],'indoor',['two-tier steel rack','twenty flooded cells','bus links','rating plate']),
    entry('battery_charger',[.75,1.55,.72],'indoor',['battery charger','analog meters','service door'],hinges=[{'name':'charger_door','position':[-.34,0,.33],'axis':[0,1,0]}]),
    entry('station_transformer',[1.72,1.90,1.52],'transformer',['station service transformer','radiator fins','three bushings','LV cable box'],[0,.75,0]),
    entry('radiator_bank',[2.04,2.1,1.70],'component',['ten oil-cooling fins','top and bottom headers','connection stubs']),
    entry('cooling_fan',[.74,.77,.32],'component',['cooling fan','three blades','guard cage','feet']),
    entry('insulator_disc',[.30,.145,.30],'component',['porcelain suspension disc','steel cap and pin']),
    entry('insulator_string_132',[.30,1.72,.30],'component',['eleven-disc 132 kV tension/suspension string','end fittings']),
    entry('insulator_string_33',[.30,.70,.30],'component',['four-disc 33 kV tension/suspension string','end fittings']),
    entry('conductor_segment',[.030,1.0,.030],'component',['one-metre +Y conductor segment for instancing','no long conductor mesh']),
    entry('conductor_spacer',[.61,.52,.04],'component',['bundled-conductor spacer','four rubber clamps']),
]
