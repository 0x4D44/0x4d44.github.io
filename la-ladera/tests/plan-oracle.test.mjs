// Teeth for the lead's plan oracle: a synthetic CLEAN plan must pass, and each mutation must trip exactly the check it targets.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/plan-oracle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan } from './plan-oracle.mjs';
import { LOT_KINDS, SHOP_TYPES } from '../js/core/vocab.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const terrain = (x, z) => 0.15 * (100 - z);
// A 0.6-gradient stair bump on x~0, z in [-45,-35], tapered sideways so it is continuous.
const stairBump = (x, z) => 0.45 * clamp(1 - (Math.abs(x) - 1), 0, 1) * (-35 - clamp(z, -45, -35));

function goodPlan() {
  const colX = Array.from({ length: 11 }, (_, c) => -85 + c * 16.5), rowZ = [-70, -28, 14, 56];
  const lots = [];
  for (let i = 0; i < 44; i++) {
    const x = colX[i % 11], z = rowZ[Math.floor(i / 11)];
    lots.push({
      id: 'L' + String(i).padStart(2, '0'), kind: LOT_KINDS[i % LOT_KINDS.length], x, z, y: terrain(x, z + 6.2) + 0.25, rotY: 0, w: 10, d: 10, floors: 1 + (i % 4), fh: 2.8,
      front: 'S1', entrance: { side: 'front', u: 0 }, party: { left: false, right: false, back: false }, seed: i,
      ...(i % 3 === 0 ? { shop: SHOP_TYPES[(i / 3) % SHOP_TYPES.length] } : {}),
    });
  }
  const plan = {
    seed: 1, bounds: { min: -100, max: 100 }, lots,
    streets: [
      { id: 'R1', name: 'Avenida', kind: 'road', width: 6, pts: [[-95, 68], [95, 68]], surface: 'asphalt' },
      { id: 'S1', name: 'Calle', kind: 'street', width: 4, pts: [[-90, -20], [90, -20]], surface: 'concrete' },
      { id: 'A1', name: 'Callejon', kind: 'alley', width: 2.5, pts: [[-60, -60], [-60, -30]], surface: 'cobble' },
      { id: 'ST1', name: 'Escalera', kind: 'stair', width: 2, pts: [[0, -45], [0, -35]], surface: 'stairs' },
    ],
    plazas: [0, 1, 2].map((k) => ({ id: 'P' + k, name: 'Plaza ' + k, poly: [[k * 40 - 60, 86], [k * 40 - 44, 86], [k * 40 - 44, 98], [k * 40 - 60, 98]], y: terrain(0, 92), kind: ['plaza', 'court', 'mirador'][k] })),
    pois: Array.from({ length: 45 }, (_, k) => ({ id: 'PO' + k, kind: 'bench', x: -90 + k * 4, y: 0, z: 30, ry: 0 })),
    landmarks: Array.from({ length: 9 }, (_, k) => ({ id: 'M' + k, name: 'Capilla ' + k, en: 'Chapel ' + k, x: k * 10, z: 20, kind: 'chapel' })),
    areas: Array.from({ length: 5 }, (_, k) => ({ id: 'AR' + k, name: 'Zona ' + k, poly: [[0, 0], [1, 0], [1, 1]] })),
    spawn: { x: 0, z: 85, yaw: 0.1 },
  };
  plan.heightAt = (x, z) => {
    for (const l of plan.lots) if (Math.abs(x - l.x) <= l.w / 2 + 0.3 && Math.abs(z - l.z) <= l.d / 2 + 0.3) return l.y - 0.30;
    return terrain(x, z) + stairBump(x, z);
  };
  // Nav: one N-S line per lot column plus two E-W lines, nodes every 4 m, shared at the crossings.
  const nodes = new Map(), edges = [];
  const node = (x, z) => { const k = `${x},${z}`; if (!nodes.has(k)) nodes.set(k, { id: 'N' + nodes.size, x, y: plan.heightAt(x, z), z, kind: 'street' }); return nodes.get(k).id; };
  const zs = Array.from({ length: 49 }, (_, k) => -96 + k * 4);
  for (const x of colX) zs.reduce((prev, z) => { const id = node(x, z); if (prev) edges.push([prev, id]); return id; }, null);
  const xs = [...new Set([...colX, ...Array.from({ length: 49 }, (_, k) => -96 + k * 4)])].sort((a, b) => a - b);
  for (const z of [-20, 68]) xs.reduce((prev, x) => { const id = node(x, z); if (prev) edges.push([prev, id]); return id; }, null);
  plan.nav = { nodes: [...nodes.values()], edges };
  return plan;
}

