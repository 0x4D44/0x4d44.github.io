/** An XYZ position in metres, in the station scene's x-east/y-up/z-south frame. */
export type StationPoint = readonly [x: number, y: number, z: number];

/** A camera position and the point it looks at. */
export interface StationView {
  readonly eye: StationPoint;
  readonly target: StationPoint;
}

/** The start-event seam used by OrbitControls. */
export interface StationControlsInput {
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

/** A DOM-style event source, such as a canvas or `window`. */
export interface StationInputSource {
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface StationFlightCancellationSources {
  readonly controls: StationControlsInput;
  readonly canvas: StationInputSource;
  /** Defaults to the browser window when available. */
  readonly keyboardTarget?: StationInputSource;
}

export interface StationFlightOptions {
  /** Skip animation and return the destination immediately. */
  readonly reducedMotion?: boolean;
  /** Camera height above the highest roof while crossing. Defaults to 12 m. */
  readonly roofClearance?: number;
  /** Extra height at the middle of the flight. Defaults to 32 m. */
  readonly arcHeight?: number;
}

const DEFAULT_ROOF_CLEARANCE = 12;
const DEFAULT_ARC_HEIGHT = 32;
const RISE_FRACTION = 0.18;
const DESCENT_FRACTION = 0.18;
const NAVIGATION_KEYS = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Escape',
  'PageDown', 'PageUp', 'Home', 'End', '+', '-', '=', '_',
  'a', 'd', 's', 'w', 'A', 'D', 'S', 'W',
]);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (value: number): number => value * value * (3 - 2 * value);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Sample a camera flight between station views. Progress is normalized and clamped to [0, 1].
 * The eye rises and descends vertically at either end when needed; its x/z travel stays above
 * the roof ceiling, then takes a high arc. The target eases directly between its endpoints.
 */
export function sampleStationFlight(
  from: StationView,
  to: StationView,
  progress: number,
  roofCeiling: number,
  options: StationFlightOptions = {},
): StationView {
  if (options.reducedMotion) return to;
  const t = clamp01(progress);
  if (t <= 0) return from;
  if (t >= 1) return to;

  const clearance = Math.max(0, options.roofClearance ?? DEFAULT_ROOF_CLEARANCE);
  const floor = roofCeiling + clearance;
  const arcHeight = Math.max(0, options.arcHeight ?? DEFAULT_ARC_HEIGHT);
  const startEye = from.eye;
  const endEye = to.eye;
  const lift = startEye[1] < floor ? RISE_FRACTION : 0;
  const descent = endEye[1] < floor ? DESCENT_FRACTION : 0;
  const travelStart = lift;
  const travelEnd = 1 - descent;

  let eye: StationPoint;
  if (lift > 0 && t < travelStart) {
    const u = smoothstep(t / travelStart);
    eye = [startEye[0], lerp(startEye[1], floor, u), startEye[2]];
  } else if (descent > 0 && t > travelEnd) {
    const u = smoothstep((t - travelEnd) / descent);
    eye = [endEye[0], lerp(floor, endEye[1], u), endEye[2]];
  } else {
    const u = smoothstep((t - travelStart) / (travelEnd - travelStart));
    const startY = Math.max(startEye[1], floor);
    const endY = Math.max(endEye[1], floor);
    const arc = arcHeight * Math.sin(Math.PI * u);
    eye = [
      lerp(startEye[0], endEye[0], u),
      Math.max(floor, lerp(startY, endY, u) + arc),
      lerp(startEye[2], endEye[2], u),
    ];
  }

  const targetT = smoothstep(t);
  return {
    eye,
    target: [
      lerp(from.target[0], to.target[0], targetT),
      lerp(from.target[1], to.target[1], targetT),
      lerp(from.target[2], to.target[2], targetT),
    ],
  };
}

function isEditableOrButtonTarget(target: EventTarget | null): boolean {
  const elementLike = target as (EventTarget & { closest?: (selector: string) => unknown }) | null;
  if (typeof elementLike?.closest !== 'function') return false;
  return elementLike.closest('button, input, textarea, select, [contenteditable], [role="button"], [role="textbox"]') !== null;
}

/**
 * Cancel an in-flight view change on OrbitControls input or direct canvas navigation.
 * Keyboard navigation is listened for on `window`; keys typed into controls are ignored.
 * Returns an idempotent disposer that removes every registered listener.
 */
export function bindStationFlightCancellation(
  sources: StationFlightCancellationSources,
  cancel: () => void,
): () => void {
  const keyboardTarget = sources.keyboardTarget ?? (typeof window === 'undefined' ? undefined : window);
  let listening = true;

  const dispose = (): void => {
    if (!listening) return;
    listening = false;
    sources.controls.removeEventListener('start', onControlsStart);
    sources.canvas.removeEventListener('pointerdown', onCanvasInput);
    sources.canvas.removeEventListener('touchstart', onCanvasInput);
    sources.canvas.removeEventListener('wheel', onCanvasInput);
    keyboardTarget?.removeEventListener('keydown', onKeyboardInput);
  };
  const cancelOnce = (): void => {
    if (!listening) return;
    cancel();
    dispose();
  };
  const onControlsStart = (): void => cancelOnce();
  const onCanvasInput: EventListener = (): void => cancelOnce();
  const onKeyboardInput: EventListener = (event): void => {
    const keyEvent = event as KeyboardEvent;
    if (!NAVIGATION_KEYS.has(keyEvent.key) || isEditableOrButtonTarget(keyEvent.target)) return;
    cancelOnce();
  };

  sources.controls.addEventListener('start', onControlsStart);
  sources.canvas.addEventListener('pointerdown', onCanvasInput);
  sources.canvas.addEventListener('touchstart', onCanvasInput, { passive: true });
  sources.canvas.addEventListener('wheel', onCanvasInput, { passive: true });
  keyboardTarget?.addEventListener('keydown', onKeyboardInput);

  return dispose;
}
