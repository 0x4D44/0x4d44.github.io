// The light a train's headlamps throw on what stands in front of them: the walls, the platform faces, the tunnel's lining, the other trains (design option A, 2026-11-12).
// The pool on the rails (train-lamp-pool.ts) lights the track bed with a decal; this lights every other lit surface, in the shader, from the HEADLAMP_SLOTS nearest lit
// headlamps in view:
//
//   the LIGHT     a spotlight per slot, cone `HEADLAMP_LIGHT.inner` to `.outer` degrees, out to `.range` metres, N·L, no shadow (so it leaks through a standing train or a
//                 wall within the range). It is added to the direct diffuse of every Lambert program (lighting.ts `addRoofShade`, which every Lambert passes through) and to the
//                 colour of the few MeshBasic surfaces it should reach (`addHeadlampBasic`: the signals and the tunnels' lining). Everything within `floorOver` of the
//                 lamp's own rail level, whichever way it faces, is left to the pool (`floorMask` in the GLSL), so the track bed is not lit twice.
//   the SLOTS     `HEADLAMP_SLOTS` is fixed at compile time: the light changes only uniform values (`headlampUniforms`), never a program, so nothing recompiles after load.
//                 The slots go to the ends showing `head` whose lit volume is in the frustum, nearest the camera first, with hysteresis (a lamp that holds a slot keeps it
//                 against one a little nearer) and a fade of `HEADLAMP_LIGHT.fade` seconds in and out (`selectHeadlamps`, pure).
//   the NIGHT     `headlampNight` is the sun's own lamp ramp (core/daylight.ts `lampLevelFor`), not `trainNight`: a gloomy day brings the lamps on, but by day the walls get
//                 none of their light (Arthur's "day floor zero", 2026-11-13). By day the count is 0, the shader skips the loop and the picture is the one it was.
//
// main.ts is the one writer of the uniforms, once a frame (`HeadlampFrame.update`), for the scene on show.
import * as THREE from 'three';
import type { LampTrain } from './train-lamp-pool.ts';
import { lampEnds } from './train-lamp-pool.ts';
import { LENS } from './train.ts';

/** How many headlamps light the scene at once: the length of the uniform arrays, so a compile-time constant of every program that takes the light. */
export const HEADLAMP_SLOTS = 8;

/**
 * The light of one headlamp end. `inner` and `outer`: the cone's half-angles, degrees (full strength inside `inner`, none outside `outer`). `range`: metres, where it is gone
 * (a smooth window, `(1 - (d / range)^4)^2`). `level`: what a surface square to the beam `ref` metres away reflects, in units of its own albedo, at full strength; it falls
 * with the square of the distance, held at its value at `near` metres closer in. `floorOver`: the floor mask, metres over the lamp's rail level: all of the light under the first,
 * none over the second, whichever way the surface faces. The track bed is the pool's: the first GPU look pack (13 Nov) had a mask of up-facing faces only, and the sleepers'
 * 5 cm ends, which face up the track at the lamp, took the whole beam, a white bar on every sleeper. A wall's foot loses this light below the mask. `fade`: seconds to fade a slot in or out. `hysteresis`: a lamp that holds a slot is
 * ranked as if this much of its distance away. ASSUMED: a look, not a measurement; the GPU look pack tunes `level`.
 */
export const HEADLAMP_LIGHT = {
  inner: 12, outer: 25, range: 45, level: 0.8, ref: 10, near: 5,
  floorOver: [0.35, 0.6],
  fade: 0.25, hysteresis: 0.8,
} as const;

/** The night level the light follows: 0 by day, rising from dusk (atmosphere.ts sets it from the sun, `lampLevelFor`). */
export const headlampNight = { value: 0 };

/** The uniforms every lit program shares: how many slots are in use, and for each, the lamp (xyz, world) with its rail level (w), and its aim (xyz, unit) with its strength (w). */
export const headlampUniforms = {
  uHeadlampCount: { value: 0 },
  uHeadlampPos: { value: Array.from({ length: HEADLAMP_SLOTS }, () => new THREE.Vector4()) },
  uHeadlampAim: { value: Array.from({ length: HEADLAMP_SLOTS }, () => new THREE.Vector4()) },
};

