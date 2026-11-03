"""Deterministic, texture-free vegetation GLBs for La Ladera.

Run from the repository root (always headless, through the existing quiet wrapper):
  node la-ladera/tests/memgate.mjs 6 300 &&
  node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
    --python la-ladera/tools/blender/veg_build.py -- --out la-ladera/assets/models

Original parameterised geometry; no downloaded scans or add-on dependency.
Uses the furniture pipeline's scene reset, coordinate conversion, colour conversion,
material registry and GLB exporter. Each LOD is ONE mesh and ONE primitive. RGB
vertex colour is linear albedo; alpha is wind flexibility, never transparency.
The external far-tree atlas is an orthographic raster of the exact high LODs.
"""
import os, sys, math, json, random, hashlib, struct, zlib, argparse
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import numpy as np
import furn_lib as L

TAU = math.tau
TREES = ['eucalyptus', 'cypress', 'palm', 'banana', 'almendro']
SPECIES = TREES + ['agave', 'bougainvillea', 'potted_fern', 'potted_succulent',
                   'climbing_vine', 'window_box', 'flower_bed', 'wild_grass', 'leafy_shrub']
RIGID = {'potted_fern': .46, 'potted_succulent': .40, 'window_box': .22, 'flower_bed': .12}


def add(a, b): return tuple(a[i] + b[i] for i in range(3))
def sub(a, b): return tuple(a[i] - b[i] for i in range(3))
def mul(a, k): return tuple(v * k for v in a)
def unit(a): return L._unit(a)
def cross(a, b): return L._cross(a, b)
def mix(a, b, t): return add(mul(a, 1 - t), mul(b, t))
def polar(a, r, y): return (math.cos(a) * r, y, math.sin(a) * r)


