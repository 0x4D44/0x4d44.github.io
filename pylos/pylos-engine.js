/* ============================================================================
 * pylos-engine.js — pure, deterministic Pylos rules + move generation.
 *
 * No DOM, no React, no DCLogic: a plain global `window.PylosEngine` so the game
 * (pylos/index.html) and the test harness (pylos-engine.test.html) share ONE
 * source of truth for the rules. The AI search (minimax/eval/difficulty) is
 * layered on top of this file in later units; this unit is rules + state only.
 *
 * BOARD MODEL
 *   levels[0] = 4x4 base, levels[1] = 3x3, levels[2] = 2x2, levels[3] = 1x1 apex.
 *   A cell holds 'p1' | 'p2' | null. 30 spheres total (15 each); the pyramid has
 *   16+9+4+1 = 30 seats, so neither side can fill it alone — recycling via raises
 *   and 2x2-square reclaims is the game.
 *
 * STATE  { levels, reserves:{p1,p2}, turn:'p1'|'p2', winner:null|'p1'|'p2' }
 *   The engine models a *complete turn* as one Move (place/raise + an optional
 *   reclaim of 0-2 of your free spheres when the move completes a 2x2 square),
 *   so applyMove flips the turn and search trees stay clean. The interactive UI
 *   keeps its own phase-based flow but validates against these same helpers.
 *
 * MOVE  { kind:'place'|'raise', src?:{l,r,c}, dst:{l,r,c}, take:[{l,r,c}...] }
 *   take is the (possibly empty) list of own free spheres reclaimed this turn;
 *   only non-empty when dst completes a square of `turn`'s colour.
 * ========================================================================== */
