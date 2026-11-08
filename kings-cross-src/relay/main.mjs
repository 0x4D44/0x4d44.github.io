// CLI entry: `npm --prefix kings-cross-src run relay`
//
// Environment (all optional):
//   KX_RELAY_PORT  listen port on 127.0.0.1             (default 8787)
//   KX_AREA        TD area to keep                       (default Y9, King's Cross)
//   KX_STOMP_HOST  Network Rail STOMP host               (default publicdatafeeds.networkrail.co.uk)
//   KX_STOMP_PORT  Network Rail STOMP port               (default 61618)
//   KX_STOMP_TLS   "1" to use TLS                        (default plain TCP)
//   KX_TD_TOPIC    TD topic                              (default /topic/TD_ALL_SIG_AREA)
//   KX_DATA_DIR    SMART/CORPUS cache and recordings     (default ~/kx-data)
//   KX_ANCHORS     anchor map JSON                      (default <KX_DATA_DIR>/anchors.json)
//   KX_SCLASS      signal map JSON                      (default <KX_DATA_DIR>/sclass.json)
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

const env = process.env;
const host = env.KX_STOMP_HOST ?? 'publicdatafeeds.networkrail.co.uk';
const stompPort = Number(env.KX_STOMP_PORT ?? 61618);
const useTls = env.KX_STOMP_TLS === '1';
const service = env.KX_KEYCHAIN_SERVICE ?? DEFAULT_SERVICE;

const log = (line) => console.error(`${new Date().toISOString()} ${line}`);

const relay = await startRelay({
  area: env.KX_AREA ?? 'Y9',
  topic: env.KX_TD_TOPIC ?? '/topic/TD_ALL_SIG_AREA',
  port: Number(env.KX_RELAY_PORT ?? 8787),
  dataDir: env.KX_DATA_DIR ?? path.join(os.homedir(), 'kx-data'),
  feedEnabled: env.KX_NO_FEED !== '1',
  readCredentials: () => readCredentials({ service }),
  connectSocket: () => (useTls ? tls.connect({ host, port: stompPort, servername: host }) : net.connect({ host, port: stompPort })),
  log,
});

log(`relay: listening on http://127.0.0.1:${relay.port}  (area ${env.KX_AREA ?? 'Y9'}, feed ${env.KX_NO_FEED === '1' ? 'off' : `${host}:${stompPort}`})`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await relay.close();
    process.exit(0);
  });
}
