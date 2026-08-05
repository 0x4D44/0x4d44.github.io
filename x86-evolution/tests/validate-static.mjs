import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const [html, css, app, cpuData, catalog] = await Promise.all([
  readFile(resolve(PROJECT, "index.html"), "utf8"),
  readFile(resolve(PROJECT, "styles.css"), "utf8"),
  readFile(resolve(PROJECT, "app.js"), "utf8"),
  readFile(resolve(PROJECT, "cpu-data.js"), "utf8"),
  readFile(resolve(ROOT, "data.js"), "utf8"),
]);

function evaluateWindowScript(source, filename) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename });
  return sandbox.window;
}

const dataWindow = evaluateWindowScript(cpuData, "cpu-data.js");
const catalogWindow = evaluateWindowScript(catalog, "data.js");
const data = dataWindow.X86_DATA;

test("the page is self-contained and follows the Almanac contract", () => {
  assert.match(html, /<script src="cpu-data\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i, "no remote runtime dependency");
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "no remote CSS asset");
  assert.doesNotMatch(app, /\.innerHTML\s*=/, "dynamic UI uses DOM APIs rather than HTML injection");
  assert.doesNotMatch(app, /\beval\s*\(/, "no eval");
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /prefers-reduced-motion/);
});

test("all eight instruments have matched accessible tabs and panels", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  const panels = [...html.matchAll(/data-panel="([^"]+)"/g)].map((match) => match[1]);
  const expected = ["lineage", "decode", "pipeline", "superscalar", "branches", "cache", "cycles", "sources"];
  assert.deepEqual(tabs, expected);
  assert.deepEqual(panels, expected);
  for (const name of expected) {
    assert.match(html, new RegExp(`id="tab-${name}"[^>]+aria-controls="panel-${name}"`));
    assert.match(html, new RegExp(`id="panel-${name}"[^>]+aria-labelledby="tab-${name}"`));
  }
});

test("the historical data covers the intended architectural arc", () => {
  assert.ok(data, "X86_DATA exists");
  assert.deepEqual(Array.from(data.generations, (cpu) => cpu.id), ["8086", "286", "386", "486", "pentium", "p6", "piii", "p4"]);
  assert.deepEqual(Array.from(data.generations, (cpu) => cpu.year), [1978, 1982, 1985, 1989, 1993, 1995, 1999, 2000]);
  assert.equal(data.generations[0].transistors, 29_000);
  assert.equal(data.generations.at(-1).transistors, 42_000_000);
  for (const cpu of data.generations) {
    assert.ok(cpu.architecture.length >= 4, `${cpu.name} has architectural detail`);
    assert.ok(cpu.isa.length >= 4, `${cpu.name} has ISA examples`);
    assert.ok(cpu.stages.length >= 4, `${cpu.name} has a pipeline model`);
    assert.ok(cpu.summary.length > 180, `${cpu.name} has explanatory prose`);
  }
});

test("the decoder corpus spans original, 32-bit, MMX, SSE and SSE2 encodings", () => {
  assert.equal(data.decodePresets.length, 7);
  const labels = data.decodePresets.map((preset) => preset.label).join(" ");
  for (const term of ["8086", "386", "MMX", "Pentium III", "Pentium 4"]) assert.match(labels, new RegExp(term));
  for (const preset of data.decodePresets) {
    assert.match(preset.bytes, /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/);
    assert.ok(preset.expected.length > 4);
    assert.ok(preset.explanation.length > 60);
  }
});

test("models are explicitly separated from product claims", () => {
  assert.match(html, /explanatory model/i);
  assert.match(html, /not a transistor-level simulator/i);
  assert.match(html, /not a benchmark or product performance claim/i);
  assert.match(html, /does not assert that its tiny tables exactly reproduce/i);
  for (const cpu of data.branchCpuPresets) assert.ok(/illustrative|teaching|representative/i.test(cpu.note));
});

test("the source ledger is substantial, HTTPS-only and tied to the eras", () => {
  assert.ok(data.sources.length >= 10);
  for (const source of data.sources) {
    assert.match(source.href, /^https:\/\//);
    assert.ok(source.title.length > 20);
    assert.ok(source.use.length > 25);
  }
  const eras = data.sources.map((source) => source.era).join(" ");
  for (const era of ["8086", "80286", "Intel386", "Intel486", "Pentium", "P6", "Pentium III", "Pentium 4"]) assert.match(eras, new RegExp(era));
});

test("the project is discoverable in both relevant Almanac shelves", () => {
  const essays = catalogWindow.ESSAYS;
  const collections = catalogWindow.COLLECTIONS;
  assert.ok(Array.isArray(essays));
  const item = essays.find((entry) => entry.slug === "x86-evolution");
  assert.ok(item, "catalog entry exists");
  assert.equal(item.url, "https://0x4d44.github.io/x86-evolution/");
  assert.ok(item.tags.includes("engineering"));
  assert.ok(item.tags.includes("history"));
  const science = collections.find((collection) => collection.id === "science");
  const machine = collections.find((collection) => collection.id === "machine");
  assert.ok(science.slugs.includes("x86-evolution"), "Science Bench includes the project");
  assert.ok(machine.slugs.includes("x86-evolution"), "Machine Room includes the project");
});
