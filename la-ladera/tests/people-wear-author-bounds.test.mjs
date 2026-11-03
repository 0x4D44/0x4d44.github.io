// The authoring simulation remains Float64; its emitted Float32 bytes must also
// satisfy the original immutable 80mm bound. Synthetic GLBs exercise the real
// pushOutFit path without depending on regenerated wardrobe artifacts.
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT, parseGlb } from '../tools/blender/people_validate.mjs';
import { measureAuthorDisplacement, pushOutFit, readWearGeometry } from '../tools/blender/people_wear_validate.mjs';

const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const cubeIndices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
function fixture(high = .27) {
  const g = { asset:{version:'2.0'}, extensionsUsed:['KHR_mesh_quantization'], extensionsRequired:['KHR_mesh_quantization'], buffers:[{byteLength:0}], bufferViews:[], accessors:[], meshes:[], nodes:CONTRACT.bones.map(name=>({name})), skins:[] };
  const chunks=[];let length=0;
  function accessor(values,width,type='float') {
    const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
    const bytes=Buffer.alloc(values.length*(type==='index'?2:4));
    values.forEach((value,index)=>type==='index'?bytes.writeUInt16LE(value,index*2):bytes.writeFloatLE(value,index*4));
    const view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;
    const index=g.accessors.length;g.accessors.push({bufferView:view,componentType:type==='index'?5123:5126,count:values.length/width,type:width===16?'MAT4':width===1?'SCALAR':'VEC'+width});return index;
  }
  const bind=accessor(CONTRACT.bones.flatMap(()=>identity),16);
  g.skins.push({joints:CONTRACT.bones.map((_,i)=>i),inverseBindMatrices:bind});
  function geometry(name,positions,indices) {
    const count=positions.length/3,attributes={POSITION:accessor(positions,3),NORMAL:accessor(Array.from({length:count},()=>[0,0,1]).flat(),3),
      TEXCOORD_0:accessor(Array(count*2).fill(.5),2),JOINTS_0:accessor(Array(count*4).fill(0),4,'index'),WEIGHTS_0:accessor(Array.from({length:count},()=>[1,0,0,0]).flat(),4)};
    const mesh=g.meshes.length;g.meshes.push({primitives:[{attributes,indices:accessor(indices,1,'index')}]});
    g.nodes.push({name,mesh,skin:0});return mesh;
  }
  const box=[[.17,-.3,-.3],[high,-.3,-.3],[high,.3,-.3],[.17,.3,-.3],[.17,-.3,.3],[high,-.3,.3],[high,.3,.3],[.17,.3,.3]].flat();
  geometry('body',box,cubeIndices);geometry('body_far',box,cubeIndices);geometry('proxy',box,cubeIndices);
  const mesh=geometry('cloth',[.25,0,0,.25,.5,0,.25,0,.5],[0,1,2]);g.nodes.push({name:'cloth_far',mesh,skin:0});
  g.buffers[0].byteLength=length;
  let json=Buffer.from(JSON.stringify(g));json=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]);
  let bin=Buffer.concat(chunks);bin=Buffer.concat([bin,Buffer.alloc((-bin.length)&3)]);
  const data=Buffer.alloc(28+json.length+bin.length);data.writeUInt32LE(0x46546c67,0);data.writeUInt32LE(2,4);data.writeUInt32LE(data.length,8);
  data.writeUInt32LE(json.length,12);data.writeUInt32LE(0x4e4f534a,16);json.copy(data,20);data.writeUInt32LE(bin.length,20+json.length);data.writeUInt32LE(0x004e4942,24+json.length);bin.copy(data,28+json.length);
  return {doc:parseGlb(data,'authoring bound fixture'),fit:{bodyNode:'body',bodyLodNode:'body_far',proxyNode:'proxy',garments:{cloth:{node:'cloth',lodNode:'cloth_far'}}}};
}
const options={id:'bound-fixture',samples:[{clip:null,clipName:'rest',time:0}],passes:3,padding:.0015,maxMove:.08};

test('authoring displacement includes a Float32 upload that rounds an otherwise bounded double candidate past eighty millimetres', () => {
  const original=[.25,0,0],candidate=[.329999999,0,0],double=Math.abs(candidate[0]-original[0]),float=Math.abs(Math.fround(candidate[0])-original[0]);
  assert.ok(double<.08 && float>.08);
  assert.equal(measureAuthorDisplacement(original,candidate),float);
  assert.deepEqual(candidate,[.329999999,0,0]);
});

test('authoring displacement retains the double bound when Float32 rounding would hide an excessive simulation move', () => {
  const original=[.5,0,0],candidate=[.580000001,0,0],double=Math.abs(candidate[0]-original[0]),float=Math.abs(Math.fround(candidate[0])-original[0]);
  assert.ok(double>.08 && float<.08);
  assert.equal(measureAuthorDisplacement(original,candidate),double);
});

test('actual rest authoring rejects an emitted Float32 overshoot when no permitted alternative exit exists', async () => {
  const {doc,fit}=fixture(.3285),padding=.329999999-Math.fround(.3285);
  assert.ok(padding>0 && padding<.08);
  await assert.rejects(()=>pushOutFit(doc,fit,{...options,padding}),/push-out would exceed 0.08 m/);
});

test('ordinary rest authoring retains double simulation coordinates and emits the same once-rounded Float32 geometry', async () => {
  const {doc,fit}=fixture(),working=await readWearGeometry(doc,'cloth'),expected=Math.fround(.27)+options.padding;
  assert.notEqual(expected,Math.fround(expected));
  const result=await pushOutFit(doc,fit,options),emitted=await readWearGeometry(parseGlb(result.bytes),'cloth');
  assert.equal(result.report.converged,true);assert.equal(result.report.boundedSearches,0);
  assert.ok(working.decoded.attrs.POSITION instanceof Float64Array);
  assert.equal(working.decoded.attrs.POSITION[0],expected);
  assert.equal(emitted.decoded.attrs.POSITION[0],Math.fround(expected));
});

test('rest authoring rechecks the actual committed stream after the candidate bound has passed', async () => {
  const {doc,fit}=fixture(),working=await readWearGeometry(doc,'cloth'),positions=working.decoded.attrs.POSITION,set=positions.set.bind(positions);
  positions.set=(values,offset=0)=>{set(values,offset);positions[offset]+=.08;};
  await assert.rejects(()=>pushOutFit(doc,fit,options),/committed authoring position exceeds 0.08 m/);
});
