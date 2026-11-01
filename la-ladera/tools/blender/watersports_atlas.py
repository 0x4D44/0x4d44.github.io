"""Original, deterministic CC0 watersports PBR atlas; Python standard library.

All three maps share one 2048-square layout. Rectangles use bottom-origin game
UVs and eight-pixel extruded gutters. Names and sail numbers are authored here,
never borrowed logos. The base-colour map contains real alpha for name decals
and the sail window. Geometry, rather than a photograph, supplies cast shadows.
"""
import argparse
from functools import lru_cache
import hashlib
import math
from pathlib import Path
import struct
import zlib

WIDTH=HEIGHT=2048
CELL=256
GUTTER=8
COLOURS=['coral','teal','gold','blue','lime','plum']
PALETTE=[(211,84,62),(38,135,137),(229,179,59),(54,110,173),(137,169,67),(145,79,132)]
TILES=([f'sail_{c}' for c in COLOURS]+[f'kite_{c}' for c in COLOURS]+
       [f'board_{c}' for c in COLOURS]+['board_twin','board_foil']+
       ['white','navy','wood','wood_dark','steel','rust','rubber','rope',
        'red','teal','yellow','encrusted','barnacles','glass','deckpad','boat_hull',
        'maria_del_mar','la_esperanza','san_pedro','brisa','lamp','coral',
        'canvas','sand','blue','green','cream','black']+
       [f'spare_{i}' for i in range(16)])
ALIASES={'pile_wood':'wood_dark','hull_white':'white','hull_blue':'navy','hull_red':'red',
         'black':'rubber','metal':'steel','orange':'coral','name_maria':'maria_del_mar',
         'name_esperanza':'la_esperanza','name_pedro':'san_pedro','name_brisa':'brisa'}

# A compact, original stencil alphabet. Every stroke is generated, not font art
# or an external texture dependency. Glyphs are intentionally hand-painted.
GLYPHS={
'A':['01110','11011','11011','11111','11011','11011','11011'],
'B':['11110','11011','11011','11110','11011','11011','11110'],
'D':['11110','11011','11011','11011','11011','11011','11110'],
'E':['11111','11000','11000','11110','11000','11000','11111'],
'I':['11111','00100','00100','00100','00100','00100','11111'],
'L':['11000','11000','11000','11000','11000','11000','11111'],
'M':['10001','11011','11111','10101','10001','10001','10001'],
'N':['11001','11001','11101','11111','11011','11001','11001'],
'O':['01110','11011','11011','11011','11011','11011','01110'],
'P':['11110','11011','11011','11110','11000','11000','11000'],
'R':['11110','11011','11011','11110','11100','11010','11011'],
'S':['01111','11000','11000','01110','00011','00011','11110'],
'Z':['11111','00011','00110','01100','11000','11000','11111'],
'0':['01110','11011','11011','11011','11011','11011','01110'],
'1':['00100','01100','00100','00100','00100','00100','01110'],
'2':['01110','11011','00011','00110','01100','11000','11111'],
'3':['11110','00011','00011','01110','00011','00011','11110'],
'4':['00011','00111','01111','11011','11111','00011','00011'],
'5':['11111','11000','11000','11110','00011','00011','11110'],
'6':['01110','11000','11000','11110','11011','11011','01110'],
'7':['11111','00011','00110','00100','01100','01100','01100'],
'8':['01110','11011','11011','01110','11011','11011','01110'],
'9':['01110','11011','11011','01111','00011','00011','01110'],
' ':['00000']*7,
}


