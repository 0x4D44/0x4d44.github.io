// The riser of a terrain step keeps its texture (owner: A1, js/engine/triplanar.js; review round 6, R1-108: "a stepped notch in the path next to the stair shows a vertically stretched texture", (5, 30)).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-triplanar-riser.test.mjs
// The terrain lattice smooths its vertex normals across a step: a riser of 3.4 m over half a metre (the face's own |y| is 0.14) has corner normals of (0, 0.97, 0.24) at its top and (0, 0.8, 0.6)
// to (0, 0.68, 0.73) at its foot (measured on the real tiles, .scratch/a1/r6/p108-2.out). The side projection used the LARGER of the interpolated normal's |y| and the face's, a rule made so that
// the flat triangles at the foot and the lip of a cut (corners that look steep, R1-D24) are not side-projected; on the riser it said "flat" as well, and the planar x-z uvs (v = the same on every row of a
// vertical face) drew one row of texels down the wall. The proof is in pixels, in the real renderer and the real shader, and in the shader text for the cheap node guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRI_FRAGMENT } from '../js/engine/triplanar.js';
import { launch } from './chrome.mjs';

test('the fragment forces the side read for a near-vertical FACE and leaves the R1-D24 rule (the larger |y| of the corners and the face) as it was', () => {
  const rule = /float ladSteep = 1\.0 - smoothstep\( 0\.55, 0\.88, max\( abs\( ladN\.y \), ladFy \) \);/;
  assert.ok(rule.test(TRI_FRAGMENT), 'the first rule is unchanged: a flat face is flat whatever its corners say');
  const forced = /ladSteep = max\( ladSteep, 1\.0 - smoothstep\( 0\.30, 0\.50, abs\( ladC\.y \) \/ max\( length\( ladC \), 1\.0e-9 \) \) \);/;
  assert.ok(forced.test(TRI_FRAGMENT), 'and a face steeper than ~72 degrees (|y| < 0.30, fading out by 0.50) is side-projected whatever its corners say');
  assert.ok(TRI_FRAGMENT.search(rule) < TRI_FRAGMENT.search(forced), 'the forced term comes second: it can only raise the steepness, never lower it');
  assert.ok(!/\bif\s*\(/.test(TRI_FRAGMENT), 'still no branch around a texture read');
  // TEETH: the fragment without the line is the one that drew the notch
  const old = TRI_FRAGMENT.replace(/\tladSteep = max[^\n]*\n/, '');
  assert.ok(old !== TRI_FRAGMENT && !forced.test(old), 'TEETH: removing the line gives the first version of the rule');
});

// A vertical 4 m wall facing +z with the terrain's planar x-z uvs (u = x, v = z = 0 on every row), and the smoothed corner normal (nx, ny, nz) of the lattice; a map of 8 x 8 random grey cells
// (one cell = 0.31 m at repeat 0.4, ~7 px on screen), seen face on, 96 px render target. Returns the spread and the number of cell edges down the centre columns (a streak has none) and along the rows.
const N = 96;
const RISER = (n, patched) => `(async () => {
  const L = __ladera, ctx = L.ctx, THREE = ctx.THREE, { triplanar } = await import('/la-ladera/js/engine/triplanar.js'), r = ctx.renderer, N = ${N};
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const v = Math.floor(40 + rnd() * 180); g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.8) + ',' + Math.floor(v * 0.6) + ')'; g.fillRect(i * 8, j * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(0.4, 0.4);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }); if (${patched}) triplanar(mat);
  const geo = new THREE.PlaneGeometry(4, 4), P = geo.attributes.position, UV = geo.attributes.uv, NA = geo.attributes.normal;
  for (let i = 0; i < P.count; i++) { UV.setXY(i, P.getX(i), P.getZ(i)); NA.setXYZ(i, ${n[0]}, ${n[1]}, ${n[2]}); }                      // the lattice's planar uvs and its smoothed normals
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, mat)); scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100); cam.position.set(0, 0, 5.4); cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.UnsignedByteType }), keep = [r.getRenderTarget(), r.toneMapping]; r.setRenderTarget(rt); r.toneMapping = THREE.NoToneMapping; r.clear(); r.render(scene, cam);
  const px = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); r.setRenderTarget(keep[0]); r.toneMapping = keep[1];
  const lum = []; for (let i = 0; i < N * N; i++) lum.push((0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255);
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const edges = (a) => { let e = 0, on = false; for (let i = 1; i < a.length; i++) { const step = Math.abs(a[i] - a[i - 1]) > 0.02; if (step && !on) e++; on = step; } return e; };
  rt.dispose(); geo.dispose(); mat.dispose(); tex.dispose();
  const lines = (down) => [36, 42, 48, 54, 60].map((c) => { const a = []; for (let k = 24; k < 72; k++) a.push(down ? lum[k * N + c] : lum[c * N + k]); return a; }), most = (ls, f) => Math.max(...ls.map(f));
  return { sdCol: most(lines(true), sd), sdRow: most(lines(false), sd), edgesCol: most(lines(true), edges), edgesRow: most(lines(false), edges), tri: !!mat.userData.tri };
})()`;

test('R1-108: a vertical riser whose corners carry the flat ground\'s smoothed normal is side-projected, not one row of texels stretched down it', async () => {
  const b = await launch({ width: 800, height: 600 });
  try {
    const page = await b.open('la-ladera/index.html?autostart&manual');
    for (const n of [[0, 0.97, 0.24], [0, 0.8, 0.6]]) {                                                  // the corner normals at the top and at the foot of the notch's riser
      const at = `corner normal (${n.join(', ')})`;
      const plain = await page.eval(RISER(n, false), 240000), tri = await page.eval(RISER(n, true), 240000);
      assert.equal(plain.tri, false); assert.equal(tri.tri, true);
      assert.ok(plain.sdRow > 0.04 && plain.edgesRow >= 4, `${at}: the picture is not blank: the plain wall varies along it (sd ${plain.sdRow.toFixed(3)}, ${plain.edgesRow} edges)`);
      assert.ok(plain.sdCol < 0.01 && plain.edgesCol === 0, `${at}: the plain riser is one streak down (v is constant on a vertical face: sd ${plain.sdCol.toFixed(4)}, ${plain.edgesCol} edges)`);
      assert.ok(tri.sdCol > 0.03 && tri.edgesCol >= 4, `${at}: the patched riser has its own pattern down it (sd ${tri.sdCol.toFixed(3)}, ${tri.edgesCol} edges): the notch at (5, 30) was a streak`);
      assert.ok(Math.abs(tri.edgesCol - tri.edgesRow) <= 3, `${at}: cells as fine down the riser (${tri.edgesCol} edges) as along it (${tri.edgesRow})`);
    }
    const s = page.summary();
    assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
  } finally { await b.close(); }
});
