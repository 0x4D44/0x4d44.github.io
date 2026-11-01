"""Teen object library: original patterns through the adult Blender cloth/export pipeline.

Run this script directly in headless Blender. Sizes share meshes behind identity named roots;
all simulation is baked, and the final core-glTF packing needs no decoder.
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

import bpy
from mathutils import Vector
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import garments_build as G
import furn_lib as F
from garments_teen_textures import build_textures

ROOT=HERE.parent.parent
MODELS=ROOT/'assets'/'models'
DIRECTORY='garments-teen'
MANIFEST='manifest.garments-teen.json'
SIZES={'small':{'scale':.7,'ages':[12,15]},'big':{'scale':.9,'ages':[16,19]}}


def long_sleeve(vneck=False):
    neck=[(-.12,.035),(-.08,.085),(0,.19 if vneck else .115),(.08,.085),(.12,.035)]
    right=[(.23,.045),(.34,.18),(.50,.79),(.405,.85),(.29,.39),(.29,.96),(.16,.995),(0,1)]
    return neck+right+[(-x,y) for x,y in reversed(right[:-1])]


def dress(length):
    # The short dress has sleeves. The other lengths have broad, ordinary straps.
    if length=='short':
        return [(-.23,.02),(-.14,.04),(-.10,.10),(0,.13),(.10,.10),(.14,.04),(.23,.02),(.37,.10),(.42,.24),(.30,.29),(.27,.43),(.50,.98),(0,1),(-.50,.98),(-.27,.43),(-.30,.29),(-.42,.24),(-.37,.10)]
    return [(-.24,.01),(-.13,.015),(-.10,.10),(0,.14),(.10,.10),(.13,.015),(.24,.01),(.25,.13),(.31,.22),(.27,.39),(.50,.98),(0,1),(-.50,.98),(-.27,.39),(-.31,.22),(-.25,.13)]


def outlines(shape):
    if shape in ('tshirt','boxy','polo'):return [G.tshirt()]
    if shape=='crop_top':return [G.tank()]
    if shape in ('hoodie','jumper','jacket'):return [long_sleeve(shape=='jumper')]
    if shape.startswith('dress_'):return [dress(shape.split('_')[1])]
    if shape=='skirt':return [[(-.33,0),(.33,0),(.36,.08),(.50,.98),(.26,1),(0,.98),(-.26,1),(-.50,.98),(-.36,.08)]]
    if shape in ('jeans','school_trousers','joggers'):
        p=G.pants(True)
        return [[(x*(1.0 if y<.3 else 1.12),y) for x,y in p]]
    if shape=='cycle':return [G.pants(True)]
    if shape=='denim_shorts':return [G.pants(False)]
    return G.shapes(shape)


def edge_open(shape,a,b):
    x=(a[0]+b[0])/2; y=(a[1]+b[1])/2
    if shape in ('tshirt','boxy','polo'):return G.open_edge('tshirt',a,b)
    if shape in ('hoodie','jumper','jacket'):
        return (abs(x)<.13 and y<.22) or (abs(x)>.39 and y>.70) or (abs(x)<.30 and y>.94)
    if shape.startswith('dress_'):
        return (abs(x)<.14 and y<.17) or (.24<abs(x)<.43 and .08<y<.30) or y>.96
    if shape=='skirt':return y<.04 or y>.96
    if shape in ('jeans','school_trousers','joggers','cycle','denim_shorts'):
        return y<.04 or y>.94
    return G.open_edge(shape,a,b)


def cloth_geometry(item,state):
    shape=item['shape']; w=item['width']; h=item['length']; hung=state=='hung'
    vertices=[];faces=[];uv=[];colors=[]
    # Fewer interior samples than the adult catalogue, with silhouette, openings
    # and sewn back surfaces retained. This keeps both size variants comfortably within the 3.5 MB budget.
    for pi,outline in enumerate(outlines(shape)):
        coords,ff,boundary=G.polygon_grid(outline,4,6)
        vv,ff=G.bake_panel(coords,ff,w,h,'hung' if hung else 'flat',shape,pi)
        if shape=='socks_pair' and pi==1:
            vv=[(x,y+(0 if hung else .006),z+(.006 if hung else 0)) for x,y,z in vv]
        localuv=[(min(1,max(0,x+.5)),min(1,max(0,v))) for x,v in coords]
        offset=len(vertices)
        vertices.extend(vv);faces.extend([tuple(offset+i for i in f) for f in ff]);uv.extend(localuv)
        colors.extend([G.linear(.96-.035*math.sin(27*x+21*v)**2) for x,v in coords])
        back=len(vertices)
        for i,(x,v) in enumerate(coords):
            p=list(vv[i]);axis=2 if hung else 1
            p[axis]-=.003+.008*math.sin(math.pi*max(0,min(1,v)))**2*max(0,1-abs(x)*1.6)
            if shape in ('tshirt','boxy','polo','crop_top','hoodie','jumper','jacket') or shape.startswith('dress_'):
                if abs(x)<.13 and v<.22:
                    lift=.04*h*(1-abs(x)/.13)*(1-v/.22)
                    p[1 if hung else 2]+=lift if hung else -lift
            vertices.append(tuple(p));uv.append(localuv[i]);colors.append(G.linear(.86))
        faces.extend([tuple(back+i for i in reversed(f)) for f in ff])
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            if not edge_open(shape,coords[a],coords[b]):
                faces.extend([(offset+a,offset+b,back+b),(offset+a,back+b,back+a)])
        def surface(x,y,lift=.0018):
            # Interpolate on the actual baked triangle, so stitching is attached
            # to the cloth instead of floating above an assumed flat plane.
            for f in ff:
                aa,bb,cc=[coords[i] for i in f]
                den=(bb[1]-cc[1])*(aa[0]-cc[0])+(cc[0]-bb[0])*(aa[1]-cc[1])
                if abs(den)<1e-12:continue
                a=((bb[1]-cc[1])*(x-cc[0])+(cc[0]-bb[0])*(y-cc[1]))/den
                b=((cc[1]-aa[1])*(x-cc[0])+(aa[0]-cc[0])*(y-cc[1]))/den;c=1-a-b
                if min(a,b,c)>=-1e-6:
                    p=[sum(vv[k][axis]*n for k,n in zip(f,(a,b,c))) for axis in range(3)]
                    p[2 if hung else 1]+=lift
                    return tuple(p),(min(1,max(0,x+.5)),min(1,max(0,y)))
            i=min(range(len(coords)),key=lambda i:(coords[i][0]-x)**2+(coords[i][1]-y)**2)
            p=list(vv[i]);p[2 if hung else 1]+=lift
            return tuple(p),localuv[i]
        def seam(points,shade=.68,width=.003):
            G.add_ribbon(vertices,faces,uv,colors,[surface(x,y) for x,y in points],shade,width,hung=hung)
        def patch(points,shade=.86,lift=.0025):
            start=len(vertices)
            for x,y in points:
                p,t=surface(x,y,lift);vertices.append(p);uv.append(t);colors.append(G.linear(shade))
            for i in range(1,len(points)-1):
                face=(start,start+i,start+i+1)
                a,b,c=[Vector(vertices[k]) for k in face]
                normal=(b-a).cross(c-a)
                if normal[2 if hung else 1]<0:face=tuple(reversed(face))
                faces.append(face)
        # These details share the garment's single mesh/material. The LOD may
        # omit tiny stitches, but retains necks, sleeves, crotches and hems.
        if shape in ('shorts','denim_shorts','jeans','school_trousers','joggers','boxers','swim_trunks','cycle','leggings','briefs','skirt'):
            seam([(-.41,.065),(0,.055),(.41,.065)],.72,.007)
        if shape in ('jeans','denim_shorts','shorts','school_trousers'):
            seam([(-.39,.12),(-.26,.27)]);seam([(.39,.12),(.26,.27)]);seam([(0,.08),(.025,.32)],.66,.002)
        if shape in ('jeans','denim_shorts'):
            # Rear pockets are small separate panels on the rear cloth face.
            for sign in (-1,1):
                start=len(vertices)
                for x,y in [(sign*.14,.15),(sign*.34,.15),(sign*.32,.30),(sign*.23,.34),(sign*.14,.29)]:
                    p,t=surface(x,y,-.014);vertices.append(p);uv.append(t);colors.append(G.linear(.73))
                for i in range(1,4):faces.append((start,start+i+1,start+i))
        if shape in ('tshirt','boxy','crop_top'):
            seam([(-.12,.105),(0,.16),(.12,.105)],.75,.004)
        if shape=='polo':
            patch([(-.15,.065),(-.025,.13),(-.075,.23),(-.19,.12)],.83)
            patch([(.15,.065),(.025,.13),(.075,.23),(.19,.12)],.83)
            seam([(0,.16),(0,.33)],.63,.004)
        if shape in ('jumper','jacket'):
            seam([(-.12,.05),(0,.19),(.12,.05)],.62,.008)
        if shape in ('hoodie','jumper','jacket'):
            seam([(-.28,.94),(0,.98),(.28,.94)],.72,.012)
            seam([(-.49,.78),(-.41,.84)],.66,.012);seam([(.49,.78),(.41,.84)],.66,.012)
        if shape=='hoodie':
            patch([(-.20,.60),(-.14,.52),(.14,.52),(.20,.60),(.19,.79),(-.19,.79)],.84,.003)
            seam([(-.20,.60),(-.14,.52)],.62);seam([(.20,.60),(.14,.52)],.62)
            # Empty, collapsed hood: low-poly oval shell with an open front rim,
            # behind the neckline. No head/body is modeled inside it.
            start=len(vertices);n=10
            for ring in (0,1):
                for i in range(n):
                    angle=math.tau*i/n
                    x=.145*math.cos(angle)*(1 if ring==0 else .82)
                    y=.065+.175*math.sin(angle)*(1 if ring==0 else .87)
                    if hung:p=(x*w,-y*h,(-.012 if ring==0 else -.055))
                    else:p=(x*w,(-.014 if ring==0 else -.055),(y-.5)*h)
                    vertices.append(p);uv.append((x+.5,max(0,min(1,y))));colors.append(G.linear(.91 if ring==0 else .70))
            for i in range(n):
                j=(i+1)%n;faces.extend([(start+i,start+j,start+n+j),(start+i,start+n+j,start+n+i)])
            faces.extend([(start+n,start+n+i,start+n+i+1) for i in range(1,n-1)])
        if shape=='jacket':
            seam([(0,.20),(0,.93)],.48,.004)
            seam([(-.23,.58),(-.13,.68)],.62);seam([(.23,.58),(.13,.68)],.62)
        if shape in ('skirt','dress_knee','dress_midi','dress_maxi'):
            for x in (-.23,0,.23):seam([(x*.7,.43),(x,.93)],.83,.002)
        if shape=='socks_pair':seam([(-.23,.12),(.02,.12)],.65,.006)
    return vertices,faces,uv,colors


def footwear(item):
    """Two empty closed shoes or strapped sandals, each with a separate sole."""
    v=[];f=[];uv=[];c=[];sandal=item['shape']=='sandals';n=12
    def vertex(p,shade):
        v.append(p);uv.append((min(1,max(0,p[0]/item['width']+.5)),min(1,max(0,p[2]/item['length']+.5))));c.append(G.linear(shade));return len(v)-1
    for centre in (-.068,.068):
        # Ring footprint: round toe, narrower heel and a slightly pinched waist.
        rings=[]
        for y,radius in ((0,.98),(.018,1),(.030,.98)):
            ring=[]
            for i in range(n):
                a=math.tau*i/n;z=.145*math.cos(a);width=.053*(.88+.12*math.cos(a))
                ring.append(vertex((centre+width*math.sin(a)*radius,y,z*radius),.63 if y<.02 else .86))
            rings.append(ring)
        for a,b in zip(rings,rings[1:]):
            for i in range(n):j=(i+1)%n;f.extend([(a[i],a[j],b[j]),(a[i],b[j],b[i])])
        for ring,reverse in ((rings[0],True),(rings[-1],False)):
            for i in range(1,n-1):
                face=(ring[0],ring[i],ring[i+1]);f.append(tuple(reversed(face)) if reverse else face)
        if sandal:
            for z in (.065,-.045):
                segments=5;start=len(v)
                for zz in (z-.016,z+.016):
                    for i in range(segments+1):
                        angle=math.pi*i/segments
                        vertex((centre+.052*math.cos(angle),.033+.033*math.sin(angle),zz),.94)
                for i in range(segments):
                    a=start+i;b=a+segments+1;f.extend([(a,b,b+1),(a,b+1,a+1)])
            # Rear strap joins the sides around the heel, no floating buckle.
            start=len(v)
            for y in (.045,.060):
                for i in range(7):
                    a=math.pi*i/6
                    vertex((centre+.045*math.cos(a),y,-.075-.060*math.sin(a)),.88)
            for i in range(6):a=start+i;b=a+7;f.extend([(a,b,b+1),(a,b+1,a+1)])
        else:
            # Upper rises from sole to an open collar around the heel/instep.
            upper=[]
            for i in range(n):
                a=math.tau*i/n
                upper.append(vertex((centre+.031*math.sin(a),.065+.014*max(0,-math.cos(a)),-.064+.054*math.cos(a)),.93))
            for i in range(n):j=(i+1)%n;f.extend([(rings[-1][i],rings[-1][j],upper[j]),(rings[-1][i],upper[j],upper[i])])
            inner=[]
            for i in range(n):
                p=v[upper[i]];inner.append(vertex((centre+(p[0]-centre)*.87,p[1]-.014,-.064+(p[2]+.064)*.87),.37))
            for i in range(n):j=(i+1)%n;f.extend([(upper[i],upper[j],inner[j]),(upper[i],inner[j],inner[i])])
            for z in (-.006,.014,.034):
                start=len(v)
                for x,zz in ((-.024,z-.002),(.024,z-.002),(.024,z+.002),(-.024,z+.002)):
                    vertex((centre+x,.065-.11*max(0,zz),zz),.57)
                f.extend([(start,start+1,start+2),(start,start+2,start+3)])
    return v,f,uv,c


def folded_trousers(item,low=False):
    """Hand-arranged leg-over-leg parcel with a closed rounded outer envelope.

    A crease/decimation pass through several nearly coincident sewn layers can
    produce crossing flaps. As with the adult library's arranged folded pieces,
    author this settled pose directly and build its LOD from the same profile.
    """
    w=item['width']*.49;length=item['length']*.32+.018;height=.044
    if low:
        outline=[(-.44,-.5),(.44,-.5),(.5,-.44),(.5,.44),(.44,.5),(-.44,.5),(-.5,.44),(-.5,-.44)]
        profiles=[(.94,.95,0),(1,1,.016),(.95,.96,height)]
    else:
        outline=[(-.44,-.5),(0,-.5),(.44,-.5),(.5,-.44),(.5,0),(.5,.44),(.44,.5),(0,.5),(-.44,.5),(-.5,.44),(-.5,0),(-.5,-.44)]
        profiles=[(.94,.95,0),(1,1,.006),(1,1,.034),(.95,.96,height)]
    v=[];f=[];uv=[];c=[];n=len(outline)
    for ri,(sx,sz,y) in enumerate(profiles):
        for x,z in outline:
            ripple=0 if ri==0 else .0009*math.sin(x*8+z*7)
            v.append((x*w*sx,y+ripple,z*length*sz));uv.append((x+.5,z+.5));c.append(G.linear(.94 if ri==len(profiles)-1 else .84 if ri%2 else .76))
        if ri:
            for i in range(n):
                j=(i+1)%n;a=(ri-1)*n+i;b=(ri-1)*n+j;d=ri*n+i;e=ri*n+j
                f.extend([(a,e,b),(a,d,e)])
    bottom=len(v);v.append((0,0,0));uv.append((.5,.5));c.append(G.linear(.72))
    top=len(v);v.append((0,height-.001,0));uv.append((.5,.5));c.append(G.linear(.93))
    for i in range(n):
        j=(i+1)%n;f.append((bottom,i,j));f.append((top,(len(profiles)-1)*n+j,(len(profiles)-1)*n+i))
    if not low:
        # Two restrained fold lines along the front edge show the stacked fabric
        # layers without separate intersecting cloth shells or detached shards.
        for y in (.014,.026):
            start=len(v)
            for x,yy in ((-.42,y-.001),(.42,y-.001),(.42,y+.001),(-.42,y+.001)):
                v.append((x*w,yy,length*.5008));uv.append((x+.5,1));c.append(G.linear(.62))
            f.extend([(start,start+1,start+2),(start,start+2,start+3)])
        # A narrow cuff stitch on the top fold, still one material/primitive.
        start=len(v)
        for x,z in ((-.40,.35),(.40,.35),(.40,.36),(-.40,.36)):
            v.append((x*w,height+.0012,z*length));uv.append((x+.5,z+.5));c.append(G.linear(.76))
        f.extend([(start,start+2,start+1),(start,start+3,start+2)])
    return v,f,uv,c


def folded_lod(item,high):
    """Closed exterior for distant folded clothes, never collapsed crossing
    layers. Keep the top's collar/crotch outline and sample the real high mesh's
    topmost UVs so the shirt print remains in the same part of the parcel.
    """
    shape=item['shape'];box=G.envelope(high)
    w,h,length=[box['max'][i]-box['min'][i] for i in range(3)]
    outline=[(-.44,-.5),(.44,-.5),(.5,-.44),(.5,.44),(.44,.5),(-.44,.5),(-.5,.44),(-.5,-.44)]
    if shape in ('tshirt','boxy','polo','crop_top','jumper','jacket','swimsuit_onepiece'):
        notch=.20 if shape=='swimsuit_onepiece' else .12
        outline=[(-.44,-.5),(-.23,-.5),(-.13,-.5+notch),(0,-.48+notch),(.13,-.5+notch),(.23,-.5),(.44,-.5),(.5,-.44),(.5,.44),(.44,.5),(-.44,.5),(-.5,.44),(-.5,-.44)]
    elif shape=='hoodie':
        outline=[(-.44,-.36),(-.20,-.36),(-.15,-.48),(0,-.5),(.15,-.48),(.20,-.36),(.44,-.36),(.5,-.30),(.5,.44),(.44,.5),(-.44,.5),(-.5,.44),(-.5,-.30)]
    elif shape in ('shorts','denim_shorts','cycle','boxers','swim_trunks'):
        outline=[(-.44,-.5),(.44,-.5),(.5,-.44),(.5,.44),(.44,.5),(.12,.5),(.08,.35),(-.08,.35),(-.12,.5),(-.44,.5),(-.5,.44),(-.5,-.44)]
    coords,ff,boundary=G.polygon_grid(outline,2,2)
    high.data.calc_loop_triangles();layer=high.data.uv_layers.active.data
    samples=[];positions=[G.to_game(v.co) for v in high.data.vertices]
    for tri in high.data.loop_triangles:
        samples.append(([positions[i] for i in tri.vertices],[tuple(layer[i].uv) for i in tri.loops]))
    def top_uv(x,z):
        if shape=='tshirt':
            # The visible shirt front is one continuous chart. A collar point
            # outside the high silhouette must not borrow an underside UV and
            # interpolate a second piece of the sun print across the neck.
            return (max(0,min(1,.5+x/item['width'])),max(0,min(1,.02+(z+length*.5)/item['length'])))
        best=None
        for points,tex in samples:
            a,b,c=points;den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
            if abs(den)<1e-10:continue
            aa=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den
            bb=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;cc=1-aa-bb
            if min(aa,bb,cc)>=-1e-6:
                y=sum(p[1]*b for p,b in zip(points,(aa,bb,cc)))
                if best is None or y>best[0]:best=(y,tuple(sum(t[i]*b for t,b in zip(tex,(aa,bb,cc))) for i in range(2)))
        if best:return tuple(max(0,min(1,v)) for v in best[1])
        nearest=min(range(len(positions)),key=lambda i:(positions[i][0]-x)**2+(positions[i][2]-z)**2)
        for loop in high.data.loops:
            if loop.vertex_index==nearest:return tuple(layer[loop.index].uv)
        return (.5,.5)
    v=[];f=[];uv=[];c=[];count=len(coords)
    for top in (False,True):
        for x,z in coords:
            xx=x*w*.96;zz=z*length*.96
            v.append((xx,h if top else 0,zz));uv.append(top_uv(xx,zz));c.append(G.linear(.93 if top else .78))
        for face in ff:
            ids=tuple(i+(count if top else 0) for i in face)
            a,b,cross=[Vector(v[i]) for i in ids]
            positive=(b-a).cross(cross-a).y>0
            f.append(ids if positive==top else tuple(reversed(ids)))
    ring=len(v)
    for i in boundary:
        x,z=coords[i];v.append((x*w,h*.45,z*length));uv.append(top_uv(x*w,z*length));c.append(G.linear(.84))
    for j,i in enumerate(boundary):
        k=boundary[(j+1)%len(boundary)];a=ring+j;b=ring+(j+1)%len(boundary)
        f.extend([(i,b,k),(i,a,b),(a,count+k,b),(a,count+i,count+k)])
    return v,f,uv,c


def cloth_lod(item,state):
    """Sparse sewn original outline. Collapsing two close cloth panels into
    one another makes spikes, so build the distant front/back explicitly.
    """
    shape=item['shape'];w=item['width'];h=item['length'];hung=state=='hung'
    vertices=[];faces=[];uv=[];colors=[]
    for pi,outline in enumerate(outlines(shape)):
        coords,ff,boundary=G.polygon_grid(outline,1,1)
        offset=len(vertices);count=len(coords)
        for back in (False,True):
            for x,y in coords:
                wave=.002*math.sin(14*x+10*y)*math.sin(math.pi*y)
                depth=wave+pi*.006-(.006 if back else 0)
                p=[x*w,-y*h,depth] if hung else [x*w,.012+depth,(y-.5)*h]
                if back and (shape in ('tshirt','boxy','polo','crop_top','hoodie','jumper','jacket') or shape.startswith('dress_')) and abs(x)<.13 and y<.22:
                    lift=.04*h*(1-abs(x)/.13)*(1-y/.22)
                    p[1 if hung else 2]+=lift if hung else -lift
                vertices.append(tuple(p));uv.append((max(0,min(1,x+.5)),max(0,min(1,y))))
                colors.append(G.linear(.86 if back else .94))
            for face in ff:
                ids=tuple(offset+i+(count if back else 0) for i in face)
                a,b,c=[Vector(vertices[i]) for i in ids]
                front=(b-a).cross(c-a)[2 if hung else 1]>0
                faces.append(ids if front!=back else tuple(reversed(ids)))
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            if not edge_open(shape,coords[a],coords[b]):
                faces.extend([(offset+a,offset+b,offset+count+b),(offset+a,offset+count+b,offset+count+a)])
    if shape=='hoodie':
        # Keep the empty hood's defining silhouette in the distant object.
        start=len(vertices);n=6
        for ring in (0,1):
            for i in range(n):
                angle=math.tau*i/n
                x=.145*math.cos(angle)*(1 if ring==0 else .82)
                y=.065+.175*math.sin(angle)*(1 if ring==0 else .87)
                p=(x*w,-y*h,-.012 if ring==0 else -.055) if hung else (x*w,-.014 if ring==0 else -.055,(y-.5)*h)
                vertices.append(p);uv.append((x+.5,max(0,min(1,y))));colors.append(G.linear(.91 if ring==0 else .70))
        for i in range(n):
            j=(i+1)%n;faces.extend([(start+i,start+j,start+n+j),(start+i,start+n+j,start+n+i)])
        faces.extend([(start+n,start+n+i,start+n+i+1) for i in range(1,n-1)])
    return vertices,faces,uv,colors


def cap_lod(state):
    """Aligned crown and visor profiles retain their join without decimation."""
    v=[];f=[];uv=[];c=[];n=12
    profile=[(.001,.135),(.068,.118),(.095,.072),(.102,.008)]
    def add(p,shade=.92):
        x,y,z=p;v.append(p);uv.append((max(0,min(1,.5+x/.45)),max(0,min(1,.5+z/.50))));c.append(G.linear(shade))
    for j,(r,y) in enumerate(profile):
        for i in range(n):
            angle=math.tau*i/n;add((r*math.cos(angle),y,r*math.sin(angle)*1.11))
            if j:
                a=(j-1)*n+i;b=(j-1)*n+(i+1)%n;d=j*n+i;e=j*n+(i+1)%n
                f.extend([(a,b,e),(a,e,d)])
    start=len(v);segments=6
    for ring in range(3):
        for i in range(segments+1):
            angle=math.pi*i/segments
            add(((.102+.008*ring)*math.cos(angle),.008-.012*ring-.004*ring*math.cos(angle)**2,.102*1.11*math.sin(angle)+.045*ring*(.45+.55*math.sin(angle))),.87)
            if ring and i:
                a=start+(ring-1)*(segments+1)+i-1;b=a+segments+1
                f.extend([(a,b,a+1),(a+1,b,b+1)])
    if state=='hung':v=[(x,-z,y) for x,y,z in v]
    return v,f,uv,c


def fold_as(item):
    shape=item['shape']
    ident='leggings' if shape in ('jeans','joggers','school_trousers','leggings') else 'nightdress' if shape.startswith('dress_') else 'tshirt' if shape in ('tshirt','boxy','polo','hoodie','jumper','jacket') else 'shorts' if shape in ('shorts','denim_shorts','cycle','swim_trunks','boxers') else shape
    return {**item,'id':ident}


def compact_glb(path):
    """Repack Blender's core glTF: interleaved float positions/normals, normalized
    u16 UVs, u8 colours, shared meshes. No Draco/meshopt/quantization extension.
    """
    data=path.read_bytes();jn=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+jn]);bin_=data[28+jn:]
    components={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    def read(index):
        a=g['accessors'][index];view=g['bufferViews'][a['bufferView']];fmt,size=components[a['componentType']];n=widths[a['type']]
        start=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',size*n);out=[]
        for i in range(a['count']):
            p=struct.unpack_from('<'+fmt*n,bin_,start+i*stride)
            if a.get('normalized'):
                div={5120:127,5121:255,5122:32767,5123:65535}[a['componentType']];p=tuple(max(-1,x/div) for x in p)
            out.append(p)
        return out
    blobs=bytearray();views=[];acc=[];newmeshes=[];cache={};meshmap={}
    def append(blob,target,stride=None):
        while len(blobs)%4:blobs.append(0)
        view={'buffer':0,'byteOffset':len(blobs),'byteLength':len(blob),'target':target}
        if stride:view['byteStride']=stride
        views.append(view);blobs.extend(blob);return len(views)-1
    for mi,mesh in enumerate(g['meshes']):
        primitives=[]
        for p in mesh['primitives']:
            attrs=p['attributes'];pos=read(attrs['POSITION']);norm=read(attrs['NORMAL']);uv=read(attrs['TEXCOORD_0']);col=read(attrs['COLOR_0'])
            original=[int(x[0]) for x in read(p['indices'])] if 'indices' in p else list(range(len(pos)))
            # Welding exact exported attributes is lossless except documented UV/
            # colour storage precision. It retains split normals and seam UVs.
            table={};vertices=bytearray();ix=[];points=[]
            for old in original:
                cc=tuple(col[old])+(1,)*(4-len(col[old]))
                packed=struct.pack('<6f2H4B',*pos[old],*norm[old],*[round(max(0,min(1,x))*65535) for x in uv[old]],*[round(max(0,min(1,x))*255) for x in cc])
                if packed not in table:table[packed]=len(table);vertices.extend(packed);points.append(pos[old])
                ix.append(table[packed])
            indices=struct.pack('<'+'H'*len(ix),*ix)
            signature=hashlib.sha256(vertices+indices).hexdigest()
            if signature in cache:
                primitives.append(cache[signature]);continue
            vb=append(vertices,34962,32);ib=append(indices,34963)
            low=[min(p[k] for p in points) for k in range(3)];high=[max(p[k] for p in points) for k in range(3)]
            descriptors=[('POSITION',5126,'VEC3',0,False),('NORMAL',5126,'VEC3',12,False),('TEXCOORD_0',5123,'VEC2',24,True),('COLOR_0',5121,'VEC4',28,True)]
            attributes={}
            for name,ct,typ,off,normalized in descriptors:
                a={'bufferView':vb,'byteOffset':off,'componentType':ct,'count':len(table),'type':typ}
                if normalized:a['normalized']=True
                if name=='POSITION':a.update(min=low,max=high)
                attributes[name]=len(acc);acc.append(a)
            ai=len(acc);acc.append({'bufferView':ib,'componentType':5123,'count':len(ix),'type':'SCALAR'})
            primitive={'attributes':attributes,'indices':ai,'material':0};cache[signature]=primitive;primitives.append(primitive)
        signature=json.dumps(primitives,sort_keys=True)
        found=next((i for i,m in enumerate(newmeshes) if json.dumps(m['primitives'],sort_keys=True)==signature),None)
        if found is None:found=len(newmeshes);newmeshes.append({'primitives':primitives})
        meshmap[mi]=found
    for i,n in enumerate(g['nodes']):
        if 'mesh' in n:n['mesh']=meshmap[n['mesh']]
        n.pop('extras',None)
        for prop,value in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
            if n.get(prop)==value:n.pop(prop)
    while len(blobs)%4:blobs.append(0)
    result={'asset':{'version':'2.0','generator':'Blender teen cloth / core glTF compact packing'},'scene':0,'scenes':[{'nodes':g['scenes'][0]['nodes']}],'nodes':g['nodes'],'meshes':newmeshes,'materials':[{'name':'laundry','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.95}}],'buffers':[{'byteLength':len(blobs)}],'bufferViews':views,'accessors':acc}
    j=json.dumps(result,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(j)+len(blobs))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blobs),0x004e4942)+blobs
    path.write_bytes(out)
    return {'meshes':len(newmeshes),'vertices':sum(a['count'] for a in acc if a['type']=='VEC3' and a.get('byteOffset')==0),'bytes':len(out)}


def scaled_meta(ob,state,scale):
    m=G.metadata(ob,'hang-point' if state=='hung' else 'floor-centre')
    m['size']=[round(x*scale,7) for x in m['size']];m['footprint']=[m['size'][0],m['size'][2]]
    m['bounds']={k:[round(x*scale,7) for x in v] for k,v in m['bounds'].items()}
    return m


def fit_lod_envelope(low,high,state):
    """Collapse decimation can extrapolate boundary vertices. Keep the same
    physical envelope as the detail mesh so distance switches cannot grow an
    item through the sides of its shelf or a neighbouring garment.
    """
    source=G.envelope(low);target=G.envelope(high)
    for vertex in low.data.vertices:
        p=G.to_game(vertex.co)
        fitted=[]
        for k in range(3):
            span=source['max'][k]-source['min'][k]
            if span<=1e-8:raise ValueError('LOD lost an entire physical dimension')
            t=(p[k]-source['min'][k])/span
            fitted.append(target['min'][k]+t*(target['max'][k]-target['min'][k]))
        vertex.co=F.to_blender(fitted)
    low.data.update();G.normalize_object(low,state)


def make_prototypes(item,state):
    """Original 18a37a7 teen geometry; only its packaging has changed."""
    parcel=state=='folded' and item['shape'] in ('jeans','joggers','school_trousers','leggings')
    if parcel:geometry=folded_trousers(item)
    elif item['shape'] in ('school_shoes','sandals'):geometry=footwear(item)
    elif item['shape']=='cap':geometry=G.hat_geometry({**item,'id':'cap'},state)
    else:geometry=cloth_geometry(item,state)
    v,f,uv,c=geometry
    high=G.create_mesh('prototype',G.normalized_geometry(v,state),f,uv,c)
    if state=='folded' and not parcel:G.fold_object(high,fold_as(item))
    G.triangulate(high)
    cap=240 if item['shape'] in ('school_shoes','sandals','hoodie','jacket') else 200
    G.simplify(high,cap);G.normalize_object(high,state)
    if parcel:geometry=folded_trousers(item,low=True)
    elif state=='folded':geometry=folded_lod(item,high)
    elif item['shape']=='cap':geometry=cap_lod(state)
    elif item['shape'] not in ('school_shoes','sandals'):geometry=cloth_lod(item,state)
    else:geometry=None
    if geometry:
        lv,lf,lu,lc=geometry
        low=G.create_mesh('prototype-lod',G.normalized_geometry(lv,state),lf,lu,lc)
        G.triangulate(low)
    else:
        low=high.copy();low.data=high.data.copy();bpy.context.scene.collection.objects.link(low)
        G.simplify(low,min(104,max(42,int(G.tris(high)*.38))));G.normalize_object(low,state)
    fit_lod_envelope(low,high,state)
    if G.tris(high)>800 or G.tris(low)>240 or G.tris(low)>G.tris(high)*.6:
        raise ValueError(f"{item['id']}/{state}: invalid detailed/LOD triangle budgets")
    return high,low


def install(stage,out):
    """Replace only the teen directory/manifest; restore them on caught failure."""
    out.mkdir(parents=True,exist_ok=True)
    pairs=[(stage/DIRECTORY,out/DIRECTORY),(stage/MANIFEST,out/MANIFEST)]
    backup=stage/'previous';backup.mkdir();moved=[];installed=[]
    try:
        for index,(src,dst) in enumerate(pairs):
            if dst.exists():
                old=backup/str(index);os.replace(dst,old);moved.append((old,dst))
            os.replace(src,dst);installed.append(dst)
    except BaseException:
        for dst in reversed(installed):
            if dst.is_dir():shutil.rmtree(dst)
            elif dst.exists():dst.unlink()
        for old,dst in reversed(moved):os.replace(old,dst)
        raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=MODELS)
    parser.add_argument('--catalogue',type=Path,default=HERE/'garments_teen.catalog.json')
    parser.add_argument('--only',help='comma-separated style IDs; requires isolated --out')
    parser.add_argument('--no-validate',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args(F.argv_after_dashes() if '--' in sys.argv else [])
    out=args.out.resolve()
    if args.only and out==MODELS.resolve():raise ValueError('Partial builds must use an isolated --out')
    if args.no_validate and out==MODELS.resolve():raise ValueError('Unvalidated experiments require an isolated --out')
    catalogue=json.loads(args.catalogue.read_text())
    if catalogue.get('sizes')!=SIZES or catalogue.get('sizeTag')!='teen':
        raise ValueError('The teen catalogue must retain the two documented size classes')
    chosen=set(args.only.split(',')) if args.only else None
    items=[x for x in catalogue['garments'] if not chosen or x['id'] in chosen]
    if chosen and chosen!={x['id'] for x in items}:raise ValueError('Unknown garment ID')
    if not chosen and (len(items)!=29 or len({x['id'] for x in items})!=29):
        raise ValueError('The complete teen catalogue must contain all 29 styles')
    out.parent.mkdir(parents=True,exist_ok=True)
    manifest={
        'schemaVersion':1,'set':'garments-teen','sizeTag':'teen','scope':'objects-only',
        'ageGroup':'teen','units':'metres','baseCommit':'c4e8f46e8f617896f508728f77cda029ec494e88',
        'portedFrom':'18a37a7e29888cecc733e16bcd623b21c599916e','sizes':SIZES,
        'catalogue':'../../tools/blender/garments_teen.catalog.json',
        'roomKinds':['teen_bedroom','school_locker'],
        'limits':{'triangles':800,'lodTriangles':240,'runtimeBytes':3500000},
        'palette':DIRECTORY+'/teen/palette.json',
        'atlas':{'file':DIRECTORY+'/teen/fabrics.png','width':256,'height':256,'embedded':False},
        'sharedAtlas':'garments/prints.png','assortments':DIRECTORY+'/assortments.json',
        'files':[],
        'clothBake':{'blender':bpy.app.version_string,'frames':G.BAKE_FRAMES,'sequential':True,'staticOnly':True},
        'packing':{'sharedSizes':True,'position':'float32','normal':'float32','uv':'unorm16',
                   'color':'unorm8','decoder':'core-glTF-2.0','packs':{}},
        'lodPolicy':{'switchDistanceMetres':8,'cullDistanceMetres':30,'maxConcurrentDetailItems':24,
                     'note':'Select exactly one named root and one level. Detailed and LOD meshes use separate pose packs. Placement is left to the game.'},
    }
    with tempfile.TemporaryDirectory(prefix='.garments-teen-stage-',dir=out.parent) as temp:
        stage=Path(temp);dest=stage/DIRECTORY;dest.mkdir()
        build_textures(dest/'teen')
        # Placement recipes are authored source data, not geometry output. Copy
        # the checked-in input so rebuilding never discards or regenerates it.
        for name in ('assortments.json','CREDITS.md'):
            source=MODELS/DIRECTORY/name
            if source.exists():shutil.copy2(source,dest/name)
            elif name=='assortments.json' and not args.no_validate:
                raise ValueError('The authored teen assortment input is missing: '+str(source))
        total_assets=0
        for state in G.STATES:
            if not any(state in item['states'] for item in items):continue
            F.reset();prototypes={};assets={};lows=[]
            for item in items:
                if state not in item['states']:continue
                signature=(item['shape'],state,item['width'],item['length'])
                if signature not in prototypes:prototypes[signature]=make_prototypes(item,state)
                high,low=prototypes[signature]
                for size,info in SIZES.items():
                    scale=info['scale'];garment=f"teen_{item['id']}_{size}";key=f'garment_{garment}_{state}'
                    for template,suffix in ((high,''),(low,'_lod')):
                        root=bpy.data.objects.new(key+suffix,None);bpy.context.scene.collection.objects.link(root)
                        child=bpy.data.objects.new(key+suffix+'-tint-0',template.data);bpy.context.scene.collection.objects.link(child)
                        child.parent=root;child.scale=(scale,scale,scale)
                        if suffix:lows.extend([root,child])
                    assets[key]={
                        'node':key,'garment':garment,'styleId':item['id'],'sizeTag':'teen','sizeClass':size,
                        'scale':scale,'state':state,'ageGroup':'teen',**scaled_meta(high,state,scale),
                        'variants':item['variants'],'defaultVariant':item['defaultVariant'],'drawCalls':1,
                        'lod':{'glb':f'{DIRECTORY}/garments_{state}_lod.glb','node':key+'_lod',**scaled_meta(low,state,scale)},
                    }
                print(f"{item['id']}_{state}: {G.tris(high)}/{G.tris(low)} high/LOD",flush=True)
            for high,low in prototypes.values():
                bpy.data.objects.remove(high,do_unlink=True);bpy.data.objects.remove(low,do_unlink=True)
            for ob in lows:bpy.context.scene.collection.objects.unlink(ob)
            glb=f'{DIRECTORY}/garments_{state}.glb';F.export_glb(str(stage/glb))
            manifest['packing']['packs'][glb]=compact_glb(stage/glb)
            for ob in list(bpy.context.scene.objects):bpy.data.objects.remove(ob,do_unlink=True)
            for ob in lows:bpy.context.scene.collection.objects.link(ob)
            lod_glb=f'{DIRECTORY}/garments_{state}_lod.glb';F.export_glb(str(stage/lod_glb))
            manifest['packing']['packs'][lod_glb]=compact_glb(stage/lod_glb)
            lod_hash=hashlib.sha256((stage/lod_glb).read_bytes()).hexdigest()
            for a in assets.values():a['lod']['sha256']=lod_hash
            manifest['files'].append({'glb':glb,'sha256':hashlib.sha256((stage/glb).read_bytes()).hexdigest(),'assets':assets})
            total_assets+=len(assets)
        # Ordinary compact JSON keeps download bytes down without a decoder.
        (stage/MANIFEST).write_text(json.dumps(manifest,separators=(',',':'))+'\n')
        total=(stage/MANIFEST).stat().st_size+sum(p.stat().st_size for p in dest.rglob('*') if p.is_file())
        if total>3500000:raise ValueError(f'Teen runtime payload {total} exceeds 3500000 bytes')
        if not args.no_validate:
            node=shutil.which('node')
            if not node:raise ValueError('Node is required for independent exported-byte validation')
            report=stage/'validation.json'
            command=[node,str(ROOT/'tools/nice.mjs'),node,str(HERE/'garments_validate.mjs'),
                     '--teen','--root',str(stage),'--catalogue',str(args.catalogue.resolve()),'--json',str(report)]
            if not chosen:command.append('--complete')
            checked=subprocess.run(command,capture_output=True,text=True,timeout=180,
                                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            print(checked.stdout,flush=True)
            if checked.returncode or not report.is_file():raise ValueError('Independent teen validation failed: '+checked.stderr)
            verified=json.loads(report.read_text())
            if not verified.get('ok') or verified.get('assets')!=total_assets:
                raise ValueError('Validator did not confirm every exported teen state')
        install(stage,out)
        print(f'EXPORTED teen: {len(items)} styles, {total_assets} states + LODs, {total}/3500000 bytes; {len(manifest["files"])*2} pose packs.',flush=True)


if __name__=='__main__':main()
