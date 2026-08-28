// Node has no DOM, so this file does two things: hammer the pure functions hud.js
// exports (every formatting, angle and geometry decision), then drive the real
// createHud against a stub document to prove the per-frame path is node-count stable
// and survives a frame full of NaN.

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTime, formatClock, formatDelta, deltaState, deltaColour, DELTA_COLOURS,
  convertSpeed, unitLabel, normaliseUnits, speedWheelDigits,
  needleAngle, stepNeedle, shiftLightState, shiftLightBand, gaugeTicks,
  DIAL_START_DEG, DIAL_END_DEG, SHIFT_LIGHT_COUNT,
  arrowPathForSeverity, arrowHeadPath, arrowCurvature, arrowTurnAngle,
  normaliseDirection, normalisePacenote, directionLabel, ARROW_VIEW,
  routeRibbonLayout, routeRibbonPath, ribbonPointAtFraction, ribbonLengthAtFraction,
  damageTint, damageTintIndex, normaliseDamageRows, DAMAGE_SLOTS,
  createHud,
} from "../hud.js";

// ---------------------------------------------------------------- time

test("formatTime covers hours, negatives and sub-millisecond input", () => {
  assert.equal(formatTime(0), "00:00.000");
  assert.equal(formatTime(0.9), "00:00.000", "sub-millisecond truncates, never rounds up");
  assert.equal(formatTime(999.9999), "00:00.999");
  assert.equal(formatTime(1000), "00:01.000");
  assert.equal(formatTime(61234), "01:01.234");
  assert.equal(formatTime(599999), "09:59.999");
  assert.equal(formatTime(3600000), "1:00:00.000");
  assert.equal(formatTime(3723456), "1:02:03.456");
  assert.equal(formatTime(-1500), "-00:01.500");
  assert.equal(formatTime(-3600000), "-1:00:00.000");
  assert.equal(formatTime(1234, { decimals: 2 }), "00:01.23");
  assert.equal(formatTime(1239, { decimals: 1 }), "00:01.2");
  assert.equal(formatTime(1999, { decimals: 0 }), "00:01");
  assert.equal(formatTime(45000, { forceHours: true }), "0:00:45.000");
  assert.equal(formatClock(65000), "01:05");
});

test("formatTime yields a placeholder for anything unfinite", () => {
  assert.equal(formatTime(NaN), "--:--.---");
  assert.equal(formatTime(undefined), "--:--.---");
  assert.equal(formatTime(null), "--:--.---");
  assert.equal(formatTime(Infinity), "--:--.---");
  assert.equal(formatTime(NaN, { decimals: 2 }), "--:--.--");
  assert.equal(formatTime(NaN, { decimals: 0 }), "--:--");
  assert.equal(formatTime(NaN, { placeholder: "—" }), "—");
});

test("formatTime never loses ordering across the minute boundary", () => {
  let prev = "";
  for (let ms = 59000; ms <= 61000; ms += 7) {
    const s = formatTime(ms);
    assert.ok(s >= prev, `${s} should sort at or after ${prev}`);
    prev = s;
  }
});

// ---------------------------------------------------------------- delta

test("formatDelta signs, rounds and rolls over a minute", () => {
  assert.equal(formatDelta(0), "0.00");
  assert.equal(formatDelta(4), "0.00", "four milliseconds is not a visible delta at 2dp");
  assert.equal(formatDelta(1230), "+1.23");
  assert.equal(formatDelta(-1234), "-1.23");
  assert.equal(formatDelta(-1235), "-1.24", "deltas round, unlike stage times");
  assert.equal(formatDelta(65400), "+1:05.40");
  assert.equal(formatDelta(-65400), "-1:05.40");
  assert.equal(formatDelta(1234, { decimals: 1 }), "+1.2");
  assert.equal(formatDelta(NaN), "--.--");
});

test("delta state and colour follow the sign, with a deadband at level", () => {
  assert.equal(deltaState(-900), "ahead");
  assert.equal(deltaState(900), "behind");
  assert.equal(deltaState(0), "level");
  assert.equal(deltaState(4), "level");
  assert.equal(deltaState(-4), "level");
  assert.equal(deltaState(6), "behind");
  assert.equal(deltaState(NaN), "none");
  assert.equal(deltaColour(-900), DELTA_COLOURS.ahead);
  assert.equal(deltaColour(900), DELTA_COLOURS.behind);
  assert.equal(deltaColour(0), DELTA_COLOURS.level);
  assert.notEqual(DELTA_COLOURS.ahead, DELTA_COLOURS.behind);
  for (const key of Object.keys(DELTA_COLOURS)) {
    assert.match(DELTA_COLOURS[key], /^#[0-9a-f]{6}$/i);
  }
});

// ---------------------------------------------------------------- units + odometer

test("units convert and label consistently", () => {
  assert.equal(normaliseUnits("MPH"), "mph");
  assert.equal(normaliseUnits("kph"), "kmh");
  assert.equal(normaliseUnits(undefined), "kmh");
  assert.equal(convertSpeed(100, "kmh"), 100);
  assert.ok(Math.abs(convertSpeed(100, "mph") - 62.1371192) < 1e-6);
  assert.equal(convertSpeed(NaN, "mph"), 0);
  assert.equal(unitLabel("mph"), "MPH");
  assert.equal(unitLabel("kmh"), "KM/H");
});

test("speed wheels park on a numeral and never between two", () => {
  const out = [0, 0, 0, 0];
  assert.deepEqual(Array.from(speedWheelDigits(0, 3, out).slice(0, 3)), [0, 0, 0]);
  // Wheel 0 is the units, so the array reads least-significant first.
  assert.deepEqual(Array.from(speedWheelDigits(147, 3, out).slice(0, 3)), [7, 4, 1]);
  assert.deepEqual(Array.from(speedWheelDigits(9.99, 3, out).slice(0, 3)), [9, 0, 0]);
  assert.deepEqual(Array.from(speedWheelDigits(100, 3, out).slice(0, 3)), [0, 0, 1]);
  assert.deepEqual(Array.from(speedWheelDigits(1234, 3, out).slice(0, 3)), [4, 3, 2],
    "the readout wraps rather than overflowing its three cells");
  assert.deepEqual(Array.from(speedWheelDigits(NaN, 3, out).slice(0, 3)), [0, 0, 0]);
  assert.deepEqual(Array.from(speedWheelDigits(-40, 3, out).slice(0, 3)), [0, 0, 0]);

  // The defect this replaced: a rolling odometer is mid-roll at almost every speed a
  // rally car sees, and a wheel stopped between two numerals shows two half-digits
  // clipped by its cell. Every wheel must be an exact integer at every speed.
  for (let v = 0; v < 400; v += 0.017) {
    const o = speedWheelDigits(v, 3, out);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(o[i] >= 0 && o[i] < 10, `wheel ${i} out of range at ${v}: ${o[i]}`);
      assert.equal(o[i], Math.trunc(o[i]), `wheel ${i} is mid-roll at ${v}: ${o[i]}`);
    }
  }

  // It still counts: the units wheel steps once per km/h and carries at ten.
  let steps = 0;
  let prev = speedWheelDigits(0, 3, out)[0];
  for (let v = 0; v <= 30; v += 1) {
    const o = speedWheelDigits(v + 0.5, 3, out);
    if (o[0] !== prev) steps += 1;
    prev = o[0];
  }
  assert.equal(steps, 30, "one step per unit of speed");
  assert.equal(speedWheelDigits(29.9, 3, out)[1], 2);
  assert.equal(speedWheelDigits(30.0, 3, out)[1], 3, "the tens wheel carries exactly at 30");
});

// ---------------------------------------------------------------- rev counter

