// Shed interior B7, round 1 (gap-scan-2: "by night the platform is lit flat and evenly"). The shed's platforms draw their lamps' pools in their own
// shader (kx-shed-pools.ts): brighter under a lamp than midway along its row and toward the island's track edge, warm white, only inside the shed and
// only after dark; the shed heads' bounded decals (which flattened the floor) are off; by day the floor's sky light falls from the crown toward the
// vault walls. The shader's own block is run (tests/glsl.ts) against the baked map, so the GLSL is held, not only the CPU model of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { furniturePlan } from '../src/furniture.ts';
import { bakeShedFloor, lightShedFloor, SHED_CROWN_FLOOR, SHED_POOL, shedFloorGlsl, shedFloorLight } from '../src/kx-shed-pools.ts';
import { crownBelowUniforms } from '../src/lighting.ts';
import { material, windowNight } from '../src/materials.ts';
import { nightLightSites } from '../src/night.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';
import { addWorld } from '../src/world.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Value } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });
const heads = SITES.shed;
const floor = bakeShedFloor(layout, heads);
const R = SHED_SPAN_WIDTH / 2;

/** A bilinear read of the baked map (clamped to its edge, as a LinearFilter, clamp-to-edge texture does). */
function sample(uv: number[]): number[] {
  const { data: px, width: w, height: h } = floor.map.image as { data: Uint8Array; width: number; height: number };
  const fx = Math.min(w - 1, Math.max(0, uv[0]! * w - 0.5)), fy = Math.min(h - 1, Math.max(0, uv[1]! * h - 0.5));
  const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(w - 1, i0 + 1), j1 = Math.min(h - 1, j0 + 1), tx = fx - i0, ty = fy - j0;
  const at = (i: number, j: number, c: number) => px[(j * w + i) * 4 + c]! / 255;
  return [0, 1, 2, 3].map((c) => (at(i0, j0, c) * (1 - tx) + at(i1, j0, c) * tx) * (1 - ty) + (at(i0, j1, c) * (1 - tx) + at(i1, j1, c) * tx) * ty);
}

// Round 1b: fitted to the lead's GPU capture of round 1 (night platform-eye-p8-south, the centreline at 146-152 under a lamp and 103-116 midway): the
// floor's light under the moon, each of direct and indirect, at the round-1 moon share (0.5) about 0.003, and the albedo that puts its lamp light at
// 0.125 of the gain per unit of pool, 0.15 (times the tint's luminance, 0.82)
const BASE = [0.003, 0.003, 0.0035];
const ALBEDO = [0.15, 0.15, 0.15, 1];
/** A linear luminance on the screen as sRGB 0-255: three's ACES filmic curve (as a grey) at the night exposure, then the sRGB transfer. */
function screen(l: number): number {
  const v = l * 2.3 / 0.6, a = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081), c = Math.min(1, Math.max(0, a));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
}
const block = shedFloorGlsl().replaceAll('reflectedLight.directDiffuse', 'rlDirect').replaceAll('reflectedLight.indirectDiffuse', 'rlIndirect');
const run = new Glsl('uniform vec4 uShedFloorRect;').snippet(block);

/** The floor's outgoing light at (x, z) as the patched shader works it out: night and day are the levels of uShedFloorNight and uShedFloorDay. */
function shade(x: number, z: number, night: number, day: number, albedo = ALBEDO): { out: number[]; emissive: number[]; direct: number[]; indirect: number[] } {
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(x - 5, PLATFORM_HEIGHT + 1.7, z + 3);
  cam.lookAt(x, PLATFORM_HEIGHT, z);
  cam.updateMatrixWorld(true);
  const v = new THREE.Vector3(x, PLATFORM_HEIGHT, z).applyMatrix4(cam.matrixWorldInverse).negate();
  const vars: Record<string, Value> = {
    uShedFloorRect: [floor.rect.x, floor.rect.y, floor.rect.z, floor.rect.w], uShedFloorMap: toValue(floor.map), uShedFloorNight: night, uShedFloorDay: day,
    viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [v.x, v.y, v.z],
    rlDirect: [...BASE], rlIndirect: [...BASE], totalEmissiveRadiance: [0, 0, 0], diffuseColor: [...albedo],
  };
  run({ vars, fns: { texture2D: (_s: Value, uv: Value) => sample(uv as number[]) } });
  const d = vars.rlDirect as number[], i = vars.rlIndirect as number[], e = vars.totalEmissiveRadiance as number[];
  return { out: [0, 1, 2].map((c) => d[c]! + i[c]! + e[c]!), emissive: e, direct: d, indirect: i };
}
const luma = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

