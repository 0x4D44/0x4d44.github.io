"""Original beach vendor, rescue and promenade kit in game-space metres.

All geometry uses +Y up / +Z front.  Parts that can move are built about
catalogued, LOD-stable pivots.  Far meshes are deliberately authored silhouettes,
not decimations of the near mesh.  The shared atlas supplies surface detail.
"""
import math


def record(family, size, description, *, anchors=None, pivots=None, cap=2000):
    return dict(family=family, size=size, footprint=[size[0], size[2]],
                description=description, triangleCap=cap,
                anchors=anchors or {}, pivots=pivots or [])


def rectangle(width, depth):
    return [[-width / 2, -depth / 2], [width / 2, -depth / 2],
            [width / 2, depth / 2], [-width / 2, depth / 2]]


def pivot(name, position, axis, motion='rotate'):
    return dict(name=name, position=position, axis=axis, motion=motion)


CART_PIVOTS = [pivot('wheel_left', [-.64, .29, .05], [1, 0, 0]),
               pivot('wheel_right', [.64, .29, .05], [1, 0, 0]),
               pivot('canopy_flap', [0, 1.98, .57], [1, 0, 0], 'flap')]
COOLER_PIVOT = pivot('lid', [0, 1.10, -.29], [1, 0, 0], 'hinge')
TOWER_PIVOT = pivot('rear_flap', [0, 2.70, -.62], [1, 0, 0], 'hinge')
AID_PIVOT = pivot('lid', [0, .25, -.12], [1, 0, 0], 'hinge')
FLAG_PIVOT = pivot('flag', [-.35, 1.76, 0], [0, 1, 0], 'flap')

CATALOG = {
    'beach_kiosk': record('vendor', [3.2, 3.0, 3.2],
        'Open-front palm-thatch beach kiosk; slatted half walls, service counter and framed menu slot',
        anchors={'keepOut': rectangle(3.35, 3.35),
                 'menuSlot': {'position': [.68, 1.48, .79], 'size': [.62, .78], 'yaw': 0}}, cap=3000),
    'beach_vendor_cart': record('vendor', [1.6, 2.16, 2.0],
        'Hand-pushed juice and cocada cart with striped canopy, independent wheels, jars and serving shelf',
        anchors={'hands': [{'position': [-.30, .91, -.97], 'side': 'left'},
                           {'position': [.30, .91, -.97], 'side': 'right'}],
                 'hinges': [CART_PIVOTS[2]], 'keepOut': rectangle(1.7, 2.1)}, pivots=CART_PIVOTS),
    'beach_cooler_stand': record('vendor', [.9, 1.16, .7],
        'Faded blue ice cooler on a weathered timber stand, with a separate hinged white lid',
        anchors={'hinges': [COOLER_PIVOT]}, pivots=[COOLER_PIVOT]),
    'beach_sign_easel': record('vendor', [.74, 1.2, .6],
        'Small timber A-board easel with an inset illustrated menu panel and side chain'),
    'beach_lifeguard_tower': record('rescue', [2.2, 3.6, 2.2],
        'Raised red-and-white lifeguard lookout, ladder, cross-bracing, observation windows, rear flap and mast',
        anchors={'keepOut': rectangle(2.4, 2.4), 'hinges': [TOWER_PIVOT],
                 'watch': {'position': [0, 1.73, .12], 'yaw': 0}},
        pivots=[TOWER_PIVOT], cap=3000),
    'beach_rescue_buoy': record('rescue', [.32, .13, .86],
        'Red rescue can with handhold recesses and a coiled tow line, laid on the sand'),
    'beach_first_aid': record('rescue', [.42, .30, .28],
        'Portable cream first-aid box with green cross, carrying handle, latch and hinged lid',
        anchors={'hinges': [AID_PIVOT]}, pivots=[AID_PIVOT]),
    'beach_red_flag': record('rescue', [.92, 2.02, .22],
        'Red swimming-warning flag with wind-shaped cloth on its own mast pivot',
        anchors={'hinges': [FLAG_PIVOT]}, pivots=[FLAG_PIVOT]),
    'beach_lamp': record('promenade', [.32, 1.03, .32],
        'Salt-weathered steel bollard lamp with warm diffuser and a shallow rain hood',
        anchors={'light': {'position': [0, .84, 0], 'color': [1, .84, .61]}}, cap=150),
    'beach_bench': record('promenade', [1.85, .92, .66],
        'Weathered hardwood slat bench on painted steel supports, with curved arms',
        anchors={'seats': [{'position': [-.52, .48, .02], 'yaw': 0, 'seatHeight': .48},
                            {'position': [.52, .48, .02], 'yaw': 0, 'seatHeight': .48}]}),
    'beach_bin': record('promenade', [.52, .96, .52],
        'Lidded municipal beach bin with open front aperture and narrow timber battens'),
    'beach_bike_rack': record('promenade', [1.8, .80, .55],
        'Three inverted-U stainless bicycle parking hoops on two low fixing rails'),
    'beach_fountain': record('promenade', [.50, 1.06, .54],
        'Accessible enamel drinking fountain with dished bowl, swan-neck tap and drain'),
    'beach_railing': record('promenade', [2.0, .95, .12],
        'Repeatable two-metre salt-painted sea-wall railing, with open pickets and a broad handrail'),
    'beach_steps_small': record('promenade', [1.2, .462, .84],
        'Three concrete sea-wall treads, 154mm rise and 280mm going'),
    'beach_steps_medium': record('promenade', [2.0, .77, 1.4],
        'Five concrete sea-wall treads, 154mm rise and 280mm going'),
    'beach_steps_wide': record('promenade', [3.0, .77, 1.4],
        'Wide five-tread concrete beach access with non-slip edge strips'),
    'beach_shower': record('promenade', [.44, 2.35, .76],
        'Beach rinse shower with bent galvanized riser, perforated head, push valve and draining footplate'),
}
CATALOG['beach_railing']['instance'] = True


