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
//
// "The train" means the whole train. Both the design sweep and the live
// sim take the gradient averaged over the train's 13.8 m, which is
// exactly the rise of its centre of mass — so the circuit is verified
// against the object that is actually drawn on it, rather than against a
// point mass riding on the front axle.
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
// A magnetic launch pushes at a little over 1g — brisk, and about what a
// linear synchronous motor actually manages.
export const LAUNCH_ACCEL = 12.0; // m/s^2
const MAX_LAUNCH_APEX = 46; // m, so the launch speed stays this side of silly
const MIN_FREE_SPEED = 3.0; // m/s, below this the train has stalled
const MIN_TRACK_CLEARANCE = 1.2; // m, lowest the rails may sit above the ground
const PROFILE_G_BUDGET = 4.0; // max vertical g the height profile may impose

// The ride envelope, and why it is not symmetric.
//
// These used to be one number applied to |curvature|*v^2, which is a
// magnitude: it cannot tell being pressed into the seat at 6g from
// hanging off the restraints at -6g, and those are not the same
// experience by any measure a rider would recognise. Positive g a body
// tolerates sitting down; negative g is the one that empties the
// restraints, and real designers hold it to about a third of the
// positive limit. So the gate is asymmetric and measures FELT g —
// curvature plus gravity, resolved onto the car's floor — which is the
// same quantity the readout shows and the same one CoasterSim.feltAt
// computes.
const MAX_RIDEABLE_G = 6.2;  // max positive g anywhere on the assembled circuit
const MIN_RIDEABLE_G = -3.4; // and the airtime floor
const MIN_PLAN_RADIUS = 26; // m, tightest horizontal turn the plan curve may draw

// ------------------------------------------------------------
// The train, which is not a point.
//
// These live here rather than in the page because the PHYSICS depends on
// them: a train is 13.8 m of steel, and what drives it is the height of
// its centre of mass, not the gradient under its front axle. The
// renderer imports the same three numbers so there is one answer to how
// long the train is.
// ------------------------------------------------------------
export const CARS = 4;
export const CAR_SPACING = 3.45; // m between car centres
export const TRAIN_LENGTH = CARS * CAR_SPACING;

// The train's footprint in centreline samples, rounded to the grid the
// track is stored on. Both the design sweep and the live sim measure the
// gradient over exactly this span, so the sweep's "it completes" and the
// sim's "it completed" are answers to the same question.
export const trainSpan = (ds) => Math.max(1, Math.round(TRAIN_LENGTH / ds));

// ------------------------------------------------------------
// The dials.
//
// These are the ranges the generator will honour. They are wide enough
// to be worth moving and narrow enough that every combination is still
// a rideable coaster: the retry loop can flatten hills, but it cannot
// rescue a 2.4km circuit hauled over a 25m lift, so the ends are chosen
// so it never has to.
//
// LENGTH and HEIGHT are what they say. SPEED is a target for the top
// speed, and it is the one that needs explaining: on a gravity coaster
// the speed at the bottom of the first drop IS the height of the drop,
// so a speed dial that pretended otherwise would be a fake knob. It is
// honest instead — whatever the drop does not supply is made up by a
// magnetic launch out of the station, which is exactly how a real
// low-and-fast coaster does it. Ask for 130km/h off a 30m lift and you
// get a launched circuit; ask for 80 off a 70m lift and you get a chain
// lift and no launch at all.
// ------------------------------------------------------------
export const DIALS = {
  length: { min: 420, max: 2400, default: null },   // metres of track
  height: { min: 22, max: 78, default: null },      // metres to the lift apex
  speed: { min: 60, max: 145, default: null },      // km/h at the fastest point
};

export const clampDial = (value, dial) =>
  value == null ? null : Math.min(dial.max, Math.max(dial.min, value));
const MAX_ROLL_RATE = 0.055; // rad per metre of track (~3 degrees/m)

// Clearance between stretches of track that are far apart along the
// circuit but close together in space. Two rails, a spine and a train
// occupy roughly 3 m of envelope, so anything under this is either a
// collision or close enough to look like one.
export const MIN_SELF_CLEARANCE = 3.4; // m
const CLEARANCE_IGNORE_ALONG = 16; // m of track either side that cannot collide with itself
const LOOP_SPLAY = 2.6; // m the loop's legs are pushed apart sideways
const LOOP_RAMP = 34; // m over which the approach eases into that offset

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
// Plan view: the shadow the circuit casts on the ground.
//
// This began as r(t) = R * (1 + Σ a_k sin(k t + φ_k)) — a radius drawn
// as a function of angle about the origin. That is a *star-shaped* curve
// by construction, and star-shaped is a much stronger promise than the
// one the circuit needs: a single-valued r(θ) can never fold back over
// itself, so it cannot draw a figure-eight, an out-and-back, a hairpin,
// or any of the layouts where the track passes over its own shadow.
// Every circuit came out an amorphous rounded blob, and the minimap said
// so on every seed.
//
// Crossing in PLAN is not a collision — the two passes are at different
// heights — and the thing that decides whether it is safe already
// exists: selfClearance() measures the 3D gap between stretches that are
// far apart along the circuit, and assemble() gates on it. So the plan
// is now drawn from one of four archetypes, three of which may cross
// their own shadow, and the existing clearance gate settles whether a
// particular seed's crossing is buildable.
// ------------------------------------------------------------

export const LAYOUTS = ["classic", "figure", "outback"];

// Which archetype a seed draws — from a stream of its OWN.
//
// Deliberately not drawn from the main rng. Every draw off that stream
// shifts everything sequenced after it, so putting the layout choice
// there would reshuffle all 120 catalogue seeds into different coasters
// (the 2026-08-04 session lost 29 of 40 that way, to a draw that looked
// just as innocent). Hashing the seed into a separate stream leaves the
// main one untouched, so a seed that draws "classic" still produces
// exactly the plan curve it always did, sample for sample.
export function layoutFor(seed) {
  const pick = mulberry32((seed ^ 0x5bf03635) >>> 0)();
  return pick < 0.50 ? "classic" : pick < 0.78 ? "figure" : "outback";
}

