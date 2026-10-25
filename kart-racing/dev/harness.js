import * as THREE from "three";
import { Kart } from "../kart.js";
import { Controls } from "../controls.js";
import { ChaseCamera } from "../camera.js";
import { ROSTER } from "../roster.js";
const q = new URLSearchParams(location.search);
let track;
if (q.get("real")) { const m = await import("../track.js"); track = m.createTrack(q.get("real")); } else { track = (await import("./faketrack.js")).createFakeTrack(); }
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
track.setupScene(scene, renderer); scene.add(track.group);
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2000);
const cc = new ChaseCamera(camera);
const controls = new Controls(document.getElementById("ui"), canvas);
const karts = ROSTER.slice(0, +(q.get("n") || 1)).map((r, i) => { const k = new Kart({ ...r, isPlayer: i === 0 }); scene.add(k.mesh); const g = track.grid(i); k.placeAt(g.pos, g.heading); return k; });
const player = karts[0]; cc.setTarget(player);
const state = { manual: true, step: 1 / 120 };
let last = performance.now(), acc = 0;
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
function stepAll(dt) { for (const k of karts) k.update(dt, track); Kart.collide(karts); }
function frame(now) {
  requestAnimationFrame(frame);
  if (!state.manual) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
  if (!window.__script) player.input = controls.read();
  while (acc >= state.step) { if (window.__script) window.__script(state.step); stepAll(state.step); acc -= state.step; }
  if (!window.__free) { cc.lookBack(player.input.lookBack); cc.update(dt); } renderer.render(scene, camera);
  document.getElementById("hud").textContent = `${(player.speed * 3.6).toFixed(0)} km/h s=${player.s.toFixed(0)} lat=${player.lateral.toFixed(1)} drift=${player.drifting} ch=${player.driftCharge.toFixed(2)} boost=${player.boostTime.toFixed(2)}`;
}
requestAnimationFrame(frame);
window.H = { THREE, track, karts, player, cc, controls, camera, scene, renderer, state, stepAll, Kart,
  sim(seconds, fn) { const n = Math.round(seconds * 120); for (let i = 0; i < n; i++) { if (fn) fn(i / 120); stepAll(1 / 120); } cc.update(seconds); },
  render() { cc.update(0.016); renderer.render(scene, camera); } };
