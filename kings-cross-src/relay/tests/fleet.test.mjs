import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { localFile, startRelay } from '../relay.mjs';

// GET /fleet?area=EB serves {booked: <area data dir>/fleet.json, ptac: <area data dir>/ptac.json} under the same
// guards as /anchors. Invented table text only.
const scratch = process.env.KX_TEST_SCRATCH_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.scratch/replay-round5');
const newTmp = async (prefix) => { await mkdir(scratch, { recursive: true }); return mkdtemp(path.join(scratch, prefix)); };
const TABLE = JSON.stringify({ source: 'synthetic', builtAt: '2026-11-10T00:00:00.000Z', workings: [] });
const url = (p) => new URL(p, 'http://127.0.0.1:8787');

function get(port, urlPath, { method = 'GET', host, origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...(host ? { host } : {}), ...(origin ? { origin } : {}) };
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function relayFixture(t) {
  const dataDir = await newTmp('kx-fleet-route-');
  const relay = await startRelay({ area: 'Y9', areas: ['Y9', 'EB', 'WH'], topic: 'synthetic', dataDir, feedEnabled: false,
    readCredentials: async () => { throw new Error('this route must not read a login'); } });
  t.after(async () => { try { await relay.close(); } finally { await rm(dataDir, { recursive: true, force: true }); } });
  await mkdir(path.join(dataDir, 'areas', 'EB'), { recursive: true });
  await mkdir(path.join(dataDir, 'areas', 'WH'), { recursive: true });
  return { relay, dataDir, ebFile: path.join(dataDir, 'areas', 'EB', 'fleet.json') };
}

test('fleet: a missing table is a JSON 404, a present one is served from the area directory only', async (t) => {
  const { relay, dataDir, ebFile } = await relayFixture(t);
  const missing = await get(relay.port, '/fleet?area=EB');
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.text), { error: 'not found' });
  await writeFile(ebFile, TABLE);
  const hit = await get(relay.port, '/fleet?area=EB');
  assert.equal(hit.status, 200);
  assert.deepEqual(JSON.parse(hit.text), { booked: JSON.parse(TABLE), ptac: null });
  assert.match(hit.headers['content-type'], /^application\/json/);
  assert.equal(hit.headers['cache-control'], 'no-store');
  assert.equal(hit.headers['access-control-allow-origin'], undefined, 'no CORS headers');
  // Each area has its own table: EB's is not WH's or Y9's, and Y9 reads <dataDir>/fleet.json like its other private files.
  assert.equal((await get(relay.port, '/fleet?area=WH')).status, 404);
  assert.equal((await get(relay.port, '/fleet')).status, 404, 'the default area is Y9, which has no table');
  await writeFile(path.join(dataDir, 'fleet.json'), JSON.stringify({ source: 'y9' }));
  assert.equal(JSON.parse((await get(relay.port, '/fleet')).text).booked.source, 'y9');
  assert.equal(JSON.parse((await get(relay.port, '/fleet?area=EB')).text).booked.source, 'synthetic');
});

test('fleet: only the area query key is accepted, and the area must be a configured one', async (t) => {
  const { relay, ebFile } = await relayFixture(t);
  await writeFile(ebFile, TABLE);
  for (const extra of ['path=../../credentials', 'file=/etc/passwd', 'date=20260101', 'station=KGX', 'x=']) {
    assert.equal((await get(relay.port, `/fleet?area=EB&${extra}`)).status, 400, `/fleet?area=EB&${extra}`);
    assert.equal((await get(relay.port, `/fleet?${extra}&area=EB`)).status, 400, `/fleet?${extra}&area=EB`);
  }
  for (const selector of ['area=ZZ', 'area=..%2FWH', 'area=EB&area=WH', 'area=', 'area=eb', 'area=EBX', 'area=%2e%2e']) {
    assert.equal((await get(relay.port, `/fleet?${selector}`)).status, 400, `/fleet?${selector}`);
  }
  assert.equal((await get(relay.port, '/fleet?area=EB')).status, 200);
});

