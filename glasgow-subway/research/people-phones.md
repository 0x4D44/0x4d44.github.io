# People on their phones: how it works, where the numbers come from, what was not checked

Some of the people waiting on a platform or sitting on a train now have a mobile phone: typing or reading with both hands, or holding it to the ear for a call. Switch it off with **`?phones=0`** on the address (`crowd.setPhones(false)` / `__sim.phones(false)` from the console) to compare.

## Why the arms are solved, not captured
The asset's own clips that say "phone" (`phone_stand`, `phone_call`, `sit_phone`) were made without a phone in mind: in `phone_stand` both hands are up beside the face with the palms facing each other, and in `phone_call` the hand is in front of the eye rather than at the ear. What a phone-user's arms do is a constraint, not a pose: the screen faces the eyes at about arm's length, or the phone is against the ear. So:
- the **stock clip still supplies the body and head pose** (weight shift, head tilt, breathing);
- the **arms are replaced** by a two-bone IK "hold" layer applied after the animation mixer and the gait (`js/sim/hold.js` is the maths, `hold_three.js` puts it on the live skeleton, `people.js` decides who and when);
- the **phone is placed from the person's own head** (the eyes, the right ear), so a short woman and a tall man each hold theirs at their own arm's length;
- the layer fades in over 0.55 s and out over 0.5 s (`HOLD_IN` / `HOLD_OUT`), rising from a snapshot of the arms taken at the start of the bout, so there is no pop at either end.

## Where the numbers come from
Measured:
- the **viewing distance**: texting 36.2 cm from the eyes on average (range 17.5-58 cm, n = 129), browsing 32.2 cm - Bababekova, Rosenfield, Hue & Huang 2011, "Font size and viewing distance of handheld smart phones", *Optometry and Vision Science* 88(7): 795-797 (PubMed 21499163). `VIEW` in `hold.js` puts the phone 34-35 cm away.
- the **phone**: an iPhone-sized slab, 71.5 x 147 x 8 mm, drawn a little larger (72 x 150 x 8.5 mm) so it reads from across a platform.

Estimated here, not taken from a paper: the gaze drop to the screen (about 55 degrees), the elbow near 90 degrees with the phone near the chest, a seated texter holding it a little closer and lower, and the call grip (palm low on the back of the phone, the phone leaning 45 degrees toward the back of the head, which puts the elbow low and forward instead of out at the shoulder - the first version, with the elbow up at the shoulder, looked wrong in stills). The elbow is never asked to bend past what an elbow can do (about 145 degrees; the sim's tests hold it under 150).

## Who, and how often
- Standing grown-ups on their idle bouts: `PHONE_USE` = 25 % of them, of which `PHONE_CALL` = 28 % are a call and the rest are typing / reading. Seated: 40 % of the sitting bouts of a grown-up (not staff) who has a seated-phone clip.
- Observed on the six platform halls (24 samples, 528 person-samples): 119 holding one (22.5 % of everybody in view, including the ones on the move who never do): 66 typing / reading, 10 calling, 43 seated. On the trains: 29 of 102.
- **Nobody on the move, no child, no member of staff.** Walkers and pole-riders do not hold one (text-walking is the obvious next step, and was left out so that the walking metrics of `research/people-motion-rubric.md` stay clean); children's arms and eye-lines are not the adults' that the grip is derived for; staff are working. The phone's random choices come from their own random stream, so `?phones=0` changes nothing else in the crowd.

## Checks
- `js/sim/hold.test.mjs` (18 tests): the rotation helpers; two-bone reach (bone lengths kept, wrist on its target, elbow on the pole side, out-of-reach and degenerate cases finite); the arm solver (forward kinematics lands elbow and wrist where it says, the elbow bends forward and by the angle between the bones, straight arms stay finite); where the phone sits (34-35 cm from the eyes, facing them; nearer for a child, lower and closer when seated; at the ear and following a tilted head); the grips; and that an adult's arm reaches every way of holding it with room to spare and the elbow inside what an elbow can do.
- `tools/test_sim.mjs`, "phones" checks: across all six halls, holders exist, each phone is where the hold put it (0 strayed, worst error 2.5e-7 m), the wrists are on their targets, the elbow never bends past 150 degrees (worst seen 143.0), reach never beyond 95 % of the arm's length (worst 0.745), no child or member of staff or anyone on the move holds one; `setPhones(false)` puts every phone away and `setPhones(true)` brings them back; the same on train riders.
- Looked at as stills (adult and child, the rendered shoe at LOD0 and LOD1, texting, calling, seated).

## Limits
- **Nobody has watched it move**: all of the checks are numbers and still frames; whether the arms *look* natural in motion, and the timing of taking a phone out and putting it away, were not judged by eye.
- The phone is a generic slab with a bright flat screen - no content, no glow on the face, no thumbs moving. The hand's fingers are not posed individually; the grip is the hand's rest pose placed on the phone.
- Known garment artefacts that the holds make easier to notice but do not cause: jagged sweater hems (`woman_midi`, `boy_small`) and a torn look at the inside of the elbow on a few long sleeves (`woman_elder`, at LOD1).
- A seated close-up with the head in frame was not obtained (the close-up framing cuts the head off), so the seated gaze is checked by the maths only.
