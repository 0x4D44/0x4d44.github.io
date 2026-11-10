import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as C from '../train-capture.mjs';
import {planCatalogueViews} from '../train-framing.mjs';
import {EDINBURGH_FLEET} from '../../web/src/edinburgh-fleet.ts';

const dim=(value,basis='assumed')=>({value,basis,figures:['test']});
const formation=()=>({family:'test',classes:'999',classNote:null,length:40,half:1.4,crown:3.5,coverHeight:.2,roofTop:3.7,doorWidth:1.3,
  cars:[{index:0,type:'DM',length:20,start:0,end:20,cab:'front',bogies:[3,17],motor:[true,false],pantograph:null,doors:[5,15]},
    {index:1,type:'DM',length:20,start:20,end:40,cab:'rear',bogies:[23,37],motor:[false,true],pantograph:[29,31],doors:[25,35]}],
  dimensions:{lengthM:dim(40),widthM:dim(2.8,'published'),roofTopM:dim(3.7)}});
const row=(kind,f=formation)=>({kind,operator:'SR',operatorName:'Test',classes:['999'],cars:2,layout:()=>f(),build:()=>null,dispose:()=>{},formation:f});

test('a Waverley row with a formation is described for the view planner under its own kind', () => {
  const f=C.describeEdinburghFormation('t2',[row('t2')]);
  assert.deepEqual([f.kind,f.length,f.cars.length,f.dimensions.widthM.basis],['t2',40,2,'published']);
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

test('the capturable Waverley kinds are exactly the fleet rows with a formation, and the default run is unchanged', () => {
  assert.deepEqual([...C.EDINBURGH_CAPTURE_KINDS],EDINBURGH_FLEET.filter(r=>r.formation).map(r=>r.kind));
  const base=['--mode','catalogue','--dist','d','--out','o'];
  assert.ok(C.EDINBURGH_CAPTURE_KINDS.every(k=>!C.parseCatalogueArgs(base).kinds.includes(k)),'a run without --kinds takes the King\'s Cross kinds only');
  for(const kind of C.EDINBURGH_CAPTURE_KINDS) {
    assert.deepEqual(C.parseCatalogueArgs([...base,'--kinds',kind]).kinds,[kind]);
    assert.throws(()=>C.parseCatalogueArgs([...base,'--kinds',kind,'--views','V01,M01']),/Waverley kinds/);
    assert.equal(C.describeFormation(kind).kind,kind);
  }
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