test('fleet: a non-loopback Host, any method but GET and a cross-origin page are refused', async (t) => {
  const { relay, ebFile } = await relayFixture(t);
  await writeFile(ebFile, TABLE);
  for (const host of ['evil.example', `evil.example:${relay.port}`, `127.0.0.1.evil.example:${relay.port}`, `localhost:${relay.port}0`, '127.0.0.1:1']) {
    assert.equal((await get(relay.port, '/fleet?area=EB', { host })).status, 403, `Host ${host}`);
  }
  assert.equal((await get(relay.port, '/fleet?area=EB', { host: `localhost:${relay.port}` })).status, 200);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await get(relay.port, '/fleet?area=EB', { method })).status, 405, method);
  for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'http://user@localhost', 'null']) {
    assert.equal((await get(relay.port, '/fleet?area=EB', { origin })).status, 403, `Origin ${origin}`);
  }
  assert.equal((await get(relay.port, '/fleet?area=EB', { origin: 'http://localhost:5173' })).status, 200, 'the local dev page may read it');
});

test('fleet: a symlinked or non-file table is not served, inside the data directory or out of it', async (t) => {
  const { relay, dataDir, ebFile } = await relayFixture(t);
  const outside = await newTmp('kx-fleet-outside-');
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'secret.json'), 'SYNTHETIC-OUTSIDE-CONTENT');
  await symlink(path.join(outside, 'secret.json'), ebFile);
  const viaLink = await get(relay.port, '/fleet?area=EB');
  assert.equal(viaLink.status, 404);
  assert.ok(!viaLink.text.includes('SYNTHETIC-OUTSIDE'));
  await rm(ebFile);
  await writeFile(path.join(dataDir, 'real.json'), TABLE);
  await symlink(path.join(dataDir, 'real.json'), ebFile); // a link that stays inside the directory is still a link
  assert.equal((await get(relay.port, '/fleet?area=EB')).status, 404);
  await rm(ebFile);
  await mkdir(ebFile); // a directory called fleet.json
  assert.equal((await get(relay.port, '/fleet?area=EB')).status, 404);
  await rm(ebFile, { recursive: true });
  // The area directory itself being a link out of the data directory serves nothing either.
  await rm(path.join(dataDir, 'areas', 'EB'), { recursive: true });
  await writeFile(path.join(outside, 'fleet.json'), 'SYNTHETIC-OUTSIDE-CONTENT');
  await symlink(outside, path.join(dataDir, 'areas', 'EB'));
  const viaDirectory = await get(relay.port, '/fleet?area=EB');
  assert.equal(viaDirectory.status, 404);
  assert.ok(!viaDirectory.text.includes('SYNTHETIC-OUTSIDE'));
});

test('fleet: localFile uses the cache directory, refuses extra keys and oversized files, and never a client path', async (t) => {
  const dataDir = await newTmp('kx-fleet-local-');
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const cacheDir = path.join(dataDir, 'areas', 'EB');
  await mkdir(cacheDir, { recursive: true });
  const opts = { dataDir, area: 'EB', cacheDir };
  assert.equal((await localFile(url('/fleet?area=EB'), opts)).status, 404);
  await writeFile(path.join(cacheDir, 'fleet.json'), TABLE);
  const hit = await localFile(url('/fleet?area=EB'), opts);
  assert.equal(hit.status, 200);
  assert.equal(hit.body, TABLE);
  assert.match(hit.type, /^application\/json/);
  // The KX_ANCHORS-style override does not exist for the fleet: a different file in the options is ignored.
  await writeFile(path.join(dataDir, 'other.json'), '{"source":"other"}');
  assert.equal((await localFile(url('/fleet'), { ...opts, anchorsFile: path.join(dataDir, 'other.json') })).body, TABLE);
  for (const query of ['?path=../../credentials', '?area=EB&path=x', '?date=20260101', '?file=other.json']) {
    const refused = await localFile(url(`/fleet${query}`), opts);
    assert.equal(refused.status, 400, query);
    assert.ok(!refused.body.includes('source'));
  }
  await truncate(path.join(cacheDir, 'fleet.json'), 16 * 1024 * 1024 + 1);
  const large = await localFile(url('/fleet?area=EB'), opts);
  assert.equal(large.status, 413);
  assert.deepEqual(JSON.parse(large.body), { error: 'file too large' });
  assert.equal(await localFile(url('/fleets'), opts), null);
});

