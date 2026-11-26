// web/src/night.ts: where the lights go at night (on the real station data) and the three cheap draws that show them. The platform
// lamps are the furniture plan's own; the shed's lights hang under its two vaults; the concourse's under its dome, inside the building.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, concourseHeight, pointInPolygon, SHED_SPAN_WIDTH, shedLayout, stationBuilding, stationPlatforms, uRangeAtV, worldToShed } from '../../core/station.ts';
import { FIGURES, furniturePlan } from '../src/furniture.ts';
import { createNightLights, nightLightSites } from '../src/night.ts';
// Re-pinned 2026-11-24 (shed realignment, signed off): the vault centres are the spine -/+ R (aisle + R and aisle + 3R before, the same points while the aisles were even), the valley is the spine, and there is no west aisle, so a probe of 'the aisle' stands in the east aisle.

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const footprint = stationBuilding(data)!.pts;
const plan = furniturePlan(data, layout);
const sites = nightLightSites({ lamps: plan.lamps, layout, data, canopy, footprint });
const triples = (flat: number[]): [number, number, number][] => Array.from({ length: flat.length / 3 }, (_, i) => [flat[3 * i] as number, flat[3 * i + 1] as number, flat[3 * i + 2] as number]);

// The shed's islands (platforms either side of no track), read off the OSM outlines here, not from night.ts: the u of an island's
// middle at a v of the shed frame, from the west face of its westmost platform to the east face of its eastmost.
const ISLANDS = [['8'], ['7', '6'], ['5', '4'], ['3', '2'], ['1', '0']] as const;
const kx = stationPlatforms(data);
const islandAt = (i: number, v: number): number | null => {
  const refs = ISLANDS[i]!;
  const w = uRangeAtV(layout, kx.get(refs[0])!.pts, v), e = uRangeAtV(layout, kx.get(refs[refs.length - 1])!.pts, v);
  return w && e ? (w[0] + e[1]) / 2 : null;
};
const islandMid = (i: number): number => islandAt(i, 120)!;

test('every platform lamp standard gets a light at the height of its lantern', () => {
  assert.ok(plan.lamps.length > 20, `the plan has ${plan.lamps.length} lamps`);
  const lights = triples(sites.platform);
  assert.equal(lights.length, plan.lamps.length, 'one light for each lamp');
  lights.forEach(([x, y, z], i) => {
    const lamp = plan.lamps[i]!;
    assert.equal(x, lamp.x);
    assert.equal(z, lamp.z);
    assert.ok(Math.abs(y - (PLATFORM_HEIGHT + FIGURES.lampHeight - 0.14)) < 1e-12, `light ${i} is at the lantern: ${y}`);
  });
});

test('the shed\'s lights hang inside it: under its two vaults, within its length, below the roof, a light every second rib', () => {
  const lights = triples(sites.shed);
  assert.ok(lights.length >= 40 && lights.length <= 200, `${lights.length} shed lights`);
  const radius = SHED_SPAN_WIDTH / 2;
  for (const [x, y, z] of lights) {
    const { u, v } = worldToShed(layout, [x, z]);
    // Re-pinned 2026-11-24 (rows over the islands): 'within 9 m of a vault's middle' held rows at the crown -/+ 8 m; a row over platform 8
    // stands 11 m off the west vault's middle and the 0/1 row 14.5 m off the east's, so this now holds what it meant: under the two vaults,
    // between the west wall (u = 0) and the east arcade (spine + one span), not in the east aisle.
    assert.ok(v > 0 && v < layout.length, `along the shed: ${v}`);
    // Re-pinned 2026-11-24 (platform 1's edge dark): platform 0 stands in the east aisle beyond the east arcade and now has a row of its own
    // there, under the aisle's flat roof (its underside 0.3 m below the springing, shed.ts), so a light east of the arcade is held to the
    // aisle and below its roof, well above the platform; every other light is held where it was, under the two vaults.
    if (u >= layout.spine + 2 * radius) {
      assert.ok(u < layout.width, `inside the east aisle: ${u}`);
      assert.ok(y < layout.springing - 0.3 && y > PLATFORM_HEIGHT + 3, `under the aisle roof, well above the platform: ${y}`);
      continue;
    }
    assert.ok(u > layout.spine - 2 * radius && u < layout.spine + 2 * radius, `across the vaults: ${u}`);
    assert.ok(y > layout.springing && y < layout.springing + radius, `between the springing and the crown: ${y}`);
  }
  // Re-pinned 2026-11-24 (rows over the islands): the rows no longer stand at the vault crowns -/+ 8 m but over the five islands, so
  // 'four rows' is now 'one row per island', still with equally many lights in each.
  const rows = new Map<number, number>();
  for (const [x, , z] of lights) {
    const { u } = worldToShed(layout, [x, z]);
    const near = ISLANDS.map((_, i) => i).sort((a, b) => Math.abs(u - islandMid(a)) - Math.abs(u - islandMid(b)))[0]!;
    rows.set(near, (rows.get(near) ?? 0) + 1);
  }
  assert.equal(rows.size, ISLANDS.length, `a row over each island: ${[...rows.keys()]}`);
  // Re-pinned 2026-11-24 (platform 1's edge dark): the 0/1 island (the last) has two rows, one over each platform, as one row over its middle
  // left both its track-side edges out of the pools; the others' rows have as many lights as before, the 0/1 island twice that.
  // Re-pinned 2026-11-26 (B7 night pools: the 4/5 row zig-zagged across the spine, so each of platforms 4 and 5 had a pool only every 24.4 m):
  // the 4/5 island (the middle) now has a row over each platform too, so it has twice the lights, as the 0/1 island.
  const counts = ISLANDS.map((_, i) => rows.get(i)!);
  const twice = new Set([ISLANDS.findIndex((r) => r[0] === '5'), ISLANDS.length - 1]);
  assert.equal(new Set(counts.filter((_, i) => !twice.has(i))).size, 1, `the same number in each single row: ${counts}`);
  for (const i of twice) assert.equal(counts[i], 2 * counts[0]!, `two rows over the ${ISLANDS[i]!.join('/')} island: ${counts}`);
  const spacing = triples(sites.shed).slice(0, 2).map(([x, , z]) => worldToShed(layout, [x, z]).v);
  assert.ok(Math.abs((spacing[1] as number) - (spacing[0] as number) - 12.2) < 1e-6, `a light every 12.2 m: ${spacing}`);
});

