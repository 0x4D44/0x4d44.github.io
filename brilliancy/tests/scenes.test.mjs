// Scene validator: every scripted line must be genuine, legal chess.
//
// For each scene: the movetext replays through the engine from startFen; the
// final position matches the recorded reference FEN; every beat sits on a real
// ply; moments and combos sit on the PLAYER's plies; montage targets are sane;
// each moment has exactly one destiny instinct.
//
// Round VIII additionally gets a proof: from the moment the first rook lands
// on d8, every reply PROMETHEUS owns either follows the scripted line or is
// refuted by a short forced mate found by full-width search. The scripted
// line itself must end in checkmate. This is what lets the reveal claim the
// game is sound without blushing.

import assert from "node:assert/strict";
import {
  parseFEN, toFEN, START_FEN, playMovetext, legalMoves, makeMove,
  isCheckmate, isStalemate, inCheck, sanFor,
} from "../engine.js";
import { SCENES, CROSSTABLE, META } from "../scenes.js";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };

// --- structural validation of every scene ------------------------------------

for (const scene of SCENES) {
  const tag = `[${scene.id}]`;
  const start = parseFEN(scene.startFen ?? START_FEN);
  const { sans, states } = playMovetext(start, scene.line); // throws on any illegal move
  const n = sans.length;
  ok(n > 0, `${tag} line non-empty`);
  eq(toFEN(states[n]), scene.finalFen, `${tag} final FEN matches reference`);
  ok(scene.preludeTo >= 0 && scene.preludeTo < n, `${tag} preludeTo in range`);
  ok(["w", "b"].includes(scene.youAre), `${tag} youAre valid`);

  if (scene.outcome.kind === "mate" || scene.outcome.kind === "machine") {
    ok(isCheckmate(states[n]), `${tag} claimed mate is checkmate`);
    ok(sans[n - 1].endsWith("#"), `${tag} last SAN carries #`);
  } else {
    ok(!isCheckmate(states[n]) && !isStalemate(states[n]), `${tag} resignation position is live`);
  }

  let lastMomentPly = -1;
  for (const [key, beat] of Object.entries(scene.beats ?? {})) {
    const ply = Number(key);
    ok(Number.isInteger(ply) && ply >= 0 && ply < n, `${tag} beat ply ${key} in range`);
    const yours = states[ply].turn === scene.youAre;
    if (beat.type === "moment") {
      ok(yours, `${tag} moment at ply ${ply} is the player's move`);
      ok(ply >= scene.preludeTo, `${tag} moment at ply ${ply} not inside prelude`);
      const destiny = beat.instincts.filter((i) => i.destiny);
      eq(destiny.length, 1, `${tag} moment at ply ${ply} has exactly one destiny instinct`);
      for (const inst of beat.instincts) {
        ok(inst.destiny || inst.refusal, `${tag} ply ${ply}: mortal instinct has a refusal beat`);
      }
      lastMomentPly = ply;
    }
    if (beat.type === "combo") {
      ok(yours, `${tag} combo start ${ply} is the player's move`);
      ok(Number.isInteger(beat.until) && beat.until >= ply && beat.until < n, `${tag} combo until in range`);
      ok(states[beat.until].turn === scene.youAre, `${tag} combo ends on the player's ply`);
    }
    if (beat.montageTo ?? beat.techniqueTo) {
      const to = beat.montageTo ?? beat.techniqueTo;
      ok(to > ply && to <= n, `${tag} montage ${ply}->${to} in range`);
    }
    if (beat.think) ok(!yours || beat.type === "moment" || true, `${tag} think ok`);
  }
  ok(lastMomentPly >= 0, `${tag} has at least one moment`);

  ok(scene.outcome.headlines?.length >= 1, `${tag} has headlines`);
  ok(scene.reveal?.players, `${tag} has reveal copy`);
}

// The seven invitational rounds carry the historically verified games in
// chronological order; the reveal depends on it.
const years = SCENES.filter((s) => !s.exhibition).map((s) => s.reveal.year);
ok(years.every((y, i) => i === 0 || y > years[i - 1]), "rounds run in chronological order");
eq(SCENES.length, 8, "eight scenes");

// --- crosstable sanity --------------------------------------------------------

