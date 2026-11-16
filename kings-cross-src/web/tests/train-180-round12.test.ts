// York side readings and GC180-03/05 hardware. Synthetic specimens; no browser or live data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import { bodySpec, buildTrain, carSection, faceSetback } from '../src/train.ts';
import { ADELANTE_FACE } from '../src/train-face.ts';
import { GC_CAB_DOOR_FRONT, GC_ORANGE, curveY, sideColourAt, sideShapes, liveryFor } from '../src/train-livery.ts';
import { col } from '../src/train-geom.ts';
import { eggSection, halfAt, normalised, ringAt } from '../src/train-nose.ts';

const colourNear = (a: THREE.Color, b: THREE.Color): boolean => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) < 1e-5;

test('180 round 12: the sweep ends 2.6 m ahead of the leaf, with a 0.7 m top hold, a convex dive and a foot at the lower edge 1.75 m ahead', () => {
  const spec = bodySpec('adelante');
  const sweep = sideShapes('grandcentral', spec.nose.length)[0]!.pts;
  const top = sweep.slice(0, sweep.length / 2);
  const foot = sweep.slice(sweep.length / 2).reverse();
  const d = GC_CAB_DOOR_FRONT;
  const end = top[0]![0];
  assert.ok(Math.abs(d - end - 2.6) < 0.1, `orange ends ${d - end} m ahead of the door (York: 2.6 ±0.1)`);
  assert.ok(Math.abs(curveY(top, d - 0.7) - 1.67) < 0.005, 'top still level 0.7 m ahead');
  assert.ok(curveY(top, d - 0.9) < 1.665, 'top has started falling by 0.9 m');
  const sec = carSection(spec), norm = normalised(sec), egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  // The texture starts at section point 1, above the ring's underside. Measure where the visible paint is clipped, not an invisible knot below it.
  const lower = (ahead: number): number => halfAt(sec, norm, egg, ringAt(spec.nose, d - ahead - faceSetback('adelante')))[1]![1];
  let meet = 0;
  for (let a = .55; a < 2.6; a += .001) if (curveY(foot, d - a) <= lower(a)) { meet = a; break; }
  assert.ok(Math.abs(meet - 1.75) < .1, `visible foot reaches the textured lower edge ${meet.toFixed(3)} m ahead (York 1.75 ±0.1)`);
  assert.ok(curveY(top, end) > lower(2.6) + .04, 'orange endpoint remains visible above the unchanged lower flank');
  const drops = [0.7, 1.2, 1.7, 2.2].map(a => curveY(top, d - a) - curveY(top, d - a - 0.25));
  assert.ok(drops.every((v, i) => i === 0 || v > drops[i - 1]!), `dive steepens: ${drops.join(', ')}`);
  for (const ahead of [2.72, 2.9, 3.1, 3.4]) for (const y of [0.7, 0.85, 1, 1.3]) {
    assert.notEqual(sideColourAt(liveryFor('gc180x5'), spec.nose.length, d - ahead, y), GC_ORANGE, `${ahead} m ahead, ${y} m up: black lower nose`);
  }
});

test('180 round 12: door edge shadow is exposed to the 3 m and whole-side cameras on both sides of every leaf', () => {
  const spec = bodySpec('adelante');
  const layout = trainLayout('gc180x5');
  const group = buildTrain('gc180x5');
  group.updateMatrixWorld(true);
  const want = col(spec.doorRecess!.seamColour);
  // York's visible edge shadow is about 4 px at 133 px/m. The depth is still ASSUMED.
  // At whole-side scale, a 30 mm shadow covers ~0.35 px, surviving as an antialiased dark line.
  // Frozen V05 uses 84% of the width, rounds side clearance up to a millimetre, then adds the body half-width.
  const sideDistance = Math.ceil(layout.length / (2 * Math.tan(25 * Math.PI / 360) * 1.6 * .84) * 1000) / 1000;
  const distance = spec.half + sideDistance;
  const wholePxPerM = 1000 / (2 * sideDistance * Math.tan(25 * Math.PI / 360));
  for (const car of layout.cars) {
    const doors = spec.plan(car, false).doors;
    const meshes: THREE.Mesh[] = [];
    group.getObjectByName(`car-${car.index}`)!.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh); });
    for (const s of doors) for (const side of [-1, 1]) for (const edge of [-1, 1]) {
      const z = car.cab === 'rear' ? car.end - s : car.start + s;
      const target = new THREE.Vector3(side * (spec.half - 0.002 - spec.doorRecess!.depth - 0.004), 1.52, z + edge * (spec.doorWidth / 2 + 0.02));
      for (const from of [new THREE.Vector3(side * (spec.half + 3), 1.85, z), new THREE.Vector3(side * distance, 1.9, layout.length / 2)]) {
        const ray = new THREE.Raycaster(from, target.clone().sub(from).normalize());
        const hit = ray.intersectObjects(meshes, false)[0];
        assert.ok(hit?.face, `car ${car.index}: exposed edge shadow`);
        const colour = (hit.object as THREE.Mesh).geometry.getAttribute('color');
        assert.ok(colour, `car ${car.index}: shadow is geometry, not the shell texture`);
        const got = new THREE.Color().fromBufferAttribute(colour, hit.face.a);
        assert.ok(colourNear(got, want), `car ${car.index}, side ${side}, edge ${edge}, distance ${from.x}: seam first, not frame/skin/leaf`);
      }
    }
  }
  const seam = spec.doorRecess!;
  const width = 'sideSeam' in seam ? seam.sideSeam as number : seam.seam;
  assert.ok(width * wholePxPerM >= 0.3, `edge shadow covers ${(width * wholePxPerM).toFixed(2)} px at whole-side distance`);
});

test('180 round 12: a non-emissive circular headlamp surround remains outside each lens at both cab ends', () => {
  const rim = ADELANTE_FACE.shapes.find(s => s.name === 'headlight-rim');
  const lens = ADELANTE_FACE.shapes.find(s => s.name === 'headlight')!;
  assert.ok(rim && rim.colour !== undefined, 'a separate pale headlamp surround, as visible in GC180-03/05');
  assert.equal(rim.mirror, true);
  assert.equal(rim.lens, undefined, 'the surround never lights');
  assert.ok(rim.lift > 0.0045 && rim.lift < lens.lift, 'pod, then surround, then lens');
  const centre = new THREE.Vector2(0.85, 1.46);
  const radius = (pts: readonly (readonly [number, number])[]): number[] => pts.map(p => new THREE.Vector2(...p).distanceTo(centre));
  assert.ok(radius(rim.outline).every(r => r > 0.112 && r < 0.125), 'a narrow rim round the existing 0.1 m lens; size ASSUMED');
  const group = buildTrain('gc180x5');
  const want = col(rim.colour);
  for (const index of [0, 4]) {
    const mesh = group.getObjectByName(`car-${index}`)!.getObjectByName('body-detail') as THREE.Mesh;
    const p = mesh.geometry.getAttribute('position'), c = mesh.geometry.getAttribute('color'), glow = mesh.geometry.getAttribute('aGlow');
    for (const side of [-1, 1]) {
      let n = 0;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - side * centre.x) < 0.13 && Math.abs(p.getY(i) - centre.y) < 0.13 && colourNear(new THREE.Color().fromBufferAttribute(c, i), want)) {
        n++;
        assert.equal(glow.getX(i), 0, 'rim is not a luminous slab');
      }
      assert.ok(n >= 24, `cab ${index}, side ${side}: surround built`);
    }
  }
});
