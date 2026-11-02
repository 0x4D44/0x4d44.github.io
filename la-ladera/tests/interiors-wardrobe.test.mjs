// INTERIORS: what lies about (round 6, item 4: R4-309, R4-310, R4-211). 72% of the loose clothes of the barrio were shorts, socks, underwear and crop tops, 17 designs of the 286 the three libraries hold.
// garments.js mixOf draws the staples (MIX) and, by who lives in the house, the teen cuts of the young (jeans, joggers, hoodies, a jacket, dresses; the school's uniform where a teenager lives) and the
// child cuts where children do (EXTRAS). Held to: every id the tables name is a garment with the pose of its place (a hook takes a hung one) and none is swimwear; a house gets the cuts of the people
// who live there and no others; the extras are the share of the draws asked for; in the barrio the four named kinds are under half of what lies about (they were 74%), over twice as many designs
// as before are seen (17), no one design is a fifth of it, and each of the three libraries is in use; a room leaves at most one pair of shoes about (a pair fits every gap that fits nothing else, so
// they would be a floor of them); a bed too crowded for another garment laid out takes one folded. (The rails test, interiors-rails.test.mjs, still holds the tops, shorts and leggings to 45% and socks and underwear to 45%.)
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-wardrobe.test.mjs
//   A3_LIST=40 shows more of a failing list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, catalogOf } from './interiors-lib.mjs';
import { GARMENTS } from '../js/interiors/garments_data.js';
import { MIX, EXTRAS, EXTRA_SHARE, mixOf, wardrobeOf, extraIds } from '../js/interiors/garments.js';

const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const sum = (list) => list.reduce((n, m) => n + m[1], 0);
const PLACES = { bed: 'b', seat: 's', hung: 'h', floor: 'f', bath: 'w' };
const SWIM = /swim|bikini|rash|trunks/;
const HOUSES = {
  grownups: { kind: 'couple', kids: 0, teen: false },
  elders: { kind: 'elder', kids: 0, teen: false },
  students: { kind: 'students', kids: 0, teen: false },
  children: { kind: 'family', kids: 2, teen: false },
  teenager: { kind: 'family', kids: 2, teen: true },
};

test('the tables: every id a mix or an extras row names is a garment with the pose of its place, and none is swimwear', () => {
  const problems = [], seen = (id, place, what) => {
    const g = GARMENTS[id];
    if (!g) return problems.push(`${what}: ${id} is not a garment of the libraries`);
    if (!g.flat) problems.push(`${what}: ${id} has no flat pose`);
    if (place === 'hung' && !g.hung) problems.push(`${what}: ${id} has no hung pose, a hook takes it`);
    if (SWIM.test(id)) problems.push(`${what}: ${id} is swimwear (a hillside at 2 000 m)`);
  };
  for (const [place, list] of Object.entries(MIX)) {
    assert.ok(place in PLACES, `MIX.${place}: not a place`);
    assert.equal(new Set(list.map((m) => m[0])).size, list.length, `MIX.${place}: an id twice`);
    for (const [id, w] of list) { seen(id, place, `MIX.${place}`); if (!(w > 0)) problems.push(`MIX.${place}: ${id} weighs ${w}`); }
  }
  for (const [group, rows] of Object.entries(EXTRAS)) {
    assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, `EXTRAS.${group}: a row twice`);
    for (const [id, w, at] of rows) {
      if (!(w > 0)) problems.push(`EXTRAS.${group}: ${id} weighs ${w}`);
      if (!/^[bshfw]+$/.test(at) || new Set(at).size !== at.length) problems.push(`EXTRAS.${group}: ${id} lies at '${at}'`);
      const both = extraIds(id, { teen: true }), grown = extraIds(id, { teen: false });
      if (GARMENTS[id]) assert.deepEqual([both, grown], [[id], [id]], `${id}: a whole id is itself`);
      else assert.deepEqual([both, grown], [[`${id}_small`, `${id}_big`], [`${id}_big`]], `${id}: a teen style takes the size classes of the house`);
      for (const g of both) for (const [place, letter] of Object.entries(PLACES)) if (at.includes(letter)) seen(g, place, `EXTRAS.${group}`);
    }
  }
  report(problems, 'table problems');
  assert.ok(EXTRAS.everyday.length >= 12 && EXTRAS.school.length >= 4 && EXTRAS.children.length >= 12, 'the extras have shrunk');
  assert.ok(Object.values(EXTRA_SHARE).every((v) => v > 0 && v < 1), 'a share outside (0, 1)');
});

