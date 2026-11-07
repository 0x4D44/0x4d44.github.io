import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedAuthorExit } from '../tools/blender/people_wear_fit_search.mjs';
import { ClosedSurface, identity } from '../tools/blender/people_wear_math.mjs';

function box(lo, hi, matrix = identity()) {
  const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const positions = corners.flatMap(bits => {
    const [x,y,z] = bits.map((bit, i) => bit ? hi[i] : lo[i]);
    return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12], matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13], matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
  });
  return new ClosedSurface({ vertices:8, indices:Uint32Array.from([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]), attrs:{POSITION:Float64Array.from(positions)} });
}
const bounds = {padding:.0015,maxMove:.08};

test('bounded author search finds a Float32 union exit through the inverse skin map within eighty millimetres', () => {
  const matrix = identity(); matrix[0]=2; matrix[5]=.75; matrix[10]=1.2; matrix[12]=.3; matrix[13]=-.1; matrix[14]=.2;
  const surfaces = [box([-.02,-.05,-.05],[.02,.05,.05],matrix), box([-.015,-.04,-.04],[.025,.04,.04],matrix)];
  const original=[0,0,0], current=[.07,0,0], saved={original:[...original],current:[...current],matrix:[...matrix]};
  const result=boundedAuthorExit(surfaces,original,current,matrix,bounds);
  assert.ok(result, 'a clear left-side exit exists within the unchanged bound');
  assert.ok(result.displacement < .025 && result.displacement <= .08, 'the inverse skin map must preserve the short bind-space exit');
  assert.deepEqual(result.target,result.target.map(Math.fround));
  assert.deepEqual(result.point,[2*result.target[0]+.3,.75*result.target[1]-.1,1.2*result.target[2]+.2]);
  assert.equal(result.displacement,Math.hypot(...result.target));
  assert.deepEqual(result.deltaBind,result.target.map((value,i)=>value-current[i]));
  assert.ok(surfaces.every(surface=>!surface.insideXYZ(...result.point)));
  assert.deepEqual({original,current,matrix:[...matrix]},saved);
});

test('bounded author search cannot reset the eighty millimetre origin to a previous correction', () => {
  const surface=box([-.1,-.1,-.1],[.1,.1,.1]);
  assert.equal(boundedAuthorExit([surface],[0,0,0],[.075,0,0],identity(),bounds),null);
});

test('bounded author search rechecks actual Float32 union membership before returning an outside shortcut', () => {
  const surface=box([15.5,-.3,-.3],[16.0000003,.3,.3]), original=[16.0000007,0,0];
  assert.equal(surface.insideXYZ(...original),null);
  assert.ok(surface.insideXYZ(...original.map(Math.fround)), 'rounding this fixture enters the body by more than the boundary tolerance');
  assert.equal(boundedAuthorExit([surface],original,original,identity(),bounds),null);
});

test('bounded author search measures its displacement after Float32 quantization against the immutable origin', () => {
  const original=[16.001,0,0];
  assert.ok(Math.abs(Math.fround(original[0])-original[0])>1e-7);
  assert.equal(boundedAuthorExit([box([-.5,-.5,-.5],[.5,.5,.5])],original,original,identity(),{padding:1e-10,maxMove:1e-7}),null);
});

test('bounded author search returns no candidate when every direction exceeds the permitted bind ball', () => {
  assert.equal(boundedAuthorExit([box([-1,-1,-1],[1,1,1])],[0,0,0],[0,0,0],identity(),bounds),null);
});

test('bounded author search rejects malformed surfaces and nonfinite or malformed bind inputs', () => {
  const surface=box([-1,-1,-1],[1,1,1]);
  for (const surfaces of [null,[],[null],[{}]]) assert.throws(()=>boundedAuthorExit(surfaces,[0,0,0],[0,0,0],identity()),/closed surfaces/);
  for (const vector of [[NaN,0,0],[0,Infinity,0],[0,0,-Infinity],[0,0],null]) {
    assert.throws(()=>boundedAuthorExit([surface],vector,[0,0,0],identity()),/finite bind positions and matrix/);
    assert.throws(()=>boundedAuthorExit([surface],[0,0,0],vector,identity()),/finite bind positions and matrix/);
  }
  for (const matrix of [null,[],Array(16).fill(NaN),Array(16).fill(Infinity)])
    assert.throws(()=>boundedAuthorExit([surface],[0,0,0],[0,0,0],matrix),/finite bind positions and matrix/);
});

test('bounded author search rejects a singular skin map even when the origin is already outside', () => {
  const matrix=identity(); matrix[0]=0;
  assert.throws(()=>boundedAuthorExit([box([-1,-1,-1],[1,1,1])],[10,10,10],[10,10,10],matrix),/singular blended skin matrix/);
});

test('bounded author search rejects invalid padding and movement limits without relaxing the hard ceiling', () => {
  const surface=box([-1,-1,-1],[1,1,1]);
  for (const options of [{padding:0},{padding:-.001},{padding:NaN},{padding:Infinity},{padding:.08,maxMove:.08},{padding:.09,maxMove:.08},
    {maxMove:0},{maxMove:-.01},{maxMove:.1800001},{maxMove:NaN},{maxMove:Infinity},{maxMove:'0.08'}])
    assert.throws(()=>boundedAuthorExit([surface],[0,0,0],[0,0,0],identity(),options),/invalid bounded author exit limits/);
});
