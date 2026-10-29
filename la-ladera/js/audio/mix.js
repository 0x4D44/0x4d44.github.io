// What the soundscape should be at a place and a time (owner: A1). Pure functions only: no WebAudio, no DOM, no THREE, no Math.random(), so the
// zone logic is tested under Node and the engine just applies the numbers. Inputs are the plan (areas, landmarks), the anchors the furnishers
// emit, the hour, how night it is, how high the player stands and how many neighbours are about.
import { hashSeed } from './dsp.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
const wrap24 = (h) => ((h % 24) + 24) % 24;
/** Soft trapezoid over the hour: rises a..b, flat b..c, falls c..d. */
export const hourWindow = (h, a, b, c, d) => { const x = wrap24(h); return smooth(a, b, x) * (1 - smooth(c, d, x)); };

// ---- the zones: how much of each sound belongs to each named area of the plan (CONTRACT: plan.areas ids) -----------------------------------
export const ZONE_KEYS = ['wind', 'traffic', 'murmur', 'children', 'birds', 'dogs', 'horns'];
export const ZONES = {
  plan:      { wind: 0.30, traffic: 1.00, murmur: 0.75, children: 0.30, birds: 0.35, dogs: 0.60, horns: 1.00 },   // El Plan: the bottom street, shops, buses
  almendros: { wind: 0.45, traffic: 0.38, murmur: 0.50, children: 0.35, birds: 1.00, dogs: 0.50, horns: 0.25 },   // Los Almendros: trees and a plaza
  faroles:   { wind: 0.45, traffic: 0.30, murmur: 0.55, children: 0.40, birds: 0.65, dogs: 0.70, horns: 0.20 },   // El Farol: the alley of lamps
  cruz:      { wind: 0.55, traffic: 0.22, murmur: 0.60, children: 0.45, birds: 0.65, dogs: 0.55, horns: 0.12 },
  cumbre:    { wind: 0.90, traffic: 0.14, murmur: 0.30, children: 0.25, birds: 0.70, dogs: 0.30, horns: 0.05 },   // La Cumbre: the chapel plaza, high and open
  ridge:     { wind: 1.00, traffic: 0.08, murmur: 0.10, children: 0.05, birds: 0.60, dogs: 0.20, horns: 0.00 },   // El Mirador: the ridge, mostly wind and sky
  west:      { wind: 0.60, traffic: 0.20, murmur: 0.45, children: 0.40, birds: 0.70, dogs: 0.75, horns: 0.08 },
  east:      { wind: 0.60, traffic: 0.20, murmur: 0.45, children: 0.40, birds: 0.70, dogs: 0.75, horns: 0.08 },
};
export const DEFAULT_ZONE = { wind: 0.5, traffic: 0.25, murmur: 0.45, children: 0.3, birds: 0.6, dogs: 0.5, horns: 0.1 };

/** Distance from (x,z) to polygon `poly` ([[x,z],...]); 0 inside. */
export function distToPoly(poly, x, z) {
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const vx = xj - xi, vz = zj - zi, l2 = vx * vx + vz * vz, t = l2 > 0 ? clamp(((x - xi) * vx + (z - zi) * vz) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - (xi + vx * t), z - (zi + vz * t)));
  }
  return inside ? 0 : best;
}

/** Area weights at (x,z): inside an area its weight is 1, outside it falls off over `falloff` metres; normalised to sum 1. [{ id, w }] */
export function areaWeights(areas, x, z, falloff = 10) {
  const out = []; let sum = 0;
  for (const a of areas ?? []) { if (!a.poly || a.poly.length < 3) continue; const w = Math.exp(-distToPoly(a.poly, x, z) / falloff); out.push({ id: a.id, w }); sum += w; }
  if (!out.length) return [{ id: 'default', w: 1 }];
  for (const o of out) o.w /= sum;
  return out;
}
/** The dominant area id at (x,z), or null when no area covers it. */
export function zoneAt(areas, x, z) {
  let best = null, bd = Infinity;
  for (const a of areas ?? []) { if (!a.poly || a.poly.length < 3) continue; const d = distToPoly(a.poly, x, z); if (d < bd - 1e-9) { bd = d; best = a.id; } }
  return bd < 6 ? best : null;
}
/** The zone table blended at (x,z). */
export function blendZones(areas, x, z, falloff = 10) {
  const out = Object.fromEntries(ZONE_KEYS.map((k) => [k, 0]));
  for (const { id, w } of areaWeights(areas, x, z, falloff)) { const zn = ZONES[id] ?? DEFAULT_ZONE; for (const k of ZONE_KEYS) out[k] += zn[k] * w; }
  return out;
}

