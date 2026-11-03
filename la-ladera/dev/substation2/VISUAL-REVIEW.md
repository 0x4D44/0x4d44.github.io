# Recovered substation library: visual review

## Scope and identity

This review covers the recovered **59-design** implementation, with a near and
far LOD for each design. It is a distinct implementation of the original
132/33/11 kV brief. It does not establish recovery of the earlier, unavailable
62-design build.

The review uses fresh renders of this snapshot's exported GLBs. Pre-existing
JPEG evidence in the recovered checkout was not accepted as current evidence.
All ten newly composed contact sheets have been inspected, covering 59 near
models and their 59 far LODs. The fresh [yard overview](evidence/yard-overview.jpg)
and [1.6 m yard view](evidence/yard-eye-1_6m.jpg) were also inspected after the
render completed, and the final source pins were checked against this snapshot.

| Sheet | Near models | Far LODs | Designs on each sheet |
| --- | --- | --- | ---: |
| 01 | [Near 01](evidence/contact-near-01.jpg) | [LOD 01](evidence/contact-lod-01.jpg) | 12 |
| 02 | [Near 02](evidence/contact-near-02.jpg) | [LOD 02](evidence/contact-lod-02.jpg) | 12 |
| 03 | [Near 03](evidence/contact-near-03.jpg) | [LOD 03](evidence/contact-lod-03.jpg) | 12 |
| 04 | [Near 04](evidence/contact-near-04.jpg) | [LOD 04](evidence/contact-lod-04.jpg) | 12 |
| 05 | [Near 05](evidence/contact-near-05.jpg) | [LOD 05](evidence/contact-lod-05.jpg) | 11 |

## Rendering and visual checks

The renderer imports both packed GLBs, binds their external shared atlas maps,
and uses Blender 5.0.1 Cycles on CPU with two threads. Catalogue views use eight
samples. The two yard views use 24 samples. Catalogue cameras stay at 1.6 m and
include a 1.8 m reference figure. The yard walking view places the camera 1.6 m
above the plan's 0.12 m ground datum; the overview uses an elevated camera.

Fresh individual renders and the complete sheets show supported transformer bushings,
exposed cooling fans, tank/radiator assemblies, a supported pantograph mechanism,
and appropriately scaled breaker, switchboard, battery and station-service
equipment. Tower, pole and portal silhouettes retain their support structures.
The far LODs simplify fins, porcelain sheds, latticework and small fittings;
they were inspected as separate static views. Spanish warning artwork is
upright and legible in the sign views: `PELIGRO / ALTA TENSIÓN / 132 000 V`,
`PROHIBIDO EL PASO`, and `NO TOCAR`.

The fresh [contact report](evidence/contact-report.json) contains 118 unique
records with complete catalogue coverage. Every camera Y is 1.600000023841858 m
(Blender floating-point storage of 1.6 m), and every record specifies a 1.8 m
figure. No asset, source or test was changed by this review.

### Visible wall-edge and coping seams

Near sheet 04 shows a very dark vertical strip on the exposed right edge of
`wall_brick`, `wall_door` and `wall_window`. Their source places concrete piers
over brick boxes with coincident outer side faces, making a coplanar-surface
artifact a plausible cause; that cause is inferred, not established by a
runtime diagnosis. This seam remains in the recovered assets and needs cleanup
where exposed module ends are used. The final yard eye view also shows a dark
strip across the exposed end of the firewall's coping. Its body and coping
likewise have coincident end faces in the source. The asset bytes were preserved.

## Independent plan and conductor observations

The plan and catalogue were read separately from the renderer. All explicit
spans were sampled with the library's pure ES-module catenary tool.

| Observation | Result |
| --- | --- |
| Compound | 55 by 40 m, origin at its centre |
| Placed records | 462: 460 equipment/site records and two external towers |
| Transformer units | Two 132/33 kV and two 33/11 kV units |
| Indoor switchboard | Twelve panel placements |
| Span data | 36 spans: 30 at 132 kV and six at 33 kV |
| Shared-segment transforms | 903 |
| Minimum sampled conductor-point Y | 2.45 m, or 2.33 m above the declared ground datum |
| 11 kV routing | Declared underground via the cable trenches |

The plan supplies four bay positions, bunds, a firewall between the large
transformers, control-building modules, oil store, fence and five-metre gate,
lighting and lightning masts, and incoming/outgoing towers. Its connection
notes explicitly describe transformer and distribution connections as
illustrative. These observations do not certify clearances or establish a
complete electrical switching arrangement.

The fresh overview agrees with that arrangement. The yard eye view shows the
large transformer supported inside its bund, exposed fans and radiator pipes,
the intervening firewall, overhead connections, surrounding equipment and the
external towers at a plausible first-person scale. This fixed camera is visual
evidence only; it does not test a walkable route.

### Known service-route defect

`nav.serviceRoute` ends with the segment `[0,16]` to `[6,16]` in plan X/Z
coordinates. That segment crosses the control building's solid west wall at
X = 1.5 m. The door is on the south/front wall at approximately `[6,18]`.
**This route is not traversable as written and requires correction during
integration.** The plan was preserved without modification, and navigation
was not verified in a game runtime.

## Evidence provenance

The completed renderer exited successfully. Independently recomputed SHA-256
values match all nine entries in the fresh
[source pins](evidence/source-pins.json): manifest, both GLBs, plan, materials,
catalogue and three atlas maps. The renderer also checked that these sources
remained unchanged during rendering. All four copied metadata JSON files match
the fresh render-output copies.

| Source | Verified SHA-256 |
| --- | --- |
| `manifest.substation2.json` | `527cae0b116175548fd6aa823ddc98c2a81be087bd5748a6e8c6db8037b6035c` |
| `substation2_near.glb` | `3294c4e43d4d13b8d568cf0d78620b2b1f2dfbff2a6cf8099324f844402456ed` |
| `substation2_lod.glb` | `e688773c46d74df06926188185c576c1eb4de0b314b54fa6ab1b28425d603091` |
| `substation2-plan.json` | `e0c5072a7d6b10fd40bcc4795a8f4ea4f9fa21b5b63c3121b4ca0b126a663656` |

The [yard report](evidence/yard-render-report.json) records 462 placed records,
903 conductor segments and an eye height 1.6 m above ground. Its placement and
segment totals agree with the independent plan inspection above.

## Limits

This is static visual and plan-data inspection. It does not measure Three.js
GPU time, draw calls, runtime memory, boot loading or LOD-switch behaviour.
Doors, lamps, hum sources and navigation were not exercised in the game.
Contact views do not expose every face or every hidden assembly, and the
overview's roof hides the indoor equipment. Small text is assessed only where
the rendered resolution makes it legible.

The layout and catenaries are plausible visual data, not engineering-certified
electrical, structural, protection, earthing, fire or conductor-tension designs.
