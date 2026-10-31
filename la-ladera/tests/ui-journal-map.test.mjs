// The journal's "still to find" grouping and the map's label placement (owner: A1): the pure parts, in node. The DOM side (the real journal and map) is tests/ui-flow.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-journal-map.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inPoly, areaOf, pendingGroups, hintOf, KIND, NOUN, ELSEWHERE } from '../js/ui/panels.js';
import { LabelBook, LM_SPOTS, LM_PRI, byPriority } from '../js/ui/map.js';

const SQ = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const AREAS = [{ id: 'a', name: 'Abajo', en: 'Down', poly: SQ(0, 0, 10, 10) }, { id: 'b', name: 'Arriba', en: 'Up', poly: SQ(10, 0, 20, 10) }, { id: 'c', name: 'Lejos', en: 'Far', poly: SQ(0, 20, 10, 30) }];
const D = (id, kind, x, z) => ({ id, name: `Nombre secreto ${id}`, en: `Secret name ${id}`, kind, x, z });
const ids = (...a) => new Set(a);

// ---- the journal ---------------------------------------------------------------------------------------------------------------
test('inPoly: inside, outside, a concave L, and the far side of a ray', () => {
  const sq = SQ(0, 0, 10, 10), L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.equal(inPoly(sq, 5, 5), true); assert.equal(inPoly(sq, 11, 5), false); assert.equal(inPoly(sq, -1, 5), false); assert.equal(inPoly(sq, 5, 11), false);
  assert.equal(inPoly(L, 2, 8), true, 'the tall arm'); assert.equal(inPoly(L, 8, 2), true, 'the long arm'); assert.equal(inPoly(L, 8, 8), false, 'the notch of the L');
});

test('areaOf: the polygon that holds the point; else the nearest one by its centre; else "Todo el barrio"; a polygon of fewer than 3 points is no area', () => {
  assert.equal(areaOf(AREAS, { x: 3, z: 3 }).id, 'a'); assert.equal(areaOf(AREAS, { x: 15, z: 5 }).id, 'b'); assert.equal(areaOf(AREAS, { x: 5, z: 25 }).id, 'c');
  assert.equal(areaOf(AREAS, { x: -50, z: 5 }).id, 'a', 'west of everything: the nearest centre is Abajo');
  assert.equal(areaOf(AREAS, { x: 40, z: 5 }).id, 'b', 'east of everything: Arriba');
  assert.equal(areaOf(AREAS, { x: 5, z: 60 }).id, 'c', 'far to the south: Lejos');
  assert.equal(areaOf([], { x: 1, z: 1 }), ELSEWHERE); assert.equal(areaOf(undefined, { x: 1, z: 1 }), ELSEWHERE);
  assert.equal(areaOf([{ id: 'x', name: 'x', poly: [[0, 0], [1, 1]] }], { x: 1, z: 1 }), ELSEWHERE, 'two points are a line, not an area');
  const long = [{ id: 'long', name: 'Larga', poly: SQ(0, 0, 100, 10) }, { id: 'near', name: 'Cerca', poly: SQ(100, 0, 110, 10) }];       // (95, 5) is inside Larga but its centre is 45 away, Cerca's only 10
  assert.equal(areaOf(long, { x: 95, z: 5 }).id, 'long', 'the polygon that holds the point wins over a nearer centre');
  assert.equal(areaOf(long, { x: 105, z: 5 }).id, 'near'); assert.equal(areaOf(long, { x: 140, z: 5 }).id, 'near', 'outside both: the nearest centre');
});

