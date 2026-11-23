// The platform lamps' pools stop at the platform's coping: no 0.5 m stair steps along a platform edge that runs
// at an angle to the world axes, and no light overhanging the track bed beside it (Arthur, 2026-11-23, the open
// ends of the King's Cross platforms at night). Each check runs the shader's own clip line on the real map.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon, shedLayout } from '../../core/station.ts';
import { furniturePlan, surfacePlatforms } from '../src/furniture.ts';
import { nightLightSites } from '../src/night.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';
import { Glsl, Sampler } from './glsl.ts';
import type { Value } from './glsl.ts';

const PLATFORM_Y = .9;
const OUTSIDE = .02, INSIDE = .98, PROBE = .1; // clip 0.1 m either side of the outline

function texture2D(sampler: Value, uv: Value): Value {
  const texture = (sampler as Sampler).data as THREE.DataTexture;
  const { width, height, data } = texture.image as { width: number; height: number; data: Uint8Array };
  assert.equal(texture.magFilter, THREE.LinearFilter);
  const [u, v] = uv as [number, number];
  const texel = (i: number, j: number): number => data[Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i))]! / 255;
  const sx = u * width - .5, sy = v * height - .5, i = Math.floor(sx), j = Math.floor(sy), fx = sx - i, fy = sy - j;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return [lerp(lerp(texel(i, j), texel(i + 1, j), fx), lerp(texel(i, j + 1), texel(i + 1, j + 1), fx), fy), 0, 0, 1];
}

/** The pool's clip at a world point, by running the pool shader's floor line. */
function poolClip(lamps: ReturnType<typeof createPlatformLamps>): (x: number, z: number) => number {
  const pools = lamps.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const lib = THREE.ShaderLib.basic;
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  (pools.material as THREE.Material).onBeforeCompile(s as never, undefined as never);
  const line = s.fragmentShader.split('\n').find(l => l.includes('gl_FragColor.a') && l.includes('uPoolFloorMap'));
  assert.ok(line, 'the pools are clipped to the platform floor');
  const map = s.uniforms.uPoolFloorMap!.value as THREE.DataTexture, rect = (s.uniforms.uPoolFloorRect!.value as THREE.Vector4).toArray();
  const glsl = new Glsl('');
  return (x, z) => {
    const env = { vars: { gl_FragColor: [1, 1, 1, 1], uPoolFloorMap: new Sampler(map), uPoolFloorRect: rect, vPoolWorld: [x, PLATFORM_Y, z], vPoolFloorWeight: 1 } as Record<string, Value>, fns: { texture2D } };
    glsl.run(line, env);
    return (env.vars.gl_FragColor as number[])[3]!;
  };
}

/** Points PROBE either side of every edge of `ring` within `reach` of (cx, cz), clear of the corners. */
function edgeProbes(ring: readonly Pt[], cx: number, cz: number, reach: number): { inside: Pt; outside: Pt }[] {
  const out: { inside: Pt; outside: Pt }[] = [];
  const ccw = ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0) > 0;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]!, b = ring[(k + 1) % ring.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1) continue;
    const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length;
    const nx = ccw ? -dz : dz, nz = ccw ? dx : -dx; // inward
    for (let t = .5; t <= length - .5; t += .05) {
      const p: Pt = [a[0] + dx * t, a[1] + dz * t];
      if (Math.hypot(p[0] - cx, p[1] - cz) > reach) continue;
      out.push({ inside: [p[0] + nx * PROBE, p[1] + nz * PROBE], outside: [p[0] - nx * PROBE, p[1] - nz * PROBE] });
    }
  }
  return out;
}

