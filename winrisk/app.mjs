import {combat, sweepConfiguration, hit, polygon, deckDraw, setupOutcome, hex} from './model.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const text = (selector, value) => { $(selector).textContent = value; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n.toLocaleString('en-GB');
const result = (fixed, title, body) => `<div class="result${fixed ? ' fixed' : ''}"><h4>${title}</h4>${body}</div>`;
const path = points => points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + 'Z';

function initReading() {
  const nav = $$('.chapter-nav a');
  const activate = id => nav.forEach(a => a.getAttribute('href') === '#' + id ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
  const onScroll = () => {
    const height = document.documentElement.scrollHeight - innerHeight;
    $('.progress').style.width = (height > 0 ? 100 * scrollY / height : 0) + '%';
    const current = $$('.chapter').filter(s => s.getBoundingClientRect().top <= 160).at(-1);
    activate(current?.id || 'case-file');
  };
  addEventListener('scroll', onScroll, {passive: true}); onScroll();
  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target?.matches('details')) { target.open = true; target.scrollIntoView(); }
  }
  addEventListener('hashchange', revealHash); revealHash();
  // Printed output should include every finding, without losing the reader's open state.
  let savedDetails = [];
  addEventListener('beforeprint', () => { savedDetails = $$('.finding').map(d => d.open); $$('.finding').forEach(d => d.open = true); });
  addEventListener('afterprint', () => $$('.finding').forEach((d, i) => d.open = savedDetails[i]));
}

