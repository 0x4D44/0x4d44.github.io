// DOM HUD: dial, lever, door buttons, prompts, score log, menus, help, touch joystick. Keyboard+touch.
import { fmtTime, fmtDist, clamp } from './util.js';

const CSS = `
.gs-root{position:absolute;inset:0;pointer-events:none;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#f4efe3;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.gs-root *{box-sizing:border-box}
.gs-root button{font:inherit;color:inherit;pointer-events:auto;cursor:pointer;background:rgba(18,24,34,.82);border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:7px 10px;min-height:36px;touch-action:manipulation}
.gs-root button:hover{background:rgba(40,52,72,.9)}.gs-root button.on{background:#e8741a;color:#111;border-color:#ffb36b}
.gs-root button:focus-visible{outline:2px solid #ffb36b}
.gs-top{position:absolute;top:8px;left:116px;right:8px;display:flex;gap:8px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.gs-card{background:rgba(10,14,22,.72);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 12px;backdrop-filter:blur(4px);pointer-events:none}
.gs-next b{font-size:16px;color:#ffd89a}.gs-next small{color:#9fb3c8}
.gs-btns{display:flex;gap:6px;pointer-events:none}.gs-btns button{pointer-events:auto}
.gs-toast{position:absolute;top:64px;left:50%;transform:translateX(-50%);max-width:92vw;text-align:center;padding:8px 16px;border-radius:999px;background:rgba(10,14,22,.85);border:1px solid rgba(255,255,255,.2);font-weight:600;opacity:0;transition:opacity .25s;pointer-events:none}
.gs-toast.show{opacity:1}.gs-toast.warn{border-color:#ffb36b;color:#ffd89a}.gs-toast.bad{border-color:#ff5a4a;color:#ff9a8f;background:rgba(60,10,10,.88)}
.gs-prompt{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);padding:9px 18px;border-radius:10px;background:rgba(10,14,22,.82);border:1px solid #ffb36b;font-weight:600;display:none;pointer-events:auto;cursor:pointer;text-align:center;max-width:90vw}
.gs-prompt kbd,.gs-help kbd{background:#e8741a;color:#111;border-radius:4px;padding:1px 6px;font:600 12px monospace}
.gs-dial{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:176px;height:176px;pointer-events:none}
.gs-lever{position:absolute;right:10px;bottom:10px;display:flex;flex-direction:column;gap:3px;pointer-events:none;width:92px}
.gs-root .gs-lever button,.gs-root .gs-doors button,.gs-root .gs-btns button{pointer-events:auto!important}
.gs-lever button{padding:4px 6px;min-height:30px;text-align:left}
.gs-lever .eb{background:rgba(140,20,20,.9);border-color:#ff7a7a;font-weight:700}
.gs-doors{position:absolute;left:10px;bottom:10px;display:grid;grid-template-columns:repeat(2,auto);gap:5px;pointer-events:none;max-width:200px}
.gs-doors button{pointer-events:auto}
.gs-score{position:absolute;right:112px;bottom:10px;width:210px;pointer-events:none}
.gs-score .row{display:flex;justify-content:space-between}.gs-score .bar{height:6px;border-radius:3px;background:#223;overflow:hidden;margin-top:3px}.gs-score .bar i{display:block;height:100%;background:#f2a33a}
.gs-log{position:absolute;left:10px;top:70px;width:260px;max-height:40vh;overflow:auto;display:none;pointer-events:auto}
.gs-log div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.08);padding:2px 0;font-size:12px}
.gs-log .neg{color:#ff9a8f}.gs-log .pos{color:#9dffb0}
.gs-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(255,255,255,.7);display:none;pointer-events:none}
.gs-joy{position:absolute;left:18px;bottom:34px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.25);display:none;pointer-events:auto;touch-action:none}
.gs-joy i{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.35)}
.gs-act{position:absolute;right:16px;bottom:150px;display:none;flex-direction:column;gap:8px;pointer-events:none}.gs-act button{pointer-events:auto;min-width:64px;min-height:54px;font-size:15px;font-weight:700}
.gs-modal{position:absolute;inset:0;background:rgba(5,8,14,.78);display:none;align-items:center;justify-content:center;pointer-events:auto;padding:14px;overflow:auto}
.gs-panel{background:#101722;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:16px 18px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.gs-panel h2{margin:0 0 4px;font-size:20px;color:#ffb36b}.gs-panel h3{margin:14px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9fb3c8}
.gs-row{display:flex;flex-wrap:wrap;gap:6px}.gs-row button{flex:0 0 auto}
.gs-panel select{font:inherit;background:#18212f;color:#f4efe3;border:1px solid #445;border-radius:8px;padding:7px;width:100%;pointer-events:auto}
.gs-help table{border-collapse:collapse;width:100%}.gs-help td{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}.gs-help td:first-child{white-space:nowrap;width:1%}
.gs-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none!important;transition:opacity .45s}
.gs-root .gs-cross,.gs-root .gs-toast,.gs-root .gs-card,.gs-root .gs-top,.gs-root .gs-dial,.gs-root .gs-lever,.gs-root .gs-doors,.gs-root .gs-score,.gs-root .gs-btns{pointer-events:none!important}
.gs-fade.on{opacity:1}
.gs-vig{position:absolute;left:50%;top:110px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;background:rgba(160,20,20,.9);font-weight:700;display:none;pointer-events:auto;cursor:pointer}
@media (max-width:640px){
 .gs-dial{width:132px;height:132px;bottom:6px}.gs-lever{width:76px;bottom:6px;right:6px}.gs-lever button{min-height:26px;padding:2px 5px;font-size:12px}
 .gs-doors{bottom:6px;left:6px;max-width:150px}.gs-doors button{padding:4px 6px;min-height:32px;font-size:12px}
 .gs-score{display:none}.gs-top{left:116px}.gs-card{padding:5px 9px}.gs-next b{font-size:14px}.gs-prompt{bottom:30%}
 .gs-log{width:70vw}.gs-toast{top:118px;font-size:12px}
}
`;

