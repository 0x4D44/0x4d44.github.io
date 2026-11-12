import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { PERTH_TERRAIN_EXTENT } from '../../tools/build-perth-terrain.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { PERTH_CITY_EXTENT, PERTH_CITY_LIDAR_SOURCE, PERTH_LIDAR_HEIGHTS, PERTH_LIDAR_LANDMARKS, perthCityHeight } from '../src/perth-city-heights.ts';
import { inPerthFrontageGroundMask, perthFrontageGroundMask } from '../src/perth-frontage-mask.ts';
import { stationOutline } from '../src/perth-station.ts';
import { CRAG_KEEP, KINNOULL_TOWER, KIRK_TOWER, TOWER_LOOK, kinnoullTower, SHORE, SHORE_BREAK, SHORE_SHEEN, shoreBreak, shoreRise, shoreSheen,WATER_GRADE, waterGrade, VIADUCT_FORM, VIADUCT_LOOK, PIER_FORM, waterLevel, PERTH_DRAPE, PERTH_LANDUSE, PERTH_LANDUSE_BRIDGES, TAY_VIADUCT, WATER, tayViaduct } from '../src/perth-city-features.ts';
import { PERTH_CITY_ASHLAR, PERTH_CITY_MESHES, PERTH_CITY_STONE, TOWN_LOOK, PERTH_ROOF_TONES, perthBuildingHeight, perthRoofTone } from '../src/perth-city.ts';
import { WAVERLEY_CITY_ASHLAR, WAVERLEY_CITY_STONE } from '../src/waverley-city.ts';
import { CLIFF_EYE, CLIFF_PAINT, CRAG, KINNOULL_EYE, KINNOULL_PEAK, SIGHT, WOODLAND, cliffPaintCells, kinnoullCrag, onCliff, sightHeight } from '../src/perth-woodland.ts';
import { CANOPY, ISLAND_CANOPY, inEyeClear, isIslandBelt, islandBeltTrees, kinnoullCanopy } from '../src/perth-canopy.ts';
/** The small islands' tree belts, and whether (x, z) is over one (its box, plus a 6 m lattice step and a little). */
const islandBelts = () => PERTH_LANDUSE.areas.wood.filter(rs => isIslandBelt(rs, PERTH_LANDUSE.areas.water));
const inIslandBelt = (x: number, z: number) => islandBelts().some(rs => { let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity; for (const [px, pz] of rs[0]!) { ax = Math.min(ax, px); az = Math.min(az, pz); bx = Math.max(bx, px); bz = Math.max(bz, pz); } const m = ISLAND_CANOPY.step + 2; return x >= ax - m && x <= bx + m && z >= az - m && z <= bz + m; });
import { SUMMIT, SUMMIT_CENTRE, inSummitHole, summitBushes } from '../src/perth-summit.ts';
import { MIRROR_CLASSES, TAY_MIRROR, buildTayMirror, mirrorAt, mirrorHeights, mirrorWeight } from '../src/perth-tay-mirror.ts';
import { EAST_SKIRT, LAND_FIELDS, LAND_HAZE, fieldContrast, landField, landFieldLength, landHedge, PERTH_EAST, PERTH_EAST_FILE, RIVER_END, eastWater, riverEnd } from '../src/perth-east-ground.ts';
import { GROUND_COLOUR, GROUND_Y } from '../src/world.ts';
import { Batch, material } from '../src/materials.ts';
import { GROUND_COLOURS } from '../src/waverley-city-ground.ts';
import { GARDENS, PERTH_RESIDENTIAL, perthGardens, segDist, streetsNear } from '../src/perth-gardens.ts';
import type { GardenRect } from '../src/waverley-city-ground.ts';
import { clearAir, fogFar } from "../src/atmosphere.ts";
import type { Haze } from "../src/atmosphere.ts";
import { PERTH_CLEAR_AIR, PERTH_HAZE, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { CLEAR_FOG, fogRange } from '../../core/daylight.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());
const pip = (x: number, z: number, p: readonly (readonly [number, number])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };

test('city heights: LiDAR (Phase I DSM less DTM, OGL credited) replaces the ASSUMED fallback wherever it is usable', () => {
  assert.deepEqual(PERTH_CITY_EXTENT, PERTH_TERRAIN_EXTENT, 'the heights rule uses the terrain extent');
  assert.ok(PERTH_CITY_LIDAR_SOURCE.dsm.every(u => u.includes('/lidar/phase-1/dsm/')));
  assert.match(PERTH_CITY_LIDAR_SOURCE.attribution, /Scottish public sector LiDAR.*Open Government Licence v3/);
  const { OSM, LiDAR, ASSUMED } = scene.heightBasis;
  assert.equal(OSM + LiDAR + ASSUMED, scene.buildingIds.length);
  assert.ok(ASSUMED < 3856 / 8, `far fewer ASSUMED than the 3,856 of phase 1: ${ASSUMED}`);
  assert.ok(LiDAR > 4000, `LiDAR heights: ${LiDAR}`);
  // a block with a LiDAR height and no OSM height is drawn at it; an OSM height still wins
  const b = data.buildings.find(q => PERTH_LIDAR_HEIGHTS.has(q.id) && q.heightBasis.startsWith('ASSUMED 12m') && q.minHeight === 0 && q.outer.length > 4)!;
  const h = perthCityHeight(b, perthBuildingHeight);
  assert.equal(h.basis, 'LiDAR'); assert.ok(Math.abs(h.height - PERTH_LIDAR_HEIGHTS.get(b.id)!.height) < .11 || h.height < PERTH_LIDAR_HEIGHTS.get(b.id)!.height);
  assert.equal(perthCityHeight({ ...b, heightBasis: 'OSM height; ASSUMED minHeight 0m', height: 21 }, perthBuildingHeight).basis, 'OSM');
});

test('the Tay is OSM water drawn over the DTM\'s filled river, never under it', () => {
  assert.ok(PERTH_LANDUSE.areas.water.length >= 2, 'the river polygons');
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh;
  assert.ok(water, 'the water sheet');
  // down through the river at every wet lattice node (16 m): where the node is the filled river (its ground at the river's level) the
  // sheet is over the drape; where the 16 m terrain climbs the bank inside the OSM outline, the drape covers it as a shore
  const level = waterLevel(scene.terrain);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let below = 0, n = 0, river = 0;
  for (const [o] of PERTH_LANDUSE.areas.water) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of o!) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let x = Math.ceil(x0 / 16) * 16; x <= x1; x += 16) for (let z = Math.ceil(z0 / 16) * 16; z <= z1; z += 16) {
      if (x <= PERTH_CITY_EXTENT.x0 || x >= PERTH_CITY_EXTENT.x1 || z <= PERTH_CITY_EXTENT.z0 || z >= PERTH_CITY_EXTENT.z1) continue;
      ray.set(new THREE.Vector3(x, 500, z), down); const hit = ray.intersectObject(water)[0]; if (!hit) continue; n++;
      const y = scene.terrain.heightAt(x, z); if (y > level(x, z) + .25) continue; river++;
      if (hit.point.y < y + PERTH_DRAPE + .05) below++;
    }
  }
  assert.ok(n > 300, `points on the water: ${n}`);
  assert.ok(river > .6 * n, `the filled river is most of the water: ${river} of ${n}`);
  assert.equal(below, 0, `water under the land-use drape on the filled river: ${below} of ${river}`);
  // the Bridgend viewpoint (OSM node/737405988, on the east bank) stands above the water, not under a sheet lifted to the bank
  assert.ok(level(938, -326) + PERTH_DRAPE + WATER.lift < scene.terrain.heightAt(938, -326), `the river below Bridgend: ${level(938, -326)}`);
  assert.ok(level(922, -43) < -4, `the sheet at the viaduct lies at the river, not the bank: ${level(922, -43)}`);
  // mid-river under the viaduct is water
  assert.ok(PERTH_LANDUSE.areas.water.some(([o]) => pip(922, -43, o!)), 'the Tay under the viaduct');
});

test('no road bridge overlaps the viaduct: the railway\'s own bridge outline is not drawn as a road bridge', () => {
  const line = PERTH_LANDUSE_BRIDGES.length ? (JSON.parse(readFileSync(new URL('../src/data/perth-city-landuse.json', import.meta.url), 'utf8')).bridges.viaduct.line as [number, number][]) : [];
  assert.ok(PERTH_LANDUSE_BRIDGES.some(b => b.name === 'Perth Bridge') && PERTH_LANDUSE_BRIDGES.some(b => b.name === "Queen's Bridge"), 'the two road bridges');
  for (const b of PERTH_LANDUSE_BRIDGES) {
    // every metre of the viaduct's path, outside every road bridge's outline
    let inside = 0;
    for (let i = 1; i < line.length; i++) { const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < n; k++) if (pip(ax + (bx - ax) * k / n, az + (bz - az) * k / n, b.outline)) inside++; }
    assert.equal(inside, 0, `${b.id} ${b.name} overlaps the viaduct line at ${inside} points`);
  }
});

test('the Tay Viaduct: seven girder spans, ten arches on Moncreiffe Island, six spans east, along OSM way/4438951', () => {
  const layout = tayViaduct(new Batch({ colored: true }), new Batch(), scene.terrain);
  assert.ok(Math.abs(layout.length - 443) < 3, `mapped length: ${layout.length}`);
  assert.equal(layout.piers.length, TAY_VIADUCT.westSpans + 1 + TAY_VIADUCT.eastSpans + 1);
  assert.ok(layout.island[1] - layout.island[0] > 60, `the island crossing: ${layout.island}`);
  const block = layout.arches[1] - layout.arches[0];
  assert.ok(Math.abs(block - (TAY_VIADUCT.arches * (TAY_VIADUCT.archClear + TAY_VIADUCT.archPier) + TAY_VIADUCT.archPier)) < 1e-6);
  assert.ok(layout.arches[0] > 0 && layout.arches[1] < layout.length, 'the arch block lies inside the bridge');
  for (const name of ['perth-viaduct-iron', 'perth-city-masonry', 'perth-bridge-roads']) assert.ok(scene.group.getObjectByName(name), name);
  assert.deepEqual(PERTH_LANDUSE_BRIDGES.map(b => b.name).filter(Boolean).sort(), ['Perth Bridge', "Queen's Bridge"]);
});

