# Apex Karts — architecture contract (all agents read this first)

A 3D arcade kart racer. Static site, **no build step**: native ES modules, Three.js r170 vendored at
`./vendor/three.module.min.js`, resolved through an import map in `index.html`
(`"three": "./vendor/three.module.min.js"`). Every module does `import * as THREE from "three";`.
No external assets: all geometry procedural, all audio synthesised (WebAudio), all UI HTML/CSS/SVG.
No frameworks. Repo: `/home/user/0x4d44.github.io/kart-racing/`. Shared constants/helpers: `roster.js` (already written — READ IT, do not change signatures; you may append exports only if you tell the lead).

## Conventions (everyone)
- y up. Heading θ: forward = (sinθ,0,cosθ), right = (-cosθ,0,sinθ). Mesh `rotation.y = θ`; kart mesh faces local +z.
- Steer input +1 = right. Track lateral offset +ve = right of centreline. Units m / s. Ground is flat (y=0).
- Input object (see `blankInput()` in roster.js): `{throttle 0..1, brake 0..1, steer -1..1, drift bool(held), useItem bool(edge: true for one frame), lookBack bool}`.
- Typical top speed ~ 38–46 m/s (display ×3.6 → km/h, then ×1.0; HUD shows "km/h" up to ~170). Road half-width ~ 8–11 m. Kart radius ~1.3 m.
- Never allocate in per-frame hot paths if avoidable (reuse Vector3s). Cap pixel ratio at 2. 60 fps target on a mid laptop; 8 karts.
- **The Almanac "← Almanac" pill is pinned top-left `[0,0 109x41]` at every width.** Nothing interactive/important may sit at x<112px, y<45px. Page must never scroll (full-viewport, `overflow:hidden`). Must be usable at 390x844 portrait and landscape phones (touch) and desktop.
- Wrap `localStorage` in try/catch. Pause the sim when the tab is hidden. All text ASCII-safe or proper UTF-8 with `<meta charset>`.
- Only touch files you own. Do not edit `roster.js`, other agents' files, or the repo root. If a contract needs changing, make the smallest backwards-compatible addition and mention it in your final report.
- Dev harness pages are welcome but must live under `kart-racing/dev/` (will be deleted before ship). Browser testing: Playwright + Chromium are pre-installed (`require('playwright')`; launch with args `["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]`), serve with `python3 -m http.server 8000` from `/home/user/0x4d44.github.io` (page at `/kart-racing/`). Take screenshots into the scratchpad dir and LOOK at them. Fix what you find. Console must be free of errors.

## Files & owners
| File | Owner | Purpose |
|---|---|---|
| `trackdefs.js`, `track.js` | **A Track** | Track metadata + procedural track/scenery/themes |
| `kart.js`, `controls.js`, `camera.js` | **B Kart** | Physics, kart model, player input (kbd/gamepad/touch), chase camera |
| `ai.js`, `items.js` | **C AI+Items** | Bot drivers, item boxes, projectiles/hazards, item effects |
| `ui.js`, `style.css` | **D UI** | All menus, HUD, countdown, pause, results, settings (DOM) |
| `index.html`, `main.js`, `race.js`, `audio.js`, `effects.js` | **E Engine** | Renderer, game loop/state machine, race rules, cup, audio, particles/effects, integration |

