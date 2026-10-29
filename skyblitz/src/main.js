// Entry point. Owner: core.
// index.html's inline watchdog (window.__skyBoot) shows the failure overlay if this module graph never gets here; this file tells it when the game is up.
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const boot = window.__skyBoot;
const game = new Game(canvas, { params });
game.init()
  .then(() => { boot?.ready?.(); return game.boot(); })
  .catch((e) => { console.error('[boot]', e); if (!e?.skyShown) boot?.fail?.(); });
