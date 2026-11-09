// Current picture of one TD area: which description sits in which berth, plus the latest
// signalling bytes if the area sends S-class. Pure, no I/O, so it is easy to test and to
// drive from a recording.
import { validTdEvent } from './td.mjs';

const MAX_BERTHS = 65536;

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
    if (!validTdEvent(e) || e.area !== this.#area) return false;
    let sclassWidth = 0;
    let sclassFirst = 0;
    if (e.kind === 'sclass') {
      const msgType = e.msgType ?? 'SF'; // Older normalized recordings omit SF.
      sclassWidth = msgType === 'SF' ? 1 : msgType === 'SG' || msgType === 'SH' ? 4 : 0;
      if (!sclassWidth || e.data.length !== sclassWidth * 2) return false;
      sclassFirst = Number.parseInt(e.address, 16);
      if (sclassFirst + sclassWidth - 1 > 0xffff) return false;
    }
    // Keep existing entries usable at capacity; malformed/flood input cannot grow memory forever.
    if (['step', 'interpose'].includes(e.kind) && !this.#berths.has(e.to) &&
        this.#berths.size >= MAX_BERTHS && !(e.kind === 'step' && this.#berths.has(e.from))) return false;
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
        // SF carries one byte; SG/SH refresh four bytes from the first wire address upward.
        // One canonical key per 16-bit address also joins differently padded/cased aliases.
        for (let offset = 0; offset < sclassWidth; offset += 1) {
          const address = (sclassFirst + offset).toString(16).toUpperCase().padStart(2, '0');
          const data = e.data.slice(offset * 2, offset * 2 + 2).toUpperCase();
          this.#sclass.set(address, data);
        }
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
