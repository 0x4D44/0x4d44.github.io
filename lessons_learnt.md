# Lessons learnt

<!-- lessons-format: index-v1 -->
<!-- Each entry's FIRST line is a self-contained nugget: surprise + fix + file:symbol
pointer, <=~120 chars, plain text (no backticks). Indented continuation lines are detail —
kept here for lookup but NOT injected by the mdminder SessionStart hook (it injects the
nugget lines only). Add new lessons at the TOP (newest-first). NEVER drop a lesson to make
room - always prepend. Aim for ~25 entries; past ~40 say it is due a prune rather than
pruning unasked, since /prune-lessons-learnt is a separate human-invoked pass. The hook
injects only the newest 30 nuggets (or 4 KiB), so entries past that stay here for lookup
and cost a session nothing. Durable project facts belong in CLAUDE.md (repo) or
~/.claude/CLAUDE.md (global), not here. -->

- 2026-10-31 - A stop or turn key overshoots on splineZ: pre-aim the key before it (plan-to-build/index.html:splineZ)
  splineZ takes each interior tangent as the centred difference of its neighbours, so a key whose neighbours lie on one side of it still
  carries a slope. The door approach keyed on the door axis swayed 166 mm across it and dipped 49 mm; the study hold swung 4.7 deg past
  its heading and whipped back. Key the dive from beside and above the door (6.4: 15300, 5000, 1.85) so the path lands on the axis with
  the slope near zero, and measure min/max of every channel after a re-key (scratchpad approach2.mjs idea: replay splineZ on the keys).

- 2026-10-31 - Lights switched on in one frame pop: ramp intensity from 0 (plan-to-build/index.html:build3Construction)
  A light counts in every lit material's shader only while it is visible, so the first draft that showed the 10 ceiling lamps at the hand-off
  popped over the still-open building. The lamps are made hidden, shown when the ramp starts (Z+0.8) and brought 0 -> 5.5 with the roof
  closing; warm3D draws every 2 s up to T_END, so the lights-on variant is compiled before the first play (first draw max 10 ms).

- 2026-10-31 - Walk camera near plane must follow the distance to the building (plan-to-build/index.html:render3D)
  A fixed near plane either cuts into the 1.6 m eye in a room (needs 0.05) or z-fights the 2 mm clearances (column pad, frame clear) seen
  from 25 m (needs 1). near = clamp(0.0016 dc^2, 0.05, 1) and far = 2 dc + 90, dc = eye distance from the plan centre: equal to the orbit's
  0.04 * distance at the hand-off, so nothing changes at t = Z.

- 2026-10-31 - Unwrap walk headings before splining or a 360 wrap spins the camera (plan-to-build/index.html:film3D wk)
  splineZ interpolates every channel as a plain number. wk() keeps the previous heading and takes the equivalent angle within 180 deg of it
  (turn()), so a pan is the short way round and steady. The first key is the orbit's heading 90 + az; az runs to 516 deg, so the walk starts
  at 606 deg, which is harmless: only differences matter.

- 2026-10-29 - Windows serves any path case, Pages does not: check exact-case paths (la-ladera/tests/live-paths.mjs)
  A request for /la-ladera/Assets/textures/asphalt.jpg is answered 200 by the local dev server (self-test of the tool) and would 404 on GitHub
  Pages (Linux). live-paths.test.mjs scans imports, import map, index.html, css url() and manifests against directory listings with exact case;
  live-paths.mjs boots the page, walks it, and checks every URL the page really requested (dynamic strings, GLB-internal textures).

- 2026-10-29 - Headless rAF ticks at 17.6 ms on an EMPTY page, so gate frames relative to it (la-ladera/tests/metrics.mjs)
  The "median frame <= 16.7 ms" gate failed every view at 17.5-17.7 ms whatever the load (616-791 draw calls, 1.3 M triangles,
  uncapped render 6-10 ms): a blank data: page in the same harness (below-normal priority, compositor-timed rAF) also reads 17.6.
  metrics.mjs now measures that baseline first, allows baseline + 1 ms, and gates the real work separately (gl.finish cost <= 12 ms).
  Both gates were tightened on purpose once (--cost-gate 1 --frame-slack -20) to prove they still fail.

