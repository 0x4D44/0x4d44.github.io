// Race rules: countdown, lap counting, placing, finishing, results.
import { POINTS } from "./roster.js";

const LOCATE_STEP = 1 / 60;       // locate() cadence (sim runs at 1/120)
const JUMP_LIMIT = 60;            // metres of s-change per locate we treat as a real move
const DNF_WINDOW = 40;            // seconds after the player finishes before stragglers are DNF
const WRONG_WAY_TIME = 1.2;

export class Race {
  constructor({ track, karts, laps, rng }) {
    this.track = track;
    this.karts = karts;
    this.laps = laps || track.laps || 3;
    this.rng = rng || Math.random;
    this.state = "idle";           // idle | countdown | racing | done
    this.time = 0;                 // race clock (0 at GO)
    this.countdown = 3;            // seconds until GO
    this.player = karts.find((k) => k.isPlayer) || null;
    this.finishedList = [];
    this.playerFinishTime = null;
    this._h = {};
    this._acc = 0;
    this._lastLabel = null;
    this._allFinishedFired = false;
    this._throttleAt = new Map();  // kart -> countdown value when throttle first pressed
    this.L = track.length;
    for (const k of karts) this._initKart(k);
  }

  on(name, fn) { (this._h[name] || (this._h[name] = [])).push(fn); return this; }
  off(name, fn) { const a = this._h[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  _emit(name, ...args) { const a = this._h[name]; if (a) for (const f of a.slice()) f(...args); }

  _initKart(k) {
    const loc = this.track.locate(k.position, undefined);
    let s = loc.s;
    if (s > this.L / 2) s -= this.L;      // grid sits just behind the line: negative progress
    k.race = {
      s: loc.s, lap: 1, progress: s, place: 1, finished: false, finishTime: null,
      lapTimes: [], bestLap: null, dnf: false,
      _total: s, _last: loc.s, _maxLap: 0, _lapStart: 0, _jump: 0, _wrong: 0, _wrongOn: false, _est: null,
    };
  }

  start() {
    this.state = "countdown";
    this.countdown = 3;
    this.time = 0;
    this._lastLabel = null;
    this._throttleAt.clear();
    for (const k of this.karts) { k.locked = true; this._initKart(k); }
    this._place();
    this._emit("countdown", "3");
    this._lastLabel = "3";
  }

  _sortedKarts() {
    return this.karts.slice().sort((a, b) => {
      const ra = a.race, rb = b.race;
      if (ra.finished && rb.finished) return ra.finishTime - rb.finishTime;
      if (ra.finished) return -1;
      if (rb.finished) return 1;
      if (ra.dnf !== rb.dnf) return ra.dnf ? 1 : -1;
      return rb.progress - ra.progress;
    });
  }

  _place() {
    const s = this._sortedKarts();
    for (let i = 0; i < s.length; i++) s[i].race.place = i + 1;
    return s;
  }

  standings() { return this._place(); }

  update(dt) {
    if (this.state === "countdown") {
      this.countdown -= dt;
      // note throttle presses for the rocket start
      for (const k of this.karts) {
        const thr = k.input && k.input.throttle > 0.5;
        if (thr && !this._throttleAt.has(k)) this._throttleAt.set(k, this.countdown);
        else if (!thr && this._throttleAt.has(k)) this._throttleAt.delete(k);
      }
      const label = this.countdown > 2 ? "3" : this.countdown > 1 ? "2" : this.countdown > 0 ? "1" : null;
      if (label && label !== this._lastLabel) { this._lastLabel = label; this._emit("countdown", label); }
      if (this.countdown <= 0) this._go();
      return;
    }
    if (this.state === "idle") return;
    this.time += dt;
    this._acc += dt;
    if (this._acc >= LOCATE_STEP) {
      this._acc = 0;
      for (const k of this.karts) this._updateKart(k);
      this._place();
      if (this.playerFinishTime != null) this._autoFinish();
    }
  }

  _go() {
    this.state = "racing";
    this.time = 0;
    this._lastLabel = "GO!";
    for (const k of this.karts) {
      k.locked = false;
      k.race._lapStart = 0; k.race._crossed = false;
      const at = this._throttleAt.get(k);
      // Rocket start: throttle first pressed in the last 0.45 s before GO and still held.
      if (at != null && at > 0 && at < 0.45 && k.input && k.input.throttle > 0.5 && typeof k.boost === "function") {
        k.boost(0.9, 1.1);
        k.race.rocket = true;
        this._emit("rocket", k);
      }
    }
    this._emit("go");
    this._emit("countdown", "GO!");
  }

  _updateKart(k) {
    const r = k.race;
    if (r.finished) return;
    const loc = this.track.locate(k.position, r.s);
    let ds = loc.s - r._last;
    if (ds > this.L / 2) ds -= this.L; else if (ds < -this.L / 2) ds += this.L;
    if (Math.abs(ds) < JUMP_LIMIT) {
      r._total += ds;
      r._jump = 0;
    } else {
      // teleport (respawn) or ambiguous locate: accept new baseline once it persists
      r._jump++;
      if (r._jump < 15) return;
      r._jump = 0;
    }
    r._last = loc.s;
    r.s = loc.s;
    r.progress = r._total;
    if (!r._crossed && r._total >= 0) {
      r._crossed = true;
      r._lapStart = this.time - r._total / Math.max(5, Math.abs(k.speed || 0));
    }
    const lapIdx = Math.floor(r._total / this.L);   // laps completed (>=0 once past the line)
    r.lap = Math.min(this.laps, Math.max(1, lapIdx + 1));

    if (lapIdx > r._maxLap && lapIdx >= 1 && lapIdx <= this.laps) {
      // time of the line crossing, interpolated using current speed
      const over = (r._total - lapIdx * this.L) / Math.max(5, Math.abs(k.speed || 0));
      const t = this.time - over;
      const lapTime = t - r._lapStart;
      r._maxLap = lapIdx;
      r._lapStart = t;
      if (lapIdx < this.laps) {
        r.lapTimes.push(lapTime);
        const isBest = r.bestLap == null || lapTime < r.bestLap;
        if (isBest) r.bestLap = lapTime;
        this._emit("lap", k, lapIdx + 1, lapTime, isBest);
        if (lapIdx + 1 === this.laps) this._emit("finalLap", k);
      } else {
        r.lapTimes.push(lapTime);
        const isBest = r.bestLap == null || lapTime < r.bestLap;
        if (isBest) r.bestLap = lapTime;
        this._finish(k, t, true);
        return;
      }
    }
    this._wrongWay(k, loc);
  }

  _wrongWay(k, loc) {
    const r = k.race;
    const t = this.track.sample(loc.s).tangent;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const dot = fx * t.x + fz * t.z;
    const bad = dot < -0.35 && Math.abs(k.speed) > 3 && k.speed > 0;
    r._wrong = bad ? r._wrong + LOCATE_STEP : Math.max(0, r._wrong - LOCATE_STEP * 3);
    const on = r._wrong > WRONG_WAY_TIME || (r._wrongOn && r._wrong > 0.2);
    if (on !== r._wrongOn) { r._wrongOn = on; this._emit("wrongWay", k, on); }
  }

  _finish(k, t, real) {
    const r = k.race;
    if (r.finished) return;
    r.finished = true;
    r.finishTime = t;
    r.progress = this.laps * this.L + 1e6 - t;   // keeps finished karts ahead in any progress compare
    this.finishedList.push(k);
    this._place();
    if (r._wrongOn) { r._wrongOn = false; this._emit("wrongWay", k, false); }
    this._emit("finish", k, r.place);
    if (k === this.player || (!this.player && this.finishedList.length === 1)) {
      this.playerFinishTime = this.time;
      this._estimate();
    }
    this._checkAll();
  }

  /** Estimated finish times for unfinished karts, ordered by progress, once the player is done. */
  _estimate() {
    const pending = this._sortedKarts().filter((k) => !k.race.finished);
    let prev = this.time;
    for (const k of pending) {
      const r = k.race;
      const remain = Math.max(0, this.laps * this.L - r._total);
      const v = Math.max(18, (k.maxSpeed || 40) * 0.8);
      prev = Math.max(prev + 0.15, this.time + remain / v);
      r._est = prev;
    }
  }

  _autoFinish() {
    const over = this.time > this.playerFinishTime + DNF_WINDOW;
    for (const k of this._sortedKarts()) {
      const r = k.race;
      if (r.finished || r.dnf) continue;
      if (r._est == null) continue;
      if (r._est <= this.time) this._finish(k, r._est, false);
      else if (over) this._markDnf(k);
    }
    this._checkAll();
  }

  _markDnf(k) {
    const r = k.race;
    r.dnf = true;
    r.progress = r._total;
  }

  _checkAll() {
    if (this._allFinishedFired) return;
    if (this.karts.every((k) => k.race.finished || k.race.dnf)) {
      this._allFinishedFired = true;
      this.state = "done";
      this._emit("allFinished");
    }
  }

  /** Resolve every unfinished kart now (estimated time or DNF). Used when results are requested. */
  finalize() {
    if (this._allFinishedFired) return;
    if (this.playerFinishTime == null) this.playerFinishTime = this.time;
    this._estimate();
    for (const k of this._sortedKarts()) {
      const r = k.race;
      if (r.finished || r.dnf) continue;
      const remain = this.laps * this.L - r._total;
      if (r._est != null && r._est - this.time < DNF_WINDOW && remain < this.L * 1.5) this._finish(k, r._est, false);
      else this._markDnf(k);
    }
    this._checkAll();
  }

  results(difficulty, mode) {
    this.finalize();
    const sorted = this._place();
    const pl = this.player;
    const rows = sorted.map((k, i) => ({
      place: i + 1,
      id: k.id,
      name: k.name,
      color: k.color,
      isPlayer: !!k.isPlayer,
      time: k.race.finished ? k.race.finishTime : null,
      bestLap: k.race.bestLap,
      dnf: !!k.race.dnf,
      points: mode === "cup" ? POINTS[i] || 0 : undefined,
    }));
    return {
      trackName: this.track.name,
      trackId: this.track.id,
      mode: mode || "race",
      laps: this.laps,
      difficulty: difficulty || "normal",
      playerPlace: pl ? pl.race.place : 1,
      bestLap: pl ? pl.race.bestLap : null,
      newRecord: false,
      totalTime: pl && pl.race.finished ? pl.race.finishTime : null,
      rows,
      cup: null,
    };
  }

  /** Overall leader progress (metres) for rubber-banding. */
  leaderProgress() {
    let m = -1e9;
    for (const k of this.karts) if (!k.race.finished && k.race.progress > m) m = k.race.progress;
    return m;
  }
}
