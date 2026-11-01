"""Original CC0 boards, rigging and inflatable wings, in the game metre frame.

No manufacturer outline, badge or artwork is reproduced. The three sail poses
and two kite poses share atlas variants; the base geometry uses coral. Long kite
lines belong to tools/watersports-lines.mjs, never to the GLB geometry.
"""
import math
import watersports_common as W

TAU = math.tau


def _meta(size, description, *, floating=False, draft=0, bob=0, rock=0,
          anchors=None, pivots=None, family='boards', variants=None):
    result = dict(size=size, description=description, family=family,
                  origin='waterline-centre' if floating else 'floor-centre',
                  floating=floating, draftDepth=draft, bobAmplitude=bob,
                  rockAmplitudeDeg=rock, anchors=anchors or {}, pivots=pivots or [])
    if variants:
        result['variantFamily'] = variants
        result['variants'] = {variants: {'sourceTile': variants+'_coral',
                                        'tiles': [variants+'_'+c for c in ('coral','teal','gold','blue','lime','plum')]}}
    return result


CATALOG = {
    'watersports_windsurf_rig': _meta([.72, 4.57, 2.83],
        '2.30 m windsurf board, footstraps, universal joint, mast, wishbone boom and six panel sail with transparent window',
        floating=True, draft=.32, bob=.045, rock=3.0, variants='sail',
        anchors={'feet': [[-.13,.105,-.52],[.13,.105,-.10]],
                 'hands': [[-.28,1.27,-.28],[-.29,1.27,-.63]], 'floatHeight': .10},
        pivots=[{'id':'sail','position':[0,.12,.22],'axis':[0,1,0]},
                {'id':'boom','position':[0,1.15,0],'axis':[0,1,0],'parent':'sail'}]),
    'watersports_windsurf_sand': _meta([4.89,.65,2.83],
        'Complete windsurf rig resting on the sand: board beside the sideways sail and wishbone boom',
        variants='sail', anchors={'stand':[-1.25,0,.6]},
        pivots=[{'id':'sail','position':[-1.67,.35,.46],'axis':[0,1,0]},
                {'id':'boom','position':[0,1.15,0],'axis':[0,1,0],'parent':'sail'}]),
    'watersports_windsurf_derigged': _meta([1.76,.32,2.30],
        'Derigged windsurf board with rolled sail, two separated mast sections and a detached wishbone boom',
        variants='sail', anchors={'stand':[0,0,1.5]},
        pivots=[{'id':'sail_bundle','position':[.56,.12,0],'axis':[0,0,1]},
                {'id':'mast_lower','position':[.10,.055,0],'axis':[0,0,1]},
                {'id':'mast_upper','position':[.21,.055,0],'axis':[0,0,1]},
                {'id':'boom','position':[.53,.21,0],'axis':[0,1,0]}]),
    'watersports_sup_a': _meta([.80,.45,3.30],
        '3.30 m rounded touring SUP: coral deck stripes, diamond grip pad, carry handle and crossed cargo elastic',
        floating=True,draft=.28,bob=.04,rock=2.2,
        anchors={'feet':[[-.18,.10,-.16],[.18,.10,.16]],'hands':[[.46,1.20,.1],[.46,.65,-.1]],'floatHeight':.10}),
    'watersports_sup_b': _meta([.78,.45,3.35],
        '3.35 m blue touring SUP with tapered nose, split deck pad and bow cargo ties',
        floating=True,draft=.28,bob=.04,rock=2.2,
        anchors={'feet':[[-.17,.10,-.16],[.17,.10,.16]],'hands':[[.45,1.20,.1],[.45,.65,-.1]],'floatHeight':.10}),
    'watersports_sup_c': _meta([.82,.45,3.20],
        '3.20 m stable gold SUP with broad shoulders, striped deck, black EVA grip pad and carry loop',
        floating=True,draft=.28,bob=.04,rock=2.2,
        anchors={'feet':[[-.19,.10,-.16],[.19,.10,.16]],'hands':[[.47,1.20,.1],[.47,.65,-.1]],'floatHeight':.10}),
    'watersports_paddle': _meta([.22,1.85,.07],
        'Two-piece 1.85 m SUP paddle with broad spoon blade, adjustment collar and T grip',
        anchors={'hands':[[0,1.79,0],[0,1.12,0]]},
        pivots=[{'id':'blade_section','position':[0,0,0],'axis':[0,1,0]},
                {'id':'handle_section','position':[0,.97,0],'axis':[0,1,0]}]),
    'watersports_kiteboard': _meta([.42,.225,1.40],
        '1.40 m twin-tip kite board with upturned tips, two EVA pads, footstraps and four shallow fins',
        floating=True,draft=.065,bob=.035,rock=3.4,
        anchors={'feet':[[0,.036,-.28],[0,.036,.28]],'hands':[[.22,1.0,.3],[-.22,1.0,.3]],'floatHeight':.035}),
    'watersports_foilboard': _meta([.86,1.12,1.55],
        '1.55 m kite foil board with visible long mast, front hydrofoil, rear stabiliser and footstraps',
        floating=True,draft=.90,bob=.03,rock=2.2,
        anchors={'feet':[[0,.09,-.28],[0,.09,.27]],'hands':[[.22,1.05,.3],[-.22,1.05,.3]],'floatHeight':.09}),
    'watersports_kite_bar': _meta([.60,.16,.08],
        'Kite control bar with contrasting grips, central depower swivel, line leaders and safety loop',
        anchors={'hands':[[-.20,.075,0],[.20,.075,0]],
                 'lineAttachments':[[-.27,.075,0],[.27,.075,0],[0,.15,0]]}),
    'watersports_kite_flying': _meta([7.04,1.86,2.60],
        'Inflatable 7 m kite wing in a flying arch: curved thin canopy, striped panels, white stitched seams and inflated leading edge',
        family='kites',variants='kite',
        anchors={'lineAttachments':[[-2.55,.95,.8],[2.55,.95,.8],[-3.35,.12,-1.05],[3.35,.12,-1.05]]},
        pivots=[{'id':'wing','position':[0,0,0],'axis':[0,0,1]}]),
    'watersports_kite_sand': _meta([7.04,.59,2.60],
        'Inflatable kite resting on the sand, flattened trailing canopy with inflated leading edge and five visible struts',
        family='kites',variants='kite',
        anchors={'lineAttachments':[[-2.55,.27,.8],[2.55,.27,.8],[-3.35,.12,-1.05],[3.35,.12,-1.05]]},
        pivots=[{'id':'wing','position':[0,0,0],'axis':[0,0,1]}]),
}


