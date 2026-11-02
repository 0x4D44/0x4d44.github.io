// INTERIORS (A3): the close-inspection library (assets/models/inspect, Codex's 24 handheld models) wired into the drawers: which find, paper and ordinary thing each model stands for
// (js/interiors/inspect-bindings.json -> inspect_data.js), where it lies, what it takes of the shelf, that it is the container's own target (reader, discovery) as before, and what is
// drawn when its file is missing or broken. tests/interiors-inspect.test.mjs (Codex's) proves the files themselves.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-inspect-wiring.test.mjs        A3_N=24 buildings
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { createContext } from '../js/core/ctx.js';
import { ALL_DEFS } from '../js/core/matlib.js';
import { FINDS } from '../js/interiors/finds.js';
import { PAPERS } from '../js/interiors/papers.js';
import { ITEMS } from '../js/interiors/props.js';
import { Pen } from '../js/interiors/standins.js';
import { drawContent, makeContents, householdOf } from '../js/interiors/contents.js';
import { resolveFind } from '../js/interiors/content.js';
import { buildInterior } from '../js/interiors/build.js';
import { loadInteriorAssets as pageLoad } from '../js/interiors/index.js';
import { INSPECT, INSPECT_KEYS, BINDINGS, POSES, SCALES, MARGIN, COIN, modelFor, loadInspectAssets, inspectParts } from '../js/interiors/inspect.js';
import { inspectDataModule } from '../tools/inspect_data.mjs';
import { validateLibrary } from '../tools/blender/inspect_validate.mjs';
import { furnishedBatch } from './interiors-lib.mjs';
import { readAssetJson } from './headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const N = +(process.env.A3_N || 24);
const matStub = (key) => ({ name: key, isMaterial: true, userData: {}, dispose() {} });
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b} (±${eps})`);
const idsOf = { FINDS: FINDS.map((f) => f.id), PAPERS: PAPERS.map((p) => p.id), ITEMS: ITEMS.map((i) => i.id) };

/** A context whose asset loader parses the checked-in GLBs with the vendored GLTFLoader (as the page does); `fail(path)` makes a file fail to download. */
async function loaded(ctx, { fail = () => false, tamper = null } = {}) {
  const parser = new GLTFLoader();
  ctx.assets.loader.loadAsync = async (path) => {
    if (fail(path)) throw new Error('test: ' + path + ' is not there');
    const bytes = await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url));
    const g = await parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    tamper?.(g, path);
    g.scene.updateMatrixWorld(true);
    return g;
  };
  await loadInspectAssets(ctx);
  return ctx;
}
async function newCtx() { const ctx = createContext({ headless: true }); await ctx.assets.init(readAssetJson); return ctx; }
/** What a piece-local box looks like after drawContent: the drawn vertices of the builder back in the piece's frame. */
function drawn(P, rec, parts) {
  const mb = P.b, cs = Math.cos(rec.ry), sn = Math.sin(rec.ry), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], keys = new Set();
  for (const [key, a] of mb.accs) {
    if (!a.idx.length) continue;
    keys.add(key);
    for (let i = 0; i < a.pos.length; i += 3) {
      const dx = a.pos[i] - rec.x, dz = a.pos[i + 2] - rec.z, p = [dx * cs - dz * sn, a.pos[i + 1] - rec.y, dx * sn + dz * cs];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
  }
  return { lo, hi, keys, tris: mb.tris };
}
const penFor = (ctx, parts = true) => {
  const rec = { id: 'r1', x: 1.3, y: 0.2, z: -0.7, ry: 0.7, kind: 'floor' }, P = new Pen(new MeshBuilder(), rec, { size: [1, 1, 1] });
  if (parts) P.parts = (key) => inspectParts(ctx, key);
  return { P, rec };
};
const firstId = (key) => Object.keys(BINDINGS).find((id) => BINDINGS[id] === key);

test('the committed data module is what the generator makes of the manifest and the bindings (the drift guard)', () => {
  const have = readFileSync(join(ROOT, 'js', 'interiors', 'inspect_data.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(have, inspectDataModule(ROOT), 'js/interiors/inspect_data.js is out of date: run `node la-ladera/tools/inspect_data.mjs > la-ladera/js/interiors/inspect_data.js`');
});

test('the library is integrated: every one of the 24 models stands for something that exists, and the complete validator agrees', async () => {
  const bindings = JSON.parse(readFileSync(join(ROOT, 'js', 'interiors', 'inspect-bindings.json'), 'utf8'));
  assert.equal(bindings.status, 'integrated');
  assert.equal(INSPECT_KEYS.length, 24);
  const bound = new Set(Object.values(BINDINGS));
  assert.deepEqual(INSPECT_KEYS.filter((k) => !bound.has(k)), [], 'a model that nothing stands for');
  assert.deepEqual(Object.keys(BINDINGS).sort(), Object.keys(bindings.bindings).sort());
  for (const [id, b] of Object.entries(bindings.bindings)) {
    assert.ok(idsOf[b.export]?.includes(id), `${id} is not in ${b.source} ${b.export}`);
    const homes = Object.entries(idsOf).filter(([, ids]) => ids.includes(id)).map(([e]) => e);
    assert.deepEqual(homes, [b.export], `${id} is an id of more than one source (${homes}): the binding would draw the wrong thing`);
    assert.equal(b.asset, BINDINGS[id]);
  }
  const r = await validateLibrary({ complete: true });
  assert.equal(r.ok, true, [...r.errors, ...r.warnings].join('\n'));
  assert.equal(r.verifiedBindings, Object.keys(BINDINGS).length);
  assert.equal(r.integrationStatus, 'integrated');
});

test('modelFor: footprint and height from the manifest, standing models keep their axes, lying ones turn thickness into height, the coin follows the find, nothing bound is nothing', () => {
  assert.equal(modelFor('no_such_thing'), null);
  assert.equal(modelFor('mesa'), null);
  const car = modelFor('carrito'), [cw, ch, cd] = INSPECT.inspect_toy_car.s;
  assert.deepEqual([car.key, car.pose, car.s], ['inspect_toy_car', 'stand', 1]);
  near(car.h, ch, 1e-4, 'car height'); near(car.w, cw + 2 * MARGIN, 1e-4, 'car width'); near(car.d, cd + 2 * MARGIN, 1e-4, 'car depth');
  const diary = modelFor('dia_camila'), [dw, dh, dd] = INSPECT.inspect_diary.s;
  assert.equal(diary.pose, 'flat');
  near(diary.h, dd, 1e-4, 'diary lies: its thickness is its height'); near(diary.d, dh + 2 * MARGIN, 1e-4, 'diary lies: its length is its depth'); near(diary.w, dw + 2 * MARGIN, 1e-4, 'diary width');
  const big = modelFor('oro_centenario', 0.037), small = modelFor('oro_napoleon', 0.021), huge = modelFor('oro_forro', 0.4), tiny = modelFor('oro_forro', 0.001);
  near(big.s, 0.037 / INSPECT[COIN].s[0], 1e-3, 'the coin is as big as the find'); assert.ok(small.s < big.s);
  assert.equal(huge.s, 1.3); assert.equal(tiny.s, 0.5);
  assert.equal(modelFor('oro_centenario', 0.037, 0.75).s, Math.round(big.s * 0.75 * 10000) / 10000, 'the shrink of a tight shelf applies to the model');
  assert.equal(modelFor('tapete').s, SCALES.inspect_lace);
  for (const key of INSPECT_KEYS) { const m = modelFor(firstId(key), 0.03); assert.equal(m.pose, POSES[key] ?? 'flat'); assert.ok(m.h > 0 && m.w > 0 && m.d > 0, key); }
});

test('every model, drawn through the Pen from its real GLB, rests on the surface inside the footprint modelFor gave it (all 24, detail model, own materials)', async () => {
  const ctx = await loaded(await newCtx());
  assert.equal(ctx.inspectGlb.size, 24, `${[...INSPECT_KEYS].filter((k) => !ctx.inspectGlb.has(k))} did not load`);
  for (const key of INSPECT_KEYS) {
    const id = firstId(key), m = modelFor(id, 0.03), { P, rec } = penFor(ctx);
    const o = { id: 'o', sh: 'box', col: 0xcccccc, x: 0.31, y: 0.05, z: 0.12, w: m.w, h: m.h, d: m.d, model: m, item: id };
    drawContent(P, o);
    const g = drawn(P, rec), eps = 6e-4;
    near(g.lo[1], o.y + 0.0004, eps, `${key}: bottom`); near(g.hi[1], o.y + 0.0004 + m.h, eps, `${key}: top`);
    near(g.hi[0] - g.lo[0], m.w - 2 * MARGIN, eps, `${key}: width`); near(g.hi[2] - g.lo[2], m.d - 2 * MARGIN, eps, `${key}: depth`);
    near((g.hi[0] + g.lo[0]) / 2, o.x, eps, `${key}: centred across`); near((g.hi[2] + g.lo[2]) / 2, o.z, eps, `${key}: centred in depth`);
    assert.equal(g.tris, INSPECT[key].tris, `${key}: the detail model is drawn (not its LOD)`);
    assert.ok([...g.keys].every((k) => ALL_DEFS[k]), `${key} draws ${[...g.keys]}: a material the library does not have`);
    assert.ok(g.keys.size <= INSPECT[key].calls, `${key}: ${g.keys.size} materials for ${INSPECT[key].calls} draw calls in the manifest`);
  }
});

test('a lying model shows its front to the person at the drawer (face up, head to the back); a standing one keeps its head up', async () => {
  const ctx = await loaded(await newCtx());
  const at = (key, id, pose) => {
    const { P, rec } = penFor(ctx), m = modelFor(id), o = { id: 'o', sh: 'sheet', x: 0, y: 0, z: 0, w: m.w, h: m.h, d: m.d, model: m, item: id };
    assert.equal(m.pose, pose);
    drawContent(P, o);
    const part = inspectParts(ctx, key)[0], pos = part.geometry.attributes.position, a = P.b.accs.get(part.matKey), cs = Math.cos(rec.ry), sn = Math.sin(rec.ry);
    const local = (i) => { const dx = a.pos[3 * i] - rec.x, dz = a.pos[3 * i + 2] - rec.z; return [dx * cs - dz * sn, a.pos[3 * i + 1] - rec.y, dx * sn + dz * cs]; };
    const most = (axis, sign) => { let best = 0; for (let i = 1; i < pos.count; i++) if (sign * pos.getComponent(i, axis) > sign * pos.getComponent(best, axis)) best = i; return best; };
    return { front: local(most(2, 1)), head: local(most(1, 1)), foot: local(most(1, -1)), h: m.h, d: m.d };
  };
  const flat = at('inspect_letter', 'carta_sin_enviar', 'flat');                           // the part's first vertices in draw order = the geometry's own
  assert.ok(flat.front[1] > flat.h / 2, `the letter's written face is not up (${flat.front[1].toFixed(3)} of ${flat.h.toFixed(3)})`);
  assert.ok(flat.head[2] < flat.foot[2] - 0.05, `the letter's head is not to the back (${flat.head[2].toFixed(3)} vs ${flat.foot[2].toFixed(3)})`);
  const up = at('inspect_toy_car', 'carrito', 'stand');
  assert.ok(up.head[1] > up.foot[1] + 0.02, 'a standing model keeps its head up');
});