## A — `trackdefs.js` (pure data, NO three import) and `track.js`
```js
// trackdefs.js
export const TRACK_DEFS = [ { id, name, blurb, difficulty: 1|2|3, laps: 3, theme: "sunset"|"snow"|"neon"|..., width: 18,
   points: [[x,z],...] /* closed Catmull-Rom control loop */ } ]; // exactly 3 tracks, distinct themes, ~900–1400 m laps, lap time 45–80 s at speed
export function outlinePoints(def, n = 120) -> [{x,z}]   // pure; for menu previews
// track.js
export function createTrack(id) -> Track
Track {
  id, name, laps, length /* centreline metres */, def,
  group: THREE.Group,                 // all visible geometry (road, kerbs, walls, scenery, start arch, boost pads, sky dome)
  setupScene(scene, renderer),        // set scene.background, fog, lights (ambient/hemi + sun). Returns a dispose() fn.
  sample(s) -> { pos:V3, tangent:V3, right:V3, halfWidth, wallDist }   // s wraps; REUSED object allowed (copy if you keep it)
  locate(pos, hintS) -> { s, lateral, halfWidth, wallDist, onRoad, surface:"road"|"grass"|"boost"|"kerb", boost:bool, dist }
                          // fast: local search near hintS (use hintS when given, else global); called ~30x/frame
  grid(i) -> { pos:V3, heading }      // starting slot i (0 = pole), 2-wide staggered grid behind the line, facing along track
  itemBoxes: [{ pos:V3, s }]          // 4–6 clusters of 3–5 boxes across the road; C renders them
  boostPads: [{ s, lateral, length, width }]  // A renders pads; locate().boost is true on them
  aiLine(s) -> lateral offset (m) of a good racing line (smooth, cuts corners, stays within road) — used by bots
  curvature(s) -> signed 1/radius (+ve = turning right), smoothed — used by bots to brake
  minimap: [{x,z}] (~160 pts), bounds: {minX,maxX,minZ,maxZ}
  update(dt, time)                    // animate scenery (flags, water, spinning things)
}
```
`wallDist` = distance from centreline to the invisible/visible barrier (road half-width + a grass shoulder of ~3–6 m). Start/finish line is at s=0. Visual quality matters: kerbs (red/white), walls/tyre barriers, grandstand at start, trees/rocks/buildings/lamps per theme, lane markings, textured road via CanvasTexture, sky gradient, distant mountains/skyline, instanced meshes for scenery (keep draw calls low, <400). Themes: e.g. Sunset Coast (easy, bright, palm trees, sea), Frostbite Pass (medium, snow, pines, hairpins, ice-blue), Neon Docks (hard, night, glowing signs/lamps, cranes, containers). Include one tight section, one long straight with boost pads, and a chicane per track at least.

## B — `kart.js`
```js
export function buildKartMesh(color, accent) -> THREE.Group  // detailed low-poly kart + driver (helmet), 4 wheels as named children "wheel"; faces +z; origin on ground
export class Kart {
  constructor({ id, name, color, accent, stats /* roster stats 0..1 */, isPlayer })
  // identity & state (read by others)
  id, name, color, accent, isPlayer, mesh /* Group, add to scene */, position:V3, velocity:V3,
  heading, speed /* signed forward m/s */, maxSpeed /* base top speed m/s incl. stats */, radius,
  input /* blankInput(), set by Controls or AIDriver each frame */,
  locked /* true: no drive input (grid/countdown); engine may rev */, speedScale = 1 /* AI rubber-band multiplier on top speed+accel */,
  drifting, driftDir, driftCharge /* 0..3 level */, boostTime /* >0 while boosting */, boostStrength,
  spinTime /* >0 while spun out */, shield /* seconds left, >0 = shielded */, offRoad, surface, onWall,
  item /* string|null (C writes), itemCount /* for triple */, 
  race /* object attached by Race (E): {s,lap,progress,place,finished,finishTime,lapTimes[],bestLap} */
  // actions
  placeAt(pos, heading)                // teleport + reset velocities
  update(dt, track)                    // full physics step: steering, drift/mini-turbo (3 charge levels -> boost on release), surface drag, wall bounce, boost pads, spin-out, mesh sync, visual wheel spin/steer/body roll
  boost(strength = 1, duration = 1.5)  // strength 1 ≈ +45% speed + extra accel
  spinOut(duration = 1.4)              // lose control & most speed, kart spins visually
  squash? NOT required.
  addShield(seconds)
  respawn(track)                       // put back on road at last good s (used if stuck/out of bounds >3 s)
  on(name, fn)                         // events: "bump"(other,impact) "wall"(impact) "spin" "boost"(strength) "driftlevel"(n) "driftboost"(n) "pad" "land"
  static collide(karts)                // pairwise circle collision incl. weight-based push; emits "bump"; call once per frame after all update()
}
```
Feel is everything: responsive steering (speed-sensitive), grip with a little slide, strong but fair drift (hold `drift` while steering → hop, slide, sparks colour blue→orange→pink at levels 1–3, release = boost), reverse when braking from standstill, sensible grass slowdown (~55% top speed), walls scrub speed rather than dead-stop, rocket start possible. Karts must not get stuck on walls or each other (nudge out). Stats: speed→maxSpeed 36–46, accel, handling (turn rate/grip), weight (collision push). All heavy tuning constants at top of file.