/** A shed light and its neighbour along the same row (12.2 m on), and the point midway. */
function rowPair(): { lamp: [number, number]; mid: [number, number]; across: [number, number] } {
  for (let i = 0; i < heads.length; i += 3) {
    const x = heads[i]!, z = heads[i + 2]!;
    for (let j = 0; j < heads.length; j += 3) {
      const d = Math.hypot(heads[j]! - x, heads[j + 2]! - z);
      if (j !== i && d > 11.5 && d < 13) {
        const ax = (heads[j]! - x) / d, az = (heads[j + 2]! - z) / d;
        return { lamp: [x, z], mid: [(x + heads[j]!) / 2, (z + heads[j + 2]!) / 2], across: [x - 4.5 * az, z + 4.5 * ax] };
      }
    }
  }
  throw new Error('no row');
}

test('B7 night: a pool under each shed lamp, brighter than midway along the row and than the island\'s edge abreast of it, warm white', () => {
  const { lamp, mid, across } = rowPair();
  const under = shade(...lamp, 1, 0), between = shade(...mid, 1, 0), edge = shade(...across, 1, 0);
  // round 1b: on the screen (the lead: 2.5-3:1, under a lamp 150-170 so it does not clip, midway 55-65)
  const u = screen(luma(under.out)), m = screen(luma(between.out)), ratio = u / m;
  assert.ok(ratio >= 2.2 && ratio <= 3.2, `under a lamp / midway on the screen ${u.toFixed(1)} / ${m.toFixed(1)} = ${ratio.toFixed(3)} (a pool, not a flat wash, nor a spot)`);
  assert.ok(u >= 140 && u <= 180 && m >= 45 && m <= 75, `under ${u.toFixed(1)}, midway ${m.toFixed(1)}`);
  const side = u / screen(luma(edge.out));
  assert.ok(side >= 1.5 && side <= 3.2, `under a lamp / 4.5 m across ${side.toFixed(3)}`);
  assert.ok(luma(between.out) > luma(BASE) * 2, 'midway is still lamp-lit, not dark');
  const e = under.emissive;
  assert.ok(e[0]! > e[1]! && e[1]! > e[2]! && e[2]! / e[0]! > 0.45 && e[2]! / e[0]! < 0.8, `warm white, not amber nor cool: ${e.map((c) => c.toFixed(4))}`);
  // the base (the moon and the sky) under the roof falls to SHED_POOL.moon of itself after dark
  assert.ok(Math.abs(under.direct[0]! - BASE[0]! * SHED_POOL.moon) < 1e-6 && Math.abs(under.indirect[0]! - BASE[0]! * SHED_POOL.moon) < 1e-6, 'the moon falls to the share kept');
  assert.ok(SHED_POOL.moon >= 0.1 && SHED_POOL.moon <= 0.3, 'a fifth of the moon and sky reach the floor under the roof (ASSUMED; round 1b, was a half)');
  // the pool is light on the floor's own albedo, so the slab joints and the texture still read in it
  const pale = shade(...lamp, 1, 0, ALBEDO.map((c, i) => i < 3 ? 2 * c : c));
  assert.ok(Math.abs(pale.emissive[1]! - 2 * e[1]!) < 1e-6, 'twice the albedo, twice the pool');
  // the shader matches its CPU model (shedFloorLight) at the lamp, to the map's 8 bits
  const cpu = shedFloorLight(layout, heads, ...lamp);
  assert.ok(Math.abs(e[1]! / ALBEDO[1]! / new THREE.Color(SHED_POOL.tint).g - cpu.pool) < 0.02, `shader ${e[1]! / ALBEDO[1]!} against CPU ${cpu.pool}`);
});

test('B7: no pools by day, and none outside the shed (the open platform ends keep their own lamps)', () => {
  const { lamp } = rowPair();
  const day = shade(...lamp, 0, 0);
  assert.deepEqual(day.emissive, [0, 0, 0]);
  assert.deepEqual(day.direct, BASE);
  // 0.6 m north of the shed's end, at a place the baked map still covers (its box is the rotated footprint's), and 20 m north (beyond it)
  const inRect = (p: number[]) => { const u = (p[0]! - floor.rect.x) * floor.rect.z, v = (p[1]! - floor.rect.y) * floor.rect.w; return u > 0.01 && v > 0.01 && u < 0.99 && v < 0.99; };
  const near = Array.from({ length: Math.floor(layout.width) }, (_, u) => shedToWorld(layout, u + 0.5, layout.length + 0.6)).find(inRect);
  assert.ok(near, 'a point outside the shed inside the map');
  for (const [ox, oz] of [near, shedToWorld(layout, layout.spine - R, layout.length + 20)]) {
    const outside = shade(ox, oz, 1, 1);
    assert.deepEqual(outside.emissive, [0, 0, 0], 'north of the shed');
    assert.deepEqual(outside.direct, BASE, 'north of the shed, the moon kept');
  }
});

