# Mutation runs

Each script copies the source into a scratch directory, breaks one thing on purpose, runs
the tests with stdin closed and a timeout, and reports whether a test failed ("KILLED") or
not ("SURVIVED"). A survivor means a test is too weak, or the change was harmless.

A kill counts only when a named test fails. Three rules stop an unusable copy from being
mistaken for a kill (a copy that cannot load what the tests import fails every run, and a
failure to load looks exactly like a failing test):

- The copy carries every directory the tests reach and links the real `node_modules`.
- The unmodified copy runs the exact test command used on the mutants first and must pass. If it
  does not, the driver stops before mutating anything and prints `BASELINE NOT GREEN`.
- A mutant run that cannot load (`ERR_MODULE_NOT_FOUND`, a parse error), whose test file dies,
  that runs no tests or different tests from the baseline, or whose search text is no longer in
  the source is an `ERROR`, never a kill. A hang is a `TIMEOUT`. Errors and timeouts count
  against the total and make the driver exit non-zero. (`live.py` and `relay.py` have always
  reported a hang as "caught with timeout", counted it, and said how many; they still do.)

The drivers that copy the package share `lib/kxmut.py`, which does the copying, runs
`node --test` with TAP output, parses it, takes the baselines and classifies each mutant run.
It lives in `lib/` because the evidence pack treats every `.py` file directly in this directory
as a driver that must be documented here. `tools/tests/mutation-harness.test.mjs` runs it against a
throwaway package: a kill, a survivor, a parse error, a missing dependency, a hang, a stale
anchor and a failing baseline each get the verdict above. Drivers that predate it
(`axis01-*`, `axis03-evidence`, `axis05-evidence`, `axis07-browser`, `berths*`, `board`,
`concourse*`, `hotel-*`, `sclass`, `sclass-cli`, `shed-*`, `signal*`, `station-evidence`, `test-suite`,
`train-capture`, `tunnel-track`, `western-front`) already copy what their tests import, take
their baseline in the copy, and accept only named assertion failures.

## Limits on every test run

A mutant can loop, allocate without bound or print without end. `subprocess.run(timeout=)` kills
only the top `node --test`; its `--test-isolation=process` workers go on as orphans, and a mutant that
loops and allocates never lets `--test-timeout` fire. That once left orphaned workers holding hundreds
of gigabytes between them and ran a Mac out of memory. So every test command a driver starts, the
older drivers' included, goes through `lib/kxmut.py` (`run_command`; the drivers that keep their own
counting call `run_process`, a drop-in for `subprocess.run` that raises `TimeoutExpired`) and gets
these limits whatever the driver does:

- It is a process group and session of its own. When the run ends however it ends (it finishes,
  times out, hits a cap, or the driver is interrupted or sent SIGTERM or SIGHUP), every process left in its
  tree is killed and waited for: a worker, or a daemon that left the group. Only a SIGKILL of the
  driver itself can leave a run behind.
- Every `node` in it gets `NODE_OPTIONS=--max-old-space-size=4096`, so a runaway script heap aborts
  that process. A stricter value in the environment stays; a looser one is lowered to 4096.
- A watchdog polls the tree every 0.25 s (every 0.1 s once it holds a quarter of the cap) and kills it
  past 4 GB. That is the physical footprint on macOS (resident, compressed and swapped pages: a runaway
  process is mostly compressed, and `ps` shows almost none of it) and resident plus swap on Linux. A
  driver runs a handful of test files; a whole test directory at once peaks at 0.9 to 2.6 GB and the
  whole suite at 3.3 GB. A fast allocator (a typed array filled in a loop) overshoots by up to a gigabyte
  between polls, so the cap sits that far below the 6 GB at which the fleet's guard kills a `node --test`
  process: the harness decides first and says why, and does not rely on the guard.
- stdout and stderr go to temporary files, and a run that writes more than 64 MB is killed.

A run cut short for its time is a `TIMEOUT`; one cut short for its memory or output is an `OVERCAP`
(`[OVERCAP ]` in the log, `OVERCAP:` in the error list). Neither is a kill and both count against the
total. The older drivers print them as survivors or invalid runs. `live.py` and `relay.py`, which count
a hang as caught, count an `OVERCAP` the same way. A driver prints one line on stderr when it ends with
the most memory any of its runs held (`kxmut: 24 test runs; the largest tree held 1.1 GB against a cap
of 4.0 GB`), so a cap that is too tight shows up in the log. `KXMUT_MEMORY_CAP_GB`, `KXMUT_HEAP_MB` and
`KXMUT_OUTPUT_CAP_MB` change the defaults. `tools/tests/mutation-harness.test.mjs` runs a script that
allocates without bound, a tree with a daemon in it, endless output and a SIGTERM mid-run against the
harness, and checks by pid that nothing is left.

