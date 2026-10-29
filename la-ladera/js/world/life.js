// Living props (A5): pigeons that sit on a cable and scatter, a sleeping dog that wakes, hens in a pen, crows on the huerta, a tyre swing, a kite tied to the
// viewpoint, a football on the court, welding sparks in the alley. They move, so they are standalone THREE.Groups (the batcher fuses static things only),
// driven by ONE system (`world.life`, order 40) that skips everything far from the player. Nothing here uses Math.random: every choice comes from K.rng.
// Each piece that deserves a discovery pushes {id,name,en,kind,x,z,y,radius,dy} into ctx.world.extra; discover.js registers them last.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { tube } from './mk.js';
import { OCC } from './occupancy.js';
import { BLOCK, localToWorld } from './kit.js';
import { handBoard } from './signs.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hear = (ctx, key, x, y, z, o) => { try { ctx.audio?.playAt?.(key, x, y, z, o); } catch { /* sound is optional */ } };
const say = (ctx, msg, ms = 4200) => { try { ctx.ui?.toast?.(msg, ms); } catch { /* the ui may not exist yet */ } };
const FREE_EDGE = (BLOCK & ~OCC.ROAD) | OCC.CORE;      // the walking edge of a street is fine for a sleeping dog, the lane is not

/** Build a static Group from a MeshBuilder callback; kept out of the batcher because it moves. */
function make(ctx, name, fn, o = {}) {
  const b = new MeshBuilder(); fn(b);
  const g = new THREE.Group(); g.name = name;
  b.flush(g, ctx, { name, cast: o.cast ?? false, receive: o.receive ?? true });
  return g;
}

/** n quads whose vertices are rewritten every frame (a kite, a tail of bows). set(i, a, b, c, d) with world points. */
function dynQuads(ctx, n, cols) {
  const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), col = new Float32Array(n * 12), idx = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { nor[i * 12 + k * 3 + 1] = 1; col.set(cols[i % cols.length], i * 12 + k * 3); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 8), 2)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, ctx.mat('laundry')); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
  m.userData.set = (i, a, b, c, d) => { let o = i * 12; for (const p of [a, b, c, d]) { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; } };
  m.userData.commit = () => { geo.attributes.position.needsUpdate = true; };
  return m;
}

// ---------------------------------------------------------------------------------------------------- birds (pigeons on the cable, crows on the beds)
const PIGEON = { body: [0.52, 0.55, 0.63], belly: [0.7, 0.7, 0.75], neck: [0.3, 0.5, 0.48], tail: [0.22, 0.24, 0.28], wing: [0.5, 0.53, 0.6], tip: [0.18, 0.2, 0.25], beak: [0.85, 0.62, 0.45] };
const CROW = { body: [0.1, 0.1, 0.12], belly: [0.14, 0.14, 0.16], neck: [0.12, 0.12, 0.15], tail: [0.07, 0.07, 0.09], wing: [0.11, 0.11, 0.14], tip: [0.05, 0.05, 0.07], beak: [0.3, 0.26, 0.22] };

function birdProto(ctx, pal) {
  const body = make(ctx, 'bird.body', (b) => {
    tube(b, 'fur', [0, 0.0, -0.13], [0, 0.012, 0.07], 0.028, 0.055, 7, { col: pal.body });
    tube(b, 'fur', [0, 0.012, 0.05], [0, 0.03, 0.135], 0.055, 0.04, 7, { col: pal.belly, caps: false });
    tube(b, 'fur', [0, 0.05, 0.1], [0, 0.085, 0.15], 0.04, 0.03, 6, { col: pal.neck, caps: false });
    tube(b, 'fur', [0, 0.085, 0.15], [0, 0.092, 0.2], 0.031, 0.027, 6, { col: pal.body });
    tube(b, 'fur', [0, 0.09, 0.2], [0, 0.086, 0.232], 0.009, 0.003, 4, { col: pal.beak, caps: false });
    b.quad('fur', [-0.035, 0.0, -0.12], [0.035, 0.0, -0.12], [0.06, 0.0, -0.3], [-0.06, 0.0, -0.3], { col: pal.tail });
    b.quad('fur', [0.035, 0.0, -0.12], [-0.035, 0.0, -0.12], [-0.06, 0.0, -0.3], [0.06, 0.0, -0.3], { col: pal.tail });
  });
  const wing = (s) => make(ctx, 'bird.wing', (b) => {
    b.quad('laundry', [0, 0, 0.08], [s * 0.3, 0.012, 0.05], [s * 0.4, 0.006, -0.17], [0, 0, -0.1], { cols: [pal.wing, pal.wing, pal.tip, pal.wing], uv: [0, 0, 1, 0, 1, 1, 0, 1] });
  });
  return { body, wingR: wing(1), wingL: wing(-1) };
}

