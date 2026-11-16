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
import { ST_LEONARDS, ST_LEONARDS_APPROACHES, ST_LEONARDS_COLOURS, ST_LEONARDS_LENGTH, ST_LEONARDS_LINE, ST_LEONARDS_NORTH, ST_LEONARDS_SOURCE, SOFFIT_TONES, stLeonardsArchSegments, stLeonardsAt, stLeonardsBridge, stLeonardsFrame, stLeonardsSoffit, stLeonardsSpans } from '../src/perth-st-leonards-bridge.ts';
import { Batch, rgb as rgbOf } from '../src/materials.ts';
import { coursedTexture } from '../src/perth-frontage-textures.ts';

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
    // (round 7: the soffits are their own mesh)
    const under: THREE.Intersection | undefined = ray.intersectObjects([mesh, meshNamed('perth-st-leonards-soffit')])[0];
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
/** Whether a corner lies on an arch's soffit (round 5: the soffit's stones, not the joints set `soffitJoint.inset` into the opening). */
const onSoffit = (x: number, y: number, z: number): boolean => {
  const f = stLeonardsFrame([x, z]);
  if (Math.abs(f.o) > ST_LEONARDS.half + 1e-3 || y < ST_LEONARDS.spring - 1e-3) return false;
  return stLeonardsSpans().some(a => { const h = (a.s1 - a.s0) / 2, r = a.crown - a.spring, e = ((f.s - (a.s0 + a.s1) / 2) / h) ** 2 + ((y - a.spring) / r) ** 2; return f.s >= a.s0 - 1e-3 && f.s <= a.s1 + 1e-3 && Math.abs(e - 1) < 3e-3; });
};
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
  // Round 8: the bridge's irregular bond has its own material; the station walls retain their original bond.
  const walls = meshNamed('perth-st-leonards-masonry'), bridge = meshNamed('perth-st-leonards-bridge');
  for (const c of ST_LEONARDS.piers) for (const sg of [-1, 1]) {
    const ray = new THREE.Raycaster(), [ox, oz] = stLeonardsAt(c, sg * (ST_LEONARDS.half + 10)), [ix, iz] = stLeonardsAt(c, 0);
    ray.set(new THREE.Vector3(ox, 1, oz), new THREE.Vector3(ix - ox, 0, iz - oz).normalize());
    assert.equal(ray.intersectObjects([walls, bridge])[0]?.object.name, 'perth-st-leonards-masonry', `pier at ${c}, side ${sg}`);
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
  const g = meshNamed('perth-st-leonards-soffit').geometry, n = g.getAttribute('normal'), col = g.getAttribute('color'), idx = g.index!;
  const pos = g.getAttribute('position');
  let soffitTris = 0, smooth = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    // (round 5: by place, as the soffit's stones now carry many colours)
    if (!v.every(k => onSoffit(pos.getX(k), pos.getY(k), pos.getZ(k)))) continue;
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
    // The continuous paint layer now covers the outer web. Require the actual intended surface at each height, retaining the
    // original distance/occlusion check and making the old three-mesh allowlist more specific.
    const expected = y > ST_LEONARDS.road ? 'perth-st-leonards-paint' : 'perth-st-leonards-bridge';
    assert.ok(hit && hit.object.name === expected && hit.distance > far - 1, `s ${s} y ${y.toFixed(2)}: first hit ${hit?.object.name}, expected ${expected}, at ${hit?.distance.toFixed(1)} of ${far.toFixed(1)}`);
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
  const bridge = meshNamed('perth-st-leonards-soffit'), g = bridge.geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), col = g.getAttribute('color'), idx = g.index!;
  const tones = new Set<string>(); let sum = 0, k = 0; const mean = [0, 0, 0];
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const cx = v.reduce((q, i) => q + pos.getX(i), 0) / 3, cz = v.reduce((q, i) => q + pos.getZ(i), 0) / 3, cf = stLeonardsFrame([cx, cz]);
    const under = Math.abs(cf.o) < ST_LEONARDS.half - .01 && v.every(i => { const f = stLeonardsFrame([pos.getX(i), pos.getZ(i)]); return pos.getY(i) > ST_LEONARDS.spring + .2 && pos.getY(i) < stLeonardsSoffit(f.s) + .01 && nrm.getY(i) < -.3 && onSoffit(pos.getX(i), pos.getY(i), pos.getZ(i)); });
    if (!under) continue;
    const i = v[0]!; tones.add(`${col.getX(i).toFixed(3)},${col.getY(i).toFixed(3)},${col.getZ(i).toFixed(3)}`); sum += col.getX(i) + col.getY(i) + col.getZ(i); k++;
    mean[0] += col.getX(i); mean[1] += col.getY(i); mean[2] += col.getZ(i);
  }
  const grey = (hex: number) => rgbOf(hex).reduce((a, b) => a + b, 0);
  assert.ok(k > 200, `soffit triangles ${k}`);
  assert.ok(tones.size >= 4, `soffit tones ${tones.size}`);
  // the face's stone scaled in display colour (0.6 and 0.7 of each channel), compared as linear sums as the vertex colours are
  const face = ST_LEONARDS_COLOURS.stone, scaled = (f: number) => grey((Math.round(((face >> 16) & 255) * f) << 16) | (Math.round(((face >> 8) & 255) * f) << 8) | Math.round((face & 255) * f));
  // (round 5: the stones are lifted toward the crown, so the bound is on the soffit's base colour, before the lift and the tones)
  const base = grey(ST_LEONARDS_COLOURS.soffit);
  assert.ok(base >= scaled(.8) && base <= scaled(.9), `soffit ${base.toFixed(3)} against ${scaled(.8).toFixed(3)}-${scaled(.9).toFixed(3)} (0.8-0.9 of the face's stone)`);
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
// draws it (each term over pi), then the frame's exposure, three's ACES filmic tone map and sRGB: a display luma, 0 to 255.
// Round 6 (the round-5 pixels): the rig's colours are sRGB (atmosphere.ts sets the lights with SRGBColorSpace), so they are made linear
// here, as the renderer has them; and the ashlar faces wear the coursed texture, whose linear mean (COURSED) multiplies their colour.
// So corrected, the model met the calibration capture of main 2d545dc9 within 15% at every sampled region (.scratch/sample-slb.ts).
const lin = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
/** The coursed texture's linear mean (perth-frontage-textures.ts coursedTexture: 3 px mortar of grey 170 round stones of 215-255, 128 px a metre). */
const COURSED = (() => { const k = 128, h = .3 * k, w = .85 * k, stone = (w - 3) * (h - 3) / (w * h); let m = 0; for (let g = 215; g <= 255; g++) m += lin(g / 255) / 41; return stone * m + (1 - stone) * lin(170 / 255); })();
function soffitLight(iso: string) {
  const g = meshNamed('perth-st-leonards-soffit').geometry, nrm = g.getAttribute('normal'), col = g.getAttribute('color');
  const sun = solarPosition(Date.parse(iso), 56.39, -3.438), rig = skyRig(sun.elevationDeg, sun.azimuthDeg, CLEAR, REFERENCE);
  const key = rig.moon.intensity > rig.sun.intensity ? rig.moon : rig.sun, toKey = new THREE.Vector3(...key.direction).normalize(), L = (c: readonly number[]) => c.map(lin);
  const lights = [{ to: toKey, colour: L(key.colour), k: key.intensity }, ...LIGHTS.fills.map((f, i) => ({ to: new THREE.Vector3(...f.position).normalize(), colour: L(rig.fills[i]!.colour), k: rig.fills[i]!.intensity }))];
  const hemi = { sky: L(rig.hemisphere.sky), ground: L(rig.hemisphere.ground) };
  const aces = (c: number[]) => {
    const v = c.map(x => x * rig.exposure / .6), m = [.59719 * v[0]! + .35458 * v[1]! + .04823 * v[2]!, .076 * v[0]! + .90834 * v[1]! + .01566 * v[2]!, .0284 * v[0]! + .13383 * v[1]! + .83777 * v[2]!];
    const f = m.map(x => (x * (x + .0245786) - .000090537) / (x * (.983729 * x + .432951) + .238081));
    return [1.60475 * f[0]! - .53108 * f[1]! - .07367 * f[2]!, -.10208 * f[0]! + 1.10813 * f[1]! - .00605 * f[2]!, -.00327 * f[0]! - .07276 * f[1]! + 1.07602 * f[2]!]
      .map(x => { x = Math.min(1, Math.max(0, x)); return x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055; });
  };
  // (round 7) the soffit's lamplight, as lighting.ts FLOOD adds it to what the surface glows with: its colour in a warm light, times the
  // lamps' level, the strength and the fall with height; the material carries the define (it is read here, not assumed)
  const flood = String((meshNamed('perth-st-leonards-soffit').material as THREE.Material).defines?.FLOOD ?? 'vec4( 0, 1, 1, 0 )').replace('vec4', '').match(/-?[\d.]+/g)!.map(Number);
  const shown = (n: THREE.Vector3, albedo: number[], y?: number) => {
    const w = .5 * n.y + .5, c = [0, 1, 2].map(j => {
      let e = (hemi.ground[j]! * (1 - w) + hemi.sky[j]! * w) * rig.hemisphere.intensity;
      for (const l of lights) e += Math.max(n.dot(l.to), 0) * l.colour[j]! * l.k;
      const lamp = y === undefined ? 0 : [1, .82, .5][j]! * rig.lampLevel * flood[0]! * (flood[2]! + (1 - flood[2]!) * Math.exp(-Math.max(y - flood[3]!, 0) / flood[1]!));
      return albedo[j]! * (e / Math.PI + lamp);
    });
    const d = aces(c);
    return 255 * (.2126 * d[0]! + .7152 * d[1]! + .0722 * d[2]!);
  };
  let k = 0, sum = 0, brightest = 0, sky = [1, 0], keyMax = 0; const byHeight = new Map<number, number[]>();
  const pos = g.getAttribute('position');
  for (let i = 0; i < col.count; i++) {
    const c = [col.getX(i), col.getY(i), col.getZ(i)];
    if (!onSoffit(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    const n = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).normalize(), l = shown(n, c, pos.getY(i)), share = .5 * n.y + .5;
    sky = [Math.min(sky[0]!, share), Math.max(sky[1]!, share)]; keyMax = Math.max(keyMax, n.dot(toKey));
    sum += l; brightest = Math.max(brightest, l); k++;
    // by height over the springing, in thirds of the rise, to see the gradient (an unweighted mean of each band's corners)
    const band = Math.min(2, Math.floor((pos.getY(i) - ST_LEONARDS.spring) / ((ST_LEONARDS.road - ST_LEONARDS.fascia - ST_LEONARDS.spring) / 3)));
    const b = byHeight.get(band) ?? [0, 0]; byHeight.set(band, [b[0]! + l, b[1]! + 1]);
  }
  // the face looking north (toward the station and the frozen camera): its stone, shaded by northShade
  const V = new THREE.Vector3(-(ST_LEONARDS_LINE[1]![1] - ST_LEONARDS_LINE[0]![1]), 0, ST_LEONARDS_LINE[1]![0] - ST_LEONARDS_LINE[0]![0]).normalize(), north = V.z < 0 ? V : V.negate();
  const face = shown(north, rgbOf(ST_LEONARDS_COLOURS.stone).map(c => c * ST_LEONARDS.northShade * COURSED));
  const bands = [0, 1, 2].map(b => { const v = byHeight.get(b)!; return v[0]! / v[1]!; });
  return { sun, rig, toKey, k, mean: sum / k, brightest, sky, keyMax, face, bands };
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
  // (round 6: the calibrated model; the springing brightest, the bound round 6's crown floor leaves room for)
  assert.ok(d.bands[0]! > d.bands[2]!, `soffit by height, springing to crown: ${d.bands.map(b => b.toFixed(4))}`);
});

