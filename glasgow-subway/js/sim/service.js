// Service: one train running on a Track with driver/ATO control, doors, dwell, signals, scoring.
// Pure logic (no THREE/DOM) so it can be unit tested in node and driven headless.
import { Train, notchToCmd, stockFrom } from './dynamics.js';
import { atoControl } from './ato.js';
import { DIFFICULTY, platformInterval, platformSide, doorPermission, berthingScore, berthingLabel, punctualityScore, paxExchange, buildSchedule } from './rules.js';
import { KMH, clamp, mulberry32, wrapL } from './util.js';

const DOOR_TIME = 2.6;

export class Service {
  /**
   * @param o { track, stock, stations(array), difficulty:'standard', seed, startIdx, platformLen, autoDoors, ato, role }
   */
  constructor(o) {
    this.track = o.track;
    this.stations = o.stations || [];
    this.stationById = new Map(this.stations.map((s) => [s.id, s]));
    this.stock = o.stock || stockFrom(null);
    this.diff = DIFFICULTY[o.difficulty || 'standard'];
    this.rng = mulberry32(o.seed ?? 1234);
    this.train = new Train(this.stock, { lagApply: this.diff.lagApply, lagRelease: this.diff.lagRelease });
    this.listeners = [];
    this.L = this.track.length;
    this.stops = this.track.stops;
    this.lineKey = o.lineKey || 'outer';
    this.defaultPlatLen = o.platformLen || 50;
    // precompute platform sides per stop
    this.sideOf = this.stops.map((st) => {
      const stn = this.stationById.get(st.station);
      return platformSide(st.straight, stn && stn.platform, this.lineKey, 1);
    });
    this.lever = 0;          // notch -3..3 (manual)
    this.ebPressed = false;
    this.ato = !!o.ato;
    this.autoDoors = !!o.autoDoors || this.diff.autoDoors;
    this.role = o.role || 'player';
    this.t = 0;
    this.doors = { L: 0, R: 0, cmdL: 0, cmdR: 0 };
    this.doorSel = 1;       // selected side for the open command (+1 right / -1 left)
    this.pax = { onboard: Math.round(30 + this.rng() * 50), boarding: 0, alighting: 0, boarded: 0, alighted: 0, missed: 0, waiting: 0, todo: null };
    this.score = { total: 0, max: 0, stops: [], berth: 0, punctual: 0, penalties: 0, log: [], overspeedS: 0, spads: 0, trips: 0, stopsDone: 0, distance: 0 };
    this.vigil = 0; this.vigilWarn = false; this.atpTrip = false; this.spadTrip = false;
    this.message = null; this.messageT = 0;
    this.phase = 'run';
    this.signalGreen = true; this.sigU = 0;
    this.canReverse = false; this.reversing = false;
    this.assistActive = false;
    this.schedule = o.schedule || null;
    this.lap = 0;
    this.dwellT = 0;
    this.stopStatus = null;  // info on current stop result
    this.lastErr = null;
    this._setTarget(o.startIdx || 0, true);
    if (o.startIdx != null && o.placeAtStop !== false) this.placeAtStop(o.startIdx);
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  emit(type, data = {}) { for (const f of this.listeners) f(type, data); }
  toast(text, kind = 'info', secs = 3) { this.message = { text, kind }; this.messageT = secs; this.emit('toast', { text, kind }); }

  // ---------- target / placement ----------
  _setTarget(idx, init = false) {
    this.idx = ((idx % this.stops.length) + this.stops.length) % this.stops.length;
    const st = this.stops[this.idx];
    if (init) { this.base = 0; }
    // unwrapped mark ahead of (or at) the train front
    let u = st.s + this.base;
    if (!init) { while (u < this.train.s - 15) u += this.L; }
    this.targetU = u;
    this.sigU = u + 24;
  }
  get stop() { return this.stops[this.idx]; }
  get station() { return this.stationById.get(this.stop.station) || { name: this.stop.station, id: this.stop.station, platform: {} }; }
  get platSide() { return this.sideOf[this.idx]; }
  get pf() { return platformInterval({ s: this.targetU, sc: this.targetU - this.stop.cabOff }, this.stock.lengthM, this.station.platform && this.station.platform.lengthM || this.defaultPlatLen); }
  get doorsClosed() { return this.doors.L === 0 && this.doors.R === 0; }
  get doorsOpen() { return this.doors.L > 0.98 || this.doors.R > 0.98; }
  get distToStop() { return this.targetU - this.train.s; }
  get speed() { return this.train.v; }
  get chainage() { return wrapL(this.train.s, this.L); }

  /** Place the train stopped exactly at stop idx (dwell begins). */
  placeAtStop(idx, errM = 0) {
    this._setTarget(idx, true);
    this.base = 0; this.train.s = this.targetU + errM; this.train.v = 0; this.train.a = 0;
    this.train.brakeAct = 1; this.train.tractionAct = 0; this.train.holding = true;
    this.phase = 'station'; this.dwellT = 0; this.signalGreen = false; this.stopStatus = { err: errM, label: 'START', score: 0 };
    this.doors.L = this.doors.R = this.doors.cmdL = this.doors.cmdR = 0;
    this.lastErr = errM;
    this.pax.waiting = this._demand(); this.pax.todo = null;
    this.stopStart = this.t;
    this.arrivedAt = this.t;
  }
  /** Place the train rolling at speed v, dist m before stop idx's mark. */
  placeApproaching(idx, dist, v = 0) {
    this._setTarget(idx, true);
    this.train.s = this.targetU - dist; this.train.v = v; this.train.brakeAct = 0; this.train.tractionAct = 0;
    this.phase = 'run'; this.signalGreen = false; this.dwellT = 0;
    this.doors.L = this.doors.R = this.doors.cmdL = this.doors.cmdR = 0;
    this.pax.todo = null;
  }

  _demand() {
    const k = this.stops.length ? this.idx / this.stops.length : 0;
    return Math.round(10 + 40 * (0.5 + 0.5 * Math.sin(k * 6.1 + 1)) + this.rng() * 22);
  }

  // ---------- driver inputs ----------
  vigilanceReset() { this.vigil = 0; this.vigilWarn = false; }
  setLever(n) {
    n = clamp(Math.round(n), -3, 3);
    if (n !== this.lever) { this.lever = n; this.vigilanceReset(); this.emit('lever', { n }); }
  }
  stepLever(d) { this.setLever(this.lever + d); }
  setEmergency(on) { this.ebPressed = !!on; if (on) this.vigilanceReset(); }
  setAto(on) { this.ato = !!on; if (on) { this.lever = 0; } this.emit('ato', { on: this.ato }); this.toast(this.ato ? 'ATO engaged' : 'ATO off - manual control', 'info'); }
  selectDoorSide(side) { this.doorSel = side > 0 ? 1 : -1; this.vigilanceReset(); }
  setReverse(on) { this.reversing = !!on && this.canReverse; }

  openDoors(side = this.doorSel, auto = false) {
    if (this.phase !== 'station') { if (!auto) this._reject('Doors can only open at a platform', true); return false; }
    const perm = doorPermission({ v: this.train.v, front: this.train.s, rear: this.train.rear, pf: this.pf, side, platSide: this.platSide, ignoreSide: this.diff.ignoreSide || auto });
    if (!perm.ok) { if (!auto) this._reject(perm.reason, true, side); return false; }
    const useSide = this.diff.ignoreSide || auto ? this.platSide : side;
    if (useSide > 0) this.doors.cmdR = 1; else this.doors.cmdL = 1;
    this.vigilanceReset();
    this.emit('doors', { open: true, side: useSide });
    return true;
  }
  closeDoors() {
    if (this.doors.cmdL === 0 && this.doors.cmdR === 0) return;
    this.doors.cmdL = this.doors.cmdR = 0; this.vigilanceReset();
    this.emit('doors', { open: false });
    this.emit('chime', { kind: 'close' });
  }
  toggleDoors() { if (this.doors.cmdL || this.doors.cmdR) this.closeDoors(); else this.openDoors(); }
  _reject(reason, penalise, side) {
    this.toast(reason, 'warn');
    if (penalise && this.phase === 'station' && this.train.v <= 0.1 && /SIDE/.test(reason)) this._penalty(15, 'Wrong door side', 'door');
    else if (penalise && /NOT AT PLATFORM/.test(reason)) this._penalty(5, 'Doors refused: ' + reason, 'door');
  }

  _penalty(points, text, kind = 'penalty') {
    const p = Math.round(points * this.diff.penalty);
    this.score.penalties += p; this.score.total -= p;
    this.score.log.push({ t: this.t, text, delta: -p, kind });
    this.emit('log', { text, delta: -p, kind });
  }
  _award(points, text, kind = 'bonus') {
    this.score.total += points; this.score.max += 0;
    this.score.log.push({ t: this.t, text, delta: points, kind });
    this.emit('log', { text, delta: points, kind });
  }

  // ---------- simulation ----------
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (this.messageT > 0) { this.messageT -= dt; if (this.messageT <= 0) this.message = null; }
    const tr = this.train, track = this.track;
    const grade = track.gradient(tr.s), curv = track.curvature(tr.s);
    const limit = track.limit(tr.s);

    // --- decide command ---
    const stationHold = this.phase === 'station';
    let dStop = this.phase === 'depart' ? null : this.distToStop;
    if (this.phase === 'station' && this.signalGreen && this.doorsClosed) dStop = this._nextU() - tr.s;
    let cmd = 0, eb = this.ebPressed, atoOut = null;
    if (this.ato || this.diff.autoBrake || this.role === 'ai') atoOut = atoControl(tr, track, dStop, {});
    if (this.ato) {
      cmd = atoOut.cmd;
      if (stationHold && !(this.signalGreen && this.doorsClosed)) cmd = -1;
      this._atoDoors(dt);
    } else {
      cmd = notchToCmd(this.lever);
      if (this.diff.autoBrake && atoOut) {
        // assisted: protective braking, never lets a driver overrun the stop or the limit
        this.assistActive = false;
        const protect = (atoOut.needBrake > 0.12 || (dStop != null && dStop < 1.5)) && atoOut.cmd < cmd - 0.05 && (dStop != null ? (tr.v > 1.2 || dStop < 4) : true);
        if (protect) { cmd = Math.min(cmd, atoOut.cmd); this.assistActive = true; }
        if (tr.v > limit + 2 * KMH && atoOut.cmd < cmd) { cmd = atoOut.cmd; this.assistActive = true; }
        if (this.autoDoors) this._atoDoors(dt);
      }
    }
    // reverse shunt after overrun
    if (this.canReverse) {
      tr.dir = this.reversing ? -1 : 1;
      if (this.reversing) { cmd = clamp(Math.max(cmd, 0), 0, 0.5); if (tr.v > 8 * KMH) cmd = 0; }
    } else tr.dir = 1;

    // --- interlocks ---
    const interlocked = !this.doorsClosed;
    tr.tractionCut = interlocked || this.atpTrip || this.spadTrip || (this.diff.signalCutout && stationHold && !this.signalGreen);
    if (stationHold || tr.v < 0.03) tr.holding = true; else tr.holding = false;
    // vigilance (manual only)
    if (!this.ato && this.diff.vigilance && tr.v > 0.6 && this.role === 'player') {
      this.vigil += dt;
      if (this.vigil > 22 && !this.vigilWarn) { this.vigilWarn = true; this.toast('VIGILANCE - touch a control', 'warn', 4); this.emit('chime', { kind: 'vigil' }); }
      if (this.vigil > 32) { eb = true; this.vigil = 0; this.vigilWarn = false; this.score.trips++; this._penalty(100, 'Dead-man\'s: emergency brake', 'trip'); this.toast('DEAD-MAN\'S BRAKE', 'bad', 4); }
    }
    // overspeed + ATP
    const over = (tr.v - limit) / KMH;
    this.overBy = over;
    if (this.role === 'player' && !this.ato) {
      if (over > this.diff.overTolKmh) {
        this.score.overspeedS += dt;
        this._overAccum = (this._overAccum || 0) + dt;
        if (this._overAccum > 1) { this._overAccum = 0; this._penalty(3, 'Overspeed ' + Math.round(over) + ' km/h over', 'over'); }
        if (over > this.diff.atpKmh && !this.atpTrip) {
          this.atpTrip = true; this.score.trips++; this._penalty(80, 'ATP trip: overspeed', 'trip'); this.toast('ATP TRIP - OVERSPEED', 'bad', 4);
          this.emit('chime', { kind: 'trip' });
        }
      } else this._overAccum = 0;
    }
    if (this.atpTrip) { eb = true; if (tr.v < 0.05 && this.lever <= 0) { this.atpTrip = false; this.toast('ATP reset', 'info'); } }
    if (this.spadTrip) { eb = true; if (tr.v < 0.05) { this.spadTrip = false; } }

    // --- physics ---
    const prevS = tr.s;
    tr.step(dt, cmd, eb, { grade, curvature: curv });
    this.score.distance += Math.abs(tr.s - prevS);
    this.cmdOut = cmd;

    // --- phases ---
    this._phases(dt, prevS);
    this._doors(dt);
    this._pax(dt);
  }

