"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const E = require("../engine.js");

function gameWithPlayers(count = 2, seed = 1234) {
  return new E.Game({
    playerCount: count,
    firstPlayer: 0,
    players: Array.from({ length: count }, (_, id) => ({ name: `Player ${id + 1}`, human: false })),
  }, seed);
}

function forceSpin(game, predicate) {
  // Advance RNG state until the next sector matches. Tests use this only to
  // exercise public spin(), not to alter production rules.
  for (let attempts = 0; attempts < 1000; attempts += 1) {
    const probe = new E.RNG(game.rng.state);
    const index = probe.int(E.SPINNER.length);
    if (predicate(E.SPINNER[index])) return game.spin();
    game.rng.next();
    game.state.rngState = game.rng.state;
  }
  throw new Error("Could not force desired spinner result");
}

test("castle graph is connected and every perch sits on a valid stone", () => {
  assert.equal(Object.keys(E.NODES).length, 60);
  const seen = new Set(["s0"]);
  const queue = ["s0"];
  while (queue.length) {
    const at = queue.shift();
    for (const next of E.ADJACENCY[at]) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.equal(seen.size, Object.keys(E.NODES).length);
  for (const perch of Object.values(E.PERCHES)) assert.ok(E.NODES[perch.node]);
});

test("spinner contains the reconstructed eighteen equal sectors", () => {
  assert.equal(E.SPINNER.length, 18);
  assert.equal(E.SPINNER.filter((entry) => entry.type === "red").length, 12);
  assert.deepEqual(E.SPINNER.filter((entry) => entry.colour === "green").map((entry) => entry.outer).sort(), [1, 2, 3, 4]);
  assert.deepEqual(E.SPINNER.filter((entry) => entry.colour === "blue").map((entry) => entry.outer).sort(), [5, 6]);
  for (let n = 1; n <= 6; n += 1) {
    assert.equal(E.SPINNER.filter((entry) => entry.type === "red" && entry.outer === n).length, 2);
  }
});

test("exact movement never revisits a stone and HOME ends a route", () => {
  const paths = E.exactPaths("v3", 4, { green: false });
  for (const [destination, path] of paths) {
    assert.equal(new Set(path).size, path.length);
    if (destination.startsWith("home")) assert.equal(path[path.length - 1], destination);
    assert.equal(path.length, 5);
  }
});

test("Green Vampire cannot cross candle barriers", () => {
  const human = E.exactPaths("w4", 1, { green: false });
  const green = E.exactPaths("w4", 1, { green: true });
  assert.ok(human.has("c1"));
  assert.ok(!green.has("c1"));
});

test("first Dracula bite creates the Green Vampire; later bites return to vault", () => {
  const game = gameWithPlayers(3);
  game.state.draculaIndex = E.DRACULA_TRACK.findIndex((entry) => entry.room === "north");
  game._resolveDraculaBite();
  assert.equal(game.state.green.holder, 0);
  assert.equal(game.state.players[0].status, "green-vampire");
  assert.equal(game.state.players[0].node, E.PERCHES[1].node);

  game.state.players[1].node = "n3";
  game._resolveDraculaBite();
  assert.equal(game.state.players[1].node, "vault");
  assert.equal(game.state.stats.vaultReturns, 1);
});

test("Green Vampire passes the curse and releases former holder into cover", () => {
  const game = gameWithPlayers(3);
  game.state.green.holder = 0;
  game.state.green.node = "lw0";
  game.state.players[0].status = "green-vampire";
  game.state.players[0].node = "lw0";
  game.state.players[1].node = "lw6";
  game._transferCurse(1);
  assert.equal(game.state.green.holder, 1);
  assert.equal(game.state.players[1].status, "green-vampire");
  assert.equal(game.state.players[0].status, "human");
  assert.ok(E.HIDE_NODES.has(game.state.players[0].node));
  assert.equal(E.NODES[game.state.players[0].node].room, "rose");
});

test("Blue Vampire sends one exposed guest to the vault but cannot see a hidey-hole", () => {
  const game = gameWithPlayers(3);
  game.state.blue.node = "g3";
  game.state.players[0].node = "x2";
  game.state.players[1].node = "g3"; // hidey-hole/perch 5
  const victim = game._resolveBlueCapture();
  assert.equal(victim, 0);
  assert.equal(game.state.players[0].node, "vault");
  assert.equal(game.state.players[1].node, "g3");
});

test("a legal move into HOME ends the game", () => {
  const game = gameWithPlayers(2);
  game.state.players[0].node = "v3";
  game.state.phase = "await-move";
  game.state.pending = {
    kind: "move",
    playerId: 0,
    steps: 1,
    green: false,
    options: [{ destination: "home-left", path: ["v3", "home-left"] }],
  };
  game.chooseMove("home-left");
  assert.equal(game.state.winner, 0);
  assert.equal(game.state.phase, "gameover");
});


test("the night seed chooses a deterministic opening player and rounds return to that seat", () => {
  const config = {
    playerCount: 4,
    players: Array.from({ length: 4 }, (_, id) => ({ name: `Guest ${id + 1}`, human: false })),
  };
  const a = new E.Game(config, 0x12345678);
  const b = new E.Game(config, 0x12345678);
  assert.equal(a.state.startingPlayer, b.state.startingPlayer);
  assert.equal(a.state.currentPlayer, a.state.startingPlayer);
  const start = a.state.startingPlayer;
  for (let n = 0; n < 4; n += 1) a._endTurn();
  assert.equal(a.state.currentPlayer, start);
  assert.equal(a.state.round, 2);
});

test("the Green Vampire cannot escape while wearing the mask", () => {
  const game = gameWithPlayers(2);
  game.state.green.holder = 0;
  game.state.green.node = "x1";
  game.state.players[0].status = "green-vampire";
  game.state.players[0].node = "x1";
  game.state.players[1].node = "w2"; // protected from Dracula while we force the spin
  game.state.phase = "await-spin";
  const result = forceSpin(game, (entry) => entry.type === "red" && entry.inner === 3);
  assert.equal(result.outcome.inner, 3);
  assert.equal(game.state.phase, "await-move");
  assert.ok(!game.state.pending.options.some((option) => E.HOME_NODES.has(option.destination)));
  assert.ok(E.exactPaths("x1", 3, { green: true }).has("home-left"), "HOME would otherwise be exactly reachable");
});

test("save/restore preserves deterministic continuation", () => {
  const a = gameWithPlayers(2, 0x12345678);
  const first = a.spin();
  if (a.state.phase === "await-move") a.chooseMove(a.chooseBestMove(0));
  const b = E.Game.restore(a.serialize());
  const resultA = a.spin();
  const resultB = b.spin();
  assert.deepEqual(resultA.outcome, resultB.outcome);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test("red spinner result creates exact 3/4-stone move options", () => {
  const game = gameWithPlayers(2, 999);
  const result = forceSpin(game, (entry) => entry.type === "red");
  assert.ok([3, 4].includes(result.outcome.inner));
  if (game.state.phase === "await-move") {
    assert.ok(game.state.pending.options.length > 0);
    for (const option of game.state.pending.options) {
      assert.equal(option.path.length, result.outcome.inner + 1);
    }
  }
});

test("AI-only games reach an exit under many deterministic seeds", () => {
  let completed = 0;
  const winners = new Set();
  for (let seed = 1; seed <= 80; seed += 1) {
    const game = gameWithPlayers(4, seed * 7919);
    let actions = 0;
    while (game.state.winner == null && actions < 1600) {
      if (game.state.phase === "await-spin") game.spin();
      else if (game.state.phase === "await-move") game.chooseMove(game.chooseBestMove(game.state.pending.playerId));
      else if (game.state.phase === "await-victim") game.chooseVictim(game.chooseBestVictim());
      else throw new Error(`Unexpected phase ${game.state.phase}`);
      actions += 1;
    }
    if (game.state.winner != null) {
      completed += 1;
      winners.add(game.state.winner);
    }
  }
  assert.ok(completed >= 76, `only ${completed}/80 simulations completed`);
  assert.ok(winners.size >= 3, `only ${winners.size} player seats won`);
});
