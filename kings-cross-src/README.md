# kings-cross-src

Source for the King's Cross 3D page and its loopback-only relay. Vite builds the page into
`../kings-cross/`; run commands below from the repository root. Use Node 26.

```sh
npm --prefix kings-cross-src ci
npm --prefix kings-cross-src run dev
# Open http://127.0.0.1:5173/
npm --prefix kings-cross-src run build -- --outDir ../../.scratch/kx-dist --emptyOutDir
```

The dev server proxies `/relay/*` to `http://127.0.0.1:8787/*`; set `KX_RELAY_TARGET` to
change the Vite proxy target. A static host needs an equivalent local proxy for live and
replay data. Without a relay, the page uses its offline sample trains.
Use `?trains=live`, `?trains=replay&date=20261107&speed=8`, `?trains=demo` (labelled
samples) or `?trains=none`; the default probes once before choosing live or samples.
`&signals=0` hides signals and `&board=0` hides the board. Missing timetable or undecoded
signal bytes remain explicitly unknown.

## Relay

Run the relay on macOS. It listens on `127.0.0.1` and serves GET requests only to loopback
hosts. It sends no CORS headers. For live feed or missing/stale downloads, it reads the
Network Rail login from the macOS Keychain; credentials are not stored in this source or
returned by relay routes.

```sh
npm --prefix kings-cross-src run relay
KX_NO_FEED=1 npm --prefix kings-cross-src run relay  # no STOMP connection or schedule download
```

| Route | Behaviour |
|---|---|
| `GET /health` | Feed state, counters, recent-event age, schedule status and TRUST counts. |
| `GET /snapshot` | Current berth occupancy and available S-class bytes. |
| `GET /recent?n=200` | Up to `n` recent normalised TD events as `{t, e}`. |
| `GET /events` | SSE: initial `snapshot`, then `snapshot`, `td`, and `trust` events; named `ping` every 5 seconds. |
| `GET /anchors` | Private anchor map from `KX_ANCHORS` or `KX_DATA_DIR/anchors.json`; 404 if absent. |
| `GET /recording?date=YYYYMMDD` | Recording from `KX_DATA_DIR/recordings/td-<area>-YYYYMMDD.ndjson`; `date` must be exactly eight digits. |
| `GET /sclass` | Private signal hypothesis table from `KX_SCLASS` or `KX_DATA_DIR/sclass.json`; 404 if absent. |
| `GET /schedule?date=YYYY-MM-DD` | Cached King's Cross calls enriched with TRUST actuals. `date` must be one valid calendar date in this format; defaults to today's London date. |
| `GET /static/smart?td=Y9` | SMART rows for a TD area. |
| `GET /static/corpus?stanox=54311` | CORPUS rows for a STANOX. |