function planCurve(rng, samples, wantLength = null, layout = "classic") {
  const R = 76 + rng() * 40;
  const squash = 0.72 + rng() * 0.36;
  const spin = rng() * Math.PI * 2;
  const harmonics = [];
  for (let k = 2; k <= 5; k++) {
    harmonics.push({ k, amp: (0.04 + rng() * 0.14) * (k <= 3 ? 1 : 0.45), phase: rng() * Math.PI * 2 });
  }

  // The two non-star archetypes, each a closed parametric curve in
  // (x, z) in units of R. They are drawn as x(t), z(t) rather than as
  // r(θ) — which is the whole point: two different t may land on the
  // same spot, and that is a layout rather than a fault.
  //
  //   figure   a Lissajous eight: out, across its own shadow, back the
  //            other way round. Exactly one crossing, in the middle.
  //   outback  the oldest layout there is — a straight out, a hairpin, a
  //            straight back beside it. It does not cross, but it is the
  //            only archetype with real STRAIGHTS in it, which a sum of
  //            harmonics on a circle can never produce.
  //
  // The eight's amplitude and the out-and-back's waist are both drawn
  // from ranges chosen by measurement, not taste: outside them the inner
  // geometry pinches below the turn floor by more than scaling can
  // afford to fix (see the radius floor below).
  // Drawn only by the archetype that uses it, and that is load-bearing.
  //
  // Every call to rng() advances the one stream the whole circuit is
  // built from, so drawing these unconditionally — which is how they
  // were written first — shifts `profileSeed` downstream and reshuffles
  // the height profile of every CLASSIC seed as well. It shows up as a
  // taller lift on a shrunk circuit rather than as anything obviously
  // wrong, which is exactly why it is worth spelling out: the promise
  // that a classic seed is untouched is only kept if no draw is made on
  // its behalf.
  const eight = layout === "figure" ? 0.42 + rng() * 0.24 : 0;
  const waist = layout === "outback" ? 0.66 + rng() * 0.24 : 0;
  const shape = (t) => {
    if (layout === "figure") return { x: Math.cos(t), z: eight * Math.sin(2 * t) };
    // A stadium: two parallel legs joined by hairpins. The sign of sin
    // picks the leg and the fractional power flattens each one into a
    // straight, leaving the rounding to the ends where it belongs.
    const s = Math.sin(t);
    return { x: Math.cos(t), z: waist * Math.sign(s || 1) * Math.pow(Math.abs(s), 0.55) };
  };

  const draw = (damp) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      if (layout === "classic") {
        let r = 1;
        for (const h of harmonics) r += h.amp * damp * Math.sin(h.k * t + h.phase);
        r *= R;
        const a = t + spin;
        pts.push(v3(Math.cos(a) * r, STATION_Y, Math.sin(a) * r * squash));
        continue;
      }
      // Damping an archetype cannot mean damping harmonics it does not
      // have, so it blends toward the circle instead. Same contract: at
      // damp 1 the shape is itself, and as damp falls every turn opens
      // out, which is what the radius floor below needs to be able to ask
      // for. At damp 0 it is a plain ellipse, which always clears.
      const s = shape(t);
      const x = (Math.cos(t) + (s.x - Math.cos(t)) * damp) * R;
      const z = (Math.sin(t) + (s.z - Math.sin(t)) * damp) * R * squash;
      const a = spin;
      pts.push(v3(
        x * Math.cos(a) - z * Math.sin(a),
        STATION_Y,
        x * Math.sin(a) + z * Math.cos(a),
      ));
    }
    return pts;
  };

  // When a length has been asked for, the floor has to be cleared AFTER
  // the scaling that hits it, not before. Scaling shrinks every turn by
  // the same factor, so a short circuit needs a rounder plan than the
  // seed drew — damping is what buys it. Without this a request for
  // 500m quietly returns 660m, because the plan the seed happened to
  // draw could not be shrunk any further without cornering.
  const fits = (pts) => {
    const tightest = minPlanRadius(pts);
    if (wantLength == null) return tightest >= MIN_PLAN_RADIUS;
    const factor = wantLength / arcLengths(pts).total;
    return tightest * Math.min(1, factor) >= MIN_PLAN_RADIUS;
  };
  let pts = draw(1);

  // An archetype clears the floor by getting BIGGER, not rounder.
  //
  // Every layout that crosses its own shadow has a small inner lobe —
  // that is what crossing costs, geometrically — and rounding the lobe
  // out is precisely the thing that removes the crossing. Measured, the
  // eight's tightest turn is about 0.22 R, so damping it to clear 26 m
  // returns a plain ellipse and the archetype was pointless. Scaling
  // keeps the shape exactly and is linear in both radius and arc length,
  // so a single pass lands on the floor: the eights come out 1.16 to
  // 1.5 times the drawn size, which is 600-970 m of track — squarely in
  // the range the generator already draws.
  //
  // Only when it can actually help. Scaling up and then being scaled
  // back down by the length dial is a no-op for the radius (both terms
  // carry the same factor), so a circuit with a length asked for takes
  // the damping path below and, if its lobe will not fit in the length
  // requested, honestly comes out rounder.
  if (layout !== "classic") {
    const tightest = minPlanRadius(pts);
    // With a margin, because landing exactly ON the floor is a coin toss
    // against the `>=` in fits() once floating point has had its say —
    // and losing that toss drops the whole archetype into the damping
    // path, which blends it back into the ellipse it was drawn to avoid.
    const grow = tightest > 0 ? (MIN_PLAN_RADIUS * 1.04) / tightest : Infinity;
    const grown = arcLengths(pts).total * grow;
    if (grow > 1 && grow <= 2.0 && (wantLength == null || wantLength >= grown)) {
      pts = pts.map((p) => v3(p.x * grow, p.y, p.z * grow));
    }
  }

  // Harmonics that happen to line up can pinch the plan view into a turn
  // far tighter than anything is rideable at speed — and no amount of
  // profile relaxation fixes a horizontal corner. Damp the harmonics
  // until the tightest turn in plan clears the floor, so the circuit is
  // drivable by construction rather than by luck. For an archetype,
  // damping blends it toward the circle; it is the fallback for a draw
  // the scaling above could not rescue.
  for (let attempt = 0; attempt < 14 && !fits(pts); attempt += 1) {
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

// ------------------------------------------------------------
// Self-collision.
//
// A vertical loop is the one element that deliberately brings the track
// back over itself, so it is also the one element that can put two
// stretches of steel through each other. Nothing in the profile or the
// frames would notice: both legs are perfectly valid track, they just
// happen to occupy the same cubic metre.
//
// So measure it. For every pair of samples that are far apart ALONG the
// circuit but close together in SPACE, report the smallest gap. Points
// within CLEARANCE_IGNORE_ALONG metres of each other along the track are
// skipped — those are neighbours, and of course they are close.
//
// The samples are ~1.2 m apart, so a point-to-point measure understates
// a segment-to-segment gap by at most half that; the threshold it feeds
// carries enough margin to absorb it.
// ------------------------------------------------------------

export function selfClearance(points, ds, ignoreAlong = CLEARANCE_IGNORE_ALONG) {
  const n = points.length;
  const skip = Math.max(2, Math.ceil(ignoreAlong / Math.max(1e-6, ds)));
  if (n < skip * 2 + 4) return { distance: Infinity, i: -1, j: -1 };

  // Uniform spatial hash: only pairs inside the same or a neighbouring
  // cell can possibly be the closest, which keeps this linear in n
  // rather than quadratic (it runs once per loop candidate).
  const cell = Math.max(4, ignoreAlong * 0.5);
  const grid = new Map();
  const keyOf = (x, y, z) => `${x}|${y}|${z}`;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const key = keyOf(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }

  let best = Infinity;
  let bi = -1;
  let bj = -1;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(keyOf(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const gap = j - i;
            // The circuit is closed: separation along it is the shorter
            // way round, or the pair either side of the start line would
            // look like a collision.
            if (Math.min(gap, n - gap) <= skip) continue;
            const d = vlen(vsub(p, points[j]));
            if (d < best) { best = d; bi = i; bj = j; }
          }
        }
      }
    }
  }
  return { distance: best, i: bi, j: bj };
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

