// P1 station (perth-station.ts, perth-station-structure.ts): the roof's footprint, the island building's trace, the footbridges and the
// clearances the rubric (gfx-rubrics/perth-station.md) asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { buildPerthScene, stationOutline } from '../src/perth-scene.ts';
import { perthBoardTexture, perthDialTexture, perthMeshTexture, perthPiercedTexture, perthRingTexture, PERTH_BOARDS, PERTH_FENCE_MESH, PERTH_RING_ORNAMENT, PERTH_ROMAN, PERTH_BAND_BROWN, PERTH_BAND_SOFFIT, PERTH_GREY_PLATFORMS, PERTH_OPEN_ASPHALT, PERTH_OPEN_GREY, PERTH_SURFACE_TILE } from '../src/perth-station.ts';
import { archRib, boardedSide, clockCorbel, PERTH_CLOCK_CORBEL, PERTH_DIAL,gutterBraces, PERTH_GUTTER_BRACE, PERTH_RAMP_RAIL, PERTH_LIFT_DOOR, PERTH_RAMP, PERTH_RAMP_FENCE, mainRoofEnds, PERTH_ROOF_ENDS, islandBuildingBatches, PERTH_BOARDED_PLATFORM, PERTH_SPANDREL, PERTH_PAINT, platformParts, perthRoofOver, PERTH_BAND_DROP, PERTH_BAY_NOTCH, PERTH_BAY_ROOF, PERTH_CANOPY_SPLIT, PERTH_ISLAND_BUILDING, PERTH_ROOF_RIDGE, PERTH_SHED_NORTH, PERTH_STATION, bayRoofHeight, inRing, perthRoofRings, perthStationBatches, perthStationPlan, ringDistance, toLocal, toWorld } from '../src/perth-station-structure.ts';
import { Batch, rgb } from '../src/materials.ts';
import { WAVERLEY_LEVELS, cleanRing } from '../src/waverley-mesh.ts';
import { WAVERLEY_EDGE_BANDS, WAVERLEY_STRUCTURE } from '../src/waverley-station-structure.ts';
import { roofHeight, WAVERLEY_ROOF_PROFILE, WAVERLEY_ROOF_STRIP_LIFT } from '../src/waverley-roof.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const outline = stationOutline(data)!.outer;
const plan = perthStationPlan(data, outline);
const batches = perthStationBatches(plan);
const rails: [Pt, Pt][] = data.rails.flatMap(r => r.path.slice(1).map((p, i): [Pt, Pt] => [r.path[i], p]))
  .filter(([a, b]) => [a, b].some(p => p[0] > -260 && p[0] < 140 && p[1] > -420 && p[1] < 220));
const segDist = (p: Pt, a: Pt, b: Pt): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const railDistance = (p: Pt): number => Math.min(...rails.map(([a, b]) => segDist(p, a, b)));
const onPlatform = (p: Pt): boolean => data.platforms.some(q => inRing(p, cleanRing(q.path)));

test('the track frame is a rotation: local and back is the identity', () => {
  for (const p of [[10, -20], [-150, 30], [0, 0]] as Pt[]) { const q = toWorld(toLocal(p)); assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9); }
});

test('the roof is the OSM station outline: the bay notch closed (proposed), the Dundee canopies split off, nothing else added', () => {
  const ring = cleanRing(outline), near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < .2;
  for (const p of [...PERTH_BAY_NOTCH, ...PERTH_CANOPY_SPLIT]) assert.ok(ring.some(q => near(p, q)), `outline corner ${p}`);
  const {roof, canopy} = perthRoofRings(outline);
  assert.equal(roof.length + canopy.length - 2, ring.length - PERTH_BAY_NOTCH.length, 'every other outline corner is in exactly one ring');
  // Every glazed vertex is inside the outline, or inside the closed bay notch, within 5 cm.
  const notch = PERTH_BAY_NOTCH as Pt[], g = batches.glass.positions;
  for (let i = 0; i < g.length; i += 3) {
    const p: Pt = [g[i], g[i + 2]];
    assert.ok(inRing(p, ring) || inRing(p, notch) || ringDistance(p, ring) < .05 || ringDistance(p, notch) < .05, `glazing at ${p} outside the station outline`);
  }
});

test('the island building is the gap OSM leaves between platforms 4, 5 and 7: every corner a mapped vertex, none on a track', () => {
  const vertices = [...data.platforms.flatMap(p => p.path), ...outline];
  for (const p of PERTH_ISLAND_BUILDING) assert.ok(vertices.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .2), `corner ${p} is an OSM vertex`);
  // As drawn, it stops at the shed line (lead ruling 12:21): each corner is a traced one, or on the shed line, and none lies north of it.
  for (const p of plan.island) {
    const x = toLocal(p)[0];
    assert.ok(x >= PERTH_SHED_NORTH - 1e-6, `corner ${p} south of the shed line`);
    assert.ok(Math.abs(x - PERTH_SHED_NORTH) < 1e-6 || PERTH_ISLAND_BUILDING.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .2), `corner ${p} traced or on the shed line`);
    assert.ok(railDistance(p) > 2.5, `corner ${p} clear of the tracks`);
  }
  // Tite's block (lead ruling 12:24): on platform 3's east side, clear of every track and of every footbridge deck, stair and tower.
  assert.ok(plan.tite, 'Tite block drawn');
  for (const p of plan.tite!.ring) assert.ok(railDistance(p) > 2.5, `Tite corner ${p} clear of the tracks`);
  const tl = plan.local.tite, [tx0, tx1] = [Math.min(...tl.map(p => p[0])), Math.max(...tl.map(p => p[0]))], [tz0, tz1] = [Math.min(...tl.map(p => p[1])), Math.max(...tl.map(p => p[1]))];
  for (const r of plan.clear) assert.ok(r[1] < tx0 || r[0] > tx1 || r[3] < tz0 || r[2] > tz1, `bridge footprint ${r} clear of the Tite block`);
  for (const p of plan.roof) assert.ok(toLocal(p)[0] >= PERTH_SHED_NORTH - 1e-6, `roof corner ${p} stops at the shed line`);
});

test('two footbridges: the north lattice bridge to platforms 4, 3 and 1, the south lift bridge to 4/5, 2/3 and 1, each deck over the trains and the canopy', () => {
  assert.deepEqual(plan.bridges.map(b => b.id), ['north', 'south']);
  assert.deepEqual(plan.bridges[0].landings.map(l => l.refs.join('/')), ['4', '3', '1']);
  assert.deepEqual(plan.bridges[1].landings.map(l => l.refs.join('/')), ['4/5', '2/3', '1']);
  assert.equal(plan.bridges[1].landings.filter(l => l.tower).length, 3, 'a lift tower on each of the three islands (R-pt1-d Abbott, R-pt1-b)');
  assert.ok(plan.bridges[1].landings.filter(l => l.side !== undefined).length >= 2, 'the lift bridge\'s stairs are dog-legs where the island takes one');
  assert.ok(plan.bridges[0].landings.every(l => l.side === undefined), 'the lattice bridge\'s are straight flights');
  for (const b of plan.bridges) {
    const underside = b.deck - (b.kind === 'lattice' ? .5 : 1);
    assert.ok(underside > 4.8 && underside > PERTH_STATION.canopy.top + .3, `${b.id} deck underside ${underside}`);
  }
});

test('clearances: columns, posts, stairs and towers stand on platforms, clear of every track; nothing low stands over a track', () => {
  const S = plan.structure, w = (p: Pt) => toWorld(p);
  const points: [string, Pt, number][] = [
    ...S.columns.map((c): [string, Pt, number] => [`column ${c.ref}`, w([c.x, c.z]), 1.6 + .33]),
    ...plan.canopyColumns.map((c): [string, Pt, number] => ['canopy column', w(c), 1.6 + .1]),
    ...plan.bridges.flatMap(b => b.posts.map((p): [string, Pt, number] => [`${b.id} post`, w(p), 1.6 + .15])),
    ...plan.bridges.flatMap(b => b.landings.flatMap(l => {
      const [x0, x1, z0, z1] = l.stair, n: Pt = [-l.dir[1], l.dir[0]], h = PERTH_STATION.stair.width / 2;
      const ends = [l.start, [l.start[0] + l.dir[0] * l.length, l.start[1] + l.dir[1] * l.length] as Pt];
      void x0; void x1; void z0; void z1;
      const corners = ends.flatMap(e => [[e[0] + n[0] * h, e[1] + n[1] * h], [e[0] - n[0] * h, e[1] - n[1] * h]] as Pt[]);
      const tower = l.tower ? [-1, 1].flatMap(a => [-1, 1].map(c => [l.tower!.c[0] + a * 1.6 * l.tower!.dir[0] - c * 1.6 * l.tower!.dir[1], l.tower!.c[1] + a * 1.6 * l.tower!.dir[1] + c * 1.6 * l.tower!.dir[0]] as Pt)) : [];
      return [...corners, ...tower].map((p): [string, Pt, number] => [`${b.id} stair/tower ${l.refs.join('/')}`, w(p), 1.6]);
    })),
  ];
  assert.ok(S.columns.length > 30 && plan.canopyColumns.length > 5, `${S.columns.length} columns, ${plan.canopyColumns.length} canopy columns`);
  for (const [what, p, clear] of points) {
    assert.ok(onPlatform(p), `${what} at ${p.map(v => v.toFixed(1))} on a platform`);
    assert.ok(railDistance(p) >= clear, `${what} at ${p.map(v => v.toFixed(1))} is ${railDistance(p).toFixed(2)} m from a track`);
  }
  // Everything this element draws below the 4.8 m train envelope stands 1.6 m or more from every track's centreline.
  for (const [name, b] of [['ironwork', batches.ironwork], ['fittings', batches.fittings]] as const) {
    const pos = b.positions;
    for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] < 4.8 && pos[i + 1] > .05) {
      const p: Pt = [pos[i], pos[i + 2]], d = railDistance(p);
      assert.ok(d >= 1.6, `${name} vertex at ${p.map(v => v.toFixed(1))}, y ${pos[i + 1].toFixed(2)}, is ${d.toFixed(2)} m from a track`);
    }
  }
});

test('the roof toggle hides the whole station roof: glazing, strips and ironwork are in the roof part, the bridges are not', () => {
  const scene = buildPerthScene({ lighting: false });
  try {
    for (const name of ['perth-station-roof', 'perth-roof-strips', 'perth-roof-ironwork', 'perth-roof-weathering']) assert.equal(scene.group.getObjectByName(name)?.parent, scene.parts.roof, name);
    for (const name of ['perth-island-building', 'perth-columns-bridges-furniture']) assert.equal(scene.group.getObjectByName(name)?.parent, scene.parts.platforms, name);
    const ironwork = scene.group.getObjectByName('perth-roof-ironwork') as THREE.Mesh; ironwork.geometry.computeBoundingBox();
    assert.ok(ironwork.geometry.boundingBox!.min.y > 4.8, 'the roof ironwork stays over the train envelope');
    // Round 3: the weathered skin is opaque and one-sided, so from above it hides the panes whatever the transparent sort does, and from
    // below (its back faces) it is culled.
    const skin = (scene.group.getObjectByName('perth-roof-weathering') as THREE.Mesh).material as THREE.Material;
    assert.ok(!skin.transparent && skin.depthWrite && skin.side === THREE.FrontSide, 'the roof\'s weathered skin is opaque and front-sided');
    assert.ok(skin.polygonOffset && skin.polygonOffsetUnits < 0, 'the skin is pulled toward the eye in depth steps, so it beats the panes under it at any range');
  } finally { scene.dispose(); }
});

test('round 3: the roof\'s solid bands have undersides hung under the glazing, so from below the milky panes do not wash them pale', () => {
  // Every furrow band of the main roof stands WAVERLEY_ROOF_STRIP_LIFT over the gutter line; its underside hangs PERTH_BAND_DROP under it.
  // (Round 7: the undersides are their own batch, `soffits`, drawn as mapped boarding; round 3 to 6 had them in `strips`.)
  const s = batches.strips.positions, u = batches.soffits.positions, over = WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_STRIP_LIFT, under = WAVERLEY_ROOF_PROFILE.gutter - PERTH_BAND_DROP;
  let up = 0, down = 0;
  for (let i = 1; i < s.length; i += 3) if (Math.abs(s[i] - over) < 1e-6) up++;
  for (let i = 1; i < u.length; i += 3) if (Math.abs(u[i] - under) < 1e-6) down++;
  assert.ok(up > 100 && down === up, `${down} band vertices under the gutter line for ${up} over it`);
});

