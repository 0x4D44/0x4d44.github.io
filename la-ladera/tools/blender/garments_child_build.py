"""Original 6–10 year child garment objects, sharing the adult atlas and GLB contract.

Run headless through tools/nice.mjs, with at most two Blender threads. Geometry
is generated at a documented adult reference length and uniformly scaled by 0.6.
The adult library is read for its palette only and is never rebuilt or replaced.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import garments_build as G

F = G.F
ROOT = G.ROOT
MODELS = G.MODELS
DIRECTORY = 'garments-child'
MANIFEST = 'manifest.garments-child.json'
CATALOGUE = HERE / 'garments-child.catalog.json'
STATES = G.STATES


def long_top(hood=False, cardigan=False):
    neck = [(-.24,.02),(-.12,.035),(-.10,.11),(0,.16),(.10,.11),(.12,.035),(.24,.02)]
    if hood:
        neck = [(-.24,.02),(-.15,.01),(-.15,-.06),(-.10,-.13),(0,-.16),(.10,-.13),(.15,-.06),(.15,.01),(.24,.02)]
    if cardigan:
        neck = [(-.24,.02),(-.12,.025),(0,.30),(.12,.025),(.24,.02)]
    return neck + [(.35,.21),(.50,.73),(.44,.82),(.27,.40),(.25,.98),(.12,1),(-.12,1),(-.25,.98),(-.27,.40),(-.44,.82),(-.50,.73),(-.35,.21)]


def outline_for(pattern):
    if pattern in ('tshirt','shirt','polo','rash_vest'):
        return [G.tshirt()]
    if pattern in ('hoodie','pyjama_top','cardigan'):
        return [long_top(pattern == 'hoodie', pattern == 'cardigan')]
    if pattern in ('trousers','jeans','pyjama_bottoms'):
        return [G.pants(long=True)]
    if pattern in ('shorts','swim_trunks'):
        return [G.pants()]
    if pattern == 'skirt':
        return [[(-.32,0),(.32,0),(.33,.10),(.50,.97),(.25,1),(0,.985),(-.25,1),(-.50,.97),(-.33,.10)]]
    if pattern == 'pinafore':
        return [[(-.23,0),(-.13,0),(-.12,.18),(.12,.18),(.13,0),(.23,0),(.25,.23),(.30,.38),(.50,.97),(.25,1),(0,.985),(-.25,1),(-.50,.97),(-.30,.38),(-.25,.23)]]
    if pattern == 'dress':
        return [[(-.24,.01),(-.14,.025),(-.11,.09),(0,.12),(.11,.09),(.14,.025),(.24,.01),(.43,.12),(.39,.25),(.25,.20),(.28,.40),(.50,.97),(.25,1),(0,.985),(-.25,1),(-.50,.97),(-.28,.40),(-.25,.20),(-.39,.25),(-.43,.12)]]
    if pattern in ('socks_pair','swimsuit_onepiece'):
        return G.shapes(pattern)
    raise ValueError('No original child pattern: ' + pattern)


def is_open(pattern, a, b):
    x=(a[0]+b[0])/2; v=(a[1]+b[1])/2
    if pattern in ('tshirt','shirt','polo','rash_vest'):
        return G.open_edge('tshirt',a,b)
    if pattern in ('hoodie','pyjama_top','cardigan'):
        return (abs(x)<.13 and v<.31) or (abs(x)>.43 and v>.70) or v>.94
    if pattern in ('trousers','jeans','pyjama_bottoms'):
        return G.open_edge('leggings',a,b)
    if pattern in ('shorts','swim_trunks','socks_pair','swimsuit_onepiece'):
        return G.open_edge(pattern,a,b)
    if pattern in ('skirt','pinafore','dress'):
        return v<.025 or v>.94 or (pattern!='skirt' and abs(x)<.14 and v<.20)
    return False


def cloth(item, state):
    """Two relaxed panels, open neck/cuffs/waist, sewn edges and modelled details."""
    pattern=item['pattern']; width=item['width']/item['scale']; length=item['adultReferenceLength']
    vertices,faces,uv,colors=[],[],[],[]
    outlines=outline_for(pattern)
    hung=state=='hung'
    normal=Vector((0,0,1) if hung else (0,1,0))
    for pi,outline in enumerate(outlines):
        coords,ff,boundary=G.polygon_grid(outline,8 if len(outlines)==1 else 6,11 if len(outlines)==1 else 9)
        bake_id = 'tshirt' if pattern in ('shirt','polo','hoodie','pyjama_top','cardigan','dress','rash_vest') else pattern
        vv,ff=G.bake_panel(coords,ff,width,length,'flat' if state=='folded' else state,bake_id,pi)
        if pattern=='socks_pair' and pi:
            vv=[tuple(Vector(p)+normal*.009) for p in vv]
        # Pleats are geometric, modest folds across the skirt, not extra textures.
        if pattern in ('skirt','pinafore'):
            vv=[tuple(Vector(p)+normal*(.009*math.sin((x+.5)*math.pi*8)*min(1,max(0,(v-.28)*3)))) for p,(x,v) in zip(vv,coords)]
        start=len(vertices)
        localuv=[(max(0,min(1,x+.5)),max(0,min(1,v))) for x,v in coords]
        vertices.extend(vv);faces.extend([tuple(start+i for i in f) for f in ff]);uv.extend(localuv)
        colors.extend([G.linear(.96-.035*math.sin(x*37+v*29)**2) for x,v in coords])
        back=len(vertices)
        for p,(x,v),q in zip(vv,coords,localuv):
            thickness=.003+.009*math.sin(math.pi*max(0,min(1,v)))**2*max(0,1-abs(x)*1.7)
            vertices.append(tuple(Vector(p)-normal*thickness));uv.append(q);colors.append(G.linear(.86))
        faces.extend([tuple(back+i for i in reversed(f)) for f in ff])
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            if not is_open(pattern,coords[a],coords[b]):
                faces.extend([(start+a,start+b,back+b),(start+a,back+b,back+a)])
        G.add_ribbon(vertices,faces,uv,colors,[(vv[i],localuv[i]) for i in boundary],.72,.0022,True,hung)

        def sample(x,v,lift=.003):
            for f in ff:
                a,b,c=[coords[i] for i in f]
                den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(den)<1e-10: continue
                wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(v-c[1]))/den
                wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(v-c[1]))/den
                wc=1-wa-wb
                if min(wa,wb,wc)>=-1e-5:
                    return tuple(Vector(vv[f[0]])*wa+Vector(vv[f[1]])*wb+Vector(vv[f[2]])*wc+normal*lift)
            near=min(range(len(coords)),key=lambda i:(coords[i][0]-x)**2+(coords[i][1]-v)**2)
            return tuple(Vector(vv[near])+normal*lift)

        def seam(path,shade=.66,thickness=.0025):
            G.add_ribbon(vertices,faces,uv,colors,[(sample(x,v), (max(0,min(1,x+.5)),max(0,min(1,v)))) for x,v in path],shade,thickness,hung=hung)

        def patch(poly,shade=.84,lift=.004):
            at=len(vertices)
            for x,v in poly:
                vertices.append(sample(x,v,lift));uv.append((max(0,min(1,x+.5)),max(0,min(1,v))));colors.append(G.linear(shade))
            for i in range(1,len(poly)-1): faces.append((at,at+i,at+i+1))

        def button(x,v):
            center=Vector(sample(x,v,.005));at=len(vertices)
            vertices.append(tuple(center));uv.append((x+.5,v));colors.append(G.linear(.59))
            for i in range(6):
                a=math.tau*i/6; delta=Vector((math.cos(a)*.005,math.sin(a)*.005,0) if hung else (math.cos(a)*.005,0,math.sin(a)*.005))
                vertices.append(tuple(center+delta));uv.append((x+.5,v));colors.append(G.linear(.77))
            for i in range(6):faces.append((at,at+1+i,at+1+(i+1)%6))

        if pi: continue
        # Collar leaves and short/full button plackets distinguish school garments.
        if pattern in ('shirt','polo','pyjama_top'):
            patch([(-.15,.045),(-.035,.15),(-.07,.255),(-.19,.14)],.82)
            patch([(.15,.045),(.19,.14),(.07,.255),(.035,.15)],.82)
            end=.88 if pattern in ('shirt','pyjama_top') else .37
            seam([(0,.17),(0,end)],.70,.006)
            for v in ([.27,.39,.51,.63,.75,.86] if end>.5 else [.27,.35]):button(.008,v)
        if pattern in ('shirt','pyjama_top'):
            seam([(-.22,.34),(-.08,.34),(-.085,.48),(-.15,.50),(-.22,.48),(-.22,.34)],.72)
        if pattern=='cardigan':
            seam([(-.12,.04),(0,.30),(0,.94)],.66,.007)
            seam([(.12,.04),(0,.30)],.66,.007)
            for v in (.40,.52,.64,.76,.88):button(.01,v)
            seam([(-.20,.64),(-.08,.64),(-.08,.78),(-.20,.78),(-.20,.64)],.72)
            seam([(.20,.64),(.08,.64),(.08,.78),(.20,.78),(.20,.64)],.72)
        if pattern=='hoodie':
            patch([(-.10,.015),(-.07,-.055),(0,-.10),(.07,-.055),(.10,.015),(.065,.15),(0,.19),(-.065,.15)],.64)
            seam([(-.10,.015),(-.07,-.055),(0,-.10),(.07,-.055),(.10,.015),(.065,.15),(0,.19),(-.065,.15),(-.10,.015)],.77,.007)
            seam([(-.19,.62),(-.13,.55),(.13,.55),(.19,.62),(.17,.79),(-.17,.79),(-.19,.62)],.68,.004)
        if pattern in ('trousers','jeans','shorts','swim_trunks','pyjama_bottoms','skirt'):
            seam([(-.41,.07),(-.20,.065),(0,.065),(.20,.065),(.41,.07)],.70,.004)
        if pattern in ('trousers','jeans','shorts'):
            seam([(-.40,.13),(-.28,.25)],.70);seam([(.40,.13),(.28,.25)],.70)
            seam([(0,.07),(0,.33)],.68)
            button(.025,.08)
        if pattern=='jeans':
            seam([(-.40,.23),(-.37,.60),(-.35,.94)],.72)
            seam([(.40,.23),(.37,.60),(.35,.94)],.72)
        if pattern in ('dress','pinafore'):
            seam([(-.28,.40),(0,.39),(.28,.40)],.67,.004)
        if pattern=='pinafore':
            for x in (-.18,.18): button(x,.07)
            seam([(-.13,.24),(.13,.24),(.12,.34),(-.12,.34),(-.13,.24)],.72)
        if pattern in ('tshirt','shirt','polo','rash_vest','hoodie','pyjama_top','cardigan','dress','pinafore'):
            seam([(-.22,.91),(0,.93),(.22,.91)],.79,.002)
        if pattern=='socks_pair':seam([(-.35,.13),(.08,.13)],.72,.003)
    return vertices,faces,uv,colors


class Solid:
    """A single material/mesh accumulator for the two structured accessories."""
    def __init__(self):self.v=[];self.f=[];self.uv=[];self.c=[]
    def vertex(self,p,shade=.92):
        self.v.append(tuple(p));self.uv.append((max(0,min(1,.5+p[0])),max(0,min(1,.5+p[2]))));self.c.append(G.linear(shade));return len(self.v)-1
    def face(self,points,shade=.92):
        ids=[self.vertex(p,shade) for p in points]
        for i in range(1,len(ids)-1):self.f.append((ids[0],ids[i],ids[i+1]))
    def box(self,x,y,z,w,h,d,shade=.92,bevel=.015):
        # Four bevelled corner rings retain a rounded fabric/sole silhouette.
        ring=[(-w/2+bevel,-d/2),(w/2-bevel,-d/2),(w/2,-d/2+bevel),(w/2,d/2-bevel),(w/2-bevel,d/2),(-w/2+bevel,d/2),(-w/2,d/2-bevel),(-w/2,-d/2+bevel)]
        loops=[]
        for yy,factor in ((y, .90),(y+bevel,1),(y+h-bevel,1),(y+h,.90)):
            loops.append([self.vertex((x+a*factor,yy,z+b*factor),shade) for a,b in ring])
        for a,b in zip(loops,loops[1:]):
            for i in range(8):j=(i+1)%8;self.f.extend([(a[i],a[j],b[j]),(a[i],b[j],b[i])])
        for loop,reverse in ((loops[0],True),(loops[-1],False)):
            for i in range(1,7):self.f.append(tuple(reversed((loop[0],loop[i],loop[i+1]))) if reverse else (loop[0],loop[i],loop[i+1]))
    def ribbon(self,points,width=.015,shade=.65):
        for a,b in zip(points,points[1:]):
            a=Vector(a);b=Vector(b);direction=b-a
            side=direction.cross(Vector((0,1,0)))
            if side.length<1e-8:side=Vector((1,0,0))
            side.normalize();side*=width/2
            self.face([a-side,b-side,b+side,a+side],shade)
    def result(self):return self.v,self.f,self.uv,self.c


def shoes(state):
    s=Solid()
    for x in (-.081,.081):
        s.box(x,0,0,.125,.023,.30,.64,.018)
        # Open heel/top: ring loft leaves a visible dark inner mouth.
        rings=[(.018,.060,.145,.002),(.050,.057,.140,.002),(.090,.051,.100,-.030),(.113,.043,.070,-.059)]
        loops=[]
        for y,rx,rz,z in rings:
            loops.append([s.vertex((x+rx*math.cos(a),y,z+rz*math.sin(a)),.91 if y<.10 else .74) for a in [math.tau*i/12 for i in range(12)]])
        for a,b in zip(loops,loops[1:]):
            for i in range(12):j=(i+1)%12;s.f.extend([(a[i],a[j],b[j]),(a[i],b[j],b[i])])
        s.face([(x-.033,.068,-.115),(x+.033,.068,-.115),(x+.038,.062,-.015),(x-.038,.062,-.015)],.48)
        s.ribbon([(x-.052,.097,-.015),(x, .106,.005),(x+.052,.097,-.015)],.020,.73)
        s.ribbon([(x-.041,.075,.040),(x,.083,.055),(x+.041,.075,.040)],.010,.74)
        s.ribbon([(x-.02,.111,-.10),(x-.02,.140,-.12),(x+.02,.140,-.12),(x+.02,.111,-.10)],.010,.69)
    v,f,uv,c=s.result()
    if state=='hung':v=[(x,-z,y) for x,y,z in v]
    return v,f,uv,c


def backpack(state):
    s=Solid()
    # Laid on its padded back; the domed front and zip pocket face upwards.
    s.box(0,0,0,.40,.13,.50,.92,.045)
    s.box(0,.132,.105,.30,.045,.205,.85,.025)
    s.ribbon([(-.13,.183,.055),(0,.185,.050),(.13,.183,.055)],.006,.60)
    s.ribbon([(-.17,.129,-.19),(-.18,.137,-.06),(-.18,.137,.12),(-.15,.129,.22)],.005,.69)
    s.ribbon([(.17,.129,-.19),(.18,.137,-.06),(.18,.137,.12),(.15,.129,.22)],.005,.69)
    # Carry loop and two broad shoulder straps, clear of the bag back.
    s.ribbon([(-.055,.08,-.22),(-.055,.08,-.29),(.055,.08,-.29),(.055,.08,-.22)],.018,.65)
    for x in (-.12,.12):
        s.ribbon([(x,.012,-.18),(x*1.50,-.025,-.05),(x*1.50,-.025,.12),(x,.012,.20)],.035,.69)
    v,f,uv,c=s.result()
    if state=='hung':v=[(x,-z,y) for x,y,z in v]
    return v,f,uv,c


def geometry(item,state):
    pattern=item['pattern']
    if pattern=='cap':return G.hat_geometry({'id':'cap'},state)
    if pattern=='shoes':return shoes(state)
    if pattern=='backpack':return backpack(state)
    return cloth(item,state)


def protect_lod_normals(ob):
    """Keep thin cloth rims from smearing back-face normals over large LOD faces.

    Decimation preserves the sewn front/back boundary but leaves few vertices
    near cuffs and hems. Splitting only geometric creases prevents those opposing
    normals being averaged together. Positions and triangle counts are unchanged.
    """
    G.activate(ob)
    split=ob.modifiers.new('Preserve cloth rim normals','EDGE_SPLIT')
    split.split_angle=math.radians(50)
    split.use_edge_angle=True
    split.use_edge_sharp=False
    bpy.ops.object.modifier_apply(modifier=split.name)


def assortment_data(items):
    by_id={a['id']:a for a in items}
    def stock(ident,state='folded',variant=None,support=None):
        key='child_'+ident; item=by_id[key]
        result={'asset':f'garment_{key}_{state}','variant':variant or item['variants'][0],'count':1,'sizeTag':'child'}
        if support:result['support']=support
        return result
    recipes=[
        ('child_drawer_school','drawer',['dresser_4','dresser_low'],['child_bedroom'],[stock(i) for i in ('school_shirt','school_polo','school_trousers','school_shorts','socks_pair')]),
        ('child_drawer_daily','drawer',['dresser_4','dresser_low'],['child_bedroom'],[stock(i) for i in ('tshirt','hoodie','jeans','skirt','cardigan')]),
        ('child_drawer_sleep','drawer',['dresser_4','dresser_low'],['child_bedroom'],[stock(i) for i in ('pyjama_top','pyjama_bottoms')]),
        ('child_drawer_swimwear','drawer',['dresser_4','dresser_low'],['child_bedroom'],[stock(i) for i in ('swim_trunks','swimsuit_onepiece','rash_vest')]),
        ('child_wardrobe_daily','wardrobe',['wardrobe_2','wardrobe_3','wardrobe_metal'],['child_bedroom'],[stock(i,'hung',support='hanger') for i in ('school_shirt','pinafore','dress','hoodie','cardigan')]),
        ('child_wardrobe_accessories','wardrobe',['wardrobe_2','wardrobe_3'],['child_bedroom'],[stock(i,'flat',support='shelf') for i in ('cap','shoes','backpack')]),
        ('child_school_locker','wardrobe',['locker_pair','cubby_shelf'],['school_locker'],[stock('school_polo'),stock('school_shorts'),stock('socks_pair'),stock('backpack','flat',support='shelf'),stock('cap','flat',support='shelf'),stock('shoes','flat',support='shelf')]),
    ]
    return {'schemaVersion':1,'sizeTag':'child','ageRange':[6,10],'roomKinds':['child_bedroom','school_locker'],
        'placementPolicy':{'targetSize':'child','fit':'Use the measured state dimensions; reject garments that do not fit the container or support.',
            'roomKinds':['child_bedroom','school_locker'],'schoolLocker':'Use the child_school_locker recipe for school lockers/cubbies; no adult garment fallback.',
            'childBedroom':'Use child drawers and wardrobes; a separate furnishing pass decides whether to place loose clothes on beds or floors.'},
        'bindings':[{'id':ident,'kind':kind,'sizeTag':'child','roomKinds':rooms,'catalogueKeys':keys,'items':entries} for ident,kind,keys,rooms,entries in recipes]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=MODELS)
    parser.add_argument('--catalogue',type=Path,default=CATALOGUE)
    args=parser.parse_args(F.argv_after_dashes() if '--' in sys.argv else [])
    out=args.out.resolve(); catalogue=json.loads(args.catalogue.read_text());items=catalogue['garments']
    if len(items)!=20 or len({a['id'] for a in items})!=20:raise ValueError('The complete child catalogue must contain the 20 original garment IDs')
    if any(a['sizeTag']!='child' or a['scale']!=.6 or abs(a['length']-.6*a['adultReferenceLength'])>1e-8 for a in items):raise ValueError('Invalid child size metadata')
    manifest={'schemaVersion':1,'set':'garments-child','sizeTag':'child','ageRange':[6,10],'scale':.6,'scope':'objects-only',
        'baseCommit':'8f93ade042cdb4bfc1a796b889bbe39786241ebf','catalogue':'../../tools/blender/garments-child.catalog.json','files':[],
        'roomKinds':['child_bedroom','school_locker'],'atlas':{'file':'garments/prints.png','width':256,'height':256,'embedded':False,'shared':True},
        'palette':'garments/palette.json','assortments':DIRECTORY+'/assortments.json','limits':catalogue['limits'],
        'clothBake':{'blender':bpy.app.version_string,'frames':G.BAKE_FRAMES,'sequential':True,'quality':5,'staticOnly':True},
        'lodPolicy':{'switchDistanceMetres':8,'cullDistanceMetres':30,'tinyItemsCullDistanceMetres':16,'maxConcurrentDetailItems':24}}
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.garments-child-stage-',dir=out.parent) as tmp:
        stage=Path(tmp);dest=stage/DIRECTORY;dest.mkdir()
        # Only the temporary validation tree needs copies of the shared inputs.
        shared=stage/'garments';shared.mkdir()
        for name in ('palette.json','prints.png'):shutil.copy2(MODELS/'garments'/name,shared/name)
        (dest/'assortments.json').write_text(json.dumps(assortment_data(items),indent=2)+'\n')
        (dest/'CREDITS.md').write_text('# Child garment objects\n\nOriginal generated geometry and details by the La Ladera project, dedicated to CC0-1.0.\nSource: `la-ladera/tools/blender/garments_child_build.py` and `garments-child.catalog.json`.\nShared original atlas: `../garments/prints.png`; no textures are embedded in these GLBs.\nNo third-party meshes, logos, photographs, figures, rigs or animations are included.\n')
        for state in STATES:
            F.reset();assets={};lows=[]
            for item in items:
                if state not in item['states']:continue
                key=f"garment_{item['id']}_{state}"
                vertices,faces,uv,colors=geometry(item,state)
                root=bpy.data.objects.new(key,None);bpy.context.scene.collection.objects.link(root)
                root['sizeTag']='child';root['garment']=item['id'];root['state']=state
                ob=G.create_mesh(key+'-tint-0',vertices,faces,uv,colors,root)
                if state=='folded':
                    alias='leggings' if item['pattern'] in ('trousers','jeans','pyjama_bottoms') else 'nightdress' if item['pattern'] in ('dress','pinafore') else 'tshirt'
                    G.fold_object(ob,{'id':alias,'width':item['width']/item['scale'],'length':item['adultReferenceLength']})
                for vertex in ob.data.vertices:vertex.co*=item['scale']
                G.triangulate(ob);G.simplify(ob,880);G.normalize_object(ob,state)
                origin='hang-point' if state=='hung' else 'floor-centre'
                data={'node':key,'garment':item['id'],'state':state,'sizeTag':'child','scale':item['scale'],'adultReferenceLength':item['adultReferenceLength'],
                    **G.metadata(ob,origin),'variants':item['variants'],'drawCalls':1}
                if item.get('adultReferenceId'):data['adultReferenceId']=item['adultReferenceId']
                low=ob.copy();low.data=ob.data.copy();low.parent=None;bpy.context.scene.collection.objects.link(low);low.name=key+'_lod-tint-0'
                G.simplify(low,min(220,max(40,int(data['triangles']*.34))));G.normalize_object(low,state)
                protect_lod_normals(low)
                lowroot=bpy.data.objects.new(key+'_lod',None);bpy.context.scene.collection.objects.link(lowroot);low.parent=lowroot
                data['lod']={'glb':f'{DIRECTORY}/garments_{state}_lod.glb','node':key+'_lod',**G.metadata(low,origin)}
                lows.append((lowroot,low));assets[key]=data
                print(f"{key}: {data['triangles']} / {data['lod']['triangles']} triangles",flush=True)
            for lowroot,low in lows:bpy.context.scene.collection.objects.unlink(lowroot);bpy.context.scene.collection.objects.unlink(low)
            glb=f'{DIRECTORY}/garments_{state}.glb';F.export_glb(str(stage/glb))
            for ob in list(bpy.context.scene.objects):bpy.data.objects.remove(ob,do_unlink=True)
            for lowroot,low in lows:bpy.context.scene.collection.objects.link(lowroot);bpy.context.scene.collection.objects.link(low)
            F.export_glb(str(dest/f'garments_{state}_lod.glb'))
            manifest['files'].append({'glb':glb,'sha256':hashlib.sha256((stage/glb).read_bytes()).hexdigest(),'assets':assets})
        (stage/MANIFEST).write_text(json.dumps(manifest,indent=2)+'\n')
        node=shutil.which('node')
        if not node:raise ValueError('Node is required for independent exported-byte validation')
        validation=stage/'validation.json'
        command=[node,str(HERE/'garments_validate.mjs'),'--child','--complete','--root',str(stage),'--catalogue',str(args.catalogue.resolve()),'--json',str(validation)]
        checked=subprocess.run(command,capture_output=True,text=True,timeout=180,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        print(checked.stdout,flush=True)
        if checked.returncode:raise ValueError('Independent child validation failed: '+checked.stderr)
        if not validation.is_file():raise ValueError('Validator produced no report; child process may be blocked')
        verified=json.loads(validation.read_text())
        if verified.get('ok') is not True or verified.get('assets')!=57:raise ValueError('Validator did not confirm all 57 child garment states')
        out.mkdir(parents=True,exist_ok=True);target=out/DIRECTORY;backup=stage/'previous-child-garments';had_previous=target.exists()
        if had_previous:os.replace(target,backup)
        try:
            os.replace(dest,target);os.replace(stage/MANIFEST,out/MANIFEST)
        except BaseException:
            if target.exists():shutil.rmtree(target)
            if had_previous:os.replace(backup,target)
            raise
        print(f"EXPORTED 20 child garments / 57 states; {verified['runtimeBytes']} bytes including the shared atlas/palette.",flush=True)


if __name__=='__main__':main()
