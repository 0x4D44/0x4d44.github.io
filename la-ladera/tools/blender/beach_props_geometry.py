"""Original beach prop geometry in metres, +Y up and +Z front.

The furniture primitives supply analytic normals and winding; this adapter
maps every primitive into a padded cell of the one shared PBR atlas.  Moving
parts remain real independent scene subtrees, never names on a merged mesh.
"""
import math
import random
import furn_lib as L
from beach_props_atlas import CELL_MAP

ALPHA = {'palm_frond', 'seaweed', 'net'}


class Surface(L.Asset):
    def _emit(self, cell, geom, col=None, tint=False, flags=(), rot=(0, 0, 0), off=(0, 0, 0), scl=None):
        pos, nor, uv, tris = geom
        tile = CELL_MAP[cell]
        lo = [min(v[d] for v in uv) for d in range(2)]
        hi = [max(v[d] for v in uv) for d in range(2)]
        x, y = tile % 8, tile // 8
        u0, v0, span = (x * 256 + 8) / 2048, (y * 256 + 8) / 2048, 240 / 2048
        # The glTF exporter flips V.  Store its inverse so game UVs are in
        # the atlas's declared bottom-origin cells (as in vehicles_geometry).
        uv = [(u0 + span * (u - lo[0]) / max(hi[0] - lo[0], 1e-8),
               1 - (v0 + span * (v - lo[1]) / max(hi[1] - lo[1], 1e-8))) for u, v in uv]
        mat = 'beach_props_alpha' if cell in ALPHA else 'beach_props'
        super()._emit(mat, (pos, nor, uv, tris), None, False, flags, rot, off, scl)

    def poly(self, cell, points, normal=None, uv=None, flags=()):
        normal = normal or L._unit(L._cross(L._sub(points[1], points[0]), L._sub(points[2], points[0])))
        if uv is None:
            axis = max(range(3), key=lambda k: abs(normal[k]))
            uv = [(p[(axis + 1) % 3], p[(axis + 2) % 3]) for p in points]
        self._emit(cell, (points, [normal] * len(points), uv,
                         [(0, i, i + 1) for i in range(1, len(points) - 1)]), flags=flags)

    def bar(self, cell, p, q, radius=.016, n=6):
        self.tube(cell, [p, q], radius, n=n)

    def grid(self, cell, points, nx, nz, flags=(), swap_uv=False):
        """A curved sheet with a continuously unwrapped atlas cell."""
        tris = []
        for j in range(nz):
            for i in range(nx):
                a = j * (nx + 1) + i
                tris.extend([(a, a + 1, a + nx + 2), (a, a + nx + 2, a + nx + 1)])
        normals = [[0., 0., 0.] for _ in points]
        for a, b, c in tris:
            n = L._cross(L._sub(points[b], points[a]), L._sub(points[c], points[a]))
            for k in (a, b, c):
                for d in range(3): normals[k][d] += n[d]
        normals = [L._unit(n) for n in normals]
        uv = [(i / nx, j / nz) for j in range(nz + 1) for i in range(nx + 1)]
        if swap_uv:uv=[(v,u) for u,v in uv]
        self._emit(cell, (points, normals, uv, tris), flags=flags)


class Prop:
    def __init__(self, key, cat, lod):
        self.key, self.cat, self.lod = key, cat, lod
        self.body = Surface(key, cat)
        self.pivots = []

    def pivot(self, name, position, axis=(0, 1, 0), motion='rotate'):
        s = Surface(self.key + '-pivot_' + name, self.cat)
        self.pivots.append({'name': name, 'position': list(position), 'axis': list(axis), 'motion': motion, 'surface': s})
        return s


def rec(family, size, description, **kw):
    return {'family': family, 'size': size, 'footprint': [size[0], size[2]],
            'description': description, 'triangleCap': 2000, 'anchors': {}, 'pivots': [], **kw}


CATALOG = {}
for i in range(1, 7):
    pole = 'steel' if i <= 3 else 'wood_teak'
    for state in ('open', 'furled'):
        key = f'beach_parasol_{i:02d}_{state}'
        width = 2.2 if state == 'open' else .36
        CATALOG[key] = rec('lounge', [width, 2.35, width],
            f'Striped coastal parasol {i}, {state}, {"steel" if i <= 3 else "wooden"} pole',
            state=state, colourway=i, pole=pole, atlasCells=[f'parasol_{i:02d}', pole],
            pivots=[{'name': 'canopy', 'position': [0, 2.02, 0], 'axis': [0, 1, 0], 'motion': 'rotate'}])

