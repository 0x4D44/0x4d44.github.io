// Stage definitions, pace notes and rivals.
// STAGES_BREAK=<name> deliberately corrupts the data so each check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS, STAGE_DEFS, getStageDef } from "../core/stage.mjs";
import { RIVALS, rivalStageTime, buildTimeSheet, RIVAL_POINTS, parTimeFor, botPar, parFor } from "../core/rivals.mjs";
import { PAR_TIMES } from "../core/partimes.mjs";
import { leadDistance } from "../core/pacenotes.mjs";
import { SURFACE } from "../core/surfaces.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const stages = {};
for (const id of STAGE_IDS) stages[id] = buildStage(id);
if (BREAK === "notes-order") { const n = stages.waitomo.pacenotes; [n[3], n[4]] = [n[4], n[3]]; }
if (BREAK === "notes-drop") { const n = stages.coromandel.pacenotes; n.splice(n.findIndex((q) => q.kind === "hairpin"), 1); }
if (BREAK === "notes-close") { const n = stages.otago.pacenotes; n[5].s = n[4].s + 5; }
if (BREAK === "sev") { const n = stages.otago.pacenotes.find((q) => q.kind === "corner" && q.severity <= 4); n.severity = n.severity + 1; }
if (BREAK === "def") STAGE_DEFS.fiordland.environment.weather.type = "hail";

const ICONS = new Set(["L1", "L2", "L3", "L4", "L5", "L6", "R1", "R2", "R3", "R4", "R5", "R6", "hairpin_l", "hairpin_r", "crest", "jump", "caution", "bridge", "ford", "finish", "straight", "slippery"]);
const KINDS = new Set(["corner", "hairpin", "straight", "crest", "jump", "caution", "bridge", "ford", "finish", "start", "surface", "distance"]);
// radius (m) -> call severity: <=20 one ... >120 six
const gradeOfRadius = (r) => (r <= 20 ? 1 : r <= 30 ? 2 : r <= 48 ? 3 : r <= 75 ? 4 : r <= 120 ? 5 : 6);
const MODS = new Set(["long", "short", "tightens", "opens", "cut", "dont_cut", "maybe", "bumpy", "narrows", "over_crest", "into", "caution", "jump", "slippery", "blind"]);