- 2026-10-29 - Headless Chrome still locks the real mouse and speaks aloud; shim both (la-ladera/tests/quiet-init.js)
  Reported by the box coordinator: headless=new honours requestPointerLock (a CDP click is a user gesture) and Windows then
  ClipCursor()s the person's REAL cursor into the invisible 1280x720 window. Speech goes to the OS voice, which --mute-audio is
  not expected to silence (from Chromium's design, not measured). chrome.mjs injects quiet-init.js before any page script:
  page-only twins with the same events and promises, spoken lines kept in window.__quiet.spoken. Never reproduced live.

- 2026-10-29 - Chromium re-sets its own priorities; lower every pid from SystemInfo.getProcessInfo (la-ladera/tests/chrome.mjs:launch)
  Inheriting below-normal from the Node parent only reached the browser, crashpad and utility processes: the GPU process
  came up AboveNormal and the foreground renderers Normal. Measured with os.getPriority(pid); the timer + post-navigation
  re-apply keeps new renderers low. A priority that is already lower (background renderers: idle) is never raised.

- 2026-10-29 - Pipe child stdio when hiding windows; libuv sets CREATE_NO_WINDOW only if no stdio is inherited (la-ladera/tools/nice.mjs)
  From libuv's uv_spawn as I remember it (not re-verified here): with stdio:'inherit' a console child can open a visible
  window when its parent has no console (detached, or started by a service). Piped or ignored stdio plus windowsHide is safe.
  A window watcher (EnumWindows every 120 ms) is the way to find who pops windows; process lists miss short-lived ones.

- 2026-10-29 - Codex-made swatches can show centre-cross seams; tile 2x2 before accepting (la-ladera/tools/textures/post.py)
  Fabric prompts also came back as corrugated metal (fabric_woven). Contact-sheet every batch and diff suspicious pairs
  against their siblings before a texture ships.

- 2026-10-29 - Kill the headless Chrome tree by pid (taskkill /T /F), never by name (la-ladera/tests/chrome.mjs:killTree)
  The user's real Chrome runs on the same box and other agents leave orphan --user-data-dir profiles under H:/temp.
  Only the root we spawned (and its children) may be killed; every exit path goes through killTree.

- 2026-10-29 - BFS nodes must keep real positions; grid snapping fakes traps at ramps (la-ladera/tests/stuck-lib.mjs:analyze)
  The first probe snapped nodes to cell centres and reported a trap at a stair edge: the snapped point lay inside the
  ramp footprint, where nobody can stand. Nodes now keep the post-move position and dedupe on cell + 0.35 m height.

- 2026-10-29 - Wall colliders are capsules: a door gap g needs g - 2t >= 0.62 (la-ladera/js/core/physics.js:addWall)
  The cap at a wall end has radius t. t=0.06 -> g >= 0.8, t=0.1 -> 0.85, t=0.12-0.15 -> 0.9-0.95. The rounded caps funnel
  an off-centre walker (measured: +-0.4 m still passes). Same rule for furniture blockers beside a door.

- 2026-10-29 - Open MessagePort hangs node --test; unref it unless a tick is pending (la-ladera/js/core/util.js:tick)
  tick() yields through a MessageChannel because browsers throttle timers. Under Node the open port kept the process
  alive for ever (smoke.data.test.mjs exited 124). Browsers have no unref, so the call is optional-chained.

- 2026-10-29 - python -I hides user-site PIL/numpy on this box; use plain python (la-ladera/tools/textures/post.py)
  Python 3.13 here has PIL and numpy only in the user site-packages. The isolated flag drops it and the import fails.

- 2026-10-29 - Paint cut-off 245 mm = frame outer face; move both together (plan-to-build/index.html:paintWall)
  paintWall lines every reveal white, but the block beyond a window frame (the outer 55 mm of the 300 mm wall) is seen from
  outside and must stay as built. It returns when the point 7 cm in front of the face is more than .245 m from the nearest room
  rectangle: windowGroup puts the frame 40 mm outward of the wall mid-line and .11 deep, so its outer face is 245 mm from the room.
  Change the frame's depth or offset (windowGroup, doorGroups) and this number must move with it; the paint check's outer-reveal
  probe (painting on against off, over a quad on the jamb beyond the frame) fails if they drift apart.

- 2026-10-29 - Frames as wide as their opening z-fight the reveal: trim 4 mm (plan-to-build/index.html:windowGroup)
  A window or door frame exactly as wide as its opening has side faces in the plane of the block reveals. pvc and doorE are
  double-sided (the section plane clips them), so through the cut the frame's back face fights the wall: 8 to 11 % of a 1:1 jamb
  crop shimmered from frame to frame with the sun's shadow on or off (so not shadow acne), and 0.1 % after FRAME_CLEAR (2 mm a
  side). The coplanar-face scan skipped RoundedBoxGeometry, which frames use: include it, and count back-to-back (opposed) pairs
  when one of the two is double-sided. Measure shimmer as the second temporal difference while the camera creeps 0.03 deg a frame.

- 2026-10-29 - Flush solids z-fight: make a column 2 mm bigger than its wall face (plan-to-build/index.html:growBox)
  A 400 mm column whose outer face lay exactly in the plane of the 300 mm wall face drew a checkerboard of the two surfaces: 18
  same-side coplanar face pairs among block, insulation and concrete (up to 1.1 m2 each). pad: 0.004 makes the column 2 mm proud.
  While the section plane cuts, lip: 0.001 keeps its cut top 1 mm above the walls' cut tops. camera.near follows the camera
  distance (update3D: dist*0.04), so 1 mm is many depth steps. Find these by listing the same-side overlapping coplanar faces of
  the axis-aligned boxes under G3.root (ignore downward faces and slivers under 5 mm); the page keeps G3 module-private, so serve a
  copy with one extra getter on window.__tl.

- 2026-10-29 - Float sort key residue: o + ord*0.01 lost creation order (plan-to-build/index.html:sortElements)
  The key o + ord*0.01 compared unequal for equal inputs, creation order was lost and the living-room rug was drawn over the sofa
  and the coffee table. Integer keys (o*1000 + ord*10) with the creation index as the tie-break fix it. Rugs get their own slot
  (-5) below the other furniture: a rug created last (the corridor one) otherwise covers the console and the shoe cabinet.
  Chairs get one too (-2): each is pushed 25 mm under its table or desk, and with the new key a chair created after its table
  was drawn over the table's edge (the review caught it; the order check now looks at the edge pixels).

- 2026-10-29 - Cut a solid by shortening it, not with a clip plane (plan-to-build/index.html:growBox, dropBox)
  A clipping plane at 1.3 m gave hard-aliased cut edges and exposed the back faces of block, insulation and concrete, which fought
  the faces behind them. growBox and dropBox now shorten the box to CUTU.value - base, so the cut face is a real polygon that MSAA
  smooths like any edge; a top face at exactly the cut height is drawn flat in the poche colour (patchMat cap). Only the thin window
  and door parts keep a clipping plane (CUT_PLAIN). Take fwidth from a continuous coordinate: u = x + row*offset jumps at every
  course and spikes the footprint, which made the mortar lines shimmer.

