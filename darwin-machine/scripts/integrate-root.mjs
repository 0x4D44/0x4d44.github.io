import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = resolve(PROJECT, "..");

async function update(path, transform) {
  const original = await readFile(path, "utf8");
  const changed = transform(original);
  if (changed !== original) await writeFile(path, changed);
}

const essay = `  {\n    slug: "darwin-machine",\n    title: "The Darwin Machine",\n    tagline: "A living artificial-evolution laboratory: every coloured speck is executable bytecode gathering energy, copying itself, mutating and competing for space. Inspect genomes instruction by instruction, trigger bottlenecks and mutation meltdown, save exact histories—and follow the entirely sober road to Windows 3.1. Rust + WebAssembly in a dedicated Worker; deterministic, offline and private.",\n    url: "https://0x4d44.github.io/darwin-machine/",\n    illustration: "ill-darwin",\n    date: "2026-08-01T21:30:00",\n    year: 1990,\n    readingMin: 18,\n    words: 4200,\n    tags: ["simulation", "science", "software"],\n    real: true,\n  },\n`;

await update(resolve(ROOT, "data.js"), (source) => {
  let next = source;
  if (!next.includes('slug: "darwin-machine"')) {
    const anchor = "window.ESSAYS = [\n";
    if (!next.includes(anchor)) throw new Error("data.js ESSAYS anchor not found");
    next = next.replace(anchor, `${anchor}${essay}`);
  }
  const addToShelf = (id, slugAfter) => {
    const shelf = new RegExp(`(\\{ id: "${id}"[\\s\\S]*?slugs: \\[)([^\\]]*)(\\] \\})`);
    const match = next.match(shelf);
    if (!match) throw new Error(`Collection ${id} not found`);
    if (match[2].includes('"darwin-machine"')) return;
    const body = match[2].trimStart();
    next = next.replace(shelf, `$1"darwin-machine", ${body}$3`);
  };
  addToShelf("science");
  addToShelf("machine");
  return next;
});

const symbol = `\n    <!-- The Darwin Machine — a bytecode organism under the microscope -->\n    <symbol id="ill-darwin" viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">\n      <path d="M28 92 C36 49 62 25 100 25 C138 25 164 49 172 92"/>\n      <circle cx="76" cy="64" r="17"/><circle cx="124" cy="64" r="17"/>\n      <path d="M90 91 Q100 98 110 91"/>\n      <path d="M52 44 L38 30 M148 44 L162 30 M100 25 V10"/>\n      <g fill="currentColor" stroke="none">\n        <rect x="54" y="58" width="5" height="5"/><rect x="141" y="72" width="5" height="5"/>\n        <rect x="97" y="37" width="5" height="5"/><rect x="92" y="72" width="5" height="5"/>\n      </g>\n      <path d="M22 106 H178" stroke-dasharray="3 5" opacity=".65"/>\n    </symbol>\n`;
await update(resolve(ROOT, "index.html"), (source) => {
  if (source.includes('id="ill-darwin"')) return source;
  const at = source.lastIndexOf("</svg>");
  if (at < 0) throw new Error("root SVG sprite closing tag not found");
  return `${source.slice(0, at)}${symbol}${source.slice(at)}`;
});

await update(resolve(ROOT, "package.json"), (source) => {
  const pkg = JSON.parse(source);
  pkg.scripts ||= {};
  const focused = "node darwin-machine/tests/validate-static.mjs && node darwin-machine/tests/browser.test.mjs && node --check darwin-machine/app.js && node --check darwin-machine/worker.js && node --check darwin-machine/sw.js && node --check data.js";
  pkg.scripts["test:darwin-machine"] = focused;
  const add = (name, command) => {
    const current = pkg.scripts[name] || "";
    if (!current.includes(command)) pkg.scripts[name] = current ? `${current} && ${command}` : command;
  };
  add("test", "node darwin-machine/tests/validate-static.mjs && node darwin-machine/tests/browser.test.mjs");
  add("build", "node darwin-machine/tests/validate-static.mjs");
  return `${JSON.stringify(pkg, null, 2)}\n`;
});

console.log("Darwin Machine root integration is present and idempotent.");
