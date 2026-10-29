// Audio front door. Fully synthesised (WebAudio); driven entirely by Vehicle state.
import { createMixer } from "./mixer.mjs";
import { createEngine } from "./engine.mjs";
import { createSurface } from "./surface.mjs";
import { createAmbience } from "./ambience.mjs";
import { createSfx } from "./sfx.mjs";
import { createCodriver } from "./codriver.mjs";
import { viewMix, volumesClean } from "./params.mjs";

/**
 * createAudio(volumes, opts?)  opts: { ctx } injects a (possibly Offline) AudioContext for tests;
 * { speech } injects codriver deps. Create it from a user gesture (or call resume() from one).
 */
export function createAudio(volumes = {}, opts = {}) {
  const AC = typeof AudioContext !== "undefined" ? AudioContext : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
  const ctx = opts.ctx || (AC ? new AC({ latencyHint: "interactive" }) : null);
  if (!ctx) throw new Error("WebAudio is not available");
  const mixer = createMixer(ctx, volumes);
  const engine = createEngine(ctx, mixer.engineBus);
  const surface = createSurface(ctx, mixer.effectsBus);
  const ambience = createAmbience(ctx, mixer.ambienceBus);
  const sfx = createSfx(ctx, mixer.effectsBus, mixer.voiceBus);
  const codriver = createCodriver({ volume: () => mixer.volumes.voice * mixer.volumes.master, beep: (t) => sfx.beepCall(t), ...(opts.speech || {}) });
  let mode = "chase", view = viewMix(mode), paused = false, suspended = false, stageDef = null, spec = null, disposed = false;
  let lastS = 0;

  const api = {
    ctx, mixer, engine, surface, ambience, sfx, codriver,
    resume() { suspended = false; return ctx.state === "suspended" && ctx.resume ? ctx.resume() : Promise.resolve(); },
    suspend() { suspended = true; codriver.cancel(); return ctx.state === "running" && ctx.suspend ? ctx.suspend() : Promise.resolve(); },
    setStage(def) { stageDef = def; ambience.setStage(def); },
    setCarSpec(s) { spec = s; engine.setSpec(s); },
    setVolumes(v) { mixer.setVolumes(v); },
    playUI(name) { if (!disposed) sfx.ui(name); },
    /** Resets the co-driver and one-shot state for a restart. */
    reset(s = 0) { codriver.reset(s); engine.revive(); },
    update(dt, state, stage, o = {}) {
      if (disposed || !state) return;
      const cm = o.cameraMode || mode;
      if (cm !== mode) { mode = cm; view = viewMix(mode); mixer.setView(view); }
      if (o.paused !== undefined && o.paused !== paused) {
        paused = !!o.paused;
        codriver.pause(paused);
        if (paused) mixer.master.gain.setTargetAtTime(0.0, ctx.currentTime, 0.05);
        else mixer.setVolumes(mixer.volumes);
      }
      if (paused || suspended) return;
      const ev = state.events || [];
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        switch (e.t) {
          case "impact": sfx.impact(e); break;
          case "landing": sfx.landing(e.strength); break;
          case "bottomout": sfx.bottomout(e.strength); break;
          case "shift": engine.shift(e.from, e.to); break;
          case "wastegate": engine.flutter(state.boost || 0.5); break;
          case "limiter": engine.limiter(); break;
          case "puncture": sfx.puncture(); break;
          case "engine_fail": engine.fail(); break;
          case "roll": sfx.roll(); break;
          case "splash": surface.splash(e.strength ?? 0.6); break;
          default: break;
        }
      }
      const running = !(state.damage && state.damage.engine >= 1);
      engine.update({ rpm: state.rpm, throttle: state.throttle, boost: state.boost, speed: state.speed, gear: state.gear, running }, dt, view);
      surface.update({ wheels: state.wheels, speed: state.speed }, dt, view);
      ambience.update(dt, { speed: state.speed, s: state.s }, view, stage);
      if (stage) codriver.update(stage, state.s, Math.abs(state.speed || 0), dt);
      lastS = state.s;
    },
    dispose() {
      disposed = true;
      codriver.cancel();
      engine.dispose(); surface.dispose(); ambience.dispose();
      try { if (!opts.ctx) ctx.close(); } catch { /* */ }
    },
  };
  Object.defineProperty(api, "volumes", { get: () => volumesClean(mixer.volumes) });
  return api;
}
