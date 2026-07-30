"use strict";
const assert = require("node:assert/strict");
const {
  Game, buildDeck, CARD_DEFS, BOARD, ENTRY_CELLS, LAIR_CELLS, LAIR_EXIT_CELLS,
  CAVE_CELLS, TEMPLE_CELL, VOLCANO_FLOOR_CELL, SWAMP_LOOP,
  SWAMP_EXIT_INDICES, PTERANODON_SWAMP_INDICES, AMMO_CELLS,
  terrain, isWater,
} = require("../engine.js");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed += 1; }
  catch (error) { console.error(`✗ ${name}\n  ${error.stack || error}`); failures.push({ name, error }); }
}
function fresh(seed = 1, options = {}) {
  const playerCount = options.playerCount || 2;
  return new Game({
    playerCount,
    targetCoins: options.targetCoins || 1,
    players: Array.from({ length: playerCount }, () => ({ human: false })),
  }, seed);
}
function setExplorerOnBoard(g, id, cell) {
  const e = g.explorer(id);
  e.status = "board"; e.cell = cell; e.lair = null; e.swampRoute = null; e.swampStep = null;
  return e;
}
function adjacentDry(cell) {
  return BOARD[cell].neighbours.find((id) => !["water", "lair", "temple", "swamp-edge"].includes(terrain(id)));
}

test("the Adventure deck has the printed 54-card composition", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 54);
  for (const def of CARD_DEFS) assert.equal(deck.filter((c) => c.type === def.type).length, def.count, def.type);
  assert.equal(new Set(deck.map((c) => c.id)).size, 54);
});

test("a save restores deterministically, including the RNG stream", () => {
  const g = fresh(0x4d44);
  g.start(); g.drawCard();
  while (g.state.phase === "event") g.autoStep();
  const restored = Game.fromJSON(g.toJSON());
  for (let i = 0; i < 80 && g.state.phase !== "game-over"; i += 1) {
    g.autoStep(); restored.autoStep();
    assert.deepEqual(restored.toJSON(), g.toJSON());
  }
});

test("land movement uses one die, treasure movement two", () => {
  const g = fresh();
  const e = setExplorerOnBoard(g, "p0e0", "4,4");
  g.state.phase = "movement";
  g.selectExplorer(e.id);
  assert.equal(g.rollMovement().rolls.length, 1);

  const h = fresh(2);
  const t = setExplorerOnBoard(h, "p0e0", "4,4");
  t.treasure = true; h.state.templeTreasure -= 1;
  h.state.phase = "movement";
  h.selectExplorer(t.id);
  assert.equal(h.rollMovement().rolls.length, 2);
  h.assertInvariants();
});

test("an explorer starting in water moves exactly one space without rolling", () => {
  const g = fresh();
  const e = setExplorerOnBoard(g, "p0e0", "9,2");
  assert(isWater(e.cell));
  g.state.phase = "movement";
  g.selectExplorer(e.id);
  assert.equal(g.state.phase, "moving");
  assert.deepEqual(g.state.movement.rolls, []);
  assert.equal(g.state.movement.remaining, 1);
  g.moveExplorerStep(g.legalExplorerSteps()[0]);
  assert.equal(g.state.phase, "post-move");
});

test("temple entry takes one coin and an exit banks it without exact count", () => {
  const g = fresh();
  const gate = BOARD[TEMPLE_CELL].neighbours.find((id) => g.isExplorerCellLegal(id));
  const e = setExplorerOnBoard(g, "p0e0", gate);
  g.state.phase = "moving";
  g.state.selectedExplorer = e.id;
  g.state.movement = { explorer: e.id, rolls: [6], total: 6, remaining: 5, visited: [e.cell], originWater: false, exact: true };
  g.moveExplorerStep(TEMPLE_CELL);
  assert.equal(e.status, "temple");
  assert.equal(e.treasure, true);
  assert.equal(g.state.templeTreasure, 11);

  e.status = "board"; e.cell = ENTRY_CELLS[0];
  g.state.phase = "moving";
  g.state.movement = { explorer: e.id, rolls: [5, 6], total: 11, remaining: 9, visited: [e.cell], originWater: false, exact: true };
  g.escapeValley();
  assert.equal(g.player(0).banked, 1);
  assert.equal(e.status, "outside");
});

