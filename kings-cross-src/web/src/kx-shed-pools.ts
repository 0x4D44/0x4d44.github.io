// The King's Cross shed's floor light (shed-interior B7, round 1). Gap-scan-2: "by night the platform is lit flat and evenly". The shed's
// lamps lit the platforms through the shared bounded pool decals (station-lamps.ts, streetlights.ts), which at a pool's centre replace the floor
// with a flat 0.2 of the LED's colour and overlap at the 12.2 m pitch, so the whole platform read one cool grey, its slab joints gone. Here the
// platform tops and edge strips draw the pools in their own shader instead, from a small baked map (one texture, no light, no draw, nothing in
// the shadow pass): after dark, under the shed, the night key and sky light the floor keeps fall to `moon`, and each lamp adds a warm-white
// pool on the floor's own albedo (so the joints still read), brightest under the lamp and falling off along the row and across the island; the
// track bed, not drawn with these materials, keeps only its dim base. By day the floor's light falls toward the vault walls, under the lined
// flanks, so the platforms under the glazed crown read brighter than those beside the walls (SHED_CROWN_FLOOR).
import * as THREE from 'three';
import { SHED_SPAN_WIDTH, worldToShed } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { smoothstep } from '../../core/daylight.ts';
import { crownBelowUniforms } from './lighting.ts';
import { windowNight } from './materials.ts';

/**
 * The night pools. ASSUMED amounts (no night photograph of the shed's floor is held). Round 1b (the lead's GPU capture of round 1, night
 * platform-eye-p8-south: along the platform's centreline 146-152 under a lamp, 103-116 midway, an even warm wash at 1.4:1): fitted to that capture
 * through ACES at the night exposure (2.3), which put the floor's lamp light at 0.125 of `gain` per unit of pool and the moon's at 0.006 (at
 * `moon` 0.5): `sigma` 3.5 -> 2.5, `spill` 0.15 -> 0.13, `moon` 0.5 -> 0.2 and `gain` 0.7 -> 0.85 aim at about sRGB 160 under a lamp and 60
 * midway along a 12.2 m row (about 2.7:1).
 * `sigma` the pool's gaussian radius on the floor, metres; `spill` the floor's lamp light between pools (light thrown back by the lining);
 * `max` the cap on overlapping pools; `gain` the emissive at a pool's centre as a share of the floor's albedo (linear); `tint` warm white;
 * `moon` the share of the night key and sky the floor keeps under the roof; `decal` the shed lamps' bounded pool decals' gain (0: the floor
 * draws the pool); `cell` the map's cell and `edge` the inside mask's ramp, metres.
 */
export const SHED_POOL = { sigma: 2.5, spill: 0.13, max: 1.2, gain: 0.85, tint: 0xffe6c4, moon: 0.2, decal: 0, cell: 0.5, edge: 1 } as const;

/**
 * By day, the floor's sky light (indirect) under the shed's vaults: full under the crown's axis, falling to `flank` of it at a vault's wall,
 * from `from` to `to` of the vault's radius off its axis. The sun's streaks (direct) are untouched. ASSUMED (R-a: the platforms under the crown
 * brighter than those beside the arcade walls). Round 1b: on the direct light as well (the sun's shade there is SHED_GLASS's fill), so a streak by a wall is a little dimmer too.
 */
// round 1b (the lead's day captures moved under 12 px): the floor's light in the shade under the roof is mostly the sun's, lifted by the crown's sky
// fill in the direct term (lighting.ts SHED_GLASS), not the hemisphere's, so the factor now takes the direct light as well as the indirect, and is a step deeper
export const SHED_CROWN_FLOOR = { flank: 0.78, from: 0.35, to: 1.0 } as const;

/** The pool light (before `max` and the inside mask) at the world point (x, z), from lamps at `heads` (flat x, y, z). */
export function shedPoolEnergy(heads: readonly number[], x: number, z: number): number {
  const k = 1 / (2 * SHED_POOL.sigma * SHED_POOL.sigma), reach2 = (4 * SHED_POOL.sigma) ** 2;
  let e = SHED_POOL.spill;
  for (let i = 0; i < heads.length; i += 3) {
    const dx = x - heads[i]!, dz = z - heads[i + 2]!, d2 = dx * dx + dz * dz;
    if (d2 < reach2) e += Math.exp(-d2 * k);
  }
  return Math.min(SHED_POOL.max, e);
}

/** 0 outside the shed's footprint to 1 a `SHED_POOL.edge` inside it. */
export function shedFloorInside(layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>, x: number, z: number): number {
  const { u, v } = worldToShed(layout, [x, z]);
  return smoothstep(0, SHED_POOL.edge, Math.min(u, layout.width - u, v, layout.length - v));
}

/** How far under a vault's crown the floor at (x, z) is: 1 on a vault's axis to 0 at its wall (SHED_CROWN_FLOOR), 1 outside the two vaults (the aisle keeps its light). */
export function shedCrownFloor(layout: Pick<ShedLayout, 'origin' | 'heading' | 'spine'>, x: number, z: number): number {
  const { u } = worldToShed(layout, [x, z]), r = SHED_SPAN_WIDTH / 2;
  if (u < layout.spine - 2 * r || u > layout.spine + 2 * r) return 1;
  const off = Math.min(Math.abs(u - (layout.spine - r)), Math.abs(u - (layout.spine + r))) / r;
  return 1 - smoothstep(SHED_CROWN_FLOOR.from, SHED_CROWN_FLOOR.to, off);
}

