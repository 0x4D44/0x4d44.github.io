// Headless game object for node:test and sims (no document / window / WebGL). Owner: race agent.
//   const game = createFakeGame({ seed: 7 });
//   const course = await loadCourseHeadless(game, 'sunrise');
//   const race = makeRace(game, course, { difficulty: 'normal', craftId: 'falcon', bots: 7, autopilot: true });
// Races are stepped with stepRace(race, { seconds }) which calls race.fixedUpdate(SIM_DT, controls) exactly like game.fixedUpdate.
import * as THREE from 'three';
import { SIM_DT, QUALITY, DEFAULT_SETTINGS } from '../../src/config.js';
import { EventBus } from '../../src/events.js';
import { RNG } from '../../src/util.js';
import { createControls } from '../../src/controls.js';
import { Race } from '../../src/race/race.js';
import { loadCourse } from '../../src/world/courses/index.js';

export { SIM_DT };

export function createFakeGame({ seed = 20261029, settings = {}, quality = 'low' } = {}) {
  const tex = new THREE.Texture();
  return {
    THREE, headless: true, scene: new THREE.Scene(), events: new EventBus(), rng: new RNG(seed), seed,
    settings: { ...DEFAULT_SETTINGS, ...settings }, q: QUALITY[quality], qualityId: quality,
    assets: { has: () => false, tex: () => tex, atlas: () => tex, uv: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) },
    params: new URLSearchParams(), width: 1280, height: 720, pixelRatio: 1,
    fx: {}, audio: {}, music: {}, ui: {}, input: { sample: () => createControls() }, state: 'race', paused: false, simTime: 0,
    camera: new THREE.PerspectiveCamera(), renderer: null, course: null, race: null, player: null,
  };
}

export async function loadCourseHeadless(game, id = 'sunrise') {
  const course = await loadCourse(id, game);
  game.course = course;
  return course;
}

export function makeRace(game, course, cfg = {}) {
  const race = new Race(game, { courseId: course.id, craftId: 'falcon', livery: 0, difficulty: 'normal', laps: 3, bots: 7, mode: 'quick', seed: game.seed, ...cfg, course });
  game.race = race; game.player = race.player;
  if (cfg.autopilot) race.setAutopilot(true);
  race.start();
  return race;
}

/** Advance the race by `steps` fixed steps (or `seconds`). Optional controls object for the human. Returns steps run. */
export function stepRace(race, { steps, seconds, controls = null, until = null } = {}) {
  const n = steps ?? Math.round((seconds ?? 1) / SIM_DT);
  for (let i = 0; i < n; i++) {
    race.fixedUpdate(SIM_DT, controls);
    race.game.simTime += SIM_DT;
    if (until && until(race)) return i + 1;
  }
  return n;
}

/** Subscribe to every event: { log, counts, off }. */
export function recordEvents(game) {
  const log = [], counts = {};
  const off = game.events.on('*', (type, payload) => { log.push({ type, payload, t: game.race?.clock ?? 0, s: payload?.racer?.s, dist: payload?.racer?.dist, spd: payload?.racer?.flight?.speed }); counts[type] = (counts[type] || 0) + 1; });
  return { log, counts, off };
}

/** Run a full race to the end (or maxSeconds) and return summary numbers. */
export function simulate(game, course, cfg = {}, { maxSeconds = 600, onStep = null } = {}) {
  const rec = recordEvents(game);
  const race = makeRace(game, course, { autopilot: true, ...cfg });
  let steps = 0, nan = 0;
  const max = Math.round(maxSeconds / SIM_DT);
  while (race.state !== 'done' && steps < max) {
    race.fixedUpdate(SIM_DT, null); game.simTime += SIM_DT; steps++;
    if (onStep) onStep(race, steps);
    if (steps % 30 === 0) for (const r of race.racers) { const p = r.flight.pos; if (!(isFinite(p.x) && isFinite(p.y) && isFinite(p.z) && isFinite(r.flight.speed))) nan++; }
  }
  rec.off();
  const hash = race.racers.map((r) => `${r.id}:${r.finishTime == null ? 'x' : r.finishTime.toFixed(3)}:${r.flight.pos.x.toFixed(2)},${r.flight.pos.y.toFixed(2)},${r.flight.pos.z.toFixed(2)}`).join('|');
  return { race, steps, nan, counts: rec.counts, log: rec.log, hash, clock: race.clock };
}
