"""Original vintage oil-filled electrical equipment shared by both variants.

Shapes are visual assets, not construction drawings or clearance certification.
All dimensions are nominal metre envelopes. Switchgear, radiator fins and
porcelain units are separate linked mesh instances; doors and blades pivot.
"""
import math
import substation_common as C

P = 'substation_paint'
S = 'substation_galvanised'
D = 'substation_dark'
B = 'substation_porcelain'
CON = 'substation_concrete'


def spec(family, size, description, pivots=(), **kw):
    return {'family': family, 'shared': True, 'variant': 'shared', 'size': list(size),
            'footprint': [size[0], size[2]], 'pivots': list(pivots),
            'description': description, **kw}


CATALOGUE = {
 'substation_grid_transformer': spec('transformer', (6.8, 6.4, 5.4), '40 MVA oil-filled grid transformer: conservator, Buchholz relay, OLTC, 3 HV + 3 MV + neutral bushings, radiator banks, four fan rotors and marshalling kiosk.', ['marshalling_door', 'tapchanger_door', 'fan_0', 'fan_1', 'fan_2', 'fan_3'], mva=40),
 'substation_distribution_transformer': spec('transformer', (4.8, 4.5, 3.6), '15 MVA oil-filled distribution transformer, conservator, porcelain primary bushings and low-voltage cable box.', ['marshalling_door', 'tapchanger_door', 'fan_0', 'fan_1', 'fan_2', 'fan_3'], mva=15),
 'substation_oil_breaker_hv': spec('breaker', (3.6, 5.0, 2.7), 'Outdoor dead-tank bulk-oil circuit breaker with three porcelain bushings, oil gauges and separate mechanism door.', ['mechanism_door']),
 'substation_oil_breaker_mv': spec('breaker', (2.4, 2.9, 1.8), 'Medium-voltage outdoor bulk-oil breaker with three phase bushings and operating mechanism.', ['mechanism_door']),
 'substation_breaker_truck': spec('indoor', (.68, 1.15, 1.0), 'Withdrawable oil-breaker truck with three oil pots, six plug contacts and four small wheels.', ['truck_handle']),
 'substation_portal_gantry': spec('switchgear', (8.0, 8.6, 2.0), 'Bolted twin-leg lattice portal with three hanging tension-insulator strings and cable attachment eyes.'),
 'substation_disconnector_centre': spec('switchgear', (3.4, 3.7, 1.3), 'Centre-break disconnector on two porcelain columns; both blades pivot about the column axes.', ['blade_left', 'blade_right']),
 'substation_disconnector_pantograph': spec('switchgear', (2.0, 5.5, 1.5), 'Pantograph disconnector with lower scissor arms, upper linkage and contact shoe.', ['pantograph_lower', 'pantograph_upper']),
 'substation_current_transformer': spec('instrument', (.9, 3.8, .9), 'Oil current transformer with porcelain column, terminal head, secondary box and bolted base.'),
 'substation_voltage_transformer': spec('instrument', (.85, 4.0, .85), 'Capacitor voltage transformer with stacked porcelain capacitors and oil-filled electromagnetic base.'),
 'substation_surge_arrester': spec('instrument', (.55, 3.7, .55), 'Brown porcelain surge arrester, upper terminal, earth strap and discharge counter.'),
 'substation_post_insulator': spec('insulator', (.4, 1.65, .4), 'Flanged porcelain post insulator with twelve individual sheds.'),
 'substation_earth_switch': spec('switchgear', (1.1, 1.8, .75), 'Earthing switch with rotating grounded knife, insulator and operating lever.', ['earth_blade']),
 'substation_busbar_tube': spec('conductor', (6.0, .16, .16), 'Six-metre tubular aluminium busbar section with end collars; no long overhead line is baked.'),
 'substation_busbar_wire_segment': spec('conductor', (.04, 1.0, .04), 'One-metre straight wire unit along local +Y for catenary runtime instancing.'),
 'substation_bushing': spec('insulator', (.45, 1.6, .45), 'Generic hollow porcelain bushing with terminal and mounting flange.'),
 'substation_insulator_disc': spec('insulator', (.34, .17, .34), 'One cap-and-pin suspension-insulator unit; repeated units share actual mesh data.'),
 'substation_insulator_string': spec('insulator', (.36, 2.4, .36), 'Twelve cap-and-pin discs with terminal shackles, supplied separately for line assemblies.'),
 'substation_spacer': spec('line_fitting', (.9, .14, .9), 'Four-conductor bundle spacer with central damper and four clamps.'),
 'substation_radiator_fin': spec('transformer_fitting', (.08, 1.9, .72), 'Pressed steel radiator fin with rolled edges and upper/lower oil ports.'),
 'substation_switchboard_panel': spec('indoor', (.8, 2.3, 1.25), 'Metal-clad lower-voltage switchboard cubicle with two hinged doors, meters, relays and a mimic bus strip.', ['upper_door', 'breaker_door']),
 'substation_control_panel': spec('indoor', (1.0, 2.2, .6), 'Control-room protection panel with analog meters, relay windows, mimic strip and hinged door.', ['panel_door']),
 'substation_battery_bank': spec('indoor', (1.9, 1.3, .65), 'Two-tier rack of station lead-acid cells with coloured terminal caps, links and spill trays.'),
 'substation_charger': spec('indoor', (.7, 1.5, .65), 'DC battery charger cabinet with vents, two analog meters and a service door.', ['charger_door']),
 'substation_desk': spec('indoor', (1.5, .76, .75), 'Worn control-room desk with drawer, cable opening and steel legs.', ['desk_drawer']),
 'substation_chair': spec('indoor', (.55, .9, .55), 'Plain padded control-room chair with steel legs and a separate seat anchor.'),
 'substation_schematic_board': spec('indoor', (1.8, 1.2, .08), 'Framed wall-mounted single-line schematic with a variant atlas plate.'),
 'substation_trench_cover': spec('site', (1.2, .09, .7), 'Liftable concrete cable-trench cover with twin recessed lifting eyes.'),
 'substation_transformer_bund': spec('site', (9.0, .6, 7.2), 'Open concrete oil bund, gravel floor, drain channel and accessible sump grate.'),
 'substation_fire_wall': spec('site', (.35, 6.0, 7.0), 'Concrete separation wall with expansion joints and weathered footing.'),
 'substation_oil_store': spec('site', (3.0, 2.6, 2.4), 'Roofed oil-store cage with ventilated sides, bunded floor, three drums and a hinged gate.', ['oil_store_door']),
 'substation_station_service_transformer': spec('transformer', (2.0, 2.1, 1.8), 'Small oil-filled station-service transformer with cooling ribs and cable terminations.'),
 'substation_floodlight_mast': spec('site', (2.4, 10.0, .65), 'Tapered steel mast with twin pivoting floodlights, access hatch, base plate and ladder cleats.', ['lamp_left', 'lamp_right']),
 'substation_lightning_mast': spec('site', (.6, 14.0, .6), 'Free-standing lightning mast with air terminal, flanged foot and earthing strap.'),
 'substation_earth_marker': spec('site', (.25, .3, .25), 'Flush earthing inspection marker with bolted brass lid.'),
 'substation_hazard_board': spec('sign', (1.1, 2.3, .12), 'Freestanding primary electrical-hazard board with variant-language atlas face.'),
 'substation_tag_holder': spec('sign', (.5, .36, .06), 'Riveted equipment tag plate holder with variant tag atlas face.'),
 'substation_gravel_tile': spec('ground', (2.0, .05, 2.0), 'Two-metre gravel tile with a shallow slab and individually raised stones.'),
 'substation_concrete_tile': spec('ground', (2.0, .12, 2.0), 'Two-metre weathered concrete paving tile with edge joints and moss patches.'),
 'substation_dry_weeds': spec('vegetation', (.5, .55, .5), 'Sparse dry weeds for Colombian gravel; individual narrow blades share the vegetation cell.'),
}