class Geometry:
    def __init__(self):
        self.p, self.n, self.uv, self.c, self.wind, self.f = [], [], [], [], [], []

    def append(self, points, faces, colour, wind=0, normals=None, uvs=None):
        start = len(self.p)
        self.p.extend(points)
        rgb = L.lin3(colour)
        self.c.extend([rgb] * len(points))
        self.wind.extend([float(wind)] * len(points) if isinstance(wind, (float, int)) else wind)
        self.uv.extend(uvs or [(p[0], p[1]) for p in points])
        if normals is None:
            normals = [[0., 0., 0.] for _ in points]
            for a, b, c in faces:
                n = cross(sub(points[b], points[a]), sub(points[c], points[a]))
                for i in [a, b, c]:
                    for k in range(3): normals[i][k] += n[k]
            normals = [unit(n) for n in normals]
        self.n.extend(normals)
        for a, b, c in faces:
            if L._len(cross(sub(points[b], points[a]), sub(points[c], points[a]))) > 1e-10:
                self.f.append((start + a, start + b, start + c))

    def tube(self, path, radii, sides=5, colour=0x78614a, wind=0, caps=True):
        ps, ns, uv, ws, fs = [], [], [], [], []
        for j, centre in enumerate(path):
            tangent = unit(sub(path[min(j + 1, len(path) - 1)], path[max(0, j - 1)]))
            axis = (0., 1., 0.) if abs(tangent[1]) < .9 else (1., 0., 0.)
            u = unit(cross(tangent, axis)); v = cross(tangent, u)
            for k in range(sides):
                angle = TAU * k / sides
                n = add(mul(u, math.cos(angle)), mul(v, math.sin(angle)))
                ps.append(add(centre, mul(n, radii[j]))); ns.append(n)
                uv.append((k / sides, j / max(1, len(path) - 1)))
                ws.append(wind * j / max(1, len(path) - 1) if isinstance(wind, (int, float)) else wind[j])
        for j in range(len(path) - 1):
            for k in range(sides):
                a = j * sides + k; b = j * sides + (k + 1) % sides; c = b + sides; d = a + sides
                fs.extend([(a, b, c), (a, c, d)])
        if caps:
            for end in [0, len(path) - 1]:
                centre_index = len(ps)
                ps.append(path[end]); ns.append(mul(unit(sub(path[1], path[0])), -1 if end == 0 else 1))
                uv.append((.5, .5)); ws.append(ws[end * sides])
                for k in range(sides):
                    a, b = end * sides + k, end * sides + (k + 1) % sides
                    fs.append((centre_index, b, a) if end == 0 else (centre_index, a, b))
        # Furniture's analytic convention also guarantees consistent outward winding.
        fixed = []
        for a, b, c in fs:
            fn = cross(sub(ps[b], ps[a]), sub(ps[c], ps[a]))
            if sum(fn[i] * (ns[a][i] + ns[b][i] + ns[c][i]) for i in range(3)) < 0: b, c = c, b
            fixed.append((a, b, c))
        self.append(ps, fixed, colour, ws, ns, uv)

    def leaf(self, root, direction, length, width, colour, wind=.85, roll=0., fold=.12, simple=False):
        d = unit(direction)
        side = unit(cross(d, (0, 1, 0) if abs(d[1]) < .94 else (0, 0, 1)))
        normal = unit(cross(side, d))
        side, normal = add(mul(side, math.cos(roll)), mul(normal, math.sin(roll))), add(mul(normal, math.cos(roll)), mul(side, -math.sin(roll)))
        mid = add(root, mul(d, length * .43))
        ps = [root, add(mid, mul(side, width / 2)), add(root, mul(d, length)),
              add(mid, mul(side, -width / 2)), add(mid, mul(normal, width * fold))]
        ns = [normal] * 5
        if simple:
            self.append(ps[:4], [(0, 1, 2), (0, 2, 3)], colour,
                        [wind * .55, wind, wind, wind], ns[:4], [(0.5, 0), (0, .43), (.5, 1), (1, .43)])
        else:
            self.append(ps, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], colour,
                        [wind * .55, wind, wind, wind, wind * .8], ns, [(0.5, 0), (0, .43), (.5, 1), (1, .43), (.5, .43)])

    def bough(self, centre, scale, colour, wind=.7, seed=0, up=.15):
        """Twenty-triangle jagged, open foliage spray, never a smooth closed hull.

        Five overlapping folded leaves have different planes, lengths and shades.
        Far LODs retain a broken leafy silhouette instead of an ellipsoid mass.
        """
        rng=random.Random(seed);g=Geometry()
        for j in range(5):
            a=j*2.39996+seed*.37
            root=(rng.uniform(-.12,.12),rng.uniform(-.1,.1),rng.uniform(-.12,.12))
            direction=(math.cos(a),up+rng.uniform(-.22,.28),math.sin(a))
            g.leaf(root,direction,rng.uniform(.95,1.35),rng.uniform(.70,1.0),
                   L.mulc(colour,rng.uniform(.87,1.13)),wind,rng.uniform(-.6,.6),.20)
        base=len(self.p)
        self.p.extend([add(centre,tuple(p[k]*scale[k] for k in range(3))) for p in g.p])
        self.n.extend([unit(tuple(n[k]/scale[k] for k in range(3))) for n in g.n])
        self.uv.extend(g.uv);self.c.extend(g.c);self.wind.extend(g.wind)
        self.f.extend([tuple(base+i for i in f) for f in g.f])

    def ico(self, centre, scale, colour, wind=.7, jitter=.0, seed=0):
        # Twenty-sided, irregular foliage cores. Leaves supply the near silhouette;
        # these small volumes stop the canopy reading as a stack of empty cards.
        t = (1 + math.sqrt(5)) / 2
        points = [(-1,t,0),(1,t,0),(-1,-t,0),(1,-t,0),(0,-1,t),(0,1,t),(0,-1,-t),(0,1,-t),(t,0,-1),(t,0,1),(-t,0,-1),(-t,0,1)]
        faces = [(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),(10,7,6),(7,1,8),
                 (3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),(2,4,11),(6,2,10),(8,6,7),(9,8,1)]
        rng = random.Random(seed)
        normals = [unit(p) for p in points]
        ps = [add(centre, tuple(n[i] * scale[i] * rng.uniform(1 - jitter, 1 + jitter) for i in range(3))) for n in normals]
        self.append(ps, faces, colour, wind, normals)

    def box(self, centre, size, colour):
        p, n, uv, f = L.rbox_geo(size[0]/2, size[1]/2, size[2]/2)
        self.append([add(q, centre) for q in p], f, colour, 0, n, uv)

    def bounds(self):
        return {'min': [min(p[k] for p in self.p) for k in range(3)],
                'max': [max(p[k] for p in self.p) for k in range(3)]}

    def finish(self, rigid=0):
        floor = min(p[1] for p in self.p)
        if floor < -1e-7:
            self.p = [(p[0], p[1] - floor, p[2]) for p in self.p]
        h = max(p[1] for p in self.p)
        for i, p in enumerate(self.p):
            if p[1] <= max(rigid, h * .011): self.wind[i] = 0.
            else: self.wind[i] = max(0., min(1., self.wind[i]))
        return self


def greens(rng, palette): return palette[rng.randrange(len(palette))]


