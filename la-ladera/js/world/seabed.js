// THE SEABED'S DRESSING (A5, round 7, phase 2c): a seagrass meadow and a coral patch (the "reef") on the floor of the bay, in ONE draw call. The art is one atlas (assets/textures/beach/seagrass_coral.png,
// 512 x 512, three upright cut-out cards in a 2 x 2 grid of 256 px cells: turtle grass, branching coral, brain coral) and every plant is two of its cards crossed, so it reads from every side: 4 triangles.
// There are no models and no new texture files; the water (engine/water.js) is drawn over all of it, so the plants are cut-outs of the opaque pass (alphaTest, with alpha-to-coverage under MSAA), never blended:
// the opaque pass is drawn whole before the blended one, so the water (blended, renderOrder -10) always lies over the plants and they need no renderOrder of their own (a blended card would have to sit under -10 and be sorted).
//
//   planSeabed(coast, sea, rng) -> { grass, reef, stats }      PURE (no THREE, no DOM): where every plant stands, from the coast, the sea's plan (beachsea.js) and one forked stream (ctx.rng.fork('seabed'))
//   grass  { x, y, z, h, yaw }             a tuft of turtle grass: its foot (y = the seabed less SEABED.sink, so it is rooted and never floats on a slope), its height (m), its turn
//   reef   { x, y, z, h, yaw, cell }       a coral head of the patch (sea.reef): cell is 'branching_coral' or 'brain_coral'
//   stats  { grass, reef, plants, tris, calls }   what the draw will cost: 4 triangles a plant, ONE mesh
//   seabedGeometry(plan) -> THREE.BufferGeometry      one geometry for every plant: position, normal (up: the material lights every card as if it faced the sky), uv (the card's content rectangle, not its cell),
//                                                      colour (a tint a plant, darker at the foot, bluer with depth the way coastmesh.js bedTone is), 16-bit index
//   bakeAtlas(rgba, size) -> mip levels                the atlas's pixels made fit for cut-outs: the colour under the transparent pixels is the colour of their neighbours (the file has white there, which a
//                                                      filter would draw as a pale fringe round every leaf), and every mip level is halved with the colour weighted by alpha (the white never creeps in as the levels go down)
//   loadSeabed(ctx, io) -> handle | null               ASYNC, the page: loads the atlas, plans, builds ONE Mesh in ONE group `props.seabed` (hidden when io.hidden, for LateWarm: beach.js lateSeabed) and writes
//                                                      ctx.world.seabed = { grass, reef, tris, calls, failed }. A texture that does not come ends without throwing: ctx.errors gets the reason and nothing is drawn.
//
// Where the plants go (SEABED): seagrass where the water over the seabed is 0.7 to 3.2 m deep, in MEADOWS (clusters, not a scatter): two flanks along the pier's piles (the pier is where swimmers go), a ring round
// the raft, and a handful of beds across the shallows; none within SEABED.clear (1 m) of a wall, a pile, a floor (the pier's deck, the raft's) or a sunken thing, so nothing grows through what stands there, and
// at most SEABED.grassMax (380) in all, no taller than the water over it allows (its tip stays SEABED.under, 0.1 m, below the still surface). The reef is SEABED.reefN (28) coral heads inside the patch's
// radius, the tall branching ones near its middle. Everything is on the seabed (coast.heightAt), in the swim zone.
// The cards are cut to the atlas's `contentRect` (assets/textures/manifest.beach.json), not stretched over the empty margin of their cell, and keep its aspect.
import * as THREE from 'three';
import { SEA, PIER, RAFT, XW, STOP_Z } from './coast.js';
import { polyDistPoint, segDist, ss, lerp } from './geom.js';
import { SIZE } from './waterlib.js';

export const ATLAS = Object.freeze({ file: 'seagrass_coral.png', size: 512, cut: 128 });          // cut: the alpha (of 255) the material's 0.5 alphaTest keeps
export const ATLAS_URL = new URL('../../assets/textures/beach/' + ATLAS.file, import.meta.url).href;

/**
 * A card's crop: `content` is the manifest's contentRect (px from the sheet's top left, y down), `uv` the same in the uv space of an image flipped on upload (v runs up: world/cards.js cellUV), `aspect` its
 * width over its height, `drop` the share of its height that goes under the seabed (a brain coral is a dome whose lower corners curve up, a card standing on its foot would hover at both ends of it).
 */