def _tube(a, points, radius, n, tile):
    old = a.tile
    a.tile = tile
    a.tube(W.MAT, points, radius, n=n, caps=True, col=0xffffff)
    a.tile = old


def _board(a, length, width, top, bottom, tile, lod, cx=0, cz=0, shape=0):
    """Shaped rail, raised nose and two broad faces; no box-shaped boards."""
    n = 8 if lod else 24
    outlines = []
    for scale, y in ((.90,bottom), (1,(top+bottom)*.5), (.92,top)):
        loop = []
        for i in range(n):
            angle = TAU*i/n
            x = width*.5*math.sin(angle)
            z = length*.5*math.cos(angle)
            # Tip rocker and a softer, slightly narrower nose for the touring SUP.
            taper = 1 - shape*.13*max(0, math.cos(angle))
            rocker = .027*abs(math.cos(angle))**6
            loop.append((cx+x*scale*taper, y+rocker, cz+z*scale))
        outlines.append(loop)
    for lower, upper in zip(outlines,outlines[1:]):
        for i in range(n):
            j=(i+1)%n
            W.poly(a,[lower[i],lower[j],upper[j],upper[i]],tile='white' if lower is outlines[0] else tile)
    W.poly(a,outlines[0],tile='navy',normal=(0,-1,0))
    W.poly(a,outlines[-1],tile=tile,normal=(0,1,0),
           uv=[((p[0]-cx)/width+.5,(p[2]-cz)/length+.5) for p in outlines[-1]])
    return top


def _pad(a,cx,y,cz,width,length,lod):
    n=6 if lod else 12
    points=[(cx+width*.5*math.sin(TAU*i/n),y,cz+length*.5*math.cos(TAU*i/n)) for i in range(n)]
    W.poly(a,points,tile='deckpad',normal=(0,1,0))


def _fin(a,x,y,z,length,depth,lod,tile='navy'):
    side=[(x-.008,y,z+length*.45),(x-.008,y,z-length*.55),
          (x-.008,y-depth,z-length*.18),(x-.008,y-depth*.82,z+length*.2)]
    W.poly(a,side,tile=tile,normal=(-1,0,0))
    right=[(p[0]+.016,p[1],p[2]) for p in side]
    W.poly(a,right,tile=tile,normal=(1,0,0))
    if not lod:
        for i in range(4):
            j=(i+1)%4
            W.poly(a,[side[i],side[j],right[j],right[i]],tile=tile)