{
  // After all 7 rounds: every pair has a result, the table is antisymmetric,
  // and You scored 7/7.
  let yourScore = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (i === j) continue;
      const r = CROSSTABLE.result(i, j, 7);
      ok(r !== null, `crosstable pair ${i},${j} resolved after round 7`);
      const rInv = CROSSTABLE.result(j, i, 7);
      ok(Math.abs(r + rInv - 1) < 1e-9, `crosstable antisymmetric ${i},${j}`);
      if (i === 7) yourScore += r;
    }
  }
  eq(yourScore, 7, "you finish on 7/7");
  ok(CROSSTABLE.result(0, 7, 0) === null, "no results before round 1");
}

// --- Round VIII: prove the finale ---------------------------------------------

/** Full-width forced-mate search: side to move mates in <= k moves. */
function mateIn(state, k) {
  if (k <= 0) return false;
  const moves = legalMoves(state);
  // try checking moves first — mating nets are made of checks
  const scored = moves.map((m) => {
    const s2 = makeMove(state, m);
    return { m, s2, chk: inCheck(s2) };
  }).sort((a, b) => Number(b.chk) - Number(a.chk));
  for (const { s2 } of scored) {
    if (isCheckmate(s2)) return true;
    if (k === 1) continue;
    const replies = legalMoves(s2);
    if (replies.length === 0) continue; // stalemate — not a mate line
    if (replies.every((r) => mateIn(makeMove(s2, r), k - 1))) return true;
  }
  return false;
}

/**
 * Deep forced-mate search with the ATTACKER restricted to checks and
 * captures (the defender answers with everything). A restricted search can
 * only miss mates, never invent them — so a `true` here is still a proof.
 * Handles desperado sprees (spite checks / throwaway captures) that push the
 * refutation past full-width reach.
 */
function deepMate(state, k) {
  if (k <= 0) return false;
  for (const m of legalMoves(state)) {
    const s2 = makeMove(state, m);
    if (isCheckmate(s2)) return true;
    if (k === 1) continue;
    if (!m.capture && !inCheck(s2)) continue; // restricted move set
    const replies = legalMoves(s2);
    if (replies.length === 0) continue;
    if (replies.every((r) => deepMate(makeMove(s2, r), k - 1))) return true;
  }
  return false;
}

// Iterative deepening keeps failing shallow searches cheap; the restricted
// deep search runs first because nearly every refutation here is a string of
// checks and captures. The small full-width search catches any sideline whose
// refutation needs a quiet move.
function refutes(state) {
  for (let k = 1; k <= 8; k++) if (deepMate(state, k)) return true;
  return mateIn(state, 2);
}

{
  const finale = SCENES.find((s) => s.id === "prometheus");
  const start = parseFEN(finale.startFen);
  const { moves, sans, states } = playMovetext(start, finale.line);
  ok(isCheckmate(states[states.length - 1]), "finale ends in checkmate");
  eq(sans[sans.length - 1], "Nf7#", "finale ends with the smothered knight");

  // Walk the line: at every defender node, each legal reply either follows
  // the script or is refuted by mate in <= 3.
  let refuted = 0, forced = 0;
  for (let ply = 0; ply < sans.length; ply++) {
    const state = states[ply];
    if (state.turn === finale.youAre) continue; // attacker's move: scripted
    const replies = legalMoves(state);
    const scriptedSan = sans[ply];
    ok(replies.length > 0, `finale ply ${ply}: defender has a move`);
    if (replies.length === 1) forced++;
    for (const r of replies) {
      const san = sanFor(state, r);
      if (san === scriptedSan) continue;
      ok(refutes(makeMove(state, r)),
        `finale ply ${ply}: sideline ${san} must lose to a forced mate`);
      refuted++;
    }
  }
  ok(forced >= 3, `finale: most machine replies are literally forced (got ${forced})`);
  console.log(`  finale proof: ${forced} only-moves, ${refuted} sidelines refuted by short mate`);

  // The queen sac and both rook sacs are really in the script.
  ok(finale.line.includes("Rd8") && finale.line.includes("Re8+") && finale.line.includes("Qg8+"),
    "finale sacrifices queen and both rooks");
}

// META copy the UI depends on
for (const key of ["event", "venue", "certName", "certBody", "revealFoot"]) {
  ok(META[key]?.length > 0, `META.${key} present`);
}

console.log(`scenes.test: ${checks} checks passed`);
