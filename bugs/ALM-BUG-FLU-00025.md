# ALM-BUG-FLU-00025 — mdbench browser test leaks headless Chrome and its temp profile when a run ends early

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** mdbench/tests/browser.test.mjs
- **Raised:** 2026-11-20T14:23:36Z
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
- **State history:** Open (2026-11-20T14:23:36Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

The mdbench site browser test leaves its headless Chrome running whenever a run ends early, so aborted runs leak a browser per run.

Observed (flux, 2026-11-20 14:22Z): four headless Chrome launchers with `--user-data-dir=$TMPDIR/mdbench-*` and remote-debugging ports 53820-53937, parent PID 1, about 18.6 h old (started about 19:44Z on 2026-11-19), each with its helper and renderer processes. No test was running. FLUX found them; they were closed by launcher PID. A normal, passing run (2026-11-20 10:37Z) left nothing behind.

Where: `mdbench/tests/browser.test.mjs` (run by `npm run test:mdbench`) spawns Chrome with `detached: true` in its own process group (line 73). `cleanup()` (line 74: kill the group, close the server, remove the profile) runs only on two paths: Chrome failing to start (line 78) and the normal end (line 137). Any other exit skips it: an exception or rejected promise after start (a CDP call, the WebSocket, a page evaluation), or the node process being killed by a timeout or Ctrl-C. Because Chrome is detached, it outlives node, and the temp profile is left too.

Expected: every exit path after Chrome starts (throw, rejection, SIGINT/SIGTERM) closes Chrome's process group and removes the profile, e.g. try/finally around the page loop plus signal and exit handlers.

Evidence fingerprint: `manual:v1:mdbench-browser-test-leaks-headless-chrome-and--58465bcef91dbba3`


## Fix

<unfixed — raised only>

## Notes