LOUNGE = [
    ('lounger_plastic_blue', [0.70, .88, 1.95], 'plastic_blue', 'lounger'),
    ('lounger_wood_canvas', [.72, .90, 2.00], 'wood_teak', 'lounger'),
    ('chair_plastic_coral', [.62, .92, .66], 'plastic_coral', 'chair'),
    ('chair_wood_canvas', [.63, .94, .70], 'wood_teak', 'chair'),
    ('chair_folding_steel', [.62, .88, .65], 'steel', 'chair'),
]
for name, size, cell, kind in LOUNGE:
    anchors = {'seats': [{'position': [0, .36 if kind == 'lounger' else .43, .12], 'yaw': 0,
                          'seatHeight': .36 if kind == 'lounger' else .43}]}
    if kind == 'lounger':
        anchors['lie'] = [{'position': [0, .38, 0], 'yaw': 0, 'length': 1.80, 'width': .56}]
    CATALOG['beach_' + name] = rec('lounge', size, name.replace('_', ' ').capitalize(),
        kind=kind, cell=cell, atlasCells=[cell], anchors=anchors)

for i in range(1, 13):
    CATALOG[f'beach_towel_{i:02d}_flat'] = rec('towel', [.90, .025, 1.80],
        f'Beach towel print {i:02d}, flat with soft ripples and a stitched hem',
        state='flat', print=i, atlasCells=[f'towel_{i:02d}'],
        anchors={'lie': [{'position': [0, .02, 0], 'yaw': 0, 'length': 1.70, 'width': .82}]})
    CATALOG[f'beach_towel_{i:02d}_draped'] = rec('towel', [.63, .96, .70],
        f'Beach towel print {i:02d}, draped over a wooden folding chair',
        state='draped', print=i, atlasCells=[f'towel_{i:02d}', 'wood_teak'],
        anchors={'seats': [{'position': [0, .43, .12], 'yaw': 0, 'seatHeight': .43}]})

for i in range(1, 5):
    CATALOG[f'beach_bag_{i:02d}'] = rec('beach', [.42, .48, .22],
        f'Open canvas beach tote {i} with stitched gussets and two loop handles',
        colourway=i, atlasCells=[f'bag_{i:02d}'])

CATALOG.update({
    'beach_cool_box': rec('beach', [.58, .40, .36], 'Blue insulated cool box with white hinged lid and carry handles',
        pivots=[{'name': 'lid', 'position': [0, .33, -.17], 'axis': [1, 0, 0], 'motion': 'hinge'}],
        anchors={'hinges': [{'name': 'lid', 'position': [0, .33, -.17], 'axis': [1, 0, 0]}]}),
    'beach_thermos': rec('beach', [.13, .31, .13], 'Brushed steel vacuum flask, moulded grip and a cup lid'),
    'beach_flipflops_pair': rec('beach', [.30, .055, .28], 'Pair of worn blue rubber flip-flops with Y straps'),
    'beach_flipflop_left': rec('beach', [.115, .055, .28], 'Single left blue rubber flip-flop'),
    'beach_flipflop_right': rec('beach', [.115, .055, .28], 'Single right coral rubber flip-flop'),
    'beach_bucket_spade': rec('beach', [.42, .34, .24], 'Open yellow sand bucket, pivoted handle and separate short spade',
        pivots=[{'name': 'handle', 'position': [-.075, .20, 0], 'axis': [1, 0, 0], 'motion': 'rotate'}]),
    'beach_sandcastle': rec('beach', [.90, .42, .76], 'Hand-built sandcastle with four turrets, crenellations and a doorway'),
    'beach_ball_buried': rec('beach', [.30, .18, .30], 'Striped beach ball half buried in a rim of sand'),
    'beach_pool_ring_deflated': rec('beach', [.74, .075, .61], 'Collapsed coral inflatable ring with folded seam and a valve'),
    'beach_volleyball_court': rec('sport', [16.04, 2.50, 8.04], '16 by 8 metre beach volleyball court with 12-triangle alpha net, padded posts and boundary rope',
        anchors={'keepOut': [[-8.5,-4.5],[8.5,-4.5],[8.5,4.5],[-8.5,4.5]],
                 'volley': [{'position': [-4,0,-2], 'yaw': 1.570796},{'position': [-4,0,2], 'yaw': 1.570796},
                            {'position': [4,0,-2], 'yaw': -1.570796},{'position': [4,0,2], 'yaw': -1.570796}]},
        atlasCells=['net']),
    'beach_volleyball_ball': rec('sport', [.215, .215, .215], 'Stitched white, blue and yellow volleyball'),
})

