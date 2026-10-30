"""Bedroom, kitchen and bathroom furniture, authored in metres for the shared catalogue.

All meshes use the existing furniture library and named runtime materials. Small
fittings are geometry, not image decals; profiles have deliberately modest tessellation.
"""
import math
from furn_lib import asset, shade, arc

FLAT = 'plastic_solid'
BLACK = 0x25272a


def handle(A, x, y, z, length=.12, vertical=False):
    if vertical:
        A.tube('metal_chrome', [(x,y,z), (x,y,z+.018), (x,y+length,z+.018), (x,y+length,z)], .007, 6)
    else:
        A.tube('metal_chrome', [(x-length/2,y,z), (x-length/2,y,z+.018), (x+length/2,y,z+.018), (x+length/2,y,z)], .007, 6)


def mattress(A, y, h, w, d, pillows=True, flags=()):
    A.box('mattress_ticking',0,y,0,w,h,d,r=.025,flags=flags)
    A.box('fabric_bedding',0,y+h-.012,.02,w*.99,.022,d*.95,None,True,r=.008,flags=flags)
    if pillows:
        n=2 if w>1.2 else 1
        for i in range(n):
            x=0 if n==1 else (i-.5)*w*.48
            A.box('fabric_bedding',x,y+h+.01,-d*.32,w*.72/n,.07,d*.2,shade(.97),True,r=.025,flags=flags)
    A.box('blanket_andean',0,y+h+.012,d*.2,w,.014,d*.32,flags=flags)


@asset('home','bed_single','bed_single_metal','bed_double','bed_double_wood','bed_cot','bed_bunk','bed_crib','mattress_floor','mattress_leaning')
def beds(A,key,c):
    W,H,D=A.W,A.H,A.D
    m=c['mat']
    if key=='mattress_floor':
        mattress(A,0,H-.095,W,D)
        return
    if key=='mattress_leaning':
        A.box('mattress_ticking',0,0,0,W,H,D,r=.05)
        for yy in (.2,.6,1.0,1.4):
            for xx in (-W*.25,W*.25): A.sph('fabric_bedding',xx,yy,D/2,.012,.012,.004,6)
        return
    if key=='bed_crib':
        for sx in (-1,1):
            for sz in (-1,1): A.box(m,sx*(W/2-.025),0,sz*(D/2-.025),.05,H,.05,None,True,r=.007)
        mattress(A,.26,.1,W-.08,D-.08,False)
        for sx in (-1,1):
            A.box(m,sx*(W/2-.025),H-.045,0,.05,.045,D,None,True,r=.008)
            for j in range(9): A.box(m,sx*(W/2-.025),.37,-D*.42+j*D*.105,.018,H-.415,.018,None,True)
        for sz in (-1,1):
            A.box(m,0,H-.045,sz*(D/2-.025),W,.045,.05,None,True,r=.008)
            for j in range(4): A.box(m,-W*.3+j*W*.2,.37,sz*(D/2-.025),.018,H-.415,.018,None,True)
        return
    bunk=key=='bed_bunk'; cot=key=='bed_cot'
    levels=[.28,1.21] if bunk else [max(.16,min(.34,H-.22))]
    for sx in (-1,1):
        for sz in (-1,1):
            h=H if bunk else max(levels[0]+.04,H-.02) if sz<0 else levels[0]+.08
            if cot:
                A.tube('metal_painted',[(sx*W*.43,0,-D*.4),(sx*W*.43,levels[0],D*.4)],.018,8)
                A.tube('metal_painted',[(sx*W*.43,0,D*.4),(sx*W*.43,levels[0],-D*.4)],.018,8)
                break
            A.box(m,sx*(W/2-.028),0,sz*(D/2-.035),.055,h,.06,None,False,r=.006)
    for y in levels:
        A.box(m,0,y,0,W,.08,D,shade(.9),False)
        mattress(A,y+.08,min(.13,H-y-.19),W-.08,D-.1)
    if bunk:
        for sx in (-1,1):
            for y in (1.53,1.68): A.box(m,sx*(W/2-.028),y,0,.035,.035,D-.09)
        for x in (-W*.35,-W*.05): A.box(m,x,.03,D/2-.025,.03,1.62,.04)
        for i in range(5): A.box(m,-W*.2,.18+i*.28,D/2-.025,W*.3,.035,.04)
    elif not cot:
        A.box(m,0,H-.13,-D/2+.028,W-.05,.12,.05,None,False,r=.008)
        if 'metal' in key:
            for i in range(5): A.cyl(m,-W*.36+i*W*.18,levels[0]+.1,-D/2+.028,.008,H-levels[0]-.22,6)