## B — `controls.js`
```js
export class Controls {
  constructor(domRoot /* element to host touch overlay */, canvas)
  read() -> input (blankInput shape); useItem is an edge (consumed on read)
  enabled (bool: ignore input when false); setTouchMode("auto"|"on"|"off")   // auto = show on touch devices
  onPause = null  // called on Esc/P/gamepad Start
  dispose()
}
```
Keyboard: WASD/arrows steer+throttle/brake, Space or Shift = drift, E/Ctrl/Enter/X = use item (also click/tap item? no), C/Backspace = look back, Esc/P = pause. Gamepad (standard mapping: left stick/dpad steer, RT/A throttle, LT/B brake, RB/LB drift, X/Y item, Start pause) with deadzone. Touch overlay: left thumb steering pad (a horizontal slider/area at bottom-left), right side big DRIFT and ITEM buttons; throttle is auto-accelerate on touch with a BRAKE button. Overlay DOM+CSS injected by controls.js itself (class names prefixed `kt-`), `pointer-events` only on the controls, `touch-action:none`, must keep clear of the top-left pill.

## B — `camera.js`
```js
export class ChaseCamera { constructor(camera /* PerspectiveCamera */); setTarget(kart); update(dt, track?) ; snap(); setMode("chase"|"far"); setShake(amount) ; lookBack(bool); 
   // smooth follow behind kart, FOV widens with speed/boost, lags into drifts, short shake on hit; "orbit" demo helper: orbit(dt, centre, radius, height) for menu backdrop }
```

## C — `ai.js`
```js
export class AIDriver {
  constructor(kart, track, { difficulty: "easy"|"normal"|"hard", skill: 0..1 /* per-driver variation */, seed })
  update(dt, ctx /* { karts, items:ItemSystem, race } */)  // writes kart.input each frame
}
export function rubberBand(kart, leaderProgress, playerProgress, difficulty) -> speedScale // gentle, 0.92–1.08
```
Follows `track.aiLine`, looks ahead using `track.curvature` to brake into corners, drifts through long corners, avoids karts/banana hazards (read `items.hazards`), personality jitter (lane choice, mistakes on easy), recovers from walls/spins/being stuck (reverse + steer), uses items sensibly (fires shells when a target is ahead within cone, drops banana when someone is behind close, boosts on straights, holds shield until threatened or timer), starts with launch-boost chance. Difficulty changes top speed scale (easy ≈0.88, normal ≈0.96, hard ≈1.03), mistake rate and rubber-band strength. Must complete laps on all 3 tracks reliably (test it!).

