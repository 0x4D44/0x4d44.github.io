import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'artifacts', 'review');
const port = 9444;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function removeScratchTree(path) {
  const tempRoot = tmpdir();
  if (!path.startsWith(`${tempRoot}${sep}`) || !basename(path).startsWith('cairn-review-')) {
    throw new Error(`Refusing to clean an unexpected review profile: ${path}`);
  }
  const removeChildren = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await removeChildren(child);
        await rmdir(child);
      } else await unlink(child);
    }
  };
  await removeChildren(path);
  await rmdir(path);
}

await mkdir(output, { recursive: true });

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);
const chrome = candidates.find(existsSync);
if (!chrome) throw new Error('Chromium or Google Chrome is required for the review capture.');

const profile = await mkdtemp(join(tmpdir(), 'cairn-review-'));
const chromeArgs = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`,
  '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  'about:blank'
];
let command = chrome;
let args = chromeArgs;
if (process.platform === 'linux' && spawnSync('sh', ['-lc', 'command -v xvfb-run'], { encoding: 'utf8' }).status === 0) {
  command = 'xvfb-run';
  args = ['-a', chrome, '--use-gl=angle', '--use-angle=swiftshader', ...chromeArgs];
} else if (process.platform !== 'win32') {
  args = ['--headless=new', ...chromeArgs];
}

const child = spawn(command, args, {
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'ignore', 'pipe']
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });
let socket;

const stopBrowser = () => {
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already stopped */ }
  }
};

try {
  const endpoint = `http://127.0.0.1:${port}`;
  let version = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      version = await fetch(`${endpoint}/json/version`).then(response => response.ok ? response.json() : null);
      if (version) break;
    } catch { /* Chromium is still starting. */ }
    await wait(250);
  }
  if (!version) throw new Error(`Chrome debugging endpoint did not start. ${stderr.slice(-1200)}`);

  const target = await fetch(`${endpoint}/json/new`, { method: 'PUT' }).then(response => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const pageUrl = `${pathToFileURL(join(root, 'index.html')).href}?smoke=1`;
  await send('Page.navigate', { url: pageUrl });

  const evaluate = async (expression, { awaitPromise = false } = {}) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(`Browser evaluation failed: ${description}`);
    }
    return result.result?.value;
  };
  const waitFor = async (expression, predicate, label, timeout = 15000) => {
    const started = Date.now();
    let value;
    while (Date.now() - started < timeout) {
      value = await evaluate(expression);
      if (predicate(value)) return value;
      await wait(100);
    }
    throw new Error(`${label}: ${JSON.stringify(value)}`);
  };
  const waitVisible = id => waitFor(
    `(()=>{const n=document.getElementById(${JSON.stringify(id)});return Boolean(n&&!n.classList.contains('hidden')&&!n.hidden);})()`,
    value => value === true,
    `${id} did not become visible`
  );
  const screenshot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  const viewport = async (width, height, deviceScaleFactor = 1) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
    await wait(260);
  };
  const returnToTitle = async () => {
    await evaluate('window.__game.returnToTitle()');
    await waitVisible('title-screen');
  };
  const prepareDriving = async (stageId, carId) => {
    const expression = `(async()=>{
      const g=window.__game;
      const run=g.session.startPractice({stageId:${JSON.stringify(stageId)},carId:${JSON.stringify(carId)},difficultyId:'normal'});
      run.mode='practice';
      g.configureRun(run);
      await g.beginRun(false);
      g.mode='paused';
      g.hideScreens();
      g.ui.hud.classList.remove('hidden');
      g.ui.pace.classList.add('hidden');
      g.ui.countdown.classList.add('hidden');
      g.race.state='racing';
      g.race.countdown=0;
      const distance=Math.min(Math.max(14,g.stage.length*.34),g.stage.length-20);
      g.car.reset(distance,true);
      const speed=18;
      g.car.vx=Math.sin(g.car.yaw)*speed;
      g.car.vz=Math.cos(g.car.yaw)*speed;
      g.car.longitudinalSpeed=speed;
      g.car.lateralSpeed=0;
      g.car.slipAngle=0;
      g.car.slipAmount=0;
      g.camera.reset(g.car);
      g.updateHud();
      return {stage:g.activeRun.stage.id,car:g.activeRun.car.id};
    })()`;
    return evaluate(expression, { awaitPromise: true });
  };

  await waitFor('Boolean(window.__game)', value => value === true, 'game did not boot from the actual file URL');
  await wait(900);
  const catalog = await evaluate('({stages:window.__game.session.catalog.stages.map(stage=>({id:stage.id,name:stage.name})),cars:window.__game.session.catalog.cars.map(car=>({id:car.id,name:car.name}))})');
  if (!catalog || catalog.stages.length !== 6 || catalog.cars.length !== 6) {
    throw new Error(`Review requires six authored stages and cars, got ${JSON.stringify(catalog)}`);
  }
  const files = [
    '01-title.png', '02-selection.png', '03-service.png', '04-settings.png', '05-pause.png', '06-result.png', '07-standings.png',
    '08-shell-390x844.png', '09-shell-768x1024.png',
    ...catalog.stages.map((stage, index) => `region-${String(index + 1).padStart(2, '0')}-${stage.id}.png`),
    ...catalog.cars.map((car, index) => `car-${String(index + 1).padStart(2, '0')}-${car.id}.png`)
  ];
  for (const file of files) {
    try { await unlink(join(output, file)); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  // The seven major shells: title, selection, service, settings, pause, result, standings.
  await returnToTitle();
  await screenshot('01-title');
  await evaluate("window.__game.showSelection('practice')");
  await waitVisible('selection-screen');
  await screenshot('02-selection');
  await returnToTitle();
  await evaluate("(()=>{const g=window.__game;g.session.createChampionship({carId:g.session.catalog.cars[0].id,difficultyId:'normal',seed:4401});g.showService();})()");
  await waitVisible('service-screen');
  await screenshot('03-service');
  await returnToTitle();
  await evaluate('window.__game.showSettings()');
  await waitVisible('settings-screen');
  await screenshot('04-settings');

  await prepareDriving(catalog.stages[0].id, catalog.cars[0].id);
  await evaluate("(()=>{const g=window.__game;g.mode='playing';g.pause();})()");
  await waitVisible('pause-screen');
  await screenshot('05-pause');

  await prepareDriving(catalog.stages[0].id, catalog.cars[0].id);
  await evaluate("window.__game.finishRun({time:277.18,splits:[{time:89.16},{time:181.31},{time:277.18}]})");
  await waitVisible('result-screen');
  await screenshot('06-result');

  await returnToTitle();
  await evaluate("(()=>{const g=window.__game;g.session.createChampionship({carId:g.session.catalog.cars[0].id,difficultyId:'normal',seed:4402});g.showOverallStandings();})()");
  await waitVisible('standings-screen');
  await screenshot('07-standings');

  // Responsive shell evidence at the two requested viewport sizes.
  await returnToTitle();
  await viewport(390, 844);
  await screenshot('08-shell-390x844');
  await evaluate('window.__game.showSettings()');
  await waitVisible('settings-screen');
  await viewport(768, 1024);
  await screenshot('09-shell-768x1024');
  await viewport(1280, 720);

  // One driving frame per region. Pair each stage with a different car so the
  // region set also exercises every authored silhouette in a visible view.
  for (let index = 0; index < catalog.stages.length; index += 1) {
    const stage = catalog.stages[index];
    const car = catalog.cars[index % catalog.cars.length];
    await prepareDriving(stage.id, car.id);
    await wait(460);
    await screenshot(`region-${String(index + 1).padStart(2, '0')}-${stage.id}`);
  }

  // Explicit car evidence: each profile gets a close, moving chase view.
  for (let index = 0; index < catalog.cars.length; index += 1) {
    const car = catalog.cars[index];
    await prepareDriving(catalog.stages[0].id, car.id);
    await wait(460);
    await screenshot(`car-${String(index + 1).padStart(2, '0')}-${car.id}`);
  }

  console.log(JSON.stringify({ output, count: files.length, files }, null, 2));
  await send('Page.close');
} finally {
  try { socket?.close(); } catch { /* best effort */ }
  stopBrowser();
  await removeScratchTree(profile);
}
