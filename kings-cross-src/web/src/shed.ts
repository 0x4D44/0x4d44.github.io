// The King's Cross train shed, drawn from the layout in core/station.ts: two arched spans, side
// aisles and walls, the brick south front with its two arched windows and the clock tower, and
// the open north mouth. Everything is procedural; there are no image assets.
//
// Local frame: x = u (east), y up, z = -v (north is -z), then the group is turned by -heading
// and moved to the shed's south-west corner. See shedToWorld() in core/station.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLOCK_TOWER_HEIGHT, SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';

const ARC_STEPS = 28;
const RIB_SPACING = 6.1; // 20 ft: an assumption, the published sources give none
const RIB_SIZE = 0.5;
const FRONT_HEIGHT_ABOVE_CROWN = 2.4;
const TOWER_SIZE = 6.4;

const brick = 0xa88f5b; // yellow London stock brick, lit warm
const steel = 0x434e5c;

/** One point on a vault's section: angle 0 at the west springing, pi at the east springing. */
function arc(uc: number, springing: number, r: number, a: number): [number, number] {
  return [uc - r * Math.cos(a), springing + r * Math.sin(a)];
}

/** The curved roof of one span, as a strip of quads along its length. */
function vaultShell(uc: number, layout: ShedLayout): THREE.BufferGeometry {
  const r = SHED_SPAN_WIDTH / 2;
  const pos: number[] = [];
  for (let i = 0; i < ARC_STEPS; i++) {
    const [u1, y1] = arc(uc, layout.springing, r, (Math.PI * i) / ARC_STEPS);
    const [u2, y2] = arc(uc, layout.springing, r, (Math.PI * (i + 1)) / ARC_STEPS);
    const a = [u1, y1, 0];
    const b = [u2, y2, 0];
    const c = [u1, y1, -layout.length];
    const d = [u2, y2, -layout.length];
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A square-section rib following the arch at distance v along the shed. */
function rib(uc: number, v: number, layout: ShedLayout): THREE.BufferGeometry {
  const r = SHED_SPAN_WIDTH / 2;
  const h = RIB_SIZE / 2;
  const pos: number[] = [];
  const ring = (a: number): [number[], number[], number[], number[]] => {
    // four corners of the rib section at angle a: outer/inner radius, front/back along the shed
    const ro = r + h;
    const ri = r - h;
    const p = (rad: number, dz: number): number[] => {
      const [u, y] = arc(uc, layout.springing, rad, a);
      return [u, y, -(v + dz)];
    };
    return [p(ro, -h), p(ro, h), p(ri, h), p(ri, -h)];
  };
  for (let i = 0; i < ARC_STEPS; i++) {
    const k0 = ring((Math.PI * i) / ARC_STEPS);
    const k1 = ring((Math.PI * (i + 1)) / ARC_STEPS);
    for (let s = 0; s < 4; s++) {
      const a0 = k0[s] as number[];
      const b0 = k0[(s + 1) % 4] as number[];
      const a1 = k1[s] as number[];
      const b1 = k1[(s + 1) % 4] as number[];
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A vertical rectangle in the u-y plane at v along the shed, with half-disc windows cut out. */
function frontWall(layout: ShedLayout): { wall: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const r = SHED_SPAN_WIDTH / 2;
  const top = layout.crown + FRONT_HEIGHT_ABOVE_CROWN;
  const outline = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(layout.width, 0), new THREE.Vector2(layout.width, top), new THREE.Vector2(0, top)]);
  const glass: THREE.BufferGeometry[] = [];
  for (const k of [1, 3]) {
    const uc = layout.aisle + k * r;
    const win = new THREE.Path();
    win.moveTo(uc - r, layout.springing);
    win.absarc(uc, layout.springing, r, Math.PI, 0, true);
    win.lineTo(uc - r, layout.springing);
    outline.holes.push(win);
    const pane = new THREE.Shape();
    pane.moveTo(uc - r, layout.springing);
    pane.absarc(uc, layout.springing, r, Math.PI, 0, true);
    pane.lineTo(uc - r, layout.springing);
    glass.push(new THREE.ShapeGeometry(pane, 24));
  }
  const merged = mergeGeometries(glass, false) as THREE.BufferGeometry;
  for (const g of glass) g.dispose();
  return { wall: new THREE.ShapeGeometry(outline, 24), glass: merged };
}

function clockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#efe8d4';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
    g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58);
    g.stroke();
  }
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + Math.sin(0.5) * 32, 64 - Math.cos(0.5) * 32);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + Math.sin(2.7) * 46, 64 - Math.cos(2.7) * 46);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildShed(layout: ShedLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'train-shed';
  const r = SHED_SPAN_WIDTH / 2;
  const centres = [layout.aisle + r, layout.aisle + 3 * r];

  // roof: glazed shells, semi-transparent so the platforms stay readable from above
  const glazing = new THREE.MeshLambertMaterial({ color: 0x9db4cc, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  for (const uc of centres) {
    const m = new THREE.Mesh(vaultShell(uc, layout), glazing);
    m.renderOrder = 2;
    group.add(m);
  }

  // ribs
  const ribs: THREE.BufferGeometry[] = [];
  for (const uc of centres) for (let v = RIB_SPACING / 2; v < layout.length; v += RIB_SPACING) ribs.push(rib(uc, v, layout));
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs, false) as THREE.BufferGeometry, new THREE.MeshLambertMaterial({ color: steel, side: THREE.DoubleSide }));
  for (const g of ribs) g.dispose();
  group.add(ribMesh);

  // side aisles and flank walls
  const wallH = layout.springing;
  const flank = new THREE.MeshLambertMaterial({ color: brick, side: THREE.DoubleSide });
  const flankGeos: THREE.BufferGeometry[] = [];
  for (const u of [0, layout.width]) {
    const g = new THREE.PlaneGeometry(layout.length, wallH);
    g.rotateY(Math.PI / 2);
    g.translate(u, wallH / 2, -layout.length / 2);
    flankGeos.push(g);
  }
  for (const u0 of [0, layout.width - layout.aisle]) {
    const g = new THREE.PlaneGeometry(layout.aisle, layout.length);
    g.rotateX(-Math.PI / 2);
    g.translate(u0 + layout.aisle / 2, wallH, -layout.length / 2);
    flankGeos.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(flankGeos, false) as THREE.BufferGeometry, flank));
  for (const g of flankGeos) g.dispose();

  // the south front
  const { wall, glass } = frontWall(layout);
  const front = new THREE.Mesh(wall, flank);
  front.position.z = 0.02;
  group.add(front);
  const panes = new THREE.Mesh(glass, new THREE.MeshLambertMaterial({ color: 0x8fb0cf, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  panes.position.z = 0.03;
  panes.renderOrder = 2;
  group.add(panes);

  // the clock tower, centred on the spine, standing just in front of the south front
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(TOWER_SIZE, CLOCK_TOWER_HEIGHT, TOWER_SIZE), flank);
  shaft.position.y = CLOCK_TOWER_HEIGHT / 2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(TOWER_SIZE * 0.78, 5.2, 4), new THREE.MeshLambertMaterial({ color: 0x4a5663 }));
  cap.rotation.y = Math.PI / 4;
  cap.position.y = CLOCK_TOWER_HEIGHT + 2.6;
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.1, 40), new THREE.MeshBasicMaterial({ map: clockTexture() }));
  face.position.set(0, CLOCK_TOWER_HEIGHT - 6.2, TOWER_SIZE / 2 + 0.05); // faces south (+z is south in the local frame)
  tower.add(shaft, cap, face);
  tower.position.set(layout.width / 2, 0, TOWER_SIZE / 2 + 0.1);
  group.add(tower);

  group.rotation.y = -layout.heading;
  group.position.set(layout.origin[0], 0, layout.origin[1]);
  return group;
}
