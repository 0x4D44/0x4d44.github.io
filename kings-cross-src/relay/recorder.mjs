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

// Bound queued writes even when the disk cannot keep up. A failure is sticky for this run.
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;

export async function createRecorder({ dir, area, now = Date.now, onSnapshot = () => {}, schedule = setInterval, unschedule = clearInterval, createStream = createWriteStream }) {
  let stream = null;
  let streamDay = '';
  let closed = false, closing, failure = null;
  const streams = new Set();
  const state = new TdState(area);
  const queuedBytes = () => [...streams].reduce((total, entry) => total + (entry.stream.writableLength ?? 0), 0);
  const fail = (reason) => {
    if (failure) return;
    failure = reason;
    for (const entry of streams) {
      try { entry.stream.destroy(); }
      catch { /* Recording is already failed; transport cleanup cannot recover it. */ }
      finally { entry.settle(); }
    }
  };
  try { await mkdir(dir, { recursive: true }); }
  catch { fail('directory unavailable'); }
  const write = (event, t = now()) => {
    const row = { t, e: event };
    if (!failure) {
      try {
        const d = day(t);
        if (d !== streamDay) {
          stream?.end();
          stream = createStream(path.join(dir, `td-${area}-${d}.ndjson`), { flags: 'a', mode: 0o600 });
          let resolve;
          const entry = { stream, done: new Promise(done => { resolve = done; }), settle: () => { streams.delete(entry); resolve(); } };
          streams.add(entry);
          stream.on('error', () => { fail('write failed'); entry.settle(); });
          stream.once('finish', entry.settle);
          stream.once('close', entry.settle);
          streamDay = d;
          if (event.kind !== 'snapshot') write({ kind: 'snapshot', ...state.snapshot() }, t);
        }
        const text = `${JSON.stringify(row)}\n`;
        if (!failure) {
          if (queuedBytes() + Buffer.byteLength(text) > MAX_QUEUE_BYTES) fail('buffer overflow');
          else stream.write(text);
        }
      } catch { fail('write failed'); }
    }
    // Live clients still need reconciliation snapshots after recording has failed.
    if (event.kind === 'snapshot') onSnapshot(row);
  };
  const checkpoint = () => { if (!closed) write({ kind: 'snapshot', ...state.snapshot() }); };
  checkpoint();
  const timer = schedule(checkpoint, 10 * 60_000);
  timer?.unref?.();
  return {
    checkpoint,
    stats() { return { state: failure ? 'failed' : closed ? 'closed' : 'recording', error: failure, gap: failure !== null, queuedBytes: queuedBytes(), maxQueueBytes: MAX_QUEUE_BYTES }; },
    append(event) {
      if (closed || event.area !== area) return;
      write(event);
      if (event.kind !== 'trust') state.apply(event);
    },
    close() {
      if (closing) return closing;
      closed = true;
      unschedule(timer);
      const pending = [...streams];
      const deadline = pending.length ? setTimeout(() => fail('close timeout'), 5000) : undefined;
      closing = Promise.all(pending.map(entry => entry.done)).then(() => {}).finally(() => clearTimeout(deadline));
      for (const entry of pending) { try { entry.stream.end(); } catch { fail('write failed'); } }
      return closing;
    },
  };
}
