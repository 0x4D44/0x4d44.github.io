import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLOCK_TOWER_HEIGHT } from '../../core/station.ts';
import { buildTower, TOWER_SIZE, TOWER_TOP } from '../src/shed.ts';

// Tower round 2 (rubric A4), the fresh scorer against R-kx-front-c: brick corner pilasters with the panel recessed between them, a low hipped
// dark cap whose edge stands past the corona, a soffit and frieze that are not near-black, and a compass cross under the vane's banner.
const tower = buildTower(0);
tower.position.set(0, 0, 0);
tower.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const m = tower.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(m, `${n} is built`); return m; };
const hit = (o: THREE.Vector3, d: THREE.Vector3, target: THREE.Object3D): THREE.Intersection | undefined => new THREE.Raycaster(o, d, 0, 60).intersectObject(target, false)[0];
const south = (x: number, y: number, target: THREE.Object3D): number | null => hit(new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1), target)?.point.z ?? null;
const shaftTop = CLOCK_TOWER_HEIGHT - 8.2, eavesY = CLOCK_TOWER_HEIGHT - 3.3;
/** each triangle of a mesh: its corners, the normal its winding gives and its three vertex normals */
const triangles = (m: THREE.Mesh): { p: THREE.Vector3[]; n: THREE.Vector3; vn: THREE.Vector3[] }[] => {
  const pos = m.geometry.getAttribute('position'), nor = m.geometry.getAttribute('normal'), idx = m.geometry.index;
  const out = [], count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const k = [0, 1, 2].map(j => (idx ? idx.getX(i + j) : i + j));
    const p = k.map(v => new THREE.Vector3().fromBufferAttribute(pos, v));
    const n = new THREE.Vector3().crossVectors(p[1]!.clone().sub(p[0]!), p[2]!.clone().sub(p[0]!)).normalize();
    out.push({ p, n, vn: k.map(v => new THREE.Vector3().fromBufferAttribute(nor, v)) });
  }
  return out;
};

test('the shaft\'s corners are pilasters in the panel\'s brick, about 0.13 of the shaft wide, the panel 0.15 m behind them (R-kx-front-c)', () => {
  const brick = named('tower-brick');
  for (const y of [8, 15, shaftTop - 1.5]) {
    const panel = south(0, y, brick);
    assert.ok(panel !== null && Math.abs(panel - TOWER_SIZE / 2) < 0.02, `the panel at ${y} m is the shaft's face`);
    let front = -Infinity, run = 0, x0 = Infinity, x1 = -Infinity;
    for (let x = -TOWER_SIZE; x <= TOWER_SIZE; x += 0.01) {
      const first = new THREE.Raycaster(new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1), 0, 60).intersectObject(tower, true)[0];
      if (!first) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      if ((first.object as THREE.Mesh).name !== 'tower-brick') continue; // the slits
      front = Math.max(front, first.point.z);
      if (x > 0 && first.point.z > panel! + 0.1) run += 0.01;
    }
    assert.ok(Math.abs(front - panel! - 0.15) < 0.02, `the pilasters stand ${(front - panel!).toFixed(2)} m proud of the panel at ${y} m, in brick`);
    const ratio = run / (x1 - x0);
    assert.ok(ratio >= 0.11 && ratio <= 0.15, `a pilaster ${ratio.toFixed(3)} of the shaft's ${(x1 - x0).toFixed(2)} m`);
  }
});

test('the cap is a low hipped dark metal roof, about 0.6 m high, its dark edge 0.2 m deep or more and standing past the corona', () => {
  const cap = named('tower-cap'), pos = cap.geometry.getAttribute('position'), v = new THREE.Vector3(), clockY = eavesY - 2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).y > clockY) pts.push(v.clone());
  const outer = Math.max(...pts.map(p => p.z)), rim = pts.filter(p => p.z > outer - 1e-6);
  const edgeTop = Math.max(...rim.map(p => p.y)), edgeFoot = Math.min(...rim.map(p => p.y)), apex = Math.max(...pts.map(p => p.y));
  assert.ok(edgeTop - edgeFoot >= 0.2, `the dark edge ${(edgeTop - edgeFoot).toFixed(2)} m deep`);
  assert.ok(apex - edgeTop >= 0.45 && apex - edgeTop <= 0.8, `the hip rises ${(apex - edgeTop).toFixed(2)} m`);
  let corona = -Infinity;
  for (let y = eavesY; y < edgeFoot; y += 0.02) corona = Math.max(corona, south(0.05, y, named('tower-stone')) ?? -Infinity);
  assert.ok(outer - corona >= 0.1, `the edge stands ${(outer - corona).toFixed(2)} m past the corona`);
});

