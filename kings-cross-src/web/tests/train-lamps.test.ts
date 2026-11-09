// The lamp state of a built train (web/src/train.ts `setTrainLampState`): each outer cab end shows white lamps, red lamps or none, the coupled
// units' inner cab ends stay dark, and a lens is vertices of the car's one detail mesh, so the switch touches only those vertices' colour and
// glow tag. The shared material, the shared night uniform and every other train are left as they were.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { TRAIN_KINDS } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LENS, lensLook, SERVICE_LAMPS, buildTrain, setTrainLampState } from '../src/train.ts';
import type { TrainLampMode, TrainLampState } from '../src/train.ts';
import { col, plain } from '../src/train-geom.ts';

interface Lens { role: 'head' | 'tail'; v0: number; v1: number }
interface LampRec { end: 'front' | 'rear'; interior: boolean; lenses: Lens[] }
const MODES: TrainLampMode[] = ['head', 'tail', 'off'];

/**
 * Identity checks that fail with their message only. A failed assert.equal, notEqual or deepEqual prints both operands, and a geometry's or an attribute's buffers run to
 * megabytes: a mutation that copies one made the failure's own report outgrow the mutation driver's output cap (an OVERCAP, which counts as no kill).
 */
const same = (a: unknown, b: unknown, message: string): void => assert.ok(a === b, message);
const differ = (a: unknown, b: unknown, message: string): void => assert.ok(a !== b, message);

/** The detail meshes of a train's cab cars with what they record of their lamps. */
function cabs(train: THREE.Object3D): { mesh: THREE.Mesh; rec: LampRec }[] {
  const out: { mesh: THREE.Mesh; rec: LampRec }[] = [];
  train.traverse((o) => {
    if (o.name === 'body-detail' && o.userData.lamps) out.push({ mesh: o as THREE.Mesh, rec: o.userData.lamps as LampRec });
  });
  return out;
}

/** What a lens shows: every vertex of it must agree. */
function look(mesh: THREE.Mesh, l: Lens): { glow: number; rgb: [number, number, number] } {
  const colour = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const glow = mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute;
  const first = { glow: glow.getX(l.v0), rgb: [colour.getX(l.v0), colour.getY(l.v0), colour.getZ(l.v0)] as [number, number, number] };
  for (let v = l.v0; v < l.v1; v++) {
    assert.equal(glow.getX(v), first.glow, `vertex ${v} of a lens has its own glow tag`);
    assert.deepEqual([colour.getX(v), colour.getY(v), colour.getZ(v)], first.rgb, `vertex ${v} of a lens has its own colour`);
  }
  return first;
}

function expectLens(mesh: THREE.Mesh, l: Lens, mode: TrainLampMode, what: string): void {
  const want = lensLook(l.role, mode);
  const c = col(want.hex);
  const got = look(mesh, l);
  assert.equal(got.glow, want.glow, `${what}: glow tag`);
  assert.deepEqual(got.rgb, [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)], `${what}: colour`);
}

test('a lens is lit white at the head, red at the tail, and dark otherwise: the colours are the published LENS set and only a lit lens glows', () => {
  assert.deepEqual(lensLook('head', 'head'), { hex: LENS.headOn, glow: 2 });
  assert.deepEqual(lensLook('head', 'tail'), { hex: LENS.headOff, glow: 0 });
  assert.deepEqual(lensLook('head', 'off'), { hex: LENS.headOff, glow: 0 });
  assert.deepEqual(lensLook('tail', 'tail'), { hex: LENS.tailOn, glow: 2 });
  assert.deepEqual(lensLook('tail', 'head'), { hex: LENS.tailOff, glow: 0 });
  assert.deepEqual(lensLook('tail', 'off'), { hex: LENS.tailOff, glow: 0 });
  assert.deepEqual(SERVICE_LAMPS, { front: 'head', rear: 'tail' });
});

test('every kind is built in service state: white lamps at the front end, red at the rear end, coupled units\' inner ends dark', () => {
  for (const kind of TRAIN_KINDS) {
    const train = buildTrain(kind);
    assert.deepEqual(train.userData.lampState, SERVICE_LAMPS, `${kind}: the state it records`);
    const found = cabs(train);
    assert.ok(found.length >= 2, `${kind}: ${found.length} cab cars`);
    for (const end of ['front', 'rear'] as const) {
      const outer = found.filter((f) => f.rec.end === end && !f.rec.interior);
      assert.equal(outer.length, 1, `${kind}: one outer ${end} cab`);
    }
    for (const { mesh, rec } of found) {
      assert.ok(rec.lenses.length >= 4, `${kind} ${rec.end}: ${rec.lenses.length} lenses (a white and a red one at each of two corners)`);
      const mode: TrainLampMode = rec.interior ? 'off' : SERVICE_LAMPS[rec.end];
      rec.lenses.forEach((l, i) => expectLens(mesh, l, mode, `${kind} ${rec.end}${rec.interior ? ' (inner)' : ''} lens ${i} (${l.role})`));
    }
  }
});

