// STUB music player. The audio agent REPLACES this (ferrosintesis-rendered OGG stems from skyblitz/assets/music, seamless loops,
// adaptive layers driven by the race state). Contract: constructor(game); init(); resume(); play(trackId, opts); stop(fadeSec);
// stinger(name); update(dt, game).
export class MusicPlayer {
  constructor(game) { this.game = game; this.current = null; }
  init() {}
  resume() {}
  play(trackId, opts) { this.current = trackId; }
  stop(fadeSec = 1) { this.current = null; }
  stinger(name) {}
  update(dt, game) {}
  dispose() {}
}