test("stage ids and static definitions", () => {
  assert.deepEqual([...STAGE_IDS], ["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]);
  const biomes = new Set(["pasture", "redwood", "coast", "tussock", "alpine", "rainforest"]);
  const weather = new Set(["clear", "cloud", "mist", "rain", "snow", "storm"]);
  const hexOk = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
  STAGE_IDS.forEach((id, k) => {
    const d = getStageDef(id);
    assert.equal(d, STAGE_DEFS[id]);
    assert.equal(d.id, id);
    assert.equal(d.number, k + 1);
    assert.ok(["North", "South"].includes(d.island) && biomes.has(d.biome));
    assert.ok(d.lengthTarget >= 3000 && d.lengthTarget <= 5500 && d.difficulty >= 1 && d.difficulty <= 5);
    assert.ok(d.blurb.split(/[.!?]/).filter((x) => x.trim()).length >= 2);
    const e = d.environment;
    for (const key of ["sunColor", "skyTop", "skyHorizon", "fogColor", "ambient"]) assert.ok(hexOk(e[key]), `${id}.${key}`);
    for (const key of ["timeOfDay", "sunAzimuth", "sunElevation", "sunIntensity", "fogNear", "fogFar", "fogDensity", "windStrength", "cloudCover", "stars"]) {
      assert.ok(Number.isFinite(e[key]), `${id}.${key}`);
    }
    assert.ok(e.timeOfDay >= 0 && e.timeOfDay <= 24 && e.fogNear < e.fogFar && typeof e.headlights === "boolean");
    assert.ok(weather.has(e.weather.type), `${id} weather ${e.weather.type}`);
    assert.ok(e.weather.intensity >= 0 && e.weather.intensity <= 1 && e.weather.wetness >= 0 && e.weather.wetness <= 1);
    for (const key of ["grass", "grass2", "dirtEdge", "rock", "foliage", "foliage2", "trunk", "accent"]) assert.ok(hexOk(d.palette[key]), `${id} palette.${key}`);
    assert.ok(d.landmarks.length >= 3 && d.roadSurfaces.length >= 1);
  });
  assert.equal(STAGE_DEFS.fiordland.environment.headlights, true);
  assert.equal(STAGE_DEFS.fiordland.environment.weather.type, "rain");
  assert.equal(STAGE_DEFS.remarkables.environment.weather.type, "snow");
  assert.ok(STAGE_DEFS.coromandel.environment.sunElevation < 0.25 && STAGE_DEFS.otago.environment.sunElevation > 0.9);
  assert.ok(STAGE_DEFS.otago.environment.windStrength > 0.7);
  assert.throws(() => getStageDef("nowhere"));
});

for (const id of STAGE_IDS) {
  test(`${id}: pace notes`, () => {
    const st = stages[id];
    const notes = st.pacenotes;
    assert.ok(notes.length >= 20, `${notes.length} notes`);
    assert.equal(notes[0].kind, "start");
    assert.equal(notes[notes.length - 1].kind, "finish");
    assert.equal(notes[notes.length - 1].s, st.lengthM);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      assert.ok(KINDS.has(n.kind), n.kind);
      assert.ok(n.dir === null || n.dir === "left" || n.dir === "right");
      assert.ok(Number.isInteger(n.severity) && n.severity >= 1 && n.severity <= 6);
      assert.ok(Number.isFinite(n.s) && n.s >= 0 && n.s <= st.lengthM && Number.isFinite(n.length) && n.length >= 0);
      assert.ok(Array.isArray(n.modifiers) && n.modifiers.every((m) => MODS.has(m)));
      assert.ok(typeof n.text === "string" && n.text.length > 0 && /^[\x20-\x7e]+$/.test(n.text), `text "${n.text}"`);
      assert.ok(typeof n.speak === "string");
      if (!n.chained) assert.ok(n.speak.length > 2, `empty speech for ${n.kind} at ${n.s}`);
      assert.ok(ICONS.has(n.icon), n.icon);
      if (n.kind === "corner") assert.ok(n.dir && n.icon === `${n.dir === "left" ? "L" : "R"}${n.severity}`);
      if (n.kind === "hairpin") assert.ok(n.severity === 1 && (n.icon === "hairpin_l" || n.icon === "hairpin_r"));
      // lead(v) compatible
      for (const v of [10, 30, 60]) assert.equal(n.lead(v), n.s - Math.min(220, Math.max(40, v * 2.6)));
      assert.equal(Number(n.lead) > 0, true);
      if (i > 0) {
        assert.ok(n.s >= notes[i - 1].s, `notes unsorted at ${i}`);
        if (n.s - notes[i - 1].s < 15) {
          assert.ok(notes[i - 1].modifiers.includes("into"), `notes ${notes[i - 1].s}/${n.s} within 15 m without "into"`);
        }
      }
      if (n.modifiers.includes("into")) assert.ok(notes[i + 1] && notes[i + 1].s - (n.s + n.length) < 46);
    }
    // every corner with radius < 120 m is inside a corner/hairpin note
    const corners = notes.filter((n) => n.kind === "corner" || n.kind === "hairpin");
    let ci = 0;
    for (let i = 0; i < st.N; i++) {
      if (Math.abs(st.curv[i]) > 1 / 120) {
        const s = i * st.ds;
        while (ci > 0 && corners[ci].s > s) ci--;
        const hit = corners.some((n) => s >= n.s - 1e-6 && s <= n.s + n.length + 1e-6 && n.dir === (st.curv[i] > 0 ? "right" : "left"));
        assert.ok(hit, `curvature radius ${(1 / Math.abs(st.curv[i])).toFixed(0)} m at s=${s} not covered by a note`);
      }
    }
    // S3: severity is graded on the tightest radius (the apex) under the call, hairpins are severity 1
    for (const n of corners) {
      let k = 0;
      for (let i = Math.round(n.s / st.ds); i <= Math.round((n.s + n.length) / st.ds); i++) k = Math.max(k, Math.abs(st.curv[i]));
      // graded on the measured minimum radius (exactness: stages-audit.test.mjs); smoothed curvature may differ by one grade at a boundary
      assert.ok(Math.abs(n.severity - gradeOfRadius(1 / k)) <= 1 || n.kind === "hairpin", `${id} ${n.kind} at s=${n.s}: severity ${n.severity} but the apex radius is ${(1 / k).toFixed(1)} m`);
      if (n.kind === "hairpin") assert.ok(1 / k <= 20,"hairpin radius " + 1 / k);
    }
    // straights are long and flat
    for (const n of notes.filter((q) => q.kind === "straight")) assert.ok(n.length >= 200);
    // distance calls follow a gap of 150 m or more and say a round number
    const sorted = notes;
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i];
      if (n.kind !== "distance") continue;
      assert.ok(/^\d+$/.test(n.speak) && Number(n.speak) % 50 === 0 && Number(n.speak) >= 150, `distance call "${n.speak}"`);
      const next = sorted.slice(i + 1).find((q) => q.kind !== "distance");
      assert.ok(next && next.s - n.s >= 100, `distance call at ${n.s} with the next call only ${next && next.s - n.s} m on`);
    }
  });
}

