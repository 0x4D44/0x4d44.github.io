// Two-frame flicker check for a fixed evidence camera (gfx-rubrics/rubric-common.md, hard gate 4).
// Two screenshots of the same camera with the scene still are compared pixel by pixel. A still scene
// must render the same pixels twice; a transparent surface whose draw order flips between frames, an
// animated material or a late-loading chunk makes them differ. Z-fighting that is stable for a fixed
// camera does NOT show here: it shows as striping in the capture itself, which the scorer looks for.
// Pure and Node-only, so the metric is unit-testable.
import { readPng } from './axis01-pixels.mjs';

/**
 * A pixel counts as different when any of its R, G, B channels moves by more than this many 8-bit levels.
 * The captures are lossless PNG, so identical renders differ by exactly 0; 8 levels (about 3%) sits far
 * above any dither or rounding noise and far below a z-fight stripe (tens of levels).
 */
export const FLICKER_PIXEL_THRESHOLD = 8;

/**
 * A fixed camera fails when more than this fraction of its pixels differ: 0.0005, which is 512 pixels
 * of a 1280 x 800 frame (a 22 x 22 patch). A flickering region is at least that big; a still scene
 * measures 0 (see the wave 0 baseline, where every fixed camera measured 0 differing pixels).
 */
export const FLICKER_FRACTION_LIMIT = 0.0005;

/** Real time between the two screenshots, so a time-driven effect has a chance to move. */
export const FLICKER_GAP_MS = 150;

/**
 * Compare two PNG screenshots (Buffers) of the same camera.
 * @returns {{width:number,height:number,threshold:number,limit:number,differingPixels:number,fraction:number,maxDelta:number,bbox:number[]|null,pass:boolean}}
 *   `bbox` is [left, top, right, bottom] of the differing pixels, or null when none differ.
 */
export function compareFrames(first, second, { threshold = FLICKER_PIXEL_THRESHOLD, limit = FLICKER_FRACTION_LIMIT } = {}) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new RangeError('flicker threshold must be an integer from 0 to 255');
  if (!(limit >= 0 && limit <= 1)) throw new RangeError('flicker limit must be a fraction from 0 to 1');
  const a = readPng(first), b = readPng(second);
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) throw new Error(`flicker frames differ in format: ${a.width}x${a.height}x${a.channels} versus ${b.width}x${b.height}x${b.channels}`);
  const { width, height, channels } = a;
  let differing = 0, maxDelta = 0, left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      let delta = 0;
      for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(a.pixels[i + c] - b.pixels[i + c]));
      if (delta > maxDelta) maxDelta = delta;
      if (delta <= threshold) continue;
      differing++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const fraction = differing / (width * height);
  return { width, height, threshold, limit, differingPixels: differing, fraction, maxDelta, bbox: differing ? [left, top, right, bottom] : null, pass: fraction <= limit };
}

/** Roll the per-shot results up for the manifest: the shots that failed, the worst fraction and the definition used. */
export function flickerSummary(records) {
  const checked = records.filter(r => r.flicker);
  const failed = checked.filter(r => !r.flicker.pass);
  return {
    threshold: FLICKER_PIXEL_THRESHOLD, limit: FLICKER_FRACTION_LIMIT, checked: checked.length,
    failed: failed.map(r => ({ camera: r.file, axis: r.axis, differingPixels: r.flicker.differingPixels, fraction: r.flicker.fraction, bbox: r.flicker.bbox })),
    worstFraction: checked.reduce((worst, r) => Math.max(worst, r.flicker.fraction), 0), pass: failed.length === 0,
    definition: `Two screenshots of each fixed camera with the scene still, ${FLICKER_GAP_MS} ms and two rendered frames apart; a pixel differs when any RGB channel moves by more than ${FLICKER_PIXEL_THRESHOLD}/255; a camera fails above ${FLICKER_FRACTION_LIMIT * 100}% differing pixels.`,
  };
}