def bar(a, cell, start, end, radius=.018, sides=6, caps=True):
    a.tube(cell, [start, end], radius, n=sides, caps=caps)


def panel(a, cell, pts, normal=None, flags=()):
    a.poly(cell, pts, normal=normal, flags=flags)


def front_panel(a, cell, x, y, z, width, height):
    panel(a, cell, [(x-width/2, y, z), (x+width/2, y, z),
                    (x+width/2, y+height, z), (x-width/2, y+height, z)], (0, 0, 1))


def hipped_roof(a, cell, width, depth, eave, ridge, ridge_width=.34):
    w, d, r = width/2, depth/2, ridge_width/2
    panel(a, cell, [(-w,eave,d),(w,eave,d),(r,ridge,0),(-r,ridge,0)])
    panel(a, cell, [(w,eave,-d),(-w,eave,-d),(-r,ridge,0),(r,ridge,0)])
    panel(a, cell, [(-w,eave,-d),(-w,eave,d),(-r,ridge,0)])
    panel(a, cell, [(w,eave,d),(w,eave,-d),(r,ridge,0)])


def kiosk(p, lod):
    a = p.body
    a.box('wood_weathered',0,0,0,2.92,.10,2.92)
    for x in (-1.31,1.31):
        for z in (-1.31,1.31):
            a.box('wood_teak',x,.10,z,.13,2.0,.13,skip=('py','ny'))
    hipped_roof(a,'thatch',3.2,3.2,2.13,3.0,.54)
    # Back and sides remain open above waist-height. The counter is +Z.
    if lod:
        a.box('wood_weathered',0,.10,-1.32,2.64,.92,.055)
        for x in (-1.32,1.32):
            a.box('wood_weathered',x,.10,0,.055,.92,2.64)
    else:
        for i in range(17):
            x=-1.24+i*.155
            a.box('wood_weathered',x,.13,-1.32,.137,.84,.045)
        for side in (-1,1):
            for i in range(16):
                z=-1.22+i*.16
                a.box('wood_weathered',side*1.32,.13,z,.045,.84,.141)
        for y in (.25,.84,2.04):
            a.box('wood_teak',0,y,-1.31,2.70,.065,.07)
            for x in (-1.31,1.31):a.box('wood_teak',x,y,0,.07,.065,2.7)
        for x in (-1.31,1.31):
            bar(a,'wood_teak',(x,1.63,1.31),(x,2.12,.85),.035,4)
            bar(a,'wood_teak',(x,1.63,-1.31),(x,2.12,-.85),.035,4)
        # Thin irregular edge bundles break the thatch silhouette.
        for i in range(18):
            x=-1.51+i*.178
            y=2.13-(.10 if i%3 else .17)
            panel(a,'thatch',[(x-.085,2.14,1.60),(x+.085,2.14,1.60),
                              (x+.069,y,1.56),(x-.068,y-.015,1.56)])
            panel(a,'thatch',[(x+.085,2.14,-1.60),(x-.085,2.14,-1.60),
                              (x-.063,y,-1.56),(x+.071,y-.012,-1.56)])
    a.box('wood_teak',0,1.02,1.12,2.72,.09,.59)
    a.box('plank_blue',0,.12,1.26,2.57,.88,.045)
    if not lod:
        for x in (-1.12,0,1.12):a.box('wood_teak',x,.15,1.30,.06,.86,.04)
        # Recessed, replaceable board; its slot remains readable empty too.
        a.box('wood_teak',.68,1.42,.77,.72,.89,.065)
        front_panel(a,'menu',.68,1.48,.806,.62,.78)
        a.box('wood_teak',.68,1.42,.83,.77,.055,.13)
        for x in (-.68,-.32):
            a.lathe('plastic_blue',x,1.11,1.06,[(0,0),(.10,0),(.105,.27),(.086,.31),(0,.31)],n=10,hero=True)
        a.box('wicker',-.91,1.11,.98,.28,.085,.30)
        for i in range(4):a.sph('fruit',-.99+.07*i,1.23,.99,.045,n=8)


