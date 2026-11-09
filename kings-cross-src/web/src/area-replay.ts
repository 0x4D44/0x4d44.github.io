// One UTC replay policy for all station runtimes; station selection owns no clock.
import { createTimeline } from './feed.ts';
import type { MotionSink, RecordedEvent } from './feed.ts';

export function createAreaReplay(area: string, rows: readonly RecordedEvent[], sink: MotionSink, speed = 1) {
  if (!/^[A-Z0-9]{2}$/.test(area) || !rows.length || !Number.isFinite(speed) || speed <= 0) throw new Error(`nonempty ${area} recording and positive replay speed required`);
  if (rows.some(r => r.e.area !== area)) throw new Error(`${area} recording contains another area`);
  const timeline = createTimeline(sink, rows[0]!.t);
  let cursor = 0, time = rows[0]!.t;
  return {
    timeMs: () => time,
    frame(seconds: number, utcMs?: number): void {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('nonnegative elapsed time required');
      const next = utcMs === undefined ? time + seconds * speed * 1000 : utcMs;
      if (!Number.isFinite(next)) throw new Error('finite UTC clock required');
      if (next < rows[0]!.t) { if (cursor === 0) time = next; return; }
      if (next < timeline.timeMs()) return;
      while (cursor < rows.length && rows[cursor]!.t <= next) {
        const row = rows[cursor++]!; timeline.deliver(row.e, row.t, row.t);
      }
      timeline.advanceTo(next); time = next;
    },
  };
}
