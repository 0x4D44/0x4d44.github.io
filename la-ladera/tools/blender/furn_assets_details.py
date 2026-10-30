"""Small, recognisable household objects for the catalogue, exported through Blender.

Coordinates in this file are proportions of the catalogue envelope. All models
have a centred X/Z footprint and base Y=0, including things hung at runtime.
There are no external meshes, images, random seeds or copyrighted product marks.
"""
import math
from furn_lib import asset

P = 'plastic_solid'
BLACK, CREAM, RED, BLUE = 0x202226, 0xeee8d8, 0xb94836, 0x4678a0


class Detail:
    def __init__(self, a): self.a, self.w, self.h, self.d = a, a.W, a.H, a.D
    def box(self, mat, x, y, z, w, h, d, col=None, tint=False, bevel=False):
        self.a.box(mat, x*self.w, y*self.h, z*self.d, w*self.w, h*self.h, d*self.d,
                   col, tint, r=min(w*self.w,h*self.h,d*self.d)*0.12 if bevel else 0)
    def sph(self, mat, x, y, z, w, h, d, col=None, tint=False, n=8):
        self.a.sph(mat,x*self.w,y*self.h,z*self.d,w*self.w,h*self.h,d*self.d,n,col,tint)
    def tube(self, mat, pts, radius, col=None, tint=False, n=6):
        self.a.tube(mat,[(x*self.w,y*self.h,z*self.d) for x,y,z in pts],radius*min(self.w,self.h,self.d),n,col,tint)
    def pot(self, mat, x, y, z, r, h, col=None, tint=False, n=12):
        # Open vessel: base, tapered outside, rolled rim and visible inside.
        self.a.lathe(mat,x*self.w,y*self.h,z*self.d,
            [(0,0),(r*.72,0),(r,h*.94),(r,h),(r*.84,h),(r*.65,h*.12),(0,h*.12)],n,col,tint,
            scl=(self.w,self.h,self.d))
    def disc(self, mat, x, y, z, radius, length, col=None, axis='z', n=12):
        self.a.hcyl(mat,x*self.w,y*self.h,z*self.d,radius*min(self.w,self.h),length*self.d,axis,n,col)
    def ring(self, mat, x, y, z, rx, ry, col=None, radius=.012, n=16):
        self.tube(mat,[(x+rx*math.cos(i*2*math.pi/n),y+ry*math.sin(i*2*math.pi/n),z) for i in range(n+1)],radius,col,n=5)


@asset('details','radio_old','radio_boombox','speaker')
def audio(a,key,c):
    b=Detail(a); speaker=key=='speaker'; old=key=='radio_old'
    b.box('wood_dark' if old else P,0,0,0,1,.9 if not speaker else 1,.92, None if old else BLACK, old, True)
    if speaker:
        for y,r in ((.27,.32),(.67,.23)):
            b.disc('metal_dark',0,y,.475,r,.03); b.disc(P,0,y,.495,r*.55,.015,0x35383a)
        b.box(P,0,.88,.475,.34,.05,.025,0xa3a39b)
    elif old:
        for i in range(7): b.box(P,-.30+i*.065,.18,.475,.025,.52,.025,0x352d24)
        b.box(P,.27,.52,.475,.28,.18,.025,0xa9a98b)
        for x in (.19,.37): b.disc(P,x,.25,.49,.065,.025,BLACK)
    else:
        for x in (-.31,.31):
            b.disc('metal_dark',x,.43,.475,.27,.03); b.disc(P,x,.43,.495,.12,.015,0x5e6165)
        b.box(P,0,.19,.48,.25,.42,.025,0x50535a)
        b.box(P,0,.7,.49,.25,.1,.025,0xabb693)
        b.tube(P,[(-.27,.9,0),(-.27,.98,0),(.27,.98,0),(.27,.9,0)],.035,BLACK)