const STORE = JSON.stringify({ format: 'kx-ptac/1', area: 'EB', tiplocs: ['EDINBUR'], updatedAt: '2001-02-03T00:00:00.000Z', trains: {} });

test('fleet: the PTAC store is the second section of the same route, each section independent of the other', async (t) => {
  const { relay, ebFile } = await relayFixture(t);
  const ptacFile = path.join(path.dirname(ebFile), 'ptac.json');
  await writeFile(ptacFile, STORE);
  assert.deepEqual(JSON.parse((await get(relay.port, '/fleet?area=EB')).text), { booked: null, ptac: JSON.parse(STORE) }, 'PTAC alone');
  await writeFile(ebFile, TABLE);
  assert.deepEqual(JSON.parse((await get(relay.port, '/fleet?area=EB')).text), { booked: JSON.parse(TABLE), ptac: JSON.parse(STORE) }, 'both');
  await writeFile(ptacFile, '{"truncated":');
  assert.deepEqual(JSON.parse((await get(relay.port, '/fleet?area=EB')).text), { booked: JSON.parse(TABLE), ptac: null }, 'an unreadable section is null');
  await truncate(ebFile, 16 * 1024 * 1024 + 1);
  const big = await get(relay.port, '/fleet?area=EB');
  assert.equal(big.status, 200);
  assert.deepEqual(JSON.parse(big.text), { booked: null, ptac: null }, 'an oversized section is null, not streamed');
  assert.equal((await get(relay.port, '/fleet?area=EB&path=ptac.json')).status, 400);
});

test('fleet: a symlinked PTAC store is not served', async (t) => {
  const { relay, ebFile } = await relayFixture(t);
  const outside = await newTmp('kx-fleet-ptac-outside-');
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'ptac.json'), JSON.stringify({ format: 'kx-ptac/1', trains: {}, marker: 'SYNTHETIC-OUTSIDE' }));
  await symlink(path.join(outside, 'ptac.json'), path.join(path.dirname(ebFile), 'ptac.json'));
  const viaLink = await get(relay.port, '/fleet?area=EB');
  assert.equal(viaLink.status, 404);
  assert.ok(!viaLink.text.includes('SYNTHETIC-OUTSIDE'));
  await writeFile(ebFile, TABLE);
  const mixed = await get(relay.port, '/fleet?area=EB');
  assert.deepEqual(JSON.parse(mixed.text), { booked: JSON.parse(TABLE), ptac: null });
  // The area directory itself being a link out of the data directory serves no PTAC store either.
  await rm(path.dirname(ebFile), { recursive: true });
  await rm(path.join(outside, 'ptac.json'));
  await writeFile(path.join(outside, 'ptac.json'), JSON.stringify({ format: 'kx-ptac/1', trains: {}, marker: 'SYNTHETIC-OUTSIDE' }));
  await symlink(outside, path.dirname(ebFile));
  const viaDirectory = await get(relay.port, '/fleet?area=EB');
  assert.equal(viaDirectory.status, 404);
  assert.ok(!viaDirectory.text.includes('SYNTHETIC-OUTSIDE'));
});

test('fleet: localFile reads only the two fleet file names', async (t) => {
  const dataDir = await newTmp('kx-fleet-names-');
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const opts = { dataDir, area: 'EB', cacheDir: dataDir };
  await writeFile(path.join(dataDir, 'ptac.json'), STORE);
  assert.equal((await localFile(url('/fleet?area=EB'), { ...opts, fleetFile: 'ptac.json' })).body, STORE);
  for (const fleetFile of ['../ptac.json', 'anchors.json', 'ptac.json/..']) await assert.rejects(localFile(url('/fleet?area=EB'), { ...opts, fleetFile }), /invalid fleet file/);
});
