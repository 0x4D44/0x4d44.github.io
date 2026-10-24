// Down the Wire — pure logic behind the widgets (no DOM). Tested in tests/engine.test.mjs.
(function (root) {
  'use strict';

  // ---------- CRC-32 (the Ethernet FCS polynomial) ----------
  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- Ethernet frame ----------
  function parseMac(s) {
    const str = String(s).trim();
    if (/:/.test(str) && /-/.test(str)) return null;
    const p = str.split(/[:\-]/);
    if (p.length !== 6 || !p.every((x) => /^[0-9a-fA-F]{1,2}$/.test(x))) return null;
    const b = p.map((x) => parseInt(x, 16));
    return b.some((x) => !(x >= 0 && x <= 255)) ? null : b;
  }
  function fmtMac(b) { return b.map((x) => x.toString(16).padStart(2, '0')).join(':'); }
  const utf8 = (s) => Array.from(new TextEncoder().encode(s));

  // opts: dst, src (strings), vlan (null | {vid, pcp}), ethertype (number), payload (byte array)
  // Returns {fields:[{id,name,bytes}], bytes, wire, fcsOk}. Payload is padded to 46 (42 when tagged).
  function buildFrame(o) {
    const dst = parseMac(o.dst) || [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    const src = parseMac(o.src) || [0, 0, 0, 0, 0, 0];
    const tagged = !!o.vlan;
    const minPay = tagged ? 42 : 46;
    let pay = (o.payload || []).slice(0, 1500);
    const padded = Math.max(0, minPay - pay.length);
    while (pay.length < minPay) pay.push(0);
    const et = (o.ethertype == null ? 0x0800 : o.ethertype) & 0xFFFF;
    const fields = [];
    fields.push({ id: 'pre', name: 'Preamble + SFD', bytes: [0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0xD5], onWire: true });
    fields.push({ id: 'dst', name: 'Destination MAC', bytes: dst });
    fields.push({ id: 'src', name: 'Source MAC', bytes: src });
    if (tagged) {
      const vid = Math.max(1, Math.min(4094, o.vlan.vid | 0)), pcp = (o.vlan.pcp || 0) & 7;
      const tci = (pcp << 13) | vid;
      fields.push({ id: 'tag', name: '802.1Q tag', bytes: [0x81, 0x00, tci >> 8, tci & 0xFF] });
    }
    fields.push({ id: 'type', name: 'EtherType', bytes: [et >> 8, et & 0xFF] });
    fields.push({ id: 'pay', name: 'Payload', bytes: pay, padded });
    const body = [].concat(...fields.filter((f) => !f.onWire).map((f) => f.bytes));
    const c = crc32(body);
    fields.push({ id: 'fcs', name: 'FCS (CRC-32)', bytes: [c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF, (c >>> 24) & 0xFF] });
    const bytes = [].concat(...fields.filter((f) => !f.onWire).map((f) => f.bytes));
    return { fields, bytes, wire: bytes.length + 8 + 12, fcsOk: true };
  }
  function checkFcs(bytes) {
    const body = bytes.slice(0, -4), f = bytes.slice(-4);
    const c = crc32(body);
    return f[0] === (c & 0xFF) && f[1] === ((c >>> 8) & 0xFF) && f[2] === ((c >>> 16) & 0xFF) && f[3] === ((c >>> 24) & 0xFF);
  }

  // ---------- IPv4 ----------
  function ip2n(s) {
    const p = String(s).trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; }
    return n >>> 0;
  }
  function n2ip(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function maskOf(len) { return len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0; }
  function parseCidr(s) {
    const m = String(s).trim().match(/^(\d+\.\d+\.\d+\.\d+)(?:\/(\d{1,2}))?$/);
    if (!m) return null;
    const ip = ip2n(m[1]); const len = m[2] == null ? 32 : +m[2];
    if (ip == null || len > 32) return null;
    return { ip, len };
  }
  function subnetInfo(s) {
    const c = parseCidr(s); if (!c) return null;
    const mask = maskOf(c.len), net = (c.ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
    const size = Math.pow(2, 32 - c.len);
    const hosts = c.len >= 31 ? (c.len === 31 ? 2 : 1) : size - 2;
    return {
      network: n2ip(net), mask: n2ip(mask), broadcast: n2ip(bc), len: c.len, size, hosts,
      first: c.len >= 31 ? n2ip(net) : n2ip(net + 1), last: c.len >= 31 ? n2ip(bc) : n2ip(bc - 1),
    };
  }
  function sameSubnet(a, b, len) { const m = maskOf(len); return ((a & m) >>> 0) === ((b & m) >>> 0); }
  // routes: [{cidr:'10.0.0.0/8', via, dev}] -> longest-prefix match; returns {route, matches[]}
  function lookup(routes, ipStr) {
    const ip = ip2n(ipStr); if (ip == null) return null;
    const matches = [];
    routes.forEach((r, i) => { const c = parseCidr(r.cidr); if (c && sameSubnet(ip, c.ip, c.len)) matches.push({ i, len: c.len }); });
    let best = null; matches.forEach((m) => { if (!best || m.len > best.len) best = m; });
    return { best: best ? best.i : -1, matches: matches.map((m) => m.i) };
  }

  // ---------- Learning switch ----------
  // sw = {table:{mac:port}, ports:[...]}. Returns {out:[ports], flood:bool, learned:bool}.
  function switchForward(sw, inPort, src, dst, isHub) {
    const cs = parseMac(src), cd = parseMac(dst);
    if (!cs || !cd) return { out: [], flood: false, learned: false, invalid: true };
    src = fmtMac(cs); dst = fmtMac(cd);
    const all = sw.ports.filter((p) => p !== inPort);
    if (isHub) return { out: all, flood: true, learned: false };
    let learned = false;
    const sm = parseMac(src);
    if (sm && !(sm[0] & 1) && sw.table[src] !== inPort) { sw.table[src] = inPort; learned = true; }
    const known = sw.table[dst];
    if (/^ff:ff:ff:ff:ff:ff$/i.test(dst) || known == null) return { out: all, flood: true, learned };
    if (known === inPort) return { out: [], flood: false, learned, filtered: true };
    return { out: [known], flood: false, learned };
  }

  // ---------- DNS (iterative resolution script) ----------
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dnsPlan(name, type) {
    const labels = name.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
    if (labels.length < 2 || labels.some((l) => !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) || /^\d+$/.test(labels[labels.length - 1])) return null;
    if (['A', 'AAAA', 'MX'].indexOf(type) < 0) return null;
    const tld = labels[labels.length - 1];
    const SLD = ['co', 'org', 'ac', 'gov', 'com', 'net', 'edu', 'ne', 'or', 'me', 'ltd', 'plc', 'nhs', 'sch', 'mil', 'id', 'go', 'gob', 'nom'];
    const zone = (labels.length >= 3 && SLD.includes(labels[labels.length - 2]) && tld.length === 2 ? labels.slice(-3) : labels.slice(-2)).join('.');
    const h = hash(zone);
    const ans = type === 'AAAA' ? '2001:db8:' + (h & 0xffff).toString(16) + '::' + ((h >>> 16) & 0xffff).toString(16)
      : type === 'MX' ? '10 mail.' + zone + '.'
      : '198.51.100.' + ((h & 255) % 250 + 1);
    return {
      name: labels.join('.'), type, tld, zone, answer: ans, ttl: 300,
      steps: [
        { to: 'root', q: labels.join('.') + '. ' + type + ' ?', a: 'Not me. Ask the .' + tld + ' name servers (referral: NS records + glue)', kind: 'referral' },
        { to: 'tld', q: labels.join('.') + '. ' + type + ' ?', a: 'Not me. ' + zone + ' is run by ns1.' + zone + ' (referral + glue A record)', kind: 'referral' },
        { to: 'auth', q: labels.join('.') + '. ' + type + ' ?', a: labels.join('.') + '. 300 IN ' + type + ' ' + ans + '   (authoritative answer)', kind: 'answer' },
      ],
    };
  }

  // ---------- MTU / efficiency ----------
  const L1_OVERHEAD = 8 + 14 + 4 + 12;  // preamble+SFD, header, FCS, inter-frame gap
  function efficiency(mtu, opts) {
    opts = opts || {};
    const tcpHdr = opts.hdr == null ? 40 : opts.hdr;
    const l1 = L1_OVERHEAD + (opts.vlan ? 4 : 0);
    mtu = Math.max(tcpHdr + 1, mtu);
    const payload = mtu - tcpHdr;
    const wire = mtu + l1;
    return { payload, wire, eff: payload / wire, framesPerGB: Math.ceil(1e9 / payload) };
  }
  function pps(rateBps, mtu, opts) { const e = efficiency(mtu, opts); return rateBps / 8 / e.wire; }
  // path of link MTUs, packet size, DF flag -> outcome
  function pathMtu(links, size, df) {
    const out = [];
    let cur = [size];
    for (let i = 0; i < links.length; i++) {
      const m = links[i], next = [];
      for (const s of cur) {
        if (s <= m) { next.push(s); continue; }
        if (df) return { ok: false, at: i, mtu: m, log: out.concat(['link ' + (i + 1) + ': ' + s + ' B > MTU ' + m + ' with DF set — dropped, ICMP "fragmentation needed (MTU ' + m + ')" sent back']) };
        const per = Math.floor((m - 20) / 8) * 8;
        if (per < 8) return { ok: false, at: i, mtu: m, log: out.concat(['link ' + (i + 1) + ': MTU ' + m + ' is too small to carry any IP fragment']) };
        let left = s - 20;
        while (left > 0) { const d = Math.min(per, left); next.push(d + 20); left -= d; }
        out.push('link ' + (i + 1) + ': ' + s + ' B split to fit MTU ' + m);
      }
      cur = next;
    }
    return { ok: true, pieces: cur, log: out };
  }

  // ---------- Nagle + delayed ACK timeline ----------
  // cfg: {writes:[{t,size}], rtt, nagle, delack, mss, delackMs, reqBytes}
  function simTcp(cfg) {
    const d = cfg.rtt / 2, mss = cfg.mss || 1460, DA = cfg.delackMs == null ? 40 : cfg.delackMs;
    const ev = []; let seq = 0;
    const push = (e) => { e.n = seq++; ev.push(e); ev.sort((a, b) => a.t - b.t || a.n - b.n); };
    cfg.writes.forEach((w) => push({ t: w.t, type: 'write', size: w.size }));
    const segs = []; const marks = [];
    let buf = 0, sent = 0, acked = 0, recv = 0, pend = 0, pendBytes = 0, timer = null, done = null;
    const sendData = (t) => {
      while (buf > 0) {
        const inflight = sent - acked;
        const full = buf >= mss;
        if (!(!cfg.nagle || inflight === 0 || full)) {
          if (!marks.some((m) => m.held && m.t === t && m.buf === buf)) marks.push({ t, held: true, buf });
          return;
        }
        const n = Math.min(buf, mss); buf -= n; sent += n;
        segs.push({ from: 'c', t0: t, t1: t + d, bytes: n, kind: 'data' });
        push({ t: t + d, type: 'data', bytes: n, end: sent });
      }
    };
    const sendAck = (t, why) => { segs.push({ from: 's', t0: t, t1: t + d, bytes: 0, kind: 'ack', why }); push({ t: t + d, type: 'ack', val: recv }); pend = 0; pendBytes = 0; timer = null; };
    let guard = 0;
    while (ev.length && guard++ < 50000) {
      const e = ev.shift();
      if (e.type === 'write') { buf += e.size; sendData(e.t); }
      else if (e.type === 'data') {
        recv += e.bytes; pend++; pendBytes += e.bytes;
        if (cfg.reqBytes && recv >= cfg.reqBytes && done == null) {
          segs.push({ from: 's', t0: e.t, t1: e.t + d, bytes: 100, kind: 'reply' });
          push({ t: e.t + d, type: 'reply', val: recv }); pend = 0; pendBytes = 0; timer = null;
        } else if (!cfg.delack || pendBytes >= 2 * mss) sendAck(e.t, cfg.delack ? 'two full segments' : 'immediate');
        else if (timer == null) { timer = e.t + DA; push({ t: timer, type: 'timer', at: timer }); }
      } else if (e.type === 'timer') {
        if (timer === e.at && pend > 0) sendAck(e.t, 'delayed-ACK timer (' + DA + ' ms)');
      } else if (e.type === 'ack' || e.type === 'reply') {
        acked = Math.max(acked, e.val);
        if (e.type === 'reply') { done = e.t; }
        sendData(e.t);
      }
    }
    const dataSegs = segs.filter((s) => s.kind === 'data').length;
    return { segs, marks, done, dataSegs, totalSegs: segs.length };
  }

  // ---------- CSMA/CD backoff ----------
  const MAX_ATTEMPTS = 16;
  function backoffSlots(attempt, rnd) { const k = Math.min(attempt, 10); return Math.floor(rnd() * Math.pow(2, k)); }

  const api = { crc32, parseMac, fmtMac, utf8, buildFrame, checkFcs, ip2n, n2ip, maskOf, parseCidr, subnetInfo, sameSubnet, lookup, switchForward, dnsPlan, hash, efficiency, pps, pathMtu, simTcp, backoffSlots, MAX_ATTEMPTS, L1_OVERHEAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WireEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
