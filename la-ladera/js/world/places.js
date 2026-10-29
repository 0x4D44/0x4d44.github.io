// POIs, landmarks, named areas and the spawn point of the plan (pure data). Spanish names; English line in `en`.
import { project, pointAt, pointInPoly, footprint, polyDistPoint, clamp } from './geom.js';

const rs = (v) => +v.toFixed(2);

export function buildPlaces(plan, rng) {
  const { lots, streets, plazas, heightAt: H } = plan;
  const R = rng.fork('world:pois');
  const pois = [];
  let seq = 0;
  const fps = lots.map((l) => footprint(l, 0.4));
  const free = (x, z) => !fps.some((f) => pointInPoly(f, x, z));
  const add = (kind, x, z, ry, extra = {}) => {
    if (!free(x, z)) return null;
    const p = { id: 'poi' + seq++, kind, x: rs(x), y: rs(H(x, z)), z: rs(z), ry: rs(ry), tags: [], ...extra };
    pois.push(p); return p;
  };
  const at = (lot, lx, lz) => { const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY); return [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c]; };

  // ---- per lot: doorstep, shop front, lean spot
  lots.forEach((lot, i) => {
    const u = lot.entrance.u, hd = lot.d / 2;
    const [sx, sz] = at(lot, u, hd + 0.9);
    add('sweep', sx, sz, lot.rotY, { building: lot.id, tags: ['doorstep'] });
    if (lot.shop) {
      const side = u > 0 ? -1 : 1, off = Math.min(lot.w / 2 - 0.9, 1.6) * side;
      const [vx, vz] = at(lot, u + off, hd + 1.0);
      add('vend', vx, vz, lot.rotY + Math.PI, { building: lot.id, tags: ['shop:' + lot.shop, 'stand:' + lot.shop] });
    }
    if (lot.w >= 5) {
      const side = u > 0 ? -1 : 1, [lx, lz] = at(lot, u + side * Math.max(1.8, lot.w / 2 - 0.9), hd + 0.5);
      add('lean', lx, lz, lot.rotY + Math.PI, { building: lot.id, tags: ['wall'] });
    }
    if (i % 3 === 1) {
      const [cx, cz] = at(lot, u + (R.chance(0.5) ? 1 : -1) * 1.2, hd + 1.5);
      add('chat', cx, cz, lot.rotY + R.range(-0.5, 0.5), { building: lot.id, tags: ['neighbours'] });
    }
  });

  // ---- plazas, court, mirador
  for (const pl of plazas) {
    const cx = pl.cx, cz = pl.cz, hw = pl.w / 2, hd = pl.d / 2, c = Math.cos(pl.ry), s = Math.sin(pl.ry);
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    if (pl.kind === 'court') {
      for (const [lx, lz] of [[-6, -3], [-3, 3], [0, 0], [3, -3], [6, 3], [9, 0], [-9, 0]]) { const [x, z] = P(lx, lz); add('play', x, z, R.range(0, 6.28), { tags: ['football'] }); }
      for (const [lx, lz] of [[-5, hd + 1.8], [5, hd + 1.8], [0, -hd - 1.8]]) { const [x, z] = P(lx, lz); add('bench', x, z, lz > 0 ? Math.PI : 0, { tags: ['court-side'] }); }
      for (const lx of [-8, 8]) { const [x, z] = P(lx, -hd - 1.2); add('lean', x, z, 0, { tags: ['fence'] }); }
    } else if (pl.kind === 'mirador') {
      for (const lx of [-6, -1, 5]) { const [x, z] = P(lx, hd - 1.4); add('stand', x, z, Math.PI, { tags: ['viewpoint'] }); }
      const [bx, bz] = P(-hw + 2, 0); add('bench', bx, bz, Math.PI, { tags: ['viewpoint'] });
      const [px, pz] = P(hw - 3, 0); add('phone', px, pz, Math.PI, {});
    } else {
      const nb = pl.w > 12 ? 4 : 2;
      for (let k = 0; k < nb; k++) {
        const lx = (k - (nb - 1) / 2) * (pl.w / nb) * 0.9, side = k % 2 ? 1 : -1, [x, z] = P(lx, side * (hd - 1.0));
        add('bench', x, z, side > 0 ? Math.PI : 0, { tags: ['plaza'] });
      }
      const [x1, z1] = P(-hw * 0.4, 0); add('chat', x1, z1, 0.6, { tags: ['plaza', 'neighbours'] });
      const [x2, z2] = P(hw * 0.4, 0.5); add('chat', x2, z2, 3.6, { tags: ['plaza', 'neighbours'] });
      if (pl.id === 'P2') { const [x3, z3] = P(hw - 2, -hd + 1.5); add('vend', x3, z3, Math.PI, { tags: ['stand:fruit', 'cart'] }); }
    }
  }

  // ---- stair tops and bottoms: greet spots
  for (const st of streets.filter((s) => s.kind === 'stair')) {
    const n = st._d.pts.length, top = st._d.y[n - 1] >= st._d.y[0];
    const a = st._d.pts[top ? n - 2 : 1], b = st._d.pts[top ? n - 1 : 0], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    add('greet', b[0] + (dx / l) * 0.5, b[1] + (dz / l) * 0.5, Math.atan2(-dx, -dz), { tags: ['stairtop', st.id] });
  }
  // ---- bus stop on the entry road
  add('bench', 43.2, 95.5, Math.PI / 2, { tags: ['busstop'] });
  add('stand', 43.2, 93.6, Math.PI / 2, { tags: ['busstop'] });
  add('stand', 43.4, 97.2, Math.PI / 2, { tags: ['busstop'] });
  plan.pois = pois;

  // ---- landmarks
  const lotBy = (k) => lots.find(k);
  const lm = [];
  const L = (id, name, en, x, z, kind) => lm.push({ id, name, en, x: rs(x), z: rs(z), kind });
  const pl = (id) => plazas.find((p) => p.id === id);
  L('mirador', 'Mirador del Cielo', 'Sky Viewpoint', pl('P5').cx, pl('P5').cz, 'viewpoint');
  L('virgen', 'Plazoleta de la Virgen', 'Little Square of the Virgin', pl('P1').cx, pl('P1').cz, 'shrine');
  L('almendros', 'Plazoleta de los Almendros', 'Almond Tree Square', pl('P2').cx, pl('P2').cz, 'plaza');
  L('cancha', 'Cancha El Cerro', 'El Cerro Court', pl('P3').cx, pl('P3').cz, 'court');
  L('capillaplaza', 'Plazoleta de la Capilla', 'Chapel Square', pl('P4').cx, pl('P4').cz, 'plaza');
  const s4 = streets.find((s) => s.id === 'S4'), m4 = pointAt(s4._d.pts, s4._d.cum, s4.len * 0.25);
  L('escalinata', 'Escalinata de la Virgen', 'Stairway of the Virgin', m4.x, m4.z, 'stairs');
  const s1 = streets.find((s) => s.id === 'S1');
  L('calledelsol', 'Calle del Sol', 'Sun Street', 46, 93, 'street');
  L('comercio', 'Calle del Comercio', 'Commerce Street', 10, 88, 'street');
  L('paseo', 'Paseo de la Virgen', 'Virgin Promenade', -6.5, 76, 'street');
  L('faroles', 'Callejón de los Faroles', 'Lantern Alley', -10, -1, 'street');
  for (const [id, kind, name, en] of [['chapel', 'chapel', 'Capilla de la Virgen del Carmen', 'Chapel of Our Lady of Carmen'], ['school', 'school', 'Escuela El Cerro', 'El Cerro School'],
    ['clinic', 'clinic', 'Puesto de Salud El Cerro', 'El Cerro Health Post'], ['hall', 'hall', 'Salón Comunal Los Almendros', 'Community Hall']]) {
    const l = lots.find((q) => q.kind === kind); if (l) L(id, l.name || name, en, l.x, l.z, kind);
  }
  const tl = lots.find((q) => q.shop === 'taller'); if (tl) L('taller', tl.name, 'Motorbike Workshop', tl.x, tl.z, 'shop');
  const pn = lots.find((q) => q.shop === 'panaderia'); if (pn) L('panaderia', pn.name, 'Bakery', pn.x, pn.z, 'shop');
  L('busstop', 'Parada del Bus', 'Bus Stop', 43.2, 95.5, 'busstop');
  plan.landmarks = lm;

  // ---- areas (ambience zones and map labels)
  const poly = (...p) => p;
  plan.areas = [
    { id: 'plan', name: 'El Plan', en: 'The Flat', poly: poly([-100, 66], [100, 66], [100, 100], [-100, 100]) },
    { id: 'almendros', name: 'Los Almendros', en: 'The Almond Trees', poly: poly([-30, 22], [60, 18], [60, 66], [-30, 56]) },
    { id: 'faroles', name: 'El Farol', en: 'The Lamp', poly: poly([-60, -22], [40, -16], [40, 14], [-60, 30]) },
    { id: 'cruz', name: 'La Cruz', en: 'The Cross', poly: poly([-60, -62], [50, -66], [50, -24], [-60, -30]) },
    { id: 'cumbre', name: 'La Cumbre', en: 'The Summit', poly: poly([-30, -72], [50, -74], [50, -62], [-30, -60]) },
    { id: 'ridge', name: 'El Mirador', en: 'The Viewpoint', poly: poly([-100, -100], [100, -100], [100, -74], [-100, -74]) },
    { id: 'west', name: 'Cerro Alto', en: 'High Hill', poly: poly([-100, -74], [-62, -74], [-62, 66], [-100, 66]) },
    { id: 'east', name: 'La Quebrada', en: 'The Ravine', poly: poly([62, -74], [100, -74], [100, 66], [62, 66]) },
  ];

  // ---- spawn: bottom of the hill, on the axis of the Paseo, looking up at the barrio (yaw 0 = north)
  plan.spawn = { x: -6.5, z: 92.5, yaw: 0 };
}
