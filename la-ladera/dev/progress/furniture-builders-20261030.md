# Furniture builder completion — 30 October 2026

## Implemented

Completed `tools/blender/furn_assets_home.py` and `furn_assets_shop.py`, and extended
`furn_assets_living.py`. These three modules register 164 catalogue keys. The
remaining 58 electronics, religious/decorative objects, plants and small clutter
keys are implemented in `furn_assets_details.py` by the validation agent. All four
modules together register all 222 current catalogue keys.

The existing living hero builders are reused. New models include real frame and
bedding geometry for all bed types; open chair, school-desk, bench, rocking-chair
and wheelchair frames; cabinet doors, drawers, handles and stocked shelving;
stoves, refrigerators, washing and laundry equipment; hollow sinks and toilet
bowls; electric shower fixtures; glazed shop counters with appropriate stock;
bakery ovens/trays, produce crates, hardware, fabric fittings, workshop equipment,
clinic furniture and a motorcycle. Fixtures use the catalogue dimensions and
shared named runtime materials, with no embedded textures or new dependencies.

## Local checks performed

A Python audit using a stub `bpy` module exercised every registered builder through
the real `furn_lib.Asset` geometry methods. All 222 builders completed without an
exception; all bounds fit the pre-existing generator tolerance (2 cm below floor,
10 cm sideways, 12 cm depth, 20 cm above catalogue height for fittings).
The geometry contains 91,490 triangles before the latest small handle/basket
corrections; no Blender-export or final payload claim is made by this audit.
Real Blender export, asset validation, runtime loading and visual review are
coordinated by the lead; those results must be reported separately.

Intentional envelope extensions are small details above the nominal working
surface (taps, vices, table-tennis net, butcher cleaver). The foosball cabinet and
rods fit inside its complete catalogue footprint. Fridge stock sits inside an
open cavity behind a glass door. TV feet and rear housings were tightened to
match the catalogue footprint, and the school desk faces +Z to match its work
anchor.
Ceiling fan geometry retains the existing motor housing only; the runtime adds
its animated blades. Floor models use a centred X/Z footprint, base at Y=0 and
front at +Z, matching the existing generator/runtime convention.