test("pace notes name the features and surfaces of each stage", () => {
  const texts = (id) => stages[id].pacenotes.map((n) => n.speak + "|" + n.kind).join("\n");
  assert.match(texts("coromandel"), /Hairpin right/);
  assert.match(texts("coromandel"), /Tarmac ends, gravel/);
  assert.match(texts("remarkables"), /Hairpin/);
  assert.match(texts("remarkables"), /Snow, slippery/);
  assert.match(texts("fiordland"), /Caution, ford/);
  assert.match(texts("fiordland"), /one lane bridge/);
  assert.match(texts("waitomo"), /Cattle grid/);
  assert.match(texts("otago"), /Caution, jump/);
  assert.match(texts("waitomo"), /Crest/i);
  assert.match(texts("whakarewarewa"), /Mud, slippery/);
  const all = Object.keys(stages).flatMap((id) => stages[id].pacenotes);
  assert.ok(all.some((n) => /^[A-Z][a-z]+ (one|two|three|four|five|six), tightens/.test(n.speak)), "a 'tightens' call");
  assert.ok(all.some((n) => /, into (left|right) /.test(n.speak)), "an 'into' join");
  assert.ok(all.some((n) => n.modifiers.includes("dont_cut") && /don't cut/.test(n.speak)), "a don't-cut call");
  assert.ok(all.some((n) => n.modifiers.includes("long")), "a long call");
  assert.equal(leadDistance(5), 40);
  assert.equal(leadDistance(100), 220);
});

test("rivals: the field", () => {
  assert.equal(RIVALS.length, 7);
  const names = new Set(RIVALS.map((r) => r.name));
  assert.equal(names.size, 7);
  for (const r of RIVALS) {
    assert.ok(typeof r.name === "string" && /^[A-Z]{3}$/.test(r.nationality));
    assert.ok(["huia", "kea", "takahe", "piwakawaka"].includes(r.car));
    assert.ok(r.skill > 0 && r.skill < 1 && r.consistency > 0 && r.consistency <= 1);
  }
  assert.deepEqual([...RIVAL_POINTS], [10, 8, 6, 5, 4, 3, 2, 1]);
});

test("rivals: stage times are deterministic, ordered by skill and difficulty", () => {
  for (const id of STAGE_IDS) {
    const par = stages[id].parTime;
    for (const diff of ["rookie", "pro", "expert"]) {
      for (let i = 0; i < 7; i++) {
        const a = rivalStageTime({ stageId: id, rivalIndex: i, parTime: par, difficulty: diff, seed: 9 });
        const b = rivalStageTime({ stageId: id, rivalIndex: i, parTime: par, difficulty: diff, seed: 9 });
        assert.equal(a, b);
        const bot = botPar(id, RIVALS[i].car);
        assert.ok(a >= bot * 0.9 && a < bot * 1.5, `${id} ${diff} #${i}: ${a} vs own-car bot lap ${bot}`);
      }
    }
    const t = (d, i, seed = 9) => rivalStageTime({ stageId: id, rivalIndex: i, parTime: par, difficulty: d, seed });
    assert.notEqual(t("pro", 0, 1), t("pro", 0, 2));
  }
  // on average faster drivers are faster and harder difficulty is faster
  const avg = (diff, i) => {
    let sum = 0;
    for (let seed = 1; seed <= 60; seed++) for (const id of STAGE_IDS) sum += rivalStageTime({ stageId: id, rivalIndex: i, parTime: 100, difficulty: diff, seed });
    return sum / 360;
  };
  assert.ok(avg("pro", 0) < avg("pro", 6), "skill order");
  assert.ok(avg("expert", 3) < avg("pro", 3) && avg("pro", 3) < avg("rookie", 3), "difficulty order");
  // the calibrated PAR_TIMES entry wins; an unknown car or stage falls back to the stage's own estimate
  assert.equal(botPar("waitomo", "huia"), PAR_TIMES.waitomo.huia);
  assert.equal(botPar("waitomo", "nope"), null);
  for (const id of STAGE_IDS) {
    assert.equal(parFor(id, "huia"), Math.round(PAR_TIMES[id].huia * 1.08 * 10) / 10);
    assert.equal(stages[id].parTime, parFor(id, "huia"), `${id}: Stage.parTime is the huia parFor`);
  }
  // each rival uses their OWN car bot lap; difficulty centres (see core/rivals.mjs BASE + mean skill spread) (mean over rivals/seeds)
  const mean = (diff) => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 30; seed++) for (const id of STAGE_IDS) for (let i = 0; i < 7; i++) {
      sum += rivalStageTime({ stageId: id, rivalIndex: i, parTime: 1, difficulty: diff, seed }) / botPar(id, RIVALS[i].car); n++;
    }
    return sum / n;
  };
  assert.ok(Math.abs(mean("rookie") - 1.19) < 0.03 && Math.abs(mean("pro") - 1.09) < 0.03 && Math.abs(mean("expert") - 1.05) < 0.03, `means ${mean("rookie")} ${mean("pro")} ${mean("expert")}`);
  const one = (diff, i) => { let sum = 0, n = 0; for (let seed = 1; seed <= 30; seed++) for (const id of STAGE_IDS) { sum += rivalStageTime({ stageId: id, rivalIndex: i, parTime: 1, difficulty: diff, seed }) / botPar(id, RIVALS[i].car); n++; } return sum / n; };
  assert.ok(Math.abs(one("expert", 0) - 1.02) < 0.02 && Math.abs(one("pro", 0) - 1.06) < 0.02 && Math.abs(one("rookie", 0) - 1.16) < 0.02, `top rival ${one("rookie", 0)} ${one("pro", 0)} ${one("expert", 0)}`);
  assert.ok(one("pro", 6) >= 1.12 && one("pro", 6) <= 1.15, `slowest rival on Pro ${one("pro", 6)}`);
  assert.equal(parTimeFor("waitomo", "huia", 123), PAR_TIMES.waitomo.huia);
  assert.equal(parTimeFor("waitomo", "no_such_car", 123), 123);
  assert.equal(parTimeFor("no_such_stage", "huia", 123), 123);
  assert.throws(() => rivalStageTime({ stageId: "otago", rivalIndex: 9, parTime: 100 }));
});

