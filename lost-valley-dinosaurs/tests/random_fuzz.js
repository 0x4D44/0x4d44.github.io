"use strict";

const assert = require("node:assert/strict");
const { Game } = require("../engine.js");

class FuzzRng {
  constructor(seed) { this.state = (seed >>> 0) || 0x9e3779b9; }
  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  int(n) { return n > 0 ? Math.floor(this.next() * n) : 0; }
  pick(items) { return items.length ? items[this.int(items.length)] : null; }
  chance(p) { return this.next() < p; }
}

function randomSecretAction(game, rng) {
  const options = [];
  for (const explorer of game.explorersFor(game.state.currentPlayer)) {
    if (!game.canUseSecret(explorer)) continue;
    for (const destination of game.secretDestinations(explorer.id)) options.push({ explorer, destination });
  }
  const choice = rng.pick(options);
  if (!choice) return false;
  game.useSecretPath(choice.explorer.id, choice.destination);
  return true;
}

function stepRandomly(game, rng, coverage) {
  const s = game.state;
  coverage.phases.add(s.phase);

  if (s.phase === "pass") return game.readyNextTurn();
  if (s.phase === "draw") {
    const card = game.drawCard();
    coverage.cards.add(card.type);
    coverage.cardCounts[card.type] = (coverage.cardCounts[card.type] || 0) + 1;
    return true;
  }

  if (s.phase === "event") {
    const p = s.pending;
    if (!p) { game.finishEvent(); game.commit(); return true; }
    coverage.events.add(`${p.type}:${p.stage || p.mode || "resolve"}`);

    if (p.type === "lava") {
      if (p.mode === "remove") {
        const options = game.removableLavaCells();
        assert(options.length, "lava relocation has no removable counter");
        return game.removeLava(rng.pick(options));
      }
      const options = game.legalLavaPlacements();
      if (!options.length) { game.finishEvent("The lava has nowhere legal to spread."); game.commit(); return true; }
      return game.placeLava(rng.pick(options));
    }

    if (p.type === "pteranodon") {
      if (p.stage === "select-explorer") {
        const options = game.pteranodonEligibleExplorers();
        if (!options.length || rng.chance(0.08)) return game.skipPteranodon();
        game.selectPteranodonExplorer(rng.pick(options).id);
        return true;
      }
      const options = game.legalPteranodonDestinations(p.explorer);
      if (!options.length) return game.skipPteranodon();
      game.placePteranodon(rng.pick(options));
      return true;
    }

    if (p.type === "swamp-fall") {
      if (p.stage === "select-explorer") {
        const options = game.explorersFor(s.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
        game.selectSwampVictim(rng.pick(options).id);
      } else game.placeSwampVictim(rng.pick(game.legalSwampPlacements()));
      return true;
    }

    if (p.type === "swamp-escape") {
      if (p.stage === "select-explorer") {
        const options = game.explorersFor(s.currentPlayer).filter((e) => e.status === "swamp");
        game.selectSwampEscape(rng.pick(options).id);
      } else game.placeSwampEscape(rng.pick(p.targets));
      return true;
    }

    if (p.type === "water") {
      if (p.stage === "select-explorer") {
        const options = game.explorersFor(s.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
        game.selectWaterExplorer(rng.pick(options).id);
      } else if (p.stage === "select-water") game.placeWaterExplorer(rng.pick(p.targets).cell);
      else game.placeWaterFailure(rng.pick(p.targets).cell);
      return true;
    }

    if (p.type === "fight") {
      if (p.stage === "select-explorer") game.selectFightExplorer(rng.pick(game.fightEligible()).id);
      else game.placeFightEscape(rng.pick(p.targets));
      return true;
    }

    if (p.type === "dinosaur") {
      if (p.capture) return game.selectCaptureLair(rng.pick(game.availableCaptureLairs()));
      if (!p.selected) {
        const options = game.availableDinosaurs();
        if (!options.length) return game.skipDinosaurTask();
        game.selectDinosaur(rng.pick(options).id);
        return true;
      }
      const options = game.legalDinosaurSteps(p.selected);
      assert(options.length, "selected dinosaur lost every prevalidated route");
      game.moveDinosaurStep(rng.pick(options));
      return true;
    }

    throw new Error(`Unhandled event ${p.type}`);
  }

  if (s.phase === "movement") {
    const player = game.currentPlayer();
    if (player.secretCards.length && rng.chance(0.18) && randomSecretAction(game, rng)) return true;
    if (player.gunCards.length && player.bullets > 0 && rng.chance(0.16)) { game.startBullet(); return true; }
    const options = game.explorersFor(s.currentPlayer).filter((e) => game.canMoveExplorer(e));
    if (!options.length) { game.endTurn(); return true; }
    game.selectExplorer(rng.pick(options).id);
    return true;
  }

  if (s.phase === "await-roll") { game.rollMovement(); return true; }

  if (s.phase === "moving") {
    const options = game.legalExplorerSteps();
    if (game.canEscapeValley() && (!options.length || rng.chance(0.42))) { game.escapeValley(); return true; }
    if (!options.length) { game.finishMovement(false); game.commit(); return true; }
    game.moveExplorerStep(rng.pick(options));
    return true;
  }

  if (s.phase === "post-move") {
    const player = game.currentPlayer();
    if (player.secretCards.length && rng.chance(0.16) && randomSecretAction(game, rng)) return true;
    if (player.gunCards.length && player.bullets > 0 && rng.chance(0.20)) { game.startBullet(); return true; }
    game.endTurn();
    return true;
  }

  if (s.phase === "bullet") {
    const p = s.pending;
    coverage.events.add(`bullet:${p.stage}`);
    if (p.stage === "select-dinosaur") {
      const options = s.dinosaurs.filter((d) => game.legalBulletDestinations(d.id).length);
      if (!options.length || rng.chance(0.08)) return game.cancelBullet();
      game.selectBulletDinosaur(rng.pick(options).id);
      return true;
    }
    if (p.stage === "move") {
      const options = game.legalBulletDestinations(p.dinosaur);
      if (!options.length || rng.chance(0.04)) return game.cancelBullet();
      game.moveBulletDinosaur(rng.pick(options));
      return true;
    }
    game.selectBulletCaptureLair(rng.pick(game.availableBulletCaptureLairs()));
    return true;
  }

  if (s.phase === "game-over") return false;
  throw new Error(`Unhandled phase ${s.phase}`);
}

const coverage = {
  phases: new Set(),
  events: new Set(),
  cards: new Set(),
  cardCounts: {},
};
const outcomes = [];
const games = Number(process.env.FUZZ_GAMES || 240);
const randomActionBudget = Number(process.env.FUZZ_RANDOM_ACTIONS || 420);
for (let i = 1; i <= games; i += 1) {
  const rng = new FuzzRng(i * 0x45d9f3b);
  const playerCount = 2 + (i % 3);
  const targetCoins = i % 8 === 0 ? 3 : 1;
  const game = new Game({
    playerCount,
    targetCoins,
    players: Array.from({ length: playerCount }, () => ({ human: true })),
  }, i * 104729);

  let actions = 0;
  let assisted = 0;
  while (game.state.phase !== "game-over" && actions < 24000) {
    try {
      if (actions > randomActionBudget) { game.autoStep(); assisted += 1; }
      else stepRandomly(game, rng, coverage);
      game.assertInvariants();
    } catch (error) {
      error.message = `fuzz game ${i}, action ${actions}, turn ${game.state.turn}, phase ${game.state.phase}: ${error.message}`;
      throw error;
    }
    actions += 1;
  }
  assert.equal(game.state.phase, "game-over", `fuzz game ${i} did not terminate`);
  assert(actions < 24000, `fuzz game ${i} reached action cap`);
  assert(game.state.winners.length >= 1, `fuzz game ${i} ended without a winner`);
  outcomes.push({ actions, turns: game.state.turn, assisted, shared: game.state.winners.length > 1 });
}

const expectedCards = ["volcano", "pteranodon", "monster", "swamp-fall", "swamp-escape", "water", "fight", "secret", "gun", "danger", "grazing", "undergrowth", "restless", "attack"];
for (const type of expectedCards) assert(coverage.cards.has(type), `fuzzer never drew ${type}`);

const report = {
  games,
  totalActions: outcomes.reduce((n, x) => n + x.actions, 0),
  meanActions: Number((outcomes.reduce((n, x) => n + x.actions, 0) / games).toFixed(1)),
  maxActions: Math.max(...outcomes.map((x) => x.actions)),
  meanTurns: Number((outcomes.reduce((n, x) => n + x.turns, 0) / games).toFixed(1)),
  maxTurns: Math.max(...outcomes.map((x) => x.turns)),
  assistedGames: outcomes.filter((x) => x.assisted > 0).length,
  sharedVictories: outcomes.filter((x) => x.shared).length,
  phases: [...coverage.phases].sort(),
  events: [...coverage.events].sort(),
  cardCounts: coverage.cardCounts,
};
console.log(JSON.stringify(report, null, 2));
