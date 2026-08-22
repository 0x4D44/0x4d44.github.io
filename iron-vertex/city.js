// ============================================================
// Iron Vertex — the city.
//
// A street grid with a downtown on it, built on Chicago because Chicago
// is the city that invented this shape: a flat plain, a river through
// the middle, a rectilinear grid laid over the lot, and a cluster of
// very tall buildings where the land is dearest.
//
// Everything here is drawn from the same six typologies, which are the
// six things Chicago actually builds:
//
//   greystone     three-storey walk-up, stoop, bay window
//   masonry       brick mid-rise, cornice, fire escape
//   deck          open-deck parking garage — unglamorous, everywhere
//   setback       1920s wedding cake, stepped back as the zoning said
//   glass         Miesian curtain wall, black steel and a plaza
//   tube          bundled tube: nine square shafts, four heights
//   braced        tapered tower with X-bracing on the face
//
// The last two are the Willis and the Hancock, and they are not
// instanced along with the rest: there is one of each, sited by hand,
// because a skyline with forty Hancocks in it is not a skyline.
//
// PERFORMANCE. The whole city is about twenty draw calls. The streets
// are not geometry at all — they are one canvas texture on one plane,
// generated from the same grid constants the buildings are placed on,
// so a 2000-metre road network costs a single quad. Every building
// typology is one merged, vertex-coloured geometry drawn as one
// InstancedMesh with a per-instance tint and a non-uniform scale.
// Windows are baked into the typology as inset bands rather than being
// separate objects, which is what stops this being four thousand draws.
// ============================================================

import * as THREE from "./three.module.min.js";
import { NIGHT, canvasTexture, glowLit, instance, mergeParts, part, vertexLit } from "./mesh.js";

// ---- the grid --------------------------------------------------------
//
// Chicago's blocks are long east-west and short north-south, eight to
// the mile the short way. These are those, in metres, near enough.
export const BLOCK = { x: 112, z: 68 };
export const STREET = 22;          // ordinary street
export const AVENUE = 34;          // every fourth one is wider
const AVENUE_EVERY = 4;
export const CITY_RADIUS = 1150;   // how far the grid runs before it stops

// Where the tall stuff is. One dense core plus a smaller cluster north,
// which is roughly how Chicago's skyline is actually distributed.
//
// Neither is centred on the origin, and that is deliberate. The coaster
// is built at the origin, and the corridor it cuts deletes whatever it
// passes through — put the Loop there and the ride carves a hole
// through the middle of the tallest thing in the city. Offset, the
// coaster runs along the EDGE of downtown: towers on one side, mid-rise
// on the other, the skyline in shot from every camera and none of it
// missing a bite.
const CORE = { x: -300, z: -250, sigma: 300 };
const NEAR_NORTH = { x: 330, z: 400, sigma: 170 };

// The river, as a line the grid gets cut by: point + direction.
const RIVER = { x: -120, z: 40, dx: 0.80, dz: -0.60, halfWidth: 26 };

const SIDEWALK = 4.5;              // inset from the kerb to the building line

// ------------------------------------------------------------
// Grid arithmetic
// ------------------------------------------------------------

// Street width at index i: every fourth one is an avenue.
const widthAt = (i) => (((i % AVENUE_EVERY) + AVENUE_EVERY) % AVENUE_EVERY === 0 ? AVENUE : STREET);

// Centre lines of the streets, and the block spans between them, out to
// CITY_RADIUS either side of the origin. Returned as absolute metres so
// the road texture and the buildings cannot disagree about where a
// street is — they are both generated from this.
function gridLines(pitch, blockSize) {
  const lines = [];   // { at, width }
  const blocks = [];  // { from, to, index }
  let cursor = -CITY_RADIUS;
  let i = -Math.round(CITY_RADIUS / pitch);
  while (cursor < CITY_RADIUS) {
    const w = widthAt(i);
    lines.push({ at: cursor + w / 2, width: w });
    blocks.push({ from: cursor + w, to: cursor + w + blockSize, index: i });
    cursor += w + blockSize;
    i += 1;
  }
  return { lines, blocks };
}

export function cityGrid() {
  return {
    ew: gridLines(BLOCK.z + STREET, BLOCK.z),  // streets running east-west
    ns: gridLines(BLOCK.x + STREET, BLOCK.x),  // streets running north-south
  };
}

// Signed distance from the river's centre line, positive on one side.
const riverDistance = (x, z) =>
  (x - RIVER.x) * RIVER.dz - (z - RIVER.z) * RIVER.dx;

// How downtown a place is: 1 in the middle of the Loop, 0 out in the
// bungalow belt. Two gaussians, because a skyline with one peak looks
// like a graph rather than a city.
export function downtown(x, z) {
  const g = (c) => {
    const dx = x - c.x;
    const dz = z - c.z;
    return Math.exp(-(dx * dx + dz * dz) / (2 * c.sigma * c.sigma));
  };
  return Math.min(1, g(CORE) + g(NEAR_NORTH) * 0.78);
}

// ------------------------------------------------------------
// Building typologies
//
// Each is built to a UNIT cube — one metre wide, one tall, one deep,
// sitting on y = 0 — so a single instance matrix sets both its footprint
// and its height. That is what lets three hundred buildings of every
// size share one draw call.
//
// Which means every horizontal band has to be expressed as a fraction of
// the height, and a 200m tower and a 12m walk-up get the same NUMBER of
// bands rather than the same band SPACING. Floors are therefore drawn at
// a count passed in per typology and chosen to look right at that
// typology's usual size, which is the honest way round: a bundled tube
// is never 12m tall and a greystone is never 200.
// ------------------------------------------------------------

// The shell every typology's floors are hung on, slightly under size.
//
// This has to be smaller than the bands, and it is the whole trick. Draw
// the core at full size and inset the floor bands into it — which is the
// obvious way round, and the way I did it first — and the core is the
// only thing you ever see: every band is buried inside an opaque box.
// A glass tower came out as a featureless black slab, forty storeys of
// carefully modelled curtain wall completely invisible.
const CORE_SHELL = 0.968;

// A stack of floor bands standing proud of that shell: glass on the
// face, spandrel a little prouder still, so the facade has depth at a
// grazing angle and reads as floors from a mile away.
function floors(width, depth, from, to, count, glass, spandrel, relief = 0.012) {
  const parts = [];
  const span = to - from;
  if (span <= 0 || count < 1) return parts;
  const pitch = span / count;
  for (let i = 0; i < count; i++) {
    const y = from + pitch * (i + 0.5);
    // Both bands stand PROUD of the shell, and by different amounts.
    //
    // The glass used to be drawn at exactly the shell's width, which put
    // two opaque surfaces on the same plane — and coplanar surfaces do
    // not pick a winner, they fight, pixel by pixel, differently every
    // frame. From a moving camera the whole city crawled with it. There
    // are now three distinct radii: shell, glass, spandrel.
    parts.push(part(
      new THREE.BoxGeometry(width + relief, pitch * 0.62, depth + relief),
      glass,
      [0, y, 0],
      [1, 1, 1], [0, 0, 0],
      // Each floor gets its own glow value, so a building lights up
      // storey by storey rather than all at once.
      0.1 + ((i * 0.6180339887) % 1) * 0.9,
    ));
    parts.push(part(
      new THREE.BoxGeometry(width + relief * 2.6, pitch * 0.34, depth + relief * 2.6),
      spandrel,
      [0, y + pitch * 0.33, 0],
    ));
  }
  return parts;
}