def cart(p, lod):
    a=p.body
    a.box('plank_blue',0,.36,.06,1.15,.69,1.09, r=0 if lod else .025)
    a.box('steel',0,1.02,.06,1.27,.065,1.22)
    for x in (-.58,.58):
        for z in (-.48,.56):
            bar(a,'steel',(x,1.07,z),(x,1.99,z),.018,4 if lod else 6)
    # Pitched canvas; no hidden duplicate underside.
    panel(a,'parasol_03',[(-.8,1.98,-.62),(-.8,1.98,.62),(-.8,2.16,0)])
    panel(a,'parasol_03',[(.8,1.98,.62),(.8,1.98,-.62),(.8,2.16,0)])
    panel(a,'parasol_03',[(-.8,1.98,.62),(.8,1.98,.62),(.8,2.16,0),(-.8,2.16,0)])
    panel(a,'parasol_03',[(.8,1.98,-.62),(-.8,1.98,-.62),(-.8,2.16,0),(.8,2.16,0)])
    for meta in CART_PIVOTS[:2]:
        wheel=p.pivot(meta['name'],meta['position'],axis=meta['axis'])
        n=6 if lod else 14
        profile=[(.16,-.065),(.27,-.055),(.29,-.025),(.29,.025),(.27,.055),(.16,.065)]
        if lod:profile=[(.16,-.06),(.29,-.06),(.29,.06),(.16,.06)]
        wheel.lathe('rubber',0,0,0,profile,n=n,hero=True,rot=(0,0,-math.pi/2),drop0=False)
        wheel.hcyl('steel',0,0,0,.16,.13,n=6 if lod else 10)
        if not lod:
            for i in range(5):
                t=math.tau*i/5
                bar(wheel,'steel',(0,.04*math.sin(t),.04*math.cos(t)),
                    (0,.16*math.sin(t),.16*math.cos(t)),.01,4)
    flap=p.pivot('canopy_flap',CART_PIVOTS[2]['position'],axis=[1,0,0],motion='flap')
    strips=1 if lod else 6
    for i in range(strips):
        x0=-.8+1.6*i/strips;x1=-.8+1.6*(i+1)/strips
        panel(flap,'parasol_03',[(x0,0,.05),(x1,0,.05),
                                (x1,-.18,.04+(i%2)*.02),(x0,-.18,.04+((i+1)%2)*.02)],(0,0,1))
    for x in (-.3,.3):
        bar(a,'steel',(x,.87,-.48),(x,.91,-.97),.022,4 if lod else 6)
        if not lod:bar(a,'rubber',(x,.91,-.79),(x,.91,-.97),.028,6)
    if not lod:
        front_panel(a,'sign_jugos',0,.52,.612,.95,.42)
        for x in (-.36,-.03,.30):
            a.lathe('plastic_yellow' if x<0 else 'plastic_coral',x,1.09,.13,
                    [(0,0),(.105,0),(.105,.31),(.082,.34),(0,.34)],n=10,hero=True)
            a.cyl('paint_white',x,1.43,.13,.09,.035,n=10)
            a.box('steel',x,1.12,.25,.035,.04,.075)
        a.box('wicker',.36,1.09,-.29,.34,.075,.31)
        for i in range(4):a.sph('coconut',.25+(i%2)*.13,1.20,-.35+(i//2)*.11,.06,n=8)
        a.box('steel',0,.30,.06,1.16,.055,.06)


def cooler(p, lod):
    a=p.body
    for x in (-.36,.36):
        for z in (-.26,.26):a.box('wood_weathered',x,0,z,.08,.66,.08)
    a.box('wood_teak',0,.61,0,.90,.06,.70)
    a.box('plastic_blue',0,.67,0,.84,.43,.58,r=0 if lod else .035)
    lid=p.pivot('lid',COOLER_PIVOT['position'],axis=[1,0,0],motion='hinge')
    lid.box('paint_white',0,0,.29,.86,.06,.61,r=0 if lod else .018)
    if not lod:
        for z in (-.26,.26):a.box('wood_teak',0,.19,z,.75,.06,.05)
        for x in (-.36,.36):
            a.box('wood_teak',x,.17,0,.055,.065,.56)
            bar(a,'steel',(x*1.2,.91,-.09),(x*1.2,.91,.09),.018,6)
        a.box('steel',0,.96,.302,.07,.10,.02)


def easel(p, lod):
    a=p.body
    a.box('wood_teak',0,.30,.16,.74,.90,.065)
    front_panel(a,'menu',0,.36,.196,.62,.78)
    for x in (-.30,.30):
        bar(a,'wood_teak',(x,0,-.29),(x,1.16,.17),.028,4)
        bar(a,'wood_teak',(x,0,.29),(x,.37,.17),.028,4)
    if not lod:
        for x in (-.34,.34):a.box('wood_weathered',x,.29,.20,.05,.91,.035)
        for y in (.30,1.16):a.box('wood_weathered',0,y,.20,.74,.04,.035)
        for x in (-.3,.3):
            a.tube('steel',[(x,.43,-.14),(x,.39,-.01),(x,.43,.17)],.006,n=4)
        a.box('wood_teak',0,.06,-.26,.62,.045,.05)
        a.box('wood_teak',0,.26,.24,.74,.04,.12)


def tower(p, lod):
    a=p.body
    for x in (-.82,.82):
        for z in (-.62,.62):
            a.box('paint_white',x,0,z,.13,1.70,.13)
    a.box('wood_weathered',0,1.65,0,2.02,.08,1.64)
    # Low red panels, open eye-level front observation window.
    a.box('paint_red',0,1.73,.64,1.76,.54,.065)
    for x in (-.85,.85):a.box('paint_red',x,1.73,0,.065,.57,1.28)
    # Rear hatch is an actual opening, not superimposed over a solid wall.
    if lod:
        for x in (-.60,.60):
            panel(a,'paint_white',[(x-.215,1.73,-.65),(x+.215,1.73,-.65),
                                   (x+.215,2.95,-.65),(x-.215,2.95,-.65)],(0,0,-1))
        panel(a,'paint_white',[(-.39,1.73,-.65),(.39,1.73,-.65),(.39,2.02,-.65),(-.39,2.02,-.65)],(0,0,-1))
        panel(a,'paint_white',[(-.39,2.72,-.65),(.39,2.72,-.65),(.39,2.95,-.65),(-.39,2.95,-.65)],(0,0,-1))
    else:
        for x in (-.60,.60):a.box('paint_white',x,1.73,-.62,.43,1.22,.065)
        a.box('paint_white',0,1.73,-.62,.78,.29,.065)
        a.box('paint_white',0,2.72,-.62,.78,.23,.065)
    for x in (-.85,.85):
        for z in (-.62,.62):a.box('paint_white',x,2.27,z,.08,.68,.08)
    a.box('paint_white',0,2.90,.63,1.78,.09,.08)
    hipped_roof(a,'paint_white',2.20,2.20,2.98,3.17,.45)
    bar(a,'steel',(.72,3.06,-.65),(.72,3.60,-.65),.017,3 if lod else 6)
    # Ladder remains separately legible in the far model.
    for x in (-.34,.34):bar(a,'paint_white',(x,.025,1.05),(x,1.78,.56),.031,4 if lod else 6)
    if lod:
        for y in (.45,1.02,1.58):
            z=1.05-.49*y/1.78
            a.box('wood_weathered',0,y,z,.68,.042,.075)
    else:
        for i in range(6):
            y=.18+i*.275;z=1.05-.49*y/1.78
            a.box('wood_weathered',0,y,z,.68,.046,.095)
        for x in (-.82,.82):
            bar(a,'paint_white',(x,.22,-.58),(x,1.55,.58),.028,4)
            bar(a,'paint_white',(x,.22,.58),(x,1.55,-.58),.028,4)
        bar(a,'paint_white',(-.75,.20,-.62),(.75,1.55,-.62),.028,4)
        bar(a,'paint_white',(.75,.20,-.62),(-.75,1.55,-.62),.028,4)
        for x in (-.85,.85):a.box('paint_white',x,2.27,0,.12,.055,1.40)
        a.box('paint_white',0,2.26,.69,1.90,.06,.20)
        a.box('paint_white',0,1.91,.68,1.20,.25,.025)
        front_panel(a,'sign_salvavidas',0,1.935,.696,1.13,.20)
        # Roof lip and side boards show the timber scale at eye height.
        for x in (-1.07,1.07):a.box('paint_red',x,2.93,0,.065,.07,2.2)
        for z in (-1.07,1.07):a.box('paint_red',0,2.93,z,2.2,.07,.065)
        for y in (1.83,2.02,2.20):
            for x in (-.887,.887):a.box('paint_white',x,y,0,.014,.018,1.28)
    flap=p.pivot('rear_flap',TOWER_PIVOT['position'],axis=[1,0,0],motion='hinge')
    flap.box('paint_white',0,-.65,-.025,.74,.65,.055)
    if not lod:
        flap.box('paint_red',0,-.59,-.058,.64,.055,.025)
        flap.box('steel',.26,-.53,-.06,.07,.025,.04)
        for x in (-.29,.29):flap.box('steel',x,-.015,-.065,.075,.035,.04)


def rescue_buoy(p,lod):
    a=p.body
    # Eight-sided tapered rescue can with a flat resting face.
    rings=[]
    for z,w,h in ((-.43,.055,.07),(-.31,.16,.115),(.31,.16,.115),(.43,.055,.07)):
        rings.append([(-w*.65,.01,z),(w*.65,.01,z),(w,.035,z),(w,h-.02,z),
                      (w*.65,h,z),(-w*.65,h,z),(-w,h-.02,z),(-w,.035,z)])
    for r,s in zip(rings,rings[1:]):
        for i in range(8):
            j=(i+1)%8;panel(a,'paint_red',[r[i],r[j],s[j],s[i]])
    panel(a,'paint_red',list(reversed(rings[0])),(0,0,-1))
    panel(a,'paint_red',rings[-1],(0,0,1))
    # Base rests on y=0, with straps separated from the red shell.
    a.box('rubber',0,0,0,.11,.012,.39)
    if not lod:
        for x in (-.122,.122):
            for z in (-.17,.17):
                a.box('black',x,.105,z,.052,.004,.14)
                bar(a,'paint_red',(x,.115,z-.071),(x,.115,z+.071),.013,6)
        pts=[]
        for i in range(23):
            t=i*math.tau/11;r=.055+.025*i/22
            pts.append((math.cos(t)*r,.123,-.02+math.sin(t)*r))
        a.tube('rope',pts,.004,n=4)


def first_aid(p,lod):
    a=p.body
    a.box('paint_white',0,0,0,.42,.25,.28,r=0 if lod else .018)
    front_panel(a,'first_aid',0,.025,.141,.31,.19)
    lid=p.pivot('lid',AID_PIVOT['position'],axis=[1,0,0],motion='hinge')
    lid.box('paint_white',0,0,.12,.42,.03,.28,r=0 if lod else .015)
    if not lod:
        lid.tube('steel',[(-.08,.03,.12),(-.08,.05,.12),(.08,.05,.12),(.08,.03,.12)],.009,n=4)
        a.box('steel',0,.19,.145,.045,.07,.014)
        for x in (-.13,.13):a.box('steel',x,.225,-.15,.055,.055,.018)


def flag(p,lod):
    a=p.body
    a.box('steel',-.35,0,0,.20,.035,.22)
    bar(a,'steel',(-.35,.02,0),(-.35,2.02,0),.016,3 if lod else 8)
    flap=p.pivot('flag',FLAG_PIVOT['position'],axis=[0,1,0],motion='flap')
    n=1 if lod else 6
    for i in range(n):
        x0=.78*i/n;x1=.78*(i+1)/n
        z0=.065*math.sin(i*math.pi*2/n);z1=.065*math.sin((i+1)*math.pi*2/n)
        panel(flap,'flag_red',[(x0,-.025*x0,z0),(x1,-.025*x1,z1),
                               (x1,-.46-.025*x1,z1),(x0,-.46-.025*x0,z0)],(0,0,1))
    if not lod:
        a.tube('rope',[(-.365,.14,.022),(-.365,1.80,.022),(-.365,1.80,-.022),(-.365,.14,-.022)],.003,n=3)


def lamp(p,lod):
    a=p.body
    if lod:
        a.box('steel',0,0,0,.18,.73,.18)
        a.box('canvas_cream',0,.73,0,.26,.22,.26)
        a.box('steel',0,.95,0,.32,.08,.32)
        return
    a.lathe('steel',0,0,0,[(.12,0),(.12,.075),(.09,.12),(.09,.73)],n=8,hero=True)
    a.lathe('canvas_cream',0,.73,0,[(.13,0),(.13,.22)],n=8,hero=True)
    a.lathe('steel',0,.95,0,[(.16,0),(.16,.045),(.12,.08),(0,.08)],n=8,hero=True)


def bench(p,lod):
    a=p.body
    if lod:
        a.box('wood_weathered',0,.43,.02,1.85,.05,.53)
        a.box('wood_weathered',0,.60,-.26,1.85,.32,.045)
        for x in (-.62,.62):a.box('steel',x,0,0,.06,.43,.52)
        return
    for z in (-.20,-.09,.02,.13,.24):a.box('wood_weathered',0,.43,z,1.85,.05,.094,r=.015)
    for y in (.60,.71,.82):a.box('wood_weathered',0,y,-.27,1.85,.09,.045)
    for x in (-.68,.68):
        for z in (-.20,.24):a.box('steel',x,0,z,.055,.44,.055)
        a.box('steel',x,.39,.02,.055,.05,.57)
        a.box('steel',x,.43,-.27,.055,.49,.055)
        a.tube('steel',[(x,.48,.25),(x,.65,.25),(x,.68,.16),(x,.68,-.23),(x,.62,-.27)],.024,n=6)
        for z in (-.20,.24):a.box('steel',x,0,z,.15,.025,.13)


def bin_(p,lod):
    a=p.body
    if lod:
        a.box('wood_weathered',0,0,0,.46,.74,.46)
        a.box('paint_red',0,.74,-.13,.49,.15,.20)
        a.box('paint_red',0,.89,0,.52,.07,.52)
        return
    a.lathe('steel',0,0,0,[(.21,0),(.21,.74),(.235,.77)],n=12,hero=True)
    for i in range(14):
        t=math.tau*i/14
        a.box('wood_weathered',math.sin(t)*.224,.055,math.cos(t)*.224,.065,.64,.035,ry=t)
    a.lathe('paint_red',0,.72,0,[(.245,0),(.245,.035),(.232,.045)],n=14,hero=True)
    for x in (-.22,.22):a.box('paint_red',x,.76,0,.055,.13,.44)
    a.box('paint_red',0,.76,-.215,.44,.13,.055)
    a.box('paint_red',0,.89,0,.52,.07,.52,r=.02)
    a.box('black',0,.755,.015,.39,.006,.36)


def bike_rack(p,lod):
    a=p.body
    for z in (-.23,.23):a.box('steel',0,0,z,1.8,.035,.09)
    for x in (-.72,0,.72):
        if lod:
            # Four-sided bars avoid destroying the open hoop silhouette.
            a.tube('steel',[(x,.035,-.22),(x,.77,-.22),(x,.77,.22),(x,.035,.22)],.029,n=3,caps=False)
        else:
            pts=[(x,.035,-.22),(x,.56,-.22)]
            for i in range(7):
                t=math.pi*i/6
                pts.append((x,.56+.21*math.sin(t),-.21*math.cos(t)))
            pts.append((x,.035,.22))
            a.tube('steel',pts,.03,n=8,caps=False)
            for z in (-.22,.22):a.box('steel',x,.035,z,.13,.022,.12)


def fountain(p,lod):
    a=p.body
    a.box('steel',0,0,-.04,.30,.78,.31,r=0 if lod else .035)
    if lod:
        a.box('paint_white',0,.78,.01,.50,.10,.54)
        a.tube('steel',[(0,.87,-.15),(0,1.06,-.15),(0,1.06,.015)],.016,n=3,caps=False)
        return
    # Rim and concave basin are modelled, not a solid slab.
    a.lathe('paint_white',0,.78,.01,[(.18,0),(.24,.045),(.25,.09),(.235,.10),
                                    (.205,.071),(.07,.015),(.035,.01)],
            n=16,hero=True,scl=(1,1,1.08))
    a.cyl('steel',0,.791,.01,.037,.008,n=10)
    a.tube('steel',[(0,.88,-.15),(0,1.02,-.15),(0,1.045,-.12),
                    (0,1.045,-.015),(0,1.02,.01)],.016,n=8)
    a.box('steel',.18,.80,-.08,.055,.035,.07)
    a.box('paint_red',.18,.838,-.08,.035,.01,.04)
    for x in (-.13,.13):a.box('steel',x,.05,.12,.018,.64,.018)


def railing(p,lod):
    a=p.body
    for x in (-.96,.96):a.box('paint_white',x,0,0,.08,.95,.10)
    a.box('paint_white',0,.90,0,2.0,.05,.12)
    if lod:
        a.box('paint_white',0,.16,0,1.92,.04,.04)
        for x in (-.48,0,.48):a.box('paint_white',x,.2,0,.03,.70,.03)
    else:
        a.box('paint_white',0,.14,0,1.92,.045,.045)
        for i in range(11):a.box('paint_white',-.80+i*.16,.185,0,.025,.715,.025)
        for x in (-.96,.96):
            a.box('steel',x,0,0,.08,.035,.12)
            a.box('paint_white',x,.95-.03,0,.08,.03,.10,r=.018)


def steps(p,lod):
    a=p.body;w,h,d=p.cat['size'];n=round(h/.154)
    # Side silhouette follows each real riser even in LOD1. Ground is the
    # lowest front edge; the highest tread is at -Z (toward the promenade).
    if lod:
        # Open underside; merge coplanar treads/riser into boundary faces.
        for i in range(n):
            z0=d/2-(i+1)*.28;z1=z0+.28;y=.154*(i+1)
            panel(a,'seawall',[(-w/2,y,z0),(w/2,y,z0),(w/2,y,z1),(-w/2,y,z1)],(0,1,0))
            panel(a,'seawall',[(-w/2,y-.154,z1),(w/2,y-.154,z1),
                               (w/2,y,z1),(-w/2,y,z1)],(0,0,1))
        for side in (-1,1):
            x=side*w/2
            # One rectangle plus one triangular stair wedge per tread.
            for i in range(n):
                z0=d/2-(i+1)*.28;z1=z0+.28;y=.154*(i+1)
                panel(a,'seawall',[(x,0,z0),(x,y,z0),(x,y,z1),(x,0,z1)],(side,0,0))
        panel(a,'seawall',[(-w/2,0,-d/2),(w/2,0,-d/2),(w/2,h,-d/2),(-w/2,h,-d/2)],(0,0,-1))
    else:
        for i in range(n):
            z0=d/2-(i+1)*.28;z1=z0+.28;y=.154*(i+1)
            a.box('seawall',0,0,(z0+z1)/2,w,y,.28)
            a.box('wood_weathered',0,y+.001,z1-.035,w-.07,.003,.05)
            # Fine shallow grooves are actual anti-slip strips at near range.
            for j in range(3):
                a.box('rock_salt',0,y+.001,z0+.075+j*.055,w-.10,.001,.009)


def shower(p,lod):
    a=p.body
    a.box('seawall',0,0,0,.44,.035,.76)
    points=[(0,.035,-.20),(0,2.18,-.20),(0,2.32,-.15),(0,2.32,.17),(0,2.25,.22)]
    if lod:
        a.tube('steel',points,.024,n=3,caps=False)
        a.box('steel',0,2.20,.22,.22,.05,.24)
        return
    a.tube('steel',points,.024,n=8)
    a.lathe('steel',0,2.19,.22,[(.10,0),(.115,.025),(.05,.06),(0,.06)],n=12,hero=True)
    a.tube('steel',[(0,1.04,-.20),(.10,1.04,-.20)],.025,n=8)
    a.cyl('plastic_blue',.10,1.04,-.20,.04,.025,n=10,rx=math.pi/2)
    for z in (-.28,-.14,0,.14,.28):a.box('black',0,.036,z,.33,.002,.014)
    for i in range(8):
        t=math.tau*i/8
        a.cyl('black',math.cos(t)*.075,2.188,.22+math.sin(t)*.075,.005,.004,n=3)
    for y in (.08,.76,1.8):a.lathe('steel',0,y,-.20,[(.035,0),(.035,.025)],n=8,hero=True)


BUILDERS = {
    'beach_kiosk':kiosk, 'beach_vendor_cart':cart, 'beach_cooler_stand':cooler,
    'beach_sign_easel':easel, 'beach_lifeguard_tower':tower,
    'beach_rescue_buoy':rescue_buoy, 'beach_first_aid':first_aid,
    'beach_red_flag':flag, 'beach_lamp':lamp, 'beach_bench':bench,
    'beach_bin':bin_, 'beach_bike_rack':bike_rack, 'beach_fountain':fountain,
    'beach_railing':railing, 'beach_steps_small':steps,
    'beach_steps_medium':steps, 'beach_steps_wide':steps, 'beach_shower':shower,
}


def build(key, cat, lod):
    from beach_props_geometry import Prop
    p=Prop(key+'_lod1' if lod else key,cat,lod)
    BUILDERS[key](p,lod)
    return p
