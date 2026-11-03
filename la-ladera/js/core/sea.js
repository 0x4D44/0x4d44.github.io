// THE SEA'S SWELL (A1, dev/FEATURE-BEACH.md 2.1): four travelling waves, ONE formula that the CPU and the GLSL share. PURE: no THREE, no DOM, runs under node.
//
//   WAVES                     the four waves: wavelength, k, omega (deep-water dispersion), speed, heading, calm amplitude, breeze factor, phase
//   seaState(hour[, out])     the sea's mood at a clock hour: { wind, amp: [4] }; wind 0.35 at dawn and at night, 1.0 from 13:00 to 17:30; amp[i] multiplies wave i's calm amplitude
//   level(x, z, t[, state])   the surface height ABOVE THE STILL SEA in metres (0 = a flat sea); slope(x, z, t[, state]) -> [dh/dx, dh/dz], analytic
//   SHADER, waveAmps, waveTime   what engine/water.js uploads each frame: the constants, the live amplitudes and omega * t reduced to a turn (so the GLSL never sees a big argument)
//   NEAR, nearWeight[, nearWeightGrad]   the near sea mesh's box, the weight that lets its swell die away at the seams (the mid and far meshes are flat), and that weight's gradient
//   LATTICE, MESH, seaGrid, seaMeshes   the three sea meshes' layout as plain arrays (x, z per vertex and the triangles), built to meet vertex to vertex; engine/water.js only adds the height and the bed
//
// World axes as everywhere else: x east, y up, z south. The waves travel toward NORTH (-z): the wind is a south breeze and the beach lies behind the player's spawn.
// A wave is h = a * sin(k (dx x + dz z) - omega t + phase) with dx = sin(heading), dz = -cos(heading), heading in degrees from north toward east.
const TAU = Math.PI * 2;
export const GRAVITY = 9.81;
const DEG = Math.PI / 180;
const ss = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

// wavelength (m), calm amplitude (m), the breeze factor (amplitude x at wind 1.0), heading (degrees from north, + toward east), a fixed phase (radians)
const SPEC = [
  { wavelength: 38, amp: 0.16, breeze: 1.8, heading: -12, phase: 0.70 },
  { wavelength: 17, amp: 0.07, breeze: 2.0, heading: 9, phase: 2.90 },
  { wavelength: 7.5, amp: 0.03, breeze: 2.7, heading: -27, phase: 4.40 },
  { wavelength: 2.8, amp: 0.01, breeze: 4.0, heading: 33, phase: 1.30 },
];
export const N_WAVES = SPEC.length;
export const WAVES = Object.freeze(SPEC.map((w, id) => {
  const k = TAU / w.wavelength, omega = Math.sqrt(GRAVITY * k), a = w.heading * DEG;       // deep water: omega^2 = g k
  return Object.freeze({ id, ...w, k, omega, speed: omega / k, period: TAU / omega, dx: Math.sin(a), dz: -Math.cos(a) });
}));
/** The sum of the calm amplitudes times their breeze factors: no state can lift the surface higher than this (m). */
export const PEAK = WAVES.reduce((s, w) => s + w.amp * w.breeze, 0);

/** The constants the GLSL needs, per wave (arrays of N_WAVES numbers): engine/water.js builds its vec4 uniforms from these and from nothing else. */
export const SHADER = Object.freeze({
  k: Object.freeze(WAVES.map((w) => w.k)), dx: Object.freeze(WAVES.map((w) => w.dx)), dz: Object.freeze(WAVES.map((w) => w.dz)),
  phase: Object.freeze(WAVES.map((w) => w.phase)), omega: Object.freeze(WAVES.map((w) => w.omega)), amp: Object.freeze(WAVES.map((w) => w.amp)),
});

// ---- the sea's mood ----------------------------------------------------------------------------------------------------------------
/** Wind at dawn and at night, and in the afternoon breeze. The wind rises from 08:30, is full from 13:00 to 17:30 (the kite hours) and drops again by 21:00. */
export const WIND = Object.freeze({ calm: 0.35, breeze: 1.0, rise: Object.freeze([8.5, 13]), fall: Object.freeze([17.5, 21]) });
export const CALM = Object.freeze({ wind: WIND.calm, amp: Object.freeze([1, 1, 1, 1]) });
const ONES = CALM.amp;