// Vertical mullions: the thing that makes a curtain wall read as a
// curtain wall rather than as a painted box.
function mullions(width, depth, from, to, count, colour) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    parts.push(part(new THREE.BoxGeometry(0.014, to - from, depth * 1.004), colour,
      [t * width, (from + to) / 2, 0]));
    parts.push(part(new THREE.BoxGeometry(width * 1.004, to - from, 0.014), colour,
      [0, (from + to) / 2, t * depth]));
  }
  return parts;
}

const PALETTE = {
  limestone: 0xd8d2c4,
  terracotta: 0xc08a63,
  brick: 0x9c5a44,
  brickDark: 0x7c4436,
  grey: 0x9aa0a6,
  greyDark: 0x6d737a,
  blackSteel: 0x2b2f34,
  bronze: 0x6a5a42,
  glassBlue: 0x86a8c4,
  glassGreen: 0x7f9e94,
  glassDark: 0x39434d,
  concrete: 0xb9b7b0,
  roof: 0x4a4f55,
};

function greystoneGeo() {
  const parts = [
    part(new THREE.BoxGeometry(CORE_SHELL, 1, CORE_SHELL), PALETTE.limestone, [0, 0.5, 0]),
    ...floors(CORE_SHELL, CORE_SHELL, 0.06, 0.94, 3, PALETTE.glassDark, PALETTE.limestone, 0.02),
    // Bay window on the street face, and the stoop up to a raised door.
    part(new THREE.BoxGeometry(0.34, 0.62, 0.16), PALETTE.limestone, [-0.16, 0.5, 0.54]),
    part(new THREE.BoxGeometry(0.28, 0.5, 0.02), PALETTE.glassDark, [-0.16, 0.5, 0.63]),
    part(new THREE.BoxGeometry(0.2, 0.13, 0.18), PALETTE.grey, [0.22, 0.07, 0.55]),
    part(new THREE.BoxGeometry(0.16, 0.28, 0.03), 0x3a2b22, [0.22, 0.27, 0.52]),
    // Cornice.
    part(new THREE.BoxGeometry(1.06, 0.05, 1.06), PALETTE.limestone, [0, 0.97, 0]),
  ];
  return mergeParts(parts);
}

// Brick is the default and painted stone is the variant, and having
// both matters more than it sounds. A street of one typology in one
// colour reads as wallpaper however well modelled each building is;
// splitting the mid-rises across two palettes is one extra draw call
// and it is the difference between a street and a texture.
function masonryGeo(face = PALETTE.brick, trim = PALETTE.brickDark) {
  const parts = [
    part(new THREE.BoxGeometry(CORE_SHELL, 1, CORE_SHELL), face, [0, 0.5, 0]),
    ...floors(CORE_SHELL, CORE_SHELL, 0.10, 0.92, 5, PALETTE.glassDark, face, 0.016),
    // A shop front at street level, and a string course above it.
    part(new THREE.BoxGeometry(0.96, 0.075, 1.005), 0x24282c, [0, 0.05, 0]),
    part(new THREE.BoxGeometry(1.02, 0.02, 1.02), trim, [0, 0.10, 0]),
    // Fire escape down one face: three landings and the ladders between.
    ...[0.3, 0.52, 0.74].flatMap((y) => [
      part(new THREE.BoxGeometry(0.34, 0.012, 0.07), PALETTE.blackSteel, [0.2, y, 0.53]),
      part(new THREE.BoxGeometry(0.34, 0.07, 0.012), PALETTE.blackSteel, [0.2, y + 0.035, 0.565]),
      part(new THREE.BoxGeometry(0.02, 0.22, 0.02), PALETTE.blackSteel, [0.06, y - 0.11, 0.55]),
    ]),
    // Bracketed cornice: the one detail that dates a building to 1890.
    part(new THREE.BoxGeometry(1.08, 0.045, 1.08), trim, [0, 0.955, 0]),
    part(new THREE.BoxGeometry(1.03, 0.03, 1.03), face, [0, 0.985, 0]),
  ];
  return mergeParts(parts);
}

function deckGeo() {
  // An open-deck garage: slabs with a gap between them and a spandrel
  // rail, so you can see straight through it. Ugly, ubiquitous, and it
  // breaks up a street of glass better than another tower would.
  const parts = [];
  const levels = 5;
  for (let i = 0; i < levels; i++) {
    const y = 0.04 + (i / levels) * 0.94;
    parts.push(part(new THREE.BoxGeometry(1, 0.035, 1), PALETTE.concrete, [0, y, 0]));
    parts.push(part(new THREE.BoxGeometry(1.01, 0.03, 1.01), PALETTE.greyDark, [0, y + 0.05, 0]));
  }
  for (const [sx, sz] of [[-0.485, 0], [0.485, 0], [0, -0.485], [0, 0.485]]) {
    parts.push(part(new THREE.BoxGeometry(sx ? 0.03 : 1, 1, sz ? 0.03 : 1), PALETTE.concrete,
      [sx, 0.5, sz], [1, 1, 1]));
  }
  // Corner columns and a stair core.
  for (const sx of [-0.46, 0.46]) {
    for (const sz of [-0.46, 0.46]) {
      parts.push(part(new THREE.BoxGeometry(0.07, 1, 0.07), PALETTE.concrete, [sx, 0.5, sz]));
    }
  }
  parts.push(part(new THREE.BoxGeometry(0.22, 1.06, 0.22), PALETTE.greyDark, [0.36, 0.53, -0.36]));
  return mergeParts(parts);
}

function setbackGeo() {
  // The 1920s wedding cake. The zoning ordinance said a tower could only
  // keep going up if it stepped back from the street, so it did — three
  // times — and then put a crown on it.
  const parts = [
    part(new THREE.BoxGeometry(CORE_SHELL, 0.52, CORE_SHELL), PALETTE.limestone, [0, 0.26, 0]),
    ...floors(CORE_SHELL, CORE_SHELL, 0.05, 0.50, 7, PALETTE.glassDark, PALETTE.limestone, 0.008),
    part(new THREE.BoxGeometry(1.04, 0.022, 1.04), PALETTE.terracotta, [0, 0.52, 0]),

    part(new THREE.BoxGeometry(0.70, 0.28, 0.70), PALETTE.limestone, [0, 0.66, 0]),
    ...floors(0.70, 0.70, 0.53, 0.79, 4, PALETTE.glassDark, PALETTE.limestone, 0.008),
    part(new THREE.BoxGeometry(0.76, 0.02, 0.76), PALETTE.terracotta, [0, 0.80, 0]),

    part(new THREE.BoxGeometry(0.44, 0.15, 0.44), PALETTE.limestone, [0, 0.875, 0]),
    ...floors(0.44, 0.44, 0.80, 0.94, 3, PALETTE.glassDark, PALETTE.limestone, 0.006),
    // Crown: a stepped lantern with a flagpole.
    part(new THREE.BoxGeometry(0.3, 0.045, 0.3), PALETTE.terracotta, [0, 0.965, 0]),
    part(new THREE.BoxGeometry(0.17, 0.05, 0.17), PALETTE.limestone, [0, 1.005, 0]),
    part(new THREE.ConeGeometry(0.10, 0.09, 4), PALETTE.bronze, [0, 1.07, 0]),
    part(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4), PALETTE.grey, [0, 1.15, 0]),
  ];
  return mergeParts(parts);
}

