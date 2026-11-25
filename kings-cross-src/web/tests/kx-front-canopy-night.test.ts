import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import type { CityData } from '../../core/city.ts';
import { addCity } from '../src/city.ts';
import { buildShed, FRONT_CANOPY, TOWER_SIZE } from '../src/shed.ts';
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
const steelIndex = mats(porch).findIndex((m, i) => i > 0 && m !== material('stone') && m !== material('stoneFoot') && m !== material('brickFoot')); // re-pinned arcade round 2: the rings by day a vertex-coloured clone of the brick, the first material // re-pinned round 24: the voussoirs are in the floodlit stoneFoot now; re-pinned arcade round 1: the rings are the wall's brickFoot (PORCH_ORDERS)
const rgb = (c: THREE.Color): [number, number, number] => { const h = c.getHex(); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; };

/** the first hit of a ray from (x, y, z) along `dir` (shed frame) on `target`'s material `index`, as a shed-frame point */
const hit = (target: THREE.Mesh, index: number, from: [number, number, number], dir: [number, number, number]): THREE.Vector3 | null => {
  const o = group.localToWorld(new THREE.Vector3(...from));
  const d = new THREE.Vector3(...dir).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(o, d, 0, 30).intersectObject(target, false).find(i => i.face?.materialIndex === index);
  return h ? group.worldToLocal(h.point.clone()) : null;
};

test('the canopy\'s roof sheet runs unbroken at least 1.5 m in front of the tower\'s foot', () => {
  assert.ok(steelIndex > 0, 'the canopy is the porch mesh\'s steel');
  const towerFace = TOWER_SIZE + 0.15;
  for (let dz = 0.1; dz <= 1.5; dz += 0.1) {
    for (const dx of [-2, 0, 2]) {
      const p = hit(porch, steelIndex, [layout.spine + dx, 12, towerFace + dz], [0, -1, 0]);
      assert.ok(p && p.y - GROUND_Y > 3.4 && p.y - GROUND_Y < 4.0, `sheet in front of the tower at dx ${dx}, ${dz.toFixed(1)} m out`);
    }
  }
  // Re-pinned 2026-11-24 (the round-2a hold): the bay west of the front ran into the city's grey canopy there, so it is gone; see the next test
});

test('the front canopy stops short of the city\'s grey canopy west of the front: their boxes do not overlap (the round-2a hold)', () => {
  const cityData: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));
  const scene = new THREE.Scene();
  const shed = buildShed(layout, { range: false });
  scene.add(shed);
  addCity(scene, data, cityData, { hidden: new Set(), trees: false });
  scene.updateMatrixWorld(true);
  const inv = shed.matrixWorld.clone().invert();
  const box = (m: THREE.Mesh, keep: (v: THREE.Vector3) => boolean, range?: { start: number; count: number }): THREE.Box3 => {
    const b = new THREE.Box3(), p = m.geometry.getAttribute('position'), idx = m.geometry.index, v = new THREE.Vector3();
    const n = range ? range.count : (idx ? idx.count : p.count);
    for (let k = 0; k < n; k++) {
      const i = range ? (idx ? idx.getX(range.start + k) : range.start + k) : (idx ? idx.getX(k) : k);
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (keep(v)) b.expandByPoint(v);
    }
    return b;
  };
  const front = shed.getObjectByName('shed-front-porch-arches') as THREE.Mesh;
  const steel = box(front, () => true, front.geometry.groups.find(g => g.materialIndex === steelIndex));
  const roofs = scene.getObjectByName('city-roof') as THREE.Mesh;
  assert.ok(roofs, 'the city\'s roofs are built');
  // the grey canopy: the city roof at canopy height in front of the Western Range, west of the front's end
  const grey = box(roofs, v => v.x < X0 + 2 && v.x > X0 - 30 && v.z > 0 && v.z < 12 && v.y > 2 && v.y < 6);
  assert.ok(!grey.isEmpty(), 'the grey canopy is there');
  assert.ok(!steel.intersectsBox(grey), `the front canopy (x from ${(steel.min.x - X0).toFixed(1)}) clears the grey one (to ${(grey.max.x - X0).toFixed(1)})`);
});