test("an exact landing claims an abandoned treasure coin", () => {
  const g = fresh();
  const start = "4,4";
  const target = BOARD[start].neighbours.find((id) => g.isExplorerCellLegal(id) && !isWater(id));
  const e = setExplorerOnBoard(g, "p0e0", start);
  g.state.templeTreasure -= 1;
  g.state.looseTreasure[target] = 1;
  g.state.phase = "moving";
  g.state.movement = { explorer:e.id, rolls:[1], total:1, remaining:1, visited:[start], originWater:false, exact:true };
  g.moveExplorerStep(target);
  assert.equal(e.treasure, true);
  assert.equal(g.state.looseTreasure[target], undefined);
  g.assertInvariants();
});

test("a valley exit remains usable when every inward neighbour is blocked", () => {
  const g = fresh();
  const e = setExplorerOnBoard(g, "p0e0", ENTRY_CELLS[0]);
  const blocked = BOARD[e.cell].neighbours.filter((id) => terrain(id) !== "swamp-edge");
  g.state.lavaCells = blocked;
  g.state.lavaPool = 30 - blocked.length;
  assert.equal(g.canMoveExplorer(e), true);
  g.state.phase = "movement";
  g.selectExplorer(e.id);
  g.rollMovement();
  assert.equal(g.canEscapeValley(), true);
  g.escapeValley();
  assert.equal(e.status, "outside");
});

test("lava spends six eruptions on the cone, then places three connected counters", () => {
  const g = fresh();
  g.state.phase = "event";
  for (let i = 0; i < 6; i += 1) {
    g.beginVolcano();
    assert.equal(g.state.lavaTrack, i + 1);
    assert.equal(g.state.lavaCells.length, 0);
    g.state.phase = "event";
  }
  g.beginVolcano();
  assert.equal(g.state.pending.type, "lava");
  assert.equal(g.state.pending.remaining, 3);
  while (g.state.pending) g.placeLava(g.legalLavaPlacements()[0]);
  assert.equal(g.state.lavaCells.length, 3);
  assert.equal(g.state.lavaPool, 21);
  for (let i = 1; i < g.state.lavaCells.length; i += 1) {
    assert(g.state.lavaCells.slice(0, i).some((id) => BOARD[id].neighbours.includes(g.state.lavaCells[i])));
  }
});

test("a relocated lava counter preserves the flow and moves to a different cell", () => {
  const g = fresh();
  g.state.lavaTrack = 6;
  g.state.lavaPool = 24;
  g.state.phase = "event";
  g.beginVolcano();
  while (g.state.pending) g.placeLava(g.legalLavaPlacements()[0]);
  assert.equal(g.state.lavaCells.length, 3);
  g.state.phase = "event";
  g.state.pending = { type: "lava", mode: "remove", remaining: 1, removed: null };
  const chosen = g.removableLavaCells()[0];
  g.removeLava(chosen);
  const choices = g.legalLavaPlacements();
  assert(choices.length > 0);
  assert(!choices.includes(chosen), "old cell should be excluded when a real relocation exists");
  g.placeLava(choices[0]);
  assert(!g.state.lavaCells.includes(chosen));
  g.assertInvariants();
});