test('the viaduct\'s girder piers are twin columns under a cap, its girders pale grey and its railing white, as photographed (round 2, C4)', () => {
  const masonry = new Batch({ colored: true }), iron = new Batch({ colored: true });
  const layout = tayViaduct(masonry, iron, scene.terrain), mesh = new THREE.Mesh(masonry.build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(), F = VIADUCT_FORM, L = VIADUCT_LOOK;
  let gaps = 0, columns = 0, caps = 0;
  layout.pierPlan.forEach(({ p, t }, k) => {
    const n = [-t[1], t[0]], y = F.girder[0] - L.cap - 1.5;
    if (y < scene.terrain.heightAt(p[0], p[1]) + .5) return; // a pier standing too low to see between its columns
    if (layout.arches.some(a => Math.abs(a - layout.piers[k]!) < 3)) return; // the arch block's end piers carry its masonry beside them
    // along the track through the pier's centreline: joined between the two columns into one mass (round 4, lead's ruling on the round-3
    // score: 2166751's pair reads as one dumbbell mass; round 2 asserted the opposite, an open trestle)
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, y, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); ray.far = 10;
    if (ray.intersectObject(mesh).length > 0) gaps++;
    // under each girder: a column
    for (const side of [-1, 1]) { ray.set(new THREE.Vector3(p[0] + n[0] * side * F.girderOffset - t[0] * 5, y, p[1] + n[1] * side * F.girderOffset - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) columns++; }
    // the cap spans across, over the gap
    ray.set(new THREE.Vector3(p[0] - t[0] * 5, F.girder[0] - L.cap / 2, p[1] - t[1] * 5), new THREE.Vector3(t[0], 0, t[1])); if (ray.intersectObject(mesh).length) caps++;  });
  assert.ok(gaps >= 8, `piers joined between their columns: ${gaps}`);
  assert.equal(columns, 2 * gaps, 'two columns at each open pier');
  assert.equal(caps, gaps, 'a cap over each');
  const lum = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const ig = iron.build(), col = ig.getAttribute('color');
  let dark = 0; for (let i = 0; i < col.count; i++) if (lum([col.getX(i), col.getY(i), col.getZ(i)]) < .5) dark++;
  assert.equal(dark, 0, 'no dark ironwork: girders pale grey, railing white');
  // round 5 (round-4 score: the web filled each pair into one flat block): two round shafts with a dark seam, not a slab; and a shaded
  // bottom flange under each girder, not a flat white wall
  // round 6: the dark seam is about 0.15 of the shaft wide, not a panel across the gap (round 5's dark web showed side-on as a third of
  // the pier); the web behind it is the shafts' stone, in shadow, lighter than the seam; round shafts
  assert.ok(PIER_FORM.web <= .35 && PIER_FORM.seam <= .6 && PIER_FORM.sides >= 12, 'a thin, deep-set web between round shafts');
  assert.ok(PIER_FORM.seamWidth <= .18 && PIER_FORM.webShade > PIER_FORM.seam * lum(VIADUCT_LOOK.joint) / lum(VIADUCT_LOOK.stone) + .1, 'a narrow dark seam on a lighter web, not a dark panel');
  // round 7 (round-6 score: one block with a seam): the web is shadowed where it meets each shaft, lighter only in its middle third
  // round 8, declared (ordered: round 7's lighter, proud middle read as a third column): the middle is within 0.03-0.1 of the edge's
  // shade (round 7: at least 0.1 lighter) and at most 1 cm proud (new)
  assert.ok(PIER_FORM.webEdge <= .5 && PIER_FORM.webShade - PIER_FORM.webEdge >= .03 && PIER_FORM.webShade - PIER_FORM.webEdge <= .1 && PIER_FORM.webMiddle <= .4 && PIER_FORM.webProud <= .01, 'the web shadowed against each shaft, its middle flush and near the edge tone');
  const mc = layout && masonry.build().getAttribute('color'); let seamV = 0;
  const seamRgb = VIADUCT_LOOK.joint.map(v => v * PIER_FORM.seam);
  for (let i = 0; i < mc.count; i++) if (Math.abs(mc.getX(i) - seamRgb[0]!) < 1e-4 && Math.abs(mc.getY(i) - seamRgb[1]!) < 1e-4) seamV++;
  assert.ok(seamV >= 8 * 24, `seam faces drawn: ${seamV / 24}`);
  {
    const edge = VIADUCT_LOOK.stone.map(v => v * PIER_FORM.webEdge), mid = VIADUCT_LOOK.stone.map(v => v * PIER_FORM.webShade); let ne = 0, nm = 0;
    for (let i = 0; i < mc.count; i++) { if (Math.abs(mc.getX(i) - edge[0]!) < 1e-4 && Math.abs(mc.getY(i) - edge[1]!) < 1e-4) ne++; if (Math.abs(mc.getX(i) - mid[0]!) < 1e-4 && Math.abs(mc.getY(i) - mid[1]!) < 1e-4) nm++; }
    assert.ok(ne >= 8 * 24 && nm >= 8 * 24, `web edge and middle faces drawn: ${ne / 24}, ${nm / 24}`);
  }
  const flangeRgb = VIADUCT_LOOK.girder.map(v => v * PIER_FORM.flangeShade); let flangeV = 0;
  for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - flangeRgb[0]!) < 1e-4 && Math.abs(col.getY(i) - flangeRgb[1]!) < 1e-4) flangeV++;
  assert.ok(flangeV >= 13 * 2 * 24, `girder flanges drawn: ${flangeV / 24}`);
  assert.ok(lum(L.railing) > lum(L.girder), 'the railing is whiter than the girders');
  // round 3 (2166751): tall round columns, about 3:1 over the water where the deck's height allows it
  for (const c of layout.columns) assert.ok(c.diameter <= PIER_FORM.diameter[1] + 1e-9 && (c.visible / c.diameter >= PIER_FORM.aspect - 1e-6 || c.diameter === PIER_FORM.diameter[0]), `column ${c.diameter.toFixed(2)} m wide, ${c.visible.toFixed(2)} m over the water`);
  // in the river (where the deck stands high enough over the water for a 3:1 column of the least diameter), every column is about 3:1
  const wet = layout.columns.filter(c => c.visible >= PIER_FORM.aspect * PIER_FORM.diameter[0]);
  assert.ok(wet.length >= 8 && wet.every(c => Math.abs(c.visible / c.diameter - PIER_FORM.aspect) < .05), `river columns: ${wet.map(c => (c.visible / c.diameter).toFixed(2))}`);
  const mp = mesh.geometry.getAttribute('position');
  for (const c of layout.columns.slice(0, 3)) {
    // round: the column's ring corners all lie at one radius about its axis
    const n = [-layout.pierPlan.find(q => q.p === c.p)!.t[1], layout.pierPlan.find(q => q.p === c.p)!.t[0]], ax = c.p[0] + n[0]! * F.girderOffset, az = c.p[1] + n[1]! * F.girderOffset;
    const radii = new Set<string>(); for (let i = 0; i < mp.count; i++) { const r = Math.hypot(mp.getX(i) - ax, mp.getZ(i) - az); if (r < c.diameter) radii.add(r.toFixed(2)); }
    assert.ok([...radii].some(r => Math.abs(Number(r) - c.diameter / 2) < .01), `a ring at radius ${(c.diameter / 2).toFixed(2)}`);
  }
  // no gap over the cap: a cross girder between the plate girders, from the cap up towards the deck; and stiffeners on the girders
  const ip = ig.getAttribute('position'); let cross = 0, stiff = 0;
  for (const { p } of layout.pierPlan) for (let i = 0; i < ip.count; i++) if (Math.hypot(ip.getX(i) - p[0], ip.getZ(i) - p[1]) < F.girderOffset && Math.abs(ip.getY(i) - PIER_FORM.crossTop) < 1e-3) { cross++; break; }
  for (let i = 0; i < ip.count; i++) if (Math.abs(ip.getY(i) - F.girder[1]) < 1e-3) stiff++;
  assert.equal(cross, layout.pierPlan.length, 'a cross girder over every girder pier');
  assert.ok(lum(L.girder) > .75 && PIER_FORM.stiffenerShade < .8, 'a pale girder band with stiffeners that read');
  // the girders, not the track's concrete deck, are the span's outer face (round 4: chords pier to pier cut inside the path's bends, and
  // the deck stood out past them as a dark band in pt-tay-viaduct): rays in from both sides at the deck's height meet the iron first
  {
    const line = JSON.parse(readFileSync(new URL('../src/data/perth-city-landuse.json', import.meta.url), 'utf8')).bridges.viaduct.line as [number, number][], deckMesh = scene.group.getObjectByName('perth-bridge-decks')!, ironM = scene.group.getObjectByName('perth-viaduct-iron')!;
    const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
    const at = (u: number) => { let i = 1; while (i < line.length - 1 && cum[i]! < u) i++; const a = line[i - 1]!, b = line[i]!, l = cum[i]! - cum[i - 1]!, f = (u - cum[i - 1]!) / l; return {p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]}; };
    const spans: [number, number][] = [];
    for (let k = 0; k < TAY_VIADUCT.westSpans; k++) spans.push([layout.piers[k]!, layout.piers[k + 1]!]);
    for (let k = 0; k < TAY_VIADUCT.eastSpans; k++) spans.push([layout.piers[TAY_VIADUCT.westSpans + 1 + k]!, layout.piers[TAY_VIADUCT.westSpans + 2 + k]!]);
    const rr = new THREE.Raycaster(); let tried = 0, deckFirst = 0;
    for (const [u0, u1] of spans) for (let u = u0 + 3; u < u1 - 3; u += 4) for (const side of [-1, 1]) {
      const {p, t} = at(u), n = [-t[1]! * side, t[0]! * side];
      rr.set(new THREE.Vector3(p[0]! + n[0]! * 8, -.9, p[1]! + n[1]! * 8), new THREE.Vector3(-n[0]!, 0, -n[1]!)); rr.far = 8;
      const h = rr.intersectObjects([deckMesh, ironM], false)[0]; if (!h) continue; tried++;
      if (h.object === deckMesh) deckFirst++;
    }
    assert.ok(tried > 100 && deckFirst === 0, `the deck's edge stands outside the girders at ${deckFirst} of ${tried}`);
  }
  const ironMesh = scene.group.getObjectByName('perth-viaduct-iron') as THREE.Mesh, ironMat = ironMesh.material as THREE.MeshLambertMaterial;
  assert.ok(ironMat.name === 'perth-viaduct-paint' && !ironMat.map && ironMat.vertexColors, 'the ironwork in its own plain painted material, no darkening map');
  assert.ok(ironMat.emissive.r >= .1, 'the shaded girder face keeps some light');
  assert.ok(stiff / 8 > 2 * (layout.length * .6) / PIER_FORM.stiffener, `stiffener tops: ${stiff / 8}`);
});

test('Kinnoull Hill\'s woods, the Inches and the kirk come from OSM, the DSM and HES, not by eye', () => {
  const near = (rs: readonly (readonly (readonly [number, number])[])[][], x: number, z: number) => rs.some(([o]) => pip(x, z, o!));
  const woodsOnKinnoull = PERTH_LANDUSE.areas.wood.filter(([o]) => o!.some(([x]) => x > 1700)).length;
  assert.ok(woodsOnKinnoull >= 3, `wood polygons on Kinnoull Hill: ${woodsOnKinnoull}`);
  // North Inch (way/24240615) and South Inch (way/24240849) are OSM parks; the river is not painted park
  const parks = [...PERTH_LANDUSE.areas.park, ...PERTH_LANDUSE.areas.grass];
  assert.ok(near(parks, 300, -1000) || near(parks, 400, -900), 'the North Inch');
  assert.ok(near(parks, 300, 500), 'the South Inch');
  const spire = scene.group.getObjectByName('perth-kirk-spire') as THREE.Mesh;
  spire.geometry.computeBoundingBox();
  const kirk = data.buildings.find(b => b.id === PERTH_LIDAR_LANDMARKS.kirk.id)!;
  const base = scene.terrain.rangeUnder(kirk.outer, 4).min;
  assert.ok(Math.abs(spire.geometry.boundingBox!.max.y - (base + KIRK_TOWER.top)) < 1e-3, 'the spire top at 155 ft (HES LB39300)');
  assert.ok(pip(PERTH_LIDAR_LANDMARKS.kirk.x, PERTH_LIDAR_LANDMARKS.kirk.z, kirk.outer), 'the tower stands on the kirk');
});

test('the land-use drape leaves holes where P2 draws its own ground: the King\'s Place cut and the forecourt (lead ruling 13:18)', () => {
  const cover = scene.group.getObjectByName('waverley-ground-cover') as THREE.Mesh;
  const mask = perthFrontageGroundMask(stationOutline(data)?.outer), inMask = (x: number, z: number) => inPerthFrontageGroundMask(mask, x, z);
  const pos = cover.geometry.getAttribute('position'), index = cover.geometry.getIndex()!;
  let over = 0;
  for (let i = 0; i < index.count; i += 3) {
    const v = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const cx = v.reduce((a, k) => a + pos.getX(k), 0) / 3, cz = v.reduce((a, k) => a + pos.getZ(k), 0) / 3;
    if (inMask(cx, cz) || v.some(k => inMask(pos.getX(k), pos.getZ(k)))) over++;
  }
  assert.equal(over, 0, `drape triangles over P2's ground: ${over}`);
  // the two places the lead found covered: the forecourt and the 0.5 m road cut
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const [x, z] of [[-5, -50], [90, -50]] as const) { assert.ok(inMask(x, z), `(${x}, ${z}) is in the mask`); ray.set(new THREE.Vector3(x, 200, z), down); assert.equal(ray.intersectObject(cover).length, 0, `no drape over (${x}, ${z})`); }
  assert.ok(index.count / 3 > 10_000, 'the drape is still there elsewhere');
});

test('Kinnoull\'s woods are one continuous, mixed canopy, open westward from the summit, with gorse at the clearing (round 3, C1/C2)', () => {
  const [px, pz] = KINNOULL_PEAK;
  // the canopy: one draped mesh over the hill's OSM woods, in place of separate crowns (4307, 4599836: a closed canopy)
  const mesh = scene.group.getObjectByName('perth-kinnoull-canopy') as THREE.Mesh;
  assert.ok(mesh, 'the canopy mesh');
  let cityGroup = false; mesh.traverseAncestors(a => { if (a === scene.parts.buildings) cityGroup = true; }); assert.ok(cityGroup, 'in the city group');
  const P = mesh.geometry.getAttribute('position'), C = mesh.geometry.getAttribute('color');
  const top: { x: number; z: number; h: number; y: number; g: number }[] = [];
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), h = P.getY(i) - scene.terrain.heightAt(x, z); if (h > 0) top.push({ x, z, h, y: P.getY(i), g: C.getY(i) }); }
  assert.ok(top.length > 3000, `canopy nodes over the woods: ${top.length}`);
  // the crown texture is laid in plan metres
  const UV = mesh.geometry.getAttribute('uv'); for (let i = 0; i < P.count; i += 101) assert.ok(Math.abs(UV.getX(i) - P.getX(i)) < 1e-3 && Math.abs(UV.getY(i) - P.getZ(i)) < 1e-3, 'crown UVs in metres');
  // continuous: nearly every point of the hill's woods (away from the clearing, the cliff and the sightline) is under it
  const canopy = kinnoullCanopy(scene.terrain, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.cliffs, PERTH_LANDUSE.areas.water);
  const pipw = (x: number, z: number, rs: readonly (readonly (readonly number[])[])[]) => { const p = rs[0]!; let yes = false; for (let a = 0, b = p.length - 1; a < p.length; b = a++) if ((p[a]![1]! > z) !== (p[b]![1]! > z) && x < (p[b]![0]! - p[a]![0]!) * (z - p[a]![1]!) / (p[b]![1]! - p[a]![1]!) + p[a]![0]!) yes = !yes; return yes; };
  const hillWoods = PERTH_LANDUSE.areas.wood.filter(rs => rs[0]!.some(([x]) => x! > 1700));
  let inWood = 0, covered = 0;
  for (let x = 1700; x < 3000; x += 23) for (let z = -800; z < 900; z += 23) {
    if (!hillWoods.some(rs => pipw(x, z, rs)) || Math.hypot(x - px, z - pz) < WOODLAND.gorse.inner + 10 || onCliff(scene.terrain, PERTH_LANDUSE.cliffs, x, z) || (sightHeight(scene.terrain, x, z) ?? Infinity) - WOODLAND.sight.clear - scene.terrain.heightAt(x, z) < CANOPY.min + 1) continue;
    inWood++; if (canopy.inCanopy(x, z)) covered++;
  }
  assert.ok(inWood > 500 && covered / inWood > .95, `covered ${covered} of ${inWood} wood points`);
  // mixed size: stands of old and young trees (the crown height's 90th percentile over its 10th)
  const hs = top.map(t => t.h).sort((a, b) => a - b), q10 = hs[Math.floor(hs.length * .1)]!, q90 = hs[Math.floor(hs.length * .9)]!;
  assert.ok(q90 / q10 > 1.5, `canopy height spread: ${(q90 / q10).toFixed(2)}`);
  // mixed tone: pine and birch both present
  const greens = top.map(t => t.g).sort((a, b) => a - b);
  assert.ok(greens[Math.floor(greens.length * .9)]! > 1.35 * greens[Math.floor(greens.length * .1)]!, 'pine and birch tones both present');
  // open westward: no canopy node in the panorama's frame rises above the line from the eye to the town
  const over = top.filter(t => { const s = sightHeight(scene.terrain, t.x, t.z, inIslandBelt(t.x, t.z) ? SIGHT.island : SIGHT.shadow); return s !== undefined && t.y > s - WOODLAND.sight.clear + 1e-3; });
  assert.equal(over.length, 0, `canopy over the summit's westward sightline: ${over.length}`);
  // the summit clearing and the cliff stay open
  assert.equal(top.filter(t => Math.hypot(t.x - px, t.z - pz) < WOODLAND.gorse.inner - CANOPY.step).length, 0, 'the summit clearing is open');
  assert.equal(top.filter(t => onCliff(scene.terrain, PERTH_LANDUSE.cliffs, t.x, t.z)).length, 0, 'no canopy on the cliff');
  // the crowns still placed: none under the canopy, none over the sightline or on the cliff; gorse at the clearing's edge (152)
  const wood = scene.group.getObjectByName('waverley-wood-crowns') as THREE.InstancedMesh;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3();
  const hill: { x: number; z: number; top: number; h: number }[] = [];
  for (let i = 0; i < wood.count; i++) { wood.getMatrixAt(i, m); m.decompose(p, q, k); if (Math.hypot(p.x - px, p.z - pz) <= 900) hill.push({ x: p.x, z: p.z, top: p.y + k.y, h: k.y }); }
  const trees = hill.filter(t => t.h > 1.5), gorse = hill.filter(t => t.h <= 1.5);
  assert.equal(trees.filter(t => canopy.inCanopy(t.x, t.z)).length, 0, 'no separate crowns under the canopy');
  assert.equal(trees.filter(t => { const s = sightHeight(scene.terrain, t.x, t.z); return s !== undefined && t.top > s - WOODLAND.sight.clear + 1e-3; }).length, 0, 'no crown over the sightline');
  const edge = gorse.filter(t => { const d = Math.hypot(t.x - px, t.z - pz); return d >= WOODLAND.gorse.inner - 10 && d <= WOODLAND.gorse.outer + 10; });
  assert.ok(edge.length > 30, `gorse at the summit clearing's edge: ${edge.length}`);
  assert.equal(hill.filter(t => onCliff(scene.terrain, PERTH_LANDUSE.cliffs, t.x, t.z)).length, 0, 'no crowns on the cliff');
  let face = 0; for (let x = 2400; x < 2620; x += 8) for (let z = 260; z < 380; z += 8) if (onCliff(scene.terrain, PERTH_LANDUSE.cliffs, x, z)) face++;
  assert.ok(face > 40, `the cliff below the tower is steep ground by the OSM line: ${face} points`);
  // it frees triangles: the canopy and the remaining crowns cost less than round 2's crowns alone (51,580)
  const tri = (o: THREE.Mesh) => (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
  const crowns = (wood.geometry.index ? wood.geometry.index.count : wood.geometry.getAttribute('position').count) / 3 * wood.count;
  assert.ok(tri(mesh) + crowns < 51_580, `canopy ${tri(mesh)} + crowns ${crowns}`);
  // every Perth wood is canopy, not massed crowns: the town's and riverside woods too (the 9e565a39 Bridgend view had two 8 to 10 m
  // faceted crowns on the island 35 m from its eye)
  let townWood = 0, townCovered = 0;
  for (let x = -1200; x < 1700; x += 17) for (let z = -1200; z < 900; z += 17) if (PERTH_LANDUSE.areas.wood.some(rs => pipw(x, z, rs)) && (sightHeight(scene.terrain, x, z) ?? Infinity) - WOODLAND.sight.clear - scene.terrain.heightAt(x, z) >= CANOPY.min + 1) { townWood++; if (canopy.inCanopy(x, z)) townCovered++; }
  assert.ok(townWood > 200 && townCovered / townWood > .95, `town woods (where the summit's view allows a canopy) covered ${townCovered} of ${townWood}`);
  // the Bridgend island's wood is single round trees with light between (46028), not canopy and not the shared fill's faceted balls
  const belts = islandBeltTrees(scene.terrain, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.areas.water);
  for (const [x, z] of [[920.4, -278.1], [919.6, -291.8]] as const) assert.ok(belts.inBelt(x, z) && !canopy.inCanopy(x, z), `the island wood at ${x}, ${z} is a belt of single trees`);
  const near = belts.trees.filter(t => Math.hypot(t.x - 916, t.z - 310) < 1e9 && t.x > 880 && t.x < 950 && t.z > -370 && t.z < -250);
  assert.ok(near.length >= 8 && near.filter(t => t.height >= 8).length >= .8 * near.length, `Bridgend island trees: ${near.map(t => t.height.toFixed(1))}`);
  const isl = scene.group.getObjectByName('perth-island-trees') as THREE.InstancedMesh;
  const CL = ISLAND_CANOPY.cluster;
  assert.ok(isl && CL.lobes >= 3 && isl.count === belts.trees.length * CL.lobes, 'the island trees are drawn, a cluster of lobes each');
  // clustered, not lollipops (round 5): each tree's lobes overlap one another, set apart, and none is near-black
  {
    const ma = new THREE.Matrix4(), pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3(), pb = new THREE.Vector3(), sb = new THREE.Vector3(), lc = new THREE.Color();
    for (let i = 0; i < belts.trees.length; i++) for (let l = 1; l < CL.lobes; l++) {
      isl.getMatrixAt(i * CL.lobes, ma); ma.decompose(pa, qa, sa); isl.getMatrixAt(i * CL.lobes + l, ma); ma.decompose(pb, qa, sb);
      const d = Math.hypot(pa.x - pb.x, pa.z - pb.z); assert.ok(d > .2 * sa.x && d < sa.x + sb.x, 'lobes set apart yet overlapping');
    }
    // round 6: the floor is in linear light, at least 0.15 (round 5's 0.07, set in sRGB, let a crown go near-black)
    assert.ok(CL.floor >= .15, 'crown floor');
    for (let i = 0; i < isl.count; i++) { isl.getColorAt(i, lc); assert.ok(Math.max(lc.r, lc.g, lc.b) >= CL.floor - 1e-6, 'no near-black crown'); }
    // round 7 (round-6 score: a teal crown): olive, blue at most half of green, red at least 0.5 of it (linear)
    for (let i = 0; i < isl.count; i++) { isl.getColorAt(i, lc); assert.ok(lc.b <= lc.g * .5 + 1e-6 && lc.r >= lc.g * .5 - 1e-6, `olive, not teal: ${lc.r.toFixed(3)} ${lc.g.toFixed(3)} ${lc.b.toFixed(3)}`); }
    // round 8 (round-7 score: the centre crown still teal): every crown's sRGB blue under 0.55 of its green
    for (let i = 0; i < isl.count; i++) { isl.getColorAt(i, lc); const sc = lc.clone().convertLinearToSRGB(); assert.ok(sc.b < sc.g * .55, `olive in sRGB: ${sc.g.toFixed(3)} ${sc.b.toFixed(3)}`); }
    // and outlines not hexagons: lobes turned off upright, and scaled unevenly across x and z
    let tilted = 0, uneven = 0; const mq = new THREE.Matrix4(), pq = new THREE.Vector3(), qq = new THREE.Quaternion(), sq = new THREE.Vector3(), yq = new THREE.Vector3();
    for (let i = 0; i < isl.count; i++) { isl.getMatrixAt(i, mq); mq.decompose(pq, qq, sq); if (yq.set(0, 1, 0).applyQuaternion(qq).y < Math.cos(.1)) tilted++; if (Math.abs(sq.x / sq.z - 1) > .1) uneven++; }
    assert.ok(tilted > isl.count * .5 && uneven > isl.count * .5, `broken outlines: ${tilted} tilted, ${uneven} uneven of ${isl.count}`);
    // soft, not faceted: the lobe's normals lean up towards the sky, so its few facets do not show as dice (every normal faces the sky)
    const nl = isl.geometry.getAttribute('normal'); let low = 1; for (let i = 0; i < nl.count; i++) low = Math.min(low, nl.getY(i));
    assert.ok(low > 0, `soft lobe normals: lowest ${low.toFixed(2)}`);
    // round 10 (round-9 score: still faceted): 7 sides a lobe, not 6. Round 11, declared (ordered: the round-10 score saw no gain,
    // pay the 1,248 triangles back): 6 sides again; the lobe is drawn with CL.sides, pinned at 6 (the cost test holds the budget)
    const sides = (isl.geometry as THREE.SphereGeometry).parameters.widthSegments;
    assert.ok(sides === 6 && sides === CL.sides, `lobe sides: ${sides}`);
  }
  // light between: from the Bridgend eye, rays toward the town over the belt clear its crowns in places
  const bcam = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8'))['pt-tay-from-bridgend'] as { pos: [number, number, number] };
  const beye = new THREE.Vector3(...bcam.pos), br = new THREE.Raycaster(); scene.group.updateMatrixWorld(true);
  let through = 0, rays = 0;
  for (let z = -340; z <= -265; z += 3) for (const y of [-3, -1, 1]) { rays++; br.set(beye, new THREE.Vector3(900, y, z).sub(beye).normalize()); br.far = 80; if (!br.intersectObject(isl, false).length) through++; }
  assert.ok(through > .25 * rays && through < .9 * rays, `rays through the belt: ${through} of ${rays}`);
  let crownsInWood = 0;
  for (let i = 0; i < wood.count; i++) { wood.getMatrixAt(i, m); m.decompose(p, q, k); if (k.y > 1.5 && canopy.inCanopy(p.x, p.z)) crownsInWood++; }
  assert.equal(crownsInWood, 0, `massed crowns left under the canopy anywhere: ${crownsInWood}`);
});

