// The halos of the train lamps (web/src/train-lamp-pool.ts), as round 7's night look found them: where two halos overlap on one lamp cluster (the AT300's headlamp and marker array) the glow
// added up to twice a halo's strength and hid the lamps it surrounds, and a halo seen edge-on was a sliver hanging off the nose. So the halos on one side of a cab end share one halo's
// strength, and the halo's shader scales each disc by how squarely its lens faces the camera. The shader's own lines are run in the GLSL interpreter (web/tests/glsl.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import * as lamp from '../src/train-lamp-pool.ts';
import { HALO, TrainLampLights, haloPlacements } from '../src/train-lamp-pool.ts';
import { trainNight } from '../src/train-geom.ts';
import { buildTrain, setTrainLampState } from '../src/train.ts';
import type { TrainLampMode } from '../src/train.ts';
import { Glsl, Mat } from './glsl.ts';
import type { Value } from './glsl.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const state = (front: TrainLampMode, rear: TrainLampMode) => ({ front, rear });
const withNight = (value: number, run: () => void): void => {
  const had = trainNight.value;
  trainNight.value = value;
  try { run(); } finally { trainNight.value = had; }
};

/**
 * What each halo of `train` is drawn at after dark, as the strength it adds at its brightest, by end and side of the cab: read back from the colour each instance is given and the material's
 * opacity, so it is what the GPU is handed. A lens group's own colour is divided out (a red tail lamp's channels are not a white head lamp's).
 */
function strengths(lights: TrainLampLights, train: THREE.Group): Map<string, number[]> {
  lights.update([{ group: train }]);
  const placements = haloPlacements([{ group: train }]), out = new Map<string, number[]>(), c = new THREE.Color();
  assert.equal(lights.halo.count, placements.length, 'the mesh has an instance for each placement');
  placements.forEach((p, i) => {
    lights.halo.getColorAt(i, c);
    const own = new THREE.Color(p.hex);
    const key = `${p.end} ${Math.abs(p.position[0]) < 0.05 ? 'centre' : p.position[0] < 0 ? 'left' : 'right'}`;
    out.set(key, [...(out.get(key) ?? []), lights.halo.material.opacity * (Math.max(c.r, c.g, c.b) / Math.max(own.r, own.g, own.b))]);
  });
  return out;
}

test('the halos on one side of a cab end share one halo\'s strength: a side never glows brighter than HALO.night, for every kind and lamp state, and a side with one halo keeps it whole', () => {
  const lights = new TrainLampLights();
  withNight(1, () => {
    for (const kind of ALL_KINDS as readonly TrainKind[]) {
      const train = buildTrain(kind);
      for (const [front, rear] of [['head', 'tail'], ['head', 'head'], ['tail', 'tail'], ['tail', 'head']] as const) {
        setTrainLampState(train, state(front, rear));
        for (const [side, parts] of strengths(lights, train)) {
          const sum = parts.reduce((a, b) => a + b, 0);
          assert.ok(sum <= HALO.night + 1e-6, `${kind} ${front}/${rear} ${side}: ${parts.length} halos add up to ${sum.toFixed(3)}, over HALO.night ${HALO.night}`);
          near(sum, HALO.night, 1e-6, `${kind} ${front}/${rear} ${side}: a side with a lit lens group keeps one halo's strength, no less`);
        }
      }
    }
  });
  lights.dispose();
});

test('the Azuma\'s two halos on each side of its head end take half a halo each, the Class 180\'s one a side is whole, and a red tail halo is whole', () => {
  const lights = new TrainLampLights();
  withNight(1, () => {
    const azuma = strengths(lights, buildTrain('lner5')); // in service: head at the front, tail at the rear
    for (const side of ['front left', 'front right']) {
      const parts = azuma.get(side)!;
      assert.equal(parts.length, 2, `${side}: a headlamp halo and a marker array's`);
      for (const part of parts) near(part, HALO.night / 2, 1e-6, `Azuma ${side}: half a halo each`);
    }
    for (const side of ['rear left', 'rear right']) assert.deepEqual(azuma.get(side)!.map((v) => +v.toFixed(6)), [HALO.night], `Azuma ${side}: one red halo, whole`);
    const class180 = strengths(lights, buildTrain('gc180x5'));
    for (const side of ['front left', 'front right', 'rear left', 'rear right']) assert.deepEqual(class180.get(side)!.map((v) => +v.toFixed(6)), [HALO.night], `Class 180 ${side}: one halo, whole (unchanged)`);
  });
  lights.dispose();
});