@asset('details','fan_stand','fan_desk')
def fan(a,key,c):
    b=Detail(a); ry=.44*a.W/a.H; cy=.98-ry
    b.sph(P,0,.035,0,.46,.035,.44,CREAM,n=12)
    b.tube('metal_chrome',[(0,.06,-.13),(0,cy,-.13)],.035)
    b.disc(P,0,cy,-.08,.09,.45,CREAM)
    # Cage rings and radial wires read as a fan from both sides.
    for z in (.14,.31):
        b.ring('metal_dark',0,cy,z,.44,ry, radius=.012,n=20)
        for k in range(8):
            t=k*math.pi/4
            b.tube('metal_dark',[(0,cy,z),(.44*math.cos(t),cy+ry*math.sin(t),z)],.009)
    for k in range(3):
        t=k*math.pi*2/3
        b.sph(P,.20*math.cos(t),cy+ry*.45*math.sin(t),.22,.20,.10*a.W/a.H,.035,BLUE,n=8)
    b.disc(P,0,cy,.32,.075,.04,CREAM)


@asset('details','bulb_bare','light_tube')
def lights(a,key,c):
    b=Detail(a)
    if key=='light_tube':
        b.box('enamel_white',0,.56,0,1,.44,1)
        a.hcyl('tube_glow',0,a.H*.3,0,min(a.H*.25,a.D*.25),a.W*.94,'x',10)
        for x in (-.47,.47): b.box('enamel_white',x,0,0,.06,.75,.85)
    else:
        b.tube('rubber_black',[(0,.8,0),(0,1,0)],.035)
        b.pot('ceramic_white',0,.52,0,.25,.30)
        b.sph('bulb_glow',0,.27,0,.43,.25,.43,n=12)


@asset('details','pc_set','phone_landline','sewing_machine','printer')
def appliances(a,key,c):
    b=Detail(a)
    if key=='pc_set':
        b.box(P,-.12,.25,-.20,.66,.72,.13,BLACK)
        b.box(P,-.12,.31,-.125,.57,.57,.015,0x577f8c)
        b.box(P,-.12,.08,-.20,.08,.18,.1,BLACK)
        b.box(P,-.12,0,-.15,.4,.08,.30,BLACK)
        b.box(P,.38,0,-.18,.20,.85,.50,CREAM)
        b.box(P,.38,.49,.08,.13,.07,.015,BLACK)
        b.box(P,-.12,0,.30,.64,.06,.32,CREAM)
        for row in range(3):
            for col in range(9): b.box(P,-.39+col*.067,.06,.20+row*.09,.045,.018,.045,0x777b7b)
        b.sph(P,.35,.055,.32,.08,.055,.12,CREAM)
    elif key=='phone_landline':
        b.box(P,0,0,0,.94,.58,.94,CREAM,bevel=True)
        for row in range(4):
            for col in range(3): b.box(P,-.13+col*.13,.59,-.14+row*.13,.09,.05,.08,0x5a5e5b)
        b.tube(P,[(-.34,.77,-.37),(-.34,.92,-.23),(-.34,.92,.24),(-.34,.77,.38)],.08,BLACK)
        for z in (-.32,.32): b.sph(P,-.34,.76,z,.12,.13,.12,BLACK)
        b.tube('rubber_black',[(.25,.40,-.45),(.43,.3,-.3),(.43,.32,.15),(.35,.4,.3)],.025)
    elif key=='sewing_machine':
        b.box('metal_dark',0,0,0,1,.09,1)
        b.box('metal_dark',.30,.08,-.05,.25,.7,.65,bevel=True)
        b.box('metal_dark',-.04,.63,-.05,.72,.24,.45,bevel=True)
        b.box('metal_dark',-.35,.37,-.05,.14,.35,.30)
        b.tube('metal_chrome',[(-.35,.14,-.05),(-.35,.38,-.05)],.018)
        b.box('metal_steel',-.29,.09,0,.30,.025,.55)
        a.hcyl('metal_dark',a.W*.465,a.H*.66,-a.D*.05,a.H*.22,a.W*.05,'x',12)
        b.pot('fabric_bedding',.15,.87,-.06,.06,.13,RED)
    else:
        b.box(P,0,0,0,1,.70,.9,CREAM,bevel=True)
        b.box(P,0,.69,-.05,.9,.17,.76,0xa1a8a7)
        b.box('paper',0,.86,-.15,.68,.025,.65)
        b.box(P,0,.25,.46,.72,.10,.03,BLACK)
        b.box('paper',0,.24,.30,.64,.02,.40)
        b.box(P,.34,.87,.15,.12,.05,.16,0x587d8f)