test('B7 day: the floor\'s light is full under the crown and falls toward the vault walls, its direct light (the shade\'s crown fill) too', () => {
  const [cx, cz] = shedToWorld(layout, layout.spine - R, 100), [wx, wz] = shedToWorld(layout, layout.spine - 2 * R + 1.5, 100);
  const crown = shade(cx, cz, 0, 1), flank = shade(wx, wz, 0, 1);
  assert.ok(Math.abs(crown.indirect[1]! - BASE[1]!) < 1e-4, 'under the crown, as before');
  const k = flank.indirect[1]! / BASE[1]!;
  assert.ok(k >= 0.75 && k <= 0.86 && Math.abs(k - SHED_CROWN_FLOOR.flank) < 0.03, `by the wall ${k.toFixed(3)}`);
  // round 1b: the floor's day light in the shade is mostly the direct term (the sun's, lifted by lighting.ts SHED_GLASS), so the factor takes it too
  assert.ok(Math.abs(flank.direct[1]! / BASE[1]! - k) < 1e-6, 'the direct light falls with it');
  assert.ok(Math.abs(crown.direct[1]! - BASE[1]!) < 1e-4, 'under the crown, the direct as before');
  const night = shade(wx, wz, 1, 0);
  assert.ok(Math.abs(night.indirect[1]! - BASE[1]! * SHED_POOL.moon) < 1e-6, 'after dark the crown term is off');
});

test('B7: the shed heads\' bounded decals are off (gain 0), the platform standards\' kept; the floor materials carry the patch', () => {
  const n = SITES.platform.length / 3, s = SITES.shed.length / 3;
  const lamps = createPlatformLamps([...SITES.platform, ...SITES.shed], [], PLATFORM_HEIGHT, 'kx', false, [], [...Array<undefined>(n).fill(undefined), ...(SITES.shedReach ?? [])],
    [...Array<undefined>(n).fill(undefined), ...Array<number>(s).fill(SHED_POOL.decal)]);
  const pools = lamps.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const gain = pools.geometry.getAttribute('poolGain');
  assert.ok(gain, 'a gain per head');
  assert.equal(SHED_POOL.decal, 0);
  for (let i = 0; i < n + s; i++) assert.equal(gain.getX(i), i < n ? 1 : 0, `head ${i}`);
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  (pools.material as THREE.Material).onBeforeCompile(sh as never, undefined as never);
  assert.ok(/gl_FragColor\.a \*= vPoolGain;/.test(sh.fragmentShader) && sh.vertexShader.includes('vPoolGain = poolGain;'), 'the decal reads its gain');
  lamps.dispose();
  // the London atmosphere passes the shed heads' gain
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: SITES, platformLampFloor: [] });
  const live = scene.getObjectByName('station-platform-lamps')!.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const g = live.geometry.getAttribute('poolGain');
  assert.ok(g && g.getX(n) === 0 && g.getX(0) === 1, 'shed heads 0, standards 1');
  atmosphere.dispose?.();
  // the platform tops and the edge strips draw the floor light; main.ts wires it
  const fresh = [new THREE.MeshLambertMaterial(), material('platformEdgeStripShed').clone()];
  lightShedFloor(fresh, floor);
  for (const m of fresh) {
    assert.ok(m.customProgramCacheKey().endsWith('+kx-shed-floor'));
    const f = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    m.onBeforeCompile(f as never, undefined as never);
    assert.ok(f.fragmentShader.includes('// kx-shed-floor-begin') && f.uniforms.uShedFloorNight === windowNight && f.uniforms.uShedFloorDay === crownBelowUniforms.uCrownBelow);
    assert.ok(f.fragmentShader.indexOf('// kx-shed-floor-begin') > f.fragmentShader.indexOf('#include <lights_fragment_end>'), 'after the lights');
  }
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(/lightShedFloor\(\[material\('platformTop'\), material\('platformEdgeStripShed'\)\], bakeShedFloor\(layout, kxSites\.shed\)\)/.test(main), 'main.ts lights the shed floor');
});