Run each driver from the repository root. Drivers that accept a scratch path keep their
temporary copies and logs under the private `.scratch/mutation/` directory. Most take the
package directory and that scratch path; the commands below show each driver's actual
arguments. Create a passed scratch directory first if it does not exist, for example
`mkdir -p .scratch/mutation/core`.

```
python3 -I -u kings-cross-src/tools/mutation/axis01-capture.py kings-cross-src .scratch/mutation/axis01-capture
python3 -I -u kings-cross-src/tools/mutation/axis01-evidence.py kings-cross-src
python3 -I -u kings-cross-src/tools/mutation/axis03-evidence.py kings-cross-src .scratch/mutation/axis03-evidence
python3 -I -u kings-cross-src/tools/mutation/axis05-evidence.py kings-cross-src .scratch/mutation/axis05-evidence
python3 -I -u kings-cross-src/tools/mutation/axis07-browser.py kings-cross-src .scratch/mutation/axis07-browser
python3 -I -u kings-cross-src/tools/mutation/axis07-latency.py
python3 -I -u kings-cross-src/tools/mutation/axis07-recording-latency.py
python3 -I -u kings-cross-src/tools/mutation/axis07-relay.py
python3 -I -u kings-cross-src/tools/mutation/axis07.py kings-cross-src .scratch/mutation/axis07
python3 -I -u kings-cross-src/tools/mutation/axis08-evidence.py
python3 -I -u kings-cross-src/tools/mutation/berths-cli.py kings-cross-src .scratch/mutation/berths-cli
python3 -I -u kings-cross-src/tools/mutation/berths-geography.py
python3 -I -u kings-cross-src/tools/mutation/berths.py kings-cross-src .scratch/mutation/berths
python3 -I -u kings-cross-src/tools/mutation/board.py kings-cross-src .scratch/mutation/board
python3 -I -u kings-cross-src/tools/mutation/concourse-hotel.py kings-cross-src .scratch/mutation/concourse-hotel
python3 -I -u kings-cross-src/tools/mutation/concourse-roof.py kings-cross-src .scratch/mutation/concourse-roof
python3 -I -u kings-cross-src/tools/mutation/concourse.py kings-cross-src .scratch/mutation/concourse
python3 -I -u kings-cross-src/tools/mutation/core.py kings-cross-src .scratch/mutation/core
python3 -I -u kings-cross-src/tools/mutation/curves.py kings-cross-src .scratch/mutation/curves
python3 -I -u kings-cross-src/tools/mutation/evidence-helpers.py kings-cross-src .scratch/mutation/evidence-helpers
python3 -I -u kings-cross-src/tools/mutation/evidence-pack.py
python3 -I -u kings-cross-src/tools/mutation/fidelity.py kings-cross-src .scratch/mutation/fidelity
python3 -I -u kings-cross-src/tools/mutation/hotel-exterior.py kings-cross-src .scratch/mutation/hotel-exterior
python3 -I -u kings-cross-src/tools/mutation/hotel-roof.py kings-cross-src .scratch/mutation/hotel-roof
python3 -I -u kings-cross-src/tools/mutation/live.py kings-cross-src .scratch/mutation/live
python3 -I -u kings-cross-src/tools/mutation/motion.py kings-cross-src .scratch/mutation/motion
python3 -I -u kings-cross-src/tools/mutation/ole.py kings-cross-src .scratch/mutation/ole
python3 -I -u kings-cross-src/tools/mutation/perf.py kings-cross-src .scratch/mutation/perf
python3 -I -u kings-cross-src/tools/mutation/relay.py kings-cross-src/relay .scratch/mutation/relay
python3 -I -u kings-cross-src/tools/mutation/replay-report.py kings-cross-src .scratch/mutation/replay-report
python3 -I -u kings-cross-src/tools/mutation/scene.py kings-cross-src .scratch/mutation/scene
python3 -I -u kings-cross-src/tools/mutation/schedule.py kings-cross-src .scratch/mutation/schedule
python3 -I -u kings-cross-src/tools/mutation/sclass-cli.py kings-cross-src .scratch/mutation/sclass-cli
python3 -I -u kings-cross-src/tools/mutation/sclass-job.py kings-cross-src .scratch/mutation/sclass-job
python3 -I -u kings-cross-src/tools/mutation/sclass.py kings-cross-src .scratch/mutation/sclass
python3 -I -u kings-cross-src/tools/mutation/shed-front.py kings-cross-src .scratch/mutation/shed-front
python3 -I -u kings-cross-src/tools/mutation/shed-tower.py kings-cross-src .scratch/mutation/shed-tower
python3 -I -u kings-cross-src/tools/mutation/signal-report.py kings-cross-src .scratch/mutation/signal-report
python3 -I -u kings-cross-src/tools/mutation/signals.py kings-cross-src .scratch/mutation/signals
python3 -I -u kings-cross-src/tools/mutation/station-evidence.py kings-cross-src .scratch/mutation/station-evidence
python3 -I -u kings-cross-src/tools/mutation/station.py kings-cross-src .scratch/mutation/station /Users/md/kx-data/osm/kx-osm.json
python3 -I -u kings-cross-src/tools/mutation/stations.py kings-cross-src .scratch/mutation/stations
python3 -I -u kings-cross-src/tools/mutation/test-suite.py
python3 -I -u kings-cross-src/tools/mutation/train-capture.py kings-cross-src .scratch/mutation/train-capture
python3 -I -u kings-cross-src/tools/mutation/train.py kings-cross-src .scratch/mutation/train
python3 -I -u kings-cross-src/tools/mutation/trainweb.py kings-cross-src .scratch/mutation/trainweb
python3 -I -u kings-cross-src/tools/mutation/tunnel-track.py kings-cross-src .scratch/mutation/tunnel-track
python3 -I -u kings-cross-src/tools/mutation/western-front.py kings-cross-src .scratch/mutation/western-front
```