def disc(a, lod, r=.17, h=.17):
    if lod:
        a.cyl(B, 0, 0, 0, r, h, n=4, r1=r*.55)
    else:
        # Open inner bore is concealed by the common core/connecting pin.
        profile=[(r*.40, 0), (r, h*.35), (r*.94, h*.52), (r*.40, h)]
        a.lathe(B, 0, 0, 0, profile, n=8, hero=True)
        a.cyl(S, 0, h*.78, 0, r*.25, h*.22, n=4, caps=False)


def porcelain(assembly, suffix, x, y, z, h, r, lod, count=8):
    body=assembly.body
    if lod:
        a=assembly.part(suffix+'-ceramic',(x,y,z),cache=(suffix,h,r,'far'))
        a.cyl(B,0,0,0,r*.68,h,n=4)
        for i in range(2):
            a.cyl(B,0,h*(.23+i*.48),0,r,h*.12,n=4,r1=r*.64)
    else:
        body.cyl(B,x,y,z,r*.37,h,n=8)
        for i in range(count):
            a=assembly.part(suffix+'-shed_'+str(i),(x,y+i*h/count,z),cache=('porcelain',r,h/count))
            disc(a,0,r,h/count)
    body.cyl(S,x,y-.02,z,r*.76,.055,n=4 if lod else 8)
    body.cyl(S,x,y+h,z,r*.32,.12,n=4 if lod else 8)


def fin(a,lod,h=1.9,d=.72,w=.08):
    a.box(P,0,0,0,w,h,d)
    if not lod:
        for z in (-d*.4,d*.4):
            a.box(S,0,.04,z,w*.8,h-.08,.025)


def sign_rect(index):
    x,y=index%4,index//4
    return ((x*512+8)/2048,(1024-(y+1)*128+8)/1024,((x+1)*512-8)/2048,(1024-y*128-8)/1024)


def labelled_plate(assembly,suffix,position,w,h,index,lod):
    a=assembly.part(suffix,position)
    a.sign_cell=sign_rect(index)
    C.plate(a,'substation_signs',0,0,.003,w,h)
    if not lod:
        for x in (-w*.46,w*.46):
            C.bolt(a,x,h*.12,.006,.012)
    return a