  _phases(dt, prevS) {
    const tr = this.train;
    if (this.phase === 'run') {
      const d = this.distToStop;
      // station stop detected when stopped near the mark
      if (tr.v < 0.03 && d < 60 && d > -60) {
        const err = tr.s - this.targetU;
        this._arrive(err);
      }
      // signal pass check (only while a signal is ahead and not green)
    } else if (this.phase === 'station') {
      this.dwellT += dt;
      const st = this.stop;
      const prevGreen = this.signalGreen;
      this.signalGreen = this.dwellT >= st.dwellS && this.doorsClosed && !this._overrun;
      if (this.signalGreen && !prevGreen) this.emit('signal', { green: true });
      if (tr.v > 0.3) {
        // departing
        this._depart();
      }
    } else if (this.phase === 'depart') {
      if (!this._sigPassed && tr.s > this.sigU) {
        this._sigPassed = true;
        if (!this._departGreen) {
          this.score.spads++; this._penalty(250, 'SPAD: signal passed at danger', 'spad'); this.toast('SIGNAL PASSED AT DANGER', 'bad', 5);
          this.spadTrip = true; this.score.trips++;
          this.emit('chime', { kind: 'trip' });
        }
      }
      if (tr.s > this.targetU + this.stock.lengthM + 12) {
        this.emit('departed', { idx: this.idx });
        this._next();
      }
    }
  }