test('pendingGroups: one group per area in the plan\'s order, the count left, the area\'s own total, the kinds biggest first; found things leave the count and a finished area leaves the list', () => {
  const items = [D('1', 'story', 2, 2), D('2', 'story', 3, 3), D('3', 'object', 4, 4), D('4', 'mural', 5, 5),
    D('5', 'vista', 12, 2), D('6', 'mirador', 13, 3), D('7', 'view', 14, 4), D('8', 'story', 5, 25)];
  const g = pendingGroups(items, ids('2', '8'), AREAS);
  assert.deepEqual(g.map((x) => [x.area.id, x.left, x.all]), [['a', 3, 4], ['b', 3, 3]], 'Lejos has nothing left and is not listed');
  assert.deepEqual(g[0].kinds, [['historia', 1], ['mural', 1], ['objeto', 1]], 'ties sorted by name, so the list never shuffles between visits');
  assert.deepEqual(g[1].kinds, [['vista', 3]], 'vista, mirador and view are one kind for the player');
  assert.deepEqual(pendingGroups(items, new Set(items.map((d) => d.id)), AREAS), [], 'everything found: nothing is pending');
  assert.deepEqual(pendingGroups([], new Set(), AREAS), []);
  const all = pendingGroups(items, new Set(), AREAS);
  assert.deepEqual(all.map((x) => [x.area.id, x.left]), [['a', 4], ['b', 3], ['c', 1]]);
  assert.deepEqual(all[0].kinds, [['historia', 2], ['mural', 1], ['objeto', 1]], 'biggest first');
  const mixed = pendingGroups(items, ids('1', '2', '3'), AREAS);                                   // left: Abajo 1, Arriba 3, Lejos 1
  assert.deepEqual(mixed.map((x) => [x.area.id, x.left]), [['a', 1], ['b', 3], ['c', 1]], 'the areas keep the plan\'s order even when a later one has more left');
});

test('pendingGroups: the counts always add up (left over every group = the things not found), whatever the mix and wherever the points are', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const kinds = Object.keys(KIND);
  for (let round = 0; round < 40; round++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 60) }, (_, i) => D(`d${i}`, kinds[Math.floor(rnd() * kinds.length)], rnd() * 80 - 30, rnd() * 80 - 30));
    const found = new Set(items.filter(() => rnd() < 0.3).map((d) => d.id)), g = pendingGroups(items, found, AREAS);
    assert.equal(g.reduce((s, x) => s + x.left, 0), items.length - found.size, `round ${round}: left adds up`);
    assert.equal(g.reduce((s, x) => s + x.kinds.reduce((t, [, n]) => t + n, 0), 0), items.length - found.size, `round ${round}: the kinds add up to the same`);
    for (const x of g) { assert.ok(x.left > 0 && x.left <= x.all); assert.equal(x.kinds.reduce((t, [, n]) => t + n, 0), x.left); }
  }
  const lone = pendingGroups([D('z', 'story', 3, 3)], new Set(), []);
  assert.deepEqual(lone.map((x) => [x.area, x.left, x.all]), [[ELSEWHERE, 1, 1]], 'no plan areas: one group for the whole barrio');
});

test('hintOf: how many and of what kind in Spanish and English, singular or plural, and never a name', () => {
  const g = pendingGroups([D('1', 'story', 1, 1), D('2', 'story', 2, 2), D('3', 'mural', 3, 3), D('4', 'nature', 4, 4)], new Set(), AREAS)[0];
  assert.equal(hintOf(g, false), '2 historias · 1 mural · 1 rincón de naturaleza');
  assert.equal(hintOf(g, true), '2 stories · 1 mural · 1 nature spot');
  assert.ok(!/secreto|secret|Nombre/i.test(hintOf(g, false) + hintOf(g, true)), 'a hint says what is there, not what it is called');
  assert.equal(hintOf({ kinds: [['rareza', 2]] }, false), '2 rarezas', 'a kind with no entry still reads');
  assert.equal(hintOf({ kinds: [['rareza', 1]] }, true), '1 rareza');
});

test('every word a discovery kind maps to has its four forms (singular, plural, English singular, English plural)', () => {
  for (const w of new Set(Object.values(KIND))) {
    const n = NOUN[w]; assert.ok(Array.isArray(n) && n.length === 4 && n.every((s) => typeof s === 'string' && s.length > 2), `NOUN has ${w}`);
    assert.notEqual(n[0], n[1], `${w}: the plural differs`); assert.notEqual(n[2], n[3], `${w}: the English plural differs`);
  }
  for (const w of Object.keys(NOUN)) assert.ok(Object.values(KIND).includes(w), `NOUN.${w} is a word some kind maps to`);
});