test('round 3 (round 5: as plates): the column girders\' spandrels are pierced (R-pt1-c): deep plates by the springings, none at the crown', () => {
  // Round 5: round 4's bars and bosses did not read from pt-roof-underside; the spandrel is now a plate cut by a pierced pattern.
  const b = new Batch(), plate = new Batch(), y0 = 5.25, top = 6.55, L = 9;
  archRib(b, [0, 0], [L, 0], y0, top - .02, () => top, [0, 0, 0], {...PERTH_SPANDREL, plate});
  const p = plate.positions;
  assert.ok(p.length > 0, 'spandrel plates');
  for (let k = 1; k < p.length; k += 3) assert.ok(p[k] >= y0 - .15 && p[k] <= top + .05, `a spandrel plate at y ${p[k]} outside the rib-to-girder band`);
  // Depth of plate at each x: the span of its vertices' heights there.
  const depthAt = (lo: number, hi: number): number => { let d = 0; for (let k = 0; k < p.length; k += 3) if (p[k] >= lo && p[k] <= hi) { const ys = []; for (let j = 0; j < p.length; j += 3) if (Math.abs(p[j] - p[k]) < 1e-9) ys.push(p[j + 1]); d = Math.max(d, Math.max(...ys) - Math.min(...ys)); } return d; };
  assert.ok(depthAt(0, L / 3) > .5 && depthAt(2 * L / 3, L) > .5, 'deep plates by both springings');
  assert.ok(depthAt(L / 3, 2 * L / 3) < .15, 'none to speak of where the rib meets the girder at the crown');
  // The pattern: a real share of holes, cut by alpha.
  const t = perthPiercedTexture(), d = t.image.data as Uint8Array; let holes = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) holes++;
  const share = holes / (d.length / 4);
  assert.ok(share > .2 && share < .6, `pierced (${(share * 100).toFixed(0)} % open)`);
  // And the scene draws the real spandrels with it, alpha-tested, in the roof part.
  const scene = buildPerthScene({ lighting: false });
  try {
    const mesh = scene.group.getObjectByName('perth-roof-spandrels') as THREE.Mesh, m = mesh.material as THREE.MeshLambertMaterial;
    assert.ok(m.map === t && m.alphaTest > 0 && (mesh.geometry.getAttribute('position').count > 0), 'the spandrel plates drawn pierced');
  } finally { scene.dispose(); }
});

test('round 3: no roof ironwork stands outside the roof (pt-platform-4-north saw a girder and rafters past its north end)', () => {
  const g = batches.ironwork.positions, rings = [plan.local.roof, ...(plan.local.canopy.length >= 3 ? [plan.local.canopy] : [])];
  let worst = 0, at: Pt = [0, 0];
  for (let i = 0; i < g.length; i += 3) {
    const q = toLocal([g[i], g[i + 2]]); if (rings.some(r => inRing(q, r))) continue;
    const d = Math.min(...rings.map(r => ringDistance(q, r))); if (d > worst) { worst = d; at = q; }
  }
  // 0.6 m: a gutter girder's flange, a fascia or a valance may hang just over the outline's edge, a member running on past it may not.
  assert.ok(worst <= .6, `roof ironwork ${worst.toFixed(2)} m outside the roof at x' ${at[0].toFixed(1)}, z' ${at[1].toFixed(1)}`);
});

test('the bay roof (R-pt1-c): its ridges run along the tracks over platforms 5-7, it alone rises over the main roof, an arched glazed screen closes its south end', () => {
  const bay = plan.local.bay, main = WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_PROFILE.rise, g = batches.glass.positions, n = batches.glass.normals;
  assert.ok(bay.length >= 3 && Math.min(...bay.map(p => p[0])) >= PERTH_BAY_ROOF.north - 1e-6, 'the bay roof stops at the island building\'s west step');
  let high = 0, screen = 0;
  for (let i = 0; i < g.length; i += 3) {
    const q = toLocal([g[i], g[i + 2]]);
    if (g[i + 1] > main + .05) { high++; assert.ok(inRing(q, bay) || ringDistance(q, bay) < .05, `glazing at ${q} over the main roof's ridge outside the bay roof`); }
    // A pane facing south (+x' in the track frame) at the bay's south end: the end screen.
    const nl = toLocal([n[i], n[i + 2]]), o = toLocal([0, 0]), nx = nl[0] - o[0];
    if (nx > .9 && q[0] > Math.max(...bay.map(p => p[0])) - 1) screen++;
  }
  assert.ok(high > 0, `the bay roof's ridges stand over the main roof's`);
  assert.ok(screen >= 8, `an end screen at the bay roof's south end (${screen} panes)`);
  // The ridge runs along the tracks: the same height along x', at each span's middle.
  for (const sp of PERTH_BAY_ROOF.spans) assert.equal(bayRoofHeight((sp.z0 + sp.z1) / 2), PERTH_BAY_ROOF.gutter + sp.rise);
  assert.equal(PERTH_ROOF_RIDGE, Math.max(main, ...PERTH_BAY_ROOF.spans.map(sp => PERTH_BAY_ROOF.gutter + sp.rise)));
  // Round 3: the arched screen is a step, not an open end. R-pt1-c, from the bay buffers looking south, shows glazing on both sides of it:
  // the high roof ends just past the buffers and the main roof carries on south over the bays.
  const south = Math.max(...bay.map(p => p[0])), buffers = Math.min(...plan.local.platforms.filter(p => p.ref === '5').flatMap(p => p.pts.map(q => q[0])));
  assert.ok(south > buffers && south < buffers + 15, `the step (x' ${south.toFixed(1)}) stands just south of the bay buffers (x' ${buffers.toFixed(1)})`);
  for (const z of [50, 60, 70]) assert.ok(inRing([south + 5, z], plan.local.main) && inRing([south + 30, z], plan.local.main), `the main roof covers the bays south of the step at z' ${z}`);
});

test('the platforms are furnished as R-pt1-a and R-pt1-c show: benches and bins along the island building, its kiosk, hung boards, number boards', () => {
  const f = plan.furniture;
  assert.ok(f.benches.length >= 40, `benches along the island building (${f.benches.length})`);
  assert.ok(f.bins.length >= 8, `bins (${f.bins.length})`);
  assert.ok(f.kiosk, 'the timber kiosk on the platform 4 face');
  assert.ok(f.boards.length >= 8, `hung direction boards (${f.boards.length})`);
  assert.ok(f.numbers.length >= 4, `platform number boards (${f.numbers.length})`);
  // Each bench and bin stands on a platform, clear of the tracks (the fittings check above covers every vertex of them under 4.8 m).
  for (const p of [...f.benches.map(b => b.at), ...f.bins]) assert.ok(onPlatform(toWorld(p)) && railDistance(toWorld(p)) > 2, `furniture at ${p}`);
});

test('round 3: the platforms are red asphalt in the open beyond both roof ends, flags under it, and the parts add up to the platform', () => {
  const area = (r: readonly Pt[]): number => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  let north = 0;
  for (const p of data.platforms) {
    const parts = platformParts(p.path), whole = area(cleanRing(p.path)), sum = area(parts.covered) + parts.open.reduce((s, q) => s + area(q), 0);
    assert.ok(Math.abs(sum - whole) < .01 * whole + .5, `platform ${p.ref}: parts ${sum.toFixed(1)} m² of ${whole.toFixed(1)} m²`);
    for (const q of parts.open) for (const v of q) { const x = toLocal(v)[0]; assert.ok(x <= PERTH_SHED_NORTH + 1e-6 || x >= 24 - 1e-6, `platform ${p.ref}: open surfacing at x' ${x.toFixed(1)}, under the roof`); }
    north += parts.open.filter(q => q.every(v => toLocal(v)[0] <= PERTH_SHED_NORTH + 1e-6)).length;
  }
  assert.ok(north >= 2, `${north} platforms open north of the shed (4 and 7 run past it in OSM)`);
  const scene = buildPerthScene({ lighting: false });
  try {
    const m = (scene.group.getObjectByName('perth-platform-surfaces-open') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    // Round 4: continuous red asphalt with a fine grain (not the flag chequer, not a flat fill), lightened toward R-pt1-b's salmon.
    const grain = m.map as THREE.DataTexture | null;
    assert.ok(grain?.name === 'perth-asphalt' && m.color.getHex() === PERTH_OPEN_ASPHALT, 'red asphalt with its grain map');
    const gd = grain.image.data as Uint8Array, vals = new Set<number>(); for (let i = 0; i < gd.length; i += 4) vals.add(gd[i]);
    assert.ok(vals.size > 10, `the asphalt map has grain (${vals.size} tones)`);
    assert.ok(m.color.r > m.color.g && m.color.g > m.color.b && m.color.r > .3, `salmon, not dark brown (${m.color.getHexString()})`);
    // Under the roof: smooth grey concrete with fine joints (R-pt1-d north), not the blotched flags.
    const pave = (scene.group.getObjectByName('perth-platform-surfaces') as THREE.Mesh).material as THREE.MeshLambertMaterial, pm = pave.map as THREE.DataTexture | null;
    assert.ok(pm?.name === 'perth-concrete', 'the covered platforms are concrete');
    const pd = pm.image.data as Uint8Array, n = pm.image.width, every = Math.round(n * PERTH_SURFACE_TILE.joint / PERTH_SURFACE_TILE.concrete);
    assert.ok(pd[4 * (5 * n + every)] < pd[4 * (5 * n + every + 3)] - 20, 'a joint line darker than the slab beside it');
    const c = pave.color; assert.ok(Math.abs(c.r - c.g) < .05 && Math.abs(c.g - c.b) < .05, `grey concrete (${c.getHexString()})`);
    // Lead ruling after round 3: the Dundee platforms' open ends are dark grey (R-pt1-c, Champion 2011), the red stays off them.
    const greyMesh = scene.group.getObjectByName('perth-platform-surfaces-open-grey') as THREE.Mesh;
    assert.ok(greyMesh, 'the Dundee platforms\' open ends are drawn grey');
    assert.equal((greyMesh.material as THREE.MeshLambertMaterial).color.getHex(), PERTH_OPEN_GREY);
    const dundee = data.platforms.filter(p => PERTH_GREY_PLATFORMS.includes(p.ref ?? '')).map(p => cleanRing(p.path));
    assert.equal(dundee.length, 2, 'platforms 1 and 2 are mapped');
    // (Round 6: or on a Dundee platform's own end ramp, which runs on past its OSM outline.)
    const dundeeRamps = plan.ramps.filter(r => PERTH_GREY_PLATFORMS.includes(r.ref)).map(r => [r.e0, r.e1, r.f1, r.f0].map(toWorld));
    const inDundee = (x: number, z: number): boolean => [...dundee, ...dundeeRamps].some(r => inRing([x, z], r) || ringDistance([x, z], r) < .05);
    const gp = greyMesh.geometry.getAttribute('position'), red = (scene.group.getObjectByName('perth-platform-surfaces-open') as THREE.Mesh).geometry, rp = red.getAttribute('position');
    assert.ok(gp.count > 0, 'grey open surfacing drawn');
    for (let i = 0; i < gp.count; i++) assert.ok(inDundee(gp.getX(i), gp.getZ(i)), 'grey surfacing only on platforms 1 and 2');
    const ix = red.index ? Array.from(red.index.array) : Array.from({length: rp.count}, (_, k) => k);
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]], cx = (rp.getX(a) + rp.getX(b) + rp.getX(c)) / 3, cz = (rp.getZ(a) + rp.getZ(b) + rp.getZ(c)) / 3;
      assert.ok(!dundee.some(r => inRing([cx, cz], r)), 'no red surfacing on platforms 1 and 2');
    }
    // The bridges' glass panels are drawn see-through, and none is left opaque among the fittings.
    const glass = scene.group.getObjectByName('perth-bridge-glass') as THREE.Mesh, gm = glass.material as THREE.Material;
    assert.ok(gm.transparent && gm.opacity < .5 && glass.geometry.getAttribute('position').count > 100, 'see-through bridge glass');
  } finally { scene.dispose(); }
  const pane = rgb(PERTH_PAINT.glassPanel), c = batches.fittings.colors;
  for (let i = 0; i < c.length; i += 3) assert.ok(!(Math.abs(c[i] - pane[0]) < 1e-6 && Math.abs(c[i + 1] - pane[1]) < 1e-6 && Math.abs(c[i + 2] - pane[2]) < 1e-6), 'an opaque glass panel left among the fittings');
  assert.equal(batches.fittings.indices.length % 3, 0);
  assert.ok(batches.fittings.indices.reduce((m, k) => Math.max(m, k), 0) < batches.fittings.positions.length / 3, 'the fittings\' indices stay in range after the split');
});

