// mdbench results: pure data functions (no DOM). Shared by the pages and by the Node tests.
//
// Data contract (schema "mdbench-site/1"), produced by the benchmark repo's exporter:
//   data/index.json   { schema, generated, families[], suites[], seats[] }
//   data/<suite>.json { schema, suite, title, description, sample, sample_note?, group,
//                       metrics[], tasks[], results[], methodology }
// The pages know nothing about any particular suite or metric: everything they show is
// driven by these declarations.

export const SCHEMA = "mdbench-site/1";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isStr = (x) => typeof x === "string" && x.length > 0;

/** Returns a list of problems (empty when valid). */
export function validateIndex(ix) {
  const p = [];
  if (!isObj(ix)) return ["index is not an object"];
  if (ix.schema !== SCHEMA) p.push(`index.schema is ${ix.schema}, want ${SCHEMA}`);
  if (!Array.isArray(ix.families) || !ix.families.length) p.push("index.families missing");
  if (!Array.isArray(ix.suites) || !ix.suites.length) p.push("index.suites missing");
  if (!Array.isArray(ix.seats) || !ix.seats.length) p.push("index.seats missing");
  const fams = new Set((ix.families || []).map((f) => f.id));
  const ids = new Set();
  for (const s of ix.seats || []) {
    for (const k of ["id", "name", "label", "family", "vendor", "model", "harness", "billing", "cost_basis"])
      if (!isStr(s[k])) p.push(`seat ${s.id}: ${k} missing`);
    if (!fams.has(s.family)) p.push(`seat ${s.id}: unknown family ${s.family}`);
    if (!["subscription", "api"].includes(s.billing)) p.push(`seat ${s.id}: billing ${s.billing}`);
    if (!["reported", "estimate"].includes(s.cost_basis)) p.push(`seat ${s.id}: cost_basis ${s.cost_basis}`);
    if (typeof s.baseline !== "boolean") p.push(`seat ${s.id}: baseline not boolean`);
    if (s.released != null && !/^\d{4}-\d{2}(-\d{2})?$/.test(s.released)) p.push(`seat ${s.id}: released ${s.released}`);
    if (ids.has(s.id)) p.push(`seat ${s.id}: duplicate`);
    ids.add(s.id);
  }
  for (const s of ix.suites || []) {
    if (!isStr(s.id) || !isStr(s.title)) p.push(`suite entry without id/title`);
    if (!["results", "sample", "planned"].includes(s.status)) p.push(`suite ${s.id}: status ${s.status}`);
    if (s.status !== "planned" && !isStr(s.file)) p.push(`suite ${s.id}: file missing`);
  }
  return p;
}

