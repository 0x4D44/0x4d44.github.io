// ALM-BUG-FLU-00021: St Leonard's Bridge (OSM way/24228327) over Perth's south throat was missing. These hold that it is drawn over the
// mapped tracks it crosses, at the LiDAR's road level, with the arches clear of the trains and the piers off the track.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { CLEAR, skyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { REFERENCE } from '../src/atmosphere.ts';
import { LIGHTS } from '../src/world.ts';
import { ST_LEONARDS, ST_LEONARDS_APPROACHES, ST_LEONARDS_COLOURS, ST_LEONARDS_LENGTH, ST_LEONARDS_LINE, ST_LEONARDS_SOURCE, SOFFIT_TONES, stLeonardsAt, stLeonardsBridge, stLeonardsFrame, stLeonardsSoffit } from '../src/perth-st-leonards-bridge.ts';
import { Batch, rgb as rgbOf } from '../src/materials.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());

/** Where each mapped rail crosses the bridge way's centreline: metres along the way, the rail's id, and the crossing segment. */
function crossings(): { id: string; s: number; p: Pt; seg: [Pt, Pt] }[] {
  const [a, b] = ST_LEONARDS_LINE as [Pt, Pt], out: { id: string; s: number; p: Pt; seg: [Pt, Pt] }[] = [];
  for (const r of data.rails) for (let i = 0; i + 1 < r.path.length; i++) {
    const p = r.path[i] as Pt, q = r.path[i + 1] as Pt, d = (a[0] - b[0]) * (p[1] - q[1]) - (a[1] - b[1]) * (p[0] - q[0]);
    if (!d) continue;
    const t = ((a[0] - p[0]) * (p[1] - q[1]) - (a[1] - p[1]) * (p[0] - q[0])) / d, u = -((a[0] - b[0]) * (a[1] - p[1]) - (a[1] - b[1]) * (a[0] - p[0])) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ id: r.id, s: t * ST_LEONARDS_LENGTH, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], seg: [p, q] });
  }
  return out;
}

test('St Leonard\'s Bridge is OSM way/24228327 and is cited', () => {
  assert.ok(ST_LEONARDS_LENGTH > 70 && ST_LEONARDS_LENGTH < 80, `way length ${ST_LEONARDS_LENGTH}`);
  // south of the station (z is south), over the main lines
  assert.ok(ST_LEONARDS_LINE.every(p => p[1] > 140 && p[1] < 190), JSON.stringify(ST_LEONARDS_LINE));
  assert.match(ST_LEONARDS_SOURCE.osm, /way\/24228327$/);
  assert.match(ST_LEONARDS_SOURCE.photo, /geograph\.org\.uk\/photo\/591926$/);
});

test('the arches span every mapped track the way crosses, with the soffit at least 4.5 m and the road 5.5-6.5 m over the rail', () => {
  const xs = crossings();
  // the five running lines the way crosses in OSM (SCM5 and HGL1 pairs and the up main) and the crossover
  assert.ok(xs.length >= 6, `crossings ${JSON.stringify(xs.map(x => x.id))}`);
  assert.ok(ST_LEONARDS.road >= 5.5 && ST_LEONARDS.road <= 6.5);
  for (const x of xs) {
    assert.ok(x.s > ST_LEONARDS.abutments[0] + 2 && x.s < ST_LEONARDS.abutments[1] - 2, `${x.id} at ${x.s.toFixed(1)} m between the abutments`);
    // the rail's line under the deck's whole width (its crossing segment, extended straight: the rails are straight here): the soffit over it
    const [p, q] = x.seg.map(stLeonardsFrame);
    for (let o = -ST_LEONARDS.half; o <= ST_LEONARDS.half; o += 1) {
      const s = p!.s + (o - p!.o) / (q!.o - p!.o) * (q!.s - p!.s), soffit = stLeonardsSoffit(s);
      assert.ok(soffit >= 4.5, `${x.id}: soffit ${soffit.toFixed(2)} m over the rail at side offset ${o} (s ${s.toFixed(2)})`);
    }
  }
});

