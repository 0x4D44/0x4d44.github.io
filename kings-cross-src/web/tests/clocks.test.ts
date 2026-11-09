// web/src/clocks.ts: the station clocks' hands, turned to the scene clock in UK local time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { balmoralTime, createClocks, handAngles, handGeometry, handMatrix, HANDS } from '../src/clocks.ts';
import type { ClockDial } from '../src/clocks.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { buildTower } from '../src/shed.ts';
import { buildWaverleyFrontage } from '../src/waverley-frontage.ts';

const TAU = Math.PI * 2;
const deg = (r: number): number => (r * 360) / TAU;
const close = (a: number, b: number, eps: number, what: string): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const at = (iso: string): number => Date.parse(iso);

test('hand angles: UK local time, BST and GMT, the 12-hour wrap and the quarter hours', () => {
  // GMT in winter: 10:10 UTC is 10:10 in London
  let a = handAngles(at('2026-01-15T10:10:00Z'));
  close(deg(a.minute), 60, 1e-9, 'GMT 10:10 minute');
  close(deg(a.hour), 305, 1e-9, 'GMT 10:10 hour (10 h + 1/6)');
  // BST in summer: 09:10 UTC is 10:10 in London
  a = handAngles(at('2026-07-15T09:10:00Z'));
  close(deg(a.minute), 60, 1e-9, 'BST 10:10 minute');
  close(deg(a.hour), 305, 1e-9, 'BST 10:10 hour');
  // the change itself: 2026-03-29 01:00 UTC the clocks go to 02:00 BST, 2026-10-25 01:00 UTC back to 01:00 GMT
  close(deg(handAngles(at('2026-03-29T00:59:00Z')).hour), 30 * (59 / 60) + 0, 1e-9, 'just before spring forward: 00:59 GMT');
  close(deg(handAngles(at('2026-03-29T01:00:00Z')).hour), 60, 1e-9, 'spring forward: 02:00 BST');
  close(deg(handAngles(at('2026-10-25T00:30:00Z')).hour), 45, 1e-9, 'before fall back: 01:30 BST');
  close(deg(handAngles(at('2026-10-25T01:30:00Z')).hour), 45, 1e-9, 'after fall back: 01:30 GMT again');
  // the 12-hour wrap: 15:45 reads as a quarter to four, midnight and noon both point to 12
  a = handAngles(at('2026-01-15T15:45:00Z'));
  close(deg(a.hour), 3.75 * 30, 1e-9, '15:45 hour');
  close(deg(a.minute), 270, 1e-9, ':45 minute');
  close(handAngles(at('2026-01-15T00:00:00Z')).hour, 0, 1e-12, 'midnight hour');
  close(handAngles(at('2026-01-15T12:00:00Z')).hour, 0, 1e-12, 'noon hour');
  close(deg(handAngles(at('2026-01-15T23:59:59.999Z')).hour), 360, 1e-4, 'just before midnight');
  assert.ok(handAngles(at('2026-01-15T23:59:59.999Z')).hour < TAU, 'stays in [0, 2pi)');
  close(deg(handAngles(at('2026-01-15T08:15:00Z')).minute), 90, 1e-9, ':15 minute');
  close(deg(handAngles(at('2026-01-15T08:30:00Z')).minute), 180, 1e-9, ':30 minute');
  close(deg(handAngles(at('2026-01-15T08:30:00Z')).hour), 255, 1e-9, '08:30 hour, half way to nine');
  // the minute hand sweeps: 30 s past is half a minute on
  close(deg(handAngles(at('2026-01-15T08:15:30Z')).minute), 93, 1e-9, ':15:30 minute');
});

test('the Balmoral runs three minutes fast, except on Hogmanay (and all of 2020\'s)', () => {
  const t = at('2026-06-01T12:00:00Z');
  assert.equal(balmoralTime(t), t + 180_000);
  const hogmanay = at('2026-12-31T18:00:00Z');
  assert.equal(balmoralTime(hogmanay), hogmanay);
  const y2020 = at('2020-12-31T18:00:00Z');
  assert.equal(balmoralTime(y2020), y2020 + 180_000);
});

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const ground = { heightAt: (x: number, z: number): number => 8 + x * 0.002 + z * 0.003, rangeUnder: () => ({ min: 8, max: 8, mean: 8 }) };

