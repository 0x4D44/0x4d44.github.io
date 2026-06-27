// quarto-engine.jsx — pure game logic.
//
// Pieces are encoded as integers 0..15 with a 4-bit attribute vector:
//   bit 0 (value 1) = TALL    (else short)
//   bit 1 (value 2) = DARK    (else light)
//   bit 2 (value 4) = ROUND   (else square)
//   bit 3 (value 8) = HOLLOW  (else solid)
//
// The 16 board cells are flat-indexed row-major (0..15).
//
// State machine:
//   {current: 'you'|'ai', phase: 'place'|'select'|'ended', ...}
//   On 'place' the current player drops `held` onto a cell.
//   On 'select' the current player picks a piece to hand to the OPPONENT;
//     control then passes to the opponent in phase 'place'.

const ALL_PIECES = Array.from({ length: 16 }, (_, i) => i);

// 10 winning lines: 4 rows + 4 cols + 2 diags
const LINES = (() => {
  const out = [];
  for (let r = 0; r < 4; r++) out.push([0,1,2,3].map(c => r*4+c));
  for (let c = 0; c < 4; c++) out.push([0,1,2,3].map(r => r*4+c));
  out.push([0,5,10,15]);
  out.push([3,6,9,12]);
  return out;
})();

// Returns winning line indexes (array of 4 cell ids) or null.
function findWin(board) {
  for (const line of LINES) {
    const pieces = line.map(i => board[i]);
    if (pieces.some(p => p == null)) continue;
    let andMask = 0xF, orMask = 0;
    for (const p of pieces) { andMask &= p; orMask |= p; }
    // shared 1-bit: andMask != 0 ; shared 0-bit: orMask != 0xF
    if (andMask !== 0 || orMask !== 0xF) return line;
  }
  return null;
}

// For each line: how many cells filled, what attrs are still "live" (all
// filled pieces share that bit-value). Returns an array of {line, count,
// liveOnes, liveZeros, completable} for each of the 10 lines.
function analyzeLines(board) {
  return LINES.map(line => {
    const pieces = line.map(i => board[i]).filter(p => p != null);
    let andMask = 0xF, orMask = 0;
    for (const p of pieces) { andMask &= p; orMask |= p; }
    const liveOnes = pieces.length === 0 ? 0xF : andMask;          // bits all share as 1
    const liveZeros = pieces.length === 0 ? 0xF : (~orMask) & 0xF; // bits all share as 0
    return {
      line, count: pieces.length,
      liveOnes, liveZeros,
      completable: pieces.length === 0 || (liveOnes | liveZeros) !== 0,
      isHot: pieces.length === 3 && ((liveOnes | liveZeros) !== 0), // one move from quarto
    };
  });
}

// Would placing `piece` at `cell` complete a quarto?
function placementWins(board, cell, piece) {
  if (board[cell] != null) return null;
  const b = board.slice(); b[cell] = piece;
  return findWin(b);
}

// Pieces remaining: not on board AND not held.
function remainingPieces(board, held) {
  const onBoard = new Set(board.filter(p => p != null));
  return ALL_PIECES.filter(p => !onBoard.has(p) && p !== held);
}

function emptyCells(board) {
  return board.map((p,i) => p == null ? i : null).filter(x => x != null);
}

// ─────────────────────────────────────────────────────────────
// AI — one bounded minimax over the place→select turn structure.
// ─────────────────────────────────────────────────────────────
// Difficulty sets search depth (easy is random). The search is pure and
// deterministic; only `easy` (and game setup) draw randomness, via `randomFn`
// so tests can pin it. Two unconditional floors keep play never weaker than a
// 1-ply guard: always take a win; never hand / walk into an avoidable 1-turn loss.

let randomFn = Math.random;                          // swappable for deterministic tests
const rnd = (arr) => arr[Math.floor(randomFn() * arr.length)];
const opponent = (who) => (who === 'you' ? 'ai' : 'you');

// A safety backstop only — adaptive depth (searchDepth) is what keeps moves
// snappy; the budget caps pathological positions, degrading to the leaf score.
const NODE_BUDGET = 2000000;
let searchNodes = 0;