@asset('details','clock_wall')
def clock(a,key,c):
    b=Detail(a); b.disc('wood_dark',0,.5,0,.49,.9); b.disc(P,0,.5,.46,.44,.03,CREAM)
    for k in range(12):
        t=k*math.pi/6; b.sph(P,.37*math.sin(t),.5+.37*math.cos(t),.49,.016,.016,.015,BLACK,n=6)
    b.tube(P,[(0,.5,.49),(-.22,.63,.49)],.018,BLACK)
    b.tube(P,[(0,.5,.49),(.08,.81,.49)],.013,BLACK)


@asset('details','altar_home','altar_main','lectern','candle_rack')
def shrine_furniture(a,key,c):
    b=Detail(a)
    if key=='lectern':
        b.box('wood_dark',0,0,0,.85,.06,.85,tint=True)
        b.box('wood_dark',0,.06,-.05,.18,.72,.20,tint=True)
        # Raised back of the reading surface, with a retaining lip at the front.
        a.box('wood_dark',0,a.H*.78,0,a.W,a.H*.04,a.D,tint=True,rx=.3)
        b.box('wood_dark',0,.78,.44,.95,.05,.05,tint=True)
        b.box('paper',0,.84,.02,.62,.035,.60,CREAM)
    elif key=='candle_rack':
        for x in (-.40,.40): b.tube('metal_dark',[(x,0,-.4),(x,.72,0),(x,0,.4)],.035)
        b.box('metal_dark',0,.70,0,1,.06,.85)
        for k in range(6):
            x=-.4+k*.16; b.pot('candle_wax',x,.76,0,.035,.16)
            b.sph('candle_flame',x,.95,0,.018,.04,.02,n=6)
    else:
        home=key=='altar_home'; top=.58 if home else .90
        for x in (-.40,.40):
            for z in (-.35,.35): b.box('wood_painted',x,0,z,.10,top,.10,tint=True)
        b.box('wood_painted',0,top-.12,0,.88,.12,.80,tint=True)
        b.box('wood_dark',0,top,0,1,.05,1,tint=True)
        b.box('crochet_cover',0,top+.05,.02,.65,.015,.90)
        b.box('crochet_cover',0,top-.22,.455,.65,.28,.025)
        if home:
            b.box('wood_dark',0,top+.05,-.39,.48,.35,.08)
            b.box('plaster_statue',0,top+.09,-.34,.40,.26,.025)
            b.box('metal_chrome',0,top+.13,-.32,.035,.17,.012)
            b.box('metal_chrome',0,top+.23,-.31,.16,.025,.012)
        else:
            b.box('wood_dark',0,.28,.405,.045,.42,.03)
            b.box('wood_dark',0,.55,.405,.28,.04,.03)


