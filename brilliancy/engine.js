// ============================================================================
// Brilliancy — a small, real chess engine.
//
// Not an AI: a rules engine. It exists so that every scripted line in the game
// is genuine, legal chess — parsed from real PGN, validated move by move, with
// checks/mates detected rather than asserted. The UI animates what this engine
// says happened; the tests refuse to ship a scene the engine can't replay.
//
// Board: 64-slot array. Index = rank*8 + file, rank 0 = White's first rank,
// file 0 = the a-file (so a1=0, h1=7, a8=56, h8=63).
// Pieces: "PNBRQK" white, "pnbrqk" black, null for an empty square.
//
// ES module, no dependencies; runs identically in the browser and in node.
// ============================================================================

export const FILES = "abcdefgh";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const sq = (file, rank) => rank * 8 + file;
export const fileOf = (i) => i & 7;
export const rankOf = (i) => i >> 3;
export const nameOf = (i) => FILES[fileOf(i)] + (rankOf(i) + 1);
export const idx = (name) => sq(FILES.indexOf(name[0]), Number(name[1]) - 1);

const isWhitePiece = (p) => p >= "A" && p <= "Z";
export const colorOf = (p) => (isWhitePiece(p) ? "w" : "b");
export const typeOf = (p) => p.toUpperCase(); // 'P','N','B','R','Q','K'

// ---------------------------------------------------------------------------
// FEN
// ---------------------------------------------------------------------------

export function parseFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`bad FEN (needs 4+ fields): ${fen}`);
  const [placement, turn, castling, ep] = parts;
  const halfmove = parts.length > 4 ? Number(parts[4]) : 0;
  const fullmove = parts.length > 5 ? Number(parts[5]) : 1;

  const board = new Array(64).fill(null);
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error(`bad FEN placement: ${placement}`);
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") file += Number(ch);
      else if ("pnbrqkPNBRQK".includes(ch)) board[sq(file++, 7 - r)] = ch;
      else throw new Error(`bad FEN piece '${ch}' in ${fen}`);
    }
    if (file !== 8) throw new Error(`bad FEN rank '${ranks[r]}' in ${fen}`);
  }
  if (turn !== "w" && turn !== "b") throw new Error(`bad FEN turn: ${turn}`);
  return {
    board,
    turn,
    castling: {
      K: castling.includes("K"),
      Q: castling.includes("Q"),
      k: castling.includes("k"),
      q: castling.includes("q"),
    },
    ep: ep === "-" ? null : idx(ep),
    halfmove,
    fullmove,
  };
}

export function toFEN(state) {
  let placement = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = state.board[sq(f, r)];
      if (!p) empty++;
      else {
        if (empty) { placement += empty; empty = 0; }
        placement += p;
      }
    }
    if (empty) placement += empty;
    if (r) placement += "/";
  }
  const c = state.castling;
  const castling = (c.K ? "K" : "") + (c.Q ? "Q" : "") + (c.k ? "k" : "") + (c.q ? "q" : "") || "-";
  const ep = state.ep === null ? "-" : nameOf(state.ep);
  return `${placement} ${state.turn} ${castling} ${ep} ${state.halfmove} ${state.fullmove}`;
}

// ---------------------------------------------------------------------------
// Attack detection
// ---------------------------------------------------------------------------

const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** Is square `target` attacked by any piece of colour `by`? */
export function isAttacked(state, target, by) {
  const { board } = state;
  const tf = fileOf(target), tr = rankOf(target);
  const own = (p) => p && colorOf(p) === by;

  // Pawns: a white pawn on (tf±1, tr-1) attacks target; black from tr+1.
  const pr = by === "w" ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    if (onBoard(tf + df, pr)) {
      const p = board[sq(tf + df, pr)];
      if (own(p) && typeOf(p) === "P") return true;
    }
  }
  for (const [df, dr] of KNIGHT_DELTAS) {
    if (onBoard(tf + df, tr + dr)) {
      const p = board[sq(tf + df, tr + dr)];
      if (own(p) && typeOf(p) === "N") return true;
    }
  }
  for (const [df, dr] of KING_DELTAS) {
    if (onBoard(tf + df, tr + dr)) {
      const p = board[sq(tf + df, tr + dr)];
      if (own(p) && typeOf(p) === "K") return true;
    }
  }
  for (const [dirs, types] of [[ROOK_DIRS, "RQ"], [BISHOP_DIRS, "BQ"]]) {
    for (const [df, dr] of dirs) {
      let f = tf + df, r = tr + dr;
      while (onBoard(f, r)) {
        const p = board[sq(f, r)];
        if (p) {
          if (own(p) && types.includes(typeOf(p))) return true;
          break;
        }
        f += df; r += dr;
      }
    }
  }
  return false;
}

