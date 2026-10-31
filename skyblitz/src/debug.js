// window.__sky: the test/automation surface. Owner: core.
// A bare URL (the real player) gets NONE of it (E-29): teleport / give / start and an error log that wraps console.error are test tools. It is
// installed only when the URL carries one of DEBUG_PARAMS. Typical headless use (see tests/tools/shot.mjs): load
//   /skyblitz/?manual=1&autostart=1&mute=1 , then  __sky.step(600)  /  __sky.state()  /  __sky.cam([x,y,z],[lx,ly,lz])  /  screenshot via the harness.
// To open the title or a menu with the API and nothing else, add `debug=1`. `mute` alone stays a harmless player option.
import { SIM_DT } from './config.js';

const r1 = (x) => Math.round(x * 10) / 10;

/** URL parameters that switch the test surface on. `quality` is not one of them (R2-E-13): it is a setting a player may be told to use (`?quality=low`),
 *  and the game honours it with or without the surface. */
export const DEBUG_PARAMS = ['debug', 'manual', 'autostart', 'demo', 'autopilot', 'course', 'craft', 'diff', 'laps', 'bots', 'seed'];
/** The error log keeps the newest entries only (a runaway error would otherwise grow without bound). */
export const MAX_ERRORS = 200;

/** `?debug` is a switch, so `debug=0`, `debug=false`, `debug=off` and `debug=no` mean off; any other value ("1", "true", a bare `?debug`) means on. */
export function debugFlag(params) {
  if (!params.has('debug')) return false;
  return !['0', 'false', 'off', 'no'].includes(String(params.get('debug')).trim().toLowerCase());
}

export function debugEnabled(params) { return DEBUG_PARAMS.some((k) => (k === 'debug' ? debugFlag(params) : params.has(k))); }

export function installDebug(game) {
  if (!debugEnabled(game.params)) return null;
  const errors = [];
  const note = (s) => { errors.push(s); if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS); };
  addEventListener('error', (e) => note(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => note(('unhandledrejection: ' + (e.reason?.stack || e.reason)).slice(0, 400)));
  const origErr = console.error;
  console.error = (...a) => { note(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 400)); origErr.apply(console, a); };

  const api = {
    ready: false, game, errors,
    /** Start a race right away: __sky.start({course:'redrock', craft:'comet', bots:7, laps:3, autopilot:true, seed:7}) */
    start(cfg = {}) { return game.startRace({ ...game.raceConfigFromParams(), ...cfg }); },
    /** Advance n fixed sim steps, rendering every `renderEvery` steps (default: every step up to 60 steps, else every 6th) and once at the end. */
    step(n = 1, renderEvery) {
      const every = renderEvery || (n <= 60 ? 1 : 6);
      for (let i = 1; i <= n; i++) {
        game.fixedUpdate();
        if (i % every === 0 && i !== n) game.renderFrame(1, SIM_DT * every);
      }
      game.renderFrame(1, SIM_DT);
      return api.state();
    },
    /** Pure simulation, no rendering at all (fast-forward); renders once at the end. */
    sim(n = 1) { for (let i = 0; i < n; i++) game.fixedUpdate(); game.renderFrame(1, SIM_DT); return api.state(); },
    /** Fly the player with the AI pilot (deterministic runs, attract mode). */
    autopilot(on = true) { game.race?.setAutopilot?.(on); return on; },
    /** Free camera override: cam([x,y,z],[lx,ly,lz], fov?) ; cam(null) returns to the rig. */
    cam(pos, look, fov) {
      if (!pos) { game.camOverride = null; return 'rig'; }
      game.camOverride = { pos: new game.THREE.Vector3(...pos), look: new game.THREE.Vector3(...look), fov };
      game.renderFrame(1, 0); return 'free';
    },
    /** Put the player on the main path at arc length s with lateral/vertical offsets and optional speed. */
    teleport(s, lateral = 0, vertical = 0, speed) {
      const p = game.player, c = game.course; if (!p || !c) return false;
      const f = {}; c.frameAt(s, f);
      const THREE = game.THREE;
      p.flight.pos.copy(f.pos).addScaledVector(f.right, lateral).addScaledVector(f.up, vertical);
      const m = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent.clone().negate());
      p.flight.quat.setFromRotationMatrix(m);
      const sp = speed ?? Math.max(60, p.flight.speed);
      p.flight.vel.copy(f.tangent).multiplyScalar(sp); p.flight.speed = sp;
      p.prev?.pos.copy(p.flight.pos); p.prev?.quat.copy(p.flight.quat);
      game.race.onTeleport?.(p);
      return true;
    },
    /** Hand the player an item: give('missile', 1). */
    give(type, count = 1) { const p = game.player; if (p) p.item = { type, count }; return !!p; },
    ui(visible = true) { const e = document.getElementById('ui'); if (e) e.style.display = visible ? '' : 'none'; return visible; },
    quality(id) { game.setQuality(id); return game.qualityId; },
    /** Auto-quality governor snapshot: { scale, preset, pending, median, p90, changes, ... }. */
    governor() { return game.gov?.snapshot() ?? null; },
    /** Start/stop recording gameplay events (returns counts by type). */
    events(on = true) { game.events.log = on ? [] : null; },
    eventCounts() { const c = {}; for (const e of game.events.log || []) c[e.type] = (c[e.type] || 0) + 1; return c; },
    perf() {
      const i = game.renderer.info;
      return { ...game.perf, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pixelRatio: game.pixelRatio, size: [game.width, game.height] };
    },
    state() {
      const r = game.race;
      return {
        state: game.state, paused: game.paused, simTime: +game.simTime.toFixed(2), frame: game.frame, quality: game.qualityId, scale: game.autoScale,
        course: game.course?.id, perf: api.perf(),
        race: r && {
          state: r.state, clock: +(r.clock ?? 0).toFixed(2), laps: r.laps,
          racers: r.racers.map((x) => ({
            id: x.id, name: x.name, player: x.isPlayer, place: x.place, lap: x.lap, s: r1(x.s ?? 0), speed: r1(x.flight.speed), alt: r1(x.flight.pos.y),
            pos: [r1(x.flight.pos.x), r1(x.flight.pos.y), r1(x.flight.pos.z)], item: x.item?.type ?? null, boost: r1(x.flight.boost?.meter ?? 0),
            finished: !!x.finished, finishTime: x.finishTime, tumble: r1(x.tumble ?? 0), shield: r1(x.shield ?? 0),
          })),
        },
        errors: errors.slice(-12),
      };
    },
  };
  window.__sky = api;
  return api;
}