def eucalyptus(lod, rng):
    g = Geometry(); bark = 0xb6b2a0
    if lod == 2:
        g.tube([(0,0,0),(.12,3.4,.04),(.32,7.0,.1)], [.23,.12,.035], 4, bark, .12, False)
        for i, c in enumerate([(-1.4,5.0,.8),(1.5,5.8,-.8),(-.1,6.55,.1),(.8,5.5,1.4),(-.8,5.9,-1.4)]):
            g.bough(c,(1.3,1.6,1.25),[0x617b54,0x768b61,0x52724b,0x7d906b,0x6e875b][i], .7, i, -.45)
        return g.finish()
    sides, segs = (7, 6) if lod == 0 else (5, 4)
    path = [(.33 * (j/segs)**1.4, 7.5*j/segs, .13*math.sin(j*.7)) for j in range(segs+1)]
    g.tube(path,[.24*(1-j/segs)+.022 for j in range(segs+1)],sides,bark,.18,False)
    centres = []
    branches = 15 if lod == 0 else 8
    for i in range(branches):
        angle = i * 2.39996
        y = 3.6 + 3.2*(i/(branches-1))
        r = 2.0 - .55*(y-3.6)/3.2
        p = (.15, y-.8, .05)
        c = polar(angle, r, y)
        branch = [p, mix(p,c,.58), c]
        g.tube(branch,[.07,.035,.008],4 if lod == 0 else 3,0xa3a38f,.42,False)
        centres.append(c)
    n = 455 if lod == 0 else 232
    for i in range(n):
        c = centres[i % branches]
        angle = rng.uniform(0,TAU); rr = rng.random()**.5
        p = add(c, (math.cos(angle)*rr*.65, rng.uniform(-.35,.45), math.sin(angle)*rr*.65))
        direction = (math.cos(angle)*.25, -rng.uniform(.45,1), math.sin(angle)*.25)
        g.leaf(p,direction,rng.uniform(.60,.95),rng.uniform(.15,.25),greens(rng,[0x728b61,0x9aab7c,0x557647,0x80966f,0x65805a]),.88,rng.uniform(-1.4,1.4),simple=lod==1)
    return g.finish()


def cypress(lod, rng):
    g = Geometry(); h = 7.8
    g.tube([(0,0,0),(.03,h*.45,0),(.03,h*.97,0)], [.2,.12,.018], [7,5,4][lod],0x79664e,.08,False)
    tiers=[12,7,5][lod];around=1 if lod==2 else 3
    for j in range(tiers):
        t=j/(tiers-1);y=.8+t*5.85
        radius=(.95-.54*t)*(1+.1*math.sin(j*1.7))
        for k in range(around):
            a=j*2.39996+k*TAU/around
            c=polar(a,radius*.35 if around>1 else .08,y)
            g.bough(c,(radius*1.25,1.15,radius*1.25),
                    greens(rng,[0x456d3d,0x60834b,0x365a32,0x75915b]),.65,j*13+k,1.05)
    n=[280,60,0][lod]
    for i in range(n):
        t=rng.uniform(.08,.94); y=.9+t*6.9; a=rng.uniform(0,TAU)
        r=(.95-.54*t)*(1+.10*math.sin(t*18))
        root=polar(a,r*rng.uniform(.75,.98),y)
        g.leaf(root,(math.cos(a)*.45,.85,math.sin(a)*.45),rng.uniform(.25,.5),rng.uniform(.15,.28),
               greens(rng,[0x4d6a3f,0x64834e,0x395732,0x76915c]),.7,a, .28,simple=lod==1)
    return g.finish()