/** Terrain height range (5th..95th percentile on a coarse grid), the span the "how high am I" blend runs over. */
export function heightRange(heightAt, half = 96, step = 8) {
  const hs = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) { const y = heightAt(x, z); if (Number.isFinite(y)) hs.push(y); }
  hs.sort((a, b) => a - b);
  if (hs.length < 4) return { lo: 0, hi: 30 };
  const lo = hs[Math.floor(hs.length * 0.05)], hi = hs[Math.floor(hs.length * 0.95)];
  return hi - lo > 1 ? { lo, hi } : { lo, hi: lo + 1 };
}

// ---- time of day ---------------------------------------------------------------------------------------------------------------------------
/** 0 by day, 1 at night, from the hour alone (the page uses look's own `ctx.night` when it has one). */
export const nightFromHour = (h) => 1 - smooth(5.2, 6.8, wrap24(h)) * (1 - smooth(18.0, 19.6, wrap24(h)));
/** How much each kind of activity is going on at `hour` (0..1). */
export function activity(kind, hour) {
  switch (kind) {
    case 'awake': return hourWindow(hour, 5, 7.5, 21.5, 23.5);
    case 'kids': return hourWindow(hour, 7, 8.5, 18.5, 20.5);
    case 'tv': return hourWindow(hour, 16.0, 17.0, 22.5, 23.5);
    case 'cook': return Math.max(hourWindow(hour, 5.5, 6.2, 8, 9), hourWindow(hour, 11, 11.8, 13.8, 14.6), hourWindow(hour, 16.8, 17.5, 20, 21));
    case 'radio': return hourWindow(hour, 6, 7, 20.5, 22);
    case 'workshop': return hourWindow(hour, 7.5, 8.3, 17.2, 18);
    case 'court': return Math.max(hourWindow(hour, 14, 15.5, 20, 21.5), 0.2 * hourWindow(hour, 7, 8, 12, 13));
    case 'school': return hourWindow(hour, 6.8, 7.3, 17.3, 18);
    case 'traffic': return 0.3 + 0.7 * hourWindow(hour, 5.5, 7.5, 19.5, 22.5);
    case 'birds': { const dd = Math.max(hourWindow(hour, 4.5, 6, 8, 10), hourWindow(hour, 15.5, 17, 18.5, 19.5)); return 0.55 + 0.45 * dd; }
    default: return 1;
  }
}

// ---- the mix ---------------------------------------------------------------------------------------------------------------------------------
/**
 * Target levels for the outdoor beds and the rates of the random one-shots at a place and time.
 * env: { areas, x, z, alt (0 bottom .. 1 ridge), hour, night (0..1; default from hour), crowd (0..1 neighbours about) }
 * -> { beds: { wind, traffic, crickets, murmur, children }, rates: { birds, dogs, horns } (events per minute), zone }
 */
export function computeMix(env) {
  const hour = env.hour ?? 17.2, night = clamp(env.night ?? nightFromHour(hour), 0, 1), day = 1 - night, alt = clamp(env.alt ?? 0.5, 0, 1), crowd = clamp(env.crowd ?? 0.3, 0, 1);
  const z = blendZones(env.areas, env.x ?? 0, env.z ?? 0), awake = activity('awake', hour);
  const wind = z.wind * (0.4 + 0.95 * alt) * (0.85 + 0.25 * night);
  const traffic = z.traffic * (1.15 - 0.8 * alt) * activity('traffic', hour);
  const crickets = night ** 1.5 * (0.45 + 0.55 * (1 - clamp(z.traffic, 0, 1))) * (1 - 0.55 * alt);
  const murmur = z.murmur * (0.3 + 0.7 * crowd) * awake * (0.55 + 0.45 * day);
  const children = z.children * activity('kids', hour) * (0.35 + 0.65 * crowd) * day;
  return {
    beds: { wind, traffic, crickets, murmur, children },
    rates: { birds: 13 * z.birds * day * activity('birds', hour), dogs: 1.3 * z.dogs * (0.5 + night), horns: 1.5 * z.horns * awake * activity('traffic', hour) },
    zone: z,
  };
}