  _arrive(err) {
    const tr = this.train;
    this.phase = 'station'; this.dwellT = 0; this.signalGreen = false; this._overrun = false;
    this.lastErr = err;
    const pf = this.pf;
    const inPlat = tr.rear >= pf.start - 0.6 && tr.s <= pf.end + 0.6;
    const label = berthingLabel(err), pts = inPlat ? berthingScore(err) : 0;
    this.stopStatus = { err, label, score: pts, inPlatform: inPlat, idx: this.idx };
    this.score.stops.push({ idx: this.idx, name: this.station.name, err, score: pts, label });
    this.score.berth += pts; this.score.max += 100; this.score.stopsDone++; this.score.total += pts;
    this.score.log.push({ t: this.t, text: `${this.station.name}: ${label} (${err >= 0 ? '+' : ''}${err.toFixed(2)} m) +${pts}`, delta: pts, kind: 'stop' });
    this.emit('arrive', { idx: this.idx, err, label, score: pts, inPlatform: inPlat });
    // timetable
    this.arrivedAt = this.t;
    if (this.schedule) {
      const sched = this.schedule.arr[this.idx] + this.lap * this.schedule.period + (this.t0 || 0);
      const late = this.t - sched;
      this.stopStatus.late = late;
      const pp = punctualityScore(late);
      this.score.punctual += pp; this.score.max += 50; this.score.total += Math.round(pp / 2);
      this.score.log.push({ t: this.t, text: `Arrival ${late >= 0 ? '+' : ''}${Math.round(late)}s vs timetable`, delta: Math.round(pp / 2), kind: 'time' });
    }
    this.pax.waiting = this._demand();
    this.pax.todo = null;
    if (!inPlat) {
      this._overrun = tr.s > pf.end + 0.6;
      this.toast(this._overrun ? 'OVERRUN - doors locked. Hold R to reverse.' : 'SHORT OF PLATFORM - creep forward', 'warn', 5);
      if (this._overrun) { this._penalty(60, 'Overran the platform', 'penalty'); this.canReverse = true; }
    }
  }

