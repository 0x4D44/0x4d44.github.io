// The King's Cross train shed, drawn from the layout in core/station.ts: two arched spans with a
// banded roof (slate-grey flanks, a glazed strip along each crown), iron lattice ribs, brick side
// walls with piers and windows, the brick south front with its two great arched windows glazed in
// bars, the clock tower, the glazed north gables, and the Western Range along the west side.
// Everything is procedural; textures come from materials.ts and are drawn at runtime.
//
// Local frame: x = u (east), y up, z = -v (north is -z), the south front in the plane z = 0, then
// the group is turned by -heading and moved to the shed's south-west corner. See shedToWorld()
// in core/station.ts. Ground is GROUND_Y (web/src/world.ts); the rail head top is y = 0.
//
// Published figures (cited in core/station.ts): two arches each 105 ft wide, 800 ft long, 71 ft to
// the crown; clock tower 112 ft. Everything else here is read off the OSM layout or ASSUMED, and
// each ASSUMED figure says so where it is defined.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLOCK_TOWER_HEIGHT, SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { Batch, material } from './materials.ts';
import type { V3 } from './materials.ts';
import { GROUND_Y } from './world.ts';

const R = SHED_SPAN_WIDTH / 2;

/** Roof ribs every 20 ft: ASSUMED, the published sources give no rib spacing. */
export const RIB_SPACING = 6.1;
/** Width of the glazed strip along each crown, metres: ASSUMED (the roof is slate-grey flanks, glazed crown). */
export const GLAZED_STRIP_WIDTH = 9;
/** Thickness of the flank walls: ASSUMED. */
const WALL_THICK = 0.6;
/** Thickness of the south front: ASSUMED. */
const FRONT_THICK = 1.2;
/** The brick south front stands this far above the arch crowns (kept from the first build; ASSUMED). */
const FRONT_ABOVE_CROWN = 2.4;
export const TOWER_SIZE = 6.4; // ASSUMED
/** The glass of each north gable starts this far above the platform; below it the arch is open for trains (ASSUMED). */
export const GABLE_GLASS_FROM = 9.5;
const ARC_STEPS = 12;
/** The roof skin (slate, glass, lining) stands this far outside the nominal arch radius: on top of the ribs' top boom. */
export const ROOF_SKIN = 0.3;

/**
 * The Western Range: Cubitt's 1850s brick range along the west side of the shed, between the shed
 * wall and the Western Concourse. Its footprint is read off the OSM station building (260720558):
 * the concourse arc ends at v = 141.5 in the shed frame (the Range ends with it) and the footprint's
 * southern edge beside the front is at v = 8.1 to 8.9. Depth, storey height and bay width are
 * ASSUMED (three storeys, no published survey was found). Tests pin v0 and v1 to the OSM numbers.
 */
export const WESTERN_RANGE = { v0: 8.1, v1: 141.5, depth: 12, storey: 4.1, storeys: 3, bay: 3.4, roofRise: 3.0 } as const;

// ---------------------------------------------------------------------------------------------
// pure geometry

/** One point on a vault's section: angle 0 at the west springing, pi at the east springing. */
export function vaultPoint(uc: number, springing: number, r: number, a: number): [number, number] {
  return [uc - r * Math.cos(a), springing + r * Math.sin(a)];
}

/**
 * The angle, up from its springing, at which a roof skin of radius `rs` crosses the valley line (the
 * vertical through the springing of the vault beside it). The skins of two neighbouring vaults are
 * `rs - r` wider than the arches, so they would overlap in the valley; they are cut here instead.
 */
export function valleyCut(rs: number, r = R): number {
  return Math.acos(r / rs);
}

/** Half the angle the glazed strip covers either side of the crown. */
export function glazedHalfAngle(r = R, width = GLAZED_STRIP_WIDTH): number {
  return Math.asin(width / 2 / r);
}

/**
 * A strip of the vault's shell from angle a0 to a1 at radius r, running `length` metres north
 * from the south front. Normals point outward (a front face seen from outside); UVs are metres:
 * u the arc length from the west springing, v the distance north.
 */
