// P1 station (perth-station.ts, perth-station-structure.ts): the roof's footprint, the island building's trace, the footbridges and the
// clearances the rubric (gfx-rubrics/perth-station.md) asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { buildPerthScene, stationOutline } from '../src/perth-scene.ts';
import { PERTH_BAND_BROWN, PERTH_GREY_PLATFORMS, PERTH_OPEN_ASPHALT, PERTH_OPEN_GREY } from '../src/perth-station.ts';
import { archRib, boardedSide, islandBuildingBatches, PERTH_BOARDED_PLATFORM, PERTH_SPANDREL, PERTH_PAINT, platformParts, perthRoofOver, PERTH_BAND_DROP, PERTH_BAY_NOTCH, PERTH_BAY_ROOF, PERTH_CANOPY_SPLIT, PERTH_ISLAND_BUILDING, PERTH_ROOF_RIDGE, PERTH_SHED_NORTH, PERTH_STATION, bayRoofHeight, inRing, perthRoofRings, perthStationBatches, perthStationPlan, ringDistance, toLocal, toWorld } from '../src/perth-station-structure.ts';
import { Batch, rgb } from '../src/materials.ts';
import { cleanRing } from '../src/waverley-mesh.ts';
import { WAVERLEY_ROOF_PROFILE, WAVERLEY_ROOF_STRIP_LIFT } from '../src/waverley-roof.ts';

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
  const s = batches.strips.positions, over = WAVERLEY_ROOF_PROFILE.gutter + WAVERLEY_ROOF_STRIP_LIFT, under = WAVERLEY_ROOF_PROFILE.gutter - PERTH_BAND_DROP;
  let up = 0, down = 0;
  for (let i = 1; i < s.length; i += 3) { if (Math.abs(s[i] - over) < 1e-6) up++; if (Math.abs(s[i] - under) < 1e-6) down++; }
  assert.ok(up > 100 && down === up, `${down} band vertices under the gutter line for ${up} over it`);
});

test('round 3: the column girders\' spandrels are pierced lattice (R-pt1-c): crossing bars and bosses in the deep cells by the springings, none at the crown', () => {
  const one = new Batch(); one.box([0, 0, 0], [1, 1, 1]); const V = one.positions.length;
  const b = new Batch(), y0 = 5.25, top = 6.55, L = 9;
  archRib(b, [0, 0], [L, 0], y0, top - .02, () => top, [0, 0, 0], PERTH_SPANDREL);
  const bosses: number[] = [], p = b.positions;
  for (let i = 0; i < p.length; i += V) {
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (let k = i; k < i + V; k += 3) { xs.push(p[k]); ys.push(p[k + 1]); zs.push(p[k + 2]); }
    const ext = [xs, ys, zs].map(a => Math.max(...a) - Math.min(...a));
    if (ext.every(e => Math.abs(e - PERTH_SPANDREL.boss) < 1e-6)) bosses.push((Math.max(...xs) + Math.min(...xs)) / 2);
  }
  for (let k = 1; k < p.length; k += 3) assert.ok(p[k] >= y0 - .15 && p[k] <= top + .05, `a spandrel member at y ${p[k]} outside the rib-to-girder band`);
  assert.ok(bosses.filter(x => x < L / 3).length >= 2 && bosses.filter(x => x > 2 * L / 3).length >= 2, `bosses by both springings (${bosses.map(x => x.toFixed(2))})`);
  assert.equal(bosses.filter(x => x > L / 3 && x < 2 * L / 3).length, 0, 'no lattice where the rib meets the girder at the crown');
  // archedIronwork draws every column span with PERTH_SPANDREL, so this is the real spandrels' pattern.
  const plain = new Batch(); archRib(plain, [0, 0], [L, 0], y0, top - .02, () => top, [0, 0, 0], {...PERTH_SPANDREL, lattice: false});
  assert.ok(p.length > plain.positions.length, 'the lattice adds members over the plain rib');
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
    assert.ok(!m.map && m.color.getHex() === PERTH_OPEN_ASPHALT, 'continuous red asphalt, no flag texture');
    // Lead ruling after round 3: the Dundee platforms' open ends are dark grey (R-pt1-c, Champion 2011), the red stays off them.
    const greyMesh = scene.group.getObjectByName('perth-platform-surfaces-open-grey') as THREE.Mesh;
    assert.ok(greyMesh, 'the Dundee platforms\' open ends are drawn grey');
    assert.equal((greyMesh.material as THREE.MeshLambertMaterial).color.getHex(), PERTH_OPEN_GREY);
    const dundee = data.platforms.filter(p => PERTH_GREY_PLATFORMS.includes(p.ref ?? '')).map(p => cleanRing(p.path));
    assert.equal(dundee.length, 2, 'platforms 1 and 2 are mapped');
    const inDundee = (x: number, z: number): boolean => dundee.some(r => inRing([x, z], r) || ringDistance([x, z], r) < .05);
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
    assert.ok(c.r + c.g + c.b > .25 && c.r > c.b, `bands brown-grey (${c.getHexString()}), not near-black`);
  } finally { scene.dispose(); }
  const w = batches.weather.positions; let over = 0;
  for (let i = 0; i < w.length; i += 3) if (inRing(toLocal([w[i], w[i + 2]]), plan.local.canopy) && w[i + 1] < PERTH_STATION.canopy.top + PERTH_STATION.canopy.rise + .1) over++;
  assert.ok(over > 50, `the weathered skin over the Dundee canopies (${over} vertices)`);
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