test("needle angle is monotonic, clamped and NaN-safe", () => {
  const limit = 7500;
  assert.equal(needleAngle(0, limit), DIAL_START_DEG);
  assert.equal(needleAngle(-500, limit), DIAL_START_DEG);
  assert.equal(needleAngle(1e9, limit), DIAL_END_DEG);
  assert.equal(needleAngle(NaN, limit), DIAL_START_DEG);
  assert.equal(needleAngle(5000, NaN) > DIAL_START_DEG, true, "a missing limit falls back, not throws");
  let prev = -Infinity;
  for (let rpm = -1000; rpm <= 12000; rpm += 25) {
    const a = needleAngle(rpm, limit);
    assert.ok(a >= prev - 1e-12, `angle went backwards at ${rpm}`);
    assert.ok(a >= DIAL_START_DEG - 1e-12 && a <= DIAL_END_DEG + 1e-12, `angle escaped the dial at ${rpm}`);
    prev = a;
  }
  // Redline sits inside the dial with visible headroom past it.
  const atLimit = needleAngle(limit, limit);
  assert.ok(atLimit < DIAL_END_DEG && atLimit > DIAL_END_DEG - 25);
});

test("needle carries inertia: it overshoots a little, then settles", () => {
  const s = { angle: DIAL_START_DEG, vel: 0 };
  const target = DIAL_END_DEG;
  const span = target - DIAL_START_DEG;
  let peak = -Infinity;
  for (let i = 0; i < 120; i += 1) {
    stepNeedle(s, target, 1 / 60);
    if (s.angle > peak) peak = s.angle;
  }
  assert.ok(peak > target, "a real needle overshoots");
  assert.ok(peak - target < span * 0.10, `overshoot ${peak - target} is too violent`);
  assert.ok(Math.abs(s.angle - target) < span * 0.005, "needle settles within 2 seconds");
});

test("needle stays finite over ten thousand steps of hostile input", () => {
  const s = { angle: NaN, vel: NaN };
  let seed = 12345;
  for (let i = 0; i < 10000; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const target = DIAL_START_DEG + (seed / 0x7fffffff) * (DIAL_END_DEG - DIAL_START_DEG);
    stepNeedle(s, i % 97 === 0 ? NaN : target, i % 53 === 0 ? NaN : 1 / 60);
    assert.ok(Number.isFinite(s.angle) && Number.isFinite(s.vel), `needle diverged at step ${i}`);
  }
});

test("shift lights walk green, amber, red and flash at the limiter", () => {
  const limit = 8000;
  const out = { lit: 0, count: 0, band: "", flash: false, frac: 0, green: 0, amber: 0 };
  shiftLightState(0, limit, undefined, out);
  assert.equal(out.lit, 0);
  assert.equal(out.band, "off");
  assert.equal(out.flash, false);

  shiftLightState(limit * 0.62, limit, undefined, out);
  assert.equal(out.lit, 0, "nothing lights below the shift window");

  shiftLightState(limit * 0.63, limit, undefined, out);
  assert.equal(out.lit, 1);
  assert.equal(out.band, "green");

  shiftLightState(limit * 0.985, limit, undefined, out);
  assert.equal(out.lit, SHIFT_LIGHT_COUNT, "the whole band is lit at the shift point");
  assert.equal(out.band, "red");
  assert.equal(out.flash, false);

  shiftLightState(limit * 0.996, limit, undefined, out);
  assert.equal(out.flash, true);
  assert.equal(out.band, "limiter");

  // green -> amber -> red, in that order and only that order, as revs rise
  const seen = [];
  let prevLit = -1;
  for (let f = 0.5; f <= 1.0; f += 0.002) {
    shiftLightState(limit * f, limit, undefined, out);
    assert.ok(out.lit >= prevLit, `lit count fell at ${f}`);
    assert.ok(out.lit >= 0 && out.lit <= SHIFT_LIGHT_COUNT);
    prevLit = out.lit;
    if (out.band !== "limiter" && seen[seen.length - 1] !== out.band) seen.push(out.band);
  }
  assert.deepEqual(seen, ["off", "green", "amber", "red"]);
  assert.equal(out.green + out.amber < SHIFT_LIGHT_COUNT, true, "some lights must remain red");
  assert.equal(shiftLightBand(0, out), "green");
  assert.equal(shiftLightBand(SHIFT_LIGHT_COUNT - 1, out), "red");
});

test("gauge ticks span the dial with labelled majors and a marked redline", () => {
  const ticks = gaugeTicks(7000);
  assert.ok(ticks.length > 8);
  assert.equal(ticks[0].value, 0);
  assert.equal(ticks[0].angle, DIAL_START_DEG);
  const majors = ticks.filter((t) => t.major);
  assert.deepEqual(majors.map((t) => t.label), ["0", "1", "2", "3", "4", "5", "6", "7"]);
  assert.ok(ticks.some((t) => t.redline), "the limiter has to be visible on the face");
  for (let i = 1; i < ticks.length; i += 1) {
    assert.ok(ticks[i].angle >= ticks[i - 1].angle);
    assert.ok(ticks[i].angle <= DIAL_END_DEG + 1e-9);
  }
});

// ---------------------------------------------------------------- arrow glyph

const PATH_TOKEN = /^[MLCZ0-9 .,-]+$/;

function parsePath(d) {
  assert.match(d, PATH_TOKEN, "path data must contain only the commands we emit");
  const tokens = d.trim().split(/[\s,]+/);
  const segs = [];
  let i = 0;
  let cur = null;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M") {
      const x = Number(tokens[i + 1]); const y = Number(tokens[i + 2]);
      assert.ok(Number.isFinite(x) && Number.isFinite(y), "M takes two finite numbers");
      cur = [x, y];
      i += 3;
    } else if (cmd === "L") {
      const x = Number(tokens[i + 1]); const y = Number(tokens[i + 2]);
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      segs.push({ type: "L", from: cur, to: [x, y] });
      cur = [x, y];
      i += 3;
    } else if (cmd === "C") {
      const n = tokens.slice(i + 1, i + 7).map(Number);
      assert.equal(n.length, 6, "C takes six numbers");
      n.forEach((v) => assert.ok(Number.isFinite(v), "C coordinates must be finite"));
      segs.push({ type: "C", from: cur, c1: [n[0], n[1]], c2: [n[2], n[3]], to: [n[4], n[5]] });
      cur = [n[4], n[5]];
      i += 7;
    } else if (cmd === "Z") {
      segs.push({ type: "Z", from: cur });
      i += 1;
    } else {
      throw new Error("unexpected path token: " + cmd);
    }
  }
  assert.ok(segs.length > 0, "a path with no segments draws nothing");
  return segs;
}

