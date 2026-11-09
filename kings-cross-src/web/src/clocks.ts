// The station clocks run: an hour and a minute hand on every dial a building declares, turned each frame to the scene clock (main.ts `sceneClock`:
// now when live, the recording's time in a replay, ?time= when pinned), so the dials agree with the board and the sun. UK local time, Europe/London
// (BST in summer, GMT in winter); Edinburgh keeps the same zone.
//
// A building declares its dials on the object that carries them, `object.userData.clockDials` (a ClockDial[] in that object's own frame): shed.ts the
// King's Cross tower, landmarks.ts the Midland Grand's clock tower, waverley-landmarks.ts the Balmoral. `createClocks().frame(scene, ms)` finds them
// and draws every hand of a scene as one instanced mesh, one draw call: a dark box per hand standing just proud of its dial, the dial texture carrying
// only the face (ring, numerals, ticks).
//
// No second hands: no source found for any of the three tower dials shows one (the Balmoral's published hands are an hour and a minute hand,
// https://en.wikipedia.org/wiki/Balmoral_Hotel), and a turret clock seldom has one.

import * as THREE from 'three';
import { createAdditionsWatch } from './lighting.ts';

export type V3 = [number, number, number];

/** A dial: its centre on the face, the unit normal out of the face, the unit up (12 o'clock) in the face, the radius the hands must stay inside. */
export interface ClockDial {
  centre: V3;
  normal: V3;
  up: V3;
  radius: number;
  /** what the dial shows for a scene time, epoch ms (default: the scene time) */
  show?: (sceneMs: number) => number;
}

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });

/** The wall-clock fields of an instant in Europe/London. */
export function londonTime(ms: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const f: Record<string, number> = {};
  for (const p of LONDON.formatToParts(ms)) if (p.type !== 'literal') f[p.type] = Number(p.value);
  return { year: f.year ?? 0, month: f.month ?? 0, day: f.day ?? 0, hour: f.hour ?? 0, minute: f.minute ?? 0, second: f.second ?? 0 };
}

/** The hands' angles for an instant, radians clockwise from 12 as a viewer in front of the dial sees them, in [0, 2pi): UK local time, the hands sweeping. */
export function handAngles(ms: number): { hour: number; minute: number } {
  const t = londonTime(ms);
  const s = t.second + (((ms % 1000) + 1000) % 1000) / 1000;
  const minutes = t.minute + s / 60;
  return { hour: (((t.hour % 12) + minutes / 60) / 12) * Math.PI * 2, minute: (minutes / 60) * Math.PI * 2 };
}

/**
 * The Balmoral's clock: "famously set to run three minutes fast, to give passengers more time to catch their trains. The only day that it shows the
 * correct time is 31 December (Hogmanay)"; "In 2020, the hotel decided not to set the clock right for that year's Hogmanay" (https://en.wikipedia.org/wiki/Balmoral_Hotel).
 */
export function balmoralTime(sceneMs: number): number {
  const t = londonTime(sceneMs);
  return t.month === 12 && t.day === 31 && t.year !== 2020 ? sceneMs : sceneMs + 3 * 60_000;
}

/** A hand, in fractions of the dial's radius: its length from the centre, its tail behind the centre, its width; and its height off the face, metres. */
interface HandShape { length: number; tail: number; width: number; lift: number; depth: number }
export const HANDS: { hour: HandShape; minute: HandShape } = {
  hour: { length: 0.58, tail: 0.12, width: 0.075, lift: 0.04, depth: 0.03 },
  minute: { length: 0.86, tail: 0.15, width: 0.045, lift: 0.08, depth: 0.03 },
};

const unit = (v: V3): THREE.Vector3 => new THREE.Vector3(...v).normalize();

