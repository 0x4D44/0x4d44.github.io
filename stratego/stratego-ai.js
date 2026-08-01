(function (root, factory) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./stratego-core.js') : root.StrategoCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StrategoAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  if (!Core) throw new Error('StrategoCore is required');

  const VALUES = {
    flag: 5000, bomb: 95, spy: 75, scout: 34, miner: 92, sergeant: 54,
    lieutenant: 64, captain: 78, major: 98, colonel: 125, general: 155, marshal: 190,
  };

  function canonicalEdge(a, b) {
    const x = `${a.row},${a.col}`;
    const y = `${b.row},${b.col}`;
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  }

  function publicLegalMoves(view, color = view.current) {
    if (!view || view.phase !== 'play') return [];
    const moves = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const tracker = view.oscillation && view.oscillation[color];
    const repetitionLimit = Math.max(1, Number(view.options && view.options.repetitionLimit) || 3);

    const at = (row, col) => {
      if (row < 0 || row > 9 || col < 0 || col > 9) return null;
      const id = view.board[row * 10 + col];
      return id ? view.pieces[id] : null;
    };

    for (const piece of Object.values(view.pieces)) {
      if (!piece.alive || piece.color !== color || piece.row == null || !piece.type) continue;
      const rank = Core.RANKS[piece.type];
      if (!rank || !rank.mobile) continue;
      const maxDistance = piece.type === 'scout' ? 9 : 1;
      for (const [dr, dc] of directions) {
        for (let distance = 1; distance <= maxDistance; distance += 1) {
          const row = piece.row + dr * distance;
          const col = piece.col + dc * distance;
          if (row < 0 || row > 9 || col < 0 || col > 9 || Core.isLake(row, col)) break;
          const target = at(row, col);
          if (target && target.color === color) break;
          const from = { row: piece.row, col: piece.col };
          const to = { row, col };
          const edge = canonicalEdge(from, to);
          const blockedByRepeat = tracker && tracker.pieceId === piece.id && tracker.edge === edge && tracker.count >= repetitionLimit;
          if (!blockedByRepeat) {
            moves.push({
              pieceId: piece.id,
              from,
              to,
              attack: !!target,
              targetId: target ? target.id : null,
              distance,
            });
          }
          if (target || piece.type !== 'scout') break;
        }
      }
    }
    return moves;
  }

  function remainingTypeBag(view, enemyColor) {
    const bag = {};
    for (const type of Core.TYPE_ORDER) bag[type] = Core.RANKS[type].count;
    for (const type of (view.captured && view.captured[enemyColor]) || []) {
      if (bag[type] > 0) bag[type] -= 1;
    }
    for (const piece of Object.values(view.pieces)) {
      if (piece.color === enemyColor && piece.alive && piece.type && bag[piece.type] > 0) bag[piece.type] -= 1;
    }
    return bag;
  }

  function candidatesForHidden(piece, bag) {
    const result = [];
    for (const type of Core.TYPE_ORDER) {
      if (!bag[type]) continue;
      if (piece.moved && (type === 'bomb' || type === 'flag')) continue;
      for (let i = 0; i < bag[type]; i += 1) result.push(type);
    }
    return result.length ? result : Core.TYPE_ORDER.filter(type => piece.moved ? !['bomb', 'flag'].includes(type) : true);
  }

  function combatOutcome(attackerType, defenderType, aggressorWins) {
    if (defenderType === 'flag') return 1;
    if (defenderType === 'bomb') return attackerType === 'miner' ? 1 : -1;
    if (attackerType === 'spy' && defenderType === 'marshal') return 1;
    const a = Core.RANKS[attackerType].strength;
    const d = Core.RANKS[defenderType].strength;
    if (a > d || (a === d && aggressorWins)) return 1;
    if (a < d) return -1;
    return 0;
  }

  function enemyBackDepth(color, row) {
    return color === 'blue' ? row : 9 - row;
  }

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function publicSignature(view, color) {
    const board = [];
    const ids = Object.keys(view.pieces).sort();
    for (const id of ids) {
      const piece = view.pieces[id];
      if (!piece.alive || piece.row == null) continue;
      const side = piece.color === 'red' ? 'r' : 'b';
      const type = piece.type || '?';
      board.push(`${side}:${type}:${piece.moved ? 1 : 0}@${piece.row}${piece.col}`);
    }
    const tracker = view.oscillation && view.oscillation[color];
    return `${view.current}|${view.moveNumber}|${tracker ? `${tracker.pieceId}:${tracker.edge}:${tracker.count}` : '-'}|${board.join(',')}`;
  }

  function neighbourOwnCount(view, color, row, col) {
    let count = 0;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const rr = row + dr;
      const cc = col + dc;
      if (rr < 0 || rr > 9 || cc < 0 || cc > 9) continue;
      const id = view.board[rr * 10 + cc];
      if (id && view.pieces[id].color === color) count += 1;
    }
    return count;
  }

  function nearestUnknownDistance(view, color, row, col) {
    let best = 20;
    for (const piece of Object.values(view.pieces)) {
      if (!piece.alive || piece.color === color || piece.row == null || piece.type) continue;
      best = Math.min(best, Math.abs(row - piece.row) + Math.abs(col - piece.col));
    }
    return best;
  }

  function scoreMove(view, color, move, difficulty, bag) {
    const piece = view.pieces[move.pieceId];
    const target = move.targetId ? view.pieces[move.targetId] : null;
    const progress = enemyBackDepth(color, move.to.row) - enemyBackDepth(color, move.from.row);
    let score = progress * (difficulty === 'marshal' ? 5.2 : 4.1);

    // Keep a little shape in the line rather than scattering every piece.
    score += neighbourOwnCount(view, color, move.to.row, move.to.col) * 1.2;
    score -= neighbourOwnCount(view, color, move.from.row, move.from.col) * 0.3;

    // Scouts are valuable reconnaissance assets; long moves are useful but revealing.
    if (piece.type === 'scout') {
      score += Math.min(move.distance, 4) * 1.4;
      if (move.distance > 1) score -= difficulty === 'cadet' ? 1 : 4;
    }
    if (piece.type === 'miner') score += progress > 0 ? 2.5 : 0;
    if (piece.type === 'spy' && enemyBackDepth(color, move.to.row) < 4) score -= 5;
    if (['marshal', 'general'].includes(piece.type) && !target && enemyBackDepth(color, move.to.row) > 6) score -= 4;

    const unknownDistance = nearestUnknownDistance(view, color, move.to.row, move.to.col);
    if (unknownDistance < 20) score += (5 - Math.min(5, unknownDistance)) * (piece.type === 'scout' ? 1.7 : 0.5);

    if (target) {
      const candidates = target.type ? [target.type] : candidatesForHidden(target, bag);
      let expected = 0;
      for (const defenderType of candidates) {
        const outcome = combatOutcome(piece.type, defenderType, !!view.options.aggressorWins);
        if (outcome > 0) expected += VALUES[defenderType] + VALUES[piece.type] * 0.12;
        else if (outcome < 0) expected -= VALUES[piece.type] + VALUES[defenderType] * 0.08;
        else expected += view.options.aggressorWins ? VALUES[defenderType] * 0.7 : (VALUES[defenderType] - VALUES[piece.type]) * 0.35;
      }
      expected /= Math.max(1, candidates.length);
      score += expected;
      if (!target.type) score += difficulty === 'cadet' ? 7 : difficulty === 'colonel' ? 3 : 0;
      if (target.type === 'flag') score += 100000;
      if (target.type === 'bomb' && piece.type === 'miner') score += 45;
    }

    // A known enemy flag exerts a strong, public objective pull.
    const flag = Object.values(view.pieces).find(p => p.alive && p.color !== color && p.type === 'flag');
    if (flag) {
      const before = Math.abs(move.from.row - flag.row) + Math.abs(move.from.col - flag.col);
      const after = Math.abs(move.to.row - flag.row) + Math.abs(move.to.col - flag.col);
      score += (before - after) * 18;
    }

    return score;
  }

  function chooseMove(stateOrView, color, difficulty = 'colonel') {
    const view = stateOrView.viewer
      ? stateOrView
      : Core.publicSnapshot(stateOrView, color || stateOrView.current);
    color = color || view.current;
    difficulty = ['cadet', 'colonel', 'marshal'].includes(difficulty) ? difficulty : 'colonel';
    const moves = publicLegalMoves(view, color);
    if (!moves.length) return null;
    const bag = remainingTypeBag(view, Core.OPPOSITE[color]);
    const signature = publicSignature(view, color);
    const jitterScale = difficulty === 'cadet' ? 26 : difficulty === 'colonel' ? 7 : 1.5;

    const scored = moves.map(move => {
      const key = `${signature}|${move.pieceId}|${move.to.row},${move.to.col}|${difficulty}`;
      const jitter = ((fnv1a(key) / 0xffffffff) - 0.5) * jitterScale;
      return { move, score: scoreMove(view, color, move, difficulty, bag) + jitter };
    });
    scored.sort((a, b) => b.score - a.score || a.move.pieceId.localeCompare(b.move.pieceId) || a.move.to.row - b.move.to.row || a.move.to.col - b.move.to.col);

    let selected = scored[0];
    if (difficulty === 'cadet' && scored.length > 2) {
      const pick = fnv1a(`${signature}|cadet`) % Math.min(4, scored.length);
      selected = scored[pick];
    } else if (difficulty === 'colonel' && scored.length > 1 && scored[1].score > scored[0].score - 3) {
      selected = (fnv1a(`${signature}|colonel`) & 1) ? scored[0] : scored[1];
    }
    return {
      move: selected.move,
      score: selected.score,
      note: selected.move.attack ? 'Contact is worth the risk.' : 'Advance while preserving the line.',
    };
  }

  return Object.freeze({
    publicLegalMoves,
    remainingTypeBag,
    candidatesForHidden,
    combatOutcome,
    enemyBackDepth,
    publicSignature,
    scoreMove,
    chooseMove,
  });
});