export function vaultBand(uc: number, springing: number, r: number, a0: number, a1: number, length: number, steps: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const [u, y] = vaultPoint(uc, springing, r, a);
    for (const z of [0, -length]) {
      pos.push(u, y, z);
      nor.push(-Math.cos(a), Math.sin(a), 0);
      uv.push(r * a, -z);
    }
  }
  for (let i = 0; i < steps; i++) {
    const A = i * 2; // (i, south) ; A + 1 = (i, north) ; A + 2 = (i + 1, south) ; A + 3 = (i + 1, north)
    idx.push(A, A + 2, A + 1, A + 2, A + 3, A + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export interface Member {
  c: V3;
  s: V3;
  rotZ: number;
  kind: 'boom' | 'web';
}

/**
 * One roof rib as a Warren truss in the plane z = 0, centred on the vault axis (u = 0): a top and
 * a bottom boom of `n` straight members each, joined by radial and diagonal webs. The depth of the
 * truss (top boom to bottom boom) is ASSUMED 1.4 m; the lattice is drawn from photographs of the
 * shed's iron ribs, not a survey.
 */
export function ribMembers(springing: number, r = R, n = 16): Member[] {
  const rt = r + 0.1;
  const rb = r - 1.3;
  const node = (rad: number, i: number): [number, number] => vaultPoint(0, springing, rad, (Math.PI * i) / n);
  const out: Member[] = [];
  const add = (p: [number, number], q: [number, number], kind: 'boom' | 'web'): void => {
    const du = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(du, dy) + (kind === 'boom' ? 0.08 : 0.04);
    out.push({ c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], s: kind === 'boom' ? [len, 0.38, 0.3] : [len, 0.16, 0.14], rotZ: Math.atan2(dy, du), kind });
  };
  for (let i = 0; i < n; i++) {
    add(node(rt, i), node(rt, i + 1), 'boom');
    add(node(rb, i), node(rb, i + 1), 'boom');
    // the diagonals lean toward the crown on both sides, so the truss is symmetric about it
    if (i < n / 2) add(node(rb, i), node(rt, i + 1), 'web');
    else add(node(rb, i + 1), node(rt, i), 'web');
  }
  for (let i = 0; i <= n; i++) add(node(rb, i), node(rt, i), 'web');
  return out;
}

/** Where the ribs stand, metres north of the south front. */
export function ribPositions(length: number): number[] {
  const out: number[] = [];
  for (let v = RIB_SPACING / 2; v < length; v += RIB_SPACING) out.push(v);
  return out;
}

export interface BarSpec {
  c: V3;
  s: V3;
  rotZ: number;
  kind: 'mullion' | 'transom' | 'ring';
}

/**
 * The glazing bars of one great arched window (a half disc of radius r about (uc, springing)), in
 * the plane z = 0: vertical mullions every `spacing` metres (ASSUMED 1.6 m), two transoms at a third
 * and two thirds of the height, and one concentric ring at 0.62 r, so the glass reads as bars
 * rather than a hole. All bars lie inside the half disc.
 */
export function lunetteBars(uc: number, springing: number, r = R, spacing = 1.6): BarSpec[] {
  const out: BarSpec[] = [];
  const t = 0.09; // bar width, metres: ASSUMED
  const d = 0.12;
  const kmax = Math.floor((r - 0.4) / spacing);
  for (let k = -kmax; k <= kmax; k++) {
    const x = k * spacing;
    const h = Math.sqrt(r * r - x * x) - 0.12;
    out.push({ c: [uc + x, springing + h / 2, 0], s: [t, h, d], rotZ: 0, kind: 'mullion' });
  }
  for (const f of [1 / 3, 2 / 3]) {
    const y = r * f;
    const half = Math.sqrt(r * r - y * y) - 0.12;
    out.push({ c: [uc, springing + y, 0], s: [2 * half, t, d], rotZ: 0, kind: 'transom' });
  }
  const ringR = 0.62 * r;
  const n = 20;
  for (let i = 0; i < n; i++) {
    const p = vaultPoint(uc, springing, ringR, (Math.PI * i) / n);
    const q = vaultPoint(uc, springing, ringR, (Math.PI * (i + 1)) / n);
    out.push({ c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], s: [Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.06, t, d], rotZ: Math.atan2(q[1] - p[1], q[0] - p[0]), kind: 'ring' });
  }
  return out;
}