SIGNS = [('zona_bano','Zona de baño'), ('bandera_roja','Bandera roja'), ('prohibido_paso','Prohibido el paso'),
         ('cocadas','Cocadas'), ('ceviche','Ceviche'), ('jugos','Jugos naturales'), ('helados','Helados'),
         ('alquiler_tablas','Alquiler de tablas'), ('cooperativa','Cooperativa de pescadores'), ('salvavidas','Salvavidas')]
for name, text in SIGNS:
    CATALOG['beach_sign_' + name] = rec('sign', [.72, .48, .035], text + ' — interchangeable hand-painted board',
        atlasCells=['sign_' + name], text=text, signCell='sign_' + name)

for i, size in enumerate(([1.6,.95,1.25],[1.25,1.10,1.45],[1.85,.80,1.15]), 1):
    CATALOG[f'beach_groyne_rock_{i}'] = rec('shore', list(size), f'Salt-stained angular groyne boulder variant {i}', variant=i, instance=True)
CATALOG['beach_seawall_stones'] = rec('shore', [1.8,.55,.65], 'Mortared section of irregular salt-stained sea-wall blocks', instance=True)
for i, size in enumerate(([1.5,.22,.32],[1.1,.30,.45],[1.8,.34,.50]), 1):
    CATALOG[f'beach_driftwood_{i}'] = rec('shore', list(size), f'Silver driftwood branch variant {i}, worn end grain and broken twigs', variant=i)
CATALOG['beach_fishing_net'] = rec('shore', [1.70,.14,1.25], 'Stranded folded fishing net with cork floats and a coiled headline', atlasCells=['net'])
CATALOG['beach_seaweed'] = rec('shore', [.70,.22,.55], 'Washed-up olive seaweed clump on alpha cutout cards', atlasCells=['seaweed'], instance=True)
CATALOG['beach_shell_conch'] = rec('shore', [.27,.14,.12], 'Spiral conch with flared lip, inner aperture and raised ridges')
CATALOG['beach_shell_scallop'] = rec('shore', [.16,.045,.15], 'Fan-shaped scallop valve with a fluted rim and radiating ribs')
for size, w, h in [('small',3.1,4.2),('large',4.5,6.6)]:
    CATALOG['beach_palm_' + size] = rec('plant',[w,h,w],f'Coconut palm {size}, ringed curved trunk and separate crown cards',
        variant=size, instance=True, atlasCells=['palm_frond'],
        pivots=[{'name':'crown','position':[0,h-.75,0],'axis':[0,1,0],'motion':'sway'}])


def umbrella(p):
    c, a, low = p.cat, p.body, p.lod
    a.cyl(c['pole'],0,0,0,.023,2.03,n=6 if low else 10)
    if not low:
        a.cyl('steel',0,1.33,0,.031,.10,n=8)
        a.box('wood_teak',0,0,0,.16,.04,.16)
    s = p.pivot('canopy',[0,2.02,0])
    cell = f'parasol_{c["colourway"]:02d}'
    if c['state']=='furled':
        profile=[(.025,-.93),(.14,-.77),(.18,-.35),(.12,.05),(.015,.33)]
        s.lathe(cell,0,0,0,profile,n=5 if low else 12,hero=True)
        if not low:s.lathe('rope',0,-.58,0,[(.155,0),(.158,.045)],n=12,hero=True)
    else:
        n=8 if low else 16
        profile=[(1.10,-.12),(1.02,-.025),(.62,.22),(0,.33)]
        if low:profile=[(1.10,-.12),(0,.33)]
        s.lathe(cell,0,0,0,profile,n=n,hero=True,crease=75)
        if not low:
            for i in range(8):
                t=i*math.tau/8
                s.bar('steel',(0,.14,0),(.99*math.cos(t),-.02,.99*math.sin(t)),.007,n=4)
                # Small scalloped valance panels cast a recognisable edge shadow.
                t1=t+math.tau/8
                s.poly(cell,[(1.1*math.cos(t),-.12,1.1*math.sin(t)),(1.1*math.cos(t1),-.12,1.1*math.sin(t1)),
                             (1.07*math.cos(t1),-.20,1.07*math.sin(t1)),(1.07*math.cos(t),-.20,1.07*math.sin(t))])


