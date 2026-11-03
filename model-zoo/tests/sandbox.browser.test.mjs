// Sandbox tests: extractHtml unit tests (Node) plus a real-Chrome check that a
// malicious program inside Sandbox.mountProgram cannot reach the network, the
// parent page, storage, or navigate/open windows. Chrome is driven over CDP.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
// The repo root package.json is type=module, so load the plain script by hand.
const mod = { exports: {} };
new Function("module", await readFile(resolve(import.meta.dirname, "../js/sandbox.js"), "utf8"))(mod);
const { extractHtml } = mod.exports;

// ---- extractHtml unit tests -------------------------------------------------
{
  const doc = "<!DOCTYPE html><html><head></head><body><button>Tell me another</button></body></html>";
  assert.equal(extractHtml("```html\n" + doc + "\n```"), doc, "fenced");
  assert.equal(extractHtml("Sure! Here you go:\n\n```html\n" + doc + "\n```\nEnjoy, och aye."), doc, "prose + fence");
  assert.equal(extractHtml("Here:\n" + doc + "\nThanks"), doc, "prose, no fence");
  assert.equal(extractHtml("```\n" + doc), doc, "unterminated fence");
  const frag = '<button id="b">Another</button><script>1</script>';
  assert.equal(extractHtml("```html\n" + frag + "\n```"), frag, "bare fragment");
  assert.equal(extractHtml("I cannot do that."), null, "prose only");
  assert.equal(extractHtml(""), null, "empty");
  assert.equal(extractHtml(null), null, "null");
  assert.equal(extractHtml(undefined), null, "undefined");
  assert.equal(extractHtml({}), null, "object");
  console.log("extractHtml: ok");
}

// ---- browser test -----------------------------------------------------------
const CHROME = process.env.CHROME_PATH
  ?? [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/pw-browsers/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => existsSync(p));

if (!CHROME) {
  console.log("sandbox.browser.test: no Chrome found; skipping browser part. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };
const beacons = [];
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://local");
  if (u.pathname === "/beacon") {
    beacons.push(req.url);
    res.writeHead(200, { "access-control-allow-origin": "*" }).end("hit");
    return;
  }
  const path = resolve(ROOT, decodeURIComponent(u.pathname).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const srvPort = server.address().port;
const pageUrl = `http://127.0.0.1:${srvPort}/model-zoo/tests/sandbox-harness.html?port=${srvPort}`;

const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), "sandbox-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-background-networking", "about:blank",
], { detached: true, stdio: "ignore" });

const cleanup = async () => {
  try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* already gone */ }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
};
const die = async (msg) => { await cleanup(); console.error(`FAIL: ${msg}`); process.exit(1); };

let wsUrl;
for (let i = 0; i < 300; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; }
  catch { await delay(100); }
}
if (!wsUrl) await die("Chrome did not expose a debugging endpoint");

const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let msgId = 0;
const pending = new Map();
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (!m.id || !pending.has(m.id)) return;
  const { res, rej } = pending.get(m.id);
  pending.delete(m.id);
  m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); sock.send(JSON.stringify({ id, method, params, sessionId })); });

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setFocusEmulationEnabled", { enabled: true });
  const evaluate = async (expression) => {
    const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  await S("Page.navigate", { url: pageUrl });
  let done = false;
  for (let i = 0; i < 100 && !done; i++) {
    await delay(100);
    try { done = await evaluate('window.__done === true && window.__results["benign.loaded"] === 1'); } catch { /* still loading */ }
  }
  assert.ok(done, "malicious program never finished reporting");

  // Click the benign button inside its iframe with a real mouse event.
  // Re-measure after layout, scroll into view, and retry if the click is lost under load.
  let results = {};
  for (let attempt = 0; attempt < 3 && !results["benign.text"]; attempt++) {
    await evaluate(`document.querySelector("#benign iframe").scrollIntoView({block: "center"})`);
    await delay(200);
    const rect = await evaluate(`(() => { const r = document.querySelector("#benign iframe").getBoundingClientRect(); return {x: r.left, y: r.top}; })()`);
    const x = rect.x + 60, y = rect.y + 40;
    await S("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    for (const type of ["mousePressed", "mouseReleased"]) {
      await S("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
    for (let i = 0; i < 40; i++) { // up to 4 s per attempt
      results = await evaluate("window.__results");
      if (results["benign.text"]) break;
      await delay(100);
    }
  }
  await delay(300); // let any stray beacon land
  const finalUrl = await evaluate("location.href");
  const attrs = await evaluate(`[...document.querySelectorAll("iframe")].map(f => ({sandbox: f.getAttribute("sandbox"), csp: f.srcdoc.indexOf("Content-Security-Policy")}))`);
  console.log("results:", JSON.stringify(results));
  console.log("beacons:", JSON.stringify(beacons));

  assert.match(results["benign.text"] ?? "", /^Clicked \d+$/, "benign button click works inside iframe");
  assert.deepEqual(beacons, [], "no beacon hits (fetch/img/xhr/open all blocked)");
  assert.match(results["evil.parent"], /^threw:/, "parent access must throw");
  assert.match(results["evil.cookie"], /^threw:/, "document.cookie must throw");
  assert.match(results["evil.localStorage"], /^threw:/, "localStorage must throw");
  assert.ok(["ok:null", "threw:SecurityError"].includes(results["evil.open"]), "window.open must not open a window");
  assert.equal(results["evil.img"], "error", "img beacon must fail");
  assert.match(results["evil.fetch"], /^threw:/, "fetch must be rejected");
  assert.equal(finalUrl, pageUrl, "top window must not navigate");
  for (const a of attrs) {
    assert.equal(a.sandbox, "allow-scripts", "sandbox attribute is exactly allow-scripts");
    assert.ok(a.csp >= 0, "CSP meta injected");
  }
  const targets = (await send("Target.getTargets")).targetInfos.filter((t) => t.type === "page");
  assert.equal(targets.length, 2, "no popup page opened (about:blank + harness)");
  console.log("sandbox.browser.test: ok");
} catch (e) {
  await die(e.stack ?? String(e));
}
await cleanup();
process.exit(0);