/** The bars of one north gable: the window bars above `from`, mullions trimmed to start there. */
export function gableBars(uc: number, springing: number, from: number, r = R): BarSpec[] {
  const out: BarSpec[] = [];
  for (const b of lunetteBars(uc, springing, r)) {
    if (b.kind === 'mullion') {
      const top = b.c[1] + b.s[1] / 2;
      const h = top - from;
      if (h > 0.3) out.push({ ...b, c: [b.c[0], from + h / 2, b.c[2]], s: [b.s[0], h, b.s[2]] });
    } else if (b.c[1] > from + 0.2) out.push(b);
  }
  return out;
}

export type RoofMode = 'auto' | 'solid' | 'xray';
/** How see-through the slate flanks of the roof get when you pull back. ASSUMED look, not a fact. */
export const XRAY_OPACITY = 0.5;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Opacity of the slate cladding for a camera at `cam` in the shed's local frame. Inside the shed
 * the roof is solid (you see its pale lining and the ribs). Outside it thins from solid within
 * 60 m to `XRAY_OPACITY` beyond 220 m, so the trains and platforms stay readable from the overview
 * cameras while a close look at the roof still shows slate.
 */
export function roofOpacity(cam: V3, layout: Pick<ShedLayout, 'width' | 'length' | 'crown'>, mode: RoofMode = 'auto'): number {
  if (mode === 'solid') return 1;
  if (mode === 'xray') return XRAY_OPACITY;
  const [x, y, z] = cam;
  if (x > 0 && x < layout.width && z < 0 && z > -layout.length && y < layout.crown + 1) return 1;
  const d = Math.hypot(x - layout.width / 2, y - layout.crown, z + layout.length / 2);
  return 1 - (1 - XRAY_OPACITY) * smoothstep(60, 220, d);
}

/** A window decal quad, `w` x `h` metres, its foot at height y0 and centred at `centre` along the wall, facing `facing`. */
function windowQuad(batch: Batch, at: V3, facing: '+x' | '-x' | '+z' | '-z', w = 1.4, h = 2.6): void {
  const [x, y0, z] = at;
  const y1 = y0 + h;
  // UVs run over the whole texture tile (1.4 x 2.6 m), whatever the quad's size
  const uv: [number, number][] = [[0, 0], [1.4, 0], [1.4, 2.6], [0, 2.6]];
  const [a, b, c, d] = uv as [[number, number], [number, number], [number, number], [number, number]];
  // 'left' and 'right' are as seen by someone standing in front of the face
  if (facing === '+z') batch.quad([x - w / 2, y0, z], [x + w / 2, y0, z], [x + w / 2, y1, z], [x - w / 2, y1, z], a, b, c, d);
  else if (facing === '-z') batch.quad([x + w / 2, y0, z], [x - w / 2, y0, z], [x - w / 2, y1, z], [x + w / 2, y1, z], a, b, c, d);
  else if (facing === '+x') batch.quad([x, y0, z + w / 2], [x, y0, z - w / 2], [x, y1, z - w / 2], [x, y1, z + w / 2], a, b, c, d);
  else batch.quad([x, y0, z - w / 2], [x, y0, z + w / 2], [x, y1, z + w / 2], [x, y1, z - w / 2], a, b, c, d);
}

// ---------------------------------------------------------------------------------------------
// the parts

const isBrowser = typeof document !== 'undefined';

function clockMaterial(): THREE.Material {
  if (!isBrowser) return new THREE.MeshLambertMaterial({ color: 0xefe8d4 });
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#efe8d4';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#22201c';
  g.lineWidth = 8;
  g.stroke();
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    g.lineWidth = i % 3 === 0 ? 8 : 5;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
    g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
    g.stroke();
  }
  g.lineWidth = 11; // a still picture at about ten past ten; the model's clock does not run
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(-1.05) * 62, 128 - Math.cos(-1.05) * 62); g.stroke();
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(0.9) * 92, 128 - Math.cos(0.9) * 92); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t });
}

function halfDisc(uc: number, springing: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(uc - r, springing);
  s.absarc(uc, springing, r, Math.PI, 0, true);
  s.lineTo(uc - r, springing);
  return s;
}

