// Persistent browser driver: one headless GPU Chrome behind a tiny HTTP API, so a session (human or agent) can play the real game
// step by step from a shell without relaunching Chrome for every command.
//   node skyblitz/tests/tools/drive.mjs [--port 9333] [--w 1280] [--h 720] [--dpr 1]      (run it as a background task)
// Commands (GET unless noted; every reply is JSON):
//   /goto?url=<url>                      navigate and wait for document.readyState === 'complete'
//   /eval            (POST body = JS)    evaluate in the page (awaits promises) -> { value }
//   /key?name=Enter[&type=press|down|up][&hold=40]      one key event (KeyboardEvent.code names: KeyW, ArrowUp, Space, ShiftLeft...)
//   /keys?seq=Enter,ArrowDown,KeyE[&gap=150]            a sequence of presses
//   /click?x=640&y=360                   mouse click; /move?x&y moves the pointer only
//   /shot?file=<abs path>[&format=jpeg|png][&quality=88]   screenshot of the viewport
//   /viewport?w=390&h=844[&dpr=2][&mobile=1]            resize (the game re-lays out)
//   /logs[?all=1][&clear=1]              console errors/exceptions (or everything) seen since the last navigation
//   /quit                                close Chrome and exit
import http from 'node:http';
import { launchChrome } from './chrome.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d; };
const port = +arg('port', 9333), w = +arg('w', 1280), h = +arg('h', 720), dpr = +arg('dpr', 1);
const chrome = await launchChrome({ width: w, height: h, dpr });
const page = await chrome.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function handle(req, url, body) {
  const q = url.searchParams;
  switch (url.pathname) {
    case '/goto': await page.goto(q.get('url')); return { ok: true };
    case '/eval': return { value: await page.eval(body) };
    case '/key': await page.key(q.get('name'), { type: q.get('type') || 'press', hold: +(q.get('hold') || 40) }); return { ok: true };
    case '/keys': for (const k of q.get('seq').split(',')) { await page.key(k); await sleep(+(q.get('gap') || 150)); } return { ok: true };
    case '/click': await page.click(+q.get('x'), +q.get('y')); return { ok: true };
    case '/move': await page.mouse('mouseMoved', +q.get('x'), +q.get('y')); return { ok: true };
    case '/shot': await page.screenshot(q.get('file'), { format: q.get('format') || 'jpeg', quality: +(q.get('quality') || 88) }); return { file: q.get('file') };
    case '/viewport': await page.setViewport(+q.get('w'), +q.get('h'), { dpr: +(q.get('dpr') || 1), mobile: q.get('mobile') === '1' }); return { ok: true };
    case '/logs': {
      const out = q.get('all') === '1' ? [...page.logs] : page.errors();
      if (q.get('clear') === '1') page.logs.length = 0;
      return { logs: out };
    }
    case '/quit': setTimeout(async () => { await chrome.close(); process.exit(0); }, 50); return { ok: true };
    default: throw new Error('unknown command ' + url.pathname);
  }
}

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    try {
      const out = await handle(req, new URL(req.url, 'http://x'), Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) })); }
  });
}).listen(port, '127.0.0.1', () => console.log(`drive: Chrome ${w}x${h} ready on http://127.0.0.1:${port}  (pid ${chrome.pid})`));