test('no pier or abutment stands within 2 m of a mapped rail (plan), across the deck\'s whole width', () => {
  const blocks = [...ST_LEONARDS.piers.map(c => [c - ST_LEONARDS.pierWidth / 2, c + ST_LEONARDS.pierWidth / 2]), [-Infinity, ST_LEONARDS.abutments[0]], [ST_LEONARDS.abutments[1], Infinity]];
  for (const r of data.rails) for (let i = 0; i + 1 < r.path.length; i++) {
    const a = r.path[i]!, b = r.path[i + 1]!, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25);
    for (let k = 0; k <= n; k++) {
      const f = stLeonardsFrame([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      if (Math.abs(f.o) > ST_LEONARDS.half + .5 || Math.abs(f.s - ST_LEONARDS_LENGTH / 2) > ST_LEONARDS_LENGTH) continue;
      for (const [s0, s1] of blocks) assert.ok(f.s < s0! - 2 || f.s > s1! + 2, `${r.id} at s ${f.s.toFixed(2)}, o ${f.o.toFixed(2)} within 2 m of [${s0}, ${s1}]`);
    }
  }
});

test('the scene draws it: from above, the road at the LiDAR level over each track; from the rail, the arch overhead', () => {
  const mesh = scene.group.getObjectByName('perth-st-leonards-bridge') as THREE.Mesh | undefined;
  assert.ok(mesh, 'the bridge mesh is in the scene');
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const x of crossings()) {
    ray.set(new THREE.Vector3(x.p[0], 60, x.p[1]), new THREE.Vector3(0, -1, 0));
    const top: THREE.Intersection | undefined = ray.intersectObject(mesh)[0];
    assert.ok(top && Math.abs(top.point.y - ST_LEONARDS.road) < .2, `${x.id}: road over the rail at ${top?.point.y}`);
    ray.set(new THREE.Vector3(x.p[0], .5, x.p[1]), new THREE.Vector3(0, 1, 0));
    const under: THREE.Intersection | undefined = ray.intersectObject(mesh)[0];
    assert.ok(under && under.point.y >= 4.5 && under.point.y < ST_LEONARDS.road, `${x.id}: arch soffit over the rail at ${under?.point.y}`);
  }
  // its cost: one draw, a few thousand triangles
  const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
  assert.ok(tris > 500 && tris < 20_000, `triangles ${tris}`);
});

// Round 2 (the round-1 score): a lighter sandstone, slimmer piers, smooth arches, a string course and a parapet coping.
test('round 2: the stone is R-slb-a\'s buff sandstone in sun, not its shade; the piers slim; every arch drawn in 16-24 facets', () => {
  const hex = ST_LEONARDS_COLOURS.stone, [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255], luma = .2126 * r + .7152 * g + .0722 * b;
  // R-slb-a's sunlit sandstone samples (158,144,100), luma 143; its shaded spandrels (41,44,30), luma 42
  assert.ok(luma >= 115 && luma <= 160 && r > g && g > b, `stone ${hex.toString(16)} luma ${luma.toFixed(0)}`);
  assert.ok(ST_LEONARDS.pierWidth >= 1 && ST_LEONARDS.pierWidth <= 1.6, `pier width ${ST_LEONARDS.pierWidth}`);
  const info = stLeonardsBridge(new Batch({ colored: true, uv: false }), scene.terrain);
  assert.equal(info.archSegments?.length, info.spans);
  for (const n of info.archSegments) assert.ok(n >= 16 && n <= 24, `arch facets ${info.archSegments}`);
});

test('round 2: a coping caps each parapet, and a string course stands proud of each face at the fascia\'s foot, over the tracks', () => {
  const mesh = scene.group.getObjectByName('perth-st-leonards-bridge') as THREE.Mesh;
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), foot = ST_LEONARDS.road - ST_LEONARDS.fascia;
  for (const s of [28.9, 39.6, 49.75]) for (const sg of [-1, 1]) {
    // from above, onto the parapet's line: the coping's top, 0.1-0.2 m over the steel parapet's
    const [x, z] = stLeonardsAt(s, sg * (ST_LEONARDS.half - .2));
    ray.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
    const top: THREE.Intersection | undefined = ray.intersectObject(mesh)[0], over = (top?.point.y ?? 0) - (ST_LEONARDS.road + ST_LEONARDS.parapet);
    assert.ok(over >= .1 && over <= .2, `s ${s} side ${sg}: the parapet's top ${top?.point.y}, ${over.toFixed(3)} m over the steel`);
    // from outside, level, toward the face just under the fascia's foot: the string course, proud of the spandrel's face
    const [ox, oz] = stLeonardsAt(s, sg * (ST_LEONARDS.half + 10)), [ix, iz] = stLeonardsAt(s, 0), y = foot - .12;
    ray.set(new THREE.Vector3(ox, y, oz), new THREE.Vector3(ix - ox, 0, iz - oz).normalize());
    const hit: THREE.Intersection | undefined = ray.intersectObject(mesh)[0];
    const o = hit ? Math.abs(stLeonardsFrame([hit.point.x, hit.point.z]).o) : 0;
    assert.ok(o >= ST_LEONARDS.half + .08, `s ${s} side ${sg}: the face at ${o.toFixed(3)} m out (spandrel at ${ST_LEONARDS.half})`);
  }
});