// ---- positional emitters: a television, a radio, a frying pan, a workshop, a court, a school -----------------------------------------------
export const EMITTER = {
  tv:       { bed: 'tv',       ref: 1.5, max: 22,  gain: 3.0, rolloff: 1.4, act: 'tv' },
  radio:    { bed: 'radio',    ref: 2.0, max: 26,  gain: 3.0, rolloff: 1.4, act: 'radio' },
  cook:     { bed: 'sizzle',   ref: 1.2, max: 14,  gain: 2.5, rolloff: 1.5, act: 'cook' },
  workshop: { bed: 'workshop', ref: 6.0, max: 85,  gain: 2.5, rolloff: 1.1, act: 'workshop' },
  court:    { bed: 'court',    ref: 8.0, max: 140, gain: 2.6, rolloff: 1.0, act: 'court' },
  school:   { bed: 'children', ref: 10,  max: 120, gain: 2.2, rolloff: 1.0, act: 'school' },
};
const chance = (key, p) => (hashSeed(key) % 1000) / 1000 < p;

/**
 * Everything that can make a noise from one place. Landmarks give the public ones (court, school, workshop, the bakery's radio, the hall);
 * anchors give the households (a tv in front of a sofa, a stove, a shop counter). One emitter of a kind per building. Deterministic.
 * -> [{ id, kind, bed, x, y, z, building, ref, max, gain, rolloff, act }]
 */
export function buildEmitters(plan, anchors = []) {
  const out = [], byBuilding = new Set(), ground = (x, z) => (plan?.heightAt ? plan.heightAt(x, z) : 0);
  const add = (kind, id, x, y, z, building = null, tweak = {}) => out.push({ id, kind, x, y, z, building, ...EMITTER[kind], ...tweak });
  for (const l of plan?.landmarks ?? []) {
    const y = ground(l.x, l.z) + 1.5;
    if (l.kind === 'court') add('court', 'court:' + l.id, l.x, y, l.z);
    else if (l.kind === 'school') add('school', 'school:' + l.id, l.x, y, l.z);
    else if (l.id === 'taller') add('workshop', 'workshop:' + l.id, l.x, y, l.z);
    else if (l.id === 'panaderia') add('radio', 'radio:' + l.id, l.x, y, l.z, null, { max: 40 });
    else if (l.kind === 'hall') add('radio', 'radio:' + l.id, l.x, y, l.z, null, { act: 'tv', max: 40 });
  }
  const want = { tv: 0.6, cook: 0.75, counter: 0.5 };
  for (const a of anchors) {
    const p = want[a.kind]; if (!p) continue;
    const kind = a.kind === 'counter' ? 'radio' : a.kind, key = `${kind}:${a.building ?? a.id}`;
    if (byBuilding.has(key) || !chance(`${a.id}|${a.building}|${kind}`, p)) continue;
    byBuilding.add(key);
    add(kind, `${kind}:${a.id}`, a.x, (a.y ?? 0) + (kind === 'cook' ? 1.0 : 1.1), a.z, a.building ?? null);
  }
  return out;
}

/** How well an emitter can be heard from (lx,lz,ly): gain x activity x the distance law the panner will apply; 0 beyond its range. */
export function emitterScore(em, lx, ly, lz, hour) {
  const d = Math.hypot(em.x - lx, em.y - ly, em.z - lz);
  if (d >= em.max) return 0;
  const act = activity(em.act, hour); if (act < 0.05) return 0;
  return em.gain * act * (em.ref / (em.ref + em.rolloff * Math.max(0, d - em.ref)));
}
/**
 * The loudest `max` emitters. Ones that already sound (`current`: a Set of ids) get a bonus so voices do not flip-flop at the margin.
 * -> [{ em, score, dist }] best first
 */
export function pickEmitters(emitters, lx, ly, lz, hour, current = null, max = 6, floor = 0.012) {
  const scored = [];
  for (const em of emitters) {
    const s = emitterScore(em, lx, ly, lz, hour); if (s < floor) continue;
    scored.push({ em, score: s * (current?.has(em.id) ? 1.4 : 1), dist: Math.hypot(em.x - lx, em.y - ly, em.z - lz) });
  }
  scored.sort((a, b) => b.score - a.score || (a.em.id < b.em.id ? -1 : 1));
  return scored.slice(0, max);
}

// ---- the chapel bell ---------------------------------------------------------------------------------------------------------------------------
/** Strokes for the hour (the Angelus at 6, 12 and 18 is three, a hospitable few for the others; never more than 6). */
export function strokesForHour(hour) {
  const h = Math.floor(wrap24(hour)); if (h < 6 || h > 21) return 0;
  if (h === 6 || h === 12 || h === 18) return 3;
  return clamp(h % 12 || 12, 1, 6);
}

/** A seeded stream for the engine's small random choices (variants, positions); same sequence for the same seed. */
export function pickStream(seed) {
  let a = (seed ^ 0x9E3779B9) >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  return r;
}
