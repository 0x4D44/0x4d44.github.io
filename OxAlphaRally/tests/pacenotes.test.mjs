import test from "node:test";
import assert from "node:assert/strict";

import {
  derivePacenotes,
  pacenoteText,
  pacenoteGlyphs,
  createPacenoteRunner,
  spokenDuration,
  severityForRadius,
  effectiveRadius,
  PACENOTE_WORDS,
} from "../pacenotes.js";
import { SURFACE } from "../surfaces.js";

const STEP = 2;

// A Stage of the pinned shape, built from a curvature programme, so the tests
// know the exact geometry they are asking the co-driver to read.
function buildStage(spec) {
  const segs = spec.segments;
  const total = segs.reduce((a, b) => a + b.len, 0);
  const count = Math.round(total / STEP) + 1;
  const f = () => new Float32Array(count);
  const stage = {
    id: spec.id ?? "TEST", name: spec.name ?? "Test", country: "Vorland",
    seed: 1, notes: "", surfaceMix: [spec.surface ?? SURFACE.GRAVEL],
    length: total, step: STEP, count,
    s: f(), x: f(), y: f(), z: f(), tx: f(), ty: f(), tz: f(),
    nx: f(), ny: f(), nz: f(), curvature: f(), grade: f(), camber: f(),
    halfWidth: f(), surface: new Uint8Array(count), crest: f(), jump: f(),
    features: spec.features ?? [], splits: [total / 3, (2 * total) / 3],
    start: { x: 0, y: 0, z: 0, yaw: 0 },
    finish: { s: total, x: 0, y: 0, z: 0 },
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    scenery: [], props: [], world: null,
  };
  let segIdx = 0;
  let segStart = 0;
  for (let i = 0; i < count; i += 1) {
    const s = i * STEP;
    while (segIdx < segs.length - 1 && s >= segStart + segs[segIdx].len) {
      segStart += segs[segIdx].len;
      segIdx += 1;
    }
    const seg = segs[segIdx];
    stage.s[i] = s;
    stage.curvature[i] = seg.k ?? 0;
    stage.halfWidth[i] = seg.halfWidth ?? spec.halfWidth ?? 5;
    stage.camber[i] = seg.camber ?? 0;
    stage.surface[i] = seg.surface ?? spec.surface ?? SURFACE.GRAVEL;
  }
  if (spec.shape) spec.shape(stage);
  // Contract: forward is (sin yaw, 0, cos yaw) and positive curvature turns
  // left, so the heading integrates as dyaw/ds = -k.
  let theta = 0;
  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      theta -= 0.5 * (stage.curvature[i] + stage.curvature[i - 1]) * STEP;
      const mid = theta + 0.5 * stage.curvature[i] * STEP;
      stage.x[i] = stage.x[i - 1] + Math.sin(mid) * STEP;
      stage.z[i] = stage.z[i - 1] + Math.cos(mid) * STEP;
    }
    stage.tx[i] = Math.sin(theta);
    stage.tz[i] = Math.cos(theta);
    const c = stage.camber[i];
    stage.nx[i] = -Math.sin(c) * Math.cos(theta);
    stage.ny[i] = Math.cos(c);
    stage.nz[i] = Math.sin(c) * Math.sin(theta);
  }
  return stage;
}

const seg = (len, radius = 0, dir = 0, extra) => ({
  len, k: radius ? dir / radius : 0, ...extra,
});
const arc = (radius, degrees, dir, extra) => seg(radius * degrees * Math.PI / 180, radius, dir, extra);

const corners = (notes) => notes.filter((n) => n.kind === "corner");
const texts = (notes, style = "numeric") => notes.map((n) => pacenoteText(n, style));

// A physical speed profile: cornering limit, then a braking pass back from each
// corner and an acceleration pass forward. Close enough to a real run that the
// delivery timings are being tested against real speeds, not a constant.
function speedProfile(stage, opts = {}) {
  const n = stage.count;
  const step = stage.step;
  const v = new Float64Array(n);
  const aLat = opts.aLat ?? 9.0;
  const aBrake = opts.aBrake ?? 8.0;
  const aAcc = opts.aAcc ?? 4.5;
  const vMax = opts.vMax ?? 44;
  for (let i = 0; i < n; i += 1) {
    v[i] = Math.min(vMax, Math.sqrt(aLat / Math.max(Math.abs(stage.curvature[i]), 1e-5)));
  }
  for (let i = n - 2; i >= 0; i -= 1) {
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * aBrake * step));
  }
  v[0] = Math.min(v[0], 8);
  for (let i = 1; i < n; i += 1) {
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * aAcc * step));
  }
  return v;
}