/** A flock: o = { name, pal, scale, spots:[{x,y,z,yaw}], trigger (m), ground (bool), home sound }. */
function flock(K, ctx, actors, R, o) {
  const proto = birdProto(ctx, o.pal), H = K.H;
  const birds = o.spots.map((s, i) => {
    const g = new THREE.Group(); g.name = o.name + i;
    const wr = proto.wingR.clone(), wl = proto.wingL.clone(); wr.position.set(0.04, 0.04, 0); wl.position.set(-0.04, 0.04, 0);
    g.add(proto.body.clone(), wr, wl); g.scale.setScalar(o.scale ?? 1); g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw; ctx.scene.add(g);
    return { g, wr, wl, home: [s.x, s.y, s.z], gy: H(s.x, s.z), yaw: s.yaw, st: 0, t: 0, ph: R.range(0, TAU), r: R.fork('b' + i), last: [s.x, s.y, s.z], f: null };
  });
  let lastSound = -99;
  const fold = (b, on) => { b.wr.rotation.z = on ? -1.25 : b.wr.rotation.z; b.wl.rotation.z = on ? 1.25 : b.wl.rotation.z; b.wr.scale.x = b.wl.scale.x = on ? 0.55 : 1; };
  const move = (b, x, y, z) => {
    const dx = x - b.last[0], dz = z - b.last[2];
    if (dx * dx + dz * dz > 1e-6) b.g.rotation.y = Math.atan2(dx, dz);
    b.g.position.set(x, y, z); b.last = [x, y, z];
  };
  actors.push((dt, t, p) => {
    for (const b of birds) {
      const dp = Math.hypot(p.x - b.home[0], p.z - b.home[2]);
      if (b.st === 0) {
        b.g.visible = dp < 85; if (!b.g.visible) continue;
        fold(b, true);
        const turn = Math.sin(t * 0.21 + b.ph) > 0.82 ? Math.sin(t * 2.3 + b.ph) * 0.35 : 0;
        b.g.rotation.y = b.yaw + turn;
        b.g.position.y = b.home[1] + (o.ground ? 0 : 0.004 * Math.sin(t * 1.7 + b.ph));
        b.g.rotation.x = o.ground ? 0.55 * Math.pow(Math.max(0, Math.sin(t * 2.6 + b.ph)), 6) : 0;       // crows peck
        if (dp < o.trigger && Math.abs(p.y - b.gy) < 9) {                                              // somebody comes close: up they go
          const ang = Math.atan2(b.home[2] - p.z, b.home[0] - p.x) + b.r.range(-1, 1), dist = b.r.range(15, 26), R0 = b.r.range(4.5, 8);
          const cx = b.home[0] + Math.cos(ang) * dist, cz = b.home[2] + Math.sin(ang) * dist, cy = b.home[1] + b.r.range(5, 9);
          b.f = { cx, cy, cz, R: R0, w: (b.r.chance(0.5) ? 1 : -1) * (5.5 / R0), phi0: Math.atan2(b.home[2] - cz, b.home[0] - cx), T: b.r.range(8, 13), delay: b.r.range(0, 0.45) };
          b.st = 1; b.t = 0; b.g.rotation.x = 0;
          if (t - lastSound > 4) { lastSound = t; hear(ctx, o.sound ?? 'rustle:1', b.home[0], b.home[1], b.home[2], { gain: 0.5, rate: o.soundRate ?? 1.8, ref: 6 }); ctx.events?.emit?.('w:flush', o.name); }
        }
      } else if (b.st === 1) {
        b.t += dt; const f = b.f, tt = b.t - f.delay;
        if (tt < 0) continue;
        const phi = f.phi0 + f.w * tt, k = sstep(tt / 1.9);
        const ox = f.cx + Math.cos(phi) * f.R, oy = f.cy + 0.9 * Math.sin(phi * 1.3), oz = f.cz + Math.sin(phi) * f.R;
        move(b, lerp(b.home[0], ox, k), lerp(b.home[1], oy, k) + (k < 1 ? Math.sin(k * Math.PI) * 1.0 : 0), lerp(b.home[2], oz, k));
        const a = 0.9 * Math.sin(t * 28 + b.ph) * (Math.sin(t * 2.3 + b.ph) > 0.75 ? 0.15 : 1);
        b.wr.rotation.z = a; b.wl.rotation.z = -a; b.wr.scale.x = b.wl.scale.x = 1;
        if (tt > f.T && dp > 9) { b.st = 2; b.t = 0; b.from = b.last.slice(); b.dur = clamp(Math.hypot(b.from[0] - b.home[0], b.from[2] - b.home[2]) / 5.5, 2.4, 6); }
      } else {
        b.t += dt; const k = clamp(b.t / b.dur, 0, 1), e = k * k * (3 - 2 * k);
        move(b, lerp(b.from[0], b.home[0], e), lerp(b.from[1], b.home[1], e) + Math.sin(k * Math.PI) * 1.4 * (1 - k), lerp(b.from[2], b.home[2], e));
        const a = (k < 0.93 ? 0.8 : 0.1) * Math.sin(t * 26 + b.ph);
        b.wr.rotation.z = a; b.wl.rotation.z = -a;
        if (k >= 1) { b.st = 0; b.g.rotation.y = b.yaw; b.g.position.set(b.home[0], b.home[1], b.home[2]); }
      }
    }
  });
  return birds;
}

function pigeons(K, ctx, actors, extra, R, stats) {
  const spans = (ctx.world.cableSpans ?? []).filter((s) => s.L >= 13 && s.L <= 36), sp = K.plan.spawn, tgt = [sp.x + 8, sp.z - 24];
  if (!spans.length) return;
  const mid = (s) => [(s.a[0] + s.c[0]) / 2, (s.a[2] + s.c[2]) / 2];
  spans.sort((a, b) => Math.hypot(mid(a)[0] - tgt[0], mid(a)[1] - tgt[1]) - Math.hypot(mid(b)[0] - tgt[0], mid(b)[1] - tgt[1]));
  const s = spans[0], n = 7, yaw0 = Math.atan2(s.c[0] - s.a[0], s.c[2] - s.a[2]), spots = [];
  for (let i = 0; i < n; i++) {
    const t = 0.16 + (0.68 * (i + R.range(0.1, 0.9))) / n;
    spots.push({ x: lerp(s.a[0], s.c[0], t), y: lerp(s.a[1], s.c[1], t) - 4 * s.sag * t * (1 - t) + 0.07, z: lerp(s.a[2], s.c[2], t), yaw: yaw0 + (R.chance(0.5) ? 0 : Math.PI) + R.range(-0.2, 0.2) });
  }
  flock(K, ctx, actors, R.fork('pigeons'), { name: 'pigeon', pal: PIGEON, scale: 1, spots, trigger: 6.5, ground: false });
  const m = spots[Math.floor(n / 2)];
  extra.push({ id: 'palomas', name: 'Las palomas del cable', en: 'A row of pigeons on the power line, watching the street like a jury; come close and they go up all at once, then circle back.', kind: 'nature', x: m.x, z: m.z, y: K.H(m.x, m.z), radius: 7.5, dy: 7 });
  stats.pigeons = n;
}

function crows(K, ctx, actors, extra, R, stats) {
  const h = ctx.world.huerta; if (!h) return;
  const P = localToWorld(h.x, h.z, h.ry), spots = [];
  for (const [lx, lz, yaw] of [[-3.2, 0.7, 0.4], [-1.6, -1.5, 2.6], [1.0, 2.9, 4.4]]) {
    const [x, z] = P(lx, lz); spots.push({ x, y: K.H(x, z) + 0.12, z, yaw });
  }
  flock(K, ctx, actors, R.fork('crows'), { name: 'crow', pal: CROW, scale: 1.7, spots, trigger: 5.5, ground: true, sound: 'bird:1:0', soundRate: 0.7 });
  stats.crows = spots.length;
}

// ---------------------------------------------------------------------------------------------------- dogs
const DOG_TAN = { coat: [0.74, 0.57, 0.35], chest: [0.93, 0.9, 0.84], paw: [0.92, 0.88, 0.8], ear: [0.38, 0.25, 0.15], tail: [0.74, 0.57, 0.35], tip: [0.95, 0.92, 0.88] };
const DOG_BLACK = { coat: [0.16, 0.15, 0.15], chest: [0.9, 0.88, 0.84], paw: [0.9, 0.86, 0.78], ear: [0.1, 0.09, 0.09], tail: [0.16, 0.15, 0.15], tip: [0.16, 0.15, 0.15] };

