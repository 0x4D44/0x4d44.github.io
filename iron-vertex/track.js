// ============================================================
// Iron Vertex — procedural track generation and ride physics.
//
// Pure ESM: plain numbers, no Three.js and no DOM. Everything the ride
// depends on for *correctness* lives here so it can be exercised under
// `node --test` as well as in the browser. index.html only renders it.
//
// The track is closed by construction:
//   1. a smooth closed plan-view curve (radial harmonics on a circle),
//   2. a periodic height profile keyed to normalised arc length,
//   3. an optional vertical loop spliced in, which returns to its own
//      entry point and heading,
//   4. rotation-minimising frames whose residual twist is distributed
//      around the circuit so the banking also closes.
//
// Hill heights are clamped against an energy budget, and buildTrack()
// then *simulates* the finished circuit and lowers the profile until the
// train demonstrably makes it round. Generation never emits a track the
// train can roll back down.
// ============================================================

export const G = 9.81;

// Rolling resistance and aerodynamic drag, tuned so a circuit sheds
// roughly a third of its lift height — about right for a steel coaster.
export const ROLLING_FRICTION = 0.010;
export const DRAG_COEFF = 0.00022; // a_drag = DRAG_COEFF * v^2

const STATION_Y = 3.0; // deck height of the station above the ground plane
const RESAMPLE_DS = 1.2; // metres between centreline samples
const CHAIN_SPEED = 5.0; // m/s, chain lift
const STATION_SPEED = 4.0; // m/s, station transfer
const MIN_FREE_SPEED = 3.0; // m/s, below this the train has stalled
const MIN_TRACK_CLEARANCE = 1.2; // m, lowest the rails may sit above the ground
const PROFILE_G_BUDGET = 4.0; // max vertical g the height profile may impose
const MAX_RIDEABLE_G = 6.2; // max g anywhere on the assembled circuit
const MIN_PLAN_RADIUS = 26; // m, tightest horizontal turn the plan curve may draw
const MAX_ROLL_RATE = 0.055; // rad per metre of track (~3 degrees/m)

// ------------------------------------------------------------
// Small vector helpers. Points are plain {x, y, z} objects.
// ------------------------------------------------------------

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vadd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const vsub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const vmul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vcross = (a, b) =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export function vnorm(a) {
  const l = vlen(a);
  return l > 1e-9 ? vmul(a, 1 / l) : v3(0, 0, 0);
}

export function vlerp(a, b, t) {
  return v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

// Rotate `v` about unit axis `axis` by `angle` (Rodrigues).
export function vrotate(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = vcross(axis, v);
  const d = vdot(axis, v) * (1 - c);
  return v3(
    v.x * c + k.x * s + axis.x * d,
    v.y * c + k.y * s + axis.y * d,
    v.z * c + k.z * s + axis.z * d,
  );
}

// ------------------------------------------------------------
// Deterministic PRNG. Same seed, same coaster — which is what makes
// "NEW TRACK" reproducible and the tests meaningful.
// ------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_A = [
  "Iron", "Vortex", "Thunder", "Storm", "Viper", "Cobalt", "Crimson", "Nitro",
  "Phantom", "Comet", "Titan", "Raptor", "Vertigo", "Cyclone", "Onyx", "Zephyr",
  "Havoc", "Quasar", "Talon", "Ember", "Tempest", "Basilisk", "Kestrel", "Granite",
];
const NAME_B = [
  "Vertex", "Fury", "Comet", "Spiral", "Ridge", "Falls", "Coil", "Drift",
  "Reign", "Chase", "Peak", "Rush", "Cascade", "Descent", "Arc", "Helix",
  "Break", "Surge", "Traverse", "Vault", "Gorge", "Circuit", "Run", "Crown",
];

export function trackName(rng) {
  const a = NAME_A[Math.floor(rng() * NAME_A.length)];
  let b = NAME_B[Math.floor(rng() * NAME_B.length)];
  if (b === a) b = NAME_B[(NAME_B.indexOf(b) + 1) % NAME_B.length];
  return `${a} ${b}`;
}

// ------------------------------------------------------------
// Plan view: a closed, smooth, star-free curve.
// r(t) = R * (1 + Σ a_k sin(k t + φ_k)) with Σ a_k < 1, so the radius
// stays positive and the curve never self-intersects in plan.
// ------------------------------------------------------------

