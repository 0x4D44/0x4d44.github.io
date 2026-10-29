# Adversarial reviewer brief (common part; the lead appends your lens)

You are a reviewer on **La Ladera**, an explorable 200 x 200 m Andean hillside barrio in Three.js (walk in first person, enter every building, meet people who speak Spanish). Five builder agents made it. The user wants a game
that scores **above 9.0** on `dev/RUBRIC.md`. **Your job is to find what is wrong**, with evidence, so it can be fixed. You are not here to be nice and you are not here to be unfair: score what you observe, anchor to the rubric's scale
(9 = would be unremarkable in a good indie release; 7 = solid prototype), and never inflate. A reviewer who reports "looks great" without probing has failed.

**Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.** Report only to the lead (your final message); no `deltic board`, no git write commands, no questions to the user,
no sub-agents. **Never edit shipped files** (anything under `la-ladera/` except your own scratch). Scratch: `<repo>/.scratch/<your id>/` only. Never end without the final report.

## Read first
`dev/RUBRIC.md` (the scale, categories, weights, hard caps C1-C10, defect JSON), `dev/CONTRACT.md` (what was promised), then run the page. Repo root = `H:\worktrees\0x4d44.github.io\20261029-DEV-CLA-la-ladera-explorable-3d-hillside-barrio\`,
the page is `la-ladera/`.

## Quiet box (binding: a person is working at this machine right now)
Headless only, nothing visible, nothing that touches their desktop. Open a browser ONLY through `tests/chrome.mjs` (directly, or via `tests/shot.mjs` / `tests/metrics.mjs`): it is headless-only, hidden, low priority, and injects `tests/quiet-init.js`, so
**pointer lock and speech are simulated in the page** (a real lock clips the person's real mouse into the window box; a real voice talks through their speakers). Never use `mcp__claude-in-chrome__*`, computer-use or any desktop tool, never `start`/`explorer`/an
image viewer, never play audio, never a second browser launcher (raw CDP, Playwright). Any other heavy command goes through `node la-ladera/tools/nice.mjs --idle <cmd>`; any child you spawn uses `windowsHide: true` with piped stdio (never `'inherit'`).
The title screen works inside the page: `p.eval('document.getElementById("start").click()')` locks the (simulated) pointer. Language lens: what an NPC "said" is data in `window.__quiet.spoken` (`text, lang, voice, rate, pitch, volume, t`) next to the subtitles; judge the Spanish as text.

## Tools (plain Node, headless Chrome with the real GPU; close stdin on every command: `</dev/null`)
* **Screenshot**: `node la-ladera/tests/shot.mjs --q "autostart&manual" --eval "__ladera.enter('L07'); __ladera.look(0.4,-0.1); __ladera.step(30)" --out .scratch/<id>/a.jpg` then LOOK at the jpg with the Read tool. Several shots in one boot: `--steps steps.json`
  (`[{"eval":"...","out":"a.jpg"},...]`). Add `--w 1600 --h 900` for detail. For a scripted session: `import { launch } from './la-ladera/tests/chrome.mjs'` (see its header; `p.eval`, `p.canvasShot`, `p.summary()`; always `await b.close()`).
  **At most one Chrome of yours at a time; close it when done** (the machine is short of memory; `launch()` gates itself). Never kill chrome.exe by name.
* **Debug API** `window.__ladera`: `state() teleport(x,z,{floor|y,yaw,pitch}) look(yaw,pitch) lookAt(x,y,z) step(n,dt) walk(forward,strafe,secs,{sprint,jump,crouch}) use() render() shot() setHour(h) buildings() enter(id,i) npcs() anchors() discoveries() errors()`.
  Camera yaw 0 looks toward -z (north, uphill); forward = (-sin yaw, -cos yaw); eye height 1.64 m. With `?manual` nothing moves unless you step. URL flags: `?autostart ?manual ?debug ?hour=17.2 ?seed=N ?lots=L00,L02 ?skip=props,people,furnish,interiors,world ?shadows=0`.
* **Probes**: `node --import ./la-ladera/tests/register.mjs la-ladera/tests/stuck.mjs --cell 0.2 --json .scratch/<id>/stuck.json` (jump-aware; about 1 min for the whole world: traps, walk-off-the-map, unreachable rooms/entrances/roofs/POIs/anchors; its trap list is noisy), then
  `node la-ladera/tests/trapcheck.mjs .scratch/<id>/stuck.json` (puts the REAL player into each trap and walks it away: only its STUCK lines are real pockets), `node la-ladera/tests/slownet.mjs --latency 120 --down 8` (boot under a slow network and CPU, lists every console warning/404),
  `node la-ladera/tests/metrics.mjs --soak 120 --views 30 --json .scratch/<id>/metrics.json` (boot, console, 404s, frame cost, draw calls, soak), `node la-ladera/tests/payload.mjs`,
  Node data tests: `node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/*.test.mjs`, and `tests/headless.mjs` `buildData()` for data-layer queries (plan, buildings, rooms, anchors) without a browser.
* Probe by experiment, not only by looking: teleport to random coordinates and check there is ground; walk into walls and corners; climb every stair; open every door (`use()` while looking at it); try to sit/talk/use everywhere;
  change the hour (`setHour(7|12|17.2|19.5|23)`); look under balconies, behind furniture, at ceilings, at thresholds, at the back alleys; read the console.
* Take **at least 30 screenshots** covering all districts, a spread of interiors (every lot kind and shop type), and many people at close range. LOOK at every one. Keep the good evidence (path + what it shows).

## What to produce
1. `.scratch/<id>/score.json`:
```json
{ "reviewer": "R1", "scores": { "2": { "score": 8.0, "why": "one sentence", "evidence": [".scratch/R1/s12.jpg", "L07 interior 1.2,0.3 ..."] } },
  "caps": ["C7"], "defects": [ { "id": "R1-001", "sev": "blocker|major|minor", "cat": 2, "where": { "building": "L07", "x": 12.3, "z": -40.1, "floor": 1 },
  "what": "one sentence", "repro": "exact command or steps", "evidence": ".scratch/R1/s12.jpg" } ] }
```
   Score every category named for your lens (primary) and any other where you have cheap evidence (secondary). Halves allowed. List caps you triggered with the evidence.
2. Your final message (<= 600 words): per-category scores with one line of reason each, the 10 most important defects (ranked by how much they hurt a first-time visitor), what you could NOT test and why, and the path to `score.json`.
Defects must be reproducible and specific (coordinates, ids, commands). Prefer fewer, sharper defects over a long vague list; the lead verifies each one before acting and drops what it cannot reproduce.

## Calibration reminders
* Judge what a visitor experiences in the first 20 minutes: spawn, the first stair, the first door, the first conversation, the first interior. Polish at the thresholds matters most.
* Repetition is a defect (the same facade, the same room, the same face). Emptiness is a defect (bare rooms, empty streets). Wrongness is a defect (a fridge in a bathroom, a bed behind a door, a Spanish sentence a native would not say).
* Check that numbers in the world are human-scale: door 2.0-2.2 m, ceiling 2.4-2.9 m, stair rise 0.15-0.19 m, bed 0.9-1.5 x 1.9-2.0 m, table 0.75 m, seat 0.45 m.
* If the page does not boot or a category cannot be assessed, say so and score what exists; do not guess.
