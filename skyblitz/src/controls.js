// The semantic control state shared by input.js, ai.js and flight.js. Owner: lead (shape is part of the contract).
// pitch: +1 = pull back / nose UP, -1 = push / nose DOWN.   roll: +1 = bank RIGHT (right wing down).   yaw: +1 = nose RIGHT.
// barrel: edge-triggered request, -1 = barrel roll LEFT, +1 = RIGHT, 0 = none (consumed by flight.js the step it starts).
export function createControls() {
  return { pitch: 0, roll: 0, yaw: 0, boost: false, airbrake: 0, barrel: 0, fire: false, item: false, itemBack: false, lookBack: false };
}
export function resetControls(c) {
  c.pitch = 0; c.roll = 0; c.yaw = 0; c.boost = false; c.airbrake = 0; c.barrel = 0; c.fire = false; c.item = false; c.itemBack = false; c.lookBack = false;
  return c;
}
export function copyControls(dst, src) {
  dst.pitch = src.pitch; dst.roll = src.roll; dst.yaw = src.yaw; dst.boost = src.boost; dst.airbrake = src.airbrake; dst.barrel = src.barrel;
  dst.fire = src.fire; dst.item = src.item; dst.itemBack = src.itemBack; dst.lookBack = src.lookBack;
  return dst;
}
