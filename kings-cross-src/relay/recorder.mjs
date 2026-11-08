// Appends normalised events to one NDJSON file per UTC day: `<dir>/td-<AREA>-YYYYMMDD.ndjson`.
// Each line is {"t": <local append-entry time ms>, "e": <event>}, before disk flush.
// Appending runs synchronously in the feed callback; t is not raw TCP-receive telemetry.
// Snapshots bound gaps and start each
// file with a complete picture. Tests use invented events, never recording-derived fixtures.
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { TdState } from './state.mjs';

const day = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

export async function createRecorder({ dir, area, now = Date.now, onSnapshot = () => {}, schedule = setInterval, unschedule = clearInterval }) {
  await mkdir(dir, { recursive: true });
  let stream = null;
  let streamDay = '';
  let closed = false, closing;
  const state = new TdState(area);
  const write = (event, t = now()) => {
    const d = day(t);
    if (d !== streamDay) {
      stream?.end();
      stream = createWriteStream(path.join(dir, `td-${area}-${d}.ndjson`), { flags: 'a', mode: 0o600 });
      streamDay = d;
      if (event.kind !== 'snapshot') write({ kind: 'snapshot', ...state.snapshot() }, t);
    }
    const row = { t, e: event };
    stream.write(`${JSON.stringify(row)}\n`);
    if (event.kind === 'snapshot') onSnapshot(row);
  };
  const checkpoint = () => { if (!closed) write({ kind: 'snapshot', ...state.snapshot() }); };
  checkpoint();
  const timer = schedule(checkpoint, 10 * 60_000);
  timer?.unref?.();
  return {
    checkpoint,
    append(event) {
      if (closed || event.area !== area) return;
      write(event);
      if (event.kind !== 'trust') state.apply(event);
    },
    close() {
      if (closing) return closing;
      closed = true;
      unschedule(timer);
      return closing = new Promise((resolve) => {
        if (!stream) return resolve();
        stream.end(resolve);
      });
    },
  };
}
