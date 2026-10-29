// Wall records per storey, derived from the room layout: exterior walls (always) + interior partitions wherever two
// cells (rooms or stair voids) are separated by a wall-thickness gap. Doors and windows attach to them as openings.
//   Wall = { id, floor, dir:'x'|'z', at, a0, a1, t, ext, side?, party?, open?, openings:[{kind,u0,u1,y0,y1,ref}] }
//   dir 'x' : the wall runs along x at z=at (a0..a1 are x);  dir 'z' : runs along z at x=at (a0..a1 are z).
import { sharedWall, mergeIntervals } from './geom.js';

const EXT_SIDES = ['front', 'back', 'left', 'right'];

export function deriveWalls(S) {
  const { W, D, te } = S, walls = [];
  for (let k = 0; k < S.F; k++) {
    const fd = S.floorsData[k], list = [];
    let n = 0;
    const id = () => `${S.lot.id}.f${k}.w${n++}`;
    const ext = (side, dir, at, a0, a1) => ({ id: id(), floor: k, dir, at, a0, a1, t: te, ext: true, side, party: !!S.party[side], open: !!fd.open, openings: [] });
    list.push(ext('front', 'x', D / 2 - te / 2, -W / 2, W / 2), ext('back', 'x', -D / 2 + te / 2, -W / 2, W / 2),
      ext('left', 'z', -W / 2 + te / 2, -D / 2, D / 2), ext('right', 'z', W / 2 - te / 2, -D / 2, D / 2));
    const cells = [...fd.rooms.map((rid) => ({ rect: S.roomById(rid).rect, ref: rid })), ...fd.voids.map((v) => ({ rect: v.rect, ref: v.owner }))];
    const segs = new Map();
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const sw = sharedWall(cells[i].rect, cells[j].rect, 0.35);
        if (!sw) continue;
        const key = `${sw.dir}:${sw.at.toFixed(3)}:${sw.t.toFixed(3)}`;
        let e = segs.get(key); if (!e) segs.set(key, e = { dir: sw.dir, at: sw.at, t: sw.t, iv: [] });
        e.iv.push([sw.a0, sw.a1]);
      }
    }
    for (const e of segs.values()) {
      for (const [a0, a1] of mergeIntervals(e.iv, e.t + 0.02)) {
        list.push({ id: id(), floor: k, dir: e.dir, at: e.at, a0: a0 - 0.1, a1: a1 + 0.1, t: e.t, ext: false, openings: [] });
      }
    }
    // doors
    for (const d of S.doors) {
      if (d.floor !== k) continue;
      const c = d.wall.dir === 'z' ? d.z : d.x;
      const wl = list.find((w) => w.dir === d.wall.dir && Math.abs(w.at - d.wall.at) < 0.02 && c >= w.a0 - 1e-6 && c <= w.a1 + 1e-6 && (d.ext ? w.ext : !w.ext));
      if (!wl) { S.notes.push(`door ${d.id} has no wall`); continue; }
      wl.openings.push({ kind: d.kind === 'arch' ? 'arch' : d.kind === 'shutter' ? 'shutter' : 'door', u0: c - d.w / 2, u1: c + d.w / 2, y0: 0, y1: d.h, ref: d.id });
    }
    // windows
    for (const w of S.windows) {
      if (w.floor !== k) continue;
      const wl = list.find((q) => q.ext && q.side === w.side);
      const c = wl.dir === 'x' ? w.x : w.z;
      wl.openings.push({ kind: 'window', u0: c - w.w / 2, u1: c + w.w / 2, y0: w.y, y1: w.y + w.h, ref: w.id });
    }
    for (const wl of list) wl.openings.sort((p, q) => p.u0 - q.u0);
    fd.walls = list;
    walls.push(...list);
  }
  S.walls = walls;
  return walls;
}

export { EXT_SIDES };
