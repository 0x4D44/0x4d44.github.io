// The light the trains throw. A train's lit lamps are lenses in its one detail mesh (train.ts `setTrainLampState`), so the light they cast is not part of any train: it is drawn
// here, for every train at once, in two instanced meshes, so two draws however many trains there are, and no triangle on a car:
//
//   the POOL  a soft wedge of warm light on the rails and ballast ahead of a cab end that shows `head`: a faint floor by day, full after dark (`poolStrength`);
//   the HALO  a soft glow round each lit lens, after dark only (`haloStrength`), except on a cab that carries its own `lamp-halo` children (train-385.ts). The halos on one side of a cab
//             end share one halo's strength (`HaloPlacement.share`), and each fades as its lens turns from the eye (`HALO_FACING`, in the shader).
//
// No THREE.Light (a light per train would be a shader recompile and a pass per lit train): each is a flat additive quad with a soft falloff texture, which depth-tests against
// the track and the cars and writes no depth. The PLACEMENT is a pure function of the trains (`poolPlacements`, `haloPlacements`: trains in, instance list out, no state of
// its own); `TrainLampLights` owns the two meshes and is given the placements once a frame: `begin()`, `add(train)` for each train of the scene, `commit()` (or `update(trains)`).
// What the trains show is what `setTrainLampState` left on them (`userData.lampState`, SERVICE_LAMPS until it is called), so only an end showing `head` casts a pool, and a
// coupled unit's inner cab end (`userData.lamps.interior`) never does.
//
// A train is in the frame of train.ts: car 0's nose at z = 0 pointing -z (the `front` end), the last car's nose at the train's length pointing +z (the `rear` end); a live
// train's car nodes are moved to world places, so each end is placed by the world matrix of its own car node.
import * as THREE from 'three';
import { LENS, SERVICE_LAMPS, lensLook } from './train.ts';
import type { LampRecord, LensRole, TrainLampMode, TrainLampState } from './train.ts';
import { trainNight } from './train-geom.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (e0: number, e1: number, x: number): number => {
  const k = clamp01((x - e0) / (e1 - e0));
  return k * k * (3 - 2 * k);
};

/**
 * The pool of a headlamp end. It begins at the lamps and reaches `length` metres ahead along the car's axis, widening from the width of the two lamps to `width` at its far
 * end; `y` is its height over the rail head (y = 0, track.ts RAIL_TOP): over the rails' tops and the ballast's 14 cm under them, which it lights from over them. Its strength
 * is `day` (a faint floor: the lamps are on) rising to `night` with `trainNight`. ASSUMED: sizes and strengths are a look, not a measurement.
 */
export const POOL = { length: 30, width: 7.5, y: 0.02, day: 0.05, night: 0.45, hex: LENS.headOn } as const;
/**
 * The halo of a lit lens: a disc in the lens's plane, `lift` metres in front of it, that reaches `scale` times the lens group's half-width (not under `min`, not over `max`,
 * metres), at `night` strength after dark and none by day. The disc is dark in its middle (the lens keeps its own colour) and fades to nothing at its edge. The halos on one side of a
 * cab end share `night` between them (each takes `1 / n`: see `HaloPlacement.share`), because their discs overlap, as the AT300's headlamp and marker array do, and the glow where they
 * overlap would otherwise be twice `night` and hide the lamps it surrounds.
 */
export const HALO = { scale: 5, min: 0.35, max: 0.8, lift: 0.03, night: 0.85 } as const;
/**
 * How a halo gives way as its lens turns from the eye. The disc stands in its lens's plane, so from the side it is a sliver and from behind it is its back: a flare hanging off the nose
 * that no lamp throws. The shader scales its strength by smoothstep(`from`, `to`, c), c the cosine of the angle between the lens's normal and the way to the eye: none at `from` and under
 * (edge-on, or behind), whole from `to` up (facing the eye). `to` is under 0.4 because the AT300's lens groups face about 65 degrees off the nose's axis, so an eye dead ahead sees them at
 * c = 0.4 and must find them whole. ASSUMED: a look, not a measurement.
 */
export const HALO_FACING = { from: 0.1, to: 0.35 } as const;

/** The pool's strength at a night level (trainNight): a faint floor by day, rising to full. */
export const poolStrength = (night: number): number => POOL.day + (POOL.night - POOL.day) * clamp01(night);
/** The halo's strength at a night level: none by day, full after dark. */
export const haloStrength = (night: number): number => HALO.night * clamp01(night);