function planCurve(rng, samples) {
  const R = 76 + rng() * 40;
  const squash = 0.72 + rng() * 0.36;
  const spin = rng() * Math.PI * 2;
  const harmonics = [];
  for (let k = 2; k <= 5; k++) {
    harmonics.push({ k, amp: (0.04 + rng() * 0.14) * (k <= 3 ? 1 : 0.45), phase: rng() * Math.PI * 2 });
  }

  const draw = (damp) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      let r = 1;
      for (const h of harmonics) r += h.amp * damp * Math.sin(h.k * t + h.phase);
      r *= R;
      const a = t + spin;
      pts.push(v3(Math.cos(a) * r, STATION_Y, Math.sin(a) * r * squash));
    }
    return pts;
  };

  // Harmonics that happen to line up can pinch the plan view into a turn
  // far tighter than anything is rideable at speed — and no amount of
  // profile relaxation fixes a horizontal corner. Damp the harmonics
  // until the tightest turn in plan clears the floor, so the circuit is
  // drivable by construction rather than by luck.
  let pts = draw(1);
  for (let attempt = 0; attempt < 14 && minPlanRadius(pts) < MIN_PLAN_RADIUS; attempt += 1) {
    pts = draw(Math.pow(0.85, attempt + 1));
  }
  return pts;
}

// Smallest radius of curvature in the horizontal plane, via the
// circumradius of each consecutive sample triple.
function minPlanRadius(pts) {
  const n = pts.length;
  let smallest = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 2 + n) % n];
    const b = pts[i];
    const c = pts[(i + 2) % n];
    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const bc = Math.hypot(c.x - b.x, c.z - b.z);
    const ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    if (area2 < 1e-9) continue; // collinear: straight, infinite radius
    const radius = (ab * bc * ca) / (2 * area2);
    if (radius < smallest) smallest = radius;
  }
  return smallest;
}

// Cumulative arc length of a closed polyline, plus its total length.
function arcLengths(pts) {
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    cum[i + 1] = cum[i] + vlen(vsub(pts[(i + 1) % n], pts[i]));
  }
  return { cum, total: cum[n] };
}

// Resample a closed polyline to a fixed arc-length spacing, carrying a
// parallel per-sample array (the region roles) through the remap. Roles
// must survive resampling and splicing: deriving them from index
// fractions afterwards is wrong, because both operations move the
// origin and change the sample count.
function resampleClosed(pts, ds, roles) {
  const { cum, total } = arcLengths(pts);
  const count = Math.max(24, Math.round(total / ds));
  const step = total / count;
  const out = [];
  const outRoles = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (seg < pts.length - 1 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const t = segLen > 1e-9 ? (target - cum[seg]) / segLen : 0;
    out.push(vlerp(pts[seg], pts[(seg + 1) % pts.length], t));
    if (roles) outRoles.push(roles[t < 0.5 ? seg : (seg + 1) % roles.length]);
  }
  return { points: out, roles: roles ? outRoles : null, length: total, ds: step };
}

// ------------------------------------------------------------
// Height profile.
//
// Keyframes are (u, y) with u a normalised arc-length position, wrapped
// so the profile is periodic. Interpolated with a centripetal-ish
// Catmull-Rom for C1 continuity: the crest of the lift wants to be
// rounded, not a spike.
// ------------------------------------------------------------

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// Evaluate a periodic keyframe track at normalised position u.
function sampleProfile(keys, u) {
  const n = keys.length;
  let uu = u - Math.floor(u);
  // Locate the segment containing uu.
  let i = 0;
  while (i < n - 1 && keys[i + 1].u <= uu) i++;
  const k1 = keys[i];
  const k2 = keys[(i + 1) % n];
  const k0 = keys[(i - 1 + n) % n];
  const k3 = keys[(i + 2) % n];
  const span = (k2.u > k1.u ? k2.u : k2.u + 1) - k1.u;
  const t = span > 1e-9 ? (uu - k1.u) / span : 0;
  return catmullRom(k0.y, k1.y, k2.y, k3.y, Math.min(1, Math.max(0, t)));
}

