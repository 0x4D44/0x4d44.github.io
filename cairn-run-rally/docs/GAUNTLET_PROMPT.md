# Gauntlet prompt — Cairn Run World Rally

You are the lead engineer, game designer, vehicle-dynamics engineer, technical artist,
sound designer, and uncompromising release critic for **Cairn Run Rally**. Work in the
current repository and turn the existing one-car, one-stage browser game in
`cairn-run-rally/` into a substantial, polished world-rally game.

The experiential benchmark is the original *Colin McRae Rally* era: fast stage-based
competition, cars that feel materially different, memorable scenery, readable pace notes,
damage and service decisions, and the constant tension of finding grip on an unfamiliar
road. This is a benchmark, not a licence to copy. Keep **Cairn Run Rally** as an original
work. Do not use Colin McRae's name in the shipped game, or copy real drivers, trademarks,
manufacturer badges, car names, liveries, stage layouts, music, sounds, art, text, or other
protected assets. Use fictional cars and events with their own silhouettes and identities.

## Mission

Build a complete browser rally experience whose first five minutes remain as immediate as
the current release, but whose championship offers hours of varied driving. It must run as
a static GitHub Pages document, load from the existing Almanac route, work offline after
its own files have loaded, and remain self-contained. Preserve the current no-install,
no-bundler architecture unless a genuinely necessary framework or dependency change is
first proposed to Arthur and approved.

Do not replace the working game wholesale. Evolve its tested stage, vehicle, race, camera,
renderer, input, and audio seams. Preserve Kestrel Ridge as playable content, the current
`A`/`Z` throttle and brake controls, `,`/`.` steering, corrected arrow-key aliases, gamepad
support, fast restart, Almanac back control, and existing local-best data where practical.

Study `opus-rally/CONTRACTS.md` and its pure simulation, stage, weather, career, audio, and
replay modules as local evidence of approaches that already work in a static rally game.
Reuse ideas and measured lessons where they fit, but do not transplant OpusRally wholesale,
inherit its product structure by default, or make Cairn Run a reskin. Cairn Run's current
handling, authored-stage character, renderer, controls, and test evidence remain the starting
point. Resolve any conflict in favour of the smallest coherent Cairn Run design.

## Player promise

The finished game should deliver all of these together:

- a quick rally mode for immediate one-stage play;
- a six-event world championship with persistent position, damage, service choices, and
  a clear final result;
- at least six substantial original stages across visibly and mechanically different
  regions, with Kestrel Ridge counting as one only if it receives the same championship,
  weather, and presentation treatment as the new stages;
- at least six fictional rally cars spanning distinct eras and drive layouts, with honest
  strengths, weaknesses, engine character, gearing, mass, wheelbase, suspension, grip,
  durability, and difficulty—not cosmetic stat bars over one shared car;
- excellent keyboard and gamepad driving, with remappable controls and assists that help
  newcomers without flattening the simulation;
- convincing loose-surface and tarmac dynamics, readable weight transfer, recoverable
  slides, jumps, ruts and bumps, surface transitions, collision, damage, and meaningful
  setup choices;
- a co-driver who is timely, intelligible, and trustworthy at different speeds;
- rich original sound: distinct engines and transmissions, turbo/intake character where
  appropriate, tyre and road noise by surface, suspension and underbody impacts, gravel,
  water, wind, collisions, crowds, weather, menu feedback, and pace-note speech;
- scenery with a strong sense of place, route identity, weather, depth, landmarks, and
  speed, while keeping the road legible and performance stable;
- a cohesive late-1990s rally atmosphere expressed through original visual design rather
  than imitation menus or copied branding.

## World tour

Create at least six original regions. Each needs a distinct palette, road material,
geometry language, landmark set, hazard profile, weather/lighting state, pace rhythm, and
driving strategy. Use this suggested spread unless playtesting proves a better one:

1. **Kestrel Ridge, Scotland** — damp gravel, stone walls, moorland, pine and birch,
   compressions, crests, fog banks, and the existing bridge landmark.
2. **Aurora Forest, Finland** — very fast compact gravel, long crests, jumps, lakes,
   dense conifers, narrow sightlines, and severe consequences for misplaced commitment.
3. **Rift Valley Run, Kenya** — rough dry gravel, dust, rock shelves, washboard, water
   splashes, open savannah, heat haze, wildlife kept safely beyond the course, and car
   preservation as a competitive skill.