- 2026-10-29 - Seek and read state in ONE eval: the page warms shaders in idle slices (plan-to-build/index.html:warm3D)
  After __ready the warm-up keeps drawing other frames in idle slices. at(t) in one CDP call and a read of PAINTU in the next
  returned another frame's values (a progress for t=46 s after a seek to 54 s), and a progress test failed three ways for no reason.
  Do the seek and the read inside one evaluated function. window.__tl.png(t, w) is safe: it renders at call time.

- 2026-10-29 - Decode exported frames by number: ffmpeg -ss gives frame i+1 at times (plan-to-build/index.html:expPass)
  A one-frame decode with -ss (i+0.5)/60 -frames:v 1 returned frame i+1 for some i and frame i for others (rounding). It read as
  22 dB on fast camera moves and as a pass on slow ones, so a good MP4 looked broken. Decode by number instead: -vf
  select='eq(n\,i)' -fps_mode passthrough, and assert PSNR against t=i/60 beats PSNR against t=(i-1)/60 and t=(i+1)/60.

- 2026-10-29 - First draw of each 3D part stalls up to 0.9 s: warm it in idle slices (plan-to-build/index.html:warm3D)
  three.js compiles shaders and uploads buffers the first time an object is drawn: 165-906 ms against 3 ms warm, ten times in
  the film, 381 ms right at the 2D to 3D handoff. renderer.compile() misses the clipped variants, so render the 3D half at 2 s
  steps in setTimeout slices once buildScene3D is done (not while exporting). Load three with import() in the background
  (G3.loading): a top-level await made the whole page wait for four serial fetches before the first frame.

- 2026-10-29 - A button that doubles as Cancel needs a start guard and a blur (plan-to-build/index.html:initExport)
  Render shrinks to Cancel on the first click, so a double-click's second click lands on it and aborts the run, and Space on the
  still-focused button does the same. Ignore clicks with detail > 1 or within 0.9 s of the start, and blur after a mouse click.
  In a trusted-click test aim at the button's right-hand part: it is the part still under the pointer once the label shrinks.

- 2026-10-29 - Clipped solids look hollow: use DoubleSide and a flat back-face cap (plan-to-build/index.html:patchMat)
  With renderer.localClippingEnabled and a THREE.Plane in material.clippingPlanes, a cut wall is an open shell and you see
  its back faces. Render the material DoubleSide, set clipShadows, and in the patched shader write a flat cap colour when
  !gl_FrontFacing (injected before dithering_fragment). Glass stays FrontSide. Lowering the plane over time (cutAt) then
  reads as a live section plane with solid caps.

- 2026-10-29 - 1440p60 H.264 needs L5.2, not L4.2: probe a codec list (plan-to-build/index.html:EXP_CODECS)
  VideoEncoder.isConfigSupported at 2560x1440 and 60 fps rejected level 4.2. Try High L5.2, High L5.1, Main L5.2, Baseline L5.2 (the only
  profile some software encoders offer: inference, untested here), then VP9 and AV1, hardware first and software second, and move to the next plan only if an encoder dies before its first chunk.
  Configure H.264 with avc:{format:'avc'} so the chunks suit mp4-muxer. Headless Chrome 155 rejected every prefer-hardware
  config here and encoded in software at 33-67 fps.

- 2026-10-29 - three r186 dropped PCFSoftShadowMap; use PCFShadowMap (plan-to-build/index.html:buildScene3D)
  Setting renderer.shadowMap.type = THREE.PCFSoftShadowMap logs "PCFSoftShadowMap has been removed. Using PCFShadowMap
  instead." Set THREE.PCFShadowMap directly.

- 2026-10-31 - Bulk key-bot sweeps pinned the CPU at 100 percent; cap at 12 processes, idle priority (keybot-node.mjs)
  60 below-normal node sweeps filled a 28-thread box. Run sweeps with SKY_PRIORITY=idle and a runner that keeps at most 12 busy. Also
  sweep from a copy of the tree: a worker editing src/race mid-sweep produced respawn storms and three invalid sweeps.

- 2026-10-31 - The brain's airbrake costs a guided craft 27 s a race; a key bot must not copy it (keybot-node.mjs:CFG.assist)
  Decomposed on 8 races per variant: no airbrake 206 s, everything on 233 s, hands 217 s. Boost is worth only about 6.7 s a race. A bot
  that copies every AI-brain button measures the brain's braking, not a person.

- 2026-10-31 - Hands-off beat steering because the rubber band and guide helped an idle craft (race/race.js:speedMulFor)
  A keybot tap pilot finished last on Normal while a craft with no key finished 1st or 2nd. The guide now keeps a share of authority under
  held keys, and idleCruise slows a craft after 8-14 s without a key. Tune with keybot-node.mjs modes tap, track, hands, assist, 16+ races per cell.

- 2026-10-31 - A per-axis guide hand-back fought a held bank key; use one fade from the larger key (flight/guide.js:blend)
  Holding D alone left the pitch axis idle, so the guide pushed the nose out of the bank and the turn was a quarter of the guide-off turn.
  A test that holds roll and pitch together cannot see it: test each key alone.

- 2026-10-31 - A hazard edge at the avoid margin made the guide chatter and left the line (flight/guide.js:blend avoid margin)
  A sphere hazard 28 m off the line, margin 34 m, flipped the avoid target every few steps (roll -0.5, +0.9, -1.0). Margin 14 to 6 fixed the
  Falcon; Sprite and Bulldog on sunrise still hit it. A continuous push scaled by miss distance is the real fix (see scratchpad.md).

- 2026-10-30 - Page.waitFor never resolves on an object result: wrap the expression in !!(...) (tests/tools/chrome.mjs:Page.waitFor)
  eval() uses returnByValue, so an expression that yields a class instance throws on serialisation, the helper swallows it and retries until
  the timeout. A 60 s waitFor timeout on a page that loaded fine means this, not a slow page.