/** A dog lying down. Awake factor a (0..1) lifts the head, turns it to the person and wags the tail. */
function dog(K, ctx, actors, o) {
  const { x, z, ry, pal } = o, gy = K.H(x, z), nose = [0.08, 0.07, 0.07];
  const body = make(ctx, 'dog.body', (b) => {
    tube(b, 'fur', [-0.3, 0.16, 0], [0.2, 0.17, 0], 0.15, 0.17, 8, { col: pal.coat });
    tube(b, 'fur', [-0.3, 0.17, 0], [-0.1, 0.17, 0], 0.16, 0.16, 8, { col: pal.coat, caps: false });
    tube(b, 'fur', [0.14, 0.17, 0], [0.3, 0.15, 0], 0.17, 0.12, 8, { col: pal.chest, caps: false });
    for (const s of [-1, 1]) {
      tube(b, 'fur', [0.3, 0.07, s * 0.09], [0.55, 0.05, s * 0.1], 0.05, 0.042, 6, { col: pal.coat });
      tube(b, 'fur', [0.52, 0.045, s * 0.1], [0.62, 0.04, s * 0.1], 0.048, 0.04, 6, { col: pal.paw });
      tube(b, 'fur', [-0.3, 0.09, s * 0.17], [-0.08, 0.06, s * 0.18], 0.075, 0.055, 6, { col: pal.coat });
    }
  }, { cast: true });
  const head = make(ctx, 'dog.head', (b) => {
    tube(b, 'fur', [0, 0, 0], [0.12, -0.01, 0], 0.075, 0.085, 8, { col: pal.coat });
    tube(b, 'fur', [0.11, -0.02, 0], [0.22, -0.045, 0], 0.052, 0.036, 7, { col: pal.chest, caps: false });
    tube(b, 'fur', [0.215, -0.045, 0], [0.24, -0.046, 0], 0.03, 0.026, 6, { col: nose });
    for (const s of [-1, 1]) {
      b.box('fur', 0.02, -0.01, s * 0.088, 0.1, 0.13, 0.025, { ry: 0, col: pal.ear });
      b.box('fur', 0.1, 0.03, s * 0.052, 0.02, 0.02, 0.012, { col: nose });
    }
  }, { cast: true });
  const tail = make(ctx, 'dog.tail', (b) => {
    tube(b, 'fur', [0, 0, 0], [-0.22, 0.03, 0], 0.036, 0.022, 6, { col: pal.tail });
    tube(b, 'fur', [-0.22, 0.03, 0], [-0.3, 0.05, 0], 0.022, 0.018, 6, { col: pal.tip });
  });
  const root = new THREE.Group(); root.name = o.name; root.position.set(x, gy, z); root.rotation.y = ry;
  const hd = new THREE.Group(), tl = new THREE.Group();
  hd.add(head); tl.add(tail); tl.position.set(-0.4, 0.17, 0); root.add(body, hd, tl); ctx.scene.add(root);
  K.rect(x, z, 0.95, 0.5, ry, 0.5); K.occ.take(x, z, 0.7);
  const st = { a: 0, bark: -99, near: 0 };
  actors.push((dt, t, p) => {
    const dx = p.x - x, dz = p.z - z, dp = Math.hypot(dx, dz);
    root.visible = dp < 70; if (!root.visible) return;
    const here = Math.abs(p.y - gy) < 3;
    const want = here && dp < 4.2 ? 1 : dp > 9 || !here ? 0 : st.a > 0.5 ? 1 : 0;
    const prev = st.a;
    st.a = clamp(st.a + (want > st.a ? dt * 1.6 : -dt * 0.3), 0, 1);
    if (prev < 0.6 && st.a >= 0.6 && t - st.bark > 25) { st.bark = t; hear(ctx, 'dog:' + (o.bark ?? 0), x, gy + 0.4, z, { gain: 0.6, ref: 4 }); ctx.events?.emit?.('w:dog', o.name); }
    const a = sstep(st.a);
    hd.position.set(lerp(0.5, 0.4, a), lerp(0.1, 0.3, a), 0.02);
    hd.rotation.z = lerp(-0.28, 0.12, a);
    hd.rotation.y = clamp(angDiff(ry, Math.atan2(-dz, dx)), -1.0, 1.0) * a;
    tl.rotation.y = a * 0.7 * Math.sin(t * 13);
    body.scale.y = 1 + 0.03 * Math.sin(t * (1.9 + a * 2.6));
  });
}

function sleepingDog(K, ctx, actors, extra, R, stats) {
  const sp = K.plan.spawn;
  let at = null;
  for (const [ox, oz] of [[6, -4.5], [10, -4], [2, -6], [-14, -5], [16, -3]]) {
    at = K.spot(sp.x + ox, sp.z + oz, { r: 0.75, maxR: 7, mask: FREE_EDGE, nav: 1.0, slope: 0.25, gap: 1.0 });
    if (at) break;
  }
  if (!at) return;
  const ry = R.range(0, TAU);
  dog(K, ctx, actors, { name: 'dog.perro', x: at[0], z: at[1], ry, pal: DOG_TAN, bark: 0 });
  extra.push({ id: 'perro', name: 'El perro dormido', en: 'A street dog asleep in the sun on the warm paving; he lifts his head, thinks it over, and decides you are fine.', kind: 'nature', x: at[0], z: at[1], y: K.H(at[0], at[1]), radius: 4.2, dy: 3 });
  stats.dogs++;
}

function guardDog(K, ctx, actors, extra, R, stats) {
  const h = ctx.world.huerta; if (!h) return;
  const P = localToWorld(h.x, h.z, h.ry), [gx, gz] = P(-4.8, 7.4);
  const at = K.spot(gx, gz, { r: 0.75, maxR: 5, slope: 0.4, gap: 1.0 }); if (!at) return;
  dog(K, ctx, actors, { name: 'dog.guardian', x: at[0], z: at[1], ry: h.ry + Math.PI / 2 + 0.5, pal: DOG_BLACK, bark: 1 });
  extra.push({ id: 'guardian', name: 'Canelo, el guardián', en: 'The garden dog, who guards the beans with great solemnity from a spot in the shade and has never once been called Canelo by anybody.', kind: 'nature', x: at[0], z: at[1], y: K.H(at[0], at[1]), radius: 4.4, dy: 3 });
  stats.dogs++;
}