function flatten(d, per = 24) {
  const segs = parsePath(d);
  const pts = [segs[0].from];
  for (const s of segs) {
    if (s.type === "Z") continue;
    if (s.type === "L") { pts.push(s.to); continue; }
    for (let k = 1; k <= per; k += 1) {
      const t = k / per;
      const u = 1 - t;
      const x = u * u * u * s.from[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.to[0];
      const y = u * u * u * s.from[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.to[1];
      pts.push([x, y]);
    }
  }
  return pts;
}

// Total turning angle and arc length of the flattened spine; their ratio is the mean
// curvature actually drawn, and the turn alone is scale-invariant.
function measure(pts) {
  let length = 0;
  let turn = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    length += Math.hypot(dx, dy);
    if (i > 1) {
      const px = pts[i - 1][0] - pts[i - 2][0];
      const py = pts[i - 1][1] - pts[i - 2][1];
      const cross = px * dy - py * dx;
      const dot = px * dx + py * dy;
      turn += Math.atan2(cross, dot);
    }
  }
  return { length, turn: Math.abs(turn), curvature: length > 0 ? Math.abs(turn) / length : 0 };
}

function bbox(pts) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

test("arrow paths are valid SVG and stay inside the glyph viewBox", () => {
  for (const dir of [-1, 1]) {
    for (let sev = 1; sev <= 6; sev += 0.5) {
      const spine = arrowPathForSeverity(sev, dir);
      const head = arrowHeadPath(sev, dir);
      const all = flatten(spine).concat(flatten(head));
      const b = bbox(all);
      assert.ok(b.minX >= -0.01 && b.maxX <= ARROW_VIEW + 0.01,
        `severity ${sev} dir ${dir} escapes horizontally: ${b.minX}..${b.maxX}`);
      assert.ok(b.minY >= -0.01 && b.maxY <= ARROW_VIEW + 0.01,
        `severity ${sev} dir ${dir} escapes vertically: ${b.minY}..${b.maxY}`);
      assert.ok(head.trim().endsWith("Z"), "the head is a closed triangle");
    }
  }
});

test("arrow curvature is strictly monotonic in severity", () => {
  let prevTurn = Infinity;
  let prevCurv = Infinity;
  let prevIntrinsic = Infinity;
  for (let sev = 1; sev <= 6; sev += 0.25) {
    const m = measure(flatten(arrowPathForSeverity(sev, 1), 40));
    assert.ok(m.turn < prevTurn - 1e-6, `turn angle did not fall at severity ${sev}`);
    assert.ok(m.curvature < prevCurv - 1e-9, `drawn curvature did not fall at severity ${sev}`);
    assert.ok(arrowCurvature(sev) < prevIntrinsic - 1e-9, `intrinsic curvature did not fall at severity ${sev}`);
    prevTurn = m.turn;
    prevCurv = m.curvature;
    prevIntrinsic = arrowCurvature(sev);
  }
  // The drawn shape has to match the number: a 1 is a hairpin, a 6 is nearly straight.
  const one = measure(flatten(arrowPathForSeverity(1, 1), 40));
  const six = measure(flatten(arrowPathForSeverity(6, 1), 40));
  assert.ok(one.turn > 2.4 && one.turn < 2.8, `severity 1 should turn ~150 degrees, got ${one.turn}`);
  assert.ok(six.turn < 0.36, `severity 6 should barely deviate, got ${six.turn}`);
  // An inscribed polyline loses one segment's worth of turn at the ends, so the
  // tolerance is a hair over the flattening step, not zero.
  assert.ok(Math.abs(one.turn - arrowTurnAngle(1)) < 0.05, "the drawn arc matches the modelled arc");
  assert.ok(Math.abs(six.turn - arrowTurnAngle(6)) < 0.05);
});

test("arrow direction actually reverses", () => {
  const right = flatten(arrowPathForSeverity(3, "R"));
  const left = flatten(arrowPathForSeverity(3, "left"));
  assert.ok(right[right.length - 1][0] > right[0][0], "a right-hander must finish to the right");
  assert.ok(left[left.length - 1][0] < left[0][0], "a left-hander must finish to the left");
  // Mirror symmetry about the viewBox centre.
  assert.ok(Math.abs((right[0][0] + left[0][0]) - ARROW_VIEW) < 0.05);
  assert.equal(normaliseDirection("L"), -1);
  assert.equal(normaliseDirection("Right"), 1);
  assert.equal(normaliseDirection(-3), -1);
  assert.equal(normaliseDirection(undefined), 1);
  assert.equal(directionLabel(-1), "LEFT");
  assert.equal(directionLabel(1), "RIGHT");
  // Every arrow and label helper re-normalises whatever it is handed, so the mapping
  // has to survive its own output. It did not when the pacenote sign was reconciled
  // here instead of at the point the note is read, and the arrow ended up pointing
  // the opposite way to the word printed beside it.
  for (const d of [-1, 1, "L", "right"]) {
    assert.equal(normaliseDirection(normaliseDirection(d)), normaliseDirection(d),
      `normaliseDirection(${JSON.stringify(d)}) must be idempotent`);
    assert.equal(directionLabel(normaliseDirection(d)), directionLabel(d));
  }
});

// pacenotes.js signs `dir` like stage.js signs curvature — POSITIVE turns LEFT — and
// the HUD drew straight from that number into a glyph whose own +x is screen-right, so
// the panel called every corner the wrong way round.
test("a corner's numeric direction survives the trip from pacenotes.js to the glyph", () => {
  const left = normalisePacenote({ kind: "corner", severity: 3, dir: 1 });
  const right = normalisePacenote({ kind: "corner", severity: 3, dir: -1 });
  assert.equal(directionLabel(left.dir), "LEFT", "pacenotes.js dir +1 is a left-hander");
  assert.equal(directionLabel(right.dir), "RIGHT");

  // The word and the drawn shape must agree — that is the pairing that was broken.
  const lp = flatten(arrowPathForSeverity(left.severity, left.dir));
  const rp = flatten(arrowPathForSeverity(right.severity, right.dir));
  assert.ok(lp[lp.length - 1][0] < lp[0][0], "the LEFT call must draw an arrow going left");
  assert.ok(rp[rp.length - 1][0] > rp[0][0], "the RIGHT call must draw an arrow going right");

  // Words are not reconciled, only numbers: a note that spells it out is taken at its word.
  assert.equal(normalisePacenote({ severity: 3, dir: "left" }).dir, left.dir);
  assert.equal(normalisePacenote({ severity: 3, dir: "right" }).dir, right.dir);
});

// The runner hands the HUD its cursor, not a note. Reading the cursor as a note found
// no severity and no kind, so every call in the game fell through to "STRAIGHT".
test("the pacenote runner's cursor is unwrapped, not read as a note", () => {
  const note = { kind: "corner", severity: 2, dir: -1, s: 1180, mods: ["tightens"] };
  const cursor = { index: 4, note, text: "into two right, tightens", lead: 60, startS: 1120 };
  const o = normalisePacenote(cursor);
  assert.equal(o.severity, 2);
  assert.equal(o.kind, "corner");
  assert.equal(o.isTurn, true);
  assert.equal(o.s, 1180, "the note's arc length, not the cursor's startS");
  assert.equal(directionLabel(o.dir), "RIGHT");
  assert.deepEqual(o.mods, ["TIGHTENS"]);
  assert.equal(o.key, normalisePacenote(note).key, "a cursor and its note read identically");

  // A cursor between calls carries a null note, and must read as nothing at all
  // rather than as a straight — that is what let a real call be promoted past it.
  const idle = normalisePacenote({ index: -1, note: null, text: "" });
  assert.equal(idle.kind, "none");
  assert.equal(idle.isTurn, false);
  assert.equal(idle.severity, 0);
});

test("out-of-range severity clamps rather than producing garbage geometry", () => {
  for (const sev of [-10, 0, 0.5, 6.5, 99, NaN, undefined, null]) {
    const d = arrowPathForSeverity(sev, 1);
    const pts = flatten(d);
    const b = bbox(pts);
    assert.ok(b.minX >= -0.01 && b.maxX <= ARROW_VIEW + 0.01, `severity ${sev} escaped the box`);
    assert.ok(Number.isFinite(measure(pts).curvature));
  }
});

// ---------------------------------------------------------------- pacenotes

test("pacenote normalisation survives whatever field names arrive", () => {
  const a = normalisePacenote({ severity: 4, dir: "L", mods: ["tightens", { text: "don't cut" }], s: 1200 });
  assert.equal(a.severity, 4);
  assert.equal(a.dir, -1);
  assert.equal(a.isTurn, true);
  assert.deepEqual(a.mods, ["TIGHTENS", "DON'T CUT"]);
  assert.equal(a.s, 1200);

  const b = normalisePacenote({ grade: 2, direction: "right", modifiers: ["over crest"], kind: "turn" });
  assert.equal(b.severity, 2);
  assert.equal(b.dir, 1);

  const c = normalisePacenote({ kind: "crest", severity: 0 });
  assert.equal(c.isTurn, false);

  const empty = normalisePacenote(null);
  assert.equal(empty.kind, "none");
  assert.equal(empty.severity, 0);
  assert.deepEqual(empty.mods, []);

  assert.equal(normalisePacenote({ severity: 99 }).severity, 6, "severity clamps to the call system");
  assert.equal(normalisePacenote({ severity: NaN }).severity, 0);

  // pacenotes.js stamps `severity: 0` on every note that is not a corner — crests,
  // jumps, straights, the finish. Clamping that up into the 1..6 call system printed
  // a "1", the tightest call in the book, over a long straight.
  assert.equal(normalisePacenote({ kind: "straight", severity: 0 }).severity, 0);
  assert.equal(normalisePacenote({ kind: "crest", severity: 0 }).severity, 0);
  assert.equal(normalisePacenote({ severity: -4 }).severity, 0, "a nonsense severity is no call, not a hairpin");
  assert.equal(normalisePacenote({ kind: "corner", severity: 1 }).severity, 1, "a real hairpin still reads 1");

  // Identical notes hash the same, different ones do not: the key drives the animation.
  assert.equal(normalisePacenote({ severity: 3, dir: "L", s: 10 }).key,
    normalisePacenote({ severity: 3, dir: "L", s: 10 }).key);
  assert.notEqual(normalisePacenote({ severity: 3, dir: "L", s: 10 }).key,
    normalisePacenote({ severity: 3, dir: "R", s: 10 }).key);
});

test("pacenote normalisation writes into a caller-owned object", () => {
  const out = normalisePacenote(null);
  const same = normalisePacenote({ severity: 5, dir: "R" }, out);
  assert.equal(same, out, "no allocation per frame");
  const modsRef = out.mods;
  normalisePacenote({ severity: 2, mods: ["a"] }, out);
  assert.equal(out.mods, modsRef, "the mods array is reused too");
  assert.deepEqual(out.mods, ["A"]);
});

// ---------------------------------------------------------------- route ribbon

function makeStage(kind, n = 400) {
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    if (kind === "straightNS") { x[i] = 100; z[i] = t * 4000; }
    else if (kind === "straightEW") { x[i] = t * 4000; z[i] = -230; }
    else if (kind === "circle") { x[i] = Math.cos(t * Math.PI * 2) * 900; z[i] = Math.sin(t * Math.PI * 2) * 900; }
    else if (kind === "hairpin") { x[i] = Math.sin(t * Math.PI) * 300; z[i] = t < 0.5 ? t * 2000 : (1 - t) * 2000; }
    else if (kind === "point") { x[i] = 5; z[i] = -7; }
    else if (kind === "huge") { x[i] = t * 1e7 - 5e6; z[i] = Math.sin(t * 9) * 1e6; }
    else if (kind === "tiny") { x[i] = t * 1e-6; z[i] = t * 1e-7; }
    else if (kind === "nan") { x[i] = i % 7 === 0 ? NaN : t * 1000; z[i] = i % 11 === 0 ? Infinity : Math.sin(t * 5) * 400; }
    else { x[i] = Math.sin(t * 7) * 800 + t * 3000; z[i] = Math.cos(t * 4) * 600; }
  }
  return { x, z, count: n, length: 4000, splits: [1300, 2700] };
}