def transformer(m,cat,lod):
    a=m.body
    grid='grid_transformer' in m.base_key
    # Grid and distribution units are deliberately one recognisable family.
    tankw,tankh,tankd=(4.0,3.0,2.8) if grid else (3.0,2.25,2.1)
    s=1 if grid else .72
    a.box(CON,0,0,0,6.8*s,.22,5.4*s)
    for z in (-tankd*.34,tankd*.34):
        a.box(S,0,.22,z,tankw+.2,.25,.24)
    a.box(P,0,.47,0,tankw,tankh,tankd,r=0 if lod else .06)
    a.box(S,0,.47+tankh,0,tankw+.15,.12,tankd+.15)
    if not lod:
        for x in (-tankw/2,tankw/2):
            for z in (-tankd*.4,0,tankd*.4):
                C.bar(a,S,(x,.5,z),(x,.47+tankh,z),.026,n=4)
        for x in (-tankw*.4,0,tankw*.4):
            C.bolt(a,x,.47+tankh+.06,tankd/2+.08,.04)
    # Front and rear radiator banks: common fin mesh data at independent nodes.
    for side in (-1,1):
        count=4 if lod else 12
        for i in range(count):
            x=(i/(count-1)-.5)*(tankw+.4)
            z=side*(tankd/2+.52*s)
            f=m.part('radiator_'+str(side)+'_'+str(i),(x,.75*s,z),cache=('radiator',s,lod))
            fin(f,lod,2.0*s,.8*s,.10*s if not lod else .32*s)
        for yy in (.85*s,2.65*s):
            C.bar(a,P,(-tankw*.53,yy,side*(tankd/2+.52*s)),(tankw*.53,yy,side*(tankd/2+.52*s)),.09*s,n=4 if lod else 8)
    # Conservator, expansion pipe with Buchholz relay, breather, oil level gauge.
    cy=.47+tankh+.78*s
    a.hcyl(P,0,cy,-.5*s,.48*s,3.5*s,n=4 if lod else 12)
    for x in (-1.1*s,1.1*s):
        C.bar(a,S,(x,.47+tankh,0),(x,cy-.4*s,-.5*s),.07*s,n=4)
    C.bar(a,P,(0,cy-.35*s,-.5*s),(0,.47+tankh,.4*s),.07*s,n=4 if lod else 8)
    a.box('substation_rust',0,cy-.43*s,-.15*s,.27*s,.22*s,.23*s)
    if not lod:
        a.cyl('substation_glass',1.45*s,2.4*s,.65*s,.08*s,.4*s,n=8)
        a.hcyl('substation_white',1.79*s,cy,-.5*s,.18*s,.02*s,n=12)
        C.bar(a,D,(1.81*s,cy,-.5*s),(1.82*s,cy+.12*s,-.5*s),.012,n=4)
    # HV at rear and MV at front. Neutral is a seventh, smaller bushing.
    for i,x in enumerate((-1.35*s,0,1.35*s)):
        porcelain(m,'hv_'+str(i),x,.6+tankh,-.75*s,1.95*s,.235*s,lod,8)
        if grid:
            porcelain(m,'mv_'+str(i),x,.6+tankh,.78*s,1.05*s,.18*s,lod,5)
    porcelain(m,'neutral',tankw/2-.23*s,.6+tankh,.1*s,.75*s,.14*s,lod,4)
    # OLTC compartment and independently hinged marshalling kiosk.
    a.box(P,-tankw/2-.34*s,.55,0,.68*s,2.3*s,1.1*s)
    C.door(m,'tapchanger_door',(-tankw/2-.65*s,.72,.57*s),.61*s,1.78*s,lod)
    a.box(P,tankw/2+.36*s,.55,.7*s,.72*s,1.65*s,.72*s)
    C.door(m,'marshalling_door',(tankw/2+.03*s,.63,1.08*s),.65*s,1.45*s,lod)
    if not grid:
        a.box(P,0,.7,1.45,2.3,1.15,.7)
        if not lod:
            for x in (-.65,0,.65):
                a.cyl('substation_rubber',x,.4,1.46,.12,.32,n=8)
    # Four separately rotatable cooling fans face the visitor side.
    for i,x in enumerate((-1.75*s,-.6*s,.6*s,1.75*s)):
        y,z=1.35*s,tankd/2+1.02*s
        f=m.part('fan_'+str(i),(x,y,z))
        f.hcyl(D,0,0,0,.11*s,.16*s,axis='z',n=4 if lod else 8)
        for ang in (0,math.pi/2,math.pi,3*math.pi/2):
            f.box(S,math.sin(ang)*.18*s,math.cos(ang)*.18*s-.15*s,0,
                  (.10 if lod else .14)*s,.3*s,.045*s,rz=-ang)
        if not lod:
            ring=[(.36*s,.015),(.39*s,.015),(.39*s,.06),(.36*s,.06)]
            a.lathe(S,x,y,z,ring,n=12,hero=True,rot=(math.pi/2,0,0))
            for ang in (0,math.pi/2):
                C.bar(a,S,(x-.36*s*math.cos(ang),y-.36*s*math.sin(ang),z+.03),(x+.36*s*math.cos(ang),y+.36*s*math.sin(ang),z+.03),.012,n=4)
    labelled_plate(m,'rating_plate',(0,1.3*s,tankd/2+1.08*s),.64*s,.42*s,5 if grid else 22,lod)
    if not lod:
        for x in (-tankw*.35,tankw*.35):
            C.bar(a,'substation_copper',(x,.25,tankd/2),(x,1.0,tankd/2),.025,n=4)
        a.box('substation_oil',.6,.224,.8,1.0,.005,.5)


