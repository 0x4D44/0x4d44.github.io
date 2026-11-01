# Vehicle library — verification

Base: `origin/main` at **017eab90a749d317f181872aa620b5facaea06f8**.
Branch: `codex/la-ladera-vehicle-library`. Verification performed 1 November 2026.
The request's SHA was a placeholder; this is the actual fetched base used for the isolated before checkout.

## Delivered and actually loaded

The two checked-in GLBs contain ten designs and ten separate far LOD roots:
two 1990s hatchbacks, pickup, chiva, colectivo, motorbike, cargo tricycle,
handcart, bicycle and rubbish cart. The PNG and complete manifest are present.
The browser loaded both files and all ten types, with no rejected designs,
failed vehicle downloads, page errors, application console errors or network errors.
The reports for the three street views include the complete placement list and load status.

There are **51 placed library vehicles** in the default world: seven hatchbacks,
one chiva, one pickup, one colectivo, one tricycle, one handcart, one rubbish cart,
31 motorbikes and seven bicycles. Five utility vehicles reserve new spaces before
the small cycles are placed. Their reservations can displace smaller procedural
placements; the before/after scenes therefore need not contain identical vehicle counts.

The original procedural vehicle code remains the fallback when files, roots or
materials are unavailable. `?vehicles=0` selects it explicitly. No runtime build
step, Blender, compression decoder or new framework is needed.

See [regeneration and asset contract](../../tools/blender/VEHICLES.md),
[actual manifest](../../assets/models/manifest.vehicles.json),
[independent validator result](verification/validator.txt), and
[catalogue contact sheet](catalogue.jpg). The contact sheet shows both near
orientations and the far model for every design using the runtime materials.

## Payload and render policy

| Runtime asset | Bytes |
| --- | ---: |
| `vehicles/vehicles_road.glb` | 1,134,056 |
| `vehicles/vehicles_street.glb` | 930,260 |
| `textures/vehicles/paint.png` | 412,617 |
| `manifest.vehicles.json` | 24,539 |
| **Complete library** | **2,501,472** |
| **Headroom under 3,000,000 bytes** | **498,528** |

The GLBs have no embedded textures. Every mesh material name resolves through
the existing material library. One original 1024 × 1024 paint atlas carries
colour variants, rust, mud, worn coats and chiva decoration. Only the primary
coat changes per instance; trim and mismatched panels retain their authored tiles.
Separate named wheel pivots remain in the source GLBs at both levels.

Near models use 1,780–5,500 triangles; far models use 264–600. Small carts are
deliberately below the approximate 6,000-triangle target. Static wheel/body parts
merge by material and instance by design/LOD. Near detail switches at 19 m,
far detail ends at 115 m, with 2 m hysteresis measured from the bounding sphere's
surface. One level draws at a time. Vehicles receive shadows but do not cast
an additional shadow pass. This is an intentional visual/performance tradeoff.

Using the repository payload script's shipped-file definition (excluding
`vendor`, `dev`, `labs`, `tests`, `tools`), the actual base is **38,001,594 bytes**
and this branch is **40,523,198 bytes**, below the requested **60,000,000**.
The prompt's 21.6 MB starting figure does not describe this fetched base.
See [exact payload comparison](verification/payload-comparison.json) and the
[passing repository payload check](verification/after-payload.json).
Evidence images and authoring tools are development files, not runtime payload.

## Three matched street views

Both revisions use the same [camera poses](poses.json), 1280 × 720, high quality,
manual simulation and hour 17.2. Each image is an actual headless canvas capture.
All six images were inspected. Near silhouettes, wear, wheel alignment and
street placement were checked; the catalogue separately checks all ten designs.

| Street | Before triangles | After triangles | Net change | Draw calls before → after | Library triangles after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Calle del Sol | 1,923,762 | 1,829,932 | −93,830 | 818 → 835 | 46,076 |
| Calle del Comercio | 1,506,967 | 1,438,895 | −68,072 | 626 → 630 | 31,776 |
| Calle de los Almendros | 1,921,700 | 1,806,978 | −114,722 | 869 → 872 | 25,318 |

All three pass the **2,500,000-triangle / 1,800-draw-call** task limits.
“Library triangles” is measured by hiding only the vehicle library and
rendering the same frame again. It is a gross contribution, not the net change:
the replacement also removes the former procedural vehicle geometry, and the new
occupancy reservations can change nearby prop placements.
Totals are renderer counts for the actual full-world view, including its passes.
The library's distance statistics also include instances outside the camera view,
so those statistics are not substituted for measured renderer counts.