/** { wind, amp } for a clock hour (any real number: it wraps). amp[i] is 1 at calm and the wave's breeze factor at full wind, linear in wind between. `out` is reused when given. */
export function seaState(hour, out = { wind: WIND.calm, amp: [1, 1, 1, 1] }) {
  const h = ((hour % 24) + 24) % 24;
  const f = ss(WIND.rise[0], WIND.rise[1], h) - ss(WIND.fall[0], WIND.fall[1], h);               // 0 calm .. 1 full breeze
  out.wind = WIND.calm + (WIND.breeze - WIND.calm) * f;
  for (let i = 0; i < N_WAVES; i++) out.amp[i] = 1 + (WAVES[i].breeze - 1) * f;
  return out;
}

// ---- the surface ---------------------------------------------------------------------------------------------------------------------
/** Height of the swell above the still sea (m) at (x, z), t seconds, for a sea state (default calm). A pure function of its arguments. */
export function level(x, z, t = 0, state = CALM) {
  const s = state.amp ?? ONES;
  let h = 0;
  for (let i = 0; i < N_WAVES; i++) { const w = WAVES[i]; h += w.amp * s[i] * Math.sin(w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase); }
  return h;
}

/** [dh/dx, dh/dz] of `level`, analytic. `out` is reused when given. */
export function slope(x, z, t = 0, state = CALM, out = [0, 0]) {
  const s = state.amp ?? ONES;
  let gx = 0, gz = 0;
  for (let i = 0; i < N_WAVES; i++) {
    const w = WAVES[i], c = w.amp * s[i] * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase);
    gx += c * w.dx; gz += c * w.dz;
  }
  out[0] = gx; out[1] = gz;
  return out;
}

/** The largest height the surface can reach in a state (m): the sum of the live amplitudes. */
export function maxLevel(state = CALM) { const s = state.amp ?? ONES; let m = 0; for (let i = 0; i < N_WAVES; i++) m += WAVES[i].amp * s[i]; return m; }

/** The live amplitude of each wave (m): the calm amplitude times the state's factor. What the shader's amplitude uniform holds. */
export function waveAmps(state = CALM, out = [0, 0, 0, 0]) { const s = state.amp ?? ONES; for (let i = 0; i < N_WAVES; i++) out[i] = WAVES[i].amp * s[i]; return out; }
/** omega * t of each wave reduced to [0, 2 pi) in double precision: what the shader subtracts from k (d . p) + phase. Same sine as `level`, but a small argument for the GPU however long the game runs. */
export function waveTime(t, out = [0, 0, 0, 0]) { for (let i = 0; i < N_WAVES; i++) out[i] = (WAVES[i].omega * t) % TAU; return out; }

// ---- the sea as the rest of the engine asks it -----------------------------------------------------------------------------------------
/**
 * `{ state, time, level, slope, depth }`: what `ctx.sea` is once engine/water.js has built the water, and what engine/seaview.js hands out before that (the `sea` unit builds it a few hundred ms after the
 * lazy milestone, and under `?skip=coast` it never exists). ONE set of functions over a live sea state `state` ({ wind, amp }, kept by whoever owns it), a clock `clock()` (seconds the swell has run), a
 * `ground(x, z)` (the seabed or the sand, metres over the datum) and the `still` sea's height over the datum (world/coast.js SEA), so a swimmer, a camera and a sound read the very surface the near
 * mesh draws. `refresh()` runs before each answer when given (the stand-in uses it to follow the hour).
 *   level(x, z, t?)         the swell above the still sea: `level` of this file times nearWeight, exactly the surface the near mesh draws (the mid and far meshes are flat)
 *   slope(x, z, t?, out?)   [dh/dx, dh/dz] of that surface: the product rule, w dh + h dw (the weight is flat nearly everywhere, but not on the last 24 m before the near mesh's seams)
 *   depth(x, z, t?)         still + level - ground: the water over the ground at (x, z), negative on land
 *   under(x, y, z, t?)      still + level - y: how far the point (x, y, z) is under the surface at its own place, negative above it (round 8: the camera's depth, engine/look.js)
 *   submerged               is the `eye()` (a { x, y, z }, the camera's place) more than 2 cm under the surface? false with no `eye`
 */
