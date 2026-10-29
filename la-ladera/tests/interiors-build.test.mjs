// INTERIORS meshes under Node (no browser): every furniture record draws a sane stand-in; a building's interior stays inside its rooms,
// uses only library materials and a bounded number of draw calls. Does NOT judge looks: shot.mjs screenshots do (labs/a3).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-build.test.mjs
//   A3_SABOTAGE=<standin|material> makes the matching test fail (proof the test can fail).   A3_PLANS=real  uses A2's real plans.   A3_LIST=60 shows more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { MeshBuilder } from '../js/core/mesh.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { decalDef } from '../js/interiors/decals.js';
import { drawStandin, STANDINS } from '../js/interiors/standins.js';
import { buildInterior } from '../js/interiors/build.js';
import { ALL_DEFS } from '../js/core/matlib.js';

const N = +(process.env.A3_N || 42);
const SAB = process.env.A3_SABOTAGE;
if (SAB === 'standin') { const bed = STANDINS.bed; STANDINS.bed = (P, c, T, r) => { bed(P, c, T, r); P.box('wood_pine', 0, 0, 0, 4, 0.3, 4); }; }     // a 4 m slab under every bed
if (SAB === 'material') { const sofa = STANDINS.sofa; STANDINS.sofa = (P, c, T, r) => { sofa(P, c, T, r); P.box('no_such_material', 0, 0, 0, 0.2, 0.2, 0.2); }; }
const { ctx, bps } = await furnishedBatch({ n: N });
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const defOf = (rec) => (rec.decal ? decalDef(rec.decal) : CATALOG[rec.name]);

test('every catalogue archetype has a stand-in drawer', () => {
  const miss = [...new Set(Object.values(CATALOG).filter((c) => !STANDINS[c.arch]).map((c) => `${c.name} (${c.arch})`))];
  report(miss, 'catalogue items without a stand-in');
});

test('a stand-in stays inside its footprint box and below its catalogue height', () => {
  const seen = new Map(), problems = [];
  for (const bp of bps) for (const rec of bp.furniture) {
    const c = defOf(rec); if (!c) { problems.push(`${bp.id}: unknown catalogue key ${rec.name}`); continue; }
    const key = rec.name + (rec.kind === 'wall' ? `@${rec.w?.toFixed(2)}x${rec.h?.toFixed(2)}` : '');
    if (seen.has(key)) continue; seen.set(key, true);
    const wall = rec.kind === 'wall', W = wall && rec.w ? rec.w : c.size[0], H = Math.max(wall && rec.h ? rec.h : c.size[1], c.head ?? 0), D = c.size[2];
    const b = new MeshBuilder();
    const n = drawStandin(b, { ...rec, x: 0, z: 0, ry: 0, y: rec.kind === 'ceil' ? c.size[1] : 0 }, c);
    if (!n) { problems.push(`${rec.name}: drew nothing`); continue; }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const a of b.accs.values()) for (let i = 0; i < a.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = a.pos[i + k]; if (!Number.isFinite(v)) { lo[k] = NaN; break; } if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    const tx = 0.1, tz = 0.12, ty = 0.2;                                       // handles, leaves, awnings and goods may overhang a little
    const bad = [];
    if (!(lo[0] >= -W / 2 - tx && hi[0] <= W / 2 + tx)) bad.push(`x ${lo[0].toFixed(2)}..${hi[0].toFixed(2)} vs +-${(W / 2).toFixed(2)}`);
    if (!(lo[2] >= -D / 2 - tz && hi[2] <= D / 2 + tz)) bad.push(`z ${lo[2].toFixed(2)}..${hi[2].toFixed(2)} vs +-${(D / 2).toFixed(2)}`);
    if (!(lo[1] >= -0.02 && hi[1] <= H + ty)) bad.push(`y ${lo[1].toFixed(2)}..${hi[1].toFixed(2)} vs 0..${H.toFixed(2)}`);
    if (bad.length) problems.push(`${rec.name} [${c.arch}]: ${bad.join('; ')}`);
    if (b.tris > 2500) problems.push(`${rec.name}: ${b.tris} triangles (limit 2500)`);
  }
  report(problems, 'stand-ins outside their footprint / over budget');
});

test('interior meshes: library materials only, finite, inside the rooms, bounded draw calls', () => {
  const stub = new Map();
  ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
  const problems = [], stats = [];
  for (const bp of bps) {
    buildInterior(ctx, bp);
    const g = ctx.batch.groups.get(`${bp.id}.int`);
    if (!g || !g.meshes.length) { problems.push(`${bp.id}: no interior meshes`); continue; }
    const rooms = bp.rooms, x0 = Math.min(...rooms.map((r) => r.rect.x0)) - 0.6, x1 = Math.max(...rooms.map((r) => r.rect.x1)) + 0.6;
    const z0 = Math.min(...rooms.map((r) => r.rect.z0)) - 0.6, z1 = Math.max(...rooms.map((r) => r.rect.z1)) + 0.6;
    const y0 = Math.min(...rooms.map((r) => r.y ?? 0)) - 0.05, y1 = Math.max(...rooms.map((r) => (r.y ?? 0) + (r.h ?? 2.7))) + 0.2;
    let tris = 0, bad = 0;
    for (const m of g.meshes) {
      const key = m.userData.matKey, base = key.split('#')[0];
      if (!ALL_DEFS[base]) problems.push(`${bp.id}: unknown material '${key}'`);
      const p = m.geometry.attributes.position.array;
      tris += m.geometry.index.count / 3;
      for (let i = 0; i < p.length; i += 3) {
        const [lx, ly, lz] = bp.frame.toLocal(p[i], p[i + 1], p[i + 2]);
        if (!(Number.isFinite(lx + ly + lz)) || lx < x0 || lx > x1 || lz < z0 || lz > z1 || ly < y0 || ly > y1) { if (bad++ < 1) problems.push(`${bp.id}: ${key} vertex (${lx.toFixed(2)}, ${ly.toFixed(2)}, ${lz.toFixed(2)}) outside the building rooms`); }
      }
    }
    stats.push({ id: bp.id, meshes: g.meshes.length, tris, recs: bp.furniture.length, glb: bp.interior?.stats?.glb ?? 0, prims: bp.interior?.stats?.prims ?? 0 });
    if (g.meshes.length > 34) problems.push(`${bp.id}: ${g.meshes.length} materials (limit 34)`);
    if (tris > 90000) problems.push(`${bp.id}: ${tris} triangles in one interior (limit 90000)`);
    if (bp.interior?.stats?.failed) problems.push(`${bp.id}: ${bp.interior.stats.failed} records failed to draw`);
  }
  const s = (f) => stats.map(f).sort((a, b) => a - b);
  const med = (a) => a[a.length >> 1];
  const m = s((x) => x.meshes), t = s((x) => x.tris), r = s((x) => x.recs);
  console.log(`# interiors: ${stats.length} buildings, ${r.reduce((a, b) => a + b, 0)} records; meshes/building median ${med(m)} max ${m.at(-1)}; triangles median ${med(t)} max ${t.at(-1)}; stand-in primitives ${stats.reduce((a, x) => a + x.prims, 0)}`);
  report(problems, 'interior mesh problems');
  report((ctx.errors ?? []).filter((e) => e.stage === 'interiors').map((e) => `${e.name}: ${e.message}`), 'interior build errors');
});