test('Kinnoull\'s cliff is a stepped rock face: risers, joints and scrub ledges shaped over the cliff, not plates (8703; round 5, C1)', () => {
  const steps = kinnoullCrag(scene.terrain, PERTH_LANDUSE.cliffs, CRAG_KEEP, PERTH_DRAPE);
  assert.ok(steps.length > 300, `risers: ${steps.length}`);
  let uphill = 0; const tall: typeof steps = [];
  const lum = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const drawn = (p: readonly number[]) => scene.terrain.heightAt(p[0]!, p[1]!) + PERTH_DRAPE;
  for (const k of steps) {
    // a riser on the cliff: its foot under the drawn ground, its top a vertical step over it, level along the piece
    const mid: [number, number] = [(k.a[0] + k.b[0]) / 2, (k.a[1] + k.b[1]) / 2];
    assert.ok(onCliff(scene.terrain, PERTH_LANDUSE.cliffs, mid[0], mid[1]), 'on the cliff');
    assert.ok(k.foot[0] < drawn(k.a) && k.foot[1] < drawn(k.b), 'its foot in the ground');
    // round 7, declared (ordered: tops shift up to half a band, some risers run through 2-3 courses): a step is under 1.5 bands over
    // the ground, a through-riser under 1.5 bands plus its extra courses (round 6: under 1 band for all)
    const over = k.top - Math.max(drawn(k.a), drawn(k.b)); assert.ok(over > 1.2 && over < CRAG.band * (1.5 + k.courses - 1), `a step, not a plate and not a tower: ${over.toFixed(2)}`);
    // the ledge on top runs back into the slope (uphill; counted below: the terrain's own bumps turn a few)
    const back: [number, number] = [mid[0] + k.up[0] * k.ledge, mid[1] + k.up[1] * k.ledge];
    if (scene.terrain.heightAt(back[0], back[1]) > scene.terrain.heightAt(mid[0], mid[1])) uphill++;
    assert.ok(lum(k.rgb) > .18, `pale rock (linear): ${lum(k.rgb).toFixed(2)}`);
    // round 8: no toe fins: a riser through extra courses is at least CRAG.thruMin (3) m long; a joint is a narrow crack, not its piece
    const len = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    // round 11 (round-10 score: a narrow pale slab stood proud of the face): at least 4.8 m (tightened from 3)
    if (k.courses > 1) assert.ok(len >= 4.8 - 1e-6, `a through-riser at least 4.8 m wide: ${len.toFixed(2)}`);
    // round 9 (round-8 score: the toe fins remained): every riser at most 1.5 times as tall over the ground as its piece is long
    // round 10, declared (ordered: bring the columns back by banning tall risers only at the cliff foot and against the sky): over 1.5
    // times only a through-riser inside the face, at most 3 times; checked below that rock steps lie under it and over its top
    if (over > 1.5 * len + 1e-6) { assert.ok(k.courses > 1 && over <= 3 * len + 1e-6, `no fin: ${over.toFixed(2)} m tall on a ${len.toFixed(2)} m piece`); tall.push(k); }
    if (k.joint) assert.ok(k.crack > 0 && k.crack <= 1.2 && len - k.crack >= .5, `a narrow crack: ${k.crack} of ${len.toFixed(2)}`);
  }
  // round 6: the drape between the courses is repainted rock-grey: the ground under each riser and back along its ledge, in grey tones,
  // and only round the crag (not the grass beside it: a first try painted every cliff cell over 32 deg and greyed the near grass)
  const paint = cliffPaintCells(steps), painted = new Set(paint.map(c => `${c.x},${c.z}`)), cellOf = (x: number, z: number) => `${Math.floor(x / CLIFF_PAINT.cell) * CLIFF_PAINT.cell},${Math.floor(z / CLIFF_PAINT.cell) * CLIFF_PAINT.cell}`;
  const between = steps.filter(k => { const mx = (k.a[0] + k.b[0]) / 2, mz = (k.a[1] + k.b[1]) / 2; return painted.has(cellOf(mx, mz)) && painted.has(cellOf(mx + k.up[0] * k.ledge / 2, mz + k.up[1] * k.ledge / 2)) && painted.has(cellOf(mx + k.up[0] * k.ledge, mz + k.up[1] * k.ledge)); }).length;
  assert.ok(between > steps.length * .98 && CLIFF_PAINT.alpha >= .8, `the drape round the risers is repainted: ${between} of ${steps.length}`);
  assert.ok(paint.every(c => steps.some(k => Math.hypot(k.a[0] - c.x - 2, k.a[1] - c.z - 2) < 12 || Math.hypot(k.b[0] - c.x - 2, k.b[1] - c.z - 2) < 12 + k.ledge)), 'only round the crag');
  for (const c of paint) { const ch = c.tone.slice(4, -1).split(',').map(Number); assert.ok(Math.max(...ch) - Math.min(...ch) < 36, `grey, not brown: ${c.tone}`); }
  // round 6 (restoring round 4's checks, which the round-5 rewrite dropped): dark joints, and mixed sizes
  const rock = steps.filter(k => !k.joint).map(k => lum(k.rgb)).sort((a, b) => a - b), median = rock[Math.floor(rock.length / 2)]!;
  const joints = steps.filter(k => k.joint);
  // round 7, declared (ordered: joints lifted from 0.35 to about 0.55 of their tone, here 0.5, cracks, not black blocks): under 0.7 of the median rock
  // (round 6: under 0.5), and over 0.3 of it (new: not black)
  // round 9, declared (ordered: the crack set back 0.5 m at about 0.3 of its tone, so it reads): the crack under 0.5 of the median rock
  // (round 8: 0.7; tightened), and over 0.15 of it (round 8: 0.3; loosened)
  assert.ok(joints.length > steps.length * .1 && joints.length < steps.length * .35 && joints.every(k => lum(k.crackRgb) < median * .5 && lum(k.crackRgb) > median * .15), `dark joints: ${joints.length} of ${steps.length}`);
  // round 11 (round-10 score: dark, near-black columns; 8703's crag is pale grey with green-brown in its joints): every through-riser
  // at least 0.95 of the median rock's luma and their mean over 1.1 of it; every crack green-brown (green over 1.5 times blue, red over blue)
  { const th = steps.filter(k => k.courses > 1).map(k => lum(k.rgb) / median);
    assert.ok(th.every(v => v >= .95) && th.reduce((s, v) => s + v, 0) / th.length > 1.1, `pale columns: ${Math.min(...th).toFixed(2)} min, ${(th.reduce((s, v) => s + v, 0) / th.length).toFixed(2)} mean`);
    assert.ok(joints.every(k => k.crackRgb[1] > 1.5 * k.crackRgb[2] && k.crackRgb[0] > k.crackRgb[2]), 'green-brown cracks'); }
  // round 8: the cracks are drawn: the crag mesh carries each joint's dark sliver
  { const cm = scene.group.getObjectByName('perth-kinnoull-crag') as THREE.Mesh, cc = cm.geometry.getAttribute('color'), dark = new Set(joints.map(k => k.crackRgb.map(v => v.toFixed(4)).join())); let n = 0;
    for (let i = 0; i < cc.count; i++) if (dark.has([cc.getX(i), cc.getY(i), cc.getZ(i)].map(v => v.toFixed(4)).join())) n++;
    assert.ok(n >= joints.length * 4 * .95, `crack slivers drawn: ${n / 4} of ${joints.length}`);
    // round 9: the crack set back about 0.5 m into the slope (a slot, not paint on the face): its b-end foot vertex lies behind b
    const cp = cm.geometry.getAttribute('position'), keys = new Set<string>();
    for (let i = 0; i < cp.count; i++) keys.add([cp.getX(i), cp.getY(i), cp.getZ(i)].map(v => v.toFixed(2)).join());
    const set = joints.filter(k => CRAG.setback >= .4 && keys.has([k.b[0] + k.up[0] * CRAG.setback, k.foot[1], k.b[1] + k.up[1] * CRAG.setback].map(v => v.toFixed(2)).join())).length;
    assert.ok(set >= joints.length * .95, `cracks set back: ${set} of ${joints.length}`); }
  const rises = steps.map(k => k.top - Math.max(drawn(k.a), drawn(k.b))).sort((a, b) => a - b), lens = steps.map(k => Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1])).sort((a, b) => a - b);
  assert.ok(rises.at(-1)! - rises[0]! > 2.5 && lens[Math.floor(lens.length * .9)]! - lens[Math.floor(lens.length * .1)]! > 1.5, 'mixed sizes');
  // vertical, not coursed (round 7, tightened): most joints have a partner on the next course up or down, within a joint's width along
  // the face (the face's mean direction, worked out here from the steps' own uphill directions)
  let ux = 0, uz = 0; for (const k of steps) { ux += k.up[0]; uz += k.up[1]; }
  const ul = Math.hypot(ux, uz), along = (k: typeof steps[number]) => ((k.a[0] + k.b[0]) / 2) * -uz / ul + ((k.a[1] + k.b[1]) / 2) * ux / ul;
  const stacked = joints.filter(k => joints.some(o => o !== k && Math.abs(along(o) - along(k)) < CRAG.jointWidth && Math.abs(o.top - k.top) > CRAG.band / 2 && Math.abs(o.top - k.top) < CRAG.band * 1.6));
  // round 9, declared: over 55% (round 7-8: 60%); the 1.5 aspect cap leaves out the short fin pieces (2,106 to 1,803 risers), and
  // with them some joints' partners (176 of 303, 58%). Round 10 (round-9 ruling): 60% restored
  assert.ok(stacked.length > joints.length * .6,`joints running up the face: ${stacked.length} of ${joints.length}`);
  // the courses broken (round 7): one-course risers' heights spread over more than half a band (10th to 90th percentile; round 6's
  // spread was under half), and some risers running through 2-3 courses
  const ones = steps.filter(k => k.courses === 1).map(k => k.top - Math.max(drawn(k.a), drawn(k.b))).sort((a, b) => a - b), spread = ones[Math.floor(ones.length * .9)]! - ones[Math.floor(ones.length * .1)]!;
  const thru = steps.filter(k => k.courses > 1).length;
  // round 9, declared (ordered: the aspect cap, 1.5 times the piece's length): a riser through 2-3 courses (8.6 m and more) now needs a
  // piece over 5.7 m long, which few contour pieces are, so the 5-30% through-riser share and the 3-course riser (round 7) are dropped;
  // the column spread stays
  assert.ok(spread > CRAG.band * .5 && thru < steps.length * .3, `courses broken: spread ${spread.toFixed(2)}, ${thru} through-risers of ${steps.length}`);
  // round 10 (round-9 ruling: restore it): round 7's floor again, over 5% of the risers through 2-3 courses, and some through 3
  assert.ok(thru > steps.length * .05 && steps.some(k => k.courses === 3), `columns: ${thru} through-risers of ${steps.length}, ${steps.filter(k => k.courses === 3).length} through 3`);
  // round 10: a riser over the 1.5 cap stands inside the face: a rock step below it (within two cells downhill, its top under this
  // riser's foot course) and one above its top (up its ledge's run and two cells more), so none is a toe fin or a post against the sky
  for (const k of tall) {
    const mx = (k.a[0] + k.b[0]) / 2, mz = (k.a[1] + k.b[1]) / 2, run = k.ledge + 2 * CRAG.grid, mid = (o: typeof k) => [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2] as const;
    const below = steps.some(o => { const [x, z] = mid(o), dx = x - mx, dz = z - mz; return o !== k && Math.hypot(dx, dz) < 2 * CRAG.grid + 1 && dx * k.up[0] + dz * k.up[1] < 0 && o.top < k.top - CRAG.band; });
    const above = steps.some(o => { const [x, z] = mid(o), dx = x - mx, dz = z - mz; return o !== k && Math.hypot(dx, dz) < run && dx * k.up[0] + dz * k.up[1] > 0 && o.top > k.top; });
    assert.ok(below && above, `a tall riser inside the face: below ${below}, above ${above}, at ${mx.toFixed(0)}, ${mz.toFixed(0)}`);
  }
  assert.ok(tall.length > 20, `tall through-risers inside the face: ${tall.length}`);
  // round 9, restored in a form the cap can meet (round-9 score: the dropped share was a deletion): among the pieces long enough to
  // carry a riser through two courses under the cap (over 5.7 m), at least 8 do (9 of 153 then). Round 10 (ordered: raise it to
  // match): at least 14 (16 of 153 now); the 3-course riser is back in round 7's check above
  const long = steps.filter(k => Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]) > 5.7), longThru = long.filter(k => k.courses >= 2).length;
  assert.ok(longThru >= 14,`through-risers on the long pieces: ${longThru} of ${long.length}`);
  // the ledges cover the drape between courses: each runs back until it meets the drawn slope (it ends in the ground, not short of it)
  const meets = steps.filter(k => { const m: [number, number] = [(k.a[0] + k.b[0]) / 2 + k.up[0] * k.ledge, (k.a[1] + k.b[1]) / 2 + k.up[1] * k.ledge]; return drawn(m) >= k.top - .3; });
  assert.ok(meets.length > steps.length * .85, `ledges running back into the slope: ${meets.length} of ${steps.length}`);
  assert.ok(uphill > steps.length * .95, `ledges running back uphill: ${uphill} of ${steps.length}`);
  // a face: risers stack up the cliff at many levels, not scattered plates
  const levels = new Set(steps.map(k => Math.round(k.top / CRAG.band))); assert.ok(levels.size >= 8, `step levels: ${levels.size}`);
  // broken: several rock tones; scrub on a share of the ledges
  assert.ok(new Set(steps.map(k => k.rgb.join())).size >= 4, 'several rock tones');
  const scrub = steps.filter(k => k.scrub).length; assert.ok(scrub > steps.length * .2 && scrub < steps.length * .5, `scrub ledges: ${scrub}`);
  // none stands in front of the cliff camera's eye, filling its frame
  const eye = (JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[] }>)['pt-kinnoull-cliff']!.pos;
  assert.deepEqual([...CLIFF_EYE], eye, 'the crag keeps clear of the frozen camera itself');
  assert.equal(steps.filter(k => [k.a, k.b].some(p => Math.hypot(p[0] - eye[0]!, p[1] - eye[2]!) < 50)).length, 0, 'none near the cliff camera');
  // the tower's foot and annexe stay clear (round 4): no riser within 18 m of the tower
  assert.equal(steps.filter(k => [k.a, k.b].some(p => Math.hypot(p[0] - KINNOULL_TOWER.x, p[1] - KINNOULL_TOWER.z) < 18)).length, 0, 'the tower\'s foot clear');
  const mesh = scene.group.getObjectByName('perth-kinnoull-crag') as THREE.Mesh;
  let city = false; mesh.traverseAncestors(o => { if (o === scene.parts.buildings) city = true; }); assert.ok(city, 'in the city group');
});