// ---------------------------------------------------------------------------------------------------- hens
const HEN_PALS = [
  { body: [0.55, 0.3, 0.15], breast: [0.7, 0.42, 0.2], tail: [0.2, 0.16, 0.12], head: [0.6, 0.35, 0.18] },
  { body: [0.9, 0.88, 0.82], breast: [0.95, 0.93, 0.88], tail: [0.75, 0.73, 0.68], head: [0.92, 0.9, 0.85] },
  { body: [0.13, 0.15, 0.14], breast: [0.2, 0.22, 0.2], tail: [0.1, 0.22, 0.2], head: [0.15, 0.17, 0.16] },
  { body: [0.42, 0.36, 0.3], breast: [0.55, 0.47, 0.38], tail: [0.2, 0.18, 0.15], head: [0.45, 0.38, 0.3] },
  { body: [0.62, 0.22, 0.1], breast: [0.75, 0.32, 0.12], tail: [0.1, 0.25, 0.22], head: [0.66, 0.26, 0.1] },
];

function henProto(ctx, pal) {
  const body = make(ctx, 'hen.body', (b) => {
    tube(b, 'fur', [0, 0.2, -0.15], [0, 0.21, 0.08], 0.07, 0.115, 8, { col: pal.body });
    tube(b, 'fur', [0, 0.21, 0.04], [0, 0.25, 0.13], 0.1, 0.06, 7, { col: pal.breast, caps: false });
    b.quad('fur', [-0.05, 0.22, -0.14], [0.05, 0.22, -0.14], [0.06, 0.42, -0.22], [-0.06, 0.4, -0.2], { col: pal.tail });
    b.quad('fur', [0.05, 0.22, -0.14], [-0.05, 0.22, -0.14], [-0.06, 0.4, -0.2], [0.06, 0.42, -0.22], { col: pal.tail });
    for (const s of [-1, 1]) {
      tube(b, 'fur', [s * 0.05, 0.12, 0.0], [s * 0.05, 0.01, 0.02], 0.014, 0.011, 4, { col: [0.85, 0.7, 0.25], caps: false });
      b.box('fur', s * 0.05, 0.006, 0.05, 0.05, 0.012, 0.09, { col: [0.85, 0.7, 0.25] });
    }
  });
  const head = make(ctx, 'hen.head', (b) => {
    tube(b, 'fur', [0, 0, 0], [0, 0.07, 0.03], 0.04, 0.032, 6, { col: pal.breast, caps: false });
    tube(b, 'fur', [0, 0.07, 0.03], [0, 0.085, 0.08], 0.034, 0.028, 6, { col: pal.head });
    tube(b, 'fur', [0, 0.083, 0.08], [0, 0.078, 0.117], 0.012, 0.003, 4, { col: [0.9, 0.7, 0.2], caps: false });
    b.box('fur', 0, 0.118, 0.05, 0.012, 0.05, 0.06, { col: [0.85, 0.12, 0.1] });
    b.box('fur', 0, 0.045, 0.1, 0.012, 0.03, 0.012, { col: [0.85, 0.12, 0.1] });
  });
  return { body, head };
}

