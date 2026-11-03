// The sea's swell (A1, js/core/sea.js, dev/FEATURE-BEACH.md 2.1 and 2.6), under node: four waves that the CPU (swimmers, boats, riders) and the GLSL (engine/water.js) must agree on.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-sea.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of world-coast.test.mjs):
//   table   the long wave is 18 m, not 17            disp    one wave's omega is 5 % off the deep-water dispersion relation        south   one wave heads south
//   shader  the shader's constants are not the table's   bound   the surface is 30 % too high                                       dead    the surface is flat (the bound check must not be vacuous)
//   period  every wave runs 5 % too fast             slope   the z gradient has a sign error                                      state   the 2.8 m wave's breeze factor is 3, not 4
//   night   the wind at 23:00 is 0.6                 hours   the wind rises at 14:00, not by 13:00                                 wrap    hour 25 is not hour 1
//   xphase xspeed xk xdir xamp   the shader transliteration has one wave's phase / speed / wavenumber / direction / amplitude changed (agreement within 1 mm)
//   taper   the swell dies over 60 m, not 24, so the swimming area is not at full swell                  wgrad   the weight's x gradient has a sign error
//   tjunction  the mid mesh has no fans: the near mesh's vertices stand in the middle of its edge        gap  the mid mesh leaves out a ring of cells too many     overlap  a ring too few: it covers the near mesh
//   winding    one triangle of the far mesh faces down                                                   drift  the mid mesh's vertices along the join are 1 mm out      cells  a near cell (5 m) that does not divide the mid mesh's 12 m
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import * as real from '../js/core/sea.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const TAU = Math.PI * 2;

/** The module the checks look at: the real one, or a broken copy when C_SABOTAGE asks. */
function broken(m) {
  const o = { ...m };
  const waves = m.WAVES.map((w) => ({ ...w }));
  if (on('table')) waves[1].wavelength = 18;
  if (on('disp')) waves[2].omega *= 1.05;
  if (on('south')) waves[3].dz = Math.abs(waves[3].dz);
  o.WAVES = waves;
  o.SHADER = { k: [...m.SHADER.k], dx: [...m.SHADER.dx], dz: [...m.SHADER.dz], phase: [...m.SHADER.phase], omega: [...m.SHADER.omega], amp: [...m.SHADER.amp] };
  if (on('shader')) o.SHADER.k[0] *= 1.001;
  if (on('bound')) o.level = (x, z, t, st) => m.level(x, z, t, st) * 1.3;
  if (on('dead')) o.level = () => 0;
  if (on('period')) { const l = o.level; o.level = (x, z, t, st) => l(x, z, t * 1.05, st); }
  if (on('slope')) o.slope = (x, z, t, st) => { const g = m.slope(x, z, t, st); return [g[0], -g[1]]; };
  if (on('state', 'night', 'hours', 'wrap')) {
    o.seaState = (hour, out) => {
      const s = m.seaState(on('hours') ? hour - 1 : hour, out), h = ((hour % 24) + 24) % 24;
      if (on('state') && h >= 13 && h <= 17.5) s.amp[3] = 3.0;
      if (on('night') && h === 23) s.wind = 0.6;
      if (on('wrap') && hour === 25) s.wind = 1;
      return s;
    };
  }
  if (on('taper')) o.nearWeight = (x, z) => m.nearWeight(x * 1.3, z);
  if (on('wgrad')) o.nearWeightGrad = (x, z, out) => { const g = m.nearWeightGrad(x, z, out); g[0] = -g[0]; return g; };
  return o;
}
const S = broken(real);