def chair(a, cell, lod, lounge=False, size=None):
    w,h,d=size or [.63,.94,.70]
    if lounge:
        sy=.36; back=-d*.33
        for x in (-w*.43,w*.43):
            for z in (-d*.27,d*.30):a.box(cell,x,0,z,.045,sy,.05)
            a.bar(cell,(x,sy,-d*.24),(x,h-.025,-d*.45),.02,n=4 if lod else 6)
            a.bar(cell,(x,sy,-d*.24),(x,sy,d*.46),.02,n=4 if lod else 6)
        a.poly('canvas_cream' if cell=='wood_teak' else cell,[(-w*.41,sy,-d*.24),(w*.41,sy,-d*.24),(w*.41,sy,d*.46),(-w*.41,sy,d*.46)],(0,1,0))
        a.poly('canvas_cream' if cell=='wood_teak' else cell,[(-w*.41,sy,-d*.24),(-w*.41,h-.025,-d*.45),(w*.41,h-.025,-d*.45),(w*.41,sy,-d*.24)])
        if not lod:
            for z in (-d*.27,d*.3):a.bar(cell,(-w*.43,.13,z),(w*.43,.13,z),.018)
            for i in range(8):
                z=-d*.20+i*d*.08
                a.box(cell,0,sy-.025,z,w*.82,.013,.025)
            a.box('canvas_cream',0,h-.12,-d*.405,w*.60,.08,.16,r=.015,rx=.42)
    else:
        for x in (-w*.43,w*.43):
            if lod:
                a.box(cell,x,0,-d*.30,.045,h,.045)
                a.box(cell,x,0,d*.36,.045,.43,.045)
            else:
                a.bar(cell,(x,.025,-d*.40),(x,.49,d*.35),.022)
                a.bar(cell,(x,.025,d*.40),(x,.49,-d*.35),.022)
                a.bar(cell,(x,.43,-d*.30),(x,h-.02,-d*.44),.022)
        a.poly('canvas_cream' if cell in ('wood_teak','steel') else cell,
               [(-w*.42,.43,-d*.32),(w*.42,.43,-d*.32),(w*.42,.43,d*.36),(-w*.42,.43,d*.36)],(0,1,0))
        a.poly('canvas_cream' if cell in ('wood_teak','steel') else cell,
               [(-w*.42,.46,-d*.31),(-w*.42,h-.02,-d*.43),(w*.42,h-.02,-d*.43),(w*.42,.46,-d*.31)])
        if not lod:
            for x in (-w*.43,w*.43):
                a.box(cell,x,.59,0,.065,.035,d*.7)
                a.box(cell,x,.43,d*.26,.028,.17,.028)
            for z in (-d*.35,d*.35):a.bar(cell,(-w*.43,.17,z),(w*.43,.17,z),.015)


def towel(p):
    a,c,low=p.body,p.cat,p.lod
    cell=f'towel_{c["print"]:02d}'
    if c['state']=='draped':
        chair(a,'wood_teak',low)
        # One continuous sheet goes up the back, folds over the rail and
        # drops on the far side; no paper-thin rectangular stand-in.
        ys=[.38,.64,.93,.95,.92,.66,.40] if not low else [.38,.95,.40]
        zs=[-.18,-.23,-.29,-.32,-.35,-.35,-.35] if not low else [-.18,-.32,-.35]
        nx=6 if not low else 1
        pts=[((i/nx-.5)*.52, y+.004*math.sin(i*2.1), z+.01*math.sin(i*2.4)) for y,z in zip(ys,zs) for i in range(nx+1)]
        a.grid(cell,pts,nx,len(ys)-1)
    else:
        nx,nz=(1,1) if low else (6,10)
        pts=[((i/nx-.5)*.90, .0125+.0125*math.sin(i*math.pi/nx)*math.sin(j*math.pi/nz), (j/nz-.5)*1.80)
             for j in range(nz+1) for i in range(nx+1)]
        a.grid(cell,pts,nx,nz)
        if not low:
            # Hem has thickness and gently uneven edges.
            for x in (-.445,.445):a.bar(cell,(x,.009,-.89),(x,.009,.89),.006,n=3)
            for z in (-.89,.89):a.bar(cell,(-.445,.009,z),(.445,.009,z),.006,n=3)