export function makeSea({ state, clock = () => 0, ground, still, refresh = null, eye = null }) {
  const gw = [0, 0];
  const sea = {
    state,
    get time() { return clock(); },
    level: (x, z, t = clock()) => { refresh?.(); return level(x, z, t, state) * nearWeight(x, z); },
    slope: (x, z, t = clock(), out = [0, 0]) => {
      refresh?.();
      slope(x, z, t, state, out);
      const w = nearWeight(x, z);
      if (w === 0) { out[0] = out[1] = 0; return out; }
      if (w === 1) return out;
      nearWeightGrad(x, z, gw);
      const h = level(x, z, t, state);
      out[0] = out[0] * w + h * gw[0]; out[1] = out[1] * w + h * gw[1];
      return out;
    },
    depth: (x, z, t = clock()) => still + sea.level(x, z, t) - ground(x, z),
    under: (x, y, z, t = clock()) => still + sea.level(x, z, t) - y,
    get submerged() { const e = eye?.(); return !!e && sea.under(e.x, e.y, e.z) > SUBMERGED; },
  };
  return sea;
}
/** How far under the surface a camera is before it is `submerged` (m): a ripple's worth, so a head that bobs at the waterline is not in and out of the sea every frame. */
export const SUBMERGED = 0.02;

/**
 * How far the swell runs up the foreshore over the still sea's wet line (m, 0..0.10): it breathes with the long swell (`phase`, wave 0's omega t, engine/shaderpatch.js `uSwash`) and is smaller in a calm
 * (`ampSum`, the sum of the live amplitudes: 0.27 m at a calm morning, 0.5 m and more in the afternoon breeze). The sand's wet line is the still sea + 12 cm + this.
 */
export function swashRunup(phase, ampSum) { return 0.10 * (0.5 + 0.5 * Math.sin(phase + 0.9)) * Math.min(1, Math.max(0.4, ampSum / 0.27)); }

// ---- where the surface moves ---------------------------------------------------------------------------------------------------------
/** The near sea mesh: x +-132, z 118 to 262. Only it is displaced (the mid and far meshes are flat). Its swell fades to nothing over the last `fade` metres before the edge of its box, so the surface
 *  is flat where the meshes meet. The swimming area (x +-99.4, z up to 220) is inside the full-swell part. The north edge is the beach, not a join: no fade there. */
export const NEAR = Object.freeze({ x: 132, z0: 118, z1: 262, fade: 24 });
/** 1 inside the near mesh's full-swell part, 0 from the edge of its box (x = +-132, z = 262) outward: what multiplies the swell in the vertex shader. */
export function nearWeight(x, z) { return ss(0, NEAR.fade, Math.min(NEAR.x - Math.abs(x), NEAR.z1 - z)); }
/** [d/dx, d/dz] of `nearWeight`, analytic (0 where it is flat): with the swell's own slope it gives the slope of the surface the mesh draws, h dw + w dh. `out` is reused when given. */
export function nearWeightGrad(x, z, out = [0, 0]) {
  const ex = NEAR.x - Math.abs(x), ez = NEAR.z1 - z, d = Math.min(ex, ez);
  out[0] = out[1] = 0;
  if (d <= 0 || d >= NEAR.fade) return out;
  const t = d / NEAR.fade, k = 6 * t * (1 - t) / NEAR.fade;                  // d(smoothstep)/dd
  if (ex <= ez) out[0] = x > 0 ? -k : k; else out[1] = -k;
  return out;
}

// ---- where the sea is drawn: three meshes that meet vertex to vertex ---------------------------------------------------------------------
// NEAR (cells of 2.4, 4 or 6 m by quality), MID (12 m) and FAR (96 m, flat), each a plain grid. Where a coarse mesh meets a finer one, the finer one's vertices stand on the coarse one's edge, and a
// pixel on that edge can fall between the two (T-junction pinholes: the sea bed or the sky shows through the sea for a pixel). So the meshes are built to fit: every vertex is a whole number of
// LATTICE steps from the origin, so a vertex the two meshes share is the very same float in both; the coarse mesh leaves out the cells wholly inside the finer mesh's box, and cuts the cells along its
// edge into fans through the finer mesh's vertices. The two then share every vertex on the join, and a rasterizer never leaves a gap or draws twice along an edge two triangles share (nor does it under MSAA).
/** The lattice every vertex of the three meshes lies on (m). */
export const LATTICE = 0.4;
/** The meshes' boxes (x +-half width, z from NEAR.z0 to z1) and cells (m). Each box's edges are grid lines of the next coarser mesh, and each cell divides the next coarser mesh's cell. */
export const MESH = Object.freeze({
  cells: Object.freeze({ high: 2.4, medium: 4, low: 6 }),                    // the near mesh's cell by quality: each divides the mid mesh's 12 m
  mid: Object.freeze({ x: 480, z1: 598, cell: 12 }),
  far: Object.freeze({ x: 960, z1: 982, cell: 96 }),
});
const lat = (m) => { const n = Math.round(m / LATTICE); if (Math.abs(n * LATTICE - m) > 1e-9) throw new Error(`sea mesh: ${m} m is not on the ${LATTICE} m lattice`); return n; };

