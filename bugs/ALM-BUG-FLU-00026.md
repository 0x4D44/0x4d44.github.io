# ALM-BUG-FLU-00026 — kings-cross-src sclass tests fail on a fresh checkout: gitignored package-lock.json is read

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src/tools
- **Raised:** 2026-11-22T23:39:29Z
- **Discovery source:** Agent
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20261123T010329Z-730b79ed
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-FLU-00026-run-fix-20261123T010329Z-730b79ed
- **Owner base:** 49f8c1f4f932924e19f1f0158725eb33aca52138
- **Owner fingerprint:** -
- **Owner since:** 2026-11-23T01:03:29Z
- **Owner until:** 2026-11-23T05:03:29Z
- **Owner session:** flux/6cdfe552-8774-4c7e-a478-e451f5ff339d (run fix-20261123T010329Z-730b79ed)
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-11-22T23:39:29Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

`tools/tests/sclass.test.mjs` fails twice on a fresh checkout of kings-cross-src: "CLI writes reproducible last-recording and baseline reports without raw events" (line 39) and "CLI leave-one-recording-out writes the nested scores ..." (line 78), each with `sclass: ENOENT: no such file or directory, open '<worktree>/kings-cross-src/package-lock.json'` and exit 1 !== 0.

Cause (observed): `kings-cross-src/package-lock.json` is gitignored (root `.gitignore:10`), so a new worktree from `deltic start-task` does not have it, yet the sclass CLI path reads it (the provenance list in `kings-cross-src/tools/evidence-pack.mjs:313` names `package-lock.json`; inference: sclass shares that provenance step). The main clone and older worktrees pass only because an `npm install` left the file there.

Repro: `deltic start-task`, symlink or install node_modules, run the KX full suite (`npm run test` in kings-cross-src): 3654/3656, the two failures above. Copying the main clone's ignored package-lock.json in makes it 3656/3656 (observed 2026-11-22 on 7345f8d9, task 20261122-TSK-HUM-kings-cross-at300-head-on-windscreen-wid).

Fix direction (not done): either track package-lock.json (reproducible installs) or make the provenance step tolerate a missing lock file (record it as absent) and test that case.

Evidence fingerprint: `manual:v1:kings-cross-src-sclass-tests-fail-on-a-fresh-ch-9fb8a08ca65da5c3`


## Fix

<unfixed — raised only>

## Notes
