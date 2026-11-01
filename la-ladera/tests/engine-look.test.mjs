// The sky and light palette (owner: A1, js/engine/look.js `celestial`, `samplePalette`, `moodWeight`), under node. The sun must rise in the east and
// set in the west, and the SAME sun height must not look the same in the morning and in the evening (review R1-005: 07:00 and 17:12 rendered as one
// pink-gold golden hour): the morning is cool, misty and bright, the evening warm, dusty and with a warm fill. No hue pops while the clock runs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-look.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celestial, samplePalette, moodWeight } from '../js/engine/look.js';

const NUM = ['sunI', 'hemiI', 'envI', 'exp', 'fog', 'glow', 'cloud', 'stars', 'bloomT', 'bloomS', 'sat'];
const COL = ['sun', 'zen', 'hor', 'hemiS', 'hemiG'];
const MORNING = -1, EVENING = 1;
const at = (hour, mood) => samplePalette(celestial(hour).elDeg, null, mood);
const rgb = (c) => [c.r, c.g, c.b];
const blueness = (c) => c.b - c.r;                                                      // > 0 reads cool, < 0 reads warm (linear light)
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const flat = (p) => [...NUM.map((k) => p[k]), ...COL.flatMap((k) => rgb(p[k]))];
const sameRow = (a, b) => flat(a).every((v, i) => Math.abs(v - flat(b)[i]) < 1e-9);

test('the sun rises in the east and sets in the west, at 13 degrees at 07:00 and 10 degrees at 17:12 (late October, 6 N)', () => {
  const am = celestial(7), pm = celestial(17.2), noon = celestial(12);
  assert.ok(am.x > 0.5 && pm.x < -0.5, `x east of the plot at 07:00 ${am.x.toFixed(2)}, west at 17:12 ${pm.x.toFixed(2)}`);
  assert.ok(Math.abs(am.elDeg - 13.1) < 0.3 && Math.abs(pm.elDeg - 10.3) < 0.5, `elevations ${am.elDeg.toFixed(1)} / ${pm.elDeg.toFixed(1)}`);
  assert.ok(noon.elDeg > 70 && noon.elDeg < 72 && noon.z > 0, `noon: ${noon.elDeg.toFixed(1)} deg, in the south (z ${noon.z.toFixed(2)})`);
});

test('mood 0 is the plain palette, and a high sun or the deep night take no mood at all', () => {
  for (const el of [-30, -15, 50, 71, 89]) {
    const plain = samplePalette(el);
    assert.ok(sameRow(samplePalette(el, null, MORNING), plain), `${el} deg, morning`);
    assert.ok(sameRow(samplePalette(el, null, EVENING), plain), `${el} deg, evening`);
  }
  for (const el of [-3, 3, 10, 13, 20]) assert.ok(sameRow(samplePalette(el, null, 0), samplePalette(el)), `${el} deg, mood 0`);
  assert.equal(moodWeight(-30), 0); assert.equal(moodWeight(80), 0);
  for (const el of [6, 8, 10]) assert.equal(moodWeight(el), 1, `${el} deg: full mood from just above the horizon through the golden hour`);
  assert.ok(moodWeight(30) > 0.2 && moodWeight(30) < 0.6, `30 deg (08:30) ${moodWeight(30).toFixed(2)}: the mood is fading`);
});

test('07:00 and 17:12 differ clearly: a pale, misty morning with a gold sun and a cool fill, and a warm, dusty, glowing evening', () => {
  const m = at(7, MORNING), e = at(17.2, EVENING);
  assert.ok(blueness(m.hor) > 0 && blueness(e.hor) < -0.1, `horizon: morning ${blueness(m.hor).toFixed(2)} (pale blue-white), evening ${blueness(e.hor).toFixed(2)} (amber)`);
  assert.ok(dist(m.hor, e.hor) > 0.25, `the horizon colour differs by ${dist(m.hor, e.hor).toFixed(2)} in linear RGB`);
  assert.ok(m.sun.b / m.sun.r > e.sun.b / e.sun.r * 1.6, `the morning sun is the paler, yellower one: b/r ${(m.sun.b / m.sun.r).toFixed(2)} vs ${(e.sun.b / e.sun.r).toFixed(2)}`);
  assert.ok(m.sunI >= e.sunI, `R1-D26: the low morning sun is a real direct light, no weaker than the evening's (the mist used to take 15 % off it): ${m.sunI.toFixed(2)} vs ${e.sunI.toFixed(2)}`);
  assert.ok(m.fog > e.fog * 1.2, `valley mist: fog density ${m.fog.toFixed(4)} vs ${e.fog.toFixed(4)}`);
  assert.ok(e.glow > m.glow * 1.3, `the dusty evening glow is wider: ${e.glow.toFixed(2)} vs ${m.glow.toFixed(2)}`);
  assert.ok(blueness(m.hemiS) > blueness(e.hemiS) + 0.1, `the morning fill is bluer: ${blueness(m.hemiS).toFixed(2)} vs ${blueness(e.hemiS).toFixed(2)}`);
  assert.ok(m.zen.b > e.zen.b && m.zen.b / m.zen.r > e.zen.b / e.zen.r, 'a clearer, bluer zenith in the morning');
});