@asset('details','statue_virgin','statue_saint_large','doll')
def figures(a,key,c):
    b=Detail(a); doll=key=='doll'; mary=key=='statue_virgin'
    skin=0xcaa383; robe=BLUE if mary else RED if not doll else 0xd39b72
    b.pot('wood_dark',0,0,0,.43,.07,n=10)
    a.lathe('plaster_statue' if not doll else 'fabric_bedding',0,a.H*.07,0,
        [(0,0),(.40,0),(.32,.18),(.22,.48),(.18,.65),(0,.68)],10,robe,scl=(a.W,a.H,a.D))
    b.sph('plaster_statue' if not doll else P,0,.84,0,.17,.13,.20,skin,n=10)
    b.sph('plaster_statue' if not doll else 'fabric_bedding',0,.91,-.06,.22,.08,.23,CREAM if mary else 0x594638)
    for s in (-1,1):
        b.tube('plaster_statue' if not doll else 'fabric_bedding',[(s*.17,.68,0),(s*.27,.49,.07),(s*.06,.55,.25)],.065,robe,n=6)
        b.sph('plaster_statue' if not doll else P,s*.055,.57,.25,.055,.05,.07,skin,n=6)
        b.sph(P,s*.06,.85,.185,.012,.013,.015,BLACK,n=6)


@asset('details','candles_set','vase_flowers')
def devotional(a,key,c):
    b=Detail(a)
    if key=='candles_set':
        b.box('metal_chrome',0,0,0,1,.07,1)
        for x,z,h in ((-.27,-.15,.77),(.25,-.20,.58),(.05,.27,.42)):
            b.pot('candle_wax',x,.07,z,.13,h)
            b.sph('candle_flame',x,h+.13,z,.045,.07,.06,n=6)
    else:
        b.pot('ceramic_white',0,0,0,.35,.48)
        for x,z,h,col in ((-.26,-.12,.85,'flower_red'),(.20,-.15,.95,'flower_yellow'),(.04,.23,.80,'flower_red')):
            b.tube('leaf_dark',[(0,.30,0),(x,h,z)],.025)
            for k in range(5):
                t=k*math.pi*2/5; b.sph(col,x+.07*math.cos(t),h,z+.07*math.sin(t),.065,.04,.065,n=6)
            b.sph('flower_yellow',x,h+.02,z,.045,.025,.045,n=6)


@asset('details','crucifix_wall','crucifix_large')
def crucifix(a,key,c):
    b=Detail(a); b.box('wood_dark',0,0,-.1,.16,1,.50,tint=True)
    b.box('wood_dark',0,.64,-.1,1,.13,.50,tint=True)
    b.sph('plaster_statue',0,.73,.28,.10,.08,.20,0xcab598)
    b.box('plaster_statue',0,.36,.24,.15,.31,.20,0xcab598)
    for s in (-1,1):
        b.tube('plaster_statue',[(0,.59,.24),(s*.39,.69,.24)],.055,0xcab598)
        b.tube('plaster_statue',[(s*.045,.37,.24),(s*.06,.14,.24)],.055,0xcab598)
    b.box('fabric_bedding',0,.33,.32,.22,.12,.15,CREAM)


@asset('details','plant_tin','plant_bucket','plant_pot_clay','plant_hanging','plant_big')
def plants(a,key,c):
    b=Detail(a); hanging=key=='plant_hanging'; tin=key=='plant_tin'
    py=.28 if hanging else 0; ph=.30 if not tin else .38
    b.pot(c['mat'],0,py,0,.34,ph,0x7c9a79 if tin else None,c['cols']=='plastic')
    if tin:
        for y in (.06,.29): b.pot('metal_steel',0,y,0,.35,.025)
    b.sph('floor_cement',0,py+ph*.89,0,.28,.015,.28,0x3e3024)
    if hanging:
        for t in (0,2.1,4.2): b.tube('metal_dark',[(.28*math.cos(t),.57,.28*math.sin(t)),(0,.98,0)],.012)
    for k in range(9 if key=='plant_big' else 6):
        t=k*2.4; height=(.50+(k%3)*.17) if not hanging else .64+(k%2)*.1
        x,z=math.cos(t)*.31,math.sin(t)*.31
        b.tube('leaf_dark',[(0,py+ph*.8,0),(x*.55,height*.75,z*.55),(x,height,z)],.018)
        # Low-poly leaves with an actual pointed outline and raised central vein.
        center=(x*.75,height-.07,z*.75); dx,dz=math.cos(t),math.sin(t)
        verts=[((center[0]-dx*.16)*a.W,(center[1]-.05)*a.H,(center[2]-dz*.16)*a.D),
               ((center[0]-dz*.065)*a.W,center[1]*a.H,(center[2]+dx*.065)*a.D),
               ((center[0]+dx*.16)*a.W,(center[1]+.09)*a.H,(center[2]+dz*.16)*a.D),
               ((center[0]+dz*.065)*a.W,center[1]*a.H,(center[2]-dx*.065)*a.D),
               (center[0]*a.W,(center[1]+.025)*a.H,center[2]*a.D)]
        a._emit('leaf_green' if k%2 else 'leaf_dark',(verts,[(0,1,0)]*5,[(0,0),(0,.5),(1,1),(1,.5),(.5,.5)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]),None,False,())


