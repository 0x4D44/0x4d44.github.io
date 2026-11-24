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
import type { ClockDial } from './clocks.ts';
import type { ShedLayout } from '../../core/station.ts';
import { Batch, material, windowNight, withBuildingNightMaterial } from './materials.ts';
import type { V2, V3 } from './materials.ts';
import { GROUND_Y } from './world.ts';

const R = SHED_SPAN_WIDTH / 2;

/** Roof ribs every 20 ft: ASSUMED, the published sources give no rib spacing. */
export const RIB_SPACING = 6.1;
/**
 * Width of the glazed strip along each crown, metres (the chord of the glazed arc): 29, so the glass covers about 72% of the vault's 180 degrees
 * and the lined, solid flank only the lowest 25 degrees or so each side. MEASURED from R-lighting-materials-b (the 2021 interior, looking up the
 * shed): the glazing stops where the pale lining begins, near the springing; the image slope of the longitudinal edges against the vanishing point
 * puts that edge 20 to 28 degrees up each flank (a camera yaw-only model, focal length and the vanishing point read off the photograph, the camera
 * a half to one and a quarter radii off the axis), so the glazed share is 72% plus or minus 6%, a half-angle of 59 to 71 degrees and a chord of
 * 27.4 to 30.2 m for the 16 m radius. The first build's 9 m (a quarter of that, ASSUMED) left the soffit a white lining. The photograph is the only
 * source: no drawing of the glazing's extent was found.
 */
export const GLAZED_STRIP_WIDTH = 29;
/** Thickness of the flank walls: ASSUMED. */
const WALL_THICK = 0.6;
/** Thickness of the south front: ASSUMED. */
const FRONT_THICK = 1.2;
/** The brick south front stands this far above the arch crowns (kept from the first build; ASSUMED). */
const FRONT_ABOVE_CROWN = 2.4;
export const TOWER_SIZE = 6.4; // ASSUMED
/**
 * Network Rail records six porch arches, three each side of the tower:
 * https://www.networkrail.co.uk/who-we-are/our-history/iconic-infrastructure/the-history-of-london-kings-cross-station/
 * Equal bays, 6.8 m openings, 2 m jambs and rise, 0.2 m threshold and 0.4 m stone rings
 * are ASSUMED. No door/glass infill is modelled.
 */
export const SOUTH_FRONT_ARCADES = { perSide: 3, openingWidth: 6.8, jambHeight: 2.0, archRise: 2.0, footAboveGround: 0.2, ringWidth: 0.4 } as const;
/** The porch arcade centres across a front `width` wide (from its own west end, x = 0), three each side of a central tower. */
export function southFrontArcadeCentres(width: number, towerWidth: number): number[] {
  const left = Array.from({ length: SOUTH_FRONT_ARCADES.perSide }, (_, i) => (i + 0.5) * (width - towerWidth) / (2 * SOUTH_FRONT_ARCADES.perSide));
  return [...left, ...left.map(x => width - x).reverse()];
}
/** The glass of each north gable starts this far above the platform; below it the arch is open for trains (ASSUMED). */
export const GABLE_GLASS_FROM = 9.5;
const ARC_STEPS = 12;
/** The roof skin (slate, glass, lining) stands this far outside the nominal arch radius: on top of the ribs' top boom. */
export const ROOF_SKIN = 0.3;
/**
 * The opening in the north end wall of the east aisle that platform 0's line runs out through. The OSM track of platform 0 (way 200526794)
 * runs from its buffer stop into the east aisle and crosses the north end (v = 243.84 to 244.44) at u = 71.19 to 71.17, 3.06 to 3.09 m west of
 * the east wall (measured 2026-11-24 with tools/track-walls.mjs shedTracks; the east wall stands where OSM puts it, so this is fixed to it, not
 * to the aisle's inner edge, which the 2026-11-24 realignment moved). The closed wall stood across it (tools/tests/track-walls.test.mjs).
 * Wikipedia ("London King's Cross railway station") places platform 0 to the east of the main shed, under the offices of the east side,
 * opened 2010, so its line passes out at the north end: the opening is sourced in that sense only. `fromEast`, the opening's centre line
 * measured west from the east wall, is that crossing. Its width (a 2.9 m train envelope on the line and 0.3 m more each side) and its head
 * (above the trains' roofs, below the aisle roof) are ASSUMED; no drawing of the real opening was found.
 */
export const EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 4.8 } as const;
/**
 * The central arcaded brick spine wall under the valley, on the line `layout.spine`, from the back of the south front (v = 0) to the north
 * gables (v = length), from the ground up to the valley, where the two vaults' roof skins meet (the springing plus (R + ROOF_SKIN) sin(valleyCut),
 * 8.75 m): brick, two storeys, the ribs landing on stone corbels on its faces. Sources for the wall itself: Historic England list entry 1078328,
 * Interior, a "round-arched brick central colonnade"
 * (https://historicengland.org.uk/listing/the-list/list-entry/1078328?section=official-list-entry), and Camden's delegated report 2009/5099/L
 * under 2007/2611/L, p3, the "central spine wall" (https://camdocs.camden.gov.uk/HPRMWebDrawer/Record/3357544/file/document). Neither gives a
 * dimension. The first build (signed off 2026-11-24, wrk_docs/2026.11.23 - KXLIVE - Shed realignment and centre arcade design.md) was all
 * ASSUMED and read as a squat viaduct under a grey fascia; the proportions below are MEASURED in memory (2026-11-24) from R-kx-shed-interior-c
 * (shed-c-arcade-2013.jpg, nearly square on to the wall) with the rib bay (RIB_SPACING, 6.1 m) as the scale, checked against R-kx-shed-interior-a
 * and -d (the stepped stone corbels). Labels: MEASURED (from the photograph, about +-15%), ASSUMED (not visible or not measurable), MODEL (set
 * by the model's own roof).
 *   thick    1.0 m, ASSUMED (unchanged; the photographs show the faces, not the thickness);
 *   lower storey: two round-headed openings in every rib bay, MEASURED: each `opening` 1.5 m clear (0.25 of the bay), their centres `pitch`
 *            2.66 m apart about the bay's middle, crowns `crown` 4.5 m (1.1 m under the rib landing); `sill` at the platform top
 *            (core/scene.ts PLATFORM_HEIGHT, 0.9 m) and `jamb` (crown less the half opening) ASSUMED (a train hides their feet);
 *   band     a stone string course `band` 0.3 m deep, proud by `bandOut` 0.08 m, its top at the ribs' landing: MEASURED position, ASSUMED size;
 *   corbels  a stepped stone corbel under every rib on each face the vault ribs land on: `corbel.height` 0.95 m and `corbel.wide` 0.6 m MEASURED
 *            (55 and 35-40 px of a 340 px bay), `corbel.out` 0.93 m from the face, so it reaches under the rib's inner boom (ribMembers: 1.3 m
 *            inside the springing), MODEL; its top `corbel.drop` 0.13 m under the springing, where the rib's foot boom ends, MODEL;
 *   upper storey: one great round-headed opening in every rib bay, `upperSpan` 4.5 m clear (MEASURED 0.72-0.76 of the bay), a pier of 1.6 m
 *            under each rib, its sill on the band. The photograph puts its crown about 3.9 m over the rib landing (about 8.6 m over the
 *            platform) with some 3 m of brick above it to the gutter; this model's vaults meet at 8.75 m, so the crown is held `upperBelowValley`
 *            0.45 m under the valley (8.30 m, 7.4 m over the platform), MODEL: the head is lower and squatter than the photograph's (2.8 m tall
 *            against 3.8 m) until the roof's valley is raised.
 * Where furniture stands beside it, it keeps `clear` (ASSUMED, 0.3 m) beyond the wall's face (web/src/furniture.ts bandAt).
 */