function glassGeo() {
  // Miesian: a black steel frame, a lot of glass, and a plaza scooped
  // out of the bottom two floors so the tower reads as standing on legs.
  const parts = [
    part(new THREE.BoxGeometry(CORE_SHELL, 1, CORE_SHELL), PALETTE.glassDark, [0, 0.5, 0]),
    ...floors(CORE_SHELL, CORE_SHELL, 0.055, 0.965, 13, PALETTE.glassBlue, PALETTE.blackSteel, 0.008),
    ...mullions(1.0, 1.0, 0.055, 0.965, 4, PALETTE.blackSteel),
    // The recessed base: darker, set in, on visible columns.
    part(new THREE.BoxGeometry(0.86, 0.05, 0.86), 0x1c2025, [0, 0.028, 0]),
    ...[[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44], [0, -0.44], [0, 0.44]]
      .map(([px, pz]) => part(new THREE.BoxGeometry(0.045, 0.06, 0.045), PALETTE.blackSteel,
        [px, 0.028, pz])),
    // Flat roof with plant and a window-washing rig.
    part(new THREE.BoxGeometry(1.01, 0.012, 1.01), PALETTE.blackSteel, [0, 0.972, 0]),
    part(new THREE.BoxGeometry(0.3, 0.028, 0.42), PALETTE.grey, [0.12, 0.99, -0.08]),
    part(new THREE.BoxGeometry(0.06, 0.05, 0.5), PALETTE.greyDark, [-0.3, 1.0, 0.1]),
  ];
  return mergeParts(parts);
}

function towerBundleGeo() {
  // Nine square tubes on a three-by-three, dropping out at four
  // different heights. The profile is the whole point and it is a
  // profile nobody else has.
  const heights = [
    [0.62, 0.90, 0.62],
    [0.90, 1.00, 0.90],
    [0.62, 0.90, 0.74],
  ];
  const parts = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const h = heights[i][j];
      const x = (i - 1) / 3;
      const z = (j - 1) / 3;
      parts.push(part(new THREE.BoxGeometry(1 / 3, h, 1 / 3), 0x22262b, [x, h / 2, z]));
      // Belt trusses where the tubes are braced, and the black anodised
      // banding between them.
      for (const band of [0.22, 0.44, 0.66, 0.88]) {
        if (band > h) continue;
        parts.push(part(new THREE.BoxGeometry(1 / 3 + 0.012, 0.016, 1 / 3 + 0.012),
          PALETTE.blackSteel, [x, h * (band / h) * 0 + band, z]));
      }
      parts.push(part(new THREE.BoxGeometry(1 / 3 + 0.008, 0.012, 1 / 3 + 0.008),
        PALETTE.greyDark, [x, h, z]));
    }
  }
  // Vertical glazing lines, and the two antennae.
  for (let i = 0; i < 3; i++) {
    for (const j of [-1, 0, 1]) {
      parts.push(part(new THREE.BoxGeometry(0.006, 0.62, 1.002), PALETTE.glassBlue,
        [(i - 1) / 3 + j * 0.055, 0.31, 0]));
    }
  }
  parts.push(part(new THREE.CylinderGeometry(0.008, 0.014, 0.30, 5), PALETTE.grey, [-0.10, 1.15, 0]));
  parts.push(part(new THREE.CylinderGeometry(0.008, 0.014, 0.30, 5), PALETTE.grey, [0.10, 1.15, 0]));
  return mergeParts(parts);
}

function tokenBracedGeo() {
  // Tapered, black, and X-braced on every face. The batter is what makes
  // it: wide at the bottom, narrow at the top, so the bracing is not
  // decoration but the reason it stands up.
  const parts = [];
  const at = (t) => 0.5 - 0.24 * t;    // half-width at height fraction t
  const tiers = 6;
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers;
    const t1 = (k + 1) / tiers;
    const w0 = at(t0) * 2;
    const w1 = at(t1) * 2;
    const mid = (w0 + w1) / 2;
    parts.push(part(new THREE.BoxGeometry(mid, 1 / tiers, mid), 0x1e2227,
      [0, (t0 + t1) / 2, 0]));
    parts.push(part(new THREE.BoxGeometry(mid * 1.008, 0.008, mid * 1.008), PALETTE.grey,
      [0, t1, 0]));
    // The X on each of the four faces, as two rotated slabs.
    const rise = 1 / tiers;
    const angle = Math.atan2(rise, mid);
    const len = Math.hypot(rise, mid);
    for (const [ox, oz, ry] of [[0, mid / 2, 0], [0, -mid / 2, 0], [mid / 2, 0, Math.PI / 2], [-mid / 2, 0, Math.PI / 2]]) {
      for (const sign of [1, -1]) {
        parts.push(part(
          new THREE.BoxGeometry(len, 0.016, 0.012),
          PALETTE.grey,
          [ox, (t0 + t1) / 2, oz],
          [1, 1, 1],
          [0, ry, sign * angle],
        ));
      }
    }
    // Glazing between the braces.
    parts.push(part(new THREE.BoxGeometry(mid * 0.99, rise * 0.8, mid * 0.99), PALETTE.glassDark,
      [0, (t0 + t1) / 2, 0]));
  }
  const top = at(1) * 2;
  parts.push(part(new THREE.BoxGeometry(top * 1.05, 0.014, top * 1.05), PALETTE.greyDark, [0, 1.0, 0]));
  for (const ox of [-0.05, 0.05]) {
    parts.push(part(new THREE.CylinderGeometry(0.005, 0.011, 0.34, 5), PALETTE.grey, [ox, 1.17, 0]));
  }
  return mergeParts(parts);
}

// Roof clutter, instanced separately and dropped on flat-topped
// buildings: the water tanks, plant rooms and aerials that stop a
// skyline looking like a bar chart.
function roofKitGeo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 9), 0x6b4b34, [0, 0.95, 0]),
    part(new THREE.ConeGeometry(0.56, 0.3, 9), 0x5a3f2c, [0, 1.55, 0]),
    ...[0, 1, 2, 3].map((i) => part(
      new THREE.BoxGeometry(0.08, 0.5, 0.08), 0x4a3a2c,
      [Math.cos((i / 4) * Math.PI * 2) * 0.42, 0.25, Math.sin((i / 4) * Math.PI * 2) * 0.42],
    )),
  ]);
}

function plantGeo() {
  return mergeParts([
    part(new THREE.BoxGeometry(1.6, 0.7, 1.1), PALETTE.grey, [0, 0.35, 0]),
    part(new THREE.BoxGeometry(1.68, 0.09, 1.18), PALETTE.greyDark, [0, 0.72, 0]),
    part(new THREE.CylinderGeometry(0.32, 0.32, 0.34, 8), 0x8d949b, [0.45, 0.92, 0]),
    part(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5), 0xb0b6bd, [-0.55, 1.1, 0.3]),
  ]);
}

