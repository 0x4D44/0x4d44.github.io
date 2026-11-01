"""Compose the exported-model photographs into compact, labelled review sheets.

Run through tools/nice.mjs after watersports_preview.py. Pillow is a development
dependency only; no texture, model or game code is read or changed here.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parent.parent
INK=(23,50,55)
MUTED=(83,108,109)
PAPER=(244,244,235)
LINE=(211,222,216)
ACCENT=(211,107,68)


def font(size,bold=False):
    candidates=[Path('/usr/share/fonts/truetype/dejavu')/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),
                Path('C:/Windows/Fonts')/('arialbd.ttf' if bold else 'arial.ttf')]
    for path in candidates:
        if path.exists():return ImageFont.truetype(str(path),size)
    return ImageFont.load_default(size=size)


def short_name(key):
    return key.removeprefix('watersports_').replace('_',' ').replace('sup ','SUP ').title().replace('Sup ','SUP ')


def wrapped(draw,text,width,face):
    lines=[];line=''
    for word in text.split():
        trial=(line+' '+word).strip()
        if draw.textlength(trial,font=face)>width and line:lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    return lines


def sheet(shots,source,path,title,subtitle,columns=4,thumb=(360,270),by_key=None):
    gutter=16;heading=108;label=74
    rows=math.ceil(len(shots)/columns)
    width=columns*(thumb[0]+gutter)+gutter
    height=heading+rows*(thumb[1]+label+gutter)+gutter
    canvas=Image.new('RGB',(width,height),PAPER);draw=ImageDraw.Draw(canvas)
    draw.rectangle((0,0,width,8),fill=INK)
    draw.text((gutter,27),title,font=font(29,True),fill=INK)
    draw.text((gutter,69),subtitle,font=font(15),fill=MUTED)
    placements=[]
    for i,record in enumerate(shots):
        col=i%columns;row=i//columns
        x=gutter+col*(thumb[0]+gutter);y=heading+row*(thumb[1]+label+gutter)
        photo=Image.open(source/record['image']).convert('RGB')
        photo=ImageOps.contain(photo,thumb,method=Image.Resampling.LANCZOS)
        draw.rectangle((x,y,x+thumb[0],y+thumb[1]+label),fill=(255,255,250),outline=LINE,width=1)
        canvas.paste(photo,(x+(thumb[0]-photo.width)//2,y+(thumb[1]-photo.height)//2))
        name=short_name(record['key'])
        if record.get('variant'):
            name=record['variant'].replace('_',' ').title()
        draw.text((x+11,y+thumb[1]+10),name,font=font(17,True),fill=INK)
        lo,hi=record['bounds']['min'],record['bounds']['max']
        dimensions=' × '.join(f'{hi[k]-lo[k]:.2f}' for k in range(3))+' m'
        detail=dimensions
        if by_key and record['key'] in by_key:
            meta=by_key[record['key']]
            detail+=f"  |  {meta['triangles']} tri"
        draw.text((x+11,y+thumb[1]+38),detail,font=font(13),fill=MUTED)
        if record['floating']:
            draw.rectangle((x+thumb[0]-11,y+thumb[1]+label-11,x+thumb[0]-5,y+thumb[1]+label-5),fill=(40,119,134))
        placements.append({'sourceImage':record['image'],'sheet':path.name,'rectangle':[x,y,thumb[0],thumb[1]+label]})
    canvas.save(path,quality=92,optimize=True,progressive=True,subsampling=0)
    return placements


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renders',type=Path,default=Path('/tmp/watersports-renders'))
    parser.add_argument('--out',type=Path,default=ROOT/'dev/watersports')
    parser.add_argument('--models',type=Path,default=ROOT/'assets/models')
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    index=json.loads((args.renders/'contact-index.json').read_text())
    manifest=json.loads((args.models/'manifest.watersports.json').read_text())
    catalog=json.loads((ROOT/'tools/blender/watersports.catalog.json').read_text())['assets']
    by_key={key:value for f in manifest['files'] for key,value in f['assets'].items()}
    shots=index['shots'];locations=[];sheets=[]
    for record in shots:
        image=args.renders/record['image']
        if not image.is_file():raise FileNotFoundError(image)
        record['sourceImageSha256']=hashlib.sha256(image.read_bytes()).hexdigest()
    order={key:i for i,key in enumerate(catalog)}
    eye=sorted((r for r in shots if r['kind']=='eye'),key=lambda r:order[r['key']])
    catalogue=sorted((r for r in shots if r['kind']=='catalogue'),key=lambda r:order[r['key']])
    if index.get('complete'):
        for kind,records in [('eye',eye),('catalogue',catalogue)]:
            if set(r['key'] for r in records)!=set(catalog):raise ValueError(f'{kind} contact sheet is incomplete')
        expected_transoms={key for key in catalog if key.startswith('watersports_wooden_boat_')}
        if {r['key'] for r in shots if r['kind']=='transom'}!=expected_transoms:
            raise ValueError('transom contact sheet is incomplete')
        families={}
        for cat in catalog.values():
            for family,variant in cat.get('variants',{}).items():families.setdefault(family,set(variant['tiles']))
        for family,tiles in families.items():
            actual={r['variant'] for r in shots if r['kind']=='variant' and r.get('variantFamily')==family}
            if actual!=tiles:raise ValueError(f'{family} colourway contact sheet is incomplete')
        expected_files={f['glb']:f['sha256'] for f in manifest['files']}
        expected_atlas={key:value['sha256'] for key,value in manifest['atlas']['maps'].items()}
        for record in shots:
            if record['source']['sha256']!=expected_files.get(record['source']['file']):
                raise ValueError('rendered GLB has changed: '+record['image'])
            if record.get('atlasSha256')!=expected_atlas:
                raise ValueError('rendered atlas has changed: '+record['image'])
    pages=math.ceil(len(eye)/12)
    for page in range(pages):
        output=args.out/f'contact-eye-{page+1:02d}.jpg'
        locations+=sheet(eye[page*12:(page+1)*12],args.renders,output,
                         f'LA LADERA  /  WATERSPORTS  /  {page+1:02d}',
                         'Camera height 1.60 m · Measuring figure 1.80 m · Blue tick = waterline Y=0 · W × H × L',by_key=by_key)
        sheets.append(output)
    output=args.out/'catalogue.jpg'
    locations+=sheet(catalogue,args.renders,output,'LA LADERA  /  WATERSPORTS CATALOGUE',
                     f'{len(catalogue)} original designs and poses · Exported GLBs · PBR atlas · Metres · Near triangle counts',
                     columns=5,thumb=(300,225),by_key=by_key)
    sheets.append(output)
    variants=sorted((r for r in shots if r['kind'] in ('variant','transom')),
                    key=lambda r:({'variant':0,'transom':1}[r['kind']],order[r['key']],r.get('variant') or ''))
    if variants:
        output=args.out/'colourways-and-transoms.jpg'
        locations+=sheet(variants,args.renders,output,'SAILS, KITES & PAINTED BOAT NAMES',
                         'Atlas variants applied to exported GLB UVs · Six sails · Six kites · Four alpha transom names',
                         columns=6,thumb=(300,225),by_key=by_key)
        sheets.append(output)
    lookup={p['sourceImage']:p for p in locations}
    for record in shots:
        record['contactSheet']=lookup.get(record['image'])
    index['sheets']=[{'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sheets]
    (args.out/'contact-index.json').write_text(json.dumps(index,indent=2)+'\n')
    print(f'CONTACT SHEETS OK: {len(eye)} items at eye height, {len(catalogue)} catalogue views, {len(variants)} variants/transoms; {len(sheets)} sheets')
    for path in sheets:print(f'{path.name}: {path.stat().st_size:,} bytes')


if __name__=='__main__':main()
