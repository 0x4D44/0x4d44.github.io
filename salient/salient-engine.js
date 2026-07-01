/* ============================================================================
 * salient-engine.js — pure, dependency-free rules + AI for "Salient", a
 * distilled parlour-sized conquest game (a Risk-style war game on a compact
 * stylised hex map). No DOM, no React: a plain global `window.SalientEngine`
 * so the game (Salient.dc.html) owns all presentation and this file owns all
 * rules, combat maths and AI. Mirrors the shape of pylos-engine.js.
 *
 * MAP MODEL
 *   A flat-top hex grid (odd-q offset). Each territory is one hex; territories
 *   group into 5 continents. Adjacency is derived from hex neighbours among the
 *   placed cells, so contiguous land = a border, and the gaps in the grid form
 *   natural chokepoints between continents.
 *
 * STATE
 *   { terr:{id->{owner,armies}}, players:[{id,name,kind,level}], turn, phase,
 *     toPlace, conquered, fortified, winner, eliminated:[], log:[] }
 *   phase: 'reinforce' | 'attack' | 'fortify'.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ---- map definition -----------------------------------------------------
  // Each territory: short abstract name, continent id, grid (col,row).
  // Five separated landmasses on an odd-q hex grid (NW / NE / centre / SW / SE).
  // Continents are contiguous clusters; the sea between them is crossed only by
  // the explicit BRIDGES below — so the board reads as a world map.
  var TERR = [
    // Auster (NW)
    { id: 'hale', name: 'Hale', cont: 'auster', col: 0, row: 0 },
    { id: 'vane', name: 'Vane', cont: 'auster', col: 1, row: 1 },
    { id: 'brae', name: 'Brae', cont: 'auster', col: 0, row: 1 },
    { id: 'cael', name: 'Cael', cont: 'auster', col: 2, row: 1 },
    // Sable (NE)
    { id: 'rho',  name: 'Rho',  cont: 'sable', col: 5, row: 0 },
    { id: 'syl',  name: 'Syl',  cont: 'sable', col: 7, row: 0 },
    { id: 'thar', name: 'Thar', cont: 'sable', col: 6, row: 0 },
    { id: 'ulm',  name: 'Ulm',  cont: 'sable', col: 6, row: 1 },
    // Mirra (centre, the prize)
    { id: 'loft', name: 'Loft', cont: 'mirra', col: 3, row: 2 },
    { id: 'mere', name: 'Mere', cont: 'mirra', col: 2, row: 3 },
    { id: 'noor', name: 'Noor', cont: 'mirra', col: 4, row: 2 },
    { id: 'oka',  name: 'Oka',  cont: 'mirra', col: 3, row: 3 },
    { id: 'pell', name: 'Pell', cont: 'mirra', col: 3, row: 4 },
    // Korda (SW)
    { id: 'dun',  name: 'Dun',  cont: 'korda', col: 0, row: 4 },
    { id: 'esk',  name: 'Esk',  cont: 'korda', col: 1, row: 5 },
    { id: 'fen',  name: 'Fen',  cont: 'korda', col: 0, row: 5 },
    { id: 'gilt', name: 'Gilt', cont: 'korda', col: 0, row: 6 },
    // Vell (SE)
    { id: 'wend', name: 'Wend', cont: 'vell', col: 7, row: 4 },
    { id: 'xan',  name: 'Xan',  cont: 'vell', col: 7, row: 5 },
    { id: 'ys',   name: 'Ys',   cont: 'vell', col: 6, row: 5 },
    { id: 'zor',  name: 'Zor',  cont: 'vell', col: 7, row: 6 },
  ];
  // sea-lanes: 4 spokes into the central continent + a 4-way coastal ring
  var BRIDGES = [
    ['cael', 'loft'], ['rho', 'noor'], ['esk', 'mere'], ['ys', 'pell'],
    ['brae', 'dun'], ['ulm', 'wend'], ['hale', 'syl'], ['gilt', 'zor'],
  ];
  var CONT = [
    { id: 'auster', name: 'Auster', bonus: 2 },
    { id: 'korda',  name: 'Korda',  bonus: 2 },
    { id: 'mirra',  name: 'Mirra',  bonus: 3 },
    { id: 'sable',  name: 'Sable',  bonus: 2 },
    { id: 'vell',   name: 'Vell',   bonus: 2 },
  ];

  var BY_ID = {}; TERR.forEach(function (t) { BY_ID[t.id] = t; });
  var CELL = {}; TERR.forEach(function (t) { CELL[t.col + ',' + t.row] = t.id; });

  // odd-q offset neighbours (flat-top): odd columns shifted DOWN half a row
  function neighbourCells(col, row) {
    var odd = (col & 1) === 1;
    return odd
      ? [[col, row - 1], [col, row + 1], [col - 1, row], [col - 1, row + 1], [col + 1, row], [col + 1, row + 1]]
      : [[col, row - 1], [col, row + 1], [col - 1, row - 1], [col - 1, row], [col + 1, row - 1], [col + 1, row]];
  }
  var ADJ = {};
  TERR.forEach(function (t) {
    ADJ[t.id] = [];
    neighbourCells(t.col, t.row).forEach(function (nc) {
      var nid = CELL[nc[0] + ',' + nc[1]];
      if (nid) ADJ[t.id].push(nid);
    });
  });
  BRIDGES.forEach(function (b) {
    if (ADJ[b[0]].indexOf(b[1]) < 0) ADJ[b[0]].push(b[1]);
    if (ADJ[b[1]].indexOf(b[0]) < 0) ADJ[b[1]].push(b[0]);
  });
  function adjacent(a, b) { return ADJ[a].indexOf(b) !== -1; }

  function contMembers(cid) { return TERR.filter(function (t) { return t.cont === cid; }).map(function (t) { return t.id; }); }

  // ---- helpers ------------------------------------------------------------
  function clone(s) {
    var terr = {};
    Object.keys(s.terr).forEach(function (k) { terr[k] = { owner: s.terr[k].owner, armies: s.terr[k].armies }; });
    return {
      terr: terr, players: s.players.map(function (p) { return Object.assign({}, p); }),
      turn: s.turn, phase: s.phase, toPlace: s.toPlace, conquered: s.conquered,
      fortified: s.fortified, winner: s.winner, eliminated: s.eliminated.slice(),
      log: s.log.slice(), setup: s.setup,
    };
  }
  function ownedBy(s, pid) { return TERR.filter(function (t) { return s.terr[t.id].owner === pid; }).map(function (t) { return t.id; }); }
  function ownsContinent(s, pid, cid) { return contMembers(cid).every(function (id) { return s.terr[id].owner === pid; }); }
  function armiesOf(s, pid) { var n = 0; TERR.forEach(function (t) { if (s.terr[t.id].owner === pid) n += s.terr[t.id].armies; }); return n; }
  function alive(s, pid) { return ownedBy(s, pid).length > 0; }
  function activePlayers(s) { return s.players.filter(function (p) { return alive(s, p.id); }); }

  // territories of pid that border an enemy
  function borderTerr(s, pid) {
    return ownedBy(s, pid).filter(function (id) {
      return ADJ[id].some(function (n) { return s.terr[n].owner !== pid; });
    });
  }
  function enemyNeighbours(s, id) {
    var pid = s.terr[id].owner;
    return ADJ[id].filter(function (n) { return s.terr[n].owner !== pid; });
  }
  function friendlyNeighbours(s, id) {
    var pid = s.terr[id].owner;
    return ADJ[id].filter(function (n) { return s.terr[n].owner === pid; });
  }

  // ---- setup --------------------------------------------------------------
  function startArmies(n) { return ({ 2: 26, 3: 21, 4: 18 })[n] || 18; }

  // players: [{id,name,kind:'human'|'ai',level:'easy'|'hard'}]
  function create(players, randomFn) {
    var rf = randomFn || Math.random;
    var ids = TERR.map(function (t) { return t.id; });
    // shuffle
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(rf() * (i + 1)); var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp; }
    var terr = {};
    ids.forEach(function (id, k) { terr[id] = { owner: players[k % players.length].id, armies: 1 }; });
    var s = {
      terr: terr, players: players.map(function (p) { return Object.assign({}, p); }),
      turn: players[0].id, phase: 'reinforce', toPlace: 0, conquered: false,
      fortified: false, winner: null, eliminated: [], log: [], setup: true,
    };
    // auto-place the rest of each player's starting armies on random own cells
    players.forEach(function (p) {
      var own = ownedBy(s, p.id);
      var extra = startArmies(players.length) - own.length;
      for (var e = 0; e < extra; e++) { var id = own[Math.floor(rf() * own.length)]; s.terr[id].armies++; }
    });
    s.setup = false;
    s.toPlace = reinforcements(s, s.turn);
    s.log.push('Game begins — ' + s.players.length + ' powers');
    return s;
  }

  // ---- reinforcement ------------------------------------------------------
  function reinforcements(s, pid) {
    var base = Math.max(3, Math.floor(ownedBy(s, pid).length / 3));
    var bonus = 0;
    CONT.forEach(function (c) { if (ownsContinent(s, pid, c.id)) bonus += c.bonus; });
    return base + bonus;
  }
  function continentBonus(s, pid) { var b = 0; CONT.forEach(function (c) { if (ownsContinent(s, pid, c.id)) b += c.bonus; }); return b; }

  function placeArmy(s, id, count) {
    count = count || 1;
    if (s.phase !== 'reinforce' || s.terr[id].owner !== s.turn || s.toPlace <= 0) return s;
    var ns = clone(s); count = Math.min(count, ns.toPlace);
    ns.terr[id].armies += count; ns.toPlace -= count;
    return ns;
  }

  // ---- combat -------------------------------------------------------------
  function canAttack(s, from, to) {
    return s.phase === 'attack' && s.terr[from].owner === s.turn &&
      s.terr[to].owner !== s.turn && adjacent(from, to) && s.terr[from].armies >= 2;
  }
  function attackDiceCount(armies) { return Math.min(3, armies - 1); }
  function defendDiceCount(armies) { return Math.min(2, armies); }

  // resolve ONE assault (one roll of dice). Mutates a clone; returns
  // { state, roll:{atk:[],def:[]}, losses:{atk,def}, conquered, advanced }
  function resolve(s, from, to, randomFn) {
    var rf = randomFn || Math.random;
    if (!canAttack(s, from, to)) return null;
    var ns = clone(s);
    var aDice = attackDiceCount(ns.terr[from].armies);
    var dDice = defendDiceCount(ns.terr[to].armies);
    var roll = function (n) { var r = []; for (var i = 0; i < n; i++) r.push(1 + Math.floor(rf() * 6)); return r.sort(function (a, b) { return b - a; }); };
    var atk = roll(aDice), def = roll(dDice);
    var pairs = Math.min(atk.length, def.length), lossA = 0, lossD = 0;
    for (var i = 0; i < pairs; i++) { if (atk[i] > def[i]) lossD++; else lossA++; }
    ns.terr[from].armies -= lossA; ns.terr[to].armies -= lossD;
    var conquered = false, advanced = 0;
    if (ns.terr[to].armies <= 0) {
      conquered = true;
      var loser = s.terr[to].owner;
      advanced = Math.max(aDice, 1);
      advanced = Math.min(advanced, ns.terr[from].armies - 1);
      ns.terr[to].owner = ns.turn; ns.terr[to].armies = advanced;
      ns.terr[from].armies -= advanced;
      ns.conquered = true;
      ns.log.push(BY_ID[from].name + ' takes ' + BY_ID[to].name);
      if (!alive(ns, loser) && ns.eliminated.indexOf(loser) === -1) {
        ns.eliminated.push(loser);
        ns.log.push((nameOf(ns, loser)) + ' is eliminated');
      }
      // overall victory?
      if (activePlayers(ns).length <= 1) { ns.winner = ns.turn; ns.phase = 'over'; }
    }
    return { state: ns, roll: { atk: atk, def: def }, losses: { atk: lossA, def: lossD }, conquered: conquered, advanced: advanced };
  }
  function nameOf(s, pid) { var p = s.players.find(function (x) { return x.id === pid; }); return p ? p.name : pid; }

  // ---- fortify ------------------------------------------------------------
  function canFortify(s, from, to) {
    return s.phase === 'fortify' && s.terr[from].owner === s.turn &&
      s.terr[to].owner === s.turn && adjacent(from, to) && s.terr[from].armies >= 2;
  }
  function fortify(s, from, to, count) {
    if (!canFortify(s, from, to)) return s;
    var ns = clone(s);
    var max = ns.terr[from].armies - 1;
    count = count == null ? max : Math.max(1, Math.min(count, max));
    ns.terr[from].armies -= count; ns.terr[to].armies += count;
    ns.log.push('Fortify ' + BY_ID[from].name + ' \u2192 ' + BY_ID[to].name + ' (' + count + ')');
    return ns; // repeatable: turn ends only when the player chooses
  }
  // shift armies between two owned territories (n>0: from->to, n<0: to->from); each keeps >=1
  function shiftArmies(s, from, to, n) {
    var ns = clone(s);
    if (n > 0) { n = Math.min(n, ns.terr[from].armies - 1); if (n > 0) { ns.terr[from].armies -= n; ns.terr[to].armies += n; } }
    else if (n < 0) { var m = Math.min(-n, ns.terr[to].armies - 1); if (m > 0) { ns.terr[to].armies -= m; ns.terr[from].armies += m; } }
    return ns;
  }

  // ---- phase / turn flow --------------------------------------------------
  function toAttack(s) { var ns = clone(s); if (ns.phase === 'reinforce') ns.phase = 'attack'; return ns; }
  function toFortify(s) { var ns = clone(s); if (ns.phase === 'attack') ns.phase = 'fortify'; return ns; }

  function nextActive(s, pid) {
    var order = s.players.map(function (p) { return p.id; });
    var i = order.indexOf(pid);
    for (var k = 1; k <= order.length; k++) {
      var cand = order[(i + k) % order.length];
      if (alive(s, cand)) return cand;
    }
    return pid;
  }
  function endTurn(s) {
    var ns = clone(s);
    if (ns.winner) { ns.phase = 'over'; return ns; }
    ns.turn = nextActive(ns, ns.turn);
    ns.phase = 'reinforce'; ns.conquered = false; ns.fortified = false;
    ns.toPlace = reinforcements(ns, ns.turn);
    return ns;
  }

  // ---- AI -----------------------------------------------------------------
  // odds heuristic: attacker advantage = (from.armies - 1) - to.armies
  function attackEdge(s, from, to) { return (s.terr[from].armies - 1) - s.terr[to].armies; }

  // Reinforce plan -> array of {id,count}. Hard piles on the most useful front;
  // easy spreads more randomly. Returns placements summing to toPlace.
  function aiReinforcePlan(s, randomFn) {
    var rf = randomFn || Math.random;
    var pid = s.turn, pool = s.toPlace, plan = {};
    var borders = borderTerr(s, pid);
    if (!borders.length) borders = ownedBy(s, pid);
    var lvl = playerLevel(s, pid);
    // score each border: prefer ones that can break into a weak enemy or that
    // defend an owned continent edge; hard weights offence + continent value.
    function score(id) {
      var best = -99, contVal = 0;
      enemyNeighbours(s, id).forEach(function (n) {
        var edge = (s.terr[id].armies - 1) - s.terr[n].armies;
        var cv = CONT.reduce(function (a, c) { return a + (c.id === BY_ID[n].cont ? c.bonus : 0); }, 0);
        if (edge + cv * 0.5 > best) best = edge + cv * 0.5;
        contVal = Math.max(contVal, cv);
      });
      var ownCont = CONT.reduce(function (a, c) { return a + (ownsContinent(s, pid, c.id) && c.id === BY_ID[id].cont ? c.bonus : 0); }, 0);
      return best + ownCont + (lvl === 'hard' ? 0 : rf() * 3);
    }
    var ranked = borders.slice().sort(function (a, b) { return score(b) - score(a); });
    if (lvl === 'hard') {
      // 60% onto the top front, rest onto the next two
      var top = ranked[0];
      var heavy = Math.ceil(pool * 0.6);
      plan[top] = (plan[top] || 0) + heavy; pool -= heavy;
      var rest = ranked.slice(1, 3); var ri = 0;
      while (pool > 0) { var t = rest.length ? rest[ri % rest.length] : top; plan[t] = (plan[t] || 0) + 1; pool--; ri++; }
    } else {
      while (pool > 0) { var t2 = ranked[Math.floor(rf() * Math.min(ranked.length, 4))]; plan[t2] = (plan[t2] || 0) + 1; pool--; }
    }
    return Object.keys(plan).map(function (id) { return { id: id, count: plan[id] }; });
  }
  function playerLevel(s, pid) { var p = s.players.find(function (x) { return x.id === pid; }); return (p && p.level) || 'hard'; }

  // best attack for the side to move, or null to stop attacking
  function aiNextAttack(s, randomFn) {
    var rf = randomFn || Math.random;
    var pid = s.turn, lvl = playerLevel(s, pid), best = null, bestScore = 0;
    ownedBy(s, pid).forEach(function (from) {
      if (s.terr[from].armies < 2) return;
      enemyNeighbours(s, from).forEach(function (to) {
        var edge = attackEdge(s, from, to);
        // threshold: hard attacks at >=1 edge; easy needs a clearer margin
        var need = lvl === 'hard' ? 1 : 2;
        if (edge < need) return;
        var cv = CONT.reduce(function (a, c) { return a + (c.id === BY_ID[to].cont ? c.bonus : 0); }, 0);
        // would this conquest complete a continent for me?
        var completes = 0;
        var cm = contMembers(BY_ID[to].cont);
        if (cm.every(function (id) { return id === to || s.terr[id].owner === pid; })) completes = 4;
        // eliminating a player (their last territory)?
        var elim = ownedBy(s, s.terr[to].owner).length === 1 ? 3 : 0;
        var score = edge + cv + completes + elim + (lvl === 'hard' ? 0 : rf());
        if (score > bestScore) { bestScore = score; best = { from: from, to: to }; }
      });
    });
    return best;
  }

  // fortify plan -> {from,to,count} | null. Shift armies from the safest, most
  // stacked interior toward the neediest front.
  function aiFortifyPlan(s) {
    var pid = s.turn, lvl = playerLevel(s, pid);
    var own = ownedBy(s, pid);
    var interiors = own.filter(function (id) { return enemyNeighbours(s, id).length === 0 && s.terr[id].armies >= 2; });
    if (!interiors.length) return null;
    // source: interior with most armies that has a friendly neighbour on the way
    var src = null;
    interiors.sort(function (a, b) { return s.terr[b].armies - s.terr[a].armies; });
    for (var i = 0; i < interiors.length; i++) {
      if (friendlyNeighbours(s, interiors[i]).length) { src = interiors[i]; break; }
    }
    if (!src) return null;
    // dest: adjacent friendly territory with the greatest enemy pressure
    var dests = friendlyNeighbours(s, src);
    dests.sort(function (a, b) {
      var pa = enemyNeighbours(s, a).reduce(function (x, n) { return x + s.terr[n].armies; }, 0);
      var pb = enemyNeighbours(s, b).reduce(function (x, n) { return x + s.terr[n].armies; }, 0);
      return pb - pa;
    });
    var dst = dests[0];
    if (enemyNeighbours(s, dst).length === 0 && lvl === 'easy') return null;
    return { from: src, to: dst, count: s.terr[src].armies - 1 };
  }

  // ---- coach (suggestion for the side to move) ----------------------------
  function coachSuggestion(s) {
    if (s.winner) return null;
    var pid = s.turn;
    if (s.phase === 'reinforce') {
      var plan = aiReinforcePlan(s, function () { return 0; });
      if (plan.length) return { text: 'Reinforce ' + BY_ID[plan[0].id].name + ' — your most useful front.', terr: plan[0].id };
      return { text: 'Place your reinforcements on a border.', terr: null };
    }
    if (s.phase === 'attack') {
      var atk = aiNextAttack(s, function () { return 0; });
      if (atk) {
        var note = '';
        var cm = contMembers(BY_ID[atk.to].cont);
        if (cm.every(function (id) { return id === atk.to || s.terr[id].owner === pid; })) note = ' to seize ' + contName(BY_ID[atk.to].cont);
        return { text: 'Attack ' + BY_ID[atk.to].name + ' from ' + BY_ID[atk.from].name + note + '.', from: atk.from, to: atk.to };
      }
      return { text: 'No favourable attacks — end your assault and fortify.', from: null, to: null };
    }
    var f = aiFortifyPlan(s);
    if (f) return { text: 'Fortify ' + BY_ID[f.to].name + ' from ' + BY_ID[f.from].name + '.', from: f.from, to: f.to };
    return { text: 'Nothing to fortify — end your turn.', from: null, to: null };
  }
  function contName(cid) { var c = CONT.find(function (x) { return x.id === cid; }); return c ? c.name : cid; }

  root.SalientEngine = {
    TERR: TERR, CONT: CONT, ADJ: ADJ, BY_ID: BY_ID, BRIDGES: BRIDGES,
    adjacent: adjacent, contMembers: contMembers, contName: contName,
    create: create, clone: clone, ownedBy: ownedBy, ownsContinent: ownsContinent,
    armiesOf: armiesOf, alive: alive, activePlayers: activePlayers, nameOf: nameOf,
    borderTerr: borderTerr, enemyNeighbours: enemyNeighbours, friendlyNeighbours: friendlyNeighbours,
    reinforcements: reinforcements, continentBonus: continentBonus, placeArmy: placeArmy,
    canAttack: canAttack, attackDiceCount: attackDiceCount, defendDiceCount: defendDiceCount, resolve: resolve,
    canFortify: canFortify, fortify: fortify, shiftArmies: shiftArmies, attackEdge: attackEdge,
    toAttack: toAttack, toFortify: toFortify, endTurn: endTurn, nextActive: nextActive,
    aiReinforcePlan: aiReinforcePlan, aiNextAttack: aiNextAttack, aiFortifyPlan: aiFortifyPlan,
    coachSuggestion: coachSuggestion, startArmies: startArmies, playerLevel: playerLevel,
  };
})(typeof window !== 'undefined' ? window : this);