const cellOf = (id, rect, content, drop = 0) => {
  const [x, y, w, h] = content, S = ATLAS.size;
  return Object.freeze({ id, rect: Object.freeze(rect), content: Object.freeze(content), aspect: w / h, drop, uv: Object.freeze([x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S]) });
};
/** The atlas's three subjects (assets/textures/manifest.beach.json textures.seagrass_coral.cells: rect and contentRect; the fourth cell is unused). */
export const CELLS = Object.freeze({
  turtle_grass: cellOf('turtle_grass', [0, 0, 256, 256], [13, 6, 229, 244]),
  branching_coral: cellOf('branching_coral', [256, 0, 256, 256], [262, 29, 244, 198], 0.03),
  brain_coral: cellOf('brain_coral', [0, 256, 256, 256], [6, 290, 244, 188], 0.1),
});

export const SEABED = Object.freeze({
  depth: Object.freeze([0.7, 3.2]),                // m of water over the seabed where seagrass grows
  grassMax: 380,                                   // tufts in all (a plant is two crossed cards: 4 triangles)
  grassH: Object.freeze([0.35, 0.8]),              // m tall
  under: 0.1,                                      // m a tuft's tip stays under the still surface (the shallowest bed is 0.7 m deep and the tallest tuft 0.8). The swell (core/sea.js: 0.27 m calm, 0.55 m in the afternoon breeze) still dips below the tips of the shallowest in a trough, as it does on real seagrass
  reefN: 28, reefBranching: 17,                    // coral heads in the patch, and how many of them are branching (the rest are brain coral)
  branchingH: Object.freeze([0.4, 0.9]), brainH: Object.freeze([0.3, 0.5]),
  clear: 1.0,                                      // m kept clear of every wall (from its surface: the thickness is part of the thing), floor and sunken thing of the sea's plan
  sink: 0.01,                                      // m the foot is set into the seabed: a card 0.8 m wide on the 1:22 slope has its low end 2 cm under its middle's ground, and a rooted plant never hovers
  tris: 4, trisMax: 1800,                          // triangles a plant (two crossed quads), and the budget of the whole mesh
});

const f3 = (v) => +v.toFixed(3) + 0;                                                                   // (+ 0: a minus zero is not a number the layout should carry)
const hash01 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };   // a plant's own tint and turn, from where it stands