test('from the frozen summit eye the Tay and the North Inch are open: no canopy or massed crown stands in front of ground the bare hill leaves in view (round 3 score, C2)', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[] }>;
  const cam = cams['pt-kinnoull-panorama']!, [ex, ey, ez] = cam.pos as [number, number, number], [tx, , tz] = cam.target as [number, number, number];
  const axis = Math.atan2(tz - ez, tx - ex), half = 36 * Math.PI / 180;
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  // the North Inch: the 1.5 km2 park on the Tay's west bank north of the town; the Tay: the mapped water
  const area = (r: readonly (readonly number[])[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! - r[i]![0]!) * (r[j]![1]! + r[i]![1]!); return Math.abs(a / 2); };
  const inch = PERTH_LANDUSE.areas.park.filter(rs => pip(1339, -801, rs[0]!) && area(rs[0]!) > 1e6);
  assert.equal(inch.length, 1, 'the North Inch polygon');
  assert.ok(islandBelts().length >= 5, `small island belts: ${islandBelts().length}`);
  const islandBelt = inIslandBelt;
  const blockers = ['perth-kinnoull-canopy', 'waverley-wood-crowns', 'perth-island-trees'].map(n => scene.group.getObjectByName(n)!).filter(Boolean);
  scene.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), eye = new THREE.Vector3(ex, ey, ez);
  const check = (rings: typeof PERTH_LANDUSE.areas.water, what: string) => {
    let open = 0, blocked = 0, far = 0, islands = 0;
    for (let x = -1200; x < 2624; x += 50) for (let z = -1200; z < 912; z += 50) {
      const b = Math.atan2(z - ez, x - ex) - axis; if (Math.abs(Math.atan2(Math.sin(b), Math.cos(b))) > half) continue;
      if (!rings.some(rs => pip(x, z, rs[0]!))) continue;
      // in view over the bare ground: the eye-to-point line clears the drawn ground all the way
      const y = scene.terrain.heightAt(x, z) + .5, d = Math.hypot(x - ex, z - ez); let clear = true;
      for (let t = 30; t < d - 20 && clear; t += 6) { const f = t / d; if (scene.terrain.heightAt(ex + (x - ex) * f, ez + (z - ez) * f) > ey + (y - ey) * f) clear = false; }
      if (!clear) continue; open++;
      const to = new THREE.Vector3(x, y, z).sub(eye), length = to.length(); ray.set(eye, to.normalize()); ray.far = length - 5;
      const hit = ray.intersectObjects(blockers, false)[0];
      // a canopy may hide only the strip just behind itself (SIGHT.shadow m, plus a lattice step), never ground further off
      // the small islands' tree belts (ISLAND_CANOPY) stand full height in the river and may hide the channel behind them; counted apart
      if (hit && islandBelt(hit.point.x, hit.point.z)) islands++;
      else if (hit) { blocked++; if (Math.hypot(hit.point.x - x, hit.point.z - z) > SIGHT.shadow + CANOPY.step) far++; }
    }
    assert.ok(open > 40 && far === 0 && blocked <= open * .15 && islands <= open * .2, `${what}: ${blocked} of ${open} open points hidden by the canopy, ${far} of them further than ${SIGHT.shadow} m behind it; ${islands} behind island belts`);
  };
  check(PERTH_LANDUSE.areas.water, 'the Tay');
  check(inch, 'the North Inch');
});

test('no canopy or massed crown stands just below the panorama\'s eye in its frame, and the canopy\'s tones are muted (round-4 score, C2/C6)', () => {
  // round 4's "tent": a wood 150 to 180 m below the eye on the frame's left stood above the far town's line
  const canopy = kinnoullCanopy(scene.terrain, PERTH_LANDUSE.areas.wood, PERTH_LANDUSE.cliffs, PERTH_LANDUSE.areas.water);
  const [ex, , ez] = KINNOULL_EYE.pos; let near = 0, open = 0;
  for (let x = ex - CANOPY.eyeClear; x <= ex + CANOPY.eyeClear; x += 6) for (let z = ez - CANOPY.eyeClear; z <= ez + CANOPY.eyeClear; z += 6) {
    if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => inEyeClear(x + i! * CANOPY.step, z + j! * CANOPY.step))) continue; near++; // a lattice step inside the edge
    const top = canopy.topAt(x, z); if (top === undefined || top < scene.terrain.heightAt(x, z) + 1) open++; // the lattice's edge cells tuck under the ground
  }
  assert.ok(near > 500 && open === near, `canopy below the eye in its frame: ${near - open} of ${near} points`);
  assert.ok(inEyeClear(2226, 274), 'the round-4 tent lies in the cleared ground');
  const crowns = scene.group.getObjectByName('waverley-wood-crowns') as THREE.InstancedMesh, m = new THREE.Matrix4(), v = new THREE.Vector3(); let massed = 0;
  // the clearing's gorse (scrub, WOODLAND.gorseRgb) belongs there (152); a wood crown does not
  const gc = new THREE.Color(), gorse = new THREE.Color().setRGB(WOODLAND.gorseRgb[0], WOODLAND.gorseRgb[1], WOODLAND.gorseRgb[2], THREE.SRGBColorSpace);
  for (let i = 0; i < crowns.count; i++) {
    crowns.getMatrixAt(i, m); v.setFromMatrixPosition(m); if (!inEyeClear(v.x, v.z)) continue;
    crowns.getColorAt(i, gc); const k = gc.g / gorse.g; if (!(k > .7 && k < 1.3 && Math.abs(gc.r / gc.g - gorse.r / gorse.g) < .05)) massed++;
  }
  assert.equal(massed, 0, 'no massed wood crown there either');
  // muted: no canopy vertex is strongly saturated (the town woods read garish yellow and orange in pt-overview)
  const col = canopy.geometry!.getAttribute('color'); let hot = 0; const c = new THREE.Color(), hsl = {h: 0, s: 0, l: 0};
  for (let i = 0; i < col.count; i++) { c.setRGB(col.getX(i), col.getY(i), col.getZ(i)); c.getHSL(hsl); if (hsl.s > .5 && hsl.h < .2) hot++; }
  assert.ok(hot < col.count * .02, `saturated yellow-orange canopy vertices: ${hot} of ${col.count}`);
});