function henPen(K, ctx, actors, extra, R, stats) {
  const h = ctx.world.huerta, PW = 4.8, PD = 3.6, anchors = [];
  if (h) { const P = localToWorld(h.x, h.z, h.ry); for (const [lx, lz] of [[-12, 1], [12, 1], [-12, -5], [12, -5], [0, -11]]) anchors.push(P(lx, lz)); }
  anchors.push([46, -64], [-58, -60], [64, -42], [-66, -72]);
  let site = null;
  for (const [ax, az] of anchors) {
    const at = K.spot(ax, az, { r: 2.4, maxR: 10, slope: 0.3, gap: 2.4, ok: (x, z) => K.rectFree(x, z, PW + 1.4, PD + 1.4, 0, { slope: 0.35, gapK: 0.5 }) });
    if (at) { site = at; break; }
  }
  if (!site) return;
  const [cx, cz] = site, hx = PW / 2, hz = PD / 2, fb = K.one('fence', { cast: false }), post = K.b('feature', cx, cz), H = K.H;
  const posts = [];
  for (const [a, b2] of [[[-hx, -hz], [hx, -hz]], [[hx, -hz], [hx, hz]], [[hx, hz], [-hx, hz]], [[-hx, hz], [-hx, -hz]]]) {
    const x1 = cx + a[0], z1 = cz + a[1], x2 = cx + b2[0], z2 = cz + b2[1], l = Math.hypot(x2 - x1, z2 - z1), y1 = H(x1, z1), y2 = H(x2, z2), fh = 1.15;
    fb.quad('fence_mesh', [x1, y1, z1], [x2, y2, z2], [x2, y2 + fh, z2], [x1, y1 + fh, z1], { uv: [0, 0, l / 0.4, 0, l / 0.4, fh / 0.4, 0, fh / 0.4], col: [1, 1, 1] });
    const np = Math.max(1, Math.round(l / 1.6));
    for (let k = 0; k < np; k++) posts.push([x1 + ((x2 - x1) * k) / np, z1 + ((z2 - z1) * k) / np]);
    tube(post, 'wood_pine', [x1, y1 + fh, z1], [x2, y2 + fh, z2], 0.02, 0.02, 4, { col: [0.55, 0.45, 0.3], caps: false });
    K.seg(x1, z1, x2, z2, fh, 0.06);
  }
  for (const [px, pz] of posts) tube(post, 'wood_pine', [px, H(px, pz) - 0.1, pz], [px, H(px, pz) + 1.25, pz], 0.035, 0.03, 5, { col: [0.5, 0.4, 0.28], caps: true });
  // the coop at the back, and the egg sign on the front
  const bx = cx - hx + 0.9, bz = cz - hz + 0.8, by = H(bx, bz);
  post.box('wood_pine#9a7a58', bx, by + 0.45, bz, 1.2, 0.9, 0.9, { col: [1, 1, 1] });
  post.box('corrugated_zinc', bx, by + 0.98, bz, 1.4, 0.07, 1.1, { col: [1, 1, 1] });
  post.box('iron_black', bx, by + 0.3, bz + 0.46, 0.34, 0.4, 0.02, { col: [0.1, 0.1, 0.1] });
  K.rect(bx, bz, 1.2, 0.9, 0, 1.0); K.occ.take(cx, cz, Math.hypot(hx, hz) + 0.4);
  handBoard(K, 'hand.huevos', cx + 0.2, H(cx, cz + hz) + 0.85, cz + hz + 0.07, 0, 1, 0.9);
  tube(post, 'wood_pine', [cx - 0.1, H(cx, cz + hz) - 0.1, cz + hz + 0.04], [cx - 0.1, H(cx, cz + hz) + 0.6, cz + hz + 0.04], 0.02, 0.02, 4, { col: [0.5, 0.4, 0.28] });
  // the hens
  const protos = HEN_PALS.map((pal) => henProto(ctx, pal)), hens = [];
  for (let i = 0; i < 6; i++) {
    const pr = protos[i % protos.length], g = new THREE.Group(), hd = new THREE.Group(); g.name = 'hen' + i;
    hd.add(pr.head.clone()); hd.position.set(0, 0.28, 0.13); g.add(pr.body.clone(), hd); g.scale.setScalar(i === 4 ? 1.22 : 1);
    const r = R.fork('hen' + i), u = r.range(-hx + 0.6, hx - 0.6), v = r.range(-hz + 0.5, hz - 0.5);
    ctx.scene.add(g);
    hens.push({ g, hd, u, v, tu: u, tv: v, mode: 0, tm: r.range(0.3, 2), ph: r.range(0, TAU), r, yaw: r.range(0, TAU), cluck: -99 });
  }
  const bu = hx - 0.35, bv = hz - 0.35;
  actors.push((dt, t, p) => {
    const dp = Math.hypot(p.x - cx, p.z - cz);
    for (const h2 of hens) h2.g.visible = dp < 75;
    if (dp > 75) return;
    for (const h2 of hens) {
      const x = cx + h2.u, z = cz + h2.v, dpl = Math.hypot(p.x - x, p.z - z);
      if (dpl < 2.6 && h2.mode !== 2 && Math.abs(p.y - H(x, z)) < 3) {                    // scared: run to the far side
        let best = null, bd = -1;
        for (let k = 0; k < 6; k++) { const tu = h2.r.range(-bu, bu), tv = h2.r.range(-bv, bv), d = Math.hypot(cx + tu - p.x, cz + tv - p.z); if (d > bd) { bd = d; best = [tu, tv]; } }
        h2.tu = best[0]; h2.tv = best[1]; h2.mode = 2; h2.tm = 2.2;
        if (t - h2.cluck > 3.5) { h2.cluck = t; hear(ctx, 'bird:4:' + (h2.r.chance(0.5) ? 1 : 0), x, H(x, z) + 0.3, z, { gain: 0.5, rate: 0.75 + h2.r.range(0, 0.25), ref: 3 }); ctx.events?.emit?.('w:hens'); }
      }
      h2.tm -= dt;
      if (h2.tm <= 0 && h2.mode !== 2) {
        if (h2.mode === 0) { h2.mode = 1; h2.tm = h2.r.range(1.2, 3.2); }                       // stop and peck
        else { h2.mode = 0; h2.tm = h2.r.range(1.5, 4); h2.tu = h2.r.range(-bu, bu); h2.tv = h2.r.range(-bv, bv); }
      } else if (h2.mode === 2 && h2.tm <= 0) { h2.mode = 1; h2.tm = 1.5; }
      const du = h2.tu - h2.u, dv = h2.tv - h2.v, dl = Math.hypot(du, dv);
      if ((h2.mode === 0 || h2.mode === 2) && dl > 0.06) {
        const sp = h2.mode === 2 ? 1.6 : 0.34, stp = Math.min(dl, sp * dt);
        h2.u += (du / dl) * stp; h2.v += (dv / dl) * stp;
        h2.yaw += angDiff(h2.yaw, Math.atan2(du, dv)) * Math.min(1, dt * 7);
      } else if (h2.mode === 2) { h2.mode = 1; h2.tm = 1.5; }
      const gy = H(cx + h2.u, cz + h2.v), walking = (h2.mode === 0 || h2.mode === 2) && dl > 0.06, bob = walking ? 0.012 * Math.sin(t * (h2.mode === 2 ? 22 : 9) + h2.ph) : 0;
      h2.g.position.set(cx + h2.u, gy + bob, cz + h2.v); h2.g.rotation.y = h2.yaw;
      h2.hd.rotation.x = h2.mode === 1 ? 0.95 * Math.pow(Math.max(0, Math.sin(t * 5.2 + h2.ph)), 3) : walking ? 0.2 * Math.sin(t * 9 + h2.ph) : 0;
      h2.g.rotation.x = h2.mode === 1 ? 0.2 : 0;
    }
  });
  extra.push({ id: 'gallinas', name: 'Las gallinas de doña Rosa', en: 'Six hens and one proud rooster in a wire pen with a tin-roofed coop; a hand-painted board sells their eggs by the dozen.', kind: 'nature', x: cx, z: cz + hz + 1.4, y: H(cx, cz + hz + 1.4), radius: 5.4, dy: 4 });
  ctx.world.henPen = { x: cx, z: cz, w: PW, d: PD };
  stats.hens = hens.length;
}