// ---- the map's labels ----------------------------------------------------------------------------------------------------------
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

test('byPriority: the important kinds are named first (viewpoint, chapel, school, clinic, hall, court, then shrines and plazas, then streets, stairs and shops, the bus stop last); the plan\'s order breaks ties; an unlisted kind counts as a street', () => {
  const K = (...k) => k.map((kind, i) => ({ id: `${kind}${i}`, kind }));
  const sorted = byPriority(K('busstop', 'street', 'plaza', 'shop', 'hall', 'shrine', 'viewpoint', 'stairs', 'chapel', 'court', 'school', 'clinic', 'mystery')).map((l) => l.kind);
  assert.deepEqual(sorted, ['hall', 'viewpoint', 'chapel', 'court', 'school', 'clinic', 'plaza', 'shrine', 'street', 'shop', 'stairs', 'mystery', 'busstop']);
  const pri = sorted.map((k) => LM_PRI[k] ?? 3);
  assert.deepEqual(pri, [...pri].sort((a, b) => a - b), 'never a lower priority before a higher one');
  assert.deepEqual(byPriority(K('school', 'hall', 'chapel')).map((l) => l.kind), ['school', 'hall', 'chapel'], 'equal priority: the plan\'s order');
  assert.deepEqual(byPriority(K('shop', 'busstop', 'street', 'chapel')).map((l) => l.kind), ['chapel', 'shop', 'street', 'busstop']);
  assert.deepEqual(byPriority(undefined), []); assert.deepEqual(byPriority([]), []);
  const input = K('busstop', 'chapel'); byPriority(input); assert.deepEqual(input.map((l) => l.kind), ['busstop', 'chapel'], 'the plan itself is not reordered');
  for (const k of ['viewpoint', 'chapel', 'school', 'clinic', 'hall', 'court']) assert.equal(LM_PRI[k], 1, `${k} is first-rate`);
  for (const k of ['shrine', 'plaza']) assert.equal(LM_PRI[k], 2); for (const k of ['stairs', 'street', 'shop']) assert.equal(LM_PRI[k], 3); assert.equal(LM_PRI.busstop, 4);
});

test('LabelBook: the first label takes the spot, a second one that overlaps it is refused, one that merely touches is fine', () => {
  const b = new LabelBook();
  assert.deepEqual(b.place(100, 100, 60, 12), [100, 100]);
  assert.equal(b.place(120, 105, 60, 12), null, 'overlapping: not drawn');
  assert.deepEqual(b.place(160, 100, 60, 12), [160, 100], 'edge to edge (100+30 = 160-30): touching is not overlapping');
  assert.deepEqual(b.place(100, 112, 60, 12), [100, 112], 'the row below, touching');
  assert.equal(b.drawn.length, 3); assert.deepEqual(b.drawn[0], { text: '', x: 100, y: 100, w: 60, h: 12 });
});

test('LabelBook: priority is the order of placing; alternatives are tried in order and only when the home spot is taken; a marker (keep) is avoided; force ignores everything', () => {
  const b = new LabelBook();
  b.keep(100, 100, 7);                                                                       // a landmark's diamond
  const high = b.place(100, 86, 80, 13, LM_SPOTS, false, 'high');                            // 14 px above the marker: free
  assert.deepEqual(high, [100, 86]);
  const low = b.place(100, 86, 80, 13, LM_SPOTS, false, 'low');                              // the same home: taken, so below the marker
  assert.deepEqual(low, [100, 114], 'the first alternative is directly below');
  const none = b.place(100, 86, 80, 13, null, false, 'nowhere');                             // no alternatives: not drawn
  assert.equal(none, null);
  assert.deepEqual(b.drawn.map((d) => d.text), ['high', 'low'], 'the one placed first stays; a refused label leaves no trace');
  assert.deepEqual(b.place(100, 100, 40, 10, null, true, 'forced'), [100, 100], 'forced: drawn on top of the marker');
  const c = new LabelBook(); c.keep(100, 100, 7);
  assert.equal(c.place(100, 100, 30, 10), null, 'a label on a marker is refused');
  assert.ok(c.place(100, 100, 30, 10, (w) => [[w / 2 + 12, 0]]) !== null, 'but beside it is fine');
});

