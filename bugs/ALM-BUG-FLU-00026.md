# ALM-BUG-FLU-00026 — kings-cross-src sclass tests fail on a fresh checkout: gitignored package-lock.json is read

- **State:** Fixed
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src/tools
- **Raised:** 2026-11-22T23:39:29Z
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
- **State history:** Open (2026-11-22T23:39:29Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium) -> Fixed (2026-11-23T01:21:17Z, deltic:auto role=fix run=fix-20261123T010329Z-730b79ed branch=task/bug-ALM-BUG-FLU-00026-run-fix-20261123T010329Z-730b79ed code=9293294054105f24963eae200d7592961e0cd4ce gate=manual)

## Observation

`tools/tests/sclass.test.mjs` fails twice on a fresh checkout of kings-cross-src: "CLI writes reproducible last-recording and baseline reports without raw events" (line 39) and "CLI leave-one-recording-out writes the nested scores ..." (line 78), each with `sclass: ENOENT: no such file or directory, open '<worktree>/kings-cross-src/package-lock.json'` and exit 1 !== 0.

Cause (observed): `kings-cross-src/package-lock.json` is gitignored (root `.gitignore:10`), so a new worktree from `deltic start-task` does not have it, yet the sclass CLI path reads it (the provenance list in `kings-cross-src/tools/evidence-pack.mjs:313` names `package-lock.json`; inference: sclass shares that provenance step). The main clone and older worktrees pass only because an `npm install` left the file there.

Repro: `deltic start-task`, symlink or install node_modules, run the KX full suite (`npm run test` in kings-cross-src): 3654/3656, the two failures above. Copying the main clone's ignored package-lock.json in makes it 3656/3656 (observed 2026-11-22 on 7345f8d9, task 20261122-TSK-HUM-kings-cross-at300-head-on-windscreen-wid).

Fix direction (not done): either track package-lock.json (reproducible installs) or make the provenance step tolerate a missing lock file (record it as absent) and test that case.

Evidence fingerprint: `manual:v1:kings-cross-src-sclass-tests-fail-on-a-fresh-ch-9fb8a08ca65da5c3`


## Fix


package-lock.json is gitignored (root .gitignore:10), so a new worktree has
none, yet tools/sclass.ts listed it among the provenance sources and read
every entry unguarded: tools/tests/sclass.test.mjs failed its two CLI tests
with ENOENT (3654/3656 on a fresh worktree on 2026-11-22).

- tools/sclass.ts: OPTIONAL_SOURCES = ['package-lock.json'] and
  sourceFingerprint(file, optional). A missing optional source is recorded
  { source, bytes: null, sha256: null, absent: true }; any other read error,
  and a missing required source, still throws. A present file gives the same
  record as before (same keys, order, count 14).
- tools/tests/sclass.test.mjs: new test for the helper (missing optional ->
  absent; present -> exact hash, no absent key; missing required -> ENOENT;
  a directory -> EISDIR). The CLI test now checks the lock file itself: if
  present, all 14 records hashed exactly as before; if missing, exactly that
  record is absent and the other 13 hashed exactly. Disabling the absent
  branch fails 3/21; restored 21/21, with and without the lock file.
- tools/mutation/sclass-cli.py: skip copying package-lock.json when it is
  missing (it hit the same ENOENT on a fresh checkout).
evidence-pack's buildSources already tolerated a missing file; the relay's
--relearn provenance does not list the lock; neither changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Deltic-Lane-Tip: 38c2e25be206ddc88eff590e8c797b39546ef16e

## Notes