/** The floor's factors as the shader applies them, for a CPU check: `day` the floor light's factor by day (direct and indirect); `night` the base's factor and `pool` the emissive (times the albedo and the tint) after dark. */
export function shedFloorLight(layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length' | 'spine'>, heads: readonly number[], x: number, z: number): { day: number; night: number; pool: number } {
  const inside = shedFloorInside(layout, x, z);
  return {
    day: 1 + (SHED_CROWN_FLOOR.flank + (1 - SHED_CROWN_FLOOR.flank) * shedCrownFloor(layout, x, z) - 1) * inside,
    night: 1 - (1 - SHED_POOL.moon) * inside,
    pool: SHED_POOL.gain * shedPoolEnergy(heads, x, z) * inside,
  };
}

export interface ShedFloorMap { map: THREE.DataTexture; rect: THREE.Vector4 }

/** Bake the pools (r, over `max`), the inside mask (g) and the crown's share (b) over the shed's footprint, at `SHED_POOL.cell`. */
export function bakeShedFloor(layout: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length' | 'spine'>, heads: readonly number[]): ShedFloorMap {
  const c = Math.cos(layout.heading), s = Math.sin(layout.heading), cell = SHED_POOL.cell;
  const corners = [[0, 0], [layout.width, 0], [0, layout.length], [layout.width, layout.length]].map(([u, v]) => [layout.origin[0] + u! * c + v! * s, layout.origin[1] + u! * s - v! * c]);
  const x0 = Math.floor(Math.min(...corners.map((p) => p[0]!))) - 1, z0 = Math.floor(Math.min(...corners.map((p) => p[1]!))) - 1;
  const nx = Math.ceil((Math.max(...corners.map((p) => p[0]!)) + 1 - x0) / cell), nz = Math.ceil((Math.max(...corners.map((p) => p[1]!)) + 1 - z0) / cell);
  const bytes = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, n = (j * nx + i) * 4;
    const inside = shedFloorInside(layout, x, z);
    if (inside <= 0) { bytes[n + 2] = 255; continue; }
    bytes[n] = Math.round(255 * shedPoolEnergy(heads, x, z) / SHED_POOL.max);
    bytes[n + 1] = Math.round(255 * inside);
    bytes[n + 2] = Math.round(255 * shedCrownFloor(layout, x, z));
    bytes[n + 3] = 255;
  }
  const map = new THREE.DataTexture(bytes, nx, nz);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return { map, rect: new THREE.Vector4(x0, z0, 1 / (nx * cell), 1 / (nz * cell)) };
}

const f = (v: number): string => v.toFixed(4);

/** GLSL run after the lights: the floor's day and night light from the baked map (see the module's head). */
export function shedFloorGlsl(): string {
  const t = new THREE.Color(SHED_POOL.tint);
  return `
// kx-shed-floor-begin
{
  vec3 shedFloorW = cameraPosition - vViewPosition * mat3( viewMatrix );
  vec2 shedFloorUv = ( shedFloorW.xz - uShedFloorRect.xy ) * uShedFloorRect.zw;
  if ( shedFloorUv.x >= 0.0 && shedFloorUv.y >= 0.0 && shedFloorUv.x <= 1.0 && shedFloorUv.y <= 1.0 ) {
    vec4 shedFloorT = texture2D( uShedFloorMap, shedFloorUv );
    float shedFloorDayK = 1.0 + ( ${f(SHED_CROWN_FLOOR.flank)} + ${f(1 - SHED_CROWN_FLOOR.flank)} * shedFloorT.b - 1.0 ) * shedFloorT.g * uShedFloorDay;
    reflectedLight.directDiffuse *= shedFloorDayK;
    reflectedLight.indirectDiffuse *= shedFloorDayK;
    float shedFloorNight = shedFloorT.g * uShedFloorNight;
    reflectedLight.directDiffuse *= 1.0 - ${f(1 - SHED_POOL.moon)} * shedFloorNight;
    reflectedLight.indirectDiffuse *= 1.0 - ${f(1 - SHED_POOL.moon)} * shedFloorNight;
    totalEmissiveRadiance += vec3( ${f(t.r)}, ${f(t.g)}, ${f(t.b)} ) * ( ${f(SHED_POOL.gain * SHED_POOL.max)} * shedFloorT.r * shedFloorNight ) * diffuseColor.rgb;
  }
}
// kx-shed-floor-end`;
}

/** Give each of `materials` (the King's Cross platform tops and edge strips) the shed's floor light. Call before their first compile. */
export function lightShedFloor(materials: readonly THREE.Material[], floor: ShedFloorMap): void {
  for (const material of materials) {
    const before = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, { uShedFloorMap: { value: floor.map }, uShedFloorRect: { value: floor.rect }, uShedFloorNight: windowNight, uShedFloorDay: crownBelowUniforms.uCrownBelow });
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uShedFloorMap;\nuniform vec4 uShedFloorRect;\nuniform float uShedFloorNight;\nuniform float uShedFloorDay;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${shedFloorGlsl()}`);
    };
    material.customProgramCacheKey = () => `${key}+kx-shed-floor`;
  }
}