def _strap(a,cx,y,cz,width,lod):
    if lod:
        W.poly(a,[(cx-width/2,y,cz-.035),(cx-width/2,y,cz+.035),
                  (cx+width/2,y+.055,cz+.035),(cx+width/2,y+.055,cz-.035)],tile='rubber',normal=(0,1,0))
    else:
        points=[(cx+width*(t-.5),y+.082*math.sin(math.pi*t),cz) for t in (0,.2,.4,.6,.8,1)]
        _tube(a,points,.021,5,'rubber')


def _windsurf_board(a,lod,cx=0,cz=0,ground=False):
    top=.19 if ground else .10
    bottom=0 if ground else -.09
    _board(a,2.30,.66,top,bottom,'board_coral',lod,cx,cz)
    if not ground:
        _fin(a,cx,-.09,cz-.72,.29,.23,lod)
    _pad(a,cx,top+.004,cz-.40,.46,.95,lod)
    for z in (-.56,-.12):
        _strap(a,cx,top+.012,cz+z,.29,lod)
    if not lod:
        W.box(a,'navy',cx,top,cz+.24,.06,.04,.26)
        W.bar(a,(cx,top+.04,cz+.10),(cx,top+.07,cz+.31),.019,n=6,tile='steel')


def _sail(m,position,rotation=(0,0,0)):
    lod=m.lod
    a=m.part('sail',position=position,axis=(0,1,0),rotation=rotation)
    W.bar(a,(0,0,0),(0,4.10,-.15),.023 if lod else .027,n=4 if lod else 8,tile='navy')
    rows=[(0,0),(.50,1.10),(1.15,1.85),(1.80,1.50),(2.50,1.10),(3.30,.65),(4.10,.15)]
    if lod:
        rows=[rows[i] for i in (0,2,4,6)]
    columns=[0,.27,.70,1] if not lod else [0,.65,1]
    for iy in range(len(rows)-1):
        for ix in range(len(columns)-1):
            polygon=[];uv=[]
            for ry,rx in ((iy,ix),(iy+1,ix),(iy+1,ix+1),(iy,ix+1)):
                y,width=rows[ry];t=columns[rx]
                z=-.15*y/4.10 - width*t
                x=.045*math.sin(math.pi*t)*math.sin(math.pi*y/4.10)
                polygon.append((x,y,z));uv.append((-z/2.0,y/4.10))
            window=(iy in (1,2) and ix in (0,1)) if not lod else (iy==0 and ix==0)
            W.poly(a,polygon,tile='glass' if window else 'sail_coral',
                   mat=W.GLASS if window else W.FABRIC,normal=(1,0,0),uv=uv)
    # Number patch maps the printed portion of the shared atlas onto a cloth
    # panel ABOVE the window. Both sides carry the same painted number.
    for side in (-1,1):
        x=.060 if side>0 else -.012
        W.poly(a,[(x,2.02,-.30),(x,2.45,-.30),(x,2.45,-.88),(x,2.02,-.88)],
               tile='sail_coral',mat=W.FABRIC,normal=(side,0,0),
               uv=[(.25,.18),(.25,.48),(.75,.48),(.75,.18)])
    if not lod:
        for y,width in rows[1:-1]:
            W.bar(a,(.012,y,-.15*y/4.1),(.012,y,-.15*y/4.1-width),.009,n=4,tile='white')
        _tube(a,[(0,.10,-.03),(.08,.24,-.13),(0,.45,-.17)],.012,5,'rope')
    boom=m.part('boom',position=(0,1.15,0),axis=(0,1,0),parent='sail')
    n=3 if lod else 6
    for side in (-1,1):
        pts=[(side*.30*math.sin(math.pi*i/n),0,-1.72*i/n) for i in range(n+1)]
        _tube(boom,pts,.018,4 if lod else 6,'navy')
    if not lod:
        for side in (-1,1):
            _tube(boom,[(side*.275,0,-.50),(side*.295,0,-.85)],.022,6,'rubber')


def windsurf(m):
    _windsurf_board(m.body,m.lod)
    _sail(m,(0,.12,.22))


def windsurf_sand(m):
    _windsurf_board(m.body,m.lod,cx=-2.13,cz=.24,ground=True)
    _sail(m,(-1.67,.35,.46),rotation=(0,0,-math.pi/2))


