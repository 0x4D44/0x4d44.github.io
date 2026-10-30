"""Storage, shop fit-outs and public-room furniture built from the shared catalogue.

Shop stock is authored with the fixture: shelves contain recognisable bottles,
books, fabric bolts, shoe pairs or hardware instead of generic empty cabinets.
"""
import math
from furn_lib import asset, shade, arc

FLAT='plastic_solid'
COLORS=(0xb33d35,0x4f7f52,0xd4b259,0x537b9b,0xe7ddc9)


def stock(A,goods,x,y,z,w,h,d,seed=0):
    """A compact shelf bay of semantic stock; dimensions are the available bay."""
    n=4 if w>.6 else 3
    for j in range(n):
        xx=x+(j-(n-1)/2)*w/n; col=COLORS[(j+seed)%len(COLORS)]
        if goods in ('tienda','cafe','barber'):
            r=min(w/n*.22,.035); hh=min(h*.7,.22)
            A.lathe(FLAT,xx,y,z,[(0,0),(r,0),(r,hh*.65),(r*.5,hh*.78),(r*.4,hh),(0,hh)],8,col=col)
            A.box('paper',xx,y+hh*.23,z+r*.91,r*1.7,hh*.27,.003)
        elif goods in ('pharma','papel','books'):
            ww=w/n*.7; hh=h*(.65+(.1 if j%2 else 0))
            A.box('paper' if goods=='pharma' else FLAT,xx,y,z,ww,hh,d*.7,None if goods=='pharma' else col)
            A.box(FLAT,xx,y+hh*.65,z+d*.351,ww*.85,.025,.003,col)
        elif goods=='shoes':
            for sx in (-1,1): A.box('rubber_black',xx+sx*w/n*.14,y,z,w/n*.24,h*.3,d*.83,r=.018)
        elif goods=='fabric':
            A.hcyl('fabric_bedding',xx,y+h*.23,z,h*.22,d*.85,'z',8,col=col)
        elif goods in ('ferre','parts'):
            A.box('cardboard',xx,y,z,w/n*.8,h*.4,d*.85)
            A.hcyl('metal_steel',xx,y+h*.54,z,.034,d*.65,'z',8)
        elif goods=='chips':
            A.box(FLAT,xx,y,z,w/n*.75,h*.76,d*.4,col,r=.015)
        else:
            A.box(FLAT,xx,y,z,w/n*.75,h*.5,d*.7,col)


