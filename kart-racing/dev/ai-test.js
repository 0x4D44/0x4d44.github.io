import * as THREE from "three";
import { ROSTER, makeRng, RACERS } from "../roster.js";
import { Kart } from "../kart.js";
import { createTrack } from "../track.js";
import { AIDriver, rubberBand } from "../ai.js";
import { ItemSystem } from "../items.js";
import { Race } from "../race.js";

window.__t = {
  THREE,
  setup({ trackId, difficulty = "normal", laps = 3, seed = 1, items = true, render = false }) {
    const rng = makeRng(seed);
    const scene = new THREE.Scene();
    const track = createTrack(trackId);
    scene.add(track.group);
    const karts = ROSTER.slice(0, RACERS).map((r, i) => {
      const k = new Kart({ id: r.id, name: r.name, color: r.color, accent: r.accent, stats: r.stats, isPlayer: i === 0 });
      scene.add(k.mesh);
      const g = track.grid(i);
      k.placeAt(g.pos, g.heading);
      k.respawns = 0;
      const rs = k.respawn.bind(k);
      k.respawn = (t) => { k.respawns++; rs(t); };
      return k;
    });
    const race = new Race({ track, karts, laps, rng });
    const drivers = karts.map((k, i) => new AIDriver(k, track, { difficulty, skill: 0.3 + 0.6 * rng(), seed: seed * 31 + i }));
    const itemSys = items ? new ItemSystem({ scene, track, karts, rng }) : null;
    const S = { scene, track, karts, race, drivers, items: itemSys, difficulty, t: 0, rng, minSpeedT: karts.map(() => 0), stuckEvents: 0 };
    S.ev = { pickup: 0, use: 0, hit: 0, block: 0, shock: 0, uses: {} };
    if (itemSys) { for (const n of ["pickup", "hit", "block", "shock"]) itemSys.on(n, () => S.ev[n]++); itemSys.on("use", (k, id) => { S.ev.use++; S.ev.uses[id] = (S.ev.uses[id] || 0) + 1; }); }
    race.start();
    this.S = S;
    return true;
  },
  step(n = 1, dt = 1 / 120) {
    const S = this.S, { karts, drivers, race, track } = S;
    for (let q = 0; q < n; q++) {
      S.t += dt;
      const ctx = { karts, items: S.items, race };
      for (const d of drivers) if (!(S.manual && S.manual.has(d.kart))) d.update(dt, ctx);
      S.items?.update(dt, S.t, race);
      for (const k of karts) k.update(dt, track);
      Kart.collide(karts);
      race.update(dt);
      for (const k of karts) { if (S.t > 10 && k.speed < 8 && !(k.spinTime > 0) && !k.race.finished) { k.slowT = (k.slowT || 0) + dt; const b = Math.floor(k.s / 20); (S.slowHist ||= {})[b] = (S.slowHist[b] || 0) + dt; } }
      for (const k of karts) { if (k.onWall) k.wallT=(k.wallT||0)+dt; if (k.offRoad) { k.grassT=(k.grassT||0)+dt; const b=Math.floor(k.s/20); (S.hist ||= {})[b]=(S.hist[b]||0)+dt; } }
      if ((q & 15) === 0) {
        const lead = Math.max(...karts.map((k) => k.race.progress));
        const pl = karts[0].race.progress;
        // test rubber band on bots except kart 0
        for (let i = 1; i < karts.length; i++) karts[i].speedScale = rubberBand(karts[i], lead, pl, S.difficulty);
      }
    }
  },
  place(k, s, lat = 0, dh = 0, speed = 0) {
    const sm = this.S.track.sample(s);
    const h = Math.atan2(sm.tangent.x, sm.tangent.z) + dh;
    k.placeAt({ x: sm.pos.x + sm.right.x * lat, z: sm.pos.z + sm.right.z * lat }, h);
    k.velocity.set(Math.sin(h) * speed, 0, Math.cos(h) * speed); k.speed = speed;
    k.race.s = s; k.race.progress = s; k._lastGoodS = s;
  },
  shot(camPos, look, w = 900, h = 520) {
    const S = this.S;
    if (!this.r) {
      const c = document.createElement("canvas"); c.width = w; c.height = h; document.body.appendChild(c);
      this.r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
      this.r.setSize(w, h, false); this.cam = new THREE.PerspectiveCamera(60, w / h, 0.1, 1500);
      S.track.setupScene(S.scene, this.r);
    }
    this.cam.position.set(...camPos); this.cam.lookAt(...look);
    this.r.render(S.scene, this.cam);
    return this.r.domElement.toDataURL("image/png");
  },
  runUntilDone(maxT = 500) {
    const S = this.S;
    while (S.t < maxT) {
      this.step(120);
      if (S.karts.every((k) => k.race.finished)) break;
    }
    return this.report();
  },
  report() {
    const S = this.S;
    return {
      hist: S.hist, slow: S.slowHist, ev: S.ev,
      t: +S.t.toFixed(1),
      karts: S.karts.map((k) => ({ n: k.name, fin: k.race.finished, ft: k.race.finishTime && +k.race.finishTime.toFixed(1), lap: k.race.lap, best: k.race.bestLap && +k.race.bestLap.toFixed(1), resp: k.respawns, slowT: +(k.slowT||0).toFixed(1), wall: +(k.wallT||0).toFixed(1), grass: +(k.grassT||0).toFixed(1), rev: S.drivers[S.karts.indexOf(k)].stuckCount||0, place: k.race.place })),
    };
  },
};
document.getElementById("o").textContent = "ready";
window.__ready = true;
