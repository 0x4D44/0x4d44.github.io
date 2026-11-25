// mdbench data contract: the committed JSON is schema-valid, public-safe, and aggregates as expected.
//   node --test mdbench/tests/data.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, fmt, validateIndex, validateSuite } from "../lib.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const load = async (f) => JSON.parse(await readFile(join(DATA, f), "utf8"));
const ix = await load("index.json");

test("index is valid: swe and recall have results, strange-machine is planned", () => {
  assert.deepEqual(validateIndex(ix), []);
  assert.deepEqual(ix.suites.map((s) => [s.id, s.status]), [["swe", "results"], ["recall", "results"], ["strange-machine", "planned"]]);
  for (const s of ix.suites.filter((x) => x.status === "planned")) {
    assert.equal(s.file, null);
    assert.match(s.description, /^Coming soon/);
  }
  assert.ok(ix.seats.find((s) => s.id === "o3-high").baseline);
  assert.equal(ix.seats.find((s) => s.id === "opus-5.5-medium").billing, "subscription");
});

for (const s of ix.suites.filter((x) => x.file)) {
  test(`${s.file} is valid against the index`, async () => {
    assert.deepEqual(validateSuite(await load(s.file), ix), []);
  });
}

test("swe: 10 exercises, the six phase-1 seats on all of them, later seats on some", async () => {
  const su = await load("swe.json");
  assert.equal(su.sample, false);
  assert.equal(su.tasks.length, 10);
  const a = aggregate(su);
  assert.ok(a.seats.filter((s) => s.n === 10).length >= 6);
  assert.ok(a.seats.every((s) => s.n >= 1 && s.n <= 10));
  // A single-run cell aggregates to that run's score.
  const row = su.results.find((r) => r.seat === "opus-5.5-medium" && r.task === "FIX-01");
  assert.equal(a.cells["opus-5.5-medium"]["FIX-01"].score.mean, row.metrics.score);
  assert.ok(a.seats.every((s) => s.perDollar > 0 && s.perHour > 0));
  // Leaderboard order is by mean headline, best first.
  const m = a.seats.map((s) => s.per.score);
  assert.deepEqual(m, [...m].sort((x, y) => y - x));
});

test("no sample data ships, and every data file is one the index lists", async () => {
  const listed = new Set(["index.json", ...ix.suites.filter((x) => x.file).map((x) => x.file), ...(ix.pages || []).map((x) => x.file)]);
  for (const f of await readdir(DATA)) {
    assert.ok(listed.has(f), `${f} is not listed in index.json`);
    if (f !== "index.json") assert.equal((await load(f)).sample, false, `${f} is sample data`);
  }
  assert.ok(ix.suites.every((s) => s.status !== "sample"));
});

test("code-mode: every run has an arm, a known task and the numbers the page reads", async () => {
  const page = (ix.pages || []).find((p) => p.id === "code-mode");
  if (!page) return;
  const d = await load(page.file);
  assert.equal(d.schema, "mdbench-site/1");
  const tasks = new Set(d.tasks.map((t) => t.id));
  assert.ok(d.runs.length > 0);
  for (const r of d.runs) {
    assert.ok(["plain", "code"].includes(r.arm), r.arm);
    assert.ok(tasks.has(r.task), r.task);
    for (const k of ["cost_usd", "wall_secs", "api_secs", "turns", "cache_read_tokens", "output_tokens"])
      assert.equal(typeof r[k], "number", `${r.task} ${r.arm} ${k}`);
  }
});

test("FIX-01 carries a task note about the all-gates column", async () => {
  const su = await load("swe.json");
  const t = su.tasks.find((x) => x.id === "FIX-01");
  assert.match(t.note, /Most seats fail the hidden display-register test/);
  const fix = su.results.filter((r) => r.task === "FIX-01");
  assert.ok(fix.filter((r) => r.metrics.gates_ok === false).length > fix.length / 2);
  assert.ok(su.methodology.caveats.some((c) => c.startsWith("FIX-01")));
  const bad = structuredClone(su);
  bad.tasks[0].note = "";
  assert.match(validateSuite(bad, ix).join("\n"), /note must be a non-empty string/);
});

// Structural checks only. The exporter (in the private benchmark repo) holds the full leak
// list; nothing served here repeats it.
test("data files carry only result fields: no hashes, emails, paths or free text fields", async () => {
  for (const f of ["index.json", ...ix.suites.filter((x) => x.file).map((x) => x.file)]) {
    const text = await readFile(join(DATA, f), "utf8");
    assert.doesNotMatch(text, /\b[0-9a-f]{7,40}\b/, `${f}: hex hash`);
    assert.doesNotMatch(text, /@[a-z0-9-]+\.[a-z]{2,}/i, `${f}: email`);
    assert.doesNotMatch(text, /[a-z0-9_]+\/[a-z0-9_]+\.[a-z]{1,4}\b/i, `${f}: file path`);
    assert.doesNotMatch(text, /"(brief|patch|reason|evidence|comment|touched|session_id|thread_id|bonuses)"/, `${f}: private field`);
  }
});

test("validator rejects broken data", async () => {
  const su = await load("swe.json");
  const bad = structuredClone(su);
  bad.results[0].seat = "nobody";
  bad.results[1].metrics.nonsense = 1;
  bad.results[2].metrics.gates_ok = "yes";
  bad.metrics.find((m) => m.id === "rubric").role = "headline";
  const p = validateSuite(bad, ix).join("\n");
  assert.match(p, /unknown seat nobody/);
  assert.match(p, /undeclared metric nonsense/);
  assert.match(p, /gates_ok bad value/);
  assert.match(p, /exactly one headline/);
});

test("a new suite with a new metric aggregates from data alone", () => {
  const su = {
    schema: "mdbench-site/1", suite: "zeta", title: "Zeta", description: "x", sample: false,
    group: { key: "group", label: "Phase", values: [{ id: "p1", label: "Phase 1" }] },
    metrics: [
      { id: "mips", label: "Speed", role: "headline", type: "number", unit: "MIPS", higher_is_better: true, format: { decimals: 2, suffix: " MIPS" } },
      { id: "ok", label: "Boots", type: "bool", higher_is_better: true },
    ],
    tasks: [{ id: "t1", group: "p1", title: "T1", description: "" }],
    results: [
      { seat: "opus-5.5-medium", task: "t1", run: 1, metrics: { mips: 2, ok: true }, flags: [] },
      { seat: "opus-5.5-medium", task: "t1", run: 2, metrics: { mips: 4, ok: false }, flags: [] },
    ],
    methodology: { scoring: [], caveats: [] },
  };
  assert.deepEqual(validateSuite(su, ix), []);
  const a = aggregate(su);
  assert.equal(a.cells["opus-5.5-medium"].t1.mips.mean, 3);
  assert.equal(a.cells["opus-5.5-medium"].t1.mips.n, 2);
  assert.equal(fmt(su.metrics[0], 3), "3.00 MIPS");
  assert.equal(fmt(su.metrics[1], 0.5), "50%");
  assert.equal(a.perDollar, undefined);
});
