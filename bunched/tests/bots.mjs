// Player-like bots that use only the dispatcher's levers (plus the automatic robots), shared by the tests.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'engine.js')).href);
export const B = globalThis.Bunched;

const eligible = (sim, b) => !b.hold.armed && !b.hold.active && b.coolUntil <= sim.t;
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const BOTS = {
  none: null,
  // taps every bus whenever the radio is free
  spam: sim => { for (const b of sim.buses) { if (sim.radioBusy() >= sim.cfg.radioMax) break; if (eligible(sim, b)) sim.toggleHold(b.id); } },
  // quick-strip player: hold the closest bus only if its gap is under 0.6 of the target
  think: sim => {
    if (sim.radioBusy() >= sim.cfg.radioMax) return;
    const g = sim.gapsTime(); let bi = -1;
    sim.buses.forEach(b => { if (eligible(sim, b) && g[b.id] < 0.6 * sim.holdTarget() && (bi < 0 || g[b.id] < g[bi])) bi = b.id; });
    if (bi >= 0) sim.toggleHold(bi);
  },
  // random: 2% a tick on a random eligible bus (needs sim._rnd, set in runBot)
  random: sim => { if (sim._rnd() > 0.02) return; const el = sim.buses.filter(b => eligible(sim, b)); if (el.length) sim.toggleHold(el[Math.floor(sim._rnd() * el.length)].id); },
  // wrong-bus: finds the closest pair and holds the bus in FRONT (the one being chased)
  wrong: sim => {
    if (sim.radioBusy() >= sim.cfg.radioMax) return;
    const g = sim.gapsTime(); let bi = -1;
    sim.buses.forEach(b => { if (g[b.id] < 0.6 * sim.holdTarget() && (bi < 0 || g[b.id] < g[bi])) bi = b.id; });
    if (bi >= 0) { const ld = sim.leader(bi); if (eligible(sim, sim.buses[ld])) sim.toggleHold(ld); }
  },
  // clicks the Inspector's top suggestion whenever she has one
  inspect: sim => { const s = B.suggest(sim, 'gap'); if (s.length) sim.toggleHold(s[0].bus, 'gap'); }
};
export function runBot(cfg, bot, auto) {
  const c = { ...cfg, auto: auto || null };
  const sim = B.createSim(c); sim._rnd = rng(c.seed * 31 + 7); const steps = Math.round(c.duration / sim.cfg.dt), fn = BOTS[bot];
  for (let s = 0; s < steps; s++) { if (fn && s % 2 === 0) fn(sim); sim.step(); sim.events.length = 0; }
  return sim;
}
export function replaySeed(L, r) { return L.seed + r * 7919; }
export function score(L, r, bot, auto, extra) {
  const sim = runBot(B.levelConfig(L, { seed: replaySeed(L, r), ...(extra || {}) }), bot, auto);
  return sim.metrics().score;
}
