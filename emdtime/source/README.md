# Decet — base-10 time on a tuned Earth

A design study and interactive app for a new timekeeping system whose **first priority is
base-10 mathematical efficiency**, while keeping divisions that map onto how people actually
time things (minute/hour/day analogs).

The trick the brief allows: **retune Earth's rotation and orbit** (within hard physical limits)
so the numbers fall out clean in base-10.

## The idea in 30 seconds

- **The second never changes** — it stays the SI/Cesium second (optical-lattice clocks keep the
  same length, only more precise).
- **The day becomes exactly 10,000 s** (one *myriad*). Time-of-day is then a 4-digit decimal
  counter `0000–9999` whose every prefix *is* the fraction of the day — `.5000` is midday.
  (This needs Earth spun up to a ~2.78-hour day; the brief in fact *requires* spinning up,
  because today's equator is too slow to meet its own >1 km/s floor.)
- **The year is tuned to exactly 4000 days = 4 seasons** (orbit at ≈1.171 AU, in the habitable
  zone). Because it's a whole number of days, **there are no leap years, ever**.
- Everything nests in powers of ten: `year = 4 seasons × 10 months × 10 weeks × 10 days`, and
  `day = 10 decidays × 10 centidays × 10 millidays × 10 seconds`.

Two models ship:

| Model | Day | Year | Equatorial gravity | Clock |
|---|---|---|---|---|
| **Standard** (default) | 10,000 s (~2.78 h) | 4000 days | 74% (26% lighter) | pure `.SSSS` second-counter |
| **Terra** (gentle spin) | 40,000 s (~11.1 h) | 1000 days | 98% (near-normal) | `.####`, 4-second grain |

The **why** — including the honest planetary costs — is in
[`wrk_docs/2026.07.10 - HLD - Decet base-10 time system.md`](wrk_docs/2026.07.10%20-%20HLD%20-%20Decet%20base-10%20time%20system.md).

## The app

Five views (React + Vite):

- **Clock** — a live decimal clock: the big `.SSSS` readout, a circular decimal dial, the full
  timestamp, calendar address, and the same instant in conventional time.
- **Convert** — any conventional instant ↔ Decet, both directions, plus a duration converter
  with everyday presets (egg, pomodoro, workday).
- **Calendar** — the nested 4000-day year with a live "you are here".
- **Planet** — the interactive core: slide rotation and orbit, watch the constraint gauges
  (rotation speed, equatorial gravity, habitable zone, days-per-revolution, base-10 cleanliness).
- **Design** — the rationale, unit ladder, everyday-timing guide, and honest consequences.

## Run it

```sh
npm install
npm run dev        # dev server
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
npm test           # 63 unit + render tests
npm run typecheck  # strict tsc, no emit
```

## Layout

```
src/core/          pure logic, no UI deps, fully tested
  constants.ts     physical constants (SI)
  physics.ts       Kepler / rotation / habitable zone + evaluateModel()
  system.ts        SystemConfig + DECET_STANDARD / DECET_TERRA presets
  reckon.ts        instant <-> calendar/clock decomposition + formatting
  convert.ts       conventional interop + duration helpers
src/ui/            React views + components
tools/solver.py    the constraint solver used to pin down the physics
wrk_docs/          the HLD design record
```

## Status

A design study. Correctness of the time math and physics is covered by 63 tests; the
planetary re-engineering is taken as licensed by the brief ("adjust as necessary"), with the
geophysical consequences documented rather than hidden.