// Round 3 (the round-2 score): coursed ashlar, voussoirs, imposts, smooth soffits, a plate-girder parapet with a visible coping, a darker
// north face, and a frozen camera at R-slb-a's standpoint.
const meshNamed = (name: string) => { const m = scene.group.getObjectByName(name) as THREE.Mesh; m.updateMatrixWorld(true); return m; };
const levelHit = (mesh: THREE.Object3D | THREE.Object3D[], s: number, sg: number, y: number): number => {
  const ray = new THREE.Raycaster(), [ox, oz] = stLeonardsAt(s, sg * (ST_LEONARDS.half + 10)), [ix, iz] = stLeonardsAt(s, 0);
  ray.set(new THREE.Vector3(ox, y, oz), new THREE.Vector3(ix - ox, 0, iz - oz).normalize());
  const hit = ray.intersectObjects(Array.isArray(mesh) ? mesh : [mesh])[0];
  return hit ? Math.abs(stLeonardsFrame([hit.point.x, hit.point.z]).o) : 0;
};

test('round 3: the spandrels, piers and abutments are coursed ashlar, in the textured coursed-stone batch with world-metre UVs', () => {
  const plain = new Batch({ colored: true, uv: false }), ashlar = new Batch({ colored: true });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  assert.ok(ashlar.triangles > 200, `ashlar triangles ${ashlar.triangles}`);
  // v is the height over the coursed tile, so the 0.3 m courses run level and line up from face to face
  for (let i = 0; i < ashlar.count; i++) assert.ok(Math.abs(ashlar.uvs[2 * i + 1]! - ashlar.positions[3 * i + 1]! / 4) < 1e-6, `vertex ${i}: v ${ashlar.uvs[2 * i + 1]} at y ${ashlar.positions[3 * i + 1]}`);
  // in the scene: a level ray at mid-spandrel over a pier meets the street walls' coursed stone, not the plain bridge mesh
  const walls = meshNamed('perth-station-street-walls'), bridge = meshNamed('perth-st-leonards-bridge');
  for (const c of ST_LEONARDS.piers) for (const sg of [-1, 1]) {
    const ray = new THREE.Raycaster(), [ox, oz] = stLeonardsAt(c, sg * (ST_LEONARDS.half + 10)), [ix, iz] = stLeonardsAt(c, 0);
    ray.set(new THREE.Vector3(ox, 1, oz), new THREE.Vector3(ix - ox, 0, iz - oz).normalize());
    assert.equal(ray.intersectObjects([walls, bridge])[0]?.object.name, 'perth-station-street-walls', `pier at ${c}, side ${sg}`);
  }
});

