// The Azuma's front, as the round-4 score faulted it and round 5 redrew it: the windscreen has to read above the beak from the 3 m front camera of the evidence
// pack (V02), and the red cheek's back edge has to be the livery's curve, not the loft's rings. Pure geometry: no WebGL and no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { bodySpec, buildTrain } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { LNER_RED, liveryFor, sideColourAt } from '../src/train-livery.ts';

type Pose = { id: string; suffix: string; status: string; eye: [number, number, number]; target: [number, number, number]; fov: number };
/** The capture tool's own planner is the source of the camera: the test reads V02 from it and does not copy the numbers (the tools are plain .mjs, so they are loaded by URL). */
const tool = async <T>(name: string): Promise<T> => (await import(new URL(`../../tools/${name}`, import.meta.url).href)) as T;
const framing = await tool<{ CATALOGUE: { viewport: { width: number; height: number } }; planCatalogueViews: (formation: unknown) => Pose[] }>('train-framing.mjs');
const capture = await tool<{ describeFormation: (kind: string) => unknown }>('train-capture.mjs');
const AT300: TrainKind[] = ['lner5', 'lner9', 'hull5', 'lumo5'];

/**
 * How many pixels of the 1600 x 1000 frame the windscreen fills, seen from V02's eye at the front (or the rear) of the train. The windscreen is the cab glass within 1.15 m of the
 * centre line (the cab side windows are out by the wall). Each of its triangles counts if a ray from the eye to its centroid meets nothing nearer than 2 cm in front of it, at the
 * area it covers on the screen: its area, times how squarely it faces the eye (a pane seen edge-on covers nothing), over the square of its distance, times the focal length in pixels squared.
 */
function windscreenPixels(kind: TrainKind, rear: boolean): number {
  const suffix = rear ? 'rear-3m' : 'front-3m';
  const pose = framing.planCatalogueViews(capture.describeFormation(kind)).find((v) => v.suffix === suffix);
  assert.ok(pose && pose.status === 'OK', `${kind} has a ${suffix} view`);
  const { width, height } = framing.CATALOGUE.viewport;
  assert.ok(width === 1600 && height === 1000, `the frame is ${width} x ${height}`);
  const focal = height / 2 / Math.tan((pose.fov * Math.PI) / 360);
  const eye = new THREE.Vector3(...pose.eye);
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  const car = g.getObjectByName(`car-${rear ? trainLayout(kind).cars.length - 1 : 0}`) as THREE.Object3D;
  // everything that stands between the eye and the glass is on the nose: the shell, the vertex-coloured detail, the glass itself and the decals
  const blockers: THREE.Mesh[] = [];
  for (const name of ['body-shell', 'body-detail', 'cab-glass', 'livery-decals']) {
    const m = car.getObjectByName(name) as THREE.Mesh | undefined;
    if (!m) continue;
    m.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    blockers.push(m);
  }
  const glass = car.getObjectByName('cab-glass') as THREE.Mesh;
  const pos = glass.geometry.getAttribute('position');
  const world = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(glass.matrixWorld);
  const ray = new THREE.Raycaster();
  let pixels = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const a = world(i);
    const b = world(i + 1);
    const c = world(i + 2);
    if (![a, b, c].every((v) => Math.abs(v.x) < 1.15)) continue;
    const centre = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const toward = new THREE.Vector3().subVectors(centre, eye);
    const distance = toward.length();
    ray.set(eye, toward.normalize());
    const first = ray.intersectObjects(blockers, false)[0];
    if (!first || first.distance < distance - 0.02) continue;
    const tri = new THREE.Triangle(a, b, c);
    const normal = new THREE.Vector3();
    tri.getNormal(normal);
    pixels += (tri.getArea() * Math.abs(normal.dot(ray.ray.direction)) * focal * focal) / (distance * distance);
  }
  return pixels;
}