const f = (x: number): string => {
  const s = x.toFixed(6).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
};
const cos = (deg: number): number => Math.cos((deg * Math.PI) / 180);
const lensLinear = new THREE.Color(LENS.headOn);

/**
 * The GLSL (as three writes it; web/tests/glsl.ts runs `one`). `declare`: the uniforms. `one`: the light of one lamp at a world point `p` with world normal `n`, in units of the
 * albedo (the caller multiplies by the surface's diffuse colour): `lamp` the lamp and its rail level, `aim` its direction and strength. `sum`: the slots in use, added up.
 */
export const HEADLAMP_GLSL = {
  declare: `uniform int uHeadlampCount;\nuniform vec4 uHeadlampPos[ ${HEADLAMP_SLOTS} ];\nuniform vec4 uHeadlampAim[ ${HEADLAMP_SLOTS} ];`,
  one: `vec3 headlampOne( vec3 p, vec3 n, vec4 lamp, vec4 aim ) {
  vec3 toLamp = lamp.xyz - p;
  float d = length( toLamp );
  if ( d >= ${f(HEADLAMP_LIGHT.range)} ) return vec3( 0.0 );
  vec3 l = toLamp / max( d, 0.001 );
  float cone = smoothstep( ${f(cos(HEADLAMP_LIGHT.outer))}, ${f(cos(HEADLAMP_LIGHT.inner))}, dot( - l, aim.xyz ) );
  float facing = max( dot( n, l ), 0.0 );
  float x = d / ${f(HEADLAMP_LIGHT.range)};
  float edge = 1.0 - x * x * x * x;
  float held = max( d, ${f(HEADLAMP_LIGHT.near)} );
  float fall = ${f(HEADLAMP_LIGHT.ref * HEADLAMP_LIGHT.ref)} / ( held * held );
  float floorMask = 1.0 - smoothstep( ${f(HEADLAMP_LIGHT.floorOver[0])}, ${f(HEADLAMP_LIGHT.floorOver[1])}, p.y - lamp.w );
  return vec3( ${f(lensLinear.r)}, ${f(lensLinear.g)}, ${f(lensLinear.b)} ) * ( ${f(HEADLAMP_LIGHT.level)} * aim.w * cone * facing * edge * edge * fall * ( 1.0 - floorMask ) );
}`,
  sum: `vec3 headlampsAt( vec3 p, vec3 n ) {
  vec3 sum = vec3( 0.0 );
  for ( int i = 0; i < ${HEADLAMP_SLOTS}; i ++ ) {
    if ( i >= uHeadlampCount ) break;
    sum += headlampOne( p, n, uHeadlampPos[ i ], uHeadlampAim[ i ] );
  }
  return sum;
}`,
} as const;
/** All of it, for a program's fragment shader (after `#include <common>`). */
export const HEADLAMP_FRAGMENT = `${HEADLAMP_GLSL.declare}\n${HEADLAMP_GLSL.one}\n${HEADLAMP_GLSL.sum}`;
/** What marks a shader that has it, so it is put in once. */
export const HEADLAMP_MARK = 'vec3 headlampOne(';

// ---- which lamps get the slots -----------------------------------------------------------------------------------------------------------

/** A lit headlamp end: a stable `key` (its car and end), the lamp's place and aim in the world, its rail level, and how opaque its train is drawn. */
export interface HeadlampCandidate { key: string; position: THREE.Vector3; aim: THREE.Vector3; floorY: number; opacity: number }

/** The ends of these trains that show `head`: one light each, at the mean of its head lenses (all its lenses if it has none tagged head), aimed along its car's axis. */
export function headlampCandidates(trains: Iterable<LampTrain>): HeadlampCandidate[] {
  const out: HeadlampCandidate[] = [];
  for (const { group, opacity = 1 } of trains) {
    if (!(opacity > 0)) continue;
    for (const e of lampEnds(group)) {
      if (e.mode !== 'head' || e.sites.length === 0) continue;
      const heads = e.sites.filter((s) => s.role === 'head');
      const sites = heads.length ? heads : e.sites;
      const at = new THREE.Vector3();
      for (const s of sites) at.add(s.centre);
      at.multiplyScalar(1 / sites.length);
      e.car.updateWorldMatrix(true, false);
      const rail = new THREE.Vector3(0, 0, e.z).applyMatrix4(e.car.matrixWorld);
      const aim = new THREE.Vector3(0, 0, e.dir).transformDirection(e.car.matrixWorld);
      out.push({ key: `${e.car.uuid}:${e.end}`, position: at.applyMatrix4(e.car.matrixWorld), aim, floorY: rail.y, opacity });
    }
  }
  return out;
}

