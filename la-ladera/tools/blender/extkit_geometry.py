"""Original exterior-kit geometry, in metres and the furniture helper's game frame.

Every builder consumes an authored JSON record. Detail is modelled, not displaced;
the deliberately simpler LOD keeps the identifying outline and open spaces.
"""
import math
import random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
import furn_lib as F

TAU = 2 * math.pi


def mat(name):
    return 'extkit_' + name


def bar(a, material, points, radius=.012, far=False, colour=None, n=None, caps=True):
    a.tube(mat(material), points, radius, n=n or (4 if far else 12), col=colour, caps=caps)


def box(a, material, x, y, z, w, h, d, far=False, colour=None, rounded=False, **kw):
    a.box(mat(material), x, y, z, w, h, d, col=colour,
          r=0 if far or not rounded else min(.018, w*.15, h*.15, d*.15), **kw)


def ring(a, material, x, y, z, radius, thickness, far=False, plane='xz', n=None, colour=None):
    points=F.arc(x,y,z,radius,0,360,plane=plane,steps=n or (8 if far else 24))
    bar(a,material,points,thickness,far,colour,n=4 if far else 8,caps=False)


def mesh(a, material, points, triangles, colour=None, double=False, uvs=None):
    """Use explicit face normals for creases, cloth folds and leaf ridges."""
    pos=[]; normals=[]; uv=[]; faces=[]
    for tri in triangles:
        p=[points[i] for i in tri]
        normal=F._unit(F._cross(F._sub(p[1],p[0]),F._sub(p[2],p[0])))
        if F._len(F._cross(F._sub(p[1],p[0]),F._sub(p[2],p[0]))) < 1e-10:
            continue
        start=len(pos); pos.extend(p); normals.extend([normal]*3)
        uv.extend([uvs[i] if uvs else (points[i][0],points[i][1]) for i in tri])
        faces.append((start,start+1,start+2))
        if double:
            start=len(pos); pos.extend([p[2],p[1],p[0]])
            normals.extend([tuple(-v for v in normal)]*3)
            uv.extend([uvs[i] if uvs else (points[i][0],points[i][1]) for i in reversed(tri)])
            faces.append((start,start+1,start+2))
    a._emit(mat(material),(pos,normals,uv,faces),colour,False,())


def tank(a,item,far):
    p=item['params']; r=p['radius']; h=p['bodyHeight']; sh=p['standHeight']; colour=p['colour']
    # Raised flat ring supports keep the volume visually clear below the vessel.
    if p['stand']=='steel':
        for x in [-r*.77,r*.77]:
            for z in [-r*.77,r*.77]:
                box(a,'steel',x,0,z,.055,sh,.055,far)
                if not far: box(a,'rust_light',x,0,z,.13,.018,.13,far)
        for z in [-r*.77,r*.77]:
            box(a,'steel',0,sh-.045,z,r*1.7,.05,.055,far)
            bar(a,'steel',[(-r*.77,.09,z),(r*.77,sh-.08,z)],.013,far)
        for x in [-r*.77,r*.77]:
            box(a,'steel',x,sh-.045,0,.055,.05,r*1.7,far)
            if not far: bar(a,'rust_light',[(x,.1,-r*.77),(x,sh-.08,r*.77)],.012,far)
    else:
        # Two separate masonry piers, with visible mortar and an open middle.
        for x in [-r*.58,r*.58]:
            box(a,'concrete',x,0,0,r*.48,sh,r*1.52,far)
            if not far:
                box(a,'soil',x,sh*.5-.005,0,r*.485,.009,r*1.53,far,colour=0xaaaaaa)
                for z in [-r*.31,r*.31]:
                    box(a,'soil',x-r*.241,0,z,.004,sh*.49,.007,far,colour=0xb0b0b0)
        box(a,'concrete',0,sh-.035,0,r*1.75,.04,r*1.74,far)
    if far:
        profile=[(0,0),(.88*r,0),(r,.09*h),(r,.82*h),(.83*r,.94*h),(.28*r,h),(0,h)]
    else:
        profile=[(0,0),(.84*r,0),(.94*r,.035*h),(r,.1*h)]
        for t in [.25,.46,.67]:
            profile.extend([(r,t*h),(.965*r,(t+.024)*h),(r,(t+.048)*h)])
        profile.extend([(r,.81*h),(.96*r,.865*h),(.78*r,.94*h),(.28*r,h),(0,h)])
    a.lathe(mat(colour),0,sh,0,profile,n=8 if far else 24,crease=55)
    a.lathe(mat('black'),0,sh+h-.012,0,[(0,0),(.31*r,0),(.32*r,.033),(.29*r,.052),(0,.052)],n=6 if far else 20)
    if not far:
        for theta in range(0,360,60):
            angle=math.radians(theta)
            box(a,'black',math.cos(angle)*r*.3,sh+h+.012,math.sin(angle)*r*.3,.024,.026,.04,far,ry=-angle)
    # Float supply enters at the shoulder. The feed outlet drops to floor level.
    bar(a,'pvc',[(r*.71,sh+h*.93,0),(r*.71,sh+h+.13,0),(r+.11,sh+h+.13,0),(r+.11,sh+h*.72,0)],.018,far,n=4 if far else 10)
    bar(a,'pvc',[(-r*.94,sh+.15,0),(-r-.11,sh+.15,0),(-r-.11,.08,0),(-r-.02,.08,0)],.024,far,n=4 if far else 10)
    if not far:
        box(a,'paint',-r-.11,sh+.17,.035,.12,.021,.032,far,colour=0xd1523a)