  _depart() {
    this.phase = 'depart'; this._sigPassed = false;
    this._departGreen = this.signalGreen;
    this.canReverse = false; this.reversing = false;
    const st = this.stop;
    if (this.schedule) {
      const sched = this.schedule.dep[this.idx] + this.lap * this.schedule.period + (this.t0 || 0);
      const late = this.t - sched;
      if (this.role === 'player' && !this.ato) {
        if (late < -6) this._penalty(Math.min(60, Math.round(-late)), 'Early departure ' + Math.round(-late) + 's', 'time');
        else if (Math.abs(late) <= 10) this._award(25, 'On-time departure', 'time');
      }
    }
    if (this.pax.todo) { this.pax.missed += Math.max(0, this.pax.waiting - this.pax.boarded); }
    this.emit('depart', { idx: this.idx });
  }

  _next() {
    const wasLast = this.idx === this.stops.length - 1;
    this.idx = (this.idx + 1) % this.stops.length;
    if (wasLast) { this.lap++; this.base += this.L; }
    const st = this.stops[this.idx];
    let u = st.s + this.base; while (u < this.train.s - 15) u += this.L;
    this.targetU = u; this.sigU = u + 24;
    this.phase = 'run'; this.stopStatus = null; this.dwellT = 0; this.signalGreen = false;
    this.emit('target', { idx: this.idx });
  }