test('mixOf: a house gets the cuts of those who live there, scaled to the share of the draws asked for, on top of the unchanged staples', () => {
  const ids = (mix) => mix.map((m) => m[0]);
  for (const [name, hh] of Object.entries(HOUSES)) for (const place of Object.keys(PLACES)) {
    const mix = mixOf(place, hh), base = MIX[place], w = wardrobeOf(hh), tag = `${name}/${place}`;
    assert.deepEqual(mix.slice(0, base.length), base, `${tag}: the staples are what MIX says, first`);
    assert.equal(new Set(ids(mix)).size, mix.length, `${tag}: an id twice`);
    const share = (EXTRA_SHARE.base + (w.teen ? EXTRA_SHARE.teen : 0) + (w.kids ? EXTRA_SHARE.kids : 0)) * (w.elder ? EXTRA_SHARE.elder : 1);
    const extra = sum(mix.slice(base.length)) / sum(mix);
    assert.ok(Math.abs(extra - share) < 1e-9, `${tag}: the extras are ${(100 * extra).toFixed(2)}% of the draws, asked ${(100 * share).toFixed(2)}%`);
    for (const id of ids(mix)) if (place === 'hung') assert.ok(GARMENTS[id].hung, `${tag}: ${id} cannot hang`);
    const child = ids(mix).some((id) => id.startsWith('child_')), small = ids(mix).some((id) => /^teen_.*_small$/.test(id)), school = ids(mix).some((id) => id.startsWith('teen_school_'));
    const big = ids(mix).some((id) => /^teen_.*_big$/.test(id));
    assert.equal(child, w.kids, `${tag}: the children's cuts are in the mix of a house with children, and only there`);
    if (!w.teen) assert.equal(small || school, false, `${tag}: the young's small size or the school's uniform in a house with no teenager`);
    assert.ok(big, `${tag}: the grown-up size of the teen cuts is in every house`);
  }
  // a place with extras for the whole house (jeans on a bathroom floor) and one without (sandals on a hook): the letters of the rows
  assert.ok(mixOf('floor', HOUSES.grownups).some((m) => m[0] === 'teen_sandals_pair_big') && !mixOf('hung', HOUSES.grownups).some((m) => /sandals|shoes/.test(m[0])), 'footwear lies on the floor and hangs nowhere');
  const teen = mixOf('floor', HOUSES.teenager), weight = (id) => teen.find((m) => m[0] === id)?.[1];
  assert.ok(weight('teen_denim_jeans_small') > 0 && weight('teen_denim_jeans_small') === weight('teen_denim_jeans_big'), 'a teenager\'s house splits a style over the two sizes evenly');
  assert.equal(mixOf('bath', HOUSES.elders).length, mixOf('bath', HOUSES.grownups).length, 'an elder\'s house has the same designs, fewer of them drawn');
  assert.ok(sum(mixOf('floor', HOUSES.elders).slice(MIX.floor.length)) / sum(mixOf('floor', HOUSES.elders)) < sum(mixOf('floor', HOUSES.grownups).slice(MIX.floor.length)) / sum(mixOf('floor', HOUSES.grownups)), 'an elder\'s house draws fewer extras');
});

// ---------------------------------------------------------------- the barrio
const { bps } = await furnishedBatch({ real: true });
const rows = [];
for (const bp of bps) {
  const hhs = new Map((bp.interior?.hh ?? []).map((h) => [h.id, h]));
  for (const f of bp.furniture) {
    const c = catalogOf(f); if (c?.arch !== 'garment') continue;
    rows.push({ bp, f, id: c.garment, g: GARMENTS[c.garment], hh: hhs.get(bp.interior?.rooms?.[f.room]?.hh) });
  }
}
const FOUR = new Set(['shorts', 'socks_pair', 'sock_single', 'underwear', 'briefs', 'boxers', 'panties', 'knickers', 'high_leg_knickers', 'thong', 'bra', 'crop_top']);   // R4-309/310: shorts, socks, underwear, crop tops
const BAR = { four: 0.46, designs: 40, largest: 0.20, library: 0.08 };

