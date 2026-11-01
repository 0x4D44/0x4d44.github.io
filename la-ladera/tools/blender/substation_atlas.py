"""Original substation PBR surfaces and independently OCR-audited sign atlases.

Run with Python 3 + Pillow + NumPy, Tesseract 5, and eng/spa recognition data:
  node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/blender/substation_atlas.py

No font files or third-party surface images are shipped. The texture coordinates
are bottom-origin; pixel rectangles and cell SHA pins are top-origin RGB bytes.
Every rebuild obtains detectedText from the rendered raster through Tesseract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SIZE = 1024
GUTTER = 4
HIDDEN_PROCESS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}
CELL_NAMES = ('galvanised rusted_steel porcelain_brown porcelain_grey paint_uk '
              'paint_lightgrey paint_co paint_peeling concrete_clean concrete_damp '
              'concrete_algae gravel rubber brick rendered_block oil_stain wood '
              'fence_green glass lamp copper dry_vegetation black_steel white '
              'steel_dark moss chainlink palisade warning_yellow paint_control battery roof').split()

# Surface means are deliberately subdued: highlights belong to the PBR shader.
COLORS = [(147,155,150),(112,64,37),(102,59,38),(166,172,163),(115,132,118),
          (167,174,165),(174,162,128),(126,141,129),(171,171,158),(117,124,109),
          (145,147,139),(128,126,113),(42,44,41),(145,78,49),(175,174,151),
          (76,72,55),(121,100,70),(48,77,52),(75,109,114),(238,228,179),
          (137,94,56),(130,125,76),(47,52,48),(205,208,196),(80,88,83),
          (84,103,57),(126,136,128),(82,107,84),(221,182,39),(133,145,137),
          (92,98,87),(105,109,101)]

SIGN_ROWS = [
    ('danger_death', 'DANGER OF DEATH', 'PELIGRO DE MUERTE'),
    ('voltage', 'DANGER –\n132 000 VOLTS', 'PELIGRO – ALTA TENSIÓN\n115 000 V'),
    ('keep_out', 'KEEP OUT', 'PROHIBIDO EL PASO'),
    ('authorised', 'NO UNAUTHORISED\nACCESS', 'SOLO PERSONAL\nAUTORIZADO'),
    ('substation', 'ELECTRICITY\nSUBSTATION', 'SUBESTACIÓN'),
    ('grid_rating', 'T1 132/33 kV\n40 MVA', 'T1 115/34.5 kV\n40 MVA'),
    ('mv_breaker', 'CB 33-2', 'OCB 34.5-2'),
    ('tx2', 'TX2', 'S/E'),
    ('do_not_touch', 'DO NOT TOUCH', 'NO TOCAR'),
    ('isolate', 'ISOLATE BEFORE\nMAINTENANCE', 'AISLAR ANTES DEL\nMANTENIMIENTO'),
    ('earth', 'EARTH CONNECTION', 'CONEXIÓN A TIERRA'),
    ('battery', 'BATTERY ROOM', 'SALA DE BATERÍAS'),
    ('oil', 'INSULATING OIL', 'ACEITE AISLANTE'),
    ('fire', 'FIRE POINT', 'PUNTO CONTRA\nINCENDIOS'),
    ('control', 'CONTROL ROOM', 'SALA DE CONTROL'),
    ('emergency', 'EMERGENCY EXIT', 'SALIDA DE EMERGENCIA'),
    ('first_aid', 'FIRST AID', 'PRIMEROS AUXILIOS'),
    ('no_smoking', 'NO SMOKING', 'PROHIBIDO FUMAR'),
    ('live', 'LIVE EQUIPMENT', 'EQUIPO EN TENSIÓN'),
    ('circuit01', 'CIRCUIT 1', 'CIRCUITO 1'),
    ('circuit02', 'CIRCUIT 2', 'CIRCUITO 2'),
    ('circuit03', 'CIRCUIT 3', 'CIRCUITO 3'),
    ('dist_rating', 'T2 33/11 kV\n15 MVA', 'T2 34.5/13.2 kV\n15 MVA'),
    ('charger', 'BATTERY CHARGER', 'CARGADOR DE BATERÍAS'),
    ('neutral', 'NEUTRAL', 'NEUTRO'),
    ('gate', 'KEEP GATE CLOSED', 'MANTENER CERRADO'),
    ('inspection', 'SAFETY SIGNS', 'SEÑALIZACIÓN'),
    ('schematic', 'SINGLE LINE DIAGRAM', 'DIAGRAMA UNIFILAR'),
    ('number01', '01', '01'), ('number02', '02', '02'),
    ('number03', '03', '03'), ('number04', '04', '04'),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def mip_bytes(w, h):
    total = 0
    while True:
        total += w*h*4
        if w == 1 and h == 1:
            return total
        w, h = max(1,w//2), max(1,h//2)


def desc(path):
    im = Image.open(path)
    data = path.read_bytes()
    return {'path': path.name, 'width': im.width, 'height': im.height,
            'bytes': len(data), 'sha256': sha(data), 'channels': 3,
            'gpuBytesRGBA8WithMips': mip_bytes(im.width,im.height)}


def noise(rng, w, h, coarse):
    small = rng.integers(0, 256, (max(2,h//coarse),max(2,w//coarse)), dtype=np.uint8)
    return np.asarray(Image.fromarray(small).resize((w,h), Image.Resampling.BICUBIC),dtype=float)/127.5-1


def surface(index):
    w,h = 128,256
    rng = np.random.default_rng(1323311+index*1153413)
    yy,xx = np.mgrid[0:h,0:w]
    broad = noise(rng,w,h,24)
    grain = noise(rng,w,h,2)
    base = np.asarray(COLORS[index],dtype=float)
    color = np.broadcast_to(base,(h,w,3)).copy()
    color += (broad*9+grain*3)[:,:,None]
    height = broad*.14+grain*.08
    rough = np.full((h,w),.77)
    metal = np.full((h,w),.03)
    name = CELL_NAMES[index]
    if name in ('galvanised','steel_dark','black_steel','palisade','chainlink'):
        # Zinc crystals are irregular Voronoi islands, never a chequerboard.
        crystal = noise(rng,w,h,7)
        color += crystal[:,:,None]*16
        rough[:] = .5
        metal[:] = .82
        height += crystal*.06
    if 'paint' in name or name in ('fence_green','palisade'):
        chalk = np.maximum(0,broad+.2)
        color = color*(1-chalk[:,:,None]*.10)+np.array([216,211,190])*chalk[:,:,None]*.10
        # A few small edge chips, not broad noise islands. Large blotches repeat
        # across every radiator fin and otherwise turn into camouflage patterns.
        wear=np.zeros((h,w),dtype=bool)
        for i in range(12 if name=='paint_peeling' else 8 if name=='paint_co' else 4):
            side=i%3
            cx=(GUTTER+2 if side==0 else w-GUTTER-3 if side==1 else rng.uniform(8,w-8))
            cy=rng.uniform(20,h-20) if side<2 else h-GUTTER-3
            rx=rng.uniform(.8,2.3);ry=rng.uniform(1.1,3.6)
            wear |= ((xx-cx)/rx)**2+((yy-cy)/ry)**2<1
        color[wear]=color[wear]*.68+np.array([118,86,58])*.32
        height[wear]-=.13
        # Narrow, low-contrast drainage streaks fall below occasional fasteners.
        for _ in range(3 if name in ('paint_co','paint_peeling') else 1):
            x=int(rng.integers(8,w-8));y=int(rng.integers(12,h-40));length=int(rng.integers(16,60))
            for dy in range(length):
                amount=.17*(1-dy/length)
                color[min(h-1,y+dy),x:x+1] = color[min(h-1,y+dy),x:x+1]*(1-amount)+np.array([122,87,54])*amount
        metal[:] = .12
        rough[:] = .68
        rough[wear]=.82
    if name == 'rusted_steel':
        flecks=noise(rng,w,h,5)
        color += (flecks*28)[:,:,None]*np.array([1,.65,.35])
        height += flecks*.32
        rough[:] = .94
        metal[:] = .25
    if name.startswith('porcelain'):
        color += np.sin(xx*.07)[:,:,None]*3
        height *= .04
        rough[:] = .24
    if name.startswith('concrete') or name in ('rendered_block','roof','moss'):
        height = broad*.3+grain*.20
        color += (grain*8)[:,:,None]
        if name=='concrete_algae':
            # Mostly grey concrete: the humid climate appears at irregular
            # lower edges, without tinting every wall face solid green.
            damp=.035+np.maximum(broad,0)*.045+np.clip((yy/h-.65)*.10,0,.035)
            color*=1-damp[:,:,None]
            growth=np.clip((yy/h-.68)*1.8+broad*.10,0,.26)
            growth*=np.clip(broad*.8+.65,.1,1)
            color=color*(1-growth[:,:,None])+np.array([95,110,77])*growth[:,:,None]
            rough[:]=.88
        elif name in ('concrete_damp','moss'):
            damp=(1-yy/h)*.12+np.clip(broad+.2,0,1)*.3
            color *= 1-damp[:,:,None]
            growth=np.clip((yy/h-.5)*1.1+broad*.4,0,.7)
            green=np.array([69,87,45] if name=='concrete_algae' else [82,92,58])
            color=color*(1-growth[:,:,None])+green*growth[:,:,None]
        # Small pock marks and old hairline seams.
        pores=(rng.random((h,w))<.022)
        color[pores] *= .72
        height[pores] -= .3
    if name == 'brick':
        bx,by=xx-GUTTER,yy-GUTTER
        mortar=(by%31<2)|((bx+(by//31%2)*30)%60<2)
        block_noise=noise(rng,w,h,25)
        color += block_noise[:,:,None]*18
        color[mortar]=(169,158,134)
        height[mortar]-=.7
    if name == 'rendered_block':
        seam=(yy%80<2)|((xx+(yy//80%2)*50)%101<2)
        color[seam]*=.92
        height[seam]-=.1
    if name == 'gravel':
        color[:]=[91,90,81]
        height[:]=-.4
        for _ in range(270):
            x=int(rng.integers(0,w));y=int(rng.integers(0,h));rx=float(rng.uniform(2,8));ry=float(rng.uniform(2,7))
            d=((xx-x)/rx)**2+((yy-y)/ry)**2
            stone=d<1
            v=rng.uniform(.78,1.3)
            color[stone]=np.array([130,129,116])*v+(1-d[stone])[:,None]*12
            height[stone]=.25+(1-d[stone])*.5
    if name == 'wood':
        stripe=np.sin(xx*.55+broad*2)+.4*np.sin(xx*1.3+yy*.006)
        color += stripe[:,:,None]*8
        height += stripe*.08
        for x in (24,61,101):
            cracks=np.abs(xx-x-np.sin(yy*.03+x)*1.7)<.55
            color[cracks]*=.52
            height[cracks]-=.4
    if name == 'oil_stain':
        pool=np.clip(1-((xx-w*.5)/(w*.45))**2-((yy-h*.5)/(h*.4))**2+broad*.2,0,1)
        color=color*(1-pool[:,:,None]*.7)+np.array([30,29,24])*pool[:,:,None]*.7
        rough=.7-pool*.46
    if name in ('rubber','battery'):
        color += grain[:,:,None]*3
        rough[:]=.82
        height *= .12
    if name == 'copper':
        color += broad[:,:,None]*12
        metal[:]=.75
        rough[:]=.5
    if name in ('glass','lamp'):
        color += np.sin((xx+yy)*.015)[:,:,None]*8
        rough[:]=.15
        height[:]=0
    if name == 'dry_vegetation':
        color += (np.sin(xx*.6+yy*.01)*8)[:,:,None]
    # All maps extrude the four-pixel gutter, so packed cells survive mipmapping.
    def extrude(arr):
        return arr[np.clip(np.arange(h),GUTTER,h-GUTTER-1)[:,None],np.clip(np.arange(w),GUTTER,w-GUTTER-1)[None,:]]
    color=extrude(np.clip(color,0,255).astype(np.uint8))
    gy,gx=np.gradient(height)
    # PNG row y grows downward; the exported UV v grows upward. Convert the
    # height derivative to that tangent frame before encoding an OpenGL normal.
    normal=np.stack([-gx*.7,gy*.7,np.ones_like(gx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
    normal=extrude(np.clip((normal*.5+.5)*255,0,255).astype(np.uint8))
    orm=extrude(np.stack([np.clip(1-np.maximum(0,-height)*.12,0,1),rough,metal],axis=-1)*255).astype(np.uint8)
    return color,normal,orm


def write_surfaces(out):
    maps=[np.zeros((SIZE,SIZE,3),dtype=np.uint8) for _ in range(3)]
    cells={}
    for i,name in enumerate(CELL_NAMES):
        x=(i%8)*128;y=(3-i//8)*256
        for dest,source in zip(maps,surface(i)):
            dest[y:y+256,x:x+128]=source
        cells[name]={'index':i,'rect':[x,y,128,256],
                     'uv':[(x+GUTTER)/SIZE,(SIZE-y-256+GUTTER)/SIZE,(x+128-GUTTER)/SIZE,(SIZE-y-GUTTER)/SIZE]}
    result={'cells':cells,'gutter':GUTTER,'columns':8,'rows':4}
    for key,name,data in zip(('baseColor','normal','orm'),('shared-basecolor.png','shared-normal.png','shared-orm.png'),maps):
        path=out/name
        Image.fromarray(data).save(path,optimize=True)
        result[key]=desc(path)
        result[key]['colorSpace']='sRGB' if key=='baseColor' else 'linear'
    return result


def normalized(s):
    return re.sub(r'\s+',' ',unicodedata.normalize('NFC',s)).strip()


def find_font(path=None):
    if path:return Path(path)
    found=subprocess.check_output(['fc-match','-f','%{file}','DejaVu Sans:style=Bold'],text=True,**HIDDEN_PROCESS).strip()
    if not found:raise RuntimeError('Supply --font pointing to DejaVuSans-Bold.ttf')
    return Path(found)


def sign_tile(text,index,variant,font_path):
    width,height=512,128
    warning=index in (0,1,2,3,8,9,17,18,26)
    bg=(235,208,80) if warning else (221,224,205)
    if index in (13,15,16):bg=(190,218,192)
    im=Image.new('RGB',(width,height),bg)
    draw=ImageDraw.Draw(im)
    draw.rounded_rectangle((6,6,width-7,height-7),radius=5,outline=(56,60,49),width=2)
    lines=text.split('\n')
    font_size=42 if len(lines)==1 else 36
    while font_size>17:
        font=ImageFont.truetype(str(font_path),font_size)
        boxes=[draw.textbbox((0,0),line,font=font) for line in lines]
        if max(b[2]-b[0] for b in boxes)<=width-40:break
        font_size-=1
    heights=[box[3]-box[1] for box in boxes]
    spacing=13
    y=(height-sum(heights)-spacing*(len(lines)-1))/2
    for line,box,hh in zip(lines,boxes,heights):
        x=(width-(box[2]-box[0]))/2
        draw.text((x-box[0],y-box[1]),line,font=font,fill=(29,35,28),stroke_width=0)
        y+=hh+spacing
    # Small corner fixings and damp edge chips stop the plates looking like UI.
    for x in (15,width-16):
        for y in (15,height-16):
            draw.ellipse((x-2,y-2,x+2,y+2),fill=(108,111,92))
    return im


def run_ocr(im,language,tessdata,temp):
    # Crop only border/fasteners, enlarge nearest from actual rendered pixels.
    source=im.crop((24,20,488,108)).resize((1392,264),Image.Resampling.LANCZOS)
    path=temp/'cell.png';source.save(path)
    command=['tesseract',str(path),'stdout','-l',language,'--psm','6']
    if tessdata:command.extend(['--tessdata-dir',str(tessdata)])
    command.extend(['-c','preserve_interword_spaces=0'])
    run=subprocess.run(command,text=True,encoding='utf8',capture_output=True,check=True,
                       env={**os.environ,'OMP_THREAD_LIMIT':'1'},**HIDDEN_PROCESS)
    return run.stdout.strip()


def write_signs(out,variant,font_path,tessdata):
    atlas=Image.new('RGB',(2048,1024),(219,220,203))
    cells=[]
    lang='eng' if variant=='uk' else 'spa'
    with tempfile.TemporaryDirectory(prefix='substation-ocr-') as directory:
        temp=Path(directory)
        for i,(key,en,es) in enumerate(SIGN_ROWS):
            text=en if variant=='uk' else es
            cell=sign_tile(text,i,variant,font_path)
            x,y=(i%4)*512,(i//4)*128
            atlas.paste(cell,(x,y))
            raw=run_ocr(cell,lang,tessdata,temp)
            cells.append({'id':key,'index':i,'text':normalized(text),'lines':text.split('\n'),
                          'detectedText':normalized(raw),'rawDetectedText':raw,
                          'rect':[x,y,512,128], 'uv':[(x+8)/2048,(1024-y-128+8)/1024,(x+512-8)/2048,(1024-y-8)/1024],
                          'pixelSha256':sha(cell.tobytes()),'language':'en' if variant=='uk' else 'es',
                          'sharedTechnicalMarking':i in (5,6,7,22,24,28,29,30,31)})
    path=out/f'signs-{variant}.png';atlas.save(path,optimize=True)
    return {'atlas':desc(path),'language':'en' if variant=='uk' else 'es','cells':cells,
            'materials':{'substation_paint':{'cell':'paint_uk' if variant=='uk' else 'paint_co'},
                         'substation_porcelain':{'cell':'porcelain_grey' if variant=='uk' else 'porcelain_brown'},
                         'substation_concrete_weathered':{'cell':'concrete_damp' if variant=='uk' else 'concrete_algae'},
                         'substation_signs':{'atlas':path.name}},
            'ocr':{'engine':'tesseract','version':subprocess.check_output(['tesseract','--version'],text=True,**HIDDEN_PROCESS).splitlines()[0],
                   'language':lang,'cropInset':[24,20,24,20],'scale':3,
                   'tessdataSha256':sha((Path(tessdata)/f'{lang}.traineddata').read_bytes()) if tessdata else None}}


def write_atlases(out,font=None,tessdata=None):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    font_path=find_font(font)
    meta={'version':1,'license':'CC0-1.0','originalProceduralSurfaces':True,
          'font':{'family':'DejaVu Sans Bold','rasterizedOnly':True,'sha256':sha(font_path.read_bytes())},
          'shared':write_surfaces(out),'variants':{}}
    for v in ('uk','co'):
        meta['variants'][v]=write_signs(out,v,font_path,tessdata)
    textures=[meta['shared'][k] for k in ('baseColor','normal','orm')]+[meta['variants'][v]['atlas'] for v in ('uk','co')]
    meta['textureBytes']=sum(d['bytes'] for d in textures)
    meta['gpuBytesRGBA8WithMips']=sum(d['gpuBytesRGBA8WithMips'] for d in textures)
    assert meta['textureBytes']<=8_000_000
    assert meta['gpuBytesRGBA8WithMips']<=40_000_000
    (out/'atlas.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
    return meta


def write_surfaces_only(out):
    """Refresh PBR maps while preserving the independently audited sign rasters."""
    out=Path(out)
    meta=json.loads((out/'atlas.json').read_text(encoding='utf8'))
    for v in ('uk','co'):
        recorded=meta['variants'][v]['atlas']
        if sha((out/recorded['path']).read_bytes())!=recorded['sha256']:
            raise RuntimeError(f'{v}: sign raster no longer matches its OCR record')
    meta['shared']=write_surfaces(out)
    textures=[meta['shared'][k] for k in ('baseColor','normal','orm')]+[meta['variants'][v]['atlas'] for v in ('uk','co')]
    meta['textureBytes']=sum(t['bytes'] for t in textures)
    meta['gpuBytesRGBA8WithMips']=sum(t['gpuBytesRGBA8WithMips'] for t in textures)
    assert meta['textureBytes']<=8_000_000 and meta['gpuBytesRGBA8WithMips']<=40_000_000
    (out/'atlas.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
    return meta


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=ROOT/'assets/textures/substation')
    p.add_argument('--font',type=Path)
    p.add_argument('--tessdata',type=Path)
    p.add_argument('--surfaces-only',action='store_true',help='preserve pinned sign PNGs and their OCR evidence')
    opt=p.parse_args()
    result=write_surfaces_only(opt.out) if opt.surfaces_only else write_atlases(opt.out,opt.font,opt.tessdata)
    print(json.dumps({'textureBytes':result['textureBytes'],'gpuBytesRGBA8WithMips':result['gpuBytesRGBA8WithMips'],
                      'ocrCells':{v:len(result['variants'][v]['cells']) for v in ('uk','co')}},indent=2))