def palm(lod, rng):
    g=Geometry(); h=6.9
    segs,sides=[(10,8),(6,5),(4,4)][lod]
    path=[(.3*math.sin(j/segs*1.4),h*j/segs,.17*(j/segs)**2) for j in range(segs+1)]
    g.tube(path,[.23*(1-.42*j/segs) for j in range(segs+1)],sides,0x998367,.12,False)
    centre=path[-1]
    if lod==2:
        for j in range(7):
            a=j*TAU/7
            for k in range(3):
                t0=k/3;t1=(k+1)/3
                def pos(t): return add(centre,(math.cos(a)*3.4*t,1.0*math.sin(t*math.pi)-1.3*t,math.sin(a)*3.4*t))
                side=(-math.sin(a),0,math.cos(a)); p0=pos(t0);p1=pos(t1)
                w0=.70*math.sin((t0*.8+.12)*math.pi);w1=.70*math.sin((t1*.8+.12)*math.pi)
                mid=mix(p0,p1,.5)
                g.append([add(p0,mul(side,-w0)),add(p0,mul(side,w0)),add(p1,mul(side,w1)),add(p1,mul(side,-w1)),add(mid,(0,.12,0))],
                         [(0,1,4),(1,2,4),(2,3,4),(3,0,4)],0x537941,.8)
        return g.finish()
    fronds,pairs,steps=[(14,12,4),(9,6,2)][lod]
    for j in range(fronds):
        a=j*2.39996; length=3.15 + .35*math.sin(j*1.7)
        rise=.85+.5*math.sin(j*2.3); drop=1.1+.4*math.cos(j)
        def pos(t): return add(centre,(math.cos(a)*length*t,rise*math.sin(t*math.pi)-drop*t,math.sin(a)*length*t))
        g.tube([pos(k/steps) for k in range(steps+1)],[.045*(1-k/steps)+.006 for k in range(steps+1)],4,0x7d8b4c,.75,False)
        for k in range(pairs):
            t=.10+.87*k/pairs; root=pos(t)
            width=1.15*math.sin(math.pi*t)**.55+.14
            for sign in [-1,1]:
                d=(-math.sin(a)*sign*.85+math.cos(a)*.32,-.32,math.cos(a)*sign*.85+math.sin(a)*.32)
                g.leaf(root,d,width,.30 if lod==0 else .42,greens(rng,[0x577d3d,0x78934b,0x446e35,0x8a9c58]),.9,.2*sign)
    return g.finish()


def banana(lod,rng):
    g=Geometry()
    stems=[((0,0,0),2.5,1.),((-.48,0,.23),1.75,.78),((.45,0,-.28),1.35,.62)][:3 if lod==0 else 2 if lod==1 else 1]
    leaf_counts=[(10,7,5),(8,5),(7,)][lod]
    blade_segments=[18,11,4][lod]
    for si,(base,h,scale) in enumerate(stems):
        g.tube([base,add(base,(.1,h*.55,0)),add(base,(.16,h,.04))],[.15*scale,.11*scale,.045*scale], [6,4,4][lod],0x91a05b,.22,False)
        for j in range(leaf_counts[si]):
            a=j*2.39996+si*.7; root=add(base,(.16,h,.04)); ln=(1.9+.2*math.sin(j))*scale
            side=(-math.sin(a),0,math.cos(a))
            def pos(t): return add(root,(math.cos(a)*ln*t,.9*scale*math.sin(t*math.pi)-.45*scale*t,math.sin(a)*ln*t))
            for k in range(blade_segments):
                t0=k/blade_segments;t1=(k+1)/blade_segments
                for sign in [-1,1]:
                    p0=pos(t0);p1=pos(t1)
                    w0=.40*scale*math.sin(math.pi*t0)**.65
                    w1=.40*scale*math.sin(math.pi*t1)**.65
                    # A staggered perimeter and open notches reproduce split banana leaves.
                    if k>blade_segments*.35 and k<blade_segments*.85 and (k+j+si)%4==0:
                        w1*=.70
                    outer0=add(add(p0,mul(side,sign*w0)),(0,-w0*.18,0))
                    outer1=add(add(p1,mul(side,sign*w1)),(0,-w1*.18,0))
                    g.append([p0,p1,outer1,outer0],[(0,1,2),(0,2,3)],greens(rng,[0x6d964e,0x8bab5a,0x52843d,0x749947]),.88)
            if lod==0:
                g.tube([pos(k/3) for k in range(4)],[.022,.017,.011,.003],3,0xb7b96e,.83,False)
    return g.finish()


def almendro(lod,rng):
    g=Geometry(); bark=0x887457
    g.tube([(0,0,0),(.05,2.6,.04),(.12,5.8,.08)],[.32,.20,.055],[8,5,4][lod],bark,.12,False)
    if lod==2:
        for i,(c,sc) in enumerate([((-1.4,4.5,-.4),(2.0,1.4,1.8)),((1.25,4.85,.65),(2.0,1.25,1.8)),((0,5.55,-.55),(1.8,1.25,1.7)),((-.5,4.1,1.1),(2.0,1.3,1.8)),((1.1,4.1,-1.3),(1.9,1.3,1.8))]):
            g.bough(c,sc,[0x5f7c41,0x789049,0x829b54,0x678346,0x6c8849][i],.65,i)
        return g.finish()
    centres=[]; branches=12 if lod==0 else 6
    for j in range(branches):
        a=j*2.39996;y=4.85+.7*math.sin(j*1.1);r=2.05+.4*math.sin(j*1.7)
        c=polar(a,r,y); p=(.1,y-.85,.05)
        g.tube([p,mix(p,c,.55),c],[.095,.045,.012],4 if lod==0 else 3,bark,.45,False)
        centres.append(c)
    for i in range(480 if lod==0 else 250):
        c=centres[i%branches];a=rng.uniform(0,TAU);r=rng.random()**.5
        p=add(c,(math.cos(a)*r*.95,rng.uniform(-.6,.65),math.sin(a)*r*.95))
        g.leaf(p,(math.cos(a),rng.uniform(-.35,.6),math.sin(a)),rng.uniform(.58,.90) if lod==0 else rng.uniform(.65,1.05),
               rng.uniform(.32,.48) if lod==0 else rng.uniform(.43,.65),
               greens(rng,[0x7e964d,0x557738,0x96a95b,0x6b8b40,0x8f9e58]),.82,rng.uniform(-.8,.8),simple=lod==1)
    return g.finish()


