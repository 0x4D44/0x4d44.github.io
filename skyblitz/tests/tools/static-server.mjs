// Static file server for the Almanac checkout, as a function (dev/test only; Pages serves the real site).
//   const srv = await startStaticServer({ port: 0 });  srv.url -> http://127.0.0.1:<port>   srv.close()
// Correct MIME types for ES modules (.js and .mjs), audio, images and wasm; no caching, so edits show up on reload; Range requests for media.
import "./lowprio.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".mid": "audio/midi", ".glb": "model/gltf-binary",
};

export const DEFAULT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export function startStaticServer({ root = DEFAULT_ROOT, port = 0, host = "127.0.0.1" } = {}) {
  root = path.resolve(root);
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
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      resolve({
        root, port: p, url: `http://${host}:${p}`,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}
