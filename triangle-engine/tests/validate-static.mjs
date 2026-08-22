// Static contract for The Triangle Engine: the page must be
// self-contained, the instruments must all be wired to real panels, and
// the narrative data must actually carry the detail the page promises.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const ROOT = resolve(PROJECT, "..");
const [html, css, app, gfx, historySource, catalogSource] = await Promise.all([
  readFile(resolve(PROJECT, "index.html"), "utf8"),
  readFile(resolve(PROJECT, "styles.css"), "utf8"),
  readFile(resolve(PROJECT, "app.js"), "utf8"),
  readFile(resolve(PROJECT, "gfx.js"), "utf8"),
  readFile(resolve(PROJECT, "history.js"), "utf8"),
  readFile(resolve(ROOT, "data.js"), "utf8"),
]);

function evaluateWindowScript(source, filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename });
  return sandbox.window;
}

const H = evaluateWindowScript(historySource, "history.js").TRI_HISTORY;
const catalog = evaluateWindowScript(catalogSource, "data.js");

const TABS = ["lineage", "pipeline", "transform", "raster", "depth", "texture", "shading", "parallel", "rays", "coda", "ledger", "sources"];

test("the page is self-contained and follows the Almanac contract", () => {
  assert.match(html, /<script src="gfx\.js"><\/script>/);
  assert.match(html, /<script src="history\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i, "no remote runtime dependency");
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "no remote CSS asset");
  assert.doesNotMatch(app, /\.innerHTML\s*=/, "dynamic UI uses DOM APIs rather than HTML injection");
  assert.doesNotMatch(app, /\beval\s*\(/, "no eval");
  assert.doesNotMatch(gfx, /\bdocument\b/, "the renderer must not touch the DOM");
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(app, /prefers-reduced-motion/, "the animated hero must honour the motion preference");
});

test("every instrument has a matched, accessible tab and panel", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  const panels = [...html.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs.filter((t, i) => tabs.indexOf(t) === i), TABS);
  assert.deepEqual(panels, TABS);
  for (const name of TABS) {
    assert.match(html, new RegExp(`id="tab-${name}"[^>]+aria-controls="panel-${name}"`));
    assert.match(html, new RegExp(`id="panel-${name}"[^>]+aria-labelledby="tab-${name}"`));
  }
});

test("every canvas the code draws into exists in the markup", () => {
  const drawn = new Set([...app.matchAll(/\$\("([a-z-]+-canvas)"\)/g)].map((m) => m[1]));
  assert.ok(drawn.size >= 10, `expected at least 10 canvases, found ${drawn.size}`);
  for (const id of drawn) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is drawn into but never declared`);
  }
});

test("every control the code binds exists in the markup", () => {
  const bound = new Set([...app.matchAll(/\$\("((?:tf|rs|dp|tx|sh|pl|lt|ry|nz|pipe|timeline)-[a-z]+)"\)/g)].map((m) => m[1]));
  assert.ok(bound.size >= 25, `expected at least 25 bound controls, found ${bound.size}`);
  for (const id of bound) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is bound in app.js but absent from the page`);
  }
});

test("the timeline covers the arc the page claims, in order", () => {
  assert.equal(H.eras.length, 14);
  const years = Array.from(H.eras, (era) => era.year);
  assert.deepEqual([...years].sort((a, b) => a - b), years, "the timeline must run forwards");
  assert.equal(years[0], 1963, "starts at Sketchpad");
  assert.ok(years.at(-1) >= 2018, "reaches hardware ray tracing");
  for (const era of H.eras) {
    assert.ok(era.summary.length > 400, `${era.name} needs a real summary`);
    assert.ok(era.detail.length >= 3, `${era.name} needs supporting detail`);
    assert.ok(era.numbers.length >= 3, `${era.name} needs its numbers`);
    // The label on the chip must agree with the year the header prints.
    assert.ok(era.short.startsWith(String(era.year)), `${era.name}: "${era.short}" does not start at ${era.year}`);
    for (const key of H.stageKeys) {
      assert.ok(era.stages[key.id] in H.stageStates, `${era.name} has no state for ${key.id}`);
    }
  }
});

