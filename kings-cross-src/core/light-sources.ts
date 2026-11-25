// Static emitters in each station's local metric frame. No renderer objects.
export type LightStation = 'kx' | 'wv' | 'pt';
export type Spectrum = 'lps' | 'hps' | 'led-2700' | 'led-3000' | 'led-4000' | 'led-5000' | 'tungsten';
export type LightPoint = readonly [number, number, number];
export type Optic =
  | { readonly kind: 'road'; readonly throwM: number; readonly spreadM: number; readonly cutoffDeg: number }
  | { readonly kind: 'downlight'; readonly halfAngleDeg: number; readonly softDeg: number; readonly radiusM: number }
  | { readonly kind: 'strip'; readonly lengthM: number; readonly widthM: number; readonly cutoffDeg: number; readonly throwM: number; readonly spreadM: number }
  | { readonly kind: 'panel'; readonly normal: LightPoint; readonly w: number; readonly h: number; readonly linearRgb: LightPoint; readonly paneId?: number };
export interface LightSource {
  readonly id: string;
  readonly station: LightStation;
  readonly pos: LightPoint;
  readonly footY: number;
  /** Rotation about +Y from +X, the lamp arm's direction. */
  readonly yaw: number;
  readonly spectrum: Spectrum;
  /** Zero for reflection panels, which supply linear RGB in the optic. */
  readonly lumens: number;
  readonly optic: Optic;
  readonly cover: 'open' | 'under-roof';
  readonly tags: readonly string[];
  /** Receiver keeps dot(normal, worldPosition) >= offset. */
  readonly halfSpace?: { readonly normal: LightPoint; readonly offset: number };
  /** A single extended emitter may be represented by several sprites. */
  readonly drawnHeads?: readonly LightPoint[];
  readonly fog?: number;
}

const byScene = new WeakMap<object, Map<string, LightSource>>();

export function registerLights(scene: object, sources: readonly LightSource[]): () => void {
  const records = byScene.get(scene) ?? new Map<string, LightSource>();
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id) || records.has(source.id)) throw new Error(`Duplicate light source ${source.id}`);
    ids.add(source.id);
  }
  for (const source of sources) records.set(source.id, source);
  byScene.set(scene, records);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const source of sources) {
      if (records.get(source.id) === source) records.delete(source.id);
    }
  };
}

export function lightSourcesFor(scene: object): readonly LightSource[] {
  return Array.from(byScene.get(scene)?.values() ?? []);
}
