// Overhead line equipment: the plan from core/ole.ts drawn in two draw calls.
//   ole-steel  ONE merged mesh of square-section members (masts, booms, drop tubes, arms), the
//              shared 'steel' material, 12 triangles a member;
//   ole-wires  ONE LineSegments of every contact wire, catenary and dropper, and the shed's
//              cross-span wires (one across each arch at each support line) with their hangers.
// THE WIRES AND SHIMMER. A 1 px line stands for a 12-20 mm wire, which is under a pixel beyond
// about 15 m. Drawn at full strength the far wires alias into crawling dashes and a moire mesh over
// the throat. So each fragment's alpha is the wire's projected width in pixels (OLE_WIRE.width over
// the size of a pixel at that depth, times OLE_WIRE.gain), clamped to [0, 1]: solid near, fading
// smoothly with distance, and discarded below OLE_WIRE.minAlpha. That is the level of detail: the
// line covers what the real wire would.
import * as THREE from 'three';
import { inStationZone } from './track.ts';
import { shedRoofY } from './furniture.ts';
import { material } from './materials.ts';
import { olePlan } from '../../core/ole.ts';
import type { Member, OlePlan } from '../../core/ole.ts';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';

export const OLE_WIRE = {
  /** drawn wire width, metres: a 107 mm² contact wire is about 12 mm across, the catenary similar. ASSUMED */
  width: 0.014,
  /** perceived-strength gain on the covered fraction of a pixel. ASSUMED, tuned by eye */
  gain: 6,
  minAlpha: 0.04,
  colour: 0x1d2125,
} as const;

/** Alpha for a wire at `distance` metres, with a vertical field of view `fovY` (radians) over `heightPx` pixels. */
export function wireAlpha(distance: number, fovY: number, heightPx: number): number {
  const pixel = (2 * distance * Math.tan(fovY / 2)) / heightPx;
  return Math.max(0, Math.min(1, (OLE_WIRE.width / pixel) * OLE_WIRE.gain));
}

/** Twelve triangles of a square-section member, its sides square to the member and to y (or x for a vertical one). */
export function memberTriangles(m: Member, out: number[]): void {
  const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
  const d = new THREE.Vector3().subVectors(b, a);
  if (d.lengthSq() === 0) return;
  d.normalize();
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(m.size / 2);
  const t = new THREE.Vector3().crossVectors(d, s).normalize().multiplyScalar(m.size / 2);
  const corner = (p: THREE.Vector3, i: number): THREE.Vector3 => p.clone()
    .addScaledVector(s, i === 0 || i === 3 ? -1 : 1).addScaledVector(t, i < 2 ? -1 : 1);
  const A = [0, 1, 2, 3].map(i => corner(a, i)), B = [0, 1, 2, 3].map(i => corner(b, i));
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, w: THREE.Vector3): void => {
    for (const v of [p, q, r, p, r, w]) out.push(v.x, v.y, v.z);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(A[i]!, A[j]!, B[j]!, B[i]!);
  }
  quad(A[3]!, A[2]!, A[1]!, A[0]!);
  quad(B[0]!, B[1]!, B[2]!, B[3]!);
}

export type OleLayout = Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length' | 'aisle' | 'springing'>;

/** The OLE group: `userData` carries the plan's counts, triangles and draw calls. */
export function buildOle(data: Pick<KxData, 'nodes' | 'rails'> & Partial<Pick<KxData, 'signals'>>, layout: OleLayout, mouths: readonly Pt[] = []): THREE.Group {
  const plan: OlePlan = olePlan({
    data, layout, mouths,
    inZone: (x, z) => inStationZone(layout, x, z),
    roofY: (u) => shedRoofY(layout, u),
    arches: [0, 1].map(k => [layout.aisle + k * SHED_SPAN_WIDTH, layout.aisle + (k + 1) * SHED_SPAN_WIDTH] as [number, number]),
  });
  const group = new THREE.Group();
  group.name = 'ole';
  const positions: number[] = [];
  for (const m of plan.members) memberTriangles(m, positions);
  if (positions.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material('steel'));
    mesh.name = 'ole-steel';
    group.add(mesh);
  }
  if (plan.wires.length) group.add(wireLines([...plan.wires, ...plan.spans]));
  group.userData = {
    members: plan.members.length,
    lines: plan.lines.length,
    masts: plan.lines.reduce((s, l) => s + l.masts.length, 0),
    wireSegments: (plan.wires.length + plan.spans.length) / 6,
    counts: { ...plan.counts, ...plan.spanCounts },
    triangles: positions.length / 9,
    drawCalls: group.children.length,
    plan,
  };
  return group;
}

function wireLines(wires: number[]): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const m = new THREE.LineBasicMaterial({ color: OLE_WIRE.colour, transparent: true, depthWrite: false });
  const uniforms = { oleHeightPx: { value: 1080 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vOleDistance;\nvarying float vOleP11;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvOleDistance = - mvPosition.z;\n\tvOleP11 = projectionMatrix[1][1];');
    // projectionMatrix[1][1] is 1 / tan(fovY / 2): a pixel at depth d is 2 d / (P11 * height) metres.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOleDistance;\nvarying float vOleP11;\nuniform float oleHeightPx;')
      .replace('#include <opaque_fragment>', `float olePixel = 2.0 * max(vOleDistance, 0.01) / (vOleP11 * oleHeightPx);
\tdiffuseColor.a *= clamp(${OLE_WIRE.width.toFixed(4)} / olePixel * ${OLE_WIRE.gain.toFixed(1)}, 0.0, 1.0);
\tif ( diffuseColor.a < ${OLE_WIRE.minAlpha.toFixed(2)} ) discard;
\t#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ole-wire-coverage';
  const lines = new THREE.LineSegments(g, m);
  lines.name = 'ole-wires';
  const size = new THREE.Vector2();
  lines.onBeforeRender = (renderer) => { uniforms.oleHeightPx.value = renderer.getDrawingBufferSize(size).y; };
  return lines;
}