test('LabelBook: every alternative of LM_SPOTS is distinct, and a label can sit on any of them in turn', () => {
  const w = 90, spots = [[0, 0], ...LM_SPOTS(w)], key = (s) => s.join(',');
  assert.equal(new Set(spots.map(key)).size, spots.length, 'no spot repeated');
  const b = new LabelBook(); b.keep(200, 200, 7);
  const got = [];
  for (let i = 0; i < spots.length; i++) { const at = b.place(200, 186, w, 13, LM_SPOTS, false, 'L' + i); if (at) got.push(at); }
  assert.ok(got.length >= 4, `at least four labels find a spot around one marker (got ${got.length})`);
  for (let i = 0; i < b.taken.length; i++) for (let j = i + 1; j < b.taken.length; j++) assert.ok(!overlap(b.taken[i], b.taken[j]), `rect ${i} and ${j} overlap`);
});

test('LabelBook: with the home, the spot below and the two spots beside the marker taken, labels tuck into its corners: above-right, above-left, below-right, below-left', () => {
  const w = 90, b = new LabelBook();
  b.keep(200, 200, 7);                                                                       // the marker
  for (const [x, y] of [[200, 186], [200, 214], [200 + w / 2 + 11, 200], [200 - w / 2 - 11, 200]]) b.keep(x, y, 3, 2);       // slivers in the middle of the four straight spots: they miss the corner spots
  const got = [1, 2, 3, 4, 5].map((i) => b.place(200, 186, w, 13, LM_SPOTS, false, 'L' + i));
  assert.deepEqual(got.slice(0, 4), [[200 + w / 2 + 7, 188], [200 - w / 2 - 7, 188], [200 + w / 2 + 7, 212], [200 - w / 2 - 7, 212]], 'in the order of LM_SPOTS');
  assert.equal(got[4], null, 'and a fifth has nowhere left');
  for (let i = 0; i < b.taken.length; i++) for (let j = i + 1; j < b.taken.length; j++) assert.ok(!overlap(b.taken[i], b.taken[j]), `rect ${i} and ${j} overlap`);
});

test('LabelBook: bounds keep a label inside the canvas (2 px margin), and the alternatives find a way back inside', () => {
  const b = new LabelBook({ w: 300, h: 200 });
  assert.equal(b.place(290, 100, 80, 12), null, 'half of it would hang out on the right');
  assert.equal(b.place(150, 4, 80, 12), null, 'above the top edge');
  assert.equal(b.place(150, 195, 80, 12), null, 'below the bottom edge');
  assert.deepEqual(b.place(150, 100, 80, 12), [150, 100]);
  assert.deepEqual(b.place(2 + 40, 100 + 40, 80, 12), [42, 140], 'exactly at the margin is inside');
  assert.deepEqual(b.place(298 - 40, 60, 80, 12), [258, 60]);
  assert.equal(b.place(299 - 40, 20, 80, 12), null, 'one pixel past the margin');
  assert.deepEqual(b.place(280, 170, 80, 12, (w) => [[-(w / 2 + 11), 0]]), [229, 170], 'home would hang out on the right; the left-hand alternative is inside');
  assert.deepEqual(b.place(10, 10, 40, 10, null, true), [10, 10], 'force overrides the bounds as it does the rest (the compass)');
});