// The layout: station → chain lift → first drop → a decreasing run of
// airtime hills → brake run → station. `scale` shrinks every hill when
// buildTrack discovers the train cannot make it round.
function heightKeyframes(rng, length, scale) {
  // The apex is deliberately NOT scaled on retry. Shrinking the lift hill
  // alongside the airtime hills leaves the energy ratio between them
  // unchanged, so a circuit that stalls would stall at every attempt —
  // only the hills come down.
  // The lift and the drop are sized in METRES of track and only then
  // converted to a fraction of the circuit. Fixed fractions make the
  // gradient depend on how long the circuit happens to be: on a short
  // one, "drop 45m over 7% of the track" is steeper than vertical, which
  // produces a pull-out radius of a few metres and a double-digit g
  // spike at the bottom.
  const apex = Math.min(38 + rng() * 20, length * 0.12);
  const liftU = Math.min(0.30, (apex * 2.0) / length); // ~27 degrees of chain
  const dropU = Math.min(0.20, (apex * 1.4) / length); // ~55 degrees of drop
  const liftEndU = 0.10 + liftU;
  const dropBottomU = liftEndU + dropU;
  const brakeStartU = 0.88;

  // The crest keyframes are symmetric about the apex. An asymmetric
  // trio (apex-2.5, apex, apex-3.0 at unequal spacing) makes Catmull-Rom
  // overshoot into an S: the profile dips and climbs again just past the
  // top, giving the circuit a second, unintended summit.
  const keys = [
    { u: 0.00, y: STATION_Y },
    { u: 0.05, y: STATION_Y },
    { u: 0.10, y: STATION_Y + 1.0 },
    { u: liftEndU - 0.04, y: apex - 6.0 },
    { u: liftEndU, y: apex },
    { u: liftEndU + 0.04, y: apex - 6.0 },
    { u: dropBottomU, y: STATION_Y + 1.5 },
  ];

  // Hills between the first drop and the brake run. Each peak is capped
  // by the height still available after friction and drag have eaten
  // into the apex, with a margin so the train crests it with speed.
  const hillCount = 3 + Math.floor(rng() * 3);
  const spanStart = dropBottomU + 0.02;
  const spanEnd = brakeStartU - 0.04;
  const spanU = spanEnd - spanStart;
  for (let j = 0; j < hillCount; j++) {
    const centre = spanStart + (spanU * (j + 0.5)) / hillCount;
    const travelled = centre * length;
    const lossHeight = ROLLING_FRICTION * travelled + 0.10 * travelled * DRAG_COEFF * 60;
    const available = Math.max(4, apex - STATION_Y - lossHeight);
    const fade = 0.68 - 0.09 * j;
    const peak = STATION_Y + available * Math.max(0.15, fade) * (0.85 + rng() * 0.3) * scale;
    const valley = STATION_Y + Math.max(1.0, (peak - STATION_Y) * (0.12 + rng() * 0.14));
    keys.push({ u: centre - spanU / (hillCount * 2.6), y: valley });
    keys.push({ u: centre, y: Math.min(peak, apex - 4) });
  }

  keys.push({ u: brakeStartU, y: STATION_Y + 3.0 });
  keys.push({ u: 0.95, y: STATION_Y + 0.6 });
  keys.sort((a, b) => a.u - b.u);
  return { keys, apex, liftEndU, dropBottomU, brakeStartU };
}

// ------------------------------------------------------------
// Vertical loop.
//
// Spliced into the resampled centreline just after the first drop, where
// the train is fastest.
//
// The loop is built as a *displacement of the track that is already
// there*, not as a free-standing circle on the entry tangent: at phase θ
// it takes the real (curved) base point that many metres along and adds
// the loop's excursion in that point's own forward/up plane. Both the
// position and the tangent therefore match the untouched track exactly at
// entry and exit — anchoring to a straight-line tangent instead leaves a
// lateral gap wherever the base path curves, which shows up as a kink in
// the rails and a 45-degree snap in the car's roll.
// ------------------------------------------------------------

// Size a loop from the speed available at its entry.
//
// A vertical loop is a teardrop, not a circle: the radius must be large
// at the bottom (where the train is fast) and small at the top (where it
// is slow), so the rider's g-load stays roughly even instead of spiking
// on entry. With half-width a and half-height b the radius is a^2/b at
// the top and b^2/a at the bottom.
//
// Writing x = v_in^2 / (g*b) and aspect c = a/b, the loop pulls
// (x-4)/c^2 g over the top and c*x + 1 g through the bottom. c = 0.70
// with x near 5 lands about 2g at the top and 4.5g at the bottom — a
// firm but rideable loop that also stays gentle enough that the rails
// do not visibly kink at the sample spacing.
//
// The forward drift along the base path subtracts from the half-width at
// the top, so `a` is widened by exactly that much to keep the intended
// shape. Returns null when no size in the window works, in which case
// the circuit simply gets no loop.
function chooseLoop(vIn, maxHeight) {
  const u = (vIn * vIn) / G; // available height-equivalent, in metres
  const c = 0.70;
  for (const x of [5.6, 5.3, 5.0, 4.8, 4.65]) {
    const b = u / x;
    if (b < 5.5 || b > 26) continue;
    // A loop is only worth having if the circuit can still afford the
    // hills after it. Sizing purely from entry speed produces a loop that
    // reaches almost to the lift apex and starves everything downstream.
    if (2 * b > maxHeight) continue;
    const advance = b * 0.9;
    const drift = advance / (Math.PI * 2);
    const a = c * b + drift;
    const rTop = (c * b) * (c * b) / b;
    const rBottom = (b * b) / (c * b + drift);
    const vTop2 = vIn * vIn - 4 * G * b;
    if (vTop2 < 1.2 * G * rTop) continue; // would not hold the track over the top
    const gTop = vTop2 / (G * rTop);
    const gBottom = (vIn * vIn) / (G * rBottom) + 1;
    if (gTop > 3.4 || gBottom > 5.2) continue;
    // The rails are drawn from discrete samples: too tight a top reads as
    // a crease rather than a curve.
    if (rTop < RESAMPLE_DS * 3.0) continue;
    return { a, b, advance, radius: b, gTop, gBottom };
  }
  return null;
}