_SHIRT=[(-.22,.16),(-.10,.02),(-.045,.015),(0,.07),(.045,.015),(.10,.02),(.22,.16),(.16,.27),(.115,.235),(.13,.62),(-.13,.62),(-.115,.235),(-.16,.27)]
_TROUSERS=[(-.18,0),(.18,0),(.16,.76),(.035,.78),(0,.33),(-.035,.78),(-.16,.76)]
_TOWEL=[(-.22,0),(.22,.015),(.225,.68),(-.20,.70)]


def garment(a,kind,x,y,z,scale,colour,far,phase=0):
    outline={'shirt':_SHIRT,'trousers':_TROUSERS,'towel':_TOWEL}[kind]
    vectors=[Vector((u,v,0)) for u,v in outline]
    tri=tessellate_polygon([vectors]); points=[]; faces=[]
    def lift(u,v):
        depth=(.012 if far else .038)*math.sin(30*u+phase)*(1-.65*math.exp(-v*8))
        depth+=.045*v*v+.012*math.sin(v*6+phase)
        return (x+scale*u,y-scale*v,z+scale*depth)
    for t in tri:
        corners=[(vectors[v].x,vectors[v].y) if isinstance(v,int) else (v.x,v.y) for v in t]
        if far:
            start=len(points);points.extend(lift(u,v) for u,v in corners); faces.append((start,start+1,start+2))
        else:
            q0,q1,q2=corners
            mids=[((q0[0]+q1[0])/2,(q0[1]+q1[1])/2),((q1[0]+q2[0])/2,(q1[1]+q2[1])/2),((q2[0]+q0[0])/2,(q2[1]+q0[1])/2)]
            start=len(points);points.extend(lift(u,v) for u,v in corners+mids)
            faces.extend(tuple(start+k for k in ids) for ids in [(0,3,5),(3,1,4),(5,4,2),(3,4,5)])
    mesh(a,'cloth',points,faces,colour,double=True)
    if not far:
        for dx in [-.10,.10]:
            box(a,'wood',x+dx*scale,y-.024,z,.018,.065,.024,far,colour=0xd4b678,rz=dx*.8)


def laundry(a,item,far):
    shape=item['params']['shape']; w,h,d=item['size']; colours=[0x9cc7d7,0xe6d8ba,0x887caa,0x3b526c,0xa55e55,0x7f9b7b,0xd8b45f,0xe2e1d5]
    if shape=='rotary':
        a.cyl(mat('steel'),0,0,0,.027,2.13,n=6 if far else 16)
        for theta in [0,math.pi/2,math.pi,math.pi*1.5]:
            end=(math.cos(theta)*1.12,1.92,math.sin(theta)*1.12)
            bar(a,'steel',[(0,1.6,0),end],.017,far)
        for radius in ([.66,1.08] if far else [.40,.65,.86,1.08]):
            corners=[(math.cos(t)*radius,1.92,math.sin(t)*radius) for t in [0,math.pi/2,math.pi,math.pi*1.5,TAU]]
            bar(a,'rope',corners,.005,far,n=3 if far else 6,caps=False)
        for i,(x,z) in enumerate([(-.48,.50),(.48,.50),(-.47,-.48),(.47,-.48)]):
            garment(a,['shirt','towel','trousers','shirt'][i],x,1.92,z,.95,colours[i],far,i)
        return
    length={'balcony':2.02,'roof':4.0,'pole':2.8}[shape]
    lineheight=1.02 if shape=='balcony' else 1.95
    linez=[-.23,.23] if shape=='roof' else [0]
    if shape=='balcony':
        for x in [-length/2,length/2]:
            box(a,'steel',x,0,-.22,.06,.28,.07,far)
            bar(a,'steel',[(x,.12,-.22),(x,1.02,.04)],.015,far)
    else:
        for x in [-length/2,length/2]:
            a.cyl(mat('steel'),x,0,0,.024,lineheight+.08,n=6 if far else 16)
            if shape=='roof': bar(a,'steel',[(x,lineheight,-.35),(x,lineheight,.35)],.016,far)
            if not far: box(a,'concrete',x,0,0,.16,.09,.16,far)
    count=4 if shape=='balcony' else 7 if shape=='roof' else 5
    for j,z in enumerate(linez):
        steps=3 if far else 14
        pts=[(-length/2+length*i/steps,lineheight-.10*math.sin(math.pi*i/steps),z) for i in range(steps+1)]
        bar(a,'rope',pts,.005,far,n=3 if far else 6,caps=False)
        for i in range(count if j==0 else 3):
            xx=-length*.4+length*.8*i/max(1,(count if j==0 else 3)-1)
            yy=lineheight-.10*math.sin(math.pi*(xx/length+.5))
            garment(a,['shirt','trousers','towel'][i%3],xx,yy,z,.80 if shape=='balcony' else 1.0,colours[(i+j*3)%len(colours)],far,i+j)