4. **Kurotake Pass, Japan** — narrow wet mountain tarmac, retaining walls, tunnels,
   hairpins, autumn forest, changing grip under trees, and night or dusk rain.
5. **Costa Brava Heights, Spain** — dry abrasive tarmac, rapid camber changes, cliffs,
   villages, bright sun, crowds in safe authored locations, and linked technical bends.
6. **Wattle Creek, Australia** — loose red gravel, eucalyptus forest, cattle grids,
   dust, high-speed direction changes, rough verges, and a late-stage storm option.

No region may be a palette swap. Stage identity must survive a grayscale screenshot and a
silent drive: geometry, silhouettes, landmarks, road rhythm, and handling should still
distinguish it. Routes must feel authored, not like repeated sine waves. Give each stage a
recognisable opening, two or three signature sequences, a difficulty arc, and a finish run.
Use route variants or reverse configurations only after every primary route is complete and
well tested; they do not count toward the six-region minimum.

## Car roster

Create at least six fictional cars with original names and recognisable, non-infringing
low-poly bodies. The roster must include:

- a forgiving modern all-wheel-drive turbo car;
- a short-wheelbase, lively all-wheel-drive car;
- a lightweight front-wheel-drive car that rewards momentum;
- a classic rear-wheel-drive car that demands throttle discipline;
- a heavier, stable high-speed all-wheel-drive car;
- an expert car with high performance and a narrow operating window.

Model the differences at the simulation layer. Each car needs data-driven mass, inertia,
wheelbase and track, driven wheels, torque and power curves, gearing and final drive,
brakes, steering, tyre/grip behaviour, suspension travel/damping, ride height, aero drag,
damage tolerance, and assists compatibility. Build a garage comparison that explains
trade-offs without reducing the choice to a single overall score. Avoid unlock grind:
make the full roster available in quick rally and use championship progress for challenge,
records, and presentation rather than withholding the fun.

## Vehicle dynamics

Keep the fixed-step deterministic core and deepen it carefully. The car must be learnable,
responsive, and expressive before it is merely complicated. At minimum, model and verify:

- per-axle or per-wheel normal load and load-sensitive grip;
- longitudinal/lateral tyre-force competition rather than independent unlimited forces;
- front-, rear-, and all-wheel drive with distinct power-on behaviour;
- engine torque curve, gearing, automatic and optional manual shifting, engine braking,
  clutch/shift interruption, and believable speed ranges;
- braking balance, handbrake effect, weight transfer, countersteer, lift-off rotation, and
  progressive steering that remains correct in reverse;
- surface-specific friction, rolling resistance, sink/roughness, particle/audio response,
  and transitions among tarmac, compact gravel, loose gravel, mud, water, snow or ice where
  a region calls for them;
- suspension travel, spring/damper response, road-profile input, bottoming, airborne state,
  landing impulse, body pitch/roll, and loss of tyre authority in the air;
- tyre choice and a small number of comprehensible setup decisions whose effects are real;
- component damage with bounded, diagnosable consequences and championship carry-over;
- collision impulses against everything that looks solid, safe recovery, no wall-riding
  exploit, and no low-speed contact damage ratchet;
- optional assists—automatic gears, stability help, braking help, pace-note display—with
  clear settings and no hidden advantage in competitive timing.

Do not mistake instability for realism. Establish invariants and units in the pure
simulation core. Use deterministic tests, parameter sweeps, telemetry, and differential
measurements. Tune only after the model behaves correctly. A car should not gain energy
from braking, handbrake, terrain contact, damage, collisions, or numerical drift.

## Competition and progression

Add quick rally, practice/time trial, and a six-event championship. A championship event
may use one long stage or several timed legs if content and performance support it, but the
complete run must fit a browser session and save safely between stages.

Championship rules must include:

- seeded AI or benchmark rivals whose times respond consistently to difficulty, surface,
  weather, and car class without simulating invisible cars with fake physics;
- stage and overall standings, interval to leaders, split comparisons, penalties, retirements,
  and an understandable points table;
- persistent but bounded damage, a service area with constrained repair time, tyre choice,
  and a small set of meaningful setup adjustments;
- versioned save data, migration from the existing local-best format where needed, safe
  reset, and graceful recovery from corrupt storage;
