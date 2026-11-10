// Geometry helpers shared by the train models: vector arithmetic, the triangle "soup" every merged mesh is
// assembled in, a smooth curve through knots, and the three materials (plain, glass) a train needs.
// No scene knowledge here; train.ts and train-parts.ts say what is drawn.
import * as THREE from 'three';
import { LIGHT_GAIN } from './livery.ts';

export type V3 = [number, number, number];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mean = (ps: V3[]): V3 => {
  const s = ps.reduce((a, p) => add(a, p), [0, 0, 0] as V3);
  return [s[0] / ps.length, s[1] / ps.length, s[2] / ps.length];
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
/** Zero slope at both ends. */
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** Zero first and second derivative at both ends. */
export const smootherstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * A monotone cubic through (x, y) knots (Fritsch and Carlson): smooth, and it never overshoots between
 * knots, so a profile drawn from a few readings cannot grow a bump or a dent of its own.
 */
export function monotoneCurve(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push((xs[i + 1] as number) - (xs[i] as number));
    d.push(((ys[i + 1] as number) - (ys[i] as number)) / (h[i] as number));
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0] as number;
  m[n - 1] = d[n - 2] as number;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1] as number;
    const b = d[i] as number;
    m[i] = a * b <= 0 ? 0 : (3 * ((h[i - 1] as number) + (h[i] as number))) / ((((h[i - 1] as number) + 2 * (h[i] as number)) / a) + (((2 * (h[i - 1] as number)) + (h[i] as number)) / b));
  }
  return (x: number): number => {
    if (x <= (xs[0] as number)) return ys[0] as number;
    if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
    let i = 0;
    while (x > (xs[i + 1] as number)) i++;
    const t = (x - (xs[i] as number)) / (h[i] as number);
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[i] as number) +
      (t3 - 2 * t2 + t) * (h[i] as number) * (m[i] as number) +
      (-2 * t3 + 3 * t2) * (ys[i + 1] as number) +
      (t3 - t2) * (h[i] as number) * (m[i + 1] as number)
    );
  };
}

const colours = new Map<number, THREE.Color>();
/** A colour as the trains wear it: see LIGHT_GAIN. */
export const col = (hex: number): THREE.Color => {
  let c = colours.get(hex);
  if (!c) colours.set(hex, (c = new THREE.Color(hex).multiplyScalar(LIGHT_GAIN)));
  return c;
};

type UV = [number, number];

/** A rounded rectangle as a counter-clockwise polygon in (a, b), `seg` points to each corner. */
export function roundedRect(a0: number, a1: number, b0: number, b1: number, r: number, seg = 3): [number, number][] {
  const rr = Math.min(r, (a1 - a0) / 2, (b1 - b0) / 2);
  const out: [number, number][] = [];
  const corner = (ca: number, cb: number, from: number): void => {
    for (let i = 0; i <= seg; i++) {
      const t = from + ((Math.PI / 2) * i) / seg;
      out.push([ca + rr * Math.cos(t), cb + rr * Math.sin(t)]);
    }
  };
  corner(a1 - rr, b1 - rr, 0);
  corner(a0 + rr, b1 - rr, Math.PI / 2);
  corner(a0 + rr, b0 + rr, Math.PI);
  corner(a1 - rr, b0 + rr, (3 * Math.PI) / 2);
  return out;
}

/** An ellipse as a counter-clockwise polygon in (a, b), centred (ca, cb), radii (ra, rb), `n` distinct points (a rounded rectangle whose radius is half its width doubles its points where the corners meet, and a zero-area triangle with them). */
export function ellipse(ca: number, cb: number, ra: number, rb: number, n = 14): [number, number][] {
  return Array.from({ length: n }, (_, i): [number, number] => {
    const t = (2 * Math.PI * i) / n;
    return [ca + ra * Math.cos(t), cb + rb * Math.sin(t)];
  });
}

/**
 * The part of a polygon that lies inside a convex polygon, kept `inset` metres clear of its edges (Sutherland-Hodgman, one edge at a time; both in (a, b), the clip
 * counter-clockwise). The subject may be wound either way. Nothing is left (an empty list) where they do not overlap.
 */
export function clipConvex(subject: readonly (readonly [number, number])[], clip: readonly (readonly [number, number])[], inset = 0): [number, number][] {
  let out: [number, number][] = subject.map((p): [number, number] => [p[0], p[1]]);
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i] as readonly [number, number];
    const b = clip[(i + 1) % clip.length] as readonly [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // (a clip edge of no length bounds nothing)
    if (len < 1e-12) continue;
    // how far inside the edge a point stands: positive on the left of a -> b, where a counter-clockwise polygon's inside is
    const inside = (p: readonly [number, number]): number => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len - inset;
    const next: [number, number][] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j] as [number, number];
      const q = out[(j + 1) % out.length] as [number, number];
      const dp = inside(p);
      const dq = inside(q);
      if (dp >= 0) next.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    out = next;
  }
  // a vertex that lies on a clip edge is kept once as itself and once as the crossing: drop the copy (a fan over it would hold a zero-area triangle)
  const distinct = out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length] as [number, number];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9;
  });
  return distinct.length >= 3 ? distinct : [];
}

