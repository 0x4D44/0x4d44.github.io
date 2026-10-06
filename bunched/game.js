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
    data: { stars: {}, watched: false, insp: null, sound: false, runs: {}, fails: {} },
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
      'Somebody\'s elbow has been in my ribs for four stops. I know its name now.'
    ]
  };

  var LEVEL_COPY = [
    {
      brief: 'Six buses, perfectly spaced round the Water of Leith, a stop every few hundred metres. Nothing is wrong. Your only power is this: tap any bus and a man will chase a pigeon in front of it, for twenty seconds. Then watch what twenty seconds does.',
      how: ['Tap a bus on the ring (or its button in the list) to unleash the pigeon on it. If you are shy, one turns up anyway.', 'Watch the headway ruler under the ring: those gaps are the whole story.', 'Bored? Press 8x. Too fast? 2x.'],
      lesson: [
        'This is the model from Newell and Potts (1964). Passengers arrive at a steady rate, and a bus stays at each stop for a few seconds per person boarding. A bus that is a little late finds a longer queue (the gap since the last bus is bigger), so it loads for longer, so it is later still. The bus behind finds a short queue and catches up. Positive feedback: any small wobble grows, whether it is a pigeon, a lollipop lady or just the random way passengers happen to turn up. The evenly spaced ring was never stable. The pigeon only decides when it goes.',
        'The inspection paradox is why it feels so bad. Passengers arrive at random, so they are more likely to turn up during a long gap than a short one. Average wait is E[H&sup2;] / 2E[H], which is more than half the average gap whenever the gaps are uneven. Same buses, same fuel, worse Tuesday.'
      ],
      fact: 'Real-world fact: it is not just buses. Lifts in a tall building bunch for the same reason, and a bus route is just a very slow lift going sideways.'
    },
    {
      brief: 'Light demand on a gentle morning, with the occasional hiccup. The gaps will start to wobble. Keep the buses evenly spaced for ninety minutes.',
      how: ['Tap a bus (or its Hold button) to hold it at its next stop. A held bus lets itself go as soon as the gap to the bus ahead is back to normal, or when you release it, or after two and a half minutes.', 'A bus too close behind the one ahead should wait. A bus with a long gap behind it should not.', 'The people already aboard a held bus will tell you what they think of it, and the time they sit there counts against you.', 'Bus Inspector Dalgleish has a clipboard and opinions. She does not see everything.'],
      lesson: [
        'What you just did is headway-based holding: if a bus is too close behind its leader, make it wait until the gap is right. It works because it fixes the thing that matters, the spacing, and a late bus cannot fool it. On a frequent service nobody checks a timetable; they just want a bus soon, so the sensible target is an even gap.',
        'There is a cost: every hold makes the people already aboard sit still, so you are trading a few people\'s minutes for many people\'s waits. Hold too eagerly and you are just a slower bus.'
      ],
      fact: 'Real-world fact: London bus performance is measured as "excess wait time": how much longer people waited than the timetable promised. On a frequent route, bunching is exactly what produces it.'
    },
    {
      brief: 'Rush hour: demand up by about forty per cent. Every delay matters more, and a lead bus fills up and leaves people on the pavement.',
      how: ['Holds work as before, but bunches form faster, so react sooner.', 'A bus at crush load (45) cannot take anyone else, however politely they ask.', 'Try the Inspector\'s other method: "printed timetable". Compare.'],
      lesson: [
        'Capacity adds a second feedback loop. The first bus of a bunch fills up and drives past people, who then join an even bigger queue for the next bus, which makes that bus load longer. Meanwhile the followers run nearly empty. Crowded lead, empty tail: that is the signature of a bunch in the wild.',
        'Two ways to hold: against the gap ("wait until the bus ahead is a proper distance away") or against a printed timetable ("do not leave before your scheduled time"). On this route, with demand fairly steady and a schedule with sensible slack, a timetable does about as well as the gap. That is real: schedule holding works when the route has slack and demand is predictable. It is much more fragile when it is not, as the roadworks level will show.'
      ],
      fact: 'Real-world fact: crowded-front, empty-back is the usual description of a bunch from the passenger side: the first bus is a sardine tin and the second one is a lonely limousine.'
    },
    {
      brief: 'The Festival is on. Crowds at Murrayfield, Stockbridge and The Shore, with shows letting out in waves. The quiet stops get the leftovers.',
      how: ['Watch the three hot stops (gold squares): queues there turn into long loading times, and long loading times turn into bunches.', 'Shows let out in bursts, so a queue appears all at once.', 'Hold whichever bus is too close to the one ahead. Where you hold it matters far less than whether you do.'],
      lesson: [
        'Demand is never even. A stop with a big queue makes every bus that reaches it dwell for a long time, so busy stops act as bunching generators: each late bus becomes later. The long dwell is the Newell and Potts effect, turned up.',
        'In a ring this uniform, the cure is the same wherever you apply it: any hold that restores the gap helps, and what matters is whether the bus is too close to the one ahead, not which stop it is standing at. Holding does not make the crowds smaller; it just stops them from turning into convoys.'
      ],
      fact: 'Real-world fact: the Edinburgh trams took from 2008 to 2014 to build, and the city\'s buses spent much of that time making polite conversation with traffic cones.'
    },
    {
      brief: 'Roadworks: a pair of temporary traffic lights and a one-lane crawl section. The tram works, but with no tram.',
      how: ['Delays here are free and frequent: a red light costs a bus about half a minute, at random.', 'The crawl lane slows every bus. Watch what it does to the gaps behind a slow bus.', 'Try the Inspector\'s "printed timetable" method here, then the gap method. Notice which one survives the roadworks.'],
      lesson: [
        'Roadworks and lights hand out random delays for free, and each delay seeds a new bunch. A tightly printed timetable cannot cope with that: it holds buses that are early against a plan that assumed nothing would go wrong, and it ignores that the bus ahead is itself late. (A very padded timetable did as well in our tests, but only by having every bus dawdle.) Headway holding looks at the bus ahead, so it follows the delay instead of fighting it.',
        'You cannot remove the delays, you can only stop them growing. Holding does that: each hold absorbs a delay at a stop, where the bus is already standing still, rather than letting it ripple down the route.'
      ],
      fact: 'Real-world fact: the Edinburgh tram line opened in May 2014, after construction that started in 2008. Every bunch during those years has a clear conscience and an excuse.'
    },
    {
      brief: 'Everything at once: festival crowds, roadworks, haggis, pigeons, crush loads and a driver who has just discovered a seagull on the wing mirror. Good luck.',
      how: ['Hold for the gaps. That is the only lever you need, and the only one that works.', 'The Inspector will help. The Inspector is not infallible. The Inspector is also, frankly, doing her best.', 'You will not get perfect spacing. Aim to keep the biggest gap small.'],
      lesson: [
        'Perfect spacing is not on the menu. Good dispatching is about keeping the spread bounded, and the cheap way to do that is to react to the actual gap between buses, not to a printed timetable that assumed nothing would ever go wrong.',
        'It also needs slack. You can only hold a bus if you have time to spend; that is why a real route has a layover at the end, and why the terminus in this game is, with great practicality, a pub.'
      ],
      fact: 'Real-world fact: letting a bus run express past stops (skipping) sounds clever but, in our tests, barely helped: it saves a few seconds and costs the people left behind. Holding is the lever that works.'
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
      var hit = svgEl('circle', { class: 'hit', cx: pr.x.toFixed(1), cy: pr.y.toFixed(1), r: 17, 'data-stop': i }, sg);
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
    ring.sub = svgEl('text', { x: 0, y: 34, 'text-anchor': 'middle', 'font-size': 9, fill: '#5a4538', 'font-family': 'ui-monospace,monospace' }, hub);
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
      svgEl('circle', { class: 'hit', r: 27, cx: 0, cy: 0 }, bGroup);
      bGroup.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actHold(+e.currentTarget.getAttribute('data-bus')); }
      });
      shape.root = bGroup; shape.v = null;
      ring.buses.push(shape);
    }
    ring.bub = svgEl('g', { 'pointer-events': 'none' }, svg);
    S.queueSig = [];
    svg.onclick = onRingTap;
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
      if (b.hold.active) { tag = 'HOLD ' + fmt(S.sim.holdRemaining(b)); tcol = '#8c1d35'; }
      else if (b.hold.armed) { tag = 'HOLD NEXT'; tcol = '#8a5d08'; }
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
      var lbl = 'Bus ' + (i + 1) + ', ' + b.pax.length + ' aboard' + (b.hold.active ? ', held' : '') + '. Press Enter to ' + (S.level.watch ? 'send a pigeon at it' : b.hold.active ? 'release it' : 'hold it') + '.';
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
    ring.sub.textContent = sim.maxConvoy >= 2 ? 'bunch of ' + sim.maxConvoy : 'wobble ' + cv.toFixed(2);
    // bubbles lifetime
    for (i = S.bubbles.length - 1; i >= 0; i--) {
      var bb = S.bubbles[i];
      if (ts > bb.until) { if (bb.el.parentNode) bb.el.parentNode.removeChild(bb.el); S.bubbles.splice(i, 1); }
    }
  }

  function bubble(x, y, text, kind, opt) {
    opt = opt || {};
    var now = performance.now(), k;
    var hasEvent = S.bubbles.some(function (b) { return b.kind === 'event' && now < b.until; });
    if (!opt.force) {
      if (kind !== 'event' && hasEvent) return;
      if (S.speed >= 8 && kind !== 'event') return;
      if (now - S.lastBubble < 900 || S.bubbles.length >= 3) return;
    } else if (S.bubbles.length >= 4) { var old = S.bubbles.shift(); if (old.el.parentNode) old.el.parentNode.removeChild(old.el); }
    S.lastBubble = now;
    var lines = [], words = text.split(' '), cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > 19) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    var maxLen = 0; lines.forEach(function (l) { maxLen = Math.max(maxLen, l.length); });
    var w = Math.max(34, maxLen * 5.5 + 14), h = lines.length * 11.5 + 10;
    // push outward from the hub, then step up until clear of other bubbles
    var dx = x - CX, dy = y - CY, dd = Math.sqrt(dx * dx + dy * dy) || 1;
    var ax = x + dx / dd * 16, ay = y + dy / dd * 16;
    var bx = clamp(ax - w / 2, 3, 377 - w), by = clamp(ay - h - 8, 3, 377 - h);
    for (k = 0; k < 4; k++) {
      var hit = S.bubbles.some(function (b) { return bx < b.x + b.w + 3 && bx + w + 3 > b.x && by < b.y + b.h + 3 && by + h + 3 > b.y; });
      if (!hit) break;
      by = clamp(by - (h + 4), 3, 377 - h);
    }
    var g = svgEl('g', { class: 'bubble' }, ring.bub);
    var fill = kind === 'smug' ? '#f1cd76' : kind === 'event' ? '#2a1a14' : '#fffdf7';
    var ink = kind === 'event' ? '#fff4dc' : kind === 'angry' ? '#8c1d35' : '#2a1a14';
    svgEl('rect', { x: bx.toFixed(1), y: by.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: 7, fill: fill, stroke: '#2a1a14', 'stroke-width': 1.2 }, g);
    var tipx = clamp(x, bx + 8, bx + w - 8), tipy = by + h;
    if (y < by) { tipy = by; }
    svgEl('path', { d: 'M' + (tipx - 4).toFixed(1) + ' ' + (by + h - 0.5).toFixed(1) + ' L' + clamp(x, bx, bx + w).toFixed(1) + ' ' + (by + h + 6).toFixed(1) + ' L' + (tipx + 4).toFixed(1) + ' ' + (by + h - 0.5).toFixed(1), fill: fill, stroke: '#2a1a14', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, g);
    svgEl('rect', { x: (tipx - 3.2).toFixed(1), y: (by + h - 2).toFixed(1), width: 6.4, height: 3, fill: fill }, g);
    lines.forEach(function (l, i) {
      var t = svgEl('text', { x: (bx + w / 2).toFixed(1), y: (by + 14 + i * 11.5).toFixed(1), 'text-anchor': 'middle', 'font-size': 10, fill: ink }, g);
      t.textContent = l;
    });
    S.bubbles.push({ el: g, until: now + (opt.life || 3200), x: bx, y: by, w: w, h: h, kind: kind });
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
            var front = frontOfConvoy(sim);
            var stp = nearestStop(sim, front);
            var sp = stopXY(stp);
            bubble(sp.x, sp.y - 10, 'Typical.', 'angry', { force: true, life: 3600 });
            ding(220, 0.6, 0.18);
            live('A convoy of ' + e.size + ' buses has formed.');
          } else if (e.size === 2) live('Two buses are now bunched together.');
          break;
        case 'pass':
          if (e.kind === 'full' && e.waiting > 0) {
            var bp = busXY(e.bus);
            bubble(bp.x, bp.y - 12, 'Full. Sorry!', 'smug');
          }
          break;
        case 'holdstart':
          if (!e.auto) { ding(1320, 0.45); if (S.speed <= 2) { var hp = busXY(e.bus); bubble(hp.x, hp.y - 12, 'Held. Regulating.', 'smug'); } }
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
    var sim = S.sim, ul = $('busList'), lv = S.level, hold = leversFor('hold') || !!lv.watch;
    ul.innerHTML = ''; S.rows = [];
    for (var i = 0; i < sim.n; i++) {
      var li = document.createElement('li'); li.className = 'brow' + (hold ? '' : ' nh');
      li.innerHTML = '<span class="bdg" style="background:' + BUS_COLOURS[i % BUS_COLOURS.length] + '">' + (i + 1) + '</span>' +
        '<span class="binfo"><b></b><span></span></span>' +
        (hold ? '<button type="button" class="bbtn hold" data-bus="' + i + '"></button>' : '');
      ul.appendChild(li);
      S.rows.push({ li: li, b: li.querySelector('b'), s: li.querySelector('.binfo > span'), hold: li.querySelector('.hold') });
      li.addEventListener('click', function (e) {
        var t = e.target;
        if (t.classList.contains('hold')) actHold(+t.getAttribute('data-bus'));
      });
    }
    $('busH').textContent = lv.watch ? 'The buses' : 'Your buses';
    $('busHint').textContent = lv.watch ? 'a pigeon button for each' : 'tap a bus on the ring, or its button';
    $('sbTools').hidden = lv.id !== 99;
    $('quick').hidden = !leversFor('hold');
  }

  function stateText(b, sim) {
    var stn = function (i) { return sim.stops[i].name; };
    if (b.stuck > 0) return 'Delayed: ' + (S.busNote[b.id] || 'incident') + ' ' + fmt(b.stuck);
    if (b.state === 'dwell') {
      if (b.hold.active) return 'HELD at ' + stn(b.stop) + ' (about ' + fmt(sim.holdRemaining(b)) + ' more)';
      return 'Loading at ' + stn(b.stop);
    }
    var dist = ((sim.stops[b.ns].pos - b.pos) % sim.L + sim.L) % sim.L;
    var tag = b.hold.armed ? ' [HOLD NEXT]' : '';
    return 'To ' + stn(b.ns) + ' in ' + fmt(dist / sim.cfg.vFree) + tag;
  }

  function updatePanel() {
    var sim = S.sim, lv = S.level, m = sim.metrics(), i;
    var gaps = sim.gapsTime(), H = sim.Hest;
    for (i = 0; i < sim.n; i++) {
      var b = sim.buses[i], r = S.rows[i];
      r.b.textContent = 'Bus ' + (i + 1) + ' · ' + stateText(b, sim);
      var ld = sim.leader(i);
      r.s.textContent = b.pax.length + '/' + sim.cfg.cap + ' aboard · ' + fmt(gaps[i]) + ' behind Bus ' + (ld + 1);
      r.li.className = 'brow' + (r.hold ? '' : ' nh') + (b.hold.active ? ' held' : '') + (S.selected === i ? ' sel' : '') + (S.suggestion && S.suggestion.bus === i ? ' sugg' : '');
      if (r.hold) {
        var txt, on = false;
        if (lv.watch) txt = 'Pigeon';
        else if (b.hold.active) { txt = 'Release'; on = true; }
        else if (b.hold.armed) { txt = 'Cancel'; on = true; }
        else if (b.state === 'dwell') txt = 'Hold now';
        else txt = 'Hold';
        if (r.hold.textContent !== txt) r.hold.textContent = txt;
        r.hold.classList.toggle('on', on);
        r.hold.setAttribute('aria-label', (lv.watch ? 'Send a pigeon at bus ' : txt + ' bus ') + (lv.watch ? '' : '') + (i + 1));
      }
    }
    if (sim.t > 0) for (i = 0; i < sim.n; i++) if (sim.buses[i].stuck <= 0) delete S.busNote[i];
    // waiting, in plain terms (waiting only: time sat on held buses is shown separately)
    var warm = sim.t >= 900 && m.boarded >= 60;
    var act = m.waitWin, even = m.evenWin, heldPer = m.heldPaxSec / Math.max(1, m.boarded);
    $('waitNow').textContent = warm ? fmt(act) : '-:--'; $('waitEven').textContent = warm ? fmt(even) : '-:--';
    $('waitPen').textContent = fmt(heldPer);
    var mx = Math.max(act, even, 1);
    $('barNow').style.width = warm ? (act / mx * 100) + '%' : '0'; $('barEven').style.width = warm ? (even / mx * 100) + '%' : '0';
    var pen = even > 0 ? act / even - 1 : 0;
    $('waitNote').textContent = !warm ? 'Warming up. The first fifteen minutes are dull on purpose.'
      : pen > 0.1 ? 'Bunching tax: waits are ' + Math.round(pen * 100) + '% longer than evenly spaced buses would give. Passengers land in the long gaps more often than the short ones: E[H²] / 2E[H] = ' + fmt(m.formulaWin) + ' for your gaps. (Waiting only; held-bus time is on the right.)'
      : 'About as good as evenly spaced buses would be (waiting only; held-bus time is on the right).';
    $('tCompl').textContent = m.complaints; $('tStrand').textContent = m.stranded;
    if (lv.watch) { $('tScore').textContent = m.maxConvoy; $('tScoreL').textContent = 'biggest bunch'; $('goal').textContent = 'Tap a bus to unleash a pigeon. Then watch.'; }
    else if (lv.stars) {
      $('tScore').textContent = fmt(m.score); $('tScoreL').textContent = 'total delay each';
      var st = B.starsFor(lv, m.score);
      $('goal').textContent = (sim.snap ? '' : 'Warm-up: the first quarter is not scored. ') + 'Now: ' + '★'.repeat(st) + '☆'.repeat(3 - st) + '   ★ ≤ ' + fmt(lv.stars[0]) + '  ★★ ≤ ' + fmt(lv.stars[1]) + '  ★★★ ≤ ' + fmt(lv.stars[2]);
    } else { $('tScore').textContent = fmt(m.delay); $('tScoreL').textContent = 'total delay each'; $('goal').textContent = 'Sandbox: no stars, no mercy.'; }
    var tot = 7 * 3600 + sim.t, hh = Math.floor(tot / 3600) % 24, mm = Math.floor(tot / 60) % 60;
    $('clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var pr = isFinite(sim.cfg.duration) ? clamp(sim.t / sim.cfg.duration, 0, 1) : (sim.t / 3600) % 1;
    $('progressFill').style.width = (pr * 100) + '%';
    $('progress').setAttribute('aria-valuenow', Math.round(pr * 100));
    var cap = captionFor(sim, lv);
    if (cap !== S.caption) { S.caption = cap; $('caption').textContent = cap; }
    updateInspector();
    updateQuick(gaps, H);
    if (lv.watch && !S.grow && sim.t > 700 && S.running) {
      var gi = 0; for (i = 1; i < sim.n; i++) if (gaps[i] > gaps[gi]) gi = i;
      if (gaps[gi] > 1.4 * H) { S.grow = true; var gp = busXY(gi); bubble(gp.x, gp.y - 10, 'This gap is growing: ' + fmt(gaps[gi]) + ' (it should be ' + fmt(H) + ').', 'event', { force: true, life: 5200 }); live('A gap is growing behind bus ' + (gi + 1) + '.'); }
    }
    $('slipCount').textContent = m.complaints + (m.complaints === 1 ? ' slip' : ' slips');
  }

  function updateQuick(gaps, H) {
    var sim = S.sim, q = $('quick'); if (q.hidden) return;
    var wi = -1, i;
    for (i = 0; i < sim.n; i++) if (wi < 0 || gaps[i] < gaps[wi]) wi = i;
    var wb = sim.buses[wi], bw = $('qWorst');
    bw.setAttribute('data-bus', wi);
    bw.textContent = (wb.hold.active || wb.hold.armed ? 'Release Bus ' : 'Hold Bus ') + (wi + 1) + ': closest, ' + fmt(gaps[wi]) + ' behind Bus ' + (sim.leader(wi) + 1);
    var ni = -1, nd = Infinity;
    for (i = 0; i < sim.n; i++) {
      var b = sim.buses[i]; if (b.state !== 'run') continue;
      var d = ((sim.stops[b.ns].pos - b.pos) % sim.L + sim.L) % sim.L;
      if (d < nd) { nd = d; ni = i; }
    }
    var bn = $('qNext');
    if (ni < 0) { bn.disabled = true; bn.textContent = 'No bus about to arrive'; bn.removeAttribute('data-bus'); }
    else {
      var nb = sim.buses[ni]; bn.disabled = false; bn.setAttribute('data-bus', ni);
      bn.textContent = (nb.hold.armed ? 'Cancel hold: Bus ' : 'Hold next arrival: Bus ') + (ni + 1) + ' at ' + sim.stops[nb.ns].name + ' in ' + fmt(nd / sim.cfg.vFree);
    }
  }

  function captionFor(sim, lv) {
    var mc = sim.maxConvoy, cv = sim.cv, gaps = sim.gapsTime(), mx = Math.max.apply(null, gaps);
    if (mc >= 5) return 'A convoy of ' + mc + '. It is basically a procession. Someone fetch the bagpiper.';
    if (mc >= 4) return 'A convoy of 4. Collectively known as a "bunch". The longest gap on the route is now ' + fmt(mx) + '.';
    if (mc === 3) return 'A convoy of 3. Collectively known as a "bunch".';
    if (mc === 2) return 'A pair. Buses, like bad news, come in twos.';
    if (cv < 0.12) return lv.watch && !S.pigeoned ? 'Six buses, perfectly spaced. Lovely. Tap one to send a pigeon at it.' : lv.watch ? 'Still tidy. Keep an eye on the ruler: it will not last.' : 'Serene. This is what the timetable promised.';
    if (cv < 0.3) return 'Drifting. One bus is late and the one behind is catching up. Nobody has noticed yet.';
    return 'Going lopsided. The buses behind are chasing the late one, and the gaps are not equal.';
  }

  function inspOn() { return store.data.insp === null ? (S.level.id === 1) : store.data.insp; }
  function updateInspector() {
    var sim = S.sim, lv = S.level, box = $('inspector');
    var has = leversFor('hold');
    box.hidden = !has;
    if (!has) { S.suggestion = null; return; }
    var on = inspOn(), mode = lv.id >= 2 ? S.inspMode : 'gap';
    $('inspToggle').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('inspToggle').textContent = on ? 'On' : 'Off';
    $('inspMode').hidden = lv.id < 2 || !on;
    $('inspMode').textContent = mode === 'gap' ? 'By gap' : 'By timetable';
    $('inspMode').setAttribute('aria-label', 'Inspector method: ' + (mode === 'gap' ? 'by gap' : 'by printed timetable') + '. Press to switch.');
    var text = $('inspText'), btn = $('inspDo');
    if (!on) { S.suggestion = null; text.textContent = 'Off duty. She has gone for a cup of tea. (Switch her on if you want a second opinion.)'; btn.hidden = true; return; }
    var sg = B.suggest(sim, mode), top = sg.length ? sg[0] : null;
    S.suggestion = top;
    if (!top) { text.textContent = mode === 'gap' ? 'All gaps look civilised. I shall write "Satisfactory" on the clipboard. (I cannot see crowds that are about to appear.)' : 'Everyone is on or behind the printed timetable. Nothing to hold.'; btn.hidden = true; return; }
    var b = sim.buses[top.bus], ld = sim.leader(top.bus);
    text.textContent = top.mode === 'sched'
      ? 'Bus ' + (top.bus + 1) + ' is ' + fmt(top.ahead) + ' ahead of the printed timetable. Hold it at ' + sim.stops[top.stop].name + ' until the clock catches up.'
      : 'Hold Bus ' + (top.bus + 1) + ' at ' + sim.stops[top.stop].name + '. It is only ' + fmt(top.gap) + ' behind Bus ' + (ld + 1) + '; the route wants ' + fmt(sim.Hest) + '. It lets go by itself once the gap is back.';
    btn.hidden = false;
    btn.textContent = b.hold.active ? 'Already held' : 'Hold Bus ' + (top.bus + 1);
  }

  // ------------------------------------------------------------ actions
  function leversFor(kind) { return S.level && S.level.levers && S.level.levers.indexOf(kind) >= 0; }
  function pigeon(id) {
    var sim = S.sim;
    if (sim.t - S.lastPigeon < 90) { setStatus('That pigeon needs a minute to recover.'); return; }
    S.lastPigeon = sim.t; S.pigeoned = true;
    sim.incident(id, 20, 'pigeon');
    setStatus('Pigeon released at Bus ' + (id + 1) + '. Now watch the gaps.');
  }
  function actHold(id, mode) {
    if (!S.sim || !S.running) return;
    S.selected = id;
    if (S.level.watch) { pigeon(id); return; }
    if (!leversFor('hold')) return;
    var r = S.sim.toggleHold(id, mode), b = S.sim.buses[id];
    var stn = S.sim.stops[b.state === 'dwell' ? b.stop : b.ns].name;
    var msg = {
      armed: 'HOLD NEXT: Bus ' + (id + 1) + ' will wait at ' + stn + ' until the gap is right (or you release it).',
      disarmed: 'Hold cancelled on Bus ' + (id + 1) + '.',
      held: 'Bus ' + (id + 1) + ' held at ' + stn + '. Tap again to release.',
      released: 'Bus ' + (id + 1) + ' released. Off it goes.'
    }[r] || '';
    setStatus(msg); live(msg);
    if (r === 'armed') ding(1100, 0.3, 0.1);
    updatePanel();
  }
  // taps anywhere on the ring pick the nearest bus within ~40px (convoys!), else the nearest stop
  function onRingTap(e) {
    if (!S.sim || !S.running) return;
    var svg = $('ring'), rc = svg.getBoundingClientRect(), sc = rc.width / 380;
    var x = (e.clientX - rc.left) / sc, y = (e.clientY - rc.top) / sc, best = -1, bd = 1e9, i;
    for (i = 0; i < S.sim.n; i++) { var p = busXY(i), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && bd <= Math.max(26, 40 / sc)) { actHold(best); return; }
    var bs = -1, sd = 1e9;
    for (i = 0; i < S.sim.N; i++) { var q = ptAt(S.sim.stops[i].pos, R, S.sim.L), d2 = Math.hypot(q.x - x, q.y - y); if (d2 < sd) { sd = d2; bs = i; } }
    if (bs >= 0 && sd <= Math.max(20, 28 / sc)) onStopTap(bs);
  }
  function onStopTap(si) {
    if (!S.sim || !S.running) return;
    if (S.level.watch) { setStatus('Tap a bus, not a stop: the pigeon is looking for a bus.'); return; }
    if (!leversFor('hold')) return;
    var on = S.sim.toggleStopHold(si);
    var msg = on ? 'The next bus to reach ' + S.sim.stops[si].name + ' will be held.' : 'Hold at ' + S.sim.stops[si].name + ' cancelled.';
    setStatus(msg); live(msg);
  }

  // ------------------------------------------------------------ ruler & chart
  function drawRuler() {
    var sim = S.sim, svg = $('ruler'), w = Math.max(240, svg.clientWidth || 340), h = 104, L = sim.L, n = sim.n, i;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var x0 = 12, x1 = w - 12, W = x1 - x0, ly = 34, H = sim.Hest;
    var out = '<rect x="' + x0 + '" y="' + (ly - 9) + '" width="' + W + '" height="18" rx="5" fill="#efe5cf"/>';
    for (i = 0; i < sim.N; i++) { var tx = x0 + sim.stops[i].pos / L * W; out += '<rect x="' + (tx - 0.5).toFixed(1) + '" y="' + (ly - 13) + '" width="1" height="26" fill="#a99a86"/>'; }
    var gaps = sim.gapsTime();
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
      if (x - lastX < 15) lane = (lane + 1) % 5; else lane = 0;
      lastX = x;
      var py = 54 + lane * 11.5;
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
      if (S.level.watch && !S.pigeoned && sim.t >= 1000) { sim.incident(2, 20, 'pigeon'); S.pigeoned = true; S.lastPigeon = sim.t; setStatus('A pigeon turned up anyway. They do.'); }
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

  function unlocked(id) {
    if (id <= 1) return true;
    return levelStars(id - 1) >= 2 || (store.data.fails[id - 1] || 0) >= 2;
  }
  function renderLevels() {
    var ul = $('levelList'); ul.innerHTML = '';
    var nextId = -1;
    for (var i = 0; i < B.LEVELS.length; i++) {
      if ((i === 0 && !store.data.watched) || (i > 0 && levelStars(i) < 2 && unlocked(i))) { nextId = i; break; }
    }
    B.LEVELS.forEach(function (lv) {
      var li = document.createElement('li'), open = unlocked(lv.id);
      var st = lv.id === 0 ? (store.data.watched ? 'Watched' : 'Start here') : !open ? 'Locked' : '★'.repeat(levelStars(lv.id)) + '<span class="off">' + '★'.repeat(3 - levelStars(lv.id)) + '</span>';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lcard' + (lv.id === nextId ? ' next' : '') + (open ? '' : ' locked');
      b.innerHTML = '<span class="n">Level ' + lv.id + (lv.id === nextId ? ' · up next' : '') + '</span><span class="t"></span><span class="b"></span><span class="st">' + st + '</span>';
      b.querySelector('.t').textContent = lv.name;
      b.querySelector('.b').textContent = open ? lv.blurb : 'Opens with 2 stars on Level ' + (lv.id - 1) + ', or after two honest attempts at it.';
      b.setAttribute('aria-label', 'Level ' + lv.id + ': ' + lv.name + (lv.id && open ? ', ' + levelStars(lv.id) + ' of 3 stars' : '') + (open ? '' : ', locked'));
      if (!open) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', function () { if (unlocked(lv.id)) openLevel(lv.id); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  var SANDBOX = { id: 99, name: 'Sandbox', blurb: '', seed: 77, duration: Infinity, speed: 2, levers: ['hold'], cfg: {} };

  function openLevel(id) {
    var lv = id === 99 ? SANDBOX : B.LEVELS[id];
    S.level = lv;
    var cfgOver = {}, runs = (store.data.runs[id] || 0);
    if (runs > 0 && id !== 99) cfgOver.seed = lv.seed + runs * 7919;
    if (id === 99) {
      var s = S.sandbox || { bus: 6, dem: 1, k: 2.5 };
      S.sandbox = s;
      lv.cfg = { nBus: s.bus, lambda: 0.02 * s.dem, k: s.k, speedNoise: 0.04, incidentRate: 1 / 700 };
    }
    var cfg = id === 99 ? B.levelConfig(lv) : B.levelConfig(lv, cfgOver);
    S.sim = B.createSim(cfg);
    S.running = false; S.paused = false; S.acc = 0; S.ended = false; S.selected = -1; S.slipQ = []; S.bubbles = []; S.busNote = {}; S.caption = ''; S.suggestion = null; S.needle = 0; S.lastPigeon = -1e9; S.pigeoned = false; S.grow = false; S.inspMode = 'gap';
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
    $('briefText').textContent = c ? c.brief : 'No stars, no deadline. Hold buses and release a pigeon whenever you feel like it. Turn the dials on the title screen to change the route. Press End shift when you are done.';
    var how = $('briefHow'); how.innerHTML = '';
    (c ? c.how : ['Tap a bus to hold it at its next stop; tap again to release it.', 'The Release a pigeon button does what it says.']).forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; how.appendChild(li);
    });
    var sn = $('briefStars');
    if (lv.stars) sn.textContent = 'Stars are for total delay per passenger (waiting, plus time sat on held buses, plus 90 s for anyone carried past their stop): 1 star at or under ' + fmt(lv.stars[0]) + ', 2 at or under ' + fmt(lv.stars[1]) + ', 3 at or under ' + fmt(lv.stars[2]) + '. Do nothing and you get none. The first quarter of the shift is a warm-up and is not scored.'; else sn.textContent = '';
    $('briefGo').textContent = lv.watch ? 'Roll the buses' : 'Start the shift';
    $('brief').hidden = false;
    $('briefGo').focus();
    S.modal = 'brief';
  }

  function startRun() {
    $('brief').hidden = true; S.running = true; S.paused = false; S.last = performance.now(); syncSpeed();
    var lv = S.level;
    S.modal = null;
    if (lv.watch) setStatus('Tap a bus to send a pigeon at it. 8x if you are impatient.');
    else setStatus('Tap a bus on the ring, or use the buttons under it.');
    if (S.sound) ding(880, 0.3);
    $('pauseBtn').focus({ preventScroll: true });
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
    if (lv.stars && !early) { stars = B.starsFor(lv, m.score); rated = true; if (stars > levelStars(lv.id)) { store.data.stars[lv.id] = stars; } if (stars < 2) store.data.fails[lv.id] = (store.data.fails[lv.id] || 0) + 1; }
    if (lv.watch && !early) store.data.watched = true;
    if (!early && lv.id !== 99) store.data.runs[lv.id] = (store.data.runs[lv.id] || 0) + 1;
    store.save();
    var meanHAll = st.nH ? st.sumH / st.nH : sim.Hest, evenAll = meanHAll / 2, formAll = st.sumH > 0 ? st.sumH2 / (2 * st.sumH) : evenAll;
    $('debTag').textContent = early ? 'Shift ended early' : (lv.id === 99 ? 'Sandbox shift' : 'Shift complete');
    $('debH').textContent = lv.watch ? 'You watched a bunch form' : lv.id === 99 ? 'That was a shift' : (early ? 'Shift ended early' : (stars === 3 ? 'Immaculate dispatching' : stars === 2 ? 'Perfectly respectable' : stars === 1 ? 'You survived. The buses did not cooperate.' : 'No stars. The buses won this one.'));
    var sr = $('debStars');
    if (rated) sr.innerHTML = '★'.repeat(stars) + '<span class="off">' + '★'.repeat(3 - stars) + '</span><small>Total delay per passenger ' + fmt(m.score) + '  (★ ≤ ' + fmt(lv.stars[0]) + ', ★★ ≤ ' + fmt(lv.stars[1]) + ', ★★★ ≤ ' + fmt(lv.stars[2]) + ')</small>';
    else sr.innerHTML = lv.watch ? (early ? '<small>Ended before the shift did. Watch the whole thing for the full picture.</small>' : '<small>No stars. Just a lesson.</small>') : '<small>' + (early ? 'No stars for leaving early.' : '') + '</small>';
    var gaps = sim.gapsTime(), grid = $('debGrid'); grid.innerHTML = '';
    function item(v, l, cls) { var d = document.createElement('div'); d.className = 'dg ' + (cls || ''); d.innerHTML = '<div class="v"></div><div class="l"></div>'; d.firstChild.textContent = v; d.lastChild.textContent = l; grid.appendChild(d); }
    var heldPer = st.heldPaxSec / Math.max(1, m.boarded), taxPct = evenAll > 0 ? Math.round((m.wait / evenAll - 1) * 100) : 0;
    item(fmt(m.wait), 'average wait (waiting only)');
    item(fmt(evenAll), 'wait if perfectly even (waiting only)', 'gold');
    item(fmt(formAll), 'what your gaps predicted: E[H\u00b2]/2E[H]');
    if (lv.watch) { item(fmt(Math.max.apply(null, gaps)), 'longest gap now'); item(fmt(Math.min.apply(null, gaps)), 'shortest gap now'); item(st.maxConvoy, 'biggest bunch'); }
    else {
      item(fmt(m.score), 'total delay per passenger (scored)');
      item(fmt(heldPer), 'time sat on held buses, per passenger');
      item(taxPct > 3 ? '+' + taxPct + '%' : 'none', 'bunching tax on waiting');
      item(m.cvAvg.toFixed(2), 'spacing wobble (0 = perfect)');
      item(st.maxConvoy, 'biggest bunch');
      item(m.complaints, 'complaints');
      item(m.stranded, 'left on the pavement');
    }
    var note = document.createElement('p'); note.className = 'fine'; note.style.gridColumn = '1 / -1';
    note.textContent = lv.watch ? '' : 'Total delay = waiting + time sat on held buses + 90 s for anyone carried past their stop. A hold can look free on the waiting figure; the held-bus time is where it costs.';
    grid.appendChild(note);
    var c = lv.id === 99 ? null : LEVEL_COPY[lv.id], ls = $('debLesson'); ls.innerHTML = '';
    var paras = c ? c.lesson : ['You have just built your own bunch, or cured it. Either way: a late bus finds more people, loads for longer, and is later; the one behind catches up. Holding by gap, not by clock, is how real operators cure it.'];
    paras.forEach(function (t) { var p = document.createElement('p'); p.innerHTML = t; ls.appendChild(p); });
    if (c) { var f = document.createElement('p'); f.className = 'fact'; f.textContent = c.fact; ls.appendChild(f); }
    $('debRobot').textContent = '';
    var nxt = $('debNext');
    var hasNext = lv.id !== 99 && lv.id < B.LEVELS.length - 1;
    nxt.hidden = !hasNext;
    nxt.textContent = lv.watch ? 'Level 1: have a go' : 'Next: ' + (B.LEVELS[lv.id + 1] ? B.LEVELS[lv.id + 1].name : '');
    if (!lv.watch && lv.id !== 99 && hasNext && !unlocked(lv.id + 1)) { nxt.disabled = true; nxt.textContent = 'Next level: needs 2 stars, or two honest tries'; } else nxt.disabled = false;
    $('debrief').hidden = false; S.modal = 'debrief';
    $('debH').focus({ preventScroll: true });
    $('debrief').scrollTop = 0;
    live(lv.watch ? 'Shift over. You watched a bunch form.' : 'Shift over.' + (rated ? ' ' + stars + ' out of 3 stars.' : ''));
    if (rated && stars > 0) jingle();
    renderLevels();
    if (lv.id !== 99 && lv.stars && !early) {
      setTimeout(function () {
        try {
          var cfg = B.levelConfig(lv, { seed: sim.cfg.seed });
          var none = B.runHeadless(cfg, null).metrics().score, hw = B.runHeadless(cfg, 'headway').metrics().score, tt = B.runHeadless(cfg, 'timetable').metrics().score;
          $('debRobot').textContent = 'For scale, on this very shift: doing nothing scored ' + fmt(none) + '; a robot that holds any bus too close to the one ahead scored ' + fmt(hw) + '; a robot following the printed timetable scored ' + fmt(tt) + '. You scored ' + fmt(m.score) + '.';
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
    $('endBtn').addEventListener('click', function () {
      if (!S.sim || S.ended) return;
      S.wasPaused = S.paused; S.paused = true; syncSpeed(); S.modal = 'confirm'; $('confirm').hidden = false; $('confNo').focus();
    });
    $('confYes').addEventListener('click', function () { $('confirm').hidden = true; S.modal = null; finish(true); });
    $('confNo').addEventListener('click', function () { $('confirm').hidden = true; S.modal = null; S.paused = !!S.wasPaused; syncSpeed(); $('endBtn').focus(); });
    $('qWorst').addEventListener('click', function () { var b = this.getAttribute('data-bus'); if (b !== null) actHold(+b); });
    $('qNext').addEventListener('click', function () { var b = this.getAttribute('data-bus'); if (b !== null) actHold(+b); });
    $('inspMode').addEventListener('click', function () { S.inspMode = S.inspMode === 'gap' ? 'sched' : 'gap'; updateInspector(); });
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
      var cur = inspOn();
      store.data.insp = !cur; store.save(); updateInspector();
    });
    $('inspDo').addEventListener('click', function () {
      if (S.suggestion) { var b = S.sim.buses[S.suggestion.bus]; if (!b.hold.active && !b.hold.armed) actHold(S.suggestion.bus, S.suggestion.mode); }
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
      var modalEl = !$('confirm').hidden ? $('confirm') : !$('debrief').hidden ? $('debrief') : !$('brief').hidden ? $('brief') : null;
      if (modalEl) {
        if (e.key === 'Escape') {
          if (modalEl.id === 'brief') { show('title'); renderLevels(); }
          else if (modalEl.id === 'confirm') $('confNo').click();
          else if (modalEl.id === 'debrief') { show('title'); renderLevels(); }
          return;
        }
        if (e.key === 'Tab') {
          var f = Array.prototype.filter.call(modalEl.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null; });
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && (document.activeElement === first || !modalEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || !modalEl.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (S.screen !== 'game') return;
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
  if (/[?&]debug\b/.test(location.search)) window.__bunched = { state: S, open: openLevel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
