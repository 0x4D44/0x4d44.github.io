/* Bunched - the game. The engine (engine.js) does the physics; this does the pigeons. */
(function () {
  'use strict';
  var B = window.Bunched;
  var TS = 12; // simulated seconds per real second at 1x
  var NS = 'http://www.w3.org/2000/svg';
  var CX = 190, CY = 190, R = 118;
  var BUS_COLOURS = ['#8c1d35', '#d99a2b', '#2f6fb0', '#2e8158', '#7a3f98', '#c4551f', '#4b5563', '#0e8a8a', '#b3284a', '#6b8e23'];
  var COATS = ['#8c1d35', '#2f6fb0', '#2e8158', '#6b4a8f', '#c4551f', '#3b4a5a'];
  var STOP_SHORT = ['Pub', 'Colinton', 'Slateford', 'Murrayfield', 'Roseburn', 'Dean Village', 'Stockbridge', 'Canonmills', 'Warriston', 'Bonnington', 'The Shore', 'Newhaven'];
  var STOP_TINY = ['Pub', 'Colin.', 'Slate.', 'Murray.', 'Rose.', 'Dean', 'Stock.', 'Canon.', 'Warr.', 'Bonn.', 'Shore', 'Newh.'];

  function $(id) { return document.getElementById(id); }
  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function pick(arr, n) { return arr[Math.abs(n) % arr.length]; }

  // ------------------------------------------------------------ storage
  var store = {
    key: 'bunched.v1',
    data: { stars: {}, watched: false, insp: null, sound: false },
    load: function () {
      try {
        var raw = localStorage.getItem(this.key);
        if (raw) { var d = JSON.parse(raw); for (var k in d) this.data[k] = d[k]; }
      } catch (e) { /* private window: carry on without memory, like the buses */ }
    },
    save: function () { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { } }
  };

  // ------------------------------------------------------------ copy
  var INCIDENT_TEXT = {
    pigeon: 'A man is chasing a pigeon across the road.',
    lollipop: 'Lollipop lady: "Take your time, pet."',
    haggis: 'A delivery of 40 haggis. In single file.',
    photo: 'Tourist photographing a bus. This one.',
    bagpipes: 'Piper practising in the road. Allegedly "Flower of Scotland".',
    seagull: 'Seagull on the wing mirror. Won\'t budge.',
    wheelie: 'Wheelie bin in the middle of the road. Why.'
  };
  var INCIDENT_SHORT = {
    pigeon: 'Man chasing a pigeon.', lollipop: 'Lollipop lady.', haggis: '40 haggis crossing.',
    photo: 'Tourist photo stop.', bagpipes: 'Piper in the road.', seagull: 'Seagull. Won\'t budge.', wheelie: 'Wheelie bin.'
  };
  var SLIPS = {
    wait: [
      'Waited {m} minutes. Then three came at once. I counted.',
      'I have aged a decade at {stop}. Please send a bus, or a chair.',
      'Is the timetable a work of fiction? Asking for my knees.',
      'Waited {m} minutes at {stop}. The pigeons now know my name.',
      'Three buses, nose to tail, after {m} minutes. Pick a lane, lads.',
      'I have read the whole shelter. Twice. It is not good.'
    ],
    passed: [
      'The bus was "full". It was mostly umbrella.',
      'Driver WAVED at me. Waved.',
      'We made eye contact at {stop}. It kept going.',
      'Left standing at {stop} by a bus with a view of my face.'
    ],
    skipped: [
      'Express! Nobody told {stop}.',
      'It did not stop. It did not even slow down. It did a smile.',
      'I have been skipped. Like a stone. On a bad day.'
    ],
    over: [
      'Carried past my own stop by an act of management.',
      'I live at {stop}. I now live somewhere else.',
      'Overshot {stop} by one stop. Marriage counselling to follow.'
    ],
    held: [
      'We have been sitting here admiring {stop} for {h} seconds.',
      'Held at a stop "to even out the gaps". I am the gap.',
      'The driver says it is "regulation". The driver says a lot.',
      'Sat at {stop} for {h} seconds with the engine on. Dispatcher, I know where you live. (I do not.)'
    ],
    crush: [
      'Intimately acquainted with a stranger\'s rucksack since {stop}.',
      'Sardines get more legroom, and a tin.',
      'Somebody\'s elbow has been in my ribs for four stops. I know it\'s name now.'
    ]
  };

  var LEVEL_COPY = [
    {
      brief: 'Six buses, perfectly spaced round the Water of Leith, with a bus stop every few hundred metres. Nothing is wrong. Then a man chases a pigeon in front of one of them, for twenty seconds. That is the entire disruption.',
      how: ['You have nothing to do. That is the lesson. Do not touch anything.', 'Watch the headway ruler under the ring: those gaps are the whole story.', 'Bored? Press 8x.'],
      lesson: [
        'This is the model from Newell and Potts (1964). Passengers arrive at a steady rate, and a bus stays at each stop for a few seconds per person boarding. A bus that is a little late finds a longer queue (the gap since the last bus is bigger), so it loads for longer, so it is later still. The bus behind finds a short queue and catches up. Positive feedback: nobody did anything wrong, and the evenly spaced ring was never stable.',
        'The inspection paradox is why it feels so bad. Passengers arrive at random, so they are more likely to turn up during a long gap than a short one. Average wait is E[H&sup2;] / 2E[H], which is more than half the average gap whenever the gaps are uneven. Same buses, same fuel, worse Tuesday.'
      ],
      fact: 'Real-world fact: it is not just buses. Lifts in a tall building bunch for the same reason, and a bus route is just a very slow lift going sideways.'
    },
    {
      brief: 'Light demand on a gentle morning, with the occasional hiccup. The gaps will start to wobble. Your job is to keep the buses evenly spaced for ninety minutes.',
      how: ['Tap a bus (or its Hold button) to hold it at its next stop. Tap again to release it.', 'A bus too close behind the one ahead should wait. A bus with a long gap behind it should not.', 'Holds cap out at two and a half minutes, and passengers already aboard will tell you what they think.', 'Bus Inspector Dalgleish will point out the worst offender. She has a clipboard.'],
      lesson: [
        'What you just did is headway-based holding: if a bus is too close behind its leader, make it wait until the gap is right. It works because it fixes the thing that matters, the spacing, and cannot be fooled by a late bus: the timetable only says where a bus should have been. On a frequent service, nobody checks a timetable; they just want a bus soon, so the sensible target is an even gap, not an exact clock time.',
        'There is a cost: every hold makes the people already aboard sit still, so you are trading a few people\'s minutes for many people\'s waits. Hold too eagerly and you are just a slower bus.'
      ],
      fact: 'Real-world fact: London\'s buses are measured on "excess wait time", which is exactly the gap between how long you actually wait and how long you would have waited had the buses been evenly spaced.'
    },
    {
      brief: 'Rush hour: nearly half as many passengers again. Every delay matters more, and a lead bus fills up and leaves people on the pavement.',
      how: ['Hold works as before. Bunches will form faster, so react sooner.', 'New: Skip. A crammed bus can run express past its next stop to escape the bus behind. The people waiting there are left stranded, and they will mention it.', 'A bus at crush load (45) cannot take anyone else, however politely they ask.'],
      lesson: [
        'Capacity adds a second feedback loop. The first bus of a bunch fills up and drives past people, who then join an even bigger queue for the next bus, which makes that bus load longer. Meanwhile the followers run nearly empty. Crowded lead, empty tail: that is the signature of a bunch in the wild.',
        'Skipping a stop can unstick a crammed lead bus, but only by shoving its cost onto the people left behind. It is a blunt instrument. Holding the empty follower is usually kinder.'
      ],
      fact: 'Real-world fact: bunching is the reason many cities run "bus bridges" and short-turns, and why one pretty miserable bit of road can make a whole route unreliable.'
    },
    {
      brief: 'The Festival is on. Crowds at Murrayfield, Stockbridge and The Shore, with shows letting out in waves. The quiet stops get the leftovers.',
      how: ['Watch the three hot stops: queues there turn into long loading times, and long loading times turn into bunches.', 'Big crowds arrive in bursts when shows let out, so do not wait for the queue to appear.', 'Skip is available, but think about who is standing at the stop.'],
      lesson: [
        'Demand is never even. A stop with a big queue makes every bus that reaches it dwell for a long time, so busy stops act as bunching generators: each late bus becomes later. The long dwell is the Newell and Potts effect, turned up.',
        'Good dispatching therefore holds buses before the hot stops, not after, so that a bus arrives at a big crowd with a clean gap behind it and does not drag a long queue of lateness in its wake.'
      ],
      fact: 'Real-world fact: the Edinburgh trams took from 2008 to 2014 to build, and the city\'s buses spent much of that time making polite conversation with traffic cones.'
    },
    {
      brief: 'Roadworks: a pair of temporary traffic lights and a one-lane crawl section. The tram works, but with no tram.',
      how: ['Delays here are free and frequent: a red light spends about half a minute of every bus\'s life.', 'The crawl lane slows every bus. Watch what it does to the gaps behind a slow bus.', 'Hold buses ahead of the lights so they do not arrive in a stack.'],
      lesson: [
        'Roadworks and lights hand out random delays for free, and each delay seeds a new bunch. The slow section squeezes gaps (a bus that enters it behind a delayed bus catches up), while whatever leaves it first accelerates away, so the spacing stretches again on the far side.',
        'You cannot remove the delays, you can only stop them growing. Holding does that: each hold absorbs a delay at a stop, where the bus is already standing still, rather than letting it ripple down the route.'
      ],
      fact: 'Real-world fact: the Edinburgh tram line opened in May 2014, after construction that started in 2008. Every bunch during those years has a clear conscience and an excuse.'
    },
    {
      brief: 'Everything at once: festival crowds, roadworks, haggis, pigeons, crush loads and a driver who has just discovered a seagull on the wing mirror. Good luck.',
      how: ['Use every lever you have: hold for the gaps, skip for the crush.', 'The Inspector will help. The Inspector is not infallible. The Inspector is also, frankly, doing her best.', 'You will not get perfect spacing. Aim to keep the biggest gap small.'],
      lesson: [
        'Perfect spacing is not on the menu. Good dispatching is about keeping the spread bounded, and the cheap way to do that is to react to the actual gap between buses, not to a printed timetable that assumed nothing would ever go wrong.',
        'It also needs slack. You can only hold a bus if you have time to spend; that is why a real route has a layover at the end, and why the terminus in this game is, with great practicality, a pub.'
      ],
      fact: 'Real-world fact: schedule-based holding can work if the schedule has slack, but with frequent buses a late bus just never gets held, so the gaps are left to do whatever they like. Headway-based rules adapt to the actual bus ahead.'
    }
  ];

  // ------------------------------------------------------------ state
  var S = {
    screen: 'title', level: null, sim: null, speed: 2, running: false, paused: false,
    acc: 0, last: 0, selected: -1, sound: false, ac: null, slipQ: [], lastSlip: 0, lastBubble: 0,
    bubbles: [], busNote: {}, view: [], shown: {}, lastPanel: 0, lastRuler: 0, lastChart: 0, sandbox: null,
    needle: 0, convoyCap: '', ended: false, slipCount: 0, caption: '', suggestion: null, queueSig: [], slipN: 0
  };
  var ring = {}; // dom refs

  // ------------------------------------------------------------ svg defs
  function paxSymbol(look, angry) {
    var skin = angry ? '#e8957a' : '#f0c9a0', s = '';
    s += '<rect x="3" y="12" width="1.6" height="4" fill="#3a2a22"/><rect x="5.4" y="12" width="1.6" height="4" fill="#3a2a22"/>';
    s += '<rect x="2" y="6" width="6" height="7" rx="2" fill="currentColor"/>';
    if (angry) s += '<path d="M8 7 L9.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9.6" cy="2.6" r="1.2" fill="' + skin + '"/><path d="M2 7.5 L1.4 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';
    else s += '<path d="M2 7.5 L1.4 11 M8 7.5 L8.6 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';
    if (look === 3) s += '<path d="M5 3 V7" stroke="#3a2a22" stroke-width=".6"/>';
    s += '<circle cx="5" cy="4.2" r="2.4" fill="' + skin + '"/>';
    switch (look) {
      case 0: s += '<path d="M2.6 4 Q5 0.4 7.4 4 Q5 2.7 2.6 4Z" fill="#5a3a22"/>'; break;
      case 1: s += '<ellipse cx="5" cy="2.5" rx="2.9" ry="1.1" fill="#3b3b3b"/><rect x="5.6" y="2.6" width="3" height="0.9" fill="#3b3b3b"/>'; break;
      case 2: s += '<path d="M2.9 3.2 Q5 -0.8 7.1 3.2Z" fill="#222"/><rect x="1.9" y="3" width="6.2" height="0.8" rx=".4" fill="#222"/>'; break;
      case 3: s += '<path d="M0 3.6 Q5 -3.2 10 3.6 Q7.5 2.4 5 3 Q2.5 2.4 0 3.6Z" fill="#2e8158"/>'; break;
      case 4: s += '<ellipse cx="5" cy="2.4" rx="3.7" ry="1.3" fill="#c0392b"/><circle cx="5" cy="1" r=".8" fill="#c0392b"/><path d="M2 2.4 H8" stroke="#f1cd76" stroke-width=".35"/>'; break;
      case 5: s += '<path d="M2.6 3.5 Q5 -0.6 7.4 3.5Z" fill="#2f6fb0"/><circle cx="5" cy="0.4" r=".9" fill="#f1cd76"/>'; break;
      case 6: s += '<ellipse cx="5" cy="2.4" rx="3.7" ry="1.3" fill="#1f5f8f"/><circle cx="5" cy="1" r=".8" fill="#1f5f8f"/><ellipse cx="3" cy="9.2" rx="2.7" ry="2" fill="#7a4a1d"/><path d="M3.5 7.4 L1.8 0.6 M2.4 7.6 L0.4 1.6" stroke="#3a2a22" stroke-width=".6"/>'; break;
    }
    if (angry) s += '<path d="M3.5 3.6 L4.7 4 M6.5 3.6 L5.3 4" stroke="#2a1a14" stroke-width=".5"/>';
    else s += '<circle cx="4.3" cy="4.4" r=".3" fill="#2a1a14"/><circle cx="5.7" cy="4.4" r=".3" fill="#2a1a14"/>';
    return '<symbol id="' + (angry ? 'pa' : 'px') + look + '" viewBox="0 0 10 16" overflow="visible">' + s + '</symbol>';
  }
  function injectDefs() {
    var h = '';
    for (var i = 0; i < 7; i++) h += paxSymbol(i, false) + paxSymbol(i, true);
    var d = document.createElementNS(NS, 'svg');
    d.setAttribute('width', '0'); d.setAttribute('height', '0'); d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<defs>' + h + '</defs>';
    document.body.insertBefore(d, document.body.firstChild);
  }

  // ------------------------------------------------------------ bus shape
  function busShape(parent, n, colour) {
    var g = svgEl('g', {}, parent);
    var body = svgEl('g', { class: 'bbody' }, g);
    svgEl('rect', { x: -15, y: -7.5, width: 30, height: 15, rx: 5, fill: '#5c0f22' }, body);
    svgEl('rect', { x: -14, y: -6.5, width: 28, height: 13, rx: 4.2, fill: '#8c1d35' }, body);
    svgEl('rect', { x: -14, y: 3, width: 28, height: 3.4, fill: '#d99a2b' }, body);
    svgEl('rect', { x: 8.4, y: -5.5, width: 4.6, height: 11, rx: 1.5, fill: '#2a1a14', opacity: 0.85 }, body);
    svgEl('circle', { cx: 14, cy: -4, r: 1.3, fill: '#fff3b0' }, body);
    svgEl('circle', { cx: 14, cy: 4, r: 1.3, fill: '#fff3b0' }, body);
    svgEl('circle', { cx: -12.4, cy: -3.4, r: 1.7, fill: colour }, body);
    var wins = [];
    for (var i = 0; i < 5; i++) wins.push(svgEl('rect', { x: -11 + i * 3.9, y: -5.4, width: 3.1, height: 2.3, rx: 0.6, fill: '#2a1a14', opacity: 0.8 }, body));
    var lab = svgEl('text', { x: -1.5, y: 2, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 800, fill: '#fff4dc', 'font-family': 'ui-rounded,system-ui,sans-serif', 'pointer-events': 'none' }, g);
    lab.textContent = n;
    return { g: g, body: body, wins: wins, lab: lab };
  }

  // ------------------------------------------------------------ ring
  function ptAt(pos, r, L) {
    var a = pos / L * Math.PI * 2 - Math.PI / 2;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), a: a };
  }
  function arcPath(p0, p1, r, L) {
    var a = ptAt(p0, r, L), b = ptAt(p1, r, L), large = ((p1 - p0) / L) > 0.5 ? 1 : 0;
    return 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
  }

  function buildRing() {
    var sim = S.sim, svg = $('ring'), L = sim.L, N = sim.N, i;
    svg.innerHTML = '';
    ring = { buses: [], stops: [], lights: [] };
    svgEl('circle', { cx: CX, cy: CY, r: R + 19, fill: '#e9f1e0', opacity: 0.55 }, svg);
    svgEl('circle', { cx: CX, cy: CY, r: R - 18, fill: '#f6efe0' }, svg);
    svgEl('circle', { cx: CX, cy: CY, r: R - 24, fill: 'none', stroke: '#9cc3dd', 'stroke-width': 3, opacity: 0.7, 'stroke-dasharray': '2 5' }, svg);
    svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: '#4a3f3a', 'stroke-width': 19 }, svg);
    svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: '#f1cd76', 'stroke-width': 1.2, 'stroke-dasharray': '7 7', opacity: 0.8 }, svg);
    (sim.cfg.slow || []).forEach(function (s) {
      var p = svgEl('path', { d: arcPath(s.from, s.to, R, L), fill: 'none', stroke: '#e07b1f', 'stroke-width': 19, 'stroke-dasharray': '4 5', opacity: 0.8 }, svg);
      var t = svgEl('title', {}, p); t.textContent = 'Roadworks: crawl lane';
    });
    (sim.cfg.lights || []).forEach(function (lg, idx) {
      var p = ptAt(lg.pos, R + 15, L);
      var g = svgEl('g', { transform: 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')' }, svg);
      svgEl('rect', { x: -4, y: -9, width: 8, height: 18, rx: 3, fill: '#2a1a14' }, g);
      var c = svgEl('circle', { cx: 0, cy: 0, r: 3, fill: '#2e8158' }, g);
      ring.lights.push(c);
    });
    // stops
    for (i = 0; i < N; i++) {
      var st = sim.stops[i], pr = ptAt(st.pos, R, L), pk = ptAt(st.pos, R + 13, L), pl = ptAt(st.pos, R - 24, L);
      var sg = svgEl('g', { class: 'stopg' }, svg);
      var hot = st.mult > 1.5;
      svgEl('rect', { x: pk.x - 3, y: pk.y - 3, width: 6, height: 6, rx: 1.5, fill: hot ? '#d99a2b' : '#fffdf7', stroke: '#8c1d35', 'stroke-width': 1.5 }, sg);
      var q = svgEl('g', {}, sg);
      var flag = svgEl('g', { visibility: 'hidden' }, sg);
      svgEl('circle', { cx: pk.x, cy: pk.y, r: 10, fill: 'none', stroke: '#d99a2b', 'stroke-width': 2.5, class: 'pulse' }, flag);
      var cosA = Math.cos(pl.a), anchor = Math.abs(cosA) < 0.35 ? 'middle' : (cosA > 0 ? 'end' : 'start');
      var tx = CX + (R - 22) * Math.cos(pl.a), ty = CY + (R - 22) * Math.sin(pl.a);
      var lab = svgEl('text', { x: tx.toFixed(1), y: (ty + 3).toFixed(1), 'text-anchor': anchor, 'font-size': 9, fill: hot ? '#8a5d08' : '#5a4538', 'font-weight': hot ? 800 : 600, 'font-family': 'system-ui,sans-serif' }, sg);
      lab.textContent = STOP_TINY[i] || ('Stop ' + i);
      var hit = svgEl('circle', { class: 'hit', cx: pr.x.toFixed(1), cy: pr.y.toFixed(1), r: 17, tabindex: -1, 'data-stop': i }, sg);
      hit.addEventListener('click', onStopTap);
      var ti = svgEl('title', {}, hit); ti.textContent = st.name + ': tap to hold the next bus here';
      ring.stops.push({ g: q, flag: flag, sig: '', pos: pr });
    }
    // hub: gauge
    var hub = svgEl('g', { transform: 'translate(' + CX + ' ' + (CY + 14) + ')' }, svg);
    var segs = [['#2e8158', 0, 0.25], ['#d99a2b', 0.25, 0.5], ['#c4551f', 0.5, 0.75], ['#8c1d35', 0.75, 1]];
    segs.forEach(function (sg) {
      var a0 = Math.PI + sg[1] * Math.PI, a1 = Math.PI + sg[2] * Math.PI, r = 46;
      var d = 'M' + (r * Math.cos(a0)).toFixed(2) + ' ' + (r * Math.sin(a0)).toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + (r * Math.cos(a1)).toFixed(2) + ' ' + (r * Math.sin(a1)).toFixed(2);
      svgEl('path', { d: d, fill: 'none', stroke: sg[0], 'stroke-width': 9 }, hub);
    });
    ring.needle = svgEl('g', {}, hub);
    svgEl('path', { d: 'M-2.5 0 L0 -42 L2.5 0Z', fill: '#2a1a14' }, ring.needle);
    svgEl('circle', { r: 5, fill: '#2a1a14' }, hub);
    ring.word = svgEl('text', { x: 0, y: 20, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#5c0f22', 'font-family': 'ui-rounded,system-ui,sans-serif' }, hub);
    var cap = svgEl('text', { x: 0, y: -56, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, fill: '#5a4538', 'font-family': 'ui-monospace,monospace', 'letter-spacing': '0.08em' }, hub);
    cap.textContent = 'BUNCHING-O-METER';
    ring.sub = svgEl('text', { x: 0, y: 36, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#5a4538', 'font-family': 'ui-monospace,monospace' }, hub);
    // buses
    var bg = svgEl('g', {}, svg);
    for (i = 0; i < sim.n; i++) {
      var bGroup = svgEl('g', { class: 'busg', tabindex: 0, role: 'button', 'data-bus': i }, bg);
      var shape = busShape(bGroup, i + 1, BUS_COLOURS[i % BUS_COLOURS.length]);
      shape.focus = svgEl('circle', { class: 'busfocus', r: 19, fill: 'none', stroke: 'transparent' }, bGroup);
      shape.sugg = svgEl('circle', { r: 21, fill: 'none', stroke: '#d99a2b', 'stroke-width': 3, class: 'pulse', visibility: 'hidden' }, bGroup);
      shape.sel = svgEl('circle', { r: 19, fill: 'none', stroke: '#2a1a14', 'stroke-width': 1.6, 'stroke-dasharray': '3 3', visibility: 'hidden' }, bGroup);
      shape.tag = svgEl('g', { visibility: 'hidden', 'pointer-events': 'none' }, bGroup);
      shape.tagBg = svgEl('rect', { x: -24, y: -9, width: 48, height: 14, rx: 7, fill: '#8c1d35' }, shape.tag);
      shape.tagTx = svgEl('text', { x: 0, y: 1, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#fff', 'font-family': 'ui-monospace,monospace' }, shape.tag);
      svgEl('circle', { class: 'hit', r: 21, cx: 0, cy: 0 }, bGroup);
      bGroup.addEventListener('click', onBusTap);
      bGroup.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBusTap(e); }
      });
      shape.root = bGroup; shape.v = null;
      ring.buses.push(shape);
    }
    ring.bub = svgEl('g', { 'pointer-events': 'none' }, svg);
    S.queueSig = [];
  }

  // visual spreading so a convoy of buses does not draw as one smear
  function visualAngles(sim) {
    var n = sim.n, C = 2 * Math.PI * R, s = [], i, it;
    for (i = 0; i < n; i++) s.push(sim.buses[i].pos / sim.L * C);
    var d = 31;
    if (n > 1 && n * d < C * 0.9) {
      for (it = 0; it < 40; it++) {
        var moved = false;
        for (i = 0; i < n; i++) {
          var j = (i + 1) % n, g = ((s[j] - s[i]) % C + C) % C;
          if (g < d - 0.05) { var p = (d - g) / 2; s[i] -= p; s[j] += p; moved = true; }
        }
        if (!moved) break;
      }
    }
    return s.map(function (v) { return ((v % C) + C) % C; });
  }

  function renderRing(ts) {
    var sim = S.sim; if (!sim) return;
    var L = sim.L, C = 2 * Math.PI * R, tgt = visualAngles(sim), i;
    for (i = 0; i < sim.n; i++) {
      var b = sim.buses[i], sh = ring.buses[i];
      if (sh.v === null) sh.v = tgt[i];
      var diff = ((tgt[i] - sh.v + C * 1.5) % C) - C / 2;
      sh.v += diff * 0.35;
      sh.v = ((sh.v % C) + C) % C;
      var a = sh.v / C * Math.PI * 2 - Math.PI / 2;
      var x = CX + R * Math.cos(a), y = CY + R * Math.sin(a), deg = a * 180 / Math.PI + 90;
      sh.root.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
      sh.body.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ')');
      var frac = b.pax.length / sim.cfg.cap, k;
      for (k = 0; k < 5; k++) sh.wins[k].setAttribute('fill', (k + 0.5) / 5 <= frac + 0.08 ? '#f1cd76' : '#2a1a14');
      // tags
      var tag = '', tcol = '#8c1d35';
      if (b.hold.active) { tag = 'HOLD ' + fmt(b.hold.left); tcol = '#8c1d35'; }
      else if (b.hold.armed) { tag = 'HOLD NEXT'; tcol = '#8a5d08'; }
      else if (b.skip) { tag = 'EXPRESS'; tcol = '#8a5d08'; }
      else if (b.stuck > 0) { tag = '!! ' + fmt(b.stuck); tcol = '#c4551f'; }
      else if (b.pax.length >= sim.cfg.cap) { tag = 'FULL'; tcol = '#2a1a14'; }
      if (tag) {
        sh.tag.setAttribute('visibility', 'visible'); sh.tagTx.textContent = tag;
        var w = tag.length * 5.4 + 10;
        sh.tagBg.setAttribute('width', w); sh.tagBg.setAttribute('x', -w / 2); sh.tagBg.setAttribute('fill', tcol);
        // sit the tag on the outside of the ring
        var ox = Math.cos(a) * 24, oy = Math.sin(a) * 24;
        sh.tag.setAttribute('transform', 'translate(' + ox.toFixed(1) + ' ' + (oy + 2).toFixed(1) + ')');
      } else sh.tag.setAttribute('visibility', 'hidden');
      sh.sel.setAttribute('visibility', S.selected === i ? 'visible' : 'hidden');
      var sug = S.suggestion && S.suggestion.bus === i;
      sh.sugg.setAttribute('visibility', sug ? 'visible' : 'hidden');
      var lbl = 'Bus ' + (i + 1) + ', ' + b.pax.length + ' aboard' + (b.hold.active ? ', held' : '') + '. Press Enter to ' + (b.hold.active ? 'release' : 'hold') + ' it.';
      if (sh.lastLbl !== lbl) { sh.root.setAttribute('aria-label', lbl); sh.lastLbl = lbl; }
    }
    // stop queues
    for (i = 0; i < sim.N; i++) {
      var st = sim.stops[i], rs = ring.stops[i], q = st.queue, vis = Math.min(7, q.length);
      var angry = q.length && (sim.t - q[0].t) > q[0].pat * 0.7 ? 1 : 0;
      var sig = vis + '|' + q.length + '|' + angry + '|' + (q[0] ? q[0].id : 0);
      if (sig !== rs.sig) {
        rs.sig = sig; rs.g.innerHTML = '';
        var base = ptAt(st.pos, R + 28, L), tx = -Math.sin(base.a), ty = Math.cos(base.a), j;
        for (j = vis - 1; j >= 0; j--) {
          var p = q[j], px = base.x - tx * j * 7.2, py = base.y - ty * j * 7.2;
          var ang = j === 0 && angry;
          var u = svgEl('use', { href: '#' + (ang ? 'pa' : 'px') + p.look, x: (px - 5.2).toFixed(1), y: (py - 12).toFixed(1), width: 10.4, height: 16.6, style: 'color:' + COATS[p.coat % COATS.length] }, rs.g);
          if (ang) u.setAttribute('class', 'shake');
          var tt = svgEl('title', {}, u); tt.textContent = p.name + ' (waiting ' + fmt(sim.t - p.t) + ')';
        }
        if (q.length > vis) {
          var bx = base.x - tx * vis * 7.2 - 2, by = base.y - ty * vis * 7.2 + 1;
          svgEl('rect', { x: (bx - 8).toFixed(1), y: (by - 8).toFixed(1), width: 20, height: 12, rx: 6, fill: '#2a1a14' }, rs.g);
          var tn = svgEl('text', { x: (bx + 2).toFixed(1), y: (by + 1).toFixed(1), 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 800, fill: '#fff4dc', 'font-family': 'system-ui,sans-serif' }, rs.g);
          tn.textContent = '+' + (q.length - vis);
        }
        if (q.length === 0) rs.g.innerHTML = '';
      }
      rs.flag.setAttribute('visibility', st.armedHold ? 'visible' : 'hidden');
    }
    for (i = 0; i < ring.lights.length; i++) ring.lights[i].setAttribute('fill', sim.lightRed(i) ? '#d6261c' : '#2e8158');
    // gauge
    var cv = sim.cv, tgtN = clamp(cv / 1.3, 0, 1);
    S.needle += (tgtN - S.needle) * 0.08;
    ring.needle.setAttribute('transform', 'rotate(' + (-90 + S.needle * 180).toFixed(1) + ')');
    var word = cv < 0.14 ? 'Serene' : cv < 0.35 ? 'Wobbly' : cv < 0.75 ? 'Bunching' : 'CONVOY';
    ring.word.textContent = word;
    ring.sub.textContent = sim.maxConvoy >= 2 ? 'biggest bunch: ' + sim.maxConvoy : 'spacing wobble ' + cv.toFixed(2);
    // bubbles lifetime
    for (i = S.bubbles.length - 1; i >= 0; i--) {
      var bb = S.bubbles[i];
      if (ts > bb.until) { if (bb.el.parentNode) bb.el.parentNode.removeChild(bb.el); S.bubbles.splice(i, 1); }
    }
  }

  function bubble(x, y, text, kind, opt) {
    opt = opt || {};
    var now = performance.now();
    if (!opt.force && (now - S.lastBubble < 450 || S.bubbles.length >= 4)) return;
    S.lastBubble = now;
    var lines = [], words = text.split(' '), cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > 19) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    var maxLen = 0; lines.forEach(function (l) { maxLen = Math.max(maxLen, l.length); });
    var w = Math.max(34, maxLen * 5.5 + 12), h = lines.length * 11.5 + 8;
    var bx = clamp(x - w / 2, 3, 377 - w), by = clamp(y - h - 8, 3, 377 - h);
    var g = svgEl('g', { class: 'bubble' }, ring.bub);
    var fill = kind === 'smug' ? '#f1cd76' : kind === 'event' ? '#2a1a14' : '#fffdf7';
    var ink = kind === 'event' ? '#fff4dc' : kind === 'angry' ? '#8c1d35' : '#2a1a14';
    svgEl('rect', { x: bx.toFixed(1), y: by.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: 7, fill: fill, stroke: '#2a1a14', 'stroke-width': 1.2 }, g);
    var tipx = clamp(x, bx + 8, bx + w - 8);
    svgEl('path', { d: 'M' + (tipx - 4).toFixed(1) + ' ' + (by + h - 0.5).toFixed(1) + ' L' + x.toFixed(1) + ' ' + (by + h + 7).toFixed(1) + ' L' + (tipx + 4).toFixed(1) + ' ' + (by + h - 0.5).toFixed(1), fill: fill, stroke: '#2a1a14', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, g);
    svgEl('rect', { x: (tipx - 3.2).toFixed(1), y: (by + h - 2).toFixed(1), width: 6.4, height: 3, fill: fill }, g);
    lines.forEach(function (l, i) {
      var t = svgEl('text', { x: (bx + w / 2).toFixed(1), y: (by + 13 + i * 11.5).toFixed(1), 'text-anchor': 'middle', 'font-size': 10, fill: ink }, g);
      t.textContent = l;
    });
    S.bubbles.push({ el: g, until: now + (opt.life || 3200) });
  }
  function busXY(id) {
    var sh = ring.buses[id]; if (!sh || sh.v === null) { var p = ptAt(S.sim.buses[id].pos, R, S.sim.L); return p; }
    var C = 2 * Math.PI * R, a = sh.v / C * Math.PI * 2 - Math.PI / 2;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }
  function stopXY(i) { return ptAt(S.sim.stops[i].pos, R + 24, S.sim.L); }

  // ------------------------------------------------------------ sound
  function ding(freq, len, vol) {
    if (!S.sound) return;
    try {
      if (!S.ac) S.ac = new (window.AudioContext || window.webkitAudioContext)();
      var ac = S.ac, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq || 1320;
      g.gain.setValueAtTime(vol || 0.16, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (len || 0.5));
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + (len || 0.5) + 0.05);
    } catch (e) { }
  }
  function jingle() { ding(784, 0.4); setTimeout(function () { ding(988, 0.4); }, 160); setTimeout(function () { ding(1319, 0.7); }, 320); }

  // ------------------------------------------------------------ events
  function live(msg) { var l = $('live'); l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); }
  function setStatus(msg) { $('status').textContent = msg; }

  function handleEvents(ts) {
    var sim = S.sim, ev = sim.drain(), i;
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.type) {
        case 'complaint':
          S.slipQ.push(e); if (S.slipQ.length > 24) S.slipQ.shift(); break;
        case 'incident':
          S.busNote[e.bus] = INCIDENT_SHORT[e.kind] || 'Incident';
          var p = busXY(e.bus);
          bubble(p.x, p.y - 12, INCIDENT_TEXT[e.kind] || 'Something has happened.', 'event', { force: true, life: 4200 });
          live('Bus ' + (e.bus + 1) + ' is delayed: ' + (INCIDENT_SHORT[e.kind] || 'an incident') + ' About ' + Math.round(e.dur) + ' seconds.');
          break;
        case 'convoy':
          if (e.size >= 3) {
            var sIdx = sim.buses.map(function (b) { return b; }).reduce(function (best, b, idx) { return idx; }, 0);
            var front = frontOfConvoy(sim);
            var stp = nearestStop(sim, front);
            var sp = stopXY(stp);
            bubble(sp.x, sp.y - 10, 'Typical.', 'angry', { force: true, life: 3600 });
            ding(220, 0.6, 0.18);
            live('A convoy of ' + e.size + ' buses has formed.');
          } else if (e.size === 2) live('Two buses are now bunched together.');
          break;
        case 'pass':
          if (e.kind === 'skip' || e.kind === 'full') {
            var bp = busXY(e.bus);
            bubble(bp.x, bp.y - 12, e.kind === 'skip' ? 'Express! (Sorry.)' : 'Full. Sorry!', 'smug');
            if (e.waiting > 0) { var s2 = stopXY(e.stop); setTimeout(function (xx, yy) { bubble(xx, yy - 14, 'Oi!', 'angry', { life: 2600 }); }.bind(null, s2.x, s2.y), 200); }
          }
          break;
        case 'holdstart':
          if (!e.auto) { ding(1320, 0.45); var hp = busXY(e.bus); bubble(hp.x, hp.y - 12, 'Held. Regulating.', 'smug'); }
          break;
        case 'burst':
          var bs = stopXY(e.stop); bubble(bs.x, bs.y - 12, (e.label || 'Crowd') + '!', 'event', { force: true, life: 4200 });
          live((e.label || 'A crowd') + ' at ' + sim.stops[e.stop].name + '.');
          break;
      }
    }
  }
  function frontOfConvoy(sim) {
    var best = 0, bestSz = -1, n = sim.n, i;
    for (i = 0; i < n; i++) { // the bus whose link ahead is NOT bunched but whose link behind is
      var behind = sim.bunched[(i - 1 + n) % n], ahead = sim.bunched[i];
      if (behind && !ahead) { best = i; }
    }
    return best;
  }
  function nearestStop(sim, busId) {
    return Math.round(sim.buses[busId].pos / sim.spacing) % sim.N;
  }

  function slipText(e) {
    var arr = SLIPS[e.kind] || SLIPS.wait, t = pick(arr, e.pid * 7 + e.stop);
    var sname = STOP_SHORT[e.stop] || 'the stop';
    return t.replace('{m}', Math.max(1, Math.round((e.waited || 0) / 60))).replace('{stop}', sname).replace('{h}', Math.max(10, Math.round(e.held || 40)));
  }
  function pumpSlips(ts) {
    if (!S.slipQ.length) return;
    var gap = S.speed >= 8 ? 350 : 800;
    if (ts - S.lastSlip < gap) return;
    S.lastSlip = ts;
    var e = S.slipQ.shift(), ul = $('slips');
    var empty = ul.querySelector('.empty'); if (empty) ul.removeChild(empty);
    var li = document.createElement('li');
    S.slipN++;
    li.style.setProperty('--rot', ((S.slipN % 5) - 2) * 0.5 + 'deg');
    li.style.borderLeftColor = COATS[e.coat % COATS.length];
    var who = document.createElement('span'); who.className = 'who';
    who.textContent = e.name + ', ' + (STOP_SHORT[e.stop] || 'the route');
    var q = document.createElement('q'); q.textContent = slipText(e);
    li.appendChild(who); li.appendChild(q);
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 6) ul.removeChild(ul.lastChild);
  }

  // ------------------------------------------------------------ panel
  function buildRows() {
    var sim = S.sim, ul = $('busList'), lv = S.level, hold = lv.levers && lv.levers.indexOf('hold') >= 0, skip = lv.levers && lv.levers.indexOf('skip') >= 0;
    ul.innerHTML = ''; S.rows = [];
    for (var i = 0; i < sim.n; i++) {
      var li = document.createElement('li'); li.className = 'brow';
      li.innerHTML = '<span class="bdg" style="background:' + BUS_COLOURS[i % BUS_COLOURS.length] + '">' + (i + 1) + '</span>' +
        '<span class="binfo"><b></b><span></span></span>' +
        (hold ? '<button type="button" class="bbtn hold" data-bus="' + i + '"></button>' : '<span></span>') +
        (skip ? '<button type="button" class="bbtn sk" data-bus="' + i + '">Skip</button>' : '');
      if (!skip) li.style.gridTemplateColumns = '36px minmax(0,1fr) auto';
      if (!hold) li.style.gridTemplateColumns = '36px minmax(0,1fr)';
      ul.appendChild(li);
      S.rows.push({ li: li, b: li.querySelector('b'), s: li.querySelector('.binfo > span'), hold: li.querySelector('.hold'), skip: li.querySelector('.sk') });
      li.addEventListener('click', function (e) {
        var t = e.target;
        var idx = this.getAttribute('data-i') | 0;
        if (t.classList.contains('hold')) actHold(+t.getAttribute('data-bus'));
        else if (t.classList.contains('sk')) actSkip(+t.getAttribute('data-bus'));
      });
    }
    $('busH').textContent = hold ? 'Your buses' : 'The buses';
    $('busHint').textContent = hold ? 'tap a bus on the ring, or its button' : 'just watching';
    $('sbTools').hidden = S.sandbox === null || S.level.id !== 99;
  }

  function stateText(b, sim) {
    var stn = function (i) { return sim.stops[i].name; };
    if (b.stuck > 0) return 'Delayed: ' + (S.busNote[b.id] || 'incident') + ' ' + fmt(b.stuck);
    if (b.state === 'dwell') {
      if (b.hold.active) return 'HELD at ' + stn(b.stop) + ' (' + fmt(b.hold.left) + ' left)';
      return 'Loading at ' + stn(b.stop);
    }
    var dist = ((sim.stops[b.ns].pos - b.pos) % sim.L + sim.L) % sim.L;
    var tag = b.hold.armed ? ' [hold]' : b.skip ? ' [express]' : '';
    return 'To ' + stn(b.ns) + ' in ' + fmt(dist / sim.cfg.vFree) + tag;
  }

  function updatePanel() {
    var sim = S.sim, lv = S.level, m = sim.metrics(), i;
    var gaps = sim.gapsSec();
    for (i = 0; i < sim.n; i++) {
      var b = sim.buses[i], r = S.rows[i];
      r.b.textContent = 'Bus ' + (i + 1) + ' · ' + stateText(b, sim);
      var ld = sim.leader(i);
      r.s.textContent = b.pax.length + '/' + sim.cfg.cap + ' aboard · ' + fmt(gaps[i]) + ' behind Bus ' + (ld + 1);
      r.li.className = 'brow' + (b.hold.active ? ' held' : '') + (S.selected === i ? ' sel' : '') + (S.suggestion && S.suggestion.bus === i ? ' sugg' : '');
      if (r.hold) {
        var txt, on = false;
        if (b.hold.active) { txt = 'Release'; on = true; }
        else if (b.hold.armed) { txt = 'Cancel'; on = true; }
        else if (b.state === 'dwell') txt = 'Hold now';
        else txt = 'Hold';
        if (r.hold.textContent !== txt) r.hold.textContent = txt;
        r.hold.classList.toggle('on', on);
        r.hold.setAttribute('aria-label', txt + ' bus ' + (i + 1));
      }
      if (r.skip) {
        r.skip.classList.toggle('on', !!b.skip);
        r.skip.disabled = b.state !== 'run' && !b.skip;
        r.skip.textContent = b.skip ? 'Cancel' : 'Skip';
        r.skip.setAttribute('aria-label', (b.skip ? 'Cancel skip for bus ' : 'Skip next stop for bus ') + (i + 1));
        if (!b.skip) r.skip.classList.remove('on');
      }
    }
    if (sim.t > 0) for (i = 0; i < sim.n; i++) if (sim.buses[i].stuck <= 0) delete S.busNote[i];
    // waits
    var act = Math.max(m.waitWin, m.wait), even = m.evenWin, pen = even > 0 ? act / even - 1 : 0;
    $('waitNow').textContent = fmt(act); $('waitEven').textContent = fmt(even);
    $('waitPen').textContent = (pen >= 0 ? '+' : '') + Math.round(pen * 100) + '%';
    var mx = Math.max(act, even, 1);
    $('barNow').style.width = (act / mx * 100) + '%'; $('barEven').style.width = (even / mx * 100) + '%';
    $('waitNote').textContent = pen > 0.15
      ? 'Passengers turn up at random, so they land in the long gaps more often than the short ones. Your gaps predict this wait: E[H²] / 2E[H] = ' + fmt(m.formulaWin) + '. Even spacing would give ' + fmt(even) + '.'
      : 'For evenly spaced buses the average wait is half the gap. Bunch them up and it gets longer, even though the same buses are running.';
    $('tCompl').textContent = m.complaints; $('tStrand').textContent = m.stranded;
    if (lv.watch) { $('tScore').textContent = m.maxConvoy; $('tScoreL').textContent = 'biggest bunch'; $('goal').textContent = 'Nothing to do. That is the point.'; }
    else if (lv.stars) {
      $('tScore').textContent = fmt(m.score); $('tScoreL').textContent = 'delay per person';
      var st = B.starsFor(lv, m.score);
      $('goal').textContent = (sim.snap ? '' : 'Warm-up: the first quarter of the shift is not scored. ') + 'Now: ' + '★'.repeat(st) + '☆'.repeat(3 - st) + '   3★ ≤ ' + fmt(lv.stars[1]) + '   2★ ≤ ' + fmt(lv.stars[0]);
    } else { $('tScore').textContent = fmt(m.delay); $('tScoreL').textContent = 'delay per person'; $('goal').textContent = 'Sandbox: no stars, no mercy.'; }
    // clock & progress
    var tot = 7 * 3600 + sim.t, hh = Math.floor(tot / 3600) % 24, mm = Math.floor(tot / 60) % 60;
    $('clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var pr = isFinite(sim.cfg.duration) ? clamp(sim.t / sim.cfg.duration, 0, 1) : (sim.t / 3600) % 1;
    $('progressFill').style.width = (pr * 100) + '%';
    $('progress').setAttribute('aria-valuenow', Math.round(pr * 100));
    // caption
    var cap = captionFor(sim, lv);
    if (cap !== S.caption) { S.caption = cap; $('caption').textContent = cap; }
    // inspector
    updateInspector();
    $('slipCount').textContent = m.complaints + (m.complaints === 1 ? ' slip' : ' slips');
  }

  function captionFor(sim, lv) {
    var mc = sim.maxConvoy, cv = sim.cv, gaps = sim.gapsSec(), mx = Math.max.apply(null, gaps);
    if (mc >= 5) return 'A convoy of ' + mc + '. It is basically a procession. Someone fetch the bagpiper.';
    if (mc >= 4) return 'A convoy of 4. Collectively known as a "bunch". The longest gap on the route is now ' + fmt(mx) + '.';
    if (mc === 3) return 'A convoy of 3. Collectively known as a "bunch".';
    if (mc === 2) return 'A pair. Buses, like bad news, come in twos.';
    if (cv < 0.12) return lv.watch && sim.t < 160 ? 'Six buses, perfectly spaced. Lovely. A pigeon is on its way.' : lv.watch ? 'Still tidy. Still spaced. Keep watching the ruler.' : 'Serene. This is what the timetable promised.';
    if (cv < 0.3) return 'Drifting. One bus is late and the one behind is catching up. Nobody has noticed yet.';
    return 'Going lopsided. The buses behind are chasing the late one, and the gaps are not equal.';
  }

  function updateInspector() {
    var sim = S.sim, lv = S.level, box = $('inspector');
    var has = lv.levers && lv.levers.indexOf('hold') >= 0;
    box.hidden = !has;
    if (!has) { S.suggestion = null; return; }
    var on = store.data.insp === null ? (lv.id <= 2) : store.data.insp;
    $('inspToggle').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('inspToggle').textContent = on ? 'On' : 'Off';
    var text = $('inspText'), btn = $('inspDo');
    if (!on) { S.suggestion = null; text.textContent = 'Dismissed. She has gone for a cup of tea.'; btn.hidden = true; return; }
    var sg = B.suggest(sim);
    var top = null, i;
    for (i = 0; i < sg.length; i++) { top = sg[i]; break; }
    S.suggestion = top;
    if (!top) { text.textContent = 'All gaps look civilised. I shall write "Satisfactory" on the clipboard.'; btn.hidden = true; return; }
    var b = sim.buses[top.bus], ld = sim.leader(top.bus);
    text.textContent = 'Hold Bus ' + (top.bus + 1) + ' at ' + sim.stops[top.stop].name + '. It is only ' + fmt(top.gap) + ' behind Bus ' + (ld + 1) + '; the route wants ' + fmt(sim.Hest) + '.';
    btn.hidden = false;
    btn.textContent = b.hold.active ? 'Already held' : 'Hold Bus ' + (top.bus + 1);
  }

  // ------------------------------------------------------------ actions
  function leversFor(kind) { return S.level && S.level.levers && S.level.levers.indexOf(kind) >= 0; }
  function actHold(id) {
    if (!S.sim || !S.running) return;
    S.selected = id;
    if (!leversFor('hold')) { setStatus('This time you only watch. Hands off. That is the lesson.'); return; }
    var r = S.sim.toggleHold(id), b = S.sim.buses[id];
    var stn = S.sim.stops[b.state === 'dwell' ? b.stop : b.ns].name;
    var msg = {
      armed: 'Bus ' + (id + 1) + ' will wait at ' + stn + ' until you release it.',
      disarmed: 'Hold cancelled on Bus ' + (id + 1) + '.',
      held: 'Bus ' + (id + 1) + ' held at ' + stn + '. Tap again to release.',
      released: 'Bus ' + (id + 1) + ' released. Off it goes.'
    }[r] || '';
    setStatus(msg); live(msg);
    if (r === 'armed') ding(1100, 0.3, 0.1);
    updatePanel();
  }
  function actSkip(id) {
    if (!S.sim || !S.running || !leversFor('skip')) return;
    S.selected = id;
    var b = S.sim.buses[id];
    var r = S.sim.toggleSkip(id);
    var msg = r ? 'Bus ' + (id + 1) + ' will run express past ' + S.sim.stops[b.ns].name + '. Somebody will mention it.' : (b.skip === false && b.state !== 'run' ? 'Bus ' + (id + 1) + ' is at a stop. Skip works on a moving bus.' : 'Express cancelled on Bus ' + (id + 1) + '.');
    setStatus(msg); live(msg); updatePanel();
  }
  function onBusTap(e) {
    var g = e.currentTarget, id = +g.getAttribute('data-bus');
    actHold(id);
  }
  function onStopTap(e) {
    var si = +e.currentTarget.getAttribute('data-stop');
    if (!S.sim || !S.running) return;
    if (!leversFor('hold')) { setStatus('This time you only watch. Hands off. That is the lesson.'); return; }
    var on = S.sim.toggleStopHold(si);
    var msg = on ? 'The next bus to reach ' + S.sim.stops[si].name + ' will be held.' : 'Hold at ' + S.sim.stops[si].name + ' cancelled.';
    setStatus(msg); live(msg);
  }

  // ------------------------------------------------------------ ruler & chart
  function drawRuler() {
    var sim = S.sim, svg = $('ruler'), w = Math.max(240, svg.clientWidth || 340), h = 84, L = sim.L, n = sim.n, i;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var x0 = 12, x1 = w - 12, W = x1 - x0, ly = 34, H = sim.Hest;
    var out = '<rect x="' + x0 + '" y="' + (ly - 9) + '" width="' + W + '" height="18" rx="5" fill="#efe5cf"/>';
    for (i = 0; i < sim.N; i++) { var tx = x0 + sim.stops[i].pos / L * W; out += '<rect x="' + (tx - 0.5).toFixed(1) + '" y="' + (ly - 13) + '" width="1" height="26" fill="#a99a86"/>'; }
    var gaps = sim.gapsSec(), gm = sim.gaps();
    for (i = 0; i < n; i++) {
      var b = sim.buses[i], ld = sim.buses[(i + 1) % n], a = b.pos, z = ld.pos, ratio = gaps[i] / H;
      var col = ratio < 0.45 ? '#b3284a' : ratio > 1.55 ? '#2f6fb0' : '#d99a2b';
      var seg = [];
      if (z >= a) seg.push([a, z]); else { seg.push([a, L]); seg.push([0, z]); }
      var best = seg[0];
      seg.forEach(function (s) {
        var xa = x0 + s[0] / L * W, xb = x0 + s[1] / L * W;
        out += '<rect x="' + xa.toFixed(1) + '" y="' + (ly - 7) + '" width="' + Math.max(1.5, xb - xa).toFixed(1) + '" height="14" rx="3" fill="' + col + '" opacity="0.9"/>';
        if ((s[1] - s[0]) > (best[1] - best[0])) best = s;
      });
      var bw = (best[1] - best[0]) / L * W;
      if (bw > 36) out += '<text x="' + (x0 + (best[0] + best[1]) / 2 / L * W).toFixed(1) + '" y="' + (ly + 4) + '" text-anchor="middle" font-size="10.5" font-weight="800" fill="' + (ratio < 0.45 || ratio > 1.55 ? '#fff' : '#2a1a14') + '" font-family="ui-monospace,monospace">' + fmt(gaps[i]) + '</text>';
    }
    // pins, laned so convoys stay legible
    var order = sim.buses.map(function (b) { return b.id; }).sort(function (p, q) { return sim.buses[p].pos - sim.buses[q].pos; });
    var lastX = -99, lane = 0;
    order.forEach(function (id) {
      var x = x0 + sim.buses[id].pos / L * W;
      if (x - lastX < 17) lane = (lane + 1) % 3; else lane = 0;
      lastX = x;
      var py = 56 + lane * 12;
      out += '<line x1="' + x.toFixed(1) + '" y1="' + (ly + 8) + '" x2="' + x.toFixed(1) + '" y2="' + (py - 5) + '" stroke="#2a1a14" stroke-width="1"/>';
      out += '<circle cx="' + x.toFixed(1) + '" cy="' + py + '" r="6.5" fill="#8c1d35" stroke="#2a1a14"/><text x="' + x.toFixed(1) + '" y="' + (py + 3) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#fff4dc" font-family="system-ui,sans-serif">' + (id + 1) + '</text>';
    });
    out += '<text x="' + x0 + '" y="12" font-size="9.5" fill="#5a4538" font-family="ui-monospace,monospace">PUB</text><text x="' + x1 + '" y="12" text-anchor="end" font-size="9.5" fill="#5a4538" font-family="ui-monospace,monospace">...and round again</text>';
    svg.innerHTML = out;
  }

  function drawChart() {
    var cv = $('chart'), sim = S.sim; if (!cv) return;
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 130;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    var pl = 36, pr = 8, pt = 8, pb = 16, pw = w - pl - pr, ph = h - pt - pb;
    var hist = sim.hist, H = sim.Hest;
    var dur = isFinite(sim.cfg.duration) ? sim.cfg.duration : Math.max(3600, sim.t);
    var tmin = 0, tmax = dur;
    if (!isFinite(sim.cfg.duration) && sim.t > 3600) { tmin = sim.t - 3600; tmax = sim.t; }
    var ymax = H * 2.4, k, i;
    hist.forEach(function (p) { p.g.forEach(function (g) { if (g > ymax) ymax = g; }); });
    ymax = Math.min(ymax * 1.05, H * 6);
    function X(t) { return pl + (t - tmin) / (tmax - tmin) * pw; }
    function Y(g) { return pt + ph - clamp(g / ymax, 0, 1) * ph; }
    c.fillStyle = '#faf3e1'; c.fillRect(pl, pt, pw, ph);
    c.font = '10px ui-monospace,monospace'; c.fillStyle = '#5a4538'; c.textAlign = 'right';
    c.strokeStyle = 'rgba(60,30,18,0.14)'; c.lineWidth = 1;
    [0, 1, 2, 3, 4].forEach(function (m) {
      var g = m * H; if (g > ymax) return;
      c.beginPath(); c.moveTo(pl, Y(g)); c.lineTo(pl + pw, Y(g)); c.stroke();
      if (m === 1 || m === 2 || m === 4) c.fillText(fmt(g), pl - 4, Y(g) + 3);
    });
    c.textAlign = 'left'; c.fillText('0', pl, h - 3);
    c.textAlign = 'right'; c.fillText(isFinite(sim.cfg.duration) ? 'end of shift' : 'now', pl + pw, h - 3);
    if (hist.length > 1) {
      for (k = 0; k < sim.n; k++) {
        c.beginPath(); c.strokeStyle = BUS_COLOURS[k % BUS_COLOURS.length]; c.lineWidth = 1.6; c.globalAlpha = 0.9;
        var started = false;
        for (i = 0; i < hist.length; i++) {
          if (hist[i].t < tmin) continue;
          var x = X(hist[i].t), y = Y(hist[i].g[k]);
          if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
        }
        c.stroke(); c.globalAlpha = 1;
      }
    }
    c.setLineDash([5, 4]); c.strokeStyle = '#8a5d08'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(pl, Y(H)); c.lineTo(pl + pw, Y(H)); c.stroke(); c.setLineDash([]);
  }

  // ------------------------------------------------------------ loop
  function frame(ts) {
    requestAnimationFrame(frame);
    var dtReal = Math.min(0.1, (ts - (S.last || ts)) / 1000); S.last = ts;
    if (!S.sim || S.screen !== 'game') return;
    var sim = S.sim;
    if (S.running && !S.paused && !S.ended) {
      S.acc += dtReal * TS * S.speed;
      var dt = sim.cfg.dt, steps = 0;
      while (S.acc >= dt && steps < 300) { sim.step(); S.acc -= dt; steps++; if (sim.t >= sim.cfg.duration) break; }
      if (S.acc > dt * 20) S.acc = 0;
      handleEvents(ts);
      if (sim.t >= sim.cfg.duration) { finish(false); }
    } else if (sim.events.length) sim.drain();
    renderRing(ts);
    pumpSlips(ts);
    if (ts - S.lastPanel > 250) { S.lastPanel = ts; updatePanel(); }
    if (ts - S.lastRuler > 120) { S.lastRuler = ts; drawRuler(); }
    if (ts - S.lastChart > 500) { S.lastChart = ts; drawChart(); }
  }

  // ------------------------------------------------------------ flow
  function show(name) {
    ['title', 'game'].forEach(function (id) { $(id).hidden = id !== name; });
    S.screen = name; window.scrollTo(0, 0);
    $('brief').hidden = true; $('debrief').hidden = true;
    document.title = name === 'title' ? 'Bunched' : 'Bunched';
  }
  function levelStars(id) { return store.data.stars[id] || 0; }

  function renderLevels() {
    var ul = $('levelList'); ul.innerHTML = '';
    var nextId = -1;
    for (var i = 0; i < B.LEVELS.length; i++) {
      if ((i === 0 && !store.data.watched) || (i > 0 && !levelStars(i))) { nextId = i; break; }
    }
    B.LEVELS.forEach(function (lv) {
      var li = document.createElement('li');
      var st = lv.id === 0 ? (store.data.watched ? 'Watched' : 'Start here') : '★'.repeat(levelStars(lv.id)) + '<span class="off">' + '★'.repeat(3 - levelStars(lv.id)) + '</span>';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lcard' + (lv.id === nextId ? ' next' : '');
      b.innerHTML = '<span class="n">Level ' + lv.id + (lv.id === nextId ? ' · up next' : '') + '</span><span class="t"></span><span class="b"></span><span class="st">' + st + '</span>';
      b.querySelector('.t').textContent = lv.name; b.querySelector('.b').textContent = lv.blurb;
      b.setAttribute('aria-label', 'Level ' + lv.id + ': ' + lv.name + (lv.id ? ', ' + levelStars(lv.id) + ' of 3 stars' : ''));
      b.addEventListener('click', function () { openLevel(lv.id); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  var SANDBOX = { id: 99, name: 'Sandbox', blurb: '', seed: 77, duration: Infinity, speed: 2, levers: ['hold', 'skip'], cfg: {} };

  function openLevel(id) {
    var lv = id === 99 ? SANDBOX : B.LEVELS[id];
    S.level = lv;
    var cfgOver = {};
    if (id === 99) {
      var s = S.sandbox || { bus: 6, dem: 1, k: 2.5 };
      S.sandbox = s;
      lv.cfg = { nBus: s.bus, lambda: 0.02 * s.dem, k: s.k, speedNoise: 0.04, incidentRate: 1 / 700 };
    }
    var cfg = id === 99 ? B.levelConfig(lv) : B.levelConfig(lv, cfgOver);
    S.sim = B.createSim(cfg);
    S.running = false; S.paused = false; S.acc = 0; S.ended = false; S.selected = -1; S.slipQ = []; S.bubbles = []; S.busNote = {}; S.caption = ''; S.suggestion = null; S.needle = 0;
    S.speed = lv.speed || 2; syncSpeed();
    show('game');
    buildRing(); buildRows();
    $('slips').innerHTML = '<li class="empty">No complaints yet. Give it a few laps.</li>';
    $('lvTag').textContent = id === 99 ? 'Sandbox' : 'Level ' + id; $('lvName').textContent = id === 99 ? 'Your own mess' : lv.name;
    $('endBtn').textContent = id === 99 ? 'End shift' : 'End shift';
    setStatus('');
    updatePanel(); drawRuler(); drawChart(); renderRing(performance.now());
    showBrief();
  }

  function showBrief() {
    var lv = S.level, c = lv.id === 99 ? null : LEVEL_COPY[lv.id];
    $('briefTag').textContent = lv.id === 99 ? 'Sandbox' : 'Level ' + lv.id;
    $('briefH').textContent = lv.id === 99 ? 'Your own mess' : lv.name;
    $('briefText').textContent = c ? c.brief : 'No stars, no deadline. Hold buses, skip stops, and release a pigeon whenever you feel like it. Press End shift when you are done.';
    var how = $('briefHow'); how.innerHTML = '';
    (c ? c.how : ['Tap a bus to hold it at its next stop; tap again to release it.', 'Skip lets a moving bus run express past its next stop.', 'The Release a pigeon button does what it says.']).forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; how.appendChild(li);
    });
    var sn = $('briefStars');
    if (lv.stars) sn.textContent = 'Stars (on delay per passenger: waiting plus time sat on held buses): 3 stars at or under ' + fmt(lv.stars[1]) + ', 2 stars at or under ' + fmt(lv.stars[0]) + '.'; else sn.textContent = '';
    $('briefGo').textContent = lv.watch ? 'Roll the buses' : 'Start the shift';
    $('brief').hidden = false;
    $('briefGo').focus();
  }

  function startRun() {
    $('brief').hidden = true; S.running = true; S.paused = false; S.last = performance.now(); syncSpeed();
    var lv = S.level;
    if (lv.watch) setStatus('Press 8x if the pigeon is taking its time.');
    else setStatus('Tap a bus on the ring, or its Hold button.');
    if (S.sound) ding(880, 0.3);
    var first = document.querySelector('#ring .busg'); if (first) first.blur();
  }

  function syncSpeed() {
    var btns = document.querySelectorAll('.sp[data-speed]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', (+btns[i].getAttribute('data-speed') === S.speed) ? 'true' : 'false');
    var pb = $('pauseBtn'); pb.classList.toggle('paused', !!S.paused);
    pb.innerHTML = S.paused ? '&#9654;' : '&#10074;&#10074;';
    pb.setAttribute('aria-label', S.paused ? 'Resume' : 'Pause');
  }

  function finish(early) {
    if (S.ended) return;
    S.ended = true; S.running = false;
    var sim = S.sim, lv = S.level, m = sim.metrics(), st = sim.stats;
    var stars = 0, rated = false;
    if (lv.stars && !early) { stars = B.starsFor(lv, m.score); rated = true; if (stars > levelStars(lv.id)) { store.data.stars[lv.id] = stars; } }
    if (lv.watch && !early) store.data.watched = true;
    store.save();
    var meanHAll = st.nH ? st.sumH / st.nH : sim.Hest, evenAll = meanHAll / 2, formAll = st.sumH > 0 ? st.sumH2 / (2 * st.sumH) : evenAll;
    $('debTag').textContent = early ? 'Shift ended early' : (lv.id === 99 ? 'Sandbox shift' : 'Shift complete');
    $('debH').textContent = lv.watch ? 'You watched a bunch form' : lv.id === 99 ? 'That was a shift' : (early ? 'Shift ended early' : (stars === 3 ? 'Immaculate dispatching' : stars === 2 ? 'Perfectly respectable' : 'You survived. The buses did not cooperate.'));
    var sr = $('debStars');
    if (rated) sr.innerHTML = '★'.repeat(stars) + '<span class="off">' + '★'.repeat(3 - stars) + '</span><small>Delay per passenger ' + fmt(m.score) + ' (3★ ≤ ' + fmt(lv.stars[1]) + ', 2★ ≤ ' + fmt(lv.stars[0]) + ')</small>';
    else sr.innerHTML = lv.watch ? (early ? '<small>Ended before the shift did. Watch the whole thing for the full picture.</small>' : '<small>No stars. Just a lesson.</small>') : '<small>' + (early ? 'No stars for leaving early.' : '') + '</small>';
    var gaps = sim.gapsSec(), grid = $('debGrid'); grid.innerHTML = '';
    function item(v, l, cls) { var d = document.createElement('div'); d.className = 'dg ' + (cls || ''); d.innerHTML = '<div class="v"></div><div class="l"></div>'; d.firstChild.textContent = v; d.lastChild.textContent = l; grid.appendChild(d); }
    item(fmt(m.wait), 'average wait, whole shift');
    item(fmt(evenAll), 'wait if perfectly even', 'gold');
    item(fmt(formAll), 'what the gaps predicted: E[H²]/2E[H]');
    if (lv.watch) { item(fmt(Math.max.apply(null, gaps)), 'longest gap now'); item(fmt(Math.min.apply(null, gaps)), 'shortest gap now'); item(st.maxConvoy, 'biggest bunch'); }
    else {
      item(fmt(m.score), 'delay per passenger (scored)');
      item(m.cvAvg.toFixed(2), 'spacing wobble (0 = perfect)');
      item(st.maxConvoy, 'biggest bunch');
      item(m.complaints, 'complaints');
      item(m.stranded, 'left on the pavement');
      item(Math.round(m.heldPaxSec / 60) + ' min', 'passenger-time sat on held buses');
    }
    var c = lv.id === 99 ? null : LEVEL_COPY[lv.id], ls = $('debLesson'); ls.innerHTML = '';
    var paras = c ? c.lesson : ['You have just built your own bunch, or cured it. Either way: a late bus finds more people, loads for longer, and is later; the one behind catches up. Holding by gap, not by clock, is how real operators cure it.'];
    paras.forEach(function (t) { var p = document.createElement('p'); p.innerHTML = t; ls.appendChild(p); });
    if (c) { var f = document.createElement('p'); f.className = 'fact'; f.textContent = c.fact; ls.appendChild(f); }
    $('debRobot').textContent = '';
    var nxt = $('debNext');
    var hasNext = lv.id !== 99 && lv.id < B.LEVELS.length - 1;
    nxt.hidden = !hasNext;
    nxt.textContent = lv.watch ? 'Level 1: have a go' : 'Next: ' + (B.LEVELS[lv.id + 1] ? B.LEVELS[lv.id + 1].name : '');
    $('debrief').hidden = false;
    (hasNext ? nxt : $('debRetry')).focus();
    $('debrief').scrollTop = 0;
    live(lv.watch ? 'Shift over. You watched a bunch form.' : 'Shift over.' + (rated ? ' ' + stars + ' out of 3 stars.' : ''));
    if (rated && stars > 0) jingle();
    renderLevels();
    if (lv.id !== 99 && lv.stars && !early) {
      setTimeout(function () {
        try {
          var cfg = B.levelConfig(lv);
          var none = B.runHeadless(cfg, null).metrics().score, hw = B.runHeadless(cfg, 'headway').metrics().score;
          $('debRobot').textContent = 'For scale: doing nothing at all scored ' + fmt(none) + '. A robot dispatcher that simply holds any bus too close to the one ahead scored ' + fmt(hw) + '. You scored ' + fmt(m.score) + '.';
        } catch (e) { }
      }, 60);
    }
  }

  // ------------------------------------------------------------ wiring
  function heroBuses() {
    var g = $('heroBuses'); if (!g) return;
    [[52, 1], [96, 2], [140, 3]].forEach(function (p) {
      var wrap = svgEl('g', { transform: 'translate(' + p[0] + ' 150) scale(1.15)' }, g);
      busShape(wrap, p[1], BUS_COLOURS[p[1] - 1]);
    });
    svgEl('g', { transform: 'translate(300 150)' }, g);
  }

  function init() {
    store.load();
    S.sound = !!store.data.sound; updateSoundBtn();
    injectDefs(); heroBuses(); renderLevels();
    $('startBtn').addEventListener('click', function () { openLevel(0); });
    $('levelsBtn').addEventListener('click', function () { $('levelsBlock').scrollIntoView({ behavior: 'smooth', block: 'start' }); var f = document.querySelector('.lcard'); if (f) f.focus({ preventScroll: true }); });
    $('menuBtn').addEventListener('click', function () { S.running = false; show('title'); renderLevels(); });
    $('endBtn').addEventListener('click', function () { if (S.sim && !S.ended) finish(true); });
    $('briefGo').addEventListener('click', startRun);
    $('briefBack').addEventListener('click', function () { show('title'); renderLevels(); });
    $('debRetry').addEventListener('click', function () { openLevel(S.level.id); });
    $('debMenu').addEventListener('click', function () { show('title'); renderLevels(); });
    $('debNext').addEventListener('click', function () { openLevel(S.level.id + 1); });
    $('pauseBtn').addEventListener('click', togglePause);
    document.querySelectorAll('.sp[data-speed]').forEach(function (b) {
      b.addEventListener('click', function () { S.speed = +b.getAttribute('data-speed'); if (S.paused) S.paused = false; syncSpeed(); });
    });
    $('inspToggle').addEventListener('click', function () {
      var cur = store.data.insp === null ? (S.level.id <= 2) : store.data.insp;
      store.data.insp = !cur; store.save(); updateInspector();
    });
    $('inspDo').addEventListener('click', function () {
      if (S.suggestion) { var b = S.sim.buses[S.suggestion.bus]; if (!b.hold.active) actHold(S.suggestion.bus); }
    });
    $('pigeonBtn').addEventListener('click', function () {
      if (!S.sim || !S.running) return;
      var id = Math.floor(Math.random() * S.sim.n); S.sim.incident(id, 22, 'pigeon');
    });
    $('soundBtn').addEventListener('click', function () {
      S.sound = !S.sound; store.data.sound = S.sound; store.save(); updateSoundBtn(); if (S.sound) ding(1320, 0.4);
    });
    var sbBus = $('sbBus'), sbDem = $('sbDem'), sbK = $('sbK');
    function sbUpdate() {
      $('sbBusOut').textContent = sbBus.value; $('sbDemOut').textContent = (+sbDem.value).toFixed(1) + 'x'; $('sbKOut').textContent = (+sbK.value).toFixed(1) + ' s';
      S.sandbox = { bus: +sbBus.value, dem: +sbDem.value, k: +sbK.value };
    }
    [sbBus, sbDem, sbK].forEach(function (e) { e.addEventListener('input', sbUpdate); }); sbUpdate();
    $('sbGo').addEventListener('click', function () { openLevel(99); });
    document.addEventListener('keydown', function (e) {
      if (S.screen !== 'game' || !$('brief').hidden || !$('debrief').hidden) return;
      var tag = (e.target && e.target.tagName) || '';
      if (e.key === ' ' && tag !== 'BUTTON' && !(e.target.getAttribute && e.target.getAttribute('role') === 'button')) { e.preventDefault(); togglePause(); }
      else if (/^[1-4]$/.test(e.key) && tag !== 'INPUT') { S.speed = [1, 2, 4, 8][+e.key - 1]; S.paused = false; syncSpeed(); }
      else if (e.key === 'p' || e.key === 'P') togglePause();
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.running && !S.paused) { S.paused = true; syncSpeed(); } });
    window.addEventListener('resize', function () { if (S.sim && S.screen === 'game') { drawRuler(); drawChart(); } });
    requestAnimationFrame(frame);
    show('title');
  }
  function togglePause() { if (!S.running) return; S.paused = !S.paused; syncSpeed(); setStatus(S.paused ? 'Paused. The buses are thinking about it.' : ''); }
  function updateSoundBtn() {
    var b = $('soundBtn'); b.setAttribute('aria-pressed', S.sound ? 'true' : 'false');
    b.querySelector('.lbl').textContent = S.sound ? 'Bell: on' : 'Bell: off';
  }

  // test hook (read-only): lets the browser tests peek at the sim
  window.__bunched = { state: S, open: openLevel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