test('R1-D26 the morning has a direction: at 07:30 a gold sun against a weaker, cool fill, so the shadows are long and deep and the colour is not that of noon', () => {
  const el = celestial(7.5).elDeg, plain = samplePalette(el), m = at(7.5, MORNING), noon = at(12.5, 0), ratio = (p) => p.sunI / p.hemiI, warmth = (c) => c.r / c.b;
  assert.ok(el > 18 && el < 22, `07:30 is ${el.toFixed(1)} degrees`);
  assert.ok(ratio(m) >= ratio(plain) * 1.5, `sun against fill ${ratio(m).toFixed(2)} at 07:30, ${ratio(plain).toFixed(2)} in the plain row: the fill was 1.2 against a sun of 2.95, an evenly lit plaza`);
  assert.ok(m.hemiI <= plain.hemiI * 0.85 && m.envI <= plain.envI * 0.85, `the fill is down: sky ${m.hemiI.toFixed(2)} (plain ${plain.hemiI.toFixed(2)}), IBL ${m.envI.toFixed(2)} (plain ${plain.envI.toFixed(2)})`);
  assert.ok(warmth(m.sun) > 3 && warmth(m.sun) > warmth(noon.sun) * 1.8, `the sun is gold, r/b ${warmth(m.sun).toFixed(1)} against ${warmth(noon.sun).toFixed(1)} at noon`);
  assert.ok(blueness(m.hemiS) > 0.15, `the shade stays cool (fill blueness ${blueness(m.hemiS).toFixed(2)}): warm sun, cool shade`);
  assert.ok(m.exp > plain.exp && m.exp < plain.exp * 1.1, `the exposure makes up for the darker shade without lifting the lit side: ${m.exp.toFixed(3)} (plain ${plain.exp.toFixed(3)})`);
  // and it does not leak: from 09:30 (the mood is gone at 45 degrees) the palette is the plain one, and the evening's mood is as it was
  assert.ok(sameRow(at(9.7, MORNING), at(9.7, 0)), 'no morning mood from 09:40');
  const el17 = celestial(17.2).elDeg;
  assert.ok(Math.abs(at(17.2, EVENING).sunI - samplePalette(el17).sunI * (1 + 0.05 * moodWeight(el17))) < 1e-9, 'the evening sun is the plain one times 1.05, as it was');
});

test('the evening fill does not turn warm light on cement into ice: it is far less blue than the plain golden-hour fill', () => {
  const plain = samplePalette(10.3), e = at(17.2, EVENING);
  assert.ok(blueness(plain.hemiS) > 0.2, `the plain row's fill is strongly blue (${blueness(plain.hemiS).toFixed(2)}): that was the ice`);
  assert.ok(blueness(e.hemiS) < blueness(plain.hemiS) * 0.45, `evening fill blueness ${blueness(e.hemiS).toFixed(2)} vs plain ${blueness(plain.hemiS).toFixed(2)}`);
  assert.ok(e.hemiG.r > e.hemiG.b * 1.6, 'warm bounce from the ground');
});