function driveStage(stage, notes, runnerOpts = {}) {
  const v = speedProfile(stage);
  const runner = createPacenoteRunner(notes, runnerOpts);
  const dt = 1 / 60;
  const dur = new Float64Array(notes.length);
  const spoken = [];
  const arrival = new Float64Array(notes.length).fill(-1);
  let s = 0;
  let t = 0;
  let guard = 0;
  while (s < stage.length && guard < 200000) {
    const i = Math.min(stage.count - 1, Math.max(0, Math.round(s / stage.step)));
    const speed = v[i];
    const ev = runner.update(s, speed, dt);
    if (ev) {
      const d = spokenDuration(ev.text);
      dur[ev.index] = d;
      spoken.push({
        index: ev.index, last: ev.lastIndex, text: ev.text, at: t, atS: s,
        speed, duration: d,
      });
    }
    for (let k = 0; k < notes.length; k += 1) {
      if (arrival[k] < 0 && s >= notes[k].sStart) arrival[k] = t;
    }
    s += speed * dt;
    t += dt;
    guard += 1;
  }
  for (let k = 0; k < notes.length; k += 1) if (arrival[k] < 0) arrival[k] = t;
  return { runner, spoken, arrival, endTime: t };
}

const HAIRPIN_STAGE = buildStage({
  name: "Hairpin", segments: [seg(30), arc(30, 180, +1), seg(150)],
});
const SWEEPER_STAGE = buildStage({
  name: "Sweeper", segments: [seg(30), seg(300, 500, +1), seg(150)],
});
const STRAIGHT_STAGE = buildStage({ name: "Straight", segments: [seg(600)] });
const NOISE_STAGE = buildStage({ name: "Noise", segments: [seg(600, 1500, +1)] });
const SBEND_TIGHT = buildStage({
  name: "S tight", segments: [seg(30), arc(55, 60, +1), seg(4), arc(55, 60, -1), seg(150)],
});
const SBEND_LINKED = buildStage({
  name: "S linked", segments: [seg(30), arc(55, 60, +1), seg(20), arc(55, 60, -1), seg(150)],
});
const CREST_STAGE = buildStage({
  name: "Crest",
  segments: [seg(300)],
  shape(st) {
    for (let i = 0; i < st.count; i += 1) {
      const d = st.s[i] - 120;
      st.crest[i] = Math.max(0, 0.75 * Math.exp(-(d * d) / 648));
    }
  },
});

