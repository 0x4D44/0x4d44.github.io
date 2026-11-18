# ALM-BUG-FLU-00024 — KX day-clear capture frames settle into one of two states across loads of the same build

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src
- **Raised:** 2026-11-18T05:41:14Z
- **Discovery source:** Agent
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-11-18T05:41:14Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

The King's Cross daylight (day-clear) render of three frozen capture views is not deterministic across page loads of the same build. It settles into one of two byte-distinct states.

Evidence (night-weather capture packs, 1280x800, same headless Chrome GPU host):
- Round 13 pack (BASE 5f2d4451, HEAD = ed26be10's code): BASE and HEAD byte-identical in kx/day-clear/{south-front,shed-interior,overview}.
- Round 14 pack (BASE ed26be10, HEAD 4b32ac22, which changes only night-fog code): BASE differs from HEAD by 74 px (south-front, max 1), 8297 px (shed-interior, max 10; 159 px >= 3, mean signed change ~0, all in the lower half of the frame, y >= 441) and 187 px (overview, max 1). Round 14 HEAD is byte-identical to both round 13 frames, so the round 14 BASE render (same code as round 13 HEAD) is the odd one out.
- The identical counts (74 / 8297 max 10 / 187) also appeared between the round 12c and 12d HEADs, where they were mistaken for a code leak.

Impact: exact-control gates in the KX capture tooling report false differences and can block or confuse landings. Visually it is invisible (an independent scorer judged it so).

Suspects (unverified): load-order-dependent state in the KX day scene, e.g. landmarks arriving after the first frame (atmosphere.ts roof cover map rebuilt when the roof mesh set changes), or a transparent-object sort tie on the shed floor/platforms.

Repro: run the night-weather capture twice on the same commit and diff kx/day-clear/shed-interior.png; on the evidence about half of runs land in each state.

Evidence fingerprint: `manual:v1:kx-day-clear-capture-frames-settle-into-one-of--1ad915d243a2e837`


## Fix

<unfixed — raised only>

## Notes

- 2026-11-18T07:46Z (claude-opus-5-5): not King's Cross only. The round 15 night-lighting pack (`night-lighting-r15-20261118T061925Z`) showed Perth night-snow `pt-platform-4-north` differing by 70 px (max 1) between BASE and HEAD, where neither side changed Perth code. Round 15 HEAD was byte-identical to both round 14 frames (BASE and HEAD), so the round 15 BASE render was the odd one out: the same two-state pattern, in a second scene and a night state. The cause is therefore probably shared scene-load code, not anything King's Cross specific.
- 2026-11-18T08:40Z (claude-opus-5-5): also hits KX night-fog, and this time the HEAD run was the odd one out. Round 17 pack (`night-lighting-r17-20261118T075809Z`, BASE d21d5f64, HEAD b8011636, which changes Waverley code only) showed KX night-fog overview / shed-interior / south-front differing from BASE by 1 / 1769 (max 2, lower half of the frame) / 3 px. A KX-only night-fog re-capture of both builds twelve minutes later gave HEAD == BASE == the pack's BASE, byte-exact in all three views. So the effect is a property of the run, not of either build, and it reaches night states as well as day-clear. Shed-interior's lower half is again where most of the difference sits.