(function (root) {
  'use strict';

  var PLAYERS = ['p1', 'p2'];
  function other(p) { return p === 'p1' ? 'p2' : 'p1'; }

  // ---- state construction -------------------------------------------------
  function emptyGrid(n) {
    var g = [];
    for (var r = 0; r < n; r++) g.push(new Array(n).fill(null));
    return g;
  }
  function create(turn) {
    return {
      levels: [emptyGrid(4), emptyGrid(3), emptyGrid(2), emptyGrid(1)],
      reserves: { p1: 15, p2: 15 },
      turn: turn || 'p1',
      winner: null,
    };
  }
  function cloneLevels(L) { return L.map(function (g) { return g.map(function (row) { return row.slice(); }); }); }
  function cloneState(s) {
    return { levels: cloneLevels(s.levels), reserves: { p1: s.reserves.p1, p2: s.reserves.p2 }, turn: s.turn, winner: s.winner };
  }

  // ---- geometry / predicates (operate on a raw `levels` array) -------------
  function inBounds(l, r, c) { var n = 4 - l; return l >= 0 && l <= 3 && r >= 0 && c >= 0 && r < n && c < n; }
  function filledAt(L, l, r, c) { return inBounds(l, r, c) && L[l][r][c] != null; }
  // the 4 cells on the level below that a cell at (l,r,c) rests on
  function supporters(l, r, c) { return l === 0 ? [] : [[l - 1, r, c], [l - 1, r, c + 1], [l - 1, r + 1, c], [l - 1, r + 1, c + 1]]; }
  function isSupported(L, l, r, c) {
    if (l === 0) return true;
    return supporters(l, r, c).every(function (s) { return filledAt(L, s[0], s[1], s[2]); });
  }
  // the (up to 4) cells on the level above that rest on (l,r,c)
  function coversOf(l, r, c) {
    var res = []; if (l >= 3) return res; var n1 = 4 - (l + 1);
    for (var R = r - 1; R <= r; R++) for (var C = c - 1; C <= c; C++) if (R >= 0 && C >= 0 && R < n1 && C < n1) res.push([l + 1, R, C]);
    return res;
  }
  // a sphere is "free" (removable / raisable) when nothing rests on it
  function isFree(L, l, r, c) { return coversOf(l, r, c).every(function (cv) { return !filledAt(L, cv[0], cv[1], cv[2]); }); }
  function canPlaceAt(L, l, r, c) { return !filledAt(L, l, r, c) && isSupported(L, l, r, c); }
  function isSupporterOf(l, r, c, s) { return supporters(l, r, c).some(function (sp) { return sp[0] === s.l && sp[1] === s.r && sp[2] === s.c; }); }
  function hasRaiseDest(L, l, r, c) {
    for (var l2 = l + 1; l2 <= 3; l2++) { var n = 4 - l2;
      for (var r2 = 0; r2 < n; r2++) for (var c2 = 0; c2 < n; c2++)
        if (canPlaceAt(L, l2, r2, c2) && !isSupporterOf(l2, r2, c2, { l: l, r: r, c: c })) return true; }
    return false;
  }
  // does the cell (l,r,c), owned by p, complete a 2x2 square of p at level l?
  function squaresAt(L, l, r, c, p) {
    var n = 4 - l;
    for (var br = r - 1; br <= r; br++) for (var bc = c - 1; bc <= c; bc++) {
      if (br < 0 || bc < 0 || br + 1 >= n || bc + 1 >= n) continue;
      if (L[l][br][bc] === p && L[l][br][bc + 1] === p && L[l][br + 1][bc] === p && L[l][br + 1][bc + 1] === p) return true;
    }
    return false;
  }
  function freeOwnCells(L, p) {
    var out = [];
    for (var l = 0; l < 4; l++) { var n = 4 - l;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (L[l][r][c] === p && isFree(L, l, r, c)) out.push({ l: l, r: r, c: c }); }
    return out;
  }
  function hasFreeOwn(L, p) { return freeOwnCells(L, p).length > 0; }
  function anyRaise(L, p) {
    for (var l = 0; l < 3; l++) { var n = 4 - l;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
        if (L[l][r][c] === p && isFree(L, l, r, c) && hasRaiseDest(L, l, r, c)) return true; }
    return false;
  }
  // is there ANY legal move for p? (used to detect the stuck-loss)
  function hasAnyMove(L, p, reserve) {
    if (reserve > 0) {
      for (var l = 0; l < 4; l++) { var n = 4 - l;
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (canPlaceAt(L, l, r, c)) return true; }
    }
    return anyRaise(L, p);
  }

  // ---- base move generation (place + raise, no reclaim) -------------------
  function baseMoves(L, p, reserve) {
    var moves = [];
    if (reserve > 0) {
      for (var l = 0; l < 4; l++) { var n = 4 - l;
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (canPlaceAt(L, l, r, c)) moves.push({ kind: 'place', dst: { l: l, r: r, c: c } }); }
    }
    for (var l2 = 0; l2 < 3; l2++) { var n2 = 4 - l2;
      for (var r2 = 0; r2 < n2; r2++) for (var c2 = 0; c2 < n2; c2++) {
        if (L[l2][r2][c2] !== p || !isFree(L, l2, r2, c2)) continue;
        for (var ll = l2 + 1; ll <= 3; ll++) { var nn = 4 - ll;
          for (var rr = 0; rr < nn; rr++) for (var cc = 0; cc < nn; cc++)
            if (canPlaceAt(L, ll, rr, cc) && !isSupporterOf(ll, rr, cc, { l: l2, r: r2, c: c2 }))
              moves.push({ kind: 'raise', src: { l: l2, r: r2, c: c2 }, dst: { l: ll, r: rr, c: cc } }); }
      }
    }
    return moves;
  }

  // apply only the place/raise part of a move to a fresh levels copy
  function applyBase(L, p, move) {
    var nl = cloneLevels(L);
    if (move.kind === 'place') nl[move.dst.l][move.dst.r][move.dst.c] = p;
    else { nl[move.src.l][move.src.r][move.src.c] = null; nl[move.dst.l][move.dst.r][move.dst.c] = p; }
    return nl;
  }

  // k-combinations (0,1,2) of free own cells for the reclaim choice
  function reclaimSets(freeCells, exhaustive) {
    var sets = [[]];
    if (!freeCells.length) return sets;
    if (exhaustive) {
      for (var i = 0; i < freeCells.length; i++) {
        sets.push([freeCells[i]]);
        for (var j = i + 1; j < freeCells.length; j++) sets.push([freeCells[i], freeCells[j]]);
      }
      return sets;
    }
    // bounded representative set for search: highest-1, highest-2, lowest-1
    var byHigh = freeCells.slice().sort(function (a, b) { return b.l - a.l; });
    var byLow = freeCells.slice().sort(function (a, b) { return a.l - b.l; });
    sets.push([byHigh[0]]);
    if (byHigh.length >= 2) sets.push([byHigh[0], byHigh[1]]);
    if (byLow[0].l !== byHigh[0].l || byLow[0].c !== byHigh[0].c || byLow[0].r !== byHigh[0].r) sets.push([byLow[0]]);
    return sets;
  }

  /* Full legal moves = base moves, each expanded with its reclaim options when
   * it completes a square. opts.exhaustive enumerates every reclaim subset (for
   * the oracle / legality tests); otherwise a bounded set (for the playing AI). */
  function legalMoves(state, opts) {
    if (state.winner) return [];
    var L = state.levels, p = state.turn, exhaustive = !!(opts && opts.exhaustive);
    var out = [];
    baseMoves(L, p, state.reserves[p]).forEach(function (m) {
      if (m.dst.l === 3) { out.push({ kind: m.kind, src: m.src, dst: m.dst, take: [] }); return; } // apex wins; no reclaim
      var after = applyBase(L, p, m);
      if (squaresAt(after, m.dst.l, m.dst.r, m.dst.c, p) && hasFreeOwn(after, p)) {
        reclaimSets(freeOwnCells(after, p), exhaustive).forEach(function (set) {
          out.push({ kind: m.kind, src: m.src, dst: m.dst, take: set });
        });
      } else {
        out.push({ kind: m.kind, src: m.src, dst: m.dst, take: [] });
      }
    });
    return out;
  }

  /* Apply a complete move, returning a NEW state with the turn resolved.
   * Mirrors the UI's resolveLanding + finishTurn semantics exactly. */
  function applyMove(state, move) {
    var p = state.turn, ns = cloneState(state);
    if (move.kind === 'place') { ns.reserves[p] -= 1; ns.levels[move.dst.l][move.dst.r][move.dst.c] = p; }
    else { ns.levels[move.src.l][move.src.r][move.src.c] = null; ns.levels[move.dst.l][move.dst.r][move.dst.c] = p; }
    var apexWin = move.dst.l === 3;
    if (!apexWin && move.take && move.take.length) {
      move.take.forEach(function (t) { ns.levels[t.l][t.r][t.c] = null; ns.reserves[p] += 1; });
    }
    // The turn ALWAYS flips (even on a winning move) so negamax negation stays
    // consistent: after any move, ns.turn = the non-mover and ns.winner = the mover.
    ns.turn = other(p);
    if (apexWin) ns.winner = p;                                                  // crowned the apex
    else if (!hasAnyMove(ns.levels, ns.turn, ns.reserves[ns.turn])) ns.winner = p; // opponent stuck
    return ns;
  }

  function winner(state) { return state.winner; }
  function isTerminal(state) { return !!state.winner; }

  // spheres physically on the board for p (reserves are tracked separately)
  function onBoard(L, p) {
    var n2 = 0;
    for (var l = 0; l < 4; l++) { var n = 4 - l;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (L[l][r][c] === p) n2++; }
    return n2;
  }

  // ---- AI: evaluation + alpha-beta negamax ---------------------------------
  var WIN = 1e6;

  // number of p's 2x2 squares that are one placeable seat away from completing
  function threatSquares(L, p) {
    var t = 0;
    for (var l = 0; l < 3; l++) { var n = 4 - l;
      for (var br = 0; br <= n - 2; br++) for (var bc = 0; bc <= n - 2; bc++) {
        var own = 0, empt = null, cells = [[br, bc], [br, bc + 1], [br + 1, bc], [br + 1, bc + 1]];
        for (var k = 0; k < 4; k++) { var v = L[l][cells[k][0]][cells[k][1]]; if (v === p) own++; else if (v == null) empt = [l, cells[k][0], cells[k][1]]; }
        if (own === 3 && empt && canPlaceAt(L, empt[0], empt[1], empt[2])) t++;
      } }
    return t;
  }
  // total "build height" of p's spheres (higher = more progress toward the apex)
  function heightScore(L, p) {
    var s = 0;
    for (var l = 0; l < 4; l++) { var n = 4 - l;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (L[l][r][c] === p) s += l; }
    return s;
  }

  /* Leaf evaluation from `me`'s perspective. Pylos is a tempo/parity battle:
   * reserves ARE the resource (out of reserve + no raise = loss), so the reserve
   * differential rewards reserve-preserving raises/reclaims over raw placement.
   * The apex term makes even a depth-1 search take a win and refuse to gift one. */
  function evalState(s, me) {
    var opp = other(me);
    if (s.winner) return s.winner === me ? WIN : -WIN;
    if (canPlaceAt(s.levels, 3, 0, 0)) return s.turn === me ? (WIN - 1) : -(WIN - 1); // side to move can crown next
    var sc = 0;
    sc += (s.reserves[me] - s.reserves[opp]) * 6;            // tempo / material
    sc += threatSquares(s.levels, me) * 7;                   // set up own reclaims
    sc -= threatSquares(s.levels, opp) * 9;                  // deny theirs (worth more)
    sc += (heightScore(s.levels, me) - heightScore(s.levels, opp)); // mild build shaping
    return sc;
  }

  // negamax with alpha-beta; score is from the side-to-move's perspective.
  // ctx = {nodes, budget}: a node budget keeps search time bounded (Pylos recycles
  // spheres, so the tree doesn't shrink monotonically) and the in-game AI snappy;
  // on budget exhaustion a node falls back to the static eval (graceful, not a hang).
  function negamax(s, depth, alpha, beta, ctx) {
    ctx.nodes++;
    if (s.winner) return s.winner === s.turn ? WIN : -WIN;   // (produced states: winner !== turn -> -WIN)
    if (depth <= 0 || ctx.nodes > ctx.budget) return evalState(s, s.turn);
    var moves = legalMoves(s), best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var v = -negamax(applyMove(s, moves[i]), depth - 1, -beta, -alpha, ctx);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /* Root search: returns {value, ties} where value is the negamax value from the
   * side-to-move's perspective and ties are the equal-best moves. Deterministic. */
  function searchRoot(state, depth, budget) {
    if (state.winner) return { value: -WIN, ties: [] };
    var moves = legalMoves(state);
    if (!moves.length) return { value: -WIN, ties: [] };
    if (!(depth > 0)) depth = 1;
    var ctx = { nodes: 0, budget: budget > 0 ? budget : Infinity };
    var alpha = -Infinity, bestVal = -Infinity, ties = [];
    for (var i = 0; i < moves.length; i++) {
      var v = -negamax(applyMove(state, moves[i]), depth - 1, -Infinity, -alpha, ctx);
      if (v > bestVal) { bestVal = v; ties = [moves[i]]; if (v > alpha) alpha = v; }
      else if (v === bestVal) { ties.push(moves[i]); }
    }
    return { value: bestVal, ties: ties };
  }

  /* Best move at a given search depth. randomFn breaks ties among equal-best moves
   * ONLY (so a seeded randomFn => reproducible choice). Optional `budget` caps nodes. */
  function bestMove(state, depth, randomFn, budget) {
    var r = searchRoot(state, depth, budget);
    if (!r.ties.length) return null;
    var rf = randomFn || Math.random;
    return r.ties[Math.floor(rf() * r.ties.length)];
  }

  /* Deliberately weak move (Novice tier): take an immediate win, otherwise mostly
   * avoid gifting the apex, otherwise play at random. randomFn for reproducibility. */
  function weakMove(state, randomFn) {
    var rf = randomFn || Math.random;
    var moves = legalMoves(state);
    if (!moves.length) return null;
    var win = moves.find(function (m) { return m.dst.l === 3; });
    if (win) return win;
    var safe = moves.filter(function (m) { return !canPlaceAt(applyMove(state, m).levels, 3, 0, 0); });
    var pool = (rf() < 0.6 && safe.length) ? safe : moves;
    return pool[Math.floor(rf() * pool.length)];
  }

  // ---- difficulty ladder = search depth ------------------------------------
  function emptySeats(state) { return 30 - onBoard(state.levels, 'p1') - onBoard(state.levels, 'p2'); }

  // Difficulty IS search depth (the dishonest 1-ply "EXPERT" is gone). Expert
  // searches deeper once few seats remain — the late game, where reading to the
  // crown matters most and the tree is cheapest. Node budgets keep every tier
  // responsive on a phone.
  var LEVELS = {
    novice: { weak: true },
    club:   { depth: 2, budget: 30000 },
    strong: { depth: 3, budget: 60000 },
    expert: { depth: 4, budget: 90000, endgameAt: 8, endgameDepth: 6, endgameBudget: 200000 },
  };

  function levelDepth(state, level) {
    var cfg = LEVELS[level] || LEVELS.strong;
    if (cfg.weak) return { weak: true };
    if (cfg.endgameAt != null && emptySeats(state) <= cfg.endgameAt) return { depth: cfg.endgameDepth, budget: cfg.endgameBudget };
    return { depth: cfg.depth, budget: cfg.budget };
  }

  // The one entry point the game uses to pick an AI move at a difficulty level.
  function chooseMove(state, level, randomFn) {
    var d = levelDepth(state, level);
    if (d.weak) return weakMove(state, randomFn);
    return bestMove(state, d.depth, randomFn, d.budget);
  }

  root.PylosEngine = {
    PLAYERS: PLAYERS, other: other,
    create: create, cloneState: cloneState, cloneLevels: cloneLevels, emptyGrid: emptyGrid,
    inBounds: inBounds, filledAt: filledAt, supporters: supporters, isSupported: isSupported,
    coversOf: coversOf, isFree: isFree, canPlaceAt: canPlaceAt, isSupporterOf: isSupporterOf,
    hasRaiseDest: hasRaiseDest, squaresAt: squaresAt, freeOwnCells: freeOwnCells,
    hasFreeOwn: hasFreeOwn, anyRaise: anyRaise, hasAnyMove: hasAnyMove,
    baseMoves: baseMoves, applyBase: applyBase, reclaimSets: reclaimSets,
    legalMoves: legalMoves, applyMove: applyMove, winner: winner, isTerminal: isTerminal,
    onBoard: onBoard,
    WIN: WIN, threatSquares: threatSquares, heightScore: heightScore, evalState: evalState,
    negamax: negamax, searchRoot: searchRoot, bestMove: bestMove, weakMove: weakMove,
    emptySeats: emptySeats, LEVELS: LEVELS, levelDepth: levelDepth, chooseMove: chooseMove,
  };
})(typeof window !== 'undefined' ? window : this);