// ------------------------------------------------------------
// The streets, as one texture
//
// A two-kilometre road network drawn as geometry is thousands of
// triangles and, worse, a lot of draw calls. Drawn as a canvas texture
// on a single plane it is one quad — and because the canvas is painted
// from the same gridLines() the buildings are placed on, the kerbs land
// exactly where the building line stops. No alignment to maintain.
// ------------------------------------------------------------

const TEXTURE_SIZE = 2048;

function streetTexture(grid) {
  const span = CITY_RADIUS * 2;
  const toPx = (metres) => ((metres + CITY_RADIUS) / span) * TEXTURE_SIZE;
  const scale = TEXTURE_SIZE / span;

  return canvasTexture(TEXTURE_SIZE, TEXTURE_SIZE, (ctx) => {
    // Blocks are paved; the roads are cut out of the paving.
    ctx.fillStyle = "#8d8b85";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    // Asphalt.
    const road = (at, width, horizontal) => {
      const w = width * scale;
      ctx.fillStyle = "#3a3b3e";
      if (horizontal) ctx.fillRect(0, toPx(at) - w / 2, TEXTURE_SIZE, w);
      else ctx.fillRect(toPx(at) - w / 2, 0, w, TEXTURE_SIZE);
    };
    for (const line of grid.ew.lines) road(line.at, line.width, true);
    for (const line of grid.ns.lines) road(line.at, line.width, false);

    // Kerbs: a pale edge either side of every carriageway.
    ctx.strokeStyle = "#b6b3aa";
    ctx.lineWidth = Math.max(1, 0.7 * scale);
    const kerb = (at, width, horizontal) => {
      for (const side of [-1, 1]) {
        const p = toPx(at + (side * width) / 2);
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(0, p); ctx.lineTo(TEXTURE_SIZE, p); }
        else { ctx.moveTo(p, 0); ctx.lineTo(p, TEXTURE_SIZE); }
        ctx.stroke();
      }
    };
    for (const line of grid.ew.lines) kerb(line.at, line.width, true);
    for (const line of grid.ns.lines) kerb(line.at, line.width, false);

    // Lane markings, dashed, down the middle of the wide ones only —
    // a narrow street in the Loop is one lane each way and unmarked.
    ctx.strokeStyle = "#d8cf7a";
    ctx.lineWidth = Math.max(1, 0.35 * scale);
    ctx.setLineDash([6 * scale, 6 * scale]);
    for (const line of grid.ew.lines) {
      if (line.width < AVENUE) continue;
      ctx.beginPath(); ctx.moveTo(0, toPx(line.at)); ctx.lineTo(TEXTURE_SIZE, toPx(line.at)); ctx.stroke();
    }
    for (const line of grid.ns.lines) {
      if (line.width < AVENUE) continue;
      ctx.beginPath(); ctx.moveTo(toPx(line.at), 0); ctx.lineTo(toPx(line.at), TEXTURE_SIZE); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Crossings at every junction — the detail that makes it read as a
    // city rather than as a circuit board.
    ctx.fillStyle = "#cfcdc6";
    for (const ew of grid.ew.lines) {
      for (const ns of grid.ns.lines) {
        if (Math.hypot(ew.at, ns.at) > CITY_RADIUS * 0.75) continue;
        const bars = 5;
        for (let b = 0; b < bars; b++) {
          const t = (b + 0.5) / bars - 0.5;
          // Across the east-west street, either side of the junction.
          for (const side of [-1, 1]) {
            ctx.fillRect(
              toPx(ns.at + side * (ns.width / 2 + 3.2)) - 0.9 * scale,
              toPx(ew.at + t * ew.width * 0.86) - 0.55 * scale,
              1.8 * scale, 1.1 * scale,
            );
            ctx.fillRect(
              toPx(ns.at + t * ns.width * 0.86) - 0.55 * scale,
              toPx(ew.at + side * (ew.width / 2 + 3.2)) - 0.9 * scale,
              1.1 * scale, 1.8 * scale,
            );
          }
        }
      }
    }

    // The river, painted straight over the grid: it was there first.
    ctx.save();
    ctx.translate(toPx(RIVER.x), toPx(RIVER.z));
    ctx.rotate(Math.atan2(RIVER.dz, RIVER.dx));
    ctx.fillStyle = "#3c5a63";
    ctx.fillRect(-TEXTURE_SIZE, -RIVER.halfWidth * scale, TEXTURE_SIZE * 2, RIVER.halfWidth * 2 * scale);
    ctx.fillStyle = "#6d6a62";
    ctx.fillRect(-TEXTURE_SIZE, -(RIVER.halfWidth + 3) * scale, TEXTURE_SIZE * 2, 3 * scale);
    ctx.fillRect(-TEXTURE_SIZE, RIVER.halfWidth * scale, TEXTURE_SIZE * 2, 3 * scale);
    ctx.restore();
  }, [1, 1]);
}

// ------------------------------------------------------------
// The elevated
//
// Chicago's one unmistakable piece of street furniture, and a railway,
// which this repository was always going to build given the chance. Two
// tracks on plate girders on steel bents, running a rectangle round the
// core at fourth-floor height, with a train on it.
// ------------------------------------------------------------

const L_HEIGHT = 11.5;
const L_GAUGE = 1.435 * 3;   // two tracks, spaced

function elevatedRoute(grid) {
  // Follow four streets that bound the core, so the structure sits over
  // a carriageway rather than through a building.
  const pick = (lines, target) =>
    lines.reduce((best, l) => (Math.abs(l.at - target) < Math.abs(best.at - target) ? l : best));
  const west = pick(grid.ns.lines, -260);
  const east = pick(grid.ns.lines, 250);
  const north = pick(grid.ew.lines, -240);
  const south = pick(grid.ew.lines, 230);
  return [
    { x: west.at, z: north.at }, { x: east.at, z: north.at },
    { x: east.at, z: south.at }, { x: west.at, z: south.at },
  ];
}

