// CLI entry: `npm --prefix kings-cross-src run relay`
//
// Environment (all optional):
//   KX_RELAY_PORT  listen port on 127.0.0.1             (default 8787)
//   KX_AREAS       comma-separated TD allowlist          (default KX_AREA or Y9)
//   KX_AREA        default TD area (legacy single area)                       (default Y9, King's Cross)
//   KX_STOMP_HOST  Network Rail STOMP host               (default publicdatafeeds.networkrail.co.uk)
//   KX_STOMP_PORT  Network Rail STOMP port               (default 61618)
//   KX_STOMP_TLS   "1" to use TLS                        (default plain TCP)
//   KX_TD_TOPIC    TD topic                              (default /topic/TD_ALL_SIG_AREA)
//   KX_TRUST_TOPIC TRUST train movements                  (default /topic/TRAIN_MVT_ALL_TOC)
//   KX_NO_SCHEDULE "1" to disable background SCHEDULE download
//   KX_NO_SCLASS_RELEARN "1" to disable the daily private sclass relearn
//   KX_DATA_DIR    SMART/CORPUS cache and recordings     (default ~/kx-data)
//   KX_ANCHORS     Y9 anchor map JSON                      (default <KX_DATA_DIR>/anchors.json)
//   KX_SCLASS      Y9 signal map JSON                      (default <KX_DATA_DIR>/sclass.json)
//   KX_KEYCHAIN_SERVICE  keychain item name              (default kx-ntrod)
//   KX_NO_FEED     "1" to serve static data only, no STOMP connection
//
// STOMP host, port and topic are the documented defaults but have not been confirmed
// against the portal's connection-details page: override them if the feed refuses.
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { DEFAULT_SERVICE, readCredentials } from './keychain.mjs';
import { startRelay } from './relay.mjs';
import { createAreaSclassJobs } from './sclass-areas.mjs';
import { configuredAreas } from './areas.mjs';

const env = process.env;
const host = env.KX_STOMP_HOST ?? 'publicdatafeeds.networkrail.co.uk';
const stompPort = Number(env.KX_STOMP_PORT ?? 61618);
const useTls = env.KX_STOMP_TLS === '1';
const service = env.KX_KEYCHAIN_SERVICE ?? DEFAULT_SERVICE;
const area = env.KX_AREA ?? 'Y9';
const areas = configuredAreas(env.KX_AREAS, area);
const dataDir = env.KX_DATA_DIR ?? path.join(os.homedir(), 'kx-data');

const log = (line) => console.error(`${new Date().toISOString()} ${line}`);

const relay = await startRelay({
  area,
  areas,
  topic: env.KX_TD_TOPIC ?? '/topic/TD_ALL_SIG_AREA',
  trustTopic: env.KX_TRUST_TOPIC ?? '/topic/TRAIN_MVT_ALL_TOC',
  port: Number(env.KX_RELAY_PORT ?? 8787),
  dataDir,
  feedEnabled: env.KX_NO_FEED !== '1',
  scheduleEnabled: env.KX_NO_SCHEDULE !== '1' && env.KX_NO_FEED !== '1',
  readCredentials: () => readCredentials({ service }),
  connectSocket: () => (useTls ? tls.connect({ host, port: stompPort, servername: host }) : net.connect({ host, port: stompPort })),
  log,
});

const sclassJob = env.KX_NO_SCLASS_RELEARN === '1' ? null : createAreaSclassJobs({
  dataDir,
  areas,
  anchorsPath: env.KX_ANCHORS,
  tablePath: env.KX_SCLASS,
  log,
});
sclassJob?.start();

log(`relay: listening on http://127.0.0.1:${relay.port}  (area ${areas.join(',')}, feed ${env.KX_NO_FEED === '1' ? 'off' : `${host}:${stompPort}`})`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await sclassJob?.stop();
    await relay.close();
    process.exit(0);
  });
}