test('the Azuma\'s windscreen reads clearly above the beak from the 3 m camera at either end: 26,000 pixels of the 1600 x 1000 frame or more, on the LNER, Hull Trains and Lumo cabs', () => {
  // The round-4 score: "the beak hides almost all of the windscreen, which is a thin strip at the top; in hull-802-doncaster-2024 the large screen sits clearly above the dark beak".
  // The round-4 nose showed about 21,000 pixels of glass from V02's eye (a screen 1.3 m to 3.0 m back, on a beak that crested at 2.0 m); the round-5 nose, with the glass's foot where the
  // beak's yellow ends (0.95 m back, 2.3 m up), about 28,700. The floor is between them, so a nose that goes back toward the old beak fails. ASSUMED: the glass's size is read off a photograph.
  for (const kind of ['lner5', 'hull5', 'lumo5'] as TrainKind[]) {
    const front = windscreenPixels(kind, false);
    const rear = windscreenPixels(kind, true);
    assert.ok(front >= 26_000, `${kind}: ${Math.round(front)} pixels of windscreen from the 3 m front camera`);
    assert.ok(rear >= 26_000, `${kind}: ${Math.round(rear)} pixels of windscreen from the 3 m rear camera`);
    // the rear cab is the front's mirror: the two cameras see the same glass
    assert.ok(Math.abs(front - rear) <= 0.02 * front, `${kind}: ${Math.round(front)} pixels at the front, ${Math.round(rear)} at the rear`);
  }
});

test('the LNER nose: no roof-white loft triangle comes down into the red cheek, so the cheek\'s back edge is the livery\'s curve and not the loft\'s steps', () => {
  // The round-4 score: "white spikes" along the Azuma's red cheek. The nose's loft is textured from its column 1 to column 7 (the side), and above that it is vertex-coloured (the roof's
  // white); on the AT300 the textured columns run up to column 9 (`front.shellTop`) so the livery paints the shoulder, and the roof's white begins above the cheek's top. Without that, each
  // ring's column 7 steps in and out across the cheek's edge and the white shows in wedges down to 1.39 m.
  const noseLength = bodySpec('at300').nose.length;
  const livery = liveryFor('lner5');
  // the cheek's top: the highest red on the texture 0.3 m behind the tip
  let cheekTop = 0;
  for (let y = 0.5; y <= 2.0; y += 0.01) if (sideColourAt(livery, noseLength, 0.3, y) === LNER_RED) cheekTop = y;
  assert.ok(Math.abs(cheekTop - 1.5) < 0.02, `the cheek's top is ${cheekTop.toFixed(2)} m up`);
  const want = col(livery.roof);
  for (const kind of AT300) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    const detail = (g.getObjectByName('car-0') as THREE.Object3D).getObjectByName('body-detail') as THREE.Mesh;
    const colour = detail.geometry.getAttribute('color');
    const pos = detail.geometry.getAttribute('position');
    const roof = (i: number): boolean => Math.abs(colour.getX(i) - want.r) < 1e-5 && Math.abs(colour.getY(i) - want.g) < 1e-5 && Math.abs(colour.getZ(i) - want.b) < 1e-5;
    let lowest = Infinity;
    let seen = 0;
    for (let i = 0; i < pos.count; i++) {
      if (!roof(i)) continue;
      // the flank: off the centre line, from the tip back to the cheek's back edge (0.92 m)
      if (Math.abs(pos.getX(i)) <= 0.3 || pos.getZ(i) >= 0.92) continue;
      seen++;
      lowest = Math.min(lowest, pos.getY(i));
    }
    if (kind === 'lner5' || kind === 'lner9') assert.ok(seen > 0, `${kind}: the roof white is on the nose (the test would be empty)`);
    assert.ok(lowest >= cheekTop, `${kind}: roof-white loft triangle down to ${lowest.toFixed(3)} m on the flank, into the cheek (to ${cheekTop.toFixed(2)} m)`);
  }
});