function spliceLoop(points, roles, startIdx, spec) {
  const n = points.length;
  const { a, b, advance } = spec;
  const removeCount = Math.max(4, Math.round(advance / RESAMPLE_DS));
  const worldUp = v3(0, 1, 0);

  const steps = Math.max(32, Math.round((2 * Math.PI * b * 1.15) / RESAMPLE_DS));
  const arc = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const along = (th / (Math.PI * 2)) * removeCount;
    const baseIdx = (startIdx + Math.floor(along)) % n;
    const frac = along - Math.floor(along);
    const base = vlerp(points[baseIdx], points[(baseIdx + 1) % n], frac);
    // The forward axis must be interpolated, not snapped to the nearest
    // base sample. A piecewise-constant tangent multiplied by the loop's
    // half-width puts a step in the geometry at every base index — a
    // dozen creases around the loop, which read as spurious curvature and
    // snap the car's roll.
    const t0 = vnorm(vsub(points[(baseIdx + 2) % n], points[(baseIdx - 2 + n) % n]));
    const t1 = vnorm(vsub(points[(baseIdx + 3) % n], points[(baseIdx - 1 + n) % n]));
    const tangent = vnorm(vlerp(t0, t1, frac));
    // The loop lives in the WORLD vertical plane, so its forward axis is
    // the horizontal projection of the base tangent. Using the raw 3D
    // tangent pours the base gradient into the loop's own forward term:
    // on track that is climbing, the loop stretches far taller than it
    // was sized for and its top pinches to a couple of metres' radius.
    let fwd = v3(tangent.x, 0, tangent.z);
    fwd = vlen(fwd) > 1e-6 ? vnorm(fwd) : tangent;
    arc.push(vadd(vadd(base, vmul(fwd, a * Math.sin(th))), vmul(worldUp, b * (1 - Math.cos(th)))));
  }

  // Replace [startIdx, startIdx + removeCount) with the loop arc. The
  // circuit is closed, so rotate the array to the entry first and stitch
  // the remainder back on.
  const rotated = points.slice(startIdx).concat(points.slice(0, startIdx));
  const rotatedRoles = roles.slice(startIdx).concat(roles.slice(0, startIdx));
  return {
    points: arc.concat(rotated.slice(removeCount)),
    roles: new Array(steps).fill("free").concat(rotatedRoles.slice(removeCount)),
  };
}

// ------------------------------------------------------------
// Frames: tangent, banked up vector, curvature.
//
// The up vector is parallel-transported along the track (a
// rotation-minimising frame), which makes a vertical loop roll the car
// through a full 360° for free. Transport around a closed circuit leaves
// a residual twist, so the mismatch is measured and unwound linearly
// over the whole circuit — that is what keeps the banking continuous
// across the start/finish line.
// ------------------------------------------------------------