def oil_breaker(m,cat,lod):
    a=m.body;hv=m.base_key.endswith('_hv');s=1 if hv else .62
    a.box(CON,0,0,0,3.6*s,.2,2.7*s)
    for x in (-1.15*s,1.15*s):
        a.box(S,x,.2,0,.18*s,.7*s,1.55*s)
    a.hcyl(P,0,1.35*s,0,.65*s,3.1*s,n=4 if lod else 12)
    for i,x in enumerate((-1.08*s,0,1.08*s)):
        porcelain(m,'phase_'+str(i),x,1.75*s,0,2.85*s,.27*s,lod,10 if hv else 7)
    a.box(P,0,.35,1.05*s,.8*s,1.45*s,.5*s)
    C.door(m,'mechanism_door',(-.35*s,.42,1.32*s),.7*s,1.27*s,lod,louvres=True)
    if not lod:
        for x in (-1.56*s,1.56*s):
            a.hcyl(S,x,1.35*s,0,.68*s,.07*s,n=12)
            for z in (-.25*s,.25*s):
                C.bar(a,D,(x,.8*s,z),(x,1.8*s,z),.018,n=4)
        C.bar(a,'substation_copper',(-1.25*s,.22,.55*s),(-1.25*s,.9*s,.55*s),.02,n=4)
        a.hcyl('substation_white',.17*s,1.4*s,1.34*s,.11*s,.02,axis='z',n=10)


def breaker_truck(m,cat,lod):
    a=m.body
    a.box(S,0,.12,0,.68,.1,1.0)
    for x in (-.27,.27):
        for z in (-.36,.36):
            a.hcyl(D,x,.11,z,.11,.09,n=4 if lod else 8)
    for x in (-.21,0,.21):
        a.cyl(P,x,.22,0,.095,.5,n=4 if lod else 8)
        for z in (-.27,.27):
            a.cyl(B,x,.72,z,.055,.43 if lod else .28,n=4 if lod else 8)
            if not lod:
                a.cyl('substation_copper',x,1.0,z,.022,.15,n=8)
    p=m.part('truck_handle',(-.27,.7,.49))
    p.box(S,.27,0,0,.54,.045,.045)
    if not lod:
        for x in (-.28,.28):
            C.bar(a,S,(x,.22,.4),(x,.72,.4),.025,n=4)
        a.box(P,0,.25,.44,.5,.3,.06)


def lattice(a,x,y,z,w,h,d,lod):
    for xx in (-w/2,w/2):
        for zz in (-d/2,d/2):
            C.bar(a,S,(x+xx,y,z+zz),(x+xx,y+h,z+zz),.055 if not lod else .06,n=4)
    count=2 if lod else max(3,round(h/2.8))
    for j in range(count):
        y0,y1=y+h*j/count,y+h*(j+1)/count
        for zz in (-d/2,d/2):
            C.bar(a,S,(x-w/2,y0,z+zz),(x+w/2,y1,z+zz),.025,n=4)
            if not lod:
                C.bar(a,S,(x+w/2,y0,z+zz),(x-w/2,y1,z+zz),.025,n=4)
        if not lod:
            for xx in (-w/2,w/2):
                C.bar(a,S,(x+xx,y0,z-d/2),(x+xx,y1,z+d/2),.025,n=4)


def portal(m,cat,lod):
    a=m.body
    for x in (-3.55,3.55):
        a.box(CON,x,0,0,.9,.3,2.0)
        lattice(a,x,.3,0,.55,7.7,.65,lod)
    # Horizontal truss beam and three separate strings.
    for y in (7.8,8.5):
        for z in (-.35,.35):
            C.bar(a,S,(-3.7,y,z),(3.7,y,z),.06,n=4)
    for i in range(3 if lod else 8):
        x0=-3.7+7.4*i/(3 if lod else 8);x1=-3.7+7.4*(i+1)/(3 if lod else 8)
        for z in (-.35,.35):
            C.bar(a,S,(x0,7.8,z),(x1,8.5,z),.025,n=4)
    for i,x in enumerate((-2.6,0,2.6)):
        porcelain(m,'tension_'+str(i),x,5.8,0,1.8,.18,lod,9)


def disconnector(m,cat,lod):
    a=m.body;pant='pantograph' in m.base_key
    a.box(CON,0,0,0,2 if pant else 3.4,.22,1.5 if pant else 1.3)
    if pant:
        a.box(S,0,.22,0,1.0,1.3,.65)
        porcelain(m,'post',0,1.52,0,1.65,.22,lod,10)
        low=m.part('pantograph_lower',(-.65,3.24,0))
        C.bar(low,S,(0,0,0),(1.3,1.15,0),.055,n=4)
        C.bar(low,S,(1.3,0,.12),(0,1.15,.12),.055,n=4)
        up=m.part('pantograph_upper',(-.65,4.39,0))
        C.bar(up,S,(1.3,0,0),(.65,1.05,0),.055,n=4)
        C.bar(up,S,(0,0,.12),(.65,1.05,.12),.055,n=4)
        up.box('substation_copper',.65,1.03,.06,1.5,.08,.18)
        if not lod:
            for p in (low,up):
                for x in (0,1.3):
                    p.hcyl(D,x,0,.06,.1,.22,axis='z',n=8)
    else:
        for x in (-1.2,1.2):
            a.box(S,x,.22,0,.34,1.2,.42)
            porcelain(m,'post_'+str(x),x,1.42,0,2.05,.22,lod,11)
        for suffix,x,w in (('blade_left',-1.2,1.2),('blade_right',1.2,-1.2)):
            p=m.part(suffix,(x,3.57,0))
            C.bar(p,S,(0,0,0),(w,0,0),.055,n=4 if lod else 8)
            if not lod:
                p.box('substation_copper',w, -.04,0,.12,.08,.15)
        if not lod:
            C.bar(a,S,(-1.2,.65,.27),(1.2,.65,.27),.04,n=4)


