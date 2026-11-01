"""Shared watersports geometry. Metres, +Y up, +Z front, bottom-origin atlas UVs.

The existing furniture mesh/export code remains the only Blender bridge. This
module adds named motion pivots and content-addressed mesh reuse; no game code.
"""
import hashlib
import json
import math
import furn_lib as L
from watersports_atlas import atlas_tiles, ALIASES

MAT = 'watersports_atlas'
ALPHA = 'watersports_alpha'
GLASS = 'watersports_window'
FABRIC = 'watersports_fabric'
WHITE = 0xffffff


class Surface(L.Asset):
    def __init__(self, key, cat, tile='white'):
        super().__init__(key, cat)
        self.tile = tile
        self.uv_domain = None

    def _emit(self, mat, geom, col=None, tint=False, flags=(), rot=(0,0,0), off=(0,0,0), scl=None):
        p, n, uv, tris = geom
        if not p or not tris:
            return
        tile = ALIASES.get(self.tile, self.tile)
        rect = atlas_tiles()[tile]
        if self.uv_domain is None:
            lo = [min(v[i] for v in uv) for i in range(2)]
            hi = [max(v[i] for v in uv) for i in range(2)]
        else:
            lo, hi = self.uv_domain[:2], self.uv_domain[2:]
        # Blender's glTF exporter flips V. Preflip once to preserve the
        # catalogue's bottom-origin game coordinates in the exported GLB.
        mapped = [(rect[0]+(rect[2]-rect[0])*(u-lo[0])/max(hi[0]-lo[0],1e-10),
                   1-(rect[1]+(rect[3]-rect[1])*(v-lo[1])/max(hi[1]-lo[1],1e-10)))
                  for u,v in uv]
        super()._emit(mat,(p,n,mapped,tris),WHITE if col is None else col,tint,flags,rot,off,scl)

    def box(self, mat, lx, ly, lz, sx, sy, sz, col=None, tint=False, r=0.0, m=1,
            ry=0.0, rx=0.0, rz=0.0, skip=(), flags=()):
        # Unlike ground furniture, floating pieces need their submerged faces.
        if min(sx,sy,sz)<=0:
            return
        self._emit(mat,L.rbox_geo(sx/2,sy/2,sz/2,r,m,skip),col,tint,flags,
                   (rx,ry,rz),(lx,ly+sy/2,lz))

    def tube(self,mat,pts,rad,n=6,col=None,tint=False,flags=(),caps=True):
        self._emit(mat,L.tube_geo(pts,rad,n,caps),col,tint,flags)

    def lathe(self,mat,lx,ly,lz,profile,n=16,col=None,tint=False,crease=40.0,
              flags=(),rot=(0,0,0),scl=None,drop0=False,hero=False):
        if drop0:
            profile=profile[1:]
        self._emit(mat,L.lathe_geo(profile,n,crease),col,tint,flags,rot,(lx,ly,lz),scl)

    def cyl(self,mat,lx,ly,lz,rad,h,n=14,r1=None,col=None,tint=False,caps=True,
            ry=0.,rx=0.,rz=0.,flags=(),crease=40.):
        r1=rad if r1 is None else r1
        profile=([(0,0)] if caps else [])+[(rad,0),(r1,h)]+([(0,h)] if caps else [])
        self._emit(mat,L.lathe_geo(profile,n,crease),col,tint,flags,(rx,ry,rz),(lx,ly,lz))


class Model:
    def __init__(self,key,cat,lod=0):
        self.key=key+('_lod1' if lod and not key.endswith('_lod1') else '')
        self.cat=cat
        self.lod=lod
        self.body=Surface(self.key,cat)
        self.parts=[]

    def part(self,id,position=(0,0,0),axis=(0,1,0),parent=None,rotation=(0,0,0)):
        surface=Surface(self.key+'-pivot_'+id,self.cat)
        self.parts.append({'id':id,'position':position,'axis':axis,'parent':parent,
                           'rotation':rotation,'surface':surface})
        return surface

    def instance(self,id,position,surface,rotation=(0,0,0),parent=None):
        self.parts.append({'id':id,'position':position,'axis':(0,1,0),'parent':parent,
                           'rotation':rotation,'surface':surface,'instance':True})
        return surface

    def triangles(self):
        return sum(len(g.I) for a in [self.body]+[p['surface'] for p in self.parts]
                   for g in a.groups.values())