// ---------------------------------------------------------------------------------------------------- the tyre swing
function swing(K, ctx, actors, extra, R, stats) {
  const trees = (ctx.world.plazaTrees ?? []).filter((t) => t[2] === 'almendro');
  const sp = K.plan.spawn;
  trees.sort((a, b) => Math.hypot(a[0] - sp.x, a[1] - sp.z) - Math.hypot(b[0] - sp.x, b[1] - sp.z));
  let site = null;
  for (const [tx, tz] of trees) {
    for (let k = 0; k < 8 && !site; k++) {
      const ang = (k / 8) * TAU + 0.4, px = tx + Math.cos(ang) * 2.2, pz = tz + Math.sin(ang) * 2.2;
      // the swing sways +-1.4 m along the branch's own line: that line must be open ground
      if (K.rectFree(px, pz, 1.2, 3.2, -ang, { mask: OCC.STAIR | OCC.DOOR | OCC.LOT | OCC.ROAD | OCC.STEEP, slope: 0.3, gapK: 0.35 })) site = { tx, tz, px, pz, ang };
    }
    if (site) break;
  }
  if (!site) return;
  const { tx, tz, px, pz, ang } = site, gy = K.H(px, pz), top = gy + 3.5, L = 2.55, b = K.b('feature', px, pz);
  tube(b, 'bark_trunk', [tx, gy + 3.25, tz], [px, top, pz], 0.1, 0.07, 6, { col: [0.36, 0.28, 0.22] });
  const pivot = new THREE.Group(); pivot.position.set(px, top, pz); pivot.rotation.y = -ang;      // local x runs along the branch, so the tyre swings across it (local y/z plane)
  const sw = new THREE.Group(); pivot.add(sw);
  const rig = make(ctx, 'swing.rig', (m) => {
    const ring = 12, Rr = 0.27;
    for (let i = 0; i < ring; i++) {
      const a0 = (i / ring) * TAU, a1 = ((i + 1) / ring) * TAU;
      tube(m, 'tyre', [Math.cos(a0) * Rr, -L, Math.sin(a0) * Rr], [Math.cos(a1) * Rr, -L, Math.sin(a1) * Rr], 0.085, 0.085, 6, { caps: false, col: [0.9, 0.9, 0.9] });
    }
    for (const a of [0, 2.1, 4.2]) tube(m, 'fabric_woven#9c8a62', [0, -0.02, 0], [Math.cos(a) * Rr, -L + 0.04, Math.sin(a) * Rr], 0.012, 0.012, 4, { col: [1, 1, 1], caps: false });
  }, { cast: true });
  sw.add(rig); ctx.scene.add(pivot);
  const st = { A: 0, tt: 0 }, om = Math.sqrt(9.81 / L) * 0.95;
  const tyre = { x: px, y: gy + 0.75, z: pz };
  actors.push((dt, t, p) => {
    const dp = Math.hypot(p.x - px, p.z - pz); pivot.visible = dp < 80; if (!pivot.visible) return;
    st.tt += dt;
    const th = st.A * Math.exp(-st.tt / 9) * Math.cos(om * st.tt) + 0.012 * Math.sin(t * 0.8);
    sw.rotation.x = th;
  });
  ctx.interact.register({
    id: 'w.swing', kind: 'object', x: tyre.x, y: tyre.y, z: tyre.z, radius: 3.0, prompt: 'Empujar el columpio',
    use: (cx) => { st.A = Math.min(0.7, Math.abs(st.A * Math.exp(-st.tt / 9)) * 0.5 + 0.42); st.tt = 0; hear(cx, 'door:open:1', tyre.x, tyre.y + 1.5, tyre.z, { gain: 0.16, rate: 1.5, ref: 3 }); },
  });
  extra.push({ id: 'columpio', name: 'El columpio de llanta', en: 'A truck tyre on three ropes from the almond tree: the oldest playground equipment in the barrio, and still the only one.', kind: 'object', x: px, z: pz, y: gy, radius: 4.2, dy: 3 });
  stats.swing = 1;
}

// ---------------------------------------------------------------------------------------------------- the kite
function kite(K, ctx, actors, extra, R, stats) {
  const pl = K.plan.plazas.find((q) => q.kind === 'mirador'); if (!pl) return;
  const P = localToWorld(pl.cx, pl.cz, pl.ry), hw = pl.w / 2, hd = pl.d / 2;
  let a = null;
  for (const lz of [hd - 2.4, hd - 1.9, hd - 3.0]) {                                  // off the walking line along the parapet, a stride behind it
    for (const lx of [-hw + 3.4, -hw + 5.2, hw - 6.5, -hw + 7, 0]) {
      const [x, z] = P(lx, lz);
      if (K.occ.clear(x, z, 0.3, OCC.STAIR | OCC.DOOR) && !K.occ.overlaps(x, z, 0.8) && K.occ.navDist(x, z) > 0.7) { a = [x, z]; break; }
    }
    if (a) break;
  }
  if (!a) return;
  const gy = pl.y, ax = a[0], az = a[1], ay = gy + 0.62, b = K.b('feature', ax, az);
  tube(b, 'iron_black', [ax, gy - 0.05, az], [ax, ay + 0.04, az], 0.022, 0.018, 5, { col: [0.2, 0.2, 0.22] });
  b.cyl('iron_black', ax, ay - 0.1, az, 0.04, 0.06, 6, { col: [0.2, 0.2, 0.22] });
  K.post(ax, az, 0.08, 0.7, gy);
  const wind = [Math.sin(pl.ry), Math.cos(pl.ry)], cols = [[0.86, 0.14, 0.12], [0.98, 0.8, 0.12], [0.98, 0.8, 0.12], [0.86, 0.14, 0.12]];
  const bows = [[0.1, 0.5, 0.9], [0.95, 0.85, 0.2], [0.2, 0.7, 0.35], [0.9, 0.3, 0.55], [0.1, 0.5, 0.9], [0.95, 0.85, 0.2], [0.2, 0.7, 0.35]];
  const mesh = dynQuads(ctx, 4 + bows.length * 2, [...cols, ...bows.flatMap((c) => [c, c])]);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
  line.frustumCulled = false; ctx.scene.add(mesh, line);
  const st = { tug: 0 };
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], nrm = (u) => { const l = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / l, u[1] / l, u[2] / l]; };
  const crs = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  actors.push((dt, t, p) => {
    const dp = Math.hypot(p.x - ax, p.z - az);
    mesh.visible = line.visible = dp < 140; if (!mesh.visible) return;
    st.tug = Math.max(0, st.tug - dt * 0.6);
    const len = 17 + 1.2 * Math.sin(t * 0.4) - st.tug * 6, el = 0.86 + 0.07 * Math.sin(t * 0.55) - st.tug * 0.3, sway = 1.6 * Math.sin(t * 0.7);
    const side = [-wind[1], wind[0]];
    const kp = [ax + wind[0] * len * Math.cos(el) + side[0] * sway, ay + len * Math.sin(el), az + wind[1] * len * Math.cos(el) + side[1] * sway];
    const f = nrm(sub([ax, ay, az], kp)), rt = nrm(crs([0, 1, 0], f)), up0 = crs(f, rt), roll = 0.25 * Math.sin(t * 1.3), cr = Math.cos(roll), sr = Math.sin(roll);
    const up = [up0[0] * cr + rt[0] * sr, up0[1] * cr + rt[1] * sr, up0[2] * cr + rt[2] * sr], rr = [rt[0] * cr - up0[0] * sr, rt[1] * cr - up0[1] * sr, rt[2] * cr - up0[2] * sr];
    const at = (x, y) => [kp[0] + rr[0] * x + up[0] * y, kp[1] + rr[1] * x + up[1] * y, kp[2] + rr[2] * x + up[2] * y];
    const T = at(0, 0.5), Rg = at(0.32, 0.12), B = at(0, -0.6), Lf = at(-0.32, 0.12), C = at(0, 0.12);
    const q = mesh.userData;
    q.set(0, T, Lf, C, C); q.set(1, T, C, Rg, Rg); q.set(2, Lf, B, C, C); q.set(3, C, B, Rg, Rg);
    let prev = B;
    bows.forEach((_, i) => {
      const k = i + 1, w = 0.28 * Math.sin(t * 3.1 - k * 0.8) * (0.4 + k * 0.12), w2 = 0.22 * Math.cos(t * 2.4 - k * 0.7) * (0.4 + k * 0.12);
      const c = [B[0] + rr[0] * w + side[0] * w2 * 0.4, B[1] - k * 0.46 + 0.04 * Math.sin(t * 5 + k), B[2] + rr[2] * w + side[1] * w2 * 0.4];
      const s = 0.1, d1 = [rr[0] * s, 0, rr[2] * s], d2 = [side[0] * s, 0, side[1] * s];
      q.set(4 + i * 2, [c[0] - d1[0], c[1] - 0.045, c[2] - d1[2]], [c[0] + d1[0], c[1] - 0.045, c[2] + d1[2]], [c[0] + d1[0], c[1] + 0.045, c[2] + d1[2]], [c[0] - d1[0], c[1] + 0.045, c[2] - d1[2]]);
      q.set(5 + i * 2, [c[0] - d2[0], c[1] - 0.045, c[2] - d2[2]], [c[0] + d2[0], c[1] - 0.045, c[2] + d2[2]], [c[0] + d2[0], c[1] + 0.045, c[2] + d2[2]], [c[0] - d2[0], c[1] + 0.045, c[2] - d2[2]]);
      prev = c;
    });
    void prev; q.commit();
    const pos = line.geometry.attributes.position; pos.setXYZ(0, ax, ay, az); pos.setXYZ(1, kp[0], kp[1] - 0.2, kp[2]); pos.needsUpdate = true;
  });
  ctx.interact.register({
    id: 'w.kite', kind: 'object', x: ax, y: ay + 0.3, z: az, radius: 3.0, prompt: 'Tirar del hilo de la cometa',
    use: (cx) => { st.tug = 1; hear(cx, 'rustle:0', ax, ay, az, { gain: 0.4, rate: 1.6, ref: 3 }); },
  });
  extra.push({ id: 'cometa', name: 'La cometa del mirador', en: 'A red-and-yellow kite on a long string tied to a stake at the viewpoint, high over the roofs; someone left it flying for whoever comes next.', kind: 'vista', x: ax, z: az, y: gy, radius: 5.5, dy: 4 });
  stats.kite = 1;
}