| Street | Before | After |
| --- | --- | --- |
| Calle del Sol — chiva and motorbike | [before](before/calle-del-sol.jpg) | [after](after/calle-del-sol.jpg) |
| Calle del Comercio — handcart | [before](before/calle-del-comercio.jpg) | [after](after/calle-del-comercio.jpg) |
| Calle de los Almendros — motorbike and bicycle | [before](before/calle-de-los-almendros.jpg) | [after](after/calle-de-los-almendros.jpg) |

Raw reports: [before](before/views.json), [after](after/views.json),
[comparison](verification/street-comparison.json).

## World tests and asset checks

- `vehicles_validate.mjs --complete`: pass; checks actual binary contents,
  declared bounds, triangles, pivots, hashes, atlas UVs and complete payload.
- Asset tests: **16 passed, zero failed**. [Log](verification/asset-tests.log).
- Runtime vehicle tests: **8 passed, zero failed**, including actual-file loading,
  missing or invalid assets, tag collision, fallback, LOD transitions, paint,
  pitched helmet anchors, all ten default-world types and placement clearances.
  [Log](verification/runtime-tests.log).
- Before world suite: **199 tests, 198 passed, one failed**. The existing canopy
  browser test's clean-console assertion receives SwiftShader `ReadPixels`
  warnings; zero page or network errors. [Log](verification/before-world-tests.log).
- After Node world checks: **17 files passed, zero failed**, including all
  `world-*.test.mjs` except the browser-only canopy file, plus `people-props`.
  This run's Node reporter counted files, so it is not presented as 17 assertions.
  [Log](verification/after-world-node-tests.log) and
  [exact command](verification/after-world-node-tests-command.txt).

- After existing canopy browser test: **3 tests, two passed, one failed**. Its
  material and geometry assertions pass. Its clean-console assertion matches the
  baseline failure exactly: three SwiftShader warnings, zero errors and zero
  network errors. This assertion was not weakened or suppressed.
  [Log](verification/after-canopy-tests.log).

The gallery and three-street capture harnesses also complete successfully. They
record known software `ReadPixels` warnings separately and require zero other
application warnings, page errors, build errors and failed network requests.
All browser and Blender sessions were headless; no visible windows were opened.

## Metrics and timing limits

Before and after run the existing `tests/metrics.mjs` with explicit task gates:
12 ms uncapped render cost, 2,500,000 triangles, 1,800 draw calls and 25 s boot.
This matters because current main's default gates are more permissive.
Chrome for Testing 131.0.6778.204 uses **ANGLE / Vulkan / SwiftShader**, a software
renderer in this environment. A 12 ms hardware frame-rate claim cannot be made
from this machine.

The initial baseline timed run completed one spawn sample at **3,453.72 ms**.
The remaining timed views were intentionally stopped because each software
sample took minutes. The separately completed baseline run covers all 16 geometry
views and the navigation soak; it uses `--views 0` and makes no timing claim.
Its boot takes **42 s** and its render/readback work reports four `GPU stall due to
ReadPixels` warnings, so that run exits 1 despite passing every geometry gate.
Both the partial timing log and completed metrics report are preserved.

### Completed after timing run

The after run completes one timed spawn, all 16 geometry views and the soak.
Its strict command exits 1 for **43.4 s boot**, **2,867.12 ms uncapped render
cost**, and four baseline-equivalent `ReadPixels` warnings. All geometry gates
pass and the soak is clean. The directly comparable timed spawn samples are:

| Timed spawn at 960 × 540 | Before | After |
| --- | ---: | ---: |
| Triangles | 2,232,627 | 2,124,851 |
| Draw calls | 1,094 | 1,112 |
| Uncapped render cost | 3,453.72 ms | 2,867.12 ms |
| Boot | 44.5 s | 43.4 s |

These are software measurements, not a claim of 12 ms GPU performance. The
16.7 ms rAF values in manual mode describe browser cadence rather than sustained
world rendering. The uncapped `gl.finish` sample is the scene-work measurement.

Evidence: [completed timed report](verification/after-metrics-timed.json),
[log](verification/after-metrics-timed.log),
[after spawn capture](after/metrics-spawn.jpg),
[partial baseline sample summary](verification/before-metrics-attempt-summary.json),
and [baseline timing log](verification/before-metrics-attempt.log).

### Matched 16-view comparison

A separate after `--views 0` run matches the completed baseline's camera and
simulation sequence exactly. This avoids the extra 40 simulation steps introduced
by the timed spawn in `--views 1`. All 16 camera positions match. Every view is
below both task geometry limits and uses fewer triangles than its baseline.
The maximum after count is **2,124,851 triangles / 1,112 calls**, leaving
**375,149 triangles / 688 calls** below the limits.

