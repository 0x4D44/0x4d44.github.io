"""Original modular substation civil works and transmission structures.

Geometry is authored in metres, +Y up, +Z front using the furniture pipeline.
No images, long conductors, engineering certification or runtime registration.
The catalogue envelopes are design dimensions, never post-export scale targets.
"""
import math
import furn_lib as F

WHITE = 0xFFFFFF


def material(name):
    return 'substation_' + name


def box(a, name, x, y, z, w, h, d, **kw):
    a.box(material(name), x, y, z, w, h, d, col=kw.pop('col', WHITE), **kw)


def beam(a, name, p, q, r=.05, far=False):
    a.tube(material(name), [p, q], r, n=3 if far else 4,
           col=WHITE, caps=False)


def face(a, name, pts, normal=None):
    normal = normal or F._unit(F._cross(F._sub(pts[1], pts[0]), F._sub(pts[2], pts[0])))
    a._emit(material(name), (pts, [normal] * len(pts),
                            [(0, 0), (1, 0), (1, 1), (0, 1)][:len(pts)],
                            [(0, i, i + 1) for i in range(1, len(pts) - 1)]), WHITE, False, ())


def plaque(a, name, x, y, z, w, h):
    face(a, name, [(x-w/2,y,z),(x+w/2,y,z),(x+w/2,y+h,z),(x-w/2,y+h,z)], (0,0,1))


def ceramic(a, x, y, z, length, far=False, horizontal=False, tower_string=False):
    """Shed profile retained near; far keeps the dark tapered string silhouette."""
    n = 4 if far else (6 if tower_string else 8)
    count = 2 if far else max(4, round(length/(.28 if tower_string else .19)))
    prof = [(0, 0), (.055, 0)]
    for j in range(count):
        yy = length*j/count
        prof += [(.055, yy), (.13 if not far else .09, yy+.03), (.06, yy+length/count*.74)]
    prof += [(.055, length), (0, length)]
    a.lathe(material('brown'), x, y, z, prof, n=n, col=WHITE,
            rot=(math.pi/2,0,0) if horizontal else (0,0,0), hero=True)


def tower(a, item, far):
    terminal = item['id'].endswith('terminal_132')
    W,H,D = item['size']
    base = 3.5 if terminal else 2.7
    # Main legs taper to the narrow upper cage. Genuine open lattice on all faces.
    levels = [(.10,base), (5,base*.79), (11,1.8), (17,1.1), (23,.85), (H-3,.6), (H-.10,.12)]
    if far:
        levels = [levels[0], levels[2], levels[3], levels[5], levels[6]]
    for sx in (-1,1):
        for sz in (-1,1):
            box(a,'concrete',sx*base,0,sz*base,1.0,.45,1.0)
            for (yy,rr),(yn,rn) in zip(levels,levels[1:]):
                beam(a,'steel',(sx*rr,yy+.2,sz*rr),(sx*rn,yn,sz*rn),.105 if not far else .13,far)
    for layer,((yy,rr),(yn,rn)) in enumerate(zip(levels,levels[1:])):
        for axis in (0,2):
            for side in (-1,1):
                def p(sign,y,r):
                    return (sign*r,y,side*r) if axis==0 else (side*r,y,sign*r)
                beam(a,'steel',p(-1,yy,rr),p(1,yy,rr),.045,far)
                beam(a,'steel',p(-1,yy,rr),p(1,yn,rn),.052,far)
                if not far:
                    beam(a,'steel',p(1,yy,rr),p(-1,yn,rn),.052)
    for level, frac in enumerate((.56,.72,.87)):
        y=H*frac
        reach=W/2-.13
        for sign in (-1,1):
            tip=(sign*reach,y,0)
            for z in (-.62,.62):
                beam(a,'steel',(sign*.75,y-1.25,z),tip,.095,far)
                beam(a,'steel',(sign*.75,y+.38,z),tip,.075,far)
                if not far:
                    beam(a,'steel',(sign*(reach*.55),y-.50,z*.45),(sign*(reach*.55),y+.16,z*.45),.035)
            if not far:
                beam(a,'steel',(sign*.75,y-.2,-.62),(sign*reach,y,.0),.045)
            if terminal:
                ceramic(a,sign*(reach-.2),y,0,1.9,far,horizontal=True,tower_string=True)
            else:
                ceramic(a,sign*(reach-.2),y-1.9,0,1.9,far,tower_string=True)
    if not far:
        # Ladder rungs and a restrained warning plate on the accessible leg.
        for j in range(11):
            y=.65+j*.27
            beam(a,'steel',(base-.22,y,base+.06),(base+.22,y,base+.06),.019)
        plaque(a,'sign_danger',base,1.5,base+.16,.6,.42)
    beam(a,'steel',(0,H-1,0),(0,H,0),.065,far)


