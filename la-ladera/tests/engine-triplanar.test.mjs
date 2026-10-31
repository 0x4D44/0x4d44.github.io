// Side projection for steep ground (owner: A1, js/engine/triplanar.js; review R1-D07 and A5's question: does it cover the terrain tiles?).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-triplanar.test.mjs
// The terrain, the earth banks and the retaining cuts have planar UVs (world x, z). On a vertical face the v coordinate is the same on every row, so the dirt is one streak
// repeated down the wall. The patched material reads the map from the side when the normal is steep. Real renderer (software GL under headless Chrome), real shader: the
// proof is in pixels, a render target read back, not in a string match. The first version of the patch read the side from one coordinate ALONG the face; that is continuous
// on a plane and collapses on a curved bank (round a mound it is 0 all the way round: the radial fans the review saw at (-40, 10)), hence the cylinder test.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, page;
before(async () => { b = await launch({ width: 800, height: 600 }); page = await b.open('la-ladera/index.html?autostart&manual'); });       // open() waits for __ladera.ready
after(async () => { await b?.close(); });

// A 4 m square with the planar x-z uvs of the terrain (u = x, v = z) tilted `deg` from the horizontal about the x axis (0 = lying flat, 90 = a vertical face) and turned `yaw`
// about the vertical axis, or (shape 'cylinder') a 3.6 m high round bank of radius 1.2 m seen from outside; lit evenly, seen face on, filling a 96 px render target. The map is
// 8 x 8 cells of random grey (one cell = 0.31 m at repeat 0.4), so a cell is ~7 px on screen. Returns the whole picture (luminance) to compare two materials pixel by pixel,
// and for the centre column and the centre row the spread and the number of cell edges (runs of steps > 0.02).
const N = 96;
const RENDER = (deg, patched, yaw, shape = 'plane') => `(async () => {
  const L = __ladera, ctx = L.ctx, THREE = ctx.THREE, { triplanar } = await import('/la-ladera/js/engine/triplanar.js'), r = ctx.renderer, N = ${N};
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const v = Math.floor(40 + rnd() * 180); g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.8) + ',' + Math.floor(v * 0.6) + ')'; g.fillRect(i * 8, j * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(0.4, 0.4);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }); if (${patched}) triplanar(mat);
  const cyl = ${JSON.stringify(shape)} === 'cylinder';
  const geo = cyl ? new THREE.CylinderGeometry(1.2, 1.2, 3.6, 64, 1, true) : new THREE.PlaneGeometry(4, 4);
  if (!cyl) { geo.rotateX(-Math.PI / 2 + ${deg} * Math.PI / 180); geo.rotateY(${yaw} * Math.PI / 180); }       // 0 deg: lying flat (normal +y); 90 deg: standing (normal +z); then turned about the vertical axis
  const P = geo.attributes.position, UV = geo.attributes.uv; for (let i = 0; i < P.count; i++) UV.setXY(i, P.getX(i), P.getZ(i));      // the planar x-z projection of the terrain
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, mat)); scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100), t = ${deg} * Math.PI / 180, w = ${yaw} * Math.PI / 180, n = cyl ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(Math.sin(t) * Math.sin(w), Math.cos(t), Math.sin(t) * Math.cos(w)); cam.position.copy(n.clone().multiplyScalar(cyl ? 4.4 : 5.4)); cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.UnsignedByteType }), keep = [r.getRenderTarget(), r.toneMapping]; r.setRenderTarget(rt); r.toneMapping = THREE.NoToneMapping; r.clear(); r.render(scene, cam);
  const px = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); r.setRenderTarget(keep[0]); r.toneMapping = keep[1];
  const lum = []; for (let i = 0; i < N * N; i++) lum.push((0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255);
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const edges = (a) => { let e = 0, on = false; for (let i = 1; i < a.length; i++) { const step = Math.abs(a[i] - a[i - 1]) > 0.02; if (step && !on) e++; on = step; } return e; };       // a run of steps = one edge (the filter smears an edge over one or two pixels, by phase)
  rt.dispose(); geo.dispose(); mat.dispose(); tex.dispose();
  const lines = (down) => [36, 42, 48, 54, 60].map((c) => { const a = []; for (let k = 24; k < 72; k++) a.push(down ? lum[k * N + c] : lum[c * N + k]); return a; }), most = (ls, f) => Math.max(...ls.map(f));       // five columns and five rows: one row of cells can be dull by chance
  return { lum, sdCol: most(lines(true), sd), sdRow: most(lines(false), sd), edgesCol: most(lines(true), edges), edgesRow: most(lines(false), edges), tri: !!mat.userData.tri };
})()`;
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
const sdAll = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const shot = (deg, patched, yaw = 0, shape = 'plane') => page.eval(RENDER(deg, patched, yaw, shape), 240000);