/**
 * How bright the pool is at a point of it, 0 to 1: `u` across it (-1 to 1, 0 on the axis) and `t` along it (0 at the lamps, 1 at its far end). It widens with t, is dark at the lamps'
 * feet, has its brightest a few metres out and fades to nothing at the far end and at its edges, so no edge of the quad shows.
 */
export function poolFalloff(u: number, t: number): number {
  const half = 0.3 + 0.7 * t;
  const across = 1 - smooth(0, 1, Math.abs(u) / half);
  const along = smooth(0, 0.18, t) * (1 - smooth(0.12, 1, t));
  return across * along;
}
/** How bright the halo is at distance `rho` from its middle (0), to its edge (1): dark in the middle, brightest a third of the way out, nothing at the edge. */
export const haloFalloff = (rho: number): number => smooth(0, 0.35, rho) * (1 - smooth(0.3, 1, rho)) ** 2;

/** A grey-scale texture of `at(x, y)` (x and y in 0..1 over the texture, y from its bottom row): the falloffs above, as the multiplier a map gives an additive quad. */
function falloffTexture(width: number, height: number, at: (x: number, y: number) => number): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const v = Math.round(255 * clamp01(at((i + 0.5) / width, (j + 0.5) / height)));
      data.set([v, v, v, 255], 4 * (j * width + i));
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
/** The pool's texture: its row 0 is the far end of the quad (local +z), its top row the lamps' end (see `TrainLampLights`), so `t` runs down from the top. */
export const poolTexture = (): THREE.DataTexture => falloffTexture(32, 64, (x, y) => poolFalloff(2 * x - 1, 1 - y));
/** The halo's texture: a disc over the quad's inscribed circle. */
export const haloTexture = (): THREE.DataTexture => falloffTexture(64, 64, (x, y) => haloFalloff(Math.hypot(2 * x - 1, 2 * y - 1)));

/** One lamp cluster of a cab end: the lenses of one role on one side of the cab, in the car's own frame. */
export interface LampSite {
  role: LensRole;
  /** which side of the cab's axis it is on (0: on it) */
  side: -1 | 0 | 1;
  centre: THREE.Vector3;
  /** the way the lenses face (unit) */
  normal: THREE.Vector3;
  /** half the larger of its width and height, metres */
  radius: number;
}
/** A cab end of a train that can show lamps. */
export interface LampEnd {
  end: 'front' | 'rear';
  /** what it shows: the train's lamp state (SERVICE_LAMPS before `setTrainLampState` has been called) */
  mode: TrainLampMode;
  /** the car of the end: its frame is the train's, and its world matrix places the end */
  car: THREE.Object3D;
  /** the lamps' place along that frame (the mean z of the lenses) and the way the end faces along it: -1 at the front, +1 at the rear */
  z: number;
  dir: -1 | 1;
  sites: LampSite[];
  /** the cab carries its own halo (`lamp-halo` children of its detail mesh, train-385.ts) */
  ownHalo: boolean;
}