test('round 3: the frozen platform views see furniture: benches in the near view of pt-platform-4-north and pt-roof-underside', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, {pos: number[]; target: number[]; fov: number}>;
  // A bench is in the near view when it is within `range` m of the camera and inside the view's horizontal half-angle.
  const seen = (name: string, range: number): number => {
    const c = cams[name], d = [c.target[0] - c.pos[0], c.target[2] - c.pos[2]], dl = Math.hypot(d[0], d[1]), half = c.fov / 2 * 1280 / 800 * Math.PI / 180 * .8;
    return plan.furniture.benches.filter(b => {
      const w = toWorld(b.at), v = [w[0] - c.pos[0], w[1] - c.pos[2]], l = Math.hypot(v[0], v[1]);
      return l < range && l > 2 && Math.acos((v[0] * d[0] + v[1] * d[1]) / (l * dl)) < half;
    }).length;
  };
  assert.ok(seen('pt-platform-4-north', 30) >= 2, `pt-platform-4-north sees ${seen('pt-platform-4-north', 30)} benches within 30 m`);
  assert.ok(seen('pt-roof-underside', 25) >= 2, `pt-roof-underside sees ${seen('pt-roof-underside', 25)} benches within 25 m`);
  // The bench run down the column lines, away from the island building's walls.
  const away = plan.furniture.benches.filter(b => ringDistance(b.at, plan.local.island) > 3).length;
  assert.ok(away >= 20, `${away} benches down the column lines`);
});

test('round 4: the bands are brown-grey, not black, and the Dundee canopies are weathered grey from above too', () => {
  const scene = buildPerthScene({ lighting: false });
  try {
    const m = (scene.group.getObjectByName('perth-roof-strips') as THREE.Mesh).material as THREE.MeshLambertMaterial, c = m.color;
    assert.equal(c.getHex(), PERTH_BAND_BROWN);
    // Round 5: lighter again, toward R-pt1-a's brown-grey lit from below (round 4's 0x5e544b still read near-black from the platforms).
    // Round 6: lighter again (round 5's 0x7d7064, sum about 0.53, did not change the read from below).
    assert.ok(c.r + c.g + c.b > .8 && c.r > c.b, `bands brown-grey (${c.getHexString()}), not dark`);
  } finally { scene.dispose(); }
  const w = batches.weather.positions; let over = 0;
  for (let i = 0; i < w.length; i += 3) if (inRing(toLocal([w[i], w[i + 2]]), plan.local.canopy) && w[i + 1] < PERTH_STATION.canopy.top + PERTH_STATION.canopy.rise + .1) over++;
  assert.ok(over > 50, `the weathered skin over the Dundee canopies (${over} vertices)`);
});

test('round 4: the platform 4 clock as R-pt1-a2: a Roman dial in a timber case on a glazed stage over a maroon kiosk, benches clear', () => {
  const C = PERTH_STATION.clock, deck = WAVERLEY_LEVELS.platform, c4 = plan.clocks.find(c => c.ref === C.kioskRef);
  assert.ok(c4 && plan.clocks.some(c => c.ref === '5'), 'the platform 4 and 5 clocks');
  const f = batches.fittings, col = f.colors, p = f.positions, is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(col[i] - k[0]) < 1e-6 && Math.abs(col[i + 1] - k[1]) < 1e-6 && Math.abs(col[i + 2] - k[2]) < 1e-6; };
  const near = (i: number, c: {at: Pt}, r: number): boolean => { const q = toLocal([p[i], p[i + 2]]); return Math.hypot(q[0] - c.at[0], q[1] - c.at[1]) < r; };
  // Round 5: platform 4's clock hangs C.hang past the stage's face, its dial centre C.hangHeight over the deck.
  const reach = C.stage[1] + C.hang + C.case[0];
  let maroon = 0, timber = 0, face = 0, marks = 0, stray = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (is(i, PERTH_PAINT.kioskMaroon)) { if (near(i, c4!, C.kiosk[0])) { maroon++; assert.ok(p[i + 1] <= deck + C.kiosk[2] + 1e-6, 'the kiosk stays under its cornice'); } else stray++; }
    if (is(i, PERTH_PAINT.timber) && near(i, c4!, C.kiosk[0]) && p[i + 1] > deck + C.stage[2] - .01) timber++;
    if (is(i, PERTH_PAINT.clockCase) && near(i, c4!, reach) && Math.abs(p[i + 1] - (deck + C.hangHeight)) <= C.radius) marks++;
  }
  // (Round 7: the dial faces are drawn textured, in batches.dials, not white in the fittings.)
  const d = batches.dials.positions, nearD = (i: number): boolean => { const q = toLocal([d[i], d[i + 2]]); return Math.hypot(q[0] - c4!.at[0], q[1] - c4!.at[1]) < reach; };
  for (let i = 0; i < d.length; i += 3) if (nearD(i) && Math.abs(d[i + 1] - (deck + C.hangHeight)) <= C.radius + 1e-6) face++;
  assert.ok(maroon > 0 && stray === 0, `the maroon kiosk under the platform 4 clock only (${maroon}, stray ${stray})`);
  assert.ok(timber >= 24, `the timber stage and case over it (${timber})`);
  assert.ok(face >= 32, `two dials (${face})`);
  assert.ok(marks >= 2 * 12 * 24, `twelve hour marks and two hands on each dial (${marks})`);
  for (const b of plan.furniture.benches) assert.ok(Math.hypot(b.at[0] - c4!.at[0], b.at[1] - c4!.at[1]) > C.kiosk[0] / 2 + 1.2 - 1e-6, 'no bench against the clock kiosk');
  // Round 5 (the round-4 score): the kiosk low and brown, not a tall maroon block; a door in its end; the stage's lights glazed, not
  // black.
  const kh = PERTH_PAINT.kioskMaroon, kr = kh >> 16, kg = (kh >> 8) & 255, kb = kh & 255;
  assert.ok(C.kiosk[2] <= 2.4 && kr > kg && kg - kb > 12, `a low brown kiosk (${C.kiosk[2]} m, ${PERTH_PAINT.kioskMaroon.toString(16)})`);
  // Round 6 (R-pt1-a2 again, the round-5 score): the case stands on the stage's front top corner, astride its face, rather than hung
  // past it: every dial vertex above the stage's cornice, the dials' middle on or past the stage's face, none of a dial over the stage's
  // back half.
  let door = 0, glass = 0, low = 0, outs = 0, n = 0, back = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (!near(i, c4!, reach)) continue;
    if (is(i, PERTH_PAINT.timberDark) && Math.abs(p[i + 1] - (deck + C.door[1])) < 1e-6) door++;
    if (is(i, PERTH_PAINT.kioskGlass)) glass++;
  }
  for (let i = 0; i < d.length; i += 3) {
    if (!nearD(i)) continue;
    const q = toLocal([d[i], d[i + 2]]), o = (q[0] - c4!.at[0]) * c4!.out[0] + (q[1] - c4!.at[1]) * c4!.out[1];
    outs += o; n++; if (o < C.stage[1] / 2) back++; if (d[i + 1] < deck + C.stage[3] + .16) low++;
  }
  assert.ok(door >= 4, `a door in the kiosk's end (${door})`);
  assert.ok(glass >= 6 * 24, `the stage's lights glazed (${glass})`);
  assert.ok(n > 0 && low === 0 && back === 0 && outs / n >= C.stage[1] - .05, `the dials on the stage's front top corner (mean out ${(outs / n).toFixed(2)}, ${low} under the cornice, ${back} over its back half)`);
});

test('round 5: the island building as R-pt1-a/a2: its south end in clear view of pt-platform-4-north, arched doorways, grey-buff ashlar', () => {
  // The sightline: from the frozen camera to the platform 4 half of the island building's south end, past the 4/5 landing's tower and
  // stair (whose place across the island is ASSUMED; PERTH_LANDING_LEAN).
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, {pos: number[]}>;
  const cam = toLocal([cams['pt-platform-4-north'].pos[0], cams['pt-platform-4-north'].pos[2]]), isl = plan.local.island;
  const endX = Math.max(...isl.map(p => p[0])), zs = isl.filter(p => p[0] > endX - 1).map(p => p[1]), zLo = Math.min(...zs), zHi = Math.max(...zs);
  const l45 = plan.bridges.flatMap(b => b.landings).find(l => l.refs.join('/') === '4/5')!, T = PERTH_STATION.tower.size / 2;
  const boxes: [string, [number, number, number, number]][] = [['stair', l45.stair], ['tower', [l45.tower!.c[0] - T, l45.tower!.c[0] + T, l45.tower!.c[1] - T, l45.tower!.c[1] + T]]];
  const hits = (a: Pt, b: Pt, [x0, x1, z0, z1]: [number, number, number, number]): boolean => { for (let k = 0; k <= 200; k++) { const t = k / 200, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; if (x > x0 && x < x1 && z > z0 && z < z1) return true; } return false; };
  for (let z = zLo + .5; z <= Math.min(zHi, zLo + 6); z += .5) for (const [name, box] of boxes) assert.ok(!hits(cam, [endX, z], box), `the ${name} hides the south end at z' ${z.toFixed(1)}`);
  // Arched doorways: dressed voussoirs (faces tilted round the arch) between each door's springing and its keystone.
  const B = PERTH_STATION.building, deck = WAVERLEY_LEVELS.platform, parts = islandBuildingBatches(plan.island), st = parts.stone, kd = rgb(PERTH_PAINT.stoneDressing);
  let tilted = 0;
  for (let i = 0; i < st.positions.length; i += 3) {
    const y = st.positions[i + 1], ny = Math.abs(st.normals[i + 1]);
    if (Math.abs(st.colors[i] - kd[0]) < 1e-6 && Math.abs(st.colors[i + 1] - kd[1]) < 1e-6 && Math.abs(st.colors[i + 2] - kd[2]) < 1e-6 && ny > .2 && ny < .95 && y > deck + B.door[1] - B.doorArch - .1 && y < deck + B.door[1] - B.doorArch + B.door[0] / 2 + .5) tilted++;
  }
  assert.ok(tilted >= 48, `arched door surrounds (${tilted} voussoir vertices)`);
  // Grey-buff, not pink: the wall a little warmer than grey, its blue clearly under its green; on Perth's own low-contrast ashlar.
  const [r, g, b] = rgb(PERTH_PAINT.stoneWall);
  assert.ok(r - g < .04 && g - b > .045, `grey-buff stone (${PERTH_PAINT.stoneWall.toString(16)})`);
  const scene = buildPerthScene({ lighting: false });
  try {
    const m = (scene.group.getObjectByName('perth-island-building') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    assert.equal(m.map?.name, 'perth-ashlar', 'Perth\'s ashlar map');
    const d = (m.map as THREE.DataTexture).image.data as Uint8Array, tones = new Set<number>();
    for (let i = 0; i < d.length; i += 4) tones.add(d[i]);
    assert.ok(tones.size > 8, 'coursing in the map');
  } finally { scene.dispose(); }
});

test('round 5: the main roof\'s ends are a row of pitched gables (R-pt1-b), not the flat 2 m fascia lid', () => {
  const E = PERTH_ROOF_ENDS, ends = mainRoofEnds(plan.structure.outline), ir = batches.ironwork, p = ir.positions, col = ir.colors;
  assert.ok(ends.length >= 2, `both ends (${ends.length})`);
  const is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(col[i] - k[0]) < 1e-6 && Math.abs(col[i + 1] - k[1]) < 1e-6 && Math.abs(col[i + 2] - k[2]) < 1e-6; };
  for (const [a, c] of ends) {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), x = (a[0] + c[0]) / 2, apexes = new Set<string>();
    const on = (i: number): boolean => ringDistance(toLocal([p[i], p[i + 2]]), [a, c]) < .05;
    for (let i = 0; i < p.length; i += 3) {
      if (!on(i)) continue;
      const q = toLocal([p[i], p[i + 2]]);
      if (is(i, PERTH_PAINT.gable) && Math.abs(p[i + 1] - roofHeight(q[0])) < .05) apexes.add(`${q[1].toFixed(1)}`);
    }
    // Waverley's flat screen: fascia-painted triangles lying wholly on the end, from WAVERLEY_STRUCTURE.fasciaBottom up to the roof
    // (neighbouring screens only touch the end at a vertex).
    let low = 0;
    for (let t = 0; t < ir.indices.length; t += 3) {
      const vs = ir.indices.slice(t, t + 3).map(v => 3 * v);
      if (vs.every(on) && vs.every(i => is(i, PERTH_PAINT.fascia)) && vs.some(i => Math.abs(p[i + 1] - WAVERLEY_STRUCTURE.fasciaBottom) < .01) && vs.some(i => Math.abs(p[i + 1] - roofHeight(toLocal([p[i], p[i + 2]])[0])) < .05)) low++;
    }
    assert.ok(apexes.size >= Math.max(1, Math.round(len / E.width)), `gables along the end at x' ${x.toFixed(1)} (${apexes.size} apexes)`);
    assert.equal(low, 0, `no flat fascia screen left along the end at x' ${x.toFixed(1)}`);
  }
});