// Four roads of different character, driven end to end by the delivery tests.
const STAGE_BOOK = [
  {
    name: "Kestrel Ridge",
    stage: buildStage({
      name: "Kestrel Ridge",
      segments: [
        seg(220), seg(300, 500, +1), seg(140), seg(260, 320, -1),
        seg(90), seg(120, 140, +1), seg(60), seg(90, 90, -1),
        seg(400), seg(150, 220, +1), seg(40), seg(140, 180, -1), seg(300),
      ],
    }),
  },
  {
    name: "Tarn Hollow",
    stage: buildStage({
      name: "Tarn Hollow",
      halfWidth: 3.6,
      segments: [
        seg(120), arc(30, 180, +1), seg(70), arc(45, 76, -1),
        seg(30), arc(40, 79, +1), seg(18), arc(38, 75, -1),
        seg(120), arc(30, 90, -1), seg(80), arc(30, 180, +1),
        seg(60), arc(60, 67, -1), seg(25), arc(60, 67, +1), seg(260),
      ],
    }),
  },
  {
    name: "Blackmoss",
    stage: buildStage({
      name: "Blackmoss",
      segments: [
        seg(150), seg(160, 200, -1), seg(200), seg(80, 70, +1),
        seg(240), seg(110, 110, -1), seg(60), arc(30, 180, +1),
        seg(500), seg(180, 260, -1), seg(200),
      ],
      features: [
        { s: 380, kind: "bridge", severity: 0.5, meta: null },
        { s: 700, kind: "junction", severity: 0.9, meta: null },
        { s: 1250, kind: "ford", severity: 0.7, meta: null },
      ],
      shape(st) {
        for (let i = 0; i < st.count; i += 1) {
          const s = st.s[i];
          st.crest[i] = Math.max(0, 0.7 * Math.exp(-((s - 620) ** 2) / 800));
          st.jump[i] = Math.max(0, 0.8 * Math.exp(-((s - 1000) ** 2) / 600));
          st.halfWidth[i] = s > 340 && s < 420 ? 2.4 : 5.2;
          st.camber[i] = s > 900 && s < 1100 ? -0.08 : 0;
        }
      },
    }),
  },
  {
    name: "Vale of Ashen",
    stage: buildStage({
      name: "Vale of Ashen",
      surface: SURFACE.TARMAC,
      segments: [
        seg(600),
        seg(40, 300, +1), seg(25), seg(40, 280, +1), seg(25),
        seg(40, 320, +1), seg(25), seg(40, 260, +1),
        seg(500), seg(120, 100, -1), seg(30), seg(120, 100, +1), seg(700),
      ],
    }),
  },
  {
    name: "Six Hairpins",
    stage: buildStage({
      name: "Six Hairpins",
      segments: [
        seg(200),
        ...[+1, -1, +1, -1, +1, -1].flatMap((d) => [arc(22, 180, d), seg(250)]),
      ],
    }),
  },
];

test("the test stage builder matches the contract's curvature sign", () => {
  // Positive curvature turns left, and left of (sin yaw, 0, cos yaw) at yaw 0
  // is -X, so a left corner from the start line must move the road to -X.
  const st = buildStage({ segments: [seg(20), seg(100, 100, +1)] });
  const last = st.count - 1;
  assert.ok(st.x[last] < -5, `expected a left turn to go to -X, got x=${st.x[last]}`);
  const right = buildStage({ segments: [seg(20), seg(100, 100, -1)] });
  assert.ok(right.x[right.count - 1] > 5);
});

test("a 30 m hairpin is called a hairpin", () => {
  const notes = derivePacenotes(HAIRPIN_STAGE);
  const cs = corners(notes);
  assert.equal(cs.length, 1);
  const n = cs[0];
  assert.equal(n.dir, +1);
  assert.equal(n.special, "hairpin");
  assert.equal(n.severity, 1);
  assert.ok(Math.abs(n.radius - 30) < 0.05, `radius ${n.radius}`);
  assert.ok(Math.abs(n.angle - Math.PI) < 0.1, `angle ${n.angle}`);
  assert.equal(pacenoteText(n, "numeric"), "hairpin left");
  assert.equal(pacenoteText(n, "descriptive"), "hairpin left");
});

test("a 500 m sweeper is flat and long, not a number", () => {
  const cs = corners(derivePacenotes(SWEEPER_STAGE));
  assert.equal(cs.length, 1);
  assert.equal(cs[0].severity, 6);
  assert.equal(cs[0].special, "flat");
  assert.ok(Math.abs(cs[0].radius - 500) < 1);
  assert.equal(pacenoteText(cs[0], "numeric"), "flat left, long");
  assert.equal(pacenoteText(cs[0], "descriptive"), "flat left, long");
});

test("a straight, and a curve under the noise floor, produce no corner call", () => {
  assert.equal(corners(derivePacenotes(STRAIGHT_STAGE)).length, 0);
  assert.equal(corners(derivePacenotes(NOISE_STAGE)).length, 0);
  // ...but the stage still gets its finish call.
  assert.ok(derivePacenotes(STRAIGHT_STAGE).some((n) => n.kind === "finish"));
});

