"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const E = require("../engine.js");

function gameWithPlayers(count = 4, seed = 0x4d44) {
  return new E.Game({
    playerCount: count,
    firstPlayer: 0,
    players: Array.from({ length: count }, (_, id) => ({ name: `Guest ${id + 1}`, human: false })),
  }, seed);
}

function forceRedMove(game) {
  for (let attempts = 0; attempts < 1000; attempts += 1) {
    const probe = E.RNG.fromState(game.rng.state);
    const sector = E.SPINNER[probe.int(E.SPINNER.length)];
    if (sector.type === "red") {
      game.spin();
      if (game.state.phase === "await-move") return;
    } else {
      game.rng.next();
      game.state.rngState = game.rng.state;
    }
    if (game.state.phase === "await-spin") continue;
    throw new Error(`Unexpected phase while forcing a red move: ${game.state.phase}`);
  }
  throw new Error("Could not force a red move");
}

test("spinner preserves the photographed clockwise outer cycle", () => {
  assert.deepEqual(E.SPINNER.map((entry) => entry.id), [
    "g3", "b6", "g4", "r6-3", "r5-3", "r4-3",
    "r3-4", "r2-4", "r1-4", "g1", "b5", "g2",
    "r1-3", "r2-3", "r3-3", "r4-4", "r5-4", "r6-4",
  ]);
});

test("route advice is deterministic and does not consume spinner randomness", () => {
  const game = gameWithPlayers(4, 0x12345678);
  forceRedMove(game);
  const before = game.rng.state;
  const savedBefore = game.state.rngState;
  const first = game.chooseBestMove(game.state.pending.playerId);
  const second = game.chooseBestMove(game.state.pending.playerId);
  assert.equal(first, second);
  assert.equal(game.rng.state, before);
  assert.equal(game.state.rngState, savedBefore);
});

test("the first bitten guest joins the unclaimed Green piece at its current perch", () => {
  const game = gameWithPlayers(3);
  game.state.green.node = E.PERCHES[4].node;
  game.state.green.perch = 4;
  game.state.draculaIndex = E.DRACULA_TRACK.findIndex((entry) => entry.room === "north");
  game._resolveDraculaBite();
  assert.equal(game.state.green.holder, 0);
  assert.equal(game.state.green.perch, 4);
  assert.equal(game.state.green.node, E.PERCHES[4].node);
  assert.equal(game.state.players[0].node, E.PERCHES[4].node);
});

test("the released mask holder never remains underneath the new Green Vampire", () => {
  const game = gameWithPlayers(3);
  game.state.green.holder = 0;
  game.state.green.node = "w2";
  game.state.green.perch = 1;
  game.state.players[0].status = "green-vampire";
  game.state.players[0].node = "w2";
  game.state.players[1].node = "w1";
  game._transferCurse(1);
  assert.equal(game.state.players[1].node, "w2");
  assert.notEqual(game.state.players[0].node, "w2");
  assert.notEqual(game.state.players[0].node, "w1");
  assert.ok(E.HIDE_NODES.has(game.state.players[0].node));
});

test("restore rejects structurally plausible but contradictory saves", () => {
  const base = gameWithPlayers(4, 987654321).snapshot();

  const unknownNode = structuredClone(base);
  unknownNode.players[1].node = "secret-tunnel";
  assert.throws(() => E.Game.restore(unknownNode), /unknown stone/);

  const brokenGreen = structuredClone(base);
  brokenGreen.green.holder = 1;
  brokenGreen.players[1].status = "human";
  assert.throws(() => E.Game.restore(brokenGreen), /Green holder and player status disagree/);

  const moving = gameWithPlayers(4, 2468);
  forceRedMove(moving);
  const alteredPath = moving.snapshot();
  alteredPath.pending.options[0].path[1] = "home-left";
  assert.throws(() => E.Game.restore(alteredPath), /move path|move option/);

  const wrongWinner = structuredClone(base);
  wrongWinner.phase = "gameover";
  wrongWinner.winner = 0;
  wrongWinner.endReason = "A forged escape";
  assert.throws(() => E.Game.restore(wrongWinner), /winner state is inconsistent/);
});

