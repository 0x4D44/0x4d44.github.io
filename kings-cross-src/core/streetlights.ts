// Street lamps: where they stand along the city's roads. Pure data (tested without a renderer): core/city.ts `buildCity` calls `lampSpots` with the runs of road it has drawn, and
// web/src/streetlights.ts draws the spots (a post to each, a glow at its head and a pool of light on the ground). Round seven (night lighting).
//
// What is read from the night photographs (gfx-rubrics/refs/night/, Commons; SOURCES.md there has each photograph's licence and its lighting note):
//   night-b-euston-road-sodium-2019-oatsy40.jpg: the Euston Road's lamps are columns about 9 to 10 m tall with an arm, the head a white-hot core in an orange halo (the head's pixels are
//     (253, 253, 243), the halo's median (223, 180, 98)); the road under them is a soft orange, (145, 109, 73) near a lamp; a lamp every 35 to 40 m along each side.
//   night-b-euston-road-2025-brown.jpg and night-a-kx-front-2025-eden.jpg: the newer lamps are warm white (LED), the forecourt's masts cool white.
//   night-e-kx-elevated-2016-itsnogame.jpg and night-e-kx-elevated-euston-road-2019-oatsy40.jpg: from above the road is a continuous warm ribbon, the lamps dots in it.
// Not in any photograph, so ASSUMED: the spacings and heights per class of road below (UK practice: BS 5489 spacing is about four times the mounting height on a main road), which
// lamps are sodium and which white (the photographs show both on the Euston Road, so a repeatable share of the streets are each), and the kerb offset.
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';
import { shedLayout, shedToWorld } from './station.ts';
import type { Height, RoadClass } from './city.ts';

/** What colour a lamp's light is: the sodium lamps' orange, a warm-white LED, a cool-white LED (the forecourt's masts and the new King's Cross Central's streets). */
export const LAMP_KIND = { sodium: 0, warm: 1, cool: 2 } as const;
export type LampKind = (typeof LAMP_KIND)[keyof typeof LAMP_KIND];

export interface LampSpot {
  /** the foot of the post, on the pavement */
  x: number;
  y: number;
  z: number;
  /** the way its arm points (turn about y; the arm lies along x at zero): across the road */
  yaw: number;
  /** the post's height, metres */
  height: number;
  kind: LampKind;
  /** how the ground rises under it: metres of height per metre east and per metre south (its pool of light lies in this plane) */
  slope: [number, number];
  /** a mast (a column with a strip of white LEDs near its top, no arm) and not a street lamp */
  mast?: true;
}

export interface LampRule {
  /** metres between one lamp and the next along the road, the sides taking turns; `sides` 'one' puts every lamp on one side */
  spacing: number;
  height: number;
  sides: 'alternate' | 'one';
}

/** ASSUMED: which roads are lit, how tall their posts are and how far apart (a main road's lamps about four times their height apart, each side). */
export const LAMP_RULES: Readonly<Partial<Record<RoadClass, LampRule>>> = {
  trunk: { spacing: 18, height: 10, sides: 'alternate' },
  primary: { spacing: 18, height: 9, sides: 'alternate' },
  secondary: { spacing: 18, height: 8, sides: 'alternate' },
  tertiary: { spacing: 24, height: 7, sides: 'alternate' },
  minor: { spacing: 28, height: 6, sides: 'alternate' },
  service: { spacing: 40, height: 5, sides: 'one' },
  pedestrian: { spacing: 28, height: 5, sides: 'alternate' },
};

/** The post stands this far outside the kerb, metres (ASSUMED). */
export const LAMP_KERB = 0.6;
/** No lamp this close to the end of a run of road (a junction, or where the road stops being drawn), metres. */
export const LAMP_END_MARGIN = 9;
/** A run shorter than this has no lamp, metres. */
export const LAMP_MIN_RUN = 20;
/** The half-length of the steps the ground's slope under a lamp is read over, metres. */
const SLOPE_STEP = 2;