/** A bag of triangles. Winding is fixed at insertion so it agrees with the normals given. */
export class Soup {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly clr: number[] = [];
  readonly uvs: number[] = [];
  /** One lamp tag per vertex (see `emit`); the geometry carries it as `aGlow` only if some vertex is lit. */
  readonly glow: number[] = [];
  /**
   * The lamp tag every vertex added from now on takes: 0 unlit, 1 a lit passenger window (warm light inside), 2 a lamp lens that
   * glows in its own colour. `trainNight` (below) lights the tagged vertices after dark; by day they are as untagged ones.
   */
  emit = 0;

  tri(p: [V3, V3, V3], n: [V3, V3, V3], c: THREE.Color | null, uv?: [UV, UV, UV]): void {
    const f = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const want = add(add(n[0], n[1]), n[2]);
    const order = dot(f, want) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      const v = p[i] as V3;
      const nn = n[i] as V3;
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(nn[0], nn[1], nn[2]);
      this.glow.push(this.emit);
      if (c) this.clr.push(c.r, c.g, c.b);
      if (uv) this.uvs.push((uv[i] as UV)[0], (uv[i] as UV)[1]);
    }
  }

  quad(p: [V3, V3, V3, V3], n: [V3, V3, V3, V3], c: THREE.Color | null, uv?: [UV, UV, UV, UV]): void {
    this.tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], c, uv && [uv[0], uv[1], uv[2]]);
    this.tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], c, uv && [uv[0], uv[2], uv[3]]);
  }

  /** A flat quad of a convex solid, facing away from the solid's centre. */
  face(p: [V3, V3, V3, V3], centre: V3, c: THREE.Color): void {
    let n = unit(cross(sub(p[1], p[0]), sub(p[3], p[0])));
    if (dot(n, sub(mean(p), centre)) < 0) n = [-n[0], -n[1], -n[2]];
    this.quad(p, [n, n, n, n], c);
  }

  /** A convex polygon, flat, facing `n` (no colour: the material's own, as glass has). */
  fan(poly: V3[], n: V3, c: THREE.Color | null): void {
    if (poly.length < 3) return;
    const c0 = mean(poly);
    for (let k = 0; k < poly.length; k++) this.tri([c0, poly[k] as V3, poly[(k + 1) % poly.length] as V3], [n, n, n], c);
  }

  /** An axis-aligned box. `skip` lists faces to leave out ('+x', '-y', ...); `faceColours` recolours some. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color, skip = '', faceColours: Record<string, THREE.Color> = {}): void {
    const centre: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const faces: Record<string, [V3, V3, V3, V3]> = {
      '+x': [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
      '-x': [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
      '+y': [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      '-y': [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      '+z': [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      '-z': [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    };
    for (const [k, p] of Object.entries(faces)) if (!skip.includes(k)) this.face(p, centre, faceColours[k] ?? c);
  }

  /** A square bar between two points (y, z) in the y-z plane, `w` wide in x (centred on x0) and `h` thick across its axis. */
  bar(a: [number, number], b: [number, number], w: number, h: number, c: THREE.Color, x0 = 0): void {
    const d = unit([0, b[0] - a[0], b[1] - a[1]]);
    const nx: V3 = [0, -d[2], d[1]];
    const corner = (p: [number, number], sx: number, sn: number): V3 => [x0 + (sx * w) / 2, p[0] + (sn * h * nx[1]) / 2, p[1] + (sn * h * nx[2]) / 2];
    const ps = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)] as V3[];
    const centre = mean(ps);
    const at = (...i: number[]): [V3, V3, V3, V3] => i.map((k) => ps[k]) as [V3, V3, V3, V3];
    for (const f of [at(0, 1, 2, 3), at(4, 5, 6, 7), at(0, 1, 5, 4), at(2, 3, 7, 6), at(0, 3, 7, 4), at(1, 2, 6, 5)]) this.face(f, centre, c);
  }

  /**
   * A convex outline in the (z, y) plane, extruded along x from `xIn` to `xOut`: the cap on the `xOut` side
   * and (unless `walls` is false) the rim walls. For a window or a door glass standing a centimetre proud of a flat side.
   */
  prismX(outline: [number, number][], xIn: number, xOut: number, c: THREE.Color, walls = true): void {
    const dir = Math.sign(xOut - xIn) || 1;
    const capN: V3 = [dir, 0, 0];
    const cz = outline.reduce((a, p) => a + p[0], 0) / outline.length;
    const cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    for (let k = 0; k < outline.length; k++) {
      const a = outline[k] as [number, number];
      const b = outline[(k + 1) % outline.length] as [number, number];
      this.tri([[xOut, cy, cz], [xOut, a[1], a[0]], [xOut, b[1], b[0]]], [capN, capN, capN], c);
      if (!walls) continue;
      const e: V3 = unit([0, b[1] - a[1], b[0] - a[0]]);
      const wallN: V3 = unit([0, -e[2], e[1]]);
      // the rim wall faces away from the polygon's middle
      const mid: V3 = [0, (a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cz];
      const n = dot(wallN, mid) < 0 ? scale(wallN, -1) : wallN;
      this.quad([[xIn, a[1], a[0]], [xOut, a[1], a[0]], [xOut, b[1], b[0]], [xIn, b[1], b[0]]], [n, n, n, n], c);
    }
  }

  /** Triangles of a three.js geometry, moved by `m`. */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color): void {
    const flat = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    const p = flat.getAttribute('position');
    const n = flat.getAttribute('normal');
    const at = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): V3 => [a.getX(i), a.getY(i), a.getZ(i)];
    for (let i = 0; i + 2 < p.count; i += 3) this.tri([at(p, i), at(p, i + 1), at(p, i + 2)], [at(n, i), at(n, i + 1), at(n, i + 2)], c);
    flat.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (this.clr.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.clr, 3));
    if (this.uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.glow.some((v) => v > 0)) g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Smooth normals for a grid of points (rows x columns): the cross of the two central differences, turned
 * to face away from `inside` (a point inside the surface, per row).
 */