/** The halo material's shader as three hands it to the program: three's own MeshBasicMaterial source, run through the material's `onBeforeCompile`. */
function haloShader(lights: TrainLampLights): { vertexShader: string; fragmentShader: string } {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  lights.halo.material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}
/**
 * What the halo's vertex shader writes into `vHaloFacing` for one instance and one eye: the lines it adds after the projection (none, if it adds none: the result is then NaN), run in the GLSL
 * interpreter against the instance's matrix, the mesh's own matrix `model` and the camera's place.
 */
function facingOf(shader: { vertexShader: string }, instance: THREE.Matrix4, eye: THREE.Vector3, model = new THREE.Matrix4()): number {
  const anchor = '#include <project_vertex>', from = shader.vertexShader.indexOf(anchor) + anchor.length, to = shader.vertexShader.indexOf('#include <logdepthbuf_vertex>', from);
  const vars: Record<string, Value> = { modelMatrix: new Mat(4, [...model.elements]), instanceMatrix: new Mat(4, [...instance.elements]), cameraPosition: eye.toArray(), vHaloFacing: Number.NaN };
  new Glsl('').run(shader.vertexShader.slice(from, to), { vars });
  return vars.vHaloFacing as number;
}

test('the halo shader scales each disc by how squarely its lens faces the camera: whole facing it, none at the edge of the fade, edge-on or from behind', () => {
  const lights = new TrainLampLights();
  const train = buildTrain('gc180x5');
  withNight(1, () => lights.update([{ group: train }]));
  const shader = haloShader(lights);
  // three's own chunks are where the lines went: the varying once in each stage, the alpha scaled after the colour is read; the pool, a decal on the ground, is left as three has it
  for (const [stage, source] of [['vertex', shader.vertexShader], ['fragment', shader.fragmentShader]] as const) assert.equal((source.match(/varying float vHaloFacing;/g) ?? []).length, 1, `${stage}: the varying is declared once`);
  assert.match(shader.fragmentShader, /#include <color_fragment>\s*diffuseColor\.a \*= vHaloFacing;/, 'the alpha is scaled once the colour is read');
  // and what that line does, run: the alpha (the additive blend's weight) is scaled by the varying and the colour is not
  const fragment = shader.fragmentShader, after = fragment.indexOf('#include <color_fragment>') + '#include <color_fragment>'.length;
  const pixel: Record<string, Value> = { diffuseColor: [1, 0.5, 0.25, 0.8], vHaloFacing: 0.5 };
  new Glsl('').run(fragment.slice(after, fragment.indexOf('#include <alphamap_fragment>', after)), { vars: pixel });
  assert.deepEqual(pixel.diffuseColor, [1, 0.5, 0.25, 0.4], 'the fragment halves the alpha for a facing of 0.5 and leaves the colour');
  const pool = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  lights.pool.material.onBeforeCompile(pool as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.equal(pool.vertexShader, THREE.ShaderLib.basic.vertexShader, 'the pool\'s vertex shader is three\'s own');
  assert.equal(pool.fragmentShader, THREE.ShaderLib.basic.fragmentShader, 'and its fragment shader');
  // the first halo as the mesh holds it: its place, and the way its lens faces (the quad's own +z)
  const instance = new THREE.Matrix4(), at = new THREE.Vector3(), q = new THREE.Quaternion(), size = new THREE.Vector3();
  lights.halo.getMatrixAt(0, instance);
  instance.decompose(at, q, size);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q), across = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
  const seenAt = (cosine: number, model?: THREE.Matrix4): number => {
    const way = normal.clone().multiplyScalar(cosine).addScaledVector(across, Math.sqrt(1 - cosine * cosine)), eye = at.clone().addScaledVector(way, 25);
    return facingOf(shader, instance, model ? eye.applyMatrix4(model) : eye, model);
  };
  const { from, to } = lamp.HALO_FACING;
  assert.ok(from > 0 && to > from && to < 0.4, `the fade runs from ${from} to ${to}: after edge-on, and whole before the Azuma's lenses seen dead ahead (0.4)`);
  near(seenAt(1), 1, 1e-9, 'facing the camera: whole');
  near(seenAt(to), 1, 1e-9, 'whole from `to`');
  near(seenAt((from + to) / 2), 0.5, 1e-9, 'half way through the fade: smoothstep\'s half');
  assert.ok(seenAt(from + 0.4 * (to - from)) < seenAt(from + 0.6 * (to - from)), 'rising through the fade');
  near(seenAt(from), 0, 1e-9, 'none at `from`');
  assert.equal(seenAt(0.5 * from), 0, 'none under it');
  assert.equal(seenAt(0), 0, 'edge-on (the camera in the lens\'s plane) gives nothing: the sliver');
  assert.equal(seenAt(-0.3), 0, 'from behind, none');
  assert.equal(seenAt(-1), 0, 'from straight behind, none');
  // the mesh's own transform counts: a group turned and moved in the world, the camera turned and moved with it, sees what it saw
  const model = new THREE.Matrix4().makeRotationY(0.7).setPosition(10, 0, 5);
  for (const c of [1, 0.225, 0.2, 0, -0.5]) near(seenAt(c, model), seenAt(c), 1e-9, `the group's transform is applied (cosine ${c})`);
});

test('the Azuma\'s far-side halos give nothing from the night look\'s halo-close camera (the sliver), the near side whole; dead ahead all four are whole; from behind, none', () => {
  const lights = new TrainLampLights();
  const train = buildTrain('lner5');
  withNight(1, () => lights.update([{ group: train }]));
  const shader = haloShader(lights), placements = haloPlacements([{ group: train }]), instance = new THREE.Matrix4();
  const seen = (eye: [number, number, number], end: 'front' | 'rear'): { side: number; f: number }[] => placements.flatMap((p, i) => {
    if (p.end !== end) return [];
    lights.halo.getMatrixAt(i, instance);
    return [{ side: Math.sign(p.position[0]), f: facingOf(shader, instance, new THREE.Vector3(...eye)) }];
  });
  const close = seen([2.2, 1.9, -6], 'front'); // the look's halo-close eye: 6 m ahead of the nose, 2.2 m to the +x side
  assert.equal(close.length, 4);
  for (const h of close.filter((h) => h.side < 0)) assert.equal(h.f, 0, 'the far side faces away from this eye (cosine under 0.1): nothing, not a sliver');
  for (const h of close.filter((h) => h.side > 0)) near(h.f, 1, 1e-9, 'the near side faces it: whole');
  const ahead = seen([0, 2, -30], 'front'); // dead ahead, 30 m: the lens groups face about 65 degrees off the nose's axis, cosine about 0.4
  for (const h of ahead) near(h.f, 1, 1e-9, 'dead ahead every halo is whole: the fade does not dim an Azuma seen head-on');
  const length = train.userData.length as number, behindTheTail: [number, number, number] = [0, 2, length + 30]; // dead behind the train, 30 m: the front's lenses face away, the tail's face it
  for (const h of seen(behindTheTail, 'front')) assert.equal(h.f, 0, 'from behind the train the front halos give nothing');
  const tail = seen(behindTheTail, 'rear');
  assert.equal(tail.length, 2, 'a tail halo each side');
  for (const h of tail) near(h.f, 1, 1e-9, 'dead behind, the tail halos are whole');
  const beside = seen([-12, 2, length], 'rear'); // 12 m out to the -x side, level with the tail: the near side's tail lamp faces it, the far side's faces away
  for (const h of beside) near(h.f, h.side < 0 ? 1 : 0, 1e-9, `beside the tail (side ${h.side}): the near lamp whole, the far one none`);
  // and the Class 180, seen from the same halo-close eye, loses nothing
  const class180 = buildTrain('gc180x5'), l2 = new TrainLampLights();
  withNight(1, () => l2.update([{ group: class180 }]));
  const s2 = haloShader(l2), ps2 = haloPlacements([{ group: class180 }]);
  ps2.forEach((p, i) => { if (p.end !== 'front') return; l2.halo.getMatrixAt(i, instance); near(facingOf(s2, instance, new THREE.Vector3(2.2, 1.9, -6)), 1, 1e-9, 'Class 180 from the halo-close eye: both whole'); });
  lights.dispose(); l2.dispose();
});