test("an S-bend is one breath, linked by into or and", () => {
  const tight = corners(derivePacenotes(SBEND_TIGHT));
  assert.equal(tight.length, 2);
  assert.equal(tight[0].sameBreath, false);
  assert.equal(tight[1].sameBreath, true);
  assert.deepEqual(texts(tight), ["left three", "into right three"]);

  const linked = corners(derivePacenotes(SBEND_LINKED));
  assert.equal(linked.length, 2);
  assert.equal(linked[1].sameBreath, true);
  assert.deepEqual(texts(linked), ["left three", "and right three"]);
  assert.deepEqual(texts(linked, "descriptive"), ["slow left", "and slow right"]);

  // The runner reads a breath as one utterance — never two calls at once.
  const runner = createPacenoteRunner(derivePacenotes(SBEND_LINKED));
  assert.equal(runner.textFor(0), "left three and right three");
});

test("a square, a fast ninety and a long sweeper each get their own call", () => {
  const square = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(30, 90, -1), seg(150)],
  })));
  assert.equal(square[0].special, "square");
  assert.equal(pacenoteText(square[0], "numeric"), "square right");

  const fast = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(200, 90, +1), seg(150)],
  })));
  assert.equal(fast[0].severity, 5);
  assert.equal(pacenoteText(fast[0], "numeric"), "left five, long");
  assert.equal(pacenoteText(fast[0], "descriptive"), "fast left, long");
});

test("a ninety-degree sweeper and a ninety-degree pinch are different calls", () => {
  const sweep = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(200, 90, +1), seg(150)],
  })))[0];
  const pinch = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(28, 90, +1), seg(150)],
  })))[0];
  assert.ok(Math.abs(sweep.angle - pinch.angle) < 0.12);
  assert.ok(sweep.severity > pinch.severity + 2);
  assert.equal(pinch.special, "square");
});

test("opens and tightens come from the curvature derivative", () => {
  const tightens = corners(derivePacenotes(buildStage({
    segments: [seg(30), seg(80, 150, -1), seg(60, 45, -1), seg(150)],
  })))[0];
  assert.ok(tightens.mods.includes("tightens") || tightens.mods.includes("tightens on exit"));
  assert.ok(!tightens.mods.includes("opens"));

  const opens = corners(derivePacenotes(buildStage({
    segments: [seg(30), seg(60, 45, -1), seg(80, 150, -1), seg(150)],
  })))[0];
  assert.ok(opens.mods.includes("opens"));
  assert.ok(!opens.mods.includes("tightens"));
});

test("stage signals become the right modifiers", () => {
  const stage = buildStage({
    segments: [seg(60), arc(60, 80, +1), seg(300)],
    features: [{ s: 500, kind: "ford", severity: 0.7, meta: null }],
    shape(st) {
      for (let i = 0; i < st.count; i += 1) {
        const s = st.s[i];
        if (s > 60 && s < 145) {
          st.camber[i] = -0.10;          // banked down to the right, in a left corner
          st.halfWidth[i] = 2.6;          // and it pinches
          st.surface[i] = SURFACE.ROCK;   // over rough ground
        }
        st.jump[i] = Math.max(0, 0.9 * Math.exp(-((s - 300) ** 2) / 400));
      }
    },
  });
  const notes = derivePacenotes(stage);
  const c = corners(notes)[0];
  assert.ok(c.mods.includes("off camber"), c.mods.join("/"));
  assert.ok(c.mods.includes("narrows"), c.mods.join("/"));
  assert.ok(c.mods.includes("bumpy"), c.mods.join("/"));
  assert.ok(c.mods.includes("keep left") || c.mods.includes("keep right"), c.mods.join("/"));
  assert.ok(c.mods.includes("don't cut"), c.mods.join("/"));

  const jump = notes.find((n) => n.kind === "bigjump");
  assert.ok(jump, "a 0.9 jump on a straight must be called");
  assert.ok(jump.mods.includes("big jump"));

  const ford = notes.find((n) => n.kind === "ford");
  assert.ok(ford, "a ford feature must be called");
  assert.ok(ford.mods.includes("caution"));
  assert.match(pacenoteText(ford, "numeric"), /caution, into ford$/);
});