test('a vertical face, whichever way it looks: the planar x-z uvs smear one row down the wall; the side projection gives the wall its own pattern, as fine as the top one', async () => {
  const ref = await shot(90, false, 0);                                                    // the plain wall facing +z: u = x runs along it
  for (const yaw of [0, 90, 45]) {                                                           // facing +z, +x and diagonally
    const plain = yaw ? await shot(90, false, yaw) : ref, tri = await shot(90, true, yaw), at = `wall facing yaw ${yaw}`;
    assert.equal(plain.tri, false); assert.equal(tri.tri, true);
    assert.ok(plain.sdRow > 0.04 && plain.edgesRow >= 4, `${at}: the plain wall varies along it (sd ${plain.sdRow.toFixed(3)}, ${plain.edgesRow} edges): the picture is not blank`);
    assert.ok(plain.sdCol < 0.01 && plain.edgesCol === 0, `${at}: the plain wall is the same all the way DOWN (v is constant: sd ${plain.sdCol.toFixed(4)}, ${plain.edgesCol} edges): the streak the review saw`);
    if (yaw === 45) { assert.ok(tri.sdCol > 0.012 && tri.sdRow > 0.012, `${at}: the two projections at half weight each still show a pattern down and along (sd ${tri.sdCol.toFixed(3)}, ${tri.sdRow.toFixed(3)}) where the plain wall shows none down (${plain.sdCol.toFixed(4)})`); continue; }
    assert.ok(tri.sdCol > 0.03 && tri.edgesCol >= 4, `${at}: the patched wall varies down as well (sd ${tri.sdCol.toFixed(3)}, ${tri.edgesCol} edges against ${plain.edgesCol})`);
    assert.ok(tri.sdRow > 0.03 && tri.edgesRow >= 4, `${at}: and still along it (sd ${tri.sdRow.toFixed(3)}, ${tri.edgesRow} edges)`);                                                                // a diagonal wall shows both projections at half weight: twice the edges, no density to compare
    // a pixel of side texture is as big as a pixel of top texture: the cells are as wide down the wall as along it, and as wide as on the plain wall facing +z
    assert.ok(Math.abs(tri.edgesCol - tri.edgesRow) <= 3, `${at}: cells as fine down (${tri.edgesCol} edges) as along (${tri.edgesRow})`);
    assert.ok(Math.abs(tri.edgesRow - ref.edgesRow) <= 3, `${at}: cells as fine as the top projection's (${tri.edgesRow} edges against ${ref.edgesRow})`);
  }
});

test('a round bank: the side projection does not collapse where the face curves (the radial fans of the first version)', async () => {
  const plain = await shot(90, false, 0, 'cylinder'), tri = await shot(90, true, 0, 'cylinder');
  assert.ok(plain.edgesRow >= 3 && plain.edgesCol === 0, `the plain bank is one streak down (${plain.edgesRow} edges around, ${plain.edgesCol} down)`);
  assert.ok(tri.sdRow > 0.03 && tri.edgesRow >= 2, `round the bank the patched pattern varies (sd ${tri.sdRow.toFixed(3)}, ${tri.edgesRow} edges): a tangent that turns with the normal makes u = 0 all the way round`);
  assert.ok(tri.sdCol > 0.03 && tri.edgesCol >= 3, `and down it (sd ${tri.sdCol.toFixed(3)}, ${tri.edgesCol} edges)`);
});