| Metrics view | Before triangles | After triangles | Net change | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| spawn | 2,232,627 | 2,124,851 | −107,776 | 1,094 → 1,112 |
| ridge-looking-south | 1,663,235 | 1,562,723 | −100,512 | 827 → 833 |
| valley-looking-north | 1,914,758 | 1,807,394 | −107,364 | 902 → 927 |
| street-n0 | 1,914,758 | 1,807,394 | −107,364 | 902 → 927 |
| street-n74 | 1,933,915 | 1,826,459 | −107,456 | 953 → 957 |
| street-n148 | 1,699,253 | 1,640,639 | −58,614 | 832 → 861 |
| street-n222 | 1,928,666 | 1,833,026 | −95,640 | 820 → 823 |
| street-n296 | 1,768,814 | 1,691,014 | −77,800 | 815 → 836 |
| street-n370 | 1,576,880 | 1,514,678 | −62,202 | 732 → 752 |
| street-n444 | 974,851 | 896,013 | −78,838 | 395 → 378 |
| street-n518 | 1,888,821 | 1,805,201 | −83,620 | 986 → 1,016 |
| street-n592 | 2,175,669 | 2,058,973 | −116,696 | 1,049 → 1,063 |
| plaza-P1 | 1,966,489 | 1,871,333 | −95,156 | 871 → 881 |
| plaza-P2 | 2,138,233 | 2,029,977 | −108,256 | 1,046 → 1,049 |
| plaza-P4 | 1,792,901 | 1,698,891 | −94,010 | 945 → 958 |
| landmark-mirador | 714,927 | 672,119 | −42,808 | 307 → 297 |

Both matched navigation soaks cover **22.5 simulated seconds, 22 legs and 15
renders**, with zero stuck events, unreachable targets, NaNs, falls, console
errors, console warnings or network errors during the soak. The after matched
run exits 1 for **44.2 s boot** and **four initial `ReadPixels` warnings**.
Its `--views 0` setting makes no additional frame-time claim. Neither strict
metrics command is reported as an overall pass.

Full matched evidence: [before report](verification/before-metrics.json),
[before log](verification/before-metrics.log),
[after report](verification/after-metrics.json),
[after log](verification/after-metrics.log), and
[exact comparison](verification/metrics-comparison.json).


## Reproduce

Run from the repository root. `CHROME_PATH` must point to a supported local
Chrome executable. The existing wrapper launches headless and lowers priority;
no visible window is needed. Use one browser run at a time.

```sh
node la-ladera/tools/blender/vehicles_validate.mjs --complete
node la-ladera/tests/vehicles-assets.test.mjs
node --import ./la-ladera/tests/register.mjs la-ladera/tests/world-vehicles.test.mjs
node --import ./la-ladera/tests/register.mjs --test --test-concurrency=1 la-ladera/tests/world-*.test.mjs
node la-ladera/tests/payload.mjs

CHROME_PATH=/path/to/chrome node la-ladera/tools/nice.mjs node la-ladera/tests/vehicles-gallery.mjs --out .scratch/vehicles/catalogue.jpg
CHROME_PATH=/path/to/chrome node la-ladera/tools/nice.mjs node la-ladera/tests/vehicles-shots.mjs --poses la-ladera/dev/vehicles/poses.json --out .scratch/vehicles/after-shots
CHROME_PATH=/path/to/chrome node la-ladera/tools/nice.mjs node la-ladera/tests/vehicles-shots.mjs --root /path/to/baseline-checkout --poses la-ladera/dev/vehicles/poses.json --out .scratch/vehicles/before-shots --allow-fallback

CHROME_PATH=/path/to/chrome node la-ladera/tests/metrics.mjs --w 960 --h 540 --views 1 --geometry-views 16 --soak 3 --query manual --cost-gate 12 --max-calls 1800 --max-tris 2500000 --max-boot 25 --progress --capture page --eval-timeout-ms 600000 --json .scratch/vehicles/metrics.json
```

For the completed baseline geometry/soak comparison, use the same metrics command
from the base checkout with `--views 0`. The original timed attempt and its
explicitly partial summary are in `verification/before-metrics-attempt.*`.
For frame-time acceptance, repeat the strict command on the target GPU; the
software result here does not establish compliance with 12 ms.

## Provenance

The geometry and atlas are original procedural CC0-1.0 work, with no real badges
or manufacturer artwork. No external vehicle mesh or texture is shipped.
Appearance references are CC0 material assets: ambientCG
[Painted Metal 001](https://ambientcg.com/view?id=PaintedMetal001) and
[Rubber 002](https://ambientcg.com/view?id=Rubber002), and Poly Haven
[Green Metal Rust](https://polyhaven.com/a/green_metal_rust) and
[Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal).
The sites' [ambientCG licence](https://docs.ambientcg.com/license/) and
[Poly Haven asset licence](https://polyhaven.com/license) cover those asset
references. No website screenshots, logos or example renders are copied.