- pause, restart, abandon, and retry semantics that cannot corrupt standings or duplicate a
  result;
- fair difficulty choices and assists, with no rubber-banding hidden from the player.

The title flow should reach a driving stage within three deliberate actions. First launch
must teach controls without a mandatory lecture. Menus must work entirely by keyboard and
gamepad, expose focused elements clearly, and remain usable at 390×844, 768×1024, and
desktop 16:9 without sideways scrolling or controls hidden by the Almanac pill.

## Visual direction and scenery

Extend the local WebGL2 renderer instead of trading the working game for an opaque engine.
Stay stylised and original, but raise the finish substantially through composition,
lighting, animation, materials, weather, and regional art direction.

Build data-driven regional scenery kits with terrain, vegetation, rocks, roadside furniture,
buildings, spectators, marshal posts, timing gates, water, tunnels, bridges, walls, fencing,
signs, surface decals, skid marks, dust, spray, snow/mud effects, and distant silhouettes as
appropriate. Use instancing, chunking, level of detail, pooled effects, culling, fog, and
bounded device pixel ratio. Every visible collision hazard must agree with the physics.
Crowds must remain behind safe barriers and never stand on a plausible crash line.

Weather and time of day must alter more than colour grading. They should affect visibility,
surface grip, spray/dust, reflections or highlights, pace-note lead where justified, tyre
choice, and audio, while preserving enough contrast to drive by. Include high-quality and
low-quality presets that change cost rather than rules.

Use only original or clearly licensed local assets. Record every third-party asset's source,
licence, and transformation. Prefer procedural or purpose-made assets. Do not add runtime
network calls, trackers, CDN dependencies, or remote fonts.

## Sound direction

Treat sound as a primary control channel. Each car must communicate revs, load, shifting,
traction loss, surface, impacts, and damage without looking at the HUD. Prefer original
recordings, generated local assets, and Web Audio synthesis/layering. Avoid one oscillator
with a pitch multiplier masquerading as six engines.

Build and test:

- per-car engine layers across RPM and load with seamless crossfades and no clicks;
- intake/turbo, transmission, exhaust transient, limiter, shift, overrun, and starter cues
  where the car design calls for them;
- tyre scrub, gravel strike, mud, water, snow, grass, underbody, suspension, landing,
  collision, wind, and damage sounds driven by real simulation state;
- spatial roadside ambience, crowds, weather, tunnels, bridges, and environmental reverb or
  filtering where useful;
- complete, original co-driver calls for every stage in local MP3 and Ogg, with queueing,
  interruption, stale-call recovery, configurable volume, and captions;
- mute and separate effects/voice controls, sensible loudness, no clipping, no painful
  repetition, and browser-autoplay-safe startup.

Music is optional. If included, it must be original or clearly licensed, menu-only by
default, locally packaged, and independently adjustable. Engine and pace-note clarity take
priority.

## Architecture and data

Before expanding content, define stable data contracts for cars, stages, regions, weather,
pace notes, championship events, rivals, tuning, results, and saves. Keep deterministic
simulation and race rules free of the DOM and WebGL so Node tests and batch simulations can
exercise them cheaply. Keep rendering and audio as consumers of authoritative state.

Split files when ownership or testability demands it; do not create generic abstraction for
its own sake. Avoid a single enormous stage file, world switch statement, or car class full
of identity checks. Validate authored content at load/test time: route continuity and exact
endpoints, feature coverage, collider/scenery agreement, legal pace-note ordering, valid car
parameters, local asset existence, championship reachability, and save-schema compatibility.

Keep performance instrumentation visible in a QA mode: fixed-step cost, render CPU, GPU
timer where available, frame p95, draw calls, triangles, particles, backing resolution,
load time, heap where available, audio voices, and recovery/contact counts.

## Gauntlet method

Work autonomously from a clean task worktree. First run and understand the existing game,
tests, simulation, browser smoke, screenshots, and review record. Preserve a green baseline.
Then execute the following loop; do not leap straight to content volume:

1. **Benchmark.** Turn every subjective word in this prompt—impressive, convincing,
   distinct, readable, fast, awesome—into an observable target, while keeping explicit
   human-judgement boundaries where automation cannot settle taste.
2. **Design the seams.** Specify the smallest data and state changes that support the full
   roster, world tour, championship, audio, saves, and QA without discarding the current
   implementation. Resolve load-bearing ambiguity before broad edits.
