// The foliage atlas painters (js/world/sprites.js) under node. R1-D04 found the vegetation crude: cypresses as "polka-dot cones", eucalyptus as "cards of hanging strips", flower
// beds as "dark blobs with confetti dots". There is no canvas here, so a recording context (with a real affine stack, so a painter's own translate / scale / rotate land in tile
// pixels) runs the REAL painters, and the tests read what was drawn, for several seeds each.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-sprites.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../js/core/rng.js';
import { TILE, paintTile } from '../js/world/sprites.js';
import { SEED } from './world-lib.mjs';

const T = 256;                                   // the atlas is 1024 px: 4 x 4 tiles
const SEEDS = [SEED, 7, 99, 1234, 5555, 31337];

/** A 2D context that records every fill and stroke as { op, style, width, alpha, path: [{ k, p, rx, ry }] }, the points already in tile pixels. */
function recorder() {
  let m = [1, 0, 0, 1, 0, 0], path = [];
  const stack = [], ops = [];
  const at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const mul = (n) => { m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; };
  const g = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter',
    save() { stack.push([m, this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.globalCompositeOperation]); },
    restore() { [m, this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); }, scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); mul([c, s, -s, c, 0, 0]); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ k: 'M', p: at(x, y) }); }, lineTo(x, y) { path.push({ k: 'L', p: at(x, y) }); },
    quadraticCurveTo(cx, cy, x, y) { path.push({ k: 'Q', p: at(x, y) }); }, bezierCurveTo(a, b, c, d, x, y) { path.push({ k: 'B', p: at(x, y) }); },
    ellipse(x, y, rx, ry) { path.push({ k: 'E', p: at(x, y), rx, ry }); }, arc(x, y, r) { path.push({ k: 'E', p: at(x, y), rx: r, ry: r }); },
    rect() {}, clip() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }),
    fill() { ops.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha, path }); },
    stroke() { ops.push({ op: 'stroke', style: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, path }); },
  };
  return { g, ops };
}
const paint = (tile, seed = SEED) => { const { g, ops } = recorder(); paintTile(g, tile, new Rng(seed).fork('world:sprites')); return ops; };

