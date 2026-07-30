#!/usr/bin/env node
"use strict";

const E = require("../engine.js");

const requested = Number(process.argv[2] || 5000);
const runs = Number.isInteger(requested) && requested > 0 ? requested : 5000;
const limit = 1600;
const winsBySeat = [0, 0, 0, 0];
const actionCounts = [];
let completed = 0;
let stalled = 0;
let totalBites = 0;
let totalCursePasses = 0;
let maximumRounds = 0;
const spinnerCounts = Object.fromEntries(E.SPINNER.map((sector) => [sector.id, 0]));

function makeGame(seed) {
  return new E.Game({
    playerCount: 4,
    players: Array.from({ length: 4 }, (_, id) => ({ name: `Guest ${id + 1}`, human: false })),
  }, seed);
}

for (let index = 1; index <= runs; index += 1) {
  let game = makeGame(Math.imul(index, 7919) >>> 0);
  let actions = 0;
  while (game.state.winner == null && actions < limit) {
    if (game.state.phase === "await-spin") {
      const result = game.spin();
      spinnerCounts[result.outcome.id] += 1;
    } else if (game.state.phase === "await-move") {
      game.chooseMove(game.chooseBestMove(game.state.pending.playerId));
    } else if (game.state.phase === "await-victim") {
      game.chooseVictim(game.chooseBestVictim());
    } else {
      throw new Error(`Unexpected phase ${game.state.phase} for seed ${index}`);
    }
    actions += 1;
    if (index <= 400 && actions % 5 === 0) {
      game = E.Game.restore(game.serialize());
    }
  }

  if (game.state.winner == null) {
    stalled += 1;
    continue;
  }
  completed += 1;
  winsBySeat[game.state.winner] += 1;
  actionCounts.push(actions);
  totalBites += game.state.stats.bites;
  totalCursePasses += game.state.stats.cursePasses;
  maximumRounds = Math.max(maximumRounds, game.state.round);
}

actionCounts.sort((a, b) => a - b);
const sum = actionCounts.reduce((total, value) => total + value, 0);
const percentile = (fraction) => actionCounts[Math.min(actionCounts.length - 1, Math.floor((actionCounts.length - 1) * fraction))] || 0;
const result = {
  runs,
  completed,
  stalled,
  winsBySeat,
  meanActions: Number((sum / Math.max(1, completed)).toFixed(2)),
  medianActions: percentile(0.5),
  p95Actions: percentile(0.95),
  p99Actions: percentile(0.99),
  maximumActions: actionCounts[actionCounts.length - 1] || 0,
  maximumRounds,
  meanDraculaBites: Number((totalBites / Math.max(1, completed)).toFixed(3)),
  meanCursePasses: Number((totalCursePasses / Math.max(1, completed)).toFixed(3)),
  spinnerMinimum: Math.min(...Object.values(spinnerCounts)),
  spinnerMaximum: Math.max(...Object.values(spinnerCounts)),
  spinnerCounts,
};

console.log(JSON.stringify(result, null, 2));
if (stalled !== 0) process.exitCode = 1;
