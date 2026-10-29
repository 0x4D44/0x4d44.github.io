# La Ladera - scoring rubric (v1)

The bar the user set: **overall score above 9.0** from adversarial reviewers, who are told to find fault. Builders read this file to know what "good" is. Reviewers use it to score.

## 1. Scale and anchors

Each category is scored 0-10 (halves allowed). Anchors, applied to the *experience a first-time visitor has*:

| Score | Meaning |
|---|---|
| 10 | Indistinguishable from a polished commercial walking-sim / indie exploration game at its best. Reviewer cannot find a defect worth listing. |
| 9 | Excellent. Only nitpicks; nothing a normal player would stumble over. Would be unremarkable in a good indie release. **This is the target.** |
| 8 | Good. A few visible gaps (some repetition, some rough spots) that a careful player notices but forgives. |
| 7 | Solid prototype / vertical slice. The whole is there, the polish is not. |
| 5 | Works but thin: placeholder-looking, repetitive or sparse in a way that breaks the illusion within minutes. |
| 3 | Partially working; major parts missing or broken. |
| 0-2 | Absent or broken. |

Scores need **evidence** (screenshot paths, coordinates, repro commands, measured numbers). A score without evidence is discarded by the lead.

## 2. Categories and weights (sum 100)

| # | Category | Weight | What 9+ looks like |
|---|---|---|---|
| 1 | **Layout, scale and density** | 10 | A genuinely 200 x 200 m hillside barrio: 42-50 buildings stacked on a steep slope, switchback road, alleys, stairways, 3+ plazas/courts/courtyards, a mirador, retaining walls, layers visible from below and above. Human scale everywhere (doors 2.0-2.2 m, ceilings 2.4-2.9 m, stair rise 0.15-0.19 m, tread >= 0.25 m, street widths believable). Getting lost is possible and pleasant; there are many distinct districts. |
| 2 | **Architecture and exteriors** | 12 | Buildings read as real Latin American vernacular: varied silhouettes, party walls, balconies, rejas, roll-up shutters, tanks, terraces, unfinished top floors with rebar, mixed roofing, signage, murals, cables, weathering. No two neighbours alike; no obvious boxes-with-textures. Thresholds, steps, eaves, reveals, sills have depth. Texture scale is correct. |
| 3 | **Interiors: accuracy and richness** | 14 | EVERY building is enterable and every room is furnished correctly for its use and its household: sensible layouts, proper finishes (tile, cement, wood, paint with dado), doors/windows/trim, kitchens with gas cylinder and stove, bathrooms with electric showers, shop fit-outs that match the shop type (bakery cases, barber chairs, hardware shelves...), decor (altars, photos, calendars, posters, plants, laundry), believable clutter, lighting that makes rooms feel inhabited. No floating, clipping, empty or mirror-image rooms. Variety between households. |
| 4 | **People: realism and daily life** | 12 | 60+ NPCs in 30+ visibly distinct appearances (age, sex, skin tone, hair, clothes, accessories appropriate to an Andean-Colombian barrio, including children and elders); convincing proportions and materials, faces that do not look uncanny at 1.5 m; smooth animation; they sweep, cook, sell, chat in groups, sit, hang laundry, climb stairs, enter and leave buildings, follow a plausible day, avoid walls and the player. Nobody T-poses, slides, floats or gets stuck. |
| 5 | **Interaction and Spanish speech** | 10 | E on a person: they turn, look at you and answer in natural Colombian-flavoured Spanish through browser TTS (best available es voice, sensible pitch/rate per persona) with ES + EN subtitles; multi-turn small talk with choices (ask directions, ask about the barrio, buy/ask about their shop...); lines depend on persona, time of day and place; no repeats within a conversation; graceful fallback with no voice. Spanish is correct (accents, punctuation, idiom, register) - a native reader would not wince. Doors, sitting, objects and discoveries are also interactive with Spanish prompts. |
| 6 | **Controls and physics** | 8 | WASD + mouse look, sprint, crouch, jump, smooth stair climbing, slopes, no wall clipping or falling through floors, no snagging on door frames or furniture, no unreachable-by-bug places, no stuck spots, sensible head-bump, doors open as expected, pointer lock / pause / resume behave, Esc works, sensitivity and FOV settings. |
| 7 | **Visual quality and atmosphere** | 12 | Photographic textures (not flat colours), consistent colour grading, believable warm late-afternoon light with soft shadows and haze, sky and distant city lights, night mode with glowing windows and street lamps, depth cues, decent anti-aliasing, subtle post-processing, no z-fighting, light leaks, popping, texture stretching or visible tiling at normal distances. Looks beautiful in screenshots *and* in motion. |
| 8 | **Performance and robustness** | 8 | Boot to playable <= 25 s; median frame time <= 16.7 ms (>= 60 fps) at every benchmark viewpoint on the dev machine at 1080p, never below 30 fps; draw calls <= 1,800; payload within budgets; zero console errors/warnings and zero 404s in a 5-minute scripted walk; WebGL-unavailable fallback; handles resize, tab switch, pointer-lock loss, rapid input; deterministic with `?seed`. |
| 9 | **Discovery and richness** | 8 | The world rewards curiosity: >= 24 named discoveries (murals, shrines, hidden courtyards, odd rooms, rooftop loft, panoramas, tiny stories told by objects), a map and journal, vistas framed on purpose, sound zones, secrets behind doors and up stairs, objects with Spanish prompts, NPC micro-stories. Different on every wander. |
| 10 | **Integration and polish** | 6 | Title/loading screen, clear controls help, HUD that stays out of the way, settings, mobile/narrow layout does not overflow, nothing interactive under the Almanac pill, Almanac entry (card, tag, shelf, icon) correct and live, no dev junk in the shipped page, documentation (`dev/` notes) coherent. |

