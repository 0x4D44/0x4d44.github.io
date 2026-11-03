// The sea for those who do not draw it (A1, js/engine/seaview.js, round 7: A5's ask (b)). `ctx.sea` is built by the late `sea` unit, about 375 ms AFTER the lazy milestone (measured on a real lazy page),
// and under `?skip=coast` it is never built; the swimmer, the camera under the surface, the splashes and the surf all ask `seaOf(ctx)` and get the real water when it is there and a stand-in when it is not.
// Held here: the stand-in is the pure sea over the coast's ground; a sea built late is picked up and one taken away is let go; one stand-in per context; and (the part that keeps it so) NOBODY reads `ctx.sea`
// directly except the water that writes it and A5's two modules that guard it, so the next consumer cannot forget the guard.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-seaview.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of core-sea.test.mjs):
//   noreal  a sea built late is not picked up        keep  a sea taken away is still handed out        shared  one stand-in for every context        hour  the stand-in ignores the hour
//   ground  the stand-in has no ground (dry nowhere)         scan  a new engine file reads ctx.sea directly         nocam  the stand-in is made without the context's camera (it is never submerged)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import './nice.mjs';
import * as view from '../js/engine/seaview.js';
import * as pure from '../js/core/sea.js';
import { createCoast, SEA } from '../js/world/coast.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);

const memo = (f) => { const m = new WeakMap(); return (ctx) => { let s = m.get(ctx); if (!s) m.set(ctx, s = f(ctx)); return s; }; };
let theOne = null;
/** seaOf: the real one, or one with a deliberate fault when C_SABOTAGE asks. */
const seaOf = on('noreal', 'nocam') ? memo((ctx) => view.seaOf({ plan: ctx.plan, hour: ctx.hour }))
  : on('keep') ? (ctx) => { ctx.__seen = ctx.sea ?? ctx.__seen; return ctx.__seen ?? view.seaOf(ctx); }
    : on('shared') ? (ctx) => (theOne ??= view.seaOf(ctx))
      : on('hour') ? memo((ctx) => view.seaOf({ plan: ctx.plan }))
        : on('ground') ? memo((ctx) => view.seaOf({ hour: ctx.hour }))
          : view.seaOf;

const coast = createCoast({ seed: 1, edge: () => 0.1 });
const R = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (limit ${eps})`);
const points = (n, seed = 5) => { const r = R(seed); return Array.from({ length: n }, () => [-120 + 240 * r(), 96 + 170 * r()]); };

test('with no water built the stand-in has the real sea\'s members and answers from the first frame, one per context, never null', () => {
  const ctx = { plan: { coast }, hour: 15 }, s = seaOf(ctx);
  assert.deepEqual(Object.keys(s).sort(), ['depth', 'level', 'slope', 'state', 'submerged', 'time', 'under'], 'the members of ctx.sea (the test of engine/water.js holds the same list)');
  assert.equal(view.seaBuilt(ctx), false); assert.equal(seaOf(ctx), s, 'the same one on every call: nobody allocates a sea per frame');
  assert.notEqual(seaOf({ plan: { coast }, hour: 15 }), s, 'another context, another stand-in'); assert.equal(s.time, 0, 'the swell stands still until the water exists');
  for (const odd of [{}, null, undefined, 7, 'x']) { const o = seaOf(odd); assert.ok(o && typeof o.level === 'function' && Number.isFinite(o.depth(0, 150)) && Number.isFinite(o.level(0, 150)), `a context of ${JSON.stringify(odd)} still gets a sea`); }
});

test('the stand-in is the pure sea at time 0 and the context\'s hour over the coast\'s ground: level, slope, depth, to the last bit', () => {
  const ctx = { plan: { coast }, hour: 15 }, s = seaOf(ctx), st = pure.seaState(15), out = [0, 0], want = [0, 0];
  let wet = 0, dry = 0;
  for (const [x, z] of points(1500)) {
    assert.equal(s.level(x, z), pure.level(x, z, 0, st) * pure.nearWeight(x, z), `level (${x}, ${z})`);
    assert.equal(s.level(x, z, 12.5), pure.level(x, z, 12.5, st) * pure.nearWeight(x, z), 'at a given time');
    const g = s.slope(x, z, 3.5, out), w = pure.nearWeight(x, z);
    if (w === 1) assert.deepEqual([...g], [...pure.slope(x, z, 3.5, st, want)], `slope in the full swell at (${x}, ${z})`);
    const d = s.depth(x, z), h = coast.heightAt(x, z);
    close(d, SEA + s.level(x, z) - h, 1e-12, `depth (${x}, ${z}) is the still sea and the swell over the coast's ground`);
    if (d > 0.05) wet++; else if (d < -0.05) dry++;
  }
  assert.ok(wet > 200 && dry > 200, `the sample has water and land in it (${wet} wet, ${dry} dry)`);
  assert.ok(s.depth(0, 120) < 0 && s.depth(0, 160) > 0.2 && s.depth(0, 200) > 1.8, `the sand is dry, a knee of water at z 160, nearly three metres at z 200 (${s.depth(0, 120).toFixed(2)}, ${s.depth(0, 160).toFixed(2)}, ${s.depth(0, 200).toFixed(2)})`);
});