const RIBBON_SHAPES = ["straightNS", "straightEW", "circle", "hairpin", "point", "huge", "tiny", "nan", "wiggle"];

test("route ribbon stays inside its viewBox for every stage shape", () => {
  const opts = { width: 320, height: 74, pad: 9 };
  for (const kind of RIBBON_SHAPES) {
    const layout = routeRibbonLayout(makeStage(kind), opts);
    assert.equal(layout.empty, false, `${kind} produced no ribbon`);
    assert.ok(layout.xs.length > 1, `${kind} produced too few points`);
    for (let i = 0; i < layout.xs.length; i += 1) {
      const x = layout.xs[i];
      const y = layout.ys[i];
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${kind} produced a non-finite point`);
      assert.ok(x >= opts.pad - 1e-6 && x <= opts.width - opts.pad + 1e-6, `${kind} x=${x} left the box`);
      assert.ok(y >= opts.pad - 1e-6 && y <= opts.height - opts.pad + 1e-6, `${kind} y=${y} left the box`);
    }
    const pts = flatten(routeRibbonPath(makeStage(kind), opts));
    const b = bbox(pts);
    assert.ok(b.minX >= opts.pad - 1e-6 && b.maxX <= opts.width - opts.pad + 1e-6, `${kind} path escaped in x`);
    assert.ok(b.minY >= opts.pad - 1e-6 && b.maxY <= opts.height - opts.pad + 1e-6, `${kind} path escaped in y`);
  }
});

test("route ribbon keeps the stage's aspect ratio", () => {
  // A north-south straight must draw as a vertical line, not be stretched sideways.
  const ns = routeRibbonLayout(makeStage("straightNS"), { width: 320, height: 74, pad: 9 });
  const b1 = bbox(ns.xs.map((x, i) => [x, ns.ys[i]]));
  assert.ok(b1.maxX - b1.minX < 0.001, "a straight north-south stage has no width");
  assert.ok(b1.maxY - b1.minY > 50, "and should fill the ribbon's height");

  const ew = routeRibbonLayout(makeStage("straightEW"), { width: 320, height: 74, pad: 9 });
  const b2 = bbox(ew.xs.map((x, i) => [x, ew.ys[i]]));
  assert.ok(b2.maxY - b2.minY < 0.001);
  assert.ok(b2.maxX - b2.minX > 290);

  // A circle must stay a circle: equal extents in both axes.
  const c = routeRibbonLayout(makeStage("circle"), { width: 320, height: 74, pad: 9 });
  const b3 = bbox(c.xs.map((x, i) => [x, c.ys[i]]));
  assert.ok(Math.abs((b3.maxX - b3.minX) - (b3.maxY - b3.minY)) < 0.5);
});

test("empty and malformed stages degrade instead of throwing", () => {
  for (const bad of [null, undefined, {}, [], { x: [], z: [] }, { points: [] },
    { x: new Float32Array([NaN, NaN]), z: new Float32Array([NaN, NaN]), count: 2 }]) {
    const layout = routeRibbonLayout(bad);
    assert.equal(layout.empty, true);
    assert.equal(layout.d, "");
    assert.equal(routeRibbonPath(bad), "");
    const p = ribbonPointAtFraction(layout, 0.5);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.equal(ribbonLengthAtFraction(layout, 0.5), 0);
  }
  // A plain array of points is accepted too.
  const fromList = routeRibbonLayout([{ x: 0, z: 0 }, { x: 100, z: 50 }, { x: 200, z: 0 }]);
  assert.equal(fromList.empty, false);
  assert.equal(fromList.xs.length, 3);
});

test("the car marker walks the ribbon monotonically from start to finish", () => {
  const layout = routeRibbonLayout(makeStage("wiggle"), { width: 320, height: 74, pad: 9 });
  const first = ribbonPointAtFraction(layout, 0);
  assert.ok(Math.abs(first.x - layout.xs[0]) < 1e-9 && Math.abs(first.y - layout.ys[0]) < 1e-9);
  const last = ribbonPointAtFraction(layout, 1);
  assert.ok(Math.abs(last.x - layout.xs[layout.xs.length - 1]) < 1e-9);
  const clampedLow = ribbonPointAtFraction(layout, -5);
  assert.ok(Math.abs(clampedLow.x - layout.xs[0]) < 1e-9);
  const clampedHigh = ribbonPointAtFraction(layout, 9);
  assert.ok(Math.abs(clampedHigh.x - layout.xs[layout.xs.length - 1]) < 1e-9);
  let prev = -1;
  for (let t = 0; t <= 1; t += 0.01) {
    const len = ribbonLengthAtFraction(layout, t);
    assert.ok(len >= prev - 1e-9, "progress along the ribbon cannot go backwards");
    assert.ok(len <= layout.length + 1e-6);
    prev = len;
  }
  assert.ok(Number.isFinite(layout.length) && layout.length > 0);
});

// ---------------------------------------------------------------- damage

test("damage tint ramps monotonically and never allocates a new string", () => {
  assert.equal(damageTintIndex(0), 0);
  assert.equal(damageTintIndex(1), 24);
  assert.equal(damageTintIndex(NaN), 0);
  assert.equal(damageTintIndex(-3), 0);
  assert.equal(damageTintIndex(50), 24);
  assert.equal(damageTint(0.5), damageTint(0.5), "same value, same interned string");
  assert.equal(damageTint(0), damageTint(0));
  assert.notEqual(damageTint(0), damageTint(1));
  let prev = -1;
  for (let v = 0; v <= 1.0001; v += 0.01) {
    const i = damageTintIndex(v);
    assert.ok(i >= prev, "tint index must not fall as damage rises");
    prev = i;
    assert.match(damageTint(v), /^hsl\(\d+ \d+% \d+%\)$/);
  }
  // Undamaged reads cold, destroyed reads red.
  const hueOf = (s) => Number(s.slice(4, s.indexOf(" ")));
  assert.ok(hueOf(damageTint(0)) > 150);
  assert.ok(hueOf(damageTint(1)) < 10);
});

test("damage report normalises rows, maps, health and damage alike", () => {
  const out = normaliseDamageRows([
    { key: "engine", damage: 0.4 },
    { key: "gearbox", health: 0.25 },
    { component: "Suspension Front", value: 0.6 },
    { name: "front", damage: 0.1 },
    { id: "wheels", damage: 0.9 },
    { id: "unknown-thing", damage: 1 },
  ]);
  const at = (slot) => out.values[DAMAGE_SLOTS.indexOf(slot)];
  assert.ok(Math.abs(at("engine") - 0.4) < 1e-6);
  assert.ok(Math.abs(at("gearbox") - 0.75) < 1e-6, "health inverts into damage");
  assert.ok(Math.abs(at("suspension") - 0.6) < 1e-6);
  assert.ok(Math.abs(at("bodyFront") - 0.1) < 1e-6);
  assert.equal(out.puncture, true, "a 0.9 wheel is a puncture");
  assert.equal(out.worstSlot, "wheels");
  assert.ok(Math.abs(out.worst - 0.9) < 1e-6);
  assert.equal(out.terminal, false);

  const map = normaliseDamageRows({ engine: 0.2, radiator: 0.8, rear: 0.5 });
  assert.equal(map.overheating, true, "a cooked radiator is an overheat warning");
  assert.ok(Math.abs(map.values[DAMAGE_SLOTS.indexOf("bodyRear")] - 0.5) < 1e-6);

  const term = normaliseDamageRows([{ key: "engine", damage: 1 }]);
  assert.equal(term.terminal, true);

  const pct = normaliseDamageRows([{ key: "engine", damage: 40 }]);
  assert.ok(Math.abs(pct.values[DAMAGE_SLOTS.indexOf("engine")] - 0.4) < 1e-6, "a percentage is understood");

  for (const bad of [null, undefined, 5, "x", [], {}, { rows: [] }, [null, undefined, 3]]) {
    const o = normaliseDamageRows(bad);
    assert.equal(o.worst, 0);
    for (let i = 0; i < o.values.length; i += 1) assert.equal(o.values[i], 0);
  }
});

test("damage normalisation reuses its output buffer", () => {
  const a = normaliseDamageRows({ engine: 0.5 });
  const buf = a.values;
  const b = normaliseDamageRows({ engine: 0.1 }, a);
  assert.equal(b, a);
  assert.equal(b.values, buf);
  assert.ok(Math.abs(b.values[DAMAGE_SLOTS.indexOf("engine")] - 0.1) < 1e-6, "stale values are cleared");
});

// ---------------------------------------------------------------- DOM stub

const NOOP_CTX_METHODS = [
  "clearRect", "save", "restore", "translate", "rotate", "scale", "beginPath", "arc",
  "moveTo", "lineTo", "closePath", "stroke", "fill", "fillText", "drawImage", "setTransform",
];

function makeStubDocument() {
  let created = 0;
  const stats = { attrs: 0, text: 0, styles: 0, classes: 0 };

  class StubClassList {
    constructor(node) { this.node = node; this.set = new Set(); }
    add(...cls) { stats.classes += 1; cls.forEach((c) => { if (c) this.set.add(c); }); this.sync(); }
    remove(...cls) { stats.classes += 1; cls.forEach((c) => this.set.delete(c)); this.sync(); }
    contains(c) { return this.set.has(c); }
    toggle(c, on) { if (on === undefined ? this.set.has(c) : !on) this.set.delete(c); else this.set.add(c); this.sync(); }
    sync() { this.node._class = Array.from(this.set).join(" "); }
  }

  class StubStyle {
    setProperty(name, value) { this[name] = value; }
    getPropertyValue(name) { return this[name] === undefined ? "" : String(this[name]); }
    removeProperty(name) { delete this[name]; }
  }

  class StubNode {
    constructor(tag, ns) {
      created += 1;
      this.tagName = String(tag).toUpperCase();
      this.namespaceURI = ns || null;
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = Object.create(null);
      // Proxied so the "a settled HUD writes nothing" claim can actually be counted.
      this.style = new Proxy(new StubStyle(), {
        set(target, key, value) { stats.styles += 1; target[key] = value; return true; },
      });
      this.classList = new StubClassList(this);
      this._class = "";
      this._text = "";
      if (this.tagName === "CANVAS") {
        this.width = 0;
        this.height = 0;
        this._ctx = makeStubContext();
      }
    }
    get className() { return this._class; }
    set className(v) {
      this._class = String(v);
      this.classList.set = new Set(this._class.split(/\s+/).filter(Boolean));
    }
    get textContent() { return this._text; }
    set textContent(v) {
      stats.text += 1;
      this._text = String(v);
      this.childNodes.forEach((c) => { c.parentNode = null; });
      this.childNodes.length = 0;
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i >= 0) this.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(name, value) {
      stats.attrs += 1;
      this.attributes[name] = String(value);
      if (name === "class") this.className = value;
    }
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
    getContext() { return this._ctx || null; }
    querySelector(sel) {
      const found = [];
      collect(this, sel, found, 1);
      return found[0] || null;
    }
    querySelectorAll(sel) {
      const found = [];
      collect(this, sel, found, Infinity);
      return found;
    }
  }

  function matches(node, sel) {
    if (sel.startsWith(".")) return node.classList.contains(sel.slice(1));
    return node.tagName === sel.toUpperCase();
  }

  function collect(node, sel, out, limit) {
    for (const child of node.childNodes) {
      if (out.length >= limit) return;
      if (matches(child, sel)) out.push(child);
      collect(child, sel, out, limit);
    }
  }

  function makeStubContext() {
    const ctx = { canvas: null, calls: 0 };
    for (const m of NOOP_CTX_METHODS) ctx[m] = function noop() { ctx.calls += 1; };
    return ctx;
  }

  const doc = {
    createElement: (tag) => new StubNode(tag, null),
    createElementNS: (ns, tag) => new StubNode(tag, ns),
    get created() { return created; },
    stats,
  };
  return doc;
}

function countNodes(node) {
  let n = 1;
  for (const c of node.childNodes) n += countNodes(c);
  return n;
}

function makeRoot(doc) {
  return doc.createElement("div");
}

// A tiny deterministic generator; Math.random() is banned across this codebase.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("createHud builds a complete instrument set", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  for (const sel of [".orh", ".orh-note", ".orh-note-arrow", ".orh-arrow-spine", ".orh-note-sev",
    ".orh-note-bar", ".orh-queue", ".orh-stage", ".orh-time", ".orh-delta", ".orh-ribbon",
    ".orh-carmark", ".orh-shift", ".orh-led", ".orh-dial", ".orh-tacho", ".orh-gear",
    ".orh-odo", ".orh-digit", ".orh-unit", ".orh-boost", ".orh-grip", ".orh-carsvg",
    ".orh-warn", ".orh-temp", ".orh-telemetry", ".orh-trace", ".orh-lights", ".orh-lamp",
    ".orh-count", ".orh-finish", ".orh-toasts"]) {
    assert.ok(root.querySelector(sel), `missing ${sel}`);
  }
  assert.equal(root.querySelectorAll(".orh-led").length, SHIFT_LIGHT_COUNT);
  assert.equal(root.querySelectorAll(".orh-lamp").length, 5);
  assert.equal(root.querySelectorAll(".orh-digit").length, 3);
  const style = root.childNodes.find((n) => n.tagName === "STYLE");
  assert.ok(style && style.textContent.includes(".orh"), "the module ships its own scoped stylesheet");
  assert.ok(!/(^|[^-\w.]):root|(^|\s)body\s*\{/.test(style.textContent),
    "styles must not reach outside the HUD root");
  hud.destroy();
});

test("the HUD leaves the top-left back-pill rectangle clear", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const style = root.childNodes.find((n) => n.tagName === "STYLE").textContent;
  // Nothing in the HUD takes pointer events at all, and the top rail is inset past
  // the 109x41 pill, so no control can be swallowed by it.
  assert.match(style, /\.orh\s*\{[^}]*pointer-events:\s*none/);
  assert.match(style, /--orh-pill:\s*118px/);
  assert.match(style, /padding:[^;]*var\(--orh-pill\)/);
  assert.match(style, /env\(safe-area-inset-top\)/);
  assert.match(style, /env\(safe-area-inset-bottom\)/);
  assert.match(style, /prefers-reduced-motion/);
  hud.destroy();
});

// Read one @media block out of the stylesheet by its condition, brace-matched.
function mediaBlock(css, condition) {
  const at = css.indexOf("@media " + condition);
  assert.notEqual(at, -1, `no @media block for ${condition}`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") { depth -= 1; if (depth === 0) return css.slice(open + 1, i); }
  }
  throw new Error("unterminated @media block");
}

// A phone in portrait needs a different instrument set, not the landscape one at a
// smaller size. The breakpoint used to carry nothing but a smaller `.orh-digit`, and
// the panels ate a third of the screen with the tacho painting across the readout.
// The HUD and the driving controls are separate roots with separate
// stylesheets, so neither can measure the other and the collision is invisible
// to both. Measured in Chrome before this existed: the portrait slider covered
// 81% of the speed and gear cluster, and in landscape the pedals and handbrake
// covered 63% of it. A speed you cannot read is a pacenote you cannot use.
test("the bottom rail steps out of whatever the driving controls took", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const el = root.querySelector(".orh");
  const css = root.childNodes.find((n) => n.tagName === "STYLE").textContent;

  // Declared on the root and consumed by the two blocks that live in the rail,
  // so a HUD nobody tells anything to is exactly where it always was.
  assert.match(css, /--orh-ctrl-left:\s*0px/);
  assert.match(css, /--orh-ctrl-right:\s*0px/);
  assert.match(css, /--orh-ctrl-side:\s*0px/);
  assert.match(css, /\.orh-cluster\s*\{[^}]*margin-bottom:\s*var\(--orh-ctrl-right\)/);
  assert.match(css, /\.orh-cluster\s*\{[^}]*margin-right:\s*var\(--orh-ctrl-side\)/);
  assert.match(css, /\.orh-left\s*\{[^}]*margin-bottom:\s*var\(--orh-ctrl-left\)/);
  assert.deepEqual(hud.controlReserve, { leftBottom: 0, rightBottom: 0, rightSide: 0 });

  hud.setControlReserve({ leftBottom: 78, rightBottom: 293, rightSide: 0 });
  assert.equal(el.style.getPropertyValue("--orh-ctrl-left"), "78px", "portrait lifts the damage panel");
  assert.equal(el.style.getPropertyValue("--orh-ctrl-right"), "293px", "and lifts the cluster over the pedals");
  assert.equal(el.style.getPropertyValue("--orh-ctrl-side"), "0px", "with nothing taken off the side");

  hud.setControlReserve({ leftBottom: 78, rightBottom: 78, rightSide: 198 });
  assert.equal(el.style.getPropertyValue("--orh-ctrl-side"), "198px",
    "landscape slides the cluster left of the column instead, because there is no room above it");

  // Handing it back matters as much as setting it: a player who plugs in a pad
  // mid-session must not be left with a speedo halfway up the screen.
  hud.setControlReserve(null);
  assert.equal(el.style.getPropertyValue("--orh-ctrl-right"), "0px");
  assert.equal(el.style.getPropertyValue("--orh-ctrl-side"), "0px");
  assert.deepEqual(hud.controlReserve, { leftBottom: 0, rightBottom: 0, rightSide: 0 });

  hud.setControlReserve({ leftBottom: NaN, rightBottom: -40, rightSide: "wide" });
  assert.equal(el.style.getPropertyValue("--orh-ctrl-left"), "0px", "a bad number is nothing, never NaNpx");
  assert.equal(el.style.getPropertyValue("--orh-ctrl-right"), "0px", "a negative reserve is nothing");
  assert.equal(el.style.getPropertyValue("--orh-ctrl-side"), "0px");
  hud.destroy();
});

test("the portrait breakpoint restructures the HUD rather than shrinking a digit", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const css = root.childNodes.find((n) => n.tagName === "STYLE").textContent;
  const portrait = mediaBlock(css, "(orientation: portrait) and (max-width: 620px)");

  // The call collapses to a bar: body on one line, no wrapping chip row.
  assert.match(portrait, /\.orh-note-body \{[^}]*flex-direction: row/);
  assert.match(portrait, /\.orh-note-mods \{ display: none/);
  // The clock sits beside it rather than under it, so the top rail stays a rail.
  assert.match(portrait, /\.orh-note \{[^}]*flex: 1 1 auto/);
  assert.match(portrait, /\.orh-stage \{[^}]*flex: 0 0 auto/);
  assert.doesNotMatch(portrait, /\.orh-top \{[^}]*flex-direction: column/,
    "stacking the call above the clock is what ate the top third");
  // The dial face goes; the shift strip is the rev counter at this size.
  assert.match(portrait, /\.orh-tacho \{ display: none/);
  assert.match(portrait, /\.orh-gear \{ position: static/,
    "the gear must leave the dial's absolute frame or it goes with the face");
  // Speed, boost, gear and shift lights become one block with one edge round it.
  assert.match(portrait, /\.orh-cluster \{[^}]*background: var\(--orh-glass\)/);
  assert.match(portrait, /\.orh-readout, \.orh-dialwrap \{[^}]*border: none/);
  // And the car diagram only appears once it has something to say.
  assert.match(portrait, /\.orh-damage \{ display: none/);

  // Whatever else changes, the top rail must still start clear of the back pill,
  // which owns 0,0 109x41 and swallows any tap that lands on it.
  assert.match(portrait, /\.orh-top \{[^}]*padding-top: calc\(48px/);

  // The tacho is the only instrument that used to sit on the bare scene.
  assert.ok(root.querySelector(".orh-dialwrap").classList.contains("orh-panel"),
    "the rev counter gets the same glass as every other panel");
  hud.destroy();
});

test("ten thousand frames leave the node count untouched and never throw", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  let t = 0;
  const hud = createHud(root, { document: doc, now: () => t, stage: makeStage("wiggle") });

  const notes = [
    { severity: 4, dir: "R", mods: ["tightens"], s: 400 },
    { severity: 1, dir: "L", mods: ["don't cut", "care"], s: 900 },
    { kind: "crest", severity: 0, s: 1400 },
    { severity: 6, dir: "R", s: 2200 },
    null,
  ];

  const frame = {};
  hud.update(frame);
  const baseline = countNodes(root);
  assert.ok(baseline > 60, "the HUD should be a real instrument set, not a stub");

  const rand = lcg(97);
  for (let i = 0; i < 10000; i += 1) {
    t += 16.6;
    frame.dt = 1 / 60;
    frame.speedKph = rand() * 200;
    frame.rpm = rand() * 9000;
    frame.rpmLimit = i % 2500 === 0 ? 7000 + Math.floor(rand() * 2000) : 7800;
    frame.gear = Math.floor(rand() * 8) - 1;
    frame.turbo = rand();
    frame.throttle = rand();
    frame.brake = rand();
    frame.steer = rand() * 2 - 1;
    frame.gripUsed = rand() * 1.2;
    frame.distance = (i / 10000) * 4000;
    frame.stageLength = 4000;
    frame.timeMs = i * 16.6;
    frame.splitDeltaMs = (rand() - 0.5) * 4000;
    frame.lastSplitMs = i % 3000 === 0 ? i * 16.6 : frame.lastSplitMs;
    frame.positionPct = i / 10000;
    frame.surfaceName = i % 400 < 200 ? "Gravel" : "Tarmac";
    frame.pacenote = notes[Math.floor(i / 500) % notes.length];
    frame.nextPacenote = notes[(Math.floor(i / 500) + 1) % notes.length];
    frame.damage = [
      { key: "engine", damage: rand() },
      { key: "wheels", damage: rand() },
      { key: "bodyFront", damage: rand() },
      { key: "cooling", damage: rand() },
    ];
    frame.telemetry = { waterTempC: 60 + rand() * 70 };
    hud.update(frame);
    if (i % 2000 === 0) assert.equal(countNodes(root), baseline, `node count drifted by frame ${i}`);
  }
  assert.equal(countNodes(root), baseline, "update() must never add or drop a node");

  // The instruments actually moved.
  assert.notEqual(root.querySelector(".orh-time").textContent, "");
  assert.notEqual(root.querySelector(".orh-gear").textContent, "");
  frame.pacenote = notes[0];
  hud.update(frame);
  assert.match(root.querySelector(".orh-arrow-spine").getAttribute("d") || "", /^M /);
  assert.equal(countNodes(root), baseline, "the final call must not have grown the tree either");

  hud.destroy();
  assert.equal(root.childNodes.length, 0, "destroy() takes the HUD and its styles with it");
});

test("a settled HUD performs no DOM writes at all", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  let t = 0;
  const hud = createHud(root, { document: doc, now: () => t, stage: makeStage("wiggle") });
  const frame = {
    dt: 1 / 60, speedKph: 87, rpm: 5200, rpmLimit: 7800, gear: 3, turbo: 0.4,
    throttle: 1, brake: 0, steer: 0.1, gripUsed: 0.5, distance: 1000, stageLength: 4000,
    timeMs: 61234, splitDeltaMs: -1200, lastSplitMs: 30000, positionPct: 0.25,
    surfaceName: "Gravel", pacenote: { severity: 4, dir: "R", s: 1200 },
    damage: { engine: 0.2 }, telemetry: { waterTempC: 92 },
  };
  for (let i = 0; i < 600; i += 1) { t += 16.6; hud.update(frame); }
  const before = { ...doc.stats };
  for (let i = 0; i < 600; i += 1) { t += 16.6; hud.update(frame); }
  assert.deepEqual(doc.stats, before,
    "an unchanging frame must not touch text, attributes, styles or classes");

  // ...and a changing one must.
  frame.speedKph = 120;
  frame.rpm = 6900;
  hud.update(frame);
  assert.ok(doc.stats.styles > before.styles, "a real change still reaches the DOM");
  hud.destroy();
});

test("update survives missing, NaN and hostile frame fields", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const before = countNodes(root);

  const hostile = [
    undefined, null, {}, { speedKph: NaN, rpm: NaN, rpmLimit: 0, gear: NaN },
    { rpm: -Infinity, rpmLimit: -5, turbo: NaN, gripUsed: NaN },
    { timeMs: NaN, splitDeltaMs: NaN, distance: NaN, stageLength: NaN, positionPct: NaN },
    { pacenote: "not an object", nextPacenote: 42 },
    { pacenote: { severity: "four", dir: {} } },
    { damage: "broken" }, { damage: [null, 7, { key: null }] },
    { telemetry: null }, { telemetry: { waterTempC: NaN } },
    { surfaceName: null, gear: -3, speedKph: -50 },
    { rpm: 1e12, rpmLimit: 1e-9, dt: -1 },
    { dt: 1e9, speedKph: Infinity },
  ];
  for (const f of hostile) {
    assert.doesNotThrow(() => hud.update(f), "frame " + JSON.stringify(f) + " threw");
  }
  assert.equal(countNodes(root), before, "hostile frames must not mutate the tree shape");
  // Nothing NaN leaked into a style string.
  const walk = (n) => {
    for (const key of Object.keys(n.style)) {
      const v = n.style[key];
      if (typeof v === "string") assert.ok(!/NaN|Infinity|undefined/.test(v), `bad style ${key}=${v}`);
    }
    for (const key of Object.keys(n.attributes)) {
      assert.ok(!/NaN|Infinity/.test(n.attributes[key]), `bad attribute ${key}=${n.attributes[key]}`);
    }
    n.childNodes.forEach(walk);
  };
  walk(root);
  hud.destroy();
});

test("units, scale, contrast, reduced motion and telemetry all take effect", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  let t = 0;
  const hud = createHud(root, { document: doc, now: () => t });
  const el = root.querySelector(".orh");

  hud.update({ speedKph: 100, rpm: 4000, rpmLimit: 7500 });
  assert.equal(root.querySelector(".orh-unit").textContent, "KM/H");
  const kmhStrip = root.querySelector(".orh-digit").childNodes[0].style.transform;

  hud.setUnits("mph");
  hud.update({ speedKph: 100, rpm: 4000, rpmLimit: 7500 });
  assert.equal(root.querySelector(".orh-unit").textContent, "MPH");
  assert.notEqual(root.querySelector(".orh-digit").childNodes[0].style.transform, kmhStrip,
    "switching units must move the odometer");

  assert.equal(hud.setScale(1.4), 1.4);
  assert.equal(el.style.getPropertyValue("--orh-scale"), "1.4");
  assert.equal(hud.setScale(99), 2.2, "scale clamps to something readable");
  assert.equal(hud.setScale(NaN), 1);

  hud.setContrast(true);
  assert.ok(el.classList.contains("hc"));
  hud.setContrast(false);
  assert.ok(!el.classList.contains("hc"));

  hud.setReducedMotion(true);
  assert.ok(el.classList.contains("rm"));
  hud.update({ rpm: 7999, rpmLimit: 7500 });
  assert.ok(!root.querySelector(".orh-shift").classList.contains("limiter"),
    "reduced motion suppresses the limiter strobe");
  hud.setReducedMotion(false);
  hud.update({ rpm: 7999, rpmLimit: 7500 });
  assert.ok(root.querySelector(".orh-shift").classList.contains("limiter"));

  hud.setTelemetry(false);
  assert.ok(!root.querySelector(".orh-telemetry").classList.contains("on"));
  hud.setTelemetry(true);
  assert.ok(root.querySelector(".orh-telemetry").classList.contains("on"));
  hud.destroy();
});

test("countdown, finish and toasts behave and clean up", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  let t = 0;
  const hud = createHud(root, { document: doc, now: () => t });
  const lamps = root.querySelectorAll(".orh-lamp");
  const lights = root.querySelector(".orh-lights");

  hud.countdown(3);
  assert.ok(lights.classList.contains("on"));
  assert.equal(root.querySelector(".orh-count").textContent, "3");
  assert.equal(lamps.filter((l) => l.classList.contains("lit")).length, 3);

  hud.countdown(0);
  assert.equal(root.querySelector(".orh-count").textContent, "GO");
  assert.equal(lamps.filter((l) => l.classList.contains("go")).length, 5);
  assert.equal(lamps.filter((l) => l.classList.contains("lit")).length, 0);

  hud.countdown(null);
  assert.ok(!lights.classList.contains("on"));

  const finish = root.querySelector(".orh-finish");
  hud.finish({ timeMs: 254321, splits: [80123, 165400], deltaMs: -3210, position: 2 });
  assert.ok(finish.classList.contains("on"));
  assert.equal(root.querySelector(".orh-finish-time").textContent, "04:14.321");
  assert.equal(root.querySelector(".orh-finish-delta").textContent, "-3.21");
  hud.finish(null);
  assert.ok(!finish.classList.contains("on"));
  assert.doesNotThrow(() => hud.finish({}), "a result with nothing in it still renders");

  const toasts = root.querySelector(".orh-toasts");
  hud.toast("SPLIT 1");
  hud.flash("CLEAN RUN");
  assert.equal(toasts.childNodes.length, 2);
  assert.equal(toasts.childNodes[0].textContent, "SPLIT 1");
  for (let i = 0; i < 8; i += 1) hud.toast("t" + i);
  assert.ok(toasts.childNodes.length <= 4, "the toast stack is capped");
  t = 100000;
  hud.update({});
  assert.equal(toasts.childNodes.length, 0, "toasts expire on the frame clock");
  hud.destroy();
});

test("a changed pacenote redraws the arrow and restarts its entry animation", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const main = root.querySelector(".orh-note-main");
  const spine = root.querySelector(".orh-arrow-spine");

  hud.setPacenote({ severity: 5, dir: "R", mods: ["long"] }, { severity: 2, dir: "L" });
  const d1 = spine.getAttribute("d");
  const anim1 = main.classList.contains("orh-pop-a");
  assert.equal(root.querySelector(".orh-note-sev").textContent, "5");
  assert.equal(root.querySelector(".orh-note-dir").textContent, "RIGHT");
  assert.equal(root.querySelector(".orh-chip").textContent, "LONG");
  assert.ok(root.querySelector(".orh-chip").classList.contains("on"));
  assert.equal(root.querySelector(".orh-queue-sev").textContent, "2");

  hud.setPacenote({ severity: 1, dir: "L" }, null);
  const d2 = spine.getAttribute("d");
  assert.notEqual(d1, d2, "a new call must redraw the glyph");
  assert.notEqual(anim1, main.classList.contains("orh-pop-a"),
    "the entry animation restarts by flipping class, not by reading layout");
  assert.equal(root.querySelector(".orh-chip").textContent, "");
  assert.ok(!root.querySelector(".orh-chip").classList.contains("on"));

  // Re-setting the same call must not restart the animation.
  const before = main.classList.contains("orh-pop-a");
  hud.setPacenote({ severity: 1, dir: "L" }, null);
  assert.equal(main.classList.contains("orh-pop-a"), before);

  hud.setPacenote(null, null);
  assert.equal(spine.getAttribute("d"), "");
  hud.destroy();
});

function queue_order(root) {
  const kids = root.querySelector(".orh-queue").childNodes.map((n) => n.className || n.getAttribute("class"));
  return kids.join(",") === "orh-queue-lead,orh-queue-arrow,orh-queue-sev,orh-queue-txt";
}

test("the large glyph goes to the call the driver still has to drive", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const sev = root.querySelector(".orh-note-sev");
  const dir = root.querySelector(".orh-note-dir");
  const qlead = root.querySelector(".orh-queue-lead");
  const qsev = root.querySelector(".orh-queue-sev");
  const qtxt = root.querySelector(".orh-queue-txt");

  // Between calls the co-driver's cursor holds no note. The queued corner is what
  // matters, so it takes the large glyph instead of sitting grey in the corner —
  // which is how the panel came to read STRAIGHT into a hairpin it already knew of.
  hud.setPacenote({ index: -1, note: null }, { kind: "corner", severity: 2, dir: 1, s: 900 });
  assert.equal(sev.textContent, "2");
  assert.equal(dir.textContent, "LEFT");
  assert.equal(qsev.textContent, "", "nothing is left queued behind a promoted call");
  assert.equal(qtxt.textContent, "");
  assert.equal(qlead.textContent, "");
  assert.match(root.querySelector(".orh-arrow-spine").getAttribute("d"), /^M /);

  // Once a call is live it owns the glyph and the queued one drops back to the chip.
  hud.setPacenote({ note: { kind: "corner", severity: 5, dir: -1, s: 1200 } },
    { kind: "corner", severity: 1, dir: 1, s: 1400 });
  assert.equal(sev.textContent, "5");
  assert.equal(dir.textContent, "RIGHT");
  assert.equal(qsev.textContent, "1");
  assert.equal(qtxt.textContent, "LEFT");
  // "THEN" is its own leaf ahead of the arrow; folded into the text it read "1 THEN LEFT".
  assert.equal(qlead.textContent, "THEN");
  assert.ok(queue_order(root), "the chip reads THEN, arrow, severity, direction, in that order");

  // A call with no severity has no number to show, and the word carries the call.
  hud.setPacenote({ note: { kind: "crest", severity: 0, s: 1300, mods: ["over crest"] } }, null);
  assert.equal(sev.textContent, "⌒", "a crest is a glyph, never a severity number");
  assert.equal(dir.textContent, "CREST");
  assert.ok(root.querySelector(".orh-note").classList.contains("flat"),
    "the panel switches to word-first typography when there is no number");
  hud.setPacenote({ note: { kind: "corner", severity: 3, dir: 1, s: 1500 } }, null);
  assert.equal(sev.textContent, "3");
  assert.ok(!root.querySelector(".orh-note").classList.contains("flat"));

  // The distance shown is the distance to the call in the large glyph, counted along
  // the stage — not the link gap the co-driver speaks between two calls.
  const distVal = root.querySelector(".orh-note-dist").childNodes[0];
  hud.update({ dt: 1 / 60, distance: 1000, stageLength: 4000 });
  assert.equal(distVal.textContent, "500", "1500 m call, 1000 m driven");
  hud.setPacenote({ note: { kind: "corner", severity: 4, dir: 1, s: 1450, distance: 80 } }, null);
  hud.update({ dt: 1 / 60, distance: 1000, stageLength: 4000 });
  assert.equal(distVal.textContent, "450", "the note's own `distance` is a link gap, not the gap to go");

  hud.destroy();
});

test("the damage diagram announces whether there is anything to report", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const panel = root.querySelector(".orh-damage");
  const style = root.childNodes.find((n) => n.tagName === "STYLE").textContent;

  hud.update({ dt: 1 / 60, damage: null });
  assert.equal(panel.classList.contains("on"), false, "a clean car has nothing to show");
  hud.update({ dt: 1 / 60, damage: { bodyFront: 0.4 } });
  assert.equal(panel.classList.contains("on"), true);
  hud.update({ dt: 1 / 60, damage: { wheels: 0.9 } });
  assert.equal(panel.classList.contains("on"), true, "a puncture counts");
  hud.update({ dt: 1 / 60, damage: {} });
  assert.equal(panel.classList.contains("on"), false);

  // The class only earns its keep if the narrow layouts act on it.
  assert.match(style, /\.orh-damage \{ display: none; \}\s*\n\s*\.orh-damage\.on \{ display: flex/);
  hud.destroy();
});

test("setStage lays out the ribbon and marks the splits", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  const marks = root.querySelectorAll(".orh-split-mark");
  assert.equal(marks.length, 6);
  assert.equal(marks.filter((m) => m.classList.contains("on")).length, 0);

  hud.setStage(makeStage("wiggle"));
  assert.equal(marks.filter((m) => m.classList.contains("on")).length, 2);
  const track = root.querySelector(".orh-ribbon-track").getAttribute("d");
  assert.match(track, /^M /);
  for (const m of marks.filter((x) => x.classList.contains("on"))) {
    const cx = Number(m.getAttribute("cx"));
    const cy = Number(m.getAttribute("cy"));
    assert.ok(cx >= 0 && cx <= 320 && cy >= 0 && cy <= 74, "a split marker sat outside the ribbon");
  }

  // Halfway through, the leading split is done and the trailing one is not.
  hud.update({ distance: 2000, stageLength: 4000, positionPct: 0.5 });
  const done = marks.filter((m) => m.classList.contains("done"));
  assert.equal(done.length, 1);

  // A stage with no geometry still draws a usable lane.
  hud.setStage(null);
  assert.match(root.querySelector(".orh-ribbon-track").getAttribute("d"), /^M /);
  hud.destroy();
});

test("the dial survives a canvas with no 2D context", () => {
  const doc = makeStubDocument();
  const real = doc.createElement;
  doc.createElement = (tag) => {
    const node = real(tag);
    if (node.tagName === "CANVAS") node.getContext = () => null;
    return node;
  };
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  assert.doesNotThrow(() => {
    for (let i = 0; i < 50; i += 1) hud.update({ rpm: i * 150, rpmLimit: 7500, dt: 1 / 60 });
  });
  hud.destroy();
});

test("destroy is idempotent and stops further work", () => {
  const doc = makeStubDocument();
  const root = makeRoot(doc);
  const hud = createHud(root, { document: doc, now: () => 0 });
  hud.destroy();
  hud.destroy();
  assert.equal(root.childNodes.length, 0);
  assert.doesNotThrow(() => hud.update({ rpm: 5000 }));
  assert.equal(hud.toast("late"), null, "a destroyed HUD does not resurrect itself");
});
