# Common brief for the five builder agents (A1 engine+look, A2 architecture, A3 interiors, A4 people, A5 environment)

You are one of five Claude Sonnet 5.5 builders working IN PARALLEL in ONE shared working tree, building **La Ladera**: an explorable 200 x 200 m hillside barrio in Three.js
(dense South American city: layered housing, steep streets, stairways, alleys, courtyards, shops, rooftop terraces; every building enterable and furnished; people who live there
and talk to you in Spanish through TTS). The lead (an Opus agent) integrates, owns git and the Almanac, and finishes with a team of adversarial reviewers who score the result against
`dev/RUBRIC.md`. **The project is done only when they score it above 9.0** - so quality, completeness and robustness all count, and "it should work" counts for nothing: run it, look at it.

**Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.**

## Read first (in this order; do not linger)
1. `dev/CONTRACT.md` (interfaces, ownership, units, budgets, recipes - the law) 2. `dev/TASKS.md` (your T-section = your task list and acceptance) 3. `dev/RUBRIC.md` (what the reviewers will do to you)
4. `dev/REQUESTS.md` 5. The `js/core/*.js` files you will call, plus the stub of your own module (read them: `mesh.js`, `physics.js`, `matlib.js`, `ctx.js`, `frame.js`, `registries.js`, `interact.js`, `assets.js`).
All paths are relative to the page root `H:\worktrees\0x4d44.github.io\20261029-DEV-CLA-la-ladera-explorable-3d-hillside-barrio\la-ladera\` (repo root = its parent). Use absolute paths in tool calls; a bare `cd` to another directory is silently reset between calls.

## Working agreement
* **Ownership**: edit only files you own (CONTRACT 2). Need something from someone else? Append to `dev/REQUESTS.md` and use a local workaround meanwhile. Re-read REQUESTS.md and the bottom of CONTRACT.md (`## Amendments`, lead-maintained) before each major step.
* **No git write commands, no `deltic board`, no spawning sub-agents, no questions to the user** (nobody will answer). When something is ambiguous: decide, write the assumption in your progress log, move on. Report only to the lead (final report; REQUESTS.md for cross-agent asks).
* **Vertical slices**: P1 first (a minimal REAL version of your module integrated in the live page, 0 console errors), then P2 depth/beauty, then P3 fixes from reviewers (the lead re-tasks you by message later). Never leave the integrated page broken for the others: develop risky rewrites beside the live file, swap when green, run the smoke command below after every swap.
* **Progress log** `dev/progress/<your id>.md`: after each slice write what exists, how to run it, measured numbers, known gaps, next steps. If your context is compacted, that file is how you resume. Keep it current and short.
* **Look at your work**: screenshot through the harness at human eye height (1.64 m) and Read the images; fix what you see (stretched UVs, z-fighting, gaps, flipped faces, floating objects, flat colours, wrong scale). Hunt defects the way an adversarial reviewer would. Do at least one full pass of this before reporting.
* **Test with teeth**: data-layer invariants as Node tests (`node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/<id>-*.test.mjs`); make every new test fail once (break the input) before trusting it. Never delete or weaken a test to get green. Put your tests in `tests/<id>-*.test.mjs` (A1: `tests/engine-*.test.mjs`, A2: `arch-*`, A3: `interiors-*`, A4: `people-*`, A5: `world-*`; you own those names).
* **Determinism**: all generation from `ctx.rng.fork(label)`; no `Math.random()` in generation; same seed -> same world.
* **Budgets** (CONTRACT 8) are rubric items: measure `__ladera.state()` (draw calls, triangles) and file sizes as you go. Reuse materials, bake into batches, tint instead of duplicating textures.
* **Shared-box etiquette** (CONTRACT 2 rule 11): memory gate before Blender/Codex, one Chrome / one Blender / one Codex job at a time per agent, close Chrome after every use, batch screenshots into one boot with `--steps`.

