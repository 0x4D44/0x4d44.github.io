import os from "node:os"; os.setPriority(0, os.constants.priority.PRIORITY_LOW);
// Full bot run per stage (Node only, no browser; NOT part of npm test). Reports:
//  * camera: min camera-to-terrain clearance and min camera-to-car-box distance over the whole run (chase and far rigs),
//  * co-driver: distribution of lead (metres and seconds) between the spoken start and the note's true position, calls that
//    finish after the feature, and overlaps.
//   node tests/machines-live-bot.mjs [--stages=remarkables,whakarewarewa,fiordland] [--car=huia]
import * as THREE from "../vendor/three.module.min.js";
import { CARS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { createBot, bestTyreFor } from "../core/bot.mjs";
import { buildStage } from "../core/stage.mjs";
import { createCameraRig, distToCarBox, CAM_GROUND_CLEAR } from "../render/camera.mjs";
import { createScheduler, speechSeconds } from "../audio/codriver.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
const STAGES = String(args.stages || "remarkables,whakarewarewa,fiordland").split(",");
const CAR = args.car || "huia";
const DT = 1 / 120;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const fmt = (a, d = 1) => `min ${q(a, 0).toFixed(d)} / median ${q(a, 0.5).toFixed(d)} / max ${q(a, 1).toFixed(d)}`;

for (const id of STAGES) {
  const stage = buildStage(id), spec = CARS[CAR];
  const v = createVehicle(spec, { tyre: bestTyreFor(stage) });
  v.reset(stage.startPose, 0, stage);
  const bot = createBot(stage, v, { skill: 1 });
  const out = {};
  for (const mode of ["chase", "far"]) {
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
    const rig = createCameraRig(THREE, cam);
    rig.setCarSpec(spec); rig.setMode(mode);
    out[mode] = { rig, cam, minClear: Infinity, minDist: Infinity, n: 0 };
  }
  const sched = createScheduler();
  sched.setNotes(stage.pacenotes, 0);
  let busyUntil = -1, now = 0, t = 0, frame = 0, speaking = null;
  const lead = [], leadS = [], late = [], overlaps = [];
  const car = { x: 0, y: 0, z: 0, yaw: 0, hl: (spec.length || 4.2) * 0.6, hw: (spec.width || 1.75) / 2, top: (spec.height || 1.4) + 0.1 };
  const limit = Math.max(stage.parTime || 200, 120) * 3 + 120, end = stage.lengthM - 3;
  while (v.state.s < end && t < limit) {
    const inp = bot.control(DT);
    v.step(DT, inp, stage);
    t += DT; now += DT;
    const s = v.state;
    if (frame++ % 2 === 0) {
      const dt = DT * 2;
      const speed = Math.abs(s.speed || 0);
      // co-driver: one scheduler tick per frame; `busy` while the previous call is still being spoken
      if (speaking && now >= busyUntil) {
        if (speaking.note.s < s.s - 0.5) { late.push(s.s - speaking.note.s); if (args.verbose) console.log("late", id, JSON.stringify(speaking.text), "v", speed.toFixed(1), "lead", speaking.L.toFixed(1), "dur", speaking.dur.toFixed(2), "busyStart", speaking.q); } // finished after the feature began
        speaking = null;
      }
      const u = sched.update(stage.pacenotes, s.s, speed, !!speaking);
      if (u) {
        if (speaking) overlaps.push(s.s);
        const L = u.note.s - s.s;
        if (speed > 3) { lead.push(L); leadS.push(L / speed); }
        speaking = { note: u.note, text: u.text, L, dur: speechSeconds(u.text, u.rate), q: sched.queued }; busyUntil = now + speechSeconds(u.text, u.rate);
      }
      car.x = s.x; car.z = s.z; car.yaw = s.yaw;
      let gy = 0, n = 0;
      if (s.wheels) for (const w of s.wheels) if (w && w.grounded) { gy += w.contactY; n++; }
      car.y = n ? gy / n : stage.heightAt(s.x, s.z);
      for (const m of ["chase", "far"]) {
        const o = out[m];
        o.rig.update(dt, s, stage, {});
        const p = o.cam.position;
        o.minClear = Math.min(o.minClear, p.y - stage.heightAt(p.x, p.z));
        o.minDist = Math.min(o.minDist, distToCarBox({ x: p.x, y: p.y, z: p.z }, car));
        o.n++;
      }
    }
    s.events.length = 0;
  }
  console.log(`\n== ${id} (${CAR}) ${v.state.s >= end ? "finished" : "DID NOT FINISH"} in ${t.toFixed(0)} s`);
  for (const m of ["chase", "far"]) console.log(`camera ${m}: min clearance above terrain ${out[m].minClear.toFixed(2)} m (limit ${CAM_GROUND_CLEAR}), min distance to car box ${out[m].minDist.toFixed(2)} m, ${out[m].n} frames`);
  console.log(`co-driver: ${lead.length} calls; lead metres ${fmt(lead)}; lead seconds ${fmt(leadS)}; calls starting < 2 s before the note: ${leadS.filter((x) => x < 2).length}; finished after the feature: ${late.length} (by ${late.length ? fmt(late) : "-"} m); overlaps: ${overlaps.length}`);
}