test('the stand-in follows the hour of its context (calm at night, the full breeze in the afternoon) and a context with no plan is dry land', () => {
  const ctx = { plan: { coast }, hour: 3 }, s = seaOf(ctx), top = () => { let m = 0; for (const [x, z] of points(600, 9)) m = Math.max(m, Math.abs(s.level(x, z))); return m; };
  const night = top(); ctx.hour = 15; const day = top();
  assert.ok(night > 0.1 && night < pure.maxLevel(pure.CALM) + 1e-9, `at night the swell tops out at ${night.toFixed(3)} m, within the calm bound ${pure.maxLevel(pure.CALM).toFixed(3)}`);
  assert.ok(day > night * 1.4, `and in the afternoon at ${day.toFixed(3)} m: the breeze is higher (${(day / night).toFixed(2)} x)`);
  assert.equal(s.state.wind, 1, 'its state is the afternoon\'s'); ctx.hour = 3; s.level(0, 150); assert.equal(s.state.wind, 0.35, 'and the night\'s again: it is read at every call');
  const bare = seaOf({ hour: 15 });
  for (const [x, z] of points(100, 3)) assert.ok(bare.depth(x, z) < 0, `no plan: (${x}, ${z}) is not under water`);
});

test('the stand-in knows how deep things are: under is the still sea and the frozen swell over the height, and submerged is the context\'s camera more than 2 cm under it (never with no camera)', () => {
  const camera = { position: { x: 0, y: 5, z: 190 } }, ctx = { plan: { coast }, hour: 15, camera }, s = seaOf(ctx);
  for (const [x, z] of points(300, 11)) for (const y of [-4, -1.2, 0, 3]) close(s.under(x, y, z), SEA + s.level(x, z) - y, 1e-12, `under at (${x}, ${y}, ${z})`);
  assert.equal(s.submerged, false, 'a camera 6 m up is in the air');
  const top = SEA + s.level(0, 190); camera.position.y = top - 0.05; assert.equal(s.submerged, true, '5 cm under the surface where it is'); camera.position.y = top - 0.01; assert.equal(s.submerged, false, '1 cm under is a ripple');
  camera.position.y = top + 0.5; assert.equal(s.submerged, false, 'half a metre over it');
  delete ctx.camera; assert.equal(s.submerged, false, 'no camera: not submerged'); assert.equal(seaOf({ plan: { coast }, hour: 15 }).submerged, false, 'a new context has none yet');
  const lazy = { plan: { coast }, hour: 3 }, l = seaOf(lazy); lazy.camera = { position: { x: 10, y: SEA - 0.5, z: 200 } }; assert.equal(l.submerged, true, 'a camera that arrives after the stand-in was made is the one asked (the camera is read at every call)');
});