test('the summit clearing has its own close ground under the panorama, in a hole in the town-wide drape (152; round 3, C2)', () => {
  const patch = scene.group.getObjectByName('perth-summit-ground') as THREE.Mesh;
  assert.ok(patch, 'the summit patch');
  let city = false; patch.traverseAncestors(o => { if (o === scene.parts.buildings) city = true; }); assert.ok(city, 'in the city group');
  const P = patch.geometry.getAttribute('position'), U = patch.geometry.getAttribute('uv');
  let far = 0; const ups: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]); far = Math.max(far, d);
    const up = P.getY(i) - scene.terrain.heightAt(x, z); ups.push(up); assert.ok(up >= SUMMIT.lift - 1e-3 && up < 2.5, `on the drawn ground, lifted: ${up.toFixed(2)}`);
    assert.ok(U.getX(i) >= 0 && U.getX(i) <= 1 && U.getY(i) >= 0 && U.getY(i) <= 1, 'one canvas over the disc');
  }
  assert.ok(ups.filter(u => u < .5).length > .95 * ups.length, 'seated close: most corners within 0.5 m of the ground');
  assert.ok(far > SUMMIT.hole + SUMMIT.step && far <= SUMMIT.patch + 1e-6, `the patch reaches past the hole: ${far.toFixed(1)}`);
  // no facet dips under the drawn ground (round 3's capture showed the bare ground through the patch's chords on the convex summit)
  const PI = patch.geometry.getIndex()!;
  for (let i = 0; i < PI.count; i += 3) for (const [u, w] of [[1 / 3, 1 / 3], [.5, 0], [0, .5], [.5, .5]] as const) {
    const [a, b, c] = [PI.getX(i), PI.getX(i + 1), PI.getX(i + 2)], s = 1 - u - w;
    const x = P.getX(a) * s + P.getX(b) * u + P.getX(c) * w, z = P.getZ(a) * s + P.getZ(b) * u + P.getZ(c) * w, y = P.getY(a) * s + P.getY(b) * u + P.getY(c) * w;
    assert.ok(y > scene.terrain.heightAt(x, z), `facet over the ground at ${x.toFixed(0)}, ${z.toFixed(0)}: ${(y - scene.terrain.heightAt(x, z)).toFixed(2)}`);
  }
  // the drape leaves the hole: no drape triangle with a corner inside it
  const cover = scene.group.getObjectByName('waverley-ground-cover') as THREE.Mesh, cp = cover.geometry.getAttribute('position'), ci = cover.geometry.getIndex()!;
  let over = 0; for (let i = 0; i < ci.count; i++) if (inSummitHole(scene.terrain, cp.getX(ci.getX(i)), cp.getZ(ci.getX(i)))) over++;
  assert.equal(over, 0, `drape corners in the summit hole: ${over}`);
  // the panorama's eye stands over it, and the patch covers the whole hole: no gap where neither it nor the drape is drawn
  const ray = new THREE.Raycaster(new THREE.Vector3(KINNOULL_EYE.pos[0], 400, KINNOULL_EYE.pos[2]), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(patch).length > 0, 'the patch is under the panorama\'s eye');
  let holes = 0, gaps = 0;
  for (let x = SUMMIT_CENTRE[0] - SUMMIT.hole; x <= SUMMIT_CENTRE[0] + SUMMIT.hole; x += 10) for (let z = SUMMIT_CENTRE[1] - SUMMIT.hole; z <= SUMMIT_CENTRE[1] + SUMMIT.hole; z += 10) {
    if (!inSummitHole(scene.terrain, x, z)) continue; holes++;
    ray.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0)); if (!ray.intersectObject(patch).length) gaps++;
  }
  assert.ok(holes > 500 && gaps === 0, `hole points ${holes}, uncovered ${gaps}`);
  // close grain: the paint is multiplied by a tiling detail map, right after it is sampled, fading out with distance
  const mat = patch.material as THREE.MeshLambertMaterial, shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  const f = shader.fragmentShader, at = f.indexOf('texture2D( uDetail, detailUv )');
  assert.ok(f.indexOf('#include <map_fragment>') >= 0 && at > f.indexOf('#include <map_fragment>') && at < f.indexOf('#include <color_fragment>') && f.includes('uniform sampler2D uDetail;') && f.includes('fwidth( detailUv )'), 'the detail multiplies the paint after it is sampled, with a distance fade');
  assert.equal((shader.uniforms.uDetailRepeat!.value as number), 2 * SUMMIT.patch / SUMMIT.detail.tile, 'one detail tile every SUMMIT.detail.tile m');
  assert.equal(mat.customProgramCacheKey(), 'perth-summit-detail', 'its own program');
  // the path is worn grey-green earth, not salmon (round 3 score): green at least red, red little over blue
  const rgbOf = (c: string) => { const m = c.match(/\d+/g); if (c.startsWith('#')) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; } return m!.slice(0, 3).map(Number); };
  for (const c of [SUMMIT.path.tone, SUMMIT.worn.tone]) { const [r, g, bl] = rgbOf(c) as [number, number, number]; assert.ok(g >= r + 4 && r - bl < 30, `grey-green, not orange or beige: ${c}`); }
  // low gorse bushes near the eye, in the frame, off the paths (152)
  const nearPaths = PERTH_LANDUSE.paths.filter(q => q.line.some(([x, z]) => Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]) < SUMMIT.patch + 20));
  const bushes = summitBushes(scene.terrain, nearPaths), gm = scene.group.getObjectByName('perth-summit-gorse') as THREE.InstancedMesh;
  { const nl = gm.geometry.getAttribute('normal'); let low = 1; for (let i = 0; i < nl.count; i++) low = Math.min(low, nl.getY(i)); assert.ok(low > 0, `soft gorse normals: lowest ${low.toFixed(2)}`); }
  assert.ok(gm && gm.count === bushes.reduce((n, b) => n + b.lobes.length, 0), 'the bushes are drawn, lobe by lobe');
  // shrubby, not boulders (round 5): several overlapping lobes of differing size, spread over the bush; dark olive, a yellow fleck in some
  for (const b of bushes) {
    assert.ok(b.lobes.length >= 3, 'several lobes');
    const rs = b.lobes.map(l => l.r); assert.ok(Math.max(...rs) - Math.min(...rs) > .1 * b.radius, 'lobes of differing size');
    assert.ok(b.lobes.some(l => Math.hypot(l.x - b.x, l.z - b.z) > .3 * b.radius), 'spread, not one mound');
  }
  const lumL = (c: readonly number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const leafy = bushes.flatMap(b => b.lobes).filter(l => !l.bloom);
  // sRGB luma (the colours are set in sRGB). Round 6 raised the ceiling from 0.2 to 0.42; the round-6 score ruled that a weakening.
  // Round 7, per the ruling: under 0.32 (round 6's mean), over 0.2 (round 5's black gorse), and 152's hue: red at least 0.75 of green
  assert.ok(leafy.length > 0 && leafy.every(l => lumL(l.rgb) > .2 && lumL(l.rgb) < .32), 'olive leaves, neither black nor lawn');
  assert.ok(leafy.every(l => l.rgb[0] >= .75 * l.rgb[1]), 'brown-olive, not green: red at least 0.75 of green');
  // round 8 (round-7 score: chocolate): dark olive, blue at least half of green
  assert.ok(leafy.every(l => l.rgb[2] >= .5 * l.rgb[1]), 'olive, not chocolate: blue at least half of green');
  const blooms = bushes.flatMap(b => b.lobes).filter(l => l.bloom);
  // round 8, declared (ordered: flecks at about luma 0.25-0.3, 152's about 0.22): a dull yellow, luma 0.22-0.34 (round 7: 0.36-0.6),
  // mean under 0.32 (round 7: 0.5); red over green and blue under 0.3 of green, so it stays yellow, not leaf
  // round 10, declared (ordered: raise the authored blue until the render gives about 0.15-0.19 of green): sRGB blue under 0.4 of green
  // (round 8-9: 0.3; the bloom's is 0.35); still well under half, so the bloom stays yellow
  assert.ok(blooms.every(l => lumL(l.rgb) > .22 && lumL(l.rgb) < .34 && l.rgb[0] > l.rgb[1] && l.rgb[2] < .4 * l.rgb[1]), 'a dull yellow bloom');
  // round 9 (round-8 score: rust): mustard, blue at least 0.15 of green
  assert.ok(blooms.every(l => l.rgb[2] >= .15 * l.rgb[1]), 'mustard, not rust: blue at least 0.15 of green');
  // round 10 (round-9 ruling: the sRGB floor passed on round 8's rust): the ratio the light acts on, linear blue 0.12-0.2 of linear
  // green (round 9's 0.06 was 0.063, drawn 0.05 of green; 0.11 is 0.149; 0.13, at 0.197, drew 0.23, over 152's 0.19)
  const linC = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  assert.ok(blooms.every(l => linC(l.rgb[2]) >= .12 * linC(l.rgb[1]) && linC(l.rgb[2]) <= .2 * linC(l.rgb[1])), `mustard in linear light: ${blooms.map(l => (linC(l.rgb[2]) / linC(l.rgb[1])).toFixed(3)).slice(0, 3)}`);
  // and the lobes not pyramids: turned off upright, their x/z proportions varied
  { const mq = new THREE.Matrix4(), pq = new THREE.Vector3(), qq = new THREE.Quaternion(), sq = new THREE.Vector3(), yq = new THREE.Vector3(); let tilted = 0; const ratios: number[] = [];
    for (let i = 0; i < gm.count; i++) { gm.getMatrixAt(i, mq); mq.decompose(pq, qq, sq); if (yq.set(0, 1, 0).applyQuaternion(qq).y < Math.cos(.1)) tilted++; ratios.push(sq.x / sq.z); }
    ratios.sort((a, b) => a - b);
    assert.ok(tilted > gm.count * .5 && ratios[Math.floor(ratios.length * .9)]! - ratios[Math.floor(ratios.length * .1)]! > .3, `gorse lobes tilted (${tilted} of ${gm.count}) and unevenly scaled`); }
  assert.ok(blooms.reduce((n, l) => n + lumL(l.rgb), 0) / blooms.length < .32, 'dull on the whole');
  // the bloom crowns its bush: 2-4 flecks, each at most 0.2 of the bush's radius (round 8; round 7: 2-3 at 0.4), over every leaf
  // lobe's top and near the middle
  for (const b of bushes) {
    const fl = b.lobes.filter(l => l.bloom); if (!fl.length) continue;
    assert.ok(fl.length >= 2 && fl.length <= 4, 'two to four flecks');
    for (const f of fl) assert.ok(f.r <= .2 * b.radius && b.lobes.every(l => l.bloom || f.y + f.h > l.y + l.h) && Math.hypot(f.x - b.x, f.z - b.z) < b.radius * .5, 'the bloom crowns the bush, in small flecks');
  }
  assert.ok(bushes.filter(b => b.lobes.some(l => l.bloom)).length >= 3, 'a yellow fleck in some');
  const axisB = Math.atan2(KINNOULL_EYE.target[2] - SUMMIT_CENTRE[1], KINNOULL_EYE.target[0] - SUMMIT_CENTRE[0]);
  const framed = bushes.filter(b => { const a = Math.atan2(b.z - SUMMIT_CENTRE[1], b.x - SUMMIT_CENTRE[0]) - axisB; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < KINNOULL_EYE.halfWidthDeg * Math.PI / 180; });
  assert.ok(bushes.length >= 8 && framed.length >= 5, `bushes ${bushes.length}, in frame ${framed.length}`);
  for (const b of bushes) {
    const d = Math.hypot(b.x - SUMMIT_CENTRE[0], b.z - SUMMIT_CENTRE[1]); assert.ok(d >= SUMMIT.bush.ring[0] && d <= SUMMIT.bush.ring[1] && b.height <= SUMMIT.bush.height[1], 'low and near the eye');
    for (const q of nearPaths) for (let i = 1; i < q.line.length; i++) { const a0 = q.line[i - 1]!, b0 = q.line[i]!, dx = b0[0] - a0[0], dz = b0[1] - a0[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((b.x - a0[0]) * dx + (b.z - a0[1]) * dz) / L)) : 0; assert.ok(Math.hypot(b.x - a0[0] - u * dx, b.z - a0[1] - u * dz) - q.width / 2 >= b.radius, 'off the path'); }
  }
});

test('Kinnoull Tower stands where the LiDAR resolves it, near its OSM outline, in the photographs\' proportion', () => {
  const L = PERTH_LIDAR_LANDMARKS.kinnoullTower, tower = data.buildings.find(b => b.id === L.id)!;
  assert.ok(L.rise < 5, `the OSM outline itself is open ground in the DSM: ${L.rise} m`);
  const cx = tower.outer.reduce((a, p) => a + p[0], 0) / tower.outer.length, cz = tower.outer.reduce((a, p) => a + p[1], 0) / tower.outer.length;
  assert.ok(Math.hypot(KINNOULL_TOWER.x - cx, KINNOULL_TOWER.z - cz) < 15, 'the LiDAR tower within 15 m of the mapped outline');
  assert.equal(KINNOULL_TOWER.height, L.near!.rise, 'the drawn height is the DSM rise, not an assumption');
  const ratio = KINNOULL_TOWER.height / (2 * KINNOULL_TOWER.radius);
  assert.ok(ratio > 1.8 && ratio < 3.2, `height over width as 8703 and 4307 show it (about 2.5): ${ratio.toFixed(2)}`);
  // the tower's base is the cliff top, not the face below it
  assert.ok(Math.abs(scene.terrain.heightAt(KINNOULL_TOWER.x, KINNOULL_TOWER.z) - scene.terrain.heightAt(cx, cz)) < 8, 'on the cliff top');
});

test('Kinnoull Tower is pale coursed stone with red string courses, a cornice and its lower annexe (8703, 4307; round 3, C1)', () => {
  const b = new Batch({ colored: true }), base = 100, { top, annexeTop } = kinnoullTower(b, base), g = b.build();
  const P = g.getAttribute('position'), U = g.getAttribute('uv'), C = g.getAttribute('color');
  // the stone map is laid in metres: the shaft's UVs span its height and girth, not all one texel (round 2's near-black tower)
  let vMax = 0, uMax = 0; for (let i = 0; i < U.count; i++) { vMax = Math.max(vMax, U.getY(i)); uMax = Math.max(uMax, U.getX(i)); }
  assert.ok(vMax > top - 1 && uMax > 2 * Math.PI * KINNOULL_TOWER.radius * .9, `UVs: u to ${uMax.toFixed(1)}, v to ${vMax.toFixed(1)}`);
  // pale overall, with red courses at the band heights
  const lum = (i: number) => .2126 * C.getX(i) + .7152 * C.getY(i) + .0722 * C.getZ(i);
  // linear vertex colours: pale stone is over .45 in luminance (the near-black round-2 tower was the ashlar map's mean under its tint, about .2)
  let pale = 0, red = 0; for (let i = 0; i < C.count; i++) { if (lum(i) > .45) pale++; if (C.getX(i) > C.getY(i) + .15) red++; }
  assert.ok(pale > C.count / 2 && red > 0, `pale ${pale}, red ${red} of ${C.count}`);
  for (const share of TOWER_LOOK.bands) { let at = false; for (let i = 0; i < P.count; i++) if (C.getX(i) > C.getY(i) + .15 && Math.abs(P.getY(i) - (base + KINNOULL_TOWER.height * share)) < 1e-3) at = true; assert.ok(at, `a red course at ${share}`); }
  // the annexe: masonry beside the shaft, up to about half its height, on its north side
  let annexe = 0; for (let i = 0; i < P.count; i++) if (P.getZ(i) < KINNOULL_TOWER.z - KINNOULL_TOWER.radius - 1 && Math.abs(P.getY(i) - annexeTop) < 1e-3) annexe++;
  assert.ok(annexe >= 4 && annexeTop < base + KINNOULL_TOWER.height * .6, `annexe corners at its top: ${annexe}`);
  assert.equal(top, base + KINNOULL_TOWER.height, 'the drawn top is the LiDAR rise');
});

test('the east patch meets the main terrain without a seam, over the covered corridor only, falling away at its outer edges', () => {
  const mesh = scene.group.getObjectByName('perth-east-ground') as THREE.Mesh;
  assert.ok(mesh, 'the east patch is drawn, in the city group');
  let inCity = false; mesh.traverseAncestors(a => { if (a === scene.parts.buildings) inCity = true; }); assert.ok(inCity, 'in the city group');
  const E = PERTH_EAST_FILE.extent;
  assert.deepEqual([E.x0, E.z0, E.x1, E.z1], [PERTH_CITY_EXTENT.x1, 80, 4128, 1232], 'from the main edge east, the Phase I corridor only');
  const zMain = PERTH_CITY_EXTENT.z1;
  assert.deepEqual(scene.terrainMore, [E], 'the scene hands the patch to the world, which carves its flat plane there too');
  // the data agree at the seam: the patch's own 32 m nodes on x 2624 against the main terrain's field there (same tile, same reference)
  for (let z = E.z0; z <= zMain; z += 32) assert.ok(Math.abs(PERTH_EAST.heightAt(E.x0, z) - scene.terrain.heightAt(E.x0, z)) < .75, `data seam at z ${z}: ${PERTH_EAST.heightAt(E.x0, z)} vs ${scene.terrain.heightAt(E.x0, z)}`);
  // the drawn seam is watertight: every patch vertex on x 2624 inside the corridor is the drawn main ground there, at every 16 m
  const pos = mesh.geometry.getAttribute('position'); let seam = 0;
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getX(v) - E.x0) > 1e-6 || pos.getZ(v) < E.z0 - 1e-6 || pos.getZ(v) > zMain + 1e-6) continue; seam++;
    assert.ok(Math.abs(pos.getY(v) - scene.terrain.heightAt(E.x0, pos.getZ(v))) < 1e-3, `drawn seam at z ${pos.getZ(v)}`);
  }
  assert.equal(seam, (zMain - E.z0) / 16 + 1, 'a seam vertex every 16 m along the main terrain');
  // no hard wall and no ruled edge (round 3, C3): the skirt runs out EAST_SKIRT.out m to just under the world's flat plane; round 4 (the
  // plane still showed as a grey band at the cliff view's horizon): out at least 5 km, into the haze, ending in a hazed field tone, not grey
  assert.ok(EAST_SKIRT.out >= 5000, 'the apron runs out into the haze');
  const ends = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace), grey = new THREE.Color().setHex(GROUND_COLOUR, THREE.SRGBColorSpace);
  assert.ok(ends.g > ends.r * 1.05 && ends.g > ends.b * 1.05 && Math.abs(ends.g - grey.g) > .02, 'the apron ends green-grey, not the plane\'s grey');
  const col = mesh.geometry.getAttribute('color'), plane = ends; let apron = 0;
  for (let v = 0; v < pos.count; v++) {
    const out = pos.getZ(v) < E.z0 - 1 || pos.getZ(v) > E.z1 + 1 || pos.getX(v) > E.x1 + 1; if (!out) continue; apron++;
    assert.ok(pos.getZ(v) <= E.z0 - EAST_SKIRT.out + 1e-6 || pos.getZ(v) >= E.z1 + EAST_SKIRT.out - 1e-6 || pos.getX(v) >= E.x1 + EAST_SKIRT.out - 1e-6, 'the apron runs out its full width');
    assert.ok(pos.getY(v) <= EAST_SKIRT.to + 1e-6 && EAST_SKIRT.to < GROUND_Y, 'the apron ends under the flat plane');
    assert.ok(Math.abs(col.getX(v) - plane.r) < 1e-3 && Math.abs(col.getY(v) - plane.g) < 1e-3 && Math.abs(col.getZ(v) - plane.b) < 1e-3, 'the apron ends in its hazed tone');
  }
  assert.ok(apron > 100, `apron vertices: ${apron}`);
  // round 5 (the plane still showed at the panorama's horizon and the overview's corners): the main terrain's west, north and south
  // edges run out in the same apron, over the plane near the edge and fading into the hazed tone under it far off
  const main = scene.group.getObjectByName('perth-main-apron') as THREE.Mesh, M = PERTH_CITY_EXTENT, down = new THREE.Raycaster();
  assert.ok(main, 'the main apron is drawn');
  // round 6 (the cliff view's grey strip on the right horizon): also past the east patch's east and south edges and their corner
  const EE = PERTH_EAST_FILE.extent;
  for (const [x, z] of [[M.x0 - 400, (M.z0 + M.z1) / 2], [(M.x0 + M.x1) / 2, M.z0 - 400], [(M.x0 + M.x1) / 2, M.z1 + 400], [M.x0 - 300, M.z0 - 300], [M.x0 - 300, M.z1 + 300],
    [EE.x1 + 400, (EE.z0 + EE.z1) / 2], [(EE.x0 + EE.x1) / 2, EE.z1 + 400], [EE.x1 + 300, EE.z1 + 300]] as const) {
    down.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const h = down.intersectObject(main, false)[0];
    assert.ok(h && h.point.y > GROUND_Y && h.face!.normal.y > 0, `the apron covers the plane at ${x}, ${z}: ${h?.point.y} ${h?.face?.normal.y} ground ${GROUND_Y}`);
  }
  const mp = main.geometry.getAttribute('position'), mc = main.geometry.getAttribute('color'); let far = 0;
  for (let v = 0; v < mp.count; v++) {
    const out = Math.max(M.x0 - mp.getX(v), M.z0 - mp.getZ(v), mp.getZ(v) - M.z1); if (out < EAST_SKIRT.out - 1) continue; far++;
    assert.ok(mp.getY(v) <= EAST_SKIRT.to + 1e-6 && Math.abs(mc.getY(v) - ends.g) < 1e-3, 'it ends under the plane in the hazed tone');
  }
  assert.ok(far > 100, `main apron outer vertices: ${far}`);
});

