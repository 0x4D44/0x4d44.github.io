// quixo-engine.jsx — pure game logic.
//
// Quixo (Gigamic, 1995 — Thierry Chapeau). A 5×5 board of 25 cubes, all
// blank at the start. On your turn you take a cube from the PERIMETER that
// is blank or already shows your symbol — never the opponent's. The cube
// becomes yours, and you push it back in from a different end of its row
// or column: the whole line slides one square toward the gap.
//
// Board cells are flat-indexed row-major (0..24). Cell values:
//   null | 'you' | 'ai'        (you play the crosses, the AI the circles)
//
// A move is {src, dest}: src = the perimeter cell the cube is taken from,
// dest = the row/col end it re-enters at (never src itself).
//
// Win rule (official): five of your symbol in a row / column / diagonal.
// The cruel twist — if your push completes five of the OPPONENT'S symbol,
// they win immediately, even if it completes your own line too.

const SIZE = 5;
const CELLS = 25;
const MOVE_CAP = 140;   // Quixo can cycle forever; call it a draw eventually.

// 12 winning lines: 5 rows + 5 cols + 2 diags
const LINES = (() => {
  const out = [];
  for (let r = 0; r < SIZE; r++) out.push([0,1,2,3,4].map(c => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) out.push([0,1,2,3,4].map(r => r * SIZE + c));
  out.push([0, 6, 12, 18, 24]);
  out.push([4, 8, 12, 16, 20]);
  return out;
})();

const LINE_NAMES = [
  'row 1', 'row 2', 'row 3', 'row 4', 'row 5',
  'column 1', 'column 2', 'column 3', 'column 4', 'column 5',
  'the long diagonal', 'the rising diagonal',
];

// The 16 perimeter cells (the only ones a cube may be taken from).
const PERIM = (() => {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    if (r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1) out.push(i);
  }
  return out;
})();
const PERIM_SET = new Set(PERIM);

const opponent = (who) => (who === 'you' ? 'ai' : 'you');

// Human-readable name for a winning line (for match history copy).
function lineName(cells) {
  if (!cells) return null;
  const key = cells.slice().sort((a, b) => a - b).join(',');
  for (let i = 0; i < LINES.length; i++) {
    if (LINES[i].slice().sort((a, b) => a - b).join(',') === key) return LINE_NAMES[i];
  }
  return null;
}

// First completed line of `who`'s symbol, or null.
function findLine(board, who) {
  for (const line of LINES) {
    if (line.every(i => board[i] === who)) return line;
  }
  return null;
}

// Per-line tallies for the assist chips: {line, you, ai, hotYou, hotAi}.
// "Hot" = four of one symbol and none of the other — one push from five.
function analyzeLines(board) {
  return LINES.map(line => {
    let you = 0, ai = 0;
    for (const i of line) {
      if (board[i] === 'you') you++;
      else if (board[i] === 'ai') ai++;
    }
    return { line, you, ai, hotYou: you === 4 && ai === 0, hotAi: ai === 4 && you === 0 };
  });
}

// Where can a cube taken from `src` re-enter? The ends of its row and its
// column, minus its own position. Corners get 2 options, edges 3.
function legalDests(src) {
  const r = Math.floor(src / SIZE), c = src % SIZE;
  const ends = [r * SIZE, r * SIZE + (SIZE - 1), c, (SIZE - 1) * SIZE + c];
  return [...new Set(ends)].filter(e => e !== src);
}

// All legal moves for `who`: perimeter cubes that are blank or theirs.
function legalMoves(board, who) {
  const out = [];
  for (const src of PERIM) {
    if (board[src] != null && board[src] !== who) continue;
    for (const dest of legalDests(src)) out.push({ src, dest });
  }
  return out;
}

// Pure shift: remove the cube at src, slide the line toward the gap,
// insert a `who` cube at dest. Returns a NEW board.
function shiftBoard(board, src, dest, who) {
  const b = board.slice();
  const sameRow = Math.floor(src / SIZE) === Math.floor(dest / SIZE);
  const step = sameRow ? (dest > src ? 1 : -1) : (dest > src ? SIZE : -SIZE);
  for (let i = src; i !== dest; i += step) b[i] = b[i + step];
  b[dest] = who;
  return b;
}

