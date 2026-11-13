// The light the headlamps throw on what stands in front of them (web/src/train-headlamp-light.ts): one lamp's light, run in the GLSL interpreter (web/tests/glsl.ts), the
// pure choice of which lamps get the slots, and the writer of the shared uniforms.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { addHeadlampBasic, HEADLAMP_BASIC_GLSL, HEADLAMP_GLSL, HEADLAMP_LIGHT, HEADLAMP_SLOTS, HeadlampFrame, headlampCandidates, headlampUniforms, selectHeadlamps, writeHeadlamps } from '../src/train-headlamp-light.ts';
import type { HeadlampCandidate } from '../src/train-headlamp-light.ts';
import { LENS, buildTrain, setTrainLampState } from '../src/train.ts';
import { Glsl } from './glsl.ts';

const glsl = new Glsl(HEADLAMP_GLSL.one);
const lens = new THREE.Color(LENS.headOn);
/** The light at `p` (world) on a face of normal `n` from a lamp at `lamp` (rail level `floor`) aimed along `aim` at `strength`. */
const lightAt = (p: number[], n: number[], lamp: number[], aim: number[], strength = 1, floor = 0): number[] =>
  glsl.call('headlampOne', [p, n, [...lamp, floor], [...aim, strength]], { vars: {} }) as number[];
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const window = (d: number): number => (1 - (d / HEADLAMP_LIGHT.range) ** 4) ** 2;

test('headlampOne: a wall square to the beam on its axis takes the lamp\'s colour at `level` at `ref` metres, falling with the square of the distance, held inside `near`', () => {
  const lamp = [0, 1.5, 0], aim = [0, 0, -1], wallFacing = [0, 0, 1];
  for (const d of [3, HEADLAMP_LIGHT.near, HEADLAMP_LIGHT.ref, 20, 40]) {
    const got = lightAt([0, 1.5, -d], wallFacing, lamp, aim);
    const held = Math.max(d, HEADLAMP_LIGHT.near);
    const want = HEADLAMP_LIGHT.level * (HEADLAMP_LIGHT.ref / held) ** 2 * window(d);
    for (const [i, c] of [lens.r, lens.g, lens.b].entries()) near(got[i]!, c * want, 1e-5, `${d} m, channel ${i}`);
  }
  near(lightAt([0, 1.5, -10], wallFacing, lamp, aim, 0.5)[0]!, 0.5 * lightAt([0, 1.5, -10], wallFacing, lamp, aim, 1)[0]!, 1e-9, 'the strength scales it');
});

test('headlampOne: nothing outside the outer cone, past the range, behind the lamp, on a face turned away, or at strength 0 (the day): exactly zero', () => {
  const lamp = [0, 1.5, 0], aim = [0, 0, -1];
  const zero = (p: number[], n: number[], msg: string, strength = 1): void => assert.deepEqual(lightAt(p, n, lamp, aim, strength), [0, 0, 0], msg);
  const off = (deg: number, d: number): number[] => [d * Math.sin((deg * Math.PI) / 180), 1.5, -d * Math.cos((deg * Math.PI) / 180)];
  zero(off(HEADLAMP_LIGHT.outer + 1, 10), [0, 0, 1], 'outside the outer cone');
  zero([0, 1.5, -HEADLAMP_LIGHT.range], [0, 0, 1], 'at the range');
  zero([0, 1.5, -(HEADLAMP_LIGHT.range + 5)], [0, 0, 1], 'past it');
  zero([0, 1.5, 5], [0, 0, -1], 'behind the lamp, facing it');
  zero([0, 1.5, -10], [0, 0, -1], 'a face turned from the lamp');
  zero([0, 1.5, -10], [0, 0, 1], 'by day: strength 0', 0);
  // the cone: whole inside `inner`, between the two less, none at `outer`
  const onAxis = lightAt([0, 1.5, -10], [0, 0, 1], lamp, aim)[0]!;
  const wallAt = (deg: number): number => lightAt(off(deg, 10 / Math.cos((deg * Math.PI) / 180)), [0, 0, 1], lamp, aim)[0]!;
  const inner = wallAt(HEADLAMP_LIGHT.inner - 0.5), mid = wallAt((HEADLAMP_LIGHT.inner + HEADLAMP_LIGHT.outer) / 2);
  assert.ok(inner > 0.7 * onAxis, `inside the inner cone it is whole but for the distance and N·L: ${inner} vs ${onAxis}`);
  assert.ok(mid > 0 && mid < 0.6 * inner, `between the cones it fades: ${mid}`);
});

test('headlampOne: N·L: a wall along the beam is lit by the cosine of its angle to the lamp; the cos cone and range are what HEADLAMP_LIGHT says', () => {
  const lamp = [0, 1.5, 0], aim = [0, 0, -1];
  // a platform face 2 m to the side, 10 m ahead, facing the track (-x)
  const p = [2, 1.5, -10], l = new THREE.Vector3(-2, 0, 10).normalize();
  const face = lightAt(p, [-1, 0, 0], lamp, aim)[0]!, square = lightAt(p, [l.x, l.y, l.z], lamp, aim)[0]!;
  near(face, square * l.dot(new THREE.Vector3(-1, 0, 0)), 1e-6, 'the face takes cos(angle) of what a face square to the lamp would');
  assert.ok(face > 0, 'and it is lit');
  assert.ok(HEADLAMP_GLSL.one.includes(Math.cos((HEADLAMP_LIGHT.outer * Math.PI) / 180).toFixed(6).replace(/0+$/, '')), 'the outer cone\'s cosine is in the shader');
  assert.equal(HEADLAMP_LIGHT.inner, 12);
  assert.equal(HEADLAMP_LIGHT.outer, 25);
  assert.equal(HEADLAMP_LIGHT.range, 45);
  assert.equal(HEADLAMP_SLOTS, 8);
});

test('headlampOne: the floor at the lamp\'s rail level is the pool\'s (none), a platform\'s top a metre over it and a wall at the foot are lit', () => {
  const lamp = [0, 1.5, 0], aim = [0, -0.2, -1].map((v, _, a) => v / Math.hypot(...a)), up = [0, 1, 0];
  assert.deepEqual(lightAt([0, 0, -10], up, lamp, aim, 1, 0), [0, 0, 0], 'the track bed at rail level: the pool lights it');
  assert.deepEqual(lightAt([0, -0.14, -10], up, lamp, aim, 1, 0), [0, 0, 0], 'the ballast under the rails');
  assert.ok(lightAt([0, 1, -10], up, lamp, aim, 1, 0)[0]! > 0, 'a platform top a metre over the rails is lit');
  assert.ok(lightAt([0, 0.05, -10], [0, 0, 1], lamp, aim, 1, 0)[0]! > 0, 'a wall\'s foot at rail level is lit');
  // the mask follows the lamp's own rail level, not the world's zero
  assert.deepEqual(lightAt([0, 3, -10], up, [0, 4.5, 0], aim, 1, 3), [0, 0, 0], 'a lamp on a viaduct 3 m up: its own track bed');
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