## Quiet box rules (from the user at the desk, binding; this is a shared workstation someone is using right now)
* **Headless only, no windows.** Browsers only through `tests/chrome.mjs` (always `--headless=new`; `headless:false` throws). Blender only with `--background`. Codex only via `codex exec`. Never `start`, `Start-Process`, `explorer`, `Invoke-Item`, `cmd /c start`, an image viewer, an editor, or a browser opened on a lab page. Look at images with the Read tool.
* **Never touch the user's desktop**: no `mcp__claude-in-chrome__*`, no computer-use or any desktop-control tool, no pyautogui / SendKeys / SetCursorPos / AutoHotkey, no audio playback on the box (test TTS by data and a headless page only).
* **Pointer lock and speech are simulated, not real** (`tests/quiet-init.js`, injected by `tests/chrome.mjs` before any page script). A real `requestPointerLock()` makes headless Chrome call Windows `ClipCursor()` on the person's REAL mouse, and a real `speechSynthesis.speak()` talks through their speakers. In the page the twins behave like the real thing (`document.pointerLockElement`, `pointerlockchange`/`pointerlockerror`, the promise; `speak` fires `start`/`end`, `cancel` fires `error: 'canceled'`, `speaking`/`pending` flip), and every spoken line is readable as data in `window.__quiet.spoken` (`text, lang, voice, rate, pitch, volume`). Never open the game in a browser that did not come from `chrome.mjs`, and never call `Element.prototype.requestPointerLock`/`speechSynthesis.speak` through any other route (a raw CDP session, Playwright, another script).
* **Every child process is hidden.** Node: `spawn/spawnSync/exec/execFile(..., { windowsHide: true })`, with `stdio` piped or ignored, never `'inherit'`. Python: `subprocess.*(..., creationflags=subprocess.CREATE_NO_WINDOW)`. PowerShell: nothing that starts a visible process.
* **Everything runs at low priority.** Tests and probes started with `--import ./la-ladera/tests/register.mjs` lower themselves to below-normal, and `tests/chrome.mjs` also lowers every Chrome process (GPU and renderers included). Anything else heavy (Blender, Codex, Python batch jobs, long Node scripts) goes through the wrapper, outermost:
  `node la-ladera/tools/nice.mjs --idle <command> [args]`, e.g. `node la-ladera/tools/nice.mjs --idle deltic timeout 900 "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python x.py`.
  (`--below` is the default, `--idle` for work nobody is waiting on. `LADERA_PRIO=idle` as an environment variable makes the harness itself go idle.) A script of yours that spawns heavy children should `import '../tests/nice.mjs'` first (path relative to the file), so the children inherit the low priority.

## Operating on this Windows box
* Bash tool = Git Bash (POSIX syntax, `/dev/null`); PowerShell tool also exists (pwsh 7). Quote paths with spaces. Python: `python script.py` (3.13 with PIL + numpy in the user site-packages; do NOT use `-I`, it hides them). Node 22. Blender: `node la-ladera/tools/nice.mjs --idle "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python <script> -- <args>` (always through the low-priority wrapper, see Quiet box rules; Blender 5.2: some old bpy APIs are gone - read the error, adapt).
* Close stdin on every command (`</dev/null`). Bound anything that might hang with `deltic timeout <secs> <cmd>` (do not wrap `deltic` itself). Run anything longer than ~2 minutes with the tool's `run_in_background` option and wait for the completion notification; **never sleep-poll, and never end your turn while waiting for something that will not wake you.** Commits are not yours to make.
* Smoke command (page boots, 0 errors, renders): `node la-ladera/tests/shot.mjs --q "autostart&manual" --eval "__ladera.step(3); JSON.stringify(__ladera.state())" --out .scratch/<id>/smoke.jpg` (run from the repo root). Useful URL flags: `?lots=L00,L02` `?skip=props,people,furnish,interiors,world` `?hour=17.2` `?seed=N` `?shadows=0` (CONTRACT 4).
* Never kill Chrome processes by name (the user's own Chrome is running). `tests/chrome.mjs` kills only the tree it started - always `await b.close()`.
* If a tool/browser/Blender call fails or hangs twice, change approach; do not loop. If something outside your control blocks you, say so in REQUESTS.md and continue with another task.

## Quality bar (what "beautiful, human-scale, lived-in, rich with discovery" means in practice)
* Every surface has a believable material with correct scale (metre-based UVs); every opening has depth; nothing is a bare box. Add weathering, repairs, clutter, wear. No two neighbours alike.
* Everything the player can reach must survive close inspection at 1.64 m eye height with the camera 10 cm from it. Check corners, undersides, thresholds, stair soffits, the backs of things.
* Spanish everywhere the player reads text (prompts, signs, subtitles, journal names). English only as the secondary subtitle line and in dev docs.
* Prefer a few well-crafted, varied assets and systems over many bland ones; but meet the counts in the rubric.

## Finishing
When your P1+P2 tasks are done and your own checks are green, update your progress log and end with the **final report** (CONTRACT 11, <= 300 words): `DONE`/`PARTIAL`, what exists, exact run/test commands, measured results, known gaps, requests. The lead verifies independently and may re-task you with reviewer findings; you keep your context if you end normally. **Never end without the report, even if you are blocked or out of ideas.**