export function kingSquare(state, color) {
  const king = color === "w" ? "K" : "k";
  for (let i = 0; i < 64; i++) if (state.board[i] === king) return i;
  return -1;
}

export const inCheck = (state, color = state.turn) =>
  isAttacked(state, kingSquare(state, color), color === "w" ? "b" : "w");

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------
// Move: { from, to, piece, capture: piece|null, promo: 'Q'|'R'|'B'|'N'|null,
//         castle: 'K'|'Q'|null, ep: bool, dbl: bool }

function pseudoMoves(state) {
  const { board, turn } = state;
  const moves = [];
  const dir = turn === "w" ? 1 : -1;
  const homeRank = turn === "w" ? 1 : 6;
  const promoRank = turn === "w" ? 7 : 0;

  const push = (from, to, extra = {}) => {
    moves.push({
      from, to,
      piece: board[from],
      capture: extra.epCap ? (turn === "w" ? "p" : "P") : board[to],
      promo: extra.promo ?? null,
      castle: extra.castle ?? null,
      ep: !!extra.epCap,
      dbl: !!extra.dbl,
    });
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const f = fileOf(from), r = rankOf(from);
    const type = typeOf(p);

    if (type === "P") {
      const fwd = sq(f, r + dir);
      const pushPawn = (to) => {
        if (rankOf(to) === promoRank) for (const promo of ["Q", "R", "B", "N"]) push(from, to, { promo });
        else push(from, to);
      };
      if (!board[fwd]) {
        pushPawn(fwd);
        if (r === homeRank && !board[sq(f, r + 2 * dir)]) push(from, sq(f, r + 2 * dir), { dbl: true });
      }
      for (const df of [-1, 1]) {
        if (!onBoard(f + df, r + dir)) continue;
        const to = sq(f + df, r + dir);
        const victim = board[to];
        if (victim && colorOf(victim) !== turn) {
          if (rankOf(to) === promoRank) for (const promo of ["Q", "R", "B", "N"]) push(from, to, { promo });
          else push(from, to);
        } else if (to === state.ep) {
          push(from, to, { epCap: true });
        }
      }
    } else if (type === "N" || type === "K") {
      for (const [df, dr] of type === "N" ? KNIGHT_DELTAS : KING_DELTAS) {
        if (!onBoard(f + df, r + dr)) continue;
        const to = sq(f + df, r + dr);
        if (!board[to] || colorOf(board[to]) !== turn) push(from, to);
      }
    } else {
      const dirs = type === "R" ? ROOK_DIRS : type === "B" ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let tf = f + df, tr = r + dr;
        while (onBoard(tf, tr)) {
          const to = sq(tf, tr);
          if (!board[to]) push(from, to);
          else {
            if (colorOf(board[to]) !== turn) push(from, to);
            break;
          }
          tf += df; tr += dr;
        }
      }
    }
  }

  // Castling: rights present, squares between empty, king path unattacked.
  const enemy = turn === "w" ? "b" : "w";
  const back = turn === "w" ? 0 : 7;
  const kingFrom = sq(4, back);
  const rights = state.castling;
  const canCastle = (side) => {
    if (!(turn === "w" ? rights[side === "K" ? "K" : "Q"] : rights[side === "K" ? "k" : "q"])) return false;
    if (board[kingFrom] !== (turn === "w" ? "K" : "k")) return false;
    const rookSq = sq(side === "K" ? 7 : 0, back);
    if (board[rookSq] !== (turn === "w" ? "R" : "r")) return false;
    const between = side === "K" ? [5, 6] : [1, 2, 3];
    for (const bf of between) if (board[sq(bf, back)]) return false;
    const path = side === "K" ? [4, 5, 6] : [4, 3, 2]; // squares king occupies/crosses
    for (const pf of path) if (isAttacked(state, sq(pf, back), enemy)) return false;
    return true;
  };
  if (canCastle("K")) push(kingFrom, sq(6, back), { castle: "K" });
  if (canCastle("Q")) push(kingFrom, sq(2, back), { castle: "Q" });

  return moves;
}