/** Each building's dials, with the object carrying them and the meshes the dials are drawn on. */
function buildings(): { name: string; root: THREE.Object3D; count: number; dialMeshes: THREE.Mesh[] }[] {
  const tower = buildTower(0);
  tower.rotation.y = 0.4; // a turned parent, as the shed's is
  tower.position.set(30, 0, -12);
  const kx = new THREE.Group().add(tower);
  const london = new THREE.Scene();
  const landmarks = addLandmarks(london, data);
  const waverley = buildWaverleyFrontage(ground);
  const meshesOf = (root: THREE.Object3D, keep: (m: THREE.Mesh) => boolean): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh && keep(o as THREE.Mesh)) out.push(o as THREE.Mesh); });
    return out;
  };
  return [
    { name: "King's Cross tower", root: kx, count: 4, dialMeshes: meshesOf(kx, (m) => m.geometry instanceof THREE.CircleGeometry) },
    { name: 'Midland Grand clock tower', root: london, count: 4, dialMeshes: meshesOf(landmarks.group, (m) => m.name === 'landmarks-clock') },
    { name: 'Balmoral', root: waverley.group, count: 4, dialMeshes: meshesOf(waverley.group, (m) => m.name === 'waverley-balmoral-clock-dials') },
  ];
}

const dialsIn = (root: THREE.Object3D): { dial: ClockDial; world: THREE.Matrix4 }[] => {
  const out: { dial: ClockDial; world: THREE.Matrix4 }[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { for (const dial of (o.userData.clockDials as ClockDial[] | undefined) ?? []) out.push({ dial, world: o.matrixWorld.clone() }); });
  return out;
};

test('every drawn dial declares itself: its centre on the dial, facing out, up the right way', () => {
  for (const b of buildings()) {
    assert.ok(b.dialMeshes.length > 0, `${b.name}: dial meshes found`);
    const dials = dialsIn(b.root);
    assert.equal(dials.length, b.count, `${b.name}: one declared dial per drawn face`);
    for (const { dial, world } of dials) {
      const c = new THREE.Vector3(...dial.centre).applyMatrix4(world);
      const n = new THREE.Vector3(...dial.normal).transformDirection(world);
      close(n.length(), 1, 1e-9, `${b.name}: unit normal`);
      close(new THREE.Vector3(...dial.up).dot(new THREE.Vector3(...dial.normal)), 0, 1e-9, `${b.name}: up lies in the face`);
      // from 1 m out in front, looking back along the normal, the first thing hit is the dial, 1 m away, from its front
      const ray = new THREE.Raycaster(c.clone().addScaledVector(n, 1), n.clone().negate(), 0, 3);
      const hits = ray.intersectObjects(b.dialMeshes, false);
      assert.ok(hits.length > 0, `${b.name}: a dial at ${c.toArray().map((v) => v.toFixed(2))}`);
      close((hits[0] as THREE.Intersection).distance, 1, 0.02, `${b.name}: the dial's plane`);
    }
  }
});

test('the hands stand on each dial at its centre and normal, just proud of it and inside it', () => {
  const geo = handGeometry();
  geo.computeBoundingBox();
  const box = geo.boundingBox as THREE.Box3;
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  for (const b of buildings()) {
    const scene = new THREE.Scene().add(b.root);
    const clocks = createClocks();
    clocks.frame(scene, at('2026-01-15T10:10:00Z'));
    const hands = clocks.hands(scene);
    assert.ok(hands, `${b.name}: a hands mesh`);
    const dials = dialsIn(scene);
    assert.equal(hands.count, 2 * dials.length, `${b.name}: two hands a dial`);
    const m = new THREE.Matrix4();
    dials.forEach(({ dial, world }, i) => {
      const c = new THREE.Vector3(...dial.centre).applyMatrix4(world);
      const n = new THREE.Vector3(...dial.normal).transformDirection(world);
      for (const k of [0, 1]) {
        hands.getMatrixAt(2 * i + k, m);
        m.premultiply(hands.matrixWorld);
        let pivotSeen = false;
        for (const p of corners) {
          const w = p.clone().applyMatrix4(m).sub(c);
          const out = w.dot(n);
          assert.ok(out > 0.01 && out < 0.2, `${b.name} hand ${k}: ${out.toFixed(3)} m off the face`);
          const inPlane = w.clone().addScaledVector(n, -out).length();
          assert.ok(inPlane < dial.radius, `${b.name} hand ${k}: ${inPlane.toFixed(2)} m from the centre, dial ${dial.radius}`);
          if (inPlane < 0.2 * dial.radius) pivotSeen = true;
        }
        assert.ok(pivotSeen, `${b.name} hand ${k}: pivots at the centre`);
        // the hand's axis (the instance's y) runs through the centre: its foot is the tail behind the centre
        const foot = new THREE.Vector3(0, 0, 0).applyMatrix4(m), tip = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
        const axis = tip.clone().sub(foot);
        const toCentre = c.clone().sub(foot);
        close(axis.clone().normalize().cross(toCentre).dot(n), 0, 1e-4, `${b.name} hand ${k}: through the centre`);
        close(axis.dot(n), 0, 1e-4, `${b.name} hand ${k}: flat to the face`);
      }
    });
    clocks.dispose();
  }
});