@asset('details','pot_stack','kettle','thermos_set','dish_rack','fruit_bowl','bread_basket','bottles_group')
def kitchen_clutter(a,key,c):
    b=Detail(a)
    if key=='pot_stack':
        for y,r,h in ((0,.37,.32),(.28,.31,.29),(.53,.27,.29)):
            b.pot('metal_steel',0,y,0,r,h)
            for s in (-1,1): b.tube('metal_dark',[(s*r,y+h*.6,0),(s*(r+.10),y+h*.8,0),(s*r,y+h*.95,0)],.035)
        b.pot('metal_steel',0,.82,0,.28,.07); b.sph('metal_dark',0,.94,0,.07,.04,.08)
    elif key=='kettle':
        b.pot('metal_steel',-.03,0,0,.34,.65)
        b.pot('metal_steel',-.03,.64,0,.34,.05)
        b.sph('metal_dark',-.03,.75,0,.065,.05,.075)
        b.tube('metal_steel',[(.20,.25,0),(.34,.42,0),(.44,.62,0)],.09)
        b.tube('metal_dark',[(-.30,.51,0),(-.27,.90,0),(.17,.90,0),(.24,.57,0)],.045)
    elif key=='thermos_set':
        for x,z,rr,hh,col in ((-.23,-.08,.20,.90,RED),(.23,-.08,.17,.72,BLUE)):
            b.pot('metal_steel',x,0,z,rr,hh,col)
            b.pot(P,x,hh,z,rr*.80,.09,BLACK)
            b.tube(P,[(x+rr*.8,hh*.75,z),(x+rr*1.30,hh*.65,z),(x+rr*1.30,hh*.35,z),(x+rr*.8,hh*.25,z)],.028,BLACK)
        for x in (-.2,.2): b.pot('ceramic_white',x,0,.30,.12,.22)
    elif key=='dish_rack':
        b.box(P,0,0,0,1,.10,1,BLUE)
        for z in (-.4,.4): b.tube('metal_steel',[(-.45,.12,z),(-.45,.32,z),(.45,.32,z),(.45,.12,z)],.018)
        for k in range(5):
            x=-.30+k*.15
            a.hcyl('ceramic_white',x*a.W,a.H*.52,0,min(a.H*.45,a.D*.40),a.W*.025,'x',12)
        b.pot('metal_steel',.40,.1,.28,.07,.55)
    elif key in ('fruit_bowl','bread_basket'):
        b.pot('ceramic_white' if key=='fruit_bowl' else 'wood_pine',0,0,0,.48,.48)
        for k in range(5):
            t=k*2.4; x,z=math.cos(t)*.25,math.sin(t)*.25
            if key=='fruit_bowl': b.sph('food_mango' if k%2 else 'food_lulo',x,.61,z,.15,.25,.15,n=8)
            else: b.sph('food_bread',x,.60,z,.22,.22,.12,n=8)
    else:
        for x,z,r,h,col in ((-.27,-.14,.15,.9,0x5d8365),(.22,-.12,.15,.74,0x986744),(0,.23,.13,.63,0x6b9b8e)):
            a.lathe(P,x*a.W,0,z*a.D,[(0,0),(r,0),(r,h*.62),(r*.40,h*.76),(r*.40,h),(0,h)],10,col,scl=(a.W,a.H,a.D))
            b.pot(P,x,h,z,r*.45,.06,CREAM)
            b.box('paper',x,h*.26,z+r*.95,r*1.5,h*.22,.01,CREAM)