// The cells that visually moved in a shift (src..dest inclusive) and the
// step they slid by — the board screen uses this to animate the row.
function shiftedCells(src, dest) {
  const sameRow = Math.floor(src / SIZE) === Math.floor(dest / SIZE);
  const step = sameRow ? (dest > src ? 1 : -1) : (dest > src ? SIZE : -SIZE);
  const cells = [];
  for (let i = src; ; i += step) { cells.push(i); if (i === dest) break; }
  return { cells, step };
}

// ─────────────────────────────────────────────────────────────
// AI — bounded minimax with alpha-beta over full moves.
// ─────────────────────────────────────────────────────────────
// Difficulty sets search depth (easy is random above hard floors). The
// search is pure and deterministic; only `easy` draws randomness, via
// `randomFn` so tests can pin it. Unconditional floors keep every level
// from being embarrassing: always take an immediate win; never complete
// the opponent's five (suicide) when avoidable; medium/hard also never
// leave the opponent an immediate winning reply when avoidable.

let randomFn = Math.random;                        // swappable for deterministic tests
const rnd = (arr) => arr[Math.floor(randomFn() * arr.length)];

const NODE_BUDGET = 400000;                        // backstop, degrades to leaf score
let searchNodes = 0;

// Who (if anyone) wins immediately after `who` pushes `b2` into existence.
// Returns 'you' | 'ai' | null. Opponent's line takes precedence (official rule).
function moveWinner(b2, who) {
  const theirs = findLine(b2, opponent(who));
  if (theirs) return opponent(who);
  if (findLine(b2, who)) return who;
  return null;
}

// Static leaf score from the ROOT player's perspective, bounded well inside
// (−1, 1) so it can never outrank a real ±1 terminal.
const LINE_SCORE = [0, 1, 4, 16, 64];
function evaluate(board, root) {
  let s = 0;
  for (const line of LINES) {
    let you = 0, ai = 0;
    for (const i of line) {
      if (board[i] === 'you') you++;
      else if (board[i] === 'ai') ai++;
    }
    if (you > 0 && ai > 0) continue;               // mixed line: worthless to both
    if (you > 0) s += (root === 'you' ? LINE_SCORE[you] : -LINE_SCORE[you]);
    else if (ai > 0) s += (root === 'ai' ? LINE_SCORE[ai] : -LINE_SCORE[ai]);
  }
  if (board[12] === root) s += 2;                  // the centre anchors 4 lines
  else if (board[12] === opponent(root)) s -= 2;
  return s / 2000;                                 // |s| ≤ ~0.4
}

