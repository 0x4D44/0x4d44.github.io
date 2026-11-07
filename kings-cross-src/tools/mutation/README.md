# Mutation runs

Each script copies the source into a scratch directory, breaks one thing on purpose, runs
the tests with stdin closed and a timeout, and reports whether a test failed ("KILLED") or
not ("SURVIVED"). A survivor means a test is too weak, or the change was harmless.

Run from the repository root (a scratch directory of your choosing, empty or absent):

```
python3 -I -u kings-cross-src/tools/mutation/relay.py   kings-cross-src/relay <scratch>
python3 -I -u kings-cross-src/tools/mutation/core.py    kings-cross-src       <scratch>
python3 -I -u kings-cross-src/tools/mutation/scene.py   kings-cross-src       <scratch>
python3 -I -u kings-cross-src/tools/mutation/station.py kings-cross-src       <scratch> <raw OSM extract.json>
python3 -I -u kings-cross-src/tools/mutation/train.py   kings-cross-src       <scratch>
```

`station.py` also mutates the committed data and `tools/fidelity.ts`, so it needs the raw
OpenStreetMap extract (not committed; `tools/build-data.ts` saves one).

Known survivor, equivalent and not a gap: `station.py` "pointInPolygon: wrong side of the
edge". Counting crossings to the left of the point instead of to the right gives the same
parity for any closed polygon, so no test can tell them apart.