def rosette(g,centre,scale,lod,rng,agave=True):
    n=[25,13,6][lod]
    for j in range(n):
        a=j*2.39996; layer=(j%3)/2
        ln=scale*(.65+.4*layer);rise=scale*(.6-.35*layer)
        width=scale*(.19 if agave else .28)
        steps=[6,3,1][lod]
        ps=[];ns=[];fs=[]
        for k in range(steps+1):
            t=k/steps
            centreline=add(centre,(math.cos(a)*ln*t,rise*math.sin(t*1.35)+.1*scale*t,math.sin(a)*ln*t))
            w=width*(math.sin(math.pi*(.12+.88*t))**.7 if agave else math.sin(math.pi*(.1+.9*t))**.4)
            side=(-math.sin(a),0,math.cos(a))
            ps.extend([add(centreline,mul(side,-w)),add(centreline,(0,.06*scale*math.sin(math.pi*t),0)),add(centreline,mul(side,w))])
        for k in range(steps):
            i=k*3
            fs.extend([(i,i+3,i+4),(i,i+4,i+1),(i+1,i+4,i+5),(i+1,i+5,i+2)])
        g.append(ps,fs,greens(rng,[0x688f7a,0x82a18c,0x537f6a,0x9eb39a] if agave else [0x78985f,0x9fb381,0x6b905a]),
                 [.2 + .55*k/(steps*3+2) for k in range(len(ps))])


def agave(lod,rng):
    g=Geometry();rosette(g,(0,0,0),1.,lod,rng)
    return g.finish()


def pot(g,height,radius,lod,colour=0xb37754):
    sides=[12,8,5][lod]
    g.tube([(0,0,0),(0,height*.9,0),(0,height,0)],[radius*.68,radius,radius*.95],sides,colour,0,True)
    # Soil sits just below the rim; no animated vertex belongs to the container.
    g.tube([(0,height*.955,0),(0,height*.96,0)],[radius*.88,radius*.88],sides,0x3c3528,0,True)


def potted_fern(lod,rng):
    g=Geometry();pot(g,.46,.27,lod)
    count,pairs=[(15,8),(8,4),(4,2)][lod]
    for j in range(count):
        a=j*2.39996;ln=.60+.15*math.sin(j);rise=.35+.12*math.cos(j)
        def pos(t): return (math.cos(a)*ln*t,.46+rise*math.sin(t*2.2)+.05,math.sin(a)*ln*t)
        g.tube([pos(0),pos(.5),pos(1)],[.012,.007,.002],3,0x779347,.7,False)
        for k in range(pairs):
            t=(k+.6)/(pairs+.3);root=pos(t)
            for sign in [-1,1]:
                d=(-math.sin(a)*sign+math.cos(a)*.22,.05,math.cos(a)*sign+math.sin(a)*.22)
                g.leaf(root,d,.20*(1-t*.8),.055,greens(rng,[0x648647,0x83a25c,0x4d763b]),.85)
    return g.finish(.46)


def potted_succulent(lod,rng):
    g=Geometry();pot(g,.40,.26,lod,0xb8aba0);rosette(g,(0,.40,0),.41,lod,rng,False)
    return g.finish(.40)