// Round 5 (the r4c score, judged by eye): the soffits' top third near black, the soffit's bond unread, the masonry evenly tiled.
// (round 6: round 5's crown bound, 0.45-0.55 of the face, was set with the uncalibrated model, which put main's crown at 0.47 where the
// pixels were about 0.2; round 6's calibrated floors replace it)
// Round 8: 35/255 was a floor against round 7's face (~53 captured). The requested darker face needs the same relative floor
// (0.65 of the face), alongside the unchanged 0.8 ceiling, so a darker wall does not force its crown to become the brighter surface.
test('round 5/6/8: the soffits\' crowns are stone, not black: at least 0.65 of the face by noon and 15 at dusk, under the springing; at dusk under the face', () => {
  const d = soffitLight('2026-06-21T11:00:00Z');
  assert.ok(d.bands[2]! >= .65 * d.face, `noon soffit by height, springing to crown (display, 0-255): ${d.bands.map(b => b.toFixed(1))}, face ${d.face.toFixed(1)}`);
  assert.ok(d.bands[0]! > d.bands[2]!, `the springing's band over the crown's: ${d.bands.map(b => b.toFixed(4))}`);
  const k = soffitLight('2026-11-09T16:20:00Z');
  assert.ok(k.bands[2]! >= 15 && k.bands[0]! > k.bands[2]!, `dusk soffit by height, springing to crown: ${k.bands.map(b => b.toFixed(1))}`);
  assert.ok(k.brightest <= k.face, `dusk soffit up to ${k.brightest.toFixed(4)} against the north face ${k.face.toFixed(4)}`);
});

