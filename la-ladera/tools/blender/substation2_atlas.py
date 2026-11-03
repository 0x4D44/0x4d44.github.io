"""One external substation PBR atlas, reusing existing repository surfaces.

Colour2048², normal/ORM1024². Original deterministic weathering and Spanish
lettering. Surface pigments multiply linear vertex colours. No game registry.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
SIZE,CELL,GUTTER=2048,512,16
NAMES=('steel','rust','paint','brown','grey','concrete','gravel','peeling',
       'rubber','oil','brick','wood','sign_danger','sign_access','sign_touch','plate')
REUSE={'rust':'rusty_iron.jpg','paint':'metal_painted.jpg','concrete':'concrete_bare.jpg',
       'peeling':'paint_peeling_soft.jpg','brick':'brick_red_solid.jpg','wood':'wood_old.jpg'}
PBR={'steel':(.44,.80),'rust':(.91,.17),'paint':(.67,.23),'brown':(.24,0),'grey':(.27,0),
     'concrete':(.96,0),'gravel':(.99,0),'peeling':(.78,.18),'rubber':(.89,0),'oil':(.20,.02),
     'brick':(.94,0),'wood':(.90,0),'sign_danger':(.62,.10),'sign_access':(.65,.10),
     'sign_touch':(.62,.10),'plate':(.41,.62)}
PIGMENT={'steel':(.88,.92,.93),'rust':(.74,.43,.25),'paint':(.64,.73,.65),
         'brown':(.50,.29,.17),'grey':(.80,.83,.81),'concrete':(.75,.74,.68),
         'gravel':(.78,.76,.68),'peeling':(.61,.72,.64),'rubber':(.17,.18,.17),
         'oil':(.30,.25,.18),'brick':(.84,.45,.28),'wood':(.58,.43,.28)}

def font(size,path=None):
    for p in [path,'/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              'C:/Windows/Fonts/arialbd.ttf','/Library/Fonts/Arial Bold.ttf']:
        if p and Path(p).is_file(): return ImageFont.truetype(p,size)
    raise RuntimeError('Unicode font required: pass --font with DejaVu Sans Bold')

def centered(draw,y,text,size,colour,font_path,width=512,x=0):
    f=font(size,font_path)
    while draw.textbbox((0,0),text,font=f)[2]>width-44:
        size-=1; f=font(size,font_path)
    box=draw.textbbox((0,0),text,font=f)
    draw.text((x+(width-box[2])/2,y),text,font=f,fill=colour)

def noise(rng,n=CELL):
    out=np.zeros((n,n),dtype=np.float32)
    for scale,weight in [(8,.48),(32,.26),(128,.15),(n,.11)]:
        arr=np.uint8(rng.uniform(0,255,(scale,scale)))
        out+=np.asarray(Image.fromarray(arr).resize((n,n),Image.Resampling.BICUBIC),dtype=np.float32)/255*weight
    return out

def texture(name,rng,font_path):
    n=noise(rng); h=.48+(n-.5)*.34
    if name in REUSE:
        src=ROOT/'assets/textures'/REUSE[name]
        grey=np.asarray(Image.open(src).convert('L').resize((CELL,CELL)),dtype=float)/255
        level=.84+(grey-grey.mean())*.56+(n-.5)*.08; h=grey*.48+n*.08
    elif name in ('brown','grey'):
        yy,xx=np.mgrid[:CELL,:CELL]
        level=.91+(n-.5)*.10-(np.sin(xx*.15)>.985)*.045; h=.5+(n-.5)*.025
    elif name=='steel':
        img=Image.new('L',(CELL,CELL),206); d=ImageDraw.Draw(img)
        for _ in range(2800):
            x,y=rng.integers(-20,CELL+20,2); r=int(rng.integers(3,20))
            d.polygon([(x-r,y),(x-r//3,y-r),(x+r,y-r//4),(x+r//3,y+r)],fill=int(rng.integers(173,236)))
        level=np.asarray(img.filter(ImageFilter.GaussianBlur(.6)),dtype=float)/255; h=.5+(level-.8)*.14
    elif name=='gravel':
        img=Image.new('L',(CELL,CELL),100); d=ImageDraw.Draw(img)
        for _ in range(2300):
            x,y=rng.integers(-10,CELL+10,2); r,q=rng.integers(3,12,2); value=int(rng.integers(154,246))
            d.polygon([(x-r,y-q//2),(x-r//2,y-q),(x+r,y-q//3),(x+r//2,y+q),(x-r//2,y+q)],fill=value,outline=value-35)
            d.line([(x-r//2,y-q+1),(x+r-1,y-q//3)],fill=min(value+15,255),width=1)
        level=np.asarray(img,dtype=float)/255; h=level
    elif name=='rubber': level=.78+(n-.5)*.18; h=.5+(n-.5)*.08
    elif name=='oil':
        yy,xx=np.mgrid[:CELL,:CELL]; d2=((xx-250)/215)**2+((yy-275)/175)**2
        level=np.clip(.40+.34*d2+(n-.5)*.22,.30,.86); h=.5+(n-.5)*.025
    else: level=.84+(n-.5)*.14
    arr=np.repeat(np.clip(level,0,1)[...,None],3,axis=2)
    img=Image.fromarray(np.uint8(np.clip(arr*np.asarray(PIGMENT.get(name,(1,1,1))),0,1)*255))
    if name.startswith('sign_') or name=='plate':
        d=ImageDraw.Draw(img); bg=(226,192,54) if name=='sign_danger' else (226,221,201)
        if name=='plate': bg=(160,170,164)
        d.rectangle((0,0,511,511),fill=bg)
        d.rounded_rectangle((22,22,489,489),radius=13,outline=(37,39,34),width=7)
        ink=(25,31,28)
        def txt(y,s,sz,c=ink,**kw): centered(d,y,s,sz,c,font_path,**kw)
        if name=='sign_danger':
            d.polygon([(256,105),(137,295),(375,295)],fill=(35,36,29))
            d.polygon([(256,124),(156,283),(356,283)],fill=(241,207,54))
            d.polygon([(265,150),(225,221),(250,221),(235,265),(294,199),(265,199)],fill=(29,30,26))
            txt(37,'PELIGRO',51); txt(317,'ALTA TENSIÓN',45); txt(390,'132 000 V',48)
        elif name=='sign_access':
            d.rectangle((28,28,483,142),fill=(141,43,32))
            txt(49,'PROHIBIDO',46,(247,239,214)); txt(177,'EL PASO',60)
            txt(295,'SOLO PERSONAL',30); txt(345,'AUTORIZADO',35)
        elif name=='sign_touch':
            txt(88,'NO TOCAR',65,(150,43,30)); txt(226,'EQUIPO',47); txt(297,'ENERGIZADO',43)
        else:
            txt(29,'TRANSFORMADOR',21); txt(58,'132 / 33 kV  ·  40 MVA',23)
            txt(89,'ACEITE  ·  ONAN / ONAF',19); txt(118,'SERIE LL-040  ·  1984',19)
            d.line((26,153,486,153),fill=(40,47,42),width=3)
            txt(165,'TRANSFORMADOR',21); txt(194,'33 / 11 kV  ·  15 MVA',23)
            txt(228,'ACEITE  ·  SERIE LL-015',19)
            d.line((26,265,486,265),fill=(40,47,42),width=3)
            txt(279,'EQUIPO ELÉCTRICO',21); txt(308,'REGISTRO LL  ·  REVISADO',19)
            d.line((26,345,486,345),fill=(40,47,42),width=3)
            txt(362,'T1 132/33 kV',20,width=244,x=8); txt(362,'T2 132/33 kV',20,width=244,x=260)
            d.line((26,410,486,410),fill=(40,47,42),width=3); txt(426,'OCB 33-2',42)
        for x in (37,475):
            for y in (37,475): d.ellipse((x-5,y-5,x+5,y+5),fill=(92,91,78))
        for _ in range(90):
            x=int(rng.integers(14,498)); y=int(rng.choice([16,18,492,495]))
            d.line((x,y,x+int(rng.integers(2,12)),y),fill=(134,123,88),width=1)
        h=np.ones((CELL,CELL))*.5
    return img,np.asarray(h,dtype=float)

def rectangle(index):
    x,y=index%4*CELL,index//4*CELL
    return [(x+GUTTER)/SIZE,1-(y+CELL-GUTTER)/SIZE,(x+CELL-GUTTER)/SIZE,1-(y+GUTTER)/SIZE]

def build(out,material_path,font_path=None):
    out.mkdir(parents=True,exist_ok=True)
    colour=Image.new('RGB',(SIZE,SIZE)); normal=Image.new('RGB',(SIZE,SIZE),(128,128,255))
    orm=Image.new('RGB',(SIZE,SIZE),(255,220,0)); tiles={}; defs={}
    for i,name in enumerate(NAMES):
        tile,h=texture(name,np.random.default_rng(1323311+i*1879),font_path)
        x,y=i%4*CELL,i//4*CELL
        inner=tile.crop((GUTTER,GUTTER,CELL-GUTTER,CELL-GUTTER))
        tile=Image.fromarray(np.pad(np.asarray(inner),((GUTTER,GUTTER),(GUTTER,GUTTER),(0,0)),mode='edge'))
        colour.paste(tile,(x,y)); dy,dx=np.gradient(h)
        strength=2.0 if name in ('gravel','brick','concrete') else .7
        v=np.stack((-dx*strength,dy*strength,np.ones_like(h)),axis=2); v/=np.linalg.norm(v,axis=2)[...,None]
        normal.paste(Image.fromarray(np.uint8(np.clip(v*.5+.5,0,1)*255)),(x,y))
        rough,metal=PBR[name]; packed=np.zeros((CELL,CELL,3),dtype=np.uint8)
        packed[...,0]=np.uint8(np.clip(.91+(h-.5)*.15,0,1)*255)
        packed[...,1]=np.uint8(np.clip(rough+(h-.5)*.15,0,1)*255); packed[...,2]=int(metal*255)
        orm.paste(Image.fromarray(packed),(x,y)); key='substation_'+name; tiles[key]=rectangle(i)
        defs[key]={'tile':key,'color':16777215,'rough':rough,'metal':metal,'uv':'unit','vertexColors':True,'side':'front',
                   'map':'atlas.png','normal':'atlas_normal.png','orm':'atlas_orm.png'}
    for key,rect in {'plate':(24,274,488,337),'plate_132':(24,26,488,147),'plate_33':(24,160,488,257),
                     'plate_t1':(24,352,247,398),'plate_t2':(266,352,488,398),'plate_ocb':(24,418,488,478)}.items():
        u0,top,u1,bottom=rect; name='substation_'+key
        tiles[name]=[(1536+u0)/SIZE,1-(1536+bottom)/SIZE,(1536+u1)/SIZE,1-(1536+top)/SIZE]
        defs[name]={**defs['substation_plate'],'tile':name}
    colour.save(out/'atlas.png',optimize=True)
    normal.resize((1024,1024),Image.Resampling.LANCZOS).save(out/'atlas_normal.png',optimize=True)
    orm.resize((1024,1024),Image.Resampling.LANCZOS).save(out/'atlas_orm.png',optimize=True)
    data={'version':1,'license':'CC0-1.0','generator':'tools/blender/substation2_atlas.py',
          'atlas':{'map':'../../textures/substation2/atlas.png','normal':'../../textures/substation2/atlas_normal.png',
                   'orm':'../../textures/substation2/atlas_orm.png','size':[2048,2048],
                   'normalSize':[1024,1024],'ormSize':[1024,1024],
                   'uvConvention':'bottom-to-top; match existing TextureLoader flipY=true','gutterPixels':GUTTER,'tiles':tiles},
          'materials':defs,'reuse':{k:'assets/textures/'+v for k,v in REUSE.items()},
          'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.glob('*.png'))}}
    material_path.parent.mkdir(parents=True,exist_ok=True)
    material_path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'textures':data['files'],'gpuRGBAWithMipsBytes':33554432,'materials':len(defs)},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=ROOT/'assets/textures/substation2')
    p.add_argument('--materials',type=Path,default=ROOT/'assets/models/substation2/materials.json')
    p.add_argument('--font'); args=p.parse_args()
    build(args.out.resolve(),args.materials.resolve(),args.font)
