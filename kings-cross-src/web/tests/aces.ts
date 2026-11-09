// three's ACES filmic tone map in plain numbers (the fitted RRT and ODT curve between the sRGB input and output matrices, as in three's
// tonemapping_pars_fragment, with the exposure divided by 0.6), so a test can say what the page draws for a given light on a given surface.
import * as THREE from 'three';

export type V3 = readonly [number, number, number];

// GLSL builds a mat3 by columns; these are the rows of the matrix it makes
const INPUT: readonly V3[] = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]];
const OUTPUT: readonly V3[] = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];

const mul = (m: readonly V3[], v: V3): V3 => [0, 1, 2].map((r) => (m[r] as V3)[0] * v[0] + (m[r] as V3)[1] * v[1] + (m[r] as V3)[2] * v[2]) as unknown as V3;
const fit = (v: number): number => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);

/** The linear colour (0..1 per channel) the page draws for linear radiance `rgb` at `exposure`. */
export function acesFilmic(rgb: V3, exposure: number): V3 {
  const scaled: V3 = [rgb[0] * (exposure / 0.6), rgb[1] * (exposure / 0.6), rgb[2] * (exposure / 0.6)];
  const [r, g, b] = mul(OUTPUT, mul(INPUT, scaled).map(fit) as unknown as V3);
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}

/** A linear colour as the sRGB triple (0..1) the screen shows. */
export function toSrgb(rgb: V3): V3 {
  const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace).getRGB(new THREE.Color(), THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}
