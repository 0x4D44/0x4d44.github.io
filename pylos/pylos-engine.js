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
    if (move.dst.l === 3) { ns.winner = p; return ns; }            // crowned the apex
    if (move.take && move.take.length) {
      move.take.forEach(function (t) { ns.levels[t.l][t.r][t.c] = null; ns.reserves[p] += 1; });
    }
    var next = other(p);
    ns.turn = next;
    if (!hasAnyMove(ns.levels, next, ns.reserves[next])) ns.winner = p;  // opponent stuck -> mover wins
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
  };
})(typeof window !== 'undefined' ? window : this);
