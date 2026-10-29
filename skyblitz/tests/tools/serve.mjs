#!/usr/bin/env node
// Static dev server for the Almanac checkout (dev/test only; Pages serves the real site).
//   node skyblitz/tests/tools/serve.mjs [--port 8100] [--root <dir>]
// Root defaults to the repo root, so the game is at http://127.0.0.1:<port>/skyblitz/
// Serves correct MIME types for ES modules (.js and .mjs), audio, images and wasm;
// disables caching so edits show up on reload; supports Range requests for media.
import { DEFAULT_ROOT, startStaticServer } from "./static-server.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const srv = await startStaticServer({ port: Number(opt("--port", 8100)), root: opt("--root", DEFAULT_ROOT) });
console.log(`serving ${srv.root} at ${srv.url}/  (game: /skyblitz/)`);