const DIAL_MAX = 60;
export class Hud {
  constructor(container, h) {
    this.h = h; this.container = container;
    if (!document.getElementById('gs-css')) { const st = document.createElement('style'); st.id = 'gs-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.root = document.createElement('div'); el.className = 'gs-root';
    el.innerHTML = `
<div class="gs-cross"></div>
<div class="gs-top"><div class="gs-card gs-next"><div><b data-k="next">-</b> <small data-k="dist"></small></div><div><small data-k="sub"></small></div></div>
 <div class="gs-btns"><button data-a="log" title="Score log">Score</button><button data-a="help" title="Controls (H)">?</button><button data-a="mute" title="Mute (M)">Sound</button><button data-a="menu" title="Menu (Esc)">Menu</button></div></div>
<div class="gs-toast"></div>
<div class="gs-vig" data-a="vig">VIGILANCE - tap here</div>
<div class="gs-log gs-card"></div>
<canvas class="gs-dial" width="400" height="400"></canvas>
<div class="gs-lever" data-g="drive"></div>
<div class="gs-doors" data-g="drive"><button data-a="sideL" title=", key">Side L</button><button data-a="sideR" title=". key">Side R</button><button data-a="open" title="O">Open (O)</button><button data-a="close" title="P">Close (P)</button><button data-a="ato" title="A">ATO (A)</button><button data-a="rev" title="R" style="display:none">Reverse</button></div>
<div class="gs-card gs-score" data-g="drive"></div>
<div class="gs-prompt"></div>
<div class="gs-joy"><i></i></div>
<div class="gs-act"><button data-a="interact">E</button><button data-a="jump" style="display:none"></button></div>
<div class="gs-fade"></div>
<div class="gs-modal"><div class="gs-panel"></div></div>`;
    container.appendChild(el);
    this.q = (s) => el.querySelector(s);
    this.dial = this.q('.gs-dial'); this.dg = this.dial.getContext('2d');
    this.toastEl = this.q('.gs-toast'); this.promptEl = this.q('.gs-prompt'); this.modal = this.q('.gs-modal'); this.panel = this.q('.gs-panel');
    this.logEl = this.q('.gs-log'); this.fade = this.q('.gs-fade');
    this._buildLever();
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) this.h.onAction(b.dataset.a, b); });
    this.promptEl.addEventListener('click', () => this.h.onAction('interact'));
    this.modal.addEventListener('click', (e) => { if (e.target === this.modal && this.modalKind !== 'start') this.closeModal(); });
    this._toastT = 0; this.touch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
    this._joy();
    this.mode = 'drive'; this.last = {};
  }
  _buildLever() {
    const lv = this.q('.gs-lever'); lv.innerHTML = '';
    const names = ['P3', 'P2', 'P1', 'COAST', 'B1', 'B2', 'B3'];
    names.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.dataset.n = String(3 - i); b.onclick = () => this.h.onLever(3 - i); lv.appendChild(b); });
    const eb = document.createElement('button'); eb.className = 'eb'; eb.textContent = 'EMERG (X)'; eb.onclick = () => this.h.onAction('eb'); lv.appendChild(eb);
    this.leverBtns = [...lv.querySelectorAll('button[data-n]')];
  }
  _joy() {
    const j = this.q('.gs-joy'), knob = j.querySelector('i'); this.joy = { x: 0, y: 0 };
    let id = null;
    const set = (e) => { const r = j.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.joy.x = x; this.joy.y = y; knob.style.transform = `translate(${x * 35}px,${y * 35}px)`; };
    j.addEventListener('pointerdown', (e) => { id = e.pointerId; j.setPointerCapture(id); set(e); e.preventDefault(); });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId === id) { id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; } };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  }
  setMode(mode) {
    this.mode = mode;
    const drive = mode === 'drive';
    this.root.querySelectorAll('[data-g="drive"]').forEach((e) => { e.style.display = drive ? '' : 'none'; });
    this.dial.style.display = drive ? '' : 'none';
    this.q('.gs-cross').style.display = !drive && mode !== 'menu' ? 'block' : 'none';
    const walk = !drive;
    this.q('.gs-joy').style.display = walk && this.touch ? 'block' : 'none';
    this.q('.gs-act').style.display = this.touch ? 'flex' : 'none';
    if (this.touch && drive) this.q('.gs-act').style.display = 'none';
    if (drive && window.innerWidth < 640) this.q('.gs-score').style.display = 'none';
  }
  toast(text, kind = 'info', secs = 3) {
    this.toastEl.textContent = text; this.toastEl.className = 'gs-toast show ' + kind; clearTimeout(this._tt); this._tt = setTimeout(() => this.toastEl.classList.remove('show'), secs * 1000);
  }
  prompt(html) { if (html === this._prompt) return; this._prompt = html; this.promptEl.style.display = html ? 'block' : 'none'; this.promptEl.innerHTML = html || ''; }
  setFade(on) { this.fade.classList.toggle('on', on); }
  setMute(m) { const b = this.q('[data-a="mute"]'); b.textContent = m ? 'Muted' : 'Sound'; b.classList.toggle('on', m); }
  /** per-frame info */
  update(info, extra) {
    const q = this.q.bind(this);
    q('[data-k="next"]').textContent = extra.title; q('[data-k="dist"]').textContent = extra.distText || '';
    q('[data-k="sub"]').textContent = extra.sub || '';
    if (this.mode === 'drive' && info) { this._dial(info); this._lever(info); this._score(info, extra); this._doors(info); }
    const vig = q('.gs-vig'); vig.style.display = info && info.vigil > 22 && this.mode === 'drive' ? 'block' : 'none';
    if (this.logEl.style.display === 'block') this._log(info);
  }
  _doors(info) {
    const q = this.q.bind(this);
    q('[data-a="sideL"]').classList.toggle('on', this.h.doorSel() < 0); q('[data-a="sideR"]').classList.toggle('on', this.h.doorSel() > 0);
    q('[data-a="ato"]').classList.toggle('on', info.ato);
    q('[data-a="rev"]').style.display = info.canReverse ? '' : 'none';
    q('[data-a="open"]').classList.toggle('on', !info.doorsClosed);
  }
  _lever(info) {
    for (const b of this.leverBtns) b.classList.toggle('on', !info.ato && +b.dataset.n === info.lever);
  }
  _score(info, extra) {
    const el = this.q('.gs-score'); const p = info.pax, sc = info.score;
    const late = extra.late;
    el.innerHTML = `<div class="row"><span>Score</span><b>${Math.round(sc.total)}</b></div>
<div class="row"><span>Passengers</span><b>${Math.round(p.onboard)}</b></div>
<div class="row"><span>Boarding / alighting</span><b>${Math.max(0, Math.ceil(p.boarding))} / ${Math.max(0, Math.ceil(p.alighting))}</b></div>
<div class="row"><span>Waiting</span><b>${Math.round(p.waiting)}</b></div>
${late != null ? `<div class="row"><span>Timetable</span><b style="color:${Math.abs(late) < 15 ? '#9dffb0' : '#ffb36b'}">${late >= 0 ? '+' : ''}${Math.round(late)} s</b></div>` : ''}
<div class="row"><span>Last stop</span><b>${info.stopStatus ? info.stopStatus.label + ' ' + (info.stopStatus.err >= 0 ? '+' : '') + info.stopStatus.err.toFixed(1) + 'm' : '-'}</b></div>
<div class="bar"><i style="width:${Math.min(100, Math.max(0, sc.max ? sc.total / sc.max * 100 : 0))}%"></i></div>`;
  }
  _log(info) {
    if (!info) return; const l = info.score.log.slice(-40).reverse();
    this.logEl.innerHTML = '<b>Driver log</b>' + (l.length ? l.map((e) => `<div class="${e.delta < 0 ? 'neg' : 'pos'}"><span>${fmtTime(e.t)} ${e.text}</span><b>${e.delta > 0 ? '+' : ''}${e.delta}</b></div>`).join('') : '<div>No events yet.</div>');
  }
  toggleLog() { this.logEl.style.display = this.logEl.style.display === 'block' ? 'none' : 'block'; }
  _dial(info) {
    const g = this.dg, S = 400, c = S / 2, R = 180; g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(c, c, R + 10, 0, 7); g.fillStyle = 'rgba(8,12,20,.82)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.25)'; g.stroke();
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, ang = (k) => a0 + (a1 - a0) * Math.min(1, k / DIAL_MAX);
    // limit arc
    g.lineWidth = 12; g.strokeStyle = '#2b3a50'; g.beginPath(); g.arc(c, c, R - 20, a0, a1); g.stroke();
    g.strokeStyle = '#2f9e5a'; g.beginPath(); g.arc(c, c, R - 20, a0, ang(info.limitKmh)); g.stroke();
    g.strokeStyle = '#c83'; g.beginPath(); g.arc(c, c, R - 20, ang(info.limitKmh), ang(Math.min(DIAL_MAX, info.limitKmh + 6))); g.stroke();
    // safe speed (braking curve) marker
    if (this.h.hints()) { const sa = ang(Math.min(DIAL_MAX, info.safeKmh)); g.strokeStyle = '#7fd4ff'; g.lineWidth = 6; g.beginPath(); g.moveTo(c + Math.cos(sa) * (R - 44), c + Math.sin(sa) * (R - 44)); g.lineTo(c + Math.cos(sa) * (R - 2), c + Math.sin(sa) * (R - 2)); g.stroke(); }
    g.fillStyle = '#dfe8f2'; g.font = '600 22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= DIAL_MAX; k += 10) { const a = ang(k); g.fillText(k, c + Math.cos(a) * (R - 58), c + Math.sin(a) * (R - 58)); g.lineWidth = 3; g.strokeStyle = '#dfe8f2'; g.beginPath(); g.moveTo(c + Math.cos(a) * (R - 36), c + Math.sin(a) * (R - 36)); g.lineTo(c + Math.cos(a) * (R - 28), c + Math.sin(a) * (R - 28)); g.stroke(); }
    const na = ang(info.kmh); g.strokeStyle = info.kmh > info.limitKmh + 1 ? '#ff5a4a' : '#ffb36b'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(na) * (R - 30), c + Math.sin(na) * (R - 30)); g.stroke();
    g.fillStyle = '#ffb36b'; g.beginPath(); g.arc(c, c, 10, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = '700 54px system-ui'; g.fillText(Math.round(info.kmh), c, c + 70); g.font = '18px system-ui'; g.fillStyle = '#9fb3c8'; g.fillText('km/h  limit ' + Math.round(info.limitKmh), c, c + 105);
    // brake pressure
    g.fillStyle = '#243'; g.fillRect(c - 70, c + 125, 140, 12); g.fillStyle = info.eb ? '#f33' : '#f2a33a'; g.fillRect(c - 70, c + 125, 140 * Math.min(1, info.brakeBar / 4), 12);
    g.fillStyle = '#9fb3c8'; g.font = '14px system-ui'; g.fillText('BRAKE ' + info.brakeBar.toFixed(1) + ' bar', c, c + 152);
    if (info.assist) { g.fillStyle = '#7dffa0'; g.font = '700 16px system-ui'; g.fillText('ASSIST', c, c - 50); }
  }
  openModal(html, kind = 'menu') { this.modalKind = kind; this.panel.innerHTML = html; this.modal.style.display = 'flex'; this.h.onModal && this.h.onModal(true); }
  closeModal() { this.modal.style.display = 'none'; this.modalKind = null; this.h.onModal && this.h.onModal(false); }
  get modalOpen() { return this.modal.style.display === 'flex'; }
  dispose() { this.root.remove(); }
}