// ---------------------------------------------------------------------------------------------------- the football
function ball(K, ctx, actors, extra, R, stats) {
  const cp = K.plan.plazas.find((q) => q.kind === 'court'), cw = ctx.world.court; if (!cp || !cw) return;
  const P = localToWorld(cp.cx, cp.cz, cp.ry), hu = cp.w / 2 - 0.6, hv = cp.d / 2 - 0.6, y0 = cw.y + 0.11;
  const geo = new THREE.IcosahedronGeometry(0.11, 1), cnt = geo.attributes.position.count, col = new Float32Array(cnt * 3);
  for (let f = 0; f < cnt / 3; f++) { const k = f % 5 === 0 ? 0.08 : 0.95; for (let v = 0; v < 3; v++) col.set([k, k, k * 0.98], (f * 3 + v) * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, ctx.mat('fur')); mesh.castShadow = true; mesh.name = 'court.ball'; ctx.scene.add(mesh);
  const st = { u: hu * 0.25, v: hv * 0.35, y: y0, vu: 0, vv: 0, vy: 0 };
  const it = ctx.interact.register({ id: 'w.ball', kind: 'object', x: 0, y: y0, z: 0, radius: 2.7, prompt: 'Patear el balón', use: (cx) => kick(cx) });
  const place = () => { const [x, z] = P(st.u, st.v); mesh.position.set(x, st.y, z); it.x = x; it.y = st.y; it.z = z; };
  const kick = (cx) => {
    const pp = cx.player?.s, [bx, bz] = P(st.u, st.v); if (!pp) return;
    const dx = bx - pp.x, dz = bz - pp.z, l = Math.hypot(dx, dz) || 1, c = Math.cos(cp.ry), s = Math.sin(cp.ry);
    const wx = dx / l, wz = dz / l, sp = 5.2 + R.range(0, 2);
    st.vu = (wx * c - wz * s) * sp; st.vv = (wx * s + wz * c) * sp; st.vy = 3.2 + R.range(0, 1.2);        // world dir -> court-local
    hear(cx, 'land:concrete:0', bx, st.y, bz, { gain: 0.8, ref: 5, rate: 1.1 }); cx.events?.emit?.('w:kick');
  };
  place();
  actors.push((dt, t, p) => {
    const [bx, bz] = P(st.u, st.v); const dp = Math.hypot(p.x - bx, p.z - bz);
    mesh.visible = dp < 90; if (!mesh.visible) return;
    const moving = Math.abs(st.vu) + Math.abs(st.vv) + Math.abs(st.vy) > 0.02 || st.y > y0 + 1e-3;
    if (!moving) return;
    st.vy -= 9.81 * dt; st.y += st.vy * dt;
    if (st.y <= y0) {
      st.y = y0;
      if (Math.abs(st.vy) > 0.9) { hear(ctx, 'land:concrete:' + (Math.abs(st.vy) > 2 ? 0 : 1), bx, y0, bz, { gain: clamp(Math.abs(st.vy) * 0.18, 0.1, 0.7), ref: 5, rate: 1.1 }); st.vy = -st.vy * 0.62; } else st.vy = 0;
    }
    const grip = st.y <= y0 + 0.001 ? Math.exp(-dt * 0.55) : 1;
    st.vu *= grip; st.vv *= grip; if (Math.hypot(st.vu, st.vv) < 0.04 && st.vy === 0) { st.vu = st.vv = 0; }
    st.u += st.vu * dt; st.v += st.vv * dt;
    if (st.u > hu) { st.u = hu; st.vu = -st.vu * 0.7; } else if (st.u < -hu) { st.u = -hu; st.vu = -st.vu * 0.7; }
    if (st.v > hv) { st.v = hv; st.vv = -st.vv * 0.7; } else if (st.v < -hv) { st.v = -hv; st.vv = -st.vv * 0.7; }
    const sp = Math.hypot(st.vu, st.vv); mesh.rotation.z -= sp * dt * 9; mesh.rotation.x += st.vv * dt * 5;
    place();
  });
  extra.push({ id: 'balon', name: 'El balón de la cancha', en: 'A scuffed football left on the court by whoever got called in for dinner; it still has one good kick left in it.', kind: 'object', x: P(st.u, st.v)[0], z: P(st.u, st.v)[1], y: cw.y, radius: 4.2, dy: 3 });
  stats.ball = 1;
}

// ---------------------------------------------------------------------------------------------------- welding in the alley
function welding(K, ctx, actors, extra, R, stats) {
  const bp = ctx.buildings?.get?.('L44'), lot = K.plan.lots.find((l) => l.id === 'L44'); if (!lot) return;
  const door = (bp?.entrances?.[0]?.outside) ?? lot.entrance?.outside; if (!door) return;
  const ry = bp?.entrances?.[0]?.ry ?? lot.rotY, fx = Math.sin(ry), fz = Math.cos(ry), tx = fz, tz = -fx;           // facade direction (out of the door) and along the facade
  // the alley in front of the door is three metres wide and a walking line: the bench stands in the first open yard beside the workshop
  const at = K.spot(door[0] + tx * 2.5, door[2] + tz * 2.5, { r: 1.5, maxR: 14, nav: 1.4, slope: 0.3, gap: 1.2, ok: (x, z) => Math.hypot(x - door[0], z - door[2]) < 11 });
  if (!at) return;
  const [x, z] = at, gy = K.H(x, z), b = K.b('feature', x, z);
  // the bench, a half-built gate in the clamp, a gas cylinder and the mask
  const bx = x, bz = z;
  b.box('iron_black', bx, gy + 0.82, bz, 1.3, 0.06, 0.62, { ry, col: [0.28, 0.28, 0.3] });
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.25, 0.25]) b.box('iron_black', bx + sx * Math.cos(ry) + sz * Math.sin(ry), gy + 0.4, bz - sx * Math.sin(ry) + sz * Math.cos(ry), 0.05, 0.8, 0.05, { col: [0.22, 0.22, 0.24] });
  const gx = bx + tx * 1.5, gz = bz + tz * 1.5, ggy = K.H(gx, gz);
  for (let i = 0; i < 6; i++) b.box('rusty_iron', gx + tx * (i * 0.22 - 0.55), ggy + 0.95, gz + tz * (i * 0.22 - 0.55), 0.035, 1.6, 0.035, { ry, col: [0.9, 0.9, 0.9] });
  for (const yy of [0.2, 0.9, 1.7]) b.box('rusty_iron', gx, ggy + yy, gz, 1.3, 0.04, 0.04, { ry, col: [0.9, 0.9, 0.9] });
  b.cyl('iron_green', bx - tx * 1.1 + fx * 0.3, K.H(bx - tx * 1.1, bz - tz * 1.1), bz - tz * 1.1 + fz * 0.3, 0.1, 0.9, 8, { col: [0.9, 0.9, 0.9] });
  b.box('iron_black', bx + fx * 0.05 - tx * 0.4, gy + 0.93, bz + fz * 0.05 - tz * 0.4, 0.22, 0.2, 0.14, { ry, col: [0.14, 0.14, 0.16] });
  K.rect(bx, bz, 1.3, 0.62, ry, 0.9); K.rect(gx, gz, 1.3, 0.1, ry, 1.8); K.occ.take(bx, bz, 1.1); K.occ.take(gx, gz, 0.9);
  // sparks
  const N = 44, pos = new Float32Array(N * 3).fill(-9999), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, color: 0xffd48a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  sparks.frustumCulled = false;
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([gx, ggy + 1.0, gz]), 3));
  const flash = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: 0.5, color: 0xcfe0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  flash.frustumCulled = false; flash.visible = false; ctx.scene.add(sparks, flash);
  const light = ctx.lights.add({ x: gx, y: ggy + 1.2, z: gz, color: 0x9fc2ff, intensity: 16, distance: 8, kind: 'lamp', on: false, flicker: 0.5 });
  const st = { next: 1.5, burst: 0, i: 0 }, wr = R.fork('weld');
  actors.push((dt, t, p) => {
    const dp = Math.hypot(p.x - gx, p.z - gz); sparks.visible = dp < 60; if (!sparks.visible) { flash.visible = false; light.on = false; return; }
    st.next -= dt;
    if (st.next <= 0 && st.burst <= 0) { st.burst = wr.range(0.7, 1.5); st.next = st.burst + wr.range(2.5, 6.0); hear(ctx, 'rustle:1', gx, ggy + 1, gz, { gain: 0.55, rate: 2.3, ref: 3 }); ctx.events?.emit?.('w:weld'); }
    const on = st.burst > 0; st.burst -= dt;
    flash.visible = on && Math.sin(t * 61) + Math.sin(t * 37) > -0.9; light.on = on;
    if (on) for (let k = 0; k < 3; k++) {                                                   // three new sparks per frame while the arc burns
      const i = st.i++ % N; pos[i * 3] = gx + wr.range(-0.04, 0.04); pos[i * 3 + 1] = ggy + 1.0; pos[i * 3 + 2] = gz + wr.range(-0.04, 0.04);
      vel[i * 3] = wr.range(-1.6, 1.6); vel[i * 3 + 1] = wr.range(1.0, 3.2); vel[i * 3 + 2] = wr.range(-1.6, 1.6); life[i] = wr.range(0.35, 0.8);
    }
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      life[i] -= dt; vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < ggy + 0.02) { pos[i * 3 + 1] = ggy + 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
    }
    geo.attributes.position.needsUpdate = true;
  });
  extra.push({ id: 'soldadura', name: 'El Chispa suelda', en: 'Blue-white sparks and a smell of hot iron in the alley: El Chispa is welding somebody\'s new gate on a bench older than his apprentices.', kind: 'story', x: gx - fx * 1.2, z: gz - fz * 1.2, y: ggy, radius: 6, dy: 4 });
  stats.welding = 1;
}

// ---------------------------------------------------------------------------------------------------- entry point
export function buildLife(K) {
  const { ctx } = K, extra = (ctx.world.extra ??= []), actors = [], R = K.rng('life'), stats = { pigeons: 0, crows: 0, dogs: 0, hens: 0, swing: 0, kite: 0, ball: 0, welding: 0 };
  for (const [name, fn] of [['pigeons', pigeons], ['crows', crows], ['sleepingDog', sleepingDog], ['guardDog', guardDog], ['hens', henPen], ['swing', swing], ['kite', kite], ['ball', ball], ['welding', welding]]) {
    try { fn(K, ctx, actors, extra, R.fork(name), stats); } catch (e) {
      console.error(`[life.${name}]`, e);
      ctx.errors?.push({ stage: 'props', item: 'life.' + name, message: String(e?.message ?? e), stack: e?.stack });
    }
  }
  let t = 0;
  ctx.addSystem('world.life', (dt) => {
    const p = ctx.player?.s; if (!p) return;
    const d = Math.min(dt, 0.1); t += d;
    for (const a of actors) a(d, t, p);
  }, 40);
  ctx.world.life = stats;
  return stats;
}
