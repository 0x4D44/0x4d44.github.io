(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StrategoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const BOARD_SIZE = 10;
  const COLORS = ['red', 'blue'];
  const OPPOSITE = { red: 'blue', blue: 'red' };
  const LAKES = new Set([
    '4,2', '4,3', '5,2', '5,3',
    '4,6', '4,7', '5,6', '5,7',
  ]);

  const RANKS = Object.freeze({
    flag:       { type: 'flag',       name: 'Flag',       short: 'F', strength: 0,  count: 1, mobile: false },
    spy:        { type: 'spy',        name: 'Spy',        short: 'S', strength: 1,  count: 1, mobile: true  },
    scout:      { type: 'scout',      name: 'Scout',      short: '2', strength: 2,  count: 8, mobile: true  },
    miner:      { type: 'miner',      name: 'Miner',      short: '3', strength: 3,  count: 5, mobile: true  },
    sergeant:   { type: 'sergeant',   name: 'Sergeant',   short: '4', strength: 4,  count: 4, mobile: true  },
    lieutenant: { type: 'lieutenant', name: 'Lieutenant', short: '5', strength: 5,  count: 4, mobile: true  },
    captain:    { type: 'captain',    name: 'Captain',    short: '6', strength: 6,  count: 4, mobile: true  },
    major:      { type: 'major',      name: 'Major',      short: '7', strength: 7,  count: 3, mobile: true  },
    colonel:    { type: 'colonel',    name: 'Colonel',    short: '8', strength: 8,  count: 2, mobile: true  },
    general:    { type: 'general',    name: 'General',    short: '9', strength: 9,  count: 1, mobile: true  },
    marshal:    { type: 'marshal',    name: 'Marshal',    short: '10', strength: 10, count: 1, mobile: true  },
    bomb:       { type: 'bomb',       name: 'Bomb',       short: 'B', strength: 11, count: 6, mobile: false },
  });

  const TYPE_ORDER = ['marshal', 'general', 'colonel', 'major', 'captain', 'lieutenant', 'sergeant', 'miner', 'scout', 'spy', 'bomb', 'flag'];
  const MANIFEST = TYPE_ORDER.flatMap(type => Array(RANKS[type].count).fill(type));

  const FORMATIONS = Object.freeze({
    fortress: Object.freeze([
      'bomb','flag','bomb','major','bomb','general','bomb','colonel','bomb','bomb',
      'marshal','spy','miner','miner','captain','captain','miner','major','colonel','major',
      'miner','miner','captain','captain','lieutenant','lieutenant','lieutenant','lieutenant','sergeant','sergeant',
      'scout','scout','scout','scout','scout','scout','scout','scout','sergeant','sergeant',
    ]),
    spearhead: Object.freeze([
      'bomb','flag','bomb','scout','bomb','bomb','scout','bomb','sergeant','bomb',
      'general','marshal','colonel','colonel','major','major','major','spy','miner','miner',
      'captain','captain','captain','captain','lieutenant','lieutenant','lieutenant','lieutenant','miner','miner',
      'scout','scout','scout','scout','scout','scout','miner','sergeant','sergeant','sergeant',
    ]),
    feint: Object.freeze([
      'bomb','scout','bomb','flag','bomb','bomb','scout','bomb','spy','bomb',
      'marshal','general','colonel','major','sergeant','miner','major','colonel','captain','major',
      'lieutenant','lieutenant','lieutenant','lieutenant','captain','captain','captain','miner','miner','miner',
      'scout','scout','scout','scout','scout','scout','miner','sergeant','sergeant','sergeant',
    ]),
  });

  function countTypes(list) {
    const out = {};
    for (const type of list) out[type] = (out[type] || 0) + 1;
    return out;
  }

  function assertFormation(name, list) {
    if (!Array.isArray(list) || list.length !== 40) throw new Error(`Formation ${name} must contain 40 pieces`);
    const counts = countTypes(list);
    for (const type of TYPE_ORDER) {
      if ((counts[type] || 0) !== RANKS[type].count) {
        throw new Error(`Formation ${name} has ${counts[type] || 0} ${type}, expected ${RANKS[type].count}`);
      }
    }
  }
  for (const [name, list] of Object.entries(FORMATIONS)) assertFormation(name, list);

  function normaliseSeed(seed) {
    const n = Number(seed);
    if (!Number.isFinite(n)) return 0x4d44;
    return (Math.trunc(n) >>> 0) || 0x4d44;
  }

  function makeRng(seed) {
    let value = normaliseSeed(seed);
    return function random() {
      value |= 0;
      value = (value + 0x6D2B79F5) | 0;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, rng) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function cellKey(row, col) { return `${row},${col}`; }
  function boardIndex(row, col) { return row * BOARD_SIZE + col; }
  function inBounds(row, col) { return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }
  function isLake(row, col) { return LAKES.has(cellKey(row, col)); }
  function coordEqual(a, b) { return !!a && !!b && a.row === b.row && a.col === b.col; }
  function canonicalEdge(a, b) {
    const x = `${a.row},${a.col}`;
    const y = `${b.row},${b.col}`;
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  }

  function createPieces(seed) {
    const rng = makeRng(seed ^ 0x9e3779b9);
    const pieces = {};
    for (const color of COLORS) {
      const types = shuffle(MANIFEST, rng);
      const labels = shuffle(Array.from({ length: 40 }, (_, i) => i), rng);
      for (let i = 0; i < 40; i += 1) {
        const id = `${color === 'red' ? 'r' : 'b'}${labels[i].toString(36).padStart(2, '0')}`;
        pieces[id] = {
          id,
          color,
          type: types[i],
          row: null,
          col: null,
          alive: true,
          revealed: false,
          moved: false,
        };
      }
    }
    return pieces;
  }

  function createState(options = {}) {
    const seed = normaliseSeed(options.seed == null ? Date.now() : options.seed);
    const state = {
      version: VERSION,
      seed,
      mode: options.mode === 'hotseat' ? 'hotseat' : 'solo',
      difficulty: ['cadet', 'colonel', 'marshal'].includes(options.difficulty) ? options.difficulty : 'colonel',
      options: {
        aggressorWins: !!(options.options && options.options.aggressorWins),
        threefoldDraw: options.options && options.options.threefoldDraw === false ? false : true,
        repetitionLimit: Math.max(1, Number(options.options && options.options.repetitionLimit) || 3),
      },
      phase: 'setup',
      setupSide: 'red',
      current: 'red',
      deployed: { red: false, blue: false },
      pieces: createPieces(seed),
      board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
      captured: { red: [], blue: [] },
      history: [],
      moveNumber: 0,
      oscillation: { red: null, blue: null },
      positionCounts: {},
      winner: null,
      reason: null,
      lastCombat: null,
    };
    assertValidState(state);
    return state;
  }

  function homeRows(color) {
    return color === 'red' ? [9, 8, 7, 6] : [0, 1, 2, 3];
  }

  function homeCells(color) {
    return homeRows(color).flatMap(row => Array.from({ length: 10 }, (_, col) => ({ row, col })));
  }

  function formationList(name, seed) {
    if (name === 'random') return shuffle(MANIFEST, makeRng(seed ^ 0x85ebca6b));
    const preset = FORMATIONS[name] || FORMATIONS.fortress;
    return preset.slice();
  }

  function deployFormation(state, color, name = 'fortress', seed = state.seed) {
    if (!COLORS.includes(color)) throw new Error('Unknown colour');
    if (state.phase !== 'setup') throw new Error('Deployment is closed');
    const next = cloneState(state);
    for (const piece of Object.values(next.pieces)) {
      if (piece.color !== color) continue;
      if (piece.row != null) next.board[boardIndex(piece.row, piece.col)] = null;
      piece.row = null;
      piece.col = null;
      piece.alive = true;
      piece.revealed = false;
      piece.moved = false;
    }

    const types = formationList(name, normaliseSeed(seed));
    assertFormation(name === 'random' ? 'random' : name, types);
    const byType = {};
    for (const piece of Object.values(next.pieces)) {
      if (piece.color !== color) continue;
      (byType[piece.type] ||= []).push(piece);
    }
    const rng = makeRng(normaliseSeed(seed) ^ (color === 'red' ? 0xa11ce : 0xb1e));
    for (const list of Object.values(byType)) {
      const shuffled = shuffle(list, rng);
      list.splice(0, list.length, ...shuffled);
    }

    const cells = homeCells(color);
    for (let i = 0; i < cells.length; i += 1) {
      const type = types[i];
      const piece = byType[type].pop();
      const { row, col } = cells[i];
      piece.row = row;
      piece.col = col;
      next.board[boardIndex(row, col)] = piece.id;
    }
    next.deployed[color] = true;
    next.setupSide = color;
    assertValidState(next);
    return next;
  }

  function swapSetupPieces(state, color, firstId, secondId) {
    if (state.phase !== 'setup') throw new Error('Deployment is closed');
    const next = cloneState(state);
    const a = next.pieces[firstId];
    const b = next.pieces[secondId];
    if (!a || !b || a.color !== color || b.color !== color || a.row == null || b.row == null) {
      throw new Error('Setup swap requires two deployed pieces from the same army');
    }
    const aIndex = boardIndex(a.row, a.col);
    const bIndex = boardIndex(b.row, b.col);
    [a.row, b.row] = [b.row, a.row];
    [a.col, b.col] = [b.col, a.col];
    next.board[aIndex] = b.id;
    next.board[bIndex] = a.id;
    assertValidState(next);
    return next;
  }

  function positionKey(state) {
    const board = state.board.map((id, index) => {
      if (!id) return isLake(Math.floor(index / 10), index % 10) ? 'L' : '-';
      const p = state.pieces[id];
      return `${id}:${p.revealed ? p.type : '?'}:${p.moved ? 1 : 0}`;
    }).join(',');
    const osc = COLORS.map(color => {
      const o = state.oscillation[color];
      return o ? `${color}:${o.pieceId}:${o.edge}:${o.count}` : `${color}:-`;
    }).join(';');
    return `${state.current}|${board}|${osc}`;
  }

  function beginGame(state) {
    if (state.phase !== 'setup') throw new Error('Game has already begun');
    if (!state.deployed.red || !state.deployed.blue) throw new Error('Both armies must deploy first');
    const next = cloneState(state);
    next.phase = 'play';
    next.current = 'red';
    next.setupSide = null;
    next.moveNumber = 0;
    next.positionCounts = {};
    next.positionCounts[positionKey(next)] = 1;
    assertValidState(next);
    return next;
  }

  function pieceAt(state, row, col) {
    if (!inBounds(row, col)) return null;
    const id = state.board[boardIndex(row, col)];
    return id ? state.pieces[id] : null;
  }

  function wouldBreakRepetition(state, piece, from, to) {
    const tracker = state.oscillation[piece.color];
    if (!tracker || tracker.pieceId !== piece.id) return false;
    if (tracker.edge !== canonicalEdge(from, to)) return false;
    return tracker.count >= state.options.repetitionLimit;
  }

  function legalMovesForPiece(state, pieceId, options = {}) {
    if (state.phase !== 'play') return [];
    const piece = state.pieces[pieceId];
    if (!piece || !piece.alive || piece.row == null || !RANKS[piece.type].mobile) return [];
    const color = options.color || state.current;
    if (!options.ignoreTurn && piece.color !== state.current) return [];
    if (piece.color !== color) return [];

    const moves = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const maxDistance = piece.type === 'scout' ? BOARD_SIZE - 1 : 1;
    for (const [dr, dc] of directions) {
      for (let distance = 1; distance <= maxDistance; distance += 1) {
        const row = piece.row + dr * distance;
        const col = piece.col + dc * distance;
        if (!inBounds(row, col) || isLake(row, col)) break;
        const target = pieceAt(state, row, col);
        if (target && target.color === piece.color) break;
        const from = { row: piece.row, col: piece.col };
        const to = { row, col };
        if (!wouldBreakRepetition(state, piece, from, to)) {
          moves.push({
            pieceId: piece.id,
            from,
            to,
            attack: !!target,
            targetId: target ? target.id : null,
            distance,
          });
        }
        if (target) break;
        if (piece.type !== 'scout') break;
      }
    }
    return moves;
  }

  function allLegalMoves(state, color = state.current) {
    if (state.phase !== 'play') return [];
    const moves = [];
    for (const piece of Object.values(state.pieces)) {
      if (piece.color !== color || !piece.alive) continue;
      moves.push(...legalMovesForPiece(state, piece.id, { color, ignoreTurn: true }));
    }
    return moves;
  }

  function markCaptured(state, piece) {
    piece.alive = false;
    piece.row = null;
    piece.col = null;
    state.captured[piece.color].push(piece.type);
  }

  function resolveCombat(state, attacker, defender, move) {
    attacker.revealed = true;
    defender.revealed = true;
    const result = {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerColor: attacker.color,
      defenderColor: defender.color,
      attackerType: attacker.type,
      defenderType: defender.type,
      from: move.from,
      to: move.to,
      outcome: null,
    };

    if (defender.type === 'flag') {
      markCaptured(state, defender);
      result.outcome = 'flag';
      return result;
    }
    if (defender.type === 'bomb') {
      if (attacker.type === 'miner') {
        markCaptured(state, defender);
        result.outcome = 'attacker';
      } else {
        markCaptured(state, attacker);
        result.outcome = 'defender';
      }
      return result;
    }
    if (attacker.type === 'spy' && defender.type === 'marshal') {
      markCaptured(state, defender);
      result.outcome = 'attacker';
      return result;
    }

    const a = RANKS[attacker.type].strength;
    const d = RANKS[defender.type].strength;
    if (a > d || (a === d && state.options.aggressorWins)) {
      markCaptured(state, defender);
      result.outcome = 'attacker';
    } else if (a < d) {
      markCaptured(state, attacker);
      result.outcome = 'defender';
    } else {
      markCaptured(state, attacker);
      markCaptured(state, defender);
      result.outcome = 'both';
    }
    return result;
  }

  function updateOscillation(state, piece, from, to) {
    const edge = canonicalEdge(from, to);
    const prior = state.oscillation[piece.color];
    state.oscillation[piece.color] = prior && prior.pieceId === piece.id && prior.edge === edge
      ? { pieceId: piece.id, edge, count: prior.count + 1 }
      : { pieceId: piece.id, edge, count: 1 };
  }

  function applyMove(state, proposed) {
    if (state.phase !== 'play') throw new Error('No battle is in progress');
    if (!proposed || !proposed.pieceId || !proposed.to) throw new Error('Incomplete move');
    const legal = legalMovesForPiece(state, proposed.pieceId);
    const move = legal.find(candidate => coordEqual(candidate.to, proposed.to));
    if (!move) throw new Error('Illegal move');

    const next = cloneState(state);
    const attacker = next.pieces[move.pieceId];
    const defender = move.targetId ? next.pieces[move.targetId] : null;
    const fromIndex = boardIndex(move.from.row, move.from.col);
    const toIndex = boardIndex(move.to.row, move.to.col);
    next.board[fromIndex] = null;
    attacker.moved = true;
    updateOscillation(next, attacker, move.from, move.to);
    next.lastCombat = null;

    if (attacker.type === 'scout' && move.distance > 1) attacker.revealed = true;

    let combat = null;
    if (!defender) {
      attacker.row = move.to.row;
      attacker.col = move.to.col;
      next.board[toIndex] = attacker.id;
    } else {
      combat = resolveCombat(next, attacker, defender, move);
      next.lastCombat = combat;
      if (combat.outcome === 'attacker' || combat.outcome === 'flag') {
        attacker.row = move.to.row;
        attacker.col = move.to.col;
        next.board[toIndex] = attacker.id;
      } else if (combat.outcome === 'defender') {
        next.board[toIndex] = defender.id;
      } else {
        next.board[toIndex] = null;
      }
    }

    next.moveNumber += 1;
    next.history.push({
      number: next.moveNumber,
      color: attacker.color,
      pieceId: attacker.id,
      from: move.from,
      to: move.to,
      distance: move.distance,
      attackerType: attacker.revealed ? attacker.type : null,
      defenderType: combat ? combat.defenderType : null,
      outcome: combat ? combat.outcome : 'move',
    });

    if (combat && combat.outcome === 'flag') {
      next.phase = 'gameover';
      next.winner = attacker.color;
      next.reason = 'flag';
      assertValidState(next);
      return next;
    }

    next.current = OPPOSITE[attacker.color];
    if (allLegalMoves(next, next.current).length === 0) {
      next.phase = 'gameover';
      next.winner = attacker.color;
      next.reason = 'immobilised';
      assertValidState(next);
      return next;
    }

    if (next.options.threefoldDraw) {
      const key = positionKey(next);
      next.positionCounts[key] = (next.positionCounts[key] || 0) + 1;
      if (next.positionCounts[key] >= 3) {
        next.phase = 'gameover';
        next.winner = null;
        next.reason = 'repetition';
      }
    }
    assertValidState(next);
    return next;
  }

  function publicSnapshot(state, viewer) {
    if (!COLORS.includes(viewer)) throw new Error('Unknown viewer');
    const pieces = {};
    for (const piece of Object.values(state.pieces)) {
      pieces[piece.id] = {
        id: piece.id,
        color: piece.color,
        type: piece.color === viewer || piece.revealed ? piece.type : null,
        row: piece.row,
        col: piece.col,
        alive: piece.alive,
        revealed: piece.revealed,
        moved: piece.moved,
      };
    }
    return {
      version: state.version,
      seed: state.seed,
      mode: state.mode,
      difficulty: state.difficulty,
      options: cloneState(state.options),
      phase: state.phase,
      current: state.current,
      viewer,
      board: state.board.slice(),
      pieces,
      captured: cloneState(state.captured),
      history: cloneState(state.history),
      moveNumber: state.moveNumber,
      oscillation: { [viewer]: cloneState(state.oscillation[viewer]) },
      winner: state.winner,
      reason: state.reason,
      lastCombat: cloneState(state.lastCombat),
    };
  }

  function serialiseState(state) {
    assertValidState(state);
    return JSON.stringify(state);
  }

  function deserialiseState(source) {
    const parsed = typeof source === 'string' ? JSON.parse(source) : cloneState(source);
    assertValidState(parsed);
    return parsed;
  }

  function assertValidState(state) {
    if (!state || state.version !== VERSION) throw new Error('Unsupported Stratego state');
    if (!Array.isArray(state.board) || state.board.length !== 100) throw new Error('Board must contain 100 cells');
    if (!state.pieces || typeof state.pieces !== 'object') throw new Error('Pieces are missing');
    if (!['setup', 'play', 'gameover'].includes(state.phase)) throw new Error('Invalid phase');
    if (!COLORS.includes(state.current)) throw new Error('Invalid current side');
    if (!state.options || !Number.isInteger(state.options.repetitionLimit) || state.options.repetitionLimit < 1) throw new Error('Invalid repetition option');
    if (!state.oscillation || !state.positionCounts || !Array.isArray(state.history)) throw new Error('Invalid history structures');

    const pieceValues = Object.values(state.pieces);
    if (pieceValues.length !== 80) throw new Error(`Expected 80 pieces, found ${pieceValues.length}`);
    for (const color of COLORS) {
      const army = pieceValues.filter(piece => piece.color === color);
      if (army.length !== 40) throw new Error(`${color} army must contain 40 pieces`);
      const counts = countTypes(army.map(piece => piece.type));
      for (const type of TYPE_ORDER) {
        if ((counts[type] || 0) !== RANKS[type].count) throw new Error(`${color} manifest mismatch for ${type}`);
      }
    }

    const seen = new Set();
    for (let index = 0; index < state.board.length; index += 1) {
      const id = state.board[index];
      if (!id) continue;
      if (!state.pieces[id]) throw new Error(`Board references unknown piece ${id}`);
      if (seen.has(id)) throw new Error(`Piece ${id} appears twice`);
      seen.add(id);
      const row = Math.floor(index / 10);
      const col = index % 10;
      if (isLake(row, col)) throw new Error('A piece occupies a lake');
      const piece = state.pieces[id];
      if (!piece.alive || piece.row !== row || piece.col !== col) throw new Error(`Piece ${id} is out of sync with board`);
    }
    for (const piece of pieceValues) {
      if (!RANKS[piece.type]) throw new Error(`Unknown type ${piece.type}`);
      if (piece.id == null || state.pieces[piece.id] !== piece) throw new Error('Piece identity mismatch');
      if (piece.alive) {
        if (piece.row == null || piece.col == null) {
          if (state.deployed[piece.color]) throw new Error(`Deployed piece ${piece.id} has no square`);
        } else if (!seen.has(piece.id)) {
          throw new Error(`Living piece ${piece.id} is absent from board`);
        }
      } else if (piece.row != null || piece.col != null || seen.has(piece.id)) {
        throw new Error(`Captured piece ${piece.id} still occupies the field`);
      }
    }
    for (const color of COLORS) {
      if (!Array.isArray(state.captured[color])) throw new Error('Captured ledger is invalid');
      const dead = pieceValues.filter(piece => piece.color === color && !piece.alive).map(piece => piece.type).sort();
      const ledger = state.captured[color].slice().sort();
      if (JSON.stringify(dead) !== JSON.stringify(ledger)) throw new Error(`${color} captured ledger mismatch`);
      const tracker = state.oscillation[color];
      if (tracker && (!state.pieces[tracker.pieceId] || tracker.count < 1 || typeof tracker.edge !== 'string')) throw new Error('Invalid oscillation tracker');
    }
    return true;
  }

  return Object.freeze({
    VERSION,
    BOARD_SIZE,
    COLORS,
    OPPOSITE,
    LAKES,
    RANKS,
    TYPE_ORDER,
    MANIFEST,
    FORMATIONS,
    makeRng,
    shuffle,
    cloneState,
    createState,
    deployFormation,
    swapSetupPieces,
    beginGame,
    homeRows,
    homeCells,
    isLake,
    pieceAt,
    legalMovesForPiece,
    allLegalMoves,
    applyMove,
    publicSnapshot,
    positionKey,
    serialiseState,
    deserialiseState,
    assertValidState,
    boardIndex,
  });
});