def dish(a,item,far):
    r=item['params']['radius']; centrey=r+.23; n=12 if far else 32; rings=2 if far else 5
    points=[(0,centrey,-.04)]; faces=[]
    for k in range(1,rings+1):
        rr=r*k/rings
        for j in range(n):
            t=j*TAU/n
            points.append((rr*math.cos(t),centrey+rr*math.sin(t),-.04+.18*(rr/r)**2+.10*rr*math.sin(t)))
    for j in range(n): faces.append((0,1+j,1+(j+1)%n))
    for k in range(rings-1):
        for j in range(n):
            p=1+k*n+j; q=1+k*n+(j+1)%n; v=p+n;u=q+n
            faces.extend([(p,q,v),(q,u,v)])
    mesh(a,'paint',points,faces,0xd9ded7,double=True)
    if not far:
        rim=[points[1+(rings-1)*n+j] for j in range(n)]+[points[1+(rings-1)*n]]
        bar(a,'steel',rim,.008,far,n=6,caps=False)
    bar(a,'steel',[(0,0,-.17),(0,centrey,-.17),(0,centrey,.02)],.025,far,n=6 if far else 12)
    bar(a,'steel',[(0,centrey-r*.55,.03),(0,centrey-r*.85,.36),(0,centrey-.02,.36)],.012,far,n=4 if far else 8)
    a.sph(mat('black'),0,centrey,.36,.035,.052,.045,n=6 if far else 16)
    box(a,'steel',0,.025,-.18,.18,.14,.035,far,rounded=True)


def aerial(a,item,far):
    shape=item['params']['shape']; length=item['params']['length']
    a.cyl(mat('steel'),0,0,0,.019,1.16,n=5 if far else 16)
    box(a,'steel',0,0,0,.17,.035,.13,far,rounded=True)
    if shape=='yagi':
        bar(a,'steel',[(-length/2,1.08,0),(length/2,1.08,0)],.011,far)
        for i in range(5 if far else 9):
            q=i/max(1,(4 if far else 8)); x=-length/2+length*q; width=.78-.38*q
            bar(a,'steel',[(x,1.08,-width/2),(x,1.08,width/2)],.006,far,n=3 if far else 8)
        if not far:
            loop=[(-length*.30+.06*math.cos(t),1.07,.23*math.sin(t)) for t in [i*TAU/16 for i in range(17)]]
            bar(a,'steel',loop,.006,far,n=6)
    else:
        for y in [.62,.96]:
            for sign in [-1,1]:
                points=[(0,y,0),(sign*.31,y+.14,0),(sign*.31,y-.14,0),(0,y,0)]
                bar(a,'steel',points,.007,far,n=3 if far else 10)
        if not far:
            for x in [-.28,0,.28]:
                bar(a,'steel',[(x,.42,-.11),(x,1.16,-.11)],.005,far,n=6)
    bar(a,'black',[(.025,.10,.025),(.055,.55,.025),(.035,1.0,.025)],.006,far,n=3 if far else 8)


def rebar(a,item,far):
    p=item['params']; length=p['length']; material='rust_'+p['rustLevel']
    for i,(x,z) in enumerate([(-.11,-.10),(.11,-.10),(.11,.10),(-.11,.10)]):
        hh=length*(.92+.026*i)
        bar(a,material,[(x,0,z),(x,hh*.82,z),(x+.02*(1 if i%2 else -1),hh,z)],.010,far,n=4 if far else 12)
        if not far:
            for k in range(3,12):
                y=hh*k/12
                bar(a,material,[(x-.011,y-.009,z-.01),(x+.011,y+.009,z-.01)],.003,False,n=4)
    for height in ([length*.25] if far else [length*.18,length*.46,length*.76]):
        bar(a,material,[(-.14,height,-.13),(.14,height,-.13),(.14,height,.13),(-.14,height,.13),(-.14,height,-.13)],.005,far,n=3 if far else 8)
    if not far:
        for x,z in [(-.11,-.1),(.11,.1)]:
            bar(a,'black',[(x-.025,length*.46,z),(x,length*.46+.025,z-.02),(x+.025,length*.46,z)],.003,far,n=4)


