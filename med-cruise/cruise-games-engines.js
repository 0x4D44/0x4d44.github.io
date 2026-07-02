/* Cruise Deck Games engines — vanilla JS, registers window.CruiseGames.
   Each engine: new Game(canvas, {sfx, onState}). Methods: start(), reset(), destroy().
   onState(partialObj) is called ONLY on discrete changes (score, lives, message, over). */
(function () {
  "use strict";
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  /* ---------- Base ---------- */
  function Base(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts || {};
    this.sfx = this.opts.sfx || function () {};
    this._emit = this.opts.onState || function () {};
    this.W = canvas.width;
    this.H = canvas.height;
    this.running = false;
    this._raf = null;
    this.last = 0;
    var self = this;
    this._loopFn = function (t) { self._loop(t); };
    this._h = {
      down: function (e) { if (e.cancelable) e.preventDefault(); self.pointer(self._pt(e), "down"); },
      move: function (e) { self.pointer(self._pt(e), "move"); },
      up: function (e) { self.pointer(self._pt(e), "up"); }
    };
    canvas.addEventListener("pointerdown", this._h.down, { passive: false });
    window.addEventListener("pointermove", this._h.move, { passive: false });
    window.addEventListener("pointerup", this._h.up, { passive: false });
    canvas.style.touchAction = "none";
  }
  Base.prototype._pt = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H };
  };
  Base.prototype.emit = function (o) { this._emit(o); };
  Base.prototype.pointer = function () {};
  Base.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._loopFn);
    if (this.onStart) this.onStart();
  };
  Base.prototype._loop = function (t) {
    if (!this.running) return;
    var dt = Math.min(0.045, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.draw();
    this._raf = requestAnimationFrame(this._loopFn);
  };
  Base.prototype.destroy = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener("pointerdown", this._h.down);
    window.removeEventListener("pointermove", this._h.move);
    window.removeEventListener("pointerup", this._h.up);
    if (this.onDestroy) this.onDestroy();
  };
  Base.prototype.update = function () {};
  Base.prototype.draw = function () {};
  Base.prototype.rr = function (x, y, w, h, r) {
    var c = this.ctx; if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  };
  Base.prototype.hudText = function (label, value) {
    var c = this.ctx;
    c.save();
    c.fillStyle = "rgba(3,20,36,.72)";
    this.rr(14, 14, this.W - 28, 52, 16); c.fill();
    c.fillStyle = "#8fb7d1"; c.font = "700 16px Nunito, sans-serif"; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(label, 30, 40);
    c.fillStyle = "#ffd97a"; c.font = "700 22px Fredoka, Nunito, sans-serif"; c.textAlign = "right";
    c.fillText(value, this.W - 30, 40);
    c.restore();
  };

  function inherit(Child) { Child.prototype = Object.create(Base.prototype); Child.prototype.constructor = Child; return Child; }

  /* =================================================================
     1) SHUFFLEBOARD — slide discs up the deck into scoring bands.
        You (teal) vs the First Mate (coral). 4 discs each. High score wins.
  ================================================================= */
  function Shuffle(canvas, opts) {
    Base.call(this, canvas, opts);
    this.reset();
  }
  inherit(Shuffle);
  Shuffle.prototype.reset = function () {
    this.discR = 30;
    this.laneX = 70; this.laneW = this.W - 140;
    this.discs = [];         // resting/moving discs {x,y,vx,vy,team}
    this.turn = "you";       // you | mate
    this.thrown = { you: 0, mate: 0 };
    this.maxPer = 4;
    this.state = "aim";      // aim | moving | mateThink | over
    this.aiming = false; this.ap = null;
    this.cur = this._newDisc("you");
    this.msg = "Drag back & release to slide!";
    this._pushHud();
    this._mateTimer = 0;
  };
  Shuffle.prototype._newDisc = function (team) {
    return { x: this.W / 2, y: this.H - 80, vx: 0, vy: 0, team: team, r: this.discR, live: false };
  };
  Shuffle.prototype.bands = function () {
    // top of lane scoring bands (y ranges) with values
    return [
      { y0: 70, y1: 150, v: 10, col: "#fbbf24" },
      { y0: 150, y1: 250, v: 8, col: "#2dd4bf" },
      { y0: 250, y1: 370, v: 7, col: "#7dd3fc" }
    ];
  };
  Shuffle.prototype.scoreOf = function (d) {
    var b = this.bands();
    for (var i = 0; i < b.length; i++) if (d.y >= b[i].y0 && d.y < b[i].y1) return b[i].v;
    return 0;
  };
  Shuffle.prototype._pushHud = function () {
    var sy = 0, sm = 0;
    for (var i = 0; i < this.discs.length; i++) { var v = this.scoreOf(this.discs[i]); if (this.discs[i].team === "you") sy += v; else sm += v; }
    this.you = sy; this.mate = sm;
    this.emit({ you: sy, mate: sm, turn: this.turn, msg: this.msg, over: this.state === "over" });
  };
  Shuffle.prototype.pointer = function (p, phase) {
    if (this.state !== "aim" || this.turn !== "you") return;
    var d = this.cur;
    if (phase === "down") { this.aiming = true; this.ap = p; }
    else if (phase === "move" && this.aiming) { this.ap = p; }
    else if (phase === "up" && this.aiming) {
      this.aiming = false;
      var dx = d.x - this.ap.x, dy = d.y - this.ap.y;
      var mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 14) { this.ap = null; return; }
      var power = clamp(mag, 0, 240) / 240;
      var sp = 300 + power * 900;
      var inv = 1 / mag;
      d.vx = dx * inv * sp; d.vy = dy * inv * sp; d.live = true;
      this.discs.push(d); this.thrown.you++;
      this.state = "moving"; this.msg = ""; this.ap = null;
      this.sfx("putt");
    }
  };
  Shuffle.prototype._mateShot = function () {
    var d = this._newDisc("mate");
    // aim generally up-court with noise, sometimes target a scoring gap
    var targetX = this.W / 2 + rand(-90, 90);
    var targetY = rand(120, 320);
    var dx = targetX - d.x, dy = targetY - d.y;
    var mag = Math.sqrt(dx * dx + dy * dy);
    var sp = mag / rand(0.62, 0.72) * 1.9; // tuned so it roughly reaches
    sp = clamp(sp, 780, 1180);
    var inv = 1 / mag;
    d.vx = dx * inv * sp * rand(0.9, 1.06);
    d.vy = dy * inv * sp * rand(0.94, 1.02);
    d.live = true;
    this.discs.push(d); this.thrown.mate++;
    this.state = "moving"; this.sfx("putt");
  };
  Shuffle.prototype.update = function (dt) {
    if (this.state === "mateThink") {
      this._mateTimer -= dt;
      if (this._mateTimer <= 0) this._mateShot();
      return;
    }
    if (this.state !== "moving") return;
    var arr = this.discs, moving = false;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      if (!d.live) continue;
      d.x += d.vx * dt; d.y += d.vy * dt;
      // friction
      var f = Math.pow(0.16, dt);
      d.vx *= f; d.vy *= f;
      // walls
      if (d.x < this.laneX + d.r) { d.x = this.laneX + d.r; d.vx = -d.vx * 0.6; this.sfx("wall"); }
      if (d.x > this.laneX + this.laneW - d.r) { d.x = this.laneX + this.laneW - d.r; d.vx = -d.vx * 0.6; this.sfx("wall"); }
      // fell off far end
      if (d.y < 40 - d.r) { d.dead = true; d.live = false; d.vx = d.vy = 0; this.sfx("splash"); }
      if (Math.abs(d.vx) + Math.abs(d.vy) < 6) { d.vx = d.vy = 0; }
      else moving = true;
    }
    // collisions
    for (var a = 0; a < arr.length; a++) {
      for (var b = a + 1; b < arr.length; b++) {
        var p = arr[a], q = arr[b];
        if (p.dead || q.dead) continue;
        var dx = q.x - p.x, dy = q.y - p.y, dd = Math.sqrt(dx * dx + dy * dy), min = p.r + q.r;
        if (dd > 0 && dd < min) {
          var nx = dx / dd, ny = dy / dd, overlap = min - dd;
          p.x -= nx * overlap / 2; p.y -= ny * overlap / 2;
          q.x += nx * overlap / 2; q.y += ny * overlap / 2;
          var rvx = q.vx - p.vx, rvy = q.vy - p.vy, rel = rvx * nx + rvy * ny;
          if (rel < 0) {
            var imp = -rel * 0.92;
            p.vx -= nx * imp; p.vy -= ny * imp;
            q.vx += nx * imp; q.vy += ny * imp;
            this.sfx("clack");
          }
        }
      }
    }
    // remove dead
    this.discs = this.discs.filter(function (d) { return !d.dead; });
    if (!moving) this._afterStop();
  };
  Shuffle.prototype._afterStop = function () {
    this._pushHud();
    if (this.thrown.you >= this.maxPer && this.thrown.mate >= this.maxPer) {
      this.state = "over";
      this.msg = this.you > this.mate ? "You win! 🏆" : this.you < this.mate ? "First Mate wins!" : "Dead heat!";
      this._pushHud();
      this.sfx(this.you >= this.mate ? "win" : "lose");
      return;
    }
    // alternate, but respect remaining
    if (this.turn === "you" && this.thrown.mate < this.maxPer) { this.turn = "mate"; }
    else if (this.turn === "mate" && this.thrown.you < this.maxPer) { this.turn = "you"; }
    if (this.turn === "mate") {
      this.state = "mateThink"; this._mateTimer = 0.7; this.msg = "First Mate lining up…"; this._pushHud();
    } else {
      this.cur = this._newDisc("you"); this.state = "aim"; this.msg = "Your shot — drag & release."; this._pushHud();
    }
  };
  Shuffle.prototype.draw = function () {
    var c = this.ctx, W = this.W, H = this.H;
    // deck background (wood planks)
    c.fillStyle = "#0a3a5c"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#c98a4b";
    this.rr(this.laneX - 14, 30, this.laneW + 28, H - 60, 22); c.fill();
    c.save();
    c.beginPath(); this.rr(this.laneX - 14, 30, this.laneW + 28, H - 60, 22); c.clip();
    c.strokeStyle = "rgba(90,50,20,.35)"; c.lineWidth = 3;
    for (var px = this.laneX + 20; px < this.laneX + this.laneW; px += 46) { c.beginPath(); c.moveTo(px, 30); c.lineTo(px, H - 30); c.stroke(); }
    // bands
    var bands = this.bands();
    for (var i = 0; i < bands.length; i++) {
      var bd = bands[i];
      c.fillStyle = bd.col; c.globalAlpha = 0.9;
      c.fillRect(this.laneX - 14, bd.y0, this.laneW + 28, bd.y1 - bd.y0);
      c.globalAlpha = 1;
      c.fillStyle = "rgba(4,30,50,.85)"; c.font = "700 40px Fredoka, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(bd.v, W / 2, (bd.y0 + bd.y1) / 2);
    }
    // foul line
    c.strokeStyle = "rgba(255,255,255,.5)"; c.setLineDash([10, 10]); c.lineWidth = 3;
    c.beginPath(); c.moveTo(this.laneX - 14, 370); c.lineTo(this.laneX + this.laneW + 14, 370); c.stroke(); c.setLineDash([]);
    c.restore();
    // discs
    var all = this.discs.slice();
    if (this.state === "aim" && this.turn === "you") all.push(this.cur);
    for (var j = 0; j < all.length; j++) {
      var d = all[j];
      c.beginPath(); c.arc(d.x, d.y + 4, d.r, 0, TAU); c.fillStyle = "rgba(0,0,0,.25)"; c.fill();
      c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU);
      c.fillStyle = d.team === "you" ? "#2dd4bf" : "#fb7185"; c.fill();
      c.lineWidth = 5; c.strokeStyle = "rgba(255,255,255,.85)"; c.stroke();
      c.beginPath(); c.arc(d.x, d.y, d.r * 0.5, 0, TAU); c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 3; c.stroke();
    }
    // aim guide
    if (this.aiming && this.ap) {
      var d0 = this.cur, dx = d0.x - this.ap.x, dy = d0.y - this.ap.y, mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 6) {
        var power = clamp(mag, 0, 240) / 240, inv = 1 / mag;
        c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 4; c.setLineDash([8, 10]);
        c.beginPath(); c.moveTo(d0.x, d0.y); c.lineTo(d0.x + dx * inv * (60 + power * 260), d0.y + dy * inv * (60 + power * 260)); c.stroke(); c.setLineDash([]);
        // power ring
        c.beginPath(); c.arc(d0.x, d0.y, d0.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * power); c.strokeStyle = "#fbbf24"; c.lineWidth = 6; c.stroke();
      }
    }
    // hud
    this.hudText("YOU " + this.you + "   ·   MATE " + this.mate, "Discs left: " + (this.maxPer - this.thrown.you));
  };

  /* =================================================================
     2) MINI-GOLF — top-down putt-putt, 3 nautical holes.
  ================================================================= */
  function Golf(canvas, opts) {
    Base.call(this, canvas, opts);
    this.holes = this._holes();
    this.reset();
  }
  inherit(Golf);
  Golf.prototype._holes = function () {
    var W = this.W;
    return [
      { par: 2, start: { x: W / 2, y: 820 }, hole: { x: W / 2, y: 150 },
        walls: [{ x: 60, y: 470, w: 340, h: 26 }, { x: 250, y: 300, w: 26, h: 150 }],
        haz: [] },
      { par: 3, start: { x: 120, y: 820 }, hole: { x: 520, y: 160 },
        walls: [{ x: 0, y: 500, w: 420, h: 26 }, { x: 480, y: 300, w: 26, h: 260 }],
        haz: [{ x: 120, y: 300, w: 260, h: 150 }] },
      { par: 3, start: { x: W / 2, y: 830 }, hole: { x: W / 2, y: 150 },
        walls: [{ x: 120, y: 560, w: 26, h: 180 }, { x: 494, y: 560, w: 26, h: 180 }, { x: 120, y: 360, w: 400, h: 24 }],
        haz: [{ x: 250, y: 600, w: 140, h: 130 }] }
    ];
  };
  Golf.prototype.reset = function () {
    this.hi = 0;
    this.ballR = 15; this.holeR = 24;
    this.total = 0; this.parTotal = 0;
    this._loadHole(0);
    this.state = "aim";
    this.emit({ hole: 1, par: this.cur.par, strokes: 0, total: 0, msg: "Drag from the ball to putt!", over: false });
  };
  Golf.prototype._loadHole = function (i) {
    this.hi = i; this.cur = this.holes[i];
    this.ball = { x: this.cur.start.x, y: this.cur.start.y, vx: 0, vy: 0 };
    this.safe = { x: this.ball.x, y: this.ball.y };
    this.strokes = 0; this.aiming = false; this.ap = null; this.state = "aim";
    this.sunk = false;
  };
  Golf.prototype.pointer = function (p, phase) {
    if (this.state !== "aim") return;
    var b = this.ball;
    if (phase === "down") { this.aiming = true; this.ap = p; }
    else if (phase === "move" && this.aiming) this.ap = p;
    else if (phase === "up" && this.aiming) {
      this.aiming = false;
      var dx = b.x - this.ap.x, dy = b.y - this.ap.y, mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 12) { this.ap = null; return; }
      var power = clamp(mag, 0, 220) / 220, sp = 250 + power * 1000, inv = 1 / mag;
      b.vx = dx * inv * sp; b.vy = dy * inv * sp;
      this.safe = { x: b.x, y: b.y };
      this.strokes++; this.state = "moving"; this.ap = null;
      this.sfx("putt");
      this.emit({ strokes: this.strokes, msg: "" });
    }
  };
  Golf.prototype._circleRect = function (b, r) {
    var cx = clamp(b.x, r.x, r.x + r.w), cy = clamp(b.y, r.y, r.y + r.h);
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 < this.ballR * this.ballR) {
      var d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d, overlap = this.ballR - d;
      // if center inside rect, pick shallowest axis
      if (d2 === 0 || (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h)) {
        var left = b.x - r.x, right = r.x + r.w - b.x, top = b.y - r.y, bot = r.y + r.h - b.y;
        var m = Math.min(left, right, top, bot);
        if (m === left) { nx = -1; ny = 0; } else if (m === right) { nx = 1; ny = 0; }
        else if (m === top) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
        overlap = this.ballR + m;
      }
      b.x += nx * overlap; b.y += ny * overlap;
      var vn = b.vx * nx + b.vy * ny;
      b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny;
      b.vx *= 0.86; b.vy *= 0.86;
      return true;
    }
    return false;
  };
  Golf.prototype.update = function (dt) {
    if (this.state !== "moving") return;
    var b = this.ball, m = 30, hit = false;
    b.x += b.vx * dt; b.y += b.vy * dt;
    var f = Math.pow(0.22, dt); b.vx *= f; b.vy *= f;
    if (b.x < m + this.ballR) { b.x = m + this.ballR; b.vx = -b.vx * 0.7; hit = true; }
    if (b.x > this.W - m - this.ballR) { b.x = this.W - m - this.ballR; b.vx = -b.vx * 0.7; hit = true; }
    if (b.y < m + this.ballR) { b.y = m + this.ballR; b.vy = -b.vy * 0.7; hit = true; }
    if (b.y > this.H - m - this.ballR) { b.y = this.H - m - this.ballR; b.vy = -b.vy * 0.7; hit = true; }
    for (var i = 0; i < this.cur.walls.length; i++) if (this._circleRect(b, this.cur.walls[i])) hit = true;
    if (hit) this.sfx("wall");
    // hazards
    for (var j = 0; j < this.cur.haz.length; j++) {
      var r = this.cur.haz[j];
      if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
        this.sfx("splash"); this.strokes++; b.x = this.safe.x; b.y = this.safe.y; b.vx = b.vy = 0;
        this.state = "aim"; this.emit({ strokes: this.strokes, msg: "Splash! +1 penalty stroke" });
        return;
      }
    }
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var dh = dist(b.x, b.y, this.cur.hole.x, this.cur.hole.y);
    if (dh < this.holeR + 30 && speed < 520) {
      // attract to cup
      var ax = (this.cur.hole.x - b.x), ay = (this.cur.hole.y - b.y);
      b.vx += ax * 6 * dt; b.vy += ay * 6 * dt;
    }
    if (dh < this.holeR - 4 && speed < 380) { this._sink(); return; }
    if (speed < 8) { b.vx = b.vy = 0; this.state = "aim"; }
  };
  Golf.prototype._sink = function () {
    this.sunk = true; this.state = "aim"; this.sfx("sink");
    this.total += this.strokes; this.parTotal += this.cur.par;
    var diff = this.strokes - this.cur.par;
    var name = diff <= -1 ? "Birdie! 🐦" : diff === 0 ? "Par 👍" : diff === 1 ? "Bogey" : "+" + diff;
    var self = this;
    if (this.hi < this.holes.length - 1) {
      this.emit({ msg: "Hole " + (this.hi + 1) + ": " + name + " (" + this.strokes + ")", strokes: this.strokes });
      setTimeout(function () {
        if (!self.running) return;
        self._loadHole(self.hi + 1);
        self.emit({ hole: self.hi + 1, par: self.cur.par, strokes: 0, total: self.total, msg: "Next hole! Drag to putt." });
      }, 1100);
    } else {
      var vs = this.total - this.parTotal;
      var res = vs < 0 ? (vs) + " under par! 🏆" : vs === 0 ? "Level par! 🏆" : "+" + vs + " over par";
      this.state = "over";
      this.emit({ msg: "Round done — " + this.total + " strokes (" + res + ")", total: this.total, over: true });
      this.sfx("win");
    }
  };
  Golf.prototype.draw = function () {
    var c = this.ctx, W = this.W, H = this.H, m = 30;
    c.fillStyle = "#0a3a5c"; c.fillRect(0, 0, W, H);
    // turf
    c.fillStyle = "#2f9e5e"; this.rr(m, m, W - 2 * m, H - 2 * m, 24); c.fill();
    c.save(); this.rr(m, m, W - 2 * m, H - 2 * m, 24); c.clip();
    c.fillStyle = "rgba(255,255,255,.05)";
    for (var s = m; s < H; s += 46) c.fillRect(m, s, W - 2 * m, 23);
    c.restore();
    // hazards (water)
    for (var j = 0; j < this.cur.haz.length; j++) {
      var r = this.cur.haz[j]; c.fillStyle = "#38bdf8"; this.rr(r.x, r.y, r.w, r.h, 14); c.fill();
      c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "rgba(255,255,255,.6)"; c.font = "600 15px Nunito"; c.textAlign = "center"; c.fillText("💦 pool", r.x + r.w / 2, r.y + r.h / 2 + 5);
    }
    // walls
    for (var i = 0; i < this.cur.walls.length; i++) { var w = this.cur.walls[i]; c.fillStyle = "#0e5c86"; this.rr(w.x, w.y, w.w, w.h, 8); c.fill(); c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 2; c.stroke(); }
    // hole
    var ho = this.cur.hole;
    c.beginPath(); c.arc(ho.x, ho.y, this.holeR, 0, TAU); c.fillStyle = "#04263c"; c.fill();
    c.beginPath(); c.arc(ho.x, ho.y, this.holeR, 0, TAU); c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 2; c.stroke();
    // flag
    c.strokeStyle = "#eaf4fb"; c.lineWidth = 4; c.beginPath(); c.moveTo(ho.x, ho.y); c.lineTo(ho.x, ho.y - 66); c.stroke();
    c.fillStyle = "#fb7185"; c.beginPath(); c.moveTo(ho.x, ho.y - 66); c.lineTo(ho.x + 40, ho.y - 56); c.lineTo(ho.x, ho.y - 44); c.closePath(); c.fill();
    // ball
    var b = this.ball;
    c.beginPath(); c.arc(b.x, b.y + 3, this.ballR, 0, TAU); c.fillStyle = "rgba(0,0,0,.2)"; c.fill();
    c.beginPath(); c.arc(b.x, b.y, this.ballR, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
    c.strokeStyle = "#cbd5e1"; c.lineWidth = 2; c.stroke();
    // aim
    if (this.aiming && this.ap) {
      var dx = b.x - this.ap.x, dy = b.y - this.ap.y, mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 6) {
        var power = clamp(mag, 0, 220) / 220, inv = 1 / mag;
        c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 4; c.setLineDash([7, 9]);
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + dx * inv * (40 + power * 240), b.y + dy * inv * (40 + power * 240)); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.arc(b.x, b.y, this.ballR + 7, -Math.PI / 2, -Math.PI / 2 + TAU * power); c.strokeStyle = "#fbbf24"; c.lineWidth = 5; c.stroke();
      }
    }
    this.hudText("HOLE " + (this.hi + 1) + "/3  ·  PAR " + this.cur.par, "Strokes: " + this.strokes + "  ·  Total: " + this.total);
  };

  /* =================================================================
     3) HARMONY RACER — steer the ship up the sea, dodge, grab coins.
  ================================================================= */
  function Racer(canvas, opts) {
    Base.call(this, canvas, opts);
    this.reset();
  }
  inherit(Racer);
  Racer.prototype.reset = function () {
    this.laneL = 60; this.laneR = this.W - 60;
    this.ship = { x: this.W / 2, y: this.H - 150, w: 66, h: 120 };
    this.obs = []; this.coins = []; this.wake = [];
    this.spawnT = 0; this.coinT = 0;
    this.scroll = 0; this.speed = 320;
    this.dist = 0; this.coinCount = 0; this.lives = 3;
    this.state = "run"; this.flash = 0;
    this.ptrDir = 0; this.kb = { l: false, r: false }; this.btn = { l: false, r: false };
    this.emit({ coins: 0, lives: 3, dist: 0, over: false, msg: "" });
  };
  Racer.prototype.onStart = function () {
    var self = this;
    this._kd = function (e) { if (e.key === "ArrowLeft") self.kb.l = true; if (e.key === "ArrowRight") self.kb.r = true; };
    this._ku = function (e) { if (e.key === "ArrowLeft") self.kb.l = false; if (e.key === "ArrowRight") self.kb.r = false; };
    window.addEventListener("keydown", this._kd); window.addEventListener("keyup", this._ku);
  };
  Racer.prototype.onDestroy = function () { window.removeEventListener("keydown", this._kd); window.removeEventListener("keyup", this._ku); };
  Racer.prototype.setBtn = function (dir, val) { this.btn[dir === "left" ? "l" : "r"] = val; };
  Racer.prototype.pointer = function (p, phase) {
    if (this.state === "over") { if (phase === "down") this._restart(); return; }
    if (phase === "down" || phase === "move") this.ptrDir = p.x < this.W / 2 ? -1 : 1;
    if (phase === "up") this.ptrDir = 0;
  };
  Racer.prototype._restart = function () { this.reset(); };
  Racer.prototype.update = function (dt) {
    if (this.state !== "run") return;
    this.speed += dt * 9;
    this.dist += this.speed * dt / 42;
    this.scroll = (this.scroll + this.speed * dt) % 90;
    if (this.flash > 0) this.flash -= dt;
    // input
    var dir = 0;
    if (this.kb.l || this.btn.l) dir -= 1;
    if (this.kb.r || this.btn.r) dir += 1;
    if (dir === 0) dir = this.ptrDir;
    this.ship.x = clamp(this.ship.x + dir * 430 * dt, this.laneL + this.ship.w / 2, this.laneR - this.ship.w / 2);
    this.ship.tilt = dir * 0.18;
    // wake
    this.wake.push({ x: this.ship.x + rand(-16, 16), y: this.ship.y + 50, a: 1 });
    for (var w = this.wake.length - 1; w >= 0; w--) { var k = this.wake[w]; k.y += this.speed * dt; k.a -= dt * 1.6; if (k.a <= 0) this.wake.splice(w, 1); }
    // spawn obstacles
    this.spawnT -= dt;
    var gap = clamp(0.95 - this.dist * 0.0006, 0.42, 0.95);
    if (this.spawnT <= 0) {
      this.spawnT = gap;
      var types = ["rock", "buoy", "berg"];
      var t = types[(Math.random() * types.length) | 0];
      var r = t === "berg" ? rand(34, 52) : t === "rock" ? rand(26, 40) : 24;
      this.obs.push({ x: rand(this.laneL + r, this.laneR - r), y: -r, r: r, t: t });
    }
    this.coinT -= dt;
    if (this.coinT <= 0) { this.coinT = rand(0.6, 1.3); this.coins.push({ x: rand(this.laneL + 20, this.laneR - 20), y: -20, r: 15 }); }
    // move + collide
    var sp = this.speed;
    for (var i = this.obs.length - 1; i >= 0; i--) {
      var o = this.obs[i]; o.y += sp * dt;
      if (o.y - o.r > this.H) { this.obs.splice(i, 1); continue; }
      if (!o.hit && dist(o.x, o.y, this.ship.x, this.ship.y) < o.r + 28) {
        o.hit = true; this.lives--; this.flash = 0.4; this.speed = Math.max(240, this.speed * 0.6);
        this.sfx("crash");
        this.emit({ lives: this.lives });
        if (this.lives <= 0) { this.state = "over"; this.emit({ over: true, dist: Math.floor(this.dist), coins: this.coinCount, msg: "Run aground!" }); this.sfx("lose"); }
      }
    }
    for (var j = this.coins.length - 1; j >= 0; j--) {
      var cn = this.coins[j]; cn.y += sp * dt;
      if (cn.y - cn.r > this.H) { this.coins.splice(j, 1); continue; }
      if (dist(cn.x, cn.y, this.ship.x, this.ship.y) < cn.r + 26) { this.coins.splice(j, 1); this.coinCount++; this.sfx("coin"); this.emit({ coins: this.coinCount }); }
    }
  };
  Racer.prototype.draw = function () {
    var c = this.ctx, W = this.W, H = this.H;
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b5178"); g.addColorStop(1, "#053250");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // lane edges
    c.fillStyle = "rgba(255,255,255,.06)"; c.fillRect(0, 0, this.laneL, H); c.fillRect(this.laneR, 0, W - this.laneR, H);
    // scrolling swell lines
    c.strokeStyle = "rgba(255,255,255,.10)"; c.lineWidth = 3;
    for (var y = -90 + this.scroll; y < H; y += 90) { c.beginPath(); for (var x = 0; x <= W; x += 30) { var yy = y + Math.sin((x + y) * 0.04) * 6; if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke(); }
    // wake
    for (var w = 0; w < this.wake.length; w++) { var k = this.wake[w]; c.globalAlpha = clamp(k.a, 0, 1) * 0.6; c.fillStyle = "#eaf4fb"; c.beginPath(); c.arc(k.x, k.y, 7 * k.a + 2, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    // coins
    for (var j = 0; j < this.coins.length; j++) { var cn = this.coins[j]; c.beginPath(); c.arc(cn.x, cn.y, cn.r, 0, TAU); c.fillStyle = "#fbbf24"; c.fill(); c.strokeStyle = "#fff6d6"; c.lineWidth = 3; c.stroke(); c.fillStyle = "#a06d00"; c.font = "700 15px Fredoka"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", cn.x, cn.y + 1); }
    // obstacles
    for (var i = 0; i < this.obs.length; i++) {
      var o = this.obs[i];
      if (o.t === "buoy") { c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fillStyle = "#fb7185"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 4; c.stroke(); c.beginPath(); c.arc(o.x, o.y, o.r * 0.45, 0, TAU); c.fillStyle = "#fff"; c.fill(); }
      else if (o.t === "berg") { c.fillStyle = "#dbeafe"; c.beginPath(); c.moveTo(o.x, o.y - o.r); c.lineTo(o.x + o.r, o.y + o.r * 0.7); c.lineTo(o.x - o.r, o.y + o.r * 0.7); c.closePath(); c.fill(); c.fillStyle = "#a9cff0"; c.beginPath(); c.moveTo(o.x, o.y - o.r); c.lineTo(o.x + o.r * 0.4, o.y); c.lineTo(o.x - o.r * 0.4, o.y); c.closePath(); c.fill(); }
      else { c.fillStyle = "#5b6b78"; c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); c.fillStyle = "#465561"; c.beginPath(); c.arc(o.x - o.r * 0.3, o.y - o.r * 0.2, o.r * 0.4, 0, TAU); c.fill(); }
    }
    // ship
    var s = this.ship;
    c.save(); c.translate(s.x, s.y); c.rotate(s.tilt || 0);
    c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.ellipse(0, 44, s.w / 2, 16, 0, 0, TAU); c.fill();
    c.fillStyle = "#f4f7fb"; // hull
    c.beginPath(); c.moveTo(0, -s.h / 2); c.quadraticCurveTo(s.w / 2, -s.h / 4, s.w / 2 - 4, s.h / 2 - 14); c.quadraticCurveTo(0, s.h / 2, -s.w / 2 + 4, s.h / 2 - 14); c.quadraticCurveTo(-s.w / 2, -s.h / 4, 0, -s.h / 2); c.closePath(); c.fill();
    c.fillStyle = "#123a5a"; this.rr(-s.w / 2 + 12, -18, s.w - 24, 54, 8); c.fill(); // superstructure
    c.fillStyle = "#2dd4bf"; this.rr(-s.w / 2 + 16, -10, s.w - 32, 12, 4); c.fill();
    c.fillStyle = "#fb7185"; this.rr(-10, -40, 20, 22, 5); c.fill(); // funnel
    c.restore();
    // hit flash
    if (this.flash > 0) { c.fillStyle = "rgba(251,113,133," + (this.flash * 0.5) + ")"; c.fillRect(0, 0, W, H); }
    // in-canvas hud
    c.fillStyle = "rgba(3,20,36,.72)"; this.rr(14, 14, W - 28, 52, 16); c.fill();
    c.fillStyle = "#7defd8"; c.font = "700 22px Fredoka"; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(Math.floor(this.dist) + " nm", 30, 40);
    c.fillStyle = "#fbbf24"; c.textAlign = "center"; c.fillText("$ " + this.coinCount, W / 2, 40);
    c.textAlign = "right"; c.fillStyle = "#fb7185"; c.fillText("♥ ".repeat(Math.max(0, this.lives)) || "—", W - 30, 40);
  };

  /* =================================================================
     4) SHIPWRIGHT — stack decks on a floating hull, keep it balanced!
  ================================================================= */
  function Builder(canvas, opts) {
    Base.call(this, canvas, opts);
    this.reset();
  }
  inherit(Builder);
  Builder.prototype.reset = function () {
    this.waterY = 720; this.cx = this.W / 2;
    this.deckHalf = 150; this.deckScreenY = this.waterY - 44; this.topMargin = 118;
    this.bins = 12; this.binW = (this.deckHalf * 2) / this.bins;
    this.height = new Array(this.bins); for (var i = 0; i < this.bins; i++) this.height[i] = 0;
    this.parts = [];
    this.tilt = 0; this.tiltTarget = 0; this.wave = 0;
    this.inst = 0; this.scale = 1;
    this.hullWt = 6;
    this.moverLX = 0; this.moverDir = 1; this.moverSpeed = 150;
    this.sweep = this.deckHalf + 95; // carrier slides well past the rails
    this.splashes = []; this.toast = null;
    this.value = 0; this.count = 0;
    this.state = "play"; this.falling = null;
    this.kinds = [
      { w: 74, h: 40, wt: 3, val: 10, col: "#7dd3fc", n: "cabins" },
      { w: 96, h: 34, wt: 4, val: 14, col: "#2dd4bf", n: "pool deck" },
      { w: 58, h: 50, wt: 3, val: 12, col: "#fbbf24", n: "atrium" },
      { w: 46, h: 58, wt: 3, val: 16, col: "#fb7185", n: "funnel" },
      { w: 118, h: 28, wt: 5, val: 18, col: "#c4b5fd", n: "promenade" }
    ];
    this.next = this._pick();
    this.emit({ value: 0, count: 0, over: false, msg: "Tap to drop — keep her balanced!" });
  };
  Builder.prototype._pick = function () { var k = this.kinds[(Math.random() * this.kinds.length) | 0]; return { w: k.w, h: k.h, wt: k.wt, val: k.val, col: k.col, n: k.n }; };
  Builder.prototype.maxH = function () { var m = 0; for (var i = 0; i < this.parts.length; i++) { var t = this.parts[i].base + this.parts[i].h; if (t > m) m = t; } return m; };
  Builder.prototype.colTopAt = function (lx) { var b = clamp(Math.floor((lx + this.deckHalf) / this.binW), 0, this.bins - 1); return this.height[b]; };
  Builder.prototype._binRange = function (lx, w) {
    var left = lx - w / 2 + this.deckHalf, right = lx + w / 2 + this.deckHalf;
    var b0 = clamp(Math.floor(left / this.binW), 0, this.bins - 1);
    var b1 = clamp(Math.floor((right - 0.01) / this.binW), 0, this.bins - 1);
    return [b0, b1];
  };
  Builder.prototype.pointer = function (p, phase) {
    if (phase !== "down") return;
    if (this.state === "over") { this.reset(); return; }
    if (this.falling) return;
    this.falling = { lx: this.moverLX, k: this.next, localY: this.maxH() + this.next.h + 80, vy: 0 };
    this.sfx("drop");
  };
  Builder.prototype._settle = function (top) {
    var f = this.falling, k = f.k;
    if (top == null) {
      var br0 = this._binRange(f.lx, k.w);
      top = 0; for (var b0 = br0[0]; b0 <= br0[1]; b0++) top = Math.max(top, this.height[b0]);
    }
    // update deck bins only where the piece actually overlaps the deck
    var dOv = Math.min(f.lx + k.w / 2, this.deckHalf) - Math.max(f.lx - k.w / 2, -this.deckHalf);
    if (dOv > 0) {
      var br = this._binRange(f.lx, k.w);
      for (var b2 = br[0]; b2 <= br[1]; b2++) this.height[b2] = Math.max(this.height[b2], top + k.h);
    }
    this.parts.push({ lx: f.lx, base: top, w: k.w, h: k.h, wt: k.wt, col: k.col });
    this.value += k.val; this.count++;
    this.falling = null;
    this.moverSpeed = Math.min(290, this.moverSpeed + 7);
    this.next = this._pick();
    this._recalcTilt();
    this.sfx("place");
    this.emit({ value: this.value, count: this.count });
  };
  Builder.prototype._splashLost = function () {
    var f = this.falling;
    this.falling = null;
    this.splashes.push({ x: this.cx + f.lx * this.scale, r: 8, a: 1 });
    this.value = Math.max(0, this.value - 8);
    this.toast = { t: 1.4, txt: "Overboard! \u2013$8M" };
    this.next = this._pick();
    this.sfx("splash");
    this.emit({ value: this.value });
  };
  Builder.prototype._recalcTilt = function () {
    var sw = this.hullWt, mx = 0, my = this.hullWt * -40; // hull = heavy, low, centred ballast
    for (var i = 0; i < this.parts.length; i++) { var p = this.parts[i]; sw += p.wt; mx += p.wt * p.lx; my += p.wt * (p.base + p.h / 2); }
    var cxL = mx / sw, cyL = my / sw;
    this.inst = (cxL / this.deckHalf) * (1 + Math.max(0, cyL) / 110); // 0 level · ±0.65 capsize
  };
  Builder.prototype.update = function (dt) {
    // auto zoom-out so there is always room on top
    var inc = this.falling ? this.falling.k.h : (this.next ? this.next.h : 40);
    var avail = this.deckScreenY - this.topMargin;
    var req = this.maxH() + inc + 60;
    var tS = clamp(avail / req, 0.05, 1);
    this.scale += (tS - this.scale) * clamp(dt * 4, 0, 1);
    this.wave += dt;
    for (var si = this.splashes.length - 1; si >= 0; si--) { var spl = this.splashes[si]; spl.r += 90 * dt; spl.a -= dt * 1.4; if (spl.a <= 0) this.splashes.splice(si, 1); }
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }

    if (this.state === "over") { this.tilt += (this.tiltTarget - this.tilt) * clamp(dt * 3, 0, 1); return; }

    // sliding carrier
    this.moverLX += this.moverDir * this.moverSpeed * dt;
    var lim = this.sweep;
    if (this.moverLX > lim) { this.moverLX = lim; this.moverDir = -1; }
    if (this.moverLX < -lim) { this.moverLX = -lim; this.moverDir = 1; }

    // falling part (in local units so it lands on the scaled stack)
    if (this.falling) {
      var f = this.falling;
      f.vy += 2200 * dt;
      f.localY -= f.vy * dt;
      if (f.tumble) {
        f.lx += f.vx * dt;
        f.rot += f.vr * dt;
        var fyT = this.deckScreenY - 10 * this.scale - (f.localY + f.k.h / 2) * this.scale;
        if (fyT >= this.waterY - 4) this._splashLost();
      } else {
        var half = f.k.w / 2, Ls = f.lx - half, Rs = f.lx + half;
        var contactTop = -Infinity, bestOv = 0;
        var dOv = Math.min(Rs, this.deckHalf) - Math.max(Ls, -this.deckHalf);
        if (dOv > 0) {
          var br = this._binRange(f.lx, f.k.w);
          var top = 0; for (var b = br[0]; b <= br[1]; b++) top = Math.max(top, this.height[b]);
          contactTop = top; bestOv = dOv;
        }
        for (var pi = 0; pi < this.parts.length; pi++) {
          var pp = this.parts[pi];
          var ov = Math.min(Rs, pp.lx + pp.w / 2) - Math.max(Ls, pp.lx - pp.w / 2);
          if (ov > 0) {
            var pt = pp.base + pp.h;
            if (pt > contactTop) { contactTop = pt; bestOv = ov; }
            else if (pt === contactTop && ov > bestOv) bestOv = ov;
          }
        }
        if (contactTop === -Infinity) {
          var fyC = this.deckScreenY - 10 * this.scale - (f.localY + f.k.h / 2) * this.scale;
          if (fyC >= this.waterY - 4) this._splashLost();
        } else if (f.localY <= contactTop) {
          f.localY = contactTop;
          var supFrac = bestOv / f.k.w;
          if (supFrac >= 0.45) {
            this._settle(contactTop);
          } else {
            // not enough support — topple off the edge
            f.tumble = true; f.rot = 0;
            f.vx = (f.lx >= 0 ? 1 : -1) * 160;
            f.vr = (f.lx >= 0 ? 1 : -1) * 3.4;
            f.vy = -170; // little bounce up, then gravity takes it to the sea
            this.sfx("wall");
          }
        }
      }
    }

    // tilt + gentle wave wobble
    var waveOff = Math.sin(this.wave * 1.2) * (0.015 + Math.min(0.035, this.count * 0.0012));
    this.tiltTarget = clamp((this.inst || 0) * 0.42, -1.1, 1.1) + waveOff;
    this.tilt += (this.tiltTarget - this.tilt) * clamp(dt * 5, 0, 1);

    if (Math.abs(this.inst || 0) > 0.65) {
      this.state = "over";
      this.tiltTarget = (this.inst > 0 ? 1 : -1) * 1.4;
      this.emit({ over: true, value: this.value, count: this.count, msg: "Capsized! 🌊" });
      this.sfx("lose");
    }
  };
  Builder.prototype.draw = function () {
    var c = this.ctx, W = this.W, H = this.H, S = this.scale;
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#083150"); g.addColorStop(0.6, "#0b5178"); g.addColorStop(1, "#0a3f63");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "#fde68a"; c.beginPath(); c.arc(W - 84, 108, 42, 0, TAU); c.fill();

    // ship (hull + placed parts) — scaled & tilted
    c.save();
    c.translate(this.cx, this.deckScreenY);
    c.rotate(this.tilt);
    c.scale(S, S);
    c.fillStyle = "#123a5a";
    c.beginPath();
    c.moveTo(-this.deckHalf - 16, 0);
    c.lineTo(this.deckHalf + 16, 0);
    c.lineTo(this.deckHalf - 8, 92);
    c.quadraticCurveTo(0, 116, -this.deckHalf + 8, 92);
    c.closePath(); c.fill();
    c.fillStyle = "#0e2c46"; c.fillRect(-this.deckHalf - 16, -10, (this.deckHalf + 16) * 2, 12);
    c.fillStyle = "#fb7185"; c.fillRect(-this.deckHalf - 16, 6, (this.deckHalf + 16) * 2, 6);
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      var cy = -10 - (p.base + p.h / 2);
      c.fillStyle = p.col; this.rr(p.lx - p.w / 2, cy - p.h / 2, p.w, p.h, 6); c.fill();
      c.strokeStyle = "rgba(255,255,255,.32)"; c.lineWidth = 2 / S; c.stroke();
    }
    c.restore();

    // water
    c.fillStyle = "rgba(45,212,191,.28)"; c.fillRect(0, this.waterY, W, H - this.waterY);
    c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 3;
    c.beginPath(); for (var x = 0; x <= W; x += 26) { var yy = this.waterY + Math.sin(x * 0.05 + this.wave * 2) * 6; if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke();
    // splashes
    for (var sj = 0; sj < this.splashes.length; sj++) {
      var sp = this.splashes[sj];
      c.globalAlpha = Math.max(0, sp.a);
      c.strokeStyle = "#eaf4fb"; c.lineWidth = 4;
      c.beginPath(); c.ellipse(sp.x, this.waterY + 6, sp.r, sp.r * 0.45, 0, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(sp.x, this.waterY + 2, sp.r * 0.55, sp.r * 0.25, 0, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;

    var deckY = this.deckScreenY;
    // sliding carrier with next part (upright, matches ship scale)
    if (this.state === "play" && this.next && !this.falling) {
      var k = this.next;
      var craneBase = this.maxH() + 60;
      var sx = this.cx + this.moverLX * S;
      var sy = deckY - 10 * S - (craneBase + k.h / 2) * S;
      var pw = Math.max(26, k.w * S), ph = Math.max(16, k.h * S);
      var overSea = Math.abs(this.moverLX) > this.deckHalf;
      var endY = overSea ? this.waterY : deckY - 10 * S - this.colTopAt(this.moverLX) * S;
      c.strokeStyle = overSea ? "rgba(251,113,133,.65)" : "rgba(255,255,255,.4)"; c.lineWidth = 3; c.setLineDash([6, 8]);
      c.beginPath(); c.moveTo(sx, sy + ph / 2); c.lineTo(sx, endY); c.stroke(); c.setLineDash([]);
      c.fillStyle = k.col; this.rr(sx - pw / 2, sy - ph / 2, pw, ph, 6); c.fill();
      c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#eaf4fb"; c.font = "600 14px Nunito"; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillText("▼ " + k.n, sx, sy - ph / 2 - 10);
    }
    // falling part
    if (this.falling) {
      var fk = this.falling.k;
      var fx = this.cx + this.falling.lx * S;
      var fy = deckY - 10 * S - (this.falling.localY + fk.h / 2) * S;
      c.save(); c.translate(fx, fy); if (this.falling.rot) c.rotate(this.falling.rot);
      c.fillStyle = fk.col; this.rr(-(fk.w * S) / 2, -(fk.h * S) / 2, fk.w * S, fk.h * S, 6); c.fill();
      c.restore();
    }

    // balance meter
    var tv = clamp((this.inst || 0) / 0.65, -1, 1);
    c.fillStyle = "rgba(3,20,36,.72)"; this.rr(W / 2 - 92, H - 52, 184, 34, 16); c.fill();
    c.fillStyle = "rgba(255,255,255,.15)"; this.rr(W / 2 - 80, H - 42, 160, 14, 7); c.fill();
    c.fillStyle = Math.abs(tv) > 0.72 ? "#fb7185" : "#2dd4bf";
    var cxm = W / 2, half = 80; c.fillRect(cxm, H - 42, tv * half, 14);
    c.fillStyle = "#fff"; c.fillRect(cxm - 2, H - 45, 4, 20);
    c.fillStyle = "#8fb7d1"; c.font = "700 11px Nunito"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("BALANCE", cxm, H - 60);
    if (this.toast) {
      c.globalAlpha = Math.min(1, this.toast.t / 0.4);
      c.fillStyle = "#fb7185"; c.font = "700 32px Fredoka, Nunito, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(this.toast.txt, W / 2, 170);
      c.globalAlpha = 1;
    }
    this.hudText("VALUE  $" + this.value + "M", "Decks: " + this.count);
  };

  window.CruiseGames = { Shuffle: Shuffle, Golf: Golf, Racer: Racer, Builder: Builder };
})();