/** The matrix taking the unit box [-0.5, 0.5] x [0, 1] x [0, 1] to a hand on `dial` at `angle` (clockwise from 12, seen from the front), in the dial's own frame. */
export function handMatrix(dial: ClockDial, shape: HandShape, angle: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const n = unit(dial.normal);
  const up = unit(dial.up);
  const right = new THREE.Vector3().crossVectors(up, n).normalize(); // a viewer facing the dial has this on their right
  const r = dial.radius;
  // in the face: up the hand is (sin a) right + (cos a) up; across it, (cos a) right - (sin a) up
  const along = right.clone().multiplyScalar(Math.sin(angle)).addScaledVector(up, Math.cos(angle));
  const across = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, -Math.sin(angle));
  const len = (shape.length + shape.tail) * r;
  const origin = new THREE.Vector3(...dial.centre).addScaledVector(n, shape.lift).addScaledVector(along, -shape.tail * r);
  return out.makeBasis(across.multiplyScalar(shape.width * r), along.multiplyScalar(len), n.multiplyScalar(shape.depth)).setPosition(origin);
}

/** The unit box the hands are instances of: x in [-0.5, 0.5], y and z in [0, 1]. */
export function handGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5);
}

interface Placed { dial: ClockDial; world: THREE.Matrix4 }

export interface Clocks {
  /** Turn the hands of `scene` to the scene time `sceneMs` (epoch ms); draws nothing for a scene with no dials. Call once a frame with the scene on show. */
  frame(scene: THREE.Object3D, sceneMs: number): void;
  /** the hands' mesh in a scene, if it has dials */
  hands(scene: THREE.Object3D): THREE.InstancedMesh | null;
  dispose(): void;
}

/** The hands of every scene's dials. One material and geometry for all; one instanced mesh per scene that has dials. */
export function createClocks(): Clocks {
  const geometry = handGeometry();
  // black hands (hist-c: "black Roman numerals and hands"), unlit like the Midland's dial so they read on it at night; pulled forward like the dial is
  const material = new THREE.MeshBasicMaterial({ color: 0x1d1b18, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const watch = createAdditionsWatch();
  const scenes = new Map<THREE.Object3D, { mesh: THREE.InstancedMesh | null; placed: Placed[]; carriers: THREE.Object3D[] }>();
  const m = new THREE.Matrix4();
  const under = (o: THREE.Object3D, root: THREE.Object3D): boolean => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true; return false; };

  const scan = (root: THREE.Object3D): void => {
    const old = scenes.get(root);
    const placed: Placed[] = [];
    const carriers: THREE.Object3D[] = [];
    root.traverse((o) => {
      const dials = o.userData.clockDials as ClockDial[] | undefined;
      if (!dials?.length) return;
      o.updateWorldMatrix(true, false);
      carriers.push(o);
      for (const dial of dials) placed.push({ dial, world: o.matrixWorld.clone() });
    });
    const same = old && old.placed.length === placed.length && old.placed.every((p, i) => p.dial === placed[i]?.dial && p.world.equals((placed[i] as Placed).world));
    if (same) { old.carriers = carriers; return; }
    if (old?.mesh) { old.mesh.removeFromParent(); old.mesh.dispose(); }
    let mesh: THREE.InstancedMesh | null = null;
    if (placed.length) {
      mesh = new THREE.InstancedMesh(geometry, material, placed.length * 2);
      mesh.name = 'clock-hands';
      mesh.frustumCulled = false; // the instances span the scene; the box of the unit hand would cull them all
      mesh.castShadow = false;
      root.add(mesh);
    }
    scenes.set(root, { mesh, placed, carriers });
  };

  return {
    frame(scene, sceneMs) {
      const known = scenes.get(scene);
      if (watch(scene) || !known || known.carriers.some((o) => !under(o, scene))) scan(scene);
      const s = scenes.get(scene);
      if (!s?.mesh) return;
      const memo = new Map<number, { hour: number; minute: number }>();
      s.placed.forEach(({ dial, world }, i) => {
        const shown = dial.show ? dial.show(sceneMs) : sceneMs;
        let a = memo.get(shown);
        if (!a) { a = handAngles(shown); memo.set(shown, a); }
        s.mesh?.setMatrixAt(2 * i, m.multiplyMatrices(world, handMatrix(dial, HANDS.hour, a.hour)));
        s.mesh?.setMatrixAt(2 * i + 1, m.multiplyMatrices(world, handMatrix(dial, HANDS.minute, a.minute)));
      });
      s.mesh.instanceMatrix.needsUpdate = true;
    },
    hands: (scene) => scenes.get(scene)?.mesh ?? null,
    dispose() {
      for (const s of scenes.values()) if (s.mesh) { s.mesh.removeFromParent(); s.mesh.dispose(); }
      scenes.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
