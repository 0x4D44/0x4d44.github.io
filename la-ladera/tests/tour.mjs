// End-to-end tour of the integrated page: what a first-time visitor does in the first minutes, driven through the real game (real physics, real door
// interactables, real people, real speech path) in headless Chrome. Prints a checklist and exits 1 when anything fails.
//   node --import ./la-ladera/tests/register.mjs la-ladera/tests/tour.mjs [--only boot,spawn,doors,talk] [--q "seed=7"] [--json .scratch/x/tour.json] [--talk 6]
// boot   the page boots with no console/network errors
// spawn  the player stands on the ground at the plan's spawn and can walk uphill
// doors  every building can be entered through every entrance by walking: aim at the door, press E when it is closed, walk in (real colliders)
// talk   people can be aimed at, E starts a Spanish conversation (subtitle + the line "spoken" through the simulated speech), a reply works, leaving unlocks
import './nice.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = new Set(String(arg('only', 'boot,spawn,doors,talk')).split(','));
const Q = arg('q', '');
const TALKS = +arg('talk', 6);

// ---- page-side checks (stringified into the page: no closures) ----------------------------------------------------------------------
function pageSpawn() {
  const L = window.__ladera, ctx = L.ctx, P = ctx.player, sp = ctx.plan?.spawn, s0 = L.state();
  const x0 = P.s.x, z0 = P.s.z, y0 = P.s.y;
  L.walk(1, 0, 6);
  const s1 = L.state(), moved = Math.hypot(P.s.x - x0, P.s.z - z0);
  return { spawn: sp ? [sp.x, sp.z, sp.yaw] : null, start: s0.pos, onGround: s0.onGround, indoors: !!s0.indoors, moved: +moved.toFixed(2), rose: +(P.s.y - y0).toFixed(2), blocked: !!s1.blocked, end: s1.pos, errors: ctx.errors.length };
}

function pageDoors() {
  const L = window.__ladera, ctx = L.ctx, P = ctx.player, dirv = new ctx.THREE.Vector3(), out = [];
  const aim = () => { ctx.interact.update(ctx.camera.position, ctx.camera.getWorldDirection(dirv)); return ctx.interact.target; };
  for (const b of L.buildings()) {
    for (const e of (b.entrances ?? [])) {
      const rec = { id: b.id, kind: b.kind, entrance: e.id ?? null, ok: false, why: '' };
      try {
        const [ox, , oz] = e.outside, [ix, , iz] = e.inside;
        const dx = ix - ox, dz = iz - oz, d = Math.hypot(dx, dz) || 1;
        L.teleport(ox - dx / d * 0.6, oz - dz / d * 0.6, { yaw: e.yawIn, pitch: -0.12 });
        L.step(3);
        if (!P.s.onGround) { rec.why = 'not on the ground after teleport'; out.push(rec); continue; }
        const t = aim(), pr = t ? ctx.interact.prompt() : null;
        rec.target = t ? `${t.kind}:${t.id}` : null; rec.prompt = pr;
        if (t && t.kind === 'door' && /^abrir/i.test(pr ?? '')) { L.use(); L.step(30); rec.pressedE = true; }
        const x0 = P.s.x, z0 = P.s.z; let inside = false;
        for (let k = 0; k < 20 && !inside; k++) { L.walk(1, 0, 0.25); inside = !!P.indoors && P.building === b.id; }
        rec.moved = +Math.hypot(P.s.x - x0, P.s.z - z0).toFixed(2); rec.ok = inside;
        if (!inside) rec.why = (P.indoors ? `indoors but in ${P.building}` : `stopped ${rec.moved} m in, still outside`) + `; aimed at ${rec.target ?? 'nothing'}${pr ? ` ("${pr}")` : ''}${rec.pressedE ? ', pressed E' : ''}`;
      } catch (err) { rec.why = 'exception: ' + (err?.message ?? err); }
      out.push(rec);
    }
  }
  return out;
}