@asset('details','books_stack','knickknacks','photo_frames','trophy_football','football','toy_pile','shoes_pair','school_bag')
def possessions(a,key,c):
    b=Detail(a)
    if key=='books_stack':
        for k,col in enumerate((RED,BLUE,0x607a51,0xb6a45e)):
            y=k*.24; x=(-1 if k%2 else 1)*.03
            b.box(P,x,y,0,.94,.21,.94,col)
            b.box('paper',x+.015,y+.035,.02,.86,.14,.88)
            b.box(P,x-.45,y,-.005,.04,.21,.95,col)
    elif key=='knickknacks':
        b.pot('ceramic_white',-.30,0,0,.15,.72)
        b.sph('ceramic_white',.04,.24,.10,.12,.24,.20,0xa38a68)
        b.sph('ceramic_white',.06,.52,.10,.07,.12,.10,0xa38a68)
        b.pot('metal_chrome',.32,0,-.08,.12,.52)
    elif key=='photo_frames':
        for x,y,z,w,h,col in ((-.23,0,-.16,.45,.95,0xc2a574),(.22,0,.18,.44,.73,0x8e7358)):
            b.box('wood_dark',x,y,z,w,h,.16,tint=True)
            b.box('paper',x,y+.06,z+.09,w-.10,h-.12,.025,col)
            b.sph(P,x,y+h*.61,z+.115,w*.14,h*.12,.01,0xb99173,n=8)
            b.box(P,x,y+.12,z+.115,w*.42,h*.31,.015,BLUE)
            b.tube('wood_dark',[(x,y+h*.7,z-.06),(x,y,z-.20)],.03)
    elif key=='trophy_football':
        b.box('wood_dark',0,0,0,.9,.12,.9)
        b.pot('metal_chrome',0,.12,0,.13,.45,0xd4af52)
        b.sph(P,0,.79,0,.30,.20,.30,0xcaa950,n=10)
        for s in (-1,1): b.tube('metal_chrome',[(s*.15,.63,0),(s*.42,.73,0),(s*.42,.40,0),(s*.12,.33,0)],.035,0xd4af52)
    elif key=='football':
        b.sph(P,0,.5,0,.49,.49,.49,CREAM,n=12)
        for k in range(6):
            t=k*math.pi/3
            b.sph(P,.47*math.sin(t),.5+.47*math.cos(t),0,.09,.09,.13,BLACK,n=6)
        for s in (-1,1): b.sph(P,0,.5,s*.48,.11,.11,.025,BLACK,n=6)
    elif key=='toy_pile':
        # Toy truck, stacking blocks and a little ball, all distinct silhouettes.
        b.box(P,-.16,.17,.15,.50,.28,.28,RED)
        b.box(P,-.30,.45,.15,.20,.35,.28,BLUE)
        for x in (-.34,.01):
            for z in (-.01,.31): b.disc('rubber_black',x,.17,z,.07,.07)
        for k,col in enumerate((BLUE,0xe5bb4f,0x6a9653)): b.box(P,.30,k*.21,-.20,.22,.21,.22,col)
        b.sph(P,-.17,.27,-.27,.13,.27,.13,0xe1bd47,n=10)
    elif key=='shoes_pair':
        for x in (-.25,.25):
            b.sph('rubber_black',x,.12,0,.22,.12,.49)
            b.sph('fabric_sofa',x,.40,-.03,.19,.30,.43,0x695443)
            b.sph('rubber_black',x,.62,-.22,.13,.15,.17)
            for z in (-.05,.06,.17): b.tube('fabric_bedding',[(x-.12,.64,z),(x+.12,.64,z+.04)],.025,CREAM)
    else:
        b.box('fabric_sofa',0,0,0,.9,.92,.65,BLUE,bevel=True)
        b.box('fabric_sofa',0,.08,.35,.65,.42,.25,0x9b4f3b,bevel=True)
        b.tube('fabric_bedding',[(-.23,.92,0),(-.20,.99,0),(.20,.99,0),(.23,.92,0)],.035,BLACK)
        for x in (-.30,.30): b.tube('fabric_sofa',[(x,.8,-.33),(x,.45,-.45),(x,.12,-.33)],.04,BLACK)


