// Frame guards for the engine look and budgets (owner: A1), in headless Chrome. Reversed-Z depth must draw exactly what standard depth draws
// (the first version drew a sky-only haze: the dome was pinned to the near plane), merged static meshes must draw exactly what the unmerged
// scene draws, daytime frames must show the street, night must stay readable, and the draw-call / triangle budgets must hold.
// Compares a 48x27 downsample of the real WebGL canvas, so it needs a GPU path (ANGLE or SwiftShader), not a mock.
// Quiet box: the browser comes only from tests/chrome.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-render.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const W = 48, H = 27;
// Budgets from the lead's brief: draw calls INCLUDE the shadow pass and every post pass; A3's interiors and A4's crowd still have to fit.
const MAX_CALLS = 1500, MAX_TRIS = 2.5e6;
// [label, hour, x, z, yaw, pitch]; null x / z = the spawn point, so a moved spawn keeps the views valid. Downhill is a vista over the whole barrio.
const VIEWS = [
  ['spawn', 17.2, null, null, 0, 0],
  ['sky', 12, null, null, 0, 0.9],
  ['downhill', 15, -6.5, 20, Math.PI, 0.05],
  ['night', 22, null, null, 0, 0.05],
];
const SIGS = `(() => {
  const api = window.__ladera, cv = api.ctx.renderer.domElement, sp = api.state().pos;
  const t = document.createElement('canvas'); t.width = ${W}; t.height = ${H};
  const g = t.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
  return ${JSON.stringify(VIEWS)}.map(([, hour, x, z, yaw, pitch]) => {
    api.setHour(hour); api.teleport(x ?? sp[0], z ?? sp[2], { yaw, pitch }); api.step(3); api.render();
    g.drawImage(cv, 0, 0, ${W}, ${H});                       // same task as render(): the drawing buffer is still valid
    const s = api.ctx.stats;
    return { sig: Array.from(g.getImageData(0, 0, ${W}, ${H}).data), calls: s.drawCalls, tris: s.triangles };
  });
})()`;
const EXT = `(() => { const g = document.createElement('canvas').getContext('webgl2'); return !!g && !!g.getExtension('EXT_clip_control'); })()`;

const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
const meanLuma = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += luma(d, i); return s / (d.length / 4); };
/** Mean |difference| over all RGB values, 0..255. */
const meanAbsDiff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { s += Math.abs(a[i + k] - b[i + k]); n++; } return s / n; };
/** Largest per-cell mean channel difference, 0..255. */
const maxCellDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i += 4) m = Math.max(m, (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3); return m; };
/** Mean luma step between horizontal neighbours, 0..255: a smooth sky gradient scores ~0, facades / street edges score several. */
const edgeEnergy = (d) => { let s = 0, n = 0; for (let y = 0; y < H; y++) for (let x = 0; x + 1 < W; x++) { s += Math.abs(luma(d, (y * W + x) * 4) - luma(d, (y * W + x + 1) * 4)); n++; } return 255 * s / n; };
const view = (name) => VIEWS.findIndex((v) => v[0] === name);

let b, on, off, raw;
async function load(query) {
  const page = await b.open(`la-ladera/index.html?${query}`);
  const state = await page.eval('(() => { const s = __ladera.state(); return { reversedZ: s.reversedZ, errors: s.errors, merge: s.merge, meshes: __ladera.ctx.batch.stats().meshes }; })()');
  return { ...state, ext: await page.eval(EXT), views: await page.eval(SIGS), problems: page.summary() };
}

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  on = await load('autostart&manual');            // the default: reversed-Z wherever the GPU allows it, static meshes merged
  off = await load('autostart&manual&rdb=0');     // reference 1: standard depth
  raw = await load('autostart&manual&skip=merge'); // reference 2: one mesh per group x material, as the modules made them
});
after(async () => { await b?.close(); });

test('reversed-Z is the default wherever EXT_clip_control exists; ?rdb=0 switches it off', () => {
  assert.equal(off.reversedZ, false, '?rdb=0 must give standard depth');
  assert.equal(on.reversedZ, on.ext, `default reversedZ ${on.reversedZ} but EXT_clip_control is ${on.ext}`);
});

