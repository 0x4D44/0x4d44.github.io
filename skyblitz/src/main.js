// Entry point. Owner: lead.
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const game = new Game(canvas, { params });
game.init().then(() => game.boot()).catch((e) => console.error('[boot]', e));