test('no model loaded (or no parts handed over): the thing is drawn as its old stand-in, in the same box, with no inspect material', async () => {
  const ctx = await newCtx();                                                          // not loaded: ctx.inspectGlb does not exist
  for (const [id, shape] of [['reverso_fotos', 'paper'], ['rosario', 'item'], ['armonica', 'find']]) {
    const m = modelFor(id, 0.1);
    for (const parts of [false, true]) {
      const { P, rec } = penFor(ctx, parts), o = { id: 'o', sh: 'box', col: 0x886644, x: 0, y: 0, z: 0, w: m.w, h: m.h, d: m.d, model: m };
      if (shape === 'paper') Object.assign(o, { sh: 'sheet', cover: 'loose', paper: { id, kind: 'note', prompt: '' } });
      else if (shape === 'find') Object.assign(o, { fd: { shape: 'box', size: 0.1, tint: 0x886644, wrap: 'loose' }, find: id });
      else Object.assign(o, { sh: 'chain', item: id });
      drawContent(P, o);
      const g = drawn(P, rec);
      assert.ok(g.tris > 0, `${id}: nothing drawn`);
      assert.ok([...g.keys].every((k) => !/^inspect_/.test(k)), `${id}: ${[...g.keys]}`);
    }
  }
});

test('loading: a file that fails to download costs the look of its things only; a model with a broken vertex is a stand-in from then on; nothing throws', async () => {
  const bad = INSPECT.inspect_diary && 'inspect/inspect_diary.glb', nan = 'inspect/inspect_locket.glb';
  const ctx = await loaded(await newCtx(), {
    fail: (p) => p.endsWith(bad),
    tamper: (g, p) => { if (p.endsWith(nan)) g.scene.traverse((o) => { if (o.isMesh) o.geometry.attributes.position.setX(0, NaN); }); },
  });
  assert.ok(!ctx.inspectGlb.has('inspect_diary') && !ctx.inspectGlb.has('inspect_locket'), 'the broken ones are out');
  assert.equal(ctx.inspectGlb.size, 22);
  assert.equal(inspectParts(ctx, 'inspect_diary'), null); assert.equal(inspectParts(ctx, 'inspect_locket'), null);
  assert.ok(inspectParts(ctx, 'inspect_envelope')?.length);
  assert.equal(inspectParts(ctx, 'inspect_unknown'), null); assert.equal(inspectParts({}, 'inspect_envelope'), null);
  // the page's entry loads all three sets (furniture, clothes, close-inspection) and a context without assets is no error
  const page = await newCtx();
  page.assets.loader.loadAsync = async () => { throw new Error('offline'); };
  await pageLoad(page);
  assert.equal(page.inspectGlb.size, 0); assert.ok(page.garmentGlb && page.interiorGlb, 'the other two sets are still made');
  assert.equal(await loadInspectAssets({}), 0);
});