function computeFrames(points, ds, speeds) {
  const n = points.length;
  const tangents = new Array(n);
  for (let i = 0; i < n; i++) {
    tangents[i] = vnorm(vsub(points[(i + 1) % n], points[(i - 1 + n) % n]));
  }

  // Curvature vector dT/ds.
  const curvature = new Array(n);
  for (let i = 0; i < n; i++) {
    const dT = vsub(tangents[(i + 1) % n], tangents[(i - 1 + n) % n]);
    curvature[i] = vmul(dT, 1 / (2 * ds));
  }

  // Parallel transport a starting normal around the circuit.
  const raw = new Array(n);
  let up = vnorm(vsub(v3(0, 1, 0), vmul(tangents[0], vdot(v3(0, 1, 0), tangents[0]))));
  if (vlen(up) < 1e-6) up = vnorm(vcross(tangents[0], v3(1, 0, 0)));
  raw[0] = up;
  for (let i = 1; i < n; i++) {
    const t0 = tangents[i - 1];
    const t1 = tangents[i];
    const axis = vcross(t0, t1);
    const sin = vlen(axis);
    let next = up;
    if (sin > 1e-9) {
      const angle = Math.atan2(sin, vdot(t0, t1));
      next = vrotate(up, vmul(axis, 1 / sin), angle);
    }
    // Re-orthogonalise against drift.
    next = vnorm(vsub(next, vmul(t1, vdot(next, t1))));
    raw[i] = next;
    up = next;
  }

  // Residual twist between the transported frame at the end and the start.
  const tEnd = tangents[n - 1];
  const startProjected = vnorm(vsub(raw[0], vmul(tEnd, vdot(raw[0], tEnd))));
  const side = vcross(tEnd, raw[n - 1]);
  let residual = Math.atan2(vdot(side, startProjected), vdot(raw[n - 1], startProjected));
  if (residual > Math.PI) residual -= Math.PI * 2;
  if (residual < -Math.PI) residual += Math.PI * 2;

  // Desired bank at each sample: enough roll to swing the felt force
  // into the car's floor.
  const corrected = new Array(n);
  const banks = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    // Unwind the holonomy so frame(n) meets frame(0).
    corrected[i] = vrotate(raw[i], t, (residual * i) / n);
    const lateral = vnorm(vcross(t, corrected[i]));
    const v = speeds[i];
    const lateralAccel = v * v * vdot(curvature[i], lateral);
    banks[i] = Math.max(-1.25, Math.min(1.25, Math.atan2(lateralAccel, G)));
  }

  // Rate-limit the roll.
  //
  // The desired bank is a pointwise answer to "how hard is this corner",
  // which says nothing about how fast the track may roll to get there.
  // Where a circuit reverses its turn the ideal bank flips from +70 to
  // -70 degrees, and taken literally that is a 140-degree roll inside
  // three metres of track — the car would snap over sideways. Real track
  // rolls at a bounded rate and spends real distance doing it, so clamp
  // the change per metre and sweep both ways until it settles.
  const maxStep = MAX_ROLL_RATE * ds;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const i = k % n;
      const prev = banks[(i - 1 + n) % n];
      const clamped = Math.max(prev - maxStep, Math.min(prev + maxStep, banks[i]));
      if (clamped !== banks[i]) { banks[i] = clamped; moved = true; }
    }
    for (let k = n - 1; k >= 0; k--) {
      const i = k % n;
      const next = banks[(i + 1) % n];
      const clamped = Math.max(next - maxStep, Math.min(next + maxStep, banks[i]));
      if (clamped !== banks[i]) { banks[i] = clamped; moved = true; }
    }
    if (!moved) break;
  }

  // Round off the corners the rate limiter leaves behind.
  for (let pass = 0; pass < 6; pass++) {
    const src = Float64Array.from(banks);
    for (let i = 0; i < n; i++) {
      banks[i] = (src[(i - 1 + n) % n] + 2 * src[i] + src[(i + 1) % n]) / 4;
    }
  }

  const ups = new Array(n);
  for (let i = 0; i < n; i++) {
    ups[i] = vnorm(vrotate(corrected[i], tangents[i], banks[i]));
  }

  return { tangents, ups, curvature, banks };
}

// ------------------------------------------------------------
// Design speed profile: a forward energy sweep used for banking and for
// the "will it make it round?" check. Same model the live sim uses.
// ------------------------------------------------------------

function designSpeeds(points, ds, roles) {
  const n = points.length;
  const speeds = new Float64Array(n);
  let v = CHAIN_SPEED;
  // Two passes: the first seeds the speed at the crest of the lift, the
  // second runs with that seed so the free-running section is consistent.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const mode = roles[i];
      if (mode === "station") v = STATION_SPEED;
      else if (mode === "lift") v = CHAIN_SPEED;
      else {
        const dy = points[(i + 1) % n].y - points[i].y;
        const sinPitch = Math.max(-1, Math.min(1, dy / ds));
        const cosPitch = Math.sqrt(Math.max(0, 1 - sinPitch * sinPitch));
        let vv = v * v - 2 * G * dy - 2 * ds * (ROLLING_FRICTION * G * cosPitch + DRAG_COEFF * v * v);
        if (mode === "brake") vv = Math.min(vv, Math.max(STATION_SPEED * STATION_SPEED, v * v - 2 * ds * 3.2));
        v = Math.sqrt(Math.max(0.25, vv));
      }
      speeds[i] = v;
    }
  }
  return speeds;
}

// Relax the height profile until no vertical transition exceeds the g
// budget.
//
// Keyframes alone cannot express "and the valley needs a radius": a drop
// arriving at 55 degrees has to flatten out somewhere, and Catmull-Rom
// puts a corner there. Pulling out of a 30 m/s drop at 4g needs about
// 23 m of radius, which is 20 samples of track — no local keyframe tweak
// provides that.
//
// So the constraint is enforced directly: find every sample whose
// vertical curvature costs more than the budget and diffuse the profile
// there, repeating until the whole circuit is inside it. Smoothing
// strictly reduces local curvature, so this converges; it also shaves
// the hills a little, which the energy check downstream re-verifies.
function relaxProfile(points, ds, roles, budgetG) {
  const n = points.length;
  const hot = new Uint8Array(n);
  let worst = Infinity;
  for (let pass = 0; pass < 400; pass += 1) {
    const speeds = designSpeeds(points, ds, roles);
    hot.fill(0);
    worst = 0;
    for (let i = 0; i < n; i += 1) {
      const d2y = points[(i + 1) % n].y - 2 * points[i].y + points[(i - 1 + n) % n].y;
      const verticalG = (Math.abs(d2y) / (ds * ds)) * speeds[i] * speeds[i] / G;
      if (verticalG > worst) worst = verticalG;
      if (verticalG > budgetG) {
        for (let k = -2; k <= 2; k += 1) hot[(i + k + n) % n] = 1;
      }
    }
    if (worst <= budgetG) return worst;
    const y = points.map((p) => p.y);
    for (let i = 0; i < n; i += 1) {
      if (!hot[i]) continue;
      points[i].y = (
        y[(i - 2 + n) % n] + 4 * y[(i - 1 + n) % n] + 6 * y[i]
        + 4 * y[(i + 1) % n] + y[(i + 2) % n]
      ) / 16;
    }
  }
  return worst;
}