export function gridNormals(P: V3[][], closedColumns: boolean, inside: (row: number) => V3): V3[][] {
  const R = P.length - 1;
  return P.map((ring, i) =>
    ring.map((p, j): V3 => {
      const M = ring.length;
      const a = (P[Math.min(i + 1, R)] as V3[])[j] as V3;
      const b = (P[Math.max(i - 1, 0)] as V3[])[j] as V3;
      const c = ring[closedColumns ? (j + 1) % M : Math.min(j + 1, M - 1)] as V3;
      const d = ring[closedColumns ? (j + M - 1) % M : Math.max(j - 1, 0)] as V3;
      const n = unit(cross(sub(a, b), sub(c, d)));
      const out = sub(p, inside(i));
      return dot(n, out) < 0 ? [-n[0], -n[1], -n[2]] : n;
    }),
  );
}

/**
 * How lit the trains' lamps and windows are: 0 by day, 1 after dark (web/src/atmosphere.ts sets it from the sun). It drives the
 * vertices a `Soup` tagged (`emit`): lit passenger windows glow warm and the headlight and tail lamp lenses glow in their own colour.
 */
export const trainNight = { value: 0 };

let plainMaterial: THREE.MeshLambertMaterial | null = null;
/** The one material for everything that carries its colour in the vertices; shared by every train. */
export const plain = (): THREE.MeshLambertMaterial => {
  if (!plainMaterial) {
    plainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Add the lamp glow after lighting. Vertices with no `aGlow` attribute read 0 and draw as before.
    plainMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = trainNight;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <opaque_fragment>',
          'outgoingLight += uNight * ( step( 0.5, vGlow ) * ( 1.0 - step( 1.5, vGlow ) ) * vec3( 1.0, 0.82, 0.52 ) * 1.1 + step( 1.5, vGlow ) * vColor.rgb * 1.6 );\n' +
          // a lens scales all three channels by one factor that caps the brightest at 1, so it keeps its hue (clipping each channel alone washed a red lamp pink)
          'outgoingLight /= mix( 1.0, max( 1.0, max( outgoingLight.r, max( outgoingLight.g, outgoingLight.b ) ) ), step( 1.5, vGlow ) );\n#include <opaque_fragment>');
    };
  }
  return plainMaterial;
};

/** A small sky, drawn on a canvas, for the glass to reflect: dusk blue overhead, a pale horizon, a dark ground, the sun's glow. */
function skyForGlass(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#1a2a47');
  sky.addColorStop(0.3, '#5d7eaa');
  sky.addColorStop(0.47, '#c9d7e8');
  sky.addColorStop(0.5, '#e8eef5');
  sky.addColorStop(0.5001, '#4a4f58');
  sky.addColorStop(0.62, '#262a31');
  sky.addColorStop(1.0, '#14171b');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // the sun: the scene's light stands at (-320, 520, 260), so its direction is u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5
  const sx = (Math.atan2(260, -320) / (2 * Math.PI) + 0.5) * w;
  const sy = (1 - (Math.asin(520 / Math.hypot(320, 520, 260)) / Math.PI + 0.5)) * h;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 46);
  glow.addColorStop(0, 'rgba(255,244,214,1)');
  glow.addColorStop(0.35, 'rgba(255,232,190,0.8)');
  glow.addColorStop(1, 'rgba(255,232,190,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // a few brighter bands, like the strip lights of a shed roof, so the reflection has structure
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect(((i * 87 + 30) % w), h * 0.2, 18, h * 0.22);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let glass: THREE.MeshStandardMaterial | null = null;
/**
 * The cab glass: a dark, tinted, reflective surface (low roughness, high metalness in the sense of a coated
 * glass), reflecting a small procedural sky. Shared by every train; with no document (Node) it has no
 * environment and is simply dark.
 */
export const glassMaterial = (): THREE.MeshStandardMaterial => {
  if (!glass) {
    glass = new THREE.MeshStandardMaterial({ color: 0x0b1016, metalness: 0.85, roughness: 0.14, envMapIntensity: 1.25, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const env = skyForGlass();
    if (env) glass.envMap = env;
  }
  return glass;
};
