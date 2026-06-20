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
// AI
// ─────────────────────────────────────────────────────────────
// All AI is intentionally lightweight — fast enough that we can give the
// player an "AI thinking…" beat without it actually being CPU-bound.

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

function aiChoosePlacement(state, difficulty) {
  const { board, held } = state;
  const cells = emptyCells(board);
  if (held == null) return cells[0];

  // 1) Take an immediate win if available.
  for (const c of cells) if (placementWins(board, c, held)) return c;

  if (difficulty === 'easy') return rnd(cells);

  // 2) Avoid placements that let opponent force a win with ANY remaining piece.
  const remaining = remainingPieces(board, held);
  const safe = cells.filter(c => {
    const b = board.slice(); b[c] = held;
    // For each piece we could hand opponent next, opponent's best move:
    return remaining.every(p =>
      emptyCells(b).every(c2 => !placementWins(b, c2, p))
    );
  });
  if (safe.length) return rnd(safe);
  return rnd(cells);
}

function aiChooseGift(state, difficulty) {
  const { board } = state;
  const remaining = remainingPieces(board, null);
  if (!remaining.length) return null;

  if (difficulty === 'easy') return rnd(remaining);

  // Prefer pieces opponent CANNOT win with on any empty cell.
  const safe = remaining.filter(p =>
    emptyCells(board).every(c => !placementWins(board, c, p))
  );
  if (safe.length) return rnd(safe);
  return rnd(remaining);
}

// ─────────────────────────────────────────────────────────────
// State transitions (return a NEW state — never mutate)
// ─────────────────────────────────────────────────────────────
function createInitialState({ difficulty = 'medium', whoStarts = 'you', firstPiece } = {}) {
  // The OPPONENT of whoever-starts hands them the first piece.
  const opponent = whoStarts === 'you' ? 'ai' : 'you';
  const piece = firstPiece != null ? firstPiece : Math.floor(Math.random() * 16);
  return {
    board: Array(16).fill(null),
    held: piece,
    current: whoStarts,
    phase: 'place',
    winner: null,
    winLine: null,
    difficulty,
    history: [{ kind: 'gift', by: opponent, to: whoStarts, piece }],
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
  const other = state.current === 'you' ? 'ai' : 'you';
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
};
