// Slow-network boot check (lead tool). GitHub Pages is not localhost: a visitor's first frames are drawn while textures and models still download,
// and a console warning there is rubric hard cap C1. This boots the page through the quiet harness under CDP network throttling and lists
// every console warning / error / 404 (distinct messages with counts).
//
//   node la-ladera/tests/slownet.mjs [--latency 120] [--down 8] [--cpu 1] [--q autostart] [--eager]
//     --latency  added round trip per request in ms (default 120)     --down  download Mbit/s (default 8)
//     --cpu      CPU slow-down factor (CDP Emulation.setCPUThrottlingRate, default 1): a slow laptop decodes images late
//     --q        query string of the page (default "autostart": the real render loop; use "autostart&manual" for the stepped mode)
//     --eager    boot the full road (`eager=1`: every interior furnished and drawn behind the card, as every release before the lazy default did). Without it the page boots as shipped: LAZY, the card goes away
//                at the playable milestone (`bootSeconds`, `playableSeconds`) and the rest streams in behind it, so the tool then waits for `settled` too (`settledSeconds`) and counts what the page logs on
//                the way: a warning while the barrio streams in is a visitor's warning as much as one in the boot.
//     --url      boot this full URL instead of the local copy (the live site after a release: https://0x4d44.github.io/la-ladera/?autostart)
//     --gzip     the local server compresses text (js, json, html, css, wasm) as GitHub Pages does; the default is the plain server, so the numbers stay comparable with every earlier run.
//                A boot is ~37 MB, ~4.5 MB of it text, ~1.3 MB compressed: report both when you quote a time against a budget.
// Exit code 1 when anything was logged. The fast (unthrottled) boot is the same call with --latency 0 --down 0.
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const LAT = +opt('latency', 120), DOWN = +opt('down', 8), CPU = +opt('cpu', 1), EAGER = argv.includes('--eager'), URL_ARG = opt('url', null), GZIP = argv.includes('--gzip');
const QUERY = opt('q', 'autostart') + (EAGER ? '&eager=1' : '');

const b = await launch({ width: 1280, height: 720, gzip: GZIP, boot: 'shipped' });          // (the page boots as it is: this tool measures the boot, so the harness adds nothing to the URL)
let bad = 1;
try {
  const p = b.page;
  if (LAT > 0 || DOWN > 0) await p.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: DOWN > 0 ? (DOWN * 1e6) / 8 : -1, uploadThroughput: -1 });
  if (CPU > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const t0 = Date.now();
  await p.goto(URL_ARG ?? `${b.baseUrl}/la-ladera/index.html${QUERY ? '?' + QUERY : ''}`, { timeout: 600000 });
  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const lazy = await p.eval('!!(window.__ladera.ctx && window.__ladera.ctx.opts && window.__ladera.ctx.opts.lazy)').catch(() => false);
  let settledSeconds = null;
  if (lazy) { await p.waitFor('typeof window.__ladera.settledMs === "number"', 900000, 250); settledSeconds = +((Date.now() - t0) / 1000).toFixed(1); }
  await new Promise((r) => setTimeout(r, 1500));                       // a few more frames after ready (after the queue, when there is one)
  const s = p.summary();
  const count = (list) => { const m = new Map(); for (const l of list) { const k = String(l).replace(/\s+/g, ' ').slice(0, 160); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].map(([text, n]) => ({ n, text })).sort((a, c) => c.n - a.n); };
  const out = { boot: lazy ? 'lazy' : 'eager', latencyMs: LAT, downMbit: DOWN, cpuSlowdown: CPU, query: QUERY, gzip: GZIP, bootSeconds: seconds, playableSeconds: seconds, settledSeconds, pageErrors: s.errors.length, consoleErrors: count(s.consoleErrors), consoleWarnings: count(s.consoleWarnings), netErrors: count(s.netErrors) };
  bad = s.errors.length + s.consoleErrors.length + s.consoleWarnings.length + s.netErrors.length;
  console.log(JSON.stringify(out, null, 2));
} finally { await b.close(); }
process.exit(bad ? 1 : 0);