test('round 5: the soffit\'s bond reads: stones in a wide spread of tones, with dark joints between them across and along the barrel', () => {
  assert.ok(Math.max(...SOFFIT_TONES) / Math.min(...SOFFIT_TONES) >= 1.4, `soffit tones ${SOFFIT_TONES}`);
  assert.ok(ST_LEONARDS.soffitJoint.tone <= .6 && ST_LEONARDS.soffitJoint.width >= .05, JSON.stringify(ST_LEONARDS.soffitJoint));
  const info = stLeonardsBridge(new Batch({ colored: true, uv: false }), scene.terrain);
  // a cross joint between each pair of stones in every course, and a bed joint at every facet of every arch: over a thousand
  assert.ok(info.soffitJoints >= 1000, `soffit joints ${info.soffitJoints}`);
  // in the scene: from under each arch's crown, looking up across the barrel, the line meets dark joints as well as stones
  const bridge = meshNamed('perth-st-leonards-soffit'), col = bridge.geometry.getAttribute('color');
  for (const a of stLeonardsSpans()) {
    const s = (a.s0 + a.s1) / 2 + .2, ls: number[] = [];
    for (let o = -ST_LEONARDS.half + .1; o < ST_LEONARDS.half - .1; o += .01) {
      const [x, z] = stLeonardsAt(s, o), hit = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, 1, 0)).intersectObject(bridge)[0];
      if (!hit || hit.point.y > a.crown + .05) continue;
      const i = hit.face!.a; ls.push(col.getX(i) + col.getY(i) + col.getZ(i));
    }
    // a joint: under 0.7 of the line's median (the stones' tones are 0.8-1.16 of their course's)
    const med = [...ls].sort((p, q) => p - q)[Math.floor(ls.length / 2)]!, dark = ls.filter(l => l < .7 * med).length;
    let runs = 0; for (let j = 1; j < ls.length; j++) if (ls[j]! < .7 * med && ls[j - 1]! >= .7 * med) runs++;
    assert.ok(ls.length > 1000 && runs >= 8 && dark < ls.length * .15, `arch at ${a.s0.toFixed(1)}: ${runs} joints crossed, ${dark} dark of ${ls.length} samples`);
  }
});

/** Exposed stone below the upper soot and away from runoff: keep the original patch bounds separate from the new structural stains. */
function exposedStone(x: number, y: number, z: number): boolean {
  const K = ST_LEONARDS, g0 = K.abutments[0] - 1.2, g1 = K.abutments[1] + 1.2, pitch = (g1 - g0) / Math.floor((g1 - g0) / K.girder.pitch);
  const { s } = stLeonardsFrame([x, z]), trail = Math.abs(s - (g0 + Math.round((s - g0) / pitch) * pitch));
  return y >= K.spring && y <= 4 && trail >= .15;
}
test('round 5: the coursed ashlar is weathered: its tone varies across each face, and the piers\' feet are stained darker', () => {
  const plain = new Batch({ colored: true, uv: false }), ashlar = new Batch({ colored: true });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  // across the faces looking north and south (each side alone, so the north face's shade is not counted as variation)
  for (const north of [true, false]) {
    const ls: number[] = [];
    for (let i = 0; i < ashlar.count; i++) { const nz = ashlar.normals[3 * i + 2]!; if ((north ? nz < -.7 : nz > .7) && exposedStone(ashlar.positions[3 * i]!, ashlar.positions[3 * i + 1]!, ashlar.positions[3 * i + 2]!)) ls.push(ashlar.colors[3 * i]! + ashlar.colors[3 * i + 1]! + ashlar.colors[3 * i + 2]!); }
    const m = ls.reduce((a, b) => a + b, 0) / ls.length, sd = Math.sqrt(ls.reduce((a, b) => a + (b - m) ** 2, 0) / ls.length);
    assert.ok(sd / m >= .03 && sd / m <= .12, `${north ? 'north' : 'south'} face: tone spread ${(sd / m).toFixed(3)} of ${ls.length} corners`);
  }
  // each pier's faces: the corners at its foot against those at its springing
  for (const c of ST_LEONARDS.piers) {
    let foot = 0, nf = 0, top = 0, nt = 0;
    for (let i = 0; i < ashlar.count; i++) {
      const x = ashlar.positions[3 * i]!, y = ashlar.positions[3 * i + 1]!, z = ashlar.positions[3 * i + 2]!, f = stLeonardsFrame([x, z]);
      if (Math.abs(f.s - c) > ST_LEONARDS.pierWidth / 2 + .01 || Math.abs(ashlar.normals[3 * i + 1]!) > .5) continue;
      const l = ashlar.colors[3 * i]! + ashlar.colors[3 * i + 1]! + ashlar.colors[3 * i + 2]!;
      if (y < scene.terrain.heightAt(x, z)) { foot += l; nf++; } else if (Math.abs(y - ST_LEONARDS.spring) < .05) { top += l; nt++; }
    }
    assert.ok(nf && nt && foot / nf <= .8 * top / nt, `pier at ${c}: foot ${(foot / nf).toFixed(3)} against springing ${(top / nt).toFixed(3)}`);
  }
});

