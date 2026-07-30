#!/usr/bin/env node
"use strict";

import assert from "node:assert/strict";

await import("./game-core.js");
const Core = globalThis.AfricanStarCore;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function fresh(seed = 0x4d44) { return { seed, rngCounter: 0 }; }
function counts(values) { return values.reduce((out, value) => ((out[value] = (out[value] || 0) + 1), out), {}); }

test("board and token data validate", () => {
  assert.deepEqual(Core.validateData(), []);
  assert.equal(Core.CITIES.length, 32);
  assert.equal(Core.CITIES.filter((city) => city.token).length, 30);
});

test("the 70th-edition token mix is exact", () => {
  assert.deepEqual(counts(Core.TOKEN_POOL), {
    star: 1, ruby: 2, emerald: 3, topaz: 4,
    horseshoe: 5, leopard: 3, blank: 12,
  });
});

test("a seed creates a deterministic but complete layout", () => {
  const a = Core.createTokenLayout(fresh(12345));
  const b = Core.createTokenLayout(fresh(12345));
  const c = Core.createTokenLayout(fresh(12346));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(Core.tokenCounts(a), counts(Core.TOKEN_POOL));
});

test("die rolls are deterministic and always 1–6", () => {
  const a = fresh(99), b = fresh(99);
  const seqA = Array.from({ length: 50 }, () => Core.rollDie(a));
  const seqB = Array.from({ length: 50 }, () => Core.rollDie(b));
  assert.deepEqual(seqA, seqB);
  assert(seqA.every((value) => value >= 1 && value <= 6));
  assert(new Set(seqA).size >= 5);
});