const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const lum = (s) => { const [r, g, b] = rgb(s); return 0.3 * r + 0.59 * g + 0.11 * b; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const first = (o) => o.path[0].p, last = (o) => o.path[o.path.length - 1].p;
const hypot = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isEllipse = (o) => o.path.length === 1 && o.path[0].k === 'E';

test('every tile of the atlas paints marks with finite coordinates', () => {
  for (const [name, tile] of Object.entries(TILE)) {
    const ops = paint(tile);
    assert.ok(ops.length > 10, `${name}: ${ops.length} marks`);
    for (const o of ops) for (const s of o.path) assert.ok(s.p.every(Number.isFinite), `${name}: a point that is not a number`);
  }
});

test('cypress: a flame of thin upswept sprays, pinched at the tip, wide at the foot, lit from the right', () => {
  for (const seed of SEEDS) {
    const ops = paint(TILE.CYPRESS, seed);
    const sprays = ops.filter((o) => o.op === 'stroke' && o.path.length === 2 && o.path[1].k === 'Q');
    assert.ok(sprays.length >= 900, `seed ${seed}: ${sprays.length} sprays`);
    assert.ok(!ops.some((o) => o.path.some((s) => s.k === 'E')), `seed ${seed}: no round dots (the old tile was 620 of them)`);
    assert.ok(sprays.every((o) => o.width <= 4), `seed ${seed}: sprays are thin`);
    const up = sprays.filter((o) => last(o)[1] < first(o)[1] - 1).length;
    assert.ok(up / sprays.length > 0.95, `seed ${seed}: ${up} of ${sprays.length} sprays point up`);
    const reach = (lo, hi) => Math.max(...sprays.map(first).filter((p) => p[1] >= lo * T && p[1] < hi * T).map((p) => Math.abs(p[0] - T / 2)));
    const tip = reach(0, 0.15), foot = reach(0.66, 1);
    assert.ok(foot > 0.4 * (T / 2) && foot < T / 2 - 2, `seed ${seed}: the foot reaches ${foot.toFixed(1)} px from the axis, wide but not clipped`);
    assert.ok(tip < 0.5 * foot, `seed ${seed}: the top reaches ${tip.toFixed(1)} px against ${foot.toFixed(1)} at the foot`);
    const right = sprays.filter((o) => first(o)[0] > T / 2 + 8), left = sprays.filter((o) => first(o)[0] < T / 2 - 8);
    assert.ok(mean(right.map((o) => lum(o.style))) > mean(left.map((o) => lum(o.style))) + 8, `seed ${seed}: the right side is lit, the left in shade`);
  }
});

test('flower bed: a mound of leaves under six clusters of real flower heads, each with twelve petals and an eye', () => {
  for (const seed of SEEDS) {
    const ops = paint(TILE.FLOWERS, seed);
    const eyes = ops.filter((o) => o.op === 'fill' && o.style === '#eab524' && isEllipse(o));
    assert.ok(eyes.length >= 24 && eyes.length <= 42, `seed ${seed}: ${eyes.length} heads`);
    const petals = ops.filter((o) => o.op === 'fill' && isEllipse(o) && o.path[0].rx > 3.5 && o.path[0].rx < 10);
    assert.equal(petals.length, 12 * eyes.length, `seed ${seed}: six petals and six shaded back petals to every head`);
    for (const e of eyes) assert.ok(first(e)[1] > 0.3 * T && first(e)[1] < 0.8 * T && first(e)[0] > 0.1 * T && first(e)[0] < 0.9 * T, `seed ${seed}: a head at ${first(e).map((v) => v.toFixed(0))} is off the mound`);
    const leaves = ops.filter((o) => o.op === 'fill' && o.path.length === 3 && o.path[1].k === 'Q' && o.path[2].k === 'Q');
    assert.ok(leaves.length >= 150, `seed ${seed}: ${leaves.length} leaves`);
    // the heads come in runs of one colour, cluster by cluster: a few colour jumps between consecutive heads, where confetti would jump at every head
    const front = petals.filter((_, i) => i % 12 >= 6).map((o) => rgb(o.style));
    let jumps = 0; for (let i = 1; i < front.length / 6; i++) if (Math.hypot(...front[i * 6].map((v, k) => v - front[(i - 1) * 6][k])) > 90) jumps++;
    assert.ok(jumps <= 5 && jumps >= 2, `seed ${seed}: ${jumps} colour jumps between consecutive heads`);
  }
});

test('eucalyptus spray: twelve thin twigs hang from one branch, each with some forty small sickle leaves that grow toward the tip', () => {
  for (const seed of SEEDS) {
    const ops = paint(TILE.EUCA, seed);
    const strokes = ops.filter((o) => o.op === 'stroke' && o.alpha === 1);
    assert.equal(strokes.filter((o) => o.width <= 2.3 && o.path.length > 10).length, 12, `seed ${seed}: twelve twigs`);
    assert.equal(strokes.filter((o) => o.width > 2.5).length, 1, `seed ${seed}: only the branch is thick (the old tile was 38 fat strokes)`);
    const leaves = ops.filter((o) => o.op === 'fill' && o.path.length === 3 && o.path[1].k === 'Q' && o.path[2].k === 'Q');
    assert.ok(leaves.length >= 600, `seed ${seed}: ${leaves.length} leaves`);
    assert.ok(leaves.every((o) => hypot(first(o), o.path[1].p) <= 0.09 * T), `seed ${seed}: a leaf longer than ${(0.09 * T).toFixed(0)} px`);
    const hang = leaves.filter((o) => o.path[1].p[1] > first(o)[1] + 0.5 * hypot(first(o), o.path[1].p)).length;
    assert.ok(hang / leaves.length > 0.95, `seed ${seed}: ${hang} of ${leaves.length} leaves hang`);
    const xs = leaves.map((o) => first(o)[0]), ys = leaves.map((o) => first(o)[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 0.7 * T && Math.max(...ys) - Math.min(...ys) > 0.6 * T, `seed ${seed}: the spray fills the card`);
    const len = (lo, hi) => mean(leaves.filter((o) => first(o)[1] >= lo * T && first(o)[1] < hi * T).map((o) => hypot(first(o), o.path[1].p)));
    assert.ok(len(0.5, 1) > 1.1 * len(0, 0.3), `seed ${seed}: leaves grow toward the tip (${len(0, 0.3).toFixed(1)} px up top, ${len(0.5, 1).toFixed(1)} below)`);
  }
});
