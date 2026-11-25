// The platform lamps' pools stop at the platform's coping: no 0.5 m stair steps along a platform edge that runs
// at an angle to the world axes, and no light overhanging the track bed beside it (Arthur, 2026-11-23, the open
// ends of the King's Cross platforms at night). Each check runs the shader's own clip line on the real map.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon, SHED_PLATFORM_REFS, shedLayout, shedToWorld, stationPlatforms, uRangeAtV } from '../../core/station.ts';
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
  const sites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: { centre: [0, 0], radius: 0 } as never, footprint: [] });
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

test('King\'s Cross: where two drawn outlines share an edge (P4/P5 under the shed) the pool runs across the seam without a dark line', () => {
  const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
  const layout = shedLayout(data);
  const sites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: { centre: [0, 0], radius: 0 } as never, footprint: [] });
  const outlines = surfacePlatforms(data).map(p => p.pts);
  const heads = [...sites.platform, ...sites.shed];
  const lamps = createPlatformLamps(heads, outlines, PLATFORM_Y, 'kx');
  try {
    const clip = poolClip(lamps);
    const lit = (p: Pt): boolean => { for (let k = 0; k < heads.length; k += 3) if (Math.hypot(p[0] - heads[k]!, p[1] - heads[k + 2]!) < lamps.radii[k / 3]!) return true; return false; };
    let worst = 1, at: Pt | undefined, probes = 0;
    outlines.forEach((ring, i) => {
      const others = outlines.filter((_, j) => j !== i);
      for (const { inside, outside } of edgeProbes(ring, ring[0]![0], ring[0]![1], Infinity)) {
        // A seam: both sides of the edge are platform.
        if (!pointInPolygon(inside, ring) || !others.some(o => pointInPolygon(outside, o))) continue;
        for (let s = 0; s <= 4; s++) {
          const p: Pt = [inside[0] + (outside[0] - inside[0]) * s / 4, inside[1] + (outside[1] - inside[1]) * s / 4];
          if (!lit(p)) continue;
          probes++;
          const value = clip(...p);
          if (value < worst) { worst = value; at = p; }
        }
      }
    });
    assert.ok(probes > 1000, `the shared seams under the lamps are probed (${probes})`);
    assert.ok(worst >= INSIDE, `the pool darkens to ${worst.toFixed(3)} on a seam between two platform outlines at ${at?.map(v => v.toFixed(2))}`);
  } finally { lamps.dispose(); }
});

test('King\'s Cross: every shed platform\'s track-side edge is in a pool all along it under the vaults, evenly, with no step across the floor', () => {
  // Added 2026-11-24 (the night scorer, platform 1 north): one row of shed lights over the middle of each island left platform 1's
  // edge 5.5 m off the 0/1 row (that island is 11.5 m across), outside its pool (0.6 x 12.2 m) between lights; the strip where people
  // stand by the train went from 92-111 to 17-24. The track-side face of each platform (P8's west face is against the west wall; P0's
  // track runs along the east aisle) is sampled every 0.5 m along the shed, 0.3 m and 2 m in from the coping.
  const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
  const layout = shedLayout(data);
  const sites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: { centre: [0, 0], radius: 0 } as never, footprint: [] });
  const outlines = surfacePlatforms(data).map(p => p.pts);
  const heads = [...sites.platform, ...sites.shed];
  // the reach atmosphere.ts hands the lamps
  const reach = [...Array<undefined>(sites.platform.length / 3).fill(undefined), ...sites.shedReach ?? []];
  const lamps = createPlatformLamps(heads, outlines, PLATFORM_Y, 'kx', false, [], reach);
  const TRACK_SIDE: Record<string, 'west' | 'east'> = { '8': 'east', '7': 'west', '6': 'east', '5': 'west', '4': 'east', '3': 'west', '2': 'east', '1': 'west', '0': 'east' };
  const MEAN = .4, STEP = .15; // every other platform's edge is at 0.47-0.64 of the full pool; 0.13 is the steepest step a pool's own fall-off makes
  // The pool's profile at r = distance / radius: streetlights.ts pool-profile-begin, with KX's poolFocus 1.4 (station-lamps.ts).
  const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const profile = (r: number): number => r >= 1 ? 0 : (1 + 1.4 * r * r) ** -1.5 * (1 - smooth(.55, 1, r));
  try {
    const clip = poolClip(lamps);
    const platforms = stationPlatforms(data);
    for (const ref of SHED_PLATFORM_REFS) {
      const pts = platforms.get(ref)!.pts, east = TRACK_SIDE[ref] === 'east';
      let sum = 0, n = 0, worstStep = 0, previous: number | undefined;
      for (let v = 12; v < layout.length - 12; v += .5) {
        const range = uRangeAtV(layout, pts, v);
        if (!range) { previous = undefined; continue; }
        for (const depth of [.3, 2]) {
          const [x, z] = shedToWorld(layout, east ? range[1] - depth : range[0] + depth, v);
          let dark = 1, inPool = false;
          for (let k = 0; k < heads.length; k += 3) {
            const r = Math.hypot(x - heads[k]!, z - heads[k + 2]!) / lamps.radii[k / 3]!;
            if (r < 1) { inPool = true; dark *= 1 - profile(r); }
          }
          const c = clip(x, z);
          assert.ok(inPool, `P${ref}'s track-side edge at v ${v.toFixed(1)}, ${depth} m in, is in no lamp's pool`);
          assert.ok(c >= INSIDE, `P${ref}'s track-side edge at v ${v.toFixed(1)}, ${depth} m in, is clipped to ${c.toFixed(3)}`);
          const lit = c * (1 - dark);
          sum += lit; n++;
          if (depth === .3) {
            if (previous !== undefined) worstStep = Math.max(worstStep, Math.abs(lit - previous));
            previous = lit;
          }
        }
      }
      assert.ok(n > 600, `P${ref}'s edge is sampled along the shed (${n})`);
      assert.ok(sum / n >= MEAN, `P${ref}'s track-side edge is lit to ${(sum / n).toFixed(2)} of a full pool on average (at least ${MEAN})`);
      assert.ok(worstStep <= STEP, `P${ref}'s edge steps by ${worstStep.toFixed(3)} between samples 0.5 m apart (at most ${STEP})`);
    }
  } finally { lamps.dispose(); }
});