test('the barrio: shorts, socks, underwear and crop tops are under half of what lies about, many designs are seen, no one is a fifth, and each library is in use', () => {
  const n = rows.length, share = (k) => k / n, by = {};
  for (const r of rows) by[r.id] = (by[r.id] ?? 0) + 1;
  const four = rows.filter((r) => FOUR.has(r.id)).length, top = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const libs = {}; for (const r of rows) libs[r.g.sizeTag] = (libs[r.g.sizeTag] ?? 0) + 1;
  console.log(`# clothes: ${n} garments, ${Object.keys(by).length} designs; shorts, socks, underwear and crop tops ${(100 * share(four)).toFixed(0)}%; ${top[0][0]} ${(100 * share(top[0][1])).toFixed(0)}%; by library ${Object.entries(libs).map(([k, v]) => `${k} ${(100 * share(v)).toFixed(0)}%`).join(', ')}`);
  assert.ok(n >= 400, `${n} garments`);
  assert.ok(share(four) <= BAR.four, `shorts, socks, underwear and crop tops are ${(100 * share(four)).toFixed(0)}% of the clothes (R4-309: 72%); the bar is ${100 * BAR.four}%`);
  assert.ok(Object.keys(by).length >= BAR.designs, `${Object.keys(by).length} designs lie about; the bar is ${BAR.designs} (it was 17)`);
  assert.ok(share(top[0][1]) <= BAR.largest, `${top[0][0]} is ${(100 * share(top[0][1])).toFixed(0)}% of the clothes; the bar is ${100 * BAR.largest}%`);
  for (const lib of ['adult', 'child', 'teen']) assert.ok(share(libs[lib] ?? 0) >= BAR.library, `the ${lib} library is ${(100 * share(libs[lib] ?? 0)).toFixed(1)}% of the clothes; the bar is ${100 * BAR.library}%`);
});

test('the barrio: a room leaves at most one pair of shoes about, and shoes are a few of the clothes, not a floor of them', () => {
  const FOOT = /(^|_)(sandals|shoes)(_|$)/, perRoom = new Map();
  for (const { bp, f, id } of rows) if (FOOT.test(id)) perRoom.set(`${bp.id} ${f.room}`, (perRoom.get(`${bp.id} ${f.room}`) ?? 0) + 1);
  const pairs = [...perRoom.values()].reduce((n, k) => n + k, 0);
  console.log(`# shoes: ${pairs} pairs in ${perRoom.size} rooms, ${(100 * pairs / rows.length).toFixed(1)}% of the clothes`);
  report([...perRoom].filter(([, k]) => k > 1).map(([room, k]) => `${room}: ${k} pairs of shoes`), 'rooms with more than a pair of shoes about');
  assert.ok(pairs >= 8, `${pairs} pairs of shoes in the barrio: none are left about`);
  assert.ok(pairs / rows.length <= 0.10, `${pairs} of ${rows.length} clothes are shoes: a floor of them (a pair fits every gap that fits nothing else)`);
});

test('the barrio: a bed too crowded for another garment laid out takes one folded, inside the sheet', () => {
  let folded = 0, beds = 0;
  const problems = [];
  for (const { bp, f } of rows) {
    const c = catalogOf(f), par = bp.furniture.find((x) => x.id === f.parent), pc = par && catalogOf(par);
    if (!pc || !['bed', 'mattress'].includes(pc.arch)) continue;
    beds++;
    if (c.state !== 'folded') continue;
    folded++;
    if (Math.abs(f.y - (par.y + pc.size[1] + (pc.topAdd ?? 0))) > 0.005) problems.push(`${bp.id} ${f.room}: a folded ${c.garment} is not on the bed's top`);
  }
  report(problems, 'folded garments off the bed');
  console.log(`# beds: ${beds} garments on beds, ${folded} of them folded`);
  assert.ok(beds >= 80, `${beds} garments on beds`);
  assert.ok(folded >= 15, `${folded} folded garments on beds: a crowded bed takes none`);
});

test('the barrio: the child cuts lie only where children live, and the teenager\'s small size and the school\'s uniform only where a teenager does', () => {
  const problems = [];
  for (const { bp, f, id, hh } of rows) {
    if (id.startsWith('child_') && !(hh?.kids > 0)) problems.push(`${bp.id} ${f.room}: ${id} in a house with ${hh?.kids ?? '?'} children`);
    if ((/^teen_.*_small$/.test(id) || id.startsWith('teen_school_')) && !hh?.teen) problems.push(`${bp.id} ${f.room}: ${id} in a house with no teenager`);
  }
  report(problems, 'cuts in the wrong house');
  const count = (re) => rows.filter((r) => re.test(r.id)).length;
  assert.ok(count(/^child_/) >= 25 && count(/^teen_.*_small$/) >= 6 && count(/^teen_school_/) >= 5 && count(/^teen_.*_big$/) >= 20, `child ${count(/^child_/)}, teen small ${count(/^teen_.*_small$/)}, school ${count(/^teen_school_/)}, teen big ${count(/^teen_.*_big$/)}: the cuts are hardly seen`);
});