test('round 3: a voussoir ring stands proud of each arch face, impost bands at the springing, and the soffits are smooth-shaded', () => {
  const bridge = meshNamed('perth-st-leonards-bridge');
  for (const sg of [-1, 1]) {
    // the haunch of each pair of arches flanking a pier, just over the intrados: the ring
    for (const c of ST_LEONARDS.piers) {
      const s = c + ST_LEONARDS.pierWidth / 2 + .6, y = stLeonardsSoffit(s) + .15;
      assert.ok(levelHit(bridge, s, sg, y) >= ST_LEONARDS.half + .02, `voussoir at s ${s.toFixed(2)}, y ${y.toFixed(2)}, side ${sg}`);
      // the impost band just under the springing, proud of the pier's face
      assert.ok(levelHit(bridge, c, sg, ST_LEONARDS.spring - .1) >= ST_LEONARDS.half + .05, `impost at pier ${c}, side ${sg}`);
    }
  }
  // the soffit: its triangles' corners carry differing normals (one per station on the ellipse), not one flat normal a facet
  const g = bridge.geometry, n = g.getAttribute('normal'), col = g.getAttribute('color'), idx = g.index!;
  const sof = rgbOf(ST_LEONARDS_COLOURS.soffit);
  let soffitTris = 0, smooth = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    if (!v.every(k => Math.abs(col.getX(k) - sof[0]!) < 1e-4 && Math.abs(col.getY(k) - sof[1]!) < 1e-4 && Math.abs(col.getZ(k) - sof[2]!) < 1e-4)) continue;
    soffitTris++;
    if (v.some(k => Math.abs(n.getX(k) - n.getX(v[0]!)) + Math.abs(n.getY(k) - n.getY(v[0]!)) + Math.abs(n.getZ(k) - n.getZ(v[0]!)) > 1e-3)) smooth++;
  }
  assert.ok(soffitTris > 100 && smooth / soffitTris > .9, `smooth soffit triangles ${smooth} of ${soffitTris}`);
});

test('round 3: the parapet is a plate girder (flanges and stiffeners proud of its web) under a coping that overhangs its face', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), y = ST_LEONARDS.road + .55;
  for (const sg of [-1, 1]) {
    // along 10 m of the north and south faces at mid-web: the web, and the stiffeners proud of it at the girder's pitch
    let web = 0, stiff = 0;
    for (let s = 40; s < 50; s += .05) { const o = levelHit(bridge, s, sg, y); if (Math.abs(o - ST_LEONARDS.half) < .01) web++; else if (o > ST_LEONARDS.half + .02) stiff++; }
    assert.ok(web > 120 && stiff >= 6, `side ${sg}: web ${web}, stiffener samples ${stiff}`);
    // the flanges, at the web's top and foot
    assert.ok(levelHit(bridge, 45.9, sg, ST_LEONARDS.road + ST_LEONARDS.parapet - .05) > ST_LEONARDS.half + .02, `top flange, side ${sg}`);
    // the coping overhangs the girder by at least 0.12 m, so it shows from below
    assert.ok(levelHit(bridge, 45.9, sg, ST_LEONARDS.road + ST_LEONARDS.parapet + .08) >= ST_LEONARDS.half + .12, `coping, side ${sg}`);
  }
});

test('round 3: the north face (toward the station, R-slb-a\'s backlit side) is shaded darker than the south, not near black', () => {
  const plain = new Batch({ colored: true, uv: false }), ashlar = new Batch({ colored: true });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  const mean = (north: boolean) => { let s = 0, k = 0; for (let i = 0; i < ashlar.count; i++) { const nz = ashlar.normals[3 * i + 2]!; if (north ? nz < -.7 : nz > .7) { s += ashlar.colors[3 * i]! + ashlar.colors[3 * i + 1]! + ashlar.colors[3 * i + 2]!; k++; } } return s / k; };
  const ratio = mean(true) / mean(false);
  assert.ok(ratio >= .6 && ratio <= .85, `north/south stone ${ratio.toFixed(3)}`);
});

