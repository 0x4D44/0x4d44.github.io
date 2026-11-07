// Current picture of one TD area: which description sits in which berth, plus the latest
// signalling bytes if the area sends S-class. Pure, no I/O, so it is easy to test and to
// drive from a recording.

export class TdState {
  #area;
  #berths = new Map(); // berth -> description
  #sclass = new Map(); // address -> data (hex byte string)
  #counts = { step: 0, cancel: 0, interpose: 0, heartbeat: 0, sclass: 0, unknown: 0 };
  #lastEventTime = null;

  constructor(area) {
    this.#area = area;
  }

  get area() {
    return this.#area;
  }

  apply(e) {
    if (e.area !== this.#area) return false;
    this.#counts[e.kind] = (this.#counts[e.kind] ?? 0) + 1;
    switch (e.kind) {
      case 'step':
        if (e.from) this.#berths.delete(e.from);
        if (e.to) this.#berths.set(e.to, e.descr);
        break;
      case 'cancel':
        this.#berths.delete(e.from);
        break;
      case 'interpose':
        this.#berths.set(e.to, e.descr);
        break;
      case 'sclass':
        this.#sclass.set(e.address, e.data);
        break;
      default:
        break;
    }
    if (e.time) this.#lastEventTime = e.time;
    return true;
  }

  snapshot() {
    return {
      area: this.#area,
      lastEventTime: this.#lastEventTime,
      berths: Object.fromEntries([...this.#berths].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      sclass: { addresses: this.#sclass.size, data: Object.fromEntries(this.#sclass) },
      counts: { ...this.#counts },
    };
  }
}
