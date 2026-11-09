// Overhead line equipment (OLE) as numbers: where the wires run and what holds them up. Pure
// functions, no three.js; web/src/ole.ts draws the plan in two draw calls.
//
// WHAT IS WIRED. Every surface OSM way tagged electrified=contact_line whose segment lies in the
// caller's station zone (web/src/track.ts STATION_ZONE: the shed to the Gasworks Tunnel mouth).
// On the 2026 extract that is all 131 in-zone segments, every one ECM1. Tunnel ways are not drawn:
// the wires stop where the surface rails meet the portal. OSM maps no OLE structures here (an
// Overpass query for power=catenary_mast|portal in the build-data.ts bbox, 2026-11-09, returned
// none), so every support position below is constructed by rule, not mapped.
//
// THE RULE. Supports stand on cross lines at fixed distances v along the shed's frame (OLE.span
// apart from OLE.firstV), which is how the real throat reads: a portal or a row of supports across
// all the tracks at once. Under the train shed (v inside the shed's length) nothing stands on a
// platform: as in the photos (OLE_SOURCES.shed), a transverse cross-span wire runs across each arch
// from rib to rib, and a vertical hanger drops from it to each catenary; under the low side aisles,
// where no arch is high enough, a drop tube hangs from the roof instead. North of the shed,
// the tracks met on one cross line are grouped (a gap over OLE.groupGap splits a group) and each
// group gets a portal: a mast clear of every rail at each end, a boom across, and a drop tube down
// to each wire. A boom longer than OLE.maxBoom takes an intermediate mast in the widest gap clear
// of every rail. Near a tunnel mouth (OLE.mouthReach) the masts stand further out, behind the
// approach retaining walls, and the system height tapers so the catenary passes under the crown.
//
// THE TRACK IS CURVED. Each wired segment is the smooth curve the page draws its rails on and the
// trains run on (core/curves.ts railShapes), not the OSM chord: the wires are registered on the curve at
// every cross line and dropper, and the masts stand clear of the curved rails.
//
// FIGURES. Sources are recorded in OLE_SOURCES; ASSUMED marks the rest.
import { railShapes, shapeFrom } from './curves.ts';
import type { RailShapes } from './curves.ts';
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';
import { worldToShed } from './station.ts';
import type { ShedLayout } from './station.ts';

export const OLE = {
  /** contact wire height above the rail head at stations and in the throat, metres (OLE_SOURCES.height) */
  contactHeight: 4.7,
  /** contact wire to catenary at a support, metres. ASSUMED: no UK figure found (OLE_SOURCES.system) */
  systemHeight: 1.4,
  /** the least system height, at a tunnel mouth or under the shed's valley, metres. ASSUMED */
  minSystemHeight: 0.3,
  /** the catenary's mid-span sag, as a fraction of the system height. ASSUMED */
  sag: 0.45,
  /** zig-zag of the contact wire either side of the track centre at alternate supports, metres (OLE_SOURCES.stagger) */
  stagger: 0.23,
  /** distance between support cross lines, metres. ASSUMED: no UK figure found (OLE_SOURCES.span) */
  span: 45,
  /** a cross-span wire's height above the highest catenary it carries, metres. ASSUMED */
  crossSpanClearance: 0.5,
  /** the first cross line, metres north of the shed's south wall: just north of the buffer stops (v = 12..24) */
  firstV: 27,
  /** spacing of the droppers that hang the contact wire from the catenary, metres. ASSUMED */
  dropperSpacing: 9,
  /** nearest a mast's centre may stand to any rail centre line, metres. ASSUMED (vehicle half-width plus clearance) */
  mastClearance: 2.6,
  /** the same within OLE.mouthReach of a tunnel mouth, where the retaining walls stand. ASSUMED */
  mouthClearance: 4.4,
  /** how far a tunnel mouth's walls and taper reach, metres (PORTAL.wing.reach is 75 m) */
  mouthReach: 80,
  /** tracks closer than this on one cross line share a portal, metres. ASSUMED */
  groupGap: 14,
  /** a portal boom longer than this takes an intermediate mast, metres. ASSUMED */
  maxBoom: 32,
  /** the boom's underside above the catenary at a support, metres. ASSUMED */
  boomClearance: 0.4,
  /** clearance kept under the shed roof, metres. ASSUMED */
  roofClearance: 0.3,
  /** steel sections, metres. ASSUMED */
  mastSize: 0.3,
  boomSize: 0.35,
  tubeSize: 0.06,
} as const;

