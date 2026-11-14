// The light the headlamps throw on what stands in front of them (web/src/train-headlamp-light.ts): one lamp's light, run in the GLSL interpreter (web/tests/glsl.ts), the
// pure choice of which lamps get the slots, and the writer of the shared uniforms.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { addHeadlampBasic, HEADLAMP_BASIC_GLSL, HEADLAMP_GLSL, HEADLAMP_LIGHT, HEADLAMP_SLOTS, HeadlampFrame, headlampCandidates, headlampUniforms, selectHeadlamps, writeHeadlamps } from '../src/train-headlamp-light.ts';
import type { HeadlampCandidate } from '../src/train-headlamp-light.ts';
import { LENS, buildTrain, setTrainLampState } from '../src/train.ts';
import { POOL, poolFalloff } from '../src/train-lamp-pool.ts';
import { Glsl } from './glsl.ts';

const glsl = new Glsl(HEADLAMP_GLSL.one);
const lens = new THREE.Color(LENS.headOn);
/** The light at `p` (world) on a face of normal `n` from a lamp at `lamp` (rail level `floor`) aimed along `aim` at `strength`. */
const lightAt = (p: number[], n: number[], lamp: number[], aim: number[], strength = 1, floor = 0): number[] =>
  glsl.call('headlampOne', [p, n, [...lamp, floor], [...aim, strength]], { vars: {} }) as number[];
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const window = (d: number): number => (1 - (d / HEADLAMP_LIGHT.range) ** 4) ** 2;

const rad = (d: number): number => (d * Math.PI) / 180;
/** The beam's axis from a lamp `h` metres over its rail level aimed along `aim` (unit, horizontal here): dipped to meet the rail level `aimAt` ahead. */
const beamAxis = (h: number, aim = [0, 0, -1]): THREE.Vector3 => new THREE.Vector3(aim[0]! * HEADLAMP_LIGHT.aimAt, aim[1]! * HEADLAMP_LIGHT.aimAt - h, aim[2]! * HEADLAMP_LIGHT.aimAt).normalize();
/** A point `d` metres from `lamp`, `side` degrees across and `rise` degrees up from the beam's axis (tangent-space offsets, as the shader measures them), for a beam along -z. */
const offAxis = (lamp: number[], h: number, d: number, side: number, rise: number): number[] => {
  const ax = beamAxis(h), up = new THREE.Vector3(0, 1, 0).sub(ax.clone().multiplyScalar(ax.y)).normalize(), right = new THREE.Vector3().crossVectors(ax, up).normalize();
  const v = ax.clone().add(right.multiplyScalar(Math.tan(rad(side)))).add(up.multiplyScalar(Math.tan(rad(rise)))).normalize().multiplyScalar(d);
  return [lamp[0]! + v.x, lamp[1]! + v.y, lamp[2]! + v.z];
};
/** The light at `p` on a face square to the way to the lamp (N·L = 1). */
const squareAt = (p: number[], lamp: number[], strength = 1, floor = 0): number => {
  const l = new THREE.Vector3(lamp[0]! - p[0]!, lamp[1]! - p[1]!, lamp[2]! - p[2]!).normalize();
  return lightAt(p, [l.x, l.y, l.z], lamp, [0, 0, -1], strength, floor)[0]!;
};

test('headlampOne: a wall square to the beam on its (dipped) axis takes the lamp\'s colour at `level` at `ref` metres, falling with the square of the distance, held inside `near`', () => {
  const lamp = [0, 1.5, 0], ax = beamAxis(1.5);
  for (const d of [3, HEADLAMP_LIGHT.near, HEADLAMP_LIGHT.ref, 15]) {
    const p = [ax.x * d, 1.5 + ax.y * d, ax.z * d];
    const got = lightAt(p, [-ax.x, -ax.y, -ax.z], lamp, [0, 0, -1]);
    const held = Math.max(d, HEADLAMP_LIGHT.near);
    const want = HEADLAMP_LIGHT.level * (HEADLAMP_LIGHT.ref / held) ** 2 * window(d);
    for (const [i, c] of [lens.r, lens.g, lens.b].entries()) near(got[i]!, c * want, 1e-5, `${d} m, channel ${i}`);
  }
  const p = [ax.x * 10, 1.5 + ax.y * 10, ax.z * 10];
  near(lightAt(p, [0, 0, 1], lamp, [0, 0, -1], 0.5)[0]!, 0.5 * lightAt(p, [0, 0, 1], lamp, [0, 0, -1], 1)[0]!, 1e-9, 'the strength scales it');
});

