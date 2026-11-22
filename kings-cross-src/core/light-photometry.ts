import type { LightPoint, Optic, Spectrum } from './light-sources.ts';

function linearChromaticity(x: number, y: number): LightPoint {
  // CIE xyY (Y=1) to D65 linear sRGB. Clip out-of-gamut primaries and normalize
  // to a unit peak. Illuminance is evaluated separately from chromaticity.
  const X = x / y, Z = (1 - x - y) / y;
  const r = Math.max(0, 3.2406 * X - 1.5372 - .4986 * Z);
  const g = Math.max(0, -.9689 * X + 1.8758 + .0415 * Z);
  const b = Math.max(0, .0557 * X - .2040 + 1.0570 * Z);
  const peak = Math.max(r, g, b);
  return [r / peak, g / peak, b / peak];
}

type LegacyStyle = { halo: number; pool: number; referenceLux: number };
type SpectrumEntry = { linearRgb: LightPoint; legacy?: LegacyStyle };
// Approximate CIE 1931 chromaticities. LPS uses the 589 nm sodium line,
// HPS a 2000 K proxy, and the broad-band sources use their nominal CCT.
// Legacy display tints include artistic saturation and the receiver's colour.
export const SPECTRA = {
  lps: { linearRgb: linearChromaticity(.569, .430), legacy: { halo: 0xff993c, pool: 0xff9136, referenceLux: 4.11 } },
  hps: { linearRgb: linearChromaticity(.527, .413), legacy: { halo: 0xffa84a, pool: 0xffbc74, referenceLux: 4.11 } },
  'led-2700': { linearRgb: linearChromaticity(.459, .411) },
  'led-3000': { linearRgb: linearChromaticity(.437, .404), legacy: { halo: 0xffd8a0, pool: 0xffd9a8, referenceLux: 3.48 } },
  'led-4000': { linearRgb: linearChromaticity(.381, .377), legacy: { halo: 0xcfe4ff, pool: 0xe6ecf5, referenceLux: 1.58 } },
  'led-5000': { linearRgb: linearChromaticity(.345, .352) },
  tungsten: { linearRgb: linearChromaticity(.448, .408) },
} satisfies Record<Spectrum, SpectrumEntry>;

type DirectOptic = Exclude<Optic, { kind: 'panel' }>;
const radians = Math.PI / 180;

function coneLimits(optic: DirectOptic): readonly [number, number] {
  const outer = optic.kind === 'downlight' ? optic.halfAngleDeg : optic.cutoffDeg;
  const soft = optic.kind === 'downlight' ? optic.softDeg : 10;
  return [Math.cos(Math.max(0, outer - soft) * radians), Math.cos(outer * radians)];
}

/** Integral of a unit cone with a smoothstep edge in cosine space. */
export function opticSolidAngle(optic: DirectOptic): number {
  const [inner, outer] = coneLimits(optic);
  return Math.PI * (2 - inner - outer);
}

/** Candela in the provisional photometric cone. Road/strip footprint and
 * cover clipping are receiver bounds rather than flux multipliers. */
export function opticIntensity(lumens: number, optic: DirectOptic, cosAngle: number): number {
  const [inner, outer] = coneLimits(optic);
  const t = Math.max(0, Math.min(1, (cosAngle - outer) / (inner - outer)));
  return lumens / opticSolidAngle(optic) * t * t * (3 - 2 * t);
}

export const EUSTON_REFERENCE = {
  lumens: 16000,
  optic: { kind: 'road', throwM: 40, spreadM: 18, cutoffDeg: 75 } as const,
  albedo: .078,
  distanceM: Math.hypot(4, 10.15),
  incidence: 10.15 / Math.hypot(4, 10.15),
  // Relative weight of the accepted P1 optic at 4 m into the road from
  // a 10 m fixture. The reference is its linear luma after asphalt albedo,
  // before exposure and ACES, evaluated on CPU from P1's fitted shader.
  angularWeight: 1 / (1 + 1.5 * (4 / 10.15 - .38) ** 2),
  linearRadiance: .0744696192600504,
};
const r = EUSTON_REFERENCE;
const referenceLux = r.lumens / opticSolidAngle(r.optic) * r.angularWeight * r.incidence / r.distanceM ** 2;
export const SCENE_LINEAR_PER_CD_M2 = r.linearRadiance / (r.albedo * referenceLux / Math.PI);

export function sceneRadiance(illuminanceLux: number, albedo: number): number {
  return SCENE_LINEAR_PER_CD_M2 * albedo * illuminanceLux / Math.PI;
}

/** Effective unit-albedo readings for the old display-linear pool opacity,
 * quantized to the legacy renderer's hundredths. The palette is baked art. */
export function legacyLampLight(spectrum: 'lps' | 'hps' | 'led-3000' | 'led-4000') {
  const { halo, pool, referenceLux } = SPECTRA[spectrum].legacy;
  return { halo, pool, strength: Math.round(100 * sceneRadiance(referenceLux, 1)) / 100 };
}