- 2026-10-30 - A grid slot 5 m over the ground put a Falcon 1.4 m over the Sunrise deck, so any sink hit it (race/race.js:buildGrid)
  Craft radius is 2.75-3.6 m, so 5 m above the ground is not clearance. buildGrid now lifts every racer to ground-or-deck + radius +
  RACE.gridClearance (8 m), and the keyboard guide refuses to descend when its own track clears the ground by less than GUIDE.groundMargin.

- 2026-10-30 - A held module request keeps the load event from firing; use a raw Page.navigate (core.test.mjs:withPage raw)
  A harness Page.goto that waits for load never returns while a module request is held. Fetch.enable with a URL pattern holds matching
  requests until Fetch.continueRequest, which is how the "module never arrives" overlay is tested: navigate raw, then poll for the card.

- 2026-10-30 - localStorage is shared by every tab of one Chrome profile and a closing tab commits late (core.test.mjs:withPage)
  Clear it per tab in an init script (Page.addScriptToEvaluateOnNewDocument) before the first navigation.

- 2026-10-30 - QUALITY[name] accepts inherited names such as constructor; look presets up with Object.hasOwn (config.js:resolveQualityId)
  Any object used as a lookup table keyed by a user-supplied string (URL parameter, saved setting) needs Object.hasOwn or a Map in front of it.

- 2026-10-30 - Windows node --import with an absolute path needs a file:// URL (pathToFileURL(path).href)
  Tools that build the --import argument from a scratch folder must convert it; the relative ./skyblitz/tests/register.mjs form is fine.

- 2026-10-30 - Three's PMREM shader spams X4122/X3595 warnings; compile it once at boot, muted (craft/post.js:warmPmrem)
  The warnings come from PMREMGGXConvolution (PMREMGenerator.fromScene, reached from world/sky.js:78), not from our shaders. warmPmrem()
  compiles it first through quietShaderWarnings (craft/env.js), so sky.js stays quiet only by that ordering; the V-35 test in core.test.mjs
  fails on any program info log or console warning. Wrap any new PMREM call site in quietShaderWarnings.

- 2026-10-30 - A regression test resting on a chaotic whole-race scenario survived its own mutation (race.test.mjs:R1-4)
  The first column-flank test depended on where a bot happened to fly; flankSlope: 1e9 left it green. The fix was a deterministic
  stub-based unit case plus a control case that must NOT slide. Break every new test once before trusting it, and do not expect a whole
  race to discriminate a single threshold.

- 2026-10-29 - Headless Chrome still pointer-locks and clips the real mouse; stub it (chrome.mjs:NO_DESKTOP_GRABS)
  A Skyblitz test browser confined the user's real mouse (ClipCursor) even with --headless=new. Inject a stub for requestPointerLock,
  exitPointerLock, pointerLockElement and requestFullscreen with Page.addScriptToEvaluateOnNewDocument before the first navigation, and keep
  game code free of pointer lock (validate-static.mjs fails if src mentions it). Also spawn Chrome with windowsHide and lower the priority of
  the whole tree: Chrome re-prices its GPU (AboveNormal) and renderer (Normal) children, so launchChrome re-lowers them every 2 s from the
  CDP SystemInfo.getProcessInfo list.

- 2026-10-29 - process.kill(-pid) is POSIX only; on Windows it leaked Chrome trees (responsive.test.mjs:taskkill)
  Use taskkill /PID n /T /F with windowsHide:true on win32. Leaked trees kept running (and kept their responsive-* profile dirs) after the suite.

- 2026-10-29 - display:grid in a media query beat [hidden] and drew a menu over the race (style.css:.scr[hidden])
  The podium screen's grid rule out-ranked .scr[hidden], so the "Grand Prix complete" panel covered every race frame. DOM tests did not
  notice; screenshots from a keyboard-bot race did. Fix: .scr[hidden], #ui [hidden] { display: none !important }; ui-nav.test.mjs now asserts
  that no menu screen is drawn during a race.

- 2026-10-29 - Nearest-point projection flips racers between shortcut and main line (layout.js:project)
  Needs hysteresis: a racer already on a branch keeps it while its lateral error is under ~2.2 corridor widths and the main path is not much
  nearer; race/progress.js caps the credit at a branch entry to 40 m a step and repays the rest. Only some seeds showed it (sunrise seed 1 and
  neon seed 1 had 31-40 progress glitches, seeds 7 and 11 had none), so sweep several seeds before calling a course clean.

- 2026-10-29 - Full-depth ejection from a column field threw a racer 85 m onto a roof (collision.js:environment)
  A deep overlap (over 8 m) is the flank of a column: slide the racer out sideways a few metres a step and count a normal ground crash. A racer
  that rides a wall or rooftop for 3.5 s is respawned (RACE.respawnScrapeT). Tests: "column flank" and "scrape respawn" in race.test.mjs.

- 2026-10-29 - Double-tap A/D barrel roll fired 64 times a lap by accident; now a setting (config.js:doubleTapRoll)
  Found by flying the real game with tests/tools/keybot.mjs (real key events, closed-loop key controller). The first bot ran on wall-clock time
  and open-loop timing, which confounded reaction delay with the 0.22 s double-tap window: step the sim and make performance.now follow sim time.

- 2026-10-29 - three r186 has no PCFSoftShadowMap and its shader link check stalls loading (game.js:Game)
  Use PCFShadowMap and set renderer.debug.checkShaderErrors off for players (on for ?debug and tests); validate-static.mjs asserts it.

- 2026-10-29 - Pages is case-sensitive, Windows is not: check asset case (validate-static.mjs:existsExact)
  A wrong-case import or texture name loads fine on the dev box and 404s on GitHub Pages; the static check walks the directory listing byte for byte.

- 2026-08-27 - Keep career and physical stage IDs separate across the simulator adapter (championship.js:championshipChoice)
  OxAlphaRally's career schedules 51 stages while the renderer owns 12 playable roads.
  A stable surface-aware mapping lets career.js remain authoritative for results, saves,
  service and standings while game.js builds a deterministic physical road for the drive.