test('headlampOne: nothing outside the beam across or up, past the range, behind the lamp, on a face turned away, or at strength 0 (the day): exactly zero', () => {
  const lamp = [0, 1.5, 0], aim = [0, 0, -1], [, wideOut] = HEADLAMP_LIGHT.wide;
  const tallOut = (Math.atan(Math.tan(rad(wideOut)) * HEADLAMP_LIGHT.aspect) * 180) / Math.PI;
  const zero = (p: number[], n: number[], msg: string, strength = 1): void => assert.deepEqual(lightAt(p, n, lamp, aim, strength), [0, 0, 0], msg);
  zero(offAxis(lamp, 1.5, 10, wideOut + 0.5, 0), [0, 0, 1], 'outside the beam across');
  zero(offAxis(lamp, 1.5, 10, 0, tallOut + 0.5), [0, 0, 1], 'outside the beam up');
  zero(offAxis(lamp, 1.5, 10, 0, -(tallOut + 0.5)), [0, 0, 1], 'outside the beam down');
  zero([0, 1.5, -HEADLAMP_LIGHT.range], [0, 0, 1], 'at the range');
  zero([0, 1.5, -(HEADLAMP_LIGHT.range + 5)], [0, 0, 1], 'past it');
  zero([0, 1.5, 5], [0, 0, -1], 'behind the lamp, facing it');
  zero([0, 1, -10], [0, 0, -1], 'a face turned from the lamp');
  zero([0, 1, -10], [0, 0, 1], 'by day: strength 0', 0);
});

test('headlampOne: the beam is an ellipse wider than tall: whole inside its inner ellipse, fading to none at its edge, an angle that is lit across is dark up', () => {
  const lamp = [0, 1.5, 0], [wideIn, wideOut] = HEADLAMP_LIGHT.wide, d = 10;
  const onAxis = squareAt(offAxis(lamp, 1.5, d, 0, 0), lamp);
  near(squareAt(offAxis(lamp, 1.5, d, wideIn * 0.9, 0), lamp), onAxis, 1e-6, 'inside the inner ellipse across: whole');
  const mid = squareAt(offAxis(lamp, 1.5, d, (wideIn + wideOut) / 2, 0), lamp);
  assert.ok(mid > 0.05 * onAxis && mid < 0.95 * onAxis, `between the ellipses it fades: ${mid} of ${onAxis}`);
  const across = squareAt(offAxis(lamp, 1.5, d, wideOut * 0.75, 0), lamp), up = squareAt(offAxis(lamp, 1.5, d, 0, wideOut * 0.75), lamp);
  assert.ok(across > 0, `three quarters of the way out across is lit: ${across}`);
  assert.equal(up, 0, 'the same angle up is past the top of the beam');
  // the old floodlight: 12 to 25 degrees round. A wall 20 degrees off the axis is dark now
  assert.equal(squareAt(offAxis(lamp, 1.5, d, 20, 0), lamp), 0, '20 degrees across');
});

