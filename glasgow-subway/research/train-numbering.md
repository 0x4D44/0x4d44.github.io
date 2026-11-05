# Glasgow Subway - how the trains are numbered, and how the sim numbers them

The sim shows the third-generation **Stadler METRO** train (4 cars, ~39.3 m, in service since 11 December 2023). This note records how the real fleet is numbered, what the sim does with it, and which parts are sourced and which are assumptions.

## 1. What the real numbering is (sourced)

| Fleet | Numbering | Source |
|---|---|---|
| Metro-Cammell (1977-79, 3-car) | Cars were numbered **individually**: motor/driving cars **101-133** (122 is not in service), trailers **201-208**. Formed in 3-car sets. The operator states that **unit numbers are not used**. | 2019 RVAR non-compliance application (gov.uk PDF, below); Wikipedia *Glasgow Subway rolling stock* |
| Stadler METRO (2023-) | **17 four-car units, numbered 301-317**. Each car carries its unit number plus a **car letter**: `301A`, `301B`, `301C`, `301D` ... `317D`. | gov.uk RVAR exemption consultation for the Stadler EMUs; Wikipedia *Glasgow Subway rolling stock*; railforums thread |

Sources (all read for this note):
- https://en.wikipedia.org/wiki/Glasgow_Subway_rolling_stock
- https://assets.publishing.service.gov.uk/media/5d8e2f6ce5274a2fb39c894c/Glasgow_Subway_RVAR_Non_Compliance_Application_23_September_2019.pdf ("Unit numbers are not used"; car numbers 101-133 / 201-208)
- https://www.gov.uk/government/consultations/rvar-exemption-glasgow-subway-stadler-electric-multiple-units/b28ff9ee-b996-42ff-ae74-9af4a900de38 (17 units, 301-317, cars A-D)
- https://www.railforums.co.uk/goto/post?id=6688142 (fleet-list discussion, used only to cross-check)
- `research/NOTES.md` (network, headways) and `research/train-dimensions.md` (car lengths)

The consequence for the sim: because it depicts the Stadler train, the sim numbers **units** 301-317 and **cars** `<unit>A..D`. (The old fleet would have had to be numbered car by car, and has no unit number to show on a board.)

## 2. The network facts the model has to respect (sourced)

- One 10.5 km circuit, 15 stations, two separate tunnels: the **Outer** circle runs clockwise, the **Inner** anticlockwise (NOTES.md).
- The depot (Broomloan) is reached by a ramp between Govan and Ibrox.
- "Six trains per circle in full service" (NOTES.md); off-peak headways are 6-8 minutes.
- A lap took about 24 minutes with the old trains, a little longer with the new (SPT).

## 3. What the sim does (design - mine, not sourced)

**One fleet, one clock** (`js/sim/fleet.js`, unit-tested in `js/sim/sim.test.mjs`):

1. A single **pool of 17 units** (301-317). In full service **six units run each circle** (12 in service), **five are spare in the depot**. Which units those are is shuffled once per session (`ctx.fleetSeed` pins it); a unit stays on its circle for the whole session, and **a unit is never on both circles**.
2. Each circle is a **ring**: its units are spaced evenly round the lap, so with six units the headway is lap/6.
3. The **lap time is not typed in: it is measured**. `measureCycle` runs the real ATO `Service` round the real track twice and records the second (steady-state) lap - the first lap from a freshly placed train is about 4 s quicker than every lap after. That gives each stop's arrival/departure time within the lap, and the lap period. Measured: **outer 1505 s (25.1 min), inner 1508 s (25.1 min)**, so a six-unit headway of **4.2 min** - between the 4 min that "six trains per circle" implies and the 6-8 min off-peak service.
4. Everything the player sees about a train is then a pure function of the fleet clock: the next-train boards, the HUD, which unit arrives next. So **a countdown can only fall** (it cannot step up when a train leaves, which was the earlier "1 min -> 2 min" bug), and **the same unit comes back exactly one lap later**.
5. The trains you can see are real simulated services. When one really stops at a station its roster entry is **re-anchored** to that moment (the whole ring slips together, so units never end up on top of each other).

**Where the number is shown:** the HUD ("Train 305 - ...", "Next train 305 in 2:31"), the platform "next train" boards beside the time ("unit 305"), and on the train itself - `305A`..`305D` on each car's flank and `305` on each cab front (`TrainView.setUnit`).

## 4. What is NOT verified

- **Where the real units carry their numbers.** I could not confirm the placement, size or typeface on the Stadler cars. The plates in the sim sit on the plain white flank panel of each car (between the door pairs on the two long end cars, between the roundel and the door pair on the short middle cars) and on the dark panel beside the cab-front roundel. That is a plausible, legible choice, not a copy of the real livery.
- **Whether units swap circles in service.** Real units can be moved between the circles through the depot; the sim keeps each on one circle for a session.
- **Service level.** Six per circle is the "full service" figure in the sources; the sim has no timetable by time of day. A leaner service (fewer units, longer headways) is a one-number change (`IN_SERVICE` in `fleet.js`).
- The lap time is the sim's own ATO running time, not a published figure; it lands near the published ~24-25 min but is not calibrated to a timetable.