def gas_cage(a,item,far):
    n=item['params']['cylinders']; width=.55*n; depth=.51
    for x in [-width/2,width/2]:
        for z in [-depth/2,depth/2]:
            box(a,'rust_light',x,0,z,.035,.99,.035,far)
    for y in [.025,.96]:
        for z in [-depth/2,depth/2]:box(a,'steel',0,y,z,width,.035,.035,far)
        for x in [-width/2,width/2]:box(a,'steel',x,y,0,.035,.035,depth,far)
    for z in [-depth/2,depth/2]:
        for i in range(1, (3 if far else 6)*n):
            x=-width/2+width*i/((3 if far else 6)*n)
            bar(a,'steel',[(x,.06,z),(x,.95,z)],.007,far,n=3 if far else 8)
    for x in [-width/2,width/2]:
        for z in [-.12,.12]: bar(a,'steel',[(x,.06,z),(x,.95,z)],.007,far,n=3 if far else 8)
    for i in range(n):
        x=(i-(n-1)/2)*.55
        prof=[(0,.04),(.14,.04),(.18,.10),(.18,.53),(.15,.62),(.065,.67),(0,.67)]
        a.lathe(mat('paint'),x,0,0,prof,n=8 if far else 24,col=0xc5b3a0,crease=60)
        a.cyl(mat('steel'),x,.67,0,.025,.07,n=4 if far else 12)
        # Open protective collar around the valve.
        if far: bar(a,'steel',[(x-.07,.68,0),(x-.07,.78,0),(x+.07,.78,0),(x+.07,.68,0)],.012,far)
        else:
            ring(a,'steel',x,.77,0,.083,.012,far,n=20)
            for sign in [-1,1]:bar(a,'steel',[(x+sign*.08,.65,0),(x+sign*.08,.77,0)],.011,far,n=8)
            box(a,'paint',x,.715,.015,.08,.015,.025,far,colour=0x8d4a38)
        bar(a,'black',[(x,.72,0),(x+.12,.83,.02),(x+.16,.72,.08),(x+.19,.40,.09)],.009,far,n=4 if far else 8)
    box(a,'steel',width*.28,.47,depth/2+.018,.13,.035,.025,far,rounded=True)
    if not far: box(a,'black',width*.31,.43,depth/2+.035,.034,.045,.028,far)


def elbow(a,material,radius,far,colour):
    """An XY elbow with an analytic, untwisted frame at every bend sample."""
    steps=2 if far else 8; n=4 if far else 16
    points=[(0,0,0),(0,.13,0)]; tangents=[(0,1,0),(0,1,0)]
    for i in range(1,steps+1):
        angle=math.pi/2*i/steps
        points.append((.075-.075*math.cos(angle),.13+.075*math.sin(angle),0))
        tangents.append((math.sin(angle),math.cos(angle),0))
    points.append((.22,.205,0));tangents.append((1,0,0))
    pos=[];normals=[];uv=[];faces=[];length=0
    for i,(point,tangent) in enumerate(zip(points,tangents)):
        if i:length+=F._len(F._sub(point,points[i-1]))
        # +Z remains the same radial basis throughout. The second basis is
        # tangent x +Z, so the quarter bend cannot flip a ring by 180 degrees.
        across=F._cross(tangent,(0,0,1))
        for j in range(n):
            angle=TAU*j/n;c=math.cos(angle);s=math.sin(angle)
            normal=(across[0]*s,across[1]*s,c)
            pos.append(tuple(point[k]+radius*normal[k] for k in range(3)))
            normals.append(normal);uv.append((radius*angle,length))
    for i in range(len(points)-1):
        for j in range(n):
            p=i*n+j;q=i*n+(j+1)%n;u=p+n;v=q+n
            faces.extend([(p,v,u),(p,q,v)])
    for i,sign in [(0,-1),(len(points)-1,1)]:
        normal=tuple(sign*x for x in tangents[i]);start=len(pos)
        pos.append(points[i]);normals.append(normal);uv.append((0,0))
        for j in range(n):
            point=pos[i*n+j]
            pos.append(point);normals.append(normal);uv.append((point[0],point[2]))
        for j in range(n):faces.append((start,start+1+j,start+1+(j+1)%n))
    a._emit(mat(material),(pos,normals,uv,faces),colour,False,())
    return points


def pipe(a,item,far):
    p=item['params']; r=p['radius']; shape=p['shape']; m='pvc' if item['family']=='drain' else 'paint'; colour=0xf4eedf if m=='paint' else None
    if shape=='straight': points=[(0,0,0),(0,.96,0)]
    elif shape=='elbow':
        points=elbow(a,m,r,far,colour)
    elif shape=='tee':
        points=[(-.18,.17,0),(.18,.17,0)]
        bar(a,m,[(0,0,0),(0,.17,0)],r,far,colour,n=4 if far else 16)
    else:
        box(a,'steel',0,0,-.07,.12,.12,.025,far,rounded=True)
        ring(a,'steel',0,.06,.0,r+.015,.008,far,plane='xz',n=8 if far else 24)
        bar(a,'steel',[(0,.06,-.06),(0,.06,-r-.015)],.008,far,n=4 if far else 12)
        if not far:
            for x in [-.041,.041]: a.hcyl(mat('rust_light'),x,.06,-.055,.01,.025,'z',n=8)
        return
    if shape!='elbow':bar(a,m,points,r,far,colour,n=4 if far else 16)
    if not far:
        for point in [points[0],points[-1]]:
            direction=F._unit(F._sub(points[1],points[0])) if point==points[0] else F._unit(F._sub(points[-1],points[-2]))
            pp=[tuple(point[k]-direction[k]*.018 for k in range(3)),tuple(point[k]+direction[k]*.018 for k in range(3))]
            bar(a,m,pp,r*1.18,False,colour,n=16)