// R2c-015 (round-3 reviewer): at 1280x720 the labels of the south end ran over the line of the plan's frame (and into the legend). The plan's frame is the inner bounds of the book.
test('LabelBook: inner bounds { x0, y0, x1, y1 } keep a label inside the plan\'s frame as well as the canvas (2 px margin), the alternatives find a way back inside, and a book without them is unchanged', () => {
  const b = new LabelBook({ w: 400, h: 300, x0: 100, y0: 20, x1: 300, y1: 250 });
  assert.equal(b.place(90, 100, 60, 12), null, 'straddling the frame\'s left line');
  assert.equal(b.place(310, 100, 60, 12), null, 'straddling the right line');
  assert.equal(b.place(200, 24, 60, 12), null, 'over the top line');
  assert.equal(b.place(200, 246, 60, 12), null, 'over the bottom line: inside the canvas, outside the frame');
  assert.equal(b.place(30, 100, 40, 12), null, 'wholly outside the frame is refused too: a label belongs to the plan');
  assert.deepEqual(b.place(200, 100, 60, 12), [200, 100]);
  assert.deepEqual(b.place(100 + 2 + 30, 100 + 20, 60, 12), [132, 120], 'exactly at the margin of the frame is inside');
  assert.equal(b.place(100 + 1 + 30, 200, 60, 12), null, 'one pixel past it');
  assert.deepEqual(b.place(200, 244, 60, 12, (w) => [[0, -16], [w, 0]]), [200, 228], 'the bottom line is avoided by the alternative above');
  assert.equal(b.drawn.length, 3);
  for (const r of b.drawn) assert.ok(r.x - r.w / 2 >= 102 && r.x + r.w / 2 <= 298 && r.y - r.h / 2 >= 22 && r.y + r.h / 2 <= 248, `a placed label sits inside the frame: ${JSON.stringify(r)}`);
  assert.deepEqual(b.place(10, 10, 20, 10, null, true), [10, 10], 'force still overrides (the compass sits outside the frame)');
  const c = new LabelBook({ w: 400, h: 300, x0: 150 });                         // a missing edge is the canvas's own
  assert.equal(c.place(140, 100, 60, 12), null); assert.deepEqual(c.place(300, 100, 60, 12), [300, 100]); assert.equal(c.place(380, 100, 60, 12), null, 'x1 defaults to the canvas width');
  const d = new LabelBook({ w: 400, h: 300 });
  assert.deepEqual(d.place(30, 100, 40, 12), [30, 100], 'without inner bounds the whole canvas is open, as before');
});

test('LabelBook: random labels placed in priority order never overlap each other or a marker, and every refused one really had no free spot', () => {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let round = 0; round < 30; round++) {
    const b = new LabelBook({ w: 400, h: 300 }), marks = Array.from({ length: 12 }, () => [rnd() * 400, rnd() * 300]);
    for (const [x, y] of marks) b.keep(x, y, 7);
    const markCount = b.taken.length;
    for (let i = 0; i < 40; i++) {
      const x = rnd() * 400, y = rnd() * 300, w = 20 + rnd() * 90, h = 12, at = b.place(x, y, w, h, LM_SPOTS, false, 'T' + i);
      if (!at) for (const [dx, dy] of [[0, 0], ...LM_SPOTS(w)]) {
        const r = [x + dx - w / 2, y + dy - h / 2, w, h], inside = r[0] >= 2 && r[1] >= 2 && r[0] + r[2] <= 398 && r[1] + r[3] <= 298;
        assert.ok(!inside || b.taken.some((q) => overlap(r, q)), `round ${round}: label ${i} was refused though ${dx},${dy} was free`);
      }
    }
    for (let i = 0; i < b.taken.length; i++) for (let j = i + 1; j < b.taken.length; j++) if (j >= markCount) assert.ok(!overlap(b.taken[i], b.taken[j]), `round ${round}: rects ${i} and ${j} overlap`);
    for (const d of b.drawn) { assert.ok(d.x - d.w / 2 >= 2 - 1e-9 && d.x + d.w / 2 <= 398 + 1e-9 && d.y - d.h / 2 >= 2 - 1e-9 && d.y + d.h / 2 <= 298 + 1e-9, `${d.text} is inside the canvas`); }
  }
});