## C — `items.js`
```js
export class ItemSystem {
  constructor({ scene, track, karts, effects /* E */, audio /* E */, rng })
  hazards: []   // active static hazards {type:"banana", position:V3, owner} so AI can dodge
  update(dt, time, race)       // item-box pickup (box vanishes ~4 s then respawns), roulette delay ~1.2 s then kart.item set, projectile motion/collision, hazard collision, shield blocks hit (consumes shield), shockwave hits every kart AHEAD of user not shielded
  rollItem(kart, race) -> itemId   // by ITEMS weights from roster.js banded by kart.race.place
  useItem(kart)                // consumes kart.item/itemCount; boost/triple (3 uses, tap to fire each), banana (drop behind; hold up-steer? just drop behind), green "Bouncer" (fires forward, bounces off walls ~6 s or 3 bounces, spins first kart hit), homing "Seeker" (targets kart directly ahead in race order, follows track.aiLine/centre, hits), shield (8 s bubble), shock (all karts ahead spin briefly + screen flash event)
  isRolling(kart) -> bool; rollProgress(kart) -> 0..1   // for HUD slot-machine animation
  events via effects?.burst(...) / audio?.play("item-get"|"boost"|"hit"|"throw"|"shield"|"shock"|"banana") — call safely (optional chaining)
  reset(); dispose()
}
```
Item boxes: spinning rainbow cube with "?" glow, bobbing, in track.itemBoxes positions. Visuals: banana mesh, shell meshes with trails, shield bubble around kart (transparent sphere attached to kart.mesh), all instance-light. Emit on the kart: when a kart is hit call `kart.spinOut(...)` (unless shielded) and `kart.emit?.`—just use kart.spinOut/boost/addShield.

## D — `ui.js` + `style.css`
```js
export class UI {
  constructor(root /* #ui overlay element */, { roster, trackDefs, outlinePoints, buildKartMesh /* may be undefined: fall back to swatch */ })
  settings -> { volume:0..1, music:0..1, sfx:0..1, camera:"chase"|"far", touch:"auto"|"on"|"off", minimap:bool, quality:"high"|"low" }   // persisted in localStorage "apexkarts.settings.v1"
  onSettings = fn(settings)   // fired on any change
  showTitle(onContinue)       // animated title screen "APEX KARTS", press any key / tap
  showMenu({ onStart })       // main menu: Quick Race, Grand Prix (3-race cup), Settings, How to Play, Best Times. Flow: mode -> character select (8 karts, stats bars, live 3D-ish preview or CSS swatch) -> track select (outline preview, difficulty stars, best time) -> laps/difficulty -> Start.
                              //   onStart({ mode:"race"|"cup", trackId, laps, difficulty, kartId })  (cup: trackId = first track, E runs the sequence)
  showLoading(text, frac)  hideLoading()
  showHUD(); hideHUD(); updateHUD(h)   // h = { place, racers, lap, laps, speedKmh, item /*id|null*/, itemCount, rolling /*bool*/, rollIcon /*id shown while rolling*/, time, lapTime, bestLap, wrongWay, boostPct 0..1 /*drift charge/boost*/, minimap:{ points:[{x,z}], bounds, karts:[{x,z,color,isPlayer,place}] }, standings:[{place,name,color,isPlayer}] top 8 mini leaderboard }
  banner(text, ms)           // big centre message e.g. "LAP 2", "NEW BEST LAP", "FINAL LAP!"
  showCountdown(label)       // "3","2","1","GO!" with animation; hideCountdown()
  showPause({ onResume, onRestart, onQuit }); hidePause()
  showResults(results, { onNext, onRetry, onMenu })   // see shape below, podium + table, confetti for top 3, Grand Prix standings variant
  showCupSummary / included in results.cup
  toast(text)
  setBestTimes(obj), bestTimes ; showScreen name queries: ui.current
}
// results = { trackName, mode, laps, difficulty, playerPlace, bestLap, newRecord, totalTime,
//   rows:[{ place, name, color, isPlayer, time /*s|null*/, bestLap, dnf?, points?, totalPoints? }],
//   cup: null | { round, rounds, final:bool, standings:[{name,color,isPlayer,points}] } }
```
Visual direction: bold, sporty, glossy — dark navy gradient with hot orange/cyan accents, italic heavy display type (system fonts: `"Arial Black","Impact",system-ui`), skewed panels, big readable HUD with speed readout + boost bar, item slot top-right with slot-machine animation, position "3rd/8" with ordinal styling, lap counter, minimap bottom-right, mini leaderboard left (below the pill zone!). Keyboard + gamepad-free menu navigation (arrows/Enter/Esc) AND mouse/touch. Menu backdrop is transparent: E renders a 3D scene behind (rotating track/kart), so give panels backgrounds. HUD must scale for 390x844 and landscape phones (touch controls occupy the bottom corners—keep HUD out of them: minimap top-right under item box on small screens).

