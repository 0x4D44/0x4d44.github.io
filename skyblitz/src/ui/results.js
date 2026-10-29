// Results, Grand Prix standings and the final podium. Owner: UI agent.
import { h, fmtTime, ordinal } from './dom.js';
import { icon, MEDALS, TROPHY, MISC } from './icons.js';
import { btn, header } from './menus.js';
import { COURSES } from '../world/courses/index.js';
import { getAircraft } from '../craft/roster.js';

const dot = (c) => h('i', { class: 'pdot', style: `background:${c || '#fff'}` });

function resultTable(rows) {
  const tb = h('tbody');
  for (const r of rows) {
    tb.append(h('tr', { class: (r.me ? 'me ' : '') + (r.place <= 3 ? 'top' + r.place : '') },
      h('td', { class: 'c-p' }, r.place <= 3 ? icon(MEDALS[r.place - 1], 'medal') : h('b', null, r.place)),
      h('td', { class: 'c-n' }, dot(r.color), h('span', { class: 'nm' }, r.name), h('small', null, r.craft)),
      h('td', { class: 'c-t' }, r.time != null ? fmtTime(r.time) : 'DNF'),
      h('td', { class: 'c-b' }, fmtTime(r.best)),
      h('td', { class: 'c-pt' }, r.points ? '+' + r.points : '-')));
  }
  return h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Pilot'), h('th', null, 'Time'), h('th', null, 'Best lap'), h('th', null, 'Pts'))), tb);
}

export function resultsScreen(ui) {
  const title = h('h2', { class: 'skew' }, h('span', null, 'RESULTS'));
  const sub = h('p', { class: 'hdr-sub' });
  const banner = h('div', { class: 'record skew', style: 'display:none' });
  const table = h('div', { class: 'panel scroll res-t' });
  const gpBox = h('div', { class: 'panel scroll res-gp' });
  const stats = h('div', { class: 'panel res-stats' });
  const actions = h('footer', { class: 'ftr res-act' });
  const el = h('div', { class: 'scr results' }, h('header', { class: 'hdr' }, title, sub), banner, h('div', { class: 'res-body' }, table, h('div', { class: 'res-side' }, stats, gpBox)), actions);
  return {
    el,
    enter() {
      const R = ui.lastResults; if (!R) { actions.replaceChildren(btn('Main menu', () => ui.quit(true), { cls: 'primary', first: true })); return; }
      const f = ui.flow, gp = f.mode === 'gp', course = COURSES.find((c) => c.id === R.courseId);
      title.firstChild.textContent = gp ? `RACE ${R.gpIndex + 1} / 4 RESULTS` : f.mode === 'trial' ? 'TIME TRIAL' : 'RESULTS';
      sub.textContent = [course?.name, R.laps + (R.laps === 1 ? ' lap' : ' laps'), R.difficulty].filter(Boolean).join(' - ');
      table.replaceChildren(resultTable(R.rows));
      const me = R.rows.find((r) => r.me);
      const rec = [];
      if (R.rec?.newRace) rec.push('NEW COURSE RECORD ' + fmtTime(me.time));
      else if (R.rec?.newLap) rec.push('NEW BEST LAP ' + fmtTime(me.best));
      if (f.mode === 'trial' && me?.best != null) rec.push(R.rec?.prevLap != null ? `Lap delta ${me.best - R.rec.prevLap <= 0 ? '' : '+'}${(me.best - R.rec.prevLap).toFixed(3)}s vs your best` : 'First time set');
      banner.style.display = rec.length ? '' : 'none'; banner.replaceChildren(...rec.map((t, i) => h('span', { class: i ? 'sm' : '' }, (i ? '' : ''), t)));
      const st = R.stats || {};
      stats.replaceChildren(h('h3', null, 'YOUR RACE'), h('dl', null,
        ...[['Position', me ? ordinal(me.place) : '-'], ['Stunts', st.stunts ?? 0], ['Perfect gates', st.perfectGates ?? 0], ['Shortcuts', st.shortcuts ?? 0], ['Near misses', st.nearMisses ?? 0], ['Hits dealt', st.hitsDealt ?? 0], ['Hits taken', st.hitsTaken ?? 0], ['Overtakes', st.overtakes ?? 0]].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
      gpBox.style.display = gp ? '' : 'none';
      if (gp) gpBox.replaceChildren(h('h3', null, 'CHAMPIONSHIP'), gpTable(ui.gpStandings()));
      const lastRace = gp && R.gpIndex >= 3;
      const bs = [];
      if (gp) bs.push(btn(lastRace ? 'Final standings' : 'Next race', () => ui.nextGP(), { cls: 'primary', first: true, cue: 'ui:confirm', ico: MISC.arrow }));
      bs.push(btn('Retry', () => ui.restart(), { cls: gp ? '' : 'primary', first: !gp }));
      if (!gp) bs.push(btn('Change aircraft', () => ui.startFlow(f.mode), {}));
      bs.push(btn('Quit to menu', () => ui.quit(true), { cls: 'ghost', cue: 'ui:back' }));
      actions.replaceChildren(...bs);
    },
    back: () => { ui.quit(true); return null; },
  };
}

function gpTable(rows) {
  const tb = h('tbody');
  rows.forEach((r, i) => tb.append(h('tr', { class: (r.isPlayer ? 'me ' : '') + (i < 3 ? 'top' + (i + 1) : '') },
    h('td', { class: 'c-p' }, i < 3 ? icon(MEDALS[i], 'medal') : h('b', null, i + 1)), h('td', { class: 'c-n' }, dot(r.color), h('span', { class: 'nm' }, r.name)), h('td', { class: 'c-w' }, r.wins), h('td', { class: 'c-pt big' }, r.points))));
  return h('table', { class: 'tbl gp' }, h('thead', null, h('tr', null, h('th'), h('th', null, 'Pilot'), h('th', null, 'Wins'), h('th', null, 'Points'))), tb);
}

export function podiumScreen(ui) {
  const pod = h('div', { class: 'podium' }), table = h('div', { class: 'panel scroll' }), msg = h('div', { class: 'pod-msg skew' });
  const actions = h('footer', { class: 'ftr res-act' });
  const el = h('div', { class: 'scr podium-scr' }, header('GRAND PRIX COMPLETE'), msg, pod, table, actions);
  return {
    el,
    enter() {
      const rows = ui.gpStandings(), top = rows.slice(0, 3);
      const me = rows.findIndex((r) => r.isPlayer);
      msg.textContent = me === 0 ? 'YOU ARE THE CHAMPION!' : me >= 0 ? `YOU FINISHED ${ordinal(me + 1).toUpperCase()} OVERALL` : 'FINAL STANDINGS';
      const order = [1, 0, 2];
      pod.replaceChildren(...order.map((i) => {
        const r = top[i]; if (!r) return h('div');
        return h('div', { class: 'pod p' + (i + 1) + (r.isPlayer ? ' me' : '') }, i === 0 ? icon(TROPHY, 'trophy') : icon(MEDALS[i], 'medal big'), dot(r.color), h('b', { class: 'pn' }, r.name), h('small', null, r.points + ' pts'), h('div', { class: 'blk' }, h('span', null, i + 1)));
      }));
      table.replaceChildren(gpTable(rows));
      actions.replaceChildren(btn('New Grand Prix', () => { ui.clearGP(); ui.startFlow('gp'); }, { cls: 'primary', first: true, cue: 'ui:confirm' }), btn('Quit to menu', () => { ui.clearGP(); ui.quit(true); }, { cls: 'ghost', cue: 'ui:back' }));
    },
    back: () => { ui.clearGP(); ui.quit(true); return null; },
  };
}
