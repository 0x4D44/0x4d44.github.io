// STUB UI (title button + minimal HUD). The UI agent REPLACES this with the full front end (menus, aircraft/course select, HUD, results,
// pause, settings, touch controls). Contract: constructor(game); init(); show(screen); hide(screen); update(dt, game).
// The UI listens to game.events (see the catalogue) and calls game.startRace(cfg) / game.quit() / game.setPaused(). It must NOT put interactive
// controls in the top-left 112x44 px (the Almanac back pill sits there) and must never overflow horizontally at 390px or 768px width.
export class UI {
  constructor(game) { this.game = game; this.root = document.getElementById('ui'); }
  init() {
    const css = 'position:absolute;color:#fff;font:700 20px system-ui;text-shadow:0 2px 6px #0008;';
    this.title = document.createElement('div');
    this.title.style.cssText = css + 'inset:0;display:grid;place-content:center;text-align:center;gap:12px;background:#0006;';
    this.title.innerHTML = '<div style="font-size:min(14vw,72px);letter-spacing:.08em">SKYBLITZ</div><div>Air Racing Grand Prix (stub UI)</div>';
    const b = document.createElement('button'); b.textContent = 'Start race'; b.style.cssText = 'font:700 20px system-ui;padding:12px 28px;border-radius:12px;border:0;background:#ffb020;cursor:pointer';
    b.onclick = () => { this.hide('title'); this.game.startRace({ ...this.game.raceConfigFromParams(), demo: false }); };
    this.title.appendChild(b); this.root.appendChild(this.title);
    this.hud = document.createElement('div'); this.hud.style.cssText = css + 'left:120px;top:12px;white-space:pre'; this.root.appendChild(this.hud);
    this.big = document.createElement('div'); this.big.style.cssText = css + 'left:0;right:0;top:30%;text-align:center;font-size:min(20vw,120px)'; this.root.appendChild(this.big);
    const ev = this.game.events;
    ev.on('race:countdown', ({ n }) => { this.big.textContent = n; });
    ev.on('race:go', () => { this.big.textContent = 'GO!'; setTimeout(() => { this.big.textContent = ''; }, 900); });
    ev.on('race:finish', ({ racer }) => { if (racer.isPlayer) this.big.textContent = 'FINISH!'; });
  }
  show(screen) { if (screen === 'title') this.title.style.display = 'grid'; }
  hide(screen) { if (screen === 'title') this.title.style.display = 'none'; }
  update(dt, game) {
    const p = game.player; if (!p) { this.hud.textContent = ''; return; }
    this.hud.textContent = `${Math.round(p.flight.speed * 3.6)} km/h   LAP ${p.lap}/${game.race.laps}   P${p.place}`;
  }
}