test('round 3: pt-st-leonards-bridge stands on platform 4 and looks at the bridge\'s north elevation, unobstructed; it is a P2 view', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8'));
  const k = cams['pt-st-leonards-bridge'];
  assert.ok(k, 'the camera is frozen');
  const plat = data.platforms.find(p => p.id === 'way/44200505')!.path as Pt[];
  let inside = false; for (let i = 0, j = plat.length - 1; i < plat.length; j = i++) if ((plat[i]![1] > k.pos[2]) !== (plat[j]![1] > k.pos[2]) && k.pos[0] < (plat[j]![0] - plat[i]![0]) * (k.pos[2] - plat[i]![1]) / (plat[j]![1] - plat[i]![1]) + plat[i]![0]) inside = !inside;
  assert.ok(inside, 'the eye stands on platform 4');
  const cam = new THREE.PerspectiveCamera(k.fov, 1280 / 800, .1, 5000); cam.position.set(k.pos[0], k.pos[1], k.pos[2]); cam.lookAt(k.target[0], k.target[1], k.target[2]); cam.updateMatrixWorld(true);
  const sg = Math.sign(-(stLeonardsAt(0, 1)[1] - stLeonardsAt(0, 0)[1])) || 1;
  // the central arches' crowns and the parapet over them are in frame, and the first thing each line of sight meets is the bridge
  const everything = scene.group.children.flatMap(o => { const all: THREE.Object3D[] = []; o.traverse(q => { if ((q as THREE.Mesh).isMesh && q.visible) all.push(q); }); return all; });
  for (const s of [29, 39.6, 49.75]) for (const y of [stLeonardsSoffit(s) + .3, ST_LEONARDS.road + .5]) {
    const [x, z] = stLeonardsAt(s, sg * ST_LEONARDS.half), v = new THREE.Vector3(x, y, z).project(cam);
    assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1, `s ${s} y ${y.toFixed(2)} in frame (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    const eye = new THREE.Vector3(...(k.pos as [number, number, number])), dir = new THREE.Vector3(x, y, z).sub(eye), far = dir.length();
    const hit = new THREE.Raycaster(eye, dir.normalize(), .1, far + 1).intersectObjects(everything)[0];
    assert.ok(hit && ['perth-st-leonards-bridge', 'perth-station-street-walls'].includes(hit.object.name) && hit.distance > far - 1, `s ${s} y ${y.toFixed(2)}: first hit ${hit?.object.name} at ${hit?.distance.toFixed(1)} of ${far.toFixed(1)}`);
  }
  const evidence = readFileSync(new URL('../../tools/evidence.mjs', import.meta.url), 'utf8');
  assert.match(evidence, /'perth-frontage': \[[^\]]*'pt-st-leonards-bridge'/);
});

// Round 4 (the round-3 score): mid-grey stone soffits, voussoirs in two clear tones with joints, a shadow line under the coping's
// overhang, and the approach parapets unbroken round their bends.
const lumaHex = (hex: number) => .2126 * ((hex >> 16) & 255) + .7152 * ((hex >> 8) & 255) + .0722 * (hex & 255);

// Round 4b (the lead's look at round 4): the soffits a warm brown-grey darker than the face's stone (R-slb-a's are darker than its face),
// still in stones of several tones. Round 4c: two thirds drew black under the tone map's toe; 0.85 (see the round 4c lighting test).
test('round 4: the soffits are a warm brown-grey stone 0.8-0.9 of the face\'s, laid as stones of several tones, not one sheet', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), g = bridge.geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), col = g.getAttribute('color'), idx = g.index!;
  const tones = new Set<string>(); let sum = 0, k = 0; const mean = [0, 0, 0];
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const cx = v.reduce((q, i) => q + pos.getX(i), 0) / 3, cz = v.reduce((q, i) => q + pos.getZ(i), 0) / 3, cf = stLeonardsFrame([cx, cz]);
    const under = Math.abs(cf.o) < ST_LEONARDS.half - .01 && v.every(i => { const f = stLeonardsFrame([pos.getX(i), pos.getZ(i)]); return pos.getY(i) > ST_LEONARDS.spring + .2 && pos.getY(i) < stLeonardsSoffit(f.s) + .01 && nrm.getY(i) < -.3; });
    if (!under) continue;
    const i = v[0]!; tones.add(`${col.getX(i).toFixed(3)},${col.getY(i).toFixed(3)},${col.getZ(i).toFixed(3)}`); sum += col.getX(i) + col.getY(i) + col.getZ(i); k++;
    mean[0] += col.getX(i); mean[1] += col.getY(i); mean[2] += col.getZ(i);
  }
  const grey = (hex: number) => rgbOf(hex).reduce((a, b) => a + b, 0);
  assert.ok(k > 200, `soffit triangles ${k}`);
  assert.ok(tones.size >= 4, `soffit tones ${tones.size}`);
  // the face's stone scaled in display colour (0.6 and 0.7 of each channel), compared as linear sums as the vertex colours are
  const face = ST_LEONARDS_COLOURS.stone, scaled = (f: number) => grey((Math.round(((face >> 16) & 255) * f) << 16) | (Math.round(((face >> 8) & 255) * f) << 8) | Math.round((face & 255) * f));
  assert.ok(sum / k >= scaled(.8) && sum / k <= scaled(.9), `soffit mean ${(sum / k).toFixed(3)} against ${scaled(.8).toFixed(3)}-${scaled(.9).toFixed(3)} (0.8-0.9 of the face's stone)`);
  // warm: red over green over blue, as the sandstone is
  assert.ok(mean[0]! > mean[1]! && mean[1]! > mean[2]!, `soffit mean colour ${mean.map(c => (c / k).toFixed(3))}`);
});

test('round 4: the voussoirs alternate two tones, the darker about 0.88 of the lighter (round 4b: 0.8 was too strong), with a dark joint between stones', () => {
  const C = ST_LEONARDS_COLOURS as Record<string, number>, ratio = lumaHex(C.voussoir!) / lumaHex(C.dressed!);
  assert.ok(ratio >= .84 && ratio <= .92, `voussoir tones ${C.voussoir?.toString(16)} / ${C.dressed?.toString(16)}: luma ratio ${ratio.toFixed(3)}`);
  const g = meshNamed('perth-st-leonards-bridge').geometry, col = g.getAttribute('color'), j = rgbOf(C.joint!), shades = [1, ST_LEONARDS.northShade];
  let joints = 0;
  for (let i = 0; i < col.count; i++) if (shades.some(f => Math.abs(col.getX(i) - j[0] * f) < 1e-4 && Math.abs(col.getY(i) - j[1] * f) < 1e-4 && Math.abs(col.getZ(i) - j[2] * f) < 1e-4)) joints++;
  // four corners a joint, one joint between each pair of voussoirs on both faces of every arch: well over a hundred
  assert.ok(joints / 4 >= 100, `joints ${joints / 4}`);
});

test('round 4: from below, the coping\'s overhang shows a dark underside along both faces', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), top = ST_LEONARDS.road + ST_LEONARDS.parapet, sh = rgbOf(ST_LEONARDS_COLOURS.shadow);
  for (const s of [20, 45.9, 66]) for (const sg of [-1, 1]) {
    const [x, z] = stLeonardsAt(s, sg * (ST_LEONARDS.half + ST_LEONARDS.coping.overhang / 2));
    const hit: THREE.Intersection | undefined = new THREE.Raycaster(new THREE.Vector3(x, top - .5, z), new THREE.Vector3(0, 1, 0)).intersectObject(bridge)[0];
    assert.ok(hit && Math.abs(hit.point.y - top) < .02, `s ${s} side ${sg}: the overhang's underside at ${hit?.point.y}`);
    const c = bridge.geometry.getAttribute('color'), i = hit!.face!.a, f = c.getX(i) / sh[0];
    assert.ok(Math.abs(f - 1) < 1e-3 || Math.abs(f - ST_LEONARDS.northShade) < 1e-3, `s ${s} side ${sg}: the underside's colour is the shadow's`);
  }
});

