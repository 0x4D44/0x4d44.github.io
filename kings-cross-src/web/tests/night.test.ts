// web/src/night.ts: where the lights go at night (on the real station data) and the three cheap draws that show them. The platform
// lamps are the furniture plan's own; the shed's lights hang under its two vaults; the concourse's under its dome, inside the building.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, concourseHeight, pointInPolygon, SHED_SPAN_WIDTH, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { FIGURES, furniturePlan } from '../src/furniture.ts';
import { createNightLights, nightLightSites } from '../src/night.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const footprint = stationBuilding(data)!.pts;
const plan = furniturePlan(data, layout);
const sites = nightLightSites({ lamps: plan.lamps, layout, canopy, footprint });
const triples = (flat: number[]): [number, number, number][] => Array.from({ length: flat.length / 3 }, (_, i) => [flat[3 * i] as number, flat[3 * i + 1] as number, flat[3 * i + 2] as number]);

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
    assert.ok(u > layout.aisle + radius - 9 && u < layout.aisle + 3 * radius + 9, `across the vaults: ${u}`);
    assert.ok(v > 0 && v < layout.length, `along the shed: ${v}`);
    assert.ok(y > layout.springing && y < layout.springing + radius, `between the springing and the crown: ${y}`);
  }
  // two rows under each of the two vaults, equally many lights in each row
  const rows = new Map<string, number>();
  for (const [x, , z] of lights) {
    const { u } = worldToShed(layout, [x, z]);
    const key = (Math.round(u * 2) / 2).toFixed(1);
    rows.set(key, (rows.get(key) ?? 0) + 1);
  }
  assert.equal(rows.size, 4, `four rows: ${[...rows.keys()]}`);
  assert.equal(new Set(rows.values()).size, 1, 'the same number in each row');
  const spacing = triples(sites.shed).slice(0, 2).map(([x, , z]) => worldToShed(layout, [x, z]).v);
  assert.ok(Math.abs((spacing[1] as number) - (spacing[0] as number) - 12.2) < 1e-6, `a light every 12.2 m: ${spacing}`);
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