test('a platform edge at an angle to the world axes clips its pool along a straight line at the coping, not in half-metre steps', () => {
  // 8 m x 80 m, turned 11.3 degrees (a slope of 1 in 5, the open ends of King's Cross run near that), one lamp at each third.
  const angle = Math.atan(.2), c = Math.cos(angle), s = Math.sin(angle);
  const at = (u: number, v: number): Pt => [u * c - v * s, u * s + v * c];
  const ring = [at(-4, -40), at(4, -40), at(4, 40), at(-4, 40)];
  const heads = [-13, 13].flatMap(v => { const [x, z] = at(0, v); return [x, PLATFORM_Y + 4.5, z]; });
  const lamps = createPlatformLamps(heads, [ring], PLATFORM_Y, 'kx');
  try {
    const clip = poolClip(lamps);
    let worstOut = 0, worstIn = 1;
    for (const v of [-13, 13]) {
      const [cx, cz] = at(0, v);
      for (const { inside, outside } of edgeProbes(ring, cx, cz, 9)) {
        worstOut = Math.max(worstOut, clip(...outside));
        worstIn = Math.min(worstIn, clip(...inside));
      }
    }
    assert.ok(worstOut <= OUTSIDE, `light ${worstOut.toFixed(3)} lands ${PROBE} m outside the platform edge (at most ${OUTSIDE})`);
    assert.ok(worstIn >= INSIDE, `light is cut to ${worstIn.toFixed(3)} ${PROBE} m inside the platform edge (at least ${INSIDE})`);
    // Across the edge the clip only rises, and over a single step of 5 cm it climbs by no more than the ramp allows.
    const [cx, cz] = at(-4, 13), n: Pt = [c, s];
    let last = 0;
    for (let w = -.5; w <= .5 + 1e-9; w += .01) {
      const value = clip(cx + n[0] * w, cz + n[1] * w);
      assert.ok(value >= last - 1e-9, 'monotone across the edge');
      last = value;
    }
  } finally { lamps.dispose(); }
});

test('King\'s Cross: no platform lamp\'s pool lands beyond the drawn platform edge, and none is cut short inside it', () => {
  const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
  const layout = shedLayout(data);
  const sites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, canopy: { centre: [0, 0], radius: 0 } as never, footprint: [] });
  // The rings main.ts hands the atmosphere: the outlines the platform mesh is drawn from (furniture.ts buildPlatforms).
  const outlines = surfacePlatforms(data).map(p => p.pts);
  const lamps = createPlatformLamps([...sites.platform, ...sites.shed], outlines, PLATFORM_Y, 'kx');
  try {
    const clip = poolClip(lamps);
    // On or within a metre of another platform is a seam between two, not track bed: P9's drawn extension runs
    // 0.04-0.5 m off P8's shared edge, a sliver no 0.5 m map resolves (nor needs to; no track runs in it).
    const segment = (p: Pt, a: Pt, b: Pt): number => {
      const vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vz);
    };
    const onAnother = (p: Pt, own: number): boolean => outlines.some((r, j) => j !== own
      && (pointInPolygon(p, r) || r.some((a, k) => segment(p, a, r[(k + 1) % r.length]!) < 1)));
    let worstOut = 0, worstIn = 1, probes = 0;
    for (let k = 0; k < sites.platform.length; k += 3) {
      const cx = sites.platform[k]!, cz = sites.platform[k + 2]!, reach = lamps.radii[k / 3]!;
      outlines.forEach((ring, i) => {
        for (const { inside, outside } of edgeProbes(ring, cx, cz, reach)) {
          if (onAnother(outside, i) || !pointInPolygon(inside, ring)) continue; // a seam with the next platform, or a notch
          probes++;
          worstOut = Math.max(worstOut, clip(...outside));
          worstIn = Math.min(worstIn, clip(...inside));
        }
      });
    }
    assert.ok(probes > 1000, `the open platform ends are probed (${probes})`);
    assert.ok(worstOut <= OUTSIDE, `light ${worstOut.toFixed(3)} lands ${PROBE} m beyond a platform's coping, over the track bed`);
    assert.ok(worstIn >= INSIDE, `light is cut to ${worstIn.toFixed(3)} ${PROBE} m inside a platform's edge`);
  } finally { lamps.dispose(); }
});