`axis01-evidence.py` and the no-argument drivers choose their own private `.scratch`
locations. `axis01-evidence.py` also accepts `--out .scratch/<fresh-output>` after the
package argument to retain its assertion logs in a selected scratch directory.
`trainweb.py` runs every mutation as shown; append one or more mutation-name
substrings to narrow it. `station.py` requires the local raw OpenStreetMap extract at
`/Users/md/kx-data/osm/kx-osm.json`, the raw input used by `tools/build-data.ts`; it is not
committed. `test-suite.py` needs no external inputs.

The pack uses the two-argument `western-front.py SOURCE SCRATCH` command above.
Its optional third argument, `PRE_FIX_SOURCE`, is only for reproducing the historical
red-before geometry against the current tests; it is omitted for current-source mutation
runs and is not a pack dependency. The concourse, hotel-exterior, shed-front, shed-tower
and western-front drivers need fresh output paths and run synthetic or public-OSM
geometry/camera assertions in Node; they need no browser, relay listener or private feed.

`replay-report.py` mutates multi-recording argument handling, growing-file tail capture, and
the preserved-anchor input to the replay audit. It runs the named synthetic replay assertions
in isolated package copies.

`evidence-helpers.py` mutates the small modules the evidence and performance tools share, in seven
groups that are each judged by their own tests: `camera-sweep`, `replay-peak`, `frame-stats`,
`scene-pin`, `flicker`, `hud` (with the page sources whose names its overlay selectors rely on) and
`evidence` (the `--hud`, `--views`, scene-pin and scoring-view parts of `tools/evidence.mjs`, judged
by 13 tests of `tools/tests/evidence.test.mjs` chosen by name; the driver stops if one is renamed).
It needs no browser, relay or recording. It exits 0 only when every mutation is caught and every
test it runs was also seen failing by an assertion, and its report names the first mutation that
reddened each test; append group names to run fewer (`... .scratch/mutation/evidence-helpers hud
flicker`). The one mutation that changes nothing, so that no test can catch it, is kept, not run, in the driver's
`EQUIVALENT` list.

`ole.py` mutates the overhead line equipment (`core/ole.ts`, `web/src/ole.ts`): what is wired, the
support lines, stagger, sag and tunnel-mouth taper, the shed's cross-spans, portals and masts, the
wire level of detail and the member boxes. `stations.py` mutates the multi-station code: the TD-area
allowlist and storage layout (`relay/areas.mjs`), the station table (`core/station-config.ts`), the
Waverley decoder, platform screening and anchors (`core/waverley-anchors.ts`) with its offline tool
(`tools/waverley-anchors.ts`), and the station switcher (`web/src/stations.ts`). Where two guards
cover for each other (`motion.py`, `stations.py`), a mutation is given as a list of edits and applies
them together; removing either alone changes nothing a test can see.

`station.py` also mutates the committed data and `tools/fidelity.ts`.

Known survivor, equivalent and not a gap: `station.py` "pointInPolygon: wrong side of the
edge". Counting crossings to the left of the point instead of to the right gives the same
parity for any closed polygon, so no test can tell them apart.