def pole(a,item,far):
    hframe='hframe' in item['id']
    W,H,D=item['size']
    if hframe:
        for x in (-2.25,2.25):
            a.cyl(material('wood'),x,0,0,.22,H-.45,n=5 if far else 10,r1=.15,col=WHITE)
            box(a,'steel',x,H-1.05,0,.34,.11,1.0)
        box(a,'wood',0,H-1.0,0,W,.24,.24)
        beam(a,'steel',(-2.25,H-1.1,0),(2.25,H-4.4,0),.035,far)
        if not far:
            beam(a,'steel',(2.25,H-1.1,0),(-2.25,H-4.4,0),.035)
        for x in (-2.8,0,2.8):
            ceramic(a,x,H-.75,0,.75,far)
    else:
        a.cyl(material('concrete'),0,0,0,.20,H-.5,n=5 if far else 10,r1=.10,col=WHITE)
        for yy in (H-1.65,H-.55):
            box(a,'steel',0,yy,0,W-.12,.12,.16)
            for x in (-1.22,0,1.22):
                ceramic(a,x,yy+.12,0,.4,far)
        if not far:
            for yy in (2,2.4,2.8,3.2,3.6):
                beam(a,'steel',(-.27,yy,0),(.27,yy,0),.014)
            box(a,'peeling',0,1.3,.2,.35,.45,.12)
    if not far:
        plaque(a,'sign_danger',-2.25 if hframe else 0,1.7,.24,.32,.27)


def gantry(a,item,far):
    W,H,D=item['size']
    top=H-.4
    side=W/2-.5
    for x in (-side,side):
        box(a,'concrete',x,0,0,1.0,.35,D)
        for zz in (-D*.25,D*.25):
            beam(a,'steel',(x-.22,.3,zz),(x-.22,top,zz),.075,far)
            beam(a,'steel',(x+.22,.3,zz),(x+.22,top,zz),.075,far)
            n=3 if far else 7
            for j in range(n):
                y=.4+j*(top-.4)/n
                yn=.4+(j+1)*(top-.4)/n
                beam(a,'steel',(x-.22,y,zz),(x+.22,yn,zz),.035,far)
                if not far: beam(a,'steel',(x+.22,y,zz),(x-.22,yn,zz),.035)
    for yy in (top-.45,top+.3):
        beam(a,'steel',(-side-.3,yy,-D*.22),(side+.3,yy,-D*.22),.075,far)
        if not far: beam(a,'steel',(-side-.3,yy,D*.22),(side+.3,yy,D*.22),.075)
    for j in range(3 if far else 8):
        x0=-side+j*2*side/(3 if far else 8)
        x1=-side+(j+1)*2*side/(3 if far else 8)
        beam(a,'steel',(x0,top-.45,-D*.22),(x1,top+.3,-D*.22),.04,far)
    for x in (-W*.27,0,W*.27):
        ceramic(a,x,top-.45,-.70 if H>7 else -.30,1.45 if H>7 else .65,far,horizontal=True)


def bund(a,item,far):
    W,H,D=item['size']; t=.24
    box(a,'concrete',0,0,0,W,.10,D)
    box(a,'gravel',0,.10,0,W-2*t,.08,D-2*t)
    for xx in (-W/2+t/2,W/2-t/2): box(a,'concrete',xx,.1,0,t,H-.1,D)
    for zz in (-D/2+t/2,D/2-t/2): box(a,'concrete',0,.1,zz,W-2*t,H-.1,t)
    if not far:
        # Sump aperture, cover ribs, oil stain and two load-bearing plinths.
        sx,sz=W*.38,D*.32
        box(a,'rubber',sx,.181,sz,.65,.012,.65)
        for j in range(6): box(a,'steel',sx-.28+j*.11,.196,sz,.035,.035,.62)
        for x in (-W*.25,W*.25): box(a,'concrete',x,.18,0,.6,.28,D*.65)
        face(a,'oil',[(-W*.16,.182,-D*.18),(W*.15,.182,-D*.12),(W*.18,.182,D*.21),(-W*.24,.182,D*.13)],(0,1,0))
        for i in range(18):
            x=math.sin(i*13.7)*(W*.43); z=math.cos(i*7.3)*(D*.4)
            a.sph(material('gravel'),x,.22,z,.055,.034,.045,n=4,col=0xCBC7BB)