@asset('home','nightstand_a','nightstand_b','wardrobe_2','wardrobe_3','wardrobe_metal','pantry_cabinet','locker_pair','kitchen_upper','counter_base','counter_base_long')
def cabinet(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; upper=c.get('wall',False)
    y0=0 if upper else .065
    if not upper: A.legs4('wood_dark',W,D,.075,.04,inset=.015)
    A.box(m,0,y0,0,W,H-y0,D,None,True,skip=('pz',))
    n=c.get('doors',3 if W>1.4 else 2 if W>.65 else 1)
    for i in range(n):
        x=-W/2+(i+.5)*W/n; dw=W/n-.012
        A.box(m,x,y0+.006,D/2-.014,dw,H-y0-.018,.026,shade(.97),True)
        if key.startswith('wardrobe') and 'metal' not in key:
            A.box(m,x,y0+.12,D/2+.001,dw-.1,H-y0-.24,.006,shade(.85),True)
        if 'locker' in key or 'metal' in key:
            for j in range(4): A.box('metal_dark',x,H-.15-j*.035,D/2+.001,dw*.55,.009,.004)
        handle(A,x+dw*.33,H*.45,D/2,.13,True)
    if key.startswith('counter'):
        A.box('formica',0,H-.04,0,W+.012,.04,D+.012,r=.006)
    if key.startswith('nightstand'):
        A.box('metal_dark',0,H*.7,D/2+.003,W-.05,.008,.004)


@asset('home','dresser_4','dresser_low','filing_cabinet','tool_cabinet_roll')
def drawers(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; roll=key=='tool_cabinet_roll'; y0=.085 if roll else .04
    A.box(m,0,y0,0,W,H-y0,D,None,True,skip=('pz',))
    n=5 if roll else 4
    for i in range(n):
        y=y0+i*(H-y0)/n+.005
        A.box(m,0,y,D/2-.012,W-.024,(H-y0)/n-.012,.025,shade(.96-i*.015),True)
        handle(A,0,y+(H-y0)/n*.65,D/2,min(.28,W*.45))
        if 'filing' in key: A.box('paper',0,y+.045,D/2+.005,.12,.04,.005)
    if roll:
        for sx in (-1,1):
            for sz in (-1,1): A.hcyl('rubber_black',sx*(W/2-.06),.04,sz*(D/2-.06),.04,.035,'x',10)
    else: A.legs4(m,W,D,.05,.045,inset=.025)


@asset('home','stove_gas')
def stove(A,key,c):
    W,H,D=A.W,A.H,A.D
    A.legs4('metal_dark',W,D,.08,.04,inset=.025)
    A.box('enamel_white',0,.07,0,W,H-.1,D,r=.008)
    A.box('metal_dark',0,.19,D/2+.001,W*.78,H*.48,.015,r=.018)
    A.box('tv_off',0,.24,D/2+.01,W*.65,H*.32,.012)
    handle(A,0,H*.73,D/2,W*.65)
    A.box('metal_steel',0,H-.03,0,W,.03,D)
    for sx in (-1,1):
        for sz in (-1,1):
            x,z=sx*W*.24,sz*D*.23
            A.cyl('metal_dark',x,H-.004,z,.075,.013,12)
            for d in (-1,1):
                A.box('metal_dark',x+d*.055,H+.006,z,.012,.018,.18)
                A.box('metal_dark',x,H+.006,z+d*.055,.18,.018,.012)
    for i in range(4): A.hcyl('plastic_solid',-W*.3+i*W*.2,H-.09,D/2+.012,.022,.025,'z',10,col=BLACK)


@asset('home','fridge','fridge_small','fridge_drinks','fridge_meds','washing_machine','photocopier')
def appliances(A,key,c):
    W,H,D=A.W,A.H,A.D
    A.legs4('rubber_black',W,D,.035,.045,inset=.02)
    A.box('enamel_white',0,.03,0,W,H-.03,D,r=.012,skip=('pz',) if key=='fridge_drinks' else ())
    if key=='washing_machine':
        A.box('plastic_solid',0,H-.12,D/2+.004,W-.03,.105,.014,0xd8d8cf)
        A.hcyl('metal_steel',0,H*.46,D/2+.018,W*.33,.025,'z',16)
        A.hcyl('tv_off',0,H*.46,D/2+.034,W*.26,.014,'z',16)
        A.hcyl('plastic_solid',W*.28,H-.065,D/2+.02,.034,.025,'z',10,col=BLACK)
        return
    if key=='photocopier':
        for y in (.1,.32):
            A.box('metal_dark',0,y,D/2+.005,W*.85,.008,.006)
            handle(A,0,y+.1,D/2,.2)
        A.box('plastic_solid',0,H-.05,0,W-.02,.05,D-.02,0xc3c9ca)
        A.box('tv_off',W*.24,H-.12,D/2+.008,W*.24,.08,.012)
        A.box('paper',-W*.2,H-.02,.06,W*.4,.024,D*.6)
        return
    if key=='fridge_drinks':
        A.box('plastic_solid',0,.12,-D*.42,W-.07,H-.24,.015,0xdce0d5)
        for j in range(4):
            y=.2+j*(H-.38)/4
            A.box('metal_steel',0,y,0,W-.1,.018,D-.1)
            for i in range(5):
                x=-W*.32+i*W*.16
                A.cyl('plastic_solid',x,y+.02,D*.17,.027,.18,8,col=(0x4a7544,0xad4537,0xd3ac41)[i%3])
                A.box('paper',x,y+.07,D*.17+.028,.045,.05,.004)
        A.box('glass',0,.13,D/2+.001,W-.075,H-.27,.006)
        for sx in (-1,1): A.box('enamel_white',sx*(W/2-.022),.11,D/2,.044,H-.22,.025)
        for yy in (.11,H-.15): A.box('enamel_white',0,yy,D/2,W-.04,.04,.025)
        handle(A,W*.42,H*.45,D/2,.27,True)
    else:
        split=H*.73 if H>1 else H*.86
        A.box('metal_dark',0,split,D/2+.002,W-.025,.009,.004)
        handle_h=min(.16,H*.15)
        for y in (min(split+.03,H-handle_h-.02),max(.08,split-.23)): handle(A,W*.37,y,D/2,handle_h,True)
        for i,col in enumerate((0xa63e35,0x4b8a65,0xe7bc41)):
            A.box('plastic_solid',-W*.22+i*.1,H*.57+i*.045,D/2+.006,.055,.06,.009,col,flags=('magnets',))


def basin_bowl(A,x,y,z,w,d,mat='ceramic_white'):
    # Elliptical open bowl, with a visible inner surface and a flat rim.
    A.lathe(mat,x,y,z,[(0,0),(w*.3,0),(w*.5,.09),(w*.5,.12),(w*.44,.12),(w*.35,.035),(0,.028)],16,scl=(1,1,d/w))
    A.cyl('metal_chrome',x,y+.03,z,.016,.005,10)


def faucet(A,x,y,z,h=.18):
    A.tube('metal_chrome',[(x,y,z),(x,y+h*.75,z),(x,y+h,z+.04),(x,y+h,z+.1),(x,y+h-.025,z+.11)],.011,8)
    for sx in (-1,1): A.box('metal_chrome',x+sx*.055,y+.01,z,.035,.018,.025)


@asset('home','sink_kitchen','lavadero','basin_pedestal','basin_vanity')
def sinks(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key.startswith('basin'):
        if key=='basin_pedestal': A.lathe('ceramic_white',0,0,-D*.08,[(0,0),(.13,0),(.1,.06),(.075,H*.65),(.14,H-.12),(0,H-.12)],12)
        else:
            A.box('wood_painted',0,.04,0,W*.87,H-.16,D*.88,None,True)
            for sx in (-1,1): handle(A,sx*W*.08,H*.45,D*.45,.1,True)
        basin_bowl(A,0,H-.12,.01,W,D)
        faucet(A,0,H,-D*.36,.15)
        return
    if key=='sink_kitchen':
        A.box(c['mat'],0,.06,0,W,H-.1,D,None,True)
        for sx in (-1,1):
            A.box('wood_painted',sx*W*.25,.09,D/2+.003,W*.48,H-.22,.015,shade(.96),True)
            handle(A,sx*W*.1,H*.68,D/2,.12,True)
        A.box('metal_steel',W*.25,H-.035,0,W*.5,.035,D)
        for i in range(6): A.box('metal_chrome',W*.05+i*W*.075,H-.003,0,.008,.004,D*.75)
        basin_bowl(A,-W*.23,H-.12,0,W*.43,D*.84,'metal_steel')
        faucet(A,-W*.23,H,-D*.35)
    else:
        A.legs4('floor_cement',W,D,H-.14,.11,inset=.02)
        basin_bowl(A,-W*.22,H-.15,0,W*.5,D,'floor_cement')
        A.box('floor_cement',W*.25,H-.15,0,W*.5,.12,D)
        for i in range(8): A.box('floor_cement',W*.25,H-.018,-D*.4+i*D*.11,W*.4,.012,.018)
        faucet(A,0,H,-D*.35)


@asset('home','toilet')
def toilet(A,key,c):
    W,H,D=A.W,A.H,A.D
    A.lathe('ceramic_white',0,0,.08,[(0,0),(.13,0),(.12,.12),(.1,.18),(.19,.34),(.2,.39),(.17,.405),(.13,.31),(0,.28)],16,scl=(1,1,1.32))
    A.lathe('plastic_solid',0,.39,.08,[(.13,0),(.2,0),(.2,.024),(.135,.024),(.13,0)],16,col=0xeeeae0,scl=(1,1,1.32))
    A.box('ceramic_white',0,.37,-D*.33,W*.94,H-.37,.18,r=.018)
    A.box('ceramic_white',0,H-.025,-D*.33,W,.025,.2,r=.006)
    A.box('metal_chrome',W*.29,H-.1,-D*.225,.07,.026,.016)


@asset('home','shower_tray','shower_head_electric')
def shower(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key=='shower_tray':
        A.box('wall_tile',0,0,0,W,.045,D)
        for sx in (-1,1): A.box('ceramic_white',sx*(W/2-.025),.04,0,.05,.05,D)
        for sz in (-1,1): A.box('ceramic_white',0,.04,sz*(D/2-.025),W-.1,.05,.05)
        A.cyl('metal_steel',.22,.046,.22,.04,.006,12)
        A.tube('plastic_solid',[(0,.85,-D*.42),(0,H-.22,-D*.42),(0,H-.15,-D*.2)],.014,8,col=0xdedbd0)
        A.cyl('plastic_solid',0,H-.24,-D*.2,.075,.09,12,col=0xeeeae0)
        A.cyl('metal_steel',0,H-.245,-D*.2,.065,.006,12)
        for sx in (-1,1): A.hcyl('metal_chrome',sx*.085,1.0,-D*.4,.022,.04,'z',8)
    else:
        A.tube('plastic_solid',[(0,0,-D*.3),(0,H-.12,-D*.3),(0,H-.08,.01)],.013,8,col=0xdedbd0)
        A.cyl('plastic_solid',0,H-.15,.01,.075,.09,12,col=0xeeeae0)
        A.cyl('metal_chrome',0,H-.155,.01,.065,.006,12)
        A.tube('metal_dark',[(.04,H-.07,-.02),(.07,H-.02,-.05),(.08,H,-.06)],.003,5)


@asset('home','gas_cylinder','water_stand','bucket_big','laundry_basket','trash_bin','oil_drum','water_tank_small')
def containers(A,key,c):
    W,H,D=A.W,A.H,A.D; r=min(W,D)/2; m=c['mat']; tint=c.get('cols') not in ('none','white'); col=c.get('pc')
    if key=='gas_cylinder':
        A.lathe(m,0,0,0,[(0,0),(r*.7,0),(r*.72,.035),(r,.09),(r,H*.72),(r*.75,H*.85),(r*.28,H*.9),(0,H*.9)],14,col=col)
        A.cyl('metal_chrome',0,H*.88,0,.018,H*.075,8)
        A.box('plastic_solid',0,H*.94,0,.075,.018,.025,0x242424)
        A.lathe(m,0,0,0,[(r*.54,H*.88),(r*.54,H),(r*.47,H),(r*.47,H*.88)],12,col=col)
    elif key=='water_stand':
        A.legs4('metal_painted',W*.8,D*.8,H*.48,.023,inset=.008)
        A.lathe('plastic_solid',0,H*.4,0,[(0,0),(r*.8,0),(r*.94,.035),(r*.94,H*.35),(r*.6,H*.48),(r*.3,H*.5),(r*.3,H*.57),(0,H*.57)],14,col=0x7fb4d8)
        A.box('plastic_solid',0,H*.5,r*.9,.045,.025,.06,0xeeeeea)
    else:
        open_=key in ('bucket_big','laundry_basket')
        y=min(H*.9,H-r*.85) if open_ else H
        A.lathe(m,0,0,0,[(0,0),(r*.8,0),(r,y-.025),(r,y),(r-.018,y),(r*.8-.012,.025),(0,.025)] if open_ else [(0,0),(r*.9,0),(r,.04),(r,H-.04),(r*.9,H),(0,H)],14,col,tint)
        for h in ((H*.1,H*.85) if 'drum' in key else (H*.35,H*.65) if 'tank' in key else (y-.025,)):
            A.lathe(m,0,0,0,[(r-.007,h),(r+.006,h),(r+.006,h+.018),(r-.007,h+.018)],14,col,tint)
        if open_:
            A.tube('metal_dark',arc(0,y-.025,0,r*.82,0,180,'xy',8),.008,6)
        if key=='laundry_basket':
            for i in range(12):
                t=i*math.tau/12
                A.box('plastic_solid',math.cos(t)*r*.89,y*.2,math.sin(t)*r*.89,.022,y*.6,.012,shade(.4),True,ry=-t)
        if key=='water_tank_small': A.cyl('plastic_solid',0,H-.012,0,r*.38,.012,12,col=0x193655)


@asset('home','drying_rack','clothesline','ironing_board')
def laundry(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key=='clothesline':
        pts=[(-W/2,H,0),(0,H-.06,0),(W/2,H,0)]
        A.tube('metal_dark',pts,.004,5)
        for i,col in enumerate((0xe3dfd0,0x568ac0,0xc35a63,0x71964d,0xc9b16d)):
            x=-W*.38+i*W*.19; y=H-.06-abs(x)*-.025
            A.box('fabric_bedding',x,max(0,y-H*.78),0,W*.14,H*.78,.012,col)
            for sx in (-1,1): A.box('wood_pine',x+sx*W*.048,y-.02,.008,.014,.035,.012)
        return
    for sx in (-1,1):
        A.tube('metal_painted',[(sx*W*.38,0,-D*.36),(sx*W*.38,H*.94,D*.38)],.012,8)
        A.tube('metal_painted',[(sx*W*.38,0,D*.36),(sx*W*.38,H*.94,-D*.38)],.012,8)
    if key=='ironing_board':
        A.box('fabric_bedding',0,H-.035,0,W,.035,D,None,True,r=.06)
        A.box('metal_dark',W*.35,H-.065,0,W*.2,.02,D*.7)
    else:
        for j in range(6): A.hcyl('metal_chrome',0,H-.015,-D*.45+j*D*.18,.005,W,'x',6)
        A.box('towel_terry',-.2,H-.44,.05,.3,.42,.012,0xc6b9d1)


@asset('home','mirror_bath','mirror_wall','mirror_barber','towel_rail','pot_rack_wall','coat_rack_wall','meat_hooks')
def wall_fittings(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key.startswith('mirror'):
        A.box('wood_dark',0,0,0,W,H,D)
        A.box('mirror',0,.018,D/2+.002,W-.036,H-.036,.004)
        return
    m='metal_chrome' if key in ('towel_rail','meat_hooks','pot_rack_wall') else c['mat']
    A.box(m,0,H-.04,-D*.3,W,.04,.022,None,key=='coat_rack_wall')
    n=4 if W<1 else 7
    for i in range(n):
        x=-W*.4+i*W*.8/(n-1)
        A.tube(m,[(x,H-.02,-D*.3),(x,H-.06,D*.25),(x,H-.09,D*.35),(x,H-.11,D*.25)],.006,6)
        if key=='pot_rack_wall':
            A.hcyl('metal_steel',x,H*.36,.01,H*.2,.028,'z',12)
            A.box('metal_dark',x,H*.47,.01,.012,H*.32,.018)
    if key=='towel_rail': A.box('towel_terry',0,0,D*.36,W*.56,H*.86,.014,None,True)
