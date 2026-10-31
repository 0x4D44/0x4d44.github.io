// Kids in class (R3-011). School is a hidden block: every pupil and both teachers are `away` inside the school from 7:00 to 13:00, so a visitor found empty classrooms and an empty
// patio. While the PLAYER is inside the school during class, the pupils are drawn: seated at the desks of the classrooms of the floor the player is on (the interiors' 'work' anchors
// tagged 'school'), a full class of up to nine, and a teacher at each class on the room's wooden chair, facing it. When the player leaves, or the block ends, they are hidden again,
// where the brain's normal emerge flow takes over (the door, the walk home). Nothing is drawn while nobody is looking, so the barrio's cost does not change.
// PURE (no THREE, no DOM): `PeopleSim.step` calls `update()`; the world draws whoever is not `away`.
import { blockAt } from './schedule.js';

const EVERY = 0.25;                  // seconds between two looks at who is where
const MIN_DESKS = 6;                 // a room with fewer desks is an office, not a class
const CLASS_ACT = 'class';           // the act of somebody in class: the dialogue has its own opening line for it (act_class), the world draws them seated

export class Classroom {
  constructor(world) { this.w = world; this.seated = new Set(); this.floorY = null; this.next = 0; this._rooms = null; }

  /** The classrooms of the school, by room id: [{ room, y, desks: [spot], chair: spot | null }]. A pupitre is a 'work' anchor tagged 'school'; the teacher's chair is the room's 'chair_wood'. */
  rooms() {
    if (this._rooms) return this._rooms;
    const W = this.w, id = W.lots?.school, by = new Map();
    if (id) {
      for (const s of W.spots.inside(id, 'work')) if (s.tagSet.has('school') && s.room) { if (!by.has(s.room)) by.set(s.room, { room: s.room, y: s.y, desks: [], chair: null }); by.get(s.room).desks.push(s); }
      for (const r of by.values()) r.chair = W.spots.inside(id, 'sit').find((s) => s.room === r.room && s.tagSet.has('chair_wood')) ?? null;
    }
    return (this._rooms = [...by.values()].filter((r) => r.desks.length >= MIN_DESKS).sort((a, b) => (a.room < b.room ? -1 : 1)));
  }

  /** Is `n` somebody the school hides right now (away for school, with the block still on)? */
  hidden(n) { return n.away && n.awayWhy === 'school' && !n.emerging && blockAt(n, this.w.hour) === 'school'; }

  update() {
    const W = this.w; if (W.t < this.next) return; this.next = W.t + EVERY;
    const school = W.lots?.school, rooms = school ? this.rooms() : []; if (!rooms.length) return;
    const P = W.player, inside = W.lotAt(P.x, P.z) === school;
    for (const n of [...this.seated]) if (n.mode !== 'talk' && (!inside || blockAt(n, W.hour) !== 'school')) this.dismiss(n);       // never in the middle of a conversation
    if (!inside) return;
    // the floor the player is on: the classrooms there get their class, and stay while the player is on that floor (no pop-ins as they walk along a corridor)
    let fy = rooms[0].y; for (const r of rooms) if (Math.abs(r.y - P.y) < Math.abs(fy - P.y)) fy = r.y;
    if (this.floorY != null && Math.abs(this.floorY - fy) > 0.5 && ![...this.seated].some((n) => n.mode === 'talk')) { for (const n of [...this.seated]) this.dismiss(n); }
    if (this.seated.size) return;
    this.floorY = fy;
    const pupils = W.npcs.filter((n) => (n.routine === 'kid' || n.routine === 'teen') && this.hidden(n)), teachers = W.npcs.filter((n) => n.routine === 'teacher' && this.hidden(n));
    const here = rooms.filter((r) => Math.abs(r.y - fy) < 0.5), K = Math.max(1, Math.min(here.length, teachers.length || 2));
    let left = pupils.length, k = 0;
    here.slice(0, K).forEach((r, i) => {
      const take = Math.min(r.desks.length, Math.ceil(left / (K - i)));
      for (let d = 0; d < take; d++) this.seat(pupils[k++], r.desks[d], r.desks[d].ry);
      left -= take;
      const t = teachers[i]; if (t && r.chair && take) this.seat(t, r.chair, r.chair.ry + Math.PI);
    });
  }

  /** Reveal `n` on `spot` (a desk or a chair), seated, facing `ry`, until the class is dismissed. */
  seat(n, spot, ry) {
    const W = this.w; if (!n) return;
    W.revealAt(n, spot.x, spot.z, spot.y, ry);
    n.sitH = spot.seatH ?? 0.43; n.ry = n.targetRy = ry; n.talkVariant = n.jit?.[2] < 0.3 ? 1 : 0;
    n.stand(W, CLASS_ACT, 1e9, ry);
    W.spots.claim(spot, n); n.spot = spot; n.inClass = true; this.seated.add(n);
  }

  dismiss(n) {
    this.seated.delete(n); n.inClass = false;
    this.w.brain.hideAway(n, this.w.lots.school, 'school');
    if (!this.seated.size) this.floorY = null;
  }
}