/** An arched band of radius r0..r1 about (uc, springing): the stone moulding round an arch. */
function archRing(uc: number, springing: number, r0: number, r1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(uc - r1, springing);
  s.absarc(uc, springing, r1, Math.PI, 0, true);
  s.lineTo(uc + r0, springing);
  s.absarc(uc, springing, r0, 0, Math.PI, false);
  s.lineTo(uc - r1, springing);
  return s;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, name: string): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  return o;
}

/** A decal material: the shared one, nudged forward in depth so it does not fight the wall behind it. */
function decal(name: 'window' | 'windowArch'): THREE.Material {
  const m = material(name).clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
}

function addBars(batch: Batch, bars: BarSpec[], dz: number, z0 = 0): void {
  for (const b of bars) batch.box([b.c[0], b.c[1], z0 + b.c[2] + dz], b.s, { rotZ: b.rotZ, skip: ['+x', '-x'] });
}

export interface ShedOptions {
  /** the slate roof: 'auto' thins it as the camera pulls back (see roofOpacity), 'solid', or 'xray' */
  roof?: RoofMode;
  /** the Western Range along the west side (default true) */
  range?: boolean;
}

export function buildShed(layout: ShedLayout, opts: ShedOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'train-shed';
  const W = layout.width;
  const L = layout.length;
  const sp = layout.springing;
  const crown = layout.crown;
  const wallH = sp;
  const frontTop = crown + FRONT_ABOVE_CROWN;
  const centres = [layout.aisle + R, layout.aisle + 3 * R];
  const phi = glazedHalfAngle();
  const disposables: THREE.BufferGeometry[] = [];

  // ---- roof: slate flanks, glazed crown, pale lining underneath --------------------------------
  // The roof sheeting rides on top of the ribs, so the whole truss shows beneath it from inside: the
  // cladding, its pale lining and the glass all sit on the outer face of the top boom (rt + half its depth).
  // Where the two vaults meet the skins would overlap (each is R + ROOF_SKIN, the centres are 2R apart), so
  // each skin stops on the valley line instead, `cut` radians up from its springing, and a deep valley
  // girder (below) closes the gap from the springing to there. Below the springing the valley stays open.
  const flanks: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const lining: THREE.BufferGeometry[] = [];
  const cut = valleyCut(R + ROOF_SKIN);
  centres.forEach((uc, vault) => {
    const flankSpans: [number, number][] = [
      [vault === 1 ? cut : 0, Math.PI / 2 - phi],
      [Math.PI / 2 + phi, vault === 0 ? Math.PI - cut : Math.PI],
    ];
    for (const [a0, a1] of flankSpans) {
      flanks.push(vaultBand(uc, sp, R + ROOF_SKIN, a0, a1, L, ARC_STEPS));
      lining.push(vaultBand(uc, sp, R + ROOF_SKIN - 0.02, a0, a1, L, ARC_STEPS));
    }
    glass.push(vaultBand(uc, sp, R + ROOF_SKIN, Math.PI / 2 - phi, Math.PI / 2 + phi, L, 4));
  });
  const cladMat = (material('slate') as THREE.MeshLambertMaterial).clone();
  cladMat.transparent = true; // its opacity changes with the view, see roofOpacity
  const cladding = mesh(mergeGeometries(flanks, false), cladMat, 'shed-roof-cladding');
  const roofMode = opts.roof ?? 'auto';
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  cladding.onBeforeRender = (_renderer, _scene, camera) => {
    inverse.copy(group.matrixWorld).invert();
    local.copy(camera.position).applyMatrix4(inverse);
    const o = roofOpacity([local.x, local.y, local.z], layout, roofMode);
    cladMat.opacity = o;
    cladMat.depthWrite = o > 0.98;
  };
  cladding.renderOrder = 2;
  group.add(cladding);
  const glassMesh = mesh(mergeGeometries(glass, false), material('roofGlass'), 'shed-roof-glass');
  glassMesh.renderOrder = 3;
  group.add(glassMesh);
  group.add(mesh(mergeGeometries(lining, false), material('lining'), 'shed-roof-lining'));
  disposables.push(...flanks, ...glass, ...lining);

  // ---- ribs: one lattice truss, instanced along both vaults ------------------------------------
  const rib = new Batch();
  for (const m of ribMembers(sp)) rib.box(m.c, m.s, { rotZ: m.rotZ, skip: m.kind === 'boom' ? ['+x', '-x'] : ['+x', '-x', '+y', '-y'] });
  const ribPos = ribPositions(L);
  const ribs = new THREE.InstancedMesh(rib.build(), material('steel'), ribPos.length * centres.length);
  const mat = new THREE.Matrix4();
  let k = 0;
  for (const uc of centres) for (const v of ribPos) ribs.setMatrixAt(k++, mat.makeTranslation(uc, 0, -v));
  ribs.name = 'shed-ribs';
  ribs.instanceMatrix.needsUpdate = true;
  group.add(ribs);
  // the valley girder: where the two roofs meet it carries them from the springing up to the cut skins.
  // No columns under it: the OSM tracks run along this line (a buffer stop stands at u = 36.1), so the valley stays open below.
  const valleyTop = sp + (R + ROOF_SKIN) * Math.sin(cut);
  const girder = new Batch();
  girder.box([layout.aisle + 2 * R, (sp + valleyTop) / 2, -L / 2], [0.5, valleyTop - sp, L]);
  group.add(mesh(girder.build(), material('concrete'), 'shed-valley-girder'));

  // ---- brick: flank walls with piers and windows, the aisle roofs, the north aisle ends --------
  const brick = new Batch();
  const stone = new Batch();
  const slate = new Batch();
  const windows = new Batch();
  const windowsArch = new Batch();
  for (const [x0, outward] of [[0, -1], [W, 1]] as [number, number][]) {
    // the wall is a box outside the line x0 (west wall to the west, east wall to the east)
    const xc = x0 + (outward * WALL_THICK) / 2;
    brick.box([xc, (wallH + GROUND_Y) / 2, -L / 2], [WALL_THICK, wallH - GROUND_Y, L]);
    stone.box([xc, wallH + 0.15, -L / 2], [WALL_THICK + 0.5, 0.3, L]); // coping
    for (const v of ribPos) {
      brick.box([x0 + outward * (WALL_THICK + 0.25), (wallH + GROUND_Y) / 2 - 0.15, -v], [0.5, wallH - GROUND_Y - 0.3, 0.9]); // pier outside
      brick.box([x0 - outward * 0.15, (wallH + GROUND_Y) / 2 - 0.15, -v], [0.3, wallH - GROUND_Y - 0.3, 0.9]); // pier inside
    }
    // a window in every bay between the piers, on the inner face (and the outer face of the east wall)
    for (let i = 0; i + 1 < ribPos.length; i++) {
      const z = -(((ribPos[i] as number) + (ribPos[i + 1] as number)) / 2);
      windowQuad(windows, [x0 - outward * 0.02, 1.9, z], outward < 0 ? '+x' : '-x');
      if (outward > 0) windowQuad(windows, [x0 + WALL_THICK + 0.02, 1.9, z], '+x');
    }
  }
  // aisle roofs: flat slabs at the springing, slate on top (ASSUMED flat; the real aisle roofs are not surveyed)
  for (const x0 of [0, W - layout.aisle]) slate.box([x0 + layout.aisle / 2, wallH - 0.15, -L / 2], [layout.aisle, 0.3, L], { skip: ['-y'] });
  // the north end of each aisle is closed by a brick wall
  for (const x0 of [0, W - layout.aisle]) brick.box([x0 + layout.aisle / 2, (wallH + GROUND_Y) / 2, -L - WALL_THICK / 2], [layout.aisle, wallH - GROUND_Y, WALL_THICK]);

  // ---- the south front ------------------------------------------------------------------------
  const outline = new THREE.Shape([new THREE.Vector2(0, GROUND_Y), new THREE.Vector2(W, GROUND_Y), new THREE.Vector2(W, frontTop), new THREE.Vector2(0, frontTop)]);
  for (const uc of centres) outline.holes.push(halfDisc(uc, sp, R));
  const frontGeo = new THREE.ExtrudeGeometry(outline, { depth: FRONT_THICK, bevelEnabled: false, curveSegments: 40 });
  frontGeo.translate(0, 0, -FRONT_THICK);
  group.add(mesh(frontGeo, material('brick'), 'shed-front'));
  // stone dressings that stand proud of the front plane (z = 0) by `out` metres
  const proud = (cx: number, cy: number, sx: number, sy: number, out: number): void => stone.box([cx, cy, (out - FRONT_THICK) / 2], [sx, sy, FRONT_THICK + out]);
  proud(W / 2, GROUND_Y + 0.7, W + 0.8, 1.4, 0.35); // plinth
  proud(W / 2, sp - 0.3, W + 0.4, 0.6, 0.3); // sill course at the springing
  proud(W / 2, frontTop - 0.45, W + 1.0, 0.9, 0.7); // cornice
  proud(W / 2, frontTop + 0.15, W + 0.6, 0.3, 0.4); // its coping
  for (const x of [0.5, W - 0.5]) proud(x, (frontTop + GROUND_Y) / 2, 1.0, frontTop - GROUND_Y - 1.0, 0.25); // end piers
  // round-headed windows along the lower front, either side of the tower
  for (let x = 3.2; x < W - 2; x += 4.4) {
    if (Math.abs(x - W / 2) < TOWER_SIZE / 2 + 1.5) continue;
    windowQuad(windowsArch, [x, GROUND_Y + 1.8, 0.02], '+z', 2.0, 3.2);
  }
  const rings: THREE.BufferGeometry[] = [];
  const lunGlass: THREE.BufferGeometry[] = [];
  const bars = new Batch();
  for (const uc of centres) {
    // the stone moulding round each great window
    rings.push(new THREE.ExtrudeGeometry(archRing(uc, sp, R, R + 1.1), { depth: 0.5, bevelEnabled: false, curveSegments: 40 }));
    // the glass is set back in the opening, the bars in front of it
    const g = new THREE.ShapeGeometry(halfDisc(uc, sp, R - 0.02), 40);
    g.translate(0, 0, -FRONT_THICK / 2 - 0.1);
    lunGlass.push(g);
    addBars(bars, lunetteBars(uc, sp), -FRONT_THICK / 2);
  }
  const lunMesh = mesh(mergeGeometries(lunGlass, false), material('glass'), 'shed-front-glass');
  lunMesh.renderOrder = 3;
  group.add(lunMesh, mesh(bars.build(), material('steel'), 'shed-front-bars'));

  // ---- the north gables: glass above the trains' height, in bars, framed in stone --------------
  const gableGeos: THREE.BufferGeometry[] = [];
  const gBars = new Batch();
  const aBase = Math.asin((GABLE_GLASS_FROM - sp) / R);
  for (const uc of centres) {
    const s = new THREE.Shape();
    s.moveTo(uc - R * Math.cos(aBase), GABLE_GLASS_FROM);
    s.absarc(uc, sp, R, Math.PI - aBase, aBase, true);
    s.lineTo(uc - R * Math.cos(aBase), GABLE_GLASS_FROM);
    const g = new THREE.ShapeGeometry(s, 40);
    g.translate(0, 0, -L);
    gableGeos.push(g);
    addBars(gBars, gableBars(uc, sp, GABLE_GLASS_FROM), 0, -L);
    gBars.box([uc, GABLE_GLASS_FROM + 0.1, -L], [2 * R * Math.cos(aBase), 0.25, 0.3]); // the transom along the glass line
    const ring = new THREE.ExtrudeGeometry(archRing(uc, sp, R, R + 0.7), { depth: 0.5, bevelEnabled: false, curveSegments: 40 });
    ring.translate(0, 0, -L - 0.5);
    rings.push(ring);
  }
  const gableGlass = mesh(mergeGeometries(gableGeos, false), material('glass'), 'shed-gable-glass');
  gableGlass.renderOrder = 3;
  group.add(gableGlass, mesh(gBars.build(), material('steel'), 'shed-gable-bars'), mesh(mergeGeometries(rings, false), material('stone'), 'shed-arch-rings'));
  disposables.push(...rings, ...lunGlass, ...gableGeos);

  // ---- the clock tower, centred on the spine, standing just in front of the south front --------
  group.add(buildTower(W / 2));

  // ---- the Western Range -----------------------------------------------------------------------
  if (opts.range !== false) group.add(buildWesternRange());

  group.add(mesh(brick.build(), material('brick'), 'shed-brick'));
  group.add(mesh(stone.build(), material('stone'), 'shed-stone'));
  group.add(mesh(slate.build(), material('slate'), 'shed-aisle-roofs'));
  group.add(mesh(windows.build(), decal('window'), 'shed-windows'));
  group.add(mesh(windowsArch.build(), decal('windowArch'), 'shed-front-windows'));
  for (const g of disposables) g.dispose();
  group.rotation.y = -layout.heading;
  group.position.set(layout.origin[0], 0, layout.origin[1]);
  return group;
}