// Remaining pieces that are "safe to hand over": placing them on any empty cell
// never completes a line. `held` (the piece in hand) is excluded.
function safeGiftCount(board, held) {
  const cells = emptyCells(board);
  let n = 0;
  for (const p of remainingPieces(board, held)) {
    if (cells.every(c => !placementWins(board, c, p))) n++;
  }
  return n;
}

// Static leaf score from the ROOT player's perspective, bounded in (−1, 1) so it
// can never outrank a real ±1 terminal. `mover` is the side to move at the leaf;
// `held != null` ⇒ a place node (with a one-ply-win quiescence check).
function leafScore(board, held, mover, root) {
  if (held != null) {
    for (const c of emptyCells(board)) {
      if (placementWins(board, c, held)) return mover === root ? 1 : -1;
    }
  }
  // Prefer keeping safe outs for the side that gifts next (the mover).
  const s = safeGiftCount(board, held) / 32;         // in [0, 0.5)
  return mover === root ? s : -s;
}

// Minimax with alpha-beta, keyed on `current` (the place→select edge does NOT
// flip the mover — only a gift does). Value is from `root`'s perspective.
// Operates with make/unmake on a mutable board — never the O(n) state transitions.
function minimax(board, held, mover, root, depth, alpha, beta) {
  if (depth <= 0 || ++searchNodes > NODE_BUDGET) return leafScore(board, held, mover, root);
  const maxing = mover === root;
  let best = maxing ? -2 : 2;
  if (held != null) {
    const cells = emptyCells(board);                 // place node
    for (const c of cells) {
      board[c] = held;
      let v;
      if (findWin(board)) v = maxing ? 1 : -1;
      else if (cells.length === 1) v = 0;            // placed the last cell ⇒ draw
      else v = minimax(board, null, mover, root, depth - 1, alpha, beta);
      board[c] = null;
      if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else        { if (v < best) best = v; if (best < beta)  beta  = best; }
      if (alpha >= beta) break;
    }
  } else {
    const rem = remainingPieces(board, null);        // select node
    if (rem.length === 0) return 0;
    for (const p of rem) {
      const v = minimax(board, p, opponent(mover), root, depth - 1, alpha, beta);
      if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else        { if (v < best) best = v; if (best < beta)  beta  = best; }
      if (alpha >= beta) break;
    }
  }
  return best;
}

// Search depth in plies (a place or a select = 1). Fixed per move. The opening
// holds no forced results and huge branching, so both levels stay shallow there;
// strength comes from deepening as the board fills. Hard solves the endgame
// exactly (where Quarto is decided, and the tree is small — see the perf notes).
function searchDepth(difficulty, board) {
  const e = emptyCells(board).length;
  if (difficulty === 'medium') return e > 7 ? 2 : 4;
  if (e > 9) return 2;                               // hard: shallow opening
  if (e > 6) return 4;                               // mid: bounded lookahead
  return 32;                                         // ≤6 empties ⇒ solved to terminal
}

function aiChoosePlacement(state, difficulty) {
  const { board, held, current } = state;
  const cells = emptyCells(board);
  if (held == null) return cells[0];
  for (const c of cells) if (placementWins(board, c, held)) return c;   // floor: take a win
  if (difficulty === 'easy') return rnd(cells);

  const b = board.slice();
  // Floor: drop placements that leave us with no safe gift (a forced 1-turn loss),
  // unless every placement does. Never excludes a genuinely better move.
  const candidates = cells.filter(c => {
    b[c] = held;
    const ok = safeGiftCount(b, held) > 0 || remainingPieces(b, held).length === 0;
    b[c] = null;
    return ok;
  });
  const pool = candidates.length ? candidates : cells;

  const depth = searchDepth(difficulty, board);
  searchNodes = 0;
  let bestC = pool[0], bestV = -2;
  for (const c of pool) {
    b[c] = held;
    const v = cells.length === 1
      ? 0
      : minimax(b, null, current, current, depth - 1, -2, 2);
    b[c] = null;
    if (v > bestV) { bestV = v; bestC = c; }          // strict > ⇒ lowest-index tie-break
  }
  return bestC;
}

