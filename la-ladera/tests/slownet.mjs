// Slow-network boot check (lead tool). GitHub Pages is not localhost: a visitor's first frames are drawn while textures and models still download,
// and a console warning there is rubric hard cap C1. This boots the page through the quiet harness under CDP network throttling and lists
// every console warning / error / 404 (distinct messages with counts).
//
//   node la-ladera/tests/slownet.mjs [--latency 120] [--down 8] [--cpu 1] [--q autostart]
//     --latency  added round trip per request in ms (default 120)     --down  download Mbit/s (default 8)
//     --cpu      CPU slow-down factor (CDP Emulation.setCPUThrottlingRate, default 1): a slow laptop decodes images late
//     --q        query string of the page (default "autostart": the real render loop; use "autostart&manual" for the stepped mode)
//     --url      boot this full URL instead of the local copy (the live site after a release: https://0x4d44.github.io/la-ladera/?autostart)
// Exit code 1 when anything was logged. The fast (unthrottled) boot is the same call with --latency 0 --down 0.
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const LAT = +opt('latency', 120), DOWN = +opt('down', 8), CPU = +opt('cpu', 1), QUERY = opt('q', 'autostart'), URL_ARG = opt('url', null);

const b = await launch({ width: 1280, height: 720 });
let bad = 1;
try {
  const p = b.page;
  if (LAT > 0 || DOWN > 0) await p.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: DOWN > 0 ? (DOWN * 1e6) / 8 : -1, uploadThroughput: -1 });
  if (CPU > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const t0 = Date.now();
  await p.goto(URL_ARG ?? `${b.baseUrl}/la-ladera/index.html${QUERY ? '?' + QUERY : ''}`, { timeout: 600000 });
  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  await new Promise((r) => setTimeout(r, 1500));                       // a few more frames after ready
  const s = p.summary();
  const count = (list) => { const m = new Map(); for (const l of list) { const k = String(l).replace(/\s+/g, ' ').slice(0, 160); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].map(([text, n]) => ({ n, text })).sort((a, c) => c.n - a.n); };
  const out = { latencyMs: LAT, downMbit: DOWN, cpuSlowdown: CPU, query: QUERY, bootSeconds: seconds, pageErrors: s.errors.length, consoleErrors: count(s.consoleErrors), consoleWarnings: count(s.consoleWarnings), netErrors: count(s.netErrors) };
  bad = s.errors.length + s.consoleErrors.length + s.consoleWarnings.length + s.netErrors.length;
  console.log(JSON.stringify(out, null, 2));
} finally { await b.close(); }
process.exit(bad ? 1 : 0);