/** Validates one suite file against the index's seats. */
export function validateSuite(su, ix) {
  const p = [];
  if (!isObj(su)) return ["suite is not an object"];
  if (su.schema !== SCHEMA) p.push(`${su.suite}: schema ${su.schema}`);
  for (const k of ["suite", "title", "description"]) if (!isStr(su[k])) p.push(`${su.suite}: ${k} missing`);
  if (typeof su.sample !== "boolean") p.push(`${su.suite}: sample not boolean`);
  if (!isObj(su.group) || !Array.isArray(su.group.values)) p.push(`${su.suite}: group missing`);
  const groups = new Set((su.group?.values || []).map((g) => g.id));
  const mids = new Set();
  let headline = 0;
  for (const m of su.metrics || []) {
    if (!isStr(m.id) || !isStr(m.label)) p.push(`${su.suite}: metric without id/label`);
    if (!["number", "bool"].includes(m.type)) p.push(`${su.suite}.${m.id}: type ${m.type}`);
    if (typeof m.higher_is_better !== "boolean") p.push(`${su.suite}.${m.id}: higher_is_better`);
    if (m.role === "headline") headline++;
    if (mids.has(m.id)) p.push(`${su.suite}.${m.id}: duplicate metric`);
    mids.add(m.id);
  }
  if (headline !== 1) p.push(`${su.suite}: want exactly one headline metric, got ${headline}`);
  const tids = new Set();
  for (const t of su.tasks || []) {
    if (!isStr(t.id) || !isStr(t.title)) p.push(`${su.suite}: task without id/title`);
    if (!groups.has(t.group)) p.push(`${su.suite}.${t.id}: unknown group ${t.group}`);
    if (t.note != null && !isStr(t.note)) p.push(`${su.suite}.${t.id}: note must be a non-empty string`);
    tids.add(t.id);
  }
  const seats = new Set((ix?.seats || []).map((s) => s.id));
  const seen = new Set();
  for (const r of su.results || []) {
    const key = `${r.seat}|${r.task}|${r.run}`;
    if (!seats.has(r.seat)) p.push(`${su.suite}: result for unknown seat ${r.seat}`);
    if (!tids.has(r.task)) p.push(`${su.suite}: result for unknown task ${r.task}`);
    if (!Number.isInteger(r.run) || r.run < 1) p.push(`${su.suite}: bad run ${key}`);
    if (seen.has(key)) p.push(`${su.suite}: duplicate result ${key}`);
    seen.add(key);
    if (!isObj(r.metrics)) { p.push(`${su.suite}: ${key} metrics missing`); continue; }
    for (const [k, v] of Object.entries(r.metrics)) {
      const m = (su.metrics || []).find((x) => x.id === k);
      if (!m) p.push(`${su.suite}: ${key} undeclared metric ${k}`);
      else if (m.type === "bool" ? typeof v !== "boolean" : !Number.isFinite(v)) p.push(`${su.suite}: ${key}.${k} bad value ${v}`);
    }
  }
  if (!isObj(su.methodology) || !Array.isArray(su.methodology.scoring) || !Array.isArray(su.methodology.caveats))
    p.push(`${su.suite}: methodology missing`);
  return p;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
const HOURS = { seconds: 1 / 3600, minutes: 1 / 60, hours: 1 };

/**
 * Aggregates a suite:
 *   cells[seat][task][metric] = { mean, sd, n }   (bools as pass rate 0..1)
 *   seats[]: per-seat summary, sorted by headline mean (best first)
 */
export function aggregate(su) {
  const metrics = su.metrics;
  const head = metrics.find((m) => m.role === "headline");
  const cost = metrics.find((m) => m.role === "cost");
  const time = metrics.find((m) => m.role === "time");
  const raw = {};
  for (const r of su.results) {
    const c = ((raw[r.seat] ??= {})[r.task] ??= { flags: new Set(), vals: {} });
    for (const f of r.flags || []) c.flags.add(f);
    for (const [k, v] of Object.entries(r.metrics)) (c.vals[k] ??= []).push(typeof v === "boolean" ? +v : v);
  }
  const cells = {};
  for (const [seat, tasks] of Object.entries(raw)) {
    for (const [task, c] of Object.entries(tasks)) {
      const out = { flags: [...c.flags], runs: 0 };
      for (const [k, vs] of Object.entries(c.vals)) { out[k] = { mean: mean(vs), sd: sd(vs), n: vs.length }; out.runs = Math.max(out.runs, vs.length); }
      (cells[seat] ??= {})[task] = out;
    }
  }
  const seats = Object.keys(cells).map((seat) => {
    const tc = cells[seat];
    const tasks = Object.keys(tc);
    const per = {};
    for (const m of metrics) {
      const vs = tasks.map((t) => tc[t][m.id]?.mean).filter((v) => v != null);
      per[m.id] = vs.length ? mean(vs) : null;
    }
    const sds = tasks.map((t) => tc[t][head.id]?.sd).filter((v) => v != null);
    const groups = {};
    for (const g of su.group.values) {
      const vs = su.tasks.filter((t) => t.group === g.id).map((t) => tc[t.id]?.[head.id]?.mean).filter((v) => v != null);
      groups[g.id] = vs.length ? { mean: mean(vs), n: vs.length } : null;
    }
    const s = {
      seat, n: tasks.filter((t) => tc[t][head.id]).length, per, groups,
      runSd: sds.length ? mean(sds) : null,
      maxRuns: Math.max(...tasks.map((t) => tc[t].runs)),
      flagged: tasks.filter((t) => tc[t].flags.length).length,
    };
    s.perDollar = cost && per[cost.id] > 0 && per[head.id] != null ? per[head.id] / per[cost.id] : null;
    s.perHour = time && per[time.id] > 0 && per[head.id] != null ? per[head.id] / (per[time.id] * (HOURS[time.unit] ?? 1)) : null;
    return s;
  });
  seats.sort((a, b) => (b.per[head.id] ?? -1) - (a.per[head.id] ?? -1) || b.n - a.n);
  return { head, cost, time, cells, seats, ntasks: su.tasks.length };
}

/** Formats one value of a metric. For bool metrics, v is a pass rate 0..1. */
export function fmt(m, v, { single = false } = {}) {
  if (v == null || Number.isNaN(v)) return "–";
  if (m.type === "bool") return single ? (v >= 1 ? "pass" : v <= 0 ? "fail" : `${Math.round(v * 100)}%`) : `${Math.round(v * 100)}%`;
  const f = m.format || {};
  const x = v * (f.scale ?? 1);
  const s = Math.abs(x).toFixed(f.decimals ?? 1);
  const sign = x < 0 ? "−" : f.signed && x > 0 ? "+" : "";
  return `${sign}${f.prefix ?? ""}${s}${f.suffix ?? ""}`;
}

/** 0..1 "goodness" of v for heat shading, over the observed range lo..hi (bools over 0..1). */
export function goodness(m, v, lo, hi) {
  if (v == null) return null;
  const a = m.type === "bool" ? 0 : lo, b = m.type === "bool" ? 1 : hi;
  if (!(b > a)) return 0.5;
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return m.higher_is_better ? t : 1 - t;
}