def instrument(m,cat,lod):
    a=m.body;key=m.base_key
    w,h,d=cat['size']
    a.box(CON,0,0,0,w,.17,d)
    a.box(S,0,.17,0,w*.48,.83,d*.48)
    start=1.0;radius=w*.28
    if 'voltage' in key:
        a.box(P,0,.65,0,w*.85,.55,d*.85);start=1.2
    porcelain(m,'column',0,start,0,h-start-.3,radius,lod,11)
    if 'current' in key:
        a.box(P,0,h-.28,0,w*.95,.28,d*.65)
        for x in (-w*.42,w*.42):
            C.bar(a,'substation_copper',(x,h-.12,0),(x,h-.12,d*.36),.035,n=4)
    elif 'voltage' in key:
        a.cyl(S,0,h-.18,0,w*.24,.18,n=4 if lod else 8)
    else:
        C.bar(a,'substation_copper',(0,h-.28,0),(0,h,0),.035,n=4)
        if not lod:
            C.bar(a,'substation_copper',(w*.35,.12,0),(w*.35,.9,0),.018,n=4)
            a.box(D,w*.25,.45,d*.23,.13,.15,.09)
    a.box(P,0,.7,d*.46,w*.48,.3,.12)
    if not lod:
        for x in (-w*.35,w*.35):
            C.bolt(a,x,.08,d*.42,.025)


def insulator(m,cat,lod):
    a=m.body;key=m.base_key;w,h,d=cat['size']
    if key.endswith('_disc'):
        disc(a,lod,w/2,h)
    elif key.endswith('_string'):
        a.cyl(S,0,0,0,.045,h,n=4 if lod else 8)
        count=3 if lod else 12
        for i in range(count):
            p=m.part('disc_'+str(i),(0,.12+i*(h-.3)/count,0),cache=('suspension_disc',lod))
            disc(p,lod,w/2,.17 if not lod else .35)
    else:
        porcelain(m,'ceramic',0,.07,0,h-.23,w/2,lod,8 if 'bushing' in key else 12)
        a.cyl(S,0,0,0,w*.45,.07,n=4 if lod else 8)
        if not lod:
            for angle in (0,math.pi/2,math.pi,3*math.pi/2):
                a.cyl(S,math.cos(angle)*w*.34,0,math.sin(angle)*w*.34,.018,.1,n=6)


def panel(m,cat,lod):
    a=m.body;w,h,d=cat['size'];board='switchboard' in m.base_key
    C.cabinet(a,w,h,d,lod)
    if board:
        upper=C.door(m,'upper_door',(-w/2+.025,h*.55,d/2+.025),w-.05,h*.43,lod)
        lower=C.door(m,'breaker_door',(-w/2+.025,.06,d/2+.025),w-.05,h*.46,lod)
        face=upper;fy=.13
        if not lod:
            lower.box(D,w*.48,h*.21,.035,.36,.22,.02)
    else:
        face=C.door(m,'panel_door',(-w/2+.025,.06,d/2+.025),w-.05,h-.12,lod)
        fy=h*.58
    # Meters are geometrical recesses so recognisable without the signs atlas.
    if not lod:
        for x in (w*.24,w*.69):
            face.box(D,x,fy+.18,.027,.22,.20,.025)
            face.box('substation_white',x,fy+.205,.044,.185,.15,.008)
            C.bar(face,D,(x-.065,fy+.22,.052),(x+.035,fy+.31,.052),.006,n=4)
        for x in (w*.2,w*.45,w*.7):
            face.box(D,x,fy-.04,.03,.13,.13,.02)
            face.hcyl('substation_warning_yellow',x,fy-.14,.045,.025,.02,axis='z',n=8)
        face.box('substation_copper',w*.46,fy+.48,.032,w*.86,.018,.014)
        face.box('substation_copper',w*.46,fy+.40,.033,.018,.2,.014)
        a.box(D,0,.02,d/2+.02,w*.85,.025,.035)