  _nextU() {
    const n = this.stops.length, j = (this.idx + 1) % n;
    let u = this.stops[j].s + this.base + (this.idx === n - 1 ? this.L : 0);
    while (u < this.targetU + 30) u += this.L;
    return u;
  }

  _atoDoors(dt) {
    if (this.phase !== 'station') return;
    const st = this.stop;
    const pf = this.pf, tr = this.train;
    const inPlat = tr.rear >= pf.start - 0.6 && tr.s <= pf.end + 0.6;
    if (tr.v < 0.03 && inPlat) {
      if (this.dwellT > 1.2 && this.dwellT < st.dwellS - 4.5 && !this._autoOpened) { this._autoOpened = true; this.openDoors(this.platSide, true); }
      if (this.dwellT >= st.dwellS - 4.5 && this._autoOpened && !this._autoClosed) {
        this._autoClosed = true; this.closeDoors();
      }
    }
    if (this.dwellT < 0.5) { this._autoOpened = false; this._autoClosed = false; }
  }

  _doors(dt) {
    const d = this.doors, step = dt / DOOR_TIME;
    d.L = clamp(d.L + (d.cmdL ? step : -step), 0, 1);
    d.R = clamp(d.R + (d.cmdR ? step : -step), 0, 1);
    if (this.phase !== 'station' && (d.cmdL || d.cmdR)) { d.cmdL = d.cmdR = 0; }
    if (this.train.v > 0.2 && (d.L > 0 || d.R > 0)) { d.cmdL = d.cmdR = 0; }
  }