test("lava may engulf the temple and a dinosaur lair, killing occupants", () => {
  const templeGame = fresh();
  const templeNeighbour = BOARD[TEMPLE_CELL].neighbours.find((id) => terrain(id) !== "swamp-edge");
  templeGame.state.lavaTrack = 6;
  templeGame.state.lavaCells = [templeNeighbour];
  templeGame.state.lavaPool = 23;
  const priest = templeGame.explorer("p0e0");
  priest.status = "temple"; priest.cell = TEMPLE_CELL;
  templeGame.state.phase = "event";
  templeGame.state.pending = { type:"lava", mode:"place", remaining:1, placedThisEvent:0 };
  assert(templeGame.legalLavaPlacements().includes(TEMPLE_CELL));
  templeGame.placeLava(TEMPLE_CELL);
  assert.equal(priest.status, "dead");

  const lairGame = fresh(3);
  const lair = LAIR_CELLS.find((id) => BOARD[id].neighbours.some((n) => terrain(n) !== "swamp-edge"));
  const resident = lairGame.dinosaurAt(lair);
  resident.cell = Object.keys(BOARD).find((id) => terrain(id) === "plain" && !lairGame.dinosaurAt(id));
  const flow = BOARD[lair].neighbours.find((id) => terrain(id) !== "swamp-edge" && !lairGame.dinosaurAt(id));
  lairGame.state.lavaTrack = 6;
  lairGame.state.lavaCells = [flow];
  lairGame.state.lavaPool = 23;
  const captive = lairGame.explorer("p0e0");
  captive.status = "lair"; captive.cell = null; captive.lair = lair;
  lairGame.state.phase = "event";
  lairGame.state.pending = { type:"lava", mode:"place", remaining:1, placedThisEvent:0 };
  assert(lairGame.legalLavaPlacements().includes(lair));
  lairGame.placeLava(lair);
  assert.equal(captive.status, "dead");
});

test("the printed swamp topology has eleven arrows, four inner drops, and two exits", () => {
  assert.equal(SWAMP_LOOP.length, 11);
  assert.equal(PTERANODON_SWAMP_INDICES.length, 4);
  assert.deepEqual(SWAMP_EXIT_INDICES, [5, 9]);
  assert(SWAMP_EXIT_INDICES.every((i) => i >= 0 && i < SWAMP_LOOP.length));
});

test("the swamp monster moves clockwise and eats board and trapped explorers on its new arrow", () => {
  const g = fresh();
  const next = (g.state.monsterIndex + 1) % SWAMP_LOOP.length;
  const a = setExplorerOnBoard(g, "p0e0", SWAMP_LOOP[next]);
  const b = g.explorer("p1e0"); b.status = "swamp"; b.cell = null; b.swampStep = next; b.swampRoute = null;
  g.moveMonster();
  assert.equal(g.state.monsterIndex, next);
  assert.equal(a.status, "dead");
  assert.equal(b.status, "dead");
});

test("a swamp-fall card lets the player choose any arrow except the monster's", () => {
  const g = fresh();
  const e = setExplorerOnBoard(g, "p0e0", "4,4");
  e.treasure = true; g.state.templeTreasure -= 1;
  g.state.phase = "event";
  g.state.pending = { type:"swamp-fall", stage:"select-explorer", explorer:null };
  g.selectSwampVictim(e.id);
  assert.equal(g.legalSwampPlacements().length, 10);
  const chosen = (g.state.monsterIndex + 1) % SWAMP_LOOP.length;
  g.placeSwampVictim(chosen);
  assert.equal(e.status, "swamp");
  assert.equal(e.swampStep, chosen);
  assert.equal(e.treasure, false);
  assert.equal(g.state.looseTreasure["4,4"], 1);
});

test("a pteranodon rescues a captive and can drop an opponent on an inner swamp space", () => {
  const g = fresh();
  const own = g.explorer("p0e0"); own.status = "lair"; own.lair = LAIR_CELLS[0]; own.cell = null;
  g.state.phase = "event"; g.state.pending = { type:"pteranodon", stage:"select-explorer", explorer:null };
  g.selectPteranodonExplorer(own.id);
  const safe = g.legalPteranodonDestinations(own.id).find((d) => d.kind === "board");
  g.placePteranodon(safe);
  assert.equal(own.status, "board");

  const enemy = setExplorerOnBoard(g, "p1e0", "4,4");
  g.state.phase = "event"; g.state.pending = { type:"pteranodon", stage:"select-explorer", explorer:null };
  g.selectPteranodonExplorer(enemy.id);
  g.placePteranodon({ kind:"swamp", id:2 });
  assert.equal(enemy.status, "swamp");
  assert.equal(enemy.swampRoute, 2);
  assert.equal(enemy.swampStep, PTERANODON_SWAMP_INDICES[2]);

  g.state.currentPlayer = 1;
  g.state.phase = "movement"; g.state.movementUsed = false;
  g.selectExplorer(enemy.id);
  const step = g.legalExplorerSteps()[0];
  assert.equal(step.kind, "swamp");
  g.moveExplorerStep(step);
  assert.equal(enemy.swampRoute, null, "first move joins the shared grey-arrow path");
});