test('round 5: the north bridge as R-pt1-d north: arched side girders above the deck, diamond-lattice stair balustrades; the lift stair thin', () => {
  const br = plan.bridges.find(b => b.kind === 'lattice')!, f = batches.fittings, p = f.positions, nn = f.normals, col = f.colors, k = rgb(PERTH_PAINT.lattice);
  const isLattice = (i: number): boolean => Math.abs(col[i] - k[0]) < 1e-6 && Math.abs(col[i + 1] - k[1]) < 1e-6 && Math.abs(col[i + 2] - k[2]) < 1e-6;
  const slab = br.deck - .3, half = PERTH_STATION.deckHalf;
  // The arch: the maroon side girders' top chord rises PERTH_STATION.arch over its 1.7 m at the ends; nothing hangs under the slab (the
  // envelope stays clear; the stairs' strings start under it at the landings), and the arch stays under the roof's lowest point over it.
  let hi = -Infinity, under = 0; const tops = new Map<number, number>();
  for (let i = 0; i < p.length; i += 3) {
    if (!isLattice(i)) continue;
    const q = toLocal([p[i], p[i + 2]]);
    if (Math.abs(q[0] - br.along) > half || q[1] < br.z0 || q[1] > br.z1) continue;
    if (p[i + 1] < slab - .1 && p[i + 1] > 3 && br.landings.every(l => Math.hypot(q[0] - l.start[0], q[1] - l.start[1]) > 4)) under++;
    if (Math.abs(Math.abs(q[0] - br.along) - (half - .15)) < .2) { hi = Math.max(hi, p[i + 1]); if (br.landings.every(l => Math.hypot(q[0] - l.start[0], q[1] - l.start[1]) > 4)) { const z = Math.floor(q[1]); tops.set(z, Math.max(tops.get(z) ?? -Infinity, p[i + 1])); } }
  }
  // The top of the girder plane, metre by metre along the span (away from the stairs): it rises and falls by the arch, not one level.
  const ys = [...tops.values()].filter(y => y > br.deck + .5), spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > .5, `the side girders arch, by half a metre or more, (top ${hi.toFixed(2)}, spread ${spread.toFixed(2)} along the span)`);
  // One arch per span between the posts (R-pt1-d north), not one over the whole bridge: the top rises through its mid level more than once.
  const row = [...tops].filter(([, y]) => y > br.deck + .5).sort((u, v) => u[0] - v[0]).map(([, y]) => y), midY = Math.min(...row) + spread / 2;
  let rises = 0; for (let k = 1; k < row.length; k++) if (row[k - 1] < midY && row[k] >= midY) rises++;
  assert.ok(rises >= 2, `an arch over each span between the posts (${rises} rising)`);
  assert.equal(under, 0, 'no lattice hung under the deck slab');
  // Round 6 (R-pt1-d north, the round-5 score): the whole girder bows, not its top chord alone: the side girders' bottom chord and the
  // slab's maroon underside stand half a metre or more over their level at the posts, at the middle of the span between the platform 3
  // and platform 4 landings (the span pt-platform-4-clock looks at). (Round 5's pale soffit is dropped: the photograph shows the
  // underside dark.)
  const zs = br.landings.filter(l => l.refs[0] === '3' || l.refs[0] === '4').map(l => l.z), zm = (zs[0] + zs[1]) / 2;
  assert.ok(zs.length === 2 && Math.abs(zs[1] - zs[0]) > 8, 'a long span between the platform 3 and 4 landings');
  let bottom = Infinity, underside = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (!isLattice(i)) continue;
    const q = toLocal([p[i], p[i + 2]]); if (Math.abs(q[1] - zm) > .5) continue;
    const dx = Math.abs(q[0] - br.along);
    if (Math.abs(dx - (half - .15)) < .08) bottom = Math.min(bottom, p[i + 1]);
    // (the slab's underside: its corners lie at the deck's full half-width, past the side girders' chords)
    if (Math.abs(dx - half) < .01 && nn[i + 1] < -.9) underside = Math.min(underside, p[i + 1]);
  }
  assert.ok(bottom > br.deck + .5, `the bottom chord bows with the arch (${bottom.toFixed(2)} at mid-span, deck ${br.deck})`);
  assert.ok(underside > slab + .5 && underside < Infinity, `the deck's underside bows with the arch (${underside.toFixed(2)} at mid-span, ${slab.toFixed(2)} at the posts)`);
  assert.ok(!Object.hasOwn(PERTH_PAINT, 'deckSoffit'), 'no pale soffit claimed');
  const roofLow = Math.min(...[-half, half].map(d => roofHeight(br.along + d)));
  assert.ok(hi < roofLow - .3, `the arch clears the roof over it (${hi.toFixed(2)} under ${roofLow.toFixed(2)})`);
  // The stair balustrades: crossing bars, so lattice faces tilted at more than the string's one slope in each flight's vertical plane.
  for (const l of br.landings) {
    const d = l.dir, nrm: Pt = [-d[1], d[0]], tilts = new Set<string>();
    for (let i = 0; i < p.length; i += 3) {
      if (!isLattice(i)) continue;
      const q = toLocal([p[i], p[i + 2]]), r: Pt = [q[0] - l.start[0], q[1] - l.start[1]], s = r[0] * d[0] + r[1] * d[1], u = r[0] * nrm[0] + r[1] * nrm[1];
      if (s < .5 || s > 3 || Math.abs(u) > PERTH_STATION.stair.width / 2 + .3) continue;
      const nl = toLocal([nn[i], nn[i + 2]]), o = toLocal([0, 0]), along = (nl[0] - o[0]) * d[0] + (nl[1] - o[1]) * d[1], ny = nn[i + 1];
      if (Math.abs(along) > .05 && Math.abs(ny) > .05) tilts.add(`${Math.abs(along).toFixed(2)}/${Math.abs(ny).toFixed(2)}`);
    }
    assert.ok(tilts.size >= 3, `a lattice balustrade on the stair to ${l.refs.join('/')} (${tilts.size} tilts)`);
  }
  const St = PERTH_STATION.stair;
  assert.ok(St.string.lift <= .25 && St.slab <= .2 && St.string.lattice >= St.string.lift, 'the lift stair\'s strings and landing slab thin');
});

test('round 4: every lift tower has a glass hood over its deck-level door (Abbott 6573357), drawn see-through', () => {
  const [out, , over] = PERTH_STATION.tower.hood, towers = plan.bridges.flatMap(br => br.landings.filter(l => l.tower).map(l => ({c: l.tower!.c, y: br.deck + over})));
  assert.equal(towers.length, 3, 'three lift towers');
  const p = batches.panes.positions;
  for (const t of towers) {
    let n = 0;
    for (let i = 0; i < p.length; i += 3) {
      const q = toLocal([p[i], p[i + 2]]), r = Math.hypot(q[0] - t.c[0], q[1] - t.c[1]);
      if (Math.abs(p[i + 1] - t.y) < .03 && r > PERTH_STATION.tower.size / 2 && r < PERTH_STATION.tower.size / 2 + out + 1.3) n++;
    }
    assert.ok(n >= 8, `a hood at the tower at ${t.c} (${n} vertices)`);
  }
});

test('round 4: the Dundee canopies as Champion 2011 shows them: ridges across the platforms, platform 1 boarded on grey-blue columns, a white lattice valance', () => {
  const C = PERTH_STATION.canopy, canopy = plan.local.canopy, near = (p: Pt): boolean => inRing(p, canopy) || ringDistance(p, canopy) < .3;
  const pf1 = plan.local.platforms.filter(q => q.ref === PERTH_BOARDED_PLATFORM).map(q => q.pts), on1 = (p: Pt): boolean => pf1.some(r => inRing(p, r) || ringDistance(p, r) < .3);
  const pf2 = plan.local.platforms.filter(q => q.ref === '2').map(q => q.pts), side = boardedSide(plan.local)!;
  assert.ok(side, 'platforms 1 and 2 are both mapped');
  // Ridges across: over the canopy, the glazing's height depends on x' (along the tracks) alone, so its gables face the tracks.
  const g = batches.glass.positions, byX = new Map<number, number[]>();
  for (let i = 0; i < g.length; i += 3) {
    if (g[i + 1] < C.top - .01 || g[i + 1] > C.top + C.rise + .01) continue;
    const q = toLocal([g[i], g[i + 2]]); if (!inRing(q, canopy)) continue;
    const k = Math.round(q[0] * 20); byX.set(k, [...(byX.get(k) ?? []), g[i + 1]]);
  }
  let rows = 0;
  for (const ys of byX.values()) if (ys.length > 1) { rows++; assert.ok(Math.max(...ys) - Math.min(...ys) < .01, 'the canopy glazing is level across the tracks: its ridges run across them'); }
  assert.ok(rows > 20, `${rows} lines of constant x' across the canopy glazing`);
  // Colours from the fittings (world frame, coloured per vertex).
  const f = batches.fittings, c = f.colors, p = f.positions, is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(c[i] - k[0]) < 1e-6 && Math.abs(c[i + 1] - k[1]) < 1e-6 && Math.abs(c[i + 2] - k[2]) < 1e-6; };
  let soffit = 0, blue = 0, valance = 0;
  for (let i = 0; i < p.length; i += 3) {
    const q = toLocal([p[i], p[i + 2]]), y = p[i + 1];
    // The soffit covers platform 1's canopy, overhang included (Champion 2011): under the canopy glazing, on platform 1's side of the line
    // halfway to platform 2, never over platform 2.
    if (is(i, PERTH_PAINT.soffit)) {
      soffit++;
      const sp = side.split(q[0]), onSide = sp !== undefined && (side.greater ? q[1] >= sp - .5 : q[1] <= sp + .5);
      assert.ok(near(q) && onSide && !pf2.some(r => inRing(q, r)) && y < C.top + C.rise - C.soffit + .01 && y > C.top - C.soffit - .01, `soffit at ${q} y ${y} off platform 1's canopy`);
    }
    if (is(i, PERTH_PAINT.columnBlue)) { blue++; assert.ok(on1(q), `a grey-blue column off platform 1 at ${q}`); }
    if (is(i, PERTH_PAINT.latticeWhite) && near(q) && y > C.top - C.valance - .1 && y < C.top + .1) valance++;
  }
  assert.ok(soffit > 100, `the boarded soffit over platform 1 (${soffit} vertices)`);
  assert.ok(blue >= 8, `grey-blue columns on platform 1 (${blue} vertices)`);
  assert.ok(valance > 1000, `the white lattice valance round the canopy (${valance} vertices)`);
});