test('every island under the shed has its own row of shed lights over it, along its whole length under the vaults', () => {
  // Added 2026-11-24: the rows hung at the vault crowns -/+ 8 m; when the 2026-11-24 realignment moved the vaults ~6 m west, the 4/5
  // island fell between two rows (8 m from each) and went dark at night. Within NEAR of each island's middle, at every 12.2 m along
  // the shed where the island is drawn, there is a light: a light a pool (radius 0.6 x 12.2 m) from both its faces.
  const NEAR = 3;
  const lights = triples(sites.shed).map(([x, , z]) => worldToShed(layout, [x, z]));
  ISLANDS.forEach((refs, i) => {
    let checked = 0;
    for (let v = 12; v < layout.length - 12; v += 12.2) {
      const mid = islandAt(i, v);
      if (mid === null) continue;
      checked++;
      const near = lights.filter((l) => Math.abs(l.v - v) <= 6.1);
      // Re-pinned 2026-11-24 (platform 1's edge dark): the 0/1 island is lit by a row over each of its platforms (it is 11.5 m across and
      // the east arcade stands on platform 0), so there it is each platform's middle that has a light within NEAR, not the island's.
      const middles = refs.length === 2 && refs[1] === '0' ? refs.map((ref) => { const r = uRangeAtV(layout, kx.get(ref)!.pts, v)!; return (r[0] + r[1]) / 2; }) : [mid];
      for (const m of middles) {
        const best = Math.min(...near.map((l) => Math.abs(l.u - m)));
        assert.ok(best <= NEAR, `island ${refs.join('/')} at v ${v.toFixed(1)}: a middle is at u ${m.toFixed(1)}, the nearest light ${best.toFixed(1)} m off`);
      }
    }
    assert.ok(checked >= 14, `island ${refs.join('/')} was checked along the shed (${checked} places)`);
  });
});

test('the concourse\'s lights are under the dome, inside the station building and west of the shed', () => {
  const lights = triples(sites.concourse);
  assert.ok(lights.length >= 10 && lights.length <= 120, `${lights.length} concourse lights`);
  const rings = [0.3, 0.55, 0.8].map((share) => share * canopy.radius);
  for (const [x, y, z] of lights) {
    assert.ok(pointInPolygon([x, z], footprint), `(${x.toFixed(1)}, ${z.toFixed(1)}) is inside the building`);
    assert.ok(worldToShed(layout, [x, z]).u <= -1, 'and west of the shed');
    const r = Math.hypot(x - canopy.centre[0], z - canopy.centre[1]);
    const ring = rings.find((candidate) => Math.abs(candidate - r) < 1e-6);
    assert.ok(ring !== undefined, `on one of the three rings: ${r} against ${rings}`);
    assert.ok(Math.abs(y - (concourseHeight(canopy, ring as number) - 1.2)) < 1e-9, `1.2 m under the dome at that radius: ${y}`);
    assert.ok(y > PLATFORM_HEIGHT + 3, 'well above the floor');
  }
  assert.equal(new Set(lights.map(([x, y, z]) => `${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`)).size, lights.length, 'no two lights in one place');
});