test('the hands point where the time says, as a viewer in front sees it', () => {
  const dial: ClockDial = { centre: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], radius: 2 };
  const tip = (a: number): THREE.Vector3 => new THREE.Vector3(0, 1, 0).applyMatrix4(handMatrix(dial, HANDS.minute, a));
  // a viewer at +z looking at the dial has +x on their right: three o'clock is +x, six -y, nine -x
  close(tip(0).y, HANDS.minute.length * 2, 1e-9, '12');
  close(tip(Math.PI / 2).x, HANDS.minute.length * 2, 1e-9, '3');
  close(tip(Math.PI).y, -HANDS.minute.length * 2, 1e-9, '6');
  close(tip((3 * Math.PI) / 2).x, -HANDS.minute.length * 2, 1e-9, '9');
});

test('the hands follow the scene clock they are given, not the wall clock', () => {
  const tower = buildTower(0);
  const scene = new THREE.Scene().add(tower);
  const clocks = createClocks();
  const realNow = Date.now;
  Date.now = () => at('2026-01-15T03:00:00Z'); // a wall clock at three: the hands must not show it
  try {
    const sceneMs = at('2026-07-15T14:45:00Z'); // 15:45 BST
    clocks.frame(scene, sceneMs);
    const hands = clocks.hands(scene) as THREE.InstancedMesh;
    const dial = (tower.userData.clockDials as ClockDial[])[0] as ClockDial;
    const m = new THREE.Matrix4();
    const angle = (k: number): number => {
      hands.getMatrixAt(k, m);
      const axis = new THREE.Vector3(0, 1, 0).applyMatrix4(m).sub(new THREE.Vector3(0, 0, 0).applyMatrix4(m));
      const n = new THREE.Vector3(...dial.normal), up = new THREE.Vector3(...dial.up), right = up.clone().cross(n);
      return (Math.atan2(axis.dot(right), axis.dot(up)) + TAU) % TAU;
    };
    close(deg(angle(0)), 3.75 * 30, 1e-6, 'hour at 15:45');
    close(deg(angle(1)), 270, 1e-6, 'minute at :45');
    clocks.frame(scene, at('2026-07-15T09:10:00Z')); // 10:10 BST
    close(deg(angle(0)), 305, 1e-6, 'hour at 10:10');
    close(deg(angle(1)), 60, 1e-6, 'minute at 10:10');
  } finally {
    Date.now = realNow;
    clocks.dispose();
  }
  // main.ts drives the clocks with its scene clock (live, replay or pinned), once a frame
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /clocks\.frame\(shown, sceneClock\(\)\)/);
  assert.equal(main.match(/clocks\.frame\(/g)?.length, 1);
});

test('all the hands of a scene are one draw call, and it is rebuilt only when dials come or go', () => {
  const scene = new THREE.Scene().add(buildTower(0));
  const clocks = createClocks();
  clocks.frame(scene, 0);
  const first = clocks.hands(scene);
  clocks.frame(scene, 1000);
  assert.equal(clocks.hands(scene), first, 'the same mesh frame to frame');
  assert.equal(scene.children.filter((o) => o.name === 'clock-hands').length, 1);
  const more = buildTower(20);
  scene.add(more);
  clocks.frame(scene, 2000);
  assert.equal(clocks.hands(scene)?.count, 16, 'a tower added: its dials join the one mesh');
  more.removeFromParent();
  clocks.frame(scene, 3000);
  assert.equal(clocks.hands(scene)?.count, 8, 'and leave it when it goes');
  assert.equal(scene.children.filter((o) => o.name === 'clock-hands').length, 1);
  clocks.dispose();
});
