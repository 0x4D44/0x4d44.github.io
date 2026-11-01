// INTERIORS (A3): the glint of a find (R4-206: a coin in a tin or a watch in a gift box is a few centimetres of colour seen from 1.6 m above, and read as nothing). A small additive star
// pulses over every treasure and every tiny find while its drawer or cupboard is open: a glint that the crosshair sees where the thing is, never a marker floating away from it.
//   * ONE texture (a canvas: a soft halo and four rays) and ONE material for all of them; a sprite per find, a child of the slot's contents group, so it opens, slides and hides with the things.
//   * It lies over the find (GLINT.LIFT above its top), depth-tested like everything else: a find behind the front of its drawer has its glint behind it too.
//   * Nothing without a DOM: node has no canvas, so no sprites there (contents.js `glints` is the pure part: which finds get one).
import * as THREE from 'three';

/** Metres: the star's full size, how far over the find's top it hangs; seconds: one twinkle. */
export const GLINT = { SIZE: 0.16, LIFT: 0.022, PERIOD: 1.6, FLOOR: 0.45 };

let TEX = null, MAT = null;
function texture() {
  if (TEX || typeof document === 'undefined') return TEX;
  const N = 96, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), m = N / 2;
  const halo = g.createRadialGradient(m, m, 0, m, m, m);
  halo.addColorStop(0, 'rgba(255,250,224,1)'); halo.addColorStop(0.14, 'rgba(255,236,170,.7)'); halo.addColorStop(0.4, 'rgba(255,210,110,.16)'); halo.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = halo; g.fillRect(0, 0, N, N);
  const ray = (len, wid, a) => {                                                              // a thin diamond along one axis, bright in the middle
    g.save(); g.translate(m, m); g.rotate(a);
    const lg = g.createLinearGradient(-len, 0, len, 0); lg.addColorStop(0, 'rgba(255,240,190,0)'); lg.addColorStop(0.5, 'rgba(255,252,236,.95)'); lg.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.closePath(); g.fill(); g.restore();
  };
  ray(m * 0.98, 2.6, 0); ray(m * 0.98, 2.6, Math.PI / 2); ray(m * 0.55, 1.8, Math.PI / 4); ray(m * 0.55, 1.8, -Math.PI / 4);
  TEX = new THREE.CanvasTexture(c); TEX.colorSpace = THREE.SRGBColorSpace; TEX.generateMipmaps = true;
  return TEX;
}
function material() {
  if (MAT) return MAT;
  const map = texture(); if (!map) return null;
  return (MAT = new THREE.SpriteMaterial({ map, color: 0xfff2c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
}

/**
 * The glints of the finds of one slot: `finds` = the slot's objects that glint, `at(o)` = where each one's glint hangs in `group`'s own frame. Returns [{ sprite, phase }] (empty without a DOM).
 * The sprites are added to `group`.
 */
export function makeGlints(finds, at, group) {
  const mat = material(), out = [];
  if (!mat) return out;
  finds.forEach((o, i) => {
    const s = new THREE.Sprite(mat), [x, y, z] = at(o);
    s.position.set(x, y, z); s.name = 'glint'; s.userData.glintOf = o.find ?? o.id; s.renderOrder = 4; s.scale.setScalar(GLINT.SIZE);
    group.add(s); out.push({ sprite: s, phase: ((i * 0.37) + (o.x * 7.3 + o.z * 3.1)) % 1 });
  });
  return out;
}

/** How big the star is `clock` seconds in: it twinkles, sharply, and never goes out (a floor of FLOOR of its size, so there is always a glint to see). */
export const twinkle = (clock, phase = 0) => {
  const k = Math.max(0, Math.sin(2 * Math.PI * (clock / GLINT.PERIOD + phase)));
  return GLINT.FLOOR + (1 - GLINT.FLOOR) * k * k;
};
/** One frame of the glints of a slot (the container system calls it while the slot is open). */
export function pulseGlints(list, clock) {
  for (const g of list) g.sprite.scale.setScalar(GLINT.SIZE * twinkle(clock, g.phase));
}