/** A slot as it is drawn: a candidate and the strength it is given (its fade times its train's opacity). */
export interface HeadlampSlot { candidate: HeadlampCandidate; strength: number }

const lit = new THREE.Sphere();
/** Whether any of a lamp's lit volume (the sphere over the half of its range ahead of it) is in the frustum. */
export function headlampInView(c: HeadlampCandidate, frustum: THREE.Frustum): boolean {
  lit.center.copy(c.aim).multiplyScalar(HEADLAMP_LIGHT.range / 2).add(c.position);
  lit.radius = HEADLAMP_LIGHT.range / 2;
  return frustum.intersectsSphere(lit);
}

/**
 * Give the slots out, for one frame. Pure: `fades` is the last frame's (key to fade, 0 to 1; not changed), and the new one is returned with the slots.
 * The lamps in view are ranked by their distance from the camera, a lamp that holds a slot (fade over 0) at `hysteresis` of its own; the first `HEADLAMP_SLOTS` are wanted.
 * A lamp that holds a slot fades toward 1 if it is wanted and toward 0 if not (or if it has gone out of view), over `fade` seconds, and gives the slot up at 0; one that is gone
 * from the candidates (its train has gone or its lamps changed) gives it up at once. A wanted lamp that holds none takes a free one, nearest first, and starts to fade in. So
 * there are never more than `HEADLAMP_SLOTS` slots, and none pops.
 */
export function selectHeadlamps(candidates: readonly HeadlampCandidate[], camera: THREE.Vector3, frustum: THREE.Frustum, fades: ReadonlyMap<string, number>, dt: number):
  { slots: HeadlampSlot[]; fades: Map<string, number> } {
  const step = HEADLAMP_LIGHT.fade > 0 ? Math.max(0, dt) / HEADLAMP_LIGHT.fade : 1;
  const ranked = candidates.filter((c) => headlampInView(c, frustum)).map((c) => {
    const d = c.position.distanceTo(camera);
    return { c, rank: (fades.get(c.key) ?? 0) > 0 ? d * HEADLAMP_LIGHT.hysteresis : d };
  }).sort((a, b) => a.rank - b.rank || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : 0));
  const wanted = new Set(ranked.slice(0, HEADLAMP_SLOTS).map((r) => r.c.key));
  const next = new Map<string, number>();
  const held: HeadlampSlot[] = [];
  const byKey = new Map(candidates.map((c) => [c.key, c] as const));
  for (const [key, fade] of fades) {
    const c = byKey.get(key);
    if (!c || !(fade > 0)) continue;
    const to = wanted.has(key) ? Math.min(1, fade + step) : fade - step;
    if (to <= 0) continue;
    next.set(key, to);
    held.push({ candidate: c, strength: to * c.opacity });
  }
  for (const { c } of ranked) {
    if (held.length >= HEADLAMP_SLOTS) break;
    if (!wanted.has(c.key) || next.has(c.key) || (fades.get(c.key) ?? 0) > 0) continue;
    const to = Math.min(1, step);
    if (!(to > 0)) continue;
    next.set(c.key, to);
    held.push({ candidate: c, strength: to * c.opacity });
  }
  const distance = (s: HeadlampSlot): number => s.candidate.position.distanceTo(camera);
  held.sort((a, b) => distance(a) - distance(b));
  return { slots: held, fades: next };
}

/** Write the slots into the shared uniforms at a night level: strength times night; with no night, or no slots, the count is 0 (the shader skips the loop). */
export function writeHeadlamps(slots: readonly HeadlampSlot[], night: number, uniforms = headlampUniforms): void {
  const level = Math.min(1, Math.max(0, night));
  let n = 0;
  if (level > 0) {
    for (const s of slots) {
      if (n >= HEADLAMP_SLOTS) break;
      const strength = s.strength * level;
      if (!(strength > 0)) continue;
      const { position, aim, floorY } = s.candidate;
      uniforms.uHeadlampPos.value[n]!.set(position.x, position.y, position.z, floorY);
      uniforms.uHeadlampAim.value[n]!.set(aim.x, aim.y, aim.z, strength);
      n++;
    }
  }
  uniforms.uHeadlampCount.value = n;
}