def meter(a,item,far):
    count=item['params']['count']; width=.40*count
    box(a,'paint',0,.15,0,width,.55,.17,far,colour=0xa5afa6,rounded=True)
    box(a,'steel',0,.17,.087,width-.035,.51,.018,far)
    for i in range(count):
        x=(i-(count-1)/2)*.40
        a.hcyl(mat('black'),x,.45,.109,.104,.018,axis='z',n=8 if far else 24)
        a.hcyl(mat('porcelain'),x,.45,.121,.088,.014,axis='z',n=8 if far else 24)
        box(a,'black',x,.452,.132,.115,.036,.005,far)
        if not far:
            for dx in [-.044,-.022,0,.022,.044]:
                box(a,'paint',x+dx,.464,.136,.007,.009,.002,far,colour=0xd6d2b5)
            for dx in [-.14,.14]: a.hcyl(mat('steel'),x+dx,.2,.107,.009,.008,axis='z',n=8)
        for j in range(2 if far else 4):
            xx=x+(j-1.5)*.017
            bar(a,'black',[(xx,.16,-.01),(xx,.075,.025),(xx+.055,.018,.033)],.006,far,n=3 if far else 8)
    if not far:
        bar(a,'pvc',[(-width*.4,.70,-.015),(-width*.4,.75,-.015)],.019,False,n=12)


def transformer(a,item,far):
    prof=[(0,.08),(.31,.08),(.34,.12),(.34,1.0),(.36,1.03),(.36,1.07),(0,1.07)]
    a.lathe(mat('paint'),0,0,0,prof,n=10 if far else 32,col=0x929e91)
    for theta in [-1.0,-.5,0,.5,1.0]:
        if far and theta in [-.5,.5]:continue
        x=math.sin(theta)*.36; z=math.cos(theta)*.36
        box(a,'paint',x,.24,z,.026,.60,.14,far,colour=0x829385,ry=theta)
        if not far:box(a,'steel',x,.24,z,.038,.018,.14,far,ry=theta)
    for x in [-.20,0,.20]:
        bprof=[(.04,0),(.055,.03),(.031,.07),(.055,.10),(.03,.14),(.049,.17),(.024,.22)] if not far else [(.045,0),(.035,.18),(.022,.22)]
        a.lathe(mat('porcelain'),x,1.07,0,bprof,n=6 if far else 16)
        bar(a,'steel',[(x,1.27,0),(x,1.33,0)],.009,far,n=4 if far else 10)
    for y in [.22,.85]:
        box(a,'steel',0,y,-.36,.90,.07,.065,far)
        for x in [-.38,.38]:bar(a,'steel',[(x,y,-.36),(x,y,-.49)],.015,far)
    bar(a,'black',[(-.20,1.3,0),(-.40,1.4,-.05),(-.47,.84,-.12)],.012,far)
    bar(a,'black',[(.20,1.3,0),(.40,1.36,-.04),(.47,.60,-.10)],.014,far)
    if not far:
        ring(a,'steel',-.19,1.04,.27,.04,.008,False,plane='xy',n=12)
        ring(a,'steel',.19,1.04,.27,.04,.008,False,plane='xy',n=12)
        box(a,'black',0,.52,.348,.18,.105,.006,far)


def cable(a,item,far):
    p=item['params'];r=p['radius'];length=p['length']
    if item['id'].endswith('bundle') and not far:
        for angle in [i*TAU/3 for i in range(3)]:
            y=r*.45*math.cos(angle);z=r*.45*math.sin(angle)
            bar(a,'black',[(-length/2,y,z),(length/2,y,z)],r*.57,False,n=12)
    else:bar(a,'black',[(-length/2,0,0),(length/2,0,0)],r,far,n=4 if far else 16)


def chalkboard(a,item,far):
    box(a,'wood',0,0,0,.61,.87,.045,far,colour=0xd0a66e,rounded=True)
    box(a,'chalk',0,.055,.026,.50,.76,.012,far)
    if not far:
        for x in [-.27,.27]:box(a,'wood',x,.025,.041,.037,.82,.026,far,colour=0x9c774a)
        for y in [.025,.83]:box(a,'wood',0,y,.041,.57,.035,.026,far,colour=0xb18b55)
        box(a,'wood',0,.025,.065,.58,.018,.06,far,colour=0xb08b56)
        for x in [-.23,.23]:a.hcyl(mat('steel'),x,.82,.055,.005,.012,'z',n=8)