test('round 2b: the roof reads dark from above only, the island building\'s chimneys stand through it, the Dundee canopies are pitched', () => {
  // The weathered outer face covers the main and bay glazing and faces up everywhere, so it is culled from below.
  const w = batches.weather, n = w.normals;
  assert.ok(w.positions.length >= batches.glass.positions.length / 2, 'the weathered face covers the station glazing');
  // Round 3: its normals are all straight up (one flat grey from above), so facing is read from each triangle's winding, which is what
  // the renderer culls by: counter-clockwise seen from above.
  // Round 4: the glazing's own normals, so the slopes shade apart (the ridge-and-furrow reads from above), each still facing up.
  const tilts = new Map<number, number>();
  // Counted over the main roof alone, so the canopies' skin cannot stand in for it.
  for (let i = 0; i < n.length; i += 3) { assert.ok(n[i + 1] > 0, 'the weathered face faces up'); if (inRing(toLocal([w.positions[i], w.positions[i + 2]]), plan.local.main)) { const k = Math.round(n[i] * 100) * 1000 + Math.round(n[i + 2] * 100); tilts.set(k, (tilts.get(k) ?? 0) + 1); } }
  const slopes = [...tilts.values()].filter(c => c >= 100).length;
  assert.ok(slopes >= 2, `the main roof's skin shades by slope (${slopes} slopes of 100 vertices or more)`);
  const p = w.positions, ix = w.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(k => [p[3 * k], p[3 * k + 1], p[3 * k + 2]]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    assert.ok(ny >= -1e-9, `the weathered face's triangle ${t / 3} is wound to face down`);
  }
  // Chimney stacks rise through the glazing (R-pt1-b); nothing else of the building does.
  const stone = islandBuildingBatches(plan.island, perthRoofOver(plan)).stone.positions, over = perthRoofOver(plan);
  let stacks = 0;
  for (let i = 0; i < stone.length; i += 3) if (stone[i + 1] > over([stone[i], stone[i + 2]]) + .5) stacks++;
  assert.ok(stacks >= 8 * 24, `chimney stacks over the glazing (${stacks} vertices)`);
  // The canopies' glazing rises from the eaves to a ridge rise m over them, and no higher.
  const g = batches.glass.positions, canopy = plan.canopy, C = PERTH_STATION.canopy;
  let top = 0;
  for (let i = 0; i < g.length; i += 3) if (inRing([g[i], g[i + 2]], canopy) && ringDistance([g[i], g[i + 2]], canopy) > .2) top = Math.max(top, g[i + 1]);
  assert.ok(Math.abs(top - (C.top + C.rise)) < 1e-6, `the canopies' ridge at ${top}`);
});

test('round 6: the main roof\'s end gables are glazed in a boarded border over a light eaves band and a pointed-board valance (R-pt1-b)', () => {
  const E = PERTH_ROOF_ENDS, ir = batches.ironwork, p = ir.positions, col = ir.colors;
  const is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(col[i] - k[0]) < 1e-6 && Math.abs(col[i + 1] - k[1]) < 1e-6 && Math.abs(col[i + 2] - k[2]) < 1e-6; };
  for (const [a, c] of mainRoofEnds(plan.structure.outline)) {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), gables = Math.max(1, Math.round(len / E.width));
    let glass = 0, fascia = 0, valance = 0, bars = 0, low = Infinity;
    // (the end is not quite across the tracks, so the roof's height varies along it: bounds below use its lowest over the end)
    const roofLo = Math.min(...Array.from({length: 101}, (_, k) => roofHeight(a[0] + (c[0] - a[0]) * k / 100)));
    for (let i = 0; i < p.length; i += 3) {
      const q = toLocal([p[i], p[i + 2]]); if (ringDistance(q, [a, c]) > E.proud + .1) continue;
      const roof = roofHeight(q[0]);
      if (is(i, PERTH_PAINT.endGlass)) { glass++; assert.ok(p[i + 1] < roof && p[i + 1] > roofLo - E.rise - .01, `end glazing at ${q} y ${p[i + 1]} inside its gable`); }
      // (the eaves band's foot: gable grey, below the gables' own foot; PERTH_PAINT.fascia is the iron's shade after the recolour)
      if (is(i, PERTH_PAINT.gable) && p[i + 1] < roof - E.rise - E.band / 2) fascia++;
      if (is(i, PERTH_PAINT.latticeWhite)) { valance++; low = Math.min(low, p[i + 1]); }
      if (is(i, PERTH_PAINT.iron) && p[i + 1] > roofLo - E.rise + E.border - .01 &&p[i + 1] < roof - E.border && ringDistance(q, [a, c]) < E.proud + .03) bars++;
    }
    assert.ok(glass >= gables * 4 * 3, `glazed gables on the end ${a}-${c} (${glass} vertices for ${gables} gables)`);
    assert.ok(bars >= gables * 8, `glazing bars across the lights (${bars})`);
    assert.ok(fascia >= gables * 4, `the eaves band painted the gables' grey, not the dark fascia (${fascia} vertices)`);
    assert.ok(valance >= Math.round(len / E.tooth) * 2 * 5 * .9 && low < roofHeight((a[0] + c[0]) / 2) - E.rise - E.band - E.drop * .9, `a pointed-board valance under the band (${valance} vertices, lowest ${low.toFixed(2)})`);
  }
  const g = PERTH_PAINT.endGlass, gr = g >> 16, gb = g & 255;
  assert.ok(gr > 0x90 && gb >= gr, `the end glazing pale grey-blue glass (${g.toString(16)})`);
});

