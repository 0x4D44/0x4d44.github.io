// mdbench pages in headless Chrome: they render from the data, with no console errors and no
// sideways scroll, at desktop (light and dark) and phone width. A synthetic suite ("zeta", with a
// metric no real suite has, flagged as sample data) is served in place of the real index to prove
// a new suite and the sample badge render with no page change. No sample data ships.
//   node mdbench/tests/browser.test.mjs            (MDBENCH_SHOTS=<dir> also saves screenshots)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = process.env.MDBENCH_SHOTS || null;
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", process.env.CHROME_PATH].filter(Boolean);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".opus": "audio/ogg", ".mid": "audio/midi" };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let chromeBin = null;
for (const c of CHROME) { try { await readFile(c); chromeBin = c; break; } catch { /* next */ } }
if (!chromeBin) { console.log("mdbench browser test: no Chrome; skipping (set CHROME_PATH)."); process.exit(0); }

// The synthetic suite: one group, a brand-new headline metric, a bool, no cost or time metric.
const realIndex = JSON.parse(await readFile(join(ROOT, "mdbench/data/index.json"), "utf8"));
const realRecall = JSON.parse(await readFile(join(ROOT, "mdbench/data/recall.json"), "utf8"));
const RECALL_ROWS = new Set(realRecall.results.map((x) => `${x.seat}/${x.task}`)).size;
const RECALL_SEATS = new Set(realRecall.results.map((x) => x.seat)).size;
// The Listen panel opens on the first music piece with audio: the reference plus each seat's answer.
const realAudio = realRecall.audio ? JSON.parse(await readFile(join(ROOT, "mdbench", "audio", "recall", "manifest.json"), "utf8")) : {};
const LISTEN_T0 = realRecall.tasks.find((t) => realAudio[t.id]);
const LISTEN_ROWS = LISTEN_T0 ? 1 + Object.keys(realAudio[LISTEN_T0.id].seats).length : 0;
const LISTEN_PLAYERS = LISTEN_T0 ? [realAudio[LISTEN_T0.id].reference, ...Object.values(realAudio[LISTEN_T0.id].seats)].filter((v) => v?.status === "ok").length : 0;
// Recall has more than 12 tasks, so its per-task table opens on the first category only.
const RECALL_G0 = realRecall.group.values.find((g) => realRecall.tasks.some((t) => t.group === g.id)).id;
const RECALL_G0_ROWS = new Set(realRecall.results.filter((x) => realRecall.tasks.find((t) => t.id === x.task)?.group === RECALL_G0).map((x) => `${x.seat}/${x.task}`)).size;
const zetaIndex = { ...realIndex, suites: [...realIndex.suites, { id: "zeta", title: "Zeta probe", file: "zeta.json", status: "results", description: "Synthetic suite for the render test." }] };
const zeta = {
  schema: "mdbench-site/1", suite: "zeta", title: "Zeta probe", description: "Synthetic.", sample: true, sample_note: "Synthetic test data.",
  group: { key: "group", label: "Phase", values: [{ id: "build", label: "Build" }, { id: "surprise", label: "Surprise" }] },
  metrics: [
    { id: "mips", label: "Emulated MIPS", role: "headline", type: "number", unit: "MIPS", higher_is_better: true, format: { decimals: 2, suffix: " MIPS" }, description: "Speed." },
    { id: "boots", label: "Boots", type: "bool", higher_is_better: true, description: "Boots the test ROM." },
  ],
  tasks: [{ id: "Z-1", group: "build", title: "Core", description: "" }, { id: "Z-2", group: "surprise", title: "Twist", description: "", note: "Zeta note." }],
  results: [
    { seat: "opus-5.5-medium", task: "Z-1", run: 1, metrics: { mips: 12.5, boots: true }, flags: [] },
    { seat: "opus-5.5-medium", task: "Z-1", run: 2, metrics: { mips: 10.5, boots: true }, flags: [] },
    { seat: "sol-6.1-xhigh", task: "Z-2", run: 1, metrics: { mips: 7.25, boots: false }, flags: [] },
  ],
  methodology: { scoring: ["Synthetic."], caveats: ["None."] },
};
const VIRTUAL = { "/mdbench/data/index.json": JSON.stringify(zetaIndex), "/mdbench/data/zeta.json": JSON.stringify(zeta) };

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (VIRTUAL[p] && req.headers.referer?.includes("zeta")) { res.writeHead(200, { "content-type": "application/json" }).end(VIRTUAL[p]); return; }
  const path = resolve(ROOT, (p.endsWith("/") ? `${p}index.html` : p).replace(/^\/+/, ""));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const profile = await mkdtemp(join(tmpdir(), "mdbench-"));
