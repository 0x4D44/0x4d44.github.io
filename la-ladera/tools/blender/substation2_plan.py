"""Deterministic visual yard data; no executable game integration or certified design."""
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


def make_plan():
    equipment=[]
    def add(id,asset,x,z,y=0,ry=0,**kw):
        rec=dict(id=id,asset='substation_'+asset,position=[x,y,z],rotationY=ry,**kw)
        equipment.append(rec)
        return rec
    # Coarse paving tiles are shared instances; the border is deliberately bare
    # rather than stretching a square stone texture across a 55 m plane.
    for ix,x in enumerate(range(-24,25,4)):
        for iz,z in enumerate(range(-18,19,4)):
            add(f'GRAVEL-{ix:02d}-{iz:02d}','gravel_tile',x,z,tags=['ground','repeat'])
    for ix,x in enumerate((4,8,12,16)):
        for iz,z in enumerate((11.5,15.5)):
            add(f'ROOM-FLOOR-{ix}-{iz}','concrete_tile',x,z,y=.12,tags=['ground','building'])
    for i,(x,size) in enumerate(((-17,'large'),(-4,'large'),(9,'small'),(19,'small')),1):
        add(f'BUND-T{i}','bund_'+size,x,1,y=.12,tags=['containment'])
        unit=add(f'T{i}','transformer_132_33' if i<3 else 'transformer_33_11',x,1,y=.58,
            voltageKV=[132,33] if i<3 else [33,11],mva=40 if i<3 else 15,
            bay=f'TRANSFORMER-{i}',tags=['transformer','live','hum100Hz'])
        if i==2: unit['materialOverrides']={'substation_plate_t1':'substation_plate_t2'}
    add('FIREWALL-T1-T2','firewall',-10.5,1,y=.12,tags=['containment'])
    for i,x in enumerate((-17,-4),1):
        add(f'PORTAL-132-{i}','gantry_132',x,-16,y=.12,tags=['live','gantry'])
        add(f'OCB-132-{i}','breaker_oil_132',x,-10,y=.12,bay=f'132-BAY-{i}',tags=['live'])
        for phase,dx in zip('ABC',(-2.7,0,2.7)):
            add(f'DS-132-{i}-{phase}','disconnector_centre_132',x+dx,-14.5,y=.12,ry=math.pi/2,bay=f'132-BAY-{i}',phase=phase,tags=['live'])
            add(f'CT-132-{i}-{phase}','ct_132',x+dx,-5.4,y=.12,phase=phase,tags=['live'])
            add(f'CVT-132-{i}-{phase}','cvt_132',x+dx,-18,y=.12,phase=phase,tags=['live'])
            add(f'LA-132-{i}-{phase}','arrester_132',x+dx,-3.6,y=.12,phase=phase,tags=['live'])
    for i,x in enumerate((9,19),1):
        add(f'PORTAL-33-{i}','gantry_33',x,-16,y=.12,tags=['live','gantry'])
        add(f'OCB-33-{i}','breaker_oil_33',x,-10,y=.12,bay=f'33-BAY-{i}',tags=['live'])
        for phase,dx in zip('ABC',(-1.2,0,1.2)):
            add(f'DS-33-{i}-{phase}','disconnector_centre_33',x+dx/1.2*1.6,-14,y=.12,ry=math.pi/2,bay=f'33-BAY-{i}',phase=phase,tags=['live'])
            add(f'CT-33-{i}-{phase}','ct_33',x+dx,-5.7,y=.12,phase=phase,tags=['live'])
            add(f'LA-33-{i}-{phase}','arrester_33',x+dx,-3.4,y=.12,phase=phase,tags=['live'])
    for i,(x,z) in enumerate(((-22,-10),(1,-10)),1):
        add(f'ES-132-{i}','earth_switch_132',x,z,y=.12,tags=['live','earthing'])
    # 18 x 9 m control building, modules with true openings and separate leaves.
    for side,z,ry in (('BACK',9,math.pi),('FRONT',18,0)):
        for j in range(6):
            x=3+j*3
            kind='wall_door' if side=='FRONT' and j==1 else ('wall_window' if j in (2,4) else 'wall_brick')
            add(f'CONTROL-{side}-{j}',kind,x,z,y=.12,ry=ry,tags=['building'])
            if kind=='wall_window':
                add(f'CONTROL-WINDOW-{side}-{j}','window',x,z,y=1.32,ry=ry,tags=['building'])
            elif kind=='wall_door':
                add('CONTROL-DOOR','door_steel',x,z,y=.20,ry=ry,tags=['building','door'])
    for side,x,ry in (('WEST',1.5,-math.pi/2),('EAST',19.5,math.pi/2)):
        for j in range(3): add(f'CONTROL-{side}-{j}','wall_brick',x,10.5+3*j,y=.12,ry=ry,tags=['building'])
        add(f'CONTROL-LOUVRE-{side}','louvre',x,15,y=2.25,ry=ry,tags=['building'])
    for ix in range(6):
        for iz in range(3):
            add(f'CONTROL-ROOF-{ix}-{iz}','roof_flat',2.5+3.2*ix,10.3+3.2*iz,y=3.32,tags=['building','roof'])
    for j in range(12):
        add(f'11KV-PANEL-{j+1:02d}','switchboard_panel_11',2.8+.84*j,10.2,y=.27,
            label=['T3 IN','FEEDER 1','FEEDER 2','FEEDER 3','FEEDER 4','BUS COUPLER','VT','FEEDER 5','FEEDER 6','FEEDER 7','FEEDER 8','T4 IN'][j],tags=['indoor','switchboard'])
    add('CONTROL-PANEL-1','control_panel',15,10.2,y=.27,tags=['indoor'])
    add('CONTROL-PANEL-2','control_panel',16,10.2,y=.27,tags=['indoor'])
    add('BATTERY-110V','battery_bank',16.5,16.4,y=.27,tags=['indoor'])
    add('BATTERY-CHARGER','battery_charger',13.4,16.4,y=.27,tags=['indoor'])
    add('OCB-11-SPARE','breaker_truck_11',11.8,15.5,y=.27,tags=['indoor','withdrawn'])
    add('OIL-STORE','oil_store',-22,15,y=.12,tags=['building','containment'])
    add('STATION-SERVICE','station_transformer',-21,8,y=.12,tags=['live'])
    for j,(x,z) in enumerate(((-25,-17),(25,-17),(-25,17),(24,17)),1):
        add(f'FLOOD-{j}','floodlight_mast',x,z,y=.12,tags=['light'])
    add('LIGHTNING-1','lightning_mast',24,7,y=.12,tags=['lightning'])
    # Closed fence footprint with an explicit 5 m opening for the south gate.
    for side,z,ry in (('N',-20,math.pi),('S',20,0)):
        for i in range(22):
            x=-26.25+2.5*i
            if side=='S' and -15<x<-10: continue
            add(f'FENCE-{side}-{i:02d}','fence_panel',x,z,y=.12,ry=ry,tags=['fence','repeat'])
    for side,x,ry in (('W',-27.5,-math.pi/2),('E',27.5,math.pi/2)):
        for i in range(16):
            add(f'FENCE-{side}-{i:02d}','fence_panel',x,-18.75+2.5*i,y=.12,ry=ry,tags=['fence','repeat'])
    posts={}
    for z,ry in ((-20,math.pi),(20,0)):
        for i in range(23):
            x=-27.5+2.5*i
            if z==20 and -15<x<-10: continue
            posts[(x,z)]=ry
    for x,ry in ((-27.5,-math.pi/2),(27.5,math.pi/2)):
        for i in range(1,16): posts[(x,-20+2.5*i)]=ry
    for i,((x,z),ry) in enumerate(posts.items()):
        add(f'FENCE-POST-{i:03d}','fence_post',x,z,y=.12,ry=ry,tags=['fence','repeat'])
    add('GATE-SOUTH','gate',-12.5,20,y=.12,tags=['gate','door'])
    for i,(x,z,ry) in enumerate(((-24,-20,math.pi),(24,-20,math.pi),(-27.5,0,-math.pi/2),(27.5,0,math.pi/2)),1):
        add(f'DANGER-FENCE-{i}','sign_danger',x,z,y=1.55,ry=ry,tags=['sign'])
    # Trench paths are data. Covers are individually repeated and do not form a
    # single 40 m mesh; their inset remains below the access route surface.
    for i in range(35): add(f'TRENCH-MAIN-{i:02d}','trench_cover',-17+i,6.6,y=.12,tags=['trench','repeat'])
    for i in range(5): add(f'TRENCH-ROOM-{i:02d}','trench_cover',8,7.1+i,y=.12,ry=math.pi/2,tags=['trench','repeat'])
    towers=[
        dict(id='TOWER-INCOMING',asset='substation_tower_suspension_132',position=[-18,0,-39],rotationY=0,external=True,tags=['tower','incoming']),
        dict(id='TOWER-OUTGOING',asset='substation_tower_terminal_132',position=[15,0,-39],rotationY=0,external=True,tags=['tower','outgoing']),
    ]
    spans=[]
    def span(id,start,end,sag,voltage=132,**kw):
        spans.append(dict(id=id,start=start,end=end,sag=sag,radius=.015 if voltage==132 else .011,segments=24,maxSegmentLength=1.2,voltageKV=voltage,**kw))
    # The tower's three vertical phase levels fan onto a flat portal arrangement.
    # Coordinates are explicit contact locations, not inferred from bounds.
    for i,(tx,gx,reach,heights) in enumerate(((-18,-17,5.67,(17.92,23.04,27.84)),(15,-4,-6.17,(16.8,21.6,26.1))),1):
        for phase,dx,ht in zip('ABC',(-3.24,0,3.24),heights):
            span(f'LINE-{i}-{phase}',[tx+reach,ht-1.9 if i==1 else ht,-39+(1.9 if i==2 else 0)],[gx+dx,9.27,-15.25],.9,132)
    for i,x in enumerate((-17,-4),1):
        for phase,dx,hv in zip('ABC',(-2.25,0,2.25),(-1.62,0,1.62)):
            dsx=x+(dx/2.25)*2.7
            span(f'BAY-{i}-PORTAL-{phase}',[x+(dx/2.25)*3.24,9.27,-15.25],[dsx,3.32,-15.92],.05,132)
            span(f'BAY-{i}-ISOLATOR-{phase}',[dsx,3.32,-13.08],[x+dx,4.34,-11.37],.08,132)
            span(f'BAY-{i}-CT-{phase}',[x+dx,4.34,-8.63],[x+(dx/2.25)*2.7,4.45,-5.4],.12,132)
            span(f'BAY-{i}-TRANSFORMER-{phase}',[x+(dx/2.25)*2.7,4.45,-5.4],[x+hv,6.91,.9],.24,132)
    for i,x in enumerate((9,19),1):
        for phase,dx,tx in zip('ABC',(-1.2,0,1.2),(-1.03,0,1.03)):
            span(f'MV-{i}-TRANSFORMER-{phase}',[x+dx,2.45,-5.7],[x+tx,5.05,1.12],.18,33)
    return dict(
        version=1,units='m',axes='+Y up; +Z front/south; X east',origin=[0,0,0],
        certification='Plausible visual layout, not engineering-certified; do not use for construction, switching, working distances, fire design, earthing or protection settings.',
        compound=dict(width=55,depth=40,bounds=[[-27.5,-20],[27.5,20]],groundLevel=.12),
        clearances=dict(phaseSpacing132=2.7,phaseSpacing33=1.2,minimumLiveHeightAtPerimeter=4,
            liveEquipmentSetbackFromFence=3.0,serviceAisleWidth=3.5,
            notes=['Phase spacings describe the open-yard bay reference, not every bushing on packaged equipment.',
                   '132 kV CVTs are near the north fence but their live contacts are elevated above reach; yard entry remains restricted.',
                   'Bund widths exceed transformer envelopes; raised plinths place the wheels above the gravel.',
                   'The firewall separates T1 and T2 visually; fire rating and oil volume are not calculated.',
                   'No civil, electrical, flood, foundation, step/touch-potential or conductor-swing certification is implied.']),
        equipment=equipment,towers=towers,
        bays=[dict(id='132-BAY-1',voltageKV=132,centre=[-17,-10],phaseSpacing=2.7),
              dict(id='132-BAY-2',voltageKV=132,centre=[-4,-10],phaseSpacing=2.7),
              dict(id='33-BAY-1',voltageKV=33,centre=[9,-10],phaseSpacing=1.2),
              dict(id='33-BAY-2',voltageKV=33,centre=[19,-10],phaseSpacing=1.2)],
        trenches=[dict(id='MAIN-CABLE-TRENCH',width=.6,depth=.7,polyline=[[-17.5,6.6],[17.5,6.6]]),
                  dict(id='CONTROL-ENTRY',width=.6,depth=.7,polyline=[[8,6.6],[8,12]])],
        fence=dict(polyline=[[-27.5,-20],[27.5,-20],[27.5,20],[-27.5,20],[-27.5,-20]],height=2.4,
                   gateGap=dict(fromPoint=[-15,20],toPoint=[-10,20]),outriggerHeight=.5),
        gate=dict(id='GATE-SOUTH',asset='substation_gate',position=[-12.5,.12,20],rotationY=0,width=5),
        building=dict(id='CONTROL',centre=[10.5,13.5],width=18,depth=9,height=3.52,front='+Z',panels=12,
                      interiorServiceAisle=dict(fromPoint=[2,12.3],toPoint=[18,12.3],width=1.8)),
        nav=dict(publicAccess=False,serviceRoute=[[-12.5,21],[-12.5,8],[0,8],[0,16],[6,16]],
                 note='Combine per-equipment keepOut polygons with door sweeps when integrating; this is placement data only.'),
        spans=spans,
        connectionNotes=['The 132 kV line loops via two outdoor bays; transformer and distribution connections are illustrative.',
                         '11 kV exits are underground via the declared trenches; no overhead 11 kV spans cross the access aisle.',
                         'Span transforms use the shared one-metre conductor segment; no long conductor mesh is shipped.'])


if __name__=='__main__':
    path=ROOT/'assets/models/substation2/substation2-plan.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(make_plan(),indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('SUBSTATION PLAN OK:',path)