test('headlampOne: the beam\'s axis is dipped to meet the lamp\'s rail level `aimAt` ahead (the pool\'s far end): the light is symmetric about it, not about the car\'s axis', () => {
  const [wideIn, wideOut] = HEADLAMP_LIGHT.wide, tallMid = (Math.atan(Math.tan(rad((wideIn + wideOut) / 2)) * HEADLAMP_LIGHT.aspect) * 180) / Math.PI;
  for (const [lamp, floor] of [[[0, 1.5, 0], 0], [[0, 6, 0], 3.6]] as const) {
    const h = lamp[1] - floor, square = (p: number[]): number => squareAt(p, [...lamp], 1, floor);
    const above = square(offAxis([...lamp], h, 5, 0, tallMid)), below = square(offAxis([...lamp], h, 5, 0, -tallMid)); // 5 m out: over the floor mask
    assert.ok(above > 0, `lit half-way out above the axis: ${above}`);
    near(above, below, 1e-6 * above, `as much below the dipped axis as above it (lamp ${h} m over its rails)`);
    const ax = beamAxis(h);
    near(h + ax.y * HEADLAMP_LIGHT.aimAt / -ax.z, 0, 1e-9, 'the axis meets the rail level aimAt ahead');
  }
  // on the car's own axis (the lamp's height), 10 m out, the light is the dipped beam's upper flank: less than on its axis
  const lamp = [0, 1.5, 0];
  assert.ok(squareAt([0, 1.5, -10], lamp) < squareAt(offAxis(lamp, 1.5, 10, 0, 0), lamp), 'level with the lamp is above the beam\'s middle');
});

test('headlampOne: the beam\'s numbers come from the pool on the rails: as wide as the pool at `poolAt` metres, aimed at its far end; it stays over the pool', () => {
  const t = HEADLAMP_LIGHT.poolAt / POOL.length, half = POOL.width / 2;
  assert.ok(HEADLAMP_LIGHT.poolAt >= 15 && HEADLAMP_LIGHT.poolAt <= 20, 'the pool is read 15 to 20 m out');
  // scan the pool's own falloff across at t: where it is half its middle, and where it ends
  let halfAt = 0, endAt = 0;
  for (let u = 0; u <= 1; u += 1e-5) { const v = poolFalloff(u, t); if (v >= 0.5 * poolFalloff(0, t)) halfAt = u; if (v > 0) endAt = u; }
  near(HEADLAMP_LIGHT.wide[0], (Math.atan((half * halfAt) / HEADLAMP_LIGHT.poolAt) * 180) / Math.PI, 1e-3, 'whole to where the pool is half its middle');
  near(HEADLAMP_LIGHT.wide[1], (Math.atan((half * endAt) / HEADLAMP_LIGHT.poolAt) * 180) / Math.PI, 1e-3, 'none past where the pool ends');
  assert.equal(HEADLAMP_LIGHT.aimAt, POOL.length, 'the axis meets the rails where the pool ends');
  assert.ok(HEADLAMP_LIGHT.aspect > 0 && HEADLAMP_LIGHT.aspect < 1, 'taller than wide is not a headlamp');
  assert.ok(HEADLAMP_GLSL.one.includes(Math.tan(rad(HEADLAMP_LIGHT.wide[1])).toFixed(6).replace(/0+$/, '')), 'the edge\'s tangent is in the shader');
  // a wall square across the track 20 m out (a buffer stop's, a portal's face): its light sits low, over the pool, from the mask up to a few metres
  const lamp = [0, 1.5, 0], at = (y: number): number => lightAt([0, y, -20], [0, 0, 1], lamp, [0, 0, -1])[0]!;
  assert.ok(at(0.8) > 0, 'just over the mask: lit, so the wall light meets the pool');
  assert.equal(at(3.5), 0, '3.5 m up a wall 20 m ahead: dark');
  assert.equal(HEADLAMP_LIGHT.range, 45);
  assert.equal(HEADLAMP_SLOTS, 8);
});