// Round 6 (the round-5 pixels): the face's drift averaged out, the stain was spread thin, the soffit's joints drew at about 1 px.
test('round 6: the face drifts by patches 2-4 m across, the piers\' feet carry the whole stain, and the soffit\'s joints span 2 px at R-slb-a\'s range', () => {
  const plain = new Batch({ colored: true, uv: false }), ashlar = new Batch({ colored: true });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  const lum = (i: number) => ashlar.colors[3 * i]! + ashlar.colors[3 * i + 1]! + ashlar.colors[3 * i + 2]!;
  // the north face's corners above the piers' stain, by 3 m along the way: the patches' means differ by 8% or more, the corners by 3.5% (sd)
  const bins = new Map<number, number[]>(), all: number[] = [];
  for (let i = 0; i < ashlar.count; i++) {
    if (ashlar.normals[3 * i + 2]! > -.7 || ashlar.positions[3 * i + 1]! < ST_LEONARDS.spring) continue;
    const f = stLeonardsFrame([ashlar.positions[3 * i]!, ashlar.positions[3 * i + 2]!]), b = Math.floor(f.s / 3), l = lum(i);
    all.push(l); const v = bins.get(b) ?? []; v.push(l); bins.set(b, v);
  }
  const means = [...bins.values()].filter(v => v.length >= 4).map(v => v.reduce((a, b) => a + b, 0) / v.length), m = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - m) ** 2, 0) / all.length);
  assert.ok(Math.max(...means) / Math.min(...means) >= 1.08 && sd / m >= .035, `north face: patches ${means.length}, range ${(Math.max(...means) / Math.min(...means)).toFixed(3)}, sd ${(sd / m).toFixed(3)}`);
  // each pier: the corners in its bottom half metre over the ground, against those at the same place in plan at the stain's top
  for (const c of ST_LEONARDS.piers) {
    let ratio = 0, k = 0;
    for (let i = 0; i < ashlar.count; i++) {
      const x = ashlar.positions[3 * i]!, y = ashlar.positions[3 * i + 1]!, z = ashlar.positions[3 * i + 2]!, f = stLeonardsFrame([x, z]), g = scene.terrain.heightAt(x, z);
      if (Math.abs(f.s - c) > ST_LEONARDS.pierWidth / 2 + .01 || Math.abs(ashlar.normals[3 * i + 1]!) > .5 || y < g - .05 || y > g + ST_LEONARDS.weather.stainFull + .05) continue;
      // the same corner's colour without the stain: the drift alone at that point, as the scene draws a stain-free face there
      for (let j = 0; j < ashlar.count; j++) {
        if (Math.abs(ashlar.positions[3 * j]! - x) > 1e-3 || Math.abs(ashlar.positions[3 * j + 2]! - z) > 1e-3 || Math.abs(ashlar.positions[3 * j + 1]! - (g + ST_LEONARDS.weather.stainHeight)) > .06) continue;
        if (Math.floor(y / ST_LEONARDS.weather.cellHeight) !== Math.floor(ashlar.positions[3 * j + 1]! / ST_LEONARDS.weather.cellHeight)) continue;
        ratio += lum(i) / lum(j); k++; break;
      }
    }
    assert.ok(k >= 2 && ratio / k <= 1 - .9 * ST_LEONARDS.weather.stain, `pier at ${c}: foot over stain-free ${(ratio / k).toFixed(3)} (${k} corners)`);
  }
  // the soffit's joints at pt-st-leonards-bridge (fov 24, 800 px tall, the bridge 82 m off): at least 2 px wide
  const cam = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8'))['pt-st-leonards-bridge'];
  const [bx, bz] = stLeonardsAt(40, 0), dist = Math.hypot(bx - cam.pos[0], bz - cam.pos[2]), px = 2 * dist * Math.tan(cam.fov * Math.PI / 360) / 800;
  assert.ok(ST_LEONARDS.soffitJoint.width / px >= 2, `soffit joints ${(ST_LEONARDS.soffitJoint.width / px).toFixed(2)} px at ${dist.toFixed(0)} m`);
});

// Round 7 (the round-6 pixels, LAND F5 8.5 F6 8.0): by day the springing about as bright as the crown, both near the face; at dusk the crown
// 11 of 255; the face's drift not visible at the frozen cameras.
test('round 7: by noon the springing about 0.7 of the shaded face and the crown under 0.8 of it; the lamps add nothing by day', () => {
  const d = soffitLight('2026-06-21T11:00:00Z'), r = d.bands.map(b => b / d.face);
  assert.equal(d.rig.lampLevel, 0);
  assert.ok(r[0]! >= .72 && r[0]! <= .9 && r[2]! <= .8 && r[0]! > r[2]!, `noon soffit by height over the north face ${d.face.toFixed(1)}, springing to crown: ${r.map(v => v.toFixed(3))}`);
});