/** Apply a move, returning a NEW state (copy-make). */
export function makeMove(state, move) {
  const board = state.board.slice();
  const turn = state.turn;
  const castling = { ...state.castling };

  board[move.from] = null;
  board[move.to] = move.promo ? (turn === "w" ? move.promo : move.promo.toLowerCase()) : move.piece;
  if (move.ep) board[sq(fileOf(move.to), rankOf(move.to) + (turn === "w" ? -1 : 1))] = null;
  if (move.castle) {
    const back = turn === "w" ? 0 : 7;
    const rook = turn === "w" ? "R" : "r";
    if (move.castle === "K") { board[sq(7, back)] = null; board[sq(5, back)] = rook; }
    else { board[sq(0, back)] = null; board[sq(3, back)] = rook; }
  }

  // Castling-rights bookkeeping: king moves, rook moves, rook captured.
  const touch = (square) => {
    if (square === idx("e1")) { castling.K = castling.Q = false; }
    else if (square === idx("h1")) castling.K = false;
    else if (square === idx("a1")) castling.Q = false;
    else if (square === idx("e8")) { castling.k = castling.q = false; }
    else if (square === idx("h8")) castling.k = false;
    else if (square === idx("a8")) castling.q = false;
  };
  touch(move.from);
  touch(move.to);

  return {
    board,
    turn: turn === "w" ? "b" : "w",
    castling,
    ep: move.dbl ? sq(fileOf(move.from), rankOf(move.from) + (turn === "w" ? 1 : -1)) : null,
    halfmove: typeOf(move.piece) === "P" || move.capture ? 0 : state.halfmove + 1,
    fullmove: turn === "b" ? state.fullmove + 1 : state.fullmove,
  };
}

export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => !inCheck(makeMove(state, m), state.turn));
}

export const isCheckmate = (state) => inCheck(state) && legalMoves(state).length === 0;
export const isStalemate = (state) => !inCheck(state) && legalMoves(state).length === 0;

// ---------------------------------------------------------------------------
// SAN — generate and parse
// ---------------------------------------------------------------------------

/** SAN for a move that is legal in `state`, including '+' / '#' suffix. */
export function sanFor(state, move) {
  let san;
  if (move.castle) {
    san = move.castle === "K" ? "O-O" : "O-O-O";
  } else if (typeOf(move.piece) === "P") {
    san = (move.capture ? FILES[fileOf(move.from)] + "x" : "") + nameOf(move.to);
    if (move.promo) san += "=" + move.promo;
  } else {
    const type = typeOf(move.piece);
    // Disambiguate against other legal moves of the same piece type to the same square.
    const rivals = legalMoves(state).filter(
      (m) => m.to === move.to && m.from !== move.from && typeOf(m.piece) === type
    );
    let disambig = "";
    if (rivals.length) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
      if (!sameFile) disambig = FILES[fileOf(move.from)];
      else if (!sameRank) disambig = String(rankOf(move.from) + 1);
      else disambig = nameOf(move.from);
    }
    san = type + disambig + (move.capture ? "x" : "") + nameOf(move.to);
  }
  const after = makeMove(state, move);
  if (inCheck(after)) san += isCheckmate(after) ? "#" : "+";
  return san;
}

const normalizeSAN = (san) =>
  san.replace(/[!?]+$/g, "").replace(/[+#]$/g, "").replace(/0/g, "O").replace(/e\.p\./i, "").trim();

/** Find the legal move whose SAN matches (checks/annotations optional). */
export function moveFromSAN(state, san) {
  const want = normalizeSAN(san);
  const matches = legalMoves(state).filter((m) => normalizeSAN(sanFor(state, m)) === want);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`illegal or unknown SAN '${san}' in ${toFEN(state)}`);
  throw new Error(`ambiguous SAN '${san}' in ${toFEN(state)}`);
}

/**
 * Play a whole movetext ("1.e4 e5 2.Nf3 ...") from `state`.
 * Move numbers, result tokens and annotations are ignored.
 * Returns { moves, sans, states } where states[0] is the input state and
 * states[i+1] is the position after moves[i]; sans are engine-regenerated.
 */
export function playMovetext(state, movetext) {
  const tokens = movetext
    .replace(/\{[^}]*\}/g, " ")            // comments
    .replace(/\d+\.(\.\.)?/g, " ")          // move numbers "12." / "12..."
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*|\.\.\.)$/.test(t));
  const moves = [], sans = [], states = [state];
  for (const tok of tokens) {
    const move = moveFromSAN(state, tok);
    moves.push(move);
    sans.push(sanFor(state, move));
    state = makeMove(state, move);
    states.push(state);
  }
  return { moves, sans, states };
}

// ---------------------------------------------------------------------------
// perft — movegen self-test (used by the test suite)
// ---------------------------------------------------------------------------

export function perft(state, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(state)) {
    nodes += depth === 1 ? 1 : perft(makeMove(state, m), depth - 1);
  }
  return nodes;
}