test('the real water, once built, is what is handed out; when it is disposed the stand-in is back (the same one)', () => {
  const ctx = { plan: { coast }, hour: 15 }, stand = seaOf(ctx), built = { state: { wind: 1, amp: [1, 1, 1, 1] }, time: 42, level: () => 0.3, slope: () => [0, 0], depth: () => 9 };
  ctx.sea = built; assert.equal(seaOf(ctx), built, 'a sea built late is picked up at the next call'); assert.equal(view.seaBuilt(ctx), true);
  delete ctx.sea; assert.equal(seaOf(ctx), stand, 'a sea that was taken away is let go'); assert.equal(view.seaBuilt(ctx), false);
});

// ---- nobody reads ctx.sea but the water, the view and A5's two guarded modules -----------------------------------------------------------------------------------
const JS = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const listing = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? listing(join(dir, d.name)) : d.name.endsWith('.js') ? [join(dir, d.name)] : []));
/** How many times `src` reads or writes `ctx.sea` in code (a comment or a longer name such as ctx.seabed does not count). */
const touches = (src) => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');       // (CRLF: a `.` stops at the \r, so a `//` comment line of a CRLF file was never stripped)
  return code.match(/\bctx\??\.sea\b/g)?.length ?? 0;
};
const ALLOWED = {
  'engine/seaview.js': 'the one reader: seaOf(ctx) is the real water when it is built and the stand-in when it is not',
  'engine/water.js': 'the writer: it sets ctx.sea when the water is built and takes it away at dispose',
  'world/shorelife.js': 'A5: the gulls, crabs and fish read it behind a ternary, and the page builds them before the water exists',
  'world/waterprops.js': 'A5: the buoys and boats ride it, and lie at rest as placed until it exists',
};

test('the scan sees what it should: code that reads or writes ctx.sea, not comments, strings of other words or longer names', () => {
  for (const [src, n] of [['const h = ctx.sea.level(1, 2);', 1], ['if (ctx.sea) go(ctx.sea.time);', 2], ['x = ctx?.sea?.depth(0, 0)', 1], ['this.ctx.sea.slope()', 1], ['ctx.sea = water;', 1], ['// ctx.sea is read here', 0],
    ['a(); // then ctx.sea', 0], ['/* ctx.sea\n ctx.sea */ b();', 0], ['/** ctx.sea */ const s = ctx.sea;', 1], ['// ctx.sea is read here\r\nx();\r\n', 0], ['ctx.sea.level();\r\n// ctx.sea\r\n', 1], ['ctx.world.sea', 0], ['(ctx.world ??= {}).sea = water', 0], ['ctx.seabed', 0], ['ctx.seaside', 0], ['const url = "https://x"; ctx.sea', 1]]) {
    assert.equal(touches(src), n, JSON.stringify(src));
  }
});

test('nothing reads ctx.sea directly but the water that writes it, the view that guards it and A5\'s two guarded modules: everything else goes through seaOf(ctx)', () => {
  const sources = new Map(listing(JS).map((f) => [relative(JS, f).split(sep).join('/'), readFileSync(f, 'utf8')]));
  if (on('scan')) sources.set('engine/swim.js', 'const h = ctx.sea.level(x, z);');
  const bad = [...sources].map(([f, src]) => [f, touches(src)]).filter(([f, n]) => n > 0 && !Object.hasOwn(ALLOWED, f));
  assert.deepEqual(bad, [], `these files read ctx.sea themselves: ctx.sea does not exist at the lazy milestone (the sea unit builds it ~375 ms later) nor under ?skip=coast, so a swimmer, a camera or a sound that reads it throws or dies quietly; use seaOf(ctx) from engine/seaview.js`);
  for (const [f, why] of Object.entries(ALLOWED)) { assert.ok(sources.has(f), `${f} exists`); assert.ok(touches(sources.get(f)) > 0, `${f} reads or writes ctx.sea (${why}); if it no longer does, take it off the list`); }
  assert.ok(sources.size > 150, `the scan saw ${sources.size} source files`);
});