test('round 4: the approach parapet and its coping run unbroken: no steps along the fall, no notch round the bend at the way\'s east end', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), A = ST_LEONARDS_APPROACHES[0]![0]!, P1 = ST_LEONARDS_APPROACHES[0]![1]!, P0 = stLeonardsAt(ST_LEONARDS.abutments[0] - 1.2);
  const unit = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const d1 = unit(P0, A), d2 = unit(A, P1), n1: Pt = [-d1[1], d1[0]], n2: Pt = [-d2[1], d2[0]];
  const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
  assert.ok(turn > .15, `the bend turns ${(turn * 180 / Math.PI).toFixed(0)} degrees`);
  // the parapet's top at the bend: the road there (12.8 m from the deck at the approach's grade) plus the parapet
  const want = ST_LEONARDS.road - ST_LEONARDS.grade * Math.hypot(A[0] - P0[0], A[1] - P0[1]) + ST_LEONARDS.parapet - .08;
  for (const sg of [-1, 1]) {
    const a1 = Math.atan2(sg * n1[1], sg * n1[0]), a2 = Math.atan2(sg * n2[1], sg * n2[0]);
    let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= 8; k++) for (const R of [ST_LEONARDS.half - .3, ST_LEONARDS.half - .1]) {
      const th = a1 + da * k / 8, x = A[0] + R * Math.cos(th), z = A[1] + R * Math.sin(th);
      const hit: THREE.Intersection | undefined = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(bridge)[0];
      assert.ok(hit && hit.point.y >= want, `side ${sg}, ${k}/8 round the bend at ${R.toFixed(1)} m: top ${hit?.point.y.toFixed(2)} (want >= ${want.toFixed(2)})`);
    }
  }
  // along each side of the east approach, 0.25 m apart down the parapet's line: its top falls smoothly with the road (no stepped blocks)
  const path: Pt[] = [P0, ...ST_LEONARDS_APPROACHES[0]!];
  for (const sg of [-1, 1]) {
    let d = 0, prev: number | null = null, on = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!, b = path[i + 1]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]), u = unit(a, b), n: Pt = [-u[1], u[0]];
      // compared within each mapped segment: across a vertex the offset line jumps (it overlaps itself inside a bend), not the parapet
      prev = null;
      for (let t = .3; t < l - .3; t += .25) {
        const x = a[0] + u[0] * t + n[0] * sg * (ST_LEONARDS.half - .2), z = a[1] + u[1] * t + n[1] * sg * (ST_LEONARDS.half - .2), road = ST_LEONARDS.road - ST_LEONARDS.grade * (d + t);
        const hit: THREE.Intersection | undefined = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(bridge)[0];
        const y = hit && hit.point.y > road + .9 ? hit.point.y : null;
        if (y !== null && prev !== null) assert.ok(Math.abs(y - prev) <= .05, `side ${sg}, ${(d + t).toFixed(2)} m down the approach: the parapet's top steps ${(y - prev).toFixed(3)} m`);
        if (y !== null) on++;
        prev = y;
      }
      d += l;
    }
    assert.ok(on >= 40, `side ${sg}: ${on} samples on the parapet`);
  }
});