test('round 6: the platforms\' open ends run down to rail level in ramps, clear of the tracks; platform 4\'s south end in pt-platform-4-south-end', () => {
  const R = PERTH_RAMP, deck = WAVERLEY_LEVELS.platform, len = deck * R.grade;
  const r4 = plan.ramps.find(r => r.ref === '4' && r.e0[0] > 100);
  assert.ok(r4, 'a ramp at platform 4\'s south end');
  assert.ok(plan.ramps.length >= 3, `ramps at the open ends (${plan.ramps.length})`);
  for (const r of plan.ramps) {
    for (const [e, f] of [[r.e0, r.f0], [r.e1, r.f1]]) {
      assert.ok(Math.abs(Math.hypot(f[0] - e[0], f[1] - e[1]) - len) < 1e-6, `1 in ${R.grade}`);
      for (let k = 0; k <= 10; k++) { const p: Pt = [e[0] + (f[0] - e[0]) * k / 10, e[1] + (f[1] - e[1]) * k / 10]; assert.ok(railDistance(toWorld(p)) >= R.clear - 1e-6, `the ${r.ref} ramp clear of the tracks at ${p}`); }
    }
    assert.ok(Math.hypot(r.e1[0] - r.e0[0], r.e1[1] - r.e0[1]) >= R.min, 'wide enough to walk');
    // Its head on its platform's end: both head corners on the platform's outline.
    const pf = plan.local.platforms.filter(q => q.ref === r.ref);
    assert.ok([r.e0, r.e1].every(e => pf.some(q => ringDistance(e, q.pts) < 1e-6)), `the ${r.ref} ramp's head on its platform's end`);
  }
  // Drawn: a sloping open-surfacing quad from the deck to rail level, and its brick sides.
  const scene = buildPerthScene({ lighting: false });
  try {
    const g = (scene.group.getObjectByName('perth-platform-surfaces-open') as THREE.Mesh).geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    let slope = 0;
    for (let i = 0; i < pos.count; i++) {
      const q = toLocal([pos.getX(i), pos.getZ(i)]);
      if (q[0] > r4!.e0[0] - .01 && q[0] < r4!.f0[0] + .01 && nrm.getY(i) < .999 && nrm.getY(i) > .9) slope++;
    }
    assert.ok(slope >= 4, `platform 4's ramp drawn sloping (${slope} vertices)`);
  } finally { scene.dispose(); }
  const faces = batches.platform.faces.positions; let side = 0;
  // (a side's corners: its foot at rail level at the ramp's foot corners)
  for (let i = 0; i < faces.length; i += 3) { const q = toLocal([faces[i], faces[i + 2]]); if ([r4!.f0, r4!.f1].some(f => Math.hypot(q[0] - f[0], q[1] - f[1]) < .01) && Math.abs(faces[i + 1] - WAVERLEY_LEVELS.rail) < 1e-6) side++; }
  assert.ok(side >= 2, `the ramp's brick sides (${side})`);
  // In the new view's frame.
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, {pos: number[]; target: number[]; fov: number}>;
  const k = cams['pt-platform-4-south-end'], cam = new THREE.PerspectiveCamera(k.fov, 1280 / 800, .1, 5000);
  cam.position.set(k.pos[0], k.pos[1], k.pos[2]); cam.lookAt(k.target[0], k.target[1], k.target[2]); cam.updateMatrixWorld(true);
  // Round 7: the eye stands 2.7 m short of the end (lead ruling 18:05), so the head itself is under the frame; the slope, from a
  // quarter of its length down to its foot, is in it along its track side (the eye stands by that side), and its foot right across.
  const ti = r4!.track[0] ? 0 : 1;
  for (const [e, f, ts] of [[ti ? r4!.e1 : r4!.e0, ti ? r4!.f1 : r4!.f0, [.25, .5, 1]], [ti ? r4!.e0 : r4!.e1, ti ? r4!.f0 : r4!.f1, [1]]] as [Pt, Pt, number[]][]) for (const t of ts) {
    const w = toWorld([e[0] + (f[0] - e[0]) * t, e[1] + (f[1] - e[1]) * t]), v = new THREE.Vector3(w[0], deck + (WAVERLEY_LEVELS.rail - deck) * t, w[1]).project(cam);
    assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1, `the ramp at ${t} of its length in pt-platform-4-south-end (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
  }
});

test('round 7: the coper and warning strip run down the ramps\' track sides and turn along the end to meet them; a mesh fence stands across each ramp\'s head', () => {
  const [coper, warning] = WAVERLEY_EDGE_BANDS, deck = WAVERLEY_LEVELS.platform, rail = WAVERLEY_LEVELS.rail;
  const r4 = plan.ramps.find(r => r.ref === '4' && r.e0[0] > 100)!;
  assert.equal(r4.track.filter(Boolean).length, 1, 'platform 4\'s south ramp: its east side runs by the through lines, its west side meets platform 5\'s ramp');
  const ti = r4.track[0] ? 0 : 1, e = ti ? r4.e1 : r4.e0, o = ti ? r4.e0 : r4.e1;
  assert.ok(e[1] < o[1], 'the track side is the east (lower z\') side');
  assert.ok(r4.corner[ti], 'drawn in from the platform\'s corner on the track side');
  const coperRgb = PERTH_PAINT.coper, near = (b: Batch, test: (q: Pt, y: number, i: number) => boolean): number => { let n = 0; for (let i = 0; i < b.positions.length; i += 3) { const q = toLocal([b.positions[i], b.positions[i + 2]]); if (test(q, b.positions[i + 1], i)) n++; } return n; };
  const P = batches.platform, len = r4.f0[0] - r4.e0[0];
  // Down the slope: coper vertices at the foot, at rail level (plus the lift), on the track side's line and .3 m in.
  const side = (q: Pt, u: number, t: number): boolean => Math.abs(q[0] - (e[0] + len * t)) < .02 && Math.abs(q[1] - (e[1] + u)) < .02;
  const coperC = rgb(coperRgb), isCoper = (i: number): boolean => Math.abs(P.edges.colors[i] - coperC[0]) < 1e-6 && Math.abs(P.edges.colors[i + 1] - coperC[1]) < 1e-6;
  const foot = near(P.edges, (q, y, i) => isCoper(i) && side(q, coper.to, 1) && Math.abs(y - rail - WAVERLEY_STRUCTURE.stripLift) < 1e-6);
  assert.ok(foot >= 1, `the coper reaches the ramp's foot at rail level (${foot})`);
  // Round 8 (corrected): no warning strip down the gated ramp (round 7 drew one unsourced; neither Rosser1954 nor 591926 shows it).
  const tact = near(P.tactile, q => q[0] > r4.e0[0] + .05 && q[0] < r4.f0[0] + .05 && Math.abs(q[1] - (e[1] + (warning.from + warning.to) / 2)) < 1);
  assert.equal(tact, 0, `no warning strip on the ramp (${tact})`);
  const nose = near(P.lip, (q, y) => Math.abs(q[0] - r4.f0[0]) < .02 && y < rail);
  assert.ok(nose >= 1, `the coper's nosing runs down the slope (${nose})`);
  // The turn: coper on the deck from the platform's corner to the ramp's side.
  const c = r4.corner[ti]!, turn = near(P.edges, (q, y, i) => isCoper(i) && Math.hypot(q[0] - c[0], q[1] - c[1]) < .02 && Math.abs(y - deck - WAVERLEY_STRUCTURE.stripLift) < 1e-6);
  assert.ok(turn >= 1, `the coper turns along the end from the platform's corner (${turn})`);
  // The fence: posts and rails in its grey, standing on the head line, about chest high. (Round 8: round 7's 0.15 m bars are now one
  // close-mesh panel between the rails, batches.mesh, cut out by perthMeshTexture; the round-8 test below checks the panel.)
  const fc = rgb(PERTH_RAMP_FENCE.color), f = batches.fittings; let frame = 0, top = 0;
  for (let i = 0; i < f.positions.length; i += 3) {
    if (Math.abs(f.colors[i] - fc[0]) > 1e-6 || Math.abs(f.colors[i + 2] - fc[2]) > 1e-6) continue;
    const q = toLocal([f.positions[i], f.positions[i + 2]]);
    if (Math.abs(q[0] - r4.e0[0]) < .1 && q[1] > Math.min(r4.e0[1], r4.e1[1]) - .1 && q[1] < Math.max(r4.e0[1], r4.e1[1]) + .1) { frame++; top = Math.max(top, f.positions[i + 1]); }
  }
  assert.ok(frame >= 3 * 24, `posts and rails across the head (${frame} vertices)`);
  assert.ok(top > deck + 1 && top < deck + 1.6, `chest high (${(top - deck).toFixed(2)} m)`);
});

test('round 8: the ramps read as slopes: a handrail down each side follows the fall; the head\'s fence is a close-mesh panel, in pt-platform-4-south-end\'s frame and in clear view', () => {
  const H = PERTH_RAMP_RAIL, F = PERTH_RAMP_FENCE, M = PERTH_FENCE_MESH, deck = WAVERLEY_LEVELS.platform, rail = WAVERLEY_LEVELS.rail;
  const r4 = plan.ramps.find(r => r.ref === '4' && r.e0[0] > 100)!, fc = rgb(F.color), f = batches.fittings, p = f.positions;
  // Handrails: on both sides of every ramp, the top rail H.heights[0] over the slope at its head and its foot (so it falls with it).
  for (const r of plan.ramps) for (const i of [0, 1] as const) {
    const e = i ? r.e1 : r.e0, fo = i ? r.f1 : r.f0;
    let head = 0, foot = 0;
    for (let k = 0; k < p.length; k += 3) {
      if (Math.abs(f.colors[k] - fc[0]) > 1e-6 || Math.abs(f.colors[k + 2] - fc[2]) > 1e-6) continue;
      const q = toLocal([p[k], p[k + 2]]);
      const near = (c: Pt, t: number): boolean => Math.hypot(q[0] - (e[0] + (fo[0] - e[0]) * t), q[1] - (e[1] + (fo[1] - e[1]) * t)) < .6 && Math.abs(p[k + 1] - (deck + (rail - deck) * t + H.heights[0])) < .06;
      if (near(e, .03)) head++; if (near(fo, 1)) foot++;
    }
    assert.ok(head >= 4 && foot >= 4, `the ${r.ref} ramp's handrail on side ${i} falls from head to foot (${head}, ${foot})`);
  }
  // The mesh: a cut-out of close wires (more open than not), drawn alpha-tested in the platforms part.
  const t = perthMeshTexture(), d = t.image.data as Uint8Array; let open = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) open++;
  assert.ok(M.pitch[0] <= .06 && open / (d.length / 4) > .6 && open / (d.length / 4) < .95, `close mesh (${(open / (d.length / 4) * 100).toFixed(0)} % open)`);
  // The panel across platform 4's south ramp head, from near the deck to near the top rail.
  const m = batches.mesh.positions; let lo = Infinity, hi = -Infinity, zlo = Infinity, zhi = -Infinity;
  for (let i = 0; i < m.length; i += 3) { const q = toLocal([m[i], m[i + 2]]); if (Math.abs(q[0] - r4.e0[0]) > .05) continue; lo = Math.min(lo, m[i + 1]); hi = Math.max(hi, m[i + 1]); zlo = Math.min(zlo, q[1]); zhi = Math.max(zhi, q[1]); }
  assert.ok(lo < deck + .2 && hi > deck + 1, `a mesh panel across the head (${(lo - deck).toFixed(2)}-${(hi - deck).toFixed(2)} m)`);
  assert.ok(zhi - zlo > Math.abs(r4.e1[1] - r4.e0[1]) - 2 * F.inset - .05, `the panel spans the head (${(zhi - zlo).toFixed(2)} m)`);
  // In the frozen view, and the first thing a ray from the eye meets there: three points along the panel, mid-height.
  const scene = buildPerthScene({ lighting: false });
  try {
    const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, {pos: number[]; target: number[]; fov: number}>;
    const k = cams['pt-platform-4-south-end'], cam = new THREE.PerspectiveCamera(k.fov, 1280 / 800, .1, 5000);
    cam.position.set(k.pos[0], k.pos[1], k.pos[2]); cam.lookAt(k.target[0], k.target[1], k.target[2]); cam.updateMatrixWorld(true);
    const eye = new THREE.Vector3(...k.pos as [number, number, number]), mesh = scene.group.getObjectByName('perth-ramp-fence-mesh') as THREE.Mesh;
    assert.ok(mesh && (mesh.material as THREE.MeshLambertMaterial).map === t && (mesh.material as THREE.MeshLambertMaterial).alphaTest > 0 && mesh.parent === scene.parts.platforms, 'the panel drawn cut out, in the platforms part');
    // (Nine points along it, mid-height: the eye stands near its east end, so its west part is out of frame; a post may block one.)
    let inFrame = 0, clear = 0; const misses: string[] = [];
    for (const s of [.1, .2, .3, .4, .5, .6, .7, .8, .9]) {
      const z = zlo + (zhi - zlo) * s, w = toWorld([r4.e0[0], z]), pt = new THREE.Vector3(w[0], deck + .6, w[1]), v = pt.clone().project(cam);
      if (!(Math.abs(v.x) < .95 && Math.abs(v.y) < .95 && v.z < 1)) continue;
      inFrame++;
      const dir = pt.clone().sub(eye), dist = dir.length(), h = new THREE.Raycaster(eye, dir.normalize(), 0, dist + .5).intersectObject(scene.group, true)[0];
      if (h && h.object === mesh && Math.abs(h.distance - dist) < .05) clear++; else misses.push(`${s}: ${h?.object.name} at ${h?.distance.toFixed(2)} of ${dist.toFixed(2)} m`);
    }
    assert.ok(inFrame >= 3, `the fence in pt-platform-4-south-end's frame (${inFrame} of 9 points)`);
    assert.ok(clear >= 2, `the fence panel in clear view (${clear} of ${inFrame}; ${misses.join('; ')})`);
  } finally { scene.dispose(); }
});

test('round 6: the lift towers are clad in Abbott 6573357\'s mid-grey panels, with staggered horizontal joints', () => {
  const T = PERTH_STATION.tower, f = batches.fittings, p = f.positions, col = f.colors;
  const is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(col[i] - k[0]) < 1e-6 && Math.abs(col[i + 1] - k[1]) < 1e-6 && Math.abs(col[i + 2] - k[2]) < 1e-6; };
  const towers = plan.bridges.flatMap(br => br.landings.filter(l => l.tower).map(l => ({c: l.tower!.c, u: l.tower!.dir, deck: br.deck})));
  assert.equal(towers.length, 3);
  for (const t of towers) {
    let clad = 0, pale = 0; const joints = new Set<string>();
    for (let i = 0; i < p.length; i += 3) {
      // r: the distance out from the tower's middle in its own square (along its axis or across it, whichever is greater).
      const q = toLocal([p[i], p[i + 2]]), d: Pt = [q[0] - t.c[0], q[1] - t.c[1]], r = Math.max(Math.abs(d[0] * t.u[0] + d[1] * t.u[1]), Math.abs(-d[0] * t.u[1] + d[1] * t.u[0]));
      if (r > T.size / 2 + .3 || p[i + 1] < WAVERLEY_LEVELS.platform || p[i + 1] > t.deck + T.above) continue;
      if (is(i, PERTH_PAINT.towerClad)) clad++;
      // (below the deck, where only the tower stands: the lift bridge's slab is the pale grey too)
      if (is(i, PERTH_PAINT.modern) && r > T.size / 2 - .05 && p[i + 1] < t.deck - 1) pale++;
      // A horizontal joint: a seam box 0.04 m high (its top and bottom vertices 0.04 apart), keyed by its height to the centimetre.
      if (is(i, PERTH_PAINT.seam) && p[i + 1] < t.deck + T.above - .3) joints.add((Math.round(p[i + 1] * 50) / 50).toFixed(2));
    }
    assert.ok(clad >= 16, `the tower at ${t.c} clad in towerClad (${clad} vertices)`);
    assert.equal(pale, 0, 'no pale frame grey on the tower\'s faces');
    // Staggered joints: heights from both the full and the half-joint rows.
    assert.ok(joints.size >= 2 * Math.floor((t.deck + T.above - WAVERLEY_LEVELS.platform - .3) / T.joint), `staggered horizontal joints (${joints.size} heights)`);
  }
  const g = PERTH_PAINT.towerClad, [r, gg, b] = [g >> 16, (g >> 8) & 255, g & 255], m = PERTH_PAINT.modern;
  assert.ok(r >= 0x88 && r <= 0xb0 && Math.abs(r - b) <= 0x10 && Math.abs(r - gg) <= 0x10 && r < (m >> 16), `mid grey, darker than the frames (${g.toString(16)})`);
});