test('the land past the terrain fades into the haze with depth, and the Tay fades out at the patch\'s east edge (155; round 10, C6/C3)', () => {
  // the apron and the east patch (Perth's own materials) mix to the fog colour from LAND_HAZE.from to .to m of view depth: past the
  // town (2.4 km from the summit, untouched) and inside the camera's 9 km far plane, so the land has gone into the haze before it is cut off
  assert.ok(LAND_HAZE.from >= 2400 && LAND_HAZE.to <= 9000 && LAND_HAZE.to - LAND_HAZE.from >= 3000, `land haze ${LAND_HAZE.from}-${LAND_HAZE.to}`);
  for (const name of ['perth-main-apron', 'perth-east-ground']) {
    const m = (scene.group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const shader = {fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    const f = shader.fragmentShader, at = f.indexOf(`smoothstep(${LAND_HAZE.from.toFixed(1)}, ${LAND_HAZE.to.toFixed(1)}, vFogDepth)`);
    assert.ok(at > f.indexOf('#include <fog_fragment>') && f.slice(at - 80, at).includes('mix(gl_FragColor.rgb, fogColor'), `${name} fades into the haze`);
    assert.ok(m.customProgramCacheKey().includes('perth-land-haze'), `${name}: its own program`);
  }
  // the river's end: its sheet runs out by the patch's east edge, and there takes the skirt's hazed field tone, smoothly back to the
  // water's own tone RIVER_END.run m in; the rest of the river (most of it) keeps its tone
  const E = PERTH_EAST_FILE.extent, water = scene.group.getObjectByName('perth-east-water') as THREE.Mesh, P = water.geometry.getAttribute('position'), C = water.geometry.getAttribute('color');
  const field = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace), tay = new THREE.Color().setHex(WATER.colour, THREE.SRGBColorSpace);
  let edge = 0, inner = 0;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), d = E.x1 - x, c = [C.getX(i), C.getY(i), C.getZ(i)], f = riverEnd(x);
    if (d < 1) { edge++; assert.ok(Math.abs(c[0]! - field.r) < 1e-3 && Math.abs(c[2]! - field.b) < 1e-3, `the river's end in the field tone at x ${x}`); }
    if (d >= RIVER_END.run) { inner++; assert.ok(f === 0 && Math.abs(c[0]! - tay.r) < 1e-3 && Math.abs(c[2]! - tay.b) < 1e-3, 'the river in its own tone'); }
    else assert.ok(Math.abs(c[0]! - (tay.r + (field.r - tay.r) * f)) < 1e-3, 'faded smoothly');
  }
  assert.ok(edge >= 2 && inner > P.count * .6, `river vertices at the east edge ${edge}, in its own tone ${inner} of ${P.count}`);
});

test('the land past the terrain is a patchwork of fields, greens and fawns, not one olive (155; round 11, C6/C2)', () => {
  // the shader's fields, sampled over the apron south-west of the summit (2.5-5 km off, the panorama's plain): every tone, none
  // dominant, and neighbouring fields mostly differ
  const counts = new Array(LAND_FIELDS.tones.length).fill(0); let pairs = 0, differ = 0;
  for (let x = -2000; x < 1000; x += 37) for (let z = 1000; z < 4000; z += 41) { counts[landField(x, z)]++; pairs++; if (landField(x, z) !== landField(x + LAND_FIELDS.size[0], z)) differ++; }
  assert.ok(counts.every(c => c > pairs * .08 && c < pairs * .3), `field tones: ${counts}`);
  assert.ok(differ > pairs * .6, `neighbouring fields differ: ${differ} of ${pairs}`);
  // greens and fawns: at least two tones lift green over the base, and one is a fawn (red lifted most)
  const T = LAND_FIELDS.tones;
  assert.ok(T.filter(t => t[1] >= 1.05).length >= 2 && T.some(t => t[0] > t[1] && t[0] > 1.2), 'greens and a fawn');
  assert.ok(LAND_FIELDS.size.every(v => v >= 100 && v <= 400), 'fields 100-400 m, as farmland');
  // round 12 (round-11 score: an equal-rectangle checkerboard, hard near the eye, a yellow fawn, no hedgerows): field lengths vary
  // (over 1.8 times from shortest to longest over the plain), dark hedgerows along the boundaries (4-15% of the plain), the near
  // contrast at most 0.6 of the far, and no tone over 1.3 times the base in any channel
  const lens = new Set<number>(), hedges = { n: 0, of: 0 };
  for (let x = -2000; x < 1000; x += 37) for (let z = 1000; z < 4000; z += 41) { lens.add(Math.round(landFieldLength(x, z))); hedges.of++; if (landHedge(x, z)) hedges.n++; }
  assert.ok(Math.max(...lens) > 1.8 * Math.min(...lens) && lens.size > 10, `field lengths: ${Math.min(...lens)}-${Math.max(...lens)}, ${lens.size} distinct`);
  assert.ok(hedges.n > hedges.of * .015 && hedges.n < hedges.of * .15, `hedgerows: ${hedges.n} of ${hedges.of}`); // round 13: floor 4% -> 1.5% (DECLARED: broken, narrower hedgerows)
  // round 13 (round-12 score: ruled lines): broken, about `hedgeKeep` of the boundary stretches carry one, lighter than round 12
  { let keep = 0, of = 0; for (let k = 0; k < 2000; k++) { of++; if (((s: number) => s - Math.floor(s))(Math.sin(k * 17.3 + 3 * 5.1) * 43758.5453) < LAND_FIELDS.hedgeKeep) keep++; }
    assert.ok(LAND_FIELDS.hedgeKeep >= .4 && LAND_FIELDS.hedgeKeep <= .8 && keep > of * .35 && keep < of * .85 && LAND_FIELDS.hedgeMix <= .5, `broken hedgerows: ${keep} of ${of} stretches`); }
  assert.ok(LAND_FIELDS.hedgeTone.every(v => v < .6) && LAND_FIELDS.hedgeTone[1] > LAND_FIELDS.hedgeTone[0] && LAND_FIELDS.hedgeTone[1] > LAND_FIELDS.hedgeTone[2], 'hedgerows dark green');
  assert.ok(fieldContrast(2000) <= .6 && fieldContrast(5000) === 1 && T.every(t => t.every(v => v <= 1.3)), `near contrast ${fieldContrast(2000)}`);
  // drawn in the apron's and the east skirt's shaders (the east patch itself is left alone), after the vertex colour
  for (const [name, box] of [['perth-main-apron', false], ['perth-east-ground', true]] as const) {
    const m = (scene.group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const shader = {fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    const f = shader.fragmentShader;
    assert.ok(f.indexOf('diffuseColor.rgb *= k;') > f.indexOf('#include <color_fragment>') && shader.vertexShader.includes('vFieldPos = (modelMatrix'), `${name}: fields`);
    assert.ok(f.includes(`vec3(${LAND_FIELDS.hedgeTone.map(v => v.toFixed(4)).join(', ')})`) && f.includes('fwidth(u + v)') && shader.vertexShader.includes('vFieldDepth = -mvPosition.z;'), `${name}: hedgerows and near contrast`);
    const E = PERTH_EAST_FILE.extent;
    assert.equal(f.includes(`vFieldPos.x > ${E.x0.toFixed(4)} && vFieldPos.x < ${E.x1.toFixed(4)}`), box, `${name}: the patch itself ${box ? 'left alone' : '-'}`);
  }
});

test('the east patch\'s Tay is one continuous river sheet, with trees along its banks (2166751, 46028; round 3, C3)', () => {
  const water = scene.group.getObjectByName('perth-east-water') as THREE.Mesh, trees = scene.group.getObjectByName('perth-east-bank-trees') as THREE.InstancedMesh;
  assert.ok(water && trees, 'the river sheet and the bank trees');
  // one connected sheet: union the triangles' vertices, and the largest component holds nearly all the sheet's area
  const idx = water.geometry.getIndex()!, P = water.geometry.getAttribute('position'), parent = [...Array(P.count).keys()];
  const find = (a: number): number => parent[a] === a ? a : (parent[a] = find(parent[a]!));
  for (let i = 0; i < idx.count; i += 3) { const a = find(idx.getX(i)), b = find(idx.getX(i + 1)), c = find(idx.getX(i + 2)); parent[b] = a; parent[c] = a; }
  const area = new Map<number, number>(); let total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)], ar = Math.abs((P.getX(b) - P.getX(a)) * (P.getZ(c) - P.getZ(a)) - (P.getX(c) - P.getX(a)) * (P.getZ(b) - P.getZ(a))) / 2;
    total += ar; area.set(find(a), (area.get(find(a)) ?? 0) + ar);
  }
  const big = Math.max(...area.values());
  assert.ok(total > 2e5 && big / total > .9, `the largest sheet holds ${(100 * big / total).toFixed(1)}% of ${total.toFixed(0)} m²`);
  // the sheet lies on or over the ground everywhere
  for (let i = 0; i < P.count; i++) assert.ok(P.getY(i) >= PERTH_EAST.heightAt(P.getX(i), P.getZ(i)) + .1, 'the sheet is over the ground');
  // bank trees: many, each standing on land within a lattice step of the wet nodes
  const wet = eastWater(), G = PERTH_EAST_FILE.grids[0]!, m = new THREE.Matrix4(), v = new THREE.Vector3();
  assert.ok(trees.count > 150, `bank trees: ${trees.count}`);
  for (let k = 0; k < trees.count; k++) {
    trees.getMatrixAt(k, m); v.setFromMatrixPosition(m);
    let near = false; for (let j = 0; j < G.nz && !near; j++) for (let i = 0; i < G.nx; i++) if (wet[j * G.nx + i] && Math.hypot(G.x0 + i * G.step - v.x, G.z0 + j * G.step - v.z) < 2 * G.step) { near = true; break; }
    assert.ok(near, `tree ${k} by the river`);
  }
});

test('the Tay\'s shore is shingle, not a dark band, and its water carries a wash in metres (round 2, C3)', () => {
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
  const sheet = lum(`#${WATER.colour.toString(16).padStart(6, '0')}`), grass = lum(GROUND_COLOURS.grass), shore = lum(SHORE.shore);
  // the bank inside the river outline shows above the sheet: its paint sits between the grass and the water, not far below both
  assert.ok(shore >= Math.min(grass, sheet) - .02 && shore <= Math.max(grass, sheet) + .02, `shore ${shore.toFixed(3)} against grass ${grass.toFixed(3)}, water ${sheet.toFixed(3)}`);
  assert.ok(shore - lum(GROUND_COLOURS.water) > .12, 'lighter than the old water paint that read as a dark band');
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh, pos = water.geometry.getAttribute('position'), uv = water.geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 97) assert.ok(Math.abs(uv.getX(i) - pos.getX(i)) < 1e-3 && Math.abs(uv.getY(i) - pos.getZ(i)) < 1e-3, 'the wash is placed in plan metres');
});

