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
signal bytes remain explicitly unknown. Hover a train (or tap it on a touch screen) for a
card with everything the page knows of it; `&tooltip=0` turns the card off.
Take the camera into any train's car, or within 3 m of one, and that train's cars within
45 m show their interior: seats laid out to the seat maps (Azumas, the 180) or the published
counts (387, 717, 700), tables, racks, poles, lights, partitions, gangways and doors, with
glass you can see through both ways (`web/src/train-interior*.ts`, one module a family,
loaded on first use and disposed when the camera leaves). Toward 45 m the glass thickens to
the car's own panes, so there is no step to the cars beyond, which stay an outer skin.
`&interiors=0` turns interiors off.

## Time of day and weather

The scene shows the real time of day and the live weather at the station. The sun's elevation and azimuth for King's
Cross (51.532 N, 0.1233 W) come from the NOAA/Meeus solar position (`core/solar.ts`, held to JPL Horizons within 0.02
degree by `core/tests/solar.test.ts`) at the scene clock: now when live, the recording's own time in a replay. They drive
the sun, the sky, the ambient light and, below -6 degrees (the end of civil twilight), the station, platform and train lights
(`core/daylight.ts`, `web/src/atmosphere.ts`). The weather is Open-Meteo's (`web/src/weather.ts`): the forecast `current`
block for a live page, polled at most every ten minutes; the archive `hourly` block (one request) for a replay's day. Cloud
greys the light and the sky, rain and snow are two bounded GPU draws near the camera (`web/src/precip.ts`), the ground and
platforms go wet or white, and fog and mist pull the scene fog in. Roofs keep it off: nothing falls and nothing is wet or white
under the train shed, the Western Concourse or a platform canopy. The roofs are not listed a second time; `web/src/cover.ts`
draws a top-down height map from the roof meshes themselves (found by name), and the drops' and the wet ground's shaders read
it, so a roof that changes shape or is added (name it in `ROOF_MESHES`) changes where the weather stops. A drop is under a roof
or not; the ground's wet and snow fade over about a metre at a roof's edge (a blurred copy of the map, read through the GPU's
bilinear filter), so the edge of a canopy is a soft straight line and not a row of half-metre steps. If Open-Meteo cannot be
reached the sky stays clear and the status line says `weather unavailable (...), clear sky assumed`. The page sends nothing
else to anyone, and no key is used.
Weather data: [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0; the page's `connect-src` names only
`https://api.open-meteo.com` and `https://archive-api.open-meteo.com`.

Repeatable pictures (the screenshots in an evidence pack, the tests): pin the clock and the weather in the address, and the
page asks Open-Meteo for nothing.

| Parameter | Effect |
|---|---|
| `&time=2026-11-09T16:25:00Z` | The scene clock: an ISO 8601 instant with a zone, or thirteen-digit epoch milliseconds. |
| `&weather=clear` (or `cloudy`, `overcast`, `drizzle`, `rain`, `heavy-rain`, `thunder`, `mist`, `fog`, `snow`) | A fixed weather, no request. `off` (or `0`) is a clear sky and no request. |
| `&sky=ref` (or `&bare=1`) | The page's old fixed look (a high sun, the dusk-blue sky): no sky maths, no weather, no request. |

The tools that load the page without these (`evidence.mjs`, `axis01-capture.mjs`, `signal-capture.mjs`,
`train-capture.mjs`, `perf.mjs`) now see the real clock and the live weather: add `&sky=ref` for the old look, or
`&time=...&weather=...` for a chosen one, wherever a capture has to repeat.

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
| `GET /fleet?area=EB` | Private fleet evidence as `{booked, ptac}`: the booked-diagram table `KX_DATA_DIR/areas/<area>/fleet.json` (built by `tools/build-eb-fleet.ts`) and the PTAC store `ptac.json` (written by `KX_PTAC=1`), each `null` when absent or unreadable; 404 if both are absent. Other query keys are ignored, as for `/anchors`. The page uses PTAC first, then the diagrams. |
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

The ground (`web/src/data/kx-terrain.json`) is the Environment Agency LIDAR Composite DTM
1m, reduced by `tools/build-terrain.ts` to height grids re-levelled to the model's rail datum
(the WCS tile and the OSTN15 grid it is placed with stay outside git in `~/kx-data/terrain/`).
`node tools/build-terrain.ts --profile` rebuilds it byte for byte and prints the real rail
profile every 25 m; the header of the tool explains the datum and the re-levelling. `?terrain=0`
loads the page on the flat plane instead. The data are published under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
The page credits "Contains Environment Agency information © Environment Agency and/or
database right 2026" beside the OpenStreetMap credit (`web/index.html`, and in the file's own
`attribution` field); preserve that attribution when using the data.

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
| `KX_PTAC` | Off by default. `1` consumes Network Rail PTAC (planned unit allocations, Rail Data Marketplace Kafka, `kafkajs`) into the private `KX_DATA_DIR/areas/EB/ptac.json` (Edinburgh trains, mode 600, yesterday to tomorrow, at most 4000 trains). Login and consumer group come from the Keychain items `kx-rdm-ptac` and `kx-rdm-ptac-group`. `/health` gains a `ptac` counts block. Format and key: `relay/ptac.mjs`. |

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
| `build-eb-fleet.ts` | `node kings-cross-src/tools/build-eb-fleet.ts --text <unit-diagrams.txt> [--year 2026] [--out ~/kx-data/areas/EB/fleet.json]` (private output; refuses a path inside the repository) |

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

Collect the nine-axis scorer pack with `node kings-cross-src/tools/evidence-pack.mjs --gpu` (private `.scratch` output; `--dry-run` previews commands, `--only 04,07` selects axes; keychain scan remains manual).

Run commands below from the repository root. `npm run test:kings-cross` delegates to the
package test: relay (`*.test.mjs`), core and web (`*.test.ts`), and tools
(`tools/tests/*.test.mjs` and `tools/tests/*.test.ts`). Tests use synthetic inputs or
committed OSM geometry, fake credentials and browser transports; socket tests use loopback
only. No real recordings, keychain access, upstream feed or Chrome is required. Sandboxes
that deny loopback cannot run the socket cases. Typecheck covers the TypeScript source.
Use the area's mutation driver after changing a rule; it tests isolated scratch copies.
On a machine shared with GPU timing work, run the suite as `npm --prefix kings-cross-src run
test:shared-host`: it runs at `nice -n 19` with at most two test files at once, so it does
not disturb other jobs' timings.

```sh
timeout 120 node --test kings-cross-src/relay/tests/relay.test.mjs kings-cross-src/relay/tests/schedule.test.mjs </dev/null
timeout 60 node --test --test-timeout=10000 kings-cross-src/tools/tests/evidence.test.mjs </dev/null
timeout 300 npm --prefix kings-cross-src test </dev/null
timeout 300 npm run test:kings-cross </dev/null
timeout 120 npm --prefix kings-cross-src run typecheck </dev/null
timeout 300 python3 -I -u kings-cross-src/tools/mutation/relay.py kings-cross-src/relay .scratch/kx-relay-mutation </dev/null
timeout 300 python3 -I -u kings-cross-src/tools/mutation/schedule.py kings-cross-src .scratch/kx-schedule-mutation </dev/null
```

Mutation scripts and their required inputs are listed in
[`tools/mutation/README.md`](tools/mutation/README.md).
The GPU evidence/performance tools and real-data audits remain separate manual commands
under [Local tools](#local-tools); importing their helpers in tests never launches Chrome.