/** One run of road the city drew (a street cut where it crosses the railway or leaves the drawn ground), and what the lamps on it stand on. */
export interface LampRun {
  /** the road's own number (its repeatable luck) */
  id: number;
  cls: RoadClass;
  /** half the carriageway, metres */
  half: number;
  /** the centre line */
  line: readonly Pt[];
  /** the walking surface beside the carriageway: a height, or a function of (x, z, metres along the run, metres across from its centre line) */
  y: Height;
}

export interface LampContext {
  /** a repeatable number in [0, 1) from two integers */
  rand(n: number, salt: number): number;
  /** is this point in the new King's Cross Central, whose streets are lit white? */
  modern(p: Pt): boolean;
  /** can no lamp stand here (inside a building, on another road's carriageway, on the station)? `road` is the lamp's own road, which does not count */
  blocked(p: Pt, road: number): boolean;
}

/**
 * What light a road's lamp gives at `at`: a repeatable share of the old streets are sodium (the road's own luck, the same all along it) and the rest white (ASSUMED), the new quarter's lamps
 * are white wherever a road runs into it (a long street changes at the quarter's edge), its walkways cool.
 */
export function lampKind(run: Pick<LampRun, 'id' | 'cls'>, ctx: Pick<LampContext, 'rand' | 'modern'>, at: Pt): LampKind {
  if (ctx.modern(at)) return run.cls === 'pedestrian' || run.cls === 'service' ? LAMP_KIND.cool : LAMP_KIND.warm;
  if (run.cls === 'pedestrian') return LAMP_KIND.warm;
  const sodium = run.cls === 'trunk' || run.cls === 'primary' || run.cls === 'secondary' ? 0.8 : 0.55;
  return ctx.rand(run.id, 1) < sodium ? LAMP_KIND.sodium : LAMP_KIND.warm;
}

/**
 * The lamps along some runs of road: every `spacing` metres (a tenth either way, repeatably), the sides taking turns, a post `LAMP_KERB` outside the kerb with its arm over
 * the road, none near a run's ends or where `blocked` says it cannot stand.
 */