@lru_cache(maxsize=1)
def atlas_tiles():
    result={name:[((i%8)*CELL+GUTTER)/WIDTH,((i//8)*CELL+GUTTER)/HEIGHT,
                  ((i%8+1)*CELL-GUTTER)/WIDTH,((i//8+1)*CELL-GUTTER)/HEIGHT]
            for i,name in enumerate(TILES)}
    result.update({alias:result[target] for alias,target in ALIASES.items()})
    return result


def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)


def png(path,rows,channels):
    path.parent.mkdir(parents=True,exist_ok=True)
    encoded=b''.join(b'\x00'+bytes(row) for row in rows)
    colour=6 if channels==4 else 2
    data=(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',WIDTH,HEIGHT,8,colour,0,0,0))+
          chunk(b'IDAT',zlib.compress(encoded,9))+chunk(b'IEND',b''))
    path.write_bytes(data)
    return {'path':'../textures/watersports/'+path.name,'bytes':len(data),
            'sha256':hashlib.sha256(data).hexdigest()}


def lettering(text,scale=2,x=None,y=112):
    width=len(text)*6*scale-scale
    x=(CELL-width)//2 if x is None else x
    pixels=set()
    for i,ch in enumerate(text):
        glyph=GLYPHS[ch]
        jitter=(i%3)-1
        for gy,row in enumerate(glyph):
            for gx,on in enumerate(row):
                if on=='1':
                    for sy in range(scale):
                        for sx in range(scale):
                            pixels.add((x+i*6*scale+gx*scale+sx+(6-gy)//4,
                                        y+gy*scale+sy+jitter))
    return pixels


def tile_pixels(index):
    name=TILES[index]
    number=lettering(str(11+index*7),scale=7,y=150) if name.startswith('sail_') else set()
    names={'maria_del_mar':'MARIA DEL MAR','la_esperanza':'LA ESPERANZA','san_pedro':'SAN PEDRO','brisa':'BRISA'}
    letters=lettering(names[name],scale=3,y=116) if name in names else set()
    bases={'white':(218,218,202),'navy':(35,66,90),'wood':(155,131,96),'wood_dark':(77,74,58),
           'steel':(138,151,149),'rust':(133,83,51),'rubber':(42,47,46),'rope':(183,161,113),
           'red':(179,59,48),'teal':(40,127,129),'yellow':(226,180,52),'encrusted':(85,113,89),
           'barnacles':(81,91,76),'glass':(189,225,224),'deckpad':(43,65,65),'boat_hull':(210,216,200),
           'lamp':(255,224,145),'coral':PALETTE[0],'canvas':(195,190,166),'sand':(184,166,126),
           'blue':PALETTE[3],'green':(79,123,78),'cream':(214,201,167),'black':(31,35,36)}
    base=bases.get(name,(151,159,143))
    if name.startswith('sail_'):base=PALETTE[index]
    if name.startswith('kite_'):base=PALETTE[index-6]
    if name.startswith('board_'):base=PALETTE[(index-12)%6]
    rows=[];normals=[];orm=[]
    for raw_y in range(CELL):
        y=max(GUTTER,min(CELL-GUTTER-1,raw_y))
        row=bytearray();nr=bytearray();mr=bytearray()
        for raw_x in range(CELL):
            x=max(GUTTER,min(CELL-GUTTER-1,raw_x))
            grain=((x//4*13+y//4*7+index*5)%5-2)*2
            rgb=base;alpha=255;rough=190;metal=0;nx=128;ny=128
            if name.startswith('sail_'):
                diagonal=abs(x-(32+y*.58))<3
                seam=y%53<4 or diagonal or x<14 or x>241
                rgb=(235,231,210) if seam else base
                if y<70:rgb=(34,65,73) if not seam else (235,231,210)
                if 75<x<184 and 140<y<208:rgb=(30,60,70)
                if (x,y) in number:rgb=(248,244,222)
                rough=150
            elif name.startswith('kite_'):
                panel=(x-8)//40
                rgb=base if panel%2==0 else (236,229,202)
                if x%40<4 or y<15 or y>239:rgb=(250,246,229)
                if y>211:rgb=(37,66,76)
                rough=160
            elif name.startswith('board_'):
                if x<22 or x>234:rgb=(234,227,200)
                elif 65<x<192 and 72<y<203:
                    rib=4 if (x+y)%14<3 else 0
                    rgb=(40+rib,58+rib,58+rib)
                elif abs(x-128)<9:rgb=(240,224,176)
                elif y<65 and ((x+y)//24)%2==0:rgb=(33,74,88)
                rough=146
            elif name in ('wood','wood_dark'):
                line=int(9*math.sin(x*.43+math.sin(y*.025)*1.8)+5*math.sin(x*.098))
                rgb=tuple(max(0,c+line) for c in base)
                if x%67<2:rgb=tuple(int(c*.55) for c in rgb)
                if (x-28)**2+(y-30)**2<15 or (x-225)**2+(y-222)**2<15:rgb=(52,55,46)
                rough=220;nx=128+int(3*math.cos(x*.43))
                if name=='wood_dark' and y>173:
                    rgb=(58+grain,81+grain,60+grain)
                    if ((x//5*3+y//5*7)%19)<3:rgb=(163,164,129)
            elif name in ('barnacles','encrusted'):
                spot=((x//7*23+y//7*37)%29)<5
                rgb=(173,177,136) if spot else base
                if (x//23+y//17)%4==0:rgb=(71,106,77)
                nx=133 if spot else 125;ny=130;rough=231
            elif name=='rope':
                rib=(x+y*2)%27
                rgb=tuple(int(c*(.74 if rib<5 else 1)) for c in base);rough=220
            elif name=='deckpad':
                rgb=tuple(c+9 if ((x+y)%20<4 or (x-y)%20<4) else c for c in base);rough=232
            elif name=='boat_hull':
                rgb=(39,83,118) if y>144 else ((166,57,43) if 132<y<=144 else base)
                if y>209:rgb=tuple(int(c*.8) for c in rgb)
                if (x*3+y*13)%997<8:rgb=(158,151,122)
                rough=164
            elif name=='steel':
                rough=135;metal=220
            elif name=='rust':
                rgb=base if (x//9+y//7)%3 else (85,76,49);rough=235;metal=70
            elif name=='glass':
                alpha=60;rough=55;grain=0
                rgb=(188,220,222)
            elif name in names:
                alpha=255 if (x,y) in letters else 0
                rgb=(235,218,173) if index%2==0 else (183,52,40)
                rough=205;grain=0
                if alpha and (x*11+y*19)%127==0:alpha=145
            elif name=='lamp':
                rough=80;grain=0
            rgb=tuple(max(0,min(255,c+grain)) for c in rgb)
            row.extend((*rgb,alpha));nr.extend((nx,ny,255));mr.extend((255,rough,metal))
        rows.append(row);normals.append(nr);orm.append(mr)
    return rows,normals,orm


def write_atlas(directory):
    directory=Path(directory)
    # Work a row of eight tiles at a time. The PNG's top row corresponds to
    # game V=1, while atlas_tiles numbers tiles from the bottom upwards.
    output=[[],[],[]]
    for tile_y in reversed(range(8)):
        row_tiles=[tile_pixels(tile_y*8+x) for x in range(8)]
        for y in range(CELL):
            for channel in range(3):
                output[channel].append(b''.join(t[channel][y] for t in row_tiles))
    maps={kind:png(directory/filename,output[i],4 if i==0 else 3)
          for i,(kind,filename) in enumerate([('baseColor','watersports_base.png'),
                                             ('normal','watersports_normal.png'),('orm','watersports_orm.png')])}
    return {'width':WIDTH,'height':HEIGHT,'gutter':GUTTER,'maps':maps,
            'tiles':atlas_tiles(),'colourSpace':{'baseColor':'sRGB','normal':'linear','orm':'linear'},
            'ormChannels':{'r':'occlusion','g':'roughness','b':'metalness'}}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path)
    args=p.parse_args();print(write_atlas(args.out))