test('headlampOne: no light high over the rails: it fades out over `overRail`, so a roof truss over the lamp, or one in the beam of a lamp tipped up, is dark', () => {
  const [lo, hi] = HEADLAMP_LIGHT.overRail, floor = 0;
  // a lamp on a train tipped well up (a steep ramp), so its beam climbs: on the beam's axis, whole under `lo`, fading, none over `hi`
  const lamp = [0, 1.5, 0], aim = new THREE.Vector3(0, 0.45, -1).normalize(), ax = new THREE.Vector3(aim.x * HEADLAMP_LIGHT.aimAt, aim.y * HEADLAMP_LIGHT.aimAt - 1.5, aim.z * HEADLAMP_LIGHT.aimAt).normalize();
  const onAxisAt = (y: number): number => { const d = (y - 1.5) / ax.y, p = [ax.x * d, y, ax.z * d]; return lightAt(p, [-ax.x, -ax.y, -ax.z], lamp, [aim.x, aim.y, aim.z], 1, floor)[0]!; };
  const below = onAxisAt(lo - 0.5), between = onAxisAt((lo + hi) / 2);
  assert.ok(below > 0, `under ${lo} m: lit (${below})`);
  assert.ok(between > 0 && between < below, `between ${lo} and ${hi} m it fades: ${between}`);
  assert.equal(onAxisAt(hi + 0.2), 0, `over ${hi} m: none`);
  // the shed: a truss's underside 12 m over the rails, right over a level lamp and 15 m ahead of it, facing down
  for (const z of [0, -5, -15]) assert.deepEqual(lightAt([0, 12, z], [0, -1, 0], [0, 1.5, 0], [0, 0, -1]), [0, 0, 0], `a truss ${-z} m ahead`);
});

test('headlampOne: everything within the mask over the lamp\'s rail level is the pool\'s, whichever way it faces (the sleepers\' ends too); a platform top or a wall a metre up is lit', () => {
  const lamp = [0, 1.5, 0], aim = [0, 0, -1], up = [0, 1, 0], facing = [0, 0, 1]; // the shader dips the beam to the rails itself
  assert.deepEqual(lightAt([0, 0, -10], up, lamp, aim, 1, 0), [0, 0, 0], 'the track bed at rail level: the pool lights it');
  assert.deepEqual(lightAt([0, -0.14, -10], up, lamp, aim, 1, 0), [0, 0, 0], 'the ballast under the rails');
  assert.deepEqual(lightAt([0, -0.17, -10], facing, lamp, aim, 1, 0), [0, 0, 0], 'a sleeper\'s end, facing up the track at the lamp (the first look pack\'s white bars)');
  assert.deepEqual(lightAt([0.75, -0.05, -10], [-1, 0, 0], lamp, aim, 1, 0), [0, 0, 0], 'a rail\'s side');
  assert.deepEqual(lightAt([0, 0.3, -10], facing, lamp, aim, 1, 0), [0, 0, 0], 'a wall\'s foot, under the mask');
  assert.ok(lightAt([0, 1, -10], up, lamp, aim, 1, 0)[0]! > 0, 'a platform top a metre over the rails is lit');
  assert.ok(lightAt([0, 1, -10], facing, lamp, aim, 1, 0)[0]! > 0, 'a wall a metre up is lit');
  const mid = lightAt([0, 0.475, -10], facing, lamp, aim, 1, 0)[0]!, full = lightAt([0, 0.7, -10], facing, lamp, aim, 1, 0)[0]!;
  assert.ok(mid > 0 && mid < full, `it fades in over the mask's edge: ${mid} under ${full}`);
  // the mask follows the lamp's own rail level, not the world's zero
  assert.deepEqual(lightAt([0, 3, -10], facing, [0, 4.5, 0], aim, 1, 3), [0, 0, 0], 'a lamp on a viaduct 3 m up: its own track bed');
});

/** A candidate at `x, z`, aimed along -z. */
const cand = (key: string, x: number, z: number, opacity = 1): HeadlampCandidate => ({ key, position: new THREE.Vector3(x, 1.5, z), aim: new THREE.Vector3(0, 0, -1), floorY: 0, opacity });
const view = (): { camera: THREE.PerspectiveCamera; frustum: THREE.Frustum } => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(0, 10, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return { camera, frustum };
};

