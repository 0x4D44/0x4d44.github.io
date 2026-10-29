// The shared context object every module receives. See dev/CONTRACT.md for who owns/filles which field.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng } from './rng.js';
import { Events } from './events.js';
import { Physics } from './physics.js';
import { Batcher } from './mesh.js';
import { MaterialLib } from './matlib.js';
import { Assets } from './assets.js';
import { Interact } from './interact.js';
import { LightRegistry, Discoveries } from './registries.js';
import { yieldFrame } from './util.js';

export function createContext(opts = {}) {
  const ctx = {
    THREE, opts, config: CONFIG,
    seed: opts.seed ?? CONFIG.SEED,
    hour: opts.hour ?? CONFIG.HOUR,
    errors: [], timings: {}, systems: [],
    scene: new THREE.Scene(),
    plan: null,                       // world/plan.js -> generatePlan()
    buildings: new Map(),             // lot id -> BuildingPlan (arch/index.js -> planBuilding)
    anchors: [],                      // NPC activity anchors (interiors + world push here)
    people: null,                     // people module publishes its API here (list(), talk(), ...)
    ui: {                             // engine replaces these; modules may call them at any time
      prompt() {}, subtitle() {}, toast() {}, showMap() {},
    },
    yield: yieldFrame,
  };
  ctx.rng = makeRng(ctx.seed);
  ctx.events = new Events();
  ctx.physics = new Physics();
  ctx.matlib = new MaterialLib(ctx);
  ctx.mat = (key) => ctx.matlib.get(key);
  ctx.batch = new Batcher(ctx);
  ctx.assets = new Assets(ctx);
  ctx.interact = new Interact(ctx);
  ctx.lights = new LightRegistry();
  ctx.discover = new Discoveries(ctx);
  ctx.addAnchor = (a) => { a.id ??= 'a' + ctx.anchors.length; ctx.anchors.push(a); return a; };
  /** Per-frame update hook: fn(dt, ctx). Lower `order` runs first. Engine=0, interact=10, people=20. */
  ctx.addSystem = (name, fn, order = 50) => { ctx.systems.push({ name, fn, order }); ctx.systems.sort((a, b) => a.order - b.order); };
  return ctx;
}