@asset('details','broom','mop_bucket','box_cardboard_s','box_cardboard_m','box_cardboard_l')
def utility(a,key,c):
    b=Detail(a)
    if key.startswith('box_cardboard'):
        b.box('cardboard',0,0,0,1,1,1)
        b.box(P,0,.997,0,.16,.003,1,0x9e855c)
        b.box(P,0,.78,.501,.16,.22,.002,0x9e855c)
        b.box('paper',-.22,.40,.502,.25,.22,.002,CREAM)
        for x in (-.29,-.23,-.17): b.box(P,x,.43,.504,.02,.15,.001,0x4e463a)
    elif key=='broom':
        b.box('wood_pine',0,.08,0,.9,.12,.35)
        for k in range(9): b.box('fabric_bedding',-.40+k*.10,0,0,.06,.13,.35,0xbca276)
        b.tube('wood_pine',[(0,.15,0),(.12,.99,-.10)],.032)
    else:
        b.pot(P,0,0,0,.46,.28,BLUE)
        b.tube('metal_steel',[(-.38,.26,0),(-.38,.40,0),(.38,.40,0),(.38,.26,0)],.018)
        b.tube('wood_pine',[(.12,.12,0),(-.16,.99,-.20)],.027)
        for k in range(6): b.tube('fabric_bedding',[(.12,.23,0),(.12+(k-3)*.055,.09,.13)],.03,CREAM)


