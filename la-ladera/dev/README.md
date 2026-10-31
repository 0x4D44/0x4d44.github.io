# La Ladera: build notes

These files are the working record of how the barrio was built (five builder agents and a lead, 2026-10-29/30). They are not part of the game; the game is `../index.html`.

## Read in this order

| File | What it is |
|---|---|
| `CONTRACT.md` | The law: file layout, module interfaces, units, coordinate frames, budgets. |
| `BRIEF-COMMON.md` | The brief every builder got (rules, quiet-box testing, hand-off style). |
| `TASKS.md` | The task list and who owned what (A1 engine/look/audio/UI, A2 architecture, A3 interiors, A4 people, A5 world/plan). |
| `RUBRIC.md` | The scoring rubric: ten weighted categories, hard caps C1-C11, pass = overall > 9.0 and no category < 8.5. |
| `REVIEWER-BRIEF.md` | What the adversarial reviewers were told to do and how they report. |
| `FEATURE-DRAWERS.md` | Spec of the openable wardrobes/drawers/cupboards, diaries and finds. |
| `ROUND1.md` | Verified findings of review round 1, by owner. |
| `REQUESTS.md` | Requests between builders and the lead (append-only). |
| `progress/A1.md` ... `A5.md` | Each builder's progress log. |

## Run it

```
python -m http.server 8000        # from the repository root, then open http://localhost:8000/la-ladera/
```

Debug entry points on the page: `?autostart` skips the title screen, `?manual` stops the render loop so a script can step it (`__ladera.step(n)`, `__ladera.render()`, `__ladera.teleport(x, z, {y, yaw, pitch})`, `__ladera.enter('L07')`, `__ladera.state()`).

## Check it (all headless, hidden window, low priority)

```
node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/*.test.mjs   # the node + page suite
node la-ladera/tests/tour.mjs        # boot, doors, conversations, end to end
node la-ladera/tests/metrics.mjs     # draw calls, triangles, render cost, soak
node la-ladera/tests/payload.mjs     # shipped bytes against the budget
node la-ladera/tests/shot.mjs --q "autostart&manual" --eval "__ladera.step(3)" --out shot.jpg
```

`tests/chrome.mjs` is the quiet browser harness every page test uses: always headless (there is no headed mode), child processes hidden, below-normal priority (`LADERA_PRIO=idle` for lower), audio muted, no input device touched.