- 2026-08-26 - After countdown evidence, restart the browser; reload can retain stalled GL (tests/shoot.mjs:main)
  OxAlphaRally's isolated gravel capture passed, but the full corpus stalled twice after
  photographing the start-line countdown. Reloading the app still stalled. Closing the
  capture harness and opening a fresh browser made the exact two-shot sequence pass while
  leaving the deliberately stateful jump-to-landing pair in one process.

- 2026-08-25 - Bloom invents clipping the scene never had; test with bloom off before hunting geometry (render.js:BRIGHT_FRAG)
  OpusRally showed white discs that came and went on distant hillsides. With the
  bloom weight set to 0 the scene produced ZERO near-white pixels there over 180
  frames; with it on, a 251x9 px sliver of road 1113 m away smeared into a 56 px
  disc whose every pixel clipped to 255. The scene was never blown - the blur
  manufactured the white. A single-tap bright pass passes an outlier through
  unbounded, so the fix is a Karis average (weight each tap 1/(1+luma)) in the
  prefilter: extent, not magnitude, separates an aliased fragment from a real light
  source. A flat brightness ceiling cannot do it - the sun's bloom source is orders
  of magnitude hotter than the artefact, so every ceiling between 6 and 30 gave
  byte-identical output.

- 2026-08-25 - Bisect a transient render artefact by redrawing the SAME frame with dt=0 and the game's own args (render.js:update)
  An artefact firing on 3 frames in 130 cannot be bisected by hiding a group and
  comparing the next screenshot - every result is inside the noise, and successive
  runs "proved" dust, debris, marks and scenery guilty in turn. Wait until it is on
  screen, then hide one group and re-render that same frame with dt = 0. The control
  is the whole test: the first version passed alpha = 1 instead of the physics
  interpolation factor the game had just used, which moved the camera by centimetres
  and erased the artefact on its own, making every group look guilty. Wrap
  renderer.update to capture its exact argument object and reuse it, then verify the
  control redraw reproduces the artefact before believing any difference.

- Audit a defect list against the code BEFORE fixing it: 10 of opus-rally's 13 OUTSTANDING
  items were already fixed in the OxAlphaRally seed; only live verification (a probe script
  plus test-name greps) told which 3 needed work. Reading a symbol is not verifying it —
  stage.js:1753's `a` looked like the lateral-only bug and was already the fix.
- Sub-agent Task results here return empty ~50% of the time while the work is real (or
  sometimes absent): verify via git status + running the suites, never via the report; and
  demand "never end without a report" in every brief.

- 2026-07-31 — innerWidth hides page overflow; measure scrollWidth-clientWidth and bisect subtrees (tests/responsive.test.mjs)
  Horizontal overflow is invisible to both `innerWidth` and a DOM scan; measure
  `documentElement.scrollWidth - clientWidth` and bisect
  (`tests/responsive.test.mjs`). Under Chrome's mobile emulation `innerWidth` is the
  scaled *visual* viewport, so a page 1020px too wide measures as **0** — that is how
  30 of 129 documents stayed broken on phones while looking fine at 768px. Scanning
  element rects is no better: a `<pre>` with `white-space:pre` and `overflow:visible`
  has a border box that fits while its text hangs outside; an absolutely-positioned
  child escapes an `overflow:hidden` ancestor that isn't its containing block; and a
  decorative `::before{inset:-40px -80px 0}` has no element to measure at all
  (`win2k/w2k.css:.hero`). Find the real culprit by hiding one subtree at a time and
  watching `scrollWidth` — it names the box in seconds and never lies about clipped
  descendants.
- 2026-07-30 — SVG transform scales about the viewBox until transform-box:fill-box (arran-deep-time/arran.css .route-pin circle)
  CSS `transform` on an SVG shape scales about the whole viewBox, not the shape, until
  you set `transform-box:fill-box` (`arran-deep-time/arran.css:.route-pin circle`). An
  SVG element's default `transform-box` is `view-box`, so the familiar
  `transform-origin:center;transform:scale(1.15)` resolves "center" against the map, not
  the circle: Arran's selected route pin flung its disc 49.5px (desktop) / 53.0px
  (tablet) / 40.9px (mobile) away from its own number — further than the pin's 31px
  radius, so the digit landed outside the disc, and every pin did the same on hover and
  focus. Nothing catches this but a real browser measuring the two rects, and the sibling
  trap is that the *unselected* pins measure perfectly, so eyeballing "do the pins look
  right" passes. Grep any SVG-heavy document here for `transform:` in CSS and check each
  one sets `transform-box`. Two more from the same pass: **a new document is not
  integrated just because `data.js` has an entry** — this one arrived green, shelved
  twice and tagged correctly, yet shipped no `/almanac-back.js` include (126 of 127
  documents carry it), put its own duplicate back link *and* its skip link under where
  that pill lands (ALM-BUG-KILN-00039 again), and claimed 18 minutes against 3000 words
  when the catalog runs at ~220 wpm; `arran-deep-time/tests/validate-static.mjs` asserts
  all of it and is the cheap thing to copy for the next document. And when a `words`
  figure is in doubt, don't estimate it from source — render the page, walk every
  interactive state and take the union of distinct `innerText` lines; naive
  string-literal extraction from the same app.js gave 2222 or 3838 depending purely on
  how strict the filter was, against a rendered 2931.