def flowering_shrub(lod,rng,flowers=True):
    g=Geometry();n=[9,5,2][lod]
    centres=[]
    for j in range(n):
        a=j*2.39996;c=polar(a,.55+.12*math.sin(j),.75+.35*(j%3)/2)
        g.tube([(0,0,0),mix((0,0,0),c,.55),c],[.042,.022,.005],3,0x836747,.35,False)
        centres.append(c)
        if lod<2 and j%2==0:g.ico(c,(.36,.33,.37),0x496938,.6,.18,j)
    count=[185,60,12][lod]
    for j in range(count):
        c=centres[j%n];a=rng.uniform(0,TAU);p=add(c,(math.cos(a)*rng.uniform(.05,.35),rng.uniform(-.20,.27),math.sin(a)*rng.uniform(.05,.35)))
        g.leaf(p,(math.cos(a),.4,math.sin(a)),rng.uniform(.15,.26),.11,greens(rng,[0x6b8843,0x496c36,0x82994e]),.85,a*.3)
        if flowers and j%3==0:
            for k in range(3 if lod==0 else 2 if lod==1 else 1):
                g.leaf(add(p,(0,.06,0)),(math.cos(k*TAU/3),.45,math.sin(k*TAU/3)),.13,.12,greens(rng,[0xb64175,0xd66594,0xa93065,0xdb7fa3]),.9,k)
    return g.finish()


def climbing_vine(lod,rng):
    g=Geometry();strands=[6,4,2][lod]
    tips=[]
    for j in range(strands):
        steps=[9,6,3][lod];height=2.5-.25*(j%3);x=(j-(strands-1)/2)*.18
        path=[(x+.14*math.sin(k*.8+j),height*k/steps,.05+.06*math.sin(k+j)) for k in range(steps+1)]
        g.tube(path,[.018*(1-.7*k/steps) for k in range(steps+1)],3,0x6e7443,.4,False)
        tips.extend(path[1:])
    for j in range([160,48,10][lod]):
        p=tips[j%len(tips)];a=rng.uniform(0,TAU)
        root=add(p,(rng.uniform(-.12,.12),rng.uniform(-.15,.12),rng.uniform(0,.12)))
        g.leaf(root,(math.cos(a),math.sin(a)*.8,.15),.22,.17,greens(rng,[0x648744,0x85a457,0x4d753b]),.86,rng.uniform(-.3,.3))
    return g.finish()


def window_box(lod,rng):
    g=Geometry();g.box((0,.11,0),(1.0,.22,.28),0x987052)
    g.box((0,.22,0),(.91,.015,.22),0x413828)
    count=[70,24,6][lod]
    for i in range(count):
        x=rng.uniform(-.43,.43);z=rng.uniform(-.09,.09);y=rng.uniform(.24,.47)
        p=(x,y,z);a=rng.uniform(0,TAU)
        if i%4==0:
            g.tube([(x,.23,z),p],[.009,.003],3,0x738a44,.55,False)
        g.leaf(p,(math.cos(a),rng.uniform(-.4,.3),math.sin(a)),.20,.12,greens(rng,[0x597e3f,0x79974f,0x9aa45a]),.8)
        if i%3==0:
            g.leaf(add(p,(0,.035,0)),(math.cos(a),.4,math.sin(a)),.11,.10,greens(rng,[0xc95357,0xe2a37a,0xd87884]),.9)
    return g.finish(.22)


def flower_bed(lod,rng):
    g=Geometry();g.box((0,.055,0),(1.5,.11,.8),0x64503a)
    count=[140,45,10][lod]
    for i in range(count):
        x=rng.uniform(-.69,.69);z=rng.uniform(-.34,.34);y=rng.uniform(.16,.46);a=rng.uniform(0,TAU)
        p=(x,y,z)
        g.leaf(p,(math.cos(a),.2,math.sin(a)),.16,.085,greens(rng,[0x6c8843,0x8a9b51,0x4f7335]),.85)
        if i%3==0:
            g.tube([(x,.12,z),p],[.007,.003],3,0x718448,.55,False)
            for k in range(3 if lod==0 else 2 if lod==1 else 1):
                ang=a+k*TAU/3
                g.leaf(add(p,(0,.03,0)),(math.cos(ang),.2,math.sin(ang)),.10,.08,greens(rng,[0xd3ac48,0xdd8557,0xe3c476,0xb47b85]),.9)
    return g.finish(.12)


def wild_grass(lod,rng):
    g=Geometry();count=[95,28,7][lod]
    for i in range(count):
        a=i*2.39996;r=rng.random()*.25;base=polar(a,r,0);h=rng.uniform(.18,.53);lean=rng.uniform(.1,.3)
        side=(-math.sin(a)*.015,0,math.cos(a)*.015)
        mid=add(base,(math.cos(a)*lean*.4,h*.58,math.sin(a)*lean*.4));tip=add(base,(math.cos(a)*lean,h,math.sin(a)*lean))
        ps=[add(base,mul(side,-1)),add(base,side),add(mid,side),add(mid,mul(side,-1)),tip]
        g.append(ps,[(0,1,2),(0,2,3),(3,2,4)],greens(rng,[0x82905a,0xa0a36c,0x69834a,0xb2ab78,0x7a8a4e]),[0,0,.55,.55,1.])
    return g.finish()


