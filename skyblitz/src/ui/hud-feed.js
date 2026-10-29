// Kill-feed model for the HUD ticker. Pure logic (no DOM, no THREE) so it runs under node:test; hud.js renders it. Owner: UI agent.
// Rules (P-12 / V-27): one line per kind of event, repeats merge ("Nova Kim hit you x7"), AI-vs-AI cannon and bump noise is dropped, the two
// reports of one contact (racer:hit fires once per side) collapse into one line, and lines about the player stay up for at least `pin` seconds.

export const FEED = { max: 4, hardMax: 6, ttl: 5, aiTtl: 3, pin: 2, pairWindow: 0.5 };
export const feedText = (l) => l.text + (l.n > 1 ? ' x' + l.n : '');

export class Feed {
  constructor(opts = {}) { this.o = { ...FEED, ...opts }; this.lines = []; this.now = 0; this.pairs = new Map(); this.seq = 0; }

  /**
   * Add a line: e = { key, text, mine (about the player), pair? (contact id: the second report within pairWindow is dropped) }.
   * Returns { line, created } (created is false when it merged into a live line) or null when the entry was dropped.
   */
  add(e) {
    const o = this.o;
    if (e.pair) {
      const t = this.pairs.get(e.pair);
      if (t !== undefined && this.now - t < o.pairWindow) return null;
      this.pairs.set(e.pair, this.now);
    }
    let l = this.lines.find((x) => x.key === e.key);
    if (l) { l.n++; l.age = 0; l.text = e.text; if (e.mine) { l.mine = true; l.ttl = o.ttl; } return { line: l, created: false }; }
    l = { id: ++this.seq, key: e.key, text: e.text, n: 1, mine: !!e.mine, age: 0, ttl: e.mine ? o.ttl : o.aiTtl };
    this.lines.push(l);
    this.trim();
    return { line: l, created: true };
  }

  /** Over the cap: drop the oldest AI line first, then the oldest player line that has had its `pin` seconds; if every line is pinned, grow up to hardMax. */
  trim() {
    const o = this.o, pinned = (l) => l.mine && l.age < o.pin;
    while (this.lines.length > o.max) {
      let i = this.lines.findIndex((l) => !l.mine);
      if (i < 0) i = this.lines.findIndex((l) => !pinned(l));
      if (i < 0) { if (this.lines.length <= o.hardMax) return; i = 0; }
      this.lines.splice(i, 1);
    }
  }

  /** Age every line; returns true when a line expired. */
  tick(dt) {
    this.now += dt;
    let gone = false;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]; l.age += dt;
      if (l.age >= l.ttl) { this.lines.splice(i, 1); gone = true; }
    }
    if (this.pairs.size > 24) for (const [k, t] of this.pairs) if (this.now - t > this.o.pairWindow) this.pairs.delete(k);
    return gone;
  }

  clear() { this.lines.length = 0; this.pairs.clear(); }
}

const NOUN = { missile: 'missile', mine: 'mine', emp: 'EMP', lightning: 'storm' };
const rid = (r) => r.id ?? r.name;

/** racer:hit -> feed entry or null (dropped). `me(r)` says whether r is the local player. */
export function hitEntry({ racer: v, by: a, kind }, me) {
  if (!v) return null;
  const vMe = me(v), aMe = !!a && me(a);
  if (kind === 'racer') {
    // one contact is reported once per side: keep a single line, and only when the player is in it
    if (!a || !(vMe || aMe)) return null;
    const other = vMe ? a : v;
    return { key: 'bump:' + rid(other), text: 'Collided with ' + other.name, mine: true, pair: 'bump:' + [rid(v), rid(a)].sort().join(':') };
  }
  if (!a) return vMe ? { key: 'crash:' + kind, text: kind ? 'You crashed (' + kind + ')' : 'You crashed', mine: true } : null;
  const noun = NOUN[kind];
  if (!noun) {
    if (!(vMe || aMe)) return null;                       // AI-vs-AI cannon fire is noise
    return { key: 'hit:' + rid(a) + ':' + rid(v) + ':' + kind, text: vMe ? a.name + ' hit you' : 'You hit ' + v.name, mine: true };
  }
  return {
    key: kind + ':' + rid(a) + ':' + rid(v), mine: vMe || aMe,
    text: vMe ? a.name + "'s " + noun + ' hit you' : aMe ? 'Your ' + noun + ' hit ' + v.name : a.name + "'s " + noun + ' hit ' + v.name,
  };
}

/** missile:launch -> feed entry or null: only launches at, or by, the player. */
export function launchEntry({ owner, target }, me) {
  if (!owner || !target || !(me(owner) || me(target))) return null;
  return { key: 'fire:' + rid(owner) + ':' + rid(target), text: me(owner) ? 'You fired at ' + target.name : owner.name + ' fired at You', mine: true };
}