test("the stage map tells the software → fixed → programmable story", () => {
  const at = (id) => H.eras.find((era) => era.id === id).stages;
  // Utah did everything in software; by OpenGL every stage is silicon;
  // by 2001 two of them take a program you wrote.
  assert.equal(at("utah").raster, "cpu");
  assert.equal(at("utah").fragment, "cpu");
  assert.equal(at("opengl").raster, "fixed");
  assert.equal(at("opengl").texture, "fixed");
  assert.equal(at("shaders").geometry, "prog");
  assert.equal(at("shaders").fragment, "prog");
  assert.equal(at("raytracing").ray, "fixed");
  // Ray tracing hardware is the last thing to arrive, and nothing before
  // 2018 may claim it.
  for (const era of H.eras) {
    if (era.id !== "raytracing") assert.notEqual(era.stages.ray, "fixed", `${era.name} must not have ray hardware`);
  }
});

test("the pipeline has all ten stages, each explained", () => {
  assert.equal(H.pipeline.length, 10);
  assert.deepEqual(
    Array.from(H.pipeline, (stage) => stage.id),
    ["input", "vertex", "clip", "divide", "viewport", "setup", "raster", "fragment", "depth", "blend"],
  );
  for (const stage of H.pipeline) {
    assert.ok(stage.one.length > 20, `${stage.name} needs a one-line summary`);
    assert.ok(stage.body.length > 200, `${stage.name} needs a real explanation`);
    assert.ok(stage.hardware.length > 40, `${stage.name} needs its hardware note`);
  }
});

test("the ledger covers both API families and four decades of hardware", () => {
  const { apis, hardware, families } = H.ledger;
  assert.ok(apis.length >= 30, `only ${apis.length} API entries`);
  assert.ok(hardware.length >= 35, `only ${hardware.length} hardware entries`);

  // Both lanes must run forwards.
  for (const list of [apis, hardware]) {
    const years = Array.from(list, (e) => e.year);
    assert.deepEqual([...years].sort((a, b) => a - b), years, "the ledger must be in date order");
  }

  // The version histories the page is asked about, in full.
  const apiNames = apis.map((e) => e.name).join(" | ");
  for (const version of ["DirectX 1.0", "DirectX 2.0", "DirectX 3.0", "DirectX 5.0", "DirectX 6.0",
    "DirectX 7.0", "DirectX 8.0", "DirectX 8.1", "DirectX 9.0", "DirectX 9.0c", "DirectX 10", "DirectX 11",
    "Direct3D 12", "DirectX 12 Ultimate", "DirectX Raytracing"]) {
    assert.ok(apiNames.includes(version), `${version} is missing from the ledger`);
  }
  for (const version of ["IRIS GL", "OpenGL 1.0", "OpenGL 1.1", "OpenGL 1.2", "OpenGL 1.3", "OpenGL 1.4",
    "OpenGL 1.5", "OpenGL 2.0", "OpenGL 3.0", "OpenGL 3.1 and 3.2", "OpenGL 4.0", "OpenGL 4.3", "OpenGL 4.6"]) {
    assert.ok(apiNames.includes(version), `${version} is missing from the ledger`);
  }
  for (const version of ["Vulkan 1.0", "Metal", "Mantle", "WebGL 1.0", "WebGL 2.0", "WebGPU", "CUDA 1.0", "Glide"]) {
    assert.ok(apiNames.includes(version), `${version} is missing from the ledger`);
  }

  // Hardware from every era, not just the ones the narrative needed.
  const hardwareNames = hardware.map((e) => e.name).join(" | ");
  for (const card of ["RealityEngine", "NV1", "ViRGE", "Vérité", "Voodoo Graphics", "PowerVR", "RIVA 128",
    "Voodoo2", "RIVA TNT", "Savage3D", "GeForce 256", "Radeon (R100)", "Voodoo5", "GeForce 3",
    "Radeon 8500", "Radeon 9700", "GeForce FX", "GeForce 6800", "Xenos", "G80", "R600",
    "Radeon HD 5870", "Fermi", "GCN", "Pascal", "Volta", "Turing", "RDNA", "Apple M1", "Intel Arc", "Ada"]) {
    assert.ok(hardwareNames.includes(card), `${card} is missing from the ledger`);
  }
  // Consoles are hardware too, and they drove the field.
  for (const console_ of ["PlayStation", "Saturn", "Nintendo 64", "Dreamcast", "Xbox"]) {
    assert.ok(hardwareNames.includes(console_), `${console_} is missing from the ledger`);
  }

  // Every entry is complete, and every family is one the filter renders.
  const known = new Set(families.map((f) => f.id));
  for (const entry of [...apis, ...hardware]) {
    assert.ok(known.has(entry.family), `${entry.name} has unknown family ${entry.family}`);
    assert.ok(entry.who && entry.who.length > 2, `${entry.name} has no attribution`);
    assert.ok(entry.what.length > 50, `${entry.name} needs a real description`);
    assert.ok(entry.year >= 1982 && entry.year <= 2026, `${entry.name} has year ${entry.year}`);
  }

  // The cross-links must point at sections that exist, or the ledger is
  // a list of trivia rather than a way back into the explanations.
  const linked = [...apis, ...hardware].filter((e) => e.explains);
  assert.ok(linked.length >= 15, `only ${linked.length} ledger entries link to a section`);
  for (const entry of linked) {
    assert.ok(TABS.includes(entry.explains), `${entry.name} links to unknown section ${entry.explains}`);
  }
});

