// Conversation orchestrator: locks the player, turns the NPC, drives the dialogue engine, subtitles + speech + panel.
//   talk.begin(npc) -> true | false;   talk.pick(id);   talk.skip();   talk.leave();   talk.update(dt)
// Events: 'npc:talk' {id,name,persona} at the start, 'npc:line' {id,name,es,en} for every spoken line, 'npc:end' {id}.
import { Dialogue } from './dialogue.js';
import { BANK } from './lines/index.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Talk {
  constructor(world) {
    this.w = world; this.ctx = world.ctx; this.npc = null; this.dlg = null; this.step = null; this.rec = null; this.token = 0;
    this.lastLine = null; this.count = 0; this.subTimer = 0;
  }

  get active() { return !!this.npc; }
  get ui() { return this.w.ui; }

  /** Start talking to `npc`. Returns false when busy or the player does not exist yet. */
  begin(npc) {
    const w = this.w, ctx = this.ctx, pl = ctx.player;
    if (this.npc || !pl || !npc || npc.away) return false;
    this.npc = npc; const tok = ++this.token; this.count++;
    clearTimeout(this.subTimer);
    pl.lock('dialogue');
    w.syncPlayer();
    npc.beginTalk(w.svc, w.player);
    this.dlg = new Dialogue({
      npc: { id: npc.id, persona: npc.bank, name: npc.display, mem: npc.mem, x: npc.x, z: npc.z, shopName: npc.shopName, gender: npc.gender, act: npc.act },
      bank: BANK, rng: npc.rng, hour: ctx.hour,
      world: { landmarks: w.landmarks, discoveries: this._discoveries(), player: { x: pl.s.x, y: pl.s.y, z: pl.s.z, yaw: pl.yaw } },
    });
    this.ui.show({ name: npc.display, role: npc.roleLabel }, { onPick: (id) => this.pick(id), onSkip: () => this.skip(), onLeave: () => this.leave() });
    ctx.events.emit('npc:talk', { id: npc.id, name: npc.display, persona: npc.persona });
    this._show(this.dlg.open(), tok);
    return true;
  }

  _discoveries() {
    const d = this.ctx.discover; if (!d) return [];
    return [...d.items.values()].map((x) => ({ id: x.id, name: x.name, en: x.en, x: x.x, y: x.y, z: x.z, found: d.found.has(x.id) }));
  }

  _show(step, tok) {
    if (tok !== this.token || !this.npc) return;
    this.step = step; const n = this.npc, ctx = this.ctx, ln = step.line;
    if (step.buy) {                                              // a purchase: say so on screen (no inventory in this game, it is a conversation)
      const b = step.buy, price = b.price ? ` · ${String(b.price).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} pesos` : '';
      ctx.ui.toast(`Compraste ${b.name?.[0] ?? 'algo'}${price}`, 2600);
      ctx.events.emit('npc:buy', { id: n.id, item: b.id, price: b.price });
    }
    if (ln) {
      this.lastLine = ln;
      ctx.ui.subtitle({ who: n.display, es: ln.es, en: ln.en });
      ctx.events.emit('npc:line', { id: n.id, name: n.display, es: ln.es, en: ln.en });
      this.rec = this.w.speech.speak(ln.es, n.voice);
      n.speakUntil = this.w.t + this.w.speech.estimate(ln.es) / 1000;
    }
    this.ui.setChoices(step.end ? [] : step.choices);
    if (step.end) {
      const rec = this.rec;
      const fin = () => setTimeout(() => this._finish(tok, false), 1100);
      if (rec?.done) rec.done.then(fin); else fin();
    }
  }

  pick(id) {
    if (!this.npc || this.step?.end) return false;
    const tok = this.token;
    this.w.speech.cancel();
    this._show(this.dlg.pick(id), tok);
    return true;
  }

  /** Stop the voice but keep the subtitle on screen. */
  skip() { this.w.speech.cancel(); if (this.npc) this.npc.speakUntil = 0; }

  /** Leave the conversation right now. */
  leave() { if (!this.npc) return; this.w.speech.cancel(); this._finish(this.token, true); }

  _finish(tok, abrupt) {
    if (tok !== this.token || !this.npc) return;
    const w = this.w, ctx = this.ctx, n = this.npc;
    this.npc = null; this.dlg = null; this.step = null; this.rec = null; n.speakUntil = 0;
    this.ui.hide();
    ctx.player?.unlock('dialogue');
    n.endTalk(w.svc);
    ctx.events.emit('npc:end', { id: n.id });
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => { if (!this.npc) ctx.ui.subtitle(null); }, abrupt ? 150 : 1800);
  }

  /** Per frame while talking: ease the player's view onto the NPC's face. */
  update(dt) {
    const n = this.npc, pl = this.ctx.player; if (!n || !pl) return;
    const dx = n.x - pl.s.x, dz = n.z - pl.s.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(-dx, -dz), k = Math.min(1, dt * 4);
    pl.yaw += angDiff(pl.yaw, want) * k;
    const headY = n.y + (n.view?.meta?.eyeHeightM ?? 1.5) - 0.02, wantP = Math.atan2(headY - pl.eyeY, d);
    pl.pitch += (clamp(wantP, -0.5, 0.5) - pl.pitch) * k;
  }
}
