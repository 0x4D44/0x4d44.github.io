// THE FRONT OF THE BEACH, AS DATA (A5, round 7, phase 2a): where every fixture, prop and collider of the promenade and the sand stands. Pure: the coast plan (coast.js) and a seed in, plain records
// out, so a Node test and the page read the same layout and the colliders exist from the first frame, whatever the render loads when. beach.js turns the records into colliders and
// procedural meshes; beachprops.js instances the library ones (the Codex props, assets/models/manifest.beach_props.json) once that library is loaded.
//
//   planFront(coast) -> { items, groynes, solids, lamps, huts, palapas, posts, runs, stats }
//   items   { id, group, name, key, x, y, z, yaw, lod: [near, far] }   a library prop (key = the name in ctx.assets); yaw 0 faces +Z = south = the sea
//   groynes { id, group, name, key, x, y, z, yaw, scale, lod }         the rock lines outside the east and west walls (items of the same library, kept apart: they are not on the beach)
//   solids  { id, kind: 'rect' | 'post' | 'seg', ... }                 what stops a walker (kit.js rect / post / seg: a wall blocks only when its top is over 0.4 m above the feet)
//   lamps   { id, x, y, z }                                            promenade lamp posts (poles.js globePost: a real light each)
//   huts    { id, x, y, z, yaw, w, d, h }                              changing huts (procedural)
//   palapas { id, x, y, z, w, d, h }                                   thatched shelters with tables (procedural)
//   posts   { id, x, y, z, h }                                         the wooden posts of the sign plaques
// The pier (coast.js PIER, laid out by beachsea.js) keeps its corridor free, and so do the five boats hauled up on the sand (SAND_BOATS); the rock groynes at the two ends (outside the walls) are
// this library's too (the beach's `groyne_rock`s), so they are here.
import { makeRng } from '../core/rng.js';
import { DECK, DECK_Z, WALL_Z, XW, STAIR_FLIGHT, PIER, SAND_BOATS } from './coast.js';
import { assetKey, SIZE } from './beachlib.js';

export { PIER };
export const PLAQUE_Y = 1.36;                // a sign plaque (0.48 m tall) hangs this far above the ground on its 1.9 m post: its top is 0.06 m under the post's
const LOD = Object.freeze({ big: [70, 260], mid: [36, 130], small: [22, 80], tiny: [14, 46] });
const LOD_OF = (name) => (/^(kiosk|lifeguard_tower|palm_|volleyball_court|groyne_rock)/.test(name) ? 'big'
  : /^(towel|bag|cool_box|thermos|flipflop|bucket|sandcastle|ball|pool_ring|volleyball_ball|first_aid|rescue_buoy|shell|seaweed|sign_)/.test(name) ? (/^(shell|seaweed|flipflop|thermos|ball|bucket)/.test(name) ? 'tiny' : 'small') : 'mid');

