// The AFTER-PLAYABLE queue (owner: A1; `?lazy=1`, dev/FEATURE-LAZY.md). The boot ends at a PLAYABLE milestone (streets, terrain, walls, the outsides of the buildings, the player, the first
// frames); everything the barrio is made of beyond that streams in after it, in units, and the page never waits for them:
//
//   ctx.staged.register({ id, label, weight = 1, needs = [], start(ctx) -> Promise | void })
//
//   id      unique; other units name it in `needs`
//   needs   ids of units that must be finished (done or failed) first; a unit with no needs starts when the queue runs (the milestone)
//   weight  its share of the progress cue (roughly: megabytes to fetch, or seconds of work)
//   start   does the work. A rejection is reported (ctx.errors, stage `stream:<id>`) and counts as finished: whatever the unit would have provided keeps its fallback (a missing pack is
//           the stand-in boxes, no people is an empty street), never a blank and never an error on the page
//
// A LATER SECTOR (the beach and the bay to the south, a substation, another library) joins by registering one: its loader and its build step run after the milestone, behind the
// units it names, without a line in main.js's boot path:
//   ctx.staged.register({ id: 'beach', label: 'La playa', weight: 4, needs: ['interior-packs'], start: async (ctx) => { await loadBeach(ctx); buildBeach(ctx); } });
// A unit registered after the queue has run starts as soon as its needs are met.
//
// `settled` resolves once every registered unit has finished (it never rejects); `progress` is the finished weight over the registered weight, a number the cue shows and no logic reads.
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Staged {
  constructor(ctx) {
    this.ctx = ctx; this.units = new Map(); this.running = false; this.t0 = 0;
    this.log = [];                                        // [{ id, ms, start, end, failed }] in the order units finish: the tests and the report read it
    this._settle = []; this._listeners = new Set();
    this.settled = new Promise((r) => { this._resolve = r; });
    this._resolved = false;
  }

  register(u) {
    if (!u?.id || typeof u.start !== 'function') throw new Error('staged unit needs an id and a start()');
    if (this.units.has(u.id)) throw new Error('staged unit registered twice: ' + u.id);
    this.units.set(u.id, { weight: 1, needs: [], label: u.id, ...u, state: 'waiting', started: 0, ended: 0, failed: false });
    if (this._resolved) { this._resolved = false; this.settled = new Promise((r) => { this._resolve = r; }); }           // a late unit: not settled any more
    this._emit();
    if (this.running) this._tick();
    return this;
  }

  /** The milestone: begin. */
  run() { if (this.running) return this.settled; this.running = true; this.t0 = now(); this._tick(); return this.settled; }

  /** Subscribe to progress changes; returns the unsubscribe. */
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  /** Finished weight over total weight (1 when nothing is registered). */
  get progress() {
    let total = 0, done = 0;
    for (const u of this.units.values()) { total += u.weight; if (u.state === 'done') done += u.weight; }
    return total > 0 ? done / total : 1;
  }
  get pending() { return [...this.units.values()].filter((u) => u.state !== 'done'); }
  /** The label of what is being fetched or built now (the first running unit), for the cue. */
  get label() { for (const u of this.units.values()) if (u.state === 'running') return u.label; return ''; }
  get done() { return this.units.size > 0 && this.pending.length === 0; }
  state(id) { return this.units.get(id)?.state ?? null; }
  /** Resolves when that one unit has finished (at once if it has, or if there is no such unit). */
  when(id) {
    const u = this.units.get(id); if (!u || u.state === 'done') return Promise.resolve();
    return new Promise((r) => { const off = this.onChange(() => { if (u.state === 'done') { off(); r(); } }); });
  }

  _emit() { for (const f of this._listeners) { try { f(this); } catch { /* a listener must not stop the queue */ } } }

  _tick() {
    for (const u of this.units.values()) {
      if (u.state !== 'waiting' || !u.needs.every((id) => this.units.get(id)?.state === 'done' || !this.units.has(id))) continue;
      this._start(u);
    }
    if (this.done && !this._resolved) { this._resolved = true; this._emit(); this._resolve(this); }
  }

  _start(u) {
    u.state = 'running'; u.started = now(); this._emit();
    const finish = (failed, e) => {
      if (u.state === 'done') return;
      u.state = 'done'; u.ended = now(); u.failed = failed;
      if (failed) { (this.ctx.errors ??= []).push({ stage: 'stream:' + u.id, message: String(e?.message ?? e), stack: e?.stack }); console.error(`[stream ${u.id}]`, e); }
      this.log.push({ id: u.id, ms: Math.round(u.ended - u.started), start: Math.round(u.started - this.t0), end: Math.round(u.ended - this.t0), failed });
      this._emit(); this._tick();
    };
    let p;
    try { p = u.start(this.ctx); } catch (e) { finish(true, e); return; }
    Promise.resolve(p).then(() => finish(false), (e) => finish(true, e));
  }
}