test('flat ground and a gentle slope are exactly what they were; a 70 degree bank is fully side-projected; 45 degrees is in between', async () => {
  for (const deg of [0, 20]) {
    const plain = await shot(deg, false), tri = await shot(deg, true);
    assert.ok(sdAll(plain.lum) > 0.04 && plain.edgesRow >= 4 && plain.edgesCol >= 1, `${deg} degrees: the picture is a textured plane, not a blank (sd ${sdAll(plain.lum).toFixed(3)}, ${plain.edgesRow} edges across, ${plain.edgesCol} down)`);
    assert.ok(maxDiff(plain.lum, tri.lum) < 2.5 / 255, `${deg} degrees: the patched picture is the plain one (largest difference ${(maxDiff(plain.lum, tri.lum) * 255).toFixed(1)} / 255)`);
  }
  const d70p = await shot(70, false), d70 = await shot(70, true);
  assert.ok(d70.edgesCol >= d70p.edgesCol + 2 && d70.edgesCol >= 4, `70 degrees: down the bank the plain pattern is stretched (${d70p.edgesCol} cell edges), the patched one is not (${d70.edgesCol})`);
  const d45p = await shot(45, false), d45 = await shot(45, true), diff45 = maxDiff(d45p.lum, d45.lum);
  assert.ok(diff45 > 0.02, `45 degrees: the side projection is already part of the picture (largest difference ${(diff45 * 255).toFixed(0)} / 255)`);
  assert.ok(diff45 < maxDiff(d70p.lum, d70.lum) + 0.2, 'and it is a blend, not a hard switch: the picture still holds the top projection');
});

test('A5\'s question: every mesh the terrain tiles, the earth banks and the far land draw with ground_dirt or grass_patchy carries the patched material, and no other material does', async () => {
  const r = await page.eval(`(() => {
    const ctx = __ladera.ctx, seen = {}, strays = []; let nonTri = 0;
    ctx.scene.traverse((o) => { if (!o.isMesh) return; const base = String(o.userData?.matKey ?? '').split('#')[0], tri = !!o.material?.userData?.tri;
      if (base !== 'ground_dirt' && base !== 'grass_patchy') { if (tri) strays.push(base); return; }
      const e = seen[base] ?? (seen[base] = { meshes: 0, tri: 0, withMap: 0, tris: 0 }); e.meshes++; if (tri) e.tri++; if (o.material.map) e.withMap++; e.tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
    const terrain = [...ctx.batch.groups.keys()].filter((g) => g.startsWith('world.terrain.')).length;
    return { seen, strays: [...new Set(strays)], terrain, patched: ctx.mat('ground_dirt').userData.tri === true && ctx.mat('grass_patchy').userData.tri === true, plain: ctx.mat('plaster_a#e8d8b8').userData.tri !== true };
  })()`);
  assert.ok(r.terrain >= 64, `the terrain tile groups exist (${r.terrain})`);
  assert.ok(r.patched, 'ctx.mat() hands out the patched material for both ground materials');
  for (const base of ['ground_dirt', 'grass_patchy']) {
    const e = r.seen[base]; assert.ok(e && e.meshes >= 1 && e.tris > 10000, `${base}: drawn by ${e?.meshes ?? 0} meshes, ${Math.round(e?.tris ?? 0)} triangles`);
    assert.equal(e.tri, e.meshes, `${base}: ${e.meshes - e.tri} of ${e.meshes} meshes draw it WITHOUT the side projection`); assert.equal(e.withMap, e.meshes, `${base}: all have their texture (${e.withMap} of ${e.meshes})`);
  }
  assert.deepEqual(r.strays, [], 'no other material got the side projection by accident');
  assert.ok(r.plain, 'a wall material is not patched');
});

test('the console stayed clean (the patched shader compiled on every program that uses it)', async () => {
  const s = page.summary();
  assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
});
