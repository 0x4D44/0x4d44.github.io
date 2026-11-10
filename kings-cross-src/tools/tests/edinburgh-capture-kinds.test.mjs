import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as C from '../train-capture.mjs';
import {planCatalogueViews,planMotion} from '../train-framing.mjs';
import {EDINBURGH_CAPTURE_PAIRS,EDINBURGH_FLEET,disposeEdinburghTrain,evidenceBuildEdinburgh} from '../../web/src/edinburgh-fleet.ts';

const dim=(value,basis='assumed')=>({value,basis,figures:['test']});
const formation=()=>({family:'test',classes:'999',classNote:null,length:40,half:1.4,crown:3.5,coverHeight:.2,roofTop:3.7,doorWidth:1.3,
  cars:[{index:0,type:'DM',length:20,start:0,end:20,cab:'front',bogies:[3,17],motor:[true,false],pantograph:null,doors:[5,15]},
    {index:1,type:'DM',length:20,start:20,end:40,cab:'rear',bogies:[23,37],motor:[false,true],pantograph:[29,31],doors:[25,35]}],
  dimensions:{lengthM:dim(40),widthM:dim(2.8,'published'),roofTopM:dim(3.7)}});
const row=(kind,f=formation)=>({kind,operator:'SR',operatorName:'Test',classes:['999'],cars:2,layout:()=>f(),build:()=>null,dispose:()=>{},formation:f});