3. **Build a vertical slice.** Add one genuinely different car and one genuinely different
   region through the complete quick-rally and championship flow. Make physics, scenery,
   sound, UI, persistence, simulation, and browser checks work end to end.
4. **Attack it.** Use separate physics, stage-design, camera, graphics/performance, audio,
   input/accessibility, persistence, competition, and first-time-player critics. Each critic
   must identify the single largest evidenced weakness, not produce a style wishlist.
5. **Improve and regress.** Reproduce the weakness, write a failing check where machines can
   judge it, fix the right layer, observe green, and record the evidence. A new test must be
   seen failing once before its fix is accepted.
6. **Scale through data.** Only after the vertical slice is cohesive, add the rest of the
   roster and regions. Re-run specialist breakers as each category grows.
7. **Balance statistically.** Run deterministic batches across cars, stages, weather, rival
   levels, damage states, and championships. Look for impossible finishes, dominant cars,
   route exploits, biased start states, runaway damage, recovery abuse, and numerical drift.
8. **Review the real browser.** Drive every shell and unusual state with real hit-testing,
   audio enabled, gamepad and keyboard, resize/high-DPI/quality changes, interrupted saves,
   and a cold cache. Capture representative screenshots from every region and car class.
9. **Final hostile pass.** Ask what still most clearly reveals a hobby project. Fix ranked,
   reproduced issues until remaining gaps are honestly validation boundaries, not missing
   core systems.

Keep `cairn-run-rally/docs/GAUNTLET_LOG.md` as the concise evidence trail: benchmark,
critic, reproduction, change, regression, measurements, and remaining boundary. Do not use
it as a diary or declare quality based on effort.

## Acceptance gates

The build is not complete until all of these are demonstrated:

- six original, materially different regions and six mechanically different cars are
  selectable and completable;
- quick rally, practice/time trial, and a complete saved championship work end to end;
- every car/stage pairing completes under a deterministic reference driver or is explicitly
  and defensibly excluded, with no NaN, runaway state, false finish, stuck recovery, or
  unbounded damage;
- physics tests cover energy/sign invariants, drive layouts, gears, combined grip, surfaces,
  suspension/airborne behaviour, collisions, reverse steering, assists, damage, and recovery;
- content tests cover route geometry, authored feature variety, colliders, pace notes, assets,
  car data, weather, championship graph, rivals, and save migration;
- browser tests cover title-to-stage flow, every mode, menus, keyboard, gamepad disconnect and
  reconnect, remapping, pause/restart/abandon, service, results, championship resume, corrupt
  save handling, resize, high DPI, quality fallback, audio startup, and runtime errors;
- all pages pass the Almanac responsive overflow and pill-collision suite;
- representative screenshots make every region recognisable, show all important shells, and
  reveal no road-obscuring HUD, broken geometry, floating scenery, unsafe crowds, or obvious
  repetition near the player;
- no runtime network request is required, every asset is accounted for, and first load fails
  gracefully if WebGL2 or audio is unavailable;
- a representative hardware run—not SwiftShader—is measured at 1920×1080. Target 60 fps on
  an integrated laptop GPU at the default preset, with frame p95 at or below 20 ms, no growing
  heap/audio-voice count over a championship, and a lower preset that stays responsive on
  weaker hardware. Report actual measurements honestly if the target is missed;
- a first-time human can start unaided, understand the co-driver, finish an easy stage, recover
  from one mistake, and explain why two cars or surfaces feel different;
- all focused tests, the complete Cairn Run QA command, the root Almanac build, and the exact
  integration gate pass with no new warnings or concealed skips.

## Delivery discipline

Commit in small green units. Preserve existing public behaviour unless this prompt explicitly
changes it. Do not weaken tests, hide failures, invent performance claims, or confuse an
autopilot finish with proof that the game is fun. Keep generated scratch in the OS temp area;
do not commit review captures unless they are selected evidence. Update the README, controls,
licences, architecture notes, and screenshots to describe the finished game accurately.

Stop only when the complete experience meets the acceptance gates, an architectural choice
requires Arthur, or a real external blocker remains. At handoff, lead with what a player can
now do, give the exact validation evidence and known limits, and leave the branch clean and
ready for the repository's normal integration path.