const sitesCache = new WeakMap<THREE.Mesh, { z: number; sites: LampSite[] }>();
/** The lamp clusters of a cab's detail mesh (its geometry's lens vertices, grouped by role and side), worked out once. */
function sitesOf(mesh: THREE.Mesh, lamps: LampRecord, dir: -1 | 1): { z: number; sites: LampSite[] } {
  const hit = sitesCache.get(mesh);
  if (hit) return hit;
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const groups = new Map<string, { role: LensRole; side: -1 | 0 | 1; sum: THREE.Vector3; count: number; min: THREE.Vector3; max: THREE.Vector3; normal: THREE.Vector3 }>();
  for (const lens of lamps.lenses) {
    if (!(lens.v1 > lens.v0)) continue;
    let mean = 0;
    for (let v = lens.v0; v < lens.v1; v++) mean += position.getX(v);
    mean /= lens.v1 - lens.v0;
    const side = Math.abs(mean) < 0.05 ? 0 : mean > 0 ? 1 : -1;
    const key = `${lens.role}:${side}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { role: lens.role, side, sum: new THREE.Vector3(), count: 0, min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), normal: new THREE.Vector3() }));
    const at = new THREE.Vector3();
    for (let v = lens.v0; v < lens.v1; v++) {
      at.fromBufferAttribute(position, v);
      g.sum.add(at);
      g.min.min(at);
      g.max.max(at);
      g.normal.add(new THREE.Vector3().fromBufferAttribute(normal, v));
      g.count++;
    }
  }
  const sites: LampSite[] = [...groups.values()].map((g) => ({
    role: g.role, side: g.side, centre: g.sum.clone().multiplyScalar(1 / g.count),
    normal: g.normal.lengthSq() > 1e-12 ? g.normal.clone().normalize() : new THREE.Vector3(0, 0, dir),
    radius: Math.max(g.max.x - g.min.x, g.max.y - g.min.y) / 2,
  }));
  const found = { z: sites.length ? sites.reduce((sum, s) => sum + s.centre.z, 0) / sites.length : 0, sites };
  sitesCache.set(mesh, found);
  return found;
}

const meshesCache = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
/** The detail meshes of a train's cab ends (the cars that carry a `userData.lamps` record), found once. */
function lampMeshes(train: THREE.Object3D): THREE.Mesh[] {
  let list = meshesCache.get(train);
  if (!list) {
    const found: THREE.Mesh[] = [];
    train.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && mesh.name === 'body-detail' && mesh.userData.lamps) found.push(mesh); });
    meshesCache.set(train, (list = found));
  }
  return list;
}
const shown = (o: THREE.Object3D): boolean => {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
};

/**
 * The cab ends of a train that can show lamps: the outer ends of its cars that are drawn (a hidden car, as trains-live hides one with no track under it, or a hidden train has none).
 * A coupled unit's inner cab end (`interior`) is left out: it is dark and casts nothing.
 */
export function lampEnds(train: THREE.Object3D): LampEnd[] {
  const state: TrainLampState = (train.userData.lampState as TrainLampState | undefined) ?? SERVICE_LAMPS;
  const ends: LampEnd[] = [];
  for (const mesh of lampMeshes(train)) {
    const lamps = mesh.userData.lamps as LampRecord, car = mesh.parent;
    if (lamps.interior || !car || !shown(mesh)) continue;
    const dir = lamps.end === 'front' ? -1 : 1;
    const { z, sites } = sitesOf(mesh, lamps, dir);
    ends.push({ end: lamps.end, mode: state[lamps.end], car, z, dir, sites, ownHalo: mesh.children.some((c) => c.name === 'lamp-halo') });
  }
  return ends;
}

/** A train to light: its group and how opaque it is drawn (a train fading in or out of the scene), 1 if not given. */
export interface LampTrain { readonly group: THREE.Object3D; readonly opacity?: number }
/** One pool: its middle (world x, y, z), the heading of its far end (a rotation about y from +z, so the far end lies along (sin, cos) in x and z: not a TrainView's compass bearing), its size, and how opaque its train is. */
export interface PoolPlacement { end: 'front' | 'rear'; position: [number, number, number]; headingRad: number; length: number; width: number; opacity: number }
/**
 * One halo: its middle, the quaternion that turns the quad's +z to the way its lens faces, its radius, its colour, how opaque its train is, and its `share` of the strength: 1 over the number
 * of halos on its side of its end (1 for a side with one halo), so the halos of a side add up to one halo's strength.
 */
export interface HaloPlacement { end: 'front' | 'rear'; role: LensRole; position: [number, number, number]; quaternion: [number, number, number, number]; radius: number; hex: number; opacity: number; share: number }

/**
 * The pools of a set of trains, one for each end that shows `head`, none for any other end: starting at the lamps and reaching `POOL.length` ahead of the end along its car's axis.
 * Pure: the same trains in the same poses and states give the same list.
 */
export function poolPlacements(trains: Iterable<LampTrain>): PoolPlacement[] {
  const out: PoolPlacement[] = [];
  const at = new THREE.Vector3(), ahead = new THREE.Vector3();
  for (const { group, opacity = 1 } of trains) {
    if (!(opacity > 0)) continue;
    for (const e of lampEnds(group)) {
      if (e.mode !== 'head') continue;
      e.car.updateWorldMatrix(true, false);
      at.set(0, 0, e.z).applyMatrix4(e.car.matrixWorld);
      ahead.set(0, 0, e.dir).transformDirection(e.car.matrixWorld);
      ahead.y = 0;
      if (ahead.lengthSq() < 1e-12) continue;
      ahead.normalize();
      out.push({ end: e.end, position: [at.x + (ahead.x * POOL.length) / 2, POOL.y, at.z + (ahead.z * POOL.length) / 2], headingRad: Math.atan2(ahead.x, ahead.z), length: POOL.length, width: POOL.width, opacity });
    }
  }
  return out;
}

const FORWARD = new THREE.Vector3(0, 0, 1);
/**
 * The halos of a set of trains: one for each lit lens group (one role on one side of a cab) of an end showing `head` or `tail`, standing `HALO.lift` off the face; none for an
 * unlit end, and none for a cab that carries its own `lamp-halo`. The halos on one side of an end share one halo's strength: each is given `share`, 1 over how many of them there are on that
 * side. Pure, like `poolPlacements`.
 */
export function haloPlacements(trains: Iterable<LampTrain>): HaloPlacement[] {
  const out: HaloPlacement[] = [];
  const at = new THREE.Vector3(), facing = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const { group, opacity = 1 } of trains) {
    if (!(opacity > 0)) continue;
    for (const e of lampEnds(group)) {
      if (e.mode === 'off' || e.ownHalo) continue;
      e.car.updateWorldMatrix(true, false);
      const glowing = e.sites.map((s) => ({ s, look: lensLook(s.role, e.mode) })).filter(({ look }) => look.glow === 2);
      for (const { s, look } of glowing) {
        at.copy(s.centre).addScaledVector(s.normal, HALO.lift).applyMatrix4(e.car.matrixWorld);
        facing.copy(s.normal).transformDirection(e.car.matrixWorld);
        q.setFromUnitVectors(FORWARD, facing);
        const share = 1 / glowing.filter((o) => o.s.side === s.side).length;
        out.push({ end: e.end, role: s.role, position: [at.x, at.y, at.z], quaternion: [q.x, q.y, q.z, q.w], radius: Math.min(HALO.max, Math.max(HALO.min, HALO.scale * s.radius)), hex: look.hex, opacity, share });
      }
    }
  }
  return out;
}

/**
 * How many instances each of the two meshes can hold: a pool or halo past it is dropped (and counted in `dropped`), never drawn wrongly. A train lights at most two pools and
 * eight halos (an LNER set showing head at both ends: four lens groups at a head end, two at a tail end; the other classes two at each end), six in service, so 128 and 512 hold
 * the lights of 64 trains in that worst state and 85 in service, well past a London peak; the buffers are 40 KB in all.
 */
export const LIGHT_CAPACITY = { pool: 128, halo: 512 } as const;

const glslFloat = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/**
 * The lines the halo's shader is given (GLSL as three writes it, so web/tests/glsl.ts can run them). In the vertex shader, after the position is projected: the halo's own centre and its
 * +z axis (the way its lens faces) in the world, from its instance matrix, and `HALO_FACING` applied to the cosine of that axis against the way to the camera, into a varying that is the
 * same over the whole quad (it is made from the instance alone). In the fragment shader, after the colour is read: the alpha, which an additive blend multiplies the light by, is scaled by it.
 * ASSUMED: the material is only ever drawn instanced (the halo mesh): `instanceMatrix` is not declared otherwise.
 */
export const HALO_FACING_GLSL = {
  declare: 'varying float vHaloFacing;',
  vertex: [
    'vec3 haloAt = ( modelMatrix * ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ) ).xyz;',
    'vec3 haloFace = normalize( ( modelMatrix * ( instanceMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ) ).xyz );',
    `vHaloFacing = smoothstep( ${glslFloat(HALO_FACING.from)}, ${glslFloat(HALO_FACING.to)}, dot( haloFace, normalize( cameraPosition - haloAt ) ) );`,
  ].join('\n'),
  fragment: 'diffuseColor.a *= vHaloFacing;',
} as const;
/** The halo material's `onBeforeCompile`: `HALO_FACING_GLSL` into three's own MeshBasicMaterial shaders, at the two chunks they are anchored to. */
function faceTheEye(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${HALO_FACING_GLSL.declare}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${HALO_FACING_GLSL.vertex}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${HALO_FACING_GLSL.declare}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${HALO_FACING_GLSL.fragment}`);
}