/**
 * The per-frame state of the light: the fades. `update(trains, camera, dt)` once a frame, after the trains are posed, the camera has moved and the sky has set `headlampNight`,
 * before the render. By day it does no work but to write a count of 0 and forget the fades, so at dusk the lamps fade in.
 */
export class HeadlampFrame {
  private fades = new Map<string, number>();
  private readonly frustum = new THREE.Frustum();
  private readonly matrix = new THREE.Matrix4();
  /** what the last update gave out, for a script to read */
  slots: HeadlampSlot[] = [];

  update(trains: Iterable<LampTrain>, camera: THREE.Camera, dt: number, night: number = headlampNight.value): void {
    if (!(night > 0)) {
      this.fades.clear();
      this.slots = [];
      writeHeadlamps(this.slots, 0);
      return;
    }
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const position = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const { slots, fades } = selectHeadlamps(headlampCandidates(trains), position, this.frustum, this.fades, dt);
    this.fades = fades;
    this.slots = slots;
    writeHeadlamps(slots, night);
  }
}

// ---- the unlit surfaces it reaches -------------------------------------------------------------------------------------------------------

/**
 * The lines a MeshBasic program is given to take the headlamps' light (`addHeadlampBasic`): in the vertex shader, the view-space place (as a Lambert program's `vViewPosition`);
 * in the fragment shader, before the output, the slots' light at the fragment's world place on the face's own normal (from the place's derivatives, turned to the camera:
 * a MeshBasic program has no normal of its own), times `albedo`, added to the colour, only while a slot is in use.
 */
export const HEADLAMP_BASIC_GLSL = {
  declare: 'varying vec3 vHeadlampView;',
  vertex: 'vHeadlampView = - mvPosition.xyz;',
  fragment: (albedo: string): string => `if ( uHeadlampCount > 0 ) {
  vec3 headlampP = cameraPosition - vHeadlampView * mat3( viewMatrix );
  vec3 headlampN = normalize( cross( dFdx( headlampP ), dFdy( headlampP ) ) );
  if ( dot( headlampN, cameraPosition - headlampP ) < 0.0 ) headlampN = - headlampN;
  outgoingLight += headlampsAt( headlampP, headlampN ) * ${albedo};
}`,
} as const;

const basics = new WeakSet<THREE.Material>();
/**
 * Give a MeshBasic material the headlamps' light (the signals' posts and heads, the tunnels' lining): their light at the fragment times `albedo` (a grey, linear, for a surface whose
 * flat colour is darker than what it reflects: the tunnel's lining is drawn near black, and is sooty brick under a lamp) or, without one, the surface's own colour. Any
 * `onBeforeCompile` it already has runs first, and its key is kept in the program's; a material is given it once. Instanced or not: three's `project_vertex` puts the instance matrix into `mvPosition`.
 */
export function addHeadlampBasic(material: THREE.MeshBasicMaterial, albedo?: number): void {
  if (basics.has(material)) return;
  basics.add(material);
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey();
  const reflect = albedo === undefined ? 'diffuseColor.rgb' : `vec3( ${f(albedo)} )`;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    Object.assign(shader.uniforms, headlampUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADLAMP_BASIC_GLSL.declare}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${HEADLAMP_BASIC_GLSL.vertex}`);
    let fragment = shader.fragmentShader.replace('#include <common>', `#include <common>\n${HEADLAMP_BASIC_GLSL.declare}`);
    if (!fragment.includes(HEADLAMP_MARK)) fragment = fragment.replace('#include <common>', `#include <common>\n${HEADLAMP_FRAGMENT}`);
    shader.fragmentShader = fragment.replace('#include <opaque_fragment>', `${HEADLAMP_BASIC_GLSL.fragment(reflect)}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${priorKey}+headlampBasic${albedo === undefined ? '' : `-${albedo}`}`;
  material.needsUpdate = true;
}