def indoor(m,cat,lod):
    a=m.body;key=m.base_key;w,h,d=cat['size']
    if 'battery_bank' in key:
        for y in (.12,.73):
            a.box(S,0,y,0,w,.06,d)
            for i in range(3 if lod else 8):
                x=(i+.5)*w/(3 if lod else 8)-w/2
                cell=m.part('cell_'+str(y)+'_'+str(i),(x,y+.06,0),cache=('battery',lod))
                cell.box('substation_battery',0,0,0,w/(3 if lod else 8)-.025,.46,d*.78)
                if not lod:
                    for z in (-.16,.16):
                        cell.cyl('substation_copper',0,.46,z,.025,.05,n=6)
                    C.bar(cell,'substation_copper',(-.06,.49,-.16),(.06,.49,.16),.012,n=4)
        for x in (-w/2+.035,w/2-.035):
            a.box(S,x,0,0,.07,h,.56)
    elif 'charger' in key:
        C.cabinet(a,w,h,d,lod)
        f=C.door(m,'charger_door',(-w/2+.03,.06,d/2+.025),w-.06,h-.12,lod,louvres=True)
        if not lod:
            for x in (.18,.44):
                f.box(D,x,.95,.025,.18,.16,.025)
                f.box('substation_white',x,.97,.042,.14,.12,.008)
    elif key.endswith('_desk'):
        a.box('substation_wood',0,h-.055,0,w,.055,d)
        for x in (-w*.43,w*.43):
            for z in (-d*.40,d*.40):
                a.box(S,x,0,z,.045,h-.055,.045)
        drawer=m.part('desk_drawer',(-w*.38,h-.3,d*.35))
        drawer.box(P,.23,0,0,.46,.21,.12)
        if not lod:
            drawer.box(D,.23,.08,.071,.14,.025,.025)
            a.box(P,-w*.23,h-.31,.07,.49,.24,.5)
            a.box('substation_rubber',w*.30,h-.053,-d*.3,.12,.004,.06)
            for x in (-w*.43,w*.43):
                C.bar(a,S,(x,.14,-d*.40),(x,.14,d*.40),.018,n=4)
            for z in (-d*.40,d*.40):
                C.bar(a,S,(-w*.43,.55,z),(w*.43,.55,z),.018,n=4)
    elif key.endswith('_chair'):
        a.box('substation_rubber',0,.43,0,w,.065,d)
        a.box('substation_rubber',0,.6,-d*.41,w,.30,.07)
        if lod:
            for x in (-w*.37,w*.37):
                a.box(S,x,0,0,.035,.62,d*.75)
            return
        for x in (-w*.37,w*.37):
            for z in (-d*.37,d*.37):
                a.box(S,x,0,z,.025,.43,.025)
            C.bar(a,S,(x,.44,-d*.4),(x,.85,-d*.4),.02,n=4)
        if not lod:
            for x in (-w*.37,w*.37):
                C.bar(a,S,(x,.2,-d*.37),(x,.2,d*.37),.016,n=4)
    elif 'schematic' in key:
        a.box('substation_wood',0,0,0,w,h,d)
        # A real, deliberately simplified single-line diagram. The texture
        # cell supplies only the bilingual heading; its electrical symbols
        # are original geometry and remain readable against the light board.
        C.plate(a,'substation_white',0,.05,d/2+.001,w-.1,h-.1)
        title=m.part('schematic',(0,.05,d/2+.002))
        title.sign_cell=sign_rect(27)
        C.plate(title,'substation_signs',0,h-.25,.003,w-.16,.14)
        if not lod:
            for x in (-w*.42,w*.42):
                C.bolt(title,x,h-.2,.006,.012)
        face=d/2+.008
        stroke=.008 if not lod else .010

        def line(x0,y0,x1,y1,width=stroke):
            dx,dy=x1-x0,y1-y0
            length=math.hypot(dx,dy)
            nx,ny=-dy/length*width/2,dx/length*width/2
            points=[(x0+nx,y0+ny,face),(x1+nx,y1+ny,face),
                    (x1-nx,y1-ny,face),(x0-nx,y0-ny,face)]
            a._emit(D,(points,[(0,0,1)]*4,[(0,0),(1,0),(1,1),(0,1)],[(0,1,2),(0,2,3)]))

        def ring(x,y,radius):
            count=4 if lod else 16
            for i in range(count):
                angles=(math.tau*i/count,math.tau*(i+1)/count)
                points=[(x+rr*math.cos(t),y+rr*math.sin(t),face)
                        for rr,t in ((radius,angles[0]),(radius,angles[1]),
                                     (radius-stroke,angles[1]),(radius-stroke,angles[0]))]
                a._emit(D,(points,[(0,0,1)]*4,[(0,0),(1,0),(1,1),(0,1)],[(0,1,2),(0,2,3)]))

        def breaker(x,y):
            if lod:
                C.plate(a,D,x,y-.025,face,.05,.05)
                return
            for x0,y0,x1,y1 in ((x-.025,y-.025,x+.025,y-.025),
                                 (x+.025,y-.025,x+.025,y+.025),
                                 (x+.025,y+.025,x-.025,y+.025),
                                 (x-.025,y+.025,x-.025,y-.025)):
                line(x0,y0,x1,y1)

        # Incoming grid bus, two grid-transformer branches and a shared
        # medium-voltage bus. Overlapping rings denote the two windings.
        line(-.72,.91,.72,.91,.014)
        line(0,.985,0,.91)
        for x in (-.46,.46):
            line(x,.91,x,.87)
            breaker(x,.845)
            line(x,.82,x,.78)
            ring(x,.71,.07)
            ring(x,.60,.07)
            line(x,.53,x,.43)
        line(-.73,.43,-.04,.43,.014)
        line(.04,.43,.73,.43,.014)
        breaker(0,.43)
        line(-.04,.43,-.025,.43)
        line(.025,.43,.04,.43)
        # Four feeder breaker symbols and downward outgoing arrows.
        for x in (-.63,-.21,.21,.63):
            line(x,.43,x,.325)
            breaker(x,.30)
            line(x,.275,x,.125)
            points=[(x-.026,.145,face),(x,.095,face),(x+.026,.145,face)]
            a._emit(D,(points,[(0,0,1)]*3,[(0,1),(.5,0),(1,1)],[(0,1,2)]))
        if not lod:
            for x in (-w*.44,w*.44):
                C.bolt(a,x,.08,d/2+.02,.02)