SMART and CORPUS source files are cached for seven days. Recordings, schedules, SMART/CORPUS
caches, anchor maps and S-class tables stay outside git in `KX_DATA_DIR` (default
`~/kx-data`). Network Rail data licensing and redistribution terms remain unresolved.
Recording lines are `{t, e}`: TD changes, TRUST movements, and full berth/S-class
snapshots at startup, reconnect and every ten minutes. Old event-only recordings remain
readable, but cannot recover cancellations lost during a feed gap.
The city builder's raw OSM extract defaults to `~/kx-data/osm/kx-city-osm.json` and is not
committed. The page credits © OpenStreetMap contributors under the
[ODbL](https://www.openstreetmap.org/copyright); preserve that attribution when using the
data.

### Settings

All relay settings are optional. Defaults shown are from the relay modules.

| Variable | Default / effect |
|---|---|
| `KX_RELAY_PORT` | `8787`, loopback listen port. |
| `KX_AREA` | `Y9`, TD area. |
| `KX_STOMP_HOST` / `KX_STOMP_PORT` | `publicdatafeeds.networkrail.co.uk` / `61618`. |
| `KX_STOMP_TLS` | `1` enables TLS; otherwise plain TCP. |
| `KX_TD_TOPIC` / `KX_TRUST_TOPIC` | `/topic/TD_ALL_SIG_AREA` / `/topic/TRAIN_MVT_ALL_TOC`. |
| `KX_NO_FEED` | `1` disables STOMP and background schedule downloads. |
| `KX_NO_SCHEDULE` | `1` disables background schedule downloads. |
| `KX_DATA_DIR` | `~/kx-data`, cache, recordings and default private map files. |
| `KX_ANCHORS` / `KX_SCLASS` | Override the private anchor-map or S-class-table file. |
| `KX_KEYCHAIN_SERVICE` | `kx-ntrod`, macOS Keychain item name. |
| `KX_RELAY_TARGET` | Vite dev proxy target; defaults to `http://127.0.0.1:8787`. |

Override the STOMP host, port and topics if the account's feed settings differ.

## Local tools

Keep evidence and derived reports in `.scratch/`; `KX_DATA_DIR` is for private relay data.
Paths in these examples are relative to the repository root.

| Tool | Example |
|---|---|
| `evidence.mjs` | `node kings-cross-src/tools/evidence.mjs --gpu --dist .scratch/kx-dist --out .scratch/kx-evidence [--relay http://127.0.0.1:8787]` |
| `perf.mjs` | `node kings-cross-src/tools/perf.mjs --dist kings-cross --out .scratch/kx-perf --seconds 30 [--relay http://127.0.0.1:8787]` |
| `replay-report.ts` | `node kings-cross-src/tools/replay-report.ts --recording <recording.ndjson> --anchors <anchors.json> --out .scratch/kx-replay-report [--graph <graph.json>]` |
| `motion-check.ts` | `node kings-cross-src/tools/motion-check.ts --recording <recording.ndjson> --anchors <anchors.json> --out .scratch/kx-motion` |
| `live-vs-replay.ts` | `node kings-cross-src/tools/live-vs-replay.ts --out .scratch/kx-live-vs-replay --seconds 60 [--relay http://127.0.0.1:8787]` |
| `sclass.ts` | `node kings-cross-src/tools/sclass.ts --recording <recording.ndjson> --anchors <anchors.json> --out .scratch/kx-sclass [--data-dir <KX_DATA_DIR>]` |
| `berths.ts` | `node kings-cross-src/tools/berths.ts --recording <recording.ndjson> --smart <smart.json.gz> --out .scratch/kx-berths` |
| `build-city.ts` | `node kings-cross-src/tools/build-city.ts --raw ~/kx-data/osm/kx-city-osm.json --out kings-cross-src/web/src/data/kx-city.json` |

`--recording` may be repeated for `sclass.ts` and `berths.ts`. The `berths.ts` output may
also be placed in `KX_DATA_DIR`; `sclass.ts` writes reports beneath `.scratch/` and can
copy its runtime table to the optional `--data-dir` outside the repository. `replay-report.ts`
and `live-vs-replay.ts` keep output beneath `.scratch/`. `build-city.ts` reuses the raw extract when present and
otherwise queries Overpass; only the compact city JSON is committed.

The evidence tool serves the built page and an optional same-origin relay proxy. It requests
Metal with `--gpu` and rejects a software/unknown renderer. Defaults are recording
`20261107`, speed `8`, and the starter's proceed window at UK time `16:23:55`; override
with `--date`, `--speed`, `--signal-at`. Pass `--raw-osm <extract.json>` for the raw-OSM
fidelity comparison (default `.scratch/kx-osm.json`). No Chrome is needed for `--help`.

The private pack contains `index.md`, `manifest.json` (`evidence.json` is a compatibility
copy), `axis-01.json` through `axis-09.json`, PNGs in `axis-NN/`, resolved `cameras.json`,
geometry/train-dimension/performance JSON, command logs in `checks/`, and, with a relay,
private `inputs/`, `replay-report/` and `motion-report/`. Each shot records its actual
camera, URL, simulation clock, renderer, draw calls and triangles. Gaps are reported,
including unavailable signal states, missing timetable, and checks the scorer must run
independently. Proxy faults do not stop the running relay. A missing 387 sample is reported;
to permit a labelled inspection fixture, the lead can add
`Object.assign(kx, { evidenceBuildTrain: buildTrain });` immediately after `kx` is created
in `web/src/main.ts`. The existing `__kx` camera handle needs no URL-camera hook.

## Checks

Run a focused test by naming only the relevant test files. The package test covers relay,
core and web tests; typecheck covers the TypeScript source. Use the mutation script for the
same area after changing a rule; it runs its tests against isolated scratch copies.

```sh
timeout 120 node --test kings-cross-src/relay/tests/relay.test.mjs kings-cross-src/relay/tests/schedule.test.mjs </dev/null
timeout 60 node --test --test-timeout=10000 kings-cross-src/tools/tests/evidence.test.mjs </dev/null
timeout 300 npm --prefix kings-cross-src test </dev/null
timeout 120 npm --prefix kings-cross-src run typecheck </dev/null
timeout 300 python3 -I -u kings-cross-src/tools/mutation/relay.py kings-cross-src/relay .scratch/kx-relay-mutation </dev/null
timeout 300 python3 -I -u kings-cross-src/tools/mutation/schedule.py kings-cross-src .scratch/kx-schedule-mutation </dev/null
```

Mutation scripts and their required inputs are listed in
[`tools/mutation/README.md`](tools/mutation/README.md).