// ------------------------------------------------------------------ in the barrio
const world = await furnishedBatch({ n: N });
const { ctx, bps } = world;
ctx.mat = matStub;
for (const bp of bps) buildInterior(ctx, bp);
const C = ctx.containers;
const regs = [], log = [];
ctx.interact = { register(t) { regs.push(t); return t; }, unregisterGroup(g) { for (let i = regs.length - 1; i >= 0; i--) if (regs[i].group === g) regs.splice(i, 1); } };
ctx.discover = { found: new Set(), items: new Map(), mark(d) { this.found.add(d.id); this.items.set(d.id, d); } };
ctx.reader = { isOpen: false, opened: [], open(doc) { this.opened.push(doc); return true; } };
{ const orig = ctx.events.emit.bind(ctx.events); ctx.events.emit = (t, e) => { log.push([t, e]); return orig(t, e); }; }
await loaded(ctx);
const slots = [];
for (const bp of bps) { C.activate(bp.id); for (const S of C.byBuilding.get(bp.id) ?? []) slots.push(S); }
const modelsOf = (S) => (S.objs ??= makeContents(ctx, S)).filter((o) => o.model);

test('in the barrio: bound papers, finds and ordinary things get their model most of the time, never at the cost of being placed', () => {
  const bound = (S) => (S.plan?.paper && BINDINGS[S.plan.paper]) || (S.plan?.find && BINDINGS[S.plan.find]);
  const planned = slots.filter(bound);
  assert.ok(planned.length >= 6, `${planned.length} slots hold something with a model in ${N} buildings`);
  let withModel = 0;
  for (const S of planned) {
    const objs = S.objs ??= makeContents(ctx, S), id = S.plan.paper ?? S.plan.find, o = objs.find((q) => q.paper?.id === id || q.find === id);
    assert.ok(o, `${S.id}: ${id} is planned here but was squeezed out`);
    if (o.model) { withModel++; assert.equal(o.model.key, BINDINGS[id]); }
  }
  assert.ok(withModel / planned.length >= 0.5, `${withModel} of ${planned.length} planned things got their model`);
  const items = new Map();
  for (const S of slots) for (const o of modelsOf(S)) if (o.item) items.set(o.item, (items.get(o.item) ?? 0) + 1);
  assert.ok(items.size >= 3, `ordinary things with a model in the drawers: ${[...items.keys()]}`);
});