def site_shared(m,cat,lod):
    a=m.body;key=m.base_key;w,h,d=cat['size']
    if key.endswith('_trench_cover'):
        a.box(CON,0,0,0,w,h,d)
        if not lod:
            for x in (-w*.32,w*.32):
                a.box(D,x,h-.01,0,.08,.012,.18)
                C.bar(a,S,(x,h,-.055),(x,h,.055),.008,n=4)
    elif key.endswith('_transformer_bund'):
        a.box('substation_gravel',0,0,0,w,.12,d)
        for x in (-w/2+.12,w/2-.12):
            a.box('substation_concrete_weathered',x,.12,0,.24,h-.12,d)
        for z in (-d/2+.12,d/2-.12):
            a.box('substation_concrete_weathered',0,.12,z,w,.48,.24)
        if not lod:
            a.box(D,w*.36,.122,d*.36,.75,.012,.75)
            for i in range(7):
                a.box(S,w*.36-.32+i*.106,.134,d*.36,.025,.025,.68)
            a.box('substation_oil',-.4,.121,.7,1.5,.004,.7)
            for x in (-2,0,2):
                a.box(D,x,.121,-d*.3,1.5,.01,.05)
    elif key.endswith('_fire_wall'):
        a.box('substation_concrete_weathered',0,0,0,w,h,d)
        if not lod:
            for z in (-2,0,2):
                a.box(D,w/2+.002,0,z,.004,h,.012)
            for y in (2,4):
                a.box(D,w/2+.002,y,0,.004,.012,d)
    elif key.endswith('_oil_store'):
        a.box(CON,0,0,0,w,.2,d)
        a.box('substation_roof',0,h-.1,0,w,.1,d)
        for x in (-w/2+.06,w/2-.06):
            for z in (-d/2+.06,d/2-.06):
                a.box(S,x,.2,z,.09,h-.3,.09)
            count=2 if lod else 7
            for i in range(count):
                z=-d/2+.12+(d-.24)*i/(count-1)
                a.box(S,x,.2,z,.035,h-.3,.035)
        for x in (-.8,0,.8):
            a.cyl(P,x,.2,-.25,.3,.9,n=4 if lod else 10)
            if not lod:
                for y in (.35,.9):
                    a.cyl(S,x,y,-.25,.306,.035,n=10)
        C.door(m,'oil_store_door',(-w/2+.08,.2,d/2),w-.16,h-.32,lod,louvres=True)
    elif key.endswith('_station_service_transformer'):
        a.box(CON,0,0,0,w,.14,d)
        a.box(P,0,.14,0,w*.68,1.2,d*.66)
        for i in range(3):
            porcelain(m,'phase_'+str(i),-.55+i*.55,1.34,0,.64,.1,lod,4)
        for side in (-1,1):
            count=2 if lod else 7
            for i in range(count):
                x=-.6+1.2*i/(count-1)
                p=m.part('fin_'+str(side)+'_'+str(i),(x,.32,side*.7))
                fin(p,lod,.8,.32,.07 if not lod else .23)
    elif key.endswith('_floodlight_mast'):
        a.box(CON,0,0,0,.65,.3,.65)
        a.cyl(S,0,.3,0,.14,9.2,n=4 if lod else 12,r1=.07)
        a.box(S,0,9.45,0,w-.12,.1,.12)
        for suffix,x in (('lamp_left',-.9),('lamp_right',.9)):
            p=m.part(suffix,(x,9.4,0))
            p.box(D,0,0,0,.6,.6,.4)
            if not lod:
                p.box('substation_lamp',0,.05,.21,.5,.48,.025)
                for xx in (-.26,.26):
                    p.box(S,xx,0,0,.025,.56,.42)
        if not lod:
            for y in range(1,9):
                C.bar(a,S,(-.18,y,.08),(.18,y,.08),.014,n=4)
            a.box(D,0,.4,.14,.12,.28,.025)
    elif key.endswith('_lightning_mast'):
        a.box(CON,0,0,0,w,.25,d)
        a.cyl(S,0,.25,0,.15,h-.75,n=4 if lod else 12,r1=.035)
        a.cyl('substation_copper',0,h-.5,0,.018,.5,n=4 if lod else 8)
        if not lod:
            for y in (3,6,9,12):
                a.cyl(S,0,y,0,.16*(1-y/h)+.025,.05,n=8)
            C.bar(a,'substation_copper',(.16,.12,0),(.16,1.2,0),.016,n=4)
    elif key.endswith('_earth_marker'):
        a.box(CON,0,0,0,w,h,d)
        # The lid clears the concrete by 3 mm, below the existing bolt tops.
        a.box('substation_copper',0,h-.012,0,w*.82,.015,d*.82)
        if not lod:
            for x in (-w*.28,w*.28):
                for z in (-d*.28,d*.28):
                    a.cyl(S,x,h,z,.012,.005,n=6)
    elif key.endswith('_hazard_board'):
        for x in (-w*.38,w*.38):
            a.box(S,x,0,0,.05,h,.05)
        a.box(S,0,h*.54,0,w,h*.46,.1)
        labelled_plate(m,'sign_face',(0,h*.56,.054),w*.93,h*.41,1,lod)
        if not lod:
            for x in (-w*.38,w*.38):
                a.box(CON,x,0,0,.12,.12,.12)
    elif key.endswith('_tag_holder'):
        a.box(S,0,0,0,w,h,d)
        labelled_plate(m,'tag_face',(0,.03,d/2+.004),w-.06,h-.06,6,lod)
        if not lod:
            for x in (-w*.43,w*.43):
                C.bolt(a,x,h*.5,d/2+.008,.015)
    elif key.endswith('_gravel_tile'):
        a.box('substation_gravel',0,0,0,w,h*.55,d)
        if not lod:
            for i in range(15):
                x=((i*37)%19)/19*w-w/2+.05
                z=((i*11)%17)/17*d-d/2+.05
                a.box('substation_gravel',x,h*.55,z,.08,h*.45,.06,ry=i*.7)
    elif key.endswith('_concrete_tile'):
        a.box('substation_concrete_weathered',0,0,0,w,h,d)
        if not lod:
            for x in (-w/2+.03,w/2-.03):
                a.box(D,x,h-.01,0,.012,.011,d-.06)
            for z in (-d/2+.03,d/2-.03):
                a.box(D,0,h-.01,z,w-.06,.011,.012)
            a.box('substation_moss',-.55,h+.001,-.7,.32,.004,.18)
    elif key.endswith('_dry_weeds'):
        # Retain the six extremal plants, including their branching blades.
        # This preserves the clump silhouette and height without a hidden cage.
        for i in ((0,2,3,4,13,14) if lod else range(16)):
            angle=i*2.399963
            r=.12*(.3+(i%5)/5)
            x,z=math.cos(angle)*r,math.sin(angle)*r
            ht=h*(.5+.5*((i*7)%11)/10)
            C.bar(a,'substation_dry_vegetation',(x,0,z),(x+math.cos(angle)*.14,ht,z+math.sin(angle)*.14),.006,n=3)
            C.bar(a,'substation_dry_vegetation',(x,ht*.45,z),(x+math.cos(angle)*.2,ht*.65,z+math.sin(angle)*.2),.004,n=3)


