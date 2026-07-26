/*
 * Lost Valley of the Dinosaurs — deterministic rules engine
 * Original implementation for the 0x4D44 Almanac.
 * No original game artwork or text is embedded beyond short rule labels.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LostValleyEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const PLAYER_STYLES = [
    { colour: "#f2cf4a", dark: "#8b6912", name: "Gold", symbol: "●" },
    { colour: "#42a56c", dark: "#145d38", name: "Fern", symbol: "▲" },
    { colour: "#c97743", dark: "#743718", name: "Ochre", symbol: "■" },
    { colour: "#eee4c8", dark: "#72664e", name: "Ivory", symbol: "◆" },
  ];
  const DEFAULT_NAMES = ["Gold Expedition", "Fern Expedition", "Ochre Expedition", "Ivory Expedition"];
  const ENTRY_CELLS = ["1,8", "5,10", "13,8", "14,4"];
  const LAIR_CELLS = ["2,1", "6,0", "13,2", "14,6", "10,10", "2,9"];
  // The cardboard board marks two footprint hexes immediately outside each lair.
  // A Dinosaurs Fight card may place a captive only on one of these spaces.
  const LAIR_EXIT_CELLS = {
    "2,1": ["2,2", "3,2"],
    "6,0": ["5,1", "6,1"],
    "13,2": ["12,3", "13,3"],
    "14,6": ["13,5", "13,6"],
    "10,10": ["9,9", "10,9"],
    "2,9": ["2,8", "3,8"],
  };
  const CAVE_CELLS = ["2,4", "12,4"];
  const AMMO_CELLS = ["3,7", "11,8"];
  const TEMPLE_CELL = "11,0";
  const VOLCANO_FLOOR_CELL = "3,1";
  const SWAMP_LOOP = ["6,4", "7,3", "8,4", "9,4", "10,5", "9,6", "8,7", "7,7", "6,7", "5,6", "5,5"];
  // The monster and trapped explorers share the printed clockwise swamp path.
  // Four inner positions are reserved for a pteranodon drop; two path positions
  // carry the blue exit arrows that lead back to dry land.
  const SWAMP_EXIT_INDICES = [5, 9];
  const PTERANODON_SWAMP_INDICES = [1, 4, 6, 9];
  const SWAMP_ROUTES = PTERANODON_SWAMP_INDICES.map((start, id) => ({
    id,
    start,
    exitIndex: SWAMP_EXIT_INDICES
      .slice()
      .sort((a, b) => ((a - start + SWAMP_LOOP.length) % SWAMP_LOOP.length) - ((b - start + SWAMP_LOOP.length) % SWAMP_LOOP.length))[0],
  }));

  const WATER = new Set([
    "10,1", "9,2", "9,3", "8,4", "8,5", "7,6", "6,7", "6,8", "5,9", "5,10",
    "7,5", "6,5", "5,5", "4,6", "3,6", "2,7", "1,7", "0,8",
    "9,5", "10,6", "11,6", "12,7", "13,7", "14,8",
  ]);
  const BRIDGES = new Set(["9,3", "4,6", "11,6"]);
  const JUNGLE = new Set([
    "1,2", "2,2", "3,2", "5,2", "6,2", "11,2", "12,2", "13,3",
    "1,4", "3,4", "4,4", "10,4", "13,4", "1,5", "3,5", "11,5", "13,5",
    "1,6", "2,6", "12,6", "13,6", "2,8", "4,8", "9,8", "12,8",
    "3,9", "6,9", "8,9", "11,9",
  ]);

  function cellId(q, r) { return `${q},${r}`; }
  function parseCell(id) {
    const [q, r] = String(id).split(",").map(Number);
    return { q, r };
  }
  function buildBoard() {
    const cells = {};
    const rowRanges = [
      [3, 11], [1, 13], [0, 14], [0, 14], [0, 14], [0, 14],
      [0, 14], [0, 14], [0, 14], [1, 13], [3, 11],
    ];
    for (let r = 0; r < rowRanges.length; r += 1) {
      for (let q = rowRanges[r][0]; q <= rowRanges[r][1]; q += 1) {
        const id = cellId(q, r);
        let terrain = "plain";
        if (WATER.has(id)) terrain = BRIDGES.has(id) ? "bridge" : "water";
        if (JUNGLE.has(id)) terrain = "jungle";
        if (SWAMP_LOOP.includes(id)) terrain = "swamp-edge";
        if (ENTRY_CELLS.includes(id)) terrain = "entry";
        if (LAIR_CELLS.includes(id)) terrain = "lair";
        if (CAVE_CELLS.includes(id)) terrain = "cave";
        if (AMMO_CELLS.includes(id)) terrain = "ammo";
        if (id === TEMPLE_CELL) terrain = "temple";
        cells[id] = { id, q, r, terrain, neighbours: [] };
      }
    }
    for (const cell of Object.values(cells)) {
      const even = cell.r % 2 === 0;
      const offsets = even
        ? [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]
        : [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];
      cell.neighbours = offsets
        .map(([dq, dr]) => cellId(cell.q + dq, cell.r + dr))
        .filter((id) => cells[id]);
    }
    return cells;
  }
  const BOARD = buildBoard();

  const CARD_DEFS = [
    { type: "volcano", count: 7, title: "Volcano Erupts!", strap: "The red river wakes." },
    { type: "pteranodon", count: 6, title: "Pteranodon Swoops!", strap: "A rescue — or a terrible detour." },
    { type: "monster", count: 6, title: "The Swamp Monster is Disturbed!", strap: "One grey arrow clockwise." },
    { type: "swamp-fall", count: 6, title: "One Member Falls into the Swamp!", strap: "Choose one of your expedition." },
    { type: "swamp-escape", count: 1, title: "Escape from the Swamp!", strap: "Dry ground at last." },
    { type: "water", count: 2, title: "Your Expedition is Short of Water!", strap: "Reach a river on two dice — or perish." },
    { type: "fight", count: 3, title: "Dinosaurs Fight!", strap: "A captive slips from a lair." },
    { type: "secret", count: 2, title: "A Secret Path to the Temple!", strap: "Keep this card until a cave calls." },
    { type: "gun", count: 2, title: "You Have Found a Gun!", strap: "Ammo dumps can now be searched." },
    { type: "danger", count: 3, title: "Danger Ahead!", strap: "Three move two; three move one." },
    { type: "grazing", count: 4, title: "Grazing Dinosaurs!", strap: "Move three dinosaurs one space." },
    { type: "undergrowth", count: 5, title: "The Undergrowth is Disturbed!", strap: "Every dinosaur moves one space." },
    { type: "restless", count: 6, title: "Restless Dinosaurs!", strap: "Move three dinosaurs two spaces." },
    { type: "attack", count: 1, title: "Dinosaur Attack!", strap: "One moves three; three move one. Captives are eaten." },
  ];

  function buildDeck() {
    const cards = [];
    for (const def of CARD_DEFS) {
      for (let i = 0; i < def.count; i += 1) {
        cards.push({ id: `${def.type}-${i + 1}`, type: def.type, title: def.title, strap: def.strap });
      }
    }
    return cards;
  }

  class RNG {
    constructor(seed) {
      let value = Number(seed);
      if (!Number.isFinite(value)) value = Date.now();
      value = (value >>> 0) || 0x4d44d1a0;
      this.state = value;
    }
    next() {
      let x = this.state >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.state = x >>> 0;
      return this.state / 0x100000000;
    }
    int(max) { return Math.floor(this.next() * max); }
    d6() { return 1 + this.int(6); }
    pick(list) { return list.length ? list[this.int(list.length)] : null; }
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = this.int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cardDef(type) { return CARD_DEFS.find((d) => d.type === type); }
  function terrain(id) { return BOARD[id] ? BOARD[id].terrain : null; }
  function isWater(id) { return terrain(id) === "water"; }
  function isDryLand(id) {
    const t = terrain(id);
    return Boolean(t && !["water", "lair", "temple"].includes(t));
  }
  function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || `${one}s`)}`; }

  class Game {
    constructor(config = {}, seed = Date.now()) {
      const count = Math.min(4, Math.max(2, Number(config.playerCount || (config.players && config.players.length) || 2)));
      const cfgPlayers = Array.isArray(config.players) ? config.players : [];
      this.rng = new RNG(seed);
      this.state = {
        version: VERSION,
        seed: this.rng.state,
        rngState: this.rng.state,
        config: {
          targetCoins: config.targetCoins === 3 ? 3 : 1,
          hints: config.hints !== false,
          players: Array.from({ length: count }, (_, i) => ({
            name: (cfgPlayers[i] && String(cfgPlayers[i].name || "").trim()) || DEFAULT_NAMES[i],
            human: cfgPlayers[i] ? cfgPlayers[i].human !== false : i === 0,
            style: PLAYER_STYLES[i],
          })),
        },
        players: [],
        explorers: [],
        dinosaurs: [],
        currentPlayer: 0,
        turn: 1,
        phase: "pass",
        pending: null,
        currentCard: null,
        deck: this.rng.shuffle(buildDeck()),
        discard: [],
        monsterIndex: 3,
        lavaTrack: 0,
        lavaCells: [],
        lavaPool: 30,
        looseTreasure: {},
        templeTreasure: 12,
        ammo: { [AMMO_CELLS[0]]: 5, [AMMO_CELLS[1]]: 5 },
        selectedExplorer: null,
        selectedDinosaur: null,
        movement: null,
        movementUsed: false,
        log: [],
        winner: null,
        winners: [],
        endReason: null,
        actionSerial: 0,
      };
      this.state.players = this.state.config.players.map((p, i) => ({
        id: i,
        name: p.name,
        human: p.human,
        style: p.style,
        banked: 0,
        bullets: 0,
        gunCards: [],
        secretCards: [],
        homeEntry: ENTRY_CELLS[i],
      }));
      for (const player of this.state.players) {
        for (let i = 0; i < 4; i += 1) {
          this.state.explorers.push({
            id: `p${player.id}e${i}`,
            player: player.id,
            index: i,
            status: "outside",
            cell: null,
            treasure: false,
            swampRoute: null,
            swampStep: null,
            lair: null,
          });
        }
      }
      this.state.dinosaurs = LAIR_CELLS.map((cell, i) => ({ id: `d${i}`, cell, homeLair: cell }));
      this.log(`The expeditions gather at the four entrances. Seed ${this.state.seed}.`, "system");
    }

    static fromJSON(data) {
      const parsed = typeof data === "string" ? JSON.parse(data) : clone(data);
      if (!parsed || parsed.version !== VERSION) throw new Error("Unsupported save version");
      const game = Object.create(Game.prototype);
      game.state = parsed;
      if (!Array.isArray(game.state.winners)) game.state.winners = game.state.winner == null ? [] : [game.state.winner];
      game.rng = new RNG(parsed.rngState || parsed.seed);
      game.rng.state = parsed.rngState || parsed.seed;
      return game;
    }

    toJSON() {
      this.syncRng();
      return clone(this.state);
    }

    syncRng() { this.state.rngState = this.rng.state >>> 0; }
    commit() { this.state.actionSerial += 1; this.syncRng(); this.assertInvariants(); }
    currentPlayer() { return this.state.players[this.state.currentPlayer]; }
    player(id) { return this.state.players[id]; }
    explorer(id) { return this.state.explorers.find((e) => e.id === id); }
    dinosaur(id) { return this.state.dinosaurs.find((d) => d.id === id); }
    explorersFor(playerId) { return this.state.explorers.filter((e) => e.player === playerId); }
    livingExplorers(playerId) { return this.explorersFor(playerId).filter((e) => e.status !== "dead"); }
    activeExplorers(playerId) { return this.livingExplorers(playerId); }
    dinosaurAt(cell) { return this.state.dinosaurs.find((d) => d.cell === cell) || null; }
    explorersAt(cell) { return this.state.explorers.filter((e) => e.status === "board" && e.cell === cell); }
    explorersOnPhysicalCell(cell) {
      return this.state.explorers.filter((e) =>
        (e.status === "board" && e.cell === cell)
        || (e.status === "temple" && e.cell === cell)
        || (e.status === "lair" && e.lair === cell));
    }
    monsterCell() { return SWAMP_LOOP[this.state.monsterIndex]; }
    cardDefinition(type) { return cardDef(type); }
    board() { return BOARD; }

    log(message, kind = "info") {
      this.state.log.unshift({ serial: this.state.actionSerial, turn: this.state.turn, player: this.state.currentPlayer, message, kind });
      if (this.state.log.length > 160) this.state.log.length = 160;
    }

    start() {
      if (this.state.phase !== "pass") return false;
      this.state.phase = "draw";
      this.log(`${this.currentPlayer().name} begins turn ${this.state.turn}.`, "turn");
      this.commit();
      return true;
    }

    readyNextTurn() {
      if (this.state.phase !== "pass") return false;
      return this.start();
    }

    rollDice(count) {
      const rolls = Array.from({ length: count }, () => this.rng.d6());
      this.syncRng();
      return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
    }

    drawCard() {
      if (this.state.phase !== "draw") throw new Error("It is not time to draw a card");
      if (!this.state.deck.length) {
        this.state.deck = this.rng.shuffle(this.state.discard);
        this.state.discard = [];
        this.log("The Adventure discard pile is shuffled into a fresh deck.", "card");
      }
      const card = this.state.deck.pop();
      this.state.currentCard = card;
      this.log(`${this.currentPlayer().name} draws “${card.title}”`, "card");
      this.beginCard(card);
      this.commit();
      return card;
    }

    beginCard(card) {
      const type = card.type;
      if (type === "volcano") return this.beginVolcano();
      if (type === "pteranodon") {
        this.state.phase = "event";
        this.state.pending = { type: "pteranodon", stage: "select-explorer", explorer: null };
        return;
      }
      if (type === "monster") {
        this.moveMonster();
        this.finishEvent();
        return;
      }
      if (type === "swamp-fall") {
        const eligible = this.explorersFor(this.state.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
        if (!eligible.length) return this.finishEvent("No expedition member can fall into the swamp.");
        this.state.phase = "event";
        this.state.pending = { type: "swamp-fall", stage: "select-explorer", explorer: null };
        return;
      }
      if (type === "swamp-escape") {
        const eligible = this.explorersFor(this.state.currentPlayer).filter((e) => e.status === "swamp");
        if (!eligible.length) return this.finishEvent("No member of this expedition is in the swamp.");
        this.state.phase = "event";
        this.state.pending = { type: "swamp-escape", stage: "select-explorer", explorer: null, targets: [] };
        return;
      }
      if (type === "water") {
        const eligible = this.explorersFor(this.state.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
        if (!eligible.length) return this.finishEvent("There is nobody left to send for water.");
        this.state.phase = "event";
        this.state.pending = { type: "water", stage: "select-explorer", dice: null, explorer: null, targets: [] };
        return;
      }
      if (type === "fight") {
        const own = this.explorersFor(this.state.currentPlayer).filter((e) => e.status === "lair");
        const any = this.state.explorers.filter((e) => e.status === "lair");
        const eligible = own.length ? own : any;
        if (!eligible.length) return this.finishEvent("The dinosaur lairs are empty.");
        this.state.phase = "event";
        this.state.pending = { type: "fight", stage: "select-explorer", eligible: eligible.map((e) => e.id), explorer: null, targets: [] };
        return;
      }
      if (type === "secret") {
        this.currentPlayer().secretCards.push(card);
        this.state.currentCard = null;
        this.log(`${this.currentPlayer().name} keeps the secret-path card.`, "keep");
        this.finishEvent(null, false);
        return;
      }
      if (type === "gun") {
        this.currentPlayer().gunCards.push(card);
        this.state.currentCard = null;
        this.log(`${this.currentPlayer().name} can now collect bullets at ammo dumps.`, "keep");
        this.finishEvent(null, false);
        return;
      }
      const patterns = {
        danger: [2, 2, 2, 1, 1, 1],
        grazing: [1, 1, 1],
        undergrowth: [1, 1, 1, 1, 1, 1],
        restless: [2, 2, 2],
        attack: [3, 1, 1, 1],
      };
      if (patterns[type]) {
        this.state.phase = "event";
        this.state.pending = {
          type: "dinosaur",
          cardType: type,
          tasks: patterns[type].slice(),
          taskIndex: 0,
          moved: [],
          selected: null,
          stepsLeft: 0,
          visited: [],
          capture: null,
          attack: type === "attack",
        };
        return;
      }
      throw new Error(`Unknown card type: ${type}`);
    }

    discardCurrentCard() {
      if (this.state.currentCard) {
        this.state.discard.push(this.state.currentCard);
        this.state.currentCard = null;
      }
    }

    finishEvent(message = null, discard = true) {
      if (message) this.log(message, "event");
      if (discard) this.discardCurrentCard();
      this.state.pending = null;
      this.state.phase = "movement";
      this.state.selectedExplorer = null;
      this.state.selectedDinosaur = null;
      this.state.movement = null;
      this.state.movementUsed = false;
    }

    beginVolcano() {
      if (this.state.lavaTrack < 6 && this.state.lavaPool > 0) {
        this.state.lavaTrack += 1;
        this.state.lavaPool -= 1;
        this.log(`A lava counter drops to notch ${this.state.lavaTrack} of 6 on the cone.`, "lava");
        this.finishEvent();
        return;
      }
      this.state.phase = "event";
      if (this.state.lavaPool > 0) {
        this.state.pending = {
          type: "lava",
          mode: "place",
          remaining: Math.min(3, this.state.lavaPool),
          placedThisEvent: 0,
        };
      } else {
        this.state.pending = {
          type: "lava",
          mode: "remove",
          remaining: 3,
          removed: null,
        };
      }
    }

    legalLavaPlacements() {
      const lava = new Set(this.state.lavaCells);
      const candidates = new Set();
      if (!lava.size) candidates.add(VOLCANO_FLOOR_CELL);
      for (const id of lava) for (const n of BOARD[id].neighbours) candidates.add(n);
      const legal = [...candidates].filter((id) => {
        if (!BOARD[id] || lava.has(id)) return false;
        if (id === this.monsterCell() || this.dinosaurAt(id)) return false;
        if (terrain(id) === "swamp-edge") return false;
        return true;
      });
      const pending = this.state.pending;
      if (pending?.type === "lava" && pending.mode === "relocate-place" && pending.removed != null) {
        const genuinelyRelocated = legal.filter((id) => id !== pending.removed);
        // A relocation should change the flow whenever any alternative exists. If the
        // lifted counter was the only legal placement, allow the no-op as a safe fallback
        // so all thirty physical counters remain accounted for.
        return genuinelyRelocated.length ? genuinelyRelocated : legal;
      }
      return legal;
    }

    removableLavaCells() {
      const cells = this.state.lavaCells;
      return cells.filter((candidate) => {
        if (cells.length <= 1) return true;
        const remain = new Set(cells.filter((id) => id !== candidate));
        const start = remain.values().next().value;
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          const id = queue.shift();
          for (const n of BOARD[id].neighbours) {
            if (remain.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
          }
        }
        return seen.size === remain.size;
      });
    }

    placeLava(cell) {
      const pending = this.state.pending;
      if (this.state.phase !== "event" || !pending || pending.type !== "lava") throw new Error("No lava placement is pending");
      if (pending.mode === "remove") throw new Error("Choose a lava counter to lift first");
      if (!this.legalLavaPlacements().includes(cell)) throw new Error("Illegal lava placement");
      this.state.lavaCells.push(cell);
      if (pending.mode === "relocate-place") {
        pending.mode = "remove";
        pending.removed = null;
      } else {
        this.state.lavaPool -= 1;
        pending.placedThisEvent += 1;
      }
      const victims = this.explorersOnPhysicalCell(cell);
      for (const explorer of victims) this.killExplorer(explorer, "lava");
      this.log(`Lava spreads onto ${this.describeCell(cell)}${victims.length ? `, engulfing ${plural(victims.length, "explorer")}` : ""}.`, "lava");
      pending.remaining -= 1;
      if (pending.remaining <= 0) this.finishEvent();
      this.commit();
      return true;
    }

    removeLava(cell) {
      const pending = this.state.pending;
      if (this.state.phase !== "event" || !pending || pending.type !== "lava" || pending.mode !== "remove") throw new Error("No lava relocation is pending");
      if (!this.removableLavaCells().includes(cell)) throw new Error("That counter would split the lava flow");
      this.state.lavaCells = this.state.lavaCells.filter((id) => id !== cell);
      pending.removed = cell;
      pending.mode = "relocate-place";
      this.log(`A lava counter is lifted from ${this.describeCell(cell)}.`, "lava");
      this.commit();
      return true;
    }

    swampClockwiseDistance(fromIndex, toIndex) {
      return (Number(toIndex) - Number(fromIndex) + SWAMP_LOOP.length) % SWAMP_LOOP.length;
    }

    nearestSwampExit(index) {
      return SWAMP_EXIT_INDICES.slice().sort((a, b) =>
        this.swampClockwiseDistance(index, a) - this.swampClockwiseDistance(index, b))[0];
    }

    swampExitDestinations(index) {
      if (!SWAMP_EXIT_INDICES.includes(Number(index))) return [];
      const edgeCell = SWAMP_LOOP[Number(index)];
      return BOARD[edgeCell].neighbours.filter((id) =>
        !SWAMP_LOOP.includes(id) && this.isExplorerCellLegal(id) && isDryLand(id));
    }

    legalSwampPlacements() {
      return SWAMP_LOOP.map((_, index) => index).filter((index) => index !== this.state.monsterIndex);
    }

    moveMonster() {
      this.state.monsterIndex = (this.state.monsterIndex + 1) % SWAMP_LOOP.length;
      const boardVictims = this.explorersAt(this.monsterCell());
      const swampVictims = this.state.explorers.filter((e) => e.status === "swamp" && e.swampRoute == null && e.swampStep === this.state.monsterIndex);
      const victims = [...new Set(boardVictims.concat(swampVictims))];
      for (const explorer of victims) this.killExplorer(explorer, "swamp monster");
      this.log(`The swamp monster slides clockwise one grey arrow${victims.length ? ` and eats ${plural(victims.length, "explorer")}` : ""}.`, "monster");
    }

    pteranodonEligibleExplorers() {
      return this.state.explorers.filter((e) => e.status !== "dead");
    }

    selectPteranodonExplorer(explorerId) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "pteranodon" || pending.stage !== "select-explorer") throw new Error("The pteranodon is not choosing a passenger");
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.status === "dead") throw new Error("Invalid explorer");
      pending.explorer = explorerId;
      pending.stage = "place";
      this.commit();
    }

    legalPteranodonDestinations(explorerId) {
      const explorer = this.explorer(explorerId);
      if (!explorer) return [];
      const own = explorer.player === this.state.currentPlayer;
      const occupied = new Set(this.state.explorers.filter((e) => e.status === "board").map((e) => e.cell));
      const board = Object.keys(BOARD).filter((id) => {
        if (occupied.has(id) || this.dinosaurAt(id) || this.state.lavaCells.includes(id) || id === this.monsterCell()) return false;
        const t = terrain(id);
        if (["lair", "temple", "swamp-edge"].includes(t)) return false;
        if (own) return t !== "water";
        return true;
      }).map((id) => ({ kind: "board", id }));
      if (!own) {
        const occupiedInner = new Set(this.state.explorers
          .filter((e) => e.status === "swamp" && e.swampRoute != null)
          .map((e) => Number(e.swampRoute)));
        for (let i = 0; i < PTERANODON_SWAMP_INDICES.length; i += 1) {
          if (!occupiedInner.has(i)) board.push({ kind: "swamp", id: i });
        }
      }
      return board;
    }

    placePteranodon(destination) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "pteranodon" || pending.stage !== "place") throw new Error("No pteranodon passenger is selected");
      const explorer = this.explorer(pending.explorer);
      const legal = this.legalPteranodonDestinations(explorer.id);
      const dest = typeof destination === "string" ? { kind: "board", id: destination } : destination;
      if (!legal.some((x) => x.kind === dest.kind && String(x.id) === String(dest.id))) throw new Error("Illegal pteranodon destination");
      this.abandonTreasure(explorer);
      if (dest.kind === "swamp") {
        explorer.status = "swamp";
        explorer.cell = null;
        explorer.lair = null;
        explorer.swampRoute = Number(dest.id);
        explorer.swampStep = PTERANODON_SWAMP_INDICES[Number(dest.id)];
        this.log(`The pteranodon drops ${this.explorerName(explorer)} into the inner swamp.`, "pteranodon");
      } else {
        explorer.status = "board";
        explorer.cell = dest.id;
        explorer.lair = null;
        explorer.swampRoute = null;
        explorer.swampStep = null;
        this.log(`The pteranodon carries ${this.explorerName(explorer)} to ${this.describeCell(dest.id)}.`, "pteranodon");
      }
      this.finishEvent();
      this.commit();
    }

    skipPteranodon() {
      if (!this.state.pending || this.state.pending.type !== "pteranodon") throw new Error("No pteranodon event to skip");
      this.finishEvent("The pteranodon circles once and returns to its nest.");
      this.commit();
    }

    selectSwampVictim(explorerId, swampIndex = null) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "swamp-fall" || pending.stage !== "select-explorer") throw new Error("No swamp fall is pending");
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.player !== this.state.currentPlayer || ["dead", "lair", "swamp"].includes(explorer.status)) throw new Error("Invalid swamp victim");
      pending.explorer = explorerId;
      pending.stage = "select-space";
      if (swampIndex != null) return this.placeSwampVictim(swampIndex);
      this.commit();
      return true;
    }

    placeSwampVictim(swampIndex) {
      const pending = this.state.pending;
      const index = Number(swampIndex);
      if (!pending || pending.type !== "swamp-fall" || pending.stage !== "select-space") throw new Error("No swamp placement is pending");
      if (!this.legalSwampPlacements().includes(index)) throw new Error("That swamp space is occupied by the monster");
      const explorer = this.explorer(pending.explorer);
      this.abandonTreasure(explorer);
      explorer.status = "swamp";
      explorer.cell = null;
      explorer.lair = null;
      explorer.swampRoute = null;
      explorer.swampStep = index;
      const danger = this.swampClockwiseDistance(this.state.monsterIndex, index);
      this.log(`${this.explorerName(explorer)} falls into the swamp, ${danger} grey arrow${danger === 1 ? "" : "s"} ahead of the monster.`, "swamp");
      this.finishEvent();
      this.commit();
      return true;
    }

    selectSwampEscape(explorerId, destination = null) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "swamp-escape" || pending.stage !== "select-explorer") throw new Error("No swamp escape is pending");
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.player !== this.state.currentPlayer || explorer.status !== "swamp") throw new Error("Invalid swamp escape");
      const exitIndex = this.nearestSwampExit(explorer.swampStep);
      const targets = this.swampExitDestinations(exitIndex);
      if (!targets.length) {
        this.finishEvent("Lava has sealed every dry space beyond the nearest swamp exit.");
        this.commit();
        return false;
      }
      pending.explorer = explorerId;
      pending.exitIndex = exitIndex;
      pending.targets = targets;
      pending.stage = "select-destination";
      if (destination != null) return this.placeSwampEscape(destination);
      this.commit();
      return true;
    }

    placeSwampEscape(cell) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "swamp-escape" || pending.stage !== "select-destination") throw new Error("No swamp escape destination is pending");
      if (!pending.targets.includes(cell)) throw new Error("That space is not beyond the nearest swamp exit");
      const explorer = this.explorer(pending.explorer);
      explorer.status = "board";
      explorer.cell = cell;
      explorer.swampRoute = null;
      explorer.swampStep = null;
      this.log(`${this.explorerName(explorer)} scrambles onto dry ground beyond the nearest blue arrow.`, "swamp");
      this.finishEvent();
      this.commit();
      return true;
    }

    selectWaterExplorer(explorerId) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "water" || pending.stage !== "select-explorer") throw new Error("No water expedition is pending");
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.player !== this.state.currentPlayer || ["dead", "lair", "swamp"].includes(explorer.status)) throw new Error("Invalid explorer");
      pending.explorer = explorerId;
      pending.dice = this.rollDice(2);
      this.log(`${this.explorerName(explorer)} rolls ${pending.dice.rolls.join(" + ")} = ${pending.dice.total} for water.`, "dice");
      const targets = this.waterTargets(explorer, pending.dice.total);
      if (targets.length) {
        pending.stage = "select-water";
        pending.targets = targets;
      } else {
        const failures = this.waterFailureTargets(explorer, pending.dice.total);
        if (!failures.length) {
          this.log(`${this.explorerName(explorer)} cannot even enter the valley and dies of thirst.`, "loss");
          this.killExplorer(explorer, "thirst");
          this.finishEvent();
        } else {
          pending.stage = "select-failure";
          pending.targets = failures;
        }
      }
      this.commit();
      return pending.dice;
    }

    waterSearchStarts(explorer) {
      if (explorer.status === "outside") {
        return ENTRY_CELLS.filter((id) => this.isExplorerCellLegal(id)).map((id) => ({ id, d: 1, path: [id] }));
      }
      if (explorer.status === "temple") return [{ id: TEMPLE_CELL, d: 0, path: [TEMPLE_CELL] }];
      return explorer.cell && BOARD[explorer.cell] ? [{ id: explorer.cell, d: 0, path: [explorer.cell] }] : [];
    }

    waterTargets(explorer, maxSteps) {
      const result = new Map();
      const seen = new Map();
      const queue = this.waterSearchStarts(explorer);
      while (queue.length) {
        const cur = queue.shift();
        if (!BOARD[cur.id] || cur.d > maxSteps) continue;
        const old = seen.get(cur.id);
        if (old != null && old <= cur.d) continue;
        seen.set(cur.id, cur.d);
        if (isWater(cur.id)) {
          const existing = result.get(cur.id);
          if (!existing || cur.d < existing.distance) result.set(cur.id, { cell: cur.id, distance: cur.d, path: cur.path });
          continue; // normal movement ends as soon as the river is reached
        }
        for (const n of BOARD[cur.id].neighbours) {
          if (!this.isExplorerCellLegal(n) || n === TEMPLE_CELL) continue;
          queue.push({ id: n, d: cur.d + 1, path: cur.path.concat(n) });
        }
      }
      return [...result.values()].sort((a, b) => a.distance - b.distance || a.cell.localeCompare(b.cell));
    }

    waterFailureTargets(explorer, maxSteps) {
      const seen = new Map();
      const queue = this.waterSearchStarts(explorer);
      const candidates = [];
      while (queue.length) {
        const cur = queue.shift();
        if (!BOARD[cur.id] || cur.d > maxSteps || isWater(cur.id)) continue;
        const old = seen.get(cur.id);
        if (old != null && old <= cur.d) continue;
        seen.set(cur.id, cur.d);
        candidates.push({ cell: cur.id, distance: cur.d, path: cur.path });
        for (const n of BOARD[cur.id].neighbours) {
          if (!this.isExplorerCellLegal(n) || n === TEMPLE_CELL || isWater(n)) continue;
          queue.push({ id: n, d: cur.d + 1, path: cur.path.concat(n) });
        }
      }
      if (!candidates.length) return [];
      const farthest = Math.max(...candidates.map((x) => x.distance));
      return candidates.filter((x) => x.distance === farthest).sort((a, b) => a.cell.localeCompare(b.cell));
    }

    placeWaterExplorer(cell) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "water" || pending.stage !== "select-water") throw new Error("No water destination is pending");
      const target = pending.targets.find((t) => t.cell === cell);
      if (!target) throw new Error("That river cannot be reached on the roll");
      const explorer = this.explorer(pending.explorer);
      explorer.status = "board";
      explorer.cell = cell;
      explorer.lair = null;
      this.log(`${this.explorerName(explorer)} reaches the river with ${pending.dice.total - target.distance} movement to spare.`, "water");
      this.finishEvent();
      this.commit();
      return true;
    }

    placeWaterFailure(cell) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "water" || pending.stage !== "select-failure") throw new Error("No failed water route is pending");
      const target = pending.targets.find((t) => t.cell === cell);
      if (!target) throw new Error("That is not a legal final space");
      const explorer = this.explorer(pending.explorer);
      explorer.status = "board";
      explorer.cell = cell;
      explorer.lair = null;
      this.log(`${this.explorerName(explorer)} reaches ${this.describeCell(cell)} but not the river.`, "loss");
      this.killExplorer(explorer, "thirst");
      this.finishEvent();
      this.commit();
      return true;
    }

    fightEligible() {
      const p = this.state.pending;
      return p && p.type === "fight" ? p.eligible.map((id) => this.explorer(id)).filter(Boolean) : [];
    }

    fightExitDestinations(explorerId) {
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.status !== "lair" || !BOARD[explorer.lair]) return [];
      return (LAIR_EXIT_CELLS[explorer.lair] || [])
        .filter((id) => this.isExplorerCellLegal(id) && isDryLand(id));
    }

    selectFightExplorer(explorerId, exitCell = null) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "fight" || pending.stage !== "select-explorer" || !pending.eligible.includes(explorerId)) throw new Error("Invalid lair escape");
      const explorer = this.explorer(explorerId);
      const candidates = this.fightExitDestinations(explorerId);
      if (!candidates.length) {
        pending.eligible = pending.eligible.filter((id) => id !== explorerId);
        this.log(`Lava has sealed every footprint out of ${this.describeCell(explorer.lair)}.`, "lava");
        if (!pending.eligible.length) this.finishEvent("No captive can reach a footprint outside a lair.");
        this.commit();
        return false;
      }
      pending.explorer = explorerId;
      pending.targets = candidates;
      pending.stage = "select-destination";
      if (exitCell != null) return this.placeFightEscape(exitCell);
      this.commit();
      return true;
    }

    placeFightEscape(cell) {
      const pending = this.state.pending;
      if (!pending || pending.type !== "fight" || pending.stage !== "select-destination") throw new Error("No lair exit is pending");
      if (!pending.targets.includes(cell)) throw new Error("That is not a footprint outside the lair");
      const explorer = this.explorer(pending.explorer);
      explorer.status = "board";
      explorer.cell = cell;
      explorer.lair = null;
      this.log(`${this.explorerName(explorer)} escapes the lair while the dinosaurs fight.`, "escape");
      this.finishEvent();
      this.commit();
      return true;
    }

    dinosaurTasks() {
      const p = this.state.pending;
      return p && p.type === "dinosaur" ? p : null;
    }

    availableDinosaurs() {
      const p = this.dinosaurTasks();
      if (!p || p.selected) return [];
      return this.state.dinosaurs.filter((d) => !p.moved.includes(d.id) && this.legalDinosaurSteps(d.id, p.tasks[p.taskIndex], []).length);
    }

    selectDinosaur(dinosaurId) {
      const p = this.dinosaurTasks();
      if (!p || p.selected || p.capture) throw new Error("No dinosaur can be selected now");
      const dino = this.dinosaur(dinosaurId);
      if (!dino || p.moved.includes(dino.id) || !this.availableDinosaurs().some((x) => x.id === dinosaurId)) throw new Error("That dinosaur cannot make this move");
      p.selected = dino.id;
      p.stepsLeft = p.tasks[p.taskIndex];
      p.visited = [dino.cell];
      this.state.selectedDinosaur = dino.id;
      this.commit();
    }

    dinosaurBaseSteps(dinosaurId, fromCell, stepsLeft) {
      return BOARD[fromCell].neighbours.filter((id) => {
        if (this.state.lavaCells.includes(id) || id === TEMPLE_CELL) return false;
        if (terrain(id) === "swamp-edge") return false;
        const occupant = this.dinosaurAt(id);
        if (occupant && occupant.id !== dinosaurId) return false;
        if (terrain(id) === "lair" && stepsLeft !== 1) return false;
        if (this.explorersAt(id).length && !this.captureLairsFor(dinosaurId).length) return false;
        return true;
      });
    }

    dinosaurCanFinishFrom(dinosaurId, fromCell, stepsLeft) {
      if (stepsLeft <= 0) return true;
      for (const id of this.dinosaurBaseSteps(dinosaurId, fromCell, stepsLeft)) {
        // The printed rules let dinosaurs move freely; unlike explorers they may
        // retrace a hex. Entering explorers still ends the order immediately.
        if (this.explorersAt(id).length) return true;
        if (stepsLeft === 1) return true;
        if (this.dinosaurCanFinishFrom(dinosaurId, id, stepsLeft - 1)) return true;
      }
      return false;
    }

    legalDinosaurSteps(dinosaurId, stepsLeft = null) {
      const dino = this.dinosaur(dinosaurId);
      if (!dino) return [];
      const p = this.dinosaurTasks();
      const remaining = stepsLeft == null ? (p ? p.stepsLeft : 1) : stepsLeft;
      return this.dinosaurBaseSteps(dinosaurId, dino.cell, remaining).filter((id) => {
        if (this.explorersAt(id).length || remaining === 1) return true;
        return this.dinosaurCanFinishFrom(dinosaurId, id, remaining - 1);
      });
    }

    moveDinosaurStep(cell) {
      const p = this.dinosaurTasks();
      if (!p || !p.selected || p.capture) throw new Error("No dinosaur is moving");
      const dino = this.dinosaur(p.selected);
      if (!this.legalDinosaurSteps(dino.id).includes(cell)) throw new Error("Illegal dinosaur step");
      dino.cell = cell;
      p.visited.push(cell);
      p.stepsLeft -= 1;
      const victims = this.explorersAt(cell);
      if (victims.length) {
        for (const explorer of victims) this.abandonTreasure(explorer, cell);
        p.capture = { dinosaur: dino.id, explorers: victims.map((e) => e.id) };
        this.log(`${this.dinosaurName(dino)} catches ${plural(victims.length, "explorer")} at ${this.describeCell(cell)}.`, "capture");
      } else if (p.stepsLeft <= 0) {
        this.completeDinosaurTask();
      } else if (!this.legalDinosaurSteps(dino.id).length) {
        this.log(`${this.dinosaurName(dino)} is blocked before completing its full move.`, "dinosaur");
        this.completeDinosaurTask();
      }
      this.commit();
    }

    captureLairsFor(dinosaurId) {
      return LAIR_CELLS.filter((cell) => {
        if (this.state.lavaCells.includes(cell)) return false;
        const d = this.dinosaurAt(cell);
        return !d || d.id === dinosaurId;
      });
    }

    availableCaptureLairs() {
      const p = this.dinosaurTasks();
      if (!p || !p.capture) return [];
      return this.captureLairsFor(p.capture.dinosaur);
    }

    selectCaptureLair(cell) {
      const p = this.dinosaurTasks();
      if (!p || !p.capture || !this.availableCaptureLairs().includes(cell)) throw new Error("Invalid capture lair");
      const dino = this.dinosaur(p.capture.dinosaur);
      dino.cell = cell;
      const victims = p.capture.explorers.map((id) => this.explorer(id)).filter(Boolean);
      for (const explorer of victims) {
        explorer.status = "lair";
        explorer.cell = null;
        explorer.lair = cell;
        explorer.swampRoute = null;
        explorer.swampStep = null;
      }
      if (p.attack) {
        const eaten = this.state.explorers.filter((e) => e.status === "lair" && e.lair === cell);
        for (const explorer of eaten) this.killExplorer(explorer, "dinosaur attack");
        this.log(`${this.dinosaurName(dino)} reaches ${this.describeCell(cell)}. ${plural(eaten.length, "captive")} ${eaten.length === 1 ? "is" : "are"} eaten alive.`, "loss");
      } else {
        this.log(`${this.dinosaurName(dino)} drags its captives to ${this.describeCell(cell)}.`, "capture");
      }
      p.capture = null;
      this.completeDinosaurTask();
      this.commit();
    }

    completeDinosaurTask() {
      const p = this.dinosaurTasks();
      if (!p || !p.selected) return;
      p.moved.push(p.selected);
      p.selected = null;
      p.stepsLeft = 0;
      p.visited = [];
      this.state.selectedDinosaur = null;
      p.taskIndex += 1;
      if (p.taskIndex >= p.tasks.length || p.moved.length >= this.state.dinosaurs.length) this.finishEvent();
    }

    skipDinosaurTask() {
      const p = this.dinosaurTasks();
      if (!p || p.selected || p.capture || p.taskIndex >= p.tasks.length) throw new Error("No dinosaur order can be skipped now");
      if (this.availableDinosaurs().length) throw new Error("At least one unused dinosaur can complete this order");
      const distance = p.tasks[p.taskIndex];
      this.log(`No unused dinosaur can complete the ${distance}-space order; that order is skipped.`, "dinosaur");
      p.taskIndex += 1;
      if (p.taskIndex >= p.tasks.length || p.moved.length >= this.state.dinosaurs.length) this.finishEvent();
      this.commit();
      return true;
    }

    isExplorerCellLegal(id) {
      if (!BOARD[id] || this.state.lavaCells.includes(id) || this.dinosaurAt(id) || id === this.monsterCell()) return false;
      const t = terrain(id);
      return t !== "lair" && t !== "swamp-edge";
    }

    canMoveExplorer(explorerId) {
      const explorer = typeof explorerId === "string" ? this.explorer(explorerId) : explorerId;
      if (!explorer || explorer.status === "dead") return false;
      if (explorer.status === "lair" && this.dinosaurAt(explorer.lair)) return false;
      if (explorer.status === "swamp") {
        if (explorer.swampRoute != null) return explorer.swampStep !== this.state.monsterIndex;
        if (SWAMP_EXIT_INDICES.includes(explorer.swampStep)) return this.swampExitDestinations(explorer.swampStep).length > 0;
        return (explorer.swampStep + 1) % SWAMP_LOOP.length !== this.state.monsterIndex;
      }
      if (explorer.status === "outside") return ENTRY_CELLS.some((id) => this.isExplorerCellLegal(id));
      // Reaching any printed valley arrow is itself a legal move: an explorer may
      // leave without spending the rest of the roll, even when lava has sealed
      // every neighbouring interior space.
      if (explorer.status === "board" && ENTRY_CELLS.includes(explorer.cell)) return true;
      const source = explorer.status === "lair" ? explorer.lair : explorer.cell;
      return Boolean(source && BOARD[source] && BOARD[source].neighbours.some((id) => this.isExplorerCellLegal(id)));
    }

    selectExplorer(explorerId) {
      if (this.state.phase !== "movement" || this.state.movementUsed) throw new Error("It is not time to choose an explorer");
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.player !== this.state.currentPlayer || explorer.status === "dead") throw new Error("Invalid explorer");
      if (!this.canMoveExplorer(explorer)) throw new Error(explorer.status === "lair" ? "A dinosaur or the terrain blocks that lair" : "That explorer has no legal move");
      this.state.selectedExplorer = explorer.id;
      const startTerrain = explorer.status === "board" ? terrain(explorer.cell) : null;
      if (explorer.status === "swamp") {
        this.state.phase = "moving";
        this.state.movement = { explorer: explorer.id, rolls: [], total: 1, remaining: 1, visited: [], originWater: false, exact: true, special: "swamp" };
      } else if (startTerrain === "water") {
        this.state.phase = "moving";
        this.state.movement = { explorer: explorer.id, rolls: [], total: 1, remaining: 1, visited: [explorer.cell], originWater: true, exact: true, special: null };
      } else {
        this.state.phase = "await-roll";
        this.state.movement = { explorer: explorer.id, rolls: [], total: 0, remaining: 0, visited: explorer.cell ? [explorer.cell] : [], originWater: false, exact: true, special: null };
      }
      this.commit();
    }

    rollMovement() {
      if (this.state.phase !== "await-roll" || !this.state.movement) throw new Error("No movement roll is pending");
      const explorer = this.explorer(this.state.movement.explorer);
      const count = explorer.treasure ? 2 : 1;
      const dice = this.rollDice(count);
      Object.assign(this.state.movement, dice, { remaining: dice.total });
      this.state.phase = "moving";
      this.log(`${this.explorerName(explorer)} rolls ${dice.rolls.join(" + ")} = ${dice.total}.`, "dice");
      if (!this.legalExplorerSteps().length && !this.canEscapeValley()) {
        this.log(`${this.explorerName(explorer)} has no legal route and stays put.`, "move");
        this.finishMovement(false);
      }
      this.commit();
      return dice;
    }

    legalExplorerSteps() {
      if (this.state.phase !== "moving" || !this.state.movement) return [];
      const move = this.state.movement;
      const explorer = this.explorer(move.explorer);
      if (explorer.status === "swamp") {
        if (explorer.swampRoute != null) {
          return explorer.swampStep === this.state.monsterIndex ? [] : [{ kind: "swamp", id: explorer.swampStep }];
        }
        if (SWAMP_EXIT_INDICES.includes(explorer.swampStep)) {
          return this.swampExitDestinations(explorer.swampStep).map((id) => ({ kind: "board", id }));
        }
        const next = (explorer.swampStep + 1) % SWAMP_LOOP.length;
        return next === this.state.monsterIndex ? [] : [{ kind: "swamp", id: next }];
      }
      if (explorer.status === "outside") {
        return ENTRY_CELLS.filter((id) => this.isExplorerCellLegal(id)).map((id) => ({ kind: "board", id }));
      }
      if (explorer.status === "lair") {
        return BOARD[explorer.lair].neighbours.filter((id) => this.isExplorerCellLegal(id)).map((id) => ({ kind: "board", id }));
      }
      const source = explorer.cell;
      const visited = new Set(move.visited);
      return BOARD[source].neighbours.filter((id) => {
        if (visited.has(id) || !this.isExplorerCellLegal(id)) return false;
        return true;
      }).map((id) => ({ kind: "board", id }));
    }

    moveExplorerStep(destination) {
      if (this.state.phase !== "moving" || !this.state.movement) throw new Error("No explorer is moving");
      const move = this.state.movement;
      const explorer = this.explorer(move.explorer);
      const dest = typeof destination === "string" ? { kind: "board", id: destination } : destination;
      if (!this.legalExplorerSteps().some((x) => x.kind === dest.kind && String(x.id) === String(dest.id))) throw new Error("Illegal explorer step");
      if (explorer.status === "swamp") {
        if (dest.kind === "swamp") {
          explorer.swampStep = Number(dest.id);
          // A pteranodon passenger begins on one of the four separate inner
          // swamp spaces. Once they move, they join the shared grey-arrow path.
          explorer.swampRoute = null;
          this.log(`${this.explorerName(explorer)} struggles one grey arrow through the swamp.`, "swamp");
        } else {
          explorer.status = "board";
          explorer.cell = dest.id;
          explorer.swampRoute = null;
          explorer.swampStep = null;
          this.log(`${this.explorerName(explorer)} reaches dry land beyond a blue exit arrow.`, "swamp");
        }
        move.remaining = 0;
        this.finishMovement(true);
        this.commit();
        return;
      }
      const origin = explorer.status === "board" ? explorer.cell : null;
      explorer.status = "board";
      explorer.cell = dest.id;
      explorer.lair = null;
      move.visited.push(dest.id);
      move.remaining -= 1;
      if (dest.id === TEMPLE_CELL) {
        this.enterTemple(explorer);
        this.finishMovement(false);
      } else if (isWater(dest.id) && !move.originWater && !(origin && isWater(origin))) {
        const exactRiverArrival = move.remaining <= 0;
        move.exact = exactRiverArrival;
        this.log(`${this.explorerName(explorer)} wades into the river; movement ends.`, "water");
        this.finishMovement(exactRiverArrival);
      } else if (move.remaining <= 0) {
        this.finishMovement(true);
      } else if (!this.legalExplorerSteps().length) {
        move.exact = false;
        this.log(`${this.explorerName(explorer)} can go no farther.`, "move");
        this.finishMovement(false);
      }
      this.commit();
    }

    canEscapeValley() {
      if (this.state.phase !== "moving" || !this.state.movement) return false;
      const explorer = this.explorer(this.state.movement.explorer);
      return explorer && explorer.status === "board" && ENTRY_CELLS.includes(explorer.cell);
    }

    escapeValley() {
      if (!this.canEscapeValley()) throw new Error("This explorer is not at a valley exit");
      const explorer = this.explorer(this.state.movement.explorer);
      if (explorer.treasure) {
        explorer.treasure = false;
        this.player(explorer.player).banked += 1;
        this.log(`${this.explorerName(explorer)} carries a treasure coin out of the valley!`, "treasure");
      } else {
        this.log(`${this.explorerName(explorer)} leaves the valley empty-handed.`, "move");
      }
      explorer.status = "outside";
      explorer.cell = null;
      this.finishMovement(false);
      this.commit();
    }

    enterTemple(explorer) {
      explorer.status = "temple";
      explorer.cell = TEMPLE_CELL;
      if (!explorer.treasure && this.state.templeTreasure > 0) {
        explorer.treasure = true;
        this.state.templeTreasure -= 1;
        this.log(`${this.explorerName(explorer)} takes one coin from the temple roof.`, "treasure");
      } else {
        this.log(`${this.explorerName(explorer)} enters the temple.`, "move");
      }
    }

    finishMovement(exact) {
      const move = this.state.movement;
      const explorer = move ? this.explorer(move.explorer) : null;
      if (explorer && exact && explorer.status === "board" && !explorer.treasure) {
        const count = this.state.looseTreasure[explorer.cell] || 0;
        if (count > 0) {
          explorer.treasure = true;
          if (count === 1) delete this.state.looseTreasure[explorer.cell];
          else this.state.looseTreasure[explorer.cell] = count - 1;
          this.log(`${this.explorerName(explorer)} claims an abandoned treasure coin by exact count.`, "treasure");
        }
      }
      if (explorer && explorer.status === "board" && AMMO_CELLS.includes(explorer.cell)) this.collectAmmo(explorer.player, explorer.cell);
      this.state.movementUsed = true;
      this.state.phase = "post-move";
      this.state.selectedExplorer = null;
      this.state.movement = null;
      this.checkEndConditions();
    }

    collectAmmo(playerId, cell) {
      const player = this.player(playerId);
      if (!player.gunCards.length || this.state.ammo[cell] <= 0) return false;
      this.state.ammo[cell] -= 1;
      player.bullets += 1;
      this.log(`${player.name} takes one bullet from the ammo dump.`, "ammo");
      return true;
    }

    canUseSecret(explorer) {
      const player = this.player(explorer.player);
      return player.secretCards.length > 0 && (explorer.status === "temple" || (explorer.status === "board" && CAVE_CELLS.includes(explorer.cell)));
    }

    secretDestinations(explorerId) {
      const explorer = this.explorer(explorerId);
      if (!explorer || explorer.player !== this.state.currentPlayer || !this.canUseSecret(explorer)) return [];
      if (explorer.status === "temple") return CAVE_CELLS.filter((id) => this.isExplorerCellLegal(id));
      return this.isExplorerCellLegal(TEMPLE_CELL) ? [TEMPLE_CELL] : [];
    }

    useSecretPath(explorerId, destination = null) {
      if (!["movement", "post-move"].includes(this.state.phase)) throw new Error("The secret path can only be used around your movement");
      const explorer = this.explorer(explorerId);
      const destinations = this.secretDestinations(explorerId);
      if (!destinations.length) throw new Error("No secret passage is available");
      const dest = destination && destinations.includes(destination) ? destination : destinations[0];
      const player = this.player(explorer.player);
      const card = player.secretCards.shift();
      this.state.discard.push(card);
      if (dest === TEMPLE_CELL) this.enterTemple(explorer);
      else { explorer.status = "board"; explorer.cell = dest; explorer.lair = null; }
      this.log(`${this.explorerName(explorer)} uses the one-way secret passage.`, "secret");
      this.commit();
    }

    startBullet() {
      if (!["movement", "post-move"].includes(this.state.phase)) throw new Error("Bullets are used before or after explorer movement");
      const player = this.currentPlayer();
      if (!player.gunCards.length || player.bullets <= 0) throw new Error("No bullet is available");
      this.state.pending = { type: "bullet", stage: "select-dinosaur", returnPhase: this.state.phase, dinosaur: null };
      this.state.phase = "bullet";
      this.commit();
    }

    selectBulletDinosaur(dinosaurId) {
      const p = this.state.pending;
      if (this.state.phase !== "bullet" || !p || p.type !== "bullet" || p.stage !== "select-dinosaur") throw new Error("No bullet target is pending");
      const dino = this.dinosaur(dinosaurId);
      if (!dino) throw new Error("Invalid dinosaur");
      p.dinosaur = dinosaurId;
      p.stage = "move";
      this.commit();
    }

    legalBulletDestinations(dinosaurId) {
      const dino = this.dinosaur(dinosaurId);
      if (!dino) return [];
      return BOARD[dino.cell].neighbours.filter((id) => {
        if (this.state.lavaCells.includes(id) || id === TEMPLE_CELL || terrain(id) === "swamp-edge" || this.dinosaurAt(id)) return false;
        if (this.explorersAt(id).length && !this.captureLairsFor(dino.id).length) return false;
        return true;
      });
    }

    moveBulletDinosaur(cell) {
      const p = this.state.pending;
      if (this.state.phase !== "bullet" || !p || p.type !== "bullet" || p.stage !== "move") throw new Error("No frightened dinosaur is moving");
      if (!this.legalBulletDestinations(p.dinosaur).includes(cell)) throw new Error("Illegal bullet move");
      const player = this.currentPlayer();
      player.bullets -= 1;
      const dino = this.dinosaur(p.dinosaur);
      dino.cell = cell;
      const victims = this.explorersAt(cell);
      if (victims.length) {
        for (const explorer of victims) this.abandonTreasure(explorer, cell);
        p.stage = "capture";
        p.capture = { dinosaur: dino.id, explorers: victims.map((e) => e.id) };
        this.log(`A gunshot drives ${this.dinosaurName(dino)} onto ${plural(victims.length, "explorer")}. Choose their lair.`, "ammo");
      } else {
        this.log(`A gunshot frightens ${this.dinosaurName(dino)} one space.`, "ammo");
        this.state.phase = p.returnPhase;
        this.state.pending = null;
      }
      this.commit();
      return true;
    }

    availableBulletCaptureLairs() {
      const p = this.state.pending;
      if (this.state.phase !== "bullet" || !p || p.type !== "bullet" || p.stage !== "capture") return [];
      return this.captureLairsFor(p.capture.dinosaur);
    }

    selectBulletCaptureLair(cell) {
      const p = this.state.pending;
      if (this.state.phase !== "bullet" || !p || p.type !== "bullet" || p.stage !== "capture") throw new Error("No bullet capture is pending");
      if (!this.availableBulletCaptureLairs().includes(cell)) throw new Error("Invalid capture lair");
      const dino = this.dinosaur(p.capture.dinosaur);
      dino.cell = cell;
      for (const id of p.capture.explorers) {
        const explorer = this.explorer(id);
        if (!explorer || explorer.status === "dead") continue;
        explorer.status = "lair";
        explorer.cell = null;
        explorer.lair = cell;
        explorer.swampRoute = null;
        explorer.swampStep = null;
      }
      this.log(`${this.dinosaurName(dino)} drags the captured expedition to ${this.describeCell(cell)}.`, "capture");
      this.state.phase = p.returnPhase;
      this.state.pending = null;
      this.commit();
      return true;
    }

    cancelBullet() {
      const p = this.state.pending;
      if (this.state.phase !== "bullet" || !p || p.type !== "bullet" || p.stage === "capture") return false;
      this.state.phase = p.returnPhase;
      this.state.pending = null;
      this.commit();
      return true;
    }

    endTurn() {
      if (this.state.phase === "movement" && !this.hasMovableExplorer(this.state.currentPlayer)) {
        this.log(`${this.currentPlayer().name} has nobody able to move.`, "turn");
      } else if (this.state.phase !== "post-move") {
        throw new Error("Explorer movement has not finished");
      }
      if (this.checkEndConditions()) { this.commit(); return; }
      this.state.currentPlayer = (this.state.currentPlayer + 1) % this.state.players.length;
      if (this.state.currentPlayer === 0) this.state.turn += 1;
      this.state.phase = "pass";
      this.state.pending = null;
      this.state.currentCard = null;
      this.state.selectedExplorer = null;
      this.state.selectedDinosaur = null;
      this.state.movement = null;
      this.state.movementUsed = false;
      this.commit();
    }

    hasMovableExplorer(playerId) {
      return this.livingExplorers(playerId).some((e) => this.canMoveExplorer(e));
    }

    abandonTreasure(explorer, fallbackCell = null) {
      if (!explorer.treasure) return false;
      explorer.treasure = false;
      const cell = explorer.status === "board" ? explorer.cell : fallbackCell;
      if (cell && BOARD[cell]) this.state.looseTreasure[cell] = (this.state.looseTreasure[cell] || 0) + 1;
      else this.state.templeTreasure += 1;
      this.log(`${this.explorerName(explorer)} abandons a treasure coin.`, "treasure");
      return true;
    }

    killExplorer(explorer, cause) {
      this.abandonTreasure(explorer, explorer.cell);
      explorer.status = "dead";
      explorer.cell = null;
      explorer.lair = null;
      explorer.swampRoute = null;
      explorer.swampStep = null;
      this.log(`${this.explorerName(explorer)} is lost to ${cause}.`, "loss");
    }


    claimableTreasureCoins() {
      const buried = new Set(this.state.lavaCells);
      const temple = buried.has(TEMPLE_CELL) ? 0 : this.state.templeTreasure;
      const loose = Object.entries(this.state.looseTreasure).reduce((sum, [cell, count]) => sum + (buried.has(cell) ? 0 : count), 0);
      const carried = this.state.explorers.filter((e) => e.status !== "dead" && e.treasure).length;
      return temple + loose + carried;
    }

    checkEndConditions() {
      if (this.state.winner != null || (this.state.winners && this.state.winners.length)) return true;
      const target = this.state.config.targetCoins;
      const winner = this.state.players.find((p) => p.banked >= target);
      if (winner) {
        this.state.winner = winner.id;
        this.state.winners = [winner.id];
        this.state.endReason = `${winner.name} brought ${plural(target, "treasure coin")} out of the valley.`;
        this.state.phase = "game-over";
        this.log(`${winner.name} wins the expedition!`, "win");
        return true;
      }
      const living = this.state.explorers.filter((e) => e.status !== "dead");
      const availableCoins = this.claimableTreasureCoins();
      if (!living.length || availableCoins === 0) {
        const bestCoins = Math.max(...this.state.players.map((p) => p.banked));
        const coinLeaders = this.state.players.filter((p) => p.banked === bestCoins);
        const bestSurvivors = Math.max(...coinLeaders.map((p) => this.livingExplorers(p.id).length));
        const winners = coinLeaders.filter((p) => this.livingExplorers(p.id).length === bestSurvivors);
        this.state.winner = winners[0].id;
        this.state.winners = winners.map((p) => p.id);
        const base = !living.length ? "Every explorer was lost." : "No treasure remained claimable.";
        this.state.endReason = winners.length > 1
          ? `${base} ${winners.map((p) => p.name).join(" and ")} share the result after the printed coin-and-survivor comparison.`
          : `${base} ${winners[0].name} leads after the printed coin-and-survivor comparison.`;
        this.state.phase = "game-over";
        this.log(winners.length > 1
          ? `${winners.map((p) => p.name).join(" and ")} share victory after the printed comparison.`
          : `${winners[0].name} wins on the printed coin-and-survivor comparison.`, "win");
        return true;
      }
      return false;
    }

    chooseCaptureLair(dinoId, victims = [], activePlayer = this.state.currentPlayer) {
      const available = this.captureLairsFor(dinoId);
      if (!available.length) return this.dinosaur(dinoId).homeLair;
      const opponentVictim = victims.some((e) => e.player !== activePlayer);
      return available.slice().sort((a, b) => {
        const da = this.distanceToNearestEntry(a);
        const db = this.distanceToNearestEntry(b);
        return opponentVictim ? db - da : da - db;
      })[0];
    }

    distanceToNearestEntry(cell) {
      return Math.min(...ENTRY_CELLS.map((entry) => this.shortestDistance(cell, entry, { dinosaur: true })));
    }

    shortestDistance(start, target, options = {}) {
      if (start === target) return 0;
      if (!BOARD[start] || !BOARD[target]) return Infinity;
      const queue = [{ id: start, d: 0 }];
      const seen = new Set([start]);
      while (queue.length) {
        const cur = queue.shift();
        for (const n of BOARD[cur.id].neighbours) {
          if (seen.has(n)) continue;
          if (this.state.lavaCells.includes(n)) continue;
          if (options.explorer && (!this.isExplorerCellLegal(n) || terrain(n) === "lair")) continue;
          if (options.dinosaur && (terrain(n) === "swamp-edge" || n === TEMPLE_CELL)) continue;
          if (n === target) return cur.d + 1;
          seen.add(n);
          queue.push({ id: n, d: cur.d + 1 });
        }
      }
      return Infinity;
    }

    shortestPath(start, targets, options = {}) {
      const targetSet = new Set(Array.isArray(targets) ? targets : [targets]);
      if (targetSet.has(start)) return [start];
      const queue = [start];
      const prev = new Map([[start, null]]);
      while (queue.length) {
        const cur = queue.shift();
        for (const n of BOARD[cur].neighbours) {
          if (prev.has(n) || this.state.lavaCells.includes(n)) continue;
          if (options.explorer) {
            if (!this.isExplorerCellLegal(n) && !targetSet.has(n)) continue;
            if (terrain(n) === "lair") continue;
          }
          if (options.dinosaur && (terrain(n) === "swamp-edge" || n === TEMPLE_CELL || this.dinosaurAt(n))) continue;
          prev.set(n, cur);
          if (targetSet.has(n)) {
            const path = [n];
            let p = cur;
            while (p != null) { path.push(p); p = prev.get(p); }
            return path.reverse();
          }
          queue.push(n);
        }
      }
      return [];
    }

    describeCell(id) {
      if (id === TEMPLE_CELL) return "the temple";
      if (ENTRY_CELLS.includes(id)) return `entrance ${ENTRY_CELLS.indexOf(id) + 1}`;
      if (LAIR_CELLS.includes(id)) return `lair ${LAIR_CELLS.indexOf(id) + 1}`;
      if (CAVE_CELLS.includes(id)) return "a cave mouth";
      if (AMMO_CELLS.includes(id)) return "an ammo dump";
      const names = { water: "the river", bridge: "a bridge", jungle: "dense flowers", "swamp-edge": "the swamp rim", plain: "the valley floor" };
      return names[terrain(id)] || id;
    }
    explorerName(explorer) { return `${this.player(explorer.player).style.symbol} explorer ${explorer.index + 1}`; }
    dinosaurName(dino) { return `Tyrannosaur ${Number(dino.id.slice(1)) + 1}`; }

    // -------- AI / autoplay -------------------------------------------------

    autoStep() {
      if (this.state.phase === "game-over") return false;
      if (this.state.phase === "pass") { this.readyNextTurn(); return true; }
      if (this.state.phase === "draw") { this.drawCard(); return true; }
      if (this.state.phase === "event") return this.autoEventStep();
      if (this.state.phase === "movement") return this.autoMovementStart();
      if (this.state.phase === "await-roll") { this.rollMovement(); return true; }
      if (this.state.phase === "moving") return this.autoMovementStep();
      if (this.state.phase === "post-move") { this.endTurn(); return true; }
      if (this.state.phase === "bullet") {
        const p = this.state.pending;
        if (p?.stage === "capture") {
          const victims = p.capture.explorers.map((id) => this.explorer(id)).filter(Boolean);
          this.selectBulletCaptureLair(this.chooseCaptureLair(p.capture.dinosaur, victims, this.state.currentPlayer));
        } else this.cancelBullet();
        return true;
      }
      throw new Error(`No auto action for phase ${this.state.phase}`);
    }

    autoEventStep() {
      const p = this.state.pending;
      if (!p) { this.finishEvent(); this.commit(); return true; }
      if (p.type === "lava") {
        if (p.mode === "remove") {
          const options = this.removableLavaCells();
          this.removeLava(this.rng.pick(options));
        } else {
          const options = this.legalLavaPlacements();
          if (!options.length) { this.finishEvent("The lava has nowhere legal to spread."); this.commit(); }
          else this.placeLava(this.bestLavaCell(options));
        }
        return true;
      }
      if (p.type === "pteranodon") {
        if (p.stage === "select-explorer") {
          const own = this.explorersFor(this.state.currentPlayer).filter((e) => e.status !== "dead");
          const rescue = own.find((e) => e.status === "lair" || e.status === "swamp" || (e.treasure && e.status === "board"));
          const enemyCarrier = this.state.explorers.find((e) => e.player !== this.state.currentPlayer && e.treasure && e.status !== "dead");
          const chosen = rescue || enemyCarrier || own.find((e) => e.status === "outside") || this.rng.pick(this.pteranodonEligibleExplorers());
          if (!chosen) this.skipPteranodon(); else this.selectPteranodonExplorer(chosen.id);
        } else {
          const explorer = this.explorer(p.explorer);
          const legal = this.legalPteranodonDestinations(explorer.id);
          if (!legal.length) this.skipPteranodon();
          else if (explorer.player !== this.state.currentPlayer) {
            const inner = legal.filter((d) => d.kind === "swamp");
            this.placePteranodon(this.rng.pick(inner.length ? inner : legal));
          } else {
            const destinations = legal.filter((d) => d.kind === "board");
            const goals = explorer.treasure ? ENTRY_CELLS : [TEMPLE_CELL];
            destinations.sort((a, b) => this.goalDistance(a.id, goals) - this.goalDistance(b.id, goals));
            if (destinations.length) this.placePteranodon(destinations[0]);
            else this.skipPteranodon();
          }
        }
        return true;
      }
      if (p.type === "swamp-fall") {
        if (p.stage === "select-explorer") {
          const eligible = this.explorersFor(this.state.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
          eligible.sort((a, b) => this.swampVictimScore(a) - this.swampVictimScore(b));
          this.selectSwampVictim(eligible[0].id);
        } else {
          const options = this.legalSwampPlacements();
          options.sort((a, b) => {
            const da = this.swampClockwiseDistance(this.state.monsterIndex, a);
            const db = this.swampClockwiseDistance(this.state.monsterIndex, b);
            const ea = this.swampClockwiseDistance(a, this.nearestSwampExit(a));
            const eb = this.swampClockwiseDistance(b, this.nearestSwampExit(b));
            return (db - eb * .25) - (da - ea * .25);
          });
          this.placeSwampVictim(options[0]);
        }
        return true;
      }
      if (p.type === "swamp-escape") {
        if (p.stage === "select-explorer") {
          const explorer = this.explorersFor(this.state.currentPlayer).find((e) => e.status === "swamp");
          this.selectSwampEscape(explorer.id);
        } else this.placeSwampEscape(p.targets[0]);
        return true;
      }
      if (p.type === "water") {
        if (p.stage === "select-explorer") {
          const eligible = this.explorersFor(this.state.currentPlayer).filter((e) => !["dead", "lair", "swamp"].includes(e.status));
          eligible.sort((a, b) => {
            const at = this.waterTargets(a, 12);
            const bt = this.waterTargets(b, 12);
            return (at[0]?.distance ?? 99) - (bt[0]?.distance ?? 99);
          });
          this.selectWaterExplorer(eligible[0].id);
        } else if (p.stage === "select-water") this.placeWaterExplorer(p.targets[0].cell);
        else this.placeWaterFailure(p.targets[0].cell);
        return true;
      }
      if (p.type === "fight") {
        if (p.stage === "select-destination") this.placeFightEscape(p.targets[0]);
        else {
          const eligible = this.fightEligible();
          const own = eligible.find((e) => e.player === this.state.currentPlayer);
          this.selectFightExplorer((own || eligible[0]).id);
        }
        return true;
      }
      if (p.type === "dinosaur") {
        if (p.capture) {
          this.selectCaptureLair(this.chooseCaptureLair(p.capture.dinosaur, p.capture.explorers.map((id) => this.explorer(id)), this.state.currentPlayer));
        } else if (!p.selected) {
          const available = this.availableDinosaurs();
          if (!available.length) this.skipDinosaurTask();
          else {
            available.sort((a, b) => this.dinosaurChoiceScore(b, p.tasks[p.taskIndex]) - this.dinosaurChoiceScore(a, p.tasks[p.taskIndex]));
            this.selectDinosaur(available[0].id);
          }
        } else {
          const options = this.legalDinosaurSteps(p.selected);
          if (!options.length) { this.completeDinosaurTask(); this.commit(); }
          else {
            options.sort((a, b) => this.dinosaurStepScore(p.selected, b) - this.dinosaurStepScore(p.selected, a));
            this.moveDinosaurStep(options[0]);
          }
        }
        return true;
      }
      throw new Error(`No auto event action for ${p.type}`);
    }

    bestLavaCell(options) {
      return options.slice().sort((a, b) => this.lavaScore(b) - this.lavaScore(a))[0];
    }
    lavaScore(cell) {
      const occupants = this.explorersOnPhysicalCell(cell);
      let score = occupants.reduce((sum, e) => sum + (e.player === this.state.currentPlayer ? -100 : (e.treasure ? 180 : 90)), 0);
      for (const e of this.state.explorers) {
        if (e.status !== "board") continue;
        const d = this.shortestDistance(cell, e.cell, {});
        if (d <= 2) score += e.player === this.state.currentPlayer ? -8 : 10;
      }
      return score + this.rng.next();
    }
    swampVictimScore(e) {
      let s = 0;
      if (e.treasure) s += 100;
      if (e.status === "outside") s -= 30;
      if (e.status === "temple") s += 30;
      if (e.status === "board") s += 20 - this.goalDistance(e.cell, [TEMPLE_CELL]);
      return s;
    }
    dinosaurChoiceScore(dino, steps) {
      let best = -Infinity;
      for (const n of this.legalDinosaurSteps(dino.id, steps, [dino.cell])) best = Math.max(best, this.dinosaurStepScore(dino.id, n));
      return best;
    }
    dinosaurStepScore(dinoId, cell) {
      const occupants = this.explorersAt(cell);
      let score = occupants.reduce((sum, e) => sum + (e.player === this.state.currentPlayer ? -140 : (e.treasure ? 220 : 100)), 0);
      const opponents = this.state.explorers.filter((e) => e.status === "board" && e.player !== this.state.currentPlayer);
      if (opponents.length) score += Math.max(...opponents.map((e) => 18 - this.shortestDistance(cell, e.cell, { dinosaur: true }) * 3));
      const own = this.state.explorers.filter((e) => e.status === "board" && e.player === this.state.currentPlayer);
      if (own.length) score -= Math.max(...own.map((e) => Math.max(0, 8 - this.shortestDistance(cell, e.cell, { dinosaur: true }) * 2)));
      if (terrain(cell) === "lair") score -= 4;
      return score + this.rng.next();
    }

    autoMovementStart() {
      const player = this.currentPlayer();
      if (!this.hasMovableExplorer(player.id)) { this.endTurn(); return true; }
      const secretCandidate = this.explorersFor(player.id).find((e) => this.secretDestinations(e.id).length > 0 && ((e.status === "board" && !e.treasure) || (e.status === "temple" && e.treasure)));
      if (secretCandidate) {
        const destinations = this.secretDestinations(secretCandidate.id);
        this.useSecretPath(secretCandidate.id, destinations[0]);
        return true;
      }
      const candidates = this.explorersFor(player.id).filter((e) => this.canMoveExplorer(e));
      candidates.sort((a, b) => this.explorerPriority(b) - this.explorerPriority(a));
      if (!candidates.length) { this.endTurn(); return true; }
      this.selectExplorer(candidates[0].id);
      return true;
    }

    explorerPriority(e) {
      if (e.status === "swamp") return 500 - (e.swampStep || 0) * 10;
      let score = e.treasure ? 1000 : 0;
      if (e.status === "temple") score += e.treasure ? 500 : 200;
      if (e.status === "lair") score += 80;
      if (e.status === "outside") score += 20;
      if (e.status === "board") {
        const goals = e.treasure ? ENTRY_CELLS : [TEMPLE_CELL];
        score += 120 - this.goalDistance(e.cell, goals) * 5;
      }
      return score + this.rng.next();
    }

    goalDistance(cell, goals) {
      if (!cell) return 99;
      return Math.min(...goals.map((g) => this.shortestDistance(cell, g, { explorer: true })));
    }

    autoMovementStep() {
      const move = this.state.movement;
      const explorer = this.explorer(move.explorer);
      if (this.canEscapeValley() && (explorer.treasure || move.remaining <= 1)) { this.escapeValley(); return true; }
      const legal = this.legalExplorerSteps();
      if (!legal.length) { this.finishMovement(false); this.commit(); return true; }
      if (explorer.status === "swamp") { this.moveExplorerStep(legal[0]); return true; }
      const goals = explorer.treasure ? ENTRY_CELLS : [TEMPLE_CELL];
      const scored = legal.map((dest) => {
        if (dest.kind !== "board") return { dest, score: 999 };
        let score = this.goalDistance(dest.id, goals);
        if (isWater(dest.id) && !move.originWater) score += 3;
        const nearDino = this.state.dinosaurs.reduce((m, d) => Math.min(m, this.shortestDistance(dest.id, d.cell, {})), Infinity);
        if (nearDino <= 1) score += 8;
        if (this.state.looseTreasure[dest.id] && move.remaining === 1 && !explorer.treasure) score -= 20;
        return { dest, score: score + this.rng.next() * 0.1 };
      }).sort((a, b) => a.score - b.score);
      this.moveExplorerStep(scored[0].dest);
      return true;
    }

    assertInvariants() {
      const s = this.state;
      const dinoCells = s.dinosaurs.map((d) => d.cell);
      if (new Set(dinoCells).size !== dinoCells.length) throw new Error("Invariant: dinosaurs share a space");
      for (const d of s.dinosaurs) {
        if (!BOARD[d.cell]) throw new Error(`Invariant: dinosaur off board ${d.id}`);
        if (s.lavaCells.includes(d.cell)) throw new Error(`Invariant: dinosaur in lava ${d.id}`);
        if (terrain(d.cell) === "swamp-edge" || d.cell === TEMPLE_CELL) throw new Error(`Invariant: dinosaur in forbidden terrain ${d.id}`);
      }
      if (new Set(s.lavaCells).size !== s.lavaCells.length) throw new Error("Invariant: duplicate lava counter");
      const lavaInHand = s.pending && s.pending.type === "lava" && s.pending.mode === "relocate-place" ? 1 : 0;
      if (s.lavaPool + s.lavaTrack + s.lavaCells.length + lavaInHand !== 30) throw new Error("Invariant: lava counter total changed");
      for (const id of s.lavaCells) if (!BOARD[id] || terrain(id) === "swamp-edge") throw new Error(`Invariant: illegal lava at ${id}`);
      const coinTotal = s.templeTreasure
        + Object.values(s.looseTreasure).reduce((a, b) => a + b, 0)
        + s.explorers.filter((e) => e.treasure).length
        + s.players.reduce((a, p) => a + p.banked, 0);
      if (coinTotal !== 12) throw new Error(`Invariant: treasure total ${coinTotal}`);
      for (const e of s.explorers) {
        if (e.status === "board" && !BOARD[e.cell]) throw new Error(`Invariant: explorer ${e.id} on bad cell`);
        if (["board", "temple"].includes(e.status) && s.lavaCells.includes(e.cell)) throw new Error(`Invariant: explorer ${e.id} in lava`);
        if (e.status === "temple" && e.cell !== TEMPLE_CELL) throw new Error(`Invariant: explorer ${e.id} in bad temple`);
        if (e.status === "lair" && !LAIR_CELLS.includes(e.lair)) throw new Error(`Invariant: explorer ${e.id} in bad lair`);
        if (e.status === "lair" && s.lavaCells.includes(e.lair)) throw new Error(`Invariant: explorer ${e.id} in a lava-filled lair`);
        if (e.status === "swamp" && (!Number.isInteger(e.swampStep) || e.swampStep < 0 || e.swampStep >= SWAMP_LOOP.length)) {
          throw new Error(`Invariant: explorer ${e.id} on bad swamp arrow`);
        }
        if (e.status === "swamp" && e.swampRoute != null && (!Number.isInteger(e.swampRoute) || e.swampRoute < 0 || e.swampRoute >= PTERANODON_SWAMP_INDICES.length)) {
          throw new Error(`Invariant: explorer ${e.id} on bad inner swamp space`);
        }
        if (e.status !== "swamp" && (e.swampStep != null || e.swampRoute != null)) throw new Error(`Invariant: explorer ${e.id} retains a swamp location`);
        if (e.status === "dead" && e.treasure) throw new Error(`Invariant: dead explorer ${e.id} has treasure`);
      }
      if (s.currentPlayer < 0 || s.currentPlayer >= s.players.length) throw new Error("Invariant: bad active player");
      if (!Array.isArray(s.winners)) throw new Error("Invariant: winners is not an array");
      if (s.winners.some((id) => !s.players[id])) throw new Error("Invariant: bad winner id");
      const heldCards = s.players.reduce((n, p) => n + p.gunCards.length + p.secretCards.length, 0);
      const cardTotal = s.deck.length + s.discard.length + heldCards + (s.currentCard ? 1 : 0);
      if (cardTotal !== 54) throw new Error(`Invariant: card total ${cardTotal}`);
      return true;
    }
  }

  return {
    VERSION,
    Game,
    RNG,
    BOARD,
    CARD_DEFS,
    buildDeck,
    PLAYER_STYLES,
    ENTRY_CELLS,
    LAIR_CELLS,
    LAIR_EXIT_CELLS,
    CAVE_CELLS,
    AMMO_CELLS,
    TEMPLE_CELL,
    VOLCANO_FLOOR_CELL,
    SWAMP_LOOP,
    SWAMP_EXIT_INDICES,
    PTERANODON_SWAMP_INDICES,
    SWAMP_ROUTES,
    terrain,
    isWater,
    parseCell,
  };
});
