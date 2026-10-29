// Offline scenes (owner: A1): render a few seconds of the real engine graph on an OfflineAudioContext and measure the result. Nothing is played and
// no audio device is opened, so this works under headless automation and without any user gesture: it is how the soundscape is checked by data.
import { AudioEngine, SampleBank } from './engine.js';

const NEED = ['bed:wind', 'bed:traffic', 'bed:murmur', 'bed:crickets', 'bed:children', 'bed:room', 'bed:tv', 'bed:radio', 'bed:sizzle', 'bed:court', 'bed:workshop',
  'step:asphalt:0', 'step:asphalt:1', 'step:wood:0', 'door:open:0', 'door:close:0', 'bell', 'chime', 'bird:0:0', 'dog:0'];

/** Four representative places and times, built from the page's own plan. */
export function defaultScenes(ctx) {
  const plan = ctx.plan, sp = plan?.spawn ?? { x: 0, z: 0 }, h = (x, z) => plan?.heightAt?.(x, z) ?? 0, lm = (id) => plan?.landmarks?.find?.((l) => l.id === id);
  const mir = lm('mirador') ?? { x: 20, z: -90 }, plz = lm('almendros') ?? { x: 20, z: 47 };
  return [
    { name: 'spawn-day', x: sp.x, z: sp.z, hour: 17.2, night: 0, indoors: false },
    { name: 'mirador-day', x: mir.x, z: mir.z, hour: 11, night: 0, indoors: false },
    { name: 'plaza-night', x: plz.x, z: plz.z, hour: 22.5, night: 1, indoors: false },
    { name: 'spawn-indoors', x: sp.x, z: sp.z, hour: 17.2, night: 0, indoors: true },
  ].map((s) => ({ ...s, y: h(s.x, s.z) }));
}

const stat = (x) => {
  let peak = 0, sum2 = 0, d2 = 0, mean = 0, finite = true;
  for (let i = 0; i < x.length; i++) { const v = x[i]; if (!Number.isFinite(v)) { finite = false; continue; } const a = Math.abs(v); if (a > peak) peak = a; sum2 += v * v; mean += v; if (i) d2 += (v - x[i - 1]) ** 2; }
  const rms = Math.sqrt(sum2 / Math.max(1, x.length));
  return { peak, rms, dc: mean / Math.max(1, x.length), bright: rms > 1e-9 ? Math.sqrt(d2 / Math.max(1, x.length - 1)) / rms : 0, finite };
};

async function renderScene(parent, sc, seconds) {
  const t0 = performance.now(), SRATE = 44100, ctx = parent.ctx;
  parent.bank ??= new SampleBank(true);
  await parent.bank.prefetch(NEED);
  const ac = new OfflineAudioContext(2, Math.round(seconds * SRATE), SRATE);
  const e = new AudioEngine(ctx, { dry: true, bank: parent.bank });
  e.mode = 'dry'; e.dry = true;
  e.override = { x: sc.x, y: sc.y + 1.6, z: sc.z, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, px: sc.x, py: sc.y, pz: sc.z, indoors: !!sc.indoors, building: null, hour: sc.hour, night: sc.night };
  e._attach(ac);
  e.modeScale = 1; e.volume = 0.8;
  if (!e._world()) return { name: sc.name, ok: false, why: 'no plan' };
  e.crowd = 0.5; e._listen(e.override); e._mix(e.override); e._emitters(e.override);
  const walls = sc.indoors ? 'wood' : 'asphalt';
  for (let k = 0; k < 4; k++) e.play(`step:${walls}:${k % 2}`, { gain: 0.5, when: 0.5 + 0.55 * k });
  e.playAt('door:open:0', sc.x + 2, sc.y + 1.1, sc.z + 1, { bus: 'sfxBus', gain: 1.1, ref: 3, when: 1.2 });
  if (!sc.indoors) { e.ring(1, 0.6); e.playAt('bird:0:0', sc.x + 8, sc.y + 8, sc.z - 6, { gain: 0.9, ref: 7, when: 1.6 }); }
  e.play('chime', { bus: 'uiBus', gain: 0.55, when: seconds - 1.6 });
  const out = await ac.startRendering(), c0 = out.getChannelData(0), c1 = out.getChannelData(1), L = stat(c0), R = stat(c1);
  const amb = Math.max(stat(c0.subarray(0, Math.round(0.45 * SRATE))).rms, stat(c1.subarray(0, Math.round(0.45 * SRATE))).rms);       // before the first event: beds and emitters alone
  const peak = Math.max(L.peak, R.peak), rms = Math.max(L.rms, R.rms), finite = L.finite && R.finite;
  const st = e.state(), db = (v) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  return {
    name: sc.name, ok: finite && peak <= 1.0001 && rms > 1e-4, finite, peak: +peak.toFixed(3), rms: +rms.toFixed(4), dbfs: db(rms), ambDbfs: db(amb),
    bright: +((L.bright + R.bright) / 2).toFixed(3), dc: +Math.max(Math.abs(L.dc), Math.abs(R.dc)).toFixed(5), zone: st.zone, beds: st.beds, bedCutoff: st.bedCutoff,
    voices: st.voices.map((v) => `${v.kind}@${v.dist}m`), seconds, ms: Math.round(performance.now() - t0), errors: st.errors,
  };
}

/** Render every scene for `seconds` each. Resolves { ok, scenes: [...], ms }. Safe to call at any time, with or without a gesture. */
export async function selfTest(parent, o = {}) {
  const t0 = performance.now(), seconds = o.seconds ?? 3, scenes = o.scenes ?? defaultScenes(parent.ctx), out = [];
  if (typeof OfflineAudioContext === 'undefined') return { ok: false, why: 'no OfflineAudioContext', scenes: [], ms: 0 };
  for (const sc of scenes) {
    try { out.push(await renderScene(parent, sc, seconds)); } catch (err) { out.push({ name: sc.name, ok: false, why: String(err?.message ?? err) }); }
  }
  return { ok: out.length > 0 && out.every((s) => s.ok), scenes: out, ms: Math.round(performance.now() - t0), samples: { requested: parent.bank?.requested ?? 0, via: parent.bank?.mode ?? null, errors: [...(parent.bank?.errors ?? [])] } };
}