test("opening order is descending, deterministic, and resolves every tie", () => {
  const players = Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}` }));
  const a = Core.resolveOpeningOrder(players, fresh(0));
  const b = Core.resolveOpeningOrder(players, fresh(0));
  assert.deepEqual(a.entries.map((entry) => [entry.player.id, entry.rolls]), b.entries.map((entry) => [entry.player.id, entry.rolls]));
  assert.deepEqual(new Set(a.order.map((player) => player.id)), new Set(players.map((player) => player.id)));
  assert(a.ties.length >= 1, "seed 0 deliberately exercises repeated ties");
  for (let index = 0; index < a.entries.length - 1; index++) {
    const left = a.entries[index].rolls;
    const right = a.entries[index + 1].rolls;
    const firstDifference = left.findIndex((roll, rollIndex) => roll !== right[rollIndex]);
    assert(firstDifference >= 0, "adjacent places must eventually be separated by a re-roll");
    assert(left[firstDifference] > right[firstDifference], `${left.join("→")} must rank before ${right.join("→")}`);
  }
});

test("every city is reachable from both starting cities", () => {
  for (const start of Core.STARTS) {
    for (const city of Core.CITIES) {
      assert(Number.isFinite(Core.shortestDistance(start, city.id, ["land", "sea"])), `${city.id} from ${start}`);
    }
  }
});

test("land movement may stop early at a city but not an intermediate dot", () => {
  const options = Core.findMovementOptions("tangier", "land", 4);
  const byEnd = new Map(options.map((option) => [option.end, option]));
  assert(byEnd.has("morocco"), "Morocco is an early city stop");
  assert.equal(byEnd.get("morocco").distance, 2);
  assert(options.some((option) => option.exact && option.distance === 4));
  assert(!options.some((option) => !option.exact && Core.GRAPH.nodes[option.end].kind !== "city"));
});

test("sea movement stops at the first port even when the die is larger", () => {
  const options = Core.findMovementOptions("tangier", "sea", 6);
  assert(options.some((option) => option.end === "canary" && option.distance === 4));
  assert(!options.some((option) => option.end === "capeVerde"), "cannot sail through the first red port in one turn");
});

test("working passage is exactly two sea spaces without a die value", () => {
  assert.equal(Core.FREE_PASSAGE_STEPS, 2);
  const options = Core.findMovementOptions("tangier", "sea", Core.FREE_PASSAGE_STEPS);
  assert(options.length > 0);
  assert(options.every((option) => option.distance <= Core.FREE_PASSAGE_STEPS));
  assert(!options.some((option) => option.end === "canary"));
});

test("the marked Sahara and Saint Helena route dots carry traps", () => {
  const traps = Object.values(Core.GRAPH.nodes).filter((node) => node.trap);
  assert(traps.some((node) => node.trap === "sahara"));
  assert(traps.filter((node) => node.trap === "pirates").length >= 2);
});

test("gems pay their printed value and double on the Gold Coast", () => {
  const regular = { money: 0 };
  const coast = { money: 0 };
  assert.equal(Core.applyToken(regular, "ruby", { city: Core.GRAPH.cities.congo }).moneyDelta, 1000);
  assert.equal(regular.money, 1000);
  assert.equal(Core.applyToken(coast, "emerald", { city: Core.GRAPH.cities.goldCoast }).moneyDelta, 1200);
  assert.equal(coast.money, 1200);
});

test("a leopard takes all cash, including the zero-cash edge case", () => {
  const rich = { money: 1300 };
  const poor = { money: 0 };
  assert.equal(Core.applyToken(rich, "leopard", {}).moneyDelta, -1300);
  assert.equal(rich.money, 0);
  assert.equal(Object.is(Core.applyToken(poor, "leopard", {}).moneyDelta, -0), false);
});

test("horseshoes only become race pieces after the Star is found", () => {
  const early = { money: 300, hasHorseshoe: false };
  const late = { money: 300, hasHorseshoe: false };
  Core.applyToken(early, "horseshoe", { starAlreadyFound: false });
  Core.applyToken(late, "horseshoe", { starAlreadyFound: true });
  assert.equal(early.hasHorseshoe, false);
  assert.equal(late.hasHorseshoe, true);
});

test("the Star is carried by its finder", () => {
  const player = { money: 300, hasStar: false };
  const result = Core.applyToken(player, "star", {});
  assert.equal(player.hasStar, true);
  assert.equal(result.starFound, true);
});

test("the historical and modern coast delays are configurable", () => {
  const classic = { money: 300, skipTurns: 0 };
  const modern = { money: 300, skipTurns: 0 };
  const softened = { money: 300, skipTurns: 0 };
  Core.applyToken(classic, "blank", { city: Core.GRAPH.cities.bightBenin });
  Core.applyToken(modern, "blank", { city: Core.GRAPH.cities.bightBenin, coastDelay: 1 });
  Core.applyToken(softened, "blank", { city: Core.GRAPH.cities.bightBenin, coastDelay: 0 });
  assert.equal(classic.skipTurns, 3);
  assert.equal(modern.skipTurns, 1);
  assert.equal(softened.skipTurns, 0);
});

test("Cape Town's bonus is awarded once only", () => {
  const state = { capeTownClaimed: null };
  const first = { id: "a", money: 0 };
  const second = { id: "b", money: 0 };
  assert.equal(Core.claimCapeTown(first, state), 500);
  assert.equal(Core.claimCapeTown(second, state), 0);
  assert.equal(first.money, 500);
  assert.equal(second.money, 0);
  assert.equal(state.capeTownClaimed, "a");
});

test("either race piece wins at either starting city", () => {
  assert.deepEqual(Core.winnerAtStart({ id: "a", node: "cairo", hasStar: true }), { type: "star", playerId: "a" });
  assert.deepEqual(Core.winnerAtStart({ id: "b", node: "tangier", hasHorseshoe: true }), { type: "horseshoe", playerId: "b" });
  assert.equal(Core.winnerAtStart({ id: "c", node: "morocco", hasStar: true }), null);
});

test("nearestStart returns a usable route", () => {
  const nearest = Core.nearestStart("capeTown");
  assert(Core.STARTS.includes(nearest.start));
  assert(Number.isFinite(nearest.distance));
  assert.equal(nearest.nodes[0], "capeTown");
  assert.equal(nearest.nodes.at(-1), nearest.start);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      process.stdout.write(`✓ ${name}\n`);
    } catch (error) {
      failed++;
      process.stderr.write(`✗ ${name}\n${error.stack}\n`);
    }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} tests passed\n`);
  process.exitCode = failed ? 1 : 0;
})();