// --- regressions for the two defects found before this document was published -

test("the crypt is a setback: the vault is nowhere near the HOME run", () => {
  // The shipped board wired the vault straight into the left HOME run
  // (vault-v2-v3-home-left), putting it 3 stones from escape while the START
  // stones sit 11-13 away. Every red sector carries an inner 3 or 4 and both
  // counts landed exactly on home-left, so being carried to the vault was a
  // near-certain win: over 4000 automata games a guest who had been vaulted won
  // ~72% of the time against ~14% for one who never was. The crypt is now a
  // dead-end stair, so a bite costs tempo instead of handing over the game.
  const toHome = Math.min(...[...E.HOME_NODES].map((home) => E.graphDistance("vault", home)));
  assert.ok(toHome >= 8, "the vault must be a long climb from HOME, got " + toHome);

  const startDistances = E.START_NODES.map((start) =>
    Math.min(...[...E.HOME_NODES].map((home) => E.graphDistance(start, home))));
  assert.ok(toHome >= Math.min(...startDistances) - 3,
    "being vaulted must not beat starting the game, vault " + toHome + " vs starts " + startDistances);

  // No single spin may take a vaulted guest home. Guests move the inner count
  // on red, and the spinner offers nothing larger than 6.
  for (let steps = 1; steps <= 6; steps += 1) {
    const reachable = [...E.exactPaths("vault", steps).keys()];
    assert.ok(!reachable.some((node) => E.HOME_NODES.has(node)),
      "a vaulted guest must not reach HOME in one " + steps + "-stone move");
  }

  // The crypt must still be escapable, or a bite would be an elimination.
  assert.ok(E.exactPaths("vault", 3).size > 0, "a vaulted guest must have a legal 3-stone move");
  assert.ok(E.exactPaths("vault", 4).size > 0, "a vaulted guest must have a legal 4-stone move");
});

test("the night seed is mixed, so small Night numbers do not fix the opening seat", () => {
  // RNG took the seed unmixed and the opening seat consumed its very first
  // xorshift32 output, whose high bits are near zero for a small state. Every
  // seed below 1000 opened seat 1, seat 4 could never open a four-player game
  // for any seed below 10000, and the default 1977 always opened seat 1.
  for (const count of [2, 3, 4]) {
    const seen = new Set();
    for (let seed = 1; seed <= 400; seed += 1) seen.add(new E.RNG(seed).int(count));
    assert.equal(seen.size, count,
      "every one of the " + count + " seats must be able to open within the first 400 Night numbers, saw " + [...seen].sort());
  }
  // And the spread must be broadly even rather than merely non-constant.
  const counts = [0, 0, 0, 0];
  for (let seed = 1; seed <= 4000; seed += 1) counts[new E.RNG(seed).int(4)] += 1;
  for (const n of counts) {
    assert.ok(n > 850 && n < 1150,
      "opening seats must be near-uniform over small seeds, got " + counts);
  }
});

test("RNG.fromState resumes a generator exactly, unlike the mixing constructor", () => {
  // The constructor avalanches its argument, so new RNG(rng.state) does NOT
  // reproduce a generator sitting at that state. Save/restore and the test
  // helpers depend on exact resumption; this pins the distinction.
  const live = new E.RNG(1977);
  live.next(); live.next();
  const resumed = E.RNG.fromState(live.state);
  assert.equal(resumed.state, live.state, "fromState must adopt the state verbatim");
  assert.equal(resumed.next(), live.next(), "a resumed generator must produce the same next value");

  const mixed = new E.RNG(live.state);
  assert.notEqual(mixed.state, live.state, "the constructor is expected to mix, not adopt");
});

test("a saved game from the old board layout is refused", () => {
  // The crypt re-cut changed the graph, so version 1 saves describe a
  // different castle and must not resume into this one.
  const game = gameWithPlayers(2, 4242);
  const save = JSON.parse(game.serialize());
  assert.equal(save.version, 2, "the board change must carry a save-format bump");
  save.version = 1;
  assert.throws(() => E.Game.restore(JSON.stringify(save)), /version/i,
    "a version 1 save must be rejected");
});