test('round 7: at dusk the soffits are lit by the lamps under them, their own mesh: the crown at least 20 of 255, still under the face, and not pink', () => {
  const m = meshNamed('perth-st-leonards-soffit').material as THREE.Material;
  assert.ok(m.defines?.FLOOD, 'the soffit material carries the FLOOD define');
  const d = soffitLight('2026-11-09T16:20:00Z');
  assert.ok(d.rig.lampLevel > .2, `dusk lamp level ${d.rig.lampLevel}`);
  assert.ok(d.bands[2]! >= 20 && d.bands[0]! > d.bands[2]! && d.brightest <= d.face, `dusk soffit by height, springing to crown: ${d.bands.map(b => b.toFixed(1))}; brightest ${d.brightest.toFixed(1)}, face ${d.face.toFixed(1)}`);
  // the lamps' light is warm (1, 0.82, 0.5): it takes the stone toward yellow, never toward the red-blue of pink
  const c = rgbOf(ST_LEONARDS_COLOURS.soffit).map((v, j) => v * [1, .82, .5][j]!);
  assert.ok(c[0]! >= c[1]! && c[1]! >= c[2]!, `lamplit soffit ${c.map(v => v.toFixed(3))}`);
});

test('round 7: the face drifts in patches with edges: each piece of coursed face one tone, the north face\'s patches spread 5% (sd) or more', () => {
  const plain = new Batch({ colored: true, uv: false }), ashlar = new Batch({ colored: true });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  const W = ST_LEONARDS.weather, lum = (i: number) => ashlar.colors[3 * i]! + ashlar.colors[3 * i + 1]! + ashlar.colors[3 * i + 2]!;
  const patches = new Map<string, number>();
  let pieces = 0;
  for (let t = 0; t < ashlar.indices.length; t += 3) {
    const v = [ashlar.indices[t]!, ashlar.indices[t + 1]!, ashlar.indices[t + 2]!];
    // above the piers' stain, on the north face
    if (v.some(i => ashlar.normals[3 * i + 2]! > -.7 || !exposedStone(ashlar.positions[3 * i]!, ashlar.positions[3 * i + 1]!, ashlar.positions[3 * i + 2]!))) continue;
    pieces++;
    const ls = v.map(lum);
    assert.ok(Math.max(...ls) - Math.min(...ls) < 1e-6, `triangle ${t / 3}: its corners' tones ${ls.map(l => l.toFixed(4))} (a gradient, not a patch)`);
    const m = v.reduce((a, i) => [a[0]! + ashlar.positions[3 * i]! / 3, a[1]! + ashlar.positions[3 * i + 1]! / 3, a[2]! + ashlar.positions[3 * i + 2]! / 3], [0, 0, 0]);
    patches.set([Math.floor(m[0]! / W.cell), Math.floor(m[1]! / W.cellHeight), Math.floor(m[2]! / W.cell)].join(), ls[0]!);
  }
  const ts = [...patches.values()], mean = ts.reduce((a, b) => a + b, 0) / ts.length, sd = Math.sqrt(ts.reduce((a, b) => a + (b - mean) ** 2, 0) / ts.length);
  assert.ok(pieces > 50 && ts.length >= 15 && sd / mean >= .05 && sd / mean <= .09, `north face: ${pieces} pieces, ${ts.length} patches, spread ${(sd / mean).toFixed(3)}`);
});

/** Interpolated surface colour at the hit, before lighting and its texture. */
function faceColour(mesh: THREE.Mesh, s: number, y: number, sg: number = ST_LEONARDS_NORTH): number[] {
  const [x, z] = stLeonardsAt(s, sg * (ST_LEONARDS.half + 2)), [tx, tz] = stLeonardsAt(s);
  const hit = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(tx - x, 0, tz - z).normalize()).intersectObject(mesh)[0];
  assert.ok(hit?.face, `face at s ${s}, y ${y}, side ${sg}`);
  const c = mesh.geometry.getAttribute('color'), p = mesh.geometry.getAttribute('position'), ids = [hit.face.a, hit.face.b, hit.face.c];
  const corners = ids.map(i => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  const weights = THREE.Triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()), corners[0]!, corners[1]!, corners[2]!, new THREE.Vector3())!.toArray();
  return [0, 1, 2].map(channel => ids.reduce((sum, i, j) => sum + c.getComponent(i, channel) * weights[j]!, 0));
}
const colourLuma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;

// Lead 20:16Z: the captured orange family became red paint at dusk. A much less saturated albedo is needed for a muted shaded brown.
test('round 8 second follow-up: the rust albedo is a muted brown, retaining green and blue rather than glowing red', () => {
  const tex = (meshNamed('perth-st-leonards-paint').material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
  const data = tex.image.data;
  assert.ok(data, 'the procedural paint texture has readable texels');
  let cores = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r: number = Number(data[i]), g: number = Number(data[i + 1]), b: number = Number(data[i + 2]);
    if (r - g < 15 || b >= 140) continue;
    cores++;
    assert.ok(r / g <= 1.25 && g / b <= 1.25 && b >= 115, `muted rust albedo ${r},${g},${b}`);
  }
  assert.ok(cores > 1000, `muted brown core texels ${cores}`);
});

