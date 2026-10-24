/* Down the Wire — the interactive labs. */
(function () {
  'use strict';
  const { S, H, $, $$, E, sleep, tween, fly, node, flash, line, hex2, sel, lab, svgIn } = window.__wire;
  const reg = (f) => (window.__wireWidgets = window.__wireWidgets || []).push(f);
  const MAC = { A: '02:00:00:00:00:0a', B: '02:00:00:00:00:0b', C: '02:00:00:00:00:0c', D: '02:00:00:00:00:0d' };
  const BC = 'ff:ff:ff:ff:ff:ff';

  /* ===== 1. CSMA/CD ===== */
  reg(() => lab('w-bus', 'Lab 1 · the shared wire (CSMA/CD)', (b) => {
    const svg = svgIn(b, [640, 190], 'A shared coaxial bus with two stations');
    const X0 = 70, X1 = 570, Y = 80;
    S('rect', { x: X0 - 20, y: Y - 5, width: X1 - X0 + 40, height: 10, rx: 5, fill: 'var(--line)' }, svg);
    const sig = S('g', null, svg);
    const A = node(svg, X0, 130, 70, 34, 'A', 'station', 'var(--mag)'), B = node(svg, X1, 130, 70, 34, 'B', 'station', 'var(--cyan)');
    line(svg, [X0, 113], [X0, Y + 5]); line(svg, [X1, 113], [X1, Y + 5]);
    const boom = S('text', { x: 320, y: 40, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: 'var(--red)', opacity: 0 }, svg, 'COLLISION');
    const log = H('div', { class: 'log', 'aria-live': 'polite' }, 'Pick a scenario. On a shared wire, every station hears every frame — so they must take turns.');
    let run = 0;
    const say = (h) => { log.innerHTML = ''; log.append(...[].concat(h)); };
    const bar = (x0, x1, c) => S('rect', { x: Math.min(x0, x1), y: Y - 9, width: Math.abs(x1 - x0), height: 18, rx: 4, fill: c, opacity: .85 }, sig);
    async function expand(from, c, my) { // wave out from one station
      const dir = from === X0 ? 1 : -1;
      await tween(900, (k) => { sig.innerHTML = ''; bar(from, from + dir * (X1 - X0) * k, c); });
      if (my === run) await sleep(300);
      sig.innerHTML = '';
    }
    async function solo(w) { const my = ++run; say(['Station ', H('b', { text: w }), ' listens first (carrier sense): wire is quiet, so it transmits. Everyone else hears it and waits.']); await expand(w === 'A' ? X0 : X1, w === 'A' ? 'var(--mag)' : 'var(--cyan)', my); }
    async function both() {
      const my = ++run; boom.setAttribute('opacity', 0);
      say('Both stations sense a quiet wire at the same instant, and both start sending…');
      const mid = (X0 + X1) / 2;
      await tween(1000, (k) => { sig.innerHTML = ''; bar(X0, X0 + (mid - X0) * k, 'var(--mag)'); bar(X1, X1 - (X1 - mid) * k, 'var(--cyan)'); });
      if (my !== run) return;
      sig.innerHTML = ''; bar(X0, X1, 'var(--red)'); boom.setAttribute('opacity', 1); flash(A.r, 'var(--red)'); flash(B.r, 'var(--red)');
      let att = 1, sa, sb;
      for (;;) {
        sa = E.backoffSlots(att, Math.random); sb = E.backoffSlots(att, Math.random);
        say(['Signals overlap → voltage garbage. Both detect it, send a 32-bit ', H('b', { text: 'jam' }), ' so everyone notices, and stop. ', 'Backoff #' + att + ': each picks 0–' + (Math.pow(2, Math.min(att, 10)) - 1) + ' slots (51.2 µs each). A picked ', H('b', { text: sa }), ', B picked ', H('b', { text: sb }), '.']);
        await sleep(1700); if (my !== run) return;
        if (sa !== sb) break;
        if (att >= E.MAX_ATTEMPTS) { say('16 collisions in a row: “excessive collisions” — the NIC gives up and reports an error to the OS.'); return; }
        say('Tie! Same slot → collide again, and the range doubles (binary exponential backoff).'); att++; await sleep(1300); if (my !== run) return;
      }
      boom.setAttribute('opacity', 0); sig.innerHTML = '';
      const first = sa < sb ? 'A' : 'B';
      say(['Station ', H('b', { text: first }), ' picked the shorter wait and goes first; the other hears carrier and defers. Total attempts: ' + att + '.']);
      await expand(first === 'A' ? X0 : X1, first === 'A' ? 'var(--mag)' : 'var(--cyan)', my);
      if (my === run) say('Then the loser sends too. That is the whole of classic Ethernet: listen, talk, listen while talking, back off randomly. Switches (next lab) made it obsolete — full-duplex links cannot collide.');
    }
    b.append(H('div', { class: 'ctl' },
      H('button', { onclick: () => solo('A') }, 'A sends'), H('button', { onclick: () => solo('B') }, 'B sends'),
      H('button', { class: 'pri', onclick: both }, '⚡ Both send at once'), H('span', { class: 'note' }, 'MAC = “Media Access Control” — the rules for sharing the wire')), log);
  }));

  /* ===== 2. Frame anatomy ===== */
  reg(() => lab('w-frame', 'Lab 2 · build a frame, byte by byte', (b) => {
    const COL = { pre: 'var(--dim)', dst: 'var(--cyan)', src: 'var(--mag)', tag: 'var(--amber)', type: 'var(--vio)', pay: 'var(--lime)', fcs: 'var(--red)' };
    const WHY = {
      pre: 'Seven bytes of 10101010 let the receiver’s clock lock onto the sender’s, then the start-frame delimiter (0xD5) says “the frame begins now”. The NIC strips it — you will never see it in Wireshark. It is why a frame costs 8 bytes more on the wire than in your capture.',
      dst: 'Who the frame is for: 48 bits. The lowest bit of the first byte is the I/G flag — 1 means group (multicast), and all-ones ff:ff:ff:ff:ff:ff is broadcast. The next bit says whether the address is globally unique (burned in) or locally administered.',
      src: 'Who sent it. This is what a switch reads to learn which port the sender lives behind. The first three bytes (the OUI) identify the manufacturer, unless the locally-administered bit is set, as here.',
      tag: 'The 802.1Q tag: a 0x8100 marker (TPID) then 16 bits — 3 bits of priority (PCP), 1 drop-eligible bit, and a 12-bit VLAN ID. It slots in between source MAC and EtherType, adds 4 bytes, and is why tagged frames can reach 1522 bytes. The 0x8100 sits exactly where EtherType normally would, which is how receivers spot it.',
      type: 'What is inside: 0x0800 IPv4, 0x86DD IPv6, 0x0806 ARP. Values ≤ 1500 meant “length” in the older 802.3 format; ≥ 1536 means “type” in Ethernet II, which is what everyone uses.',
      pay: 'The packet being carried — up to 1500 bytes by default (the MTU). Shorter than 46 bytes (42 when tagged)? The NIC pads with zeros, because a frame must be at least 64 bytes or a collision fragment could not be told apart from a real frame.',
      fcs: 'A CRC-32 over everything from destination MAC to payload. The receiver recomputes it; any mismatch and the frame is silently dropped — Ethernet does not retransmit, that is TCP’s job. Try flipping a bit below.',
    };
    const st = { dst: BC, src: '02:00:00:00:00:0a', text: 'Hello, wire!', vlan: false, vid: 10, pcp: 5, et: 0x0800, sel: 'dst', flip: null };
    const fields = H('div', { class: 'fseg' }), hexg = H('div', { class: 'hexgrid', 'aria-label': 'frame bytes in hexadecimal' }), why = H('div', { class: 'log', 'aria-live': 'polite' }), sum = H('div', { class: 'stat' }), onion = H('div', { class: 'onion' });
    function draw() {
      const f = E.buildFrame({ dst: st.dst, src: st.src, vlan: st.vlan ? { vid: +st.vid || 0, pcp: +st.pcp } : null, ethertype: st.et, payload: E.utf8(st.text) });
      let bytes = f.bytes.slice(); let flipIdx = -1;
      if (st.flip != null) { flipIdx = st.flip % (bytes.length - 4); bytes[flipIdx] ^= 1 << (st.flip % 8); }
      const ok = E.checkFcs(bytes);
      fields.innerHTML = ''; hexg.innerHTML = '';
      if (!f.fields.some((x) => x.id === st.sel)) st.sel = 'dst';
      let off = 0;
      f.fields.forEach((fd) => {
        const c = COL[fd.id];
        fields.append(H('button', { class: 'fld' + (st.sel === fd.id ? ' sel' : ''), style: '--c:' + c, onclick: () => { st.sel = fd.id; draw(); } }, fd.name + ' · ' + fd.bytes.length + ' B'));
        fd.bytes.forEach((v, i) => {
          const gi = fd.onWire ? -1 : off + i;
          const bad = gi >= 0 && gi === flipIdx;
          hexg.append(H('span', { class: 'hb' + (st.sel === fd.id ? ' sel' : '') + (bad ? ' bad' : ''), style: '--c:' + c }, hex2(fd.onWire ? v : bytes[gi])));
        });
        if (!fd.onWire) off += fd.bytes.length;
      });
      const sf = f.fields.find((x) => x.id === st.sel);
      let extra = '';
      if (st.sel === 'dst') { const m = E.parseMac(st.dst); extra = !m ? ' (unparseable — treated as broadcast)' : st.dst.toLowerCase() === BC ? ' → this one is BROADCAST: every host on the segment accepts it.' : (m[0] & 1) ? ' → multicast.' : ' → unicast.'; }
      if (st.sel === 'pay' && sf.padded) extra = ' → here ' + sf.padded + ' zero bytes were added as padding.';
      if (st.sel === 'tag') extra = ' → this tag says VLAN ' + st.vid + ', priority ' + st.pcp + '.';
      why.innerHTML = ''; why.append(H('b', { text: sf.name + ': ' }), WHY[sf.id] + extra);
      sum.innerHTML = '';
      [[f.bytes.length + ' B', 'frame incl. FCS (as on the NIC)'], [f.wire + ' B', 'on the wire (+preamble, +12 gap)'], [(1500 - 0) + ' B', 'default max payload (MTU)']].forEach((x) => sum.append(H('div', null, H('b', { text: x[0] }), H('span', { text: x[1] }))));
      sum.append(H('div', null, H('b', { class: ok ? 'ok' : 'bad', text: ok ? '✓ FCS good' : '✗ FCS mismatch' }), H('span', { text: ok ? 'receiver accepts' : 'receiver silently drops' })));
      const plen = E.utf8(st.text).length;
      onion.innerHTML = ''; onion.append(H('div', { text: 'Ethernet 14' }), st.vlan ? H('div', { text: 'VLAN 4', style: 'color:var(--amber)' }) : null, H('div', { text: 'IPv4 20' }), H('div', { text: 'TCP 20' }), H('div', { class: 'pl', text: '“' + st.text + '” (' + plen + ' B)' }), H('div', { text: 'FCS 4' }));
    }
    const inp = (k, w, ph) => H('input', { type: 'text', value: st[k], style: 'width:' + w + 'px', 'aria-label': ph, oninput: (e) => { st[k] = e.target.value; draw(); } });
    b.append(H('div', { class: 'ctl' },
      H('label', null, 'dst', inp('dst', 180, 'destination MAC')), H('label', null, 'src', inp('src', 180, 'source MAC')),
      H('label', null, 'type', sel([['2048', 'IPv4 0800'], ['2054', 'ARP 0806'], ['34525', 'IPv6 86DD']], '2048', (v) => { st.et = +v; draw(); }))),
    H('div', { class: 'ctl' }, H('label', null, 'payload', H('input', { type: 'text', value: st.text, maxlength: 120, style: 'width:230px', 'aria-label': 'payload text', oninput: (e) => { st.text = e.target.value; draw(); } })),
      H('label', null, H('input', { type: 'checkbox', onchange: (e) => { st.vlan = e.target.checked; draw(); } }), '802.1Q tag'),
      H('label', null, 'VID', H('input', { type: 'text', value: '10', style: 'width:60px', 'aria-label': 'VLAN ID', oninput: (e) => { st.vid = Math.max(1, Math.min(4094, parseInt(e.target.value, 10) || 1)); draw(); } }))),
    fields, hexg, why, H('div', { style: 'height:10px' }), sum, onion,
    H('div', { class: 'ctl', style: 'margin-top:12px' }, H('button', { onclick: () => { st.flip = Math.floor(Math.random() * 1000) + 1; draw(); } }, '⚡ flip one bit in transit'), H('button', { onclick: () => { st.flip = null; draw(); } }, 'repair the wire'), H('span', { class: 'note' }, 'the red-outlined byte is the damaged one')));
    draw();
  }));

  /* ===== 3. Switch learning ===== */
  reg(() => lab('w-switch', 'Lab 3 · a learning switch', (b) => {
    const svg = svgIn(b, [640, 320], 'Four hosts connected to one switch');
    const C = [320, 160], pos = { A: [90, 60], B: [550, 60], C: [90, 260], D: [550, 260] }, port = { A: 1, B: 2, C: 3, D: 4 };
    const hosts = {};
    Object.keys(pos).forEach((k) => { line(svg, pos[k], C); });
    node(svg, C[0], C[1], 120, 56, 'SWITCH', '4 ports', 'var(--amber)');
    Object.keys(pos).forEach((k) => {
      hosts[k] = node(svg, pos[k][0], pos[k][1], 92, 44, 'Host ' + k, MAC[k].slice(-5), 'var(--vio)');
      const m = [(pos[k][0] * .62 + C[0] * .38), (pos[k][1] * .62 + C[1] * .38)];
      S('circle', { cx: m[0], cy: m[1], r: 10, fill: 'var(--bg)', stroke: 'var(--line)' }, svg); S('text', { x: m[0], y: m[1] + 4, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--dim)' }, svg, port[k]);
    });
    const sw = { table: {}, ports: [1, 2, 3, 4] };
    let hub = false, src = 'A', dst = 'B', busy = false;
    const tb = H('tbody'), log = H('div', { class: 'log', 'aria-live': 'polite' }, 'The switch starts knowing nothing. Send A → B and watch what it does.');
    const portHost = (p) => Object.keys(port).find((k) => port[k] === p);
    function table(hl) {
      tb.innerHTML = ''; const ms = Object.keys(sw.table);
      if (!ms.length) tb.append(H('tr', null, H('td', { colspan: 2, class: 'note', text: hub ? '(a hub has no table — it is just a repeater)' : '(empty)' })));
      ms.forEach((m) => tb.append(H('tr', { class: m === hl ? 'hl' : '' }, H('td', { text: m }), H('td', { text: 'port ' + sw.table[m] }))));
    }
    async function send(s, d) {
      if (busy) return; busy = true;
      const dm = d === 'ALL' ? BC : MAC[d], sm = MAC[s];
      const r = E.switchForward(sw, port[s], sm, dm, hub);
      table(r.learned ? sm : null);
      const col = 'var(--cyan)';
      await fly(svg, [pos[s], C], { color: col, label: s + '→' + (d === 'ALL' ? '*' : d) });
      const parts = [];
      if (hub) parts.push('Hub: repeats every bit out of every other port. No decisions, no privacy.');
      else {
        if (r.learned) parts.push(['Learned: ', H('b', { text: sm }), ' lives on port ' + port[s] + '. ']);
        if (r.filtered) parts.push('Destination is on the same port it came from — filtered, nothing sent.');
        else parts.push(r.flood ? (d === 'ALL' ? 'Broadcast → flooded to all other ports.' : 'Destination ' + dm.slice(-5) + ' unknown → FLOOD to all other ports.') : 'Destination known on port ' + r.out[0] + ' → forwarded ONLY there.');
      }
      log.innerHTML = ''; log.append(...parts.flat());
      await Promise.all(r.out.map((p) => { const h = portHost(p); return fly(svg, [C, pos[h]], { color: col, label: s + '→' + (d === 'ALL' ? '*' : d) }).then(() => {
        const mine = d === 'ALL' || h === d; flash(hosts[h].r, mine ? 'var(--lime)' : 'var(--red)');
        const t = S('text', { x: pos[h][0], y: pos[h][1] + (pos[h][1] < 100 ? -32 : 40), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: mine ? 'var(--lime)' : 'var(--red)' }, svg, mine ? '✓ accepts' : '✗ not mine, ignores');
        setTimeout(() => t.remove(), RMsafe(1400));
      }); }));
      busy = false;
    }
    const RMsafe = (n) => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : n);
    const hn = ['A', 'B', 'C', 'D'].map((k) => [k, 'Host ' + k]);
    const sS = sel(hn, 'A', (v) => (src = v)), dS = sel(hn.concat([['ALL', 'broadcast']]), 'B', (v) => (dst = v));
    const modeB = H('button', { onclick: () => { hub = !hub; sw.table = {}; modeB.textContent = hub ? 'mode: HUB (1980s)' : 'mode: SWITCH'; table(); log.textContent = hub ? 'Hub mode: everything goes everywhere. Collisions return.' : 'Switch mode: it will learn as it goes.'; } }, 'mode: SWITCH');
    b.append(H('div', { class: 'ctl' }, H('label', null, 'from', sS), H('label', null, 'to', dS), H('button', { class: 'pri', onclick: () => send(src === dst ? (src === 'A' ? 'B' : 'A') : src, dst) }, 'Send frame'), modeB,
      H('button', { onclick: () => { sw.table = {}; table(); log.textContent = 'Table cleared (entries also age out after ~5 minutes in real switches).'; } }, 'forget everything')),
    log, H('h3', { text: 'MAC address table (CAM)' }), H('div', { class: 'tblwrap' }, H('table', { class: 'tbl' }, H('thead', null, H('tr', null, H('th', { text: 'MAC' }), H('th', { text: 'port' }))), tb)),
    H('p', { class: 'note', text: 'Try: A→B (flood), B→A (unicast — learned B too), A→B again (now direct), then C→A.' }));
    table();
  }));

  /* ===== 4. VLANs ===== */
  reg(() => lab('w-vlan', 'Lab 4 · VLANs and a trunk', (b) => {
    const svg = svgIn(b, [640, 340], 'Two switches joined by a trunk, six hosts in VLANs');
    const VC = { 10: 'var(--v10)', 20: 'var(--v20)', 30: 'var(--v30)' }, VN = { 10: 'VLAN 10', 20: 'VLAN 20', 30: 'VLAN 30' };
    const S1 = [200, 170], S2 = [440, 170];
    const hp = { L1: [60, 50], L2: [60, 170], L3: [60, 290], R1: [580, 50], R2: [580, 170], R3: [580, 290] };
    const vlan = { L1: 10, L2: 20, L3: 10, R1: 10, R2: 20, R3: 20 };
    const trunk = { 10: true, 20: true, 30: true };
    const side = (h) => h[0], swp = (h) => (h[0] === 'L' ? S1 : S2);
    line(svg, S1, S2, { 'stroke-width': 6, stroke: 'var(--amber)' });
    S('text', { x: 320, y: 153, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--amber)' }, svg, 'TRUNK (carries tagged frames)');
    const hn = {}, lines = {};
    Object.keys(hp).forEach((k) => { lines[k] = line(svg, hp[k], swp(k), { 'stroke-width': 4 }); });
    node(svg, S1[0], S1[1], 90, 70, 'SW1', '', 'var(--amber)'); node(svg, S2[0], S2[1], 90, 70, 'SW2', '', 'var(--amber)');
    const lbl = {};
    Object.keys(hp).forEach((k) => {
      hn[k] = node(svg, hp[k][0], hp[k][1], 78, 40, k, '', VC[vlan[k]]);
      hn[k].g.style.cursor = 'pointer'; hn[k].g.setAttribute('tabindex', 0); hn[k].g.setAttribute('role', 'button'); hn[k].g.setAttribute('aria-label', 'host ' + k + ', click to change its VLAN');
      lbl[k] = S('text', { x: hp[k][0], y: hp[k][1] + 14, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: VC[vlan[k]] }, svg);
      const cyc = () => { vlan[k] = vlan[k] === 10 ? 20 : vlan[k] === 20 ? 30 : 10; paint(); };
      hn[k].g.addEventListener('click', cyc); hn[k].g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cyc(); } });
    });
    function paint() { Object.keys(hp).forEach((k) => { hn[k].r.style.stroke = VC[vlan[k]]; lbl[k].style.fill = VC[vlan[k]]; lbl[k].textContent = 'access · ' + VN[vlan[k]]; lines[k].style.stroke = VC[vlan[k]]; }); }
    paint();
    const log = H('div', { class: 'log', 'aria-live': 'polite' }, 'Each coloured host is on an access port for one VLAN. Click a host to move its port to another VLAN. Then send a frame.');
    let from = 'L1', to = 'R1', busy = false;
    const names = Object.keys(hp).map((k) => [k, k]);
    const say = (...x) => { log.innerHTML = ''; log.append(...x.flat()); };
    async function send(bc) {
      if (busy) return; busy = true;
      const v = vlan[from], col = VC[v];
      const targets = bc ? Object.keys(hp).filter((h) => h !== from) : [to];
      if (!bc && to === from) { say('Pick a different destination.'); busy = false; return; }
      const same = targets.filter((h) => vlan[h] === v);
      const lab = (bc ? 'bcast' : from + '→' + to);
      await fly(svg, [hp[from], swp(from)], { color: col, label: lab });
      const local = same.filter((h) => side(h) === side(from)), far = same.filter((h) => side(h) !== side(from));
      const msgs = [];
      if (!same.length) {
        const sw = swp(from); const t = S('text', { x: sw[0], y: sw[1] + 58, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: 'var(--red)' }, svg, '✗ no VLAN ' + v + ' members here');
        setTimeout(() => t.remove(), 2200);
        msgs.push(bc ? 'Broadcast stays inside VLAN ' + v + ' — nobody else is a member, so nobody hears it.' : to + ' is in VLAN ' + vlan[to] + ', not ' + v + '. Different VLANs are different broadcast domains: the switch will not forward between them. Only a router can.');
        say(msgs); busy = false; return;
      }
      const jobs = [];
      local.forEach((h) => jobs.push(fly(svg, [swp(from), hp[h]], { color: col, label: lab }).then(() => flash(hn[h].r, 'var(--lime)'))));
      if (far.length) {
        if (!trunk[v]) { msgs.push('VLAN ' + v + ' is pruned from the trunk’s allowed list → dropped at the trunk.'); }
        else {
          const o = swp(from) === S1 ? S2 : S1;
          jobs.push(fly(svg, [swp(from), o], { color: col, label: 'tag VID ' + v, dur: 1100 }).then(() => Promise.all(far.map((h) => fly(svg, [o, hp[h]], { color: col, label: lab }).then(() => flash(hn[h].r, 'var(--lime)'))))));
          msgs.push('Crossing the trunk the frame carries an 802.1Q tag (VID ' + v + ') so SW2 knows which VLAN it belongs to; the tag is stripped again before it reaches the access port — the host never sees it.');
        }
      }
      if (local.length || !far.length) msgs.unshift(bc ? 'Broadcast flooded only to VLAN ' + v + ' members. ' : 'Same VLAN → delivered. ');
      say(msgs);
      await Promise.all(jobs); busy = false;
    }
    const tr = H('div', { class: 'ctl' }, H('span', { text: 'trunk allows:' }), [10, 20, 30].map((v) => H('label', { style: 'color:' + VC[v] }, H('input', { type: 'checkbox', checked: true, onchange: (e) => { trunk[v] = e.target.checked; } }), String(v))));
    b.append(H('div', { class: 'ctl' }, H('label', null, 'from', sel(names, from, (x) => (from = x))), H('label', null, 'to', sel(names, to, (x) => (to = x))),
      H('button', { class: 'pri', onclick: () => send(false) }, 'Send unicast'), H('button', { onclick: () => send(true) }, 'Send broadcast')), tr, log,
    H('p', { class: 'note', text: 'Try: L1→R1 (same VLAN across the trunk), L1→L2 (blocked), untick “10” and retry, then click L2 to move it into VLAN 10.' }));
  }));
})();