test('the coupled units\' inner cab ends are dark in every state, however the outer ends are set', () => {
  for (const kind of ['gn387x8', 'gn387x12'] as TrainKind[]) {
    const train = buildTrain(kind);
    const inner = cabs(train).filter((f) => f.rec.interior);
    assert.equal(inner.length, kind === 'gn387x8' ? 2 : 4, `${kind}: its inner cab ends`);
    for (const front of MODES) {
      for (const rear of MODES) {
        setTrainLampState(train, { front, rear });
        for (const { mesh, rec } of inner) for (const l of rec.lenses) expectLens(mesh, l, 'off', `${kind} inner ${rec.end} lens, state ${front}/${rear}`);
      }
    }
  }
});

test('every state of the two outer ends puts exactly the right lenses on, and touches nothing else in the car', () => {
  for (const kind of ['lner5', 'hull5', 'gn387x4', 'gn387x8', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    for (const front of MODES) {
      for (const rear of MODES) {
        const state: TrainLampState = { front, rear };
        const train = buildTrain(kind);
        const before = cabs(train).map(({ mesh }) => ({ colour: Array.from((mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array), glow: Array.from((mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute).array) }));
        setTrainLampState(train, state);
        assert.deepEqual(train.userData.lampState, state, `${kind}: records the state`);
        const after = cabs(train);
        after.forEach(({ mesh, rec }, i) => {
          const mode: TrainLampMode = rec.interior ? 'off' : state[rec.end];
          rec.lenses.forEach((l, k) => expectLens(mesh, l, mode, `${kind} ${front}/${rear} ${rec.end} lens ${k} (${l.role})`));
          // outside the lenses every vertex keeps the colour and the tag it was built with
          const lens = new Set<number>();
          for (const l of rec.lenses) for (let v = l.v0; v < l.v1; v++) lens.add(v);
          const colour = (mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array;
          const glow = (mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute).array;
          const was = before[i] as { colour: number[]; glow: number[] };
          assert.equal(glow.length, was.glow.length);
          for (let v = 0; v < glow.length; v++) {
            if (lens.has(v)) continue;
            assert.equal(glow[v], was.glow[v], `${kind} ${front}/${rear}: vertex ${v} outside the lenses keeps its tag`);
            assert.ok(colour[3 * v] === was.colour[3 * v] && colour[3 * v + 1] === was.colour[3 * v + 1] && colour[3 * v + 2] === was.colour[3 * v + 2], `${kind} ${front}/${rear}: vertex ${v} outside the lenses keeps its colour`);
          }
        });
        // a train nobody switched is untouched, and every lit lens is a glowing one
        const lit = after.reduce((n, { mesh, rec }) => n + (rec.interior ? 0 : rec.lenses.filter((l) => look(mesh, l).glow === 2).length), 0);
        const want = [front, rear].reduce((n, m) => n + (m === 'off' ? 0 : 2), 0);
        assert.equal(lit, want, `${kind} ${front}/${rear}: lit lenses (the two white ones at a head end, the two red ones at a tail end)`);
      }
    }
  }
});

test('the switch gives a car\'s detail mesh a geometry of its own (position and normals shared), and a clone of the same train keeps its lamps', () => {
  const template = buildTrain('lner5');
  const clone = template.clone(true);
  const [front] = cabs(template).filter((f) => f.rec.end === 'front');
  const [cloneFront] = cabs(clone).filter((f) => f.rec.end === 'front');
  assert.ok(front && cloneFront);
  const shared = front.mesh.geometry;
  same(cloneFront.mesh.geometry, shared, 'a clone shares its source\'s geometry before anyone switches a lamp');
  setTrainLampState(template, { front: 'off', rear: 'head' });
  differ(front.mesh.geometry, shared, 'the switched mesh owns a geometry now');
  same(front.mesh.geometry.getAttribute('position'), shared.getAttribute('position'), 'positions are the shared buffer');
  same(front.mesh.geometry.getAttribute('normal'), shared.getAttribute('normal'), 'and so are the normals');
  differ(front.mesh.geometry.getAttribute('color'), shared.getAttribute('color'), 'the colour buffer is the switched mesh\'s own');
  differ(front.mesh.geometry.getAttribute('aGlow'), shared.getAttribute('aGlow'), 'and so is the glow buffer');
  // the rewritten buffers are flagged for upload, and the shared ones are not
  assert.ok((front.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).version >= 1, 'the colour buffer is flagged for the GPU');
  assert.ok((front.mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute).version >= 1, 'and so is the glow buffer');
  assert.equal((shared.getAttribute('color') as THREE.BufferAttribute).version, 0, 'the shared colour buffer was not touched');
  assert.equal((shared.getAttribute('aGlow') as THREE.BufferAttribute).version, 0, 'nor the shared glow buffer');
  same(cloneFront.mesh.geometry, shared, 'the clone still has the template\'s original');
  for (const l of cloneFront.rec.lenses) expectLens(cloneFront.mesh, l, 'head', 'the clone\'s front lens');
  // and the clone can be switched on its own, leaving the first train's lamps as they were set
  setTrainLampState(clone, { front: 'tail', rear: 'off' });
  for (const l of front.rec.lenses) expectLens(front.mesh, l, 'off', 'the first train\'s front lens');
  for (const l of cloneFront.rec.lenses) expectLens(cloneFront.mesh, l, 'tail', 'the clone\'s front lens, switched');
  differ(cloneFront.mesh.geometry, front.mesh.geometry, 'the switched clone owns a geometry of its own');
  // a fresh train built after all this is in service state again
  const fresh = cabs(buildTrain('lner5'));
  for (const { mesh, rec } of fresh) for (const l of rec.lenses) expectLens(mesh, l, SERVICE_LAMPS[rec.end], 'a fresh train');
});

test('switching to the state a train already shows changes nothing, and the shared material and its glow are left alone', () => {
  const train = buildTrain('gn387x8');
  const meshes = cabs(train).map(({ mesh }) => mesh);
  const geometries = meshes.map((m) => m.geometry);
  setTrainLampState(train, SERVICE_LAMPS);
  meshes.forEach((m, i) => same(m.geometry, geometries[i], `no geometry is copied for a state that is already shown (cab ${i})`));
  setTrainLampState(train, { front: 'tail', rear: 'head' });
  setTrainLampState(train, { front: 'tail', rear: 'head' });
  for (const { mesh } of cabs(train)) same(mesh.material, plain(), 'the one shared material');
  let meshCount = 0;
  train.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshCount++; });
  assert.equal(meshCount, (() => { let n = 0; buildTrain('gn387x8').traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; })(), 'no mesh was added or removed');
  // switching back restores every lens exactly
  setTrainLampState(train, SERVICE_LAMPS);
  for (const { mesh, rec } of cabs(train)) for (const l of rec.lenses) expectLens(mesh, l, rec.interior ? 'off' : SERVICE_LAMPS[rec.end], 'restored lens');
});

test('a lamp lens covers whole triangles of the car\'s detail mesh and no window', () => {
  for (const kind of ['lner9', 'gn717x6', 'gc180x5'] as TrainKind[]) {
    for (const { mesh, rec } of cabs(buildTrain(kind))) {
      const glow = mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute;
      const count = glow.count;
      const seen = new Set<number>();
      for (const l of rec.lenses) {
        assert.ok(l.v1 > l.v0 && l.v0 % 3 === 0 && l.v1 % 3 === 0 && l.v1 <= count, `${kind}: a lens spans whole triangles inside the mesh (${l.v0}..${l.v1} of ${count})`);
        for (let v = l.v0; v < l.v1; v++) {
          assert.ok(!seen.has(v), `${kind}: vertex ${v} belongs to one lens`);
          seen.add(v);
          assert.notEqual(glow.getX(v), 1, `${kind}: a lens vertex is never a lit window's`);
        }
      }
      // every vertex tagged as a lens (2) is inside a recorded lens: there is no lens the switch cannot reach
      for (let v = 0; v < count; v++) if (glow.getX(v) === 2) assert.ok(seen.has(v), `${kind}: tag-2 vertex ${v} is in no recorded lens`);
    }
  }
});

test('the page exposes the switch next to evidenceBuildTrain, so a capture can set the lamps of a train it built or one drawn in the scene', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
  assert.match(main, /import \{[^}]*\bsetTrainLampState\b[^}]*\} from '\.\/train\.ts';/, 'imported from the train module');
  assert.match(main, /Object\.assign\(kx, \{[^}]*\bevidenceBuildTrain: buildTrain\b[^}]*\bsetTrainLampState\b[^}]*\}\);/, 'on window.__kx beside evidenceBuildTrain');
});