export function lampSpots(runs: readonly LampRun[], ctx: LampContext): LampSpot[] {
  const out: LampSpot[] = [];
  for (const run of runs) {
    const rule = LAMP_RULES[run.cls];
    const line = run.line;
    if (!rule || line.length < 2) continue;
    // metres along at each vertex
    const along: number[] = [0];
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1] as Pt, line[i] as Pt];
      along.push((along[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = along[along.length - 1] as number;
    if (total < LAMP_MIN_RUN) continue;
    const off = run.half + LAMP_KERB;
    const lonely = rule.sides === 'one' ? (ctx.rand(run.id, 2) < 0.5 ? 1 : -1) : 0;
    let seg = 1;
    let n = 0;
    for (let d = LAMP_END_MARGIN + rule.spacing * 0.5 * ctx.rand(run.id, 3); d <= total - LAMP_END_MARGIN; d += rule.spacing * (0.9 + 0.2 * ctx.rand(run.id, 10 + n)), n++) {
      while (seg < line.length - 1 && (along[seg] as number) < d) seg++;
      const [a, b] = [line[seg - 1] as Pt, line[seg] as Pt];
      const length = (along[seg] as number) - (along[seg - 1] as number) || 1;
      const t = (d - (along[seg - 1] as number)) / length;
      // the unit normal on the line's right, as offsetLine takes it (x, z) -> (z, -x), and which side this lamp takes
      const normal: Pt = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
      const side = lonely || (n % 2 === 0 ? 1 : -1);
      const at: Pt = [a[0] + (b[0] - a[0]) * t + normal[0] * side * off, a[1] + (b[1] - a[1]) * t + normal[1] * side * off];
      if (ctx.blocked(at, run.id)) continue;
      const height = run.y;
      const y = typeof height === 'function' ? height(at[0], at[1], d, side * off) : height;
      // the surface's slope there, from two short steps along the road and two across it: a gradient (metres per metre) in x and z
      const tangent: Pt = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const [alongRise, acrossRise] = typeof height === 'function'
        ? [(height(at[0] + tangent[0] * SLOPE_STEP, at[1] + tangent[1] * SLOPE_STEP, d + SLOPE_STEP, side * off) - height(at[0] - tangent[0] * SLOPE_STEP, at[1] - tangent[1] * SLOPE_STEP, d - SLOPE_STEP, side * off)) / (2 * SLOPE_STEP),
          (height(at[0] + normal[0] * SLOPE_STEP, at[1] + normal[1] * SLOPE_STEP, d, side * off + SLOPE_STEP) - height(at[0] - normal[0] * SLOPE_STEP, at[1] - normal[1] * SLOPE_STEP, d, side * off - SLOPE_STEP)) / (2 * SLOPE_STEP)]
        : [0, 0];
      const slope: [number, number] = [alongRise * tangent[0] + acrossRise * normal[0], alongRise * tangent[1] + acrossRise * normal[1]];
      out.push({ x: at[0], y, z: at[1], yaw: Math.atan2(normal[1] * side, -normal[0] * side), height: rule.height, kind: lampKind(run, ctx, at), slope });
    }
  }
  return out;
}

/** How far a lamp's pool of light reaches on the ground, in posts' heights: to where the light, which falls off as the cube of the cosine from the lamp's foot, is a eleventh of what it is under the lamp. */
export const POOL_REACH = 2;
/** How far a lamp's pool of light reaches on the ground, metres. */
export const poolRadius = (height: number): number => height * POOL_REACH;

/** How tall the forecourt's masts are, metres (night-a-kx-square-2015-skinner.jpg: the masts stand about as tall as the front's wall, 12 to 14 m). */
export const MAST_HEIGHT = 12;

/**
 * Where the masts stand, in the shed's frame (u along the front from its west end, v out from it, negative in front): a loose row 28 to 30 m in front of the station front, about 20 m apart, the
 * clock tower between two of them (night-a-kx-square-2015-skinner.jpg: tall steel masts with a strip of white LEDs near the top stand across the square, a few tens of metres in front of the
 * front; night-e-kx-elevated-2016-itsnogame.jpg shows them as white dots in the square). ASSUMED: the places, placed by eye (no photograph gives them), clear of the buildings and of the
 * street lamps (checked against the city's data).
 */
export const FORECOURT_MASTS: readonly (readonly [number, number])[] = [[-30, -28], [-10, -28], [10, -28], [30, -30], [50, -28], [68, -28]];

/** A mast stands on the square this far above the ground: the plaza's own lift (core/city.ts LAYER_LIFT, 5 cm) and the page's drape of 10 cm (PAGE_DRAPE). */
export const MAST_LIFT = 0.15;

/**
 * The forecourt's masts, a lamp each (`mast`), on the ground `heightAt` gives (metres at x, z). None where there is no station to stand in front of (a data set without platform 8 and the
 * station building, which `shedLayout` needs).
 */
export function forecourtMasts(data: Pick<KxData, 'platforms' | 'buildings'>, heightAt: (x: number, z: number) => number): LampSpot[] {
  let layout: ReturnType<typeof shedLayout>;
  try {
    layout = shedLayout(data);
  } catch {
    return [];
  }
  return FORECOURT_MASTS.map(([u, v]) => {
    const [x, z] = shedToWorld(layout, u, v);
    const gx = (heightAt(x + SLOPE_STEP, z) - heightAt(x - SLOPE_STEP, z)) / (2 * SLOPE_STEP);
    const gz = (heightAt(x, z + SLOPE_STEP) - heightAt(x, z - SLOPE_STEP)) / (2 * SLOPE_STEP);
    return { x, y: heightAt(x, z) + MAST_LIFT, z, yaw: 0, height: MAST_HEIGHT, kind: LAMP_KIND.cool, slope: [gx, gz], mast: true };
  });
}