test('selectHeadlamps: the slots go to the lamps in view nearest the camera, at most HEADLAMP_SLOTS, fading in over `fade` seconds', () => {
  const { camera, frustum } = view();
  const cands = Array.from({ length: 12 }, (_, i) => cand(`l${i}`, 0, 40 - 5 * i));
  cands.push(cand('behind', 0, 400)); // behind the camera, aimed away from what it sees: its lit volume is out of view
  cands.push({ ...cand('far-side', 3000, 0), aim: new THREE.Vector3(1, 0, 0) });
  let fades = new Map<string, number>();
  const first = selectHeadlamps(cands, camera.position, frustum, fades, HEADLAMP_LIGHT.fade / 2);
  assert.equal(first.slots.length, HEADLAMP_SLOTS);
  assert.deepEqual(first.slots.map((s) => s.candidate.key), ['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'], 'nearest first');
  for (const s of first.slots) near(s.strength, 0.5, 1e-9, `${s.candidate.key} is half way in after half the fade`);
  fades = first.fades;
  const second = selectHeadlamps(cands, camera.position, frustum, fades, HEADLAMP_LIGHT.fade);
  for (const s of second.slots) assert.equal(s.strength, 1, 'and whole after it');
  assert.ok(!second.slots.some((s) => s.candidate.key === 'behind' || s.candidate.key === 'far-side'), 'none out of view');
  // opacity scales the strength
  const faded = selectHeadlamps([cand('half', 0, 0, 0.5)], camera.position, frustum, new Map(), 1);
  assert.equal(faded.slots[0]!.strength, 0.5);
});

test('selectHeadlamps: a lamp that holds a slot keeps it against one a little nearer (hysteresis); one much nearer takes it, the old one fading out before the new one comes in', () => {
  const { camera, frustum } = view();
  const holders = Array.from({ length: HEADLAMP_SLOTS }, (_, i) => cand(`h${i}`, 0, 20 - 4 * i));
  let fades = new Map<string, number>(holders.map((c) => [c.key, 1]));
  const last = holders[HEADLAMP_SLOTS - 1]!, lastD = last.position.distanceTo(camera.position);
  // a newcomer a little nearer than the last holder: inside the hysteresis, so nothing changes
  const slightly = { ...cand('new', 0, 0), position: last.position.clone().add(new THREE.Vector3(0, 0, 0.5)) };
  assert.ok(slightly.position.distanceTo(camera.position) > lastD * HEADLAMP_LIGHT.hysteresis);
  let r = selectHeadlamps([...holders, slightly], camera.position, frustum, fades, 0.1);
  assert.ok(!r.slots.some((s) => s.candidate.key === 'new'), 'the holders keep their slots');
  assert.ok(r.slots.every((s) => s.strength === 1));
  // a newcomer much nearer than any: the farthest holder fades out, and only once its slot is free does the newcomer fade in
  const close = cand('close', 0, 45);
  r = selectHeadlamps([...holders, close], camera.position, frustum, fades, HEADLAMP_LIGHT.fade / 2);
  assert.equal(r.slots.length, HEADLAMP_SLOTS, 'never more than the slots');
  assert.equal(r.fades.get(last.key), 0.5, 'the farthest holder is fading out');
  assert.ok(!r.fades.has('close'), 'the newcomer waits for a slot');
  fades = r.fades;
  r = selectHeadlamps([...holders, close], camera.position, frustum, fades, HEADLAMP_LIGHT.fade / 2);
  assert.ok(!r.fades.has(last.key), 'the old one gave its slot up at 0');
  assert.equal(r.fades.get('close'), 0.5, 'and the newcomer is fading in');
  assert.equal(r.slots.length, HEADLAMP_SLOTS);
  // a lamp gone from the candidates (its train gone, or its lamps changed) gives its slot up at once
  r = selectHeadlamps(holders.slice(1), camera.position, frustum, new Map(holders.map((c) => [c.key, 1] as const)), 0.01);
  assert.ok(!r.fades.has('h0'));
  // pure: the fades given are not changed
  const given = new Map([['h0', 0.5]]);
  selectHeadlamps(holders, camera.position, frustum, given, 0.1);
  assert.deepEqual([...given], [['h0', 0.5]]);
});