def windsurf_derigged(m):
    _windsurf_board(m.body,m.lod,cx=-.55,ground=True)
    sail=m.part('sail_bundle',position=(.56,.12,0),axis=(0,0,1))
    _tube(sail,[(0,0,-1.04),(0,0,1.04)],.10,6 if m.lod else 12,'sail_coral')
    for ident,x in (('mast_lower',.10),('mast_upper',.21)):
        mast=m.part(ident,position=(x,.055,0),axis=(0,0,1))
        _tube(mast,[(0,0,-1.025),(0,0,1.025)],.023,4 if m.lod else 8,'navy')
        if not m.lod:
            W.bar(mast,(0,0,.96),(0,0,1.06),.028,n=6,tile='steel')
    boom=m.part('boom',position=(.53,.21,0),axis=(0,1,0))
    for side in (-1,1):
        count=3 if m.lod else 6
        pts=[(side*.30*math.sin(math.pi*i/count),0,-.79+1.58*i/count) for i in range(count+1)]
        _tube(boom,pts,.018,4 if m.lod else 6,'navy')


def sup(m):
    dimensions={'watersports_sup_a':(3.30,.80,'board_coral',0),
                'watersports_sup_b':(3.35,.78,'board_blue',1),
                'watersports_sup_c':(3.20,.82,'board_gold',0)}
    length,width,tile,shape=dimensions[m.key.removesuffix('_lod1')]
    a=m.body;lod=m.lod
    _board(a,length,width,.10,-.055,tile,lod,shape=shape)
    _pad(a,0,.105,-.18,width*.73,length*.45,lod)
    _fin(a,0,-.055,-length*.30,.31,.225,lod)
    if not lod:
        _tube(a,[(-.07,.11,0),(-.07,.15,.07),(.07,.15,.07),(.07,.11,0)],.018,6,'rubber')
        for z in (.65,.95):
            _tube(a,[(-width*.31,.125,z), (width*.31,.125,z+.22)],.009,5,'rope')
            _tube(a,[(width*.31,.125,z),(-width*.31,.125,z+.22)],.009,5,'rope')
        for x in (-width*.31,width*.31):
            for z in (.65,1.17):
                W.box(a,'steel',x,.105,z,.027,.01,.05)


def paddle(m):
    blade=m.part('blade_section',position=(0,0,0),axis=(0,1,0))
    points=[(-.07,0,0),(-.11,.09,.008),(-.09,.39,.022),(0,.53,.03),
            (.09,.39,.022),(.11,.09,.008),(.07,0,0)]
    W.poly(blade,points,tile='teal',normal=(0,0,1))
    W.poly(blade,[(x,y,z-.012) for x,y,z in points],tile='navy',normal=(0,0,-1))
    if not m.lod:
        for i in range(len(points)):
            j=(i+1)%len(points)
            W.poly(blade,[points[i],points[j],(points[j][0],points[j][1],points[j][2]-.012),
                          (points[i][0],points[i][1],points[i][2]-.012)],tile='white')
        W.bar(blade,(0,.08,.019),(0,.46,.041),.009,n=5,tile='white')
    W.bar(blade,(0,.40,.02),(0,1.02,.02),.016,n=4 if m.lod else 8,tile='navy')
    handle=m.part('handle_section',position=(0,.97,0),axis=(0,1,0))
    W.bar(handle,(0,0,.02),(0,.84,.02),.013,n=4 if m.lod else 8,tile='steel')
    W.bar(handle,(-.065,.84,.02),(.065,.84,.02),.022,n=4 if m.lod else 8,tile='rubber')
    if not m.lod:
        W.bar(handle,(0,.015,.02),(0,.075,.02),.021,n=8,tile='navy')
        W.box(handle,'yellow',.018,.035,.020,.012,.025,.024)


def kiteboard(m):
    a=m.body;lod=m.lod
    _board(a,1.40,.42,.035,-.025,'board_twin',lod)
    for z in (-.28,.28):
        _pad(a,0,.042,z,.29,.24,lod)
        _strap(a,0,.052,z,.27,lod)
    for x in (-.13,.13):
        for z in (-.53,.53):
            _fin(a,x,-.025,z,.09,.04,lod)
    if not lod:
        _tube(a,[(-.06,.04,0),(-.06,.10,0),(.06,.10,0),(.06,.04,0)],.011,5,'rubber')