test('the Tay\'s tone is graded with distance: darker near the eye, the full pale tone far off (46028; round 10, C3)', () => {
  // 46028: the near reach about [40, 56, 85], the far one about [117, 136, 155] (sRGB); the grade takes part of that, in the same direction
  assert.ok(waterGrade(10) <= .7 && waterGrade(10) >= .5, `near: ${waterGrade(10)}`);
  assert.equal(waterGrade(WATER_GRADE.to), 1); assert.equal(waterGrade(1500), 1, 'the summit\'s view of the river is unchanged');
  for (let d = 0; d < 800; d += 25) assert.ok(waterGrade(d + 25) >= waterGrade(d), 'it rises with distance');
  // both sheets carry it: the shader multiplies the diffuse colour by the same formula
  for (const name of ['perth-tay-water', 'perth-east-water']) {
    const m = (scene.group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshPhongMaterial;
    const shader = {fragmentShader: THREE.ShaderLib.phong.fragmentShader, vertexShader: THREE.ShaderLib.phong.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    const at = shader.fragmentShader.indexOf('smoothstep(30.0000, 700.0000, length(vViewPosition))');
    assert.ok(at > shader.fragmentShader.indexOf('#include <map_fragment>') && shader.fragmentShader.includes(`mix(${WATER_GRADE.near.toFixed(4)}, 1.0,`), `${name} graded`);
    assert.ok(m.customProgramCacheKey().includes('perth-water-grade'), `${name}: its own program`);
  }
});

test('the shore is broken along the water\'s edge: grass tongues across it, dry shingle, silt and a wet margin, not one band (round 10, C3)', () => {
  const rise = shoreRise(scene.terrain), all = shoreBreak(rise), E = PERTH_LANDUSE.extent;
  // the cached river level (6 m lattice) is the builder's own: at the patches about Bridgend, nearly all within 5 cm of the exact one
  { const level = waterLevel(scene.terrain), ps = all.filter(p => Math.hypot(p.x - 954, p.z + 300) < 400), ok = ps.filter(p => Math.abs(rise(p.x, p.z) - (scene.terrain.heightAt(p.x, p.z) - level(p.x, p.z) - WATER.lift)) < .05).length;
    assert.ok(ok >= ps.length * .95, `cached level within 5 cm: ${ok} of ${ps.length}`); }
  // the OSM water edges (less the extent's clip), to measure each patch against
  const edges: [number, number, number, number][] = [];
  for (const rings of PERTH_LANDUSE.areas.water) for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!; if (Math.max(a[0], b[0]) >= E.x0 && Math.min(a[0], b[0]) <= E.x1 && Math.max(a[1], b[1]) >= E.z0 && Math.min(a[1], b[1]) <= E.z1) edges.push([a[0], a[1], b[0], b[1]]); }
  const edgeDist = (x: number, z: number) => Math.min(...edges.map(([ax, az, bx, bz]) => segDist(x, z, [[ax, az], [bx, bz]])));
  // Bridgend's near shore (pt-tay-from-bridgend stands at 954, -300): many patches, in all four kinds
  const near = all.filter(p => Math.hypot(p.x - 954, p.z + 300) < 120);
  const kinds = new Set(near.map(p => p.kind));
  assert.ok(near.length >= 100 && kinds.size === 4, `Bridgend's shore patches: ${near.length}, kinds ${[...kinds]}`);
  for (const k of ['grass', 'dry', 'silt', 'wet'] as const) assert.ok(near.filter(p => p.kind === k).length >= 10, `${k} patches at Bridgend: ${near.filter(p => p.kind === k).length}`);
  // every patch lies along a mapped edge; a grass tongue crosses it (the grass line wanders), the shingle shows above the sheet
  for (const p of near) {
    const d = edgeDist(p.x, p.z);
    assert.ok(d <= SHORE_BREAK.reach + .1, `a patch ${d.toFixed(1)} m from the edge`);
    if (p.kind === 'grass') assert.ok(p.r > d, `a grass tongue across the edge: r ${p.r.toFixed(1)}, ${d.toFixed(1)} m in`);
    else assert.ok(rise(p.x, p.z) >= SHORE_BREAK.under, 'shingle where the bank shows');
    if (p.kind === 'wet') assert.ok(rise(p.x, p.z) < SHORE_BREAK.wetRise, 'the wet margin at the waterline');
    if (p.kind === 'dry' || p.kind === 'silt') assert.ok(rise(p.x, p.z) >= SHORE_BREAK.wetRise, 'dry shingle and silt above it');
  }
  // the tones differ: the band is not one tone (luma spread over the four, sRGB)
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
  const ls = Object.values(SHORE_BREAK.tones).map(lum);
  assert.ok(Math.max(...ls) - Math.min(...ls) > .15 && SHORE_BREAK.tones.grass === GROUND_COLOURS.grass, `shore tones: ${ls.map(v => v.toFixed(2))}`);
  // round 11: the far bank and the island's edges (120-400 m from the Bridgend eye) carry large patches, 4.5-9 m, that read there:
  // grass and shingle both, and the large grass reaching from the edge down to the water
  const far = all.filter(p => p.large && Math.hypot(p.x - 954, p.z + 300) >= 120 && Math.hypot(p.x - 954, p.z + 300) < 400);
  const farGrass = far.filter(p => p.kind === 'grass'), farShingle = far.filter(p => p.kind !== 'grass');
  assert.ok(farGrass.length >= 40 && farShingle.length >= 30 && far.every(p => p.r >= SHORE_BREAK.large.r[0] - 1e-9), `far bank patches: ${farGrass.length} grass, ${farShingle.length} shingle`);
  const wets = farGrass.filter(p => Array.from({length: 12}, (_, k) => k * Math.PI / 6).some(a => rise(p.x + Math.cos(a) * p.r * .9, p.z + Math.sin(a) * p.r * .9) < .1));
  assert.ok(wets.length >= farGrass.length * .8, `large grass meeting the water: ${wets.length} of ${farGrass.length}`);
});

test('the waterline is softened: the bank just above the water is painted in the water\'s tone, fading with height (round 11, C3)', () => {
  const rise = shoreRise(scene.terrain), cells = shoreSheen(rise), W = SHORE_SHEEN;
  // the sheet's own hue, darkened as the grade darkens the sheet near the eye (0.7-0.85 of each channel, sRGB)
  const tc = [1, 2, 3].map(i => parseInt(W.tone.slice(2 * i - 1, 2 * i + 1), 16)), wc = [WATER.colour >> 16, WATER.colour >> 8 & 255, WATER.colour & 255];
  assert.ok(tc.every((v, i) => v >= .7 * wc[i]! && v <= .85 * wc[i]!), `the sheet's tone, darkened: ${W.tone}`);
  const near = cells.filter(c => Math.hypot(c.x - 954, c.z + 300) < 400);
  assert.ok(near.length > 1000, `sheen cells about Bridgend: ${near.length}`);
  for (const c of near) { const up = rise(c.x, c.z); assert.ok(up >= -1e-9 && up < W.band && c.a <= W.alpha * (1 - up / W.band) + 1e-9 && c.a >= W.alpha * (1 - up / W.band) * (1 - W.break) - 1e-9, `sheen at ${up.toFixed(2)} m: ${c.a.toFixed(2)}`); }
  // strongest at the water, gone by the band's top, and broken along the bank (not one even stripe)
  const low = near.filter(c => rise(c.x, c.z) < W.band / 3), high = near.filter(c => rise(c.x, c.z) > 2 * W.band / 3), mean = (cs: typeof near) => cs.reduce((s, c) => s + c.a, 0) / cs.length;
  assert.ok(low.length > 100 && high.length > 100 && mean(low) > 2 * mean(high), `sheen ${mean(low).toFixed(2)} low, ${mean(high).toFixed(2)} high`);
  const as = low.map(c => c.a), sd = Math.sqrt(as.reduce((s, a) => s + (a - mean(low)) ** 2, 0) / as.length);
  assert.ok(sd > .08, `broken sheen: sd ${sd.toFixed(3)}`);
});

test('the Tay mirrors what is drawn round it: the far bank, the town, the island\'s trees and the viaduct, softly (46028; round 15, C3)', () => {
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh, m = water.material as THREE.MeshPhongMaterial;
  const map = buildTayMirror(scene.group, water, PERTH_LANDUSE.extent, (x, z) => scene.terrain.heightAt(x, z) + PERTH_DRAPE);
  // two data textures, inside the 2048 px cap, over both Tay views; no triangles, no draws (the cost test counts the city group)
  assert.ok(map.cols <= 2048 && map.rows <= 2048 && map.heights.length === map.cols * map.rows * 4 && map.classes.length === map.heights.length, `${map.cols} x ${map.rows}`);
  for (const [x, z] of [[954, -300], [1078, 120], [700, -200]]) assert.ok(x > map.x0 && x < map.x0 + map.cols * map.texel && z > map.z0 && z < map.z0 + map.rows * map.texel, `the map covers ${x}, ${z}`);
  // the scene's sheet carries it: the march after the grade, on the sheet's own (Perth-frame) position and the eye in the same frame
  const shader = {fragmentShader: THREE.ShaderLib.phong.fragmentShader, vertexShader: THREE.ShaderLib.phong.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  const fs = shader.fragmentShader, u = shader.uniforms as Record<string, {value: THREE.DataTexture}>;
  assert.ok(fs.indexOf('perthMirrorAt(vMirrorPos, vMirrorEye)') > fs.indexOf('length(vViewPosition)'), 'mirrored after the grade');
  assert.ok(shader.vertexShader.includes('vMirrorEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz'), 'the eye in the sheet\'s frame');
  assert.ok(fs.includes(`n < ${TAY_MIRROR.steps}`) && fs.includes(`D >= ${TAY_MIRROR.fade[1].toFixed(5)}`), 'the shader marches as TAY_MIRROR says');
  assert.equal(u.perthMirror!.value.image.width, map.cols); assert.equal(u.perthMirror!.value.magFilter, THREE.LinearFilter); assert.equal(u.perthMirrorClass!.value.magFilter, THREE.NearestFilter);
  assert.ok(m.customProgramCacheKey().includes('perth-water-grade') && m.customProgramCacheKey().includes('-mirror-'), 'its own program');
  // the sheet's height under a point, and the run of water along a line from an eye
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const sheetAt = (x: number, z: number): number | null => { ray.set(new THREE.Vector3(x, 50, z), down); const h = ray.intersectObject(water, false)[0]; return h ? h.point.y : null; };
  const along = (eye: readonly number[], to: readonly number[], d: number): [number, number, number] | null => { const dx = to[0]! - eye[0]!, dz = to[2]! - eye[2]!, L = Math.hypot(dx, dz), x = eye[0]! + dx / L * d, z = eye[2]! + dz / L * d, y = sheetAt(x, z); return y === null ? null : [x, y, z]; };
  // Bridgend (pt-tay-from-bridgend): the near channel, the island, the main channel to the far bank
  const BE = [954, -1.52, -300] as const, BT = [0, 8, -80] as const, runs: [number, number][] = [];
  for (let d = 0, open = -1; d <= 260; d += 1) { const w = along(BE, BT, d) !== null; if (w && open < 0) open = d; if (!w && open >= 0) { runs.push([open, d - 1]); open = -1; } }
  assert.ok(runs.length >= 2 && runs[1]![1] - runs[1]![0] > 60, `the near channel and the main channel: ${JSON.stringify(runs)}`);
  const near = runs[0]!, main = runs[1]!, kinds = (cs: ReturnType<typeof mirrorAt>[]) => new Set(cs.map(c => c.kind));
  // the main channel mirrors the far bank and the town, over five lines of sight across the frame (one alone may look down a street
  // between the blocks); the near channel the island's bank and trees
  const mainHits = [-160, -80, 0, 80, 160].flatMap(o => {
    const to = [BT[0] + o * .225, BT[1], BT[2] + o * .974] as const, wet: number[] = [];
    for (let d = main[0] - 20; d <= main[1] + 20; d++) if (along(BE, to, d) !== null && d > near[1] + 10) wet.push(d);
    return Array.from({length: 8}, (_, i) => mirrorAt(map, along(BE, to, wet[Math.floor((i + .5) / 8 * wet.length)]!)!, BE));
  });
  const nearHits = Array.from({length: 8}, (_, i) => mirrorAt(map, along(BE, BT, near[0] + (near[1] - near[0]) * (i + .5) / 8)!, BE));
  assert.ok(mainHits.filter(h => h.cover > .5).length >= .7 * mainHits.length && [...kinds(mainHits)].some(k => k === 'stone' || k === 'bank' || k === 'tree' || k === 'roof'), `main channel: ${mainHits.map(h => h.kind + ' ' + h.cover.toFixed(2)).join(', ')}`);
  assert.ok(nearHits.filter(h => h.cover > .5 && (h.kind === 'tree' || h.kind === 'bank')).length >= 6, `near channel: ${nearHits.map(h => h.kind + ' ' + h.cover.toFixed(2)).join(', ')}`);
  // and the mirror is stronger far out than near the eye (Fresnel), but never takes the near channel's water away (round 13's loss):
  // there the sheet's graded tone, leaning to the mirrored one, still reads as water by round 13's own test (sRGB: blue over red + 15,
  // blue at least green)
  const meanW = (hs: ReturnType<typeof mirrorAt>[]) => hs.reduce((a, h) => a + h.weight, 0) / hs.length;
  assert.ok(meanW(mainHits) > .4 && meanW(mainHits) > 1.5 * meanW(nearHits), `weights: main ${meanW(mainHits).toFixed(2)}, near ${meanW(nearHits).toFixed(2)}`);
  const sheetTone = new THREE.Color(WATER.colour);
  nearHits.forEach((h, i) => {
    const d = near[0] + (near[1] - near[0]) * (i + .5) / 8, g = waterGrade(d);
    const c = new THREE.Color(sheetTone.r * g * (1 - h.weight) + h.tone[0] * h.weight, sheetTone.g * g * (1 - h.weight) + h.tone[1] * h.weight, sheetTone.b * g * (1 - h.weight) + h.tone[2] * h.weight);
    const [r, gr, b] = c.getStyle().match(/\d+/g)!.map(Number) as [number, number, number];
    assert.ok(b > r + 15 && b >= gr, `the near channel stays water at ${d.toFixed(0)} m: [${r}, ${gr}, ${b}] (weight ${h.weight.toFixed(2)})`);
  });
  // the viaduct (pt-tay-viaduct): water just in front of a girder pier mirrors its stone; further out the deck's paint, between the piers
  const VE = [1078, -1.16, 120] as const, lay = tayViaduct(new Batch(), new Batch(), scene.terrain);
  // (piers out in open water: the drape lies under the sheet from the pier back towards the eye)
  const frontOf = (c: {p: readonly number[]; diameter: number}) => along(VE, [c.p[0]!, 0, c.p[1]!], Math.hypot(c.p[0]! - VE[0], c.p[1]! - VE[2]) - c.diameter / 2 - 3);
  const piers = lay.columns.filter(c => {
    const f = frontOf(c); if (!f || Math.hypot(c.p[0] - VE[0], c.p[1] - VE[2]) > 300) return false;
    return [0, 1, 2, 3].every(t => scene.terrain.heightAt(f[0] + (c.p[0] - f[0]) * t / 3, f[2] + (c.p[1] - f[2]) * t / 3) + PERTH_DRAPE < f[1] - .3);
  });
  assert.ok(piers.length >= 3, `piers out in the water: ${piers.length}`);
  for (const c of piers) {
    const h = mirrorAt(map, frontOf(c)!, VE); assert.ok(h.kind === 'masonry' && h.cover > .5, `in front of the pier at ${c.p.map(v => v.toFixed(0))}: ${h.kind} ${h.cover.toFixed(2)}`);
  }
  const [a, b] = [piers[0]!, piers[1]!], mid: [number, number] = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], dm = Math.hypot(mid[0] - VE[0], mid[1] - VE[2]);
  const deck = Array.from({length: 40}, (_, i) => along(VE, [mid[0], 0, mid[1]], dm * (i + 1) / 41)).filter(p => p !== null).map(p => mirrorAt(map, p!, VE));
  assert.ok(deck.some(h => h.kind === 'paint' && h.cover > .3), `the deck's paint in the water between the piers: ${deck.map(h => h.kind).join(' ')}`);
  // soft, not stepped: the bilinear heights change smoothly across a cell edge
  const h0 = mirrorHeights(map, 100.49, 200.5), h1 = mirrorHeights(map, 100.51, 200.5);
  assert.ok(Math.abs(h1 - h0) < .2 * TAY_MIRROR.unit * 255 / 50, `smooth across the cell edge: ${h0.toFixed(2)} ${h1.toFixed(2)}`);
  // the summit and the landing view see the river 1.4 km and more off: the mirror is gone there, so C2's Tay is unchanged
  const pos = water.geometry.getAttribute('position');
  for (const eye of [[2368, 212.7, 208], [101.91, 551.52, 514.8]] as const) for (let i = 0; i < pos.count; i++) {
    const p: [number, number, number] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    if (Math.hypot(p[0] - eye[0], p[2] - eye[2]) >= 1000) assert.equal(mirrorAt(map, p, eye).weight, 0);
  }
  assert.equal(mirrorWeight(.05, TAY_MIRROR.fade[1]), 0); assert.ok(mirrorWeight(.05, 100) > .6 * TAY_MIRROR.strength);
  // every class the map holds has a tone, and the water's own hue is kept (the tone leans, it does not replace)
  assert.ok(TAY_MIRROR.strength < .8 && MIRROR_CLASSES.slice(1).every(c => typeof (TAY_MIRROR.tones as Record<string, string>)[c] === 'string'));
});

test('the Tay\'s mirrored edges run straight down the water, not in stairs (round 15, C3; lead review of the first prediction)', () => {
  // the mirror's cover over Bridgend's near channel as pt-tay-from-bridgend frames it (1280 x 800, fov 50), every pixel of a 640 px
  // wide band: an edge of a mirrored tree or bank keeps its column from row to row, as a reflected vertical edge must
  const water = scene.group.getObjectByName('perth-tay-water') as THREE.Mesh;
  const map = buildTayMirror(scene.group, water, PERTH_LANDUSE.extent, (x, z) => scene.terrain.heightAt(x, z) + PERTH_DRAPE);
  const eye = [954, -1.52, -300] as const, cam = new THREE.PerspectiveCamera(50, 1280 / 800, .5, 5000);
  cam.position.set(...eye); cam.lookAt(0, 8, -80); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const ray = new THREE.Raycaster(), X0 = 200, X1 = 840, rows: number[][] = [];
  for (let y = 575; y < 690; y += 1) {
    const row: number[] = [];
    for (let x = X0; x < X1; x++) {
      ray.setFromCamera(new THREE.Vector2((x + .5) / 1280 * 2 - 1, 1 - (y + .5) / 800 * 2), cam);
      const h = ray.intersectObject(water, false)[0];
      row.push(h ? mirrorAt(map, [h.point.x, h.point.y, h.point.z], eye).cover : NaN);
    }
    rows.push(row);
  }
  // the edges in each row (cover changing by over 0.15 between neighbours, the local peak), matched to the nearest edge in the next row
  const edges = rows.map(r => r.flatMap((c, i) => { const d = Math.abs((r[i + 1] ?? c) - c), l = Math.abs(c - (r[i - 1] ?? c)), n = Math.abs((r[i + 2] ?? c) - (r[i + 1] ?? c)); return d > .15 && d >= l && d >= n ? [i] : []; }));
  const shifts: number[] = [];
  for (let y = 0; y + 1 < edges.length; y++) for (const x of edges[y]!) { const m = edges[y + 1]!.reduce((b, e) => Math.abs(e - x) < Math.abs(b - x) ? e : b, Infinity); if (Math.abs(m - x) <= 8) shifts.push(Math.abs(m - x)); }
  const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length, moving = shifts.filter(d => d >= 2).length / shifts.length;
  assert.ok(shifts.length > 200, `edges traced down the near channel: ${shifts.length}`);
  assert.ok(mean < .5 && moving < .1, `edge shift row to row: mean ${mean.toFixed(2)} px, ${(100 * moving).toFixed(0)}% move 2 px or more`);
});

test('Perth\'s residential land is painted as gardens, darker and broken, not park lawn (round 2, C6)', () => {
  assert.equal(PERTH_RESIDENTIAL.length, 51, 'the 51 OSM landuse=residential polygons');
  const g = perthGardens(), lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
  assert.ok(g.plots.length > 500, `plots: ${g.plots.length}`);
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  for (const p of g.plots.filter((_, i) => i % 23 === 0)) assert.ok(PERTH_RESIDENTIAL.some(rs => pip(p.x + p.w / 2, p.z + p.d / 2, rs[0]!)), 'each plot is in residential land');
  // broken: no one tone covers most of it, and several show
  const share = new Map<string, number>(); for (const p of g.plots) share.set(p.tone, (share.get(p.tone) ?? 0) + 1);
  assert.ok(share.size >= 4, `tones: ${share.size}`);
  assert.ok(Math.max(...share.values()) / g.plots.length < .5, 'no tone over half the plots');
  // darker than the park paint it replaces, with hedges and tree crowns darker still
  const mean = g.plots.reduce((a, p) => a + lum(p.tone), 0) / g.plots.length;
  assert.ok(mean < lum(GROUND_COLOURS.park) - .02, `gardens ${mean.toFixed(3)} against park ${lum(GROUND_COLOURS.park).toFixed(3)}`);
  assert.ok(lum(GARDENS.hedgeTone) < mean && lum(GARDENS.crownTone) < mean, 'hedges and crowns darker than the plots');
  assert.ok(g.crowns.length > g.plots.length / 3, `tree-dotted: ${g.crowns.length} crowns`);
});

test('Perth\'s garden plots run with their streets in varied sizes, and the town centre\'s bare paving is broken into yards (round 3, C6)', () => {
  const g = perthGardens(), quarter = Math.PI / 2;
  const off = (a: number, b: number) => { const d = Math.abs(((a - b) % quarter + quarter) % quarter); return Math.min(d, quarter - d); };
  // aligned: a plot within 15 m of a street lies within 12 degrees (modulo a right angle) of that street, for most plots
  const check = (rects: readonly GardenRect[], what: string) => {
    let near = 0, along = 0;
    for (const r of rects) {
      const cx = r.x + r.w / 2, cz = r.z + r.d / 2, segs = streetsNear(cx, cz, 15); if (!segs.length) continue; near++;
      const [a, b] = segs.sort((p, q) => segDist(cx, cz, p) - segDist(cx, cz, q))[0]!;
      if (off(r.rot ?? 0, Math.atan2(b[1] - a[1], b[0] - a[0])) < 12 * Math.PI / 180) along++;
    }
    assert.ok(near > 200 && along / near > .7, `${what} along their streets: ${along} of ${near}`);
  };
  check(g.plots, 'plots');
  // varied: widths and depths spread over several metres, not one size
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  assert.ok(spread(g.plots.map(p => p.w)) > 10 && spread(g.plots.map(p => p.d)) > 12 && new Set(g.plots.map(p => Math.round(p.w))).size >= 8, 'varied plot sizes');
  // the town centre: patches outside the residential land, several tones with none over half, street-aligned
  const patches = g.patches ?? [];
  assert.ok(patches.length > 2000, `town patches: ${patches.length}`);
  const pip = (x: number, z: number, p: readonly (readonly number[])[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1]! > z) !== (p[j]![1]! > z) && x < (p[j]![0]! - p[i]![0]!) * (z - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) yes = !yes; return yes; };
  for (const r of patches.filter((_, i) => i % 41 === 0)) assert.ok(!PERTH_RESIDENTIAL.some(rs => pip(r.x + r.w / 2, r.z + r.d / 2, rs[0]!) && !rs.slice(1).some(h => pip(r.x + r.w / 2, r.z + r.d / 2, h))), 'patches stay off the gardens');
  const share = new Map<string, number>(); for (const r of patches) share.set(r.tone, (share.get(r.tone) ?? 0) + 1);
  assert.ok(share.size >= 5 && Math.max(...share.values()) / patches.length < .4, `patch tones: ${[...share.values()]}`);
  check(patches, 'patches');
});