test('headlampCandidates: one light for each end that shows head, at its head lenses, aimed along its car, at its rail level; none for tail, off or a hidden train', () => {
  const train = buildTrain('gn387x4');
  setTrainLampState(train, { front: 'head', rear: 'tail' });
  train.position.set(5, 2, 0);
  train.updateMatrixWorld(true);
  let c = headlampCandidates([{ group: train }]);
  assert.equal(c.length, 1, 'the front shows head, the rear tail');
  const one = c[0]!;
  near(one.aim.z, -1, 1e-9, 'the front looks along -z');
  near(one.floorY, 2, 1e-9, 'its rail level is its car\'s');
  assert.ok(one.position.y > 2.5 && one.position.y < 4.5, `its lamps stand over the rails: ${one.position.y}`);
  near(one.position.x, 5, 1e-6, 'on the axis');
  assert.ok(one.position.z <= 1.5, `at the front nose: ${one.position.z}`);
  setTrainLampState(train, { front: 'head', rear: 'head' });
  c = headlampCandidates([{ group: train }]);
  assert.equal(c.length, 2);
  assert.notEqual(c[0]!.key, c[1]!.key, 'each end its own key');
  assert.deepEqual(headlampCandidates([{ group: train }]).map((x) => x.key), c.map((x) => x.key), 'and the same key every frame');
  setTrainLampState(train, { front: 'off', rear: 'tail' });
  assert.equal(headlampCandidates([{ group: train }]).length, 0);
  setTrainLampState(train, { front: 'head', rear: 'tail' });
  assert.equal(headlampCandidates([{ group: train, opacity: 0 }]).length, 0, 'a train faded out');
  train.visible = false;
  assert.equal(headlampCandidates([{ group: train }]).length, 0, 'a hidden train');
});

test('writeHeadlamps and HeadlampFrame: the slots go into the shared uniforms at the night\'s level; by day (night 0) the count is 0 and the fades are forgotten', () => {
  const lamp = cand('a', 1, 2);
  writeHeadlamps([{ candidate: lamp, strength: 0.8 }], 0.5);
  assert.equal(headlampUniforms.uHeadlampCount.value, 1);
  assert.deepEqual(headlampUniforms.uHeadlampPos.value[0]!.toArray(), [1, 1.5, 2, 0]);
  assert.deepEqual(headlampUniforms.uHeadlampAim.value[0]!.toArray(), [0, 0, -1, 0.4]);
  writeHeadlamps([{ candidate: lamp, strength: 0.8 }], 0);
  assert.equal(headlampUniforms.uHeadlampCount.value, 0, 'day: none');
  const uniforms = headlampUniforms.uHeadlampPos.value;
  const train = buildTrain('gn387x4');
  setTrainLampState(train, { front: 'head', rear: 'tail' });
  const { camera } = view();
  camera.position.set(0, 5, -60);
  camera.lookAt(0, 0, 0);
  const frame = new HeadlampFrame();
  frame.update([{ group: train }], camera, HEADLAMP_LIGHT.fade, 1);
  assert.equal(headlampUniforms.uHeadlampCount.value, 1, 'night: the front lamp, in view');
  assert.equal(frame.slots[0]!.strength, 1);
  frame.update([{ group: train }], camera, 0.016, 0);
  assert.equal(headlampUniforms.uHeadlampCount.value, 0, 'day: count 0');
  assert.equal(frame.slots.length, 0);
  frame.update([{ group: train }], camera, HEADLAMP_LIGHT.fade / 2, 1);
  near(frame.slots[0]!.strength, 0.5, 1e-9, 'dusk again: it fades in from nothing');
  assert.equal(headlampUniforms.uHeadlampPos.value, uniforms, 'the same arrays every time: a uniform\'s value, never a new program');
});