export const HELP_HTML = `<div class="gs-help"><h2>Controls</h2>
<h3>Driving</h3><table>
<tr><td><kbd>W</kbd> <kbd>&uarr;</kbd></td><td>Master controller toward power (P1-P3)</td></tr>
<tr><td><kbd>S</kbd> <kbd>&darr;</kbd></td><td>Toward brake (B1-B3). Coast is the middle notch.</td></tr>
<tr><td><kbd>X</kbd> / <kbd>Backspace</kbd></td><td>Emergency brake (hold)</td></tr>
<tr><td><kbd>Space</kbd></td><td>Vigilance (dead-man) acknowledge</td></tr>
<tr><td><kbd>O</kbd> / <kbd>P</kbd></td><td>Open / close doors (must be stopped in the platform)</td></tr>
<tr><td><kbd>,</kbd> <kbd>.</kbd></td><td>Select door side Left / Right (platform side is shown on the TMS)</td></tr>
<tr><td><kbd>A</kbd></td><td>Toggle ATO (auto drive)</td></tr>
<tr><td><kbd>R</kbd> (hold)</td><td>Reverse shunt after an overrun</td></tr>
<tr><td>Mouse / <kbd>&larr;</kbd> <kbd>&rarr;</kbd> / drag</td><td>Look around (click the view to capture the mouse, <kbd>Esc</kbd> releases it; sensitivity and invert-Y are in the menu)</td></tr></table>
<h3>On foot / in the saloon</h3><table>
<tr><td><kbd>WASD</kbd></td><td>Walk (<kbd>Shift</kbd> to hurry); mouse (click to capture, <kbd>Esc</kbd> releases) / drag / arrows to look</td></tr>
<tr><td><kbd>E</kbd></td><td>Interact: board the train, take the driver's seat, alight, go outside</td></tr></table>
<h3>General</h3><table>
<tr><td><kbd>Esc</kbd></td><td>Menu / pause</td></tr><tr><td><kbd>H</kbd></td><td>This help</td></tr><tr><td><kbd>M</kbd></td><td>Mute</td></tr><tr><td><kbd>L</kbd></td><td>Score log</td></tr></table>
<p>Stop with the nose of the train on the mark for a perfect berthing. Doors open only when stopped inside the platform, on the platform side. Depart when the signal clears; passing it at red is a SPAD.</p>
<p style="font-size:12px;opacity:.75"><a href="credits.html" target="_blank" rel="noopener" style="color:#ff9a4a">Credits &amp; data sources</a> (OpenStreetMap contributors, MakeHuman community assets and more)</p>
<div class="gs-row"><button data-a="closemodal">Close</button></div></div>`;