// Lead ruling 2026-11-16 21:01Z: round 8c's tall/narrow target is superseded. The round-8 scorer rejected its "repeated motif of
// upright lozenges". Round 9 requires a roughly 0.5-2x width spread, some broad bodies, more clean panels and downward-only tails.
// Preserve the colour, paint, filtering, feather, occupied-pattern, runoff, frame and rivet checks; replace only shape/size clauses.
test('round 9 ruling: varied broad rust bodies and downward-only tails retain the filtered paint, clean panels and frame', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), K = ST_LEONARDS;
  const painted = scene.group.getObjectByName('perth-st-leonards-paint') as THREE.Mesh | undefined;
  assert.ok(painted, 'a continuously filtered paint texture replaces the hard rust polygons');
  const tex = (painted.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
  assert.ok(tex?.image.data && tex.colorSpace === THREE.SRGBColorSpace && tex.magFilter === THREE.LinearFilter, 'sRGB paint texels filtered continuously');
  const { width, height, data } = tex.image, panels = Math.floor((K.abutments[1] - K.abutments[0] + 2.4) / K.girder.pitch);
  assert.ok(width >= 2048 && height >= 64, `paint texture ${width} x ${height}`);
  const bottom = Math.ceil(height * K.girder.flange / (K.parapet + K.fascia)), top = height - bottom;
  let clean = 0, solid = 0, feather = 0, maximumJump = 0, streaked = 0;
  const counts: number[] = [], centres: number[] = [], signatures = new Set<string>(), tones = new Set<string>();
  const bodyWidths: number[] = [], bodyHeights: number[] = []; let longDownward = 0;
  for (let panel = 0; panel < panels; panel++) {
    const x0 = Math.ceil(panel * width / panels), x1 = Math.ceil((panel + 1) * width / panels), pw = x1 - x0;
    const mask = new Uint8Array(pw * height), seen = mask.slice(), sizes: number[] = [];
    let patchBottom = height, patchLeft = pw, patchRight = 0;
    let bodyBottom = height, bodyTop = -1, bodyLeft = pw, bodyRight = -1, cores = 0;
    for (let y = bottom; y < top; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4, r = Number(data[i]), g = Number(data[i + 1]), b = Number(data[i + 2]);
      if (b >= 158) clean++;
      if (b > 140 && b < 159) feather++;
      if (r - g >= 15 && b < 140) { solid++; tones.add([r, g, b].join()); }
      if (x + 1 < x1) maximumJump = Math.max(maximumJump, Math.abs(b - Number(data[i + 6])));
      if (b < 150 && r - g > 12) mask[y * pw + x - x0] = 1;
      // The >85% rust core measures the body without mistaking its stronger, narrower trails for body height.
      if (r - g >= 20 && b < 135) {
        cores++; bodyBottom = Math.min(bodyBottom, y); bodyTop = Math.max(bodyTop, y); bodyLeft = Math.min(bodyLeft, x - x0); bodyRight = Math.max(bodyRight, x - x0);
      }
    }
    for (let p = 0; p < mask.length; p++) {
      if (!mask[p] || seen[p]) continue;
      const queue = [p]; seen[p] = 1; let minY = height, maxY = 0, minX = pw, maxX = 0;
      for (let q = 0; q < queue.length; q++) { const a = queue[q]!, x = a % pw, y = Math.floor(a / pw); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        for (const n of [x ? a - 1 : -1, x + 1 < pw ? a + 1 : -1, a - pw, a + pw]) if (n >= 0 && n < mask.length && mask[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
      }
      if (queue.length >= 8) {
        sizes.push((maxY - minY + 1) / (top - bottom)); centres.push(((maxY + minY) / 2 - bottom) / (top - bottom));
        patchBottom = Math.min(patchBottom, minY); patchLeft = Math.min(patchLeft, minX); patchRight = Math.max(patchRight, maxX);
      }
    }
    counts.push(sizes.length); if (sizes.length) signatures.add([...mask].join(''));
    if (cores >= 8) {
      const pitch = (K.abutments[1] - K.abutments[0] + 2.4) / panels, bodyHeight = bodyTop - bodyBottom + 1;
      bodyWidths.push((bodyRight - bodyLeft + 1) / pw * pitch); bodyHeights.push(bodyHeight / height * (K.parapet + K.fascia));
      assert.ok(bodyWidths.at(-1)! <= .7 * pitch && bodyHeights.at(-1)! <= .6 * (K.parapet + K.fascia), `panel ${panel}: bounded blotch body ${bodyWidths.at(-1)} x ${bodyHeights.at(-1)}`);
      let below = 0, above = 0, reach = 0;
      for (let d = 1; d <= bodyHeight; d++) {
        let row = 0;
        for (let x = bodyLeft; x <= bodyRight; x++) {
          if (bodyBottom - d >= bottom) {
            const loss = Math.max(0, 162 - Number(data[((bodyBottom - d) * width + x0 + x) * 4 + 2]));
            below += loss; row = Math.max(row, loss);
          }
          if (bodyTop + d < top) above += Math.max(0, 162 - Number(data[((bodyTop + d) * width + x0 + x) * 4 + 2]));
        }
        if (row >= 8) reach = d;
      }
      if (reach >= .9 * bodyHeight && below >= bodyHeight * 12 && below > 2 * above) longDownward++;
      // The stronger round-9 tails cross the old mask threshold. Sample runoff below the body, not below the tail's own end.
      patchBottom = bodyBottom; patchLeft = bodyLeft; patchRight = bodyRight;
    }
    let trails = 0;
    const centre = (patchLeft + patchRight) / 2;
    for (let y = Math.max(bottom, Math.floor(patchBottom - height * .2)); y < patchBottom - height * .04; y++) for (let x = Math.max(0, Math.floor(centre - 8)); x <= Math.min(pw - 1, centre + 8); x++) {
      const i = (y * width + x0 + x) * 4;
      if (Number(data[i + 2]) < 156 && Number(data[i]) > Number(data[i + 1]) - 10) trails++;
    }
    if (sizes.length && trails >= 4) streaked++;
  }
  const pixels = (top - bottom) * width;
  // Count occupied panels; a merged scab may have a separate lower trail component at this threshold.
  const occupied = counts.filter(n => n > 0).length, blank = counts.filter(n => n === 0).length;
  assert.ok(bodyWidths.length >= 10 && Math.max(...bodyWidths) / Math.min(...bodyWidths) >= 4, `roughly 0.5-2x body-width range: ${bodyWidths.map(w => w.toFixed(3))}`);
  assert.ok(bodyWidths.filter((w, i) => w > bodyHeights[i]!).length >= .35 * bodyWidths.length, `some bodies wider than tall: widths ${bodyWidths}, heights ${bodyHeights}`);
  assert.ok(blank >= 12, `more clean panels than round 8c's eight: ${blank}/${panels}`);
  assert.ok(longDownward >= .65 * bodyWidths.length, `body-height trails below only: ${longDownward}/${bodyWidths.length}`);
  assert.ok(blank >= 7 && blank <= 16 && occupied >= 18, `patch counts ${counts}`);
  assert.ok(signatures.size >= .9 * occupied && Math.max(...centres) - Math.min(...centres) >= .2, `unique occupied patterns ${signatures.size}, centres ${centres}`);
  assert.ok(clean / pixels >= .75 && clean / pixels <= .94 && solid > 1000 && tones.size > 50, `clean ${(clean / pixels).toFixed(3)}, solid ${solid}, tones ${tones.size}`);
  assert.ok(streaked >= .75 * occupied, `visible runoff below ${streaked}/${occupied} patches`);
  assert.ok(feather >= solid * .25 && maximumJump <= 30, `feather ${feather}, solid ${solid}, maximum adjacent blue jump ${maximumJump}`);
  const info = stLeonardsBridge(new Batch({ colored: true, uv: false }), scene.terrain);
  assert.ok(info.rivets >= 300, `rivets ${info.rivets}`);
  const topFlange = faceColour(bridge, 45.9, K.road + K.parapet - .05), bottomFlange = faceColour(bridge, 45.9, K.road - K.fascia + .05);
  assert.ok(colourLuma(topFlange) >= 1.4 * colourLuma(bottomFlange), `flange top ${topFlange}, bottom ${bottomFlange}`);
});

test('round 8 follow-up: dirty sandstone keeps its darker luma with the warmer bias requested from the captured pixels', () => {
  const c = rgbOf(ST_LEONARDS_COLOURS.stone), old = rgbOf(0x968a70), ratio = colourLuma(c) / colourLuma(old);
  assert.ok(ratio >= .7 && ratio <= .8, `stone linear albedo over round 7 ${ratio.toFixed(3)}`);
  // The captured neutral face (45,42,41) needs warmth at the same luma; the old <=1.25 R/B bound forbade that correction.
  const round8 = colourLuma(rgbOf(0x7f7b75)), warm = c[0] / c[2];
  assert.ok(Math.abs(colourLuma(c) / round8 - 1) <= .02 && warm >= 1.4 && warm <= 1.7 && c[0] > c[1] && c[1] > c[2], `warm sandstone ${c}, R/B ${warm.toFixed(3)}`);
  const ring = [ST_LEONARDS_COLOURS.dressed, ST_LEONARDS_COLOURS.voussoir].map(h => colourLuma(rgbOf(h)));
  // The face wears the coursed texture (mean ~0.79); the ring is untextured.
  const relative = (ring[0]! + ring[1]!) / 2 / (colourLuma(c) * COURSED);
  // Lead: lift the dressed rings and string edges 8-12% in display luma; retain a bounded, slightly brighter dressed band.
  assert.ok(relative >= 1.36 && relative <= 1.5, `ring over textured face ${relative.toFixed(3)}`);
});

test('round 8 follow-up: the dressed rings and string course gain a modest lift, while the soffit stays dark', () => {
  for (const [name, before] of [['dressed', 0x85827b], ['voussoir', 0x79766e]] as const) {
    const ratio = colourLuma(rgbOf(ST_LEONARDS_COLOURS[name])) / colourLuma(rgbOf(before));
    assert.ok(ratio >= 1.1 && ratio <= 1.15, `${name} linear albedo lift ${ratio.toFixed(3)}`);
  }
  assert.equal(ST_LEONARDS_COLOURS.soffit, 0x706c65);
  assert.deepEqual(ST_LEONARDS.soffitFill, { base: 2.2, crown: 1.5 });
});

test('round 8 follow-up: individual ashlar blocks vary slightly in hue as well as brightness', () => {
  const colours: number[][] = [], previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = { fillStyle: '', fillRect: (_x: number, _y: number, w: number, h: number) => {
    if (w > 20 && w < 200 && h > 15 && h < 100) colours.push(context.fillStyle.match(/\d+/g)!.map(Number));
  } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    coursedTexture('bridge')?.dispose();
    const hues = colours.map(([r, , b]) => r! - b!);
    assert.ok(colours.length > 40 && Math.min(...hues) <= -5 && Math.max(...hues) >= 5, `block hue span ${Math.min(...hues)}-${Math.max(...hues)}`);
    assert.ok(colours.every(c => Math.abs(lumaHex((c[0]! << 16) | (c[1]! << 8) | c[2]!) - c.reduce((a, b) => a + b, 0) / 3) < 3), 'hue differences remain subtle');
  } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('round 8 second follow-up: exposed warm blocks restore masonry contrast while preserving the stone mean and palette', () => {
  const blocks: { colour: number[]; area: number }[] = [], previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => {
    if (w > 20 && w < 200 && h > 15 && h < 100) blocks.push({ colour: context.fillStyle.match(/\d+/g)!.map(Number), area: Math.max(0, Math.min(512, x + w) - Math.max(0, x)) * Math.max(0, Math.min(512, y + h) - Math.max(0, y)) });
  } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    coursedTexture('bridge')?.dispose();
    const ls = blocks.map(b => colourLuma(b.colour.map(v => lin(v / 255)))), area = blocks.reduce((s, b) => s + b.area, 0);
    const mean = blocks.reduce((s, b, i) => s + ls[i]! * b.area, 0) / area, sd = Math.sqrt(blocks.reduce((s, b, i) => s + (ls[i]! - mean) ** 2 * b.area, 0) / area);
    const warm = blocks.filter(b => b.colour[0]! >= 250 && b.colour[0]! - b.colour[2]! >= 20 && b.colour[1]! - b.colour[2]! >= 10).length / blocks.length;
    // The committed bridge blocks average 0.808 linear luma (area weighted), CV 0.110. Keep the mean, widen the distribution.
    assert.ok(Math.abs(mean - .808) <= .02 && sd / mean >= .15 && sd / mean <= .22, `block mean ${mean.toFixed(3)}, CV ${(sd / mean).toFixed(3)}`);
    assert.ok(warm >= .1 && warm <= .25, `exposed warm block fraction ${warm.toFixed(3)}`);
    assert.equal(ST_LEONARDS_COLOURS.stone, 0x867b6d);
    assert.equal(ST_LEONARDS_COLOURS.dressed, 0x8b8880);
    assert.equal(ST_LEONARDS_COLOURS.voussoir, 0x7f7c74);
  } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('round 8: soot gathers below the string course, and a full wet band reaches a metre above each pier foot', () => {
  const ashlar = new Batch({ colored: true }), plain = new Batch({ colored: true, uv: false });
  stLeonardsBridge(plain, scene.terrain, ashlar);
  const masonry = new THREE.Mesh(ashlar.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  try {
    let sooted = 0;
    for (const s of ST_LEONARDS.piers) {
      const upper = colourLuma(faceColour(masonry, s, 5.25)), middle = colourLuma(faceColour(masonry, s, 3.4));
      if (upper <= middle * .91) sooted++;
      const [x, z] = stLeonardsAt(s, ST_LEONARDS_NORTH * ST_LEONARDS.half), ground = scene.terrain.heightAt(x, z);
      const wet = colourLuma(faceColour(masonry, s, ground + 1)), dry = colourLuma(faceColour(masonry, s, ground + 1.7));
      assert.ok(wet <= .74 * dry, `pier ${s}: metre-high wet band ${wet.toFixed(3)} / ${dry.toFixed(3)}`);
    }
    assert.ok(sooted >= 3, `soot darkens ${sooted} of four upper pier spandrels`);
  } finally { masonry.geometry.dispose(); (masonry.material as THREE.Material).dispose(); }
});

test('round 8: the bridge ashlar varies course heights and block lengths; pier blocks are larger than spandrel blocks', () => {
  // Exercise the canvas draw commands without a browser or a GPU. The street texture keeps its original regular bond.
  const rectangles: number[][] = [], previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = { fillStyle: '', fillRect: (...v: number[]) => rectangles.push(v) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    const texture = coursedTexture('bridge'); texture?.dispose();
    const stones = rectangles.filter(r => r[2]! > 20 && r[3]! > 15 && r[2]! < 200 && r[3]! < 100);
    const heights = new Set(stones.map(r => r[3]!.toFixed(1))), lengths = new Set(stones.map(r => r[2]!.toFixed(1)));
    assert.ok(heights.size >= 6 && lengths.size >= 20, `stone heights ${heights.size}, lengths ${lengths.size}`);
  } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); }
  const ashlar = new Batch({ colored: true }); stLeonardsBridge(new Batch({ colored: true, uv: false }), scene.terrain, ashlar);
  const scales = (y: number) => {
    const values: number[] = [];
    for (let t = 0; t < ashlar.indices.length; t += 3) {
      const a = ashlar.indices[t]!, b = ashlar.indices[t + 1]!;
      if (Math.abs(ashlar.positions[3 * a + 1]! - y) > .01 || Math.abs(ashlar.positions[3 * b + 1]! - y) > .01 || ashlar.normals[3 * a + 2]! > -.7) continue;
      const d = Math.hypot(ashlar.positions[3 * a]! - ashlar.positions[3 * b]!, ashlar.positions[3 * a + 2]! - ashlar.positions[3 * b + 2]!);
      if (d > .1) values.push(Math.abs(ashlar.uvs[2 * a]! - ashlar.uvs[2 * b]!) * 4 / d);
    }
    return values;
  };
  const pier = scales(ST_LEONARDS.spring + .01), spandrel = scales(5);
  assert.ok(pier.some(s => s >= .6 && s <= .75) && spandrel.some(s => Math.abs(s - 1) < .01), `UV scales pier ${pier.slice(0, 8)}, spandrel ${spandrel.slice(0, 8)}`);
});

test('round 8: voussoirs vary in relief as well as tone', () => {
  const bridge = meshNamed('perth-st-leonards-bridge'), depths: number[] = [];
  for (const a of stLeonardsSpans()) {
    const n = stLeonardsArchSegments(a.s1 - a.s0);
    for (let i = 1; i < n - 1; i++) {
      const s = a.s0 + (a.s1 - a.s0) * (i + .5) / n, y = stLeonardsSoffit(s) + .12;
      if (y < 4.8) depths.push(levelHit(bridge, s, -1, y) - ST_LEONARDS.half);
    }
  }
  assert.ok(depths.length > 20 && Math.max(...depths) - Math.min(...depths) >= .025, `voussoir relief range ${Math.min(...depths).toFixed(3)}-${Math.max(...depths).toFixed(3)}`);
});

test('round 8: the darker face keeps the daytime springing near 0.7 and crown below 0.8, with a lamplit dusk crown', () => {
  const day = soffitLight('2026-06-21T11:00:00Z'), dusk = soffitLight('2026-11-09T16:20:00Z');
  const spring = day.bands[0]! / day.face, crown = day.bands[2]! / day.face;
  assert.ok(day.face <= 44 && spring >= .7 && spring <= .8 && crown >= .65 && crown <= .8,
    `model only: noon face ${day.face.toFixed(1)}, springing ${spring.toFixed(3)}, crown ${crown.toFixed(3)}`);
  assert.ok(dusk.bands[2]! >= 20 && dusk.brightest <= dusk.face,
    `model only: dusk crown ${dusk.bands[2]!.toFixed(1)}, brightest ${dusk.brightest.toFixed(1)}, face ${dusk.face.toFixed(1)}`);
});