const chrome = spawn(chromeBin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--mute-audio", "--disable-background-networking", "about:blank"], { detached: true, stdio: "ignore" });
const cleanup = async () => { try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* gone */ } server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); };

let ws;
for (let i = 0; i < 300 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await delay(100); } }
if (!ws) { await cleanup(); throw new Error("Chrome did not start"); }
const sock = new WebSocket(ws);
await new Promise((a, b) => { sock.onopen = a; sock.onerror = b; });
let id = 0; const pending = new Map(); const events = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method) { events.push(m); return; }
  const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
  m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable"); await S("Log.enable");
const ev = async (expression) => { const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };

const VIEWPORTS = [
  { label: "desktop-light", width: 1280, height: 900, mobile: false, scheme: "light" },
  { label: "desktop-dark", width: 1280, height: 900, mobile: false, scheme: "dark" },
  { label: "phone", width: 390, height: 844, mobile: true, scheme: "light" },
];
const PAGES = [
  { name: "overview", url: "/mdbench/", expect: `({ cards: document.querySelectorAll(".card").length, boards: document.querySelectorAll("table.leaderboard").length, sample: document.querySelectorAll(".badge.sample").length, seats: document.querySelectorAll("#seat-table tbody tr").length })`,
    check: (r) => r.cards === 3 && r.boards === realIndex.suites.filter((s) => s.status === "results").length && r.sample === 0 && r.seats === realIndex.seats.length },
  { name: "swe", url: "/mdbench/suite.html?s=swe", expect: `({ rows: document.querySelectorAll("table.leaderboard tbody tr").length, heat: document.querySelectorAll("table.heat td.heat:not(.empty)").length, pts: document.querySelectorAll("svg.chart circle.pt").length, groups: document.querySelectorAll("table.groups thead th").length, banner: !!document.querySelector(".banner"), seatRows: document.querySelectorAll("#seat-detail tbody tr").length, method: document.querySelectorAll("#methodology li").length, heatNote: document.querySelector("#heat .tasknotes")?.textContent || "", seatNote: document.querySelector("#seat-detail .tasknotes")?.textContent || "", noteMarks: document.querySelectorAll("#heat sup.nm").length, caveat: [...document.querySelectorAll("#methodology li")].some((l) => l.textContent.startsWith("FIX-01")), listen: !document.getElementById("listen").hidden })`,
    check: (r) => r.rows === 6 && r.heat === 60 && r.pts === 12 && r.groups === 7 && !r.banner && r.seatRows === 10 && r.method >= 5 && /FIX-01.*every seat/.test(r.heatNote) && /FIX-01.*every seat/.test(r.seatNote) && r.noteMarks === 1 && r.caveat && !r.listen },
  { name: "recall", url: "/mdbench/suite.html?s=recall", expect: `({ title: document.getElementById("title").textContent, rows: document.querySelectorAll("table.leaderboard tbody tr").length, heat: document.querySelectorAll("table.heat td.heat:not(.empty)").length, banner: !!document.querySelector(".banner"), err: !!document.querySelector(".err"), group: document.getElementById("heat-group").value, allHeat: (() => { const g = document.getElementById("heat-group"), was = g.value; g.value = ""; g.dispatchEvent(new Event("change")); const n = document.querySelectorAll("table.heat td.heat:not(.empty)").length; g.value = was; g.dispatchEvent(new Event("change")); return n; })(), sticky: getComputedStyle(document.querySelector("table.heat tbody td.seatcell")).position, stickyTask: getComputedStyle(document.querySelectorAll("table.heat thead tr")[1].firstElementChild).position, boardSeat: getComputedStyle(document.querySelector("table.leaderboard tbody td.seatcell")).position, listen: !document.getElementById("listen").hidden, listenRows: document.querySelectorAll("table.listen tbody tr").length, players: document.querySelectorAll("table.listen audio").length })`,
    check: (r) => r.title === "Recall" && r.rows === RECALL_SEATS && r.group === RECALL_G0 && r.heat === RECALL_G0_ROWS && r.allHeat === RECALL_ROWS && r.sticky === "sticky" && r.stickyTask !== "sticky" && r.boardSeat === "sticky" && r.listen === !!LISTEN_T0 && r.listenRows === LISTEN_ROWS && r.players === LISTEN_PLAYERS && (!LISTEN_T0 || r.players > 1) && !r.banner && !r.err },
  { name: "zeta", url: "/mdbench/suite.html?s=zeta", expect: `({ title: document.getElementById("title").textContent, cell: [...document.querySelectorAll("table.heat td.heat")].map((t) => t.textContent), head: [...document.querySelectorAll("table.leaderboard th")].map((t) => t.textContent), nocost: document.getElementById("sc-cost").textContent, banner: document.querySelector(".banner")?.textContent || "", note: document.querySelector("#heat .tasknotes")?.textContent || "" })`,
    check: (r) => r.title === "Zeta probe sample data" && /Synthetic test data/.test(r.banner) && /Z-2: Zeta note/.test(r.note) && r.cell.some((c) => c.startsWith("11.50 MIPS")) && r.head.includes("Emulated MIPS") && r.head.includes("Boots pass") && /no cost/.test(r.nocost) },
];

