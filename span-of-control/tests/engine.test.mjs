import assert from "node:assert/strict";
import * as engine from "../engine.js";
import * as content from "../content.js";
import * as storage from "../storage.js";

/* ------------------------- fixture deck ------------------------- */
const FIX = {
  CARDS: [
    {
      id: "f-basic", cast: "diane", kind: "email", text: "basic",
      left: { label: "l", effects: { leadership: -5, team: 3 } },
      right: { label: "r", effects: { you: -4, headcount: 1 }, quip: "quipped" },
    },
    {
      id: "f-flag", cast: "greg", kind: "chat", text: "flag setter",
      left: { label: "l", setFlags: ["armed"] },
      right: { label: "r" },
    },
    {
      id: "f-need", cast: "greg", kind: "chat", text: "needs flag", requiresFlags: ["armed"],
      left: { label: "l" }, right: { label: "r" },
    },
    {
      id: "f-once", cast: "colin", kind: "memo", text: "only once", once: true,
      left: { label: "l" }, right: { label: "r" },
    },
    {
      id: "f-late", cast: "colin", kind: "memo", text: "late game", minQuarter: 5,
      left: { label: "l" }, right: { label: "r" },
    },
    {
      id: "f-follow", cast: "priya", kind: "invite", text: "chains",
      left: { label: "l", followup: { card: "f-need", delay: 1 }, setFlags: ["armed"] },
      right: { label: "r" },
    },
    {
      id: "f-doom", cast: "janet", kind: "report", text: "bespoke ending",
      left: { label: "l", ending: "f-end" }, right: { label: "r" },
    },
    {
      id: "f-homily", cast: "saskia", kind: "invite", text: "wisdom",
      left: { label: "l", homily: "f-h1" }, right: { label: "r", homily: "f-h1" },
    },
    ...engine.RITUAL_CYCLE.map((r) => ({
      id: `f-rit-${r}`, cast: "company", kind: "ritual", ritual: r, text: `ritual ${r}`,
      left: { label: "l" }, right: { label: "r" },
    })),
  ],
  HOMILIES: [{ id: "f-h1", text: "t", attribution: "a" }],
  ENDINGS: [{ id: "f-end", title: "t", doc: "memo", body: "b", epitaph: "e" }],
};

function play(state, deck, cardId, side) {
  state.pendingCardId = cardId;
  return engine.choose(state, deck, side);
}

/* effects, clamping, quips */
{
  const s = engine.newGame(1);
  const out = play(s, FIX, "f-basic", "left");
  assert.equal(s.meters.leadership, 50, "leadership 55-5");
  assert.equal(s.meters.team, 58, "team 55+3");
  assert.equal(out.quip, null, "no quip on left");
  const out2 = play(s, FIX, "f-basic", "right");
  assert.equal(s.meters.you, 56, "you 60-4");
  assert.equal(s.headcount, 5, "headcount +1");
  assert.equal(out2.quip, "quipped");
  s.meters.team = 99;
  play(s, FIX, "f-basic", "left");
  assert.equal(s.meters.team, 100, "team clamps at 100 (and ends the run)");
  assert.equal(s.ended, "cult", "meter ceiling ends the run");
}

/* flags gate eligibility; once-cards retire; quarters gate */
{
  const s = engine.newGame(2);
  assert.ok(!engine.isEligible(s, FIX.CARDS.find((c) => c.id === "f-need")), "flag-gated card starts locked");
  assert.ok(!engine.isEligible(s, FIX.CARDS.find((c) => c.id === "f-late")), "minQuarter gates");
  play(s, FIX, "f-flag", "left");
  assert.ok(engine.isEligible(s, FIX.CARDS.find((c) => c.id === "f-need")), "flag unlocks card");
  play(s, FIX, "f-once", "left");
  assert.ok(!engine.isEligible(s, FIX.CARDS.find((c) => c.id === "f-once")), "once-card retires");
  s.weekCount = engine.WEEKS_PER_QUARTER * 4; // quarter 5
  assert.ok(engine.isEligible(s, FIX.CARDS.find((c) => c.id === "f-late")), "late card unlocks by quarter");
}

/* followups are drawn when due */
{
  const s = engine.newGame(3);
  play(s, FIX, "f-follow", "left");
  const next = engine.draw(s, FIX);
  assert.equal(next.id, "f-need", "due followup takes priority");
}

