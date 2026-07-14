# ALM-BUG-KILN-00030 — Onu: unguarded top-level localStorage read can blank the whole game on load

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))

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
