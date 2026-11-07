// Appends normalised events to one NDJSON file per UTC day: `<dir>/td-<AREA>-YYYYMMDD.ndjson`.
// Each line is {"t": <receive time ms>, "e": <event>}. This is the replay format and the
// source of test fixtures.
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const day = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

export async function createRecorder({ dir, area, now = Date.now }) {
  await mkdir(dir, { recursive: true });
  let stream = null;
  let streamDay = '';

  return {
    append(event) {
      const t = now();
      const d = day(t);
      if (d !== streamDay) {
        stream?.end();
        stream = createWriteStream(path.join(dir, `td-${area}-${d}.ndjson`), { flags: 'a', mode: 0o600 });
        streamDay = d;
      }
      stream.write(`${JSON.stringify({ t, e: event })}\n`);
    },
    close() {
      return new Promise((resolve) => {
        if (!stream) return resolve();
        stream.end(resolve);
      });
    },
  };
}
