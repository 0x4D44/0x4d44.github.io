// SMART and CORPUS reference files. Cached on disk as the same gzip the portal serves
// (`<dataDir>/smart.json.gz`), so a file already downloaded by hand is reused without any
// network call. A stale or missing file is fetched with HTTP basic auth, built inside this
// process from the keychain login.
import { mkdir, rename, open, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const BASE = 'https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate';
const KINDS = { smart: 'SMART', corpus: 'CORPUS' };
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_DECODED_BYTES = 128 * 1024 * 1024;

const isGzip = (buf) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

function decodeReference(gz) {
  const doc = JSON.parse(gunzipSync(gz, { maxOutputLength: MAX_DECODED_BYTES }).toString('utf8'));
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('static: invalid reference data');
  return doc;
}

async function readResponse(response) {
  const chunks = []; let size = 0;
  if (!response.body) throw new Error('static: empty response');
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_COMPRESSED_BYTES) throw new Error('static: size limit exceeded');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createStaticStore({ dataDir, readCredentials, fetchImpl = fetch, now = Date.now, maxAgeMs = MAX_AGE_MS }) {
  const memo = new Map();

  async function loadGzip(kind) {
    const file = path.join(dataDir, `${kind}.json.gz`);
    let cached;
    try {
      const base = await realpath(dataDir), actual = await realpath(file), relative = path.relative(base, actual);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('static: cache outside data directory');
      cached = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const st = await cached.stat();
      if (!st.isFile()) throw new Error('static: invalid cache');
      if (st.size > MAX_COMPRESSED_BYTES) throw new Error('static: size limit exceeded');
      if (now() - st.mtimeMs < maxAgeMs) return await cached.readFile();
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('static: cache unavailable');
    } finally { await cached?.close(); }
    const { account, secret } = await readCredentials();
    const auth = Buffer.from(`${account}:${secret}`).toString('base64');
    const res = await fetchImpl(`${BASE}?type=${KINDS[kind]}`, { headers: { authorization: `Basic ${auth}` }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`static: ${KINDS[kind]} download failed (HTTP ${res.status})`);
    let buf = await readResponse(res);
    if (!isGzip(buf)) {
      // the server (or fetch) already decoded it: re-check it is JSON before caching
      JSON.parse(buf.toString('utf8'));
      buf = gzipSync(buf);
    }
    decodeReference(buf); // An invalid download must not poison the reusable cache.
    await mkdir(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, buf, { mode: 0o600 });
    await rename(tmp, file);
    return buf;
  }

  async function get(kind) {
    if (!Object.hasOwn(KINDS, kind)) throw new Error('static: unknown file');
    if (!memo.has(kind)) {
      memo.set(
        kind,
        loadGzip(kind)
          .then((gz) => {
            if (gz.length > MAX_COMPRESSED_BYTES) throw new Error('static: size limit exceeded');
            return decodeReference(gz);
          })
          .catch((err) => {
            memo.delete(kind);
            // JSON/fetch/fs exceptions can contain upstream excerpts or private paths.
            if (/^static: (SMART|CORPUS) download failed \(HTTP \d{3}\)$/.test(err.message)) throw err;
            throw new Error('static: reference data unavailable');
          }),
      );
    }
    return memo.get(kind);
  }

  return {
    get,
    async smartRows({ td }) {
      const rows = (await get('smart')).BERTHDATA ?? [];
      if (!Array.isArray(rows)) throw new Error('static: invalid reference data');
      return rows.filter((r) => r && typeof r === 'object' && r.TD === td);
    },
    async corpusRows({ stanox }) {
      const doc = await get('corpus');
      const rows = doc[Object.keys(doc)[0]] ?? [];
      if (!Array.isArray(rows)) throw new Error('static: invalid reference data');
      return rows.filter((r) => r && typeof r === 'object' && String(r.STANOX).trim() === String(stanox));
    },
  };
}