def masonry(a,item,far):
    W,H,D=item['size']; kind=item['id']
    if kind=='firewall':
        W=.45  # Catalogue includes the projecting concrete buttresses.
        box(a,'concrete',0,0,0,W,H,D)
        if not far:
            for z in (-D*.4,0,D*.4): box(a,'concrete',0,0,z,W+.24,H*.94,.30)
            box(a,'concrete',0,H-.14,0,W+.18,.14,D)
            for y in (.6,1.2,1.8,2.4,3,3.6,4.2,4.8,5.4):
                box(a,'oil',W/2+.001,y,0,.002,.012,D*.94)
        return
    D=.24  # Catalogue contains lintel / damp-course projection as well.
    if kind=='wall_brick':
        box(a,'brick',0,0,0,W,H,D)
    elif kind=='wall_door':
        # Real opening, no opaque wall face behind the separately instanced leaf.
        dw,dh=1.16,2.28
        for sign in (-1,1): box(a,'brick',sign*(W+dw)/4,0,0,(W-dw)/2,H,D)
        box(a,'brick',0,dh,0,dw,H-dh,D)
    else:
        ww,wh,sy=1.4,1.2,1.15
        for sign in (-1,1): box(a,'brick',sign*(W+ww)/4,0,0,(W-ww)/2,H,D)
        box(a,'brick',0,0,0,ww,sy,D)
        box(a,'brick',0,sy+wh,0,ww,H-sy-wh,D)
    if not far:
        box(a,'concrete',0,H-.15,0,W,.15,D+.05)
        for x in (-W/2+.1,W/2-.1): box(a,'concrete',x,0,0,.20,H-.15,D+.03)
        # Exposed damp plinth and mortar repairs lend physical depth at eye level.
        for sign in (-1,1):
            width=.72 if kind=='wall_door' else W*.36
            box(a,'peeling',sign*W*.31,.03,D*.51,width,.2,.012)
        for y in (.42,.78,1.44,2.1,2.76):
            box(a,'concrete',-W*.41,y,D*.51,.31,.015,.012)


def architectural(a,item,far):
    W,H,D=item['size']; kind=item['id']
    if kind=='roof_flat':
        box(a,'concrete',0,0,0,W,.16,D)
        if not far:
            for x in (-W/2+.09,W/2-.09): box(a,'concrete',x,.16,0,.18,H-.16,D)
            for z in (-D/2+.09,D/2-.09): box(a,'concrete',0,.16,z,W-.36,H-.16,.18)
            box(a,'oil',W*.2,.161,-D*.15,W*.35,.005,D*.24)
        else:
            for x in (-W/2+.09,W/2-.09): box(a,'concrete',x,.16,0,.18,H-.16,D,skip=('ny','nx','px'))
    elif kind=='door_steel':
        D=.05  # 0.18 m catalogue envelope includes handle and hinge projection.
        box(a,'peeling',0,0,0,W,H,D)
        if not far:
            for y in (.08,H-.10): box(a,'steel',0,y,D/2+.008,W,.06,.016)
            for x in (-W/2+.03,W/2-.03): box(a,'steel',x,.08,D/2+.008,.06,H-.16,.016)
            box(a,'steel',W*.35,.95,D/2+.04,.11,.04,.05)
            for y in (.25,H-.3): box(a,'steel',-W/2,.0+y,D/2,.04,.1,.04)
    elif kind=='louvre':
        if far:
            box(a,'peeling',0,0,0,W,H,D)
            for j in range(3): plaque(a,'rubber',0,.12+j*.20,D/2+.001,W-.08,.04)
            return
        for x in (-W/2+.025,W/2-.025): box(a,'steel',x,0,0,.05,H,D)
        for y in (0,H-.05): box(a,'steel',0,y,0,W,.05,D)
        for j in range(3 if far else 9):
            y=.06+j*(H-.12)/(3 if far else 9)
            box(a,'peeling',0,y,0,W-.1,.035,D*.85,rx=-.35)
        if not far:
            plaque(a,'rubber',0,.05,-D*.44,W-.1,H-.1)
    elif kind=='window':
        W,D=1.30,.10  # Frame + projecting sill fits 1.36 x 1.1 x .18 envelope.
        if far:
            box(a,'steel',0,0,0,W,H,D)
            plaque(a,'rubber',0,.045,D/2+.001,W-.09,H-.09)
            plaque(a,'steel',0,.045,D/2+.002,.04,H-.09)
            return
        plaque(a,'rubber',0,.04,-D*.35,W-.08,H-.08)
        for x in (-W/2+.025,0,W/2-.025): box(a,'steel',x,0,0,.05,H,D)
        for y in (0,H-.05): box(a,'steel',0,y,0,W,.05,D)
        if not far:
            for x in (-W*.3,-W*.1,W*.1,W*.3): beam(a,'steel',(x,.06,D*.45),(x,H-.06,D*.45),.014)
            box(a,'concrete',0,0,0,W+.06,.04,D+.08)


