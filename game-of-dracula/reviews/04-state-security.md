# Review 04 — hostile state, privacy and platform reviewer

## Attack brief

Disable storage, deny audio, omit Web Crypto, corrupt the save, inject markup through a player name, update a neighbouring Almanac PWA, and reload between random actions.

## Findings and changes

- **Critical:** direct storage access can throw in restricted contexts. All local-storage reads/writes/removals are guarded.
- **Critical:** deleting every origin cache would damage other Almanac projects. Service-worker activation only removes keys beginning `game-of-dracula-`.
- **High:** player names enter generated setup HTML. Names are escaped before insertion; later rendering uses `textContent`/SVG text attributes.
- **High:** save data can be malformed or from another version. Restore validates shape/version, reconstructs the RNG, and a failed resume clears only this game's save with a visible message.
- **Medium:** `AudioContext`, `crypto.getRandomValues` and modal APIs are not universal. Added feature detection/fallbacks; gameplay never depends on sound or cryptographic randomness.
- **Medium:** cache interception must remain inside the app scope. Fetch handling checks origin and service-worker pathname.
- **Low:** no remote assets, telemetry, cookies, authentication, clipboard, geolocation, camera or permissions are used.

## Verdict

Pass. State is local, bounded and reproducible; failure of optional browser facilities degrades cleanly.
