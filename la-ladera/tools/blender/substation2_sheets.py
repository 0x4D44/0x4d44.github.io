"""Labelled contact sheets of the actual-GLB renders and scale figures."""
import argparse,json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--renders',type=Path,required=True); p.add_argument('--out',type=Path,required=True); p.add_argument('--font',type=Path)
    args=p.parse_args(); args.out.mkdir(parents=True,exist_ok=True)
    candidates=[args.font,Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('C:/Windows/Fonts/arial.ttf'),Path('/Library/Fonts/Arial.ttf')]
    selected=next((str(path) for path in candidates if path and path.is_file()),None)
    if selected is None: raise RuntimeError('Unicode font not found; pass --font PATH')
    font=ImageFont.truetype(selected,20); small=ImageFont.truetype(selected,16); title=ImageFont.truetype(selected,29)
    records=json.loads((args.renders/'contact-report.json').read_text())
    for lod in (False,True):
        items=[r for r in records if r['id'].endswith('_lod1')==lod]
        for page in range(math.ceil(len(items)/12)):
            sheet=Image.new('RGB',(2240,1628),(233,234,226)); draw=ImageDraw.Draw(sheet)
            draw.text((28,17),'LA LADERA / SUBESTACIÓN 132 / 33 / 11 kV',font=title,fill=(32,48,45))
            draw.text((30,62),f"{'LOD' if lod else 'NEAR'} · camera 1.60 m · reference figure 1.80 m · metres · sheet {page+1}",font=font,fill=(65,80,75))
            for i,rec in enumerate(items[page*12:(page+1)*12]):
                x=i%4*560; y=112+i//4*502
                sheet.paste(Image.open(args.renders/rec['file']).convert('RGB').resize((560,440)),(x,y))
                name=rec['id'].removeprefix('substation_').replace('_',' ')
                draw.text((x+12,y+446),name,font=font,fill=(28,45,41))
                dims=' × '.join(f'{n:g}' for n in rec['size'])+' m'
                draw.text((x+12,y+474),dims+f"    {rec['triangles']:,} triangles",font=small,fill=(67,79,74))
            path=args.out/f"contact-{'lod' if lod else 'near'}-{page+1:02}.jpg"; sheet.save(path,quality=89,subsampling=0); print(path)
    for name in ('yard-overview','yard-eye-1_6m'):
        source=args.renders/(name+'.png')
        if source.exists(): Image.open(source).convert('RGB').save(args.out/(name+'.jpg'),quality=92,subsampling=0)

if __name__=='__main__': main()