test('round 7: the lift bridge\'s frame and stairs grey (Abbott 6573357); a lift door under a glass hood at platform and deck level on every tower; the island building\'s windows set deep', () => {
  // The frame paint. Round 8 (the round-7 score: Abbott 6573357 shows the frame and posts off-white against the mid-grey cladding; round
  // 7's 0xaeb3b5 was darker than the photo): an off-white, well over the cladding, short of pure white. (Round 7 asserted <= 0xc0.)
  const hexes = (h: number): number[] => [h >> 16, (h >> 8) & 255, h & 255], [fr, fg, fb] = hexes(PERTH_PAINT.frame);
  assert.ok(Math.abs(fr - fg) <= 0x08 && Math.abs(fr - fb) <= 0x08, `grey (${PERTH_PAINT.frame.toString(16)})`);
  assert.ok(fr >= (PERTH_PAINT.towerClad >> 16) + 0x30 && fr >= 0xd0 && fr <= 0xec, `off-white, well over the cladding (${fr.toString(16)})`);
  // Doors and hoods: at each tower, leaf-coloured vertices on two opposite faces, one at each level, each under a hood pane.
  const T = PERTH_STATION.tower, D = PERTH_LIFT_DOOR, f = batches.fittings, p = f.positions, col = f.colors, leaf = rgb(D.leaf), glassF = batches.panes.positions;
  const towers = plan.bridges.flatMap(br => br.landings.filter(l => l.tower).map(l => ({c: l.tower!.c, u: l.tower!.dir, deck: br.deck})));
  const deck0 = WAVERLEY_LEVELS.platform;
  for (const t of towers) for (const [sg, y] of [[1, deck0], [-1, t.deck]] as [number, number][]) {
    let leaves = 0, hood = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(col[i] - leaf[0]) > 1e-6 || Math.abs(col[i + 2] - leaf[2]) > 1e-6) continue;
      const q = toLocal([p[i], p[i + 2]]), out = sg * ((q[0] - t.c[0]) * t.u[0] + (q[1] - t.c[1]) * t.u[1]);
      if (out > T.size / 2 && out < T.size / 2 + .1 && p[i + 1] >= y - 1e-6 && p[i + 1] <= y + D.height + 1e-6) leaves++;
    }
    for (let i = 0; i < glassF.length; i += 3) {
      const q = toLocal([glassF[i], glassF[i + 2]]), out = sg * ((q[0] - t.c[0]) * t.u[0] + (q[1] - t.c[1]) * t.u[1]), yh = y + T.hood[2];
      if (out > T.size / 2 && out < T.size / 2 + T.hood[0] + .1 && Math.abs(glassF[i + 1] - yh) < .05) hood++;
    }
    assert.ok(leaves >= 16, `the tower at ${t.c.map(v => v.toFixed(1))}: a two-leaf lift door at ${y.toFixed(2)} (${leaves} vertices)`);
    assert.ok(hood >= 8, `the tower at ${t.c.map(v => v.toFixed(1))}: a glass hood over its door at ${y.toFixed(2)} (${hood} vertices)`);
  }
  // Windows: the dressings round the island building's ground-floor windows stand 0.28 m or more proud of its wall (round 6: 0.14 m).
  const B = PERTH_STATION.building, st = islandBuildingBatches(plan.island).stone, kd = rgb(PERTH_PAINT.stoneDressing), ring = cleanRing(plan.island);
  let deep = 0;
  for (let i = 0; i < st.positions.length; i += 3) {
    const y = st.positions[i + 1], q: Pt = [st.positions[i], st.positions[i + 2]];
    if (Math.abs(st.colors[i] - kd[0]) > 1e-6 || y < deck0 + B.groundWindow[2] + .2 || y > deck0 + B.groundWindow[2] + B.groundWindow[1] - .2) continue;
    if (!inRing(q, ring) && ringDistance(q, ring) > .28) deep++;
  }
  assert.ok(deep >= 100, `deep jambs and mullions at the ground-floor windows (${deep} vertices 0.28 m out)`);
});