// ------------------------------------------------------------
// buildTrack — the whole pipeline, with an energy retry.
// ------------------------------------------------------------

export function buildTrack(seed) {
  const rng = mulberry32(seed);
  const name = trackName(rng);
  const plan = planCurve(rng, 720);
  const planLength = arcLengths(plan).total;

  // Everything after the plan curve is regenerated from a *frozen* draw of
  // random numbers, so shrinking the hills on retry does not reshuffle the
  // whole coaster into a different one.
  const profileSeed = Math.floor(rng() * 0xffffffff);

  // Each retry lowers the airtime hills, and then the loop, until the
  // train demonstrably completes the circuit. The lift apex is held
  // fixed throughout: it is the energy budget, not a hill.
  let result = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = 1 - attempt * 0.09;
    const loopAllowance = attempt < 4 ? 1 : attempt < 6 ? 0.75 : 0;
    const candidate = assemble(plan, planLength, profileSeed, scale, seed, name, loopAllowance);
    const check = verifyCircuit(candidate);
    result = candidate;
    result.minFreeSpeed = check.minSpeed;
    result.maxG = check.maxG;
    result.attempts = attempt + 1;
    if (check.completes) return result;
  }
  return result; // last, flattest attempt — still returned rather than throwing
}

function assemble(plan, planLength, profileSeed, scale, seed, name, loopAllowance) {
  const rng = mulberry32(profileSeed);
  const profile = heightKeyframes(rng, planLength, scale);

  // Apply the height profile to the plan curve.
  let shaped = plan.map((p, i) => v3(p.x, sampleProfile(profile.keys, i / plan.length), p.z));

  // Catmull-Rom can undershoot below its keyframes on a steep run-out. A
  // dip below the ground plane would bury the rails, so lift the whole
  // profile by the deficit rather than clipping it, which would flatten
  // the valley into a crease.
  const minY = shaped.reduce((m, p) => Math.min(m, p.y), Infinity);
  if (minY < MIN_TRACK_CLEARANCE) {
    const lift = MIN_TRACK_CLEARANCE - minY;
    shaped = shaped.map((p) => v3(p.x, p.y + lift, p.z));
  }

  // Region roles are assigned once, here, on the plan parameterisation —
  // and then carried through every later remap.
  const roles0 = plan.map((_, i) => {
    const u = i / plan.length;
    if (u >= profile.brakeStartU) return "brake";
    if (u < 0.06) return "station";
    if (u < profile.liftEndU) return "lift";
    return "free";
  });

  // The plan curve is sampled uniformly in angle, not arc length, so the
  // profile's crest does not land exactly where the fraction says it
  // should. Releasing the train while it is still climbing strands it
  // just short of the top. Hold the chain until the track genuinely
  // starts to fall, reading the boundary off the geometry rather than
  // trusting the parameterisation.
  const m = roles0.length;
  let cursor = roles0.findIndex((r) => r === "free");
  if (cursor > 0) {
    let guard = 0;
    while (guard++ < m * 0.25 && shaped[(cursor + 1) % m].y >= shaped[cursor % m].y - 1e-6) {
      roles0[cursor % m] = "lift";
      cursor += 1;
    }
  }

  let re = resampleClosed(shaped, RESAMPLE_DS, roles0);
  let points = re.points;
  let roles = re.roles;
  let ds = re.ds;

  // Give every vertical transition a rideable radius before anything is
  // measured off the profile.
  //
  // Relaxation moves the heights of already-resampled points, which
  // shortens the 3D distance between them wherever the profile was
  // steep — so the samples stop being evenly spaced. That matters well
  // beyond tidiness: curvature is estimated by dividing by the NOMINAL
  // spacing, so unevenly spaced samples overstate curvature (by 3x in
  // the worst stretches seen here) and every g figure computed from it
  // is wrong. Re-resample after relaxing, and relax once more on the
  // corrected spacing.
  let profileG = Infinity;
  for (let round = 0; round < 2; round += 1) {
    profileG = relaxProfile(points, ds, roles, PROFILE_G_BUDGET);
    const even = resampleClosed(points, RESAMPLE_DS, roles);
    points = even.points;
    roles = even.roles;
    ds = even.ds;
  }

  // Place the loop.
  //
  // A loop's size is dictated by the speed at its entry, so a single
  // fixed entry point makes it a lottery: enter too fast and the only
  // valid loop towers over the lift, too slow and its top pinches
  // tighter than the rails can be drawn. Both just mean "not here".
  //
  // So every free-running sample is a candidate, ranked by how flat and
  // straight the track is there — a loop's own curvature adds to
  // whatever the base path is already doing, and entering one mid-turn
  // stacks the two. The best-placed candidate that yields a valid loop
  // wins. Somewhere on the circuit the train is usually going exactly
  // the right speed for one.
  let preSpeeds = designSpeeds(points, ds, roles);
  const nPts = points.length;
  const apexShaped = points.reduce((mx, p) => Math.max(mx, p.y), 0);

  const candidates = [];
  for (let i = 0; i < nPts; i += 1) {
    const u = i / nPts;
    if (roles[i] !== "free") continue;
    if (u < profile.dropBottomU - 0.02 || u > 0.78) continue;
    const grade = Math.abs(points[(i + 3) % nPts].y - points[(i - 3 + nPts) % nPts].y);
    const a = points[(i - 3 + nPts) % nPts];
    const b = points[i];
    const c = points[(i + 3) % nPts];
    const turn = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 100;
    candidates.push({ i, score: grade + turn });
  }
  candidates.sort((p, q) => p.score - q.score || p.i - q.i);

  let spec = null;
  let loopIdx = -1;
  if (loopAllowance > 0) {
    for (const candidate of candidates.slice(0, 60)) {
      // Keep the loop no taller than the lift that feeds it. This is a
      // LOOKS-right bound, not a physics one: whether the circuit can
      // afford the loop is settled by simulating the finished track and
      // retrying, which is honest about the energy.
      const headroom = (apexShaped - points[candidate.i].y) * loopAllowance;
      const found = chooseLoop(preSpeeds[candidate.i], headroom);
      if (found) {
        spec = found;
        loopIdx = candidate.i;
        break;
      }
    }
  }
  let loop = null;
  if (spec) {
    const spliced = spliceLoop(points, roles, loopIdx, spec);
    loop = spec;
    // Splicing changed the arc length and moved the origin to the loop
    // entry; re-resample, then re-index from the station.
    re = resampleClosed(spliced.points, RESAMPLE_DS, spliced.roles);
    const rotated = rotateToStation(re.points, re.roles);
    points = rotated.points;
    roles = rotated.roles;
    ds = re.ds;
    preSpeeds = designSpeeds(points, ds, roles);
  }

  const { tangents, ups, curvature, banks } = computeFrames(points, ds, preSpeeds);
  const { total: length } = arcLengths(points);
  let apex = -Infinity;
  let lowest = Infinity;
  for (const p of points) {
    if (p.y > apex) apex = p.y;
    if (p.y < lowest) lowest = p.y;
  }

  return {
    seed, name, points, tangents, ups, curvature, banks, roles,
    speeds: preSpeeds, ds, length, apex, lowest, loop, profileG,
    stationY: STATION_Y,
  };
}