test('a Waverley row with a formation is described for the view planner under its own kind', () => {
  const f=C.describeEdinburghFormation('t2',[row('t2')]);
  assert.deepEqual([f.kind,f.length,f.cars.length,f.dimensions.widthM.basis],['t2',40,2,'published']);
  assert.match(C.manifestFormation(f).classNote,/V10 PROVISIONAL.*King's Cross buffer stop/,'every sidecar carries the provisional V10 note');
  assert.ok(planCatalogueViews(f).length>0,'the frozen views plan from the row alone');
});

test('a Waverley formation that the planner cannot trust is refused, and a row without one is not capturable', () => {
  const broken=[
    ()=>({...formation(),length:41}),
    ()=>({...formation(),roofTop:NaN}),
    ()=>({...formation(),cars:[]}),
    ()=>({...formation(),cars:formation().cars.map(c=>({...c,index:c.index+1}))}),
    ()=>({...formation(),dimensions:{...formation().dimensions,roofTopM:{value:3.7}}}),
  ];
  assert.deepEqual(broken.map(f=>{try{C.describeEdinburghFormation('b',[row('b',f)]);return false;}catch{return true;}}),broken.map(()=>true));
  assert.throws(()=>C.describeEdinburghFormation('none',[{...row('none'),formation:undefined}]),/no Edinburgh capture formation/);
});

test('the capturable Waverley kinds are exactly the fleet rows with a formation, then exactly the capture pairs, and the default run is unchanged', () => {
  const singles=EDINBURGH_FLEET.filter(r=>r.formation).map(r=>r.kind);
  // a family that adds a captured row adds its kind here, in fleet order
  assert.deepEqual(singles,['sr385x3','sr385x4','sr334x3','tpe397x5','xc220x4','xc221x5','srhstx4','srhstx5','sr170x3','sr158x2'],'the single-unit capture kinds, pinned');
  assert.deepEqual(EDINBURGH_CAPTURE_PAIRS.map(p=>[p.kind,[...p.units]]),[['sr385x3+sr385x4',['sr385x3','sr385x4']]],'the capture-only pairs, pinned');
  assert.deepEqual([...C.EDINBURGH_CAPTURE_KINDS],[...singles,'sr385x3+sr385x4'],'singles first, then pairs, nothing else');
  assert.ok(EDINBURGH_CAPTURE_PAIRS.every(p=>!EDINBURGH_FLEET.some(r=>r.kind===p.kind)&&p.units.every(u=>singles.includes(u))),'a pair is never a fleet row, and its units are capturable singles');
  const base=['--mode','catalogue','--dist','d','--out','o'];
  assert.ok(C.EDINBURGH_CAPTURE_KINDS.every(k=>!C.parseCatalogueArgs(base).kinds.includes(k)),'a run without --kinds takes the King\'s Cross kinds only');
  for(const kind of C.EDINBURGH_CAPTURE_KINDS) {
    assert.deepEqual(C.parseCatalogueArgs([...base,'--kinds',kind]).kinds,[kind]);
    assert.deepEqual(C.parseCatalogueArgs([...base,'--kinds',kind,'--views','V01,M01']).views,['V01','M01'],'M01 takes a Waverley kind on the neutral straight stage');
    for(const curve of ['C01','C02'])assert.throws(()=>C.parseCatalogueArgs([...base,'--kinds',kind,'--views',`V01,${curve}`]),/Waverley kinds/,`${curve} stands on the King's Cross track`);
    assert.equal(C.describeFormation(kind).kind,kind);
  }
});

test('M01 poses every Waverley kind by its own layout: the page\'s carPoses puts each car and bogie where the kind\'s formation has them', () => {
  for(const kind of C.EDINBURGH_CAPTURE_KINDS) {
    const f=C.describeFormation(kind),layout=C.motionLayout(kind);
    assert.deepEqual(layout.cars.map(c=>[c.index,...c.bogies]),f.cars.map(c=>[c.index,...c.bogies]),`${kind}: the layout carPoses reads is the formation the plan reads`);
    const poses=C.motionPoses(f,planMotion(f));
    assert.ok(poses.ok,`${kind}: ${poses.problems.slice(0,2).join('; ')}`);
    assert.ok(poses.frames.every(fr=>fr.cars.length===f.cars.length),`${kind}: every car is posed in every frame`);
  }
  assert.equal(C.motionLayout('lner5').spec.family,'at300','a King\'s Cross kind keeps its core/train.ts layout');
});

test('the page hook makes every specimen build try the Edinburgh table first, once', () => {
  const built=[];
  const k={evidenceBuildTrain:kind=>(built.push(['kx',kind]),'kx'),evidenceBuildEdinburgh:kind=>kind==='t2'?(built.push(['eb',kind]),'eb'):undefined};
  globalThis.window={__kx:k};
  try {
    assert.equal(eval(C.EDINBURGH_BUILD_HOOK),true);assert.equal(eval(C.EDINBURGH_BUILD_HOOK),true);
    assert.deepEqual([k.evidenceBuildTrain('t2'),k.evidenceBuildTrain('lner5')],['eb','kx']);
    assert.deepEqual(built,[['eb','t2'],['kx','lner5']]);
    globalThis.window={__kx:{evidenceBuildTrain:()=>null}};
    assert.throws(()=>eval(C.EDINBURGH_BUILD_HOOK),/no evidenceBuildEdinburgh hook/);
  } finally { delete globalThis.window; }
});

test('a capture pair is its units end to end: one cab-to-cab joint, so V08 plans the unit-coupling views, and the page builds it with the meeting cabs dark', () => {
  const [a,b]=['sr385x3','sr385x4'].map(k=>C.describeFormation(k)),f=C.describeFormation('sr385x3+sr385x4');
  assert.equal(f.cars.length,a.cars.length+b.cars.length);
  assert.ok(Math.abs(f.length-(a.length+b.length))<1e-9&&Math.abs(f.dimensions.lengthM.value-f.length)<1e-9);
  assert.deepEqual(f.cars.map(c=>c.cab),[...a.cars,...b.cars].map(c=>c.cab));
  assert.ok(Math.abs(f.cars[a.cars.length].start-a.length)<1e-9&&Math.abs(f.cars[a.cars.length].bogies[0]-(b.cars[0].bogies[0]+a.length))<1e-9,'the second unit is shifted by the first unit\'s length');
  const v08=planCatalogueViews(f).filter(v=>v.id==='V08');
  assert.deepEqual(v08.filter(v=>v.suffix.startsWith('unit-coupling')).map(v=>[v.suffix,v.status]),
    [['unit-coupling','OK'],['unit-coupling-low','OK'],['unit-coupling-2','N/A'],['unit-coupling-2-low','N/A']]);
  const train=evidenceBuildEdinburgh('sr385x3+sr385x4');
  try {
    assert.deepEqual(train.children.map(c=>c.name),f.cars.map(c=>`car-${c.index}`));
    const inner=[a.cars.length-1,a.cars.length].map(i=>train.getObjectByName(`car-${i}`).getObjectByName('body-detail').userData.lamps.interior);
    assert.deepEqual(inner,[true,true],'the cabs that meet are dark');
  } finally { disposeEdinburghTrain(train); }
});
