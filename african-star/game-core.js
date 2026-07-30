(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AfricanStarCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 2;
  const FREE_PASSAGE_STEPS = 2;
  const MONEY = Object.freeze({ start: 300, reveal: 100, sea: 100, air: 300, capeTown: 500, topaz: 300, emerald: 600, ruby: 1000 });
  const TOKEN_META = Object.freeze({
    blank: Object.freeze({ label: "Empty", icon: "·", className: "blank" }),
    leopard: Object.freeze({ label: "Leopard", icon: "●", className: "leopard" }),
    horseshoe: Object.freeze({ label: "Horseshoe", icon: "∩", className: "horseshoe" }),
    topaz: Object.freeze({ label: "Topaz", icon: "◆", className: "topaz", value: MONEY.topaz }),
    emerald: Object.freeze({ label: "Emerald", icon: "◆", className: "emerald", value: MONEY.emerald }),
    ruby: Object.freeze({ label: "Ruby", icon: "◆", className: "ruby", value: MONEY.ruby }),
    star: Object.freeze({ label: "The African Star", icon: "★", className: "star" }),
  });
  const TOKEN_POOL = Object.freeze([
    "star", "ruby", "ruby", "emerald", "emerald", "emerald",
    "topaz", "topaz", "topaz", "topaz",
    "horseshoe", "horseshoe", "horseshoe", "horseshoe", "horseshoe",
    "leopard", "leopard", "leopard",
    "blank", "blank", "blank", "blank", "blank", "blank",
    "blank", "blank", "blank", "blank", "blank", "blank",
  ]);
  const STARTS = Object.freeze(["tangier", "cairo"]);

  const CITIES = Object.freeze([
    { id: "tangier", name: "Tangier", x: 350, y: 100, start: true, labelDx: -18, labelDy: -26 },
    { id: "cairo", name: "Cairo", x: 760, y: 145, start: true, labelDx: 18, labelDy: -24 },
    { id: "morocco", name: "Morocco", x: 345, y: 200, token: true, labelDx: -30, labelDy: 30 },
    { id: "canary", name: "Canary Islands", x: 145, y: 205, token: true, labelDx: -16, labelDy: -27 },
    { id: "tunis", name: "Tunis", x: 520, y: 120, token: true, labelDx: 0, labelDy: -28 },
    { id: "tripoli", name: "Tripoli", x: 625, y: 170, token: true, labelDx: 8, labelDy: -27 },
    { id: "egypt", name: "Egypt", x: 705, y: 225, token: true, labelDx: 23, labelDy: 27 },
    { id: "sahara", name: "Sahara", x: 430, y: 280, token: true, labelDx: -4, labelDy: -29 },
    { id: "ainGalaka", name: "Ain Galaka", x: 555, y: 285, token: true, labelDx: 4, labelDy: -29 },
    { id: "darfur", name: "Darfur", x: 655, y: 330, token: true, labelDx: 9, labelDy: -28 },
    { id: "suakin", name: "Suakin", x: 780, y: 315, token: true, labelDx: 21, labelDy: 5 },
    { id: "timbuktu", name: "Timbuktu", x: 330, y: 365, token: true, labelDx: -34, labelDy: -28 },
    { id: "capeVerde", name: "Cape Verde", x: 125, y: 390, token: true, labelDx: -18, labelDy: -28 },
    { id: "sierraLeone", name: "Sierra Leone", x: 225, y: 505, token: true, labelDx: -34, labelDy: 32 },
    { id: "goldCoast", name: "Gold Coast", x: 345, y: 520, token: true, special: "goldCoast", labelDx: -28, labelDy: 34 },
    { id: "bightBenin", name: "Bight of Benin", x: 455, y: 515, token: true, special: "bightBenin", historicalName: "Slave Coast", labelDx: 2, labelDy: 34 },
    { id: "bahrGhazal", name: "Bahr el Ghazal", x: 590, y: 455, token: true, labelDx: -4, labelDy: -29 },
    { id: "addis", name: "Addis Ababa", x: 725, y: 455, token: true, labelDx: 20, labelDy: -11 },
    { id: "guardafui", name: "Cape Guardafui", x: 860, y: 465, token: true, labelDx: 12, labelDy: 29 },
    { id: "ocombo", name: "Ocomba", x: 450, y: 610, token: true, labelDx: -32, labelDy: 3 },
    { id: "congo", name: "Congo", x: 525, y: 650, token: true, labelDx: -35, labelDy: 28 },
    { id: "lakeVictoria", name: "Lake Victoria", x: 650, y: 585, token: true, labelDx: 18, labelDy: -16 },
    { id: "kandjama", name: "Kandjama", x: 700, y: 670, token: true, labelDx: 18, labelDy: 7 },
    { id: "darEsSalaam", name: "Dar es Salaam", x: 780, y: 710, token: true, labelDx: 18, labelDy: 4 },
    { id: "saintHelena", name: "Saint Helena", x: 155, y: 740, token: true, labelDx: -23, labelDy: 34 },
    { id: "whalefish", name: "Whalefish Bay", x: 400, y: 860, token: true, labelDx: -46, labelDy: 28 },
    { id: "victoriaFalls", name: "Victoria Falls", x: 565, y: 815, token: true, labelDx: -2, labelDy: -31 },
    { id: "mozambique", name: "Mozambique", x: 710, y: 820, token: true, labelDx: 18, labelDy: -9 },
    { id: "tamatave", name: "Tamatave", x: 865, y: 800, token: true, labelDx: 16, labelDy: 5 },
    { id: "capeSaintMarie", name: "Cape Saint Marie", x: 850, y: 970, token: true, labelDx: 12, labelDy: 30 },
    { id: "dragonMountains", name: "Dragon Mountains", x: 625, y: 970, token: true, labelDx: 17, labelDy: 2 },
    { id: "capeTown", name: "Cape Town", x: 465, y: 1080, token: true, special: "capeTown", labelDx: -6, labelDy: 35 },
  ]);

  const ROUTES = Object.freeze([
    { a: "tangier", b: "morocco", type: "land", steps: 2, curve: -12 },
    { a: "tangier", b: "tunis", type: "land", steps: 4, curve: -30 },
    { a: "morocco", b: "sahara", type: "land", steps: 4, curve: 18 },
    { a: "morocco", b: "timbuktu", type: "land", steps: 4, curve: -20 },
    { a: "tunis", b: "tripoli", type: "land", steps: 3, curve: 8 },
    { a: "tripoli", b: "cairo", type: "land", steps: 4, curve: -18 },
    { a: "tripoli", b: "ainGalaka", type: "land", steps: 4, curve: 22 },
    { a: "cairo", b: "egypt", type: "land", steps: 2, curve: 4 },
    { a: "egypt", b: "suakin", type: "land", steps: 4, curve: -16 },
    { a: "egypt", b: "darfur", type: "land", steps: 4, curve: 20 },
    { a: "sahara", b: "timbuktu", type: "land", steps: 3, curve: -12 },
    { a: "sahara", b: "ainGalaka", type: "land", steps: 4, curve: -18, traps: { 2: "sahara" } },
    { a: "timbuktu", b: "goldCoast", type: "land", steps: 4, curve: -25 },
    { a: "timbuktu", b: "bightBenin", type: "land", steps: 5, curve: 32 },
    { a: "ainGalaka", b: "darfur", type: "land", steps: 3, curve: 12 },
    { a: "darfur", b: "suakin", type: "land", steps: 3, curve: -8 },
    { a: "darfur", b: "bahrGhazal", type: "land", steps: 4, curve: 16 },
    { a: "suakin", b: "addis", type: "land", steps: 4, curve: 18 },
    { a: "bahrGhazal", b: "addis", type: "land", steps: 3, curve: -10 },
    { a: "addis", b: "guardafui", type: "land", steps: 4, curve: -24 },
    { a: "capeVerde", b: "sierraLeone", type: "land", steps: 4, curve: -20 },
    { a: "sierraLeone", b: "goldCoast", type: "land", steps: 3, curve: -12 },
    { a: "goldCoast", b: "bightBenin", type: "land", steps: 3, curve: 8 },
    { a: "bightBenin", b: "ocombo", type: "land", steps: 4, curve: -18 },
    { a: "bightBenin", b: "bahrGhazal", type: "land", steps: 5, curve: -30 },
    { a: "ocombo", b: "congo", type: "land", steps: 3, curve: 10 },
    { a: "ocombo", b: "bahrGhazal", type: "land", steps: 4, curve: -22 },
    { a: "congo", b: "bahrGhazal", type: "land", steps: 4, curve: -18 },
    { a: "congo", b: "lakeVictoria", type: "land", steps: 4, curve: -20 },
    { a: "bahrGhazal", b: "lakeVictoria", type: "land", steps: 4, curve: 18 },
    { a: "lakeVictoria", b: "addis", type: "land", steps: 4, curve: -24 },
    { a: "lakeVictoria", b: "kandjama", type: "land", steps: 3, curve: -12 },
    { a: "kandjama", b: "darEsSalaam", type: "land", steps: 3, curve: -12 },
    { a: "congo", b: "whalefish", type: "land", steps: 5, curve: 24 },
    { a: "congo", b: "victoriaFalls", type: "land", steps: 5, curve: -28 },
    { a: "lakeVictoria", b: "victoriaFalls", type: "land", steps: 5, curve: 26 },
    { a: "whalefish", b: "victoriaFalls", type: "land", steps: 4, curve: -16 },
    { a: "whalefish", b: "capeTown", type: "land", steps: 5, curve: 26 },
    { a: "victoriaFalls", b: "mozambique", type: "land", steps: 4, curve: -20 },
    { a: "victoriaFalls", b: "dragonMountains", type: "land", steps: 4, curve: 18 },
    { a: "mozambique", b: "darEsSalaam", type: "land", steps: 4, curve: -16 },
    { a: "mozambique", b: "dragonMountains", type: "land", steps: 4, curve: -18 },
    { a: "dragonMountains", b: "capeTown", type: "land", steps: 4, curve: -16 },
    { a: "tamatave", b: "capeSaintMarie", type: "land", steps: 4, curve: -12 },
    { a: "tangier", b: "canary", type: "sea", steps: 4, curve: 34 },
    { a: "canary", b: "capeVerde", type: "sea", steps: 5, curve: 24 },
    { a: "capeVerde", b: "sierraLeone", type: "sea", steps: 5, curve: 26 },
    { a: "sierraLeone", b: "saintHelena", type: "sea", steps: 6, curve: 46, traps: { 5: "pirates" } },
    { a: "saintHelena", b: "capeTown", type: "sea", steps: 7, curve: -60, traps: { 1: "pirates" } },
    { a: "capeTown", b: "capeSaintMarie", type: "sea", steps: 8, curve: -82 },
    { a: "capeSaintMarie", b: "tamatave", type: "sea", steps: 4, curve: -20 },
    { a: "tamatave", b: "mozambique", type: "sea", steps: 4, curve: 28 },
    { a: "tamatave", b: "darEsSalaam", type: "sea", steps: 5, curve: 34 },
    { a: "darEsSalaam", b: "guardafui", type: "sea", steps: 6, curve: 46 },
    { a: "guardafui", b: "suakin", type: "sea", steps: 7, curve: 48 },
    { a: "suakin", b: "cairo", type: "sea", steps: 6, curve: -34 },
    { a: "cairo", b: "tunis", type: "sea", steps: 7, curve: -52 },
    { a: "tunis", b: "tangier", type: "sea", steps: 6, curve: 42 },
  ]);

  const FLIGHTS = Object.freeze([
    ["tangier", "tunis"], ["tangier", "canary"], ["tangier", "timbuktu"],
    ["tunis", "cairo"], ["tunis", "sahara"], ["cairo", "suakin"],
    ["cairo", "darfur"], ["cairo", "addis"], ["canary", "capeVerde"],
    ["capeVerde", "sierraLeone"], ["sierraLeone", "goldCoast"],
    ["goldCoast", "congo"], ["darfur", "bahrGhazal"], ["addis", "guardafui"],
    ["bahrGhazal", "lakeVictoria"], ["congo", "victoriaFalls"],
    ["lakeVictoria", "darEsSalaam"], ["darEsSalaam", "tamatave"],
    ["victoriaFalls", "capeTown"], ["mozambique", "capeTown"],
    ["tamatave", "capeSaintMarie"], ["saintHelena", "sierraLeone"],
    ["saintHelena", "capeTown"],
  ]);

  const PLAYER_COLOURS = Object.freeze([
    { id: "vermilion", value: "#d9482f", dark: "#8d2418" },
    { id: "cobalt", value: "#2567b2", dark: "#153a70" },
    { id: "saffron", value: "#e7a72d", dark: "#956411" },
    { id: "jade", value: "#27866e", dark: "#145243" },
    { id: "plum", value: "#8b4d91", dark: "#522957" },
    { id: "ivory", value: "#e8dfc8", dark: "#8b8069" },
  ]);
  const AI_PERSONALITIES = Object.freeze([
    { id: "navigator", name: "Aino", epithet: "The Navigator", airBias: .28, revealReserve: 100 },
    { id: "pilot", name: "Mara", epithet: "The Pilot", airBias: .78, revealReserve: 200 },
    { id: "prospector", name: "Mika", epithet: "The Prospector", airBias: .42, revealReserve: 0 },
    { id: "surveyor", name: "Sam", epithet: "The Surveyor", airBias: .18, revealReserve: 300 },
    { id: "sprinter", name: "Leila", epithet: "The Sprinter", airBias: .62, revealReserve: 100 },
  ]);

  function cityMap() { return Object.fromEntries(CITIES.map((city) => [city.id, city])); }
  function quadraticPoint(a, b, curve, t) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * curve, cy = my + (dx / len) * curve, mt = 1 - t;
    return { x: mt * mt * a.x + 2 * mt * t * cx + t * t * b.x, y: mt * mt * a.y + 2 * mt * t * cy + t * t * b.y, cx, cy };
  }
  function buildGraph() {
    const cities = cityMap(), nodes = {}, adjacency = {}, routePaths = [];
    for (const city of CITIES) { nodes[city.id] = { ...city, kind: "city" }; adjacency[city.id] = []; }
    ROUTES.forEach((route, routeIndex) => {
      const a = cities[route.a], b = cities[route.b], sequence = [route.a], traps = route.traps || {};
      if (!a || !b) throw new Error(`Unknown route endpoint: ${route.a} → ${route.b}`);
      for (let i = 1; i < route.steps; i++) {
        const p = quadraticPoint(a, b, route.curve || 0, i / route.steps), id = `r${routeIndex}-${i}`;
        nodes[id] = { id, x: p.x, y: p.y, kind: "route", transport: route.type, routeIndex, trap: traps[i] || null };
        adjacency[id] = []; sequence.push(id);
      }
      sequence.push(route.b);
      for (let i = 0; i < sequence.length - 1; i++) {
        const left = sequence[i], right = sequence[i + 1];
        adjacency[left].push({ to: right, type: route.type, routeIndex });
        adjacency[right].push({ to: left, type: route.type, routeIndex });
      }
      const q = quadraticPoint(a, b, route.curve || 0, .5);
      routePaths.push({ ...route, routeIndex, sequence, control: { x: q.cx, y: q.cy } });
    });
    const flights = Object.fromEntries(CITIES.map((city) => [city.id, []]));
    for (const [a, b] of FLIGHTS) { flights[a].push(b); flights[b].push(a); }
    return { nodes, adjacency, routePaths, flights, cities };
  }
  const GRAPH = buildGraph();

  function hash32(value) { let x = value >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0; }
  function randomUnit(seed, counter) { return hash32((seed >>> 0) + Math.imul(counter + 1, 0x9e3779b9)) / 0x100000000; }
  function nextRandom(state) { state.rngCounter = Number.isFinite(state.rngCounter) ? state.rngCounter : 0; const value = randomUnit(state.seed, state.rngCounter); state.rngCounter++; return value; }
  function rollDie(state) { return 1 + Math.floor(nextRandom(state) * 6); }
  function resolveOpeningOrder(players, state) {
    if (!Array.isArray(players) || players.length < 2) throw new Error("At least two players are required");
    const trails = new Map(players.map((player) => [player, []]));
    const ties = [];
    function rank(group, depth) {
      if (depth > 128) throw new Error("Opening-order tie did not resolve");
      const buckets = new Map();
      for (const player of group) {
        const roll = rollDie(state);
        trails.get(player).push(roll);
        if (!buckets.has(roll)) buckets.set(roll, []);
        buckets.get(roll).push(player);
      }
      const ordered = [];
      for (const roll of [...buckets.keys()].sort((a, b) => b - a)) {
        const tied = buckets.get(roll);
        if (tied.length === 1) ordered.push(tied[0]);
        else {
          ties.push({ roll, playerIds: tied.map((player) => player.id), playerNames: tied.map((player) => player.name) });
          ordered.push(...rank(tied, depth + 1));
        }
      }
      return ordered;
    }
    const order = rank(players.slice(), 0);
    return {
      order,
      entries: order.map((player) => ({ player, rolls: trails.get(player).slice() })),
      ties,
    };
  }
  function shuffleWithState(items, state) { const out = items.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(state) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
  function createTokenLayout(state) {
    const cityIds = CITIES.filter((city) => city.token).map((city) => city.id);
    if (cityIds.length !== TOKEN_POOL.length) throw new Error("Token city count does not match disk count");
    const shuffled = shuffleWithState(TOKEN_POOL, state);
    return Object.fromEntries(cityIds.map((cityId, i) => [cityId, { cityId, kind: shuffled[i], revealed: false, revealedBy: null }]));
  }

  function findMovementOptions(startId, transport, steps, options) {
    const graph = options && options.graph || GRAPH, byEnd = new Map(), stopAtCities = transport === "sea", earlyCity = transport === "land";
    let explored = 0;
    function remember(path, exact) {
      const end = path.at(-1), existing = byEnd.get(end);
      if (!existing || (exact && !existing.exact) || path.length < existing.path.length) byEnd.set(end, { end, path: path.slice(1), exact, distance: path.length - 1 });
    }
    function visit(current, remaining, path, visited) {
      if (++explored > 20000) return;
      const node = graph.nodes[current], moved = path.length > 1;
      if (moved && node.kind === "city" && earlyCity) remember(path, remaining === 0);
      if (remaining === 0) { if (moved) remember(path, true); return; }
      if (moved && node.kind === "city" && stopAtCities) { remember(path, false); return; }
      for (const edge of graph.adjacency[current] || []) {
        if (edge.type !== transport || visited.has(edge.to)) continue;
        visited.add(edge.to); path.push(edge.to); visit(edge.to, remaining - 1, path, visited); path.pop(); visited.delete(edge.to);
      }
    }
    visit(startId, Math.max(0, steps | 0), [startId], new Set([startId]));
    return [...byEnd.values()].sort((a, b) => (a.exact === b.exact ? 0 : a.exact ? -1 : 1) || ((graph.nodes[a.end].kind === "city" ? 0 : 1) - (graph.nodes[b.end].kind === "city" ? 0 : 1)) || a.distance - b.distance);
  }

  function shortestPath(startId, targetId, allowedTypes, graph) {
    const g = graph || GRAPH, allowed = new Set(allowedTypes || ["land", "sea"]);
    if (startId === targetId) return { distance: 0, nodes: [startId], edgeTypes: [] };
    const queue = [startId], previous = new Map([[startId, null]]), previousType = new Map(); let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const edge of g.adjacency[current] || []) {
        if (!allowed.has(edge.type) || previous.has(edge.to)) continue;
        previous.set(edge.to, current); previousType.set(edge.to, edge.type);
        if (edge.to === targetId) {
          const nodes = [targetId], edgeTypes = []; let cursor = targetId;
          while (previous.get(cursor) !== null) { edgeTypes.push(previousType.get(cursor)); cursor = previous.get(cursor); nodes.push(cursor); }
          nodes.reverse(); edgeTypes.reverse(); return { distance: nodes.length - 1, nodes, edgeTypes };
        }
        queue.push(edge.to);
      }
    }
    return { distance: Infinity, nodes: [], edgeTypes: [] };
  }
  function shortestDistance(startId, targetId, allowedTypes, graph) { return shortestPath(startId, targetId, allowedTypes, graph).distance; }
  function nearestStart(nodeId, graph) { let best = null; for (const start of STARTS) { const path = shortestPath(nodeId, start, ["land", "sea"], graph || GRAPH); if (!best || path.distance < best.distance) best = { start, ...path }; } return best; }

  function applyToken(player, tokenKind, context) {
    const city = context && context.city, starAlreadyFound = !!(context && context.starAlreadyFound);
    const coastDelay = context && Number.isFinite(context.coastDelay) ? Math.max(0, Math.floor(context.coastDelay)) : 3;
    const result = { kind: tokenKind, moneyDelta: 0, message: "", starFound: false, skipTurns: 0 };
    if (tokenKind === "blank") {
      result.message = "The disk is empty.";
      if (city && city.special === "bightBenin" && coastDelay > 0) { player.skipTurns = (player.skipTurns || 0) + coastDelay; result.skipTurns = coastDelay; result.message = `The disk is empty. The coast-delay rule costs ${coastDelay} turn${coastDelay === 1 ? "" : "s"}.`; }
    } else if (tokenKind === "leopard") {
      const lost = player.money; player.money = 0; result.moneyDelta = lost ? -lost : 0; result.message = lost ? `A leopard scatters the expedition. £${lost} is lost.` : "A leopard appears, but there is no money to lose.";
    } else if (tokenKind === "horseshoe") {
      if (starAlreadyFound) { player.hasHorseshoe = true; result.message = "A horseshoe! Race it to Tangier or Cairo before the Star arrives."; }
      else result.message = "A horseshoe — lucky, but it only enters the race after the Star has been found.";
    } else if (["topaz", "emerald", "ruby"].includes(tokenKind)) {
      let value = TOKEN_META[tokenKind].value; if (city && city.special === "goldCoast") value *= 2;
      player.money += value; result.moneyDelta = value; result.message = `${TOKEN_META[tokenKind].label}: £${value}${city && city.special === "goldCoast" ? " — doubled on the Gold Coast" : ""}.`;
    } else if (tokenKind === "star") {
      player.hasStar = true; result.starFound = true; result.message = "The African Star! Carry it to Tangier or Cairo before a rival horseshoe gets there.";
    } else throw new Error(`Unknown token kind: ${tokenKind}`);
    return result;
  }
  function claimCapeTown(player, state) { if (!player || !state || state.capeTownClaimed) return 0; state.capeTownClaimed = player.id; player.money += MONEY.capeTown; return MONEY.capeTown; }
  function winnerAtStart(player) { if (!player || !STARTS.includes(player.node)) return null; if (player.hasStar) return { type: "star", playerId: player.id }; if (player.hasHorseshoe) return { type: "horseshoe", playerId: player.id }; return null; }
  function tokenCounts(layout) { const out = {}; for (const token of Object.values(layout || {})) out[token.kind] = (out[token.kind] || 0) + 1; return out; }
  function formatMoney(value) { return `£${Math.max(0, Number(value) || 0).toLocaleString("en-GB")}`; }
  function validateData() {
    const errors = [], ids = new Set();
    for (const city of CITIES) { if (ids.has(city.id)) errors.push(`Duplicate city id: ${city.id}`); ids.add(city.id); }
    if (CITIES.filter((city) => city.token).length !== 30) errors.push("There must be exactly 30 token cities");
    if (TOKEN_POOL.length !== 30) errors.push("There must be exactly 30 token disks");
    for (const route of ROUTES) { if (!ids.has(route.a) || !ids.has(route.b)) errors.push(`Bad route: ${route.a} → ${route.b}`); if (!Number.isInteger(route.steps) || route.steps < 1) errors.push(`Bad route length: ${route.a} → ${route.b}`); }
    for (const [a, b] of FLIGHTS) if (!ids.has(a) || !ids.has(b)) errors.push(`Bad flight: ${a} → ${b}`);
    const expected = { star: 1, ruby: 2, emerald: 3, topaz: 4, leopard: 3, horseshoe: 5, blank: 12 };
    const actual = TOKEN_POOL.reduce((out, kind) => ((out[kind] = (out[kind] || 0) + 1), out), {});
    for (const [kind, count] of Object.entries(expected)) if (actual[kind] !== count) errors.push(`Bad ${kind} count: ${actual[kind] || 0}`);
    const reached = new Set([STARTS[0]]), queue = [STARTS[0]];
    while (queue.length) for (const edge of GRAPH.adjacency[queue.shift()] || []) if (!reached.has(edge.to)) { reached.add(edge.to); queue.push(edge.to); }
    for (const city of CITIES) if (!reached.has(city.id)) errors.push(`Disconnected city: ${city.id}`);
    return errors;
  }

  return Object.freeze({ VERSION, FREE_PASSAGE_STEPS, MONEY, TOKEN_META, TOKEN_POOL, STARTS, CITIES, ROUTES, FLIGHTS, PLAYER_COLOURS, AI_PERSONALITIES, GRAPH, hash32, randomUnit, nextRandom, rollDie, resolveOpeningOrder, shuffleWithState, createTokenLayout, findMovementOptions, shortestPath, shortestDistance, nearestStart, applyToken, claimCapeTown, winnerAtStart, tokenCounts, formatMoney, validateData });
});