test("rivals: time sheet", () => {
  const rt = [100, 101.5, 103, 99, 110, 105, 98.2];
  const sheet = buildTimeSheet(100.5, rt);
  assert.equal(sheet.length, 8);
  assert.deepEqual(sheet.map((r) => r.time), [98.2, 99, 100, 100.5, 101.5, 103, 105, 110]);
  assert.deepEqual(sheet.map((r) => r.position), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(sheet.map((r) => r.points), [10, 8, 6, 5, 4, 3, 2, 1]);
  assert.equal(sheet.filter((r) => r.isPlayer).length, 1);
  assert.equal(sheet[3].isPlayer, true);
  assert.equal(sheet[0].gap, 0);
  assert.ok(Math.abs(sheet[3].gap - 2.3) < 1e-9 && Math.abs(sheet[3].gapToPrev - 0.5) < 1e-9);
  assert.equal(sheet.reduce((a, r) => a + r.points, 0), 39);
  // player wins
  const win = buildTimeSheet(90, rt);
  assert.equal(win[0].isPlayer, true);
  assert.equal(win[0].points, 10);
  // DNF scores nothing and is last
  const dnf = buildTimeSheet(Infinity, rt);
  assert.equal(dnf[7].isPlayer, true);
  assert.equal(dnf[7].points, 0);
  assert.equal(dnf[7].dnf, true);
  assert.equal(dnf[0].points, 10);
  // objects accepted
  const objs = buildTimeSheet(50, rt.map((time, index) => ({ index, time })));
  assert.equal(objs[0].isPlayer, true);
  assert.equal(objs[1].name, RIVALS[6].name);
});

test("surface vocabulary used by stages is valid", () => {
  const ids = new Set(Object.values(SURFACE));
  for (const id of STAGE_IDS) for (const s of getStageDef(id).roadSurfaces) assert.ok(ids.has(s));
});