/** a small deterministic generator, so a failure is reproducible */
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const only = (i, a = 1) => ({ wind: 1, amp: [0, 0, 0, 0].map((_, j) => (j === i ? a : 0)) });      // a state that lets one wave run alone
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (limit ${eps})`);

test('the four waves: wavelengths 38, 17, 7.5 and 2.8 m, calm amplitudes 0.16, 0.07, 0.03 and 0.01 m, breeze factors 1.8, 2, 2.7 and 4, headings round north', () => {
  const W = S.WAVES;
  assert.equal(W.length, 4);
  assert.deepEqual(W.map((w) => w.wavelength), [38, 17, 7.5, 2.8]);
  assert.deepEqual(W.map((w) => w.amp), [0.16, 0.07, 0.03, 0.01]);
  assert.deepEqual(W.map((w) => w.breeze), [1.8, 2.0, 2.7, 4.0]);
  assert.deepEqual(W.map((w) => w.heading), [-12, 9, -27, 33], 'a small spread of headings round north');
  for (const w of W) {
    close(w.k, TAU / w.wavelength, 1e-12, `wave ${w.id} wavenumber`);
    close(w.omega, Math.sqrt(9.81 * w.k), 1e-9, `wave ${w.id} omega against the deep-water dispersion relation (omega^2 = g k)`);
    close(w.speed, w.omega / w.k, 1e-9, `wave ${w.id} speed`);
    close(w.period, TAU / w.omega, 1e-9, `wave ${w.id} period`);
    close(Math.hypot(w.dx, w.dz), 1, 1e-12, `wave ${w.id} direction is a unit vector`);
    assert.ok(w.dz < -0.8 && Math.abs(w.dx) < 0.55, `wave ${w.id} travels toward north (-z): direction (${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})`);
    close(w.dx, Math.sin(w.heading * Math.PI / 180), 1e-12, `wave ${w.id} dx`); close(w.dz, -Math.cos(w.heading * Math.PI / 180), 1e-12, `wave ${w.id} dz`);
  }
  close(W[0].speed, 7.70, 0.01, 'the 38 m swell travels at 7.7 m/s'); close(W[3].speed, 2.09, 0.01, 'the 2.8 m ripple travels at 2.1 m/s');
  assert.ok(W.every((w, i) => i === 0 || w.wavelength < W[i - 1].wavelength), 'longest first');
  assert.equal(new Set(W.map((w) => w.phase)).size, 4, 'four different fixed phases');
});

test('the shader constants are the table\'s: one source of truth', () => {
  for (const [key, from] of [['k', 'k'], ['dx', 'dx'], ['dz', 'dz'], ['phase', 'phase'], ['omega', 'omega'], ['amp', 'amp']]) {
    assert.deepEqual([...S.SHADER[key]], real.WAVES.map((w) => w[from]), `SHADER.${key} is the waves' ${from}`);
  }
  close(real.PEAK, 0.16 * 1.8 + 0.07 * 2 + 0.03 * 2.7 + 0.01 * 4, 1e-12, 'PEAK is the sum of the breeze amplitudes');
});

test('level is finite and never above the sum of the live amplitudes, and the surface does reach near it', () => {
  const R = rng(7), st = { wind: 1, amp: [0, 0, 0, 0] };
  let top = 0, n = 0;
  for (let i = 0; i < 100000; i++) {
    const x = (R() - 0.5) * 600, z = 100 + R() * 500, t = R() * 20000;
    real.seaState(R() * 24, st);
    const h = S.level(x, z, t, st), bound = real.maxLevel(st);
    assert.ok(Number.isFinite(h), `level (${x}, ${z}, ${t}) is ${h}`);
    assert.ok(Math.abs(h) <= bound + 1e-12, `level ${h} is beyond the sum of the amplitudes ${bound} (state ${JSON.stringify(st)})`);
    top = Math.max(top, Math.abs(h) / bound); n++;
  }
  assert.ok(top >= 0.75, `the surface only reached ${top.toFixed(2)} of its bound in ${n} samples: the swell is flat or the bound is far too loose`);
  assert.ok(Math.abs(S.level(10, 150, 3)) <= real.maxLevel() + 1e-12 && S.level(10, 150, 3) === S.level(10, 150, 3, real.CALM), 'the default state is calm');
});