test('Perth\'s stone tints are grey-buff: cooler than round 1\'s buff-brown, still a touch warmer than Edinburgh\'s (round 2, C5)', () => {
  const cool = (c: number) => (c & 255) / (c >> 16); // blue over red: the tint's coolness over the warm facade textures
  assert.ok(cool(PERTH_CITY_STONE) >= 1.1, `stone ${cool(PERTH_CITY_STONE).toFixed(3)}`);
  assert.ok(cool(PERTH_CITY_ASHLAR) >= 1.18, `ashlar ${cool(PERTH_CITY_ASHLAR).toFixed(3)}`);
  assert.ok(cool(PERTH_CITY_STONE) < cool(WAVERLEY_CITY_STONE) && cool(PERTH_CITY_ASHLAR) < cool(WAVERLEY_CITY_ASHLAR), 'warmer than Edinburgh\'s');
});

test('P3 cost: the city stays inside its caps over its phase-1 blockout (84,441 triangles in 2 meshes)', () => {
  // measured on the city group alone (parts.buildings), so the station and frontage elements' own growth does not count against P3:
  // the blockout city on main at a3244d8e, before this branch, was 84,441 triangles in 2 meshes
  let triangles = 0, draws = 0;
  scene.parts.buildings.traverse(o => { if (!(o instanceof THREE.Mesh)) return; const g = o.geometry, n = (g.index ? g.index.count : g.getAttribute('position').count) / 3; triangles += o instanceof THREE.InstancedMesh ? o.count * n : n; draws++; });
  assert.ok(triangles - 84_441 <= 320_000, `triangles +${triangles - 84_441}`);
  assert.ok(draws - 2 <= 24, `draws +${draws - 2}`);
  const hidden = buildPerthScene({ lighting: false, cityVisible: false });
  try { for (const name of ['perth-tay-water', 'perth-viaduct-iron', 'perth-city-roofs', 'perth-kirk-spire']) { let shown = false; hidden.group.getObjectByName(name)!.traverseAncestors(a => { if (a === hidden.parts.buildings) shown = a.visible; }); assert.equal(shown, false, `${name} hides with the city`); } }
  finally { hidden.dispose(); }
});

test('Perth\'s haze: Waverley\'s near the ground, its own clear air from the hill; thicker weather keeps its own', () => {
  const far = (visibility: number, y: number, haze: Haze = PERTH_HAZE) => fogFar(clearAir(fogRange(visibility, y), visibility, haze).far, y, haze);
  assert.equal(far(30_000, 2), WAVERLEY_HAZE.far, 'the river banks: the Scottish haze');
  assert.equal(far(30_000, 400), PERTH_CLEAR_AIR, 'above the haze: Perth\'s own clear air, not the page\'s 2.6 km');
  // round 9 (Arthur's leave; 155: the town 2.4 km off keeps its colour, the hills about 20 km off go blue): Perth's own values pinned,
  // and from the summit eye the town is under a fifth hazed (linear fog from CLEAR_FOG.near), the hills past 15 km gone to haze
  assert.equal(PERTH_CLEAR_AIR, 24_000, 'Perth\'s clear air');
  assert.ok(PERTH_HAZE.far === WAVERLEY_HAZE.far && PERTH_HAZE.fade === WAVERLEY_HAZE.fade, 'Waverley\'s haze near the ground and its fade');
  const kinnoull = far(30_000, 212.7), cliff = far(30_000, 172.2), hazed = (d: number, f: number) => (d - CLEAR_FOG.near) / (f - CLEAR_FOG.near);
  assert.ok(hazed(2400, kinnoull) < .2 && hazed(20_000, kinnoull) >= 1, `the town at 2.4 km ${hazed(2400, kinnoull).toFixed(2)} hazed, the hills at 20 km lost`);
  assert.ok(kinnoull > 14_000 && kinnoull < PERTH_CLEAR_AIR && cliff > 8000, `the summit's far plane ${kinnoull}, the cliff's ${cliff}`);
  // Waverley's haze is untouched (lead's ruling: only Perth's value changes)
  assert.deepEqual(WAVERLEY_HAZE, { far: 2200, fade: [100, 300] }, 'Waverley\'s haze unchanged');
  assert.equal(far(3000, 212.7), far(3000, 212.7, WAVERLEY_HAZE), 'mist keeps its own range');
  // round 9, declared: the bound scales with the eased span (round 8: under 700 m a 500 m step, for a 4.4 km span from 2.6 to 7 km;
  // the same 16% of the span, now 21.4 km). The same smoothness, not a looser one.
  let last = far(9000, 400); for (let v = 9500; v <= 21_000; v += 500) { const f = far(v, 400); assert.ok(f >= last && f - last < .16 * (PERTH_CLEAR_AIR - CLEAR_FOG.far), `no step at ${v} m`); last = f; }
  assert.equal(far(30_000, 400, WAVERLEY_HAZE), CLEAR_FOG.far, 'Waverley unchanged');
});

test('the town reads through the haze from the summit: a dark lead spire, darker roofs and bridge stone (round 8, C2)', () => {
  // round 7 score: from the summit the town was a flat, hazy band, no spire or bridge reading. The fog is shared; Perth's own materials
  // carry the contrast instead
  const lin = (c: THREE.Color) => .2126 * c.r + .7152 * c.g + .0722 * c.b;
  const spire = scene.group.getObjectByName('perth-kirk-spire') as THREE.Mesh;
  const roofs = scene.group.getObjectByName(PERTH_CITY_MESHES.tops) as THREE.Mesh, slate = (material('slate') as THREE.MeshLambertMaterial).color.clone().multiply(new THREE.Color(0xada99f));
  // round 9 (round-8 score: the 'under 0.06' spire sank into the roofs; replaces that check): the spire lighter than the roofs round it,
  // at least 3 times their tint (the roofs' slate map, which node does not build, only darkens them further; the spire has no map)
  const sp = lin((spire.material as THREE.MeshLambertMaterial).color), rf = lin((roofs.material as THREE.MeshLambertMaterial).color);
  assert.ok(!(spire.material as THREE.MeshLambertMaterial).map && sp > rf * 3, `the spire against the roofs: ${sp.toFixed(3)} vs ${rf.toFixed(3)}`);
  // round 14 graft of round 13 variant (c), DECLARED (round-12 score's ruling: the roofs may be lifted to the photographs' value,
  // under its four conditions; round-13 score accepted 1.6): the ceiling 0.8 -> 1.6 of the shared slate's tint; and a new floor on
  // roof/wall contrast, the roofs' tint at most 0.35 of the walls' (PERTH_CITY_STONE), so they stay clearly darker than the facades.
  // The spire >= 3x check above is unchanged (the spire is lifted instead)
  assert.ok(lin((roofs.material as THREE.MeshLambertMaterial).color) <= lin(slate) * 1.6 + 1e-9, 'the roofs no lighter than 1.6 of the shared slate\'s tint');
  assert.ok(rf <= .35 * lin(new THREE.Color(PERTH_CITY_STONE)), `roofs against walls: ${rf.toFixed(3)} vs ${lin(new THREE.Color(PERTH_CITY_STONE)).toFixed(3)}`);
  assert.ok(lin((material('slate') as THREE.MeshLambertMaterial).color) > lin((roofs.material as THREE.MeshLambertMaterial).color), 'the shared slate itself untouched');
  const masonry = scene.group.getObjectByName('perth-city-masonry') as THREE.Mesh, col = masonry.geometry.getAttribute('color'); let bridge = 0;
  for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - TOWN_LOOK.bridges) < 1e-4 && Math.abs(col.getZ(i) - TOWN_LOOK.bridges) < 1e-4) bridge++;
  assert.ok(TOWN_LOOK.bridges <= .75 && bridge > 500, `the road bridges in darker stone: ${bridge} vertices`);
});

test('the roofscape varies roof to roof: dark and pale slate, blue-grey and brown-grey, a few warm clay roofs (R-pt3-d; round 12, C5)', () => {
  const roofs = scene.group.getObjectByName(PERTH_CITY_MESHES.tops) as THREE.Mesh, c = roofs.geometry.getAttribute('color');
  const tones = new Map<string, number>(), L: number[] = []; let warm = 0;
  for (let i = 0; i < c.count; i += 3) {
    const r = c.getX(i), g = c.getY(i), b = c.getZ(i); L.push(.2126 * r + .7152 * g + .0722 * b);
    const k = `${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}`; tones.set(k, (tones.get(k) ?? 0) + 1); if (r > 1.25 * b) warm++;
  }
  L.sort((a, b) => a - b); const q = (f: number) => L[Math.floor(f * (L.length - 1))]!;
  assert.ok(tones.size >= 8 && q(.9) > 1.5 * q(.1), `roof tones: ${tones.size}, luma q10 ${q(.1).toFixed(2)}, q90 ${q(.9).toFixed(2)}`);
  // no one tone is most of the town, and the warm clay roofs are a few, not many
  assert.ok(Math.max(...tones.values()) < L.length * .35, `the commonest tone: ${Math.max(...tones.values())} of ${L.length}`);
  assert.ok(warm > L.length * .03 && warm < L.length * .25, `warm roofs: ${warm} of ${L.length}`);
  // every tone in PERTH_ROOF_TONES is used
  assert.equal(new Set(Array.from({length: 13}, (_, k) => perthRoofTone(.82 + k * .02))).size, PERTH_ROOF_TONES.length, 'every roof tone used');
});