def grille(a,item,far):
    pattern=item['params']['pattern']; m='paint'; col=[0x748272,0x4d5758,0xa3aaa0,0x738e90,0xa0a89a,0x414f4f,0x799095,0x628071][pattern]
    for x in [-.57,.57]:box(a,m,x,0,0,.045,1.18,.045,far,col,rounded=True)
    # Cross rails butt against the inner post faces, rather than overlapping
    # their front/top faces; the 1 mm forward weld offset remains deliberate.
    for y in [.02,1.135]:box(a,m,0,y,.001,1.095,.045,.045,far,col,rounded=True)
    def line(pts,r=.009,n=None):bar(a,m,pts,r,far,col,n=n or (3 if far else 12))
    if pattern==0:
        for x in [-.4,-.2,0,.2,.4]:line([(x,.04,0),(x,1.14,0)])
        line([(-.56,.42,0),(.56,.42,0)])
    elif pattern==1:
        for x in [-.37,0,.37]:line([(x,.04,0),(x,1.14,0)])
        for y in [.31,.59,.87]:line([(-.56,y,0),(.56,y,0)])
    elif pattern==2:
        for cx in [-.37,0,.37]:
            for cy in [.31,.87]:line([(cx-.17,cy,0),(cx,cy+.25,0),(cx+.17,cy,0),(cx,cy-.25,0),(cx-.17,cy,0)])
    elif pattern==3:
        for x in [-.5,-.25,0,.25,.5]:line([(0,.12,0),(x,1.13,0)])
        for rr in [.30,.52]:line(F.arc(0,.12,0,rr,0,180,plane='xy',steps=5 if far else 14))
    elif pattern==4:
        for x in [-.37,0,.37]:
            line([(x-.13,.04,0),(x-.13,.92,0)])
            line(F.arc(x,.92,0,.13,0,180,plane='xy',steps=4 if far else 12))
            line([(x+.13,.92,0),(x+.13,.04,0)])
    elif pattern==5:
        for x in [-.34,0,.34]:
            line([(x,.04,0),(x,1.14,0)])
            for y,sgn in [(.35,1),(.82,-1)]:
                steps=5 if far else 15
                pts=[]
                for i in range(steps+1):
                    t=i/steps;angle=t*TAU*1.13;rr=.145*(1-t*.75)
                    pts.append((x+sgn*rr*math.sin(angle),y+rr*math.cos(angle),0))
                line(pts,r=.007,n=3 if far else 8)
    elif pattern==6:
        for shift in [-.55,0,.55]:
            line([(-.55,.1+max(0,shift),0),(.55,1.08+min(0,shift),0)])
            line([(-.55,1.08+min(0,shift),0),(.55,.1+max(0,shift),0)])
    else:
        for x in [-.4,-.2,0,.2,.4]:
            pts=[(x,.04,0),(x,.30,.10),(x,.75,.10),(x,1.14,0)]
            line(pts)
        line([(-.55,.32,.10),(.55,.32,.10)])
        line([(-.55,.74,.10),(.55,.74,.10)])
    for x in [-.53,.53]:
        for y in [.12,1.02]:line([(x,y,0),(x,y,-.07)],r=.012,n=4 if far else 10)


def shutter(a,item,far):
    width=item['params']['width']
    # A 4 mm folded shell with closed ends, inset interior and bottom rim.
    # Outer and inner surfaces are distinct, never reversed coplanar faces.
    bevel_intercept=.38875-.004*math.sqrt(1+1.125**2)
    outside=[(.08,-.14),(.31,-.14),(.31,.07),(.22,.15),(.08,.15)]
    inside=[(.08,-.136),(.306,-.136),(.306,(bevel_intercept-.306)/1.125),
            (bevel_intercept-1.125*.146,.146),(.08,.146)]
    points=[(x,y,z) for x in [-width/2,width/2] for y,z in outside]
    points += [(x,y,z) for x in [-width/2+.004,width/2-.004] for y,z in inside]
    faces=[]
    for i in range(4):
        j=i+1
        faces.extend([(i,j,5+j),(i,5+j,5+i),
                      (10+i,15+j,10+j),(10+i,15+i,15+j)])
    for profile,offset,interior in [(outside,0,False),(inside,10,True)]:
        polygon=[Vector((0,y,z)) for y,z in profile]
        for triangle in tessellate_polygon([polygon]):
            ids=[v if isinstance(v,int) else polygon.index(v) for v in triangle]
            p,q,r=[points[offset+i] for i in ids]
            if F._cross(F._sub(q,p),F._sub(r,p))[0]<0:ids.reverse()
            if interior:ids.reverse()
            faces.append(tuple(offset+i for i in reversed(ids)))
            faces.append(tuple(offset+5+i for i in ids))
    outer_bottom=[0,5,9,4];inner_bottom=[10,15,19,14]
    for i in range(4):
        j=(i+1)%4
        faces.extend([(outer_bottom[i],outer_bottom[j],inner_bottom[j]),
                      (outer_bottom[i],inner_bottom[j],inner_bottom[i])])
    mesh(a,'paint',points,faces,0x9ca69b)
    if not far:
        for y in [.015,.043,.071]:box(a,'steel',0,y,.105,width-.035,.023,.024,far)
        for x in [-width*.5+.019,width*.5-.019]:
            box(a,'steel',x,0,.10,.026,.26,.03,far)
            a.hcyl(mat('rust_light'),x,.22,.15,.009,.012,'z',n=12)