export const SPINE_WALL = {
  thick: 1.0, opening: 1.5, pitch: 2.66, sill: 0.9, jamb: 3.75, crown: 4.5, clear: 0.3,
  band: 0.3, bandOut: 0.08, corbel: { height: 0.95, wide: 0.6, out: 0.93, drop: 0.13 },
  upperSpan: 4.5, upperBelowValley: 0.45,
} as const;
/**
 * The massive brick pier at the north end of the spine, under the valley between the two north gables, as R-kx-front-d
 * (front-d-north-gables-2020.jpg) shows it: a buttressed brick pier standing between the gable arch rings and rising above them. MEASURED there
 * (in memory, the 32 m gable span as the scale, about 19 px/m): its face 2.3-4.7 m across, its top about 5.9 m over the gables' springing.
 * Here `half` 1.4 m either side of the spine (2.8 m across: the 4/5 island leaves platform 4's train envelope 2.61 m east of the spine line at
 * the north end, so this keeps 1.21 m, over the 1.0 m the shed's walls keep), from `south` 2.0 m inside the gable to `north` 1.0 m outside it
 * (proud of the arch rings), its lower stage to the valley, then an `upperHalf` 1.0 m stage to `top` 11.5 m (springing + 5.9 m), coped in stone.
 * The depth, the step and the coping are ASSUMED.
 */
export const NORTH_PIER = { half: 1.4, upperHalf: 1.0, south: 2.0, north: 1.0, top: 11.5 } as const;
/** The height at which the two vaults' roof skins meet over the spine: the top of the spine wall, metres. */
export function valleyTop(springing: number): number {
  return springing + (R + ROOF_SKIN) * Math.sin(valleyCut(R + ROOF_SKIN));
}
/**
 * The east arcade: the wall under the east vault's east springing, between the vault and the east aisle, on the line spine + one span. Since
 * the 2026-11-24 realignment widened the east aisle to 10.25 m, the vault's edge would otherwise stand on nothing. The real east side carries
 * the vault on an arcaded wall (the lead's brief of 2026-11-24; no source for it was read here, and no dimension), so it takes every figure
 * of SPINE_WALL, ASSUMED. It stands on platform 0's west half; furniture keeps the same inset from it. Since the 2026-11-24 rebuild of the spine
 * wall it takes that wall's lower storey, and the band and the corbels on the face the vault's ribs land on (R-kx-shed-interior-a and the B3
 * rubric: the side walls are arcades with the ribs on corbels), but it stops at the springing: there is no vault beyond it to open into, the
 * east vault's skin crosses its line just above the springing, and the east aisle's roof sits on it there.
 */
export const eastArcadeU = (layout: Pick<ShedLayout, 'spine'>): number => layout.spine + SHED_SPAN_WIDTH;
/** v of the centre of each opening of the spine wall: the middle of every rib bay. */
export function spineOpenings(length: number): number[] {
  const ribs = ribPositions(length);
  return ribs.slice(1).map((v, i) => (v + ribs[i]!) / 2);
}

/**
 * The Western Range: Cubitt's 1850s brick range along the west side of the shed, between the shed
 * wall and the Western Concourse. Its footprint is read off the OSM station building (260720558):
 * the concourse arc ends at v = 141.5 in the shed frame (the Range ends with it) and the footprint's
 * southern edge beside the front is at v = 8.1 to 8.9. Historic England list entry 1078328,
 * Details, describes the western office block as three storeys, with service rooms behind:
 * https://historicengland.org.uk/listing/the-list/list-entry/1078328?section=official-list-entry
 * Arup Journal 2/2012, p27 figs 4-5, locates the Range beside the shed and describes the roof's
 * load path through its cross-walls and buttresses:
 * https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=27
 * Extending three storeys along this entire procedural range and treating the shed/Range walls
 * as coincident are ASSUMED simplifications, not a dimensioned wall survey. The former LB09
 * section 2.3 attribution was not verified (see the corrected Camden references in buildShed).
 * Depth (see WESTERN_RANGE_DEPTH_BEFORE), storey height and bay width are also ASSUMED, as is the size of a flank window (1.2 m x 2.4 m, scaled from the brick centre's top-storey sash: see
 * buildWesternRange). Tests pin v0 and v1 to the OSM numbers.
 * `centre` is the funnel's v (the concourse's centre in this frame; tested to agree) and `block` how far from it the brick centre of the face runs
 * (R-a, R-ab, R-b: the funnel stands before a brick block of about 30 m, with dressed windows and tall arched openings, and glazed curtain
 * walls either side, which concourse.ts draws): the bays whose centres lie within it. ASSUMED, scaled off the photographs.
 */
export const WESTERN_RANGE = { v0: 8.1, v1: 141.5, depth: 9.954043532552989, storey: 4.1, storeys: 3, bay: 3.4, roofRise: 3.0, centre: 72.85, block: 17, windows: 6 } as const;
/**
 * The Range's depth before the 2026-11-24 shed realignment, metres (ASSUMED, as above). The realignment moved the shed's west wall
 * `layout.westShift` (2.045956467447011 m, measured) west into the Range; its concourse face, the Western Concourse built against it and the
 * frozen cameras that look at them stay where they were, so the Range lost that much of its depth: `depth` is this less the shift.
 */
export const WESTERN_RANGE_DEPTH_BEFORE = 12;

/** F7: Arup Journal 2/2012 pp24–25 (circulation), p27 fig4 (southern location), p29 (five bays and concrete/Y support):
 * https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf
 * ASSUMED station-frame alignment and dimensions: five 8 m bays at the existing south end,
 * 6.6 m clear width, 3.6 m head, 0.65 m shop recess, 0.7 m supports. Approximate plan scale, not a survey.
 * Only two adjoining public/shop interfaces are represented from the built concourse photograph:
 * https://mcaslan.agencyprojects.com/storage/app/uploads/public/69a/2c2/318/69a2c23185a88699376861.jpg
 * Their exact placement, width and glazing division are ASSUMED; upper floors and remaining frontage stay intact.
 */
const WESTERN_GATES = Array.from({ length: 5 }, (_, i) => WESTERN_RANGE.v0 + 4 + i * 8);
const WESTERN_SHOPS = [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 48];
const WESTERN_HEAD = 3.6;
const westernCuts = (shops = false): [number, number][] => [
  ...WESTERN_GATES.map(v => [v - 3.3, v + 3.3] as [number, number]),
  ...(shops ? WESTERN_SHOPS.map(v => [v - 1.4, v + 1.4] as [number, number]) : []),
];
/**
 * A tall round-headed opening on the ground floor (R-b): half its clear width, the height of its springing (the crown stands a half-width above), the stone ring's
 * width and how far its dark pane stands off the face. ASSUMED, scaled off the people in R-b.
 */
