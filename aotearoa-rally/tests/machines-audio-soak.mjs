import os from "node:os"; os.setPriority(0, os.constants.priority.PRIORITY_LOW);
// Live audio soak (NOT part of npm test): drives the real game page with the bot for N seconds (default 180) with audio on,
// and samples audioContext.currentTime vs wall clock, baseLatency, JS ms per audio.update, nodes created, and JS heap.
//   node tests/machines-audio-soak.mjs [--secs=180] [--stage=waitomo] [--car=huia]
import { openGame } from "./harness.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
const SECS = Number(args.secs || 180);
const h = await openGame({ width: 640, height: 360, query: `nomenu=1&stage=${args.stage || "waitomo"}&car=${args.car || "huia"}&bot=1&quality=low&nopause=1&mute=0`, extraFlags: ["--use-angle=d3d11", "--enable-gpu-rasterization"] });
const kill = setTimeout(() => { console.log("HARD TIMEOUT"); h.close().then(() => process.exit(2)); }, (SECS + 120) * 1000);
try {
  await h.waitForReady();
  await h.evalAsync(`(async () => {
    const s = window.__AR__;
    window.__soak = { nodes: 0, upd: 0, updMs: 0, updMax: 0 };
    const AC = window.BaseAudioContext;
    for (const k of Object.getOwnPropertyNames(AC.prototype)) if (k.startsWith("create")) { const f = AC.prototype[k]; AC.prototype[k] = function (...a) { window.__soak.nodes++; return f.apply(this, a); }; }
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    await new Promise((r) => setTimeout(r, 500));
    const a = s._G.audio;
    if (!a) throw new Error("audio not created: " + s.audioError);
    const k0 = window.__soak; k0.spikes = []; k0.cur = {};
    // per-subsystem timing: every method of the sub-objects, plus speechSynthesis calls, is charged to cur[name]
    const wrap = (obj, label) => { if (!obj) return; for (const m of Object.keys(obj)) { const f = obj[m]; if (typeof f !== "function") continue; obj[m] = (...x) => { const t = performance.now(); try { return f.apply(obj, x); } finally { const d = performance.now() - t; k0.cur[label + "." + m] = (k0.cur[label + "." + m] || 0) + d; } }; } };
    for (const n of ["engine", "surface", "ambience", "sfx", "codriver", "mixer"]) wrap(a[n], n);
    if (window.speechSynthesis) wrap(window.speechSynthesis, "speech");
    const orig = a.update.bind(a);
    a.update = (...x) => { k0.cur = {}; const t = performance.now(); orig(...x); const d = performance.now() - t; const k = window.__soak; k.upd++; k.updMs += d; if (d > k.updMax) k.updMax = d; if (d > 8 && k.spikes.length < 40) k.spikes.push({ d: +d.toFixed(1), at: +((t - k.t0) / 1000).toFixed(1), parts: Object.entries(k.cur).filter(([, v]) => v > 1).map(([n, v]) => n + "=" + v.toFixed(1)).join(" ") }); };
    k0.longTasks = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) k0.longTasks.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] }); } catch { /* */ }
    window.__soak.t0 = performance.now(); window.__soak.c0 = a.ctx.currentTime;
    s.setBot && s.setBot(true);
    return true;
  })()`);
  console.log("t_s  ctxTime  wall  state  baseLat  updAvgMs  updMax  nodesCreated  heapMB  paramWrites  stageS  kmh");
  const rows = [];
  for (let t = 0; t < SECS; t += 15) {
    await h.sleep(15000);
    const r = await h.evalAsync(`(() => { const a = window.__AR__._G.audio, k = window.__soak, st = window.__AR__.state();
      return { wall: (performance.now() - k.t0) / 1000, ctx: a.ctx.currentTime - k.c0, state: a.ctx.state, base: a.ctx.baseLatency, avg: k.updMs / Math.max(1, k.upd), max: k.updMax, nodes: k.nodes, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, pw: a.paramWrites, s: st.s, kmh: st.speedKmh }; })()`);
    rows.push(r);
    console.log([Math.round(t + 15), r.ctx.toFixed(1), r.wall.toFixed(1), r.state, (r.base || 0).toFixed(4), r.avg.toFixed(3), r.max.toFixed(2), r.nodes, r.heap.toFixed(1), r.pw, Math.round(r.s), Math.round(r.kmh)].join("  "));
  }
  const a = rows[0], z = rows[rows.length - 1];
  const nodeRate = (n0, n1, t0, t1) => ((n1 - n0) / (t1 - t0)).toFixed(1);
  console.log(`ctx/wall drift: ${(z.ctx - z.wall).toFixed(2)} s over ${z.wall.toFixed(0)} s`);
  console.log(`nodes created per second: first quarter ${nodeRate(0, rows[Math.floor(rows.length / 4)].nodes, 0, rows[Math.floor(rows.length / 4)].wall)}, last quarter ${nodeRate(rows[Math.floor(rows.length * 3 / 4)].nodes, z.nodes, rows[Math.floor(rows.length * 3 / 4)].wall, z.wall)}`);
  console.log(`update ms: first sample avg ${a.avg.toFixed(3)}, last sample avg ${z.avg.toFixed(3)}, worst single ${z.max.toFixed(2)}`);
  console.log("spikes > 8 ms:", JSON.stringify(await h.evalAsync("window.__soak.spikes")));
  console.log("long tasks (ms, any source):", JSON.stringify(await h.evalAsync("window.__soak.longTasks")));
  console.log("page errors:", JSON.stringify(h.consoleErrors().slice(0, 5)));
} catch (e) { console.log("ERR", e.message); } finally { clearTimeout(kill); await h.close(); process.exit(0); }