test('level is periodic in time, wave by wave: one period of its own wave brings it back, half a period turns it upside down', () => {
  const R = rng(11);
  for (let i = 0; i < 4; i++) {
    const w = real.WAVES[i], st = only(i), T = TAU / w.omega;
    let seen = 0;
    for (let j = 0; j < 400; j++) {
      const x = (R() - 0.5) * 260, z = 118 + R() * 142, t = R() * 300;
      const h = S.level(x, z, t, st);
      close(S.level(x, z, t + T, st), h, 1e-9, `wave ${i}: one period (${T.toFixed(3)} s) later at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      close(S.level(x, z, t + 5 * T, st), h, 1e-9, `wave ${i}: five periods later`);
      close(S.level(x, z, t + T / 2, st), -h, 1e-9, `wave ${i}: half a period later is the mirror image`);
      seen = Math.max(seen, Math.abs(h));
    }
    assert.ok(seen > 0.9 * w.amp, `wave ${i} alone reaches ${seen.toFixed(4)} m of its ${w.amp} m`);
  }
});

test('waves travel north at their own speed: a crest keeps its shape and moves along its direction by speed x time', () => {
  for (let i = 0; i < 4; i++) {
    const w = real.WAVES[i], st = only(i), dt = 1.7, R = rng(20 + i);
    for (let j = 0; j < 50; j++) {
      const x = (R() - 0.5) * 200, z = 118 + R() * 140, t = R() * 100;
      close(S.level(x + w.dx * w.speed * dt, z + w.dz * w.speed * dt, t + dt, st), S.level(x, z, t, st), 1e-9, `wave ${i} moved ${(w.speed * dt).toFixed(2)} m toward (${w.dx.toFixed(2)}, ${w.dz.toFixed(2)})`);
    }
  }
});

test('slope is the analytic derivative of level: it matches a numeric one to 1e-6 at 3000 random points, in every sea state', () => {
  const R = rng(3), st = { wind: 1, amp: [0, 0, 0, 0] }, h = 1e-4;
  let worst = 0, biggest = 0;
  for (let i = 0; i < 3000; i++) {
    const x = (R() - 0.5) * 260, z = 100 + R() * 160, t = R() * 3000;
    real.seaState(R() * 24, st);
    const g = S.slope(x, z, t, st);
    const nx = (real.level(x + h, z, t, st) - real.level(x - h, z, t, st)) / (2 * h), nz = (real.level(x, z + h, t, st) - real.level(x, z - h, t, st)) / (2 * h);
    worst = Math.max(worst, Math.abs(g[0] - nx), Math.abs(g[1] - nz)); biggest = Math.max(biggest, Math.abs(g[0]), Math.abs(g[1]));
  }
  assert.ok(worst < 1e-6, `slope differs from the numeric derivative by ${worst}`);
  assert.ok(biggest > 0.05, `the largest slope seen is ${biggest}: the check is not vacuous`);
  assert.ok(biggest < 0.6, `a slope of ${biggest} is not a sea`);
  const out = [9, 9]; assert.equal(real.slope(1, 2, 3, real.CALM, out), out, 'slope fills the array it is given');
});

test('seaState: wind 0.35 at dawn and at night, 1.0 from 13:00 to 17:30, smooth between; amp is 1 at calm and the breeze factors at full wind', () => {
  const at = (h) => S.seaState(h);
  for (const h of [0, 3, 6, 7, 8]) close(at(h).wind, 0.35, 1e-12, `wind at ${h}:00 (dawn and the calm morning)`);
  for (const h of [13, 14, 15, 16.5, 17.5]) close(at(h).wind, 1, 1e-12, `wind at ${h} (the kite hours)`);
  for (const h of [21, 22, 23, 23.9]) close(at(h).wind, 0.35, 1e-12, `wind at ${h}:00 (night)`);
  let prev = 0.35, maxStep = 0;
  for (let h = 8; h <= 13; h += 0.05) { const w = at(h).wind; assert.ok(w >= prev - 1e-12 && w >= 0.35 - 1e-12 && w <= 1 + 1e-12, `the wind rises smoothly: ${w} at ${h}`); maxStep = Math.max(maxStep, w - prev); prev = w; }
  prev = 1;
  for (let h = 17.5; h <= 21; h += 0.05) { const w = at(h).wind; assert.ok(w <= prev + 1e-12 && w >= 0.35 - 1e-12, `the wind falls smoothly: ${w} at ${h}`); maxStep = Math.max(maxStep, prev - w); prev = w; }
  assert.ok(maxStep < 0.05, `the wind moves ${maxStep.toFixed(3)} in 3 game minutes: not smooth`);
  assert.ok(at(10.5).wind > 0.5 && at(10.5).wind < 0.85 && at(19).wind > 0.5 && at(19).wind < 0.85, 'mid-morning and the early evening are half way');
  for (const h of [0, 6, 23]) assert.deepEqual(at(h).amp, [1, 1, 1, 1], `calm amplitudes at ${h}:00`);
  for (const h of [13, 15, 17.5]) for (let i = 0; i < 4; i++) close(at(h).amp[i], [1.8, 2.0, 2.7, 4.0][i], 1e-12, `breeze amplitude of wave ${i} at ${h}`);
  for (const h of [9, 10.5, 12, 18, 19.5, 20.5]) {
    const s = at(h), f = (s.wind - 0.35) / 0.65;
    assert.equal(s.amp.length, 4);
    for (let i = 0; i < 4; i++) close(s.amp[i], 1 + (real.WAVES[i].breeze - 1) * f, 1e-12, `wave ${i} amplitude at ${h} follows the wind`);
  }
  assert.deepEqual(at(25), at(1), 'the hour wraps'); assert.deepEqual(at(-9), at(15)); assert.deepEqual(at(48 + 14), at(14));
  const out = { wind: 0, amp: [0, 0, 0, 0] }; assert.equal(real.seaState(15, out), out, 'seaState fills the object it is given'); assert.equal(out.wind, 1);
});

/** The vertex shader's wave sum, written out: `dot( uWa, sin( uWk * ( uWx * p.x + uWz * p.y ) - uWt + uWp ) )` with the uniforms water.js uploads (waveAmps, waveTime and the SHADER constants). */
function glslHeight(c, x, z, t, state) {
  const A = real.waveAmps(state), T = real.waveTime(t);
  if (on('xamp')) A[0] *= 1.01;
  if (on('xspeed')) T[1] += 0.01 * t % TAU;
  let h = 0;
  for (let i = 0; i < 4; i++) h += A[i] * Math.sin(c.k[i] * (c.dx[i] * x + c.dz[i] * z) - T[i] + c.phase[i]);
  return h;
}

test('the shader\'s wave sum, written out in JS from the uniforms water.js builds, agrees with level to 1 mm at 2000 random points', () => {
  const c = { k: [...real.SHADER.k], dx: [...real.SHADER.dx], dz: [...real.SHADER.dz], phase: [...real.SHADER.phase] };
  if (on('xphase')) c.phase[2] += 0.05;
  if (on('xk')) c.k[0] *= 1.002;
  if (on('xdir')) c.dx[3] *= 1.1;
  const R = rng(5), st = { wind: 1, amp: [0, 0, 0, 0] };
  let worst = 0, at = '';
  for (let i = 0; i < 2000; i++) {
    const x = (R() - 0.5) * 260, z = 118 + R() * 142, t = R() * 6000;
    real.seaState(R() * 24, st);
    const d = Math.abs(glslHeight(c, x, z, t, st) - real.level(x, z, t, st));
    if (d > worst) { worst = d; at = `(${x.toFixed(1)}, ${z.toFixed(1)}) t ${t.toFixed(1)} state ${JSON.stringify(st)}`; }
  }
  assert.ok(worst <= 1e-3, `the shader's sum and level differ by ${(worst * 1000).toFixed(3)} mm at ${at}`);
  for (const t of [0, 1, 13.7, 4096, 86400, 1e6]) for (const v of real.waveTime(t)) assert.ok(v >= 0 && v < TAU, `waveTime(${t}) stays inside one turn: ${v}`);
});

test('nearWeight: full swell all over the swimming area, none from the edge of the near box outward, smooth between', () => {
  const W = S.nearWeight, edgeX = real.NEAR.x, edgeZ = real.NEAR.z1;
  for (let x = -99.4; x <= 99.4; x += 6.2) for (let z = 118; z <= 221; z += 6.5) assert.equal(W(x, z), 1, `the swimming area is at full swell at (${x.toFixed(1)}, ${z})`);
  for (const [x, z] of [[edgeX, 200], [-edgeX, 150], [0, edgeZ], [60, edgeZ], [edgeX + 1, 200], [0, edgeZ + 10], [-200, 300], [edgeX, 150], [-edgeX, 200]]) assert.equal(W(x, z), 0, `no swell on the join at (${x}, ${z})`);
  assert.ok(W(edgeX - 1, 150) > 0 && W(0, edgeZ - 1) > 0, 'and some swell a metre inside the edge: the weight reaches zero AT the edge, not before it');
  assert.equal(W(0, 118), 1, 'the north edge meets the beach, not another mesh: no fade there');
  let prev = 1;
  for (let z = edgeZ - real.NEAR.fade - 2; z <= edgeZ + 2; z += 0.25) { const w = W(0, z); assert.ok(w <= prev + 1e-12 && w >= 0, `monotone toward the south join: ${w} at z ${z}`); assert.ok(prev - w < 0.12, `no step: ${prev} to ${w}`); prev = w; }
  assert.equal(W(-77, 190), W(77, 190), 'symmetric in x');
  assert.deepEqual([real.NEAR.x, real.NEAR.z0, real.NEAR.z1], [132, 118, 262], 'the near box: the brief\'s 130 x 118..260, on the mid mesh\'s 12 m grid');
});

test('nearWeightGrad is the derivative of nearWeight, so slope x weight + level x gradient is the slope of the surface the mesh draws', () => {
  const G = S.nearWeightGrad, r = rng(77), out = [0, 0];
  let worst = 0, inFade = 0;
  for (let i = 0; i < 4000; i++) {
    const x = -140 + 280 * r(), z = 100 + 175 * r(), e = 1e-4, g = G(x, z, out);
    const nx = (S.nearWeight(x + e, z) - S.nearWeight(x - e, z)) / (2 * e), nz = (S.nearWeight(x, z + e) - S.nearWeight(x, z - e)) / (2 * e);
    worst = Math.max(worst, Math.abs(g[0] - nx), Math.abs(g[1] - nz));
    if (Math.hypot(g[0], g[1]) > 0) inFade++;
  }
  assert.ok(inFade > 300, `the sample reaches the fade zones (${inFade} points)`);
  assert.ok(worst < 1e-5, `the analytic gradient is ${worst} from the numeric one`);
  assert.deepEqual(G(0, 200, out).slice(), [0, 0], 'no gradient at full swell');
  assert.ok(G(125, 200, out)[0] < 0 && G(-125, 200, out)[0] > 0, 'the weight falls toward the east and west seams');
  assert.ok(G(0, 255, out)[1] < 0, 'and toward the south seam');
  // the surface the mesh draws, h = w * swell: the product rule against a difference quotient of the product
  const st = real.seaState(15), t = 31.7, sl = [0, 0];
  let wp = 0;
  for (let i = 0; i < 2000; i++) {
    const x = 100 + 40 * r(), z = 200 + 70 * r(), e = 1e-4, w = S.nearWeight(x, z), g = G(x, z, out), s = real.slope(x, z, t, st, sl), h = real.level(x, z, t, st);
    const gx = s[0] * w + h * g[0], gz = s[1] * w + h * g[1];
    const f = (a, b) => S.nearWeight(a, b) * real.level(a, b, t, st);
    wp = Math.max(wp, Math.abs(gx - (f(x + e, z) - f(x - e, z)) / (2 * e)), Math.abs(gz - (f(x, z + e) - f(x, z - e)) / (2 * e)));
  }
  assert.ok(wp < 1e-5, `h dw + w dh is ${wp} from the difference quotient of w h`);
});

// ---- the meshes ---------------------------------------------------------------------------------------------------------------------------
/** The three sea meshes for a near cell: the real ones, or broken ones when C_SABOTAGE asks (tjunction, gap, overlap, winding, drift: see the top of the file). */
function meshes(cell) {
  const { NEAR: N, MESH: M } = real, g = real.seaMeshes(cell);
  const mid = { x: M.mid.x, z0: N.z0, z1: M.mid.z1, cell: M.mid.cell }, hole = (d, c) => ({ x: N.x + d, z: N.z1 + d, cell: c });
  if (on('tjunction')) g.mid = real.seaGrid(mid, hole(0, M.mid.cell));                      // a "finer" mesh as coarse as this one: no fans
  if (on('gap')) g.mid = real.seaGrid(mid, hole(M.mid.cell, cell));
  if (on('overlap')) g.mid = real.seaGrid(mid, hole(-M.mid.cell, cell));
  if (on('winding')) { const i = g.far.idx; [i[1], i[2]] = [i[2], i[1]]; }
  if (on('drift')) { const p = g.mid.pos; for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i]) <= N.x + 12) p[i] += 0.001; }
  return g;
}

