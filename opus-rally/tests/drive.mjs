// A small Chrome DevTools Protocol harness shared by the browser test and the
// screenshot tool. It exists because the only honest way to judge whether this
// game looks and drives like a rally game is to actually run it, drive it with
// real key events and look at the pixels.
//
// Real key events matter: a synthetic `el.click()` or a hand-written KeyboardEvent
// bypasses the browser's own dispatch, so it would prove nothing about whether a
// player pressing the key gets anywhere.

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const MIME = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".txt": "text/plain", ".woff2": "font/woff2", ".md": "text/markdown",
};

export function findChrome() {
  return process.env.CHROME_PATH
    ?? [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Users/marti/AppData/Local/Google/Chrome/Application/chrome.exe",
      "/usr/bin/google-chrome",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ].find((p) => existsSync(p))
    ?? "chrome";
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  return port;
}

// Windows leaves renderer processes holding the debug port after a plain kill,
// so the whole tree goes at once or the next run cannot bind.
function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch { /* already gone */ }
}

export async function openHarness({ root, quiet = false, width = 1280, height = 800 } = {}) {
  const ROOT = resolve(root);
  const log = (m) => { if (!quiet) process.stderr.write(`[opus-rally] ${m}\n`); };

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}\\`) && !path.startsWith(`${ROOT}/`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, {
        "content-type": MIME[extname(path)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  log(`serving ${ROOT} on ${port}`);

  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "opus-rally-"));
  const chrome = spawn(findChrome(), [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-features=CalculateNativeWinOcclusion",
    "--hide-scrollbars", "--mute-audio",
    // A software GL stack is the only thing guaranteed to exist on a headless
    // box, and it renders the same scene — slowly, but pixel-for-pixel usefully.
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    `--window-size=${Math.max(width, 520)},${height}`,
    "about:blank",
  ], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"] });

  let ws;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { ws?.close(); } catch { /* already closed */ }
    killTree(chrome);
    try { server.closeAllConnections?.(); } catch { /* already closed */ }
    try { server.close(); } catch { /* already closed */ }
  };
  process.on("exit", close);

  const deadline = Date.now() + 45_000;
  let wsUrl = null;
  while (Date.now() < deadline && !wsUrl) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch { await delay(80); }
  }
  if (!wsUrl) { close(); throw new Error("Chrome never opened its debug endpoint"); }

  ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(new Error("could not attach to Chrome"));
  });

  let commandId = 0;
  const pending = new Map();
  let errors = [];
  let consoleLines = [];
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
      const d = message.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description ?? d.text}`);
    } else if (message.method === "Runtime.consoleAPICalled") {
      const text = message.params.args.map((a) => a.description ?? a.value).join(" ");
      consoleLines.push(`${message.params.type}: ${text}`);
      if (message.params.type === "error") errors.push(`console.error: ${text}`);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const e = message.params.entry;
      if (!/swiftshader|software renderer|GroupMarker|favicon\.ico|Automatic fallback/i
        .test(`${e.text} ${e.url || ""}`)) {
        errors.push(`${e.source}: ${e.text} @ ${e.url || "?"}`);
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
      const d = response.exceptionDetails;
      throw new Error(`page threw: ${d.exception?.description ?? d.text}`);
    }
    return response.result.value;
  }

  // Chrome needs both the raw key and the text for a printable key, and both a
  // rawKeyDown and a keyUp, or the page sees a key that is pressed forever.
  const KEYS = {
    ArrowUp: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowDown: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowRight: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    Space: { code: "Space", key: " ", windowsVirtualKeyCode: 32, text: " " },
    Enter: { code: "Enter", key: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Escape: { code: "Escape", key: "Escape", windowsVirtualKeyCode: 27 },
  };
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    KEYS[`Key${letter}`] = {
      code: `Key${letter}`, key: letter.toLowerCase(),
      windowsVirtualKeyCode: letter.charCodeAt(0), text: letter.toLowerCase(),
    };
  }

  async function key(name, direction) {
    const spec = KEYS[name];
    if (!spec) throw new Error(`unmapped key ${name}`);
    const type = direction !== "down" ? "keyUp" : spec.text ? "keyDown" : "rawKeyDown";
    await S("Input.dispatchKeyEvent", { ...spec, type });
  }

  async function tap(name, ms = 60) {
    await key(name, "down");
    await delay(ms);
    await key(name, "up");
  }

  // Real touches, and more than one at a time — steering while the throttle is
  // held is the whole point of an on-screen control set, and a harness that can
  // only put one finger down cannot tell a working one from a broken one.
  //
  // Chrome applies the event type to the points you LIST, not to the difference
  // from the last call. Releasing one of two fingers therefore means sending
  // touchEnd carrying only the finger that left: send it carrying the survivors
  // instead and Chrome lifts those, which reads exactly like a control that
  // sticks.
  const fingers = new Map();
  const asPoint = (p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 });

  // Chrome rejects maxTouchPoints outside 1..16, including on the call that
  // turns emulation off, so the count only travels with an enable.
  async function touchEmulation(on = true, maxTouchPoints = 5) {
    fingers.clear();
    await S("Emulation.setTouchEmulationEnabled", on
      ? { enabled: true, maxTouchPoints: Math.max(1, Math.min(16, maxTouchPoints)) }
      : { enabled: false });
  }

  async function touchDown(id, x, y) {
    fingers.set(id, { id, x, y });
    await S("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [...fingers.values()].map(asPoint),
    });
  }

  async function touchMove(id, x, y) {
    if (!fingers.has(id)) return false;
    fingers.set(id, { id, x, y });
    await S("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [...fingers.values()].map(asPoint),
    });
    return true;
  }

  async function touchUp(id) {
    const going = fingers.get(id);
    if (!going) return false;
    fingers.delete(id);
    await S("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [asPoint(going)] });
    return true;
  }

  async function touchRelease() {
    for (const id of [...fingers.keys()]) await touchUp(id);
  }

  async function touchTap(x, y, ms = 60) {
    await touchDown(9, x, y);
    await delay(ms);
    await touchUp(9);
  }

  async function click(x, y) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await S("Input.dispatchMouseEvent", {
        type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0,
      });
    }
  }

  async function screenshot(path) {
    const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(data, "base64"));
    return path;
  }

  async function setViewport(w, h) {
    await S("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: w < 500,
    });
  }

  async function navigate(url) {
    errors = [];
    consoleLines = [];
    await S("Page.navigate", { url: url.startsWith("http") ? url : `http://127.0.0.1:${port}${url}` });
  }

  // The probe returns a truthy value once the condition holds; anything it
  // throws is treated as "not yet", because a page mid-boot legitimately has
  // half its globals missing.
  async function waitFor(description, probe, timeout = 60_000) {
    const stop = Date.now() + timeout;
    let last = null;
    while (Date.now() < stop) {
      try {
        last = await probe();
        if (last) return last;
      } catch (err) {
        last = `probe threw: ${err.message}`;
      }
      await delay(90);
    }
    throw new Error(
      `timed out waiting for ${description}\nlast probe: ${JSON.stringify(last)}`
      + `\npage errors:\n  ${errors.join("\n  ") || "(none)"}`,
    );
  }

  await setViewport(width, height);

  return {
    port, evaluate, key, tap, click, screenshot, setViewport, navigate, waitFor, delay,
    touchEmulation, touchDown, touchMove, touchUp, touchTap, touchRelease,
    get fingersDown() { return fingers.size; },
    send: S,
    get errors() { return errors.slice(); },
    get console() { return consoleLines.slice(); },
    clearErrors() { errors = []; consoleLines = []; },
    close,
  };
}
