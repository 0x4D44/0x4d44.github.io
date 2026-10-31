// Driver's seat, eye and steering-wheel layout, derived once from a car's cabin geometry. Pure (no THREE). Both the interior builder
// and the camera rig read it, so the cockpit eye is where the driver's head is: inside the cabin, in front of the seat back,
// behind the wheel, and (in every car) with the windscreen filling the forward view.
import { cabinRing } from "./body.mjs";

export const WHEEL_EYE_GAP = 0.6; // eye to wheel centre, metres (arms bent, as in a rally car)

export function cockpitLayout(d) {
  const cab = d.cabin;
  const zD = d.zAt(cab.t0) + 0.06; // dash front (windscreen base)
  // seat: move forward until the head rest sits under the (sloping) roof
  let ZS = d.seatZ;
  const hrRoom = (zs) => cabinRing(d, d.tAt(zs + 0.47)).yTop - 0.06 - (d.sill + 1.04);
  for (let k = 0; k < 8 && hrRoom(ZS) < 0; k++) ZS -= 0.02;
  const hrDrop = Math.max(0, -hrRoom(ZS));
  const headZ = ZS + 0.2; // centre of the helmet
  const wallX = (t, y) => { const { ring } = cabinRing(d, t); for (let k = 0; k < ring.length / 2; k++) { const a = ring[k], b = ring[k + 1]; if (a[1] <= y && b[1] >= y && b[1] > a[1]) return a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1])); } return ring[0][0]; };
  let seatW = 0.36;
  while (seatW > 0.22 && seatW + 0.25 > wallX(d.tAt(ZS + 0.47), d.sill + 0.96 - hrDrop + 0.08) - 0.03) seatW -= 0.01;
  const eyeY = Math.min(d.sill + 1.0, d.roof - 0.2);
  const eye = { x: seatW, y: eyeY, z: headZ - 0.02 };
  const wheel = { x: seatW, y: Math.max(eyeY - 0.3, d.topC(cab.t0) - 0.05 + 0.06), z: eye.z - WHEEL_EYE_GAP }; // never below the dash pad top: low cars would hide the wheel behind the cowl
  // dash depth: the pad runs from the windscreen base back to just in front of the wheel (short cabins get a shallow dash)
  const dashDepth = Math.max(0.18, Math.min(0.535, wheel.z - 0.1 - zD));
  return { zD, ZS, hrDrop, seatW, headZ, eye, wheel, dashDepth };
}

/**
 * The cabin volume in rig coordinates, for weather culling in the cockpit view: a box (half width, sill..roof, windscreen to rear
 * glass) whose front face is the sloping windscreen plane. Rain or snow inside it (behind the glass) would draw over the headliner.
 */
export function cabinVolume(d) {
  const cab = d.cabin;
  return { hw: d.hw * cab.w * 0.92 + 0.05, ymin: d.sill, ymax: d.roof + 0.03, zRear: d.zAt(cab.t1), zb: d.zAt(cab.t0), yb: d.topC(cab.t0), zh: d.zAt(cab.rs), yh: d.roof };
}
/** Is the rig-space point (x, y, z) inside the cabin volume? (forward is -z, the screen leans back with height) */
export function insideCabin(v, x, y, z) {
  if (Math.abs(x) >= v.hw || y <= v.ymin || y >= v.ymax) return false;
  const t = Math.min(1, Math.max(0, (y - v.yb) / (v.yh - v.yb)));
  return z > v.zb + (v.zh - v.zb) * t && z < v.zRear;
}
