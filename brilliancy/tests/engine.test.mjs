// Engine self-test: perft node counts against the published reference values
// (chessprogramming.org), FEN round-trips, and SAN generate/parse behaviour.
// Any movegen defect — castling-through-check, en passant pins, promotion,
// disambiguation — collides with at least one of these counts.

import assert from "node:assert/strict";
import {
  parseFEN, toFEN, START_FEN, perft, playMovetext, moveFromSAN, sanFor,
  makeMove, legalMoves, isCheckmate, isStalemate, inCheck,
} from "../engine.js";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };

// --- FEN round-trips --------------------------------------------------------
for (const fen of [
  START_FEN,
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 16",
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
]) {
  eq(toFEN(parseFEN(fen)), fen, `FEN round-trip: ${fen}`);
}

// --- perft ------------------------------------------------------------------
// Reference values from chessprogramming.org/Perft_Results.
const PERFT = [
  [START_FEN, [20, 400, 8902, 197281]],
  // "Kiwipete" — castling, pins, checks, promotions all live here.
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862]],
  // Position 3 — en passant discipline (including the EP-uncovers-check trap).
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238]],
  // Position 4 — promotions and underpromotions.
  ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]],
  // Position 5 — castling rights after rook capture.
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]],
];
for (const [fen, counts] of PERFT) {
  const state = parseFEN(fen);
  counts.forEach((expected, i) => {
    eq(perft(state, i + 1), expected, `perft(${i + 1}) of ${fen}`);
  });
}

// --- SAN generation ---------------------------------------------------------
{
  // Scholar's mate: final SAN must carry '#', and the position must be mate.
  const { sans, states } = playMovetext(parseFEN(START_FEN), "1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#");
  eq(sans.at(-1), "Qxf7#", "scholar's mate SAN");
  ok(isCheckmate(states.at(-1)), "scholar's mate is mate");
}
{
  // Disambiguation: two knights can reach d2 — SAN must say which.
  const state = parseFEN("k7/8/8/8/8/8/8/KN3N2 w - - 0 1"); // Nb1, Nf1
  const move = moveFromSAN(state, "Nbd2");
  eq(sanFor(state, move), "Nbd2", "file disambiguation");
}
{
  // Promotion with check, and parsing it back.
  const state = parseFEN("k7/4P3/8/8/8/8/8/K7 w - - 0 1");
  const move = moveFromSAN(state, "e8=Q");
  eq(sanFor(state, move), "e8=Q+", "promotion gives check");
}
{
  // En passant: capture is generated, SAN is exd6, pawn disappears.
  const state = parseFEN("k7/8/8/3pP3/8/8/8/K7 w - d6 0 2");
  const move = moveFromSAN(state, "exd6");
  ok(move.ep, "exd6 recognised as en passant");
  const after = makeMove(state, move);
  ok(!after.board[35], "captured pawn removed from d5"); // d5 = 35
}
{
  // Castling both ways parses, moves the rook, and kills the rights.
  const state = parseFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const short = makeMove(state, moveFromSAN(state, "O-O"));
  eq(toFEN(short).split(" ")[2], "kq", "white rights gone after O-O");
  const long = makeMove(state, moveFromSAN(state, "O-O-O"));
  eq(long.board[3], "R", "rook lands on d1 after O-O-O");
}
{
  // Illegal SAN throws.
  const state = parseFEN(START_FEN);
  assert.throws(() => moveFromSAN(state, "Qh5"), /illegal/, "Qh5 illegal from start");
  checks++;
}
{
  // Stalemate detection.
  const state = parseFEN("k7/8/1Q6/8/8/8/8/K7 b - - 0 1");
  ok(isStalemate(state), "queen-b6 stalemate");
  ok(!inCheck(state), "stalemate is not check");
}
{
  // legalMoves under check only offers escapes.
  const state = parseFEN("k7/8/8/8/8/8/1q6/K7 w - - 0 1");
  ok(legalMoves(state).every((m) => !inCheck(makeMove(state, m), "w")), "all escapes legal");
}

console.log(`engine.test: ${checks} checks passed`);