test('the whole night light set is a few hundred points and three draws, off until it is dark', () => {
  const counts = { platform: sites.platform.length / 3, shed: sites.shed.length / 3, concourse: sites.concourse.length / 3 };
  assert.ok(counts.platform + counts.shed + counts.concourse < 600, JSON.stringify(counts));
  for (const flat of [sites.platform, sites.shed, sites.concourse]) assert.ok(flat.every(Number.isFinite));
  const night = createNightLights(sites);
  assert.deepEqual(night.counts(), counts);
  assert.equal(night.group.children.length, 3, 'three Points: three draw calls');
  for (const child of night.group.children) {
    assert.ok(child instanceof THREE.Points);
    assert.equal(child.visible, false, 'hidden by day');
    const m = (child as THREE.Points).material as THREE.PointsMaterial;
    assert.equal(m.blending, THREE.AdditiveBlending);
    assert.equal(m.depthWrite, false);
    assert.equal(m.transparent, true);
  }
  night.setLevel(1);
  for (const child of night.group.children) {
    assert.equal(child.visible, true);
    const m = (child as THREE.Points).material as THREE.PointsMaterial;
    assert.ok(m.opacity > 0.4 && m.opacity <= 1, `${child.name}: ${m.opacity}`);
  }
  night.setLevel(0.5);
  const half = night.group.children.map((c) => ((c as THREE.Points).material as THREE.PointsMaterial).opacity);
  night.setLevel(1);
  const full = night.group.children.map((c) => ((c as THREE.Points).material as THREE.PointsMaterial).opacity);
  half.forEach((h, i) => assert.ok(Math.abs(h * 2 - (full[i] as number)) < 1e-12, 'half the level is half the glow'));
  night.setLevel(0.005);
  assert.ok(night.group.children.every((c) => !c.visible), 'a trace of level draws nothing');
  night.setLevel(-3);
  assert.ok(night.group.children.every((c) => !c.visible));
  night.setLevel(40);
  assert.ok(night.group.children.every((c) => ((c as THREE.Points).material as THREE.PointsMaterial).opacity <= 1));
  const freed: string[] = [];
  for (const child of night.group.children) (child as THREE.Points).geometry.addEventListener('dispose', () => freed.push(child.name));
  night.dispose();
  assert.equal(freed.length, 3);
});

test('a site list with nothing in it makes no draw at all', () => {
  const none = createNightLights({ platform: [], shed: [], concourse: [] });
  assert.equal(none.group.children.length, 0);
  none.setLevel(1);
  none.dispose();
  const onlyLamps = createNightLights({ platform: [0, 5, 0], shed: [], concourse: [] });
  assert.equal(onlyLamps.group.children.length, 1);
});

test('attach: a layer is handed the level at once and from then on, and stops getting it when it lets go (round seven: the street lamps come on with the platform lamps)', () => {
  const night = createNightLights(sites);
  const seen: number[] = [];
  const other: number[] = [];
  const first = night.attach({ setLevel: (l) => seen.push(l) });
  assert.deepEqual(seen, [0], 'applied at once, at the level there is (the lamps arrive after the first frame, by day: they start out)');
  night.setLevel(0.3);
  const second = night.attach({ setLevel: (l) => other.push(l) });
  assert.deepEqual(other, [0.3], 'a layer that arrives late starts at the level it finds');
  night.setLevel(0.8);
  night.setLevel(5);
  night.setLevel(-1);
  assert.deepEqual(seen, [0, 0.3, 0.8, 1, 0], 'each level the lights are given, held to 0..1 as theirs are');
  assert.deepEqual(other, [0.3, 0.8, 1, 0]);
  first();
  night.setLevel(0.6);
  assert.deepEqual(seen, [0, 0.3, 0.8, 1, 0], 'nothing after it lets go');
  assert.deepEqual(other, [0.3, 0.8, 1, 0, 0.6], 'and the other still gets it');
  first();
  second();
  night.setLevel(0.2);
  assert.equal(other.length, 5, 'letting go twice does no harm');
  // the lights' own glow is unchanged by what is attached to them
  const third = night.attach({ setLevel: () => {} });
  night.setLevel(1);
  for (const child of night.group.children) assert.ok(((child as THREE.Points).material as THREE.PointsMaterial).opacity > 0.4);
  third();
  // disposing the lights lets every layer go
  const late: number[] = [];
  night.attach({ setLevel: (l) => late.push(l) });
  night.dispose();
  night.setLevel(0.5);
  assert.deepEqual(late, [1], 'only the level it was handed when it arrived');
});