def foilboard(m):
    a=m.body;lod=m.lod
    _board(a,1.55,.56,.09,-.04,'board_foil',lod)
    for z in (-.28,.27):
        _pad(a,0,.095,z,.34,.26,lod)
        _strap(a,0,.105,z,.29,lod)
    W.box(a,'steel',0,-.85,-.13,.025,.82,.15)
    W.bar(a,(0,-.84,-.48),(0,-.84,.44),.025,n=4 if lod else 8,tile='navy')
    for z,width,chord in ((.26,.86,.24),(-.39,.42,.16)):
        wing=[(-width/2,-.855,z+.02),(-width*.32,-.87,z+chord*.45),
              (width*.32,-.87,z+chord*.45),(width/2,-.855,z+.02),
              (width*.32,-.90,z-chord*.55),(-width*.32,-.90,z-chord*.55)]
        W.poly(a,wing,tile='navy',normal=(0,1,0))
        W.poly(a,wing,tile='navy',normal=(0,-1,0))
    if not lod:
        W.box(a,'steel',0,-.05,-.13,.15,.025,.30)
        for x in (-.05,.05):
            for z in (-.24,-.03):
                W.box(a,'white',x,-.022,z,.018,.008,.018)


def kite_bar(m):
    a=m.body;lod=m.lod
    W.bar(a,(-.27,.075,0),(.27,.075,0),.02,n=4 if lod else 8,tile='navy')
    for side,tile in ((-1,'red'),(1,'teal')):
        W.bar(a,(side*.11,.075,0),(side*.27,.075,0),.027,n=4 if lod else 8,tile=tile)
        if not lod:
            W.bar(a,(side*.27,.075,0),(side*.27,.13,.035),.012,n=6,tile='rope')
    if lod:
        W.poly(a,[(-.04,.075,.04),(-.04,0,.04),(.04,0,.04),(.04,.075,.04)],tile='yellow',normal=(0,0,1))
    else:
        _tube(a,[(-.038,.075,0),(-.04,.015,0),(0,.01,.04),(.04,.015,0),(.038,.075,0)],.009,6,'yellow')
    W.bar(a,(0,.075,0),(0,.145,0),.012,n=4 if lod else 8,tile='steel')


def kite(m,sand=False):
    a=m.part('wing',position=(0,0,0),axis=(0,0,1))
    lod=m.lod;n=8 if lod else 16;strips=1 if lod else 3
    rise=.35 if sand else 1.62
    def point(i,q):
        angle=-math.pi/2+math.pi*i/n
        x=3.35*math.sin(angle)
        y=.12+rise*math.cos(angle)
        if sand:y=max(.06,y-.33*q*math.cos(angle))
        else:y-=.12*q*math.cos(angle)
        z=.90+.30*abs(math.sin(angle))-2.15*q-.035
        return (x,y,z)
    for i in range(n):
        for j in range(strips):
            corners=[(i,j/strips),(i+1,j/strips),(i+1,(j+1)/strips),(i,(j+1)/strips)]
            W.poly(a,[point(k,q) for k,q in corners],tile='kite_coral',mat=W.FABRIC,
                   uv=[(k/n,1-q) for k,q in corners],normal=(0,1,0))
    left,right=point(0,0),point(n,0)
    leading=[(left[0]-.04,left[1],left[2])]+[point(i,0) for i in range(n+1)]+[(right[0]+.04,right[1],right[2])]
    _tube(a,leading,.12,4 if lod else 8,'kite_coral')
    for i in ((2,6) if lod else (2,5,8,11,14)):
        W.bar(a,point(i,0),point(i,1),.045,n=4 if lod else 6,tile='white')
    if not lod:
        for i in (0,n):
            p=point(i,.85)
            _tube(a,[p,(p[0],p[1]+.05,p[2]-.07),(p[0],p[1],p[2]-.12)],.01,5,'navy')


BUILDERS = {
    'watersports_windsurf_rig': windsurf,
    'watersports_windsurf_sand': windsurf_sand,
    'watersports_windsurf_derigged': windsurf_derigged,
    'watersports_sup_a': sup,
    'watersports_sup_b': sup,
    'watersports_sup_c': sup,
    'watersports_paddle': paddle,
    'watersports_kiteboard': kiteboard,
    'watersports_foilboard': foilboard,
    'watersports_kite_bar': kite_bar,
    'watersports_kite_flying': kite,
    'watersports_kite_sand': lambda m: kite(m,True),
}