export const WESTERN_ARCH = { half: 1, spring: 3, ring: 0.2, pane: 0.04 } as const;
/** v of the centre of each bay along the Range: a whole number of bays, centred in its length. */
export function westernBays(): number[] {
  const { v0, v1, bay } = WESTERN_RANGE, n = Math.floor((v1 - v0) / bay);
  return Array.from({ length: n }, (_, i) => v0 + (v1 - v0 - n * bay) / 2 + (i + 0.5) * bay);
}
/** The v-limits of the brick centre: the outer edges of the bays whose centres lie within `block` of the funnel's axis. */
export function westernBlock(): [number, number] {
  const near = westernBays().filter(v => Math.abs(v - WESTERN_RANGE.centre) < WESTERN_RANGE.block);
  return [near[0]! - WESTERN_RANGE.bay / 2, near[near.length - 1]! + WESTERN_RANGE.bay / 2];
}
/** v of the centre of each window bay of the brick centre: about six larger bays (R-a, R-ab), not one to a 3.4 m bay, each over a tall opening. */
export function westernWindows(): number[] {
  const [a, b] = westernBlock(), n = WESTERN_RANGE.windows;
  return Array.from({ length: n }, (_, i) => a + ((i + 0.5) * (b - a)) / n);
}
/** The ground floor's tall round-headed openings, by v: one under each window of the brick centre and one in each bay beside it that no gateline bay or shop takes (a bay's 1.4 m span clear of their reveals). */
export function westernArches(): number[] {
  const [a, b] = westernBlock();
  return [...westernBays().filter(v => v < a || v > b), ...westernWindows()].filter(v => !westernCuts(true).some(([lo, hi]) => v + 0.7 > lo && v - 0.7 < hi)).sort((x, y) => x - y);
}
/** Split a solid at ground-level door intervals; retain the header, reveals and all other mass. */
function westernWall(b: Batch, x: number, d: number, a: number, z: number, top: number, cuts: [number, number][]): void {
  const box = (lo: number, hi: number, bottom: number, head: number): void => {
    if (hi > lo && head > bottom) b.box([x, (bottom + head) / 2, -(lo + hi) / 2], [d, head - bottom, hi - lo]);
  };
  let start = a;
  for (const [lo, hi] of cuts) {
    if (hi <= a || lo >= z) continue;
    box(start, Math.max(a, lo), GROUND_Y, top);
    box(Math.max(a, lo), Math.min(z, hi), WESTERN_HEAD, top);
    start = Math.min(z, hi);
  }
  box(start, z, GROUND_Y, top);
}

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
 * Cross-sections of the rib members, [depth in the truss plane, thickness across it], metres. The
 * restored shed's ribs are slender latticed trusses; these are ASSUMED (the first build had 0.38 x 0.30
 * booms and 0.16 x 0.14 webs, which read as heavy girders).
 */
export const MEMBER_SIZE = { boom: [0.26, 0.2], web: [0.1, 0.09] } as const;

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
    out.push({ c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], s: kind === 'boom' ? [len, MEMBER_SIZE.boom[0], MEMBER_SIZE.boom[1]] : [len, MEMBER_SIZE.web[0], MEMBER_SIZE.web[1]], rotZ: Math.atan2(dy, du), kind });
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
export function roofOpacity(cam: V3, layout: Pick<ShedLayout, 'width' | 'length' | 'crown' | 'spine'>, mode: RoofMode = 'auto'): number {
  if (mode === 'solid') return 1;
  if (mode === 'xray') return XRAY_OPACITY;
  const [x, y, z] = cam;
  if (x > 0 && x < layout.width && z < 0 && z > -layout.length && y < layout.crown + 1) return 1;
  const d = Math.hypot(x - layout.spine, y - layout.crown, z + layout.length / 2);
  return 1 - (1 - XRAY_OPACITY) * smoothstep(60, 220, d);
}

/** Opacity of the roof glazing: a bright daylit panel inside and close up, the see-through tint it had before from far off. ASSUMED look. */
export const GLASS_OPACITY = { near: 0.95, far: 0.36 } as const;

/** The glazing's opacity for a roof opacity `roof` (from roofOpacity): `near` at 1 (solid roof), `far` at XRAY_OPACITY, linear between. */
export function glazingOpacity(roof: number): number {
  const k = Math.min(1, Math.max(0, (roof - XRAY_OPACITY) / (1 - XRAY_OPACITY)));
  return GLASS_OPACITY.far + (GLASS_OPACITY.near - GLASS_OPACITY.far) * k;
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
  // the hands are clocks.ts's, turned to the scene clock
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t });
}

/**
 * A flat shape built in the xy plane, turned to face -z (north, out of the shed's end): the winding reversed and the normals with it. A
 * ShapeGeometry's front face looks +z, which is the way the front's great windows look out; the gable's look out the other way, and the glass
 * mirrors the sky only on its front face (`skyGlint`), so it is the outside of the gable that must be the front.
 */
function facingNorth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = g.getIndex() as THREE.BufferAttribute;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  const normal = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) normal.setZ(i, -normal.getZ(i));
  return g;
}

function halfDisc(uc: number, springing: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(uc - r, springing);
  s.absarc(uc, springing, r, Math.PI, 0, true);
  s.lineTo(uc - r, springing);
  return s;
}

function segmentalArchOpening(uc: number, foot: number, halfWidth: number, jamb: number, rise: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(uc - halfWidth, foot); s.lineTo(uc - halfWidth, foot + jamb);
  s.absellipse(uc, foot + jamb, halfWidth, rise, Math.PI, 0, true);
  s.lineTo(uc + halfWidth, foot); s.lineTo(uc - halfWidth, foot);
  return s;
}