test("a wide loose corner is a cut, a narrow fast one is a line", () => {
  const cut = corners(derivePacenotes(buildStage({
    segments: [seg(60), arc(50, 90, -1), seg(200)], halfWidth: 7,
  })))[0];
  assert.equal(cut.severity <= 3, true);
  assert.ok(cut.mods.includes("cut"), cut.mods.join("/"));

  const line = corners(derivePacenotes(buildStage({
    segments: [seg(60), arc(260, 40, +1), seg(200)], halfWidth: 3.2,
  })))[0];
  assert.ok(line.severity >= 5);
  assert.ok(line.mods.includes("line"), line.mods.join("/"));
});

test("a distance call is spoken as words, and links into the corner", () => {
  const notes = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(55, 60, +1), seg(120), arc(55, 60, -1), seg(150)],
  })));
  assert.equal(pacenoteText(notes[1], "numeric"), "one hundred into right three");
  const short = corners(derivePacenotes(buildStage({
    segments: [seg(30), arc(55, 60, +1), seg(70), arc(55, 60, -1), seg(150)],
  })));
  assert.equal(pacenoteText(short[1], "numeric"), "then sixty, right three");
});

test("a feature in a corner joins the call, one on a straight stands alone", () => {
  const inCorner = corners(derivePacenotes(buildStage({
    segments: [seg(60), arc(70, 70, -1), seg(200)],
    features: [{ s: 100, kind: "bridge", severity: 0.4, meta: null }],
  })))[0];
  assert.ok(inCorner.mods.includes("over bridge"), inCorner.mods.join("/"));

  const alone = derivePacenotes(buildStage({
    segments: [seg(400)],
    features: [{ s: 200, kind: "junction", severity: 0.9, meta: null }],
  })).find((n) => n.kind === "junction");
  assert.ok(alone);
  assert.equal(pacenoteText(alone, "numeric"), "two hundred, double caution, junction");
});

test("a crest on a straight is its own call, in a corner it is a modifier", () => {
  const onStraight = derivePacenotes(CREST_STAGE).find((n) => n.kind === "crest");
  assert.ok(onStraight);
  assert.equal(pacenoteText(onStraight, "numeric"), "one twenty, over crest");

  const inCorner = corners(derivePacenotes(buildStage({
    segments: [seg(60), arc(70, 80, -1), seg(200)],
    shape(st) {
      for (let i = 0; i < st.count; i += 1) {
        const d = st.s[i] - 105;
        st.crest[i] = Math.max(0, 0.7 * Math.exp(-(d * d) / 288));
      }
    },
  })))[0];
  assert.ok(inCorner.mods.includes("over crest"), inCorner.mods.join("/"));
  assert.equal(derivePacenotes(CREST_STAGE).filter((n) => n.kind === "crest").length, 1);
});

test("six same-direction flicks are one long call, not six", () => {
  const stage = buildStage({
    segments: [
      seg(30),
      ...Array.from({ length: 6 }, () => [seg(35, 250, +1), seg(20)]).flat(),
      seg(150),
    ],
  });
  const cs = corners(derivePacenotes(stage));
  assert.equal(cs.length, 1, texts(cs).join(" | "));
  assert.ok(cs[0].mods.includes("long"));
  assert.equal(pacenoteText(cs[0], "numeric"), "left six, long");
});

test("severity is monotonic in radius", () => {
  for (const degrees of [40, 70, 110, 180]) {
    let prev = 0;
    for (const radius of [15, 20, 25, 30, 40, 55, 75, 100, 140, 200, 300, 450, 600]) {
      const c = corners(derivePacenotes(buildStage({
        segments: [seg(30), arc(radius, degrees, +1), seg(200)],
      })))[0];
      assert.ok(c, `no call for R=${radius} at ${degrees} deg`);
      assert.ok(
        c.severity >= prev,
        `R=${radius} at ${degrees} deg gave ${c.severity} after ${prev}`,
      );
      prev = c.severity;
    }
    assert.equal(prev, 6, `${degrees} deg should reach flat-out by 600 m radius`);
  }
  // The bare severity function is monotonic too, and the tight end is a 1.
  assert.equal(severityForRadius(effectiveRadius(15, Math.PI)), 1);
  let last = 0;
  for (let r = 5; r < 800; r += 5) {
    const sev = severityForRadius(r);
    assert.ok(sev >= last);
    last = sev;
  }
});

