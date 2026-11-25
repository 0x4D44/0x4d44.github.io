import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLOCK_TOWER_HEIGHT } from '../../core/station.ts';
import { buildingNightMaterialsOf } from '../src/materials.ts';
import { buildTower, TOWER_SIZE, TOWER_TOP } from '../src/shed.ts';
import { Glsl } from './glsl.ts';

// Tower round 3 (rubric A4), two scorers against R-kx-front-c: eight stepped pale modillions to a face with shadowed gaps, a moulded cyma
// under a thin lead edge with a gutter lip, a slim gilded vane on a spike, and a night wash graded so the gaps sit darker than the faces.
const tower = buildTower(0);
tower.position.set(0, 0, 0);
tower.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const m = tower.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(m, `${n} is built`); return m; };
const first = (o: number[], d: number[], target: THREE.Object3D = tower): THREE.Intersection | undefined =>
  new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, 80).intersectObject(target, true)[0];
const cw = TOWER_SIZE - 2 * TOWER_TOP.setback, stage = cw / 2, eavesY = CLOCK_TOWER_HEIGHT - 3.3, by = eavesY + TOWER_TOP.frieze, cy = by + TOWER_TOP.bracket.height;
const luma = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

test('eight separate stepped modillions to a face, two steps each about 0.35 m deep, shadowed gaps to the frieze between them, in a pale cream', () => {
  const stone = named('tower-stone');
  const ahead = (x: number, y: number): number => first([x, y, 30], [0, 0, -1], stone)?.point.z ?? -Infinity;
  for (const y of [by + 0.15, by + 0.42, by + 0.68]) {
    let runs = 0, prev = false;
    for (let x = -stage; x <= stage; x += 0.01) { const on = ahead(x, y) > stage + 0.3; if (on && !prev) runs++; prev = on; }
    assert.equal(runs, 8, `${runs} modillions across the south face ${(y - by).toFixed(2)} m up the row`);
  }
  const u = -cw / 2 + 0.25, pitch = (cw - 0.5) / 7;
  const fronts = [...new Set(Array.from({ length: 16 }, (_, i) => by + 0.025 + i * 0.05).map(y => Math.round((ahead(u, y) - stage) * 100) / 100))].sort((a, b) => a - b);
  assert.ok(fronts.length === 2, `two steps: ${fronts.join(', ')} m out`);
  const steps = [fronts[0]! - 0.1, fronts[1]! - fronts[0]!];
  assert.ok(steps.every(s => s >= 0.28 && s <= 0.42), `each step ${steps.map(s => s.toFixed(2)).join(', ')} m deep`);
  for (const y of [by + 0.15, by + 0.42, by + 0.68]) {
    const gap = ahead(u + pitch / 2, y) - stage;
    assert.ok(Math.abs(gap - 0.1) < 0.02, `the gap ${(y - by).toFixed(2)} m up is the frieze behind, ${gap.toFixed(2)} m out`);
  }
  // pale cream: the cornice's vertex colour well over the shaft's stone (white), warm
  const h = first([u, by + 0.15, 30], [0, 0, -1], stone)!, col = stone.geometry.getAttribute('color');
  assert.ok(col, 'the tower stone carries vertex colour');
  const c = [col.getX(h.face!.a), col.getY(h.face!.a), col.getZ(h.face!.a)];
  const shaft = first([1.0, CLOCK_TOWER_HEIGHT - 8.2 - 0.5, 30], [0, 0, -1], stone)!, s0 = [col.getX(shaft.face!.a), col.getY(shaft.face!.a), col.getZ(shaft.face!.a)];
  assert.ok(luma(c) >= 1.4 * luma(s0) && c[0]! > c[2]! * 1.1, `a modillion's colour ${c.map(v => v.toFixed(2))} against the shaft's ${s0.map(v => v.toFixed(2))}`);
  assert.ok((stone.material as THREE.MeshLambertMaterial).vertexColors && (buildingNightMaterialsOf(stone)!.night as THREE.MeshLambertMaterial).vertexColors, 'by day and at night');
});

