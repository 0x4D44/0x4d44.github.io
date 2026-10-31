"""Original adult garment objects. Run Blender --background through tools/nice.mjs.

Reuses furn_lib's coordinate, material and GLB export conventions. Cloth is baked
offline; no simulation, armature, image or external dependency enters a GLB.
See GARMENTS.md for the complete regeneration and review commands.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import furn_lib as F

ROOT = HERE.parent.parent
MODELS = ROOT / 'assets' / 'models'
MATERIAL = 'laundry'
STATES = ('folded', 'hung', 'flat')
BAKE_FRAMES = 22


def inside(x, y, polygon):
    hit = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y):
            if x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                hit = not hit
    return hit


def polygon_grid(outline, nx=10, ny=13):
    """Constrained indexed triangulation. Grid supplies physical fold resolution."""
    pts = [Vector(p) for p in outline]
    lo = [min(p[k] for p in outline) for k in range(2)]
    hi = [max(p[k] for p in outline) for k in range(2)]
    for j in range(1, ny):
        for i in range(1, nx):
            x = lo[0] + (hi[0] - lo[0]) * i / nx
            y = lo[1] + (hi[1] - lo[1]) * j / ny
            if inside(x, y, outline):
                pts.append(Vector((x, y)))
    edges = [(i, (i + 1) % len(outline)) for i in range(len(outline))]
    vv, ee, ff, orig, _, _ = delaunay_2d_cdt(pts, edges, [list(range(len(outline)))], 1, 1e-7, True)
    positions = [(float(p.x), float(p.y)) for p in vv]
    boundary = []
    for i in range(len(outline)):
        boundary.append(next(j for j, ids in enumerate(orig) if i in ids))
    # Explicit containment is a second guard on the CDT constraints. Never let
    # the surrounding hull fill a concave neck, armhole or crotch cutout.
    ff=[tuple(f) for f in ff if inside(sum(positions[i][0] for i in f)/len(f),sum(positions[i][1] for i in f)/len(f),outline)]
    expected=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(outline,outline[1:]+outline[:1])))/2
    actual=0
    for f in ff:
        a,b,c=[positions[i] for i in f]
        actual+=abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2
    if abs(actual-expected)>1e-6: raise ValueError(f'Pattern triangulation area {actual} differs from outline {expected}')
    return positions, ff, boundary


def tshirt():
    return [(-.27,.02),(-.16,.035),(-.125,.11),(-.07,.145),(0,.155),(.07,.145),(.125,.11),(.16,.035),(.27,.02),(.50,.18),(.425,.37),(.30,.30),(.295,.95),(.17,.995),(0,1),(-.17,.995),(-.295,.95),(-.30,.30),(-.425,.37),(-.50,.18)]


def tank(night=False):
    bottom = .50 if night else .47
    return [(-.28,.01),(-.16,.02),(-.13,.11),(0,.16),(.13,.11),(.16,.02),(.28,.01),(.30,.17),(.40,.30),(.35,.40),(bottom,.97),(.24,.995),(0,1),(-.24,.995),(-bottom,.97),(-.35,.40),(-.40,.30),(-.30,.17)]


def bottom_shape(rise=.20, high=False, thong=False, loose=False):
    side = .22 if high else rise
    crotch = .06 if thong else (.18 if loose else .14)
    return [(-.48,.02),(-.22,0),(.22,0),(.48,.02),(.50,side),(.39,side+.10),(.28,.56),(.19,.78),(crotch,1),(-crotch,1),(-.19,.78),(-.28,.56),(-.39,side+.10),(-.50,side)]


def pants(long=False, loose=False, feet=False):
    gap = .42 if long else .46
    inner = .105 if long else (.04 if loose else .065)
    outer = .40 if long else (.50 if loose else .47)
    if feet:
        return [(-.45,0),(0,.012),(.45,0),(.43,.23),(.38,.83),(.48,.90),(.50,.96),(.45,1),(.22,.98),(.12,.90),(.08,gap),(-.08,gap),(-.12,.90),(-.22,.98),(-.45,1),(-.50,.96),(-.48,.90),(-.38,.83),(-.43,.23)]
    return [(-.47,.01),(0,0),(.47,.01),(.49,.20),(outer, .97),(.27,1),(inner,.98),(.06,gap),(0,gap-.04),(-.06,gap),(-inner,.98),(-.27,1),(-outer,.97),(-.49,.20)]


def sock():
    return [(-.35,0),(.08,0),(.10,.61),(.22,.71),(.43,.73),(.50,.78),(.50,.88),(.43,.94),(-.15,.94),(-.34,.86),(-.41,.73),(-.39,.63)]


def shapes(ident,state=None):
    """Each panel is a generic original outline, never a copied sewing pattern."""
    if ident == 'tshirt': return [tshirt()]
    if ident in ('crop_top', 'nightdress'): return [tank(ident == 'nightdress')]
    if ident == 'swimsuit_onepiece':
        return [[(-.31,.01),(-.20,0),(-.17,.15),(-.10,.22),(0,.24),(.10,.22),(.17,.15),(.20,0),(.31,.01),(.34,.20),(.45,.31),(.37,.48),(.42,.66),(.50,.73),(.34,.78),(.18,.90),(.12,1),(-.12,1),(-.18,.90),(-.34,.78),(-.50,.73),(-.42,.66),(-.37,.48),(-.45,.31),(-.34,.20)]]
    if ident in ('shorts', 'swim_trunks', 'boxers', 'leggings', 'tights'):
        return [pants(ident in ('leggings', 'tights'), ident == 'boxers', ident == 'tights')]
    if ident in ('bikini_bottom','underwear','panties','thong','knickers','high_leg_knickers','briefs'):
        rises = {'bikini_bottom':.17,'underwear':.40,'panties':.18,'thong':.10,'knickers':.30,'high_leg_knickers':.16,'briefs':.36}
        return [bottom_shape(rises[ident],ident=='high_leg_knickers',ident=='thong',ident=='underwear')]
    if ident in ('sock_single', 'socks_pair'):
        if ident == 'sock_single': return [sock()]
        # Same adult sock width as the single; the pair overlaps rather than
        # shrinking two socks to child size to fit the wider catalogue box.
        return [[(x*(.25/.31) + shift, y*.96 + dy) for x,y in sock()] for shift,dy in ((-.13,0),(.13,.04))]
    if ident in ('bra','bikini_top'):
        band = [(-.50,.60),(.50,.60),(.48,.72),(-.48,.72)]
        left = [(-.44,.59),(-.40,.37),(-.30,.23),(-.22,.19),(-.12,.31),(-.04,.58),(-.14,.68),(-.31,.68)]
        if ident == 'bikini_top': left = [(-.46,.60),(-.27,.17),(-.07,.60),(-.13,.66),(-.39,.66)]
        right = [(-x,y) for x,y in reversed(left)]
        strap=[(-.34,.40),(-.355,.29),(-.345,.17),(-.315,.045),(-.285,0),(-.25,.012),(-.275,.07),(-.30,.19),(-.305,.30),(-.30,.40)]
        if state=='folded':
            # Loose straps tucked in a soft loop over the cup, not stiff strips
            # projecting from the folded parcel. Original generic arrangement.
            strap=[(-.35,.61),(-.43,.52),(-.45,.40),(-.42,.31),(-.35,.28),(-.28,.31),(-.25,.37),(-.25,.45),(-.29,.45),(-.29,.38),(-.31,.35),(-.35,.33),(-.38,.36),(-.40,.42),(-.39,.50),(-.32,.58)]
        straps=[strap,[(-x,y) for x,y in reversed(strap)]]
        if state=='folded':
            # A bra is nested cup-to-cup, not folded like a rectangular shirt.
            # Put the band below and the relaxed straps above; keep all layers
            # separated in cloth_geometry so no coplanar shards can appear.
            band=[(-.24,.55),(.20,.55),(.24,.59),(.23,.66),(.18,.70),(-.24,.70),(-.28,.66),(-.28,.59)]
            cup=[(-.20,.60),(-.21,.48),(-.18,.36),(-.12,.26),(-.04,.22),(.03,.22),(.11,.29),(.18,.42),(.20,.57),(.17,.64),(.08,.68),(-.06,.68),(-.15,.65)]
            if ident=='bikini_top': cup=[(-.20,.57),(-.18,.48),(-.10,.28),(-.04,.18),(0,.16),(.04,.18),(.10,.29),(.18,.49),(.20,.58),(.16,.64),(-.14,.64)]
            left=cup;right=[(x+.012,y+.012) for x,y in cup]
            straps=[[(x+.24,y) for x,y in strap],[(-x-.24,y+.025) for x,y in reversed(strap)]]
        return [band,left,right,*straps]
    raise ValueError('No original pattern builder: '+ident)


def linear(v):
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4


def create_mesh(name, vertices, faces, uv, colors, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([F.to_blender(v) for v in vertices], [], faces)
    me.update()
    me.polygons.foreach_set('use_smooth', [True]*len(me.polygons))
    layer=me.uv_layers.new(name='UVMap')
    layer.data.foreach_set('uv',[c for poly in me.polygons for i in poly.vertices for c in uv[i]])
    col=me.color_attributes.new('Col','FLOAT_COLOR','POINT')
    me.color_attributes.active_color=col
    col.data.foreach_set('color',[c for a in colors for c in (a,a,a,1)])
    me.materials.append(F.get_mat(MATERIAL))
    ob=bpy.data.objects.new(name,me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent=parent
    return ob


def activate(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob


def to_game(p): return (float(p.x),float(p.z),float(-p.y))


def bake_panel(coords, faces, width, length, state, ident, part):
    """Advance every simulation frame; freeze evaluated vertices before export."""
    scene=bpy.context.scene
    scene.frame_set(1)
    scene.gravity=(0,0,-9.81)
    verts=[]
    for x,v in coords:
        wave=(.005*math.sin(24*x+7*v)+.003*math.sin(31*v-11*x))*math.sin(math.pi*min(1,max(0,v)))
        if ident in ('bra','bikini_top') and part in (1,2): wave += .012*math.sin(math.pi*v)
        if state=='hung': verts.append((x*width,-v*length,wave*2))
        else: verts.append((x*width,.018+wave,(v-.5)*length))
    ff=[]
    for f in faces:
        a,b,c=[Vector(verts[i]) for i in f]
        n=(b-a).cross(c-a)
        good=n.z>0 if state=='hung' else n.y>0
        ff.append(tuple(f) if good else tuple(reversed(f)))
    ob=create_mesh('cloth_bake',verts,ff,[(x+.5,v) for x,v in coords],[1]*len(coords))
    activate(ob)
    pin=ob.vertex_groups.new(name='support')
    ymin=min(p[1] for p in coords)
    if state=='hung':
        for i,(x,v) in enumerate(coords):
            if v <= ymin+.045: pin.add([i],1,'REPLACE')
    else:
        # Two lightly held points stop the empty garment sliding during settling.
        for i,(x,v) in enumerate(coords):
            if v <= ymin+.025: pin.add([i],.6,'REPLACE')
    cloth=ob.modifiers.new('Natural folds (baked)','CLOTH')
    s=cloth.settings
    s.quality=5
    s.mass=.16
    s.tension_stiffness=28
    s.compression_stiffness=28
    s.shear_stiffness=16
    s.bending_stiffness=.30 if ident in ('tshirt','shorts','boxers','nightdress') else .12
    s.air_damping=4
    s.vertex_group_mass='support'
    s.pin_stiffness=1
    cloth.collision_settings.use_self_collision=False
    cloth.collision_settings.distance_min=.002
    floor=None
    if state!='hung':
        bpy.ops.mesh.primitive_plane_add(size=4,location=(0,0,0))
        floor=bpy.context.object
        floor.modifiers.new('settling surface','COLLISION')
        floor.collision.thickness_outer=.002
        floor.collision.thickness_inner=.001
    for frame in range(1,BAKE_FRAMES+1): scene.frame_set(frame)
    dg=bpy.context.evaluated_depsgraph_get()
    ev=ob.evaluated_get(dg)
    baked=ev.to_mesh()
    result=[to_game(v.co) for v in baked.vertices]
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob,do_unlink=True)
    if floor: bpy.data.objects.remove(floor,do_unlink=True)
    scene.frame_set(1)
    if not all(math.isfinite(v) for p in result for v in p): raise ValueError('Cloth bake produced non-finite positions')
    return result,ff


def fold_object(ob,item):
    """Continuous half-turn hinges with topology at both ends and mid-bend."""
    ident=item['id'];width=item['width'];length=item['length']
    if ident in ('bra','bikini_top'): hinges=[('x',0,1)]
    else:
        limit=width*(.25 if ident in ('tshirt','nightdress','shorts','boxers','leggings','tights','socks_pair') else .31)
        hinges=[('x',limit,1),('x',-limit,-1)]
    hinges.append(('z',length*(.10 if ident in ('leggings','tights','nightdress') else .03),1))
    if ident in ('leggings','tights','nightdress'): hinges.append(('z',-length*.22,-1))
    bm=bmesh.new();bm.from_mesh(ob.data)
    radius=.007
    for axis,crease,direction in hinges:
        idx=0 if axis=='x' else 1
        frame_sign=1 if axis=='x' else -1
        for s in (0,math.pi*radius/2,math.pi*radius):
            plane=Vector((0,0,0));normal=Vector((0,0,0))
            plane[idx]=(crease+direction*s)*frame_sign;normal[idx]=frame_sign
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=plane,plane_no=normal,use_snap_center=True,clear_outer=False,clear_inner=False)
        for vertex in bm.verts:
            u=vertex.co[idx]*frame_sign
            s=(u-crease)*direction
            if s<=0: continue
            if s<math.pi*radius:
                folded=radius*math.sin(s/radius)
                drop=radius*(1-math.cos(s/radius))
            else:
                folded=-(s-math.pi*radius)
                drop=2*radius
            vertex.co[idx]=(crease+direction*folded)*frame_sign
            vertex.co.z-=drop
    bm.to_mesh(ob.data);bm.free();ob.data.update()


def open_edge(ident,a,b):
    """Garment openings stay open; only sewn edges bridge front and back."""
    x=(a[0]+b[0])/2;v=(a[1]+b[1])/2
    if ident in ('bra','bikini_top'): return False
    if ident in ('sock_single','socks_pair'): return v<.06
    if ident in ('shorts','swim_trunks','boxers','leggings','tights'):
        return v<.04 or (ident!='tights' and v>.94)
    if ident=='tshirt':
        return (abs(x)<.17 and v<.17) or (abs(x)>.40 and v<.40) or v>.93
    if ident in ('crop_top','nightdress','swimsuit_onepiece'):
        if abs(x)<.20 and v<.26: return True
        if abs(x)>.29 and v<.40: return True
        if ident=='swimsuit_onepiece': return v>.72 and abs(x)>.125
        return v>.94
    # Waist and two leg openings; the short central crotch is sewn as a gusset.
    return v<.04 or (v>.25 and not (v>.95 and abs(x)<.19))


def add_ribbon(vertices,faces,uv,colors,points,shade=.67,width=.002,closed=False,hung=False):
    """Small stitched/elastic band, same material and draw call as the garment."""
    if closed: points=points+[points[0]]
    for (p,pa),(q,qa) in zip(points,points[1:]):
        p,q=Vector(p),Vector(q)
        d=q-p
        if d.length<1e-6: continue
        # Offset in the local surface normal; avoids coplanar seam fighting.
        normal=Vector((0,0,1)) if hung else Vector((0,1,0))
        side=d.cross(normal).normalized()*width*.5
        lift=normal*.0008
        k=len(vertices)
        vertices.extend([tuple(p-side+lift),tuple(q-side+lift),tuple(q+side+lift),tuple(p+side+lift)])
        uv.extend([pa,qa,qa,pa]); colors.extend([linear(shade)]*4)
        faces.extend([(k,k+1,k+2),(k,k+2,k+3)])


def cloth_geometry(item,state):
    ident=item['id']; width=item['width']; length=item['length']
    vertices,faces,uv,colors=[],[],[],[]
    polys=shapes(ident,state)
    for pi,outline in enumerate(polys):
        complexity=7 if len(polys)>1 else 10
        coords,ff,boundary=polygon_grid(outline,complexity,10 if len(polys)>1 else 13)
        vv,ff=bake_panel(coords,ff,width,length,'flat' if state=='folded' else state,ident,pi)
        if state=='folded' and ident in ('bra','bikini_top'):
            arranged=[]
            for p,(x,v) in zip(vv,coords):
                dome=.018*math.exp(-((x/.18)**2+((v-.45)/.20)**2))
                y=.004 if pi==0 else (.014 if pi==1 else .026 if pi==2 else .040)
                if pi: y+=dome
                # Retain a small baked surface irregularity without letting
                # neighbouring layers cross their controlled clearances.
                y+=.0006*math.sin(19*x+13*v)
                arranged.append((p[0],y,p[2]))
            vv=arranged
        if ident=='socks_pair' and pi==1:
            vv=[(x,y+(.007 if state!='hung' else 0),z+(.007 if state=='hung' else 0)) for x,y,z in vv]
        offset=len(vertices)
        vertices.extend(vv); faces.extend([tuple(i+offset for i in f) for f in ff])
        localuv=[(min(1,max(0,x+.5)),min(1,max(0,v))) for x,v in coords]
        uv.extend(localuv)
        colors.extend([linear(.96-.035*math.sin(x*37+v*29)**2) for x,v in coords])
        # An empty sewn garment has two lightly collapsed cloth panels. These
        # are real back surfaces, with open cuffs/neck/waist, not painted lines.
        back=len(vertices)
        soft=ident not in ('bra','bikini_top')
        for i,(x,v) in enumerate(coords):
            p=list(vv[i])
            depth=.003+(.010 if soft else .004)*math.sin(math.pi*max(0,min(1,v)))**2*max(0,1-abs(x)*1.7)
            normal_axis=2 if state=='hung' else 1
            p[normal_axis]-=depth
            if ident=='thong' and v>.10:
                # Rear coverage is a narrow central strap; the waist and the
                # gusset still meet their matching sewn front edges.
                factor=1-(1-.16)*min(1,(v-.10)/.18)
                if v>.82: factor=.16+.84*(v-.82)/.18
                p[0]*=factor
            # Back neck lies above the front neck: the recessed opening and
            # inside collar are visible in a flat lay and on a hanger.
            if ident in ('tshirt','crop_top','nightdress') and abs(x)<.17 and v<.25:
                lift=.075*length*(1-abs(x)/.17)*(1-v/.25)
                if state=='hung': p[1]+=lift
                else: p[2]-=lift
            vertices.append(tuple(p));uv.append(localuv[i]);colors.append(linear(.86))
        faces.extend([tuple(back+i for i in reversed(f)) for f in ff])
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            if open_edge(ident,coords[a],coords[b]): continue
            faces.extend([(offset+a,offset+b,back+b),(offset+a,back+b,back+a)])
        edge=[(vv[i],localuv[i]) for i in boundary]
        add_ribbon(vertices,faces,uv,colors,edge,.72,.0022,True,state=='hung')
        # Parallel waist/cuff/hem stitching uses a row of actual baked vertices.
        targets=[]
        if ident in ('leggings','shorts','boxers','swim_trunks','tights','underwear','panties','thong','knickers','high_leg_knickers','briefs','bikini_bottom'): targets=[.07]
        if ident in ('sock_single','socks_pair'): targets=[.13]
        if ident in ('tshirt','crop_top','nightdress'): targets=[.90]
        if pi==0:
            for yy in targets:
                row=[i for i,p in enumerate(coords) if abs(p[1]-yy)<.048]
                row=sorted(row,key=lambda i:coords[i][0])
                if len(row)>1:
                    add_ribbon(vertices,faces,uv,colors,[(vv[i],localuv[i]) for i in row],.80,.0016,hung=state=='hung')
        # Shorts pockets, briefs' fly and a sleepwear placket, encoded as seams.
        paths=[]
        if ident=='shorts': paths=[[(-.38,.13),(-.27,.29)],[(.38,.13),(.27,.29)],[(0,.08),(0,.39)]]
        if ident=='boxers': paths=[[(0,.08),(0,.39)]]
        if ident=='briefs': paths=[[(.06,.08),(.14,.32),(.09,.62)]]
        if ident=='nightdress': paths=[[(0,.18),(0,.30)]]
        for path in paths:
            ids=[min(range(len(coords)),key=lambda i:(coords[i][0]-x)**2+(coords[i][1]-y)**2) for x,y in path]
            add_ribbon(vertices,faces,uv,colors,[(vv[i],localuv[i]) for i in ids],.70,.002,hung=state=='hung')
    return vertices,faces,uv,colors


def hat_geometry(item,state):
    ident=item['id']; n=24
    v,f,uv,c=[],[],[],[]
    # Full-size adult head opening; soft bucket, indented straw crown, six-panel cap.
    if ident=='cap': profile=[(.001,.135),(.047,.125),(.078,.099),(.097,.060),(.102,.008)]
    elif ident=='straw_hat': profile=[(.001,.132),(.058,.145),(.090,.140),(.098,.105),(.102,.025),(.145,.016),(.205,0)]
    else: profile=[(.001,.136),(.066,.136),(.095,.111),(.106,.037),(.137,.005),(.177,-.035)]
    for j,(r,y) in enumerate(profile):
        for i in range(n):
            a=math.tau*i/n
            x=r*math.cos(a); z=r*math.sin(a)*1.11
            yy=y
            if ident=='straw_hat' and j<3: yy-=.025*max(0,1-abs(x)/.06)*max(0,1-abs(z)/.10)
            if ident=='sun_hat' and j>=4: yy+=.009*math.sin(a*3+.3)
            if state=='folded': x*=.74; yy*=.26; z*=.84; yy+=.018*math.sin(a*2)*(r/.18)
            v.append((x,yy,z)); uv.append((.5+x/.44,.5+z/.47)); c.append(linear(.94-.08*(j%2)))
            if j:
                a0=(j-1)*n+i; b0=(j-1)*n+(i+1)%n; a1=j*n+i;b1=j*n+(i+1)%n
                f.extend([(a0,b0,b1),(a0,b1,a1)])
    if ident=='cap':
        # The visor extends from the front half of the crown, not a circular brim.
        start=len(v); segments=12
        for ring in range(3):
            for i in range(segments+1):
                a=math.pi*i/segments
                x=(.102+.008*ring)*math.cos(a)
                z=.102*1.11*math.sin(a)+.045*ring*(.45+.55*math.sin(a))
                yy=.008-.012*ring-.004*ring*math.cos(a)**2
                v.append((x,yy,z));uv.append((.5+x/.45,.5+z/.50));c.append(linear(.88))
                if ring and i:
                    p=start+(ring-1)*(segments+1)+i-1;q=p+segments+1
                    f.extend([(p,q,p+1),(p+1,q,q+1)])
        for i in range(0,n,4):
            points=[(v[j*n+i],uv[j*n+i]) for j in range(len(profile))]
            add_ribbon(v,f,uv,c,points,.66,.0015)
    else:
        ring=3*n
        add_ribbon(v,f,uv,c,[(v[ring+i],uv[ring+i]) for i in range(n)],.66,.004,True)
    if state=='hung':
        v=[(x,-z,y) for x,y,z in v]
    return v,f,uv,c


def triangulate(ob):
    activate(ob)
    mod=ob.modifiers.new('Triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=mod.name)


def tris(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def simplify(ob,limit):
    count=tris(ob)
    if count>limit:
        activate(ob)
        mod=ob.modifiers.new('Budgeted silhouette LOD','DECIMATE')
        mod.ratio=max(.05,(limit-8)/count)
        mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        triangulate(ob)
    # Exporters omit loose vertices; remove them before computing the envelope.
    bm=bmesh.new();bm.from_mesh(ob.data)
    for face in list(bm.faces):
        if face.calc_area()<1e-12: bm.faces.remove(face)
    for vertex in list(bm.verts):
        if not vertex.link_faces: bm.verts.remove(vertex)
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    if tris(ob)>limit: raise ValueError(f'{ob.name}: cannot fit {limit} triangles')


def envelope(ob):
    vv=[to_game(v.co) for v in ob.data.vertices]
    lo=[min(v[k] for v in vv) for k in range(3)]
    hi=[max(v[k] for v in vv) for k in range(3)]
    return {'min':[round(x,7) for x in lo],'max':[round(x,7) for x in hi]}


def metadata(ob,origin):
    box=envelope(ob)
    size=[round(b-a,7) for a,b in zip(box['min'],box['max'])]
    return {'size':size,'footprint':[size[0],size[2]],'origin':origin,'bounds':box,'triangles':tris(ob),'materials':[MATERIAL]}


def normalized_geometry(vertices,state):
    lo=[min(v[k] for v in vertices) for k in range(3)]
    hi=[max(v[k] for v in vertices) for k in range(3)]
    shift=[(lo[0]+hi[0])/2,hi[1] if state=='hung' else lo[1],(lo[2]+hi[2])/2]
    return [tuple(p[k]-shift[k] for k in range(3)) for p in vertices]


def normalize_object(ob,state):
    for vertex,p in zip(ob.data.vertices,normalized_geometry([to_game(v.co) for v in ob.data.vertices],state)):
        vertex.co=F.to_blender(p)
    # Collapse decimation can extrapolate a boundary UV slightly beyond its tile.
    for layer in ob.data.uv_layers:
        for corner in layer.data:
            corner.uv=(min(1,max(0,corner.uv.x)),min(1,max(0,corner.uv.y)))
    ob.data.update()


def png(path,palette):
    """Original 16-tile 256-square atlas; standard-library deterministic PNG."""
    size=256; tile=64
    pixels=bytearray(size*size*4)
    def rgb(s): return tuple(int(s.lstrip('#')[i:i+2],16) for i in (0,2,4))
    for variant in palette['variants'].values():
        tx,ty=variant['tile']; base=rgb(variant['color'])
        accent=rgb(variant.get('accent','#eee7d5'))
        leaf=rgb(variant.get('leaf','#6b876d'))
        pattern=variant['pattern']
        for yy in range(tile):
            for xx in range(tile):
                color=base
                if pattern=='stripe' and (xx//7)%2==0: color=accent
                if pattern=='football' and (xx//16)%2==0: color=accent
                if pattern=='weave':
                    s=(2 if xx%3 else -3)+(1 if yy%3 else -2)
                    color=tuple(min(255,max(0,a+s)) for a in base)
                if pattern=='floral':
                    for cx,cy in ((10,12),(30,20),(49,10),(15,43),(37,50),(56,36)):
                        dx,dy=xx-cx,yy-cy
                        angle=math.atan2(dy,dx); rr=math.hypot(dx,dy)
                        if rr<2.6+1.2*math.cos(angle*5): color=accent
                        if rr<.8: color=(215,173,88)
                        if ((dx-5)/2.5)**2+((dy-4)/1.5)**2<1: color=leaf
                # Fine crossed yarn shading is original, not a downloaded PBR map.
                noise=((xx*17+yy*23+xx*yy*3)%11)-5
                color=tuple(max(0,min(255,int(a+noise*.28))) for a in color)
                idx=((ty*tile+yy)*size+tx*tile+xx)*4
                pixels[idx:idx+4]=bytes((*color,255))
    raw=b''.join(b'\x00'+pixels[y*size*4:(y+1)*size*4] for y in range(size))
    def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=MODELS)
    parser.add_argument('--catalogue',type=Path,default=HERE/'garments.catalog.json')
    parser.add_argument('--only',help='comma-separated garment IDs; requires isolated --out')
    args=parser.parse_args(F.argv_after_dashes() if '--' in sys.argv else [])
    out=args.out.resolve()
    if args.only and out==MODELS.resolve(): raise ValueError('Partial builds must use an isolated --out')
    catalogue=json.loads(args.catalogue.read_text())
    chosen=set(args.only.split(',')) if args.only else None
    items=[a for a in catalogue['garments'] if not chosen or a['id'] in chosen]
    if chosen and chosen!={a['id'] for a in items}: raise ValueError('Unknown requested garment')
    if len({a['id'] for a in items})!=len(items): raise ValueError('Duplicate catalogue ids')
    source=MODELS/'garments'
    palette=json.loads((source/'palette.json').read_text())
    manifest={'schemaVersion':1,'set':'garments','adultOnly':True,'scope':'objects-only','baseCommit':'8fa06a5498555afc5dc2b636c06754a4a6b5882c',
        'catalogue':'../../tools/blender/garments.catalog.json','files':[],
        'atlas':{'file':'garments/prints.png','width':256,'height':256,'embedded':False},
        'palette':'garments/palette.json','assortments':'garments/assortments.json',
        'limits':{'triangles':800,'lodTriangles':240,'runtimeBytes':2000000},
        'clothBake':{'blender':bpy.app.version_string,'frames':BAKE_FRAMES,'sequential':True,'quality':5,'staticOnly':True},
        'lodPolicy':{'switchDistanceMetres':8,'cullDistanceMetres':30,'tinyItemsCullDistanceMetres':16,'maxConcurrentDetailItems':24,'note':'Placement data only; production runtime is unchanged.'}}
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.garments-stage-',dir=out.parent) as tmp:
        stage=Path(tmp); dest=stage/'garments'; dest.mkdir()
        for name in ('palette.json','assortments.json'): shutil.copy2(source/name,dest/name)
        png(dest/'prints.png',palette)
        for state in STATES:
            if not any(state in item['states'] for item in items): continue
            F.reset()
            assets={}; lows=[]
            for item in items:
                if state not in item['states']: continue
                key=f"garment_{item['id']}_{state}"
                vertices,faces,uv,colors=(hat_geometry(item,state) if item['id'] in ('sun_hat','straw_hat','cap') else cloth_geometry(item,state))
                vertices=normalized_geometry(vertices,state)
                root=bpy.data.objects.new(key,None);bpy.context.scene.collection.objects.link(root)
                root['adultOnly']=True;root['garment']=item['id'];root['state']=state
                ob=create_mesh(key+'-tint-0',vertices,faces,uv,colors,root)
                if state=='folded' and item['id'] not in ('sun_hat','bra','bikini_top'): fold_object(ob,item)
                triangulate(ob);simplify(ob,780);normalize_object(ob,state)
                origin='hang-point' if state=='hung' else 'floor-centre'
                data={'node':key,'garment':item['id'],'state':state,'adultOnly':True,**metadata(ob,origin),'variants':item['variants'],'drawCalls':1}
                low=ob.copy();low.data=ob.data.copy();low.parent=None
                bpy.context.scene.collection.objects.link(low)
                low.name=key+'_lod-tint-0'
                simplify(low,min(220,max(40,int(data['triangles']*.34))))
                normalize_object(low,state)
                lowroot=bpy.data.objects.new(key+'_lod',None);bpy.context.scene.collection.objects.link(lowroot)
                low.parent=lowroot
                data['lod']={'glb':f'garments/garments_{state}_lod.glb','node':key+'_lod',**metadata(low,origin)}
                lows.append((lowroot,low))
                assets[key]=data
                print(f"{key}: {data['triangles']} tris / LOD {data['lod']['triangles']}",flush=True)
            # Separate files prevent a consumer accidentally drawing both levels.
            for lowroot,low in lows:
                bpy.context.scene.collection.objects.unlink(lowroot);bpy.context.scene.collection.objects.unlink(low)
            glb=f'garments/garments_{state}.glb'
            F.export_glb(str(stage/glb))
            for ob in list(bpy.context.scene.objects): bpy.data.objects.remove(ob,do_unlink=True)
            for lowroot,low in lows:
                bpy.context.scene.collection.objects.link(lowroot);bpy.context.scene.collection.objects.link(low)
            F.export_glb(str(dest/f'garments_{state}_lod.glb'))
            manifest['files'].append({'glb':glb,'sha256':hashlib.sha256((stage/glb).read_bytes()).hexdigest(),'assets':assets})
        (stage/'manifest.garments.json').write_text(json.dumps(manifest,indent=2)+'\n')
        total=sum(p.stat().st_size for p in dest.iterdir())+(stage/'manifest.garments.json').stat().st_size
        if total>2000000: raise ValueError(f'Runtime payload {total} exceeds 2,000,000 bytes')
        node=shutil.which('node')
        if not node: raise ValueError('Node is required for independent validation before installation')
        validation=stage/'validation.json'
        command=[node,str(ROOT/'tools'/'nice.mjs'),node,str(HERE/'garments_validate.mjs'),'--root',str(stage),'--catalogue',str(args.catalogue.resolve()),'--json',str(validation)]
        if not chosen: command.append('--complete')
        checked=subprocess.run(command,capture_output=True,text=True,timeout=180,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        print(checked.stdout,flush=True)
        if checked.returncode: raise ValueError('Independent validation failed: '+checked.stderr)
        if not validation.is_file(): raise ValueError('Validator produced no JSON report; child process may have been blocked')
        verified=json.loads(validation.read_text())
        expected=sum(len(item['states']) for item in items)
        if verified.get('ok') is not True or verified.get('assets')!=expected:
            raise ValueError('Validator did not confirm every requested exported state')
        out.mkdir(parents=True,exist_ok=True)
        target=out/'garments'; backup=stage/'previous-garments'
        had_previous=target.exists()
        if had_previous: os.replace(target,backup)
        try:
            os.replace(dest,target)
            os.replace(stage/'manifest.garments.json',out/'manifest.garments.json')
        except BaseException:
            if target.exists(): shutil.rmtree(target)
            if had_previous: os.replace(backup,target)
            raise
        mode='' if chosen else ' --complete'
        print(f'EXPORTED {sum(len(f["assets"]) for f in manifest["files"])} garment states; {total} runtime bytes. Run garments_validate.mjs{mode}.',flush=True)


if __name__=='__main__': main()