test("the same geometry always yields the same call", () => {
  // Identical corners with identical approaches: same road, same call, three
  // times over. (A different approach legitimately changes the call — that is
  // what the caution rule is for — so the run-ins are equal too.)
  const stage = buildStage({
    segments: [
      seg(300), arc(45, 100, -1), seg(300), arc(45, 100, -1), seg(300),
      arc(45, 100, -1), seg(300),
    ],
  });
  const cs = corners(derivePacenotes(stage));
  assert.equal(cs.length, 3);
  for (const c of cs) {
    assert.equal(c.severity, cs[0].severity);
    assert.equal(c.special, cs[0].special);
    assert.equal(c.dir, cs[0].dir);
    assert.deepEqual(c.mods, cs[0].mods);
  }
});

test("every corner gets exactly one call, and no hairpin is ever missed", () => {
  for (const entry of STAGE_BOOK) {
    const notes = derivePacenotes(entry.stage);
    const cs = corners(notes);
    for (let i = 1; i < cs.length; i += 1) {
      assert.ok(
        cs[i].sStart >= cs[i - 1].sEnd,
        `${entry.name}: calls ${i - 1} and ${i} cover the same road`,
      );
    }
    // Every stretch of road tighter than 60 m radius must be inside a call.
    const stage = entry.stage;
    for (let i = 0; i < stage.count; i += 1) {
      if (Math.abs(stage.curvature[i]) < 1 / 60) continue;
      const s = stage.s[i];
      const covered = cs.some((c) => s >= c.sStart - 2 && s <= c.sEnd + 2);
      assert.ok(covered, `${entry.name}: uncalled tight road at s=${s}`);
    }
  }
  const hairpins = corners(derivePacenotes(STAGE_BOOK[4].stage));
  assert.equal(hairpins.length, 6);
  for (const h of hairpins) assert.equal(h.special, "hairpin");
});

test("notes arrive before their corner, with a usable lead, one at a time", () => {
  for (const entry of STAGE_BOOK) {
    const notes = derivePacenotes(entry.stage);
    const { runner, spoken, arrival } = driveStage(entry.stage, notes);

    assert.equal(runner.skipped, 0, `${entry.name}: dropped ${runner.skipped} calls`);
    assert.equal(runner.spoken, notes.length, `${entry.name}: not every call was read`);

    let expected = 0;
    let prev = null;
    for (const e of spoken) {
      assert.equal(e.index, expected, `${entry.name}: calls read out of order`);
      expected = e.last + 1;

      const note = notes[e.index];
      const lead = note.sStart - e.atS;
      const leadTime = arrival[e.index] - e.at;
      assert.ok(lead > 0, `${entry.name}: "${e.text}" was read at the corner`);
      assert.ok(lead >= 15 && lead <= 420, `${entry.name}: lead ${lead.toFixed(0)} m for "${e.text}"`);
      assert.ok(
        leadTime >= 1.0 && leadTime <= 13,
        `${entry.name}: lead ${leadTime.toFixed(2)} s for "${e.text}"`,
      );
      // The call must FINISH with road to spare, not merely start in time.
      // (A "long straight" warns of nothing, so it has no deadline to meet.)
      if (note.kind !== "straight") {
        const margin = leadTime - e.duration;
        const floor = note.kind === "corner" && note.severity <= 3 ? 1.0 : 0.5;
        assert.ok(
          margin >= floor,
          `${entry.name}: "${e.text}" ends only ${margin.toFixed(2)} s before the corner`,
        );
      }
      if (prev) {
        assert.ok(
          e.at - prev.at >= prev.duration,
          `${entry.name}: "${e.text}" started while "${prev.text}" was still being said`,
        );
      }
      prev = e;
    }
  }
});

test("a faster run still gets its calls in time", () => {
  const entry = STAGE_BOOK[0];
  const notes = derivePacenotes(entry.stage);
  const { runner, spoken, arrival } = driveStage(entry.stage, notes, { rate: 3.8 });
  assert.equal(runner.skipped, 0);
  for (const e of spoken) {
    assert.ok(arrival[e.index] - e.at > spokenDuration(e.text, 3.8));
  }
});

