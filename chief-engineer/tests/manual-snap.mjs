// Manual playtest snapshotter (dev-only; not in the root test chain).
// Boots the real page in headless Chrome, plays via the SAME UI action layer
// (window.__chief.act driven by the public bot policy), and saves screenshots
// for human review. Usage: node chief-engineer/tests/manual-snap.mjs [outdir]

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(process.argv[2] ?? join(tmpdir(), "chief-snaps"));
await mkdir(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH
  ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => existsSync(p)) ?? "chrome";
const MIME = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

let chrome; let server; let ws;
const cleanup = () => {
  try { ws?.close(); } catch {}
  if (chrome?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(-chrome.pid, "SIGKILL"); } catch {} }
  }
  try { server?.closeAllConnections?.(); server?.close(); } catch {}
};
process.on("exit", cleanup);
setTimeout(() => { console.error("snap timeout"); cleanup(); process.exit(2); }, 240_000).unref?.();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch { response.writeHead(404).end("nf"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const appUrl = `http://127.0.0.1:${server.address().port}/chief-engineer/`;

const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const debugPort = probe.address().port;
await new Promise((r) => probe.close(r));
const profile = await mkdtemp(join(tmpdir(), "chief-snap-"));
chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"],
{ detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"] });

let wsUrl = null;
for (let i = 0; i < 200 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await delay(100); }
}
ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable"); await S("Page.bringToFront");
const evaluate = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const view = (w, h) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
async function snap(name) {
  const shot = await S("Page.captureScreenshot", { format: "png" });
  await writeFile(join(OUT, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`snap ${name}`);
}
const installDriver = `(async () => {
  window.__driver ??= (await import("/chief-engineer/tests/bot.mjs")).botStep;
  window.__drive = (n) => { for (let i = 0; i < n; i++) { const s = window.__chief.state; if (!s) break;
    for (const a of window.__driver(s)) window.__chief.act(a); } };
  return true; })()`;
async function driveUntil(cond, maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cond)) break; // stop BEFORE the next bot pass (leave fresh state visible)
    await evaluate("window.__drive(1); window.__chief.step(20); true");
  }
  await evaluate("window.__chief?.setSpeed(0); true");
}

// --- desktop menu
await view(1280, 900);
await S("Page.navigate", { url: appUrl });
await delay(1200);
await snap("01-menu-desktop");
// --- phone menu
await view(390, 844);
await delay(300);
await snap("02-menu-phone");

// --- L1 voyage, phone
await evaluate("window.__chief.startLevel('L1'); true");
await evaluate(installDriver);
await delay(400);
await snap("03-L1-start-phone");
// --- desktop voyage with DG sheet
await view(1280, 900);
await evaluate("document.querySelector('.dg')?.click(); true");
await delay(250);
await snap("04-L1-dg-sheet-desktop");
await evaluate("document.querySelector('.overlay .sheet .actions button.primary')?.click(); true");
// --- drive to the scripted sea-chest event
await driveUntil("window.__chief.state.events.length > 0", 90_000);
await delay(300);
await snap("05-L1-event-desktop");
// --- finish L1 via the bot to the debrief
await driveUntil("!window.__chief.state", 120_000);
await delay(400);
await snap("06-L1-debrief-desktop");

// --- L3 fuel & maintenance panels
await evaluate("window.__chief.startLevel('L3'); true");
await evaluate(installDriver);
await evaluate("window.__drive(3); true");
await delay(200);
await evaluate("[...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'FUEL')?.click(); true");
await delay(200);
await snap("07-L3-fuel-desktop");
await evaluate("[...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'MAINT')?.click(); true");
await delay(200);
await snap("08-L3-maint-desktop");
await evaluate("[...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'MANUAL')?.click(); true");
await delay(150);
await evaluate("document.querySelector('.manual-list button')?.click(); true");
await delay(150);
await snap("09-L3-manual-desktop");

// --- L6 mega ship mimic, phone + desktop
await evaluate("localStorage.setItem('0x4d44.chief.campaign.v1', JSON.stringify({v:1,unlocked:6,stars:{},muted:true})); true");
await evaluate("window.__chief.startLevel('L6'); true");
await evaluate(installDriver);
await evaluate("window.__drive(6); true");
await delay(250);
await snap("10-L6-mimic-desktop");
await view(390, 844);
await delay(300);
await snap("11-L6-mimic-phone");
// storm + rogue section for drama check
await driveUntil("window.__chief.state.legIndex >= 1 && window.__chief.state.legDistNm > 790", 180_000);
await delay(200);
await view(1280, 900);
await delay(200);
await snap("12-L6-storm-desktop");

console.log(`done → ${OUT}`);
cleanup();
process.exit(0);
