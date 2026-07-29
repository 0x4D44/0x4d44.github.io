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
    const probe = new E.RNG(game.rng.state);
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