test("the delivery offset shifts the whole read earlier", () => {
  const entry = STAGE_BOOK[1];
  const notes = derivePacenotes(entry.stage);
  const base = driveStage(entry.stage, notes, {});
  const early = driveStage(entry.stage, derivePacenotes(entry.stage), { offset: 1.0 });
  assert.equal(early.runner.skipped, 0);
  let earlier = 0;
  for (let i = 0; i < Math.min(base.spoken.length, early.spoken.length); i += 1) {
    if (early.spoken[i].atS < base.spoken[i].atS - 1) earlier += 1;
  }
  assert.ok(earlier >= base.spoken.length - 1, `only ${earlier} calls moved earlier`);
});

test("the runner skips a call it can no longer usefully deliver", () => {
  const notes = derivePacenotes(STAGE_BOOK[1].stage);
  const runner = createPacenoteRunner(notes);
  const target = notes[2];
  // Teleport past the first three calls, as a restart-from-a-split would.
  const ev = runner.update(target.sStart + 5, 25, 1 / 60);
  assert.equal(ev, null);
  assert.ok(runner.skipped >= 3, `skipped ${runner.skipped}`);
  assert.ok(runner.pending.every((n) => n.sStart > target.sStart));
});

test("the queue always shows the next calls for the HUD", () => {
  const notes = derivePacenotes(STAGE_BOOK[0].stage);
  const runner = createPacenoteRunner(notes, { queueDepth: 4 });
  assert.ok(runner.pending.length >= 2);
  assert.equal(runner.pending[0], notes[0]);
  assert.ok(runner.pending.length <= 4);
  for (let i = 1; i < runner.pending.length; i += 1) {
    assert.ok(runner.pending[i].sStart >= runner.pending[i - 1].sStart);
    assert.equal(runner.pending[i].sameBreath, false, "the queue lists breaths, not fragments");
  }
  driveStage(STAGE_BOOK[0].stage, notes);
  const fresh = createPacenoteRunner(notes);
  fresh.reset(STAGE_BOOK[0].stage.length);
  assert.equal(fresh.pending.length, 0);
  fresh.reset(0);
  assert.equal(fresh.pending[0], notes[0]);
});

test("the runner holds its state in place and copes with a dead stage", () => {
  const notes = derivePacenotes(STAGE_BOOK[0].stage);
  const runner = createPacenoteRunner(notes);
  const pending = runner.pending;
  const current = runner.current;
  const v = speedProfile(STAGE_BOOK[0].stage);
  let s = 0;
  for (let i = 0; i < 4000; i += 1) {
    const speed = v[Math.min(v.length - 1, Math.round(s / STEP))];
    runner.update(s, speed, 1 / 60);
    s += speed / 60;
    // The HUD holds these objects across frames, so they must never be replaced.
    assert.equal(runner.pending, pending);
    assert.equal(runner.current, current);
  }

  const empty = createPacenoteRunner([]);
  assert.equal(empty.update(0, 20, 1 / 60), null);
  assert.equal(empty.pending.length, 0);
  empty.reset();
  assert.equal(empty.skipped, 0);

  // Stationary on the start line: no call is ever read twice.
  const still = createPacenoteRunner(derivePacenotes(STAGE_BOOK[1].stage));
  let spoke = 0;
  for (let i = 0; i < 600; i += 1) if (still.update(0, 0, 1 / 60)) spoke += 1;
  assert.ok(spoke <= 1, `read ${spoke} calls while stopped`);
});

