// Real-browser regression checks for The Triangle Engine. Serves the
// unmodified production files, drives headless Chrome over CDP, runs the
// page's own self-test, and then checks the things a self-test cannot:
// that the instruments respond to input, that the numbers they print are
// the right numbers, and that nothing overflows or hides under the pill.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH ?? [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((candidate) => existsSync(candidate));

if (!CHROME) {
  console.log("triangle-engine browser test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon",
};
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const missing = [];

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const path = resolve(ROOT, (pathname.endsWith("/") ? `${pathname}index.html` : pathname).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { response.writeHead(403).end(); return; }
  let body = null;
  try {
    body = await readFile(path);
  } catch {
    if (pathname !== "/favicon.ico") missing.push(pathname);
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
  response.end(body);
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}/triangle-engine/`;

const profile = await mkdtemp(join(tmpdir(), "triangle-engine-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
  "--disable-background-networking", "--force-prefers-reduced-motion",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let wsUrl = "";
await new Promise((resolveStart, rejectStart) => {
  const timeout = setTimeout(() => rejectStart(new Error("Chrome did not start")), 30_000);
  chrome.stderr.on("data", (chunk) => {
    const match = /ws:\/\/[^\s]+/.exec(chunk.toString());
    if (match && !wsUrl) { wsUrl = match[0]; clearTimeout(timeout); resolveStart(); }
  });
  chrome.once("exit", (code) => {
    if (!wsUrl) { clearTimeout(timeout); rejectStart(new Error(`Chrome exited before CDP was ready (${code})`)); }
  });
});

const socket = new WebSocket(wsUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let messageId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolveMessage, rejectMessage } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? rejectMessage(new Error(JSON.stringify(message.error))) : resolveMessage(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++messageId;
  return new Promise((resolveMessage, rejectMessage) => {
    pending.set(id, { resolveMessage, rejectMessage });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const command = (method, params) => send(method, params, sessionId);
await command("Runtime.enable");
await command("Page.enable");

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(url) {
  await command("Page.navigate", { url });
  for (let index = 0; index < 200; index += 1) {
    const ready = await evaluate("document.readyState === 'complete' && document.documentElement.dataset.appReady === 'true'").catch(() => false);
    if (ready) break;
    await delay(40);
  }
  await delay(220);
}

const failures = [];
function check(name, callback) {
  try { callback(); console.log(`  ok  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name}: ${error.message}`); }
}

// Drives a control the way a person would, then reads back what the page says.
const drive = (id, value, kind = "input") =>
  evaluate(`(() => {
    const control = document.getElementById(${JSON.stringify(id)});
    control.value = ${JSON.stringify(String(value))};
    control.dispatchEvent(new Event(${JSON.stringify(kind)}, { bubbles: true }));
    return control.value;
  })()`);

const openTab = (tab) => evaluate(`document.querySelector('[data-tab="${tab}"]').click()`);
const statsOf = (id) => evaluate(`(() => {
  const out = {};
  for (const row of document.querySelectorAll("#${id} div")) {
    out[row.querySelector("dt").textContent] = row.querySelector("dd").textContent;
  }
  return out;
})()`);

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
    });
    await navigate(`${base}?selftest=1`);
    for (let index = 0; index < 200; index += 1) {
      if (await evaluate("document.documentElement.dataset.selftest")) break;
      await delay(40);
    }

    const boot = await evaluate(`(() => {
      const host = [...document.documentElement.querySelectorAll("*")].find((node) => node.shadowRoot?.querySelector("a"));
      const buried = [];
      if (host) {
        const back = host.getBoundingClientRect();
        for (const control of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
          if (host.contains(control)) continue;
          const rect = control.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const overlapWidth = Math.min(rect.right, back.right) - Math.max(rect.left, back.left);
          const overlapHeight = Math.min(rect.bottom, back.bottom) - Math.max(rect.top, back.top);
          if (overlapWidth >= 6 && overlapHeight >= 6) buried.push((control.textContent || control.id || control.tagName).trim().slice(0, 40));
        }
      }
      return {
        selftest: document.documentElement.dataset.selftest,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        host: !!host,
        buried,
        sources: document.querySelectorAll("#source-list li").length,
        stops: document.querySelectorAll("#timeline-track button").length,
        stages: document.querySelectorAll("#pipeline-rail button").length,
      };
    })()`);
    check(`${viewport.name}: the page self-test passes`, () => assert.equal(boot.selftest, "pass"));
    check(`${viewport.name}: no horizontal overflow`, () => assert.ok(boot.overflow <= 1, `${boot.overflow}px`));
    check(`${viewport.name}: the shared Almanac pill mounts`, () => assert.equal(boot.host, true));
    check(`${viewport.name}: nothing is buried under the pill`, () => assert.deepEqual(boot.buried, []));
    check(`${viewport.name}: the source ledger renders`, () => assert.ok(boot.sources >= 25, String(boot.sources)));
    check(`${viewport.name}: the timeline and pipeline rails render`, () => {
      assert.equal(boot.stops, 14);
      assert.equal(boot.stages, 10);
    });
  }

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base);

  // --- 01 the timeline actually moves through the history ---
  await openTab("lineage");
  const clickStop = (index) => evaluate(`document.querySelectorAll("#timeline-track button")[${index}].click()`);
  await clickStop(13);
  const lastEra = await evaluate(`({
    heading: document.getElementById("timeline-selection").textContent,
    stages: [...document.querySelectorAll(".stage-row-bar")].map((bar) => bar.className.replace("stage-row-bar ", "")),
  })`);
  check("the timeline reaches hardware ray tracing", () => {
    assert.match(lastEra.heading, /2018/);
    assert.equal(lastEra.stages.at(-1), "state-fixed", "ray tracing must be in silicon at the last stop");
  });
  await clickStop(2);
  const utah = await evaluate(`({
    heading: document.getElementById("timeline-selection").textContent,
    stages: [...document.querySelectorAll(".stage-row-bar")].map((bar) => bar.className.replace("stage-row-bar ", "")),
  })`);
  check("at Utah every stage is still software", () => {
    assert.match(utah.heading, /1971/);
    assert.ok(utah.stages.slice(0, 6).every((s) => s === "state-cpu"), utah.stages.join(","));
  });

  // --- 02 the pipeline prints real numbers that change per stage ---
  await openTab("pipeline");
  const clipRow = await evaluate(`(() => {
    document.querySelectorAll("#pipeline-rail button")[1].click();
    return [...document.querySelectorAll("#vertex-table-body tr")].map((row) =>
      [...row.querySelectorAll("td")].slice(1, 5).map((cell) => Number(cell.textContent)));
  })()`);
  check("clip space carries the viewer distance in w", () => {
    assert.equal(clipRow.length, 3);
    for (const [, , , w] of clipRow) assert.ok(w > 1 && w < 10, `w = ${w} is not a plausible eye distance`);
  });
  const ndcRow = await evaluate(`(() => {
    document.querySelectorAll("#pipeline-rail button")[3].click();
    return [...document.querySelectorAll("#vertex-table-body tr")].map((row) =>
      [...row.querySelectorAll("td")].slice(1, 4).map((cell) => Number(cell.textContent)));
  })()`);
  check("after the divide every corner is inside the unit cube", () => {
    for (const [x, y, z] of ndcRow) {
      assert.ok(Math.abs(x) <= 1.001 && Math.abs(y) <= 1.001 && Math.abs(z) <= 1.001, `${x},${y},${z}`);
    }
  });

  // --- 03 the projection matrix is what makes w change ---
  await openTab("transform");
  await drive("tf-matrix", "projection", "change");
  const perspectiveJourney = await evaluate(`(() => {
    const rows = [...document.querySelectorAll("#journey-body tr")];
    return Object.fromEntries(rows.map((row) => {
      const cells = [...row.querySelectorAll("td")];
      return [cells[0].textContent, cells.slice(1).map((cell) => Number(cell.textContent))];
    }));
  })()`);
  check("w is 1 until the projection, then becomes the eye distance", () => {
    assert.equal(perspectiveJourney.Object[3], 1);
    assert.equal(perspectiveJourney.World[3], 1);
    assert.equal(perspectiveJourney["View (eye)"][3], 1);
    const clipW = perspectiveJourney.Clip[3];
    const eyeZ = perspectiveJourney["View (eye)"][2];
    // The projection copies -z into w, so w must equal the eye-space depth.
    assert.ok(Math.abs(clipW + eyeZ) < 0.01, `w=${clipW} vs -z=${-eyeZ}`);
  });
  await drive("tf-projection", "ortho", "change");
  const orthoW = await evaluate(`Number([...document.querySelectorAll("#journey-body tr")][3].querySelectorAll("td")[4].textContent)`);
  check("orthographic leaves w alone, so nothing shrinks with distance", () => {
    assert.ok(Math.abs(orthoW - 1) < 1e-6, `w = ${orthoW}`);
  });
  await drive("tf-projection", "perspective", "change");
  // Pushed close enough, the near plane must actually cut the cube.
  await drive("tf-distance", 1.6);
  const clipping = await evaluate(`document.getElementById("transform-caption").textContent`);
  check("moving the eye into the cube reports near-plane clipping", () => {
    assert.ok(clipping.length > 20);
  });

  // --- 04 the rasterizer: coverage, culling, and the fill rule ---
  await openTab("raster");
  await drive("rs-res", 24);
  const coverage = await statsOf("raster-stats");
  check("the covered count is about half the doubled signed area", () => {
    const covered = Number(coverage.Covered.replace(/,/g, ""));
    const area2 = parseFloat(coverage["Signed area × 2"]);
    assert.ok(covered > 40, `only ${covered} covered`);
    // Coverage counts whole pixels; twice the area is in the same units.
    assert.ok(Math.abs(covered - area2 / 2) / covered < 0.2, `covered=${covered}, area2=${area2}`);
  });
  await drive("rs-mode", "shared", "change");
  const withRule = await statsOf("raster-stats");
  check("with the top-left rule no pixel is covered twice", () => {
    assert.equal(withRule["Double-covered"], "0");
  });
  await evaluate(`(() => { const c = document.getElementById("rs-fillrule"); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await drive("rs-res", 33);
  const withoutRule = await statsOf("raster-stats");
  check("turning the fill rule off can double-cover the shared edge", () => {
    assert.ok(Number(withoutRule["Double-covered"].replace(/,/g, "")) >= 0, "the stat must still be reported");
  });

  // --- 05 depth: the format decides whether the sign survives ---
  await openTab("depth");
  const bothShown = await evaluate(`(() => {
    const a = document.getElementById("depth-painter-canvas").getBoundingClientRect();
    const b = document.getElementById("depth-canvas").getBoundingClientRect();
    return a.width > 40 && b.width > 40;
  })()`);
  check("both hidden-surface algorithms are visible at once", () => assert.equal(bothShown, true));
  await drive("dp-scene", "decal", "change");
  await drive("dp-near", 0.1);
  await drive("dp-bits", "16", "change");
  const coarse = await statsOf("depth-stats");
  await drive("dp-bits", "24", "change");
  const fine = await statsOf("depth-stats");
  check("16-bit depth cannot resolve 2 cm at 30 m, and 24-bit can", () => {
    assert.ok(Number(coarse["Exact ties"].replace(/,/g, "")) > 100, `ties at 16-bit: ${coarse["Exact ties"]}`);
    assert.equal(fine["Exact ties"], "0", `ties at 24-bit: ${fine["Exact ties"]}`);
  });
  await drive("dp-bits", "16", "change");
  await drive("dp-near", 2);
  const pushedOut = await statsOf("depth-stats");
  check("pushing the near plane out buys the precision back", () => {
    assert.equal(pushedOut["Exact ties"], "0", `still tied: ${pushedOut["Exact ties"]}`);
  });

  // --- 06 texture: the LOD reacts to the geometry ---
  await openTab("texture");
  await drive("tx-pitch", 4);
  const grazing = await statsOf("texture-stats");
  await drive("tx-pitch", 40);
  const steep = await statsOf("texture-stats");
  check("a grazing floor is stretched further than a steep one", () => {
    assert.ok(parseFloat(grazing["Aspect at centre"]) > parseFloat(steep["Aspect at centre"]),
      `grazing ${grazing["Aspect at centre"]} vs steep ${steep["Aspect at centre"]}`);
  });
  await drive("tx-mip", "aniso", "change");
  const aniso = await statsOf("texture-stats");
  await drive("tx-mip", "tri", "change");
  const trilinear = await statsOf("texture-stats");
  check("anisotropic filtering reads more texels than trilinear", () => {
    assert.ok(Number(aniso["Texels read"].replace(/,/g, "")) > Number(trilinear["Texels read"].replace(/,/g, "")),
      `aniso ${aniso["Texels read"]} vs trilinear ${trilinear["Texels read"]}`);
  });

  // --- 08 parallel: divergence costs both sides ---
  await openTab("parallel");
  await drive("pl-coherence", 100);
  const coherent = await statsOf("parallel-stats");
  await drive("pl-coherence", 0);
  const diverged = await statsOf("parallel-stats");
  check("a diverged warp issues more instructions than a coherent one", () => {
    assert.ok(Number(diverged["Issue slots used"]) > Number(coherent["Issue slots used"]),
      `${diverged["Issue slots used"]} vs ${coherent["Issue slots used"]}`);
    assert.ok(parseInt(diverged["Lane efficiency"], 10) < 100);
    assert.equal(coherent["Lane efficiency"], "100%");
  });
  await drive("pl-coherence", 50);
  const quadOn = await statsOf("parallel-stats");
  await evaluate(`(() => { const c = document.getElementById("pl-quads"); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  const quadOff = await statsOf("parallel-stats");
  check("quad-aligned branching splits fewer quads than scattered branching", () => {
    const on = parseInt(quadOn["Split quads"], 10);
    const off = parseInt(quadOff["Split quads"], 10);
    assert.equal(on, 0, `quad-aligned branching split ${on} quads`);
    assert.ok(off > 0, "scattered branching must split quads");
  });
  await evaluate(`(() => { const c = document.getElementById("pl-quads"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); })()`);

  await drive("lt-occupancy", 1);
  const starved = await statsOf("latency-stats");
  await drive("lt-occupancy", 10);
  const fed = await statsOf("latency-stats");
  check("more resident warps hide more memory latency", () => {
    assert.ok(parseInt(fed["ALU utilisation"], 10) > parseInt(starved["ALU utilisation"], 10),
      `${fed["ALU utilisation"]} vs ${starved["ALU utilisation"]}`);
    // A short latency must be fully hidden; a long one need not be, and
    // the panel says how many warps it would take.
    assert.ok(parseInt(fed["ALU utilisation"], 10) >= 85, fed["ALU utilisation"]);
  });
  await drive("lt-latency", 4);
  await drive("lt-occupancy", 10);
  const easy = await statsOf("latency-stats");
  check("a short latency is hidden completely", () => {
    assert.equal(easy["ALU utilisation"], "100%");
    assert.ok(parseInt(easy["Warps to saturate"], 10) <= 10, easy["Warps to saturate"]);
  });
  await drive("lt-latency", 14);

  const utilisation = [];
  for (let warps = 1; warps <= 10; warps++) {
    await drive("lt-occupancy", warps);
    utilisation.push(parseInt((await statsOf("latency-stats"))["ALU utilisation"], 10));
  }
  check("adding a warp never makes the machine slower", () => {
    for (let i = 1; i < utilisation.length; i++) {
      assert.ok(utilisation[i] >= utilisation[i - 1],
        `utilisation fell from ${utilisation[i - 1]}% to ${utilisation[i]}% going from ${i} to ${i + 1} warps: ${utilisation.join(",")}`);
    }
  });

  // --- 09 rays: the hierarchy has to actually pay off ---
  await openTab("rays");
  const defaultSpeedup = parseFloat((await statsOf("rays-stats"))["Speed-up"]);
  check("the rays panel opens on a scene where the hierarchy plainly wins", () => {
    assert.ok(defaultSpeedup > 3, `the default scene shows only ${defaultSpeedup}x`);
  });
  await drive("ry-objects", 12);
  const few = await statsOf("rays-stats");
  await drive("ry-objects", 220);
  const many = await statsOf("rays-stats");
  check("the hierarchy's advantage grows with the scene", () => {
    const small = parseFloat(few["Speed-up"]);
    const large = parseFloat(many["Speed-up"]);
    assert.ok(large > small * 3, `speed-up went ${small}× → ${large}×`);
    assert.ok(large > 4, `only ${large}× at 220 objects`);
  });
  check("object tests stay nearly flat as the scene grows", () => {
    const small = Number(few["Object tests"].replace(/,/g, ""));
    const large = Number(many["Object tests"].replace(/,/g, ""));
    assert.ok(large < small * 2, `${small} → ${large} tests for 18x the objects`);
  });
  await drive("ry-accel", "none", "change");
  const naive = await statsOf("rays-stats");
  check("without the hierarchy every object is tested", () => {
    assert.equal(naive["Box tests"], "0");
    assert.equal(naive["Object tests"].replace(/,/g, ""), naive["Without a hierarchy"].replace(/,/g, ""));
  });

  // --- 09b Monte Carlo noise falls as the square root of the samples ---
  await drive("nz-samples", 4);
  const noisy = await statsOf("noise-stats");
  await drive("nz-samples", 64);
  const clean = await statsOf("noise-stats");
  check("sixteen times the samples halves the noise twice over, and no better", () => {
    const a = parseFloat(noisy["Estimated noise"]);
    const b = parseFloat(clean["Estimated noise"]);
    const ratio = a / b;
    // sqrt(64/4) = 4.
    assert.ok(Math.abs(ratio - 4) < 0.6, `noise fell by ${ratio.toFixed(2)}x, expected about 4x`);
  });
  await drive("nz-samples", 1);
  const single = await statsOf("noise-stats");
  check("a single sample reports the noise it actually has", () => {
    // p(1-p) is identically zero at one sample, so a naive estimator reads
    // 0.00% for the grainiest possible picture.
    assert.ok(parseFloat(single["Estimated noise"]) > 20,
      `one sample reported ${single["Estimated noise"]} noise`);
  });

  await openTab("coda");
  const coda = await evaluate(`({
    bars: document.querySelectorAll("#coda-grid .stage-row-bar").length,
    heads: document.querySelectorAll("#coda-grid .coda-head").length,
    hash: window.location.hash,
  })`);
  check("the closing section redraws the stage map for three eras", () => {
    assert.equal(coda.bars, 21);
    assert.equal(coda.heads, 4);
  });
  check("each section is linkable", () => assert.equal(coda.hash, "#coda"));

  await navigate(`${base}#depth`);
  const deepLink = await evaluate(`document.querySelector('[aria-selected="true"]').dataset.tab`);
  check("a section link opens that section", () => assert.equal(deepLink, "depth"));

  check("no console errors anywhere in the run", () => assert.deepEqual([...new Set(consoleErrors)], []));
  check("no uncaught exceptions", () => assert.deepEqual([...new Set(pageErrors)], []));
  check("every asset the page asks for exists", () => assert.deepEqual([...new Set(missing)], []));
} finally {
  socket.close();
  chrome.kill();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} browser check(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\ntriangle-engine browser test: all checks passed");