// The layout: station → a way of getting the energy in → first drop → a
// decreasing run of airtime hills → brake run → station. `scale` shrinks
// every hill when buildTrack discovers the train cannot make it round.
//
// There are two ways of getting the energy in, and a circuit picks one
// from its seed:
//
//   "chain"   a chain lift dragged up at 5 m/s, sometimes with a SECOND
//             lift halfway round that buys the circuit a second act
//   "launch"  a magnetic launch that throws the train out of the station
//             at the speed it needs to crest a top hat, with no lift at all
//
// Both are described the same way afterwards: a list of `boosts`, spans of
// the circuit where something other than gravity is driving the train.
// Everything downstream — roles, the design sweep, the live sim — reads
// that list rather than knowing about lifts specifically.
function heightKeyframes(rng, length, scale, style, wants = {}, relax = 0, extraLifts = 0) {
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
  const launched = style === "launch";
  // The height dial, when set, IS the apex: it is the one number the
  // rider asked for, so it is not negotiated away by the ceilings that
  // exist to stop a random draw producing a vertical lift on a short
  // circuit. It is still bounded by the circuit's own length, because a
  // 70m lift on a 420m loop is a helter-skelter.
  const drawnApex = Math.min(
    (launched ? 32 : 38) + rng() * 20,
    length * 0.12,
    launched ? MAX_LAUNCH_APEX : 62,
  );
  const apex = wants.height == null ? drawnApex
    : Math.max(STATION_Y + 8, Math.min(
      wants.height,
      length * 0.16,
      launched ? MAX_LAUNCH_APEX : Infinity,
    ));
  const brakeStartU = 0.88;

  // The speed ceiling, expressed as a height.
  //
  // Trimming the first drop alone does not cap anything: the train tops
  // out wherever the circuit gets LOWEST, and the airtime valleys later
  // on go lower than the drop does. So the ceiling is a floor — no part
  // of the free-running circuit may sit more than v^2/2g below the
  // summit that feeds it. The brake run is exempt, because past that
  // point the speed is set by the brakes rather than by the geometry.
  // The speed ceiling, relaxed a notch at a time by the retry ladder.
  //
  // A ceiling is a FLOOR under the track, and on a long circuit with a
  // low lift it is the binding constraint on the whole design: ask for
  // 2.4 km, a 22 m lift and 60 km/h and floorY lands at 7.8 m, which
  // pins the entire profile into a six-metre band. There is no height
  // left to spend against 27 m of rolling loss, and nothing the ladder
  // could do about it — flattening hills does not put energy back, and
  // an extra lift is another chain section where the train crawls.
  //
  // So the ceiling gives. This is the behaviour the dials already
  // promise: where two of them genuinely conflict the generator builds
  // what it can and the readout shows what was BUILT, not what was
  // asked for. A circuit that closes at attempt one never relaxes
  // anything, so every seed that was already buildable is untouched.
  const spend = wants.speed ? ((wants.speed * wants.speed) / (2 * G)) * (1 + relax) : Infinity;
  // With no speed asked for there is no ceiling, and the floor is
  // simply platform level — which is what it has always been, so an
  // undialled circuit comes out bit-for-bit as it did before.
  const floorY = Number.isFinite(spend) ? apex - spend : STATION_Y;

  const keys = [
    { u: 0.00, y: STATION_Y },
    { u: 0.05, y: STATION_Y },
  ];

  // How far either side of a summit the shoulder keyframes sit.
  //
  // These used to be a flat 0.04 of the circuit, which is fine while
  // every circuit is about the same size. Once length is a dial it is
  // not: on a 2.4km circuit the drop occupies 0.048 of u and a shoulder
  // at a fixed 0.04 lands 19 metres before the bottom of it — so the
  // spline drops 71 metres in 19, and the pull-out is a 9m radius at
  // 131km/h. Fourteen g. The shoulder has to be a fraction of the
  // feature it is shouldering. The 0.5 is chosen so that every circuit
  // the generator used to draw still gets exactly 0.04.
  const shoulder = (extent, cap) => Math.min(cap, extent * 0.5);

  // Whether any dial has been touched.
  //
  // The retry stretch below is gated on this, and deliberately so. The
  // faults it cures — a top hat entered at launch speed, a first drop
  // off a lift taller than the generator would ever draw — only exist
  // because the dials can ask for combinations the generator never drew
  // for itself. Applying the stretch unconditionally reshaped 29 of 40
  // catalogue seeds, one of them by 12% of its length, and seeds are the
  // thing people send each other. So an undialled circuit is left
  // exactly as it always was.
  const dialled = wants.length != null || wants.height != null || wants.speed != null;
  const stretch = dialled ? 1 / Math.max(0.42, scale) : 1;
  const boosts = [];
  let dropBottomU;
  let launchSpeed = 0;

  if (launched) {
    // The launch track is level: all of the energy arrives as speed, and
    // the top hat immediately turns it back into height.
    const launchU = Math.min(0.20, Math.max(0.08, 130 / length));
    const launchEndU = 0.06 + launchU;
    // The top hat is the one shape the retry loop could not previously
    // reach. Hills come down and the loop goes away, but a hat entered
    // at 140km/h stayed exactly as tight as it was drawn, so a circuit
    // whose only problem was the pull-in off the launch track failed all
    // eight attempts with the same 6.3g. Stretching it is the same
    // remedy applied to the same kind of fault: at scale 1 the geometry
    // is untouched, and by the last attempt the hat is nearly three
    // times longer and correspondingly gentler.
    const hatU = Math.min(0.24, Math.min(0.16, (apex * 1.25) / length) * stretch);
    const climbU = hatU;
    const crestU = launchEndU + climbU;
    dropBottomU = crestU + hatU;
    boosts.push({ startU: 0.06, endU: launchEndU, kind: "launch" });
    keys.push({ u: 0.06, y: STATION_Y });
    keys.push({ u: launchEndU, y: STATION_Y + 0.6 });
    const hatShoulder = shoulder(climbU, 0.03);
    keys.push({ u: crestU - hatShoulder, y: apex - 5.0 });
    keys.push({ u: crestU, y: apex });
    keys.push({ u: crestU + hatShoulder, y: apex - 5.0 });
    keys.push({ u: dropBottomU, y: STATION_Y + 1.5 });
    // Enough to crest the hat and still be moving over it, with a margin
    // for what friction and drag take on the way up — or, if a top speed
    // was asked for, enough to reach it. The launch is where the speed
    // dial actually lives: the train is fastest just after it lets go.
    launchSpeed = Math.sqrt(2 * G * (apex - STATION_Y) * 1.22 + 60);
    if (wants.speed) launchSpeed = Math.max(launchSpeed, wants.speed);
  } else {
    const liftU = Math.min(0.30, (apex * 2.0) / length); // ~27 degrees of chain
    // Stretched on retry for the same reason the hat is: on a tall lift
    // the first drop is where the g goes, and it was the one feature
    // eight attempts could not soften.
    const dropU = Math.min(0.26, Math.min(0.20, (apex * 1.4) / length) * stretch);
    const liftEndU = 0.10 + liftU;
    dropBottomU = liftEndU + dropU;
    boosts.push({ startU: 0.06, endU: liftEndU, kind: "lift" });
    // The crest keyframes are symmetric about the apex. An asymmetric
    // trio (apex-2.5, apex, apex-3.0 at unequal spacing) makes Catmull-Rom
    // overshoot into an S: the profile dips and climbs again just past the
    // top, giving the circuit a second, unintended summit.
    keys.push({ u: 0.10, y: STATION_Y + 1.0 });
    keys.push({ u: liftEndU - shoulder(liftU, 0.04), y: apex - 6.0 });
    keys.push({ u: liftEndU, y: apex });
    keys.push({ u: liftEndU + shoulder(dropU, 0.04), y: apex - 6.0 });
    // Where the first drop bottoms out. Normally the bottom of the
    // world, because on a gravity coaster the whole point of the drop is
    // to spend all of it. But if a top speed was asked for and the lift
    // would blow straight past it, the drop is TRIMMED — it levels out
    // higher up, so less of the apex is converted. That is a real thing
    // a designer does, and it is the only honest way to have a tall lift
    // and a modest top speed at the same time.
    keys.push({ u: dropBottomU, y: Math.max(STATION_Y + 1.5, floorY) });
  }

  // Hills. Each peak is capped by the height still available after
  // friction and drag have eaten into whichever summit feeds it, with a
  // margin so the train crests it with speed.
  const addHills = (fromU, toU, count, ceiling) => {
    const spanU = toU - fromU;
    if (spanU <= 0.03 || count < 1) return;
    for (let j = 0; j < count; j++) {
      const centre = fromU + (spanU * (j + 0.5)) / count;
      const travelled = centre * length;
      const lossHeight = ROLLING_FRICTION * travelled + 0.10 * travelled * DRAG_COEFF * 60;
      // Hills are built UP FROM THE FLOOR, not from the station.
      //
      // Getting this wrong is subtle and total. Floor the valleys but
      // leave the peaks measured from platform level, and a retry that
      // flattens the hills pushes their summits BELOW their own
      // valleys — the profile inverts, the spline dives through the
      // floor to reach them, and the speed ceiling the floor existed to
      // enforce is exceeded by 40%.
      const base = Math.max(STATION_Y, floorY);
      const available = Math.max(4, ceiling - base - lossHeight);
      const fade = 0.68 - 0.09 * j;
      const peak = base + available * Math.max(0.15, fade) * (0.85 + rng() * 0.3) * scale;
      const valley = base + Math.max(1.0, (peak - base) * (0.12 + rng() * 0.14));
      keys.push({ u: centre - spanU / (count * 2.6), y: valley });
      keys.push({ u: centre, y: Math.min(peak, ceiling - 4) });
    }
  };

  const hillCount = 3 + Math.floor(rng() * 3);
  const spanStart = dropBottomU + 0.02;
  const spanEnd = brakeStartU - 0.04;

  // Mid-circuit chain lifts. Each re-tops the energy budget, so the
  // hills after one are sized against ITS summit rather than against a
  // first drop that friction has been eating into ever since.
  //
  // Two rng draws, in this order and under exactly these conditions.
  // The second is short-circuited on a launched circuit and MUST STAY
  // short-circuited: `!launched && rng() < 0.6` never calls rng() on a
  // launched circuit, so making the draw unconditional advances the
  // stream and reshuffles every launched seed in the catalogue. Fifteen
  // of forty, when I tried it.
  const midApexFrac = 0.52 + rng() * 0.22;
  const drawsExtraLift = !launched && rng() < 0.6;

  const midApex = STATION_Y + (apex - STATION_Y) * midApexFrac;
  const midLiftU = Math.min(0.20, (midApex * 2.0) / length);
  const midDropU = Math.min(0.15, (midApex * 1.4) / length);

  // How many the circuit NEEDS, as opposed to how many it fancies.
  //
  // Once the length is a dial this stops being a stylistic choice. A
  // 2.4km circuit loses 27m of height to rolling friction and drag; hand
  // it a 22m lift and one drop and the train stops somewhere out on the
  // far side, which is precisely what the design sweep reported. So the
  // shortfall is worked out and covered. Long, low and slow is a
  // legitimate thing to ask a designer for, and the answer a designer
  // gives is "then it needs another lift".
  const roundLoss = ROLLING_FRICTION * length + 0.10 * length * DRAG_COEFF * 60;
  // Sized on what a MID lift actually reaches, which is around two
  // thirds of the summit — not on the summit. Budget against the big
  // lift and a long low circuit is handed three re-tops when it needs
  // five, and still coasts to a halt on the far side.
  const perLift = Math.max(4, (midApex - Math.max(STATION_Y, floorY)) * 0.62);
  const needed = Math.max(0, Math.ceil(roundLoss / perLift) - 1);
  // Plus whatever the retry ladder has had to ask for on top.
  //
  // `needed` is a PREDICTION — round loss divided by what a mid lift is
  // reckoned to be worth — and under honest train physics the prediction
  // runs optimistic on long, low circuits: `{length: 2400, height: 22}`
  // is handed three lifts, and stalls anyway on a crest somewhere out on
  // the far side. Rather than tune the heuristic against one corner, the
  // count is allowed to be MEASURED: build it, and if the train does not
  // get round, add a lift and build it again.
  //
  // No rng is consumed by the extra lifts, so a circuit that never needs
  // them is bit-for-bit the circuit it always was.
  // A LAUNCHED circuit never grows a chain, whatever the ladder asks
  // for: the whole point of a launch is that there is no lift on the
  // circuit, and `drawsExtraLift` already refuses one. The extra lifts
  // have to respect the same rule or the ladder quietly bolts a chain
  // onto a launched coaster (seed 142555 did exactly that).
  const midLifts = Math.max(needed, drawsExtraLift ? 1 : 0) + (launched ? 0 : extraLifts);

  const room = spanEnd - spanStart;
  const lifts = [];
  for (let k = 0; k < midLifts; k++) {
    // (k+1)/(n+1) * 0.88 puts a single lift at 0.44 of the span, which
    // is where the one hard-coded lift used to sit — so a circuit that
    // wanted exactly one comes out unchanged.
    const startU = spanStart + room * ((k + 1) / (midLifts + 1)) * 0.88;
    const bottomU = startU + midLiftU + midDropU;
    if (room > 0.34 && bottomU < spanEnd - 0.08) lifts.push({ startU, bottomU });
  }

  if (lifts.length) {
    const share = Math.max(1, Math.round(hillCount / (lifts.length + 1)));
    let cursor = spanStart;
    let ceiling = apex;
    for (const lift of lifts) {
      const crest = lift.startU + midLiftU;
      addHills(cursor, lift.startU - 0.03, share, ceiling);
      boosts.push({ startU: lift.startU, endU: crest, kind: "lift" });
      keys.push({ u: lift.startU, y: Math.max(STATION_Y + 1.5, floorY) });
      keys.push({ u: crest - shoulder(midLiftU, 0.03), y: midApex - 5.0 });
      keys.push({ u: crest, y: midApex });
      keys.push({ u: crest + shoulder(midDropU, 0.03), y: midApex - 5.0 });
      keys.push({ u: lift.bottomU, y: Math.max(STATION_Y + 1.5, floorY) });
      cursor = lift.bottomU + 0.02;
      ceiling = midApex;
    }
    addHills(cursor, spanEnd, Math.max(1, hillCount - share * lifts.length), ceiling);
  } else {
    addHills(spanStart, spanEnd, hillCount, apex);
  }

  // Held at the ceiling's floor too: the run-in to the brakes is still
  // free track, and a nineteen-metre dive into it would set the top
  // speed all on its own. Past brakeStartU the descent to platform level
  // is the brakes' problem, which is what brakes are for.
  keys.push({ u: brakeStartU, y: Math.max(STATION_Y + 3.0, floorY) });
  keys.push({ u: 0.95, y: STATION_Y + 0.6 });
  keys.sort((a, b) => a.u - b.u);
  return { keys, apex, dropBottomU, brakeStartU, boosts, launchSpeed, style };
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
//
// Every loop also carries a `splay`: see spliceLoop for why a loop drawn
// in a single vertical plane necessarily runs through itself.
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
    return { a, b, advance, radius: b, gTop, gBottom, splay: LOOP_SPLAY };
  }
  return null;
}

