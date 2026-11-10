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

interface Lens { role: 'head' | 'tail' | 'marker'; v0: number; v1: number }
interface LampRec { end: 'front' | 'rear'; interior: boolean; lenses: Lens[] }
const MODES: TrainLampMode[] = ['head', 'tail', 'off'];
/**
 * The lenses a cab end records: two corners of a headlamp and a marker lamp each; the AT300's cheek has a headlamp (a strip of five small lenses) and an array of seven small marker lenses,
 * 12 a cheek and 24 in all. (CHANGED in round 5: the headlamp was one lens, 8 a cheek and 16 in all.)
 */
const LENSES_PER_CAB = { at300: 24, other: 4 } as const;
/** The AT300's lenses by role at one cab end: ten headlamp lenses (five a cheek) and fourteen marker lenses (seven a cheek), no tail lens of its own. */
const AT300_ROLES = { head: 10, tail: 0, marker: 14 } as const;

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
  // CHANGED (round 5): the AT300's honeycomb is a marker lamp: white and glowing at the leading end, red and glowing at the trailing one, dark when the end shows neither
  // (it was a tail lens: dark at the leading end, the round-4 score's "only the headlamp lights at dusk")
  assert.deepEqual(lensLook('marker', 'head'), { hex: LENS.markerOn, glow: 2 });
  assert.deepEqual(lensLook('marker', 'tail'), { hex: LENS.tailOn, glow: 2 });
  assert.deepEqual(lensLook('marker', 'off'), { hex: LENS.tailOff, glow: 0 });
  assert.deepEqual(LENS, { headOn: 0xfff3c4, headOff: 0x70767e, tailOn: 0xd02020, tailOff: 0x4a1317, markerOn: 0xe6edff }, 'the published lens colours');
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
      // CHANGED (a white and a red lens at each of two corners, four in all, on every kind): the AT300's cheek has a strip of five headlamp lenses and an array of seven small marker lenses, 24 in all
      assert.equal(rec.lenses.length, TRAIN_KINDS.includes(kind) ? LENSES_PER_CAB.at300 : LENSES_PER_CAB.other, `${kind} ${rec.end}: ${rec.lenses.length} lenses (a headlamp and its marker lenses at each of two corners)`);
      // by role: the AT300 has headlamp and marker lenses only (its honeycomb is a marker lamp), every other family a headlamp and a tail lamp a corner
      for (const role of ['head', 'tail', 'marker'] as const) {
        const want = TRAIN_KINDS.includes(kind) ? AT300_ROLES[role] : { head: 2, tail: 2, marker: 0 }[role];
        assert.equal(rec.lenses.filter((l) => l.role === role).length, want, `${kind} ${rec.end}: its ${role} lenses`);
      }
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
        // CHANGED (two lit lenses at an end, whichever its lamps show): the AT300's cheek carries a strip of five headlamp lenses and seven marker lenses, and the markers show what their end
        // shows, so its head end lights 24 (ten white headlamp lenses and fourteen white markers) and its tail end 14 (the markers, red); it was one headlamp lens (2 at a head end)
        const perEnd = { head: TRAIN_KINDS.includes(kind) ? 24 : 2, tail: TRAIN_KINDS.includes(kind) ? 14 : 2 };
        const want = [front, rear].reduce((n, m) => n + (m === 'off' ? 0 : perEnd[m]), 0);
        assert.equal(lit, want, `${kind} ${front}/${rear}: lit lenses (the two white ones at a head end, the two red ones at a tail end; the AT300's 24 white ones at a head end, its fourteen red ones at a tail end)`);
      }
    }
  }
});

test('the AT300\'s marker lenses follow their end (white leading, red trailing, dark off), and no end ever shows a white and a red lens lit together', () => {
  const rgbOf = (hex: number): [number, number, number] => {
    const c = col(hex);
    return [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)];
  };
  // a lit lens is white (green about as strong as red) or red (green a small fraction of it)
  const isRed = (rgb: [number, number, number]): boolean => rgb[1] < rgb[0] / 3;
  const isWhite = (rgb: [number, number, number]): boolean => rgb[1] > rgb[0] / 2 && rgb[2] > rgb[0] / 2;
  for (const kind of TRAIN_KINDS) {
    for (const mode of MODES) {
      const train = buildTrain(kind);
      setTrainLampState(train, { front: mode, rear: 'off' });
      const cab = cabs(train).find((f) => f.rec.end === 'front' && !f.rec.interior);
      assert.ok(cab, `${kind}: a front cab`);
      const markers = cab.rec.lenses.filter((l) => l.role === 'marker');
      const heads = cab.rec.lenses.filter((l) => l.role === 'head');
      assert.equal(markers.length, AT300_ROLES.marker, `${kind} ${mode}: the marker lenses`);
      assert.equal(heads.length, AT300_ROLES.head, `${kind} ${mode}: the headlamp lenses`);
      const markerHex = mode === 'head' ? LENS.markerOn : mode === 'tail' ? LENS.tailOn : LENS.tailOff;
      for (const m of markers) {
        const got = look(cab.mesh, m);
        assert.deepEqual(got.rgb, rgbOf(markerHex), `${kind} ${mode}: a marker lens's colour`);
        assert.equal(got.glow, mode === 'off' ? 0 : 2, `${kind} ${mode}: a marker lens glows when its end shows a lamp, not when it shows none`);
      }
      for (const h of heads) {
        const got = look(cab.mesh, h);
        assert.deepEqual(got.rgb, rgbOf(mode === 'head' ? LENS.headOn : LENS.headOff), `${kind} ${mode}: a headlamp lens's colour`);
        assert.equal(got.glow, mode === 'head' ? 2 : 0, `${kind} ${mode}: a headlamp lens glows only at a leading end`);
      }
      // what glows at an end is all one colour: all white at a leading end, all red at a trailing one, nothing when off
      const glowing = cab.rec.lenses.map((l) => look(cab.mesh, l)).filter((g) => g.glow === 2).map((g) => g.rgb);
      assert.equal(glowing.length, { head: 24, tail: 14, off: 0 }[mode], `${kind} ${mode}: the lenses lit`);
      assert.ok(glowing.every((rgb) => (mode === 'head' ? isWhite(rgb) && !isRed(rgb) : isRed(rgb) && !isWhite(rgb))), `${kind} ${mode}: a lit lens of the wrong colour (a white and a red lamp together)`);
    }
  }
  // the two colours the test tells apart are the published ones
  assert.ok(isWhite(rgbOf(LENS.markerOn)) && !isRed(rgbOf(LENS.markerOn)), 'the marker white is white');
  assert.ok(isRed(rgbOf(LENS.tailOn)) && !isWhite(rgbOf(LENS.tailOn)), 'the tail red is red');
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