## E — Engine (`index.html`, `main.js`, `race.js`, `audio.js`, `effects.js`)
- `index.html`: viewport meta, importmap, `<canvas id="game">`, `<div id="ui">`, `<link rel=stylesheet href=style.css>`, almanac back button `<script defer src="/almanac-back.js"></script>` before `</body>`, `<title>Apex Karts</title>`, `<noscript>`, WebGL-unavailable fallback message. Dark background set on `html,body` (the shell shows during load).
- `main.js`: renderer (antialias, cap DPR 2; "low" quality → DPR 1, no shadows), resize handling, fixed-timestep sim (1/120 s steps, accumulate, clamp), state machine: `loading → title → menu → (race: grid → countdown → racing → finishing → results) → menu/next race`. Menu backdrop: orbit camera around selected/first track with idle karts. Builds `Kart`s (player + 7 bots from remaining roster, random-ish grid by default; cup uses points order), `AIDriver`s, `ItemSystem`, `Controls`, `ChaseCamera`, `UI`, `Audio`, `Effects`. Pause (Esc / tab hidden), restart, quit, Cup sequencing (3 tracks, POINTS table, standings), best lap/best race time persistence (`apexkarts.best.v1`), difficulty applied to bots + rubber-band.
- `race.js`: `class Race { constructor({track, karts, laps, rng}); start(); update(dt); events (on): "lap"(kart,lap,lapTime,isBest) "finalLap"(kart) "finish"(kart,place) "allFinished" "wrongWay"(kart,bool) ; standings(); results(difficulty, mode)}` — computes each kart's `race = {s, lap, progress, place, finished, finishTime, lapTimes, bestLap}` using `track.locate(pos, hint)`, robust lap counting (must pass forward through s=0; no shortcut cheese: require progress monotonic checkpoints; backwards crossing un-counts), places by progress, after the player finishes bots finish by auto-completion (estimated) and DNF timeout, countdown 3-2-1-GO with rocket-start boost window.
- `audio.js`: `class GameAudio { constructor(); unlock() /*after first gesture*/; setVolumes({volume,music,sfx}); play(name, opts); engine: startEngine(kart)/updateEngine(speedFrac,boost)/stopEngine(); startMusic(themeId)/stopMusic(); }` Pure WebAudio synthesis: engine (sawtooth + filtered noise, pitch by speed), drift squeal, boost whoosh, item pickup arpeggio, hit/spin crash, banana slip, shell launch, shield, shock zap, countdown beeps, lap jingle, finish fanfare, UI blips (`ui-move`,`ui-select`), a looping chiptune-ish bass+lead music per menu/race (≥2 tracks, simple sequenced patterns scheduled with lookahead). Must be silent-safe if AudioContext is blocked.
- `effects.js`: `class Effects { constructor(scene); burst(pos, kind, opts); update(dt); attachToKart(kart) }` GPU-cheap pooled particle system (Points/instanced): tyre smoke + drift sparks (colour by charge level) + boost flames/exhaust + dust on grass + impact sparks + confetti + item pickup sparkle + speed lines overlay hint; kart shadow blobs if B does not.
- **Debug/test hooks (required):** `window.__kart = { game, state(), race, karts, track, ui, items, setBot(bool) /*drive the player with an AIDriver*/, quickStart({trackId,laps,difficulty,kartId,bot}), skipTo(seconds) }`; URL query `?quick=1&track=<id>&laps=<n>&difficulty=<d>&bot=1` boots straight into a race (no menus) for automated tests. `?seed=<n>` makes RNG deterministic.

## Definition of done (every agent, for your own module)
1. File(s) complete, no TODO stubs, lint-clean modern JS, comments only where non-obvious.
2. Tested in a real browser (Playwright screenshots / console / numeric assertions) via a dev harness or the full game if the others are ready. Check progress of other agents' files in the directory — integration is expected; once the files you depend on exist, run the whole game.
3. Final report (≤15 lines): what you built, any contract additions, known issues.
