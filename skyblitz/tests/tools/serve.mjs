#!/usr/bin/env node
// Static dev server for the Almanac checkout (dev/test only; Pages serves the real site).
//   node skyblitz/tests/tools/serve.mjs [--port 8100] [--root <dir>]
// Root defaults to the repo root, so the game is at http://127.0.0.1:<port>/skyblitz/
// Serves correct MIME types for ES modules (.js and .mjs), audio, images and wasm;
// disables caching so edits show up on reload; supports Range requests for media.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt("--port", 8100));
const root = path.resolve(opt("--root", path.join(import.meta.dirname, "..", "..", "..")));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".mid": "audio/midi", ".glb": "model/gltf-binary",
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.resolve(root, "." + rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!rel.endsWith("/")) { res.writeHead(301, { Location: rel + "/" }).end(); return; }
      file = path.join(file, "index.html");
    }
    fs.stat(file, (e2, s2) => {
      if (e2 || !s2.isFile()) { res.writeHead(404, { "content-type": "text/plain" }).end("404 " + rel); return; }
      const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      const headers = { "content-type": type, "cache-control": "no-store", "accept-ranges": "bytes" };
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), s2.size - 1) : s2.size - 1;
        res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${s2.size}`, "content-length": end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, "content-length": s2.size });
        fs.createReadStream(file).pipe(res);
      }
    });
  });
});
server.listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://127.0.0.1:${port}/  (game: /skyblitz/)`));