test("every specific claim carries a citation", () => {
  assert.ok(H.sources.length >= 25, `only ${H.sources.length} sources`);
  for (const source of H.sources) {
    assert.ok(source.claim.length > 30, "a claim must actually say something");
    // A citation needs an author or an issuing body, and a year.
    assert.match(source.cite, /\b(19|20)\d{2}\b/, `no year in: ${source.cite}`);
    assert.ok(source.cite.length > 40, `citation too thin: ${source.cite}`);
  }
  const all = H.sources.map((s) => s.claim + " " + s.cite).join(" ");
  for (const name of ["Sutherland", "Gouraud", "Phong", "Catmull", "Clark", "Pineda", "Williams", "Blinn", "Akeley", "Abrash", "Karis"]) {
    assert.match(all, new RegExp(name), `${name} is discussed but never cited`);
  }
});

test("the closing section pays off the claim the first one makes", () => {
  // The thesis is stated in 01 and must be tested, not merely repeated.
  assert.match(html, /The pipeline never changed/);
  assert.match(html, /The same seven jobs/);
  assert.match(html, /id="coda-grid"/);
  // And it must admit the part that complicates it, rather than ending
  // on a tidy story the page's own section 09 contradicts.
  assert.match(html, /started moving back/i);
  assert.match(html, /Nanite rasterizes/i);
  assert.match(app, /initCoda/);
});

test("every instrument can be operated without a pointer", () => {
  // Three canvases used to be drag-only, with no keyboard path at all.
  for (const id of ["raster-canvas", "transform-canvas", "shading-canvas", "rays-canvas"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*tabindex="0"`), `${id} must be focusable`);
  }
  assert.ok((app.match(/addEventListener\("keydown"/g) || []).length >= 5,
    "each focusable canvas needs its own arrow-key handler");
  // And a phone has no arrow keys.
  assert.match(html, /class="nudge-pad"/);
});

test("the page is explicit about being a model rather than a simulator", () => {
  assert.match(html, /explanatory models of the architectures, not simulations/i);
  assert.match(html, /a model, not a simulator/i);
  assert.match(html, /logical order, not the physical one/i);
});

test("the catalog entry is present and points at this document", () => {
  const entry = catalog.ESSAYS.find((e) => e.slug === "triangle-engine");
  assert.ok(entry, "no data.js entry");
  assert.equal(entry.url, "https://0x4d44.github.io/triangle-engine/");
  assert.equal(entry.real, true);
  assert.equal(entry.illustration, "ill-triangle");
  assert.ok(entry.tagline.length < 340, "the tagline is a hook, not a spec");
  assert.equal(entry.slug, "triangle-engine");
  const shelves = catalog.COLLECTIONS.filter((c) => c.slugs.includes("triangle-engine"));
  assert.ok(shelves.length > 0, "the document must sit on at least one shelf");
  // Every tag must be one the filter row actually renders.
  const vocabulary = new Set(catalog.TAG_GROUPS.flatMap((g) => g.tags));
  for (const tag of entry.tags) assert.ok(vocabulary.has(tag), `unknown tag ${tag}`);
});