BUILDERS={'eucalyptus':eucalyptus,'cypress':cypress,'palm':palm,'banana':banana,'almendro':almendro,
          'agave':agave,'potted_fern':potted_fern,'potted_succulent':potted_succulent,
          'bougainvillea':lambda l,r:flowering_shrub(l,r,True),
          'leafy_shrub':lambda l,r:flowering_shrub(l,r,False),
          'climbing_vine':climbing_vine,'window_box':window_box,'flower_bed':flower_bed,'wild_grass':wild_grass}


def object_from_geometry(g,name,material):
    me=bpy.data.meshes.new(name)
    me.from_pydata([L.to_blender(p) for p in g.p],[],g.f);me.update(calc_edges=True)
    uv=me.uv_layers.new(name='UVMap');uv.data.foreach_set('uv',[v for face in g.f for i in face for v in g.uv[i]])
    ca=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER');me.color_attributes.active_color=ca
    ca.data.foreach_set('color',[v for face in g.f for i in face for v in (*g.c[i],g.wind[i])])
    me.polygons.foreach_set('use_smooth',[True]*len(me.polygons))
    me.normals_split_custom_set([L.to_blender(g.n[i]) for face in g.f for i in face])
    mat=L.get_mat(material);mat.diffuse_color=(1,1,1,1);mat.use_nodes=True
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,1,1,1)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9
    mat.use_backface_culling=False
    me.materials.append(mat)
    ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob)
    return ob


def atlas_tile(g,tile=512):
    """Opaque-triangle orthographic front render, with an exact float z-buffer.

    Independent of graphics drivers, display servers, or Blender render devices.
    Linear vertex colour and analytic normals are interpolated before sRGB PNG
    encoding. Transparent pixels remain transparent; four pixels of safety margin
    keep mipmaps from sampling an adjacent tree. No external source images.
    """
    bounds=g.bounds();lo,hi=bounds['min'],bounds['max']
    pad=.045;w=(hi[0]-lo[0])/(1-pad*2);h=(hi[1]-lo[1])/(1-pad*2)
    cx=(lo[0]+hi[0])/2;bottom=lo[1]-h*pad
    p=np.array(g.p,dtype=np.float64)
    sx=(p[:,0]-cx+w/2)/w*(tile-1);sy=(1-(p[:,1]-bottom)/h)*(tile-1)
    depth=np.full((tile,tile),-np.inf);image=np.zeros((tile,tile,4),dtype=np.uint8)
    colours=np.array(g.c);normals=np.array(g.n);light=np.array([-.45,.65,1.]);light/=np.linalg.norm(light)
    shade=.55+.45*np.abs(normals@light)
    colours=colours*shade[:,None]
    for face in g.f:
        ids=np.array(face);xx=sx[ids];yy=sy[ids]
        xmin=max(0,int(np.floor(xx.min())));xmax=min(tile-1,int(np.ceil(xx.max())))
        ymin=max(0,int(np.floor(yy.min())));ymax=min(tile-1,int(np.ceil(yy.max())))
        if xmin>xmax or ymin>ymax:continue
        den=(yy[1]-yy[2])*(xx[0]-xx[2])+(xx[2]-xx[1])*(yy[0]-yy[2])
        if abs(den)<1e-10:continue
        x,y=np.meshgrid(np.arange(xmin,xmax+1)+.5,np.arange(ymin,ymax+1)+.5)
        a=((yy[1]-yy[2])*(x-xx[2])+(xx[2]-xx[1])*(y-yy[2]))/den
        b=((yy[2]-yy[0])*(x-xx[2])+(xx[0]-xx[2])*(y-yy[2]))/den;c=1-a-b
        z=a*p[ids[0],2]+b*p[ids[1],2]+c*p[ids[2],2]
        current=depth[ymin:ymax+1,xmin:xmax+1]
        mask=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6)&(z>current)
        if not mask.any():continue
        rgb=a[:,:,None]*colours[ids[0]]+b[:,:,None]*colours[ids[1]]+c[:,:,None]*colours[ids[2]]
        rgb=np.where(rgb<=.0031308,rgb*12.92,1.055*np.maximum(rgb,0)**(1/2.4)-.055)
        target=image[ymin:ymax+1,xmin:xmax+1];target[mask,:3]=np.clip(rgb[mask]*255+.5,0,255).astype(np.uint8);target[mask,3]=255
        current[mask]=z[mask]
    return image,{'width':w,'height':h,'centreX':cx,'bottom':bottom}