- 2026-07-30 — Tests pass an unfair game; assert graph distances and conditional win rates (game-of-dracula/engine.js EDGE_LIST)
  A penalty square 3 stones from HOME made being bitten a 72% win — measure outcome
  rates (`game-of-dracula/engine.js:EDGE_LIST`). The rule text said "victims are
  carried to the vault" and the code did exactly that; the defect was purely the board
  graph, which wired the vault into the left HOME run three stones from escape while the
  START stones sat 11–13 away. Since every red sector moves a guest exactly 3 or 4, both
  counts landed on the doorway. No unit test could see it — all 18 passed, and the
  shipped 5000-game simulation reported zero stalls — because "did the game finish" is
  not "is the game fair". What found it was a *differential* measurement: win rate
  conditioned on having been penalised (72.3% vs 14.3%; now 23.3% vs 25.2%). For any
  game doc, assert on graph distances between the special squares and the win condition,
  and on conditional win rates, not just on completion. Two related traps in the same
  pass: a residual "seat 3 wins more" signal is worth decomposing into wins-by-seat vs
  wins-by-offset-from-opener before calling it bias — here the real effect was a 32.6%
  vs 19.0% first-mover advantage inherent to a race, plus a *documented* seat-order
  tie-break; and seeding xorshift32 with a raw small "night number" makes the very first
  draw degenerate (every seed <1000 opened seat 1, seat 4 never opened under 10000), so
  avalanche the seed — but note that mixing breaks `new RNG(rng.state)` as a way to
  round-trip a generator, which is exactly what the test helpers used to predict the next
  spin (`RNG.fromState` now exists for that, and `Game.restore` was already hand-rolling
  the overwrite).
- 2026-07-26 — Editing y after arc-length resampling inflates g ~3x; re-resample after (iron-vertex/track.js relaxProfile)
  Edit y after arc-length resampling → uneven spacing → curvature ÷ nominal ds
  overstates g ~3x (`iron-vertex/track.js:relaxProfile`); re-resample after. This one
  defect masqueraded as three unrelated ones — a spacing-uniformity failure, wrong g
  readings, and "generation is too timid" (loops kept being rejected as too violent by a
  budget fed with inflated numbers). General rule for these procedural-geometry docs: any
  pass that MOVES sample positions invalidates every quantity derived from the sample
  spacing, so re-establish the invariant before measuring anything. More broadly, the
  split that made all of this findable was keeping the generator and physics in a pure
  ESM module (no Three.js, no DOM) with the renderer as a thin consumer: eight
  substantive defects — a role/parameterisation mismatch across a geometry splice, a lift
  released while still climbing, a 30g pull-out, a loop pinched by pouring the base
  gradient into its forward axis, a 140°-in-3m snap roll — were all caught by
  `node --test` in milliseconds. Verify by simulation, not by heuristic: `buildTrack`
  rides its own finished track and retries until the train demonstrably completes the
  circuit.
