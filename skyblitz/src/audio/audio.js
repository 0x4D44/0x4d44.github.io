// STUB audio engine. The audio agent REPLACES this (WebAudio graph, procedural SFX, engine/wind loops, positional racers, mix buses).
// Contract: constructor(game); init(); resume() (called on the first user gesture); update(dt, game); attachRacer(racer); detachRacer(racer);
//           play(name, opts) for UI sounds; setVolumes() when settings change. Listens to game.events for gameplay sounds. Silent when ?mute=1.
export class AudioEngine {
  constructor(game) { this.game = game; this.ctx = null; this.muted = game.params.has('mute'); }
  init() {}
  resume() {}
  attachRacer(racer) {}
  detachRacer(racer) {}
  play(name, opts) {}
  setVolumes() {}
  update(dt, game) {}
  dispose() {}
}