const codes = (plan) => new Set(checkPlan(plan).violations.map((v) => v.code));

test('the clean synthetic plan passes every check', () => {
  const r = checkPlan(goodPlan());
  assert.deepEqual(r.violations, [], JSON.stringify(r.violations));
  assert.equal(r.stats.lots, 44);
  assert.ok(r.stats.shopTypes >= 10 && r.stats.navComponents === 1);
});

const MUTATIONS = [
  ['no plan at all', (p) => { for (const k of Object.keys(p)) delete p[k]; }, 'shape'],
  ['a lot lands on its neighbour', (p) => { p.lots[1].x = p.lots[0].x + 2; }, 'lots.overlap'],
  ['two lots 0.1 m apart with no party wall', (p) => { p.lots[1].x = p.lots[0].x + 10.1; p.lots[1].z = p.lots[0].z; }, 'lots.gap'],
  ['every lot is a house', (p) => { for (const l of p.lots) l.kind = 'house'; }, 'lots.kinds'],
  ['a lot hangs off the map', (p) => { p.lots[10].x = 98; }, 'lots.bounds'],
  ['too few lots', (p) => { p.lots.length = 30; }, 'lots.count'],
  ['no shops', (p) => { for (const l of p.lots) delete l.shop; }, 'shops.count'],
  ['only three shop types', (p) => { p.lots.filter((l) => l.shop).forEach((l, i) => { l.shop = SHOP_TYPES[i % 3]; }); }, 'shops.types'],
  ['unknown shop type', (p) => { p.lots.find((l) => l.shop).shop = 'ultramarinos'; }, 'shops.type'],
  ['entrance off the wall', (p) => { p.lots[0].entrance.u = 5; }, 'lots.entrance'],
  ['a road at 15 %', (p) => { p.streets[0].pts = [[0, 60], [0, -10]]; }, 'streets.gradient'],
  ['a street at 19.5 %', (p) => { const h0 = p.heightAt; p.heightAt = (x, z) => h0(x, z) * 1.3; p.streets[1].pts = [[0, 60], [0, -10]]; }, 'streets.gradient'],
  ['a house standing in the road', (p) => { p.lots[40].z = 68; }, 'lots.onstreet'],
  ['a house standing in the alley', (p) => { p.lots[1].x = -60; p.lots[1].z = -45; }, 'lots.onstreet'],
  ['a house standing in a plaza', (p) => { p.lots[0].x = -52; p.lots[0].z = 92; }, 'lots.onplaza'],
  ['a door facing a street that does not exist', (p) => { p.lots[2].front = 'S99'; }, 'lots.front'],
  ['a wall-eyed 6 m storey', (p) => { p.lots[2].fh = 6; }, 'lots.fh'],
  ['a flat stairway', (p) => { p.streets[3].pts = [[-10, -30], [10, -30]]; }, 'streets.stair'],
  ['a stairway that is a 30 % ramp', (p) => { const h0 = p.heightAt; p.heightAt = (x, z) => h0(x, z) * 0.5; }, 'streets.stair'],
  ['a stairway at 78 %', (p) => { const h0 = p.heightAt; p.heightAt = (x, z) => h0(x, z) * 1.3; }, 'streets.stair'],
  ['no alleys', (p) => { p.streets = p.streets.filter((s) => s.kind !== 'alley'); }, 'streets.alley'],
  ['a nav island', (p) => { const keep = new Set(p.nav.nodes.filter((n) => n.x > -80).map((n) => n.id)); p.nav.edges = p.nav.edges.filter(([a, b]) => keep.has(a) === keep.has(b)); }, 'nav.connected'],
  ['a nav edge that climbs a wall', (p) => { p.nav.nodes[100].y += 6; }, 'nav.edge'],
  ['a nav node floating in the air', (p) => { p.nav.nodes[100].y += 6; }, 'nav.ground'],
  ['a door with no nav node near', (p) => {
    const [ox, oz] = [p.lots[3].x, p.lots[3].z + 6.2], gone = new Set(p.nav.nodes.filter((n) => Math.hypot(n.x - ox, n.z - oz) < 3.2).map((n) => n.id));
    p.nav.nodes = p.nav.nodes.filter((n) => !gone.has(n.id)); p.nav.edges = p.nav.edges.filter(([a, b]) => !gone.has(a) && !gone.has(b));
  }, 'nav.coverage'],
  ['nav too sparse', (p) => { p.nav.nodes.length = 60; p.nav.edges.length = 0; }, 'nav.density'],
  ['the spawn looks downhill', (p) => { p.spawn.yaw = Math.PI; }, 'spawn.look'],
  ['the spawn is at the top of the hill', (p) => { p.spawn.z = -90; }, 'spawn.place'],
  ['lots sit on the raw terrain (no plinth)', (p) => { p.heightAt = (x, z) => terrain(x, z); }, 'lots.plinth'],
  ['the door is 2 m above the street', (p) => { p.lots[5].y += 2; }, 'lots.doorground'],
  ['a flat world', (p) => { p.heightAt = () => 0; }, 'terrain.relief'],
  ['a world of cliffs', (p) => { const h0 = p.heightAt; p.heightAt = (x, z) => h0(x, z) + (Math.floor(x * 4 + z * 4) % 2 ? 1.2 : 0); }, 'terrain.cliffs'],
  ['two plazas only', (p) => { p.plazas.length = 2; }, 'plazas.count'],
  ['a landmark with no English line', (p) => { delete p.landmarks[0].en; }, 'landmarks.fields'],
  ['a poi with no facing', (p) => { delete p.pois[3].ry; }, 'pois.fields'],
];

