# kings-cross-src

Source for the live 3D King's Cross model. The published page will be built into
`../kings-cross/`; this directory is not served as a document (its Vite `index.html`, when
it arrives, lives in `web/`, so `tests/responsive.test.mjs` does not treat it as one).

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
| `GET /events` | Server-Sent Events: a `snapshot`, then a `td` event per change |
| `GET /static/smart?td=Y9` | SMART rows for a TD area |
| `GET /static/corpus?stanox=54311` | CORPUS rows for a STANOX |

Recordings go to `~/kx-data/recordings/td-Y9-YYYYMMDD.ndjson` (one `{t, e}` per line, the
replay format). SMART and CORPUS are cached as `~/kx-data/smart.json.gz` and
`corpus.json.gz` and refreshed after 7 days. None of this is committed.

Security properties, each covered by a test: the login is read from the keychain inside the
relay process and never appears in a response, log line or recording; only `GET` is
answered; a `Host` header that is not loopback is refused; no CORS headers are sent.

Settings (environment): `KX_RELAY_PORT` (8787), `KX_AREA` (Y9), `KX_STOMP_HOST`,
`KX_STOMP_PORT`, `KX_STOMP_TLS`, `KX_TD_TOPIC`, `KX_DATA_DIR`, `KX_KEYCHAIN_SERVICE`,
`KX_NO_FEED`. The STOMP host, port and topic defaults are unconfirmed against the portal's
connection-details page, so override them if the feed refuses the connection.

## Tests

```
npm --prefix kings-cross-src test        # or: npm run test:kings-cross  (from the repo root)
```

No dependencies. The STOMP client is tested against a fake broker on loopback.