/** Where each figure in OLE comes from (checked 2026-11-09). Network Rail's OLE standards
 * (NR/L2/ELP/21087, 21088, NR/GN/ELP/27415) are not openly readable, so these are secondary. */
export const OLE_SOURCES = {
  height: '4.7 m nominal: PWI Journal Oct 2021 ("reduce the contact wire height from the nominal height of 4700mm to 4165mm", '
    + 'https://issuu.com/thepwi/docs/pwi_journal_oct_2021_web/s/17565674, search excerpt only); range 4.165-5.94 m: Rail Engineer, '
    + '"A bad wire day", https://www.railengineer.co.uk/a-bad-wire-day/; absolute minimum 4.165 m: Amey, Dewsbury station footbridge, '
    + 'https://www.amey.com/uk/projects/2023/march/dewsbury-station-footbridge-voltage-controlled-clearances',
  stagger: 'up to 230 mm either side on straight track, 380 mm on curves: Rail Engineer, "A bad wire day" (above)',
  system: 'NOT FOUND for UK 25 kV. 1.4 m is the Furrer+Frey GEFF figure (a Swiss system), used as an assumption',
  span: 'NOT FOUND for UK 25 kV. Non-UK caps seen: 65 m (Bane NOR), 70 m (Furrer+Frey GEFF); 45 m is an assumption for a station throat',
  mapped: 'OSM: no power=catenary_mast or power=portal in the build-data.ts bbox (Overpass, 2026-11-09)',
  shed: 'Wikimedia Commons, mattbuck, "King\'s Cross railway station MMB 36 365521.jpg", 2012-03-19, CC BY-SA 2.0/3.0 '
    + '(https://commons.wikimedia.org/wiki/File:King%27s_Cross_railway_station_MMB_36_365521.jpg): transverse wires across the shed '
    + 'anchored to the arch ribs and walls through insulators, vertical droppers to the running wires, no masts on the platforms',
  throat: 'Wikimedia Commons, Stephen Craven, "Gasworks tunnels (1)" and "(2)", geograph 6964044 / 6964046, 2021-09-16, CC BY-SA 2.0 '
    + '(https://commons.wikimedia.org/wiki/File:Gasworks_tunnels_(1)_-_geograph.org.uk_-_6964044.jpg): steel portal gantries with booms '
    + 'and drop tubes across the tracks in front of the tunnel mouths',
} as const;

/** A square-section steel member between two points, [x, y, z]. */
export interface Member {
  a: [number, number, number];
  b: [number, number, number];
  size: number;
  kind: 'mast' | 'boom' | 'tube' | 'arm';
}

export interface SupportLine {
  v: number;
  inShed: boolean;
  /** where each wired track crosses the line: shed-frame u and world (x, z) */
  crossings: { u: number; x: number; z: number; wx: number; wz: number }[];
  /** world (x, z) of every mast on this line */
  masts: Pt[];
}

export interface OlePlan {
  lines: SupportLine[];
  members: Member[];
  /** flat [x1,y1,z1, x2,y2,z2, ...] wire segments: contact, catenary and droppers */
  wires: number[];
  /** wire segments by kind, for tests: indexes into `wires` / 6 */
  counts: { contact: number; catenary: number; droppers: number };
  /** flat segments of the shed's cross-span wires (rib to rib) and their hangers down to each catenary */
  spans: number[];
  spanCounts: { crossSpans: number; hangers: number };
}

type Layout = Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'> & Partial<Pick<ShedLayout, 'aisle' | 'springing'>>;

