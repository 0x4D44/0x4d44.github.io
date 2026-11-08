import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { repairTargetBranches } from '../tools/blender/people_wear_target_search.mjs';
import { ClosedSurface, identity, skinPositions, blendedMatrix } from '../tools/blender/people_wear_math.mjs';

const BARY = [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]];
const point = (p,v) => Array.from(p.subarray(3*v,3*v+3));
const distance = (a,b) => Math.hypot(...a.map((value,k)=>value-b[k]));
const inside = (surfaces,p) => surfaces.some(surface=>surface.insideXYZ(...p));
function box(center=[0,0,0],half=[.021,.021,.021]) {
  const points=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  return new ClosedSurface({vertices:8,indices:Uint32Array.from([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]),attrs:{
    POSITION:Float64Array.from(points.flatMap(p=>p.map((value,k)=>center[k]+value*half[k])))}});
}
function fixture({points=[[-.04,0,0],[.04,0,0],[0,.05,0]],faces=[[0,1,2]],copies=2,matrices=[identity()],joints=null,baseShift=[0,0,0]}={}) {
  const count=points.length,vertices=count*copies,indices=[];
  for(let c=0;c<copies;c++)for(const face of faces)indices.push(...face.map(v=>v+c*count));
  const current=Float32Array.from(Array.from({length:copies},()=>points.flat()).flat());
  const base=Float32Array.from(current,(value,i)=>value+baseShift[i%3]);
  const decoded={vertices,indices:Uint32Array.from(indices),attrs:{POSITION:new Float32Array(base),
    NORMAL:Float32Array.from(Array.from({length:vertices},()=>[0,0,1]).flat()),
    TEXCOORD_0:Float32Array.from(Array.from({length:vertices},(_,i)=>[i/vertices,.5]).flat()),
    JOINTS_0:Uint8Array.from(Array.from({length:vertices},(_,i)=>[joints?.[i%count]??0,0,0,0]).flat()),
    WEIGHTS_0:Float32Array.from(Array.from({length:vertices},()=>[1,0,0,0]).flat())}};
  const welds=new Map(Array.from({length:count},(_,v)=>[String(v),Array.from({length:copies},(_,c)=>v+c*count)]));
  const used=Uint32Array.from(new Set(indices));
  return {decoded,base,current,used,welds,matrices:new Map([...used].map(v=>[v,blendedMatrix(decoded.attrs,v,matrices)])),
    triangles:Array.from({length:indices.length/3},(_,i)=>indices.slice(3*i,3*i+3)),baseWorld:skinPositions(decoded,matrices),label:'independent seated-target fixture'};
}
function posed(pool,sample) {return skinPositions({...pool.decoded,attrs:{...pool.decoded.attrs,POSITION:pool.current}},sample.matrices);}
function probes(pool,sample) {
  const positions=posed(pool,sample);
  return pool.triangles.flatMap(face=>BARY.map(weights=>{
    const position=[0,1,2].map(k=>face.reduce((sum,v,i)=>sum+weights[i]*positions[3*v+k],0));
    return {position,blocked:inside(sample.surfaces,position)};
  }));
}
function normal(positions,face) {
  const [a,b,c]=face.map(v=>point(positions,v)),u=b.map((value,k)=>value-a[k]),w=c.map((value,k)=>value-a[k]);
  return [u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
}
function assertNormals(before,after,faces,label) {
  for(const face of faces) {
    const a=normal(before,face),b=normal(after,face);
    assert.ok(Math.hypot(...b)>1e-12 && a.reduce((sum,value,k)=>sum+value*b[k],0)>0,label);
  }
}
function assertBounds(pool,sample) {
  const world=posed(pool,sample);
  for(const v of pool.used) {
    assert.ok(distance(point(pool.current,v),point(pool.base,v))<=.18,'target exceeded immutable bind-space 180 mm');
    assert.ok(distance(point(world,v),point(pool.baseWorld,v))<=.18,'target exceeded immutable posed-space 180 mm');
  }
}
function assertPadding(surfaces,p) {
  assert.ok(!inside(surfaces,p),'uploaded point remains inside a closed body');
  for(const surface of surfaces)for(const part of surface.components)
    assert.ok(surface.nearest(p,part).distance>=.002,'uploaded point lost its 2 mm clearance padding');
}

test('seated branch repair moves every seam alias together while preserving the immutable base and all nonposition streams', () => {
  const pool=fixture(),sample={matrices:[identity()],surfaces:[box()]},original=structuredClone(pool.decoded),base=new Float32Array(pool.base),baseWorld=new Float64Array(pool.baseWorld),initial=probes(pool,sample);
  const report=repairTargetBranches(pool,sample);
  assert.ok(report.before>0 && report.acceptedGroups>0);assert.equal(report.after,0);
  assert.deepEqual(pool.decoded,original);assert.deepEqual(pool.base,base);assert.deepEqual(pool.baseWorld,baseWorld);
  for(const group of pool.welds.values())for(const v of group) {
    assert.deepEqual(point(pool.current,v),point(pool.current,group[0]));
    assert.deepEqual(point(pool.current,v),point(pool.current,v).map(Math.fround));
    if(distance(point(pool.current,v),point(base,v)))assertPadding(sample.surfaces,point(posed(pool,sample),v));
  }
  const final=probes(pool,sample);assert.ok(final.every(p=>!p.blocked));
  for(let i=0;i<final.length;i++)if(initial[i].blocked)assertPadding(sample.surfaces,final[i].position);
  assertBounds(pool,sample);
});

test('seated branch repair cannot reset a previous 170 mm target as its immutable bind origin', () => {
  const pool=fixture({points:[[-.05,0,0],[.05,0,0],[0,.1,0]],baseShift:[0,0,-.17]});
  // The lower posed body prevents taking the old target back toward its base
  // while using a sideways exit. Any padded exit now exceeds the base's sphere.
  const sample={matrices:[identity()],surfaces:[box([0,0,-.484],[.032,.032,.516]),box([0,0,-.501],[1,1,.5])]},before=new Float32Array(pool.current),base=new Float32Array(pool.base);
  assert.ok(probes(pool,sample).some(p=>p.blocked));
  const report=repairTargetBranches(pool,sample);
  assert.equal(report.acceptedGroups,0);assert.equal(report.after,report.before);
  assert.deepEqual(pool.current,before);assert.deepEqual(pool.base,base);assertBounds(pool,sample);
});

test('seated branch repair enforces the posed 180 mm bound independently of a smaller bind movement', () => {
  const matrix=identity();matrix[5]=2;
  const pool=fixture({points:[[-.12,0,0],[.12,0,0],[0,.2,0]],matrices:[matrix]});
  const sample={matrices:[matrix],surfaces:[box([0,0,0],[.095,.095,1])]},before=new Float32Array(pool.current);
  assert.ok(probes(pool,sample).some(p=>p.blocked));
  const report=repairTargetBranches(pool,sample);
  assert.equal(report.acceptedGroups,0);assert.equal(report.after,report.before);
  assert.deepEqual(pool.current,before);assertBounds(pool,sample);
});

test('seated branch repair preserves positive bind-space normals on neighboring triangles', () => {
  const second=identity();second[13]=.048;
  const pool=fixture({points:[[-.04,0,0],[.04,0,0],[0,.05,0],[-.055,.012,0],[-.025,.012,0]],faces:[[0,1,2],[0,4,3]],matrices:[identity(),second],joints:[0,0,0,1,1]});
  const sample={matrices:[identity(),second],surfaces:[box([0,0,0],[.02,.02,1])]},before=new Float32Array(pool.current);
  const report=repairTargetBranches(pool,sample);assert.ok(report.acceptedGroups>0);assert.equal(report.after,0);
  assertNormals(before,pool.current,pool.triangles,'seated branch inverted a bind-space neighbor');assertBounds(pool,sample);
});

test('seated branch repair preserves positive posed normals independently of bind-space orientation', () => {
  const second=identity();second[13]=-.048;
  const pool=fixture({points:[[-.04,0,0],[.04,0,0],[0,.05,0],[-.055,.06,0],[-.025,.06,0]],faces:[[0,1,2],[0,4,3]],matrices:[identity(),second],joints:[0,0,0,1,1]});
  const sample={matrices:[identity(),second],surfaces:[box([0,0,0],[.02,.02,1])]},before=posed(pool,sample),beforeBind=new Float32Array(pool.current);
  const report=repairTargetBranches(pool,sample);assert.ok(report.acceptedGroups>0);assert.equal(report.after,0);
  assertNormals(before,posed(pool,sample),pool.triangles,'seated branch inverted a posed neighbor');
  assertNormals(beforeBind,pool.current,pool.triangles,'seated branch inverted a bind neighbor');assertBounds(pool,sample);
});

test('seated branch repair cannot exchange an old blocked probe for a newly blocked neighboring probe', () => {
  const pool=fixture({points:[[-.18,0,0],[.18,0,0],[0,.175,0]]}),guarded={matrices:[identity()],surfaces:[
    box([0,0,0],[.09,.0735,.3]),box([-.09,.195,0],[.0875,.105,.3]),box([0,-.55,0],[1,.5,1])]},before=probes(pool,guarded);
  const originalQueries=guarded.surfaces.map(surface=>surface.insideXYZ.bind(surface));
  let previous=Array.from(pool.current).join(','),introduced=false;
  // Observe each committed private stream, independently of the helper's
  // flags. A later repair must not conceal an earlier exchange of failures.
  const inspectCommit=()=>{
    const signature=Array.from(pool.current).join(',');if(signature===previous)return;previous=signature;
    const positions=posed(pool,guarded);let i=0;
    for(const triangle of pool.triangles)for(const weights of BARY) {
      const p=[0,1,2].map(k=>triangle.reduce((sum,v,j)=>sum+weights[j]*positions[3*v+k],0));
      if(originalQueries.some(query=>query(...p)) && !before[i].blocked)introduced=true;
      i++;
    }
  };
  guarded.surfaces.forEach((surface,i)=>{surface.insideXYZ=(...p)=>{inspectCommit();return originalQueries[i](...p);};});
  const report=repairTargetBranches(pool,guarded),after=probes(pool,guarded);
  assert.ok(report.after<report.before);assert.ok(after.every((probe,i)=>!probe.blocked || before[i].blocked),'repair introduced a new failed face probe');
  assert.equal(introduced,false,'an accepted intermediate branch introduced a new failed face probe');
  assertBounds(pool,guarded);
});

test('seated branch repair rejects candidates that do not strictly improve the original failed-probe count', () => {
  const pool=fixture({points:[[-.12,0,0],[.12,0,0],[0,.5,0]]}),sample={matrices:[identity()],surfaces:[box([0,0,0],[.1,.1,1])]},before=new Float32Array(pool.current);
  const report=repairTargetBranches(pool,sample);
  assert.ok(report.before>0 && report.attemptedGroups>0);assert.equal(report.acceptedGroups,0);assert.equal(report.after,report.before);assert.deepEqual(pool.current,before);
});

test('seated branch repair accepts only matching Float32 base and private target streams', () => {
  const sample={matrices:[identity()],surfaces:[box()]};
  for(const field of ['base','current']) {
    const pool=fixture();pool[field]=Float64Array.from(pool[field]);
    assert.throws(()=>repairTargetBranches(pool,sample),/matching Float32 base and target streams/);
  }
  const pool=fixture();pool.current=new Float32Array(3);
  assert.throws(()=>repairTargetBranches(pool,sample),/matching Float32 base and target streams/);
});

test('seated branch repair checks two millimetre padding on the actual Float32 target rather than its unrounded proposal', () => {
  const first=fixture(),body=box(),sample={matrices:[identity()],surfaces:[body]};
  repairTargetBranches(first,sample);
  const preferred=point(first.current,0),rawY=first.base[1]+Math.round((preferred[1]-first.base[1])/.01)*.01,error=preferred[1]-rawY;
  assert.ok(error>0 && error<1e-6,'fixture must exercise a proposal that rounds toward the obstruction');
  // The double candidate has just over 2 mm padding. Its actual Float32 row
  // loses that padding, so the valid helper must choose another candidate.
  const obstruction=box([preferred[0],rawY+.003+error/2,preferred[2]],[.001,.001,.001]);
  const pool=fixture(),guarded={matrices:[identity()],surfaces:[body,obstruction]},report=repairTargetBranches(pool,guarded);
  assert.ok(report.acceptedGroups>0);assert.equal(report.after,0);
  const world=posed(pool,guarded);
  for(const v of pool.used)if(distance(point(pool.current,v),point(pool.base,v)))assertPadding(guarded.surfaces,point(world,v));
  assertBounds(pool,guarded);
});