test('round 8: the bands\' undersides are R-pt1-a\'s dark brown-grey boarding, boards mapped, no glow; drawn apart from the bands', () => {
  // (Round 7 asserted a pale, sky-lit tone, which the round-7 score found wrong against R-pt1-a and R-pt1-d north; corrected here.)
  const scene = buildPerthScene({ lighting: false });
  try {
    const m = (scene.group.getObjectByName('perth-roof-band-soffits') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const lum = (c: THREE.Color): number => c.r + c.g + c.b, t = perthBoardTexture(), d = t.image.data as Uint8Array, n = t.image.width;
    assert.equal(m.color.getHex(), PERTH_BAND_SOFFIT);
    assert.ok(m.map === t && m.side === THREE.DoubleSide, 'the boards mapped, seen from both sides');
    assert.equal(lum(m.emissive), 0, `no glow (${m.emissive.getHexString()})`);
    // The tone the eye sees: the paint times the map's mean, about the bands' brown-grey (round 6, which read dark from the platforms),
    // brown-grey (red over blue), and well under the milky glazing over it (perthGlazing, 0xc9c7bf).
    let mean = 0; for (let i = 0; i < d.length; i += 4) mean += d[i] / 255; mean /= d.length / 4;
    const seen = m.color.clone().multiplyScalar(new THREE.Color().setRGB(mean, mean, mean, THREE.SRGBColorSpace).r), band = new THREE.Color(PERTH_BAND_BROWN);
    assert.ok(lum(seen) <= lum(band) * 1.12 && lum(seen) >= lum(band) * .88, `the boards' tone about the bands' (${seen.getHexString()} vs ${band.getHexString()})`);
    assert.ok(seen.r > seen.b && lum(seen) < lum(new THREE.Color(0xc9c7bf)) * .8, `dark brown-grey under the glazing (${seen.getHexString()})`);
    // The boards: a dark joint row every PERTH_BOARDS.board m, and the boards between them not all one tone.
    const B = PERTH_BOARDS, row = (j: number): number => d[4 * j * n] / 255, joints: number[] = [], tones = new Set<number>();
    for (let j = 0; j < n; j++) { if (row(j) < B.joint + .02) { if (!joints.length || j - joints[joints.length - 1] > 1) joints.push(j); } else tones.add(Math.round(row(j) * 20)); }
    assert.equal(joints.length, Math.round(B.tile / B.board), `a joint per board (${joints.length})`);
    assert.ok(tones.size >= 3, `the boards vary in tone (${tones.size})`);
  } finally { scene.dispose(); }
  { const low = WAVERLEY_ROOF_PROFILE.gutter - PERTH_BAND_DROP, s = batches.strips.positions; let k = 0; for (let i = 1; i < s.length; i += 3) if (Math.abs(s[i] - low) < 1e-6) k++;
    assert.ok(batches.soffits.count > 100 && k === 0, `the undersides are a batch of their own (${batches.soffits.count}; ${k} left in the bands' batch)`); }
  // The boards run across the bands: the soffits' UVs are track-frame metres with v along z', the bands' long side.
  const u = batches.soffits.uvs, p = batches.soffits.positions;
  for (let i = 0; i < Math.min(u.length / 2, 300); i++) { const q = toLocal([p[3 * i], p[3 * i + 2]]); assert.ok(Math.abs(u[2 * i] - q[0]) < 1e-3 && Math.abs(u[2 * i + 1] - q[1]) < 1e-3, 'soffit UVs in track-frame metres'); }
});

test('round 8: R-pt1-a\'s ring ornament fills every arched brace\'s spandrel at the column heads, cut out; no rings in the girders\' lattice panels', () => {
  // The cut-out: open rings, neighbours nearly touching, each with a scroll inside; open between them.
  const R = PERTH_RING_ORNAMENT, t = perthRingTexture(), d = t.image.data as Uint8Array, n = t.image.width;
  const alpha = (x: number, y: number): number => d[4 * (Math.floor((y / R.cell + .5) * n) * n + Math.floor((x / R.cell + .5) * n)) + 3];
  for (let k = 0; k < 8; k++) { const a = k / 8 * 2 * Math.PI; assert.equal(alpha(R.ring * Math.cos(a), R.ring * Math.sin(a)), 255, `the ring drawn at ${k}/8`); }
  assert.equal(alpha(0, 0), 0, 'open in the ring\'s middle');
  assert.equal(alpha(-R.scroll, 0), 255, 'the scroll inside it');
  assert.equal(alpha((R.ring + R.scroll) / 2, (R.ring + R.scroll) / 2 * .3), 0, 'open between the ring and the scroll');
  let open = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) open++;
  assert.ok(open / (d.length / 4) > .55 && open / (d.length / 4) < .9, `mostly open, as R-pt1-a's scrollwork (${(open / (d.length / 4) * 100).toFixed(0)} %)`);
  // Drawn, alpha-tested, in the roof part.
  const scene = buildPerthScene({ lighting: false });
  try {
    const mesh = scene.group.getObjectByName('perth-roof-brace-ornament') as THREE.Mesh, m = mesh.material as THREE.MeshLambertMaterial;
    assert.ok(m.map === t && m.alphaTest > 0 && m.side === THREE.DoubleSide && mesh.parent === scene.parts.roof, 'the ornament drawn cut out, in the roof part');
  } finally { scene.dispose(); }
  // On every brace, the whole roof over, not near one camera: each brace with a piece drawn carries plates.
  const braces = gutterBraces(plan), o = batches.ornament.positions, W = WAVERLEY_STRUCTURE, under = W.gutterGirderTop - W.gutterGirderDepth;
  const has = new Set<number>();
  for (let i = 0; i < o.length; i += 3) { const q = toLocal([o[i], o[i + 2]]); const k = braces.findIndex(b => Math.abs(q[0] - b.a[0]) < 1e-3 && q[1] >= b.a[1] - 1e-3 && q[1] <= b.c[1] + 1e-3); if (k >= 0) has.add(k); }
  const drawn = braces.filter(b => [.1, .3, .7, .9].some(s => { const z = b.a[1] + (b.c[1] - b.a[1]) * s; return b.keep([b.a[0], z], under - .5); }));
  assert.ok(has.size >= drawn.length && drawn.length >= 30, `ornament on every brace drawn (${has.size} of ${drawn.length})`);
  const xs = [...has].map(k => braces[k].a[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 150, `from end to end of the roof (${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} m)`);
  // No rings in the girders' lattice panels: no ironwork vertex in a girder's plane 0.2-0.45 m to either side of a panel's middle and
  // level with it (round 7's rings had flats meeting there; the panels' own members end at its corners, 0.57 m or more out, and the roof
  // members crossing the girder's plane do so 0.28 m or more above or below its middle).
  const ir = batches.ironwork.positions, mid = W.gutterGirderTop - W.gutterGirderDepth / 2;
  const centres = plan.structure.gutters.flatMap(([x, z0, z1]) => { const len = z1 - z0, k = Math.max(1, Math.round(len / (W.gutterGirderDepth - W.chordDepth))); return Array.from({length: k}, (_, i) => [x, z0 + len * (i + .5) / k] as Pt); });
  const byX = new Map<number, number[]>(); for (const [x, z] of centres) byX.set(x, [...(byX.get(x) ?? []), z]);
  // (Counted per panel: a ring puts 8 or more there; a stray roof member's end, a few.)
  const per = new Map<string, number>();
  for (let i = 0; i < ir.length; i += 3) {
    const q = toLocal([ir[i], ir[i + 2]]), x = [...byX.keys()].find(v => Math.abs(v - q[0]) < .05); if (x === undefined || Math.abs(ir[i + 1] - mid) >= .1) continue;
    for (const z of byX.get(x)!) if (Math.abs(q[1] - z) > .2 && Math.abs(q[1] - z) < .45) per.set(`${x}/${z}`, (per.get(`${x}/${z}`) ?? 0) + 1);
  }
  const most = Math.max(0, ...per.values());
  assert.ok(most < 4, `no rings in the girders' lattice panels (at most ${most} vertices in a panel)`);
});

test('round 7: the north bridge\'s lattice fills its side girders\' whole depth, down past a thin maroon slab (R-pt1-d north)', () => {
  const br = plan.bridges.find(b => b.kind === 'lattice')!, half = PERTH_STATION.deckHalf, p = batches.fittings.positions, nn = batches.fittings.normals;
  const lattice = new Map<number, number>(), slabLo = new Map<number, number>(), slabHi = new Map<number, number>();
  for (let i = 0; i < p.length; i += 3) {
    const q = toLocal([p[i], p[i + 2]]), dx = Math.abs(q[0] - br.along), z = Math.floor(q[1]), y = p[i + 1];
    if (q[1] < br.z0 || q[1] > br.z1 || br.landings.some(l => Math.hypot(q[0] - l.start[0], q[1] - l.start[1]) < 4)) continue;
    if (Math.abs(dx - (half - .15)) < .06) lattice.set(z, Math.min(lattice.get(z) ?? Infinity, y));
    if (Math.abs(dx - half) < .01 && nn[i + 1] < -.9) slabLo.set(z, Math.min(slabLo.get(z) ?? Infinity, y));
    if (Math.abs(dx - half) < .01 && nn[i + 1] > .9) slabHi.set(z, Math.max(slabHi.get(z) ?? -Infinity, y));
  }
  let below = 0, bins = 0, thick = 0;
  for (const [z, lo] of slabLo) {
    const g = lattice.get(z); if (g === undefined) continue;
    bins++; if (g < lo - .1) below++;
    const hi = slabHi.get(z); if (hi !== undefined) thick = Math.max(thick, hi - lo);
  }
  assert.ok(bins >= 8 && below >= bins * .8, `the girder's lattice runs down past the slab's underside (${below} of ${bins} metres)`);
  assert.ok(thick > 0 && thick <= .16 + .05, `a thin slab edge (${thick.toFixed(2)} m, its 1 m pieces' bow included)`);
});

test('round 6: R-pt1-a\'s arched, pierced braces stand under the gutter girders, in the across-track planes the platform cameras face', () => {
  const W = WAVERLEY_STRUCTURE, under = W.gutterGirderTop - W.gutterGirderDepth, G = PERTH_GUTTER_BRACE, braces = gutterBraces(plan);
  const lines = new Set(braces.map(b => b.a[0]));
  assert.ok(braces.length >= 30 && lines.size >= 15, `braces under most gutter girders (${braces.length} on ${lines.size} lines)`);
  for (const b of braces) assert.ok(b.a[0] === b.c[0] && plan.structure.gutters.some(([x, z0, z1]) => x === b.a[0] && b.a[1] >= z0 && b.c[1] <= z1), `brace ${b.a}-${b.c} lies under a gutter girder`);
  // The pierced plates in those planes: facing along the tracks (toward the platform cameras), from the rib up to the girder's underside,
  // deep by the springings, and nowhere a bridge stands. (Round 8: these plates carry R-pt1-a's ring ornament, in batches.ornament; round 6
  // and 7 drew them pierced, in batches.spandrels with the column girders' spandrels.)
  const s = batches.ornament, p = s.positions, n = s.normals, o = toLocal([0, 0]);
  let facing = 0;
  const depth = new Map<string, {lo: number}>();
  for (let i = 0; i < p.length; i += 3) {
    const q = toLocal([p[i], p[i + 2]]), b = braces.find(r => Math.abs(q[0] - r.a[0]) < 1e-3 && q[1] >= r.a[1] - 1e-3 && q[1] <= r.c[1] + 1e-3);
    if (!b) continue;
    const nl = toLocal([n[i], n[i + 2]]);
    assert.ok(Math.abs(nl[0] - o[0]) > .99, `a brace plate at ${q} faces along the tracks`);
    assert.ok(p[i + 1] <= under + 1e-6 && p[i + 1] >= under - G.drop - 1e-6, `a brace plate at ${q} y ${p[i + 1]} between the springing and the girder`);
    assert.ok(!plan.clear.some(([x0, x1, z0, z1]) => q[0] > x0 && q[0] < x1 && q[1] > z0 && q[1] < z1), `a brace plate in a bridge at ${q}`);
    facing++;
    const k = `${b.a[0]}/${b.a[1]}`, e = depth.get(k) ?? {lo: Infinity}, t = (q[1] - b.a[1]) / (b.c[1] - b.a[1]);
    if (t < .15 || t > .85) e.lo = Math.min(e.lo, p[i + 1]);
    depth.set(k, e);
  }
  assert.ok(facing >= braces.length * 12, `pierced plates under the braces (${facing} vertices)`);
  let deep = 0;
  for (const e of depth.values()) if (under - e.lo > .5) deep++;
  assert.ok(deep >= braces.length * .8, `deep plates by the springings (${deep} of ${braces.length})`);
});

test('round 6: platform 4\'s clock is in clear view of the frozen pt-platform-4-clock camera, its dial not behind a column', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8')) as Record<string, {pos: number[]}>;
  const C = PERTH_STATION.clock, c = plan.clocks.find(k => k.ref === C.kioskRef)!, eye = new THREE.Vector3(...cams['pt-platform-4-clock'].pos as [number, number, number]);
  // The dial facing the camera: on the case's end nearer it, `out` = past the stage's face by the hang, its centre hangHeight over the deck.
  const w: Pt = [-c.out[1], c.out[0]], out = C.stage[1] + C.hang, yc = WAVERLEY_LEVELS.platform + C.hangHeight;
  const ends = [-1, 1].map(s => { const q: Pt = [c.at[0] + c.out[0] * out + w[0] * s * (C.case[0] / 2 + .02), c.at[1] + c.out[1] * out + w[1] * s * (C.case[0] / 2 + .02)], p = toWorld(q); return new THREE.Vector3(p[0], yc, p[1]); });
  const dial = ends.sort((a, b) => a.distanceTo(eye) - b.distanceTo(eye))[0];
  // In the frame (the capture's 1280 x 800 at the camera's fov), with a margin.
  const k = cams['pt-platform-4-clock'] as unknown as {pos: number[]; target: number[]; fov: number}, cam = new THREE.PerspectiveCamera(k.fov, 1280 / 800, .1, 5000);
  cam.position.copy(eye); cam.lookAt(new THREE.Vector3(...k.target as [number, number, number])); cam.updateMatrixWorld(true);
  const ndc = dial.clone().project(cam);
  assert.ok(Math.abs(ndc.x) < .9 && Math.abs(ndc.y) < .9 && ndc.z < 1, `the dial in pt-platform-4-clock's frame (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
  const scene = buildPerthScene({ lighting: false });
  try {
    scene.group.updateMatrixWorld(true);
    // The centre and four points round the hour ring, each reached by a ray from the eye with nothing in front of the dial.
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(c.out[0], 0, c.out[1]);
    const sw = toWorld([c.out[0], c.out[1]]), o = toWorld([0, 0]); side.set(sw[0] - o[0], 0, sw[1] - o[1]).normalize();
    for (const [du, dv] of [[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]]) {
      const t = dial.clone().addScaledVector(side, du * C.radius).addScaledVector(up, dv * C.radius), dir = t.clone().sub(eye), dist = dir.length();
      const h = new THREE.Raycaster(eye, dir.normalize(), 0, dist + 1).intersectObject(scene.group, true)[0];
      assert.ok(h && h.distance > dist - .1, `the dial point (${du}, ${dv}) is hidden by ${h?.object.name} ${h ? (dist - h.distance).toFixed(2) : ''} m in front of it`);
    }
  } finally { scene.dispose(); }
});

test('round 7: the clock dials carry R-pt1-a2\'s Roman numerals, upright from in front; an ornamental corbel hangs under platform 4\'s case', () => {
  // The texture: ink round each hour's place on the numeral circle, none half-way between, the minute track's two lines, and more ink for
  // more strokes (VIII over V over I; IIII, not IV, over III).
  const D = PERTH_DIAL, tex = perthDialTexture(), n = tex.image.width, px = tex.image.data as Uint8Array;
  const inkAt = (a: number, r0: number, r1: number, half: number): number => {
    let ink = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + .5) / n * 2 - 1, y = (j + .5) / n * 2 - 1, r = Math.hypot(x, y), da = Math.abs(((Math.atan2(y, x) - a) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      if (r >= r0 && r <= r1 && da <= half && px[4 * (j * n + i)] < 128) ink++;
    }
    return ink;
  };
  const hour = (k: number): number => Math.PI / 2 - k * Math.PI / 6, band: [number, number] = [D.numerals - D.height / 2 - D.stroke, D.numerals + D.height / 2 + D.stroke];
  const ink = PERTH_ROMAN.map((_, k) => inkAt(hour(k), band[0], band[1], Math.PI / 13));
  for (let k = 0; k < 12; k++) {
    assert.ok(ink[k] > 20, `the numeral ${PERTH_ROMAN[k]} drawn (${ink[k]} px)`);
    assert.equal(inkAt(hour(k + .5), band[0], band[1], .02), 0, `no ink between ${PERTH_ROMAN[k]} and the next`);
  }
  assert.ok(ink[8] > ink[5] && ink[5] > ink[1] && ink[4] > ink[3] && ink[12 % 12] > ink[10], `more strokes, more ink (${ink.join(', ')})`);
  for (const r of D.track) assert.ok(inkAt(0, r - .015, r + .015, Math.PI) > n, `the minute track's line at ${r}`);
  assert.ok(inkAt(0, 0, band[0] - .02, Math.PI) === 0, 'the dial\'s middle plain');
  // The geometry: both dials of both clocks textured, and laid so the texture reads upright from in front: v up, u to the viewer's right.
  const g = batches.dials, p = g.positions, uv = g.uvs, nm = g.normals;
  assert.ok(p.length / 3 >= 4 * 24, `four textured dial faces (${p.length / 3} vertices)`);
  let up = 0, right = 0;
  for (let i = 0; i + 2 < p.length / 3; i += 3) for (const [a, b] of [[i, i + 1], [i + 1, i + 2]]) {
    const dy = p[3 * b + 1] - p[3 * a + 1], dv = uv[2 * b + 1] - uv[2 * a + 1];
    // The viewer's right on a face whose normal (toward the viewer) is n: up x n.
    const rx = nm[3 * a + 2], rz = -nm[3 * a], dr = (p[3 * b] - p[3 * a]) * rx + (p[3 * b + 2] - p[3 * a + 2]) * rz, du = uv[2 * b] - uv[2 * a];
    up += dy * dv; right += dr * du;
  }
  assert.ok(up > 0 && right > 0, `numerals upright and not mirrored from in front (up ${up.toFixed(3)}, right ${right.toFixed(3)})`);
  // The corbel (round 8, the round-7 score: it hung half inside the stage, reading as a thin gilt V): broad and stepped, wholly in front
  // of the stage's face and its cornice (0.1 m proud of it). First alone, in the case's frame (out along +x, along the wall in z).
  const C = PERTH_STATION.clock, K = PERTH_CLOCK_CORBEL, deck = WAVERLEY_LEVELS.platform, c4 = plan.clocks.find(c => c.ref === C.kioskRef)!;
  const front = C.stage[1] + .1, cw = C.case[0], solo = new Batch({colored: true, uv: false});
  clockCorbel(solo, (o, y, along = 0) => [o, y, along], C.stage[1] + K.back, 0, cw, 0);
  const sx = solo.positions.filter((_, i) => i % 3 === 0), sz = solo.positions.filter((_, i) => i % 3 === 2), sy = solo.positions.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...sx) >= front + 1e-6, `clear of the stage and its cornice (back ${Math.min(...sx).toFixed(3)} m out, the cornice ${front.toFixed(2)})`);
  assert.ok(Math.max(...sz) - Math.min(...sz) >= .9 * cw, `broad: nearly the case's width (${(Math.max(...sz) - Math.min(...sz)).toFixed(2)} of ${cw} m)`);
  // Stepped: the timber tiers' widths along the wall, read at each tier joint (the wider of the two tiers meeting there), all different.
  const wood = [rgb(PERTH_PAINT.timber), rgb(PERTH_PAINT.timberDark)], isWood = (i: number): boolean => wood.some(k => Math.abs(solo.colors[3 * i] - k[0]) < 1e-6 && Math.abs(solo.colors[3 * i + 2] - k[2]) < 1e-6);
  const levels = new Map<string, number[]>(); sy.forEach((y, i) => { if (isWood(i)) { const key = y.toFixed(3); levels.set(key, [...(levels.get(key) ?? []), sz[i]]); } });
  const widths = new Set([...levels.values()].map(zs => (Math.max(...zs) - Math.min(...zs)).toFixed(2)));
  assert.ok(levels.size === K.tiers + 1 && widths.size === K.tiers, `stepped: ${K.tiers} tiers of ${widths.size} widths (${[...widths].join(', ')})`);
  // Then in place: under platform 4's case, gilt and timber in front of the stage.
  const base = deck + C.hangHeight - C.case[2] / 2, f = batches.fittings, fc = f.colors, fp = f.positions;
  const is = (i: number, hex: number): boolean => { const k = rgb(hex); return Math.abs(fc[i] - k[0]) < 1e-6 && Math.abs(fc[i + 1] - k[1]) < 1e-6 && Math.abs(fc[i + 2] - k[2]) < 1e-6; };
  let gilt = 0, tiers = 0;
  for (let i = 0; i < fp.length; i += 3) {
    const q = toLocal([fp[i], fp[i + 2]]), o = (q[0] - c4.at[0]) * c4.out[0] + (q[1] - c4.at[1]) * c4.out[1], s = (q[1] - c4.at[1]) * c4.out[0] - (q[0] - c4.at[0]) * c4.out[1];
    if (o < front || o > front + K.depth[0] + .1 || Math.abs(s) > cw / 2 + .05 || fp[i + 1] > base + 1e-6 || fp[i + 1] < base - K.drop - .25) continue;
    if (is(i, PERTH_PAINT.gilt)) gilt++;
    if ((is(i, PERTH_PAINT.timber) || is(i, PERTH_PAINT.timberDark)) && fp[i + 1] < base - .05) tiers++;
  }
  assert.ok(gilt >= 24 + 2 * 8 && tiers >= K.tiers * 24 - 12, `a corbel under the case, in front of the stage (gilt ${gilt}, timber ${tiers})`);
});