export interface OleInput {
  data: Pick<KxData, 'nodes' | 'rails'> & Partial<Pick<KxData, 'signals'>>;
  layout: Layout;
  /** is the world point in the wired zone? (web/src/track.ts inStationZone) */
  inZone: (x: number, z: number) => boolean;
  /** roof height over shed-frame u, metres; required for supports under the shed */
  roofY?: (u: number) => number;
  /** each shed arch as a shed-frame u range [west, east]: the cross-span wires run rib to rib across it */
  arches?: readonly [number, number][];
  /** tunnel mouth origins (core/landmarks.ts tunnelMouths): the wires taper and masts step out near them */
  mouths?: readonly Pt[];
  /** the track's curves (core/curves.ts railShapes of the whole data); computed from `data` when not given */
  curves?: RailShapes;
}

/** A point of a wired segment's curve: world, shed frame, and metres along the curve from a. */
interface PathPoint { p: Pt; u: number; v: number; s: number }
/** One wired OSM segment, from node a to node b, along its curve `path` (just a and b where it is straight). */
interface Seg { a: Pt; b: Pt; ua: number; va: number; ub: number; vb: number; path: PathPoint[]; length: number }

/** The curve's point, shed coordinates and unit direction `at` metres along a segment's path. */
function along(s: Seg, at: number): { p: Pt; u: number; v: number; dir: Pt } {
  const path = s.path;
  let i = 0;
  while (i + 2 < path.length && path[i + 1]!.s < at) i++;
  const a = path[i]!, b = path[i + 1]!, l = b.s - a.s;
  const f = l > 0 ? Math.max(0, Math.min(1, (at - a.s) / l)) : 0;
  const dir: Pt = l > 0 ? [(b.p[0] - a.p[0]) / l, (b.p[1] - a.p[1]) / l] : [0, 0];
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f], u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f, dir };
}

/** Metres along a segment's path where it crosses the cross line v (a piece ending on it counts once). */
function crossingsOf(s: Seg, v: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < s.path.length; i++) {
    const a = s.path[i]!, b = s.path[i + 1]!;
    if (a.v === b.v || (a.v - v) * (b.v - v) > 0) continue;
    const at = a.s + (b.s - a.s) * (v - a.v) / (b.v - a.v);
    if (!out.some(x => Math.abs(x - at) < 1e-9)) out.push(at);
  }
  return out;
}

/** The wired segments: surface, electrified=contact_line, midpoint in the zone; each along its curve. */
export function wiredSegments(input: Pick<OleInput, 'data' | 'layout' | 'inZone' | 'curves'>): Seg[] {
  const pos = new Map<number, Pt>(input.data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const curves = input.curves ?? railShapes(input.data);
  const out: Seg[] = [];
  for (const r of input.data.rails) {
    if (r.tunnel || r.electrified !== 'contact_line') continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i]!), b = pos.get(r.nodes[i + 1]!);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      if (!input.inZone((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      const sa = worldToShed(input.layout, a), sb = worldToShed(input.layout, b);
      const curve = shapeFrom(curves, r.nodes[i]!, r.nodes[i + 1]!) ?? [a, b];
      let run = 0;
      const path = curve.map((q, k) => {
        if (k) run += Math.hypot(q[0] - curve[k - 1]![0], q[1] - curve[k - 1]![1]);
        const sq = worldToShed(input.layout, q);
        return { p: q, u: sq.u, v: sq.v, s: run };
      });
      out.push({ a, b, ua: sa.u, va: sa.v, ub: sb.u, vb: sb.v, path, length: run });
    }
  }
  return out;
}

/** Every surface rail segment (wired or not), as its curve's pieces: what a mast must stand clear of. */
function surfaceSegments(data: Pick<KxData, 'nodes' | 'rails'>, curves: RailShapes): [Pt, Pt][] {
  const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const out: [Pt, Pt][] = [];
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i]!), b = pos.get(r.nodes[i + 1]!);
      if (!a || !b) continue;
      const curve = shapeFrom(curves, r.nodes[i]!, r.nodes[i + 1]!) ?? [a, b];
      for (let k = 0; k + 1 < curve.length; k++) out.push([curve[k]!, curve[k + 1]!]);
    }
  }
  return out;
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Shed frame (u, v) to world (x, z): the inverse of worldToShed. */
function toWorld(l: Pick<ShedLayout, 'origin' | 'heading'>, u: number, v: number): Pt {
  const c = Math.cos(l.heading), s = Math.sin(l.heading);
  return [l.origin[0] + u * c + v * s, l.origin[1] + u * s - v * c];
}