def small(m,cat,lod):
    a=m.body;key=m.base_key;w,h,d=cat['size']
    if key.endswith('_busbar_tube'):
        a.hcyl(S,0,h/2,0,h/2,w,n=4 if lod else 16)
        for x in (-w/2+.04,w/2-.04):
            a.hcyl(S,x,h/2,0,h*.52,.08,n=4 if lod else 16)
    elif key.endswith('_wire_segment'):
        a.cyl(S,0,0,0,w/2,h,n=4 if lod else 20)
    elif key.endswith('_radiator_fin'):
        fin(a,lod,h,d,w)
    elif key.endswith('_spacer'):
        for x in (-w*.4,w*.4):
            C.bar(a,S,(0,h/2,0),(x,h/2,-d*.4),.025,n=4 if lod else 8)
            C.bar(a,S,(0,h/2,0),(x,h/2,d*.4),.025,n=4 if lod else 8)
        for x in (-w*.4,w*.4):
            for z in (-d*.4,d*.4):
                a.cyl('substation_rubber',x,0,z,.09,h,n=4 if lod else 8)
                if not lod:
                    C.bolt(a,x,h*.55,z,.025)
        a.cyl('substation_rubber',0,0,0,.12,h,n=4 if lod else 8)
    elif key.endswith('_earth_switch'):
        a.box(CON,0,0,0,w,.12,d)
        porcelain(m,'post',0,.12,0,1.5,.15,lod,7)
        blade=m.part('earth_blade',(-.43,.22,0))
        C.bar(blade,'substation_copper',(0,0,0),(.43,1.58,0),.035,n=4 if lod else 8)
        if not lod:
            C.bar(a,S,(-.43,.22,.12),(-.43,.6,.12),.03,n=4)


def build(key,cat,lod):
    m=C.Assembly(key,cat,lod)
    if key in ('substation_grid_transformer','substation_distribution_transformer'):
        transformer(m,cat,lod)
    elif key.startswith('substation_oil_breaker_'):
        oil_breaker(m,cat,lod)
    elif key.endswith('_breaker_truck'):
        breaker_truck(m,cat,lod)
    elif key.endswith('_portal_gantry'):
        portal(m,cat,lod)
    elif 'disconnector_' in key:
        disconnector(m,cat,lod)
    elif key in ('substation_current_transformer','substation_voltage_transformer','substation_surge_arrester'):
        instrument(m,cat,lod)
    elif cat['family']=='insulator':
        insulator(m,cat,lod)
    elif key in ('substation_switchboard_panel','substation_control_panel'):
        panel(m,cat,lod)
    elif cat['family']=='indoor':
        indoor(m,cat,lod)
    elif cat['family'] in ('site','ground','sign','vegetation') or key.endswith('_station_service_transformer'):
        site_shared(m,cat,lod)
    else:
        small(m,cat,lod)
    return m
