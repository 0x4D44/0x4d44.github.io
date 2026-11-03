"""Original procedural adult garment patterns, in the resident builder's metre frame.

This is deliberately independent of Blender operators. The generated topology is
the topology exported and tested; there is no hidden decimator or visual-only fit.
Blender frame: X right, Y forward, Z up. Every body component is a closed solid.
"""
from __future__ import annotations
import math, os, sys
import numpy as np


class Mesh:
    def __init__(self, skin):
        self.skin = skin
        self.p, self.w, self.uv, self.c = [], [], [], []
        self.tri, self.far, self.components = [], [], []
        self.solids=[];self.preserve=set()

    def vertex(self, p, part, uv=(.5, .5), shade=1.0, reference=None, weights=None):
        i = len(self.p)
        self.p.append(tuple(float(x) for x in p))
        self.w.append(weights if weights is not None else self.skin(reference if reference is not None else p, part))
        self.uv.append(tuple(uv)); self.c.append((shade, shade, shade, 1.0))
        return i

    def face(self, a, b, c, far=False):
        (self.far if far else self.tri).append((a, b, c))

    def loft(self, rings, part, *, name=None, closed=True, caps=False,
             references=None, shade=.97, lod=True, uv_height=1.0, solid=False,
             open_caps=(0,1), lod_rows=None, lod_angles=None, lod_last_angles=None):
        """Loft rings with true coarser far indices referencing the same vertices."""
        start = len(self.tri) * 3; n = len(rings[0]); rows = []
        if solid:caps=True
        for ri, ring in enumerate(rings):
            rr = []
            for j, p in enumerate(ring):
                ref = references[ri][j] if references else None
                tone = shade * (1 + .035 * math.sin(j * 2.37 + ri * .7))
                rr.append(self.vertex(p, part, (j / max(1, n-1), ri / max(1, len(rings)-1) * uv_height), min(1.,tone), reference=ref))
            rows.append(rr)
        for a,b in zip(rows,rows[1:]):
            for j in range(n if closed else n-1):
                k=(j+1)%n; self.face(a[j],a[k],b[k]); self.face(a[j],b[k],b[j])
        cap_ids=[];capfaces=[]
        if caps and closed:
            for end,(q,rev) in enumerate(((0,True),(-1,False))):
                center=np.mean(rings[q],axis=0)
                ci=self.vertex(center,part,shade=shade)
                cap_ids.append(ci)
                for j in range(n):
                    a,b=rows[q][j],rows[q][(j+1)%n]
                    if end in open_caps:capfaces.append(len(self.tri))
                    self.face(ci,b,a) if rev else self.face(ci,a,b)
        # Winding is fixed from volume for closed components, and from the radial
        # normal for open cloth. No render-side double-sided flag hides bad input.
        first=start//3; chunk=self.tri[first:]
        pts=np.asarray(self.p)
        if caps:
            vol=sum(float(np.dot(pts[a],np.cross(pts[b],pts[c]))) for a,b,c in chunk)
            flip=vol<0
        else:
            center=np.mean(np.asarray(rings),axis=(0,1))
            score=0
            for a,b,c in chunk:
                norm=np.cross(pts[b]-pts[a],pts[c]-pts[a]);mid=(pts[a]+pts[b]+pts[c])/3
                radial=mid-center;radial[2]=0
                score+=np.dot(norm,radial)
            flip=score<0
        if flip: self.tri[first:]=[(a,c,b) for a,b,c in chunk]
        far_begin=len(self.far);far_caps=[]
        if lod:
            rs=sorted(set(lod_rows)|{0,len(rows)-1}) if lod_rows is not None else list(range(0,len(rows),2))
            if rs[-1]!=len(rows)-1: rs.append(len(rows)-1)
            js=sorted(set(lod_angles)) if lod_angles is not None else list(range(0,n,2))
            if not closed and js[-1]!=n-1:js.append(n-1)
            nearfar=len(self.far)
            last_js=sorted(set(lod_last_angles)) if lod_last_angles is not None else js
            if lod_last_angles is not None and (not closed or not set(last_js)<=set(js) or len(last_js)<3 or last_js[0]!=js[0]):
                raise RuntimeError('Last far ring must retain the shared origin and at least three source angles')
            for r0,r1 in zip(rs,rs[1:]):
                if r1==len(rows)-1 and last_js!=js:
                    # Only the loose trouser ankle opening drops two angular
                    # samples. Every hip/knee row and all near faces remain.
                    i=j=0
                    while i<len(js) or j<len(last_js):
                        a,b=rows[r0][js[i%len(js)]],rows[r1][last_js[j%len(last_js)]]
                        an=js[(i+1)%len(js)]+(n if i+1>=len(js) else 0)
                        bn=last_js[(j+1)%len(last_js)]+(n if j+1>=len(last_js) else 0)
                        if i<len(js) and j<len(last_js) and an==bn:
                            c,d=rows[r0][js[(i+1)%len(js)]],rows[r1][last_js[(j+1)%len(last_js)]]
                            self.face(a,c,d,True);self.face(a,d,b,True);i+=1;j+=1
                        elif i<len(js) and (j>=len(last_js) or an<bn):
                            self.face(a,rows[r0][js[(i+1)%len(js)]],b,True);i+=1
                        else:
                            self.face(a,rows[r1][last_js[(j+1)%len(last_js)]],b,True);j+=1
                else:
                    for ji in range(len(js) if closed else len(js)-1):
                        j,k=js[ji],js[(ji+1)%len(js)]
                        a,b,c,d=rows[r0][j],rows[r0][k],rows[r1][k],rows[r1][j]
                        self.face(a,b,c,True);self.face(a,c,d,True)
            if cap_ids:
                for end,(row,ci,rev) in enumerate(((rows[0],cap_ids[0],True),(rows[-1],cap_ids[1],False))):
                    cap_js=last_js if end==1 else js
                    for j,k in zip(cap_js,cap_js[1:]+cap_js[:1]):
                        if end in open_caps:far_caps.append(len(self.far))
                        if rev:self.face(ci,row[k],row[j],True)
                        else:self.face(ci,row[j],row[k],True)
            if flip:self.far[nearfar:]=[(a,c,b) for a,b,c in self.far[nearfar:]]
        if name:self.components.append(dict(name=name,firstIndex=start,indexCount=len(chunk)*3))
        if solid:self.solids.append((first,len(self.tri),set(capfaces),far_begin,len(self.far),set(far_caps)))
        return rows

    def sew(self):
        """Boolean-sew cloth panels, retaining UVs and blended skin properties.

        Closed authoring solids permit an exact union at crotches and armholes.
        Original cap face IDs are then removed, making only the intended neck,
        wrist, leg and waist openings. This eliminates buried internal panel
        vertices rather than attempting to inflate them through another limb.
        """
        if not self.solids:return self
        extra=os.environ.get('PEOPLE_WEAR_PYSITE')
        if extra and os.path.isdir(extra) and extra not in sys.path:sys.path.append(extra)
        try:import manifold3d as mf
        except ImportError as exc:raise RuntimeError('Install manifold3d for authoring, or set PEOPLE_WEAR_PYSITE to its module directory') from exc
        bones=['hips','spine','chest','neck','head','clavicle_l','clavicle_r','upperarm_l','upperarm_r','forearm_l','forearm_r','hand_l','hand_r','fingers_l','fingers_r','thigh_l','thigh_r','shin_l','shin_r','foot_l','foot_r']
        props=[]
        for p,uv,w,c in zip(self.p,self.uv,self.w,self.c):
            dense=[0.]*21
            for bn,ww in w:dense[bones.index(bn)]+=ww
            props.append([*p,*uv,*dense,*c[:3]])
        props=np.asarray(props,dtype=np.float32)
        solids=[];far_solids=[];caps=set();far_caps=set();primary=set()
        for begin,end,cc,fb,fe,fc in self.solids:
            for source,aa,bb,cap_ids,dst,capset in ((self.tri,begin,end,cc,solids,caps),(self.far,fb,fe,fc,far_solids,far_caps)):
                faces=np.asarray(source[aa:bb],dtype=np.uint32);used=np.unique(faces);remap={int(v):i for i,v in enumerate(used)}
                faces=np.asarray([[remap[int(v)] for v in f] for f in faces],dtype=np.uint32)
                oid=mf.Manifold.reserve_ids(1)
                mm=mf.Mesh(vert_properties=np.ascontiguousarray(props[used]),tri_verts=faces,run_index=np.asarray([0,faces.size],dtype=np.uint32),run_original_id=np.asarray([oid],dtype=np.uint32),face_id=np.arange(len(faces),dtype=np.uint32))
                mm.merge();solid=mf.Manifold(mm)
                if solid.status()!=mf.Error.NoError:raise RuntimeError('Invalid closed garment panel: '+str(solid.status()))
                dst.append(solid);capset.update((oid,f-aa) for f in cap_ids)
            primary.update(range(begin,end))
        joined=mf.Manifold.batch_boolean(solids,mf.OpType.Add)
        coarse=mf.Manifold.batch_boolean(far_solids,mf.OpType.Add)
        if joined.status()!=mf.Error.NoError:raise RuntimeError('Garment seam boolean failed: '+str(joined.status()))
        out=Mesh(self.skin);vertex_pool={};position_weights={}
        def append_surface(solid,far=False,capset=caps):
            data=solid.to_mesh();vp=np.array(data.vert_properties,dtype=np.float64);tri=np.asarray(data.tri_verts,dtype=int)
            parent=list(range(len(vp)))
            def find(i):
                while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
                return i
            for a,b in zip(data.merge_from_vert,data.merge_to_vert):parent[find(a)]=find(b)
            groups={}
            for i in range(len(vp)):groups.setdefault(find(i),[]).append(i)
            for ids in groups.values():
                if len(ids)>1:vp[ids,5:26]=np.mean(vp[ids,5:26],axis=0)
            keep=np.ones(len(tri),dtype=bool)
            for aa,bb,oid in zip(data.run_index[:-1],data.run_index[1:],data.run_original_id):
                for ti in range(aa//3,bb//3):
                    if (oid,data.face_id[ti]) in capset:keep[ti]=False
            tri=tri[keep];used=np.unique(tri);mapping={}
            for vi in used:
                row=vp[vi];w=sorted(((bones[j],max(0.,row[5+j])) for j in range(21)),key=lambda v:-v[1])[:4]
                total=sum(ww for _,ww in w);w=[(bn,ww/total) for bn,ww in w if ww>1e-8]
                pk=tuple(round(float(x),6) for x in row[:3])
                if far and pk in position_weights:w=position_weights[pk]
                else:position_weights[pk]=w
                vk=pk+tuple(round(float(x),6) for x in row[3:5])+tuple((bn,int(round(ww*255))) for bn,ww in w)
                if vk not in vertex_pool:
                    vertex_pool[vk]=out.vertex(row[:3],'torso',row[3:5],weights=w)
                    out.c[-1]=tuple(np.clip(row[26:29],0,1))+(1.,)
                mapping[int(vi)]=vertex_pool[vk]
            dst=out.far if far else out.tri
            dst.extend(tuple(mapping[int(v)] for v in f) for f in tri)
        append_surface(joined)
        append_surface(coarse,True,far_caps)
        # Raised hems/collars/stitches are retained only on the union exterior.
        # The test for decorations never substitutes for the independent posed
        # body collision gate, which still evaluates every exported vertex.
        detail=[f for i,f in enumerate(self.tri) if i not in primary]
        preserve_vertices={v for fi in self.preserve for v in self.tri[fi]}
        external={}
        for vi in {v for f in detail for v in f}:
            p=self.p[vi];hits=joined.ray_cast(p,(p[0]+7.13,p[1]+3.71,p[2]+5.39))
            positive=[h.distance for h in hits if h.distance>1e-6]
            external[vi]=(len(positive)%2==0) or vi in preserve_vertices
        mapped={}
        for f in detail:
            if not all(external[v] for v in f):continue
            for v in f:
                if v not in mapped:
                    mapped[v]=out.vertex(self.p[v],'torso',self.uv[v],weights=self.w[v]);out.c[-1]=self.c[v]
            out.tri.append(tuple(mapped[v] for v in f))
        primary_vertices={v for fi in primary for v in self.tri[fi]}
        for f in self.far:
            if any(v in primary_vertices for v in f) or not all(external.get(v,False) for v in f):continue
            for v in f:
                if v not in mapped:
                    mapped[v]=out.vertex(self.p[v],'torso',self.uv[v],weights=self.w[v]);out.c[-1]=self.c[v]
            out.far.append(tuple(mapped[v] for v in f))
        return out

    def ellipsoid(self, center, radii, part, *, name=None, n=12, rows=8):
        # Single pole vertex instead of coincident pole rings keeps the component
        # a closed oriented two-manifold after exact position welding.
        cx,cy,cz=center;rx,ry,rz=radii
        rings=[]
        for j in range(1,rows):
            a=-math.pi/2+math.pi*j/rows
            rings.append([(cx+rx*math.cos(a)*math.cos(2*math.pi*i/n),cy+ry*math.cos(a)*math.sin(2*math.pi*i/n),cz+rz*math.sin(a)) for i in range(n)])
        start=len(self.tri)*3
        rr=self.loft(rings,part,caps=False,lod=False)
        lo=self.vertex((cx,cy,cz-rz),part);hi=self.vertex((cx,cy,cz+rz),part)
        for i in range(n):
            k=(i+1)%n;self.face(lo,rr[0][k],rr[0][i]);self.face(hi,rr[-1][i],rr[-1][k])
        chunk=self.tri[start//3:];pts=np.asarray(self.p)
        if sum(np.dot(pts[a],np.cross(pts[b],pts[c])) for a,b,c in chunk)<0:self.tri[start//3:]=[(a,c,b) for a,b,c in chunk]
        self.far.extend(self.tri[start//3:])
        if name:self.components.append(dict(name=name,firstIndex=start,indexCount=len(chunk)*3))

    def ribbon(self, points, widths, part, *, dark=.82):
        """Small raised sewn band; far LOD omits the stitch-scale geometry."""
        if isinstance(widths,(int,float)): widths=[widths]*len(points)
        ids=[]
        for pi,(p,w) in enumerate(zip(points,widths)):
            a=points[max(0,pi-1)];b=points[min(len(points)-1,pi+1)]
            side=(0,w/2,0) if abs(b[0]-a[0])>abs(b[2]-a[2]) else (w/2,0,0)
            ids.append([self.vertex(tuple(p[j]+sg*side[j] for j in range(3)),part,(i,pi/max(1,len(points)-1)),dark) for i,sg in enumerate((-1,1))])
        for a,b in zip(ids,ids[1:]):self.face(a[0],a[1],b[1]);self.face(a[0],b[1],b[0])

    def refine_skin_transitions(self,hip,k):
        """Add near-only anchors along long panels crossing a moving hip seam."""
        for iteration in range(12):
            edges={tuple(sorted((f[i],f[(i+1)%3]))) for f in self.tri for i in range(3)}
            selected=[]
            for a,b in edges:
                pa,pb=self.p[a],self.p[b]
                if min(pa[2],pb[2])<hip-.25*k or max(pa[2],pb[2])>hip+.16*k:continue
                length=math.dist(pa,pb)
                wa,wb=dict(self.w[a]),dict(self.w[b]);bones=('thigh_l','thigh_r')
                gradient=sum(abs(wa.get(bn,0)-wb.get(bn,0)) for bn in bones)
                thigh=max(sum(w.get(bn,0) for bn in bones) for w in (wa,wb))
                if thigh>.08 and (length>.09*k or (length>.055*k and gradient>.3)):selected.append((a,b))
            if not selected:break
            for a,b in sorted(selected):
                weights={}
                for v in (a,b):
                    for bn,ww in self.w[v]:weights[bn]=weights.get(bn,0)+ww*.5
                weights=sorted(weights.items(),key=lambda w:(-w[1],w[0]))[:4];total=sum(ww for _,ww in weights)
                mid=self.vertex(tuple((self.p[a][i]+self.p[b][i])*.5 for i in range(3)),'torso',tuple((self.uv[a][i]+self.uv[b][i])*.5 for i in range(2)),weights=[(bn,ww/total) for bn,ww in weights if ww>1e-8])
                self.c[mid]=tuple((self.c[a][i]+self.c[b][i])*.5 for i in range(4))
                faces=[]
                for f in self.tri:
                    for i in range(3):
                        if {f[i],f[(i+1)%3]}=={a,b}:
                            u,v,w=f[i],f[(i+1)%3],f[(i+2)%3];faces.extend(((u,mid,w),(mid,v,w)));break
                    else:faces.append(f)
                self.tri=faces
        return self

    def normals(self):
        p=np.asarray(self.p,dtype=np.float64);nn=np.zeros_like(p)
        t=np.asarray(self.tri+self.far,dtype=np.int64)
        n=np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]])
        for j in range(3):np.add.at(nn,t[:,j],n)
        lengths=np.linalg.norm(nn,axis=1);nn/=np.maximum(lengths[:,None],1e-12)
        return nn


def ring(cx,cy,z,rx,ry,n=16):
    return [(cx+rx*math.cos(2*math.pi*i/n),cy+ry*math.sin(2*math.pi*i/n),z) for i in range(n)]


class Patterns:
    def __init__(self,pd,P,skin,torso_rows):
        self.pd,self.P,self.skin=pd,P,skin
        self.H,self.k,self.b=P['H'],P['k'],pd['build']
        self.fem=P['fem']; self.lean=lambda z:pd.get('stoop',0)*max(0,z-P['hip'])*.55
        # The source builder's bottom torso ring was itself a trouser surface.
        # A complete body needs a rounded pelvic termination, otherwise a broad
        # horizontal skin ledge shows between the two separate thigh surfaces.
        self.rows=[(self.H*.429,.025*self.k,.040*self.k,0),
                   (self.H*.466,.135*self.k*self.b,.088*self.k*self.b,0)]+[r for r in torso_rows if r[0]>self.H*.47]
        self.sh=P['sh'];self.ua=.186*self.H;self.fa=.146*self.H
        self.elbow=self.sh-self.ua;self.wrist=self.elbow-self.fa
        self.hx=P['hipw']*.52;self.sx=P['shw']-.004
        self.ru=(.052 if not self.fem else .046)*self.k*self.b**.5
        self.rf=(.040 if not self.fem else .036)*self.k

    def torso(self,z):
        rows=self.rows
        if z<=rows[0][0]:return rows[0][1],rows[0][2],rows[0][3]+self.lean(z)
        for a,b in zip(rows,rows[1:]):
            if a[0]<=z<=b[0]:
                t=(z-a[0])/(b[0]-a[0]);return tuple(a[i]*(1-t)+b[i]*t for i in (1,2))+(a[3]*(1-t)+b[3]*t+self.lean(z),)
        return rows[-1][1],rows[-1][2],rows[-1][3]+self.lean(z)

    def tor_rings(self,zs,offset=0,n=16,flare=0,folds=False):
        rr=[];refs=[]
        for ri,z in enumerate(zs):
            rx,ry,cy=self.torso(z);r=ring(0,cy,z,rx,ry,n)
            # The legacy torso's width grew faster than its fixed arm centres.
            # Shape a real axilla/side groove in both visible body and cloth so
            # the relaxed arm is beside the torso, rather than inside a barrel.
            r=[self.clear_arm(p,0) for p in r];refs.append(r)
            ext=offset+flare*max(0,1-(z-zs[0])/max(.01,zs[-1]-zs[0]))
            row=[]
            for j,p in enumerate(r):
                a=2*math.pi*j/n;wave=(.0028*self.k*math.sin(a*5+.4)*math.sin(ri*1.7) if folds else 0)
                row.append(self.clear_arm((p[0]+(ext+wave)*math.cos(a),p[1]+(ext+wave)*math.sin(a),p[2]),ext))
            rr.append(row)
        return rr,refs

    def clear_arm(self,p,layer=0):
        z=p[2]
        if not self.wrist-.145*self.k<z<self.sh+.005:return p
        ar=self.arm_radius(z) if z>=self.wrist else .043*self.k
        rad=ar+.009*self.k-min(.006*self.k,layer*.20)
        if abs(p[1])>=rad:return p
        boundary=self.sx-math.sqrt(max(0,rad*rad-p[1]*p[1]))
        if abs(p[0])>boundary:return (math.copysign(max(.035*self.k,boundary),p[0]),p[1],p[2])
        return p

    def outside_arm(self,p):
        """A skirt surrounds the arm/hand outline instead of using an axilla.

        The torso's inner groove is unsuitable for a flared skirt: applying it
        to an already-outside point folds the side panel through the thigh.
        Keep one coherent outer branch along the whole side arc.
        """
        x,y,z=p
        if not self.wrist-.145*self.k<z<self.sh+.005:return p
        ar=self.arm_radius(z) if z>=self.wrist else .055*self.k
        radius=ar+.009*self.k
        if (abs(x)-self.sx)**2+y*y>=radius*radius:return p
        return (math.copysign(self.sx+math.sqrt(max(0,radius*radius-y*y)),x),y,z)

    def arm_radius(self,z):
        if z>self.elbow:
            t=(self.sh-z)/self.ua
            return self.ru*(.74+.26*math.sin(min(1,t)*math.pi))
        t=(self.elbow-z)/self.fa
        return self.rf*(1.13-.43*max(0,min(1,t)))

    def leg_radius(self,z):
        k=self.k
        if z>=self.P['knee']:
            t=(self.P['hip']-z)/(self.P['hip']-self.P['knee'])
            return (.090*self.b**.5*(1-t)+.061*t)*k
        t=(self.P['knee']-z)/(self.P['knee']-self.P['ankle'])
        return (.050*(1-t)+.032*t+.012*math.sin(math.pi*t))*k

    def sleeve(self,m,sg,length,offset,n=12,tight=False):
        sd='_l' if sg<0 else '_r';z0=self.sh+.010*self.k;z1=self.sh-length
        if length>self.ua:n=10
        zs=sorted({z0,z1,*[z for z in np.linspace(self.sh+.003,self.wrist-.007,11) if z1<z<z0]},reverse=True) if tight or length>self.ua else np.linspace(z0,z1,6 if length<self.ua else 9)
        rr=[];ref=[]
        def cloth_ring(z,r,amount):
            out=[]
            for a in np.linspace(0,2*math.pi,n,endpoint=False):
                # Cloth is compressed between the upper arm and torso. A large
                # uniform sleeve inflation would merge the free forearm into
                # the shirt waist in the standing pose.
                gain=(.42+.58*(1+sg*math.cos(a))/2) if tight else (.12+.88*(1+sg*math.cos(a))/2)
                off=amount*gain
                out.append((sg*self.sx+(r+off)*math.cos(a),(r+off)*math.sin(a),z))
            return out
        for i,z in enumerate(zs):
            r=self.arm_radius(z);ref.append(ring(sg*self.sx,0,z,r,r,n))
            fl=.001*math.sin(i*2.5)*self.k;rr.append(cloth_ring(z,r,offset+fl))
        # Only the armscye is sewn into the torso. The free lower sleeve remains
        # an independently deforming panel even if its rest silhouette touches
        # the waist; joining there would blend a wrist into the pelvis bones.
        join=min(len(rr)-2,2)
        # The upper cap is the visible shoulder of the sewn sleeve. Retain its
        # union-exterior fragments; deleting it creates an unintended strip of
        # bare shoulder. Only the lower temporary armscye cap is an opening.
        m.loft(rr[:join+1],'arm'+sd,references=ref[:join+1],solid=True,open_caps=(1,),lod_angles=range(n))
        first=len(m.tri)
        far_rows=None
        if tight or length>self.ua:
            free_zs=zs[join:]
            far_rows=sorted({0,len(free_zs)-1,*[min(range(len(free_zs)),key=lambda i:abs(free_zs[i]-z)) for z in (self.sh-self.ua*.5,self.elbow,self.wrist+.035*self.k)]})
        m.loft(rr[join:],'arm'+sd,references=ref[join:],lod_angles=range(n),lod_rows=far_rows)
        m.preserve.update(range(first,len(m.tri)))
        # Rolled cuff / band, also carries a real thickness at the opening.
        r=self.arm_radius(z1);first=len(m.tri)
        if tight or length>self.ua:
            # Stretch swim fabric has an outward flat hem. A rolled inward
            # return can cross the hand blend and fight the body-clearance fit.
            m.loft([cloth_ring(z,self.arm_radius(z),offset+.004) for z in (z1+.012*self.k,z1)],'arm'+sd,lod=False,shade=.87)
        else:
            m.loft([cloth_ring(z1+.012*self.k,r,offset+.003),cloth_ring(z1,r,offset+.003),cloth_ring(z1+.002,r,offset-.001)],'arm'+sd,lod=False,shade=.87)
        m.preserve.update(range(first,len(m.tri)))

    def leg(self,m,sg,z0,z1,offset,n=12,rows=9,far_hem=False):
        sd='_l' if sg<0 else '_r';rr=[];ref=[]
        long=z1<self.H*.3
        if long:n=10
        zs=sorted({z0,z1,*[z for z in np.linspace(self.P['hip']+.015,self.P['ankle']-.013,11) if z1<z<z0]},reverse=True) if long else np.linspace(z0,z1,rows)
        for i,z in enumerate(zs):
            r=self.leg_radius(z);ref.append(ring(sg*self.hx,0,z,r,r*.96,n))
            fold=.002*self.k*math.sin(i*2.1);outer=offset+fold
            # Leave an actual inseam gap below the groin. Uniform inward
            # inflation fuses the two tubes down the thigh and mixes both legs.
            inner=min(outer,max(.0015*self.k,(self.hx-r)*.45))
            rr.append([(sg*self.hx+(r+inner+(outer-inner)*(1+sg*math.cos(a))/2)*math.cos(a),(r*.96+outer)*math.sin(a),z) for a in np.linspace(0,2*math.pi,n,endpoint=False)])
        # Exterior hip-cap fragments form the sewn crotch/upper thigh. Only the
        # ankle or short hem is an opening after the pelvis/leg union.
        # Keep the cross-section around a close-fitting leg and simplify along
        # its straighter length; a six-sided far ring would cut through skin.
        if long:
            knee=self.P['knee'];edge=.04*self.k
            upper=min([i for i,z in enumerate(zs) if z>=knee+edge],key=lambda i:zs[i]-(knee+edge))
            lower=min([i for i,z in enumerate(zs) if z<=knee-edge],key=lambda i:(knee-edge)-zs[i])
            hiprow=min([i for i,z in enumerate(zs) if z<=self.P['hip']-.055*self.k],key=lambda i:(self.P['hip']-.055*self.k)-zs[i])
            calf=min(range(len(zs)),key=lambda i:abs(zs[i]-(knee+self.P['ankle'])/2))
            far_rows=sorted({0,len(rr)-1,hiprow,calf,*range(upper,lower+1)})
        else:far_rows=sorted(set(int(round(x)) for x in np.linspace(0,len(rr)-1,4)))
        last_angles=[j for j in range(n) if j not in ((3,8) if sg<0 else (2,7))] if long and far_hem else None
        m.loft(rr,'thigh'+sd,references=ref,solid=True,open_caps=(1,),lod_angles=range(n),lod_rows=far_rows,lod_last_angles=last_angles)
        r=self.leg_radius(z1);m.loft([ring(sg*self.hx,0,z1+.012,r+offset+.002,r*.96+offset+.002,n),ring(sg*self.hx,0,z1,r+offset+.002,r*.96+offset+.002,n)],'thigh'+sd,lod=False,shade=.85)

    def body_levels(self):
        return sorted(set([self.H*x for x in (.429,.449,.466,.49,.51,.565,.612,.68,.738,.784)]+[self.P['sh']+.01,self.P['trap'],self.P['nbase']]))

    def body(self):
        m=Mesh(self.skin);H=self.H;k=self.k
        zs=self.body_levels()
        rr,_=self.tor_rings(zs,n=16);m.loft(rr,'torso',caps=True,name='torso')
        # A coarse chord across the arm-side recess adds body volume and can
        # force a sleeve through the arm. Keep this actual rendered torso shape
        # at both LODs; its positions remain shared and the limbs still simplify.
        m.far=list(m.tri)
        m.loft([ring(0,self.lean(z),z,.050*k,.046*k,12) for z in np.linspace(self.P['nbase']-.01,self.P['chin']+.035,4)],'neck',caps=True,name='neck')
        for sg in (-1,1):
            sd='_l' if sg<0 else '_r'
            # One continuous arm surface, closed at shoulder and wrist.
            zs=np.linspace(self.sh+.003,self.wrist-.007,11)
            m.loft([ring(sg*self.sx,0,z,self.arm_radius(z),self.arm_radius(z)*.96,10) for z in zs],'arm'+sd,caps=True,name='arm'+sd)
            zs=np.linspace(self.P['hip']+.015,self.P['ankle']-.013,11)
            first=len(m.tri);far_first=len(m.far)
            m.loft([ring(sg*self.hx,0,z,self.leg_radius(z),self.leg_radius(z)*.96,10) for z in zs],'thigh'+sd,caps=True,name='leg'+sd)
            m.far[far_first:]=m.tri[first:]
            # Closed palm with five separate rounded digits (no anatomical detail).
            m.ellipsoid((sg*self.sx,.002,self.wrist-.045*k),(.032*k,.019*k,.055*k),'hand'+sd,name='palm'+sd,n=10,rows=6)
            for j,scale in enumerate((.86,1.,.94,.76)):
                xx=sg*self.sx+(j-1.5)*.014*k
                m.ellipsoid((xx,.002,self.wrist-(.084+.023*scale)*k),(.008*k,.009*k,.034*scale*k),'fingers'+sd,name='finger'+sd+str(j),n=6,rows=4)
            m.ellipsoid((sg*self.sx-sg*.037*k,.008,self.wrist-.051*k),(.013*k,.012*k,.030*k),'hand'+sd,name='thumb'+sd,n=8,rows=4)
            # Foot proportions follow the existing heel/toe reference and floor.
            m.ellipsoid((sg*self.hx,.075*k,.042*k),(.046*k,.133*k,.041*k),'foot'+sd,name='foot'+sd,n=10,rows=6)
        return m

    def top(self,kind):
        m=Mesh(self.skin);H=self.H;k=self.k
        offset={'tshirt':.026,'shirt':.027,'blouse':.030,'jumper':.032,'rash_vest':.009,'dress':.024,'swimsuit_onepiece':.009}[kind]*k
        low=H*(.550 if kind in ('tshirt','jumper','rash_vest') else .56)
        # The brief is the lower half of this garment. Extending the torso tube
        # below its waistband leaves buried tube panels inside the upper thighs.
        if kind=='swimsuit_onepiece':low=H*.542
        if kind=='dress':low=H*.505
        neck=self.P['nbase']+.006*k
        if kind=='rash_vest':neck=self.P['nbase']-.012*k
        if kind=='swimsuit_onepiece':neck=H*.778
        # A close-fitting rash vest follows the actual body's height knots.
        # Uniform rows can clear at each vertex yet bridge through the bust.
        close_fit=kind in ('rash_vest','swimsuit_onepiece')
        torso_n=16 if close_fit else 20
        zs=sorted({low,neck,*[z for z in self.body_levels() if low<z<neck]}) if close_fit else np.linspace(low,neck,10)
        rr,refs=self.tor_rings(zs,offset,n=torso_n,flare=.007*k if kind=='blouse' else 0,folds=kind not in ('rash_vest','swimsuit_onepiece'))
        # Wide scoop opening for blouse / swimsuit, round crew for tees / knit.
        if kind=='blouse':
            rr[-1]=ring(0,self.lean(neck),neck,.082*k,.062*k,20)
        if kind=='swimsuit_onepiece':
            # A real scoop opening is below the clavicles, with narrow straps
            # over the shoulders; it is not a sleeveless tee with a neck tube.
            rr[-1]=[(x,y,z-.035*k*max(0,math.sin(2*math.pi*i/torso_n))) for i,(x,y,z) in enumerate(rr[-1])]
        far_rows=range(len(rr)) if close_fit else None
        if kind=='rash_vest':
            # These two inward waist/neck transitions may be bridged outward;
            # the convex bust knot and arm-side angular contour stay intact.
            far_rows=[i for i,z in enumerate(zs) if abs(z-H*.565)>1e-7 and abs(z-self.P['trap'])>1e-7]
        m.loft(rr,'torso',references=refs,solid=True,lod_rows=far_rows,lod_angles=range(torso_n) if close_fit else None)
        collar=[[(x*1.015,y*1.015,z+.004*k) for x,y,z in rr[-1]],rr[-1]]
        m.loft(collar,'torso',lod=False,shade=.79 if kind=='jumper' else .88)
        m.loft([rr[0],[(x*1.012,y*1.012,z+.015*k) for x,y,z in rr[0]]],'torso',lod=False,shade=.86)
        if kind not in ('swimsuit_onepiece',):
            length=(self.ua+self.fa-(.035 if kind in ('shirt','jumper') else .006)*k) if kind in ('shirt','jumper','rash_vest') else self.ua*(.45 if kind!='blouse' else .64)
            for sg in (-1,1):self.sleeve(m,sg,length,offset,n=10 if kind=='rash_vest' else 12,tight=kind=='rash_vest')
        if kind=='shirt':
            # Pointed collar leaves and a raised button placket.
            for sg in (-1,1):
                pts=[(sg*.018*k,.064*k+self.lean(neck),neck+.008*k),(sg*.072*k,.069*k+self.lean(neck),neck-.018*k),(sg*.044*k,.101*k+self.lean(neck),neck-.070*k),(sg*.010*k,.080*k+self.lean(neck),neck-.040*k)]
                vi=[m.vertex(p,'torso',(i%2,i//2),.88) for i,p in enumerate(pts)];m.face(vi[0],vi[1],vi[2]);m.face(vi[0],vi[2],vi[3])
            points=[]
            for z in np.linspace(low+.025*k,neck-.065*k,7):
                rx,ry,cy=self.torso(z);points.append((0,cy+ry+offset+.004*k,z))
            m.ribbon(points,.012*k,'torso',dark=.90)
            for p in points[1:]:
                # Four-point faceted buttons are intentionally tiny.
                q=[m.vertex((p[0]+dx*k,p[1]+.002*k,p[2]+dz*k),'torso',shade=.63) for dx,dz in ((-.003,-.003),(.003,-.003),(.003,.003),(-.003,.003))]
                m.face(q[0],q[1],q[2]);m.face(q[0],q[2],q[3])
        if kind=='dress':self.skirt_into(m,H*.515,H*.27,.021*k)
        if kind=='swimsuit_onepiece':
            first=len(m.tri)
            for sg in (-1,1):
                pts=[];rx,ry,cy=self.torso(neck);xx=sg*.085*k
                arc=math.sqrt(max(.1,1-(xx/(rx+offset))**2))
                front_z=neck-.035*k*arc
                for a in np.linspace(0,math.pi,11):
                    base=front_z*(1-a/math.pi)+neck*(a/math.pi)
                    zz=base+(self.P['sh']+.014*k-base)*math.sin(a)
                    pts.append((xx,cy+(ry+offset)*arc*math.cos(a)+self.lean(zz)-self.lean(neck),zz))
                m.ribbon(pts,.026*k,'torso',dark=.90)
            self.brief_into(m,H*.542,H*.426,.010*k)
            m.preserve.update(range(first,len(m.tri)))
        return m.sew()

    def skirt_into(self,m,z0,z1,offset):
        # Panelled A-line: enough circumference to clear both moving thighs.
        first=len(m.tri);rx,ry,cy=self.torso(z0);rr=[]
        # Replace uniform rows with the hip outline and two lower drape rows.
        # The waist-based flare alone is narrower than fuller residents' hips.
        hip_levels=[z for z in self.body_levels() if z1<z<z0 and z>=self.H*.449]
        low_start=min([z0,*hip_levels]);zs=sorted({z0,z1,(low_start+z1)/2,*hip_levels},reverse=True)
        for z in zs:
            t=(z0-z)/(z0-z1);bx,by,cy=self.torso(z)
            wx=max(rx+offset+.068*self.k*t,bx+offset)
            wy=max(ry+offset+.10*self.k*t,by+offset)
            rr.append([self.outside_arm((wx*math.cos(a)*(1+.018*math.sin(a*8)*t),cy+wy*math.sin(a)*(1+.018*math.sin(a*8)*t),z)) for a in np.linspace(0,2*math.pi,20,endpoint=False)])
        m.loft(rr,'skirt',lod_rows=[i for i,z in enumerate(zs) if z>=self.H*.449],lod_angles=range(20))
        m.loft([rr[-1],[(x*1.008,y*1.008,z+.012*self.k) for x,y,z in rr[-1]]],'skirt',lod=False,shade=.82)
        m.preserve.update(range(first,len(m.tri)))

    def bottom(self,kind):
        m=Mesh(self.skin);H=self.H;k=self.k
        if kind=='skirt':self.skirt_into(m,H*.602,H*.285,.015*k);return m
        # Two pairs intentionally share a fitted cut: trousers/jeans and
        # shorts/board-style swim trunks. Their IDs, palettes and contexts remain
        # distinct while identical uploaded attributes and indices are reused.
        offset={'trousers':.014,'jeans':.014,'leggings':.006,'shorts':.014,'boxers':.010,'swim_trunks':.014}[kind]*k
        # These seated hip fits need 4 mm more actual cloth ease;
        # both complete LOD cuts retain the same body and clearance predicates.
        if self.pd['id'] in ('m_don','w_elder') and kind=='leggings':offset=.010*k
        # The matching tailored cuts need the same measured hip allowance.
        if self.pd['id']=='w_afro' and kind in ('trousers','jeans'):offset=.018*k
        z0=H*.60;zhip=H*.429-.004*k
        zs=sorted({zhip,z0,*[z for z in self.body_levels() if max(zhip,H*.449)<=z<z0]})
        rr,refs=self.tor_rings(zs,offset,n=16,folds=kind!='leggings')
        far_rows=[i for i,z in enumerate(zs) if i in (0,len(zs)-1) or abs(z-H*.466)<1e-7 or abs(z-H*.51)<1e-7] if kind in ('trousers','jeans','leggings') else range(len(rr))
        if kind in ('shorts','swim_trunks'):far_rows=[i for i,z in enumerate(zs) if abs(z-H*0.449)>1e-7]
        m.loft(rr,'torso',references=refs,solid=True,open_caps=(1,),lod_rows=far_rows,lod_angles=range(16))
        m.loft([rr[-1],[(x*1.008,y*1.008,z-.024*k) for x,y,z in rr[-1]]],'torso',lod=False,shade=.78)
        z1=self.P['ankle']+.022*k if kind in ('trousers','jeans','leggings') else H*(.375 if kind!='boxers' else .405)
        for sg in (-1,1):self.leg(m,sg,self.P['hip']+.024*k,z1,offset,rows=10 if z1<H*.3 else 6,far_hem=kind in ('trousers','jeans'))
        if kind in ('trousers','jeans','shorts','swim_trunks'):
            for sg in (-1,1):
                pts=[]
                for z in np.linspace(z0-.045*k,zhip+.025*k,4):
                    rx,ry,cy=self.torso(z);x=sg*rx*.66;yy=cy+ry*math.sqrt(1-.66**2)+offset+.007*k;pts.append((x,yy,z))
                m.ribbon(pts,.006*k,'torso',dark=.68)
        m=m.sew()
        if kind in ('trousers','jeans','leggings'):m.refine_skin_transitions(self.P['hip'],k)
        if self.pd['id']=='w_cocinera' and kind in ('trousers','jeans'):
            # One complete-cut hip panel needs a central skin sample when seated.
            # Keep the actual bind surface, contour and original vertices; the
            # new source row is the exact barycentre of this guarded triangle.
            triangle=m.far[185]
            if len(m.far)!=512 or tuple(triangle)!=(210,692,686):
                raise RuntimeError('The authored w_cocinera hip panel changed')
            actual=np.asarray([m.p[v] for v in triangle],dtype=float)
            relative=np.asarray([(0.,0.,0.),
                (.024227425456047058,-.023338481783866882,-.0032612085342407227),
                (-.002062961459159851,-.005647338926792145,-.00874018669128418)])
            if not np.allclose(actual-actual[0],relative,rtol=0,atol=2e-7):
                raise RuntimeError('The authored w_cocinera hip geometry changed')
            weights={}
            for v in triangle:
                for bone,value in m.w[v]:weights[bone]=weights.get(bone,0.)+value/3
            weights={bone:value for bone,value in weights.items() if value>1e-10}
            if len(weights)>4:raise RuntimeError('The hip barycentre exceeds four skin influences')
            total=sum(weights.values())
            weights=sorted(((bone,value/total) for bone,value in weights.items()),key=lambda row:(-row[1],row[0]))
            point=tuple(sum(m.p[v][axis] for v in triangle)/3 for axis in range(3))
            uv=tuple(sum(m.uv[v][axis] for v in triangle)/3 for axis in range(2))
            center=m.vertex(point,'torso',uv,weights=weights)
            m.c[center]=tuple(sum(m.c[v][axis] for v in triangle)/3 for axis in range(4))
            a,b,c=triangle;m.far[185:186]=[(a,b,center),(b,c,center),(c,a,center)]
        return m

    def brief_into(self,m,z0,z1,offset):
        # Continuous waistband plus front/back panels and a broad crotch bridge.
        rr,refs=self.tor_rings([z0-.022*self.k,z0],offset,n=16)
        m.loft(rr,'torso',references=refs,shade=.85,lod_angles=range(16))
        # Near-only raised waistband stitching leaves a genuinely simpler far
        # garment while both retain the body-matched base cross-section.
        m.loft([[(x*1.004,y*1.004,z+.002*self.k) for x,y,z in rr[-1]],[(x*1.004,y*1.004,z-.003*self.k) for x,y,z in rr[-1]]],'torso',lod=False,shade=.8)
        rows=[];top=z0-.018*self.k;bottom=min(z1,self.H*.429-.004*self.k)
        levels=sorted({top,bottom,*[z for z in self.body_levels() if bottom<z<top]},reverse=True)
        for z in levels:
            t=(top-z)/(top-bottom);rx,ry,cy=self.torso(z);width=rx*(1-.72*t)
            rows.append((z,width,ry+offset,cy))
        for sg in (-1,1):
            ids=[]
            for j,(z,w,ry,cy) in enumerate(rows):
                row=[]
                for i in range(7):
                    x=w*(-1+2*i/6);y=cy+sg*ry*math.sqrt(max(.15,1-(x/(self.torso(z)[0]+offset))**2))
                    row.append(m.vertex((x,y,z),'torso',(i/6,j/max(1,len(rows)-1)),.96))
                ids.append(row)
            for a,b in zip(ids,ids[1:]):
                for i in range(6):
                    if sg>0:m.face(a[i],b[i+1],a[i+1]);m.face(a[i],b[i],b[i+1])
                    else:m.face(a[i],a[i+1],b[i+1]);m.face(a[i],b[i+1],b[i])
            m.far.extend(m.tri[-(len(rows)-1)*12:])
        # Crotch is deliberately an ordinary smooth fabric panel, no anatomy.
        z,w,ry,cy=rows[-1]
        ids=[m.vertex((x,cy+y,z),'torso') for x,y in ((-w,-ry),(w,-ry),(w,ry),(-w,ry))]
        m.face(ids[0],ids[1],ids[2]);m.face(ids[0],ids[2],ids[3]);m.far.extend(m.tri[-2:])

    def brief(self,kind):
        m=Mesh(self.skin);self.brief_into(m,self.H*(.563 if kind=='briefs' else .542),self.H*.426,(.008 if kind=='briefs' else .009)*self.k);return m

    def bra(self,kind):
        m=Mesh(self.skin);H=self.H;k=self.k;z0=H*.694;z1=H*.775
        rr,ref=self.tor_rings(np.linspace(z0,z1,5),.010*k,n=20);m.loft(rr,'torso',references=ref)
        m.loft([rr[0],[(x*1.006,y*1.006,z+.013*k) for x,y,z in rr[0]]],'torso',lod=False,shade=.78)
        # Shoulder straps curve over the shoulder, visibly distinct from a tube.
        for sg in (-1,1):
            pts=[]
            for a in np.linspace(0,math.pi,11):
                zz=z1+(self.P['sh']+.014*k-z1)*math.sin(a);xx=sg*.085*k;yy=.102*k*math.cos(a)+self.lean(zz)
                pts.append((xx,yy,zz))
            m.ribbon(pts,.018*k if kind=='bra' else .012*k,'torso',dark=.89)
        return m

    def footwear(self,kind):
        m=Mesh(self.skin);k=self.k
        for sg in (-1,1):
            sd='_l' if sg<0 else '_r'
            if kind=='socks_pair':
                zs=np.linspace(self.P['ankle']-.003,self.P['ankle']+.17*k,6)
                rr=[ring(sg*self.hx,0,z,self.leg_radius(z)+.007*k,self.leg_radius(z)*.96+.007*k,12) for z in zs]
                m.loft(rr,'shin'+sd);m.loft([rr[-1],[(x*1.004,y*1.004,z-.022*k) for x,y,z in rr[-1]]],'shin'+sd,lod=False,shade=.82)
                m.ellipsoid((sg*self.hx,.075*k,.043*k),(.054*k,.141*k,.047*k),'foot'+sd,n=12,rows=6)
            else:
                # Horizontal contours leave an actual ankle opening. A closed
                # heel-to-toe tube would roof across the incoming lower leg.
                def shoe_skin(co, part):
                    if not part.startswith('shoe'):
                        return self.skin(co, part)
                    side=part[-2:]
                    # Collar follows the body's anatomical shin/foot blend;
                    # the forward vamp and sole remain articulated by foot.
                    mix=max(0.,min(1.,(.085*k-co[1])/(.04*k)))
                    weights={bn:ww*mix for bn,ww in self.skin(co,'shin'+side)}
                    weights['foot'+side]=weights.get('foot'+side,0.)+1-mix
                    return [(bn,ww) for bn,ww in weights.items() if ww>1e-8]
                m.skin=shoe_skin
                n=20; rr=[]; margin=.009*k
                zs=[q*k for q in (-.001,.014,.030,.046,.060,.071,.079,.088)]
                zs += [self.P['ankle']+.009*k,self.P['ankle']+.030*k]
                for z in zs:
                    f=math.sqrt(max(0.,1-(max(0.,z-.050*k)/(.041*k))**2))
                    # Half-plane support envelope encloses the actual foot and
                    # lower shin cross-sections without filling the ankle hole.
                    leg=self.leg_radius(max(z,self.P['ankle']))
                    supports=[]
                    for j in range(n):
                        a=2*math.pi*(j+.5)/n;nx,ny=math.cos(a),math.sin(a)
                        foot=(.075*k*ny+math.hypot(.046*k*f*nx,.133*k*f*ny)) if z<=.091*k else -1e6
                        shin=math.hypot(leg*nx,leg*.96*ny)
                        supports.append(max(foot,shin)+margin)
                    row=[]
                    for j in range(n):
                        a0=2*math.pi*(j-.5)/n;a1=2*math.pi*(j+.5)/n
                        c0,s0,c1,s1=math.cos(a0),math.sin(a0),math.cos(a1),math.sin(a1)
                        h0,h1=supports[(j-1)%n],supports[j];det=c0*s1-s0*c1
                        row.append((sg*self.hx+(h0*s1-s0*h1)/det,(c0*h1-h0*c1)/det,z))
                    rr.append(row)
                first=len(m.tri)
                m.loft(rr,'shoe'+sd,caps=False,lod_rows=list(range(len(rr))))
                upper_faces=m.tri[first:]
                # Narrow padded rim is open too; it never covers the shin.
                m.loft([rr[-1],[(sg*self.hx+(x-sg*self.hx)*1.035,y*1.035,z-.008*k) for x,y,z in rr[-1]]],'shoe'+sd,lod=False,shade=.82)
                sole=[[(sg*self.hx+dx*k,yy*k,zz*k) for dx,yy in ((-.030,-.07),(.03,-.07),(.058,-.015),(.062,.09),(.054,.16),(.031,.228),(-.031,.228),(-.054,.16),(-.062,.09),(-.058,-.015))] for zz in (-.014,-.001)]
                m.loft(sole,'foot'+sd,caps=True,shade=.5)
                def vamp_height(x,y):
                    heights=[]
                    for ai,bi,ci in upper_faces:
                        a,b,c=(m.p[v] for v in (ai,bi,ci))
                        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                        if abs(den)<1e-12:continue
                        u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
                        v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
                        if min(u,v,1-u-v)>=-1e-7:heights.append(u*a[2]+v*b[2]+(1-u-v)*c[2])
                    return max(heights)+.003*k
                for y in (.065,.090,.115,.140):
                    points=[]
                    for dx in np.linspace(-.027,.027,5):
                        x=sg*self.hx+dx*k;yy=y*k;points.append((x,yy,vamp_height(x,yy)))
                    m.ribbon(points,.007*k,'shoe'+sd,dark=.96)
        return m

    def hat(self,kind,head_bounds):
        m=Mesh(self.skin);k=self.k
        lo,hi=head_bounds;cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2
        # Retained head silhouettes need a small individual crown allowance.
        # Keep these fitted crown samples in both LODs: coarser chords cut the hair.
        ease={'m_afro':.004,'m_panadero':.004,'m_vendedor':.004,'m_abuelo':.004,
              'w_farmaceutica':.008,'w_elder':.008}.get(self.pd['id'],0.)*k
        fitted_crown=ease>0.
        rx=max(abs(lo[0]-cx),abs(hi[0]-cx))+.015*k+ease;ry=max(abs(lo[1]-cy),abs(hi[1]-cy))+.015*k+ease
        z=self.P['H']-.070*k
        # The two taller retained hairstyles need measured vertical crown room.
        height_ease={'w_farmaceutica':.017,'w_elder':.024}.get(self.pd['id'],0.)
        crown=max(.105*k,hi[2]-z+.015*k)+ease+height_ease
        rr=[]
        for t in np.linspace(0,1,7):
            s=math.sqrt(max(.015,1-t*t));rr.append(ring(cx,cy,z+t*crown,rx*s,ry*s,20))
        m.loft(rr,'head',caps=False,lod_rows=range(7) if fitted_crown else None,lod_angles=range(20) if fitted_crown else None)
        top=m.vertex((cx,cy,z+crown+.003*k),'head')
        for j in range(20):m.face(top,6*20+j,6*20+(j+1)%20)
        if kind=='cap':
            rows=[]
            for t in (0,.5,1):
                rows.append([(cx+(rx+.015*k*t)*math.cos(a),cy+(ry+.09*k*t)*math.sin(a),z-.005*k*t-.008*k*abs(math.cos(a))) for a in np.linspace(0,math.pi,13)])
            m.loft(rows,'head',closed=False,shade=.87)
        else:
            brim=.078*k if kind=='sun_hat' else .105*k
            m.loft([ring(cx,cy,z,rx,ry,24),ring(cx,cy,z-.008*k,rx+brim*.55,ry+brim*.55,24),ring(cx,cy,z-.025*k,rx+brim,ry+brim,24)],'head',shade=.90)
        m.loft([ring(cx,cy,z+.006*k,rx+.002*k,ry+.002*k,20),ring(cx,cy,z+.027*k,rx*.985+.002*k,ry*.985+.002*k,20)],'head',lod=False,shade=.67)
        return m

    def garment(self,kind,head_bounds):
        if kind in ('tshirt','shirt','blouse','jumper','dress','rash_vest','swimsuit_onepiece'):return self.top(kind)
        if kind in ('trousers','jeans','skirt','shorts','leggings','boxers','swim_trunks'):return self.bottom(kind)
        if kind in ('briefs','bikini_bottom'):return self.brief(kind)
        if kind in ('bra','bikini_top'):return self.bra(kind)
        if kind in ('socks_pair','shoes'):return self.footwear(kind)
        if kind in ('cap','sun_hat','straw_hat'):return self.hat(kind,head_bounds)
        raise ValueError('Unknown garment: '+kind)
