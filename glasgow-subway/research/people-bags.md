# People carry bags

`js/sim/bags.js`, hooked into `js/sim/people.js`. Checked by the unit test "people: bags" and the end-to-end check "people carry bags" (`__sim.bagAudit()`).

## What there is

About four in ten people carry something (36% of the 85 characters with the seed in use):

| kind | where | who |
| --- | --- | --- |
| rucksack | on the back, two straps | half of children and teenagers, a fifth of other adults |
| tote (cloth shopping bag) | left hand | adults, more so the elderly |
| carrier bag | left hand | adults and teenagers |
| laptop case | left hand | mostly people in suits and coats |

Staff, the piper, people in Highland dress and the man walking the haggis carry nothing.

The bags are built in code: lofted shapes with vertex colours, one shared material, one draw call each (a rucksack is two: body and straps).

## How a rucksack is fitted

`fitBody` measures the person's own mesh at rest, once per character (181 ms for all 85):

- the bag lies on the part of the back that sticks out most (the 3rd-percentile depth of the back between the bag's top and bottom);
- each strap follows the convex outline of the body in a thin slice at 70% of the way from the spine to the shoulder joint (`overShoulder`), lifted 6 mm, then runs round the ribs under the arm to the bag's bottom corner, following the body's measured radius at each height and bearing;
- bag and straps hang on the upper spine bone, so they lean and turn with the chest.

All 85 characters measure, and every rucksack gets both straps. 22 characters have hair hanging down the back below the shoulders; they are never given a rucksack (the hair would hang through it) and get a tote instead, half the time.

## How a hand bag is carried

It hangs from the knuckles of the left hand and stays upright. It is pushed out sideways to clear the hip (measured) by 12 mm, and kept off the floor. Its position is read from the skeleton as last drawn, so it trails the hand by one frame.

The left hand, because the right is the one that gestures and holds a phone to the ear. Someone with a bag in the hand does not type on a phone with both thumbs. Holding a pole, the bag is in whichever hand is lower.

## Sitting

The bag goes on the lap: a rucksack upright with its back to the belly, the others standing on the thighs.

## Limits

- Nobody takes a bag off or puts it on: it is on the back, then on the lap, in one frame.
- The bags are stiff. They do not sag or swing.
- No shoulder bags, handbags on long straps, or suitcases.
- On the lap, the forearms of someone using a phone pass through the top of a rucksack.
- A strap is rigid with the chest; when an arm is raised the shoulder moves under it.
- Checked in still pictures only (standing, mid-stride, seated; both detail levels). Not watched in motion.

`?bags=0` in the URL turns them off.

## Legs for the five kilt wearers (same change set)

Found from two user screenshots (a seated girl with holes in her lap and socks, a man seen
from above with hollow sock tops). The asset's hidden-skin removal had deleted the legs of
everyone in long hose (`adult_piper`, `boy_kilt`, `girl_school_kilt`, `man_highland`,
`man_kilt_casual`), and the socks themselves had holes. `fitHoseLegs` in `js/sim/bodyfit.js`
now measures each old sock, removes it and builds one skinned tube per leg: skin from the hip
to mid-calf, sock from the old sock top to the ankle, closed at the cuff. Both models get it.
The scalp cap's edge is also cut along a smoothed line (`aScCov`) instead of along mesh
triangles, which removes the ragged patches at the girl's front hairline; the hairline is
still a coarse polygon up close.

The people audit no longer counts somebody on the stairs as "standing inside furniture"
(the stairs' footprint is an avoid box); that was an intermittent false failure.