def oil_store(a,item,far):
    W,H,D=item['size']; t=.18
    for x in (-W/2+t/2,W/2-t/2): box(a,'brick',x,0,0,t,H-.20,D)
    box(a,'brick',0,0,-D/2+t/2,W-2*t,H-.20,t)
    box(a,'concrete',0,H-.2,0,W,.2,D)
    box(a,'concrete',0,0,0,W,.13,D)
    # Open mesh double doors, real interior shelves and bunded drums.
    for x in (-W*.23,W*.23):
        box(a,'steel',x,.15,D/2-.06,W*.45,.09,.1)
        box(a,'steel',x,H-.42,D/2-.06,W*.45,.09,.1)
        if not far:
            for j in range(6): box(a,'steel',x-W*.18+j*W*.072,.2,D/2-.06,.035,H-.62,.04)
    if not far:
        for x in (-1.25,-.4,.45,1.3):
            a.cyl(material('peeling'),x,.14,-.65,.30,.92,n=8,col=WHITE)
            for y in (.32,.86): a.cyl(material('steel'),x,y,-.65,.309,.045,n=8,col=WHITE)
        plaque(a,'sign_danger',0,1.55,D/2+.01,.7,.5)
    else:
        box(a,'peeling',0,.14,-.65,3.2,.92,.65)


def mesh_panel(a,width,height,far=False,xoff=0,yoff=0,z=0):
    """Actual open diamonds. Thin double-sided ribbons, no opaque alpha card."""
    spacing=.95 if far else .18
    thickness=.008 if far else .006
    # Clip diagonal wire ribbons to the frame rectangle.
    for slope in (-1,1):
        n=int((width+height)/spacing)+2
        for j in range(-n,n+1):
            c=j*spacing
            pts=[]
            for x in (-width/2,width/2):
                y=slope*x+c
                if 0<=y<=height: pts.append((x,y))
            for y in (0,height):
                x=(y-c)/slope
                if -width/2<=x<=width/2: pts.append((x,y))
            if len(pts)<2 or math.dist(pts[0],pts[-1])<.01: continue
            (x0,y0),(x1,y1)=pts[0],pts[-1]
            nx,ny=-slope*thickness,thickness
            ps=[(x0+xoff+nx,y0+yoff+ny,z),(x1+xoff+nx,y1+yoff+ny,z),
                (x1+xoff-nx,y1+yoff-ny,z),(x0+xoff-nx,y0+yoff-ny,z)]
            face(a,'steel',ps,(0,0,1));face(a,'steel',ps[::-1],(0,0,-1))


def fence(a,item,far):
    W,H,D=item['size']; kind=item['id']
    if kind=='fence_post':
        H=2.90  # End surface of the angled outrigger extends above its centre.
        a.cyl(material('steel'),0,0,0,.06,2.43,n=4 if far else 8,col=WHITE)
        beam(a,'steel',(0,2.4,0),(0,H,-.45),.035,far)
        if not far:
            box(a,'concrete',0,0,0,.16,.18,.16)
            for y,z in ((2.55,-.15),(2.72,-.30),(2.88,-.44)):
                beam(a,'steel',(-.08,y,z),(.08,y,z),.009)
    else:
        panel_h=2.35 if kind=='gate' else H-.10
        n=2 if kind=='gate' else 1
        for j in range(n):
            pw=W/n-.07
            x=-W/2+W*(j+.5)/n
            for xx in (x-pw/2,x+pw/2): box(a,'steel',xx,0,0,.045,panel_h,.06)
            for y in (.03,panel_h-.035): box(a,'steel',x,y,0,pw,.035,.06)
            mesh_panel(a,pw-.06,panel_h-.10,far,x,.06,.0)
            if kind=='gate':
                if not far: beam(a,'steel',(x-pw/2,.08,.02),(x+pw/2,panel_h-.08,.02),.02)
                if not far:
                    box(a,'steel',x+pw*.34,.98,.09,.18,.035,.08)
        if kind=='gate':
            for x in (-W/2+.08,W/2-.08):
                a.cyl(material('steel'),x,0,0,.07,H,n=4 if far else 8,col=WHITE)
            if not far:
                for yy in (2.52,2.68,2.84):
                    beam(a,'steel',(-W/2+.08,yy,0),(W/2-.08,yy,0),.009)
                plaque(a,'sign_access',-.65,1.25,.05,.65,.45)