// Ease that starts and stops with zero first AND second derivative, so a
// section blended in with it joins the track without a curvature step.
function smootherstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Splay: why a flat loop cannot be built.
//
// Along the loop the train's position advances with θ as
// `advance·θ/2π + a·sin θ`, whose derivative goes negative over the top —
// it has to, because a rider only inverts if the track's heading swings
// through a full turn, and that needs the along-track motion to reverse.
// Reversal means the ascending and descending legs cross, and since the
// two legs sit at identical heights at θ and 2π−θ, a loop drawn in one
// vertical plane passes exactly through itself near the bottom. Real
// loops solve it the same way this one does: the legs splay apart
// sideways at the bottom and converge at the top, so they pass beside
// each other. `−splay·cos(θ/2)` runs from −splay at entry through 0 at
// the top to +splay at exit, with zero slope at both ends, and the base
// path either side is eased across by the same amount so the join stays
// straight.
function spliceLoop(points, roles, startIdx, spec) {
  const n = points.length;
  const { a, b, advance, splay } = spec;
  const removeCount = Math.max(4, Math.round(advance / RESAMPLE_DS));
  const rampCount = Math.max(4, Math.round(LOOP_RAMP / RESAMPLE_DS));
  if (removeCount + rampCount * 2 + 12 > n) return null;
  const worldUp = v3(0, 1, 0);
  const at = (i) => ((i % n) + n) % n;

  // The splay moves real track either side of the loop, so the whole
  // modified span has to be free-running: easing the chain lift or the
  // station platform sideways would drag structures off their footings.
  for (let k = -rampCount - 1; k <= removeCount + rampCount + 1; k++) {
    if (roles[at(startIdx + k)] !== "free") return null;
  }

  // Horizontal normal of the base path — the direction the splay pushes.
  const lateralAt = (idx) => {
    const t = vnorm(vsub(points[at(idx + 1)], points[at(idx - 1)]));
    const flat = v3(t.x, 0, t.z);
    const fwd = vlen(flat) > 1e-6 ? vnorm(flat) : t;
    return vnorm(vcross(worldUp, fwd));
  };

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
    const lat = vnorm(vcross(worldUp, fwd));
    const side = -splay * Math.cos(th / 2);
    arc.push(vadd(
      vadd(vadd(base, vmul(fwd, a * Math.sin(th))), vmul(worldUp, b * (1 - Math.cos(th)))),
      vmul(lat, side),
    ));
  }

  // Replace [startIdx, startIdx + removeCount) with the loop arc. The
  // circuit is closed, so rotate the array to the entry first and stitch
  // the remainder back on.
  const rotated = points.slice(startIdx).concat(points.slice(0, startIdx));
  const rotatedRoles = roles.slice(startIdx).concat(roles.slice(0, startIdx));
  const tail = rotated.slice(removeCount);
  const tailRoles = rotatedRoles.slice(removeCount);

  // Ease the base path across to meet each leg. The exit ramp runs
  // forward from the join; the entry ramp runs backwards from the far end
  // of the array, which is the track immediately before the loop.
  for (let j = 0; j < rampCount && j < tail.length; j++) {
    const w = smootherstep(1 - j / rampCount);
    const lat = lateralAt(startIdx + removeCount + j);
    tail[j] = vadd(tail[j], vmul(lat, splay * w));
  }
  for (let j = 0; j < rampCount && j < tail.length; j++) {
    const idx = tail.length - 1 - j;
    if (idx <= rampCount) break;
    const w = smootherstep(1 - (j + 1) / rampCount);
    const lat = lateralAt(startIdx - 1 - j);
    tail[idx] = vadd(tail[idx], vmul(lat, -splay * w));
  }

  return {
    points: arc.concat(tail),
    roles: new Array(steps).fill("free").concat(tailRoles),
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

function designSpeeds(points, ds, roles, launchSpeed = 0) {
  const n = points.length;
  const speeds = new Float64Array(n);
  const span = trainSpan(ds);
  // How far the TRAIN's centre of mass rises over one step.
  //
  // The train occupies samples [i - span, i]. Its centroid height is the
  // mean of those, so the rise from step i to step i+1 telescopes to the
  // sample that joins the front minus the sample that leaves the back,
  // over the number of samples. Exact, and O(1) rather than a re-average.
  //
  // This is not an approximation of the energy method — it IS the energy
  // method, for a train of uniform mass per metre. Using points[i+1].y -
  // points[i].y instead assumes every gram of the train sits under the
  // front axle, which on this circuit disagrees with the truth by up to
  // 78 degrees of pitch through a loop.
  const centroidRise = (i) => (points[(i + 1) % n].y - points[(i - span + n) % n].y) / (span + 1);
  let v = CHAIN_SPEED;
  // Two passes: the first seeds the speed at the crest of the lift, the
  // second runs with that seed so the free-running section is consistent.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const mode = roles[i];
      if (mode === "station") v = STATION_SPEED;
      else if (mode === "lift") v = CHAIN_SPEED;
      else if (mode === "launch") {
        // Constant push until the launch speed is reached, then held.
        v = Math.min(launchSpeed, Math.sqrt(v * v + 2 * LAUNCH_ACCEL * ds));
      } else {
        const dy = centroidRise(i);
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
function relaxProfile(points, ds, roles, budgetG, launchSpeed = 0) {
  const n = points.length;
  const hot = new Uint8Array(n);
  let worst = Infinity;
  for (let pass = 0; pass < 400; pass += 1) {
    const speeds = designSpeeds(points, ds, roles, launchSpeed);
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

export function buildTrack(seed, options = {}) {
  const wants = {
    length: clampDial(options.length, DIALS.length),
    height: clampDial(options.height, DIALS.height),
    // Carried in m/s internally; the dial is in km/h because that is
    // what the readouts and the marketing both use.
    speed: options.speed == null ? null : clampDial(options.speed, DIALS.speed) / 3.6,
  };

  const rng = mulberry32(seed);
  const name = trackName(rng);
  // Roughly one circuit in three is launched rather than lifted — unless
  // the speed dial has already decided, below.
  const drawnStyle = rng() < 0.34 ? "launch" : "chain";
  let layout = layoutFor(seed);
  let plan = planCurve(rng, 720, wants.length, layout);
  let planLength = arcLengths(plan).total;

  // Length is set by scaling the finished plan about the origin rather
  // than by redrawing it at a different radius. Scaling is exactly
  // linear in both arc length and turn radius, so one pass lands on the
  // target — and the circuit keeps the shape the seed drew, which is the
  // point of a seed. Shrinking tightens every turn by the same factor,
  // so the floor the plan curve already cleared has to be re-cleared.
  const fitPlanToLength = () => {
    if (!wants.length) return;
    const tightest = minPlanRadius(plan);
    const floor = tightest > 0 ? MIN_PLAN_RADIUS / tightest : 0;
    const factor = Math.max(floor, Math.min(5.0, wants.length / planLength));
    if (Math.abs(factor - 1) > 1e-3) {
      plan = plan.map((p) => v3(p.x * factor, p.y, p.z * factor));
      planLength *= factor;
    }
  };
  fitPlanToLength();

  // What gravity alone will give at the bottom of the first drop, and
  // therefore whether a launch is needed to reach the speed asked for.
  // 38m is the shortest lift the generator ever draws, so it is the
  // conservative assumption when no height has been asked for: if the
  // wanted speed is out of reach even from there, it needs a launch.
  //
  // A tall lift is a chain lift, whatever the speed dial says. The
  // launch profile throws the train straight into a top hat, and
  // MAX_LAUNCH_APEX is the height above which that stops being a ride
  // and starts being an ejection: ask for a 78m top hat at 145km/h and
  // the pull-in off the launch track is a 19m radius at 154km/h, which
  // is 9.8g and a coroner's report. Past that height the energy has to
  // arrive as a chain and a drop.
  // A lift tall enough for the length asked for.
  //
  // DIALS promises that every combination of the three is still a
  // rideable coaster. Under the point-mass physics that was true; under
  // honest train physics it is not, and `{length: 2400, height: 22}` is
  // where it breaks — 2.4 km sheds 27 m to rolling resistance and drag,
  // a 22 m lift has 19 m to give, and the mid-lift machinery cannot
  // close a gap that large without turning the ride into a funicular.
  // Measured, it stalled on six of eight seeds.
  //
  // The generator will not draw a circuit it knows will stop, so the
  // height is raised to what the length actually needs — 39 m at the far
  // end of the length dial, unchanged at 1.1 km and below, where 22 m
  // has always been fine. As everywhere else the dials conflict, the
  // readout then reports the lift that was BUILT.
  if (wants.height != null && wants.length != null) {
    wants.height = Math.max(
      wants.height,
      Math.min(DIALS.height.max, 22 + Math.max(0, wants.length - 1100) * 0.013),
    );
  }

  const style = wants.height != null && wants.height > MAX_LAUNCH_APEX ? "chain"
    : wants.speed == null ? drawnStyle
      : wants.speed > Math.sqrt(2 * G * ((wants.height ?? 38) - STATION_Y)) * 0.97 ? "launch"
        : "chain";

  // Everything after the plan curve is regenerated from a *frozen* draw of
  // random numbers, so shrinking the hills on retry does not reshuffle the
  // whole coaster into a different one.
  const profileSeed = Math.floor(rng() * 0xffffffff);

  // Each retry lowers the airtime hills, and then the loop, until the
  // train demonstrably completes the circuit. The lift apex is held
  // fixed throughout: it is the energy budget, not a hill.
  const build = (relax = 0, extraLifts = 0) => {
    let last = null;
    // Twelve finer steps rather than eight coarse ones, and the loop is
    // held on to for two thirds of them.
    //
    // Measuring felt g asymmetrically (see MIN_RIDEABLE_G) gives the
    // ladder more work to do, and on a coarse ladder the extra work was
    // paid for with the loop: a circuit that needed 8% off its hills got
    // 9%, missed, and arrived at the rung where loops are removed. A
    // smaller step lands nearer the answer, so more circuits are fixed
    // by the hills alone — 89 of the 120 test seeds keep their inversion
    // now, against 75 under the old ladder and the old point-mass gate.
    // Twelve attempts cost 47ms against 26, next to a mesh rebuild that
    // dwarfs both.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const scale = 1 - attempt * 0.06;
      const loopAllowance = attempt < 8 ? 1 : attempt < 10 ? 0.75 : 0;
      const candidate = assemble(plan, planLength, profileSeed, scale, seed, name, loopAllowance, style, wants, relax, extraLifts);
      const check = verifyCircuit(candidate);
      last = candidate;
      last.minFreeSpeed = check.minSpeed;
      last.maxG = check.maxG;
      last.minG = check.minG;
      last.attempts = attempt + 1;
      if (check.completes) return last;
    }
    return last; // last, flattest attempt — still returned rather than throwing
  };

  let result = build();

  // The length dial names the length of the TRACK, and the plan curve is
  // its shadow on the ground: hills make the real thing a fifth longer
  // again, by an amount that depends on how hilly this particular
  // circuit came out. Rather than guess the ratio, build once, measure,
  // and correct the plan by what the measurement says.
  //
  // Iterated rather than applied once. The relationship is linear in the
  // plan, but the amount the HILLS add is not a fixed ratio of it: a
  // correction changes how many attempts the retry ladder needs, which
  // changes how far the hills were flattened, which changes the length
  // again. One pass left seed 7932 eleven per cent short of a 900 m ask,
  // just outside the dial's own tolerance. Three passes converge on
  // every seed and combination in the suite, and each pass costs nothing
  // once the answer is already inside the band.
  for (let pass = 0; pass < 3; pass += 1) {
    if (!wants.length) break;
    if (Math.abs(result.length - wants.length) <= wants.length * 0.03) break;
    const tightest = minPlanRadius(plan);
    const floor = tightest > 0 ? MIN_PLAN_RADIUS / tightest : 0;
    const correction = Math.max(floor, Math.min(3.0, wants.length / result.length));
    if (Math.abs(correction - 1) <= 1e-3) break;
    plan = plan.map((p) => v3(p.x * correction, p.y, p.z * correction));
    planLength *= correction;
    result = build();
  }

  // Last resort: the speed ceiling gives.
  //
  // A speed ceiling is a FLOOR under the track — no part of the free
  // circuit may sit more than v^2/2g below the summit feeding it — and
  // on a long circuit with a low lift it becomes the binding constraint
  // on the whole design. Ask for 2.4 km, a 22 m lift and 60 km/h and the
  // floor lands at 7.8 m, which pins the entire profile into a
  // six-metre band. There is nothing left to spend against 27 m of
  // rolling loss, and nothing the ladder can do about it: flattening
  // hills does not put energy back, and an extra lift is one more chain
  // section where the train crawls (measured — it made more circuits
  // fail, not fewer).
  //
  // So when the circuit cannot be built at all, the ceiling is what
  // gives, and the readout then shows the speed that was BUILT rather
  // than the one that was asked for — which is the behaviour the dials
  // already promise where two of them genuinely conflict.
  //
  // Strictly a last resort, and that matters. Relaxing the ceiling a
  // notch on every rung of the ladder instead pushed ordinary speed asks
  // out with it: seed 39608 asked for 60 km/h and got 69, taking the
  // speed dial from a fifth of its tolerance to ninety-eight per cent of
  // it. A circuit that closes with the ceiling intact never touches this.
  if (!verifyCircuit(result).completes) {
    // More lifts first — a circuit that is simply short of energy wants
    // energy, and that is a thing a park can actually build. Only if
    // that fails too does the speed ceiling give, and only when a speed
    // was asked for at all.
    for (const extra of [1, 2, 3, 4, 5, 6]) {
      result = build(0, extra);
      if (verifyCircuit(result).completes) break;
    }
  }
  if (wants.speed && !verifyCircuit(result).completes) {
    for (const relax of [0.3, 0.8, Infinity]) {
      result = build(relax, 6);
      if (verifyCircuit(result).completes) break;
    }
  }

  // A layout is only worth having if it clears itself and honours the
  // dials.
  //
  // Crossing in plan is safe exactly when the two passes are at
  // different heights, and nothing in the generator arranges that: the
  // height profile is a function of position ALONG the circuit and knows
  // nothing about where the plan folds over. Usually the two passes are
  // in different acts of the ride and miss each other by a comfortable
  // margin — but on four of the 120 test seeds they arrived within two
  // metres, and the retry ladder cannot help, because flattening the
  // hills brings them closer together rather than further apart.
  //
  // The second condition is the same idea applied to the speed dial. An
  // archetype fixes the plan, the plan fixes where the first drop can
  // go, and on seed 15851 the eight left no way to bottom the drop
  // inside a 60 km/h ceiling — it came back at 81, against a dial that
  // promises a tenth. The star-shaped plan honours it on the same seed.
  //
  // So the archetype is abandoned and the seed rebuilt on the plan that
  // cannot cross by construction. The fallback stream is hashed
  // separately so it stays deterministic without disturbing anything the
  // main stream has already drawn.
  const missesSpeed = wants.speed != null
    && Math.max(...result.speeds) > wants.speed * 1.12;
  if (layout !== "classic" && (result.clearance < MIN_SELF_CLEARANCE || missesSpeed)) {
    const archetype = result;
    plan = planCurve(mulberry32((seed ^ 0x27d4eb2d) >>> 0), 720, wants.length, "classic");
    planLength = arcLengths(plan).total;
    fitPlanToLength();
    const fallback = build();
    // And the fallback has to be an improvement, not merely a different
    // set of problems. A rounder plan buys the clearance and the speed
    // ceiling, but it draws its own hills, and on the extreme dial
    // corners it can arrive at a circuit that will not go round at all —
    // which is a worse answer than a coaster that overshoots its speed
    // dial. So the swap only stands if the replacement completes.
    if (verifyCircuit(fallback).completes || !verifyCircuit(archetype).completes) {
      layout = "classic";
      result = fallback;
    } else {
      result = archetype;
    }
  }
  result.layout = layout;
  // Whether the speed dial was actually honoured.
  //
  // Almost always it is. The exception is a seed whose plan leaves no
  // way to bottom the first drop inside the ceiling AND whose fallback
  // plan will not go round at all — there the generator keeps the
  // circuit that completes and overshoots the dial, because a coaster
  // that is faster than you asked for is a coaster, and one that stops
  // half way is not. The readout shows what was built either way; this
  // flag is how the tests can tell the two apart instead of having to
  // assume the dial is always exact.
  result.speedHonoured = wants.speed == null
    || Math.max(...result.speeds) <= wants.speed * 1.12;
  return result;
}

function assemble(plan, planLength, profileSeed, scale, seed, name, loopAllowance, style, wants = {}, relax = 0, extraLifts = 0) {
  const rng = mulberry32(profileSeed);
  const profile = heightKeyframes(rng, planLength, scale, style, wants, relax, extraLifts);

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
    for (const boost of profile.boosts) {
      if (u >= boost.startU && u < boost.endU) return boost.kind;
    }
    return "free";
  });

  // The plan curve is sampled uniformly in angle, not arc length, so the
  // profile's crest does not land exactly where the fraction says it
  // should. Releasing the train while it is still climbing strands it
  // just short of the top. Hold the chain until the track genuinely
  // starts to fall, reading the boundary off the geometry rather than
  // trusting the parameterisation.
  // Every chain lift gets the same treatment, including a second one
  // halfway round. A launch does not need it: it ends on level track and
  // the train leaves it ballistically.
  const m = roles0.length;
  const liftEnds = [];
  for (let i = 0; i < m; i++) {
    if (roles0[i] === "lift" && roles0[(i + 1) % m] !== "lift") liftEnds.push(i);
  }
  // A train-length in samples of the PLAN curve, which is parameterised
  // by angle rather than arc length — planLength / m is its mean spacing.
  const planSpan = Math.max(1, Math.round(TRAIN_LENGTH / (planLength / m)));
  for (const end of liftEnds) {
    let cursor = end + 1;
    let guard = 0;
    // Hold the chain until the TRAIN is over the crest, not until the
    // front car is.
    //
    // Two things were wrong with releasing the moment the front car tips
    // over. The train's centre of mass is still climbing while its tail
    // is on the last of the lift, so the train is handed a summit it has
    // not finished paying for — on `{length: 2400, height: 22, speed:
    // 60}` that was 14 m of climb after release at 5 m/s, and the train
    // coasted to 1.0 m/s and stalled high on the crest. And the profile
    // does not always climb monotonically to its summit: flattened hard
    // enough, the crest keyframes leave a shallow dip a metre or two
    // before the top, and a rule that stops at the first descending
    // sample stops in the dip.
    //
    // So: find the summit, then run the chain a further train-length
    // past it, which is the distance the tail still has to travel once
    // the front car is over the top.
    //
    // Both halves are bounded on purpose. The search for the summit
    // looks three train-lengths ahead — far enough to step over the dip,
    // near enough that it cannot wander off and find the NEXT hill. An
    // unbounded "hold while anything ahead is higher" does exactly that
    // on a rolling profile: the condition stays true from one hill to
    // the next, the chain runs a quarter of the circuit, and the
    // free-running track it eats is the track the tunnel siting and the
    // energy sweep both needed.
    const look = planSpan * 3;
    let summit = end;
    let summitY = shaped[end % m].y;
    for (let k = 1; k <= look; k++) {
      const y = shaped[(end + k) % m].y;
      if (y > summitY) { summitY = y; summit = end + k; }
    }
    const release = summit + planSpan;
    while (guard++ < m * 0.25 && cursor <= release) {
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
    // Hold the speed ceiling against the SAMPLES, and hold it here.
    //
    // The ceiling is a floor under the free-running track, and it was
    // enforced only by placing keyframes on it — which is necessary and
    // not sufficient, because Catmull-Rom undershoots between them. On
    // seed 15851 at 60 km/h the first drop bottomed thirteen metres
    // under its own keyframe and handed back 81.
    //
    // Clamping alone does not hold either: relaxProfile smooths the
    // clipped valley straight back down through the floor. So the two
    // are iterated instead — clamp, relax, clamp again — and they settle
    // on a profile that respects the floor with its curvature still
    // inside budget. Only where a speed was asked for; `floorY` is null
    // otherwise and an undialled circuit is untouched.
    profileG = relaxProfile(points, ds, roles, PROFILE_G_BUDGET, profile.launchSpeed);
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
  let preSpeeds = designSpeeds(points, ds, roles, profile.launchSpeed);
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

  // A candidate is only accepted once the FINISHED circuit has been
  // measured for self-collision. The splay keeps a loop clear of its own
  // legs, but nothing stops a 25 m loop from being thrown up through the
  // airtime hill next door — that depends on where the plan curve
  // happens to fold back on itself, which is only knowable after the
  // splice. When a placement collides, move on to the next one; the
  // circuit having no loop at all is a better outcome than one that
  // passes through solid steel.
  let loop = null;
  let clearance = selfClearance(points, ds).distance;
  if (loopAllowance > 0) {
    let tried = 0;
    for (const candidate of candidates.slice(0, 80)) {
      if (tried >= 14) break;
      // Keep the loop no taller than the lift that feeds it. This is a
      // LOOKS-right bound, not a physics one: whether the circuit can
      // afford the loop is settled by simulating the finished track and
      // retrying, which is honest about the energy.
      const headroom = (apexShaped - points[candidate.i].y) * loopAllowance;
      const spec = chooseLoop(preSpeeds[candidate.i], headroom);
      if (!spec) continue;
      const spliced = spliceLoop(points, roles, candidate.i, spec);
      if (!spliced) continue;
      tried += 1;
      // Splicing changed the arc length and moved the origin to the loop
      // entry; re-resample, then re-index from the station.
      const resampled = resampleClosed(spliced.points, RESAMPLE_DS, spliced.roles);
      const gap = selfClearance(resampled.points, resampled.ds).distance;
      if (gap < MIN_SELF_CLEARANCE) continue;
      const rotated = rotateToStation(resampled.points, resampled.roles);
      points = rotated.points;
      roles = rotated.roles;
      ds = resampled.ds;
      preSpeeds = designSpeeds(points, ds, roles, profile.launchSpeed);
      loop = spec;
      clearance = gap;
      break;
    }
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
    speeds: preSpeeds, ds, length, apex, lowest, loop, profileG, clearance,
    style,
    launchSpeed: profile.launchSpeed,
    lifts: profile.boosts.filter((b) => b.kind === "lift").length,
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
  let maxG = -Infinity;
  let minG = Infinity;
  for (let i = 0; i < n; i++) {
    // Check the g-load on the FINISHED geometry, not just on the shapes
    // that were designed. The loop is sized analytically before it is
    // spliced, so only a measurement of the assembled track catches a
    // splice that came out tighter than its own specification.
    //
    // Felt g, in the car's own frame — the acceleration needed to follow
    // the track, less gravity, resolved onto the floor. Inside a loop
    // that reads as a healthy positive number even though the car is
    // upside down, which is exactly right: the rider is pressed into the
    // seat there, and a magnitude of curvature alone could not tell.
    const v = track.speeds[i];
    const g = vdot(vsub(vmul(track.curvature[i], v * v), v3(0, -G, 0)), track.ups[i]) / G;
    if (g > maxG) maxG = g;
    if (g < minG) minG = g;
    if (track.roles[i] !== "free") continue;
    if (track.speeds[i] < minSpeed) minSpeed = track.speeds[i];
  }
  if (!Number.isFinite(minSpeed)) minSpeed = CHAIN_SPEED;
  return {
    completes: minSpeed >= MIN_FREE_SPEED
      && maxG <= MAX_RIDEABLE_G
      && minG >= MIN_RIDEABLE_G,
    minSpeed,
    maxG,
    minG,
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
    this.accel = 0;
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
    // tab that drops to 20fps must not fling the train off the lift. The
    // cap bounds how much a single long frame can advance — at 0.2s and
    // 4ms sub-steps that is fifty integration steps, which is still exact,
    // while a tighter cap would put a slow machine into slow motion.
    const clamped = Math.min(0.2, Math.max(0, dt));
    const steps = Math.max(1, Math.ceil(clamped / 0.004));
    const h = clamped / steps;
    for (let k = 0; k < steps; k++) this.substep(h);
    return this.state();
  }

  // The gradient the whole train is on, not the one under the front car.
  //
  // `this.s` is the front of the train; the cars trail behind it. Mean
  // sin(pitch) over the train's length is exactly d/ds of the train's
  // centre-of-mass height, so averaging the gradient is the energy
  // method rather than a smoothing of it. Sampled on the same grid the
  // design sweep uses, so the two agree about whether a circuit goes
  // round.
  trainPitch(s) {
    const ds = this.track.ds;
    const span = trainSpan(ds);
    let sum = 0;
    for (let k = 0; k <= span; k++) sum += this.sample(s - k * ds).fwd.y;
    return sum / (span + 1);
  }

  // The height of the train's centre of mass.
  //
  // This is the quantity the free-running integration conserves energy
  // against — trainPitch is its derivative — so it, and not the height
  // of the front car, is what pairs with v^2/2g to make a constant.
  trainCentroidY(s = this.s) {
    const ds = this.track.ds;
    const span = trainSpan(ds);
    let sum = 0;
    for (let k = 0; k <= span; k++) sum += this.sample(s - k * ds).pos.y;
    return sum / (span + 1);
  }

  substep(h) {
    const t = this.track;
    const total = t.points.length * t.ds;
    const mode = this.mode;
    let accel = 0;

    if (mode === "station") {
      this.v += (STATION_SPEED - this.v) * Math.min(1, h * 3);
    } else if (mode === "lift") {
      this.v += (CHAIN_SPEED - this.v) * Math.min(1, h * 2);
    } else if (mode === "launch") {
      // A hard, constant shove until the launch speed is reached, then
      // held there for whatever is left of the launch track.
      const target = t.launchSpeed || CHAIN_SPEED;
      accel = this.v < target ? LAUNCH_ACCEL : 0;
      this.v = Math.min(target, this.v + accel * h);
    } else {
      const sinPitch = Math.max(-1, Math.min(1, this.trainPitch(this.s)));
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
    this.accel = accel;
    const g = this.feltAt(this.s, this.v, accel);
    // Light smoothing: the readout should be legible, not a strobe.
    this.gForce += (g - this.gForce) * Math.min(1, h * 8);
  }

  // What a rider feels at an arbitrary point on the train.
  //
  // The back seat is not the front seat, and the difference is not a
  // detail: over a crest the front car is already falling while the back
  // is still being dragged up over it, and the curvature under each is
  // different. Resolving the same acceleration at a different arc
  // position is the whole reason enthusiasts queue longer for the back.
  //
  // Both of the shared terms are genuinely shared: one train has one
  // speed, and `accel` now comes from the gradient under the WHOLE train
  // (see trainPitch), so it is a property of the train rather than of
  // whichever seat happens to be reading it. Only the curvature is local.
  feltAt(s, v = this.v, accel = this.accel) {
    const here = this.sample(s);
    const following = vadd(vmul(here.fwd, accel), vmul(here.curv, v * v));
    return vdot(vsub(following, v3(0, -G, 0)), here.up) / G;
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
      laps: this.laps,
      mode: this.mode,
      progress: this.s / (this.track.points.length * this.track.ds),
    };
  }
}

// ------------------------------------------------------------
// The ride log.
//
// What a coaster is actually judged on, by the people who judge coasters:
// how long the lap took, how fast it got, how hard it pulled, and — the
// number enthusiasts actually compare — how many SECONDS of airtime it
// gave, meaning time spent light in the restraints.
//
// Kept here rather than in the page because it is arithmetic over the
// ride state, which means node can check it.
// ------------------------------------------------------------

// Below this many g the restraints have gone light and it counts.
export const AIRTIME_G = 0.25;

export class RideLog {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = blankLap();
    this.last = null;
    this.best = null;
  }

  // Call once per frame with the ride state. Returns the finished lap
  // when one has just closed, otherwise null.
  sample(ride, dt) {
    if (!(dt > 0)) return null;
    const lap = this.current;
    lap.seconds += dt;
    lap.topSpeed = Math.max(lap.topSpeed, ride.v);
    if (ride.mode === "free") {
      lap.maxG = Math.max(lap.maxG, ride.gForce);
      lap.minG = Math.min(lap.minG, ride.gForce);
      if (ride.gForce < AIRTIME_G) lap.airtime += dt;
    }
    lap.maxHeight = Math.max(lap.maxHeight, ride.height);

    // A lap closes when the train crosses the start line, which the sim
    // reports by advancing its own counter.
    if (ride.laps === lap.startedAtLap) return null;
    // The very first crossing includes however long the page sat at the
    // station before the ride began, so it is timed but not ranked.
    const finished = { ...lap, complete: true };
    this.last = finished;
    if (!this.best || finished.airtime > this.best.airtime) this.best = finished;
    this.current = blankLap(ride.laps);
    return finished;
  }
}

function blankLap(startedAtLap = 0) {
  return {
    startedAtLap,
    seconds: 0,
    airtime: 0,
    topSpeed: 0,
    maxG: -Infinity,
    minG: Infinity,
    maxHeight: 0,
    complete: false,
  };
}

// ------------------------------------------------------------
// Where to bore a tunnel.
//
// The Disney trick is to put something solid in the way and run the track
// through it. The site has to be FOUND rather than chosen: a stretch of
// free-running track that is low, level, upright and long enough, with a
// hillside over it that does not swallow any other part of the circuit —
// which is the same clearance question the loop asks, asked in plan.
//
// Returned as plain data (indices and a bounding hill) so the renderer
// only has to build what this decides, and so `node --test` can check the
// decision without a GPU.
// ------------------------------------------------------------

// The hill is not an ellipsoid — a smooth dome reads as a balloon — so
// the renderer displaces its surface by this factor, evaluated on the
// unit sphere before scaling. It is exported because the site test has
// to clear the shape that actually gets BUILT: pad the ellipsoid by the
// worst-case bulge instead and the margin swallows most of the park
// (120 seeds: 65 usable sites becomes 20).
export function hillBump(x, y, z) {
  return 1
    + Math.sin(x * 5.1 + z * 3.7) * 0.05
    + Math.sin(y * 4.3 - x * 2.9) * 0.045
    + Math.sin(z * 7.7 + y * 5.3) * 0.03;
}

export function tunnelSite(track, groundHeight, wantLength = 46) {
  const n = track.points.length;
  const samples = Math.max(20, Math.round(wantLength / track.ds));
  if (samples * 2 > n) return null;

  // The hill a given run of track implies: an ellipsoid wide enough to
  // cover it, sunk a third of its height into the ground. The RENDERER
  // builds exactly this, from these numbers, so the two cannot drift.
  const hillFor = (span) => {
    const mid = track.points[span[Math.floor(span.length / 2)]];
    let reach = 0;
    let crown = -Infinity;
    for (const i of span) {
      const p = track.points[i];
      reach = Math.max(reach, Math.hypot(p.x - mid.x, p.z - mid.z));
      crown = Math.max(crown, p.y);
    }
    const radius = reach + 9;
    const top = crown + 5.5;
    const base = groundHeight(mid.x, mid.z);
    return {
      mid: { x: mid.x, y: mid.y, z: mid.z },
      radius,
      top,
      // Centre and radii of the ellipsoid itself.
      x: mid.x,
      y: base - (top - base) * 0.34,
      z: mid.z,
      rx: radius,
      ry: (top - base) * 1.34,
      rz: radius * 0.92,
    };
  };

  // Inside the hill as the renderer draws it, bumps and all: map the
  // point into the ellipsoid's unit space, then compare its radius
  // against the displaced surface in that same direction. The slack is
  // only a graze margin — track that skims the grass looks as wrong as
  // track buried in it.
  const insideHill = (p, hill, slack = 1.06) => {
    const dx = (p.x - hill.x) / hill.rx;
    const dy = (p.y - hill.y) / hill.ry;
    const dz = (p.z - hill.z) / hill.rz;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r > 1.13 * slack) return false;      // outside any possible bulge
    if (r < 1e-6) return true;
    return r < hillBump(dx / r, dy / r, dz / r) * slack;
  };

  // What a PORTAL needs, as opposed to what the bore needs. Inside the
  // hill the tube just follows the frame, banked or not; but the stone
  // arch at each mouth has to stand upright on the hillside and clear
  // the grass, or it reads as a hoop half-sunk in a lawn.
  const portalOk = (i) => {
    if (track.ups[i].y < 0.7) return false;
    const p = track.points[i];
    const above = p.y - groundHeight(p.x, p.z);
    return above > 3.4 && above < 20.0;
  };

  const candidates = [];
  for (let start = 0; start < n; start += 3) {
    let usable = true;
    let flatness = 0;
    for (let k = 0; k < samples; k++) {
      const i = (start + k) % n;
      const p = track.points[i];
      const above = p.y - groundHeight(p.x, p.z);
      // Free-running, close to the ground but with room for a bore
      // UNDER the rails, upright, and not on its side:
      if (track.roles[i] !== "free" || track.ups[i].y < 0.7 || above < 4.6 || above > 20.0) {
        usable = false;
        break;
      }
      flatness += Math.abs(track.tangents[i].y);
    }
    if (usable) candidates.push({ start, score: flatness / samples });
  }
  candidates.sort((a, b) => a.score - b.score || a.start - b.start);

  const MAX_SPAN = Math.min(n - 8, Math.round(150 / track.ds));

  for (const candidate of candidates.slice(0, 24)) {
    let span = [];
    for (let k = 0; k < samples; k++) span.push((candidate.start + k) % n);
    let hill = hillFor(span);

    // Absorb the track either side that the hill would bury.
    //
    // This is where the first version went wrong. It exempted everything
    // within a fixed distance ALONG the track of the span, on the theory
    // that the approach legitimately runs along the hillside. It does —
    // until it curves back INTO the hill, and then the train goes
    // straight through the grass, because the bore's hole stops at the
    // portal while the track carries on inside the rock.
    //
    // So there is no exemption now. Track the hill would swallow is
    // either absorbed into the tunnel — the bore and the hole are cut
    // along the whole absorbed run, so the portals end up where the
    // track really does leave the hill — or the site is rejected.
    let grew = true;
    for (let round = 0; round < 4 && grew; round++) {
      grew = false;
      const canExtend = (i) => track.roles[i] === "free" && insideHill(track.points[i], hill);
      let head = span[0];
      let tail = span[span.length - 1];
      while (span.length < MAX_SPAN && canExtend((head - 1 + n) % n)) {
        head = (head - 1 + n) % n;
        span.unshift(head);
        grew = true;
      }
      while (span.length < MAX_SPAN && canExtend((tail + 1) % n)) {
        tail = (tail + 1) % n;
        span.push(tail);
        grew = true;
      }
      if (grew) hill = hillFor(span);
    }
    // A run that keeps growing is a circuit that spends its life inside
    // the hillside, which is not a tunnel.
    if (span.length >= MAX_SPAN) continue;

    // Growth moved the mouths, so it is the GROWN ends that have to be
    // able to carry an arch, not the run we started from.
    if (!portalOk(span[0]) || !portalOk(span[span.length - 1])) continue;

    // And now nothing else may be inside it at all.
    const inSpan = new Set(span);
    let fouled = false;
    for (let i = 0; i < n && !fouled; i++) {
      if (inSpan.has(i)) continue;
      if (insideHill(track.points[i], hill)) fouled = true;
    }
    if (fouled) continue;

    return { span, mid: hill.mid, radius: hill.radius, top: hill.top, hill };
  }
  return null;
}

// ------------------------------------------------------------
// How enclosed the track is, and where the trailing cameras fly.
//
// The chase and wing cameras hang out in space beside and above the
// train. That is right in the open and fatal anywhere with a ceiling: a
// camera five metres over the rails does not follow the train into a
// tunnel, it flies into the hillside above the portal, and at the
// station the shed roof swallows it whole.
//
// So the track carries a profile — 0 in the open, 1 where there is a
// roof close overhead — and the cameras tuck in against it. It lives
// here, with the geometry it is measuring, rather than in the renderer,
// so it can be checked without a GPU.
// ------------------------------------------------------------

// The bore the tunnel is driven at, shared by the tube, its portals, the
// hole cut through the hillside, and the camera clearances below.
export const BORE_RADIUS = 3.4;
// Underside of the station shed's roof, above the rails.
export const SHED_ROOF = 4.2;
// Half the shed's length along the track.
export const SHED_HALF = 11;

export function enclosureProfile(track, stationIdx, tunnelSpan = null) {
  const n = track.points.length;
  const wrap = (i) => ((i % n) + n) % n;
  let a = new Float32Array(n);
  if (tunnelSpan) for (const i of tunnelSpan) a[i] = 1;
  const shed = Math.ceil(SHED_HALF / track.ds);
  for (let k = -shed; k <= shed; k++) a[wrap(stationIdx + k)] = 1;

  // Grown first, so the camera is already down when it reaches the
  // mouth rather than diving as it arrives; then the shoulders are
  // smoothed off. The growth has to be wider than the smoothing reaches,
  // or the blur pulls the value at the portal itself back down and the
  // camera arrives half-ducked — which is a collision, not a near miss.
  const grow = Math.max(1, Math.ceil(20 / track.ds));
  const soften = Math.max(1, Math.ceil(7 / track.ds));
  const grown = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = -grow; k <= grow; k++) m = Math.max(m, a[wrap(i + k)]);
    grown[i] = m;
  }
  a = grown;
  for (let pass = 0; pass < 2; pass++) {
    const soft = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -soften; k <= soften; k++) sum += a[wrap(i + k)];
      soft[i] = sum / (2 * soften + 1);
    }
    a = soft;
  }
  return a;
}

