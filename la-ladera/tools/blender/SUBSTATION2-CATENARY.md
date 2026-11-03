# Instanced conductor spans

`tools/substation2_catenary.mjs` exports `solveCatenary` and
`catenaryInstances`. Both work with metre coordinates, +Y up, and arbitrary
horizontal direction. The module has no static Node imports; its filesystem
and quiet-priority dependencies are dynamically loaded only when used as a
Node command-line tool. No game module currently imports it.

## Generate transforms from the yard plan

Run from the repository root, using the existing low-priority wrapper:

```sh
node la-ladera/tools/nice.mjs --idle node la-ladera/tools/substation2_catenary.mjs la-ladera/assets/models/substation2/substation2-plan.json /tmp/substation-spans.json
```

The input is either an array of span records or an object with a `spans`
array. A record contains `id`, `start`, `end`, `sag`, and optional `radius`,
`segments` and `maxSegmentLength`. The CLI also accepts `from`/`to` aliases
for endpoint coordinates.

```json
{
  "id": "example-span",
  "start": [0, 12, 0],
  "end": [40, 15, 10],
  "sag": 2.5,
  "radius": 0.015,
  "segments": 24,
  "maxSegmentLength": 1.2
}
```

`sag` is the vertical offset **below the straight chord at the horizontal
midpoint**. With unequal endpoint heights it is not the depth below the
lower endpoint, and the curve's lowest point need not occur halfway across.
`sag: 0` gives a finite straight-span limit.

## Runtime recipe

Load the existing GLB node `substation_conductor_segment` once. Its cylinder
has radius 0.015 m, base `[0,0,0]`, top `[0,1,0]`. Each result instance has:

- `position`: the chord's **start**, not its centre.
- `quaternion`: `[x,y,z,w]`, rotating local +Y onto the chord direction.
- `scale`: `[radius / 0.015, chordLength, radius / 0.015]`.

Compose these fields with `THREE.Matrix4.compose` and write them into a
shared `THREE.InstancedMesh`. The quaternion and scales are compatible with
the game's +Y-up coordinates. Reuse the same geometry/material across
spans and group spatially for culling. A small overlap or rounded end cap
can be added by the later renderer if required; the exported transforms
join exactly, without deliberately changing the endpoint positions.

No long conductor mesh is authored or shipped. The plan stores only
endpoint/sag parameters; generated transform JSON is development output.
Keep it out of the production asset manifest until the separate placement
integration is approved.

## Exact curve and bounded solve

For horizontal span length `L`, endpoint height difference `dY`, parameter
`u = L/(2a)`, and `v = asinh(dY*u/(L*sinh(u)))`, the midpoint sag satisfies:

```text
sag = L/u * hypot(1, dY*u/(L*sinh(u))) * sinh(u/2)^2
```

The implementation brackets positive `u` and uses 90 bisection iterations.
Symmetric hyperbolic identities avoid subtracting nearly equal cosines
when the requested sag is tiny. The resulting curve is the exact `cosh`
catenary, not a parabolic approximation. Sampled chords are then subdivided
until their actual length respects `maxSegmentLength`.

Allocations and numeric domains are explicit: at most 2,048 instances per
span, at most 256 spans per CLI call, horizontal span 0.000001–20,000 m,
endpoint components within ±1,000,000 m, sag between zero and twice the
horizontal length, and segment lengths between 0.05 and 100 m. Vertical
or coincident endpoints are rejected. Exceeding the instance budget fails
with an actionable error instead of allocating an unbounded array.

The physical solver inputs that a power-line design requires—conductor
mass, tension, temperature, creep, wind and ice—are deliberately absent.
This utility produces plausible visual geometry only.

## Tests

```sh
node --test --experimental-test-isolation=none la-ladera/tests/substation2-catenary.test.mjs
node la-ladera/tests/substation2-mutations.mjs
```

The isolation flag above is the spelling in Node 22.16. Tests check equal
and unequal endpoint heights, exact midpoint sag, segment transforms,
actual chord-length bounds, the zero/tiny-sag limit, invalid numeric inputs,
bounded allocation, and execution of the actual module body in a realm
without Node globals. Each test exposes a deliberate input mutation to
the shared mutation runner and must demonstrably fail on that mutation.
