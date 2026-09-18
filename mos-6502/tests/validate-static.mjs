// Contract checks on the shipped files: the Almanac's conventions, the
// page's self-imposed rules, and the claims the prose makes that only
// the source can confirm.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const [html, css, app, cpu, asm, content, lab, catalog] = await Promise.all([
  readFile(resolve(PROJECT, "index.html"), "utf8"),
  readFile(resolve(PROJECT, "styles.css"), "utf8"),
  readFile(resolve(PROJECT, "app.js"), "utf8"),
  readFile(resolve(PROJECT, "cpu.js"), "utf8"),
  readFile(resolve(PROJECT, "asm.js"), "utf8"),
  readFile(resolve(PROJECT, "content.js"), "utf8"),
  readFile(resolve(PROJECT, "lab.js"), "utf8"),
  readFile(resolve(ROOT, "data.js"), "utf8"),
]);

function evaluateWindowScript(source, filename) {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename });
  return sandbox;
}
const catalogWindow = evaluateWindowScript(catalog, "data.js");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("the page is self-contained and follows the Almanac contract", () => {
  for (const file of ["cpu.js", "asm.js", "content.js", "lab.js", "app.js"]) {
    assert.match(html, new RegExp(`<script src="${file.replace(".", "\\.")}"></script>`), `${file} is loaded`);
  }
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i, "no remote runtime dependency");
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "no remote CSS asset");
  assert.doesNotMatch(css, /@import/i, "no imported stylesheet");
  assert.match(html, /<meta name="description" content="[^"]{120,}"/, "a real description");
  assert.match(html, /<title>The 6502 — cycle by cycle<\/title>/);
});

test("the dynamic UI is built with DOM APIs, not HTML strings", () => {
  assert.doesNotMatch(app, /\.innerHTML\s*=/, "no innerHTML assignment");
  assert.doesNotMatch(app, /\.outerHTML\s*=/);
  assert.doesNotMatch(app, /insertAdjacentHTML/);
  assert.doesNotMatch(app, /\beval\s*\(/, "no eval");
  assert.doesNotMatch(app, /new Function\s*\(/);
  // The assembler evaluates expressions itself rather than handing them to JS.
  assert.doesNotMatch(asm, /\beval\s*\(/);
  assert.doesNotMatch(asm, /new Function\s*\(/);
});

test("the stylesheet respects the page-level rules the repo enforces", () => {
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /prefers-reduced-motion/);
  // The shared Almanac pill occupies 0,0 to 109x41 at every width.
  assert.match(css, /padding:\s*104px 28px 68px 132px/, "the hero clears the pill");
  assert.match(css, /padding:\s*0 20px 0 122px/, "the sticky nav clears the pill");
  // Inside a media query a bare 1fr keeps its min-content floor.
  const media = css.split(/@media/).slice(1).join("@media");
  const bare = media.match(/grid-template-columns:[^;]*(?<![(,]\s*)\b1fr\b[^;]*;/g) || [];
  assert.deepEqual(bare, [], `bare 1fr inside a media query: ${bare.join(" | ")}`);
});

test("all ten instruments have matched accessible tabs and panels", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  const panels = [...html.matchAll(/data-panel="([^"]+)"/g)].map((match) => match[1]);
  const expected = ["origins", "model", "cycles", "addressing", "alu", "matrix", "machine", "interrupts", "quirks", "sources"];
  assert.deepEqual(tabs.filter((t) => expected.includes(t)), expected);
  assert.deepEqual(panels, expected);
  for (const name of expected) {
    assert.match(html, new RegExp(`id="tab-${name}"[^>]+aria-controls="panel-${name}"`));
    assert.match(html, new RegExp(`id="panel-${name}"[^>]+aria-labelledby="tab-${name}"`));
  }
});

test("every element app.js reaches for exists in the HTML", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const wanted = [...app.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
  const missing = [...new Set(wanted)].filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `app.js addresses ids the page does not have: ${missing.join(", ")}`);
});

test("the emulator is honest about being a model, and says where it stops", () => {
  assert.match(html, /does not model/i);
  assert.match(html, /30,646,177 instructions/, "the conformance claim is stated with its number");
  const { SIX502 } = evaluateWindowScript(`${cpu}\n${asm}\n${content}`, "content.js");
  assert.ok(SIX502.LIMITS.length >= 4);
  assert.match(SIX502.LIMITS.join(" "), /unstable/i);
});

test("the conformance claim on the page is the one the test suite checks", async () => {
  const conformance = await readFile(resolve(PROJECT, "tests/conformance.test.mjs"), "utf8");
  const onPage = /30,646,177/.test(html) && /\$3469/.test(html);
  assert.ok(onPage, "the page states the instruction count and the success trap");
  assert.match(conformance, /30,646,177/);
  assert.match(conformance, /0x3469/);
  const { SIX502 } = evaluateWindowScript(`${cpu}\n${asm}\n${content}`, "content.js");
  const dormann = SIX502.SOURCES.find((source) => /Dormann/.test(source.pub));
  assert.ok(dormann, "the suite is credited");
  assert.match(dormann.href, /^https:\/\/github\.com\/Klaus2m5\//);
});

test("the third-party conformance binary is not vendored into the repository", async () => {
  const ignore = await readFile(resolve(ROOT, ".gitignore"), "utf8");
  assert.match(ignore, /mos-6502\/tests\/vendor\//, "the GPL binary stays out of the tree");
});

test("the project is discoverable in the Almanac", () => {
  const essays = plain(catalogWindow.window.ESSAYS || catalogWindow.ESSAYS);
  const collections = plain(catalogWindow.window.COLLECTIONS || catalogWindow.COLLECTIONS);
  const entry = essays.find((item) => item.slug === "mos-6502");
  assert.ok(entry, "the catalog entry exists");
  assert.equal(entry.url, "https://0x4d44.github.io/mos-6502/");
  assert.equal(entry.real, true);
  assert.ok(entry.tagline.length > 120 && entry.tagline.split(/\s+/).length <= 60, "the tagline is a hook, not a spec");
  const tags = entry.tags || [entry.tag];
  assert.ok(tags.includes("software"));
  assert.ok(tags.includes("engineering"));
  assert.ok(tags.includes("history"));
  const shelved = collections.filter((collection) => collection.slugs.includes("mos-6502")).map((c) => c.id);
  assert.ok(shelved.length >= 1, "it sits on at least one shelf, or it falls into Unshelved");
  assert.ok(shelved.includes("machine"), `expected the Machine Room, got ${shelved.join(", ")}`);
});

test("the illustration the entry names exists in the sprite", async () => {
  const index = await readFile(resolve(ROOT, "index.html"), "utf8");
  const essays = plain(catalogWindow.window.ESSAYS || catalogWindow.ESSAYS);
  const entry = essays.find((item) => item.slug === "mos-6502");
  assert.match(index, new RegExp(`<symbol id="${entry.illustration}"`), `${entry.illustration} is in the sprite`);
});

test("the colophon's file count is the number of files there actually are", async () => {
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(PROJECT);
  const shipped = names.filter((name) => /\.(js|css|html)$/.test(name));
  const stated = /No frameworks, no build step, no network\. (\w+) files:/.exec(html);
  assert.ok(stated, "the colophon states a file count");
  const WORDS = { Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10 };
  assert.equal(WORDS[stated[1]], shipped.length,
    `the colophon says ${stated[1]} but ${shipped.length} files ship: ${shipped.sort().join(", ")}`);
});