// What a trailing camera may still hold on to at full enclosure. As far
// out and as high as the bore allows, not as little as it can get away
// with: tucked to a metre out and half a metre up it clears everything
// and looks at nothing but the side of a car from close range. Out 2.3
// and up 1.5 is 2.75m diagonally, inside the 2.9m the bore leaves, and
// it looks over the train instead.
export const TUCK = { side: 2.3, rise: 1.5 };

// Squeeze a trailing camera's offset from the train through whatever the
// track is passing through.
//
// The offset is in the train's own frame — `along` up the track, `side`
// across it, `rise` in world up — and only two of the three are ever in
// danger. A bore and a shed are both long: whatever the camera is doing
// ALONG the track there is more tunnel in front of it. It is the
// sideways and upward reach that meets the wall.
//
// Blending towards the cap rather than clamping at it is deliberate. A
// clamp is a corner — the camera holds station, hits the limit and stops
// dead in the mouth of the tunnel. Blending reaches the same place by
// the portal with the movement spread over the approach.
export function tuckIn(offset, e) {
  const squeeze = (v, cap) => {
    const held = Math.sign(v) * Math.min(Math.abs(v), cap);
    return v * (1 - e) + held * e;
  };
  return {
    along: offset.along,
    side: squeeze(offset.side, TUCK.side),
    rise: squeeze(offset.rise, TUCK.rise),
  };
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
    // The horizontal normal of the track here, so a renderer can splay a
    // pair of legs ACROSS the track rather than along it.
    const t = track.tangents[i];
    const flat = Math.hypot(t.x, t.z);
    const dirX = flat > 1e-6 ? -t.z / flat : 1;
    const dirZ = flat > 1e-6 ? t.x / flat : 0;
    out.push({ x: p.x, z: p.z, top: p.y, height, dirX, dirZ });
  }
  return out;
}