/* rituals fire at each quarter boundary, cycled */
{
  const s = engine.newGame(4);
  for (let i = 0; i < engine.WEEKS_PER_QUARTER; i++) play(s, FIX, "f-flag", "right");
  assert.equal(s.ended, null, "fixture deltas keep the run alive one quarter");
  const ritual = engine.draw(s, FIX);
  assert.equal(ritual.id, "f-rit-budget", "entering Q2 fires the budget ritual");
}

/* bespoke choice endings and homily dedup */
{
  const s = engine.newGame(5);
  const out = play(s, FIX, "f-homily", "left");
  assert.equal(out.homilyId, "f-h1", "homily unlocks");
  const out2 = play(s, FIX, "f-homily", "right");
  assert.equal(out2.homilyId, null, "homily unlocks only once per run");
  const out3 = play(s, FIX, "f-doom", "left");
  assert.equal(out3.ending, "f-end", "choice can force a bespoke ending");
  assert.equal(s.ended, "f-end");
  assert.equal(engine.choose(s, FIX, "left"), null, "no choices after the end");
}

/* titles are a pure function of headcount, escalating with quarter */
{
  assert.equal(engine.titleFor(0, 1), "Team Lead");
  assert.equal(engine.titleFor(4, 1), "Manager");
  assert.equal(engine.titleFor(12, 1), "Group Manager");
  assert.match(engine.titleFor(32, 1), /^Director/);
  assert.match(engine.titleFor(4, 5), /Horizontal Enablement/, "quarter flavour escalates");
  assert.ok(engine.reorgChance(20, 4) > engine.reorgChance(6, 4), "bigger org, bigger target");
}

/* deterministic under seed: same seed, same career */
{
  const trace = (seed) => {
    const s = engine.newGame(seed);
    const ids = [];
    for (let i = 0; i < 500 && !s.ended; i++) {
      const card = engine.draw(s, content);
      assert.ok(card, "deck never runs dry mid-game");
      ids.push(card.id);
      engine.choose(s, content, engine.rand(s) < 0.5 ? "left" : "right");
    }
    return { ids: ids.join(","), ending: s.ended };
  };
  const a = trace(42);
  const b = trace(42);
  assert.deepEqual(a, b, "same seed replays the same career");
}

/* Monte Carlo balance oracle over the real content */
{
  const lengths = [];
  const endings = new Map();
  for (let seed = 1; seed <= 300; seed++) {
    const s = engine.newGame(seed);
    let steps = 0;
    while (!s.ended && steps < 400) {
      const card = engine.draw(s, content);
      assert.ok(card, `deck ran dry (seed ${seed}, week ${s.weekCount})`);
      engine.choose(s, content, engine.rand(s) < 0.5 ? "left" : "right");
      steps++;
    }
    assert.ok(s.ended, `run terminates (seed ${seed})`);
    assert.ok(steps <= engine.WEEKS_PER_QUARTER * engine.FINAL_QUARTER + 1, "no run outlives the final quarter");
    lengths.push(steps);
    endings.set(s.ended, (endings.get(s.ended) || 0) + 1);
  }
  lengths.sort((x, y) => x - y);
  const median = lengths[Math.floor(lengths.length / 2)];
  console.log(`balance: median ${median} weeks, min ${lengths[0]}, max ${lengths[lengths.length - 1]}`);
  console.log("endings:", Object.fromEntries(endings));
  assert.ok(median >= 15, `median run too short for a career: ${median}`);
  assert.ok(median <= 100, `median run too long to stay funny: ${median}`);
  assert.ok(endings.size >= 4, `random careers should find ≥4 exits, found ${endings.size}`);
}

/* storage folds runs into the permanent record (works headless: no localStorage) */
{
  const store = storage.load();
  assert.equal(store.runs, 0);
  const s = engine.newGame(9);
  s.weekCount = 30;
  s.headcount = 11;
  s.unlocked = ["h-code", "h-meetings"];
  s.ended = "burnout";
  storage.recordRun(store, s);
  const s2 = engine.newGame(10);
  s2.weekCount = 12;
  s2.unlocked = ["h-code"];
  s2.ended = "burnout";
  storage.recordRun(store, s2);
  assert.equal(store.runs, 2);
  assert.equal(store.bestWeeks, 30);
  assert.deepEqual(store.homilies, ["h-code", "h-meetings"], "collection dedupes");
  assert.deepEqual(store.endings, ["burnout"], "endings dedupe");
}

console.log("span-of-control engine tests passed");
