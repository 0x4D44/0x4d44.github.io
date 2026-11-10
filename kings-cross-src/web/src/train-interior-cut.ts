// Window openings in a car's outer skin, for the one car whose interior is shown (train-interior.ts).
//
// A car's body is an outer skin only (train.ts): a lofted shell whose every face points outward, opaque window panes laid a
// centimetre proud of it, and door leaves standing on it. From outside that is the whole look; from inside the camera sees the backs of
// those faces, which the GPU culls, so the car vanishes. To see in or out through a window, the skin needs a hole there. This module
// makes one without touching train.ts: it copies a car's geometry and cuts the openings' rectangles out of every triangle that lies flat
// on the car's side (normal along x, in the outer few centimetres). Each vertex attribute (position, normal, colour, uv, the lamp tag)
// of a piece is interpolated from the triangle it was cut from, so what remains of the skin is drawn exactly as it was: the same
// texture at the same place, the same colours. The copies are the active car's only; every other car keeps the shared geometry.
import * as THREE from 'three';

/** A rectangle on one side of the car, in the car's own frame: z along the car, y above the rail head. */
export interface Opening {
  /** +1 the car's right (+x), -1 its left */
  side: 1 | -1;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** A polygon whose vertices carry every attribute value, flat (`stride` floats a vertex; position first). */
type Poly = number[][];

const lerpVertex = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + ((b[i] as number) - v) * t);

/** Keep the part of a convex polygon where `value(v) * sign >= limit * sign`; Sutherland-Hodgman against one axis-aligned line. */
function clip(poly: Poly, axis: number, limit: number, keepAbove: boolean): Poly {
  const out: Poly = [];
  const inside = (v: number[]): boolean => (keepAbove ? (v[axis] as number) >= limit : (v[axis] as number) <= limit);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as number[];
    const b = poly[(i + 1) % poly.length] as number[];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (limit - (a[axis] as number)) / ((b[axis] as number) - (a[axis] as number));
      out.push(lerpVertex(a, b, t));
    }
  }
  return out;
}

/** A convex polygon less a rectangle in (z, y): up to four convex pieces (above, below, and the two beside it). Position is x, y, z at 0, 1, 2. */
export function subtractRect(poly: Poly, r: Pick<Opening, 'z0' | 'z1' | 'y0' | 'y1'>): Poly[] {
  const ys = poly.map((v) => v[1] as number), zs = poly.map((v) => v[2] as number);
  if (Math.max(...zs) <= r.z0 || Math.min(...zs) >= r.z1 || Math.max(...ys) <= r.y0 || Math.min(...ys) >= r.y1) return [poly];
  const pieces: Poly[] = [];
  pieces.push(clip(poly, 1, r.y1, true));
  pieces.push(clip(poly, 1, r.y0, false));
  const band = clip(clip(poly, 1, r.y0, true), 1, r.y1, false);
  if (band.length >= 3) {
    pieces.push(clip(band, 2, r.z0, false));
    pieces.push(clip(band, 2, r.z1, true));
  }
  return pieces.filter((p) => p.length >= 3 && area(p) > 1e-9);
}

/** Twice the area of a polygon projected on (z, y). */
function area(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as number[], b = p[(i + 1) % p.length] as number[];
    s += (a[2] as number) * (b[1] as number) - (b[2] as number) * (a[1] as number);
  }
  return Math.abs(s);
}

/** Does this triangle lie flat on the car's outer side at `side`: its normal along x, every corner at least `skin` (|x|) out? */
function onSide(p: number[][], side: number, skin: number): boolean {
  const [a, b, c] = p as [number[], number[], number[]];
  const ux = (b[0] as number) - (a[0] as number), uy = (b[1] as number) - (a[1] as number), uz = (b[2] as number) - (a[2] as number);
  const vx = (c[0] as number) - (a[0] as number), vy = (c[1] as number) - (a[1] as number), vz = (c[2] as number) - (a[2] as number);
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12 || Math.abs(nx) / len < 0.98) return false;
  return p.every((v) => (v[0] as number) * side >= skin);
}

/**
 * A copy of a non-indexed car geometry with the openings cut out of the triangles that lie flat on the car's outer side (|x| >= `skin`, the
 * normal along x, facing in or out). Other triangles are copied unchanged, in order. The source geometry is not changed.
 */
export function cutOpenings(source: THREE.BufferGeometry, openings: readonly Opening[], skin: number): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(g.attributes);
  // position first, so a flat vertex reads x, y, z at 0, 1, 2
  names.sort((a, b) => (a === 'position' ? -1 : b === 'position' ? 1 : 0));
  const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const out: number[][] = attrs.map(() => []);
  const vertex = (i: number): number[] => {
    const v: number[] = [];
    attrs.forEach((a, k) => { for (let c = 0; c < (sizes[k] as number); c++) v.push(a.array[i * (sizes[k] as number) + c] as number); });
    return v;
  };
  const emit = (v: number[]): void => {
    let o = 0;
    sizes.forEach((s, k) => { for (let c = 0; c < s; c++) (out[k] as number[]).push(v[o + c] as number); o += s; });
  };
  const count = (g.getAttribute('position') as THREE.BufferAttribute).count;
  for (let i = 0; i + 2 < count; i += 3) {
    const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const x0 = (tri[0] as number[])[0] as number;
    const side = x0 >= 0 ? 1 : -1;
    const mine = openings.filter((o) => o.side === side);
    if (!mine.length || !onSide(tri, side, skin)) { tri.forEach(emit); continue; }
    let pieces: Poly[] = [tri];
    for (const r of mine) pieces = pieces.flatMap((p) => subtractRect(p, r));
    // clipping keeps each piece's winding, so a fan from its first corner faces the way the triangle did
    for (const p of pieces) for (let k = 1; k + 1 < p.length; k++) { emit(p[0] as number[]); emit(p[k] as number[]); emit(p[k + 1] as number[]); }
  }
  const result = new THREE.BufferGeometry();
  names.forEach((n, k) => {
    const a = attrs[k] as THREE.BufferAttribute;
    result.setAttribute(n, new THREE.Float32BufferAttribute(out[k] as number[], a.itemSize, a.normalized));
  });
  result.computeBoundingBox();
  result.computeBoundingSphere();
  if (g !== source) g.dispose();
  return result;
}