test('main.ts is the one writer of the headlamps\' uniforms, once a frame, before the render; nothing else in the page writes them', () => {
  const src = new URL('../src/', import.meta.url);
  const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
  const writers = files.filter((f) => /uHeadlamp(Count|Pos|Aim)\.value\s*(\[[^\]]*\])?\s*(=|\.set\(|!\.set\()/.test(readFileSync(new URL(f, src), 'utf8')));
  assert.deepEqual(writers, ['train-headlamp-light.ts'], 'only the module itself sets the values (writeHeadlamps)');
  const callers = files.filter((f) => f !== 'train-headlamp-light.ts' && /new HeadlampFrame\(|writeHeadlamps\(/.test(readFileSync(new URL(f, src), 'utf8')));
  assert.deepEqual(callers, ['main.ts'], 'and only main.ts drives it');
  const main = readFileSync(new URL('main.ts', src), 'utf8');
  const loop = main.slice(main.indexOf('renderer.setAnimationLoop('));
  assert.equal(loop.split('headlamps.update(').length - 1, 1, 'once a frame');
  const order = ['controls.update();', 'climate.update(', 'headlamps.update(', 'renderer.render('].map((needle) => loop.indexOf(needle));
  assert.ok(order.every((i) => i >= 0), `${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'after the camera has moved and the sky has set the night, before the render');
});

test('addHeadlampBasic: a MeshBasic program takes the slots\' light once, before the output, only while a slot is in use; its key is its own and does not change with the lamps', () => {
  const m = new THREE.MeshBasicMaterial({ color: 0x999999 });
  let priorRan = 0;
  m.onBeforeCompile = () => { priorRan++; };
  m.customProgramCacheKey = () => 'prior';
  const version = m.version;
  addHeadlampBasic(m);
  addHeadlampBasic(m);
  assert.equal(m.version, version + 1, 'patched once');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.equal(priorRan, 1, 'the prior patch ran');
  const v = shader.vertexShader, fr = shader.fragmentShader;
  for (const [stage, src] of [['vertex', v], ['fragment', fr]] as const) assert.equal(src.split(HEADLAMP_BASIC_GLSL.declare).length - 1, 1, `${stage}: the varying once`);
  assert.ok(v.indexOf(HEADLAMP_BASIC_GLSL.vertex) > v.indexOf('#include <project_vertex>'), 'the place is taken once it is projected');
  assert.equal(fr.split('vec3 headlampOne(').length - 1, 1, 'the light\'s function once');
  const line = HEADLAMP_BASIC_GLSL.fragment('diffuseColor.rgb');
  assert.equal(fr.split(line).length - 1, 1, 'added once');
  const order = ['vec3 headlampsAt(', 'vec3 outgoingLight = reflectedLight.indirectDiffuse;', '#include <envmap_fragment>', line, '#include <opaque_fragment>'].map((n) => fr.indexOf(n));
  assert.ok(order.every((i) => i >= 0), `${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'added to the colour after it is made, before the output');
  assert.ok(line.startsWith('if ( uHeadlampCount > 0 ) {'), 'skipped with no slot in use (the day)');
  for (const name of ['uHeadlampCount', 'uHeadlampPos', 'uHeadlampAim'] as const) assert.ok(shader.uniforms[name] === headlampUniforms[name], `${name} is the shared one`);
  assert.equal(m.customProgramCacheKey(), 'prior+headlampBasic');
  headlampUniforms.uHeadlampCount.value = 3;
  assert.equal(m.customProgramCacheKey(), 'prior+headlampBasic', 'the lamps change no key');
  headlampUniforms.uHeadlampCount.value = 0;
  // a grey albedo for a surface drawn darker than it reflects
  const tube = new THREE.MeshBasicMaterial({ color: 0x090b0e });
  addHeadlampBasic(tube, 0.1);
  const t = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  tube.onBeforeCompile(t as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.ok(t.fragmentShader.includes('outgoingLight += headlampsAt( headlampP, headlampN ) * vec3( 0.1 );'));
  assert.notEqual(tube.customProgramCacheKey(), new THREE.MeshBasicMaterial().customProgramCacheKey() + '+headlampBasic', 'its own program');
});