test('the three sea meshes tile the sea exactly: every edge belongs to two triangles bar the outer rim, nothing overlaps, nothing faces down, the areas add up to the box', () => {
  const { NEAR: N, MESH: M } = real, rimX = M.far.x, rimZ = M.far.z1;
  for (const [tier, cell] of Object.entries(real.MESH.cells)) {
    const edges = new Map();
    let area = 0, down = 0, tris = 0;
    for (const g of Object.values(meshes(cell))) {
      const p = g.pos, ix = g.idx;
      for (let t = 0; t < ix.length; t += 3) {
        const v = [0, 1, 2].map((k) => [p[2 * ix[t + k]], p[2 * ix[t + k] + 1]]);
        const ny = (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) - (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]);      // y of (b - a) x (c - a): positive is facing up
        if (!(ny > 0)) down++;
        area += ny / 2; tris++;
        for (let k = 0; k < 3; k++) { const a = v[k].join(), b = v[(k + 1) % 3].join(), key = a < b ? `${a}|${b}` : `${b}|${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      }
    }
    const loose = [], over = [];
    let shared = 0, rim = 0;
    for (const [key, n] of edges) {
      if (n === 2) { shared++; continue; }
      if (n > 2) { over.push(key); continue; }
      const [a, b] = key.split('|').map((s) => s.split(',').map(Number));
      if ((a[1] === N.z0 && b[1] === N.z0) || (a[1] === rimZ && b[1] === rimZ) || (Math.abs(a[0]) === rimX && a[0] === b[0])) rim++; else loose.push(key);
    }
    assert.equal(down, 0, `${tier}: ${down} triangles face down or are flat`);
    assert.deepEqual(over, [], `${tier}: edges that belong to more than two triangles (an overlap): ${over.slice(0, 3)}`);
    assert.deepEqual(loose, [], `${tier}: ${loose.length} edges inside the sea that belong to one triangle only (a gap or a T-junction), first ${loose.slice(0, 3)}`);
    close(area, 2 * rimX * (rimZ - N.z0), 1e-3, `${tier}: the triangles cover the sea box exactly once`);
    assert.ok(rim > 100 && shared > 8000 && tris > 8000, `${tier}: the probe saw ${rim} rim edges, ${shared} shared edges and ${tris} triangles: not vacuous`);
  }
});

test('the layout: the near mesh is the near box in 2.4, 4 or 6 m cells, every vertex is on the 0.4 m lattice, and each coarse mesh runs through every vertex of the finer one on their join', () => {
  const { NEAR: N, MESH: M, LATTICE: L } = real, cells = on('cells') ? { ...M.cells, medium: 5 } : M.cells;
  assert.deepEqual(Object.values(cells), [2.4, 4, 6], 'the near mesh\'s cells by quality, high first');
  for (const c of Object.values(cells)) assert.equal(Math.round(M.mid.cell / L) % Math.round(c / L), 0, `a ${c} m near cell divides the mid mesh's ${M.mid.cell} m (the fans run through whole cells)`);
  assert.equal(M.far.cell % M.mid.cell, 0, 'the mid cell divides the far one');
  assert.equal(L, 0.4);
  const n = (a, b) => { const q = a / b; assert.ok(Math.abs(q - Math.round(q)) < 1e-9, `${a} m is not a whole number of ${b} m`); return Math.round(q); };      // a count of cells
  for (const [tier, cell] of Object.entries(M.cells)) {
    const g = meshes(cell), key = (p, i) => `${p[2 * i]},${p[2 * i + 1]}`;
    // the triangles: 2 per cell, the mid mesh minus the near box, plus the fans along the near box's west, east and south edges (a fan cell has one triangle more than 2 for each extra step along
    // its edge); the far mesh the same round the mid box
    const nearCells = n(2 * N.x, cell) * n(N.z1 - N.z0, cell), steps = n(M.mid.cell, cell);
    const midCells = n(2 * M.mid.x, M.mid.cell) * n(M.mid.z1 - N.z0, M.mid.cell), holeCells = n(2 * N.x, M.mid.cell) * n(N.z1 - N.z0, M.mid.cell), joinCells = 2 * n(N.z1 - N.z0, M.mid.cell) + n(2 * N.x, M.mid.cell);
    const farCells = n(2 * M.far.x, M.far.cell) * n(M.far.z1 - N.z0, M.far.cell), farHole = n(2 * M.mid.x, M.far.cell) * n(M.mid.z1 - N.z0, M.far.cell), farJoin = 2 * n(M.mid.z1 - N.z0, M.far.cell) + n(2 * M.mid.x, M.far.cell);
    assert.equal(g.near.tris, 2 * nearCells, `${tier}: near triangles`);
    assert.equal(g.mid.tris, 2 * (midCells - holeCells) + joinCells * (steps - 1), `${tier}: mid triangles`);
    assert.equal(g.far.tris, 2 * (farCells - farHole) + farJoin * (n(M.far.cell, M.mid.cell) - 1), `${tier}: far triangles`);
    for (const [name, m] of Object.entries(g)) {
      assert.equal(m.idx.length, 3 * m.tris, `${tier} ${name}: three indices a triangle`);
      for (let i = 0; i < m.pos.length; i++) { const s = Math.round(m.pos[i] / L); assert.equal(m.pos[i], Math.fround(s * L), `${tier} ${name}: ${m.pos[i]} is not the float of lattice point ${s}`); }
    }
    // the join: every vertex the finer mesh has on the edge of its box is a vertex of the coarser one
    const has = (m) => { const s = new Set(); for (let i = 0; i < m.pos.length / 2; i++) s.add(key(m.pos, i)); return s; };
    for (const [fine, coarse, box] of [[g.near, g.mid, { x: N.x, z: N.z1 }], [g.mid, g.far, { x: M.mid.x, z: M.mid.z1 }]]) {
      const into = has(coarse); let on_ = 0, missing = 0;
      for (let i = 0; i < fine.pos.length / 2; i++) {
        const x = fine.pos[2 * i], z = fine.pos[2 * i + 1];
        if (!(Math.abs(x) === box.x || z === box.z)) continue;
        if (Math.abs(x) > box.x || z > box.z) continue;
        on_++; if (!into.has(key(fine.pos, i))) missing++;
      }
      assert.ok(on_ > 50, `${tier}: ${on_} vertices on a join: not vacuous`);
      assert.equal(missing, 0, `${tier}: ${missing} of the ${on_} vertices of a finer mesh on its join are not a vertex of the coarser mesh, to the last bit`);
    }
  }
});