function aiChooseGift(state, difficulty) {
  const { board, current } = state;
  const remaining = remainingPieces(board, null);
  if (!remaining.length) return null;
  if (difficulty === 'easy') return rnd(remaining);

  // Floor: never hand a piece the opponent can win with immediately, if avoidable.
  const cells = emptyCells(board);
  const safe = remaining.filter(p => cells.every(c => !placementWins(board, c, p)));
  const pool = safe.length ? safe : remaining;

  const depth = searchDepth(difficulty, board);
  const b = board.slice();
  searchNodes = 0;
  let bestP = pool[0], bestV = -2;
  for (const p of pool) {
    const v = minimax(b, p, opponent(current), current, depth - 1, -2, 2);
    if (v > bestV) { bestV = v; bestP = p; }          // strict > ⇒ lowest-id tie-break
  }
  return bestP;
}

// ─────────────────────────────────────────────────────────────
// State transitions (return a NEW state — never mutate)
// ─────────────────────────────────────────────────────────────
function createInitialState({ difficulty = 'medium', whoStarts = 'you', firstPiece } = {}) {
  // The OPPONENT of whoever-starts hands them the first piece.
  const piece = firstPiece != null ? firstPiece : Math.floor(randomFn() * 16);
  return {
    board: Array(16).fill(null),
    held: piece,
    current: whoStarts,
    phase: 'place',
    winner: null,
    winLine: null,
    difficulty,
    history: [{ kind: 'gift', by: opponent(whoStarts), to: whoStarts, piece }],
    moveCount: 0,
  };
}

function applyPlace(state, cell) {
  if (state.phase !== 'place' || state.board[cell] != null || state.held == null) return state;
  const board = state.board.slice();
  board[cell] = state.held;
  const win = findWin(board);
  const placedPiece = state.held;
  const next = {
    ...state,
    board,
    held: null,
    history: [...state.history, { kind: 'place', by: state.current, cell, piece: placedPiece }],
    moveCount: state.moveCount + 1,
  };
  if (win) {
    return { ...next, phase: 'ended', winner: state.current, winLine: win };
  }
  if (remainingPieces(board, null).length === 0) {
    return { ...next, phase: 'ended', winner: 'draw' };
  }
  return { ...next, phase: 'select' };
}

function applySelect(state, piece) {
  if (state.phase !== 'select') return state;
  if (state.board.includes(piece)) return state;
  const other = opponent(state.current);
  return {
    ...state,
    held: piece,
    current: other,
    phase: 'place',
    history: [...state.history, { kind: 'gift', by: state.current, to: other, piece }],
  };
}

// Returns a state rewound to BEFORE the most recent player-initiated chunk
// (i.e. unwinds the AI turn + the player's own preceding select+place).
function undoPlayerTurn(state) {
  if (state.phase === 'ended') return state;          // can't undo a finished game in this prototype
  // Rewind until the most recent step where it became the player's turn to place.
  let h = state.history.slice();
  // Strip everything until we find a state where the player is in 'place'
  // with NO previous player place yet, OR rewind exactly one full round.
  // Implementation: replay history minus the last two of (player place, ai gift) etc.
  // For prototype simplicity we just drop the last few entries until 'place by you' has been undone once.
  let undone = 0;
  while (h.length && undone < 1) {
    const last = h.pop();
    if (last.kind === 'place' && last.by === 'you') undone = 1;
  }
  // Replay from scratch:
  return replayHistory(h, state.difficulty);
}

function replayHistory(history, difficulty) {
  // First entry must be the initial gift.
  if (!history.length || history[0].kind !== 'gift') {
    return createInitialState({ difficulty });
  }
  const first = history[0];
  let s = createInitialState({ difficulty, whoStarts: first.to, firstPiece: first.piece });
  // s.history already contains an equivalent gift; replace with the real one for fidelity.
  s = { ...s, history: [first] };
  for (let i = 1; i < history.length; i++) {
    const ev = history[i];
    if (ev.kind === 'place') s = applyPlace(s, ev.cell);
    else if (ev.kind === 'gift') s = applySelect(s, ev.piece);
  }
  return s;
}

window.QuartoEngine = {
  ALL_PIECES, LINES, findWin, analyzeLines, placementWins, remainingPieces, emptyCells,
  aiChoosePlacement, aiChooseGift,
  createInitialState, applyPlace, applySelect, undoPlayerTurn, replayHistory,
  _setRandom: (fn) => { randomFn = fn; },            // test hook for deterministic RNG
};