def poly(a,points,tile=None,normal=None,uv=None,mat=None):
    if len(points)<3:
        return
    normal=normal or L._unit(L._cross(L._sub(points[1],points[0]),L._sub(points[2],points[0])))
    if L._len(normal)<.5:
        raise ValueError('collinear polygon')
    explicit=uv is not None
    if uv is None:
        axis=max(range(3),key=lambda i:abs(normal[i]))
        uv=[(p[(axis+1)%3],p[(axis+2)%3]) for p in points]
    old,domain=a.tile,a.uv_domain
    if tile is not None:a.tile=tile
    if explicit:a.uv_domain=(0,0,1,1)
    a._emit(mat or MAT,(points,[normal]*len(points),uv,
                       [(0,i,i+1) for i in range(1,len(points)-1)]),WHITE,False,())
    a.tile,a.uv_domain=old,domain


def bar(a,p,q,r=.015,n=6,tile=None,mat=None):
    old=a.tile
    if tile is not None:a.tile=tile
    a.tube(mat or MAT,[p,q],r,n=n,col=WHITE,caps=True)
    a.tile=old


def box(a,tile,x,y,z,w,h,d,**kw):
    old=a.tile;a.tile=tile
    a.box(MAT,x,y,z,w,h,d,col=WHITE,**kw)
    a.tile=old


def signature(surface):
    data=[(k,g.P,g.N,g.UV,g.C,g.I) for k,g in surface.groups.items() if g.I]
    return hashlib.sha256(json.dumps(data,separators=(',',':')).encode()).hexdigest()


def create_objects(model,cache):
    import bpy
    from mathutils import Matrix
    collection=bpy.context.scene.collection
    basis=Matrix(((1,0,0),(0,0,-1),(0,1,0)))

    def create(surface,name):
        sig=signature(surface)
        if sig not in cache:
            old=surface.key;surface.key=name
            root=L.build_objects(surface,collection);surface.key=old
            # A name decal can differ while the entire wooden hull is shared.
            # Deduplicate each material group as well as complete surfaces.
            groups=[(k,g) for k,g in surface.groups.items() if g.I]
            for obj,(key,g) in zip(root.children,groups):
                digest='mesh:'+hashlib.sha256(json.dumps((key,g.P,g.N,g.UV,g.C,g.I),
                                                       separators=(',',':')).encode()).hexdigest()
                if digest in cache:
                    unused=obj.data;obj.data=cache[digest]
                    if unused.users==0:bpy.data.meshes.remove(unused)
                else:cache[digest]=obj.data
            cache[sig]=[child.data for child in root.children]
        else:
            root=bpy.data.objects.new(name,None);collection.objects.link(root)
            for i,mesh in enumerate(cache[sig]):
                obj=bpy.data.objects.new(name+'-mesh_'+str(i),mesh)
                collection.objects.link(obj);obj.parent=root
        return root

    root=create(model.body,model.key)
    parts={}
    for p in model.parts:
        obj=create(p['surface'],model.key+('-instance_' if p.get('instance') else '-pivot_')+p['id'])
        obj.parent=parts[p['parent']] if p['parent'] else root
        obj.location=L.to_blender(p['position'])
        if any(p['rotation']):
            game=Matrix(L._rotm(*p['rotation']))
            obj.rotation_mode='QUATERNION'
            obj.rotation_quaternion=(basis@game@basis.transposed()).to_quaternion()
        obj['axis']=list(p['axis'])
        parts[p['id']]=obj
    return root