export function planFront(coast, o = {}) {
  const rng = makeRng(((o.seed ?? coast.seed ?? 1) * 2654435761 + 4711) >>> 0), H = coast.heightAt;
  const items = [], groynes = [], solids = [], lamps = [], huts = [], palapas = [], posts = [], discs = [], n = {};
  const nid = (g) => `${g}.${(n[g] = (n[g] ?? -1) + 1)}`;
  const free = (x, z, r) => discs.every((d) => Math.hypot(d.x - x, d.z - z) >= d.r + r);
  const take = (x, z, r) => discs.push({ x, z, r });
  const inAccess = (x, z, m = 0) => coast.accesses.some((a) => Math.abs(x - a.x) <= a.w / 2 + 0.35 + m && z >= DECK_Z - 2.6 - m && z <= (a.kind === 'ramp' ? coast.rampEnd : STAIR_FLIGHT[1]) + 1.2 + m);
  const inPier = (x, z, m = 0) => Math.abs(x - PIER.x) <= PIER.w / 2 + m && z >= PIER.z0 - 1.5;
  const dry = (x, z) => z < coast.shoreZ(x) - 3;
  const onBoat = (x, z) => SAND_BOATS.some((b) => Math.abs(x - b.x) < 1.25 && Math.abs(z - b.z) < 3.05);       // (a hull is 1.8 x 5.5 m: the small things that need no free ground keep off it too)
  const make = (name, x, z, yaw, g, extra) => {
    const it = { id: nid(g), group: g, name, key: assetKey(name), x: +x.toFixed(3), y: +(extra.y ?? H(x, z)).toFixed(3), z: +z.toFixed(3), yaw: +yaw.toFixed(4), lod: LOD[LOD_OF(name)] };
    if (extra.scale) it.scale = extra.scale;
    return it;
  };
  const put = (name, x, z, yaw, g = name, extra = {}) => { const it = make(name, x, z, yaw, g, extra); items.push(it); return it; };
  const rect = (g, x, z, w, d, ry, h) => solids.push({ id: nid('solid.' + g), kind: 'rect', x: +x.toFixed(3), z: +z.toFixed(3), w, d, ry: +ry.toFixed(4), h });
  const post = (g, x, z, r, h) => solids.push({ id: nid('solid.' + g), kind: 'post', x: +x.toFixed(3), z: +z.toFixed(3), r, h });
  const seg = (g, x1, z1, x2, z2, h, t = 0.04) => solids.push({ id: nid('solid.' + g), kind: 'seg', x1: +x1.toFixed(3), z1: +z1.toFixed(3), x2: +x2.toFixed(3), z2: +z2.toFixed(3), h, t });
  const sizeOf = (name) => SIZE[name];

  // ---- the deck's runs: the stretches of the rail's side between the accesses, 1.6 m clear of every stair and the ramp
  const gaps = coast.accesses.map((a) => [a.x - a.w / 2 - 0.35 - 1.6, a.x + a.w / 2 + 0.35 + 1.6]).sort((p, q) => p[0] - q[0]), merged = [];
  for (const g of gaps) { const l = merged[merged.length - 1]; if (l && g[0] <= l[1]) l[1] = Math.max(l[1], g[1]); else merged.push([...g]); }
  const runs = []; { let x = -XW + 1; for (const [g0, g1] of merged) { if (g0 > x + 0.5) runs.push([x, g0]); x = Math.max(x, g1); } if (x < XW - 1) runs.push([x, XW - 1]); }

  // ---- the big things first, so the small ones keep out of their way
  // the boats hauled up on the sand (beachsea.js draws them): their ground is theirs, and a net lies drying in the gap between the first two and the third and fourth
  for (const b of SAND_BOATS) take(b.x, b.z, 3.4);
  for (const i of [0, 2]) { const a = SAND_BOATS[i], c = SAND_BOATS[i + 1]; put('fishing_net', (a.x + c.x) / 2, (a.z + c.z) / 2 - 1.4, rng.range(-0.5, 0.5), 'net'); }
  // kiosks: one at every `vend` post that stands at the wall's foot (the two walking vendors' beats are out on the sand)
  const KIOSK_SIGNS = ['cocadas', 'ceviche', 'jugos', 'helados', 'alquiler_tablas', 'cooperativa'];
  const kiosks = coast.pois.filter((p) => p.kind === 'vend' && p.z < 120);
  kiosks.forEach((p, i) => {
    const x = p.x, z = 111;
    put('kiosk', x, z, 0); rect('kiosk', x, z, 3.2, 3.2, 0, 3); take(x, z, 2.4);
    // the plaque on its own post at the kiosk's front corner, the chalkboard easel in front, a cart or a cooler stand beside
    const sx = x + 1.95, sz = 112.6; posts.push({ id: nid('post'), x: sx, y: H(sx, sz), z: sz, h: 1.9 }); post('signpost', sx, sz, 0.06, 1.9); take(sx, sz, 0.3);
    put('sign_' + KIOSK_SIGNS[i % KIOSK_SIGNS.length], sx, sz + 0.045, 0, 'sign', { y: H(sx, sz) + PLAQUE_Y });
    const ex = x - 0.9, ez = 113.5; put('sign_easel', ex, ez, 0.25); rect('easel', ex, ez, 0.74, 0.6, 0.25, 1.2); take(ex, ez, 0.5);
    if (i % 3 === 1) { const cx = x + 3.3, cz = 112.8; put('vendor_cart', cx, cz, 0.15); rect('cart', cx, cz, 1.6, 2, 0.15, 2.16); take(cx, cz, 1.2); }
    else { const cx = x + 2.7, cz = 112.6; put('cooler_stand', cx, cz, -0.2); rect('cooler', cx, cz, 0.9, 0.7, -0.2, 1.16); take(cx, cz, 0.6); }
    if (i % 2 === 0) { const t = put(`towel_${String(1 + (i * 5) % 12).padStart(2, '0')}_draped`, x - 2.5, 113.9, 0.5); rect('chair', t.x, t.z, 0.63, 0.7, 0.5, 0.96); take(t.x, t.z, 0.5); }
  });

  // the Plaza del Mar's neighbours: two bicycle racks on the deck's rear edge
  for (const x of [-19, 27]) if (free(x, 101.2, 1)) { put('bike_rack', x, 101.2, 0); rect('bikerack', x, 101.2, 1.8, 0.55, 0, 0.8); take(x, 101.2, 1); }

  // the lifeguard tower, with its flags, buoy and aid box, and its plaque
  { const x = 6, z = 128;
    put('lifeguard_tower', x, z, 0); rect('tower', x, z, 2.2, 2.2, 0, 3.6); take(x, z, 2.1);
    for (const [fx, fz, fy] of [[3.4, 126.6, 0.4], [9.2, 130.6, -0.3]]) { put('red_flag', fx, fz, fy); post('flag', fx, fz, 0.07, 2); take(fx, fz, 0.5); }
    put('rescue_buoy', 7.7, 130.0, 0.5); put('first_aid', 4.6, 129.9, -0.3); take(7.7, 130, 0.5); take(4.6, 129.9, 0.4);
    const sx = 10.4, sz = 127.4; posts.push({ id: nid('post'), x: sx, y: H(sx, sz), z: sz, h: 1.9 }); post('signpost', sx, sz, 0.06, 1.9); put('sign_salvavidas', sx, sz + 0.045, 0, 'sign', { y: H(sx, sz) + PLAQUE_Y }); take(sx, sz, 0.4);
  }

  // the volleyball court: a net across its middle (a wall to a walker), the ball on the sand
  { const x = -62, z = 126;
    put('volleyball_court', x, z, 0, 'court'); seg('net', x, z - 4.0, x, z + 4.0, 2.4); take(x, z, 8.6);
    put('volleyball_ball', x + 1.7, z + 1.4, 0); take(x + 1.7, z + 1.4, 0.2);
  }

  // two palapas at the ends, clear of the stairs that come down at x -90 and 70 (a walker coming down goes on south): a thatched roof on four posts, two tables
  for (const sx of [-1, 1]) {
    const x = sx * 95, z = 114.2; palapas.push({ id: nid('palapa'), x, y: H(x, z), z, w: 5.4, d: 5.4, h: 3.0 }); take(x, z, 3.4);
    for (const [px, pz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) post('palapa', x + px, z + pz, 0.11, 2.7);
    for (const tz of [-0.9, 0.9]) rect('table', x, z + tz, 1.5, 0.8, 0, 0.75);
  }

  // changing huts: two banks of four
  for (const cx of [-70, 58]) for (let i = 0; i < 4; i++) {
    const x = cx + (i - 1.5) * 1.35, z = 112.2; huts.push({ id: nid('hut'), x, y: H(x, z), z, yaw: 0, w: 1.2, d: 1.2, h: 2.25 }); rect('hut', x, z, 1.2, 1.2, 0, 2.25);
  }
  for (const cx of [-70, 58]) take(cx, 112.2, 3.3);

  // showers
  for (const [x, z] of [[-45, 116], [20, 116], [62, 116]]) { put('shower', x, z, 0); rect('shower', x, z, 0.44, 0.76, 0, 2.35); take(x, z, 0.8); }

  // ---- the promenade: lamps, benches, bins, drinking fountains along the rail
  const LZ = 106.4, BZ = 106.95;
  for (const [x0, x1] of runs) {
    const len = x1 - x0; if (len < 4) continue;
    const nl = Math.max(1, Math.round(len / 14));
    for (let i = 0; i < nl; i++) { const x = x0 + ((i + 0.5) * len) / nl; lamps.push({ id: nid('lamp'), x: +x.toFixed(3), y: DECK, z: LZ }); take(x, LZ, 0.5); }       // (the post's own collider is poles.js globePost's)
  }
  const benches = [];
  for (const [x0, x1] of runs) {
    const len = x1 - x0; if (len < 4) continue;
    const nb = Math.max(1, Math.round(len / 9));
    for (let j = 0; j < nb; j++) {
      const x = x0 + ((j + 0.5) * len) / nb;
      if (!free(x, BZ, 1.0)) continue;
      const b = put('bench', x, BZ, 0); rect('bench', x, BZ, 1.85, 0.66, 0, 0.92); take(x, BZ, 0.9); benches.push(b);        // (0.9, not 1.0: the bin 1.4 m along needs 0.45 of its own, and 1.0 + 0.45 shut every one out)
    }
  }
  benches.forEach((b, i) => { if (i % 2 === 0 && free(b.x + 1.4, BZ, 0.45)) { put('bin', b.x + 1.4, BZ, 0); post('bin', b.x + 1.4, BZ, 0.26, 0.96); take(b.x + 1.4, BZ, 0.45); } });
  for (const a of coast.stairs.filter((s) => s.w < 5).slice(1, 3)) { const x = a.x + a.w / 2 + 0.35 + 0.9; if (free(x, BZ, 0.5)) { put('fountain', x, BZ, 0); post('fountain', x, BZ, 0.25, 1.06); take(x, BZ, 0.5); } }

  // the stone course at the wall's foot (riprap), between the accesses
  for (let x = -XW + 1.2; x < XW - 1; x += 1.8) if (!inAccess(x, WALL_Z + 0.6, 0.9)) put('seawall_stones', x, WALL_Z + 0.55 + rng.range(-0.08, 0.08), rng.range(-0.06, 0.06), 'riprap');

  // ---- palms every 9 m in a loose line behind the kiosks
  for (let k = 0; k < 22; k++) {
    const x = -94.5 + 9 * k, z = 114.2 + rng.range(-0.8, 0.8);
    if (inPier(x, z, 1.4) || inAccess(x, z, 0.8) || !free(x, z, 1.0)) continue;
    put(k % 2 ? 'palm_small' : 'palm_large', x, z, rng.range(0, 6.2832), 'palm'); post('palm', x, z, 0.24, 5); take(x, z, 0.9);
  }

  // ---- the sunbathers: a lounger on every `lie` post, a second beside the first on sixteen of them, an umbrella for each pair and for four singles
  const lies = coast.pois.filter((p) => p.kind === 'lie');
  lies.forEach((p, i) => {
    const wood = i % 3 === 0, name = wood ? 'lounger_wood_canvas' : 'lounger_plastic_blue', sz = sizeOf(name);
    put(name, p.x, p.z, 0, 'lounger'); rect('lounger', p.x, p.z, sz[0], sz[2], 0, sz[1]); take(p.x, p.z, 1.0);
    if (i < 16) {
      const x2 = p.x + 0.95, z2 = p.z + rng.range(-0.15, 0.15);
      put(i % 2 ? 'lounger_wood_canvas' : 'lounger_plastic_blue', x2, z2, 0, 'lounger'); rect('lounger', x2, z2, 0.7, 1.95, 0, 0.9); take(x2, z2, 1.0);
      const px = p.x + 0.475, pz = p.z - 0.25;
      put(`parasol_0${1 + (i % 6)}_open`, px, pz, rng.range(0, 6.2832), 'parasol'); post('parasol', px, pz, 0.05, 2.3);
    } else if (i < 20) {
      const px = p.x + 0.7, pz = p.z - 0.3;
      put(`parasol_0${1 + (i % 6)}_open`, px, pz, rng.range(0, 6.2832), 'parasol'); post('parasol', px, pz, 0.05, 2.3);
    }
    if (i % 5 === 1) put(`bag_0${1 + (i % 4)}`, p.x - 0.75, p.z + 0.35, rng.range(-1, 1), 'bag');
    if (i % 6 === 2) put('cool_box', p.x - 0.8, p.z - 0.5, rng.range(-0.5, 0.5), 'cool');
    if (i % 8 === 3) put('thermos', p.x - 0.7, p.z + 0.8, 0, 'cool');
    if (i % 4 === 0) put('flipflops_pair', p.x + 0.2, p.z + 1.25, rng.range(-0.6, 0.6), 'shoes');
  });

  // ---- towels laid out on the dry sand, a bag by some, the odd pair of sandals; and the children's things nearer the water
  let tries = 0, towels = 0;
  while (towels < 18 && tries++ < 4000) {
    const x = rng.range(-94, 94), z = rng.range(115, 136);
    if (!dry(x, z) || inPier(x, z, 2.4) || inAccess(x, z, 1.2) || !free(x, z, 1.35)) continue;
    const yaw = (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.35, 0.35);
    put(`towel_${String(1 + (towels * 7) % 12).padStart(2, '0')}_flat`, x, z, yaw, 'towel'); take(x, z, 1.35); towels++;
    if (towels % 2 === 0) put(`bag_0${1 + (towels % 4)}`, x + Math.cos(yaw) * 0.9, z - Math.sin(yaw) * 0.9, rng.range(-1, 1), 'bag');
  }
  const kidThings = ['bucket_spade', 'sandcastle', 'bucket_spade', 'sandcastle', 'pool_ring_deflated', 'ball_buried', 'ball_buried', 'bucket_spade'];
  tries = 0; let k = 0;
  while (k < kidThings.length && tries++ < 2000) {
    const x = rng.range(-90, 90), z = rng.range(134, 141.5);
    if (!dry(x, z) || inPier(x, z, 2) || !free(x, z, 1.0)) continue;
    put(kidThings[k], x, z, rng.range(0, 6.2832), 'kids'); take(x, z, 0.8); k++;
  }

  // ---- the shore: driftwood and seaweed along the wrack line, shells on the wet sand
  tries = 0; let dw = 0;
  while (dw < 12 && tries++ < 2000) {
    const x = rng.range(-96, 96), z = coast.shoreZ(x) - rng.range(1.5, 8);
    if (inPier(x, z, 2) || !free(x, z, 0.9)) continue;
    put(`driftwood_${1 + (dw % 3)}`, x, z, rng.range(0, 6.2832), 'driftwood'); take(x, z, 0.9); dw++;
  }
  for (let i = 0; i < 28; i++) { const x = rng.range(-96, 96), z = coast.shoreZ(x) + rng.range(-1.6, 0.4); if (!inPier(x, z, 1.5) && !onBoat(x, z)) put('seaweed', x, z, rng.range(0, 6.2832), 'seaweed'); }
  for (let i = 0; i < 36; i++) { const x = rng.range(-96, 96), z = coast.shoreZ(x) - rng.range(0.3, 12); if (!inPier(x, z, 1.5) && !onBoat(x, z)) put(i % 3 ? 'shell_scallop' : 'shell_conch', x, z, rng.range(0, 6.2832), 'shell'); }

  // ---- the groynes: two lines of boulders along the outside of the east and west walls, from the promenade out into the sea (outside the physics walls: no collider; the rock sinks a quarter of its height)
  for (const s of [-1, 1]) for (let i = 0; i < 20; i++) {
    const z = 103 + i * 4.3 + rng.range(-0.6, 0.6), x = s * (100.9 + (i % 2) * 2.6 + rng.range(0, 1.2)), k = rng.range(1.25, 1.9);
    groynes.push(make(`groyne_rock_${1 + ((i * 7 + (s > 0 ? 1 : 0)) % 3)}`, x, z, rng.range(0, 6.2832), 'groyne', { y: H(x, z) - 0.25 * k, scale: [k, k, k] }));
  }

  const by = {}; for (const it of items) by[it.group] = (by[it.group] ?? 0) + 1;
  return { items, groynes, solids, lamps, huts, palapas, posts, runs, by, stats: { items: items.length, groynes: groynes.length, solids: solids.length, lamps: lamps.length, huts: huts.length, palapas: palapas.length, posts: posts.length } };
}