def leaf(a,base,tip,width,material,colour,far,twist=0):
    vec=F._sub(tip,base);side=F._unit(F._cross(vec,(0,0,1) if abs(vec[1])>.05 else (0,1,0)))
    if far:
        mid=tuple(base[k]+vec[k]*.52 for k in range(3))
        points=[base,tuple(mid[k]+side[k]*width/2 for k in range(3)),tip,tuple(mid[k]-side[k]*width/2 for k in range(3))]
        mesh(a,material,points,[(0,1,2),(0,2,3)],colour,double=True)
    else:
        points=[base]
        for t,ww in [(.28,.8),(.61,1.0),(.84,.55)]:
            mid=tuple(base[k]+vec[k]*t for k in range(3));curve=math.sin(t*math.pi)*width*.25
            points.extend([tuple(mid[k]+side[k]*width*ww/2+(curve if k==2 else 0) for k in range(3)),tuple(mid[k]+(curve+width*.14 if k==2 else 0) for k in range(3)),tuple(mid[k]-side[k]*width*ww/2+(curve if k==2 else 0) for k in range(3))])
        points.append(tip);faces=[(0,1,2),(0,2,3)]
        for i in [1,4]:faces.extend([(i,i+3,i+1),(i+1,i+3,i+4),(i+1,i+4,i+2),(i+2,i+4,i+5)])
        faces.extend([(7,10,8),(8,10,9)])
        mesh(a,material,points,faces,colour,double=True)


def plant(a,item,far):
    kind=item['params']['kind'];height=item['size'][1];width=item['size'][0]
    pot_h=.22; r=.14; soil_y=.12+pot_h-.025
    # Ledge and two triangular brackets read clearly from below.
    box(a,'concrete',0,.085,-.025,min(width*.76,.55),.035,.36,far)
    for x in [-.14,.14]:
        bar(a,'steel',[(x,0,-.17),(x,.085,.12)],.009,far,n=3 if far else 8)
        bar(a,'steel',[(x,.085,.12),(x,.085,-.17)],.009,far,n=3 if far else 8)
    prof=[(.10,0),(.135,pot_h-.035),(.155,pot_h-.035),(.155,pot_h),(.13,pot_h),(.127,pot_h-.04)] if not far else [(.10,0),(.15,pot_h),(.13,pot_h),(.12,pot_h-.04)]
    a.lathe(mat('terracotta'),0,.12,0,prof,n=8 if far else 24,crease=55)
    a.cyl(mat('soil'),0,soil_y,0,.127,.008,n=7 if far else 20,col=0x8a7460)
    top=height-.015; rng=random.Random(kind)
    count=5 if far else 9
    if kind in ['sansevieria','aloe']:
        for i in range(count):
            theta=i*TAU/count+.3;spread=(.13 if kind=='sansevieria' else .27)*(1+.13*math.sin(i))
            yy=top-(.1 if kind=='sansevieria' else .17)*(i%3)
            base=(math.cos(theta)*.04,soil_y,math.sin(theta)*.04)
            tip=(math.cos(theta)*spread,yy,math.sin(theta)*spread)
            leaf(a,base,tip,.055 if kind=='sansevieria' else .09,'leaf',0x88a06b if i%2 else 0x547e54,far)
    elif kind=='fern':
        for i in range(5 if far else 6):
            theta=i*TAU/(5 if far else 6)
            stem=[(0,soil_y,0),(math.cos(theta)*.17,top,math.sin(theta)*.17),(math.cos(theta)*.34,top-.18,math.sin(theta)*.34)]
            bar(a,'leaf',stem,.004,far,0x557651,n=3 if far else 5)
            for j in range(2 if far else 3):
                t=.25+j*(.26 if far else .23);cx=math.cos(theta)*.34*t;cz=math.sin(theta)*.34*t
                # Leaflet bases lie on the same two straight segments as the
                # modelled frond. An unrelated sine used to leave them floating.
                cy=soil_y+(top-soil_y)*2*t if t<=.5 else top-.18*(2*t-1)
                for sign in [-1,1]:
                    tip=(cx+math.cos(theta+sign*.9)*.09,cy+.011,cz+math.sin(theta+sign*.9)*.09)
                    leaf(a,(cx,cy,cz),tip,.036,'leaf',0x6a9b65,far)
    elif kind=='pothos':
        # One upright crown and hanging heart-shaped foliage beyond the shelf.
        for i in range(4 if far else 7):
            theta=i*2.4;yy=soil_y+.22-.085*i
            x=.18*math.sin(theta);z=.11+.04*i
            base=(x*.6,max(.06,yy+.05),z-.04);tip=(x, max(.0,yy-.07),z+.02)
            bar(a,'leaf',[(0,soil_y,0),base,tip],.004,far,0x5a784a,n=3 if far else 5)
            leaf(a,base,tip,.115,'leaf',0x6b9b50,far)
        leaf(a,(0,soil_y,0),(.1,top,.03),.12,'leaf',0x7aa751,far)
    else:
        stem_top=top-.17
        bar(a,'wood',[(0,soil_y,0),(.015,stem_top,0)],.008,far,0x796a4b,n=4 if far else 8)
        for i in range(4 if far else 8):
            theta=i*2.4;yy=soil_y+.045+i*(stem_top-soil_y)/max(1,(4 if far else 8));reach=.17 if kind=='geranium' else .21
            base=(.01,yy,0);tip=(math.cos(theta)*reach,yy+.12,math.sin(theta)*reach)
            colour=0x799554 if kind=='geranium' else [0x8c9446,0xad7a3c,0x6f8b4c,0xa18b47][i%4]
            leaf(a,base,tip,.12 if kind=='geranium' else .082,'leaf',colour,far)
        if kind=='geranium':
            for x,z in [(-.11,.03),(.09,.02),(0,-.08)]:
                bar(a,'leaf',[(0,soil_y,0),(x,top-.05,z)],.004,far,0x799652,n=3 if far else 5)
                for j in range(3 if far else 6):
                    theta=j*TAU/(3 if far else 6)
                    a.sph(mat('cloth'),x+.035*math.cos(theta),top-.045,z+.035*math.sin(theta),.025,.018,.025,n=6 if far else 10,col=0xd47291)