def mast(a,item,far):
    W,H,D=item['size']; light=item['id']=='floodlight_mast'
    box(a,'concrete',0,0,0,.65,.25,.65)
    a.cyl(material('steel'),0,.25,0,.13,H-.25,n=5 if far else 10,r1=.035 if not light else .08,col=WHITE)
    if light:
        beam(a,'steel',(-.7,H-.3,0),(.7,H-.3,0),.055,far)
        for x in (-.55,.55):
            box(a,'peeling',x,H-.50,0,.45,.28,.28)
            plaque(a,'grey',x,H-.46,.146,.36,.20)
            if not far:
                for j in range(3): box(a,'steel',x,H-.46+j*.065,.16,.39,.012,.025)
    if not far:
        box(a,'peeling',0,.45,.12,.20,.35,.10)
        for y in (.33,.52): box(a,'steel',0,y,0,.30,.04,.30)


def tile(a,item,far):
    W,H,D=item['size']; kind=item['id']
    if kind=='trench_cover':
        H=.10
        box(a,'concrete',0,0,0,W,H,D)
        if not far:
            for x in (-W*.3,W*.3):
                box(a,'rubber',x,H+.001,0,.12,.004,.06)
                beam(a,'steel',(x-.04,H+.012,0),(x+.04,H+.012,0),.008)
            for z in (-D*.4,D*.4): box(a,'steel',0,H+.002,z,W*.9,.003,.009)
        return
    mat='gravel' if kind=='gravel_tile' else 'concrete'
    box(a,mat,0,0,0,W,H,D)
    if not far and kind=='gravel_tile':
        for j in range(30):
            x=math.sin(j*12.17)*W*.46;z=math.cos(j*5.97)*D*.46
            a.sph(material('gravel'),x,H-.015,z,.05+.02*(j%3),.025,.04,n=4,col=0xD3CFC5)
    elif not far:
        # Fine expansion joints in both axes and a physically chipped corner.
        for z in (-D*.25,0,D*.25): box(a,'rubber',0,H-.002,z,W,.003,.012)
        for x in (-W*.25,0,W*.25): box(a,'rubber',x,H-.002,0,.012,.003,D)


def sign(a,item,far):
    W,H,D=item['size']; name=item['id']
    box(a,'steel',0,0,0,W,H,D)
    plaque(a,name,0,0,D/2+.001,W,H)
    if not far:
        # Folded backing edge, four fixings, hanging brackets.
        for x in (-W/2+.015,W/2-.015): box(a,'steel',x,0,-D/2,.03,H,.025)
        for x in (-W*.43,W*.43):
            for y in (.04,H-.04):
                a.hcyl(material('steel'),x,y,D/2+.005,.012,.01,axis='z',n=8,col=WHITE)


def build(a,item,far=False):
    key=item['id'].removeprefix('substation_'); item={**item,'id':key}
    if key.startswith('tower_'): tower(a,item,far)
    elif key.startswith('pole_'): pole(a,item,far)
    elif key.startswith('gantry_'): gantry(a,item,far)
    elif key.startswith('bund_'): bund(a,item,far)
    elif key=='busbar_tube':
        a.hcyl(material('steel'),0,.075,0,.06,3,axis='x',n=4 if far else 16,col=WHITE,caps=True)
        if not far:
            for x in (-1.4,1.4): a.hcyl(material('steel'),x,.075,0,.072,.08,axis='x',n=12,col=WHITE)
    elif key.startswith('wall_') or key=='firewall': masonry(a,item,far)
    elif key in ('roof_flat','door_steel','louvre','window'): architectural(a,item,far)
    elif key=='oil_store': oil_store(a,item,far)
    elif key.startswith('fence_') or key=='gate': fence(a,item,far)
    elif key.endswith('_mast'): mast(a,item,far)
    elif key.endswith('_tile') or key=='trench_cover': tile(a,item,far)
    elif key.startswith('sign_'): sign(a,item,far)
    else: raise ValueError('Unknown substation site item '+key)