// ---------------------------------------------------------------------------------------------------------------------------------------------- the plan
export function planSeabed(coast, sea, rng) {
  const H = coast.heightAt, depthAt = (x, z) => SEA - H(x, z), { walls = [], floors = [], sunken = [], items = [], reef: patch = null } = sea;
  const [dMin, dMax] = SEABED.depth, grass = [], reef = [];
  const cap = Math.min(SEABED.grassMax, Math.floor(SEABED.trisMax / SEABED.tris) - SEABED.reefN);        // the tufts there may be: 380, and never so many that the mesh (4 triangles a plant, the coral included) is over its budget
  // what a plant keeps clear of: a wall (a pile, a hull, a skirt, a rail: its thickness is part of the thing), a floor (the pier's deck and head, the raft's: 0 inside it) and a sunken thing (its footprint's radius)
  const things = sunken.map((s) => { const it = items.find((i) => i.group === 'sunken' && Math.hypot(i.x - s.x, i.z - s.z) < 0.01), sz = it && SIZE[it.name]; return { x: s.x, z: s.z, r: sz ? Math.max(sz[0], sz[2]) / 2 : 1 }; });
  const gap = (x, z) => {
    let g = Infinity;
    for (const w of walls) g = Math.min(g, segDist(x, z, [w.x1, w.z1], [w.x2, w.z2]) - w.t);
    for (const f of floors) g = Math.min(g, polyDistPoint(f.pts, x, z));
    for (const t of things) g = Math.min(g, Math.hypot(x - t.x, z - t.z) - t.r);
    return g;
  };
  // a spacing grid: two tufts never stand on one spot (their cards would fight over the same pixels)
  const bins = new Map(), key = (i, j) => i * 4096 + j;
  const crowded = (x, z, d) => {
    const i = Math.floor(x / 0.5), j = Math.floor(z / 0.5);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of bins.get(key(i + a, j + b)) ?? []) if (Math.hypot(p[0] - x, p[1] - z) < d) return true;
    return false;
  };
  const claim = (x, z) => { const k = key(Math.floor(x / 0.5), Math.floor(z / 0.5)); (bins.get(k) ?? bins.set(k, []).get(k)).push([x, z]); };
  // the swim zone (coast.limit: the walls at XW - 0.4, the hard stop at STOP_Z - 0.5, with a margin), the water the grass likes (a hair inside its limits: the layout is rounded to the millimetre), clear of the patch, of what stands, of its neighbours
  const fit = (x, z) => {
    if (Math.abs(x) > XW - 6 || z > STOP_Z - 6) return false;
    const d = depthAt(x, z); if (d < dMin + 0.01 || d > dMax - 0.01) return false;
    if (patch && Math.hypot(x - patch.x, z - patch.z) < patch.r + 0.8) return false;
    return gap(x, z) >= SEABED.clear + 0.01 && !crowded(x, z, 0.3);
  };
  const rec = (x, z, h, extra = {}) => { const xr = f3(x), zr = f3(z); return { x: xr, y: f3(H(xr, zr) - SEABED.sink), z: zr, h: f3(h), yaw: f3(rng.range(0, Math.PI)), ...extra }; };

  // ---- the meadows: a tuft at a time round a centre, thinner and shorter towards the edge of the bed
  const sow = (cx, cz, sigma, n) => {
    for (let put = 0, tries = 0; put < n && tries < n * 14 && grass.length < cap; tries++) {
      const x = cx + rng.gauss() * sigma, z = cz + rng.gauss() * sigma;
      if (!fit(x, z)) continue;
      const edge = Math.min(1, Math.hypot(x - cx, z - cz) / (2.2 * sigma)), h = lerp(SEABED.grassH[1], SEABED.grassH[0] + 0.05, edge) + rng.range(-0.06, 0.06);
      const top = Math.min(SEABED.grassH[1], depthAt(x, z) - SEABED.under);                          // (a tuft in the wading depth is cut short: its tip stays under the still surface, not standing in the air)
      grass.push(rec(x, z, Math.max(SEABED.grassH[0], Math.min(top, h)))); claim(x, z); put++;
    }
  };
  // the pier: a stand beside every pile that is in swimming water, on the side away from the deck (nothing grows within a metre of the deck, so it is the flanks the swimmers pass along that are green)
  const piles = items.filter((i) => i.group === 'pile').sort((p, q) => p.z - q.z || p.x - q.x);
  for (const p of piles) if (depthAt(p.x, p.z) >= dMin + 0.3) sow(p.x + (Math.sign(p.x - PIER.x) || 1) * 2.3, p.z, 1.1, 5);
  // the raft: five beds round it, 4 m out
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < 5; k++) { const a = a0 + (k * Math.PI * 2) / 5 + rng.range(-0.3, 0.3); sow(RAFT.x + Math.cos(a) * 4, RAFT.z + Math.sin(a) * 4, 1.3, 9); }
  // the shallows: beds at least 14 m apart over z 158 to 205 (from the wading depth out to where a swimmer's eyes are well under the surface), each given an equal share of what is left of the budget
  const beds = [];
  for (let tries = 0; beds.length < 10 && tries < 600; tries++) {
    const x = rng.range(-88, 88), z = rng.range(158, 205);
    if (fit(x, z) && beds.every((b) => Math.hypot(b.x - x, b.z - z) > 14)) beds.push({ x, z, sigma: rng.range(1.6, 2.4) });
  }
  const share = Math.floor((cap - grass.length) / Math.max(1, beds.length));
  for (const b of beds) sow(b.x, b.z, b.sigma, share);

  // ---- the reef: the patch's coral heads, branching ones (the tall ones, near the middle) and brain coral, none nearer than 0.5 m to the next (the spacing relaxes if the disc is tight, so there are always reefN)
  if (patch) {
    const kinds = rng.shuffle([...Array(SEABED.reefBranching).fill('branching_coral'), ...Array(SEABED.reefN - SEABED.reefBranching).fill('brain_coral')]);
    const near = [];
    for (const cell of kinds) {
      let x = patch.x, z = patch.z, d = 0;
      for (let tries = 0, gapMin = 0.5; tries < 400; tries++) {
        if (tries && tries % 40 === 0) gapMin *= 0.8;
        d = patch.r * 0.9 * Math.sqrt(rng.next()); const a = rng.range(0, Math.PI * 2); x = patch.x + Math.cos(a) * d; z = patch.z + Math.sin(a) * d;
        if (near.every((p) => Math.hypot(p[0] - x, p[1] - z) >= gapMin)) break;
      }
      near.push([x, z]);
      const [lo, hi] = cell === 'brain_coral' ? SEABED.brainH : SEABED.branchingH, h = cell === 'brain_coral' ? rng.range(lo, hi) : lerp(hi, lo + 0.05, d / patch.r) + rng.range(-0.06, 0.06);
      reef.push(rec(x, z, Math.max(lo, Math.min(hi, h)), { cell }));
    }
  }
  const plants = grass.length + reef.length;
  return { grass, reef, stats: { grass: grass.length, reef: reef.length, plants, tris: plants * SEABED.tris, calls: plants ? 1 : 0 } };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- the geometry