def lattice(a,item,far):
    pattern=item['params']['pattern'];count=3;cell=.38;origin=-.38
    # Distinct open perforations, with continuous grid bed joints.
    for i in range(4):
        x=-.58+i*cell
        box(a,'concrete',x,0,0,.055,1.19,.14,far,rounded=True)
        # Separate the visible faces at rail/post intersections without changing
        # the open pattern or giving either layer a coplanar surface.
        box(a,'concrete',0,i*cell,.001,1.19,.055,.14,far,rounded=True)
    for ix in range(count):
        for iy in range(count):
            x=origin+ix*cell;y=.215+iy*cell
            if pattern=='square':
                if not far:
                    # Small inset lip gives real depth to each ventilation hole.
                    for xx in [x-.14,x+.14]:box(a,'concrete',xx,y-.14,.04,.022,.28,.025,far)
                    for yy in [y-.14,y+.12]:box(a,'concrete',x,yy,.04,.258,.022,.025,far)
            elif pattern=='diamond':
                for p,q in [((x-.16,y,0),(x,y+.16,0)),((x,y+.16,0),(x+.16,y,0)),((x+.16,y,0),(x,y-.16,0)),((x,y-.16,0),(x-.16,y,0))]:
                    bar(a,'concrete',[p,q],.027,far,n=4 if far else 12)
            else:
                for theta in [0,math.pi/2,math.pi,math.pi*1.5]:
                    cx=x+math.cos(theta)*.078;cy=y+math.sin(theta)*.078
                    ring(a,'concrete',cx,cy,0,.065,.018,far,plane='xy',n=5 if far else 8)


BUILDERS={'water_tank':tank,'laundry':laundry,'satellite_dish':dish,'tv_aerial':aerial,
          'rebar':rebar,'gas_cage':gas_cage,'pipe':pipe,'drain':pipe,'meter_box':meter,
          'transformer':transformer,'cable_segment':cable,'chalkboard':chalkboard,
          'grille':grille,'shutter_box':shutter,'plant':plant,'lattice':lattice}


def build(a,item,far=False):
    BUILDERS[item['family']](a,item,far)
    # The root is exactly the floor centre of the exported mesh envelope.
    # World placement uses anchor metadata; builders never bake a wall offset.
    lo=[min(p[k] for g in a.groups.values() for p in g.P) for k in range(3)]
    hi=[max(p[k] for g in a.groups.values() for p in g.P) for k in range(3)]
    offset=[-(lo[0]+hi[0])/2,-lo[1],-(lo[2]+hi[2])/2]
    for g in a.groups.values():
        g.P=[tuple(p[k]+offset[k] for k in range(3)) for p in g.P]
    a.lo=[lo[k]+offset[k] for k in range(3)];a.hi=[hi[k]+offset[k] for k in range(3)]