const failures = [];
if (SHOTS) await mkdir(SHOTS, { recursive: true });
for (const vp of VIEWPORTS) {
  await S("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
  await S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: vp.scheme }] });
  for (const pg of PAGES) {
    events.length = 0;
    await S("Page.navigate", { url: base + pg.url });
    let ready = null;
    for (let i = 0; i < 100 && !ready; i++) { await delay(100); ready = await ev(`document.body?.dataset.ready || null`).catch(() => null); }
    const errs = events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") || (e.method === "Log.entryAdded" && e.params.entry.level === "error" && !/fonts\.g/.test(e.params.entry.url || "")))
      .map((e) => JSON.stringify(e.params).slice(0, 200));
    const r = ready === "1" ? await ev(pg.expect) : null;
    const over = await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    const tag = `${pg.name}@${vp.label}`;
    if (ready !== "1") failures.push(`${tag}: page not ready (${ready}) ${await ev("document.querySelector('.err')?.textContent || ''")}`);
    else if (!pg.check(r)) failures.push(`${tag}: unexpected DOM ${JSON.stringify(r)}`);
    if (errs.length) failures.push(`${tag}: console errors ${errs.join(" | ")}`);
    if (over > 1) failures.push(`${tag}: scrolls sideways by ${over}px`);
    if (SHOTS) {
      const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(await ev("document.documentElement.scrollHeight"), 9000), scale: 1 } });
      await writeFile(join(SHOTS, `${tag}.png`), Buffer.from(data, "base64"));
    }
    console.log(`${failures.some((f) => f.startsWith(tag)) ? "FAIL" : "ok  "} ${tag} ${JSON.stringify(r)}`);
  }
}
await cleanup();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`mdbench browser test: ${PAGES.length * VIEWPORTS.length} page loads ok`);