/**
 * Every plant of the plan as two crossed quads in one BufferGeometry (world space, so the mesh sits at the origin). A quad is as tall as the plant and as wide as its card's content is (the atlas's aspect),
 * its foot on the plant's y (less its cell's `drop`, the share of the card that is under the seabed: 0.1 of a brain coral's, so the dome sits in the sand instead of on its curved lower corners). The normal is up for
 * every vertex (see loadSeabed's material). The colour: a tint a plant (from where it stands), a gradient from a darker foot, and the seabed's own
 * fall-off with depth (coastmesh.js bedTone: bluer and darker the deeper it lies), a little milder, so a plant is of the water it stands in.
 */
export function seabedGeometry(plan) {
  const list = [...plan.grass.map((p) => ({ ...p, cell: CELLS.turtle_grass })), ...plan.reef.map((p) => ({ ...p, cell: CELLS[p.cell] }))], n = list.length;
  const pos = new Float32Array(n * 24), nrm = new Float32Array(n * 24), uv = new Float32Array(n * 16), col = new Float32Array(n * 24), idx = new Uint16Array(n * 12);
  list.forEach((p, i) => {
    const hw = (p.h * p.cell.aspect) / 2, [u0, v0, u1, v1] = p.cell.uv, tint = 0.86 + 0.28 * hash01(p.x, p.z), dk = 1 - 0.3 * ss(0, 4.5, SEA - p.y), foot = p.cell.id === 'turtle_grass' ? 0.62 : 0.8;
    const mirror = i & 1, ua = mirror ? u1 : u0, ub = mirror ? u0 : u1, lo = -p.cell.drop * p.h, hi = lo + p.h;      // (lo: the card's lower edge, under the seabed by its drop)
    for (let q = 0; q < 2; q++) {                                                        // two cards, a quarter turn apart
      const a = p.yaw + (q * Math.PI) / 2, rx = Math.cos(a) * hw, rz = -Math.sin(a) * hw, v = (i * 2 + q) * 4;
      const corners = [[-rx, lo, -rz, ua, v0, foot], [rx, lo, rz, ub, v0, foot], [rx, hi, rz, ub, v1, 1], [-rx, hi, -rz, ua, v1, 1]];
      corners.forEach(([dx, dy, dz, u, vv, shade], k) => {
        const o = v + k;
        pos[o * 3] = p.x + dx; pos[o * 3 + 1] = p.y + dy; pos[o * 3 + 2] = p.z + dz; nrm[o * 3 + 1] = 1; uv[o * 2] = u; uv[o * 2 + 1] = vv;
        col[o * 3] = 0.9 * dk * tint * shade; col[o * 3 + 1] = 0.98 * dk * tint * shade; col[o * 3 + 2] = dk * tint * shade;
      });
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], (i * 2 + q) * 6);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.triangles = n * SEABED.tris;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- the atlas, made fit for cut-outs
/**
 * The colour of every pixel that is mostly clear is the colour of the nearest pixel that is not (a breadth-first bleed, 24 px at most): the file holds white under its transparent pixels (a palette with an
 * alpha table), and a texture filter mixes a texel with its neighbours' colours whatever their alpha, so every leaf and every coral tip would be drawn with a pale rim, and a dark one if the pixels came
 * through a canvas. The alpha is not touched. `px` is RGBA bytes, top row first; returns a copy.
 */
export function bleedColour(px, size = ATLAS.size) {
  const out = Uint8Array.from(px), n = size * size, dist = new Uint8Array(n).fill(255), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] >= ATLAS.cut) { dist[i] = 0; queue[tail++] = i; }
  const reach = (i, j, d) => { if (dist[j] <= d) return; dist[j] = d; out[j * 4] = out[i * 4]; out[j * 4 + 1] = out[i * 4 + 1]; out[j * 4 + 2] = out[i * 4 + 2]; queue[tail++] = j; };
  while (head < tail) {
    const i = queue[head++], d = dist[i] + 1, x = i % size;
    if (d > 24) continue;
    if (x > 0) reach(i, i - 1, d);
    if (x < size - 1) reach(i, i + 1, d);
    if (i >= size) reach(i, i - size, d);
    if (i < n - size) reach(i, i + size, d);
  }
  return out;
}

