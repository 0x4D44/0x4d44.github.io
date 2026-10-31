// Kill-feed model for the HUD ticker. Pure logic (no DOM, no THREE) so it runs under node:test; hud.js renders it. Owner: UI agent.
// Rules (P-12 / V-27): one line per kind of event, repeats merge ("Nova Kim hit you x7"), AI-vs-AI cannon and bump noise is dropped, the two
// reports of one contact (racer:hit fires once per side) collapse into one line, and lines about the player stay up for at least `pin` seconds.
// R2-V-11: the player's passes are one counted line ("You passed 4 rivals": a start sorts the pack in a few seconds), the object "you" is lower case
// ("Zed fired at you"), and on a short screen (<= shortH px tall) pinned lines may not grow the feed past shortHardMax.

export const FEED = { max: 4, hardMax: 6, shortHardMax: 4, shortH: 460, ttl: 5, aiTtl: 3, pin: 2, pairWindow: 0.5 };
/** The most lines the feed may hold at this screen height: a pinned line may push the feed past `max`, but not past this. */
export const feedHardMax = (h) => (h <= FEED.shortH ? FEED.shortHardMax : FEED.hardMax);
/** A "You" at the end of a line is its object ("Zed fired at You"): lower case in the middle of a sentence. A line that starts with "You" is left alone. */
const lowerYou = (t) => t.replace(/(\S) You$/, '$1 you');
/** The text of a line: repeats of one event read "x7"; a line with a `many` wording (counted passes) uses it instead. */
export const feedText = (l) => (l.n > 1 && l.many ? l.many(l.n) : lowerYou(l.text) + (l.n > 1 ? ' x' + l.n : ''));

export class Feed {
  constructor(opts = {}) { this.o = { ...FEED, ...opts }; this.lines = []; this.now = 0; this.pairs = new Map(); this.seq = 0; }

  /**
   * Add a line: e = { key, text, mine (about the player), pair? (contact id: the second report within pairWindow is dropped),
   * who? + many? (a counted line: `who` names the party of this event, the line counts the DISTINCT parties, and `many(n)` words the count) }.
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
    if (l) {
      if (e.who !== undefined) { (l.who ||= new Set()).add(e.who); l.n = l.who.size; } else l.n++;   // the same rival passed twice is still one rival
      l.age = 0; l.text = e.text; l.many = e.many; if (e.mine) { l.mine = true; l.ttl = o.ttl; } return { line: l, created: false };
    }
    l = { id: ++this.seq, key: e.key, text: e.text, n: 1, who: e.who !== undefined ? new Set([e.who]) : null, many: e.many, mine: !!e.mine, age: 0, ttl: e.mine ? o.ttl : o.aiTtl };
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
  return { key: 'fire:' + rid(owner) + ':' + rid(target), text: me(owner) ? 'You fired at ' + target.name : owner.name + ' fired at you', mine: true };
}

/**
 * race:overtake -> feed entry or null (a pass between two rivals is not news). The player's passes share ONE line that counts the distinct rivals
 * ("You passed Ace Hardcastle", then "You passed 2 rivals" ... "You passed 4 rivals"), so the opening seconds of a race, when the pack sorts itself out,
 * take one line of the feed and not four pinned ones (R2-V-11). A rival passing the player keeps a line per rival.
 */
export function passEntry({ racer, passed }, me) {
  const nm = (r) => r?.name ?? 'a rival';
  if (me(racer)) return { key: 'pass:you', text: 'You passed ' + nm(passed), mine: true, who: passed ? rid(passed) : 'a rival', many: (n) => 'You passed ' + n + ' rivals' };
  if (me(passed)) return { key: 'passedby:' + (racer ? rid(racer) : '?'), text: nm(racer) + ' passed you', mine: true };
  return null;
}