test('the canopy and the entrance frames are charcoal, not the ribs\' slate blue; the glass is a mid-dark grey-blue the frames stand out against, and the signage fascia navy, under the canopy', () => {
  const [r, g, b] = rgb(mats(porch)[steelIndex]!.color);
  assert.ok(Math.max(r, g, b) <= 0x30 && b - r <= 6, `charcoal canopy: ${r},${g},${b}`);
  assert.ok(infill, 'the entrances\' infill is built');
  const [glass, frames, fascia] = mats(infill);
  // Re-pinned 2026-11-24 (the round-2a hold): the near-black glass read as voids by day; it is a mid-dark grey-blue now that the near-black
  // frames stand out against, and the fascia is navy at the top of each opening under the canopy, not saturated blue at the transom
  const [gr, gg, gb] = rgb(glass!.color);
  assert.ok(Math.max(gr, gg, gb) >= 0x48 && Math.max(gr, gg, gb) <= 0x80 && gb > gr, `mid-dark grey-blue glass: ${gr},${gg},${gb}`);
  const [fr, fg, fb] = rgb(frames!.color);
  assert.ok(Math.max(fr, fg, fb) <= 0x30, `near-black frames: ${fr},${fg},${fb}`);
  assert.ok((gr + gg + gb) - (fr + fg + fb) >= 3 * 0x20, 'the frames stand out dark against the glass');
  const [sr, sg, sb] = rgb(fascia!.color);
  assert.ok(sb >= sr + 0x18 && sb > sg && sb <= 0x60, `a navy fascia: ${sr},${sg},${sb}`);
  const soffit = GROUND_Y + FRONT_CANOPY.top - FRONT_CANOPY.sheet;
  for (const x of centres) {
    for (const below of [0.06, 0.45]) assert.ok(hit(infill, 2, [x + 0.3, soffit - below, 10], [0, 0, -1]), `the fascia right under the canopy, ${below} m below its soffit, at x=${x.toFixed(1)}`);
    assert.equal(hit(infill, 2, [x + 0.3, soffit - 0.8, 10], [0, 0, -1]), null, 'and no lower');
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
  // Re-pinned 2026-11-24 (the round-2a hold): flat lamps on the soffit hid behind the canopy's fascia from eye height; they hang below it now
  const fasciaFoot = GROUND_Y + FRONT_CANOPY.top - FRONT_CANOPY.fascia;
  assert.ok(box.max.y < fasciaFoot && box.min.y > fasciaFoot - 0.6, 'all hung just below the canopy\'s fascia line');
  assert.ok(box.max.y - box.min.y >= 0.15, 'drums with a side to see, not flat plates');
  assert.ok(box.min.x < centres[0]! - 3.4 && box.max.x > centres[5]! + 3.4, 'along the canopy\'s length');
  // seen from eye height 60 m out, the lamps are the first thing on the line of sight: not the fascia, not the sheet
  const ly = (box.min.y + box.max.y) / 2, seen = [porch, infill, ...(group.getObjectByName('clock-tower') ? [group.getObjectByName('clock-tower')!] : [])];
  let lampsSeen = 0, tried = 0;
  for (const row of FRONT_CANOPY.lightRows) {
    for (let x = X0 + 0.3 + 0.6; x < X0 + FW - 0.3; x += FRONT_CANOPY.lightPitch) {
      if (Math.abs(x - layout.spine) < TOWER_SIZE / 2 + 0.5) continue;
      tried++;
      const eye = group.localToWorld(new THREE.Vector3(x, GROUND_Y + 1.7, 60)), at = group.localToWorld(new THREE.Vector3(x, ly, FRONT_CANOPY.depth * row));
      const first = new THREE.Raycaster(eye, at.clone().sub(eye).normalize(), 0, 80).intersectObjects(seen, true)[0];
      if (first?.object === infill && first.face?.materialIndex === 3) lampsSeen++;
    }
  }
  assert.ok(tried >= 40 && lampsSeen === tried, `every lamp seen from eye height 60 m out: ${lampsSeen} of ${tried}`);
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
  // the entrance glow fades up into the arch head; the frames stay dark in front of it
  const fadeAt = (i: number, y: number): number => {
    const lib = THREE.ShaderLib.lambert, s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    mats(infill)[i]!.onBeforeCompile(s as never, undefined as never);
    const f = (s.uniforms.uFrontFade as { value: THREE.Vector3 } | undefined)?.value;
    assert.ok(f && s.vertexShader.includes('vFrontY = position.y;') && s.fragmentShader.includes('smoothstep( uFrontFade.x, uFrontFade.y, vFrontY )'), `material ${i} carries the fade`);
    const t = Math.min(1, Math.max(0, (y - f.x) / (f.y - f.x)));
    return 1 + (f.z - 1) * t * t * (3 - 2 * t);
  };
  assert.ok(fadeAt(0, foot + 0.8) > 0.99 && fadeAt(0, foot + 3.9) < 0.5, 'brighter low at the doors, dimmer in the arch head');
  assert.ok(fadeAt(3, foot + 3.0) > 0.99, 'the lamps do not fade');
  const frame = mats(infill)[1]!, fs = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  frame.onBeforeCompile(fs as never, undefined as never);
  assert.ok(!('uFrontGlow' in fs.uniforms) && frame.emissive.r + frame.emissive.g + frame.emissive.b < 0.1, 'the frames have no glow: silhouettes against the lit glass');
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
  // the round-2a hold: at 0.5 m proud, flat, the band did not read; an overhanging cap casts the shadow line that makes it read
  assert.ok(out >= 0.75, `an overhanging cap at least 0.75 m proud (${out.toFixed(2)})`);
  const eye = group.localToWorld(new THREE.Vector3(x, GROUND_Y + 1.7, 30)), at = group.localToWorld(new THREE.Vector3(x, layout.springing - 0.35, 0.5));
  const first = new THREE.Raycaster(eye, at.clone().sub(eye).normalize(), 0, 60).intersectObjects([stone, porch], false)[0];
  assert.ok(first?.object === stone, 'and it shows over the canopy to a walker 30 m out');
});