  _pax(dt) {
    const p = this.pax;
    if (this.phase !== 'station') { if (this.phase === 'run') { p.boarding = 0; p.alighting = 0; } return; }
    if (this.doorsOpen && !p.todo) {
      const ex = paxExchange(p.onboard, p.waiting, this.stock.capacity, this.rng);
      p.todo = { alight: ex.alight, board: ex.board, a: 0, b: 0, missed: ex.missed };
      p.boarded = 0; p.alighted = 0;
    }
    if (p.todo && (this.doors.L > 0.5 || this.doors.R > 0.5)) {
      const td = p.todo, rate = 4.5 * dt;
      if (td.a < td.alight) { const inc = Math.min(rate, td.alight - td.a); td.a += inc; }
      else if (td.b < td.board) { const inc = Math.min(rate, td.board - td.b); td.b += inc; }
      const a = Math.floor(td.a), b = Math.floor(td.b);
      p.onboard += (a - p.alighted) - (b - p.boarded) * -1;
      p.onboard = clamp(p.onboard, 0, this.stock.capacity);
      p.alighted = a; p.boarded = b;
      p.alighting = td.alight - a; p.boarding = td.board - b;
      p.waiting = Math.max(0, td.board + td.missed - b);
      this.train.paxMassKg = p.onboard * 72;
    } else { p.boarding = p.boarding && this.doorsOpen ? p.boarding : 0; }
    this.train.paxMassKg = p.onboard * 72;
  }

  /** compact HUD info */
  info() {
    const tr = this.train, st = this.stop;
    return {
      t: this.t, v: tr.v, kmh: tr.v / KMH, limitKmh: this.track.limit(tr.s) / KMH, safeKmh: this.track.safeSpeed(tr.s) / KMH,
      lever: this.lever, ato: this.ato, phase: this.phase, doors: this.doors, doorsClosed: this.doorsClosed,
      nextName: this.station.name, nextIdx: this.idx, distToStop: this.distToStop, signalGreen: this.signalGreen,
      brakeBar: tr.brakePressureBar, traction: tr.tractionAct, accel: tr.a, platSide: this.platSide,
      dwellLeft: Math.max(0, st.dwellS - this.dwellT), pax: this.pax, vigil: this.vigil, assist: this.assistActive,
      grade: this.track.gradient(tr.s) * 100, eb: tr.ebLatched, tractionCut: tr.tractionCut, score: this.score, over: this.overBy,
      stopStatus: this.stopStatus, canReverse: this.canReverse,
    };
  }
}

/** Run a headless ATO service from stop k to k+1 to estimate baseline run times. */
export function baselineRunTimes(track, stock, stations) {
  const times = [];
  for (let k = 0; k < track.stops.length; k++) {
    const svc = new Service({ track, stock, stations, difficulty: 'standard', ato: true, role: 'ai', startIdx: k, autoDoors: true, seed: 1 });
    svc.placeAtStop(k);
    svc.dwellT = svc.stop.dwellS; svc.signalGreen = true;
    const tStart = svc.t; let departed = false, guard = 0;
    svc.on((type) => { if (type === 'depart') departed = true; });
    let tDep = null, tArr = null;
    svc.on((type, d) => { if (type === 'depart' && tDep == null) tDep = svc.t; if (type === 'arrive' && departed && tArr == null) tArr = svc.t; });
    while (tArr == null && guard++ < 60000) svc.update(0.1);
    times.push(tArr != null && tDep != null ? tArr - tDep : 90);
  }
  return times;
}