// After a splice the array starts at the loop entry. Rotate it so index 0
// is the first sample of the station, which is where a lap should begin.
function rotateToStation(points, roles) {
  const n = points.length;
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (roles[i] === "station" && roles[(i - 1 + n) % n] !== "station") {
      start = i;
      break;
    }
  }
  return {
    points: points.slice(start).concat(points.slice(0, start)),
    roles: roles.slice(start).concat(roles.slice(0, start)),
  };
}

// Run the design sweep and report whether the train keeps moving through
// every free-running metre of the circuit.
export function verifyCircuit(track) {
  const n = track.points.length;
  let minSpeed = Infinity;
  let maxG = 0;
  for (let i = 0; i < n; i++) {
    // Check the g-load on the FINISHED geometry, not just on the shapes
    // that were designed. The loop is sized analytically before it is
    // spliced, so only a measurement of the assembled track catches a
    // splice that came out tighter than its own specification.
    const g = vlen(track.curvature[i]) * track.speeds[i] * track.speeds[i] / G;
    if (g > maxG) maxG = g;
    if (track.roles[i] !== "free") continue;
    if (track.speeds[i] < minSpeed) minSpeed = track.speeds[i];
  }
  if (!Number.isFinite(minSpeed)) minSpeed = CHAIN_SPEED;
  return {
    completes: minSpeed >= MIN_FREE_SPEED && maxG <= MAX_RIDEABLE_G,
    minSpeed,
    maxG,
  };
}