test('reversed-Z frames match the standard-depth frames in every view (no sky-only haze, no ghost rectangles)', (t) => {
  VIEWS.forEach(([name], i) => {
    const mad = meanAbsDiff(on.views[i].sig, off.views[i].sig), mx = maxCellDiff(on.views[i].sig, off.views[i].sig);
    t.diagnostic(`${name}: meanAbsDiff ${mad.toFixed(2)}  maxCell ${mx.toFixed(1)}  (reversedZ ${on.reversedZ})`);
    assert.ok(mad < 3, `${name}: mean difference ${mad.toFixed(2)} / 255 against ?rdb=0`);
    assert.ok(mx < 60, `${name}: one cell differs by ${mx.toFixed(1)} / 255 against ?rdb=0`);
  });
});

test('merged static meshes draw the same frame as the unmerged scene, with far fewer meshes', (t) => {
  assert.equal(raw.merge, null, '?skip=merge must leave the scene as the modules made it');
  assert.ok(on.merge && on.merge.fused > 500, `merge stats ${JSON.stringify(on.merge)}`);
  assert.ok(on.merge.chunks * 3 < on.merge.fused, `${on.merge.fused} meshes became ${on.merge.chunks} chunks: less than a 3x cut`);
  assert.equal(on.meshes, raw.meshes - on.merge.fused + on.merge.chunks, 'every other mesh (interiors, door leaves, singletons) is untouched');
  VIEWS.forEach(([name], i) => {
    const mad = meanAbsDiff(on.views[i].sig, raw.views[i].sig), mx = maxCellDiff(on.views[i].sig, raw.views[i].sig);
    t.diagnostic(`${name}: meanAbsDiff ${mad.toFixed(2)}  maxCell ${mx.toFixed(1)}  calls ${on.views[i].calls} vs ${raw.views[i].calls} unmerged`);
    assert.ok(mad < 3, `${name}: mean difference ${mad.toFixed(2)} / 255 against the unmerged scene`);
    assert.ok(mx < 60, `${name}: one cell differs by ${mx.toFixed(1)} / 255 against the unmerged scene`);
  });
});

test(`budgets: at most ${MAX_CALLS} draw calls (shadow + post included) and ${MAX_TRIS / 1e6} M triangles in every view`, (t) => {
  t.diagnostic(on.views.map((v, i) => `${VIEWS[i][0]} ${v.calls} calls ${(v.tris / 1e6).toFixed(2)} M`).join('  |  '));
  on.views.forEach((v, i) => {
    assert.ok(v.calls > 0 && v.calls <= MAX_CALLS, `${VIEWS[i][0]}: ${v.calls} draw calls`);
    assert.ok(v.tris > 0 && v.tris <= MAX_TRIS, `${VIEWS[i][0]}: ${v.tris} triangles`);
  });
  assert.ok(on.views[view('spawn')].calls < raw.views[view('spawn')].calls * 0.6, 'merging must cut the spawn view by at least 40 %');
});

test('daytime frames show the street and the facades, not a smooth haze', (t) => {
  for (const name of ['spawn', 'downhill']) {
    const e = edgeEnergy(on.views[view(name)].sig);
    t.diagnostic(`${name}: edge energy ${e.toFixed(2)}`);
    assert.ok(e > 2.5, `${name}: edge energy ${e.toFixed(2)} (a sky gradient scores about 0.2)`);
  }
});

test('exposure stays in a readable range: day bright, night dark but not black', (t) => {
  const lum = Object.fromEntries(VIEWS.map(([name], i) => [name, meanLuma(on.views[i].sig)]));
  t.diagnostic(Object.entries(lum).map(([k, v]) => `${k} ${v.toFixed(3)}`).join('  '));
  for (const k of ['spawn', 'sky', 'downhill']) assert.ok(lum[k] > 0.15 && lum[k] < 0.85, `${k} mean luma ${lum[k].toFixed(3)}`);
  assert.ok(lum.night > 0.05 && lum.night < 0.3, `night mean luma ${lum.night.toFixed(3)} (was 0.005 when it rendered black)`);
});

test('all three loads boot clean: no errors, warnings or 404s', () => {
  for (const [name, r] of [['default', on], ['rdb=0', off], ['skip=merge', raw]]) {
    assert.equal(r.errors, 0, `${name}: ctx.errors`);
    assert.deepEqual(r.problems, { errors: [], netErrors: [], consoleErrors: [], consoleWarnings: [] }, name);
  }
});