def bag(p):
    a,low,c=p.body,p.lod,p.cat; cell=f'bag_{c["colourway"]:02d}'
    rings=[(-.18,.03,.085),(-.21,.29,.11),(-.19,.34,.10)]
    for (x0,y0,z0),(x1,y1,z1) in zip(rings,rings[1:]):
        for side in (-1,1):
            a.poly(cell,[(x0,y0,side*z0),(-x0,y0,side*z0),(-x1,y1,side*z1),(x1,y1,side*z1)],(0,0,side))
        for side in (-1,1):
            a.poly(cell,[(side*x0,y0,-z0),(side*x0,y0,z0),(side*x1,y1,z1),(side*x1,y1,-z1)],(-side,0,0))
    a.box(cell,0,0,0,.36,.035,.17)
    for z in (-.095,.095):
        pts=[(-.105,.32,z),(-.10,.43,z),(-.055,.473,z),(.055,.473,z),(.10,.43,z),(.105,.32,z)]
        if low:pts=[(-.105,.32,z),(0,.473,z),(.105,.32,z)]
        if low:
            a.poly('canvas_cream',[(-.105,.32,z),(-.09,.32,z),(0,.473,z),(-.014,.473,z)])
            a.poly('canvas_cream',[(0,.473,z),(.014,.473,z),(.105,.32,z),(.09,.32,z)])
        else:a.tube('canvas_cream',pts,.007,n=5)
    if not low:
        a.poly('canvas_cream',[(-.12,.13,.111),(.12,.13,.111),(.12,.28,.111),(-.12,.28,.111)],(0,0,1))


def flipflop(a, x, side, low, cell='plastic_blue'):
    n=6 if low else 16
    ring=[(x+.052*math.cos(i*math.tau/n)*(1+.08*math.sin(i*math.tau/n)),.018,.14*math.sin(i*math.tau/n)) for i in range(n)]
    a.poly(cell,ring,(0,1,0))
    for i in range(n):
        q,r=ring[i],ring[(i+1)%n]
        a.poly('rubber',[(q[0],0,q[2]),q,r,(r[0],0,r[2])])
    for s in (-1,1):
        if low:a.poly(cell,[(x+s*.046,.022,-.025),(x+s*.036,.022,-.025),(x+side*.003,.047,.075),(x+side*.013,.047,.075)],(0,1,0))
        else:a.tube(cell,[(x+s*.046,.02,-.025),(x+s*.02,.05,.025),(x+side*.008,.02,.075)],.006,n=5)


