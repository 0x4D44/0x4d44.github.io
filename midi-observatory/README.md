# Asterion MIDI Observatory

Self-contained GitHub Pages deployment for `/midi-observatory/`. A static,
client-only MIDI listening room with a custom Web Audio synthesizer: curated
demo pieces, drag-and-drop `.mid` upload and in-browser parsing, four live
visualizer scenes (constellations, spectrogram, oscilloscope, piano roll), a
per-channel mixer with spectrum + VU metering, synth presets with a reverb send,
loop/shuffle, tempo/volume, keyboard shortcuts, IndexedDB persistence, and WAV
export. Installable PWA (manifest + service worker) that works offline.

## No runtime network calls

The UI is built with the DC runtime (`support.js`) on React 18. To keep the app
fully self-contained — no CDN dependency, no external requests at runtime — the
dependencies are vendored locally rather than loaded from a CDN:

- `react.production.min.js` / `react-dom.production.min.js` — the exact
  unpkg React 18.3.1 UMD builds, byte-for-byte, so `support.js`'s SRI
  integrity hashes still validate (same-origin).
- `fonts/` + `fonts.css` — Space Grotesk and IBM Plex Mono (latin + latin-ext),
  self-hosted from Google Fonts, so no `fonts.googleapis.com` / `fonts.gstatic.com`
  request is made.

Babel is **not** used at runtime: the DC component is plain ES6 bound by
`support.js`'s own `{{ }}` template engine (no JSX), so nothing is transpiled in
the browser.

The app adds no root build system, backend, CDN dependency, API keys, analytics,
or runtime external network calls.

## Editing / re-importing

`index.html` is the DC source (`MIDI Observatory.dc.html` from the design tool)
with three local edits applied on import: the Google Fonts `<link>`s swapped for
`./fonts.css`, PWA `<head>` tags added (title, theme-color, manifest, icon), and
a service-worker registration appended. `support.js` is the design-tool runtime
with its three `unpkg.com` URLs repointed to the local vendored files. On a fresh
re-export, re-apply those edits (and bump the `sw.js` `CACHE` version).
