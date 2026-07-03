/* Focus (a.k.a. Domination) — Sid Sackson, 1963.
 * Pure rules + AI engine. No DOM. Exposes window.FocusEngine.
 *
 * Board: 8x8 checkerboard with three squares removed from each corner,
 * forming a 6x6 centre with 1x4 arms on each side = 52 cells.
 *
 * State shape (plain JSON, never mutated by the engine):
 *   {
 *     board: number[8][8] of stacks. board[r][c] is:
 *            null  -> not a playable cell (removed corner / outside)
 *            []    -> empty playable cell
 *            ['p1','p2',...] -> stack, index 0 = BOTTOM, last = TOP
 *     reserves: { p1, p2 },   // own pieces reclaimed, re-enterable
 *     captured: { p1, p2 },   // own pieces lost for good (taken by opponent)
 *     turn: 'p1' | 'p2',
 *     winner: null | 'p1' | 'p2',
 *   }
 *
 * Move shape:
 *   { kind:'move', from:[r,c], count:k, dir:[dr,dc] }   // lift top k, travel k cells
 *   { kind:'reserve', to:[r,c] }                        // drop one reserve
 */
(function (global) {
  'use strict';

  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // N S W E
  var MAX = 5; // a stack is capped at five tall

  // ---- topology -----------------------------------------------------------
  function exists(r, c) {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    if (r === 0 || r === 7) return c >= 2 && c <= 5; // top / bottom arm (4 wide)
    if (r === 1 || r === 6) return c >= 1 && c <= 6; // 6-wide rows
    return true;                                     // rows 2..5 span 0..7
  }
  var CELLS = (function () {
    var a = [];
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (exists(r, c)) a.push([r, c]);
    return a;
  })();
  function isCentre(r, c) { return r >= 1 && r <= 6 && c >= 1 && c <= 6; }

  // ---- helpers ------------------------------------------------------------
  function emptyBoard() {
    var b = [];
    for (var r = 0; r < 8; r++) {
      var row = [];
      for (var c = 0; c < 8; c++) row.push(exists(r, c) ? [] : null);
      b.push(row);
    }
    return b;
  }
  function cloneState(s) {
    var b = [];
    for (var r = 0; r < 8; r++) {
      var row = [];
      for (var c = 0; c < 8; c++) row.push(s.board[r][c] == null ? null : s.board[r][c].slice());
      b.push(row);
    }
    return {
      board: b,
      reserves: Object.assign({}, s.reserves),
      captured: Object.assign({}, s.captured),
      players: (s.players || ['p1','p2']).slice(),
      turn: s.turn, winner: s.winner,
    };
  }
  function other(p) { return p === 'p1' ? 'p2' : 'p1'; }
  function topOwner(stack) { return stack && stack.length ? stack[stack.length - 1] : null; }

  // ---- opening setups -----------------------------------------------------
  // All fill the central 6x6 (rows 1..6, cols 1..6) with single pieces,
  // arms empty. Each yields exactly 18 + 18.
  var SETUPS = {
    checker: {
      name: 'Checkerboard',
      blurb: 'The standard opening — alternating single pieces fill the centre.',
      fill: function (r, c) { return ((r + c) % 2 === 0) ? 'p1' : 'p2'; },
    },
    stripes: {
      name: 'Ranks',
      blurb: 'Each rank is a single colour — interlocking from the first move.',
      fill: function (r, c) { return (r % 2 === 0) ? 'p1' : 'p2'; },
    },
    pinwheel: {
      name: 'Pinwheel',
      blurb: 'A rotationally-symmetric quadrant pattern for a sharper opening.',
      fill: function (r, c) {
        // 2x2 blocks coloured by block parity, rotated per quadrant for a pinwheel
        var br = (r - 1) >> 1, bc = (c - 1) >> 1; // 0..2 block index within 6x6
        return ((br + bc) % 2 === 0) ? 'p1' : 'p2';
      },
    },
  };

  function newGame(setupKey, np) {
    np = np === 4 ? 4 : 2;
    var b = emptyBoard();
    if (np === 4) {
      // four colours fill all 52 cells in a 2x2 pinwheel — exactly 13 each
      for (var i = 0; i < CELLS.length; i++) {
        var r = CELLS[i][0], c = CELLS[i][1], a = r % 2, d = c % 2;
        b[r][c] = [ a === 0 ? (d === 0 ? 'p1' : 'p2') : (d === 1 ? 'p3' : 'p4') ];
      }
      return {
        board: b,
        reserves: { p1: 0, p2: 0, p3: 0, p4: 0 },
        captured: { p1: 0, p2: 0, p3: 0, p4: 0 },
        players: ['p1', 'p2', 'p3', 'p4'], turn: 'p1', winner: null,
      };
    }
    var setup = SETUPS[setupKey] || SETUPS.checker;
    for (var r2 = 1; r2 <= 6; r2++) for (var c2 = 1; c2 <= 6; c2++) b[r2][c2] = [setup.fill(r2, c2)];
    var s = {
      board: b,
      reserves: { p1: 0, p2: 0, p3: 0, p4: 0 },
      captured: { p1: 0, p2: 0, p3: 0, p4: 0 },
      players: ['p1', 'p2'], turn: 'p1', winner: null,
    };
    // guarantee an exact 18/18 split regardless of pattern quirks
    rebalance(s);
    return s;
  }
  function countOnBoard(s, p) {
    var n = 0;
    for (var i = 0; i < CELLS.length; i++) {
      var st = s.board[CELLS[i][0]][CELLS[i][1]];
      for (var j = 0; j < st.length; j++) if (st[j] === p) n++;
    }
    return n;
  }
  function rebalance(s) {
    // Each side should own 18 single pieces at start. If a pattern is off,
    // flip centre cells (closest to middle first) until balanced.
    var order = [];
    for (var r = 1; r <= 6; r++) for (var c = 1; c <= 6; c++) {
      order.push([r, c, Math.abs(r - 3.5) + Math.abs(c - 3.5)]);
    }
    order.sort(function (a, b) { return a[2] - b[2]; });
    var guard = 0;
    while (countOnBoard(s, 'p1') !== 18 && guard < 40) {
      var need = countOnBoard(s, 'p1') > 18 ? 'p1' : 'p2';
      for (var i = 0; i < order.length; i++) {
        var rr = order[i][0], cc = order[i][1], st = s.board[rr][cc];
        if (st.length === 1 && st[0] === need) { st[0] = other(need); break; }
      }
      guard++;
    }
  }

  // ---- move generation ----------------------------------------------------
  // A stack whose TOP belongs to p may lift its top k pieces (1..height) and
  // travel exactly k cells in one orthogonal direction, jumping over anything
  // in between. Every cell along the path (and the target) must be on the board.
  function legalMoves(s, p, opts) {
    opts = opts || {};
    var moves = [];
    for (var i = 0; i < CELLS.length; i++) {
      var r = CELLS[i][0], c = CELLS[i][1], st = s.board[r][c];
      if (!st.length || topOwner(st) !== p) continue;
      var h = st.length;
      for (var k = 1; k <= h; k++) {
        for (var d = 0; d < 4; d++) {
          var dr = DIRS[d][0], dc = DIRS[d][1], ok = true, tr = r, tc = c;
          for (var step = 1; step <= k; step++) {
            tr = r + dr * step; tc = c + dc * step;
            if (!exists(tr, tc)) { ok = false; break; }
          }
          if (ok) moves.push({ kind: 'move', from: [r, c], count: k, dir: [dr, dc], to: [tr, tc] });
        }
      }
    }
    if (s.reserves[p] > 0) {
      if (opts.allReserves) {
        for (var j = 0; j < CELLS.length; j++) moves.push({ kind: 'reserve', to: [CELLS[j][0], CELLS[j][1]] });
      } else {
        // pruned set for search: drops on occupied cells (flip/build) + empty
        // cells next to an occupied cell. Keeps branching sane.
        for (var j2 = 0; j2 < CELLS.length; j2++) {
          var rr = CELLS[j2][0], cc = CELLS[j2][1], cell = s.board[rr][cc], useful = cell.length > 0;
          if (!useful) {
            for (var d2 = 0; d2 < 4; d2++) {
              var ar = rr + DIRS[d2][0], ac = cc + DIRS[d2][1];
              if (exists(ar, ac) && s.board[ar][ac].length) { useful = true; break; }
            }
          }
          if (useful) moves.push({ kind: 'reserve', to: [rr, cc] });
        }
      }
    }
    return moves;
  }

  function hasAnyMove(s, p) {
    if (s.reserves[p] > 0) return true;
    for (var i = 0; i < CELLS.length; i++) {
      var r = CELLS[i][0], c = CELLS[i][1], st = s.board[r][c];
      if (!st.length || topOwner(st) !== p) continue;
      var h = st.length;
      for (var k = 1; k <= h; k++) for (var d = 0; d < 4; d++) {
        var tr = r + DIRS[d][0] * k, tc = c + DIRS[d][1] * k;
        var ok = true;
        for (var step = 1; step <= k; step++) {
          if (!exists(r + DIRS[d][0] * step, c + DIRS[d][1] * step)) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
    return false;
  }

  // ---- applying a move ----------------------------------------------------
  // Returns { state, result } where result describes overflow for animation/log.
  function applyMove(s, mv) {
    var ns = cloneState(s), p = ns.turn, gained = [], lost = [];
    if (mv.kind === 'reserve') {
      ns.reserves[p]--;
      land(ns, mv.to[0], mv.to[1], [p], p, gained, lost);
    } else {
      var r = mv.from[0], c = mv.from[1], st = ns.board[r][c];
      var moved = st.slice(st.length - mv.count); // top k, bottom..top preserved
      ns.board[r][c] = st.slice(0, st.length - mv.count);
      land(ns, mv.to[0], mv.to[1], moved, p, gained, lost);
    }
    // advance to the next player who can still act; last one standing wins
    var players = ns.players || ['p1', 'p2'];
    var aliveList = [];
    for (var ai = 0; ai < players.length; ai++) if (isAlive(ns, players[ai])) aliveList.push(players[ai]);
    if (aliveList.length <= 1) {
      ns.winner = aliveList.length ? aliveList[0] : p;
    } else {
      var idx = players.indexOf(p);
      for (var k = 1; k <= players.length; k++) {
        var q = players[(idx + k) % players.length];
        if (isAlive(ns, q)) { ns.turn = q; break; }
      }
    }
    return { state: ns, gained: gained, lost: lost, mover: p };
  }
  // place `incoming` (bottom..top) on top of cell, resolve >5 overflow from bottom
  function land(ns, r, c, incoming, mover, gained, lost) {
    var merged = ns.board[r][c].concat(incoming);
    if (merged.length > MAX) {
      var overflow = merged.length - MAX;
      var removed = merged.slice(0, overflow);
      merged = merged.slice(overflow);
      for (var i = 0; i < removed.length; i++) {
        if (removed[i] === mover) { ns.reserves[mover]++; gained.push(removed[i]); }
        else { ns.captured[removed[i]]++; lost.push(removed[i]); }
      }
    }
    ns.board[r][c] = merged;
  }

  // ---- evaluation ---------------------------------------------------------
  function isAlive(s, p) { return controlled(s, p) > 0 || s.reserves[p] > 0; }
  function controlled(s, p) {
    var n = 0;
    for (var i = 0; i < CELLS.length; i++) {
      var st = s.board[CELLS[i][0]][CELLS[i][1]];
      if (st.length && topOwner(st) === p) n++;
    }
    return n;
  }
  function evaluate(s, p) {
    var o = other(p);
    if (s.winner === p) return 1e6;
    if (s.winner === o) return -1e6;
    var myCtrl = controlled(s, p), opCtrl = controlled(s, o);
    var myMob = legalMoves(s, p).length, opMob = legalMoves(s, o).length;
    return 100 * (myCtrl - opCtrl)
         + 70 * (s.reserves[p] - s.reserves[o])
         + 55 * (s.captured[o] - s.captured[p])
         + 6 * (myMob - opMob);
  }

  // cheap priority for move ordering / pruning
  function moveScore(s, mv, p) {
    var o = other(p), sc = 0;
    var tr = mv.to[0], tc = mv.to[1], dest = s.board[tr][tc];
    var incoming = mv.kind === 'reserve' ? 1 : mv.count;
    var total = dest.length + incoming;
    if (total > MAX) {
      var removed = dest.concat(new Array(incoming).fill(p)).slice(0, total - MAX);
      for (var i = 0; i < removed.length; i++) sc += (removed[i] === o ? 30 : -6);
    }
    if (dest.length && topOwner(dest) === o) sc += 14;  // wresting control
    if (isCentre(tr, tc)) sc += 3;
    if (mv.kind === 'reserve') sc -= 2;                 // spend reserves with care
    return sc;
  }

  // ---- search -------------------------------------------------------------
  function orderedMoves(s, p, cap) {
    var mv = legalMoves(s, p);
    mv.sort(function (a, b) { return moveScore(s, b, p) - moveScore(s, a, p); });
    if (cap && mv.length > cap) mv = mv.slice(0, cap);
    return mv;
  }
  function negamax(s, p, depth, alpha, beta, cap) {
    if (s.winner || depth === 0) return evaluate(s, p);
    var moves = orderedMoves(s, p, cap), best = -Infinity;
    if (!moves.length) return evaluate(s, p);
    for (var i = 0; i < moves.length; i++) {
      var child = applyMove(s, moves[i]).state;
      var v = -negamax(child, other(p), depth - 1, -beta, -alpha, cap);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  var LEVELS = {
    novice: { depth: 0, cap: 0, noise: 80, label: 'Novice' },
    club:   { depth: 1, cap: 0, noise: 22, label: 'Club' },
    strong: { depth: 2, cap: 18, noise: 6, label: 'Strong' },
    expert: { depth: 4, cap: 12, noise: 0, label: 'Expert' },
  };

  function evalPlayer(s, p) {
    if (s.winner) return s.winner === p ? 1e6 : -1e6;
    return 100 * controlled(s, p) + 70 * s.reserves[p] - 40 * s.captured[p] + 6 * legalMoves(s, p).length;
  }
  function evalVec(s) {
    var o = {}, players = s.players || ['p1', 'p2'];
    for (var i = 0; i < players.length; i++) o[players[i]] = evalPlayer(s, players[i]);
    return o;
  }
  // max-n search for >2 players (each mover maximises its OWN score — not zero-sum)
  function maxN(s, depth, cap) {
    if (s.winner || depth === 0) return evalVec(s);
    var p = s.turn, moves = orderedMoves(s, p, cap);
    if (!moves.length) return evalVec(s);
    var best = null;
    for (var i = 0; i < moves.length; i++) {
      var vec = maxN(applyMove(s, moves[i]).state, depth - 1, cap);
      if (!best || vec[p] > best[p]) best = vec;
    }
    return best || evalVec(s);
  }
  function chooseMove(s, level, rng) {
    rng = rng || Math.random;
    var L = LEVELS[level] || LEVELS.club, p = s.turn;
    var moves = legalMoves(s, p);
    if (!moves.length) return null;
    // free-for-all (3-4 players): max-n, depth by difficulty
    if ((s.players || ['p1','p2']).length > 2) {
      var dM = ({ novice: 1, club: 1, strong: 2, expert: 3 })[level] || 1;
      var cM = ({ novice: 0, club: 0, strong: 12, expert: 10 })[level] || 0;
      var orderedM = orderedMoves(s, p, cM); if (!orderedM.length) orderedM = moves;
      var bestM = null, bestMV = -Infinity;
      for (var mi = 0; mi < orderedM.length; mi++) {
        var vec = maxN(applyMove(s, orderedM[mi]).state, dM - 1, cM);
        var vv = vec[p] + (rng() - 0.5) * L.noise;
        if (vv > bestMV) { bestMV = vv; bestM = orderedM[mi]; }
      }
      return bestM || orderedM[0];
    }
    // depth 0 (Novice): light greedy with heavy noise
    if (L.depth === 0) {
      var scored0 = moves.map(function (m) {
        var ev = evaluate(applyMove(s, m).state, p);
        return { m: m, v: ev + (rng() - 0.5) * L.noise * 8 };
      });
      scored0.sort(function (a, b) { return b.v - a.v; });
      return scored0[0].m;
    }
    var ordered = orderedMoves(s, p, L.cap || 0);
    if (!ordered.length) ordered = moves;
    var best = null, bestV = -Infinity, alpha = -Infinity;
    for (var i = 0; i < ordered.length; i++) {
      var child = applyMove(s, ordered[i]).state;
      var v = -negamax(child, other(p), L.depth - 1, -Infinity, -alpha, L.cap || 0);
      v += (rng() - 0.5) * L.noise;
      if (v > bestV) { bestV = v; best = ordered[i]; alpha = Math.max(alpha, v); }
    }
    return best || ordered[0];
  }

  // ---- export -------------------------------------------------------------
  global.FocusEngine = {
    DIRS: DIRS, MAX: MAX, CELLS: CELLS, SETUPS: SETUPS, LEVELS: LEVELS,
    exists: exists, isCentre: isCentre, other: other, topOwner: topOwner,
    newGame: newGame, cloneState: cloneState,
    legalMoves: legalMoves, hasAnyMove: hasAnyMove, applyMove: applyMove,
    controlled: controlled, evaluate: evaluate, chooseMove: chooseMove,
    countOnBoard: countOnBoard,
  };
})(typeof window !== 'undefined' ? window : this);