function segmentalArchRing(uc: number, spring: number, halfWidth: number, rise: number, thickness: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(uc - halfWidth - thickness, spring);
  s.absellipse(uc, spring, halfWidth + thickness, rise + thickness, Math.PI, 0, true);
  s.lineTo(uc + halfWidth, spring);
  s.absellipse(uc, spring, halfWidth, rise, 0, Math.PI, false);
  s.lineTo(uc - halfWidth - thickness, spring);
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

function mesh<M extends THREE.Material>(g: THREE.BufferGeometry, m: M, name: string): THREE.Mesh<THREE.BufferGeometry, M> {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  return o;
}

const frontWashMaterials = new Map<string, THREE.MeshLambertMaterial>();

/** Rake the south piers with amber light and pick out the clock stage and
 * its projecting cornice. The existing broad flood remains the fill. For the front, `width` is the front's own width
 * and the mesh's x runs from its west end, so the spine (and the tower) is at width / 2. */
function frontWash(source: 'brickFoot' | 'stoneFoot', kind: 'front' | 'tower', width: number): THREE.MeshLambertMaterial {
  const key = `kx-front-wash-${source}-${kind}-${width}`;
  const cached = frontWashMaterials.get(key);
  if (cached) return cached;
  const original = material(source) as THREE.MeshLambertMaterial;
  const m = original.clone();
  m.defines = { ...original.defines };
  const light = kind === 'front' ? /* glsl */`
  float x = vKxWashPos.x;
  float endPier = min(abs(x-0.5),abs(x-${(width-0.5).toFixed(4)}));
  float spine = abs(x-${(width/2).toFixed(4)});
  float spread = 1.25 + 0.18*y;
  float edge = exp(-pow(endPier/spread,2.0)) + exp(-pow(spine/spread,2.0));
  float shoulder = abs(abs(spine-${R.toFixed(4)})-${(R*0.88).toFixed(4)});
  float arch = exp(-pow(shoulder/(1.7+0.085*y),2.0)) * smoothstep(1.0,6.0,y);
  float wash = (0.84*edge*exp(-y/7.8) + 0.17*arch*exp(-y/11.0)) * max(vKxWashNormal.z,0.0);
` : /* glsl */`
  float faceU = dot(abs(vKxWashPos.xz),abs(vKxWashNormal.zx));
  float rail = exp(-pow(abs(faceU-2.6)/(0.61+0.078*y),2.0));
  float shaft = (0.045+0.76*rail)*exp(-y/8.5);
  float stage = exp(-pow(abs(y-${(CLOCK_TOWER_HEIGHT-5.8).toFixed(4)})/1.95,2.0));
  float stageEdge = 0.62 + 0.38*smoothstep(0.8,2.3,faceU);
  float eaves = exp(-pow(abs(y-${(CLOCK_TOWER_HEIGHT-3.0).toFixed(4)})/0.65,2.0));
  float wash = (shaft + 0.33*stage*stageEdge + 0.36*eaves) * (1.0-max(vKxWashNormal.y,0.0));
`;
  m.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uWinNight = windowNight;
    const varying = '\nvarying vec3 vKxWashPos;\nvarying vec3 vKxWashNormal;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${varying}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKxWashPos = position; vKxWashNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${varying}\nuniform float uWinNight;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if ( uWinNight > 0.003 ) {
  float y = max(vKxWashPos.y,0.0);
  ${light}
  // The texture colours both the light and how strongly each course picks it up.
  float texel = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
  float detail = mix(0.68,1.13,smoothstep(0.16,0.43,texel));
  totalEmissiveRadiance += vec3(1.0,0.66,0.25) * diffuseColor.rgb * (wash*detail*uWinNight);
}
`);
    // The shared roof-shade pass sees the night uniform and adds the usual
    // contact shade and architectural flood after the wash.
    original.onBeforeCompile(shader, renderer);
  };
  m.customProgramCacheKey = () => `${original.customProgramCacheKey()}+${key}`;
  frontWashMaterials.set(key, m);
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
  const spine = layout.spine;
  const centres = [spine - R, spine + R];
  // the south front spans the two vaults only, centred on the spine; the east aisle's south end is a lower plain wall
  const fx0 = spine - 2 * R, fx1 = spine + 2 * R, FW = fx1 - fx0;
  const phi = glazedHalfAngle();
  const disposables: THREE.BufferGeometry[] = [];

  // ---- roof: slate flanks, glazed crown, pale lining underneath --------------------------------
  // The roof sheeting rides on top of the ribs, so the whole truss shows beneath it from inside: the
  // cladding, its pale lining and the glass all sit on the outer face of the top boom (rt + half its depth).
  // Where the two vaults meet the skins would overlap (each is R + ROOF_SKIN, the centres are 2R apart), so
  // each skin stops on the valley line instead, `cut` radians up from its springing, and the brick spine wall
  // (below) stands from the ground up to there.
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
    glass.push(vaultBand(uc, sp, R + ROOF_SKIN, Math.PI / 2 - phi, Math.PI / 2 + phi, L, ARC_STEPS)); // (the band is 130 degrees now, not 33: four chords would flatten the crown by half a metre)
  });
  const cladMat = (material('slate') as THREE.MeshLambertMaterial).clone();
  cladMat.transparent = true; // its opacity changes with the view, see roofOpacity
  const cladding = mesh(mergeGeometries(flanks, false), cladMat, 'shed-roof-cladding');
  const roofMode = opts.roof ?? 'auto';
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  // the glazing follows the cladding: a bright daylit panel from inside or close up, a see-through tint from far off
  const glassMat = (material('shedGlass') as THREE.MeshLambertMaterial).clone();
  glassMat.opacity = glazingOpacity(1);
  cladding.onBeforeRender = (_renderer, _scene, camera) => {
    inverse.copy(group.matrixWorld).invert();
    local.copy(camera.position).applyMatrix4(inverse);
    const o = roofOpacity([local.x, local.y, local.z], layout, roofMode);
    cladMat.opacity = o;
    cladMat.depthWrite = o > 0.98;
    glassMat.opacity = glazingOpacity(o);
  };
  cladding.renderOrder = 2;
  group.add(cladding);
  const glassMesh = mesh(mergeGeometries(glass, false), glassMat, 'shed-roof-glass');
  glassMesh.renderOrder = 3;
  group.add(glassMesh);
  group.add(mesh(mergeGeometries(lining, false), material('lining'), 'shed-roof-lining'));
  disposables.push(...flanks, ...glass, ...lining);

  // ---- ribs: one lattice truss, instanced along both vaults ------------------------------------
  const rib = new Batch();
  for (const m of ribMembers(sp)) rib.box(m.c, m.s, { rotZ: m.rotZ, skip: m.kind === 'boom' ? ['+x', '-x'] : ['+x', '-x', '+y', '-y'] });
  const ribPos = ribPositions(L);
  const ribs = new THREE.InstancedMesh(rib.build(), material('ribPaint'), ribPos.length * centres.length);
  const mat = new THREE.Matrix4();
  let k = 0;
  for (const uc of centres) for (const v of ribPos) ribs.setMatrixAt(k++, mat.makeTranslation(uc, 0, -v));
  ribs.name = 'shed-ribs';
  ribs.instanceMatrix.needsUpdate = true;
  group.add(ribs);
  // the valley: where the two roofs meet, the brick spine wall (SPINE_WALL, buildSpineWall) closes the gap from the springing up to the cut
  // skins. Until 2026-11-24 a board-lined grey fascia stood there on a wall stopped at the springing; R-kx-shed-interior-c shows brick up to
  // the gutter, the ribs landing on stone corbels on the wall's faces. Camden's delegated report 2009/5099/L under 2007/2611/L, p3, mentions
  // late-C20 timber boarding above the central spine wall (https://camdocs.camden.gov.uk/HPRMWebDrawer/Record/3357544/file/document); the
  // photographs of 2013-2019 do not show it as a continuous fascia.
  // Camden's delegated report 2009/5177/L under 2007/2611/L, p3, records submission of paint-removal
  // trials and Architectural Paint Analysis Volume 1, but does not specify the selected restored palette:
  // https://camdocs.camden.gov.uk/HPRMWebDrawer/Record/3355818/file/document
  // The drawn ironwork and lining paint colours remain ASSUMED (see materials.ts).
  const valleyY = valleyTop(sp);

  // ---- brick: flank walls with piers and windows, the aisle roofs, the north aisle ends --------
  const brick = new Batch();
  const stone = new Batch();
  const slate = new Batch();
  const windows = new Batch();
  const windowsArch = new Batch();
  for (const [x0, outward] of [[0, -1], [W, 1]] as [number, number][]) {
    // the wall is a box outside the line x0 (west wall to the west, east wall to the east)
    const xc = x0 + (outward * WALL_THICK) / 2;
    westernWall(brick, xc, WALL_THICK, 0, L, wallH, outward < 0 ? westernCuts() : []);
    stone.box([xc, wallH + 0.15, -L / 2], [WALL_THICK + 0.5, 0.3, L]); // coping
    for (const v of ribPos) {
      // Trim only piers intersecting the five passage intervals; keep their heads supporting the roof.
      const bottom = outward < 0 && westernCuts().some(([a, b]) => v + 0.45 > a && v - 0.45 < b) ? WESTERN_HEAD : GROUND_Y;
      const pierH = wallH - bottom - 0.3;
      brick.box([x0 + outward * (WALL_THICK + 0.25), (wallH + bottom) / 2 - 0.15, -v], [0.5, pierH, 0.9]); // pier outside
      brick.box([x0 - outward * 0.15, (wallH + bottom) / 2 - 0.15, -v], [0.3, pierH, 0.9]); // pier inside
    }
    // a window in every bay between the piers, on the inner face (and the outer face of the east wall)
    for (let i = 0; i + 1 < ribPos.length; i++) {
      const z = -(((ribPos[i] as number) + (ribPos[i + 1] as number)) / 2);
      if (outward > 0 || !westernCuts().some(([a, b]) => -z + 0.7 > a && -z - 0.7 < b)) windowQuad(windows, [x0 - outward * 0.02, 1.9, z], outward < 0 ? '+x' : '-x');
      if (outward > 0) windowQuad(windows, [x0 + WALL_THICK + 0.02, 1.9, z], '+x');
    }
  }
  // aisle roofs: flat slabs at the springing, slate on top (ASSUMED flat; the real aisle roofs are not surveyed). Since the 2026-11-24
  // realignment there is no west aisle (aisleWest = 0), so only the east one is drawn.
  const aisles: [number, number][] = ([[0, layout.aisleWest], [W - layout.aisleEast, W]] as [number, number][]).filter(([a, b]) => b - a > 1e-6);
  // closed underneath too: at 10.25 m wide (since the realignment) the east aisle's roof is in plain view from platforms 0 and 1, and an open
  // underside showed the sky through it
  for (const [a, b] of aisles) slate.box([(a + b) / 2, wallH - 0.15, -L / 2], [b - a, 0.3, L]);
  // the north end of each aisle is closed by a brick wall; the east one is pierced where platform 0's line runs out (EAST_AISLE_OPENING)
  if (layout.aisleWest > 1e-6) brick.box([layout.aisleWest / 2, (wallH + GROUND_Y) / 2, -L - WALL_THICK / 2], [layout.aisleWest, wallH - GROUND_Y, WALL_THICK]);
  if (layout.aisleEast > 1e-6) {
    const z = -L - WALL_THICK / 2, a = W - layout.aisleEast, head = EAST_AISLE_OPENING.head;
    const o0 = Math.max(a, W - EAST_AISLE_OPENING.fromEast - EAST_AISLE_OPENING.width / 2), o1 = Math.min(W, W - EAST_AISLE_OPENING.fromEast + EAST_AISLE_OPENING.width / 2);
    brick.box([(a + W) / 2, (wallH + head) / 2, z], [W - a, wallH - head, WALL_THICK]); // over the opening
    if (o0 > a) brick.box([(a + o0) / 2, (head + GROUND_Y) / 2, z], [o0 - a, head - GROUND_Y, WALL_THICK]); // the jamb on the vault side
    if (W > o1) brick.box([(o1 + W) / 2, (head + GROUND_Y) / 2, z], [W - o1, head - GROUND_Y, WALL_THICK]); // the jamb against the east wall
  }
  const spineBrick = new Batch();
  const spineStone = new Batch();
  buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);
  buildNorthPier(spineBrick, spineStone, spine, L, valleyY);
  // the east vault's east springing, between the vault and the east aisle, stands on an arcade of the spine wall's pattern (EAST_ARCADE)
  const eastArcade = new Batch();
  buildSpineWall(eastArcade, spineStone, eastArcadeU(layout), L, sp, sp, [-1]);

  // ---- the south front: across the two vaults, centred on the spine (the mesh's x runs from its west end, fx0) ------------
  const outline = new THREE.Shape([new THREE.Vector2(0, GROUND_Y), new THREE.Vector2(FW, GROUND_Y), new THREE.Vector2(FW, frontTop), new THREE.Vector2(0, frontTop)]);
  for (const uc of centres) outline.holes.push(halfDisc(uc - fx0, sp, R));
  const entryR = SOUTH_FRONT_ARCADES.openingWidth / 2;
  const entryFoot = GROUND_Y + SOUTH_FRONT_ARCADES.footAboveGround;
  const entryCentres = southFrontArcadeCentres(FW, TOWER_SIZE).map(x => x + fx0);
  for (const x of entryCentres) outline.holes.push(segmentalArchOpening(x - fx0, entryFoot, entryR, SOUTH_FRONT_ARCADES.jambHeight, SOUTH_FRONT_ARCADES.archRise));
  const frontGeo = new THREE.ExtrudeGeometry(outline, { depth: FRONT_THICK, bevelEnabled: false, curveSegments: 40 });
  frontGeo.translate(0, 0, -FRONT_THICK);
  const frontMesh = withBuildingNightMaterial(mesh(frontGeo, material('brickFoot'), 'shed-front'), frontWash('brickFoot', 'front', FW));
  frontMesh.position.x = fx0;
  group.add(frontMesh);
  // stone dressings that stand proud of the front plane (z = 0) by `out` metres
  const proud = (cx: number, cy: number, sx: number, sy: number, out: number): void => stone.box([cx, cy, (out - FRONT_THICK) / 2], [sx, sy, FRONT_THICK + out]);
  let plinthStart = fx0 - 0.4;
  for (const x of entryCentres) {
    const left = x - entryR, right = x + entryR;
    if (left > plinthStart) proud((plinthStart + left) / 2, GROUND_Y + 0.7, left - plinthStart, 1.4, 0.35);
    plinthStart = right;
  }
  if (plinthStart < fx1 + 0.4) proud((plinthStart + fx1 + 0.4) / 2, GROUND_Y + 0.7, fx1 + 0.4 - plinthStart, 1.4, 0.35); // plinth interrupted at each entrance
  proud(spine, sp - 0.3, FW + 0.4, 0.6, 0.3); // sill course at the springing
  proud(spine, frontTop - 0.45, FW + 1.0, 0.9, 0.7); // cornice
  proud(spine, frontTop + 0.15, FW + 0.6, 0.3, 0.4); // its coping
  for (const x of [fx0 + 0.5, fx1 - 0.5]) proud(x, (frontTop + GROUND_Y) / 2, 1.0, frontTop - GROUND_Y - 1.0, 0.25); // end piers
  // the east aisle's south end: a plain brick wall up to the aisle roof at the springing (ASSUMED height and finish; no source shows it),
  // set flush with the front's back face and coped in stone
  if (W - fx1 > 1e-6) {
    brick.box([(fx1 + W) / 2, (wallH + GROUND_Y) / 2, -FRONT_THICK / 2], [W - fx1, wallH - GROUND_Y, FRONT_THICK]);
    stone.box([(fx1 + W) / 2, wallH + 0.15, -FRONT_THICK / 2], [W - fx1, 0.3, FRONT_THICK + 0.2]);
  }
  const entryRings = entryCentres.map(x => new THREE.ExtrudeGeometry(segmentalArchRing(x, entryFoot + SOUTH_FRONT_ARCADES.jambHeight, entryR, SOUTH_FRONT_ARCADES.archRise, SOUTH_FRONT_ARCADES.ringWidth), { depth: 0.5, bevelEnabled: false, curveSegments: 24 }));
  group.add(mesh(mergeGeometries(entryRings, false), material('stone'), 'shed-front-porch-arches'));
  disposables.push(...entryRings);
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
  group.add(lunMesh, mesh(bars.build(), material('ribPaint'), 'shed-front-bars'));

  // ---- the north gables: glass above the trains' height, in bars, framed in stone --------------
  const gableGeos: THREE.BufferGeometry[] = [];
  const gBars = new Batch();
  const aBase = Math.asin((GABLE_GLASS_FROM - sp) / R);
  for (const uc of centres) {
    const s = new THREE.Shape();
    s.moveTo(uc - R * Math.cos(aBase), GABLE_GLASS_FROM);
    s.absarc(uc, sp, R, Math.PI - aBase, aBase, true);
    s.lineTo(uc - R * Math.cos(aBase), GABLE_GLASS_FROM);
    const g = facingNorth(new THREE.ShapeGeometry(s, 40));
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
  group.add(gableGlass, mesh(gBars.build(), material('ribPaint'), 'shed-gable-bars'), mesh(mergeGeometries(rings, false), material('stone'), 'shed-arch-rings'));
  disposables.push(...rings, ...lunGlass, ...gableGeos);

  // ---- the clock tower, centred on the spine, standing just in front of the south front --------
  group.add(buildTower(spine));

  // ---- the Western Range -----------------------------------------------------------------------
  if (opts.range !== false) group.add(buildWesternRange());

  group.add(mesh(brick.build(), material('brickFoot'), 'shed-brick'));
  // its own mesh, the same brick, so that it is not a sun-shadow caster (lighting.ts SHADOW_CASTERS): the pass has no room for it
  group.add(mesh(spineBrick.build(), material('brickFoot'), 'shed-spine'));
  group.add(mesh(eastArcade.build(), material('brickFoot'), 'shed-east-arcade')); // not a sun-shadow caster either, for the same reason
  group.add(mesh(spineStone.build(), material('stoneFoot'), 'shed-spine-stone')); // the two walls' bands and corbels: not a sun-shadow caster either
  group.add(mesh(stone.build(), material('stoneFoot'), 'shed-stone'));
  group.add(mesh(slate.build(), material('slate'), 'shed-aisle-roofs'));
  group.add(mesh(windows.build(), material('sash'), 'shed-windows'));
  group.add(mesh(windowsArch.build(), material('sashArch'), 'shed-front-windows'));
  for (const g of disposables) g.dispose();
  group.rotation.y = -layout.heading;
  group.position.set(layout.origin[0], 0, layout.origin[1]);
  return group;
}

type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/**
 * One storey of an arcaded wall on the line u = `x`, from y0 to y1, along v from 0 to `length`: piers between the openings, and over each
 * opening (centre `vc`, half width `r`, its semicircular head springing at `jamb`) the brick above its crown and the head (both faces, the
 * soffit). The piers' and the spandrels' tops and feet are left out (the storey above or below, or the caller, closes them).
 */
function arcadeStorey(brick: Batch, x: number, length: number, y0: number, y1: number, opens: { vc: number; r: number; jamb: number }[]): void {
  const { thick } = SPINE_WALL;
  const h = thick / 2, n = 8; // n chords to a quarter of each head
  const box = (v0: number, v1: number, b0: number, b1: number, skip: Face[]): void => {
    if (v1 - v0 > 1e-6 && b1 - b0 > 1e-6) brick.box([x, (b0 + b1) / 2, -(v0 + v1) / 2], [thick, b1 - b0, v1 - v0], { skip });
  };
  let start = 0;
  for (const { vc, r, jamb } of opens) {
    const crown = jamb + r;
    box(start, vc - r, y0, y1, ['+y', '-y']); // the pier
    box(vc - r, vc + r, crown, y1, ['+y', '-y', '+z', '-z']); // the brick over the head
    // the head: a semicircle about (vc, jamb); on each face two spandrels, fans from the corner at the crown's height
    const arc = (k: number): [number, number] => [vc - r * Math.cos((Math.PI * k) / (2 * n)), jamb + r * Math.sin((Math.PI * k) / (2 * n))];
    for (const side of [-1, 1]) {
      const xf = x + side * h;
      const facing: V3 = [side, 0, 0];
      for (const mirror of [1, -1]) {
        const corner: V3 = [xf, crown, -(vc - mirror * r)];
        const pts: V3[] = [corner];
        for (let k = 0; k <= n; k++) { const [v, y] = arc(k); pts.push([xf, y, -(vc + mirror * (v - vc))]); }
        brick.poly(pts, pts.map((p): V2 => [-p[2], p[1]]), { facing });
      }
    }
    // the soffit of the head, facing in toward its centre
    for (let k = 0; k < 2 * n; k++) {
      const a0 = (Math.PI * k) / (2 * n), a1 = (Math.PI * (k + 1)) / (2 * n);
      const p0: [number, number] = [vc - r * Math.cos(a0), jamb + r * Math.sin(a0)], p1: [number, number] = [vc - r * Math.cos(a1), jamb + r * Math.sin(a1)];
      const am = (a0 + a1) / 2;
      brick.poly([[x - h, p0[1], -p0[0]], [x + h, p0[1], -p0[0]], [x + h, p1[1], -p1[0]], [x - h, p1[1], -p1[0]]], [[0, r * a0], [thick, r * a0], [thick, r * a1], [0, r * a1]], { facing: [0, -Math.sin(am), -Math.cos(am)] });
    }
    // the jambs' faces are the piers' ends; between the jamb top and the head the reveal is the head's soffit
    start = vc + r;
  }
  box(start, length, y0, y1, ['+y', '-y']); // the last pier
}

/** The lower storey's openings of the spine wall (SPINE_WALL): two in every rib bay, `pitch` apart about its middle. */
export function spineLowerOpenings(length: number): { vc: number; r: number; jamb: number }[] {
  const { opening, pitch, jamb } = SPINE_WALL;
  return spineOpenings(length).flatMap(v => [v - pitch / 2, v + pitch / 2].map(vc => ({ vc, r: opening / 2, jamb })));
}
/** The upper storey's great openings of the spine wall under a valley at `top`: one in every rib bay, its crown `upperBelowValley` under the valley. */
export function spineUpperOpenings(length: number, top: number): { vc: number; r: number; jamb: number }[] {
  const r = SPINE_WALL.upperSpan / 2;
  return spineOpenings(length).map(vc => ({ vc, r, jamb: top - SPINE_WALL.upperBelowValley - r }));
}
/** The height of the band's top and of the corbels' tops: where the ribs' feet land, a little under the springing. */
export const ribLanding = (springing: number): number => springing - SPINE_WALL.corbel.drop;

/**
 * An arcaded brick wall (SPINE_WALL) on the line u = `x`, from v = 0 to `length`, ground to `top`, into the brick batch; its stone (the band and
 * a corbel under every rib) into `stone`, on the faces `faces` (-1 west, +1 east) that vault ribs land on. Under the ribs' landing a lower
 * storey with two openings a bay; when `top` stands well over the springing (the spine, up to the valley), an upper storey of one great
 * opening a bay from the band to the top, and the wall's top closed. The caller gives the brick its own batch (`shed-spine`,
 * `shed-east-arcade`), and the stone `shed-spine-stone`: none of them casts a sun shadow.
 */
export function buildSpineWall(brick: Batch, stone: Batch, x: number, length: number, springing: number, top: number, faces: readonly (-1 | 1)[]): void {
  const { thick, sill, band, bandOut, corbel } = SPINE_WALL;
  const h = thick / 2;
  const landing = ribLanding(springing);
  const upper = top > springing + 1;
  const mid = upper ? landing : top;
  // the foot, inside the island platform: its top 0.02 m under the platform's, so the platform top shows in the openings without fighting it
  brick.box([x, (GROUND_Y + sill - 0.02) / 2, -length / 2], [thick, sill - 0.02 - GROUND_Y, length], { skip: ['-y'] });
  arcadeStorey(brick, x, length, sill - 0.02, mid, spineLowerOpenings(length));
  if (upper) {
    const opens = spineUpperOpenings(length, top);
    arcadeStorey(brick, x, length, landing, top, opens);
    // the sill of each great opening, and the wall's top under the valley (seen from above when the roof is x-rayed)
    for (const { vc, r } of opens) brick.poly([[x - h, landing, -(vc - r)], [x + h, landing, -(vc - r)], [x + h, landing, -(vc + r)], [x - h, landing, -(vc + r)]], [[0, vc - r], [thick, vc - r], [thick, vc + r], [0, vc + r]], { facing: [0, 1, 0] });
    brick.poly([[x - h, top, 0], [x + h, top, 0], [x + h, top, -length], [x - h, top, -length]], [[0, 0], [thick, 0], [thick, length], [0, length]], { facing: [0, 1, 0] });
  }
  for (const side of faces) {
    const f = x + side * h;
    const back: Face = side > 0 ? '-x' : '+x';
    stone.box([f + side * bandOut / 2, landing - band / 2, -length / 2], [bandOut, band, length], { skip: [back] });
    // the corbel: two stepped blocks, the upper one reaching under the rib's inner boom
    const up = corbel.height * 0.45;
    for (const v of ribPositions(length)) {
      stone.box([f + side * corbel.out / 2, landing - up / 2, -v], [corbel.out, up, corbel.wide], { skip: [back] });
      stone.box([f + side * corbel.out * 0.3, landing - up - (corbel.height - up) / 2, -v], [corbel.out * 0.6, corbel.height - up, corbel.wide * 0.8], { skip: [back] });
    }
  }
}

/** The north pier (NORTH_PIER) at the spine's north end, `valley` the height of the valley: brick into `brick`, its coping into `stone`. */
export function buildNorthPier(brick: Batch, stone: Batch, x: number, length: number, valley: number): void {
  const { half, upperHalf, south, north, top } = NORTH_PIER;
  const v0 = length - south, v1 = length + north;
  brick.box([x, (GROUND_Y + valley) / 2, -(v0 + v1) / 2], [2 * half, valley - GROUND_Y, v1 - v0], { skip: ['-y'] });
  brick.box([x, (valley + top) / 2, -(v0 + v1) / 2], [2 * upperHalf, top - valley, v1 - v0], { skip: ['-y'] });
  stone.box([x, top + 0.15, -(v0 + v1) / 2], [2 * upperHalf + 0.3, 0.3, v1 - v0 + 0.3]);
}

/**
 * The built south front has its clock in the upper brick turret immediately below the eaves,
 * without a further arched-window stage above it (JMP photograph):
 * https://mcaslan.agencyprojects.com/storage/app/uploads/public/69a/2be/fdc/69a2befdcf61f464137352.jpg
 * Historic England 1078328 identifies the pyramidal roof and weather vane:
 * https://historicengland.org.uk/listing/the-list/list-entry/1078328
 * Stage dimensions, cornices, shallow cap, vane geometry/finish, 6.4 m width and 3.4 m clock
 * diameter are ASSUMED from that appearance, not a surveyed elevation. ASSUMED: the published
 * 112 ft overall height includes the vane; the previous model allocated it all to the cap.
 */
export function buildTower(x: number): THREE.Group {
  const tower = new THREE.Group();
  tower.name = 'clock-tower';
  const tb = new Batch();
  const ts = new Batch();
  const tslate = new Batch();
  const tw = TOWER_SIZE;
  const shaftTop = CLOCK_TOWER_HEIGHT - 8.2; // ASSUMED stage proportions, metres
  const eavesY = CLOCK_TOWER_HEIGHT - 3.3;
  const capTop = CLOCK_TOWER_HEIGHT - 1.3;
  const clockY = (shaftTop + eavesY) / 2;
  tb.box([0, (shaftTop + GROUND_Y) / 2, 0], [tw, shaftTop - GROUND_Y, tw]);
  ts.box([0, GROUND_Y + 0.9, 0], [tw + 0.7, 1.8, tw + 0.7]); // plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ts.box([sx * (tw / 2 + 0.05), (shaftTop + GROUND_Y) / 2 + 0.9, sz * (tw / 2 + 0.05)], [0.9, shaftTop - GROUND_Y - 1.8, 0.9]); // quoins
  ts.box([0, shaftTop, 0], [tw + 0.4, 0.4, tw + 0.4]);
  tb.box([0, (shaftTop + eavesY) / 2, 0], [tw, eavesY - shaftTop, tw]); // clock turret
  ts.box([0, eavesY + 0.325, 0], [tw + 1.2, 0.65, tw + 1.2]); // ASSUMED eaves cornice
  const capBase = eavesY + 0.65;
  const hb = tw / 2 + 0.3;
  const apex: V3 = [0, capTop, 0];
  const corners: V3[] = [[-hb, capBase, hb], [hb, capBase, hb], [hb, capBase, -hb], [-hb, capBase, -hb]];
  const slant = Math.hypot(hb, capTop - capBase);
  for (let i = 0; i < 4; i++) tslate.poly([corners[i] as V3, corners[(i + 1) % 4] as V3, apex], [[0, 0], [2 * hb, 0], [hb, slant]]);
  tslate.poly([corners[3] as V3, corners[2] as V3, corners[1] as V3, corners[0] as V3], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // a clock on every face, in a stone surround directly below the eaves
  const clockMat = clockMaterial();
  const clockGeo = new THREE.CircleGeometry(1.7, 40);
  const surroundGeo = new THREE.RingGeometry(1.7, 2.15, 40);
  const faces = new THREE.Group();
  const dirs: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // south, east, north, west: (x, z)
  for (const [nx, nz] of dirs) {
    const face = new THREE.Mesh(clockGeo, clockMat);
    face.position.set(nx * (tw / 2 + 0.06), clockY, nz * (tw / 2 + 0.06));
    face.rotation.y = Math.atan2(nx, nz);
    const ring = new THREE.Mesh(surroundGeo, material('stone'));
    ring.position.set(nx * (tw / 2 + 0.05), clockY, nz * (tw / 2 + 0.05));
    ring.rotation.y = face.rotation.y;
    faces.add(ring, face);
  }
  tower.userData.clockDials = dirs.map(([nx, nz]): ClockDial => ({ centre: [nx * (tw / 2 + 0.06), clockY, nz * (tw / 2 + 0.06)], normal: [nx, 0, nz], up: [0, 1, 0], radius: 1.7 })); // clocks.ts
  // ASSUMED simplified vane: mast, cardinal cross and arrow; its precise metalwork is not surveyed.
  const vane = new Batch(), vaneY = CLOCK_TOWER_HEIGHT - 0.65;
  vane.box([0, (capTop - 0.15 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]);
  vane.box([0, vaneY, 0], [1.8, 0.04, 0.04]);
  vane.box([0, vaneY, 0], [0.04, 0.04, 1.8]);
  const arrow: V3[] = [[0.8, vaneY - 0.18, 0], [1.35, vaneY, 0], [0.8, vaneY + 0.18, 0]];
  vane.poly(arrow); vane.poly([...arrow].reverse());
  const brick = withBuildingNightMaterial(mesh(tb.build(), material('brickFoot'), 'tower-brick'), frontWash('brickFoot', 'tower', tw));
  const stone = withBuildingNightMaterial(mesh(ts.build(), material('stoneFoot'), 'tower-stone'), frontWash('stoneFoot', 'tower', tw));
  tower.add(brick, stone, mesh(tslate.build(), material('slate'), 'tower-cap'), faces, mesh(vane.build(), material('steel'), 'tower-vane'));
  tower.position.set(x, 0, tw / 2 + 0.15);
  return tower;
}

/**
 * The Western Range in the shed's local frame: a three-storey brick block along the shed's west
 * wall with a stone plinth, string courses and a pitched slate roof, and a southern ground-floor
 * gateline/public frontage. Its concourse face follows R-a, R-ab and R-b: a brick centre
 * (WESTERN_RANGE.block) of dressed sash windows over a row of tall round-headed openings, a stone
 * corner at each end, and either side the row of openings and a small window in the top storey of
 * each bay (ASSUMED size, where it is drawn), the curtain wall above the openings being
 * concourse.ts's. See WESTERN_RANGE for what is OSM and what is ASSUMED. Its east face stands 0.01 m
 * inside the shed's west wall, so the shed wall covers overlapping faces below the aisle roof
 * except at the five gateline passages.
 */
export function buildWesternRange(): THREE.Group {
  const { v0, v1, depth, storey, roofRise } = WESTERN_RANGE;
  const g = new THREE.Group();
  g.name = 'western-range';
  const brick = new Batch();
  const stone = new Batch();
  const slate = new Batch();
  const win = new Batch();
  const panes = new Batch(), frames = new Batch();
  const x1 = -0.01;
  const x0 = x1 - depth;
  const eaves = storey * WESTERN_RANGE.storeys;
  const len = v1 - v0;
  const xm = (x0 + x1) / 2;
  const [b0, b1] = westernBlock(), arches = westernArches(), { half, spring, ring, pane } = WESTERN_ARCH;
  /** A polygon on the west face, facing the concourse, its texture running over the face in metres. */
  const west = (b: Batch, pts: V3[]): void => b.poly(pts, pts.map((p): V2 => [-p[2], p[1]]), { facing: [-1, 0, 0] });
  westernWall(brick, xm, depth, v0, v1, eaves, westernCuts(true));
  westernWall(stone, xm, depth + 0.5, v0 - 0.25, v1 + 0.25, GROUND_Y + 1, [...westernCuts(true), ...arches.map((v): [number, number] => [v - half - ring, v + half + ring])]); // plinth, broken at every opening
  // the string course under the first floor runs the whole length (it is the curtain wall's sill); the second course and the cornice only along the brick centre
  for (const [y, d, h, a, b] of [[storey, 0.3, 0.3, v0, v1], [2 * storey, 0.3, 0.3, b0, b1], [eaves + 0.25, 0.9, 0.5, b0, b1]] as const) stone.box([xm, y, -(a + b) / 2], [depth + d, h, b - a + 0.3]);
  for (const v of [b0, b1]) stone.box([x0 - 0.05, (WESTERN_HEAD + eaves) / 2, -v], [0.3, eaves - WESTERN_HEAD, 0.8]); // the brick centre's quoins, from the openings' heads up (a shop's pane is at its southern end)
  // pitched roof: two slopes meeting at a ridge along the length, brick gable ends
  const top = eaves + 0.5;
  const slant = Math.hypot(depth / 2 + 0.45, roofRise);
  const lenA = len + 0.9;
  const zN = -(v1 + 0.45);
  const zS = -(v0 - 0.45);
  const xw = x0 - 0.2; // short of the concourse's glass, which stands 0.29 m off the face
  const xe = x1 + 0.45;
  slate.quad([xw, top, zS], [xm, top + roofRise, zS], [xm, top + roofRise, zN], [xw, top, zN], [0, 0], [slant, 0], [slant, lenA], [0, lenA]);
  slate.quad([xm, top + roofRise, zS], [xe, top, zS], [xe, top, zN], [xm, top + roofRise, zN], [0, 0], [slant, 0], [slant, lenA], [0, lenA]);
  brick.poly([[x0, top, -v0], [x1, top, -v0], [xm, top + roofRise, -v0]], [[0, 0], [depth, 0], [depth / 2, roofRise]]);
  brick.poly([[x1, top, -v1], [x0, top, -v1], [xm, top + roofRise, -v1]], [[0, 0], [depth, 0], [depth / 2, roofRise]]);
  // On the east face only the top storey shows, above the shed's aisle roof, a window in every bay. On the concourse face, beside the brick centre (whose windows are below), the top storey of each flank
  // bay shows through the curtain wall's clear panes with a window of its own (round 7, C4: R-a, R-ab show fenestration in the flanks, where there was blank brick). The size, 1.2 m x 2.4 m, is ASSUMED:
  // no reference measures a flank window, so it is scaled from the brick centre's top-storey sash below (1.9 m x 2.9 m, read off R-ab, R-a and R-b), taken in to about two thirds of its width and four
  // fifths of its height so that it reads as a plainer, smaller window than the centre's, in the middle of its bay on the same foot.
  for (const v of westernBays()) {
    windowQuad(win, [x1 + 0.02, 9.1, -v], '+x');
    if (v < b0 || v > b1) windowQuad(win, [x0 - 0.02, 8.95, -v], '-x', 1.2, 2.4);
  }
  // a round-headed opening (R-b, R-ab): a dark pane in a stone ring that rises from `y0` to the springing `y1`, a key at the crown
  const head = (z: number, r: number, d: number, y0: number, y1: number): V3[] => [[x0 - d, y0, z + r], ...Array.from({ length: 9 }, (_, k): V3 => [x0 - d, y1 + r * Math.sin((k * Math.PI) / 8), z + r * Math.cos((k * Math.PI) / 8)]), [x0 - d, y0, z - r]];
  const arch = (v: number, y0: number, y1: number): void => {
    const inner = head(-v, half, 0.12, y0, y1), outer = head(-v, half + ring, 0.12, y0, y1);
    west(panes, head(-v, half, pane, y0, y1));
    for (let k = 0; k + 1 < inner.length; k++) west(stone, [inner[k]!, inner[k + 1]!, outer[k + 1]!, outer[k]!]);
    stone.box([x0 - 0.1, y1 + half + 0.15, -v], [0.2, 0.3, 0.3]);
  };
  // The brick centre's six windows on the concourse face (R-a, R-ab, R-b): over each a tall opening below, in the top storey one large sash with a stone sill, in the first floor
  // dressed stone: a round-headed window, its sash bars in grey, in each end bay and in the four between a three-light window, a jamb and a mullion between the lights, a sill and a hood with a shallow pediment.
  westernWindows().forEach((v, i) => {
    const z = -v;
    windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9);
    if (i % 5 === 0) {
      arch(v, 4.75, 6.75);
      return;
    }
    for (const k of [-1.2, 0, 1.2]) windowQuad(win, [x0 - 0.02, 4.75, z + k], '-x', 1, 2.8);
    for (const k of [-1.8, -0.6, 0.6, 1.8]) stone.box([x0 - 0.06, 6.15, z + k], [0.12, 2.8, 0.2]);
    for (const [y, h] of [[4.69, 0.12], [7.65, 0.2]] as const) stone.box([x0 - 0.1, y, z], [0.2, h, 4]);
    west(stone, [-1, -0.5, 0, 0.5, 1].map((k): V3 => [x0 - 0.14, 7.75 + 0.28 * (1 - k * k), z + 2 * k]));
  });
  // the ground floor's row of tall round-headed openings: the brick centre's six, and every bay beside it that the gateline and the shops leave
  for (const v of arches) arch(v, 0.05, spring);
  for (const v of WESTERN_SHOPS) {
    // Recessed frontage only: the shop retains its backing mass, unlike the through-gateline.
    brick.box([(x0 + 0.65 + x1) / 2, (GROUND_Y + WESTERN_HEAD) / 2, -v], [depth - 0.65, WESTERN_HEAD - GROUND_Y, 2.8]);
    panes.box([x0 + 0.4, (GROUND_Y + 3.2) / 2, -v], [0.05, 3.2 - GROUND_Y, 2.8]);
    frames.box([x0 + 0.35, 3.35, -v], [0.15, 0.5, 2.8]);
    frames.box([x0 + 0.35, (GROUND_Y + 3.2) / 2, -v], [0.12, 3.2 - GROUND_Y, 0.08]);
  }
  // ASSUMED simplified central Y-columns: stems and flared heads support the retained first floor.
  for (const v of WESTERN_GATES) {
    stone.box([xm, (GROUND_Y + 2.5) / 2, -v], [0.7, 2.5 - GROUND_Y, 0.7]);
    for (const side of [-1, 1]) stone.box([xm + side * 0.55, 2.95, -v], [0.6, 1.55, 0.7], { rotZ: side * -0.65 });
  }
  g.add(mesh(panes.build(), material('pane'), 'range-public-glazing'), mesh(frames.build(), material('steel'), 'range-public-frames'));
  g.add(mesh(brick.build(), material('brick'), 'range-brick'));
  g.add(mesh(stone.build(), material('stone'), 'range-stone'));
  g.add(mesh(slate.build(), material('slate'), 'range-roof'));
  g.add(mesh(win.build(), material('sash'), 'range-windows'));
  return g;
}