def record(key,size,family,features,lamps=None,hinges=None,keep_out=None):
    w,h,d=size
    return dict(id=key,size=size,family=family,features=features,
                anchors=dict(lamps=lamps or [],hinges=hinges or []),
                keepOut=keep_out if keep_out is not None else [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]])


SITE_CATALOG = [
    record('tower_suspension_132',[12,32,6.4],'tower',['double-circuit','six crossarms','suspension strings','open lattice','ladder','concrete feet'],keep_out=[[-3.5,-3.5],[3.5,-3.5],[3.5,3.5],[-3.5,3.5]]),
    record('tower_terminal_132',[13,30,8],'tower',['double-circuit','tension strings','heavier lattice','terminal silhouette'],keep_out=[[-4.5,-4.5],[4.5,-4.5],[4.5,4.5],[-4.5,4.5]]),
    record('pole_hframe_33',[6.4,13,1.2],'pole',['wood twin poles','crossarm','three pin insulators','diagonal bracing']),
    record('pole_concrete_11',[2.8,10.5,.65],'pole',['tapered concrete','two crossarms','pin insulators','step bolts']),
    record('gantry_132',[12,10,2.0],'gantry',['lattice portal','three horizontal tension strings','foundations']),
    record('gantry_33',[7,5.5,1.3],'gantry',['lattice portal','three horizontal tension strings','foundations']),
    record('busbar_tube',[3,.15,.15],'busbar',['three-metre tube segment','bolted end collars']),
    record('bund_large',[10,.65,7.4],'containment',['open oil bund','gravel','sump','grating','two plinths','oil stains']),
    record('bund_small',[7.2,.55,5.6],'containment',['open oil bund','gravel','sump','grating','two plinths','oil stains']),
    record('firewall',[.69,6.5,8],'containment',['reinforced concrete','buttresses','coping','construction joints']),
    record('wall_brick',[3,3.2,.30],'building',['brick infill','concrete piers','damp plinth']),
    record('wall_door',[3,3.2,.30],'building',['clear doorway 1.16x2.28m','brick infill','concrete lintel']),
    record('wall_window',[3,3.2,.30],'building',['clear window opening 1.4x1.2m','brick infill','concrete frame']),
    record('roof_flat',[3.2,.32,3.2],'building',['flat concrete roof module','edge parapets','weathering patch']),
    record('door_steel',[1.1,2.2,.18],'building',['separate opening leaf','hinges','handle','folded edges'],hinges=[dict(name='door_hinge',position=[-.55,0,0],axis=[0,1,0])]),
    record('louvre',[1,.75,.12],'building',['open ventilation blades','sheet frame']),
    record('window',[1.36,1.1,.18],'building',['double frame','dark glazing','security bars','sill']),
    record('oil_store',[4.5,3.2,3.5],'building',['open caged front','four original oil drums','bund floor','flat roof']),
    record('fence_panel',[2.5,2.4,.09],'security',['open chain-link diamonds','tension rails']),
    record('fence_post',[.16,2.94,1.0],'security',['galvanised post','barbed-wire outrigger','three wire brackets'],keep_out=[[-.1,-.1],[.1,-.1],[.1,.1],[-.1,.1]]),
    record('gate',[5,2.9,.24],'security',['double chain-link leaves','latch','barbed top','access sign'],hinges=[dict(name='left_leaf',position=[-2.5,0,0],axis=[0,1,0]),dict(name='right_leaf',position=[2.5,0,0],axis=[0,1,0])]),
    record('floodlight_mast',[1.6,8,1.0],'lighting',['two floodlights','steel mast','access door','footing'],lamps=[dict(name='lamp_left',position=[-.55,7.7,.18]),dict(name='lamp_right',position=[.55,7.7,.18])]),
    record('lightning_mast',[.8,18,.8],'lighting',['tapered steel mast','air terminal','footing']),
    record('gravel_tile',[4,.12,4],'ground',['crushed stone','discrete stones at near LOD']),
    record('concrete_tile',[4,.15,4],'ground',['expansion joints','broomed shared texture']),
    record('trench_cover',[1,.13,.6],'ground',['concrete cover','two lifting handles','steel edge strips']),
    record('sign_danger',[.75,.55,.07],'sign',['PELIGRO – ALTA TENSIÓN 132 000 V','four fixings']),
    record('sign_access',[.65,.45,.07],'sign',['PROHIBIDO EL PASO','four fixings']),
    record('sign_touch',[.45,.3,.07],'sign',['NO TOCAR','four fixings']),
]