async function pageTalk(n) {
  const L = window.__ladera, ctx = L.ctx, P = ctx.player, PE = ctx.people, dirv = new ctx.THREE.Vector3(), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (PE?.list?.() ?? []).filter((p) => !p.away), out = [];
  if (!PE?.conversation || !all.length) return [{ id: null, ok: false, why: `no people (${all.length}) or no ctx.people.conversation()` }];
  const picks = Array.from({ length: Math.min(n, all.length) }, (_, i) => all[Math.floor(i * all.length / Math.min(n, all.length))]);
  for (const p of picks) {
    const rec = { id: p.id, name: p.display, ok: false, why: '' };
    try {
      const cur = PE.list().find((q) => q.id === p.id) ?? p;           // positions drift while stepping
      let aimed = false;
      for (let a = 0; a < 8 && !aimed; a++) {
        const q = PE.list().find((r) => r.id === p.id) ?? cur;
        L.teleport(q.x + Math.sin(a * Math.PI / 4) * 1.5, q.z + Math.cos(a * Math.PI / 4) * 1.5, { y: q.y });
        L.lookAt(q.x, q.y + 1.5, q.z); L.step(2);
        ctx.interact.update(ctx.camera.position, ctx.camera.getWorldDirection(dirv));
        aimed = ctx.interact.target?.id === 'npc:' + p.id;
      }
      if (!aimed) { rec.why = `cannot be aimed at from any of 8 spots at 1.5 m (aimed at ${ctx.interact.target?.id ?? 'nothing'})`; out.push(rec); continue; }
      const base = window.__quiet?.spoken.length ?? 0;
      L.use(); L.step(3); await wait(160);
      const c1 = PE.conversation();
      rec.talking = !!c1;
      const sub = document.getElementById('subtitle'), es = sub?.querySelector('.es')?.textContent ?? '';
      rec.subtitle = sub?.classList.contains('on') ? es : '';
      rec.spoken = (window.__quiet?.spoken.slice(base) ?? []).map((s) => ({ text: s.text, lang: s.lang, voice: s.voice }));
      rec.mode = PE.speech?.cur?.mode ?? null;
      const ch = c1?.choices ?? [];
      rec.choices = ch.length;
      if (ch.length) { const b2 = window.__quiet.spoken.length; PE.pick(ch[0].id); L.step(3); await wait(160); rec.reply = window.__quiet.spoken.slice(b2).map((s) => s.text); }
      PE.leave(); L.step(3);
      rec.left = !PE.conversation() && !P.locked;
      const line = rec.spoken[0];
      rec.ok = !!(rec.talking && rec.subtitle && line && /^es/i.test(line.lang) && line.text === rec.subtitle && rec.left && (!ch.length || rec.reply?.length));
      if (!rec.ok) rec.why = !rec.talking ? 'E did not start a conversation' : !rec.subtitle ? 'no subtitle' : !line ? `nothing spoken (speech mode ${rec.mode})` : !/^es/i.test(line.lang) ? `spoken in ${line.lang}` :
        line.text !== rec.subtitle ? 'spoken line differs from the subtitle' : !rec.left ? 'player still locked after leaving' : 'reply produced no line';
    } catch (err) { rec.why = 'exception: ' + (err?.message ?? err); try { PE.leave(); } catch { /* not talking */ } }
    out.push(rec);
  }
  return out;
}

// ---- driver ---------------------------------------------------------------------------------------------------------------------------
const inPage = (p, f, args = [], timeout = 900000) => p.eval(`(${f.toString()})(...${JSON.stringify(args)})`, timeout);
const results = [];
const report = (name, ok, summary, lines = []) => { results.push({ name, ok, summary, lines }); console.log(`[${name}] ${ok ? 'PASS' : 'FAIL'}  ${summary}`); for (const l of lines.slice(0, 40)) console.log('    ' + l); if (lines.length > 40) console.log(`    ... ${lines.length - 40} more`); };

const b = await launch({ width: 1280, height: 720 });
let code = 0;
try {
  const url = `la-ladera/index.html?autostart&manual${Q ? '&' + Q.replace(/^&/, '') : ''}`;
  const t0 = Date.now(), p = await b.open(url), boot = (Date.now() - t0) / 1000, sum = p.summary();
  const bootErrs = [...sum.errors, ...sum.netErrors, ...sum.consoleErrors];
  if (ONLY.has('boot')) report('boot', bootErrs.length === 0, `booted in ${boot.toFixed(1)} s, ${bootErrs.length} errors`, bootErrs);

  if (ONLY.has('spawn')) {
    const r = await inPage(p, pageSpawn);
    const ok = r.onGround && !r.indoors && r.moved >= 4 && !r.blocked && r.errors === 0;
    report('spawn', ok, `start ${JSON.stringify(r.start)}, walked ${r.moved} m forward (y ${r.rose >= 0 ? '+' : ''}${r.rose}), blocked=${r.blocked}`, ok ? [] : [JSON.stringify(r)]);
  }
  if (ONLY.has('doors')) {
    const r = await inPage(p, pageDoors), bad = r.filter((x) => !x.ok);
    report('doors', bad.length === 0, `${r.length - bad.length}/${r.length} entrances enterable by walking in (${new Set(r.map((x) => x.id)).size} buildings)`, bad.map((x) => `${x.id} ${x.kind ?? ''} ${x.entrance ?? ''}: ${x.why}`));
    results.at(-1).data = r;
  }
  if (ONLY.has('talk')) {
    const r = await inPage(p, pageTalk, [TALKS]), bad = r.filter((x) => !x.ok);
    report('talk', bad.length === 0, `${r.length - bad.length}/${r.length} conversations ok; first line: ${JSON.stringify(r.find((x) => x.ok)?.spoken?.[0]?.text ?? null)}`, bad.map((x) => `${x.id} ${x.name ?? ''}: ${x.why}`));
    results.at(-1).data = r;
  }
  const after = p.summary(), late = [...after.errors, ...after.netErrors, ...after.consoleErrors];
  if (late.length > bootErrs.length) report('errors', false, `${late.length - bootErrs.length} new console/network errors during the tour`, late.slice(bootErrs.length));
} catch (e) {
  console.error('tour aborted: ' + (e?.stack ?? e)); code = 2;
} finally {
  await b.close();
}
const j = arg('json', '');
if (j) { await mkdir(dirname(resolve(j)), { recursive: true }); await writeFile(j, JSON.stringify(results, null, 1)); }
if (!code && results.some((r) => !r.ok)) code = 1;
console.log(code ? `tour: FAILED (${results.filter((r) => !r.ok).map((r) => r.name).join(', ') || 'aborted'})` : 'tour: all checks pass');
process.exit(code);