/** One level down: the mean of 2 x 2 texels, the colour weighted by alpha (a clear texel adds no colour; four clear ones average their colour), the alpha the plain mean. */
const halve = (src, w) => {
  const h = w >> 1, out = new Uint8Array(h * h * 4), row = w * 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    const o0 = (2 * y) * row + 8 * x, o1 = o0 + 4, o2 = o0 + row, o3 = o2 + 4, a0 = src[o0 + 3], a1 = src[o1 + 3], a2 = src[o2 + 3], a3 = src[o3 + 3], a = a0 + a1 + a2 + a3, k = (y * h + x) * 4;
    for (let c = 0; c < 3; c++) out[k + c] = a > 0 ? Math.round((src[o0 + c] * a0 + src[o1 + c] * a1 + src[o2 + c] * a2 + src[o3 + c] * a3) / a) : Math.round((src[o0 + c] + src[o1 + c] + src[o2 + c] + src[o3 + c]) / 4);
    out[k + 3] = Math.round(a / 4);
  }
  return out;
};

/**
 * Every mip level of the atlas, base first, down to 1 x 1, ready for a THREE.DataTexture (`mipmaps`): rows bottom first (the texture is not flipped on upload). Each level is the one above, halved with the colour
 * weighted by alpha, so what the file keeps under a clear pixel never creeps into a leaf's colour as the levels go down (a plain average of the raw file drifts from this atlas's olive to a washed-out 150, 131, 85 at
 * 16 px). The share of each cell that is over the cut is the art's own to keep: this art's blades and branches are broad and its edges crisp, so the chain keeps the three cells' 34%, 49% and 54% down to 16 px
 * (tests/world-seabed.test.mjs asserts it, so a thinner atlas would be noticed, not drawn as plants that vanish at 8 m). `px` is the bled base level (bleedColour), RGBA bytes, top row first. A generator,
 * one level a step, so the page can yield between them.
 */
export function* mipLevels(px, size = ATLAS.size) {
  const flip = (data, w) => { const out = new Uint8Array(data.length), row = w * 4; for (let y = 0; y < w; y++) out.set(data.subarray(y * row, (y + 1) * row), (w - 1 - y) * row); return out; };
  yield { data: flip(px, size), width: size, height: size };
  for (let w = size, cur = px; w > 1;) { cur = halve(cur, w); w >>= 1; yield { data: flip(cur, w), width: w, height: w }; }
}

/** The whole chain at once (a Node test, a caller with nothing to yield to). */
export const mipChain = (px, size = ATLAS.size) => [...mipLevels(px, size)];

/** bleedColour then mipChain: the pure whole. */
export const bakeAtlas = (px, size = ATLAS.size) => mipChain(bleedColour(px, size), size);