test('R1-D14 noon (11 to 14 h) has more sun against the fill and clearer air than the mid-morning and mid-afternoon, and every row up to 40 degrees is as it was', () => {
  const noon = [11, 12, 13, 14].map((h) => ({ h, el: celestial(h).elDeg, p: at(h, 0) }));
  const mid = [at(9, MORNING), at(15, EVENING)];
  const ratio = (p) => p.sunI / p.hemiI;
  for (const n of noon) {
    assert.ok(n.el > 54 && n.el < 72, `${n.h} h is ${n.el.toFixed(1)} degrees`);
    assert.ok(ratio(n.p) > 3.6 && n.p.fog <= 0.0026, `${n.h} h: sun ${n.p.sunI.toFixed(2)} against a fill of ${n.p.hemiI.toFixed(2)} (${ratio(n.p).toFixed(2)}), fog ${n.p.fog.toFixed(4)}`);
  }
  assert.ok(ratio(noon[1].p) > 4.0 && ratio(noon[1].p) > ratio(mid[0]) * 1.2 && ratio(noon[1].p) > ratio(mid[1]) * 1.2, `12:00 sun-to-fill ${ratio(noon[1].p).toFixed(2)} against ${ratio(mid[0]).toFixed(2)} at 09:00 and ${ratio(mid[1]).toFixed(2)} at 15:00`);
  assert.ok(noon[1].p.envI <= 1.01 && noon[1].p.hemiI <= 1.01, `the sky and IBL fill at noon are down from 1.2 to ${noon[1].p.hemiI.toFixed(2)}`);
  assert.ok(noon[1].p.hor.b / noon[1].p.hor.r > samplePalette(40).hor.b / samplePalette(40).hor.r, 'the noon horizon is bluer than the 40 degree one, not whiter');
  // the rows below 40 degrees are untouched: these are the values they had (the table's own numbers at its own elevations)
  const pin = (el, o) => { const p = samplePalette(el); for (const [k, v] of Object.entries(o)) assert.ok(Math.abs(p[k] - v) < 1e-9, `${el} deg ${k}: ${p[k]} against ${v}`); };
  pin(-2, { sunI: 0.35, hemiI: 0.85, exp: 1.10, fog: 0.0038 }); pin(1, { sunI: 1.05, hemiI: 0.95, exp: 1.02 }); pin(5, { sunI: 2.00, hemiI: 1.00, exp: 0.98 });
  pin(10, { sunI: 2.85, hemiI: 1.05, exp: 0.96, fog: 0.0034 }); pin(20, { sunI: 3.35, hemiI: 1.10, envI: 1.10, exp: 0.95, fog: 0.0030 }); pin(40, { sunI: 3.70, hemiI: 1.15, envI: 1.15, exp: 0.94, fog: 0.0028 });
  assert.ok(Math.abs(samplePalette(30).sunI - (() => { const t = 0.5, s = t * t * (3 - 2 * t); return 3.35 + (3.70 - 3.35) * s; })()) < 1e-9, 'the segment between 20 and 40 degrees is the one it was');
});

test('the mood is continuous: nothing pops while the clock runs from the first light to noon and from noon to dusk', () => {
  // one 0.25 degree step is about a game minute at the horizon (2 real seconds with the clock running). The plain rows already move by up to
  // ~0.02 per step through the twilight; the mood may not add a spike of its own (twice the plain rate at most).
  const scan = (mood) => { const out = []; for (let el = -20; el <= 80; el += 0.25) out.push(samplePalette(el, null, mood)); return out; };
  const maxStep = (list, k) => { let m = 0; for (let i = 1; i < list.length; i++) m = Math.max(m, COL.includes(k) ? dist(list[i][k], list[i - 1][k]) : Math.abs(list[i][k] - list[i - 1][k]) / Math.max(Math.abs(list[i - 1][k]), 0.2)); return m; };
  const plain = scan(0);
  for (const mood of [MORNING, EVENING]) {
    const list = scan(mood);
    for (const k of [...COL, ...NUM]) assert.ok(maxStep(list, k) <= maxStep(plain, k) * 2 + 0.012, `${mood < 0 ? 'morning' : 'evening'} ${k}: largest step ${maxStep(list, k).toFixed(4)} against ${maxStep(plain, k).toFixed(4)} for the plain palette`);
  }
});

test('half-way between the moods is half-way between the palettes', () => {
  const m = samplePalette(11, null, MORNING), e = samplePalette(11, null, EVENING), plain = samplePalette(11);
  const half = samplePalette(11, null, -0.5);
  assert.ok(dist(half.hor, plain.hor) > 0.02 && dist(half.hor, m.hor) > dist(half.hor, plain.hor) * 0.5, 'a half morning sits between the plain palette and the morning');
  assert.ok(Math.abs(half.fog - (plain.fog + m.fog) / 2) < 0.15 * plain.fog, `fog ${half.fog.toFixed(4)} between ${plain.fog.toFixed(4)} and ${m.fog.toFixed(4)}`);
  assert.ok(dist(e.hor, m.hor) > 0.2);
});
