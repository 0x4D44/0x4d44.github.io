/* Down the Wire — labs 5-9: routing, DNS, MTU, Nagle. */
(function () {
  'use strict';
  const { S, H, E, sleep, tween, fly, node, flash, line, sel, lab, svgIn } = window.__wire;
  const reg = (f) => (window.__wireWidgets = window.__wireWidgets || []).push(f);

  /* ===== 5. Routing stepper ===== */
  const ROUTES = [
    { cidr: '192.168.1.0/24', via: 'link', dev: 'eth0', note: 'connected: home LAN' },
    { cidr: '10.0.0.0/24', via: 'link', dev: 'eth1', note: 'connected: server LAN' },
    { cidr: '10.0.0.0/8', via: '10.0.0.254', dev: 'eth1', note: 'rest of corporate 10/8' },
    { cidr: '0.0.0.0/0', via: '203.0.113.1', dev: 'eth2', note: 'default → ISP' },
  ];
  reg(() => lab('w-route', 'Lab 5 · follow a packet across a router', (b) => {
    const svg = svgIn(b, [640, 300], 'Host A, a router and two destinations');
    const P = { A: [70, 150], R: [320, 150], B: [570, 70], C: [70, 40], N: [570, 250] };
    line(svg, P.A, P.R, { stroke: 'var(--cyan)', 'stroke-width': 4 }); line(svg, P.R, P.B, { stroke: 'var(--amber)', 'stroke-width': 4 }); line(svg, P.R, P.N, { stroke: 'var(--vio)', 'stroke-width': 4, 'stroke-dasharray': '2 8' });
    line(svg, P.A, P.C, { stroke: 'var(--cyan)', 'stroke-width': 4 });
    const nA = node(svg, ...P.A, 110, 46, 'Host A', '192.168.1.10', 'var(--cyan)'), nR = node(svg, ...P.R, 110, 70, 'ROUTER', 'eth0 .1 · eth1 .1', 'var(--mag)');
    const nB = node(svg, ...P.B, 120, 46, 'Server B', '10.0.0.20', 'var(--amber)'), nC = node(svg, ...P.C, 120, 40, 'Host C', '192.168.1.30', 'var(--cyan)'), nN = node(svg, ...P.N, 120, 46, 'Internet', '8.8.8.8', 'var(--vio)');
    S('text', { x: 190, y: 138, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--cyan)' }, svg, '192.168.1.0/24'); S('text', { x: 460, y: 100, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--amber)' }, svg, '10.0.0.0/24'); S('text', { x: 450, y: 215, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--vio)' }, svg, 'WAN eth2');
    const M = { A: 'aa:aa:aa:00:00:0a', R0: 'bb:bb:bb:00:00:00', R1: 'bb:bb:bb:00:00:01', B: 'cc:cc:cc:00:00:0b', C: 'dd:dd:dd:00:00:0c', ISP: 'ee:ee:ee:00:00:01' };
    const DST = { B: ['10.0.0.20', 'B', nB, P.B], C: ['192.168.1.30', 'C', nC, P.C], N: ['8.8.8.8', 'N', nN, P.N] };
    let who = 'B', step = 0, steps = [], busy = false;
    const log = H('div', { class: 'log', 'aria-live': 'polite' }), hdr = H('tbody'), rt = H('tbody'), ctr = H('span', { class: 'note' });
    function plan() {
      const [ip, k, , pos] = DST[who]; const local = k === 'C';
      const l = E.lookup(ROUTES, ip), r = ROUTES[l.best];
      const mk = (src, dstM, ttl, sip) => ({ smac: src, dmac: dstM, sip, dip: ip, ttl });
      steps = [];
      const frameBase = { smac: '—', dmac: '—', sip: '192.168.1.10', dip: ip, ttl: 64 };
      steps.push({ t: ['Host A wants to reach ', H('b', { text: ip }), '. First question: is it on my own subnet? ' + (local ? '192.168.1.30 AND 255.255.255.0 = 192.168.1.0 — same as mine. Yes: deliver directly, no router.' : ip + ' AND 255.255.255.0 = ' + E.n2ip(E.ip2n(ip) & 0xFFFFFF00) + ' ≠ 192.168.1.0. No: hand it to the default gateway, 192.168.1.1.')], f: frameBase, anim: null });
      const target = local ? 'Host C' : 'the router’s eth0';
      steps.push({ t: ['A knows an ', H('b', { text: 'IP' }), ' but frames need a ', H('b', { text: 'MAC' }), '. ARP: broadcast “who has ' + (local ? '192.168.1.30' : '192.168.1.1') + '? tell 192.168.1.10” to ff:ff:ff:ff:ff:ff. Every host on the LAN hears it; only the owner answers.'], f: { smac: M.A, dmac: 'ff:ff:ff:ff:ff:ff', sip: '(ARP request)', dip: local ? '192.168.1.30' : '192.168.1.1', ttl: '—' }, anim: async () => { await Promise.all([fly(svg, [P.A, P.R], { color: 'var(--cyan)', label: 'ARP?', dur: 700 }), fly(svg, [P.A, P.C], { color: 'var(--cyan)', label: 'ARP?', dur: 700 })]); } });
      steps.push({ t: [target + ' answers by unicast: “that IP is at ' + (local ? M.C : M.R0) + '”. A caches it (for ~minutes) so it will not need to ask again.'], f: { smac: local ? M.C : M.R0, dmac: M.A, sip: '(ARP reply)', dip: '192.168.1.10', ttl: '—' }, anim: async () => { await fly(svg, local ? [P.C, P.A] : [P.R, P.A], { color: 'var(--lime)', label: 'ARP!', dur: 700 }); } });
      const dm1 = local ? M.C : M.R0;
      steps.push({ t: ['Now A can build the real frame. Note the split: ', H('b', { text: 'IP dst = the final destination' }), ', but ', H('b', { text: 'MAC dst = the next hop' }), ' (' + (local ? 'Host C itself' : 'the router') + ').'], f: mk(M.A, dm1, 64, '192.168.1.10'), ch: ['smac', 'dmac'], anim: async () => { await fly(svg, local ? [P.A, P.C] : [P.A, P.R], { color: 'var(--cyan)', label: 'IP→' + ip.split('.').pop(), dur: 900 }); if (local) flash(nC.r, 'var(--lime)'); } });
      if (local) { steps.push({ t: ['Delivered. One hop, no routing, TTL untouched. This is pure switching: the whole conversation was Ethernet addressing.'], f: mk(M.A, M.C, 64, '192.168.1.10'), anim: null, end: true }); return; }
      steps.push({ t: ['Router receives the frame (MAC matches, so it accepts), ', H('b', { text: 'strips the Ethernet header' }), ', decrements TTL 64 → 63, and does a routing lookup on the destination IP. ' + l.matches.length + ' route' + (l.matches.length > 1 ? 's match' : ' matches') + '; the ', H('b', { text: 'longest prefix' }), ' (' + r.cidr + ') wins.'], f: mk(M.A, M.R0, 63, '192.168.1.10'), ch: ['ttl'], hl: l, anim: async () => { flash(nR.r, 'var(--mag)'); await sleep(500); } });
      const via = r.via === 'link' ? ip : r.via, out = r.dev;
      const dm2 = who === 'B' ? M.B : M.ISP;
      steps.push({ t: [r.via === 'link' ? 'Destination is directly connected on ' + out + ', so the router ARPs for ' + ip + ' itself (same dance as before, on the other LAN).' : 'Next hop is ' + via + ' out of ' + out + ' — router ARPs for ' + via + ', the ISP’s router, not for 8.8.8.8 (which is far away and unreachable by ARP).'], f: { smac: M.R1, dmac: 'ff:ff:ff:ff:ff:ff', sip: '(ARP request)', dip: via, ttl: '—' }, hl: l, anim: async () => { await fly(svg, [P.R, pos], { color: 'var(--mag)', label: 'ARP?', dur: 700 }); await fly(svg, [pos, P.R], { color: 'var(--lime)', label: 'ARP!', dur: 700 }); } });
      steps.push({ t: ['The router builds a ', H('b', { text: 'brand-new frame' }), ': source MAC is now the router’s outgoing interface, destination MAC is the next hop. The IP addresses did not change — only the TTL did. (Going to the real Internet, a home router would also rewrite the private source address via NAT; this lab leaves that out.) MACs live for one hop; IPs live end to end.'], f: mk(M.R1, dm2, 63, '192.168.1.10'), ch: ['smac', 'dmac'], hl: l, anim: async () => { await fly(svg, [P.R, pos], { color: 'var(--amber)', label: 'IP→' + ip.split('.').pop(), dur: 1000 }); flash(DST[who][2].r, 'var(--lime)'); } });
      steps.push({ t: ['Delivered after 2 L2 hops and 1 L3 hop. Every further router repeats the strip-lookup-rewrite routine. If TTL hit 0 the router would drop it and send ICMP “time exceeded” — which is how traceroute works.'], f: mk(M.R1, dm2, 63, '192.168.1.10'), hl: l, anim: null, end: true });
    }
    function render() {
      const s = steps[step]; log.innerHTML = ''; log.append(...s.t);
      hdr.innerHTML = ''; ['smac:src MAC', 'dmac:dst MAC', 'sip:src IP', 'dip:dst IP', 'ttl:TTL'].forEach((x) => { const [k, n] = x.split(':'); hdr.append(H('tr', null, H('td', { text: n }), H('td', { class: s.ch && s.ch.includes(k) ? 'ch' : '', text: String(s.f[k]) }))); });
      rt.innerHTML = ''; ROUTES.forEach((r, i) => rt.append(H('tr', { class: s.hl ? (s.hl.best === i ? 'hl' : s.hl.matches.includes(i) ? 'm' : '') : '' }, H('td', { text: r.cidr }), H('td', { text: r.via }), H('td', { text: r.dev }))));
      ctr.textContent = 'step ' + (step + 1) + ' / ' + steps.length;
    }
    async function go(d) {
      if (busy) return; const n = step + d; if (n < 0 || n >= steps.length) return;
      step = n; render();
      if (d > 0 && steps[step].anim) { busy = true; await steps[step].anim(); busy = false; }
    }
    function reset() { plan(); step = 0; render(); }
    b.append(H('div', { class: 'ctl' }, H('label', null, 'destination', sel([['B', 'Server B (via router)'], ['N', 'Internet (default route)'], ['C', 'Host C (same LAN)']], 'B', (v) => { who = v; reset(); })),
      H('button', { onclick: () => go(-1) }, '◀ back'), H('button', { class: 'pri', onclick: () => go(1) }, 'next ▶'), H('button', { onclick: reset }, '↺ restart'), ctr), log,
    H('div', { class: 'grid2', style: 'margin-top:12px' }, H('div', null, H('h3', { text: 'Frame header now', style: 'margin-top:0' }), H('div', { class: 'tblwrap' }, H('table', { class: 'tbl' }, hdr))),
      H('div', null, H('h3', { text: 'Router’s table (amber = matches, green = winner)', style: 'margin-top:0' }), H('div', { class: 'tblwrap' }, H('table', { class: 'tbl' }, H('thead', null, H('tr', null, H('th', { text: 'prefix' }), H('th', { text: 'via' }), H('th', { text: 'dev' }))), rt)))));
    reset();
  }));

  /* ===== 5b. Subnet + LPM tools ===== */
  reg(() => lab('w-subnet', 'Lab 5b · subnet and longest-prefix explorer', (b) => {
    const cells = H('div', { style: 'display:grid;grid-template-columns:repeat(32,minmax(0,1fr));gap:1px;margin:8px 0' }), tb = H('tbody'), inp = H('input', { type: 'text', value: '192.168.1.77/26', style: 'width:190px', 'aria-label': 'address with prefix length' });
    function draw() {
      const i = E.subnetInfo(inp.value), c = E.parseCidr(inp.value); cells.innerHTML = ''; tb.innerHTML = '';
      if (!i) { tb.append(H('tr', null, H('td', { class: 'bad', text: 'Enter something like 10.1.2.3/20' }))); return; }
      const n = E.ip2n(E.n2ip(c.ip));
      for (let k = 0; k < 32; k++) cells.append(H('i', { style: 'height:22px;border-radius:2px;font:700 9px var(--mono);display:grid;place-items:center;font-style:normal;color:#04121a;background:' + (k < i.len ? 'var(--cyan)' : 'var(--amber)') }, String((n >>> (31 - k)) & 1)));
      [['network', i.network + '/' + i.len], ['mask', i.mask], ['broadcast', i.broadcast], ['usable hosts', i.hosts + ' (' + i.first + ' – ' + i.last + ')']].forEach((r) => tb.append(H('tr', null, H('td', { text: r[0] }), H('td', { text: r[1] }))));
    }
    inp.addEventListener('input', draw);
    const lin = H('input', { type: 'text', value: '10.1.2.77', style: 'width:150px', 'aria-label': 'destination IP' }), lt = H('tbody'), lm = H('div', { class: 'log', 'aria-live': 'polite' });
    const R2 = [{ cidr: '0.0.0.0/0' }, { cidr: '10.0.0.0/8' }, { cidr: '10.1.0.0/16' }, { cidr: '10.1.2.0/24' }, { cidr: '192.168.0.0/16' }];
    function drawL() {
      const r = E.lookup(R2, lin.value); lt.innerHTML = '';
      if (!r) { lm.textContent = 'Not a valid IPv4 address.'; R2.forEach((x) => lt.append(H('tr', null, H('td', { text: x.cidr }), H('td', { text: '' })))); return; }
      R2.forEach((x, i) => lt.append(H('tr', { class: r.best === i ? 'hl' : r.matches.includes(i) ? 'm' : '' }, H('td', { text: x.cidr }), H('td', { text: r.best === i ? '← winner (longest)' : r.matches.includes(i) ? 'matches' : '' }))));
      lm.textContent = 'Every matching route is a candidate; the router picks the most specific (longest prefix). /0 matches everything, so it only wins when nothing else does.';
    }
    lin.addEventListener('input', drawL);
    b.append(H('div', { class: 'grid2' }, H('div', null, H('h3', { text: 'Subnet calculator', style: 'margin-top:0' }), H('div', { class: 'ctl' }, inp), H('div', { class: 'note', text: 'cyan = network bits, amber = host bits' }), cells, H('table', { class: 'tbl' }, tb)),
      H('div', null, H('h3', { text: 'Which route wins?', style: 'margin-top:0' }), H('div', { class: 'ctl' }, lin, ['10.1.2.77', '10.1.9.9', '10.200.0.1', '8.8.8.8'].map((x) => H('button', { onclick: () => { lin.value = x; drawL(); } }, x))), H('table', { class: 'tbl' }, lt), H('div', { style: 'height:8px' }), lm)));
    draw(); drawL();
  }));

  /* ===== 6. DNS ===== */
  reg(() => lab('w-dns', 'Lab 6 · DNS: resolving a name', (b) => {
    const svg = svgIn(b, [640, 300], 'Browser, resolver, root, TLD and authoritative servers');
    const P = { me: [60, 150], rs: [210, 150], root: [450, 40], tld: [570, 150], auth: [450, 260] };
    ['root', 'tld', 'auth'].forEach((k) => line(svg, P.rs, P[k], { 'stroke-dasharray': '3 6' })); line(svg, P.me, P.rs);
    node(svg, ...P.me, 90, 44, 'Your app', 'stub', 'var(--cyan)'); const rs = node(svg, ...P.rs, 100, 50, 'Resolver', 'ISP / 1.1.1.1', 'var(--mag)');
    const root = node(svg, ...P.root, 110, 44, 'Root  .', '13 server names', 'var(--amber)'), tld = node(svg, ...P.tld, 100, 44, 'TLD', '.com / .uk', 'var(--vio)'), auth = node(svg, ...P.auth, 120, 44, 'Authoritative', 'ns1.example.com', 'var(--lime)');
    const N = { root, tld, auth };
    const cache = {}; let clock = 0, busy = false, runId = 0;
    const log = H('div', { class: 'log', 'aria-live': 'polite' }, 'Type a name and press Resolve. Then resolve it again, and a sibling name (e.g. mail.example.com).'), ctb = H('tbody');
    const inp = H('input', { type: 'text', value: 'www.example.com', style: 'width:190px', 'aria-label': 'domain name' });
    let type = 'A';
    const fmtT = (s) => (s >= 86400 ? Math.round(s / 86400) + ' d' : s >= 3600 ? Math.round(s / 3600) + ' h' : s + ' s');
    function drawCache() { ctb.innerHTML = ''; const ks = Object.keys(cache).filter((k) => cache[k].exp > clock); if (!ks.length) ctb.append(H('tr', null, H('td', { colspan: 3, class: 'note', text: '(empty — every query starts cold)' }))); ks.forEach((k) => ctb.append(H('tr', null, H('td', { text: k }), H('td', { text: cache[k].v }), H('td', { text: fmtT(Math.round(cache[k].exp - clock)) })))); }
    const live = (k) => cache[k] && cache[k].exp > clock;
    const add = (k, v, ttl) => { cache[k] = { v, exp: clock + ttl }; };
    const line1 = (...x) => { log.append(H('div', null, ...x)); log.scrollTop = 1e6; };
    async function resolve() {
      if (busy) return; const name = inp.value.trim().toLowerCase().replace(/\.$/, '');
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) || name.length > 253) { log.textContent = 'That is not a valid hostname (letters, digits, hyphens and dots; at least two labels).'; return; }
      const plan = E.dnsPlan(name, type); busy = true; log.innerHTML = ''; let ms = 1;
      line1(H('b', { text: 'app → resolver: ' }), name + ' ' + type + '?  (UDP port 53)');
      await fly(svg, [P.me, P.rs], { label: 'Q', dur: 500 });
      const ck = type + ' ' + name;
      if (live(ck)) { line1(H('b', { text: 'resolver: ' }), 'cache HIT — answer ' + cache[ck].v + ' (TTL left ' + fmtT(Math.round(cache[ck].exp - clock)) + '). No other server involved.'); await fly(svg, [P.rs, P.me], { color: 'var(--lime)', label: 'A', dur: 500 }); flash(rs.r, 'var(--lime)'); line1(H('b', { text: 'total ≈ ' + ms + ' ms' })); busy = false; drawCache(); return; }
      const hasZone = live('NS ' + plan.zone), hasTld = live('NS .' + plan.tld);
      const steps = hasZone ? [2] : hasTld ? [1, 2] : [0, 1, 2], who = ['root', 'tld', 'auth'], lat = [14, 22, 28];
      if (hasZone) line1('resolver: ', H('b', { text: plan.zone + ' name servers already cached' }), ' → skip root and TLD.'); else if (hasTld) line1('resolver: ', H('b', { text: '.' + plan.tld + ' servers already cached' }), ' → skip the root.');
      for (const i of steps) {
        const s = plan.steps[i];
        line1(H('b', { text: 'resolver → ' + who[i] + ': ' }), s.q);
        await fly(svg, [P.rs, P[who[i]]], { color: 'var(--amber)', label: 'Q', dur: 650 }); flash(N[who[i]].r, 'var(--amber)');
        line1(H('b', { text: who[i] + ' → resolver: ' }), s.a);
        await fly(svg, [P[who[i]], P.rs], { color: s.kind === 'answer' ? 'var(--lime)' : 'var(--vio)', label: s.kind === 'answer' ? 'A' : 'NS', dur: 650 }); ms += lat[i];
        if (i === 0) add('NS .' + plan.tld, 'a.' + plan.tld + '-servers.net', 172800); if (i === 1) add('NS ' + plan.zone, 'ns1.' + plan.zone, 86400);
      }
      add(ck, plan.answer, plan.ttl);
      await fly(svg, [P.rs, P.me], { color: 'var(--lime)', label: plan.answer.length > 14 ? 'A' : plan.answer, dur: 500 });
      line1(H('b', { text: 'answer: ' }), name + ' → ' + plan.answer + '  (TTL ' + plan.ttl + ' s, now cached)'); line1(H('b', { text: 'total ≈ ' + ms + ' ms' }), steps.length === 3 ? ' (cold: 3 round trips beyond the resolver)' : ' (warm shortcuts helped)');
      busy = false; drawCache();
    }
    b.append(H('div', { class: 'ctl' }, inp, sel([['A', 'A (IPv4)'], ['AAAA', 'AAAA (IPv6)'], ['MX', 'MX (mail)']], 'A', (v) => (type = v)), H('button', { class: 'pri', onclick: resolve }, 'Resolve'),
      H('button', { onclick: () => { clock += 60; drawCache(); } }, '⏩ +60 s'), H('button', { onclick: () => { clock += 3600; drawCache(); } }, '⏩ +1 h'), H('button', { onclick: () => { for (const k in cache) delete cache[k]; drawCache(); } }, 'flush cache')), log,
    H('h3', { text: 'The resolver’s cache (TTLs count down as you fast-forward)' }), H('div', { class: 'tblwrap' }, H('table', { class: 'tbl' }, H('thead', null, H('tr', null, H('th', { text: 'record' }), H('th', { text: 'value' }), H('th', { text: 'TTL left' }))), ctb)));
    drawCache();
  }));

  /* ===== 7. MTU ===== */
  reg(() => lab('w-mtu', 'Lab 7 · what a jumbo frame buys you', (b) => {
    const svg = svgIn(b, [640, 150], 'The same stretch of wire carrying frames of the chosen MTU');
    const g = S('g', null, svg);
    let mtu = 1500, vlan = false;
    const stat = H('div', { class: 'stat' }), meter = H('div', { class: 'meter' }, H('i')), val = H('b', { text: '1500' });
    const WIN = 9600, W = 620;
    function draw() {
      g.innerHTML = '';
      const e = E.efficiency(mtu, { vlan }), base = E.efficiency(1500, { vlan });
      const sc = W / WIN; let x = 10; const y = 52, h = 34;
      S('text', { x: 10, y: 24, 'font-size': 12, fill: 'var(--dim)' }, g, 'The same ' + WIN + ' bytes of wire time, filled with ' + mtu + '-byte-MTU frames (red = overhead you pay every frame):');
      const segs = [['gap', 12, 'var(--line)'], ['pre', 8, 'var(--dim)'], ['hdr', 14 + (vlan ? 4 : 0), 'var(--red)'], ['ip', 40, 'var(--red)'], ['data', e.payload, 'var(--cyan)'], ['fcs', 4, 'var(--red)']];
      const full = Math.floor(WIN / e.wire); let used = 0;
      for (let f = 0; f < full; f++) { segs.forEach((s) => { const w = Math.max(.7, s[1] * sc); S('rect', { x, y, width: w, height: h, fill: s[2], opacity: s[0] === 'data' ? .55 : .95 }, g); x += s[1] * sc; }); used += e.wire; }
      const rem = WIN - used; if (rem > 0) S('rect', { x, y, width: rem * sc, height: h, fill: 'none', stroke: 'var(--line)', 'stroke-dasharray': '3 3' }, g);
      S('text', { x: 10, y: 118, 'font-size': 12, fill: 'var(--ink)' }, g, full + ' frame' + (full === 1 ? '' : 's') + ' · ' + (full * (WIN > 0 ? 78 + (vlan ? 4 : 0) : 0)) + ' B of headers/gaps · ' + Math.round(e.eff * 1000) / 10 + '% goodput');
      const p = E.pps(10e9, mtu, { vlan }), pb = E.pps(10e9, 1500, { vlan });
      stat.innerHTML = '';
      [[(e.eff * 100).toFixed(1) + '%', 'wire efficiency (TCP payload)'], [Math.round(e.framesPerGB).toLocaleString(), 'frames per GB sent'], [Math.round(p / 1000).toLocaleString() + ' k', 'frames/s at 10 Gb/s'], [(p / pb * 100).toFixed(0) + '%', 'of 1500-MTU interrupt/packet load']].forEach((s) => stat.append(H('div', null, H('b', { text: s[0] }), H('span', { text: s[1] }))));
      meter.firstChild.style.width = (e.eff * 100) + '%'; val.textContent = String(mtu);
    }
    const range = H('input', { type: 'range', min: 576, max: 9216, step: 1, value: 1500, 'aria-label': 'MTU in bytes', oninput: (e) => { mtu = +e.target.value; draw(); } });
    b.append(H('div', { class: 'ctl' }, H('label', null, 'MTU ', val, ' B', range), [[576, 'dial-up 576'], [1280, 'IPv6 min 1280'], [1500, 'standard'], [9000, 'jumbo 9000']].map((p) => H('button', { onclick: () => { mtu = p[0]; range.value = p[0]; draw(); } }, p[1])),
      H('label', null, H('input', { type: 'checkbox', onchange: (e) => { vlan = e.target.checked; draw(); } }), '+802.1Q tag')), svg.parentNode, H('div', { style: 'height:12px' }), stat, H('div', { style: 'height:10px' }), meter,
    H('p', { class: 'note', text: 'Headers assumed: 14 Ethernet + 20 IP + 20 TCP, plus 8 preamble, 4 FCS and 12 inter-frame gap. Jumbo frames do not make a link faster — they make the endpoints do less work per byte, which matters at 10/25/100 Gb/s.' }));
    draw();
  }));

  reg(() => lab('w-pmtu', 'Lab 7b · path MTU: why jumbo frames break things', (b) => {
    const svg = svgIn(b, [640, 150], 'Four routers joined by links of differing MTU');
    const X = [50, 220, 390, 560], links = [9000, 1500, 9000]; let size = 8000, df = true, busy = false;
    const N = X.map((x, i) => node(svg, x, 60, 70, 36, i === 0 ? 'Sender' : i === 3 ? 'Receiver' : 'Router ' + i, '', i === 0 || i === 3 ? 'var(--cyan)' : 'var(--vio)'));
    const mtuT = links.map((m, i) => { line(svg, [X[i] + 35, 60], [X[i + 1] - 35, 60]); return S('text', { x: (X[i] + X[i + 1]) / 2, y: 40, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: 'var(--amber)' }, svg, 'MTU ' + m); });
    const log = H('div', { class: 'log', text: 'A sender with jumbo frames enabled, a hop that only does 1500. Press Send.' }), sv = H('b', { text: '8000' });
    const note = (t, c) => { const e = S('text', { x: 320, y: 125, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: c }, svg, t); setTimeout(() => e.remove(), 2600); };
    async function send() {
      if (busy) return; busy = true; const r = E.pathMtu(links, size, df);
      const stop = r.ok ? 3 : r.at;
      for (let i = 0; i <= stop; i++) {
        if (!r.ok && i === stop) { await fly(svg, [[X[i] + 35, 60], [(X[i] + X[i + 1]) / 2 - 30, 60]], { color: 'var(--red)', label: size + ' B', dur: 700 }); note('✗ dropped (DF set)', 'var(--red)'); await fly(svg, [[(X[i] + X[i + 1]) / 2 - 30, 90], [X[i] , 90], [X[0], 90]], { color: 'var(--amber)', label: 'ICMP 3/4', dur: 1100 }); break; }
        const m = links[i] || 0; await fly(svg, [[X[i], 60], [X[i + 1] || X[i], 60]], { color: 'var(--cyan)', label: (i >= 1 && r.pieces && r.pieces.length > 1 ? 'frags' : size + ' B'), dur: 650 });
      }
      log.innerHTML = '';
      if (!r.ok) log.append(H('b', { text: 'Result: ' }), r.log[r.log.length - 1], ' A well-behaved sender then lowers its packet size (PMTU discovery). If a firewall eats that ICMP message, the connection hangs forever on big packets — the infamous “PMTU black hole”: small requests work, large transfers stall.');
      else log.append(H('b', { text: 'Result: ' }), r.log.length ? r.log.join('; ') + '. Delivered as ' + r.pieces.length + ' fragments the receiver must reassemble — slow, and losing any one fragment loses the whole packet. (IPv6 routers never fragment; only the sender may.)' : 'Fits every link — delivered intact.');
      busy = false;
    }
    b.append(H('div', { class: 'ctl' }, H('label', null, 'packet ', sv, ' B', H('input', { type: 'range', min: 576, max: 9000, step: 1, value: 8000, 'aria-label': 'packet size', oninput: (e) => { size = +e.target.value; sv.textContent = size; } })),
      H('label', null, H('input', { type: 'checkbox', checked: true, onchange: (e) => (df = e.target.checked) }), 'DF (don’t fragment) bit'), H('button', { class: 'pri', onclick: send }, 'Send'),
      H('label', null, 'middle link', sel([['1500', '1500'], ['9000', '9000'], ['1400', '1400 (VPN)']], '1500', (v) => { links[1] = +v; mtuT[1].textContent = 'MTU ' + v; })), svg.parentNode), log);
  }));

  /* ===== 8. Nagle ===== */
  reg(() => lab('w-nagle', 'Lab 8 · Nagle, delayed ACK and the 40 ms stall', (b) => {
    const SC = {
      wwr: { name: 'Write-write-read (header+body)', writes: [{ t: 0, size: 60 }, { t: 0.3, size: 200 }], reqBytes: 260 },
      typing: { name: 'Typing (12 keystrokes)', writes: Array.from({ length: 12 }, (_, i) => ({ t: i * 15, size: 1 })), reqBytes: 0 },
      bulk: { name: 'Bulk upload (6 × 3 kB)', writes: Array.from({ length: 6 }, (_, i) => ({ t: i * 0.5, size: 3000 })), reqBytes: 0 },
    };
    const st = { sc: 'wwr', rtt: 20, nagle: true, delack: true };
    const holder = H('div'), tbl = H('tbody'), log = H('div', { class: 'log', 'aria-live': 'polite' });
    const doneOf = (r) => (r.done != null ? r.done : Math.max(0, ...r.segs.filter((s) => s.kind === 'data').map((s) => s.t1)));
    const run = (o) => E.simTcp({ writes: SC[st.sc].writes, reqBytes: SC[st.sc].reqBytes, rtt: st.rtt, nagle: o.n, delack: o.d });
    function draw() {
      const r = run({ n: st.nagle, d: st.delack }); holder.innerHTML = '';
      const T = Math.max(60, doneOf(r) * 1.12 + 6), VW = 640, VH = 380, xc = 130, xs = 510, y0 = 40, ys = (VH - 70) / T; const y = (t) => y0 + t * ys;
      const svg = svgIn(holder, [VW, VH], 'Sequence diagram of the TCP exchange'); const q = svg;
      S('text', { x: xc, y: 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--cyan)' }, q, 'Client'); S('text', { x: xs, y: 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--lime)' }, q, 'Server');
      line(q, [xc, y0], [xc, VH - 20], { 'stroke-width': 2 }); line(q, [xs, y0], [xs, VH - 20], { 'stroke-width': 2 });
      for (let t = 0; t <= T; t += T > 150 ? 50 : 20) { S('text', { x: 8, y: y(t) + 4, 'font-size': 11, fill: 'var(--dim)' }, q, t + ' ms'); S('line', { x1: 50, x2: VW - 10, y1: y(t), y2: y(t), stroke: 'var(--line)', 'stroke-width': .5, 'stroke-dasharray': '2 4' }, q); }
      r.segs.forEach((s) => {
        const a = s.from === 'c' ? [xc, y(s.t0)] : [xs, y(s.t0)], z = s.from === 'c' ? [xs, y(s.t1)] : [xc, y(s.t1)];
        const col = s.kind === 'data' ? 'var(--cyan)' : s.kind === 'ack' ? 'var(--lime)' : 'var(--mag)';
        S('line', { x1: a[0], y1: a[1], x2: z[0], y2: z[1], stroke: col, 'stroke-width': 2.4, 'stroke-dasharray': s.kind === 'ack' ? '5 4' : '' }, q);
        S('circle', { cx: z[0], cy: z[1], r: 3, fill: col }, q);
        const mx = (a[0] + z[0]) / 2, my = (a[1] + z[1]) / 2;
        S('text', { x: mx, y: my - 5, 'text-anchor': 'middle', 'font-size': 11, fill: col }, q, s.kind === 'data' ? s.bytes + ' B' : s.kind === 'ack' ? 'ACK' : 'reply');
      });
      r.marks.forEach((m) => S('text', { x: xc - 8, y: y(m.t) + 16, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--amber)' }, q, 'Nagle holds ' + m.buf + ' B'));
      const dn = doneOf(r);
      S('line', { x1: 40, x2: VW - 10, y1: y(dn), y2: y(dn), stroke: 'var(--amber)', 'stroke-width': 1.4 }, q);
      S('text', { x: VW - 12, y: y(dn) - 5, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: 'var(--amber)' }, q, (r.done != null ? 'reply received ' : 'last byte delivered ') + dn.toFixed(1) + ' ms');
      log.textContent = st.nagle && st.delack && st.sc === 'wwr' ? 'The classic trap: Nagle will not send the body until the header is ACKed; the server will not ACK until its 40 ms delayed-ACK timer fires (it has nothing to reply with yet). Two sensible features, one bad interaction. Turn either off and the stall vanishes.'
        : !st.nagle && st.sc === 'typing' ? 'TCP_NODELAY: every keystroke becomes its own 40-byte-overhead packet. Great latency, wasteful on a slow link.' : st.nagle && st.sc === 'typing' ? 'Nagle at work: while one keystroke is unACKed, the next ones queue up and ride together in a single segment.' : r.dataSegs + ' data segment' + (r.dataSegs === 1 ? '' : 's') + ' sent.';
      tbl.innerHTML = '';
      [[true, true], [true, false], [false, true], [false, false]].forEach(([n, d]) => { const rr = run({ n, d }); tbl.append(H('tr', { class: n === st.nagle && d === st.delack ? 'hl' : '' }, H('td', { text: n ? 'on' : 'off (NODELAY)' }), H('td', { text: d ? 'on' : 'off' }), H('td', { text: String(rr.dataSegs) }), H('td', { text: doneOf(rr).toFixed(1) + ' ms' }))); });
    }
    const cb = (k, t) => H('label', null, H('input', { type: 'checkbox', checked: st[k], onchange: (e) => { st[k] = e.target.checked; draw(); } }), t);
    b.append(H('div', { class: 'ctl' }, sel(Object.keys(SC).map((k) => [k, SC[k].name]), 'wwr', (v) => { st.sc = v; draw(); }), cb('nagle', 'Nagle'), cb('delack', 'delayed ACK (40 ms)'),
      H('label', null, 'RTT ', H('b', { id: 'rttv', text: st.rtt + ' ms' }), H('input', { type: 'range', min: 2, max: 100, value: st.rtt, 'aria-label': 'round trip time in ms', oninput: (e) => { st.rtt = +e.target.value; $('#rttv').textContent = st.rtt + ' ms'; draw(); } }))),
    log, H('div', { class: 'bigrow', style: 'margin-top:12px' }, holder, H('div', null, H('h3', { text: 'All four combinations', style: 'margin-top:0' }), H('div', { class: 'tblwrap' }, H('table', { class: 'tbl' }, H('thead', null, H('tr', null, ['Nagle', 'dACK', 'segs', 'done'].map((t) => H('th', { text: t })))), tbl)))));
    draw();
    function $(s) { return document.querySelector(s); }
  }));
})();
