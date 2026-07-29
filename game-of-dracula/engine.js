/*
 * Game of Dracula — deterministic rules engine
 * Original implementation for the 0x4D44 Almanac.
 *
 * The engine follows the surviving 1977/78 instructions and contemporary
 * descriptions. A handful of underspecified points are deliberately isolated
 * in RESTORATION_RULES and documented in RESEARCH.md.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DraculaEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;

  const PLAYER_STYLES = [
    { name: "Crimson", colour: "#e8453c", dark: "#7c1718", symbol: "●" },
    { name: "Cobalt", colour: "#2879c9", dark: "#123d75", symbol: "▲" },
    { name: "Emerald", colour: "#2ea76b", dark: "#145b3a", symbol: "■" },
    { name: "Sunshine", colour: "#f2c72f", dark: "#7c6410", symbol: "◆" },
  ];

  const DEFAULT_NAMES = ["Crimson Guest", "Cobalt Guest", "Emerald Guest", "Sunshine Guest"];

  const RESTORATION_RULES = Object.freeze({
    // The surviving sheet says to move the exact number of yellow stones but
    // does not state whether a stone may be revisited in the same move. The
    // digital table forbids revisits to remove infinite loops and make every
    // highlighted destination unambiguous.
    noStoneRevisit: true,
    // Public descriptions identify the Blue Vampire as a component but do not
    // preserve its bite consequence. This restoration sends one exposed guest
    // to the vault, matching later Dracula bites.
    blueVampireSendsToVault: true,
    // When several exposed guests share a room, one physical engulfing piece
    // can cover only one pawn. The active menace chooses the guest closest to
    // an exit; a human Green Vampire may choose directly.
    oneVictimPerEncounter: true,
    // A released Green Vampire is placed in the nearest safe hidey-hole in the
    // room, reflecting period recollections of the former vampire diving for
    // cover as the mask changes hands.
    releasedVampireFindsCover: true,
  });

  const ROOMS = Object.freeze([
    { id: "north", name: "Moonlit Battlements", short: "Battlements", fill: "#ead7a1" },
    { id: "west", name: "West Tower", short: "West Tower", fill: "#9fc66a" },
    { id: "rose", name: "Rose Chamber", short: "Rose Chamber", fill: "#e99bb7" },
    { id: "hall", name: "The Great Hall", short: "Great Hall", fill: "#f3eee0" },
    { id: "east", name: "East Tower", short: "East Tower", fill: "#9fc66a" },
    { id: "gallery", name: "Portrait Gallery", short: "Gallery", fill: "#e99bb7" },
    { id: "chapel", name: "Ruined Chapel", short: "Chapel", fill: "#9fc66a" },
    { id: "court", name: "Inner Courtyard", short: "Courtyard", fill: "#f3eee0" },
    { id: "vault", name: "Dracula's Vault", short: "The Vault", fill: "#8f503d" },
    { id: "gate", name: "The Gatehouse", short: "Gatehouse", fill: "#e8c27f" },
  ]);

  function node(id, x, y, room, extra) {
    return Object.assign({ id, x, y, room, kind: "stone" }, extra || {});
  }

  const NODE_LIST = [
    node("s0", 135, 82, "north", { kind: "start", start: 0 }),
    node("n1", 215, 82, "north"),
    node("s1", 315, 82, "north", { kind: "start", start: 1 }),
    node("n3", 405, 82, "north"),
    node("n4", 500, 82, "north"),
    node("n5", 595, 82, "north"),
    node("s2", 685, 82, "north", { kind: "start", start: 2 }),
    node("n7", 785, 82, "north"),
    node("s3", 865, 82, "north", { kind: "start", start: 3 }),

    node("w0", 205, 155, "west"),
    node("w1", 140, 215, "west"),
    node("w2", 170, 285, "west", { hide: true, perch: 1 }),
    node("w3", 250, 325, "west"),
    node("w4", 325, 280, "west"),
    node("w5", 300, 195, "west", { hide: true }),

    node("c0", 415, 155, "hall"),
    node("c1", 385, 225, "hall"),
    node("c2", 435, 300, "hall", { hide: true }),
    node("c3", 500, 365, "hall"),
    node("c4", 565, 300, "hall"),
    node("c5", 615, 225, "hall", { hide: true }),
    node("c6", 585, 155, "hall"),

    node("e0", 795, 155, "east"),
    node("e1", 860, 215, "east"),
    node("e2", 830, 285, "east", { hide: true, perch: 3 }),
    node("e3", 750, 325, "east"),
    node("e4", 675, 280, "east"),
    node("e5", 700, 195, "east", { hide: true }),

    node("lw0", 270, 385, "rose"),
    node("lw1", 185, 420, "rose", { hide: true, perch: 2 }),
    node("lw2", 135, 495, "rose"),
    node("lw3", 205, 565, "rose"),
    node("lw4", 305, 565, "rose", { hide: true }),
    node("lw5", 355, 490, "rose"),
    node("lw6", 330, 420, "rose"),

    node("re0", 730, 385, "gallery"),
    node("re1", 815, 420, "gallery", { hide: true, perch: 4 }),
    node("re2", 865, 495, "gallery"),
    node("re3", 795, 565, "gallery"),
    node("re4", 695, 565, "gallery", { hide: true }),
    node("re5", 645, 490, "gallery"),
    node("re6", 670, 420, "gallery"),

    node("m0", 500, 430, "court"),
    node("m1", 455, 500, "court", { hide: true }),
    node("m2", 500, 575, "court"),
    node("m3", 545, 500, "court", { hide: true }),
    node("m4", 540, 430, "court"),

    node("v0", 205, 630, "vault"),
    node("vault", 125, 685, "vault", { kind: "vault", hide: true }),
    node("v2", 190, 735, "vault"),
    node("v3", 285, 690, "chapel", { hide: true }),
    node("home-left", 355, 748, "gate", { kind: "home", home: true }),

    node("g0", 795, 630, "gate"),
    node("g1", 875, 685, "gate", { hide: true, perch: 6 }),
    node("g2", 810, 735, "gate"),
    node("g3", 715, 690, "chapel", { hide: true, perch: 5 }),
    node("home-right", 645, 748, "gate", { kind: "home", home: true }),

    node("x0", 400, 635, "chapel"),
    node("x1", 500, 665, "chapel", { hide: true }),
    node("x2", 600, 635, "chapel"),
  ];

  const NODES = Object.fromEntries(NODE_LIST.map((entry) => [entry.id, entry]));

  const EDGE_LIST = [
    ["s0", "n1"], ["n1", "s1"], ["s1", "n3"], ["n3", "n4"], ["n4", "n5"], ["n5", "s2"], ["s2", "n7"], ["n7", "s3"],
    ["n1", "w0"], ["w0", "w1"], ["w1", "w2"], ["w2", "w3"], ["w3", "w4"], ["w4", "w5"], ["w5", "w0"], ["w5", "s1"],
    ["n3", "c0"], ["c0", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "c5"], ["c5", "c6"], ["c6", "n5"], ["c1", "w4"],
    ["n7", "e0"], ["e0", "e1"], ["e1", "e2"], ["e2", "e3"], ["e3", "e4"], ["e4", "e5"], ["e5", "e0"], ["e5", "s2"], ["c5", "e4"],
    ["w3", "lw0"], ["lw0", "lw1"], ["lw1", "lw2"], ["lw2", "lw3"], ["lw3", "lw4"], ["lw4", "lw5"], ["lw5", "lw6"], ["lw6", "lw0"], ["lw5", "c3"],
    ["e3", "re0"], ["re0", "re1"], ["re1", "re2"], ["re2", "re3"], ["re3", "re4"], ["re4", "re5"], ["re5", "re6"], ["re6", "re0"], ["re5", "c3"],
    ["c3", "m0"], ["m0", "m1"], ["m1", "m2"], ["m2", "m3"], ["m3", "m4"], ["m4", "c3"], ["m1", "lw5"], ["m3", "re5"],
    ["lw3", "v0"], ["v0", "vault"], ["vault", "v2"], ["v2", "v3"], ["v3", "home-left"], ["v3", "x0"],
    ["re3", "g0"], ["g0", "g1"], ["g1", "g2"], ["g2", "g3"], ["g3", "home-right"], ["g3", "x2"],
    ["m2", "x1"], ["x0", "x1"], ["x1", "x2"], ["x0", "v3"], ["x2", "g3"], ["x0", "home-left"], ["x2", "home-right"],
  ];

  const ADJACENCY = Object.fromEntries(NODE_LIST.map((entry) => [entry.id, []]));
  for (const [a, b] of EDGE_LIST) {
    ADJACENCY[a].push(b);
    ADJACENCY[b].push(a);
  }

  function edgeKey(a, b) { return [a, b].sort().join("|"); }

  const CANDLE_EDGES = new Set([
    edgeKey("w4", "c1"),
    edgeKey("c5", "e4"),
    edgeKey("lw5", "c3"),
    edgeKey("re5", "c3"),
    edgeKey("m1", "lw5"),
    edgeKey("m3", "re5"),
    edgeKey("m2", "x1"),
  ]);

  const START_NODES = ["s0", "s1", "s2", "s3"];
  const HOME_NODES = new Set(["home-left", "home-right"]);
  const HIDE_NODES = new Set(NODE_LIST.filter((entry) => entry.hide).map((entry) => entry.id));
  const PERCHES = Object.freeze({
    1: { number: 1, colour: "green", node: "w2", room: NODES.w2.room },
    2: { number: 2, colour: "green", node: "lw1", room: NODES.lw1.room },
    3: { number: 3, colour: "green", node: "e2", room: NODES.e2.room },
    4: { number: 4, colour: "green", node: "re1", room: NODES.re1.room },
    5: { number: 5, colour: "blue", node: "g3", room: NODES.g3.room },
    6: { number: 6, colour: "blue", node: "g1", room: NODES.g1.room },
  });

  // The red pools form a separate clockwise-looking line on the board; Dracula
  // advances through this array counter-clockwise from the coffin.
  const DRACULA_TRACK = Object.freeze([
    { x: 100, y: 690, room: "vault", label: "coffin" },
    { x: 150, y: 625, room: "vault" },
    { x: 205, y: 590, room: "rose" },
    { x: 150, y: 530, room: "rose" },
    { x: 115, y: 455, room: "rose" },
    { x: 125, y: 350, room: "west" },
    { x: 105, y: 275, room: "west" },
    { x: 120, y: 185, room: "west" },
    { x: 210, y: 125, room: "north" },
    { x: 330, y: 125, room: "north" },
    { x: 455, y: 125, room: "hall" },
    { x: 555, y: 170, room: "hall" },
    { x: 665, y: 125, room: "north" },
    { x: 790, y: 125, room: "north" },
    { x: 875, y: 185, room: "east" },
    { x: 895, y: 275, room: "east" },
    { x: 875, y: 365, room: "east" },
    { x: 900, y: 455, room: "gallery" },
    { x: 860, y: 545, room: "gallery" },
    { x: 845, y: 635, room: "gate" },
    { x: 780, y: 690, room: "gate" },
    { x: 680, y: 640, room: "chapel" },
    { x: 590, y: 590, room: "court" },
    { x: 630, y: 500, room: "gallery" },
    { x: 610, y: 410, room: "hall" },
    { x: 535, y: 345, room: "hall" },
    { x: 450, y: 405, room: "hall" },
    { x: 390, y: 485, room: "rose" },
    { x: 360, y: 585, room: "chapel" },
    { x: 270, y: 635, room: "vault" },
  ]);

  // Eighteen equally sized outer sectors, reconstructed from the surviving
  // spinner card. Red sectors pair Dracula 1–6 with a yellow-stone move of 3
  // or 4. Coloured sectors move the matching vampire to its numbered perch.
  const SPINNER = Object.freeze([
    { id: "g3", type: "vampire", colour: "green", outer: 3, inner: "VAMPIRE", angle: 10 },
    { id: "b6", type: "vampire", colour: "blue", outer: 6, inner: "VAMPIRE", angle: 30 },
    { id: "g4", type: "vampire", colour: "green", outer: 4, inner: "VAMPIRE", angle: 50 },
    { id: "r6-3", type: "red", colour: "red", outer: 6, inner: 3, angle: 70 },
    { id: "r5-3", type: "red", colour: "red", outer: 5, inner: 3, angle: 90 },
    { id: "r4-3", type: "red", colour: "red", outer: 4, inner: 3, angle: 110 },
    { id: "r3-4", type: "red", colour: "red", outer: 3, inner: 4, angle: 130 },
    { id: "r2-4", type: "red", colour: "red", outer: 2, inner: 4, angle: 150 },
    { id: "r1-4", type: "red", colour: "red", outer: 1, inner: 4, angle: 170 },
    { id: "g1", type: "vampire", colour: "green", outer: 1, inner: "VAMPIRE", angle: 190 },
    { id: "b5", type: "vampire", colour: "blue", outer: 5, inner: "VAMPIRE", angle: 210 },
    { id: "g2", type: "vampire", colour: "green", outer: 2, inner: "VAMPIRE", angle: 230 },
    { id: "r1-3", type: "red", colour: "red", outer: 1, inner: 3, angle: 250 },
    { id: "r2-3", type: "red", colour: "red", outer: 2, inner: 3, angle: 270 },
    { id: "r3-3", type: "red", colour: "red", outer: 3, inner: 3, angle: 290 },
    { id: "r4-4", type: "red", colour: "red", outer: 4, inner: 4, angle: 310 },
    { id: "r5-4", type: "red", colour: "red", outer: 5, inner: 4, angle: 330 },
    { id: "r6-4", type: "red", colour: "red", outer: 6, inner: 4, angle: 350 },
  ]);

  class RNG {
    constructor(seed) {
      let value = Number(seed);
      if (!Number.isFinite(value)) value = Date.now();
      value = (value >>> 0) || 0x4d44d2ac;
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
    pick(list) { return list.length ? list[this.int(list.length)] : null; }
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function deterministicUnit(...parts) {
    const text = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0x100000000;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isIntegerIn(value, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum;
  }

  function assertSaved(condition, message) {
    if (!condition) throw new Error(`Invalid saved game: ${message}.`);
  }

  function validatePath(path, steps, green) {
    assertSaved(Array.isArray(path) && path.length === steps + 1, "move path has the wrong length");
    assertSaved(path.every((id) => typeof id === "string" && NODES[id]), "move path contains an unknown stone");
    assertSaved(new Set(path).size === path.length, "move path repeats a stone");
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      assertSaved(ADJACENCY[from].includes(to), "move path crosses a missing edge");
      assertSaved(!(green && CANDLE_EDGES.has(edgeKey(from, to))), "Green path crosses candles");
      assertSaved(!HOME_NODES.has(from), "move continues after HOME");
    }
    assertSaved(!(green && HOME_NODES.has(path[path.length - 1])), "Green path enters HOME");
  }

  function validateSavedState(data) {
    assertSaved(isPlainObject(data), "root state is not an object");
    assertSaved(data.version === VERSION, "unsupported version");
    assertSaved(isIntegerIn(data.seed, 1, 0xffffffff), "seed is out of range");
    assertSaved(isIntegerIn(data.rngState, 1, 0xffffffff), "random state is out of range");
    assertSaved(isPlainObject(data.config), "configuration is missing");
    assertSaved(typeof data.config.hints === "boolean", "hint setting is not boolean");
    assertSaved(Array.isArray(data.config.players) && isIntegerIn(data.config.players.length, 2, 4), "configuration has an invalid player count");
    const count = data.config.players.length;
    assertSaved(Array.isArray(data.players) && data.players.length === count, "player records do not match configuration");

    data.config.players.forEach((entry, id) => {
      assertSaved(isPlainObject(entry), `configuration player ${id} is malformed`);
      assertSaved(typeof entry.name === "string" && entry.name.trim().length > 0 && entry.name.length <= 28, `configuration player ${id} has an invalid name`);
      assertSaved(typeof entry.human === "boolean", `configuration player ${id} has an invalid controller`);
      entry.style = PLAYER_STYLES[id];
    });

    const allowedStatuses = new Set(["human", "green-vampire"]);
    data.players.forEach((player, id) => {
      assertSaved(isPlainObject(player), `player ${id} is malformed`);
      assertSaved(player.id === id, `player ${id} has the wrong id`);
      assertSaved(typeof player.name === "string" && player.name.trim().length > 0 && player.name.length <= 28, `player ${id} has an invalid name`);
      assertSaved(typeof player.human === "boolean", `player ${id} has an invalid controller`);
      assertSaved(allowedStatuses.has(player.status), `player ${id} has an invalid status`);
      assertSaved(typeof player.node === "string" && NODES[player.node], `player ${id} is on an unknown stone`);
      for (const field of ["bites", "blueBites", "curses", "cursePasses"]) {
        assertSaved(isIntegerIn(player[field], 0, Number.MAX_SAFE_INTEGER), `player ${id} has an invalid ${field} count`);
      }
      assertSaved(typeof player.escaped === "boolean", `player ${id} has an invalid escaped flag`);
      player.style = PLAYER_STYLES[id];
    });

    assertSaved(isIntegerIn(data.startingPlayer, 0, count - 1), "opening player is invalid");
    assertSaved(isIntegerIn(data.currentPlayer, 0, count - 1), "current player is invalid");
    assertSaved(isIntegerIn(data.round, 1, Number.MAX_SAFE_INTEGER), "round is invalid");
    assertSaved(isIntegerIn(data.turn, 1, Number.MAX_SAFE_INTEGER), "turn is invalid");
    assertSaved(isIntegerIn(data.actionSerial, 0, Number.MAX_SAFE_INTEGER), "action serial is invalid");
    assertSaved(isIntegerIn(data.draculaIndex, 0, DRACULA_TRACK.length - 1), "Dracula position is invalid");

    const phases = new Set(["await-spin", "await-move", "await-victim", "gameover"]);
    assertSaved(phases.has(data.phase), "phase is invalid");
    assertSaved(data.winner === null || isIntegerIn(data.winner, 0, count - 1), "winner is invalid");
    assertSaved(data.endReason === null || typeof data.endReason === "string", "end reason is invalid");

    assertSaved(isPlainObject(data.green), "Green Vampire record is missing");
    assertSaved(data.green.holder === null || isIntegerIn(data.green.holder, 0, count - 1), "Green holder is invalid");
    assertSaved(typeof data.green.node === "string" && NODES[data.green.node], "Green Vampire is on an unknown stone");
    assertSaved(isIntegerIn(data.green.perch, 1, 4), "Green perch is invalid");
    assertSaved(isPlainObject(data.blue), "Blue Vampire record is missing");
    assertSaved(isIntegerIn(data.blue.perch, 5, 6), "Blue perch is invalid");
    assertSaved(data.blue.node === PERCHES[data.blue.perch].node, "Blue Vampire is not on its perch");

    const greenPlayers = data.players.filter((player) => player.status === "green-vampire");
    if (data.green.holder === null) {
      assertSaved(greenPlayers.length === 0, "a player wears an unowned Green mask");
    } else {
      assertSaved(greenPlayers.length === 1 && greenPlayers[0].id === data.green.holder, "Green holder and player status disagree");
      assertSaved(data.players[data.green.holder].node === data.green.node, "Green holder and piece positions disagree");
      assertSaved(!data.players[data.green.holder].escaped, "escaped player still wears the Green mask");
    }

    assertSaved(data.spinner === null || isPlainObject(data.spinner), "spinner result is malformed");
    if (data.spinner !== null) {
      const canonical = SPINNER.find((entry) => entry.id === data.spinner.id);
      assertSaved(Boolean(canonical), "spinner result is unknown");
      data.spinner = clone(canonical);
    }

    assertSaved(isPlainObject(data.stats), "statistics are missing");
    for (const field of ["spins", "bites", "cursePasses", "vaultReturns"]) {
      assertSaved(isIntegerIn(data.stats[field], 0, Number.MAX_SAFE_INTEGER), `statistics field ${field} is invalid`);
    }
    assertSaved(Array.isArray(data.log) && data.log.length <= 80, "night ledger is invalid");
    data.log.forEach((entry) => {
      assertSaved(isPlainObject(entry) && isIntegerIn(entry.turn, 1, Number.MAX_SAFE_INTEGER), "night ledger entry is malformed");
      assertSaved(typeof entry.text === "string" && typeof entry.type === "string", "night ledger entry text is malformed");
    });

    if (data.phase === "await-spin") {
      assertSaved(data.pending === null, "spin phase has a pending action");
      assertSaved(data.winner === null, "spin phase has a winner");
    } else if (data.phase === "await-move") {
      const pending = data.pending;
      assertSaved(isPlainObject(pending) && pending.kind === "move", "move phase has the wrong pending action");
      assertSaved(pending.playerId === data.currentPlayer, "pending mover is not the current player");
      assertSaved(isIntegerIn(pending.steps, 3, 4), "pending move count is invalid");
      assertSaved(typeof pending.green === "boolean", "pending Green flag is invalid");
      assertSaved(pending.green === (data.players[pending.playerId].status === "green-vampire"), "pending Green flag and player status disagree");
      assertSaved(Array.isArray(pending.options) && pending.options.length > 0, "pending move has no options");
      const start = pending.green ? data.green.node : data.players[pending.playerId].node;
      const legal = exactPaths(start, pending.steps, { green: pending.green });
      const seen = new Set();
      pending.options.forEach((option) => {
        assertSaved(isPlainObject(option) && typeof option.destination === "string", "move option is malformed");
        assertSaved(!seen.has(option.destination), "move options repeat a destination");
        seen.add(option.destination);
        validatePath(option.path, pending.steps, pending.green);
        assertSaved(option.path[0] === start && option.path[option.path.length - 1] === option.destination, "move option endpoints disagree");
        assertSaved(legal.has(option.destination), "move option is not reachable");
        assertSaved(JSON.stringify(legal.get(option.destination)) === JSON.stringify(option.path), "move option path was altered");
      });
      const legalDestinations = Array.from(legal.keys()).filter((destination) => !(pending.green && HOME_NODES.has(destination)));
      assertSaved(seen.size === legalDestinations.length && legalDestinations.every((destination) => seen.has(destination)), "move option set is incomplete");
      assertSaved(data.winner === null, "move phase has a winner");
    } else if (data.phase === "await-victim") {
      const pending = data.pending;
      assertSaved(isPlainObject(pending) && pending.kind === "green-victim", "victim phase has the wrong pending action");
      assertSaved(data.green.holder !== null && pending.chooser === data.green.holder, "victim chooser is not the Green holder");
      assertSaved(Array.isArray(pending.victims) && pending.victims.length > 0, "victim phase has no victims");
      assertSaved(typeof pending.room === "string" && ROOMS.some((room) => room.id === pending.room), "victim room is invalid");
      assertSaved(pending.room === NODES[data.green.node].room, "victim room and Green position disagree");
      const expected = data.players.filter((player) => (
        player.id !== pending.chooser && player.status === "human" && !player.escaped &&
        NODES[player.node].room === pending.room && !HIDE_NODES.has(player.node)
      )).map((player) => player.id).sort((a, b) => a - b);
      const actual = pending.victims.slice().sort((a, b) => a - b);
      assertSaved(new Set(actual).size === actual.length && JSON.stringify(actual) === JSON.stringify(expected), "victim list was altered");
      assertSaved(pending.resume === "end-turn", "victim continuation is invalid");
      assertSaved(data.winner === null, "victim phase has a winner");
    } else {
      assertSaved(data.pending === null, "finished game has a pending action");
      assertSaved(data.winner !== null, "finished game has no winner");
      const winner = data.players[data.winner];
      assertSaved(winner.escaped && winner.status === "human" && HOME_NODES.has(winner.node), "winner state is inconsistent");
      assertSaved(typeof data.endReason === "string" && data.endReason.length > 0, "finished game has no reason");
    }

    data.players.forEach((player) => {
      if (player.escaped) assertSaved(data.winner === player.id && HOME_NODES.has(player.node), `player ${player.id} has an invalid escaped state`);
    });
    return data;
  }

  function roomName(roomId) {
    const found = ROOMS.find((room) => room.id === roomId);
    return found ? found.name : roomId;
  }

  function graphDistance(start, goals, options) {
    const goalSet = goals instanceof Set ? goals : new Set(Array.isArray(goals) ? goals : [goals]);
    const queue = [[start, 0]];
    const seen = new Set([start]);
    const green = options && options.green;
    while (queue.length) {
      const [at, distance] = queue.shift();
      if (goalSet.has(at)) return distance;
      for (const next of ADJACENCY[at] || []) {
        if (seen.has(next)) continue;
        if (green && CANDLE_EDGES.has(edgeKey(at, next))) continue;
        seen.add(next);
        queue.push([next, distance + 1]);
      }
    }
    return Infinity;
  }

  function exactPaths(start, steps, options) {
    const green = options && options.green;
    const results = new Map();
    const visit = (at, left, path, seen) => {
      if (left === 0) {
        if (!results.has(at)) results.set(at, path.slice());
        return;
      }
      for (const next of ADJACENCY[at] || []) {
        if (green && CANDLE_EDGES.has(edgeKey(at, next))) continue;
        if (RESTORATION_RULES.noStoneRevisit && seen.has(next)) continue;
        // A doorway ends movement: nobody walks out of HOME and back in.
        if (HOME_NODES.has(at)) continue;
        const nextSeen = new Set(seen);
        nextSeen.add(next);
        path.push(next);
        if (HOME_NODES.has(next)) {
          if (left === 1 && !results.has(next)) results.set(next, path.slice());
        } else {
          visit(next, left - 1, path, nextSeen);
        }
        path.pop();
      }
    };
    visit(start, steps, [start], new Set([start]));
    return results;
  }

  function progressScore(nodeId) {
    const distance = graphDistance(nodeId, HOME_NODES);
    return Number.isFinite(distance) ? 100 - distance : 0;
  }

  class Game {
    constructor(config, seed) {
      const cfg = config || {};
      const requested = Number(cfg.playerCount || (cfg.players && cfg.players.length) || 2);
      const count = Math.min(4, Math.max(2, requested));
      const cfgPlayers = Array.isArray(cfg.players) ? cfg.players : [];
      this.rng = new RNG(seed == null ? Date.now() : seed);
      const initialSeed = this.rng.state;
      const forcedFirst = Number(cfg.firstPlayer);
      const firstPlayer = Number.isInteger(forcedFirst) ? ((forcedFirst % count) + count) % count : this.rng.int(count);
      this.events = [];
      this.state = {
        version: VERSION,
        seed: initialSeed,
        rngState: this.rng.state,
        config: {
          hints: cfg.hints !== false,
          players: Array.from({ length: count }, (_, id) => ({
            name: (cfgPlayers[id] && String(cfgPlayers[id].name || "").trim()) || DEFAULT_NAMES[id],
            human: cfgPlayers[id] ? cfgPlayers[id].human !== false : id === 0,
            style: PLAYER_STYLES[id],
          })),
        },
        players: [],
        startingPlayer: firstPlayer,
        currentPlayer: firstPlayer,
        round: 1,
        turn: 1,
        phase: "await-spin",
        pending: null,
        spinner: null,
        draculaIndex: 0,
        green: { holder: null, node: PERCHES[1].node, perch: 1 },
        blue: { node: PERCHES[6].node, perch: 6 },
        winner: null,
        endReason: null,
        log: [],
        stats: { spins: 0, bites: 0, cursePasses: 0, vaultReturns: 0 },
        actionSerial: 0,
      };
      this.state.players = this.state.config.players.map((entry, id) => ({
        id,
        name: entry.name,
        human: entry.human,
        style: entry.style,
        status: "human",
        node: START_NODES[id],
        bites: 0,
        blueBites: 0,
        curses: 0,
        cursePasses: 0,
        escaped: false,
      }));
      this._emit("game-start", { playerCount: count, startingPlayer: firstPlayer }, `${count} guests enter Castle Dracula. ${this.state.players[firstPlayer].name} wins the opening spin.`);
      this._syncRng();
    }

    static restore(serialized) {
      let data;
      try {
        data = typeof serialized === "string" ? JSON.parse(serialized) : clone(serialized);
      } catch (_) {
        throw new Error("Invalid saved game: unreadable JSON.");
      }
      validateSavedState(data);
      const game = Object.create(Game.prototype);
      game.state = data;
      game.rng = new RNG(data.rngState);
      game.rng.state = data.rngState >>> 0;
      game.events = [];
      return game;
    }

    serialize() {
      this._syncRng();
      return JSON.stringify(this.state);
    }

    snapshot() {
      this._syncRng();
      return clone(this.state);
    }

    drainEvents() {
      const out = this.events.slice();
      this.events.length = 0;
      return out;
    }

    currentPlayer() { return this.state.players[this.state.currentPlayer]; }

    legalMoves(playerId) {
      const player = this.state.players[playerId];
      if (!player || this.state.phase !== "await-move" || !this.state.pending) return [];
      if (this.state.pending.playerId !== playerId) return [];
      return this.state.pending.options.map((option) => clone(option));
    }

    spin() {
      this._requirePhase("await-spin");
      if (this.state.winner != null) throw new Error("The game is already over.");
      const active = this.currentPlayer();
      const outcome = clone(SPINNER[this.rng.int(SPINNER.length)]);
      this.state.spinner = outcome;
      this.state.stats.spins += 1;
      this.state.actionSerial += 1;
      this._emit("spin", { playerId: active.id, outcome }, `${active.name} spins ${this.describeOutcome(outcome)}.`);

      if (outcome.type === "vampire") {
        this.state.phase = "resolving";
        const menace = outcome.colour === "green" ? "green" : "blue";
        this._moveVampireToPerch(menace, outcome.outer);
        if (this.state.phase === "await-victim") {
          this.state.pending.resume = "end-turn";
        } else if (this.state.winner == null) {
          this._endTurn();
        }
        this._syncRng();
        return { outcome, phase: this.state.phase, events: this.drainEvents() };
      }

      this.state.phase = "resolving";
      this._moveDracula(outcome.outer);
      this._resolveDraculaBite();
      if (this.state.winner != null) {
        this._syncRng();
        return { outcome, phase: this.state.phase, events: this.drainEvents() };
      }
      const refreshed = this.currentPlayer();
      const green = refreshed.status === "green-vampire";
      const start = green ? this.state.green.node : refreshed.node;
      const paths = exactPaths(start, outcome.inner, { green });
      const options = Array.from(paths.entries())
        .filter(([destination]) => !(green && HOME_NODES.has(destination)))
        .map(([destination, path]) => ({ destination, path }));
      if (!options.length) {
        this._emit("no-move", { playerId: refreshed.id, steps: outcome.inner }, `${refreshed.name} has no legal ${outcome.inner}-stone move.`);
        this._endTurn();
      } else {
        this.state.phase = "await-move";
        this.state.pending = {
          kind: "move",
          playerId: refreshed.id,
          steps: outcome.inner,
          green,
          options,
        };
        this._emit("move-ready", { playerId: refreshed.id, steps: outcome.inner, green, destinations: options.map((entry) => entry.destination) });
      }
      this._syncRng();
      return { outcome, phase: this.state.phase, events: this.drainEvents() };
    }

    chooseMove(destination) {
      this._requirePhase("await-move");
      const pending = this.state.pending;
      const option = pending.options.find((entry) => entry.destination === destination);
      if (!option) throw new Error("That is not a legal destination.");
      const player = this.state.players[pending.playerId];
      this.state.phase = "resolving";
      this.state.pending = null;
      if (pending.green) {
        this.state.green.node = destination;
        player.node = destination;
        this._emit("green-move", { playerId: player.id, path: option.path, destination }, `${player.name}, wearing the Green Vampire mask, flits into ${roomName(NODES[destination].room)}.`);
        this._resolveGreenCapture(player.id);
      } else {
        player.node = destination;
        this._emit("player-move", { playerId: player.id, path: option.path, destination }, `${player.name} moves ${pending.steps} yellow stones.`);
        if (HOME_NODES.has(destination)) {
          player.escaped = true;
          this.state.winner = player.id;
          this.state.endReason = `${player.name} escaped through a HOME doorway.`;
          this.state.phase = "gameover";
          this._emit("escape", { playerId: player.id, destination }, `${player.name} escapes Castle Dracula!`);
        }
      }
      if (this.state.phase === "await-victim") {
        this.state.pending.resume = "end-turn";
      } else if (this.state.winner == null) {
        this._endTurn();
      }
      this._syncRng();
      return { phase: this.state.phase, events: this.drainEvents() };
    }

    chooseVictim(victimId) {
      this._requirePhase("await-victim");
      const pending = this.state.pending;
      if (!pending.victims.includes(victimId)) throw new Error("That guest cannot be chosen.");
      const resume = pending.resume || "end-turn";
      this.state.phase = "resolving";
      this.state.pending = null;
      if (pending.kind === "green-victim") this._transferCurse(victimId);
      else throw new Error("Unknown victim choice.");
      if (this.state.winner == null && resume === "end-turn") this._endTurn();
      this._syncRng();
      return { phase: this.state.phase, events: this.drainEvents() };
    }

    chooseBestMove(playerId) {
      const pending = this.state.pending;
      if (!pending || pending.kind !== "move" || pending.playerId !== playerId) return null;
      const player = this.state.players[playerId];
      let best = null;
      for (const option of pending.options) {
        let score = deterministicUnit(this.state.seed, this.state.actionSerial, playerId, option.destination) * 0.01;
        const nodeEntry = NODES[option.destination];
        if (pending.green) {
          const room = nodeEntry.room;
          const victims = this._exposedHumansInRoom(room, playerId);
          if (victims.length) {
            score += 1000 + Math.max(...victims.map((victim) => progressScore(victim.node) * 5));
          }
          const humans = this.state.players.filter((entry) => entry.status === "human" && !entry.escaped);
          if (humans.length) {
            const nearest = Math.min(...humans.map((entry) => graphDistance(option.destination, entry.node, { green: true })));
            score -= nearest * 15;
          }
          if (nodeEntry.perch && nodeEntry.perch <= 4) score += 12;
        } else {
          if (HOME_NODES.has(option.destination)) score += 10000;
          score += progressScore(option.destination) * 12;
          if (HIDE_NODES.has(option.destination)) score += 90;
          const room = nodeEntry.room;
          if (DRACULA_TRACK[this.state.draculaIndex].room === room && !HIDE_NODES.has(option.destination)) score -= 400;
          if (NODES[this.state.blue.node].room === room && !HIDE_NODES.has(option.destination)) score -= 160;
          if (this.state.green.holder != null && this.state.green.holder !== playerId && NODES[this.state.green.node].room === room && !HIDE_NODES.has(option.destination)) score -= 250;
          if (this._draculaCanReachRoom(room, 6) && !HIDE_NODES.has(option.destination)) score -= 45;
        }
        if (!best || score > best.score) best = { destination: option.destination, score };
      }
      return best ? best.destination : null;
    }

    chooseBestVictim() {
      if (this.state.phase !== "await-victim" || !this.state.pending) return null;
      const victims = this.state.pending.victims.map((id) => this.state.players[id]);
      victims.sort((a, b) => progressScore(b.node) - progressScore(a.node) || a.id - b.id);
      return victims.length ? victims[0].id : null;
    }

    describeOutcome(outcome) {
      if (outcome.type === "vampire") return `${outcome.colour} vampire ${outcome.outer}`;
      return `Dracula ${outcome.outer} / guest ${outcome.inner}`;
    }

    _moveDracula(count) {
      const path = [];
      for (let i = 0; i < count; i += 1) {
        this.state.draculaIndex = (this.state.draculaIndex + 1) % DRACULA_TRACK.length;
        path.push(this.state.draculaIndex);
      }
      const at = DRACULA_TRACK[this.state.draculaIndex];
      this._emit("dracula-move", { count, path, destination: this.state.draculaIndex, room: at.room }, `Dracula prowls ${count} blood ${count === 1 ? "pool" : "pools"} into ${roomName(at.room)}.`);
    }

    _resolveDraculaBite() {
      const room = DRACULA_TRACK[this.state.draculaIndex].room;
      const candidates = this._exposedHumansInRoom(room, null);
      if (!candidates.length) return null;
      const active = this.currentPlayer();
      let victim = candidates.find((entry) => entry.id === active.id);
      if (!victim) {
        candidates.sort((a, b) => progressScore(b.node) - progressScore(a.node) || a.id - b.id);
        victim = candidates[0];
      }
      this.state.stats.bites += 1;
      victim.bites += 1;
      if (this.state.green.holder == null) {
        this.state.green.holder = victim.id;
        // The missing continuation page does not specify whether the unclaimed
        // Green piece resets. Preserve its current perch so pre-bite spins keep
        // their meaning; this restoration is documented in RESEARCH.md.
        victim.status = "green-vampire";
        victim.node = this.state.green.node;
        victim.curses += 1;
        this._emit("first-bite", { playerId: victim.id, room, greenNode: this.state.green.node }, `Dracula bites ${victim.name}. The Green Vampire mask descends!`);
      } else {
        victim.node = "vault";
        this.state.stats.vaultReturns += 1;
        this._emit("dracula-bite", { playerId: victim.id, room, destination: "vault" }, `Dracula engulfs ${victim.name} and carries them back to the vault.`);
      }
      return victim.id;
    }

    _moveVampireToPerch(menace, number) {
      const perch = PERCHES[number];
      if (!perch || perch.colour !== menace) throw new Error("Invalid vampire perch.");
      const piece = this.state[menace];
      const from = piece.node;
      piece.node = perch.node;
      piece.perch = number;
      if (menace === "green" && piece.holder != null) {
        this.state.players[piece.holder].node = perch.node;
      }
      this._emit("vampire-flight", { menace, number, from, destination: perch.node, room: perch.room }, `${menace === "green" ? "The Green Vampire" : "The Blue Vampire"} flaps to perch ${number} in ${roomName(perch.room)}.`);
      if (menace === "green") {
        if (piece.holder != null) this._resolveGreenCapture(piece.holder);
      } else {
        this._resolveBlueCapture();
      }
    }

    _resolveGreenCapture(holderId) {
      const room = NODES[this.state.green.node].room;
      const victims = this._exposedHumansInRoom(room, holderId);
      if (!victims.length) return null;
      const holder = this.state.players[holderId];
      if (holder.human && victims.length > 1) {
        this.state.phase = "await-victim";
        this.state.pending = {
          kind: "green-victim",
          chooser: holderId,
          victims: victims.map((entry) => entry.id),
          room,
          resume: "end-turn",
        };
        this._emit("victim-choice", { chooser: holderId, victims: this.state.pending.victims, room }, `${holder.name} chooses who must wear the mask next.`);
        return null;
      }
      victims.sort((a, b) => progressScore(b.node) - progressScore(a.node) || a.id - b.id);
      return this._transferCurse(victims[0].id);
    }

    _transferCurse(victimId) {
      const victim = this.state.players[victimId];
      const oldHolderId = this.state.green.holder;
      const oldHolder = oldHolderId == null ? null : this.state.players[oldHolderId];
      const room = NODES[this.state.green.node].room;
      if (oldHolder) {
        oldHolder.status = "human";
        oldHolder.cursePasses += 1;
        oldHolder.node = this._releaseNode(room, victim.node);
      }
      victim.status = "green-vampire";
      victim.node = this.state.green.node;
      victim.curses += 1;
      this.state.green.holder = victim.id;
      this.state.stats.cursePasses += 1;
      this._emit("curse-pass", {
        from: oldHolderId,
        to: victim.id,
        room,
        greenNode: this.state.green.node,
        releaseNode: oldHolder ? oldHolder.node : null,
      }, `${victim.name} is engulfed. The Green Vampire mask changes hands.`);
      return victim.id;
    }

    _resolveBlueCapture() {
      const room = NODES[this.state.blue.node].room;
      const victims = this._exposedHumansInRoom(room, null);
      if (!victims.length) return null;
      victims.sort((a, b) => progressScore(b.node) - progressScore(a.node) || a.id - b.id);
      const victim = victims[0];
      victim.blueBites += 1;
      victim.node = "vault";
      this.state.stats.vaultReturns += 1;
      this._emit("blue-bite", { playerId: victim.id, room, destination: "vault" }, `The Blue Vampire swoops on ${victim.name} and hurls them into the vault.`);
      return victim.id;
    }

    _releaseNode(room, occupied) {
      const blocked = new Set([occupied, this.state.green.node]);
      const safe = NODE_LIST
        .filter((entry) => entry.room === room && entry.hide && !blocked.has(entry.id))
        .sort((a, b) => graphDistance(this.state.green.node, a.id) - graphDistance(this.state.green.node, b.id) || a.id.localeCompare(b.id));
      if (safe.length) return safe[0].id;
      const neighbours = (ADJACENCY[this.state.green.node] || []).filter((id) => !blocked.has(id));
      return neighbours[0] || occupied;
    }

    _exposedHumansInRoom(room, excludeId) {
      return this.state.players.filter((player) => (
        player.id !== excludeId &&
        player.status === "human" &&
        !player.escaped &&
        NODES[player.node] &&
        NODES[player.node].room === room &&
        !HIDE_NODES.has(player.node)
      ));
    }

    _draculaCanReachRoom(room, maximum) {
      for (let step = 1; step <= maximum; step += 1) {
        if (DRACULA_TRACK[(this.state.draculaIndex + step) % DRACULA_TRACK.length].room === room) return true;
      }
      return false;
    }

    _endTurn() {
      if (this.state.winner != null) return;
      const previous = this.state.currentPlayer;
      this.state.currentPlayer = (this.state.currentPlayer + 1) % this.state.players.length;
      this.state.turn += 1;
      if (this.state.currentPlayer === this.state.startingPlayer) this.state.round += 1;
      this.state.phase = "await-spin";
      this.state.pending = null;
      this._emit("turn-end", { previous, current: this.state.currentPlayer, round: this.state.round }, `${this.currentPlayer().name}'s turn.`);
    }

    _emit(type, data, text) {
      const event = Object.assign({ type, serial: this.state.actionSerial, turn: this.state.turn }, data || {});
      this.events.push(event);
      if (text) {
        this.state.log.unshift({ turn: this.state.turn, text, type });
        if (this.state.log.length > 80) this.state.log.length = 80;
      }
    }

    _requirePhase(phase) {
      if (this.state.phase !== phase) throw new Error(`Expected phase ${phase}, found ${this.state.phase}.`);
    }

    _syncRng() { this.state.rngState = this.rng.state >>> 0; }
  }

  return Object.freeze({
    VERSION,
    PLAYER_STYLES,
    DEFAULT_NAMES,
    RESTORATION_RULES,
    ROOMS,
    NODES,
    NODE_LIST,
    EDGE_LIST,
    ADJACENCY,
    CANDLE_EDGES,
    START_NODES,
    HOME_NODES,
    HIDE_NODES,
    PERCHES,
    DRACULA_TRACK,
    SPINNER,
    RNG,
    Game,
    exactPaths,
    graphDistance,
    edgeKey,
    roomName,
    validateSavedState,
  });
});
