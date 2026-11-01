"""Everyday child garment objects, dispatched by garments_build.py --child.

Original loose outer-clothing patterns; no characters, body meshes or worn
garments. Geometry is authored in adult-reference metres and instantiated at
0.55 and 0.75 on child mesh nodes. Named roots retain the adult library's origin
contract. The two sizes share mesh buffers, never one another's root nodes.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

import bpy

import garments_build as G
from garments_child_footwear import geometry as footwear_geometry

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent.parent / 'assets' / 'models'
GLB = 'garments/garments_child.glb'
MANIFEST = 'manifest.garments_child.json'
SIZES = {'small': (0.55, [4, 7]), 'big': (0.75, [8, 12])}
ALL_STATES = ('folded', 'hung', 'flat')
# These are pattern design dimensions, not validator tolerances. The independent
# validator contains the accepted real-metre ranges and reads exported vertices.
ITEMS = [
    ('tshirt_teal', 'Plain teal T-shirt', 'Camiseta verde', 'tee', .84, .71, 'plain_teal', ALL_STATES),
    ('tshirt_coral', 'Plain coral T-shirt', 'Camiseta coral', 'tee', .84, .71, 'plain_coral', ALL_STATES),
    ('tshirt_motif', 'T-shirt with a small star print', 'Camiseta con estrella', 'tee', .84, .71, 'plain_cream', ALL_STATES),
    ('shorts', 'Loose cotton shorts', 'Pantaloneta de algodón', 'shorts', .54, .43, 'plain_teal', ALL_STATES),
    ('cotton_dress', 'Short-sleeved cotton dress', 'Vestido de algodón', 'dress', .68, .96, 'plain_coral', ALL_STATES),
    ('hoodie', 'Pullover hoodie', 'Sudadera con capucha', 'longtop', 1.02, .76, 'plain_lavender', ALL_STATES),
    ('joggers', 'Loose joggers', 'Pantalón de sudadera', 'trousers', .54, 1.00, 'plain_charcoal', ALL_STATES),
    ('school_jumper', 'School V-neck jumper', 'Suéter escolar', 'longtop', .98, .72, 'plain_navy', ALL_STATES),
    ('school_polo', 'Warm-white school polo', 'Polo escolar blanco', 'tee', .84, .71, 'plain_cream', ALL_STATES),
    ('school_trousers', 'Navy school trousers', 'Pantalón escolar azul', 'trousers', .52, 1.02, 'plain_navy', ALL_STATES),
    ('school_skirt', 'Grey pleated school skirt', 'Falda escolar plisada', 'skirt', .68, .61, 'plain_charcoal', ALL_STATES),
    ('school_tie', 'Sash-style school tie', 'Corbatín escolar', 'tie', .16, .51, 'plain_navy', ALL_STATES),
    ('socks_pair', 'Pair of cotton socks', 'Par de medias', 'socks', .31, .40, 'plain_cream', ('folded', 'flat')),
    ('cap', 'Plain peaked cap', 'Gorra sencilla', 'cap', .22, .31, 'plain_teal', ('hung', 'flat')),
    ('light_jacket', 'Light zip jacket', 'Chaqueta ligera', 'longtop', 1.04, .77, 'plain_coral', ALL_STATES),
    ('school_shoes', 'Pair of school shoes', 'Par de zapatos escolares', 'shoe', .26, .31, 'plain_charcoal', ('flat',)),
    ('sandals', 'Pair of everyday sandals', 'Par de sandalias', 'shoe', .26, .31, 'plain_navy', ('flat',)),
]


def spec(row):
    return dict(zip(('id', 'label', 'labelEs', 'kind', 'width', 'length', 'variant', 'states'), row))


def outline(item):
    kind = item['kind']
    if kind == 'tee':
        return G.tshirt()
    if kind == 'longtop':
        neck = .18 if item['id'] == 'school_jumper' else .12
        return [(-.24,.02),(-.13,.025),(-.10,.08),(0,neck),(.10,.08),(.13,.025),(.24,.02),
                (.50,.66),(.40,.73),(.27,.36),(.265,.98),(.13,1),(-.13,1),(-.265,.98),(-.27,.36),(-.40,.73),(-.50,.66)]
    if kind == 'dress':
        return [(-.24,.01),(-.12,.02),(-.09,.08),(0,.11),(.09,.08),(.12,.02),(.24,.01),
                (.42,.14),(.36,.25),(.25,.20),(.27,.40),(.50,.98),(.26,1),(0,.99),(-.26,1),(-.50,.98),
                (-.27,.40),(-.25,.20),(-.36,.25),(-.42,.14)]
    if kind in ('shorts', 'trousers'):
        gap = .43 if kind == 'trousers' else .51
        # Loose outer trousers with broad calves, never a fitted legging outline.
        return [(-.46,.015),(0,0),(.46,.015),(.49,.18),(.44,.98),(.27,1),(.095,.98),
                (.065,gap),(0,gap-.045),(-.065,gap),(-.095,.98),(-.27,1),(-.44,.98),(-.49,.18)]
    if kind == 'skirt':
        return [(-.30,0),(.30,0),(.32,.10),(.50,.97),(.32,1),(0,.985),(-.32,1),(-.50,.97),(-.32,.10)]
    if kind == 'tie':
        return [(-.27,0),(.27,0),(.31,.11),(.18,.23),(.48,.84),(.18,1),(-.03,.91),(-.29,.98),(-.50,.81),(-.17,.22),(-.31,.11)]
    raise ValueError('No pattern for ' + item['id'])


class Cloth:
    def __init__(self, item, state, low):
        self.item, self.state, self.low = item, state, low
        self.v, self.f, self.uv, self.c = [], [], [], []
        self.panels = []

    def point(self, x, t, width, length, lift=0, back=False):
        # Static drape: subdued uneven hem, sleeve folds and a shallow collapsed
        # cloth envelope. The adult pipeline's coordinate/normal export is shared.
        wave = .0038 * math.sin(18*x + 11*t) + .0025 * math.sin(27*t-9*x)
        wave *= math.sin(math.pi * min(1, max(0, t)))
        if self.item['kind'] == 'skirt':
            wave += .012 * math.cos(x*math.pi*16) * (.3+.7*t)
        if self.state == 'folded':
            wave = .002 * math.sin(x*21+t*13) + .003 * math.cos(t*math.pi*4)
        depth = (.006 if self.state == 'folded' else .004) + wave + lift
        if back:
            depth -= .016 if self.state == 'folded' else .008
        xx = x * width
        along = t * length
        if self.state == 'hung':
            return (xx, -along, depth + .008*math.sin(t*math.pi))
        return (xx, depth, along)

    def panel(self, poly, width, length, nx=None, ny=None, lift=0, shift=(0,0), closed=False):
        nx = nx or (3 if self.low else 7)
        ny = ny or (4 if self.low else 8)
        coords, faces, boundary = G.polygon_grid(poly, nx, ny)
        start = len(self.v)
        for back in (False, True):
            for x,t in coords:
                p = self.point(x, t, width, length, lift, back)
                p = (p[0]+shift[0], p[1]+(shift[1] if self.state=='hung' else 0), p[2]+(shift[1] if self.state!='hung' else 0))
                self.v.append(p)
                self.uv.append((min(1,max(0,x+.5)),min(1,max(0,t))))
                shade = .87 if back else .96 - .035*math.sin(x*29+t*31)**2
                self.c.append(G.linear(shade))
        n = len(coords)
        self.f.extend(tuple(start+i for i in reversed(face)) for face in faces)
        self.f.extend(tuple(start+n+i for i in face) for face in faces)
        self.panels.append((width,length,coords,faces,self.v[start:start+n],lift))
        for a,b in zip(boundary, boundary[1:]+boundary[:1]):
            x = (coords[a][0]+coords[b][0])/2
            t = (coords[a][1]+coords[b][1])/2
            opening = (t<.16 and abs(x)<.16) or t>.94
            if self.item['kind']=='tee': opening = opening or (abs(x)>.40 and t<.40)
            if self.item['kind']=='longtop': opening = opening or (abs(x)>.39 and .58<t<.76)
            if self.item['kind']=='dress': opening = opening or (abs(x)>.35 and t<.27)
            if self.item['kind'] in ('shorts','trousers','skirt','socks'):
                opening = t<.05 or (self.item['kind']!='socks' and t>.94)
            if closed or not opening:
                self.f.extend([(start+a,start+b,start+n+b),(start+a,start+n+b,start+n+a)])
        return coords, boundary

    def attached(self,x,t,width,length,lift):
        # Evaluate the exported triangulated surface, not its analytic wave.
        # Otherwise a tiny printed motif or seam can dip through a broad face.
        for w,l,coords,faces,vertices,base in reversed(self.panels):
            if abs(w-width)>1e-8 or abs(l-length)>1e-8: continue
            for face in faces:
                a,b,c=[coords[i] for i in face]
                den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(den)<1e-12: continue
                u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(t-c[1]))/den
                v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(t-c[1]))/den
                q=1-u-v
                if min(u,v,q)<-1e-6: continue
                p=[sum(weight*vertices[i][axis] for weight,i in zip((u,v,q),face)) for axis in range(3)]
                p[2 if self.state=='hung' else 1]+=max(.0012,lift-base)
                return tuple(p)
        return self.point(x,t,width,length,lift)

    def path(self, points, width, length, shade=.72, thickness=.0032, lift=.0012, closed=False):
        refined=[]
        for a,b in zip(points,points[1:]):
            count=max(1,math.ceil(math.hypot((b[0]-a[0])*width,(b[1]-a[1])*length)/(.20 if self.low else .085)))
            refined.extend((a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count) for i in range(count))
        refined.append(points[-1])
        mapped = [(self.attached(x,t,width,length,lift), (min(1,max(0,x+.5)),min(1,max(0,t)))) for x,t in refined]
        G.add_ribbon(self.v,self.f,self.uv,self.c,mapped,shade,thickness,closed,self.state=='hung')

    def patch(self, points, width, length, shade=.67, lift=.0019):
        start = len(self.v)
        for x,t in points:
            self.v.append(self.attached(x,t,width,length,lift))
            self.uv.append((min(1,max(0,x+.5)),min(1,max(0,t))))
            self.c.append(G.linear(shade))
        for i in range(1,len(points)-1):
            self.f.append((start,start+i+1,start+i))

    def result(self):
        return self.v,self.f,self.uv,self.c


def folded(item, low):
    cloth = Cloth(item,'folded',low)
    if item['kind']=='socks':
        # Two individual folded socks overlap with a clear second cuff and toe.
        w,l=.21,.135
        for shift,dt,lift in ((-.12,0,0),(.12,.055,.013)):
            poly=[(x+shift,t+dt) for x,t in [(-.30,0),(.24,0),(.29,.18),(.34,.77),(.25,1),(-.28,1),(-.37,.83),(-.36,.15)]]
            cloth.panel(poly,w,l,nx=3 if low else 5,ny=3 if low else 6,lift=lift,closed=True)
            cloth.path([(-.32+shift,.16+dt),(.28+shift,.16+dt)],w,l,shade=.68,thickness=.007,lift=lift+.0012)
        return cloth.result()
    sizes = {'tee':(.42,.34),'longtop':(.47,.37),'shorts':(.29,.24),'dress':(.38,.36),
             'trousers':(.36,.34),'skirt':(.36,.31),'tie':(.19,.075),'socks':(.20,.12)}
    w,l = sizes[item['kind']]
    if item['id']=='school_jumper': w=.44
    top = item['kind'] in ('tee','longtop','dress')
    poly = [(-.46,0),(-.20,0),(-.15,.08),(0,.13),(.15,.08),(.20,0),(.46,0),
            (.5,.09),(.49,.95),(.44,1),(-.44,1),(-.49,.95),(-.5,.09)] if top else [(-.46,0),(.46,0),(.5,.08),(.49,.95),(.44,1),(-.44,1),(-.49,.95),(-.5,.08)]
    cloth.panel(poly,w,l,closed=True)
    if top:
        cloth.path(poly[:7],w,l,shade=.66,thickness=.007)
        if not low:
            cloth.path([(-.45,.22),(-.31,.39),(-.28,.78)],w,l,shade=.80)
            cloth.path([(.45,.22),(.31,.39),(.28,.78)],w,l,shade=.80)
        cloth.path([(-.46,.89),(0,.90),(.46,.89)],w,l,shade=.76)
    else:
        cloth.path([(-.47,.15),(0,.16),(.47,.15)],w,l,shade=.68,thickness=.006)
        if item['kind'] in ('trousers','shorts','socks'):
            cloth.path([(0,.19),(.015,.95)],w,l,shade=.79)
        if item['kind']=='skirt':
            for x in (-.30,0,.30): cloth.path([(x,.20),(x,.94)],w,l,shade=.74)
    if item['id']=='school_polo':
        collar(cloth,w,l,folded=True)
    if item['id']=='hoodie':
        cloth.patch([(-.18,.03),(-.20,.22),(0,.30),(.20,.22),(.18,.03),(0,.15)],w,l,shade=.78,lift=.003)
    if item['id']=='light_jacket':
        cloth.path([(0,.15),(0,.85)],w,l,shade=.55,thickness=.005)
    if item['id']=='tshirt_motif': star(cloth,w,l,.42)
    if item['kind']=='socks':
        # Overlapping paired cuff/toe outlines remain readable when folded.
        cloth.path([(-.36,.23),(-.35,.90),(.35,.90),(.36,.23)],w,l,shade=.75)
    return cloth.result()


def collar(cloth,w,l,folded=False):
    top=.02
    end=.30 if folded else .24
    cloth.patch([(-.16,top),(-.04,.14),(-.12,end),(-.23,.10)],w,l,shade=.86,lift=.003)
    cloth.patch([(.16,top),(.23,.10),(.12,end),(.04,.14)],w,l,shade=.86,lift=.003)
    cloth.path([(0,.16),(0,.35 if not folded else .40)],w,l,shade=.72,thickness=.007)
    if not cloth.low:
        for t in (.23,.30):
            cloth.patch([(-.009,t-.006),(.009,t-.006),(.009,t+.006),(-.009,t+.006)],w,l,shade=.49,lift=.004)


def star(cloth,w,l,t):
    # A small ordinary five-point screen-print. Same material/atlas as the tee;
    # only its neutral vertex shade changes, so it creates no extra draw call.
    points=[]
    for i in range(10):
        angle=-math.pi/2+i*math.pi/5
        r=.085 if i%2==0 else .037
        points.append((r*math.cos(angle),t+r*w/l*math.sin(angle)))
    indices={}
    def vertex(p):
        if p not in indices:
            indices[p]=len(cloth.v)
            cloth.v.append(cloth.attached(*p,w,l,.0024));cloth.uv.append((p[0]+.5,p[1]));cloth.c.append(G.linear(.34))
        return indices[p]
    for i in range(10):
        a,b,c=(0,t),points[(i+1)%10],points[i]
        ab=tuple((x+y)/2 for x,y in zip(a,b));bc=tuple((x+y)/2 for x,y in zip(b,c));ca=tuple((x+y)/2 for x,y in zip(c,a))
        for triangle in ((a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)):
            cloth.f.append(tuple(vertex(p) for p in triangle))


def cloth_geometry(item,state,low):
    if state=='folded': return folded(item,low)
    cloth=Cloth(item,state,low)
    w,l=item['width'],item['length']
    kind=item['kind']
    if kind=='socks':
        # Two complete socks, offset slightly and with separate cuffs and toes.
        for shift,dt,lift in ((-.30,0,0),(.30,.012,.010)):
            poly=[(x*.81+shift,y*.96+dt) for x,y in G.sock()]
            cloth.panel(poly,w,l,nx=3 if low else 5,ny=4 if low else 7,lift=lift)
            cloth.path([(-.35*.81+shift,.12+dt),(.08*.81+shift,.12+dt)],w,l,shade=.71,thickness=.007,lift=lift+.002)
        return cloth.result()
    poly=outline(item)
    cloth.panel(poly,w,l,nx=(5 if low else 13) if kind=='skirt' else None)
    if kind in ('tee','longtop','dress'):
        cloth.path(poly[:7],w,l,shade=.69,thickness=.0045)
        hem=.94
        half=.27 if kind in ('tee','longtop') else .46
        cloth.path([(-half,hem),(0,hem+.007),(half,hem)],w,l,shade=.80)
        if kind=='longtop':
            cloth.path([(-.49,.65),(-.405,.70)],w,l,shade=.65,thickness=.012)
            cloth.path([(.49,.65),(.405,.70)],w,l,shade=.65,thickness=.012)
        if item['id']=='school_polo': collar(cloth,w,l)
        if item['id']=='tshirt_motif': star(cloth,w,l,.40)
        if item['id']=='hoodie':
            # Collapsed hood above the neckline, with a hollow mouth and folded
            # rim. A generous front pouch distinguishes it from a plain jumper.
            hood=[(-.13,.08),(-.16,-.06),(-.12,-.20),(0,-.24),(.12,-.20),(.16,-.06),(.13,.08),(0,.15)]
            cloth.panel(hood,w,l,nx=3 if low else 5,ny=3 if low else 5,lift=.014,closed=True)
            cloth.path([(-.13,.08),(-.08,-.04),(0,-.08),(.08,-.04),(.13,.08)],w,l,shade=.53,thickness=.005,lift=.016)
            cloth.path([(-.14,.63),(-.20,.80),(-.16,.86),(.16,.86),(.20,.80),(.14,.63)],w,l,shade=.76,thickness=.004)
        if item['id']=='light_jacket':
            collar(cloth,w,l)
            cloth.path([(0,.15),(0,.95)],w,l,shade=.52,thickness=.007)
            for sign in (-1,1): cloth.path([(sign*.20,.62),(sign*.11,.80)],w,l,shade=.67,thickness=.005)
        if item['id']=='school_jumper':
            cloth.path([(-.10,.08),(0,.18),(.10,.08)],w,l,shade=.59,thickness=.011)
        if kind=='dress':
            cloth.path([(-.265,.39),(0,.40),(.265,.39)],w,l,shade=.78,thickness=.003)
    elif kind in ('shorts','trousers'):
        cloth.path([(-.46,.065),(0,.06),(.46,.065)],w,l,shade=.68,thickness=.009)
        for sign in (-1,1):
            cloth.path([(sign*.39,.12),(sign*.28,.27)],w,l,shade=.74,thickness=.003)
            cloth.path([(sign*.12,.94),(sign*.42,.94)],w,l,shade=.73,thickness=.008 if item['id']=='joggers' else .003)
        if not low: cloth.path([(0,.07),(.025,.33)],w,l,shade=.78)
    elif kind=='skirt':
        cloth.path([(-.30,.06),(0,.06),(.30,.06)],w,l,shade=.64,thickness=.010)
        if not low:
            for x in (-.36,-.24,-.12,0,.12,.24,.36):
                cloth.path([(x*.67,.15),(x,.94)],w,l,shade=.79,thickness=.002)
    elif kind=='tie':
        cloth.path([(-.25,.11),(0,.15),(.25,.11)],w,l,shade=.62,thickness=.008)
        if not low: cloth.path([(-.08,.27),(-.15,.85)],w,l,shade=.76)
    return cloth.result()


def geometry(item,state,low=False):
    if item['kind']=='cap': return G.hat_geometry({'id':'cap'},state,segments=12 if low else 24,include_seams=not low)
    if item['kind']=='shoe': return footwear_geometry(item['id'],low)
    return cloth_geometry(item,state,low)


def compact_glb(path):
    """Lossless positions/normals; standard normalized UV16 and COLOR8 storage.

    No compression or decoder extension is needed. Blender already shares mesh
    buffers for linked size instances. This repacks its regular accessor data.
    """
    data=path.read_bytes()
    jlen=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+jlen]); oldbin=data[28+jlen:]
    uv_ids={p['attributes']['TEXCOORD_0'] for m in doc['meshes'] for p in m['primitives']}
    color_ids={p['attributes']['COLOR_0'] for m in doc['meshes'] for p in m['primitives']}
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    views=[]; blob=bytearray()
    for i,a in enumerate(doc['accessors']):
        old=doc['bufferViews'][a['bufferView']]
        fmt,unit=formats[a['componentType']]; width=widths[a['type']]
        start=old.get('byteOffset',0)+a.get('byteOffset',0)
        stride=old.get('byteStride',unit*width)
        values=[]
        for row in range(a['count']): values.extend(struct.unpack_from('<'+fmt*width,oldbin,start+row*stride))
        if i in uv_ids or i in color_ids:
            scale=65535 if i in uv_ids else 255
            if a.get('normalized'):
                src_scale=65535 if a['componentType']==5123 else 255
                values=[v/src_scale for v in values]
            values=[round(min(1,max(0,v))*scale) for v in values]
            a['componentType']=5123 if i in uv_ids else 5121
            a['normalized']=True; fmt='H' if i in uv_ids else 'B'
            a.pop('min',None);a.pop('max',None)
        while len(blob)%4: blob.append(0)
        packed=struct.pack('<'+fmt*len(values),*values)
        view={'buffer':0,'byteOffset':len(blob),'byteLength':len(packed)}
        if 'target' in old: view['target']=old['target']
        views.append(view);blob.extend(packed)
        a['bufferView']=len(views)-1;a.pop('byteOffset',None)
    doc['bufferViews']=views
    doc['buffers']=[{'byteLength':len(blob)}]
    while len(blob)%4: blob.append(0)
    j=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
    j+=b' '*((-len(j))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(j)+len(blob))
    out+=struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob
    path.write_bytes(out)


def scaled_metadata(ob,state,scale):
    raw=G.metadata(ob,'hang-point' if state=='hung' else 'floor-centre')
    for name in ('size','footprint'): raw[name]=[round(v*scale,7) for v in raw[name]]
    raw['bounds']={side:[round(v*scale,7) for v in raw['bounds'][side]] for side in ('min','max')}
    return raw


def build(args):
    if args.only: raise ValueError('--child builds the complete fixed child set; --only is adult-only')
    if args.catalogue.resolve()!=(HERE/'garments.catalog.json').resolve():
        raise ValueError('--catalogue is adult-only; child coverage is the fixed everyday-clothing contract')
    out=args.out.resolve()
    # An isolated --out is an existing model tree, so its adult shared resources
    # and registration manifest can be checked before any child file is replaced.
    source=out/'garments'
    for rel in ('garments/palette.json','garments/prints.png','manifest.json'):
        if not (out/rel).is_file():
            raise ValueError(f'Child --out requires an existing adult model tree; missing {out/rel}')
    palette=json.loads((source/'palette.json').read_text())
    manifest={'schemaVersion':1,'set':'garments_child','scope':'objects-only','childOnly':True,'ageGroup':'child','units':'metres',
        'baseCommit':'621ff65dd086969373e17ae18a2eb8f01997e9be',
        'assetKey':'garment_<id>_<small|big>_<folded|hung|flat>',
        'sizes':{name:{'scale':s,'ages':age} for name,(s,age) in SIZES.items()},
        'palette':'garments/palette.json','atlas':{'file':'garments/prints.png','width':256,'height':256,'embedded':False},
        'limits':{'triangles':800,'lodTriangles':240,'runtimeBytes':700000},
        'content':'Original loose everyday outer-clothing objects and explicitly requested socks, caps and footwear. No figures or worn clothing.',
        'geometry':{'blender':bpy.app.version_string,'staticOnly':True,'drape':'authored static folds','linkedSizeMeshes':True,'uvStorage':'normalized UNSIGNED_SHORT','colourStorage':'normalized UNSIGNED_BYTE'},
        'lodPolicy':{'switchDistanceMetres':8,'cullDistanceMetres':24,'note':'Select only the named high or LOD root from the shared GLB. Integration is left to the caller.'},
        'notApplicable':{'socks_pair.hung':'Requested as folded and flat pairs only.','cap.folded':'The structured crown and stiff peak stay intact.','school_shoes.folded':'Footwear retains its shape.','school_shoes.hung':'Pairs rest on a shelf or floor.','sandals.folded':'Soles retain their shape.','sandals.hung':'Pairs rest on a shelf or floor.'},
        'files':[]}
    G.F.reset()
    assets={}; cache={}
    for row in ITEMS:
        item=spec(row)
        if item['variant'] not in palette['variants']: raise ValueError('Unknown adult palette variant')
        for state in item['states']:
            key_id='tshirt_plain' if item['id'] in ('tshirt_teal','tshirt_coral') else item['id']
            cache_key=(key_id,state)
            if cache_key not in cache:
                pair=[]
                for low in (False,True):
                    vertices,faces,uv,colors=geometry(item,state,low)
                    ob=G.create_mesh(f'child-{key_id}-{state}-'+('lod' if low else 'high'),G.normalized_geometry(vertices,state),faces,uv,colors)
                    G.triangulate(ob)
                    limit=min(180,int(G.tris(pair[0])*.59)) if low else 600
                    G.simplify(ob,limit);G.normalize_object(ob,state)
                    pair.append(ob)
                cache[cache_key]=pair
            high,low=cache[cache_key]
            for size_class,(scale,ages) in SIZES.items():
                key=f"garment_{item['id']}_{size_class}_{state}"
                data={'node':key,'garment':item['id'],'label':item['label'],'labelEs':item['labelEs'],
                      'sizeClass':size_class,'ages':ages,'state':state,'childOnly':True,'ageGroup':'child',
                      **scaled_metadata(high,state,scale),'drawCalls':1,'variants':[item['variant']],'defaultVariant':item['variant']}
                for is_low,ob in ((False,high),(True,low)):
                    name=key+('_lod' if is_low else '')
                    root=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(root)
                    root['garment']=item['id'];root['childOnly']=True;root['sizeClass']=size_class;root['state']=state
                    instance=bpy.data.objects.new(name+'-tint-0',ob.data)
                    bpy.context.scene.collection.objects.link(instance);instance.parent=root;instance.scale=(scale,scale,scale)
                data['lod']={'glb':GLB,'node':key+'_lod',**scaled_metadata(low,state,scale)}
                assets[key]=data
            print(f"child {item['id']}/{state}: {G.tris(high)}/{G.tris(low)} triangles, both sizes",flush=True)
    for pair in cache.values():
        for ob in pair: bpy.data.objects.remove(ob,do_unlink=True)
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.garments-child-stage-',dir=out.parent) as temporary:
        stage=Path(temporary);(stage/'garments').mkdir()
        for name in ('palette.json','prints.png'): shutil.copy2(source/name,stage/'garments'/name)
        shutil.copy2(out/'manifest.json',stage/'manifest.json')
        G.F.export_glb(str(stage/GLB));compact_glb(stage/GLB)
        manifest['files']=[{'glb':GLB,'bytes':(stage/GLB).stat().st_size,'sha256':hashlib.sha256((stage/GLB).read_bytes()).hexdigest(),'assets':assets}]
        # Compact records retain all measured metadata without whitespace payload.
        (stage/MANIFEST).write_text(json.dumps(manifest,separators=(',',':'),ensure_ascii=True)+'\n')
        total=(stage/GLB).stat().st_size+(stage/MANIFEST).stat().st_size
        if total>700000: raise ValueError(f'Child payload {total} exceeds 700000 bytes')
        node=shutil.which('node')
        if not node: raise ValueError('Node is required to validate exported child assets')
        report=stage/'validation.json'
        command=[node,str(HERE/'garments_validate.mjs'),'--child','--complete','--root',str(stage),'--json',str(report)]
        checked=subprocess.run(command,capture_output=True,text=True,timeout=180,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        print(checked.stdout,flush=True)
        if checked.returncode: raise ValueError('Independent child validation failed:\n'+checked.stderr)
        if not report.is_file() or json.loads(report.read_text()).get('assets')!=90: raise ValueError('Child validator did not confirm all 90 states')
        # Only these two child outputs are replaced. An error restores both.
        (out/'garments').mkdir(parents=True,exist_ok=True)
        previous={rel:(out/rel).read_bytes() if (out/rel).exists() else None for rel in (GLB,MANIFEST)}
        try:
            os.replace(stage/GLB,out/GLB)
            os.replace(stage/MANIFEST,out/MANIFEST)
        except BaseException:
            for rel,old in previous.items():
                if old is None: (out/rel).unlink(missing_ok=True)
                else: (out/rel).write_bytes(old)
            raise
        print(f'EXPORTED 90 child states and 90 LODs; {total} new runtime bytes.',flush=True)
