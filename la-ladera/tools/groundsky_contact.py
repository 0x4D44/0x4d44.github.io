#!/usr/bin/env python3
"""Contact sheets of all original masters alongside delivered texture proofs."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DEV=ROOT/'dev/groundsky'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def font(size):
    return ImageFont.truetype(FONT,size) if Path(FONT).exists() else ImageFont.load_default()


def checker(w,h):
    im=Image.new('RGBA',(w,h),(208,214,207,255))
    d=ImageDraw.Draw(im)
    for y in range(0,h,16):
        for x in range(0,w,16):
            if (x//16+y//16)%2:
                d.rectangle((x,y,x+15,y+15),fill=(186,194,187,255))
    return im


def thumb(path,w,h):
    source=Image.open(path).convert('RGBA')
    source.thumbnail((w,h),Image.Resampling.LANCZOS)
    out=checker(w,h)
    out.alpha_composite(source,((w-source.width)//2,(h-source.height)//2))
    return out.convert('RGB')


def canvas(title,subtitle,w,h):
    im=Image.new('RGB',(w,h),(23,35,36))
    d=ImageDraw.Draw(im)
    d.text((26,20),title,font=font(29),fill=(245,239,216))
    d.text((26,62),subtitle,font=font(14),fill=(174,190,181))
    return im


def write(im,name):
    path=DEV/name
    im.save(path,optimize=True)
    return dict(path=path.relative_to(ROOT).as_posix(),kind='contact-sheet',
                bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--decoded',type=Path,required=True)
    args=p.parse_args()
    catalogue=json.loads((ROOT/'tools/groundsky.catalog.json').read_text())
    files=[r for r in catalogue['files'] if r['format']=='png']
    records=[]
    materials=sorted({r.get('materialId',r.get('material')) for r in files if r['kind']=='ground'})
    im=canvas('GROUND / 24 PBR materials','1024 px original masters. Each card: albedo | tangent normal | ORM (AO / roughness / metal).',1432,1428)
    d=ImageDraw.Draw(im)
    for i,material in enumerate(materials):
        x=24+(i%4)*350;y=104+(i//4)*218
        rows={r['role']:r for r in files if r['kind']=='ground' and r.get('materialId',r.get('material'))==material}
        for j,role in enumerate(['albedo','normal','orm']):
            im.paste(thumb(ROOT/rows[role]['path'],108,160),(x+j*111,y))
            d.text((x+j*111,y+165),role.upper(),font=font(11),fill=(149,177,155))
        d.text((x,y+188),material.replace('_',' '),font=font(13),fill=(238,233,210))
    records.append(write(im,'contact-ground.png'))
    decals=[r for r in files if r['kind']=='decal']
    im=canvas('GROUND / Organic patch decals','16 original soft-edged patches. Authored metre sizes below each card; checkerboard reveals opacity.',1264,1268)
    d=ImageDraw.Draw(im)
    for i,r in enumerate(decals):
        x=24+(i%4)*310;y=108+(i//4)*286
        im.paste(thumb(ROOT/r['path'],286,226),(x,y))
        d.text((x,y+232),r['id'].replace('_',' '),font=font(13),fill=(238,233,210))
        d.text((x,y+254),str(r['worldSizeM'])+' m | RGBA',font=font(12),fill=(149,177,155))
    records.append(write(im,'contact-decals.png'))
    mask_records=[r for r in files if r['kind']=='blend-mask']
    im=canvas('TERRAIN / Eight independent splat masks','Two 1024 px RGBA planes. Every channel is linear mask data, including alpha. All eight masks tile.',1264,744)
    d=ImageDraw.Draw(im)
    for i,r in enumerate(mask_records):
        source=Image.open(ROOT/r['path']).convert('RGBA')
        channels=r.get('channels',['R','G','B','A'])
        for j,channel in enumerate(source.split()):
            x=24+j*310;y=108+i*310
            im.paste(channel.resize((286,250),Image.Resampling.LANCZOS).convert('RGB'),(x,y))
            label=channels[j] if isinstance(channels,list) else str(channels.get('RGBA'[j],j))
            d.text((x,y+261),str(label),font=font(13),fill=(238,233,210))
    records.append(write(im,'contact-masks.png'))
    im=canvas('MIRADOR / A fictional Andean valley city','200 degree cylindrical arc. Three independent soft-alpha layers; nine 4096 × 512 source PNGs.',1600,1296)
    d=ImageDraw.Draw(im)
    for phase_index,phase in enumerate(['day','dusk','night']):
        y=108+phase_index*390
        sky=(189,207,214) if phase=='day' else (140,126,155) if phase=='dusk' else (19,32,55)
        composite=Image.new('RGBA',(4096,512),(*sky,255))
        for layer in ['far','middle','near']:
            r=next(r for r in files if r['kind']=='city' and r['layer']==layer and r['timeOfDay']==phase)
            composite.alpha_composite(Image.open(ROOT/r['path']).convert('RGBA'))
        im.paste(composite.resize((1552,194),Image.Resampling.LANCZOS).convert('RGB'),(24,y))
        d.text((24,y+201),phase.upper()+' — all three source layers composited for review',font=font(14),fill=(238,233,210))
        for li,layer in enumerate(['far','middle','near']):
            r=next(r for r in files if r['kind']=='city' and r['layer']==layer and r['timeOfDay']==phase)
            im.paste(thumb(ROOT/r['path'],504,112),(24+li*524,y+228))
            d.text((24+li*524,y+345),layer+' | radius '+str(r['radiusM'])+' m',font=font(12),fill=(149,177,155))
    records.append(write(im,'contact-city.png'))
    families=sorted({r['family'] for r in files if r['kind']=='vegetation'})
    im=canvas('DISTANCE / Vegetation atlas families','Six families, four registered variants per atlas, at 1024 / 512 / 256 px. These are far-field billboard textures.',1432,1700)
    d=ImageDraw.Draw(im)
    for i,family in enumerate(families):
        x=24+(i%3)*468;y=108+(i//3)*784
        for lod,size in [(0,432),(1,256),(2,128)]:
            r=next(r for r in files if r['kind']=='vegetation' and r['family']==family and r['lod']==lod)
            if lod==0:
                pos=(x,y)
            elif lod==1:
                pos=(x,y+488)
            else:
                pos=(x+280,y+488)
            im.paste(thumb(ROOT/r['path'],size,size),pos)
            d.text((pos[0],pos[1]+size+4),f'LOD {lod} / {r["width"]} px',font=font(12),fill=(149,177,155))
        d.text((x,y+456),family.replace('_',' '),font=font(15),fill=(238,233,210))
    records.append(write(im,'contact-vegetation.png'))
    im=canvas('ATMOSPHERE / Haze ramps','Five 256 × 4 px ramps; sRGB colour and linear opacity. Left is clear / near, right is opaque / far.',1200,620)
    d=ImageDraw.Draw(im)
    for i,r in enumerate(sorted([r for r in files if r['kind']=='haze'],key=lambda r:r.get('hour',r.get('timeOfDay',0)))):
        x,y=180,112+i*94
        data=Image.open(ROOT/r['path']).convert('RGBA')
        # Stretch only the review strip; this is not a resampled asset.
        strip=data.resize((980,48),Image.Resampling.NEAREST)
        bg=checker(980,48);bg.alpha_composite(strip)
        im.paste(bg.convert('RGB'),(x,y))
        d.text((25,y+13),str(r.get('hour',r.get('timeOfDay')))+' h',font=font(20),fill=(238,233,210))
        d.text((x,y+54),r['id'],font=font(11),fill=(149,177,155))
    records.append(write(im,'contact-haze.png'))
    # Compression comparison uses actual exported KTX decoding, not the input PNG.
    selected=[r for r in files if r['id'] in ['kikuyu_lush_albedo','gravel_fine_grey_albedo',
               'cracked_concrete_light_albedo','city_near_dusk']]
    if not selected:
        selected=[r for r in files if r['kind']=='ground' and r['role']=='albedo'][:4]
    im=canvas('DELIVERY / Master and decoded ASTC','Paired full-resolution crops. Left: original PNG. Right: delivered KTX2 decoded by Arm astcenc.',1248,1088)
    d=ImageDraw.Draw(im)
    for i,r in enumerate(selected[:4]):
        x=24+(i%2)*612;y=108+(i//2)*478
        master=Image.open(ROOT/r['path']).convert('RGBA')
        decoded=Image.open(args.decoded/Path(r['path']).relative_to('dev/groundsky/masters')).convert('RGBA')
        cx,cy=master.width//2,master.height//2
        rect=(max(0,cx-144),max(0,cy-180),cx+144,cy+180)
        for j,image in enumerate([master,decoded]):
            crop=image.crop(rect);bg=checker(*crop.size);bg.alpha_composite(crop)
            im.paste(bg.convert('RGB'),(x+j*294,y))
            d.text((x+j*294,y+368),'PNG MASTER' if j==0 else 'DECODED KTX2',font=font(12),fill=(149,177,155))
        d.text((x,y+398),r['id'].replace('_',' '),font=font(13),fill=(238,233,210))
    records.append(write(im,'contact-delivery.png'))
    if (DEV/'render-metadata.json').exists():
        records+=json.loads((DEV/'render-metadata.json').read_text())['files']
    (DEV/'review-metadata.json').write_text(json.dumps(dict(files=records),indent=2)+'\n')
    print(json.dumps(dict(contactSheets=7,reviewFiles=len(records),paths=[r['path'] for r in records]),indent=2))


if __name__=='__main__':
    main()
