/* ============================================================================
 * pylos-engine.test.js — ONE test source, runnable two ways:
 *   - in the browser via pylos-engine.test.html (renders a pass/fail report);
 *   - headless via JXA:  cat pylos-engine.js pylos-engine.test.js > /tmp/r.js
 *                        && osascript -l JavaScript /tmp/r.js
 *     (the engine attaches to `this` when `window` is absent, so PylosEngine is
 *      a global in JXA too). console.log lines go to stderr there.
 *
 * Results are also exposed as globalThis.__PYLOS_TEST__ = {pass, fail, lines}
 * so the gate command can print a one-line verdict as its final expression.
 * ========================================================================== */
(function (G) {
  'use strict';
  var E = G.PylosEngine;
  var pass = 0, fail = 0, lines = [];
  function emit(line) { lines.push(line); if (typeof console !== 'undefined' && console.log) console.log(line); }
  function ok(name, cond, detail) { if (cond) { pass++; emit('PASS  ' + name); } else { fail++; emit('FAIL  ' + name + '  -- ' + (detail || 'assertion failed')); } }
  function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
  function grp(name) { emit(''); emit('# ' + name); }

  function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function total(s, p) { return E.onBoard(s.levels, p) + s.reserves[p]; }
  function noFloating(L) { for (var l = 1; l < 4; l++) { var n = 4 - l; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (L[l][r][c] != null && !E.isSupported(L, l, r, c)) return false; } return true; }

  grp('create / initial state');
  var s0 = E.create();
  eq('turn p1', s0.turn, 'p1'); eq('p1 reserve 15', s0.reserves.p1, 15); eq('p2 reserve 15', s0.reserves.p2, 15);
  eq('winner null', s0.winner, null); eq('base 4x4', s0.levels[0].length, 4); eq('apex 1x1', s0.levels[3].length, 1);

  grp('geometry / predicates');
  ok('base all supported', (function () { for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!E.isSupported(s0.levels, 0, r, c)) return false; return true; })());
  ok('apex unsupported on empty', !E.isSupported(s0.levels, 3, 0, 0));
  eq('supporters(1,0,0) = 4', E.supporters(1, 0, 0).length, 4);
  eq('coversOf(0,0,0) = 1', E.coversOf(0, 0, 0).length, 1);
  eq('coversOf(0,1,1) = 4', E.coversOf(0, 1, 1).length, 4);

  grp('base move generation');
  var m0 = E.baseMoves(s0.levels, 'p1', 15);
  eq('16 base placements', m0.filter(function (m) { return m.kind === 'place'; }).length, 16);
  eq('0 raises on empty', m0.filter(function (m) { return m.kind === 'raise'; }).length, 0);
  eq('legalMoves empty = 16', E.legalMoves(s0).length, 16);

  grp('applyMove — place / no-mutation / conservation');
  var s1 = E.applyMove(s0, { kind: 'place', dst: { l: 0, r: 0, c: 0 }, take: [] });
  eq('place sets cell', s1.levels[0][0][0], 'p1'); eq('place decrements reserve', s1.reserves.p1, 14); eq('turn flips', s1.turn, 'p2');
  eq('input cell not mutated', s0.levels[0][0][0], null); eq('input reserve not mutated', s0.reserves.p1, 15);
  eq('conservation p1', total(s1, 'p1'), 15);

  grp('square reclaim');
  var sq = E.create(); sq.levels[0][0][0] = 'p1'; sq.levels[0][0][1] = 'p1'; sq.levels[0][1][0] = 'p1'; sq.reserves.p1 = 12; sq.turn = 'p1';
  var sqMoves = E.legalMoves(sq).filter(function (m) { return m.kind === 'place' && m.dst.l === 0 && m.dst.r === 1 && m.dst.c === 1; });
  ok('square move offers reclaim variants', sqMoves.length >= 2, 'got ' + sqMoves.length);
  ok('a variant takes 0', sqMoves.some(function (m) { return m.take.length === 0; }));
  ok('a variant takes 2', sqMoves.some(function (m) { return m.take.length === 2; }));
  var take2 = sqMoves.find(function (m) { return m.take.length === 2; });
  var sqAfter = E.applyMove(sq, take2);
  eq('reclaim returns 2 to reserve', sqAfter.reserves.p1, 12 - 1 + 2);
  ok('conservation after reclaim', total(sqAfter, 'p1') === 15);
  var exFull = E.legalMoves(sq, { exhaustive: true }).filter(function (m) { return m.dst.l === 0 && m.dst.r === 1 && m.dst.c === 1; });
  ok('exhaustive >= bounded reclaim variants', exFull.length >= sqMoves.length, 'ex ' + exFull.length + ' bounded ' + sqMoves.length);

  grp('apex win');
  var aw = E.create();
  for (var Lv = 0; Lv < 3; Lv++) { var n = 4 - Lv; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) aw.levels[Lv][r][c] = ((r + c) % 2 === 0) ? 'p1' : 'p2'; }
  aw.turn = 'p1'; aw.reserves.p1 = 5;
  ok('apex seat placeable', E.canPlaceAt(aw.levels, 3, 0, 0));
  var awAfter = E.applyMove(aw, { kind: 'place', dst: { l: 3, r: 0, c: 0 }, take: [] });
  eq('crowning the apex wins', awAfter.winner, 'p1');

  grp('property — seeded random self-play (200 games)');
  var games = 200, vio = { floating: 0, cons: 0, illegal: 0, nomove: 0, draw: 0 }, fin = 0, maxLen = 0;
  for (var g = 0; g < games; g++) {
    var rnd = mulberry32(0x51A0 + g * 2654435761);
    var s = E.create(g % 2 === 0 ? 'p1' : 'p2'); var steps = 0;
    while (!s.winner && steps < 400) {
      var mv = E.legalMoves(s); if (!mv.length) { vio.nomove++; break; }
      var pick = mv[Math.floor(rnd() * mv.length)]; var snap = JSON.stringify(s);
      var ns = E.applyMove(s, pick); if (JSON.stringify(s) !== snap) vio.illegal++;
      s = ns; steps++;
      if (!noFloating(s.levels)) vio.floating++;
      if (total(s, 'p1') !== 15 || total(s, 'p2') !== 15) vio.cons++;
    }
    if (s.winner) fin++; else if (steps >= 400) vio.draw++;
    maxLen = Math.max(maxLen, steps);
  }
  eq('all games terminate with a winner', fin, games);
  eq('no floating-sphere states', vio.floating, 0);
  eq('no conservation violations', vio.cons, 0);
  eq('no applyMove input mutation', vio.illegal, 0);
  eq('no "no move before winner"', vio.nomove, 0);
  eq('no draws / infinite games', vio.draw, 0);
  ok('longest game <= 60 plies', maxLen <= 60, 'maxLen ' + maxLen);

  // ------------------------------------------------- Unit 2: eval + search
  grp('eval + alpha-beta search (Unit 2)');
  function hasWinningMove(s) { return E.legalMoves(s).some(function (m) { return E.applyMove(s, m).winner === s.turn; }); }

  // terminal eval sign (awAfter from the apex-win group: p1 just crowned)
  ok('eval: +ve for the winner', E.evalState(awAfter, 'p1') > 0, 'got ' + E.evalState(awAfter, 'p1'));
  ok('eval: -ve for the loser', E.evalState(awAfter, 'p2') < 0, 'got ' + E.evalState(awAfter, 'p2'));
  // eval directionality: a reserve advantage should score higher for me
  (function () { var a = E.create(), b = E.create(); b.reserves.p1 = 9; ok('eval rewards a reserve advantage', E.evalState(a, 'p1') > E.evalState(b, 'p1')); })();
  // concrete: a position with an immediate apex win must be taken
  var apexPick = E.bestMove(aw, 3, mulberry32(1));
  ok('bestMove takes the immediate apex win', !!apexPick && E.applyMove(aw, apexPick).winner === 'p1');

  // collect NEAR-TERMINAL positions that actually have a winning move (apex/stuck).
  function collectWinnable(n, seed) {
    var rnd = mulberry32(seed), out = [], guard = 0;
    while (out.length < n && guard < 6000) {
      guard++;
      var s = E.create(guard % 2 ? 'p1' : 'p2'), steps = 0;
      while (!s.winner && steps < 200) {
        if (hasWinningMove(s)) { out.push(s); if (out.length >= n) break; }
        var mv = E.legalMoves(s); s = E.applyMove(s, mv[Math.floor(rnd() * mv.length)]); steps++;
      }
    }
    return out;
  }
  var winnable = collectWinnable(80, 0xABCD);
  ok('exercised real winnable positions', winnable.length >= 20, 'got ' + winnable.length);
  var winMiss = 0;
  winnable.forEach(function (s) { var pick = E.bestMove(s, 2, mulberry32(9)); if (E.applyMove(s, pick).winner !== s.turn) winMiss++; });
  eq('always takes an immediate winning move', winMiss, 0);

  // collect general mid-game positions for determinism + sanity
  function collectPositions(n, seed) {
    var rnd = mulberry32(seed), out = [], guard = 0;
    while (out.length < n && guard < n * 40) {
      guard++;
      var s = E.create(guard % 2 ? 'p1' : 'p2'), steps = 0, stopAt = 4 + Math.floor(rnd() * 22);
      while (!s.winner && steps < stopAt) { var mv = E.legalMoves(s); s = E.applyMove(s, mv[Math.floor(rnd() * mv.length)]); steps++; }
      if (!s.winner && E.legalMoves(s).length >= 2) out.push(s);
    }
    return out;
  }
  var positions = collectPositions(60, 0xC0FFEE);
  ok('collected mid-game positions', positions.length >= 30, 'got ' + positions.length);
  var nondet = 0;
  positions.slice(0, 40).forEach(function (s) {
    var a = E.bestMove(s, 3, mulberry32(42)), b = E.bestMove(s, 3, mulberry32(42));
    if (JSON.stringify(a) !== JSON.stringify(b)) nondet++;
  });
  eq('bestMove is deterministic under a fixed seed', nondet, 0);

  // sanity: depth-3 search from the opening returns a legal move; weakMove works
  ok('depth-3 search from opening returns a move', !!E.bestMove(E.create(), 3, mulberry32(1)));
  ok('weakMove returns a legal move', !!E.weakMove(E.create(), mulberry32(3)));

  // ------------------------------------------------- Unit 3: difficulty ladder
  grp('difficulty ladder (Unit 3)');
  ['novice', 'club', 'strong', 'expert'].forEach(function (lv) {
    ok('chooseMove(' + lv + ') returns a move', !!E.chooseMove(E.create(), lv, mulberry32(5)));
  });
  ['club', 'strong', 'expert'].forEach(function (lv) {
    var a = E.chooseMove(positions[0], lv, mulberry32(11)), b = E.chooseMove(positions[0], lv, mulberry32(11));
    ok('chooseMove(' + lv + ') deterministic under fixed seed', JSON.stringify(a) === JSON.stringify(b));
  });
  // endgame gating: aw has 29 spheres placed (only the apex empty) -> expert deep-searches & wins
  ok('endgame gate active near the top (emptySeats <= 8)', E.emptySeats(aw) <= 8, 'emptySeats ' + E.emptySeats(aw));
  ok('expert takes the apex win in the endgame', E.applyMove(aw, E.chooseMove(aw, 'expert', mulberry32(1))).winner === 'p1');

  // ladder is REAL: Strong (depth 3) out-scores Club (depth 2) over seeded games
  function playGame(p1lv, p2lv, seed) {
    var rnd = mulberry32(seed), s = E.create('p1'), steps = 0;
    while (!s.winner && steps < 200) { var lv = s.turn === 'p1' ? p1lv : p2lv; s = E.applyMove(s, E.chooseMove(s, lv, rnd)); steps++; }
    return s.winner;
  }
  var N = 8, strongWins = 0, clubWins = 0;
  for (var gi = 0; gi < N; gi++) {
    var w1 = playGame('strong', 'club', 0x1000 + gi); if (w1 === 'p1') strongWins++; else if (w1 === 'p2') clubWins++;
    var w2 = playGame('club', 'strong', 0x2000 + gi); if (w2 === 'p2') strongWins++; else if (w2 === 'p1') clubWins++;
  }
  emit('   ladder record: Strong ' + strongWins + ' - ' + clubWins + ' Club (of ' + (2 * N) + ')');
  ok('Strong out-scores (>=) Club across the ladder', strongWins >= clubWins, 'Strong ' + strongWins + ' Club ' + clubWins);

  // ------------------------------------------------- Unit 4: differential oracle
  grp('differential oracle (Unit 4)');
  // INDEPENDENT exhaustive solver: can the side to move FORCE a win? (perfect play,
  // exhaustive reclaim subsets, path-cycle => not a forced win, hard ply cap for safety)
  function keyOf(s) { return JSON.stringify([s.levels, s.turn, s.reserves]); }
  function oracleWins(s, path, ply) {
    if (ply > 18) return false;
    var key = keyOf(s);
    if (path.has(key)) return false;
    path.add(key);
    var res = false, moves = E.legalMoves(s, { exhaustive: true });
    for (var i = 0; i < moves.length; i++) {
      var ns = E.applyMove(s, moves[i]);
      if (ns.winner === s.turn) { res = true; break; }          // immediate win
      if (!ns.winner && !oracleWins(ns, path, ply + 1)) { res = true; break; } // opponent can't force a win
    }
    path.delete(key);
    return res;
  }
  // collect small, non-terminal endgame positions (apex not yet reachable)
  function collectEndgames(n, seed) {
    var rnd = mulberry32(seed), out = [], guard = 0;
    while (out.length < n && guard < 30000) {
      guard++;
      var s = E.create(guard % 2 ? 'p1' : 'p2'), steps = 0;
      while (!s.winner && steps < 200) {
        if (E.emptySeats(s) <= 3 && E.legalMoves(s).length >= 1) { out.push(s); break; }
        var mv = E.legalMoves(s); s = E.applyMove(s, mv[Math.floor(rnd() * mv.length)]); steps++;
      }
    }
    return out;
  }
  var endgames = collectEndgames(40, 0xDEED);
  ok('collected small endgame positions', endgames.length >= 15, 'got ' + endgames.length);

  var mism = 0, wonCount = 0, notWon = 0;
  endgames.forEach(function (s) {
    var ow = oracleWins(s, new Set(), 0);
    var engineWin = E.searchRoot(s, 10, 800000).value >= E.WIN - 1;
    if (engineWin !== ow) mism++;
    if (ow) wonCount++; else notWon++;
  });
  eq('engine deep value agrees with the exhaustive oracle', mism, 0);
  ok('oracle sample is non-vacuous (both win & not-win seen)', wonCount > 0 && notWon > 0, 'won ' + wonCount + ' notWon ' + notWon);

  // conversion: from an oracle-WON position, expert beats a random opponent (never loses a won game)
  var convFail = 0, convTested = 0;
  endgames.forEach(function (s) {
    if (convTested >= 8 || !oracleWins(s, new Set(), 0)) return;
    convTested++;
    var st = s, rnd = mulberry32(123), steps = 0;
    while (!st.winner && steps < 80) {
      var mv = (st.turn === s.turn) ? E.chooseMove(st, 'expert', rnd) : (function () { var L = E.legalMoves(st); return L[Math.floor(rnd() * L.length)]; })();
      st = E.applyMove(st, mv); steps++;
    }
    if (st.winner !== s.turn) convFail++;
  });
  ok('expert converts oracle-won endgames vs random play', convFail === 0 && convTested > 0, 'fail ' + convFail + ' tested ' + convTested);

  var summary = (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' -- ' + pass + ' passed, ' + fail + ' failed';
  emit(''); emit(summary);
  G.__PYLOS_TEST__ = { pass: pass, fail: fail, lines: lines, summary: summary };
})(typeof window !== 'undefined' ? window : this);
