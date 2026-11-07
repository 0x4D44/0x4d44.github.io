// SMART and CORPUS reference files. Cached on disk as the same gzip the portal serves
// (`<dataDir>/smart.json.gz`), so a file already downloaded by hand is reused without any
// network call. A stale or missing file is fetched with HTTP basic auth, built inside this
// process from the keychain login.
import { mkdir, rename, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const BASE = 'https://publicdatafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate';
const KINDS = { smart: 'SMART', corpus: 'CORPUS' };
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const isGzip = (buf) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

export function createStaticStore({ dataDir, readCredentials, fetchImpl = fetch, now = Date.now, maxAgeMs = MAX_AGE_MS }) {
  const memo = new Map();

  async function loadGzip(kind) {
    const file = path.join(dataDir, `${kind}.json.gz`);
    try {
      const st = await stat(file);
      if (now() - st.mtimeMs < maxAgeMs) return await readFile(file);
    } catch {
      // missing: fall through to a fetch
    }
    const { account, secret } = await readCredentials();
    const auth = Buffer.from(`${account}:${secret}`).toString('base64');
    const res = await fetchImpl(`${BASE}?type=${KINDS[kind]}`, { headers: { authorization: `Basic ${auth}` }, redirect: 'follow' });
    if (!res.ok) throw new Error(`static: ${KINDS[kind]} download failed (HTTP ${res.status})`);
    let buf = Buffer.from(await res.arrayBuffer());
    if (!isGzip(buf)) {
      // the server (or fetch) already decoded it: re-check it is JSON before caching
      JSON.parse(buf.toString('utf8'));
      buf = gzipSync(buf);
    }
    await mkdir(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, buf, { mode: 0o600 });
    await rename(tmp, file);
    return buf;
  }

  async function get(kind) {
    if (!(kind in KINDS)) throw new Error(`static: unknown file "${kind}"`);
    if (!memo.has(kind)) {
      memo.set(
        kind,
        loadGzip(kind)
          .then((gz) => JSON.parse(gunzipSync(gz).toString('utf8')))
          .catch((err) => {
            memo.delete(kind);
            throw err;
          }),
      );
    }
    return memo.get(kind);
  }

  return {
    get,
    async smartRows({ td }) {
      const rows = (await get('smart')).BERTHDATA ?? [];
      return rows.filter((r) => r.TD === td);
    },
    async corpusRows({ stanox }) {
      const doc = await get('corpus');
      const rows = doc[Object.keys(doc)[0]] ?? [];
      return rows.filter((r) => String(r.STANOX).trim() === String(stanox));
    },
  };
}