function minimax(board, mover, root, depth, alpha, beta) {
  if (depth <= 0 || ++searchNodes > NODE_BUDGET) return evaluate(board, root);
  const moves = legalMoves(board, mover);
  if (!moves.length) return 0;                     // stuck (all edge cubes hostile): draw
  const maxing = mover === root;
  let best = maxing ? -2 : 2;
  for (const m of moves) {
    const b2 = shiftBoard(board, m.src, m.dest, mover);
    const w = moveWinner(b2, mover);
    const v = w != null
      ? (w === root ? 1 : -1)
      : minimax(b2, opponent(mover), root, depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else        { if (v < best) best = v; if (best < beta)  beta  = best; }
    if (alpha >= beta) break;
  }
  return best;
}

function searchDepth(difficulty) {
  return difficulty === 'hard' ? 3 : 2;            // full-move plies; branching ≈ 30–44
}

// Choose a move for state.current. Also drives player hints (pass a state
// where current === 'you' and difficulty 'hard').
function aiChooseMove(state, difficulty) {
  const { board, current } = state;
  const moves = legalMoves(board, current);
  if (!moves.length) return null;

  // Floor 1: take a clean immediate win.
  for (const m of moves) {
    if (moveWinner(shiftBoard(board, m.src, m.dest, current), current) === current) return m;
  }
  // Floor 2: drop suicide pushes (completing THEIR five) unless forced.
  const nonSuicide = moves.filter(m =>
    moveWinner(shiftBoard(board, m.src, m.dest, current), current) !== opponent(current));
  let pool = nonSuicide.length ? nonSuicide : moves;

  if (difficulty === 'easy') return rnd(pool);

  // Floor 3: drop moves that leave the opponent an immediate win, if avoidable.
  const opp = opponent(current);
  const safe = pool.filter(m => {
    const b2 = shiftBoard(board, m.src, m.dest, current);
    return !legalMoves(b2, opp).some(m2 =>
      moveWinner(shiftBoard(b2, m2.src, m2.dest, opp), opp) === opp);
  });
  if (safe.length) pool = safe;

  const depth = searchDepth(difficulty);
  searchNodes = 0;
  let bestM = pool[0], bestV = -2;
  for (const m of pool) {
    const b2 = shiftBoard(board, m.src, m.dest, current);
    const w = moveWinner(b2, current);
    const v = w != null
      ? (w === current ? 1 : -1)
      : minimax(b2, opp, current, depth - 1, -2, 2);
    if (v > bestV) { bestV = v; bestM = m; }       // strict > ⇒ stable tie-break
  }
  return bestM;
}

// ─────────────────────────────────────────────────────────────
// State transitions (return a NEW state — never mutate)
// ─────────────────────────────────────────────────────────────
function createInitialState({ difficulty = 'medium', whoStarts = 'you' } = {}) {
  return {
    board: Array(CELLS).fill(null),
    current: whoStarts,
    phase: 'play',                                 // 'play' | 'ended'
    winner: null,                                  // 'you' | 'ai' | 'draw'
    winLine: null,
    difficulty,
    history: [],                                   // [{kind:'move', by, src, dest}]
    moveCount: 0,
    lastMove: null,                                // {src, dest, by} — drives the slide anim
  };
}

function applyMove(state, src, dest) {
  if (state.phase !== 'play') return state;
  const who = state.current;
  if (!PERIM_SET.has(src)) return state;
  if (state.board[src] != null && state.board[src] !== who) return state;
  if (!legalDests(src).includes(dest)) return state;

  const board = shiftBoard(state.board, src, dest, who);
  const next = {
    ...state,
    board,
    lastMove: { src, dest, by: who },
    history: [...state.history, { kind: 'move', by: who, src, dest }],
    moveCount: state.moveCount + 1,
  };
  const theirs = findLine(board, opponent(who));
  if (theirs) return { ...next, phase: 'ended', winner: opponent(who), winLine: theirs };
  const mine = findLine(board, who);
  if (mine) return { ...next, phase: 'ended', winner: who, winLine: mine };
  if (next.moveCount >= MOVE_CAP) return { ...next, phase: 'ended', winner: 'draw' };
  const other = opponent(who);
  if (!legalMoves(board, other).length) return { ...next, phase: 'ended', winner: 'draw' };
  return { ...next, current: other };
}

// Rewind to BEFORE the player's most recent move (unwinding the AI's reply
// with it), by replaying the trimmed history from scratch.
function undoPlayerTurn(state) {
  if (state.phase === 'ended') return state;
  const h = state.history.slice();
  let undone = 0;
  while (h.length && undone < 1) {
    const last = h.pop();
    if (last.kind === 'move' && last.by === 'you') undone = 1;
  }
  return replayHistory(h, state.difficulty);
}

function replayHistory(history, difficulty) {
  const whoStarts = history.length ? history[0].by : 'you';
  let s = createInitialState({ difficulty, whoStarts });
  for (const ev of history) {
    if (ev.kind === 'move') s = applyMove(s, ev.src, ev.dest);
  }
  return { ...s, lastMove: null };
}

window.QuixoEngine = {
  SIZE, CELLS, LINES, PERIM, MOVE_CAP,
  lineName, findLine, analyzeLines, legalDests, legalMoves, shiftBoard, shiftedCells,
  moveWinner, aiChooseMove,
  createInitialState, applyMove, undoPlayerTurn, replayHistory,
  _setRandom: (fn) => { randomFn = fn; },          // test hook for deterministic RNG
};