def small_prop(p):
    a,c,low,k=p.body,p.cat,p.lod,p.key.replace('_lod1','')
    n=5 if low else 14
    if k=='beach_cool_box':
        a.box('plastic_blue',0,0,0,.54,.33,.34,r=0 if low else .025)
        s=p.pivot('lid',[0,.33,-.17],(1,0,0),'hinge')
        s.box('paint_white',0,0,.17,.58,.07,.36,r=0 if low else .018)
        if not low:
            for x in (-.282,.282):a.tube('paint_white',[(x,.22,-.08),(x,.13,-.08),(x,.13,.08),(x,.22,.08)],.009,n=5)
            a.box('paint_white',0,.27,.174,.055,.07,.018)
    elif k=='beach_thermos':
        a.lathe('steel',0,0,0,[(.055,0),(.063,.025),(.063,.24),(.05,.255)],n=n,hero=True)
        a.lathe('black',0,.07,0,[(.064,0),(.064,.10)],n=n,hero=True)
        a.lathe('steel',0,.255,0,[(.054,0),(.054,.055),(0,.055)],n=n,hero=True)
    elif 'flipflop' in k:
        if k.endswith('pair'):
            flipflop(a,-.09,-1,low);flipflop(a,.09,1,low)
        else:flipflop(a,0,-1 if k.endswith('left') else 1,low,'plastic_blue' if k.endswith('left') else 'plastic_coral')
    elif k=='beach_bucket_spade':
        a.lathe('plastic_yellow',-.075,0,0,[(.075,0),(.11,.22),(.10,.22),(.066,.018),(0,.018)],n=6 if low else 14,hero=True)
        s=p.pivot('handle',[-.075,.20,0],(1,0,0))
        pts=[(.105*math.cos(i*math.pi/(3 if low else 10)),.13*math.sin(i*math.pi/(3 if low else 10)),0) for i in range((3 if low else 10)+1)]
        s.tube('plastic_coral',pts,.006,n=3 if low else 5)
        a.box('plastic_blue',.16,.012,0,.06,.012,.11,rx=.1)
        a.bar('plastic_blue',(.16,.02,0),(.16,.28,-.03),.010,n=3 if low else 6)
        if low:a.poly('plastic_blue',[(.13,.28,-.03),(.13,.33,-.03),(.19,.33,-.03),(.19,.28,-.03)],(0,0,1))
        else:a.tube('plastic_blue',[(.13,.27,-.03),(.13,.33,-.03),(.19,.33,-.03),(.19,.27,-.03),(.13,.27,-.03)],.009,n=5)
    elif k=='beach_sandcastle':
        a.box('sand',0,0,0,.82,.065,.68,r=0 if low else .025)
        a.box('sand',0,.06,0,.61,.18,.46)
        for x in (-.31,.31):
            for z in (-.24,.24):
                a.lathe('sand',x,.05,z,[(.13,0),(.11,.29),(0,.37)],n=5 if low else 12,hero=True)
        if not low:
            for x in (-.20,-.10,0,.10,.20):a.box('sand',x,.24,.20,.055,.04,.06)
            a.poly('black',[(-.065,.07,.232),(.065,.07,.232),(.065,.17,.232),(0,.22,.232),(-.065,.17,.232)],(0,0,1))
    elif k=='beach_ball_buried':
        prof=[(.145,0),(.15,.045),(.13,.11),(.08,.16),(0,.18)]
        if low:prof=[(.15,0),(.13,.11),(0,.18)]
        a.lathe('ball',0,0,0,prof,n=6 if low else 16,hero=True,crease=90)
    elif k=='beach_pool_ring_deflated':
        n,m=(8,3) if low else (24,6)
        pts=[];ns=[];uv=[];tr=[]
        for i in range(n):
            t=i*math.tau/n
            for j in range(m):
                q=j*math.tau/m
                r=.28+.09*math.cos(q)
                pts.append((r*math.cos(t),.038+.032*math.sin(q)*(.7+.3*math.sin(t*3)),r*.82*math.sin(t)))
                ns.append(L._unit((math.cos(t)*math.cos(q),math.sin(q)*3,math.sin(t)*math.cos(q))))
                uv.append((i/n,j/m))
        for i in range(n):
            for j in range(m):
                aa=i*m+j;b=((i+1)%n)*m+j;cc=((i+1)%n)*m+(j+1)%m;d=i*m+(j+1)%m
                tr.extend([(aa,b,cc),(aa,cc,d)])
        a._emit('plastic_coral',(pts,ns,uv,tr))
        if not low:a.cyl('plastic_yellow',.30,.05,0,.01,.025,n=5)
    elif k=='beach_volleyball_ball':
        a.sph('volleyball',0,.1075,0,.1075,n=8 if low else 24)


def volleyball(p):
    a,low=p.body,p.lod
    for z in (-4.,4.):
        a.cyl('steel',0,0,z,.04,2.5,n=5 if low else 10)
        if not low:a.cyl('plastic_blue',0,0,z,.04,1.75,n=10)
    # Twelve triangles at near LOD, two at far; one real alpha primitive.
    divisions=1 if low else 6
    pts=[(0,y,-3.9+i*7.8/divisions) for y in (1.40,2.40) for i in range(divisions+1)]
    a.grid('net',pts,divisions,1,flags=('volleyball_net',))
    for y in (1.4,2.4):
        if low:a.poly('paint_white',[(0,y-.018,-3.95),(0,y+.018,-3.95),(0,y+.018,3.95),(0,y-.018,3.95)])
        else:a.bar('paint_white',(0,y,-3.95),(0,y,3.95),.018,n=5)
    for x in (-8.,8.):a.box('rope',x,0,0,.03,.015,8.04)
    for z in (-4.,4.):a.box('rope',0,0,z,16.04,.015,.03)
    if not low:
        for z in (-4.,4.):
            for x in (-.65,.65):a.bar('rope',(0,2.28,z),(x,.02,z),.006,n=3)