function initDice() {
  let attack = [6, 5, 1], defend = [2, 3];
  function render() {
    for (const [side, dice] of [['attacker', attack], ['defender', defend]]) {
      const container = $('#' + side + '-dice');
      const buttons = dice.map((face, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = face;
        button.setAttribute('aria-label', `${side} die ${i + 1}: ${face}. Activate to cycle from 1 to 6.`);
        button.addEventListener('click', () => { dice[i] = face % 6 + 1; render(); $('#' + side + '-dice').children[i].focus(); });
        return button;
      });
      container.replaceChildren(...buttons);
    }
    $('#combat-output').innerHTML = [false, true].map(fixed => {
      const r = combat(attack, defend, fixed);
      const rows = r.pairs.map(p => `<div class="compare-line">${p.a} ${p.a > p.d ? '>' : p.a === p.d ? '=' : '<'} ${p.d} → ${p.lost} loses 1</div>`).join('');
      return result(fixed, fixed ? 'Repaired' : 'Original', `<p>Stored defender dice</p><div class="die-row">${r.d.map(n => `<span>${n}</span>`).join('')}</div><p class="outcome">Attacker −${r.lostA}<br>Defender −${r.lostD}</p>${rows}`);
    }).join('');
  }
  const syncCounts = () => { $('#attack-count').value = attack.length; $('#defend-count').value = defend.length; render(); };
  $('#attack-count').addEventListener('change', e => { attack = Array.from({length: Number(e.target.value)}, (_, i) => attack[i] ?? 1); render(); });
  $('#defend-count').addEventListener('change', e => { defend = Array.from({length: Number(e.target.value)}, (_, i) => defend[i] ?? 1); render(); });
  $('#example-dice').addEventListener('click', () => { attack = [6, 5, 1]; defend = [2, 3]; syncCounts(); });
  $('#reverse-dice').addEventListener('click', () => { defend.reverse(); render(); });
  $('#roll-dice').addEventListener('click', () => { attack = attack.map(() => 1 + Math.floor(Math.random() * 6)); defend = defend.map(() => 1 + Math.floor(Math.random() * 6)); render(); });
  render();
  $('#run-sweep').addEventListener('click', async e => {
    const button = e.currentTarget; button.disabled = true;
    $('#sweep-table').hidden = false; $('#sweep-rows').replaceChildren();
    let cases = 0, original = 0, repaired = 0;
    try {
      for (let na = 1; na <= 3; na++) for (let nd = 1; nd <= 2; nd++) {
        text('#sweep-status', `Checking ${na} attacker × ${nd} defender dice…`);
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const row = sweepConfiguration(na, nd); cases += row.cases; original += row.original; repaired += row.repaired;
        const tr = document.createElement('tr');
        for (const v of [`${na} vs ${nd}`, fmt(row.cases), fmt(row.original), fmt(row.repaired)]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
        $('#sweep-rows').append(tr);
      }
      text('#sweep-status', `${fmt(cases)} cases. Original: ${fmt(original)} disagreements. Repaired: ${fmt(repaired)}. Browser-model check complete—not an x86 harness run.`);
    } catch (error) { text('#sweep-status', `Check failed: ${error.message}`); }
    finally { button.disabled = false; }
  });
}

function initStates(tests) {
  const queue = () => {
    const context = $('#click-context').value;
    $('#queue-output').innerHTML = [false, true].map(fixed => {
      const messages = context === 'ai' ? [] : context === 'result' ? fixed ? ['Dismiss combat result'] : ['Dismiss combat result', 'Ordinary hit-test action'] : ['Ordinary hit-test action'];
      return result(fixed, fixed ? 'Repaired queue' : 'Original queue', `<p class="outcome">${messages.length} message${messages.length === 1 ? '' : 's'}</p>${messages.map((m, i) => `<p><code>${i + 1}.</code> ${m}</p>`).join('') || '<p>No human action posted.</p>'}`);
    }).join('');
  };
  $('#queue-click').addEventListener('click', queue);
  const clearQueue = () => { $('#queue-output').innerHTML = result(false, 'Original queue', '<p>Empty</p>') + result(true, 'Repaired queue', '<p>Empty</p>'); };
  $('#queue-reset').addEventListener('click', clearQueue); $('#click-context').addEventListener('change', clearQueue);
  const index = () => {
    const value = $('#territory-index').value, n = Number(value);
    if (!value || !Number.isInteger(n) || n < -32768 || n > 32767) { text('#index-output', 'Enter a signed 16-bit integer (−32768 to 32767).'); return; }
    const offset = (0x834 + n * 22) & 0xffff;
    text('#index-output', `DS:0834 + (${n} × 22) → DS:${hex(offset).slice(2)} after 16-bit wrapping. ${n >= 0 && n < 42 ? 'Valid territory record. Guard accepts the index.' : n === -1 ? 'This address is in the preceding player storage. The repair blocks territory-dependent actions; intentional background transitions are handled separately.' : 'Outside the territory table. The repair blocks territory-dependent actions; it is not a valid country.'}`);
  };
  $('#territory-index').addEventListener('input', index); index();
  const elimination = () => {
    const stack = Number($('#stack').value); text('#stack-label', stack);
    $('#elimination-output').innerHTML = ['original', 'patched'].map(key => {
      const r = tests.elimination_transfer[key].find(r => r.starting_troops === stack), fixed = key === 'patched';
      const count = r.winner_cards.reduce((a, b) => a + b, 0);
      return result(fixed, fixed ? 'Repaired sequence' : 'Original sequence', `<p class="outcome">${count} cards transferred</p><p>Pending flag: <code>${r.pending}</code></p><p>${r.pending ? 'Result dismissal → attack selection. Transfer was skipped.' : stack <= 4 ? 'Result dismissal → elimination processing → attack selection.' : 'Post-conquest movement continuation → elimination processing.'}</p>`);
    }).join('');
  };
  $('#stack').addEventListener('input', elimination); elimination();
  const deck = () => {
    const draw = Number($('#draw').value); text('#draw-label', draw);
    $('#deck-output').innerHTML = [false, true].map(fixed => {
      const d = deckDraw(draw, fixed);
      return result(fixed, fixed ? 'Repaired deck' : 'Original deck', `<p class="outcome">Slot ${d.slot}: ${d.card}</p><p>${d.reshuffled ? 'A reshuffle has already happened.' : 'Still drawing from the first deck.'}</p>`);
    }).join('');
  };
  $('#draw').addEventListener('input', deck); deck();
  let selectedResult = 0;
  const setup = () => {
    const name = $('#setup-name').value;
    $$('[data-dialog-result]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.dialogResult) === selectedResult)));
    $('#setup-output').innerHTML = [false, true].map(fixed => {
      const r = setupOutcome(selectedResult, fixed, name);
      return result(fixed, fixed ? 'Repaired wrapper' : 'Original wrapper', `<p class="outcome">Live name: ${r.name ? esc(r.name) : '(empty)'}</p><p>Wrapper reports: <strong>${r.accepted ? 'accepted' : 'not accepted'}</strong></p><p>${selectedResult === -1 ? 'Dialog creation failed: there was no editing session.' : fixed && selectedResult === 0 ? 'Staged edit discarded; live configuration untouched.' : 'Proposed edit is visible in the live record.'}</p>`);
    }).join('');
  };
  $$('[data-dialog-result]').forEach(b => b.addEventListener('click', () => { selectedResult = Number(b.dataset.dialogResult); setup(); }));
  $('#setup-name').addEventListener('input', setup); setup();
}

function initSegments(data) {
  const choose = index => {
    const s = data.segments.find(s => s.index === index);
    $$('#segments button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.segment) === index)));
    $('#segment-detail').innerHTML = `<h4>${s.index}. ${esc(s.title)}</h4><p>${esc(s.description)}</p><p class="mono">File ${hex(s.offset)} · ${fmt(s.length)} bytes${s.length !== s.repairedLength ? ' → ' + fmt(s.repairedLength) + ' repaired' : ' · length unchanged'}</p><p class="small">${s.functions.map(esc).join('<br>')}</p>`;
  };
  $('#segments').replaceChildren(...data.segments.map(s => {
    const b = document.createElement('button'); b.dataset.segment = s.index; b.innerHTML = `<strong>SEG ${String(s.index).padStart(2, '0')}</strong><span>${fmt(s.length)} bytes</span>`;
    b.setAttribute('aria-label', `Segment ${s.index}: ${s.title}`); b.addEventListener('click', () => choose(s.index)); return b;
  }));
  choose(5);
}

function initMap(data) {
  const affected = data.territories.filter(t => t.corrections.length), svg = $('#territory-map');
  $('#map-territory').replaceChildren(...affected.map(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; return o; }));
  $('#map-territory').value = 42;
  $('#map-land').innerHTML = data.territories.map(t => `<path class="land" d="${path(t.points)}"><title>${esc(t.name)}</title></path>`).join('');
  const selected = () => affected.find(t => t.id === Number($('#map-territory').value));
  const classify = () => {
    const x = Number($('#point-x').value), y = Number($('#point-y').value), t = selected();
    if (!$('#point-x').value || !$('#point-y').value || !Number.isFinite(x) || !Number.isFinite(y)) { text('#map-hit', 'Enter both point coordinates.'); return; }
    const old = hit(polygon(t, false, $('#show-sentinel').checked), x, y), fixed = hit(t.points, x, y);
    $('#map-point').setAttribute('cx', x); $('#map-point').setAttribute('cy', y);
    text('#map-hit', `(${x}, ${y}) · ${t.name} · Original: ${old ? 'inside' : 'outside'} · Repaired: ${fixed ? 'inside' : 'outside'}${old !== fixed ? ' — classification changed.' : ' — same classification.'}`);
  };
  const render = () => {
    const t = selected(), old = polygon(t, false, $('#show-sentinel').checked);
    $('#map-old').setAttribute('d', path(old)); $('#map-new').setAttribute('d', path(t.points));
    text('#map-title', `${t.name}: original and repaired territory outlines`);
    text('#map-changes', `Resource ${t.id} at ${hex(t.offset)}. ` + t.corrections.map(c => `Vertex ${c.vertex}: (${c.before.join(', ')}) → (${c.after.join(', ')}).`).join(' '));
    $('#map-markers').innerHTML = t.corrections.map(c => `<circle cx="${c.after[0]}" cy="${c.after[1]}" r="3" fill="#fffcf4" stroke="#146b61" stroke-width="2" vector-effect="non-scaling-stroke"><title>Corrected vertex ${c.vertex}</title></circle>`).join('');
    if ($('#map-zoom').checked) {
      const xs = t.points.map(p => p[0]), ys = t.points.map(p => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const h = Math.max(Math.max(...ys) - Math.min(...ys) + 36, (Math.max(...xs) - Math.min(...xs) + 36) / 1.38, 60), w = h * 1.38;
      svg.setAttribute('viewBox', `${cx - w / 2} ${cy - h / 2} ${w} ${h}`);
    } else svg.setAttribute('viewBox', '-110 -110 760 610');
    classify();
  };
  const witness = () => { const p = selected().witness.witness; $('#point-x').value = p[0]; $('#point-y').value = p[1]; classify(); };
  $('#map-territory').addEventListener('change', () => { witness(); render(); });
  $('#show-sentinel').addEventListener('change', render); $('#map-zoom').addEventListener('change', render);
  $('#map-witness').addEventListener('click', () => { $('#show-sentinel').checked = true; $('#map-zoom').checked = false; witness(); render(); });
  $('#point-x').addEventListener('input', classify); $('#point-y').addEventListener('input', classify);
  const pointer = event => {
    if (event.type === 'pointermove' && event.pointerType === 'touch') return;
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    $('#point-x').value = Math.round(p.x * 2) / 2; $('#point-y').value = Math.round(p.y * 2) / 2; classify();
  };
  svg.addEventListener('pointermove', pointer); svg.addEventListener('pointerdown', pointer);
  render(); witness();
}

function initPatches(manifest) {
  $('#patch-select').replaceChildren(...manifest.changes.map((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = (c.offset_hex || 'SEG ' + c.segment) + ' — ' + c.reason; return o; }));
  const render = () => {
    const c = manifest.changes[Number($('#patch-select').value)];
    const bytes = h => h.match(/.{1,2}/g).join(' ').toUpperCase();
    $('#patch-detail').innerHTML = c.helper_hex ? `<p class="note">${esc(c.reason)}</p><p><strong>${c.appended_bytes} helper bytes</strong> at segment ${c.segment}:${c.code_offset}</p><pre>${esc(c.helper_hex.match(/.{1,32}/g).map(bytes).join('\n'))}</pre><p class="small">${Object.entries(c.symbols).map(([name, offset]) => `${esc(name)}: ${esc(offset)}`).join('<br>')}</p>` : `<p class="note">${esc(c.reason)}</p><div class="patch-line"><pre class="before">${esc(c.offset_hex)} / original\n${bytes(c.before)}</pre><span aria-hidden="true">→</span><pre class="after">${esc(c.offset_hex)} / repaired\n${bytes(c.after)}</pre></div>`;
  };
  $('#patch-select').addEventListener('change', render); render();
  let fileSequence = 0;
  $('#exe-file').addEventListener('change', async e => {
    const sequence = ++fileSequence, file = e.target.files?.[0];
    if (!file) { text('#file-result', 'No file selected.'); return; }
    if (file.size !== manifest.file_size) { text('#file-result', `Different file size: ${fmt(file.size)} bytes, expected ${fmt(manifest.file_size)}. No further processing or upload.`); return; }
    if (!globalThis.crypto?.subtle) { text('#file-result', 'SHA-256 requires a secure context. Open the HTTPS site or localhost. No file was uploaded.'); return; }
    text('#file-result', 'Computing SHA-256 locally…');
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      if (sequence !== fileSequence) return;
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const identity = hash === manifest.input_sha256 ? 'Recognised: exact original audited executable.' : hash === manifest.output_sha256 ? 'Recognised: exact repaired executable.' : 'Not recognised: this is neither audited fingerprint. Do not apply these offsets to it.';
      text('#file-result', `${identity} SHA-256: ${hash}. Nothing uploaded, executed or modified.`);
    } catch (error) { if (sequence === fileSequence) text('#file-result', `Could not read or hash the file: ${error.message}`); }
  });
}

initReading();
initDice();
async function start() {
  const load = async name => {
    const response = await fetch(new URL(`evidence/${name}`, import.meta.url));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };
  try {
    const [data, tests, manifest] = await Promise.all(['exhibit.json', 'test_results.json', 'patch_manifest.json'].map(load));
    initSegments(data); initStates(tests); initMap(data); initPatches(manifest);
    document.documentElement.dataset.ready = 'true';
  } catch (error) {
    const panel = $('#runtime-error'); panel.hidden = false;
    panel.textContent = `Some instruments could not load: ${error.message}. The written case study and evidence links remain usable. Serve this directory over HTTP rather than opening it as a local file.`;
  }
}
start();
