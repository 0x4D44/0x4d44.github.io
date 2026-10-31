#!/usr/bin/env node
// Page test for the reviewers' helper __ladera.lookAtNpc (dev/REVIEWER-BRIEF.md): it stands the player in front of a person, aimed at the face, and the next render draws them there.
//   node la-ladera/tests/people-look.mjs [--q "autostart&manual&hour=16.5"] [--n 12] [--out .scratch/people-look]
// For a dozen people spread through the barrio (every one that is drawn after ten seconds of life) it checks, in the page after lookAtNpc and nothing else:
// the head is in the middle of the view (normalised device coordinates within 0.15), in front of the camera and within 2 m; the person is drawn (a visible model) at the
// position npcs() reports; and the console stays clean. The same for people hidden indoors (round 4): lookAtNpc draws them on their place first, or refuses with "indoors ... not drawn".
// With --out the framed faces are saved as JPEGs to look at. Headless Chrome; exit code 1 on a failed check.
import { launch } from './chrome.mjs';

const a = process.argv.slice(2), flag = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : a[i + 1]; };
const q = flag('q', 'autostart&manual&hour=16.5'), N = +flag('n', 12), out = flag('out', null), slug = flag('slug', 'la-ladera');
const b = await launch({ width: 960, height: 540 });
let code = 0; const fails = [];
try {
  const p = await b.open(`${slug}/index.html?${q}`);
  await p.eval('__ladera.step(600)');                                                       // ten seconds of life
  const ids = await p.eval(`(() => { const d = __ladera.npcs().filter((n) => n.drawn && !n.away); const k = Math.max(1, Math.floor(d.length / ${N})); return d.filter((_, i) => i % k === 0).slice(0, ${N}).map((n) => n.id); })()`);
  if (ids.length < Math.min(N, 6)) fails.push(`only ${ids.length} people are drawn at ${q}`);
  const probe = (id) => `(() => {
    const L = window.__ladera, ctx = L.ctx, THREE = ctx.THREE, r = L.lookAtNpc(${id ? JSON.stringify(id) : 'null'}, { dist: 1.3 });
    if (!r.ok) return { id: ${JSON.stringify(id)}, ok: false, reason: r.reason };
    const now = L.npcs().find((m) => m.id === r.id), cam = ctx.camera; cam.updateMatrixWorld(true);
    const eye = cam.getWorldPosition(new THREE.Vector3()), head = new THREE.Vector3(now.head.x, now.head.y, now.head.z), d = eye.distanceTo(head), ndc = head.clone().project(cam);
    const root = ctx.people._world.byId.get(r.id)?.view?.root;
    return { id: r.id, ok: true, d: +d.toFixed(2), ndc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3), +ndc.z.toFixed(3)], drawn: now.drawn, rootVisible: !!root?.visible,
      off: root ? +Math.hypot(root.position.x - now.x, root.position.z - now.z).toFixed(3) : null, name: r.name };
  })()`;
  const rows = [];
  const verify = async (r) => {                                                              // a framed person: the head in the middle of the view, near, drawn, where npcs() says
    if (!(Math.abs(r.ndc[0]) < 0.15 && Math.abs(r.ndc[1]) < 0.15 && r.ndc[2] > -1 && r.ndc[2] < 1)) fails.push(`${r.id}: the head is at (${r.ndc[0]}, ${r.ndc[1]}) in the view, not in the middle`);
    if (r.d > 2.0) fails.push(`${r.id}: the head is ${r.d} m away`);
    if (!r.drawn || !r.rootVisible) fails.push(`${r.id}: not drawn after lookAtNpc (drawn ${r.drawn}, model visible ${r.rootVisible})`);
    if (r.off == null || r.off > 0.02) fails.push(`${r.id}: the model is ${r.off} m from where npcs() says`);
    if (out) await p.canvasShot(`${out}/${r.id}.jpg`, { w: 960, h: 540 });
  };
  for (const id of [...ids, null]) {                                                         // null: the nearest person
    const r = await p.eval(probe(id)); rows.push(r);
    if (!r.ok) { fails.push(`${r.id}: ${r.reason}`); continue; }
    await verify(r);
  }
  // somebody hidden in a building (asleep, a stay at home, a visit, on duty; one from each of six buildings): lookAtNpc draws them on their place and puts the player in front of them, and the frame
  // is as good as anybody's. A person who has no place to be drawn on is refused with a reason ("indoors ... and not drawn"), never framed empty (the round-3 rule, kept for them).
  const hid = await p.eval(`(() => { const seen = new Set(), out = []; for (const n of __ladera.npcs().filter((m) => m.away && m.lot)) { if (seen.has(n.lot)) continue; seen.add(n.lot); out.push(n.id); if (out.length >= 6) break; } return out; })()`);
  if (hid.length < 3) fails.push(`only ${hid.length} people are hidden in buildings at ${q}: the indoor check has nobody to look at`);
  let framedHidden = 0;
  for (const id of hid) {
    const r = await p.eval(probe(id)); rows.push(r);
    if (!r.ok) { if (!/indoors/.test(r.reason ?? '')) fails.push(`${r.id}: ${r.reason}`); continue; }
    framedHidden++; await verify(r);
  }
  if (hid.length >= 3 && !framedHidden) fails.push(`nobody hidden in a building could be framed (${hid.join(' ')}): lookAtNpc does not draw them`);
  const sm = p.summary(); if (sm.errors.length || sm.consoleErrors.length || sm.consoleWarnings.length) fails.push(`console: ${JSON.stringify([...sm.errors, ...sm.consoleErrors, ...sm.consoleWarnings]).slice(0, 400)}`);
  console.log(JSON.stringify({ q, framed: rows.filter((r) => r.ok).length, rows: rows.map((r) => (r.ok ? `${r.id} d=${r.d} ndc=${r.ndc.slice(0, 2)} off=${r.off}` : `${r.id} ${r.reason}`)), fails }, null, 1));
  if (fails.length) code = 1;
} catch (e) { console.error(e); code = 1; }
await b.close();
process.exit(code);