def png_write(path,rgba):
    h,w,_=rgba.shape
    def chunk(k,data):return struct.pack('>I',len(data))+k+data+struct.pack('>I',zlib.crc32(k+data)&0xffffffff)
    raw=b''.join(b'\x00'+row.tobytes() for row in rgba)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    Path(path).write_bytes(data)


def billboard(rect,tile_index):
    g=Geometry();x=rect['centreX'];w=rect['width'];h=rect['height'];y=rect['bottom']
    # Root at the tree's soil level. The transparent margin is allowed below zero.
    # Clamp the lower edge to zero and crop that part of its UV rectangle exactly.
    v0=max(0,-y/h);y0=max(0,y)
    ps=[(x-w/2,y0,0),(x+w/2,y0,0),(x+w/2,y+h,0),(x-w/2,y+h,0)]
    u0=tile_index/len(TREES);u1=(tile_index+1)/len(TREES)
    g.append(ps,[(0,1,2),(0,2,3)],0xffffff,[0,0,.8,.8],[(0,0,1)]*4,[(u0,v0),(u1,v0),(u1,1),(u0,1)])
    return g


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',default=os.path.join(L.ROOT,'assets','models'))
    args=parser.parse_args(L.argv_after_dashes());out=Path(args.out).resolve();folder=out/'vegetation';folder.mkdir(parents=True,exist_ok=True)
    high={s:BUILDERS[s](0,random.Random(20261031+SPECIES.index(s)*103)) for s in SPECIES}
    atlas_tiles=[];rects={}
    for s in TREES:
        tile,rect=atlas_tile(high[s]);atlas_tiles.append(tile);rects[s]=rect
    atlas_path=folder/'billboards.png';png_write(atlas_path,np.concatenate(atlas_tiles,axis=1))
    atlas={'path':'vegetation/billboards.png','width':len(TREES)*512,'height':512,'bytes':atlas_path.stat().st_size,'sha256':digest(atlas_path),
           'tiles':{s:[i/len(TREES),0,(i+1)/len(TREES),1] for i,s in enumerate(TREES)},
           'source':'Orthographic raster of generated LOD0 geometry; no third-party image assets.'}
    files=[]
    for si,species in enumerate(SPECIES):
        L.reset();assets={}
        models=[(lod, high[species] if lod==0 else BUILDERS[species](lod,random.Random(20261031+si*103))) for lod in range(3)]
        if species in TREES:models.append(('billboard',billboard(rects[species],TREES.index(species))))
        for lod,g in models:
            name='veg_'+species+('_billboard' if lod=='billboard' else '_lod'+str(lod))
            object_from_geometry(g,name,'flora_billboard' if lod=='billboard' else 'flora_vertex')
            bounds=g.bounds();size=[bounds['max'][k]-bounds['min'][k] for k in range(3)]
            assets[name]={'node':name,'species':species,'lod':lod,'triangles':len(g.f),
                          'bounds':bounds,'size':size,'tags':['vegetation','tree' if species in TREES else 'plant'],
                          'wind':'COLOR_0.a','rigidHeight':RIGID.get(species,0)}
            if lod=='billboard':assets[name]['atlasTile']=atlas['tiles'][species]
            print(f'{name:35s} {len(g.f):4d} triangles; {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f} m',flush=True)
        glb=folder/(species+'.glb');L.export_glb(str(glb))
        files.append({'glb':'vegetation/'+species+'.glb','bytes':glb.stat().st_size,'sha256':digest(glb),'assets':assets})
    total=sum(f['bytes'] for f in files)+atlas['bytes']
    manifest={'version':1,'generator':'tools/blender/veg_build.py','seed':20261031,'species':SPECIES,'trees':TREES,
              'wind':{'attribute':'COLOR_0','channel':'a','encoding':'linear [0,1], 0=rigid; RGB=linear albedo; alpha is not opacity'},
              'atlas':atlas,'totalBytes':total,'totalBytesIncludes':'glbs+atlas','files':files}
    manifest_path=out/'manifest.vegetation.json';manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    if total+manifest_path.stat().st_size>=3_000_000:raise RuntimeError(f'Vegetation library exceeds 3 MB: {total}')
    print(f'Vegetation: {len(SPECIES)} species, {sum(len(f["assets"]) for f in files)} meshes, {total:,} asset bytes',flush=True)


if __name__=='__main__':main()