- 2026-07-13 — /deep-review on an empty diff silently reviews the last commit; pass an explicit file slice for an area review
  The `/deep-review` workflow is **diff-oriented**: run from a fresh worktree off
  `origin/main` (empty diff), it silently retargets to the most recent *commit* instead
  of erroring. A darmok area-review launched this way reviewed the latest `news`
  article-drop commit instead — all 37 agents, wrong slice. For an AREA review (a
  first-ever pass over existing code, not a change review), don't use the diff path:
  hand-roll the fan-out and pass the **explicit file slice** (absolute paths + "ignore
  git history") as args, or the lenses review whatever the last commit touched. The
  misfire's findings can still be real — verify and file them, but don't log that area as
  reviewed. Separately: for the pure engines in these vanilla-JS docs
  (`darmok/engine.js`), stop *guessing* at bugs (my unanswerable-typeback / timer-leak
  guesses were all refuted) and instead run **differential oracles** over the whole
  corpus with `node` — that is what surfaced that 20/513 words reject the exact rōmaji
  the card teaches (asymmetric `ー`/apostrophe/`づ` folding in `normalizeAnswer`).
- 2026-07-11 — Synthetic el.click() bypasses hit-testing; assert elementFromPoint hits the control in drive scripts (brilliancy)
  Headless drives that "play" a document with synthetic `el.click()` / `dispatchEvent`
  bypass browser hit-testing entirely, so they cannot catch the whole class of "invisible
  thing eats real taps" bugs. `brilliancy` shipped its full 8-round auto-play green while
  `#overlay { display: grid }` was silently defeating the `hidden` attribute (an author
  `display` beats the UA `[hidden]` rule) — a transparent
  `position:fixed; inset:0; z-index:50` layer that would have softlocked every real user
  at the first tap. Two rules: any element you hide via the `hidden` attribute but style
  with `display:` needs an explicit `#el[hidden]{display:none}`; and every drive script
  should assert `getComputedStyle(overlay).display === "none"` plus
  `document.elementFromPoint(...)` actually returning the control it aims at — that probe
  is cheap and catches what synthetic clicks never will. (Related: CSS selectors can't
  reach inside `<use>` shadow clones either — style symbol innards with inline
  `style="fill:var(--cut)"`, custom properties do inherit through the boundary.)
- 2026-07-11 — replaceChildren() per tick restarts animations and kills transitions; reconcile via an id->node Map (tidecall)
  In the hand-built vanilla-JS games (`tidecall`, and the same shape elsewhere), a
  monolithic `render()` that `replaceChildren()`s each subtree on every state tick is the
  flicker engine: every rebuilt node with an `animation:` (e.g.
  `.playing-card { animation: card-in }`) *restarts* that animation, so the player's hand
  re-deals itself every time an opponent bids or plays — and, conversely, any
  `transition:` written to animate a state change (the tide marker advancing, a card's
  hover lift) is *dead*, because a freshly-inserted node has no prior computed style to
  transition from. Fix by reconciling: keep a `Map` of id→node, reuse nodes and only
  toggle their classes/attributes, and `replaceChildren()` only when a stable key
  changes. Gotcha: card ids repeat across rounds (`S14` is the ace every deal), so key
  the hand cache by round index too, or round N+1 silently reuses round N's nodes.
  Switch per-node click handlers to one delegated listener on the container once nodes
  outlive a render, or they stack up. Card *size* is best driven the same structural
  way — `.hand{container-type:inline-size}` + a JS-set `--hand-count`, so a 3-card round
  deals big cards and an 8-card round packs down, and put the card's internal glyphs in
  `em` against `font-size:var(--card-w)` so a bigger card is genuinely more legible, not
  the same small print enlarged. None of this is caught by `validate-static.test.js`
  (CSS and renderHand are unguarded) — verify in a real browser at 360×640 and 390×844,
  and bump the cache-first `sw.js` `CACHE` version or returning visitors never see it.
- 2026-07-11 — Design-Canvas exports ship no media queries; add @media rules with !important, as inline styles outrank them
  Design-Canvas (DC) export documents (inline `style=""` on every element, `support.js`
  runtime) frequently ship with **no responsive media queries at all** — desktop-only. On
  a real phone the asymmetric grids collapse their flexible column to near-0px
  (cruise-propulsion's hero prose set one word per line; its simulator form column was
  13px wide). Fix with an added `<style>` block of `@media (max-width: …)` rules: inline
  styles outrank any selector, so the reflow rules **must** use `!important`, and add
  class hooks to the grid divs rather than editing their inline styles (keeps desktop
  bit-for-bit identical, since the hooks only bite inside the query). Also watch
  content-box overflow — an element sized `width:min(100%,Npx)` with padding+border
  measures `100% + padding + border`, invisible on desktop (gap absorbs it) but a
  sideways scroll on a phone; `box-sizing:border-box` fixes it.
- 2026-07-11 — chrome.kill() on Windows leaves renderers holding the debug port; use a free OS-assigned port and taskkill /T /F
  Auditing these DC docs headless is booby-trapped twice over. (1) `chrome.kill()` on
  Windows leaves the renderer children alive holding the debug port; a *derived* debug
  port then attaches to a stale browser and results go non-deterministic — use an
  OS-assigned free port and `taskkill /T /F` on your own pid tree ONLY (dev boxes
  routinely have dozens of the user's real Chrome processes; never blanket-kill
  chrome.exe). (2) The page pulls React from unpkg (blocked in-sandbox) and compiles a
  large template, so a boot check at a fixed delay races the compiler and cries "blank
  page" under load — inject the vendored React UMD
  (`broadband-speed-checker/vendor/*.js`; `loadReactUmd()` short-circuits on
  `window.React`) and *poll* for the ready condition, don't sample once. A flaky oracle
  invents phantom root causes — twice I wrongly blamed CSS for what was harness flake.
- 2026-07-10 — Service-worker CacheStorage is origin-wide, not /slug/-scoped; namespace the cache, delete only your prefix
  Service-worker `CacheStorage` is shared across the whole `0x4d44.github.io` origin,
  not isolated by the worker's `/slug/` scope. Each document PWA must namespace its cache
  and delete only stale keys with its own prefix during activation; filtering every key
  except the current cache wipes the offline assets of sibling almanac apps. Its fetch
  handler should likewise reject URLs outside `self.registration.scope`, query only its
  named cache, and reserve the app-shell fallback for in-scope navigations. Add
  per-document regression assertions whenever a new service worker ships.
- 2026-07-09 — A dead Workflow lens returns an EMPTY findings array, not an error; check <failures>/journal.jsonl first
  A Workflow lens agent that dies mid-run (account session limit, auth drop) surfaces in
  the tool result's `<failures>` list, but the script's own aggregation happily returns
  its stage as an EMPTY findings array — indistinguishable from a clean pass. Never treat
  an empty lens result as "no findings" without checking `<failures>`/journal.jsonl
  first; re-run the dead lenses (by hand if limits persist).
- 2026-07-08 — Line Rate UI Overhaul.zip is a DC export, not a patch; ship the .dc.html as broadband-speed-checker/index.html
  `Line Rate UI Overhaul.zip` is a Design Canvas export (`Line Rate.dc.html` +
  `support.js` + `.thumbnail`), not a vanilla app patch. Ship the `.dc.html` as
  `broadband-speed-checker/index.html`, skip the thumbnail, self-host the DC runtime's
  React/Babel and Google-font assets, and keep production-specific behavior that the
  export resets for preview: `settings.live` should default true and the storage key
  remains `0x4d44.broadband.v1` so existing browser-local history survives.
- 2026-07-07 — Deleting a doc's tests/validate-static.mjs breaks npm test; prune its segment from both root package.json scripts
  Replacing or removing a document that shipped a `tests/validate-static.mjs` (or any
  per-doc test) silently breaks `npm test` / `npm run build`: the **root `package.json`**
  hard-codes each doc's test path into a single `&&`-chained `test`/`build` script
  (`… && node <slug>/tests/validate-static.mjs && …`), so deleting the file leaves a
  dangling `node` call that exits non-zero and fails the whole gate. When you
  retire/replace a doc, prune its segment from **both** scripts. (Hit swapping
  `cruise-propulsion`'s hand-built vanilla-JS essay for its DC-export rebuild — same
  slug, new `index.html` + `support.js`.)
- 2026-07-03 — A fixed 402x874 IOSDevice frame overflows phones; cap it with maxWidth/maxHeight dvh calc (ios-frame.jsx)
  `japanese-travel-rpg` (Nihon Quest, a DC export) wraps its whole UI in a **fixed
  402x874 `IOSDevice` frame** (`ios-frame.jsx`) centred in a
  `min-height:100vh;padding:20px` body — so on any phone (viewport < ~914px) the frame
  overflowed and its pinned bottom tab bar dropped below the fold. Fix: cap the frame
  with `maxWidth:calc(100vw-40px)`/`maxHeight:calc(100dvh-40px)` (mockup size is a *max*,
  not a fixed size; `dvh` tracks the mobile URL bar, degrades to the fixed height on old
  browsers) + body `min-height:100dvh`. Also: its `sw.js` is **cache-first**, so a fix
  reaches installed PWAs only if you bump the `nihon-quest-vN` cache name — and
  `tests/self-check.mjs` asserts that exact string, so bump the SW cache and the test
  assertion together.
- 2026-07-03 — Headless --dump-dom never returns on a rAF loop; use --screenshot, which fires on load (flight, emu-cab)
  Verifying an animated / WebGL document (Three.js entries like `flight`, `emu-cab`,
  `night-cab`) with headless Chrome: `--dump-dom` NEVER returns — the page's perpetual
  `requestAnimationFrame` loop keeps virtual time alive, so the DOM dump (and
  `--virtual-time-budget`) waits forever and the harness kills it with an **empty** file.
  Use `--screenshot=out.png` instead: it fires on the `load` event regardless of the rAF
  loop and gives a visual boot/menu confirmation. Enable WebGL headless with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, and bound the run
  with a background watchdog `kill` (macOS has no `timeout`). The `flight` DC export also
  needs its `support.js` sidecar copied alongside `index.html` — the export's own
  integration note lists only the `.dc.html` + engine, but the `<head>` loads
  `./support.js`.
- 2026-07-03 — A DC export ships offline with no bundler: vendor the exact unpkg React UMD bytes; SRI validates same-origin
  A DC design-tool export (`*.dc.html` + `support.js`) can be shipped **fully offline /
  zero-network** without a bundler: (1) vendor the *exact* unpkg React UMD bytes it
  names — the `sha384` SRI hashes baked into `support.js` still validate same-origin, so
  keep `integrity`/`crossorigin` and just repoint the URL; (2) self-host the Google Fonts
  (grab the `latin`+`latin-ext` woff2, rewrite `src:` to `./fonts/…`). No Babel is needed
  at runtime — the DC component is plain ES6 bound by `support.js`'s own `{{ }}` engine
  (not JSX), confirmed by net-log showing only react/react-dom fetched. Ship the readable
  `.dc.html` as `index.html` (+ `support.js` sidecar), not the 219 KB pre-bundled single
  file — far easier to edit (add PWA `<head>` tags + SW registration; swap the font
  `<link>`). Verify with `chrome --headless=new --log-net-log` and assert no
  unpkg/googleapis hosts appear.
- 2026-07-02 — headless=new clamps innerWidth to 500px, so a 390px shot crops rather than reflows; use --window-size >= 500
  Verifying this site's responsive layout with headless Chrome:
  `chrome --headless=new --window-size=390,H` does **not** give a 390px CSS viewport —
  headless-new clamps `innerWidth` to a **500px minimum**, and the `--screenshot` PNG is
  still only 390px wide, so content past 500px is rendered but cropped out of frame. That
  looks exactly like horizontal overflow but is a screenshot artifact. To shoot a true
  narrow layout use `--window-size ≥ 500` (e.g. 500 triggers the `max-width:560` mobile
  query with no cropping); measure real widths by screenshotting a page that prints
  `innerWidth`/`scrollWidth`.
- 2026-07-02 — vamos-spanish design.zip re-exports change only index.html; diff every file and cherry-pick just the HTML
  `vamos-spanish` "design.zip" DC re-exports change **only** `index.html` (shipped in the
  zip as `vamos-spanish.dc.html`). The five sidecars (`support.js`, `lessons.js`,
  `lessons-extra-a/b.js`, `ios-frame.jsx`) come out byte-identical to what's committed,
  and the zip's `.thumbnail` is a design-tool WebP preview — not a site asset, so skip
  it. `diff` every file before copying, then cherry-pick just the HTML into `index.html`.
- 2026-07-02 — @keyframes animating transform replaces the centring translate(-50%,-50%); bake it into every keyframe (salient/)
  A CSS `@keyframes` that animates `transform` fully **replaces** an element's base
  `transform`, including the centring offset. A modal centred with
  `transform:translate(-50%,-50%)` + `animation` whose keyframes only set `translateY(…)`
  ends up anchored by its top-left corner at the viewport centre and gets chopped on
  narrow/mobile screens (with `fill:both` it stays wrong after the anim). Fix: bake the
  centring offset into every keyframe (`transform:translate(-50%,-50%) translateY(…)`),
  or centre via fl/positioning instead of transform. Hit both dialogs in `salient/` (win
  card + rules sheet).
- 2026-06-22 — Quarto emits \uXXXX in JSX text position, which React renders literally; wrap it in braces or use the glyph
  The Quarto export emits some glyphs as `\uXXXX` in JSX **text** position (e.g.
  `<div>→</div>`), which React renders as the literal string `→`, not the
  arrow. On every re-import, grep each changed `.jsx` for an escape between tags
  (`>…\uXXXX…<`) and wrap it in braces (`{'→'}`) or use the literal glyph. Escapes inside
  JS string literals (`'✕'`) are fine. Verify with headless Chrome `--dump-dom | grep`
  for the real glyph vs the literal token.
- 2026-06-22 — Quarto re-imports reset the sw.js VERSION; cherry-pick the .jsx only and bump our own VERSION forward (sw.js)
  Quarto re-imports come as a bundler export whose `sw.js` targets `./play.html` and
  **resets** the SW cache `VERSION`, and whose `manifest.json` sets
  `start_url: ./play.html`. Our Pages slug serves the shell as `index.html`, so
  **cherry-pick the `.jsx` only, keep our `sw.js`/`manifest.json`, and bump the `sw.js`
  VERSION forward** (never adopt the export's). The export is LF; the repo is CRLF —
  convert on install so `git diff` shows only real changes.
