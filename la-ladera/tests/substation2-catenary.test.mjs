import './nice.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {solveCatenary,catenaryInstances} from '../tools/substation2_catenary.mjs';

export const MUTATIONS=[
  {id:'cat_equal_end',name:'catenary equal-height endpoints and midpoint sag are exact'},
  {id:'cat_unequal_sag',name:'catenary unequal-height endpoints use midpoint sag below the chord'},
  {id:'cat_radius',name:'catenary instance transforms align the unit Y segment and preserve radius'},
  {id:'cat_seg_bound',name:'catenary adaptive segments obey the physical length cap'},
  {id:'cat_straight',name:'catenary zero and tiny sag remain finite and approach a straight span'},
  {id:'cat_invalid',name:'catenary rejects invalid numeric domains and unsupported vertical spans'},
  {id:'cat_alloc',name:'catenary rejects allocations beyond its explicit bounded instance budget'},
  {id:'cat_browser',name:'catenary module body executes without process or Node-only imports in a browser realm'},
];
const mutant=process.env.SUBSTATION_MUTANT;
const near=(a,b,t=1e-8) => assert.ok(Math.abs(a-b)<=t,`${a} differs from ${b}`);
const vectorNear=(a,b,t=1e-8) => a.forEach((x,i)=>near(x,b[i],t));

if (process.argv.includes('--list-mutations')) {
  console.log(JSON.stringify(MUTATIONS));
} else {
  test(MUTATIONS[0].name,()=>{
    const curve=solveCatenary({start:[0,12,0],end:[40,mutant==='cat_equal_end'?14:12,0],sag:3});
    vectorNear(curve.pointAt(0),[0,12,0]);vectorNear(curve.pointAt(1),[40,12,0]);
    vectorNear(curve.pointAt(.5),[20,9,0]);assert.ok(curve.arcLength>40);
  });
  test(MUTATIONS[1].name,()=>{
    const curve=solveCatenary({start:[-12,7,5],end:[18,18,45],sag:mutant==='cat_unequal_sag'?1:4});
    vectorNear(curve.pointAt(.5),[3,8.5,25]);
    vectorNear(curve.pointAt(0),[-12,7,5]);vectorNear(curve.pointAt(1),[18,18,45]);
    const points=Array.from({length:11},(_,i)=>curve.pointAt(i/10));
    for(let i=1;i<10;i++) assert.ok(points[i-1][1]-2*points[i][1]+points[i+1][1]>0,'positive second difference of a catenary');
  });
  test(MUTATIONS[2].name,()=>{
    const r=catenaryInstances({start:[1,4,3],end:[11,8,-4],sag:1,radius:mutant==='cat_radius'?.03:.015});
    for(let i=0;i<r.instances.length;i++){
      const x=r.instances[i],[qx,qy,qz,qw]=x.quaternion;
      near(Math.hypot(qx,qy,qz,qw),1);near(x.scale[0],1);near(x.scale[2],1);
      // Quaternion rotating unit +Y, independent of tool's construction formula.
      const y=[2*(qx*qy-qw*qz),1-2*(qx*qx+qz*qz),2*(qy*qz+qw*qx)];
      vectorNear(x.position.map((v,k)=>v+y[k]*x.scale[1]),r.points[i+1]);
    }
  });
  test(MUTATIONS[3].name,()=>{
    const r=catenaryInstances({start:[0,4,0],end:[20,20,0],sag:7,segments:2,maxSegmentLength:mutant==='cat_seg_bound'?20:1});
    assert.ok(r.instances.length<=2048);
    for(const x of r.instances) assert.ok(x.scale[1]<=1+1e-8,'actual chord exceeds one metre');
    vectorNear(r.points[0],[0,4,0]);vectorNear(r.points.at(-1),[20,20,0]);
  });
  test(MUTATIONS[4].name,()=>{
    const r=solveCatenary({start:[0,2,0],end:[100,12,0],sag:mutant==='cat_straight'?2:0});
    vectorNear(r.pointAt(.5),[50,7,0]);near(r.arcLength,Math.hypot(100,10));
    const tiny=solveCatenary({start:[0,2,0],end:[100,12,0],sag:1e-10});
    assert.ok(tiny.pointAt(.37).every(Number.isFinite));near(tiny.pointAt(.5)[1],7-1e-10,1e-9);
  });
  test(MUTATIONS[5].name,()=>{
    const bad={start:[0,2,0],end:[10,2,0],sag:mutant==='cat_invalid'?1:-1};
    assert.throws(()=>solveCatenary(bad),/sag/);
    assert.throws(()=>solveCatenary({start:[0,0,0],end:[0,8,0],sag:1}),/horizontal/);
    assert.throws(()=>solveCatenary({start:[NaN,0,0],end:[2,0,0],sag:1}),/finite/);
    assert.throws(()=>solveCatenary({start:[0,0,0],end:[20,0,0],sag:Infinity}),/sag/);
  });
  test(MUTATIONS[6].name,()=>{
    assert.throws(()=>catenaryInstances({start:[0,2,0],end:[10,2,0],sag:1,segments:mutant==='cat_alloc'?24:2049}),/segments/);
    assert.throws(()=>catenaryInstances({start:[0,20,0],end:[2000,20,0],sag:30,maxSegmentLength:.05}),/budget/);
    assert.throws(()=>catenaryInstances({start:[0,2,0],end:[10,2,0],sag:1,maxSegmentLength:0}),/maxSegmentLength/);
  });
  test(MUTATIONS[7].name,async()=>{
    let source=readFileSync(new URL('../tools/substation2_catenary.mjs',import.meta.url),'utf8');
    if(mutant==='cat_browser') source=source.replace("typeof process!=='undefined'",'true');
    assert.doesNotMatch(source,/^import\s.+(?:from\s*)?['"](?:node:|\.\.\/tests)/m,'browser module has static Node-only imports');
    // Execute the actual module body in a realm lacking process, Buffer, require
    // or filesystem globals. Only export markers are removed for vm.Script.
    const body=source.replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/substation2_catenary.mjs'));
    const script=new Script(`(async()=>{${body}; return catenaryInstances({start:[0,3,0],end:[10,3,0],sag:1});})()`,{
      importModuleDynamically(){throw new Error('browser attempted Node import');}
    });
    let result;
    await assert.doesNotReject(async()=>{result=await script.runInContext(createContext({}));},'browser module body must not need process or Node imports');
    assert.equal(result.asset,'substation_conductor_segment');
    near(result.points[Math.floor(result.points.length/2)][1],2,1e-6);
  });
}