@asset('details','cage_canary','pet_bed','cat_sitting','dog_sleeping','pigeon_loft')
def pets(a,key,c):
    b=Detail(a)
    if key=='cage_canary':
        b.pot(P,0,0,0,.47,.10,BLUE,n=12)
        for y in (.12,.67): b.pot('metal_chrome',0,y,0,.46,.018,n=12)
        for k in range(12):
            t=k*math.pi/6; x,z=.45*math.cos(t),.45*math.sin(t)
            b.tube('metal_chrome',[(x,.08,z),(x,.67,z),(0,.91,0)],.013)
        b.tube('wood_pine',[(-.42,.38,0),(.42,.38,0)],.025)
        b.sph('flower_yellow',0,.47,0,.13,.10,.12,n=8)
        b.sph('flower_yellow',.10,.56,.03,.07,.055,.07,n=8)
        b.sph(P,.13,.58,.08,.012,.012,.015,BLACK,n=6)
        b.tube('metal_chrome',[(0,.91,0),(0,.99,0),(.12,.99,0)],.02)
    elif key=='pet_bed':
        b.sph('fabric_sofa',0,.24,0,.48,.24,.48,0x866e54,n=12)
        b.pot('fabric_sofa',0,.20,0,.48,.65,0x866e54,n=12)
        b.sph('fabric_bedding',0,.48,0,.37,.16,.37,CREAM,n=12)
    elif key=='pigeon_loft':
        for x in (-.40,.40):
            for z in (-.35,.35): b.box('wood_old',x,0,z,.07,.95,.08)
        b.box('wood_old',0,.30,0,.9,.04,.9)
        b.box('wood_old',0,.88,0,1,.06,1)
        b.box('wood_old',0,.34,-.42,.9,.53,.06)
        for x in (-.42,0,.42): b.box('wood_old',x,.34,0,.04,.54,.88)
        for y in (.34,.59,.84): b.box('wood_old',0,y,0,.9,.035,.85)
        # Framed nesting openings, rather than a solid box masquerading as a loft.
        b.box('wood_old',0,.41,.46,1,.03,.12)
        b.sph('plastic_solid',-.20,.43,.35,.10,.05,.14,0x9ca1a2)
        b.sph('plastic_solid',-.16,.50,.40,.05,.04,.05,0x747d82)
        b.box('metal_painted',0,.94,0,1,.04,1,0x8a8273)
    else:
        cat=key=='cat_sitting'; mat='fur_cat' if cat else 'fur_dog'; col=0xc6b08e if cat else 0x956e47
        if cat:
            b.sph(mat,0,.36,-.10,.31,.35,.26,col,n=10)
            b.sph(mat,0,.73,.06,.34,.22,.24,col,n=10)
            for s in (-1,1):
                a.lathe(mat,s*a.W*.23,a.H*.85,a.D*.01,[(.10,0),(.01,.15)],6,col,scl=(a.W,a.H,a.D))
                b.sph(mat,s*.21,.09,.18,.11,.09,.20,col)
                b.sph(P,s*.13,.77,.28,.035,.025,.015,0x546b42,n=6)
            b.sph(P,0,.68,.30,.04,.025,.025,0x8f6657,n=6)
            b.tube(mat,[(.19,.1,-.21),(.39,.08,-.05),(.37,.06,.28),(.1,.06,.39)],.065,col)
        else:
            b.sph(mat,-.04,.38,0,.44,.32,.42,col,n=12)
            b.sph(mat,.26,.35,.12,.21,.25,.25,col,n=10)
            b.sph(mat,.37,.23,.27,.12,.12,.17,0xc4a783)
            b.sph('rubber_black',.44,.26,.32,.045,.05,.06)
            b.sph(mat,.18,.45,.27,.08,.18,.14,0x6f4b32)
            b.tube(mat,[(-.36,.24,-.10),(-.46,.13,.20),(-.24,.12,.35)],.10,col)


@asset('details','guitar_lean')
def guitar(a,key,c):
    b=Detail(a)
    b.sph('wood_pine',0,.25,0,.44,.23,.36,tint=True,n=12)
    b.sph('wood_pine',0,.43,0,.32,.16,.32,tint=True,n=12)
    b.box('wood_dark',0,.48,0,.13,.43,.20)
    b.box('wood_dark',0,.90,0,.21,.10,.23)
    b.disc('metal_dark',0,.36,.35,.12,.03)
    b.box('wood_dark',0,.17,.35,.33,.035,.10)
    for x in (-.035,0,.035): b.tube('metal_steel',[(x,.2,.39),(x,.93,.12)],.007)
    for k in range(7): b.box('metal_steel',0,.55+k*.045,.115,.13,.004,.015)
    for x in (-.13,.13):
        for y in (.91,.95,.99): b.sph('metal_chrome',x,y,0,.025,.012,.04,n=6)


@asset('details','rug_small','rug_big','doormat','curtain_window')
def textiles(a,key,c):
    b=Detail(a)
    if key=='curtain_window':
        # Alternating folds provide a front/back silhouette at side angles.
        for k in range(14):
            x=-.465+k*.0715; z=.20 if k%2 else -.20
            b.box('curtain_fabric',x,0,z,.0715,.96,.20,tint=True)
        b.box('curtain_fabric',0,.94,0,1,.06,.7,tint=True)
    else:
        b.box('rug_woven',0,0,0,1,.65,1)
        palette=(0xa54e3f,0xe1bd7c,0x353c36,0x667b68,0xa54e3f)
        for k,col in enumerate(palette): b.box(P,0,.66,-.36+k*.18,.86,.08,.075,col)
        if key!='doormat':
            for x in (-.47,.47):
                for k in range(12): b.box('fabric_bedding',x,.12,-.45+k*.082,.06,.12,.018,CREAM)
