# kings-cross-src

Source for the live 3D King's Cross model. Vite builds the page into `../kings-cross/`.
The source entry point lives in `web/`, so the repository's responsive test does not
treat this package as a published document.

Use Node 26, install with `npm --prefix kings-cross-src ci`, then run
`npm --prefix kings-cross-src run dev` from the repository root. Open
`http://127.0.0.1:5173/`. Build with `npm --prefix kings-cross-src run build`.
The Vite dev server proxies `/relay/*` to `http://127.0.0.1:8787/*`; the relay remains
loopback-only. A static production host needs an equivalent local proxy for live/replay
data. Without a local relay, the page displays its offline sample trains.

| Page mode | Behaviour |
|---|---|
| No `trains` parameter | Shows samples immediately; switches to live if a local relay answers |
| `?trains=demo` | Offline sample trains at the buffers |
| `?trains=none` | Hides trains |
| `?trains=live` | Live relay events, with reconnect/backoff when the relay drops |
| `?trains=replay&date=20261107&speed=1` | Replays the local recording for that date; speed must be positive |
| `?signals=0` | Hides the signal overlay; signals are shown by default |

Combine options with `&`. Signals use the committed OSM overlay and the same event
timeline as trains. A local hypothesis table supplies decoded aspects; missing bytes or
an absent/undecoded table display an unlit grey head with a `?`, rather than a coloured
aspect. The status line reports signals drawn and decoded. The overlay builder's private
report records review notes and any track-side assumptions; topology-to-berth matches
stay in a private sidecar.

Rebuild the overlay from the repository root with
`node kings-cross-src/tools/build-signals.ts --out .scratch/signals-review`.
Optional `--raw <OSM-extract.json>`
supplies OSM track-side tags omitted from the compact model; `--anchors <private-map.json>`
adds private topology review. It never changes the public JSON using those anchors.
To use reviewed topology bindings, copy the sidecar's `signalMappings` array into the
top level of the local `sclass.json`; OSM YA-reference bindings work without that array.

## The relay (`relay/`)

A local process that holds the Network Rail Open Data connection so nothing else needs the
login. It listens on `127.0.0.1` only.

One-time setup, in your own terminal (the password is prompted for, never shown):

```
security add-generic-password -s kx-ntrod -a 'you@example.com' -w
```

Run it:

```
npm --prefix kings-cross-src run relay          # live feed + static data
KX_NO_FEED=1 npm --prefix kings-cross-src run relay   # static data only, no login needed if the files are cached
```

| Endpoint | Returns |
|---|---|
| `GET /health` | feed state, counters, age of the last event |
| `GET /snapshot` | berth -> train description for TD area `Y9`, plus S-class bytes if any |
| `GET /recent?n=200` | the last n normalised events `{t, e}` |
| `GET /events` | Server-Sent Events: a `snapshot`, `td` changes, and a named `ping` every 5 s |
| `GET /anchors` | Private `anchors.json` from `KX_DATA_DIR`; JSON 404 when absent |
| `GET /recording?date=YYYYMMDD` | Local `recordings/td-Y9-YYYYMMDD.ndjson`; 404 when absent |
| `GET /sclass` | Private hypothesis table `sclass.json` from `KX_DATA_DIR`; JSON 404 when absent |
| `GET /static/smart?td=Y9` | SMART rows for a TD area |
| `GET /static/corpus?stanox=54311` | CORPUS rows for a STANOX |

Recordings go to `~/kx-data/recordings/td-Y9-YYYYMMDD.ndjson` (one `{t, e}` per line, the
replay format). SMART and CORPUS are cached as `~/kx-data/smart.json.gz` and
`corpus.json.gz` and refreshed after 7 days. Anchor maps, hypothesis tables, recording
content, and topology sidecars are private and are not committed or bundled with the page.
After generating a new local hypothesis table, reload the page to load it.

Security properties, each covered by a test: the login is read from the keychain inside the
relay process and never appears in a response, log line or recording; only `GET` is
answered; a `Host` header that is not loopback is refused; no CORS headers are sent.

Settings (environment): `KX_RELAY_PORT` (8787), `KX_AREA` (Y9), `KX_STOMP_HOST`,
`KX_STOMP_PORT`, `KX_STOMP_TLS`, `KX_TD_TOPIC`, `KX_DATA_DIR`, `KX_KEYCHAIN_SERVICE`,
`KX_NO_FEED`. `KX_ANCHORS` and `KX_SCLASS` can override the private anchor/table paths.
The STOMP host, port and topic defaults are unconfirmed against the portal's
connection-details page, so override them if the feed refuses the connection.

## Tests

```
npm --prefix kings-cross-src test        # or: npm run test:kings-cross  (from the repo root)
```

Tests use Node's test runner; rendering tests also use the package's Three.js dependency.
The STOMP client is tested against a fake broker on loopback. Typecheck with
`npm --prefix kings-cross-src run typecheck`.