test("inner-swamp spaces are empty-only, protected from the path monster, and join their adjacent arrow first", () => {
  const g = fresh();
  const first = g.explorer("p1e0");
  first.status = "swamp"; first.cell = null; first.swampRoute = 1; first.swampStep = PTERANODON_SWAMP_INDICES[1];
  g.state.phase = "event"; g.state.pending = { type:"pteranodon", stage:"select-explorer", explorer:null };
  const second = setExplorerOnBoard(g, "p1e1", "4,4");
  g.selectPteranodonExplorer(second.id);
  assert(!g.legalPteranodonDestinations(second.id).some((d) => d.kind === "swamp" && d.id === 1), "occupied inner space must not be offered");

  g.state.monsterIndex = (first.swampStep + SWAMP_LOOP.length - 1) % SWAMP_LOOP.length;
  g.moveMonster();
  assert.equal(g.state.monsterIndex, first.swampStep);
  assert.equal(first.status, "swamp", "the monster is on the path, not the separate inner space");

  g.state.currentPlayer = 1;
  g.state.phase = "movement"; g.state.pending = null; g.state.movementUsed = false;
  assert.equal(g.canMoveExplorer(first), false, "the adjacent path arrow is temporarily blocked by the monster");
  g.state.monsterIndex = (first.swampStep + 1) % SWAMP_LOOP.length;
  g.selectExplorer(first.id);
  const step = g.legalExplorerSteps()[0];
  assert.equal(step.id, PTERANODON_SWAMP_INDICES[1], "first move lands on the adjacent grey arrow, not the following one");
  g.moveExplorerStep(step);
  assert.equal(first.swampRoute, null);
  assert.equal(first.swampStep, PTERANODON_SWAMP_INDICES[1]);
});