function buildElevated(route, groundHeight) {
  const group = new THREE.Group();
  const bents = [];
  const girders = [];
  const rails = [];
  const path = [];

  for (let i = 0; i < route.length; i++) {
    const a = route[i];
    const b = route[(i + 1) % route.length];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.round(span / 16));
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      path.push({ x, z, heading });
      bents.push({ x, y: groundHeight(x, z), z, ry: heading, s: 1 });
      girders.push({ x, y: groundHeight(x, z) + L_HEIGHT, z, ry: heading, sx: 1, sy: 1, sz: span / steps + 0.4 });
      rails.push({ x, y: groundHeight(x, z) + L_HEIGHT, z, ry: heading, sx: 1, sy: 1, sz: span / steps + 0.4 });
    }
  }

  // A bent: two columns, a cross head, and the knee braces.
  const bentGeo = mergeParts([
    ...[-1, 1].map((side) => part(new THREE.BoxGeometry(0.5, L_HEIGHT, 0.5), PALETTE.blackSteel,
      [side * (L_GAUGE + 1.1), L_HEIGHT / 2, 0])),
    part(new THREE.BoxGeometry((L_GAUGE + 1.1) * 2 + 1.2, 0.7, 0.55), PALETTE.blackSteel,
      [0, L_HEIGHT - 0.35, 0]),
    ...[-1, 1].map((side) => part(new THREE.BoxGeometry(2.4, 0.28, 0.4), 0x33383e,
      [side * (L_GAUGE + 0.1), L_HEIGHT - 1.35, 0], [1, 1, 1], [0, 0, side * 0.62])),
  ]);
  // Longitudinal plate girders and the timber deck between them.
  const girderGeo = mergeParts([
    ...[-1, 1].map((side) => part(new THREE.BoxGeometry(0.22, 1.5, 1), 0x3a4046,
      [side * (L_GAUGE + 1.0), 0.4, 0])),
    part(new THREE.BoxGeometry((L_GAUGE + 1.0) * 2, 0.22, 1), 0x4a4034, [0, -0.2, 0]),
    // Handrail, because a viaduct without one looks unfinished.
    ...[-1, 1].map((side) => part(new THREE.BoxGeometry(0.06, 0.06, 1), 0x585f66,
      [side * (L_GAUGE + 1.05), 1.25, 0])),
  ]);
  // Four rails: two tracks.
  const railGeo = mergeParts(
    [-L_GAUGE - 0.72, -L_GAUGE + 0.72, L_GAUGE - 0.72, L_GAUGE + 0.72].map((ox) =>
      part(new THREE.BoxGeometry(0.09, 0.13, 1), 0x8a8f96, [ox, 0.06, 0])),
  );

  const steel = vertexLit();
  group.add(instance(bentGeo, steel, bents));
  group.add(instance(girderGeo, steel, girders));
  group.add(instance(railGeo, steel, rails, { shadows: false }));

  // The train: four cars, stainless, corrugated, running the loop.
  const carGeo = mergeParts([
    part(new THREE.BoxGeometry(2.6, 2.5, 14), 0xb9bec4, [0, 1.45, 0]),
    part(new THREE.BoxGeometry(2.64, 0.5, 14), 0x8f959c, [0, 2.45, 0]),
    ...Array.from({ length: 9 }, (_, i) => part(new THREE.BoxGeometry(2.66, 0.9, 1.5),
      0x9fb4c4, [0, 1.75, -6 + i * 1.5], [1, 1, 1], [0, 0, 0], 0.7 + (i % 3) * 0.1)),
    part(new THREE.BoxGeometry(2.3, 0.9, 0.1), 0xfff0cc, [0, 1.75, 7.0], [1, 1, 1], [0, 0, 0], 0.99),
    ...[-1, 1].flatMap((s) => [-4.6, 4.6].map((z) => part(
      new THREE.CylinderGeometry(0.36, 0.36, 0.16, 8), 0x24282c,
      [s * 1.0, 0.36, z], [1, 1, 1], [0, 0, Math.PI / 2]))),
    part(new THREE.BoxGeometry(1.9, 0.14, 0.5), 0x3a4046, [0, 3.0, -5.5]),
  ]);
  const cars = new THREE.InstancedMesh(carGeo, glowLit(), 4);
  cars.castShadow = true;
  group.add(cars);

  return { group, cars, path };
}

// ------------------------------------------------------------
// The river, and the bridges over it
// ------------------------------------------------------------

function buildRiver(grid, groundHeight) {
  const group = new THREE.Group();
  const heading = Math.atan2(RIVER.dz, RIVER.dx);

  // The water itself, as a long ribbon under the road texture's channel.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_RADIUS * 2.6, RIVER.halfWidth * 2),
    new THREE.MeshPhongMaterial({ color: 0x2f4d57, shininess: 90, specular: 0x88a8b8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.rotation.z = -heading;
  water.position.set(RIVER.x, groundHeight(RIVER.x, RIVER.z) - 3.4, RIVER.z);
  water.receiveShadow = true;
  group.add(water);

  // Where the north-south streets cross it, put a bascule bridge: a
  // trunnion tower each side, counterweights, and a deck. Chicago has
  // more movable bridges than anywhere, and they all look like this.
  const decks = [];
  const towers = [];
  for (const line of grid.ns.lines) {
    // Solve for the point where this street meets the river's centreline.
    const t = ((line.at - RIVER.x) * RIVER.dz - (0 - RIVER.z) * RIVER.dx);
    const z = RIVER.z + ((line.at - RIVER.x) * RIVER.dz) / RIVER.dx;
    if (!Number.isFinite(z) || Math.hypot(line.at, z) > CITY_RADIUS * 0.6) continue;
    if (line.width < AVENUE) continue;
    void t;
    const y = groundHeight(line.at, z);
    decks.push({ x: line.at, y: y + 1.0, z, sx: line.width, sy: 1, sz: RIVER.halfWidth * 2.4, ry: -heading });
    for (const side of [-1, 1]) {
      towers.push({
        x: line.at - RIVER.dx * side * (RIVER.halfWidth + 5),
        y: y + 1.0,
        z: z - RIVER.dz * side * (RIVER.halfWidth + 5),
        ry: -heading, s: 1,
      });
    }
  }

  const deckGeoM = mergeParts([
    part(new THREE.BoxGeometry(1, 0.5, 1), 0x53565b, [0, 0, 0]),
    part(new THREE.BoxGeometry(1.02, 0.9, 0.08), 0x6a7076, [0, 0.6, 0.5]),
    part(new THREE.BoxGeometry(1.02, 0.9, 0.08), 0x6a7076, [0, 0.6, -0.5]),
  ]);
  const towerGeoM = mergeParts([
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.6, 12, 0.6), 0x4d5359, [s * 5.5, 6, 0])),
    part(new THREE.BoxGeometry(12, 0.7, 0.7), 0x4d5359, [0, 12, 0]),
    part(new THREE.BoxGeometry(3.2, 3.2, 2.2), 0x3c4247, [0, 9.4, 0]),
    part(new THREE.BoxGeometry(1.6, 1.6, 1.6), 0x2f3439, [0, 3.2, 0]),
  ]);
  const steel = vertexLit();
  if (decks.length) group.add(instance(deckGeoM, steel, decks));
  if (towers.length) group.add(instance(towerGeoM, steel, towers));
  return { group, spans: decks };
}

// ------------------------------------------------------------
// Siting
//
// Blocks are subdivided into lots, and each lot gets a building whose
// typology is chosen by how downtown it is. The rule is the one the land
// market applies: expensive ground gets tall buildings, and tall
// buildings are built out of steel and glass because that is what will
// stand up. Cheap ground gets three storeys of brick.
// ------------------------------------------------------------

function chooseKind(intensity, rng) {
  const roll = rng();
  if (intensity > 0.72) {
    if (roll < 0.46) return "glass";
    if (roll < 0.78) return "setback";
    if (roll < 0.90) return "deck";
    return "masonry";
  }
  if (intensity > 0.40) {
    if (roll < 0.34) return "setback";
    if (roll < 0.58) return "glass";
    if (roll < 0.80) return "masonry";
    if (roll < 0.92) return "deck";
    return "greystone";
  }
  if (intensity > 0.16) {
    if (roll < 0.52) return "masonry";
    if (roll < 0.86) return "greystone";
    return "deck";
  }
  return roll < 0.80 ? "greystone" : "masonry";
}