// ------------------------------------------------------------
// CoasterSim — the live ride.
//
// Integrates arc position and speed with a fixed sub-step, reading the
// gradient straight off the centreline. Reports the felt acceleration in
// the car's own frame, which is what a rider actually experiences: the
// sum of gravity and the acceleration needed to follow the track.
// ------------------------------------------------------------

export class CoasterSim {
  constructor(track) {
    this.track = track;
    this.reset();
  }

  reset() {
    this.s = 0;
    this.v = STATION_SPEED;
    this.gForce = 1;
    this.laps = 0;
  }

  get mode() {
    const n = this.track.points.length;
    let i = Math.floor(this.s / this.track.ds) % n;
    if (i < 0) i += n;
    return this.track.roles[i];
  }

  // Interpolate the centreline at arc position s.
  sample(s) {
    const t = this.track;
    const n = t.points.length;
    const total = n * t.ds;
    let ss = s % total;
    if (ss < 0) ss += total;
    const f = ss / t.ds;
    const i = Math.floor(f) % n;
    const frac = f - Math.floor(f);
    const j = (i + 1) % n;
    return {
      index: i,
      pos: vlerp(t.points[i], t.points[j], frac),
      fwd: vnorm(vlerp(t.tangents[i], t.tangents[j], frac)),
      up: vnorm(vlerp(t.ups[i], t.ups[j], frac)),
      curv: vlerp(t.curvature[i], t.curvature[j], frac),
    };
  }

  step(dt) {
    // Fixed sub-steps keep the physics frame-rate independent; a browser
    // tab that drops to 20fps must not fling the train off the lift.
    const clamped = Math.min(0.1, Math.max(0, dt));
    const steps = Math.max(1, Math.ceil(clamped / 0.004));
    const h = clamped / steps;
    for (let k = 0; k < steps; k++) this.substep(h);
    return this.state();
  }

  substep(h) {
    const t = this.track;
    const total = t.points.length * t.ds;
    const here = this.sample(this.s);
    const mode = this.mode;
    let accel = 0;

    if (mode === "station") {
      this.v += (STATION_SPEED - this.v) * Math.min(1, h * 3);
    } else if (mode === "lift") {
      this.v += (CHAIN_SPEED - this.v) * Math.min(1, h * 2);
    } else {
      const sinPitch = Math.max(-1, Math.min(1, here.fwd.y));
      const cosPitch = Math.sqrt(Math.max(0, 1 - sinPitch * sinPitch));
      accel = -G * sinPitch
        - ROLLING_FRICTION * G * cosPitch * Math.sign(this.v || 1)
        - DRAG_COEFF * this.v * Math.abs(this.v);
      if (mode === "brake") accel -= this.v > STATION_SPEED ? 3.2 : 0;
      this.v += accel * h;
      // A gravity coaster never rolls backwards on this circuit; the
      // energy clamp in buildTrack guarantees it, and this floor keeps a
      // pathological seed crawling home instead of oscillating in a dip.
      if (this.v < 0.8) this.v = 0.8;
    }

    const before = this.s;
    this.s += this.v * h;
    if (this.s >= total) {
      this.s -= total;
      this.laps += 1;
    }
    if (before > this.s && this.s >= 0 && mode !== "station") this.laps += 0;

    // Felt acceleration: track-following acceleration minus gravity,
    // resolved onto the car's own up axis.
    const a = vadd(vmul(here.fwd, accel), vmul(here.curv, this.v * this.v));
    const felt = vsub(a, v3(0, -G, 0));
    const g = vdot(felt, here.up) / G;
    // Light smoothing: the readout should be legible, not a strobe.
    this.gForce += (g - this.gForce) * Math.min(1, h * 8);
  }

  state() {
    const here = this.sample(this.s);
    return {
      s: this.s,
      v: this.v,
      speedKmh: this.v * 3.6,
      gForce: this.gForce,
      height: here.pos.y - this.track.stationY,
      pos: here.pos,
      fwd: here.fwd,
      up: here.up,
      index: here.index,
      mode: this.mode,
      progress: this.s / (this.track.points.length * this.track.ds),
    };
  }
}

// ------------------------------------------------------------
// Support columns: where the track needs holding up, and how tall.
// Returned as plain data so the renderer can instance them.
// ------------------------------------------------------------

export function supportColumns(track, spacing = 9) {
  const step = Math.max(1, Math.round(spacing / track.ds));
  const out = [];
  for (let i = 0; i < track.points.length; i += step) {
    const p = track.points[i];
    const height = p.y - 0.2;
    if (height < 2.5) continue;
    // Skip columns inside an inverted section: a loop is held by its own
    // structure, not by a post through the middle of the rider.
    if (track.ups[i].y < 0.35) continue;
    out.push({ x: p.x, z: p.z, top: p.y, height });
  }
  return out;
}