/** The grid x +-`x`, z `z0` to `z1` in squares of `cell` m, as { pos: Float32Array of (x, z) per vertex, idx: Uint32Array (counter-clockwise from above), tris }. `hole` = { x, z, cell }: the box (x +-hole.x,
 *  z up to hole.z) of a finer mesh in cells of hole.cell m, which draws that part instead: the cells wholly inside it are left out, and the cells along its edge are fans through its vertices. */
export function seaGrid({ x, z0, z1, cell }, hole = null) {
  const X = lat(x), Z0 = lat(z0), Z1 = lat(z1), C = lat(cell), HX = hole ? lat(hole.x) : 0, HZ = hole ? lat(hole.z) : 0, HC = hole ? lat(hole.cell) : C;
  if ((2 * X) % C || (Z1 - Z0) % C) throw new Error(`sea mesh: a ${cell} m cell does not fit the box`);
  if (hole && (C % HC || HX > X || HZ > Z1 || (X - HX) % C || (X + HX) % C || (HZ - Z0) % C)) throw new Error('sea mesh: the finer mesh does not fit the grid it replaces');
  const m = C / HC, pos = [], idx = [], at = new Map();
  let tris = 0;
  const vert = (I, J) => {                                                    // one vertex per lattice point
    const key = (I + 4096) * 8192 + J;
    let v = at.get(key);
    if (v === undefined) { v = pos.length / 2; at.set(key, v); pos.push(I * LATTICE, J * LATTICE); }
    return v;
  };
  const tri = (a, b, c) => { idx.push(a, b, c); tris++; };
  for (let J0 = Z0; J0 < Z1; J0 += C) for (let I0 = -X; I0 < X; I0 += C) {
    const I1 = I0 + C, J1 = J0 + C;
    const west = hole && J1 <= HZ && I1 === -HX, east = hole && J1 <= HZ && I0 === HX, north = hole && J0 === HZ && I0 >= -HX && I1 <= HX;
    if (hole && I0 >= -HX && I1 <= HX && J1 <= HZ) continue;                 // the finer mesh draws this cell
    const a = vert(I0, J0), b = vert(I1, J0), c = vert(I1, J1), d = vert(I0, J1);       // a (west, north) b (east, north) c (east, south) d (west, south)
    if (m > 1 && west) { tri(a, d, c); for (let k = 0; k < m; k++) tri(a, vert(I1, J0 + (k + 1) * HC), vert(I1, J0 + k * HC)); }          // the cell's east edge is the join: a fan from a
    else if (m > 1 && east) { tri(a, c, b); for (let k = 0; k < m; k++) tri(c, vert(I0, J0 + k * HC), vert(I0, J0 + (k + 1) * HC)); }     // its west edge: a fan from c
    else if (m > 1 && north) { tri(a, d, c); for (let k = 0; k < m; k++) tri(c, vert(I0 + (k + 1) * HC, J0), vert(I0 + k * HC, J0)); }    // its north edge: a fan from c
    else { tri(a, d, c); tri(a, c, b); }
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tris };
}

/** The three meshes { near, mid, far } for a near cell (MESH.cells.*): the mid mesh depends on it, because its fans run through the near mesh's vertices. */
export function seaMeshes(nearCell = MESH.cells.high) {
  const mid = MESH.mid, far = MESH.far;
  return {
    near: seaGrid({ x: NEAR.x, z0: NEAR.z0, z1: NEAR.z1, cell: nearCell }),
    mid: seaGrid({ x: mid.x, z0: NEAR.z0, z1: mid.z1, cell: mid.cell }, { x: NEAR.x, z: NEAR.z1, cell: nearCell }),
    far: seaGrid({ x: far.x, z0: NEAR.z0, z1: far.z1, cell: far.cell }, { x: mid.x, z: mid.z1, cell: mid.cell }),
  };
}
