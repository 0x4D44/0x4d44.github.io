# Mutation runs

Each script copies the source into a scratch directory, breaks one thing on purpose, runs
the tests with stdin closed and a timeout, and reports whether a test failed ("KILLED") or
not ("SURVIVED"). A survivor means a test is too weak, or the change was harmless.

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
python3 -I -u kings-cross-src/tools/mutation/berths.py kings-cross-src .scratch/mutation/berths
python3 -I -u kings-cross-src/tools/mutation/board.py kings-cross-src .scratch/mutation/board
python3 -I -u kings-cross-src/tools/mutation/core.py kings-cross-src .scratch/mutation/core
python3 -I -u kings-cross-src/tools/mutation/live.py kings-cross-src .scratch/mutation/live
python3 -I -u kings-cross-src/tools/mutation/motion.py kings-cross-src .scratch/mutation/motion
python3 -I -u kings-cross-src/tools/mutation/perf.py kings-cross-src .scratch/mutation/perf
python3 -I -u kings-cross-src/tools/mutation/relay.py kings-cross-src/relay .scratch/mutation/relay
python3 -I -u kings-cross-src/tools/mutation/replay-report.py kings-cross-src .scratch/mutation/replay-report
python3 -I -u kings-cross-src/tools/mutation/scene.py kings-cross-src .scratch/mutation/scene
python3 -I -u kings-cross-src/tools/mutation/schedule.py kings-cross-src .scratch/mutation/schedule
python3 -I -u kings-cross-src/tools/mutation/sclass-cli.py kings-cross-src .scratch/mutation/sclass-cli
python3 -I -u kings-cross-src/tools/mutation/sclass-job.py kings-cross-src .scratch/mutation/sclass-job
python3 -I -u kings-cross-src/tools/mutation/sclass.py kings-cross-src .scratch/mutation/sclass
python3 -I -u kings-cross-src/tools/mutation/signal-report.py kings-cross-src .scratch/mutation/signal-report
python3 -I -u kings-cross-src/tools/mutation/signals.py kings-cross-src .scratch/mutation/signals
python3 -I -u kings-cross-src/tools/mutation/station.py kings-cross-src .scratch/mutation/station /Users/md/kx-data/osm/kx-osm.json
python3 -I -u kings-cross-src/tools/mutation/test-suite.py
python3 -I -u kings-cross-src/tools/mutation/train-capture.py kings-cross-src .scratch/mutation/train-capture
python3 -I -u kings-cross-src/tools/mutation/train.py kings-cross-src .scratch/mutation/train
python3 -I -u kings-cross-src/tools/mutation/trainweb.py kings-cross-src .scratch/mutation/trainweb
```

`axis01-evidence.py` and the no-argument drivers choose their own private `.scratch`
locations. `trainweb.py` runs every mutation as shown; append one or more mutation-name
substrings to narrow it. `station.py` requires the local raw OpenStreetMap extract at
`/Users/md/kx-data/osm/kx-osm.json`, the raw input used by `tools/build-data.ts`; it is not
committed. `test-suite.py` needs no external inputs.

`replay-report.py` mutates multi-recording argument handling, growing-file tail capture, and
the preserved-anchor input to the replay audit. It runs the named synthetic replay assertions
in isolated package copies.

`station.py` also mutates the committed data and `tools/fidelity.ts`.

Known survivor, equivalent and not a gap: `station.py` "pointInPolygon: wrong side of the
edge". Counting crossings to the left of the point instead of to the right gives the same
parity for any closed polygon, so no test can tell them apart.