/** The cross-line positions v: from OLE.firstV every OLE.span to the end of the wired track. */
export function supportVs(segs: readonly (Pick<Seg, 'va' | 'vb'> & Partial<Pick<Seg, 'path'>>)[]): number[] {
  const vMax = Math.max(...segs.flatMap(s => [s.va, s.vb, ...(s.path ?? []).map(q => q.v)]));
  const out: number[] = [];
  for (let v = OLE.firstV; v < vMax; v += OLE.span) out.push(v);
  return out;
}

/** The system height at a world point: full, tapering to the minimum at a tunnel mouth. */
export function systemHeightAt(p: Pt, mouths: readonly Pt[] = []): number {
  const d = Math.min(Infinity, ...mouths.map(m => Math.hypot(p[0] - m[0], p[1] - m[1])));
  const t = Math.max(0, Math.min(1, d / OLE.mouthReach));
  const smooth = t * t * (3 - 2 * t);
  return OLE.minSystemHeight + (OLE.systemHeight - OLE.minSystemHeight) * smooth;
}

/** Contact-wire stagger at v: +stagger on even cross lines, -stagger on odd, straight between. */
export function staggerAt(v: number): number {
  const k = (v - OLE.firstV) / OLE.span;
  const f = k - Math.floor(k);
  const sign = Math.floor(k) % 2 === 0 ? 1 : -1;
  return OLE.stagger * sign * (1 - 2 * f);
}

/** Catenary height above the contact wire at v: the system height at a cross line, sagging between. */
export function catenaryAt(v: number, system: number): number {
  const k = (v - OLE.firstV) / OLE.span;
  const f = k - Math.floor(k);
  const mid = 1 - (2 * f - 1) ** 2; // 0 at a cross line, 1 mid-span
  return system * (1 - OLE.sag * mid);
}