test("an impossible dinosaur order is skipped without discarding later printed orders", () => {
  const g = fresh();
  const d = g.dinosaur("d0");
  const lair = d.homeLair;
  const staging = BOARD[lair].neighbours.find((id) => terrain(id) !== "lair" && terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  d.cell = staging;
  const otherIds = g.state.dinosaurs.filter((x) => x.id !== d.id).map((x) => x.id);
  const blocks = BOARD[staging].neighbours.filter((id) => id !== lair && terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  g.state.lavaCells = blocks;
  g.state.lavaPool = 30 - blocks.length;
  g.state.phase = "event";
  g.state.pending = { type:"dinosaur", cardType:"danger", tasks:[2,1], taskIndex:0, moved:otherIds, selected:null, stepsLeft:0, visited:[], capture:null, attack:false };
  assert.equal(g.availableDinosaurs().length, 0, "the only unused dinosaur can reach only a lair, which is illegal before the final step");
  g.skipDinosaurTask();
  assert.equal(g.state.phase, "event");
  assert.equal(g.state.pending.taskIndex, 1);
  assert.deepEqual(g.availableDinosaurs().map((x) => x.id), [d.id], "the later one-space order remains available");
  g.selectDinosaur(d.id);
  assert(g.legalDinosaurSteps(d.id).includes(lair));
});

test("an unresolved exact tie is reported as a shared victory rather than an invented seat-order rule", () => {
  const g = fresh(5, { targetCoins:3 });
  for (const e of g.state.explorers) { e.status = "dead"; e.cell = null; e.lair = null; e.swampRoute = null; e.swampStep = null; }
  assert.equal(g.checkEndConditions(), true);
  assert.deepEqual(g.state.winners, [0, 1]);
  assert.match(g.state.endReason, /share/i);
  g.assertInvariants();
});

test("the water card chooses an explorer before rolling and can reach the river without exact count", () => {
  const g = fresh(7);
  const dry = Object.keys(BOARD).find((id) => terrain(id) !== "water" && terrain(id) !== "swamp-edge" && BOARD[id].neighbours.some(isWater));
  const e = setExplorerOnBoard(g, "p0e0", dry);
  g.state.phase = "event";
  g.state.pending = { type:"water", stage:"select-explorer", dice:null, explorer:null, targets:[] };
  assert.equal(g.state.pending.dice, null);
  g.selectWaterExplorer(e.id);
  assert.equal(g.state.pending.stage, "select-water");
  assert.equal(g.state.pending.dice.rolls.length, 2);
  const target = g.state.pending.targets[0];
  assert(target.distance <= g.state.pending.dice.total);
  g.placeWaterExplorer(target.cell);
  assert.equal(e.cell, target.cell);
  assert(isWater(e.cell));
});

test("a failed water search dies at a chosen farthest endpoint and leaves treasure there", () => {
  const g = fresh(9);
  const e = g.explorer("p0e0");
  const dry = Object.keys(BOARD).find((id) => !["water", "swamp-edge", "lair", "temple"].includes(terrain(id)) && g.waterTargets({ ...e, status:"board", cell:id }, 2).length === 0);
  assert(dry, "expected a dry cell more than two steps from water");
  setExplorerOnBoard(g, e.id, dry);
  e.treasure = true; g.state.templeTreasure -= 1;
  g.rollDice = () => ({ rolls:[1,1], total:2 });
  g.state.phase = "event";
  g.state.pending = { type:"water", stage:"select-explorer", dice:null, explorer:null, targets:[] };
  g.selectWaterExplorer(e.id);
  assert.equal(g.state.pending.stage, "select-failure");
  const target = g.state.pending.targets[0];
  g.placeWaterFailure(target.cell);
  assert.equal(e.status, "dead");
  assert.equal(g.state.looseTreasure[target.cell], 1);
});

test("a Dinosaurs Fight card uses the two printed footprint spaces outside a lair", () => {
  const g = fresh();
  const e = g.explorer("p0e0"); e.status = "lair"; e.cell = null; e.lair = LAIR_CELLS[0];
  g.state.phase = "event";
  g.state.pending = { type:"fight", stage:"select-explorer", eligible:[e.id], explorer:null, targets:[] };
  g.selectFightExplorer(e.id);
  assert.equal(g.state.pending.stage, "select-destination");
  assert.deepEqual(new Set(g.state.pending.targets), new Set(LAIR_EXIT_CELLS[e.lair]));
  const destination = g.state.pending.targets[0];
  g.placeFightEscape(destination);
  assert.equal(e.status, "board");
  assert.equal(e.cell, destination);
});

test("dinosaurs may retrace land while still completing the full printed move", () => {
  const g = fresh();
  const d = g.dinosaur("d0"); d.cell = "4,4";
  const candidate = BOARD[d.cell].neighbours.find((id) => terrain(id) === "plain");
  const blocked = new Set([
    ...BOARD[d.cell].neighbours.filter((id) => id !== candidate),
    ...BOARD[candidate].neighbours.filter((id) => id !== d.cell),
  ]);
  g.state.lavaCells = [...blocked].filter((id) => terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  assert.deepEqual(g.legalDinosaurSteps(d.id, 2), [candidate], "the dinosaur can step out and retrace its route");

  g.state.lavaCells.push(candidate);
  assert.equal(g.legalDinosaurSteps(d.id, 2).length, 0, "a dinosaur with no first step cannot be selected");
});

test("a dinosaur enters a lair only as the exact final step, but capture can end a longer move early", () => {
  const g = fresh();
  const d = g.dinosaur("d0");
  const lair = d.homeLair;
  const neighbour = BOARD[lair].neighbours.find((id) => terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  d.cell = neighbour;
  assert(!g.legalDinosaurSteps(d.id, 2, [d.cell]).includes(lair));
  assert(g.legalDinosaurSteps(d.id, 1, [d.cell]).includes(lair));

  const victimCell = BOARD[d.cell].neighbours.find((id) => terrain(id) !== "lair" && terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  const victim = setExplorerOnBoard(g, "p1e0", victimCell);
  assert(g.legalDinosaurSteps(d.id, 3, [d.cell]).includes(victim.cell), "capture should end the route immediately");
});

test("a dinosaur captures every explorer entered and carries them to a chosen free lair", () => {
  const g = fresh();
  const d = g.dinosaur("d0"); d.cell = "4,4";
  g.state.phase = "event";
  g.state.pending = { type:"dinosaur", cardType:"grazing", tasks:[1], taskIndex:0, moved:[], selected:null, stepsLeft:0, visited:[], capture:null, attack:false };
  const target = g.legalDinosaurSteps(d.id, 1, [d.cell]).find((id) => terrain(id) !== "lair");
  const a = setExplorerOnBoard(g, "p1e0", target);
  const b = setExplorerOnBoard(g, "p1e1", target);
  g.selectDinosaur(d.id);
  g.moveDinosaurStep(target);
  assert.deepEqual(new Set(g.state.pending.capture.explorers), new Set([a.id, b.id]));
  const lair = g.availableCaptureLairs()[0];
  g.selectCaptureLair(lair);
  assert.equal(a.status, "lair");
  assert.equal(b.status, "lair");
  assert.equal(d.cell, lair);
});

test("an Attack card eats existing and newly captured explorers in the selected lair", () => {
  const g = fresh();
  const d = g.dinosaur("d0"); d.cell = "4,4";
  const target = BOARD[d.cell].neighbours.find((id) => terrain(id) !== "lair" && terrain(id) !== "swamp-edge" && id !== TEMPLE_CELL && !g.dinosaurAt(id));
  const freshVictim = setExplorerOnBoard(g, "p1e0", target);
  const oldVictim = g.explorer("p1e1"); oldVictim.status = "lair"; oldVictim.cell = null; oldVictim.lair = LAIR_CELLS[1];
  const lairDino = g.dinosaurAt(LAIR_CELLS[1]);
  lairDino.cell = Object.keys(BOARD).find((id) => terrain(id) === "plain" && !g.dinosaurAt(id));
  g.state.phase = "event";
  g.state.pending = { type:"dinosaur", cardType:"attack", tasks:[1], taskIndex:0, moved:[], selected:null, stepsLeft:0, visited:[], capture:null, attack:true };
  g.selectDinosaur(d.id); g.moveDinosaurStep(target);
  g.selectCaptureLair(LAIR_CELLS[1]);
  assert.equal(freshVictim.status, "dead");
  assert.equal(oldVictim.status, "dead");
});

test("a held gun turns one physical bullet into one forced dinosaur step and capture", () => {
  const g = fresh();
  const gunIndex = g.state.deck.findIndex((c) => c.type === "gun");
  g.player(0).gunCards.push(g.state.deck.splice(gunIndex, 1)[0]);
  g.player(0).bullets = 1;
  const d = g.dinosaur("d0"); d.cell = "4,4";
  const target = g.legalBulletDestinations(d.id).find((id) => terrain(id) !== "lair");
  const victim = setExplorerOnBoard(g, "p1e0", target);
  g.state.phase = "movement";
  g.startBullet(); g.selectBulletDinosaur(d.id); g.moveBulletDinosaur(target);
  assert.equal(g.player(0).bullets, 0);
  assert.equal(g.state.pending.stage, "capture");
  const lair = g.availableBulletCaptureLairs()[0];
  g.selectBulletCaptureLair(lair);
  assert.equal(victim.status, "lair");
  assert.equal(victim.lair, lair);
  g.assertInvariants();
});

test("landing on an ammo dump with a held gun takes one finite bullet", () => {
  const g = fresh();
  const gunIndex = g.state.deck.findIndex((c) => c.type === "gun");
  g.player(0).gunCards.push(g.state.deck.splice(gunIndex, 1)[0]);
  const e = setExplorerOnBoard(g, "p0e0", AMMO_CELLS[0]);
  g.state.phase = "moving"; g.state.movement = { explorer:e.id, remaining:0, visited:[e.cell] };
  g.finishMovement(true);
  assert.equal(g.player(0).bullets, 1);
  assert.equal(g.state.ammo[AMMO_CELLS[0]], 4);
  g.assertInvariants();
});

test("a secret-path card is consumed on a cave-to-temple journey", () => {
  const g = fresh();
  const secretIndex = g.state.deck.findIndex((c) => c.type === "secret");
  const card = g.state.deck.splice(secretIndex, 1)[0];
  g.player(0).secretCards.push(card);
  const e = setExplorerOnBoard(g, "p0e0", CAVE_CELLS[0]);
  g.state.phase = "movement";
  g.useSecretPath(e.id, TEMPLE_CELL);
  assert.equal(e.status, "temple");
  assert.equal(e.treasure, true);
  assert.equal(g.player(0).secretCards.length, 0);
  assert(g.state.discard.some((c) => c.id === card.id));
  g.assertInvariants();
});



test("AI does not attempt a secret passage whose destination has been sealed by lava", () => {
  const g = fresh();
  const secretIndex = g.state.deck.findIndex((c) => c.type === "secret");
  g.player(0).secretCards.push(g.state.deck.splice(secretIndex, 1)[0]);
  const e = setExplorerOnBoard(g, "p0e0", CAVE_CELLS[0]);
  g.state.lavaCells = [TEMPLE_CELL];
  g.state.lavaPool = 29;
  g.state.phase = "movement";
  assert.deepEqual(g.secretDestinations(e.id), []);
  assert.doesNotThrow(() => g.autoMovementStart());
  assert.notEqual(g.state.phase, "movement", "AI should select a normal move instead of retrying the blocked passage");
  g.assertInvariants();
});

test("treasure buried under lava no longer keeps an unwinnable game alive", () => {
  const g = fresh(1, { targetCoins:3 });
  g.state.lavaCells = [TEMPLE_CELL];
  g.state.lavaPool = 29;
  assert.equal(g.claimableTreasureCoins(), 0);
  assert.equal(g.checkEndConditions(), true);
  assert.equal(g.state.phase, "game-over");
  assert.match(g.state.endReason, /claimable/);
});

test("seeded AI expeditions terminate without invariant failures", () => {
  const outcomes = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    const count = seed % 3 === 0 ? 4 : (seed % 3 === 1 ? 2 : 3);
    const targetCoins = seed % 5 === 0 ? 3 : 1;
    const g = new Game({ playerCount:count, targetCoins, players:Array.from({ length:count }, () => ({ human:false })) }, seed * 7919);
    g.start();
    let actions = 0;
    while (g.state.phase !== "game-over" && actions < 16000) { g.autoStep(); actions += 1; }
    assert.equal(g.state.phase, "game-over", `seed ${seed} stalled at ${g.state.phase}, turn ${g.state.turn}`);
    assert(actions < 16000, `seed ${seed} action cap`);
    g.assertInvariants();
    outcomes.push({ seed, turns:g.state.turn, actions, winner:g.state.winner });
  }
  const maxTurns = Math.max(...outcomes.map((o) => o.turns));
  const avgTurns = outcomes.reduce((sum, o) => sum + o.turns, 0) / outcomes.length;
  const winnerSpread = new Set(outcomes.map((o) => o.winner)).size;
  console.log(`  Monte Carlo: 200 games, mean ${avgTurns.toFixed(1)} turns, max ${maxTurns}, ${winnerSpread} winner seats`);
  assert(maxTurns < 300);
  assert(winnerSpread >= 2);
});

console.log(`\n${passed}/${passed + failures.length} engine tests passed.`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure.name}: ${failure.error.message}`);
  process.exitCode = 1;
}