// Round 4b (the lead's look at round 4): at dusk the soffits glowed pink, brighter than the face. The cause was the lighting: their
// smooth normals near the springing lie near horizontal, so the Lambert soffit took half the hemisphere's lavender sky and the low red
// sun square on from the west, which the spandrels, piers and deck hide from a real barrel. Round 4c (the lead's look at 4b): bent
// straight down the soffits drew as black voids by day; bent to about 45 degrees at the springing they keep some sky and a gradient.
// The model: the scene's lights (world.ts: a hemisphere, the key, the two fills; nothing casts a shadow) on a Lambert surface, as three
// draws it (each term over pi), then the frame's exposure, three's ACES filmic tone map and sRGB: a display luma, 0 to 1.
function soffitLight(iso: string) {
  const g = meshNamed('perth-st-leonards-bridge').geometry, nrm = g.getAttribute('normal'), col = g.getAttribute('color');
  const tones = SOFFIT_TONES.map(f => rgbOf(ST_LEONARDS_COLOURS.soffit).map(c => c * f));
  const sun = solarPosition(Date.parse(iso), 56.39, -3.438), rig = skyRig(sun.elevationDeg, sun.azimuthDeg, CLEAR, REFERENCE);
  const key = rig.moon.intensity > rig.sun.intensity ? rig.moon : rig.sun, toKey = new THREE.Vector3(...key.direction).normalize();
  const lights = [{ to: toKey, colour: key.colour, k: key.intensity }, ...LIGHTS.fills.map((f, i) => ({ to: new THREE.Vector3(...f.position).normalize(), colour: rig.fills[i]!.colour, k: rig.fills[i]!.intensity }))];
  const aces = (c: number[]) => {
    const v = c.map(x => x * rig.exposure / .6), m = [.59719 * v[0]! + .35458 * v[1]! + .04823 * v[2]!, .076 * v[0]! + .90834 * v[1]! + .01566 * v[2]!, .0284 * v[0]! + .13383 * v[1]! + .83777 * v[2]!];
    const f = m.map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .432951) + .238081));
    return [1.60475 * f[0]! - .53108 * f[1]! - .07367 * f[2]!, -.10208 * f[0]! + 1.10813 * f[1]! - .00605 * f[2]!, -.00327 * f[0]! - .07276 * f[1]! + 1.07602 * f[2]!]
      .map(x => { x = Math.min(1, Math.max(0, x)); return x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055; });
  };
  const shown = (n: THREE.Vector3, albedo: number[]) => {
    const w = .5 * n.y + .5, c = [0, 1, 2].map(j => {
      let e = (rig.hemisphere.ground[j]! * (1 - w) + rig.hemisphere.sky[j]! * w) * rig.hemisphere.intensity;
      for (const l of lights) e += Math.max(n.dot(l.to), 0) * l.colour[j]! * l.k;
      return albedo[j]! * e / Math.PI;
    });
    const d = aces(c);
    return .2126 * d[0]! + .7152 * d[1]! + .0722 * d[2]!;
  };
  let k = 0, sum = 0, brightest = 0, sky = [1, 0], keyMax = 0; const byHeight = new Map<number, number[]>();
  const pos = g.getAttribute('position');
  for (let i = 0; i < col.count; i++) {
    const c = [col.getX(i), col.getY(i), col.getZ(i)];
    if (!tones.some(t => t.every((v, j) => Math.abs(v - c[j]!) < 1e-4))) continue;
    const n = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).normalize(), l = shown(n, c), share = .5 * n.y + .5;
    sky = [Math.min(sky[0]!, share), Math.max(sky[1]!, share)]; keyMax = Math.max(keyMax, n.dot(toKey));
    sum += l; brightest = Math.max(brightest, l); k++;
    // by height over the springing, in thirds of the rise, to see the gradient (an unweighted mean of each band's corners)
    const band = Math.min(2, Math.floor((pos.getY(i) - ST_LEONARDS.spring) / ((ST_LEONARDS.road - ST_LEONARDS.fascia - ST_LEONARDS.spring) / 3)));
    const b = byHeight.get(band) ?? [0, 0]; byHeight.set(band, [b[0]! + l, b[1]! + 1]);
  }
  // the face looking north (toward the station and the frozen camera): its stone, shaded by northShade
  const V = new THREE.Vector3(-(ST_LEONARDS_LINE[1]![1] - ST_LEONARDS_LINE[0]![1]), 0, ST_LEONARDS_LINE[1]![0] - ST_LEONARDS_LINE[0]![0]).normalize(), north = V.z < 0 ? V : V.negate();
  const face = shown(north, rgbOf(ST_LEONARDS_COLOURS.stone).map(c => c * ST_LEONARDS.northShade));
  const bands = [0, 1, 2].map(b => { const v = byHeight.get(b)!; return v[0]! / v[1]!; });
  return { sun, toKey, k, mean: sum / k, brightest, sky, keyMax, face, bands };
}