export function olePlan(input: OleInput): OlePlan {
  const { layout, mouths = [] } = input;
  const curves = input.curves ?? railShapes(input.data);
  const segs = wiredSegments({ ...input, curves });
  const lines: SupportLine[] = [];
  const members: Member[] = [];
  const wires: number[] = [];
  const counts = { contact: 0, catenary: 0, droppers: 0 };
  const spans: number[] = [];
  const spanCounts = { crossSpans: 0, hangers: 0 };
  if (!segs.length) return { lines, members, wires, counts, spans, spanCounts };
  const roofY = input.roofY;
  const inShedV = (v: number): boolean => v > 0 && v < layout.length;
  // the lowest roof within the stagger either side of the track: the wire swings that far
  const roofCap = (u: number, v: number): number => {
    if (!roofY || !inShedV(v)) return Infinity;
    const us = [u - OLE.stagger, u, u + OLE.stagger].filter(q => q >= 0 && q <= layout.width);
    return us.length ? Math.min(...us.map(roofY)) - OLE.roofClearance : Infinity;
  };
  const C = OLE.contactHeight;
  /** catenary height at a point, after the mouth taper and under the roof */
  const catenary = (p: Pt, u: number, v: number): number => {
    const sys = Math.max(OLE.minSystemHeight, Math.min(catenaryAt(v, systemHeightAt(p, mouths)), roofCap(u, v) - C));
    return C + sys;
  };

  // ---- wires: each segment cut at the cross lines and at dropper spacing
  const vs = supportVs(segs);
  for (const s of segs) {
    // the wire's points, in metres along the curve: its ends, a dropper every OLE.dropperSpacing, every cross line
    const len = s.length;
    const ts = new Set<number>([0, len]);
    for (let k = 1; k * OLE.dropperSpacing < len; k++) ts.add(k * OLE.dropperSpacing);
    for (const v of vs) for (const at of crossingsOf(s, v)) if (at > 0 && at < len) ts.add(at);
    // and every joint of the curve's pieces, so the wire follows the curve; a dropper hangs only at the points above
    const hangs = new Set(ts);
    for (const q of s.path) if (q.s > 0 && q.s < len) ts.add(q.s);
    const sorted = [...ts].sort((a, b) => a - b);
    const pts = sorted.map(t => {
      const { p, u, v, dir } = along(s, t);
      const n: Pt = [-dir[1], dir[0]];
      const off = staggerAt(v);
      const q: Pt = [p[0] + n[0] * off, p[1] + n[1] * off];
      return { q, top: catenary(p, u, v), hang: hangs.has(t) };
    });
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      wires.push(a.q[0], C, a.q[1], b.q[0], C, b.q[1]); counts.contact++;
      wires.push(a.q[0], a.top, a.q[1], b.q[0], b.top, b.q[1]); counts.catenary++;
    }
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      if (a.hang) { wires.push(a.q[0], C, a.q[1], a.q[0], a.top, a.q[1]); counts.droppers++; }
    }
  }

  // ---- supports on each cross line
  const rails = surfaceSegments(input.data, curves);
  const signals = (input.data.signals ?? []).map(s => [s.x, s.z] as Pt);
  const clearOf = (p: Pt, clearance: number): boolean =>
    rails.every(([a, b]) => distanceToSegment(p, a, b) >= clearance) && signals.every(s => Math.hypot(p[0] - s[0], p[1] - s[1]) >= 1.5);
  const nearMouth = (p: Pt): boolean => mouths.some(m => Math.hypot(p[0] - m[0], p[1] - m[1]) < OLE.mouthReach);
  for (const v of vs) {
    const seen = new Set<string>();
    const held = new Set<object>();
    const crossings = segs.flatMap(s => crossingsOf(s, v).map(at => {
      const { p: [x, z], u, dir } = along(s, at), off = staggerAt(v);
      // the wire's own position at the support: the curved centre line moved by the stagger, square to it
      return { u, x, z, wx: x - dir[1] * off, wz: z + dir[0] * off };
    })).filter(c => { // a node exactly on the line is met by both its segments
      const key = `${c.x.toFixed(3)},${c.z.toFixed(3)}`;
      return seen.has(key) ? false : (seen.add(key), true);
    }).sort((a, b) => a.u - b.u);
    if (!crossings.length) continue;
    const inShed = inShedV(v) && !!roofY;
    const line: SupportLine = { v, inShed, crossings, masts: [] };
    lines.push(line);
    const top = (c: { u: number; x: number; z: number }): number => catenary([c.x, c.z], c.u, v);
    const underRoof = (c: { u: number }): boolean => inShed && c.u >= 0 && c.u <= layout.width;
    // under the shed: a cross-span wire across each arch, rib to rib, with a hanger to each catenary;
    // under an aisle (no arch) a drop tube from the roof. A registration arm holds every contact wire.
    const sheltered = crossings.filter(underRoof);
    for (const [a0, a1] of input.arches ?? []) {
      const under = sheltered.filter(c => c.u >= a0 && c.u < a1);
      if (!under.length) continue;
      const y = Math.max(...under.map(top)) + OLE.crossSpanClearance;
      const anchor = (lo: number, hi: number): number => { // roofY rises from lo towards hi: the first u that reaches y
        if (roofY!(hi) < y) return NaN;
        for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (roofY!(m) >= y) hi = m; else lo = m; }
        return hi;
      };
      const mid = (a0 + a1) / 2, west = anchor(a0, mid), east = anchor(a1, mid);
      if (!Number.isFinite(west) || !Number.isFinite(east)) continue;
      const w = toWorld(layout, west, v), e = toWorld(layout, east, v);
      spans.push(w[0], roofY!(west), w[1], e[0], roofY!(east), e[1]); spanCounts.crossSpans++;
      for (const c of under) {
        held.add(c);
        const ys = roofY!(west) + (roofY!(east) - roofY!(west)) * (c.u - west) / (east - west);
        spans.push(c.wx, ys, c.wz, c.wx, top(c), c.wz); spanCounts.hangers++;
      }
    }
    for (const c of sheltered) {
      const y = top(c);
      if (!held.has(c)) {
        const roof = roofY!(c.u);
        if (roof > y) members.push({ a: [c.wx, roof, c.wz], b: [c.wx, y, c.wz], size: OLE.tubeSize, kind: 'tube' });
      }
      members.push({ a: [c.wx, y, c.wz], b: [c.wx, C + 0.05, c.wz], size: OLE.tubeSize * 0.6, kind: 'arm' });
    }
    // in the open (the throat, and the suburban platforms beside the shed): groups of tracks with a portal each
    const groups: (typeof crossings)[] = [];
    for (const c of crossings.filter(c => !underRoof(c))) {
      const g = groups.at(-1);
      if (g && c.u - g.at(-1)!.u <= OLE.groupGap) g.push(c); else groups.push([c]);
    }
    for (const g of groups) {
      const mid: Pt = [(g[0]!.x + g.at(-1)!.x) / 2, (g[0]!.z + g.at(-1)!.z) / 2];
      const clearance = nearMouth(mid) ? OLE.mouthClearance : OLE.mastClearance;
      const boomY = Math.max(...g.map(top)) + OLE.boomClearance + OLE.boomSize / 2;
      // a mast at each end, stepped outward until it is clear of every rail and signal
      const find = (u0: number, step: number): number | null => {
        for (let k = 0; k <= 16; k++) {
          const u = u0 + step * k * 0.5;
          if (clearOf(toWorld(layout, u, v), clearance)) return u;
        }
        return null;
      };
      const west = find(g[0]!.u - clearance, -1), east = find(g.at(-1)!.u + clearance, 1);
      if (west === null || east === null) continue;
      const mastUs = [west, east];
      if (east - west > OLE.maxBoom) {
        // intermediate masts in the gaps wide enough to stand in, widest first
        const gaps = g.slice(1).map((c, i) => ({ u: (c.u + g[i]!.u) / 2, w: c.u - g[i]!.u }))
          .filter(q => clearOf(toWorld(layout, q.u, v), clearance)).sort((a, b) => b.w - a.w);
        for (const q of gaps) {
          const all = [...mastUs].sort((a, b) => a - b);
          const longest = Math.max(...all.slice(1).map((u, i) => u - all[i]!));
          if (longest <= OLE.maxBoom) break;
          mastUs.push(q.u);
        }
      }
      mastUs.sort((a, b) => a - b);
      for (const u of mastUs) {
        const p = toWorld(layout, u, v);
        line.masts.push(p);
        members.push({ a: [p[0], -0.2, p[1]], b: [p[0], boomY + OLE.boomSize / 2, p[1]], size: OLE.mastSize, kind: 'mast' });
      }
      const wp = toWorld(layout, west, v), ep = toWorld(layout, east, v);
      members.push({ a: [wp[0], boomY, wp[1]], b: [ep[0], boomY, ep[1]], size: OLE.boomSize, kind: 'boom' });
      for (const c of g) {
        const y = top(c);
        members.push({ a: [c.wx, boomY - OLE.boomSize / 2, c.wz], b: [c.wx, y, c.wz], size: OLE.tubeSize, kind: 'tube' });
        members.push({ a: [c.wx, y, c.wz], b: [c.wx, C + 0.05, c.wz], size: OLE.tubeSize * 0.6, kind: 'arm' });
      }
    }
  }
  return { lines, members, wires, counts, spans, spanCounts };
}