def rock(p):
    a,low,c=p.body,p.lod,p.cat;w,h,d=c['size'];rng=random.Random(c.get('variant',1)*71)
    n=5 if low else 9
    rings=[]
    for y,r in ([(0,.85),(.62,1),(1,.37)] if low else [(0,.75),(.18,1),(.74,.86),(1,.37)]):
        ring=[]
        for i in range(n):
            t=math.tau*i/n;f=1 if low else rng.uniform(.87,1)
            ring.append((math.cos(t)*w*.5*r*f,y*h,math.sin(t)*d*.5*r*f))
        rings.append(ring)
    for r,s in zip(rings,rings[1:]):
        for i in range(n):a.poly('rock_salt',[r[i],r[(i+1)%n],s[(i+1)%n],s[i]])
    a.poly('rock_salt',rings[-1],(0,1,0))


def shore(p):
    a,low,c=p.body,p.lod,p.cat;k=p.key.replace('_lod1','');w,h,d=c['size']
    if 'groyne_rock' in k:rock(p)
    elif k=='beach_seawall_stones':
        if low:a.box('seawall',0,0,0,w,h,d)
        else:
            for j in range(2):
                for i in range(4):
                    a.box('seawall',-.6925+i*.45+(j%2)*.035,.01+j*.267,0,.435,.26,.63,r=.025)
    elif 'driftwood' in k:
        points=[(-w*.5,.06,0),(-w*.25,h*.35,-d*.12),(w*.15,h*.40,d*.10),(w*.48,h*.54,0)]
        if low:points=[(-w*.5,.06,-d*.15),(w*.48,h*.54,d*.05)]
        a.tube('driftwood',points,[.065,.09,.07,.02] if not low else [.06,.03],n=5 if low else 10)
        a.tube('driftwood',[(w*.08,h*.38,d*.06),(w*.25,h*.78,d*.32),(w*.37,h-.025,d*.45)], [.04,.025,.008],n=4 if low else 8)
        if not low:
            a.tube('driftwood',[(-w*.25,h*.35,-d*.12),(-w*.15,h*.65,-d*.40)], [.035,.012],n=7)
    elif k=='beach_fishing_net':
        nx,nz=(2,2) if low else (9,7)
        pts=[((i/nx-.5)*w,.016+.07*math.sin(i*1.7)*math.sin(j*1.9)**2,(j/nz-.5)*d) for j in range(nz+1) for i in range(nx+1)]
        # Raise all folds clear of the ground datum.
        ymin=min(t[1] for t in pts);pts=[(x,y-ymin,z) for x,y,z in pts]
        a.grid('net',pts,nx,nz)
        for i in range(3 if low else 7):
            x=-.72+i*1.44/(2 if low else 6)
            a.sph('coconut',x,.095,.48,.045,.045,.065,n=6 if low else 10)
        a.tube('rope',[(-.8,.025,.54),(0,.035,.52),(.8,.025,.54)],.012,n=3 if low else 6)
    elif k=='beach_seaweed':
        for i in range(2 if low else 7):
            t=i*math.pi/(2 if low else 7);sx=math.cos(t)*w/2;sz=math.sin(t)*d/2
            a.poly('seaweed',[(-sx,0,-sz),(sx,0,sz),(sx*.7,h,sz*.7),(-sx*.7,h,-sz*.7)])
    elif k=='beach_shell_scallop':
        n=5 if low else 18
        for i in range(n):
            t0=-math.pi*.15+i*math.pi*1.3/n;t1=-math.pi*.15+(i+1)*math.pi*1.3/n
            a.poly('scallop',[(0,.01,-.055),(.08*math.cos(t0),.025,.018+.075*math.sin(t0)),(.08*math.cos(t1),.025,.018+.075*math.sin(t1))],(0,1,0))
            if not low:a.bar('scallop',(0,.012,-.055),(.077*math.cos(t0),.04,.018+.072*math.sin(t0)),.0035,n=3)
    elif k=='beach_shell_conch':
        n=6 if low else 18
        a.lathe('conch',0,.07,0,[(0,-.135),(.02,-.10),(.048,-.04),(.060,.035),(.047,.10),
                (.055,.12),(.048,.125),(.037,.085)],n=n,hero=True,rot=(0,0,-math.pi/2),scl=(1,1,.90))
        # The aperture is recessed behind a continuous, flared shell lip.
        mouth=[(.085,.07+.037*math.cos(i*math.tau/n),.037*.90*math.sin(i*math.tau/n)) for i in range(n)]
        a.poly('black',mouth,(1,0,0))
        if not low:
            for i in range(7):
                x=-.09+i*.025;r=.018+.038*math.sin((i+1)*math.pi/9)
                pts=[(x+.01*math.sin(j*math.tau/12),.07+r*math.sin(j*math.tau/12),r*.91*math.cos(j*math.tau/12)) for j in range(13)]
                a.tube('conch',pts,.003,n=3)