**Overall = sum(weight x category) / 100.** Pass = overall **> 9.0** AND no category **< 8.5**. Reviewers score independently; the lead aggregates (see 5).

## 3. Hard caps (apply regardless of reviewer generosity)

| Cap | Condition | Effect |
|---|---|---|
| C1 | Any console error/warning, uncaught exception or 404 during boot or the scripted 5-minute walk | Cat 8 <= 6, cat 10 <= 7 |
| C2 | Any building without a working entrance, or any room not reachable from an entrance (Node reachability test + in-browser spot walks) | Cat 3 <= 6, cat 1 <= 7 |
| C3 | The stuck probe finds a spot from which the player cannot escape by walking/jumping | Cat 6 <= 6 |
| C4 | The player can walk through a wall, off the map or fall through a floor (probe or manual) | Cat 6 <= 5 |
| C5 | NPC conversation produces no speech/subtitles, or Spanish with errors on > 5 % of sampled lines | Cat 5 <= 4 |
| C6 | Median frame time > 33 ms at any benchmark viewpoint on the dev machine | Cat 8 <= 6 |
| C7 | Magenta / `missing_asset` / default-grey placeholder materials visible in any reachable place | Cat 7 <= 6 |
| C8 | More than 20 % of non-circulation rooms contain fewer than 3 furniture/decor items | Cat 3 <= 6 |
| C9 | Visible T-pose, sliding feet, or NPC clipping through walls in > 10 % of sampled NPC observations | Cat 4 <= 6 |
| C10 | Fewer than 40 enterable buildings, or fewer than 60 NPCs, or fewer than 24 discoveries | the relevant category (1, 4, 9) <= 7 |

## 4. Reviewer protocol (adversarial)

Reviewers are given the page, the harness, `CONTRACT.md` and this rubric, and one instruction: **find what is wrong**. They must:
1. Run the page (`node la-ladera/tests/shot.mjs ...` and the Chrome driver in `tests/chrome.mjs`); take >= 30 screenshots covering all districts, interiors and people; LOOK at them.
2. Probe, not just look: teleport to random coordinates and check for ground, walk into walls and corners, climb every stair, open every door, try to sit/talk/use everywhere, run the stuck-probe, read the console, count draw calls.
3. Score their primary categories (and secondary where evidence is cheap) with evidence.
4. File defects as JSON `{id, sev:'blocker'|'major'|'minor', cat, where:{building|x,z,floor}, what, repro, evidence}` - concise, reproducible, ranked.
5. Never edit shipped files. Scratch in `.scratch/<reviewer>/`. Report in <= 600 words plus the JSON score sheet at `.scratch/<reviewer>/score.json`.

Reviewer lenses: **R1** art director + architect (cats 1, 2, 7, 9 primary); **R2** tester/breaker (6, 8, 10 primary); **R3** linguist + people (4, 5 primary); **R4** interior accuracy + human-scale (3 primary; 1, 2, 6 scale/physics secondary).

Primary/secondary scoring map: 1:R1/R4, 2:R1/R4, 3:R4/R1, 4:R3/R1, 5:R3/R2, 6:R2/R4, 7:R1/R2, 8:R2/R3, 9:R1/R3, 10:R2/R1.

## 5. Aggregation and iteration

1. The lead verifies each reported defect (repro or evidence) before acting on it; unverifiable ones are dropped, reproduced ones are queued by severity.
2. Category score = mean of its primary and secondary reviewer scores (evidence-backed); a gap > 1.5 triggers a look at both reviewers' evidence. Caps in 3 are applied. Overall = weighted mean.
3. If pass fails: dispatch the verified defects to the owning builder (SendMessage), rebuild, re-run automated checks, then re-review the weakest categories with fresh reviewers (anchoring to the previous sheet is not allowed: reviewers get the rubric, not the old scores).
4. Stop when pass is achieved, or report honestly the best achieved score, the caps in force and what remains. Never inflate.

## 6. Automated metrics (the lead runs these every integration; builders can run their parts)

| Id | Metric | Target | Command / source |
|---|---|---|---|
| M1 | console errors + warnings + 404s in boot + 5 min walk | 0 | `tests/metrics.mjs` (lead) |
| M2 | boot time to `bootDone` | <= 25 s | metrics |
| M3 | draw calls / triangles at benchmark views (`dev/views.json`) | <= 1,800 / <= 2.5 M | `__ladera.state()` |
| M4 | median frame ms at benchmark views, 1080p | <= 16.7 | metrics |
| M5 | rooms unreachable from an entrance | 0 | Node reachability test (A2/A3) |
| M6 | stuck-probe failures per 2,000 random walks | 0 | `tests/stuck.test.mjs` (lead) |
| M7 | buildings: count / with working entrance | >= 40 / all | `__ladera.buildings()` |
| M8 | NPCs / distinct appearances / dialogue lines | >= 60 / >= 30 / >= 600 (>= 12 per persona) | `__ladera.npcs()` |
| M9 | discoveries | >= 24 | `__ladera.discoveries()` |
| M10 | payload sizes | within CONTRACT 8 | `tests/payload.mjs` (lead) |
| M11 | unknown-material warnings / missing assets | 0 | console |
| M12 | responsive test (no sideways scroll, nothing under the pill) | pass | `npm run test:responsive` filtered to la-ladera |