// Round 2b (the round-2 score): round 2 turned the soffit's and the frieze's normals and the bracket gaps went black, by day and under the night wash.
// This replaces round 2's turned-normal test: what a viewer south of the tower meets through each gap between the brackets is an outward stone face,
// and the night wash (shed.ts frontWash, the tower's branch, modelled here) reaches it as it reaches the brackets' own faces.
const wash = (p: THREE.Vector3, n: THREE.Vector3): number => {
  const y = Math.max(p.y, 0), faceU = Math.abs(p.x) * Math.abs(n.z) + Math.abs(p.z) * Math.abs(n.x);
  const rail = Math.exp(-((Math.abs(faceU - 2.6) / (0.61 + 0.078 * y)) ** 2)), shaft = (0.045 + 0.76 * rail) * Math.exp(-y / 8.5);
  const stage = Math.exp(-((Math.abs(y - (CLOCK_TOWER_HEIGHT - 5.8)) / 1.95) ** 2)), stageEdge = 0.62 + 0.38 * Math.min(1, Math.max(0, (faceU - 0.8) / 1.5));
  const eaves = Math.exp(-((Math.abs(y - (CLOCK_TOWER_HEIGHT - 3.0)) / 0.65) ** 2));
  return (shaft + 0.33 * stage * stageEdge + 0.36 * eaves) * (1 - Math.max(n.y, 0));
};
test('through every gap between the brackets a viewer meets an outward stone face the night wash lights, no sky; the frieze under them faces straight out', () => {
  // re-pinned 2026-11-25 (tower round 3: eight modillions to a face, not seven): the gaps are read from TOWER_TOP.perFace, not counted as six
  const cw = TOWER_SIZE - 1.8, by = eavesY + 0.3, top = by + 0.8, pitch = (cw - 0.5) / (TOWER_TOP.perFace - 1);
  const vertexNormal = (h: THREE.Intersection): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute((h.object as THREE.Mesh).geometry.getAttribute('normal'), h.face!.a);
  let gaps = 0;
  for (let k = 0; k < TOWER_TOP.perFace - 1; k++) {
    const u = -cw / 2 + 0.25 + pitch * (k + 0.5);
    for (let y = by + 0.05; y < top - 0.02; y += 0.1) for (const rise of [0, 0.25, 0.5]) {
      const dir = new THREE.Vector3(0, rise, -1).normalize(), o = new THREE.Vector3(u, y, cw / 2 + 0.3).addScaledVector(dir, -30);
      const h = new THREE.Raycaster(o, dir, 0, 60).intersectObject(tower, true)[0];
      assert.ok(h, `sky through the gap at u ${u.toFixed(2)}, ${(y - by).toFixed(2)} m up, looking up ${rise}`);
      const n = vertexNormal(h);
      assert.ok((h.object as THREE.Mesh).name === 'tower-stone' && n.dot(dir) < -0.2, `the gap shows ${(h.object as THREE.Mesh).name}, a face turned ${n.toArray().map(q => q.toFixed(2))}`);
      // against a bracket's front face at the same point (a soffit's faceU is 0 in the shader, so it misses the corner rail: 0.75, not 1)
      const bracketFace = wash(h.point, new THREE.Vector3(0, 0, 1));
      assert.ok(wash(h.point, n) >= 0.75 * bracketFace, `the night wash in the gap ${wash(h.point, n).toFixed(3)} against a bracket face's ${bracketFace.toFixed(3)}`);
      gaps++;
    }
  }
  assert.ok(gaps >= 100, `${gaps} rays through the gaps`);
  for (const x of [-1.5, 0, 1.5]) {
    const h = new THREE.Raycaster(new THREE.Vector3(x, eavesY + 0.15, 30), new THREE.Vector3(0, 0, -1), 0, 60).intersectObject(tower, true)[0];
    assert.ok(h && (h.object as THREE.Mesh).name === 'tower-stone', 'the frieze under the brackets is stone');
    const n = vertexNormal(h);
    assert.ok(n.z > 0.99, `and faces straight out, the wash's whole share (normal ${n.toArray().map(q => q.toFixed(2))})`);
  }
});

test('the vane carries a compass cross well under its banner, arms about 0.9 m each way, a letter over each arm\'s end, clear of the cap', () => {
  const vane = named('tower-vane'), cap = named('tower-cap');
  const ys: number[] = [];
  for (let y = CLOCK_TOWER_HEIGHT - 2; y < CLOCK_TOWER_HEIGHT; y += 0.01) if (south(0.6, y, vane) !== null) ys.push(y);
  const foot = Math.min(...ys), arms = ys.filter(y => y < foot + 0.1), arm = (foot + Math.max(...arms)) / 2, banner = Math.min(...ys.filter(y => y > foot + 0.1));
  assert.ok(banner - arm >= 0.35, `the cross ${(banner - arm).toFixed(2)} m under the banner's foot`);
  for (const [o, d] of [[[30, arm, 0], [-1, 0, 0]], [[-30, arm, 0], [1, 0, 0]], [[0, arm, 30], [0, 0, -1]], [[0, arm, -30], [0, 0, 1]]] as const) {
    const h = hit(new THREE.Vector3(...o), new THREE.Vector3(...d), vane);
    assert.ok(h && Math.hypot(h.point.x, h.point.z) >= 0.85 && Math.hypot(h.point.x, h.point.z) <= 1.1, `an arm reaches ${h ? Math.hypot(h.point.x, h.point.z).toFixed(2) : 'nothing'} m`);
  }
  const letterY = arm + 0.18;
  for (const [o, d, name] of [[[0.77, letterY, 30], [0, 0, -1], 'E'], [[-0.77, letterY, 30], [0, 0, -1], 'W'], [[30, letterY, -0.77], [-1, 0, 0], 'N'], [[30, letterY, 0.77], [-1, 0, 0], 'S']] as const) {
    // a 9 x 9 grid of rays through the letter's 0.24 m square: a letter's bars, not a stray end
    let on = 0;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const a = (i * 0.12) / 4, o2 = d[0] === 0 ? [o[0] + a, o[1] + (j * 0.12) / 4, o[2]] : [o[0], o[1] + (j * 0.12) / 4, o[2] + a];
      if (hit(new THREE.Vector3(...o2), new THREE.Vector3(...d), vane)) on++;
    }
    assert.ok(on >= 8, `the ${name} letter: ${on} of 81 rays meet it`);
  }
  for (const [x, z] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
    const roof = hit(new THREE.Vector3(x, CLOCK_TOWER_HEIGHT + 5, z), new THREE.Vector3(0, -1, 0), cap);
    assert.ok(roof && roof.point.y < arm - 0.1, `the cap ${roof ? (arm - roof.point.y).toFixed(2) : '?'} m under an arm's end`);
  }
});
