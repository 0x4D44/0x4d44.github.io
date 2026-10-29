// Outdoor discoveries: things a walker finds by being near them. Spanish names (journal + toast), one English line, each bound to
// something that really exists in the world (a built feature, a landmark of the plan, or a tree zone). Registered through ctx.discover.
import { OCC } from './occupancy.js';

const KINDS = ['vista', 'mirador', 'shrine', 'object', 'story', 'nature', 'mural', 'hidden'];

const wallDist = (w, x, z) => {                                       // from a point to a collider's surface
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
  return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) - (w.t ?? 0) / 2;
};

/**
 * The nearest spot to (x, z) a walker can really stand on: 0.5 m clear of every prop / guard collider, outside the lots, off steep ground.
 * What we mark is often the very object (a signpost, the scarecrow, a stake), whose own collider covers its centre.
 */
export function settle(K, x, z) {
  const walls = (K.ctx.physics?.walls ?? []).filter((w) => (w.id === 'prop' || w.id === 'guard') && wallDist(w, x, z) < 6);
  const ok = (px, pz) => K.occ.clear(px, pz, 0.5, OCC.LOT | OCC.STEEP) && !walls.some((w) => wallDist(w, px, pz) < 0.5);
  if (ok(x, z)) return [x, z];
  for (let r = 0.4; r <= 3.0; r += 0.2) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (ok(px, pz)) return [px, pz]; }
  return [x, z];
}

export function buildDiscoveries(K) {
  const { ctx, plan } = K, W = ctx.world, H = plan.heightAt, out = [];
  const lm = (id) => plan.landmarks.find((l) => l.id === id);
  const add = (id, name, en, kind, x, z, o = {}) => {
    if (x == null || z == null || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (!KINDS.includes(kind)) throw new Error('unknown discovery kind ' + kind);
    const d = { id: 'w.' + id, name, en, kind, x: +x.toFixed(2), y: +(o.y ?? H(x, z)).toFixed(2), z: +z.toFixed(2), radius: o.radius ?? 3.5, ...(o.dy ? { dy: o.dy } : {}) };
    ctx.discover.register(d); out.push(d);
  };

  if (W.cross) add('cruz', 'La Cruz de la Cumbre', 'The summit cross, lit all night: the whole barrio steers by it.', 'vista', W.cross.x, W.cross.z, { radius: 9, dy: 8, y: W.cross.y });
  const mir = lm('mirador'); if (mir) add('mirador', 'El Mirador del Cielo', 'A balustrade over every roof of the barrio, and the valley behind.', 'mirador', mir.x, mir.z + 2.4, { radius: 5 });
  if (W.telescope) add('telescopio', 'El telescopio de monedas', 'A coin telescope bolted to the viewpoint rail; the coin slot has been jammed for years.', 'object', W.telescope.x, W.telescope.z, { radius: 2.4 });
  if (W.payphone) add('telefono', 'El teléfono público', 'A payphone that still sells minutes, with a line of numbers scratched into the hood.', 'object', W.payphone.x, W.payphone.z, { radius: 2.4 });
  if (W.shrine) add('virgen', 'La Virgen del Carmen', 'A neighbours\' shrine: candles, plastic flowers and a blue niche, kept by hand for decades.', 'shrine', W.shrine.front[0], W.shrine.front[1], { radius: 3.2 });
  const esc = lm('escalinata'); if (esc) add('escalinata', 'La Escalinata de la Virgen', 'The long stairway that joins the lower streets to the little square.', 'vista', esc.x, esc.z, { radius: 5, dy: 5 });
  if (W.court) add('cancha', 'La Cancha El Cerro', 'The futsal court: every afternoon begins with arguments over the teams.', 'story', W.court.x, W.court.z, { radius: 9 });
  if (W.busShelter) add('parada', 'La parada del bus', 'The shelter where the buseta waits until it is full, and not one minute before.', 'object', W.busShelter.x + 1.4, W.busShelter.z, { radius: 4 });
  const far = lm('faroles'); if (far) add('faroles', 'El Callejón de los Faroles', 'Iron lanterns along the alley that turn orange as dusk comes down.', 'vista', far.x, far.z, { radius: 5 });
  if (W.pila) add('pila', 'La pila del barrio', 'The old public wash-basin, from before every house had its own tap.', 'object', W.pila.x, W.pila.z + 0.8, { radius: 2.6 });
  const alm = lm('almendros'); if (alm) add('almendros', 'Los Almendros', 'The almond trees that gave the little square its name; the kids still throw their shells at each other.', 'nature', alm.x, alm.z, { radius: 7 });
  const cap = lm('capillaplaza'); if (cap) add('capilla', 'La Plazoleta de la Capilla', 'The quiet square in front of the chapel, where Sunday mass spills out onto the paving.', 'story', cap.x, cap.z, { radius: 7 });
  add('eucaliptos', 'Los eucaliptos del filo', 'Planted along the ridge decades ago to hold the hill; at dusk they sway and the whole slope hisses.', 'nature', -25, -88, { radius: 14, dy: 10 });
  // the tangle of wires over the pole nearest the spawn
  const sp = plan.spawn, pole = (W.poleList ?? []).slice().sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z))[0];
  if (pole) add('cables', 'El enredo de cables', 'Power, telephone and cable-TV lines tangled over every pole; nobody remembers who hung which.', 'object', pole.x, pole.z, { radius: 5 });
  // the cart at the fruit-stand POI
  const fp = plan.pois.find((p) => p.kind === 'vend' && (p.tags ?? []).some((t) => /fruit/.test(t)));
  if (fp) add('carrito', 'El carrito de fruta', 'A hand-painted price board, a pile of mangos and a scale older than its owner.', 'object', fp.x, fp.z, { radius: 3 });
  // everything the other modules found a place for (signs.js murals / arch / plaques / hopscotch, hill.js, life.js): { id, name, en, kind, x, z, y, radius, dy }
  for (const m of W.murals ?? []) add(m.id, m.name, m.en, m.kind ?? 'mural', m.x, m.z, { radius: m.radius ?? 5, y: m.y, dy: m.dy });
  for (const m of W.extra ?? []) {                                    // beside the thing itself, never inside its collider; y follows the ground
    const [x, z] = Number.isFinite(m.x) && Number.isFinite(m.z) ? settle(K, m.x, m.z) : [m.x, m.z];
    add(m.id, m.name, m.en, m.kind ?? 'mural', x, z, { radius: m.radius ?? 5, y: m.y == null ? undefined : m.y + (H(x, z) - H(m.x, m.z)), dy: m.dy });
  }
  W.discoveries = out.map((d) => d.id);
  return out;
}
