// STUB effects system. The craft agent REPLACES this (particles, ribbon trails, explosions, shield bubbles, decals...) and keeps the API.
// Fx subscribes to game.events (see the event catalogue in the design contract) and renders the matching visuals.
// Contract: constructor(game); init(); attachRacer(racer); detachRacer(racer); burst(kind, pos, opts); update(dt, game); dispose().
export class Fx {
  constructor(game) { this.game = game; }
  init() {}
  attachRacer(racer) {}
  detachRacer(racer) {}
  /** kind: 'explosion'|'sparks'|'smoke'|'debris'|'flash'|'shockwave'|'lightning'|'pickup'|... */
  burst(kind, pos, opts) {}
  update(dt, game) {}
  dispose() {}
}