test('a moulded cyma over the corona under a thin lead edge, a gutter lip standing up at its outer edge, the hip still shallow', () => {
  const stone = named('tower-stone'), cap = named('tower-cap');
  const capBase = cy + TOWER_TOP.corona;
  const corona = first([0.05, cy + TOWER_TOP.corona / 2, 30], [0, 0, -1], stone)!.point.z;
  const cyma = first([0.05, capBase + 0.05, 30], [0, 0, -1], stone);
  assert.ok(cyma && cyma.point.z > corona + 0.03, `a cyma over the corona, ${cyma ? (cyma.point.z - corona).toFixed(2) : '-'} m past its face`);
  const pos = cap.geometry.getAttribute('position'), v = new THREE.Vector3(), pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).y > cy) pts.push(v.clone());
  const outer = Math.max(...pts.map(p => p.z)), rim = pts.filter(p => p.z > outer - 1e-6);
  const leadFoot = Math.min(...rim.map(p => p.y)), lipTop = Math.max(...rim.map(p => p.y)), apex = Math.max(...pts.map(p => p.y));
  const hipFoot = capBase + TOWER_TOP.edge;
  assert.ok(leadFoot >= capBase + 0.05 && hipFoot - leadFoot <= 0.2, `a thin lead edge, ${(hipFoot - leadFoot).toFixed(2)} m, over the cyma`);
  assert.ok(lipTop - hipFoot >= 0.04, `its gutter lip stands ${(lipTop - hipFoot).toFixed(2)} m over the roof's foot`);
  const lip = first([0, hipFoot + 0.03, 30], [0, 0, -1], cap), behind = first([0, CLOCK_TOWER_HEIGHT + 5, outer - 0.15], [0, -1, 0], cap);
  assert.ok(lip && lip.point.z > outer - 0.01 && behind && behind.point.y < hipFoot + 0.035, `a lip, not a solid band: the roof ${behind ? (behind.point.y - hipFoot).toFixed(3) : '-'} m over its foot just behind it`);
  assert.ok(apex - hipFoot <= 0.8, `the hip still shallow, ${(apex - hipFoot).toFixed(2)} m`);
});

test('the vane is a slim gilded arrow and banner through the mast, which ends in a spike at the published height', () => {
  const vane = named('tower-vane'), pos = vane.geometry.getAttribute('position'), v = new THREE.Vector3();
  let top = -Infinity, near = 0;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); top = Math.max(top, v.y); if (v.y > CLOCK_TOWER_HEIGHT - 0.05) near = Math.max(near, Math.abs(v.x), Math.abs(v.z)); }
  assert.ok(Math.abs(top - CLOCK_TOWER_HEIGHT) < 1e-4 && near < 0.015, `a spike: ${near.toFixed(3)} m wide within 5 cm of its point`);
  assert.ok(first([0, CLOCK_TOWER_HEIGHT - 0.08, 30], [0, 0, -1], vane) && !first([0.03, CLOCK_TOWER_HEIGHT - 0.08, 30], [0, 0, -1], vane), 'the spike is there, and narrow');
  const ys: number[] = [];
  for (let y = CLOCK_TOWER_HEIGHT - 0.9; y < CLOCK_TOWER_HEIGHT; y += 0.01) if (first([0.6, y, 30], [0, 0, -1], vane)) ys.push(y);
  const tall = Math.max(...ys) - Math.min(...ys);
  assert.ok(ys.length > 0 && tall <= 0.3, `a slim banner, ${tall.toFixed(2)} m tall`);
  let head = 0;
  for (let y = CLOCK_TOWER_HEIGHT - 0.6; y < CLOCK_TOWER_HEIGHT; y += 0.01) if (first([-0.85, y, 30], [0, 0, -1], vane)) head++; // over the compass letters
  assert.ok(head >= 5, `an arrowhead at the other end (${head} cm of it at x -0.85)`);
  const hex = (vane.material as THREE.MeshLambertMaterial).color.getHex(), [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  assert.ok(r > b + 0x50 && g > b && r <= 0xd0, `an old gold, not a flat yellow: #${hex.toString(16)}`);
});