test('round 4b: at dusk the soffits take a little sky and little of the low sun, and no stone of them is brighter than the shaded face', () => {
  // the round-4 dusk capture's time (capture-slb4.sh)
  const d = soffitLight('2026-11-09T16:20:00Z');
  assert.ok(d.sun.elevationDeg < 0 && d.toKey.y < .05, `dusk: sun at ${d.sun.elevationDeg.toFixed(1)} degrees`);
  assert.ok(d.k > 1000, `soffit corners ${d.k}`);
  // the hemisphere's sky: a little at the springing (round 4 took a half there, round 4b none), none at the crown
  assert.ok(d.sky[1]! >= .08 && d.sky[1]! <= .2, `soffit sky share up to ${d.sky[1]!.toFixed(3)}`);
  // the low sun: at most this much of what a wall square to it takes (round 4 took all of it)
  assert.ok(d.keyMax <= .8, `soffit takes the low sun at up to ${d.keyMax.toFixed(3)} of square on`);
  assert.ok(d.brightest <= d.face, `dusk soffit up to ${d.brightest.toFixed(4)} against the north face ${d.face.toFixed(4)}`);
});

test('round 4c: by noon the soffits are a visible brown-grey, not black: at least 0.35 of the shaded face, brighter toward the springing', () => {
  // the round-4 day capture's time (capture-slb4.sh: 2026-06-21 12:00 BST)
  const d = soffitLight('2026-06-21T11:00:00Z');
  assert.ok(d.mean >= .35 * d.face, `day soffit mean ${d.mean.toFixed(4)} against the north face ${d.face.toFixed(4)} (${(d.mean / d.face).toFixed(3)})`);
  assert.ok(d.bands[0]! > d.bands[2]! * 1.1, `soffit by height, springing to crown: ${d.bands.map(b => b.toFixed(4))}`);
});