// Storey counts, and therefore heights, by typology and by how central
// the lot is. Chicago storeys are about 3.9m downtown and 3.2 out.
function storeysFor(kind, intensity, rng) {
  const jitter = 0.72 + rng() * 0.56;
  switch (kind) {
    case "glass": return Math.round((8 + intensity * intensity * 52) * jitter) + 4;
    case "setback": return Math.round((10 + intensity * intensity * 34) * jitter) + 5;
    case "deck": return Math.round((3 + intensity * 5) * jitter) + 2;
    case "masonry": return Math.round((4 + intensity * 9) * jitter) + 2;
    default: return Math.max(2, Math.round((2 + intensity * 2) * jitter) + 1);
  }
}

const STOREY = 3.55;

// How far out the modelled typologies are built before the city falls
// back to a plain massing block.
//
// A grid this size is roughly seven hundred buildings, and at four to
// eight hundred triangles each that is half a million triangles for a
// view in which most of them are forty pixels tall. Measured: the city
// ran at a fifth of the park's frame rate, and building density was
// almost all of it — 3.5fps with no buildings, 0.7 with them all.
//
// The ring is anchored on the ORIGIN, not on the camera, because the
// coaster is at the origin and the camera never goes far from it. A
// camera-relative ring would be better use of the budget and would also
// pop every time you turned round; this one simply never changes.
const DETAIL_RADIUS = 190;

// The massing block: a box, a parapet, and nothing else. Twenty-four
// triangles against six hundred, and past 430m you cannot tell.
// The mass of a distant building: a plain box, and its facade comes
// from a TEXTURE rather than from geometry.
//
// This is the fix for the flicker, and the reason it is a fix is
// mipmaps. Modelled floor bands are about 2m tall; at three hundred
// metres that is a pixel and a half of bright glass against a pixel of
// dark spandrel, and there is no way to filter geometry — every frame
// the sample lands somewhere different and the whole city crawls.
// Multisampling does not help, because the aliasing is not on the
// silhouette, it is across the face.
//
// A texture has mipmaps. At three hundred metres the hardware reads a
// level where those bands have already been averaged into one flat
// tone, and it is rock steady. It is also about fifty times fewer
// triangles, which is why the detail ring can now be tight enough that
// the modelled buildings are only ever used where they are big on
// screen and do not alias either.
function farGeo() {
  return new THREE.BoxGeometry(CORE_SHELL, 1, CORE_SHELL).translate(0, 0.5, 0);
}

// The parapet, drawn separately and untextured, so a facade of windows
// does not end up wrapped over the roof where you can see it from above.
function farCapGeo() {
  return mergeParts([
    part(new THREE.BoxGeometry(1, 0.022, 1), 0xd0cec8, [0, 0.99, 0]),
  ]);
}

// ---- the facade, drawn once as a texture -----------------------------
//
// Eight bays across and eight storeys up, tiled. Kept greyscale so the
// per-instance tint still decides what a building is made of, and drawn
// twice: once for daylight and once for the windows that are lit.
const FACADE_TILE = 256;
const FACADE_BAYS = 8;
const FACADE_STOREYS = 8;
export const BAY_METRES = 6.4;
export const STOREY_METRES = 3.55;

function facadeTextures(rng) {
  const cell = FACADE_TILE / FACADE_BAYS;
  const row = FACADE_TILE / FACADE_STOREYS;
  // Which windows are lit is decided ONCE, here, and shared by both
  // draws so the lit panes line up with the panes.
  const lit = [];
  for (let i = 0; i < FACADE_BAYS * FACADE_STOREYS; i++) {
    lit.push(rng() < 0.38 ? 0.55 + rng() * 0.45 : 0);
  }

  const draw = (ctx, night) => {
    ctx.fillStyle = night ? "#000000" : "#cfcdc7";
    ctx.fillRect(0, 0, FACADE_TILE, FACADE_TILE);
    for (let r = 0; r < FACADE_STOREYS; r++) {
      if (!night) {
        // Spandrel band under each floor.
        ctx.fillStyle = "#a9a79f";
        ctx.fillRect(0, r * row, FACADE_TILE, row * 0.30);
      }
      for (let b = 0; b < FACADE_BAYS; b++) {
        const glow = lit[r * FACADE_BAYS + b];
        const x = b * cell + cell * 0.18;
        const y = r * row + row * 0.38;
        const w = cell * 0.64;
        const h = row * 0.46;
        if (night) {
          if (glow <= 0) continue;
          // Warm, and not all the same warm.
          const warm = 150 + Math.round(glow * 105);
          ctx.fillStyle = `rgb(${warm}, ${Math.round(warm * 0.84)}, ${Math.round(warm * 0.58)})`;
          ctx.fillRect(x, y, w, h);
        } else {
          ctx.fillStyle = "#4a5560";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#5d6a76";
          ctx.fillRect(x, y, w, h * 0.34);
        }
      }
    }
  };

  const make = (night) => {
    const texture = canvasTexture(FACADE_TILE, FACADE_TILE, (ctx) => draw(ctx, night));
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    return texture;
  };
  return { day: make(false), night: make(true) };
}