test('the packing is the same loaded or not: what is placed, where, and how big', () => {
  const have = ctx.inspectGlb;
  try {
    for (const S of slots.slice(0, 120)) {
      ctx.inspectGlb = have; const a = JSON.stringify(makeContents(ctx, S));
      ctx.inspectGlb = new Set(); const b = JSON.stringify(makeContents(ctx, S));
      assert.equal(a, b, `${S.id}`);
    }
  } finally { ctx.inspectGlb = have; }
});

test('opening a drawer with a model in it: the model is in the open drawer, it is a target of its own, the paper opens the reader and the find is discovered, as before', () => {
  const picks = { paper: null, find: null, item: null };
  for (const S of slots) {
    for (const o of modelsOf(S)) {
      if (o.paper && !picks.paper) picks.paper = [S, o];
      else if (o.find && !picks.find) picks.find = [S, o];
      else if (o.item && !picks.item) picks.item = [S, o];
    }
  }
  assert.ok(picks.paper && picks.find && picks.item, `a paper, a find and an ordinary thing with a model: ${Object.entries(picks).map(([k, v]) => k + ':' + (v ? v[1].model.key : '-')).join(' ')}`);
  for (const [what, [S, o]] of Object.entries(picks)) {
    regs.length = 0; log.length = 0;
    assert.ok(C.open(S.id), `${S.id} opens`); C.step(1);
    assert.equal(S.state, 'open');
    const keys = new Set(); S.contentGroup.traverse((m) => { if (m.isMesh) keys.add(m.userData.matKey); });
    assert.ok([...keys].some((k) => /^inspect_/.test(k)), `${what} ${S.id}: the open drawer shows ${[...keys]}`);
    const targets = regs.filter((t) => t.kind === 'object' && t.id.startsWith(`cont:${S.id}:`));
    assert.equal(targets.length, S.objs.length, `${S.id}: one target per thing inside`);
    const k = S.objs.indexOf(o), t = targets.find((q) => q.id === `cont:${S.id}:${k}`);
    assert.ok(t, `${what}: the model has its own target`);
    // from above the thing, looking straight down, the view test hits it (the box the target tests is the model's own footprint)
    assert.ok(S.objHits[k]({}, {}, { x: t.x, y: t.y + 0.4, z: t.z }, { x: 0, y: -1, z: 0 }) >= 0, `${what}: not under the crosshair from above`);
    ctx.reader.opened.length = 0;
    t.use(ctx);
    if (what === 'paper') { assert.equal(ctx.reader.opened.length, 1, 'the reader opens'); assert.equal(ctx.reader.opened[0].id, o.paper.id); }
    if (what === 'find') {
      assert.ok(ctx.discover.found.has(`find:${o.find}:${S.bid}`), 'the find is discovered'); assert.ok(log.some(([ev, e]) => ev === 'find' && e.id === o.find), 'and announced');
      assert.ok(ctx.collection.finds.has(o.find), 'and in the collection');
    }
    if (what === 'item') assert.equal(ctx.reader.opened.length, 0, 'an ordinary thing says its line and opens nothing');
    C.close(S.id, true);
    assert.equal(regs.filter((q) => q.id.startsWith(`cont:${S.id}:`)).length, 0, 'closing drops the targets');
  }
});

