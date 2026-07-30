# ALM-BUG-KILN-00030 — Onu: unguarded top-level localStorage read can blank the whole game on load

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** onu
- **Raised:** 2026-07-13
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — shipped statements complete under a genuinely throwing localStorage accessor; pre-fix control throws)

## Observation
If the browser denies storage access, Onu fails to initialise and renders a blank
page — no board, no splash, nothing — instead of degrading with sound simply off.

Repro: open http://localhost:8000/onu/ in a context where `window.localStorage`
access throws — e.g. Chrome with "Block all cookies"/all site data blocked, or the
page embedded in a sandboxed iframe without `allow-same-origin`. Expected: the game
loads (sound preference just defaults). Actual: `app.mjs` throws at import time and
the module never runs, so the page is blank.

## Notes
`onu/app.mjs:46` reads storage at module top level, before any try/catch and before
anything renders:

```
let soundOn = localStorage.getItem("onu.sound") !== "off";
```

Accessing `window.localStorage` (not just the value) throws a `SecurityError` when
storage is blocked, so this line aborts the entire module evaluation — every later
statement, including the final `render()` and all event wiring, never executes. The
sibling write at `onu/app.mjs:637` (`localStorage.setItem(...)` in the sound-toggle
handler) is also unguarded, but that one only breaks a single click, not load.

This is a latent, low-probability defect (modern top-level pages rarely block
storage) but a real one, and it is inconsistent with the repo's established pattern:
darmok wraps every `localStorage` call in try/catch specifically for "private mode"
(`darmok/engine.js` load/save/reset). Onu should do the same.

Fix: guard both accesses. e.g.
```
function readSound() { try { return localStorage.getItem("onu.sound") !== "off"; } catch { return true; } }
let soundOn = readSound();
...
try { localStorage.setItem("onu.sound", soundOn ? "on" : "off"); } catch {}
```

Found in the deliberate onu/ review pass. The engine itself is robust — a 9000-seed
full-game fuzz (3000 each of classic/flip/chaos, resolving every request branch)
completed with zero crashes, hangs, or invariant/card-conservation violations, on top
of the 29 existing passing unit + property + browser tests.

## Fix (2026-07-21)
Wrapped both localStorage accesses in guarded helpers (`readStored`/`writeStored`, each
try/catch), and the module-scope `soundOn` now uses `readStored("onu.sound")`. In a
blocked-storage context the read returns null so sound simply defaults on and the game still
loads, instead of throwing at module top level and blanking the page. Regression:
onu/tests/validate-static.mjs executes the extracted `readStored` against a throwing
localStorage and asserts it returns null (plus that no unguarded top-level read remains).

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `96869a0`.

**Original observation re-checked — resolved.** `onu/app.mjs:49-51` introduces `readStored`/`writeStored` wrappers and `let soundOn = readStored("onu.sound") !== "off";`, with the write site at `onu/app.mjs:642` also routed through the wrapper. Verified against a **throwing property accessor** on `globalThis.localStorage` — a faithful stand-in for the browser's `SecurityError` on *property access*, which is the actual failure mode, rather than merely a throwing `getItem`:

```
sanity: bare access throws -> SecurityError: Access is denied for this document.
SHIPPED top-level statements COMPLETED under SecurityError, soundOn = true
PRE-FIX THREW (the original bug): SecurityError: Access is denied for this document.
```

Four contexts exercised — throwing access, absent global, throwing `getItem`, working store — all complete, and `working-off` correctly yields `soundOn = false`, so the guard did not flatten the real preference. A sweep for any other `localStorage` mention outside the two helpers returns none. Regression coverage `onu/tests/validate-static.mjs:188-198` passes (46 checks) and both asserts no unguarded top-level read remains *and* executes the extracted `readStored` against a throwing store.

**Note:** the repo's own guard simulates only a throwing `getItem`, not a throwing global access; that gap was closed by this verification, and the code survives both.