// Round 3b (the GPU capture): by day the row was a dull grid, every modillion face darkened at its own foot by the contact shade (FOOT_SHADE, by
// v), and the gaps no darker than the faces (the modillions cast no sun shadow); at night one even glowing band. The gaps' shade is painted
// by vertex colour (so the night wash, which takes the surface's colour, sees it too) and the cornice's v is lifted clear of the foot shade.
test('the gaps and the soffit along the wall are painted in shade, 0.35 to 0.45 of the modillions\' light by day and under the night wash; no foot shade on the cornice', () => {
  const stone = named('tower-stone'), col = stone.geometry.getAttribute('color'), uv = stone.geometry.getAttribute('uv');
  const night = buildingNightMaterialsOf(stone)!.night as THREE.Material;
  const lib = THREE.ShaderLib.lambert, s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  night.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const declarations = s.fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  const run = new Glsl(declarations).snippet(s.fragmentShader.split('#include <emissivemap_fragment>')[1]!.split('#include')[0]!);
  /** the night wash's light (luma) on the surface a ray meets, its albedo the stone's times the vertex colour there */
  const lit = (o: number[], d: number[]): { day: number; night: number; v: number } => {
    const h = first(o, d, stone)!, k = h.face!.a, pos = stone.geometry.getAttribute('position'), f = h.face!;
    const P = [f.a, f.b, f.c].map(i => new THREE.Vector3().fromBufferAttribute(pos, i)), C = [f.a, f.b, f.c].map(i => new THREE.Vector3().fromBufferAttribute(col, i));
    const c = THREE.Triangle.getInterpolation(h.point, P[0]!, P[1]!, P[2]!, C[0]!, C[1]!, C[2]!, new THREE.Vector3())!.toArray(); // the colour at the point
    const n = new THREE.Vector3().fromBufferAttribute(stone.geometry.getAttribute('normal'), k);
    const vars = { vKxWashPos: h.point.toArray(), vKxWashNormal: n.toArray(), uWinNight: 1, diffuseColor: [0.6 * c[0]!, 0.55 * c[1]!, 0.45 * c[2]!, 1], totalEmissiveRadiance: [0, 0, 0] };
    run({ vars });
    return { day: luma(c), night: luma(vars.totalEmissiveRadiance), v: Math.min(uv.getY(h.face!.a), uv.getY(h.face!.b), uv.getY(h.face!.c)) };
  };
  const u = -cw / 2 + 0.25, pitch = (cw - 0.5) / 7, foot = (v: number): number => 1 - 0.32 * Math.exp(-0.3 * v / 0.6) - 0.4 * Math.exp(-2.5 * v / 0.6);
  for (const y of [by + 0.15, by + 0.42, by + 0.68]) {
    const gap = lit([u + pitch / 2, y, 30], [0, 0, -1]), face = lit([u, y, 30], [0, 0, -1]);
    for (const [what, r] of [['by day', gap.day / face.day], ['at night', gap.night / face.night]] as const) {
      assert.ok(r >= 0.35 && r <= 0.45, `the gap ${r.toFixed(2)} of a modillion's face ${what}, ${(y - by).toFixed(2)} m up`);
    }
    assert.ok(foot(face.v) >= 0.95, `a modillion's face keeps ${foot(face.v).toFixed(2)} of its light at its foot`);
  }
  for (const [o, what] of [[[0.05, cy + TOWER_TOP.corona / 2, 30], 'the corona'], [[0.05, cy + TOWER_TOP.corona + 0.05, 30], 'the cyma']] as const) {
    assert.ok(foot(lit([...o], [0, 0, -1]).v) >= 0.95, `${what} is clear of the foot shade`);
  }
  const wall = lit([u + pitch / 2, by + 0.05, stage + 0.12], [0, 1, 0]), edge = lit([0, by + 0.05, stage + 1.15], [0, 1, 0]);
  assert.ok(wall.day / edge.day <= 0.6 && edge.day >= 1.3, `the soffit shaded along the wall (${(wall.day / edge.day).toFixed(2)} of its edge), cream at its edge`);
  const frieze = lit([0, eavesY + 0.15, 30], [0, 0, -1]);
  assert.ok(frieze.day >= 1.3, 'the frieze below the row keeps the cream');
});

test('the shadow pass draws at most 330 of the tower\'s triangles (68283613 drew 732): the modillions are drawn by the eye pass only, no new draw', async () => {
  const { SHADOW_CASTERS } = await import('../src/lighting.ts');
  const meshes = tower.getObjectsByProperty('isMesh', true) as THREE.Mesh[];
  const full = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  const cast = meshes.filter(m => SHADOW_CASTERS.has(m.name)).reduce((s, m) => s + ((m.userData.shadowTriangles as number | undefined) ?? full(m)), 0);
  assert.ok(cast <= 330, `${cast} tower triangles in the shadow pass`);
  assert.equal(meshes.length, 8, 'eight draws, as before');
  // the pass really draws only that head of the index, and the eye pass gets the whole mesh back after it
  const stone = named('tower-stone'), g = stone.geometry, n = stone.userData.shadowTriangles as number;
  assert.ok(n > 0 && n < full(stone), 'the stone draws only part of itself in the pass');
  stone.onBeforeShadow(undefined as never, undefined as never, undefined as never, undefined as never, g, undefined as never, null as never);
  assert.equal(g.drawRange.count, n * 3);
  stone.onAfterShadow(undefined as never, undefined as never, undefined as never, undefined as never, g, undefined as never, null as never);
  assert.equal(g.drawRange.count, Infinity);
  // what the pass leaves out is the modillions alone: every triangle past the head lies in the bracket row
  const pos = g.getAttribute('position'), idx = g.index!;
  for (let i = n * 3; i < idx.count; i++) { const y = pos.getY(idx.getX(i)); assert.ok(y >= by - 1e-6 && y <= cy + 1e-6, `a triangle outside the row left out of the pass at y ${y.toFixed(2)}`); }
  for (let i = 0; i < n * 3; i++) { const p = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i)); if (p.y > by + 0.01 && p.y < cy - 0.01) assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) < stage + 0.2, 'no modillion is drawn in the pass'); }
});