@asset('shop','bookshelf','bookshelf_low','shoe_rack','cubby_shelf','wall_unit_big','wall_unit_small','display_cabinet','med_cabinet','trophy_case','shelf_wall','shelf_barber','shelf_tienda','shelf_ferre','shelf_pharma','shelf_papel','shelf_shoes','shelf_fabric','shelf_cafe','chips_rack','parts_shelf')
def shelves(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; wall=c.get('wall',False)
    if wall:
        A.box(m,0,0,0,W,.025,D,None,True)
        for sx in (-1,1): A.box(m,sx*W*.35,.025,-D*.42,.025,H-.025,.025,None,True)
        if c.get('goods'): stock(A,c['goods'],0,.025,0,W*.85,H-.025,D*.75)
        return
    t=.025; unit=key.startswith('wall_unit'); vitr=key in ('display_cabinet','med_cabinet','trophy_case')
    A.legs4(m,W,D,.06,.04,inset=.02)
    for sx in (-1,1): A.box(m,sx*(W/2-t/2),.04,0,t,H-.04,D,None,True)
    A.box(m,0,.04,-D/2+.009,W-.04,H-.04,.018,shade(.7),True)
    levels=4 if H>1.4 else 3 if H>.8 else 2
    if key=='cubby_shelf': levels=3
    if unit:
        for sx in (-1,1): A.box(m,sx*W*.2,.05,0,.022,H-.08,D-.02,None,True)
    for i in range(levels+1):
        y=.045+(H-.07)*i/levels
        A.box(m,0,y,0,W,t,D,None,True)
        if i==levels: continue
        hh=(H-.07)/levels-.04
        goods=c.get('goods','books' if 'bookshelf' in key else 'shoes' if key=='shoe_rack' else 'pharma' if key=='med_cabinet' else 'tienda')
        if unit:
            stock(A,'books',-W*.34,y+t,0,W*.25,hh,D*.7,i)
            if i==0:
                A.box('plastic_solid',0,y+t,0,W*.3,hh*.7,D*.66,0x27292b)
            else:
                A.lathe('ceramic_white',0,y+t,0,[(0,0),(.06,0),(.07,hh*.4),(.035,hh*.75),(.045,hh*.8)],10)
            stock(A,'tienda',W*.34,y+t,0,W*.25,hh,D*.7,i+2)
        elif key=='trophy_case':
            for x in (-W*.25,W*.25):
                A.box('wood_dark',x,y+t,0,.14,.03,.12)
                A.cyl('metal_chrome',x,y+t+.03,0,.018,hh*.3,8)
                A.lathe('metal_chrome',x,y+t+hh*.3,0,[(.015,0),(.06,hh*.25),(.065,hh*.45),(.056,hh*.45),(.045,hh*.26)],10)
        else: stock(A,goods,0,y+t,0,W-.09,hh,D*.7,i)
    if key=='cubby_shelf':
        for x in (-W/6,W/6): A.box(m,x,.06,0,.025,H-.1,D,None,True)
    if vitr:
        for sx in (-1,1):
            x=sx*W*.25
            A.box('glass',x,.07,D/2-.008,W*.48,H-.11,.006)
            A.box(m,x,.07,D/2,W*.48,.028,.015,None,True)
            A.box(m,x,H-.035,D/2,W*.48,.028,.015,None,True)
        A.box(m,0,.07,D/2,.025,H-.11,.02,None,True)
        for x in (-.035,.035): A.box('metal_chrome',x,H*.45,D/2+.016,.008,.12,.012)


@asset('shop','chest_trunk')
def trunk(A,key,c):
    W,H,D=A.W,A.H,A.D
    A.box('wood_old',0,.025,0,W,H-.025,D,None,True,r=.012)
    A.box('wood_dark',0,H*.76,0,W+.006,.014,D+.006)
    for x in (-W*.32,W*.32):
        A.box('metal_dark',x,.015,D/2+.001,.03,H-.015,.008)
        A.box('metal_dark',x,H-.007,0,.03,.014,D)
    A.box('metal_chrome',0,H*.67,D/2+.009,.05,.075,.01)
    for sx in (-1,1): A.tube('metal_dark',[(sx*W/2,H*.5,-.08),(sx*(W/2+.015),H*.43,-.08),(sx*(W/2+.015),H*.43,.08),(sx*W/2,H*.5,.08)],.008,6)


@asset('shop','shop_counter_glass','shop_counter_wood','shop_counter_short','fridge_meat','bread_case_glass','barber_station','pharmacy_counter','cafe_counter')
def counters(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']; glass=c.get('glass',False)
    A.box(m,0,.035,0,W,H*(.25 if glass else .94),D,None,True)
    A.box('formica' if not glass else 'metal_steel',0,H-.035,0,W+.012,.035,D+.012,None,not glass)
    if glass:
        for sx in (-1,1):
            for sz in (-1,1): A.box('metal_chrome',sx*(W/2-.018),H*.25,sz*(D/2-.018),.025,H*.75-.035,.025)
        for y in (H*.34,H*.64):
            A.box('metal_steel',0,y,0,W-.06,.014,D-.05)
            if 'bread' in key:
                for j in range(6): A.sph('food_bread',-W*.39+j*W*.155,y+.045,0,W*.065,.045,D*.19,8)
            elif key=='fridge_meat':
                for j in range(4): A.box('food_meat',-W*.32+j*W*.21,y+.014,0,W*.16,.07,D*.56,r=.018)
            else: stock(A,'pharma' if key=='pharmacy_counter' else 'tienda',0,y+.015,0,W-.12,H*.22,D*.65)
        A.box('glass',0,H*.26,D/2-.012,W-.045,H*.7,.006)
        for sx in (-1,1): A.box('glass',sx*(W/2-.01),H*.26,0,.006,H*.7,D-.045)
    else:
        for j in range(max(2,int(W/.5))):
            n=max(2,int(W/.5)); x=(j-(n-1)/2)*W/n
            A.box(m,x,.1,D/2+.001,W/n-.025,H-.17,.008,shade(.86),True)
        A.box('metal_dark',0,.045,D/2+.008,W-.05,.05,.012)
    if key=='barber_station':
        for j in range(4): A.cyl('plastic_solid',-W*.35+j*.12,H,-D*.15,.025,.13,8,col=COLORS[j])
    if key=='cafe_counter':
        A.box('metal_steel',-W*.27,H-.02,-D*.1,W*.26,.17,D*.42,r=.008)
        for j in range(3): A.cyl('ceramic_white',W*.12+j*.09,H,0,.03,.06,10)


@asset('shop','bread_rack','spinner_rack','rack_fabric','oven_baker')
def shop_racks(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']
    if key=='oven_baker':
        A.legs4('metal_dark',W,D,.12,.05,inset=.03)
        A.box('metal_steel',0,.1,0,W,H-.1,D)
        for i in range(3):
            y=.25+i*.48
            A.box('metal_dark',0,y,D/2+.001,W*.86,.34,.018)
            A.box('tv_off',0,y+.05,D/2+.013,W*.62,.19,.01)
            A.hcyl('metal_chrome',0,y+.3,D/2+.035,.012,W*.65,'x',8)
        for i in range(3): A.hcyl('plastic_solid',-W*.3+i*W*.3,H-.1,D/2+.02,.025,.02,'z',8,col=0x333333)
        return
    if key=='spinner_rack':
        A.cyl('metal_dark',0,0,0,W*.42,.03,12)
        A.cyl('metal_chrome',0,.03,0,.017,H-.03,8)
        for i in range(4):
            y=.2+i*H*.21
            A.box('metal_dark',0,y,0,W,.018,D)
            for j in range(3): A.box('paper',-W*.3+j*W*.3,y+.02,D*.25,W*.25,H*.16,.02,COLORS[(i+j)%5])
        return
    for sx in (-1,1):
        for sz in (-1,1): A.box(m,sx*(W/2-.012),0,sz*(D/2-.012),.024,H,.024,None,True)
    for i in range(5):
        y=.12+i*(H-.19)/4
        A.box('metal_steel' if key=='bread_rack' else m,0,y,0,W,.018,D,None,key!='bread_rack')
        if i==4: continue
        if key=='bread_rack':
            for x in (-W*.27,0,W*.27): A.sph('food_bread',x,y+.05,0,W*.11,.042,D*.31,8)
        else:
            for j in range(4): A.hcyl('fabric_bedding',-W*.34+j*W*.225,y+.08,0,.07,D*.9,'z',10,col=COLORS[(i+j)%5])


@asset('shop','crate_stack_mango','crate_stack_lulo','crate_stack_tomato','crate_stack_veg','fruit_crate_small','fruit_stand')
def produce(A,key,c):
    W,H,D=A.W,A.H,A.D; stand=key=='fruit_stand'; levels=1 if stand or key=='fruit_crate_small' else 3
    if stand: A.legs4('wood_pine',W,D,H*.65,.06,inset=.05)
    ch=(H*.35 if stand else H/levels)
    for i in range(levels):
        y=H*.65 if stand else i*ch
        for sx in (-1,1):
            for sz in (-1,1): A.box('wood_pine',sx*(W/2-.015),y,sz*(D/2-.015),.03,ch,.03)
        A.box('wood_pine',0,y,0,W,.025,D)
        for row in range(2):
            yy=y+.04+row*ch*.49
            for sz in (-1,1): A.box('wood_pine',0,yy,sz*(D/2-.01),W,.055,.02)
            for sx in (-1,1): A.box('wood_pine',sx*(W/2-.01),yy,0,.02,.055,D)
        if i==levels-1:
            n=8 if stand else 3
            r=min(W/(n*2.5),D*.2,ch*.26)
            for j in range(n):
                for k in range(2):
                    A.sph(c.get('fruit','food_mango'),-W*.36+j*W*.72/max(1,n-1),y+ch*.72,(-1 if k else 1)*D*.2,r,r*(.7 if 'mango' in key else 1),r,8)


@asset('shop','butcher_block','pipes_bundle','cement_sacks','paint_cans_stack','tool_pegboard','wheelbarrow','shoe_grinder','tire_stack')
def workshop_props(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key=='butcher_block':
        A.legs4('wood_old',W,D,H-.25,.09,inset=.04)
        A.box('wood_pine',0,H-.25,0,W,.25,D,r=.012)
        for i in range(5): A.box('wood_dark',-W*.35+i*W*.175,H+.001,0,.006,.002,D*.9)
        A.box('metal_steel',W*.2,H-.01,0,.12,.13,.012)
        A.box('wood_dark',W*.2,H+.11,0,.04,.08,.025)
    elif key=='pipes_bundle':
        for i in range(4):
            for j in range(2): A.hcyl('plastic_solid',0,.045+i*.06,(-.07 if j else .07),.028,W,'x',10,col=0xc9c4b5,caps=False)
        for x in (-W*.3,W*.3): A.box('metal_dark',x,.01,0,.025,H-.02,D)
    elif key=='cement_sacks':
        for i in range(3):
            A.box('cardboard',0,i*H/3,0,W*(.97 if i%2 else 1),H/3-.012,D,r=.035)
            A.box('plastic_solid',0,(i+1)*H/3-.005,0,W*.62,.004,D*.3,0x8f654b)
    elif key=='paint_cans_stack':
        for i in range(3):
            y=i*H/3
            A.cyl('metal_painted',0,y,0,W*.46,H/3-.01,12,col=COLORS[i])
            A.cyl('metal_chrome',0,y+H/3-.016,0,W*.46,.012,12)
            A.box('paper',0,y+.04,D*.46,W*.58,H/3*.48,.003)
    elif key=='tool_pegboard':
        A.box('plywood',0,0,-D*.25,W,H,D*.3)
        for j in range(6):
            x=-W*.4+j*W*.16
            A.box('metal_dark',x,.1,D*.05,.014,H*.65,.012)
            A.box('wood_pine',x,.16,D*.2,.025,H*.23,.023)
            A.box('metal_steel',x,H*.7,D*.15,W*.1,.04,.025)
        for x in (-W*.38,W*.38): A.hcyl('metal_chrome',x,H*.91,0,.012,D*.55,'z',6)
    elif key=='wheelbarrow':
        A.box('metal_painted',0,H*.47,-D*.1,W*.72,.035,D*.52,0x4b8060)
        for sx in (-1,1): A.box('metal_painted',sx*W*.38,H*.5,-D*.1,.035,H*.4,D*.6,0x4b8060,rz=-sx*.12)
        for sz in (-1,1): A.box('metal_painted',0,H*.5,-D*.1+sz*D*.3,W*.78,H*.4,.025,0x4b8060)
        for sx in (-1,1):
            A.tube('metal_dark',[(sx*W*.3,.13,-D*.4),(sx*W*.3,H*.42,0),(sx*W*.3,H*.58,D*.48)],.016,8)
            A.tube('metal_dark',[(sx*W*.3,H*.43,0),(sx*W*.3,.03,D*.15),(sx*W*.3,H*.43,D*.22)],.016,8)
        A.hcyl('rubber_black',0,.15,-D*.37,.15,.075,'x',14)
        A.hcyl('metal_steel',0,.15,-D*.37,.05,.081,'x',10)
    elif key=='shoe_grinder':
        A.box('metal_dark',0,0,0,W*.65,H*.65,D*.65)
        A.box('metal_painted',0,H*.65,0,W*.92,.12,D*.8,0x4c726d)
        A.hcyl('metal_dark',0,H*.86,0,.1,W*.6,'x',12)
        for sx in (-1,1): A.hcyl('rubber_black',sx*W*.4,H*.86,0,.14,.07,'x',14)
        A.box('metal_steel',0,H*.72,D*.35,W,.025,.12)
    elif key=='tire_stack':
        for i in range(4):
            y=i*H/4
            A.lathe('rubber_black',0,y,0,[(W*.27,0),(W*.45,0),(W*.5,.035),(W*.5,H/4-.035),(W*.45,H/4),(W*.27,H/4),(W*.25,H/4-.03),(W*.25,.03),(W*.27,0)],14)
            for j in range(12):
                a=j*math.tau/12
                A.box('plastic_solid',math.cos(a)*W*.49,y+.06,math.sin(a)*D*.49,.02,.07,.01,0x343434,ry=-a)


@asset('shop','cabin_pc','phone_booth','mannequin','fitting_curtain')
def shop_specials(A,key,c):
    W,H,D=A.W,A.H,A.D; m=c['mat']
    if key in ('cabin_pc','phone_booth'):
        for sx in (-1,1): A.box(m,sx*(W/2-.012),0,0,.024,H,D,None,True)
        A.box(m,0,0,-D/2+.01,W,H,.02,None,True)
        sh=.74 if key=='cabin_pc' else 1.0
        A.box(m,0,sh,0,W-.04,.03,D-.06,None,True)
        if key=='phone_booth':
            A.box('plastic_solid',0,1.13,-D*.43,.25,.3,.1,0x4c7e94,r=.015)
            A.box('plastic_solid',-.08,1.16,-D*.34,.05,.24,.05,0x222222,r=.01)
            for i in range(3):
                for j in range(4): A.box('metal_steel',.01+i*.04,1.16+j*.04,-D*.37,.024,.02,.012)
        else:
            A.box('plastic_solid',0,sh+.12,-D*.19,W*.53,.34,.07,0x25272a,r=.008)
            A.box('tv_screen_a',0,sh+.14,-D*.14,W*.48,.29,.006)
            A.box('plastic_solid',0,sh+.03,D*.21,W*.48,.02,D*.18,0x24272a)
        return
    if key=='mannequin':
        A.cyl('metal_dark',0,0,0,W*.46,.025,12)
        A.cyl('metal_chrome',0,.025,0,.015,H*.35,8)
        A.lathe('fabric_sofa',0,H*.3,0,[(0,0),(W*.35,0),(W*.42,H*.16),(W*.28,H*.27),(W*.4,H*.38),(W*.48,H*.49),(W*.23,H*.55),(W*.16,H*.63),(0,H*.63)],14,None,True,scl=(1,1,.68))
        A.cyl('wood_pine',0,H*.93,0,.035,H*.07,10)
        return
    for sx in (-1,1): A.cyl('metal_chrome',sx*(W/2-.02),0,-D*.45,.015,H,8)
    A.hcyl('metal_chrome',0,H-.015,-D*.45,.015,W,'x',8)
    A.hcyl('metal_chrome',-W*.45,H-.015,0,.015,D,'z',8)
    for i in range(10): A.box('curtain_fabric',-W*.45+i*W*.09,.035,-D*.44+(.015 if i%2 else -.015),W*.1,H-.08,.018,shade(.92 if i%2 else 1),True)
    for i in range(10): A.box('curtain_fabric',-W*.44+(.015 if i%2 else -.015),.035,-D*.45+i*D*.09,.018,H-.08,D*.1,shade(.92 if i%2 else 1),True)


@asset('shop','exam_bed','medical_scale','privacy_screen','iv_stand','wheelchair','motorbike')
def public_room(A,key,c):
    W,H,D=A.W,A.H,A.D
    if key=='exam_bed':
        A.legs4('metal_chrome',W,D,H-.16,.03,inset=.04,round_=True)
        A.box('metal_steel',0,H-.16,0,W,.025,D)
        A.box('vinyl_sofa',0,H-.135,D*.13,W-.04,.12,D*.7,None,True,r=.018)
        A.box('vinyl_sofa',0,H-.12,-D*.36,W-.04,.1,D*.26,None,True,r=.018,rx=-.13)
        for sx in (-1,1): A.box('metal_chrome',sx*W*.4,.24,0,.02,.02,D*.8)
    elif key=='medical_scale':
        A.box('enamel_white',0,0,D*.08,W,.07,D*.82,r=.008)
        A.box('rubber_black',0,.07,D*.08,W*.83,.008,D*.63)
        A.box('enamel_white',0,.07,-D*.34,.07,H-.14,.07)
        A.box('enamel_white',0,H-.14,-D*.34,W*.9,.14,.13)
        A.box('paper',0,H-.12,-D*.27,W*.78,.09,.005)
        for i in range(7): A.box('metal_dark',-W*.3+i*W*.1,H-.1,-D*.264,.005,.04 if i%2==0 else .025,.002)
        A.box('metal_dark',.015,H-.105,-D*.26,.006,.055,.003,rz=.2)
    elif key=='privacy_screen':
        for i in range(4):
            x=-W*.48+i*W*.32
            A.cyl('metal_chrome',x,0,0,.012,H,8)
            A.hcyl('metal_chrome',x,.012,0,.012,D,'z',8)
        for i in range(3):
            x=-W*.32+i*W*.32
            A.box('curtain_fabric',x,.18,0,W*.31,H-.22,.012,None,True)
            A.hcyl('metal_chrome',x,H-.015,0,.012,W*.32,'x',8)
    elif key=='iv_stand':
        A.cyl('metal_chrome',0,.03,0,.012,H-.05,8)
        for i in range(4):
            a=i*math.tau/4; x,z=math.cos(a)*W*.43,math.sin(a)*D*.43
            A.tube('metal_chrome',[(0,.12,0),(x,.035,z)],.01,6)
            A.sph('rubber_black',x,.025,z,.024,.024,.024,8)
        A.tube('metal_chrome',[(-W*.2,H-.11,0),(-W*.2,H-.02,0),(W*.2,H-.02,0),(W*.2,H-.11,0)],.009,6)
        A.box('plastic_solid',-W*.17,H-.36,0,.1,.23,.035,0xd4e6e0,r=.015)
        A.tube('plastic_solid',[(-W*.17,H-.36,0),(-W*.17,H-.55,.03),(-W*.1,H-.75,.06)],.003,5,col=0xd4e6e0)
    elif key=='wheelchair':
        A.box('vinyl_sofa',0,.42,0,W*.67,.035,D*.4,0x313538)
        A.box('vinyl_sofa',0,.45,-D*.23,W*.67,H-.48,.035,0x313538)
        for sx in (-1,1):
            x=sx*W*.44
            A.hcyl('rubber_black',x,.29,-D*.12,.29,.035,'x',18)
            A.hcyl('metal_chrome',x,.29,-D*.12,.255,.039,'x',18,caps=False)
            for j in range(8):
                a=j*math.tau/8
                A.tube('metal_chrome',[(x,.29,-D*.12),(x,.29+math.cos(a)*.25,-D*.12+math.sin(a)*.25)],.003,5)
            A.hcyl('rubber_black',sx*W*.33,.065,D*.34,.065,.03,'x',10)
            A.tube('metal_chrome',[(sx*W*.34,.065,D*.34),(sx*W*.34,.42,D*.18),(sx*W*.34,.44,-D*.23),(sx*W*.34,H,-D*.27)],.012,8)
            A.box('plastic_solid',sx*W*.38,.59,0,.045,.03,D*.45,0x26282a)
            A.box('metal_dark',sx*W*.25,.12,D*.43,W*.3,.025,D*.16)
    else:
        # Motorcycle: two tyres, rims/spokes, fork, tank, saddle, engine and exhaust.
        for z in (-D*.32,D*.32):
            A.hcyl('rubber_black',0,.28,z,.28,.105,'x',18)
            A.hcyl('metal_steel',0,.28,z,.2,.11,'x',16,caps=False)
            for j in range(8):
                a=j*math.tau/8
                A.tube('metal_steel',[(0,.28,z),(0,.28+math.cos(a)*.195,z+math.sin(a)*.195)],.004,5)
        for sx in (-1,1):
            A.tube('metal_dark',[(sx*.08,.28,-D*.32),(sx*.08,.66,-D*.13),(sx*.08,.74,D*.13),(sx*.08,.28,D*.32)],.018,8)
            A.tube('metal_chrome',[(sx*.09,.28,D*.32),(sx*.09,.88,D*.23)],.016,8)
        A.box('rubber_black',0,.73,-D*.18,W*.4,.075,D*.39,r=.025)
        A.sph('metal_painted',0,.76,D*.06,W*.2,.13,D*.16,12,None,True)
        A.box('metal_steel',0,.32,0,W*.37,.27,D*.23,r=.015)
        for y in (.36,.405,.45,.495): A.box('metal_dark',0,y,0,W*.4,.018,D*.24)
        A.tube('metal_chrome',[(-W*.45,H-.06,D*.18),(-W*.2,H,D*.12),(W*.2,H,D*.12),(W*.45,H-.06,D*.18)],.012,8)
        A.hcyl('enamel_white',0,.85,D*.28,.07,.035,'z',12)
        A.hcyl('metal_chrome',W*.25,.3,-D*.16,.035,D*.48,'z',10)
        A.box('metal_dark',0,.12,-D*.1,.025,.18,.035,rz=.35)
