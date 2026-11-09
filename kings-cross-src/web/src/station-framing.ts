import type { KxData } from '../../core/osm.ts';
import { shedLayout, stationBuilding, stationPlatforms } from '../../core/station.ts';
import type { StationView } from './station-transition.ts';

type V3 = readonly [x: number, y: number, z: number];

interface Bounds3 {
  readonly min: V3;
  readonly max: V3;
}

// Product framing limits: keep the built station in the central region clear of the mobile nav/footer.
const PORTRAIT_ASPECT_CUTOFF = 0.9;
const SAFE_HALF_WIDTH_NDC = 0.85;
const SAFE_HALF_HEIGHT_NDC = 0.5;
const VERTICAL_FOV_DEGREES = 50;
// ASSUMED framing margin protects the fitted corners from rounding and small projection differences.
const FIT_MARGIN = 1.02;
// ASSUMED camera offset from the station centre, expressed in shed-local u, world-up, v components.
const CAMERA_LOCAL_U = 0.35;
const CAMERA_WORLD_UP = 0.9;
const CAMERA_LOCAL_V = -1;
const WORLD_UP: V3 = [0, 1, 0];

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function cross(a: V3, b: V3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function unit(v: V3): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function stationBounds(data: KxData): { bounds: Bounds3; heading: number } {
  const station = stationBuilding(data);
  const platforms = [...stationPlatforms(data).values()];
  if (!station || station.pts.length === 0 || platforms.length === 0) {
    throw new Error('King’s Cross station building and surface platforms are needed for portrait framing');
  }

  const points = [...station.pts, ...platforms.flatMap((platform) => platform.pts)];
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const shed = shedLayout(data);
  const roofHeight = Math.max(shed.crown, station.height ?? 0);

  return {
    bounds: { min: [minX, 0, minZ], max: [maxX, roofHeight, maxZ] },
    heading: shed.heading,
  };
}

function corners(bounds: Bounds3): V3[] {
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  return [
    [x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [x0, y1, z1],
    [x1, y0, z0], [x1, y0, z1], [x1, y1, z0], [x1, y1, z1],
  ];
}

function center(bounds: Bounds3): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/**
 * Return the legacy King's Cross view on landscape displays and a roof-aware OSM fit on portrait.
 * Only the station polygon, surface platforms, and shed crown define the portrait bounds.
 */
export function kingsCrossView(data: KxData, desktop: StationView, aspect: number): StationView {
  // This branch deliberately precedes all data reads: callers with a legacy desktop view need no KX geometry.
  if (aspect >= PORTRAIT_ASPECT_CUTOFF) return desktop;

  const { bounds, heading } = stationBounds(data);
  const target = center(bounds);
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  // Shed local u points east; v points north. The camera stands south-southeast and above the shed.
  const direction = unit([
    CAMERA_LOCAL_U * cosine + CAMERA_LOCAL_V * sine,
    CAMERA_WORLD_UP,
    CAMERA_LOCAL_U * sine - CAMERA_LOCAL_V * cosine,
  ]);
  const right = unit(cross(WORLD_UP, direction));
  const up = unit(cross(direction, right));
  const tangent = Math.tan((VERTICAL_FOV_DEGREES * Math.PI) / 360);

  let distance = 1;
  for (const point of corners(bounds)) {
    const relative: V3 = [point[0] - target[0], point[1] - target[1], point[2] - target[2]];
    const alongView = dot(relative, direction);
    const neededForWidth = Math.abs(dot(relative, right)) / (SAFE_HALF_WIDTH_NDC * tangent * aspect);
    const neededForHeight = Math.abs(dot(relative, up)) / (SAFE_HALF_HEIGHT_NDC * tangent);
    distance = Math.max(distance, alongView + neededForWidth, alongView + neededForHeight);
  }
  distance *= FIT_MARGIN;

  return {
    eye: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    target,
  };
}