test('E on a find asks for the hold-up with its model, name and line, and its own record for the generic close-up; a paper and an ordinary thing do not; a find with no model is still found and asks with no model (R4-206, R2b-004)', () => {
  const held = [], real = ctx.holdup;
  ctx.holdup = { open(h) { held.push(h); return true; } };
  try {
    const pick = { model: null, bare: null, paper: null, item: null };
    for (const S of slots) {
      for (const o of (S.objs ??= makeContents(ctx, S))) {
        if (o.find && o.model && !pick.model) pick.model = [S, o];
        else if (o.find && !o.model && !pick.bare) pick.bare = [S, o];
        else if (o.paper && !pick.paper) pick.paper = [S, o];
        else if (o.item && !pick.item) pick.item = [S, o];
      }
    }
    assert.ok(pick.model && pick.bare && pick.paper && pick.item, `a find with a model, a find without, a paper and an ordinary thing: ${Object.entries(pick).map(([k, v]) => k + ':' + (v ? 'yes' : '-')).join(' ')}`);
    for (const [what, [S, o]] of Object.entries(pick)) {
      held.length = 0; regs.length = 0; ctx.reader.opened.length = 0;
      assert.ok(C.open(S.id), `${S.id} opens`); C.step(1);
      const t = regs.find((q) => q.kind === 'object' && q.id === `cont:${S.id}:${S.objs.indexOf(o)}`);
      assert.ok(t, `${what}: the thing has its own target`);
      t.use(ctx);
      if (!o.find) { assert.equal(held.length, 0, `${what}: only a find is held up`); }
      else {
        const rec = FINDS.find((f) => f.id === o.find);
        assert.equal(held.length, 1, `${what}: one hold-up asked for`); const h = held[0];
        assert.equal(h.id, o.find); assert.ok(h.name.es.startsWith(rec.name.es), `the name (and the place, as the toast gives it): ${h.name.es}`); assert.equal(h.name.en, rec.name.en); assert.deepEqual(h.react, resolveFind(rec, householdOf(S)).react, 'the line of the find, with its household\'s tokens filled ({T}: the team the signed shirt is of)');
        assert.ok(Array.isArray(h.tag) && /^Hallazgo · .+ [1-9]\d* de [1-9]\d*$/.test(h.tag[0]) && /^Find · .+ [1-9]\d* of [1-9]\d*$/.test(h.tag[1]), `the tag says the shelf and the count, as the toast does (the HUD is hidden while it is held): ${h.tag}`);
        assert.deepEqual(h.generic, { id: rec.id, shape: rec.shape, tint: rec.tint, size: rec.size }, 'the find\'s own record, for the close-up the hold-up draws (generic.js) when the library has no model, or it has not loaded');
        if (what === 'model') assert.equal(h.model.key, BINDINGS[o.find], 'with the model it is drawn with');
        else assert.equal(h.model, null, 'no library model: the hold-up draws the generic close-up from h.generic (generic.test.mjs, holdup.test.mjs)');
        assert.ok(ctx.discover.found.has(`find:${o.find}:${S.bid}`), `${what}: found, held up or not`);
      }
      if (what === 'paper') assert.equal(ctx.reader.opened.length, 1, 'the reader opens, not the hold-up');
      C.close(S.id, true);
    }
  } finally { ctx.holdup = real; }
});

test('the inside of an open drawer holds every model inside the drawer (no model pokes through the front or the back)', () => {
  let n = 0;
  for (const S of slots) {
    const objs = modelsOf(S); if (!objs.length) continue;
    for (const o of objs) {
      for (const sf of S.slot.surf) {
        if (Math.abs(sf.y - o.y) > 1e-6 || o.x < sf.x0 - 1e-6 || o.x > sf.x1 + 1e-6) continue;
        assert.ok(o.x - o.w / 2 >= sf.x0 - 1e-6 && o.x + o.w / 2 <= sf.x1 + 1e-6, `${S.id}: ${o.model.key} is wider than its shelf`);
        assert.ok(o.z + o.d / 2 <= sf.z1 + 1e-6, `${S.id}: ${o.model.key} sticks out of the front`);
        n++;
      }
    }
  }
  assert.ok(n > 5, `${n} models checked`);
});

test.after(() => { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); });