test("spoken text is safe for a speech engine", () => {
  const seen = new Set();
  for (const entry of [...STAGE_BOOK.map((e) => e.stage), HAIRPIN_STAGE, SWEEPER_STAGE,
    SBEND_TIGHT, SBEND_LINKED, CREST_STAGE, STRAIGHT_STAGE]) {
    for (const note of derivePacenotes(entry)) {
      for (const style of ["numeric", "descriptive"]) {
        const text = pacenoteText(note, style);
        assert.ok(text.length > 0);
        assert.doesNotMatch(text, /[0-9]/, `digits in "${text}"`);
        assert.doesNotMatch(text, /[A-Z]/, `an abbreviation would be spelled out: "${text}"`);
        assert.doesNotMatch(text, /\s,|,,|,$|^,/, `bad punctuation in "${text}"`);
        for (const word of text.split(/[^a-z']+/)) {
          if (!word) continue;
          seen.add(word);
          assert.ok(PACENOTE_WORDS.has(word), `"${word}" is not in the co-driver's vocabulary ("${text}")`);
        }
      }
    }
  }
  // The vocabulary is not vacuous: a real read uses a good part of it.
  assert.ok(seen.size > 30, `only ${seen.size} distinct words`);
  assert.ok(seen.has("hairpin") && seen.has("left") && seen.has("right"));
});

test("spoken duration tracks syllables", () => {
  assert.ok(spokenDuration("left four") < spokenDuration("caution, hairpin left, don't cut"));
  assert.ok(spokenDuration("left four") > 0.4);
  assert.ok(spokenDuration("one hundred into left four, long, tightens") < 4);
  assert.equal(spokenDuration("left four"), spokenDuration("left four"));
});

test("glyphs are HUD tokens from a closed set", () => {
  const kinds = new Set(["dist", "link", "caution", "arrow", "sev", "mod", "info"]);
  for (const entry of STAGE_BOOK) {
    for (const note of derivePacenotes(entry.stage)) {
      const glyphs = pacenoteGlyphs(note);
      assert.ok(Array.isArray(glyphs) && glyphs.length > 0);
      assert.equal(pacenoteGlyphs(note), glyphs, "glyphs must be cached, not rebuilt per frame");
      for (const g of glyphs) {
        assert.ok(kinds.has(g.kind), `unknown glyph kind ${g.kind}`);
        assert.equal(typeof g.text, "string");
        assert.ok(g.text.length > 0);
        assert.ok(Number.isFinite(g.severity) && g.severity >= 0 && g.severity <= 6);
      }
      if (note.kind === "corner") {
        const arrow = glyphs.find((g) => g.kind === "arrow");
        assert.ok(arrow && (arrow.text === "left" || arrow.text === "right"));
        assert.equal(arrow.text, note.dir > 0 ? "left" : "right");
        const sev = glyphs.find((g) => g.kind === "sev");
        assert.ok(sev);
        if (!note.special) assert.equal(sev.text, String(note.severity));
      }
      const seen = new Set();
      for (const g of glyphs) {
        const key = `${g.kind}:${g.text}`;
        assert.ok(!seen.has(key), `duplicate glyph ${key} on "${pacenoteText(note, "numeric")}"`);
        seen.add(key);
      }
    }
  }
  // A hazard note leads with the hazard; the caution is a separate token.
  const ford = derivePacenotes(STAGE_BOOK[2].stage).find((n) => n.kind === "ford");
  assert.deepEqual(pacenoteGlyphs(ford), [
    { kind: "dist", text: "150", severity: 0 },
    { kind: "caution", text: "!", severity: 0 },
    { kind: "info", text: "FORD", severity: 0 },
  ]);
});

test("derivation is deterministic", () => {
  for (const entry of STAGE_BOOK) {
    const a = derivePacenotes(entry.stage);
    const b = derivePacenotes(entry.stage);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i += 1) {
      assert.equal(a[i].sStart, b[i].sStart);
      assert.equal(a[i].sEnd, b[i].sEnd);
      assert.equal(a[i].severity, b[i].severity);
      assert.equal(a[i].special, b[i].special);
      assert.deepEqual(a[i].mods, b[i].mods);
      assert.equal(pacenoteText(a[i], "numeric"), pacenoteText(b[i], "numeric"));
      assert.equal(pacenoteText(a[i], "descriptive"), pacenoteText(b[i], "descriptive"));
      assert.deepEqual(pacenoteGlyphs(a[i]), pacenoteGlyphs(b[i]));
    }
    // ...and so is the read: two runs deliver the same calls at the same metres.
    const first = driveStage(entry.stage, a);
    const second = driveStage(entry.stage, b);
    assert.deepEqual(
      first.spoken.map((e) => [e.index, e.text, Math.round(e.atS * 100)]),
      second.spoken.map((e) => [e.index, e.text, Math.round(e.atS * 100)]),
    );
  }
});
