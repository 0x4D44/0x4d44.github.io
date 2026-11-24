import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, TOWER_SIZE } from '../src/shed.ts';
import { material, windowNight } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 5's second pass at the south front (the round-1 scorer's list): the canopy unbroken in front of the tower's foot, carried west past the
// end pier and charcoal; the entrances' dark tinted glass, near-black frames and blue signage fascia; at night, soffit downlights and warm,
// steady entrance glazing. References: R-kx-front-a (2026), R-kx-front-b (2016), R-night-a (night-a-kx-front-2025-eden).
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH;
const FW = 2 * SHED_SPAN_WIDTH;
const bay = (FW - TOWER_SIZE) / 6;
const centres = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const foot = GROUND_Y + 0.2;
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const porch = group.getObjectByName('shed-front-porch-arches') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh | undefined;
const mats = (m: THREE.Mesh): THREE.MeshLambertMaterial[] => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshLambertMaterial[];
const steelIndex = mats(porch).findIndex(m => m !== material('stone'));
const rgb = (c: THREE.Color): [number, number, number] => { const h = c.getHex(); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; };

/** the first hit of a ray from (x, y, z) along `dir` (shed frame) on `target`'s material `index`, as a shed-frame point */
const hit = (target: THREE.Mesh, index: number, from: [number, number, number], dir: [number, number, number]): THREE.Vector3 | null => {
  const o = group.localToWorld(new THREE.Vector3(...from));
  const d = new THREE.Vector3(...dir).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(o, d, 0, 30).intersectObject(target, false).find(i => i.face?.materialIndex === index);
  return h ? group.worldToLocal(h.point.clone()) : null;
};

test('the canopy\'s roof sheet runs unbroken at least 1.5 m in front of the tower\'s foot, and one bay west past the end pier', () => {
  assert.ok(steelIndex > 0, 'the canopy is the porch mesh\'s steel');
  const towerFace = TOWER_SIZE + 0.15;
  for (let dz = 0.1; dz <= 1.5; dz += 0.1) {
    for (const dx of [-2, 0, 2]) {
      const p = hit(porch, steelIndex, [layout.spine + dx, 12, towerFace + dz], [0, -1, 0]);
      assert.ok(p && p.y - GROUND_Y > 3.4 && p.y - GROUND_Y < 4.0, `sheet in front of the tower at dx ${dx}, ${dz.toFixed(1)} m out`);
    }
  }
  const west = hit(porch, steelIndex, [X0 - 6, 12, 4], [0, -1, 0]);
  assert.ok(west && west.y - GROUND_Y > 3.4, 'the canopy carries on 6 m west of the front\'s end');
});

test('the canopy and the entrance frames are charcoal, not the ribs\' slate blue; the glass is dark tinted and the signage fascia blue', () => {
  const [r, g, b] = rgb(mats(porch)[steelIndex]!.color);
  assert.ok(Math.max(r, g, b) <= 0x30 && b - r <= 6, `charcoal canopy: ${r},${g},${b}`);
  assert.ok(infill, 'the entrances\' infill is built');
  const [glass, frames, fascia] = mats(infill);
  const [gr, gg, gb] = rgb(glass!.color);
  assert.ok(Math.max(gr, gg, gb) <= 0x30, `dark tinted glass: ${gr},${gg},${gb}`);
  const [fr, fg, fb] = rgb(frames!.color);
  assert.ok(Math.max(fr, fg, fb) <= 0x30, `near-black frames: ${fr},${fg},${fb}`);
  const [sr, sg, sb] = rgb(fascia!.color);
  assert.ok(sb > 1.5 * sr && sb > sg + 0x20, `a blue fascia: ${sr},${sg},${sb}`);
  for (const x of centres) {
    const p = hit(infill, 2, [x + 0.3, foot + 2.5, 10], [0, 0, -1]);
    assert.ok(p && p.z < -0.3, `the signage fascia at the transom in the opening at x=${x.toFixed(1)}, set back`);
  }
});

test('at night a row of downlights shows under the canopy\'s soffit and the entrances glow warm and steady, from the shared night level', () => {
  assert.ok(infill, 'the entrances\' infill is built');
  const lamps = infill.geometry.groups.find(g => g.materialIndex === 3);
  assert.ok(lamps, 'the downlights are the infill\'s fourth material');
  const pos = infill.geometry.getAttribute('position');
  const box = new THREE.Box3();
  for (let i = lamps.start; i < lamps.start + lamps.count; i++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, infill.geometry.index ? infill.geometry.index.getX(i) : i));
  assert.ok(lamps.count / 6 / 5 >= 40, `at least 40 lamps (${(lamps.count / 30).toFixed(0)})`);
  assert.ok(box.max.y - GROUND_Y < 3.85 && box.min.y - GROUND_Y > 3.5, 'all on the soffit, under the sheet');
  assert.ok(box.min.x < centres[0]! - 3.4 && box.max.x > centres[5]! + 3.4, 'along the canopy\'s length');
  const glows: THREE.Color[] = [];
  for (const i of [0, 2, 3]) {
    const m = mats(infill)[i]!;
    const lib = THREE.ShaderLib.lambert;
    const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    m.onBeforeCompile(s as never, undefined as never);
    assert.equal(s.uniforms.uWinNight, windowNight, `material ${i} follows the shared night level`);
    const glow = (s.uniforms.uFrontGlow as { value: THREE.Color } | undefined)?.value;
    assert.ok(glow && s.fragmentShader.includes('uFrontGlow * uWinNight'), `material ${i} glows by the night level`);
    assert.ok(!/uTime|sin\(|rand|noise/.test(s.fragmentShader.split('#include <emissivemap_fragment>')[1] ?? ''), `material ${i}: steady, no flicker term`);
    glows.push(glow);
  }
  const [glass, , lamp] = glows as [THREE.Color, THREE.Color, THREE.Color];
  assert.ok(glass.r > glass.g && glass.g > glass.b && glass.b / glass.r < 0.75, 'the entrance glass is warm, not white');
  assert.ok(glass.r < 0.6, 'and lit, not blown out');
  assert.ok(lamp.r + lamp.g + lamp.b > 2 * (glass.r + glass.g + glass.b), 'the downlights are the brightest thing under the canopy');
});

test('the great windows\' sill course is the front\'s boldest band: 0.6 m or more deep, 0.45 m or more proud, its foot clear above the canopy', () => {
  const stone = group.getObjectByName('shed-stone') as THREE.Mesh;
  const x = X0 + bay;
  let lo = Infinity, hi = -Infinity, out = 0;
  for (let y = layout.springing - 1.2; y <= layout.springing + 0.2; y += 0.01) {
    const o = group.localToWorld(new THREE.Vector3(x, y, 10));
    const h = new THREE.Raycaster(o, new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld), 0, 13).intersectObject(stone, false)[0];
    if (!h) continue;
    const z = group.worldToLocal(h.point.clone()).z;
    if (z < 0.4) continue;
    lo = Math.min(lo, y); hi = Math.max(hi, y); out = Math.max(out, z);
  }
  assert.ok(hi - lo >= 0.6 && out >= 0.45, `a bold sill course: ${(hi - lo).toFixed(2)} m deep, ${out.toFixed(2)} m proud`);
  assert.ok(lo - GROUND_Y > 3.85 + 0.5, 'its foot well above the canopy\'s top');
});