/**
 * The clock tower on the shed's spine, in the shed's local frame (south = +z), 112 ft to the
 * top of its cap (published, see core/station.ts): a brick shaft on a stone plinth with corner
 * quoins, a clock on every face, two stone cornices round an arched belfry stage, and a pyramid
 * cap in slate. Stage heights and the 6.4 m width are ASSUMED; clock size ASSUMED 3.4 m.
 */
export function buildTower(x: number): THREE.Group {
  const tower = new THREE.Group();
  tower.name = 'clock-tower';
  const tb = new Batch();
  const ts = new Batch();
  const tslate = new Batch();
  const tw = TOWER_SIZE;
  const shaftTop = 26.0;
  tb.box([0, (shaftTop + GROUND_Y) / 2, 0], [tw, shaftTop - GROUND_Y, tw]);
  ts.box([0, GROUND_Y + 0.9, 0], [tw + 0.7, 1.8, tw + 0.7]); // plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ts.box([sx * (tw / 2 + 0.05), (shaftTop + GROUND_Y) / 2 + 0.9, sz * (tw / 2 + 0.05)], [0.9, shaftTop - GROUND_Y - 1.8, 0.9]); // quoins
  ts.box([0, shaftTop + 0.6, 0], [tw + 1.2, 1.2, tw + 1.2]); // first cornice
  ts.box([0, shaftTop + 1.2 + 1.4, 0], [tw - 0.6, 2.8, tw - 0.6]); // belfry stage
  ts.box([0, shaftTop + 4.0 + 0.45, 0], [tw + 0.6, 0.9, tw + 0.6]); // second cornice
  const capBase = shaftTop + 4.9;
  const hb = tw / 2 + 0.3;
  const apex: V3 = [0, CLOCK_TOWER_HEIGHT, 0];
  const corners: V3[] = [[-hb, capBase, hb], [hb, capBase, hb], [hb, capBase, -hb], [-hb, capBase, -hb]];
  const slant = Math.hypot(hb, CLOCK_TOWER_HEIGHT - capBase);
  for (let i = 0; i < 4; i++) tslate.poly([corners[i] as V3, corners[(i + 1) % 4] as V3, apex], [[0, 0], [2 * hb, 0], [hb, slant]]);
  tslate.poly([corners[3] as V3, corners[2] as V3, corners[1] as V3, corners[0] as V3], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // a clock on every face, in a stone surround; arched belfry openings above
  const clockMat = clockMaterial();
  const clockGeo = new THREE.CircleGeometry(1.7, 40);
  const surroundGeo = new THREE.RingGeometry(1.7, 2.15, 40);
  const faces = new THREE.Group();
  const openings = new Batch();
  const dirs: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // south, east, north, west: (x, z)
  for (const [nx, nz] of dirs) {
    const face = new THREE.Mesh(clockGeo, clockMat);
    face.position.set(nx * (tw / 2 + 0.06), 22.4, nz * (tw / 2 + 0.06));
    face.rotation.y = Math.atan2(nx, nz);
    const ring = new THREE.Mesh(surroundGeo, material('stone'));
    ring.position.set(nx * (tw / 2 + 0.05), 22.4, nz * (tw / 2 + 0.05));
    ring.rotation.y = face.rotation.y;
    faces.add(ring, face);
    // belfry opening: centred on the face of the belfry stage, facing out
    const out = tw / 2 - 0.3 + 0.05;
    windowQuad(openings, [nx * out, shaftTop + 1.4, nz * out], nx === 0 ? (nz > 0 ? '+z' : '-z') : nx > 0 ? '+x' : '-x', 1.8, 2.4);
  }
  tower.add(mesh(tb.build(), material('brick'), 'tower-brick'), mesh(ts.build(), material('stone'), 'tower-stone'), mesh(tslate.build(), material('slate'), 'tower-cap'), faces, mesh(openings.build(), decal('windowArch'), 'tower-openings'));
  tower.position.set(x, 0, tw / 2 + 0.15);
  return tower;
}

/**
 * The Western Range in the shed's local frame: a three-storey brick block along the shed's west
 * wall, its long walls pierced by a window in every bay (round-headed on the ground floor),
 * string courses between the storeys, a stone cornice and a pitched slate roof. See WESTERN_RANGE
 * for what is OSM and what is ASSUMED. Its east face stands 0.01 m inside the shed's west wall, so
 * the shed wall covers the faces that would otherwise fight below the aisle roof.
 */
export function buildWesternRange(): THREE.Group {
  const { v0, v1, depth, storey, storeys, bay, roofRise } = WESTERN_RANGE;
  const g = new THREE.Group();
  g.name = 'western-range';
  const brick = new Batch();
  const stone = new Batch();
  const slate = new Batch();
  const win = new Batch();
  const winArch = new Batch();
  const x1 = -0.01;
  const x0 = x1 - depth;
  const eaves = storey * storeys;
  const len = v1 - v0;
  const zc = -(v0 + v1) / 2;
  const xm = (x0 + x1) / 2;
  brick.box([xm, (eaves + GROUND_Y) / 2, zc], [depth, eaves - GROUND_Y, len]);
  stone.box([xm, GROUND_Y + 0.5, zc], [depth + 0.5, 1.0, len + 0.5], { skip: ['-y'] }); // plinth
  for (let s = 1; s < storeys; s++) stone.box([xm, s * storey, zc], [depth + 0.3, 0.3, len + 0.3]); // string courses
  stone.box([xm, eaves + 0.25, zc], [depth + 0.9, 0.5, len + 0.9]); // cornice
  // pitched roof: two slopes meeting at a ridge along the length, brick gable ends
  const top = eaves + 0.5;
  const slant = Math.hypot(depth / 2 + 0.45, roofRise);
  const lenA = len + 0.9;
  const zN = -(v1 + 0.45);
  const zS = -(v0 - 0.45);
  const xw = x0 - 0.45;
  const xe = x1 + 0.45;
  slate.quad([xw, top, zS], [xm, top + roofRise, zS], [xm, top + roofRise, zN], [xw, top, zN], [0, 0], [slant, 0], [slant, lenA], [0, lenA]);
  slate.quad([xm, top + roofRise, zS], [xe, top, zS], [xe, top, zN], [xm, top + roofRise, zN], [0, 0], [slant, 0], [slant, lenA], [0, lenA]);
  brick.poly([[x0, top, -v0], [x1, top, -v0], [xm, top + roofRise, -v0]], [[0, 0], [depth, 0], [depth / 2, roofRise]]);
  brick.poly([[x1, top, -v1], [x0, top, -v1], [xm, top + roofRise, -v1]], [[0, 0], [depth, 0], [depth / 2, roofRise]]);
  // a window in every bay on the west face (the concourse side), three storeys; the ground floor is round-headed.
  // On the east face only the top storey shows, above the shed's aisle roof.
  const bays = Math.floor(len / bay);
  const margin = (len - bays * bay) / 2;
  for (let i = 0; i < bays; i++) {
    const z = -(v0 + margin + (i + 0.5) * bay);
    for (let s = 0; s < storeys; s++) {
      const y = s * storey + (s === 0 ? 1.4 : 0.9);
      const target = s === 0 ? winArch : win;
      windowQuad(target, [x0 - 0.02, y, z], '-x');
      if (y >= 5.8) windowQuad(target, [x1 + 0.02, y, z], '+x');
    }
  }
  g.add(mesh(brick.build(), material('brick'), 'range-brick'));
  g.add(mesh(stone.build(), material('stone'), 'range-stone'));
  g.add(mesh(slate.build(), material('slate'), 'range-roof'));
  g.add(mesh(win.build(), decal('window'), 'range-windows'));
  g.add(mesh(winArch.build(), decal('windowArch'), 'range-windows-arched'));
  return g;
}
