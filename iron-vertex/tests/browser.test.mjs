// Boots Iron Vertex in headless Chrome with a software WebGL backend and
// checks the things only a real browser can answer: that the scene builds,
// that the ride actually moves, that the controls are hittable where they
// appear, and that nothing throws along the way.
//
// Synthetic clicks would bypass hit-testing entirely, so every control is
// probed with elementFromPoint first — that is what catches an invisible
// layer swallowing real taps.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH
  ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((path) => existsSync(path))
  ?? "chrome";
const MIME = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain",
};
const VIEWPORTS = [[1280, 800], [390, 844]];

let stage = "starting";
let chrome;
let server;
let ws;
let cleaned = false;

function trace(message) {
  stage = message;
  process.stderr.write(`[iron-vertex] ${message}\n`);
}

function killChrome() {
  if (!chrome?.pid) return;
  try {
    if (process.platform === "win32") {
      // Only this process tree: a dev box routinely has the user's own
      // Chrome running, and a blanket kill would take it with us.
      spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-chrome.pid, "SIGKILL");
    }
  } catch { /* already gone */ }
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* already closed */ }
  killChrome();
  try { server?.closeAllConnections?.(); } catch { /* already closed */ }
  try { server?.close(); } catch { /* already closed */ }
}

process.on("exit", cleanup);
const watchdog = setTimeout(() => {
  console.error(`Iron Vertex browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 120_000);
watchdog.unref?.();

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  return port;
}

async function poll(description, probe, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${description}${last == null ? "" : ` (last: ${JSON.stringify(last)})`}`);
}

try {
  trace("starting static server");
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}\\`) && !path.startsWith(`${ROOT}/`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  trace("launching Chrome");
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "iron-vertex-"));
  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "about:blank",
  ], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"] });

  trace(`waiting for Chrome on port ${debugPort}`);
  const wsUrl = await poll("Chrome's debug endpoint", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch { return null; }
  }, 40_000);

  ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.onopen = resolveOpen;
    ws.onerror = () => rejectOpen(new Error("Could not connect to Chrome's debug websocket"));
  });

  let commandId = 0;
  const pending = new Map();
  let pageErrors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { ok, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(JSON.stringify(message.error)));
      else ok(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(`exception: ${detail.exception?.description ?? detail.text}`);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      pageErrors.push(`console.error: ${message.params.args.map((a) => a.description ?? a.value).join(" ")}`);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      // A software GL stack grumbles about performance, and this harness
      // serves no favicon; neither is a fault in the page.
      if (!/swiftshader|software renderer|GroupMarker|favicon\.ico/i.test(`${entry.text} ${entry.url || ""}`)) {
        pageErrors.push(`${entry.source}: ${entry.text} @ ${entry.url || "?"}`);
      }
    }
  };

  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++commandId;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params = {}) => send(method, params, sessionId);

  await S("Page.enable");
  await S("Runtime.enable");
  await S("Log.enable");
  await S("Page.bringToFront");

  async function evaluate(expression) {
    const response = await S("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(`page threw: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`);
    }
    return response.result.value;
  }

  for (const [width, height] of VIEWPORTS) {
    trace(`booting at ${width}x${height}`);
    pageErrors = [];
    await S("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 500,
    });
    // A fixed seed makes the assertions below reproducible.
    await S("Page.navigate", { url: `http://127.0.0.1:${port}/iron-vertex/?seed=20260726` });
    try {
      await poll("the ride to boot", () => evaluate("window.__ironVertexReady === true"), 45_000);
    } catch (bootFailure) {
      // The page swallows module failures by design (it shows a notice),
      // so surface whatever the browser actually complained about.
      throw new Error(`${bootFailure.message}\npage errors:\n  ${pageErrors.join("\n  ") || "(none reported)"}`);
    }

    // ---- the scene actually built something ----
    const built = await evaluate(`(() => {
      const c = document.getElementById("scene");
      return {
        w: c.width, h: c.height,
        gl: !!(c.getContext("webgl2") || c.getContext("webgl")),
        name: document.getElementById("track-name").textContent.trim(),
        length: Number(document.getElementById("stat-length").textContent),
        noticeHidden: document.getElementById("notice").hidden,
      };
    })()`);
    assert.ok(built.gl, `${width}x${height}: no WebGL context on the canvas`);
    assert.ok(built.w > 0 && built.h > 0, `${width}x${height}: canvas has no size`);
    assert.match(built.name, /^\S+ \S+$/, `${width}x${height}: track name not rendered (${built.name})`);
    assert.ok(built.length > 400, `${width}x${height}: implausible track length ${built.length}`);
    assert.ok(built.noticeHidden, `${width}x${height}: the boot notice is still covering the page`);

    // ---- the boot notice really is gone, not merely marked hidden ----
    const noticeDisplay = await evaluate(
      `getComputedStyle(document.getElementById("notice")).display`,
    );
    assert.equal(noticeDisplay, "none",
      `${width}x${height}: the notice is [hidden] but still displayed — it would eat every tap`);

    // ---- the train moves, and the readouts follow it ----
    //
    // The train starts stationed and holds a constant transfer speed until
    // it reaches the chain, so a short sample can legitimately see no
    // change at all. Wait for it to get going instead of guessing a
    // window: under a software GL stack the frame rate is anyone's guess.
    const start = await evaluate(`({
      speed: document.getElementById("stat-speed").textContent,
      height: document.getElementById("stat-height").textContent,
    })`);
    const moved = await poll("the ride to leave the station", async () => {
      const now = await evaluate(`({
        speed: document.getElementById("stat-speed").textContent,
        height: document.getElementById("stat-height").textContent,
      })`);
      return now.speed !== start.speed || now.height !== start.height ? now : null;
    }, 40_000);
    assert.ok(moved, `${width}x${height}: the ride never got going`);
    // It must climb: a coaster that only ever reads zero height is not
    // running the profile.
    const climbed = await poll("the train to gain height", async () => {
      const h = await evaluate(`Number(document.getElementById("stat-height").textContent)`);
      return h > 5 ? h : null;
    }, 60_000);
    assert.ok(climbed > 5, `${width}x${height}: the train never left the ground`);

    // ---- the ride card says what the generator actually built ----
    const facts = await evaluate(`document.getElementById("track-facts").textContent.trim()`);
    assert.match(facts, /chain lift|two chain lifts|launched at \d+ km\/h/,
      `${width}x${height}: the ride card does not say how the train is driven (${facts})`);
    assert.match(facts, /\d+\s*m drop/, `${width}x${height}: no drop height on the ride card (${facts})`);
    assert.match(facts, /\d+\s*km\/h/, `${width}x${height}: no top speed on the ride card (${facts})`);
    assert.match(facts, /inversion/, `${width}x${height}: no inversion count on the ride card (${facts})`);
    // The clearance figure is the whole point of the collision check: it
    // must be a real measurement, and it must be a safe one.
    const clearance = facts.match(/([\d.]+)\s*m clearance/);
    assert.ok(clearance, `${width}x${height}: no clearance figure on the ride card (${facts})`);
    assert.ok(Number(clearance[1]) >= 3.4,
      `${width}x${height}: track passes within ${clearance[1]}m of itself`);

    // ---- every control is where it looks, and hittable ----
    for (const id of ["btn-ride", "btn-new", "btn-cam", "btn-sound"]) {
      const reachable = await evaluate(`(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return "zero-sized";
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el.contains(hit) || el === hit ? true : "covered by " + (hit && hit.id ? "#" + hit.id : hit && hit.tagName);
      })()`);
      assert.equal(reachable, true, `${width}x${height}: ${id} is not clickable (${reachable})`);
    }

    // ---- riding switches to the in-car view ----
    await evaluate(`document.getElementById("btn-ride").click()`);
    await delay(220);
    const riding = await evaluate(`document.getElementById("btn-cam").textContent`);
    assert.match(riding, /pov/i, `${width}x${height}: Ride did not switch to the in-car camera (${riding})`);
    const rideLabel = await evaluate(`document.getElementById("btn-ride").textContent`);
    assert.match(rideLabel, /exit/i, `${width}x${height}: the Ride button did not become Exit (${rideLabel})`);

    // ---- the camera cycles, and comes back round ----
    const modes = [];
    for (let i = 0; i < 3; i++) {
      await evaluate(`document.getElementById("btn-cam").click()`);
      await delay(120);
      modes.push(await evaluate(`document.getElementById("btn-cam").textContent.trim()`));
    }
    assert.equal(new Set(modes).size, 3, `${width}x${height}: camera did not cycle (${modes.join(", ")})`);

    // ---- sound toggles, says so, and is remembered ----
    //
    // Web Audio will not start outside a user gesture, so this is also the
    // check that the page asks for it from inside a click rather than at
    // boot — an AudioContext opened at load time would sit suspended and
    // the ride would be silent.
    const before = await evaluate(`document.getElementById("btn-sound").textContent.trim()`);
    assert.match(before, /off/i, `${width}x${height}: sound did not start off (${before})`);
    await evaluate(`document.getElementById("btn-sound").click()`);
    await delay(300);
    const after = await evaluate(`document.getElementById("btn-sound").textContent.trim()`);
    assert.match(after, /on/i, `${width}x${height}: sound did not turn on (${after})`);
    assert.equal(
      await evaluate(`localStorage.getItem("0x4d44.iron-vertex.sound")`), "on",
      `${width}x${height}: the sound preference was not remembered`,
    );
    // Let a couple of seconds of audio run: a bad node graph throws here,
    // not at the click.
    await delay(1200);
    await evaluate(`document.getElementById("btn-sound").click()`);
    await delay(200);
    assert.match(
      await evaluate(`document.getElementById("btn-sound").textContent.trim()`), /off/i,
      `${width}x${height}: sound did not turn back off`,
    );

    // ---- a new track really is a different track ----
    const firstName = built.name;
    let changed = false;
    for (let i = 0; i < 6 && !changed; i++) {
      await evaluate(`document.getElementById("btn-new").click()`);
      await delay(450);
      const next = await evaluate(`document.getElementById("track-name").textContent.trim()`);
      const nextLength = await evaluate(`Number(document.getElementById("stat-length").textContent)`);
      assert.ok(nextLength > 400, `${width}x${height}: new track has implausible length ${nextLength}`);
      if (next !== firstName) changed = true;
    }
    assert.ok(changed, `${width}x${height}: six new tracks all came out named "${firstName}"`);

    // ---- the ride actually makes a sound, and does not clip ----
    //
    // Rendering the real graph into an OfflineAudioContext is the only way
    // to assert anything about the OUTPUT rather than about whether the
    // voices were triggered. That distinction cost a round trip once
    // already: the rider screams fired perfectly and were 25dB under the
    // wheels, and every test at the time said the audio was fine.
    if (width > 500) {
      const levels = await evaluate(`(async () => {
        const mod = await import("/iron-vertex/audio.js");
        const SR = 44100;
        async function render(drive) {
          const offline = new OfflineAudioContext(1, SR * 2, SR);
          const saved = window.AudioContext;
          window.AudioContext = function () { return offline; };
          const audio = new mod.RideAudio();
          audio.start();
          window.AudioContext = saved;
          Object.defineProperty(offline, "state", { value: "running", configurable: true });
          drive(audio);
          const data = (await offline.startRendering()).getChannelData(0);
          let peak = 0;
          for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
          return peak;
        }
        const flatOut = mod.rideMix({ v: 28, mode: "free", riding: true });
        const parked = mod.rideMix({ v: 0, mode: "station", riding: false, distance: 200 });
        return {
          flatOut: await render((a) => a.update(flatOut, 1 / 60)),
          parked: await render((a) => a.update(parked, 1 / 60)),
        };
      })()`);
      assert.ok(levels.flatOut > 0.1,
        `${width}x${height}: the ride is silent at 28 m/s (peak ${levels.flatOut})`);
      assert.ok(levels.flatOut < 1,
        `${width}x${height}: the ride clips at speed (peak ${levels.flatOut.toFixed(3)})`);
      assert.ok(levels.parked < levels.flatOut * 0.5,
        `${width}x${height}: a parked train 200m away is as loud as one at speed `
          + `(${levels.parked.toFixed(3)} vs ${levels.flatOut.toFixed(3)})`);
    }

    // ---- the page never scrolls sideways ----
    const overflow = await evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    );
    assert.ok(overflow <= 1, `${width}x${height}: page scrolls horizontally by ${overflow}px`);

    // ---- keyboard shortcuts are wired ----
    await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }))`);
    await delay(400);
    await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }))`);
    await delay(150);

    // Give a couple more seconds of animation a chance to throw.
    await delay(1500);
    assert.deepEqual(pageErrors, [], `${width}x${height}: page reported errors`);
  }

  trace("done");
  cleanup();
  clearTimeout(watchdog);
  console.log("iron-vertex browser checks passed");
} catch (error) {
  cleanup();
  clearTimeout(watchdog);
  console.error(error);
  process.exit(1);
}