/**
 * The two instanced meshes that draw the light of a scene's trains: `pool` (the quads on the ground) and `halo` (the discs at the lenses), under one `group` to add to the scene.
 * Given the trains once a frame: `begin()`, `add(train, opacity)` for each, `commit()`; `update(trains)` is the three in one. The strengths follow the shared `trainNight`, set at
 * `commit()` and again as each mesh is drawn (its `onBeforeRender`), so a night level set after the commit in the same frame still reaches the draw. Both meshes are additive
 * (`depthWrite` off, a polygon offset, no fog and no tone map, as the other glows are), uncullable (their instances move about the scene) and not pickable. The halo's shader also scales
 * each disc by how squarely its lens faces the camera (`HALO_FACING_GLSL`).
 */
export class TrainLampLights {
  readonly group = new THREE.Group();
  readonly pool: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly halo: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** how many placements the last commit could not hold */
  dropped = 0;
  private pools: PoolPlacement[] = [];
  private halos: HaloPlacement[] = [];
  private readonly capacity: { pool: number; halo: number };

  constructor(capacity: { pool?: number; halo?: number } = {}) {
    this.capacity = { pool: capacity.pool ?? LIGHT_CAPACITY.pool, halo: capacity.halo ?? LIGHT_CAPACITY.halo };
    const material = (map: THREE.Texture, offset: number, side: THREE.Side): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      map, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, toneMapped: false, side,
      polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset,
    });
    // the pool's quad lies flat on the ground: x across, local +z the far end (the texture's row 0), the lamps' end at -z
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.pool = new THREE.InstancedMesh(flat, material(poolTexture(), 2, THREE.FrontSide), this.capacity.pool);
    this.pool.name = 'lamp-pool';
    this.pool.renderOrder = 1;
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material(haloTexture(), 1, THREE.DoubleSide), this.capacity.halo);
    this.halo.name = 'lamp-glow';
    this.halo.renderOrder = 2;
    this.halo.material.onBeforeCompile = faceTheEye;
    this.halo.material.customProgramCacheKey = (): string => `lamp-halo-facing-${HALO_FACING.from}-${HALO_FACING.to}`;
    for (const mesh of [this.pool, this.halo]) {
      mesh.frustumCulled = false;
      mesh.raycast = (): void => {};
      mesh.count = 0;
      mesh.visible = false;
      mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // the colour buffer exists from the first draw on, so it never changes the program
      mesh.onBeforeRender = (): void => this.strengthen();
      this.group.add(mesh);
    }
    this.group.name = 'train-lamp-lights';
  }

  /** Start a frame: forget the last one's placements. */
  begin(): void {
    this.pools.length = 0;
    this.halos.length = 0;
  }
  /** Accumulate the lights of one train (`opacity`: how opaque it is drawn). */
  add(train: THREE.Object3D, opacity = 1): void {
    const one = [{ group: train, opacity }];
    this.pools.push(...poolPlacements(one));
    this.halos.push(...haloPlacements(one));
  }
  /** Write the frame's placements into the two meshes, once, and set their strengths. */
  commit(): void {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), tint = new THREE.Color(POOL.hex);
    const up = new THREE.Vector3(0, 1, 0);
    const pools = this.pools.slice(0, this.capacity.pool), halos = this.halos.slice(0, this.capacity.halo);
    this.dropped = this.pools.length - pools.length + (this.halos.length - halos.length);
    pools.forEach((placement, i) => {
      q.setFromAxisAngle(up, placement.headingRad);
      m.compose(p.set(...placement.position), q, s.set(placement.width, 1, placement.length));
      this.pool.setMatrixAt(i, m);
      this.pool.setColorAt(i, c.copy(tint).multiplyScalar(placement.opacity));
    });
    halos.forEach((placement, i) => {
      m.compose(p.set(...placement.position), q.set(...placement.quaternion), s.set(2 * placement.radius, 2 * placement.radius, 1));
      this.halo.setMatrixAt(i, m);
      this.halo.setColorAt(i, c.setHex(placement.hex).multiplyScalar(placement.opacity * placement.share));
    });
    this.pool.count = pools.length;
    this.halo.count = halos.length;
    for (const mesh of [this.pool, this.halo]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.strengthen();
  }
  /** `begin()`, `add()` for each train, `commit()`. */
  update(trains: Iterable<LampTrain>): void {
    this.begin();
    for (const t of trains) this.add(t.group, t.opacity);
    this.commit();
  }
  /** Set the strengths from the shared night level (or `night`): the pool a faint floor by day, the halo none; a mesh with nothing to draw is hidden. */
  strengthen(night: number = trainNight.value): void {
    this.pool.material.opacity = poolStrength(night);
    this.halo.material.opacity = haloStrength(night);
    this.pool.visible = this.pool.count > 0;
    this.halo.visible = this.halo.count > 0 && this.halo.material.opacity > 0.004;
  }
  /** Take the group out of its scene and free the meshes' geometry, materials and textures. */
  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.pool, this.halo]) {
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
  }
}