def palm(p):
    a,c,low=p.body,p.cat,p.lod;w,h,d=c['size']
    cy=h-.75
    pts=[(0,0,0),(-.12,cy*.30,0),(-.08,cy*.70,.05),(0,cy,0)]
    if low:pts=[pts[0],pts[2],pts[-1]]
    a.tube('wood_weathered',pts,[.16,.12,.09] if low else [.16,.14,.11,.09],n=5 if low else 9,caps=True)
    if not low:
        for i in range(1,14):
            y=cy*i/14;xx=-.10*math.sin(math.pi*i/14)
            a.lathe('wood_teak',xx,y,0,[(.16-.07*i/14,0),(.16-.07*i/14,.028)],n=9,hero=True)
    s=p.pivot('crown',[0,cy,0],motion='sway')
    count=5 if low else 10
    for i in range(count):
        ang=i*math.tau/count;cs,ss=math.cos(ang),math.sin(ang)
        length=w*.5;halfwidth=w*.13
        rows=2 if low else 5
        points=[]
        for j in range(rows+1):
            t=j/rows;r=length*t
            y=.65*math.sin(t*math.pi)-.48*t
            width=halfwidth*(.3+.7*math.sin(t*math.pi))
            for side in (-1,1):points.append((cs*r-ss*width*side,y,ss*r+cs*width*side))
        s.grid('palm_frond',points,1,rows,swap_uv=True)
        if not low:s.tube('wood_teak',[(0,.02,0),(cs*length*.5,.40,ss*length*.5),(cs*length,-.48,ss*length)],.008,n=3)
    for i in range(1 if low else 3):
        ang=i*math.tau/3
        s.sph('coconut',.12*math.cos(ang),-.09,.12*math.sin(ang),.10,.13,.10,n=6 if low else 10)


def build(key, cat, lod):
    name=key+'_lod1' if lod else key
    p=Prop(name,cat,lod)
    if key.startswith('beach_parasol_'):umbrella(p)
    elif key.startswith('beach_towel_'):towel(p)
    elif key.startswith('beach_bag_'):bag(p)
    elif key in {'beach_'+x[0] for x in LOUNGE}:chair(p.body,cat['cell'],lod,cat['kind']=='lounger',cat['size'])
    elif key=='beach_volleyball_court':volleyball(p)
    elif key.startswith('beach_sign_') and key!='beach_sign_easel':
        a=p.body;w,h,d=cat['size']
        if lod:
            a.poly(cat['signCell'],[(-w/2,0,0),(w/2,0,0),(w/2,h,0),(-w/2,h,0)],(0,0,1))
        else:
            a.box('wood_weathered',0,0,0,w,h,d)
            a.poly(cat['signCell'],[(-w/2,.005,d/2+.0005),(w/2,.005,d/2+.0005),(w/2,h-.005,d/2+.0005),(-w/2,h-.005,d/2+.0005)],(0,0,1))
    elif cat['family']=='shore':shore(p)
    elif cat['family']=='plant':palm(p)
    else:small_prop(p)
    return p