/** The texture of a baked chain: sRGB, trilinear, clamped, its own mip levels (no GPU generation), not flipped. */
export function atlasTexture(levels, anisotropy = 4) {
  const t = new THREE.DataTexture(levels[0].data, levels[0].width, levels[0].height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.mipmaps = levels; t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; t.flipY = false; t.needsUpdate = true;
  t.name = 'seabed.atlas';
  return t;
}

/**
 * The page's own loader: THREE.TextureLoader straight from the file (it is not a registered material, as engine/water.js loads its three), then the atlas baked off the frame in three slices (the pixels read,
 * the colour bled, the levels made: a few milliseconds each, a yield between) and handed over as a DataTexture. Where a canvas is not to be had the loaded texture is used as it is: fringes, but plants.
 * Rejects when the file does not come.
 */
async function loadAtlas(ctx, url) {
  const loaded = await new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, () => rej(new Error('seabed: cannot load ' + ATLAS.file))));
  const aniso = ctx.matlib?.anisotropy ?? ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4, pause = () => (ctx.yield ? ctx.yield() : Promise.resolve());
  try {
    const s = ATLAS.size, canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(loaded.image, 0, 0, s, s);
    const px = g.getImageData(0, 0, s, s).data;
    await pause();
    const bled = bleedColour(px, s), levels = [];
    await pause();
    for (const level of mipLevels(bled, s)) { levels.push(level); if (levels.length < 3) await pause(); }     // (the first two levels are the big ones: 2 ms or so each; the other eight together are less)
    loaded.dispose();
    return atlasTexture(levels, aniso);
  } catch (e) {
    loaded.colorSpace = THREE.SRGBColorSpace; loaded.anisotropy = aniso; loaded.wrapS = loaded.wrapT = THREE.ClampToEdgeWrapping; loaded.needsUpdate = true;
    return loaded;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- the page
/**
 * io: { hidden: leave the group hidden for the caller to show once it is warm (LateWarm), as the sea's pieces are,
 *       load: (url) => Promise<THREE.Texture> (the tests' door: the atlas without a browser; the default is loadAtlas), url: the atlas's address }
 * The material is a MeshStandardMaterial of the town's own look (the fog and its sun glow come with it: engine/shaderpatch.js) with the cut-out: alphaTest 0.5, alpha to coverage (the post chain's MSAA draws
 * its edges soft), double sided, vertex colours. Its normal is up whichever face is drawn (three flips the normal of a back face, which would light the far side of every card as a roof's underside: the same fix
 * world/props.js gives the low plants). It casts no shadow; it receives the sun's, as the seabed it stands on does.
 */
export async function loadSeabed(ctx, io = {}) {
  const sea = ctx.world?.beachSea, coast = ctx.plan?.coast;
  if (!sea || !coast) return null;
  if (ctx.seabed?.group?.parent) return ctx.seabed;
  const plan = planSeabed(coast, sea, ctx.rng.fork('seabed')), world = (ctx.world ??= {});
  if (!plan.stats.plants) return null;
  let texture;
  try { texture = await (io.load ?? ((url) => loadAtlas(ctx, url)))(io.url ?? ATLAS_URL); }
  catch (e) {
    const message = String(e?.message ?? e);
    (ctx.errors ??= []).push({ stage: 'seabed', message }); console.warn(message);
    world.seabed = { grass: 0, reef: 0, tris: 0, calls: 0, failed: [message] };
    return null;
  }
  const geometry = seabedGeometry(plan), material = new THREE.MeshStandardMaterial({
    map: texture, vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.3,
  });
  material.name = 'seabed.cards';
  const inherited = THREE.Material.prototype.onBeforeCompile;                         // (the look uniforms the fog reads: shaderpatch.js puts them on the prototype and an own hook would hide them)
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    inherited.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );');
  };
  material.customProgramCacheKey = () => 'seabed_cards_up';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'seabed.cards'; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = true; mesh.userData.noMerge = true;
  const group = new THREE.Group(); group.name = 'props.seabed'; group.userData.noMerge = true; group.visible = io.hidden !== true;
  group.add(mesh); ctx.scene.add(group);
  const stats = { grass: plan.stats.grass, reef: plan.stats.reef, tris: geometry.index.count / 3, calls: group.children.filter((o) => o.isMesh).length };
  world.seabed = { ...stats, failed: [] };
  const dispose = () => { ctx.scene.remove(group); geometry.dispose(); material.dispose(); texture.dispose(); if (ctx.seabed === handle) delete ctx.seabed; };
  const handle = { group, mesh, geometry, material, texture, plan, stats, dispose };
  ctx.seabed = handle;
  return handle;
}
