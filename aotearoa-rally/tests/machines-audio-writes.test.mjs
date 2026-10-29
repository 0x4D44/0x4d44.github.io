// Regression: the audio frame path must stay cheap. Every AudioParam call takes the audio thread's lock and was the cause of
// 70-190 ms main-thread spikes in audio.update. A counting fake AudioContext checks (a) sT skips unchanged values, (b) at a
// steady state the continuous update writes almost nothing, (c) a pop creates no nodes, (d) writes/s stay within budget.
import test from "node:test";
import assert from "node:assert/strict";
import { createAudio } from "../audio/audio.mjs";
import { sT } from "../audio/mixer.mjs";

function fakeCtx() {
  const c = { writes: 0, nodes: 0, currentTime: 0, sampleRate: 48000, state: "running", destination: {} };
  const param = (v = 0) => new Proxy({ value: v }, { get(t, k) { if (k in t) return t[k]; return (...a) => { if (/AtTime|ValueAt|RampToValue|cancel|setValueCurve/.test(String(k))) c.writes++; return undefined; }; }, set(t, k, v) { t[k] = v; return true; } });
  const node = () => {
    c.nodes++; if (c.trace) c.trace.push(new Error().stack.split("\n").slice(2, 5).join(" | "));
    const t = {};
    return new Proxy(t, {
      get(o, k) { if (k in o) return o[k]; if (k === "connect") return (x) => x; if (["disconnect", "start", "stop", "setPeriodicWave", "getFloatFrequencyData"].includes(k)) return () => {}; if (k === "buffer" || k === "type") return undefined; o[k] = param(1); return o[k]; },
      set(o, k, v) { o[k] = v; return true; },
    });
  };
  return new Proxy(c, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "createBuffer") return (ch, len) => { o.nodes++; const d = new Float32Array(len); return { getChannelData: () => d, length: len, numberOfChannels: ch, sampleRate: 48000 }; };
      if (k === "createPeriodicWave") return () => ({});
      if (k === "createWaveShaper" || String(k).startsWith("create")) return () => node();
      return undefined;
    },
  });
}

test("sT skips writes that would not change the sound", () => {
  let n = 0;
  const p = { setTargetAtTime() { n++; } };
  assert.equal(sT(p, 1, 0, 0.1), true);
  assert.equal(sT(p, 1.001, 0, 0.1), false);
  assert.equal(sT(p, 1.2, 0, 0.1), true);
  assert.equal(n, 2);
});

const STATE = (i) => ({ rpm: 3000, throttle: 0.5, boost: 0, speed: 20, gear: 3, s: i, events: [], wheels: [0, 1, 2, 3].map(() => ({ grounded: true, slip: 0.1, surface: "tarmac", load: 3000, speedRel: 20 })), damage: { engine: 0 } });

test("steady-state audio.update writes almost no AudioParams and creates no nodes", () => {
  const ctx = fakeCtx();
  const a = createAudio({}, { ctx, speech: { speak() {}, cancel() {} } });
  const stage = { id: "x", pacenotes: [], lengthM: 5000, weather: {}, surface: "tarmac" };
  a.setStage && a.setStage(stage);
  for (let i = 0; i < 120; i++) a.update(1 / 60, STATE(i), stage, {}); // settle
  const w0 = ctx.writes, n0 = ctx.nodes; ctx.trace = [];
  for (let i = 0; i < 600; i++) a.update(1 / 60, STATE(120 + i), stage, {}); // 10 s of identical input
  const perSec = (ctx.writes - w0) / 10;
  assert.equal(ctx.nodes - n0, 0, "nodes created in the frame path: " + [...new Set(ctx.trace.map((x) => x.replace(/H:.*aotearoa-rally./g, "")))].slice(0, 4).join(" // "));
  assert.ok(perSec < 40, `${perSec} AudioParam writes per second at a steady state`);
});

test("an anti-lag pop only automates persistent params (no node creation)", () => {
  const ctx = fakeCtx();
  const a = createAudio({}, { ctx, speech: { speak() {}, cancel() {} } });
  for (let i = 0; i < 20; i++) a.update(1 / 60, STATE(i), null, {});
  const n0 = ctx.nodes;
  for (let i = 0; i < 20; i++) a.engine.pop(1);
  assert.equal(ctx.nodes - n0, 0);
});