for (const [name, mutate, code] of MUTATIONS) {
  test(`${name} -> ${code}`, () => {
    const p = goodPlan(); mutate(p);
    const got = codes(p);
    assert.ok(got.has(code), `expected ${code}, got ${[...got].join(', ') || 'nothing'}`);
  });
}

test('a stairway of flights and landings passes; a chapel may front a plaza and be 4.2 m high', () => {
  const p = goodPlan(), h0 = p.heightAt;
  // flights of 3 m at 62 % (0.15 terrain + 0.47) with 2 m landings at 15 %
  const prof = (x, z) => 0.47 * clamp(1 - (Math.abs(x) - 1), 0, 1) * (() => { const s = -35 - clamp(z, -45, -35); return 3 * Math.floor(s / 5) + Math.min(s % 5, 3); })();
  p.heightAt = (x, z) => h0(x, z) - stairBump(x, z) + prof(x, z);
  p.lots[2].front = 'P0'; p.lots[2].fh = 4.2;
  const got = codes(p);
  for (const c of ['streets.stair', 'lots.front', 'lots.fh']) assert.ok(!got.has(c), `${c} should not fire: ${JSON.stringify(checkPlan(p).violations.filter((v) => v.code === c))}`);
});

test('a party wall excuses a 0.1 m gap but not an interpenetration', () => {
  const p = goodPlan(); p.lots[1].x = p.lots[0].x + 10.1; p.lots[1].z = p.lots[0].z; p.lots[1].party.left = true;
  assert.ok(!codes(p).has('lots.gap'));
  p.lots[1].x = p.lots[0].x + 8; // 2 m of overlap
  assert.ok(codes(p).has('lots.overlap'));
});