// A facade material whose UVs are scaled and offset PER INSTANCE.
//
// Without this every building shows the same eight-by-eight grid however
// big it is, so a walk-up gets windows three metres across and a tower
// gets windows you cannot see. The scale comes in as an instanced
// attribute and multiplies the UV after three has built it, which is one
// line in the vertex shader and the only shader patch in the project.
function facadeMaterial(textures) {
  const material = new THREE.MeshLambertMaterial({
    map: textures.day,
    emissiveMap: textures.night,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    vertexColors: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aFacade;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vMapUv * aFacade.xy + aFacade.zw;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = vEmissiveMapUv * aFacade.xy + aFacade.zw;
        #endif
      `);
  };
  return material;
}

// What a distant building is coloured, by what it would have been.
// These MULTIPLY the facade texture, which is itself mid-grey, so they
// have to be much lighter than the colour you want out. Set to the
// finished colour they compound into near-black on any face the sun is
// not on, and the skyline turns into a row of silhouettes.
const FAR_TINT = {
  glass: 0x9fb0c0, setback: 0xe8e2d4, deck: 0xd2d0c8,
  masonry: 0xc08672, painted: 0xdcd6c6, greystone: 0xe4dece,
};

// ------------------------------------------------------------
// buildCity
// ------------------------------------------------------------

export function buildCity({ groundHeight, density = 1, rng }) {
  const group = new THREE.Group();
  const carveable = [];
  const updaters = [];
  const keepOuts = [];
  const grid = cityGrid();

  // ---- the ground: paving, roads, kerbs, crossings, river ----
  {
    // The streets carry a dim emissive at night.
    //
    // The lamps GLOW but they do not illuminate — nothing here casts
    // light, because several hundred real lights would end the frame
    // rate. Without this the whole city floor goes to pure black the
    // moment the sun sets, and a lit skyline standing on a void reads as
    // a bug. A wash of sodium on the tarmac is what the lamps would be
    // doing if they could.
    const streetMat = new THREE.MeshLambertMaterial({
      map: streetTexture(grid),
      emissive: new THREE.Color(0x2a2318),
      emissiveIntensity: 0,
    });
    updaters.push(() => { streetMat.emissiveIntensity = NIGHT.value * 1.9; });
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_RADIUS * 2, CITY_RADIUS * 2),
      streetMat,
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = groundHeight(0, 0) + 0.03;
    plane.receiveShadow = true;
    group.add(plane);
  }

  // ---- the lots ----
  const buckets = {
    greystone: [], masonry: [], painted: [], deck: [], setback: [], glass: [], far: [],
  };
  const roofs = [];
  const plants = [];
  const tint = new THREE.Color();

  // The two landmarks get their ground reserved before anything else is
  // placed, so nothing ends up standing inside them.
  //
  // Both sit beyond 470m from the origin, which is further out than the
  // longest circuit the length dial can draw. A landmark is a thing you
  // navigate by; one that vanishes because this seed's coaster happened
  // to be routed through it is not a landmark.
  const landmarks = [
    { kind: "tube", x: -395, z: -300, footprint: 68, height: 442 },
    { kind: "braced", x: 340, z: 415, footprint: 78, height: 344 },
  ];

  for (const bz of grid.ew.blocks) {
    for (const bx of grid.ns.blocks) {
      const cx = (bx.from + bx.to) / 2;
      const cz = (bz.from + bz.to) / 2;
      if (Math.hypot(cx, cz) > CITY_RADIUS * 0.86) continue;
      // The river takes its own right of way, and so does a landmark.
      if (Math.abs(riverDistance(cx, cz)) < RIVER.halfWidth + 26) continue;
      if (landmarks.some((l) => Math.abs(cx - l.x) < l.footprint * 0.9 + BLOCK.x * 0.5
        && Math.abs(cz - l.z) < l.footprint * 0.9 + BLOCK.z * 0.5)) continue;

      // Subdivide the block into lots along its long axis. Downtown the
      // lots are assembled into bigger parcels; out in the neighbourhoods
      // they stay narrow, which is why a residential street has forty
      // frontages and a Loop block has three.
      const intensityBlock = downtown(cx, cz);
      const lots = Math.max(1, Math.round((intensityBlock > 0.55 ? 2 : intensityBlock > 0.25 ? 3 : 5)
        * (0.7 + rng() * 0.6)));
      const lotWidth = (bx.to - bx.from) / lots;

      for (let l = 0; l < lots; l++) {
        if (rng() > density) continue;                 // the density dial
        const lx = bx.from + lotWidth * (l + 0.5);
        const intensity = downtown(lx, cz);
        const kind = chooseKind(intensity, rng);
        const storeys = storeysFor(kind, intensity, rng);
        // The typology still decides the massing out here; it just stops
        // being modelled. A distant glass tower is a tall thin dark box
        // and a distant greystone is a short pale one, which is all the
        // skyline needs from either.
        const detailed = Math.hypot(lx, cz) < DETAIL_RADIUS;
        const height = storeys * STOREY * (kind === "deck" ? 0.85 : 1);

        // A lot is built out to the pavement on all four sides, less a
        // small gap so neighbours do not z-fight.
        const w = lotWidth - 1.2 - (rng() < 0.12 ? lotWidth * 0.3 : 0);
        const d = (bz.to - bz.from) - SIDEWALK * 2;
        if (w < 6 || d < 6) continue;

        // The per-instance colour MODULATES the geometry's own vertex
        // colours; it does not replace them. Setting it to the
        // typology's palette colour multiplies the palette by itself —
        // brick came out plausible, but a glass tower whose vertex
        // colour is already 0x39434d turned into a featureless black
        // slab. So the tint stays near white and only varies: no two
        // buildings on a street are quite the same shade of anything.
        tint.setHSL(
          0.06 + (rng() - 0.5) * 0.20,
          rng() * 0.10,
          0.84 + (rng() - 0.5) * 0.24,
        );
        // A massing block has no palette of its own, so the tint has to
        // carry the whole colour rather than just vary it.
        if (!detailed) tint.multiply(new THREE.Color(FAR_TINT[kind] ?? 0xc8c4bc));

        // Two in five brick mid-rises are painted or stone-faced
        // instead. Same building, different bucket.
        const bucket = !detailed ? "far"
          : kind === "masonry" && rng() < 0.4 ? "painted" : kind;
        const y = groundHeight(lx, cz);
        buckets[bucket].push({
          x: lx, y, z: cz, sx: w, sy: height, sz: d,
          ry: 0, color: tint.getHex(),
          // Carve keep-out: half the diagonal, so the corridor the
          // coaster cuts takes out anything it actually passes through.
          keepOut: Math.hypot(w, d) * 0.5,
        });

        // Roof clutter on the flat-topped, non-glass ones.
        if (kind !== "glass" && kind !== "setback" && rng() < 0.34) {
          roofs.push({
            x: lx + (rng() - 0.5) * w * 0.4, y: y + height, z: cz + (rng() - 0.5) * d * 0.4,
            s: 1.4 + rng() * 1.1, ry: rng() * Math.PI, keepOut: 4,
          });
        }
        if (height > 40 && rng() < 0.5) {
          plants.push({
            x: lx + (rng() - 0.5) * w * 0.3, y: y + height, z: cz + (rng() - 0.5) * d * 0.3,
            s: 1.5 + rng() * 1.4, ry: rng() * Math.PI, keepOut: 5,
          });
        }
      }
    }
  }

  const geos = {
    greystone: greystoneGeo(),
    masonry: masonryGeo(),
    painted: masonryGeo(0xc9c2b2, 0x9e9789),
    deck: deckGeo(),
    setback: setbackGeo(), glass: glassGeo(),
  };

  // ---- the distant city, as textured boxes ----
  const textures = facadeTextures(rng);
  const facadeMat = facadeMaterial(textures);
  if (buckets.far.length) {
    const mesh = instance(farGeo(), facadeMat, buckets.far, { shadows: false });
    mesh.receiveShadow = true;
    // Per-instance UV: scale so a window bay is BAY_METRES wide and a
    // storey is STOREY_METRES tall whatever size the building is, and
    // offset by a random whole number of bays so no two buildings light
    // the same windows.
    const uv = new Float32Array(buckets.far.length * 4);
    buckets.far.forEach((b, i) => {
      uv[i * 4] = Math.max(1, Math.round(b.sx / BAY_METRES)) / FACADE_BAYS;
      uv[i * 4 + 1] = Math.max(1, Math.round(b.sy / STOREY_METRES)) / FACADE_STOREYS;
      uv[i * 4 + 2] = Math.floor(rng() * FACADE_BAYS) / FACADE_BAYS;
      uv[i * 4 + 3] = Math.floor(rng() * FACADE_STOREYS) / FACADE_STOREYS;
    });
    mesh.geometry.setAttribute("aFacade", new THREE.InstancedBufferAttribute(uv, 4));
    // The lit-window texture is already built and bound; all that is
    // left is to turn it up as the sun goes down.
    updaters.push(() => { facadeMat.emissiveIntensity = NIGHT.value * 1.35; });
    group.add(mesh);
    carveable.push({ mesh, placements: buckets.far });

    // The parapet, untextured, so the window grid does not wrap the roof.
    const caps = instance(farCapGeo(), vertexLit(), buckets.far, { shadows: false });
    caps.receiveShadow = true;
    group.add(caps);
    carveable.push({ mesh: caps, placements: buckets.far });
  }

  const facade = glowLit();
  for (const kind of Object.keys(geos)) {
    if (!buckets[kind].length) continue;
    const mesh = instance(geos[kind], facade, buckets[kind]);
    // Receive shadows, cast none. The sun's shadow camera is 460m
    // across and the grid runs to 2300m, so a cast pass re-renders the
    // whole city to light a strip in the middle of it — 2.4x the cost
    // of the park for a shadow you cannot see. The coaster and the
    // train still cast onto the streets, which is the shadow that
    // actually tells you where the ride is.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    carveable.push({ mesh, placements: buckets[kind] });
  }
  if (roofs.length) {
    const mesh = instance(roofKitGeo(), facade, roofs, { shadows: false });
    group.add(mesh);
    carveable.push({ mesh, placements: roofs });
  }
  if (plants.length) {
    const mesh = instance(plantGeo(), facade, plants, { shadows: false });
    group.add(mesh);
    carveable.push({ mesh, placements: plants });
  }

  // ---- the two landmarks ----
  {
    const tube = new THREE.Mesh(towerBundleGeo(), vertexLit());
    const braced = new THREE.Mesh(tokenBracedGeo(), vertexLit());
    for (const [mesh, l] of [[tube, landmarks[0]], [braced, landmarks[1]]]) {
      mesh.position.set(l.x, groundHeight(l.x, l.z), l.z);
      mesh.scale.set(l.footprint, l.height, l.footprint);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      keepOuts.push({ x: l.x, z: l.z, radius: l.footprint * 0.8 });
    }
  }

  // ---- the river and its bridges ----
  const river = buildRiver(grid, groundHeight);
  group.add(river.group);

  // ---- the elevated, and a train on it ----
  const elevated = buildElevated(elevatedRoute(grid), groundHeight);
  group.add(elevated.group);
  {
    const path = elevated.path;
    const total = path.length;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let travelled = 0;
    updaters.push((elapsed, dt) => {
      travelled += dt * 0.55;                       // in path steps per second
      for (let c = 0; c < 4; c++) {
        const at = (travelled - c * 1.15) % total;
        const node = path[Math.floor((at + total) % total)];
        euler.set(0, node.heading, 0);
        quat.setFromEuler(euler);
        // Sit on the outbound track, offset from the structure's centre.
        pos.set(
          node.x + Math.cos(node.heading) * L_GAUGE,
          groundHeight(node.x, node.z) + L_HEIGHT + 0.6,
          node.z - Math.sin(node.heading) * L_GAUGE,
        );
        matrix.compose(pos, quat, one);
        elevated.cars.setMatrixAt(c, matrix);
      }
      elevated.cars.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- traffic ----
  //
  // One instanced mesh, a few hundred cars, each assigned to a lane and
  // walked along it. They are the only thing in the city that moves at
  // street level, and without them the whole thing reads as a model.
  {
    const carGeo = mergeParts([
      part(new THREE.BoxGeometry(1.85, 0.7, 4.3), 0xffffff, [0, 0.62, 0]),
      part(new THREE.BoxGeometry(1.7, 0.62, 2.1), 0x2b3138, [0, 1.2, -0.2]),
      ...[-1, 1].flatMap((s) => [-1.5, 1.5].map((z) => part(
        new THREE.CylinderGeometry(0.32, 0.32, 0.2, 6), 0x1b1f23,
        [s * 0.85, 0.32, z], [1, 1, 1], [0, 0, Math.PI / 2]))),
      // Headlights and tail-lights. At night the grid becomes rivers of
      // white one way and red the other, which is most of what a city
      // after dark actually looks like from above.
      part(new THREE.BoxGeometry(1.5, 0.16, 0.16), 0xfff2d0, [0, 0.62, 2.16], [1, 1, 1], [0, 0, 0], 0.98),
      part(new THREE.BoxGeometry(1.5, 0.14, 0.14), 0xd8402e, [0, 0.62, -2.16], [1, 1, 1], [0, 0, 0], 0.9),
    ]);
    const COLOURS = [0xd8dde2, 0x2a2e33, 0x8c9298, 0x9c3a2e, 0x2f5d8c, 0xd8c05a, 0x3f7a52];
    const lanes = [];
    const want = Math.round(230 * Math.min(1.4, 0.35 + density));
    let guard = 0;
    while (lanes.length < want && guard++ < want * 8) {
      const horizontal = rng() < 0.5;
      const lines = horizontal ? grid.ew.lines : grid.ns.lines;
      const line = lines[Math.floor(rng() * lines.length)];
      if (Math.abs(line.at) > CITY_RADIUS * 0.62) continue;
      const dir = rng() < 0.5 ? 1 : -1;
      const offset = dir * (line.width * 0.22);
      lanes.push({
        horizontal, at: line.at + offset, dir,
        s: rng() * CITY_RADIUS * 1.24 - CITY_RADIUS * 0.62,
        v: 9 + rng() * 9,
        colour: COLOURS[Math.floor(rng() * COLOURS.length)],
      });
    }
    const cars = new THREE.InstancedMesh(carGeo, glowLit(), Math.max(1, lanes.length));
    cars.count = lanes.length;
    cars.castShadow = true;
    const tintCar = new THREE.Color();
    lanes.forEach((l, i) => cars.setColorAt(i, tintCar.set(l.colour)));
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const limit = CITY_RADIUS * 0.62;
    updaters.push((elapsed, dt) => {
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i];
        l.s += l.v * l.dir * dt;
        if (l.s > limit) l.s = -limit;
        if (l.s < -limit) l.s = limit;
        const x = l.horizontal ? l.s : l.at;
        const z = l.horizontal ? l.at : l.s;
        euler.set(0, l.horizontal ? (l.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (l.dir > 0 ? 0 : Math.PI), 0);
        quat.setFromEuler(euler);
        pos.set(x, groundHeight(x, z) + 0.06, z);
        matrix.compose(pos, quat, one);
        cars.setMatrixAt(i, matrix);
      }
      cars.instanceMatrix.needsUpdate = true;
    });
    group.add(cars);
  }

  // ---- street lighting ----
  {
    const lampGeo = mergeParts([
      part(new THREE.CylinderGeometry(0.11, 0.15, 8.4, 6), 0x3f4348, [0, 4.2, 0]),
      part(new THREE.BoxGeometry(2.2, 0.16, 0.22), 0x3f4348, [0.95, 8.3, 0]),
      part(new THREE.BoxGeometry(0.9, 0.16, 0.42), 0xf2e6bd, [1.85, 8.2, 0], [1, 1, 1], [0, 0, 0], 0.95),
    ]);
    const lamps = [];
    for (const line of grid.ew.lines) {
      if (Math.abs(line.at) > CITY_RADIUS * 0.55) continue;
      for (let x = -CITY_RADIUS * 0.55; x < CITY_RADIUS * 0.55; x += 46) {
        if (rng() > density * 0.8) continue;
        const side = rng() < 0.5 ? 1 : -1;
        const z = line.at + side * (line.width / 2 + 1.6);
        lamps.push({ x, y: groundHeight(x, z), z, ry: side > 0 ? Math.PI : 0, s: 1, keepOut: 6 });
      }
    }
    if (lamps.length) {
      const mesh = instance(lampGeo, glowLit(), lamps, { shadows: false });
      group.add(mesh);
      carveable.push({ mesh, placements: lamps });
    }
  }

  return { group, carveable, updaters, keepOuts, grid, landmarks };
}
